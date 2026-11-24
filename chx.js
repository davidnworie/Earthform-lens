/* ===================== Channel+ : widest path, necks, oxbows, asymmetry, junctions, delta, braided, pattern field ===================== */
/** widest-route tree from src: cost = Σ step ÷ half-width, plus true length along the route */
function widestTree(s, w, h, src, halfW){
  const N = w*h, cost = new Float64Array(N).fill(Infinity), len = new Float64Array(N), prev = new Int32Array(N).fill(-1), hp = new Heap(1024);
  cost[src] = 0; hp.push(0, src);
  while (hp.n){
    const p = hp.pop(), d = hp.topKey; if (d > cost[p]) continue;
    const x = p % w, y = (p/w)|0;
    for (const [dx,dy] of NB8){
      const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue;
      const q = ny*w+nx; if (!s[q]) continue; const st = dx && dy ? SQ2 : 1, nd = d + st/Math.max(1, halfW[q]);
      if (nd < cost[q]){ cost[q] = nd; len[q] = len[p] + st; prev[q] = p; hp.push(nd, q); }
    }
  }
  return {cost, len, prev};
}
/** main stem that prefers wide channels: Dijkstra with step cost ÷ local half-width */
function widestPath(s, w, h, src, dst, halfW){
  const N = w*h, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), hp = new Heap(1024);
  dist[src] = 0; hp.push(0, src);
  while (hp.n){
    const p = hp.pop(), d = hp.topKey; if (d > dist[p]) continue; if (p === dst) break;
    const x = p % w, y = (p/w)|0;
    for (const [dx,dy] of NB8){
      const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue;
      const q = ny*w+nx; if (!s[q]) continue;
      const nd = d + (dx && dy ? SQ2 : 1)/Math.max(1, halfW[q]);
      if (nd < dist[q]){ dist[q] = nd; prev[q] = p; hp.push(nd, q); }
    }
  }
  if (!Number.isFinite(dist[dst])) return null;
  const path = []; for (let p = dst; p >= 0; p = prev[p]) path.push(p); return path.reverse();
}
function convexHull(pts){
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lo = [], up = [];
  for (const p of P){ while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length-1; i >= 0; i--){ const p = P[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const polyAreaPts = p => { let s = 0; for (let i = 0; i < p.length; i++){ const a = p[i], b = p[(i+1) % p.length]; s += a[0]*b[1] - b[0]*a[1]; } return Math.abs(s)/2; };
function inPoly(x, y, p){ let c = false; for (let i = 0, j = p.length-1; i < p.length; j = i++){ const a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) c = !c; } return c; }

/** meander necks (cutoff candidates): points far apart along the channel but close across land */
function findNecks(res){
  const {xs, ys, s, W} = res, n = xs.length, wd = res.w;
  const step = Math.max(1, Math.round(W/3)), cell = Math.max(4, 3*W), grid = new Map(), samp = [];
  for (let i = 0; i < n; i += step){ samp.push(i); const key = Math.floor(xs[i]/cell) + "," + Math.floor(ys[i]/cell); (grid.get(key) || grid.set(key, []).get(key)).push(i); }
  const minSep = 6*W, maxGap = 3*W, cands = [];
  for (const i of samp){
    const cx = Math.floor(xs[i]/cell), cy = Math.floor(ys[i]/cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++){
      const L = grid.get((cx+a) + "," + (cy+b)); if (!L) continue;
      for (const j of L){
        if (s[j] - s[i] <= minSep) continue;
        const d = Math.hypot(xs[i]-xs[j], ys[i]-ys[j]), gap = Math.max(0, d - (wd[i] + wd[j])/2);
        if (gap < maxGap) cands.push({i, j, gap, d, loop: s[j]-s[i]});
      }
    }
  }
  cands.sort((p, q) => p.gap - q.gap || q.loop - p.loop);
  const necks = [];
  for (const c of cands){
    if (necks.some(nk => Math.abs(s[nk.i]-s[c.i]) < 4*W && Math.abs(s[nk.j]-s[c.j]) < 4*W)) continue;
    // reject trivially adjacent loops (loop barely longer than the gap)
    if (c.loop < 2.5*c.d) continue;
    necks.push(c); if (necks.length >= 40) break;
  }
  necks.forEach(nk => { nk.ratio = nk.gap/W; nk.cls = nk.ratio <= .5 ? "critical" : nk.ratio <= 1.5 ? "narrow" : "developing"; nk.a = [xs[nk.i], ys[nk.i]]; nk.b = [xs[nk.j], ys[nk.j]]; nk.loopSin = nk.loop/Math.max(1, nk.d); });
  necks.sort((p, q) => p.gap - q.gap);
  return necks;
}

/* ---------- channel extras ---------- */
function channelExtras(res, P){
  const w = G.w, h = G.h, {xs, ys, s, W, k} = res, n = xs.length, wd = res.w;
  const necks = findNecks(res);
  // 2. bend asymmetry and compound bends (path runs outlet → head, so downstream is decreasing s)
  let downSk = 0, upSk = 0, compound = 0; const skews = [];
  for (const b of res.bends){
    let j = b.i0, km = 0; for (let t = b.i0; t <= b.i1; t++) if (Math.abs(k[t]) > km){ km = Math.abs(k[t]); j = t; }
    const pos = (s[b.i1] - s[j])/Math.max(1e-9, s[b.i1] - s[b.i0]); // 0 = apex at upstream inflection, 1 = at downstream inflection
    b.skew = pos; skews.push(pos); if (pos > .55) downSk++; else if (pos < .45) upSk++;
    let peaks = 0, last = -1e9;
    for (let t = b.i0+1; t < b.i1; t++){ const v = Math.abs(k[t]); if (v > .5*km && v >= Math.abs(k[t-1]) && v >= Math.abs(k[t+1]) && s[t] - last > W){ peaks++; last = s[t]; } }
    b.compound = peaks >= 2; if (b.compound) compound++;
  }
  // 3. local (moving-window) sinuosity
  const Lw = Math.max(10*W, Number.isFinite(res.lambda) ? 2*res.lambda : 0), loc = new Float64Array(n);
  let a = 0, bI = 0;
  for (let i = 0; i < n; i++){
    while (s[i] - s[a] > Lw/2) a++; while (bI < n-1 && s[bI] - s[i] < Lw/2) bI++;
    const d = Math.hypot(xs[bI]-xs[a], ys[bI]-ys[a]); loc[i] = d > 0 ? (s[bI]-s[a])/d : 1;
  }
  let iMax = 0; for (let i = 0; i < n; i++) if (loc[i] > loc[iMax]) iMax = i;
  // 4. oxbow lakes: channel-width, elongated water bodies within the meander belt, detached from the network
  const ox = [];
  if (G.mask){
    const pm = new Uint8Array(w*h); for (const p of res.pts) pm[Math.round(p[1])*w + Math.round(p[0])] = 1;
    const dPath = edtTo(pm, w, h), hwAll = edtTo(notMask(G.mask), w, h), {L, comps} = label(G.mask, w, h);
    const reach = Math.max(res.beltW, 8*W), pix = new Map();
    const want = new Set(comps.filter(c => c.id !== P.cid && c.area >= Math.max(12, .8*W*W)).map(c => c.id));
    for (let i = 0; i < L.length; i++) if (want.has(L[i])){ let a2 = pix.get(L[i]); if (!a2) pix.set(L[i], a2 = []); a2.push(i); }
    for (const [id, px] of pix){
      let dmin = Infinity, hs = 0; for (const i of px){ if (dPath[i] < dmin) dmin = dPath[i]; hs += hwAll[i]; }
      if (dmin > reach) continue;
      const lw = 2*hs/px.length, len = px.length/Math.max(.5, lw), rW = lw/W, el = len/Math.max(1, lw);
      if (rW < .3 || rW > 2.5 || el < 3) continue;
      const bd = px.filter((_, t) => t % 3 === 0).map(i => [i % w, (i/w)|0]), hull = convexHull(bd), sol = px.length/Math.max(1, polyAreaPts(hull));
      let cx = 0, cy = 0; for (const i of px){ cx += i % w; cy += (i/w)|0; }
      ox.push({id, area: px.length, len, width: lw, rW, el, sol, crescent: sol < .7, dist: dmin, c:[cx/px.length, cy/px.length], score: (sol < .7 ? 1 : 0) + Math.min(1, el/6) + (1 - Math.abs(Math.log(rW)))});
    }
    ox.sort((p, q) => q.score - p.score);
  }
  G.chx = {necks, skews, downSk, upSk, compound, loc: Array.from(loc), Lw, iMax, oxbows: G.seafloor ? [] : ox.slice(0, 30)};
  classifyChannels(res, P, G.chx.oxbows);
  const crit = necks.filter(nk => nk.cls === "critical").length, narrow = necks.filter(nk => nk.cls === "narrow").length;
  showRes("channelx", [
    SEC("Meander necks · cutoff risk"),
    R("Neck candidates", U.N(necks.length, 0), "places where the channel loops back to within 3 widths of itself"),
    R("Critical necks (gap ≤ 0.5 W)", U.N(crit, 0), crit ? "a cutoff is likely at the next large flood" : ""),
    R("Narrow necks (gap ≤ 1.5 W)", U.N(narrow, 0)),
    necks[0] ? R("Narrowest neck gap", U.L(necks[0].gap), `${necks[0].ratio.toFixed(2)} channel widths, cutting off a ${U.L(necks[0].loop).s} loop`) : null,
    SEC("Oxbow lakes"),
    R("Oxbow candidates", U.N(G.chx.oxbows.length, 0), "detached, channel-width, elongated lakes inside the meander belt"),
    G.chx.oxbows.length ? R("Crescent-shaped", U.N(G.chx.oxbows.filter(o => o.crescent).length, 0)) : null,
    SEC("Bend shape"),
    R("Downstream-skewed bends", U.N(downSk, 0), "apex in the downstream half of the bend"),
    R("Upstream-skewed bends", U.N(upSk, 0)),
    R("Median apex position", U.N(median(skews), 2), "0 = upstream end, 0.5 = symmetric, 1 = downstream end"),
    R("Compound bends", U.N(compound, 0), "bends with two or more curvature peaks (lobes)"),
    SEC("Local sinuosity"),
    R("Window length", U.L(Lw)),
    R("Most sinuous reach", U.N(loc[iMax], 2), `${U.L(s[iMax]).s} from the outlet`),
    R("Median local sinuosity", U.N(median(Array.from(loc)), 2)),
  ], `<canvas class="chart" id="chLoc"></canvas>` + (necks.length ? `<h4>Necks</h4><div style="max-height:200px;overflow:auto"><table class="grid"><tr><th>#</th><th>gap</th><th>gap ÷ W</th><th>loop</th><th>status</th></tr>${necks.slice(0, 25).map((nk, i) => `<tr><td>${i+1}</td><td>${U.L(nk.gap).s}</td><td>${nk.ratio.toFixed(2)}</td><td>${U.L(nk.loop).s}</td><td>${nk.cls}</td></tr>`).join("")}</table></div>` : ""));
  const sc = G.pxm || 1;
  chart($("chLoc"), {title:"Local sinuosity along the channel (outlet → head)", xlab:"distance from outlet (" + lenUnit() + ")", ylab:"sinuosity", series:[{x:res.s.map(v => v*sc), y:Array.from(loc), color:"#ff7a45"}]});
  G.tables.necks = necks.map((nk, i) => ({neck:i+1, gap:nk.gap*sc, gap_widths:nk.ratio, loop_length:nk.loop*sc, status:nk.cls, x1:nk.a[0], y1:nk.a[1], x2:nk.b[0], y2:nk.b[1]}));
}

/* ---------- network extras: junction angles, width by order ---------- */
function networkExtras(ctx){
  const {tree, children, nodes, P, w} = ctx, angles = [];
  const ptAlong = (l, v, dist) => {
    const pix = l.a === v ? l.pix : l.pix.slice().reverse(); let acc = 0;
    for (let t = 1; t < pix.length; t++){ acc += Math.hypot(pix[t] % w - pix[t-1] % w, ((pix[t]/w)|0) - ((pix[t-1]/w)|0)); if (acc >= dist) return [pix[t] % w, (pix[t]/w)|0]; }
    const e = pix[pix.length-1]; return [e % w, (e/w)|0];
  };
  for (const nd of nodes){
    const ch = children[nd.id]; if (!ch || ch.length < 2) continue;
    const two = ch.slice().sort((a, b) => b.order - a.order || b.len - a.len).slice(0, 2);
    const r = Math.max(4, 3*P.halfW[nd.pix[0]]);
    if (two.some(l => l.len < r)) continue;
    const p1 = ptAlong(two[0], nd.id, r), p2 = ptAlong(two[1], nd.id, r);
    const v1 = [p1[0]-nd.x, p1[1]-nd.y], v2 = [p2[0]-nd.x, p2[1]-nd.y];
    const ang = Math.acos(clamp((v1[0]*v2[0] + v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2) + 1e-9), -1, 1))*180/Math.PI;
    angles.push({ang, x:nd.x, y:nd.y});
  }
  const byO = {};
  for (const l of tree){ const wv = l.pix.map(p => 2*P.halfW[p] - 1); (byO[l.order] = byO[l.order] || []).push(median(wv)); }
  const orders = Object.keys(byO).map(Number).sort((a, b) => a-b), wo = orders.map(o => median(byO[o]));
  const Rw = []; for (let i = 0; i+1 < wo.length; i++) if (wo[i] > 0) Rw.push(wo[i+1]/wo[i]);
  const A = angles.map(a => a.ang);
  G.netx = {angles, orders, wo};
  showRes("networkx", [
    SEC("Junction angles"),
    R("Junctions measured", U.N(A.length, 0)),
    R("Median junction angle", U.D(median(A)), "angle between the two largest tributaries meeting at each junction"),
    R("Interquartile range", {v:NaN, u:"°", s: fx(quantile(A, .25), 0) + "° – " + fx(quantile(A, .75), 0) + "°"}),
    SEC("Hydraulic scaling"),
    R("Width ratio Rw", U.N(geomean(Rw), 2), "how much wider each Strahler order is than the one below"),
    ...orders.map((o, i) => R("Median width, order " + o, U.L(wo[i]))),
  ], `<canvas class="chart" id="chJA"></canvas><canvas class="chart" id="chWO"></canvas>`);
  histChart($("chJA"), A, 18, {title:"Junction angles", xlab:"angle (°)"});
  chart($("chWO"), {title:"Channel width by Strahler order", xlab:"order", ylab:"width (" + lenUnit() + ")", logy:true, series:[{x:orders, y:wo.map(v => v*(G.pxm || 1)), color:"#3fc1d3", dots:true}]});
}

/* ---------- delta ---------- */
function analyzeDelta(quiet){
  if (!G.mask) throw new Error("Detect water first");
  const w = G.w, h = G.h, mask = G.mask;
  const hw = edtTo(notMask(mask), w, h); const skAll = thin(mask, w, h); const ws = []; for (let i = 0; i < skAll.length; i++) if (skAll[i]) ws.push(2*hw[i]-1);
  const Wc = G.chan ? G.chan.W : Math.max(2, median(ws));
  const R0 = Math.max(3, Math.round(2.5*Wc));
  const open = opening(mask, w, h, R0), lab = label(open, w, h, G.roi);
  const edge = lab.comps.filter(c => c.border).sort((a, b) => b.area - a.area);
  const ra = roiArea();
  if (!edge.length || edge[0].area < ra*.02){ if (quiet) return null; throw new Error("No open water body (sea or lake) found next to the channels"); }
  const seed = new Uint8Array(w*h); for (let i = 0; i < seed.length; i++) seed[i] = lab.L[i] === edge[0].id ? 1 : 0;
  const sea = dilate(seed, w, h, R0); for (let i = 0; i < sea.length; i++) sea[i] = sea[i] && mask[i] ? 1 : 0;
  const chan = new Uint8Array(w*h); for (let i = 0; i < chan.length; i++) chan[i] = mask[i] && !sea[i] ? 1 : 0;
  const seaD = dilate(sea, w, h, 3);
  // channels connected to the sea
  const cl = label(chan, w, h), touch = new Set(); for (let i = 0; i < chan.length; i++) if (chan[i] && seaD[i]) touch.add(cl.L[i]);
  const sys = new Uint8Array(w*h); for (let i = 0; i < sys.length; i++) sys[i] = touch.has(cl.L[i]) ? 1 : 0;
  let sk = thin(sys, w, h); const hwS = edtTo(notMask(sys), w, h); sk = pruneSkeleton(sk, w, h, hwS, 1.5, []);
  const Gr = buildGraph(sk, w, h), nodes = Gr.nodes, links = Gr.links.filter(l => l.a !== l.b);
  if (!links.length){ if (quiet) return null; throw new Error("No distributary channels reach the open water"); }
  const dSea = edtTo(sea, w, h);
  const isMouth = nd => nd.pix.some(p => dSea[p] <= 4);
  const adj = nodes.map(() => []); links.forEach(l => { adj[l.a].push(l); adj[l.b].push(l); });
  // root: the node farthest from the sea (the upstream feeder)
  let root = -1, bd = -1; for (const nd of nodes){ if (!adj[nd.id].length) continue; const d = dSea[nd.pix[0]] + (nd.type === "end" ? 5 : 0); if (d > bd){ bd = d; root = nd.id; } }
  const seen = new Uint8Array(nodes.length), ch = nodes.map(() => []), order = []; seen[root] = 1; const q = [root];
  while (q.length){ const v = q.shift(); order.push(v); for (const l of adj[v]){ const o = l.a === v ? l.b : l.a; if (!seen[o]){ seen[o] = 1; l.up = v; l.dn = o; ch[v].push(l); q.push(o); } } }
  const mc = new Array(nodes.length).fill(0);
  for (let t = order.length-1; t >= 0; t--){ const v = order[t]; if (isMouth(nodes[v]) && !ch[v].length) mc[v] = 1; for (const l of ch[v]) mc[v] += mc[l.dn]; if (isMouth(nodes[v]) && ch[v].length && !mc[v]) mc[v] = 1; }
  let apex = root;
  for (let guard = 0; guard < nodes.length; guard++){ const live = ch[apex].filter(l => mc[l.dn] > 0); if (live.length >= 2 || !live.length) break; apex = live[0].dn; }
  // mouths: cluster sea-contact pixels of the channel skeleton
  const mm = new Uint8Array(w*h); for (let i = 0; i < sk.length; i++) if (sk[i] && dSea[i] <= 4) mm[i] = 1;
  const mlab = label(dilate(mm, w, h, Math.max(2, Wc)), w, h), mouths = mlab.comps.map(c => [c.sx/c.area, c.sy/c.area]);
  const ap = [nodes[apex].x, nodes[apex].y];
  // apex subtree statistics
  let bif = 0, dlinks = 0; const sub = [apex];
  while (sub.length){ const v = sub.pop(); const live = ch[v].filter(l => mc[l.dn] > 0); if (live.length >= 2) bif++; dlinks += live.length; live.forEach(l => sub.push(l.dn)); }
  const dists = mouths.map(m => Math.hypot(m[0]-ap[0], m[1]-ap[1]));
  const angs = mouths.map(m => Math.atan2(m[1]-ap[1], m[0]-ap[0])).sort((a, b) => a-b);
  let gapMax = 0; for (let i = 0; i < angs.length; i++){ const g = i ? angs[i]-angs[i-1] : angs[0] + 2*Math.PI - angs[angs.length-1]; if (g > gapMax) gapMax = g; }
  const opening2 = angs.length > 1 ? (2*Math.PI - gapMax)*180/Math.PI : 0;
  const hull = convexHull([ap, ...mouths]);
  let dArea = 0, shore = [], landA = 0;
  if (hull.length >= 3){
    const xs = hull.map(p => p[0]), ys = hull.map(p => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h-1, Math.ceil(Math.max(...ys))); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w-1, Math.ceil(Math.max(...xs))); x++){
      if (!inPoly(x+.5, y+.5, hull)) continue; const i = y*w+x; if (sea[i]) continue; dArea++; if (!mask[i]) landA++;
      if ((x > 0 && sea[i-1]) || (x < w-1 && sea[i+1]) || (y > 0 && sea[i-w]) || (y < h-1 && sea[i+w])) shore.push(i);
    }
  }
  const sh = new Uint8Array(w*h); shore.forEach(i => sh[i] = 1); const fd = shore.length > 50 ? fractalDim(sh, w, h) : {D:NaN, r2:NaN};
  const res = {apex: ap, mouths, hull, sea, bif, dlinks, dists, opening: opening2, area: dArea, land: landA, shoreLen: shore.length*Math.PI/4, fd, Wc};
  G.delta = res;
  if (quiet) return res;
  showRes("delta", [
    SEC("Distributary network"),
    R("Mouths", U.N(mouths.length, 0), "where channels reach open water"),
    R("Bifurcations below the apex", U.N(bif, 0)),
    R("Distributary links", U.N(dlinks, 0)),
    SEC("Delta form"),
    R("Apex to mouth (median)", U.L(median(dists))), R("Apex to farthest mouth", U.L(Math.max(...dists, 0))),
    R("Opening angle", U.D(opening2), "angular spread of the mouths seen from the apex"),
    R("Delta area", U.A(dArea), "convex hull of apex and mouths, excluding open water"),
    R("Land fraction", U.P(landA/Math.max(1, dArea)), "land ÷ (land + channels) on the delta plain"),
    R("Shoreline length", U.L(res.shoreLen)), R("Shoreline fractal dimension", U.N(fd.D, 3), "rougher shorelines suggest river-dominated, lobate deltas; smooth arcs suggest wave reworking"),
    R("Channel width used", U.L(Wc)),
  ]);
  rebuildOverlay(); return res;
}

