
/* ===================== Earthform Lens — map furniture styles, network styling everywhere, network library and global statistics ===================== */

/* ---------- 1. legend, scale bar and north arrow: size and style, shared by the map, the clean view and figures ---------- */
const FURN = Object.assign({legend: {k: 1, style: "auto"}, scale: {k: 1, style: "checker"}, north: {k: 1, style: "arrow", map: false}, key: {k: 1}, inset: {k: 1}}, (() => { try { return JSON.parse(localStorage.getItem("efl.furn")) || {}; } catch(_){ return {}; } })());
const furnSave = () => { try { localStorage.setItem("efl.furn", JSON.stringify(FURN)); } catch(_){} };
const FSTY = {legend: [["auto", "Automatic (dark on imagery, light on white)"], ["light", "Light box"], ["dark", "Dark box"], ["clear", "No box (outlined text)"]],
  scale: [["checker", "Alternating black / white"], ["bar", "Solid bar"], ["line", "Line with end ticks"], ["ticks", "Ruler with ticks"]],
  north: [["arrow", "Arrow"], ["compass", "Compass needle (red / grey)"], ["star", "Four-point star"], ["letter", "Letter N with line"]]};
function furnLegendCols(plain){ const st = FURN.legend.style, light = st === "light" || (st === "auto" && plain);
  if (st === "clear") return {bg: "rgba(0,0,0,0)", fg: plain ? "#111" : "#fff", mu: plain ? "#444" : "rgba(255,255,255,.85)", halo: true}; return light ? {bg: "rgba(255,255,255,.92)", fg: "#111", mu: "#555"} : {bg: "rgba(10,14,19,.78)", fg: "#fff", mu: "rgba(255,255,255,.7)"}; }
/** scale bar as SVG: returns {w, h, s}; px = bar length in px for `label` */
function furnScaleSVG(px, label, opt = {}){
  const st = FURN.scale.style, w = px + 26, h = 34, bx = 9, by = 21, box = opt.box !== false ? `<rect width="${w}" height="${h}" rx="5" fill="#fff" fill-opacity=".9"/>` : "", t0 = `<text x="${bx}" y="${by - 5}" font-size="10.5" fill="#111">0</text>`, t1 = `<text x="${bx + px}" y="${by - 5}" font-size="10.5" fill="#111" text-anchor="middle">${label}</text>`;
  let g = ""; if (st === "bar") g = `<rect x="${bx}" y="${by}" width="${px}" height="4.5" fill="#111"/>`;
  else if (st === "line") g = `<path d="M${bx} ${by - 3}v8M${bx} ${by + 1}h${px}M${bx + px} ${by - 3}v8" stroke="#111" stroke-width="1.6" fill="none"/>`;
  else if (st === "ticks") g = `<path d="M${bx} ${by + 4}h${px}${[0, .25, .5, .75, 1].map(f => `M${bx + f*px} ${by + 4}v${f === 0 || f === 1 || f === .5 ? -7 : -4}`).join("")}" stroke="#111" stroke-width="1.4" fill="none"/>`;
  else g = `<rect x="${bx}" y="${by}" width="${px}" height="4.5" fill="#111"/><rect x="${bx + px/4}" y="${by}" width="${px/4}" height="4.5" fill="#fff" stroke="#111" stroke-width=".6"/><rect x="${bx + 3*px/4}" y="${by}" width="${px/4}" height="4.5" fill="#fff" stroke="#111" stroke-width=".6"/>`;
  return {w, h, s: box + g + t0 + t1};
}
function furnNorthSVG(rotDeg, opt = {}){
  const st = FURN.north.style, box = opt.box !== false ? `<circle cx="16" cy="22" r="16" fill="#fff" fill-opacity=".9"/>` : ""; let g;
  if (st === "compass") g = `<path d="M16 9l5 13h-10z" fill="#d62728"/><path d="M16 35l5-13h-10z" fill="#9aa3ad"/>`;
  else if (st === "star") g = `<path d="M16 7l3 12 12 3-12 3-3 12-3-12-12-3 12-3z" fill="#111"/><path d="M16 7l3 12-3 3z" fill="#fff"/>`;
  else if (st === "letter") g = `<path d="M16 16v18" stroke="#111" stroke-width="1.6"/><path d="M16 12l4 7h-8z" fill="#111"/>`;
  else g = `<path d="M16 11l6 16-6-5-6 5z" fill="#111"/>`;
  return {w: 32, h: 40, s: `${box}<g transform="rotate(${(rotDeg || 0).toFixed(1)} 16 22)">${g}<text x="16" y="8" font-size="9.5" text-anchor="middle" font-weight="700" fill="#111">N</text></g>`};
}
/* canvas versions for the live map */
function furnScaleCanvas(ctx, w, h, mpp){
  const k = FURN.scale.k || 1, target = 100*mpp, p10 = 10**Math.floor(Math.log10(target)), nice = [1, 2, 5].map(v => v*p10).filter(v => v <= target).pop() || p10, bw = nice/mpp, lab = nice >= 1000 ? nice/1000 + " km" : nice + " m", st = FURN.scale.style;
  ctx.save(); ctx.translate(8, h - 8); ctx.scale(k, k); ctx.translate(0, -24);
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, bw + 18, 24); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff"; ctx.font = "11px Space Grotesk, sans-serif"; ctx.fillText(lab, 8, 11);
  const y = 15; if (st === "bar") ctx.fillRect(8, y, bw, 3.5); else if (st === "line"){ ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, y - 3); ctx.lineTo(8, y + 4); ctx.moveTo(8, y + 1); ctx.lineTo(8 + bw, y + 1); ctx.moveTo(8 + bw, y - 3); ctx.lineTo(8 + bw, y + 4); ctx.stroke(); }
  else if (st === "ticks"){ ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(8, y + 4); ctx.lineTo(8 + bw, y + 4); for (const f of [0, .25, .5, .75, 1]){ ctx.moveTo(8 + f*bw, y + 4); ctx.lineTo(8 + f*bw, y + 4 - (f % .5 ? 3 : 6)); } ctx.stroke(); }
  else { ctx.fillRect(8, y, bw, 3.5); ctx.fillStyle = "#111"; ctx.fillRect(8 + bw/4, y, bw/4, 3.5); ctx.fillRect(8 + 3*bw/4, y, bw/4, 3.5); }
  ctx.restore();
}
function furnNorthCanvas(ctx, x, y, rot){ const k = FURN.north.k || 1, st = FURN.north.style; ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill(); ctx.rotate(rot || 0);
  const tri = (pts, c) => { ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
  if (st === "compass"){ tri([[0, -13], [5, 0], [-5, 0]], "#d62728"); tri([[0, 13], [5, 0], [-5, 0]], "#9aa3ad"); } else if (st === "star"){ tri([[0, -14], [3, -3], [14, 0], [3, 3], [0, 14], [-3, 3], [-14, 0], [-3, -3]], "#111"); }
  else if (st === "letter"){ ctx.strokeStyle = "#111"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 13); ctx.stroke(); tri([[0, -9], [4, -2], [-4, -2]], "#111"); } else tri([[0, -12], [6, 6], [0, 2], [-6, 6]], "#111");
  ctx.fillStyle = "#111"; ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("N", 0, st === "letter" ? -10 : -12.5); ctx.restore(); }
