
/* ===================== Earthform Lens — distributary channel networks (fans and deltas) =====================
   Channel ordering and morphometrics after Gezovich, Plink-Björklund & Henry (2026, Earth Surf. Dynam. 14, 211–231):
   order rises by one at each bifurcation whose branches do not merge downstream (Dong et al., 2016); per channel: length l(o,j)
   between nodes, widths w(o,j,i|h|f) just after the node, at mid-length and just before the next node; bifurcation angle θ(o,j)
   between the two channels with limbs as long as the upstream channel's final width (Coffey & Shaw, 2017); widths and lengths
   normalised by the initial width of the first-order channel. */
const DN_METHOD = "efl-dnet-1.0";
const ORDC = ["#e31a1c", "#ff8c00", "#ffe119", "#8ee04f", "#2ca02c", "#3fe0c5", "#4fc3f7", "#1f4fd8", "#8e24aa", "#f4a6c8", "#9e9e9e", "#795548"];
const ordCol = o => ORDC[Math.min(ORDC.length - 1, Math.max(0, o - 1))];
const DNREF = {src: "Gezovich et al. (2026)", delta: {theta: 74.0, ci: 1.9, n: 527, Ln: 17.18, Wn: .40}, fan: {theta: 55.0, ci: 2.0, n: 520, Ln: 147.09, Wn: .26}};
XR.dn = null; XR.dnList = []; XR.dnMode = null; XR.dnShow = {labels: false, angles: true, ticks: false, loops: true, legend: true};
XR.dnOpt = Object.assign({canals: false, ignoreDir: false, limb: "width", limbM: 100, snapM: 30}, (() => { try { return JSON.parse(localStorage.getItem("efl.dnopt")) || {}; } catch(_){ return {}; } })());
const dnSaveOpt = () => { try { localStorage.setItem("efl.dnopt", JSON.stringify(XR.dnOpt)); } catch(_){} };

/* ---------- 1. getting the lines ---------- */
async function dnFromView(){
  if (!xmap) return; const [w, h] = xmap.size(), a = xmap.toGeo(0, 0), b = xmap.toGeo(w, h), s = Math.min(a[0], b[0]), n = Math.max(a[0], b[0]), W = Math.min(a[1], b[1]), E = Math.max(a[1], b[1]);
  const diag = hav([s, W], [n, E]); let bb = [s, W, n, E];
  if (diag > 300){ const c = xmap.toGeo(w/2, h/2), dl = 1, dn = 1/Math.cos(c[0]*D2R); bb = [c[0] - dl*.5, c[1] - dn*.5, c[0] + dl*.5, c[1] + dn*.5]; toast(`The view is ${nf(diag)} km across: mapping the ~110 km around the centre. Zoom onto the fan or delta for a tighter area.`, 5000); }
  await dnFetchBox(bb, "OpenStreetMap waterways in view", null, "Network in view");
}
async function dnFetchBox(bb, src, apex, name){
  const [s, W, n, E] = bb;
  const types = XR.dnOpt.canals ? "river|stream|canal|drain|ditch|tidal_channel|distributary" : "river|stream|tidal_channel|distributary";
  actSet("dn", "Channel network: loading waterways…"); dnMsg("Loading the mapped waterways from OpenStreetMap…", "busy");
  try { const d = await overpass(`[out:json][timeout:120];way["waterway"~"^(${types})$"](${s},${W},${n},${E});out body geom;`);
    const lines = (d.elements || []).filter(e => e.type === "way" && e.geometry && e.geometry.length > 1).map(e => ({id: "w" + e.id, nodes: e.nodes && e.nodes.length === e.geometry.length ? e.nodes.map(String) : null, pts: e.geometry.map(g => [g.lat, g.lon]), tags: e.tags || {}}));
    if (!lines.length) throw new Error("OpenStreetMap has no mapped waterways here. Digitise the channels by hand (✎) or open a file of lines.");
    dnStart({name, src, lines, directed: !XR.dnOpt.ignoreDir, osm: true, apex});
  } catch(e){ dnMsg(esc(e.message), "err"); xstatus("Channel network: " + esc(e.message), "err"); } finally { actEnd("dn"); }
}
async function dnFromRiver(){
  const R = XR.river; if (!R) return toast("Load a river first");
  const D = R.delta && !R.delta.single ? R.delta : (R.graph ? analyzeDeltaX(R) : null);
  // the whole delta (or the lower river) area: every mapped waterway there, ordered from the delta apex
  const apex = D && D.apex ? D.apex : null, pts = apex ? [apex, ...(D.mouthPts || []), R.main[R.main.length - 1]] : R.main.slice(Math.floor(R.main.length*.8));
  let a = 90, b = -90, c = 180, d = -180; for (const p of pts){ a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); } const pad = Math.max(.05, (b - a)*.15, (d - c)*.15);
  if (hav([a, c], [b, d]) < 400){ await dnFetchBox([a - pad, c - pad, b + pad, d + pad], `OpenStreetMap waterways of the ${R.name} ${apex ? "delta" : "lower course"}`, apex || null, R.name + (apex ? " delta" : " lower course")); if (XR.dn && XR.dn.segs){ if (!apex) dnMsg(`No delta apex was found on ${esc(R.name)}: the apex was placed automatically. Tap <b>Set apex</b> on the point where the channel first splits.`, "ok"); return; } }
  if (!R.graph) return; const {out, coord} = R.graph, lines = [];
  for (const [a, bs] of out) for (const b of bs) if (coord.has(a) && coord.has(b)) lines.push({id: a + ">" + b, nodes: [String(a), String(b)], pts: [coord.get(a), coord.get(b)], tags: {}});
  dnStart({name: R.name + " distributaries", src: `OpenStreetMap (${R.osm})`, lines, directed: !XR.dnOpt.ignoreDir, osm: true, apex: D && D.apex ? D.apex : null});
}
function dnMsg(t, kind){ XR.dnMsgT = t ? {t, kind} : null; const m = $("dnMsg"); if (m){ m.className = "x10msg " + (kind || ""); m.innerHTML = t || ""; m.style.display = t ? "" : "none"; } }
async function dnFromFile(f){
  try { const t = await f.text(); let L = [];
    if (/\.(geo)?json$/i.test(f.name) || /^\s*\{/.test(t)){ const j = JSON.parse(t), feats = j.type === "FeatureCollection" ? j.features : [j];
      for (const ft of feats){ const g = ft.geometry || ft, tags = ft.properties || {}; if (!g) continue; const ls = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []; for (const c of ls) if (c.length > 1) L.push({pts: c.map(q => [q[1], q[0]]), tags}); } }
    else { const doc = new DOMParser().parseFromString(t, "application/xml"); if (doc.querySelector("gpx")){ for (const tr of doc.querySelectorAll("trk, rte")){ const P = [...tr.querySelectorAll("trkpt, rtept")].map(e => [+e.getAttribute("lat"), +e.getAttribute("lon")]); if (P.length > 1) L.push({pts: P, tags: {}}); } }
      else for (const c of doc.getElementsByTagName("coordinates")){ const P = c.textContent.trim().split(/\s+/).map(q => q.split(",").map(Number)).filter(q => q.length > 1).map(q => [q[1], q[0]]); if (P.length > 1) L.push({pts: P, tags: {}}); } }
    L = L.filter(l => l.pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))); if (!L.length) throw new Error("no lines found in the file");
    L.forEach((l, i) => l.id = "f" + i); dnStart({name: f.name.replace(/\.[^.]+$/, ""), src: "your file " + f.name, lines: L, directed: false});
  } catch(e){ xstatus("Channel network file: " + esc(e.message), "err"); }
}
function dnStart(o){
  XR.dn = {name: o.name, src: o.src, lines: o.lines, directed: o.directed, osm: !!o.osm, apex: o.apex || null, segs: null, made: new Date().toISOString()};
  if (!XR.dn.apex){ const ap = dnGuessApex(XR.dn); XR.dn.apex = ap; XR.dn.apexGuess = true; }
  try { dnBuildChecked();
    dnMsg(`<b>${XR.dn.segs.length} channels in ${XR.dn.maxOrder} orders</b> are drawn on the map, coloured by order.${XR.dn.dirNote ? " " + XR.dn.dirNote : ""}${XR.dn.apexGuess ? " The apex (white triangle) was placed automatically: check it, or tap <b>Set apex</b>." : ""} <a href="#" id="dnSeeMap">Show on map ↑</a>`, "ok");
  } catch(e){ console.error(e); dnMsg(esc(e.message), "err"); xstatus("Channel network: " + esc(e.message), "err"); }
  dnShowPanel(); if (xmap){ const all = XR.dn.lines.flatMap(l => l.pts); xmap.fit(all.filter((_, i) => i % Math.max(1, Math.floor(all.length/3000)) === 0)); xmap.req(); }
  if (innerWidth < 760){ const mb = document.querySelector(".xmapbox"); if (mb) mb.scrollIntoView({behavior: "smooth", block: "start"}); }
  xstatus(`Channel network: ${XR.dn.segs ? XR.dn.segs.length + " channels in " + XR.dn.maxOrder + " orders" : "built"}. ${XR.dn.apexGuess ? "The apex was placed automatically — check it, or tap <b>Set apex</b>." : ""} Then press <b>Measure widths</b>.`, "ok");
}
/* the apex is guessed as the upstream end with the most network downstream of it (or the single entry point of mapped flow) */
function dnGuessApex(N){
  const G = dnGraph(N); if (N.directed){ const indeg = new Map(); for (const [a, bs] of G.out) for (const b of bs) indeg.set(b, (indeg.get(b) || 0) + 1); const src = [...G.coord.keys()].filter(k => !indeg.get(k) && (G.out.get(k) || []).length);
    let best = null, bn = -1; for (const s of src){ const seen = new Set([s]), st = [s]; while (st.length){ const n = st.pop(); for (const m of G.out.get(n) || []) if (!seen.has(m)){ seen.add(m); st.push(m); } } if (seen.size > bn){ bn = seen.size; best = s; } } if (best) return G.coord.get(best); }
  // undirected: the end node farthest from the centroid of all ends, on the narrow side (fewest ends nearby)
  const ends = [...G.adj.keys()].filter(k => G.adj.get(k).size === 1), P = ends.map(k => G.coord.get(k)); if (!P.length) return N.lines[0].pts[0];
  const c = [P.reduce((s, p) => s + p[0], 0)/P.length, P.reduce((s, p) => s + p[1], 0)/P.length], r = median(P.map(p => hav(p, c)));
  let best = P[0], bs = -Infinity; for (const p of P){ const near = P.filter(q => hav(q, p) < r*.5).length, sc = hav(p, c)/r - near/P.length*3; if (sc > bs){ bs = sc; best = p; } } return best;
}

