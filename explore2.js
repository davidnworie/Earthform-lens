/* ===================== River Explorer: advanced geomorphological modules ===================== */
// 1 long profile (+ slope–area concavity θ, steepness ksn) · 2 channel geometry (curvature) · 3 drainage network (Strahler, Dd, Rb)
// 4 catchment (area, relief, hypsometry) · 5 floodplain (width, confinement) · 6 delta (distributaries, bifurcations)
// 7 temporal (Esri Wayback image pairs → Lab change detection) · 8 sediment routing zones · comparison of rivers / reaches

/* ---------- DEM grid over an area (Web Mercator pixels of AWS Terrain Tiles) ---------- */
async function demGrid(bb, maxCells, onp){
  const [s, w, n, e] = bb; let z = 12;
  for (; z > 2; z--){ const W = lon2x(e, z) - lon2x(w, z), H = lat2y(s, z) - lat2y(n, z); if (W*H <= maxCells) break; }
  const X0 = Math.floor(lon2x(w, z)), X1 = Math.ceil(lon2x(e, z)), Y0 = Math.floor(lat2y(n, z)), Y1 = Math.ceil(lat2y(s, z)), W = X1 - X0, H = Y1 - Y0;
  const E = new Float32Array(W*H).fill(NaN), tiles = [];
  for (let ty = Math.floor(Y0/256); ty <= Math.floor((Y1 - 1)/256); ty++) for (let tx = Math.floor(X0/256); tx <= Math.floor((X1 - 1)/256); tx++) tiles.push([tx, ty]);
  let done = 0;
  for (let b = 0; b < tiles.length; b += 8){
    await Promise.all(tiles.slice(b, b + 8).map(async ([tx, ty]) => { const t = await demTile(z, tx, ty); done++; if (!t) return;
      for (let py = 0; py < 256; py++){ const gy = ty*256 + py - Y0; if (gy < 0 || gy >= H) continue; for (let px = 0; px < 256; px++){ const gx = tx*256 + px - X0; if (gx < 0 || gx >= W) continue; E[gy*W + gx] = t[py*256 + px]; } } }));
    if (onp) onp(done/tiles.length);
  }
  const cellM = new Float32Array(H); for (let y = 0; y < H; y++) cellM[y] = 40075016.686*Math.cos(y2lat(Y0 + y + .5, z)*D2R)/(256*2**z);
  return {z, X0, Y0, W, H, E, cellM, tiles: tiles.length};
}
const gridLL = (g, gx, gy) => [y2lat(g.Y0 + gy + .5, g.z), x2lon(g.X0 + gx + .5, g.z)];
const llGrid = (g, lat, lon) => [Math.floor(lon2x(lon, g.z) - g.X0), Math.floor(lat2y(lat, g.z) - g.Y0)];

