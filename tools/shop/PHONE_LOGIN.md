# Вхід за номером телефону через Telegram-бота

Клієнт вводить номер на `/kabinet`, підтверджує його в боті `@<TELEGRAM_BOT_USERNAME>` кнопкою
«📱 Поділитися номером», і сайт сам впускає його в кабінет. Пароля й SMS немає (SMS — заготовка, `functions/_sms.js`).

## Потік

```
браузер                         сайт (Pages Functions + D1)                 бот
  │ POST /api/auth/phone/start {phone}   ──►  login_requests: pending, 10 хв
  │ ◄── {token, botUrl, expiresIn:600, sms:false} + cookie cas_pl (секрет браузера)
  │ відкриває botUrl = https://t.me/<bot>?start=login_<token>  ─────────────►  /start login_<token>
  │                                                                            кнопка request_contact
  │                                                                            ◄── contact (номер)
  │                              POST /api/auth/phone/confirm  ◄──────────────  {token, phone, tg_id, name, username}
  │                              (X-Bot-Signature)               ──► 200 / 409 / 410 / 401
  │ GET /api/auth/phone/status?token=… (кожні 2 с, з cookie cas_pl)
  │ ◄── {status:'pending'} … {status:'ok', client} + cookie сесії cas_s
```

## Що робить бот

1. **`/start login_<token>`** (`token` — 32 hex-символи). Запамʼятати `token` для цього чату (`chat_id → token`,
   10 хв) і відповісти з reply-клавіатурою:
   ```json
   {"keyboard": [[{"text": "📱 Поділитися номером", "request_contact": true}]],
    "one_time_keyboard": true, "resize_keyboard": true}
   ```
   Текст: «Щоб увійти на сайт CAS Development, натисніть «📱 Поділитися номером»».
2. **Повідомлення з `contact`**:
   - `contact.user_id` має дорівнювати `from.id` — інакше людина надіслала **чужий** контакт:
     відповісти «Надішліть, будь ласка, свій номер кнопкою нижче» і нічого не викликати.
   - Немає збереженого `token` для чату — «Почніть вхід на сайті ще раз».
   - Нормалізувати `contact.phone_number` (Telegram часто дає без `+`): лишити цифри, додати `+`
     (`380501234567` → `+380501234567`). Сайт однаково нормалізує номер сам, але **підпис рахується від того
     рядка `phone`, який бот відправляє в тілі**.
   - Порахувати підпис і зробити `POST https://cas-develop.com/api/auth/phone/confirm`.
   - Відповісти за кодом відповіді (і прибрати клавіатуру `{"remove_keyboard": true}`):

| Код | Тіло | Що сказати клієнту |
|---|---|---|
| 200 | `{"ok": true}` | «Готово, поверніться на сайт» |
| 409 | `{"error": "Номер не збігається з тим, що введено на сайті"}` | цей текст + «перевірте номер на сайті й почніть знову». Запит лишається `pending` — клієнт може виправити номер і повторити |
| 409 | `{"error": "Цей вхід уже підтверджено"}` | «Вхід уже підтверджено, поверніться на сайт» |
| 410 | `{"error": "Час на підтвердження минув…"}` | цей текст |
| 404 | запит не знайдено | «Почніть вхід на сайті ще раз» |
| 401 | підпис не збігся | помилка конфігурації бота (інший токен) — у лог, клієнту «Спробуйте пізніше» |
| 503 | вхід не налаштовано | «Спробуйте пізніше» |

## Запит `POST /api/auth/phone/confirm`

Тіло (JSON): `{"token": "<32 hex>", "phone": "+380501234567", "tg_id": "123456789", "name": "Імʼя Прізвище", "username": "nick"}`
(`tg_id` — рядок з цифр, `from.id`; `name`, `username` — необовʼязкові).

Заголовок `X-Bot-Signature` — hex HMAC-SHA256:

```
key = SHA256(TELEGRAM_BOT_TOKEN)            # 32 байти, сирий дайджест (як у Telegram Login Widget)
msg = token + "|" + phone + "|" + tg_id     # phone і tg_id — рівно ті рядки, що в тілі
X-Bot-Signature = hex(HMAC_SHA256(key, msg))
```

Сайт:
- перевіряє підпис (рівночасове порівняння) → інакше **401**;
- запит має бути `pending` і не простроченим (10 хв) → інакше **409** (уже підтверджено) / **410** (минув);
- нормалізований номер з тіла має збігатися з номером, який клієнт ввів на сайті → інакше **409**, статус лишається `pending`;
- клієнт: якщо вже є клієнт `provider='telegram', provider_id=tg_id` (входив через Telegram-віджет) — йому
  записується `phone`; інакше створюється/оновлюється клієнт `provider='phone', provider_id=<номер>`;
- `login_requests.status = 'confirmed'`, `client_id`, `tg_id`. Сесію забирає лише браузер, що почав вхід
  (cookie `cas_pl` ↔ `browser_hash`), один раз (`confirmed → used`).

