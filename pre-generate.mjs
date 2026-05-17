#!/usr/bin/env node
// pre-generate.mjs — INSANE Mag
//
// Usage:
//   node pre-generate.mjs                        Build all issues (generate missing images + HTML)
//   node pre-generate.mjs vol1no1               One issue only
//   node pre-generate.mjs vol1no1 airport       Regenerate one specific image, then rebuild
//   node pre-generate.mjs --build-only          Rebuild all HTML only, no API calls
//   node pre-generate.mjs vol1no1 --build-only  Rebuild one issue HTML only

import fs   from 'fs';
import path from 'path';
import https from 'https';
import http  from 'http';
import { URL } from 'url';

// ── Load .env ──────────────────────────────────────────────────────────────────
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*?)\s*=\s*(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

// ── Args ───────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const buildOnly  = args.includes('--build-only');
const issueArg   = args.find(a => !a.startsWith('--')) ?? null;
const illoArg    = args.filter(a => !a.startsWith('--'))[1] ?? null;

// ── Helpers ────────────────────────────────────────────────────────────────────
function ea(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function eaRaw(s) {
  // HTML-escape but preserve existing HTML tags (for paragraphs with inline markup)
  return String(s ?? '');
}

function httpsReq(opts, body) {
  return new Promise((res, rej) => {
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d, headers: r.headers }));
    });
    req.on('error', rej);
    if (body) req.write(body);
    req.end();
  });
}

