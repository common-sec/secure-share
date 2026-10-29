// Renders the PNG icons and the social preview image in assets/site/ from favicon.svg, in Chromium.
// A one-off authoring step, not part of the build: the PNGs are committed, so the build stays
// reproducible without a browser. Rerun it after changing favicon.svg or the text below, with a
// Node.js that has Playwright installed, and commit the results:
//
//   node tools/render-site-images.mjs
//
// The social image is a placeholder until the logo exists (roadmap: Logo and visual identity).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// require() also finds a globally installed Playwright (NODE_PATH); import doesn't.
const { chromium } = createRequire(import.meta.url)('playwright');

const DIR = 'assets/site';
const svg = readFileSync(`${DIR}/favicon.svg`, 'utf8');
const icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const OG = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; box-sizing: border-box; padding: 72px 88px;
         background: #f6f7f9; color: #16181d; font-family: system-ui, "DejaVu Sans", sans-serif;
         display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 24px; font-size: 44px; font-weight: 700; }
  .brand img { width: 88px; height: 88px; }
  h1 { font-size: 72px; line-height: 1.1; margin: 0; letter-spacing: -1px; }
  p { font-size: 34px; color: #5d6573; margin: 0; }
  .bar { height: 12px; background: #2f6fed; border-radius: 6px; width: 220px; }
</style>
<div class="brand"><img src="${icon}" alt="">CommonSec Share</div>
<h1>Send passwords and files securely, browser to browser</h1>
<div><div class="bar"></div><p style="margin-top:28px">End-to-end encrypted · nothing uploaded · no account</p></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await page.setViewportSize({ width: size, height: size });
  // The touch icon is shown on a light background with its own rounding, so it's drawn full-bleed.
  const bg = name === 'apple-touch-icon.png' ? 'background:#2f6fed;' : '';
  await page.setContent(`<style>html,body{margin:0;${bg}}img{display:block;width:${size}px;height:${size}px}</style><img src="${icon}">`);
  await page.screenshot({ path: `${DIR}/${name}`, omitBackground: !bg });
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(OG);
await page.screenshot({ path: `${DIR}/og-image.png` });
await browser.close();
console.log(`rendered the icons and og-image.png in ${DIR}/`);
