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
  const L = XR.legend; if (!L || L.key === "plain") return; const met = L.met, plainBg = EX.base[XR.base].plain;
  const ctl = document.querySelector(".xmapctl"), ch = ctl ? ctl.offsetHeight : 40, bw = Math.min(200, w*.5), x = 10, y = h - ch - 26 - 60, pad = 8;
  ctx.save(); ctx.font = "600 11px Inter, sans-serif";
  const bg = plainBg ? "rgba(255,255,255,.92)" : "rgba(10,14,19,.78)", fg = plainBg ? "#111" : "#fff", mu = plainBg ? "#555" : "rgba(255,255,255,.7)";
  if (L.key === "zone"){ const rows = ZONE_CAT, hh = 18 + rows.length*15 + pad; ctx.fillStyle = bg; roundRect(ctx, x, y - hh + 50, bw, hh, 8); ctx.fill(); let yy = y - hh + 50 + 16; ctx.fillStyle = fg; ctx.fillText("Sediment routing (interpretation)", x + pad, yy); yy += 6;
    for (const [, t, c] of rows){ yy += 15; ctx.fillStyle = c; ctx.fillRect(x + pad, yy - 8, 18, 6); ctx.fillStyle = fg; ctx.font = "500 11px Inter, sans-serif"; ctx.fillText(t, x + pad + 26, yy - 2); } ctx.restore(); return; }
  if (!L.n){ ctx.fillStyle = bg; roundRect(ctx, x, y + 8, bw, 36, 8); ctx.fill(); ctx.fillStyle = mu; ctx.font = "500 11px Inter, sans-serif"; ctx.fillText(`${met.n}: not measured yet`, x + pad, y + 30); ctx.restore(); return; }
  ctx.fillStyle = bg; roundRect(ctx, x, y, bw, 52, 8); ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(`${met.n}${met.u ? " (" + met.u + ")" : ""}${met.log ? " · log scale" : ""}`, x + pad, y + 16);
  const gx = x + pad, gy = y + 23, gw = bw - 2*pad; for (let i = 0; i < gw; i++){ const u = i/(gw - 1); ctx.fillStyle = xcol(L.inv ? 1 - u : u); ctx.fillRect(gx + i, gy, 1.2, 9); }
  const val = u => { const t = L.lo + (L.hi - L.lo)*u; return met.log ? 10**t : t; };
  ctx.fillStyle = mu; ctx.font = "500 10px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(tfmt(val(0)), gx, gy + 21); ctx.textAlign = "center"; ctx.fillText(tfmt(val(.5)), gx + gw/2, gy + 21); ctx.textAlign = "right"; ctx.fillText(tfmt(val(1)), gx + gw, gy + 21);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------- clean view: the river alone, to scale, on white ---------- */