function furnWith(ctx, key, ax, ay, fn){ const k = (FURN[key] || {}).k || 1; ctx.save(); ctx.translate(ax, ay); ctx.scale(k, k); ctx.translate(-ax, -ay); try { fn(); } finally { ctx.restore(); } }
function furnDialog(after){
  const sl = (key, t) => `<label class="fl">${t} size <span id="fk_${key}">${Math.round((FURN[key].k || 1)*100)} %</span><input type="range" min="50" max="300" step="10" value="${Math.round((FURN[key].k || 1)*100)}" data-fk="${key}"></label>`;
  const se = (key, t) => `<label class="fl">${t} style<select data-fs="${key}">${FSTY[key].map(([v, n]) => `<option value="${v}"${FURN[key].style === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
  modal(`<h3>Legend, scale bar and north arrow</h3><p class="note">Applies to the live map, the clean view, composed figures and network figures. In the clean view you can also drag each item (✥ Move legend &amp; scale).</p>
    ${sl("legend", "Legend")}${se("legend", "Legend")}${sl("scale", "Scale bar")}${se("scale", "Scale bar")}${sl("north", "North arrow")}${se("north", "North arrow")}<label class="chk"><input type="checkbox" id="fnMap"${FURN.north.map ? " checked" : ""}> Show the north arrow on the live map</label>${sl("key", "Symbol key")}${sl("inset", "Location inset")}
    <div class="btns"><button id="fnReset">Reset</button><button class="pri" id="fnOk">Done</button></div>`);
  const upd = () => { furnSave(); xmap && xmap.req(); if ($("cvWrap") && typeof cvDraw === "function") cvDraw(); after && after(); };
  document.querySelectorAll("#modalBox [data-fk]").forEach(r => r.oninput = () => { FURN[r.dataset.fk].k = +r.value/100; $("fk_" + r.dataset.fk).textContent = r.value + " %"; upd(); });
  document.querySelectorAll("#modalBox [data-fs]").forEach(r => r.onchange = () => { FURN[r.dataset.fs].style = r.value; upd(); });
  $("fnMap").onchange = e => { FURN.north.map = e.target.checked; upd(); };
  $("fnReset").onclick = () => { Object.assign(FURN, {legend: {k: 1, style: "auto"}, scale: {k: 1, style: "checker"}, north: {k: 1, style: "arrow", map: false}, key: {k: 1}, inset: {k: 1}}); upd(); closeModal(); furnDialog(after); };
  $("fnOk").onclick = closeModal;
}

/* ---------- 2. channel network: colour by any measure, choose what to show — on the map, in the clean view and in figures ---------- */
const DNSTY = Object.assign({colorBy: "order", lw: 1, show: {angle: true, limbs: false, nodes: true, lab: false, order: false, len: false, width: false, wn: false, sin: false, ticks: false, loops: true, apex: true, outlets: false, legend: true}},
  (() => { try { return JSON.parse(localStorage.getItem("efl.dnsty")) || {}; } catch(_){ return {}; } })());
const dnStySave = () => { try { localStorage.setItem("efl.dnsty", JSON.stringify(DNSTY)); } catch(_){} };
const DNCOL = {order: ["Channel order", "", false, true], wmean: ["Mean width", "m", true], Wn: ["Normalised width w ÷ w₀", "", false], L: ["Channel length", "km", true], Ln: ["Normalised length l ÷ w₀", "", true], sin: ["Sinuosity", "", false], theta: ["Angle θ at its downstream bifurcation", "°", false], grad: ["Gradient", "m/km", false], end: ["How the channel ends", "", false, true], plain: ["One colour", "", false, true]};
const DNSHOW = [["angle", "Angles θ"], ["limbs", "Angle limbs"], ["nodes", "Bifurcation points"], ["lab", "Labels l(o,j)"], ["order", "Order numbers"], ["len", "Lengths"], ["width", "Widths"], ["wn", "w ÷ w₀"], ["sin", "Sinuosity"], ["ticks", "Width positions i/h/f"], ["loops", "Excluded loops"], ["apex", "Apex"], ["outlets", "Outlets"], ["legend", "Network legend"]];
const ENDC = {outlet: "#1f77b4", bifurcation: "#2ca02c", rejoins: "#d62728"};
function dnVal(s, k){ if (k === "theta"){ const B = XR.dn.bifs.find(b => b.parent === s.id); return B ? B.theta : NaN; } return s[k]; }
/** colour function and legend description for the chosen measure */
function dnColorScale(){
  const N = XR.dn, k = DNSTY.colorBy, def = DNCOL[k] || DNCOL.order;
  if (!N || !N.segs || k === "order") return {k: "order", col: s => ordCol(s.order), def, cat: Array.from({length: (N && N.maxOrder) || 1}, (_, i) => [String(i + 1), ordCol(i + 1)])};
  if (k === "plain") return {k, col: () => "#1f6fd6", def, cat: [["channel", "#1f6fd6"]]};
  if (k === "end") return {k, col: s => ENDC[s.end] || "#888", def, cat: Object.entries(ENDC).map(([a, c]) => [a, c])};
  const vals = N.segs.map(s => dnVal(s, k)).filter(v => Number.isFinite(v) && (!def[2] || v > 0)).sort((a, b) => a - b); if (!vals.length) return {k, col: () => "#9aa3ad", def, none: true};
  const f = v => def[2] ? Math.log10(v) : v, lo = f(quantile(vals, .02)), hi = f(quantile(vals, .98)), span = (hi - lo) || 1;
  return {k, def, lo, hi, log: def[2], col: s => { const v = dnVal(s, k); return Number.isFinite(v) && (!def[2] || v > 0) ? vir((f(v) - lo)/span) : "#bdbdbd"; }};
}
const dnLw = s => Math.max(1.2, (6.5 - .55*(s.order - 1))*(DNSTY.lw || 1));
function dnLabelText(s){ const sh = DNSTY.show, t = []; if (sh.lab) t.push(`l${s.order},${s.j}`); else if (sh.order) t.push(String(s.order)); if (sh.len) t.push(km(s.L)); if (sh.width && Number.isFinite(s.wmean)) t.push(nf(s.wmean, s.wmean < 10 ? 1 : 0) + " m"); if (sh.wn && Number.isFinite(s.Wn)) t.push("w/w₀ " + nf(s.Wn, 2)); if (sh.sin && Number.isFinite(s.sin)) t.push("s " + nf(s.sin, 2)); return t.join(" · "); }
/* the live map (replaces the first version) */
drawNet = function(ctx, M){
  const N = XR.dn; if (!N || !N.segs){ if (XR.dnMode === "draw") dnDrawDraft(ctx, M); return; }
  const sh = DNSTY.show, C = dnColorScale(), line = pts => { ctx.beginPath(); pts.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); };
  ctx.save(); ctx.lineCap = ctx.lineJoin = "round";
  if (sh.loops){ ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(160,160,160,.85)"; ctx.lineWidth = 1.5; for (const [a, b] of N.loops){ line([a, b]); ctx.stroke(); } ctx.setLineDash([]); }
  for (const s of N.segs.slice().sort((a, b) => b.order - a.order)){ if (!(s.L > 0)) continue; const lw = dnLw(s); line(s.pts); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = lw + 2; ctx.stroke(); ctx.strokeStyle = C.col(s); ctx.lineWidth = lw; ctx.stroke(); }
  const txt = (t, x, y, c = "#fff", f = "600 10.5px Inter, sans-serif") => { ctx.font = f; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.78)"; ctx.strokeText(t, x, y); ctx.fillStyle = c; ctx.fillText(t, x, y); };
  if (sh.ticks) for (const s of N.segs){ if (!(s.L > 0)) continue; [["i", .1], ["h", .5], ["f", .9]].forEach(([k, f]) => { const w = s["w" + k]; if (!Number.isFinite(w)) return; const p = ptAlong(s, f*s.L), p2 = ptAlong(s, Math.min(s.L, f*s.L + .01)), a = M.toScr(p[0], p[1]), b = M.toScr(p2[0], p2[1]), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, half = Math.max(5, w/2/M.mpp()); ctx.beginPath(); ctx.moveTo(a[0] - dy/l*half, a[1] + dx/l*half); ctx.lineTo(a[0] + dy/l*half, a[1] - dx/l*half); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }); }
  const dense = N.bifs.length < 60 || M.z > 10;
  for (const B of N.bifs){ if (!Number.isFinite(B.theta)) continue; const q = M.toScr(B.ll[0], B.ll[1]);
    if (sh.limbs){ for (const id of B.children){ const s = N.segs[id]; if (!(s.L > 0)) continue; const p = ptAlong(s, Math.min(s.L, Math.max(B.limb/1000, M.mpp()*25/1000))), r = M.toScr(p[0], p[1]); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); } }
    if (sh.nodes){ ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.2; ctx.stroke(); }
    if (sh.angle && dense) txt(nf(B.theta, 0) + "°", q[0] + 6, q[1] - 6); }
  if ([sh.lab, sh.order, sh.len, sh.width, sh.wn, sh.sin].some(Boolean) && dense) for (const s of N.segs){ if (!(s.L > 0)) continue; const t = dnLabelText(s); if (!t) continue; const p = ptAlong(s, s.L/2), q = M.toScr(p[0], p[1]); txt(t, q[0] + 5, q[1] + 4, DNSTY.colorBy === "order" ? ordCol(s.order) : "#fff", "italic 600 10.5px Inter, sans-serif"); }
  if (sh.outlets) for (const s of N.segs){ if (s.end !== "outlet") continue; const p = s.pts[s.pts.length - 1], q = M.toScr(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 7); ctx.fillStyle = "#1f77b4"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  if (sh.apex){ const a = M.toScr(N.apex[0], N.apex[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 10); ctx.lineTo(a[0] + 8, a[1] + 6); ctx.lineTo(a[0] - 8, a[1] + 6); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke(); txt("Apex", a[0] + 10, a[1] + 4, "#fff", "700 11px Inter, sans-serif"); }
  if (XR.dnSel != null && N.segs[XR.dnSel]){ line(N.segs[XR.dnSel].pts); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore(); if (XR.dnMode === "draw") dnDrawDraft(ctx, M);
};
/* legends stacked bottom-left, above the scale bar, at the chosen size */
function drawLegendStack(ctx, w, h, scaleOn){
  const k = FURN.legend.k || 1, kS = FURN.scale.k || 1; let base = h - 8 - (scaleOn ? 24*kS + 8 : 0);
  if (XR.river && XR.legend && XR.legend.key !== "plain"){ const L = XR.legend, ctl = document.querySelector(".xmapctl"), ch = ctl && ctl.offsetParent ? ctl.offsetHeight : 0, top = h - ch - 26 - 60, hh = L.key === "zone" ? 18 + ZONE_CAT.length*15 + 8 : !L.n ? 44 : 52, y0 = L.key === "zone" ? top + 50 - hh : !L.n ? top + 8 : top;
    ctx.save(); ctx.translate(10, base); ctx.scale(k, k); ctx.translate(-10, -(y0 + hh)); drawMapLegend(ctx, w, h); ctx.restore(); if (!XR._legSkip) base -= (hh + 6)*k; }
  if (XR.dn && XR.dn.segs && DNSTY.show.legend){ ctx.save(); ctx.translate(10, base); ctx.scale(k, k); dnMapLegend(ctx, w/k, 0); ctx.restore(); }
}
/* network legend (drawn with its bottom at y = h) */
function dnMapLegend(ctx, w, h){
  const N = XR.dn; if (!N || !N.segs || !DNSTY.show.legend) return; const C = dnColorScale(), plain = EX.base[XR.base].plain, col = furnLegendCols(plain), bw = Math.min(210, w*.5), x = 0, hh = C.cat ? 40 : 52;
  const y = h - hh; ctx.save(); ctx.fillStyle = col.bg; roundRect(ctx, x, y, bw, hh, 8); ctx.fill(); ctx.fillStyle = col.fg; ctx.font = "600 11px Inter, sans-serif"; ctx.fillText("Network: " + C.def[0] + (C.def[1] ? ` (${C.def[1]})` : "") + (C.log ? " · log" : ""), x + 8, y + 15);
  if (C.cat){ const n = C.cat.length, cw = Math.min(26, (bw - 16)/n); C.cat.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillRect(x + 8 + i*cw, y + 22, cw - 3, 6); ctx.fillStyle = col.mu; ctx.font = "500 9.5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(C.k === "end" ? t.slice(0, 5) : t, x + 8 + i*cw + (cw - 3)/2, y + 37); }); ctx.textAlign = "left"; }
  else if (!C.none){ const gw = bw - 16; for (let i = 0; i < gw; i++){ ctx.fillStyle = vir(i/(gw - 1)); ctx.fillRect(x + 8 + i, y + 22, 1.2, 9); } const v = u => { const t = C.lo + (C.hi - C.lo)*u; return C.log ? 10**t : t; }; ctx.fillStyle = col.mu; ctx.font = "500 10px Inter, sans-serif"; ctx.fillText(tfmt(v(0)), x + 8, y + 45); ctx.textAlign = "right"; ctx.fillText(tfmt(v(1)), x + 8 + gw, y + 45); ctx.textAlign = "left"; }
  ctx.restore();
}
/* the network in the river's clean view and composed figures (projected with the panel's own transform) */
function dnCvSVG(G, X, Y){
  const N = XR.dn; if (!N || !N.segs || CV.show.net === false) return ""; const C = dnColorScale(), sh = DNSTY.show, out = [];
  const pl = pts => G.loc(pts).map(p => X(p).toFixed(1) + "," + Y(p).toFixed(1)).join(" ");
  if (sh.loops) for (const [a, b] of N.loops) out.push(`<polyline points="${pl([a, b])}" fill="none" stroke="#9e9e9e" stroke-width="1" stroke-dasharray="4 3"/>`);
  for (const s of N.segs.slice().sort((a, b) => b.order - a.order)){ if (!(s.L > 0)) continue; const P = s.pts.filter((_, i, a) => i % Math.max(1, Math.floor(a.length/300)) === 0 || i === a.length - 1); out.push(`<polyline points="${pl(P)}" fill="none" stroke="${C.col(s)}" stroke-width="${(dnLw(s)*.55).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`); }
  for (const B of N.bifs){ if (!Number.isFinite(B.theta)) continue; const [q] = G.loc([B.ll]); if (sh.nodes) out.push(`<circle cx="${X(q).toFixed(1)}" cy="${Y(q).toFixed(1)}" r="2.2" fill="#fff" stroke="#111" stroke-width=".7"/>`); if (sh.angle && N.bifs.length <= 80) out.push(`<text x="${(X(q) + 3).toFixed(1)}" y="${(Y(q) - 3).toFixed(1)}" font-size="8" fill="#111" stroke="#fff" stroke-width="2" paint-order="stroke">${nf(B.theta, 0)}°</text>`); }
  if ([sh.lab, sh.order, sh.len, sh.width, sh.wn, sh.sin].some(Boolean) && N.segs.length <= 120) for (const s of N.segs){ if (!(s.L > 0)) continue; const t = dnLabelText(s); if (!t) continue; const [q] = G.loc([ptAlong(s, s.L/2)]); out.push(`<text x="${(X(q) + 3).toFixed(1)}" y="${(Y(q) + 3).toFixed(1)}" font-size="7.5" font-style="italic" fill="#222" stroke="#fff" stroke-width="2" paint-order="stroke">${esc(t)}</text>`); }
  if (sh.apex){ const [q] = G.loc([N.apex]); out.push(`<path d="M${X(q).toFixed(1)} ${(Y(q) - 6).toFixed(1)}l5 9h-10z" fill="#fff" stroke="#111" stroke-width="1"/>`); }
  return `<g class="dnnet">${out.join("")}</g>`;
}
/** network legend as SVG (for the clean view, figures and the network view) */
function dnLegendSVG(){ const C = dnColorScale(), t = "Network: " + C.def[0] + (C.def[1] ? ` (${C.def[1]})` : "") + (C.log ? " · log" : "");
  if (C.cat){ const n = C.cat.length, cw = C.k === "end" ? 62 : 22, w = Math.max(150, 16 + n*cw); return {w, h: 42, s: `<rect width="${w}" height="42" rx="6" fill="#fff" fill-opacity=".93" stroke="#ccc" stroke-width=".6"/><text x="8" y="14" font-size="10.5" font-weight="600" fill="#111">${esc(t)}</text>${C.cat.map(([a, c], i) => `<rect x="${8 + i*cw}" y="20" width="${cw - 4}" height="6" fill="${c}"/><text x="${8 + i*cw + (cw - 4)/2}" y="36" font-size="9" text-anchor="middle" fill="#333">${esc(a)}</text>`).join("")}`}; }
  const w = 200, v = u => { const x = C.lo + (C.hi - C.lo)*u; return C.log ? 10**x : x; }; return {w, h: 50, s: `<rect width="${w}" height="50" rx="6" fill="#fff" fill-opacity=".93" stroke="#ccc" stroke-width=".6"/><text x="8" y="14" font-size="10.5" font-weight="600" fill="#111">${esc(t)}</text>${Array.from({length: 46}, (_, i) => `<rect x="${8 + i*4}" y="20" width="4.3" height="9" fill="${vir(i/45)}"/>`).join("")}<text x="8" y="42" font-size="9" fill="#333">${C.none ? "not measured" : tfmt(v(0))}</text><text x="${w - 8}" y="42" font-size="9" text-anchor="end" fill="#333">${C.none ? "" : tfmt(v(1))}</text>`}; }
/* styling controls in the network panel */
function dnStyleCard(){
  return `<div class="card x11sty"><h4>Show on the map, clean view and figures</h4><div class="row"><label>Colour channels by</label><select id="dnColBy">${Object.entries(DNCOL).map(([k, d]) => `<option value="${k}"${DNSTY.colorBy === k ? " selected" : ""}>${esc(d[0])}</option>`).join("")}</select></div>
    <div class="chips">${DNSHOW.map(([k, t]) => `<button class="chip${DNSTY.show[k] ? " on" : ""}" data-dsh="${k}">${t}</button>`).join("")}</div>
    <label class="fl">Line width <span id="dnLwV">${Math.round(DNSTY.lw*100)} %</span><input type="range" id="dnLw" min="40" max="250" step="10" value="${Math.round(DNSTY.lw*100)}"></label>
    <div class="btns"><button class="sm" id="dnFurn">⚙ Legend, scale & north style</button><button class="sm pri" id="dnViewBtn">⬜ Network clean view</button>${XR.river ? `<button class="sm" id="dnCvBtn">River clean view with network</button>` : ""}</div></div>`;
}
function dnStyleWire(el){
  const rr = () => { dnStySave(); xmap && xmap.req(); if ($("cvWrap") && typeof cvDraw === "function") cvDraw(); if ($("dnvWrap")) dnvDraw(); };
  const c = el.querySelector("#dnColBy"); if (c) c.onchange = () => { DNSTY.colorBy = c.value; rr(); };
  el.querySelectorAll("[data-dsh]").forEach(b => b.onclick = () => { const k = b.dataset.dsh; DNSTY.show[k] = !DNSTY.show[k]; b.classList.toggle("on", DNSTY.show[k]); rr(); });
  const lw = el.querySelector("#dnLw"); if (lw) lw.oninput = () => { DNSTY.lw = +lw.value/100; el.querySelector("#dnLwV").textContent = lw.value + " %"; rr(); };
  const f = el.querySelector("#dnFurn"); if (f) f.onclick = () => furnDialog();
  const v = el.querySelector("#dnViewBtn"); if (v) v.onclick = openDnView;
  const cvb = el.querySelector("#dnCvBtn"); if (cvb) cvb.onclick = () => { CV.show.net = true; openCleanView(); };
}
{ const _dnr = dnRender; dnRender = function(){ _dnr(); const el = dnTarget(); if (!el || !XR.dn || !XR.dn.segs) { if (el) dnLibInject(el); return; }
    el.querySelectorAll("[data-dns]").forEach(b => b.closest(".chips") && b.closest(".chips").remove());
    const cards = el.querySelectorAll(":scope > .card"); if (cards[1]) cards[1].insertAdjacentHTML("afterend", dnStyleCard()); dnStyleWire(el); dnLibInject(el); }; }

/* ---------- 3. network clean view: white background or satellite, any colour, chosen labels, sized furniture ---------- */
const DNV = {bg: "white", pos: {legend: "br", scale: "bl", north: "tr"}};
function openDnView(){
  if (!XR.dn || !XR.dn.segs) return toast("Map a channel network first"); let w = $("dnvWrap"); if (w) w.remove();
  w = document.createElement("div"); w.id = "dnvWrap"; w.className = "cvwrap"; document.body.appendChild(w);
  const pos = k => `<select data-dvp="${k}">${[["tl", "top left"], ["tr", "top right"], ["bl", "bottom left"], ["br", "bottom right"], ["off", "hidden"]].map(([v, t]) => `<option value="${v}"${DNV.pos[k] === v ? " selected" : ""}>${t}</option>`).join("")}</select>`;
  w.innerHTML = `<div class="cvbar"><b>${esc(XR.dn.name)} — network view</b><div class="cvbtn"><button class="sm" id="dnvFurn">⚙ Size & style</button><button class="sm pri" id="dnvExp">⬇ Export (PNG / PDF / SVG)</button><button class="sm" id="dnvX">Close</button></div></div>
    <div class="cvrow" style="padding:6px 12px"><span class="cvl">Background</span><select id="dnvBg"><option value="white"${DNV.bg === "white" ? " selected" : ""}>White</option><option value="sat"${DNV.bg === "sat" ? " selected" : ""}>Satellite (current base map)</option></select><span class="cvl">Legend</span>${pos("legend")}<span class="cvl">Scale</span>${pos("scale")}<span class="cvl">North</span>${pos("north")}</div>
    <div id="dnvSty" style="padding:0 12px"></div><div class="cvmain" style="padding:8px 12px"><div id="dnvSvg"></div></div>`;
  $("dnvX").onclick = () => w.remove(); $("dnvFurn").onclick = () => furnDialog(dnvDraw);
  $("dnvBg").onchange = async e => { DNV.bg = e.target.value; DNV.satURL = null; await dnvDraw(); };
  w.querySelectorAll("[data-dvp]").forEach(s => s.onchange = () => { DNV.pos[s.dataset.dvp] = s.value; dnvDraw(); });
  $("dnvSty").innerHTML = dnStyleCard().replace(/id="dnViewBtn"[^>]*>[^<]*<\/button>/, "").replace(/<button class="sm" id="dnCvBtn">[^<]*<\/button>/, ""); dnStyleWire($("dnvSty"));
  $("dnvExp").onclick = () => exportDialog({name: XR.dn.name + "_network_view", title: "the network view", journalOpt: false, svg: () => DNV.last});
  dnvDraw();
}
async function dnvDraw(){
  const box = $("dnvSvg"); if (!box || !XR.dn) return; const N = XR.dn, W = Math.max(320, Math.min(1400, (box.parentElement.clientWidth || 900) - 24)), P = N.segs.flatMap(s => s.pts), A = N.apex;
  let s0 = 90, n0 = -90, w0 = 180, e0 = -180; for (const p of P){ s0 = Math.min(s0, p[0]); n0 = Math.max(n0, p[0]); w0 = Math.min(w0, p[1]); e0 = Math.max(e0, p[1]); }
  const lat0 = (s0 + n0)/2, lon0 = (w0 + e0)/2, loc = a => toLocal(a, lat0, lon0), LL = loc([[s0, w0], [n0, e0]]), dx = Math.abs(LL[1][0] - LL[0][0]), dy = Math.abs(LL[1][1] - LL[0][1]), H = Math.round(clamp(W*dy/(dx || 1)*1.08 + 40, 240, 1100)), sc = Math.max(dx/(W - 40), dy/(H - 40)) || 1;
  const X = p => p[0]/sc + W/2, Y = p => p[1]/sc + H/2, G = {loc};
  let bg = `<rect width="${W}" height="${H}" fill="#fff"/>`;
  if (DNV.bg === "sat"){ if (!DNV.satURL || DNV.satW !== W){ box.innerHTML = `<p class="note shimmer">Rendering the satellite background…</p>`; DNV.satURL = await dnSatImage(P, W, H, sc, lat0, lon0); DNV.satW = W; } if (DNV.satURL) bg = `<image href="${DNV.satURL}" width="${W}" height="${H}"/>`; else toast("This base map does not allow image export: using white", 4000); }
  const keepShow = CV.show.net; CV.show.net = true; let body = dnCvSVG(G, X, Y); CV.show.net = keepShow;
  if (DNV.bg === "sat") body = body.replace(/stroke="#fff" stroke-width="2" paint-order="stroke"/g, 'stroke="#000" stroke-width="2.2" paint-order="stroke"').replace(/fill="#111" stroke="#000"/g, 'fill="#fff" stroke="#000"').replace(/fill="#222" stroke="#000"/g, 'fill="#fff" stroke="#000"');
  const place = (key, w, h) => { const p = DNV.pos[key]; if (p === "off") return null; return [p[1] === "l" ? 8 : W - w - 8, p[0] === "t" ? 8 : H - h - 8]; }, fur = [];
  const L = dnLegendSVG(), kL = FURN.legend.k || 1, pL = place("legend", L.w*kL, L.h*kL); if (pL) fur.push(`<g transform="translate(${pL[0]},${pL[1]}) scale(${kL})">${L.s}</g>`);
  const t = W*.2*sc, p10 = 10**Math.floor(Math.log10(t)), len = [1, 2, 5].map(v => v*p10).filter(v => v <= t).pop() || p10, Sb = furnScaleSVG(len/sc, len >= 1 ? tfmt(len) + " km" : nf(len*1000) + " m"), kS = FURN.scale.k || 1, pS = place("scale", Sb.w*kS, Sb.h*kS); if (pS) fur.push(`<g transform="translate(${pS[0]},${pS[1]}) scale(${kS})">${Sb.s}</g>`);
  const Nb = furnNorthSVG(0), kN = FURN.north.k || 1, pN = place("north", Nb.w*kN, Nb.h*kN); if (pN) fur.push(`<g transform="translate(${pN[0]},${pN[1]}) scale(${kN})">${Nb.s}</g>`);
  DNV.last = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Helvetica, Arial, sans-serif">${bg}${body}${fur.join("")}</svg>`;
  box.innerHTML = DNV.last.replace("<svg ", '<svg style="width:100%;height:auto;border:1px solid #ccd;border-radius:6px" ');
}
/* satellite background for an arbitrary set of points, rendered from the live map at the figure's shape */
async function dnSatImage(P, W, H, sc, lat0, lon0){
  const M = xmap, cv0 = M.cv, od = M.dpr, ob = M.tileBias || 0, oz = M.z, oc = [M.lat, M.lon], osz = M.size, orot = M.rot, kl = {...XR.lay}, keepDn = XR.dn;
  Object.assign(XR.lay, {legend: false, labels: false, scale: false, side: false, tribs: false, reaches: false, dams: false, pos: false}); XR.dn = null; const kr = XR.river; XR.river = null; M.rot = 0; M.dpr = 2;
  M.size = () => { if (cv0.width !== Math.round(W*M.dpr)){ cv0.width = Math.round(W*M.dpr); cv0.height = Math.round(H*M.dpr); } return [W, H]; };
  try { M.lat = lat0; M.lon = lon0; const mpp = sc*1000, z = Math.log2(156543.03*Math.cos(lat0*D2R)/mpp); M.z = z; for (let t = 0; t < 30; t++){ M.draw(); if (!M.miss) break; await new Promise(r => setTimeout(r, 350)); } M.draw(); return cv0.toDataURL("image/jpeg", .9); }
  catch(_){ return null; } finally { Object.assign(XR.lay, kl); XR.dn = keepDn; XR.river = kr; M.size = osz; M.rot = orot; M.dpr = od; M.tileBias = ob; M.z = oz; M.lat = oc[0]; M.lon = oc[1]; M.req(); }
}

/* ---------- 4. network library (stored in this browser) and batch mapping of many networks ---------- */
const DNLIB_GROUPS = ["fluvial fan", "delta", "other", "unknown"];
let DNLIB = null; // in-memory list
async function dnLibLoad(){ if (DNLIB) return DNLIB; try { DNLIB = (await idbAll("netlib")) || []; } catch(e){ console.warn(e); DNLIB = []; } return DNLIB; }
async function dnLibSave(rec){ await dnLibLoad(); const i = DNLIB.findIndex(r => r.id === rec.id); if (i >= 0) DNLIB[i] = rec; else DNLIB.push(rec); try { await idbPut("netlib", rec); } catch(e){ toast("Could not store in this browser: " + e.message, 4000); } }
async function dnLibDel(id){ await dnLibLoad(); DNLIB = DNLIB.filter(r => r.id !== id); try { await idbDel("netlib", id); } catch(_){} }
function dnRecord(N, meta = {}){
  const S = N.sum, slim = N.segs.filter(s => s.L > 0).map(s => ({o: s.order, j: s.j, L: +s.L.toFixed(4), wi: s.wi, wh: s.wh, wf: s.wf, wm: s.wmean, Wn: s.Wn, Ln: s.Ln, sin: s.sin, grad: s.grad, end: s.end, p: s.pts.filter((_, i, a) => i % Math.max(1, Math.floor(a.length/40)) === 0 || i === a.length - 1).map(p => [+p[0].toFixed(5), +p[1].toFixed(5)])}));
  const verts = N.lines.reduce((a, l) => a + l.pts.length, 0);
  return {id: meta.id || "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: meta.name || N.name, group: meta.group || "unknown", region: meta.region || "", notes: meta.notes || "", apex: N.apex, src: N.src, made: new Date().toISOString(), method: DN_METHOD,
    m: {n: S.n, maxOrder: S.maxOrder, nBif: S.nBif, nOut: S.nOut, totalL: S.totalL, area: S.area, dens: S.dens, radius: S.radius, w0: S.w0, theta: S.theta.mean, thetaCI: S.theta.ci, thetaMed: S.theta.med, thetaN: S.theta.n, thetaFar: S.thetaFar.mean, Ln: S.Ln.mean, Wn: S.Wn.mean, Rb: S.Rb, Rl: S.Rl, Rw: S.Rw, cons: S.cons.mean, asym: S.asym.mean, relief: S.relief, slope: S.fanSlope, nW: S.nW, loops: S.nLoops + S.nRejoin, sinMean: meanCI(N.segs.filter(s => !s.zero).map(s => s.sin)).mean, verdict: S.cls.verdict},
    byOrder: {Wn: dnByOrder(N, "Wn"), Ln: dnByOrder(N, "Ln"), theta: dnByOrder(N, "theta")}, angles: N.bifs.map(b => b.theta).filter(Number.isFinite), segs: slim, lines: verts <= 40000 ? N.lines : null, directed: N.directed, manual: N.manual || null};
}
/** fetch, build and (optionally) measure one network without touching the screen */
async function dnHeadless(job, opt){
  const [s, W, n, E] = job.bb, types = XR.dnOpt.canals ? "river|stream|canal|drain|ditch|tidal_channel|distributary" : "river|stream|tidal_channel|distributary";
  const d = await overpass(`[out:json][timeout:120];way["waterway"~"^(${types})$"](${s},${W},${n},${E});out body geom;`);
  const lines = (d.elements || []).filter(e => e.type === "way" && e.geometry && e.geometry.length > 1).map(e => ({id: "w" + e.id, nodes: e.nodes && e.nodes.length === e.geometry.length ? e.nodes.map(String) : null, pts: e.geometry.map(g => [g.lat, g.lon]), tags: e.tags || {}}));
  if (!lines.length) throw new Error("no mapped waterways");
  return dnBuildHeadless({name: job.name, src: `OpenStreetMap waterways, box ${job.bb.map(v => v.toFixed(3)).join(",")}`, lines, directed: !XR.dnOpt.ignoreDir, osm: true, apex: job.apex || null}, opt);
}
async function dnBuildHeadless(o, opt = {}){
  const keep = XR.dn, keepSel = XR.dnSel; XR.dn = {name: o.name, src: o.src, lines: o.lines, directed: o.directed, osm: !!o.osm, apex: o.apex, segs: null, made: new Date().toISOString()};
  try { if (!XR.dn.apex){ XR.dn.apex = dnGuessApex(XR.dn); XR.dn.apexGuess = true; } dnBuildChecked(); if (!XR.dn.segs) throw new Error("no network");
    if (opt.widths){ const r = dnRender, xs = xstatus; dnRender = () => {}; xstatus = () => {}; try { await dnMeasureWidths(); } finally { dnRender = r; xstatus = xs; } }
    return XR.dn; } finally { const N = XR.dn; XR.dn = keep; XR.dnSel = keepSel; if (opt.keep) XR.dn = N; }
}
/* build with a sane direction rule: mapped flow first; away from the apex only if flow gives no branching at all */
function dnBuildChecked(){
  const N = XR.dn; dnBuild(); if (!N.osm || !N.directed) return;
  if (N.bifs.length < 2){ const keep = {...N}; N.directed = false; try { dnBuild(); if (N.bifs.length > keep.bifs.length) N.dirNote = "Mapped flow directions gave no branching network, so channels were oriented away from the apex: check that tributaries (which join rather than split) are not counted."; else Object.assign(N, keep); } catch(_){ Object.assign(N, keep); } }
}
/* batch: one line per network — name, lat, lon [, radius km] [, group] [, apex lat, apex lon]  (or name, south, west, north, east, group) */
XR.dnBatch = null;
function dnParseBatch(text){
  const rows = []; for (const raw of text.split(/\r?\n/)){ const line = raw.trim(); if (!line || /^#/.test(line)) continue; const c = line.split(/[,;\t]/).map(x => x.trim()); if (c.length < 3 || !Number.isFinite(parseFloat(c[1]))) continue;
    const num = c.slice(1).map(parseFloat), txt = c.slice(1).filter(x => x && !Number.isFinite(parseFloat(x))); let bb, apex = null, group = txt[0] || "unknown";
    const nums = num.filter(Number.isFinite);
    if (nums.length >= 4 && Math.abs(nums[2]) <= 90 && nums.length !== 5 && nums.length !== 3 && nums.length !== 6 && Math.abs(nums[0]) <= 90 && nums[0] < nums[2]){ bb = nums.slice(0, 4); }
    else { const [la, lo] = nums, r = nums[2] && nums[2] < 1000 ? nums[2] : 25, dl = r/111.32, dn = r/(111.32*Math.cos(la*D2R)); bb = [la - dl, lo - dn, la + dl, lo + dn]; if (nums.length >= 5) apex = [nums[3], nums[4]]; }
    rows.push({name: c[0], bb, apex, group, status: "waiting"}); }
  return rows;
}
async function dnRunBatch(){
  const B = XR.dnBatch; if (!B || B.running) return; B.running = true; B.stop = false; dnLibRender();
  for (const job of B.jobs){ if (B.stop) break; if (job.status === "done" || job.status === "skipped") continue; job.status = "running"; dnLibRender();
    try { const t0 = Date.now(), N = await dnHeadless(job, {widths: B.widths}); const rec = dnRecord(N, {name: job.name, group: job.group}); await dnLibSave(rec); job.status = "done"; job.note = `${N.sum.n} channels, ${N.sum.maxOrder} orders, θ ${nf(N.sum.theta.mean, 1)}° (${Math.round((Date.now() - t0)/1000)} s)`; }
    catch(e){ job.status = "failed"; job.note = e.message; }
    B.done = B.jobs.filter(j => j.status === "done").length; actSet("dnb", `Batch: ${B.done + B.jobs.filter(j => j.status === "failed").length} of ${B.jobs.length} networks`, (B.done + B.jobs.filter(j => j.status === "failed").length)/B.jobs.length); dnLibRender();
    try { localStorage.setItem("efl.dnbatch", JSON.stringify({jobs: B.jobs.map(j => ({...j, status: j.status === "running" ? "waiting" : j.status})), widths: B.widths, running: !B.stop})); } catch(_){} }
  B.running = false; try { const sv = JSON.parse(localStorage.getItem("efl.dnbatch") || "null"); if (sv){ sv.running = false; localStorage.setItem("efl.dnbatch", JSON.stringify(sv)); } } catch(_){} actEnd("dnb"); dnLibRender(); xstatus(`Batch finished: ${B.done} of ${B.jobs.length} networks stored in the library.`, "ok");
}
/* many hand-digitised networks at once: one GeoJSON per network, or one file with a "network" property per feature */
async function dnImportMany(files, group){
  let n = 0; for (const f of files){ try { const j = JSON.parse(await f.text()), feats = j.type === "FeatureCollection" ? j.features : [j], by = new Map();
      for (const ft of feats){ const g = ft.geometry; if (!g) continue; const key = (ft.properties && (ft.properties.network || ft.properties.landform)) || f.name.replace(/\.[^.]+$/, ""); const ls = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []; for (const c of ls) if (c.length > 1) (by.get(key) || by.set(key, []).get(key)).push({id: "f" + (by.get(key) ? by.get(key).length : 0), pts: c.map(q => [q[1], q[0]]), tags: ft.properties || {}}); }
      for (const [name, lines] of by){ lines.forEach((l, i) => l.id = "f" + i); const ap = feats.find(ft => ft.geometry && ft.geometry.type === "Point" && ft.properties && /apex/i.test(JSON.stringify(ft.properties)) && (!ft.properties.network || ft.properties.network === name));
        const N = await dnBuildHeadless({name, src: "your file " + f.name, lines, directed: false, apex: ap ? [ap.geometry.coordinates[1], ap.geometry.coordinates[0]] : null}); await dnLibSave(dnRecord(N, {name, group: (lines[0].tags && (lines[0].tags.group || lines[0].tags.class)) || group})); n++; } }
    catch(e){ toast(`${f.name}: ${e.message}`, 4000); } }
  xstatus(`Imported ${n} networks into the library.`, "ok"); dnLibRender();
}

/* ---------- 5. statistics across the library ---------- */
const erf = x => { const t = 1/(1 + .3275911*Math.abs(x)), y = 1 - (((((1.061405429*t - 1.453152027)*t) + 1.421413741)*t - .284496736)*t + .254829592)*t*Math.exp(-x*x); return x >= 0 ? y : -y; };
const pNorm2 = z => 2*(1 - .5*(1 + erf(Math.abs(z)/Math.SQRT2)));
function lgamma(x){ const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .1208650973866179e-2, -.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + .5)*Math.log(t); let s = 1.000000000190015; for (const v of c) s += v/++y; return -t + Math.log(2.5066282746310005*s/x); }
function betacf(a, b, x){ let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab*x/qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1/d; let h = d; for (let m = 1; m <= 200; m++){ const m2 = 2*m; let aa = m*(b - m)*x/((qam + m2)*(a + m2)); d = 1 + aa*d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa/c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1/d; h *= d*c; aa = -(a + m)*(qab + m)*x/((a + m2)*(qap + m2)); d = 1 + aa*d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa/c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1/d; const del = d*c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function ibeta(x, a, b){ if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a*Math.log(x) + b*Math.log(1 - x)); return x < (a + 1)/(a + b + 2) ? bt*betacf(a, b, x)/a : 1 - bt*betacf(b, a, 1 - x)/b; }
const pT2 = (t, df) => ibeta(df/(df + t*t), df/2, .5);
function welch(a, b){ const A = meanCI(a), B = meanCI(b); if (A.n < 2 || B.n < 2) return null; const va = A.sd**2/A.n, vb = B.sd**2/B.n, t = (A.mean - B.mean)/Math.sqrt(va + vb), df = (va + vb)**2/(va*va/(A.n - 1) + vb*vb/(B.n - 1)), sp = Math.sqrt(((A.n - 1)*A.sd**2 + (B.n - 1)*B.sd**2)/(A.n + B.n - 2)); return {t, df, p: pT2(t, df), d: (A.mean - B.mean)/sp, diff: A.mean - B.mean, ci: tq(Math.round(df) + 1)*Math.sqrt(va + vb)}; }
function mannWhitney(a, b){ const all = a.map(v => [v, 0]).concat(b.map(v => [v, 1])).sort((x, y) => x[0] - y[0]); const r = new Array(all.length); let tie = 0; for (let i = 0; i < all.length;){ let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++; const rk = (i + j)/2 + 1; for (let k = i; k <= j; k++) r[k] = rk; const tn = j - i + 1; tie += tn**3 - tn; i = j + 1; }
  const n1 = a.length, n2 = b.length; if (n1 < 2 || n2 < 2) return null; let R1 = 0; all.forEach((x, i) => { if (!x[1]) R1 += r[i]; }); const U = R1 - n1*(n1 + 1)/2, mu = n1*n2/2, N = n1 + n2, sd = Math.sqrt(n1*n2/12*((N + 1) - tie/(N*(N - 1)))); return {U, p: pNorm2((U - mu)/(sd || 1)), cliff: 2*U/(n1*n2) - 1}; }
function bootDiffMed(a, b, n = 1000){ if (a.length < 3 || b.length < 3) return null; const v = []; let s = 12345; const rnd = () => (s = (s*16807) % 2147483647)/2147483647; for (let k = 0; k < n; k++){ const ra = a.map(() => a[Math.floor(rnd()*a.length)]), rb = b.map(() => b[Math.floor(rnd()*b.length)]); v.push(median(ra) - median(rb)); } v.sort((x, y) => x - y); return [quantile(v, .025), quantile(v, .975)]; }
function pearson(x, y){ const n = x.length; if (n < 3) return null; const mx = x.reduce((a, b) => a + b, 0)/n, my = y.reduce((a, b) => a + b, 0)/n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++){ sxy += (x[i] - mx)*(y[i] - my); sxx += (x[i] - mx)**2; syy += (y[i] - my)**2; } const r = sxy/Math.sqrt(sxx*syy), t = r*Math.sqrt((n - 2)/(1 - r*r)); return {r, p: pT2(t, n - 2), b: sxy/sxx, a: my - sxy/sxx*mx, n}; }
const ranks = v => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length); for (let i = 0; i < o.length;){ let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j)/2 + 1; i = j + 1; } return r; };
/** two-class logistic regression on standardised metrics, with leave-one-out cross-validation */
function logit(X, y, iters = 400, lam = .05){ const p = X[0].length, w = new Array(p + 1).fill(0); for (let it = 0; it < iters; it++){ const g = new Array(p + 1).fill(0); for (let i = 0; i < X.length; i++){ const z = w[0] + X[i].reduce((a, v, j) => a + v*w[j + 1], 0), e = 1/(1 + Math.exp(-z)) - y[i]; g[0] += e; X[i].forEach((v, j) => g[j + 1] += e*v); } for (let j = 0; j <= p; j++) w[j] -= .5*(g[j]/X.length + (j ? lam*w[j] : 0)); } return w; }
const lpred = (w, x) => 1/(1 + Math.exp(-(w[0] + x.reduce((a, v, j) => a + v*w[j + 1], 0))));
const LIBMET = [["theta", "Mean network angle θ (°)"], ["thetaMed", "Median angle (°)"], ["thetaFar", "Far-field angle (°)"], ["Ln", "Mean normalised length"], ["Wn", "Mean normalised width"], ["maxOrder", "Highest order"], ["n", "Channels"], ["nBif", "Bifurcations"], ["Rb", "Branching ratio"], ["Rl", "Length ratio"], ["Rw", "Width ratio"], ["cons", "Width kept at bifurcations"], ["asym", "Width asymmetry"], ["dens", "Channel density (km/km²)"], ["area", "Network area (km²)"], ["totalL", "Total channel length (km)"], ["radius", "Apex–outlet distance (km)"], ["sinMean", "Mean sinuosity"], ["slope", "Apex–outlet slope (m/m)"], ["relief", "Relief (m)"], ["w0", "First-order width (m)"]];
const GRPC = {"fluvial fan": "#d62728", delta: "#1f77b4", other: "#2ca02c", unknown: "#7f7f7f"};
const grpCol = g => GRPC[g] || DNCMP[Math.abs([...g].reduce((a, c) => a*31 + c.charCodeAt(0), 7)) % 8];
XR.dnStat = Object.assign({m: "theta", x: "Ln", y: "theta", g1: "fluvial fan", g2: "delta", feats: ["theta", "Ln", "Wn"], showMap: true}, (() => { try { return JSON.parse(localStorage.getItem("efl.dnstat")) || {}; } catch(_){ return {}; } })());
const dnStatSave = () => { try { localStorage.setItem("efl.dnstat", JSON.stringify(XR.dnStat)); } catch(_){} };
function groupsOf(L){ return [...new Set(L.map(r => r.group || "unknown"))].sort((a, b) => (DNLIB_GROUPS.indexOf(a) + 99*(DNLIB_GROUPS.indexOf(a) < 0)) - (DNLIB_GROUPS.indexOf(b) + 99*(DNLIB_GROUPS.indexOf(b) < 0))); }
const vals = (L, g, k) => L.filter(r => (r.group || "unknown") === g).map(r => r.m[k]).filter(Number.isFinite);
function statsHTML(L, cfg){
  const st = cfg.st, G = groupsOf(L), met = Object.fromEntries(cfg.met), fmt = v => Number.isFinite(v) ? (Math.abs(v) >= 100 ? nf(v, 0) : Math.abs(v) >= 1 ? nf(v, 2) : nf(v, 3)) : "–", opts = (sel, id) => `<select id="${id}">${cfg.met.map(([k, t]) => `<option value="${k}"${sel === k ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`, gopt = (sel, id) => `<select id="${id}">${G.map(g => `<option${sel === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select>`;
  const summ = G.map(g => { const v = vals(L, g, st.m), c = meanCI(v); return `<tr><td><i class="x10sw" style="background:${grpCol(g)}"></i>${esc(g)}</td><td>${c.n}</td><td>${fmt(c.mean)}${c.n > 1 ? ` ± ${fmt(c.ci)}` : ""}</td><td>${fmt(c.med)}</td><td>${v.length > 3 ? fmt(quantile(v.slice().sort((a, b) => a - b), .25)) + "–" + fmt(quantile(v.slice().sort((a, b) => a - b), .75)) : "–"}</td><td>${fmt(c.sd)}</td></tr>`; }).join("");
  const a = vals(L, st.g1, st.m), b = vals(L, st.g2, st.m), W = welch(a, b), MW = mannWhitney(a, b), KS = ksTest(a, b), BD = bootDiffMed(a, b), sig = p => p < .001 ? "<0.001" : nf(p, 3);
  const verdict = W && MW ? (MW.p < .05 && W.p < .05 ? `<b>Significant difference</b> (both tests p < 0.05)` : MW.p < .05 || W.p < .05 ? "<b>Borderline</b>: one test p < 0.05" : "No significant difference at p < 0.05") : "Need at least 2 networks in each group";
  const pw = (() => { if (!W || !Number.isFinite(W.d)) return ""; const d = Math.abs(W.d); for (const n of [5, 10, 15, 20, 30, 40, 60, 80, 120, 200]){ const ncp = d*Math.sqrt(n/2); if (1 - .5*(1 + erf((1.96 - ncp)/Math.SQRT2)) >= .8) return `With an effect of this size (|d| = ${nf(d, 2)}), about <b>${n} networks per group</b> give 80 % power at p < 0.05.`; } return `The effect is small (|d| = ${nf(d, 2)}): more than 200 networks per group would be needed for 80 % power.`; })();
  // classifier
  const lab = L.filter(r => r.group === st.g1 || r.group === st.g2), F = st.feats.filter(k => met[k]), rows = lab.filter(r => F.every(k => Number.isFinite(r.m[k]))); let clsH = `<p class="note">Choose at least one measure and have 4+ networks in each of the two groups.</p>`;
  const Fv = F.filter(k => { const v = rows.map(r => r.m[k]); return v.length && Math.max(...v) - Math.min(...v) > 1e-12; }), dropped = F.filter(k => !Fv.includes(k));
  if (Fv.length && rows.filter(r => r.group === st.g1).length >= 4 && rows.filter(r => r.group === st.g2).length >= 4){
    // scaling is fitted on the training rows of each fold only (no leakage); whole basins are held out together
    const tr = (k, v) => k === "Ln" || k === "area" || k === "totalL" || k === "L" ? Math.log10(Math.max(v, 1e-6)) : v;
    const fitZ = R0 => { const mu = Fv.map(k => meanCI(R0.map(r => tr(k, r.m[k]))).mean), sd = Fv.map(k => meanCI(R0.map(r => tr(k, r.m[k]))).sd || 1); return r => Fv.map((k, j) => (tr(k, r.m[k]) - mu[j])/(sd[j] || 1)); };
    const ya = rows.map(r => r.group === st.g2 ? 1 : 0), unit = r => r.basin || r.river || r.id, units = [...new Set(rows.map(unit))]; let ok = 0, tp = [0, 0], cnt = [0, 0];
    const ug = new Map(); rows.forEach(r => ug.set(unit(r), r.group)); const ord = [...units].sort((x, y) => String(ug.get(x)).localeCompare(String(ug.get(y))) || String(x).localeCompare(String(y))), nF = Math.min(10, units.length), fold = new Map(); let sd0 = 99; const rr = () => (sd0 = (sd0*16807) % 2147483647)/2147483647; for (let i = ord.length - 1; i > 0; i--){ const j = Math.floor(rr()*(i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; } ord.sort((x, y) => String(ug.get(x)).localeCompare(String(ug.get(y)))); ord.forEach((u, i) => fold.set(u, i % nF));
    for (let f = 0; f < nF; f++){ const test = rows.filter(r => fold.get(unit(r)) === f), train = rows.filter(r => fold.get(unit(r)) !== f); if (new Set(train.map(r => r.group)).size < 2) continue; const Z = fitZ(train), w = logit(train.map(Z), train.map(r => r.group === st.g2 ? 1 : 0), 250);
      for (const r of test){ const y = r.group === st.g2 ? 1 : 0, pr = lpred(w, Z(r)) >= .5 ? 1 : 0; cnt[y]++; if (pr === y){ ok++; tp[y]++; } } }
    const Zall = fitZ(rows), Xa = rows.map(Zall), w = logit(Xa, ya), Z = Zall, unk = L.filter(r => r.group !== st.g1 && r.group !== st.g2 && Fv.every(k => Number.isFinite(r.m[k]))), sep = w.slice(1).some(v => Math.abs(v) > 8);
    const nTest = cnt[0] + cnt[1], F2 = Fv;
    clsH = `<p>${nF}-fold cross-validated accuracy${units.length < rows.length ? " (whole basins held out together)" : ""}: <b>${nf(100*ok/Math.max(1, nTest), 0)} %</b> (n = ${nTest}; ${esc(st.g1)} recall ${nf(100*tp[0]/cnt[0], 0)} %, ${esc(st.g2)} recall ${nf(100*tp[1]/cnt[1], 0)} %; chance ≈ ${nf(100*Math.max(cnt[0], cnt[1])/Math.max(1, nTest), 0)} %). Folds are stratified by group; scaling is fitted inside each training fold.${dropped.length ? ` Left out (no variation): ${dropped.map(k => esc(met[k])).join(", ")}.` : ""}${sep ? " <b>Warning:</b> the groups are (almost) perfectly separated — weights are unstable and accuracy will not generalise." : ""}${nTest < 30 ? " With under 30 networks this estimate is very uncertain." : ""}</p><p class="note">Standardised weights (positive → ${esc(st.g2)}): ${F2.map((k, j) => `${esc(met[k])} ${w[j + 1] >= 0 ? "+" : ""}${nf(w[j + 1], 2)}`).join("; ")}.</p>${unk.length ? `<div class="scroll"><table class="grid x8t"><tr><th>Unassigned network</th><th>P(${esc(st.g2)})</th><th>Predicted</th></tr>${unk.slice(0, 200).map(r => { const pz = lpred(w, Z(r)); return `<tr><td>${esc(r.name)}</td><td>${nf(pz, 2)}</td><td>${pz >= .5 ? esc(st.g2) : esc(st.g1)}</td></tr>`; }).join("")}</table></div>` : ""}`; }
  const sx = L.filter(r => Number.isFinite(r.m[st.x]) && Number.isFinite(r.m[st.y])), PR = pearson(sx.map(r => r.m[st.x]), sx.map(r => r.m[st.y])), rx = ranks(sx.map(r => r.m[st.x])), ry = ranks(sx.map(r => r.m[st.y])), SP = pearson(rx, ry);
  return `<div class="card"><h4>${esc(cfg.title || "Statistics across the library")}</h4><p class="note">${cfg.unitNote || "The network is the unit of analysis (one value per network), as in Gezovich et al. (2026)."} Assign groups in the table; "unknown" networks are left out of tests and get a predicted class below.</p>
    <div class="row"><label>Measure</label>${opts(st.m, cfg.px + "M")}</div><div class="scroll"><table class="grid x8t"><tr><th>Group</th><th>n</th><th>Mean ± 95 % CI</th><th>Median</th><th>IQR</th><th>SD</th></tr>${summ}</table></div><div id="${cfg.px}Box" class="xchart"></div>
    ${G.length >= 3 ? omnibusHTML(L, st, met, G) : ""}<h4>Is the difference significant?</h4><div class="row"><label>Compare</label>${gopt(st.g1, cfg.px + "G1")}<span>with</span>${gopt(st.g2, cfg.px + "G2")}</div>
    <p>${verdict}</p>${W ? `<div class="kv x10kv"><div><span>Welch t-test</span><b>t = ${nf(W.t, 2)}, df = ${nf(W.df, 1)}, p = ${sig(W.p)}</b></div><div><span>Mann–Whitney U</span><b>U = ${nf(MW.U, 1)}, p = ${sig(MW.p)}</b></div><div><span>Kolmogorov–Smirnov</span><b>${KS ? `D = ${nf(KS.D, 2)}, p ≈ ${sig(KS.p)}` : "–"}</b></div><div><span>Difference in means (95 % CI)</span><b>${fmt(W.diff)} ± ${fmt(W.ci)}</b></div><div><span>Difference in medians (bootstrap 95 %)</span><b>${BD ? fmt(BD[0]) + " to " + fmt(BD[1]) : "–"}</b></div><div><span>Effect size</span><b>Cohen's d ${nf(W.d, 2)} · Cliff's δ ${nf(MW.cliff, 2)}</b></div></div><p class="note">${pw}</p>` : ""}
    <h4>Relationship between two measures</h4><div class="row"><label>X</label>${opts(st.x, cfg.px + "X")}<label>Y</label>${opts(st.y, cfg.px + "Y")}</div><div id="${cfg.px}Sc" class="xchart"></div>${PR ? `<p class="note">Pearson r = ${nf(PR.r, 2)} (p = ${sig(PR.p)}), Spearman ρ = ${nf(SP.r, 2)} (p = ${sig(SP.p)}), n = ${PR.n}; line: least squares Y = ${fmt(PR.a)} + ${fmt(PR.b)}·X.</p>` : ""}
    ${cfg.byOrder === false ? "" : `<h4>Channels pooled by order and group</h4><div class="x10charts"><div><h5>Normalised width</h5><div id="${cfg.px}OW"></div></div><div><h5>Normalised length</h5><div id="${cfg.px}OL"></div></div><div><h5>Bifurcation angle</h5><div id="${cfg.px}OA"></div></div></div>`}
    <h4>Classify ${esc(st.g1)} vs ${esc(st.g2)}</h4><div class="chips">${cfg.met.map(([k, t]) => `<button class="chip${st.feats.includes(k) ? " on" : ""}" data-${cfg.px}f="${k}">${esc(t)}</button>`).join("")}</div>${clsH}</div>`;
}
/* all groups at once: Kruskal–Wallis, then pairwise Mann–Whitney with Holm adjustment (multiple testing) */
function gammp(a, x){ if (x <= 0) return 0; if (x < a + 1){ let sum = 1/a, del = sum, ap = a; for (let n = 0; n < 300; n++){ ap++; del *= x/ap; sum += del; if (Math.abs(del) < Math.abs(sum)*1e-12) break; } return sum*Math.exp(-x + a*Math.log(x) - lgamma(a)); } let b = x + 1 - a, c = 1/1e-30, d = 1/b, h = d; for (let i = 1; i < 300; i++){ const an = -i*(i - a); b += 2; d = an*d + b; if (Math.abs(d) < 1e-30) d = 1e-30; c = b + an/c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1/d; const del = d*c; h *= del; if (Math.abs(del - 1) < 1e-12) break; } return 1 - Math.exp(-x + a*Math.log(x) - lgamma(a))*h; }
function kruskal(groups){ const all = groups.flatMap((v, g) => v.map(x => [x, g])); const N = all.length, k = groups.filter(v => v.length).length; if (k < 2 || N < 4) return null; const rk = ranks(all.map(a => a[0])); let H = 0; groups.forEach((v, g) => { if (!v.length) return; const Rg = all.reduce((s, a, i) => s + (a[1] === g ? rk[i] : 0), 0); H += Rg*Rg/v.length; }); H = 12/(N*(N + 1))*H - 3*(N + 1);
  const cnt = new Map(); all.forEach(a => cnt.set(a[0], (cnt.get(a[0]) || 0) + 1)); const T = [...cnt.values()].reduce((s, t) => s + t**3 - t, 0), C = 1 - T/(N**3 - N); H = C > 0 ? H/C : H; const df = k - 1; return {H, df, p: 1 - gammp(df/2, H/2), eps2: (H - k + 1)/(N - k)}; }
function omnibusHTML(L, st, met, G){ const V = G.map(g => vals(L, g, st.m)), K = kruskal(V); if (!K) return ""; const pairs = []; for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++){ const m = mannWhitney(V[i], V[j]); if (m) pairs.push({a: G[i], b: G[j], p: m.p, d: m.cliff}); }
  pairs.sort((x, y) => x.p - y.p); let run = 0; pairs.forEach((q, i) => { run = Math.max(run, Math.min(1, q.p*(pairs.length - i))); q.adj = run; });
  return `<h4>All groups together</h4><p>Kruskal–Wallis H = ${nf(K.H, 2)}, df = ${K.df}, p = ${K.p < .001 ? "<0.001" : nf(K.p, 3)} (effect ε² = ${nf(Math.max(0, K.eps2), 2)}): ${K.p < .05 ? "<b>the groups differ</b>" : "no evidence that the groups differ"} in ${esc(met[st.m])}.</p><div class="scroll"><table class="grid x8t"><tr><th>Pair</th><th>Mann–Whitney p</th><th>Holm-adjusted p</th><th>Cliff's δ</th></tr>${pairs.map(q => `<tr><td>${esc(q.a)} vs ${esc(q.b)}</td><td>${q.p < .001 ? "<0.001" : nf(q.p, 3)}</td><td>${q.adj < .05 ? "<b>" : ""}${q.adj < .001 ? "<0.001" : nf(q.adj, 3)}${q.adj < .05 ? "</b>" : ""}</td><td>${nf(q.d, 2)}</td></tr>`).join("")}</table></div><p class="note">Testing many measures or pairs inflates false positives: decide the primary measure in advance and use the adjusted p-values. Rivers in the same basin are not independent.</p>`; }
function statsCharts(L, cfg){
  const st = cfg.st, G = groupsOf(L), met = Object.fromEntries(cfg.met);
  // strip + box by group
  { const el = $(cfg.px + "Box"); if (el){ const sets = G.map(g => ({g, v: vals(L, g, st.m).sort((a, b) => a - b)})).filter(s => s.v.length), all = sets.flatMap(s => s.v); if (all.length){ const W = Math.max(280, el.clientWidth || 360), H = 210, m = {l: 50, r: 10, t: 10, b: 34}, lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo || 1)*.08, Y = v => m.t + (1 - (v - lo + pad)/(hi - lo + 2*pad))*(H - m.t - m.b), cw = (W - m.l - m.r)/sets.length;
      let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xsvg">`; for (const t of niceTicks(lo - pad, hi + pad, 4)) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" class="gl"/><text x="${m.l - 5}" y="${Y(t) + 4}" text-anchor="end">${tfmt(t)}</text>`;
      sets.forEach((S, i) => { const cx = m.l + (i + .5)*cw, q1 = quantile(S.v, .25), q3 = quantile(S.v, .75), md = quantile(S.v, .5), c = grpCol(S.g); if (S.v.length >= 3) s += `<rect x="${cx - 16}" y="${Y(q3)}" width="32" height="${Math.max(1, Y(q1) - Y(q3))}" fill="${c}" fill-opacity=".25" stroke="${c}"/><line x1="${cx - 16}" x2="${cx + 16}" y1="${Y(md)}" y2="${Y(md)}" stroke="${c}" stroke-width="2"/>`;
        S.v.forEach((v, j) => s += `<circle cx="${cx - 22 + ((j*37) % 44)}" cy="${Y(v)}" r="2.6" fill="${c}" fill-opacity=".75"/>`); s += `<text x="${cx}" y="${H - 16}" text-anchor="middle">${esc(S.g)} (${S.v.length})</text>`; });
      s += `<text x="${m.l + (W - m.l - m.r)/2}" y="${H - 2}" text-anchor="middle" class="al">${esc(met[st.m])}</text>`; if (st.m === "theta" && cfg.refAngles !== false) for (const [y, t, c] of [[74, "deltas 74°", "#1f77b4"], [55, "fans 55°", "#d62728"]]) if (y > lo - pad && y < hi + pad) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}" stroke="${c}" stroke-dasharray="5 4"/><text x="${W - m.r - 3}" y="${Y(y) - 3}" text-anchor="end" fill="${c}" class="vl">${t} (paper)</text>`;
      el.innerHTML = s + "</svg>"; } else el.innerHTML = `<p class="note">No values yet.</p>`; } }
  // scatter
  { const el = $(cfg.px + "Sc"); if (el){ const pts = L.filter(r => Number.isFinite(r.m[st.x]) && Number.isFinite(r.m[st.y])); if (pts.length){ const ser = G.map(g => { const p = pts.filter(r => (r.group || "unknown") === g); return {x: p.map(r => r.m[st.x]), y: p.map(r => r.m[st.y]), c: grpCol(g), dots: true, r: 3.5}; }).filter(s => s.x.length), PR = pearson(pts.map(r => r.m[st.x]), pts.map(r => r.m[st.y]));
      if (PR){ const xs = pts.map(r => r.m[st.x]), a = Math.min(...xs), b = Math.max(...xs); ser.push({x: [a, b], y: [PR.a + PR.b*a, PR.a + PR.b*b], c: "#555", w: 1.2, dash: true}); }
      svgChart(el, {h: 230, xlab: met[st.x], ylab: met[st.y], series: ser}); } else el.innerHTML = `<p class="note">No networks with both values.</p>`; } }
  // pooled by order
  const pooled = (k, g) => { const out = []; for (const r of L.filter(r => (r.group || "unknown") === g)) (r.byOrder[k] || []).forEach((v, i) => { out[i] = (out[i] || []).concat(v); }); return Array.from(out, v => v || []); };
  const sets = k => G.map(g => ({name: g, vals: pooled(k, g), c: grpCol(g)})).filter(s => s.vals.some(v => v.length));
  if (cfg.byOrder === false) return;
  ordChart($(cfg.px + "OW"), sets("Wn"), {ylab: "w ÷ w₀"}); ordChart($(cfg.px + "OL"), sets("Ln"), {ylab: "l ÷ w₀ (log)", log: true}); ordChart($(cfg.px + "OA"), sets("theta"), {ylab: "θ (°)", y0: 0, ref: [{y: 74, c: "#1f77b4", t: "deltas 74°"}, {y: 55, c: "#d62728", t: "fans 55°"}]});
}
function statsWire(c, L, cfg, rer){
  const st = cfg.st, q = id => c.querySelector("#" + id), bind = (id, k) => { const e = q(id); if (e) e.onchange = () => { st[k] = e.value; rer(); }; };
  bind(cfg.px + "M", "m"); bind(cfg.px + "G1", "g1"); bind(cfg.px + "G2", "g2"); bind(cfg.px + "X", "x"); bind(cfg.px + "Y", "y");
  c.querySelectorAll(`[data-${cfg.px}f]`).forEach(b => b.onclick = () => { const k = b.getAttribute(`data-${cfg.px}f`), i = st.feats.indexOf(k); if (i >= 0) st.feats.splice(i, 1); else st.feats.push(k); rer(); });
  if (L.length >= 2) setTimeout(() => statsCharts(L, cfg), 0);
}
const DNCFG = {met: LIBMET, st: XR.dnStat, px: "ds"};
/* library panel */
function dnLibInject(el){ if (!el) return; let c = el.querySelector("#dnLib"); if (!c){ el.insertAdjacentHTML("beforeend", `<div id="dnLib"></div>`); c = el.querySelector("#dnLib"); } dnLibRender(); }
async function dnLibRender(){
  const c = document.getElementById("dnLib"); if (!c) return; const L = (await dnLibLoad()).filter(r => r.kind !== "river"), B = XR.dnBatch, G = groupsOf(L), st = XR.dnStat;
  const gsel = (r) => `<select class="dlg" data-id="${r.id}">${[...new Set(DNLIB_GROUPS.concat(G))].map(g => `<option${(r.group || "unknown") === g ? " selected" : ""}>${esc(g)}</option>`).join("")}<option value="__new">+ new group…</option></select>`;
  c.innerHTML = `<div class="card"><h4>Network library (${L.length})</h4><p class="note">Stored in this browser, so it survives reloads; export a backup (JSON) to move it or share it. Store each mapped network, or map hundreds in one batch.</p>
    <div class="btns">${XR.dn && XR.dn.segs ? `<label class="sm">Group <select id="dlGrp">${DNLIB_GROUPS.map(g => `<option>${g}</option>`).join("")}</select></label><button class="sm pri" id="dlAdd">＋ Store this network</button>` : ""}<button class="sm" id="dlCsv">⬇ Library CSV</button><button class="sm" id="dlJson">⬇ Backup (JSON)</button><label class="sm filebtn">⇪ Restore / merge backup<input type="file" id="dlImp" accept=".json" hidden></label><label class="sm filebtn">⇪ Import digitised networks (GeoJSON, many files)<input type="file" id="dlMany" accept=".json,.geojson" multiple hidden></label><label class="chk"><input type="checkbox" id="dlMap"${st.showMap ? " checked" : ""}> Show library on the map</label></div>
    <details class="x10opt"${B ? " open" : ""}><summary>Batch: map many networks from OpenStreetMap</summary><p class="note">One line per fan or delta: <code>name, lat, lon, radius_km, group</code> (radius defaults to 25 km), optionally followed by <code>apex_lat, apex_lon</code>; or <code>name, south, west, north, east, group</code>. Paste a list or open a CSV. Networks are mapped one after another (about 5–30 s each), stored as they finish, and the batch resumes after a reload.</p>
      <textarea id="dbText" rows="5" placeholder="Okavango, -19.3, 22.9, 80, fluvial fan&#10;Mississippi delta, 29.2, -89.3, 60, delta">${esc(XR.dbText || "")}</textarea><div class="btns"><label class="sm filebtn">⇪ CSV<input type="file" id="dbFile" accept=".csv,.txt" hidden></label><label class="chk"><input type="checkbox" id="dbW"${B && B.widths ? " checked" : ""}> Also measure widths (slower)</label>${B && B.running ? `<button class="sm" id="dbStop">⏸ Pause</button>` : `<button class="sm pri" id="dbGo">▶ ${B && B.jobs.some(j => j.status === "waiting" || j.status === "failed") ? "Resume" : "Start"} batch</button>`}${B ? `<button class="sm" id="dbClr">Clear batch</button>` : ""}</div>
      ${B ? `<div class="scroll x10tab"><table class="grid x8t"><tr><th>Network</th><th>Group</th><th>Status</th></tr>${B.jobs.map(j => `<tr><td>${esc(j.name)}</td><td>${esc(j.group)}</td><td class="${j.status === "failed" ? "warn" : ""}">${j.status}${j.note ? ` <small>${esc(j.note)}</small>` : ""}</td></tr>`).join("")}</table></div>` : ""}</details>
    ${L.length ? `<div class="scroll x10tab"><table class="grid x8t" id="dlTab"><tr><th>Name</th><th>Group</th><th>Channels</th><th>Orders</th><th>θ mean</th><th>l÷w₀</th><th>w÷w₀</th><th>Branching</th><th>Density</th><th>Fan / delta call</th><th></th></tr>${L.map(r => `<tr><td>${esc(r.name)}<small>${esc(r.src || "").slice(0, 40)}</small></td><td>${gsel(r)}</td><td>${r.m.n}</td><td>${r.m.maxOrder}</td><td>${Number.isFinite(r.m.theta) ? nf(r.m.theta, 1) + "°" : "–"}</td><td>${Number.isFinite(r.m.Ln) ? nf(r.m.Ln, 1) : "–"}</td><td>${Number.isFinite(r.m.Wn) ? nf(r.m.Wn, 2) : "–"}</td><td>${nf(r.m.Rb, 2)}</td><td>${nf(r.m.dens, 2)}</td><td><small>${esc(r.m.verdict || "")}</small></td><td><button class="sm" data-dlo="${r.id}" title="Open">⌖</button><button class="sm" data-dld="${r.id}" title="Delete">✕</button></td></tr>`).join("")}</table></div>` : ""}</div>
    ${L.length >= 2 ? statsHTML(L, DNCFG) : ""}`;
  const q = id => c.querySelector("#" + id), rer = () => { dnStatSave(); dnLibRender(); };
  if (q("dlAdd")) q("dlAdd").onclick = async () => { await dnLibSave(dnRecord(XR.dn, {group: q("dlGrp").value})); toast("Stored in the library"); dnLibRender(); };
  q("dlCsv").onclick = () => { const ks = ["n", "maxOrder", "nBif", "nOut", "totalL", "area", "dens", "radius", "w0", "theta", "thetaCI", "thetaMed", "thetaN", "thetaFar", "Ln", "Wn", "Rb", "Rl", "Rw", "cons", "asym", "relief", "slope", "sinMean", "nW", "loops", "verdict"]; save("network_library.csv", [`# Earthform Lens network library, ${DN_METHOD}, ${new Date().toISOString()}`, ["id", "name", "group", "region", "apex_lat", "apex_lon", "source", ...ks].join(","), ...L.map(r => [r.id, r.name, r.group, r.region, r.apex[0], r.apex[1], r.src, ...ks.map(k => r.m[k])].map(csvCell).join(","))].join("\n")); };
  q("dlJson").onclick = () => save("network_library.json", JSON.stringify({format: "earthform-netlib-1", made: new Date().toISOString(), networks: L}));
  q("dlImp").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { const j = JSON.parse(await f.text()); let n = 0; for (const r of (j.networks || [])){ if (r && r.id && r.m){ await dnLibSave(r); n++; } } toast(`Merged ${n} networks`); dnLibRender(); } catch(err){ toast("Backup: " + err.message, 4000); } };
  q("dlMany").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) dnImportMany(fs, "unknown"); };
  q("dlMap").onchange = e => { st.showMap = e.target.checked; dnStatSave(); xmap.req(); };
  c.querySelectorAll(".dlg").forEach(s => s.onchange = async () => { let g = s.value; if (g === "__new"){ g = (prompt("Name of the new group (e.g. megafan, wave-dominated delta)") || "").trim(); if (!g) return dnLibRender(); } const r = DNLIB.find(x => x.id === s.dataset.id); r.group = g; await dnLibSave(r); dnLibRender(); });
  c.querySelectorAll("[data-dld]").forEach(b => b.onclick = async () => { await dnLibDel(b.dataset.dld); dnLibRender(); });
  c.querySelectorAll("[data-dlo]").forEach(b => b.onclick = () => { const r = DNLIB.find(x => x.id === b.dataset.dlo); if (r.lines){ XR.dn = {name: r.name, src: r.src, lines: r.lines, directed: r.directed, osm: /OpenStreetMap/.test(r.src), apex: r.apex, manual: r.manual, made: r.made}; try { dnBuild(); } catch(err){ return toast(err.message); } dnShowPanel(); xmap.fit(XR.dn.segs.flatMap(s => s.pts).filter((_, i) => i % 5 === 0), 30); } else { xmap.fit(r.segs.flatMap(s => s.p), 30); toast("This network was stored without full geometry; showing its extent"); } xmap.req(); });
  const tb = q("dbText"); if (tb) tb.oninput = () => { XR.dbText = tb.value; };
  if (q("dbFile")) q("dbFile").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (f){ XR.dbText = await f.text(); dnLibRender(); } };
  if (q("dbGo")) q("dbGo").onclick = () => { const jobs = dnParseBatch(XR.dbText || ""); if (!XR.dnBatch || jobs.length){ if (!jobs.length) return toast("Paste one line per network: name, lat, lon, radius_km, group", 4500); XR.dnBatch = {jobs, widths: q("dbW").checked}; } else XR.dnBatch.widths = q("dbW").checked; XR.dnBatch.jobs.forEach(j => { if (j.status === "failed") j.status = "waiting"; }); dnRunBatch(); };
  if (q("dbStop")) q("dbStop").onclick = () => { XR.dnBatch.stop = true; toast("Pausing after the current network"); };
  if (q("dbClr")) q("dbClr").onclick = () => { XR.dnBatch = null; try { localStorage.removeItem("efl.dnbatch"); } catch(_){} dnLibRender(); };
  statsWire(c, L, DNCFG, rer);
}
/* library apexes on the live map */
function dnLibOnMap(ctx, M){ if (!DNLIB || !DNLIB.length || !XR.dnStat.showMap || (XR.tab !== "dnet" && XR.river)) return; ctx.save(); for (const r of DNLIB){ if (r.kind === "river") continue; const q = M.toScr(r.apex[0], r.apex[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fillStyle = grpCol(r.group || "unknown"); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); if (M.z > 6){ ctx.font = "600 10px Inter, sans-serif"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.strokeText(r.name, q[0] + 7, q[1] + 4); ctx.fillStyle = "#fff"; ctx.fillText(r.name, q[0] + 7, q[1] + 4); } } ctx.restore(); }
{ const _dme2 = drawMapExtras; drawMapExtras = function(ctx, M, w, h){ _dme2(ctx, M, w, h); try { dnLibOnMap(ctx, M); } catch(_){} }; }
/* resume an interrupted batch */
try { const sb = JSON.parse(localStorage.getItem("efl.dnbatch") || "null"); if (sb && sb.jobs && sb.jobs.some(j => j.status === "waiting")){ XR.dnBatch = {jobs: sb.jobs, widths: sb.widths}; if (sb.running && !/[?&]efl-batch=1/.test(location.search)) setTimeout(() => { toast("Resuming the network batch", 3500); dnRunBatch(); }, 4000); } } catch(_){}
dnLibLoad();
/* ⚙ in the map's layers panel */
{ const _rl = renderLayP; renderLayP = function(){ _rl(); const p = $("x7LayBody"); if (p && !p.querySelector("#x11Furn")){ p.insertAdjacentHTML("beforeend", `<div class="btns"><button class="sm" id="x11Furn">⚙ Legend, scale & north: size and style</button></div>`); $("x11Furn").onclick = () => furnDialog(); } }; }
