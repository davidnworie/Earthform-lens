/* ===================== Channel Width Intelligence ===================== */
// Station-based width measurement with explicit width definitions, individual threads, active corridor, distance-transform and
// area/length estimates, QC flags and uncertainty, full distribution statistics, spatial context, dimensionless ratios,
// dated re-measurement at fixed stations (widening / narrowing / migration, left and right banks), and exports.

const WIDTH_VERSION = "efl-width-1.0";
XR.wopt = {mode: "fixed", k: 2, bars: true, gapCells: 2, orient: 10};
XR.wsel = null;

/* ---------- pure transect analysis (tested by the self-test) ---------- */
/** wet/bar: arrays of 0/1 sampled every `step` metres along the transect; c = index of the centreline sample.
 *  Returns individual threads, total wetted width B, thread count N, outer wetted span Ws, active span (water + bars), fractions. */
function analyzeTransect(wet, bar, step, c, maxGap){
  const n = wet.length, threads = []; let i = 0;
  while (i < n){ if (wet[i]){ let j = i; while (j + 1 < n && wet[j + 1]) j++; threads.push({i0: i, i1: j, w: (j - i + 1)*step, edge: i === 0 || j === n - 1}); i = j + 1; } else i++; }
  // corridor: threads connected to the centreline thread through gaps no wider than maxGap (or through mapped bars)
  let main = threads.findIndex(t => c >= t.i0 && c <= t.i1); if (main < 0) return {N: 0, threads: [], B: NaN, Ws: NaN, Wact: NaN, main: null, ok: false, why: "centreline not in water"};
  let lo = main, hi = main; const gapOK = (a, b) => { let g = 0; for (let k = threads[a].i1 + 1; k < threads[b].i0; k++) if (!(bar && bar[k])) g++; return g*step <= maxGap; };
  while (lo > 0 && gapOK(lo - 1, lo)) lo--; while (hi < threads.length - 1 && gapOK(hi, hi + 1)) hi++;
  const T = threads.slice(lo, hi + 1), B = T.reduce((s, t) => s + t.w, 0), Ws = (T[T.length - 1].i1 - T[0].i0 + 1)*step;
  // active corridor: the outer span extended over adjoining mapped bars
  let a0 = T[0].i0, a1 = T[T.length - 1].i1; if (bar){ while (a0 > 0 && bar[a0 - 1]) a0--; while (a1 < n - 1 && bar[a1 + 1]) a1++; }
  const Wact = (a1 - a0 + 1)*step, dom = Math.max(...T.map(t => t.w)), mainT = threads[main];
  return {threads: T.map(t => ({w: t.w, from: (t.i0 - c)*step, to: (t.i1 + 1 - c)*step, edge: t.edge})), N: T.length, B, Ws, inter: Ws - B, mean: B/T.length, dom, domFrac: dom/B, Wact, wetFrac: B/Wact, mainW: mainT.w, mainFrom: (mainT.i0 - c)*step, mainTo: (mainT.i1 + 1 - c)*step,
    clipped: T[0].i0 === 0 || T[T.length - 1].i1 === n - 1, ok: B <= Wact + 1e-9 && Ws <= Wact + 1e-9};
}
/** distribution statistics with a block bootstrap CI that respects spatial dependence */
function widthStats(v, blockLen){
  const x = v.filter(Number.isFinite), n = x.length; if (!n) return null; const s = x.slice().sort((a, b) => a - b), q = p => quantile(s, p), m = x.reduce((a, b) => a + b, 0)/n;
  const vr = x.reduce((a, b) => a + (b - m)**2, 0)/Math.max(1, n - 1), sd = Math.sqrt(vr), m3 = x.reduce((a, b) => a + (b - m)**3, 0)/n, m4 = x.reduce((a, b) => a + (b - m)**4, 0)/n, s2 = x.reduce((a, b) => a + (b - m)**2, 0)/n;
  const out = {n, mean: m, median: q(.5), min: s[0], max: s[n - 1], sd, variance: vr, iqr: q(.75) - q(.25), cv: sd/m, p5: q(.05), p10: q(.1), p25: q(.25), p75: q(.75), p90: q(.9), p95: q(.95), skew: s2 ? m3/s2**1.5 : NaN, kurt: s2 ? m4/s2**2 - 3 : NaN};
  if (n >= 10){ const L = Math.max(1, Math.min(Math.floor(n/3), Math.round(blockLen || 1))), nb = Math.ceil(n/L), meds = [], means = []; let seed = 12345; const rnd = () => (seed = (seed*1103515245 + 12345) % 2147483648)/2147483648;
    for (let r = 0; r < 400; r++){ const smp = []; for (let b = 0; b < nb; b++){ const st = Math.floor(rnd()*(n - L + 1)); for (let k = 0; k < L; k++) smp.push(x[st + k]); } smp.length = n; smp.sort((a, b) => a - b); meds.push(quantile(smp, .5)); means.push(smp.reduce((a, b) => a + b, 0)/n); }
    meds.sort((a, b) => a - b); means.sort((a, b) => a - b); out.ciMedian = [quantile(meds, .025), quantile(meds, .975)]; out.ciMean = [quantile(means, .025), quantile(means, .975)]; out.block = L; }
  return out;
}
/** autocorrelation length (in stations): first lag where the ACF falls below 1/e */
function acfLength(v){ const x = v.filter(Number.isFinite), n = x.length; if (n < 8) return NaN; const m = x.reduce((a, b) => a + b, 0)/n, d = x.map(t => t - m), c0 = d.reduce((a, b) => a + b*b, 0); if (!c0) return NaN;
  for (let L = 1; L < n/2; L++){ let c = 0; for (let i = 0; i + L < n; i++) c += d[i]*d[i + L]; if (c/c0 < 1/Math.E) return L; } return n/2; }

