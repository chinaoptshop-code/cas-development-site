// Редактор контенту в /kabinet/admin: запис файлів сайту в GitHub (REST: Contents + Git Data API).
// Секрети середовища: GITHUB_CONTENT_TOKEN (fine-grained PAT лише на цей репозиторій, Contents: read & write;
// Actions: read — необовʼязково, для статусу збірки), GITHUB_REPO (за замовчуванням нижче), GITHUB_BRANCH (main).
// Токен ніколи не логуємо й не віддаємо клієнту. Шляхи — лише з білого списку (allowedPath).

export const DEFAULT_REPO = 'chinaoptshop-code/cas-development-site';

export const LIMITS = {
  text: 1536 * 1024,      // JSON / HTML: до 1,5 МБ на файл
  image: 6 * 1024 * 1024, // зображення: до 6 МБ на файл
  files: 24,              // файлів в одному коміті
  body: 30 * 1024 * 1024, // запит на збереження загалом
};

const IMG_EXT = /\.(webp|avif|jpe?g|png)$/i;
const SEG = '[A-Za-z0-9][A-Za-z0-9._-]*';

// Білий список: що адмінка може змінювати. Усе інше (.github/, functions/, migrations/, wrangler.toml, CLAUDE.md,
// tools/**/*.py, assets/*.js тощо) — заборонено. Повертає тип файлу: 'json' | 'html' | 'image' або null.
export function allowedPath(p) {
  if (typeof p !== 'string' || p.length > 200 || p.includes('..') || p.includes('//') || p.startsWith('/') || p.includes('\\')) return null;
  if (!new RegExp(`^${SEG}(/${SEG})*$`).test(p)) return null;
  if (p === 'assets/ozdoba/catalog.json' || p === 'tools/products/archive.json' || p === 'tools/blog/topics.json') return 'json';
  if (new RegExp(`^tools/blog/(articles|drafts)/${SEG}\\.json$`).test(p)) return 'json';
  if (new RegExp(`^tools/site/(pages|lang)/${SEG}\\.json$`).test(p)) return 'json';
  if (/^img\//.test(p) && IMG_EXT.test(p) && !/^img\/lqip\.json$/.test(p)) return 'image';
  // ручні HTML-сторінки: корінь, proekty/ і мовні папки (згенеровані відсіює generatedHtml)
  if (new RegExp(`^(proekty/|(ru|en|es|zh|pl|de|fr|ar)/)?${SEG}\\.html$`).test(p) && !/^(404|google[0-9a-f]+)\.html$/.test(p)) return 'html';
  return null;
}

// HTML, який збирають генератори (його правлять через JSON-джерела): лендинги з tools/site/pages, блог, Оздоба, кабінет.
export function generatedHtml(p, pageFiles) {
  if (/^([a-z]{2}\/)?(ozdoba|blog|kabinet)\.html$/.test(p)) return true;
  for (const f of pageFiles) {
    const m = f.match(/^([a-z]{2})-(.+)\.json$/);
    if (!m) continue;
    const [, lang, slug] = m;
    if (p === (lang === 'uk' ? '' : lang + '/') + slug + '.html') return true;
  }
  return false;
}

// Частина HTML поза редагованими зонами: <title>, <meta name="description">, <main>…</main>. Має лишатися незмінною
// (шапку й футер ставить tools/site/chrome.py, скрипти й стилі — шаблони).
export function htmlFrame(s) {
  return s
    .replace(/<title>[\s\S]*?<\/title>/, '<title></title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="">')
    .replace(/<main\b[\s\S]*<\/main>/, '<main></main>');
}

export class GhError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function gh(env) {
  const token = env.GITHUB_CONTENT_TOKEN;
  if (!token) return null;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const base = (env.GITHUB_API || 'https://api.github.com') + '/repos/' + repo;

  async function call(path, opts = {}) {
    const r = await fetch(base + path, {
      method: opts.method || 'GET',
      headers: {
        authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        'user-agent': 'cas-admin', ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (opts.allow404 && r.status === 404) return null;
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // повідомлення GitHub не містить токена; статус 401/403 — проблема з токеном або правами
      const why = r.status === 401 ? 'GitHub не прийняв токен (прострочений або відкликаний)'
        : r.status === 403 ? 'Токену бракує прав (потрібно Contents: read & write на цей репозиторій)'
        : r.status === 409 || r.status === 422 ? 'Конфлікт змін у GitHub — оновіть сторінку й повторіть'
        : `GitHub: ${d.message || r.status}`;
      throw new GhError(why, r.status === 422 || r.status === 409 ? 409 : 502);
    }
    return d;
  }

  const head = async () => (await call(`/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;

  // Вміст директорії на коміті ref: [{name, path, sha, size, type}] (до 1000 записів — для наших директорій досить)
  async function dir(path, ref) {
    const d = await call(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, { allow404: true });
    return Array.isArray(d) ? d.map(x => ({ name: x.name, path: x.path, sha: x.sha, size: x.size, type: x.type })) : [];
  }

  async function blobText(sha) {
    const b = await call(`/git/blobs/${sha}`);
    return b64ToText(b.content);
  }

  // Файл на коміті ref: {sha, content (utf-8)} або null
  async function file(path, ref) {
    const d = await call(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, { allow404: true });
    if (!d || Array.isArray(d) || d.type !== 'file') return null;
    const content = d.encoding === 'base64' && d.content ? b64ToText(d.content) : d.size ? await blobText(d.sha) : '';
    return { sha: d.sha, size: d.size, content };
  }

  // Sha блоба кожного шляху на коміті ref (null — файлу немає); директорії читаємо по одному разу.
  async function shas(paths, ref) {
    const byDir = new Map(), out = {};
    for (const p of paths) {
      const d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      if (!byDir.has(d)) byDir.set(d, d ? await dir(d, ref) : await rootDir(ref));
      const e = byDir.get(d).find(x => x.path === p);
      out[p] = e ? e.sha : null;
    }
    return out;
  }
  async function rootDir(ref) {
    const d = await call(`/contents?ref=${ref}`);
    return d.map(x => ({ name: x.name, path: x.path, sha: x.sha, size: x.size, type: x.type }));
  }

  // Один коміт: files [{path, content, encoding: 'utf-8'|'base64'}], deletes [path]. Атомарно через trees + ref (без force).
  async function commit({ message, files = [], deletes = [], parent, author }) {
    const tip = parent || await head();
    const c = await call(`/git/commits/${tip}`);
    const tree = [];
    for (const f of files) {
      if (f.sha) { // наявний блоб (відкат: версія з батьківського коміту)
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: f.sha });
      } else if (f.encoding === 'base64') {
        const b = await call('/git/blobs', { method: 'POST', body: { content: f.content, encoding: 'base64' } });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
      } else {
        tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.content });
      }
    }
    for (const p of deletes) tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
    const t = await call('/git/trees', { method: 'POST', body: { base_tree: c.tree.sha, tree } });
    if (t.sha === c.tree.sha) return { sha: tip, unchanged: true };
    const now = new Date().toISOString();
    const n = await call('/git/commits', { method: 'POST', body: {
      message, tree: t.sha, parents: [tip],
      ...(author ? { author: { ...author, date: now } } : {}),
    } });
    await call(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: n.sha, force: false } });
    return { sha: n.sha };
  }

  return { call, head, dir, file, shas, commit, repo, branch };
}

export function b64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u);
}

export const b64Size = b64 => Math.floor(String(b64).replace(/[\s=]/g, '').length * 3 / 4);
