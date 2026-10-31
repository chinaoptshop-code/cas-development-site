/* CAS 3D-тури: переглядач 360-фото з переходами (A-Frame 1.6, WebXR).
   Дані туру — <script id="tour-data">. Yaw/pitch у градусах: yaw 0 — центр фото, + праворуч; pitch + вгору.
   ?scene=<id> — відкрити кімнату, ?embed=1 — без шапки (для вставки), ?edit=1 — розставити переходи. */
// стрілки завжди навколо голови глядача (у VR камера стоїть на висоті людини)
AFRAME.registerComponent('follow-cam', {
  tick() { const c = this.el.sceneEl.camera; if (c) { c.getWorldPosition(this.el.object3D.position); } }
});
// масштаб: кут огляду камери (FOV) 30°…max, плавно; у VR вимкнено (там FOV задають окуляри).
// max — щоб по горизонталі було ≤ 120°: далі прямолінійна проєкція сильно «розтягує» краї.
AFRAME.registerComponent('tour-zoom', {
  schema: { min: { default: 30 }, max: { default: 100 }, def: { default: 78 } },
  init() { this.fov = this.target = this.lim().def; this.prev = null; },
  lim() {
    const c = this.el.sceneEl.canvas, a = c && c.clientHeight ? c.clientWidth / c.clientHeight : 1;
    const max = Math.min(this.data.max, 2 * Math.atan(Math.tan(Math.PI / 3) / a) * 180 / Math.PI);
    return { min: this.data.min, max, def: Math.min(this.data.def, max) };
  },
  set(f, now) { const l = this.lim(); this.target = Math.max(l.min, Math.min(l.max, f)); if (now) this.fov = this.target; },
  by(k) { this.set(this.target * k); },
  reset(now) { this.set(this.lim().def, now); },
  tick(t, dt) {
    const sc = this.el.sceneEl; if (sc.is('vr-mode') || sc.is('ar-mode')) return;
    const cam = this.el.getObject3D('camera'); if (!cam) return;
    const l = this.lim(); if (this.target > l.max) this.target = l.max;  // поворот екрана
    const d = this.target - this.fov;
    this.fov = Math.abs(d) < 0.05 ? this.target : this.fov + d * Math.min(1, (dt || 16) / 90);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // перетягування повільніше при наближенні (look-controls крутить на сталий кут за піксель)
    const lc = this.el.components['look-controls'];
    if (lc && (lc.mouseDown || lc.touchStarted)) {
      const y = lc.yawObject.rotation, p = lc.pitchObject.rotation, k = this.fov / l.def;
      if (this.prev) {
        y.y = this.prev.y + (y.y - this.prev.y) * k;
        p.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.prev.x + (p.x - this.prev.x) * k));
      }
      this.prev = { y: y.y, x: p.x };
    } else this.prev = null;
  }
});
(function () {
  const T = JSON.parse(document.getElementById('tour-data').textContent);
  const Q = new URLSearchParams(location.search);
  const EDIT = Q.has('edit'), EMBED = Q.has('embed');
  const byId = Object.fromEntries(T.scenes.map(s => [s.id, s]));
  const $ = id => document.getElementById(id);
  const sceneEl = $('scene'), sky = $('sky'), spots = $('spots'), rig = $('rig'), cam = $('cam');
  const R = 8, D2R = Math.PI / 180;
  let cur = null, busy = false;
  if (EMBED) document.body.classList.add('embed');
  if (EDIT) document.body.classList.add('editing');

  // клік мишкою/пальцем по стрілках (і по фото в режимі редагування)
  if (EDIT) sky.classList.add('sky-hit');

  function pos(yaw, pitch, r = R) {
    const y = yaw * D2R, p = pitch * D2R;
    return { x: r * Math.cos(p) * Math.sin(y), y: r * Math.sin(p), z: -r * Math.cos(p) * Math.cos(y) };
  }
  function angles(v) {
    const r = Math.hypot(v.x, v.y, v.z);
    return { yaw: +(Math.atan2(v.x, -v.z) / D2R).toFixed(1), pitch: +(Math.asin(v.y / r) / D2R).toFixed(1) };
  }
  const label = id => (byId[id] ? byId[id].name : id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const texCache = {};
  function labelTex(text) {
    if (texCache[text]) return texCache[text];
    const c = document.createElement('canvas'); c.width = 768; c.height = 128;
    const g = c.getContext('2d'); g.font = '600 72px Montserrat, system-ui, sans-serif';
    const w = Math.min(740, g.measureText(text).width + 60);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect((768 - w) / 2, 14, w, 100, 50); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 384, 66, 700);
    return (texCache[text] = c.toDataURL());
  }

  // кут між двома напрямками (для стрілок, що стоять поруч)
  function sep(a, b) {
    const p1 = a.pitch * D2R, p2 = b.pitch * D2R;
    return Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos((a.yaw - b.yaw) * D2R))) / D2R;
  }
  function spot(h, i, all) {
    const p = pos(h.yaw, h.pitch);
    const e = document.createElement('a-entity');
    e.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    // далекі двері (майже на горизонті) — менша стрілка, щоб сусідні не перекривались
    const k = h.pitch > -8 ? 0.72 : h.pitch > -14 ? 0.86 : 1;
    e.setAttribute('scale', `${k} ${k} ${k}`);
    // підпис: під стрілкою; якщо поруч нижча стрілка — над нею (підписи не накладаються)
    const up = all.some(o => o !== h && byId[o.to] && o.pitch < h.pitch && sep(o, h) < 16);
    e.innerHTML =
      `<a-ring radius-inner="0.43" radius-outer="0.52" material="color:#000; opacity:0.35; shader:flat; transparent:true"></a-ring>` +
      `<a-circle class="spot" data-i="${i}" radius="0.44" material="color:#000; opacity:0.5; shader:flat; transparent:true"></a-circle>` +
      `<a-ring radius-inner="0.36" radius-outer="0.44" material="color:#c8a96a; shader:flat"></a-ring>` +
      `<a-triangle vertex-a="0 0.2 0.01" vertex-b="-0.2 -0.12 0.01" vertex-c="0.2 -0.12 0.01" material="color:#fff; shader:flat"></a-triangle>` +
      `<a-plane class="lbl" position="0 ${up ? 0.74 : -0.74} 0" width="2.4" height="0.4"></a-plane>`;
    // data:URL містить «;» — передаємо матеріал обʼєктом, а не рядком
    e.querySelector('.lbl').setAttribute('material', { src: labelTex(label(h.to)), transparent: true, shader: 'flat', opacity: 0.92 });
    e.addEventListener('loaded', () => e.object3D.lookAt(0, p.y, 0));
    const c = e.querySelector('.spot'), l = e.querySelector('.lbl');
    const hl = on => { c.setAttribute('material', 'opacity', on ? 0.8 : 0.5); l.setAttribute('material', 'opacity', on ? 1 : 0.92);
      const s = on ? k * 1.18 : k; e.object3D.scale.set(s, s, s); };
    c.addEventListener('mouseenter', () => hl(true));
    c.addEventListener('mouseleave', () => hl(false));
    c.addEventListener('click', ev => { ev.stopPropagation(); if (!EDIT || !ev.detail.cursorEl || !shiftDown) go(h.to); });
    return e;
  }

  function preload(src) {
    return new Promise((ok, fail) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(src); i.onerror = fail; i.src = src; });
  }

  async function go(id, first) {
    const s = byId[id] || byId[T.start];
    if (busy || (cur && cur.id === s.id)) return;
    busy = true;
    document.body.classList.add('fading');
    await Promise.all([preload(s.image), new Promise(r => setTimeout(r, first ? 0 : 250))]).catch(() => {});
    sky.setAttribute('src', s.image);
    spots.innerHTML = '';
    (s.hotspots || []).forEach((h, i, all) => byId[h.to] && h.to !== s.id && spots.appendChild(spot(h, i, all)));
    rig.setAttribute('rotation', `0 ${-(s.yaw || 0)} 0`);
    const lc = cam.components['look-controls'];
    if (lc) { lc.pitchObject.rotation.x = 0; lc.yawObject.rotation.y = 0; }
    if (zoom()) zoom().reset(true);  // нова кімната — знову загальний план
    cur = s;
    $('title').textContent = `${T.title} · ${s.name}`;
    markRoom();
    if (!first) history.replaceState(null, '', `?${EMBED ? 'embed=1&' : ''}${EDIT ? 'edit=1&' : ''}scene=${s.id}`);
    // наступні кімнати підвантажуємо заздалегідь — перехід миттєвий
    (s.hotspots || []).forEach(h => byId[h.to] && preload(byId[h.to].image).catch(() => {}));
    setTimeout(() => { document.body.classList.remove('fading'); busy = false; }, 120);
    if (EDIT) renderEdit();
  }

  // меню кімнат: поточна підсвічена (aria-current), відкривається з прокруткою до неї
  const rooms = $('rooms'), menuBtn = $('menuBtn');
  function rebuildRooms() {
    rooms.innerHTML = T.scenes.map(s =>
      `<a href="?scene=${s.id}" data-id="${s.id}"><img src="${s.image.replace('.jpg', '-thumb.jpg')}" alt="" loading="lazy" width="76" height="38"><span>${esc(s.name)}</span></a>`).join('');
    markRoom();
  }
  function markRoom() {
    rooms.querySelectorAll('a').forEach(a => { const on = !!cur && a.dataset.id === cur.id; a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const n = $('cnt'), i = cur ? T.scenes.indexOf(cur) : 0;
    if (n) n.textContent = `${i + 1} / ${T.scenes.length}`;
  }
  const menu = open => { rooms.hidden = !open; menuBtn.setAttribute('aria-expanded', open);
    if (open) { const a = rooms.querySelector('a.on'); if (a) a.scrollIntoView({ block: 'nearest' }); } };
  rebuildRooms();
  rooms.addEventListener('click', e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); menu(false); go(a.dataset.id); } });
  menuBtn.addEventListener('click', () => menu(rooms.hidden));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !rooms.hidden) { menu(false); menuBtn.focus(); } });
  setTimeout(() => $('hint').classList.add('gone'), 6000);

  // попередня / наступна кімната — тур можна пройти й без стрілок на фото
  const step = d => { if (!cur) return; const i = T.scenes.indexOf(cur), n = T.scenes.length; go(T.scenes[(i + d + n) % n].id); };
  if (T.scenes.length < 2) $('nav').hidden = true;
  $('prevBtn').addEventListener('click', () => step(-1));
  $('nextBtn').addEventListener('click', () => step(1));

  // ── масштаб: коліщатко / трекпад, два пальці, кнопки + −, подвійний тап або клік — скинути ──
  const zoom = () => cam.components['tour-zoom'];
  cam.setAttribute('tour-zoom', '');
  const canvasReady = f => (sceneEl.canvas ? f(sceneEl.canvas) : sceneEl.addEventListener('render-target-loaded', () => f(sceneEl.canvas)));
  canvasReady(cv => {
    cv.addEventListener('wheel', e => {
      if (!zoom() || sceneEl.is('vr-mode')) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoom().by(Math.exp(Math.max(-120, Math.min(120, dy)) * (e.ctrlKey ? 0.01 : 0.0015)));  // ctrlKey — щипок на трекпаді
    }, { passive: false });
    let pinch = 0, tap = 0, tx = 0, ty = 0, moved = false;
    const dist = t => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
    cv.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinch = dist(e.touches);
        const lc = cam.components['look-controls']; if (lc) lc.touchStarted = false;  // щипок не крутить панораму
      } else if (e.touches.length === 1) { tx = e.touches[0].pageX; ty = e.touches[0].pageY; moved = false; }
    }, { passive: true });
    cv.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch && zoom() && !sceneEl.is('vr-mode')) {
        e.preventDefault(); const d = dist(e.touches); zoom().by(pinch / d); pinch = d;
      } else if (e.touches.length === 1 && Math.hypot(e.touches[0].pageX - tx, e.touches[0].pageY - ty) > 12) moved = true;
    }, { passive: false });
    cv.addEventListener('touchend', e => {
      if (e.touches.length < 2) pinch = 0;
      if (e.touches.length || e.changedTouches.length !== 1 || moved) return;
      const now = Date.now();
      if (now - tap < 320 && zoom()) { zoom().reset(); tap = 0; } else tap = now;
    }, { passive: true });
    cv.addEventListener('dblclick', () => { if (zoom() && !EDIT) zoom().reset(); });
  });
  $('zoomIn').addEventListener('click', () => zoom() && zoom().by(1 / 1.35));
  $('zoomOut').addEventListener('click', () => zoom() && zoom().by(1.35));
  addEventListener('keydown', e => {
    if (!zoom() || /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === '+' || e.key === '=') zoom().by(1 / 1.2); else if (e.key === '-' || e.key === '_') zoom().by(1.2); else if (e.key === '0') zoom().reset();
  });

  // VR: курсор у центрі погляду з наведенням (для окулярів без контролерів)
  sceneEl.addEventListener('enter-vr', () => { const c = $('cursor'); c.setAttribute('visible', true); c.setAttribute('cursor', 'fuse', true); c.setAttribute('cursor', 'fuseTimeout', 1200);
    document.body.classList.add('vr'); });
  sceneEl.addEventListener('exit-vr', () => { const c = $('cursor'); c.setAttribute('visible', false); c.setAttribute('cursor', 'fuse', false);
    document.body.classList.remove('vr'); if (zoom()) zoom().reset(true); });

  // ── режим редагування: клік по фото → новий перехід; Shift+клік по стрілці → видалити ──
  let shiftDown = false;
  addEventListener('keydown', e => { if (e.key === 'Shift') shiftDown = true; });
  addEventListener('keyup', e => { if (e.key === 'Shift') shiftDown = false; });
  function renderEdit() {
    const box = $('edit'); box.hidden = false;
    const opts = T.scenes.filter(s => s.id !== cur.id).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const hs = (cur.hotspots || []).map((h, i) => `<li>→ ${label(h.to)} <button data-del="${i}" title="Видалити">✕</button></li>`).join('') || '<li class="mu">ще немає</li>';
    const idx = T.scenes.indexOf(cur);
    box.innerHTML = `<b>Редагування туру</b>
      <label>Назва туру <input id="eTitle" value="${T.title.replace(/"/g, '&quot;')}"></label>
      <label class="chk"><input type="checkbox" id="eHidden" ${T.hidden ? 'checked' : ''}> Прихований (лише за посиланням)</label>
      <hr><b>Кімната ${idx + 1} з ${T.scenes.length}</b>
      <label>Назва кімнати <input id="eName" value="${cur.name.replace(/"/g, '&quot;')}"></label>
      <div class="row"><button id="eUp" ${idx ? '' : 'disabled'}>▲ Вище</button><button id="eDown" ${idx < T.scenes.length - 1 ? '' : 'disabled'}>▼ Нижче</button></div>
      <button id="eYaw">Цей напрям — стартовий для кімнати</button>
      <button id="eStart">${T.start === cur.id ? '✓ Перша кімната й обкладинка' : 'Зробити першою й обкладинкою'}</button>
      <label>Нова стрілка веде в <select id="eTo">${opts}</select></label>
      <small>Клік по фото — поставити стрілку туди, де двері.</small>
      <ul class="hs">${hs}</ul>
      <hr><div class="row"><button id="eSave" class="pri">Зберегти на сайт</button><button id="eDl">JSON</button></div>
      <span id="eMsg"></span>`;
    $('eTitle').onchange = e => { T.title = e.target.value.trim() || T.title; $('title').textContent = `${T.title} · ${cur.name}`; };
    $('eHidden').onchange = e => { T.hidden = e.target.checked; msg(T.hidden ? 'тур прихований' : 'тур буде в списку /tury'); };
    $('eName').onchange = e => { cur.name = e.target.value.trim() || cur.name; reload(); };
    const move = d => { const i = T.scenes.indexOf(cur), j = i + d; [T.scenes[i], T.scenes[j]] = [T.scenes[j], T.scenes[i]]; rebuildRooms(); renderEdit(); };
    $('eUp').onclick = () => move(-1); $('eDown').onclick = () => move(1);
    $('eYaw').onclick = () => { const r = cam.object3D.rotation, rr = rig.object3D.rotation;
      cur.yaw = +(-((r.y + rr.y) / D2R)).toFixed(1); msg(`стартовий напрям: ${cur.yaw}°`); };
    $('eStart').onclick = () => { T.start = cur.id; renderEdit(); msg('перша кімната й обкладинка змінені'); };
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { cur.hotspots.splice(+b.dataset.del, 1); reload(); });
    $('eDl').onclick = () => { const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(T, null, 1)], { type: 'application/json' })); a.download = T.slug + '.json'; a.click(); };
    $('eSave').onclick = save;
  }
  function reload() { const id = cur.id; cur = null; busy = false; go(id); }
  // збереження через адмінку сайту (/api/admin/repo): коміт у GitHub → перезбірка й деплой за 2–4 хв
  async function save() {
    const path = `tools/tours/tours/${T.slug}.json`, api = '/api/admin/repo';
    msg('зберігаю…');
    try {
      const cur0 = await fetch(`${api}?op=file&path=${encodeURIComponent(path)}`, { credentials: 'same-origin' });
      if (cur0.status === 403) return msg('потрібен вхід адміністратора: /kabinet/admin, потім оновіть сторінку');
      const f = await cur0.json().catch(() => null); if (!f) return msg('адмінка недоступна тут — збережіть кнопкою JSON');
      if (!cur0.ok) return msg(f.error || 'помилка');
      const r = await fetch(api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'save', message: `3D-тур ${T.slug}: правки з редактора`, expect: { [path]: f.sha || null },
          files: [{ path, content: JSON.stringify(T, null, 1) + '\n' }] }) });
      const d = await r.json().catch(() => ({}));
      msg(r.ok ? 'збережено ✓ — на сайті за 2–4 хв' : (d.error || `помилка ${r.status}`));
    } catch (e) { msg('немає звʼязку: ' + e.message); }
  }
  function msg(t) { const m = $('eMsg'); if (m) m.textContent = t; }
  if (EDIT) {
    sky.addEventListener('click', ev => {
      const p = ev.detail.intersection && ev.detail.intersection.point; if (!p || !cur || busy) return;  // подвійний клік: друга подія приходить, поки кімната перезавантажується
      const c = new AFRAME.THREE.Vector3(); sceneEl.camera.getWorldPosition(c);
      const a = angles({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }); (cur.hotspots = cur.hotspots || []).push({ to: $('eTo').value, yaw: a.yaw, pitch: Math.max(-60, Math.min(60, a.pitch)) });
      reload();
    });
    spots.addEventListener('click', ev => {
      const c = ev.target.closest && ev.target.closest('.spot'); if (!c || !shiftDown || !cur) return;
      cur.hotspots.splice(+c.dataset.i, 1); const id = cur.id; cur = null; go(id);
    }, true);
  }

  const start = Q.get('scene');
  if (sceneEl.hasLoaded) go(byId[start] ? start : T.start, true); else sceneEl.addEventListener('loaded', () => go(byId[start] ? start : T.start, true));
})();
