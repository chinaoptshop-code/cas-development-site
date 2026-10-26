/* CAS map: інтерактивні карти сайту (портфоліо — «Карта проєктів», контакти — офіс).
   Розмітку генерує tools/site/casmap.py. Без JS/WebGL лишається статичний постер + звичайні посилання.
   Бібліотека — MapLibre GL JS 5.24.0 (BSD-3, self-hosted /assets/vendor/), вантажиться ліниво: коли блок біля вʼюпорту
   (data-load="visible") або по кліку (data-load="click"). Тайли — OpenFreeMap (без ключа, комерційно можна;
   атрибуція © OpenMapTiles, дані © OpenStreetMap — показує AttributionControl). Стиль — власний, темний, золотий акцент. */
(function () {
  'use strict';
  var D = document, W = window;
  var BASE = '/assets/vendor/maplibre-gl-5.24.0/', OFM = 'https://tiles.openfreemap.org/';
  var GOLD = '#bf9148', BG = '#0d0c0b', INK = '#ede8df';
  var RM = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var LOC = {
    uk: { 'NavigationControl.ZoomIn': 'Збільшити', 'NavigationControl.ZoomOut': 'Зменшити', 'NavigationControl.ResetBearing': 'Повернути на північ',
      'FullscreenControl.Enter': 'На весь екран', 'FullscreenControl.Exit': 'Вийти з повноекранного режиму', 'Popup.Close': 'Закрити',
      'AttributionControl.ToggleAttribution': 'Джерела карти', 'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + прокрутка — масштаб карти',
      'CooperativeGesturesHandler.MacHelpText': '⌘ + прокрутка — масштаб карти', 'CooperativeGesturesHandler.MobileHelpText': 'Рухайте карту двома пальцями' },
    ru: { 'NavigationControl.ZoomIn': 'Приблизить', 'NavigationControl.ZoomOut': 'Отдалить', 'NavigationControl.ResetBearing': 'Повернуть на север',
      'FullscreenControl.Enter': 'На весь экран', 'FullscreenControl.Exit': 'Выйти из полноэкранного режима', 'Popup.Close': 'Закрыть',
      'AttributionControl.ToggleAttribution': 'Источники карты', 'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + прокрутка — масштаб карты',
      'CooperativeGesturesHandler.MacHelpText': '⌘ + прокрутка — масштаб карты', 'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами' }
  };
  var lib = null;

  function webgl() {
    try { var c = D.createElement('canvas'); return !!(W.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadLib() {
    if (lib) return lib;
    lib = new Promise(function (ok, no) {
      if (W.maplibregl) return ok(W.maplibregl);
      var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + 'maplibre-gl.css'; D.head.appendChild(l);
      var s = D.createElement('script'); s.src = BASE + 'maplibre-gl.js'; s.async = true;
      s.onload = function () { W.maplibregl ? ok(W.maplibregl) : no(new Error('maplibre')); };
      s.onerror = function () { lib = null; no(new Error('maplibre')); };
      D.head.appendChild(s);
    });
    return lib;
  }

  /* ── Стиль: власний, на схемі OpenMapTiles (source-layer-и тайлів OpenFreeMap) ── */
  function style(lang, b3d, globe) {
    var R = ['Noto Sans Regular'], B = ['Noto Sans Bold'], I = ['Noto Sans Italic'];
    var nm = ['coalesce', ['get', 'name:' + lang], ['get', 'name:latin'], ['get', 'name']];
    var halo = { 'text-halo-color': BG, 'text-halo-width': 1.2, 'text-halo-blur': .5 };
    function lbl(o, paint) { var p = { 'text-color': '#a99f90' }; for (var k in halo) p[k] = halo[k]; for (k in paint) p[k] = paint[k]; o.paint = p; o.source = 'o'; o.type = 'symbol'; return o; }
    var cls = ['get', 'class'];
    var L = [
      { id: 'bg', type: 'background', paint: { 'background-color': BG } },
      { id: 'landcover', type: 'fill', source: 'o', 'source-layer': 'landcover', filter: ['match', cls, ['wood', 'forest', 'grass', 'scrub'], true, false],
        paint: { 'fill-color': '#111410', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, .5, 10, .8] } },
      { id: 'park', type: 'fill', source: 'o', 'source-layer': 'park', paint: { 'fill-color': '#121610', 'fill-opacity': .7 } },
      { id: 'landuse', type: 'fill', source: 'o', 'source-layer': 'landuse', minzoom: 8, filter: ['match', cls, ['residential', 'suburb', 'neighbourhood', 'commercial', 'retail'], true, false],
        paint: { 'fill-color': '#15130f', 'fill-opacity': .6 } },
      { id: 'water', type: 'fill', source: 'o', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': '#161a1f' } },
      { id: 'waterway', type: 'line', source: 'o', 'source-layer': 'waterway', minzoom: 8, paint: { 'line-color': '#161a1f', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 15, 2.5] } },
      { id: 'boundary-4', type: 'line', source: 'o', 'source-layer': 'boundary', minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#2e2720', 'line-dasharray': [3, 2], 'line-width': .8 } },
      { id: 'boundary-2', type: 'line', source: 'o', 'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]],
        paint: { 'line-color': '#5c4b33', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, .6, 6, 1.3, 12, 2] } },
      { id: 'road', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 5,
        filter: ['all', ['match', cls, ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', cls, ['motorway', 'trunk'], '#4d3d27', 'primary', '#3d3124', ['secondary', 'tertiary'], '#2c261f', '#221e1a'],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'],
            5, ['match', cls, ['motorway', 'trunk'], .7, 0],
            10, ['match', cls, ['motorway', 'trunk'], 2, 'primary', 1.4, ['secondary', 'tertiary'], .8, .2],
            16, ['match', cls, ['motorway', 'trunk'], 11, 'primary', 9, ['secondary', 'tertiary'], 7, 'minor', 4, 2]]
        } },
      { id: 'rail', type: 'line', source: 'o', 'source-layer': 'transportation', minzoom: 11, filter: ['match', cls, ['rail', 'transit'], true, false],
        paint: { 'line-color': '#2a2520', 'line-width': 1.2, 'line-dasharray': [2, 2] } }
    ];
    if (b3d) {
      L.push({ id: 'building-3d', type: 'fill-extrusion', source: 'o', 'source-layer': 'building', minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, '#1a1714', 60, '#2a241d'],
          'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': ['get', 'render_min_height'], 'fill-extrusion-opacity': .92 } });
    } else {
      L.push({ id: 'building', type: 'fill', source: 'o', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#1b1815', 'fill-outline-color': '#25201b' } });
    }
    L.push(
      lbl({ id: 'water-name', 'source-layer': 'water_name', filter: ['match', cls, ['ocean', 'sea'], true, false],
        layout: { 'text-field': nm, 'text-font': I, 'text-size': 11, 'text-letter-spacing': .1, 'text-max-width': 6 } }, { 'text-color': '#4c5866' }),
      lbl({ id: 'road-name', 'source-layer': 'transportation_name', minzoom: 14,
        layout: { 'text-field': nm, 'text-font': R, 'text-size': 12, 'symbol-placement': 'line', 'text-rotation-alignment': 'map' } }, { 'text-color': '#a39684' }),
      lbl({ id: 'place-minor', 'source-layer': 'place', minzoom: 11, filter: ['match', cls, ['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet'], true, false],
        layout: { 'text-field': nm, 'text-font': R, 'text-size': 11, 'text-max-width': 8 } }, { 'text-color': '#857b6d' }),
      lbl({ id: 'place-town', 'source-layer': 'place', minzoom: 7, filter: ['==', cls, 'town'],
        layout: { 'text-field': nm, 'text-font': R, 'text-size': 12, 'text-max-width': 8 } }, { 'text-color': '#a99f90' }),
      lbl({ id: 'place-city', 'source-layer': 'place', minzoom: 3, filter: ['==', cls, 'city'],
        layout: { 'text-field': nm, 'text-font': R, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 14, 12, 17], 'text-max-width': 8,
          'symbol-sort-key': ['get', 'rank'] } }, { 'text-color': '#d6cbb7' }),
      lbl({ id: 'place-country', 'source-layer': 'place', maxzoom: 8, filter: ['==', cls, 'country'],
        layout: { 'text-field': nm, 'text-font': B, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 6, 13], 'text-transform': 'uppercase',
          'text-letter-spacing': .14, 'text-max-width': 7 } }, { 'text-color': '#8f826f' })
    );
    var st = { version: 8, glyphs: OFM + 'fonts/{fontstack}/{range}.pbf',
      sources: { o: { type: 'vector', url: OFM + 'planet' } }, layers: L };
    if (globe) {  // глобус на дрібних масштабах (сам переходить у Меркатор при наближенні) + легка «атмосфера»
      st.projection = { type: 'globe' };
      st.sky = { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, .9, 5, .3, 7, 0], 'sky-color': '#1a1612', 'horizon-color': '#3a2e20' };
    }
    return st;
  }

  function opts(el, ml, extra) {
    var lang = (el.getAttribute('data-lang') || D.documentElement.lang || 'uk').slice(0, 2);
    var cv = D.createElement('div'); cv.className = 'cmap-cv'; el.appendChild(cv);
    var o = { container: cv, style: style(lang, extra.b3d, extra.globe), attributionControl: { compact: true }, cooperativeGestures: true,
      locale: LOC[lang] || {}, fadeDuration: RM ? 0 : 300 };
    for (var k in extra) if (k !== 'b3d' && k !== 'globe') o[k] = extra[k];
    return o;
  }
  function move(map, o) { RM ? map.easeTo(Object.assign({ duration: 0 }, o)) : map.flyTo(Object.assign({ speed: 1.1, curve: 1.5, essential: false }, o)); }
  function ready(el, map) {
    el._map = map;
    map.on('load', function () {
      el.classList.add('cmap-ready');
      // на вузькій карті атрибуцію згортаємо в кнопку «i» (як MapLibre за замовчуванням), щоб не закривала мапу
      if (el.clientWidth < 640) [].forEach.call(el.querySelectorAll('.maplibregl-compact-show'), function (a) { a.classList.remove('maplibregl-compact-show'); });
    });
    map.on('error', function (e) { if (W.console) console.warn('cas-map', e && e.error && e.error.message); });
  }
  function ll(s) { return s.split(',').map(Number); }

  /* ── Карта проєктів: точки з <ul class="cmap-list"> (a[data-ll]), кластери, попапи, flyTo з кнопок списку ── */
  function projects(el, ml) {
    var list = D.getElementById(el.getAttribute('data-list'));
    var items = [].slice.call(list.querySelectorAll('a[data-ll]'));
    var feats = items.map(function (a, i) {
      return { type: 'Feature', id: i, geometry: { type: 'Point', coordinates: ll(a.getAttribute('data-ll')) },
        properties: { i: i, n: a.querySelector('b').textContent } };
    });
    var b = new ml.LngLatBounds(); feats.forEach(function (f) { b.extend(f.geometry.coordinates); });
    var map = new ml.Map(opts(el, ml, { globe: true, bounds: b, fitBoundsOptions: { padding: { top: 50, bottom: 40, left: 40, right: 40 }, maxZoom: 6 },
      maxZoom: 11, minZoom: 1, dragRotate: false, pitchWithRotate: false, touchPitch: false }));
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
    ready(el, map);
    var pop = null, FB = ['Noto Sans Bold'];
    function popup(i) {
      var a = items[i], d = D.createElement('div'), img = a.getAttribute('data-img');
      d.className = 'cmap-card';
      if (img) { var im = D.createElement('img'); im.src = img; im.alt = ''; im.width = 400; im.height = 500; im.decoding = 'async'; d.appendChild(im); }
      var t = D.createElement('div'); t.className = 'cmap-card-t';
      var st = D.createElement('span'); st.className = 'cmap-st' + (a.hasAttribute('data-ok') ? ' ok' : ''); st.textContent = a.getAttribute('data-st'); t.appendChild(st);
      var h = D.createElement('b'); h.textContent = a.querySelector('b').textContent; t.appendChild(h);
      var p = D.createElement('span'); p.className = 'cmap-place'; p.textContent = a.getAttribute('data-place'); t.appendChild(p);
      var go = D.createElement('a'); go.href = a.getAttribute('href'); go.textContent = el.getAttribute('data-more') || '→'; t.appendChild(go);
      d.appendChild(t);
      if (pop) pop.remove();
      pop = new ml.Popup({ offset: 14, maxWidth: '260px', className: 'cmap-pop', focusAfterOpen: false })
        .setLngLat(feats[i].geometry.coordinates).setDOMContent(d).addTo(map);
      items.forEach(function (x, j) { x.parentNode.classList.toggle('on', j === i); });
    }
    map.on('load', function () {
      map.addSource('p', { type: 'geojson', data: { type: 'FeatureCollection', features: feats }, cluster: true, clusterRadius: 46, clusterMaxZoom: 10 });
      var cl = ['has', 'point_count'], pt = ['!', ['has', 'point_count']];
      map.addLayer({ id: 'p-cl-h', type: 'circle', source: 'p', filter: cl, paint: { 'circle-color': GOLD, 'circle-opacity': .2,
        'circle-radius': ['step', ['get', 'point_count'], 22, 4, 27] } });
      map.addLayer({ id: 'p-cl', type: 'circle', source: 'p', filter: cl, paint: { 'circle-color': GOLD, 'circle-stroke-color': BG, 'circle-stroke-width': 2,
        'circle-radius': ['step', ['get', 'point_count'], 14, 4, 18] } });
      map.addLayer({ id: 'p-cnt', type: 'symbol', source: 'p', filter: cl, layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FB, 'text-size': 13,
        'text-allow-overlap': true }, paint: { 'text-color': BG } });
      map.addLayer({ id: 'p-h', type: 'circle', source: 'p', filter: pt, paint: { 'circle-color': GOLD, 'circle-opacity': .22, 'circle-radius': 14 } });
      map.addLayer({ id: 'p-pt', type: 'circle', source: 'p', filter: pt, paint: { 'circle-color': GOLD, 'circle-radius': 6.5, 'circle-stroke-color': INK, 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'p-lbl', type: 'symbol', source: 'p', filter: pt, layout: { 'text-field': ['get', 'n'], 'text-font': FB, 'text-size': 12,
        'text-anchor': 'top', 'text-offset': [0, 1.2], 'text-optional': true }, paint: { 'text-color': INK, 'text-halo-color': BG, 'text-halo-width': 1.5 } });
      ['p-cl', 'p-pt'].forEach(function (id) {
        map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', 'p-cl', function (e) {
        var f = e.features[0];
        map.getSource('p').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
          move(map, { center: f.geometry.coordinates, zoom: Math.min(z + .3, 11) });
        });
      });
      map.on('click', 'p-pt', function (e) { popup(e.features[0].properties.i); });
      el._fly = function (i) {
        var a = items[i], z = +a.getAttribute('data-z') || 9;
        if (pop) pop.remove();
        // точка нижче центру — щоб над нею вмістився попап з фото
        map.once('moveend', function () { popup(i); });  // до move(): без анімації moveend приходить синхронно
        move(map, { center: feats[i].geometry.coordinates, zoom: z, offset: [0, Math.round(map.getContainer().clientHeight * .28)], speed: 1.5 });
      };
      if (el._pending != null) { el._fly(el._pending); el._pending = null; }
    });
  }

  /* ── Офіс: 3D-будівлі, маркер CAS, попап з адресою й маршрутом; плавний «підліт» (без нього при reduced motion) ── */
  function office(el, ml) {
    var c = ll(el.getAttribute('data-ll')), z = +el.getAttribute('data-z') || 16;
    var end = { center: c, zoom: z, pitch: 55, bearing: -18 };
    var map = new ml.Map(opts(el, ml, RM ? Object.assign({ b3d: true, maxPitch: 70 }, end)
      : { b3d: true, center: c, zoom: z - 2.5, pitch: 0, bearing: 0, maxPitch: 70 }));
    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ml.FullscreenControl(), 'top-right');
    ready(el, map);
    var pin = D.createElement('div'); pin.className = 'cmap-pin'; pin.innerHTML = '<b>CAS</b>';
    pin.setAttribute('aria-hidden', 'true');
    var d = D.createElement('div'); d.className = 'cmap-card cmap-card-o';
    var t = D.createElement('div'); t.className = 'cmap-card-t';
    var h = D.createElement('b'); h.textContent = el.getAttribute('data-title') || 'CAS Development'; t.appendChild(h);
    var p = D.createElement('span'); p.className = 'cmap-place'; p.textContent = el.getAttribute('data-addr') || ''; t.appendChild(p);
    var r = D.createElement('a'); r.href = el.getAttribute('data-route'); r.target = '_blank'; r.rel = 'noopener'; r.textContent = el.getAttribute('data-route-t') || '→'; t.appendChild(r);
    d.appendChild(t);
    new ml.Marker({ element: pin, anchor: 'bottom' }).setLngLat(c)
      .setPopup(new ml.Popup({ offset: 40, maxWidth: '260px', className: 'cmap-pop', focusAfterOpen: false }).setDOMContent(d)).addTo(map);
    if (!RM) map.once('load', function () { map.flyTo(Object.assign({ duration: 2600, essential: false }, end)); });
  }

  function init(el) {
    if (el._init) return el._init;
    el.classList.add('cmap-loading');
    el._init = loadLib().then(function (ml) {
      (el.getAttribute('data-cas-map') === 'office' ? office : projects)(el, ml);
      el.classList.remove('cmap-loading');
    }).catch(function () { el.classList.remove('cmap-loading'); el.classList.add('cmap-fail'); el._init = null; });
    return el._init;
  }

  function setup(el) {
    if (!webgl()) { el.classList.add('cmap-nogl'); return; }
    el.classList.add('cmap-js');
    var btn = el.querySelector('.cmap-go');
    if (btn) { btn.hidden = false; btn.addEventListener('click', function () { btn.hidden = true; init(el); }); }
    var list = el.getAttribute('data-list') && D.getElementById(el.getAttribute('data-list'));
    if (list) {
      [].forEach.call(list.querySelectorAll('.cmap-fly'), function (b, i) {
        b.hidden = false;
        b.addEventListener('click', function () {
          if (btn) btn.hidden = true;
          el.scrollIntoView({ block: 'nearest', behavior: RM ? 'auto' : 'smooth' });
          if (el._fly) el._fly(i); else { el._pending = i; init(el); }
        });
      });
    }
    var save = navigator.connection && navigator.connection.saveData;
    if (el.getAttribute('data-load') === 'visible' && !save && 'IntersectionObserver' in W) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (x) { return x.isIntersecting; })) { io.disconnect(); if (btn) btn.hidden = true; init(el); }
      }, { rootMargin: '200px 0px' });
      io.observe(el);
    }
  }

  function boot() { [].forEach.call(D.querySelectorAll('[data-cas-map]'), setup); }
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', boot) : boot();
})();
