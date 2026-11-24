/* ===================== Seafloor channels · tributaries & distributaries ===================== */

/** Google Earth's ocean floor is a single blue shaded-relief layer: almost every pixel is blue */
function isBathymetry(D){
  if (!D || D.kind !== "image") return false;
  const L = ensureLab(D), N = D.w*D.h, st = Math.max(1, Math.floor(N/40000)); let n = 0, blue = 0;
  for (let i = 0; i < N; i += st){ if (!D.rgba[i*4+3]) continue; const a = L[i*3+1], b = L[i*3+2]; n++; if (b < -15 && a > -12 && a < 40) blue++; }
  return n > 0 && blue/n > .85;
}

/** relative depth: in Google Earth's ocean shading, lighter blue = shallower. Returns 0 (deep) … 1 (shallow) */
function depthProxy(D){
  const w = D.w, h = D.h, L = ensureLab(D), f = Math.max(2, Math.ceil(Math.min(w, h)/90)), gw = Math.ceil(w/f), gh = Math.ceil(h/f);
  const g = new Float32Array(gw*gh), n = new Float32Array(gw*gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const k = ((y/f)|0)*gw + ((x/f)|0); g[k] += L[(y*w+x)*3]; n[k]++; }
  for (let k = 0; k < g.length; k++) g[k] /= n[k] || 1;
  let s = boxBlurF(g, gw, gh, 4); s = boxBlurF(s, gw, gh, 4);
  let mn = Infinity, mx = -Infinity; for (const v of s){ if (v < mn) mn = v; if (v > mx) mx = v; }
  const out = new Float32Array(w*h);
  for (let y = 0; y < h; y++){ const gy = clamp(y/f - .5, 0, gh-1), y0 = Math.floor(gy), y1 = Math.min(gh-1, y0+1), ty = gy - y0;
    for (let x = 0; x < w; x++){ const gx = clamp(x/f - .5, 0, gw-1), x0 = Math.floor(gx), x1 = Math.min(gw-1, x0+1), tx = gx - x0;
      const v = (s[y0*gw+x0]*(1-tx) + s[y0*gw+x1]*tx)*(1-ty) + (s[y1*gw+x0]*(1-tx) + s[y1*gw+x1]*tx)*ty;
      out[y*w+x] = (v - mn)/((mx - mn) || 1); } }
  return out;
}

/** trace incised valleys (canyons, channels, gullies) as dark, line-like troughs in the shaded relief:
    multi-scale Hessian "valley" filter → hysteresis → gap bridging */
function seafloorChannels(){
  const D = G.D, w = G.w, h = G.h, N = w*h, Lab = ensureLab(D);
  const L = new Float32Array(N); for (let i = 0; i < N; i++) L[i] = Lab[i*3];
  const s0 = Math.max(1, Math.min(w, h)/650), Rv = new Float32Array(N), scl = new Float32Array(N);
  for (const sg of [1.5*s0, 3*s0, 6*s0]){
    const r = Math.max(1, Math.round(sg*.9)), S = boxBlurF(boxBlurF(L, w, h, r), w, h, r), d = Math.max(1, Math.round(sg*.7)), d2 = d*d;
    for (let y = d; y < h-d; y++) for (let x = d; x < w-d; x++){
      const i = y*w+x;
      const xx = (S[i+d] - 2*S[i] + S[i-d])/d2, yy = (S[i+d*w] - 2*S[i] + S[i-d*w])/d2, xy = (S[i+d*w+d] - S[i+d*w-d] - S[i-d*w+d] + S[i-d*w-d])/(4*d2);
      const tr = (xx+yy)/2, ds = Math.sqrt(((xx-yy)/2)**2 + xy*xy), l1 = tr + ds, l2 = tr - ds;
      const v = sg*sg*Math.max(0, l1 - 2*Math.max(0, l2));
      if (v > Rv[i]){ Rv[i] = v; scl[i] = sg; }
    }
  }
  if (G.excl) for (let i = 0; i < N; i++) if (G.excl[i]) Rv[i] = 0;
  if (G.labelMask) for (let i = 0; i < N; i++) if (G.labelMask[i]) Rv[i] *= .3;
  if (G.scaleBar){ const sb = G.scaleBar; for (let y = Math.max(0, sb.y - 40); y < Math.min(h, sb.y + 24); y++) for (let x = Math.max(0, sb.x0 - 12); x < Math.min(w, sb.x0 + sb.px + 12); x++) Rv[y*w+x] = 0; }
  const smp = []; for (let i = 0; i < N; i += 7) smp.push(Rv[i]);
  const hi = quantile(smp, .985), lo = quantile(smp, .935);
  if (!(hi > 0)) return {skip:"no incised channels found in the seafloor shading"};
  const m = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
  for (let i = 0; i < N; i++) if (Rv[i] >= hi){ m[i] = 1; st[sp++] = i; }
  while (sp){ const p = st[--sp], x = p % w, y = (p/w)|0;
    for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny*w+nx; if (!m[q] && Rv[q] >= lo){ m[q] = 1; st[sp++] = q; } } }
  // join fragments (labels, watermarks, noisy tracks) then drop short pieces
  const P = new Float32Array(N); for (let i = 0; i < N; i++) P[i] = clamp(Rv[i]/hi, 0, 1);
  let mm = m; try { const b = bridgeGaps(m, w, h, Math.max(6, .04*Math.min(w, h)), P); mm = b.m || m; } catch(e){ console.error(e); }
  const lb = label(mm, w, h), minSpan = .07*Math.min(w, h), keep = new Set();
  for (const c of lb.comps){ const span = Math.hypot(c.x1-c.x0, c.y1-c.y0); if (span >= minSpan && c.area/Math.max(1, span) < .06*Math.min(w, h)) keep.add(c.id); }
  const out = new Uint8Array(N); let area = 0; for (let i = 0; i < N; i++) if (keep.has(lb.L[i])){ out[i] = 1; area++; }
  if (!area) return {skip:"no channel long enough to trace"};
  G.mask = out; G.maskV++; G.prep = null; G.depth = depthProxy(D);
  // main system: the longest single route (skeleton diameter) through strongly incised troughs that runs downslope,
  // across the depth contours, rather than along them as the foot of an escarpment or a band of shelf-edge gullies does
  const skA = thin(out, w, h), md = Math.min(w, h), dp = G.depth, at = (x, y) => dp[clamp(Math.round(y), 0, h-1)*w + clamp(Math.round(x), 0, w-1)];
  const stamp = new Int32Array(N), dist = new Float32Array(N), q = new Int32Array(N); let tag = 0;
  const bfs = (s0) => { tag++; let qh = 0, qt = 0, far = s0; q[qt++] = s0; stamp[s0] = tag; dist[s0] = 0;
    while (qh < qt){ const p = q[qh++], x = p % w, y = (p/w)|0; for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny*w+nx; if (!skA[r] || stamp[r] === tag) continue; stamp[r] = tag; dist[r] = dist[p] + (dx && dy ? SQ2 : 1); if (dist[r] > dist[far]) far = r; q[qt++] = r; } }
    return {far, D: dist[far], n: qt}; };
  const seen = new Uint8Array(lb.comps.length + 2); let big = null, bs = -1; G._sfc = [];
  for (let i = 0; i < N; i++){ if (!skA[i]) continue; const id = lb.L[i]; if (!keep.has(id) || seen[id]) continue; seen[id] = 1;
    const r1 = bfs(i), r2 = bfs(r1.far); let sr = 0; for (let t = 0; t < r2.n; t++) sr += Math.min(3, Rv[q[t]]/hi);
    const a = r1.far, b2 = r2.far, ax = a % w, ay = (a/w)|0, bx = b2 % w, by = (b2/w)|0, ch = [bx - ax, by - ay], cl = Math.hypot(...ch) || 1;
    const mx = (ax + bx)/2, my = (ay + by)/2, rr = .08*md, gx = at(mx + rr, my) - at(mx - rr, my), gy = at(mx, my + rr) - at(mx, my - rr), gl = Math.hypot(gx, gy);
    const cosA = gl > .02 ? Math.abs(ch[0]*gx + ch[1]*gy)/(cl*gl) : 1, sc = r2.D*(sr/Math.max(1, r2.n))*(.2 + .8*cosA);
    const cc = lb.comps.find(c => c.id === id); G._sfc.push({sc: Math.round(sc), D: Math.round(r2.D), str: +(sr/r2.n).toFixed(2), cosA: +cosA.toFixed(2), bb: [cc.x0, cc.y0, cc.x1, cc.y1]});
    if (sc > bs){ bs = sc; big = cc; } }
  let best = -1, bd = Infinity;
  for (let i = 0; i < N; i++) if (skA[i] && lb.L[i] === big.id && nbCount(skA, w, h, i) === 1 && G.depth[i] < bd){ bd = G.depth[i]; best = i; }
  if (best >= 0) G.outlet = [best % w, (best/w)|0];
  const ra = roiArea();
  G.seafloor = {systems: keep.size, area, hi, lo};
  showRes("water", [
    SEC("Seafloor channels (bathymetry)"),
    R("Share of analysis area", U.P(area/ra*100), "pixels traced as incised channel or canyon floor"),
    R("Separate channel systems", U.N(keep.size, 0), "after joining gaps up to " + U.L(Math.max(6, .04*Math.min(w, h))).s),
    R("Detection scales", {v:NaN, u:"", s:[1.5, 3, 6].map(k => U.L(k*s0).s).join(" · ")}, "widths of trough the valley filter looks for"),
  ]);
  rebuildOverlay();
  return {ok:true, share: area/ra, largest: Math.max(big.area, ra*.005), msg:`${keep.size} channel system${keep.size > 1 ? "s" : ""} traced from the seafloor shading; downslope = toward darker (deeper) blue`};
}
$("btnSeafloor") && ($("btnSeafloor").onclick = () => busy("Tracing seafloor channels…", () => { const r = seafloorChannels(); if (r.skip) toast(r.skip); }));