/** priority-flood fill (+ε), steepest-descent receivers, accumulation of area (km²) */
function hydro(g){
  const {W, H, E} = g, N = W*H, F = new Float64Array(N), rec = new Int32Array(N).fill(-1), closed = new Uint8Array(N), order = new Int32Array(N); let no = 0;
  const hk = new Float64Array(N + 8), hv = new Int32Array(N + 8); let hn = 0;
  const push = (k, v) => { let i = hn++; while (i > 0){ const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => { const v = hv[0], k = hk[--hn], x = hv[hn]; let i = 0; while (true){ let c = 2*i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = x; return v; };
  const sea = new Uint8Array(N);
  for (let i = 0; i < N; i++){ const x = i % W, y = (i/W)|0, v = E[i]; const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (!Number.isFinite(v)){ closed[i] = 1; sea[i] = 1; continue; }
    if (v <= 0){ sea[i] = 1; } if (edge || v <= 0){ F[i] = Number.isFinite(v) ? v : 0; closed[i] = 1; push(F[i], i); } }
  // cells next to nodata are outlets too
  for (let i = 0; i < N; i++) if (!closed[i]){ const x = i % W, y = (i/W)|0; for (const [dx, dy] of NB8){ const j = (y + dy)*W + x + dx; if (j >= 0 && j < N && !Number.isFinite(E[j])){ F[i] = E[i]; closed[i] = 1; push(F[i], i); break; } } }
  while (hn){ const c = pop(); order[no++] = c; const x = c % W, y = (c/W)|0;
    for (const [dx, dy] of NB8){ const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny*W + nx; if (closed[j]) continue; closed[j] = 1; F[j] = Math.max(E[j], F[c] + 1e-3); rec[j] = c; push(F[j], j); } }
  // steepest descent on the filled surface (fall back to the flooding parent)
  for (let i = 0; i < N; i++){ if (sea[i] || rec[i] < 0) continue; const x = i % W, y = (i/W)|0; let best = rec[i], bs = 0;
    for (const [dx, dy] of NB8){ const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny*W + nx, s = (F[i] - F[j])/(dx && dy ? SQ2 : 1); if (s > bs){ bs = s; best = j; } } rec[i] = best; }
  const acc = new Float32Array(N); for (let i = 0; i < N; i++){ const m = g.cellM[(i/W)|0]/1000; acc[i] = sea[i] ? 0 : m*m; }
  for (let t = no - 1; t >= 0; t--){ const c = order[t], r = rec[c]; if (r >= 0 && !sea[c]) acc[r] += acc[c]; }
  return {F, rec, order: order.subarray(0, no), acc, sea};
}

/* ---------- 3 & 4. drainage network and catchment ---------- */
/** delineate the area draining to an outlet: terrain window bb [s,w,n,e], enlarged once if the basin touches its edge */
async function delineate(bb, outlet, label, grow){
  let out = null;
  for (let attempt = 0; attempt < 3; attempt++){
    xstatus(`${label}: reading terrain${attempt ? " (enlarged window)" : ""}…`, "busy");
    const g = await demGrid(bb, 2.2e6, p => xstatus(`${label}: reading terrain ${Math.round(p*100)}%…`, "busy")); await tick();
    xstatus(`${label}: routing water over ${nf(g.W*g.H/1e6, 1)} million cells…`, "busy"); await tick();
    const hy = hydro(g), [mx, my] = llGrid(g, outlet[0], outlet[1]); let ob = -1, oa = -1; const rad = 6;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++){ const x = mx + dx, y = my + dy; if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue; const i = y*g.W + x; if (!hy.sea[i] && hy.acc[i] > oa){ oa = hy.acc[i]; ob = i; } }
    if (ob < 0) throw new Error("the outlet is outside the terrain window or in the sea");
    const inB = new Uint8Array(g.W*g.H); inB[ob] = 1; for (const c of hy.order) if (!inB[c] && hy.rec[c] >= 0 && inB[hy.rec[c]]) inB[c] = 1;
    let touches = false; for (let x = 0; x < g.W && !touches; x++) if (inB[x] || inB[(g.H - 1)*g.W + x]) touches = true; for (let y = 0; y < g.H && !touches; y++) if (inB[y*g.W] || inB[y*g.W + g.W - 1]) touches = true;
    out = {g, hy, outlet: ob, outletLL: outlet, inB, clipped: touches, label, made: new Date().toISOString()};
    if (!touches || attempt === (grow ? 2 : 1)) break; const d = Math.max(bb[2] - bb[0], bb[3] - bb[1])*(grow ? .75 : .35); bb = [Math.max(-84, bb[0] - d), bb[1] - d, Math.min(84, bb[2] + d), bb[3] + d];
  }
  basinStatsB(out); out.net = networkStatsB(out, null); return out;
}
async function runBasin(R){
  // window: the river's extent with generous margins (catchments reach far beyond the main stem)
  let s = 90, n = -90, w = 180, e = -180; for (let i = 0; i < R.main.length; i += Math.max(1, Math.floor(R.main.length/3000))){ const p = R.main[i]; s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  for (const t of R.tribs){ s = Math.min(s, t.stub[0][0]); n = Math.max(n, t.stub[0][0]); w = Math.min(w, t.stub[0][1]); e = Math.max(e, t.stub[0][1]); }
  const m = Math.max(.15, .25*Math.max(n - s, e - w)), bb = [Math.max(-84, s - m), w - m, Math.min(84, n + m), e + m];
  const out = await delineate(bb, R.main[R.main.length - 1], "Catchment", false);
  R.basin = out; R.net2 = networkStatsB(out, R.netThr || null); R.netThr = R.net2.At; R.basinOverlay = null;
  XR.showBasin = true; document.querySelectorAll('[data-show="basin"]').forEach(c => c.checked = true); alongRiverArea(R); classifyZones(R); renderX();
  xstatus(`Catchment of ${nf(R.basin.area)} km²${R.wd && R.wd.area ? ` (Wikidata: ${nf(R.wd.area)} km²)` : ""}; network to Strahler order ${R.net2.maxO}.${out.clipped ? " The catchment touches the edge of the terrain window, so it may be cut off." : ""}`, out.clipped ? "err" : "ok");
  enrichBasin(R, out).then(() => renderX()).catch(e => console.warn(e));
}
/** catchment of any outlet: a tributary junction or a tapped point */
async function runOutletBasin(R, ll, label){
  const d = .6, bb = [Math.max(-84, ll[0] - d), ll[1] - d/Math.cos(ll[0]*D2R), Math.min(84, ll[0] + d), ll[1] + d/Math.cos(ll[0]*D2R)];
  const B = await delineate(bb, ll, label, true); R.ob = B; R.obOverlay = null; XR.showBasin = true; document.querySelectorAll('[data-show="basin"]').forEach(c => c.checked = true); renderX();
  xstatus(`${esc(label)}: ${nf(B.area, B.area < 100 ? 1 : 0)} km² upstream, relief ${nf(B.relief)} m, Strahler order ${B.net.maxO}.${B.clipped ? " Still touches the terrain window edge: may be cut off." : ""}`, B.clipped ? "err" : "ok");
  enrichBasin(R, B).then(() => renderX()).catch(e => console.warn(e));
}
function basinStats(R){ basinStatsB(R.basin); }
function basinStatsB(B){
  const {g, inB} = B, W = g.W; let area = 0, zmin = Infinity, zmax = -Infinity, zs = [], far = 0, perim = 0, sl = [], slw = 0, sls = 0, nIn = 0; const o = gridLL(g, B.outlet % W, (B.outlet/W)|0);
  for (let i = 0; i < inB.length; i++) nIn += inB[i]; const st = Math.max(1, Math.floor(nIn/400000));
  for (let i = 0; i < inB.length; i++){ if (!inB[i]) continue; const x = i % W, y = (i/W)|0, cm = g.cellM[y], m = cm/1000; area += m*m; const z = g.E[i];
    // boundary: edges shared with outside cells (raster perimeter)
    if (x === 0 || !inB[i - 1]) perim += m; if (x === W - 1 || !inB[i + 1]) perim += m; if (y === 0 || !inB[i - W]) perim += m; if (y === g.H - 1 || !inB[i + W]) perim += m;
    if (Number.isFinite(z)){ zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); if ((x + y*7) % st === 0){ zs.push(z);
      if (x > 0 && x < W - 1 && y > 0 && y < g.H - 1){ const dzx = (g.E[i + 1] - g.E[i - 1])/(2*cm), dzy = (g.E[i + W] - g.E[i - W])/(2*cm); if (Number.isFinite(dzx) && Number.isFinite(dzy)){ const sd = Math.atan(Math.hypot(dzx, dzy))/D2R; sl.push(sd); sls += sd*m*m; slw += m*m; } } } } }
  for (let i = 0; i < inB.length; i += Math.max(1, st*3)) if (inB[i]) far = Math.max(far, hav(o, gridLL(g, i % W, (i/W)|0)));
  zs.sort((a, b) => a - b); const mean = zs.reduce((a, b) => a + b, 0)/zs.length, HI = (mean - zmin)/((zmax - zmin) || 1);
  const curve = []; for (let k = 0; k <= 50; k++){ const z = zs[Math.min(zs.length - 1, Math.floor((1 - k/50)*(zs.length - 1)))]; curve.push([k/50, (z - zmin)/((zmax - zmin) || 1)]); }
  const P = perim*Math.PI/4; // staircase raster boundary corrected by π/4 (Freeman); still approximate
  Object.assign(B, {area, zmin, zmax, zmean: mean, relief: zmax - zmin, HI, curve, Lb: far, reliefRatio: (zmax - zmin)/(far*1000), Re: 2*Math.sqrt(area/Math.PI)/far, perim: P, Rc: 4*Math.PI*area/(P*P), slopeMean: sls/(slw || 1), slopes: sl, cellKm: g.cellM[g.H >> 1]/1000});
}
function networkStats(R, thr){ R.net2 = networkStatsB(R.basin, thr); R.netThr = R.net2.At; R.basinOverlay = null; }
function networkStatsB(B, thr){
  const {g, hy, inB} = B, N = g.W*g.H, At = thr || Math.max(20*B.cellKm*B.cellKm, B.area/1500);
  const ch = new Uint8Array(N); for (let i = 0; i < N; i++) ch[i] = inB[i] && hy.acc[i] >= At ? 1 : 0;
  const ord = new Uint8Array(N), mx = new Uint8Array(N), cnt = new Uint8Array(N), segStart = new Uint8Array(N);
  const counts = {}, lens = {};
  for (let t = hy.order.length - 1; t >= 0; t--){ const c = hy.order[t]; if (!ch[c]) continue;
    const o = mx[c] === 0 ? 1 : cnt[c] >= 2 ? mx[c] + 1 : mx[c]; ord[c] = o;
    if (mx[c] !== o) segStart[c] = 1; // a new segment of this order begins here
    const r = hy.rec[c]; if (r >= 0 && ch[r]){ if (o > mx[r]){ mx[r] = o; cnt[r] = 1; } else if (o === mx[r]) cnt[r]++; }
    const y = (c/g.W)|0, step = r >= 0 ? (Math.abs(r - c) === 1 || Math.abs(r - c) === g.W ? 1 : SQ2) : 1; lens[o] = (lens[o] || 0) + step*g.cellM[y]/1000;
    if (segStart[c]) counts[o] = (counts[o] || 0) + 1; }
  const orders = Object.keys(counts).map(Number).sort((a, b) => a - b), maxO = orders[orders.length - 1] || 0;
  const rb = [], rl = []; for (let k = 0; k + 1 < orders.length; k++){ const a = orders[k], b = orders[k + 1]; if (counts[b]) rb.push(counts[a]/counts[b]); if (lens[a] && counts[a] && lens[b] && counts[b]) rl.push((lens[b]/counts[b])/(lens[a]/counts[a])); }
  const gm = a => a.length ? Math.exp(a.reduce((s, v) => s + Math.log(v), 0)/a.length) : NaN, total = Object.values(lens).reduce((a, b) => a + b, 0);
  return {At, ord, ch, counts, lens, orders, maxO, Rb: gm(rb), Rl: gm(rl), total, Dd: total/B.area, freq: Object.values(counts).reduce((a, b) => a + b, 0)/B.area};
}
function alongRiverArea(R){
  const B = R.basin, pr = R.prof; if (!B || !pr) return; const {g, hy} = B, A = new Float64Array(pr.d.length);
  for (let i = 0; i < pr.d.length; i++){ const p = pointAtKm(R, pr.d[i]), [x, y] = llGrid(g, p[0], p[1]); let a = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < g.W && yy < g.H) a = Math.max(a, hy.acc[yy*g.W + xx]); } A[i] = a; }
  for (let i = 1; i < A.length; i++) A[i] = Math.max(A[i], A[i - 1]); // area can only grow downstream
  pr.A = Array.from(A);
  // slope–area: S = ks A^-θ, fitted over the channel where A > 1% of the basin and S > 0
  const xs = [], ys = []; for (let i = 0; i < A.length; i++) if (A[i] > .01*B.area && pr.s[i] > 1e-4){ xs.push(Math.log10(A[i])); ys.push(Math.log10(pr.s[i]/1000)); }
  if (xs.length > 10){ const mx = xs.reduce((a, b) => a + b)/xs.length, my = ys.reduce((a, b) => a + b)/ys.length; let sxy = 0, sxx = 0; xs.forEach((v, k) => { sxy += (v - mx)*(ys[k] - my); sxx += (v - mx)**2; }); const b = sxy/sxx; pr.theta = -b; pr.ks = 10**(my - b*mx); pr.saN = xs.length; }
  pr.ksn = pr.s.map((s, i) => A[i] > 0 ? (s/1000)*(A[i]*1e6)**.45 : NaN); // normalised steepness, θref = 0.45, A in m²
  if (R.reaches) for (const r of R.reaches){ const i0 = Math.round(r.k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(r.k1/pr.step)); r.A = A[i1]; r.ksn = median(pr.ksn.slice(i0, i1 + 1).filter(Number.isFinite)); r.power = r.A*Math.max(r.slope, 0); }
}
function basinOverlay(R, B0, N0){
  const B = B0 || R.basin; if (!B) return null; if (!B0 && R.basinOverlay) return R.basinOverlay; if (B0 && B0.ovc) return B0.ovc; const {g, inB} = B, N2 = N0 || R.net2, c = document.createElement("canvas"); c.width = g.W; c.height = g.H;
  const x = c.getContext("2d"), id = x.createImageData(g.W, g.H), d = id.data;
  for (let i = 0; i < inB.length; i++){
    if (N2 && N2.ch[i]){ const o = N2.ord[i], u = o/Math.max(1, N2.maxO); d[i*4] = 40 + 30*u; d[i*4+1] = 150 + 80*u; d[i*4+2] = 255; d[i*4+3] = 120 + 135*u; continue; }
    if (inB[i]){ const xx = i % g.W, yy = (i/g.W)|0; const edge = !inB[i-1] || !inB[i+1] || !inB[i - g.W] || !inB[i + g.W]; if (edge){ d[i*4] = 255; d[i*4+1] = 216; d[i*4+2] = 74; d[i*4+3] = 255; } else { d[i*4] = 255; d[i*4+1] = 216; d[i*4+2] = 74; d[i*4+3] = 26; } } }
  x.putImageData(id, 0, 0); if (B0) B0.ovc = c; else R.basinOverlay = c; return c;
}
function drawBasinOnMap(ctx, M, w, h){
  const R = XR.river; if (!R || !XR.showBasin) return;
  for (const [B, N] of [[R.basin, R.net2], [R.ob, R.ob && R.ob.net]]){ if (!B) continue; const ov = B === R.basin ? basinOverlay(R) : basinOverlay(R, B, N), g = B.g, s = 2**(M.z - g.z);
    const sx = (g.X0 - lon2x(M.lon, g.z))*s + w/2, sy = (g.Y0 - lat2y(M.lat, g.z))*s + h/2; ctx.save(); ctx.imageSmoothingEnabled = s < 1; ctx.drawImage(ov, sx, sy, g.W*s, g.H*s); ctx.restore();
    if (B.outletLL){ const q = M.toScr(B.outletLL[0], B.outletLL[1]); ctx.fillStyle = "#ffd84a"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.fill(); ctx.stroke(); } }
}