/* ---------- braided rivers ---------- */
function analyzeBraid(){
  const P = prepNetwork(), w = G.w, h = G.h;
  if (!G.chan) analyzeChannel();
  const W = G.chan.W, plain = fillHoles(closing(P.net, w, h, Math.max(2, 1.5*W)), w, h, w*h);
  const barsM = new Uint8Array(w*h); for (let i = 0; i < barsM.length; i++) barsM[i] = plain[i] && !G.mask[i] ? 1 : 0;
  const bl = label(barsM, w, h), bars = bl.comps.filter(c => c.area >= Math.max(9, .5*W*W));
  const keep = new Set(bars.map(b => b.id)); for (let i = 0; i < barsM.length; i++) barsM[i] = keep.has(bl.L[i]) ? 1 : 0;
  const dPlain = edtTo(notMask(plain), w, h), c = G.chan, counts = [], pw = [];
  const stepI = Math.max(1, Math.round(2*W/1.2));
  for (let i = 2; i < c.pts.length-2; i += stepI){
    const x = c.pts[i][0], y = c.pts[i][1], half = Math.max(2*W, 1.15*dPlain[Math.round(y)*w + Math.round(x)]);
    pw.push(2*dPlain[Math.round(y)*w + Math.round(x)]);
    let tx = c.xs[Math.min(i+2, c.xs.length-1)] - c.xs[i-2], ty = c.ys[Math.min(i+2, c.ys.length-1)] - c.ys[i-2]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let cnt = 0, pw2 = 0; for (let t = -half; t <= half; t += .7){ const px = Math.round(x - ty*t), py = Math.round(y + tx*t); const wet = px >= 0 && py >= 0 && px < w && py < h && G.mask[py*w+px] ? 1 : 0; if (wet && !pw2) cnt++; pw2 = wet; }
    counts.push(cnt);
  }
  let skLen = 0; for (const v of P.sk) skLen += v;
  let wetA = 0, plA = 0; for (let i = 0; i < plain.length; i++) if (plain[i]){ plA++; if (G.mask[i]) wetA++; }
  const el = bars.map(b => { const mx = b.sx/b.area, my = b.sy/b.area, a = b.sxx/b.area - mx*mx + 1/12, cc = b.syy/b.area - my*my + 1/12, bb = b.sxy/b.area - mx*my, tr = (a+cc)/2, dd = Math.sqrt(((a-cc)/2)**2 + bb*bb); return {el: Math.sqrt((tr+dd)/Math.max(1e-6, tr-dd)), th: .5*Math.atan2(2*bb, a-cc), cx: mx, cy: my}; });
  // bar orientation vs local flow
  const dev = [];
  for (const b of el){ let bi = 0, bd = Infinity; for (let i = 0; i < c.pts.length; i += 3){ const d = (c.pts[i][0]-b.cx)**2 + (c.pts[i][1]-b.cy)**2; if (d < bd){ bd = d; bi = i; } }
    const i0 = Math.max(0, bi-3), i1 = Math.min(c.xs.length-1, bi+3), fl = Math.atan2(c.ys[i1]-c.ys[i0], c.xs[i1]-c.xs[i0]); let d = Math.abs(((b.th - fl)*180/Math.PI) % 180); if (d > 90) d = 180 - d; if (b.el > 1.5) dev.push(d); }
  G.braid = {plain, bars: barsM};
  const len = c.axisLen || c.len;
  showRes("braid", [
    SEC("Braiding"),
    R("Channel count index (full braidplain)", U.N(mean(counts), 2), "mean wet channels crossed by transects spanning the whole braidplain"),
    R("Total sinuosity", U.N(skLen/Math.max(1, len), 2), "all channel length ÷ braidplain axis length"),
    R("Median braidplain width", U.L(median(pw))), R("Braidplain width ÷ main channel width", U.N(median(pw)/W, 1)),
    R("Wetted fraction", U.P(wetA/Math.max(1, plA)), "water ÷ braidplain area"),
    SEC("Bars and islands"),
    R("Bars", U.N(bars.length, 0)), R("Bars per km of braidplain", G.pxm ? U.N(bars.length/(len*G.pxm/1000), 2) : U.N(bars.length/len*1000, 2, "per 1000 px")),
    R("Median bar area", U.A(median(bars.map(b => b.area)))), R("Median bar elongation", U.N(median(el.map(b => b.el)), 2)),
    R("Bar axis vs flow (median)", U.D(median(dev)), "0° = bars aligned with flow, 90° = across it"),
  ]);
  rebuildOverlay();
}