/* ---------- tributaries, distributaries and side channels along the main channel ---------- */
function analyzeBranches(quiet){
  if (!G.chan) analyzeChannel();
  const c = G.chan, P = prepNetwork(), w = G.w, h = G.h, N = w*h, W = c.W, n = c.pts.length;
  const mainPix = new Uint8Array(N); c.pts.forEach(p => mainPix[Math.round(p[1])*w + Math.round(p[0])] = 1);
  const nearMain = dilate(mainPix, w, h, Math.max(2, W*.6)), dMain = edtTo(mainPix, w, h);
  const sub = new Uint8Array(N); for (let i = 0; i < N; i++) sub[i] = P.sk[i] && !nearMain[i] ? 1 : 0;
  const lb = label(sub, w, h);
  // nearest main-stem index for a pixel (coarse scan then refine)
  const nearestIdx = (x, y) => { let bi = 0, bd = Infinity; for (let k = 0; k < n; k += 3){ const d = (c.pts[k][0]-x)**2 + (c.pts[k][1]-y)**2; if (d < bd){ bd = d; bi = k; } }
    for (let k = Math.max(0, bi-3); k <= Math.min(n-1, bi+3); k++){ const d = (c.pts[k][0]-x)**2 + (c.pts[k][1]-y)**2; if (d < bd){ bd = d; bi = k; } } return bi; };
  const sAt = k => c.s[k];
  const downVec = k => { let a = k, b = k; while (a > 0 && c.s[k] - c.s[a] < 3*W) a--; while (b < n-1 && c.s[b] - c.s[k] < 3*W) b++; const v = [c.pts[a][0]-c.pts[b][0], c.pts[a][1]-c.pts[b][1]], l = Math.hypot(...v) || 1; return [v[0]/l, v[1]/l]; };
  const depth = G.depth, sea = G.delta && G.delta.sea;
  // blob test (as for side channels): clearings, towns and fields detected as water form blobs, real channels are thin lines
  const mf = new Float32Array(N); for (let i = 0; i < N; i++) mf[i] = G.mask[i]; const r0 = Math.max(3, Math.round(1.2*W)); let fill = boxBlurF(mf, w, h, r0); fill = boxBlurF(fill, w, h, r0);
  const Lab = ensureLab(G.D), mainLab = [0, 0, 0]; c.pts.forEach(p => { const i = (Math.round(p[1])*w + Math.round(p[0]))*3; for (let k = 0; k < 3; k++) mainLab[k] += Lab[i+k]/n; });
  const blobby = pix => pix.filter(p => fill[p] > .5).length/pix.length > .4;
  const pixOf = new Map(); for (let i = 0; i < N; i++) if (lb.L[i]){ let a = pixOf.get(lb.L[i]); if (!a) pixOf.set(lb.L[i], a = []); a.push(i); }
  const items = [];
  const geo = (pix, start) => { // geodesic BFS inside a pixel set from one pixel
    const set = new Set(pix), dist = new Map([[start, 0]]), par = new Map([[start, -1]]), q = [start]; let far = start;
    for (let qi = 0; qi < q.length; qi++){ const p = q[qi], x = p % w, y = (p/w)|0, d = dist.get(p);
      for (const [dx, dy] of NB8){ const qx = x+dx, qy = y+dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; const r = qy*w+qx; if (!set.has(r) || dist.has(r)) continue; dist.set(r, d + (dx && dy ? SQ2 : 1)); par.set(r, p); q.push(r); if (dist.get(r) > dist.get(far)) far = r; } }
    const route = t => { const o = []; for (let p = t; p >= 0; p = par.get(p)) o.push(p); return o; };
    return {dist, far, len: dist.get(far), route}; };
  const describe = (pix, att, k, gap) => {
    const g = geo(pix, att), ax = att % w, ay = (att/w)|0, fx = g.far % w, fy = (g.far/w)|0;
    let l0 = 0, a0 = 0, b0 = 0; for (const p of pix){ l0 += Lab[p*3]; a0 += Lab[p*3+1]; b0 += Lab[p*3+2]; } const n0 = pix.length;
    const bw0 = median(pix.map(p => 2*P.halfW[p] - 1).filter(v => v > 0)) || 1, hair = pix.length/Math.max(1, g.len);
    const blackwater = l0/n0 < 38 && bw0 >= .3*W; // a wide dark river joining (e.g. Rio Negro): a real tributary even though its colour differs
    if (g.len < Math.max(3*W, 12) || (!G.seafloor && !blackwater && blobby(pix))) return null;
    if (!G.seafloor && !gap && !blackwater){ // same water as the main channel? (clearings and fields picked up as water differ in colour and form hairy networks)
      const dE = Math.hypot((l0/n0 - mainLab[0])*.6, a0/n0 - mainLab[1], b0/n0 - mainLab[2]); if ((dE > 10 && hair > 1.6) || hair > 2.5) return null; }
    const ws = pix.map(p => 2*P.halfW[p] - 1).filter(v => v > 0), bw = ws.length ? median(ws) : 1;
    // direction a short way into the branch
    const want = Math.min(g.len*.5, Math.max(3*W, 10)); let bp = g.far, bdd = Infinity;
    for (const [p, d] of g.dist){ const e = Math.abs(d - want); if (e < bdd){ bdd = e; bp = p; } }
    const jx = c.pts[k][0], jy = c.pts[k][1];
    const bv = [bp % w - jx, ((bp/w)|0) - jy], bl = Math.hypot(...bv) || 1; bv[0] /= bl; bv[1] /= bl;
    const dv = downVec(k), cosT = bv[0]*dv[0] + bv[1]*dv[1], theta = Math.acos(clamp(cosT, -1, 1))*180/Math.PI;
    let type = theta > 95 ? "trib" : theta < 85 ? "dist" : "trib", cue = `it points ${theta > 90 ? "upstream" : "downstream"} at ${theta.toFixed(0)}° to the downstream direction`, conf = Math.abs(cosT);
    if (depth){ const dd = depth[g.far] - depth[att]; if (Math.abs(dd) > .02){ type = dd > 0 ? "trib" : "dist"; cue = dd > 0 ? "its far end is shallower (lighter), so it feeds the main channel" : "its far end is deeper (darker), so flow leaves the main channel"; conf = Math.min(1, Math.abs(dd)*8); } }
    else if (sea && sea[g.far] && !sea[att]){ type = "dist"; cue = "it ends in open water"; conf = 1; }
    const right = dv[0]*bv[1] - dv[1]*bv[0] > 0;
    const step = Math.max(1, Math.floor(pix.length/600)), pts = []; for (let t = 0; t < pix.length; t += step) pts.push([pix[t] % w, (pix[t]/w)|0]);
    const route = g.route(g.far).reverse(); /* junction → far end */ const st = pathStats(type === "dist" ? route.slice().reverse() : route, P.halfW);
    return {stats: st, type, k, s: sAt(k), x: jx, y: jy, fx, fy, len: g.len, total: pix.length, width: bw, theta, angle: type === "trib" ? 180 - theta : theta, bank: right ? "right" : "left", cue, conf, gap, pts};
  };
  for (const comp of lb.comps){
    const pix = pixOf.get(comp.id); if (!pix || pix.length < Math.max(3*W, 12)) continue;
    // attachment pixels: next to a skeleton pixel inside the main-stem corridor
    const att = []; for (const p of pix){ const x = p % w, y = (p/w)|0; for (const [dx, dy] of NB8){ const qx = x+dx, qy = y+dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; const q = qy*w+qx; if (P.sk[q] && nearMain[q]){ att.push(p); break; } } }
    if (!att.length) continue;
    const ks = att.map(p => ({p, k: nearestIdx(p % w, (p/w)|0)})).sort((a, b) => a.k - b.k);
    const groups = [[ks[0]]]; for (let t = 1; t < ks.length; t++){ if (c.s[ks[t].k] - c.s[groups[groups.length-1].slice(-1)[0].k] > 4*W) groups.push([]); groups[groups.length-1].push(ks[t]); }
    if (groups.length >= 2){ // rejoins the main channel: a side channel / anabranch around an island
      const a = groups[0][0], b = groups[groups.length-1][0], g = geo(pix, a.p);
      if (g.len < 3*W) continue;
      const ws = pix.map(p => 2*P.halfW[p] - 1).filter(v => v > 0);
      const step = Math.max(1, Math.floor(pix.length/600)), pts = []; for (let t = 0; t < pix.length; t += step) pts.push([pix[t] % w, (pix[t]/w)|0]);
      items.push({type:"side", k: a.k, k2: b.k, s: sAt(a.k), s2: sAt(b.k), x: c.pts[a.k][0], y: c.pts[a.k][1], fx: c.pts[b.k][0], fy: c.pts[b.k][1], len: pix.length*1.08, total: pix.length, width: ws.length ? median(ws) : 1, cue:"leaves and rejoins the main channel", conf: 1, pts, stats: pathStats(g.route(g.far).reverse(), P.halfW), theta: NaN, angle: NaN, bank: ""});
      continue;
    }
    const a0 = groups[0][Math.floor(groups[0].length/2)], d = describe(pix, a0.p, a0.k, false); if (d){ if (d.type === "trib" && d.angle > 100) d.cue += "; it is barbed, entering against the flow"; items.push(d); }
  }
  // channels cut off from the network by a short detection gap (bridge, label, cloud): their nearest end lies close to the main stem
  { const {L, comps} = label(G.mask, w, h), gapMax = Math.max(4*W, .03*Math.min(w, h)), done = new Set();
    for (const cc of comps){
      if (cc.id === P.cid || cc.area < 20 || done.has(cc.id)) continue;
      const span = Math.hypot(cc.x1-cc.x0, cc.y1-cc.y0); if (span < 8*W) continue;
      const one = new Uint8Array(N); let any = false;
      for (let y = cc.y0; y <= cc.y1; y++) for (let x = cc.x0; x <= cc.x1; x++){ const i = y*w+x; if (L[i] === cc.id){ one[i] = 1; if (dMain[i] < gapMax) any = true; } }
      if (!any) continue;
      const sk = thin(one, w, h), pix = []; let ep = -1, ed = Infinity;
      for (let y = cc.y0; y <= cc.y1; y++) for (let x = cc.x0; x <= cc.x1; x++){ const i = y*w+x; if (!sk[i]) continue; pix.push(i); if (nbCount(sk, w, h, i) <= 1 && dMain[i] < ed){ ed = dMain[i]; ep = i; } }
      if (ep < 0 || ed > gapMax || pix.length < 8*W) continue;
      done.add(cc.id);
      const hw = edtTo(notMask(one), w, h), save = P.halfW; P.halfW = hw;
      const k = nearestIdx(ep % w, (ep/w)|0), d = describe(pix, ep, k, true); P.halfW = save;
      if (d){ d.gapLen = ed; items.push(d); }
    }
  }
  // names: largest first within each type
  const byType = t => items.filter(o => o.type === t).sort((a, b) => b.len - a.len);
  const tribs = byType("trib"), dists = byType("dist"), sides = byType("side");
  tribs.forEach((o, i) => o.id = "T" + (i+1)); dists.forEach((o, i) => o.id = "D" + (i+1)); sides.forEach((o, i) => o.id = "S" + (i+1));
  const sc = G.pxm || 1, tS = tribs.map(o => o.s).sort((a, b) => a-b), sp = []; for (let i = 1; i < tS.length; i++) sp.push(tS[i] - tS[i-1]);
  const left = tribs.filter(o => o.bank === "left").length, right = tribs.length - left;
  const res = {tribs, dists, sides, all: [...tribs, ...dists, ...sides], spacing: median(sp), left, right, W};
  G.branches = res;
  G.tables.branches = res.all.map(o => ({id:o.id, type: {trib:"tributary", dist:"distributary", side:"side channel"}[o.type], distance_from_outlet: o.s*sc, length: o.len*sc, width: o.width*sc, width_ratio: o.width/W, junction_angle: o.angle, bank: o.bank, detection_gap: o.gap ? "yes" : "no", reason: o.cue, x: o.x, y: o.y}));
  buildChannelStats(quiet);
  if (quiet) return res;
  const big = tribs[0], bigD = dists[0], A = tribs.map(o => o.angle).filter(Number.isFinite);
  showRes("branches", [
    SEC("Branches along the main channel"),
    R("Tributaries (join the main channel)", U.N(tribs.length, 0), `${left} from the left bank, ${right} from the right (looking downstream)`),
    R("Distributaries (leave the main channel)", U.N(dists.length, 0), dists.length ? "flow splits away; common on deltas, fans and the lower ends of submarine channels" : "none found"),
    R("Side channels (split and rejoin)", U.N(sides.length, 0), "anabranches around islands or bars"),
    SEC("Tributaries"),
    big ? R("Largest tributary", U.L(big.len), `${big.id}, joins ${U.L(big.s).s} from the outlet`) : null,
    tribs.length ? R("Median tributary length", U.L(median(tribs.map(o => o.len)))) : null,
    tribs.length ? R("Median width ÷ main width", U.N(median(tribs.map(o => o.width/W)), 2), "how big tributaries are compared with the main channel") : null,
    A.length ? R("Median junction angle", U.D(median(A)), "angle between a tributary and the main channel upstream of the junction; low-gradient, humid landscapes are often near 72°, steep or arid ones narrower") : null,
    sp.length ? R("Spacing between confluences", U.L(res.spacing), "median distance along the main channel between successive tributary junctions") : null,
    bigD ? SEC("Distributaries") : null,
    bigD ? R("Largest distributary", U.L(bigD.len), `${bigD.id}, leaves ${U.L(bigD.s).s} from the outlet at ${fx(bigD.angle, 0)}°`) : null,
  ].filter(Boolean), `<p class="note">How the type is decided: a branch that points back upstream from where it meets the main channel is a tributary; one that points downstream is a distributary${depth ? ". On the seafloor the depth cue wins: a branch whose far end is lighter (shallower) blue feeds the main channel" : ""}. Branches marked “gap” are separate in the water map but end within ${U.L(Math.max(4*W, .03*Math.min(w, h))).s} of the main channel.</p>
  <div style="max-height:240px;overflow:auto"><table class="grid"><tr><th>id</th><th>joins at</th><th>length</th><th>width</th><th>angle</th><th>bank</th></tr>${res.all.map(o => `<tr><td>${o.id}${o.gap ? " <small>gap</small>" : ""}</td><td>${U.L(o.s).s}</td><td>${U.L(o.len).s}</td><td>${U.L(o.width).s}</td><td>${Number.isFinite(o.angle) ? o.angle.toFixed(0) + "°" : "–"}</td><td>${o.bank}</td></tr>`).join("")}</table></div>
  <canvas class="chart" id="chBr"></canvas>`);
  if (res.all.length) chart($("chBr"), {title:"Where branches meet the main channel", xlab:"distance from outlet (" + lenUnit() + ")", ylab:"branch length (" + lenUnit() + ")",
    series:[{x: tribs.map(o => o.s*sc), y: tribs.map(o => o.len*sc), color:"#3fc1d3", dots:true, noline:true}, {x: dists.map(o => o.s*sc), y: dists.map(o => o.len*sc), color:"#ff6fae", dots:true, noline:true}]});
  rebuildOverlay(); requestDraw();
  return res;
}
$("btnBranches") && ($("btnBranches").onclick = () => busy("Finding tributaries and distributaries…", () => { analyzeBranches(); G.hl = "branches"; requestDraw(); }));

