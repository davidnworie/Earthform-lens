/* ===================== Findings & social posts ===================== */
// A finding = one thing the analysis discovered, phrased for people: kicker, a big number, a headline, one or two plain sentences,
// the map geometry that shows it and the box to zoom to. The Report lists them; Posts turns each into a slide.

const PALETTE = {main:"#ff8a4c", trib:"#43d9e8", dist:"#ff6fae", side:"#b4f05a", hi:"#ffd84a", red:"#ff4d5e", water:"#4aa8ff", land:"#4cd17a"};
function bboxOf(pts, pad = 0){ let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts){ if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; }
const L$ = v => U.L(v).s, A$ = v => U.A(v).s;
function placeName(){ return (G.place && G.place.caption) || (G.art && G.art.title) || prettyName(G.D && G.D.name) || ""; }

function buildFindings(){
  const F = [], sc = !!G.pxm, sea = !!G.seafloor, c = G.chan, B = G.branches, river = sea ? "channel" : "river";
  const add = o => { if (o) F.push(Object.assign({on: true, id: "f" + F.length}, o)); };
  const mainLine = (w = 1, col = PALETTE.main) => c ? [{t:"line", pts: c.pts, col, w}] : [];
  if (c){
    const sin = c.len/c.straight, a = c.pts[0], b = c.pts[c.pts.length-1];
    add({key:"path", kicker: sea ? "The main channel" : "The main river", big: sin.toFixed(2) + "×", bigLabel: "sinuosity",
      title: sc ? `Winds ${L$(c.len)} to cover ${L$(c.straight)}` : `Travels ${sin.toFixed(1)}× farther than a straight line`,
      text: (sea ? `Traced along the canyon floor from shallow (lighter blue) to deep water, the path a turbidity current would follow. ` : `Traced along its centreline from end to end. `) +
        `Its path is ${sin.toFixed(2)} times the straight-line distance; channels above 1.5 count as meandering.`,
      why: "Sinuosity = channel length ÷ straight-line distance between its ends.",
      geom: [...mainLine(1.2), {t:"line", pts:[a, b], col:"#ffffff", w:.55, dash:true}, {t:"pin", x:a[0], y:a[1], col:"#fff", label: sea ? "deep" : "out"}],
      legend: [[PALETTE.main, sea ? "Main channel" : "Main river"], ["#ffffff", "Straight line"]], box: null, hl: "straight"});
    const bends = c.bends.filter(bd => Number.isFinite(bd.Rc));
    if (bends.length >= 3){
      const tight = bends.slice().sort((p, q) => p.Rc - q.Rc)[0], seg = c.pts.slice(tight.i0, tight.i1 + 1), rw = val("channel", "Radius ÷ width");
      add({key:"bends", kicker:"Meander bends", big: String(c.bends.length), bigLabel: "bends",
        title: `Tightest bend: radius ${(tight.Rc/c.W).toFixed(1)} channel widths`,
        text: `Most bends here have a radius of ${fx(rw, 1)} widths (rivers are typically 2–3). Tighter bends erode their outer bank fastest.`,
        why: "Bends run between points where the centreline's curvature changes sign; radius = 1 ÷ peak curvature.",
        geom: [...mainLine(.8), {t:"line", pts: seg, col: PALETTE.hi, w: 2.2}], legend: [[PALETTE.hi, "Tightest bend"]],
        box: bboxOf(seg, 3*c.W), hl: "bends"});
    }
  }
  if (G.rivers && G.rivers.filter(r => r.major).length >= 2){
    const M = G.rivers.filter(r => r.major).slice(0, 6), nm = r => G.chNames[r.id] || r.id;
    add({key:"rivers", kicker:"Major rivers", big: String(M.length), bigLabel: "major rivers",
      title: M.slice(0, 3).map(r => `${nm(r)} ${L$(r.len)}`).join(" · "),
      text: M.map(r => `${nm(r)}${r.parentId ? ` joins ${G.chNames[r.parentId] || r.parentId}` : " has its own network"}`).join("; ") + ". Each was traced from its mouth, following the same water upstream at every junction.",
      why: "Rivers ranked by length × median width; any river at least a fifth the size of the largest counts as major.",
      geom: M.flatMap((r, i) => [{t:"line", pts: r.st.prof.pts, col: EX_COL[i % EX_COL.length], w: 1.3}, {t:"pin", x: r.mid[0], y: r.mid[1], col: EX_COL[i % EX_COL.length], label: r.id}]),
      legend: M.map((r, i) => [EX_COL[i % EX_COL.length], nm(r)]), box: null, hl: "rivers"});
  }
  if (G.channelSet && !G.rivers){
    const o = G.channelSet.list.filter(q => !q.main);
    if (o.length) add({key:"channels", kicker: c ? "Separate channels" : "Channels", big: String(o.length), bigLabel: o.length > 1 ? "channels" : "channel",
      title: c ? `${o.length} more channel${o.length > 1 ? "s" : ""}, not connected to the main ${river}` : `${o.length} separate channel${o.length > 1 ? "s" : ""} in view`,
      text: `The longest, ${o[0].id}, is ${L$(o[0].len)} long with sinuosity ${o[0].sin.toFixed(2)}.` + (c ? " They may join outside the view, or under trees or bridges where the water can't be seen." : ""),
      why: "Every piece of water at least 8 widths long; length is its longest route along the centreline, sinuosity = that length ÷ straight distance between its ends.",
      geom: [...mainLine(.8), ...o.slice(0, 12).map((q, i) => ({t:"dots", pts: q.pts, col: CS_COL[i % CS_COL.length], w: .8})), ...o.slice(0, 8).map((q, i) => ({t:"pin", x: q.mid[0], y: q.mid[1], col: CS_COL[i % CS_COL.length], label: q.id}))],
      legend: [[CS_COL[0], "Separate channels"]].concat(c ? [[PALETTE.main, "Main " + river]] : []), box: null, hl: "chanset"});
  }
  if (G.chStats && G.chStats.length >= 3){
    const S0 = G.chStats, bigL = Math.max(...S0.map(r => r.st.len)), S = S0.filter(r => r.st.len >= .1*bigL), by = (f, d = 1) => S.slice().filter(r => Number.isFinite(f(r))).sort((a, b) => (f(b) - f(a))*d)[0];
    const sinM = by(r => r.st.sin), lenM = by(r => r.st.len), widM = by(r => r.st.W), top = S.slice().sort((a, b) => b.st.len - a.st.len).slice(0, 8);
    add({key:"compare", kicker:"Channels compared", big: String(S.length), bigLabel: "channels measured",
      title: `Most winding: ${sinM.id}, sinuosity ${sinM.st.sin.toFixed(2)}`,
      text: `Longest: ${lenM.id} (${L$(lenM.st.len)}). Widest: ${widM.id} (${L$(widM.st.W)}). Median sinuosity across all channels is ${median(S.map(r => r.st.sin).filter(Number.isFinite)).toFixed(2)}; ${S.filter(r => r.st.sin > 1.5).length} of ${S.length} are meandering.`,
      why: "Every channel (main, tributaries, distributaries, side and separate channels) is measured with the same centreline method; the full table is in Findings and exports as CSV.",
      geom: top.map((r, i) => ({t:"dots", pts: r.pts, col: r.type === "main" ? PALETTE.main : CS_COL[i % CS_COL.length], w: .9})).concat(top.map((r, i) => ({t:"pin", x: r.mid[0], y: r.mid[1], col: r.type === "main" ? PALETTE.main : CS_COL[i % CS_COL.length], label: r.id === "Main" ? "M" : r.id}))),
      legend: [[PALETTE.main, "Main"], [CS_COL[0], "Other channels"]], box: null, hl: "chanset"});
  }
  if (G.chx && G.chx.necks.length && G.chx.necks[0].ratio <= 3 && c){
    const nk = G.chx.necks[0], loop = c.pts.slice(Math.min(nk.i ?? 0, nk.j ?? 0), Math.max(nk.i ?? 0, nk.j ?? 0) + 1);
    add({key:"neck", kicker:"Cutoff watch", big: L$(nk.gap), bigLabel: "of land left",
      title: `The ${river} has almost looped back on itself`,
      text: `Here only ${nk.ratio.toFixed(1)} channel widths of land separate two loops. When the ${river} breaks through, the loop is abandoned and becomes an oxbow lake.`,
      why: "A neck is the narrowest land between two parts of the same channel that are far apart along it.",
      geom: [...mainLine(.7), ...(loop.length > 2 ? [{t:"line", pts: loop, col: PALETTE.hi, w: 1.6}] : []), {t:"line", pts:[nk.a, nk.b], col: PALETTE.red, w: 2.6}],
      legend: [[PALETTE.red, "Narrow neck"], [PALETTE.hi, "Loop at risk"]], box: bboxOf(loop.length > 2 ? loop : [nk.a, nk.b], 4*c.W), hl: "necks"});
  }
  if (G.chx && G.chx.oxbows.length){
    const ox = G.chx.oxbows, pts = ox.map(o => o.c);
    add({key:"oxbows", kicker:"Abandoned loops", big: String(ox.length), bigLabel: ox.length > 1 ? "oxbow lakes" : "oxbow lake",
      title: "Old river bends, cut off and left behind",
      text: `Channel-width lakes beside the ${river} are former meander loops. Each one marks where the ${river} used to flow.`,
      why: "Separate water bodies about as wide as the channel, inside the meander belt and curved like a bend.",
      geom: [...mainLine(.6), ...ox.map(o => ({t:"ring", x: o.c[0], y: o.c[1], r: Math.max(6, Math.sqrt(o.area)*1.1), col: "#c86bff"}))],
      legend: [["#c86bff", "Oxbow lake"]], box: ox.length <= 3 ? bboxOf(pts, 10*(c ? c.W : 10)) : null, hl: "oxbows"});
  }
  if (B && B.tribs.length){
    const t = B.tribs, A = t.map(o => o.angle).filter(Number.isFinite);
    add({key:"tribs", kicker: sea ? "Tributary channels" : "Tributaries", big: String(t.length), bigLabel: t.length > 1 ? "tributaries" : "tributary",
      title: `${t.length} ${t.length > 1 ? "channels feed" : "channel feeds"} the main ${river}`,
      text: `${B.left} enter from the left bank and ${B.right} from the right (looking downstream).` + (A.length ? ` They meet the main ${river} at a median angle of ${median(A).toFixed(0)}°.` : "") + (t.length > 1 && Number.isFinite(B.spacing) ? ` Confluences are spaced ${L$(B.spacing)} apart.` : ""),
      why: "A branch that points back upstream from where it meets the main channel (or, on the seafloor, whose far end is shallower) flows in.",
      geom: [...mainLine(1), ...t.map(o => ({t:"dots", pts: o.pts, col: PALETTE.trib, w: Math.max(.5, o.width/c.W)})), ...t.slice(0, 9).map(o => ({t:"pin", x: o.x, y: o.y, col: PALETTE.trib, label: o.id}))],
      legend: [[PALETTE.main, "Main " + river], [PALETTE.trib, "Tributaries"]], box: null, hl: "branches"});
    const o = t[0];
    if (o.len > 6*c.W) add({key:"t1", kicker: "The largest tributary", big: Number.isFinite(o.angle) ? o.angle.toFixed(0) + "°" : L$(o.len), bigLabel: Number.isFinite(o.angle) ? "junction angle" : "long",
      title: `${o.id}: ${L$(o.len)} long, ${(o.width/c.W).toFixed(2)}× the main width`,
      text: `It joins ${L$(o.s)} from the ${sea ? "deep end" : "outlet"} on the ${o.bank} bank${o.gap ? " (a short gap in the image, such as a bridge or label, separates it)" : ""}. It counts as a tributary because ${o.cue}.`,
      why: "Junction angle: between the tributary and the main channel upstream of the confluence.",
      geom: [...mainLine(1), {t:"dots", pts: o.pts, col: PALETTE.trib, w: Math.max(.6, o.width/c.W)}, {t:"pin", x: o.x, y: o.y, col: PALETTE.trib, label: o.id}],
      legend: [[PALETTE.trib, o.id]], box: bboxOf(o.pts.concat([[o.x, o.y]]), 6*c.W), hl: "branches"});
  }
  if (B && B.dists.length){
    const d = B.dists;
    add({key:"dists", kicker:"Distributaries", big: String(d.length), bigLabel: d.length > 1 ? "distributaries" : "distributary",
      title: `Flow splits off the main ${river} ${d.length > 1 ? d.length + " times" : "once"}`,
      text: `Distributaries carry water and sediment away from the main ${river}, as on deltas, fans and the lower reaches of submarine channels. The largest, ${d[0].id}, is ${L$(d[0].len)} long.`,
      why: "A branch that points downstream from where it leaves the main channel (or ends in open water, or deeper on the seafloor).",
      geom: [...mainLine(1), ...d.map(o => ({t:"dots", pts: o.pts, col: PALETTE.dist, w: Math.max(.5, o.width/c.W)})), ...d.slice(0, 9).map(o => ({t:"pin", x: o.x, y: o.y, col: PALETTE.dist, label: o.id}))],
      legend: [[PALETTE.dist, "Distributaries"]], box: null, hl: "branches"});
  }
  if (B && B.sides.length >= 2) add({key:"sides", kicker:"Islands & side channels", big: String(B.sides.length), bigLabel: "side channels",
    title: `The ${river} splits and rejoins around islands`,
    text: `Side channels (anabranches) leave the main ${river} and come back to it, isolating islands or bars. Here they total ${L$(B.sides.reduce((s, o) => s + o.len, 0))}.`,
    why: "Branches attached to the main channel at two points far apart along it.",
    geom: [...mainLine(1), ...B.sides.map(o => ({t:"dots", pts: o.pts, col: PALETTE.side, w: Math.max(.5, o.width/c.W)}))], legend: [[PALETTE.side, "Side channels"]], box: null, hl: "branches"});
  if (G.net && G.net.maxO >= 3 && G.net.lines && G.focusEff !== "coast"){
    const n = G.net;
    add({key:"network", kicker:"The channel network", big: "Order " + n.maxO, bigLabel: "Strahler",
      title: `${n.sources} channel heads, ${n.loops ? n.loops + " loops" : "no loops"}`,
      text: `When two order-1 channels meet they make an order-2 channel, and so on. This network reaches order ${n.maxO}. Each order has about ${fx(n.Rb, 1)}× fewer channels than the one below (natural networks: 3–5).`,
      why: "Strahler ordering and Horton's bifurcation ratio on the skeleton of the connected water.",
      geom: n.lines.map(l => ({t:"line", pts: l.pts, col: `hsl(${200 - 25*(l.order - 1)},90%,${78 - 6*l.order}%)`, w: .35 + .3*l.order})), legend: [["#9fe3ff", "Low order"], ["#1f6fff", "High order"]], box: null, hl: "network"});
  }
  if (G.delta && G.focusEff === "delta" && G.delta.mouths.length >= 2){
    const d = G.delta;
    add({key:"delta", kicker:"Delta", big: String(d.mouths.length), bigLabel: "mouths",
      title: `Distributaries fan out over ${fx(d.opening, 0)}°`,
      text: `From the apex, where the channel first splits, ${d.bif} bifurcations lead to ${d.mouths.length} mouths${G.pxm ? ` across a delta of ${A$(d.area)}` : ""}.`,
      why: "Apex = last junction before every route reaches the sea; opening angle = spread of mouths seen from the apex.",
      geom: [...d.mouths.map(m => ({t:"line", pts:[d.apex, m], col:"rgba(255,255,255,.6)", w:.5})), ...(d.hull.length > 2 ? [{t:"line", pts: d.hull.concat([d.hull[0]]), col: PALETTE.hi, w: .8, dash: true}] : []), ...d.mouths.map(m => ({t:"ring", x: m[0], y: m[1], r: 5, col: PALETTE.trib})), {t:"pin", x: d.apex[0], y: d.apex[1], col: PALETTE.red, label:"apex"}],
      legend: [[PALETTE.red, "Apex"], [PALETTE.trib, "Mouths"]], box: d.hull.length > 2 ? bboxOf(d.hull, 20) : null, hl: "delta"});
  }
  if (G.focusEff === "coast" && G.mask){
    add({key:"water", kicker:"Water & shore", big: disp("water", "Share of analysis area"), bigLabel: "of the view is water",
      title: "Where the water is", text: `Detected water is split into ${disp("water", "Separate water bodies")} separate bodies.` + (G.pxm ? ` The largest covers ${disp("water", "Largest body")}.` : ""),
      why: "Water found by colour clustering, spreading and a classifier trained on this image.",
      geom: [{t:"mask", m: G.mask, col: [74, 168, 255]}], legend: [[PALETTE.water, "Water"]], box: null, hl: "mask"});
  }
  if (G.lakes && G.lakes.lakes.length >= 5 && !sea){
    const lk = G.lakes.lakes.slice().sort((a, b) => b.area - a.area).slice(0, 160);
    add({key:"lakes", kicker:"Lakes & ponds", big: String(G.lakes.lakes.length), bigLabel: "water bodies",
      title: `Lakes cover ${disp("lakes", "Lake cover (limnicity)")} of the land`, text: `Their median elongation is ${disp("lakes", "Median elongation")}; elongated ones line up toward ${disp("lakes", "Preferred long-axis bearing")}, which can reflect wind, ice or old channels.`,
      why: "Each separate water body away from the main network, measured for area, shape and long-axis direction.",
      geom: lk.map(l => ({t:"ring", x: l.cx, y: l.cy, r: Math.max(3, Math.sqrt(l.area/Math.PI)*1.4), col: "#9fe3ff"})), legend: [["#9fe3ff", "Lake or pond"]], box: null, hl: "lakes"});
  }
  if (G.sv && G.sv.intervals && G.sv.intervals.length){
    const iv = G.sv.intervals[G.sv.sel], dA = G.sv.dates[iv.a], dB = G.sv.dates[iv.b], yl = d => d.year ?? d.name.slice(0, 10), net = (iv.dep || 0) - (iv.ero || 0);
    add({key:"change", kicker:`Change ${yl(dA)} → ${yl(dB)}`, big: (net >= 0 ? "+" : "−") + A$(Math.abs(net)), bigLabel: "net land",
      title: net >= 0 ? "More land than before" : "Water has gained ground",
      text: `${A$(iv.dep || 0)} of water became land and ${A$(iv.ero || 0)} of land became water` + (iv.events && iv.events[0] ? `. The biggest single change, E1, is ${A$(iv.events[0].area)} of new ${iv.events[0].type}.` : "."),
      why: "Both dates are aligned automatically, water is mapped in each, and patches that changed are compared.",
      geom: [{t:"cmap", m: iv.map}, ...(iv.events || []).slice(0, 6).map((e, k) => ({t:"pin", x: e.cx, y: e.cy, col: e.type === "land" ? PALETTE.land : PALETTE.red, label: "E" + (k+1)}))],
      legend: [[PALETTE.land, "New land"], [PALETTE.red, "New water"]], box: null, hl: "compare"});
  }
  if (G.field && G.field.tiles.length){
    const f = G.field;
    add({key:"dunes", kicker:"Dunes & bedforms", big: disp("field", "Median spacing"), bigLabel: "crest spacing",
      title: `Crests trend ${disp("field", "Mean crest trend")}`, text: `Across ${f.tiles.length} tiles the crests have an alignment strength of ${disp("field", "Alignment strength")} (1 = all parallel). Winds that build dunes blow across the crests.`,
      why: "2-D Fourier spectrum of each tile: peak frequency → spacing, peak direction → crest trend.",
      geom: f.tiles.map(t => { const th = (t.crest - G.north)*Math.PI/180, L = Math.min(f.T*.45, t.spacing*2.5), dx = Math.sin(th)*L, dy = -Math.cos(th)*L; return {t:"line", pts:[[t.cx-dx, t.cy-dy], [t.cx+dx, t.cy+dy]], col: PALETTE.hi, w: .8}; }), legend: [[PALETTE.hi, "Crest direction"]], box: null, hl: "field"});
  }
  return F;
}

