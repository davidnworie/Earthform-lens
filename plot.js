/* ===================== Plot builder ===================== */
function datasets(){
  const sc = G.pxm || 1, u = G.pxm ? "m" : "px", out = [];
  const add = (key, name, rows, note) => { if (rows && rows.length) out.push({key, name, rows, note}); };
  if (G.chan){
    const c = G.chan, loc = G.chx ? G.chx.loc : null;
    add("profile", "Centreline profile (outlet → head)", c.s.map((s, i) => ({["distance_" + u]: s*sc, ["width_" + u]: c.w[i]*sc, ["curvature_1/" + u]: c.k[i]/sc, local_sinuosity: loc ? loc[i] : null, x: c.pts[i][0], y: c.pts[i][1]})).filter((_, i) => i % Math.max(1, Math.round(c.s.length/3000)) === 0));
    add("bends", "Meander bends", c.bends.map((b, i) => ({bend: i+1, ["arc_" + u]: b.arc*sc, ["chord_" + u]: b.chord*sc, ["amplitude_" + u]: b.amp*sc, ["radius_" + u]: b.Rc*sc, R_over_W: b.Rc/c.W, sinuosity: b.sin, apex_position: b.skew ?? null, compound: b.compound ? 1 : 0, side: b.side, ["distance_from_outlet_" + u]: c.s[b.i0]*sc})));
  }
  if (G.chx){
    add("necks", "Meander necks", G.chx.necks.map((n, i) => ({neck: i+1, ["gap_" + u]: n.gap*sc, gap_widths: n.ratio, ["loop_" + u]: n.loop*sc, loop_sinuosity: n.loopSin, status: n.cls})));
    add("oxbows", "Oxbow candidates", G.chx.oxbows.map((o, i) => ({oxbow: i+1, ["area_" + u + "2"]: o.area*sc*sc, ["width_" + u]: o.width*sc, ["length_" + u]: o.len*sc, width_ratio: o.rW, elongation: o.el, solidity: o.sol, ["distance_" + u]: o.dist*sc, crescent: o.crescent ? "yes" : "no"})));
  }
  if (G.tables.channelStats) add("channels", "Channel statistics (every channel)", G.tables.channelStats.map(r => { const o = {...r}; delete o.length_unit; return o; }));
  if (G.tables.lakes) add("lakes", "Lakes & ponds", G.tables.lakes);
  if (G.netx){
    add("junctions", "Junction angles", G.netx.angles.map((a, i) => ({junction: i+1, angle_deg: a.ang, x: a.x, y: a.y})));
    add("widthorder", "Width by Strahler order", G.netx.orders.map((o, i) => ({order: o, ["median_width_" + u]: G.netx.wo[i]*sc})));
  }
  if (G.net) add("horton", "Horton: streams per order", G.net.N.map((n, o) => o ? {order: o, streams: n, ["mean_length_" + u]: G.net.Lsum[o]/Math.max(1, n)*sc} : null).filter(Boolean));
  if (G.field) add("tiles", "Pattern tiles", G.field.tiles.map((t, i) => ({tile: i+1, ["spacing_" + u]: t.spacing*sc, crest_deg: ax180(t.crest), prominence: t.prom, x: t.cx, y: t.cy})));
  if (G.tables.cover) add("cover", "Surface cover classes", G.tables.cover);
  if (G.tables.longProfile) add("longprofile", "DEM main-stem long profile", G.tables.longProfile);
  if (G.tables.hypsometry) add("hyps", "Hypsometric curve", G.tables.hypsometry);
  if (G.tables.seriesDates) add("dates", "Change: by date", G.tables.seriesDates.map(r => ({...r, year: parseFloat(r.date)})));
  if (G.tables.seriesIntervals) add("intervals", "Change: by interval", G.tables.seriesIntervals);
  if (G.sv){
    const rows = [], brow = [];
    G.sv.intervals.forEach((iv, k) => {
      const nm = (G.sv.dates[iv.pathFrom ? G.sv.dates.indexOf(iv.pathFrom) : iv.a].year ?? "A") + "→" + (G.sv.dates[iv.b].year ?? "B"), pa = iv.pathFrom && iv.pathFrom.path, W = iv.W || 1;
      (iv.vecs || []).forEach(m => rows.push({interval: nm, ["distance_from_outlet_" + u]: pa ? pa.s[m.i]*sc : null, ["migration_" + u]: m.d*sc, ["migration_" + u + "_per_yr"]: iv.yrs ? m.d*sc/iv.yrs : null, ["expansion_" + u]: m.exp*sc, ["translation_" + u]: m.tr*sc, R_over_W: m.k > 0 ? 1/(m.k*W) : null}));
      (iv.bends || []).forEach(b => brow.push({interval: nm, R_over_W: b.RW, ["migration_" + u + "_per_yr"]: iv.yrs ? b.mig*sc/iv.yrs : null, migration_widths_per_yr: iv.yrs ? b.mig/W/iv.yrs : null, ["expansion_" + u + "_per_yr"]: iv.yrs ? b.exp*sc/iv.yrs : null, ["translation_" + u + "_per_yr"]: iv.yrs ? b.tr*sc/iv.yrs : null}));
    });
    add("vectors", "Change: migration vectors", rows); add("bendmig", "Change: migration by bend", brow);
  }
  return out;
}
const isNum = v => typeof v === "number" && Number.isFinite(v);
function cols(ds){ const k = Object.keys(ds.rows[0] || {}); return {num: k.filter(c => ds.rows.some(r => isNum(r[c]))), all: k}; }
const PRESETS_PLOT = [
  ["Width along channel", "profile", c => [c.num.find(x => x.startsWith("distance")), c.num.find(x => x.startsWith("width")), "line"]],
  ["Curvature along channel", "profile", c => [c.num.find(x => x.startsWith("distance")), c.num.find(x => x.startsWith("curvature")), "line"]],
  ["Local sinuosity", "profile", c => [c.num.find(x => x.startsWith("distance")), "local_sinuosity", "line"]],
  ["Bend radius vs chord", "bends", c => [c.num.find(x => x.startsWith("chord")), c.num.find(x => x.startsWith("radius")), "scatter", "power"]],
  ["Bend apex position", "bends", c => ["apex_position", null, "hist"]],
  ["Neck gaps", "necks", c => ["gap_widths", null, "hist"]],
  ["Lake sizes", "lakes", c => [c.num.find(x => x.startsWith("area")), null, "hist", null, true]],
  ["Lake shape", "lakes", c => ["elongation", "circularity", "scatter"]],
  ["Junction angles", "junctions", c => ["angle_deg", null, "hist"]],
  ["Width by order", "widthorder", c => ["order", c.num[1], "bar", null, false, true]],
  ["Horton plot", "horton", c => ["order", "streams", "bar", null, false, true]],
  ["Crest spacing map", "tiles", c => ["x", "y", "scatter", null, false, false, "prominence"]],
  ["Long profile", "longprofile", c => ["distance_m", "elevation_m", "line"]],
  ["Hypsometric curve", "hyps", c => ["rel_area", "rel_height", "line"]],
  ["Water over time", "dates", c => ["year", c.num.find(x => x.startsWith("water")), "line"]],
  ["Sinuosity over time", "dates", c => ["year", "sinuosity", "line"]],
  ["Migration along channel", "vectors", c => [c.num.find(x => x.startsWith("distance")), c.num.find(x => x.endsWith("per_yr")) || c.num.find(x => x.startsWith("migration")), "scatter"]],
  ["Migration vs R/W", "bendmig", c => ["R_over_W", "migration_widths_per_yr", "scatter", null, true]],
];
G.plot = {ds: null, x: null, y: null, type: "scatter", color: "", logx: false, logy: false, fit: "none"};
function renderPlotUI(){
  const box = $("plotUI"); if (!box) return;
  const D = datasets();
  if (!D.length){ box.innerHTML = '<p class="note">Run an analysis first (or ✦ Run everything automatically). Every table it produces can be plotted here.</p>'; $("plotOut").innerHTML = ""; return; }
  const P = G.plot; if (!P.ds || !D.find(d => d.key === P.ds)) P.ds = D[0].key;
  const ds = D.find(d => d.key === P.ds), C = cols(ds);
  if (!C.num.includes(P.x)) P.x = C.num[0]; if (P.y && !C.num.includes(P.y)) P.y = C.num[1] || null; if (P.y === undefined) P.y = C.num[1] || null;
  const opt = (list, sel, none) => (none ? `<option value="">${none}</option>` : "") + list.map(c => `<option value="${c}" ${c === sel ? "selected" : ""}>${c}</option>`).join("");
  const avail = PRESETS_PLOT.filter(p => D.some(d => d.key === p[1]));
  box.innerHTML = `
    <div class="chips">${avail.map((p, i) => `<button class="chip" data-pp="${PRESETS_PLOT.indexOf(p)}">${p[0]}</button>`).join("")}</div>
    <div class="row"><label>Data</label><select id="plDs" style="flex:1">${D.map(d => `<option value="${d.key}" ${d.key === P.ds ? "selected" : ""}>${d.name} (${d.rows.length})</option>`).join("")}</select></div>
    <div class="row"><label>X</label><select id="plX" style="flex:1">${opt(C.num, P.x)}</select></div>
    <div class="row"><label>Y</label><select id="plY" style="flex:1">${opt(C.num, P.y, "(none: histogram)")}</select></div>
    <div class="row"><label>Colour by</label><select id="plC" style="flex:1">${opt(C.all, P.color, "(none)")}</select></div>
    <div class="chips" id="plType">${[["scatter","Scatter"],["line","Line"],["bar","Bars"],["hist","Histogram"]].map(([k, n]) => `<button class="chip${P.type === k ? " on" : ""}" data-pt="${k}">${n}</button>`).join("")}</div>
    <div class="btns"><label class="note"><input type="checkbox" id="plLx" ${P.logx ? "checked" : ""}> log X</label><label class="note"><input type="checkbox" id="plLy" ${P.logy ? "checked" : ""}> log Y</label>
      <select id="plFit"><option value="none">no fit</option><option value="linear" ${P.fit === "linear" ? "selected" : ""}>linear fit</option><option value="power" ${P.fit === "power" ? "selected" : ""}>power-law fit</option><option value="exp" ${P.fit === "exp" ? "selected" : ""}>exponential fit</option></select></div>`;
  box.querySelectorAll("[data-pp]").forEach(b => b.onclick = () => {
    const p = PRESETS_PLOT[+b.dataset.pp], d2 = D.find(d => d.key === p[1]); const [x, y, t, fit, lx, ints, col] = p[2](cols(d2));
    Object.assign(G.plot, {ds: p[1], x, y: y || "", type: t, fit: fit || "none", logx: !!lx && t !== "hist", logy: false, color: col || ""}); if (t === "hist") G.plot.logx = !!lx;
    renderPlotUI();
  });
  $("plDs").onchange = e => { P.ds = e.target.value; P.x = null; P.y = undefined; P.color = ""; renderPlotUI(); };
  $("plX").onchange = e => { P.x = e.target.value; drawPlot(); };
  $("plY").onchange = e => { P.y = e.target.value || null; if (!P.y) P.type = "hist"; else if (P.type === "hist") P.type = "scatter"; renderPlotUI(); };
  $("plC").onchange = e => { P.color = e.target.value; drawPlot(); };
  box.querySelectorAll("[data-pt]").forEach(b => b.onclick = () => { P.type = b.dataset.pt; if (P.type !== "hist" && !P.y) P.y = C.num[1] || C.num[0]; renderPlotUI(); });
  $("plLx").onchange = e => { P.logx = e.target.checked; drawPlot(); };
  $("plLy").onchange = e => { P.logy = e.target.checked; drawPlot(); };
  $("plFit").onchange = e => { P.fit = e.target.value; drawPlot(); };
  drawPlot();
}
const PAL = ["#3fc1d3","#ff7a45","#e8c547","#5bd17a","#c86bff","#ff4d7e","#7fdcff","#ffffff"];
function drawPlot(){
  const P = G.plot, D = datasets(), ds = D.find(d => d.key === P.ds); if (!ds) return;
  const out = $("plotOut"); out.innerHTML = `<canvas id="plCv" class="chart" style="height:280px"></canvas><div id="plStats" class="note"></div>
    <div class="btns"><button class="sm" id="plPng">Save PNG</button><button class="sm" id="plCsv">Save data (CSV)</button></div>`;
  const cv = $("plCv"), r = cv.getBoundingClientRect(); if (r.width < 20){ cv._pending = drawPlot; return; }
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width*dpr*1.5; cv.height = r.height*dpr*1.5;
  const c = cv.getContext("2d"); c.setTransform(dpr*1.5, 0, 0, dpr*1.5, 0, 0); const W = r.width, H = r.height, m = {l:54, r:14, t:26, b:38};
  c.fillStyle = "#15171a"; c.fillRect(0, 0, W, H);
  let rows = ds.rows.filter(rw => isNum(rw[P.x]) && (P.type === "hist" || isNum(rw[P.y])));
  if (P.logx) rows = rows.filter(rw => rw[P.x] > 0); if (P.logy && P.type !== "hist") rows = rows.filter(rw => rw[P.y] > 0);
  if (!rows.length){ $("plStats").textContent = "No numeric data for these columns."; return; }
  const tx = v => P.logx ? Math.log10(v) : v, ty = v => P.logy ? Math.log10(v) : v;
  // series
  let X, Y, groups = null, cnum = null;
  if (P.type === "hist"){
    const v = rows.map(rw => tx(rw[P.x])), a = quantile(v, 0), b = quantile(v, 1), nb = Math.min(40, Math.max(8, Math.round(Math.sqrt(v.length)*1.5))), bw = (b - a)/nb || 1, cnt = new Array(nb).fill(0);
    v.forEach(x => cnt[Math.min(nb-1, Math.max(0, Math.floor((x - a)/bw)))]++);
    X = cnt.map((_, i) => a + (i + .5)*bw); Y = cnt; P._bw = bw;
  } else { X = rows.map(rw => tx(rw[P.x])); Y = rows.map(rw => ty(rw[P.y])); }
  if (P.color && P.type !== "hist"){
    const vals = rows.map(rw => rw[P.color]);
    if (vals.every(v => isNum(v)) && new Set(vals).size > 8){ const lo = quantile(vals, .02), hi = quantile(vals, .98); cnum = vals.map(v => clamp((v - lo)/((hi - lo) || 1), 0, 1)); cnum.lo = lo; cnum.hi = hi; }
    else { const keys = [...new Set(vals.map(String))].slice(0, 8); groups = vals.map(v => keys.indexOf(String(v))); groups.keys = keys; }
  }
  let x0 = Math.min(...X), x1 = Math.max(...X), y0 = P.type === "hist" || P.type === "bar" ? 0 : Math.min(...Y), y1 = Math.max(...Y);
  if (P.type === "hist"){ x0 -= P._bw/2; x1 += P._bw/2; }
  if (x1 === x0){ x0 -= 1; x1 += 1; } if (y1 === y0){ y0 -= 1; y1 += 1; }
  const px0 = (x1 - x0)*.03, py0 = (y1 - y0)*.05; if (P.type !== "hist" && P.type !== "bar"){ x0 -= px0; x1 += px0; y0 -= py0; } y1 += py0;
  const sx = v => m.l + (v - x0)/(x1 - x0)*(W - m.l - m.r), sy = v => H - m.b - (v - y0)/(y1 - y0)*(H - m.t - m.b);
  c.font = "10px JetBrains Mono, monospace"; c.strokeStyle = "#2a2e33"; c.fillStyle = "#8b929a";
  for (const v of niceTicks(x0, x1, 5)){ const X0 = sx(v); c.beginPath(); c.moveTo(X0, m.t); c.lineTo(X0, H - m.b); c.stroke(); c.textAlign = "center"; c.fillText(P.logx ? tfmt(Math.pow(10, v)) : tfmt(v), X0, H - m.b + 13); }
  for (const v of niceTicks(y0, y1, 5)){ const Y0 = sy(v); c.beginPath(); c.moveTo(m.l, Y0); c.lineTo(W - m.r, Y0); c.stroke(); c.textAlign = "right"; c.fillText(P.logy && P.type !== "hist" ? tfmt(Math.pow(10, v)) : tfmt(v), m.l - 5, Y0 + 3); }
  c.fillStyle = "#cfd4d9"; c.font = "11px Space Grotesk, sans-serif"; c.textAlign = "center"; c.fillText(P.x + (P.logx ? " (log)" : ""), (m.l + W - m.r)/2, H - 6);
  c.save(); c.translate(12, (m.t + H - m.b)/2); c.rotate(-Math.PI/2); c.fillText(P.type === "hist" ? "count" : P.y + (P.logy ? " (log)" : ""), 0, 0); c.restore();
  c.textAlign = "left"; c.fillStyle = "#eef0f2"; c.font = "12px Space Grotesk, sans-serif"; c.fillText(ds.name + (P.type === "hist" ? " · histogram" : ""), m.l, 16);
  const col = i => cnum ? `hsl(${220 - cnum[i]*200},85%,58%)` : groups ? PAL[groups[i] % PAL.length] : "#3fc1d3";
  if (P.type === "hist" || P.type === "bar"){
    const bw = P.type === "hist" ? P._bw : (x1 - x0)/Math.max(4, X.length*1.6);
    X.forEach((x, i) => { const a = sx(x - bw/2), b = sx(x + bw/2); c.fillStyle = col(i); c.fillRect(a + 1, sy(Y[i]), Math.max(1, b - a - 2), sy(y0) - sy(Y[i])); });
  } else if (P.type === "line"){
    const idx = X.map((_, i) => i).sort((a, b) => X[a] - X[b]);
    const series = groups ? groups.keys.map((_, g) => idx.filter(i => groups[i] === g)) : [idx];
    series.forEach((s, g) => { c.strokeStyle = groups ? PAL[g % PAL.length] : "#3fc1d3"; c.lineWidth = 1.6; c.beginPath(); s.forEach((i, k) => k ? c.lineTo(sx(X[i]), sy(Y[i])) : c.moveTo(sx(X[i]), sy(Y[i]))); c.stroke(); });
    if (X.length < 60) X.forEach((x, i) => { c.fillStyle = col(i); c.beginPath(); c.arc(sx(x), sy(Y[i]), 2.6, 0, 7); c.fill(); });
  } else {
    const rad = X.length > 2000 ? 1.4 : X.length > 300 ? 2.2 : 3.4;
    X.forEach((x, i) => { c.fillStyle = col(i); c.globalAlpha = X.length > 1000 ? .6 : .9; c.beginPath(); c.arc(sx(x), sy(Y[i]), rad, 0, 7); c.fill(); }); c.globalAlpha = 1;
  }
  // fit
  let stats = `${rows.length} points`;
  if (P.type !== "hist" && P.fit !== "none" && X.length > 2){
    const rx = rows.map(rw => rw[P.x]), ry = rows.map(rw => rw[P.y]);
    let f, eq, pred;
    if (P.fit === "linear"){ f = linfit(rx, ry); eq = `y = ${fx(f.b, 4)}·x + ${fx(f.a, 3)}`; pred = x => f.a + f.b*x; }
    else if (P.fit === "power"){ const ok = rx.map((x, i) => x > 0 && ry[i] > 0); f = linfit(rx.filter((_, i) => ok[i]).map(Math.log10), ry.filter((_, i) => ok[i]).map(Math.log10)); eq = `y = ${fx(Math.pow(10, f.a), 3)}·x^${fx(f.b, 3)}`; pred = x => Math.pow(10, f.a)*Math.pow(x, f.b); }
    else { const ok = ry.map(y => y > 0); f = linfit(rx.filter((_, i) => ok[i]), ry.filter((_, i) => ok[i]).map(Math.log)); eq = `y = ${fx(Math.exp(f.a), 3)}·e^(${fx(f.b, 4)}·x)`; pred = x => Math.exp(f.a + f.b*x); }
    const xs2 = []; const lo = P.logx ? Math.pow(10, x0) : x0, hi = P.logx ? Math.pow(10, x1) : x1;
    for (let k = 0; k <= 80; k++){ const t = k/80; xs2.push(P.logx ? Math.pow(10, Math.log10(Math.max(lo, 1e-12)) + t*(Math.log10(hi) - Math.log10(Math.max(lo, 1e-12)))) : lo + t*(hi - lo)); }
    c.strokeStyle = "#ff7a45"; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); let st = false;
    xs2.forEach(x => { const y = pred(x); if (!Number.isFinite(y) || (P.logy && y <= 0)) { st = false; return; } const X0 = sx(tx(x)), Y0 = sy(ty(y)); if (Y0 < m.t - 20 || Y0 > H) { st = false; return; } st ? c.lineTo(X0, Y0) : c.moveTo(X0, Y0); st = true; }); c.stroke(); c.setLineDash([]);
    stats += ` · ${eq} · R² = ${fx(f.r2, 3)}`;
  }
  if (P.type === "hist"){ const v = rows.map(rw => rw[P.x]); stats += ` · median ${fx(median(v), 3)} · mean ${fx(mean(v), 3)} · IQR ${fx(quantile(v, .25), 3)}–${fx(quantile(v, .75), 3)}`; }
  else if (X.length > 2){ const f = linfit(rows.map(rw => rw[P.x]), rows.map(rw => rw[P.y])); if (P.fit === "none") stats += ` · Pearson r = ${fx(Math.sign(f.b)*Math.sqrt(f.r2), 3)}`; }
  // legend
  if (groups){ c.font = "10px Space Grotesk, sans-serif"; let lx = W - m.r - 6; groups.keys.slice().reverse().forEach((k, j) => { const g = groups.keys.length - 1 - j, t = String(k).slice(0, 14), tw = c.measureText(t).width; lx -= tw + 18; c.fillStyle = PAL[g % PAL.length]; c.fillRect(lx, 9, 9, 9); c.fillStyle = "#cfd4d9"; c.textAlign = "left"; c.fillText(t, lx + 12, 17); }); }
  if (cnum){ c.font = "10px Space Grotesk, sans-serif"; c.fillStyle = "#cfd4d9"; c.textAlign = "right"; c.fillText(`${P.color}: ${fx(cnum.lo, 2)} (blue) → ${fx(cnum.hi, 2)} (red)`, W - m.r, 17); }
  $("plStats").textContent = stats;
  $("plPng").onclick = async () => { const b = await new Promise(rs => cv.toBlob(rs, "image/png")); save(base() + "-" + P.ds + "-plot.png", b); };
  $("plCsv").onclick = () => save(base() + "-" + P.ds + ".csv", toCSV(ds.rows));
}
