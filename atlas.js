/* ===================== Atlas enhance: dehaze + semantic colour grading ===================== */
const ATLAS_WATER = [[0, [8, 30, 60]], [.45, [17, 58, 108]], [.8, [34, 94, 152]], [1, [80, 143, 192]]];
function rampAt(st, u){ let j = 0; while (j < st.length - 2 && u > st[j+1][0]) j++; const a = st[j], b = st[j+1], t = clamp((u - a[0])/((b[0] - a[0]) || 1), 0, 1), s = t*t*(3 - 2*t); return [0,1,2].map(k => a[1][k] + (b[1][k] - a[1][k])*s); }
function minFilter(a, w, h, r){
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let m = 1e9; for (let k = Math.max(0, x-r); k <= Math.min(w-1, x+r); k++) m = Math.min(m, a[y*w+k]); t[y*w+x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let m = 1e9; for (let k = Math.max(0, y-r); k <= Math.min(h-1, y+r); k++) m = Math.min(m, t[k*w+x]); o[y*w+x] = m; }
  return o;
}
function bilin(a, w, h, x, y){ x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001); const x0 = x|0, y0 = y|0, fx2 = x - x0, fy2 = y - y0, i = y0*w + x0; return a[i]*(1-fx2)*(1-fy2) + a[i+1]*fx2*(1-fy2) + a[i+w]*(1-fx2)*fy2 + a[i+w+1]*fx2*fy2; }
/** returns {canvas, info}. src: image/canvas of the whole working view; mask: G.mask at G.w×G.h (or null) */
function atlasEnhance(src, mask, opts = {}){
  const sw = src.naturalWidth || src.width, shh = src.naturalHeight || src.height, sc = Math.min(1, (opts.max || 2400)/Math.max(sw, shh));
  const W = Math.round(sw*sc), H = Math.round(shh*sc), N = W*H;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const cx = cv.getContext("2d", {willReadFrequently: true});
  cx.imageSmoothingQuality = "high"; cx.drawImage(src, 0, 0, W, H);
  const id = cx.getImageData(0, 0, W, H), d = id.data;
  const R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++){ R[i] = d[i*4]/255; Gc[i] = d[i*4+1]/255; B[i] = d[i*4+2]/255; }
  const res = clamp((Math.max(W, H) - 900)/1500, 0, 1);
  if (res < .4){ // low-resolution screenshot: soften JPEG blocks before any sharpening
    const k = .55*(1 - res/.4); for (const ch of [R, Gc, B]){ const bl = boxBlurF(ch, W, H, 1); for (let i = 0; i < N; i++) ch[i] = ch[i]*(1-k) + bl[i]*k; } }
  // 1. haze estimate (dark channel prior) on a small copy
  const ks = Math.min(1, 500/Math.max(W, H)), w2 = Math.max(8, Math.round(W*ks)), h2 = Math.max(8, Math.round(H*ks));
  const sm = document.createElement("canvas"); sm.width = w2; sm.height = h2; const sx = sm.getContext("2d", {willReadFrequently: true}); sx.drawImage(cv, 0, 0, w2, h2);
  const sd = sx.getImageData(0, 0, w2, h2).data, dk = new Float32Array(w2*h2);
  for (let i = 0; i < w2*h2; i++) dk[i] = Math.min(sd[i*4], sd[i*4+1], sd[i*4+2])/255;
  const dark = minFilter(dk, w2, h2, 4), order = Array.from(dark.keys()).sort((a, b) => dark[b] - dark[a]), top = order.slice(0, Math.max(10, Math.round(order.length*.002)));
  const A = [0, 0, 0]; top.forEach(i => { A[0] += sd[i*4]/255; A[1] += sd[i*4+1]/255; A[2] += sd[i*4+2]/255; }); for (let k = 0; k < 3; k++) A[k] = clamp(A[k]/top.length, .55, 1);
  const hazeLevel = median(Array.from(dark).filter((_, i) => i % 3 === 0));
  const omega = clamp(hazeLevel*2.4, .2, .7);
  const dn = new Float32Array(w2*h2); for (let i = 0; i < w2*h2; i++) dn[i] = Math.min(sd[i*4]/255/A[0], sd[i*4+1]/255/A[1], sd[i*4+2]/255/A[2]);
  let T = minFilter(dn, w2, h2, 4); for (let i = 0; i < T.length; i++) T[i] = 1 - omega*T[i];
  T = boxBlurF(boxBlurF(T, w2, h2, 6), w2, h2, 6);
  // 2. dehaze at full resolution
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y*W+x, t = Math.max(.55, bilin(T, w2, h2, x*w2/W, y*h2/H));
    R[i] = (R[i] - A[0])/t + A[0]; Gc[i] = (Gc[i] - A[1])/t + A[1]; B[i] = (B[i] - A[2])/t + A[2];
  }
  // 3. per-channel levels (white balance + stretch)
  const pct = (arr, lo, hi) => { const s = []; for (let i = 0; i < N; i += Math.max(1, Math.floor(N/60000))) s.push(arr[i]); return [quantile(s, lo), quantile(s, hi)]; };
  { // mostly a common stretch (keeps the scene's real colours); only 30% per-channel balance, so hazy green scenes don't turn purple
    const Ls = new Float32Array(N); for (let i = 0; i < N; i++) Ls[i] = (R[i] + Gc[i] + B[i])/3; const [Llo, Lhi] = pct(Ls, .005, .996), kL = Math.min(1.7, .92/Math.max(.05, Lhi - Llo));
    for (const ch of [R, Gc, B]){ const [lo, hi] = pct(ch, .005, .996), kc = Math.min(1.7, .92/Math.max(.05, hi - lo)), k = .3*kc + .7*kL, o = .3*lo + .7*Llo; for (let i = 0; i < N; i++) ch[i] = .04 + (ch[i] - o)*k; } }
  { // lift dark scenes (e.g. rainforest) so mid-tones keep detail
    const s = []; for (let i = 0; i < N; i += Math.max(1, Math.floor(N/40000))) s.push(.2126*R[i] + .7152*Gc[i] + .0722*B[i]);
    const md = median(s); if (md < .3){ const gma = clamp(Math.log(.34)/Math.log(Math.max(.05, md)), .55, 1); for (const ch of [R, Gc, B]) for (let i = 0; i < N; i++) ch[i] = Math.pow(clamp(ch[i], 0, 1), gma); } }
  // 4. semantic weights: water from the ML water map (soft edges), vegetation from colour
  let ww = null;
  if (mask){ const mw = G.w, mh = G.h, mf = new Float32Array(mw*mh); for (let i = 0; i < mf.length; i++) mf[i] = mask[i]; const mb = boxBlurF(boxBlurF(mf, mw, mh, 1), mw, mh, 1); ww = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ww[y*W+x] = bilin(mb, mw, mh, (x + .5)*mw/W - .5, (y + .5)*mh/H - .5); }
  const lum = new Float32Array(N); for (let i = 0; i < N; i++) lum[i] = .2126*R[i] + .7152*Gc[i] + .0722*B[i];
  let wlo = 0, whi = 1;
  if (ww){ const s = []; for (let i = 0; i < N; i += 3) if (ww[i] > .8) s.push(lum[i]); if (s.length > 100){ wlo = quantile(s, .03); whi = quantile(s, .97); } }
  const blurL = boxBlurF(boxBlurF(lum, W, H, Math.max(2, Math.round(W/140))), W, H, Math.max(2, Math.round(W/140)));
  const fine = boxBlurF(lum, W, H, 1), kC = .28 + .27*res, kS = .08 + .7*res;
  let wc = null;
  if (ww){ const s = [[], [], []]; for (let i = 0; i < N; i += 3) if (ww[i] > .85){ s[0].push(R[i]); s[1].push(Gc[i]); s[2].push(B[i]); }
    if (s[0].length > 100){ const m3 = s.map(median), sp = Math.sqrt(s.reduce((acc, a, k) => acc + (quantile(a, .84) - quantile(a, .16))**2/4, 0)); wc = [...m3, Math.max(.05, 1.7*sp)];
      // sediment-laden (tan / brown) rivers keep their real colour: grading them navy would misrepresent them
      if (m3[0] > m3[2] + .04 && (m3[0] + m3[1])/2 > m3[2] + .03){ ww = null; wc = null; G.atlasMuddy = true; } else G.atlasMuddy = false; } }
  const lumW = boxBlurF(boxBlurF(lum, W, H, 2), W, H, 2);
  let nVeg = 0, nWat = 0;
  for (let i = 0; i < N; i++){
    let r = R[i], g = Gc[i], b = B[i];
    // local contrast (clarity) and sharpening on luminance
    const add = (lum[i] - blurL[i])*kC + (lum[i] - fine[i])*kS; r += add; g += add; b += add;
    // vegetation & land in HSV
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn; let hh = 0;
    if (dl > 1e-4){ hh = mx === r ? ((g - b)/dl) % 6 : mx === g ? (b - r)/dl + 2 : (r - g)/dl + 4; hh *= 60; if (hh < 0) hh += 360; }
    const sat = mx > 0 ? dl/mx : 0, veg = hh > 55 && hh < 170 && sat > .08 ? clamp((sat - .08)/.12, 0, 1) : 0;
    const satK = 1.12 + .3*veg, l0 = .2126*r + .7152*g + .0722*b;
    r = l0 + (r - l0)*satK; g = l0 + (g - l0)*satK; b = l0 + (b - l0)*satK;
    if (veg > 0){ g += .025*veg; r -= .012*veg; nVeg++; }
    // water: luminance → navy ramp, keeping ripples and sediment plumes as texture
    const wv = ww ? clamp((ww[i] - .15)/.7, 0, 1)*(wc ? Math.exp(-((R[i]-wc[0])**2 + (Gc[i]-wc[1])**2 + (B[i]-wc[2])**2)/(2*wc[3]*wc[3])) : 1) : 0;
    if (wv > 0){ nWat++; const u = clamp((lumW[i] - wlo)/((whi - wlo) || 1), 0, 1), c = rampAt(ATLAS_WATER, .25 + .6*u), k = .88*wv, dt = (lum[i] - lumW[i])*.35;
      r = r*(1-k) + (c[0]/255 + dt)*k; g = g*(1-k) + (c[1]/255 + dt)*k; b = b*(1-k) + (c[2]/255 + dt)*k; }
    // gentle S-curve
    const sc2 = v => { v = clamp(v, 0, 1); return v + .12*(v - .5)*(1 - Math.abs(2*v - 1)); };
    d[i*4] = sc2(r)*255; d[i*4+1] = sc2(g)*255; d[i*4+2] = sc2(b)*255; d[i*4+3] = 255;
  }
  cx.putImageData(id, 0, 0);
  return {canvas: cv, info: {haze: hazeLevel, omega, water: nWat/N, veg: nVeg/N, W, H}};
}
/** stronger label removal for art: repaint the dilated label zone from surrounding colours */
function cleanLabelsFor(img){
  if (!G.labelMask) return img;
  const w = G.w, h = G.h, c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", {willReadFrequently: true});
  x.drawImage(img, 0, 0, w, h); const id = x.getImageData(0, 0, w, h), D = {w, h, rgba: id.data};
  const zone = G.labelArt || G.labelMask, todo = new Uint8Array(zone); const cc = id.data;
  for (let pass = 0; pass < 60; pass++){ const set = [];
    for (let y = 0; y < h; y++) for (let x2 = 0; x2 < w; x2++){ const i = y*w + x2; if (!todo[i]) continue; let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of NB8){ const nx = x2+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny*w+nx; if (todo[q]) continue; r += cc[q*4]; g += cc[q*4+1]; b += cc[q*4+2]; n++; }
      if (n >= 2) set.push([i, r/n, g/n, b/n]); }
    if (!set.length) break; for (const [i, r, g, b] of set){ cc[i*4] = r; cc[i*4+1] = g; cc[i*4+2] = b; todo[i] = 0; } }
  x.putImageData(id, 0, 0); return c;
}
function enhanceToStudio(on){
  if (!G.D || !window.__studio) return null;
  const s = studioSource();
  if (!on){ window.__studio.setSource(s.img, {f: s.f, roi: G.roi || null, keepLook: true, keepFrame: true}); G.enhanced = null; return null; }
  if (!G.enhanced){ const r = atlasEnhance(G.labelMask ? cleanLabelsFor(G.D.img || s.img) : s.img, G.D.kind === "dem" || G.seafloor ? null : G.mask); G.enhanced = r; }
  window.__studio.setSource(G.enhanced.canvas, {f: G.enhanced.canvas.width/G.w, roi: G.roi || null, keepLook: true, keepFrame: true});
  return G.enhanced.info;
}
