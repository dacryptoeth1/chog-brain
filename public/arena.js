// Pixel-art fighting arena. Everything is drawn on a 240x160 canvas (the Game Boy Advance resolution) and scaled
// up with hard pixels. The fighters are original, procedurally drawn bodies; the real NFT art is each fighter's head.
(function () {
  const W = 240, H = 160, FEET = 134, INK = '#1a1020';

  // ---- tiny 3x5 pixel font ----
  const G = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', '#': '101111101111101', '/': '001001010100100', '-': '000000111000000', '.': '000000000000010',
    '+': '000010111010000', ':': '000010000010000', '!': '010010010000010', '?': '110001010000010', '%': '101001010100101',
  };
  const tw = (s, sc) => Math.max(0, String(s).length * 4 * sc - sc);
  function text(c, s, x, y, sc, col, out) {
    s = String(s).toUpperCase();
    const draw = (ox, oy, color) => {
      c.fillStyle = color;
      for (let i = 0; i < s.length; i++) {
        const g = G[s[i]]; if (!g) continue;
        for (let k = 0; k < 15; k++) if (g[k] === '1') c.fillRect(x + ox + (i * 4 + (k % 3)) * sc, y + oy + Math.floor(k / 3) * sc, sc, sc);
      }
    };
    if (out) { for (const [ox, oy] of [[-sc, 0], [sc, 0], [0, -sc], [0, sc], [sc, sc], [-sc, sc]]) draw(ox, oy, out); }
    draw(0, 0, col);
  }
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  function disc(c, cx, cy, r, col) { c.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const dx = Math.floor(Math.sqrt(r * r - dy * dy)); c.fillRect(Math.round(cx - dx), Math.round(cy + dy), dx * 2 + 1, 1); } }
  function pline(c, x0, y0, x1, y1, w, col) {
    c.fillStyle = col; const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + ((x1 - x0) * i) / n - w / 2), Math.round(y0 + ((y1 - y0) * i) / n - w / 2), w, w);
  }
  const rad = (d) => (d * Math.PI) / 180;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const lerp = (a, b, k) => a + (b - a) * k;

  const THEMES = [
    { wall: '#e6a14f', wall2: '#d28a35', pillar: '#f3e5c6', pillar2: '#d9c79b', roof: '#9a4f1f', roof2: '#c9702a', floor: '#b9c6d9', floor2: '#a2b2cb', grid: '#7d8fab', banner: '#ffffff', red: '#d9382c' },
    { wall: '#d96a82', wall2: '#bb4f6b', pillar: '#f6d9c9', pillar2: '#d8b3a4', roof: '#6b2b4a', roof2: '#8f3f63', floor: '#cfb2cf', floor2: '#b898b8', grid: '#8f6e8f', banner: '#fff4f4', red: '#c3263f' },
    { wall: '#3b4190', wall2: '#2d3275', pillar: '#98a0e0', pillar2: '#7279bf', roof: '#1b1e57', roof2: '#2a2f7a', floor: '#6670b3', floor2: '#545e9e', grid: '#3a4378', banner: '#dfe4ff', red: '#7f5bff' },
    { wall: '#3f9b73', wall2: '#2f805d', pillar: '#e1f3d4', pillar2: '#b8d3a8', roof: '#1f5b45', roof2: '#2f7a5c', floor: '#a9cbb7', floor2: '#90b6a1', grid: '#5f8f7a', banner: '#f4fff0', red: '#d6452f' },
    { wall: '#8c2030', wall2: '#6e1624', pillar: '#f0c2a4', pillar2: '#c99c82', roof: '#3a0c14', roof2: '#5a1522', floor: '#5d3a47', floor2: '#4a2c38', grid: '#2d1a22', banner: '#ffe0d0', red: '#ff3b3b' },
  ];

  function buildBackground(theme) {
    const T = THEMES[theme] || THEMES[0];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    rect(c, 0, 0, W, H, T.wall);
    // roof band
    for (let y = 22; y < 46; y += 6) rect(c, 0, y, W, 3, (y / 6) % 2 ? T.roof : T.roof2);
    for (let x = 0; x < W; x += 8) { rect(c, x, 40, 4, 6, T.roof); rect(c, x + 4, 42, 4, 4, T.roof2); }
    rect(c, 0, 46, W, 2, INK);
    // shutters
    for (const [x0, x1] of [[0, 72], [168, 240]]) {
      for (let y = 48; y < 112; y += 4) rect(c, x0, y, x1 - x0, 2, T.wall2);
    }
    // pillars with carvings
    for (const px of [72, 148]) {
      rect(c, px, 48, 20, 66, T.pillar); rect(c, px, 48, 3, 66, T.pillar2); rect(c, px + 17, 48, 3, 66, T.pillar2);
      for (let y = 56; y < 108; y += 10) { rect(c, px + 5, y, 10, 2, T.pillar2); rect(c, px + 8, y + 2, 4, 4, T.red); }
      rect(c, px - 2, 48, 24, 4, INK); rect(c, px - 2, 110, 24, 4, INK);
    }
    // arch window and banner
    rect(c, 100, 54, 40, 12, INK); rect(c, 104, 50, 32, 4, INK);
    rect(c, 92, 68, 56, 42, T.red); rect(c, 94, 70, 52, 38, T.banner);
    disc(c, 120, 89, 15, T.red); disc(c, 120, 89, 12, T.banner);
    // diamond emblem
    for (let i = 0; i < 9; i++) { const w = i < 5 ? i * 2 + 1 : (8 - i) * 2 + 1; rect(c, 120 - (w >> 1), 81 + i * 1, w, 1, T.red); }
    for (let i = 9; i < 14; i++) { const w = (13 - i) * 2 + 1; rect(c, 120 - (w >> 1), 81 + i, w, 1, T.red); }
    // guardian masks on both sides
    for (const mx of [26, 214]) {
      disc(c, mx, 96, 15, INK); disc(c, mx, 96, 13, T.pillar);
      rect(c, mx - 9, 90, 6, 6, INK); rect(c, mx + 3, 90, 6, 6, INK); rect(c, mx - 8, 91, 3, 3, '#fff'); rect(c, mx + 4, 91, 3, 3, '#fff');
      rect(c, mx - 8, 102, 16, 4, INK); for (let i = 0; i < 4; i++) rect(c, mx - 7 + i * 4, 102, 2, 3, '#fff');
      rect(c, mx - 16, 80, 6, 4, T.pillar2); rect(c, mx + 10, 80, 6, 4, T.pillar2);
    }
    // stone floor in perspective
    rect(c, 0, 112, W, 48, T.floor); rect(c, 0, 112, W, 2, INK);
    for (let i = 0; i < 5; i++) rect(c, 0, 120 + i * 9 + i * i, W, 1, T.grid);
    for (let k = -8; k <= 8; k++) pline(c, 120 + k * 9, 114, 120 + k * 26, 160, 1, T.grid);
    for (let k = -6; k <= 6; k += 2) pline(c, 120 + k * 12, 115, 120 + k * 30, 160, 1, T.floor2);
    return cv;
  }

  function outfit(f) {
    const src = Object.entries(f.brain.traits || {}).map(([k, v]) => k + v).join('|') || String(f.id);
    let h = 2166136261; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0;
    const hue = h % 360, hue2 = (hue + 140 + ((h >> 9) % 80)) % 360;
    return { suit: `hsl(${hue} 62% 46%)`, trim: `hsl(${hue2} 80% 62%)`, limb: `hsl(${hue} 30% 76%)`, dark: `hsl(${hue} 45% 22%)`, blade: `hsl(${(hue + 190) % 360} 70% 80%)`, faceBg: `hsl(${hue} 55% 60%)` };
  }

  function makeHead(im) {
    const c = document.createElement('canvas'); c.width = c.height = 26; const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.drawImage(im, 1, 1, 24, 24);
    x.fillStyle = INK;
    x.fillRect(0, 0, 26, 1); x.fillRect(0, 25, 26, 1); x.fillRect(0, 0, 1, 26); x.fillRect(25, 0, 1, 26);
    for (const [px, py] of [[1, 1], [24, 1], [1, 24], [24, 24]]) x.fillRect(px, py, 1, 1);
    for (const [px, py] of [[0, 0], [25, 0], [0, 25], [25, 25]]) x.clearRect(px, py, 1, 1);
    return c;
  }
  function fallbackHead(col) {
    const c = document.createElement('canvas'); c.width = c.height = 26; const x = c.getContext('2d');
    rect(x, 0, 0, 26, 26, INK); rect(x, 1, 1, 24, 24, col);
    rect(x, 6, 10, 4, 4, INK); rect(x, 16, 10, 4, 4, INK); rect(x, 8, 17, 10, 2, INK); rect(x, 6, 0, 4, 3, INK); rect(x, 16, 0, 4, 3, INK);
    return c;
  }

  function create(canvas) {
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const S = { bg: null, f: {}, floats: [], sparks: [], banner: null, shakeUntil: 0, score: 0, best: 0, stage: 1, mode: 'arena', boss: false, flashUntil: 0, beams: [] };

    function newFighter(side, d) {
      const col = outfit(d);
      const f = { side, id: d.id, x: side === 'p' ? 64 : 176, dir: side === 'p' ? 1 : -1, anim: null, hp: 1, max: 1, shown: 1, chip: 1, cd: 0, ko: false, win: false, winT: 0,
        col, phase: side === 'p' ? 0 : 1.7, head: fallbackHead(col.faceBg), glow: !!(d.art && d.art.sword && d.art.sword.glow), buf: document.createElement('canvas'), hand: { x: 0, y: 0 }, level: d.level || 0 };
      f.buf.width = f.buf.height = 96; f.bctx = f.buf.getContext('2d');
      if (d.nft && d.nft.image) { const im = new Image(); im.onload = () => { f.head = makeHead(im); }; im.src = d.nft.image; }
      return f;
    }

    function pose(f, now) {
      const P = { lean: 0, headDx: 0, headDy: 0, dx: 0, dy: 0, s: 12, armF: 55, armB: 35, lenF: 12, lenB: 12, legF: null, legB: null, fist: false, orb: 0, beam: false, shield: 0, flash: false };
      if (f.ko) { P.s = 62; P.lean = -6; P.headDx = -3; P.headDy = 7; P.armF = 14; P.armB = 8; return P; }
      const a = f.anim;
      if (!a) {
        if (f.win) { const k = Math.abs(Math.sin((now - f.winT) / 260)); P.dy = -k * 12; P.armF = 168; P.armB = 172; return P; }
        const b = Math.sin(now / 210 + f.phase); P.s = 12 + (b > 0 ? 3 : 0); P.armF = 55 + b * 5; P.armB = 35 - b * 4; return P;
      }
      const t = now - a.t0, p = Math.min(1, t / a.dur);
      switch (a.name) {
        case 'punch': {
          const fwd = p < 0.4 ? ease(p / 0.4) : p < 0.55 ? 1 : 1 - ease((p - 0.55) / 0.45);
          P.dx = fwd * 32; P.lean = p < 0.2 ? -3 : 4; P.armF = p < 0.2 ? -25 : 95; P.lenF = p < 0.2 ? 10 : 16; P.fist = p >= 0.2 && p < 0.7; P.armB = 20; P.s = 24; break;
        }
        case 'kick': {
          const fwd = p < 0.42 ? ease(p / 0.42) : p < 0.58 ? 1 : 1 - ease((p - 0.58) / 0.42);
          P.dx = fwd * 24; P.lean = -4; P.armF = 70; P.armB = -25; P.legB = -8; P.legF = p < 0.2 ? -35 : 82 * Math.min(1, fwd * 1.4); P.s = 14; break;
        }
        case 'special': {
          if (p < 0.26) { P.s = 46; P.armF = -50; P.armB = -60; P.orb = ease(p / 0.26) * 7; P.lean = -2; }
          else if (p < 0.5) { const k = ease((p - 0.26) / 0.24); P.dy = -k * 30; P.armF = P.armB = lerp(-50, 92, k); P.legF = 50 * k; P.legB = -35 * k; P.orb = 7 + k * 3; P.s = 12; }
          else if (p < 0.8) { P.dy = -30; P.armF = P.armB = 92; P.legF = 50; P.legB = -35; P.orb = 10; P.beam = true; }
          else { const k = (p - 0.8) / 0.2; P.dy = -30 * (1 - ease(k)); P.armF = P.armB = lerp(92, 55, k); P.legF = 50 * (1 - k); P.legB = -35 * (1 - k); P.s = 12 + 8 * k; }
          break;
        }
        case 'guard': P.s = 52; P.armF = 160; P.armB = 150; P.lean = -2; P.shield = 1; break;
        case 'dodge': { const k = Math.sin(p * Math.PI); P.dx = -18 * k; P.dy = -14 * k; P.lean = -5; P.armF = 20; P.armB = 15; P.s = 30; break; }
        case 'hurt': P.dx = -10 * (1 - p); P.lean = -5; P.headDx = -2 + (Math.round(Math.sin(t / 30) * 2)); P.armF = 10; P.armB = 5; P.flash = t < 130; P.s = 26; break;
        default: break;
      }
      if (p >= 1 && !a.hold) f.anim = null;
      return P;
    }

    function drawFighter(f, now) {
      const P = pose(f, now), c = f.bctx, K = f.col;
      c.clearRect(0, 0, 96, 96); c.save(); c.translate(48, 80 + Math.round(P.dy));
      const sRad = rad(P.s), hipY = -Math.round(17 * Math.cos(sRad)), lean = Math.round(P.lean);
      const shY = hipY - 14, hx = lean + Math.round(P.headDx), hy = shY - 10 + Math.round(P.headDy);
      const aF = P.legF != null ? P.legF : P.s, aB = P.legB != null ? P.legB : -P.s * 0.85;
      const leg = (hxj, ang, front) => {
        const fx = hxj + 17 * Math.sin(rad(ang)), fy = hipY + 17 * Math.cos(rad(ang));
        pline(c, hxj, hipY, fx, fy, 7, INK); pline(c, hxj, hipY, fx, fy, 5, front ? K.limb : K.limb);
        rect(c, fx - 2, fy - 3, 8, 5, INK); rect(c, fx - 1, fy - 2, 6, 3, K.dark);
      };
      const arm = (sx, sy, ang, len, glove) => {
        const ex = sx + len * Math.sin(rad(ang)), ey = sy + len * Math.cos(rad(ang));
        pline(c, sx, sy, ex, ey, 6, INK); pline(c, sx, sy, ex, ey, 4, K.limb);
        rect(c, ex - 3, ey - 3, 6, 6, INK); rect(c, ex - 2, ey - 2, 4, 4, glove || K.trim);
        return { x: ex, y: ey };
      };
      // sword in the back hand
      const bh = arm(lean - 5, shY + 3, P.armB, P.lenB);
      const sa = rad(160 + (P.armB - 35) * 0.5), bx = bh.x + 24 * Math.sin(sa), by = bh.y + 24 * Math.cos(sa);
      if (f.glow) pline(c, bh.x, bh.y, bx, by, 7, 'rgba(160,120,255,.45)');
      pline(c, bh.x, bh.y, bx, by, 5, INK); pline(c, bh.x, bh.y, bx, by, 3, K.blade); pline(c, bh.x + 1, bh.y - 1, bx + 1, by - 1, 1, '#fff');
      pline(c, bh.x - 4 * Math.cos(sa), bh.y + 4 * Math.sin(sa), bh.x + 4 * Math.cos(sa), bh.y - 4 * Math.sin(sa), 2, '#ffd166');
      leg(-3, aB, false);
      // torso
      rect(c, lean - 7, shY, 14, hipY - shY + 2, INK); rect(c, lean - 6, shY + 1, 12, hipY - shY, K.suit);
      rect(c, lean - 6, hipY - 4, 12, 3, K.trim); rect(c, lean - 2, shY + 3, 4, 4, K.trim);
      leg(3, aF, true);
      // head
      c.drawImage(f.head, Math.round(hx - 11), Math.round(hy - 10), 22, 22);
      // front arm
      f.hand = arm(lean + 5, shY + 3, P.armF, P.lenF, P.fist ? '#ffd166' : K.trim);
      if (P.armB === P.armF) {/* both arms forward during the special */}
      f.pose = { P, hipY, shY, lean, hx, hy };
      if (P.flash) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(-48, -80, 96, 96); c.globalCompositeOperation = 'source-over'; }
      if (f.ko) { for (let i = 0; i < 3; i++) { const ty = ((now / 55 + i * 5) % 16); rect(c, hx - 8 + i * 8, hy + 3 + ty, 2, 3, '#7dd3fc'); } }
      c.restore();
      return P;
    }

    function drawFx(now) {
      for (const s of S.sparks) {
        const t = (now - s.t0) / 280; if (t > 1) continue; const r0 = 3, rl = r0 + t * (s.big ? 18 : 11);
        for (let i = 0; i < 8; i++) { const an = (i * Math.PI) / 4; pline(ctx, s.x + Math.cos(an) * r0, s.y + Math.sin(an) * r0, s.x + Math.cos(an) * rl, s.y + Math.sin(an) * rl, s.big ? 3 : 2, i % 2 ? '#fff' : '#ffd166'); }
        disc(ctx, s.x, s.y, Math.max(1, Math.round((1 - t) * (s.big ? 7 : 4))), '#fff');
      }
      S.sparks = S.sparks.filter((s) => now - s.t0 < 280);
      for (const b of S.beams) {
        const t = (now - b.t0) / b.dur; if (t > 1) continue;
        const grow = Math.min(1, t * 2.2), len = Math.abs(b.x1 - b.x0) * grow, x = b.dir > 0 ? b.x0 : b.x0 - len, thick = 9 + Math.round(Math.sin(now / 40) * 2), fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        ctx.globalAlpha = fade; rect(ctx, x, b.y - thick - 3, len, thick * 2 + 6, b.c2); rect(ctx, x, b.y - thick, len, thick * 2, b.c1); rect(ctx, x, b.y - 4, len, 8, '#fff');
        for (let i = 0; i < len; i += 8) rect(ctx, x + ((i + now / 20) % Math.max(1, len)), b.y - thick - 5 + ((i * 7) % 5), 3, 3, '#fff');
        ctx.globalAlpha = 1;
      }
      S.beams = S.beams.filter((b) => now - b.t0 < b.dur);
    }

    function hud(now) {
      const L = S.f.p, R = S.f.e; if (!L || !R) return;
      for (const [f, left] of [[L, true], [R, false]]) {
        f.shown += (f.hp - f.shown) * 0.25; if (Math.abs(f.hp - f.shown) < 0.2) f.shown = f.hp;
        f.chip += (f.shown - f.chip) * 0.06;
        const ratio = Math.max(0, f.shown / f.max), chip = Math.max(0, f.chip / f.max);
        const bx = left ? 32 : 130, bw = 78;
        // portrait
        const fx = left ? 2 : 212; ctx.drawImage(f.head, fx, 1); rect(ctx, fx - 1, 0, 28, 1, '#fff'); rect(ctx, fx - 1, 28, 28, 1, '#fff'); rect(ctx, fx - 1, 0, 1, 29, '#fff'); rect(ctx, fx + 26, 0, 1, 29, '#fff');
        // name
        const name = 'CHOG ' + f.id; text(ctx, name, left ? bx : bx + bw - tw(name, 2), 2, 2, '#fff', INK);
        if (!left && S.boss) text(ctx, 'BOSS', bx, 4, 1, '#ff6b8a', INK);
        // hp bar
        rect(ctx, bx - 2, 13, bw + 4, 12, INK); rect(ctx, bx - 1, 14, bw + 2, 10, '#fff'); rect(ctx, bx, 15, bw, 8, '#1d2a66');
        const col = ratio > 0.5 ? '#3ddc6a' : ratio > 0.25 ? '#f2c230' : '#e8453c';
        const cw = Math.round(bw * chip), fw = Math.round(bw * ratio);
        rect(ctx, left ? bx : bx + bw - cw, 15, cw, 8, '#f6f0d0'); rect(ctx, left ? bx : bx + bw - fw, 15, fw, 8, col); rect(ctx, left ? bx : bx + bw - fw, 15, fw, 2, 'rgba(255,255,255,.45)');
        // special meter
        const ready = f.cd <= 0, fill = ready ? 1 : (4 - f.cd) / 4; rect(ctx, bx - 1, 27, bw + 2, 6, INK); rect(ctx, bx, 28, bw, 4, '#3a2a10');
        const mw = Math.round(bw * fill); rect(ctx, left ? bx : bx + bw - mw, 28, mw, 4, ready && Math.floor(now / 200) % 2 ? '#fff6a0' : '#f2c230');
      }
      // centre clock = stage
      disc(ctx, 120, 17, 13, INK); disc(ctx, 120, 17, 11, '#e9c53a'); disc(ctx, 120, 17, 8, '#2c8a4a');
      const tag = S.mode === 'daily' ? 'D' : S.boss ? 'B' : String(S.stage); text(ctx, tag, 120 - Math.floor(tw(tag, 2) / 2), 12, 2, '#fff', INK);
      // bottom row: score and best
      rect(ctx, 4, 146, 10, 10, INK); rect(ctx, 5, 147, 8, 8, S.red || '#d9382c'); rect(ctx, 8, 149, 2, 4, '#fff'); rect(ctx, 7, 150, 4, 2, '#fff');
      if (S.mode !== 'daily') { text(ctx, String(S.score).padStart(4, '0'), 18, 146, 2, '#ffd166', INK); }
      const bs = S.best ? 'BEST ' + S.best : ''; if (bs) text(ctx, bs, W - 6 - tw(bs, 1), 150, 1, '#fff', INK);
    }

    function frame(now) {
      if (canvas.offsetParent !== null && S.bg) {
        ctx.save();
        if (now < S.shakeUntil) ctx.translate(Math.round(Math.sin(now / 18) * 2), Math.round(Math.cos(now / 23) * 2));
        ctx.drawImage(S.bg, 0, 0);
        const fs = [S.f.p, S.f.e].filter(Boolean);
        for (const f of fs) { rect(ctx, f.x - 13 + (f.pose ? f.pose.P.dx * f.dir : 0) * 0.0, FEET - 2, 26, 4, 'rgba(0,0,0,.28)'); }
        for (const f of fs) {
          const P = drawFighter(f, now);
          ctx.save(); ctx.translate(Math.round(f.x + P.dx * f.dir), FEET); if (f.dir < 0) ctx.scale(-1, 1); ctx.drawImage(f.buf, -48, -80); ctx.restore();
          const wx = f.x + P.dx * f.dir + f.dir * f.hand.x, wy = FEET + P.dy + f.hand.y;
          if (P.orb > 0) { disc(ctx, wx + f.dir * 4, wy, P.orb + 2, f.side === 'p' ? '#836ef9' : '#e0457b'); disc(ctx, wx + f.dir * 4, wy, P.orb, '#fff'); }
          if (P.beam && !f.beamed) { f.beamed = true; const o = f.side === 'p' ? S.f.e : S.f.p; S.beams.push({ t0: now, dur: 360, x0: wx + f.dir * 8, x1: o.x + o.dir * 0 - f.dir * 10, y: wy, dir: f.dir, c1: f.side === 'p' ? '#c36bff' : '#ff6bb0', c2: f.side === 'p' ? '#5a3fd8' : '#b0245e' }); }
          if (!P.beam && f.anim && f.anim.name !== 'special') f.beamed = false;
          if (f.anim == null) f.beamed = false;
          if (P.shield) { const sx = Math.round(f.x + f.dir * 15), a = Math.floor(now / 90) % 2; for (let y = -46; y < -4; y += 2) { const dx = Math.round(Math.sqrt(Math.max(0, 1 - ((y + 25) / 22) ** 2)) * 5); rect(ctx, sx + f.dir * dx - 1, FEET + y + P.dy * 0, 3, 2, (y + (a ? 2 : 0)) % 4 ? '#7dd3fc' : '#e6f7ff'); } }
        }
        drawFx(now);
        for (const t of S.floats) {
          const k = (now - t.t0) / 900; if (k > 1) continue; const y = t.y - k * 20; text(ctx, t.s, Math.round(t.x - tw(t.s, t.sc) / 2), Math.round(y), t.sc, t.col, INK);
        }
        S.floats = S.floats.filter((t) => now - t.t0 < 900);
        ctx.restore();
        hud(now);
        if (S.banner) {
          const k = (now - S.banner.t0) / S.banner.dur;
          if (k > 1) S.banner = null; else { const sc = S.banner.sc, x = Math.round(W / 2 - tw(S.banner.s, sc) / 2), y = Math.round(S.banner.y + (k < 0.15 ? (0.15 - k) * -80 : 0)); ctx.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1; text(ctx, S.banner.s, x, y, sc, S.banner.col, INK); ctx.globalAlpha = 1; }
        }
        if (now < S.flashUntil) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, W, H); }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const now = () => performance.now();
    const start = (f, name, dur, hold) => { f.anim = { name, t0: now(), dur, hold: !!hold }; };

    return {
      setup({ player, enemy, boss, mode, stage, score, theme, best, state }) {
        S.f = { p: newFighter('p', player), e: newFighter('e', enemy) }; S.floats = []; S.sparks = []; S.beams = []; S.banner = null;
        S.boss = !!boss; S.mode = mode; S.stage = stage; S.score = score || 0; S.best = best || 0;
        S.bg = buildBackground(theme); S.red = (THEMES[theme] || THEMES[0]).red;
        S.f.p.hp = S.f.p.shown = S.f.p.chip = state.p.hp; S.f.p.max = state.p.max; S.f.e.hp = S.f.e.shown = S.f.e.chip = state.e.hp; S.f.e.max = state.e.max;
        S.f.p.cd = state.p.cd; S.f.e.cd = state.e.cd;
      },
      setHp(side, hp, max) { const f = S.f[side]; if (f) { f.hp = hp; f.max = max; } },
      setCd(side, cd) { if (S.f[side]) S.f[side].cd = cd; },
      setScore(n) { S.score = n; },
      // Start a move; resolves at the moment of impact so the caller can apply the hit.
      act(side, kind) {
        const f = S.f[side]; if (!f) return Promise.resolve();
        const spec = { punch: [420, 170], kick: [480, 200], special: [960, 560], guard: [720, 0], dodge: [450, 0] }[kind] || [400, 150];
        start(f, kind, spec[0]); return new Promise((r) => setTimeout(r, spec[1]));
      },
      impact(side, { dmg, crit, big, blocked, text: label } = {}) {
        const f = S.f[side]; if (!f) return;
        start(f, 'hurt', 380); S.sparks.push({ x: f.x + 0 * f.dir - f.dir * 2, y: FEET - 30, t0: now(), big: !!(big || crit) });
        if (big || crit) { S.shakeUntil = now() + 260; if (crit) S.flashUntil = now() + 90; }
        if (dmg != null) this.float(side, '-' + dmg, crit || big ? '#ffd166' : '#fff', crit || big ? 3 : 2);
        if (blocked) this.float(side, 'BLOCK', '#cfe9ff', 1, -14);
        if (label) this.float(side, label, '#fff', 1);
      },
      float(side, s, col, sc, dy) { const f = S.f[side]; if (!f) return; S.floats.push({ x: f.x, y: FEET - 62 + (dy || 0), s, col: col || '#fff', sc: sc || 2, t0: now() }); },
      miss(side) { start(S.f[side], 'dodge', 450); this.float(side, 'MISS', '#dbe4f0', 2); },
      ko(side) { const f = S.f[side]; if (!f) return; f.ko = true; f.anim = null; },
      win(side) { const f = S.f[side]; if (!f) return; f.win = true; f.winT = now(); f.anim = null; },
      banner(s, col, sc, ms) { S.banner = { s, col: col || '#ffd166', sc: sc || 5, y: 62, t0: now(), dur: ms || 1400 }; },
      shake(ms) { S.shakeUntil = now() + (ms || 300); },
    };
  }
  window.Arena = { create };
})();
