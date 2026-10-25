// Редактор контенту: читання й запис файлів сайту в GitHub від імені адмінки (/kabinet/admin).
// GET  ?op=status | list&dir= | pages | file&path= | history | commit&sha=
// POST {op:'save', message, files:[{path, content, encoding}], deletes:[path], expect:{path: sha|null}}
// POST {op:'revert', sha}
// Кожен запит — лише для адміна (сесія на сервері); токен GitHub — секрет GITHUB_CONTENT_TOKEN, клієнту не віддається.
import { bad, json, requireAdmin } from '../../_lib.js';
import { GhError, LIMITS, allowedPath, b64Size, generatedHtml, gh, htmlFrame } from '../../_gh.js';

const NO_TOKEN = { error: 'Потрібен токен GitHub: додайте секрет SHOP_GITHUB_CONTENT_TOKEN (інструкція — tools/admin/README.md). Без нього редагування сайту вимкнене, CRM працює.', code: 'no_token' };

// директорії, які можна переглядати списком
const LIST_DIRS = ['tools/blog/articles', 'tools/blog/drafts', 'tools/site/pages', 'tools/site/lang', 'img/p', 'img/products', 'img/uploads', 'proekty'];
const HTML_DIRS = ['', 'proekty', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'ar'];

const fail = e => e instanceof GhError ? bad(e.message, e.status) : bad('Помилка сервера: ' + (e && e.message || e), 500);

export async function onRequestGet({ request, env }) {
  if (!await requireAdmin(request, env)) return bad('Немає доступу', 403);
  const u = new URL(request.url), op = u.searchParams.get('op') || 'status';
  const g = gh(env);
  if (!g) return op === 'status' ? json({ token: false, message: NO_TOKEN.error }) : json(NO_TOKEN, 503);
  try {
    if (op === 'status') {
      const head = await g.head();
      return json({ token: true, repo: g.repo, branch: g.branch, head });
    }
    if (op === 'list') {
      const dir = u.searchParams.get('dir') || '';
      if (!LIST_DIRS.includes(dir)) return bad('Директорія недоступна');
      const head = await g.head();
      return json({ head, files: (await g.dir(dir, head)).filter(f => f.type === 'file') });
    }
    if (op === 'pages') { // HTML-сторінки: ручні можна редагувати, згенеровані — лише через JSON
      const head = await g.head();
      const pageFiles = (await g.dir('tools/site/pages', head)).map(f => f.name);
      const out = [];
      for (const d of HTML_DIRS) {
        const list = d ? await g.dir(d, head) : (await g.call(`/contents?ref=${head}`));
        for (const f of list) if (f.type === 'file' && allowedPath(f.path) === 'html')
          out.push({ path: f.path, sha: f.sha, size: f.size, generated: generatedHtml(f.path, pageFiles) });
      }
      return json({ head, files: out });
    }
    if (op === 'file') {
      const path = u.searchParams.get('path') || '';
      const kind = allowedPath(path);
      if (kind !== 'json' && kind !== 'html') return bad('Файл недоступний для редагування');
      const head = await g.head();
      const f = await g.file(path, head);
      if (!f) return json({ head, sha: null, content: null });
      return json({ head, sha: f.sha, content: f.content });
    }
    if (op === 'history') {
      const list = await g.call(`/commits?sha=${encodeURIComponent(g.branch)}&per_page=40`);
      let runs = null;
      try { // статус збірки — якщо токену дали Actions: read
        const r = await g.call(`/actions/runs?branch=${encodeURIComponent(g.branch)}&per_page=8`);
        runs = r.workflow_runs.map(x => ({ name: x.name, status: x.status, conclusion: x.conclusion, sha: x.head_sha, url: x.html_url, at: x.created_at }));
      } catch { /* без прав Actions — просто не показуємо */ }
      return json({ commits: list.map(c => ({
        sha: c.sha, message: c.commit.message, author: c.commit.author && c.commit.author.name,
        date: c.commit.author && c.commit.author.date, url: c.html_url,
      })), runs });
    }
    if (op === 'commit') {
      const sha = u.searchParams.get('sha') || '';
      if (!/^[0-9a-f]{7,40}$/.test(sha)) return bad('Некоректний коміт');
      const c = await g.call(`/commits/${sha}`);
      return json({ sha: c.sha, message: c.commit.message, files: (c.files || []).map(f => ({ path: f.filename, status: f.status, allowed: !!allowedPath(f.filename) })) });
    }
    return bad('Невідома дія');
  } catch (e) { return fail(e); }
}

