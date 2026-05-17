#!/usr/bin/env node
// generate-thumbnail.mjs — INSANE Mag
// Generates insane-mag-thumbnail.png for the hub page and Facebook OG image.
// Run once from the insane-mag/ folder:
//   node generate-thumbnail.mjs
//
// Re-run any time you want a fresh take on the brand image.

import fs   from 'fs';
import https from 'https';
import http  from 'http';
import { URL } from 'url';

// ── Load .env ──────────────────────────────────────────────
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*?)\s*=\s*(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

const API_KEY = process.env.TOGETHER_API_KEY;
if (!API_KEY) {
  console.error('\n❌  TOGETHER_API_KEY not set in .env\n');
  process.exit(1);
}

// ── Prompt ─────────────────────────────────────────────────
// Wide landscape brand image — funny, timeless, no issue-specific content.
const PROMPT = `
Bold satirical magazine advertisement illustration in the style of Mad Magazine.
A chaotic urban newsstand absolutely buried under towering stacks of INSANE Magazine,
covers visible with exaggerated cartoon headlines. A wild-eyed newsboy in an oversized
suit and press hat screams "READ ALL ABOUT IT! SANITY NOT INCLUDED!" at horrified
pedestrians who are fleeing in all directions. Copies of the magazine rain from the sky.
Dollar bills fly through the air. A sandwich board reads SUBSCRIBE NOW / SANITY NOT INCLUDED.
A price sign says $6.95. The word INSANE in giant bold red letters dominates the scene.
One customer reads a copy with a look of dawning horror. A dog has grabbed a copy and is
also running. Vivid flat colors, thick black outlines, detailed background gags,
Mad Magazine caricature style. Wide cinematic landscape format.
`.trim().replace(/\n/g, ' ');

// ── API call ───────────────────────────────────────────────
async function httpsReq(opts, body) {
  return new Promise((res, rej) => {
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    });
    req.on('error', rej);
    if (body) req.write(body);
    req.end();
  });
}

async function generateImage() {
  const body = JSON.stringify({
    model:           'black-forest-labs/FLUX.1.1-pro',
    prompt:          PROMPT,
    width:           1280,
    height:          704,
    steps:           28,
    n:               1,
    response_format: 'url'
  });
  const res = await httpsReq({
    hostname: 'api.together.xyz',
    path:     '/v1/images/generations',
    method:   'POST',
    headers:  {
      'Authorization':  `Bearer ${API_KEY}`,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  const json = JSON.parse(res.body);
  if (!json.data?.[0]?.url) throw new Error(`API error: ${res.body.slice(0, 200)}`);
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
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

// ── Main ───────────────────────────────────────────────────
(async () => {
  const dest = 'insane-mag-hub.png';
  console.log('\n🖼️   Generating hub thumbnail (1280×704)...');
  console.log('    This takes about 20–30 seconds.\n');

  let attempts = 0;
  while (attempts < 3) {
    try {
      const url = await generateImage();
      process.stdout.write('    Downloading... ');
      await downloadImage(url, dest);
      console.log('✅\n');
      console.log(`    Saved: ${dest}  ← rename this file if Facebook caches it again`);
      console.log('    Run  node pre-generate.mjs --build-only  to rebuild the hub HTML.\n');
      break;
    } catch (err) {
      attempts++;
      if (attempts >= 3) {
        console.error(`\n❌  Failed after 3 attempts: ${err.message}\n`);
        process.exit(1);
      }
      console.log(`    Retry ${attempts}/3...`);
      await new Promise(r => setTimeout(r, 4000 * attempts));
    }
  }
})();