Нормалізація номера на сайті: `0XXXXXXXXX`, `380XXXXXXXXX`, `+380XXXXXXXXX` (пробіли, дужки, дефіси дозволені)
→ `+380XXXXXXXXX`; інші країни — `+` і 10–15 цифр (E.164). Rate-limit старту: ≤ 5 запитів на годину на номер і на IP.

## Приклад бота на Python (лише stdlib, long polling)

```python
#!/usr/bin/env python3
"""Бот підтвердження входу на сайт за номером. TELEGRAM_BOT_TOKEN=... SITE=https://cas-develop.com python3 bot.py"""
import hashlib, hmac, json, os, re, time, urllib.error, urllib.request

TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
SITE = os.environ.get('SITE', 'https://cas-develop.com')
API = f'https://api.telegram.org/bot{TOKEN}/'
KEY = hashlib.sha256(TOKEN.encode()).digest()
pending = {}  # chat_id -> (token, до коли дійсний)


def tg(method, **params):
    req = urllib.request.Request(API + method, json.dumps(params).encode(), {'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)['result']


def confirm(token, phone, user):
    tg_id = str(user['id'])
    sig = hmac.new(KEY, f'{token}|{phone}|{tg_id}'.encode(), hashlib.sha256).hexdigest()
    body = {'token': token, 'phone': phone, 'tg_id': tg_id,
            'name': ' '.join(filter(None, [user.get('first_name'), user.get('last_name')])),
            'username': user.get('username')}
    req = urllib.request.Request(SITE + '/api/auth/phone/confirm', json.dumps(body).encode(),
                                 {'content-type': 'application/json', 'x-bot-signature': sig})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except ValueError:
            return e.code, {}


def handle(m):
    chat, user = m['chat']['id'], m['from']
    text = m.get('text') or ''
    s = re.fullmatch(r'/start login_([0-9a-f]{32})', text)
    if s:
        pending[chat] = (s.group(1), time.time() + 600)
        tg('sendMessage', chat_id=chat,
           text='Щоб увійти на сайт CAS Development, натисніть «📱 Поділитися номером».',
           reply_markup={'keyboard': [[{'text': '📱 Поділитися номером', 'request_contact': True}]],
                         'one_time_keyboard': True, 'resize_keyboard': True})
        return
    c = m.get('contact')
    if not c:
        return
    if c.get('user_id') != user['id']:
        tg('sendMessage', chat_id=chat, text='Надішліть, будь ласка, свій номер кнопкою нижче.')
        return
    token, until = pending.get(chat, (None, 0))
    if not token or time.time() > until:
        tg('sendMessage', chat_id=chat, text='Почніть вхід на сайті ще раз.', reply_markup={'remove_keyboard': True})
        return
    phone = '+' + re.sub(r'\D', '', c['phone_number'])
    code, d = confirm(token, phone, user)
    if code == 200:
        pending.pop(chat, None)
        reply = 'Готово, поверніться на сайт.'
    elif code in (401, 503) or code >= 500:
        reply = 'Не вдалося підтвердити вхід. Спробуйте пізніше.'
    else:
        reply = (d.get('error') or 'Не вдалося підтвердити вхід') + '. Почніть вхід на сайті ще раз.'
        if code != 409 or 'не збігається' not in reply:
            pending.pop(chat, None)
    tg('sendMessage', chat_id=chat, text=reply, reply_markup={'remove_keyboard': True})


def main():
    offset = 0
    while True:
        for u in tg('getUpdates', offset=offset, timeout=50, allowed_updates=['message']):
            offset = u['update_id'] + 1
            if 'message' in u:
                try:
                    handle(u['message'])
                except Exception as e:  # noqa: BLE001 — бот не має падати через один апдейт
                    print('error', e)


if __name__ == '__main__':
    main()
```

Якщо бот уже працює на вебхуку (n8n тощо) — та сама логіка: на `/start login_…` показати кнопку, на `contact`
перевірити `user_id`, підписати й зробити POST. Секрет — той самий `TELEGRAM_BOT_TOKEN`, що й у Pages.

## Перевірка локально

```bash
printf 'TELEGRAM_BOT_TOKEN=test:123\nTELEGRAM_BOT_USERNAME=chinaoptshop_bot\nSESSION_SECRET=x\n' > .dev.vars
sed -i 's/__D1_ID__/00000000-0000-0000-0000-000000000000/' wrangler.toml   # тимчасово, потім повернути
npx wrangler@3 d1 migrations apply cas-shop --local
npx wrangler@3 pages dev . --port 8788
# підпис для емуляції бота:
node -e "const c=require('crypto');const[t,p,i]=process.argv.slice(1);console.log(c.createHmac('sha256',c.createHash('sha256').update('test:123').digest()).update(t+'|'+p+'|'+i).digest('hex'))" <token> +380501234567 111
```