/* ---------- pattern field (dunes, ridges) ---------- */
function analyzeField(){
  const r = roiOrFull(), rw = r.x1-r.x0, rh = r.y1-r.y0, T = Math.round(clamp(Math.min(rw, rh)/3.2, 96, 256)), tiles = [];
  for (let y = r.y0; y + T <= r.y1; y += Math.round(T*.75)) for (let x = r.x0; x + T <= r.x1; x += Math.round(T*.75)){
    try { const q = analyzePattern({x0:x, y0:y, x1:x+T, y1:y+T}, true); tiles.push({...q, cx: x+T/2, cy: y+T/2}); } catch(e){}
  }
  if (!tiles.length) throw new Error("Area too small for a pattern map");
  const good = tiles.filter(t => t.prom > 5);
  let C = 0, S = 0; good.forEach(t => { const a = t.crest*Math.PI/90; C += Math.cos(a)*t.prom; S += Math.sin(a)*t.prom; });
  const wsum = good.reduce((s, t) => s + t.prom, 0), Rb = wsum ? Math.hypot(C, S)/wsum : NaN, mT = ((Math.atan2(S, C)*90/Math.PI) + 180) % 180;
  const cstd = Number.isFinite(Rb) && Rb > 0 ? Math.sqrt(-2*Math.log(Rb))*90/Math.PI : NaN;
  G.field = {tiles, T};
  showRes("field", [
    R("Tiles analysed", U.N(tiles.length, 0)), R("Tiles with a clear pattern", U.N(good.length, 0), "prominence over 5"),
    R("Mean crest trend", U.D(ax180(mT)), "prominence-weighted axial mean"), R("Alignment strength", U.N(Rb, 2), "1 = all tiles share one crest direction"),
    R("Crest-trend spread", U.D(cstd), "circular standard deviation; large spreads mean curving, star or mixed dunes"),
    R("Median spacing", U.L(median(good.map(t => t.spacing)))), R("Spacing range (10–90%)", {v:NaN, u:"", s: U.L(quantile(good.map(t => t.spacing), .1)).s + " – " + U.L(quantile(good.map(t => t.spacing), .9)).s}),
  ], `<p class="note">The map shows a crest line for each tile: length grows with spacing, opacity with prominence.</p>`);
  G.hl = "field"; requestDraw();
}

