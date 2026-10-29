// The site's static pages: one pre-rendered HTML page per tool and per content page, so crawlers
// and link previews get real content without JavaScript ("static first, JavaScript enhances", see
// docs/DECISIONS.md D24). build.mjs calls writeSite() after bundling the app.
//
// src/pages/layout.html is the shared shell (head, header, footer); src/pages/<page>.html is each
// page's content, with plain relative links (share.html is at the site root, the others one level
// down). Placeholders are {{name}}: values are HTML-escaped here, except the page's content and
// the blocks generated below (head, header, footer, links), whose links are built and escaped in
// this file, never written as template variables in an href.
// Paths are relative ({{root}} is "./" or "../"), so the site also works from a subfolder (a
// fork's github.io/<repo>/, or the tests' /dist/). Only canonical URLs, social previews,
// robots.txt and sitemap.xml need the public address: $BUILD_SITE_URL.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const APP_NAME = 'CommonSec Share';

/** The pages, in sitemap order. `path` is relative to the site root; `tool` mounts app.js. */
export const PAGES = [
  {
    path: '', source: 'share.html', tool: 'share',
    title: `Send passwords and files securely, browser to browser · ${APP_NAME}`,
    ogTitle: 'Send passwords and files securely, browser to browser',
    description: 'Send a password, a note or a file privately: end-to-end encrypted, straight from your browser to theirs, one time only. Nothing uploaded, no account.',
  },
  {
    path: 'chat/', source: 'chat.html', tool: 'chat',
    title: `Secure Chat: encrypted group chat and file sharing · ${APP_NAME}`,
    ogTitle: 'Secure Chat: encrypted group chat in your browser',
    description: 'A private, end-to-end encrypted chat room with file sharing, browser to browser. You approve who joins, nothing is stored, and no account is needed.',
  },
  {
    path: 'passwords/', source: 'passwords.html', tool: 'password',
    title: `Password and passphrase generator · ${APP_NAME}`,
    ogTitle: 'Strong password and memorable passphrase generator',
    description: 'Generate strong passwords and memorable passphrases in your browser, with exact strength in bits. Nothing is sent anywhere.',
  },
  {
    path: 'how-it-works/', source: 'how-it-works.html',
    title: `How it works: end-to-end encrypted, browser to browser · ${APP_NAME}`,
    ogTitle: `How ${APP_NAME} works`,
    description: 'How passwords and files go straight from one browser to another, encrypted end to end, with nothing uploaded or stored: links, words, relays and keys.',
  },
  {
    path: 'faq/', source: 'faq.html',
    title: `FAQ: is it safe to send passwords this way? · ${APP_NAME}`,
    ogTitle: `${APP_NAME}: frequently asked questions`,
    description: 'Is it safe to send passwords this way? What if the recipient is offline? What does the app send where? Answers, and our privacy note: no cookies, no trackers.',
  },
];

const NAV = [['', 'share', 'Share'], ['chat/', 'chat', 'Chat'], ['passwords/', 'password', 'Passwords']];