/* ---------- drawing ---------- */
function storySource(){
  if (G.enhanced && G.enhanced.canvas) return G.enhanced.canvas;
  if (G._storySrc && G._storySrc.D === G.D && G._storySrc.lm === G.labelMask) return G._storySrc.c;
  const c = G.labelMask && G.D.img ? cleanLabelsFor(G.D.img) : studioSource().img;
  G._storySrc = {D: G.D, lm: G.labelMask, c}; return c;
}
function cropFor(box, A){
  const w = G.w, h = G.h; let x0, y0, x1, y1;
  if (box){ [x0, y0, x1, y1] = box; const m = .38*Math.min(w, h); if (x1 - x0 < m){ const cx = (x0+x1)/2; x0 = cx - m/2; x1 = cx + m/2; } if (y1 - y0 < m){ const cy = (y0+y1)/2; y0 = cy - m/2; y1 = cy + m/2; } }
  else { x0 = 0; y0 = 0; x1 = w; y1 = h; }
  let bw = (x1 - x0)*(box ? 1.1 : 1), bh = (y1 - y0)*(box ? 1.1 : 1);
  if (bw/bh < A) bw = bh*A; else bh = bw/A;
  if (bw > w){ bw = w; bh = bw/A; } if (bh > h){ bh = h; bw = bh*A; }
  const cx = clamp((x0+x1)/2, bw/2, w - bw/2), cy = clamp((y0+y1)/2, bh/2, h - bh/2);
  return {x: cx - bw/2, y: cy - bh/2, w: bw, h: bh};
}
const _maskCache = new WeakMap();
function maskCanvas(m, rgb, cmap){
  const key = m; let o = _maskCache.get(key); if (o) return o;
  const c = document.createElement("canvas"); c.width = G.w; c.height = G.h; const x = c.getContext("2d"), id = x.createImageData(G.w, G.h), d = id.data;
  for (let i = 0; i < m.length; i++){ if (!m[i]) continue; const col = cmap ? (m[i] === 1 ? [255, 77, 94] : [76, 209, 122]) : rgb; d[i*4] = col[0]; d[i*4+1] = col[1]; d[i*4+2] = col[2]; d[i*4+3] = cmap ? 215 : 150; }
  x.putImageData(id, 0, 0); _maskCache.set(key, c); return c;
}
/** draw the image crop plus a finding's geometry into rect (X, Y, W, H) */
function drawScene(ctx, f, X, Y, W, H, opt = {}){
  const src = storySource(), k = src.width/G.w, cr = cropFor(f ? f.box : null, W/H), s = W/cr.w;
  ctx.save(); ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
  ctx.fillStyle = "#0b0d10"; ctx.fillRect(X, Y, W, H);
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, cr.x*k, cr.y*k, cr.w*k, cr.h*k, X, Y, W, H);
  if (f && f.geom && f.geom.length && opt.dim !== false){ ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(X, Y, W, H); }
  const T = (x, y) => [X + (x - cr.x)*s, Y + (y - cr.y)*s], lw = Math.max(1.4, W/260)*(opt.lw || 1);
  for (const g of (f && f.geom) || []){
    if (g.t === "mask" || g.t === "cmap"){ ctx.drawImage(maskCanvas(g.m, g.col, g.t === "cmap"), cr.x, cr.y, cr.w, cr.h, X, Y, W, H); continue; }
    if (g.t === "line"){ if (g.pts.length < 2) continue; const step = Math.max(1, Math.floor(g.pts.length/1500));
      ctx.beginPath(); for (let i = 0; i < g.pts.length; i += step){ const q = T(g.pts[i][0], g.pts[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } const e = T(g.pts[g.pts.length-1][0], g.pts[g.pts.length-1][1]); ctx.lineTo(e[0], e[1]);
      ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(g.dash ? [lw*3, lw*2.2] : []);
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = lw*(g.w || 1)*1.9 + 2; ctx.stroke();
      ctx.shadowColor = g.col; ctx.shadowBlur = lw*2.2; ctx.strokeStyle = g.col; ctx.lineWidth = lw*(g.w || 1); ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]); continue; }
    if (g.t === "dots"){ const r = Math.max(1.2, lw*.7*(g.w || 1)); ctx.fillStyle = "rgba(0,0,0,.5)"; for (const p of g.pts){ const q = T(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], r + 1.2, 0, 7); ctx.fill(); }
      ctx.fillStyle = g.col; for (const p of g.pts){ const q = T(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); } continue; }
    if (g.t === "ring"){ const q = T(g.x, g.y), r = Math.max(lw*2, g.r*s); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = lw*1.6 + 2; ctx.stroke(); ctx.strokeStyle = g.col; ctx.lineWidth = lw*1.1; ctx.stroke(); continue; }
    if (g.t === "pin" && !opt.noPins){ const q = T(g.x, g.y), r = Math.max(9, W/52); if (q[0] < X || q[0] > X + W || q[1] < Y || q[1] > Y + H) continue;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = g.col; ctx.fill(); ctx.lineWidth = Math.max(1.5, r/6); ctx.strokeStyle = "#0b0d10"; ctx.stroke();
      if (g.label){ ctx.fillStyle = "#0b0d10"; ctx.font = `700 ${Math.round(r*(g.label.length > 3 ? .62 : .82))}px "Space Grotesk", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(g.label, q[0], q[1] + r*.04); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; } }
  }
  ctx.restore();
  return cr;
}
function wrapText(ctx, text, maxW){ const words = String(text).split(/\s+/), lines = []; let cur = ""; for (const wd of words){ const t = cur ? cur + " " + wd : wd; if (ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = wd; } else cur = t; } if (cur) lines.push(cur); return lines; }
function fitFont(ctx, text, maxW, size, weight, fam, minSize){ let s = size; do { ctx.font = `${weight} ${s}px ${fam}`; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > (minSize || 20)); return s; }
const SERIF = '"Libre Baskerville", Georgia, serif', SANS = '"Space Grotesk", system-ui, sans-serif';
const POST_FMT = {"4:5": [1080, 1350], "1:1": [1080, 1080], "9:16": [1080, 1920]};
const POST_THEME = {
  science: {name:"Science report", bg:"#fbfaf6", fg:"#16191d", sub:"#4b525a", acc:"#0e5a8a"},
  photo: {name:"Photo", bg:"#000", fg:"#fff", sub:"rgba(255,255,255,.82)", acc:"#ffd84a"},
  print: {name:"Print", bg:"#f6f3ec", fg:"#16181b", sub:"#4a4f55", acc:"#0e6aa8"},
  night: {name:"Night", bg:"#0d1013", fg:"#f2f4f6", sub:"#a9b0b8", acc:"#43d9e8"},
};
function rrect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/** one slide: kind "cover" | "finding" | "summary" */
function renderSlide(cv, slide, idx, total, opt = {}){
  if ((opt.theme || "science") === "science") return renderSciSlide(cv, slide, idx, total, opt);
  const [W, H] = POST_FMT[opt.fmt || "4:5"], th = POST_THEME[opt.theme || "photo"], ctx = cv.getContext("2d"), M = Math.round(W*.065);
  cv.width = W; cv.height = H; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const place = placeName(), type = landscapeType(), pager = `${String(idx + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const footer = (col, y) => { ctx.font = `500 ${Math.round(W*.022)}px ${SANS}`; ctx.fillStyle = col; ctx.fillText((place || type).toUpperCase().split("").join(" "), M, y); ctx.textAlign = "right"; ctx.fillText(idx < total - 1 ? "swipe →" : "Earthform Lens", W - M, y); ctx.textAlign = "left"; };
  if (slide.kind === "cover"){
    drawScene(ctx, null, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H*.25); g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H*.25);
    ctx.font = `600 ${Math.round(W*.026)}px ${SANS}`; const pill = slide.pill || `${total - 2} findings from one satellite image  →`, pw = ctx.measureText(pill).width + W*.05;
    rrect(ctx, M, M, pw, W*.062, W*.031); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(pill, M + W*.025, M + W*.041);
    // white label box, bottom right (atlas style)
    const title = slide.title || place || type, sub = slide.sub || (place && place !== type ? type : "");
    const ts = fitFont(ctx, title, W*.62, Math.round(W*.05), 700, SERIF, 24); const tw = ctx.measureText(title).width;
    ctx.font = `400 ${Math.round(W*.024)}px ${SERIF}`; const sw = sub ? ctx.measureText(sub).width : 0;
    const bw = Math.max(tw, sw) + W*.07, bh = ts*1.9 + (sub ? W*.045 : 0), bx = W - M - bw, by = H - M - bh;
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 24; ctx.fillRect(bx, by, bw, bh); ctx.shadowBlur = 0;
    ctx.fillStyle = "#14171a"; ctx.font = `700 ${ts}px ${SERIF}`; ctx.fillText(title, bx + W*.035, by + ts*1.35);
    if (sub){ ctx.fillStyle = "#565c63"; ctx.font = `italic 400 ${Math.round(W*.024)}px ${SERIF}`; ctx.fillText(sub, bx + W*.035, by + ts*1.35 + W*.045); }
    return;
  }
  if (slide.kind === "summary"){
    ctx.fillStyle = th.bg === "#000" ? "#0d1013" : th.bg; ctx.fillRect(0, 0, W, H);
    const fg = th.bg === "#000" ? "#f2f4f6" : th.fg, sub = th.bg === "#000" ? "#a9b0b8" : th.sub, acc = th.acc;
    const ih = Math.round(H*.34); drawScene(ctx, slide.f || null, 0, 0, W, ih, {lw: .8});
    let y = ih + M*1.25; ctx.fillStyle = acc; ctx.font = `600 ${Math.round(W*.024)}px ${SANS}`; ctx.fillText("BY THE NUMBERS", M, y);
    y += W*.07; ctx.fillStyle = fg; fitFont(ctx, slide.title || place || type, W - 2*M, Math.round(W*.05), 700, SERIF, 28); ctx.fillText(slide.title || place || type, M, y);
    const st = (slide.stats || []).slice(0, 6), cols = 2, cw = (W - 2*M)/cols, rh = (H - y - M*2.4)/Math.ceil(Math.max(1, st.length)/cols);
    st.forEach((s, i) => { const cx = M + (i % cols)*cw, cy = y + M*.6 + Math.floor(i/cols)*rh;
      ctx.strokeStyle = th.bg === "#f6f3ec" ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.14)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + cw - W*.03, cy); ctx.stroke();
      ctx.fillStyle = fg; fitFont(ctx, s.value, cw - W*.04, Math.round(Math.min(rh*.42, W*.075)), 700, SERIF, 22); ctx.fillText(s.value, cx, cy + Math.min(rh*.5, W*.09));
      ctx.fillStyle = sub; ctx.font = `500 ${Math.round(W*.024)}px ${SANS}`; ctx.fillText(s.label, cx, cy + Math.min(rh*.5, W*.09) + W*.04); });
    ctx.fillStyle = sub; ctx.font = `400 ${Math.round(W*.02)}px ${SANS}`;
    wrapText(ctx, slide.method || "Measured automatically from the image: water and channel detection, centreline tracing and network analysis.", W - 2*M).slice(0, 2).forEach((l, i) => ctx.fillText(l, M, H - M*1.55 + i*W*.027 - W*.027));
    footer(sub, H - M*.6); return;
  }
  // finding slide
  const f = slide.f, photo = opt.theme === "photo" || !opt.theme;
  const imgH = photo ? H : Math.round(H*(H > W*1.5 ? .58 : .56));
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  if (photo) drawScene(ctx, f, 0, 0, W, H); else if (opt.theme === "night"){ const r = Math.round(W*.035); ctx.save(); rrect(ctx, M*.5, M*.5, W - M, imgH - M*.5, r); ctx.clip(); drawScene(ctx, f, M*.5, M*.5, W - M, imgH - M*.5); ctx.restore(); } else drawScene(ctx, f, 0, 0, W, imgH);
  // locator inset when zoomed
  if (f.box){ const iw = Math.round(W*.2), src = storySource(), ih = Math.round(iw*G.h/G.w), ix = W - M*(photo ? 1 : .9) - iw, iy = M*(photo ? 1 : 1.1);
    if (ih < imgH*.45){ ctx.save(); ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 16; ctx.fillStyle = "#fff"; ctx.fillRect(ix - 4, iy - 4, iw + 8, ih + 8); ctx.restore(); ctx.drawImage(src, ix, iy, iw, ih);
      const cr = cropFor(f.box, W/(photo ? H : imgH)), k = iw/G.w; ctx.strokeStyle = th.acc === "#0e6aa8" ? "#ffd84a" : th.acc; ctx.lineWidth = 3; ctx.strokeRect(ix + cr.x*k, iy + cr.y*k, cr.w*k, cr.h*k); } }
  // top: pager + kicker + legend
  ctx.font = `600 ${Math.round(W*.024)}px ${SANS}`; const kick = (f.kicker || "").toUpperCase(), kt = pager + "   " + kick, kw = ctx.measureText(kt).width + W*.05;
  rrect(ctx, M, M, kw, W*.058, W*.029); ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(pager, M + W*.025, M + W*.039); ctx.fillStyle = photo ? th.acc : (th.acc === "#0e6aa8" ? "#ffd84a" : th.acc); ctx.fillText(kick, M + W*.025 + ctx.measureText(pager + "   ").width, M + W*.039);
  if (f.legend && f.legend.length){ ctx.font = `500 ${Math.round(W*.021)}px ${SANS}`; let ly = M + W*.1; const lw2 = Math.max(...f.legend.map(l => ctx.measureText(l[1]).width)) + W*.07;
    rrect(ctx, M, ly - W*.035, lw2, f.legend.length*W*.036 + W*.02, W*.015); ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fill();
    for (const [col, t] of f.legend){ ctx.fillStyle = col; ctx.beginPath(); ctx.arc(M + W*.028, ly - W*.007, W*.009, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(t, M + W*.05, ly); ly += W*.036; } }
  // text block
  const tx = M, tw = W - 2*M;
  let y;
  if (photo){
    const g = ctx.createLinearGradient(0, H*.42, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.35, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,.9)"); ctx.fillStyle = g; ctx.fillRect(0, H*.42, W, H*.58);
  }
  const fg = photo ? "#fff" : th.fg, sub = photo ? "rgba(255,255,255,.85)" : th.sub, acc = photo ? th.acc : th.acc;
  ctx.font = `400 ${Math.round(W*.031)}px ${SANS}`; const body = f.bars ? [] : wrapText(ctx, f.text || "", tw).slice(0, H > W*1.5 ? 6 : 4), barH = f.bars ? f.bars.items.length*W*.05 + W*.05 : 0;
  const bigS = Math.round(W*(H > W*1.5 ? .15 : .12)), titleS = Math.round(W*.046);
  ctx.font = `700 ${titleS}px ${SERIF}`; const tl = wrapText(ctx, f.title || "", tw).slice(0, 2);
  const blockH = bigS*1.05 + W*.03 + tl.length*titleS*1.3 + W*.02 + body.length*W*.044 + barH + W*.07;
  y = photo ? H - M*1.1 - blockH : imgH + (H - imgH - blockH)/2 + M*.25;
  if (!photo){ ctx.fillStyle = acc; ctx.fillRect(tx, y - W*.01, W*.08, W*.008); }
  y += bigS;
  ctx.fillStyle = fg; const bs = fitFont(ctx, f.big || "", tw*.75, bigS, 700, SERIF, 40); ctx.fillText(f.big || "", tx, y);
  const bwid = ctx.measureText(f.big || "").width; ctx.fillStyle = acc; ctx.font = `600 ${Math.round(W*.028)}px ${SANS}`; if (bwid + W*.04 + ctx.measureText(f.bigLabel || "").width < tw) ctx.fillText(f.bigLabel || "", tx + bwid + W*.025, y); else { y += W*.04; ctx.fillText(f.bigLabel || "", tx, y); }
  y += W*.03; ctx.fillStyle = fg; ctx.font = `700 ${titleS}px ${SERIF}`; for (const l of tl){ y += titleS*1.3; ctx.fillText(l, tx, y); }
  y += W*.02; ctx.fillStyle = sub; ctx.font = `400 ${Math.round(W*.031)}px ${SANS}`; for (const l of body){ y += W*.044; ctx.fillText(l, tx, y); }
  if (f.bars){ y += W*.02; ctx.fillStyle = sub; ctx.font = `600 ${Math.round(W*.024)}px ${SANS}`; y += W*.03; ctx.fillText(f.bars.label.toUpperCase(), tx, y);
    const mx = Math.max(...f.bars.items.map(i => i.v).filter(Number.isFinite), 1e-9), lw = tw*.3, bw = tw*.55;
    for (const it of f.bars.items){ y += W*.05; ctx.fillStyle = fg; ctx.font = `500 ${Math.round(W*.027)}px ${SANS}`; ctx.fillText(it.name.slice(0, 16), tx, y);
      ctx.fillStyle = photo ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.08)"; ctx.fillRect(tx + lw, y - W*.026, bw, W*.03);
      if (Number.isFinite(it.v)){ ctx.fillStyle = it.col; ctx.fillRect(tx + lw, y - W*.026, bw*it.v/mx, W*.03); }
      ctx.fillStyle = fg; ctx.fillText(it.s, tx + lw + bw + W*.02, y); } }
  footer(photo ? "rgba(255,255,255,.7)" : sub, H - M*.55);
}

