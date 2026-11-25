
/* ===================== Earthform Lens — like-for-like comparison of several rivers ===================== */
const CMPMAX = 8;
CMPC.push("#ffd84a", "#ff6fb5", "#8fb8ff", "#b5e07a");
/* each river keeps its own reach length once harmonised, so loading another river does not change it */
{ const _br = buildReaches; buildReaches = function(R){ if (R && R.reachKm > 0){ const keep = XR.reachKm; XR.reachKm = R.reachKm; try { return _br(R); } finally { XR.reachKm = keep; } } return _br(R); }; }
XR.cmpRef = 0; XR.harmOpt = Object.assign({scale: "abs", width: true, reaches: 20}, (() => { try { return JSON.parse(localStorage.getItem("efl.harm")) || {}; } catch(_){ return {}; } })());

/* ---------- add several rivers by name ---------- */
async function cmpAddNames(text){
  const names = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, CMPMAX); if (!names.length) return;
  const ok = [], fail = []; let i = 0;
  for (const nm of names){ i++; actSet("cmpadd", `Comparison: loading ${nm} (${i} of ${names.length})…`, (i - 1)/names.length);
    try { const res = await searchRivers(nm, null, {}); const hit = res.find(r => r.water && r.osm_type === "relation") || res.find(r => r.water) || res[0]; if (!hit) throw new Error("not found");
      await loadRiver(hit); const R = XR.river; if (!R || !R.prof) throw new Error("could not be loaded");
      if (!XR.cmp.some(c => c.R === R)){ if (XR.cmp.length >= CMPMAX) XR.cmp.shift(); XR.cmp.push({R, k0: 0, k1: R.L, label: R.name}); } ok.push(R.name); }
    catch(e){ console.warn(e); fail.push(`${nm} (${e.message})`); } }
  actEnd("cmpadd"); showXTab("compare"); renderX();
  xstatus(`Comparison: ${ok.length ? "added " + ok.map(esc).join(", ") : "nothing added"}${fail.length ? `. Not found: ${fail.map(esc).join("; ")}` : ""}.${ok.length > 1 ? " Press <b>Make comparable</b> so every river is measured the same way." : ""}`, fail.length && !ok.length ? "err" : "ok");
}