function validJSON(path, text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return `${path}: некоректний JSON (${e.message})`; }
  if (path === 'assets/ozdoba/catalog.json' || path === 'tools/products/archive.json') {
    if (!d || !Array.isArray(d.items)) return `${path}: немає списку items`;
    const ids = new Set();
    for (const i of d.items) {
      if (!Number.isInteger(i.id) || i.id <= 0) return `${path}: товар без коректного id`;
      if (ids.has(i.id)) return `${path}: id ${i.id} повторюється`;
      ids.add(i.id);
      if (!i.name || typeof i.name !== 'string') return `${path}: товар ${i.id} без назви`;
      if (!i.cat || !i.cs || !i.unit) return `${path}: товар ${i.id} — потрібні категорія, одиниця й набір кольорів`;
      if (i.price != null && !(typeof i.price === 'number' && i.price >= 0)) return `${path}: товар ${i.id} — ціна має бути числом або порожня (за запитом)`;
      if (path === 'assets/ozdoba/catalog.json') {
        if (!d.colorsets || !d.colorsets[i.cs]) return `${path}: товар ${i.id} — невідомий набір кольорів «${i.cs}»`;
        if (i.ss && !(d.sizesets && d.sizesets[i.ss])) return `${path}: товар ${i.id} — невідомий набір розмірів «${i.ss}»`;
      }
    }
    if (path === 'assets/ozdoba/catalog.json') for (const b of d.bundles || []) for (const r of b.rows || [])
      if (!ids.has(r.id)) return `${path}: комплект «${b.name}» посилається на товар ${r.id}, якого немає в каталозі`;
  }
  if (/^tools\/blog\/articles\//.test(path)) {
    for (const k of ['slug', 'lang', 'title', 'description', 'lead', 'date', 'service', 'body', 'faq'])
      if (d[k] == null || d[k] === '') return `${path}: бракує поля ${k}`;
    if (!Array.isArray(d.body) || !d.body.length) return `${path}: порожній текст статті`;
  }
  if (/^tools\/blog\/drafts\//.test(path) && (!d.slug || !d.lang || !d.title)) return `${path}: потрібні slug, lang і title`;
  if (/^tools\/site\/pages\//.test(path) && (!d.slug || !d.lang || !d.title)) return `${path}: потрібні slug, lang і title`;
  return null;
}

const IMG_MAGIC = b64 => {
  const h = atob(String(b64).slice(0, 24));
  return h.startsWith('RIFF') && h.slice(8, 12) === 'WEBP' || h.startsWith('\x89PNG') || h.startsWith('\xff\xd8\xff') || h.slice(4, 8) === 'ftyp';
};

const cleanMsg = s => String(s || '').replace(/\[(rebuild|skip ci|ci skip)\]/gi, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return bad('Немає доступу', 403);
  const g = gh(env);
  if (!g) return json(NO_TOKEN, 503);
  const len = +request.headers.get('content-length') || 0;
  if (len > LIMITS.body) return bad('Завеликий запит', 413);
  let d;
  try {
    const t = await request.text();
    if (t.length > LIMITS.body) return bad('Завеликий запит', 413);
    d = JSON.parse(t);
  } catch { return bad('Некоректні дані'); }
  const who = `адмінка, #${admin.id}`;
  const author = { name: 'CAS Admin', email: 'admin@cas-develop.com' };

  try {
    if (d.op === 'save') {
      const files = Array.isArray(d.files) ? d.files : [], deletes = Array.isArray(d.deletes) ? d.deletes : [];
      if (!files.length && !deletes.length) return bad('Немає змін');
      if (files.length + deletes.length > LIMITS.files) return bad(`Не більше ${LIMITS.files} файлів за раз`);
      const head = await g.head();
      const expect = d.expect && typeof d.expect === 'object' ? d.expect : {};
      const seen = new Set();
      let pageFiles = null;
      for (const f of files) {
        const kind = allowedPath(f.path);
        if (!kind) return bad(`Шлях заборонений: ${f.path}`, 403);
        if (seen.has(f.path)) return bad(`Файл двічі: ${f.path}`);
        seen.add(f.path);
        if (kind === 'image') {
          if (f.encoding !== 'base64' || typeof f.content !== 'string') return bad(`${f.path}: зображення має бути base64`);
          if (b64Size(f.content) > LIMITS.image) return bad(`${f.path}: більше ${LIMITS.image >> 20} МБ`, 413);
          if (!IMG_MAGIC(f.content)) return bad(`${f.path}: це не зображення`);
          expect[f.path] = null; // зображення лише додаємо (кеш /img/* — immutable), нове імʼя на кожне фото
        } else {
          if (f.encoding && f.encoding !== 'utf-8') return bad(`${f.path}: текстовий файл — utf-8`);
          if (typeof f.content !== 'string' || f.content.length > LIMITS.text) return bad(`${f.path}: завеликий або порожній`, 413);
          if (kind === 'json') { const err = validJSON(f.path, f.content); if (err) return bad(err, 422); }
          if (kind === 'html') {
            if (!pageFiles) pageFiles = (await g.dir('tools/site/pages', head)).map(x => x.name);
            if (generatedHtml(f.path, pageFiles)) return bad(`${f.path} збирає генератор — редагуйте його JSON (вкладка «Лендинги»)`, 403);
            const cur = await g.file(f.path, head);
            if (!cur) return bad(`${f.path}: нові HTML-сторінки створюються через «Лендинги»`, 403);
            if (!/<main\b[\s\S]*<\/main>/.test(f.content)) return bad(`${f.path}: немає <main>`);
            if (htmlFrame(cur.content) !== htmlFrame(f.content)) return bad(`${f.path}: змінювати можна лише <main>, title і description — шапку, футер і скрипти ставлять генератори`, 422);
            if (!(f.path in expect)) expect[f.path] = cur.sha;
          }
        }
      }
      for (const p of deletes) {
        const kind = allowedPath(p);
        if (!kind || kind === 'html') return bad(`Видаляти заборонено: ${p}`, 403);
        if (seen.has(p)) return bad(`Файл двічі: ${p}`);
        seen.add(p);
      }
      // захист від перезапису чужих змін: sha на HEAD має збігатися з тим, що бачив редактор
      const paths = Object.keys(expect).filter(p => allowedPath(p));
      if (paths.length) {
        const now = await g.shas(paths, head);
        const conflicts = paths.filter(p => (now[p] || null) !== (expect[p] || null));
        if (conflicts.length) return json({ error: 'Файл уже змінено (іншою вкладкою, людиною або збіркою). Оновіть дані й повторіть: ' + conflicts.join(', '), conflicts }, 409);
      }
      const msg = cleanMsg(d.message) || 'зміни контенту';
      const r = await g.commit({
        message: `Адмінка: ${msg}\n\nЗбережено через /kabinet/admin (${who}).`, author, parent: head,
        files: files.map(f => ({ path: f.path, content: f.content, encoding: f.encoding === 'base64' ? 'base64' : 'utf-8' })),
        deletes,
      });
      return json({ ok: true, commit: r.sha, unchanged: !!r.unchanged });
    }

    if (d.op === 'revert') {
      const sha = String(d.sha || '');
      if (!/^[0-9a-f]{40}$/.test(sha)) return bad('Некоректний коміт');
      const c = await g.call(`/commits/${sha}`);
      if ((c.parents || []).length !== 1) return bad('Злиття гілок з адмінки не відкочується');
      if (/\[rebuild\]/.test(c.commit.message)) return bad('Це автоматична перезбірка — відкотіть зміну, яка її викликала');
      const files = c.files || [];
      if (!files.length) return bad('У коміті немає файлів');
      if (files.length > LIMITS.files) return bad('Забагато файлів — відкат лише вручну через GitHub');
      const denied = files.filter(f => !allowedPath(f.filename) || (f.previous_filename && !allowedPath(f.previous_filename)));
      if (denied.length) return bad('Коміт змінює код або службові файли — відкат лише через розробника: ' + denied.map(f => f.filename).join(', '), 403);
      const parent = c.parents[0].sha, head = await g.head();
      const touched = [...new Set(files.flatMap(f => f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]))];
      const now = await g.shas(touched, head), before = await g.shas(touched, parent);
      // файли не мали змінюватися після цього коміту
      const later = files.filter(f => (now[f.filename] || null) !== (f.status === 'removed' ? null : f.sha));
      if (later.length) return json({ error: 'Ці файли змінювали пізніше — спершу відкотіть новіші зміни: ' + later.map(f => f.filename).join(', ') }, 409);
      const put = [], del = [];
      for (const p of touched) (before[p] ? put.push({ path: p, sha: before[p] }) : del.push(p));
      const first = c.commit.message.split('\n')[0].slice(0, 120);
      const r = await g.commit({ message: `Адмінка: відкат «${first}»\n\nВідкочено коміт ${sha.slice(0, 7)} через /kabinet/admin (${who}).`, author, parent: head, files: put, deletes: del });
      return json({ ok: true, commit: r.sha });
    }
    return bad('Невідома дія');
  } catch (e) { return fail(e); }
}