const BR_COL = {trib:"#3fc1d3", dist:"#ff6fae", side:"#b4f05a"};
function drawBranchesLab(ctx, P, v){
  const B = G.branches; if (!B) return;
  const all = B.all, show = G.hl === "branches";
  if (show) for (const o of all){ ctx.fillStyle = BR_COL[o.type]; for (const p of o.pts){ const q = P(p[0], p[1]); ctx.fillRect(q[0]-1.5, q[1]-1.5, 3, 3); } }
  ctx.font = "bold 10px Space Grotesk, sans-serif"; ctx.textAlign = "center";
  for (const o of all.slice(0, show ? 60 : 12)){ const q = P(o.x, o.y); ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fillStyle = BR_COL[o.type]; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = "#000"; ctx.fillText(o.id, q[0], q[1]+3.5); }
  ctx.textAlign = "left";
}

/* ---------- flow direction ---------- */
function deltaHint(){
  if (G.seafloor || !G.chan) return null;
  const nm = ((G.D && G.D.name) || "") + " " + ((G.place && G.place.caption) || "");
  let why = null;
  if (G.focus === "delta") why = "Delta focus: the single wide trunk is upstream and flow spreads into distributaries";
  else if (/delta|\bfans?\b|distribut/i.test(nm)) why = "the image name mentions a delta, so the wide trunk is upstream and flow spreads into distributaries";
  if (!why) return null;
  const P = prepNetwork(), p0 = G.chan.pts[0], hw = P.halfW[Math.round(p0[1])*G.w + Math.round(p0[0])];
  if (hw > 3*G.chan.W) return null; // the wide end already opens into the sea or a lake: keep it as the outlet
  return why;
}
function whereIs(x, y){ const v = y < G.h/3 ? "top" : y > 2*G.h/3 ? "bottom" : "middle", hz = x < G.w/3 ? "left" : x > 2*G.w/3 ? "right" : "centre"; return v === "middle" && hz === "centre" ? "centre" : v === "middle" ? hz + " edge" : hz === "centre" ? v : v + " " + hz; }
function flipFlow(){ G.flowFlip = !G.flowFlip; G.outlet = null; runAuto(); }
$("btnFlip") && ($("btnFlip").onclick = flipFlow);

/* ---------- every channel in the image, connected or not ---------- */
function analyzeChannelSet(quiet){
  const w = G.w, h = G.h, N = w*h, m = G.mask, lb = label(m, w, h), sk = thin(m, w, h), md = Math.min(w, h);
  const P = G.chan ? true : null; let mainId = 0;
  if (G.chan) for (const p of [G.chan.pts[Math.floor(G.chan.pts.length/2)], G.chan.pts[0], G.chan.pts[G.chan.pts.length-1]]){ const x = Math.round(p[0]), y = Math.round(p[1]);
    for (let r = 0; r <= 3 && !mainId; r++) for (let dy = -r; dy <= r && !mainId; dy++) for (let dx = -r; dx <= r && !mainId; dx++){ const xx = x+dx, yy = y+dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && lb.L[yy*w+xx]) mainId = lb.L[yy*w+xx]; } if (mainId) break; }
  const hw = edtTo(notMask(m), w, h), first = new Map(), skn = new Map();
  for (let i = 0; i < N; i++) if (sk[i]){ const id = lb.L[i]; if (!first.has(id)) first.set(id, i); skn.set(id, (skn.get(id) || 0) + 1); }
  const par = new Int32Array(N), seen = new Int32Array(N); let tag = 0;
  const bfs = s0 => { tag++; const q = [s0], d = new Map([[s0, 0]]); seen[s0] = tag; par[s0] = -1; let far = s0;
    for (let qi = 0; qi < q.length; qi++){ const p = q[qi], x = p % w, y = (p/w)|0; for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny*w+nx; if (!sk[r] || seen[r] === tag) continue; seen[r] = tag; par[r] = p; d.set(r, d.get(p) + (dx && dy ? SQ2 : 1)); if (d.get(r) > d.get(far)) far = r; q.push(r); } }
    return {far, D: d.get(far)}; };
  const list = [];
  for (const c of lb.comps){
    const f0 = first.get(c.id); if (f0 === undefined) continue;
    const a = bfs(f0).far, r = bfs(a), pts = [], pidx = []; for (let p = r.far; p >= 0; p = par[p]){ pts.push([p % w, (p/w)|0]); pidx.push(p); }
    const W = c.area/Math.max(1, skn.get(c.id)), Dl = r.D, isMain = !!P && c.id === mainId;
    if (!isMain && (Dl/W < 8 || Dl < .08*md || (skn.get(c.id) || 0)/Math.max(1, Dl) > 2.2)) continue; // hairy blobs (clearings, towns) are not channels
    const ws = []; for (let k = 0; k < pts.length; k += 2) ws.push(2*hw[pts[k][1]*w + pts[k][0]] - 1);
    const chord = Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1]) || 1;
    const step = Math.max(1, Math.floor(pts.length/500)), sp = pts.filter((_, k) => k % step === 0);
    let st = isMain ? null : pathStats(pidx, hw); if (st && st.wHead > 1.2*st.wOut) st = pathStats(pidx.slice().reverse(), hw);
    list.push({stats: st, main: isMain, len: isMain && G.chan ? G.chan.len : Dl, width: isMain && G.chan ? G.chan.W : median(ws), sin: isMain && G.chan ? G.chan.len/G.chan.straight : Dl/chord, total: (skn.get(c.id) || 0), branches: Math.max(0, Math.round((skn.get(c.id) || 0)/Math.max(1, Dl)*10)/10), pts: sp, mid: pts[Math.floor(pts.length/2)], area: c.area});
  }
  list.sort((a, b) => (b.main - a.main) || (b.len - a.len));
  let k = 0; list.forEach(c => c.id = c.main ? "Main" : "C" + (++k));
  const res = G.channelSet = {list}, sc = G.pxm || 1, others = list.filter(c => !c.main);
  G.tables.channels = list.map(c => ({id: c.id, connected_to_main: c.main ? "is main" : "no", length: c.len*sc, median_width: c.width*sc, sinuosity: c.sin, skeleton_total: c.total*sc, x: c.mid[0], y: c.mid[1]}));
  buildChannelStats(true);
  if (quiet) return res;
  showRes("channels", [
    SEC("Channels in the image"),
    R("Channel-shaped water bodies", U.N(list.length, 0), "pieces of water at least 8 widths long and 8% of the image across"),
    R("Not connected to the main channel", U.N(others.length, 0), "they may join outside the view, under vegetation or bridges, or be separate rivers"),
    others[0] ? R("Longest separate channel", U.L(others[0].len), `${others[0].id}, sinuosity ${others[0].sin.toFixed(2)}`) : null,
  ].filter(Boolean), `<div style="max-height:220px;overflow:auto"><table class="grid"><tr><th>id</th><th>length</th><th>width</th><th>sinuosity</th></tr>${list.map(c => `<tr><td>${c.id}</td><td>${U.L(c.len).s}</td><td>${U.L(c.width).s}</td><td>${c.sin.toFixed(2)}</td></tr>`).join("")}</table></div>`);
  buildChannelStats(!!G._autoRunning);
  rebuildOverlay(); requestDraw();
  return res;
}
$("btnChanSet") && ($("btnChanSet").onclick = () => busy("Listing channels…", () => { analyzeChannelSet(); G.hl = "chanset"; requestDraw(); }));
const CS_COL = ["#7ee0ff", "#ffd84a", "#b4f05a", "#ff9ad5", "#c9a7ff", "#ffb36b", "#6bffc9", "#ff7a7a"];
function drawChannelSetLab(ctx, P){
  const S = G.channelSet; if (!S) return; const show = G.hl === "chanset";
  S.list.filter(c => !c.main).forEach((c, i) => { const col = CS_COL[i % CS_COL.length];
    if (show){ ctx.fillStyle = col; for (const p of c.pts){ const q = P(p[0], p[1]); ctx.fillRect(q[0]-1.5, q[1]-1.5, 3, 3); } }
    if (show || i < 8){ const q = P(c.mid[0], c.mid[1]); ctx.font = "bold 10px Space Grotesk, sans-serif"; const tw = ctx.measureText(c.id).width + 8; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(q[0] - tw/2, q[1] - 8, tw, 15); ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(c.id, q[0], q[1] + 3); ctx.textAlign = "left"; } });
}

