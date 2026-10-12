#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tg.py — работа с ЛИЧНЫМ аккаунтом Telegram из Claude Code (MTProto через Telethon).

Умеет: список чатов, чтение и поиск сообщений, отправка текста/файлов/фото,
скачивание фото/файлов/голосовых, расшифровка голосовых (Telegram или Whisper),
отправка голосовых (из файла или синтез речи из текста).

Запуск: tools/telegram/tg.sh <команда> ...   (обёртка сама ставит зависимости)
Справка: tools/telegram/tg.sh --help
Подробности и настройка: tools/telegram/README.md
"""
import argparse
import asyncio
import base64
import json
import logging
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    from telethon import TelegramClient, functions, types, utils, errors
    from telethon.sessions import StringSession
    from telethon.network.connection.connection import PacketCodec
    from telethon.network.connection.http import ConnectionHttp
    from telethon.network.connection import ConnectionTcpFull
    from telethon.network.requeststate import RequestState
except ImportError:
    sys.stderr.write(
        "Не установлен telethon. Запускайте через tools/telegram/tg.sh (он сам поставит зависимости)\n"
        "или выполните: pip install -r tools/telegram/requirements.txt\n")
    sys.exit(2)

VERSION = "1.0"
HERE = Path(__file__).resolve().parent
STATE_DIR = Path(os.environ.get("TG_STATE_DIR") or (Path.home() / ".tg-claude"))
DOWNLOAD_DIR = Path(os.environ.get("TG_DOWNLOAD_DIR") or (HERE / "downloads"))
TZ_NAME = os.environ.get("TG_TZ", "Europe/Moscow")
CA_BUNDLE_FALLBACK = "/root/.ccr/ca-bundle.crt"

# DC id -> поддомен web.telegram.org (HTTPS-транспорт MTProto, как в старом Telegram Web)
DC_WEB_HOSTS = {1: "pluto", 2: "venus", 3: "aurora", 4: "vesta", 5: "flora"}

LAST_TRANSPORT_ERROR = None   # последняя ошибка HTTPS-транспорта (для подсказки пользователю)
TRANSPORT_FAILS = 0           # подряд идущие ошибки HTTP (предохранитель от бесконечных переподключений)
CURRENT_TRANSPORT = None
TIMEOUT = float(os.environ.get("TG_TIMEOUT") or 600)   # общий лимит на одну команду, сек


# ----------------------------------------------------------------------------
# Вспомогательное
# ----------------------------------------------------------------------------

def eprint(*a, **kw):
    print(*a, file=sys.stderr, **kw)
    sys.stderr.flush()


def die(msg, code=1):
    eprint("❌ " + msg)
    sys.exit(code)


def human_size(n):
    if n is None:
        return ""
    n = float(n)
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if n < 1024 or unit == "ГБ":
            return f"{n:.0f} {unit}" if unit == "Б" else f"{n:.1f} {unit}"
        n /= 1024
    return ""


def _tz():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(TZ_NAME)
    except Exception:
        return timezone.utc


TZ = _tz()


def fmt_dt(dt):
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ).strftime("%Y-%m-%d %H:%M")


def fmt_dur(seconds):
    if not seconds:
        return ""
    s = int(seconds)
    return f"{s // 60}:{s % 60:02d}"


def which(cmd):
    return shutil.which(cmd)


# ----------------------------------------------------------------------------
# Транспорт: MTProto поверх HTTPS (POST https://<dc>.web.telegram.org/apiw1)
# через HTTP CONNECT-прокси. Нужен там, где доступен только HTTPS через прокси
# (например, облачные сессии Claude Code). Локально без прокси используется
# обычный TCP-транспорт Telethon.
# ----------------------------------------------------------------------------

def proxy_url():
    for key in ("TG_PROXY", "HTTPS_PROXY", "https_proxy"):
        v = (os.environ.get(key) or "").strip()
        if v:
            return None if v.lower() in ("0", "none", "off") else v
    return None


def ssl_context():
    ctx = ssl.create_default_context()
    for ca in (os.environ.get("TG_CA_FILE"), CA_BUNDLE_FALLBACK):
        if ca and os.path.exists(ca):
            try:
                ctx.load_verify_locations(cafile=ca)
            except Exception as e:  # pragma: no cover
                eprint(f"[tg] не удалось загрузить CA {ca}: {e}")
    return ctx


class WebHttpCodec(PacketCodec):
    """HTTP/1.1-кодек: тело POST = MTProto-пакет, ответ = тело HTTP-ответа.
    В отличие от штатного HttpPacketCodec корректно разбирает любые заголовки,
    chunked-ответы, пустые ответы и неуспешные статусы."""
    tag = None
    obfuscate_tag = None

    def encode_packet(self, data):
        conn = self._conn
        head = ("POST {path} HTTP/1.1\r\n"
                "Host: {host}\r\n"
                "Content-Type: application/x-www-form-urlencoded\r\n"
                "Accept: */*\r\n"
                "Connection: keep-alive\r\n"
                "Content-Length: {n}\r\n\r\n").format(path=conn.http_path, host=conn._ip, n=len(data))
        return head.encode("ascii") + data

    async def read_packet(self, reader):
        global LAST_TRANSPORT_ERROR, TRANSPORT_FAILS
        while True:
            status, headers, body = await self.read_response(reader)
            self._conn.response_done()
            if status != 200:
                snippet = body[:200].decode("utf-8", "replace")
                TRANSPORT_FAILS += 1
                LAST_TRANSPORT_ERROR = (f"HTTP {status} от {self._conn._ip}{self._conn.http_path}: {snippet!r}")
                raise ConnectionError(LAST_TRANSPORT_ERROR)
            if body:
                TRANSPORT_FAILS = 0
            if headers.get("connection", "").lower() == "close":
                # Сервер/прокси закроет соединение — Telethon переподключится сам.
                if body:
                    return body
                raise asyncio.IncompleteReadError(b"", None)
            if body:
                return body
            # Пустой ответ: серверу нечего отдать, ждём следующий ответ.

    @staticmethod
    async def read_response(reader):
        line = await reader.readline()
        while line in (b"\r\n", b"\n"):
            line = await reader.readline()
        if not line:
            raise asyncio.IncompleteReadError(b"", None)
        if not line.endswith(b"\n"):
            raise asyncio.IncompleteReadError(line, None)
        parts = line.split(b" ", 2)
        if len(parts) < 2 or not parts[0].startswith(b"HTTP/") or not parts[1].isdigit():
            raise ConnectionError("Вместо HTTP-ответа получено: %r" % line[:80])
        status = int(parts[1])
        headers = {}
        while True:
            h = await reader.readline()
            if not h:
                raise asyncio.IncompleteReadError(b"", None)
            if h in (b"\r\n", b"\n"):
                break
            k, _, v = h.decode("latin-1").partition(":")
            headers[k.strip().lower()] = v.strip()
        if "chunked" in headers.get("transfer-encoding", "").lower():
            body = bytearray()
            while True:
                size_line = await reader.readline()
                if not size_line:
                    raise asyncio.IncompleteReadError(b"", None)
                size = int(size_line.split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    while True:  # трейлеры до пустой строки
                        t = await reader.readline()
                        if not t:
                            raise asyncio.IncompleteReadError(b"", None)
                        if t in (b"\r\n", b"\n"):
                            break
                    break
                body += await reader.readexactly(size)
                await reader.readexactly(2)
            body = bytes(body)
        elif "content-length" in headers:
            body = await reader.readexactly(int(headers["content-length"]))
        elif headers.get("connection", "").lower() == "close":
            body = await reader.read()
        else:
            body = b""
        return status, headers, body


class ConnectionHttpsWeb(ConnectionHttp):
    """MTProto поверх HTTPS к <dc>.web.telegram.org, опционально через CONNECT-прокси."""
    packet_codec = WebHttpCodec

    def __init__(self, ip, port, dc_id, *, loggers, proxy=None, local_addr=None):
        host = (os.environ.get("TG_WEB_HOST") or "").strip()
        if not host:
            sub = DC_WEB_HOSTS.get(dc_id)
            host = f"{sub}.web.telegram.org" if sub else ip
        super().__init__(host, 443, dc_id, loggers=loggers, proxy=None, local_addr=local_addr)
        self.http_path = os.environ.get("TG_HTTP_PATH", "/apiw1")
        self.proxy = proxy_url()
        # Один HTTP-запрос в полёте за раз (без pipelining): надёжнее через прокси.
        self.serial = os.environ.get("TG_HTTP_SERIAL", "1") != "0"
        self._resp_evt = asyncio.Event()
        self._resp_evt.set()

    def response_done(self):
        self._resp_evt.set()

    async def _connect(self, timeout=None, ssl=None):
        global LAST_TRANSPORT_ERROR
        if TRANSPORT_FAILS >= 3 and LAST_TRANSPORT_ERROR:
            # Сервер стабильно отвечает ошибкой — не даём Telethon переподключаться бесконечно.
            raise ConnectionError(LAST_TRANSPORT_ERROR)
        ctx = ssl_context()
        host, port = self._ip, self._port
        if self.proxy:
            pr = urlparse(self.proxy if "://" in self.proxy else "http://" + self.proxy)
            if pr.scheme not in ("http", "https"):
                raise ConnectionError(f"TG_PROXY: поддерживаются только http(s) CONNECT-прокси: {self.proxy}")
            if not hasattr(asyncio.StreamWriter, "start_tls"):
                raise ConnectionError("Для работы через прокси нужен Python 3.11 или новее")
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(pr.hostname, pr.port or 3128), timeout=timeout)
            req = f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n"
            if pr.username:
                cred = f"{unquote(pr.username)}:{unquote(pr.password or '')}".encode()
                req += "Proxy-Authorization: Basic " + base64.b64encode(cred).decode() + "\r\n"
            req += "\r\n"
            writer.write(req.encode("ascii"))
            await writer.drain()
            status_line = await asyncio.wait_for(reader.readline(), timeout=timeout)
            parts = status_line.split(b" ", 2)
            if len(parts) < 2 or not parts[1].isdigit() or int(parts[1]) != 200:
                writer.close()
                LAST_TRANSPORT_ERROR = (
                    f"прокси {pr.hostname}:{pr.port} отказал в CONNECT к {host}:{port}: "
                    f"{status_line.decode('latin-1').strip() or 'нет ответа'}. "
                    f"Обычно это сетевая политика окружения — разрешите домен *.web.telegram.org")
                raise ConnectionError(LAST_TRANSPORT_ERROR)
            while True:
                h = await asyncio.wait_for(reader.readline(), timeout=timeout)
                if not h:
                    raise ConnectionError("Прокси закрыл соединение после CONNECT")
                if h in (b"\r\n", b"\n"):
                    break
            await asyncio.wait_for(writer.start_tls(ctx, server_hostname=host), timeout=timeout)
            self._reader, self._writer = reader, writer
        else:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(host, port, ssl=ctx, server_hostname=host), timeout=timeout)
        self._codec = self.packet_codec(self)
        self._init_conn()
        await self._writer.drain()

    async def _send_loop(self):
        try:
            while self._connected:
                data = await self._send_queue.get()
                if self.serial:
                    try:
                        await asyncio.wait_for(self._resp_evt.wait(), timeout=30)
                    except asyncio.TimeoutError:
                        pass
                    self._resp_evt.clear()
                self._send(data)
                await self._writer.drain()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if isinstance(e, IOError):
                self._log.info("The server closed the connection while sending")
            else:
                self._log.exception("Unexpected exception in the send loop")
            await self.disconnect()


def install_http_wait():
    """Добавляет http_wait(0,0,0) в каждый пакет: сервер отвечает сразу, не держит long-poll.
    Патчится класс, чтобы это касалось и дополнительных соединений (например, к медиа-DC)."""
    from telethon.extensions.messagepacker import MessagePacker
    if getattr(MessagePacker, "_tg_http_wait", False):
        return
    orig_get = MessagePacker.get

    async def get(self):
        if not self._deque:
            self._ready.clear()
            await self._ready.wait()
        self._deque.appendleft(RequestState(types.HttpWait(max_delay=0, wait_after=0, max_wait=0)))
        return await orig_get(self)

    MessagePacker.get = get
    MessagePacker._tg_http_wait = True


# ----------------------------------------------------------------------------
# Клиент и сессия
# ----------------------------------------------------------------------------

def api_credentials():
    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    if not api_id or not api_hash:
        die("Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH (получить: https://my.telegram.org → API development tools; "
            "в облаке добавьте их в переменные окружения). См. tools/telegram/README.md")
    if not api_id.isdigit():
        die("TELEGRAM_API_ID должен быть числом")
    return int(api_id), api_hash


def choose_transport():
    t = (os.environ.get("TG_TRANSPORT") or "auto").lower()
    if t == "auto":
        t = "https" if proxy_url() else "tcp"
    if t not in ("https", "tcp"):
        die("TG_TRANSPORT: допустимо auto | https | tcp")
    return t


def make_client(session):
    global CURRENT_TRANSPORT
    api_id, api_hash = api_credentials()
    transport = CURRENT_TRANSPORT = choose_transport()
    conn = ConnectionHttpsWeb if transport == "https" else ConnectionTcpFull
    client = TelegramClient(
        session, api_id, api_hash,
        connection=conn,
        device_model="Claude Code", system_version="Linux", app_version=f"tg.py {VERSION}",
        lang_code="ru", system_lang_code="ru",
        timeout=25, connection_retries=3, request_retries=3, retry_delay=2,
        auto_reconnect=True, flood_sleep_threshold=30,
    )
    if conn is ConnectionHttpsWeb and os.environ.get("TG_HTTP_WAIT", "1") != "0":
        install_http_wait()
    return client, transport


def session_file():
    return Path(os.environ.get("TG_SESSION_FILE") or (STATE_DIR / "tg.session"))


def pick_session():
    s = (os.environ.get("TELEGRAM_SESSION") or "").strip()
    if s:
        try:
            return StringSession(s), "переменная TELEGRAM_SESSION"
        except Exception as e:
            die(f"TELEGRAM_SESSION повреждена: {e}")
    f = session_file()
    if f.exists():
        return str(f), f"файл {f}"
    die("Нет сессии Telegram. Выполните вход: tools/telegram/tg.sh login --phone +7XXXXXXXXXX "
        "(или задайте переменную TELEGRAM_SESSION). См. tools/telegram/README.md")


def transport_hint(transport=None):
    transport = transport or CURRENT_TRANSPORT
    if LAST_TRANSPORT_ERROR:
        return f"\n   Причина: {LAST_TRANSPORT_ERROR}"
    if transport == "https":
        return ("\n   Проверьте, что сетевая политика окружения разрешает *.web.telegram.org "
                "(pluto/venus/aurora/vesta/flora.web.telegram.org), и повторите с --debug")
    return "\n   Повторите с --debug, чтобы увидеть подробности"


# ----------------------------------------------------------------------------
# Вход (login) — в два шага, чтобы код можно было ввести в следующем сообщении
# ----------------------------------------------------------------------------

async def cmd_login(args):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(STATE_DIR, 0o700)
    except OSError:
        pass
    pending = STATE_DIR / "login.json"
    sess = session_file()
    state = json.loads(pending.read_text()) if pending.exists() else {}

    if args.phone:
        phone = re.sub(r"[^\d+]", "", args.phone)
        if not phone.startswith("+"):
            phone = "+" + phone
        if sess.exists() and not args.fresh:
            # Старую авторизацию не трогаем: сообщим, кто вошёл.
            client, transport = make_client(str(sess))
            try:
                await client.connect()
                if await client.is_user_authorized():
                    me = await client.get_me()
                    print(f"Уже выполнен вход: {utils.get_display_name(me)} (@{me.username or '—'}). "
                          f"Чтобы войти заново, добавьте --fresh")
                    return 0
            except Exception:
                pass
            finally:
                await client.disconnect()
        if args.fresh:
            for p in (sess, Path(str(sess) + "-journal"), pending):
                try:
                    p.unlink()
                except OSError:
                    pass
        client, transport = make_client(str(sess))
        try:
            await client.connect()
        except Exception as e:
            die(f"Не удалось подключиться к Telegram ({transport}): {e}{transport_hint(transport)}")
        try:
            sent = await client.send_code_request(phone)
        except errors.PhoneNumberInvalidError:
            die(f"Telegram не принял номер {phone}")
        except errors.PhoneNumberBannedError:
            die(f"Номер {phone} заблокирован в Telegram")
        except errors.FloodWaitError as e:
            die(f"Telegram просит подождать {e.seconds} сек. перед новой попыткой")
        except errors.RPCError as e:
            die(f"Ошибка Telegram: {e}")
        finally:
            await client.disconnect()
        pending.write_text(json.dumps({"phone": phone, "hash": sent.phone_code_hash,
                                       "stage": "code", "ts": time.time()}))
        ctype = type(sent.type).__name__.replace("SentCodeType", "")
        where = {"App": "в приложение Telegram (другое устройство)", "Sms": "по SMS",
                 "Call": "звонком", "FlashCall": "flash-звонком", "MissedCall": "пропущенным звонком",
                 "EmailCode": "на e-mail", "FragmentSms": "через Fragment"}.get(ctype, ctype)
        print(f"✅ Код отправлен {where}. Следующий шаг: tools/telegram/tg.sh login --code <код>")
        return 0

    if args.code or args.password:
        if not state:
            die("Сначала запросите код: tools/telegram/tg.sh login --phone +7XXXXXXXXXX")
        client, transport = make_client(str(sess))
        try:
            await client.connect()
        except Exception as e:
            die(f"Не удалось подключиться к Telegram ({transport}): {e}{transport_hint(transport)}")
        try:
            password = args.password or os.environ.get("TELEGRAM_PASSWORD")
            try:
                if state.get("stage") == "code":
                    if not args.code:
                        die("Введите код: tools/telegram/tg.sh login --code <код>")
                    code = re.sub(r"\D", "", args.code)
                    await client.sign_in(state["phone"], code, phone_code_hash=state["hash"])
                elif state.get("stage") == "password":
                    if not password:
                        die("Нужен пароль двухэтапной аутентификации: login --password '...' "
                            "(или переменная TELEGRAM_PASSWORD)")
                    await client.sign_in(password=password)
            except errors.SessionPasswordNeededError:
                if not password:
                    state["stage"] = "password"
                    pending.write_text(json.dumps(state))
                    print("🔐 Код принят, но включена двухэтапная аутентификация. Завершите вход:\n"
                          "   tools/telegram/tg.sh login --password '<облачный пароль>'\n"
                          "   (или задайте переменную TELEGRAM_PASSWORD и запустите login --password x)")
                    return 3
                await client.sign_in(password=password)
            except errors.PhoneCodeInvalidError:
                die("Неверный код. Повторите: login --code <код>")
            except errors.PhoneCodeExpiredError:
                die("Код устарел. Запросите новый: login --phone ... --fresh")
            except errors.PasswordHashInvalidError:
                die("Неверный пароль двухэтапной аутентификации")
            except errors.FloodWaitError as e:
                die(f"Telegram просит подождать {e.seconds} сек.")
            me = await client.get_me()
            string = StringSession.save(client.session)
        finally:
            await client.disconnect()
        try:
            pending.unlink()
        except OSError:
            pass
        out = STATE_DIR / "session.txt"
        out.write_text(string)
        try:
            os.chmod(out, 0o600)
        except OSError:
            pass
        print(f"✅ Вход выполнен: {utils.get_display_name(me)} (@{me.username or '—'}, id {me.id})")
        print("В этом контейнере всё уже работает. Чтобы доступ сохранился в новых сессиях,")
        print("добавьте в настройки окружения переменную TELEGRAM_SESSION со значением:")
        print()
        print(string)
        print()
        print("Строка — это ключ от аккаунта. Не публикуйте её. Она также сохранена в", out)
        return 0

    die("Укажите --phone (шаг 1), --code (шаг 2) или --password (если включена 2FA)")


async def cmd_logout(client, args):
    await client.log_out()
    for p in (session_file(), Path(str(session_file()) + "-journal"), STATE_DIR / "login.json",
              STATE_DIR / "session.txt"):
        try:
            p.unlink()
        except OSError:
            pass
    print("✅ Сессия завершена и удалена. Не забудьте убрать TELEGRAM_SESSION из переменных окружения.")
    return 0


# ----------------------------------------------------------------------------
# Поиск чата по имени / @username / телефону / id
# ----------------------------------------------------------------------------

def kind_of(entity):
    if isinstance(entity, types.User):
        return "bot" if entity.bot else "user"
    if isinstance(entity, types.Channel):
        return "channel" if entity.broadcast else "group"
    if isinstance(entity, types.Chat):
        return "group"
    return type(entity).__name__


async def resolve(client, ref):
    ref = (ref or "").strip()
    if not ref:
        die("Укажите чат: имя, @username, телефон +7..., числовой id или me")
    low = ref.lower()
    if low in ("me", "saved", "self", "избранное", "я"):
        return await client.get_input_entity("me")
    m = re.fullmatch(r"(?:https?://)?t\.me/([A-Za-z0-9_]{3,})/?", ref)
    if m:
        ref = "@" + m.group(1)
    is_num = re.fullmatch(r"-?\d{4,}", ref) is not None
    if ref.startswith("@") or ref.startswith("+") or is_num:
        key = int(ref) if is_num else ref
        try:
            return await client.get_input_entity(key)
        except (ValueError, TypeError, errors.RPCError) as e:
            if is_num:
                await client.get_dialogs(limit=500)  # прогреть кэш сущностей
                try:
                    return await client.get_input_entity(key)
                except (ValueError, TypeError, errors.RPCError):
                    pass
            if ref.startswith("+"):
                # Не из контактов: пробуем найти по номеру (если человек разрешил поиск по телефону)
                try:
                    res = await client(functions.contacts.ResolvePhoneRequest(phone=ref.lstrip("+")))
                    if res.users:
                        return await client.get_input_entity(res.users[0])
                except errors.RPCError:
                    pass
            die(f"Не удалось найти чат {ref}: {e}")
    dialogs = await client.get_dialogs(limit=500)
    exact, partial = [], []
    for d in dialogs:
        name = (d.name or "").lower()
        uname = (getattr(d.entity, "username", None) or "").lower()
        if name == low or uname == low:
            exact.append(d)
        elif low in name:
            partial.append(d)
    cands = exact or partial
    if len(cands) == 1:
        return cands[0].input_entity
    if len(cands) > 1:
        eprint(f"Найдено несколько чатов по «{ref}», уточните (id или @username):")
        for d in cands[:15]:
            u = getattr(d.entity, "username", None)
            eprint(f"   {d.id:>15}  {kind_of(d.entity):7}  {d.name}{(' @' + u) if u else ''}")
        sys.exit(1)
    try:
        found = await client(functions.contacts.SearchRequest(q=ref, limit=10))
        users = [u for u in found.users]
        if len(users) == 1:
            return await client.get_input_entity(users[0])
        if users:
            eprint(f"Чат «{ref}» не найден среди диалогов; похожие пользователи:")
            for u in users[:10]:
                eprint(f"   {u.id:>15}  {kind_of(u):7}  {utils.get_display_name(u)}{(' @' + u.username) if u.username else ''}")
            sys.exit(1)
    except errors.RPCError:
        pass
    die(f"Чат «{ref}» не найден")


async def entity_label(client, input_entity):
    try:
        ent = await client.get_entity(input_entity)
        name = utils.get_display_name(ent)
        u = getattr(ent, "username", None)
        return f"{name}{(' @' + u) if u else ''} (id {utils.get_peer_id(ent)})"
    except Exception:
        return str(input_entity)


# ----------------------------------------------------------------------------
# Форматирование сообщений
# ----------------------------------------------------------------------------

def describe_media(msg):
    f = msg.file
    dur = fmt_dur(getattr(f, "duration", None)) if f else ""
    size = human_size(getattr(f, "size", None)) if f else ""
    name = (getattr(f, "name", None) or "") if f else ""
    try:
        if msg.photo:
            return "photo"
        if msg.voice:
            return f"voice {dur}".strip()
        if msg.video_note:
            return f"video_note {dur}".strip()
        if msg.sticker:
            alt = ""
            for a in (msg.document.attributes if msg.document else []):
                if isinstance(a, types.DocumentAttributeSticker):
                    alt = a.alt or ""
            return f"sticker {alt}".strip()
        if msg.gif:
            return "gif"
        if msg.video:
            return f"video {dur} {size}".strip()
        if msg.audio:
            return f"audio {name} {dur}".strip()
        if msg.document:
            mime = getattr(f, "mime_type", "") or ""
            return f"file {name or '?'} {size} {mime}".strip()
        if msg.contact:
            c = msg.contact
            return f"contact {c.first_name or ''} {c.last_name or ''} {c.phone_number or ''}".strip()
        if msg.geo:
            return f"location {msg.geo.lat},{msg.geo.long}"
        if msg.poll:
            q = getattr(msg.poll.poll, "question", "")
            q = getattr(q, "text", q)
            return f"poll {q}".strip()
        if msg.web_preview:
            return None
        if msg.media:
            return type(msg.media).__name__.replace("MessageMedia", "").lower()
    except Exception:
        return "media"
    return None


def sender_name(msg):
    if msg.out:
        return "я"
    s = msg.sender
    if s is None:
        if getattr(msg, "post", False):
            return "канал"
        return f"id{msg.sender_id}" if msg.sender_id else "?"
    return utils.get_display_name(s) or f"id{s.id}"


def forward_label(msg):
    fwd = msg.fwd_from
    if not fwd:
        return None
    who = fwd.from_name or ""
    try:
        f = msg.forward
        ent = f.sender or f.chat
        if ent:
            who = utils.get_display_name(ent)
    except Exception:
        pass
    return f"⤴ переслано{(' от ' + who) if who else ''}"


def fmt_msg(msg, chat_label=None, full=False):
    head = f"#{msg.id}  {fmt_dt(msg.date)}  {'→' if msg.out else '←'} {sender_name(msg)}"
    if chat_label:
        head += f"  [{chat_label}]"
    bits = []
    rt = getattr(msg, "reply_to", None)
    if rt and getattr(rt, "reply_to_msg_id", None):
        bits.append(f"↩ #{rt.reply_to_msg_id}")
    fl = forward_label(msg)
    if fl:
        bits.append(fl)
    if bits:
        head += "  " + "  ".join(bits)
    lines = [head]
    media = describe_media(msg)
    if media:
        lines.append(f"   [{media}]")
    text = msg.message or ""
    if msg.action:
        text = f"[служебное: {type(msg.action).__name__.replace('MessageAction', '')}]"
    if text:
        if not full and len(text) > 700:
            text = text[:700] + "…"
        lines.extend("   " + l for l in text.splitlines())
    return "\n".join(lines)


def msg_json(msg):
    chat = None
    try:
        chat = utils.get_display_name(msg.chat) if msg.chat else None
    except Exception:
        pass
    rt = getattr(msg, "reply_to", None)
    return {
        "id": msg.id,
        "date": msg.date.isoformat() if msg.date else None,
        "date_local": fmt_dt(msg.date),
        "out": bool(msg.out),
        "chat_id": msg.chat_id,
        "chat": chat,
        "sender_id": msg.sender_id,
        "sender": sender_name(msg),
        "text": msg.message or "",
        "media": describe_media(msg),
        "reply_to": getattr(rt, "reply_to_msg_id", None) if rt else None,
        "forwarded": forward_label(msg),
        "service": type(msg.action).__name__ if msg.action else None,
    }


# ----------------------------------------------------------------------------
# Команды
# ----------------------------------------------------------------------------

async def cmd_me(client, args, transport=None, source=None):
    me = await client.get_me()
    info = {"id": me.id, "name": utils.get_display_name(me), "username": me.username,
            "phone": me.phone, "premium": bool(me.premium), "transport": transport, "session": source,
            "timezone": TZ_NAME}
    if args.json:
        print(json.dumps(info, ensure_ascii=False, indent=2))
    else:
        print(f"✅ Аккаунт: {info['name']} (@{me.username or '—'}, id {me.id}, тел. +{me.phone or '—'})"
              f"{' · Premium' if me.premium else ''}")
        print(f"   транспорт: {transport} · сессия: {source} · часовой пояс вывода: {TZ_NAME}")
    return 0


async def cmd_chats(client, args):
    rows = []
    async for d in client.iter_dialogs(limit=args.limit, archived=False if not args.archived else None):
        if args.unread and not d.unread_count:
            continue
        e = d.entity
        kind = kind_of(e)
        if args.type and kind != args.type:
            continue
        last = d.message
        preview = ""
        if last:
            preview = (last.message or describe_media(last) or
                       (type(last.action).__name__.replace("MessageAction", "") if last.action else "") or "")
            preview = preview.replace("\n", " ")
        rows.append({
            "id": d.id, "type": kind, "name": d.name,
            "username": getattr(e, "username", None),
            "unread": d.unread_count,
            "last_date": fmt_dt(last.date) if last else "",
            "last_from": ("я" if last and last.out else (sender_name(last) if last else "")),
            "preview": preview,
            "muted": is_muted(d),
        })
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    if not rows:
        print("Чатов не найдено")
        return 0
    print(f"{'id':>15}  {'тип':7}  {'непр.':>5}  {'последнее':16}  название")
    for r in rows:
        u = f" @{r['username']}" if r["username"] else ""
        mute = " 🔇" if r["muted"] else ""
        pv = r["preview"][:70]
        if pv:
            pv = f"  — {r['last_from']}: {pv}" if r["last_from"] else f"  — {pv}"
        print(f"{r['id']:>15}  {r['type']:7}  {r['unread']:>5}  {r['last_date']:16}  {r['name']}{u}{mute}{pv}")
    return 0


def is_muted(dialog):
    try:
        mu = dialog.dialog.notify_settings.mute_until
        if not mu:
            return False
        if isinstance(mu, datetime):
            return mu > datetime.now(timezone.utc)
        return mu > time.time()
    except Exception:
        return False


async def cmd_read(client, args):
    ent = await resolve(client, args.chat)
    label = await entity_label(client, ent)
    kw = {}
    if args.before:
        kw["offset_id"] = args.before
    if args.after:
        kw["min_id"] = args.after
    if args.search:
        kw["search"] = args.search
    if args.from_user:
        kw["from_user"] = await resolve(client, args.from_user)
    msgs = [m async for m in client.iter_messages(ent, limit=args.limit, **kw)]
    msgs.reverse()
    if args.mark_read and msgs:
        await client.send_read_acknowledge(ent, max_id=max(m.id for m in msgs))
    if args.json:
        print(json.dumps({"chat": label, "messages": [msg_json(m) for m in msgs]}, ensure_ascii=False, indent=2))
        return 0
    print(f"=== {label} — {len(msgs)} сообщ. (время {TZ_NAME}) ===")
    for m in msgs:
        print(fmt_msg(m, full=args.full))
    return 0


async def cmd_unread(client, args):
    found = 0
    out = []
    async for d in client.iter_dialogs(limit=args.chats):
        if not d.unread_count:
            continue
        kind = kind_of(d.entity)
        if not args.all and (kind == "channel" or is_muted(d)):
            continue
        n = min(d.unread_count, args.per_chat)
        msgs = [m async for m in client.iter_messages(d.input_entity, limit=n)]
        msgs.reverse()
        found += 1
        if args.json:
            out.append({"chat_id": d.id, "chat": d.name, "type": kind, "unread": d.unread_count,
                        "messages": [msg_json(m) for m in msgs]})
        else:
            print(f"=== {d.name} (id {d.id}, {kind}) — непрочитано {d.unread_count}"
                  f"{', показаны последние ' + str(n) if n < d.unread_count else ''} ===")
            for m in msgs:
                print(fmt_msg(m, full=args.full))
            print()
        if args.mark_read:
            await client.send_read_acknowledge(d.input_entity)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    elif not found:
        print("Непрочитанных сообщений нет" + ("" if args.all else " (каналы и чаты без звука пропущены; --all покажет всё)"))
    return 0


async def cmd_search(client, args):
    ent = await resolve(client, args.chat) if args.chat else None
    msgs = [m async for m in client.iter_messages(ent, search=args.query, limit=args.limit)]
    if args.json:
        print(json.dumps([msg_json(m) for m in msgs], ensure_ascii=False, indent=2))
        return 0
    if not msgs:
        print("Ничего не найдено")
        return 0
    for m in msgs:
        chat = None
        if ent is None:
            try:
                chat = utils.get_display_name(m.chat) if m.chat else str(m.chat_id)
            except Exception:
                chat = str(m.chat_id)
        print(fmt_msg(m, chat_label=chat, full=args.full))
    return 0


def read_text_arg(args):
    text = args.text
    if getattr(args, "text_file", None):
        text = Path(args.text_file).read_text(encoding="utf-8")
    elif text == "-":
        text = sys.stdin.read()
    if text is None or not text.strip():
        die("Пустой текст")
    return text


async def cmd_send(client, args):
    ent = await resolve(client, args.chat)
    text = read_text_arg(args)
    parse = {"md": "md", "html": "html", "none": None}[args.parse]
    m = await client.send_message(ent, text, reply_to=args.reply_to, parse_mode=parse,
                                  link_preview=not args.no_preview, silent=args.silent)
    label = await entity_label(client, ent)
    if args.json:
        print(json.dumps({"id": m.id, "chat": label}, ensure_ascii=False))
    else:
        print(f"✅ Отправлено #{m.id} → {label}")
    return 0


async def cmd_send_file(client, args):
    ent = await resolve(client, args.chat)
    files = [Path(p) for p in args.files]
    for p in files:
        if not p.is_file():
            die(f"Файл не найден: {p}")
    paths = [str(p) for p in files]
    res = await client.send_file(ent, paths if len(paths) > 1 else paths[0], caption=args.caption,
                                 force_document=args.as_document, reply_to=args.reply_to,
                                 parse_mode=None, silent=args.silent)
    msgs = res if isinstance(res, list) else [res]
    label = await entity_label(client, ent)
    if args.json:
        print(json.dumps({"ids": [m.id for m in msgs], "chat": label}, ensure_ascii=False))
    else:
        print(f"✅ Отправлено {len(msgs)} файл(ов) → {label}: " + ", ".join(f"#{m.id}" for m in msgs))
    return 0


async def cmd_download(client, args):
    ent = await resolve(client, args.chat)
    out = Path(args.out or DOWNLOAD_DIR)
    out.mkdir(parents=True, exist_ok=True)
    msgs = await client.get_messages(ent, ids=args.msg_ids)
    results = []
    for mid, m in zip(args.msg_ids, msgs):
        if m is None:
            results.append({"id": mid, "error": "сообщение не найдено"})
            continue
        if not m.media or m.web_preview:
            results.append({"id": mid, "error": "в сообщении нет медиа"})
            continue
        path = await client.download_media(m, file=str(out))
        if not path:
            results.append({"id": mid, "error": "не удалось скачать"})
            continue
        p = Path(path)
        target = out / f"msg{m.id}_{p.name}"
        if p != target:
            if target.exists():
                target.unlink()
            p.rename(target)
        results.append({"id": m.id, "path": str(target.resolve()), "media": describe_media(m),
                        "size": target.stat().st_size, "text": m.message or ""})
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            if "error" in r:
                print(f"#{r['id']}: ❌ {r['error']}")
            else:
                print(f"#{r['id']}: {r['path']}  ({r['media']}, {human_size(r['size'])})")
    return 0 if all("path" in r for r in results) else 1


async def cmd_mark_read(client, args):
    ent = await resolve(client, args.chat)
    await client.send_read_acknowledge(ent)
    print("✅ Отмечено прочитанным:", await entity_label(client, ent))
    return 0


async def cmd_contacts(client, args):
    res = await client(functions.contacts.GetContactsRequest(hash=0))
    users = getattr(res, "users", []) or []
    q = (args.search or "").lower()
    rows = []
    for u in users:
        name = utils.get_display_name(u)
        if q and q not in name.lower() and q not in (u.username or "").lower() and q not in (u.phone or ""):
            continue
        rows.append({"id": u.id, "name": name, "username": u.username, "phone": u.phone})
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    for r in rows:
        print(f"{r['id']:>15}  {r['name']}{(' @' + r['username']) if r['username'] else ''}"
              f"{(' +' + r['phone']) if r['phone'] else ''}")
    if not rows:
        print("Контактов не найдено")
    return 0


# ----------------------------------------------------------------------------
# Аудио: конвертация, голосовые, синтез и расшифровка речи
# ----------------------------------------------------------------------------

def run_cmd(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def need_ffmpeg():
    if not which("ffmpeg") or not which("ffprobe"):
        die("Нужен ffmpeg/ffprobe (apt install ffmpeg)")


def probe_audio(path):
    need_ffmpeg()
    r = run_cmd(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                 "stream=codec_name:format=format_name,duration", "-of", "json", str(path)])
    if r.returncode != 0:
        die(f"ffprobe не смог прочитать {path}: {r.stderr.strip()}")
    info = json.loads(r.stdout or "{}")
    codec = (info.get("streams") or [{}])[0].get("codec_name", "")
    fmt = (info.get("format") or {}).get("format_name", "")
    dur = float((info.get("format") or {}).get("duration") or 0)
    return codec, fmt, dur


def to_voice_ogg(src, dst=None):
    """Любое аудио → OGG/Opus 48kHz mono (формат голосовых Telegram). Возвращает (путь, длительность)."""
    src = Path(src)
    codec, fmt, dur = probe_audio(src)
    if codec == "opus" and "ogg" in fmt and src.suffix.lower() in (".ogg", ".oga", ".opus"):
        return src, dur
    dst = Path(dst) if dst else Path(tempfile.mkdtemp(prefix="tgvoice_")) / (src.stem + ".ogg")
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = run_cmd(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", "48000",
                 "-c:a", "libopus", "-b:a", "32k", "-application", "voip", str(dst)])
    if r.returncode != 0:
        die(f"ffmpeg не смог сконвертировать {src}: {r.stderr.strip()}")
    _, _, dur = probe_audio(dst)
    return dst, dur


def make_waveform(path, n=100):
    """Волновая форма для голосового (100 значений по 5 бит), как в клиентах Telegram."""
    try:
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1",
                            "-ar", "8000", "-"], capture_output=True)
        if r.returncode != 0 or not r.stdout:
            return None
        import array
        a = array.array("h")
        a.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
        if not a:
            return None
        chunk = max(1, len(a) // n)
        vals = []
        for i in range(n):
            seg = a[i * chunk:(i + 1) * chunk]
            vals.append((sum(x * x for x in seg) / len(seg)) ** 0.5 if len(seg) else 0.0)
        mx = max(vals) or 1.0
        levels = [min(31, int(v / mx * 31)) for v in vals]
        bits = nbits = 0
        out = bytearray()
        for lv in levels:
            bits |= lv << nbits
            nbits += 5
            while nbits >= 8:
                out.append(bits & 0xFF)
                bits >>= 8
                nbits -= 8
        if nbits:
            out.append(bits & 0xFF)
        return bytes(out)
    except Exception:
        return None


async def send_voice_file(client, ent, path, caption=None, reply_to=None, silent=False):
    ogg, dur = to_voice_ogg(path)
    attrs = [types.DocumentAttributeAudio(duration=int(round(dur)), voice=True, waveform=make_waveform(ogg))]
    return await client.send_file(ent, str(ogg), voice_note=True, attributes=attrs, caption=caption,
                                  reply_to=reply_to, silent=silent, parse_mode=None)


async def cmd_send_voice(client, args):
    ent = await resolve(client, args.chat)
    if not Path(args.file).is_file():
        die(f"Файл не найден: {args.file}")
    m = await send_voice_file(client, ent, args.file, caption=args.caption, reply_to=args.reply_to, silent=args.silent)
    label = await entity_label(client, ent)
    print(json.dumps({"id": m.id, "chat": label}, ensure_ascii=False) if args.json else f"✅ Голосовое #{m.id} → {label}")
    return 0


def ensure_requests_ca():
    if not os.environ.get("REQUESTS_CA_BUNDLE") and os.path.exists(CA_BUNDLE_FALLBACK):
        os.environ["REQUESTS_CA_BUNDLE"] = CA_BUNDLE_FALLBACK


def tts_to_file(text, lang="ru", engine=None, voice=None):
    """Синтез речи → путь к аудиофайлу (mp3/wav)."""
    engine = (engine or os.environ.get("TG_TTS_ENGINE") or "gtts").lower()
    tmp = Path(tempfile.mkdtemp(prefix="tgtts_"))
    if engine == "gtts":
        ensure_requests_ca()
        try:
            from gtts import gTTS
        except ImportError:
            die("Нет пакета gtts: pip install gtts")
        out = tmp / "tts.mp3"
        try:
            gTTS(text=text, lang=lang, slow=False).save(str(out))
        except Exception as e:
            die(f"Синтез речи (gTTS, translate.google.com) не удался: {e}. "
                f"Проверьте доступ к translate.google.com или выберите другой движок (--engine edge|piper)")
        return out
    if engine == "edge":
        exe = which("edge-tts")
        if not exe:
            die("Нет edge-tts: pip install edge-tts")
        out = tmp / "tts.mp3"
        v = voice or os.environ.get("TG_TTS_VOICE") or ("ru-RU-DmitryNeural" if lang == "ru" else "en-US-GuyNeural")
        r = run_cmd([exe, "--voice", v, "--text", text, "--write-media", str(out)])
        if r.returncode != 0:
            die(f"edge-tts не удался: {r.stderr.strip()}")
        return out
    if engine == "piper":
        exe = which("piper")
        model = voice or os.environ.get("TG_TTS_VOICE")
        if not exe or not model:
            die("Для piper нужны пакет piper-tts и модель: --voice /путь/к/модели.onnx (или TG_TTS_VOICE)")
        out = tmp / "tts.wav"
        r = subprocess.run([exe, "--model", model, "--output_file", str(out)], input=text, text=True,
                           capture_output=True)
        if r.returncode != 0:
            die(f"piper не удался: {r.stderr.strip()}")
        return out
    die("TG_TTS_ENGINE / --engine: gtts | edge | piper")


async def cmd_say(client, args):
    text = read_text_arg(args)
    audio = tts_to_file(text, lang=args.lang, engine=args.engine, voice=args.voice)
    if args.save:
        ogg, dur = to_voice_ogg(audio, args.save)
        print(f"✅ Сохранено {ogg} ({fmt_dur(dur)})")
        if not args.chat:
            return 0
    if not args.chat:
        die("Укажите чат (или --save файл.ogg, чтобы только сохранить)")
    ent = await resolve(client, args.chat)
    m = await send_voice_file(client, ent, audio, reply_to=args.reply_to, silent=args.silent)
    label = await entity_label(client, ent)
    print(json.dumps({"id": m.id, "chat": label}, ensure_ascii=False) if args.json else f"✅ Голосовое #{m.id} → {label}")
    return 0


async def telegram_transcribe(client, ent, msg_id, wait=45):
    r = await client(functions.messages.TranscribeAudioRequest(peer=ent, msg_id=msg_id))
    deadline = time.time() + wait
    while r.pending and time.time() < deadline:
        await asyncio.sleep(2)
        r = await client(functions.messages.TranscribeAudioRequest(peer=ent, msg_id=msg_id))
    if r.pending:
        raise RuntimeError("Telegram не успел расшифровать за отведённое время")
    if not (r.text or "").strip():
        raise RuntimeError("Telegram вернул пустую расшифровку")
    return r.text.strip()


def whisper_transcribe(path, model=None, language=None):
    model = model or os.environ.get("TG_WHISPER_MODEL") or "small"
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        if os.environ.get("TG_AUTO_INSTALL", "1") != "0":
            eprint("[tg] ставлю faster-whisper (один раз, ~1–2 мин)…")
            r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "faster-whisper"])
            if r.returncode != 0:
                die("Не удалось установить faster-whisper")
            from faster_whisper import WhisperModel
        else:
            die("Нет faster-whisper: pip install faster-whisper")
    ensure_requests_ca()
    eprint(f"[tg] Whisper: модель {model} (первый запуск скачивает модель)…")
    wm = WhisperModel(model, device="cpu", compute_type="int8")
    segments, info = wm.transcribe(str(path), language=language or None, vad_filter=True, beam_size=5)
    text = " ".join(s.text.strip() for s in segments if s.text.strip())
    return text, getattr(info, "language", None)


async def cmd_transcribe(client, args):
    ent = await resolve(client, args.chat)
    m = await client.get_messages(ent, ids=args.msg_id)
    if m is None:
        die(f"Сообщение #{args.msg_id} не найдено")
    if not (m.voice or m.audio or m.video_note or m.video):
        die(f"В сообщении #{args.msg_id} нет аудио/видео ({describe_media(m) or 'без медиа'})")
    text, how, lang = None, None, None
    engine = args.engine
    if engine in ("auto", "telegram") and (m.voice or m.video_note):
        try:
            text = await telegram_transcribe(client, ent, m.id)
            how = "telegram"
        except (errors.RPCError, RuntimeError) as e:
            note = f"Telegram не расшифровал ({type(e).__name__}: {e})"
            if engine == "telegram":
                die(note)
            eprint("[tg] " + note + " — пробую Whisper локально")
    if text is None:
        tmp = Path(tempfile.mkdtemp(prefix="tgaudio_"))
        path = await client.download_media(m, file=str(tmp))
        if not path:
            die("Не удалось скачать аудио")
        text, lang = whisper_transcribe(path, model=args.model, language=args.lang)
        how = "whisper"
    if args.json:
        print(json.dumps({"id": m.id, "engine": how, "language": lang, "text": text,
                          "duration": getattr(m.file, "duration", None)}, ensure_ascii=False, indent=2))
    else:
        print(f"🎙 #{m.id} ({describe_media(m)}, {how}{', ' + lang if lang else ''}):")
        print(text or "(пусто)")
    return 0


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="tg.sh", description="Личный Telegram из Claude Code (Telethon). "
                                "Чат можно указывать как имя, @username, телефон +7..., числовой id или me.")
    p.add_argument("--json", action="store_true", help="вывод в JSON")
    p.add_argument("--debug", action="store_true", help="подробный лог Telethon")
    sub = p.add_subparsers(dest="cmd", required=True, metavar="команда")

    s = sub.add_parser("login", help="вход в аккаунт (шаг 1: --phone, шаг 2: --code, при 2FA: --password)")
    s.add_argument("--phone", help="номер телефона, например +79991234567")
    s.add_argument("--code", help="код подтверждения из Telegram")
    s.add_argument("--password", help="пароль двухэтапной аутентификации (можно через TELEGRAM_PASSWORD)")
    s.add_argument("--fresh", action="store_true", help="начать вход заново, удалив старую сессию")

    sub.add_parser("me", help="проверить сессию: кто я, какой транспорт")
    sub.add_parser("logout", help="выйти и удалить локальную сессию")

    s = sub.add_parser("chats", help="список чатов (диалогов)")
    s.add_argument("--limit", type=int, default=30)
    s.add_argument("--unread", action="store_true", help="только с непрочитанными")
    s.add_argument("--type", choices=["user", "bot", "group", "channel"], help="фильтр по типу")
    s.add_argument("--archived", action="store_true", help="включая архив")

    s = sub.add_parser("read", help="сообщения чата (новые внизу)")
    s.add_argument("chat")
    s.add_argument("--limit", type=int, default=20)
    s.add_argument("--before", type=int, metavar="ID", help="только старше сообщения с этим id (листать назад)")
    s.add_argument("--after", type=int, metavar="ID", help="только новее сообщения с этим id")
    s.add_argument("--search", help="фильтр по тексту")
    s.add_argument("--from-user", dest="from_user", help="только от этого участника (для групп)")
    s.add_argument("--full", action="store_true", help="не обрезать длинные тексты")
    s.add_argument("--mark-read", dest="mark_read", action="store_true", help="отметить прочитанными")

    s = sub.add_parser("unread", help="все непрочитанные по чатам (каналы и без звука — только с --all)")
    s.add_argument("--chats", type=int, default=100, help="сколько диалогов просмотреть")
    s.add_argument("--per-chat", dest="per_chat", type=int, default=10, help="максимум сообщений на чат")
    s.add_argument("--all", action="store_true", help="включая каналы и чаты без звука")
    s.add_argument("--full", action="store_true")
    s.add_argument("--mark-read", dest="mark_read", action="store_true")

    s = sub.add_parser("search", help="поиск сообщений по тексту (во всех чатах или в одном)")
    s.add_argument("query")
    s.add_argument("--chat")
    s.add_argument("--limit", type=int, default=20)
    s.add_argument("--full", action="store_true")

    s = sub.add_parser("send", help="отправить текст")
    s.add_argument("chat")
    s.add_argument("text", nargs="?", help="текст ('-' = из stdin)")
    s.add_argument("--text-file", dest="text_file", help="взять текст из файла")
    s.add_argument("--reply-to", dest="reply_to", type=int, metavar="ID")
    s.add_argument("--parse", choices=["none", "md", "html"], default="none", help="разметка (по умолчанию — как есть)")
    s.add_argument("--no-preview", dest="no_preview", action="store_true", help="без превью ссылок")
    s.add_argument("--silent", action="store_true", help="без звука у получателя")

    s = sub.add_parser("send-file", help="отправить файл(ы)/фото/видео")
    s.add_argument("chat")
    s.add_argument("files", nargs="+")
    s.add_argument("--caption", help="подпись")
    s.add_argument("--as-document", dest="as_document", action="store_true", help="фото/видео отправить файлом без сжатия")
    s.add_argument("--reply-to", dest="reply_to", type=int, metavar="ID")
    s.add_argument("--silent", action="store_true")

    s = sub.add_parser("download", help="скачать фото/файл/голосовое из сообщения")
    s.add_argument("chat")
    s.add_argument("msg_ids", nargs="+", type=int, metavar="ID")
    s.add_argument("--out", help=f"папка (по умолчанию {DOWNLOAD_DIR})")

    s = sub.add_parser("transcribe", help="голосовое → текст (Telegram, иначе Whisper локально)")
    s.add_argument("chat")
    s.add_argument("msg_id", type=int)
    s.add_argument("--engine", choices=["auto", "telegram", "whisper"], default="auto")
    s.add_argument("--model", help="модель Whisper: tiny/base/small/medium/large-v3 (по умолчанию small)")
    s.add_argument("--lang", help="язык речи для Whisper, например ru (по умолчанию автоопределение)")

    s = sub.add_parser("send-voice", help="отправить аудиофайл как голосовое (конвертируется в OGG/Opus)")
    s.add_argument("chat")
    s.add_argument("file")
    s.add_argument("--caption")
    s.add_argument("--reply-to", dest="reply_to", type=int, metavar="ID")
    s.add_argument("--silent", action="store_true")

    s = sub.add_parser("say", help="озвучить текст и отправить голосовым")
    s.add_argument("chat", nargs="?")
    s.add_argument("text", nargs="?", help="текст ('-' = из stdin)")
    s.add_argument("--text-file", dest="text_file")
    s.add_argument("--lang", default=os.environ.get("TG_TTS_LANG", "ru"))
    s.add_argument("--engine", choices=["gtts", "edge", "piper"], help="движок синтеза (по умолчанию gtts)")
    s.add_argument("--voice", help="голос/модель для edge или piper")
    s.add_argument("--save", metavar="FILE.ogg", help="сохранить результат в файл (можно без отправки)")
    s.add_argument("--reply-to", dest="reply_to", type=int, metavar="ID")
    s.add_argument("--silent", action="store_true")

    s = sub.add_parser("mark-read", help="отметить чат прочитанным")
    s.add_argument("chat")

    s = sub.add_parser("contacts", help="список контактов")
    s.add_argument("--search")
    return p


COMMANDS = {
    "chats": cmd_chats, "read": cmd_read, "unread": cmd_unread, "search": cmd_search,
    "send": cmd_send, "send-file": cmd_send_file, "download": cmd_download,
    "transcribe": cmd_transcribe, "send-voice": cmd_send_voice, "say": cmd_say,
    "mark-read": cmd_mark_read, "contacts": cmd_contacts, "logout": cmd_logout,
}


async def run(args):
    if args.cmd == "login":
        return await cmd_login(args)
    if args.cmd == "say" and args.save and args.text is None and args.chat and not args.text_file:
        # `say --save out.ogg "текст"`: единственный позиционный аргумент — это текст, а не чат.
        args.text, args.chat = args.chat, None
    if args.cmd == "say" and args.save and not args.chat:
        # Только синтез в файл, без подключения к Telegram.
        text = read_text_arg(args)
        audio = tts_to_file(text, lang=args.lang, engine=args.engine, voice=args.voice)
        ogg, dur = to_voice_ogg(audio, args.save)
        print(f"✅ Сохранено {ogg} ({fmt_dur(dur)})")
        return 0
    api_credentials()  # сначала понятная ошибка про ключи API, потом про сессию
    session, source = pick_session()
    client, transport = make_client(session)
    eprint(f"[tg] транспорт: {transport}" + (f" через прокси" if transport == "https" and proxy_url() else "")
           + f" · сессия: {source}")
    try:
        await client.connect()
    except Exception as e:
        die(f"Не удалось подключиться к Telegram ({transport}): {e}{transport_hint(transport)}")
    try:
        if not await client.is_user_authorized():
            die("Сессия не авторизована или отозвана. Выполните вход заново: "
                "tools/telegram/tg.sh login --phone +7XXXXXXXXXX --fresh")
        if args.cmd == "me":
            return await cmd_me(client, args, transport=transport, source=source)
        return await COMMANDS[args.cmd](client, args)
    except errors.FloodWaitError as e:
        die(f"Telegram просит подождать {e.seconds} сек. (FloodWait)")
    except (errors.AuthKeyUnregisteredError, errors.SessionRevokedError, errors.UserDeactivatedError) as e:
        die(f"Сессия недействительна ({type(e).__name__}). Выполните вход заново: login --phone ... --fresh")
    except errors.RPCError as e:
        die(f"Ошибка Telegram: {e}")
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = build_parser().parse_args()
    debug = args.debug or os.environ.get("TG_DEBUG") == "1"
    logging.basicConfig(level=logging.DEBUG if debug else logging.WARNING,
                        format="[telethon] %(levelname)s %(name)s: %(message)s", stream=sys.stderr)
    if not debug:
        logging.getLogger("asyncio").setLevel(logging.CRITICAL)  # «Future exception was never retrieved» при обрыве

    async def with_timeout():
        return await asyncio.wait_for(run(args), timeout=TIMEOUT)

    try:
        code = asyncio.run(with_timeout())
    except KeyboardInterrupt:
        code = 130
    except asyncio.TimeoutError:
        die(f"Команда не завершилась за {int(TIMEOUT)} сек. (TG_TIMEOUT). Сервер не отвечает?{transport_hint()}")
    except (ConnectionError, OSError) as e:
        die(f"Проблема соединения с Telegram: {e}{transport_hint()}")
    except Exception as e:
        if debug:
            raise
        die(f"Ошибка {type(e).__name__}: {e} (повторите с --debug для подробностей)")
    sys.exit(code or 0)


if __name__ == "__main__":
    main()