/* ---------- slide deck, captions, saving ---------- */
G.post = {fmt: "4:5", theme: "science", slides: null, edits: {}, meta: {src: "Google Earth", date: "", author: ""}};
function deckSlides(){
  const F = G.findings || [], on = F.filter(f => !G.post.edits[f.key] || !G.post.edits[f.key].off);
  const S = [{kind:"cover", key:"cover"}];
  for (const f of on){ const e = G.post.edits[f.key] || {}; S.push({kind:"finding", key: f.key, f: Object.assign({}, f, e.title ? {title: e.title} : {}, e.text ? {text: e.text} : {}, e.big ? {big: e.big} : {})}); }
  const st = (G.keyStats || keyStats()).slice(0, 6);
  S.push({kind:"summary", key:"summary", stats: st, f: (on[0] && on[0].key === "path") ? {geom: on[0].geom.filter(g => g.t !== "pin"), box: null} : null,
    method: `Measured automatically from one image${G.pxm ? ` at ${G.pxm.toPrecision(3)} m per pixel` : " (no scale set, so lengths are in pixels)"}: ${G.seafloor ? "seafloor troughs traced with a multi-scale valley filter" : "water mapped with k-means clustering and a self-trained classifier"}, centrelines and networks from the skeleton.`});
  return S;
}
function hashtags(){
  const fe = G.focusEff, t = ["#geomorphology", "#earthfromabove", "#satelliteimagery", "#remotesensing"];
  const more = {meander:["#rivers", "#meanders"], braided:["#braidedriver", "#rivers"], tidal:["#tidalchannels", "#saltmarsh"], delta:["#delta", "#rivers"], coast:["#coastline", "#lagoon"], lakes:["#lakes", "#permafrost"], dunes:["#dunes", "#desert"], submarine:["#bathymetry", "#oceanfloor", "#submarinecanyon"], basin:["#drainagebasin", "#topography"]}[fe] || ["#landscape"];
  const p = placeName().split(",")[0].replace(/[^\p{L}\p{N}]+/gu, ""); return [...more, ...t, ...(p ? ["#" + p] : [])].join(" ");
}
function buildCaption(){
  const place = placeName(), type = landscapeType(), sl = deckSlides().filter(s => s.kind === "finding");
  const lines = [`${place && place !== type ? place + ": " : ""}${place && place !== type ? type.toLowerCase() : type}, read from a single satellite image. Swipe for what the measurements show →`, ""];
  sl.forEach((s, i) => lines.push(`${i + 2}/ ${s.f.title} (${s.f.big} ${s.f.bigLabel}). ${s.f.text}`));
  lines.push("", "How: automatic image analysis: water & channel detection, centreline tracing and network analysis" + (G.pxm ? "" : ". No scale was set, so lengths are in pixels") + ".", "", hashtags());
  return lines.join("\n");
}
async function slideBlob(slide, i, n){ const c = document.createElement("canvas"); try { await document.fonts.ready; } catch(_){} renderSlide(c, slide, i, n, G.post); return await new Promise(r => c.toBlob(r, "image/jpeg", .92)); }
function slug(){ return (placeName() || landscapeType()).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "earthform-lens"; }
// minimal ZIP (stored, no compression)
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function makeZip(files){
  const parts = [], central = []; let off = 0; const enc = new TextEncoder();
  for (const f of files){
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const csz = central.reduce((s, a) => s + a.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type: "application/zip"});
}
async function allSlideFiles(){ const S = deckSlides(), out = []; for (let i = 0; i < S.length; i++){ out.push({name: `${slug()}-${String(i + 1).padStart(2, "0")}.jpg`, blob: await slideBlob(S[i], i, S.length)}); await tick(); } return out; }

