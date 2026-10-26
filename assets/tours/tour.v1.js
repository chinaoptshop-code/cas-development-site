/* CAS 3D-тури: переглядач 360-фото з переходами (A-Frame 1.6, WebXR).
   Дані туру — <script id="tour-data">. Yaw/pitch у градусах: yaw 0 — центр фото, + праворуч; pitch + вгору.
   ?scene=<id> — відкрити кімнату, ?embed=1 — без шапки (для вставки), ?edit=1 — розставити переходи. */
// стрілки завжди навколо голови глядача (у VR камера стоїть на висоті людини)
AFRAME.registerComponent('follow-cam', {
  tick() { const c = this.el.sceneEl.camera; if (c) { c.getWorldPosition(this.el.object3D.position); } }
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

  function spot(h, i) {
    const p = pos(h.yaw, h.pitch);
    const e = document.createElement('a-entity');
    e.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
    e.innerHTML =
      `<a-circle class="spot" data-i="${i}" radius="0.42" material="color:#000; opacity:0.45; shader:flat; transparent:true"></a-circle>` +
      `<a-ring radius-inner="0.36" radius-outer="0.44" material="color:#c8a96a; shader:flat"></a-ring>` +
      `<a-triangle vertex-a="0 0.2 0.01" vertex-b="-0.2 -0.12 0.01" vertex-c="0.2 -0.12 0.01" material="color:#fff; shader:flat"></a-triangle>` +
      `<a-plane class="lbl" position="0 -0.72 0" width="2.4" height="0.4"></a-plane>`;
    // data:URL містить «;» — передаємо матеріал обʼєктом, а не рядком
    e.querySelector('.lbl').setAttribute('material', { src: labelTex(label(h.to)), transparent: true, shader: 'flat' });
    e.addEventListener('loaded', () => e.object3D.lookAt(0, p.y, 0));
    const c = e.querySelector('.spot');
    c.addEventListener('mouseenter', () => c.setAttribute('material', 'opacity', 0.75));
    c.addEventListener('mouseleave', () => c.setAttribute('material', 'opacity', 0.45));
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
    (s.hotspots || []).forEach((h, i) => byId[h.to] && spots.appendChild(spot(h, i)));
    rig.setAttribute('rotation', `0 ${-(s.yaw || 0)} 0`);
    const lc = cam.components['look-controls'];
    if (lc) { lc.pitchObject.rotation.x = 0; lc.yawObject.rotation.y = 0; }
    cur = s;
    $('title').textContent = `${T.title} · ${s.name}`;
    document.querySelectorAll('.rooms a').forEach(a => a.classList.toggle('on', a.dataset.id === s.id));
    if (!first) history.replaceState(null, '', `?${EMBED ? 'embed=1&' : ''}${EDIT ? 'edit=1&' : ''}scene=${s.id}`);
    // наступні кімнати підвантажуємо заздалегідь — перехід миттєвий
    (s.hotspots || []).forEach(h => byId[h.to] && preload(byId[h.to].image).catch(() => {}));
    setTimeout(() => { document.body.classList.remove('fading'); busy = false; }, 120);
    if (EDIT) renderEdit();
  }

  // меню кімнат
  const rooms = $('rooms');
  rooms.innerHTML = T.scenes.map(s =>
    `<a href="?scene=${s.id}" data-id="${s.id}"><img src="${s.image.replace('.jpg', '-thumb.jpg')}" alt="" loading="lazy"><span>${s.name}</span></a>`).join('');
  rooms.addEventListener('click', e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); rooms.hidden = true; go(a.dataset.id); } });
  $('menuBtn').addEventListener('click', () => { rooms.hidden = !rooms.hidden; });
  setTimeout(() => $('hint').classList.add('gone'), 5000);

  // VR: курсор у центрі погляду з наведенням (для окулярів без контролерів)
  sceneEl.addEventListener('enter-vr', () => { const c = $('cursor'); c.setAttribute('visible', true); c.setAttribute('cursor', 'fuse', true); c.setAttribute('cursor', 'fuseTimeout', 1200); });
  sceneEl.addEventListener('exit-vr', () => { const c = $('cursor'); c.setAttribute('visible', false); c.setAttribute('cursor', 'fuse', false); });

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
  function rebuildRooms() {
    rooms.innerHTML = T.scenes.map(s =>
      `<a href="?scene=${s.id}" data-id="${s.id}"><img src="${s.image.replace('.jpg', '-thumb.jpg')}" alt="" loading="lazy"><span>${s.name}</span></a>`).join('');
  }
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
      const p = ev.detail.intersection && ev.detail.intersection.point; if (!p) return;
      const c = new AFRAME.THREE.Vector3(); sceneEl.camera.getWorldPosition(c);
      const a = angles({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }); (cur.hotspots = cur.hotspots || []).push({ to: $('eTo').value, yaw: a.yaw, pitch: Math.max(-60, Math.min(60, a.pitch)) });
      reload();
    });
    spots.addEventListener('click', ev => {
      const c = ev.target.closest && ev.target.closest('.spot'); if (!c || !shiftDown) return;
      cur.hotspots.splice(+c.dataset.i, 1); const id = cur.id; cur = null; go(id);
    }, true);
  }

  const start = Q.get('scene');
  if (sceneEl.hasLoaded) go(byId[start] ? start : T.start, true); else sceneEl.addEventListener('loaded', () => go(byId[start] ? start : T.start, true));
})();