async function generateImage(prompt, apiKey) {
  const body = JSON.stringify({
    model:           'black-forest-labs/FLUX.1.1-pro',
    prompt,
    width:           1024,
    height:          768,
    steps:           28,
    n:               1,
    response_format: 'url'
  });
  const res = await httpsReq({
    hostname: 'api.together.xyz',
    path:     '/v1/images/generations',
    method:   'POST',
    headers:  {
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  const json = JSON.parse(res.body);
  if (!json.data?.[0]?.url) throw new Error(`Together API error: ${res.body.slice(0,200)}`);
  return json.data[0].url;
}

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(dest);
    lib.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlink(dest, () => {});
        downloadImage(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

// ── Discover all issues ────────────────────────────────────────────────────────
function discoverIssues() {
  const issDir = 'issues';
  if (!fs.existsSync(issDir)) return [];
  return fs.readdirSync(issDir)
    .filter(f => fs.existsSync(path.join(issDir, f, 'issue.json')))
    .map(id => JSON.parse(fs.readFileSync(path.join('issues', id, 'issue.json'), 'utf8')))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

// ── Image path helper ──────────────────────────────────────────────────────────
function imgPath(issueId, illoId) {
  return `../../images/${issueId}-${illoId}.png`;
}
function imgExists(issueId, illoId) {
  return fs.existsSync(path.join('images', `${issueId}-${illoId}.png`));
}

// ── Page builders ──────────────────────────────────────────────────────────────

function buildCoverFullPage(pg, idx, issue) {
  const ts = `?v=${Date.now()}`;
  const hasImg = pg.illoId && imgExists(issue.id, pg.illoId);
  return `<div class="page cover-full-page" id="p${idx}">
  ${hasImg
    ? `<img class="cover-full-img" src="${imgPath(issue.id, pg.illoId)}${ts}" alt="cover">`
    : '<div class="cover-placeholder">📰</div>'}
</div>`;
}

function buildCoverPage(pg, idx, issue) {
  const ts = `?v=${Date.now()}`;
  const hasImg = imgExists(issue.id, pg.illoId);
  const imgSrc = imgPath(issue.id, pg.illoId);
  const coverLines = (pg.coverLines ?? []).map(l =>
    `<div class="cover-line">${ea(l)}</div>`
  ).join('\n    ');

  return `<div class="page cover-page" id="p${idx}">
  ${hasImg
    ? `<img class="cover-img" src="${imgSrc}${ts}" alt="cover">`
    : '<div class="cover-placeholder">📰</div>'}
  <div class="cover-top">
    <div class="cover-mag-name">INSANE</div>
    <div class="cover-meta">${ea(pg.volNum ?? issue.eyebrow ?? '')} &nbsp;·&nbsp; ${ea(pg.date ?? issue.date ?? '')} &nbsp;·&nbsp; ${ea(pg.price ?? issue.price ?? '$5.99')}</div>
  </div>
  <div class="cover-lines-wrap">
    ${coverLines}
  </div>
  <div class="cover-tagline">SANITY NOT INCLUDED</div>
</div>`;
}

function buildEditorialPage(pg, idx, issue) {
  const paras = (pg.paragraphs ?? []).map(t =>
    `<p>${eaRaw(t)}</p>`
  ).join('\n    ');
  const ps = pg.ps ? `<p class="editorial-ps">${ea(pg.ps)}</p>` : '';

  return `<div class="page editorial-page" id="p${idx}">
  <div class="editorial-inner">
    <h2 class="editorial-title">${ea(pg.title ?? 'FROM THE EDITOR\'S BUNKER')}</h2>
    <p class="editorial-salutation">${ea(pg.salutation ?? '')}</p>
    <div class="editorial-body">
    ${paras}
    </div>
    <p class="editorial-sig">${ea(pg.signature ?? '— The Editors')}</p>
    ${ps}
  </div>
</div>`;
}

function buildMastheadPage(pg, idx, issue) {
  const staffItems = (pg.staff ?? []).map(s =>
    `<div class="mast-item"><span class="mast-role">${ea(s.role)}:</span> <span class="mast-name">${ea(s.name)}</span></div>`
  ).join('\n      ');

  let alertHtml = '';
  if (pg.subscriberAlert) {
    const sa = pg.subscriberAlert;
    const items = (sa.items ?? []).map(i => `<div class="alert-item">${ea(i)}</div>`).join('\n        ');
    alertHtml = `
    <div class="subscriber-alert">
      <div class="alert-title">${ea(sa.title ?? 'INSANE MAGAZINE SUBSCRIBER ALERT!')}</div>
      <div class="alert-sub">${ea(sa.subtitle ?? '')}</div>
      <div class="alert-items">${items}</div>
      <div class="alert-price">${ea(sa.price ?? '$5.99')}</div>
      <div class="alert-disclaimer">${ea(sa.disclaimer ?? '')}</div>
    </div>`;
  }

  return `<div class="page masthead-page" id="p${idx}">
  <div class="masthead-inner">
    <div class="masthead-logo">INSANE</div>
    <h2 class="masthead-title">${ea(pg.title ?? 'INSANE MAGAZINE MASTHEAD')}</h2>
    <div class="masthead-grid">
      ${staffItems}
    </div>
    ${alertHtml}
    <div class="masthead-disclaimer">${ea(pg.disclaimer ?? 'INSANE Magazine is printed on paper recycled from executive orders. Any resemblance to a functioning democracy is coincidental.')}</div>
  </div>
</div>`;
}

function buildContentsPage(pg, idx, issue) {
  const items = (pg.items ?? []).map(it =>
    `<div class="ci-item">
      <span class="ci-num">${ea(String(it.page ?? ''))}</span>
      <span class="ci-emoji">${it.emoji ?? ''}</span>
      <span class="ci-title">${ea(it.title ?? '')}</span>
      <span class="ci-desc">${ea(it.desc ?? '')}</span>
    </div>`
  ).join('\n    ');

  let scorecardHtml = '';
  if (pg.scorecard) {
    const sc = pg.scorecard;
    const scItems = (sc.items ?? []).map(si =>
      `<li>${si.emoji ?? ''} ${ea(si.label)}: <strong>${ea(si.value)}</strong></li>`
    ).join('\n        ');
    scorecardHtml = `
    <div class="scorecard-box">
      <div class="scorecard-title">${ea(sc.title ?? 'THIS WEEK\'S INSANE SCORECARD')}</div>
      <ul class="scorecard-list">${scItems}</ul>
    </div>`;
  }

  const ticker = pg.ticker
    ? `<div class="ticker-bar"><div class="ticker-inner">${ea(pg.ticker)} &nbsp; ✦ &nbsp; ${ea(pg.ticker)}</div></div>`
    : '';

  return `<div class="page contents-page" id="p${idx}">
  ${ticker}
  <div class="contents-inner">
    <div class="contents-header">
      <div class="contents-mag">INSANE</div>
      <h2 class="contents-title">${ea(pg.title ?? 'CONTENTS')}</h2>
      <div class="contents-edition">${ea(pg.edition ?? issue.eyebrow ?? '')}</div>
    </div>
    <div class="contents-list">
    ${items}
    </div>
    ${scorecardHtml}
  </div>
</div>`;
}

function buildStoryPage(pg, idx, issue) {
  const ts = `?v=${Date.now()}`;
  const hasImg = pg.illoId && imgExists(issue.id, pg.illoId);
  const flipClass = pg.flip ? ' flip' : '';
  const hasIllo = !!pg.illoId;

  // Main paragraphs
  const paras = (pg.paragraphs ?? []).map(t => `<p>${eaRaw(t)}</p>`).join('\n    ');

  // Pull quote
  const pullQuote = pg.pullQuote
    ? `<blockquote class="pull-quote">${ea(pg.pullQuote)}</blockquote>`
    : '';

  // Sidebar list
  let sidebarHtml = '';
  if (pg.sidebarList) {
    const sl = pg.sidebarList;
    const lis = (sl.items ?? []).map(i => `<li>${ea(i)}</li>`).join('\n        ');
    sidebarHtml = `
    <div class="sidebar-list">
      <div class="sidebar-list-title">${ea(sl.title ?? '')}</div>
      <ul>${lis}</ul>
    </div>`;
  }

  // Fake ad
  let fakeAdHtml = '';
  if (pg.fakeAd) {
    const fa = pg.fakeAd;
    const bullets = (fa.bullets ?? []).map(b => `<div class="ad-bullet">${ea(b)}</div>`).join('\n        ');
    fakeAdHtml = `
    <div class="fake-ad">
      <div class="ad-headline">${ea(fa.headline ?? '')}</div>
      ${fa.subheadline ? `<div class="ad-subheadline">${ea(fa.subheadline)}</div>` : ''}
      <div class="ad-bullets">${bullets}</div>
      ${fa.price ? `<div class="ad-price">${ea(fa.price)}</div>` : ''}
      ${fa.disclaimer ? `<div class="ad-disclaimer">${ea(fa.disclaimer)}</div>` : ''}
    </div>`;
  }

  // Glossary box
  let glossaryHtml = '';
  if (pg.glossary) {
    const g = pg.glossary;
    const entries = (g.entries ?? []).map(e =>
      `<div class="gloss-entry"><span class="gloss-word">${ea(e.word)}:</span> ${ea(e.def)}</div>`
    ).join('\n        ');
    glossaryHtml = `
    <div class="glossary-box">
      <div class="glossary-title">${ea(g.title ?? 'GLOSSARY')}</div>
      ${entries}
    </div>`;
  }

  // The End
  const theEnd = pg.theEnd ? `
    <div class="the-end">
      <p class="the-end-title">${ea(pg.theEnd.title)}</p>
      <p class="the-end-sub">${ea(pg.theEnd.sub)}</p>
    </div>` : '';

  // Caption
  const caption = pg.caption ? `<div class="illo-caption">${ea(pg.caption)}</div>` : '';

  // Illo block (or no-illo variant)
  const illoBlock = hasIllo ? `
  <div class="story-illo">
    ${hasImg
      ? `<img src="${imgPath(issue.id, pg.illoId)}${ts}" alt="${ea(pg.heading ?? '')}">`
      : '<div class="illo-placeholder">🖼️</div>'}
    ${caption}
  </div>` : '';

  const noIlloClass = hasIllo ? '' : ' no-illo';

  return `<div class="page story-page${flipClass}${noIlloClass}" id="p${idx}">
  ${illoBlock}
  <div class="story-body">
    ${pg.eyebrow ? `<div class="story-eyebrow">${ea(pg.eyebrow)}</div>` : ''}
    ${pg.heading ? `<h2 class="story-heading">${ea(pg.heading)}</h2>` : ''}
    ${pg.subheading ? `<p class="story-subheading">${ea(pg.subheading)}</p>` : ''}
    ${pg.deck ? `<p class="story-deck">${ea(pg.deck)}</p>` : ''}
    ${paras}
    ${pullQuote}
    ${sidebarHtml}
    ${fakeAdHtml}
    ${glossaryHtml}
    ${theEnd}
  </div>
</div>`;
}

function buildSpyPage(pg, idx, issue) {
  const ts = `?v=${Date.now()}`;
  const hasImg = pg.illoId && imgExists(issue.id, pg.illoId);

  const whitePanels = (pg.white?.panels ?? []).map(p =>
    `<p>${ea(p)}</p>`
  ).join('\n        ');
  const blackPanels = (pg.black?.panels ?? []).map(p =>
    `<p>${ea(p)}</p>`
  ).join('\n        ');

  return `<div class="page spy-page" id="p${idx}">
  <div class="spy-header">
    <h2 class="spy-title">${ea(pg.title ?? 'SPY vs. SPY')}</h2>
    ${pg.subtitle ? `<div class="spy-subtitle">${ea(pg.subtitle)}</div>` : ''}
  </div>
  ${hasImg
    ? `<div class="spy-illo"><img src="${imgPath(issue.id, pg.illoId)}${ts}" alt="spy vs spy"></div>`
    : ''}
  <div class="spy-arena">
    <div class="spy-col spy-white">
      <div class="spy-icon">🤍</div>
      <h3>WHITE SPY</h3>
      <div class="spy-panels">${whitePanels}</div>
    </div>
    <div class="spy-divider">VS</div>
    <div class="spy-col spy-black">
      <div class="spy-icon">🖤</div>
      <h3>BLACK SPY</h3>
      <div class="spy-panels">${blackPanels}</div>
    </div>
  </div>
  <div class="spy-result">${ea(pg.result ?? '')}</div>
</div>`;
}

function buildAwardsPage(pg, idx, issue) {
  const cats = (pg.categories ?? []).map(cat => {
    const medals = [
      cat.gold   ? `<div class="medal gold">🥇 ${ea(cat.gold)}</div>` : '',
      cat.silver ? `<div class="medal silver">🥈 ${ea(cat.silver)}</div>` : '',
      cat.bronze ? `<div class="medal bronze">🥉 ${ea(cat.bronze)}</div>` : ''
    ].filter(Boolean).join('\n      ');
    return `<div class="award-category">
      <div class="award-cat-title">${ea(cat.name ?? '')}</div>
      <div class="award-medals">${medals}</div>
    </div>`;
  }).join('\n  ');

  return `<div class="page awards-page" id="p${idx}">
  <div class="awards-inner">
    <h2 class="awards-title">${ea(pg.title ?? '🏆 INSANE AWARDS')}</h2>
    ${pg.date ? `<div class="awards-date">${ea(pg.date)}</div>` : ''}
    ${cats}
  </div>
</div>`;
}

function buildFoldinPage(pg, idx, issue) {
  const ts = `?v=${Date.now()}`;
  const hasImg = pg.illoId && imgExists(issue.id, pg.illoId);

  return `<div class="page fold-in-page" id="p${idx}">
  <div class="foldin-inner">
    <div class="foldin-header">
      <h2 class="foldin-title">INSANE BACK PAGE</h2>
      <div class="foldin-subtitle">THE FAMOUS FOLD-IN &nbsp;✦&nbsp; "FOLD CAREFULLY — UNLIKE THE CEASEFIRE"</div>
    </div>
    <div class="foldin-area" id="foldinArea">
      <div class="foldin-left" id="foldinLeft">
        ${hasImg ? `<img class="foldin-img" src="${imgPath(issue.id, pg.illoId)}${ts}" alt="fold-in">` : '<div class="foldin-img-placeholder">📰</div>'}
        <div class="foldin-section-top">${ea(pg.leftText ?? 'FOLD THIS HALF →')}</div>
        <div class="foldin-question">${ea(pg.question ?? '')}</div>
        <div class="foldin-label-a">A</div>
      </div>
      <div class="foldin-right">
        <div class="foldin-section-top">${ea(pg.rightText ?? '← FOLD LEFT SIDE OVER')}</div>
        <div class="foldin-answer-hidden">${ea(pg.answer ?? '')}</div>
        <div class="foldin-label-b">B</div>
      </div>
    </div>
    <div class="foldin-answer-reveal" id="foldinAnswer">
      <div class="foldin-answer-text">${ea(pg.answer ?? '')}</div>
      <div class="foldin-answer-sub">Fold A over B to reveal the hidden truth</div>
    </div>
    <button class="foldin-btn" id="foldinBtn" onclick="toggleFoldin()">📰 FOLD IT!</button>
  </div>
</div>`;
}

// ── Build one issue's HTML ─────────────────────────────────────────────────────
function buildIssue(issue, bookCss, bookJs) {
  const outDir = path.join('issues', issue.id);
  const pages  = issue.pages ?? [];
  const p      = issue.palette ?? {};

  const pageHtml = pages.map((pg, idx) => {
    switch (pg.type) {
      case 'cover-full':   return buildCoverFullPage(pg, idx, issue);
      case 'cover':        return buildCoverPage(pg, idx, issue);
      case 'editorial':    return buildEditorialPage(pg, idx, issue);
      case 'masthead':     return buildMastheadPage(pg, idx, issue);
      case 'contents':     return buildContentsPage(pg, idx, issue);
      case 'story':        return buildStoryPage(pg, idx, issue);
      case 'spy-vs-spy':   return buildSpyPage(pg, idx, issue);
      case 'awards':       return buildAwardsPage(pg, idx, issue);
      case 'fold-in':      return buildFoldinPage(pg, idx, issue);
      default:             return buildStoryPage(pg, idx, issue);
    }
  }).join('\n\n');

  // CSS variable overrides from palette
  const cssVars = Object.entries(p).map(([k, v]) => {
    const cssKey = '--' + k.replace(/([A-Z])/g, m => '-' + m.toLowerCase());
    return `  ${cssKey}: ${v};`;
  }).join('\n');

  const issueUrl = `https://insane-mag.bumbloobooks.com/issues/${issue.id}/`;
  const ogImageUrl = `https://insane-mag.bumbloobooks.com/images/${issue.id}-cover.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ea(issue.title)} — INSANE Mag</title>
  <meta name="description" content="${ea(issue.subtitle ?? '')}">
  <meta property="og:title" content="${ea(issue.title)} — INSANE Mag">
  <meta property="og:description" content="${ea(issue.subtitle ?? '')}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${issueUrl}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bangers&family=Special+Elite&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Lora:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
  <style>
${bookCss}
${cssVars ? `:root {\n${cssVars}\n}` : ''}
  </style>
</head>
<body>
<nav class="nav">
  <div class="nav-left">
    <a class="nav-back" href="../../index.html">← All Issues</a>
  </div>
  <span class="nav-title">${ea(issue.title)}</span>
  <div class="nav-right">
    <span class="nav-counter" id="navCounter"></span>
    <button class="nav-btn" id="btnPrev" onclick="prev()" aria-label="Previous">&#8592;</button>
    <button class="nav-btn" id="btnNext" onclick="next()" aria-label="Next">&#8594;</button>
    <button class="nav-share" onclick="shareIssue()" aria-label="Share">&#9014;</button>
  </div>
</nav>

<div class="viewport">
  <div class="track" id="track">
${pageHtml}
  </div>
</div>

<div class="dot-row" id="dotRow"></div>

<script>window.STORY_PAGES = ${pages.length};</script>
<script>${bookJs}</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`  ✅  Built issues/${issue.id}/index.html  (${pages.length} pages)`);
}

// ── Build hub index.html ───────────────────────────────────────────────────────
function buildHub(allIssues, hubCss) {
  const ts = `?v=${Date.now()}`;

  const cards = allIssues.map(s => {
    const coverFile = `images/${s.id}-cover.png`;
    const hasImg    = fs.existsSync(coverFile);
    const href      = `issues/${s.id}/index.html`;
    const accent    = s.palette?.accent ?? '#cc0000';
    const navBg     = s.palette?.navBg  ?? '#111111';
    const volLabel  = s.eyebrow ?? `Issue ${s.order ?? '?'}`;

    return `<a class="issue-card" href="${href}">
  <div class="card-cover" style="background:${navBg}">
    ${hasImg
      ? `<img src="${coverFile}${ts}" alt="${ea(s.title)}">`
      : '<span class="card-cover-placeholder">📰</span>'}
  </div>
  <div class="card-body" style="--card-accent:${accent}">
    <p class="card-num">${ea(volLabel)}</p>
    <h2 class="card-title">${ea(s.title)}</h2>
    <p class="card-subtitle">${ea(s.subtitle ?? '')}</p>
    <p class="card-desc">${ea(s.eyebrowDesc ?? s.subtitle ?? '')}</p>
    <span class="card-read">READ THIS ISSUE →</span>
  </div>
</a>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>INSANE Mag</title>
  <meta name="description" content="The magazine for people who thought this would be a normal week.">
  <meta property="og:title" content="INSANE Mag">
  <meta property="og:description" content="The magazine for people who thought this would be a normal week.">
  <meta property="og:image" content="https://insane-mag.bumbloobooks.com/insane-mag-hub.png">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="768">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://insane-mag.bumbloobooks.com/">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bangers&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${hubCss}</style>
</head>
<body>
<header class="hub-header">
  <!-- Facebook reads this img tag, not just og:image -->
  <img class="hub-cover" src="insane-mag-hub.png${ts}" alt="INSANE Mag">
  <div class="hub-mag-title">INSANE</div>
  <p class="hub-eyebrow">The Magazine For People Who Thought This Would Be A Normal Week</p>
  <p class="hub-desc">Satire, outrage, and fake ads. Sanity not included.</p>
</header>
<div class="hub-divider">✦ &nbsp; ALL ISSUES &nbsp; ✦</div>
<main class="hub-grid">
${cards}
</main>
<footer class="hub-footer">INSANE MAG &nbsp;·&nbsp; insane-mag.bumbloobooks.com &nbsp;·&nbsp; AI-Illustrated &nbsp;·&nbsp; Deployed on Netlify &nbsp;·&nbsp; $5.99 US / $7.99 CAN &nbsp;·&nbsp; SANITY NOT INCLUDED</footer>
</body>
</html>`;

  fs.writeFileSync('index.html', html);
  console.log('✅  Built index.html (hub)');
}

// ── Generate images for one issue ─────────────────────────────────────────────
async function generateImages(issue, apiKey, specificIlloId) {
  const pages = issue.pages ?? [];
  const toGen = specificIlloId
    ? pages.filter(p => p.illoId === specificIlloId)
    : pages.filter(p => p.scene && p.illoId && !imgExists(issue.id, p.illoId));

  if (!toGen.length) {
    console.log(`  ✅  All images present for "${issue.title}"`);
    return;
  }

  console.log(`  🖼️   Generating ${toGen.length} image(s) for "${issue.title}"`);
  for (const pg of toGen) {
    const dest = path.join('images', `${issue.id}-${pg.illoId}.png`);
    process.stdout.write(`       ${pg.illoId}  …  `);
    let attempts = 0;
    while (attempts < 5) {
      try {
        const prompt = `${issue.stylePrefix ?? ''} ${pg.scene ?? ''}`.trim();
        const url = await generateImage(prompt, apiKey);
        await downloadImage(url, dest);
        console.log('✅');
        break;
      } catch (err) {
        attempts++;
        if (attempts >= 5) { console.log(`❌ FAILED: ${err.message}`); }
        else { await new Promise(r => setTimeout(r, 3000 * attempts)); }
      }
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  const bookCss = fs.readFileSync('assets/book.css', 'utf8');
  const bookJs  = fs.readFileSync('assets/book.js',  'utf8');
  const hubCss  = fs.readFileSync('assets/hub.css',  'utf8');

  if (!fs.existsSync('images')) fs.mkdirSync('images');

  const allIssues = discoverIssues();
  if (!allIssues.length) {
    console.error('\n❌  No issues found in issues/ directory.\n');
    console.error('    Create issues/vol1no1/issue.json to get started.\n');
    process.exit(1);
  }

  const target = issueArg
    ? allIssues.filter(s => s.id === issueArg)
    : allIssues;

  if (issueArg && !target.length) {
    console.error(`\n❌  Issue "${issueArg}" not found. Available: ${allIssues.map(s => s.id).join(', ')}\n`);
    process.exit(1);
  }

  // Image generation
  if (!buildOnly) {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      console.error('\n❌  TOGETHER_API_KEY not set. Copy .env.example to .env and fill it in.\n');
      process.exit(1);
    }
    for (const issue of target) {
      console.log(`\n📰  ${issue.title} (${issue.eyebrow ?? issue.id})`);
      await generateImages(issue, apiKey, illoArg);
    }
  }

  // Build HTML
  console.log('\n🔨  Building HTML...');
  for (const issue of target) {
    buildIssue(issue, bookCss, bookJs);
  }
  buildHub(allIssues, hubCss);

  console.log('\n🎉  Done!');
  console.log('    Deploy: netlify deploy --prod --dir . --site [your-site-id]');
  console.log('');
})();
