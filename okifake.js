/*
 * okifake.js — simulate Okimate 10 / Okimate 20 thermal-transfer printouts.
 *
 * Model (from the Okidata manuals and period printouts):
 *  - The printhead is a column of heat elements (Okimate 10: 7 dots used for
 *    graphics at 60x72 dpi; Okimate 20: 24 dots at 120x144 dpi). The image is
 *    printed in horizontal bands one head-height tall.
 *  - The color ribbon has yellow, magenta and cyan panels. Each band gets three
 *    passes (Y, then M, then C); colors mix by overprinting wax. There is no
 *    black panel — black is Y+M+C. Tints come from ordered dot patterns.
 *  - Wax only transfers where the paper touches the head, so rough paper drops
 *    out dots; feed errors between bands leave thin gaps or dark overlaps, and
 *    the color passes don't register perfectly.
 */
(function (global) {
  'use strict';

  const MODELS = {
    oki10:   { name: 'Okimate 10',                hdpi: 60,  vdpi: 72,  pins: 7,  dotW: 1.0 },
    oki20lo: { name: 'Okimate 20 · 8-dot 60×72',  hdpi: 60,  vdpi: 72,  pins: 8,  dotW: 1.0 },
    oki20:   { name: 'Okimate 20 · 24-dot 120×144', hdpi: 120, vdpi: 144, pins: 24, dotW: 1.12 },
  };

  // rough: share of the surface that is a "valley" the wax can't reach.
  // edge: how ragged dot edges are. shade: visible paper texture.
  const PAPERS = {
    glossy:     { name: 'Okidata coated (glossy)',          color: [252, 252, 250], rough: 0.004, edge: 0.10, shade: 0.010 },
    hammermill: { name: 'Hammermill thermal-transfer',      color: [251, 250, 246], rough: 0.015, edge: 0.16, shade: 0.020 },
    copier:     { name: 'Plain copier paper',               color: [247, 247, 242], rough: 0.11,  edge: 0.34, shade: 0.045 },
    bond:       { name: '25% cotton bond (too rough)',      color: [245, 241, 230], rough: 0.45,  edge: 0.55, shade: 0.075 },
    thermal:    { name: 'Thermal paper (no ribbon)',        color: [238, 240, 239], rough: 0.0,   edge: 0.22, shade: 0.012 },
  };

  // "ruby red, jet black, lemon yellow, sky blue" — Antic, Oct 1986.
  const INKS = {
    Y: [248, 212, 30],
    M: [222, 44, 118],
    C: [30, 136, 206],
    K: [30, 28, 32],    // black ribbon
    T: [58, 56, 74],    // thermal paper image (blue-black)
  };

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  // Pattern phase per ribbon panel: Y and C share dots, M fills the gaps.
  const PHASE = [[0, 0], [1, 0], [0, 2]];

  // ---------- color helpers ----------
  const s2l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const l2s = v => { v = v <= 0 ? 0 : v >= 1 ? 1 : v; return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
  const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) S2L[i] = s2l(i);
  const L2S = new Uint8ClampedArray(4097); for (let i = 0; i <= 4096; i++) L2S[i] = Math.round(l2s(i / 4096));
  const toS = v => L2S[v <= 0 ? 0 : v >= 1 ? 4096 : (v * 4096 + 0.5) | 0];
  const linRGB = c => c.map(s2l);

  function lab(r, g, b) { // linear rgb -> CIE Lab (D65)
    let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  // ---------- random ----------
  function rngFrom(seed) {
    let a = seed >>> 0;
    const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    rnd.gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return rnd;
  }

  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }

  // Value noise octave added into `out` (cell sizes in px; cx != cy gives fibre streaks).
  function addNoise(out, W, H, cx, cy, amp, rnd) {
    cx = Math.max(1, cx); cy = Math.max(1, cy);
    const gw = Math.ceil(W / cx) + 2, gh = Math.ceil(H / cy) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const tx = new Float32Array(W), x0s = new Int32Array(W);
    for (let x = 0; x < W; x++) { const f = x / cx, i = f | 0, t = f - i; x0s[x] = i; tx[x] = t * t * (3 - 2 * t); }
    for (let y = 0; y < H; y++) {
      const f = y / cy, j = f | 0; let t = f - j; t = t * t * (3 - 2 * t);
      const r0 = j * gw, r1 = r0 + gw, row = y * W;
      for (let x = 0; x < W; x++) {
        const i = x0s[x], u = tx[x];
        const a = g[r0 + i] + (g[r0 + i + 1] - g[r0 + i]) * u;
        const b = g[r1 + i] + (g[r1 + i + 1] - g[r1 + i]) * u;
        out[row + x] += amp * (a + (b - a) * t);
      }
    }
  }

  // Rescale a noise field to ~uniform [0,1] using its mean/std (Gaussian CDF).
  function uniformize(a) {
    let m = 0, v = 0; const n = a.length;
    for (let i = 0; i < n; i += 7) m += a[i];
    m /= Math.ceil(n / 7);
    for (let i = 0; i < n; i += 7) v += (a[i] - m) ** 2;
    const sd = Math.sqrt(v / Math.ceil(n / 7)) || 1, k = 1 / (sd * Math.SQRT2);
    for (let i = 0; i < n; i++) a[i] = 0.5 * (1 + erf((a[i] - m) * k));
  }

  const smooth = (e0, e1, x) => { const t = (x - e0) / (e1 - e0); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

  // ---------- palette ----------
  // A palette entry is a level (0..1) per ribbon panel; its predicted color is the
  // average reflectance of the 4x4 ordered-dither tile it prints as.
  function buildPalette(o) {
    const L = o.levels, vals = []; for (let k = 0; k < L; k++) vals.push(k / (L - 1));
    const paper = o.paperLin, inks = o.inksLin, nch = inks.length;
    const cov = 1 - o.pinGap * 0.8;
    const combos = [];
    const rec = (pre) => { if (pre.length === nch) { combos.push(pre); return; } for (const v of vals) rec(pre.concat(v)); };
    rec([]);
    const pal = combos.map(lv => {
      const acc = [0, 0, 0];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const c = paper.slice();
        for (let ch = 0; ch < nch; ch++) {
          const ph = o.mono ? [0, 0] : PHASE[ch];
          if (lv[ch] > bayer(x + ph[0], y + ph[1])) for (let k = 0; k < 3; k++) c[k] *= inks[ch][k];
        }
        for (let k = 0; k < 3; k++) acc[k] += cov * c[k] + (1 - cov) * paper[k];
      }
      const lin = acc.map(v => v / 16);
      return { lv, lin, lab: lab(lin[0], lin[1], lin[2]) };
    });
    return pal;
  }

  // 32^3 sRGB lookup -> nearest palette entry (CIE76 in Lab).
  function buildLUT(pal, mono) {
    const N = 32, lut = new Uint16Array(N * N * N);
    for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
      const lr = s2l(r * 255 / (N - 1)), lg = s2l(g * 255 / (N - 1)), lb = s2l(b * 255 / (N - 1));
      const q = lab(lr, lg, lb);
      let best = 0, bd = Infinity;
      for (let i = 0; i < pal.length; i++) {
        const p = pal[i].lab;
        const d = mono ? (q[0] - p[0]) ** 2 : (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      lut[(r * N + g) * N + b] = best;
    }
    return lut;
  }
  const lutIndex = (lut, r, g, b) => lut[((Math.round(r * 31 / 255)) * 32 + Math.round(g * 31 / 255)) * 32 + Math.round(b * 31 / 255)];

  const cache = new Map();
  function paletteFor(o) {
    const key = JSON.stringify([o.levels, o.paperLin, o.inksLin, o.pinGap, o.mono]);
    if (!cache.has(key)) {
      if (cache.size > 6) cache.clear();
      const pal = buildPalette(o);
      cache.set(key, { pal, lut: buildLUT(pal, o.mono) });
    }
    return cache.get(key);
  }

  const tick = () => new Promise(r => setTimeout(r, 0));

  // ---------- text & line-art detection ----------
  // Min or max filter with a (2r+1)^2 square window (van Herk / Gil-Werman, O(n)).
  function morph(src, W, H, r, isMax) {
    const k = 2 * r + 1, tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    const n = Math.max(W, H) + 2 * r;
    const line = new Float32Array(n), g = new Float32Array(n), h = new Float32Array(n);
    const pad = isMax ? -Infinity : Infinity;
    const pass = (from, to, len, count, along, across) => {
      const m = len + 2 * r;
      for (let c = 0; c < count; c++) {
        const base = c * across;
        for (let i = 0; i < m; i++) { const j = i - r; line[i] = j < 0 || j >= len ? pad : from[base + j * along]; }
        for (let i = 0; i < m; i++) g[i] = i % k === 0 ? line[i] : isMax ? Math.max(g[i - 1], line[i]) : Math.min(g[i - 1], line[i]);
        for (let i = m - 1; i >= 0; i--) h[i] = i === m - 1 || (i + 1) % k === 0 ? line[i] : isMax ? Math.max(h[i + 1], line[i]) : Math.min(h[i + 1], line[i]);
        for (let j = 0; j < len; j++) { const a = h[j], b = g[j + 2 * r]; to[base + j * along] = isMax ? (a > b ? a : b) : (a < b ? a : b); }
      }
    };
    pass(src, tmp, W, H, 1, W);
    pass(tmp, out, H, W, W, 1);
    return out;
  }

  // Standard deviation over a (2R+1)^2 box, via summed-area tables.
  function localStd(a, W, H, R) {
    const W1 = W + 1, s1 = new Float64Array(W1 * (H + 1)), s2 = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) {
      let r1 = 0, r2 = 0;
      for (let x = 0; x < W; x++) {
        const v = a[y * W + x]; r1 += v; r2 += v * v;
        s1[(y + 1) * W1 + x + 1] = s1[y * W1 + x + 1] + r1;
        s2[(y + 1) * W1 + x + 1] = s2[y * W1 + x + 1] + r2;
      }
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), n = (y1 - y0) * (x1 - x0);
        const A = y1 * W1 + x1, B = y0 * W1 + x1, C = y1 * W1 + x0, D = y0 * W1 + x0;
        const m = (s1[A] - s1[B] - s1[C] + s1[D]) / n, m2 = (s2[A] - s2[B] - s2[C] + s2[D]) / n;
        out[y * W + x] = Math.sqrt(Math.max(0, m2 - m * m));
      }
    }
    return out;
  }

  // ---------- pixel sources (no canvas needed, so the engine runs in Node) ----------
  // A pixel source is { width, height, data } with RGBA bytes, like ImageData.
  function toPixels(src) {
    if (src && src.data && src.width && src.height) return src;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h);
    return x.getImageData(0, 0, w, h);
  }

  // Resample RGBA onto a white background: box (area) average when shrinking,
  // nearest neighbour when `nearest` is set or when enlarging.
  function resample(px, dW, dH, nearest) {
    const { width: sW, height: sH, data: s } = px, out = new Uint8ClampedArray(dW * dH * 4);
    const put = (q, r, g, b, a) => { // composite over white
      const k = a / 255; out[q] = r * k + 255 * (1 - k); out[q + 1] = g * k + 255 * (1 - k); out[q + 2] = b * k + 255 * (1 - k); out[q + 3] = 255;
    };
    if (nearest || dW >= sW) {
      for (let y = 0; y < dH; y++) {
        const sy = Math.min(sH - 1, Math.floor((y + 0.5) * sH / dH));
        for (let x = 0; x < dW; x++) {
          const p = (sy * sW + Math.min(sW - 1, Math.floor((x + 0.5) * sW / dW))) * 4;
          put((y * dW + x) * 4, s[p], s[p + 1], s[p + 2], s[p + 3]);
        }
      }
      return out;
    }
    const fx = sW / dW, fy = sH / dH;
    // per destination column: source span with fractional weights at the ends
    const spans = [];
    for (let x = 0; x < dW; x++) {
      const a = x * fx, b = a + fx, w = [];
      let tot = 0;
      for (let i = Math.floor(a); i < Math.min(sW, Math.ceil(b)); i++) { const k = Math.min(b, i + 1) - Math.max(a, i); w.push(i, k); tot += k; }
      w.tot = tot;
      spans.push(w);
    }
    const row = new Float64Array(dW * 4);
    for (let y = 0; y < dH; y++) {
      row.fill(0);
      const a = y * fy, b = a + fy;
      let wy = 0;
      for (let j = Math.floor(a); j < Math.min(sH, Math.ceil(b)); j++) {
        const ky = Math.min(b, j + 1) - Math.max(a, j); wy += ky;
        const base = j * sW * 4;
        for (let x = 0; x < dW; x++) {
          const w = spans[x];
          let r = 0, g = 0, bl = 0, al = 0;
          for (let t = 0; t < w.length; t += 2) {
            const p = base + w[t] * 4, k = w[t + 1], ka = k * s[p + 3];
            r += s[p] * ka; g += s[p + 1] * ka; bl += s[p + 2] * ka; al += ka;
          }
          const q = x * 4; row[q] += r * ky; row[q + 1] += g * ky; row[q + 2] += bl * ky; row[q + 3] += al * ky;
        }
      }
      for (let x = 0; x < dW; x++) {
        const q = x * 4, al = row[q + 3], a8 = al / (wy * spans[x].tot); // mean alpha 0..255
        if (al > 0) put((y * dW + x) * 4, row[q] / al, row[q + 1] / al, row[q + 2] / al, a8);
        else put((y * dW + x) * 4, 255, 255, 255, 255);
      }
    }
    return out;
  }

  /*
   * Average the source into gw x gh cells. When `solidText` > 0, thin strokes that
   * stand out from their surroundings (text, outlines, line art) are found with
   * black-hat / top-hat filters. A cell mostly covered by such strokes is marked
   * as text and takes the strokes' color; other cells take the color of their
   * non-text pixels, so backgrounds don't pick up a tint from nearby lettering.
   */
  function sampleSource(px, gw, gh, solidText) {
    const iw = px.width, ih = px.height;
    let sW, sH, d;
    if (iw >= gw) {
      sW = Math.max(gw, Math.min(iw, 2400));
      sH = Math.max(gh, Math.round(sW * ih / iw));
      d = resample(px, sW, sH);
    } else { // upscale pixel art without blurring
      const k = Math.ceil(gw / iw);
      sW = iw * k; sH = Math.max(gh, Math.round(sW * ih / iw));
      d = resample(px, sW, sH, true);
    }
    const N = sW * sH, L = new Float32Array(N);
    for (let i = 0; i < N; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;

    let hat = null;
    if (solidText > 0) {
      const cellPx = sW / gw;
      const r = Math.max(2, Math.min(16, Math.round(cellPx * 1.25) + 1));
      const T = 0.5 - 0.35 * Math.min(1, solidText);
      const close = morph(morph(L, sW, sH, r, true), sW, sH, r, false); // background behind dark strokes
      const open = morph(morph(L, sW, sH, r, false), sW, sH, r, true);  // background behind light strokes
      // Text sits on a flat or smoothly shaded background; picture detail sits in
      // texture. Require the estimated background to be smooth around the stroke.
      const R = 2 * r, S = 0.035 + 0.04 * Math.min(1, solidText);
      const sdClose = localStd(close, sW, sH, R), sdOpen = localStd(open, sW, sH, R);
      hat = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const dark = sdClose[i] < S ? close[i] - L[i] : 0;
        const light = sdOpen[i] < S ? L[i] - open[i] : 0;
        const v = Math.max(dark, light);
        hat[i] = v > T ? v : 0;
      }
    }

    const acc = new Float64Array(gw * gh * 8); // all rgb,n | text rgb (weighted), w, n
    const cxOf = new Int32Array(sW);
    for (let i = 0; i < sW; i++) cxOf[i] = Math.min(gw - 1, Math.floor(i * gw / sW));
    for (let y = 0; y < sH; y++) {
      const cy = Math.min(gh - 1, Math.floor(y * gh / sH));
      for (let xx = 0; xx < sW; xx++) {
        const i = y * sW + xx, q = (cy * gw + cxOf[xx]) * 8, p = i * 4;
        const t = hat ? hat[i] : 0;
        if (t > 0) {
          acc[q + 3] += d[p] * t; acc[q + 4] += d[p + 1] * t; acc[q + 5] += d[p + 2] * t; acc[q + 6] += t; acc[q + 7]++;
        } else {
          acc[q] += d[p]; acc[q + 1] += d[p + 1]; acc[q + 2] += d[p + 2];
        }
      }
    }
    // pixel counts per cell
    const cnt = new Float64Array(gw * gh);
    for (let y = 0; y < sH; y++) {
      const cy = Math.min(gh - 1, Math.floor(y * gh / sH));
      for (let xx = 0; xx < sW; xx++) cnt[cy * gw + cxOf[xx]]++;
    }
    const rgb = new Uint8ClampedArray(gw * gh * 3), text = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) {
      const q = i * 8, nt = acc[q + 7], nb = cnt[i] - nt;
      if (nt > 0 && nt >= cnt[i] * 0.18) {
        text[i] = 1;
        rgb[i * 3] = acc[q + 3] / acc[q + 6]; rgb[i * 3 + 1] = acc[q + 4] / acc[q + 6]; rgb[i * 3 + 2] = acc[q + 5] / acc[q + 6];
      } else if (nb > 0) {
        rgb[i * 3] = acc[q] / nb; rgb[i * 3 + 1] = acc[q + 1] / nb; rgb[i * 3 + 2] = acc[q + 2] / nb;
      } else {
        rgb[i * 3] = acc[q + 3] / acc[q + 6]; rgb[i * 3 + 1] = acc[q + 4] / acc[q + 6]; rgb[i * 3 + 2] = acc[q + 5] / acc[q + 6];
      }
    }
    return { rgb, text };
  }

  // ---------- text mode ----------
  // Text prints with the Okimate 10's own 10-cpi font on a 1/120" x 1/72" grid,
  // one line (12 rows, 6 lpi) per head pass.
  const TEXT_MODEL = { name: 'Okimate 10 text · 10 cpi', hdpi: 120, vdpi: 72, pins: 12, dotW: 1.0 };
  const font = () => {
    if (!global.OkimateFont) throw new Error('okifake-font.js is not loaded');
    return global.OkimateFont;
  };

  // Ribbon levels (Y, M, C) for the color ribbon's text colors. The manual lists
  // red, orange, yellow, green, blue, purple and black; tints use checker dots.
  const TEXT_COLORS = {
    black: [1, 1, 1], yellow: [1, 0, 0], magenta: [0, 1, 0], cyan: [0, 0, 1],
    red: [1, 1, 0], orange: [1, 0.5, 0], green: [1, 0, 1], blue: [0, 1, 1],
    purple: [0, 1, 0.5], pink: [0, 0.5, 0], brown: [1, 1, 0.5], gray: [0.5, 0.5, 0.5],
  };

  // Split text into lines of {ch, color}; {red} … {black} tags switch color.
  function layoutText(text) {
    const lines = [];
    let color = 'black', cols = 0;
    for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      const line = [];
      const re = /\{([a-z]+)\}/gi;
      let last = 0, m;
      const push = s => {
        for (const ch of s) {
          if (ch === '\t') { do line.push({ ch: ' ', color }); while (line.length % 8); }
          else line.push({ ch, color });
        }
      };
      while ((m = re.exec(raw))) {
        const name = m[1].toLowerCase();
        if (!TEXT_COLORS[name]) continue;
        push(raw.slice(last, m.index)); color = name; last = re.lastIndex;
      }
      push(raw.slice(last));
      cols = Math.max(cols, line.length);
      lines.push(line);
    }
    while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    return { lines, cols };
  }

  function textPlanes(layout, dotsW, dotsH, nch, mono, deadPin) {
    const F = font(), planes = [];
    for (let ch = 0; ch < nch; ch++) planes.push(new Uint8Array(dotsW * dotsH));
    const dead = deadPin ? 5 : -1;
    layout.lines.forEach((line, li) => line.forEach((c, ci) => {
      if (c.ch === ' ') return;
      const g = F.glyph(c.ch), lv = TEXT_COLORS[c.color];
      const x0 = ci * F.cell + F.xOffset, y0 = li * F.lineRows + 1;
      for (let gy = 0; gy < F.H; gy++) {
        if (gy === dead) continue;
        for (let gx = 0; gx < F.W; gx++) {
          if (!g[gy * F.W + gx]) continue;
          const x = x0 + gx, y = y0 + gy, i = y * dotsW + x;
          for (let ch = 0; ch < nch; ch++) {
            const level = mono ? 1 : lv[ch], ph = PHASE[ch];
            // tints are checkered at the head's real dot size (two columns)
            if (level >= 1 || level > bayer((x >> 1) + ph[0], y + ph[1])) planes[ch][i] = 1;
          }
        }
      }
    }));
    return planes;
  }

  /**
   * Render a printout.
   * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} src
   * @param {object} opt   see DEFAULTS
   * @param {HTMLCanvasElement} out  output canvas (resized)
   * @param {object} [hooks] { progress(msg), animate: {bandsPerSec}, signal: {cancelled} }
   */
  async function render(src, opt, out, hooks = {}) {
    const o = Object.assign({}, DEFAULTS, opt);
    const textMode = typeof o.text === 'string';
    const model = textMode ? TEXT_MODEL : MODELS[o.model], paperDef = PAPERS[o.paper];
    const rnd = rngFrom(o.seed);
    const say = m => hooks.progress && hooks.progress(m);
    const dead = () => hooks.signal && hooks.signal.cancelled;

    const ribbon = o.paper === 'thermal' ? 'thermal' : o.ribbon;
    const mono = ribbon !== 'color';
    const age = o.age;

    // --- paper & inks (with aging) ---
    const paperBase = o.paperColor ? parseColor(o.paperColor) : paperDef.color;
    const paperS = paperBase.map((v, k) => v + ([234, 212, 168][k] - v) * age * 0.85);
    const paperLin = linRGB(paperS);
    const fade = (c, f) => c.map(v => v + (255 - v) * f);
    const inkS = ribbon === 'color' ? [fade(INKS.Y, age * 0.35), fade(INKS.M, age * 0.25), fade(INKS.C, age * 0.18)]
      : ribbon === 'black' ? [fade(INKS.K, age * 0.1)] : [fade(INKS.T, age * 0.45)];
    const inksLin = inkS.map(linRGB); // wax layers act as multiplicative filters
    const nch = inksLin.length;

    // --- geometry ---
    let dotsW, dotsH, iw, ih, layout = null;
    if (textMode) {
      layout = layoutText(o.text);
      dotsW = Math.max(1, layout.cols) * font().cell;
      dotsH = Math.max(1, layout.lines.length) * font().lineRows;
    } else {
      src = toPixels(src);
      iw = src.width; ih = src.height;
      const printW = o.printWidth, printH = printW * ih / iw;
      dotsW = Math.max(8, Math.round(printW * model.hdpi));
      dotsH = Math.max(model.pins, Math.round(printH * model.vdpi));
    }
    const pins = model.pins, nb = Math.ceil(dotsH / pins);
    const ppi = o.ppi, px = ppi / model.hdpi, py = ppi / model.vdpi;
    const margin = o.margin * ppi, tractor = o.tractor ? 0.5 * ppi : 0;
    const imgW = dotsW * px, imgH = dotsH * py + nb * o.bandGap * py;
    const W = Math.round(imgW + 2 * margin + 2 * tractor), H = Math.round(imgH + 2 * margin);
    const ox = tractor + margin, oy = margin;

    let planes;
    if (textMode) {
      say('Typing…');
      planes = textPlanes(layout, dotsW, dotsH, nch, mono, o.deadPin);
    } else {
    // --- 1. sample the source on the "pixel" grid ---
    say('Sampling image…');
    const pixelMode = o.pixels > 0;
    const gw = pixelMode ? Math.min(o.pixels, dotsW) : dotsW;
    const gh = pixelMode ? Math.max(1, Math.round(gw * ih / iw)) : dotsH;
    const { rgb: sd, text: textCell } = sampleSource(src, gw, gh, o.solidText);

    // --- 2. map to ribbon palette ---
    say('Separating colors…'); await tick();
    const { pal, lut } = paletteFor({ levels: o.levels, paperLin, inksLin, pinGap: o.pinGap, mono });
    // Text and line art print in solid ribbon colors only (no tint patterns).
    const solids = [];
    pal.forEach((p, i) => { if (p.lv.every(v => v === 0 || v === 1)) solids.push(i); });
    const cells = new Uint16Array(gw * gh);
    const work = new Float32Array(gw * gh * 3);
    const br = o.brightness, ct = o.contrast, sat = o.saturation;
    for (let i = 0, n = gw * gh; i < n; i++) {
      let r = sd[i * 3] / 255, g = sd[i * 3 + 1] / 255, b = sd[i * 3 + 2] / 255;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      if (mono) { r = g = b = y; } else { r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
      r = (r - 0.5) * ct + 0.5 + br; g = (g - 0.5) * ct + 0.5 + br; b = (b - 0.5) * ct + 0.5 + br;
      // Map white to the paper (no ink) and keep things relative to paper white.
      work[i * 3] = s2l(Math.max(0, Math.min(1, r)) * 255) * paperLin[0];
      work[i * 3 + 1] = s2l(Math.max(0, Math.min(1, g)) * 255) * paperLin[1];
      work[i * 3 + 2] = s2l(Math.max(0, Math.min(1, b)) * 255) * paperLin[2];
    }
    const ed = o.diffusion;
    for (let y = 0; y < gh; y++) {
      const ltr = (y & 1) === 0;
      for (let k = 0; k < gw; k++) {
        const x = ltr ? k : gw - 1 - k, i = y * gw + x, j = i * 3;
        const r = work[j], g = work[j + 1], b = work[j + 2];
        if (textCell[i]) {
          // nearest solid color; text neither takes nor spreads diffusion error
          const q = lab(Math.max(0, r), Math.max(0, g), Math.max(0, b));
          let best = solids[0], bd = Infinity;
          for (const s of solids) {
            const p = pal[s].lab, d = mono ? (q[0] - p[0]) ** 2 : (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
            if (d < bd) { bd = d; best = s; }
          }
          cells[i] = best;
          continue;
        }
        const idx = lutIndex(lut, toS(r), toS(g), toS(b));
        cells[i] = idx;
        if (ed > 0) {
          const p = pal[idx].lin, er = (r - p[0]) * ed, eg = (g - p[1]) * ed, eb = (b - p[2]) * ed;
          const dx = ltr ? 1 : -1;
          const push = (xx, yy, w) => { if (xx < 0 || xx >= gw || yy >= gh || textCell[yy * gw + xx]) return; const q = (yy * gw + xx) * 3; work[q] += er * w; work[q + 1] += eg * w; work[q + 2] += eb * w; };
          push(x + dx, y, 7 / 16); push(x - dx, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + dx, y + 1, 1 / 16);
        }
      }
    }

    // --- 3. dot planes (which head element fires, per pass) ---
    say('Firing the printhead…'); await tick();
    const cellX = new Int32Array(dotsW), cellY = new Int32Array(dotsH);
    for (let x = 0; x < dotsW; x++) cellX[x] = Math.min(gw - 1, Math.floor((x + 0.5) * gw / dotsW));
    for (let y = 0; y < dotsH; y++) cellY[y] = Math.min(gh - 1, Math.floor((y + 0.5) * gh / dotsH));
    const deadPin = o.deadPin ? Math.min(pins - 1, Math.floor(pins * 0.6)) : -1;
    planes = [];
    for (let ch = 0; ch < nch; ch++) {
      const pl = new Uint8Array(dotsW * dotsH), ph = mono ? [0, 0] : PHASE[ch];
      for (let y = 0; y < dotsH; y++) {
        if (y % pins === deadPin) continue;
        const crow = cellY[y] * gw;
        for (let x = 0; x < dotsW; x++) {
          if (pal[cells[crow + cellX[x]]].lv[ch] > bayer(x + ph[0], y + ph[1])) pl[y * dotsW + x] = 1;
        }
      }
      planes.push(pl);
    }
    } // end image mode

    // --- 4. paper surface ---
    say('Making paper…'); await tick();
    if (dead()) return null;
    const mm = ppi / 25.4;
    const F = new Float32Array(W * H);
    addNoise(F, W, H, 0.10 * mm, 0.10 * mm, 0.30, rnd);
    addNoise(F, W, H, 0.45 * mm, 0.16 * mm, 0.28, rnd); // fibres run roughly along the sheet
    addNoise(F, W, H, 0.16 * mm, 0.50 * mm, 0.18, rnd);
    addNoise(F, W, H, 1.2 * mm, 1.2 * mm, 0.24, rnd);
    uniformize(F);
    const stain = new Float32Array(W * H);
    if (age > 0) {
      addNoise(stain, W, H, 18 * mm, 18 * mm, 0.6, rnd);
      addNoise(stain, W, H, 6 * mm, 6 * mm, 0.4, rnd);
      uniformize(stain);
      for (let i = 0; i < stain.length; i++) stain[i] = smooth(0.55, 1.0, stain[i]) * age;
    }

    // --- 5. lay down wax: rasterize head strikes pass by pass ---
    say('Printing bands…'); await tick();
    const masks = []; for (let ch = 0; ch < nch; ch++) masks.push(new Uint8ClampedArray(W * H));
    const densRow = []; for (let ch = 0; ch < nch; ch++) densRow.push(new Float32Array(H).fill(1));
    const bandTop = new Float32Array(nb + 1);
    const pg = o.pinGap, dotW = model.dotW * (0.94 + 0.12 * o.darkness);
    const reg = o.registration, feed = o.feedError;
    let shift = 0;
    for (let b = 0; b < nb; b++) {
      const bs = shift + rnd.gauss() * feed;
      shift += o.bandGap;
      bandTop[b] = oy + (b * pins + bs) * py;
      for (let ch = 0; ch < nch; ch++) {
        const rx = rnd.gauss() * reg + (ch ? rnd.gauss() * reg * 0.3 : 0);
        const ry = (ch ? rnd.gauss() * reg * 0.25 : 0);
        const dens = 1 - Math.min(0.08, Math.abs(rnd.gauss()) * 0.03);
        const mask = masks[ch], pl = planes[ch];
        const yA = Math.max(0, Math.floor(oy + (b * pins + bs + ry) * py)), yB = Math.min(H, Math.ceil(oy + ((b + 1) * pins + bs + ry) * py));
        for (let y = yA; y < yB; y++) densRow[ch][y] = dens;
        for (let dy = b * pins; dy < Math.min(dotsH, (b + 1) * pins); dy++) {
          const y0 = oy + (dy + bs + ry) * py + py * pg / 2, y1 = y0 + py * (1 - pg);
          const row = dy * dotsW;
          let x = 0;
          while (x < dotsW) {
            if (!pl[row + x]) { x++; continue; }
            let e = x; while (e < dotsW && pl[row + e]) e++;
            const x0 = ox + (x + rx) * px - (dotW - 1) * px / 2, x1 = ox + (e + rx) * px + (dotW - 1) * px / 2;
            fillRect(mask, W, H, x0, y0, x1, y1);
            x = e;
          }
        }
      }
    }
    bandTop[nb] = H;

    // --- 6. composite ---
    const D = new Uint8ClampedArray(W * H * 4);
    const hole = holes(W, H, ppi, o.tractor);
    const rough = paperDef.rough * (o.roughness ?? 1), edgeAmt = paperDef.edge, shadeAmt = o.paperShade ?? paperDef.shade;
    const heat = 0.85 + 0.3 * o.darkness;
    const stainLin = linRGB([196, 160, 104]);
    const kLo = rough * 0.62 - 0.035, kHi = rough * 0.62 + 0.035;

    function composite(y0, y1, upto) {
      y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H, Math.ceil(y1));
      for (let y = y0; y < y1; y++) {
        for (let x = 0, i = y * W; x < W; x++, i++) {
          const q = i * 4;
          if (hole && hole[i]) { D[q] = D[q + 1] = D[q + 2] = 0; D[q + 3] = 0; continue; }
          const f = F[i], s = stain[i];
          const sh = 1 - shadeAmt * (0.5 - f) * 2;
          let r = paperLin[0] * sh, g = paperLin[1] * sh, b = paperLin[2] * sh;
          if (s > 0) { r *= 1 + (stainLin[0] - 1) * s * 0.25; g *= 1 + (stainLin[1] - 1) * s * 0.25; b *= 1 + (stainLin[2] - 1) * s * 0.25; }
          if (hole && hole.perf && hole.perf[i]) { r *= 0.8; g *= 0.8; b *= 0.8; }
          const contact = rough > 0 ? smooth(kLo, kHi, f) : 1;
          for (let ch = 0; ch < upto; ch++) {
            const m = masks[ch][i];
            if (!m) continue;
            const t = (m / 255) * heat + (f - 0.5) * edgeAmt;
            const a = smooth(0.36, 0.64, t) * contact * densRow[ch][y];
            if (a <= 0) continue;
            const ink = inksLin[ch];
            r *= 1 - a * (1 - ink[0]); g *= 1 - a * (1 - ink[1]); b *= 1 - a * (1 - ink[2]);
          }
          D[q] = toS(r); D[q + 1] = toS(g); D[q + 2] = toS(b); D[q + 3] = 255;
        }
      }
    }

    const result = () => ({ W, H, dotsW, dotsH, bands: nb, data: D, ppi });
    if (!out || !out.getContext) { // headless: return the pixels
      say('Compositing…');
      composite(0, H, nch);
      say(`${model.name} · ${dotsW}×${dotsH} dots · ${nb} bands · ${W}×${H}px @ ${ppi}ppi`);
      return result();
    }
    const img = new ImageData(D, W, H);
    out.width = W; out.height = H;
    const octx = out.getContext('2d');
    if (hooks.animate) {
      composite(0, H, 0);
      octx.putImageData(img, 0, 0);
      const delay = 1000 / Math.max(0.5, hooks.animate.bandsPerSec || 4);
      for (let b = 0; b < nb; b++) {
        const yTop = b === 0 ? 0 : bandTop[b], yBot = b === nb - 1 ? H : bandTop[b + 1];
        for (let ch = 1; ch <= nch; ch++) {
          if (dead()) return null;
          say(`Band ${b + 1}/${nb} · ${mono ? 'strike' : ['yellow', 'magenta', 'cyan'][ch - 1]} pass`);
          composite(yTop, yBot, ch);
          octx.putImageData(img, 0, 0, 0, Math.floor(yTop), W, Math.ceil(yBot - yTop) + 1);
          await new Promise(r => setTimeout(r, delay / nch));
        }
      }
    } else {
      say('Compositing…'); await tick();
      composite(0, H, nch);
      octx.putImageData(img, 0, 0);
    }
    say(`${model.name} · ${dotsW}×${dotsH} dots · ${nb} bands · ${W}×${H}px @ ${ppi}ppi`);
    return result();
  }

  // Additive area-coverage rasterizer (gives anti-aliased dot edges).
  function fillRect(m, W, H, x0, y0, x1, y1) {
    if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return;
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1) - 1);
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1) - 1);
    for (let y = ya; y <= yb; y++) {
      const cy = Math.min(y + 1, y1) - Math.max(y, y0);
      if (cy <= 0) continue;
      const row = y * W;
      for (let x = xa; x <= xb; x++) {
        const cx = Math.min(x + 1, x1) - Math.max(x, x0);
        if (cx <= 0) continue;
        m[row + x] += 255 * cx * cy + 0.5;
      }
    }
  }

  // Tractor-feed holes (transparent) and perforation lines.
  function holes(W, H, ppi, on) {
    if (!on) return null;
    const h = new Uint8Array(W * H), perf = new Uint8Array(W * H);
    const r = 0.078 * ppi, cx = [0.25 * ppi, W - 0.25 * ppi];
    for (let yc = 0.25 * ppi; yc < H + r; yc += 0.5 * ppi) {
      for (const xc of cx) {
        for (let y = Math.max(0, Math.floor(yc - r)); y < Math.min(H, Math.ceil(yc + r)); y++)
          for (let x = Math.max(0, Math.floor(xc - r)); x < Math.min(W, Math.ceil(xc + r)); x++)
            if ((x - xc) ** 2 + (y - yc) ** 2 <= r * r) h[y * W + x] = 1;
      }
    }
    const lw = Math.max(1, Math.round(ppi / 300));
    for (const xl of [Math.round(0.5 * ppi), Math.round(W - 0.5 * ppi)]) {
      for (let y = 0; y < H; y++) {
        if ((y % Math.round(0.06 * ppi)) > 0.035 * ppi) continue;
        for (let k = 0; k < lw; k++) perf[y * W + xl + k] = 1;
      }
    }
    h.perf = perf;
    return h;
  }

  // '#rrggbb', 'rgb(r,g,b)' or [r,g,b]
  function parseColor(c) {
    if (Array.isArray(c)) return c.map(Number);
    const h = String(c).trim().match(/^#?([0-9a-f]{6})$/i);
    if (h) return [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16));
    const m = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    throw new Error('Bad paper color: ' + c);
  }

  const DEFAULTS = {
    model: 'oki10', ribbon: 'color', paper: 'hammermill',
    printWidth: 7.5, pixels: 160, levels: 3, diffusion: 0, solidText: 0.5,
    brightness: 0, contrast: 1, saturation: 1.15,
    feedError: 0.2, bandGap: 0.06, registration: 0.25, pinGap: 0.1,
    darkness: 0.5, roughness: 1, deadPin: false, age: 0,
    tractor: false, margin: 0.3, ppi: 300, seed: 1985,
    paperColor: null, paperShade: null, // override the paper preset's color / texture
  };

  const api = { render, MODELS, PAPERS, INKS, DEFAULTS, TEXT_COLORS, resample };
  global.Okifake = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