/* ---------- 2. graph: snapped nodes, adjacency, flow direction ---------- */
function dnGraph(N){
  const coord = new Map(), out = new Map(), adj = new Map(), edgeTags = new Map(), tol = XR.dnOpt.snapM/1000;
  const addAdj = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
  const addOut = (a, b) => { const o = out.get(a) || out.set(a, []).get(a); if (!o.includes(b)) o.push(b); };
  if (N.lines.every(l => l.nodes)){
    for (const l of N.lines){ l.nodes.forEach((k, i) => coord.set(k, l.pts[i])); for (let i = 0; i + 1 < l.nodes.length; i++){ const a = l.nodes[i], b = l.nodes[i + 1]; if (a === b) continue; addAdj(a, b); addOut(a, b); edgeTags.set(a + "|" + b, l.tags); edgeTags.set(b + "|" + a, l.tags); } }
  } else {
    // vertices keyed by rounded coordinates; line ends snapped to the nearest vertex of another line within the tolerance
    const key = p => p[0].toFixed(6) + "," + p[1].toFixed(6), cell = tol/111, grid = new Map(), gk = p => Math.floor(p[0]/cell) + ":" + Math.floor(p[1]/cell/Math.max(.2, Math.cos(p[0]*D2R)));
    N.lines.forEach((l, li) => l.pts.forEach((p, vi) => { const g = gk(p); (grid.get(g) || grid.set(g, []).get(g)).push([li, vi, p]); }));
    const snapped = N.lines.map(l => l.pts.map(p => p.slice()));
    N.lines.forEach((l, li) => { for (const vi of [0, l.pts.length - 1]){ const p = l.pts[vi], [gx, gy] = gk(p).split(":").map(Number); let best = null, bd = tol;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [lj, vj, q] of grid.get((gx + dx) + ":" + (gy + dy)) || []){ if (lj === li) continue; const d = hav(p, q); if (d < bd){ bd = d; best = q; } }
      if (best) snapped[li][vi] = best.slice(); } });
    N.lines.forEach((l, li) => { const ks = snapped[li].map(key); snapped[li].forEach((p, i) => coord.set(ks[i], p)); for (let i = 0; i + 1 < ks.length; i++){ if (ks[i] === ks[i + 1]) continue; addAdj(ks[i], ks[i + 1]); addOut(ks[i], ks[i + 1]); edgeTags.set(ks[i] + "|" + ks[i + 1], l.tags); edgeTags.set(ks[i + 1] + "|" + ks[i], l.tags); } });
  }
  return {coord, out, adj, edgeTags};
}
const dnNearestNode = (G, ll) => { let best = null, bd = Infinity; for (const [k, p] of G.coord){ const d = hav(p, ll); if (d < bd){ bd = d; best = k; } } return [best, bd]; };