/* ---------- harmonise: one source, one resolution, one sampling, one reach definition ---------- */
const defZoom = L => L > 1500 ? 9 : L > 400 ? 10 : L > 80 ? 11 : 12;
function harmPlan(opt){
  const Rs = [...new Set(XR.cmp.map(c => c.R))], Ls = Rs.map(R => R.L), z = Math.min(...Ls.map(defZoom)), Lmin = Math.min(...Ls), Lmax = Math.max(...Ls);
  const nice = v => { const p = 10**Math.floor(Math.log10(v)), m = v/p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1)*p; };
  const plan = new Map();
  for (const R of Rs){
    if (opt.scale === "abs"){ const step = Math.max(.1, Lmax/2500), reach = nice(clamp(Lmin/Math.max(4, opt.reaches/2), .5, 100)), slopeKm = Math.max(4*step, Math.max(2, Lmin/150)); plan.set(R, {step, reach, z, slopeKm, smoothKm: 7*step}); }
    else { const step = Math.max(.05, R.L/2500); plan.set(R, {step, reach: R.L/opt.reaches, z, slopeKm: Math.max(2*step, R.L/150), smoothKm: 7*step}); }
  }
  const warn = []; for (const [R, p] of plan){ const n = R.L/p.step; if (n < 300) warn.push(`${R.name}: only ${Math.round(n)} profile samples at ${nf(p.step*1000)} m spacing`); if (R.L/p.reach < 4) warn.push(`${R.name}: fewer than 4 reaches`); }
  return {Rs, plan, z, warn};
}
async function cmpHarmonise(opt){
  const {Rs, plan, z} = harmPlan(opt), keepPP = XR.pp, dem = XR.src.dem; let i = 0;
  XR.harmBusy = true;
  try {
    for (const R of Rs){ i++; const p = plan.get(R); actSet("harm", `Making comparable: ${R.name} (${i} of ${Rs.length}) — elevation`, (i - 1)/Rs.length);
      XR.pp = {...(keepPP || {}), step: p.step, slopeKm: p.slopeKm, smoothKm: p.smoothKm}; await loadProfile(R, z); R.reachKm = p.reach; for (const r of R.reaches || []) r.width = null; buildReaches(R); if (R.basin) try { alongRiverArea(R); } catch(_){}
      R.harm = {when: new Date().toISOString(), mode: opt.scale, z, stepKm: p.step, reachKm: p.reach, dem, widthSrc: XR.src.water, version: METHOD_VERSION}; }
    XR.pp = keepPP;
    if (opt.width){ i = 0; for (const R of Rs){ i++; actSet("harm", `Making comparable: ${R.name} (${i} of ${Rs.length}) — channel width`, i/Rs.length); await autoWidth(R, XR.loadTok, true, true); } }
    for (const c of XR.cmp) c.k1 = Math.min(c.k1, c.R.L);
    xstatus(`All ${Rs.length} rivers now use ${esc(DEMSRC[dem] ? DEMSRC[dem].n : dem)} at zoom ${z}, ${opt.scale === "abs" ? `the same ${nf(plan.get(Rs[0]).step*1000)} m sampling and ${km(plan.get(Rs[0]).reach)} reaches` : `sampling and reaches scaled to each river's length (1/${opt.reaches} of its length per reach)`}${opt.width ? ", and freshly measured widths" : ""}.`, "ok");
  } catch(e){ console.error(e); xstatus("Make comparable: " + esc(e.message), "err"); }
  finally { XR.pp = keepPP; XR.harmBusy = false; actEnd("harm"); renderX(); }
}
function harmDialog(){
  const o = XR.harmOpt, P = harmPlan(o);
  modal(`<h3>Make the rivers comparable</h3><p class="note">Different rivers are loaded with settings that suit each one (finer terrain and shorter reaches for small rivers). To compare like with like, every river is re-measured with the same elevation source and resolution and one sampling and reach definition.</p>
    <label class="x7opt${o.scale === "abs" ? " on" : ""}"><input type="radio" name="hs" value="abs"${o.scale === "abs" ? " checked" : ""}><div><b>Same absolute scale</b><small>Identical sampling (m) and reach length (km) everywhere. Use for slopes, widths and bend sizes in real units.</small></div></label>
    <label class="x7opt${o.scale === "rel" ? " on" : ""}"><input type="radio" name="hs" value="rel"${o.scale === "rel" ? " checked" : ""}><div><b>Same relative scale</b><small>Sampling and reaches as a fixed fraction of each river's length. Use for shape: concavity, normalised profiles, downstream trends of small vs large rivers.</small></div></label>
    <label class="fl">Reaches per river (relative scale) / guide for absolute<select id="x8Nr">${[10, 20, 40].map(v => `<option${o.reaches === v ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="chk"><input type="checkbox" id="x8W"${o.width ? " checked" : ""}> Re-measure channel width at the new reaches (slower)</label>
    <p class="note">Elevation for all: <b>${esc(DEMSRC[XR.src.dem].n)}</b> at terrain zoom ${P.z} (the coarsest any river needs, so none is measured more finely than another). <a href="#" id="x8Src">Change source</a></p>
    ${P.warn.length ? `<p class="warn">${P.warn.map(esc).join("<br>")}</p>` : ""}
    <div class="btns"><button class="pri" id="x8Go">Re-measure ${P.Rs.length} rivers</button><button id="x8X">Cancel</button></div>`);
  $("x8X").onclick = closeModal; $("x8Src").onclick = e => { e.preventDefault(); closeModal(); openSources(); };
  $("x8Go").onclick = () => { o.scale = (document.querySelector('input[name="hs"]:checked') || {}).value || "abs"; o.reaches = +$("x8Nr").value; o.width = $("x8W").checked; try { localStorage.setItem("efl.harm", JSON.stringify(o)); } catch(_){} closeModal(); cmpHarmonise(o); };
}

/* ---------- comparability certificate ---------- */
function certRows(){
  const C = XR.cmp, row = (n, f) => [n, C.map(c => { try { return f(c.R, c); } catch(_){ return "–"; } })];
  const wcov = R => { const rs = R.reaches || []; return rs.length ? rs.filter(r => r.width && Number.isFinite(r.width.med)).length/rs.length : 0; };
  return [
    row("Elevation source", R => R.prof ? demLabel(R.prof) : "–"),
    row("Terrain zoom", R => R.prof ? `z${R.prof.z}` : "–"),
    row("Terrain cell (varies with latitude)", R => R.prof ? `≈${nf(R.prof.res)} m` : "–"),
    row("Profile sampling", R => R.prof ? nf(R.prof.params.stepKm*1000) + " m" : "–"),
    row("Smoothing window", R => R.prof ? km(R.prof.params.smoothKm) : "–"),
    row("Slope window", R => R.prof ? km(R.prof.params.slopeKm) : "–"),
    row("Conditioning", R => R.prof ? String(R.prof.params.cond).split(" (")[0] : "–"),
    row("Reach length", R => R.reaches && R.reaches[0] ? km(R.reaches[0].L) : "–"),
    row("Reaches", R => String((R.reaches || []).length)),
    row("Width source", R => (R.reaches || []).some(r => r.width) ? (XR.src.water === "user" && XR.userWater ? "your polygons" : "OSM water areas") : "not measured"),
    row("Width coverage", R => nf(100*wcov(R), 0) + " % of reaches"),
    row("Centreline", R => (/^(relation|way)\//.test(R.osm) ? "OpenStreetMap " + R.osm : R.osm) + (R.edits ? " (edited)" : "")),
    row("Made comparable", R => R.harm ? `${R.harm.mode === "abs" ? "absolute" : "relative"} scale` : "no"),
  ];
}
function certHTML(){
  const rows = certRows(), C = XR.cmp, diffs = [];
  const cells = rows.map(([n, v]) => { const mode = (() => { const m = new Map(); v.forEach(x => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; })();
    const crit = !/Centreline|Reaches|Width coverage|cell/.test(n), relOK = XR.cmp.every(c => c.R.harm && c.R.harm.mode === "rel") && /sampling|Smoothing|Slope window|Reach length/.test(n);
    const num = x => parseFloat(String(x).replace(/[^\d.]/g, "")), close = (x, y) => x === y || (/\d/.test(x) && /\d/.test(y) && String(x).replace(/[\d.,\s≈]/g, "") === String(y).replace(/[\d.,\s≈]/g, "") && Math.abs(num(x) - num(y)) <= .06*Math.max(num(x), num(y)));
    const bad = crit && !relOK && v.some(x => !close(x, mode)); if (bad) diffs.push(n.toLowerCase());
    return `<tr><td>${n}</td>${v.map(x => `<td class="${bad && !close(x, mode) ? "x8diff" : ""}">${esc(x)}</td>`).join("")}</tr>`; }).join("");
  const lowW = C.filter(c => (c.R.reaches || []).length && (c.R.reaches || []).filter(r => r.width && Number.isFinite(r.width.med)).length/(c.R.reaches.length) < .5).map(c => c.label);
  return `<div class="card x8cert"><h4>Comparability check</h4>${diffs.length ? `<p class="warn">Not like for like: ${diffs.join(", ")} differ (highlighted). Press <b>Make comparable</b>.</p>` : `<p class="note x8ok">✓ Measured the same way: same elevation source and resolution, sampling, windows and reach definition.</p>`}
    ${lowW.length ? `<p class="note">Width covers under half the reaches for ${lowW.map(esc).join(", ")}: width-based ratios there describe only the mapped stretches.</p>` : ""}
    <div class="scroll"><table class="grid"><tr><th></th>${C.map((c, i) => `<th style="color:${CMPC[i]}">${esc(c.label)}</th>`).join("")}</tr>${cells}</table></div></div>`;
}

/* ---------- dimensionless and normalised metrics, with a reference river ---------- */
function sysMetrics(c){
  const R = c.R, s = rangeStats(R, c.k0, c.k1), rs = (R.reaches || []).filter(r => r.k1 > c.k0 && r.k0 < c.k1), L = c.k1 - c.k0, pr = R.prof;
  const W = rs.map(r => r.width && r.width.med).filter(Number.isFinite), Wm = W.length ? median(W) : NaN;
  const lw = rs.filter(r => r.width && Number.isFinite(r.width.med) && Number.isFinite(r.lambda)).map(r => r.lambda*1000/r.width.med), rcw = rs.filter(r => r.width && Number.isFinite(r.width.med) && Number.isFinite(r.Rc) && r.Rc < r.L).map(r => r.Rc*1000/r.width.med);
  const kn = pr ? pr.knick.filter(k => k.km >= c.k0 && k.km <= c.k1 && !k.artefact && k.scales >= 2).length : NaN;
  const zt = s.zones.source + s.zones.transfer + s.zones.storage + s.zones.sink;
  return {L, fall: s.fall, grad: s.grad, conc: s.conc, sin: s.sin, sinR: median(rs.map(r => r.sin).filter(Number.isFinite)), W: Wm, lw: lw.length ? median(lw) : NaN, rcw: rcw.length ? median(rcw) : NaN, lam: s.lambda, ksn: s.ksn, HI: s.basin ? s.basin.HI : NaN,
    trib: s.tribs/L*100, dams: s.dams/L*100, knick: kn/L*100, store: zt ? s.zones.storage/zt : NaN, src: zt ? s.zones.source/zt : NaN,
    dist: {sin: rs.map(r => r.sin).filter(Number.isFinite), W, slope: rs.map(r => r.slope).filter(v => Number.isFinite(v) && v > 0), lw}};
}
const NMET = [
  ["L", "Length", "km", "scale", v => nf(v)], ["fall", "Fall (relief along river)", "m", "scale", v => nf(v)], ["grad", "Mean gradient", "m/km", "real", v => nf(v, 3)],
  ["conc", "Concavity (Langbein)", "–", "dimless", v => nf(v, 2)], ["sin", "Sinuosity (whole stretch)", "–", "dimless", v => nf(v, 2)], ["sinR", "Median reach sinuosity", "–", "dimless", v => nf(v, 2)],
  ["W", "Median channel width", "m", "real", v => nf(v)], ["lw", "Meander wavelength ÷ width", "–", "dimless", v => nf(v, 1)], ["rcw", "Bend radius ÷ width", "–", "dimless", v => nf(v, 1)],
  ["ksn", "Median steepness ksn (θref 0.45)", "m^0.9", "real", v => tfmt(v)], ["HI", "Hypsometric integral", "–", "dimless", v => nf(v, 2)],
  ["trib", "Tributaries per 100 km", "/100 km", "density", v => nf(v, 1)], ["dams", "Dams and weirs per 100 km", "/100 km", "density", v => nf(v, 2)], ["knick", "Robust knickpoints per 100 km", "/100 km", "density", v => nf(v, 2)],
  ["src", "Share of length: potential source (interp.)", "%", "dimless", v => nf(v*100, 0)], ["store", "Share of length: storage (interp.)", "%", "dimless", v => nf(v*100, 0)],
];
/** two-sample Kolmogorov–Smirnov: D and an approximate p (reaches are not fully independent: treat p as indicative) */
function ksTest(a, b){
  if (a.length < 4 || b.length < 4) return null; const A = a.slice().sort((x, y) => x - y), B = b.slice().sort((x, y) => x - y); let i = 0, j = 0, D = 0;
  while (i < A.length && j < B.length){ const v = Math.min(A[i], B[j]); while (i < A.length && A[i] <= v) i++; while (j < B.length && B[j] <= v) j++; D = Math.max(D, Math.abs(i/A.length - j/B.length)); }
  const en = Math.sqrt(A.length*B.length/(A.length + B.length)), l = (en + .12 + .11/en)*D; let p = 0; for (let k = 1; k <= 100; k++) p += 2*(-1)**(k - 1)*Math.exp(-2*k*k*l*l); return {D, p: clamp(p, 0, 1), n1: A.length, n2: B.length};
}
function metricsHTML(){
  const C = XR.cmp, M = C.map(sysMetrics), ref = clamp(XR.cmpRef || 0, 0, C.length - 1), m0 = M[ref];
  const kinds = {scale: "size", real: "real units", dimless: "dimensionless", density: "per length"};
  const rows = NMET.filter(([k]) => M.some(m => Number.isFinite(m[k]))).map(([k, n, u, kind, f]) => {
    const vals = M.map(m => m[k]), fin = vals.filter(Number.isFinite), rank = v => Number.isFinite(v) ? 1 + fin.filter(x => x > v).length : null;
    return `<tr><td>${n}<small class="x8k">${kinds[kind]}${u !== "–" ? " · " + u : ""}</small></td>${vals.map((v, i) => { const r = m0[k], d = i !== ref && Number.isFinite(v) && Number.isFinite(r) && r !== 0 ? (v/r - 1)*100 : null;
      return `<td>${Number.isFinite(v) ? f(v) : "–"}${d != null ? `<small class="x8d ${Math.abs(d) > 25 ? "big" : ""}">${d >= 0 ? "+" : ""}${nf(d, 0)} %</small>` : ""}${fin.length > 2 && Number.isFinite(v) ? `<small class="x8r">#${rank(v)}</small>` : ""}</td>`; }).join("")}</tr>`; }).join("");
  const tests = [["sin", "Reach sinuosity"], ["W", "Reach width"], ["slope", "Reach gradient"], ["lw", "Wavelength ÷ width"]].map(([k, n]) => {
    const cells = M.map((m, i) => { if (i === ref) return `<td class="note">reference</td>`; const t = ksTest(m.dist[k], m0.dist[k]); if (!t) return `<td>–</td>`; const med = median(m.dist[k])/median(m0.dist[k]);
      return `<td>${t.p < .01 ? "<b>different</b>" : t.p < .05 ? "<b>likely different</b>" : "not distinguishable"}<small class="x8k">D = ${nf(t.D, 2)}, p ≈ ${t.p < .001 ? "<0.001" : nf(t.p, 3)}, median ×${nf(med, 2)}, n = ${t.n1}/${t.n2}</small></td>`; });
    return M.some((m, i) => i !== ref && ksTest(m.dist[k], m0.dist[k])) ? `<tr><td>${n}</td>${cells.join("")}</tr>` : ""; }).join("");
  return `<div class="card"><h4>Like-for-like metrics</h4><div class="row"><label>Reference</label><select id="x8Ref">${C.map((c, i) => `<option value="${i}"${i === ref ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
    <p class="note">Percentages are differences from the reference; # is the rank (1 = highest). Dimensionless measures compare rivers of different size directly; size and real-unit measures are only like for like after <b>Make comparable</b> (absolute scale).</p>
    <div class="scroll"><table class="grid x8t"><tr><th></th>${C.map((c, i) => `<th style="color:${CMPC[i]}">${esc(c.label)}${i === ref ? " (ref.)" : ""}</th>`).join("")}</tr>${rows}</table></div>
    ${tests ? `<h4>Are the distributions different?</h4><p class="note">Two-sample Kolmogorov–Smirnov test of per-reach values against the reference. Neighbouring reaches are not independent, so p is indicative; it is only meaningful when reach lengths match (after Make comparable).</p><div class="scroll"><table class="grid x8t"><tr><th></th>${C.map((c, i) => `<th style="color:${CMPC[i]}">${esc(c.label)}</th>`).join("")}</tr>${tests}</table></div>` : ""}
    <h4>Normalised long profiles</h4><p class="note">Distance ÷ length against height above the end ÷ fall: shape only, independent of size. The dashed line is a straight (uniform-gradient) profile; deeper curves are more concave.</p><div class="xchart" id="x8NProf"></div>
    <h4>Downstream width (normalised distance)</h4><div class="xchart" id="x8NW"></div>
    <h4>Distributions</h4><div class="row"><label>Measure</label><select id="x8Dk">${[["sin", "Reach sinuosity"], ["W", "Reach width (m)"], ["slope", "Reach gradient (m/km)"], ["lw", "Wavelength ÷ width"]].map(([k, n]) => `<option value="${k}"${XR.x8Dk === k ? " selected" : ""}>${n}</option>`).join("")}</select></div><div class="xchart" id="x8Ecdf"></div>
    <h4>Plan views</h4><div class="row"><label>Scale</label><select id="x8PScale"><option value="same"${XR.x8Ps !== "fit" ? " selected" : ""}>Same scale (true relative size)</option><option value="fit"${XR.x8Ps === "fit" ? " selected" : ""}>Each fitted (shape)</option></select><label class="chk"><input type="checkbox" id="x8Align"${XR.x8Al !== false ? " checked" : ""}> Source → mouth left to right</label></div><div id="x8Plan" class="x8plan"></div></div>`;
}
function x8Charts(){
  const C = XR.cmp; if (!C.length || !$("x8NProf")) return; const M = C.map(sysMetrics);
  svgChart($("x8NProf"), {h: 230, xlab: "Distance ÷ length (0 = start, 1 = end)", ylab: "Height above end ÷ fall", x0: 0, x1: 1, y0: 0, series: [{x: [0, 1], y: [1, 0], c: "#9aa3ad", w: 1, dash: true}, ...C.map((c, i) => { const pr = c.R.prof; if (!pr) return {x: [], y: [], c: CMPC[i]}; const i0 = Math.round(c.k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(c.k1/pr.step)), z0 = pr.zc[i0], z1 = pr.zc[i1], H = (z0 - z1) || 1, L = c.k1 - c.k0;
    return {x: Array.from(pr.d.slice(i0, i1 + 1), d => (d - c.k0)/L), y: Array.from(pr.zc.slice(i0, i1 + 1), z => (z - z1)/H), c: CMPC[i], w: 2.2}; })]});
  const ws = C.map((c, i) => { const rs = (c.R.reaches || []).filter(r => r.k1 > c.k0 && r.k0 < c.k1 && r.width && Number.isFinite(r.width.med)), L = c.k1 - c.k0; return {x: rs.map(r => ((r.k0 + r.k1)/2 - c.k0)/L), y: rs.map(r => r.width.med), c: CMPC[i], w: 2}; });
  if (ws.some(s => s.x.length)) svgChart($("x8NW"), {h: 200, xlab: "Distance ÷ length", ylab: "Median reach width (m, log)", logy: true, x0: 0, x1: 1, series: ws}); else $("x8NW").innerHTML = `<p class="note">No widths yet: they are measured automatically after loading, or with Make comparable.</p>`;
  const k = XR.x8Dk || "sin", ser = M.map((m, i) => { const v = m.dist[k].slice().sort((a, b) => a - b); return {x: v, y: v.map((_, j) => (j + 1)/v.length), c: CMPC[i], w: 2}; });
  if (ser.some(s => s.x.length)) svgChart($("x8Ecdf"), {h: 200, xlab: {sin: "Reach sinuosity", W: "Reach width (m)", slope: "Reach gradient (m/km)", lw: "Wavelength ÷ width"}[k], ylab: "Cumulative fraction", y0: 0, series: ser}); else $("x8Ecdf").innerHTML = `<p class="note">No values for this measure yet.</p>`;
  x8PlanViews();
}
function x8PlanViews(){
  const el = $("x8Plan"); if (!el) return; const C = XR.cmp, same = XR.x8Ps !== "fit", align = XR.x8Al !== false;
  const G = C.map(c => { const R = c.R, i0 = idxAtKm(R, c.k0), i1 = idxAtKm(R, c.k1), st = Math.max(1, Math.floor((i1 - i0)/1500)); const P = []; for (let i = i0; i <= i1; i += st) P.push(R.main[i]); P.push(R.main[i1]);
    const a = P[0], L0 = toLocal(P, a[0], a[1]); let Q = L0; if (align){ const e = L0[L0.length - 1], t = -Math.atan2(e[1], e[0]); Q = L0.map(p => [p[0]*Math.cos(t) - p[1]*Math.sin(t), p[0]*Math.sin(t) + p[1]*Math.cos(t)]); }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of Q){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return {Q, x0, x1, y0, y1}; });
  const cols = el.clientWidth < 520 ? 1 : C.length > 4 ? 3 : 2, cw = Math.floor((el.clientWidth || 600)/cols) - 8, ch = Math.round(cw*.55);
  const sMax = Math.max(...G.map(g => Math.max((g.x1 - g.x0)/(cw - 24), (g.y1 - g.y0)/(ch - 44))));
  el.innerHTML = G.map((g, i) => { const s = same ? sMax : Math.max((g.x1 - g.x0)/(cw - 24), (g.y1 - g.y0)/(ch - 44)), cx = (g.x0 + g.x1)/2, cy = (g.y0 + g.y1)/2, X = v => (v - cx)/s + cw/2, Y = v => (v - cy)/s + (ch + 8)/2;
    const bar = (() => { const t = (cw*.3)*s, p = 10**Math.floor(Math.log10(t)), l = [1, 2, 5].map(k => k*p).filter(v => v <= t).pop() || p; return {l, px: l/s}; })(), c = C[i], m = sysMetrics(c);
    return `<svg viewBox="0 0 ${cw} ${ch}" width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="${cw}" height="${ch}" fill="#fff" rx="6"/><text x="10" y="17" font-size="12" font-weight="700" fill="${CMPC[i] === "#ffd84a" ? "#b38f00" : CMPC[i]}" stroke="#000" stroke-width=".15">${esc(c.label)}</text><text x="${cw - 10}" y="17" font-size="10.5" text-anchor="end" fill="#444">${km(m.L)} · sinuosity ${nf(m.sin, 2)}</text>
      <polyline points="${g.Q.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ")}" fill="none" stroke="#1d232a" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${X(g.Q[0][0])}" cy="${Y(g.Q[0][1])}" r="3.5" fill="#2ca02c"/><circle cx="${X(g.Q[g.Q.length - 1][0])}" cy="${Y(g.Q[g.Q.length - 1][1])}" r="3.5" fill="#d62728"/>
      <rect x="10" y="${ch - 14}" width="${bar.px}" height="3" fill="#111"/><text x="10" y="${ch - 18}" font-size="10" fill="#111">${bar.l >= 1 ? nf(bar.l) + " km" : nf(bar.l*1000) + " m"}</text>${!align ? `<text x="${cw - 12}" y="${ch - 10}" font-size="10" text-anchor="end" fill="#111">N ↑</text>` : ""}</svg>`; }).join("");
  el.insertAdjacentHTML("beforeend", `<p class="note">${same ? "All panels share one scale: sizes compare directly." : "Each panel is fitted to its river: compare shape only (scale bars differ)."} ${align ? "Each river is turned so its source (green) is on the left and its mouth (red) on the right." : "North is up."}</p>`);
}

/* ---------- compare tab ---------- */
function x8Render(){
  const body = $("xCmpBody"); if (!body) return; const C = XR.cmp;
  let top = $("x8Top"); if (!top){ top = document.createElement("div"); top.id = "x8Top"; body.parentElement.insertBefore(top, body); }
  let bot = $("x8Bot"); if (!bot){ bot = document.createElement("div"); bot.id = "x8Bot"; body.parentElement.insertBefore(bot, body.nextSibling); }
  const keepV = $("x8Names") ? $("x8Names").value : "", hadF = document.activeElement && document.activeElement.id === "x8Names";
  top.innerHTML = `<div class="card x8add"><h4>Compare rivers</h4><p class="note">Type several rivers separated by commas (up to ${CMPMAX}); each is traced and measured, then added. Or load a river and press ＋ Compare on any stretch.</p>
    <div class="row x8row"><input id="x8Names" type="text" placeholder="e.g. Rhine, Danube, Elbe, Loire" enterkeyhint="go"><button class="pri sm" id="x8Add">Add</button></div>
    ${XR.river && !C.some(c => c.R === XR.river) ? `<button class="sm" id="x8Cur">＋ Add ${esc(XR.river.name)} (whole river)</button>` : ""}
    ${C.length > 1 ? `<div class="btns"><button class="sm pri" id="x8Harm">⚖ Make comparable…</button></div>` : ""}</div>${C.length > 1 ? certHTML() : ""}`;
  bot.innerHTML = C.length > 1 ? metricsHTML() : "";
  if (keepV) $("x8Names").value = keepV; if (hadF) $("x8Names").focus();
  $("x8Add").onclick = () => { const v = $("x8Names").value; $("x8Names").value = ""; cmpAddNames(v); };
  $("x8Names").onkeydown = e => { if (e.key === "Enter") $("x8Add").click(); };
  if ($("x8Cur")) $("x8Cur").onclick = () => { const R = XR.river; if (XR.cmp.length >= CMPMAX) XR.cmp.shift(); XR.cmp.push({R, k0: 0, k1: R.L, label: R.name}); renderX(); };
  if ($("x8Harm")) $("x8Harm").onclick = harmDialog;
  if ($("x8Ref")) $("x8Ref").onchange = e => { XR.cmpRef = +e.target.value; x8Render(); x8Charts(); };
  if ($("x8Dk")) $("x8Dk").onchange = e => { XR.x8Dk = e.target.value; x8Charts(); };
  if ($("x8PScale")) $("x8PScale").onchange = e => { XR.x8Ps = e.target.value; x8PlanViews(); };
  if ($("x8Align")) $("x8Align").onchange = e => { XR.x8Al = e.target.checked; x8PlanViews(); };
  const old = document.querySelector("#x3-compare .cmpq"); if (old && C.length > 1) old.style.display = "none";
  if (XR.tab === "compare") setTimeout(x8Charts, 0);
}
{ const _rc = renderCompare; renderCompare = function(){ _rc(); try { x8Render(); } catch(e){ console.error(e); } }; }