/** Static files copied as they are to the site root (icons and the social image). */
const SITE_ASSETS = 'assets/site';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in values)) throw new Error(`unknown placeholder ${m}`);
  return values[k];
});
/** JSON for a <script type="application/ld+json"> block: "<" escaped so it can't close the tag. */
const jsonLd = (data) => `  <script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const link = (href, text, external = false) =>
  `<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ''}>${escapeHtml(text)}</a>`;
const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** FAQPage structured data, read from the FAQ page itself so it can't drift from what's shown. */
function faqSchema(content) {
  const items = [...content.matchAll(/<section class="faq-item"[^>]*>\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g)];
  if (!items.length) throw new Error('faq.html: no <section class="faq-item"> found');
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(([, q, a]) => ({
      '@type': 'Question', name: plainText(q), acceptedAnswer: { '@type': 'Answer', text: plainText(a) },
    })),
  };
}

const appSchema = (page, url) => ({
  '@context': 'https://schema.org', '@type': 'WebApplication',
  name: page.tool === 'share' ? APP_NAME : `${page.ogTitle.split(':')[0]} · ${APP_NAME}`,
  url, description: page.description,
  applicationCategory: 'SecurityApplication', operatingSystem: 'Any (runs in a web browser)',
  browserRequirements: 'Requires JavaScript, Web Crypto and WebRTC',
  isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

/**
 * Writes every page, the icons, the social image, site.webmanifest, robots.txt and sitemap.xml
 * into outdir. Deterministic: same inputs, same bytes.
 */
export function writeSite(outdir, { siteUrl, version, repository }) {
  const layout = readFileSync('src/pages/layout.html', 'utf8');
  const [release, commit] = version.split('+');
  const commitUrl = commit && commit !== 'unknown' ? `${repository}/commit/${commit}` : repository;
  const docLink = (file, text) => link(`${repository}/blob/main/docs/${file}`, text, true);

  for (const page of PAGES) {
    const depth = page.path.split('/').filter(Boolean).length;
    const root = depth ? '../'.repeat(depth) : './';
    const url = siteUrl + page.path;
    const content = fill(readFileSync(join('src/pages', page.source), 'utf8'), {
      app: escapeHtml(APP_NAME),
      protocolLink: docLink('PROTOCOL.md', 'protocol'), threatModelLink: docLink('THREAT_MODEL.md', 'threat model'),
    });
    const header = [
      `    <a class="brand" href="${root}">`,
      `      <span class="brand-mark" aria-hidden="true">◈</span> ${escapeHtml(APP_NAME)}`,
      '    </a>',
      '    <nav class="nav" aria-label="Tools">',
      ...NAV.map(([path, route, label]) => {
        const here = path === page.path;
        return `      <a href="${root}${path}" data-route="${route}"${here ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
      }),
      '    </nav>',
    ].join('\n');
    const footer = [
      '    <nav class="footer-links" aria-label="About">',
      `      ${link(`${root}how-it-works/`, 'How it works')}`,
      `      ${link(`${root}faq/`, 'FAQ and privacy')}`,
      `      ${link(repository, 'Source code', true)}`,
      '    </nav>',
      '    Everything runs locally in your browser. No accounts, no tracking, no backend.',
      `    <span class="version">${link(commitUrl, `v${release}${commit ? ` · build ${commit}` : ''}`, true)}</span>`,
    ].join('\n');
    const head = [
      page.tool ? `  <script type="module" src="${root}app.js"></script>` : null,
      page.tool ? jsonLd(appSchema(page, url)) : null,
      page.source === 'faq.html' ? jsonLd(faqSchema(content)) : null,
    ].filter(Boolean).join('\n');

    const html = fill(layout, {
      root, app: escapeHtml(APP_NAME), title: escapeHtml(page.title), ogTitle: escapeHtml(page.ogTitle),
      description: escapeHtml(page.description), url: escapeHtml(url),
      image: escapeHtml(`${siteUrl}og-image.png`), imageAlt: escapeHtml(`${APP_NAME}: send passwords and files securely, browser to browser`),
      head, header, footer, body: content.trimEnd(), tool: page.tool ?? '',
    });
    mkdirSync(join(outdir, page.path), { recursive: true });
    writeFileSync(join(outdir, page.path, 'index.html'), html);
  }

  for (const name of readdirSync(SITE_ASSETS).sort()) copyFileSync(join(SITE_ASSETS, name), join(outdir, name));

  writeFileSync(join(outdir, 'site.webmanifest'), JSON.stringify({
    name: APP_NAME, short_name: APP_NAME,
    description: PAGES[0].description,
    start_url: './', scope: './', display: 'browser',
    background_color: '#f6f7f9', theme_color: '#2f6fed',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2) + '\n');

  writeFileSync(join(outdir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`);

  writeFileSync(join(outdir, 'sitemap.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...PAGES.map((p) => `  <url><loc>${escapeHtml(siteUrl + p.path)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'));
}