/* ---------- 3. ordering: channels between bifurcations whose branches never rejoin ---------- */
function dnBuild(){
  const N = XR.dn, G = dnGraph(N), [apexK, apexD] = dnNearestNode(G, N.apex); if (!apexK) throw new Error("no channels");
  N.apexNode = apexK; N.apex = G.coord.get(apexK); N.apexSnap = apexD;
  // downstream graph from the apex: mapped flow direction, or away from the apex along the network (shortest path)
  const down = new Map(), dist = new Map([[apexK, 0]]);
  if (N.directed){ const st = [apexK]; while (st.length){ const n = st.pop(); for (const m of G.out.get(n) || []){ (down.get(n) || down.set(n, []).get(n)).push(m); if (!dist.has(m)){ dist.set(m, 0); st.push(m); } } } }
  if (!N.directed || (down.get(apexK) || []).length === 0){ N.directed = false; down.clear(); dist.clear(); dist.set(apexK, 0);
    const H = [[0, apexK]], push = x => { H.push(x); let i = H.length - 1; while (i){ const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } }, pop = () => { const t = H[0], l = H.pop(); if (H.length){ H[0] = l; let i = 0; for (;;){ const a = 2*i + 1, b = a + 1; let m = i; if (a < H.length && H[a][0] < H[m][0]) m = a; if (b < H.length && H[b][0] < H[m][0]) m = b; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return t; }, done = new Set();
    while (H.length){ const [d, n] = pop(); if (done.has(n)) continue; done.add(n); for (const m of G.adj.get(n) || []){ const nd = d + hav(G.coord.get(n), G.coord.get(m)); if (nd < (dist.get(m) ?? Infinity)){ dist.set(m, nd); push([nd, m]); } } }
    for (const [n, ms] of G.adj) for (const m of ms) if ((dist.get(m) ?? -1) > (dist.get(n) ?? Infinity)) (down.get(n) || down.set(n, []).get(n)).push(m); }
  // reachable outlets of every node (topological order; capped sets)
  const nodes = [...dist.keys()], indeg = new Map(nodes.map(n => [n, 0])); for (const n of nodes) for (const m of down.get(n) || []) indeg.set(m, (indeg.get(m) || 0) + 1);
  const ord = [], dg = new Map(indeg), q = nodes.filter(n => !dg.get(n)); while (q.length){ const n = q.pop(); ord.push(n); for (const m of down.get(n) || []){ dg.set(m, dg.get(m) - 1); if (!dg.get(m)) q.push(m); } }
  const terms = nodes.filter(n => !(down.get(n) || []).length), ti = new Map(terms.map((n, i) => [n, i])), reach = new Map(), dlen = new Map();
  for (let t = ord.length - 1; t >= 0; t--){ const n = ord[t]; let s = ti.has(n) ? [ti.get(n)] : [], L = 0; for (const m of down.get(n) || []){ const r = reach.get(m); if (r){ for (const v of r) if (s.length < 600 && !s.includes(v)) s.push(v); } L = Math.max(L, (dlen.get(m) || 0) + hav(G.coord.get(n), G.coord.get(m))); } reach.set(n, s); dlen.set(n, L); }
  // group a node's downstream neighbours into branches that never meet again (disjoint outlet sets)
  const clusters = n => { const ch = (down.get(n) || []).filter(m => (reach.get(m) || []).length); const C = []; for (const m of ch){ const rm = new Set(reach.get(m)); let hit = C.filter(c => c.set.size && [...rm].some(v => c.set.has(v)));
      if (!hit.length) C.push({mem: [m], set: rm}); else { const c0 = hit[0]; c0.mem.push(m); rm.forEach(v => c0.set.add(v)); for (const c of hit.slice(1)){ c.mem.forEach(x => c0.mem.push(x)); c.set.forEach(v => c0.set.add(v)); C.splice(C.indexOf(c), 1); } } } return C; };
  const pickMain = (c, prev) => c.mem.slice().sort((a, b) => (reach.get(b).length - reach.get(a).length) || (dlen.get(b) - dlen.get(a)))[0];
  const segs = [], bifs = [], loops = [], used = new Set(), usedN = new Set([apexK]);
  const trace = (start, first, order, parent) => {
    const nodesS = [start, first], nset = new Set(nodesS), seg = {id: segs.length, order, parent, children: [], nodes: nodesS}; segs.push(seg); used.add(start + ">" + first);
    let cur = first, guard = 0;
    while (guard++ < 1e6){ const C = clusters(cur);
      if (C.length === 0){ seg.end = "outlet"; break; }
      if (C.length === 1){ const m = pickMain(C[0]); for (const x of C[0].mem) if (x !== m) loops.push([cur, x]); if (used.has(cur + ">" + m) || nset.has(m) || usedN.has(m)){ seg.end = "rejoins"; break; } used.add(cur + ">" + m); nodesS.push(m); nset.add(m); usedN.add(m); cur = m; continue; }
      seg.end = "bifurcation"; const kids = C.map(c => { const m = pickMain(c); for (const x of c.mem) if (x !== m) loops.push([cur, x]); return m; });
      const B = {node: cur, ll: G.coord.get(cur), parent: seg.id, order, children: []}; bifs.push(B);
      for (const m of kids){ if (used.has(cur + ">" + m)) continue; const ch = trace(cur, m, order + 1, seg.id); seg.children.push(ch.id); B.children.push(ch.id); }
      break; }
    return seg; };
  const C0 = clusters(apexK); if (!C0.length) throw new Error("no channel leaves the apex: move the apex onto the network");
  if (C0.length === 1) trace(apexK, pickMain(C0[0]), 1, null);
  else { // the apex itself is a bifurcation: a zero-length first-order channel
    const s0 = {id: 0, order: 1, parent: null, children: [], nodes: [apexK], end: "bifurcation", zero: true}; segs.push(s0); const B = {node: apexK, ll: G.coord.get(apexK), parent: 0, order: 1, children: []}; bifs.push(B);
    for (const c of C0){ const m = pickMain(c); const ch = trace(apexK, m, 2, 0); s0.children.push(ch.id); B.children.push(ch.id); } }
  // geometry and indices
  for (const s of segs){ s.pts = s.nodes.map(k => G.coord.get(k)); s.cum = withCum(s.pts); s.L = s.cum[s.cum.length - 1]; const ch = s.pts.length > 1 ? hav(s.pts[0], s.pts[s.pts.length - 1]) : 0; s.straight = ch; s.sin = ch > 0 ? s.L/ch : NaN;
    const t = s.nodes.length > 1 ? G.edgeTags.get(s.nodes[0] + "|" + s.nodes[1]) || {} : {}; s.name = t.name || ""; s.wtag = median(s.nodes.slice(0, -1).map((k, i) => parseFloat((G.edgeTags.get(k + "|" + s.nodes[i + 1]) || {}).width)).filter(Number.isFinite)); }
  const maxO = Math.max(...segs.map(s => s.order)), A = N.apex;
  for (let o = 1; o <= maxO; o++){ const so = segs.filter(s => s.order === o); const brg = s => { const p = s.pts[Math.floor(s.pts.length/2)] || A; return Math.atan2((p[1] - A[1])*Math.cos(A[0]*D2R), p[0] - A[0]); }; so.sort((a, b) => brg(a) - brg(b)).forEach((s, j) => s.j = j + 1); }
  Object.assign(N, {G, segs, bifs, loops: loops.map(([a, b]) => [G.coord.get(a), G.coord.get(b)]), maxOrder: maxO, terms: terms.length, nodesN: nodes.length, unreached: G.coord.size - nodes.length});
  // carry over widths entered by hand on the same channel (same ends)
  if (N.manual) for (const s of segs){ const m = N.manual[s.nodes[0] + ">" + s.nodes[s.nodes.length - 1]]; if (m) Object.assign(s, m); }
  dnAngles(); dnSummary();
}

/* ---------- 4. bifurcation angles (limbs as long as the upstream channel's final width) ---------- */
function ptAlong(s, d, fromEnd){ const L = s.L; if (!(L > 0)) return s.pts[0]; const t = fromEnd ? Math.max(0, L - d) : Math.min(L, d); let i = 1; while (i < s.cum.length - 1 && s.cum[i] < t) i++; const a = s.pts[i - 1], b = s.pts[i], f = (t - s.cum[i - 1])/((s.cum[i] - s.cum[i - 1]) || 1); return [a[0] + (b[0] - a[0])*f, a[1] + (b[1] - a[1])*f]; }
function dnAngles(){
  const N = XR.dn; if (!N || !N.segs) return;
  for (const B of N.bifs){ const P = N.segs[B.parent], kids = B.children.map(i => N.segs[i]).filter(s => s.L > 0); B.theta = NaN; B.pairs = [];
    const wf = Number.isFinite(P.wf) ? P.wf : Number.isFinite(P.wmean) ? P.wmean : NaN;
    const limb = XR.dnOpt.limb === "fixed" ? XR.dnOpt.limbM/1000 : Number.isFinite(wf) ? wf/1000 : clamp(.05*Math.min(...kids.map(s => s.L)), .03, .5); B.limb = limb*1000; B.limbSrc = XR.dnOpt.limb === "fixed" ? "fixed" : Number.isFinite(wf) ? "upstream width" : "no width: 5 % of the shorter channel";
    const dirs = kids.map(s => { const p = ptAlong(s, Math.min(limb, s.L)), [v] = toLocal([p], B.ll[0], B.ll[1]); return {s, a: Math.atan2(v[0], -v[1]), v, far: toLocal([ptAlong(s, Math.min(s.L, Math.max(limb*5, .1*s.L)))], B.ll[0], B.ll[1])[0]}; }).sort((x, y) => x.a - y.a);
    const ang = (u, v) => Math.acos(clamp((u[0]*v[0] + u[1]*v[1])/((Math.hypot(...u)*Math.hypot(...v)) || 1), -1, 1))/D2R;
    for (let i = 0; i + 1 < dirs.length; i++) B.pairs.push({a: dirs[i].s.id, b: dirs[i + 1].s.id, theta: ang(dirs[i].v, dirs[i + 1].v), far: ang(dirs[i].far, dirs[i + 1].far)});
    if (B.pairs.length){ B.theta = B.pairs.length === 1 ? B.pairs[0].theta : median(B.pairs.map(p => p.theta)); B.far = median(B.pairs.map(p => p.far)); B.poly = kids.length > 2; }
    B.j = P.j; }
}

/* ---------- 5. widths at i, h and f along every channel ---------- */
async function dnMeasureWidths(){
  const N = XR.dn; if (!N || !N.segs) return; const segs = N.segs.filter(s => s.L > 0), all = segs.flatMap(s => s.pts);
  let s0 = 90, n0 = -90, w0 = 180, e0 = -180; for (const p of all){ s0 = Math.min(s0, p[0]); n0 = Math.max(n0, p[0]); w0 = Math.min(w0, p[1]); e0 = Math.max(e0, p[1]); }
  actSet("dnw", "Channel network: loading water areas…");
  try {
    let polys;
    if (XR.src.water === "user" && XR.userWater) polys = XR.userWater;
    else { const pad = .01, bb = `${s0 - pad},${w0 - pad},${n0 + pad},${e0 + pad}`;
      const d = await overpass(`[out:json][timeout:180];(way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["natural"="water"](${bb});relation["waterway"="riverbank"](${bb});way["natural"~"^(shoal|sand)$"](${bb}););out geom;`);
      polys = (d.elements || []).map(el => ({bar: !!(el.tags && /^(shoal|sand)$/.test(el.tags.natural || "")), rings: el.type === "way" && el.geometry ? [el.geometry.map(p => [p.lat, p.lon])] : (el.members || []).filter(m => m.geometry && m.role !== "inner").map(m => m.geometry.map(p => [p.lat, p.lon]))})).filter(p => p.rings.length); }
    for (const p of polys){ let a = 90, b = -90, c = 180, d = -180; for (const rg of p.rings) for (const q of rg){ a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); } p.bb = [a, b, c, d]; }
    let i = 0, got = 0;
    for (const s of segs){ i++; if (i % 3 === 0) actSet("dnw", `Channel network: widths ${i} of ${segs.length}`, i/segs.length);
      if (s.wsrc === "entered") continue;
      const fr = s.L < .3 ? [.2, .5, .8] : [Math.min(.15, Math.max(.06, .08/s.L)), .5, 1 - Math.min(.15, Math.max(.06, .08/s.L))], kms = fr.map(f => f*s.L);
      let sb = [90, -90, 180, -180]; for (const p of s.pts){ sb = [Math.min(sb[0], p[0]), Math.max(sb[1], p[0]), Math.min(sb[2], p[1]), Math.max(sb[3], p[1])]; } const pad = .02;
      const near = polys.filter(p => p.bb[1] >= sb[0] - pad && p.bb[0] <= sb[1] + pad && p.bb[3] >= sb[2] - pad && p.bb[2] <= sb[3] + pad);
      let W = [NaN, NaN, NaN], src = "";
      if (near.length){ try { const pr = {main: s.pts, cum: s.cum, L: s.L, osm: "net" + s.id, tribs: [], dams: []}, Rs = await waterRaster(pr, 0, s.L, {polys: near}); const st = measureStations(pr, {}, Rs, kms, {gapCells: 2, orient: 10}); W = st.map(x => x.ok !== false && Number.isFinite(x.w) && x.w > 0 ? x.w : NaN); if (W.some(Number.isFinite)) src = "water areas"; } catch(e){ console.warn(e); } }
      if (!W.some(Number.isFinite) && Number.isFinite(s.wtag)){ W = [s.wtag, s.wtag, s.wtag]; src = "OSM width tag"; }
      [s.wi, s.wh, s.wf] = W; s.wsrc = src || "none"; s.wmean = W.some(Number.isFinite) ? W.filter(Number.isFinite).reduce((a, b) => a + b, 0)/W.filter(Number.isFinite).length : NaN; if (Number.isFinite(s.wmean)) got++;
      if (i % 20 === 0) await new Promise(r => setTimeout(r, 0)); }
    N.widthSrc = XR.src.water === "user" && XR.userWater ? "your water polygons" : "OpenStreetMap water areas"; N.widthsAt = new Date().toISOString();
    dnAngles(); dnSummary(); dnRender(); xmap && xmap.req();
    xstatus(`Channel network: widths for ${got} of ${segs.length} channels from ${N.widthSrc}. ${got < segs.length ? "Channels without mapped water (dry or paleo-channels, small streams) need widths typed into the table — as in the paper, which measured fan widths by hand on imagery." : ""}`, "ok");
  } catch(e){ console.error(e); xstatus("Channel widths: " + esc(e.message), "err"); } finally { actEnd("dnw"); }
}
async function dnElevation(){
  const N = XR.dn; if (!N || !N.segs) return; const segs = N.segs.filter(s => s.L > 0), pts = []; for (const s of segs){ pts.push(s.pts[0], s.pts[s.pts.length - 1]); }
  let ext = 0; for (const p of pts) ext = Math.max(ext, hav(p, N.apex)); const z = ext < 30 ? 13 : ext < 120 ? 12 : ext < 400 ? 11 : 10, zr = new Float64Array(pts.length).fill(NaN), fake = {};
  try { await sampleElev(fake, pts, z, null, zr); segs.forEach((s, i) => { s.z0 = zr[2*i]; s.z1 = zr[2*i + 1]; s.grad = (s.z0 - s.z1)/s.L; }); N.dem = {z, src: fake.demSrc ? fake.demSrc.key : "auto", label: demLabel({z, src: fake.demSrc, res: 40075016*Math.cos(N.apex[0]*D2R)/2**(z + 8)}, true)}; dnSummary(); dnRender(); }
  catch(e){ xstatus("Network elevation: " + esc(e.message), "err"); }
}

/* ---------- 6. network statistics ---------- */
function tq(n){ const T = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09]; return n - 1 < 1 ? NaN : n - 1 <= 20 ? T[n - 2] : n - 1 <= 30 ? 2.05 : n - 1 <= 60 ? 2.0 : 1.97; }
const meanCI = v => { const x = v.filter(Number.isFinite), n = x.length; if (!n) return {n: 0, mean: NaN, ci: NaN, sd: NaN, med: NaN}; const m = x.reduce((a, b) => a + b, 0)/n, sd = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m)**2, 0)/(n - 1)) : NaN; return {n, mean: m, sd, ci: n > 1 ? tq(n)*sd/Math.sqrt(n) : NaN, med: median(x)}; };
function dnSummary(){
  const N = XR.dn; if (!N || !N.segs) return; const S = N.segs, o1 = S.filter(s => s.order === 1 && !s.zero);
  const w0 = (() => { const v = o1.map(s => s.wi).filter(Number.isFinite); if (v.length) return v[0]; const c = S.filter(s => s.parent === 0 && S[0].zero).map(s => s.wi).filter(Number.isFinite); return c.length ? c.reduce((a, b) => a + b, 0) : NaN; })();
  for (const s of S){ s.Ln = Number.isFinite(w0) ? s.L*1000/w0 : NaN; s.Wn = Number.isFinite(w0) ? s.wmean/w0 : NaN; const B = N.bifs.find(b => b.children.includes(s.id)); s.thetaUp = B ? B.theta : NaN; }
  const per = []; for (let o = 1; o <= N.maxOrder; o++){ const so = S.filter(s => s.order === o && !s.zero), bo = N.bifs.filter(b => b.order === o);
    per.push({o, n: so.length, L: meanCI(so.map(s => s.L)), Ln: meanCI(so.map(s => s.Ln)), W: meanCI(so.map(s => s.wmean)), Wn: meanCI(so.map(s => s.Wn)), sin: meanCI(so.map(s => s.sin)), grad: meanCI(so.map(s => s.grad)), theta: meanCI(bo.map(b => b.theta)), nb: bo.length}); }
  const th = meanCI(N.bifs.map(b => b.theta)), thFar = meanCI(N.bifs.map(b => b.far)), hi = S.filter(s => s.order >= 2 && !s.zero);
  const ratio = k => { const v = []; for (let i = 0; i + 1 < per.length; i++){ const a = per[i][k], b = per[i + 1][k]; const x = a && a.mean !== undefined ? a.mean : a, y = b && b.mean !== undefined ? b.mean : b; if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) v.push(y/x); } return v.length ? Math.exp(v.reduce((s, x) => s + Math.log(x), 0)/v.length) : NaN; };
  const allP = S.flatMap(s => s.pts), A = N.apex, LL = toLocal(allP.filter((_, i) => i % Math.max(1, Math.floor(allP.length/4000)) === 0), A[0], A[1]), hull = convexHullX(LL); let area = 0; for (let i = 0; i < hull.length; i++){ const a = hull[i], b = hull[(i + 1) % hull.length]; area += a[0]*b[1] - b[0]*a[1]; } area = Math.abs(area)/2;
  const outl = S.filter(s => s.end === "outlet").map(s => s.pts[s.pts.length - 1]);
  const cons = N.bifs.map(b => { const P = S[b.parent], k = b.children.map(i => S[i].wi); return Number.isFinite(P.wf) && k.every(Number.isFinite) ? k.reduce((a, c) => a + c, 0)/P.wf : NaN; }).filter(Number.isFinite);
  const asym = N.bifs.map(b => { const k = b.children.map(i => S[i].wi).filter(Number.isFinite); return k.length === 2 ? Math.abs(k[0] - k[1])/(k[0] + k[1]) : NaN; }).filter(Number.isFinite);
  const relief = (() => { const z0 = S[0] && Number.isFinite(S[0].z0) ? S[0].z0 : S.filter(s => s.order === 1).map(s => s.z0).find(Number.isFinite), zs = S.filter(s => s.end === "outlet").map(s => s.z1).filter(Number.isFinite); return Number.isFinite(z0) && zs.length ? z0 - median(zs) : NaN; })();
  N.sum = {w0, n: S.filter(s => !s.zero).length, maxOrder: N.maxOrder, nBif: N.bifs.length, nOut: S.filter(s => s.end === "outlet").length, nLoops: N.loops.length, nRejoin: S.filter(s => s.end === "rejoins").length,
    totalL: S.reduce((a, s) => a + (s.L || 0), 0), area, radius: outl.length ? median(outl.map(p => hav(A, p))) : NaN, theta: th, thetaFar: thFar, per,
    Ln: meanCI(hi.map(s => s.Ln)), Wn: meanCI(hi.map(s => s.Wn)), Rb: ratio("n"), Rl: ratio("L"), Rw: ratio("W"), cons: meanCI(cons), asym: meanCI(asym), relief, nW: S.filter(s => Number.isFinite(s.wmean)).length,
    fanSlope: Number.isFinite(relief) && outl.length ? relief/(median(outl.map(p => hav(A, p)))*1000) : NaN};
  N.sum.dens = N.sum.area > 0 ? N.sum.totalL/N.sum.area : NaN; N.sum.cls = dnClassify(N.sum);
}
/* indicative comparison with the 40 deltas and 40 fluvial fans of Gezovich et al. (2026) */
function dnClassify(s){
  const out = [], t = s.theta.mean;
  if (Number.isFinite(t) && s.theta.n >= 3){ const v = t >= 64 ? "delta-like" : t <= 60 ? "fluvial-fan-like" : "ambiguous"; out.push({k: "Mean network angle", v, why: `${nf(t, 1)}° (n = ${s.theta.n}${Number.isFinite(s.theta.ci) ? `, ±${nf(s.theta.ci, 1)}°` : ""}); deltas 74.0 ± 1.9°, fans 55.0 ± 2.0°. In the paper about 15 % of fans average above 60° and about 10 % of deltas below 64°.`}); }
  if (Number.isFinite(s.Ln.mean)){ const lg = Math.log10(s.Ln.mean), v = lg > Math.log10(Math.sqrt(147.09*17.18)) ? "fluvial-fan-like" : "delta-like"; out.push({k: "Mean normalised channel length", v, why: `${nf(s.Ln.mean, 1)} (channel length ÷ first-order width); deltas 17.2, fans 147.1.`}); }
  if (Number.isFinite(s.Wn.mean)){ const v = s.Wn.mean >= .33 ? "delta-like" : "fluvial-fan-like"; out.push({k: "Mean normalised channel width", v, why: `${nf(s.Wn.mean, 2)}; deltas 0.40, fans 0.26.`}); }
  const fan = out.filter(o => o.v === "fluvial-fan-like").length, del = out.filter(o => o.v === "delta-like").length;
  return {items: out, verdict: !out.length ? "not enough measurements" : fan > del ? "closer to fluvial fans" : del > fan ? "closer to river-dominated deltas" : "ambiguous", note: "Indicative only: thresholds from one study of 80 landforms; the paper's mapping was by hand on sub-metre imagery and excluded tidal channels, loops and local avulsions that rejoin."};
}