/* ---------- 2. channel geometry: curvature ---------- */
function curvatureStats(R, r){
  const step = clamp(r.L/600, .02, .5), a = pointAtKm(R, r.k0), b = pointAtKm(R, r.k1), P = toLocal(resampleKm(R, r.k0, r.k1, step), (a[0] + b[0])/2, (a[1] + b[1])/2), n = P.length;
  if (n < 8) return; const sm = P.map((_, j) => { let x = 0, y = 0, ww = 0; for (let t = -3; t <= 3; t++){ const q = P[clamp(j + t, 0, n - 1)], gg = Math.exp(-t*t/4.5); x += q[0]*gg; y += q[1]*gg; ww += gg; } return [x/ww, y/ww]; });
  const k = []; for (let j = 1; j < n - 1; j++){ const u = [sm[j][0] - sm[j-1][0], sm[j][1] - sm[j-1][1]], v = [sm[j+1][0] - sm[j][0], sm[j+1][1] - sm[j][1]]; k.push(Math.atan2(u[0]*v[1] - u[1]*v[0], u[0]*v[0] + u[1]*v[1])/step); }
  // peak |curvature| of each bend → radius of curvature
  const peaks = []; let cur = 0, sg = 0; for (const v of k){ const s2 = Math.sign(v); if (s2 !== sg && sg){ if (cur > 0) peaks.push(cur); cur = 0; } sg = s2 || sg; cur = Math.max(cur, Math.abs(v)); }
  r.meanK = k.reduce((s2, v) => s2 + Math.abs(v), 0)/k.length; r.Rc = peaks.length ? median(peaks.map(p => 1/p)) : NaN; // km
  if (r.width && Number.isFinite(r.width.med)) r.RcW = r.Rc*1000/r.width.med;
}

/* ---------- 5. floodplain ---------- */
async function runFloodplain(R, k0, k1){
  k0 = k0 ?? 0; k1 = k1 ?? R.L; const L = k1 - k0, nS = clamp(Math.round(L/Math.max(.5, L/300)), 20, 300), half = clamp(L/30, 2, 25), hFP = XR.fpH || 5;
  // zoom: as fine as possible with at most ~260 tiles along the corridor
  let z = 13, pts = []; for (let i = 0; i <= nS; i++) pts.push(k0 + L*i/nS);
  const tilesFor = zz => { const set = new Set(); for (const k of pts){ const p = pointAtKm(R, k); for (const dd of [-half, 0, half]) for (const dd2 of [-half, 0, half]){ const lat = p[0] + dd/111, lon = p[1] + dd2/(111*Math.cos(p[0]*D2R)); set.add(Math.floor(lon2x(lon, zz)/256) + "/" + Math.floor(lat2y(lat, zz)/256)); } } return set; };
  while (z > 7 && tilesFor(z).size > 260) z--;
  const cell = 40075016.686*Math.cos(pointAtKm(R, (k0 + k1)/2)[0]*D2R)/(256*2**z), stepKm = Math.max(cell/1000, .02), keys = [...tilesFor(z)]; let done = 0;
  for (let b = 0; b < keys.length; b += 8){ await Promise.all(keys.slice(b, b + 8).map(k => { const [x, y] = k.split("/").map(Number); return demTile(z, x, y).then(() => done++); })); xstatus(`Floodplain: reading terrain ${Math.round(done/keys.length*100)}%…`, "busy"); }
  const tiles = new Map(); for (const k of keys){ const [x, y] = k.split("/").map(Number); tiles.set(k, await demTile(z, x, y)); }
  const elev = (lat, lon) => { const X = lon2x(lon, z), Y = lat2y(lat, z), t = tiles.get(Math.floor(X/256) + "/" + Math.floor(Y/256)); if (!t) return NaN; return t[(Math.floor(Y) & 255)*256 + (Math.floor(X) & 255)]; };
  const secs = [];
  for (const k of pts){
    const p = pointAtKm(R, k), q = pointAtKm(R, Math.min(R.L, k + .5)), pq = pointAtKm(R, Math.max(0, k - .5)), kx = Math.cos(p[0]*D2R)*111, ky = 111;
    let tx = (q[1] - pq[1])*kx, ty = (q[0] - pq[0])*ky; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; const nx = -ty, ny = tx; // normal in km (east, north)
    const at = d => elev(p[0] + ny*d/ky, p[1] + nx*d/kx);
    let z0 = Infinity; for (let d = -3*stepKm; d <= 3*stepKm; d += stepKm) z0 = Math.min(z0, at(d)); if (!Number.isFinite(z0)) continue;
    const reach = (sgn, H) => { let d = 0, miss = 0; while (d < half){ const v = at(sgn*(d + stepKm)); if (!(v <= z0 + H)){ if (++miss >= 2) break; } else miss = 0; d += stepKm; } return {d: Math.max(0, d - miss*stepKm), capped: d >= half}; };
    const l = reach(-1, hFP), r = reach(1, hFP), lv = reach(-1, 4*hFP), rv = reach(1, 4*hFP), gp = d => [p[0] + ny*d/ky, p[1] + nx*d/kx];
    const st2 = Math.max(stepKm, 2*half/300), pd = [], pz = []; for (let d = -half; d <= half + 1e-9; d += st2){ const v = at(d); if (Number.isFinite(v)){ pd.push(Math.round(d*1000)); pz.push(v); } }
    secs.push({km: k, z0, fp: (l.d + r.d)*1000, valley: (lv.d + rv.d)*1000, capped: l.capped || r.capped, asym: (l.d - r.d)/Math.max(1e-6, l.d + r.d), ends: [gp(-l.d), gp(r.d)], vends: [gp(-lv.d), gp(rv.d)], prof: {d: pd, z: pz}});
  }
  R.fp = {k0, k1, secs, h: hFP, z, cell, half}; fpReaches(R);
  classifyZones(R); renderX();
  xstatus(`Floodplain measured at ${secs.length} cross-sections (terrain cells ≈ ${nf(cell)} m, flood height ${hFP} m above the channel).`, "ok");
}
function fpReaches(R){
  const fp = R.fp; if (!fp) return; const secs = fp.secs, cell = fp.cell;
  for (const r of R.reaches || []){ const ss = secs.filter(s => s.km >= r.k0 && s.km <= r.k1); if (!ss.length) continue; r.fpW = median(ss.map(s => s.fp)); r.valleyW = median(ss.map(s => s.valley)); r.fpCapped = ss.filter(s => s.capped).length/ss.length;
    const cw = r.width && Number.isFinite(r.width.med) ? r.width.med : NaN; r.confine = cw ? r.fpW/cw : NaN;
    r.confClass = Number.isFinite(r.confine) ? (r.confine < 2 ? "confined" : r.confine < 10 ? "partly confined" : "unconfined") : (r.fpW < 3*cell ? "confined (no width)" : r.fpW > 4000 ? "unconfined (no width)" : "partly confined (no width)"); }
}

