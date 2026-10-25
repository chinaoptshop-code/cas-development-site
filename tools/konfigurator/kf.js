/* CAS Development — конфігуратор інтерʼєру (/konfigurator, /ru/konfigurator).
   Фото реальних проєктів + маски зон → WebGL-шейдер перефарбовує зону зі збереженням світлотіні фото
   (яскравість оригіналу / середня яскравість зони), текстури — процедурні тайли з перспективою площини.
   Джерело: tools/konfigurator/kf.js, збірка: python3 tools/konfigurator/page.py (додає KF = {cfg, scene, sw}). */
(function () {
  'use strict';
  var d = document, W = window;
  var LANG = d.documentElement.lang === 'ru' ? 'ru' : 'uk';
  var C = KF.cfg, SC = KF.scene, SW = KF.sw, B = '/assets/konfigurator/';
  var RM = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TX = {
    uk: { orig: 'Як у проєкті', share: 'Посилання скопійовано', shared: 'Поділитися конфігурацією', saved: 'Картинку збережено',
      nogl: 'Ваш браузер не показує WebGL — перемикання недоступне, але ви можете обрати матеріали й надіслати заявку.',
      msg: 'Конфігуратор інтерʼєру', room: 'Кімната', style: 'Стиль', own: 'власна добірка', link: 'Посилання', before: 'до', after: 'після',
      loading: 'Завантажуємо', split: 'Порівняння до і після', mat: 'Матеріал', pick: 'Оберіть', zone: 'зона' },
    ru: { orig: 'Как в проекте', share: 'Ссылка скопирована', shared: 'Поделиться конфигурацией', saved: 'Картинка сохранена',
      nogl: 'Ваш браузер не показывает WebGL — переключение недоступно, но вы можете выбрать материалы и отправить заявку.',
      msg: 'Конфигуратор интерьера', room: 'Комната', style: 'Стиль', own: 'своя подборка', link: 'Ссылка', before: 'до', after: 'после',
      loading: 'Загружаем', split: 'Сравнение до и после', mat: 'Материал', pick: 'Выберите', zone: 'зона' }
  }[LANG];
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var ROOMS = Object.keys(C.rooms);
  var name = function (o) { return o[LANG] || o.uk; };
  var hex = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); };
  var lin = function (c) { return c.map(function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); };

  // ── стан ──────────────────────────────────────────────────────────────
  var st = { room: 'living', zone: {}, sel: {}, preset: {}, eve: 0, split: -1, pan: {} };
  ROOMS.forEach(function (r) { st.sel[r] = {}; st.preset[r] = null; st.zone[r] = SC[r].zones[0].id; st.pan[r] = C.rooms[r].focus; });

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === 'zayavka') return;
    var q = new URLSearchParams(h), r = q.get('room');
    if (r && C.rooms[r]) st.room = r;
    var p = q.get('style');
    if (p && C.presets[p]) applyPreset(p, true);
    SC[st.room].zones.forEach(function (z) {
      var v = q.get(z.id);
      if (v === 'orig') delete st.sel[st.room][z.id];
      else if (v && C.mat[v]) st.sel[st.room][z.id] = v;
    });
    if (q.get('light') === 'eve') st.eve = 1;
  }
  function hashOf() {
    var q = new URLSearchParams();
    q.set('room', st.room);
    var p = st.preset[st.room];
    if (p) q.set('style', p);
    SC[st.room].zones.forEach(function (z) {
      var v = st.sel[st.room][z.id];
      if (p) { var pv = C.presets[p][st.room][z.id]; if (v !== pv) q.set(z.id, v || 'orig'); }
      else if (v) q.set(z.id, v);
    });
    if (st.eve) q.set('light', 'eve');
    return '#' + q.toString();
  }
  var hashTimer;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () { try { history.replaceState(null, '', hashOf()); } catch (e) {} }, 150);
  }

  // ── WebGL ─────────────────────────────────────────────────────────────
  var cv = $('#kfCv'), stage = $('#kfStage'), poster = $('#kfPoster');
  var gl = null, prog, U = {}, NT = 0, texCache = {}, room = {}, prevTex, ready = false, aniso;
  try { gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false, preserveDrawingBuffer: false }); } catch (e) {}

  var VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  function fs(nt) {
    var s = 'precision highp float;varying vec2 vUv;uniform sampler2D uPhoto,uMask,uSmooth,uPrev;';
    for (var i = 0; i < nt; i++) s += 'uniform sampler2D uT' + i + ';';
    s += 'uniform vec4 uView;uniform vec2 uImg,uRes;uniform vec4 uCam,uCam2;uniform float uOn[8],uKind[8];uniform vec3 uC1[8],uC2[8];' +
      'uniform vec4 uP[8],uQ[8];uniform float uEve,uSplit,uHi,uHiA;uniform vec3 uRev;' +
      'vec3 L2(vec3 c){return pow(c,vec3(2.2));}' +
      'vec2 puv(float t,float hh,vec2 p){' +
      ' if(t<.5)return (p-uCam.xy)*uCam2.x/uCam.z;' +
      ' if(t<1.5){float dy=max(p.y-uCam.y,2.);float Z=uCam.z*hh/dy;return vec2(Z,(p.x-uCam.x)*Z/uCam.z);}' +
      ' float dx=p.x-uCam.x;float X=dx<0.?uCam2.y:uCam2.z;float Z=uCam.z*X/max(abs(dx),2.);return vec2(Z,(p.y-uCam.y)*Z/uCam.z);}' +
      'void main(){vec2 u=uView.zw+vUv*uView.xy;vec2 px=u*uImg;' +
      'vec3 ph=texture2D(uPhoto,u).rgb;vec3 o=L2(ph);float L=dot(o,vec3(.2126,.7152,.0722));' +
      'float Ls=pow(texture2D(uSmooth,u).r,2.2);' +
      'vec3 mA=texture2D(uMask,vec2(u.x,u.y/3.)).rgb,mB=texture2D(uMask,vec2(u.x,(u.y+1.)/3.)).rgb,mC=texture2D(uMask,vec2(u.x,(u.y+2.)/3.)).rgb;' +
      'float m[8];m[0]=mA.r;m[1]=mA.g;m[2]=mA.b;m[3]=mB.r;m[4]=mB.g;m[5]=mB.b;m[6]=mC.r;m[7]=mC.b;' +
      'vec3 col=o;float hm=0.;vec4 tx;';
    for (var k = 0; k < 8; k++) {
      var tex = k < nt ? 'tx=texture2D(uT' + k + ',puv(uQ[' + k + '].x,uQ[' + k + '].z,px)/uQ[' + k + '].y);' : 'tx=vec4(0.,.5,0.,1.);';
      s += 'if(uHi==' + k + '.)hm=m[' + k + '];' +
        'if(uOn[' + k + ']>.5&&m[' + k + ']>.002){' + tex +
        'float Lz=mix(Ls,L,uP[' + k + '].x);float sh=min(Lz/uQ[' + k + '].w,2.4);vec3 a=uC1[' + k + '];float kd=uKind[' + k + '];' +
        'if(kd>1.5&&kd<2.5)a=mix(uC1[' + k + '],uC2[' + k + '],tx.r)*(.7+.6*tx.g);' +
        'else if(kd>2.5&&kd<3.5)a=uC1[' + k + ']*(.62+.76*tx.g);vec3 c;' +
        'if(kd>3.5)c=a*(.3+.7*pow(sh,1.25))*uP[' + k + '].y+a*vec3(max(L-uQ[' + k + '].w*1.1,0.))*1.6;' +
        'else c=a*pow(sh,1.+uP[' + k + '].w)*uP[' + k + '].y+vec3(max(Lz-uQ[' + k + '].w*1.25,0.))*uP[' + k + '].z;' +
        'col=mix(col,c,m[' + k + ']);}';
    }
    s += 'if(vUv.x<uSplit)col=o;' +
      'float lo=dot(ph,vec3(.299,.587,.114));vec3 ev=col*vec3(1.03,.8,.58)*(.42+.95*smoothstep(.32,.97,lo));' +
      'col=mix(col,ev,uEve);col+=col*hm*uHiA*.22+vec3(.02,.016,.01)*hm*uHiA;' +
      'vec3 fc=pow(clamp(col,0.,1.),vec3(1./2.2));' +
      'if(uRev.z>-.5){vec2 q=gl_FragCoord.xy/uRes;vec2 dd=(vUv-uRev.xy)*vec2(uRes.x/uRes.y,1.);float t=smoothstep(uRev.z-.12,uRev.z,length(dd));' +
      'fc=mix(fc,texture2D(uPrev,q).rgb,t);}' +
      'gl_FragColor=vec4(fc,1.);}';
    return s;
  }
  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function initGL() {
    var units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    NT = Math.max(0, Math.min(7, units - 4));
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs(NT)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uPhoto', 'uMask', 'uSmooth', 'uPrev', 'uView', 'uImg', 'uRes', 'uCam', 'uCam2', 'uOn', 'uKind', 'uC1', 'uC2', 'uP', 'uQ', 'uEve', 'uSplit', 'uHi', 'uHiA', 'uRev']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uPhoto, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uSmooth, 2); gl.uniform1i(U.uPrev, 3);
    for (var i = 0; i < NT; i++) gl.uniform1i(gl.getUniformLocation(prog, 'uT' + i), 4 + i);
    aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    prevTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, prevTex); texParams(false);
  }
  function texParams(rep) {
    var T = gl.TEXTURE_2D;
    gl.texParameteri(T, gl.TEXTURE_WRAP_S, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(T, gl.TEXTURE_WRAP_T, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(T, gl.TEXTURE_MIN_FILTER, rep ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(T, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  function upload(img, rep) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    texParams(rep);
    if (rep) { gl.generateMipmap(gl.TEXTURE_2D); if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); }
    return t;
  }
  function loadImg(src) {
    return new Promise(function (ok, no) {
      var i = new Image(); i.decoding = 'async'; i.onload = function () { ok(i); }; i.onerror = no; i.src = src;
    });
  }
  function getTex(n) {
    if (!texCache[n]) texCache[n] = loadImg(B + 'tex/' + n + '.webp?v=' + KF.v).then(function (i) { gl.activeTexture(gl.TEXTURE0 + 4); return upload(i, true); });
    return texCache[n];
  }

  // ── кімнати ───────────────────────────────────────────────────────────
  var roomCache = {};
  function loadRoom(r) {
    if (roomCache[r]) return roomCache[r];
    var big = stage.clientWidth * Math.min(2, W.devicePixelRatio || 1) > 1100 && SC[r].hi;
    var ph = r === 'living' && poster && poster.complete && poster.naturalWidth && (!big || poster.currentSrc.indexOf('1800') > 0)
      ? Promise.resolve(poster) : loadImg(B + r + (big ? '-1800' : '-900') + '.webp?v=' + KF.v);
    roomCache[r] = Promise.all([ph, loadImg(B + r + '-m.webp?v=' + KF.v), loadImg(B + r + '-s.webp?v=' + KF.v)]).then(function (a) {
      var o = { img: a[0] };
      if (gl) {
        gl.activeTexture(gl.TEXTURE0); o.photo = upload(a[0], false);
        gl.activeTexture(gl.TEXTURE1); o.mask = upload(a[1], false);
        gl.activeTexture(gl.TEXTURE2); o.smooth = upload(a[2], false);
      }
      // маски для «натисни на предмет»: CPU-копія атласу
      try {
        var c = d.createElement('canvas'); c.width = a[1].naturalWidth; c.height = a[1].naturalHeight;
        var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(a[1], 0, 0);
        o.hit = x.getImageData(0, 0, c.width, c.height).data; o.hw = c.width; o.hh = c.height / 3;
      } catch (e) {}
      return o;
    });
    return roomCache[r];
  }
  function zoneAt(r, ux, uy) {
    var o = room[r]; if (!o || !o.hit) return -1;
    var x = Math.min(o.hw - 1, Math.max(0, Math.round(ux * o.hw))), y = Math.min(o.hh - 1, Math.max(0, Math.round(uy * o.hh)));
    var best = -1, bv = 110, zs = SC[r].zones;
    for (var i = 0; i < zs.length; i++) {
      var tile = i < 6 ? Math.floor(i / 3) : 2, ch = i < 6 ? i % 3 : (i === 6 ? 0 : 2);
      var v = o.hit[((tile * o.hh + y) * o.hw + x) * 4 + ch];
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }

  // ── відображення (cover + панорамування) ─────────────────────────────
  var view = [1, 1, 0, 0];
  function layout() {
    var dpr = Math.min(2, W.devicePixelRatio || 1);
    var w = stage.clientWidth, h = stage.clientHeight;
    var maxPx = 2.6e6, k = Math.min(dpr, Math.sqrt(maxPx / (w * h)));
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var r = SC[st.room], ia = r.w / r.h, sa = w / h;
    var fx = Math.min(1, sa / ia), fy = Math.min(1, ia / sa);
    var px = st.pan[st.room];
    view = [fx, fy, (1 - fx) * px, (1 - fy) * 0.5];
    stage.classList.toggle('kf-pan', fx < 0.98);
    if (poster) { poster.style.objectPosition = (px * 100) + '% 50%'; }
  }

  var anim = { rev: -1, revC: [0.5, 0.5], eve: st.eve, hi: -1, hiA: 0 };
  function setUniforms() {
    var r = SC[st.room], cr = C.rooms[st.room], cam = cr.cam;
    gl.uniform4f(U.uView, view[0], view[1], view[2], view[3]);
    gl.uniform2f(U.uImg, r.w, r.h); gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform4f(U.uCam, cam.vx, cam.vy, cam.f, cam.h); gl.uniform4f(U.uCam2, cam.d, cam.xl || 1.6, cam.xr || 1.6, 0);
    var on = [], kind = [], c1 = [], c2 = [], P = [], Q = [];
    for (var i = 0; i < 8; i++) {
      var z = r.zones[i], zc = z && cr.zones[z.id], id = z && st.sel[st.room][z.id], m = id && C.mat[id];
      var texOk = m && m.t && i < NT && room[st.room] && room[st.room].tex && room[st.room].tex[i];
      on.push(m ? 1 : 0);
      var k = !m ? 0 : m.kind === 'paint' ? 1 : m.kind === 'tex' ? (texOk ? 2 : 1) : m.kind === 'fabric' ? (texOk ? 3 : 1) : 4;
      kind.push(k);
      var a = m ? lin(hex(m.c || m.c1)) : [0, 0, 0], b = m ? lin(hex(m.c2 || m.c || m.c1)) : [0, 0, 0];
      if (m && k === 1 && m.kind === 'tex') a = a.map(function (v, j) { return (v + b[j]) / 2; });
      c1.push(a[0], a[1], a[2]); c2.push(b[0], b[1], b[2]);
      var sc = m && m.t ? C.tex[m.t] : 1;
      P.push(zc ? (m && m.kind === 'metal' ? 1 : zc.det) : 0, zc ? zc.e : 1, m ? (m.gl || 0) : 0, m ? (m.sh || 0) : 0);
      var pl = zc ? { back: 0, floor: 1, side: 2 }[zc.plane] : 0;
      Q.push(pl, sc, zc && zc.h ? zc.h : cam.h, z ? Math.max(0.004, z.mean) : 1);
      if (texOk) { gl.activeTexture(gl.TEXTURE4 + i); gl.bindTexture(gl.TEXTURE_2D, room[st.room].tex[i]); }
    }
    gl.uniform1fv(U.uOn, on); gl.uniform1fv(U.uKind, kind); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2);
    gl.uniform4fv(U.uP, P); gl.uniform4fv(U.uQ, Q);
    gl.uniform1f(U.uEve, anim.eve); gl.uniform1f(U.uSplit, st.split);
    gl.uniform1f(U.uHi, anim.hi); gl.uniform1f(U.uHiA, anim.hiA);
    gl.uniform3f(U.uRev, anim.revC[0], anim.revC[1], anim.rev);
  }
  function draw() {
    if (!gl || !ready || !room[st.room]) return;
    var o = room[st.room];
    gl.viewport(0, 0, cv.width, cv.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.photo);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.mask);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, o.smooth);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, prevTex);
    setUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function snapshot() {  // поточний кадр → текстура для кросфейду
    if (!gl || !ready) return;
    anim.rev = -1; draw();
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, cv.width, cv.height, 0);
  }
  var raf = 0, tasks = [];
  function tween(dur, fn, done) {
    if (RM) { fn(1); if (done) done(); draw(); return; }
    var t0 = performance.now();
    tasks.push(function (now) { var t = Math.min(1, (now - t0) / dur); fn(t); if (t >= 1) { if (done) done(); return false; } return true; });
    loop();
  }
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(function step(now) {
      tasks = tasks.filter(function (f) { return f(now); });
      draw();
      raf = tasks.length ? requestAnimationFrame(step) : 0;
    });
  }
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function reveal(cx, cy) {   // хвиля нового матеріалу з центру зони
    if (!ready) return;
    anim.revC = [cx, cy];
    var asp = cv.width / cv.height, far = 0;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (p) { far = Math.max(far, Math.hypot((p[0] - cx) * asp, p[1] - cy)); });
    var rid = {};
    anim.revId = rid;
    tween(720, function (t) { if (anim.revId === rid) anim.rev = ease(t) * (far + 0.14); }, function () { if (anim.revId === rid) anim.rev = -1; });
  }
  function zoneCenter(zi) {  // центр зони в координатах полотна
    var z = SC[st.room].zones[zi]; if (!z) return [0.5, 0.5];
    return [Math.min(1, Math.max(0, (z.cx - view[2]) / view[0])), Math.min(1, Math.max(0, (z.cy - view[3]) / view[1]))];
  }
  function ensureTex() {   // текстури для поточних матеріалів кімнати
    if (!gl) return Promise.resolve();
    var r = st.room, o = room[r]; if (!o) return Promise.resolve();
    o.tex = o.tex || [];
    var jobs = SC[r].zones.map(function (z, i) {
      var m = C.mat[st.sel[r][z.id]];
      if (!m || !m.t || i >= NT) { o.tex[i] = null; return null; }
      return getTex(m.t).then(function (t) { o.tex[i] = t; });
    });
    return Promise.all(jobs);
  }

  // ── зміни стану ───────────────────────────────────────────────────────
  function change(fn, zi) {
    snapshot();
    fn();
    var c = zi == null ? [0.5, 0.5] : zoneCenter(zi);
    stage.classList.add('kf-busy');
    ensureTex().then(function () { stage.classList.remove('kf-busy'); reveal(c[0], c[1]); draw(); });
    renderUI(); writeHash();
  }
  function setMat(zid, mid) {
    var zi = SC[st.room].zones.findIndex(function (z) { return z.id === zid; });
    change(function () {
      if (mid) st.sel[st.room][zid] = mid; else delete st.sel[st.room][zid];
      st.preset[st.room] = matchPreset();
    }, zi);
    pulse(zi);
  }
  function matchPreset() {
    var r = st.room;
    return Object.keys(C.presets).find(function (p) {
      var ps = C.presets[p][r];
      return SC[r].zones.every(function (z) { return ps[z.id] === st.sel[r][z.id]; });
    }) || null;
  }
  function applyPreset(p, silent) {
    var f = function () {
      var r = st.room; st.sel[r] = {};
      if (p) Object.keys(C.presets[p][r]).forEach(function (z) { st.sel[r][z] = C.presets[p][r][z]; });
      st.preset[r] = p;
    };
    if (silent) return f();
    change(f, null);
  }
  function setRoom(r) {
    if (r === st.room || !C.rooms[r]) return;
    stage.classList.add('kf-busy');
    loadRoom(r).then(function (o) {
      snapshot();
      room[r] = o; st.room = r; layout();
      return ensureTex();
    }).then(function () {
      stage.classList.remove('kf-busy'); reveal(0.5, 0.5); renderUI(); writeHash();
      if (!gl) showPoster();
    });
  }
  function showPoster() {  // без WebGL: просто фото кімнати
    var o = room[st.room]; if (o && poster) { poster.removeAttribute('srcset'); poster.src = o.img.src; poster.alt = name({ uk: C.rooms[st.room].alt_uk, ru: C.rooms[st.room].alt_ru }); }
  }
  var hiTimer;
  function pulse(zi) {
    if (zi < 0) return;
    anim.hi = zi; clearTimeout(hiTimer);
    tween(260, function (t) { anim.hiA = t; }, function () {
      hiTimer = setTimeout(function () { tween(420, function (t) { anim.hiA = 1 - t; }, function () { anim.hi = -1; }); }, 220);
    });
  }

  // ── інтерфейс ─────────────────────────────────────────────────────────
  var elRooms = $('#kfRooms'), elZones = $('#kfZones'), elSw = $('#kfSw'), elPs = $('#kfPresets'), elSum = $('#kfSum'), elCur = $('#kfCur');
  function swStyle(id) {
    var i = SW.ids.indexOf(id), n = SW.cols, c = i % n, r = Math.floor(i / n);
    return 'background-image:url(' + B + 'sw.webp?v=' + KF.v + ');background-size:' + (n * 100) + '% ' + (SW.rows * 100) + '%;background-position:' +
      (n > 1 ? c / (n - 1) * 100 : 0) + '% ' + (SW.rows > 1 ? r / (SW.rows - 1) * 100 : 0) + '%';
  }
  function origStyle(z) {
    var r = SC[st.room], k = 5;
    return 'background-image:url(' + B + st.room + '-900.webp?v=' + KF.v + ');background-size:' + (k * 100) + '% auto;background-position:' +
      (z.cx * 100) + '% ' + (z.cy * 100) + '%';
  }
  function renderUI() {
    var r = st.room, cr = C.rooms[r], zs = SC[r].zones, cur = st.zone[r];
    $$('button', elRooms).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.room === r ? 'true' : 'false'); });
    elZones.innerHTML = zs.map(function (z, i) {
      var on = z.id === cur;
      return '<button type="button" role="tab" id="kfz-' + z.id + '" aria-controls="kfSw" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-z="' + z.id + '">' +
        name(cr.zones[z.id]) + (st.sel[r][z.id] ? '<i aria-hidden="true"></i>' : '') + '</button>';
    }).join('');
    elSw.setAttribute('aria-labelledby', 'kfz-' + cur);
    var zc = cr.zones[cur], sel = st.sel[r][cur] || '', zone = zs.find(function (z) { return z.id === cur; });
    var opts = zc.opts.slice(); if (sel && opts.indexOf(sel) < 0) opts.unshift(sel);
    elSw.innerHTML = [''].concat(opts).map(function (id, i) {
      var on = id === sel, nm = id ? name(C.mat[id]) : TX.orig;
      return '<button type="button" class="sw" aria-pressed="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-m="' + id + '" aria-label="' + nm + '" title="' + nm + '">' +
        '<span class="sw-i" style="' + (id ? swStyle(id) : origStyle(zone)) + '"></span><span class="sw-n">' + nm + '</span></button>';
    }).join('');
    if (elCur) elCur.textContent = sel ? name(C.mat[sel]) : TX.orig;
    $$('button', elPs).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.p === st.preset[r] ? 'true' : 'false'); });
    elSum.innerHTML = zs.map(function (z) {
      var id = st.sel[r][z.id];
      return '<li><span>' + name(cr.zones[z.id]) + '</span><b>' + (id ? name(C.mat[id]) : TX.orig) + '</b></li>';
    }).join('');
    $('#kfEve').setAttribute('aria-pressed', st.eve ? 'true' : 'false');
    $('#kfBA').setAttribute('aria-pressed', st.split >= 0 ? 'true' : 'false');
    var p = st.preset[r]; $('#kfStyleName').textContent = p ? name(C.presets[p]) : TX.own;
  }
  function presetsUI() {
    elPs.innerHTML = Object.keys(C.presets).map(function (p) {
      var ps = C.presets[p], dots = ['wall', 'floor', 'sofa', 'table'].map(function (z) { return '<span style="' + swStyle(ps.living[z]) + '"></span>'; }).join('');
      return '<button type="button" class="ps" data-p="' + p + '" aria-pressed="false"><span class="ps-d" aria-hidden="true">' + dots + '</span>' +
        '<b>' + name(ps) + '</b><small>' + (LANG === 'ru' ? ps.d_ru : ps.d_uk) + '</small></button>';
    }).join('');
  }
  function roving(box, sel, horiz) {  // стрілки ←→ (↑↓) між кнопками групи
    box.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -99, End: 99 };
      if (!(e.key in keys)) return;
      var bs = $$(sel, box), i = bs.indexOf(d.activeElement); if (i < 0) return;
      e.preventDefault();
      var k = keys[e.key], j = k === -99 ? 0 : k === 99 ? bs.length - 1 : (i + k + bs.length) % bs.length;
      bs.forEach(function (b, n) { b.tabIndex = n === j ? 0 : -1; });
      bs[j].focus();
      if (horiz === 'tab') bs[j].click();
    });
  }

  elRooms.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setRoom(b.dataset.room); });
  elZones.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    st.zone[st.room] = b.dataset.z; renderUI();
    var zi = SC[st.room].zones.findIndex(function (z) { return z.id === b.dataset.z; });
    pulse(zi); $('#kfz-' + b.dataset.z).focus();
  });
  elSw.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setMat(st.zone[st.room], b.dataset.m || null);
    var f = elSw.querySelector('[data-m="' + (b.dataset.m || '') + '"]'); if (f) f.focus({ preventScroll: true });
  });
  elPs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) applyPreset(b.dataset.p === st.preset[st.room] ? null : b.dataset.p); });
  roving(elZones, 'button', 'tab'); roving(elSw, 'button'); roving(elRooms, 'button');
  $('#kfReset').addEventListener('click', function () { applyPreset(null); });

  // день / вечір
  $('#kfEve').addEventListener('click', function () {
    st.eve = st.eve ? 0 : 1; var a = anim.eve, b = st.eve;
    tween(700, function (t) { anim.eve = a + (b - a) * ease(t); });
    renderUI(); writeHash();
  });
  // до / після
  var handle = $('#kfSplit');
  function setSplit(v) {
    st.split = v; handle.hidden = v < 0;
    if (v >= 0) { handle.style.left = (v * 100) + '%'; handle.setAttribute('aria-valuenow', Math.round(v * 100)); }
    draw();
  }
  $('#kfBA').addEventListener('click', function () {
    if (st.split >= 0) { setSplit(-1); renderUI(); return; }
    setSplit(0.5); renderUI();
    if (!RM) { var t0 = 0.5; tween(900, function (t) { setSplit(t0 + Math.sin(t * Math.PI * 2) * 0.18 * (1 - t)); }); }
    handle.focus({ preventScroll: true });
  });
  handle.addEventListener('keydown', function (e) {
    var k = { ArrowLeft: -0.05, ArrowRight: 0.05, Home: -1, End: 1 }[e.key]; if (k == null) return;
    e.preventDefault(); setSplit(Math.min(0.98, Math.max(0.02, st.split + k)));
  });
  handle.addEventListener('pointerdown', function (e) {
    e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
    var mv = function (ev) { var rc = stage.getBoundingClientRect(); setSplit(Math.min(0.98, Math.max(0.02, (ev.clientX - rc.left) / rc.width))); };
    var up = function () { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });

  // натиснути на предмет у сцені → обрати зону; тягнути → панорама (на вузькому екрані)
  var tip = $('#kfTip'), drag = null;
  function canvasToImg(e) {
    var rc = cv.getBoundingClientRect();
    var x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height;
    return [view[2] + x * view[0], view[3] + y * view[1], x, y];
  }
  cv.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, pan: st.pan[st.room], moved: false, id: e.pointerId };
  });
  cv.addEventListener('pointermove', function (e) {
    if (drag && e.pointerId === drag.id) {
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved && view[0] < 0.98) {
        try { cv.setPointerCapture(e.pointerId); } catch (x) {}
        var span = cv.getBoundingClientRect().width / view[0] * (1 - view[0]);
        st.pan[st.room] = Math.min(1, Math.max(0, drag.pan - dx / span)); layout(); draw();
        stage.classList.add('kf-panned');
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    var p = canvasToImg(e), zi = zoneAt(st.room, p[0], p[1]);
    if (zi !== anim.hiHover) {
      anim.hiHover = zi;
      if (zi >= 0) { anim.hi = zi; anim.hiA = 0.55; tip.textContent = name(C.rooms[st.room].zones[SC[st.room].zones[zi].id]); tip.hidden = false; }
      else { anim.hiA = 0; tip.hidden = true; }
      cv.style.cursor = zi >= 0 ? 'pointer' : '';
      draw();
    }
    if (zi >= 0) { var rc = stage.getBoundingClientRect(); tip.style.transform = 'translate(' + (e.clientX - rc.left + 14) + 'px,' + (e.clientY - rc.top + 16) + 'px)'; }
  });
  cv.addEventListener('pointerleave', function () { anim.hiHover = -1; tip.hidden = true; if (anim.hiA) { anim.hiA = 0; draw(); } });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var was = drag; drag = null;
    if (was.moved || e.type === 'pointercancel') return;
    var p = canvasToImg(e), zi = zoneAt(st.room, p[0], p[1]);
    if (zi >= 0) {
      st.zone[st.room] = SC[st.room].zones[zi].id; renderUI(); pulse(zi);
      sheet(true, 'peek');
      var b = elSw.querySelector('[aria-pressed="true"]'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: RM ? 'auto' : 'smooth' });
    }
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  // поділитися
  var toastEl = $('#kfToast'), toastT;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600); }
  function shareUrl() { return location.origin + location.pathname + hashOf(); }
  $('#kfShare').addEventListener('click', function () {
    var u = shareUrl(); try { history.replaceState(null, '', hashOf()); } catch (e) {}
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { navigator.share({ title: d.title, url: u }).catch(function () {}); return; }
    var done = function () { toast(TX.share); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done, function () { prompt(TX.shared, u); });
    else prompt(TX.shared, u);
  });
  // зберегти картинку: повний кадр фото + підпис
  function render(full) {   // знімок поточного стану (без до/після) у 2D-полотно
    var r = SC[st.room], o = room[st.room];
    var w = full ? o.img.naturalWidth : 640, h = Math.round(w * r.h / r.w);
    var keep = [cv.width, cv.height, view.slice(), st.split, anim.hiA, anim.rev];
    cv.width = w; cv.height = h; view = [1, 1, 0, 0]; st.split = -1; anim.hiA = 0; anim.rev = -1;
    draw();
    var c = d.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(cv, 0, 0);
    cv.width = keep[0]; cv.height = keep[1]; view = keep[2]; st.split = keep[3]; anim.hiA = keep[4]; anim.rev = keep[5];
    draw();
    return { c: c, x: x, w: w, h: h };
  }
  $('#kfSave').addEventListener('click', function () {
    if (!gl || !ready) return;
    var s = render(true), x = s.x, w = s.w, h = s.h, f = Math.round(w / 60);
    var g = x.createLinearGradient(0, h - f * 4, 0, h); g.addColorStop(0, 'rgba(8,7,9,0)'); g.addColorStop(1, 'rgba(8,7,9,.6)');
    x.fillStyle = g; x.fillRect(0, h - f * 4, w, f * 4);
    x.fillStyle = '#EDE8DF'; x.font = '600 ' + f + 'px Manrope, system-ui, sans-serif'; x.textBaseline = 'bottom';
    var p = st.preset[st.room];
    x.fillText('CAS Development · ' + name(C.rooms[st.room]) + (p ? ' · ' + name(C.presets[p]) : ''), f * 1.4, h - f * 1.2);
    x.textAlign = 'right'; x.fillStyle = '#BF9148'; x.fillText('cas-develop.com/' + (LANG === 'ru' ? 'ru/' : '') + 'konfigurator', w - f * 1.4, h - f * 1.2);
    s.c.toBlob(function (b) {
      var a = d.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cas-' + st.room + (p ? '-' + p : '') + '.png';
      d.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast(TX.saved);
    }, 'image/png');
  });

  // заявка: обраний стиль і матеріали → коментар форми
  var dlg = $('#zayavka');
  function summary() {
    var r = st.room, cr = C.rooms[r], p = st.preset[r];
    var lines = [TX.msg + ' — ' + TX.room + ': ' + name(cr) + '; ' + TX.style + ': ' + (p ? name(C.presets[p]) : TX.own) + (st.eve ? ' (вечір)'.replace('вечір', LANG === 'ru' ? 'вечер' : 'вечір') : '') + '.'];
    SC[r].zones.forEach(function (z) { var id = st.sel[r][z.id]; lines.push('• ' + name(cr.zones[z.id]) + ': ' + (id ? name(C.mat[id]) : TX.orig)); });
    lines.push(TX.link + ': ' + shareUrl());
    return lines.join('\n');
  }
  function openForm() {
    var m = $('#oMsg'); if (m) m.value = summary();
    var pv = $('#kfPrev');
    if (pv && gl && ready) { try { pv.src = render(false).c.toDataURL('image/jpeg', 0.86); pv.hidden = false; } catch (e) {} }
    var sn = $('#kfDlgStyle'); if (sn) { var p = st.preset[st.room]; sn.textContent = name(C.rooms[st.room]) + ' · ' + (p ? name(C.presets[p]) : TX.own); }
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    var n = $('#oName'); if (n) setTimeout(function () { n.focus(); }, 30);
  }
  $$('[data-kf-form]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openForm(); }); });
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#zayavka"]');
    if (a && a.getAttribute('href').replace(/^.*#/, '#') === '#zayavka' && (a.pathname === location.pathname || a.getAttribute('href') === '#zayavka')) { e.preventDefault(); openForm(); }
  });
  $('#kfDlgX').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg.close) dlg.close(); });

  // мобільний нижній лист: ручка (тап / свайп), «видно» лише поки сцена на екрані
  var panel = $('#kfPanel'), grab = $('#kfGrab');
  function sheet(open, mode) {
    if (!matchMedia('(max-width: 860px)').matches) return;
    if (mode === 'peek') { panel.classList.remove('kf-full'); grab.setAttribute('aria-expanded', 'false'); return; }
    panel.classList.toggle('kf-full', open); grab.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  grab.addEventListener('click', function () { if (grab._drag) return; sheet(!panel.classList.contains('kf-full')); });
  var gy = null;
  grab.addEventListener('pointerdown', function (e) { gy = { y: e.clientY, t: Date.now() }; grab._drag = false; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', function (e) { if (gy && Math.abs(e.clientY - gy.y) > 12) grab._drag = true; });
  grab.addEventListener('pointerup', function (e) {
    if (!gy) return; var dy = e.clientY - gy.y; gy = null;
    if (grab._drag) { sheet(dy < 0); setTimeout(function () { grab._drag = false; }, 0); }
  });
  if ('IntersectionObserver' in W) {
    new IntersectionObserver(function (es) { es.forEach(function (en) { panel.classList.toggle('kf-away', !en.isIntersecting); }); }, { threshold: 0.12 }).observe(stage);
  }

  // ── старт ─────────────────────────────────────────────────────────────
  readHash(); presetsUI(); renderUI();
  var resizeT;
  W.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { layout(); draw(); }, 80); });
  W.addEventListener('hashchange', function () {
    if (location.hash === '#zayavka') { openForm(); return; }
    var r0 = st.room; readHash(); if (st.room !== r0) { var r1 = st.room; st.room = r0; setRoom(r1); } else change(function () {}, null);
  });
  if (location.hash === '#zayavka') setTimeout(openForm, 300);
  if (gl) { try { initGL(); } catch (e) { gl = null; if (W.console) console.warn(e); } }
  if (!gl) { stage.classList.add('kf-nogl'); var ng = $('#kfNoGl'); if (ng) { ng.textContent = TX.nogl; ng.hidden = false; } }
  layout();
  loadRoom(st.room).then(function (o) {
    room[st.room] = o;
    if (!gl) { showPoster(); return; }
    return ensureTex().then(function () {
      ready = true; anim.eve = st.eve; layout(); draw();
      stage.classList.add('kf-ready');
      if (Object.keys(st.sel[st.room]).length) reveal(0.5, 0.5);
      // фоном — інші кімнати й текстури стилів (коли браузер вільний)
      var idle = W.requestIdleCallback || function (f) { return setTimeout(f, 1500); };
      idle(function () { ROOMS.forEach(function (r) { if (r !== st.room) loadRoom(r).then(function (x) { room[r] = x; }); }); });
    });
  }).catch(function (e) { if (W.console) console.warn(e); });
})();