/* ---------- raster of mapped water and bars ---------- */
async function waterRaster(R, k0, k1, extra){
  const pts = resampleKm(R, k0, k1, Math.max(.05, (k1 - k0)/400)); let s = 90, n = -90, w = 180, e = -180; for (const p of pts){ s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  const pad = .025, bb = `${s - pad},${w - pad},${n + pad},${e + pad}`, lat0 = (s + n)/2, lon0 = (w + e)/2;
  let els = [];
  if (extra && extra.polys){ els = extra.polys; }
  else { const q = `[out:json][timeout:150];(way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["natural"="water"](${bb});relation["waterway"="riverbank"](${bb});way["natural"~"^(shoal|sand)$"](${bb});relation["natural"~"^(shoal|sand)$"](${bb});way["wetland"="tidalflat"](${bb}););out geom;`;
    const data = await overpass(q); els = (data.elements || []).map(el => ({bar: !!(el.tags && (/^(shoal|sand)$/.test(el.tags.natural || "") || el.tags.wetland === "tidalflat")), rings: el.type === "way" && el.geometry ? [el.geometry.map(p => [p.lat, p.lon])] : (el.members || []).filter(m => m.geometry && m.geometry.length > 2).map(m => m.geometry.map(p => [p.lat, p.lon]))})); }
  const L = toLocal([[n + pad, w - pad], [s - pad, e + pad]], lat0, lon0), res = clamp((k1 - k0)/2500, .004, .05), W = Math.ceil((L[1][0] - L[0][0])/res), H = Math.ceil((L[1][1] - L[0][1])/res);
  if (W*H > 2.4e7) throw new Error("stretch too large to rasterise at this resolution: use shorter reaches");
  const draw = (bar) => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d", {willReadFrequently: true}); g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.fillStyle = "#fff";
    for (const el of els){ if (!!el.bar !== bar) continue; g.beginPath(); for (const rg of el.rings){ const P = toLocal(rg, lat0, lon0); P.forEach((p, j) => { const x = (p[0] - L[0][0])/res, y = (p[1] - L[0][1])/res; j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.fill("evenodd"); }
    const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W*H); for (let i = 0; i < m.length; i++) m[i] = d[i*4] > 127 ? 1 : 0; return m; };
  const water = draw(false), bars = els.some(e2 => e2.bar) ? draw(true) : null;
  if (bars) for (let i = 0; i < water.length; i++) if (water[i]) bars[i] = 0; // a bar under water counts as water
  // centreline km raster to detect transects that cross another part of the river (bends)
  const kmGrid = new Float32Array(W*H).fill(NaN), cl = resampleKm(R, Math.max(0, k0 - 5), Math.min(R.L, k1 + 5), res/2), clL = toLocal(cl, lat0, lon0);
  clL.forEach((p, i) => { const x = Math.round((p[0] - L[0][0])/res), y = Math.round((p[1] - L[0][1])/res); if (x >= 0 && y >= 0 && x < W && y < H) kmGrid[y*W + x] = Math.max(0, k0 - 5) + i*res/2; });
  return {W, H, res, lat0, lon0, L0: L[0], water, bars, kmGrid, n: els.length, nBars: els.filter(e2 => e2.bar).length};
}
const rasterAt = (Rs, m, x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < Rs.W && yi < Rs.H ? m[yi*Rs.W + xi] : 0; };

/* ---------- station measurement ---------- */
function measureStations(R, r, Rs, kms, opt){
  const out = [], res = Rs.res, stepCells = .5, stepM = stepCells*res*1000, toG = p => [(p[0] - Rs.L0[0])/res, (p[1] - Rs.L0[1])/res];
  const kx = Math.cos(Rs.lat0*D2R)*R_E*D2R, ky = R_E*D2R, geo = (x, y) => [Rs.lat0 - (y*res + Rs.L0[1])/ky, Rs.lon0 + (x*res + Rs.L0[0])/kx];
  for (const k of kms){
    const p0 = pointAtKm(R, Math.max(0, k - .3*Math.max(res*4, .05))), p1 = pointAtKm(R, Math.min(R.L, k + .3*Math.max(res*4, .05))), pc = pointAtKm(R, k), [P0, P1, PC] = toLocal([p0, p1, pc], Rs.lat0, Rs.lon0).map(toG);
    const tx = P1[0] - P0[0], ty = P1[1] - P0[1], tl = Math.hypot(tx, ty) || 1, nx0 = -ty/tl, ny0 = tx/tl, az = (Math.atan2(tx, -ty)/D2R + 360) % 360;
    const st = {id: `${R.osm}@${k.toFixed(3)}`, km: k, lat: pc[0], lon: pc[1], az, flags: [], off: false};
    const sampleAlong = (nx, ny, half) => { const nS = Math.round(half/stepCells), wet = new Uint8Array(2*nS + 1), bar = Rs.bars ? new Uint8Array(2*nS + 1) : null; let cross = null;
      for (let i = -nS; i <= nS; i++){ const x = PC[0] + nx*i*stepCells, y = PC[1] + ny*i*stepCells; wet[i + nS] = rasterAt(Rs, Rs.water, x, y); if (bar) bar[i + nS] = rasterAt(Rs, Rs.bars, x, y);
        const kk = Rs.kmGrid[Math.round(y)*Rs.W + Math.round(x)]; if (Number.isFinite(kk) && Math.abs(kk - k) > Math.max(1, 6*Math.abs(i)*stepM/1000) && Math.abs(i) > 2) cross = cross === null || Math.abs(i) < Math.abs(cross) ? i : cross; }
      return {wet, bar, c: nS, cross}; };
    if (!rasterAt(Rs, Rs.water, PC[0], PC[1])){ st.flags.push("centreline outside mapped water"); st.ok = false; out.push(st); continue; }
    // first pass: main thread width to scale the search span
    let w0 = 0; for (const sg of [1, -1]){ let t = 0; while (t < 8000 && rasterAt(Rs, Rs.water, PC[0] + sg*nx0*t, PC[1] + sg*ny0*t)) t += stepCells; w0 += t; }
    const half = clamp(Math.max(6*w0, 300/(res*1000)), 20, 6000/(res*1000)), S = sampleAlong(nx0, ny0, half);
    if (S.cross !== null){ const lim = Math.abs(S.cross) - 2; for (let i = 0; i < S.wet.length; i++) if (Math.abs(i - S.c) >= lim){ S.wet[i] = 0; if (S.bar) S.bar[i] = 0; } st.flags.push("transect crosses another part of the river (bend interference): span truncated"); }
    const A = analyzeTransect(S.wet, S.bar, stepM, S.c, Math.max(opt.gapCells*res*1000, .5*w0*res*1000, 50));
    Object.assign(st, {threads: A.threads, N: A.N, B: A.B, Ws: A.Ws, inter: A.inter, Wact: A.Wact, mean: A.mean, dom: A.dom, domFrac: A.domFrac, wetFrac: A.wetFrac, w: A.mainW, ok: A.ok !== false});
    if (A.clipped) st.flags.push("corridor reaches the end of the search span (edge effect)");
    if (A.ok === false && A.N) st.flags.push("inconsistent geometry (B > active width): rejected");
    st.a = geo(PC[0] + nx0*A.mainFrom/(res*1000), PC[1] + ny0*A.mainFrom/(res*1000)); st.b = geo(PC[0] + nx0*A.mainTo/(res*1000), PC[1] + ny0*A.mainTo/(res*1000));
    st.ca = geo(PC[0] + nx0*(A.threads[0] ? A.threads[0].from : 0)/(res*1000), PC[1] + ny0*(A.threads[0] ? A.threads[0].from : 0)/(res*1000)); st.cb = geo(PC[0] + nx0*(A.threads.length ? A.threads[A.threads.length - 1].to : 0)/(res*1000), PC[1] + ny0*(A.threads.length ? A.threads[A.threads.length - 1].to : 0)/(res*1000));
    st.left = -A.mainFrom; st.right = A.mainTo; // bank offsets from the centreline (m); left = looking downstream
    // orientation sensitivity: main width with the normal rotated ± opt.orient degrees
    const rot = a => { const c = Math.cos(a*D2R), s = Math.sin(a*D2R); return [nx0*c - ny0*s, nx0*s + ny0*c]; }; let worst = 0;
    for (const a of [opt.orient, -opt.orient]){ const [nx, ny] = rot(a); let ww = 0; for (const sg of [1, -1]){ let t = 0; while (t < 8000 && rasterAt(Rs, Rs.water, PC[0] + sg*nx*t, PC[1] + sg*ny*t)) t += stepCells; ww += t; } worst = Math.max(worst, Math.abs(ww*res*1000 - A.mainW)/A.mainW); }
    st.orientSens = worst; if (worst > .15 + (1/Math.cos(opt.orient*D2R) - 1)) st.flags.push(`orientation-sensitive (±${opt.orient}° changes width by ${nf(worst*100)}%)`);
    // distance transform (medial-axis) estimate: twice the distance to the nearest non-water cell
    let dmin = Infinity; for (let ang = 0; ang < 180; ang += 11.25){ const c = Math.cos(ang*D2R), s = Math.sin(ang*D2R); for (const sg of [1, -1]){ let t = 0; while (t < 8000 && rasterAt(Rs, Rs.water, PC[0] + sg*c*t, PC[1] + sg*s*t)) t += stepCells; dmin = Math.min(dmin, t); } }
    st.wDT = 2*dmin*res*1000;
    st.pix = A.mainW/(res*1000); if (st.pix < 3) st.flags.push(`fewer than 3 raster cells across (${nf(st.pix, 1)}): low resolution`);
    st.unc = res*1000; st.uncRel = st.unc/A.mainW; st.res = res*1000;
    // geomorphic context
    const tr = R.tribs.find(t => Math.abs(t.km - k) < Math.max(3*A.Ws/1000, .3)); if (tr){ st.nearJunction = tr.name; st.flags.push(`within ${tr.distributary ? "a bifurcation" : "a confluence"} zone (${tr.name}): junction contamination possible`); }
    const dm = R.dams.find(d => Math.abs(d.km - k) < Math.max(3*A.Ws/1000, .5)); if (dm){ st.nearDam = dm.name || "dam/weir"; st.flags.push("near a dam or weir (engineered structure)"); }
    out.push(st); }
  return out;
}
/** curvature class of each station from the smoothed centreline: bend apex, inflection or intermediate */
function classifyStations(R, S){
  if (S.length < 5) return; const step = Math.max(.02, (S[1].km - S[0].km)), P = toLocal(S.map(s => [s.lat, s.lon]), S[0].lat, S[0].lon), n = P.length;
  const sm = P.map((_, j) => { let x = 0, y = 0, w = 0; for (let t = -3; t <= 3; t++){ const q = P[clamp(j + t, 0, n - 1)], g = Math.exp(-t*t/4.5); x += q[0]*g; y += q[1]*g; w += g; } return [x/w, y/w]; });
  const k = sm.map((_, j) => { if (j === 0 || j === n - 1) return 0; const u = [sm[j][0] - sm[j-1][0], sm[j][1] - sm[j-1][1]], v = [sm[j+1][0] - sm[j][0], sm[j+1][1] - sm[j][1]]; return Math.atan2(u[0]*v[1] - u[1]*v[0], u[0]*v[0] + u[1]*v[1])/step; });
  const ak = k.map(Math.abs), med = median(ak.filter(v => v > 0)) || 0;
  S.forEach((s, j) => { s.curv = k[j]; const loc = ak.slice(Math.max(0, j - 3), j + 4); s.cls = ak[j] > 0 && ak[j] === Math.max(...loc) && ak[j] > 1.2*med ? "apex" : (j > 0 && Math.sign(k[j]) !== Math.sign(k[j - 1]) && k[j - 1] !== 0) ? "inflection" : "intermediate"; });
}

/* ---------- replaces the simpler width measurement used by the other modules ---------- */
measureWidth = async function(R, r){
  const opt = XR.wopt, Rs = await waterRaster(R, r.k0, r.k1), res = Rs.res;
  let spKm; if (opt.mode === "adaptive"){ // spacing scaled to a first width estimate
    const probe = measureStations(R, r, Rs, [0.25, .5, .75].map(f => r.k0 + f*(r.L)), opt).map(s => s.w).filter(Number.isFinite); spKm = Math.max(res, (probe.length ? median(probe) : 200)/1000*opt.k); }
  else spKm = XR.trSp > 0 ? Math.max(.02, XR.trSp/1000, r.L/2000) : Math.max(.05, r.L/400);
  const kms = []; for (let k = r.k0 + spKm/2; k < r.k1; k += spKm) kms.push(k);
  const S = measureStations(R, r, Rs, kms, opt); classifyStations(R, S);
  // legacy fields used elsewhere
  const tr = S.filter(s => Number.isFinite(s.w)).map(s => Object.assign(s, {n: s.N}));
  const ok = tr.filter(s => s.ok).map(s => s.w), area = (() => { let c = 0; for (let i = 0; i < Rs.water.length; i++) c += Rs.water[i]; return c*(res*res); })();
  r.width = ok.length > 3 ? {med: median(ok), p10: quantile(ok, .1), p90: quantile(ok, .9), cover: ok.length/Math.max(1, S.length), km0: r.k0, stepKm: spKm, tr, stations: S, braid: tr.reduce((s2, t) => s2 + (t.N || 0), 0)/Math.max(1, tr.length), res: res*1000, nPolys: Rs.n, nBars: Rs.nBars, made: new Date().toISOString(), version: WIDTH_VERSION, opt: {...opt, spacing_m: spKm*1000}}
    : {med: NaN, cover: 0, tr, stations: S, res: res*1000, nPolys: Rs.n, nBars: Rs.nBars, made: new Date().toISOString(), version: WIDTH_VERSION};
  return r.width;
};

/* ---------- collection of stations for a study area ---------- */
function stationsIn(R, k0, k1, all){ return (R.reaches || []).flatMap(r => ((r.width && r.width.stations) || [])).filter(s => s.km >= k0 && s.km <= k1 && (all || (!s.off && s.ok !== false && Number.isFinite(s.w)))).sort((a, b) => a.km - b.km); }
const WTYPES = [
  ["wetted", "Main-thread mapped water width", s => s.wc ?? s.w, "Bank-to-bank across the water polygon containing the centreline (OSM, undated: a mapped water extent, not a dated wetted width)."],
  ["total", "Total wetted width B (all threads)", s => s.B, "Sum of individual thread widths bᵢ across the connected corridor."],
  ["span", "Outer wetted span Ws", s => s.Ws, "Outermost wetted margins, including intervening bars and islands."],
  ["active", "Active channel (water + mapped bars)", s => s.Wact, "Outer span extended over adjoining OSM sand/shoal bars; partial where bars are not mapped."],
  ["dt", "Medial-axis width (distance transform)", s => s.wDT, "Twice the distance from the centreline to the nearest non-water cell; not a cross-section in all shapes."],
  ["belt", "Channel belt (digitised)", s => s.belt, "Transect length inside your digitised channel-belt polygon."],
  ["floodplain", "Floodplain (terrain cross-section)", s => s.fp, "Ground within the flood height of the channel bed (Floodplain module)."],
  ["valley", "Valley floor (terrain cross-section)", s => s.valley, "Ground within 4× the flood height (Floodplain module)."],
];
function enrichStations(R, S){
  const belts = (R.digit || []).filter(f => f.kind === "belt"), fp = R.fp;
  for (const s of S){
    if (fp && fp.secs.length){ let b = null, bd = Infinity; for (const q of fp.secs){ const d = Math.abs(q.km - s.km); if (d < bd){ bd = d; b = q; } } if (b && bd < Math.max(.5, 2*(fp.secs[1] ? fp.secs[1].km - fp.secs[0].km : 1))){ s.fp = b.fp; s.valley = b.valley; } }
    if (belts.length && s.a && s.b){ // walk along the transect direction and measure the polygon interval containing the station
      const dir = toLocal([s.a, s.b], s.lat, s.lon), dx = dir[1][0] - dir[0][0], dy = dir[1][1] - dir[0][1], l = Math.hypot(dx, dy) || 1, ux = dx/l, uy = dy/l, kx = Math.cos(s.lat*D2R)*R_E*D2R, ky = R_E*D2R, at = t => [s.lat - (uy*t)/ky, s.lon + (ux*t)/kx];
      for (const f of belts){ if (!pip([s.lat, s.lon], f.pts)) continue; let a = 0, b = 0; const st = .01; while (a < 30 && pip(at(-a - st), f.pts)) a += st; while (b < 30 && pip(at(b + st), f.pts)) b += st; s.belt = (a + b)*1000; break; } }
  }
}

/* ---------- rendering of the Channel width tab ---------- */
function renderWidthTab(){
  const el = $("x6-width"), R = XR.river; if (!el || !R) return; const sr = selRange(), all = stationsIn(R, sr.k0, sr.k1, true), S = all.filter(s => !s.off && s.ok !== false && Number.isFinite(s.w)); enrichStations(R, all);
  const rsNo = (R.reaches || []).filter(r => r.k1 > sr.k0 && r.k0 < sr.k1 && !(r.width && r.width.stations));
  const acf = acfLength(S.map(s => s.w)), st = widthStats(S.map(s => WTYPES[0][2](s)), acf), stOf = f => widthStats(S.map(f), acf);
  const bars = (R.reaches || []).some(r => r.width && r.width.nBars), mul = S.filter(s => s.N > 1).length, res = S.length ? median(S.map(s => s.res)) : NaN;
  const card = (t, v, sub) => `<div><span>${t}</span><b>${v}</b>${sub ? `<em>${sub}</em>` : ""}</div>`;
  const statsT = WTYPES.map(([k, n, f, d]) => [k, n, stOf(f), d]);
  const beltS = statsT.find(x => x[0] === "belt")[2], actS = statsT.find(x => x[0] === "active")[2], fpS = statsT.find(x => x[0] === "floodplain")[2];
  el.innerHTML = `<div class="card levels"><b>Measure</b><div class="pgrid"><label>Spacing<select id="w6Mode"><option value="fixed"${XR.wopt.mode === "fixed" ? " selected" : ""}>Fixed interval</option><option value="adaptive"${XR.wopt.mode === "adaptive" ? " selected" : ""}>Adaptive (× local width)</option></select></label>
      ${XR.wopt.mode === "fixed" ? `<label>Interval (m, blank = auto)<input type="number" id="w6Sp" min="10" step="10" value="${XR.trSp || ""}"></label>` : `<label>Spacing = k × width<input type="number" id="w6K" min=".5" step=".5" value="${XR.wopt.k}"></label>`}
      <label>Orientation test (± degrees)<input type="number" id="w6Or" min="2" max="30" step="1" value="${XR.wopt.orient}"></label><label>Max gap between threads (cells)<input type="number" id="w6Gap" min="1" max="20" step="1" value="${XR.wopt.gapCells}"></label></div>
      <div class="btns"><button class="sm pri" id="w6Go">${rsNo.length ? `▶ Measure ${rsNo.length} reach${rsNo.length > 1 ? "es" : ""} in the selection` : "↻ Re-measure the selection"}</button><button class="sm" id="w6Edit">Review stations on map</button><button class="sm" data-dig="belt">✎ Digitise channel belt</button></div></div>
    ${!S.length ? `<p class="note">No width stations in this ${sr.whole ? "river" : "stretch"} yet. Widths come from OpenStreetMap water areas; reaches mapped only as a line get none.</p>` : `
    <div class="xstats xtiles wdash">${card("Main-thread median", nf(st.median) + " m", `P10–P90 ${nf(st.p10)}–${nf(st.p90)} m`)}${card("Active channel median", actS ? nf(actS.median) + " m" : "–", bars ? "water + mapped bars" : "no bars mapped here")}${card("Channel belt", beltS ? km(beltS.median/1000) : "–", beltS ? "digitised" : "digitise to measure")}${card("Floodplain", fpS ? km(fpS.median/1000) : "–", fpS ? "terrain" : "run Floodplain")}
      ${card("Valid stations", nf(S.length/Math.max(1, all.length)*100) + "%", `${S.length} of ${all.length}`)}${card("CV", nf(st.cv, 2), "SD ÷ mean")}${card("Multithread stations", nf(mul/S.length*100) + "%", `mean N = ${nf(S.reduce((a, s) => a + s.N, 0)/S.length, 2)}`)}${card("Belt ÷ active", beltS && actS ? nf(beltS.median/actS.median, 2) : "–", "")}${card("Raster cell", nf(res) + " m", `median ${nf(median(S.map(s => s.pix)), 1)} cells across`)}</div>
    <h4>Width definitions</h4><div class="scroll"><table class="grid"><tr><th>Width type</th><th>n</th><th>median</th><th>P10–P90</th><th>definition</th></tr>${statsT.map(([k, n, s, d]) => `<tr><td>${n}</td><td>${s ? s.n : 0}</td><td>${s ? nf(s.median) + " m" : "<span class='qc missing'>unavailable</span>"}</td><td>${s ? nf(s.p10) + "–" + nf(s.p90) : "–"}</td><td class="wdef">${esc(d)}</td></tr>`).join("")}<tr><td>Bankfull width</td><td>0</td><td><span class="qc missing">unavailable</span></td><td>–</td><td class="wdef">Needs independently supported bankfull margins (terrain, field or hydrological evidence); not inferred from imagery or OSM.</td></tr></table></div>
    <h4>Downstream width profile</h4><div class="xchart" id="w6Prof"></div><div class="xchart" id="w6dW"></div>
    <h4>Distribution (main-thread width)</h4><div class="row"><label>Width type</label><select id="w6Ty">${WTYPES.filter(([k]) => stOf(WTYPES.find(w => w[0] === k)[2])).map(([k, n]) => `<option value="${k}"${XR.w6ty === k ? " selected" : ""}>${n}</option>`).join("")}</select><label>Bin width (m)</label><input type="number" id="w6Bin" min="1" step="1" value="${XR.w6bin || ""}" placeholder="auto" style="width:80px"></div>
    <div class="xchart" id="w6Hist"></div><div class="xchart" id="w6Ecdf"></div><div class="xchart" id="w6Box"></div>
    <h4>Statistics</h4><div class="scroll"><table class="grid"><tr><th></th>${statsT.filter(x => x[2]).map(([, n]) => `<th>${esc(n.split(" (")[0])}</th>`).join("")}</tr>${[["n", "n", 0], ["mean", "mean"], ["median (P50)", "median"], ["min", "min"], ["max", "max"], ["SD", "sd"], ["variance", "variance"], ["IQR", "iqr"], ["CV", "cv", 2], ["P5", "p5"], ["P10", "p10"], ["P25", "p25"], ["P75", "p75"], ["P90", "p90"], ["P95", "p95"], ["skewness", "skew", 2], ["excess kurtosis", "kurt", 2]].map(([l, k, d]) => `<tr><td>${l}</td>${statsT.filter(x => x[2]).map(x => `<td>${nf(x[2][k], d ?? 0)}</td>`).join("")}</tr>`).join("")}
      <tr><td>95% CI of median</td>${statsT.filter(x => x[2]).map(x => `<td>${x[2].ciMedian ? nf(x[2].ciMedian[0]) + "–" + nf(x[2].ciMedian[1]) : "–"}</td>`).join("")}</tr></table></div>
    <p class="note">Percentiles use the non-exceedance convention (P90: 90% of stations are narrower). Confidence intervals: block bootstrap with blocks of ${st.block || 1} station${st.block > 1 ? "s" : ""} (the autocorrelation length), so neighbouring, dependent stations are not treated as independent. This is sampling uncertainty; measurement uncertainty per station is ±1 raster cell (≈${nf(res)} m, median ${nf(median(S.map(s => s.uncRel))*100)}%).</p>
    <h4>Multithread geometry (stations with N > 1)</h4>${mul ? kv([["Stations", String(mul)], ["Mean thread count N", nf(S.filter(s => s.N > 1).reduce((a, s) => a + s.N, 0)/mul, 2)], ["Total wetted B (median)", nf(median(S.filter(s => s.N > 1).map(s => s.B))) + " m"], ["Mean thread width B/N (median)", nf(median(S.filter(s => s.N > 1).map(s => s.mean))) + " m"], ["Dominant fraction (median)", nf(median(S.filter(s => s.N > 1).map(s => s.domFrac))*100) + "%"], ["Outer span Ws (median)", nf(median(S.filter(s => s.N > 1).map(s => s.Ws))) + " m"], ["Interchannel width Ws − B (median)", nf(median(S.filter(s => s.N > 1).map(s => s.inter))) + " m"], ["Wetted fraction B ÷ active (median)", nf(median(S.filter(s => s.N > 1).map(s => s.wetFrac))*100) + "%"], ["Rejected (B > active)", String(all.filter(s => s.ok === false && s.N).length)]]) : `<p class="note">Every valid station crosses a single thread.</p>`}
    <h4>Spatial context</h4>${spatialContextHTML(R, S, acf)}
    <h4>Dimensionless ratios</h4>${ratiosHTML(R, sr, S, statsT)}
    <h4>Width through time (fixed stations)</h4>${temporalWidthHTML(R, sr)}
    <h4>Quality control</h4>${qcHTML(all)}`}
    <div id="w6Insp"></div>
    <div class="btns"><button class="sm" id="w6Csv">⬇ Station CSV</button><button class="sm" id="w6Geo">⬇ Transects GeoJSON</button><button class="sm" id="w6Meta">⬇ Metadata JSON</button></div>
    <details class="prov"><summary>Method, data & provenance</summary><table class="grid"><tr><td>Boundaries</td><td>OpenStreetMap water areas (natural=water, waterway=riverbank) and bars (natural=sand/shoal, wetland=tidalflat), rasterised at ${nf(res)} m (≈ stretch length ÷ 2500, 4–50 m). OSM polygons are undated and of mixed origin.</td></tr><tr><td>Stations</td><td>${XR.wopt.mode === "adaptive" ? `adaptive spacing ${XR.wopt.k} × local width` : `every ${XR.trSp ? XR.trSp + " m" : "L/400"}`}, clipped to the exact selection; transect normal to the centreline tangent over ±${nf(.3*Math.max(res*4/1000, .05)*1000)} m.</td></tr><tr><td>Threads</td><td>water intervals along the transect, connected to the centreline thread through gaps ≤ max(${XR.wopt.gapCells} cells, half the main width, 50 m) or through mapped bars; spans stop where a transect meets another part of the river.</td></tr><tr><td>QC</td><td>cells across, orientation sensitivity (±${XR.wopt.orient}°), edge effects, bend interference, confluence/bifurcation and dam proximity, B ≤ active width; manual exclusion and correction keep the original value.</td></tr><tr><td>Version</td><td>${WIDTH_VERSION}</td></tr></table></details>`;
  wireWidth(R, sr, S, all);
  // charts
  const ty = WTYPES.find(w => w[0] === (XR.w6ty || "wetted")) || WTYPES[0];
  if (S.length){
    const ser = WTYPES.filter(([k]) => ["wetted", "active", "belt", "floodplain"].includes(k)).map(([k, n, f], i) => ({x: S.map(s => s.km), y: S.map(s => { const v = f(s); return Number.isFinite(v) && v > 0 ? v : NaN; }), c: ["#43d9e8", "#ffd84a", "#c9a7ff", "#4cd17a"][i], w: k === "wetted" ? 1.8 : 1.4, name: n})).filter(s2 => s2.y.some(Number.isFinite));
    svgChart($("w6Prof"), {h: 220, xlab: "Distance from source (km)", ylab: "Width (m, log)", logy: true, cursor: XR.pos, onPick: k => { setPos(k); selectStationNear(R, k); }, series: [...ser, {x: S.filter(s => s.N > 1).map(s => s.km), y: S.filter(s => s.N > 1).map(s => s.w), c: "#ff8a4c", dots: true, r: 2.2}]});
    $("w6Prof").insertAdjacentHTML("beforeend", `<div class="wleg">${ser.map(s2 => `<span><i style="background:${s2.c}"></i>${esc(s2.name.split(" (")[0])}</span>`).join("")}<span><i style="background:#ff8a4c;border-radius:50%"></i>multithread station</span></div>`);
    const dW = S.map((s, i) => { const a = S[Math.max(0, i - 2)], b = S[Math.min(S.length - 1, i + 2)]; return (b.w - a.w)/Math.max(1e-6, (b.km - a.km)); });
    svgChart($("w6dW"), {h: 150, xlab: "Distance from source (km)", ylab: "dW/ds (m per km)", cursor: XR.pos, onPick: k => { setPos(k); selectStationNear(R, k); }, series: [{x: S.map(s => s.km), y: dW, c: "#9fe3ff", w: 1.3}, {x: [S[0].km, S[S.length - 1].km], y: [0, 0], c: "rgba(255,255,255,.35)", w: 1, dash: true}]});
    const v = S.map(ty[2]).filter(x => Number.isFinite(x) && x > 0); if (v.length){ const lo = Math.min(...v), hi = Math.max(...v), bw = XR.w6bin > 0 ? XR.w6bin : niceBin((hi - lo)/18), e0 = Math.floor(lo/bw)*bw, nb = Math.max(1, Math.ceil((hi - e0)/bw + 1e-9)), h = new Array(nb).fill(0); v.forEach(x => h[Math.min(nb - 1, Math.floor((x - e0)/bw))]++);
      svgChart($("w6Hist"), {h: 200, xlab: `${ty[1]} (m) · bins ${nf(bw)} m from ${nf(e0)} m · n = ${v.length}`, ylab: "Stations", y0: 0, series: [{x: h.map((_, i) => e0 + (i + .5)*bw), y: h, c: "#4aa8ff", bars: true, bw: Math.max(3, 260/nb), base: 0}]});
      const s2 = v.slice().sort((a, b) => a - b); svgChart($("w6Ecdf"), {h: 170, xlab: `${ty[1]} (m)`, ylab: "Non-exceedance", y0: 0, series: [{x: s2, y: s2.map((_, i) => (i + 1)/s2.length), c: "#43d9e8", w: 2}]});
      $("w6Box").innerHTML = boxViolin(v, ty[1]); } }
}
function niceBin(x){ const p = 10**Math.floor(Math.log10(Math.max(x, 1e-9))); return [1, 2, 2.5, 5, 10].map(k => k*p).find(v => v >= x) || p*10; }
function boxViolin(v, label){
  const W = 520, H = 120, m = {l: 20, r: 20}, s = v.slice().sort((a, b) => a - b), lo = s[0], hi = s[s.length - 1], X = x => m.l + (x - lo)/((hi - lo) || 1)*(W - m.l - m.r), q = p => quantile(s, p), bw = (hi - lo)/30 || 1;
  const dens = []; for (let i = 0; i <= 60; i++){ const x = lo + (hi - lo)*i/60; let d = 0; for (const t of s) d += Math.exp(-.5*((x - t)/bw)**2); dens.push([x, d]); } const dm = Math.max(...dens.map(d => d[1])) || 1;
  const top = dens.map(([x, d]) => `${X(x).toFixed(1)},${(50 - d/dm*34).toFixed(1)}`).join(" "), bot = dens.slice().reverse().map(([x, d]) => `${X(x).toFixed(1)},${(50 + d/dm*34).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" class="xsvg" style="width:100%;height:auto"><polygon points="${top} ${bot}" fill="rgba(74,168,255,.25)" stroke="#4aa8ff" stroke-width="1"/><line x1="${X(q(.05))}" x2="${X(q(.95))}" y1="50" y2="50" stroke="#cfd6dd"/><rect x="${X(q(.25))}" y="41" width="${X(q(.75)) - X(q(.25))}" height="18" fill="rgba(255,255,255,.12)" stroke="#fff"/><line x1="${X(q(.5))}" x2="${X(q(.5))}" y1="38" y2="62" stroke="#ff8a4c" stroke-width="2.5"/>
    <text x="${X(q(.05))}" y="100" text-anchor="middle">${tfmt(q(.05))}</text><text x="${X(q(.5))}" y="100" text-anchor="middle">${tfmt(q(.5))}</text><text x="${X(q(.95))}" y="100" text-anchor="middle">${tfmt(q(.95))}</text><text x="${W/2}" y="116" text-anchor="middle" class="al">Violin + box: P25–P75 box, P50 line, P5–P95 whiskers · ${esc(label)} (m)</text></svg>`; }
function spatialContextHTML(R, S, acf){
  const g = f => { const v = S.filter(f).map(s => s.w); return v.length ? `${nf(median(v))} m (n=${v.length})` : "–"; };
  const near = (km0, up) => S.filter(s => (up ? s.km < km0 : s.km > km0) && Math.abs(s.km - km0) < Math.max(2, 10*s.w/1000)).map(s => s.w);
  const conf = R.tribs.filter(t => !t.distributary && S.length && t.km > S[0].km && t.km < S[S.length - 1].km).map(t => { const u = near(t.km, true), d = near(t.km, false); return u.length && d.length ? {t, u: median(u), d: median(d)} : null; }).filter(Boolean);
  const dams = R.dams.filter(d => S.length && d.km > S[0].km && d.km < S[S.length - 1].km).map(dm => { const u = near(dm.km, true), d = near(dm.km, false); return u.length && d.length ? {dm, u: median(u), d: median(d)} : null; }).filter(Boolean);
  const kn = R.prof ? R.prof.knick.filter(k => S.length && k.km > S[0].km && k.km < S[S.length - 1].km).map(k => { const u = near(k.km, true), d = near(k.km, false); return u.length && d.length ? {k, u: median(u), d: median(d)} : null; }).filter(Boolean) : [];
  const byReach = (R.reaches || []).map(r => { const v = S.filter(s => s.km >= r.k0 && s.km < r.k1).map(s => s.w); return v.length > 3 ? {r, med: median(v), cv: (Math.sqrt(v.reduce((a, x) => a + (x - v.reduce((p, q) => p + q, 0)/v.length)**2, 0)/v.length))/(v.reduce((p, q) => p + q, 0)/v.length)} : null; }).filter(Boolean);
  const sp = S.length > 1 ? (S[S.length - 1].km - S[0].km)/(S.length - 1) : NaN;
  return kv([["At bend apexes", g(s => s.cls === "apex")], ["At inflections", g(s => s.cls === "inflection")], ["Elsewhere", g(s => s.cls === "intermediate")], ["Autocorrelation length", Number.isFinite(acf) ? `${acf} stations ≈ ${km(acf*sp)}` : "–"], ["Characteristic variation length", Number.isFinite(acf) ? km(2*acf*sp) : "–"]]) +
    (conf.length || dams.length || kn.length ? `<div class="scroll"><table class="grid"><tr><th>Feature</th><th>km</th><th>width upstream</th><th>downstream</th><th>change</th></tr>${[...conf.map(c => [`confluence: ${esc(c.t.name)}`, c.t.km, c.u, c.d]), ...dams.map(c => [`dam/weir${c.dm.name ? ": " + esc(c.dm.name) : ""}`, c.dm.km, c.u, c.d]), ...kn.map(c => ["knickpoint", c.k.km, c.u, c.d])].map(([n, k, u, d]) => `<tr data-k="${k}"><td>${n}</td><td>${nf(k)}</td><td>${nf(u)} m</td><td>${nf(d)} m</td><td>${d > u ? "+" : ""}${nf((d - u)/u*100)}%</td></tr>`).join("")}</table></div><p class="note">Medians of stations within about ten channel widths either side; stations flagged for junction or dam contamination are still included here so the effect is visible.</p>` : "") +
    (byReach.length ? `<div class="scroll"><table class="grid"><tr><th>Reach</th><th>km</th><th>median width</th><th>CV</th></tr>${byReach.map(b => `<tr data-k="${(b.r.k0 + b.r.k1)/2}"><td>${b.r.i + 1}</td><td>${nf(b.r.k0)}–${nf(b.r.k1)}</td><td>${nf(b.med)} m</td><td>${nf(b.cv, 2)}</td></tr>`).join("")}</table></div>` : "");
}
function ratiosHTML(R, sr, S, statsT){
  const rs = (R.reaches || []).filter(r => r.k1 > sr.k0 && r.k0 < sr.k1); rs.forEach(r => { if (r.meanK == null) curvatureStats(R, r); geomExtras(R, r); });
  const Wm = statsT[0][2] ? statsT[0][2].median : NaN, Wa = statsT.find(x => x[0] === "active")[2], belt = statsT.find(x => x[0] === "belt")[2], fp = statsT.find(x => x[0] === "floodplain")[2], val = statsT.find(x => x[0] === "valley")[2];
  const mt = S.filter(s => s.N > 1), rows = [
    ["Channel belt ÷ channel", belt ? belt.median/Wm : NaN, "digitised belt width", "main-thread mapped water width"],
    ["Floodplain ÷ channel", fp ? fp.median/Wm : NaN, "terrain floodplain width", "main-thread mapped water width"],
    ["Channel ÷ valley floor (confinement proxy)", val ? Wm/val.median : NaN, "main-thread mapped water width", "terrain valley-floor width"],
    ["Wavelength ÷ width", median(rs.map(r => r.lambda).filter(Number.isFinite))*1000/Wm, "meander wavelength (2× half-bend)", "main-thread mapped water width"],
    ["Bend radius ÷ width", median(rs.map(r => r.Rc).filter(Number.isFinite))*1000/Wm, "median bend radius", "main-thread mapped water width"],
    ["Meander amplitude ÷ width", median(rs.map(r => r.amp).filter(Number.isFinite))*1000/Wm, "peak-to-peak amplitude about the valley axis", "main-thread mapped water width"],
    ["Braidplain ÷ mean thread width", mt.length ? median(mt.map(s => s.Wact/s.mean)) : NaN, "active corridor (water + bars)", "B/N at the same station"],
    ["Active ÷ main-thread width", Wa ? Wa.median/Wm : NaN, "active corridor", "main-thread mapped water width"],
    ["Neck ÷ channel width", NaN, "neck width between opposing banks", "channel width (needs neck stations — not yet measured)"],
    ["Width ÷ depth", NaN, "channel width", "independently measured depth (not available from imagery)"]];
  return `<div class="scroll"><table class="grid"><tr><th>Ratio</th><th>value</th><th>numerator</th><th>denominator</th></tr>${rows.map(([n, v, a, b]) => `<tr><td>${n}</td><td>${Number.isFinite(v) ? nf(v, 2) : "<span class='qc missing'>unavailable</span>"}</td><td class="wdef">${a}</td><td class="wdef">${b}</td></tr>`).join("")}</table></div><p class="note">Medians of each quantity over the selection (n = ${S.length} stations, ${rs.length} reaches). Ratios built from different width types are named explicitly; compare like with like.</p>`; }
function qcHTML(all){
  const cnt = {}; all.forEach(s => s.flags.forEach(f => { const k = f.replace(/\(.*?\)/g, "").replace(/:.*$/, "").trim(); cnt[k] = (cnt[k] || 0) + 1; }));
  const ex = all.filter(s => s.off).length, cor = all.filter(s => s.wc != null).length;
  return `<div class="scroll"><table class="grid"><tr><th>Flag</th><th>stations</th><th>share</th></tr>${Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td><td>${nf(v/all.length*100)}%</td></tr>`).join("") || `<tr><td>No flags</td><td>0</td><td>0%</td></tr>`}<tr><td>Excluded by you</td><td>${ex}</td><td>${nf(ex/Math.max(1, all.length)*100)}%</td></tr><tr><td>Corrected by you (original kept)</td><td>${cor}</td><td>${nf(cor/Math.max(1, all.length)*100)}%</td></tr></table></div><p class="note">Flagged stations stay in the statistics unless excluded (rejected geometry is always left out). Select a station in a chart or on the map to inspect it.</p>`; }

/* ---------- station inspector, selection and editing ---------- */
function selectStationNear(R, k){ const S = stationsIn(R, 0, R.L, true); if (!S.length) return; let b = S[0]; for (const s of S) if (Math.abs(s.km - k) < Math.abs(b.km - k)) b = s; XR.wsel = b.id; renderInspector(R); xmap.req(); }
function renderInspector(R){
  const el = $("w6Insp"); if (!el) return; const s = stationsIn(R, 0, R.L, true).find(x => x.id === XR.wsel); if (!s){ el.innerHTML = ""; return; }
  el.innerHTML = `<div class="card winsp"><div class="anh"><b>Station at km ${nf(s.km, 2)}</b><span class="qc ${s.off ? "missing" : s.flags.length ? "review" : "ok"}">${s.off ? "excluded" : s.flags.length ? "flagged" : "ok"}</span></div>
    ${kv([["Coordinates", `${s.lat.toFixed(5)}°, ${s.lon.toFixed(5)}°`], ["Main-thread width", `${nf(s.w)} m ± ${nf(s.unc)} m${s.wc != null ? ` → corrected ${nf(s.wc)} m` : ""}`], ["Threads N", String(s.N)], ["Total wetted B", nf(s.B) + " m"], ["Outer span Ws", nf(s.Ws) + " m"], ["Active (water + bars)", nf(s.Wact) + " m"], ["Medial-axis width", nf(s.wDT) + " m"], ["Channel belt", s.belt ? nf(s.belt) + " m" : "–"], ["Floodplain / valley", s.fp ? `${nf(s.fp)} / ${nf(s.valley)} m` : "–"], ["Bend position", s.cls || "–"], ["Banks from centreline (L / R)", `${nf(s.left)} / ${nf(s.right)} m`], ["Cells across", nf(s.pix, 1)], ["Source", "OpenStreetMap water areas (undated)"]])}
    ${s.threads && s.threads.length > 1 ? `<p class="note">Threads: ${s.threads.map(t => nf(t.w) + " m").join(" + ")}</p>` : ""}${s.flags.length ? `<p class="warn">${s.flags.map(esc).join("<br>")}</p>` : ""}
    <div class="btns"><button class="sm" id="w6Off">${s.off ? "Restore station" : "Exclude station"}</button><input type="number" id="w6Cor" placeholder="corrected width (m)" style="width:150px" value="${s.wc ?? ""}"><button class="sm" id="w6CorGo">Save correction</button>${s.wc != null ? `<button class="sm" id="w6CorX">Undo correction</button>` : ""}<button class="sm" id="w6Fly">Show on map</button></div></div>`;
  $("w6Off").onclick = () => { s.off = !s.off; renderX(); }; $("w6CorGo").onclick = () => { const v = +$("w6Cor").value; if (v > 0){ s.wc = v; s.wOrig = s.w; renderX(); } };
  if ($("w6CorX")) $("w6CorX").onclick = () => { delete s.wc; renderX(); }; $("w6Fly").onclick = () => { setPos(s.km); flyTo(s.km, 15); };
}
function widthTap(sx, sy){
  if (XR.tab !== "width" || XR.mode) return false; const R = XR.river; if (!R) return false; let best = null, bd = 14;
  for (const s of stationsIn(R, 0, R.L, true)){ if (!s.a) continue; const a = xmap.toScr(...s.a), b = xmap.toScr(...s.b), q = [(a[0] + b[0])/2, (a[1] + b[1])/2], d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; best = s; } }
  if (best){ XR.wsel = best.id; setPos(best.km); renderInspector(R); xmap.req(); return true; } return false; }
function drawWidthOnMap(ctx, M){
  const R = XR.river; if (!R || XR.tab !== "width") return false; const S = stationsIn(R, 0, R.L, true); if (!S.length) return false;
  const v = S.filter(s => Number.isFinite(s.w)).map(s => Math.log10(s.wc ?? s.w)), lo = quantile(v, .02), hi = quantile(v, .98);
  ctx.save(); ctx.lineCap = "round";
  for (const s of S){ if (!s.a) continue; const ca = xmap.toScr(...(s.ca || s.a)), cb = xmap.toScr(...(s.cb || s.b)), a = xmap.toScr(...s.a), b = xmap.toScr(...s.b);
    if (s.N > 1){ ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ca[0], ca[1]); ctx.lineTo(cb[0], cb[1]); ctx.stroke(); }
    ctx.strokeStyle = s.off ? "rgba(255,90,90,.9)" : s.ok === false ? "#ff4d5e" : xcol((Math.log10(s.wc ?? s.w) - lo)/((hi - lo) || 1)); ctx.lineWidth = s.id === XR.wsel ? 4 : 2.2; ctx.setLineDash(s.off ? [3, 3] : []); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (s.flags.length && !s.off){ const q = [(a[0] + b[0])/2, (a[1] + b[1])/2]; ctx.fillStyle = "#ffc857"; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill(); } }
  ctx.setLineDash([]); XR.legend = {key: "width_st", met: {n: "Station width (main thread)", u: "m", log: true}, lo, hi, n: v.length, inv: false};
  ctx.restore(); return true;
}

/* ---------- width through time at fixed stations ---------- */
XR.wtime = XR.wtime || [];
function temporalWidthHTML(R, sr){
  const D = (R.digit || []).filter(f => f.kind === "water" && f.date), sets = XR.wtime.filter(t => t.R === R);
  return `<p class="note">Re-measure the same stations on dated water extents: import a GeoJSON of water polygons with a <code>date</code> property (for example exported from Sentinel-2 or Landsat water masks, or JRC monthly history), or digitise a dated water outline. Compare dates at a similar water stage; water-extent change alone is not proof of erosion or deposition.</p>
    <div class="row"><label class="sm filebtn">⇪ Dated water GeoJSON<input type="file" id="w6TImp" accept=".json,.geojson" hidden></label><input type="date" id="w6TDate" value="${XR.digDate || ""}"><button class="sm" data-dig="water">✎ Digitise dated water outline</button>${D.length ? `<button class="sm" id="w6TDig">Measure ${D.length} digitised outline${D.length > 1 ? "s" : ""}</button>` : ""}</div>
    ${sets.length ? temporalTable(R, sr, sets) : ""}`; }
async function measureDated(R, polys, date, label){
  const S0 = stationsIn(R, 0, R.L, true).filter(s => Number.isFinite(s.w)); if (!S0.length) throw new Error("measure the modern widths first: the dated extents are measured at the same stations");
  const k0 = S0[0].km, k1 = S0[S0.length - 1].km, Rs = await waterRaster(R, Math.max(0, k0 - .1), Math.min(R.L, k1 + .1), {polys: polys.map(rg => ({bar: false, rings: rg}))});
  const S = measureStations(R, null, Rs, S0.map(s => s.km), XR.wopt); XR.wtime = XR.wtime.filter(t => !(t.R === R && t.date === date)); XR.wtime.push({R, date, label, S, res: Rs.res*1000}); XR.wtime.sort((a, b) => a.date.localeCompare(b.date)); renderX();
  xstatus(`Measured ${S.filter(s => Number.isFinite(s.w)).length} of ${S.length} stations on the ${esc(date)} water extent.`, "ok"); }
function temporalTable(R, sr, sets){
  const base = {date: "modern (OSM)", S: stationsIn(R, 0, R.L, true)}, all = [...sets], yrs = (a, b) => (new Date(b) - new Date(a))/3.15576e10;
  const pairs = []; for (let i = 0; i + 1 < all.length; i++) pairs.push([all[i], all[i + 1]]);
  const summ = (A, B) => { const dt = yrs(A.date, B.date), rows = []; const mp = new Map(B.S.map(s => [s.km.toFixed(3), s]));
    for (const a of A.S){ const b = mp.get(a.km.toFixed(3)); if (!b || !Number.isFinite(a.w) || !Number.isFinite(b.w) || a.km < sr.k0 || a.km > sr.k1) continue; const dL = b.left - a.left, dR = b.right - a.right, unc = Math.max(A.res, B.res)*1.41;
      const cls = Math.abs(dL) < unc && Math.abs(dR) < unc ? "stable" : Math.sign(dL) === -Math.sign(dR) && Math.abs(Math.abs(dL) - Math.abs(dR)) < unc*1.5 ? "migration" : dL + dR > unc ? "widening" : dL + dR < -unc ? "narrowing" : "mixed";
      rows.push({km: a.km, dW: b.w - a.w, pct: (b.w - a.w)/a.w*100, dL, dR, cls, split: b.N > a.N, merge: b.N < a.N}); }
    const c = k => rows.filter(r => r.cls === k).length;
    return {A, B, dt, rows, n: rows.length, dW: median(rows.map(r => r.dW)), pct: median(rows.map(r => r.pct)), rL: median(rows.map(r => r.dL))/dt, rR: median(rows.map(r => r.dR))/dt, mig: c("migration"), wid: c("widening"), nar: c("narrowing"), st: c("stable"), mixed: c("mixed"), split: rows.filter(r => r.split).length, merge: rows.filter(r => r.merge).length, unc: Math.max(A.res, B.res)*1.41}; };
  const P = pairs.map(([a, b]) => summ(a, b));
  return `<div class="scroll"><table class="grid"><tr><th>Interval</th><th>stations</th><th>width change (median)</th><th>rate</th><th>left bank</th><th>right bank</th><th>migration / widening / narrowing / stable</th><th>threads split / merged</th></tr>${P.map(p => `<tr><td>${esc(p.A.date)} → ${esc(p.B.date)} (${nf(p.dt, 1)} yr)</td><td>${p.n}</td><td>${nf(p.dW)} m (${p.pct > 0 ? "+" : ""}${nf(p.pct)}%)</td><td>${nf(p.dW/p.dt, 1)} m/yr</td><td>${nf(p.rL, 1)} m/yr</td><td>${nf(p.rR, 1)} m/yr</td><td>${p.mig} / ${p.wid} / ${p.nar} / ${p.st}</td><td>${p.split} / ${p.merge}</td></tr>`).join("") || `<tr><td colspan="8">Add a second dated extent to compare.</td></tr>`}</table></div>
    <p class="note">Bank displacement is measured along each fixed station's normal: positive = the bank moved outward (to the left for the left bank, to the right for the right bank). Changes smaller than about ${P[0] ? nf(P[0].unc) : "1.4 cells"} m (raster cells of both dates) count as stable. Migration = both banks shift the same way by similar amounts; widening/narrowing = net outward/inward movement. Registration error between sources is not yet measured.</p>
    <div class="xchart" id="w6TChart"></div>${sets.map(t => `<span class="chip">${esc(t.date)} · ${t.S.filter(s => Number.isFinite(s.w)).length} stations <button class="sm" data-wtx="${esc(t.date)}">✕</button></span>`).join(" ")}`; }

/* ---------- wiring and exports ---------- */
function wireWidth(R, sr, S, all){
  const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
  const md = $("w6Mode"); if (md) md.onchange = e => { XR.wopt.mode = e.target.value; renderX(); };
  const sp = $("w6Sp"); if (sp) sp.onchange = e => XR.trSp = +e.target.value || 0; const kk = $("w6K"); if (kk) kk.onchange = e => XR.wopt.k = +e.target.value || 2;
  const or = $("w6Or"); if (or) or.onchange = e => XR.wopt.orient = clamp(+e.target.value || 10, 2, 30); const gp = $("w6Gap"); if (gp) gp.onchange = e => XR.wopt.gapCells = clamp(+e.target.value || 2, 1, 20);
  on("w6Go", () => { const rs = (R.reaches || []).filter(r => r.k1 > sr.k0 && r.k0 < sr.k1); const todo = rs.filter(r => !(r.width && r.width.stations)); runWidth(todo.length ? todo : rs).then(() => { showXTab("width"); }); });
  on("w6Edit", () => { if (!all.length) return toast("Measure widths first"); toast("Tap a transect on the map to inspect it"); const t = $("xMap"); t && t.scrollIntoView({behavior: "smooth", block: "center"}); });
  const ty = $("w6Ty"); if (ty) ty.onchange = e => { XR.w6ty = e.target.value; renderX(); }; const bn = $("w6Bin"); if (bn) bn.onchange = e => { XR.w6bin = +e.target.value || 0; renderX(); };
  document.querySelectorAll("#x6-width [data-dig]").forEach(b => b.onclick = () => { const date = $("w6TDate") ? $("w6TDate").value : ""; XR.digDate = date || XR.digDate; if (b.dataset.dig === "water" && !date) return toast("Set the date of the water outline first"); xSetMode("dig", {kind: b.dataset.dig, line: false, date}); });
  const td = $("w6TDate"); if (td) td.onchange = e => XR.digDate = e.target.value;
  on("w6TDig", async () => { const D = (R.digit || []).filter(f => f.kind === "water" && f.date), by = {}; D.forEach(f => (by[f.date] = by[f.date] || []).push([f.pts])); for (const [d, polys] of Object.entries(by)) await measureDated(R, polys, d, "digitised").catch(e => xstatus(esc(e.message), "err")); });
  const ti = $("w6TImp"); if (ti) ti.onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { const J = JSON.parse(await f.text()), fs = J.type === "FeatureCollection" ? J.features : [J], by = {};
      for (const ft of fs){ const d = ft.properties && (ft.properties.date || ft.properties.Date || ft.properties.acquired || ft.properties.time); if (!d || !ft.geometry) continue; const ds = String(d).slice(0, 10), polys = ft.geometry.type === "Polygon" ? [ft.geometry.coordinates] : ft.geometry.type === "MultiPolygon" ? ft.geometry.coordinates : []; for (const p of polys) (by[ds] = by[ds] || []).push(p.map(rg => rg.map(c => [c[1], c[0]]))); }
      if (!Object.keys(by).length) throw new Error("no polygons with a date property"); for (const [d, polys] of Object.entries(by)) await measureDated(R, polys, d, f.name); } catch(er){ xstatus("Dated water: " + esc(er.message), "err"); } };
  document.querySelectorAll("[data-wtx]").forEach(b => b.onclick = () => { XR.wtime = XR.wtime.filter(t => !(t.R === R && t.date === b.dataset.wtx)); renderX(); });
  const sets = XR.wtime.filter(t => t.R === R); if (sets.length && $("w6TChart")) svgChart($("w6TChart"), {h: 200, xlab: "Distance from source (km)", ylab: "Main-thread width (m)", series: sets.map((t, i) => ({x: t.S.map(s => s.km), y: t.S.map(s => s.w), c: ["#c9a7ff", "#43d9e8", "#ffd84a", "#4cd17a", "#ff8a4c"][i % 5], w: 1.6}))});
  on("w6Csv", () => save(R.name.replace(/[^\w]+/g, "_") + "_width_stations.csv", xcsv(all.map(s => ({station_id: s.id, km: s.km, lat: s.lat, lon: s.lon, tangent_az_deg: s.az, width_definition: "main-thread mapped water width", width_m: s.w, corrected_width_m: s.wc ?? "", uncertainty_m: s.unc, uncertainty_rel: s.uncRel, thread_count: s.N, threads_m: s.threads ? s.threads.map(t => t.w.toFixed(1)).join(";") : "", total_wetted_B_m: s.B, outer_span_Ws_m: s.Ws, interchannel_m: s.inter, active_m: s.Wact, dominant_fraction: s.domFrac, wetted_fraction: s.wetFrac, medial_axis_m: s.wDT, belt_m: s.belt ?? "", floodplain_m: s.fp ?? "", valley_m: s.valley ?? "", left_bank_m: s.left, right_bank_m: s.right, bend_class: s.cls || "", curvature_rad_km: s.curv ?? "", cells_across: s.pix, raster_cell_m: s.res, orientation_sensitivity: s.orientSens, excluded: s.off ? 1 : 0, rejected: s.ok === false ? 1 : 0, qc_flags: s.flags.join(" | "), boundary_source: "OpenStreetMap water areas (undated)", method: WIDTH_VERSION})))));
  on("w6Geo", () => save(R.name.replace(/[^\w]+/g, "_") + "_width_transects.geojson", JSON.stringify({type: "FeatureCollection", features: all.filter(s => s.a).flatMap(s => [{type: "Feature", properties: {station_id: s.id, km: s.km, role: "main_thread_transect", width_m: s.w, corrected_width_m: s.wc ?? null, threads: s.N, qc: s.flags, excluded: s.off}, geometry: {type: "LineString", coordinates: [[s.a[1], s.a[0]], [s.b[1], s.b[0]]]}}, ...(s.ca ? [{type: "Feature", properties: {station_id: s.id, role: "corridor_span", Ws_m: s.Ws, active_m: s.Wact}, geometry: {type: "LineString", coordinates: [[s.ca[1], s.ca[0]], [s.cb[1], s.cb[0]]]}}] : [])])})));
  on("w6Meta", () => save(R.name.replace(/[^\w]+/g, "_") + "_width_metadata.json", JSON.stringify({app: "Earthform Lens", module: "Channel width", version: WIDTH_VERSION, exported: new Date().toISOString(), river: R.name, source: R.osm, selection_km: [sr.k0, sr.k1], options: {...XR.wopt, spacing_m: XR.trSp || "auto"}, reaches: (R.reaches || []).filter(r => r.width && r.width.stations).map(r => ({i: r.i + 1, km: [r.k0, r.k1], raster_cell_m: r.width.res, osm_polygons: r.width.nPolys, osm_bars: r.width.nBars, stations: r.width.stations.length, measured: r.width.made})), definitions: Object.fromEntries(WTYPES.map(([k, n, , d]) => [k, {name: n, definition: d}])), bankfull: "unavailable without independent bankfull evidence", stats_main_thread: widthStats(S.map(s => s.wc ?? s.w), acfLength(S.map(s => s.w)))}, null, 1)));
  document.querySelectorAll("#x6-width [data-k]").forEach(t => t.onclick = () => { setPos(+t.dataset.k); selectStationNear(R, +t.dataset.k); });
  renderInspector(R);
}

/* ---------- hooks: results, analogue records, self-test ---------- */
{ const rs0 = resultSet; resultSet = function(R, k0 = 0, k1 = R.L){ const out = rs0(R, k0, k1), S = stationsIn(R, k0, k1, false); if (!S.length) return out; const sid = studyId(R, k0, k1), acf = acfLength(S.map(s => s.w));
    const add = (metric, label, f, unit, method) => { const st = widthStats(S.map(f).filter(v => Number.isFinite(v)), acf); out.push({id: `${sid}#${metric}`, study: sid, metric, label, value: st ? st.median : null, unit, kind: "measured", geometry: {type: "stations", n: S.length}, samples: st ? {n: st.n, p10: st.p10, p25: st.p25, p50: st.median, p75: st.p75, p90: st.p90, mean: st.mean, sd: st.sd, min: st.min, max: st.max, cv: st.cv} : null, source: "OpenStreetMap water areas (ODbL)", resolution: `${nf(median(S.map(s => s.res)))} m raster`, method, params: {...XR.wopt}, version: WIDTH_VERSION, qc: st ? (S.length < 10 ? "partial" : "ok") : "missing", tab: "width"}); };
    add("width_total_wetted", "Total wetted width B", s => s.B, "m", "sum of thread widths across the corridor"); add("width_active", "Active channel width (water + bars)", s => s.Wact, "m", "outer span extended over mapped bars"); add("thread_count", "Thread count N", s => s.N, "", "water intervals connected to the centreline thread"); add("width_medial", "Medial-axis width", s => s.wDT, "m", "2 × distance to nearest bank (distance transform)");
    const belt = S.map(s => s.belt).filter(Number.isFinite); if (belt.length) add("width_belt", "Channel-belt width (digitised)", s => s.belt, "m", "transect length within the digitised belt polygon");
    return out; }; }
{ const st0 = runSelfTest; runSelfTest = async function(){ const T = await st0(), ok = (name, got, exp, tol, unit) => { const err = Math.abs(got - exp)/Math.abs(exp); T.push({name, got, exp, tol, unit, pass: Number.isFinite(got) && err <= tol, err, kind: "relative"}); };
    // worked multithread example: 180 + 95 + 65 m threads in a 600 m braidplain (bars between threads)
    { const step = 1, n = 1000, wet = new Uint8Array(n), bar = new Uint8Array(n), put = (a, b, arr) => { for (let i = a; i < b; i++) arr[i] = 1; }; const s0 = 200; put(s0, s0 + 600, bar); put(s0, s0 + 180, wet); put(s0 + 300, s0 + 395, wet); put(s0 + 535, s0 + 600, wet); for (let i = 0; i < n; i++) if (wet[i]) bar[i] = 0;
      const A = analyzeTransect(wet, bar, step, s0 + 90, 30); ok("Multithread total wetted width B (340 m)", A.B, 340, .005, "m"); ok("Thread count N (3)", A.N, 3, 0, ""); ok("Mean thread width B/N (113.3 m)", A.mean, 340/3, .005, "m"); ok("Dominant fraction (52.9%)", A.domFrac*100, 180/340*100, .005, "%"); ok("Wetted fraction of braidplain (56.7%)", A.wetFrac*100, 340/600*100, .005, "%"); }
    // straight synthetic channel 200 m wide, rasterised and measured by the station engine
    { const lat0 = 20, lon0 = 10, kx = Math.cos(lat0*D2R)*R_E*D2R, ky = R_E*D2R, pts = []; for (let i = 0; i <= 200; i++) pts.push([lat0, lon0 + (i*.05)/kx]); const R = {name: "syn", osm: "draw:syn", main: pts, cum: withCum(pts), side: [], tribs: [], dams: [], digit: []}; R.L = R.cum[R.cum.length - 1];
      const half = .1/ky, poly = [[lat0 - half, lon0 - .01], [lat0 - half, lon0 + 10.2/kx], [lat0 + half, lon0 + 10.2/kx], [lat0 + half, lon0 - .01]];
      const Rs = await waterRaster(R, 0, R.L, {polys: [{bar: false, rings: [poly]}]}), S = measureStations(R, null, Rs, [2, 4, 6, 8], XR.wopt).filter(s => Number.isFinite(s.w));
      ok("Straight channel width from rasterised polygon (200 m)", median(S.map(s => s.w)), 200, .05, "m"); ok("Medial-axis width, straight channel (200 m)", median(S.map(s => s.wDT)), 200, .08, "m"); }
    // profile robustness: a straight 300 m → 0 m profile with deep spikes (DEM voids) must not turn into a staircase
    { const lat0 = 0, kx = R_E*D2R, pts = [], zu = []; for (let i = 0; i <= 1000; i++){ pts.push([lat0, 30 + (i*.1)/kx]); zu.push(300 - .3*i + (i % 7 === 0 ? 0 : 0)); } [[120, 125], [400, 408], [700, 704]].forEach(([a, b]) => { for (let i = a; i <= b; i++) zu[i] -= 150; });
      const R = {name: "syn", osm: "draw:syn", main: pts, cum: withCum(pts), side: [], tribs: [], dams: [], zUser: zu}; R.L = R.cum[R.cum.length - 1]; const keep = XR.pp; XR.pp = null;
      const pr = await loadProfile(R), err = Math.max(...pr.zc.map((z, i) => Math.abs(z - (300 - 3*pr.d[i])))); XR.pp = {cond: "min", despike: false}; const pm = await loadProfile(R), errMin = Math.max(...pm.zc.map((z, i) => Math.abs(z - (300 - 3*pm.d[i])))); XR.pp = keep;
      T.push({name: `Profile with 3 deep, multi-sample dips (DEM voids): max error with spike removal + isotonic conditioning (running minimum without removal: ${nf(errMin)} m)`, got: err, exp: 0, tol: null, unit: "m", pass: err < 3, err, kind: "abs < 3 m"});
      T.push({name: "Dip samples detected and removed (20 inserted)", got: pr.spikes.length, exp: 20, pass: pr.spikes.length >= 18 && pr.spikes.length <= 26, err: Math.abs(pr.spikes.length - 20), unit: "samples", kind: "count"}); }
    return T; }; window.__selfTest = runSelfTest; }