/* ---------- the same statistics for every channel ---------- */
function pathStats(idx, halfW){
  if (!idx || idx.length < 20) return null;
  try { const r = analyzePath(idx, halfW); return {len: r.len, straight: r.straight, sin: r.straight >= 4*r.W ? r.len/r.straight : NaN /* ends almost touch: sinuosity meaningless */, W: r.W, wMean: r.wMean, w05: r.w05, w95: r.w95, wOut: r.wOut, wHead: r.wHead,
    bends: r.bends.length, lambda: r.lambda, Rc: r.Rc, amp: r.amp, beltW: r.beltW, beltSin: r.beltSin, az: r.az, cci: r.cci, prof: profOf(r)}; } catch(e){ console.error(e); return null; }
}
const CH_TYPE = {major:"major river", river:"river", main:"main channel", trib:"tributary", dist:"distributary", side:"side channel", sep:"separate channel"};
function buildChannelStats(quiet){
  const rows = [];
  if (G.rivers && G.rivers.length){
    for (const r of G.rivers) rows.push({id: r.id, type: r.major ? "major" : "river", st: r.st, pts: r.pts, mid: r.mid, parentId: r.parentId, s: null});
    if (G.branches) for (const o of [...G.branches.dists, ...G.branches.sides]) if (o.stats) rows.push({id: o.id, type: o.type, st: o.stats, pts: o.pts, mid: [o.x, o.y], angle: o.angle, s: o.s});
  } else {
  if (G.chan){ const r = G.chan; rows.push({id:"Main", type:"main", st:{len: r.len, straight: r.straight, sin: r.len/r.straight, W: r.W, wMean: r.wMean, w05: r.w05, w95: r.w95, wOut: r.wOut, wHead: r.wHead, bends: r.bends.length, lambda: r.lambda, Rc: r.Rc, amp: r.amp, beltW: r.beltW, beltSin: r.beltSin, az: r.az, cci: r.cci, prof: profOf(r)}, pts: r.pts, mid: r.pts[Math.floor(r.pts.length/2)]}); }
  if (G.branches) for (const o of G.branches.all) if (o.stats) rows.push({id: o.id, type: o.type, st: o.stats, pts: o.pts, mid: [o.x, o.y], angle: o.angle, s: o.s});
  if (G.channelSet) for (const c of G.channelSet.list) if (!c.main && c.stats) rows.push({id: c.id, type:"sep", st: c.stats, pts: c.pts, mid: c.mid});
  }
  const sc = G.pxm || 1, un = lenUnit();
  G.chStats = rows; if (G.chSel) for (const id of [...G.chSel]) if (!rows.some(r => r.id === id)) G.chSel.delete(id);
  G.tables.channelStats = rows.map(r => ({id: r.id, name: chName(r), type: CH_TYPE[r.type], joins: r.parentId || "", length: r.st.len*sc, straight_distance: r.st.straight*sc, sinuosity: r.st.sin, median_width: r.st.W*sc, width_p05: r.st.w05*sc, width_p95: r.st.w95*sc,
    width_at_outlet: r.st.wOut*sc, width_at_head: r.st.wHead*sc, bends: r.st.bends, wavelength: r.st.lambda*sc, wavelength_over_width: r.st.lambda/r.st.W, bend_radius: r.st.Rc*sc, radius_over_width: r.st.Rc/r.st.W,
    amplitude: r.st.amp*sc, belt_width: r.st.beltW*sc, belt_sinuosity: r.st.beltSin, direction_deg: r.st.az, junction_angle: Number.isFinite(r.angle) ? r.angle : "", joins_at: r.s != null ? r.s*sc : "", length_unit: un}));
  if (!quiet) renderChannelStats();
  return rows;
}
const CHS_COLS = [["len", "Length", "L"], ["sin", "Sinuosity", 2], ["W", "Median width", "L"], ["bends", "Bends", 0], ["lambda", "Wavelength", "L"], ["lw", "λ ÷ width", 1], ["rw", "Radius ÷ width", 2], ["amp", "Amplitude", "L"], ["beltW", "Belt width", "L"], ["az", "Direction", "deg"]];
function chsVal(r, k){ const s = r.st; return k === "lw" ? s.lambda/s.W : k === "rw" ? s.Rc/s.W : s[k]; }
function chsFmt(v, f){ if (!Number.isFinite(v)) return "–"; return f === "L" ? U.L(v).s : f === "deg" ? v.toFixed(0) + "°" : (+v).toFixed(f); }
let chsSort = {k: "len", d: -1}, chsFilter = "all";
function channelStatsHTML(){
  const rows = (G.chStats || []).filter(r => chsFilter === "all" || r.type === chsFilter).slice().sort((a, b) => { const va = chsVal(a, chsSort.k), vb = chsVal(b, chsSort.k); return ((Number.isFinite(va) ? va : -Infinity) - (Number.isFinite(vb) ? vb : -Infinity))*chsSort.d; });
  const types = [...new Set((G.chStats || []).map(r => r.type))];
  return `<div class="chips chsf">${["all", ...types].map(t => `<button class="chip${chsFilter === t ? " on" : ""}" data-chsf="${t}">${{all:"All", major:"Major rivers", river:"Other rivers", main:"Main", trib:"Tributaries", dist:"Distributaries", side:"Side channels", sep:"Separate"}[t]}</button>`).join("")}</div>
  <div class="chsw"><table class="grid chs"><tr><th>id</th><th>type</th>${CHS_COLS.map(([k, n]) => `<th data-chss="${k}">${n}${chsSort.k === k ? (chsSort.d < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr>
  ${rows.map(r => `<tr><td><b>${chName(r)}</b></td><td>${CH_TYPE[r.type]}</td>${CHS_COLS.map(([k, , f]) => `<td>${chsFmt(chsVal(r, k), f)}</td>`).join("")}</tr>`).join("")}</table></div>
  <p class="note">Tap a column to sort. Every channel is measured the same way as the main river: centreline from its widest end, width = 2 × distance to the bank, bends between curvature inflections. Channels shorter than about 20 pixels have no statistics.</p>
  <div class="btns"><button class="sm" data-chscsv>⬇ CSV</button><button class="sm" data-chsplot>Plot these</button></div>`;
}
function wireChannelStats(el){
  el.querySelectorAll("[data-chss]").forEach(t => t.onclick = () => { const k = t.dataset.chss; chsSort = {k, d: chsSort.k === k ? -chsSort.d : -1}; renderChannelStats(); });
  el.querySelectorAll("[data-chsf]").forEach(t => t.onclick = () => { chsFilter = t.dataset.chsf; renderChannelStats(); });
  el.querySelectorAll("[data-chscsv]").forEach(t => t.onclick = () => { const T = G.tables.channelStats || []; if (!T.length) return toast("No channels measured"); const keys = Object.keys(T[0]); save(base() + "-channels.csv", [keys.join(","), ...T.map(r => keys.map(k => typeof r[k] === "number" ? +r[k].toPrecision(6) : `"${String(r[k]).replace(/"/g, '""')}"`).join(","))].join("\n")); });
  el.querySelectorAll("[data-chsplot]").forEach(t => t.onclick = () => { showApp("lab"); setTimeout(() => { showTab("plot"); try { const s = $("plSrc"); if (s){ s.value = "channels"; s.dispatchEvent(new Event("change")); } const d = $("plDs"); if (d){ d.value = "channels"; d.dispatchEvent(new Event("change")); } } catch(e){} }, 80); });
}
function renderChannelStats(){
  for (const id of ["res-chanstats", "repChanStats"]){ const el = $(id); if (!el) continue;
    if (!G.chStats || !G.chStats.length){ el.innerHTML = id === "repChanStats" ? "" : `<p class="note">No channels measured yet.</p>`; continue; }
    el.innerHTML = (id === "repChanStats" ? `<h4>Channel statistics <span class="note">(${G.chStats.length} channels)</span></h4>` : "") + channelStatsHTML(); wireChannelStats(el); }
  if ($("repChanWrap")) $("repChanWrap").style.display = G.chStats && G.chStats.length ? "" : "none";
  renderExplorer();
}

