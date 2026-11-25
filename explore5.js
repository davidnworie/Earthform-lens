/* ===================== Map legend and the clean (white-background) river view ===================== */

// more "Colour by" choices
Object.assign(XMETRIC, {
  curvature: {n: "Curvature", u: "rad/km", log: true, get: (R, i) => { const r = reachAt(R, R.cum[i]); if (r && r.meanK == null) curvatureStats(R, r); return r ? r.meanK : NaN; }},
  wavelength: {n: "Meander wavelength", u: "km", log: true, get: (R, i) => { const r = reachAt(R, R.cum[i]); return r ? r.lambda : NaN; }},
  confinement: {n: "Floodplain ÷ channel width", u: "", log: true, get: (R, i) => { const r = reachAt(R, R.cum[i]); return r ? r.confine : NaN; }},
  braiding: {n: "Braiding index", u: "", get: (R, i) => { const r = reachAt(R, R.cum[i]); return r && r.width ? r.width.braid : NaN; }},
});
{ const ms = $("xMetric"); if (ms && ms.options.length){ const have = new Set([...ms.options].map(o => o.value)); for (const [k, m] of Object.entries(XMETRIC)) if (!have.has(k)) ms.add(new Option(m.n, k)); } }
const ZONE_CAT = [["source", "Potential source", "#e8452c"], ["transfer", "Transfer", "#f7b733"], ["storage", "Storage", "#4aa8ff"], ["sink", "Terminal sink", "#9b6bff"]];

