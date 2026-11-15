#!/usr/bin/env node
/*
 * okifake — command-line Okimate printout renderer (same engine as index.html).
 *
 *   okifake input.png -o output.png [options]
 *   okifake --text "HELLO {red}WORLD" -o hello.png
 *   okifake --text-file listing.txt -o listing.png --ribbon black
 *
 * Options are the engine's settings (see DEFAULTS in okifake.js), written as
 * --kebab-case or key=value:  --model oki20 --paper copier --pixels 0 levels=5
 * --options '{"age":0.3}' takes JSON. Output PNGs carry their print resolution
 * (pHYs), so LaTeX and browsers size them as the real printout.
 * PNG input is read directly; other formats go through macOS `sips` or
 * ImageMagick `magick` when available.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(here, '..', 'okifake-font.js'));
const Okifake = require(join(here, '..', 'okifake.js'));

// ---------- PNG ----------
const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

export function encodePNG(W, H, rgba, ppi) {
  const opaque = (() => { for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false; return true; })();
  const bpp = opaque ? 3 : 4, stride = W * bpp;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const o = y * (stride + 1); raw[o] = 1; // Sub filter
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4, d = o + 1 + x * bpp;
      for (let k = 0; k < bpp; k++) raw[d + k] = (rgba[s + k] - (x ? rgba[s + k - 4] : 0)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (ppi) {
    const ph = Buffer.alloc(9), ppm = Math.round(ppi / 0.0254);
    ph.writeUInt32BE(ppm, 0); ph.writeUInt32BE(ppm, 4); ph[8] = 1;
    parts.push(chunk('pHYs', ph));
  }
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, W, H, depth, type, interlace, palette, trns;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bitsPP = ch * depth, bpp = Math.max(1, bitsPP >> 3), stride = Math.ceil(W * bitsPP / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const out = new Uint8ClampedArray(W * H * 4);
  const sample = (row, i) => { // i-th sample in row, scaled to 8 bits
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const per = 8 / depth, b = row[(i / per) | 0], sh = 8 - depth * (i % per + 1), v = (b >> sh) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round(v * 255 / ((1 << depth) - 1));
  };
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v;
    }
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4;
      if (type === 3) {
        const k = sample(cur, x);
        out[q] = palette[k * 3]; out[q + 1] = palette[k * 3 + 1]; out[q + 2] = palette[k * 3 + 2];
        out[q + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(cur, x * ch);
        out[q] = out[q + 1] = out[q + 2] = g; out[q + 3] = type === 4 ? sample(cur, x * ch + 1) : 255;
      } else {
        out[q] = sample(cur, x * ch); out[q + 1] = sample(cur, x * ch + 1); out[q + 2] = sample(cur, x * ch + 2);
        out[q + 3] = type === 6 ? sample(cur, x * ch + 3) : 255;
      }
    }
    prev.set(cur);
  }
  return { width: W, height: H, data: out };
}

function which(cmd) {
  try { execFileSync('/usr/bin/which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function readImage(file) {
  const buf = readFileSync(file);
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) {
    try { return decodePNG(buf); } catch (e) { if (!/interlaced/.test(e.message)) throw e; }
  }
  const tmp = mkdtempSync(join(tmpdir(), 'okifake-'));
  const png = join(tmp, 'in.png');
  try {
    if (which('sips')) execFileSync('sips', ['-s', 'format', 'png', file, '--out', png], { stdio: 'ignore' });
    else if (which('magick')) execFileSync('magick', [file, '-interlace', 'none', 'PNG32:' + png], { stdio: 'ignore' });
    else if (which('convert')) execFileSync('convert', [file, '-interlace', 'none', 'PNG32:' + png], { stdio: 'ignore' });
    else throw new Error(`can't read ${file}: only PNG is built in (install ImageMagick for other formats)`);
    return decodePNG(readFileSync(png));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- options ----------
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
export function coerce(key, v) {
  const def = Okifake.DEFAULTS[key];
  if (typeof def === 'boolean') return !(v === false || /^(0|false|no|off)$/i.test(String(v)));
  if (typeof def === 'number') { const n = Number(v); if (Number.isNaN(n)) throw new Error(`--${key} needs a number`); return n; }
  if (def === null && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

const USAGE = `okifake — make images look like Okimate 10 / 20 printouts

  okifake INPUT -o OUTPUT.png [options]
  okifake --text "TEXT" -o OUTPUT.png [options]
  okifake --text-file FILE -o OUTPUT.png [options]

Printer   --model oki10|oki20lo|oki20   --ribbon color|black
          --paper glossy|hammermill|copier|bond|thermal   --print-width INCHES
Picture   --pixels 80|160|320|640|0   --levels 2|3|5|9|17   --solid-text 0..1
          --diffusion 0..1   --brightness   --contrast   --saturation
Wear      --feed-error --band-gap --registration --pin-gap --darkness
          --roughness --age 0..1  --dead-pin  --tractor
Output    --ppi 150|300|600   --margin INCHES   --seed N
          --paper-color '#fcf9f0'   --paper-shade 0 (flat paper texture)
          --options '{"json":"settings"}'   key=value also works
Info      --list   --help`;

export function parseArgs(argv) {
  const opt = {}; let input = null, output = null;
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '-h' || a === '--help') { opt.help = true; continue; }
    if (a === '--list') { opt.list = true; continue; }
    if (a === '-o' || a === '--output') { output = val(); continue; }
    if (a === '--text') { opt.text = val().replace(/\\n/g, '\n'); continue; }
    if (a === '--text-file') { opt.text = readFileSync(val(), 'utf8'); continue; }
    if (a === '--options') { Object.assign(opt, JSON.parse(val())); continue; }
    let key, v;
    if (a.startsWith('--')) {
      a = a.slice(2);
      const eq = a.indexOf('=');
      if (eq >= 0) { key = camel(a.slice(0, eq)); v = a.slice(eq + 1); }
      else if (a.startsWith('no-') && typeof Okifake.DEFAULTS[camel(a.slice(3))] === 'boolean') { key = camel(a.slice(3)); v = false; }
      else {
        key = camel(a);
        if (!(key in Okifake.DEFAULTS)) throw new Error(`unknown option --${a}`);
        v = typeof Okifake.DEFAULTS[key] === 'boolean' && (i + 1 >= argv.length || argv[i + 1].startsWith('-') || !/^(0|1|true|false|yes|no|on|off)$/i.test(argv[i + 1])) ? true : val();
      }
    } else if (/^[a-zA-Z-]+=/.test(a) && !existsSync(a)) {
      const eq = a.indexOf('='); key = camel(a.slice(0, eq)); v = a.slice(eq + 1);
    } else { if (input) throw new Error(`extra argument ${a}`); input = a; continue; }
    if (!(key in Okifake.DEFAULTS)) throw new Error(`unknown option ${key}`);
    opt[key] = coerce(key, v);
  }
  return { input, output, opt };
}

export async function renderFile(input, output, opt, log = () => {}) {
  const src = typeof opt.text === 'string' ? null : readImage(input);
  const r = await Okifake.render(src, opt, null, { progress: log });
  writeFileSync(output, encodePNG(r.W, r.H, r.data, r.ppi));
  return r;
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error('okifake: ' + e.message + '\n\n' + USAGE); process.exit(2); }
  const { input, output, opt } = args;
  if (opt.help) { console.log(USAGE); return; }
  if (opt.list) {
    console.log('models:  ' + Object.entries(Okifake.MODELS).map(([k, m]) => `${k} (${m.name})`).join(', '));
    console.log('papers:  ' + Object.entries(Okifake.PAPERS).map(([k, p]) => `${k} (${p.name})`).join(', '));
    console.log('text colors: ' + Object.keys(Okifake.TEXT_COLORS).map(c => `{${c}}`).join(' '));
    console.log('defaults: ' + JSON.stringify(Okifake.DEFAULTS));
    return;
  }
  if (!output || (!input && typeof opt.text !== 'string')) { console.error(USAGE); process.exit(2); }
  delete opt.help; delete opt.list;
  const quiet = process.env.OKIFAKE_QUIET;
  const r = await renderFile(input && resolve(input), resolve(output), opt, m => { if (!quiet && !/…$/.test(m)) console.error(m); });
  if (!quiet) console.error(`wrote ${output} (${(r.W / r.ppi).toFixed(2)}×${(r.H / r.ppi).toFixed(2)} in)`);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(e => { console.error('okifake: ' + e.message); process.exit(1); });
}