const CV = {metric: "elevation", show: {tribs: true, side: true, dams: true, knick: true, reaches: true, values: false, transects: false, km: true, labels: true, zones: false, sel: true}, vb: null, geo: null, hover: null};
const CVPAL = VIRIDIS;
const cvCol = u => vir(u);
function cvMetricOpts(){ return Object.entries(XMETRIC).filter(([k]) => k !== "plain").map(([k, m]) => `<option value="${k}"${k === CV.metric ? " selected" : ""}>${m.n}</option>`).join(""); }
function openCleanView(){
  const R = XR.river; if (!R) return toast("Load a river first");
  if (XR.metric && XR.metric !== "plain") CV.metric = XR.metric;
  let el = document.getElementById("cvWrap"); if (!el){ el = document.createElement("div"); el.id = "cvWrap"; document.body.appendChild(el); }
  const T = [["tribs", "Tributaries"], ["side", "Side channels"], ["dams", "Dams & weirs"], ["knick", "Knickpoints"], ["reaches", "Reach boundaries"], ["values", "Values on reaches"], ["transects", "Width transects"], ["km", "Distance marks"], ["labels", "Names"], ["zones", "Sediment zones"], ["sel", "Selected stretch"]];
  el.innerHTML = `<div class="cvbox"><div class="cvhead"><div class="cvt"><b>${esc(R.name)}</b><small>${esc(R.region || "")} · clean view, to scale</small></div>
      <label>Colour by <select id="cvMet">${cvMetricOpts()}</select></label>
      <div class="cvbtn"><button class="sm" id="cvFit">⤢ Fit</button><button class="sm" id="cvSel">Fit selection</button><button class="sm" id="cvSvg">⬇ SVG</button><button class="sm" id="cvPng">⬇ PNG</button><button class="sm pri" id="cvX">✕ Close</button></div></div>
    <div class="cvtog">${T.map(([k, t]) => `<button class="chip${CV.show[k] ? " on" : ""}" data-cv="${k}">${t}</button>`).join("")}</div>
    <div class="cvmain"><svg id="cvPlan" xmlns="http://www.w3.org/2000/svg"></svg><svg id="cvOver" xmlns="http://www.w3.org/2000/svg"></svg><div id="cvTip" class="cvtip"></div></div>
    <div class="cvstrips"><svg id="cvProf"></svg></div>
    <p class="cvnote" id="cvNote"></p></div>`;
  el.classList.add("on"); document.body.style.overflow = "hidden";
  CV.geo = cvGeometry(R); CV.vb = null; cvFit();
  $("cvX").onclick = closeCleanView; $("cvFit").onclick = () => { CV.vb = null; cvFit(); }; $("cvSel").onclick = () => { const s = selRange(); cvFit(s.k0, s.k1); };
  $("cvMet").onchange = e => { CV.metric = e.target.value; cvDraw(); };
  el.querySelectorAll("[data-cv]").forEach(b => b.onclick = () => { CV.show[b.dataset.cv] = !CV.show[b.dataset.cv]; b.classList.toggle("on", CV.show[b.dataset.cv]); cvDraw(); });
  $("cvSvg").onclick = () => save(R.name.replace(/[^\w]+/g, "_") + "_clean_view.svg", cvExportSVG());
  $("cvPng").onclick = () => svgToPng(cvExportSVG(), 3).then(b => save(R.name.replace(/[^\w]+/g, "_") + "_clean_view.png", b)).catch(e => toast(e.message));
  cvWire(); window.addEventListener("resize", cvDraw); document.addEventListener("keydown", cvKey);
}
function cvKey(e){ if (e.key === "Escape") closeCleanView(); }
function closeCleanView(){ const el = document.getElementById("cvWrap"); if (el){ el.classList.remove("on"); el.innerHTML = ""; } document.body.style.overflow = ""; window.removeEventListener("resize", cvDraw); document.removeEventListener("keydown", cvKey); }
/** all geometry in a local metric frame (km east, km south) centred on the river */
function cvGeometry(R){
  const st = Math.max(.02, R.L/4000), pts = resampleKm(R, 0, R.L, st), lat0 = pts.reduce((a, p) => a + p[0], 0)/pts.length, lon0 = pts.reduce((a, p) => a + p[1], 0)/pts.length, loc = a => toLocal(a, lat0, lon0);
  return {st, lat0, lon0, main: loc(pts), km: pts.map((_, i) => Math.min(R.L, i*st)), side: R.side.map(s => loc(s)), tribs: R.tribs.map(t => ({t, stub: t.stub ? loc(t.stub) : null, p: loc([[t.lat, t.lon]])[0]})), dams: R.dams.map(d => ({d, p: loc([[d.lat, d.lon]])[0]})), loc};
}
function cvSize(){ const s = $("cvPlan"); const r = s.getBoundingClientRect(); return [Math.max(200, r.width), Math.max(200, r.height)]; }
function cvFit(k0, k1){ const G = CV.geo, R = XR.river; let pts = G.main; if (k0 != null){ pts = G.main.filter((_, i) => G.km[i] >= k0 && G.km[i] <= k1); if (pts.length < 2) pts = G.main; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const [W, H] = cvSize(), m = .08, sx = (x1 - x0)*(1 + 2*m) || 1, sy = (y1 - y0)*(1 + 2*m) || 1, s = Math.max(sx/W, sy/H); CV.vb = {cx: (x0 + x1)/2, cy: (y0 + y1)/2, s}; cvDraw(); }
function cvValues(){ const R = XR.river, met = XMETRIC[CV.metric], G = CV.geo, v = G.km.map(k => { if (CV.metric === "zone"){ const r = reachAt(R, k); return r && r.zone ? r.zone : null; } const i = idxAtKm(R, k), x = met.get(R, i); return Number.isFinite(x) && (!met.log || x > 0) ? (met.log ? Math.log10(x) : x) : NaN; });
  const f = v.filter(Number.isFinite); return {v, lo: f.length ? quantile(f, .02) : 0, hi: f.length ? quantile(f, .98) : 1, n: f.length, met}; }
/** draw everything in screen coordinates (crisp at any zoom); vb = centre + km per pixel */
function cvDraw(){
  const plan = $("cvPlan"); if (!plan || !CV.vb) return; const R = XR.river, G = CV.geo, [W, H] = cvSize(), vb = CV.vb, X = p => (p[0] - vb.cx)/vb.s + W/2, Y = p => (p[1] - vb.cy)/vb.s + H/2, S = CV.show;
  plan.setAttribute("viewBox", `0 0 ${W} ${H}`); plan.setAttribute("width", W); plan.setAttribute("height", H);
  const V = cvValues(); CV.vals = V; const colOf = i => { const x = V.v[i]; if (CV.metric === "zone") return x ? ZONE_CAT.find(z => z[0] === x)[2] : "#9aa3ad"; return Number.isFinite(x) ? cvCol((x - V.lo)/((V.hi - V.lo) || 1)) : "#b8c0c8"; };
  const pl = arr => arr.map(p => X(p).toFixed(1) + "," + Y(p).toFixed(1)).join(" ");
  let s = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  // graticule-free white page with a faint frame
  if (S.zones) for (const r of R.reaches || []){ if (!r.zone) continue; const i0 = Math.max(0, Math.round(r.k0/G.st)), i1 = Math.min(G.main.length - 1, Math.round(r.k1/G.st)); s += `<polyline points="${pl(G.main.slice(i0, i1 + 1))}" fill="none" stroke="${ZONE_CAT.find(z => z[0] === r.zone)[2]}" stroke-opacity=".28" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`; }
  if (S.sel && XR.range && XR.range.R === R){ const i0 = Math.round(XR.range.k0/G.st), i1 = Math.min(G.main.length - 1, Math.round(XR.range.k1/G.st)); s += `<polyline points="${pl(G.main.slice(i0, i1 + 1))}" fill="none" stroke="#ffcf33" stroke-opacity=".55" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`; }
  if (S.side) for (const sd of G.side) s += `<polyline points="${pl(sd)}" fill="none" stroke="#6fa8dc" stroke-width="1.3"/>`;
  if (S.tribs) for (const t of G.tribs) if (t.stub) s += `<polyline points="${pl(t.stub)}" fill="none" stroke="#7aa6c9" stroke-width="1.4"/>`;
  if (S.transects) for (const r of R.reaches || []) for (const t of (r.width && r.width.tr) || []){ if (t.off) continue; const [a, b] = G.loc([t.a, t.b]); s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="#d62728" stroke-width=".8"/>`; }
  // main channel: casing + coloured runs (grouped by colour for a light SVG)
  s += `<polyline points="${pl(G.main)}" fill="none" stroke="#1d232a" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>`;
  let run = [G.main[0]], rc = colOf(0); for (let i = 1; i < G.main.length; i++){ const c = colOf(i); run.push(G.main[i]); if (c !== rc || i === G.main.length - 1){ s += `<polyline points="${pl(run)}" fill="none" stroke="${rc}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`; run = [G.main[i]]; rc = c; } }
  if (S.reaches) for (const r of R.reaches || []){ const i = Math.min(G.main.length - 1, Math.round(r.k0/G.st)), j = Math.min(G.main.length - 1, i + 1), p = G.main[i], q = G.main[j], dx = X(q) - X(p), dy = Y(q) - Y(p), l = Math.hypot(dx, dy) || 1, nx = -dy/l*8, ny = dx/l*8; s += `<line x1="${X(p) - nx}" y1="${Y(p) - ny}" x2="${X(p) + nx}" y2="${Y(p) + ny}" stroke="#111" stroke-width="1.4"/>`; }
  let lastL = null; if (S.values) for (const r of R.reaches || []){ const i = Math.min(G.main.length - 1, Math.round((r.k0 + r.k1)/2/G.st)), p = G.main[i], v = CV.metric === "zone" ? r.zone : XMETRIC[CV.metric].get(R, idxAtKm(R, (r.k0 + r.k1)/2)); if (v == null || (typeof v === "number" && !Number.isFinite(v))) continue;
    const t = typeof v === "number" ? tfmt(v) : v; if (lastL && Math.hypot(X(p) - lastL[0], Y(p) - lastL[1]) < t.length*6.4 + 18) continue; lastL = [X(p), Y(p)]; s += `<g transform="translate(${X(p) + 9},${Y(p) - 9})"><rect x="-2" y="-11" width="${t.length*6.4 + 6}" height="15" rx="3" fill="#fff" stroke="#bbb" stroke-width=".6"/><text x="1" y="0" font-size="10.5" fill="#111">${esc(t)}</text></g>`; }
  if (S.km){ const nice = (() => { const t = R.L/8, p = 10**Math.floor(Math.log10(t)); return [1, 2, 5, 10].map(k => k*p).find(v => v >= t) || p; })(); for (let k = nice; k < R.L; k += nice){ const i = Math.min(G.main.length - 1, Math.round(k/G.st)), p = G.main[i]; s += `<circle cx="${X(p)}" cy="${Y(p)}" r="2.4" fill="#fff" stroke="#111"/><text x="${X(p) + 5}" y="${Y(p) + 13}" font-size="9.5" fill="#444">${tfmt(k)} km</text>`; } }
  if (S.tribs) for (const t of G.tribs){ s += `<circle cx="${X(t.p)}" cy="${Y(t.p)}" r="3.3" fill="${t.t.side === "left" ? "#2b8cbe" : "#41ab5d"}" stroke="#fff" stroke-width="1"/>`; if (S.labels && (t.t.area || vb.s < R.L/600)) s += `<text x="${X(t.p) + 6}" y="${Y(t.p) - 5}" font-size="10" fill="#2c3e50">${esc(t.t.name)}</text>`; }
  if (S.dams) for (const d of G.dams) s += `<rect x="${X(d.p) - 4.5}" y="${Y(d.p) - 4.5}" width="9" height="9" fill="#111" transform="rotate(45 ${X(d.p)} ${Y(d.p)})"/>`;
  if (S.knick && R.prof) for (const k of R.prof.knick){ const i = Math.min(G.main.length - 1, Math.round(k.km/G.st)), p = G.main[i]; s += `<path d="M${X(p)} ${Y(p) - 9}l6 10h-12z" fill="#ff7f0e" stroke="#fff" stroke-width=".8"/>`; }
  if (S.labels){ const a = G.main[0], b = G.main[G.main.length - 1]; s += `<circle cx="${X(a)}" cy="${Y(a)}" r="5" fill="#2ca02c" stroke="#fff" stroke-width="1.5"/><text x="${X(a) + 8}" y="${Y(a) - 6}" font-size="11" font-weight="600" fill="#1b5e20">Source</text><circle cx="${X(b)}" cy="${Y(b)}" r="5" fill="#d62728" stroke="#fff" stroke-width="1.5"/><text x="${X(b) + 8}" y="${Y(b) + 15}" font-size="11" font-weight="600" fill="#8b1a1a">Mouth</text>`; }
  // position marker (synced with the main map)
  { const i = Math.min(G.main.length - 1, Math.round(XR.pos/G.st)), p = G.main[i]; s += `<circle cx="${X(p)}" cy="${Y(p)}" r="7" fill="none" stroke="#111" stroke-width="2"/>`; }
  plan.innerHTML = s; cvOverlay(W, H); cvProfile(); cvNote();
}
/** scale bar, north arrow, legend: fixed on screen, always to scale */
function cvOverlay(W, H){
  const o = $("cvOver"), vb = CV.vb, V = CV.vals; o.setAttribute("viewBox", `0 0 ${W} ${H}`); o.setAttribute("width", W); o.setAttribute("height", H);
  const t = W*.2*vb.s, p = 10**Math.floor(Math.log10(t)), len = [1, 2, 5, 10].map(k => k*p).filter(v => v <= t).pop() || p, px = len/vb.s, x = 16, y = H - 18;
  let s = `<g font-family="Inter, sans-serif"><rect x="${x - 8}" y="${y - 26}" width="${px + 26}" height="36" rx="6" fill="#fff" fill-opacity=".9"/><rect x="${x}" y="${y - 5}" width="${px}" height="5" fill="#111"/><rect x="${x + px/2}" y="${y - 5}" width="${px/2}" height="5" fill="#fff" stroke="#111" stroke-width=".8"/><text x="${x}" y="${y - 10}" font-size="11" fill="#111">0</text><text x="${x + px}" y="${y - 10}" font-size="11" fill="#111" text-anchor="middle">${len >= 1 ? tfmt(len) + " km" : tfmt(len*1000) + " m"}</text>`;
  s += `<g transform="translate(${W - 26},34)"><circle r="17" fill="#fff" fill-opacity=".9"/><path d="M0 -13l7 18-7-5-7 5z" fill="#111"/><text y="-17" font-size="10" text-anchor="middle" fill="#111" dy="-1">N</text></g>`;
  // legend
  const met = XMETRIC[CV.metric], lx = W - 218, ly = H - 66;
  if (CV.metric === "zone"){ s += `<rect x="${lx - 8}" y="${H - 96}" width="210" height="88" rx="6" fill="#fff" fill-opacity=".92" stroke="#ddd"/><text x="${lx}" y="${H - 79}" font-size="11" font-weight="600">Sediment routing (interpretation)</text>` + ZONE_CAT.map(([, n, c], i) => `<rect x="${lx}" y="${H - 70 + i*15}" width="18" height="7" fill="${c}"/><text x="${lx + 26}" y="${H - 63 + i*15}" font-size="10.5">${n}</text>`).join(""); }
  else if (V.n){ s += `<rect x="${lx - 8}" y="${ly - 20}" width="210" height="58" rx="6" fill="#fff" fill-opacity=".92" stroke="#ddd"/><text x="${lx}" y="${ly - 5}" font-size="11" font-weight="600">${esc(met.n)}${met.u ? " (" + esc(met.u) + ")" : ""}${met.log ? " · log" : ""}</text>`;
    for (let i = 0; i < 48; i++) s += `<rect x="${lx + i*4}" y="${ly + 2}" width="4.3" height="10" fill="${cvCol(i/47)}"/>`;
    const val = u => { const t2 = V.lo + (V.hi - V.lo)*u; return met.log ? 10**t2 : t2; }; s += `<text x="${lx}" y="${ly + 26}" font-size="10">${tfmt(val(0))}</text><text x="${lx + 96}" y="${ly + 26}" font-size="10" text-anchor="middle">${tfmt(val(.5))}</text><text x="${lx + 192}" y="${ly + 26}" font-size="10" text-anchor="end">${tfmt(val(1))}</text>`; }
  else s += `<rect x="${lx - 8}" y="${ly - 6}" width="210" height="26" rx="6" fill="#fff" stroke="#ddd"/><text x="${lx}" y="${ly + 11}" font-size="11" fill="#666">${esc(met.n)}: not measured yet</text>`;
  // symbol key
  const keys = [CV.show.tribs && ["circle", "#2b8cbe", "Tributary junction"], CV.show.dams && ["dia", "#111", "Dam / weir"], CV.show.knick && ["tri", "#ff7f0e", "Knickpoint"], CV.show.transects && ["line", "#d62728", "Width transect"], CV.show.reaches && ["tick", "#111", "Reach boundary"]].filter(Boolean);
  if (keys.length){ const kx = 12, ky = 14; s += `<rect x="${kx - 4}" y="${ky - 4}" width="140" height="${keys.length*16 + 8}" rx="6" fill="#fff" fill-opacity=".9" stroke="#ddd"/>` + keys.map(([sh, c, t], i) => { const yy = ky + 8 + i*16; const sym = sh === "circle" ? `<circle cx="${kx + 7}" cy="${yy}" r="3.5" fill="${c}"/>` : sh === "dia" ? `<rect x="${kx + 3}" y="${yy - 4}" width="8" height="8" fill="${c}" transform="rotate(45 ${kx + 7} ${yy})"/>` : sh === "tri" ? `<path d="M${kx + 7} ${yy - 5}l5 9h-10z" fill="${c}"/>` : sh === "line" ? `<line x1="${kx + 1}" x2="${kx + 13}" y1="${yy}" y2="${yy}" stroke="${c}" stroke-width="1.6"/>` : `<line x1="${kx + 7}" x2="${kx + 7}" y1="${yy - 6}" y2="${yy + 6}" stroke="${c}" stroke-width="1.6"/>`; return sym + `<text x="${kx + 20}" y="${yy + 3.5}" font-size="10.5">${t}</text>`; }).join(""); }
  o.innerHTML = s + `</g>`;
}
/** long profile beneath the plan, coloured with the same scale */
function cvProfile(){
  const el = $("cvProf"), R = XR.river, pr = R.prof; if (!el) return; const W = Math.max(300, el.getBoundingClientRect().width || 600), H = 170, m = {l: 54, r: 14, t: 12, b: 30};
  el.setAttribute("viewBox", `0 0 ${W} ${H}`); el.setAttribute("width", W); el.setAttribute("height", H);
  if (!pr){ el.innerHTML = `<text x="20" y="40" font-size="12" fill="#888">Elevation profile not loaded</text>`; return; }
  const pw = W - m.l - m.r, ph = H - m.t - m.b, z0 = Math.min(...pr.zc.filter(Number.isFinite)), z1 = Math.max(...pr.zr.filter(Number.isFinite)), X = d => m.l + d/R.L*pw, Y = z => m.t + ph - (z - z0)/((z1 - z0) || 1)*ph, G = CV.geo;
  let s = `<rect width="${W}" height="${H}" fill="#fff"/>`;
  for (const t of niceTicks(z0, z1, 3)) s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/><text x="${m.l - 6}" y="${Y(t) + 3.5}" font-size="10" text-anchor="end" fill="#444">${tfmt(t)}</text>`;
  for (const t of niceTicks(0, R.L, 6)) s += `<text x="${X(t)}" y="${H - 14}" font-size="10" text-anchor="middle" fill="#444">${tfmt(t)}</text>`;
  let d = ""; pr.d.forEach((x, i) => { if (Number.isFinite(pr.zr[i])) d += (d ? "L" : "M") + X(x).toFixed(1) + " " + Y(pr.zr[i]).toFixed(1); }); s += `<path d="${d}" fill="none" stroke="#9aa5b1" stroke-width=".9"/>`;
  const step = Math.max(1, Math.floor(pr.d.length/1200)); for (let i = step; i < pr.d.length; i += step){ const k = pr.d[i], gi = Math.min(G.main.length - 1, Math.round(k/G.st)), x = CV.vals.v[gi], c = CV.metric === "zone" ? (x ? ZONE_CAT.find(z => z[0] === x)[2] : "#9aa3ad") : Number.isFinite(x) ? cvCol((x - CV.vals.lo)/((CV.vals.hi - CV.vals.lo) || 1)) : "#b8c0c8"; s += `<line x1="${X(pr.d[i - step])}" y1="${Y(pr.zc[i - step])}" x2="${X(k)}" y2="${Y(pr.zc[i])}" stroke="${c}" stroke-width="3"/>`; }
  if (CV.show.knick) for (const k of pr.knick) s += `<path d="M${X(k.km)} ${Y(k.z) - 9}l5 8h-10z" fill="#ff7f0e"/>`;
  if (CV.show.dams) for (const dm of R.dams){ const z = pr.zc[Math.min(pr.zc.length - 1, Math.round(dm.km/pr.step))]; s += `<rect x="${X(dm.km) - 4}" y="${Y(z) - 4}" width="8" height="8" fill="#111" transform="rotate(45 ${X(dm.km)} ${Y(z)})"/>`; }
  if (CV.show.tribs) for (const t of R.tribs.filter(t => !t.distributary)){ const z = pr.zc[Math.min(pr.zc.length - 1, Math.round(t.km/pr.step))]; s += `<circle cx="${X(t.km)}" cy="${Y(z)}" r="2.6" fill="${t.side === "left" ? "#2b8cbe" : "#41ab5d"}"/>`; }
  s += `<line x1="${X(XR.pos)}" x2="${X(XR.pos)}" y1="${m.t}" y2="${m.t + ph}" stroke="#111" stroke-dasharray="3 3"/><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="#666" stroke-width=".8"/>`;
  s += `<text x="${m.l + pw/2}" y="${H - 2}" font-size="10.5" text-anchor="middle" fill="#222">Distance from source (km) · grey: raw samples, colour: conditioned profile by ${esc(XMETRIC[CV.metric].n.toLowerCase())}</text><text transform="translate(12 ${m.t + ph/2}) rotate(-90)" font-size="10.5" text-anchor="middle" fill="#222">Elevation (m)</text>`;
  el.innerHTML = s;
  el.onclick = e => { const r = el.getBoundingClientRect(), k = clamp((e.clientX - r.left - m.l)/pw, 0, 1)*R.L; setPos(k); cvDraw(); };
}
function cvNote(){ const R = XR.river, n = $("cvNote"), pr = R.prof, sr = selRange(); if (!n) return;
  n.textContent = `${km(R.L)} traced · whole-river sinuosity ${nf(R.L/Math.max(1e-6, hav(R.main[0], R.main[R.main.length - 1])), 2)}${pr ? ` · fall ${nf(pr.drop)} m · mean gradient ${nf(pr.grad, 3)} m/km` : ""}${sr.whole ? "" : ` · selected km ${nf(sr.k0)}–${nf(sr.k1)}`} · centreline © OpenStreetMap contributors${pr && !pr.user ? `; elevation AWS Terrain Tiles z${pr.z}` : ""}. Local equirectangular projection centred on ${CV.geo.lat0.toFixed(2)}°, ${CV.geo.lon0.toFixed(2)}°. Drag to pan, wheel or pinch to zoom, tap the river or profile to move the position.`; }
function cvWire(){
  const plan = $("cvPlan"), box = plan.parentElement; let drag = null, pinch = null; const pts = new Map();
  const toKm = (cx, cy) => { const r = plan.getBoundingClientRect(), [W, H] = cvSize(); return [(cx - r.left - W/2)*CV.vb.s + CV.vb.cx, (cy - r.top - H/2)*CV.vb.s + CV.vb.cy]; };
  const zoomAt = (cx, cy, f) => { const a = toKm(cx, cy); CV.vb.s *= f; const b = toKm(cx, cy); CV.vb.cx += a[0] - b[0]; CV.vb.cy += a[1] - b[1]; cvDraw(); };
  box.onwheel = e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY*.0015)); };
  box.onpointerdown = e => { pts.set(e.pointerId, [e.clientX, e.clientY]); box.setPointerCapture(e.pointerId); if (pts.size === 1) drag = {x: e.clientX, y: e.clientY, cx: CV.vb.cx, cy: CV.vb.cy, moved: false}; if (pts.size === 2){ const [p, q] = [...pts.values()]; pinch = {d: Math.hypot(p[0] - q[0], p[1] - q[1]), s: CV.vb.s}; drag = null; } };
  box.onpointermove = e => { if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2){ const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); const c = [(p[0] + q[0])/2, (p[1] + q[1])/2], a = toKm(...c); CV.vb.s = pinch.s*pinch.d/Math.max(10, d); const b = toKm(...c); CV.vb.cx += a[0] - b[0]; CV.vb.cy += a[1] - b[1]; cvDraw(); return; }
    if (drag){ const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved){ CV.vb.cx = drag.cx - dx*CV.vb.s; CV.vb.cy = drag.cy - dy*CV.vb.s; cvDraw(); } return; }
    cvHover(e); };
  box.onpointerup = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (drag && !drag.moved){ const h = cvNearest(e.clientX, e.clientY); if (h){ setPos(h.k); cvDraw(); } } drag = null; };
  box.onpointerleave = () => { const t = $("cvTip"); if (t) t.style.display = "none"; };
}
function cvNearest(cx, cy){ const r = $("cvPlan").getBoundingClientRect(), [W, H] = cvSize(), G = CV.geo, vb = CV.vb; let best = -1, bd = 14; for (let i = 0; i < G.main.length; i += 1){ const p = G.main[i], x = (p[0] - vb.cx)/vb.s + W/2 + r.left, y = (p[1] - vb.cy)/vb.s + H/2 + r.top, d = Math.hypot(x - cx, y - cy); if (d < bd){ bd = d; best = i; } } return best < 0 ? null : {i: best, k: G.km[best]}; }
function cvHover(e){ const t = $("cvTip"), h = cvNearest(e.clientX, e.clientY); if (!t) return; if (!h){ t.style.display = "none"; return; }
  const R = XR.river, k = h.k, i = idxAtKm(R, k), r = reachAt(R, k), pr = R.prof, box = $("cvPlan").getBoundingClientRect();
  const rows = [["km from source", nf(k, 1)], pr && ["Elevation", nf(XMETRIC.elevation.get(R, i)) + " m"], pr && ["Slope", nf(XMETRIC.slope.get(R, i), 3) + " m/km"], r && ["Reach sinuosity", nf(r.sin, 2)], r && r.width && Number.isFinite(r.width.med) && ["Width", nf(r.width.med) + " m"], r && Number.isFinite(r.lambda) && ["Wavelength", km(r.lambda)], r && r.zone && ["Zone (interp.)", r.zone]].filter(Boolean);
  t.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join(""); t.style.display = "block"; t.style.left = Math.min(box.width - 170, e.clientX - box.left + 14) + "px"; t.style.top = Math.max(0, e.clientY - box.top - 10) + "px"; }
/** one standalone SVG: plan + overlay + profile + caption */
function cvExportSVG(){
  const plan = $("cvPlan"), over = $("cvOver"), prof = $("cvProf"), [W, H] = cvSize(), ph = 170, R = XR.river, cap = $("cvNote").textContent.replace(/ Drag to pan.*$/, "");
  const inner = el => el.innerHTML;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + ph + 60}" width="${W}" height="${H + ph + 60}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><g>${inner(plan)}</g><g>${inner(over)}</g><g transform="translate(0 ${H})">${inner(prof)}</g>${figCaption(`${R.name}${R.region ? " (" + R.region + ")" : ""}. Coloured by ${XMETRIC[CV.metric].n.toLowerCase()}. ${cap}`, 14, H + ph + 18, W - 28)}</svg>`;
}
{ const b = $("xClean"); if (b) b.onclick = openCleanView; const b2 = $("xClean2"); if (b2) b2.onclick = openCleanView; }
