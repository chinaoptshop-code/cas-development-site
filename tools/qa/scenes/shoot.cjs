// Контактні аркуші етапів 3D-сцен: node tools/qa/scenes/shoot.cjs <base-url> <out-dir> [tag]
// Кожна сцена, кожен етап (кнопки .bz-nav .bz-b), 402 і 1440 px, DPR 2, reduced-motion (статичні кадри).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [base, out, tag = 'now'] = process.argv.slice(2);
const SCENES = [
  ['house', 'index.html', '#build-anim'],
  ['repair', 'remont-kvartyr-kyiv.html', '#build-anim'],
  ['landscape', 'landshaftnyi-dyzain-kyiv.html', '#build-anim'],
  ['restaurant', 'dyzain-restoranu-kafe-kyiv.html', '#restaurant-anim'],
  ['resort', 'baza-vidpochynku-pid-klyuch.html', '#resort'],
  ['water', 'baza-vidpochynku-pid-klyuch.html', '#water-house'],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [name, page, sel] of SCENES) {
    if (only && !only.includes(name)) continue;
    for (const w of [402, 1440]) {
      const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 874 : 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.goto(base + '/' + page, { waitUntil: 'load' });
      await p.evaluate(() => scrollTo(0, 300)); await p.waitForTimeout(300);
      const sec = p.locator(sel).first();
      await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
      await p.waitForSelector(sel + ' svg', { timeout: 15000 }).catch(() => {});
      const dir = path.join(out, name, String(w)); fs.mkdirSync(dir, { recursive: true });
      const svg = () => p.locator(sel + ' svg').first();
      const shot = async i => svg().screenshot({ path: path.join(dir, `${tag}-${String(i).padStart(2, '0')}.png`) }).catch(e => console.error(name, w, i, e.message));
      let n = await p.locator(sel + ' .bz-nav .bz-b').count();
      if (n) {            // Будинок / Ремонт: кнопки етапів
        for (let i = 0; i < n; i++) { await p.locator(sel + ' .bz-nav .bz-b').nth(i).click({ force: true }).catch(() => {}); await p.waitForTimeout(900); await shot(i + 1); }
      } else if (await p.locator(sel + ' .la-next').count()) {   // Ландшафт / Ресторан / Вода: ←/→
        n = await p.locator(sel + ' ol.bz-st > li').count();
        for (let k = 0; k < n + 2; k++) { await p.locator(sel + ' .la-prev').click({ force: true }).catch(() => {}); await p.waitForTimeout(60); }
        await p.waitForTimeout(900);
        for (let i = 0; i < n; i++) { if (i) { await p.locator(sel + ' .la-next').click({ force: true }).catch(() => {}); await p.waitForTimeout(900); } await shot(i + 1); }
      } else {            // Комплекс: план + по одному об'єкту кожного типу (g.rp-o[data-o]) на останньому етапі (кнопка › у .rp-nav)
        await shot(0);
        const ks = await p.$$eval(sel + ' .rp-o', gs => { const seen = {}; return gs.filter(g => !seen[g.dataset.o] && (seen[g.dataset.o] = 1)).map(g => g.dataset.k); });
        n = ks.length;
        for (let i = 0; i < n; i++) {
          await p.locator(sel + ` .rp-o[data-k="${ks[i]}"]`).dispatchEvent('click').catch(() => {}); await p.waitForTimeout(300);
          for (let k = 0; k < 6; k++) { await p.locator(sel + ' .rp-nav button').last().click({ force: true }).catch(() => {}); await p.waitForTimeout(60); }
          await p.waitForTimeout(900); await shot(i + 1);
          await p.locator(sel + ' .rp-back').click({ force: true }).catch(() => {}); await p.waitForTimeout(500);
        }
      }
      console.log(name, w, 'етапів', n);
      await ctx.close();
    }
  }
  await b.close();
})();