/* ---------- 6. delta ---------- */
function analyzeDeltaX(R){
  const G0 = R.graph; if (!G0 || !R.mainNodes) return null; const {out, coord} = G0, nodes = [...coord.keys()];
  const sinks = nodes.filter(n => !(out.get(n) || []).length), mouthMain = R.main[R.main.length - 1];
  const mouths = sinks.filter(n => hav(coord.get(n), mouthMain) < Math.max(30, R.L*.15));
  if (mouths.length < 2){ R.delta = {mouths: mouths.length, single: true}; return R.delta; }
  const mi = new Map(mouths.map((n, i) => [n, i])), reachM = new Map(), indeg = new Map(); for (const n of nodes) indeg.set(n, 0); for (const [a, bs] of out) for (const b of bs) indeg.set(b, (indeg.get(b) || 0) + 1);
  // reverse topological propagation of reachable mouth sets (as small sorted arrays)
  const order = [], deg = new Map(indeg), q = nodes.filter(n => !deg.get(n)); while (q.length){ const n = q.pop(); order.push(n); for (const m of out.get(n) || []){ deg.set(m, deg.get(m) - 1); if (!deg.get(m)) q.push(m); } }
  for (let t = order.length - 1; t >= 0; t--){ const n = order[t]; let s = mi.has(n) ? [mi.get(n)] : []; for (const m of out.get(n) || []){ const r = reachM.get(m); if (r) s = [...new Set([...s, ...r])].slice(0, 64); } reachM.set(n, s); }
  // apex: first main-stem node from the source from which two or more mouths are reachable
  // apex: the most upstream main-stem node that splits into channels reaching DIFFERENT mouths (anabranches that rejoin don't count)
  const splits = n => { const ch = (out.get(n) || []).map(m => (reachM.get(m) || []).join(",")).filter(Boolean); return new Set(ch).size >= 2; };
  let apexI = -1; for (let i = 0; i < R.mainNodes.length; i++){ const n = R.mainNodes[i]; if ((out.get(n) || []).length >= 2 && splits(n)){ apexI = i; break; } }
  if (apexI < 0){ R.delta = {mouths: mouths.length, single: true}; return R.delta; }
  const apex = R.main[apexI], apexN = R.mainNodes[apexI];
  // delta nodes: reachable from the apex; bifurcations among them
  const seen = new Set([apexN]), st = [apexN]; while (st.length){ const n = st.pop(); for (const m of out.get(n) || []) if (!seen.has(m)){ seen.add(m); st.push(m); } }
  const bif = [...seen].filter(n => (out.get(n) || []).length >= 2 && splits(n));
  let chanLen = 0; for (const n of seen) for (const m of out.get(n) || []) if (seen.has(m)) chanLen += hav(coord.get(n), coord.get(m));
  const mpts = mouths.map(n => coord.get(n)), L0 = toLocal([apex, ...mpts], apex[0], apex[1]), ang = L0.slice(1).map(p => Math.atan2(p[0], -p[1])/D2R);
  ang.sort((a, b) => a - b); let gap = 0; for (let i = 0; i < ang.length; i++){ const g2 = ((ang[(i + 1) % ang.length] - ang[i]) + 360) % 360 || 360; gap = Math.max(gap, g2); }
  const hullPts = toLocal([apex, ...mpts, ...[...seen].filter((_, i) => i % 5 === 0).map(n => coord.get(n))], apex[0], apex[1]), hull = convexHullX(hullPts); let area = 0; for (let i = 0; i < hull.length; i++){ const a = hull[i], b = hull[(i + 1) % hull.length]; area += a[0]*b[1] - b[0]*a[1]; }
  R.delta = {apexKm: R.cum[apexI], apex, mouths: mouths.length, mouthPts: mpts, bif: bif.length, chanLen, opening: 360 - gap, area: Math.abs(area)/2, length: median(mpts.map(p => hav(apex, p))), nodes: seen};
  return R.delta;
}
function convexHullX(P){ const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]), lo = [], up = [];
  for (const q of p){ while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()){ while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); }

/* ---------- 7. temporal: Esri World Imagery Wayback ---------- */
async function loadWayback(){
  if (XR.wayback) return XR.wayback;
  const j = await xfetchJSON("https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json");
  const list = Object.entries(j).map(([id, v]) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(v.itemTitle || ""); return {id, date: m ? m[1] : "", url: v.itemURL}; }).filter(r => r.date && r.url).sort((a, b) => a.date.localeCompare(b.date));
  XR.wayback = list; return list;
}
function waybackBase(rel){ return {n: "Wayback " + rel.date, url: (z, x, y) => rel.url.replace("{level}", z).replace("{row}", y).replace("{col}", x), max: 19, attr: "World Imagery Wayback © Esri, Maxar, Earthstar Geographics"}; }
async function captureWith(base){ const keep = EX.base.__tmp; EX.base.__tmp = base; const k = XR.base; XR.base = "__tmp"; try { return await captureView(); } finally { XR.base = k; if (keep) EX.base.__tmp = keep; else delete EX.base.__tmp; } }
async function runTemporal(){
  const list = await loadWayback(), a = list.find(r => r.id === $("xWbA").value), b = list.find(r => r.id === $("xWbB").value); if (!a || !b || a === b) return toast("Pick two different dates");
  const [A, B] = a.date < b.date ? [a, b] : [b, a]; xstatus(`Capturing this view as it looked on ${A.date} and ${B.date}…`, "busy");
  const ca = await captureWith(waybackBase(A)), cb = await captureWith(waybackBase(B));
  const R = XR.river, lbl = R ? `${R.name} km ${nf(XR.pos)}` : "View", yr = d => { const [y, m, dd] = d.split("-").map(Number); return +(y + (m - 1)/12 + (dd - 1)/365).toFixed(2); };
  const fa = new File([await new Promise(r => ca.canvas.toBlob(r, "image/jpeg", .92))], `${lbl.replace(/[^\w]+/g, "_")}_${A.date}.jpg`, {type: "image/jpeg"});
  const fb = new File([await new Promise(r => cb.canvas.toBlob(r, "image/jpeg", .92))], `${lbl.replace(/[^\w]+/g, "_")}_${B.date}.jpg`, {type: "image/jpeg"});
  window.__pendingPlace = {caption: `${lbl} (${A.date} → ${B.date})`, title: lbl}; window.__pendingScale = ca.mpp;
  await loadFile(fa, "A"); $("yrRef").value = yr(A.date);
  await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 240 && G._autoRunning; i++) await new Promise(r => setTimeout(r, 500));
  if (!G.autoLog && !G.mask) { try { await runAuto(); } catch(e){ console.warn(e); } }
  await addSeriesFiles([fb]); const it = G.series[G.series.length - 1]; if (it) it.year = yr(B.date);
  let err = null; try { analyzeSeries(); } catch(e){ err = e; } try { renderReportChange(); } catch(_){}
  showApp("report");
  if (err) xstatus(`Both dates were captured and aligned, but no water was found in the ${A.date} image automatically (${esc(err.message)}). Detect water in the Lab, then press “Compare now” under Changes over time.`, "err");
  else xstatus(`Compared ${A.date} with ${B.date} (${nf(yr(B.date) - yr(A.date), 1)} years): see “Changes over time” in Findings for erosion, accretion and migration rates.`, "ok");
}

/* ---------- 8. sediment routing zones (potential) ---------- */
function classifyZones(R){ return classifyZones3(R); }
function classifyZonesOld(R){
  const rs = R.reaches; if (!rs || !rs.length || !R.prof) return;
  const S = rs.map(r => r.slope).filter(Number.isFinite).sort((a, b) => a - b), hi = quantile(S, .67), lo = quantile(S, .33);
  rs.forEach((r, i) => {
    const prev = rs[i - 1], next = rs[i + 1], P = Number.isFinite(r.power) ? r.power : null, dP = P != null && next && Number.isFinite(next.power) ? (next.power - P)/Math.max(P, 1e-9) : 0;
    let sc = {source: 0, transfer: 0, storage: 0}, why = [];
    if (r.slope >= hi){ sc.source += 2; why.push("steep"); } else if (r.slope <= lo){ sc.storage += 2; why.push("gentle"); } else { sc.transfer += 1.5; why.push("moderate slope"); }
    if (/^confined/.test(r.confClass || "")){ sc.source += 1; sc.transfer += 1; why.push("confined valley"); } else if (/^unconfined/.test(r.confClass || "")){ sc.storage += 1.5; why.push("wide floodplain"); } else if (r.confClass){ sc.transfer += 1; why.push("partly confined"); }
    if (r.multi > 1.15){ sc.storage += 1; why.push("multiple channels"); }
    if (dP < -.25){ sc.storage += 1; why.push("stream power falls downstream"); } else if (dP > .25){ sc.transfer += .5; why.push("stream power rises downstream"); }
    if (i < rs.length*.2){ sc.source += .5; }
    if (R.delta && !R.delta.single && r.k1 >= R.delta.apexKm){ sc.storage += 2; why.push("delta"); }
    if (R.dams.some(d => d.km >= r.k0 && d.km <= r.k1)){ sc.storage += .5; why.push("dam or weir (reservoir trapping)"); }
    const z = Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0]; r.zone = z; r.zoneWhy = why.join(", ");
  });
}
const ZCOL = {source: "#e8452c", transfer: "#f7b733", storage: "#4aa8ff", sink: "#9b6bff"};
XMETRIC.zone = {n: "Sediment zone", u: "", get: (R, i) => { const r = reachAt(R, R.cum[i]); return r && r.zone ? {source: 1, transfer: .55, storage: .2, sink: 0}[r.zone] : NaN; }};
XMETRIC.ksn = {n: "Steepness ksn", u: "", log: true, get: (R, i) => { const r = reachAt(R, R.cum[i]); return r ? r.ksn : NaN; }};
XMETRIC.floodplain = {n: "Floodplain width", u: "m", log: true, get: (R, i) => { const r = reachAt(R, R.cum[i]); return r ? r.fpW : NaN; }};