/* ---------- Report: findings list ---------- */
function renderFindings(){
  const box = $("repFindings"); if (!box) return;
  const F = G.findings = sciEnrich(buildFindings()); if (G.post.userCmp && G.chStats){ const sel = G.chStats.filter(r => G.post.userCmp.includes(r.id)); if (sel.length) F.push(comparisonFinding(sel)); }
  if (!F.length){ box.innerHTML = `<p class="note">No specific features were measured. Try another landscape type above or inspect the image in Lab.</p>`; return; }
  const flow = G.chan ? (() => { const a = G.chan.pts[G.chan.pts.length-1], o = G.chan.pts[0]; return `<div class="card flowbar"><div><small>FLOW DIRECTION</small><p>From the <b>${whereIs(a[0], a[1])}</b> to the <b>${whereIs(o[0], o[1])}</b> <span class="note">(${G.seafloor ? "toward deeper, darker water" : G.flowWhy || "the widest end is taken as downstream"})</span>. This decides which branches count as tributaries or distributaries.${G.colourSplit ? ` At the confluence near the ${whereIs(G.colourSplit.at[0], G.colourSplit.at[1])} the water colour changes sharply, so the main channel stays with its own river and the ${G.colourSplit.dark ? "darker" : "lighter"} river is listed separately.` : ""}</p></div><button class="sm" id="repFlip">⇅ Reverse</button></div>`; })() : "";
  box.innerHTML = flow + F.map((f, i) => `<div class="fd" data-fi="${i}"><canvas width="220" height="220"></canvas><div class="fdt"><small>${f.kicker}</small><div class="fdb"><b>${f.big}</b> <span>${f.bigLabel}</span></div><h5>${f.title}</h5><p>${f.text}</p><details><summary>How it's measured</summary><p class="note">${f.why}</p></details>${f.hl ? `<button class="sm" data-fmap="${i}">Show on map ›</button>` : ""}</div></div>`).join("");
  if ($("repFlip")) $("repFlip").onclick = flipFlow;
  box.querySelectorAll(".fd").forEach(el => { const f = F[+el.dataset.fi], cv = el.querySelector("canvas"); drawScene(cv.getContext("2d"), f, 0, 0, 220, 220, {lw: .8}); });
  box.querySelectorAll("[data-fmap]").forEach(b => b.onclick = () => { const f = F[+b.dataset.fmap]; showApp("lab"); setTimeout(() => { G.hl = f.hl; if (f.hl === "branches" || f.hl === "network") showTab("network"); else if (f.hl === "compare") showTab("change"); else if (f.hl === "chanset") showTab("network"); if (f.box){ const [x0, y0, x1, y1] = f.box; zoomTo((x0+x1)/2, (y0+y1)/2, Math.max(x1-x0, y1-y0)*1.2); } else fitView(); rebuildOverlay(); requestDraw(); }, 80); });
}