function profOf(r){ const n = r.pts.length, st = Math.max(1, Math.floor(n/400)), o = {pts: [], s: [], w: []}; for (let i = 0; i < n; i += st){ o.pts.push(r.pts[i]); o.s.push(r.s[i]); o.w.push(r.w[i]); } return o; }

/* ---------- main stem should not switch rivers at a confluence of differently coloured water (e.g. black Rio Negro into tan Solimões) ---------- */
function colourBreak(){
  const c = G.chan; if (!c || c.pts.length < 200 || G.seafloor) return null;
  const Lab = ensureLab(G.D), w = G.w, n = c.pts.length, col = c.pts.map(p => { const i = (Math.round(p[1])*w + Math.round(p[0]))*3; return [Lab[i], Lab[i+1], Lab[i+2]]; });
  const pre = [[0, 0, 0]]; for (let i = 0; i < n; i++) pre.push(pre[i].map((v, k) => v + col[i][k]));
  const avg = (a, z) => pre[z].map((v, k) => (v - pre[a][k])/Math.max(1, z - a)), win = Math.max(40, Math.round(n*.05));
  let best = -1, bd = 0;
  for (let k = Math.max(win, Math.floor(n*.15)); k < Math.min(n - win, Math.floor(n*.92)); k += 3){ const A = avg(k - win, k), B = avg(k, k + win), d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); if (d > bd){ bd = d; best = k; } }
  if (best < 0 || bd < 16) return null;
  const A = avg(0, best), B = avg(best, n); if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) < 12) return null; // the new colour must persist to the head
  return {k: best, dE: bd, colA: A, colB: B};
}
function rerouteByColour(){
  const br = colourBreak(); if (!br) return null;
  const colOf = pts => { const Lab = ensureLab(G.D), a = [0, 0, 0]; let n = 0; for (const p of pts){ const i = (Math.round(p[1])*G.w + Math.round(p[0]))*3; a[0] += Lab[i]; a[1] += Lab[i+1]; a[2] += Lab[i+2]; n++; } return a.map(v => v/Math.max(1, n)); };
  const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const c0 = G.chan, P = prepNetwork(), orig = P.sk, w = G.w, h = G.h, W = c0.W, outlet0 = G.outlet;
  const cut = (sk, p) => { const r = Math.max(3, 1.5*W); for (let y = Math.max(0, Math.floor(p[1] - r)); y <= Math.min(h - 1, Math.ceil(p[1] + r)); y++) for (let x = Math.max(0, Math.floor(p[0] - r)); x <= Math.min(w - 1, Math.ceil(p[0] + r)); x++) if ((x - p[0])**2 + (y - p[1])**2 <= r*r) sk[y*w + x] = 0; };
  const run = (blockAt, outlet) => { G.outlet = outlet; G.prep = null; const Q = prepNetwork(), keep = Q.sk, sk = keep.slice(); cut(sk, blockAt); Q.sk = sk; let r = null; try { analyzeChannel(); r = G.chan; } catch(e){} Q.sk = keep; return r; };
  const n = c0.pts.length, k = br.k, off = Math.round(3*W);
  // colour of each arm, measured away from the confluence where the waters mix
  const nearIdx = (pts, q) => { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - q[0])**2 + (p[1] - q[1])**2; if (d < bd){ bd = d; bi = i; } }); return bi; };
  const cp = c0.pts[k], A = colOf(c0.pts.slice(0, Math.max(1, k - 2*off))), B = colOf(c0.pts.slice(Math.min(n - 1, k + 2*off)));
  // third arm C: block the head arm just past the confluence and see where the route goes instead
  const r1 = run(c0.pts[Math.min(n - 1, k + off)], outlet0);
  if (!r1 || r1.len < .2*c0.len){ G.outlet = outlet0; G.prep = null; analyzeChannel(); return null; }
  const kc = nearIdx(r1.pts, cp), C = colOf(r1.pts.slice(Math.min(r1.pts.length - 1, kc + 2*off)));
  const dAB = dE(A, B), dAC = dE(A, C), dBC = dE(B, C);
  let res = null;
  // the main river is the pair of arms with the same water; the third arm is a different river (symmetric, so it does not depend on the starting direction)
  if (Math.min(dAC, dBC) + 6 < dAB){
    if (dAC <= dBC) res = {main: r1, odd: "head"};
    else { const e1 = r1.pts[r1.pts.length - 1], r2 = run(c0.pts[Math.max(0, k - off)], [e1[0], e1[1]]); if (r2 && r2.len > .2*c0.len) res = {main: r2, odd: "outlet"}; }
  }
  if (res && res.main.W < .6*c0.W) res = null; // never trade the wide river for a narrow creek just because of colour
  if (!res){ G.outlet = outlet0; G.prep = null; analyzeChannel(); return null; }
  { // rivers of different colour meet; they rarely split. Orient the main channel so the odd river is a tributary (points upstream)
    const m = res.main, cp = c0.pts[k], oddEnd = res.odd === "head" ? c0.pts[Math.min(n - 1, k + 2*off)] : c0.pts[Math.max(0, k - 2*off)];
    let kk = 0, bd = Infinity; m.pts.forEach((p, i) => { const d = (p[0] - cp[0])**2 + (p[1] - cp[1])**2; if (d < bd){ bd = d; kk = i; } });
    const a = m.pts[Math.max(0, kk - off)], z = m.pts[Math.min(m.pts.length - 1, kk + off)], dv = [a[0] - z[0], a[1] - z[1]], ov = [oddEnd[0] - cp[0], oddEnd[1] - cp[1]];
    if ((dv[0]*ov[0] + dv[1]*ov[1] > 0) !== !!G.flowFlip){ const e = m.pts[m.pts.length - 1], blk = res.odd === "head" ? c0.pts[Math.min(n - 1, k + off)] : c0.pts[Math.max(0, k - off)], r3 = run(blk, [e[0], e[1]]); if (r3 && r3.len > .5*m.len) res.main = r3; else { res.main = run(blk, [m.pts[0][0], m.pts[0][1]]) || m; } }
  }
  if (res.odd === "head" && G.chan !== res.main){ /* not reached: r1 is the last run in this case */ }
  G.colourCut = res.odd;
  G.flowWhy = G.flowFlip ? "reversed by you" : `two rivers of different colour meet near the ${whereIs(c0.pts[k][0], c0.pts[k][1])}; the main channel follows one river and is oriented so the other joins it as a tributary`;
  const oddCol = res.odd === "head" ? B : A, mainCol = res.odd === "head" ? A : B;
  G.colourSplit = {at: c0.pts[k], dE: br.dE, dark: oddCol[0] < mainCol[0] - 10};
  return G.colourSplit;
}
/* ---------- channel explorer: pick channels, rename them, compare as numbers and pictures ---------- */
const EX_COL = ["#ff8a4c", "#43d9e8", "#ffd84a", "#ff6fae", "#b4f05a", "#c9a7ff", "#6bffc9", "#ff7a7a"];
G.chSel = null; G.chNames = {};
const chName = r => G.chNames[r.id] || (r.id === "Main" ? (G.seafloor ? "Main channel" : "Main river") : r.id);
const chSub = r => r.type === "major" || r.type === "river" ? (r.parentId ? `${r.type === "major" ? "major river" : "river"}, joins ${G.chNames[r.parentId] || r.parentId}` : `${r.type === "major" ? "major river" : "river"}, own network`) : CH_TYPE[r.type];
function exColor(id){ const rows = G.chStats || [], i = rows.findIndex(r => r.id === id); return EX_COL[(i < 0 ? 0 : i) % EX_COL.length]; }
function exSelected(){ const rows = G.chStats || []; if (!G.chSel){ const maj = rows.filter(r => r.type === "major"); G.chSel = new Set((maj.length >= 2 ? maj.slice(0, 6) : rows.slice().sort((a, b) => b.st.len*b.st.W - a.st.len*a.st.W).slice(0, Math.min(3, rows.length))).map(r => r.id)); } return rows.filter(r => G.chSel.has(r.id)); }
const EX_MET = [["len", "Length", "L"], ["sin", "Sinuosity", 2], ["W", "Median width", "L"], ["bends", "Bends", 0], ["lambda", "Meander wavelength", "L"], ["lw", "Wavelength ÷ width", 1], ["rw", "Bend radius ÷ width", 2], ["beltW", "Meander-belt width", "L"]];
function explorerHTML(){
  const rows = G.chStats || [], sel = exSelected();
  return `<div class="chx">
    <canvas class="chxmap"></canvas>
    <p class="note">Tap a channel on the map, or the chips, to add it to the comparison (up to 6). Tap a name in the table to rename it (e.g. “Rio Negro”).</p>
    <div class="chips chxchips">${rows.map(r => `<button class="chip${G.chSel.has(r.id) ? " on" : ""}" data-exid="${r.id}"><i style="background:${exColor(r.id)}"></i>${chName(r)}</button>`).join("")}</div>
    ${sel.length ? `<div class="chsw"><table class="grid chs"><tr><th></th>${sel.map(r => `<th><i class="dot" style="background:${exColor(r.id)}"></i><span class="exn" data-exren="${r.id}">${chName(r)}</span><br><small>${chSub(r)}</small></th>`).join("")}</tr>
      ${EX_MET.map(([k, n, f]) => `<tr><td>${n}</td>${sel.map(r => `<td>${chsFmt(chsVal(r, k), f)}</td>`).join("")}</tr>`).join("")}</table></div>
    <h5 class="exh">Side by side</h5><canvas class="exbars"></canvas>
    <h5 class="exh">Shapes, stretched to the same end-to-end distance</h5><p class="note" style="margin-top:-4px">More wiggle = higher sinuosity. Each line runs from its outlet (left) to its head (right).</p><canvas class="exshape"></canvas>
    <h5 class="exh">Width along each channel</h5><canvas class="chart exwid"></canvas>
    <div class="btns"><button class="sm pri" data-expost>＋ Add this comparison to Posts</button>${sel.filter(r => r.type === "major" || r.type === "river").length >= 2 ? `<button class="sm" data-excmb>⊕ Combine selected into one river</button>` : ""}${(G.riverUndo || []).length ? `<button class="sm" data-exundo>↶ Undo combine</button>` : ""}<button class="sm" data-exall>Select all</button><button class="sm" data-exnone>Clear</button></div>` : `<p class="note">Select at least one channel.</p>`}
  </div>`;
}
function drawExplorer(el){
  const rows = G.chStats || [], sel = exSelected(), cv = el.querySelector(".chxmap"); if (!cv) return;
  const Wc = Math.max(300, el.clientWidth || 360), Hc = Math.round(Wc*Math.min(1.3, G.h/G.w)), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Wc*dpr; cv.height = Hc*dpr; cv.style.width = Wc + "px"; cv.style.height = Hc + "px";
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const geom = [];
  for (const r of rows){ const on = G.chSel.has(r.id), col = on ? exColor(r.id) : "rgba(255,255,255,.45)", line = r.st.prof && r.st.prof.pts.length > 2;
    geom.push(line ? {t:"line", pts: r.st.prof.pts, col, w: on ? 1.3 : .5} : {t:"dots", pts: r.pts, col, w: on ? .8 : .4}); }
  for (const r of sel) geom.push({t:"pin", x: r.mid[0], y: r.mid[1], col: exColor(r.id), label: r.id === "Main" ? "M" : r.id});
  const cr = drawScene(ctx, {geom, box: null}, 0, 0, Wc, Hc, {lw: .9});
  cv.onclick = e => { const b = cv.getBoundingClientRect(), s = Wc/cr.w, x = cr.x + (e.clientX - b.left)/s, y = cr.y + (e.clientY - b.top)/s; let best = null, bd = Infinity;
    for (const r of rows){ const P = r.st.prof && r.st.prof.pts.length > 2 ? r.st.prof.pts : r.pts; for (let i = 0; i < P.length; i += 2){ const d = (P[i][0] - x)**2 + (P[i][1] - y)**2; if (d < bd){ bd = d; best = r; } } }
    if (best && Math.sqrt(bd) < 30/s){ exToggle(best.id); } };
  if (!sel.length) return;
  // bars: one small chart per metric
  const bc = el.querySelector(".exbars"); if (bc){ const mets = EX_MET.filter(([k]) => sel.some(r => Number.isFinite(chsVal(r, k)))), rowH = 15, panH = 22 + sel.length*rowH + 8, Hb = mets.length*panH;
    bc.width = Wc*dpr; bc.height = Hb*dpr; bc.style.width = Wc + "px"; bc.style.height = Hb + "px"; const x = bc.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    mets.forEach(([k, n, f], m) => { const y0 = m*panH, vals = sel.map(r => chsVal(r, k)), mx = Math.max(...vals.filter(Number.isFinite), 1e-9);
      x.fillStyle = "#cfd4d9"; x.font = "600 12px Space Grotesk, sans-serif"; x.fillText(n, 0, y0 + 14);
      sel.forEach((r, i) => { const v = vals[i], y = y0 + 22 + i*rowH, lw = 74, bw = Wc - lw - 70;
        x.fillStyle = "#9aa3ab"; x.font = "11px Space Grotesk, sans-serif"; x.fillText(chName(r).slice(0, 11), 0, y + 10);
        x.fillStyle = "rgba(255,255,255,.06)"; x.fillRect(lw, y + 1, bw, rowH - 4);
        if (Number.isFinite(v)){ x.fillStyle = exColor(r.id); x.fillRect(lw, y + 1, Math.max(2, bw*v/mx), rowH - 4); }
        x.fillStyle = "#e9edf0"; x.fillText(chsFmt(v, f), lw + bw + 6, y + 10); }); }); }
  // shapes
  const sc = el.querySelector(".exshape"); if (sc){ const rowH = 64, Hs = sel.length*rowH; sc.width = Wc*dpr; sc.height = Hs*dpr; sc.style.width = Wc + "px"; sc.style.height = Hs + "px";
    const x = sc.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    sel.forEach((r, i) => { const P = r.st.prof && r.st.prof.pts.length > 2 ? r.st.prof.pts : null, y0 = i*rowH + rowH/2 + 6;
      x.fillStyle = "#9aa3ab"; x.font = "11px Space Grotesk, sans-serif"; x.fillText(`${chName(r)} · sinuosity ${chsFmt(r.st.sin, 2)}`, 0, i*rowH + 11);
      if (!P) return; const a = P[0], z = P[P.length - 1], ang = Math.atan2(z[1] - a[1], z[0] - a[0]), ch = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, ca = Math.cos(-ang), sa = Math.sin(-ang), k = (Wc - 20)/ch;
      const Q = P.map(p => { const dx = p[0] - a[0], dy = p[1] - a[1]; return [10 + (dx*ca - dy*sa)*k, (dx*sa + dy*ca)*k]; });
      const mx = Math.max(1, ...Q.map(q => Math.abs(q[1]))), f = Math.min(1, (rowH/2 - 10)/mx);
      x.strokeStyle = exColor(r.id); x.lineWidth = 2; x.lineJoin = "round"; x.beginPath(); Q.forEach((q, j) => j ? x.lineTo(q[0], y0 + q[1]*f) : x.moveTo(q[0], y0 + q[1]*f)); x.stroke();
      if (f < 1){ x.fillStyle = "#6b737b"; x.fillText(`(sideways ×${f.toFixed(2)})`, Wc - 92, i*rowH + 11); } }); }
  const wc = el.querySelector(".exwid"); if (wc){ const s = G.pxm || 1, un = lenUnit();
    chart(wc, {title: "Width along channel (outlet → head)", xlab: "distance from outlet (" + un + ")", ylab: "width (" + un + ")",
      series: sel.filter(r => r.st.prof).map(r => ({x: r.st.prof.s.map(v => v*s), y: Array.from(gauss1d(Float64Array.from(r.st.prof.w), 3), v => v*s), color: exColor(r.id)}))}); }
}
function exToggle(id){ if (G.chSel.has(id)) G.chSel.delete(id); else { if (G.chSel.size >= 6) return toast("Compare up to 6 channels"); G.chSel.add(id); } renderExplorer(); }
function renderExplorer(){
  for (const id of ["repExplorer", "labExplorer"]){ const el = $(id); if (!el) continue;
    if (!G.chStats || !G.chStats.length){ el.innerHTML = ""; continue; }
    el.innerHTML = (id === "repExplorer" ? `<h4>Compare channels</h4>` : "") + explorerHTML();
    el.querySelectorAll("[data-exid]").forEach(b => b.onclick = () => exToggle(b.dataset.exid));
    el.querySelectorAll("[data-exren]").forEach(b => b.onclick = () => { const r = G.chStats.find(q => q.id === b.dataset.exren), v = prompt("Name for " + r.id + " (e.g. Rio Negro):", chName(r)); if (v !== null){ G.chNames[r.id] = v.trim() || undefined; if (!v.trim()) delete G.chNames[r.id]; renderExplorer(); renderChannelStats(); } });
    const q = s => el.querySelector(s);
    q("[data-exall]") && (q("[data-exall]").onclick = () => { G.chSel = new Set(G.chStats.slice().sort((a, b) => b.st.len - a.st.len).slice(0, 6).map(r => r.id)); renderExplorer(); });
    q("[data-excmb]") && (q("[data-excmb]").onclick = () => combineSelected());
    q("[data-exundo]") && (q("[data-exundo]").onclick = () => undoCombine());
    q("[data-exnone]") && (q("[data-exnone]").onclick = () => { G.chSel = new Set(); renderExplorer(); });
    q("[data-expost]") && (q("[data-expost]").onclick = () => { addComparisonFinding(); toast("Added to Posts as a slide"); });
    requestAnimationFrame(() => drawExplorer(el)); }
}
function addComparisonFinding(){
  const sel = exSelected(); if (!sel.length) return;
  const f = comparisonFinding(sel); G.findings = (G.findings || []).filter(x => x.key !== f.key); G.findings.push(f); G.post.edits[f.key] = {}; G.post.userCmp = sel.map(r => r.id);
}
function comparisonFinding(sel){
  const sinMax = sel.slice().sort((a, b) => (b.st.sin || 0) - (a.st.sin || 0))[0];
  return {on: true, key: "cmp", kicker: "Channels side by side", big: String(sel.length), bigLabel: "channels compared",
    title: sel.length > 1 ? `${chName(sinMax)} winds the most (${chsFmt(sinMax.st.sin, 2)}×)` : `${chName(sel[0])}`,
    text: sel.map(r => `${chName(r)}: ${L$(r.st.len)}, ${chsFmt(r.st.W, "L")} wide`).join(" · "),
    why: "Each channel measured with the same centreline method.",
    bars: {label: "Sinuosity", items: sel.map(r => ({name: chName(r), col: exColor(r.id), v: r.st.sin, s: chsFmt(r.st.sin, 2)}))},
    geom: sel.flatMap(r => [r.st.prof && r.st.prof.pts.length > 2 ? {t:"line", pts: r.st.prof.pts, col: exColor(r.id), w: 1.2} : {t:"dots", pts: r.pts, col: exColor(r.id), w: .9}, {t:"pin", x: r.mid[0], y: r.mid[1], col: exColor(r.id), label: r.id === "Main" ? "M" : r.id}]),
    legend: sel.slice(0, 6).map(r => [exColor(r.id), chName(r)]), box: null, hl: "chanset"};
}