/* ---------- selection of a stretch & comparison ---------- */
XR.cmp = [];
function selRange(){ const R = XR.river; if (!R) return null; return XR.range && XR.range.R === R ? XR.range : {R, k0: 0, k1: R.L, whole: true}; }
function rangeStats(R, k0, k1){
  const pr = R.prof, rs = (R.reaches || []).filter(r => r.k1 > k0 && r.k0 < k1), a = pointAtKm(R, k0), b = pointAtKm(R, k1), L = k1 - k0;
  let z0 = NaN, z1 = NaN, conc = NaN; if (pr){ const i0 = Math.round(k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(k1/pr.step)); z0 = pr.zc[i0]; z1 = pr.zc[i1]; const H = z0 - z1; let ar = 0; for (let i = i0 + 1; i <= i1; i++) ar += ((z0 - H*(pr.d[i] - k0)/L) - pr.zc[i])*(pr.d[i] - pr.d[i - 1]); conc = H > 0 ? 2*ar/(H*L) : NaN; }
  const wmed = rs.map(r => r.width && r.width.med).filter(Number.isFinite), zones = {source: 0, transfer: 0, storage: 0, sink: 0}; rs.forEach(r => { if (r.zone) zones[r.zone] += r.L; });
  // clip to the exact selection: planform measured on the selected stretch itself, not on whole overlapping reaches
  const exact = (k0 > 0 || k1 < R.L) ? reachStats(R, k0, k1, -1) : null;
  return {L, straight: hav(a, b), sin: L/Math.max(1e-6, hav(a, b)), z0, z1, fall: z0 - z1, grad: (z0 - z1)/L, conc, bends: exact ? exact.bends : rs.reduce((s, r) => s + r.bends, 0), lambda: exact ? exact.lambda : median(rs.map(r => r.lambda).filter(Number.isFinite)), width: median(wmed), fp: median(rs.map(r => r.fpW).filter(Number.isFinite)),
    ksn: median(rs.map(r => r.ksn).filter(Number.isFinite)), whole: !(k0 > 0 || k1 < R.L), tribs: R.tribs.filter(t => t.km >= k0 && t.km <= k1 && !t.distributary).length, dams: R.dams.filter(d => d.km >= k0 && d.km <= k1).length, zones,
    user: R.user || null, delta: !(k0 > 0 || k1 < R.L) ? R.delta : null, meanK: (() => { rs.forEach(r => { if (r.meanK == null) curvatureStats(R, r); }); return median(rs.map(r => r.meanK).filter(Number.isFinite)); })(),
    basin: R.basin && !(k0 > 0 || k1 < R.L) ? R.basin : null, net: R.net2 && !(k0 > 0 || k1 < R.L) ? R.net2 : null, wd: R.wd};
}
const CMPC = ["#ff8a4c", "#43d9e8", "#c9a7ff"];
function addCompare(){ const s = selRange(); if (!s) return; if (XR.cmp.length >= 3) XR.cmp.shift(); XR.cmp.push({R: s.R, k0: s.k0, k1: s.k1, label: s.whole ? s.R.name : `${s.R.name} km ${nf(s.k0)}–${nf(s.k1)}`}); toast(`Added to comparison (${XR.cmp.length} of up to 3)`); renderX(); }

