#!/usr/bin/env python3
"""Щотижневий звіт про сайт cas-develop.com.

Перевіряє:
  - усі адреси з sitemap.xml відкриваються (200), www-домен;
  - швидкість і SEO за Lighthouse (мобільний) для ключових сторінок;
  - заявки з сайту за 7 днів (повідомлення «Лід #… — Сайт» у групі CAS DEV HQ).
Друкує короткий текст звіту (українською) у stdout.

  python3 tools/site/weekly-report.py            # звіт у консоль
  python3 tools/site/weekly-report.py --no-lh    # без Lighthouse (швидко)
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error, datetime, glob, tempfile

SITE = 'https://cas-develop.com'
LH_PAGES = ['/', '/portfolio', '/blog']
LEADS_CHAT = '-1004465248824'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def http_status(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 CAS-weekly-report'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def check_sitemap():
    req = urllib.request.Request(SITE + '/sitemap.xml', headers={'User-Agent': 'Mozilla/5.0'})
    xml = urllib.request.urlopen(req, timeout=30).read().decode()
    urls = re.findall(r'<loc>([^<]+)</loc>', xml)
    bad = [(u, s) for u in urls for s in [http_status(u)] if s != 200]
    return len(urls), bad


def chrome_path():
    for p in sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')) + [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:
        if os.path.exists(p):
            return p
    return None


def lighthouse(path):
    ch = chrome_path()
    if not ch:
        return None
    out = tempfile.mktemp(suffix='.json')
    flags = '--headless=new --no-sandbox --ignore-certificate-errors'
    if os.environ.get('HTTPS_PROXY'):
        flags += ' --proxy-server=' + os.environ['HTTPS_PROXY']
    env = dict(os.environ, CHROME_PATH=ch)
    subprocess.run(['npx', '-y', 'lighthouse@12.2.1', SITE + path, '--quiet', f'--chrome-flags={flags}',
                    '--output=json', f'--output-path={out}', '--only-categories=performance,seo,accessibility'],
                   env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
    try:
        d = json.load(open(out))
    except Exception:
        return None
    c, a = d['categories'], d['audits']
    return {k: round((v['score'] or 0) * 100) for k, v in c.items()} | {'lcp': a['largest-contentful-paint'].get('displayValue', '?')}


def leads_last_week():
    tg = os.path.join(ROOT, 'tools/telegram/tg.sh')
    try:
        raw = subprocess.run([tg, '--json', 'read', LEADS_CHAT, '--limit', '300'], capture_output=True, text=True, timeout=180).stdout
        msgs = json.loads(raw)['messages']
    except Exception:
        return None
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    leads = []
    for m in msgs:
        t = m.get('text') or ''
        if 'Лід #' in t and datetime.datetime.fromisoformat(m['date']) >= since:
            name = re.search(r"Ім'я:\s*(.+)", t)
            svc = re.search(r'Послуга:\s*(.+)', t)
            leads.append(f"{m['date_local'][5:16]} · {(name.group(1) if name else '?').strip()[:40]} · {(svc.group(1) if svc else '').strip()[:50]}")
    return leads


def main():
    no_lh = '--no-lh' in sys.argv
    lines = ['🌐 Сайт cas-develop.com — тижневий звіт']
    try:
        n, bad = check_sitemap()
        lines.append(f'Сторінок у карті сайту: {n}; ' + ('усі відкриваються ✅' if not bad else f'❌ з помилкою: ' + ', '.join(f'{u.replace(SITE, "")} ({s})' for u, s in bad[:8])))
    except Exception as e:
        lines.append(f'❌ Карта сайту недоступна: {e}')
    www = http_status('https://www.cas-develop.com/')
    lines.append('www.cas-develop.com: ' + ('✅ працює' if www in (200, 301, 308) else '❌ не відкривається (немає DNS/домену в Cloudflare)'))
    if not no_lh:
        for p in LH_PAGES:
            r = lighthouse(p)
            lines.append(f'Lighthouse {p}: ' + (f"швидкість {r['performance']}, SEO {r['seo']}, доступність {r['accessibility']}, LCP {r['lcp']}" if r else 'не вдалося виміряти'))
    leads = leads_last_week()
    if leads is None:
        lines.append('Заявки: не вдалося прочитати CAS DEV HQ')
    else:
        real = [l for l in leads if 'ТЕСТ' not in l]
        lines.append(f'Заявок із сайту за 7 днів: {len(real)}')
        lines += ['  • ' + l for l in real[:10]]
    lines.append('Індексація в Google: див. Search Console (search.google.com/search-console).')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