/* ---------- focus modes ---------- */
const FOCUS = {
  auto:    {n:"Auto-detect", d:"Run everything and decide what the landscape is."},
  meander: {n:"Meandering river", d:"Centreline, bends, necks and cutoff risk, oxbow lakes.", prune:15, hyst:12, ridge:true, bridge:14},
  braided: {n:"Braided river", d:"Braidplain, bars, channel count and total sinuosity.", prune:25, hyst:15, ridge:true, bridge:4},
  tidal:   {n:"Tidal channels", d:"Dense creek networks: widening, junction angles, drainage efficiency.", prune:10, hyst:15, ridge:true, bridge:10},
  delta:   {n:"Delta", d:"Distributaries, mouths, apex, opening angle and shoreline.", prune:15, hyst:12, ridge:true, bridge:6},
  coast:   {n:"Shores: coast, lagoon or lake", d:"Shorelines, lagoons, lakes, reclaimed land and how the water's edge changes.", prune:15, hyst:12, ridge:false, bridge:0},
  lakes:   {n:"Lakes & ponds", d:"Lake sizes, shapes, alignment and oxbows.", prune:15, hyst:8, ridge:false, bridge:0},
  submarine:{n:"Seafloor canyons & channels", d:"Ocean-floor (bathymetry) views: canyon and channel paths, tributary gullies, sinuosity and downslope direction."},
  dunes:   {n:"Dunes & bedforms", d:"Spacing and crest-direction map across the image."},
  basin:   {n:"Drainage basin", d:"DEM terrain, flow routing, river profile and steepness."},
};
G.focus = "auto";
function applyFocusSettings(f){
  const c = FOCUS[f]; if (!c) return;
  const set = (id, v) => { const el = $(id); if (!el || v === undefined) return; if (el.type === "checkbox") el.checked = v; else el.value = v; el.dispatchEvent(new Event("input")); };
  set("pruneK", c.prune); set("wHyst", c.hyst); set("wRidge", c.ridge); set("wBridge", c.bridge);
}
function renderFocusChips(){
  document.querySelectorAll(".focuschips").forEach(el => {
    el.innerHTML = Object.entries(FOCUS).map(([k, c]) => `<button class="chip${G.focus === k ? " on" : ""}" data-focus="${k}" title="${c.d}">${c.n}</button>`).join("");
    el.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => { G.focus = b.dataset.focus; renderFocusChips(); $("focusDesc") && ($("focusDesc").textContent = FOCUS[G.focus].d); if (G.D) runAuto(); });
  });
  document.querySelectorAll(".focusdesc").forEach(e => e.textContent = FOCUS[G.focus].d);
  const sel = document.getElementById("labFocus");
  if (sel){ sel.innerHTML = Object.entries(FOCUS).map(([k, c]) => `<option value="${k}" ${G.focus === k ? "selected" : ""}>Focus: ${c.n}</option>`).join(""); sel.onchange = () => { G.focus = sel.value; renderFocusChips(); if (G.D) runAuto(); }; }
}
/** decide the landscape type after the generic analyses */
function detectFocus(){
  if (G.D.kind === "dem") return ["basin", "elevation model loaded"];
  if (G.chan && /delta|distribut/i.test(((G.D && G.D.name) || "") + " " + ((G.place && G.place.caption) || ""))) return ["delta", "the image name mentions a delta"];
  if (G.seafloor) return ["submarine", `ocean-floor shading with ${G.seafloor.systems} incised channel system${G.seafloor.systems > 1 ? "s" : ""}`];
  const c = G.chan, n = G.net;
  if (!G.mask || !c){
    if (G.mask && (G.results.water || []).length){ const sh = G.results.water.find(r => r.k === "Share of analysis area"); if (sh && sh.v > 20) return ["coast", `${sh.s} of the view is open water`]; }
    if (G.lakes && G.lakes.lakes.length >= 10) return ["lakes", `${G.lakes.lakes.length} separate water bodies, no channel`];
    if (G.pattern && G.pattern.prom > 8 && G.arid) return ["dunes", `arid scene with a regular pattern (prominence ${G.pattern.prom.toFixed(0)})`];
    if (G.pattern && G.pattern.prom > 8) return ["auto", `regular pattern (prominence ${G.pattern.prom.toFixed(0)}) such as fields, streets or ridges; choose Dunes & bedforms to map it`];
    return ["auto", "no channel or strong pattern found"];
  }
  if (c.W > .035*Math.min(G.w, G.h)) return ["coast", `the main water is ${(100*c.W/Math.min(G.w, G.h)).toFixed(0)}% of the image wide: a lagoon, bay or estuary rather than a river channel`];
  const d = analyzeDelta(true);
  if (d && d.mouths.length >= 3 && d.bif >= 2) return ["delta", `${d.mouths.length} channel mouths into open water`];
  const sin = c.len/c.straight;
  if (c.Lb && c.convR2 > .4 && c.wOut/c.wHead > 3 && n && n.maxO >= 3) return ["tidal", `strong seaward widening (×${(c.wOut/c.wHead).toFixed(1)}) in a branching network`];
  if (sin >= 1.5) return ["meander", `sinuosity ${sin.toFixed(2)}`];
  if (c.cci >= 1.5 && n && n.loops >= 5) return ["braided", `channel count index ${c.cci.toFixed(2)}, ${n.loops} loops, low sinuosity ${sin.toFixed(2)}`];
  if (n && n.loops >= 8 && n.maxO >= 3) return ["tidal", `${n.loops} interconnected loops in a dense network`];
  if (c.Lb && c.convR2 > .4 && c.wOut/c.wHead > 3) return ["tidal", `strong seaward widening (×${(c.wOut/c.wHead).toFixed(1)})`];
  if (sin >= 1.3) return ["meander", `sinuosity ${sin.toFixed(2)}`];
  return ["meander", "single channel"];
}