/* ---------- river hierarchy: split every network into individual rivers (several can be "main") ---------- */
// From each network's mouth, follow the channel upstream; at every junction the river continues into the arm with the same water colour
// and the larger upstream network; every other arm starts a new river. Rivers are ranked by size (length × width); the largest are "major".
function analyzeRivers(quiet){
  const w = G.w, h = G.h, N = w*h, m = G.mask, md = Math.min(w, h), lb = label(m, w, h), sk = thin(m, w, h), hw = edtTo(notMask(m), w, h), Lab = ensureLab(G.D);
  if (G.isMap){ // drawn maps: rivers must not run through lake fills
    const hs = []; for (let i = 0; i < N; i++) if (sk[i]) hs.push(hw[i]); const mh = median(hs) || 1; for (let i = 0; i < N; i++) if (sk[i] && hw[i] > 3*mh + 1) sk[i] = 0; }
  const comps = lb.comps.filter(c => Math.hypot(c.x1 - c.x0, c.y1 - c.y0) >= .06*md);
  const ep = i => nbCount(sk, w, h, i) === 1;
  const par = new Int32Array(N).fill(-1), dist = new Float32Array(N), order = [], kids = new Map();
  const rivers = [];
  let mainMouth = -1; if (G.chan){ const p = G.chan.pts[0]; mainMouth = nearestOn(sk, w, h, p[0], p[1], 30); }
  const onMain = new Uint8Array(N); if (G.chan){ const d0 = dilate((() => { const t = new Uint8Array(N); G.chan.pts.forEach(p => t[Math.round(p[1])*w + Math.round(p[0])] = 1); return t; })(), w, h, 2); for (let i = 0; i < N; i++) if (sk[i] && d0[i]) onMain[i] = 1; }
  for (const c of comps){
    // mouth: the main channel's outlet if it is in this network, else the widest skeleton end on the image edge (or anywhere)
    let mouth = -1, best = -1;
    if (mainMouth >= 0 && lb.L[mainMouth] === c.id && !G.isMap) mouth = mainMouth;
    else if (G.isMap){ let s0 = -1; for (let y = c.y0; y <= c.y1 && s0 < 0; y++) for (let x = c.x0; x <= c.x1; x++){ const i = y*w + x; if (sk[i] && lb.L[i] === c.id){ s0 = i; break; } } if (s0 >= 0){ const d = skDiameter(sk, w, h, s0, true); mouth = ((d.a/w)|0) > ((d.b/w)|0) ? d.a : d.b; } } // no widths on a map: start from an end of the longest route (the lower one)
    else for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++){ const i = y*w + x; if (!sk[i] || lb.L[i] !== c.id || !ep(i)) continue;
      const edge = x < 6 || y < 6 || x > w - 7 || y > h - 7, s = hw[i]*(edge ? 3 : 1); if (s > best){ best = s; mouth = i; } }
    if (mouth < 0) continue;
    // BFS tree from the mouth along the skeleton
    let mainPath = null;
    if (mouth === mainMouth && G.chan && !G.isMap){ mainPath = []; const seen = new Set(); for (const p of G.chan.pts){ const s = nearestOn(sk, w, h, p[0], p[1], 4); if (s >= 0 && lb.L[s] === c.id && !seen.has(s)){ seen.add(s); mainPath.push(s); } } if (mainPath.length < 10) mainPath = null; }
    const q = mainPath ? mainPath.slice() : [mouth]; for (const p of q){ par[p] = -2; dist[p] = 0; }
    for (let qi = 0; qi < q.length; qi++){ const p = q[qi], x = p % w, y = (p/w)|0;
      for (const [dx, dy] of NB8){ const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny*w + nx; if (!sk[r] || par[r] !== -1) continue; par[r] = p; dist[r] = dist[p] + (dx && dy ? SQ2 : 1); q.push(r); } }
    // upstream size of each pixel = total channel area (Σ width) in its subtree; plus the deepest leaf reached
    const up = new Map(), far = new Map(); for (let t = q.length - 1; t >= 0; t--){ const p = q[t]; up.set(p, (up.get(p) || 0) + 2*hw[p]); if (!far.has(p)) far.set(p, p); const pp = par[p]; if (pp >= 0){ up.set(pp, (up.get(pp) || 0) + up.get(p)); const fp = far.get(pp); if (fp === undefined || dist[far.get(p)] > dist[fp]) far.set(pp, far.get(p)); } }
    const ch = new Map(); for (const p of q){ const pp = par[p]; if (pp >= 0){ let a = ch.get(pp); if (!a) ch.set(pp, a = []); a.push(p); } }
    const colAt = (p, steps) => { const o = [0, 0, 0]; let n = 0, cur = p; for (let s = 0; s < steps && cur >= 0; s++){ o[0] += Lab[cur*3]; o[1] += Lab[cur*3+1]; o[2] += Lab[cur*3+2]; n++; const k = ch.get(cur); if (!k) break; cur = k.reduce((a, b) => up.get(a) > up.get(b) ? a : b); } return o.map(v => v/Math.max(1, n)); };
    const colBack = (p, steps) => { const o = [0, 0, 0]; let n = 0, cur = p; for (let s = 0; s < steps && cur >= 0; s++){ o[0] += Lab[cur*3]; o[1] += Lab[cur*3+1]; o[2] += Lab[cur*3+2]; n++; cur = par[cur]; } return o.map(v => v/Math.max(1, n)); };
    // walk rivers (the main channel, already traced with colour-aware rules, is kept as this network's first river)
    const stack = [];
    if (mainPath){ const set = new Set(mainPath); let len = 0; for (let i = 1; i < mainPath.length; i++) len += Math.hypot(mainPath[i] % w - mainPath[i-1] % w, ((mainPath[i]/w)|0) - ((mainPath[i-1]/w)|0));
      const W = median(mainPath.filter((_, i) => i % 3 === 0).map(p => 2*hw[p] - 1)) || 1, idx = rivers.length; rivers.push({comp: c.id, parent: null, joinAt: null, path: mainPath, len, W, size: len*W, isMouth: true});
      for (const p of mainPath) for (const k of ch.get(p) || []) if (!set.has(k)) stack.push({start: k, parent: idx, joinAt: p}); }
    else stack.push({start: mouth, parent: null, joinAt: null});
    while (stack.length){
      const {start, parent, joinAt} = stack.pop(), path = [start]; let cur = start;
      while (true){
        const k = ch.get(cur); if (!k || !k.length) break;
        let next = k[0];
        if (k.length > 1){
          const win = Math.max(8, Math.round(4*hw[cur])), here = colBack(cur, win);
          const sc = k.map(c => { const col = colAt(c, win), d = Math.hypot(col[0] - here[0], col[1] - here[1], col[2] - here[2]); return {c, s: up.get(c)*(d > 18 ? .25 : 1)}; });
          sc.sort((a, b) => b.s - a.s); next = sc[0].c;
          if (onMain[cur]){ const om = sc.find(o => onMain[o.c]); if (om){ next = om.c; sc.splice(sc.indexOf(om), 1); sc.unshift(om); } } // the main channel already chose its route (colour-aware)
          for (const o of sc.slice(1)) stack.push({start: o.c, parent: rivers.length, joinAt: cur});
        }
        path.push(next); cur = next;
      }
      // length / size
      let len = 0; for (let i = 1; i < path.length; i++){ const a = path[i-1], b2 = path[i]; len += (a % w !== b2 % w && ((a/w)|0) !== ((b2/w)|0)) ? SQ2 : 1; }
      const W = median(path.filter((_, i) => i % 3 === 0).map(p => 2*hw[p] - 1)) || 1;
      rivers.push({comp: c.id, parent, joinAt, path, len, W, size: len*W, isMouth: parent === null});
    }
    for (const p of q) par[p] = -1;
  }
  // keep real rivers only: long enough and longer than wide
  const keep = rivers.filter(r => r.len >= Math.max(8*r.W, .05*md));
  keep.sort((a, b) => b.size - a.size);
  const big = keep.length ? keep[0].size : 1;
  keep.forEach((r, i) => { r.id = "R" + (i + 1); r.major = i < 8 && (i === 0 || (r.size >= .2*big && r.len >= .15*md) || (r.isMouth && r.size >= .08*big && r.len >= .3*md)); });
  const idOf = new Map(rivers.map((r, i) => [i, r]));
  for (const r of keep){ const p = r.parent != null ? idOf.get(r.parent) : null; r.parentId = p && p.id ? p.id : null;
    const st = pathStats(r.path, hw); r.st = st; r.mid = [r.path[Math.floor(r.path.length/2)] % w, (r.path[Math.floor(r.path.length/2)]/w)|0];
    const step = Math.max(1, Math.floor(r.path.length/500)); r.pts = r.path.filter((_, i) => i % step === 0).map(p => [p % w, (p/w)|0]);
    r.mouthXY = [r.path[0] % w, (r.path[0]/w)|0]; }
  G.rivers = keep.filter(r => r.st); G.riverHW = hw; G.riverUndo = []; G.riverPick = null; G.combineFrom = null;
  if (!quiet){
    const maj = G.rivers.filter(r => r.major);
    showRes("rivers", [SEC("Rivers"), R("Rivers traced", U.N(G.rivers.length, 0), "each network split into individual rivers at its junctions"), R("Major rivers", U.N(maj.length, 0), "the largest by length × width; several can be ‘main’"),
      maj[0] ? R("Largest", U.L(maj[0].len), `${maj[0].id}, sinuosity ${chsFmt(maj[0].st.sin, 2)}`) : null].filter(Boolean));
  }
  return G.rivers;
}
$("btnRivers") && ($("btnRivers").onclick = () => busy("Splitting into rivers…", () => { analyzeRivers(); buildChannelStats(); G.hl = "rivers"; rebuildOverlay(); requestDraw(); }));
function drawRiversLab(ctx, P){
  const Rv = G.rivers; if (!Rv) return; const show = G.hl === "rivers" || G.hl === "chanset";
  Rv.forEach((r, i) => { const picked = G.riverPick === r.id || (G.chSel && G.chSel.has(r.id)); if (!r.major && !show && !picked) return; const col = r.major || picked ? exColor(r.id) : "rgba(160,220,255,.8)";
    if (G.riverPick === r.id){ ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 7; ctx.beginPath(); r.pts.forEach((p, j) => { const q = P(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
    if (show || picked){ ctx.strokeStyle = col; ctx.lineWidth = r.major || picked ? 3 : 1.5; ctx.beginPath(); r.pts.forEach((p, j) => { const q = P(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
    if (r.major || show){ const q = P(r.mid[0], r.mid[1]), t = G.chNames[r.id] || r.id; ctx.font = "bold 10px Space Grotesk, sans-serif"; const tw = ctx.measureText(t).width + 8; ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(q[0] - tw/2, q[1] - 8, tw, 15); ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(t, q[0], q[1] + 3); ctx.textAlign = "left"; } });
}

/* ---------- tap a river in Lab, combine rivers ---------- */
function riverFields(r){
  const w = G.w, p = r.path; let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i] % w - p[i-1] % w, ((p[i]/w)|0) - ((p[i-1]/w)|0));
  r.len = len; r.W = median(p.filter((_, i) => i % 3 === 0).map(q => Math.max(1, 2*G.riverHW[q] - 1))) || 1; r.size = r.len*r.W;
  r.st = pathStats(p, G.riverHW) || r.st; const step = Math.max(1, Math.floor(p.length/500)); r.pts = p.filter((_, i) => i % step === 0).map(q => [q % w, (q/w)|0]);
  r.mid = [p[Math.floor(p.length/2)] % w, (p[Math.floor(p.length/2)]/w)|0]; r.mouthXY = [p[0] % w, (p[0]/w)|0]; return r;
}
function nearestRiver(ix, iy, tol){ let best = null, bd = Infinity; for (const r of G.rivers || []) for (const p of r.pts){ const d = (p[0] - ix)**2 + (p[1] - iy)**2; if (d < bd){ bd = d; best = r; } } return Math.sqrt(bd) <= tol ? best : null; }
function riverTap(ix, iy){
  const r = nearestRiver(ix, iy, Math.max(8, 16/((G.view && G.view.s) || 1))); if (!r){ if (G.riverPick){ G.riverPick = null; renderRiverCard(); requestDraw(); } return; }
  if (G.combineFrom && G.combineFrom !== r.id){ const a = G.combineFrom; G.combineFrom = null; combineRivers(a, r.id); return; }
  G.riverPick = r.id; renderRiverCard(); requestDraw();
}
function renderRiverCard(){
  const el = $("riverCard"); if (!el) return; const r = (G.rivers || []).find(q => q.id === G.riverPick);
  if (!r){ if (G.rivers && G.rivers.length){ el.style.display = ""; el.innerHTML = `<span class="note">Tap any river on the map to see its statistics, add it to the comparison, or combine it with another river.</span>${(G.riverUndo || []).length ? ` <button class="sm" data-rc="undo">↶ Undo combine</button>` : ""}`; const u = el.querySelector("[data-rc]"); if (u) u.onclick = undoCombine; } else el.style.display = "none"; return; }
  const row = {id: r.id, type: r.major ? "major" : "river", st: r.st, parentId: r.parentId}, s = r.st, kids = G.rivers.filter(q => q.parentId === r.id).length;
  const cell = (n, v) => `<div><small>${n}</small><span>${v}</span></div>`;
  el.style.display = "";
  el.innerHTML = `<div class="rch"><i class="dot" style="background:${exColor(r.id)};width:10px;height:10px;border-radius:50%;display:inline-block"></i><b>${chName(row)}</b><span class="note">${chSub(row)}${kids ? ` · ${kids} river${kids > 1 ? "s join" : " joins"} it` : ""}${r.combined ? " · combined" : ""}</span><span style="flex:1"></span><button class="sm" data-rc="x">✕</button></div>
    ${G.combineFrom ? `<p class="warn" style="margin:6px 0">Now tap the river to join with ${chName(row)}.</p>` : ""}
    <div class="rcs">${cell("Length", chsFmt(s.len, "L"))}${cell("Sinuosity", chsFmt(s.sin, 2))}${cell("Median width", chsFmt(s.W, "L"))}${cell("Bends", chsFmt(s.bends, 0))}${cell("Wavelength", chsFmt(s.lambda, "L"))}${cell("Radius ÷ width", chsFmt(s.Rc/s.W, 2))}${cell("Width at mouth", chsFmt(s.wOut, "L"))}${cell("Width at head", chsFmt(s.wHead, "L"))}${cell("Belt width", chsFmt(s.beltW, "L"))}</div>
    <div class="btns" style="margin:0"><button class="sm pri" data-rc="cmb">${G.combineFrom ? "Cancel combine" : "⊕ Combine with…"}</button><button class="sm" data-rc="cmp">${G.chSel && G.chSel.has(r.id) ? "✓ In comparison" : "＋ Compare"}</button><button class="sm" data-rc="ren">Rename</button>${(G.riverUndo || []).length ? `<button class="sm" data-rc="undo">↶ Undo combine</button>` : ""}</div>`;
  el.querySelectorAll("[data-rc]").forEach(bt => bt.onclick = () => { const k = bt.dataset.rc;
    if (k === "x"){ G.riverPick = null; G.combineFrom = null; }
    else if (k === "cmb"){ G.combineFrom = G.combineFrom ? null : r.id; if (G.combineFrom) toast("Tap the other river on the map"); }
    else if (k === "cmp"){ exSelected(); if (G.chSel.has(r.id)) G.chSel.delete(r.id); else G.chSel.add(r.id); renderExplorer(); }
    else if (k === "ren"){ const v = prompt("Name for " + r.id + ":", chName(row)); if (v !== null){ if (v.trim()) G.chNames[r.id] = v.trim(); else delete G.chNames[r.id]; refreshRiverViews(); } }
    else if (k === "undo") undoCombine();
    renderRiverCard(); requestDraw(); });
}
function refreshRiverViews(){ buildChannelStats(true); renderChannelStats(); try { if ($("repFindings") && G.autoLog) renderFindings(); } catch(e){ console.error(e); } renderRiverCard(); rebuildOverlay(); requestDraw(); }
/** join two rivers into one. If one river's mouth lies on the other, the combined river follows the lower part of the other and then the joining river,
    and the other's upper part becomes its own river. Otherwise they are joined end to end across any gap. */
function combineRivers(ia, ib){
  const Rv = G.rivers, A = Rv.find(r => r.id === ia), B = Rv.find(r => r.id === ib); if (!A || !B || A === B) return;
  G.riverUndo.push({rivers: Rv.map(r => ({...r})), names: {...G.chNames}});
  const w = G.w, d = (i, j) => Math.hypot(i % w - j % w, ((i/w)|0) - ((j/w)|0));
  const near = (R, p) => { let k = -1, bd = Infinity; R.path.forEach((q, i) => { const dd = d(p, q); if (dd < bd){ bd = dd; k = i; } }); return {k, d: bd}; };
  const tol = Math.max(5, 2*Math.max(A.W, B.W)), seg = (p, q) => { const o = [], n = Math.ceil(d(p, q)); for (let t = 1; t < n; t++){ const x = Math.round(p % w + (q % w - p % w)*t/n), y = Math.round(((p/w)|0) + (((q/w)|0) - ((p/w)|0))*t/n); o.push(y*w + x); } return o; };
  let path, rest = null, restParentLow = null, gap = 0;
  const jB = near(A, B.path[0]), jA = near(B, A.path[0]);
  if (jB.d <= tol && jB.k > 0 && jB.k < A.path.length - 1){ path = A.path.slice(0, jB.k + 1).concat(B.path); rest = A.path.slice(jB.k); }
  else if (jA.d <= tol && jA.k > 0 && jA.k < B.path.length - 1){ path = B.path.slice(0, jA.k + 1).concat(A.path); rest = B.path.slice(jA.k); }
  else {
    const a0 = A.path[0], a1 = A.path[A.path.length - 1], b0 = B.path[0], b1 = B.path[B.path.length - 1], rB = B.path.slice().reverse();
    const opts = [[d(a1, b0), () => A.path.concat(seg(a1, b0), B.path)], [d(a1, b1), () => A.path.concat(seg(a1, b1), rB)], [d(a0, b1), () => B.path.concat(seg(b1, a0), A.path)], [d(a0, b0), () => rB.concat(seg(b0, a0), A.path)]].sort((p, q) => p[0] - q[0]);
    gap = opts[0][0]; path = opts[0][1]();
  }
  const keepId = Rv.indexOf(A) <= Rv.indexOf(B) ? A.id : B.id, other = keepId === A.id ? B : A, keep = keepId === A.id ? A : B;
  const nm = r => G.chNames[r.id] || r.id, combined = riverFields({id: keepId, comp: keep.comp, parent: null, parentId: (A.parentId && A.parentId !== B.id) ? A.parentId : (B.parentId && B.parentId !== A.id ? B.parentId : null), path, major: A.major || B.major, combined: true, parts: [ia, ib], gap, isMouth: A.isMouth || B.isMouth});
  if (!G.chNames[keepId] || !G.chNames[other.id] || G.chNames[keepId] !== G.chNames[other.id]) G.chNames[keepId] = `${nm(A)} + ${nm(B)}`;
  delete G.chNames[other.id];
  const out = Rv.filter(r => r !== A && r !== B); out.splice(Math.min(Rv.indexOf(A), Rv.indexOf(B)), 0, combined);
  for (const r of out) if (r.parentId === other.id) r.parentId = keepId;
  if (rest && rest.length > 20){ let mx = 0; for (const r of Rv) mx = Math.max(mx, +r.id.slice(1) || 0); const nr = riverFields({id: "R" + (mx + 1), comp: keep.comp, parentId: keepId, path: rest, major: false, isMouth: false}); if (nr.len >= 8*nr.W) out.push(nr); }
  G.rivers = out;
  if (G.chSel){ G.chSel.delete(other.id); G.chSel.add(keepId); }
  G.riverPick = keepId;
  toast(gap > 0 ? `Combined across a ${chsFmt(gap, "L")} gap` : "Combined into one river");
  refreshRiverViews();
}
function undoCombine(){ const u = (G.riverUndo || []).pop(); if (!u) return; G.rivers = u.rivers; G.chNames = u.names; if (G.chSel) for (const id of [...G.chSel]) if (!G.rivers.some(r => r.id === id)) G.chSel.delete(id); G.riverPick = null; refreshRiverViews(); toast("Undone"); }
function combineSelected(){
  const sel = exSelected().filter(r => r.type === "major" || r.type === "river"); if (sel.length < 2) return toast("Select at least two rivers");
  const ids = sel.map(r => r.id); let cur = ids[0]; const n0 = G.riverUndo.length;
  for (const id of ids.slice(1)){ combineRivers(cur, id); cur = G.rivers.some(r => r.id === cur) ? cur : id; }
  // one undo step for the whole merge
  if (G.riverUndo.length > n0 + 1) G.riverUndo.splice(n0 + 1);
}