/* ---------- Posts page ---------- */
function renderPosts(){
  const has = G.D && G.autoLog;
  $("postEmpty").style.display = has ? "none" : "block"; $("postBody").style.display = has ? "block" : "none";
  if (!has) return;
  if (!G.findings) G.findings = sciEnrich(buildFindings()); else sciEnrich(G.findings);
  const P = G.post;
  $("postFmt").innerHTML = [["4:5", "Carousel 4:5"], ["1:1", "Square"], ["9:16", "Story 9:16"]].map(([k, n]) => `<button class="chip${P.fmt === k ? " on" : ""}" data-pf="${k}">${n}</button>`).join("");
  $("postTheme").innerHTML = Object.entries(POST_THEME).map(([k, t]) => `<button class="chip${P.theme === k ? " on" : ""}" data-pt="${k}">${t.name}</button>`).join("");
  $("postFmt").querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { P.fmt = b.dataset.pf; renderPosts(); });
  $("postTheme").querySelectorAll("[data-pt]").forEach(b => b.onclick = () => { P.theme = b.dataset.pt; renderPosts(); });
  const S = deckSlides(), all = [{kind:"cover", key:"cover"}, ...G.findings.map(f => ({kind:"finding", key: f.key, f})), {kind:"summary", key:"summary"}];
  const strip = $("postStrip"); strip.innerHTML = "";
  let n = 0;
  for (const s0 of all){
    const off = s0.kind === "finding" && P.edits[s0.key] && P.edits[s0.key].off, s = S.find(x => x.key === s0.key) || Object.assign({}, s0, {f: Object.assign({}, s0.f)});
    const el = document.createElement("div"); el.className = "sl" + (off ? " off" : ""); const cv = document.createElement("canvas"); el.appendChild(cv);
    const idx = off ? -1 : n++; renderSlide(cv, s, Math.max(0, idx), S.length, P);
    el.insertAdjacentHTML("beforeend", `<div class="slbar"><span>${off ? "left out" : idx + 1 + " / " + S.length}</span>${s0.kind === "finding" ? `<button class="sm" data-tg>${off ? "＋ Include" : "Leave out"}</button><button class="sm" data-ed>Edit text</button>` : ""}<button class="sm" data-one>Save</button></div>`);
    const tg = el.querySelector("[data-tg]"); if (tg) tg.onclick = () => { P.edits[s0.key] = Object.assign(P.edits[s0.key] || {}, {off: !off}); renderPosts(); };
    const ed = el.querySelector("[data-ed]"); if (ed) ed.onclick = () => editSlide(s0.f);
    el.querySelector("[data-one]").onclick = async () => { if (off) return toast("Include this slide first"); const b = await slideBlob(s, idx, S.length); save(`${slug()}-${String(idx + 1).padStart(2, "0")}.jpg`, b); };
    strip.appendChild(el);
  }
  $("postCount").textContent = `${S.length} slides`;
  $("postCap").value = P.theme === "science" ? sciCaption() : buildCaption();
  const mt = P.meta; [["postSrc", "src"], ["postDate", "date"], ["postAuthor", "author"]].forEach(([id, k]) => { const el = $(id); if (el && document.activeElement !== el){ el.value = mt[k] || ""; el.onchange = () => { mt[k] = el.value.trim(); renderPosts(); }; } });
}
function editSlide(f){
  const e = G.post.edits[f.key] || {};
  modal(`<h3>Edit slide</h3><p class="note">Change the wording. The numbers come from the analysis.</p>
    <label class="note">Big number</label><input id="esBig" style="width:100%" value="${(e.big || f.big).replace(/"/g, "&quot;")}">
    <label class="note">Headline</label><input id="esTitle" style="width:100%" value="${(e.title || f.title).replace(/"/g, "&quot;")}">
    <label class="note">Text</label><textarea id="esText" style="width:100%;min-height:110px">${e.text || f.text}</textarea>
    <div class="btns"><button class="pri" id="esOk">Apply</button><button id="esReset">Reset</button><button id="esClose">Cancel</button></div>`);
  $("esOk").onclick = () => { G.post.edits[f.key] = Object.assign(G.post.edits[f.key] || {}, {big: $("esBig").value, title: $("esTitle").value, text: $("esText").value}); closeModal(); renderPosts(); };
  $("esReset").onclick = () => { const o = G.post.edits[f.key] || {}; G.post.edits[f.key] = {off: o.off}; closeModal(); renderPosts(); };
  $("esClose").onclick = closeModal;
}
if ($("postZip")) $("postZip").onclick = () => busy("Rendering slides…", async () => { const files = await allSlideFiles(); const z = await makeZip(files); save(`${slug()}-carousel.zip`, z); });
if ($("postShare")) $("postShare").onclick = async () => {
  try {
    const files = (await allSlideFiles()).map(f => new File([f.blob], f.name, {type: "image/jpeg"}));
    if (navigator.canShare && navigator.canShare({files})){ try { await navigator.clipboard.writeText($("postCap").value); } catch(_){} await navigator.share({files, text: $("postCap").value}); return; }
    toast("Sharing files isn't available here: saving a .zip instead"); const z = await makeZip(files.map(f => ({name: f.name, blob: f}))); save(`${slug()}-carousel.zip`, z);
  } catch(e){ if (e && e.name !== "AbortError") toast("Share failed: " + e.message); }
};
if ($("postCopy")) $("postCopy").onclick = async () => { try { await navigator.clipboard.writeText($("postCap").value); toast("Caption copied"); } catch(e){ $("postCap").select(); toast("Select all and copy"); } };
if ($("repPosts")) $("repPosts").onclick = () => showApp("posts");
if ($("postAuto")) $("postAuto").onclick = () => runAuto();