/** label every channel pixel: 1 main stem, 2 other channels in the main network, 3 oxbows, 5 separate channel-like bodies */
function classifyChannels(res, P, oxbows){
  const w = G.w, h = G.h, N = w*h, cc = new Uint8Array(N), sc = G.pxm || 1;
  const thick = (i, v) => { const x = i % w, y = (i/w)|0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const nx = x+dx, ny = y+dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h){ const q = ny*w+nx; if (!cc[q] || cc[q] > v) cc[q] = v; } } };
  const mainPix = new Uint8Array(N); res.pts.forEach(p => mainPix[Math.round(p[1])*w + Math.round(p[0])] = 1);
  const nearMain = dilate(mainPix, w, h, Math.max(2, res.W*.6));
  let other = 0, sep = 0, nSep = 0, ox = 0;
  { // other channels in the network: keep only branches longer than 6 channel widths (drops town/clearing clutter)
    const sub = new Uint8Array(N); for (let i = 0; i < N; i++) sub[i] = P.sk[i] && !nearMain[i] ? 1 : 0;
    const LabI = ensureLab(G.D), mL = [0, 0, 0], sq = [0, 0, 0]; let nm = 0;
    res.pts.forEach(p => { const i = Math.round(p[1])*w + Math.round(p[0]); nm++; for (let k = 0; k < 3; k++){ mL[k] += LabI[i*3+k]; sq[k] += LabI[i*3+k]**2; } });
    for (let k = 0; k < 3; k++) mL[k] /= nm;
    const sdL = Math.sqrt([0,1,2].reduce((s2, k) => s2 + Math.max(0, sq[k]/nm - mL[k]**2)*(k ? 1 : .36), 0)), dLim = Math.max(10, 1.5*sdL);
    const gr = buildGraph(sub, w, h), keepPix = new Uint8Array(N);
    // blob test: how much of the neighbourhood (radius ≈ 2.5 W) is water; channels are thin lines (low fill), towns and clearings are blobs
    const mf = new Float32Array(N); for (let i = 0; i < N; i++) mf[i] = G.mask[i];
    const r0 = Math.max(3, Math.round(1.2*res.W)); let fill = boxBlurF(mf, w, h, r0); fill = boxBlurF(fill, w, h, r0);
    for (const l of gr.links){
      if (l.len < 6*res.W) continue;
      const ws = l.pix.map(p => 2*P.halfW[p]); if (median(ws) < .3*res.W) continue;
      const blobby = l.pix.filter(p => fill[p] > .5).length/l.pix.length; if (blobby > .4) continue;
      { let a0 = 0, a1 = 0, a2 = 0; for (const p of l.pix){ a0 += LabI[p*3]; a1 += LabI[p*3+1]; a2 += LabI[p*3+2]; } const n0 = l.pix.length;
        const dE = Math.sqrt(((a0/n0 - mL[0])*.6)**2 + (a1/n0 - mL[1])**2 + (a2/n0 - mL[2])**2); if (dE > dLim) continue; }
      l.pix.forEach(p => keepPix[p] = 1);
    }
    // grow kept links back over their junction pixels
    for (let i = 0; i < N; i++) if (keepPix[i]){ thick(i, 2); other++; }
  }
  const {L, comps} = label(G.mask, w, h), oxIds = new Set(oxbows.map(o => o.id));
  const hwAll = edtTo(notMask(G.mask), w, h), want = new Map();
  for (const c of comps){ if (c.id === P.cid || c.area < 40) continue; want.set(c.id, {area: c.area, hs: 0}); }
  for (let i = 0; i < N; i++){ const e = want.get(L[i]); if (e) e.hs += hwAll[i]; }
  const keep = new Map(); for (const [id, e] of want){ const wd = 2*e.hs/e.area, len = e.area/Math.max(.5, wd); if (oxIds.has(id)) keep.set(id, 3); else if (len/Math.max(1, wd) > 8 && len > 10*res.W && wd > .35*res.W) keep.set(id, 5); }
  if (keep.size){ const sub = new Uint8Array(N); for (let i = 0; i < N; i++) if (keep.has(L[i])) sub[i] = 1; const sk = thin(sub, w, h);
    for (let i = 0; i < N; i++) if (sk[i]){ const v = keep.get(L[i]); thick(i, v); if (v === 3) ox++; else sep++; } }
  for (const v of keep.values()) if (v === 5) nSep++;
  res.pts.forEach(p => { const i = Math.round(p[1])*w + Math.round(p[0]); cc[i] = 1; });
  G.chanCls = cc; G.chanStats = {main: res.len, other, sep, nSep, ox, nOx: oxbows.length};
}