/* ---------- rendering of the module panels ---------- */
const kv = rows => `<div class="xstats">${rows.filter(Boolean).map(([a, b]) => `<div${String(b).replace(/<[^>]+>/g, "").length > 22 ? ' class="long"' : ""}><span>${a}</span><b>${b}</b></div>`).join("")}</div>`;
function renderModules(){
  const R = XR.river; if (!R) return; const pr = R.prof;
  if (R.reaches && R.reaches.length){ if (R.basin && pr && R.reaches[0].A == null) alongRiverArea(R); if (R.fp && R.reaches[0].fpW === undefined) fpReaches(R); classifyZones(R); }
  // selection bar
  const sr = selRange(); $("xSel").innerHTML = `<span>${sr.whole ? "Whole river selected" : `Selected: km ${nf(sr.k0, 1)}–${nf(sr.k1, 1)} (${km(sr.k1 - sr.k0)})`}</span><button class="sm" data-sel="a">Start here</button><button class="sm" data-sel="b">End here</button><button class="sm" data-sel="r">This reach</button>${sr.whole ? "" : `<button class="sm" data-sel="x">Whole river</button>`}<button class="sm pri" data-sel="cmp">＋ Compare</button>`;
  $("xSel").querySelectorAll("[data-sel]").forEach(b => b.onclick = () => { const k = b.dataset.sel, cur = selRange();
    if (k === "a") XR.range = {R, k0: Math.min(XR.pos, cur.k1 - .01), k1: cur.k1}; if (k === "b") XR.range = {R, k0: cur.k0, k1: Math.max(XR.pos, cur.k0 + .01)}; if (k === "x") XR.range = null; if (k === "r"){ const rr = reachAt(R, XR.pos); if (rr) XR.range = {R, k0: rr.k0, k1: rr.k1}; } if (k === "cmp") return addCompare(); renderX(); });
  // 1. profile extras
  $("xProfExtra").innerHTML = pr && pr.theta != null ? kv([["Concavity index θ (slope–area)", nf(pr.theta, 2)], ["Steepness ks", tfmt(pr.ks)], ["Fit over", pr.saN + " samples"], ["Median ksn (θref 0.45)", tfmt(median(pr.ksn.filter(Number.isFinite)))]]) + `<p class="note">θ from a fit of slope against drainage area (S = ks·A^−θ), with area from the terrain routing in Catchment. Graded rivers typically give θ ≈ 0.4–0.6.</p>`
    : `<p class="note">Run <b>Catchment</b> to add drainage area along the river: then the slope–area concavity θ and the normalised steepness ksn appear here.</p>`;
  // 2. channel geometry
  (R.reaches || []).forEach(r => { if (r.meanK == null) curvatureStats(R, r); });
  $("xGeomStats").innerHTML = (() => { const rs = R.reaches || [], sr2 = rangeStats(R, sr.k0, sr.k1); return kv([["Sinuosity (selection)", nf(sr2.sin, 2)], ["Bends", String(sr2.bends)], ["Median meander wavelength", km(sr2.lambda)], ["Median bend radius", km(median(rs.map(r => r.Rc).filter(Number.isFinite)))], ["Mean curvature", nf(median(rs.map(r => r.meanK).filter(Number.isFinite)), 3) + " rad/km"], ["Median width (measured reaches)", Number.isFinite(sr2.width) ? nf(sr2.width) + " m" : "measure below"], ["Bend radius ÷ width", nf(median(rs.map(r => r.RcW).filter(Number.isFinite)), 1)], ["Wavelength ÷ width", nf(median(rs.filter(r => r.width && Number.isFinite(r.width.med)).map(r => r.lambda*1000/r.width.med)), 1)]]); })();
  // 3 & 4. network and catchment
  const B = R.basin, N2 = R.net2;
  $("xNetStats").innerHTML = N2 ? kv([["Highest Strahler order", String(N2.maxO)], ["Bifurcation ratio Rb", nf(N2.Rb, 2)], ["Length ratio Rl", nf(N2.Rl, 2)], ["Drainage density", nf(N2.Dd, 3) + " km/km²"], ["Stream frequency", nf(N2.freq, 4) + " /km²"], ["Total channel length", km(N2.total)], ["Channel threshold", nf(N2.At, 1) + " km²"]]) +
    `<div class="row"><label>Channels start at</label><input type="range" id="xThr" min="0" max="100" value="${Math.round(Math.log10(N2.At/(B.cellKm*B.cellKm*2))/Math.log10(B.area/(B.cellKm*B.cellKm*2)/20)*100)}"><span class="note">${nf(N2.At, 1)} km²</span></div><table class="grid"><tr><th>Order</th><th>segments</th><th>total length</th><th>mean length</th></tr>${N2.orders.map(o => `<tr><td>${o}</td><td>${N2.counts[o]}</td><td>${km(N2.lens[o])}</td><td>${km(N2.lens[o]/N2.counts[o])}</td></tr>`).join("")}</table>` : `<p class="note">Routes water over the terrain of the whole region (priority-flood depression filling, steepest-descent flow, accumulated area) to extract the channel network and the catchment.</p>`;
  $("xBasinStats").innerHTML = B ? kv([["Catchment area", nf(B.area) + " km²"], R.wd && R.wd.area ? ["Wikidata basin area", nf(R.wd.area) + " km²"] : null, ["Relief", nf(B.relief) + " m"], ["Highest / lowest", `${nf(B.zmax)} / ${nf(B.zmin)} m`], ["Hypsometric integral", nf(B.HI, 2)], ["Basin length", km(B.Lb)], ["Relief ratio", nf(B.reliefRatio, 4)], ["Elongation ratio", nf(B.Re, 2)], ["Terrain cells", `≈ ${nf(B.cellKm*1000)} m (z${B.g.z})`]]) + (B.clipped ? `<p class="warn">The catchment reaches the edge of the terrain window: area may be underestimated.</p>` : "") +
    `<p class="note">Hypsometric integral: ${B.HI > .6 ? "high (above 0.6): a young, little-eroded landscape" : B.HI < .35 ? "low (below 0.35): a mature, deeply eroded landscape" : "intermediate (0.35–0.6): an equilibrium-stage landscape"} (Strahler 1952).</p>` : "";
  // 5. floodplain
  const fp = R.fp; $("xFpStats").innerHTML = fp ? kv([["Cross-sections", String(fp.secs.length)], ["Median floodplain width", nf(median(fp.secs.map(s => s.fp))) + " m"], ["Median valley-floor width", nf(median(fp.secs.map(s => s.valley))) + " m"], ["Flood height used", fp.h + " m above channel"], ["Terrain cells", "≈ " + nf(fp.cell) + " m"], ["Sections at search limit", nf(fp.secs.filter(s => s.capped).length/fp.secs.length*100) + "%"]]) +
    `<div class="scroll"><table class="grid"><tr><th>Reach</th><th>floodplain</th><th>valley</th><th>channel</th><th>confinement</th><th>class</th></tr>${(R.reaches || []).filter(r => r.fpW != null).map(r => `<tr data-k="${(r.k0 + r.k1)/2}"><td>${r.i + 1}</td><td>${nf(r.fpW)} m</td><td>${nf(r.valleyW)} m</td><td>${r.width && Number.isFinite(r.width.med) ? nf(r.width.med) + " m" : "–"}</td><td>${nf(r.confine, 1)}</td><td>${esc(r.confClass || "")}</td></tr>`).join("")}</table></div>` : "";
  // 6. delta
  const dl = R.delta || analyzeDeltaX(R); $("xDeltaStats").innerHTML = !dl ? "" : dl.single ? `<p class="note">The mapped river ends in a single mouth${dl.mouths ? "" : " (no mouths found near the end)"}: no delta distributary network in OpenStreetMap. Distributaries that leave the river: ${R.tribs.filter(t => t.distributary).length}.</p>` :
    kv([["Delta apex", `km ${nf(dl.apexKm)} (${km(R.L - dl.apexKm)} above the mouth)`], ["Mouths reaching the sea", String(dl.mouths)], ["Bifurcations", String(dl.bif)], ["Channel length below the apex", km(dl.chanLen)], ["Apex → mouth (median)", km(dl.length)], ["Opening angle", nf(dl.opening) + "°"], ["Delta area (hull)", nf(dl.area) + " km²"]]) + `<p class="note">From the river's mapped channels: the apex is the first point downstream from which more than one mouth can be reached. Shoreline change: open <b>Time</b> at the mouth.</p>`;
  // 7. temporal
  // 8. sediment
  const rs = R.reaches || [], zl = {source: 0, transfer: 0, storage: 0, sink: 0}; rs.forEach(r => { if (r.zone) zl[r.zone] += r.L; });
  $("xSedStats").innerHTML = rs.some(r => r.zone) ? `<div class="zstrip">${rs.map(r => `<span style="flex:${r.L};background:${ZCOL[r.zone]}" title="${esc(r.zone)}"></span>`).join("")}</div><div class="zleg"><span><i style="background:${ZCOL.source}"></i>Source ${nf(zl.source/R.L*100)}%</span><span><i style="background:${ZCOL.transfer}"></i>Transfer ${nf(zl.transfer/R.L*100)}%</span><span><i style="background:${ZCOL.storage}"></i>Storage ${nf(zl.storage/R.L*100)}%</span><span><i style="background:${ZCOL.sink}"></i>Terminal sink ${nf(zl.sink/R.L*100)}%</span></div>
    <div class="scroll"><table class="grid"><tr><th>Reach</th><th>km</th><th>zone</th><th>why</th><th>stream power*</th></tr>${rs.map(r => `<tr data-k="${(r.k0 + r.k1)/2}"><td>${r.i + 1}</td><td>${nf(r.k0)}–${nf(r.k1)}</td><td><b style="color:${ZCOL[r.zone]}">${esc(r.zone || "")}</b></td><td>${esc(r.zoneWhy || "")}</td><td>${Number.isFinite(r.power) ? tfmt(r.power) : "–"}</td></tr>`).join("")}</table></div><p class="note">* Stream power proxy = drainage area × slope (discharge grows with area). Run Catchment and Floodplain for the full classification.</p>` : `<p class="note">Needs the long profile; add Catchment and Floodplain for a fuller picture.</p>`;
  renderCompare();
  try { renderModules3(); } catch(e){ console.error(e); }
  if ($("xThr")) $("xThr").onchange = e => { const a0 = B.cellKm*B.cellKm*2, a1 = B.area/20, v = a0*(a1/a0)**(+e.target.value/100); networkStats(R, v); classifyZones(R); renderX(); };
}
function moduleCharts(){
  const R = XR.river; if (!R) return; const pr = R.prof, pick = k => setPos(k), t = XR.tab;
  if (t === "profile" && pr && pr.A){ const xs = [], ys = []; pr.A.forEach((a, i) => { if (a > 0 && pr.s[i] > 1e-4){ xs.push(Math.log10(a)); ys.push(Math.log10(pr.s[i]/1000)); } });
    svgChart($("xcSA"), {h: 200, xlab: "log₁₀ drainage area (km²)", ylab: "log₁₀ slope", series: [{x: xs, y: ys, c: "#9fe3ff", dots: true, r: 1.6}, ...(pr.theta != null ? [{x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...xs), Math.max(...xs)].map(v => Math.log10(pr.ks) - pr.theta*v), c: "#fff", w: 1.4, dash: true}] : [])]}); }
  else if (t === "profile" && $("xcSA")) $("xcSA").innerHTML = "";
  if (t === "network" && R.net2) svgChart($("xcHorton"), {h: 200, xlab: "Strahler order", ylab: "Segments (log)", logy: true, series: [{x: R.net2.orders, y: R.net2.orders.map(o => R.net2.counts[o]), c: "#4aa8ff", dots: true, r: 5}, {x: R.net2.orders, y: R.net2.orders.map(o => R.net2.counts[o]), c: "#4aa8ff", w: 1.5}]});
  if (t === "catchment" && R.basin) svgChart($("xcHyps"), {h: 220, xlab: "Relative area above (a/A)", ylab: "Relative height (h/H)", x0: 0, x1: 1, y0: 0, series: [{x: R.basin.curve.map(c => c[0]), y: R.basin.curve.map(c => c[1]), c: "#4cd17a", w: 2.4}, {x: [0, 1], y: [1, 0], c: "rgba(255,255,255,.35)", w: 1, dash: true}]});
  if (t === "floodplain" && R.fp){ const s = R.fp.secs; svgChart($("xcFp"), {h: 210, xlab: "Distance from source (km)", ylab: "Width (m, log)", logy: true, cursor: XR.pos, onPick: pick, series: [{x: s.map(q => q.km), y: s.map(q => Math.max(q.valley, 1)), c: "rgba(255,216,74,.7)", w: 1.2}, {x: s.map(q => q.km), y: s.map(q => Math.max(q.fp, 1)), c: "#4cd17a", w: 2}, ...((R.reaches || []).some(r => r.width && Number.isFinite(r.width.med)) ? [{x: R.reaches.filter(r => r.width && Number.isFinite(r.width.med)).map(r => (r.k0 + r.k1)/2), y: R.reaches.filter(r => r.width && Number.isFinite(r.width.med)).map(r => r.width.med), c: "#43d9e8", dots: true, r: 4}] : [])]}); }
  if (t === "sediment" && pr){ svgChart($("xcSed"), {h: 220, xlab: "Distance from source (km)", ylab: "Elevation (m)", cursor: XR.pos, onPick: pick, series: (R.reaches || []).filter(r => r.zone).map(r => { const i0 = Math.round(r.k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(r.k1/pr.step)); return {x: pr.d.slice(i0, i1 + 1), y: pr.zc.slice(i0, i1 + 1), c: ZCOL[r.zone], w: 4}; })}); }
  if (t === "compare") compareCharts();
  if (t === "data") renderUserLayers();
  try { moduleCharts3(); } catch(e){ console.error(e); }
}
function renderCompare(){
  const el = $("xCmpBody"); if (!el) return; const C = XR.cmp;
  if (!C.length){ el.innerHTML = `<p class="note">Select a river or a stretch (Start here / End here), then press <b>＋ Compare</b>. Load another river and add it too, or add a GeoJSON study area: up to three side by side.</p>`; return; }
  const S = C.map(c => rangeStats(c.R, c.k0, c.k1));
  const rows = [["Length", s => km(s.L)], ["Fall", s => nf(s.fall) + " m"], ["Mean gradient", s => nf(s.grad, 3) + " m/km"], ["Concavity (Langbein)", s => nf(s.conc, 2)], ["Sinuosity", s => nf(s.sin, 2)], ["Mean curvature", s => Number.isFinite(s.meanK) ? nf(s.meanK, 3) + " rad/km" : "–"], ["Bends", s => String(s.bends)], ["Meander wavelength", s => km(s.lambda)], ["Median width", s => Number.isFinite(s.width) ? nf(s.width) + " m" : "–"], ["Floodplain width", s => Number.isFinite(s.fp) ? nf(s.fp) + " m" : "–"], ["Median ksn", s => Number.isFinite(s.ksn) ? tfmt(s.ksn) : "–"], ["Tributaries joining", s => String(s.tribs)], ["Dams & weirs", s => String(s.dams)],
    ["Catchment area", s => s.basin ? nf(s.basin.area) + " km²" : (s.whole && s.wd && s.wd.area ? nf(s.wd.area) + " km² (Wikidata)" : "–")], ["Hypsometric integral", s => s.basin ? nf(s.basin.HI, 2) : "–"], ["Strahler order", s => s.net ? String(s.net.maxO) : "–"], ["Drainage density", s => s.net ? nf(s.net.Dd, 3) + " km/km²" : "–"], ["Bifurcation ratio", s => s.net ? nf(s.net.Rb, 2) : "–"],
    ["Delta mouths / area", s => s.delta && !s.delta.single ? `${s.delta.mouths} / ${nf(s.delta.area)} km²` : "–"], ["Delta morphology (interp.)", s => s.delta && s.delta.morph ? s.delta.morph.split(":")[0] : "–"],
    ["Source / transfer / storage / sink", s => { const t = s.zones.source + s.zones.transfer + s.zones.storage + s.zones.sink; return t ? `${nf(s.zones.source/t*100)} / ${nf(s.zones.transfer/t*100)} / ${nf(s.zones.storage/t*100)} / ${nf(s.zones.sink/t*100)} %` : "–"; }]];
  for (const [n, f] of userRows()) if (S.some(s => s.user && f(s.user) != null)) rows.push([n, s => (s.user && f(s.user)) || "–"]);
  el.innerHTML = `<div class="cmpcards">${C.map((c, i) => `<div class="cmpc" style="border-color:${CMPC[i]}"><canvas class="cmpmap" data-ci="${i}"></canvas><b style="color:${CMPC[i]}">${esc(c.label)}</b><button class="sm" data-cx="${i}">Remove</button></div>`).join("")}</div>
    <div class="scroll"><table class="grid"><tr><th></th>${C.map((c, i) => `<th style="color:${CMPC[i]}">${esc(c.label)}</th>`).join("")}</tr>${rows.map(([n, f]) => `<tr><td>${n}</td>${S.map(s => `<td>${f(s)}</td>`).join("")}</tr>`).join("")}</table></div>
    <div class="row"><label>Distance axis</label><select id="xCmpAxis"><option value="norm"${XR.cmpAxis !== "km" ? " selected" : ""}>Normalised 0–1 (source → mouth)</option><option value="km"${XR.cmpAxis === "km" ? " selected" : ""}>Kilometres from the start</option></select></div>
    <h4>Long profiles</h4><div class="xchart" id="xcCmpProf"></div><h4>Slope</h4><div class="xchart" id="xcCmpSlope"></div><h4>Sinuosity by reach</h4><div class="xchart" id="xcCmpSin"></div><h4>Hypsometric curves</h4><div class="xchart" id="xcCmpHyps"></div>
    <div class="btns"><button class="sm" id="xCmpCsv">⬇ Comparison CSV</button><button class="sm" id="xCmpClear">Clear comparison</button></div>`;
  el.querySelectorAll("[data-cx]").forEach(b => b.onclick = () => { XR.cmp.splice(+b.dataset.cx, 1); renderX(); });
  $("xCmpAxis").onchange = e => { XR.cmpAxis = e.target.value; compareCharts(); };
  $("xCmpClear").onclick = () => { XR.cmp = []; renderX(); };
  $("xCmpCsv").onclick = () => save("river_comparison.csv", xcsv(rows.map(([n, f]) => Object.fromEntries([["measure", n], ...C.map((c, i) => [c.label, f(S[i])])]))));
  el.querySelectorAll(".cmpmap").forEach(cv => drawMini(cv, C[+cv.dataset.ci], CMPC[+cv.dataset.ci]));
}
function drawMini(cv, c, col){
  const W = cv.clientWidth || 150, H = 110, dpr = 2; cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H + "px"; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const R = c.R, P = toLocal(R.main.filter((_, i) => i % Math.max(1, Math.floor(R.main.length/800)) === 0), R.main[0][0], R.main[0][1]); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of P){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const s = Math.min((W - 12)/((x1 - x0) || 1), (H - 12)/((y1 - y0) || 1)), T = p => [6 + (p[0] - x0)*s + (W - 12 - (x1 - x0)*s)/2, 6 + (p[1] - y0)*s + (H - 12 - (y1 - y0)*s)/2];
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1.5; g.beginPath(); P.forEach((p, i) => { const q = T(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
  const Q = toLocal(resampleKm(R, c.k0, c.k1, Math.max(.05, (c.k1 - c.k0)/300)), R.main[0][0], R.main[0][1]); g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); Q.forEach((p, i) => { const q = T(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
  const u = XR.cmpCursor ?? null; if (u != null){ const k = c.k0 + u*(c.k1 - c.k0), p = T(toLocal([pointAtKm(R, k)], R.main[0][0], R.main[0][1])[0]); g.fillStyle = "#fff"; g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill(); }
}
function compareCharts(){
  const C = XR.cmp; if (!C.length || !$("xcCmpProf")) return; const norm = XR.cmpAxis !== "km", pick = v => { XR.cmpCursor = norm ? clamp(v, 0, 1) : null; document.querySelectorAll(".cmpmap").forEach(cv => drawMini(cv, C[+cv.dataset.ci], CMPC[+cv.dataset.ci])); compareCharts(); };
  const ser = (f, w) => C.map((c, i) => { const pr = c.R.prof; if (!pr) return {x: [], y: [], c: CMPC[i]}; const i0 = Math.round(c.k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(c.k1/pr.step)), L = c.k1 - c.k0;
    return {x: pr.d.slice(i0, i1 + 1).map(d => norm ? (d - c.k0)/L : d - c.k0), y: f(pr, i0, i1), c: CMPC[i], w: w || 2}; });
  const cur = XR.cmpCursor != null && norm ? XR.cmpCursor : null;
  svgChart($("xcCmpProf"), {h: 220, xlab: norm ? "Relative distance (0 = start, 1 = end)" : "Distance from start (km)", ylab: "Elevation (m)", cursor: cur, onPick: pick, series: ser((pr, a, b) => pr.zc.slice(a, b + 1))});
  svgChart($("xcCmpSlope"), {h: 190, xlab: norm ? "Relative distance" : "Distance from start (km)", ylab: "Slope (m/km, log)", logy: true, cursor: cur, onPick: pick, series: ser((pr, a, b) => pr.s.slice(a, b + 1).map(v => Math.max(v, .005)), 1.6)});
  svgChart($("xcCmpSin"), {h: 190, xlab: norm ? "Relative distance" : "Distance from start (km)", ylab: "Sinuosity", y0: 1, cursor: cur, onPick: pick, series: C.map((c, i) => { const rs = (c.R.reaches || []).filter(r => r.k1 > c.k0 && r.k0 < c.k1), L = c.k1 - c.k0; return {x: rs.map(r => norm ? ((r.k0 + r.k1)/2 - c.k0)/L : (r.k0 + r.k1)/2 - c.k0), y: rs.map(r => r.sin), c: CMPC[i], w: 2}; })});
  const hy = C.map((c, i) => c.R.basin && c.k0 === 0 && c.k1 === c.R.L ? {x: c.R.basin.curve.map(p => p[0]), y: c.R.basin.curve.map(p => p[1]), c: CMPC[i], w: 2.2} : null).filter(Boolean);
  if (hy.length) svgChart($("xcCmpHyps"), {h: 200, xlab: "Relative area a/A", ylab: "Relative height h/H", x0: 0, x1: 1, y0: 0, series: hy}); else $("xcCmpHyps").innerHTML = `<p class="note">Run Catchment for whole rivers to compare hypsometric curves.</p>`;
}

/* ---------- wiring ---------- */
{
  document.querySelectorAll('[data-run="basin"]').forEach(b => b.onclick = () => XR.river && runBasin(XR.river).catch(e => { console.error(e); xstatus("Catchment: " + esc(e.message), "err"); }));
  document.querySelectorAll('[data-show="basin"]').forEach(b => b.onchange = e => { XR.showBasin = e.target.checked; document.querySelectorAll('[data-show="basin"]').forEach(c => c.checked = XR.showBasin); xmap.req(); });
  $("xGeoFile") && ($("xGeoFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importGeoJSON(f, false); });
  $("xGeoCmp") && ($("xGeoCmp").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importGeoJSON(f, true); });
  $("xFpRun") && ($("xFpRun").onclick = () => { const s = selRange(); XR.fpH = Math.max(.5, +$("xFpH").value || 5); runFloodplain(s.R, s.k0, s.k1).catch(e => { console.error(e); xstatus("Floodplain: " + esc(e.message), "err"); }); });
  $("xTimeLoad") && ($("xTimeLoad").onclick = async () => { try { const L = await loadWayback(); const opt = L.map(r => `<option value="${esc(r.id)}">${esc(r.date)}</option>`).join(""); $("xWbA").innerHTML = opt; $("xWbB").innerHTML = opt; $("xWbA").value = L[0].id; $("xWbB").value = L[L.length - 1].id; $("xTimeGo").disabled = false; xstatus(`${L.length} archived imagery dates available (${L[0].date} to ${L[L.length - 1].date}).`, "ok"); } catch(e){ xstatus("Wayback archive: " + esc(e.message), "err"); } });
  $("xTimeGo") && ($("xTimeGo").onclick = () => runTemporal().catch(e => { console.error(e); xstatus("Time: " + esc(e.message), "err"); }));
  $("xTimeMouth") && ($("xTimeMouth").onclick = () => { if (XR.river){ flyTo(XR.river.L, 11); toast("Map centred on the mouth: now compare dates"); } });
}

/* ---------- selected stretch on the map ---------- */
function drawSelOnMap(ctx, M){
  const s = XR.range, R = XR.river; if (R && R.user) drawUserLayers(ctx, M, R.user);
  if (!s || s.R !== R) return; const P = resampleKm(R, s.k0, s.k1, Math.max(.02, (s.k1 - s.k0)/600));
  ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 9; ctx.globalAlpha = .45; ctx.beginPath(); P.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.restore();
  for (const k of [s.k0, s.k1]){ const p = pointAtKm(R, k), q = M.toScr(p[0], p[1]); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.fill(); ctx.stroke(); }
}

/* ---------- uploaded GeoJSON study areas (measured layers by role) ---------- */
// main: LineString upstream → downstream, optional 3rd coordinate = elevation (m)
// catchment, delta, erosion, accretion: Polygon/MultiPolygon · stream, distributary: LineString networks
// channel_width, floodplain_width, valley_width: transect lines (channel/valley paired by transect_id) · migration: displacement line with properties.years
const GJ_RE = 6371008.8, gjr = x => x*Math.PI/180, gjValid = x => typeof x === "number" && Number.isFinite(x);
function gjDist(a, b){ const p = gjr(b[1] - a[1]), q = gjr(b[0] - a[0]); return 2*GJ_RE*Math.asin(Math.min(1, Math.sqrt(Math.sin(p/2)**2 + Math.cos(gjr(a[1]))*Math.cos(gjr(b[1]))*Math.sin(q/2)**2))); }
const gjLen = c => c.slice(1).reduce((s, b, i) => s + gjDist(c[i], b), 0);
function gjRing(r){ return Math.abs(r.slice(1).reduce((s, b, i) => { const a = r[i]; let d = gjr(b[0] - a[0]); d = (d + 3*Math.PI) % (2*Math.PI) - Math.PI; return s + d*(Math.sin(gjr(a[1])) + Math.sin(gjr(b[1]))); }, 0)*GJ_RE*GJ_RE/2); }
function gjArea(g){ if (!g) return null; if (g.type === "Polygon") return gjRing(g.coordinates[0]) - g.coordinates.slice(1).reduce((s, r) => s + gjRing(r), 0); if (g.type === "MultiPolygon") return g.coordinates.reduce((s, c) => s + gjArea({type: "Polygon", coordinates: c}), 0); return null; }
const gjLines = g => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
function parseGeoJSON(data){
  const fs = data.type === "FeatureCollection" ? data.features : data.type === "Feature" ? [data] : [{type: "Feature", geometry: data, properties: {}}];
  const role = r => fs.filter(f => f.geometry && (f.properties || {}).role === r);
  const mainF = fs.find(f => f.geometry && /LineString/.test(f.geometry.type) && (f.properties || {}).role === "main") || fs.find(f => f.geometry && /LineString/.test(f.geometry.type) && !(f.properties || {}).role);
  if (!mainF) throw new Error("the file needs a LineString with properties.role = \"main\" (upstream → downstream)");
  const c = gjLines(mainF.geometry).flat(); if (c.length < 2 || c.some(p => !gjValid(p[0]) || !gjValid(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new Error("the main line has invalid WGS84 coordinates (expected [longitude, latitude, elevation?])");
  const sumA = r => { const a = role(r).map(f => gjArea(f.geometry)).filter(gjValid); return a.length ? a.reduce((s, x) => s + x, 0) : null; };
  const lens = r => role(r).flatMap(f => gjLines(f.geometry).map(gjLen));
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0)/a.length : null, sum = a => a.length ? a.reduce((s, x) => s + x, 0) : null;
  const pairs = role("channel_width").map(f => { const id = (f.properties || {}).transect_id; const v = role("valley_width").find(g => id != null && (g.properties || {}).transect_id === id); const a = gjLines(f.geometry)[0], b = v && gjLines(v.geometry)[0]; return a && b && gjLen(b) > 0 ? gjLen(a)/gjLen(b) : null; }).filter(gjValid);
  const migr = role("migration").filter(f => gjValid((f.properties || {}).years) && f.properties.years > 0).flatMap(f => gjLines(f.geometry).map(l => gjLen(l)/f.properties.years));
  const basin = sumA("catchment"), net = sum(lens("stream"));
  const U = {name: (mainF.properties || {}).name || null, features: fs.length,
    basinKm2: basin != null ? basin/1e6 : null, streamKm: net != null ? net/1000 : null, Dd: basin > 0 && net != null ? net/1000/(basin/1e6) : null,
    chW: avg(lens("channel_width")), fpW: avg(lens("floodplain_width")), vW: avg(lens("valley_width")), chVal: avg(pairs), nPairs: pairs.length,
    deltaKm2: sumA("delta") != null ? sumA("delta")/1e6 : null, disKm: sum(lens("distributary")) != null ? sum(lens("distributary"))/1000 : null,
    migr: avg(migr), nMigr: migr.length, eroHa: sumA("erosion") != null ? sumA("erosion")/1e4 : null, accHa: sumA("accretion") != null ? sumA("accretion")/1e4 : null,
    layers: fs.filter(f => f !== mainF && f.geometry).map(f => ({role: (f.properties || {}).role || "other", g: f.geometry}))};
  return {main: c.map(p => [p[1], p[0]]), z: c.every(p => gjValid(p[2])) ? c.map(p => p[2]) : null, U};
}
const UCOL = {catchment: "#ffd84a", delta: "#c9a7ff", erosion: "#e8452c", accretion: "#4cd17a", stream: "#7fd4ff", distributary: "#c9a7ff", channel_width: "#43d9e8", floodplain_width: "#4cd17a", valley_width: "#ffd84a", migration: "#ff8a4c", other: "#bbb"};
function drawUserLayers(ctx, M, U){
  const path = (ring) => ring.forEach((p, j) => { const q = M.toScr(p[1], p[0]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
  ctx.save(); ctx.lineJoin = ctx.lineCap = "round";
  for (const L of U.layers){ const c = UCOL[L.role] || UCOL.other, g = L.g; ctx.strokeStyle = c; ctx.fillStyle = c + "22"; ctx.lineWidth = /width|migration/.test(L.role) ? 2.5 : 1.6;
    if (g.type === "Polygon" || g.type === "MultiPolygon"){ const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates; for (const P of polys){ ctx.beginPath(); P.forEach(r => { path(r); ctx.closePath(); }); ctx.fill("evenodd"); ctx.stroke(); } }
    else for (const l of gjLines(g)){ ctx.beginPath(); path(l); ctx.stroke(); } }
  ctx.restore();
}
async function importGeoJSON(file, toCompare){
  try {
    const data = JSON.parse(await file.text()), {main, z, U} = parseGeoJSON(data), nm = U.name || file.name.replace(/\.(geo)?json$/i, "");
    const R = {name: nm, osm: "file:" + file.name, main, cum: withCum(main), side: [], tribs: [], dams: [], prof: null, reaches: null, user: U, zUser: z};
    R.L = R.cum[R.cum.length - 1]; if (!(R.L > 0)) throw new Error("the main line has zero length");
    xstatus(`${esc(file.name)}: ${km(R.L)} main channel, ${U.features} features. ${z ? "Using the elevations in the file…" : "No elevations in the file: reading terrain…"}`, "busy");
    buildReaches(R); await loadProfile(R); buildReaches(R);
    if (toCompare){ if (XR.cmp.length >= 3) XR.cmp.shift(); XR.cmp.push({R, k0: 0, k1: R.L, label: nm}); if (!XR.river){ XR.river = R; XR.pos = 0; xmap.fit(R.main); } showXTab("compare"); }
    else { if (XR.river){ XR.stack = XR.stack || []; XR.stack.push(XR.river); } XR.river = R; XR.pos = 0; XR.range = null; xmap.fit(R.main); renderX(); }
    xstatus(`<b>${esc(nm)}</b> loaded from ${esc(file.name)}: ${km(R.L)}, fall ${nf(R.prof.drop)} m${z ? " (elevations from the file)" : " (terrain tiles)"}.${toCompare ? " Added to the comparison." : ""}`, "ok");
  } catch(e){ console.error(e); xstatus("GeoJSON: " + esc(e.message), "err"); }
}
function userRows(){ return [
  ["Catchment area (uploaded)", U => U.basinKm2 != null ? nf(U.basinKm2, 2) + " km²" : null], ["Stream network length (uploaded)", U => U.streamKm != null ? km(U.streamKm) : null], ["Drainage density (uploaded)", U => U.Dd != null ? nf(U.Dd, 3) + " km/km²" : null],
  ["Mean channel width (transects)", U => U.chW != null ? nf(U.chW) + " m" : null], ["Mean floodplain width (transects)", U => U.fpW != null ? nf(U.fpW) + " m" : null], ["Mean valley width (transects)", U => U.vW != null ? nf(U.vW) + " m" : null],
  ["Channel ÷ valley width (paired transects)", U => U.chVal != null ? `${nf(U.chVal, 3)} (n=${U.nPairs})` : null], ["Delta area (uploaded)", U => U.deltaKm2 != null ? nf(U.deltaKm2, 2) + " km²" : null], ["Distributary length (uploaded)", U => U.disKm != null ? km(U.disKm) : null],
  ["Mean migration rate (measured lines)", U => U.migr != null ? `${nf(U.migr, 2)} m/yr (n=${U.nMigr})` : null], ["Erosion area (uploaded)", U => U.eroHa != null ? nf(U.eroHa, 2) + " ha" : null], ["Accretion area (uploaded)", U => U.accHa != null ? nf(U.accHa, 2) + " ha" : null]]; }
function renderUserLayers(){
  const el = $("xUserStats"), R = XR.river; if (!el) return; const U = R && R.user;
  el.innerHTML = U ? `<h4>Measured layers in ${esc(R.osm.slice(5))}</h4>${kv(userRows().map(([n, f]) => [n, f(U)]).filter(r => r[1] != null))}<p class="note">Values computed from your uploaded geometry only (spherical approximations, not survey grade); missing roles are left out, never synthesised.</p>` : "";
}