/* ---------- legend on the main map for the “Colour by” setting ---------- */
function drawMapLegend(ctx, w, h){
  const L = XR.legend; if (XR._inRot || !L || L.key === "plain") return; if (XR.tab === "width" && L.key !== "width_st" && (XR.river && stationsIn(XR.river, 0, XR.river.L, true).length)) return; const met = L.met, plainBg = EX.base[XR.base].plain;
  const ctl = document.querySelector(".xmapctl"), ch = ctl ? ctl.offsetHeight : 40, bw = Math.min(200, w*.5), x = 10, y = h - ch - 26 - 60, pad = 8;
  ctx.save(); ctx.font = "600 11px Inter, sans-serif";
  const fcl = furnLegendCols(plainBg), bg = fcl.bg, fg = fcl.fg, mu = fcl.mu;
  if (L.key === "zone"){ const rows = ZONE_CAT, hh = 18 + rows.length*15 + pad; ctx.fillStyle = bg; roundRect(ctx, x, y - hh + 50, bw, hh, 8); ctx.fill(); let yy = y - hh + 50 + 16; ctx.fillStyle = fg; ctx.fillText("Sediment routing (interpretation)", x + pad, yy); yy += 6;
    for (const [, t, c] of rows){ yy += 15; ctx.fillStyle = c; ctx.fillRect(x + pad, yy - 8, 18, 6); ctx.fillStyle = fg; ctx.font = "500 11px Inter, sans-serif"; ctx.fillText(t, x + pad + 26, yy - 2); } ctx.restore(); return; }
  if (!L.n){ ctx.fillStyle = bg; roundRect(ctx, x, y + 8, bw, 36, 8); ctx.fill(); ctx.fillStyle = mu; ctx.font = "500 11px Inter, sans-serif"; ctx.fillText(`${met.n}: not measured yet`, x + pad, y + 30); ctx.restore(); return; }
  ctx.fillStyle = bg; roundRect(ctx, x, y, bw, 52, 8); ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(`${met.n}${met.u ? " (" + met.u + ")" : ""}${met.log ? " · log scale" : ""}`, x + pad, y + 16);
  const gx = x + pad, gy = y + 23, gw = bw - 2*pad; for (let i = 0; i < gw; i++){ const u = i/(gw - 1); ctx.fillStyle = xcol(L.inv ? 1 - u : u); ctx.fillRect(gx + i, gy, 1.2, 9); }
  const val = u => { const t = L.lo + (L.hi - L.lo)*u; return met.log ? 10**t : t; };
  ctx.fillStyle = mu; ctx.font = "500 10px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText((L.clipLo ? "≤ " : "") + tfmt(val(0)), gx, gy + 21); ctx.textAlign = "center"; ctx.fillText(tfmt(val(.5)), gx + gw/2, gy + 21); ctx.textAlign = "right"; ctx.fillText((L.clipHi ? "≥ " : "") + tfmt(val(1)), gx + gw, gy + 21);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------- clean view: the river alone, to scale, on white ---------- */
// Plan view (single map, or the same river side by side coloured by different attributes, with linked zoom),
// explain layers (how sinuosity and knickpoints are calculated, drawn on the river and the profile),
// movable legend / scale bar / north arrow / key, label collision avoidance, and a multi-attribute plot panel
// (stacked or overlaid) sharing the downstream axis with the map.
const CV = {metric: "elevation", layout: "single", attrs: ["elevation", "sinuosity", "zone"],
  show: {tribs: true, side: true, dams: true, knick: true, reaches: true, values: false, transects: false, km: true, labels: true, zones: false, sel: true, sinu: false, valley: false, knickx: false},
  ui: {legend: true, scale: true, north: true, key: true, inset: true}, pos: {legend: [.97, .97], scale: [.02, .97], north: [.97, .03], key: [.015, .12], inset: [.97, .18]}, arrange: false,
  plots: ["elevation", "sinuosity"], plotMode: "stack", prof: {alt: true, raw: true, spikes: true, smooth: false, cond: true, unc: true}, vb: null, geo: null};
const cvCol = u => vir(u);
const CVM = () => Object.entries(XMETRIC).filter(([k]) => k !== "plain");
function cvMetricOpts(sel){ return CVM().map(([k, m]) => `<option value="${k}"${k === sel ? " selected" : ""}>${m.n}</option>`).join(""); }
function openCleanView(){
  const R = XR.river; if (!R) return toast("Load a river first");
  if (XR.metric && XR.metric !== "plain") CV.metric = XR.metric;
  let el = document.getElementById("cvWrap"); if (!el){ el = document.createElement("div"); el.id = "cvWrap"; document.body.appendChild(el); }
  el.innerHTML = `<div class="cvbox"><div class="cvhead"><div class="cvt"><b>${esc(R.name)}</b><small>${esc(R.region || "")} · clean view, to scale</small></div>
      <div class="cvbtn"><button class="sm" id="cvFit">⤢ Fit</button><button class="sm" id="cvSel">Fit selection</button><button class="sm${CV.arrange ? " pri" : ""}" id="cvArr" title="Drag the legend, scale bar, north arrow and key">✥ Move legend & scale</button><button class="sm" id="cvHelp">? How to read</button><button class="sm" id="cvSvg">⬇ SVG</button><button class="sm" id="cvPng">⬇ PNG</button><button class="sm" id="cvPdf">⬇ PDF</button><button class="sm pri" id="cvX">✕ Close</button></div></div>
    <div class="cvbar" id="cvBar"></div>
    <div class="cvhelp" id="cvHelpBox" style="display:none"></div>
    <div class="cvmain"><svg id="cvPlan" xmlns="http://www.w3.org/2000/svg"></svg><svg id="cvOver" xmlns="http://www.w3.org/2000/svg"></svg><div id="cvTip" class="cvtip"></div></div>
    <div class="cvstrips"><div class="cvpbar" id="cvPBar"></div><svg id="cvProf"></svg></div>
    <p class="cvnote" id="cvNote"></p></div>`;
  el.classList.add("on"); document.body.style.overflow = "hidden";
  CV.geo = cvGeometry(R); CV.vb = null; cvBar(); cvPBar(); cvFit();
  $("cvX").onclick = closeCleanView; $("cvFit").onclick = () => { CV.vb = null; cvFit(); }; $("cvSel").onclick = () => { const s = selRange(); cvFit(s.k0, s.k1); };
  $("cvArr").onclick = () => { CV.arrange = !CV.arrange; $("cvArr").classList.toggle("pri", CV.arrange); $("cvOver").style.pointerEvents = CV.arrange ? "auto" : "none"; cvDraw(); toast(CV.arrange ? "Drag the legend, scale bar, north arrow or key; press again when done" : "Layout saved"); };
  $("cvHelp").onclick = () => { const h = $("cvHelpBox"); h.style.display = h.style.display === "none" ? "" : "none"; h.innerHTML = cvHelpHTML(); };
  $("cvSvg").onclick = () => save(R.name.replace(/[^\w]+/g, "_") + "_clean_view.svg", cvExportSVG());
  $("cvPng").onclick = () => svgToPng(cvExportSVG(), 3).then(b => save(R.name.replace(/[^\w]+/g, "_") + "_clean_view.png", b)).catch(e => toast(e.message));
  $("cvPdf").onclick = () => { const svg = cvExportSVG(), w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print the PDF, or use SVG"); w.document.write(`<!DOCTYPE html><html><head><title>${esc(R.name)} clean view</title><style>@page{size:auto;margin:10mm}body{margin:0}svg{width:100%;height:auto}</style></head><body>${svg}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); };
  cvWire(); cvWireOverlay(); window.addEventListener("resize", cvDraw); document.addEventListener("keydown", cvKey);
  CV.inset = null; cvMakeInset().catch(e => console.warn("inset", e));
}
function cvKey(e){ if (e.key === "Escape") closeCleanView(); }
function closeCleanView(){ const el = document.getElementById("cvWrap"); if (el){ el.classList.remove("on"); el.innerHTML = ""; } document.body.style.overflow = ""; window.removeEventListener("resize", cvDraw); document.removeEventListener("keydown", cvKey); }
/** controls above the map: layout, colour(s), layers, explain layers, map furniture */
function cvBar(){
  const b = $("cvBar"), S = CV.show, chip = (k, t, grp) => `<button class="chip${(grp === "ui" ? CV.ui[k] : S[k]) ? " on" : ""}" data-${grp === "ui" ? "cu" : "cv"}="${k}">${t}</button>`;
  b.innerHTML = `<div class="cvrow"><span class="cvl">Map</span><select id="cvLay"><option value="single"${CV.layout === "single" ? " selected" : ""}>Single map</option><option value="side"${CV.layout === "side" ? " selected" : ""}>Side by side (linked zoom)</option></select>
      ${CV.layout === "single" ? `<label>Colour by <select id="cvMet">${cvMetricOpts(CV.metric)}</select></label>` : [0, 1, 2].map(i => `<select data-ca="${i}"><option value="">—</option>${cvMetricOpts(CV.attrs[i])}</select>`).join("")}</div>
    <div class="cvrow"><span class="cvl">Show</span>${[["tribs", "Tributaries"], ["side", "Side channels"], ["dams", "Dams & weirs"], ["knick", "Knickpoints"], ["reaches", "Reach boundaries"], ["values", "Values on reaches"], ["transects", "Width transects"], ["km", "Distance marks"], ["labels", "Names"], ["zones", "Sediment zones"], ["sel", "Selected stretch"], ...(XR.dn && XR.dn.segs ? [["net", "Channel network"]] : [])].map(([k, t]) => chip(k, t)).join("")}</div>
    <div class="cvrow"><span class="cvl">Explain</span>${chip("sinu", "How sinuosity is measured")}${chip("valley", "Valley axis")}${chip("knickx", "How knickpoints are found")}<span class="cvl">Furniture</span>${chip("legend", "Legend", "ui")}${chip("scale", "Scale bar", "ui")}${chip("north", "North arrow", "ui")}${chip("key", "Symbol key", "ui")}${chip("inset", "Location inset", "ui")}<button class="chip" id="cvFurn">⚙ Size & style</button></div>`;
  if ($("cvMet")) $("cvMet").onchange = e => { CV.metric = e.target.value; cvDraw(); };
  $("cvLay").onchange = e => { CV.layout = e.target.value; cvBar(); cvDraw(); };
  b.querySelectorAll("[data-ca]").forEach(s => s.onchange = e => { CV.attrs[+s.dataset.ca] = e.target.value; cvDraw(); });
  b.querySelectorAll("[data-cv]").forEach(x => x.onclick = () => { S[x.dataset.cv] = !S[x.dataset.cv]; x.classList.toggle("on", S[x.dataset.cv]); cvDraw(); });
  { const fb = b.querySelector("#cvFurn"); if (fb) fb.onclick = () => furnDialog(); }
  b.querySelectorAll("[data-cu]").forEach(x => x.onclick = () => { CV.ui[x.dataset.cu] = !CV.ui[x.dataset.cu]; x.classList.toggle("on", CV.ui[x.dataset.cu]); cvDraw(); });
}
/** controls of the plot panel */
const PLOTS = () => [["elevation", "Elevation profile"], ...CVM().filter(([k]) => k !== "elevation").map(([k, m]) => [k, m.n])];
function cvPBar(){
  const b = $("cvPBar"); b.innerHTML = `<span class="cvl">Plots</span>${PLOTS().map(([k, n]) => `<button class="chip${CV.plots.includes(k) ? " on" : ""}" data-pl="${k}">${n}</button>`).join("")}
    <select id="cvPM"><option value="stack"${CV.plotMode === "stack" ? " selected" : ""}>Stacked (one panel each)</option><option value="overlay"${CV.plotMode === "overlay" ? " selected" : ""}>Overlaid (each scaled 0–1)</option></select>
    ${CV.plots.includes("elevation") ? `<span class="cvl">Profile</span>${[["raw", "Raw samples"], ["spikes", "Removed spikes"], ["smooth", "Smoothed"], ["cond", "Conditioned"], ["unc", "Uncertainty band"], ...(XR.river.prof && XR.river.prof.alt ? [["alt", "Second source"]] : [])].map(([k, t]) => `<button class="chip${CV.prof[k] ? " on" : ""}" data-pp="${k}">${t}</button>`).join("")}` : ""}`;
  b.querySelectorAll("[data-pl]").forEach(x => x.onclick = () => { const k = x.dataset.pl; CV.plots = CV.plots.includes(k) ? CV.plots.filter(p => p !== k) : [...CV.plots, k]; cvPBar(); cvPlots(); });
  b.querySelectorAll("[data-pp]").forEach(x => x.onclick = () => { CV.prof[x.dataset.pp] = !CV.prof[x.dataset.pp]; cvPBar(); cvPlots(); });
  $("cvPM").onchange = e => { CV.plotMode = e.target.value; cvPlots(); };
}
function cvHelpHTML(){ const pr = XR.river.prof, P = pr ? pr.params : {};
  return `<div class="cvhgrid"><div><b>Profile lines</b><p><span class="sw" style="background:#9aa5b1"></span>Raw samples: elevation read from the terrain tiles every ${pr ? nf(P.stepKm*1000) : "–"} m along the centreline (lowest of the 3×3 cells, to stay on the channel rather than the banks).</p><p><span class="sw" style="background:#e45756"></span>Removed spikes: raw samples far from their neighbours (more than ${P.spikeK || 4}× the local median absolute deviation, at least 8 m). Downward spikes are usually voids or water-surface artefacts in the terrain data; upward ones bridges or embankments. ${pr && pr.spikes ? pr.spikes.length : 0} removed here.</p><p><span class="sw" style="background:#7f7f7f;height:2px"></span>Smoothed: running median over ${pr ? nf(P.smoothKm, 2) : "–"} km.</p><p><span class="sw" style="background:#1f77b4"></span>Conditioned: the smoothed profile forced to never rise downstream (${pr ? esc(P.cond) : "–"}). Gradient, knickpoints and concavity use this line.</p></div>
    <div><b>Sinuosity</b><p>For each reach: the length of the river channel between the reach ends divided by the straight-line distance between them. 1 = straight; above 1.5 = meandering. Turn on “How sinuosity is measured” to see each straight line and its ratio drawn on the map. Valley-axis sinuosity divides by the length of the valley axis (the centreline smoothed over about one meander wavelength) instead.</p></div>
    <div><b>Knickpoints</b><p>The local gradient is measured over ${pr ? nf(P.slopeKm, 2) : "–"} km and compared with the gradient over a ${pr ? nf(P.contextKm || 0, 0) : "–"} km context window. A knickpoint is marked where the local gradient is at least ${P.kRatio || 2.5}× the context gradient, is a local maximum, and the drop across the local window exceeds ${P.kDrop ?? 5} m. Turn on “How knickpoints are found” to see both windows and the numbers.</p></div>
    <div><b>Map</b><p>True-scale plan in a local equirectangular projection. Colours use a perceptually ordered scale (dark = low, yellow = high) except sediment zones (categories). Use “Side by side” to compare attributes with linked zoom, and “Move legend & scale” to drag the map furniture.</p></div></div>`; }
/** all geometry in a local metric frame (km east, km south) centred on the river */
function cvGeometry(R){
  const st = Math.max(.02, R.L/4000), pts = resampleKm(R, 0, R.L, st), lat0 = pts.reduce((a, p) => a + p[0], 0)/pts.length, lon0 = pts.reduce((a, p) => a + p[1], 0)/pts.length, loc = a => toLocal(a, lat0, lon0);
  return {st, lat0, lon0, main: loc(pts), km: pts.map((_, i) => Math.min(R.L, i*st)), side: R.side.map(s => loc(s)), tribs: R.tribs.map(t => ({t, stub: t.stub ? loc(t.stub) : null, p: loc([[t.lat, t.lon]])[0]})), dams: R.dams.map(d => ({d, p: loc([[d.lat, d.lon]])[0]})), loc};
}
const cvPanels = () => CV.layout === "side" ? CV.attrs.filter(Boolean).slice(0, 3) : [CV.metric];
function cvSize(){ const s = $("cvPlan"); const r = s.getBoundingClientRect(); return [Math.max(200, r.width), Math.max(200, r.height)]; }
function cvFit(k0, k1){ const G = CV.geo; let pts = G.main; if (k0 != null){ pts = G.main.filter((_, i) => G.km[i] >= k0 && G.km[i] <= k1); if (pts.length < 2) pts = G.main; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const [W, H] = cvSize(), Wp = W/cvPanels().length, m = .1, sx = (x1 - x0)*(1 + 2*m) || 1, sy = (y1 - y0)*(1 + 2*m) || 1, s = Math.max(sx/Wp, sy/H); CV.vb = {cx: (x0 + x1)/2, cy: (y0 + y1)/2, s}; cvDraw(); }
function cvValuesFor(metric){ const R = XR.river, met = XMETRIC[metric], G = CV.geo, v = G.km.map(k => { if (metric === "zone"){ const r = reachAt(R, k); return r && r.zone ? r.zone : null; } const i = idxAtKm(R, k), x = met.get(R, i); return Number.isFinite(x) && (!met.log || x > 0) ? (met.log ? Math.log10(x) : x) : NaN; });
  const f = v.filter(Number.isFinite); return {v, lo: f.length ? quantile(f, .02) : 0, hi: f.length ? quantile(f, .98) : 1, n: f.length, met, metric}; }
const zoneCol = z => { const c = ZONE_CAT.find(q => q[0] === z); return c ? c[2] : "#9aa3ad"; };
function cvColorFn(V){ return i => { const x = V.v[i]; if (V.metric === "zone") return x ? zoneCol(x) : "#9aa3ad"; return Number.isFinite(x) ? cvCol((x - V.lo)/((V.hi - V.lo) || 1)) : "#b8c0c8"; }; }
/** simple label placement: skip a label whose box overlaps one already placed */
function labeler(){ const boxes = []; return (x, y, w, h) => { for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; boxes.push([x, y, w, h]); return true; }; }
/** one map panel */
function cvPanel(metric, ox, Wp, H, V){
  const R = XR.river, G = CV.geo, vb = CV.vb, qc = Math.cos(CV.rot || 0), qs = Math.sin(CV.rot || 0), X = p => ((p[0] - vb.cx)*qc - (p[1] - vb.cy)*qs)/vb.s + Wp/2 + ox, Y = p => ((p[0] - vb.cx)*qs + (p[1] - vb.cy)*qc)/vb.s + H/2, S = CV.show, colOf = cvColorFn(V), place = labeler();
  const pl = arr => arr.map(p => X(p).toFixed(1) + "," + Y(p).toFixed(1)).join(" ");
  const txt = (x, y, t, o = {}) => { const fs = o.fs || 10.5, w = t.length*fs*.58 + (o.box ? 8 : 2), h = fs + (o.box ? 6 : 2), bx = o.anchor === "end" ? x - w : x, by = y - fs; if (!place(bx - 2, by - 2, w + 4, h + 4)) return ""; return (o.box ? `<rect x="${bx - 3}" y="${by - 3}" width="${w}" height="${h}" rx="3" fill="#fff" stroke="${o.stroke || "#bbb"}" stroke-width=".6"/>` : "") + `<text x="${x}" y="${y}" font-size="${fs}" fill="${o.fill || "#222"}" font-weight="${o.bold ? 600 : 400}"${o.anchor === "end" ? ' text-anchor="end"' : ""}>${esc(t)}</text>`; };
  let s = `<g clip-path="url(#cvClip${ox})"><rect x="${ox}" width="${Wp}" height="${H}" fill="#ffffff"/>`;
  const i0k = k => Math.max(0, Math.min(G.main.length - 1, Math.round(k/G.st)));
  if (S.zones) for (const r of R.reaches || []){ if (!r.zone) continue; s += `<polyline points="${pl(G.main.slice(i0k(r.k0), i0k(r.k1) + 1))}" fill="none" stroke="${zoneCol(r.zone)}" stroke-opacity=".28" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`; }
  if (S.sel && XR.range && XR.range.R === R) s += `<polyline points="${pl(G.main.slice(i0k(XR.range.k0), i0k(XR.range.k1) + 1))}" fill="none" stroke="#ffcf33" stroke-opacity=".55" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (S.knickx && R.prof) for (const k of R.prof.knick) if (k.win) s += `<polyline points="${pl(G.main.slice(i0k(k.ctx[0]), i0k(k.ctx[1]) + 1))}" fill="none" stroke="#ff7f0e" stroke-opacity=".18" stroke-width="12" stroke-linecap="round"/><polyline points="${pl(G.main.slice(i0k(k.win[0]), i0k(k.win[1]) + 1))}" fill="none" stroke="#ff7f0e" stroke-opacity=".6" stroke-width="10" stroke-linecap="round"/>`;
  if (S.side) for (const sd of G.side) s += `<polyline points="${pl(sd)}" fill="none" stroke="#6fa8dc" stroke-width="1.3"/>`;
  if (S.tribs) for (const t of G.tribs) if (t.stub) s += `<polyline points="${pl(t.stub)}" fill="none" stroke="#7aa6c9" stroke-width="1.4"/>`;
  if (S.transects){ const TT = (R.reaches || []).flatMap(r => (r.width && r.width.tr) || []).filter(t => !t.off && Number.isFinite(t.w)), lw = TT.map(t => Math.log10(t.wc ?? t.w)), wlo = lw.length ? quantile(lw, .02) : 0, whi = lw.length ? quantile(lw, .98) : 1;
    for (const t of TT){ const [a, b] = G.loc([t.a, t.b]); s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="${metric === "width" ? cvCol((Math.log10(t.wc ?? t.w) - wlo)/((whi - wlo) || 1)) : "#d62728"}" stroke-width="${metric === "width" ? 2 : .8}"/>`; } }
  if (S.valley) for (const r of R.reaches || []){ if (!Number.isFinite(r.lambda)) continue; const P = G.main.slice(i0k(r.k0), i0k(r.k1) + 1), span = Math.max(2, Math.round(r.lambda*(r.sin || 1)/G.st/2)), ax = P.map((_, j) => { let x = 0, y = 0, c = 0; for (let t = -span; t <= span; t++){ const q = P[clamp(j + t, 0, P.length - 1)]; x += q[0]; y += q[1]; c++; } return [x/c, y/c]; }); s += `<polyline points="${pl(ax)}" fill="none" stroke="#6a51a3" stroke-width="1.6" stroke-dasharray="6 4"/>`; }
  // main channel
  s += `<polyline points="${pl(G.main)}" fill="none" stroke="#1d232a" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>`;
  let run = [G.main[0]], rc = colOf(0); for (let i = 1; i < G.main.length; i++){ const c = colOf(i); run.push(G.main[i]); if (c !== rc || i === G.main.length - 1){ s += `<polyline points="${pl(run)}" fill="none" stroke="${rc}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`; run = [G.main[i]]; rc = c; } }
  // sinuosity explained: straight line between reach ends and the ratio
  if (S.sinu){ const sel = XR.range && XR.range.R === R ? XR.range : null, list = sel ? [reachStats(R, sel.k0, sel.k1, -1)] : (R.reaches || []);
    const vis = list.filter(r => { const a = G.main[i0k(r.k0)], b = G.main[i0k(r.k1)], mx = (X(a) + X(b))/2, my = (Y(a) + Y(b))/2; return mx > ox && mx < ox + Wp && my > 0 && my < H; }), nLab = Math.max(1, Math.floor(Wp/190)), every = Math.max(1, Math.ceil(vis.length/nLab)), labSet = new Set(vis.filter((_, j) => j % every === Math.floor(every/2)));
    for (const r of list){ const a = G.main[i0k(r.k0)], b = G.main[i0k(r.k1)]; s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="#d62728" stroke-width="1.4" stroke-dasharray="5 4"/><circle cx="${X(a)}" cy="${Y(a)}" r="3" fill="#d62728"/><circle cx="${X(b)}" cy="${Y(b)}" r="3" fill="#d62728"/>`;
      const mx = (X(a) + X(b))/2, my = (Y(a) + Y(b))/2; if (labSet.has(r) || list.length === 1) s += txt(mx + 6, my - 6, `${tfmt(r.L)} ÷ ${tfmt(r.straight)} km = ${nf(r.sin, 2)}`, {box: true, stroke: "#d62728", fill: "#8b1a1a", fs: 10}); } }
  if (S.reaches) for (const r of R.reaches || []){ const i = i0k(r.k0), j = Math.min(G.main.length - 1, i + 1), p = G.main[i], q = G.main[j], dx = X(q) - X(p), dy = Y(q) - Y(p), l = Math.hypot(dx, dy) || 1, nx = -dy/l*8, ny = dx/l*8; s += `<line x1="${X(p) - nx}" y1="${Y(p) - ny}" x2="${X(p) + nx}" y2="${Y(p) + ny}" stroke="#111" stroke-width="1.4"/>`; }
  // point symbols, then labels (labels skip when they would overlap)
  if (S.tribs) for (const t of G.tribs) s += `<circle cx="${X(t.p)}" cy="${Y(t.p)}" r="3.3" fill="${t.t.side === "left" ? "#2b8cbe" : "#41ab5d"}" stroke="#fff" stroke-width="1"/>`;
  if (S.dams) for (const d of G.dams) s += `<rect x="${X(d.p) - 4.5}" y="${Y(d.p) - 4.5}" width="9" height="9" fill="#111" transform="rotate(45 ${X(d.p)} ${Y(d.p)})"/>`;
  if (S.knick && R.prof) for (const k of R.prof.knick){ const p = G.main[i0k(k.km)]; s += `<path d="M${X(p)} ${Y(p) - 9}l6 10h-12z" fill="${k.artefact ? "#fff" : "#ff7f0e"}" stroke="${k.artefact ? "#ff7f0e" : "#fff"}" stroke-width="${k.artefact ? 1.6 : .8}"/>`; if (S.knickx && k.ratio) s += txt(X(p) + 8, Y(p) + 4, `${nf(k.ratio, 1)}× slope, ${nf(k.drop)} m drop · ${k.confidence || ""}`, {box: true, stroke: "#ff7f0e", fill: "#7a3d00", fs: 9.5}); }
  if (S.labels){ const a = G.main[0], b = G.main[G.main.length - 1]; s += `<circle cx="${X(a)}" cy="${Y(a)}" r="5" fill="#2ca02c" stroke="#fff" stroke-width="1.5"/><circle cx="${X(b)}" cy="${Y(b)}" r="5" fill="#d62728" stroke="#fff" stroke-width="1.5"/>` + txt(X(a) + 8, Y(a) - 6, "Source", {fill: "#1b5e20", bold: true, fs: 11}) + txt(X(b) + 8, Y(b) + 15, "Mouth", {fill: "#8b1a1a", bold: true, fs: 11}); }
  if (S.values) for (const r of R.reaches || []){ const p = G.main[i0k((r.k0 + r.k1)/2)], v = metric === "zone" ? r.zone : XMETRIC[metric].get(R, idxAtKm(R, (r.k0 + r.k1)/2)); if (v == null || (typeof v === "number" && !Number.isFinite(v))) continue; s += txt(X(p) + 9, Y(p) - 9, typeof v === "number" ? tfmt(v) : v, {box: true}); }
  if (S.km){ const nice = (() => { const t = R.L/8, p = 10**Math.floor(Math.log10(t)); return [1, 2, 5, 10].map(k => k*p).find(v => v >= t) || p; })(); for (let k = nice; k < R.L; k += nice){ const p = G.main[i0k(k)]; s += `<circle cx="${X(p)}" cy="${Y(p)}" r="2.4" fill="#fff" stroke="#111"/>` + txt(X(p) + 5, Y(p) + 13, `${tfmt(k)} km`, {fs: 9.5, fill: "#444"}); } }
  if (S.labels && S.tribs) for (const t of G.tribs) if (t.t.area || vb.s < R.L/600) s += txt(X(t.p) + 6, Y(t.p) - 5, t.t.name, {fs: 10, fill: "#2c3e50"});
  { const p = G.main[i0k(XR.pos)]; s += `<circle cx="${X(p)}" cy="${Y(p)}" r="7" fill="none" stroke="#111" stroke-width="2"/>`; }
  if (XR.dn && XR.dn.segs && S.net !== false) s += dnCvSVG(G, X, Y);
  return s + `</g>${CV.layout === "side" ? `<text x="${ox + 10}" y="18" font-size="12" font-weight="700" fill="#111">${esc(metric === "zone" ? "Sediment zone (interp.)" : XMETRIC[metric].n)}</text>` : ""}`;
}
/** draw everything in screen coordinates (crisp at any zoom); vb = centre + km per pixel */
function cvDraw(){
  const plan = $("cvPlan"); if (!plan || !CV.vb) return; const [W, H] = cvSize(), P = cvPanels(), Wp = W/P.length;
  plan.setAttribute("viewBox", `0 0 ${W} ${H}`); plan.setAttribute("width", W); plan.setAttribute("height", H);
  CV.panelV = P.map(m => cvValuesFor(m)); CV.vals = CV.panelV[0];
  let s = `<defs>${P.map((_, i) => `<clipPath id="cvClip${i*Wp}"><rect x="${i*Wp}" y="0" width="${Wp}" height="${H}"/></clipPath>`).join("")}</defs><rect width="${W}" height="${H}" fill="#fff"/>`;
  P.forEach((m, i) => { s += cvPanel(m, i*Wp, Wp, H, CV.panelV[i]); if (i) s += `<line x1="${i*Wp}" x2="${i*Wp}" y1="0" y2="${H}" stroke="#d0d4d8"/>`; });
  plan.innerHTML = s; cvOverlay(W, H, P, Wp); cvPlots(); cvNote();
}
/** map furniture in screen coordinates; each item can be dragged when arranging */
function cvLegendSVG(V){ const met = V.met; if (V.metric === "zone") return {w: 210, h: 88, s: `<rect width="210" height="88" rx="6" fill="#fff" fill-opacity=".94" stroke="#ccc"/><text x="10" y="17" font-size="11" font-weight="600">Sediment routing (interpretation)</text>` + ZONE_CAT.map(([, n, c], i) => `<rect x="10" y="${27 + i*15}" width="18" height="7" fill="${c}"/><text x="36" y="${34 + i*15}" font-size="10.5">${n}</text>`).join("")};
  if (!V.n) return {w: 210, h: 26, s: `<rect width="210" height="26" rx="6" fill="#fff" stroke="#ccc"/><text x="10" y="17" font-size="11" fill="#666">${esc(met.n)}: not measured yet</text>`};
  const val = u => { const t2 = V.lo + (V.hi - V.lo)*u; return met.log ? 10**t2 : t2; }; let g = `<rect width="210" height="58" rx="6" fill="#fff" fill-opacity=".94" stroke="#ccc"/><text x="10" y="16" font-size="11" font-weight="600">${esc(met.n)}${met.u ? " (" + esc(met.u) + ")" : ""}${met.log ? " · log" : ""}</text>`;
  const all = V.v.filter(Number.isFinite), cl0 = all.some(x => x < V.lo - 1e-9), cl1 = all.some(x => x > V.hi + 1e-9);
  for (let i = 0; i < 48; i++) g += `<rect x="${9 + i*4}" y="23" width="4.3" height="10" fill="${cvCol(i/47)}"/>`; g += `<text x="9" y="48" font-size="10">${cl0 ? "≤ " : ""}${tfmt(val(0))}</text><text x="105" y="48" font-size="10" text-anchor="middle">${tfmt(val(.5))}</text><text x="201" y="48" font-size="10" text-anchor="end">${cl1 ? "≥ " : ""}${tfmt(val(1))}</text>${cl0 || cl1 ? `<text x="105" y="56" font-size="8" text-anchor="middle" fill="#777">colours span the 2nd–98th percentile</text>` : ""}`; return {w: 210, h: 60, s: g.replace('height="58"', 'height="60"')}; }
function cvOverlay(W, H, P, Wp){
  const o = $("cvOver"), vb = CV.vb; o.setAttribute("viewBox", `0 0 ${W} ${H}`); o.setAttribute("width", W); o.setAttribute("height", H); o.style.pointerEvents = CV.arrange ? "auto" : "none";
  const items = [], at = (key, w, h, ox = 0, ww = W) => { const [fx, fy] = CV.pos[key] || [.5, .5]; return [clamp(ox + fx*ww - fx*w, ox, ox + ww - w), clamp(fy*H - fy*h, 0, H - h)]; };
  const grp = (key, w0, h0, body0, ox, ww) => { const kk = (FURN[key] || {}).k || 1, w = w0*kk, h = h0*kk, body = kk === 1 ? body0 : `<g transform="scale(${kk})">${body0}</g>`; const [x, y] = at(key, w, h, ox, ww); items.push(`<g data-drag="${key}" data-ox="${ox || 0}" data-ww="${ww || W}" data-w="${w}" data-h="${h}" transform="translate(${x},${y})" style="cursor:${CV.arrange ? "move" : "default"}">${CV.arrange ? `<rect x="-4" y="-4" width="${w + 8}" height="${h + 8}" rx="8" fill="none" stroke="#2b8cbe" stroke-dasharray="4 3"/>` : ""}${body}</g>`); };
  if (CV.ui.scale){ const t = Wp*.2*vb.s, p = 10**Math.floor(Math.log10(t)), len = [1, 2, 5, 10].map(k => k*p).filter(v => v <= t).pop() || p, px = len/vb.s;
    { const S = furnScaleSVG(px, len >= 1 ? tfmt(len) + " km" : tfmt(len*1000) + " m"); grp("scale", S.w, S.h, S.s); } }
  if (CV.ui.north){ const Nn = furnNorthSVG((CV.rot || 0)*180/Math.PI); grp("north", Nn.w, Nn.h, Nn.s); }
  if (CV.ui.legend) P.forEach((m, i) => { const L = cvLegendSVG(CV.panelV[i]); grp(P.length > 1 ? "legend" : "legend", L.w, L.h, L.s, i*Wp, Wp); });
  if (CV.ui.legend && XR.dn && XR.dn.segs && CV.show.net !== false && DNSTY.show.legend){ const Ln = dnLegendSVG(); CV.pos.netleg = CV.pos.netleg || [.97, .62]; grp("netleg", Ln.w, Ln.h, Ln.s); }
  const R = XR.river, hasTr = (R.reaches || []).some(r => r.width && r.width.tr && r.width.tr.length), kn = R.prof ? R.prof.knick : [];
  const keys = [CV.show.tribs && R.tribs.length && ["circle", "#2b8cbe", "Tributary junction"], CV.show.dams && R.dams.length && ["dia", "#111", "Dam / weir"], CV.show.knick && kn.some(k => !k.artefact) && ["tri", "#ff7f0e", "Knickpoint"], CV.show.knick && kn.some(k => k.artefact) && ["trio", "#ff7f0e", "Knickpoint, possible artefact"], CV.show.transects && hasTr && ["line", "#d62728", "Width transect"], CV.show.reaches && R.reaches && R.reaches.length > 1 && ["tick", "#111", "Reach boundary"], CV.show.sinu && ["dash", "#d62728", "Straight line between reach ends"], CV.show.valley && ["dash", "#6a51a3", "Valley axis"], CV.show.knickx && ["band", "#ff7f0e", "Knickpoint: local / context window"], CV.show.sel && XR.range && ["band", "#ffcf33", "Selected stretch"]].filter(Boolean);
  if (CV.ui.key && keys.length){ const h = keys.length*16 + 10; grp("key", 220, h, `<rect width="220" height="${h}" rx="6" fill="#fff" fill-opacity=".92" stroke="#ddd"/>` + keys.map(([sh, c, t], i) => { const yy = 13 + i*16, kx = 8; const sym = sh === "circle" ? `<circle cx="${kx + 7}" cy="${yy}" r="3.5" fill="${c}"/>` : sh === "dia" ? `<rect x="${kx + 3}" y="${yy - 4}" width="8" height="8" fill="${c}" transform="rotate(45 ${kx + 7} ${yy})"/>` : sh === "tri" ? `<path d="M${kx + 7} ${yy - 5}l5 9h-10z" fill="${c}"/>` : sh === "trio" ? `<path d="M${kx + 7} ${yy - 5}l5 9h-10z" fill="#fff" stroke="${c}" stroke-width="1.4"/>` : sh === "line" ? `<line x1="${kx}" x2="${kx + 14}" y1="${yy}" y2="${yy}" stroke="${c}" stroke-width="1.6"/>` : sh === "dash" ? `<line x1="${kx}" x2="${kx + 14}" y1="${yy}" y2="${yy}" stroke="${c}" stroke-width="1.6" stroke-dasharray="4 3"/>` : sh === "band" ? `<rect x="${kx}" y="${yy - 4}" width="14" height="8" fill="${c}" fill-opacity=".5"/>` : `<line x1="${kx + 7}" x2="${kx + 7}" y1="${yy - 6}" y2="${yy + 6}" stroke="${c}" stroke-width="1.6"/>`; return sym + `<text x="${kx + 22}" y="${yy + 3.5}" font-size="10.5">${t}</text>`; }).join("")); }
  if (CV.ui.inset && CV.inset) grp("inset", 170, 128, `<rect width="170" height="128" rx="6" fill="#fff" stroke="#999"/><image href="${CV.inset.url}" x="5" y="5" width="160" height="118"/><text x="9" y="120" font-size="8.5" fill="#fff" stroke="#000" stroke-width=".25">${esc(CV.inset.label)}</text>`);
  o.innerHTML = `<g font-family="Inter, sans-serif">${items.join("")}</g>`;
}
/** small location map: the river's extent on a low-zoom base map */
async function cvMakeInset(){
  const R = XR.river; let s = 90, n = -90, w = 180, e = -180; for (const p of R.main){ s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  const lat = (s + n)/2, lon = (w + e)/2, span = Math.max(n - s, (e - w)*Math.cos(lat*D2R), .05)*6, W = 320, H = 236, z = clamp(Math.floor(Math.log2(360*W/(256*span))), 0, 10), base = EX.base.topo || EX.base.imagery;
  const n2 = 2**z, cx = lon2x(lon, z), cy = lat2y(lat, z), ps = []; for (let ty = Math.floor((cy - H/2)/256); ty <= Math.floor((cy + H/2)/256); ty++) for (let tx = Math.floor((cx - W/2)/256); tx <= Math.floor((cx + W/2)/256); tx++) if (ty >= 0 && ty < n2) ps.push(getTile(base.url(z, ((tx % n2) + n2) % n2, ty), true).p);
  await Promise.all(ps); const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.fillStyle = "#dfe6ea"; g.fillRect(0, 0, W, H); try { xmap.drawTiles(g, W, H, lat, lon, z, base); } catch(_){}
  const P = (la, lo) => [W/2 + (lon2x(lo, z) - cx), H/2 + (lat2y(la, z) - cy)]; g.strokeStyle = "#d62728"; g.lineWidth = 2.4; g.beginPath(); R.main.forEach((p, i) => { if (i % Math.max(1, Math.floor(R.main.length/600))) return; const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
  const a = P(n, w), b = P(s, e); g.strokeStyle = "#111"; g.lineWidth = 1.4; g.strokeRect(a[0] - 3, a[1] - 3, b[0] - a[0] + 6, b[1] - a[1] + 6);
  let url; try { url = c.toDataURL("image/png"); } catch(_){ return; } CV.inset = {url, label: `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"} · ${base.n}`}; cvDraw();
}
function cvWireOverlay(){
  const o = $("cvOver"); let drag = null;
  o.onpointerdown = e => { if (!CV.arrange) return; const g = e.target.closest("[data-drag]"); if (!g) return; e.stopPropagation(); const r = o.getBoundingClientRect(); drag = {g, key: g.dataset.drag, ox: +g.dataset.ox, ww: +g.dataset.ww, w: +g.dataset.w, h: +g.dataset.h, r}; o.setPointerCapture(e.pointerId); };
  o.onpointermove = e => { if (!drag) return; const H = drag.r.height, x = clamp(e.clientX - drag.r.left - drag.ox - drag.w/2, 0, drag.ww - drag.w), y = clamp(e.clientY - drag.r.top - drag.h/2, 0, H - drag.h); CV.pos[drag.key] = [drag.ww > drag.w ? x/(drag.ww - drag.w) : 0, H > drag.h ? y/(H - drag.h) : 0]; drag.g.setAttribute("transform", `translate(${drag.ox + x},${y})`); };
  o.onpointerup = () => { if (drag){ drag = null; cvDraw(); } };
}
/** plot panel: several attributes along distance, stacked or overlaid, with the profile explained */
function cvSeries(k){ const R = XR.river, pr = R.prof, G = CV.geo; if (k === "elevation") return null;
  if (k === "zone") return {zone: true, x: (R.reaches || []).map(r => [r.k0, r.k1, r.zone])};
  const met = XMETRIC[k], xs = [], ys = []; const st = Math.max(1, Math.floor(G.km.length/1500)); for (let i = 0; i < G.km.length; i += st){ const v = met.get(R, idxAtKm(R, G.km[i])); xs.push(G.km[i]); ys.push(Number.isFinite(v) ? v : NaN); } return {x: xs, y: ys, met}; }
function cvPlots(){
  const el = $("cvProf"), R = XR.river, pr = R.prof; if (!el) return; const W = Math.max(300, el.getBoundingClientRect().width || 600), list = CV.plots.length ? CV.plots : ["elevation"], m = {l: 58, r: 16, t: 10, b: 30}, pw = W - m.l - m.r, X = d => m.l + d/R.L*pw;
  const colFor = k => k === "elevation" ? "#1f77b4" : ["#d62728", "#2ca02c", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#ff7f0e"][PLOTS().findIndex(p => p[0] === k) % 8];
  const ph = CV.plotMode === "overlay" ? 190 : list.map(k => k === "elevation" ? 170 : k === "zone" ? 34 : 92), H = CV.plotMode === "overlay" ? ph + m.t + m.b + 22 : ph.reduce((a, b) => a + b + 8, 0) + m.t + m.b;
  el.setAttribute("viewBox", `0 0 ${W} ${H}`); el.setAttribute("width", W); el.setAttribute("height", H);
  let s = `<rect width="${W}" height="${H}" fill="#fff"/>`, yTop = m.t;
  const axisX = y => { let a = ""; for (const t of niceTicks(0, R.L, 6)) a += `<text x="${X(t)}" y="${y + 14}" font-size="10" text-anchor="middle" fill="#444">${tfmt(t)}</text><line x1="${X(t)}" x2="${X(t)}" y1="${y}" y2="${y + 4}" stroke="#666"/>`; return a; };
  const frame = (y, h) => `<rect x="${m.l}" y="${y}" width="${pw}" height="${h}" fill="none" stroke="#888" stroke-width=".8"/>`;
  const cursor = (y, h) => `<line x1="${X(XR.pos)}" x2="${X(XR.pos)}" y1="${y}" y2="${y + h}" stroke="#111" stroke-dasharray="3 3"/>`;
  const zbar = (y, h, ser) => ser.x.map(([a, b, z]) => `<rect x="${X(a)}" y="${y}" width="${Math.max(1, X(b) - X(a))}" height="${h}" fill="${zoneCol(z)}" fill-opacity=".75"/>`).join("") + `<text x="${m.l - 6}" y="${y + h/2 + 4}" font-size="10" text-anchor="end">zones</text>`;
  const elevPanel = (y, h, norm) => { if (!pr) return `<text x="${m.l + 10}" y="${y + 20}" font-size="11" fill="#888">Elevation profile not loaded</text>`;
    const vals = [...(CV.prof.cond ? pr.zc : []), ...(CV.prof.raw ? (pr.zs || pr.zr) : []), ...(CV.prof.smooth && pr.zm ? pr.zm : [])].filter(Number.isFinite); if (!vals.length) return "";
    let z0 = Math.min(...vals), z1 = Math.max(...vals); if (z1 - z0 < 1){ z0 -= 1; z1 += 1; } const Y = v => norm ? y + h - norm(v)*h : y + h - (clamp(v, z0, z1) - z0)/((z1 - z0) || 1)*h; let g = "";
    if (!norm){ for (const t of niceTicks(z0, z1, 3)) g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/><text x="${m.l - 6}" y="${Y(t) + 3.5}" font-size="10" text-anchor="end" fill="#444">${tfmt(t)}</text>`; g += `<text transform="translate(13 ${y + h/2}) rotate(-90)" font-size="10.5" text-anchor="middle">Elevation (m)</text>`; }
    // knickpoint explanation: context window, local window, both slopes
    if (CV.show.knickx) for (const k of pr.knick){ if (!k.win) continue; g += `<rect x="${X(k.ctx[0])}" y="${y}" width="${X(k.ctx[1]) - X(k.ctx[0])}" height="${h}" fill="#ff7f0e" fill-opacity=".07"/><rect x="${X(k.win[0])}" y="${y}" width="${Math.max(1.5, X(k.win[1]) - X(k.win[0]))}" height="${h}" fill="#ff7f0e" fill-opacity=".22"/>`;
      if (!norm) g += `<line x1="${X(k.ctx[0])}" y1="${Y(k.zctx[0])}" x2="${X(k.ctx[1])}" y2="${Y(k.zctx[1])}" stroke="#7f7f7f" stroke-width="1.2" stroke-dasharray="5 3"/><line x1="${X(k.win[0])}" y1="${Y(k.zw[0])}" x2="${X(k.win[1])}" y2="${Y(k.zw[1])}" stroke="#ff7f0e" stroke-width="2.4"/>`; }
    if (CV.prof.unc && pr.unc && !norm){ let up = "", dn = ""; pr.d.forEach((x, i) => { const u = pr.unc[i], z = pr.zc[i]; if (!Number.isFinite(u) || !Number.isFinite(z)) return; up += (up ? "L" : "M") + X(x).toFixed(1) + " " + Y(z + u).toFixed(1); }); for (let i = pr.d.length - 1; i >= 0; i--){ const u = pr.unc[i], z = pr.zc[i]; if (!Number.isFinite(u) || !Number.isFinite(z)) continue; dn += "L" + X(pr.d[i]).toFixed(1) + " " + Y(z - u).toFixed(1); } if (up) g += `<path d="${up}${dn}Z" fill="#1f77b4" fill-opacity=".14" stroke="none"/>`; }
    const path = (arr, c, w, dash) => { let d = ""; pr.d.forEach((x, i) => { const v = arr[i]; if (Number.isFinite(v)) d += (d ? "L" : "M") + X(x).toFixed(1) + " " + Y(v).toFixed(1); }); return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`; };
    if (CV.prof.raw) g += path(pr.zs || pr.zr, "#9aa5b1", .9);
    if (pr.alt && pr.alt.z && CV.prof.alt !== false) g += path(pr.alt.z, "#e8890c", 1.3, "5 3");
    if (CV.prof.spikes && pr.spikes && !norm) for (const i of pr.spikes){ const v = pr.zr[i]; if (!Number.isFinite(v)) continue; const yy = v < z0 ? y + h - 2 : v > z1 ? y + 2 : Y(v); g += `<circle cx="${X(pr.d[i])}" cy="${yy}" r="1.8" fill="#e45756"/>${v < z0 || v > z1 ? `<path d="M${X(pr.d[i]) - 3} ${yy + (v < z0 ? -4 : 4)}l3 ${v < z0 ? 4 : -4}l3 ${v < z0 ? -4 : 4}" fill="none" stroke="#e45756" stroke-width=".8"/>` : ""}`; }
    if (CV.prof.smooth && pr.zm) g += path(pr.zm, "#7f7f7f", 1.2, "4 2");
    if (CV.prof.cond){ const V = CV.vals, G = CV.geo, step = Math.max(1, Math.floor(pr.d.length/1200)); if (!norm && V){ for (let i = step; i < pr.d.length; i += step){ const k = pr.d[i], gi = Math.min(G.main.length - 1, Math.round(k/G.st)), c = cvColorFn(V)(gi); g += `<line x1="${X(pr.d[i - step])}" y1="${Y(pr.zc[i - step])}" x2="${X(k)}" y2="${Y(pr.zc[i])}" stroke="${c}" stroke-width="3"/>`; } } else g += path(pr.zc, colFor("elevation"), 2); }
    if (CV.show.knick) pr.knick.forEach((k, j) => { g += `<path d="M${X(k.km)} ${Y(k.z) - 10}l5 8h-10z" fill="${k.artefact ? "#fff" : "#ff7f0e"}" stroke="#ff7f0e" stroke-width="${k.artefact ? 1.4 : .6}"/>`; if (CV.show.knickx && !norm && k.ratio) g += `<text x="${X(k.km) + 6}" y="${Y(k.z) - 12 - (j % 2)*11}" font-size="9.5" fill="#7a3d00">${nf(k.local, 2)} vs ${nf(k.around, 2)} m/km = ${nf(k.ratio, 1)}×; drop ${nf(k.drop)} m · ${esc(k.confidence || "")}</text>`; });
    if (CV.show.dams) for (const dm of R.dams){ const z = pr.zc[Math.min(pr.zc.length - 1, Math.round(dm.km/pr.step))]; g += `<rect x="${X(dm.km) - 4}" y="${Y(z) - 4}" width="8" height="8" fill="#111" transform="rotate(45 ${X(dm.km)} ${Y(z)})"/>`; }
    if (CV.show.tribs) for (const t of R.tribs.filter(t => !t.distributary)){ const z = pr.zc[Math.min(pr.zc.length - 1, Math.round(t.km/pr.step))]; g += `<circle cx="${X(t.km)}" cy="${Y(z)}" r="2.4" fill="${t.side === "left" ? "#2b8cbe" : "#41ab5d"}"/>`; }
    // in-panel legend of the profile lines
    if (!norm){ const L = [CV.prof.raw && ["#9aa5b1", "raw samples", ""], pr.alt && CV.prof.alt && ["#e8890c", "second source: " + pr.alt.label, "5 3"], CV.prof.spikes && pr.spikes && pr.spikes.length && ["#e45756", `removed spikes (${pr.spikes.length})`, "dot"], CV.prof.smooth && ["#7f7f7f", "smoothed", "4 2"], CV.prof.cond && ["#1f77b4", "conditioned (colour = map attribute)", ""], CV.prof.unc && pr.unc && ["#1f77b4", "±1 robust SD of samples about the profile", "band"], CV.show.knickx && ["#ff7f0e", "local slope window / context slope", ""]].filter(Boolean);
      g += L.map(([c, t, d], i) => `<g transform="translate(${m.l + pw - 230},${y + 10 + i*13})">${d === "dot" ? `<circle cx="7" cy="-3" r="2.2" fill="${c}"/>` : d === "band" ? `<rect x="0" y="-7" width="14" height="8" fill="${c}" fill-opacity=".2"/>` : `<line x1="0" x2="14" y1="-3" y2="-3" stroke="${c}" stroke-width="2"${d ? ` stroke-dasharray="${d}"` : ""}/>`}<text x="19" y="0" font-size="9.5" fill="#333">${t}</text></g>`).join(""); }
    return g; };
  if (CV.plotMode === "overlay"){ const h = ph, y = yTop, leg = [];
    s += `<text transform="translate(13 ${y + h/2}) rotate(-90)" font-size="10.5" text-anchor="middle">relative value (0 = min, 1 = max)</text>`;
    for (const k of list){ if (k === "zone"){ s += zbar(y + h - 10, 10, cvSeries(k)); continue; }
      if (k === "elevation" && pr){ const f = [...pr.zc].filter(Number.isFinite), lo = Math.min(...f), hi = Math.max(...f); s += elevPanel(y, h, v => (v - lo)/((hi - lo) || 1)); leg.push([colFor(k), `elevation ${tfmt(lo)}–${tfmt(hi)} m`]); continue; }
      const S2 = cvSeries(k), f = S2.y.filter(v => Number.isFinite(v) && (!S2.met.log || v > 0)); if (!f.length){ leg.push(["#bbb", `${S2.met.n}: not measured`]); continue; } const T = v => S2.met.log ? Math.log10(v) : v, lo = Math.min(...f.map(T)), hi = Math.max(...f.map(T));
      let d = ""; S2.x.forEach((x, i) => { const v = S2.y[i]; if (!Number.isFinite(v) || (S2.met.log && v <= 0)){ d += " "; return; } d += (d.endsWith(" ") || !d ? "M" : "L") + X(x).toFixed(1) + " " + (y + h - (T(v) - lo)/((hi - lo) || 1)*h).toFixed(1); }); s += `<path d="${d.replace(/ M/g, "M").trim()}" fill="none" stroke="${colFor(k)}" stroke-width="1.8"/>`;
      leg.push([colFor(k), `${S2.met.n} ${tfmt(S2.met.log ? 10**lo : lo)}–${tfmt(S2.met.log ? 10**hi : hi)}${S2.met.u ? " " + S2.met.u : ""}${S2.met.log ? " (log)" : ""}`]); }
    s += frame(y, h) + cursor(y, h) + axisX(y + h) + `<g transform="translate(${m.l},${y + h + 26})">${leg.map(([c, t], i) => `<g transform="translate(${(i % 3)*Math.min(260, pw/3)},${Math.floor(i/3)*12})"><line x1="0" x2="14" y1="-3" y2="-3" stroke="${c}" stroke-width="2.4"/><text x="18" y="0" font-size="9.8">${esc(t)}</text></g>`).join("")}</g>`; }
  else list.forEach((k, idx) => { const h = ph[idx], y = yTop; yTop += h + 8;
    if (k === "elevation") s += elevPanel(y, h);
    else if (k === "zone") s += zbar(y, h, cvSeries(k));
    else { const S2 = cvSeries(k), f = S2.y.filter(v => Number.isFinite(v) && (!S2.met.log || v > 0)); s += `<text x="${m.l + 6}" y="${y + 12}" font-size="10.5" font-weight="600" fill="${colFor(k)}">${esc(S2.met.n)}${S2.met.u ? " (" + esc(S2.met.u) + ")" : ""}</text>`;
      if (!f.length) s += `<text x="${m.l + 6}" y="${y + 30}" font-size="10.5" fill="#888">not measured yet</text>`;
      else { const T = v => S2.met.log ? Math.log10(v) : v, lo = Math.min(...f.map(T)), hi = Math.max(...f.map(T)), Y = v => y + h - (T(v) - lo)/((hi - lo) || 1)*(h - 16) - 2;
        for (const t of niceTicks(lo, hi, 2)) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(S2.met.log ? 10**t : t)}" y2="${Y(S2.met.log ? 10**t : t)}" stroke="#f0f0f0"/><text x="${m.l - 6}" y="${Y(S2.met.log ? 10**t : t) + 3.5}" font-size="9.5" text-anchor="end" fill="#444">${tfmt(S2.met.log ? 10**t : t)}</text>`;
        let d = "", pen = false; S2.x.forEach((x, i) => { const v = S2.y[i]; if (!Number.isFinite(v) || (S2.met.log && v <= 0)){ pen = false; return; } d += (pen ? "L" : "M") + X(x).toFixed(1) + " " + Y(v).toFixed(1); pen = true; }); s += `<path d="${d}" fill="none" stroke="${colFor(k)}" stroke-width="1.8"/>`;
        if (k === "sinuosity" && 1.5 >= lo && 1.5 <= hi) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(1.5)}" y2="${Y(1.5)}" stroke="#999" stroke-dasharray="3 3"/><text x="${m.l + pw - 4}" y="${Y(1.5) - 3}" font-size="9" text-anchor="end" fill="#777">1.5 = meandering threshold</text>`; } }
    s += frame(y, h) + cursor(y, h); });
  if (CV.plotMode !== "overlay") s += axisX(yTop - 8);
  s += `<text x="${m.l + pw/2}" y="${H - 3}" font-size="10.5" text-anchor="middle" fill="#222">Distance from source (km)</text>`;
  el.innerHTML = s; el.onclick = e => { const r = el.getBoundingClientRect(), k = clamp((e.clientX - r.left - m.l*(r.width/W))/(pw*(r.width/W)), 0, 1)*R.L; setPos(k); cvDraw(); };
}
function cvNote(){ const R = XR.river, n = $("cvNote"), pr = R.prof, sr = selRange(); if (!n) return;
  n.textContent = `${km(R.L)} traced · whole-river sinuosity ${nf(R.L/Math.max(1e-6, hav(R.main[0], R.main[R.main.length - 1])), 2)}${pr ? ` · fall ${nf(pr.drop)} m · mean gradient ${nf(pr.grad, 3)} m/km · ${pr.spikes ? pr.spikes.length : 0} elevation spikes removed · conditioning: ${pr.params.cond}` : ""}${sr.whole ? "" : ` · selected km ${nf(sr.k0)}–${nf(sr.k1)}`} · centreline © OpenStreetMap contributors${pr && !pr.user ? `; elevation ${demLabel(pr, true)}` : ""}. Local equirectangular projection centred on ${CV.geo.lat0.toFixed(2)}°, ${CV.geo.lon0.toFixed(2)}°.`; }
function cvWire(){
  const plan = $("cvPlan"), box = plan.parentElement; let drag = null, pinch = null; const pts = new Map();
  const panelOf = cx => { const r = plan.getBoundingClientRect(), Wp = r.width/cvPanels().length; return Math.floor(clamp((cx - r.left)/Wp, 0, cvPanels().length - .001)); };
  const toKm = (cx, cy) => { const r = plan.getBoundingClientRect(), [W, H] = cvSize(), Wp = W/cvPanels().length, i = panelOf(cx); return cvUnrot((cx - r.left - i*Wp - Wp/2)*CV.vb.s, (cy - r.top - H/2)*CV.vb.s, CV.vb.cx, CV.vb.cy); };
  box.onwheel = e => { e.preventDefault(); const a = toKm(e.clientX, e.clientY); CV.vb.s *= Math.exp(e.deltaY*.0015); const b = toKm(e.clientX, e.clientY); CV.vb.cx += a[0] - b[0]; CV.vb.cy += a[1] - b[1]; cvDraw(); };
  box.onpointerdown = e => { if (CV.arrange && e.target.closest("[data-drag]")) return; pts.set(e.pointerId, [e.clientX, e.clientY]); box.setPointerCapture(e.pointerId); if (pts.size === 1) drag = {x: e.clientX, y: e.clientY, cx: CV.vb.cx, cy: CV.vb.cy, moved: false}; if (pts.size === 2){ const [p, q] = [...pts.values()]; pinch = {d: Math.hypot(p[0] - q[0], p[1] - q[1]), s: CV.vb.s}; drag = null; } };
  box.onpointermove = e => { if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2){ const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]), c = [(p[0] + q[0])/2, (p[1] + q[1])/2], a = toKm(...c); CV.vb.s = pinch.s*pinch.d/Math.max(10, d); const b = toKm(...c); CV.vb.cx += a[0] - b[0]; CV.vb.cy += a[1] - b[1]; cvDraw(); return; }
    if (drag){ const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved){ const u = cvUnrot(-dx*CV.vb.s, -dy*CV.vb.s, drag.cx, drag.cy); CV.vb.cx = u[0]; CV.vb.cy = u[1]; cvDraw(); } return; }
    cvHover(e); };
  box.onpointerup = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && !drag.moved){ const h = cvNearest(e.clientX, e.clientY); if (h){ setPos(h.k); cvDraw(); } } drag = null; };
  box.onpointerleave = () => { const t = $("cvTip"); if (t) t.style.display = "none"; };
}
function cvUnrot(dx, dy, cx, cy){ const r = -(CV.rot || 0), c = Math.cos(r), n = Math.sin(r); return [dx*c - dy*n + cx, dx*n + dy*c + cy]; }
function cvNearest(cx, cy){ const r = $("cvPlan").getBoundingClientRect(), [W, H] = cvSize(), P = cvPanels(), Wp = W/P.length, i0 = Math.floor(clamp((cx - r.left)/Wp, 0, P.length - .001)), G = CV.geo, vb = CV.vb; let best = -1, bd = 14;
  for (let i = 0; i < G.main.length; i++){ const p = G.main[i], rc = Math.cos(CV.rot || 0), rs = Math.sin(CV.rot || 0), x = ((p[0] - vb.cx)*rc - (p[1] - vb.cy)*rs)/vb.s + Wp/2 + i0*Wp + r.left, y = ((p[0] - vb.cx)*rs + (p[1] - vb.cy)*rc)/vb.s + H/2 + r.top, d = Math.hypot(x - cx, y - cy); if (d < bd){ bd = d; best = i; } } return best < 0 ? null : {i: best, k: G.km[best]}; }
function cvHover(e){ const t = $("cvTip"), h = cvNearest(e.clientX, e.clientY); if (!t) return; if (!h){ t.style.display = "none"; return; }
  const R = XR.river, k = h.k, i = idxAtKm(R, k), r = reachAt(R, k), pr = R.prof, box = $("cvPlan").getBoundingClientRect();
  const rows = [["km from source", nf(k, 1)], pr && ["Elevation", nf(XMETRIC.elevation.get(R, i)) + " m"], pr && ["Slope", nf(XMETRIC.slope.get(R, i), 3) + " m/km"], r && ["Reach sinuosity", `${nf(r.sin, 2)} (${tfmt(r.L)} ÷ ${tfmt(r.straight)} km)`], r && r.width && Number.isFinite(r.width.med) && ["Width", nf(r.width.med) + " m"], r && Number.isFinite(r.lambda) && ["Wavelength", km(r.lambda)], r && r.zone && ["Zone (interp.)", r.zone]].filter(Boolean);
  t.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join(""); t.style.display = "block"; t.style.left = Math.min(box.width - 190, e.clientX - box.left + 14) + "px"; t.style.top = Math.max(0, e.clientY - box.top - 10) + "px"; }
/** one standalone SVG: plan + furniture + plots + caption */
function cvExportSVG(){
  const plan = $("cvPlan"), over = $("cvOver"), prof = $("cvProf"), [W, H] = cvSize(), ph = +prof.getAttribute("height") || 170, R = XR.river, cap = $("cvNote").textContent;
  const ov = over.innerHTML.replace(/<rect x="-4" y="-4"[^>]*stroke-dasharray="4 3"\/>/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + ph + 70}" width="${W}" height="${H + ph + 70}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><g>${plan.innerHTML}</g><g>${ov}</g><g transform="translate(0 ${H})">${prof.innerHTML}</g>${figCaption(`${R.name}${R.region ? " (" + R.region + ")" : ""}. ${CV.layout === "side" ? "Side-by-side maps coloured by " + cvPanels().map(m => m === "zone" ? "sediment zone" : XMETRIC[m].n.toLowerCase()).join(", ") : "Coloured by " + (CV.metric === "zone" ? "sediment zone" : XMETRIC[CV.metric].n.toLowerCase())}. ${cap}`, 14, H + ph + 22, W - 28)}</svg>`;
}
{ const b = $("xClean"); if (b) b.onclick = openCleanView; const b2 = $("xClean2"); if (b2) b2.onclick = openCleanView; }