/* ---------- 7. map ---------- */
function drawNet(ctx, M){
  const N = XR.dn; if (!N || !N.segs) { if (XR.dnMode === "draw" && XR.dnDraw && XR.dnDraw.lines.length + XR.dnDraw.pts.length) dnDrawDraft(ctx, M); return; }
  const sh = XR.dnShow, line = pts => { ctx.beginPath(); pts.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); };
  ctx.save(); ctx.lineCap = ctx.lineJoin = "round";
  if (sh.loops){ ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(160,160,160,.8)"; ctx.lineWidth = 1.5; for (const [a, b] of N.loops) { line([a, b]); ctx.stroke(); } ctx.setLineDash([]); }
  const S = N.segs.slice().sort((a, b) => b.order - a.order);
  for (const s of S){ if (s.L <= 0) continue; const lw = Math.max(1.4, 6.5 - .55*(s.order - 1)); line(s.pts); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = lw + 2; ctx.stroke(); ctx.strokeStyle = ordCol(s.order); ctx.lineWidth = lw; ctx.stroke(); }
  if (sh.ticks) for (const s of N.segs){ if (!(s.L > 0)) continue; [["i", .1], ["h", .5], ["f", .9]].forEach(([k, f]) => { const w = s["w" + k]; if (!Number.isFinite(w)) return; const p = ptAlong(s, f*s.L), p2 = ptAlong(s, Math.min(s.L, f*s.L + .01)), a = M.toScr(p[0], p[1]), b = M.toScr(p2[0], p2[1]), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, half = Math.max(5, w/2/M.mpp()); ctx.beginPath(); ctx.moveTo(a[0] - dy/l*half, a[1] + dx/l*half); ctx.lineTo(a[0] + dy/l*half, a[1] - dx/l*half); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }); }
  if (sh.angles) for (const B of N.bifs){ if (!Number.isFinite(B.theta)) continue; const q = M.toScr(B.ll[0], B.ll[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.2; ctx.stroke();
    if (M.z > 9 || N.bifs.length < 40){ ctx.font = "600 10.5px Inter, sans-serif"; const t = nf(B.theta, 0) + "°"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(t, q[0] + 6, q[1] - 6); ctx.fillStyle = "#fff"; ctx.fillText(t, q[0] + 6, q[1] - 6); } }
  if (sh.labels) for (const s of N.segs){ if (!(s.L > 0)) continue; const p = ptAlong(s, s.L/2), q = M.toScr(p[0], p[1]); ctx.font = "italic 600 11px Inter, sans-serif"; const t = `l${s.order},${s.j}`; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(t, q[0] + 5, q[1] + 4); ctx.fillStyle = ordCol(s.order); ctx.fillText(t, q[0] + 5, q[1] + 4); }
  const a = M.toScr(N.apex[0], N.apex[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 10); ctx.lineTo(a[0] + 8, a[1] + 6); ctx.lineTo(a[0] - 8, a[1] + 6); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke(); ctx.font = "700 11px Inter, sans-serif"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3; ctx.strokeText("Apex", a[0] + 10, a[1] + 4); ctx.fillText("Apex", a[0] + 10, a[1] + 4);
  if (XR.dnSel != null && N.segs[XR.dnSel]){ line(N.segs[XR.dnSel].pts); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
  if (XR.dnMode === "draw") dnDrawDraft(ctx, M);
}
function dnDrawDraft(ctx, M){ const D = XR.dnDraw; if (!D) return; ctx.save(); ctx.strokeStyle = "#ff4dd2"; ctx.lineWidth = 2.5; for (const L of [...D.lines, D.pts]){ ctx.beginPath(); L.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); for (const p of L){ const q = M.toScr(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 7); ctx.fillStyle = "#ff4dd2"; ctx.fill(); } } ctx.restore(); }
{ const _dme = drawMapExtras; drawMapExtras = function(ctx, M, w, h){ try { _dme(ctx, M, w, h); } catch(e){ console.warn(e); } try { drawNet(ctx, M); } catch(e){ console.warn(e); } }; }
{ const _mt2 = mapTap; mapTap = function(sx, sy){ const ll = xmap.toGeo(sx, sy);
    if (XR.dnMode === "apex"){ XR.dn.apex = ll; XR.dn.apexGuess = false; XR.dnMode = null; try { dnBuild(); } catch(e){ xstatus("Channel network: " + esc(e.message), "err"); } dnRender(); xmap.req(); toast("Apex set; channels re-ordered"); return; }
    if (XR.dnMode === "draw"){ const D = XR.dnDraw, ends = D.lines.flatMap(l => [l[0], l[l.length - 1], ...l]); let snap = null, bd = 18; for (const p of ends){ const q = xmap.toScr(p[0], p[1]), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; snap = p; } } D.pts.push(snap ? snap.slice() : ll); dnRenderDrawBar(); xmap.req(); return; }
    if (XR.dn && XR.dn.segs && XR.tab === "dnet"){ let best = null, bd = 16; for (const s of XR.dn.segs) for (let i = 0; i < s.pts.length; i += Math.max(1, Math.floor(s.pts.length/200))){ const q = xmap.toScr(s.pts[i][0], s.pts[i][1]), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; best = s.id; } } if (best != null){ XR.dnSel = best; dnRender(); xmap.req(); const r = document.querySelector(`#dnTable tr[data-s="${best}"]`); if (r) r.scrollIntoView({block: "nearest"}); return; } }
    return _mt2(sx, sy); }; }
/* hand digitising, like the paper's manual tracing */
function dnStartDraw(){ XR.dnMode = "draw"; XR.dnDraw = {lines: [], pts: []}; dnRenderDrawBar(); toast("Tap along a channel; Next line starts another (ends snap to earlier lines); Finish builds the network", 4500); }
function dnRenderDrawBar(){ let b = $("dnDrawBar"); const box = document.querySelector(".xmapbox"); if (!box) return; if (!b){ b = document.createElement("div"); b.id = "dnDrawBar"; b.className = "x7tebar glass"; box.appendChild(b); }
  if (XR.dnMode !== "draw"){ b.style.display = "none"; return; } b.style.display = ""; const D = XR.dnDraw;
  b.innerHTML = `<div class="x7teh"><b>Digitise channels</b><span>${D.lines.length} lines · ${D.pts.length} points in this line</span></div><div class="x7terow"><button class="sm" id="dnUndo">↺ Undo point</button><button class="sm" id="dnNext">Next line</button><button class="sm pri" id="dnFin">✓ Finish</button><button class="sm" id="dnCan">Cancel</button></div><p class="note" style="color:#ddd;margin:0">Trace from upstream to downstream; start a branch by tapping on an existing line.</p>`;
  $("dnUndo").onclick = () => { D.pts.pop(); dnRenderDrawBar(); xmap.req(); }; $("dnNext").onclick = () => { if (D.pts.length > 1) D.lines.push(D.pts); D.pts = []; dnRenderDrawBar(); xmap.req(); };
  $("dnCan").onclick = () => { XR.dnMode = null; XR.dnDraw = null; dnRenderDrawBar(); xmap.req(); };
  $("dnFin").onclick = () => { if (D.pts.length > 1) D.lines.push(D.pts); XR.dnMode = null; const L = D.lines.map((p, i) => ({id: "d" + i, pts: p, tags: {}})); XR.dnDraw = null; dnRenderDrawBar(); if (!L.length) return; dnStart({name: "Digitised network", src: "digitised by hand on " + (EX.base[XR.base].n || "the base map"), lines: L, directed: false, apex: L[0].pts[0]}); }; }

/* ---------- 8. panel ---------- */
function dnShowPanel(){ if (XR.river) showXTab("dnet"); else { dnRender(); const b = $("xNetBox"); if (b) b.scrollIntoView({behavior: "smooth", block: "start"}); } }
function dnTarget(){ if (XR.river) return $("x10-dnet"); let b = $("xNetBox"); if (!b){ const e = $("xEmpty"); if (!e) return null; b = document.createElement("div"); b.id = "xNetBox"; e.parentElement.insertBefore(b, e); } return b; }
const fmtW = v => Number.isFinite(v) ? nf(v, v < 10 ? 1 : 0) : "";
function dnRender(){
  const el = dnTarget(); if (!el) return; const N = XR.dn; if (!XR.river && !N && !XR.dnOpen){ el.innerHTML = ""; return; }
  const o = XR.dnOpt, S = N && N.sum;
  let h = `<div class="card"><h4>Channel network (fans and deltas)</h4><p class="note">Every channel between bifurcations gets an order (1 at the apex, +1 at each bifurcation whose branches never rejoin), a length, widths just after its upstream node (i), at mid-length (h) and just before its downstream node (f), and the angle at the bifurcation it ends in — following Gezovich, Plink-Björklund &amp; Henry (2026). Results for each channel and for the whole network.</p>
    <div class="btns"><button class="sm pri" id="dnView">Map channels in view (OSM)</button>${XR.river ? `<button class="sm" id="dnRiv">Map ${esc(XR.river.name)}'s delta / lower course</button>` : ""}<button class="sm" id="dnDraw">✎ Digitise channels</button><label class="sm filebtn">⇪ Open lines (GeoJSON / KML / GPX)<input type="file" id="dnFile" accept=".json,.geojson,.kml,.gpx,.xml" hidden></label></div>
    <details class="x10opt"><summary>Options</summary><label class="chk"><input type="checkbox" id="dnCan"${o.canals ? " checked" : ""}> Include canals, drains and ditches</label><label class="chk"><input type="checkbox" id="dnDir"${o.ignoreDir ? " checked" : ""}> Ignore mapped flow direction (orient away from the apex)</label>
      <label class="fl">Angle limbs<select id="dnLimb"><option value="width"${o.limb === "width" ? " selected" : ""}>Upstream channel's final width (Coffey &amp; Shaw 2017; paper)</option><option value="fixed"${o.limb === "fixed" ? " selected" : ""}>Fixed length</option></select></label><label class="fl">Fixed limb (m)<input type="number" id="dnLimbM" value="${o.limbM}" min="5" step="5"></label><label class="fl">Snap line ends within (m)<input type="number" id="dnSnap" value="${o.snapM}" min="1" step="1"></label></details>
    <div id="dnMsg" class="x10msg ${XR.dnMsgT ? XR.dnMsgT.kind : ""}"${XR.dnMsgT ? "" : ' style="display:none"'}>${XR.dnMsgT ? XR.dnMsgT.t : ""}</div></div>`;
  if (N && N.segs){
    h += `<div class="card"><h4>${esc(N.name)}</h4><p class="note">Source: ${esc(N.src)}. Apex ${N.apexGuess ? "placed automatically" : "set by you"} at ${nf(N.apex[0], 4)}°, ${nf(N.apex[1], 4)}°. ${N.directed ? "Mapped flow direction used." : "Oriented away from the apex along the network."} ${N.unreached ? `${N.unreached} mapped nodes are not downstream of the apex and are left out.` : ""}</p>
      <div class="btns"><button class="sm" id="dnApex">⌖ Set apex</button><button class="sm pri" id="dnW">Measure widths</button><button class="sm" id="dnZ">Read elevations</button><button class="sm" id="dnSave">＋ Add to network comparison</button><button class="sm" id="dnFig">▦ Network figure</button><button class="sm" id="dnCsv">⬇ CSV</button><button class="sm" id="dnGj">⬇ GeoJSON</button><button class="sm" id="dnClr">Clear</button></div>
      <div class="chips">${[["angles", "Angles"], ["labels", "Labels l(o,j)"], ["ticks", "Width positions"], ["loops", "Excluded loops"]].map(([k, t]) => `<button class="chip${XR.dnShow[k] ? " on" : ""}" data-dns="${k}">${t}</button>`).join("")}</div>
      <div class="x10leg">${Array.from({length: N.maxOrder}, (_, i) => `<span><i style="background:${ordCol(i + 1)};height:${Math.max(2, 7 - .55*i)}px"></i>${i + 1}</span>`).join("")}<small>channel order</small></div></div>`;
    h += `<div class="card"><h4>Whole network</h4><div class="kv x10kv">${[
      ["Channels (segments)", S.n], ["Highest order", S.maxOrder], ["Bifurcations", S.nBif], ["Outlets (terminal channels)", S.nOut], ["Loops / rejoining branches excluded", S.nLoops + S.nRejoin],
      ["Total channel length", km(S.totalL)], ["Network area (convex hull)", nf(S.area, S.area < 10 ? 1 : 0) + " km²"], ["Channel density", nf(S.dens, 2) + " km/km²"], ["Apex → outlet distance (median)", km(S.radius)],
      ["First-order width w(1,1,i) (normaliser)", Number.isFinite(S.w0) ? nf(S.w0) + " m" : "– (measure or type it)"], ["Channels with a width", `${S.nW} of ${S.n}`],
      ["Mean network angle θ", Number.isFinite(S.theta.mean) ? `${nf(S.theta.mean, 1)}° ± ${nf(S.theta.ci, 1)}° (95 %, n = ${S.theta.n})` : "–"], ["Median angle", Number.isFinite(S.theta.med) ? nf(S.theta.med, 1) + "°" : "–"], ["Far-field angle (5 limbs or 10 % of length)", Number.isFinite(S.thetaFar.mean) ? nf(S.thetaFar.mean, 1) + "°" : "–"],
      ["Mean normalised length (orders ≥ 2)", Number.isFinite(S.Ln.mean) ? nf(S.Ln.mean, 1) : "–"], ["Mean normalised width (orders ≥ 2)", Number.isFinite(S.Wn.mean) ? nf(S.Wn.mean, 2) : "–"],
      ["Branching ratio N(o+1)/N(o)", nf(S.Rb, 2)], ["Length ratio L(o+1)/L(o)", nf(S.Rl, 2)], ["Width ratio W(o+1)/W(o)", nf(S.Rw, 2)],
      ["Width kept at bifurcations Σw(children,i)/w(parent,f)", Number.isFinite(S.cons.mean) ? nf(S.cons.mean, 2) + ` (n = ${S.cons.n})` : "–"], ["Width asymmetry |w1−w2|/(w1+w2)", Number.isFinite(S.asym.mean) ? nf(S.asym.mean, 2) : "–"],
      ...(Number.isFinite(S.relief) ? [["Relief apex → outlets", nf(S.relief) + " m"], ["Mean slope apex → outlets", nf(S.fanSlope*1000, 2) + " m/km"]] : [])].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
      <div class="x10cls"><b>Fan or delta? ${esc(S.cls.verdict)}</b>${S.cls.items.map(c => `<div><span>${esc(c.k)}: <b>${esc(c.v)}</b></span><small>${esc(c.why)}</small></div>`).join("")}<p class="note">${esc(S.cls.note)} Reference: ${DNREF.src}, <a href="https://doi.org/10.5194/esurf-14-211-2026" target="_blank" rel="noopener">doi:10.5194/esurf-14-211-2026</a>.</p></div></div>`;
    h += `<div class="card"><h4>By order</h4><div class="scroll"><table class="grid x8t"><tr><th>Order</th><th>Channels</th><th>Mean length</th><th>Normalised length</th><th>Mean width (m)</th><th>Normalised width</th><th>Angle θ at its bifurcations</th><th>Sinuosity</th>${N.segs.some(s => Number.isFinite(s.grad)) ? "<th>Gradient (m/km)</th>" : ""}</tr>${S.per.map(p => `<tr><td><i class="x10sw" style="background:${ordCol(p.o)}"></i>${p.o}</td><td>${p.n}</td><td>${Number.isFinite(p.L.mean) ? km(p.L.mean) : "–"}</td><td>${Number.isFinite(p.Ln.mean) ? nf(p.Ln.mean, 1) : "–"}</td><td>${fmtW(p.W.mean) || "–"}</td><td>${Number.isFinite(p.Wn.mean) ? nf(p.Wn.mean, 2) : "–"}</td><td>${Number.isFinite(p.theta.mean) ? `${nf(p.theta.mean, 1)}°${p.theta.n > 1 ? ` ± ${nf(p.theta.ci, 1)}` : ""} (n = ${p.theta.n})` : "–"}</td><td>${Number.isFinite(p.sin.mean) ? nf(p.sin.mean, 2) : "–"}</td>${N.segs.some(s => Number.isFinite(s.grad)) ? `<td>${Number.isFinite(p.grad.mean) ? nf(p.grad.mean, 2) : "–"}</td>` : ""}</tr>`).join("")}</table></div>
      <div class="x10charts"><div><h5>Normalised width by order</h5><div id="dnCW"></div></div><div><h5>Normalised length by order</h5><div id="dnCL"></div></div><div><h5>Bifurcation angle by order</h5><div id="dnCA"></div></div><div><h5>Channels per order</h5><div id="dnCN"></div></div></div></div>`;
    h += `<div class="card"><h4>Every channel</h4><p class="note">Tap a row (or a channel on the map) to highlight it. Widths in metres; type a value to replace or add one (e.g. for dry paleo-channels measured on imagery); typed values are kept when you re-measure.</p><div class="scroll x10tab"><table class="grid x8t" id="dnTable"><tr><th>Channel</th><th>Length</th><th>w i</th><th>w h</th><th>w f</th><th>Mean w</th><th>l ÷ w₀</th><th>w ÷ w₀</th><th>θ at end</th><th>Sinuosity</th><th>Ends</th><th>Width from</th></tr>
      ${N.segs.filter(s => !s.zero).sort((a, b) => a.order - b.order || a.j - b.j).map(s => { const B = N.bifs.find(b => b.parent === s.id); return `<tr data-s="${s.id}" class="${XR.dnSel === s.id ? "on" : ""}"><td><i class="x10sw" style="background:${ordCol(s.order)}"></i><i>l</i><sub>${s.order},${s.j}</sub>${s.name ? ` <small>${esc(s.name)}</small>` : ""}</td><td>${km(s.L)}</td>${["wi", "wh", "wf"].map(k => `<td><input class="x10w" data-k="${k}" data-s="${s.id}" value="${fmtW(s[k])}" inputmode="decimal"></td>`).join("")}<td>${fmtW(s.wmean) || "–"}</td><td>${Number.isFinite(s.Ln) ? nf(s.Ln, 1) : "–"}</td><td>${Number.isFinite(s.Wn) ? nf(s.Wn, 2) : "–"}</td><td>${B && Number.isFinite(B.theta) ? nf(B.theta, 1) + "°" + (B.poly ? " *" : "") : "–"}</td><td>${nf(s.sin, 2)}</td><td>${s.end}</td><td><small>${esc(s.wsrc || "–")}</small></td></tr>`; }).join("")}</table></div><p class="note">* more than two channels leave this node (angles between neighbouring channels, median shown). θ is measured with limbs ${XR.dnOpt.limb === "fixed" ? XR.dnOpt.limbM + " m long" : "as long as the upstream channel's final width (5 % of the shorter channel where no width is known)"}.</p></div>`;
  } else if (!N) h += `<div class="card"><p class="note">Start by zooming the map onto a fan or delta and pressing <b>Map channels in view</b> (uses OpenStreetMap waterways), or digitise the channels by hand — the paper traced every channel, including dry paleo-channels, on imagery.</p></div>`;
  if (XR.dnList.length) h += dnCompareHTML();
  el.innerHTML = h; dnWire(el); dnCharts();
}
function dnWire(el){
  const q = id => el.querySelector("#" + id), o = XR.dnOpt;
  if (q("dnView")) q("dnView").onclick = dnFromView; const sm = el.querySelector("#dnSeeMap"); if (sm) sm.onclick = ev => { ev.preventDefault(); const mb = document.querySelector(".xmapbox"); if (mb) mb.scrollIntoView({behavior: "smooth", block: "start"}); if (XR.dn && XR.dn.segs) xmap.fit(XR.dn.segs.flatMap(s => s.pts).filter((_, i) => i % 5 === 0), 30); }; if (q("dnRiv")) q("dnRiv").onclick = dnFromRiver; if (q("dnDraw")) q("dnDraw").onclick = dnStartDraw;
  if (q("dnFile")) q("dnFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) dnFromFile(f); };
  const reb = () => { dnSaveOpt(); if (XR.dn && XR.dn.lines){ try { dnBuild(); } catch(e){ xstatus(esc(e.message), "err"); } dnRender(); xmap.req(); } };
  if (q("dnCan")) q("dnCan").onchange = e => { o.canals = e.target.checked; dnSaveOpt(); };
  if (q("dnDir")) q("dnDir").onchange = e => { o.ignoreDir = e.target.checked; if (XR.dn) XR.dn.directed = !o.ignoreDir && XR.dn.osm; reb(); };
  if (q("dnLimb")) q("dnLimb").onchange = e => { o.limb = e.target.value; dnSaveOpt(); if (XR.dn && XR.dn.segs){ dnAngles(); dnSummary(); dnRender(); xmap.req(); } };
  if (q("dnLimbM")) q("dnLimbM").onchange = e => { o.limbM = Math.max(1, +e.target.value || 100); dnSaveOpt(); if (XR.dn && XR.dn.segs){ dnAngles(); dnSummary(); dnRender(); xmap.req(); } };
  if (q("dnSnap")) q("dnSnap").onchange = e => { o.snapM = Math.max(1, +e.target.value || 30); reb(); };
  if (q("dnApex")) q("dnApex").onclick = () => { XR.dnMode = "apex"; toast("Tap the apex: where the feeder channel first splits", 4000); };
  if (q("dnW")) q("dnW").onclick = dnMeasureWidths; if (q("dnZ")) q("dnZ").onclick = dnElevation;
  if (q("dnSave")) q("dnSave").onclick = () => { const N = XR.dn; XR.dnList = XR.dnList.filter(x => x.name !== N.name); XR.dnList.push(dnSnapshot(N)); dnRender(); toast("Added to the network comparison"); };
  if (q("dnFig")) q("dnFig").onclick = () => exportDialog({name: XR.dn.name + "_network", title: "the channel-network figure", journalOpt: false, svg: () => dnFigure()});
  if (q("dnCsv")) q("dnCsv").onclick = () => save(XR.dn.name.replace(/\W+/g, "_") + "_channels.csv", dnCSV());
  if (q("dnGj")) q("dnGj").onclick = () => save(XR.dn.name.replace(/\W+/g, "_") + "_channels.geojson", JSON.stringify(dnGeoJSON()));
  if (q("dnClr")) q("dnClr").onclick = () => { XR.dn = null; XR.dnSel = null; dnRender(); xmap.req(); };
  el.querySelectorAll("[data-dns]").forEach(b => b.onclick = () => { XR.dnShow[b.dataset.dns] = !XR.dnShow[b.dataset.dns]; b.classList.toggle("on"); xmap.req(); });
  el.querySelectorAll("#dnTable tr[data-s]").forEach(r => r.onclick = e => { if (e.target.tagName === "INPUT") return; XR.dnSel = +r.dataset.s; el.querySelectorAll("#dnTable tr.on").forEach(x => x.classList.remove("on")); r.classList.add("on"); const s = XR.dn.segs[XR.dnSel]; xmap.fit(s.pts, 60); xmap.req(); });
  el.querySelectorAll(".x10w").forEach(inp => inp.onchange = () => { const N = XR.dn, s = N.segs[+inp.dataset.s], v = parseFloat(inp.value); s[inp.dataset.k] = Number.isFinite(v) && v > 0 ? v : NaN; s.wsrc = "entered"; const W = [s.wi, s.wh, s.wf].filter(Number.isFinite); s.wmean = W.length ? W.reduce((a, b) => a + b, 0)/W.length : NaN;
    N.manual = N.manual || {}; N.manual[s.nodes[0] + ">" + s.nodes[s.nodes.length - 1]] = {wi: s.wi, wh: s.wh, wf: s.wf, wmean: s.wmean, wsrc: "entered"}; dnAngles(); dnSummary(); dnRender(); });
  el.querySelectorAll("[data-dnrm]").forEach(b => b.onclick = () => { XR.dnList.splice(+b.dataset.dnrm, 1); dnRender(); });
}
/* by-order chart: one box per order (quartiles, whiskers 5–95 %), mean dot; several networks side by side; optional reference lines */
function ordChart(el, sets, opt = {}){
  if (!el) return; const W = Math.max(280, el.clientWidth || 340), H = opt.h || 200, m = {l: 46, r: 10, t: 10, b: 32}, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const maxO = Math.max(1, ...sets.map(s => s.vals.length)), all = sets.flatMap(s => s.vals.flat()).filter(Number.isFinite).concat((opt.ref || []).map(r => r.y));
  if (!all.length){ el.innerHTML = `<p class="note">${opt.empty || "Not measured yet."}</p>`; return; }
  const lg = opt.log, f = v => lg ? Math.log10(Math.max(v, 1e-3)) : v; let y0 = opt.y0 ?? Math.min(...all.map(f)), y1 = Math.max(...all.map(f)); if (y1 === y0){ y1 += 1; y0 -= lg ? 1 : 0; } const pd = (y1 - y0)*.08; y1 += pd; if (opt.y0 == null) y0 -= pd;
  const X = o => m.l + (o - .5)/maxO*pw, Y = v => m.t + ph - (f(v) - y0)/(y1 - y0)*ph, bw = Math.min(26, pw/maxO/(sets.length + .6));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xsvg">`;
  for (const t of niceTicks(y0, y1, 4)){ const v = lg ? 10**t : t; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${m.l - 5}" y="${Y(v) + 4}" text-anchor="end">${esc(tfmt(v))}</text>`; }
  for (let o = 1; o <= maxO; o++) s += `<text x="${X(o)}" y="${H - 16}" text-anchor="middle">${o}</text>`;
  s += `<text x="${m.l + pw/2}" y="${H - 2}" text-anchor="middle" class="al">Channel order</text><text transform="translate(11 ${m.t + ph/2}) rotate(-90)" text-anchor="middle" class="al">${esc(opt.ylab || "")}</text>`;
  for (const r of opt.ref || []) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(r.y)}" y2="${Y(r.y)}" stroke="${r.c}" stroke-dasharray="5 4" stroke-width="1.2"/><text x="${W - m.r - 3}" y="${Y(r.y) - 3}" text-anchor="end" fill="${r.c}" class="vl">${esc(r.t)}</text>`;
  sets.forEach((st, si) => st.vals.forEach((v0, i) => { const v = v0.filter(x => Number.isFinite(x) && (!lg || x > 0)).sort((a, b) => a - b); if (!v.length) return; const o = i + 1, cx = X(o) + (si - (sets.length - 1)/2)*(bw + 3), col = st.c || ordCol(o);
    if (v.length >= 3){ const q1 = quantile(v, .25), q3 = quantile(v, .75), lo = quantile(v, .05), hi = quantile(v, .95), md = quantile(v, .5); s += `<line x1="${cx}" x2="${cx}" y1="${Y(lo)}" y2="${Y(hi)}" stroke="#555"/><rect x="${cx - bw/2}" y="${Y(q3)}" width="${bw}" height="${Math.max(1, Y(q1) - Y(q3))}" fill="${col}" fill-opacity=".55" stroke="#333" stroke-width=".8"/><line x1="${cx - bw/2}" x2="${cx + bw/2}" y1="${Y(md)}" y2="${Y(md)}" stroke="#111" stroke-width="1.4"/>`; }
    const mn = v.reduce((a, b) => a + b, 0)/v.length; s += `<circle cx="${cx}" cy="${Y(mn)}" r="3.4" fill="${st.c ? st.c : "#111"}" stroke="#fff" stroke-width="1"/>`; }));
  if (sets.length > 1) sets.forEach((st, si) => { s += `<rect x="${m.l + 6}" y="${m.t + 4 + si*13}" width="10" height="8" fill="${st.c}"/><text x="${m.l + 20}" y="${m.t + 11 + si*13}" class="vl">${esc(st.name)}</text>`; });
  el.innerHTML = s + `</svg>`;
}
function dnByOrder(N, k){ const v = []; for (let o = 1; o <= N.maxOrder; o++) v.push(k === "theta" ? N.bifs.filter(b => b.order === o).map(b => b.theta) : N.segs.filter(s => s.order === o && !s.zero).map(s => s[k])); return v; }
function dnCharts(){
  const N = XR.dn; if (!N || !N.segs || !$("dnCW")) return; const one = k => [{name: N.name, vals: dnByOrder(N, k)}];
  ordChart($("dnCW"), one("Wn"), {ylab: "w ÷ w₀", empty: "Needs widths: Measure widths, or type the first-order width."});
  ordChart($("dnCL"), one("Ln"), {ylab: "l ÷ w₀ (log)", log: true, empty: "Needs the first-order width."});
  ordChart($("dnCA"), one("theta"), {ylab: "θ (degrees)", y0: 0, ref: [{y: 74, c: "#1f77b4", t: "deltas 74°"}, {y: 55, c: "#d62728", t: "fans 55°"}]});
  ordChart($("dnCN"), [{name: N.name, vals: dnByOrder(N, "L").map(v => [v.length])}], {ylab: "Channels", y0: 0});
  if ($("dnCmpW")) dnCompareCharts();
}
/* ---------- 9. comparing networks ---------- */
const DNCMP = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#8c564b", "#e377c2"];
function dnSnapshot(N){ return {name: N.name, src: N.src, sum: N.sum, Wn: dnByOrder(N, "Wn"), Ln: dnByOrder(N, "Ln"), theta: dnByOrder(N, "theta"), angles: N.bifs.map(b => b.theta).filter(Number.isFinite), segs: N.segs.length}; }
function dnCompareHTML(){
  const L = XR.dnList, row = (t, f) => `<tr><td>${t}</td>${L.map(x => `<td>${f(x.sum, x)}</td>`).join("")}</tr>`, ref = L[0];
  const ks = L.map((x, i) => i ? ksTest(x.angles, ref.angles) : null);
  return `<div class="card"><h4>Network comparison</h4><div class="scroll"><table class="grid x8t"><tr><th></th>${L.map((x, i) => `<th style="color:${DNCMP[i % 8]}">${esc(x.name)} <button class="sm" data-dnrm="${i}" title="Remove">✕</button></th>`).join("")}</tr>
    ${row("Channels", s => s.n)}${row("Highest order", s => s.maxOrder)}${row("Bifurcations", s => s.nBif)}${row("Mean angle θ", s => Number.isFinite(s.theta.mean) ? `${nf(s.theta.mean, 1)}° ± ${nf(s.theta.ci, 1)}` : "–")}${row("Mean normalised length", s => nf(s.Ln.mean, 1))}${row("Mean normalised width", s => nf(s.Wn.mean, 2))}
    ${row("Branching ratio", s => nf(s.Rb, 2))}${row("Length ratio", s => nf(s.Rl, 2))}${row("Width ratio", s => nf(s.Rw, 2))}${row("Total length", s => km(s.totalL))}${row("Area", s => nf(s.area, 0) + " km²")}${row("Channel density", s => nf(s.dens, 2) + " km/km²")}${row("Fan or delta (indicative)", s => esc(s.cls.verdict))}
    <tr><td>Angles differ from ${esc(ref.name)}? (KS)</td>${ks.map(t => `<td>${t ? `${t.p < .05 ? "<b>yes</b>" : "no"} <small>D = ${nf(t.D, 2)}, p ≈ ${t.p < .001 ? "<0.001" : nf(t.p, 3)}</small>` : "reference"}</td>`).join("")}</tr></table></div>
    <div class="x10charts"><div><h5>Normalised width by order</h5><div id="dnCmpW"></div></div><div><h5>Normalised length by order</h5><div id="dnCmpL"></div></div><div><h5>Bifurcation angle by order</h5><div id="dnCmpA"></div></div></div></div>`;
}
function dnCompareCharts(){ const L = XR.dnList, sets = k => L.map((x, i) => ({name: x.name, vals: x[k], c: DNCMP[i % 8]}));
  ordChart($("dnCmpW"), sets("Wn"), {ylab: "w ÷ w₀"}); ordChart($("dnCmpL"), sets("Ln"), {ylab: "l ÷ w₀ (log)", log: true}); ordChart($("dnCmpA"), sets("theta"), {ylab: "θ (degrees)", y0: 0, ref: [{y: 74, c: "#1f77b4", t: "deltas 74°"}, {y: 55, c: "#d62728", t: "fans 55°"}]}); }

/* ---------- 10. exports ---------- */
function dnCSV(){ const N = XR.dn, h = ["order", "j", "label", "name", "length_km", "w_i_m", "w_h_m", "w_f_m", "w_mean_m", "l_norm", "w_norm", "theta_end_deg", "theta_far_deg", "limb_m", "limb_from", "sinuosity", "gradient_m_per_km", "end", "width_from", "parent_label"];
  const rows = N.segs.filter(s => !s.zero).sort((a, b) => a.order - b.order || a.j - b.j).map(s => { const B = N.bifs.find(b => b.parent === s.id), P = s.parent != null ? N.segs[s.parent] : null; return [s.order, s.j, `l${s.order},${s.j}`, s.name, s.L.toFixed(4), fmtW(s.wi), fmtW(s.wh), fmtW(s.wf), fmtW(s.wmean), Number.isFinite(s.Ln) ? s.Ln.toFixed(2) : "", Number.isFinite(s.Wn) ? s.Wn.toFixed(3) : "", B && Number.isFinite(B.theta) ? B.theta.toFixed(1) : "", B && Number.isFinite(B.far) ? B.far.toFixed(1) : "", B ? Math.round(B.limb) : "", B ? B.limbSrc : "", Number.isFinite(s.sin) ? s.sin.toFixed(3) : "", Number.isFinite(s.grad) ? s.grad.toFixed(3) : "", s.end, s.wsrc || "", P && !P.zero ? `l${P.order},${P.j}` : ""]; });
  const S = N.sum, meta = [`# ${N.name}; source ${N.src}; method ${DN_METHOD} (ordering and metrics after Gezovich et al. 2026); apex ${N.apex[0].toFixed(5)},${N.apex[1].toFixed(5)}; w0 ${fmtW(S.w0)} m; mean angle ${nf(S.theta.mean, 1)} deg (n=${S.theta.n}); made ${new Date().toISOString()}`];
  return meta.concat([h.join(",")], rows.map(r => r.map(v => /[,"]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","))).join("\n"); }
function dnGeoJSON(){ const N = XR.dn; return {type: "FeatureCollection", properties: {name: N.name, source: N.src, method: DN_METHOD, summary: {...N.sum, per: undefined, cls: N.sum.cls.verdict}},
  features: [...N.segs.filter(s => !s.zero && s.L > 0).map(s => ({type: "Feature", geometry: {type: "LineString", coordinates: s.pts.map(p => [+p[1].toFixed(6), +p[0].toFixed(6)])}, properties: {order: s.order, j: s.j, length_km: +s.L.toFixed(4), w_i: s.wi, w_h: s.wh, w_f: s.wf, w_mean: s.wmean, l_norm: s.Ln, w_norm: s.Wn, sinuosity: s.sin, end: s.end, width_from: s.wsrc}})),
    ...N.bifs.map(b => ({type: "Feature", geometry: {type: "Point", coordinates: [b.ll[1], b.ll[0]]}, properties: {kind: "bifurcation", order: b.order, theta: b.theta, theta_far: b.far, limb_m: b.limb}})), {type: "Feature", geometry: {type: "Point", coordinates: [N.apex[1], N.apex[0]]}, properties: {kind: "apex"}}]}; }
/* publication figure: (a) network coloured by order with angles, (b–d) normalised width, length and angle by order */
function dnFigure(){
  const N = XR.dn, k = (typeof FC !== "undefined" && FC.text) || 2.2, Wt = 1800, pad = 36, gap = 26; let y = pad, out = "";
  const P = N.segs.flatMap(s => s.pts), A = N.apex, LL = toLocal(P, A[0], A[1]); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of LL){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const tfs = Math.round(17*k); out += `<text x="${pad}" y="${y + tfs}" font-size="${tfs}" font-weight="700">${esc(N.name)} — channel network</text>`; y += tfs + 20;
  const mw = Wt - 2*pad, asp = (y1 - y0)/((x1 - x0) || 1), mh = clamp(mw*asp + 40*k, mw*.35, mw*.85), lw = mw/k, lh = mh/k, sc = Math.max((x1 - x0)/(lw - 40), (y1 - y0)/(lh - 60)), X = p => (p[0] - (x0 + x1)/2)/sc + lw/2, Y = p => (p[1] - (y0 + y1)/2)/sc + (lh - 22)/2 + 6;
  let g = `<rect width="${lw}" height="${lh}" fill="#fff"/>`;
  for (const s of N.segs.slice().sort((a, b) => b.order - a.order)){ if (!(s.L > 0)) continue; const pl = toLocal(s.pts, A[0], A[1]).filter((_, i, a) => i % Math.max(1, Math.floor(a.length/400)) === 0 || i === a.length - 1).map(p => X(p).toFixed(1) + "," + Y(p).toFixed(1)).join(" "); g += `<polyline points="${pl}" fill="none" stroke="${ordCol(s.order)}" stroke-width="${Math.max(.8, 3.2 - .28*(s.order - 1))}" stroke-linejoin="round" stroke-linecap="round"/>`; }
  for (const B of N.bifs){ if (!Number.isFinite(B.theta)) continue; const [q] = toLocal([B.ll], A[0], A[1]); g += `<circle cx="${X(q)}" cy="${Y(q)}" r="1.6" fill="#111"/>${N.bifs.length <= 60 ? `<text x="${X(q) + 3}" y="${Y(q) - 2}" font-size="6.5" fill="#111">${nf(B.theta, 0)}°</text>` : ""}`; }
  { const [q] = toLocal([A], A[0], A[1]); g += `<path d="M${X(q)} ${Y(q) - 5}l4 7h-8z" fill="#fff" stroke="#111" stroke-width=".8"/>`; }
  const t = lw*.22*sc, p10 = 10**Math.floor(Math.log10(t)), len = [1, 2, 5].map(v => v*p10).filter(v => v <= t).pop() || p10, px = len/sc;
  g += `<g transform="translate(8,${lh - 26})"><rect x="0" y="16" width="${px}" height="4" fill="#111"/><rect x="${px/2}" y="16" width="${px/2}" height="4" fill="#fff" stroke="#111" stroke-width=".6"/><text x="0" y="12" font-size="9.5">0</text><text x="${px}" y="12" font-size="9.5" text-anchor="middle">${len >= 1 ? tfmt(len) + " km" : nf(len*1000) + " m"}</text></g>`;
  g += `<g transform="translate(${lw - 26},4)"><path d="M11 8l5 14-5-4-5 4z" fill="#111"/><text x="11" y="7" font-size="8.5" text-anchor="middle" font-weight="600">N</text></g>`;
  const lgW = 20*N.maxOrder + 70; g += `<g transform="translate(${lw - lgW - 8},${lh - 30})"><rect width="${lgW}" height="26" rx="3" fill="#fff" stroke="#ccc" stroke-width=".5"/><text x="6" y="16" font-size="8.5">Order</text>${Array.from({length: N.maxOrder}, (_, i) => `<rect x="${42 + i*20}" y="6" width="16" height="${Math.max(1.5, 5 - .35*i)}" fill="${ordCol(i + 1)}"/><text x="${50 + i*20}" y="22" font-size="8" text-anchor="middle">${i + 1}</text>`).join("")}</g>`;
  out += `<g transform="translate(${pad},${y}) scale(${k})">${g}<rect width="${lw}" height="${lh}" fill="none" stroke="#cfd4d9" stroke-width="${1/k}"/></g><text x="${pad + 8}" y="${y + 14*k}" font-size="${Math.round(14*k)}" font-weight="700">a</text>`; y += mh + gap;
  // charts drawn off screen at logical width, then scaled
  const cw = (Wt - 2*pad - 2*gap)/3, tmp = document.createElement("div"); tmp.style.cssText = `position:absolute;left:-99999px;top:0;width:${Math.round(cw/k)}px`; document.body.appendChild(tmp);
  const one = kk => [{name: N.name, vals: dnByOrder(N, kk)}], charts = [["Normalised width w ÷ w₀", el => ordChart(el, one("Wn"), {ylab: "w ÷ w₀", h: 170})], ["Normalised length l ÷ w₀", el => ordChart(el, one("Ln"), {ylab: "l ÷ w₀ (log)", log: true, h: 170})], ["Bifurcation angle θ", el => ordChart(el, one("theta"), {ylab: "θ (°)", y0: 0, h: 170, ref: [{y: 74, c: "#1f77b4", t: "deltas 74°"}, {y: 55, c: "#d62728", t: "fans 55°"}]})]];
  let chH = 0; charts.forEach(([ti, fn], i) => { tmp.innerHTML = ""; fn(tmp); const sv = tmp.querySelector("svg"); if (!sv) return; const h = +sv.getAttribute("height"), w = +sv.getAttribute("width"), inner = inlineSvg(sv, true).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, ""), x = pad + i*(cw + gap), sk = cw/w;
    out += `<g transform="translate(${x},${y + 18*k})"><g transform="scale(${sk})">${inner}</g></g><text x="${x}" y="${y + 12*k}" font-size="${Math.round(10.5*k)}" font-weight="600">${esc(ti)}</text><text x="${x - 4}" y="${y + 12*k}" font-size="${Math.round(14*k)}" font-weight="700" text-anchor="end">${"bcd"[i]}</text>`; chH = Math.max(chH, h*sk + 18*k); });
  tmp.remove(); y += chH + gap;
  const S = N.sum, cap = `${N.name}: ${S.n} channels in ${S.maxOrder} orders, ${S.nBif} bifurcations; mean network angle ${nf(S.theta.mean, 1)}° ± ${nf(S.theta.ci, 1)}° (95 %, n = ${S.theta.n}); mean normalised length ${nf(S.Ln.mean, 1)} and width ${nf(S.Wn.mean, 2)} (orders ≥ 2; w₀ = ${fmtW(S.w0) || "–"} m). Channel ordering and metrics after Gezovich et al. (2026); angle limbs ${XR.dnOpt.limb === "fixed" ? XR.dnOpt.limbM + " m" : "equal to the upstream channel's final width"}. Lines: ${N.src}; widths: ${[N.widthSrc, N.segs.some(x => x.wsrc === "entered") ? "entered by hand" : ""].filter(Boolean).join(" and ") || "–"}. Boxes: quartiles, whiskers 5–95 %, dots means; dashed: means of deltas (74°) and fluvial fans (55°) in that study. Earthform Lens ${DN_METHOD}, ${new Date().toISOString().slice(0, 10)}.`;
  const fs = Math.round(9.5*k), lines = (typeof fcWrap === "function" ? fcWrap : (t2, n) => [t2])(cap, Math.round(330/k)); lines.forEach((l, i) => out += `<text x="${pad}" y="${y + fs + i*fs*1.35}" font-size="${fs}" fill="#333">${esc(l)}</text>`); y += lines.length*fs*1.35 + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wt} ${Math.round(y)}" width="${Wt}" height="${Math.round(y)}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${out}</svg>`;
}

/* ---------- 11. wiring ---------- */
{ const _rm4b = renderModules4; renderModules4 = function(){ _rm4b(); try { if (XR.tab === "dnet"){ dnRender(); const R = XR.river; if (R && !XR.dn && XR.dnAuto !== R){ XR.dnAuto = R; const D = R.delta && !R.delta.single ? R.delta : (R.graph ? analyzeDeltaX(R) : null); if (D && !D.single) dnFromRiver(); else dnMsg(`${esc(R.name)} has no mapped delta. To map a fan or delta: zoom the map onto it and press <b>Map channels in view</b>, or digitise the channels (✎). The paper traced every channel by hand on imagery.`, "ok"); } } } catch(e){ console.error(e); } }; }
{ const tools = document.querySelector(".xtools"); if (tools && !$("dnBtn")){ const b = document.createElement("button"); b.id = "dnBtn"; b.className = "chipbtn"; b.textContent = "⑂ Channel network"; b.title = "Order and measure the channels of a fan or delta"; b.onclick = () => { XR.dnOpen = true; dnShowPanel(); }; tools.appendChild(b); } }
