/* ===================== Earthform Lens: result contract, landscape intelligence, analogues, scientific figures ===================== */
// Shared result model (every number carries units, geometry, source, resolution, method, parameters and QC status), rule-based
// interpretation that separates observation / measurement / interpretation, a local analogue repository (IndexedDB), research-style
// figures, a worker for terrain routing, a persistent request cache, acquisition dates for archive imagery and an in-app self-test.

const RULES_VERSION = "efl-rules-1.0", METHOD_VERSION = "efl-methods-2026.11";

/* ---------- 1. canonical results ---------- */
function studyId(R, k0, k1){ return R.osm + (k0 > 0 || k1 < R.L ? `@${k0.toFixed(2)}-${k1.toFixed(2)}` : ""); }
function qOf(arr){ const v = arr.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const q = p => quantile(v, p), m = v.reduce((a, b) => a + b, 0)/v.length; return {n: v.length, p10: q(.1), p25: q(.25), p50: q(.5), p75: q(.75), p90: q(.9), mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m)**2, 0)/v.length), min: v[0], max: v[v.length - 1]}; }
/** all results for a study area (whole river or an exact stretch); missing values are kept as missing with a hint */
function resultSet(R, k0 = 0, k1 = R.L){
  const sid = studyId(R, k0, k1), whole = !(k0 > 0 || k1 < R.L), pr = R.prof, out = [], osm = /^(relation|way)\//.test(R.osm) ? "OpenStreetMap (ODbL)" : R.osm.startsWith("file:") ? "uploaded GeoJSON" : "hand-drawn line";
  const rs = (R.reaches || []).filter(r => r.k1 > k0 + 1e-9 && r.k0 < k1 - 1e-9); rs.forEach(r => { if (r.meanK == null) curvatureStats(R, r); geomExtras(R, r); });
  const ex = whole ? null : reachStats(R, k0, k1, -1), dem = pr ? demLabel(pr) : null;
  const add = (metric, label, value, unit, o = {}) => out.push({id: `${sid}#${metric}`, study: sid, metric, label, value: Number.isFinite(value) ? value : (typeof value === "string" ? value : null), unit, kind: o.kind || "measured", geometry: o.geom || {type: "chainage", k0, k1}, samples: o.samples || null, source: (Number.isFinite(value) || typeof value === "string") ? (o.source || osm) : (o.source || null), resolution: o.res || null, method: o.method || "", params: o.params || null, version: METHOD_VERSION, qc: o.qc || (Number.isFinite(value) || typeof value === "string" ? "ok" : "missing"), hint: o.hint || "", tab: o.tab || ""});
  const L = k1 - k0, a = pointAtKm(R, k0), b = pointAtKm(R, k1);
  add("length", "Channel length", L, "km", {method: "geodesic (haversine) length of the centreline", tab: "reaches"});
  add("sinuosity", "Sinuosity (channel ÷ straight distance)", ex ? ex.sin : L/Math.max(1e-6, hav(a, b)), "", {method: "channel length ÷ straight-line distance between ends", params: {reach_km: L}, qc: L < 5 ? "review" : "ok", hint: "", tab: "reaches"});
  const reachSin = rs.map(r => r.sin);
  add("reach_sinuosity", "Reach sinuosity (median)", median(reachSin.filter(Number.isFinite)), "", {samples: qOf(reachSin), method: "median of equal-length reaches", params: {reach_km: rs[0] ? +rs[0].L.toFixed(2) : null}, tab: "reaches"});
  add("valley_sinuosity", "Valley-axis sinuosity", median(rs.map(r => r.valleySin).filter(Number.isFinite)), "", {method: "channel ÷ valley-axis length (axis smoothed over ~1 wavelength)", tab: "reaches"});
  const lam = rs.map(r => r.lambda), amp = rs.map(r => r.amp), cur = rs.map(r => r.meanK), rc = rs.map(r => r.Rc);
  add("wavelength", "Meander wavelength", median(lam.filter(Number.isFinite)), "km", {samples: qOf(lam), method: "2 × median half-bend length from curvature inflections", tab: "reaches"});
  add("amplitude", "Meander amplitude", median(amp.filter(Number.isFinite)), "km", {samples: qOf(amp), method: "2 × median peak offset from the valley axis", tab: "reaches"});
  add("curvature", "Mean absolute curvature", median(cur.filter(Number.isFinite)), "rad/km", {samples: qOf(cur), method: "turning angle per km, Gaussian-smoothed centreline", tab: "reaches"});
  add("bend_radius", "Bend radius (median)", median(rc.filter(Number.isFinite)), "km", {samples: qOf(rc), method: "1 / peak |curvature| per bend", tab: "reaches"});
  const tr = rs.flatMap(r => (r.width && r.width.tr || []).filter(t => !t.off && t.km >= k0 && t.km <= k1)), cover = rs.length ? rs.filter(r => r.width && Number.isFinite(r.width.med)).length/rs.length : 0;
  add("width", "Mapped water-area width (median)", tr.length ? median(tr.map(t => t.w)) : NaN, "m", {samples: qOf(tr.map(t => t.w)), source: "OpenStreetMap water areas (ODbL)", res: tr.length ? "transects " + nf((rs.find(r => r.width && r.width.stepKm) || {width: {stepKm: 0}}).width.stepKm*1000) + " m apart" : null, method: "bank-to-bank distance along transects inside mapped water areas (wetted/mapped width, not bankfull)", qc: !tr.length ? "missing" : cover < .6 ? "partial" : "ok", hint: "Measure widths in Channel geometry", tab: "reaches", geom: {type: "transects", n: tr.length}});
  add("braiding", "Braiding index (water bodies per transect)", tr.length ? tr.reduce((s, t) => s + t.n, 0)/tr.length : NaN, "", {samples: qOf(tr.map(t => t.n)), source: "OpenStreetMap water areas", method: "separate water bodies crossed by each transect", qc: tr.length ? "ok" : "missing", hint: "Measure widths in Channel geometry", tab: "reaches"});
  const i0 = pr ? Math.round(k0/pr.step) : 0, i1 = pr ? Math.min(pr.d.length - 1, Math.round(k1/pr.step)) : 0;
  const zc0 = pr ? pr.zc[i0] : NaN, zc1 = pr ? pr.zc[i1] : NaN;
  add("fall", "Elevation fall", zc0 - zc1, "m", {source: dem, res: pr ? `≈${nf(pr.res)} m cells` : null, method: "conditioned profile, start minus end", params: pr && pr.params, qc: !pr ? "missing" : pr.cond && pr.cond.max > 15 ? "review" : "ok", hint: "Wait for the elevation profile", tab: "profile"});
  add("gradient", "Mean gradient", (zc0 - zc1)/L, "m/km", {source: dem, res: pr ? `≈${nf(pr.res)} m cells` : null, method: "fall ÷ channel length", params: pr && pr.params, qc: !pr ? "missing" : pr.cond && pr.cond.max > 15 ? "review" : "ok", tab: "profile"});
  if (pr){ const H = zc0 - zc1; let ar = 0; for (let i = i0 + 1; i <= i1; i++) ar += ((zc0 - H*(pr.d[i] - k0)/L) - pr.zc[i])*(pr.d[i] - pr.d[i - 1]);
    add("concavity", "Langbein concavity index", H > 0 ? 2*ar/(H*L) : NaN, "", {source: dem, method: "2A/(H·L): area between the profile and its chord", tab: "profile"}); }
  else add("concavity", "Langbein concavity index", NaN, "", {hint: "Wait for the elevation profile", tab: "profile"});
  add("theta", "Slope–area concavity θ", whole && pr && pr.theta != null ? pr.theta : NaN, "", {source: dem, method: "least-squares fit S = ks·A^−θ where A > 1% of the basin", qc: whole && pr && pr.theta != null ? (pr.saN < 30 ? "review" : "ok") : "missing", hint: "Run Catchment", tab: "profile"});
  add("ksn", "Normalised steepness ksn (θref 0.45)", median(rs.map(r => r.ksn).filter(Number.isFinite)), "m^0.9", {source: dem, method: "S·A^0.45 with A in m²", hint: "Run Catchment", tab: "profile"});
  const kn = pr ? pr.knick.filter(q => q.km >= k0 && q.km <= k1) : [];
  add("knickpoints", "Knickpoints detected", pr ? kn.length : NaN, "count", {kind: "observed", source: dem, method: `local slope > ${pr ? pr.params.kRatio : 2.5}× surroundings and drop > ${pr ? pr.params.kDrop : 5} m`, params: pr && pr.params, geom: {type: "points", pts: kn.map(q => q.km)}, tab: "profile"});
  add("tributaries", "Tributaries joining", R.tribs.filter(t => !t.distributary && t.km >= k0 && t.km <= k1).length, "count", {kind: "observed", method: "count of mapped tributary junctions (OpenStreetMap)", tab: "tribs"});
  add("dams", "Dams and weirs (barriers)", R.dams.filter(d => d.km >= k0 && d.km <= k1).length, "count", {kind: "observed", method: "count of mapped dams and weirs (OpenStreetMap)", tab: "sediment"});
  const B = whole ? R.basin : null;
  add("catchment_area", "Catchment area (delineated)", B ? B.area : NaN, "km²", {source: B ? `AWS Terrain Tiles z${B.g.z}` : null, res: B ? `≈${nf(B.cellKm*1000)} m cells` : null, method: "priority-flood + D8 upstream area of the outlet", qc: !B ? "missing" : B.clipped ? "review" : "ok", hint: whole ? "Run Catchment" : "Catchment applies to the whole river or a chosen outlet", tab: "catchment"});
  add("relief", "Basin relief", B ? B.relief : NaN, "m", {source: B && `AWS Terrain Tiles z${B.g.z}`, method: "max − min elevation in the basin", hint: "Run Catchment", tab: "catchment"});
  add("hypsometric_integral", "Hypsometric integral", B ? B.HI : NaN, "", {method: "(mean − min)/(max − min)", hint: "Run Catchment", tab: "catchment"});
  add("drainage_density", "Drainage density", whole && R.net2 ? R.net2.Dd : NaN, "km/km²", {method: `channels above ${R.net2 ? nf(R.net2.At, 1) : "?"} km² drainage area`, params: R.net2 ? {threshold_km2: R.net2.At} : null, hint: "Run Drainage network", tab: "network"});
  add("bifurcation_ratio", "Bifurcation ratio Rb", whole && R.net2 ? R.net2.Rb : NaN, "", {method: "geometric mean of Nᵤ/Nᵤ₊₁ (Strahler)", hint: "Run Drainage network", tab: "network"});
  add("strahler", "Highest Strahler order", whole && R.net2 ? R.net2.maxO : NaN, "", {method: "Strahler ordering of terrain-extracted channels", hint: "Run Drainage network", tab: "network"});
  const fpr = rs.filter(r => r.fpW != null);
  add("floodplain_width", "Floodplain width (median)", fpr.length ? median(fpr.map(r => r.fpW)) : NaN, "m", {samples: R.fp ? qOf(R.fp.secs.filter(q => q.km >= k0 && q.km <= k1).map(q => q.fp)) : null, source: R.fp && `AWS Terrain Tiles z${R.fp.z}`, res: R.fp && `≈${nf(R.fp.cell)} m cells`, method: R.fp ? `ground within ${R.fp.h} m of the channel bed along cross-sections` : "", params: R.fp ? {flood_height_m: R.fp.h} : null, hint: "Measure the floodplain", tab: "floodplain"});
  const cf = fpr.filter(r => Number.isFinite(r.confine));
  add("confinement", "Floodplain ÷ channel width", cf.length ? median(cf.map(r => r.confine)) : NaN, "", {method: "convention: floodplain width ÷ mapped channel width (<2 confined, 2–10 partly, >10 unconfined)", hint: "Measure widths and the floodplain", tab: "floodplain"});
  const D = whole && R.delta && !R.delta.single ? R.delta : null;
  add("delta_area", "Delta area (hull of mapped channels)", D ? D.area : NaN, "km²", {method: "convex hull of channels below the apex", qc: D ? "review" : "missing", hint: "Only for rivers with mapped distributaries", tab: "delta"});
  add("delta_mouths", "Delta mouths", D ? D.mouths : NaN, "count", {kind: "observed", method: "channel ends near the mouth reachable from the apex (OSM)", tab: "delta"});
  const zl = {source: 0, transfer: 0, storage: 0, sink: 0}; rs.forEach(r => { if (r.zone) zl[r.zone] += Math.min(r.k1, k1) - Math.max(r.k0, k0); });
  add("storage_fraction", "Potential storage + sink share", L > 0 && rs.some(r => r.zone) ? (zl.storage + zl.sink)/L*100 : NaN, "%", {kind: "interpreted", method: "weighted geomorphological indicators (potential, not measured flux)", params: {...XR.sw}, tab: "sediment"});
  return out;
}
const resIdx = list => Object.fromEntries(list.map(r => [r.metric, r]));

/* ---------- 2. landscape intelligence: evidence-linked, rule-based ---------- */
function interpret(R, k0 = 0, k1 = R.L){
  const res = resultSet(R, k0, k1), M = resIdx(res), v = k => M[k] && M[k].value, has = k => M[k] && M[k].value != null && M[k].qc !== "missing", F = [];
  const need = (...ks) => ks.filter(k => !has(k)).map(k => M[k] || {metric: k, label: k});
  const finding = (title, o) => F.push({title, rule: RULES_VERSION, ...o});
  // planform
  { const miss = need("reach_sinuosity"); if (miss.length) finding("Channel planform", {status: "unknown", needs: miss});
    else { const s = v("reach_sinuosity"), bi = v("braiding"), g = v("gradient"), ev = ["reach_sinuosity", "braiding", "gradient", "valley_sinuosity"].filter(has);
      let interp, alt = [];
      if (has("braiding") && bi >= 1.5){ interp = "multithread channel: several water bodies cross most transects"; alt = [has("gradient") && g > .5 ? "braided (steeper, bar-dominated threads)" : "anabranching (low gradient, stable islands) — distinguish with imagery of island vegetation", has("gradient") && g > .5 ? "anabranching if the islands are vegetated and stable" : "braided if the bars are bare and shift between dates"]; }
      else if (s >= 1.5) { interp = "single-thread meandering channel"; alt = ["sinuosity can also come from confined, valley-following bends (check valley-axis sinuosity)"]; }
      else if (s >= 1.05) { interp = "sinuous single-thread channel"; alt = ["low-sinuosity meandering", "a channel following a sinuous valley"]; }
      else { interp = "straight channel"; alt = ["engineered (canalised) reach", "structurally controlled channel"]; }
      finding("Channel planform", {status: "ok", observation: `The mapped centreline ${s >= 1.5 ? "winds strongly" : s >= 1.05 ? "bends moderately" : "is nearly straight"}${has("braiding") ? `; transects cross on average ${nf(bi, 2)} separate water bodies` : ""}.`,
        measurement: `Reach sinuosity ${nf(s, 2)}${has("braiding") ? `, braiding index ${nf(bi, 2)}` : ""}${has("gradient") ? `, gradient ${nf(g, 3)} m/km` : ""}${has("valley_sinuosity") ? `, valley sinuosity ${nf(v("valley_sinuosity"), 2)}` : ""}.`,
        interpretation: `Consistent with a ${interp}.`, alternatives: alt, evidence: ev, caveat: has("braiding") ? "" : "No width transects yet: multithread patterns cannot be recognised from the centreline alone." }); } }
  // lateral migration potential
  { const miss = need("reach_sinuosity", "confinement"); if (miss.length) finding("Lateral migration potential", {status: "unknown", needs: miss});
    else { const s = v("reach_sinuosity"), c = v("confinement"), un = c > 10, ok = s >= 1.3 && un;
      finding("Lateral migration potential", {status: "ok", observation: `The channel ${un ? "has room to move across a wide floodplain" : c < 2 ? "is hemmed in by its valley" : "has a moderately wide floodplain"}.`, measurement: `Sinuosity ${nf(s, 2)}; floodplain ÷ channel width ${nf(c, 1)}.`,
        interpretation: ok ? "Lateral migration with point-bar (lateral) accretion is plausible and likely an important process." : c < 2 ? "Lateral migration is probably limited by confinement; vertical incision or bedrock control may dominate." : "Some lateral adjustment is possible but constrained.", alternatives: ["test with dated imagery in Temporal evolution before stating rates"], evidence: ["reach_sinuosity", "confinement", "floodplain_width"].filter(has) }); } }
  // longitudinal profile
  { const miss = need("concavity"); if (miss.length) finding("Longitudinal profile", {status: "unknown", needs: miss});
    else { const c = v("concavity"), th = has("theta") ? v("theta") : null;
      finding("Longitudinal profile", {status: "ok", observation: `The profile is ${c > .15 ? "concave-up (steep upstream, gentle downstream)" : c < -.05 ? "convex in places" : "close to straight"}.`, measurement: `Langbein concavity ${nf(c, 2)}${th != null ? `; slope–area θ ${nf(th, 2)}` : ""}.`,
        interpretation: th == null ? (c > .15 ? "Consistent with a graded profile adjusted to downstream increases in discharge." : "A straight or convex profile suggests transient adjustment or strong controls (lithology, uplift, base-level change).") : th > .7 ? "θ above typical graded values (0.35–0.65)." : th < .3 ? "θ below typical graded values: transient incision or resistant rock downstream are possible." : "θ within the range typical of graded bedrock and mixed rivers.",
        alternatives: th != null && (th > .7 || th < .3) ? ["downstream changes in lithology", "spatially varying uplift", "changes in sediment supply or discharge", "DEM artefacts and anthropogenic structures"] : [], evidence: ["concavity", "theta", "gradient"].filter(has), caveat: M.fall && M.fall.qc === "review" ? "Profile conditioning lowered elevations substantially; check the raw profile." : "" }); } }
  // knickpoints
  { const pr = R.prof; if (!pr) finding("Knickpoints", {status: "unknown", needs: [M.knickpoints]});
    else { const kn = pr.knick.filter(q => q.km >= k0 && q.km <= k1);
      const items = kn.map(q => { const dam = R.dams.find(d => Math.abs(d.km - q.km) < Math.max(2, 3*pr.step)), tr = R.tribs.find(t => !t.distributary && Math.abs(t.km - q.km) < Math.max(2, 3*pr.step));
        return {km: q.km, z: q.z, conf: q.confidence, why: (q.confidence ? `[${q.confidence}] ` : "") + (dam ? `coincides with ${dam.name ? esc(dam.name) : "a mapped dam/weir"} (km ${nf(dam.km)}): most likely anthropogenic` : tr ? `near the ${esc(tr.name)} confluence: a confluence step or sediment input is possible` : "no dam or confluence nearby: lithological contact, a retreating knickpoint or a DEM artefact — check imagery and geology")}; });
      finding("Knickpoints", {status: "ok", observation: kn.length ? `${kn.length} abrupt steepening${kn.length > 1 ? "s" : ""} in the profile.` : "No abrupt steepening detected at the current sensitivity.", measurement: kn.length ? kn.slice(0, 6).map(q => `km ${nf(q.km)} (${nf(q.z)} m)`).join(", ") + (kn.length > 6 ? "…" : "") : `Threshold ${pr.params.kRatio}× surrounding slope, ${pr.params.kDrop} m drop.`,
        interpretation: kn.length ? "Each candidate is listed with the most likely explanation from nearby features; none is confirmed." : "The profile lacks prominent steps at this resolution.", items, evidence: ["knickpoints", "dams", "tributaries"], caveat: `Detection depends on the ${nf(pr.res)} m terrain and the parameters; short steps can be missed.` }); } }
  // catchment maturity
  { const miss = need("hypsometric_integral"); if (miss.length) finding("Catchment hypsometry", {status: "unknown", needs: miss});
    else { const h = v("hypsometric_integral"); finding("Catchment hypsometry", {status: "ok", observation: `${h > .6 ? "Much" : h < .35 ? "Little" : "A moderate share"} of the catchment stands high relative to its relief.`, measurement: `HI ${nf(h, 2)}, relief ${nf(v("relief"))} m, area ${nf(v("catchment_area"))} km².`,
      interpretation: h > .6 ? "Consistent with a youthful, little-dissected landscape (Strahler 1952)." : h < .35 ? "Consistent with a mature, deeply eroded landscape." : "Consistent with an equilibrium-stage landscape.", alternatives: ["HI also depends on basin size, lithology and climate; compare basins of similar size"], evidence: ["hypsometric_integral", "relief", "catchment_area"] }); } }
  // sediment routing
  { const miss = need("storage_fraction"); if (miss.length) finding("Sediment routing (potential)", {status: "unknown", needs: miss});
    else { const z = {source: 0, transfer: 0, storage: 0, sink: 0}; (R.reaches || []).filter(r => r.k1 > k0 && r.k0 < k1).forEach(r => z[r.zone] += r.L); const tot = Object.values(z).reduce((a, b) => a + b, 0) || 1;
      finding("Sediment routing (potential)", {status: "ok", observation: `${v("dams") ? v("dams") + " mapped barrier(s) interrupt the downstream pathway." : "No mapped barriers on this stretch."}`, measurement: `Potential source ${nf(z.source/tot*100)}%, transfer ${nf(z.transfer/tot*100)}%, storage ${nf(z.storage/tot*100)}%, terminal sink ${nf(z.sink/tot*100)}%.`,
        interpretation: "A geomorphological interpretation of where sediment is likely produced, moved and stored.", alternatives: ["not a sediment budget: no measured flux, grain size or discharge is used"], evidence: ["storage_fraction", "gradient", "confinement", "dams"].filter(has) }); } }
  // delta
  if (k1 >= R.L - 1e-6 && R.delta && !R.delta.single){ const D = R.delta; finding("Delta morphology", {status: "ok", observation: `${D.mouths} mouths fed by ${D.bif} bifurcations below the apex at km ${nf(D.apexKm)}.`, measurement: `Area ${nf(D.area)} km², opening angle ${nf(D.opening)}°, elongation ${nf(D.elong, 2)}${D.bifs && D.bifs.length ? `, median bifurcation angle ${nf(median(D.bifs.map(b => b.ang)))}°` : ""}.`,
    interpretation: D.morph ? D.morph.replace(":", " —") + "." : "", alternatives: ["wave and tidal influence cannot be determined from planform alone: wave climate and tidal range data are needed", "incomplete mapping of small distributaries changes these numbers"], evidence: ["delta_area", "delta_mouths"] }); }
  return {findings: F, results: res, study: studyId(R, k0, k1), rules: RULES_VERSION, made: new Date().toISOString()};
}
function renderInterp(){
  const el = $("x4-interp"), R = XR.river; if (!el || !R) return; const s = selRange(), I = interpret(R, s.k0, s.k1), M = resIdx(I.results);
  const chip = k => { const r = M[k]; if (!r) return ""; return `<button class="evc ${r.qc}" data-ev="${esc(k)}" title="${esc(r.method || "")}">${esc(r.label)}${r.value != null ? `: ${typeof r.value === "number" ? tfmt(r.value) : esc(r.value)}${r.unit && r.unit !== "count" ? " " + r.unit : ""}` : ": missing"}</button>`; };
  const lv = `<div class="card levels"><b>Analysis level</b><span class="note">Quick (done on load): course, profile, planform. Standard (≈10–60 s): + channel widths and catchment. Detailed (minutes): + floodplain and oxbows for the selected stretch.</span><div class="btns"><button class="sm" data-lvl="standard">▶ Run standard</button><button class="sm" data-lvl="detailed">▶ Run detailed</button></div></div>`;
  el.innerHTML = lv + `<p class="note">Every statement separates what is <b>seen</b>, what is <b>measured</b> and what it <b>may mean</b>. Interpretations come from transparent rules (${RULES_VERSION}), cite their evidence and stay “unknown” until the needed measurements exist. No confidence percentages are given because the rules are not calibrated.</p>
    ${I.findings.map(f => f.status === "unknown" ? `<div class="finding unk"><h4>${esc(f.title)} <em>unknown</em></h4><p>Needs: ${f.needs.map(n => `<button class="evc missing" data-go="${esc(n.tab || "")}">${esc(n.label)}${n.hint ? " — " + esc(n.hint) : ""}</button>`).join(" ")}</p></div>` :
      `<div class="finding"><h4>${esc(f.title)}</h4><div class="omi"><div><span>Observation</span>${esc(f.observation)}</div><div><span>Measurement</span>${esc(f.measurement)}</div><div><span>Interpretation</span>${f.interpretation}</div></div>
      ${f.items && f.items.length ? `<ul class="kitems">${f.items.slice(0, 8).map(q => `<li><button class="sm" data-km="${q.km}">km ${nf(q.km)}</button> ${q.why}</li>`).join("")}</ul>` : ""}
      ${f.alternatives && f.alternatives.length ? `<p class="alt"><b>Other explanations:</b> ${f.alternatives.map(esc).join("; ")}</p>` : ""}${f.caveat ? `<p class="warn">${esc(f.caveat)}</p>` : ""}<p class="evs">Evidence: ${f.evidence.map(chip).join(" ")}</p></div>`).join("")}
    <div class="btns"><button class="sm pri" id="x4SaveA">＋ Save this ${s.whole ? "river" : "stretch"} as an analogue record</button><button class="sm" id="x4ResCsv">⬇ Results table CSV</button></div>
    <h4>All results for this study area</h4><div class="scroll"><table class="grid"><tr><th>Measurement</th><th>value</th><th>unit</th><th>kind</th><th>QC</th><th>source · resolution</th></tr>${I.results.map(r => `<tr><td>${esc(r.label)}</td><td>${r.value == null ? "–" : typeof r.value === "number" ? tfmt(r.value) : esc(r.value)}${r.samples ? ` <small>(n=${r.samples.n}, P10–P90 ${tfmt(r.samples.p10)}–${tfmt(r.samples.p90)})</small>` : ""}</td><td>${esc(r.unit)}</td><td>${r.kind}</td><td><span class="qc ${r.qc}">${r.qc}</span></td><td>${esc(r.source || "–")}${r.resolution ? " · " + esc(r.resolution) : ""}</td></tr>`).join("")}</table></div>`;
  el.querySelectorAll("[data-lvl]").forEach(b => b.onclick = () => runLevel(b.dataset.lvl).catch(e => xstatus(esc(e.message), "err")));
  el.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => { const r = M[b.dataset.ev]; if (r && r.tab) showXTab(r.tab); if (r && r.geometry && r.geometry.type === "points" && r.geometry.pts.length) setPos(r.geometry.pts[0]); });
  el.querySelectorAll("[data-go]").forEach(b => b.onclick = () => b.dataset.go && showXTab(b.dataset.go));
  el.querySelectorAll("[data-km]").forEach(b => b.onclick = () => { setPos(+b.dataset.km); flyTo(+b.dataset.km, 12); });
  $("x4SaveA").onclick = () => saveAnalogue(R, s.k0, s.k1, I).catch(e => toast("Could not save: " + e.message));
  $("x4ResCsv").onclick = () => save(R.name.replace(/[^\w]+/g, "_") + "_results.csv", xcsv(I.results.map(r => ({result_id: r.id, metric: r.metric, label: r.label, value: r.value, unit: r.unit, kind: r.kind, qc: r.qc, n: r.samples && r.samples.n, p10: r.samples && r.samples.p10, p50: r.samples && r.samples.p50, p90: r.samples && r.samples.p90, source: r.source, resolution: r.resolution, method: r.method, method_version: r.version, params: r.params ? JSON.stringify(r.params) : ""}))));
}

/* ---------- 3. persistent storage (IndexedDB): analogues + request cache ---------- */
let idbP = null;
function idb(){ if (idbP) return idbP; idbP = new Promise((ok, no) => { try { const rq = indexedDB.open("earthform-lens", 3); rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains("netlib")) d.createObjectStore("netlib", {keyPath: "id"}); if (!d.objectStoreNames.contains("analogues")) d.createObjectStore("analogues", {keyPath: "id"}); if (!d.objectStoreNames.contains("cache")) d.createObjectStore("cache"); }; rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); } catch(e){ no(e); } }); return idbP; }
async function idbTx(store, mode, fn){ const d = await idb(); return new Promise((ok, no) => { const t = d.transaction(store, mode), s = t.objectStore(store), r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); }
const idbGet = (st, k) => idbTx(st, "readonly", s => s.get(k)), idbPut = (st, v, k) => idbTx(st, "readwrite", s => k === undefined ? s.put(v) : s.put(v, k)), idbAll = st => idbTx(st, "readonly", s => s.getAll()), idbDel = (st, k) => idbTx(st, "readwrite", s => s.delete(k));
// cache Overpass answers for a week (versioned key); a repeat visit to a river is then instant
{ const raw = overpass; const CV = "v1:", TTL = 7*864e5;
  overpass = async function(q){ const k = CV + q; try { const hit = await idbGet("cache", k); if (hit && Date.now() - hit.t < TTL){ XR.cacheHits = (XR.cacheHits || 0) + 1; return hit.v; } } catch(_){}
    const v = await raw(q); try { const sz = JSON.stringify(v).length; if (sz < 6e7) idbPut("cache", {t: Date.now(), v}, k).catch(() => {}); } catch(_){} return v; }; }
async function clearCache(){ try { await idbTx("cache", "readwrite", s => s.clear()); toast("Cached map data cleared"); } catch(e){ toast("Could not clear the cache"); } }

/* ---------- 4. analogue repository ---------- */
async function saveAnalogue(R, k0, k1, I){
  I = I || interpret(R, k0, k1); const M = resIdx(I.results), plan = I.findings.find(f => f.title === "Channel planform"), env = $("x4Env") ? $("x4Env").value : "";
  const simp = resampleKm(R, k0, k1, Math.max(.05, (k1 - k0)/400)).map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
  const tr = (R.reaches || []).flatMap(r => (r.width && r.width.tr || []).filter(t => !t.off && t.km >= k0 && t.km <= k1).map(t => +t.w.toFixed(1)));
  const rec = {id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: R.name + (k0 > 0 || k1 < R.L ? ` km ${nf(k0)}–${nf(k1)}` : ""), river: R.name, region: R.region || "", source: R.osm, wikidata: R.wikidata || null, level: k0 > 0 || k1 < R.L ? "reach" : "system", k0, k1,
    environment: env || (plan && plan.status === "ok" ? (/multithread/.test(plan.interpretation) ? "fluvial – multithread" : /meandering/.test(plan.interpretation) ? "fluvial – meandering" : /sinuous/.test(plan.interpretation) ? "fluvial – sinuous" : "fluvial – straight") : "fluvial – unclassified") + (R.delta && !R.delta.single && k1 >= R.L - 1e-6 ? " + delta" : ""),
    metrics: Object.fromEntries(I.results.filter(r => r.value != null && typeof r.value === "number").map(r => [r.metric, {value: r.value, unit: r.unit, kind: r.kind, qc: r.qc, samples: r.samples, method: r.method, source: r.source, resolution: r.resolution}])),
    samples: {width_m: tr, wavelength_km: (R.reaches || []).filter(r => r.k1 > k0 && r.k0 < k1).map(r => r.lambda).filter(Number.isFinite), sinuosity: (R.reaches || []).filter(r => r.k1 > k0 && r.k0 < k1).map(r => r.sin)},
    geometry: {type: "LineString", coordinates: simp.map(p => [p[1], p[0]])}, interpretation: I.findings.filter(f => f.status === "ok").map(f => ({title: f.title, text: String(f.interpretation).replace(/<[^>]+>/g, "")})),
    status: "review required", created: new Date().toISOString(), methodVersion: METHOD_VERSION, rules: RULES_VERSION, notes: ""};
  await idbPut("analogues", rec); toast(`Saved “${rec.name}” to your analogue library`); if (G.sub === "anal") renderAnalogues(); return rec;
}
const ANMET = [["width", "Median width", "m", true], ["reach_sinuosity", "Sinuosity", "", false], ["gradient", "Gradient", "m/km", true], ["wavelength", "Meander wavelength", "km", true], ["amplitude", "Amplitude", "km", true], ["curvature", "Curvature", "rad/km", true], ["braiding", "Braiding index", "", false], ["catchment_area", "Catchment area", "km²", true], ["floodplain_width", "Floodplain width", "m", true], ["confinement", "Floodplain ÷ channel", "", true], ["concavity", "Concavity", "", false], ["length", "Length", "km", true]];
const CANDIDATES = [["Juruá", "fluvial – meandering (tight, migrating bends)"], ["Purus", "fluvial – meandering"], ["Ucayali", "fluvial – meandering (active migration)"], ["Beni", "fluvial – meandering"], ["Mississippi", "fluvial – meandering + delta (river-dominated)"], ["Sacramento River", "fluvial – meandering"], ["Amazon", "fluvial – anabranching"], ["Rio Negro", "fluvial – anabranching"], ["Brahmaputra", "fluvial – braided"], ["Waimakariri River", "fluvial – braided (gravel)"], ["Tagliamento", "fluvial – braided (gravel)"], ["Platte River", "fluvial – braided (sand)"], ["Rakaia River", "fluvial – braided (gravel)"], ["Niger", "fluvial + delta (wave- and tide-influenced)"], ["Nile", "fluvial + delta (wave-influenced, arcuate)"], ["Danube", "fluvial + delta (river/wave)"], ["Mekong", "fluvial + delta (tide/wave)"], ["Ganges", "fluvial + delta (tide-influenced)"], ["Lena", "fluvial + delta (Arctic)"], ["Po", "fluvial + delta (river/wave)"], ["Ebro", "fluvial + delta (wave-influenced)"], ["Yellow River", "fluvial + delta (river-dominated)"], ["Fly River", "fluvial + delta (tide-dominated)"], ["Rhine", "fluvial + delta (engineered)"]];
XR.an = {env: "", f: {}, target: null, w: Object.fromEntries(ANMET.map(m => [m[0], 1]))};
async function renderAnalogues(){
  const el = $("anBody"); if (!el) return; let list = []; try { list = await idbAll("analogues"); } catch(e){ el.innerHTML = `<p class="warn">The analogue library needs browser storage (IndexedDB), which is unavailable here: ${esc(e.message)}</p>`; return; }
  const A = XR.an, envs = [...new Set(list.map(r => r.environment))].sort(), val = (r, k) => r.metrics[k] ? r.metrics[k].value : null;
  const pass = r => (!A.env || r.environment === A.env) && Object.entries(A.f).every(([k, [lo, hi]]) => { const x = val(r, k); if (lo === "" && hi === "") return true; if (x == null) return false; return (lo === "" || x >= +lo) && (hi === "" || x <= +hi); });
  let shown = list.filter(pass), T = A.target && list.find(r => r.id === A.target);
  // similarity: weighted normalised distance on shared metrics (log for scale-type metrics); coverage disclosed; incompatible scales excluded
  if (T){ const sd = {}; for (const [k, , , lg] of ANMET){ const xs = list.map(r => val(r, k)).filter(x => x != null && (!lg || x > 0)).map(x => lg ? Math.log10(x) : x); if (xs.length > 1){ const m = xs.reduce((a, b) => a + b)/xs.length; sd[k] = Math.sqrt(xs.reduce((a, b) => a + (b - m)**2, 0)/xs.length) || 1; } else sd[k] = 1; }
    shown = shown.filter(r => r !== T).map(r => { let d = 0, w = 0, used = 0, avail = 0, incompatible = false;
      for (const [k, , , lg] of ANMET){ const wt = A.w[k] || 0; if (!wt) continue; const a = val(T, k), b = val(r, k); if (a == null) continue; avail++; if (b == null || (lg && (a <= 0 || b <= 0))) continue; const da = lg ? Math.log10(a) - Math.log10(b) : a - b; if (k === "width" && Math.abs(da) > 2) incompatible = true; d += wt*(da/sd[k])**2; w += wt; used++; }
      return {r, score: used ? Math.sqrt(d/w) : Infinity, used, avail, incompatible}; }).filter(x => x.used && !x.incompatible).sort((a, b) => a.score - b.score); }
  const card = (r, x) => `<div class="ancard"><div class="anh"><b>${esc(r.name)}</b><span class="qc review">${esc(r.status)}</span></div><small>${esc(r.environment)} · ${esc(r.level)} · ${esc(r.region || "")} · saved ${new Date(r.created).toLocaleDateString()}</small>
    <div class="anm">${ANMET.filter(([k]) => val(r, k) != null).slice(0, 8).map(([k, n, u]) => `<span>${n}<b>${tfmt(val(r, k))}${u ? " " + u : ""}</b></span>`).join("")}</div>
    ${x ? `<p class="note">Similarity distance ${nf(x.score, 2)} on ${x.used} of ${x.avail} metrics</p>` : ""}<div class="btns"><button class="sm" data-at="${r.id}">${A.target === r.id ? "★ Target" : "Find similar"}</button><button class="sm" data-ao="${r.id}">Open river</button><button class="sm" data-ae="${r.id}">⬇ Distributions</button><button class="sm" data-ad="${r.id}">✕</button></div></div>`;
  el.innerHTML = `<div class="anhead"><div><span class="kicker">Modern analogue library</span><h2>Quantitative depositional analogues</h2><p class="note">Records you save from analysed rivers and reaches, stored in this browser. Each keeps its geometry, metric values with units, sample distributions, sources, method version and status. Nothing is filled in that was not measured.</p></div>
    <div class="btns"><button class="sm" id="anExp">⬇ Library JSON</button><label class="sm filebtn">⇪ Import library<input type="file" id="anImp" accept=".json" hidden></label><button class="sm" id="anCsv">⬇ All distributions CSV</button><button class="sm" id="anGeo">⬇ GeoJSON</button></div></div>
    <div class="card anfilt"><div class="row"><label>Environment</label><select id="anEnv"><option value="">all</option>${envs.map(e => `<option${e === A.env ? " selected" : ""}>${esc(e)}</option>`).join("")}</select></div>
    <div class="pgrid">${ANMET.slice(0, 8).map(([k, n, u]) => `<label>${n}${u ? " (" + u + ")" : ""}<span class="rng"><input type="number" step="any" data-fl="${k}" placeholder="min" value="${A.f[k] ? A.f[k][0] : ""}"><input type="number" step="any" data-fh="${k}" placeholder="max" value="${A.f[k] ? A.f[k][1] : ""}"></span></label>`).join("")}</div>
    ${T ? `<h4>Similarity weights (target: ${esc(T.name)})</h4><div class="pgrid">${ANMET.map(([k, n]) => `<label>${n} <b>${A.w[k]}</b><input type="range" min="0" max="3" step=".5" data-aw="${k}" value="${A.w[k]}"></label>`).join("")}</div><button class="sm" id="anClr">Clear target</button>` : ""}</div>
    <p class="note">${list.length} record${list.length === 1 ? "" : "s"}; ${T ? `${shown.length} ranked by similarity to ${esc(T.name)} (records with very different widths are excluded as incompatible in scale)` : `${shown.length} match the filters`}.</p>
    <div class="ancards">${T ? card(T) + shown.map(x => card(x.r, x)).join("") : shown.map(r => card(r)).join("") || `<p class="note">No records yet. Analyse a river or reach, then open <b>Interpretation</b> and press “Save as an analogue record”.</p>`}</div>
    <h4>Candidates to analyse</h4><p class="note">Well-known modern systems often used as analogues. They are not measured until you analyse them here; their labels are descriptive only.</p><div class="chips">${CANDIDATES.map(([n, d]) => `<button class="chip" data-cand="${esc(n)}" title="${esc(d)}">${esc(n)} <small>${esc(d)}</small></button>`).join("")}</div>`;
  const q = s => el.querySelectorAll(s);
  $("anEnv").onchange = e => { A.env = e.target.value; renderAnalogues(); };
  q("[data-fl],[data-fh]").forEach(i => i.onchange = () => { const k = i.dataset.fl || i.dataset.fh, cur = A.f[k] || ["", ""]; cur[i.dataset.fl ? 0 : 1] = i.value; A.f[k] = cur; renderAnalogues(); });
  q("[data-aw]").forEach(i => i.onchange = () => { A.w[i.dataset.aw] = +i.value; renderAnalogues(); });
  q("[data-at]").forEach(b => b.onclick = () => { A.target = A.target === b.dataset.at ? null : b.dataset.at; renderAnalogues(); }); if ($("anClr")) $("anClr").onclick = () => { A.target = null; renderAnalogues(); };
  q("[data-ad]").forEach(b => b.onclick = async () => { await idbDel("analogues", b.dataset.ad); if (A.target === b.dataset.ad) A.target = null; renderAnalogues(); });
  q("[data-ao]").forEach(b => b.onclick = () => { const r = list.find(x => x.id === b.dataset.ao); if (!r) return; const [t, id] = r.source.split("/"); if (/^(relation|way)$/.test(t)){ showApp("explore"); loadRiver({osm_type: t, osm_id: +id, name: r.river, display_name: r.river, desc: r.region}).then(() => { if (r.level === "reach" && XR.river){ XR.range = {R: XR.river, k0: r.k0, k1: r.k1}; renderX(); } }).catch(e => xstatus(esc(e.message), "err")); } else toast("This record came from a drawn line or file: open the saved project instead"); });
  q("[data-ae]").forEach(b => b.onclick = () => { const r = list.find(x => x.id === b.dataset.ae); r && save(r.name.replace(/[^\w]+/g, "_") + "_distributions.csv", anCsv([r])); });
  q("[data-cand]").forEach(b => b.onclick = () => { showApp("explore"); $("xQ").value = b.dataset.cand; $("xGo").click(); });
  $("anExp").onclick = () => save("earthform_analogue_library.json", JSON.stringify({app: "Earthform Lens analogue library", version: 1, exported: new Date().toISOString(), records: list}, null, 1));
  $("anCsv").onclick = () => save("earthform_analogue_distributions.csv", anCsv(shown.map(x => x.r || x).concat(T ? [T] : [])));
  $("anGeo").onclick = () => save("earthform_analogues.geojson", JSON.stringify({type: "FeatureCollection", features: list.map(r => ({type: "Feature", properties: {id: r.id, name: r.name, environment: r.environment, level: r.level, status: r.status, ...Object.fromEntries(Object.entries(r.metrics).map(([k, m]) => [k + (m.unit ? "_" + m.unit.replace(/[^\w]+/g, "") : ""), m.value]))}, geometry: r.geometry}))}));
  $("anImp").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { const J = JSON.parse(await f.text()), recs = J.records || []; let n = 0; for (const r of recs){ if (r && r.id && r.metrics && r.geometry){ await idbPut("analogues", r); n++; } } toast(`${n} record${n === 1 ? "" : "s"} imported`); renderAnalogues(); } catch(er){ toast("Not a valid library file"); } };
}
/** one row per record × metric with P10/P50/P90, plus raw samples: ready for geomodelling tools */
function anCsv(recs){ const rows = [];
  for (const r of recs){ for (const [k, m] of Object.entries(r.metrics)){ const s = m.samples || {}; rows.push({record: r.name, record_id: r.id, environment: r.environment, level: r.level, metric: k, unit: m.unit, value: m.value, n: s.n ?? "", p10: s.p10 ?? "", p50: s.p50 ?? "", p90: s.p90 ?? "", mean: s.mean ?? "", sd: s.sd ?? "", qc: m.qc, method: m.method, source: m.source, status: r.status}); }
    for (const [k, arr] of Object.entries(r.samples || {})) arr.forEach((x, i) => rows.push({record: r.name, record_id: r.id, environment: r.environment, level: r.level, metric: "sample_" + k, unit: k.split("_").pop(), value: x, n: i + 1, status: r.status})); }
  return xcsv(rows); }

/* ---------- 5. scientific figures ---------- */
const VIRIDIS = ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"];
const vir = u => { u = clamp(u, 0, 1)*(VIRIDIS.length - 1); const i = Math.floor(u), f = u - i, a = VIRIDIS[i], b = VIRIDIS[Math.min(VIRIDIS.length - 1, i + 1)], h = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16)); const A = h(a), B = h(b); return `rgb(${A.map((x, j) => Math.round(x + (B[j] - x)*f)).join(",")})`; };
const FIGM = {elevation: ["Elevation", "m", false, (R, k) => { const pr = R.prof; return pr ? pr.zc[Math.min(pr.zc.length - 1, Math.round(k/pr.step))] : NaN; }], slope: ["Gradient", "m/km", true, (R, k) => { const pr = R.prof; return pr ? Math.max(.001, pr.s[Math.min(pr.s.length - 1, Math.round(k/pr.step))]) : NaN; }],
  sinuosity: ["Reach sinuosity", "", false, (R, k) => { const r = reachAt(R, k); return r ? r.sin : NaN; }], width: ["Mapped width", "m", true, (R, k) => { const r = reachAt(R, k); return r && r.width ? r.width.med : NaN; }], ksn: ["Steepness ksn", "", true, (R, k) => { const r = reachAt(R, k); return r ? r.ksn : NaN; }], floodplain: ["Floodplain width", "m", true, (R, k) => { const r = reachAt(R, k); return r ? r.fpW : NaN; }]};
XR.fig = {kind: "panel4", metric: "elevation"};
function svgEl(w, h, body, title){ return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>${title ? `<title>${esc(title)}</title>` : ""}${body}</svg>`; }
function niceT(lo, hi, n){ return niceTicks(lo, hi, n); }
function axisChart(x, y, w, h, o){ // compact publication-style chart into an SVG group
  const m = {l: 52, r: 10, t: 20, b: 34}, pw = w - m.l - m.r, ph = h - m.t - m.b, xs = o.series.flatMap(s => s.x).filter(Number.isFinite), ys = o.series.flatMap(s => s.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return `<g transform="translate(${x},${y})"><text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="12" fill="#888">${esc(o.empty || "no data")}</text></g>`;
  const bar = o.series.find(s2 => s2.bars), hb = bar && bar.x.length > 1 ? (bar.x[1] - bar.x[0])/2 : 0;
  const x0 = o.x0 ?? Math.min(...xs) - hb, x1 = o.x1 ?? Math.max(...xs) + hb, y0 = o.y0 ?? Math.min(...ys), y1 = o.y1 ?? Math.max(...ys), X = v => m.l + (v - x0)/((x1 - x0) || 1)*pw, Y = v => m.t + ph - (v - y0)/((y1 - y0) || 1)*ph;
  let s = `<g transform="translate(${x},${y})" font-size="10.5" fill="#222">`;
  for (const t of niceT(y0, y1, 4)){ s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e6e6e6"/><text x="${m.l - 5}" y="${Y(t) + 3.5}" text-anchor="end">${tfmt(t)}</text>`; }
  for (const t of niceT(x0, x1, 5)) s += `<text x="${X(t)}" y="${m.t + ph + 14}" text-anchor="middle">${tfmt(t)}</text><line x1="${X(t)}" x2="${X(t)}" y1="${m.t + ph}" y2="${m.t + ph + 4}" stroke="#555"/>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="#555" stroke-width=".8"/>`;
  for (const sr of o.series){ if (sr.bars){ const bw = pw/Math.max(1, sr.x.length)*.86; sr.x.forEach((v, i) => { s += `<rect x="${X(v) - bw/2}" y="${Y(sr.y[i])}" width="${bw}" height="${Math.max(0, Y(y0) - Y(sr.y[i]))}" fill="${sr.c}"/>`; }); continue; }
    if (sr.dots){ sr.x.forEach((v, i) => { if (Number.isFinite(v) && Number.isFinite(sr.y[i])) s += sr.tri ? `<path d="M${X(v)} ${Y(sr.y[i]) - 6}l5 9h-10z" fill="${sr.c}"/>` : `<circle cx="${X(v)}" cy="${Y(sr.y[i])}" r="${sr.r || 2.5}" fill="${sr.c}"/>`; }); continue; }
    let d = ""; sr.x.forEach((v, i) => { const yy = sr.y[i]; if (!Number.isFinite(v) || !Number.isFinite(yy)) return; d += (d ? "L" : "M") + X(v).toFixed(1) + " " + Y(yy).toFixed(1); }); s += `<path d="${d}" fill="none" stroke="${sr.c}" stroke-width="${sr.w || 1.6}"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ""}/>`; }
  s += `<text x="${m.l + pw/2}" y="${h - 4}" text-anchor="middle" font-size="11">${esc(o.xlab || "")}</text><text transform="translate(12 ${m.t + ph/2}) rotate(-90)" text-anchor="middle" font-size="11">${esc(o.ylab || "")}</text>`;
  if (o.legend) s += o.legend.map(([c, t], i) => `<g transform="translate(${m.l + 8},${m.t + 12 + i*14})"><rect width="14" height="3" y="-3" fill="${c}"/><text x="19" y="1">${esc(t)}</text></g>`).join("");
  return s + `</g>`;
}
function planMap(Rs, x, y, w, h, o){ // vector map of one or more rivers in a shared local projection, coloured by a metric
  const all = Rs.flatMap(({R, k0, k1}) => resampleKm(R, k0, k1, Math.max(.05, (k1 - k0)/700))), lat0 = all.reduce((s, p) => s + p[0], 0)/all.length, lon0 = all.reduce((s, p) => s + p[1], 0)/all.length;
  const P = Rs.map(({R, k0, k1}) => { const st = Math.max(.05, (k1 - k0)/700), pts = resampleKm(R, k0, k1, st); return {R, k0, k1, st, L: toLocal(pts, lat0, lon0)}; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of P) for (const q of p.L){ x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const pad = 22, sc = Math.min((w - 2*pad)/((x1 - x0) || 1), (h - 2*pad)/((y1 - y0) || 1)), ox = x + pad + ((w - 2*pad) - (x1 - x0)*sc)/2, oy = y + pad + ((h - 2*pad) - (y1 - y0)*sc)/2, T = q => [ox + (q[0] - x0)*sc, oy + (q[1] - y0)*sc];
  const geo = (R, ll) => T(toLocal([ll], lat0, lon0)[0]);
  let s = `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f8f6" stroke="#bbb" stroke-width=".8"/>`;
  const met = o.metric && FIGM[o.metric], lg = met && met[2], vals = met ? P.flatMap(p => p.L.map((_, i) => met[3](p.R, p.k0 + i*p.st))).filter(v => Number.isFinite(v) && (!lg || v > 0)) : [], T2 = v => lg ? Math.log10(v) : v;
  let lo = Infinity, hi = -Infinity; for (const v of vals){ const t = T2(v); if (t < lo) lo = t; if (t > hi) hi = t; }
  for (const p of P){ for (let i = 1; i < p.L.length; i++){ const a = T(p.L[i - 1]), b = T(p.L[i]), v = met ? met[3](p.R, p.k0 + i*p.st) : NaN, c = met && Number.isFinite(v) && (!lg || v > 0) ? vir((T2(v) - lo)/((hi - lo) || 1)) : o.col || "#1f77b4"; s += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${c}" stroke-width="${o.lw || 2.6}" stroke-linecap="round"/>`; }
    if (o.zones) for (const r of p.R.reaches || []){ if (!r.zone || r.k1 < p.k0 || r.k0 > p.k1) continue; const Q = toLocal(resampleKm(p.R, Math.max(r.k0, p.k0), Math.min(r.k1, p.k1), p.st), lat0, lon0).map(T); s += `<polyline points="${Q.map(q => q.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${ZCOL3[r.zone]}" stroke-width="7" stroke-opacity=".55" stroke-linecap="round"/>`; }
    if (o.transects) for (const r of p.R.reaches || []) for (const t of (r.width && r.width.tr) || []){ if (t.off || t.km < p.k0 || t.km > p.k1) continue; const a = geo(p.R, t.a), b = geo(p.R, t.b); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#d62728" stroke-width=".9"/>`; }
    for (const d of p.R.dams.filter(d => d.km >= p.k0 && d.km <= p.k1)){ const q = geo(p.R, pointAtKm(p.R, d.km)); s += `<rect x="${q[0] - 4}" y="${q[1] - 4}" width="8" height="8" fill="#111" transform="rotate(45 ${q[0]} ${q[1]})"/>`; }
    if (o.tribs) for (const t of p.R.tribs.filter(t => t.km >= p.k0 && t.km <= p.k1 && !t.distributary)){ const q = geo(p.R, pointAtKm(p.R, t.km)); s += `<circle cx="${q[0]}" cy="${q[1]}" r="2.4" fill="#fff" stroke="#333" stroke-width=".8"/>`; }
    if (o.knick && p.R.prof) for (const k of p.R.prof.knick.filter(k => k.km >= p.k0 && k.km <= p.k1)){ const q = geo(p.R, pointAtKm(p.R, k.km)); s += `<path d="M${q[0]} ${q[1] - 7}l5 9h-10z" fill="#ff7f0e" stroke="#fff" stroke-width=".6"/>`; }
    if (o.labels){ const q = T(p.L[0]), e = T(p.L[p.L.length - 1]), lab = (pt, t, dy) => { const right = pt[0] > x + w - 60; return `<text x="${pt[0] + (right ? -6 : 6)}" y="${pt[1] + dy}" font-size="10" fill="#333" text-anchor="${right ? "end" : "start"}">${t}</text>`; }; s += lab(q, "source", -6) + lab(e, "mouth", 14); } }
  // scale bar, north arrow, CRS note
  const kmPx = sc, len = (() => { const t = (w*.25)/kmPx, p = 10**Math.floor(Math.log10(t)); return [1, 2, 5, 10].map(k => k*p).filter(v => v <= t).pop() || p; })(), bx = x + 12, by = y + h - 14;
  s += `<rect x="${bx}" y="${by - 4}" width="${len*kmPx}" height="4" fill="#111"/><rect x="${bx + len*kmPx/2}" y="${by - 4}" width="${len*kmPx/2}" height="4" fill="#fff" stroke="#111" stroke-width=".6"/><text x="${bx}" y="${by - 8}" font-size="10">${len >= 1 ? len : len*1000} ${len >= 1 ? "km" : "m"}</text>`;
  const nx = x + w - 18, ny = y + 18; s += `<path d="M${nx} ${ny - 10}l6 16-6-4-6 4z" fill="#111"/><text x="${nx}" y="${ny + 18}" font-size="10" text-anchor="middle">N</text>`;
  s += `<text x="${x + w - 6}" y="${y + h - 4}" font-size="8" text-anchor="end" fill="#666">WGS 84, local equirectangular · ${lat0.toFixed(2)}°, ${lon0.toFixed(2)}°</text>`;
  if (met && vals.length){ const cbw = Math.min(160, w*.4), cx = x + w - cbw - 12, cy = y + h - 40; for (let i = 0; i < 40; i++) s += `<rect x="${cx + i*cbw/40}" y="${cy}" width="${cbw/40 + .5}" height="8" fill="${vir(i/39)}"/>`;
    s += `<text x="${cx}" y="${cy + 19}" font-size="9">${tfmt(lg ? 10**lo : lo)}</text><text x="${cx + cbw}" y="${cy + 19}" font-size="9" text-anchor="end">${tfmt(lg ? 10**hi : hi)}</text><text x="${cx + cbw/2}" y="${cy - 4}" font-size="9.5" text-anchor="middle">${esc(met[0])}${met[1] ? " (" + met[1] + ")" : ""}${lg ? ", log scale" : ""}</text>`; }
  return s + `</g>`;
}
async function buildFigure(){
  const R = XR.river; if (!R || !R.prof) throw new Error("load a river with its elevation profile first"); const s = selRange(), k0 = s.k0, k1 = s.k1, pr = R.prof, kind = XR.fig.kind, cap = [], W = 1000;
  const prov = `Centreline: ${/^(relation|way)/.test(R.osm) ? "OpenStreetMap contributors (ODbL), " + R.osm : R.osm}. Elevation: ${demLabel(pr, true)}, sampled every ${nf(pr.params.stepKm*1000)} m, smoothing ${nf(pr.params.smoothKm, 2)} km, conditioning ${pr.params.cond}. Generated ${new Date().toISOString().slice(0, 10)} with Earthform Lens (${METHOD_VERSION}).`;
  const i0 = Math.round(k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(k1/pr.step)), dd = pr.d.slice(i0, i1 + 1);
  if (kind === "panel4"){ let img = null, imgNote = ""; try { const c = await captureView(); img = c.canvas.toDataURL("image/jpeg", .85); imgNote = `${EX.base[XR.base].n}, ${c.mpp.toPrecision(3)} m/px at capture`; } catch(e){ imgNote = "imagery could not be embedded (" + e.message + ")"; }
    const H = 910, pw = 480, ph = 360;
    let b = `<text x="20" y="28" font-size="17" font-weight="700">${esc(R.name)}${s.whole ? "" : ` — km ${nf(k0)}–${nf(k1)}`}</text><text x="20" y="46" font-size="11" fill="#555">${esc(R.region || "")}</text>`;
    b += `<text x="20" y="72" font-size="13" font-weight="700">A</text>` + (img ? `<image href="${img}" x="20" y="78" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice"/><rect x="20" y="78" width="${pw}" height="${ph}" fill="none" stroke="#555"/>` : `<rect x="20" y="78" width="${pw}" height="${ph}" fill="#eee"/><text x="${20 + pw/2}" y="${78 + ph/2}" font-size="11" text-anchor="middle" fill="#666">${esc(imgNote)}</text>`);
    b += `<text x="${40 + pw}" y="72" font-size="13" font-weight="700">B</text>` + planMap([{R, k0, k1}], 40 + pw, 78, pw, ph, {zones: true, transects: true, tribs: true, knick: true, labels: true, col: "#1f77b4"});
    const lg = [["#e8452c", "potential source"], ["#f7b733", "transfer"], ["#4aa8ff", "storage"], ["#9b6bff", "sink"]]; b += lg.map(([c, t], i) => `<rect x="${52 + pw + i*110}" y="${78 + ph + 8}" width="12" height="8" fill="${c}" fill-opacity=".6"/><text x="${68 + pw + i*110}" y="${78 + ph + 16}" font-size="10">${t}</text>`).join("") + `<text x="${52 + pw}" y="${78 + ph + 32}" font-size="9.5" fill="#555">▲ knickpoint · ◆ dam/weir · ○ tributary junction · red: width transects</text>`;
    b += `<text x="20" y="${78 + ph + 58}" font-size="13" font-weight="700">C</text>` + axisChart(20, 78 + ph + 60, pw, 300, {xlab: "Distance from source (km)", ylab: "Elevation (m)", series: [{x: dd, y: pr.zr.slice(i0, i1 + 1), c: "#1f77b4", w: 1}, {x: dd, y: pr.zc.slice(i0, i1 + 1), c: "#ff7f0e", w: 1.8}, {x: pr.knick.filter(q => q.km >= k0 && q.km <= k1).map(q => q.km), y: pr.knick.filter(q => q.km >= k0 && q.km <= k1).map(q => q.z), c: "#d62728", dots: true, tri: true}], legend: [["#1f77b4", "raw samples"], ["#ff7f0e", `conditioned (${pr.params.cond})`], ["#d62728", "knickpoints"]]});
    const ws = (R.reaches || []).flatMap(r => (r.width && r.width.tr || []).filter(t => !t.off && t.km >= k0 && t.km <= k1).map(t => t.w)), Q = qOf(ws);
    let hd = {x: [], y: []}; if (ws.length){ const L = ws.map(v => Math.log10(v)), lo = Math.min(...L), hi = Math.max(...L), nb = 18, bw = (hi - lo)/nb || .1, h2 = new Array(nb).fill(0); L.forEach(v => h2[Math.min(nb - 1, Math.floor((v - lo)/bw))]++); hd = {x: h2.map((_, i) => 10**(lo + (i + .5)*bw)), y: h2}; }
    b += `<text x="${40 + pw}" y="${78 + ph + 58}" font-size="13" font-weight="700">D</text>` + axisChart(40 + pw, 78 + ph + 60, pw, 300, {xlab: "Mapped water-area width (m)", ylab: "Transects", y0: 0, empty: "no width transects: measure widths in Channel geometry", series: ws.length ? [{x: hd.x, y: hd.y, c: "#4c9ac9", bars: true}] : []});
    if (Q) b += `<text x="${100 + pw}" y="${78 + ph + 96}" font-size="10.5">n = ${Q.n} · P10 ${nf(Q.p10)} m · P50 ${nf(Q.p50)} m · P90 ${nf(Q.p90)} m</text>`;
    cap.push(`(A) ${imgNote}. (B) Interpretation map: potential sediment-routing zones (interpretation, not measured flux), width transects, knickpoints, dams and tributary junctions. (C) Longitudinal profile: raw elevation samples and the conditioned profile used for gradient; knickpoints with the current detection parameters (${pr.params.kRatio}× slope, ${pr.params.kDrop} m). (D) Distribution of mapped water-area widths (OSM water polygons; wetted/mapped, not bankfull).`);
    return figWrap(svgEl(W, H, b + figCaption(cap.join(" ") + " " + prov, 20, H - 92, W - 40)), H); }
  if (kind === "attr"){ const met = XR.fig.metric, systems = XR.cmp.length > 1 ? XR.cmp.map(c => ({R: c.R, k0: c.k0, k1: c.k1, label: c.label})) : [{R, k0, k1, label: R.name}];
    const n = systems.length, cols = Math.min(n, 2), rows = Math.ceil(n/cols), cw = (W - 40 - (cols - 1)*20)/cols, ch = 380, H = 70 + rows*(ch + 30) + 90;
    let b = `<text x="20" y="28" font-size="17" font-weight="700">${esc(FIGM[met][0])} along ${n > 1 ? "compared systems" : esc(R.name)}</text><text x="20" y="46" font-size="11" fill="#555">${n > 1 ? "Each panel is scaled to its own extent; colours share one scale only within a panel (see colour bars)." : esc(R.region || "")}</text>`;
    systems.forEach((sy, i) => { const cx = 20 + (i % cols)*(cw + 20), cy = 64 + Math.floor(i/cols)*(ch + 30); b += `<text x="${cx}" y="${cy + 10}" font-size="12" font-weight="600">${esc(sy.label)}</text>` + planMap([sy], cx, cy + 16, cw, ch, {metric: met, tribs: true, knick: met === "elevation" || met === "slope", labels: true}); });
    cap.push(`River centrelines coloured by ${FIGM[met][0].toLowerCase()} (perceptually ordered viridis palette). ◆ dams and weirs (barriers), ○ tributary junctions${met === "elevation" || met === "slope" ? ", ▲ knickpoints" : ""}. Values are per reach or per profile sample; grey gaps mean the value has not been measured.`);
    return figWrap(svgEl(W, H, b + figCaption(cap.join(" ") + " " + prov, 20, H - 72, W - 40)), H); }
  if (kind === "profile"){ const H = 640;
    let b = `<text x="20" y="28" font-size="17" font-weight="700">${esc(R.name)}: raw and conditioned longitudinal profile</text>`;
    const dams = R.dams.filter(d => d.km >= k0 && d.km <= k1), tr = R.tribs.filter(t => !t.distributary && t.km >= k0 && t.km <= k1), zAt = km => pr.zc[Math.min(pr.zc.length - 1, Math.round(km/pr.step))];
    b += axisChart(20, 40, W - 40, 420, {xlab: "Distance from source (km)", ylab: "Elevation (m)", series: [{x: dd, y: pr.zr.slice(i0, i1 + 1), c: "#1f77b4", w: 1}, {x: dd, y: pr.zc.slice(i0, i1 + 1), c: "#ff7f0e", w: 2}, {x: pr.knick.filter(q => q.km >= k0 && q.km <= k1).map(q => q.km), y: pr.knick.filter(q => q.km >= k0 && q.km <= k1).map(q => q.z), c: "#d62728", dots: true, tri: true}, {x: dams.map(d => d.km), y: dams.map(d => zAt(d.km)), c: "#111", dots: true, r: 4}, {x: tr.map(t => t.km), y: tr.map(t => zAt(t.km)), c: "#2ca02c", dots: true, r: 2.5}],
      legend: [["#1f77b4", "raw samples"], ["#ff7f0e", `conditioned (${pr.params.cond})`], ["#d62728", "knickpoints"], ["#111", "dams / weirs"], ["#2ca02c", "tributary junctions"]]});
    b += axisChart(20, 470, W - 40, 110, {xlab: "Distance from source (km)", ylab: "Raw − conditioned (m)", series: [{x: dd, y: dd.map((_, j) => pr.zr[i0 + j] - pr.zc[i0 + j]), c: "#9467bd", w: 1}]});
    cap.push(`Upper: raw elevation samples (min of 3×3 cells along the centreline) and the profile after ${pr.params.cond} conditioning. Lower: elevation removed by conditioning; large values flag where a low outlier may have flattened the downstream profile${pr.cond ? ` (max ${nf(pr.cond.max, 1)} m)` : ""}.`);
    return figWrap(svgEl(W, H, b + figCaption(cap.join(" ") + " " + prov, 20, H - 50, W - 40)), H); }
}
function figCaption(t, x, y, w){ const words = t.split(/\s+/), lines = []; let cur = ""; const max = Math.floor(w/5.6); for (const wd of words){ if ((cur + " " + wd).length > max){ lines.push(cur); cur = wd; } else cur = cur ? cur + " " + wd : wd; } if (cur) lines.push(cur);
  return lines.slice(0, 7).map((l, i) => `<text x="${x}" y="${y + i*12.5}" font-size="9.8" fill="#333">${esc(l)}</text>`).join(""); }
function figWrap(svg, H){ return {svg, H}; }
async function renderFigures(){
  const el = $("x4-figures"), R = XR.river; if (!el || !R) return; el.dataset.r = R.osm;
  el.innerHTML = `<div class="row"><label>Figure</label><select id="x4Fk"><option value="panel4"${XR.fig.kind === "panel4" ? " selected" : ""}>Four-panel publication figure (imagery · interpretation · profile · widths)</option><option value="attr"${XR.fig.kind === "attr" ? " selected" : ""}>River coloured by a measured attribute${XR.cmp.length > 1 ? " (compared systems side by side)" : ""}</option><option value="profile"${XR.fig.kind === "profile" ? " selected" : ""}>Raw vs conditioned profile with barriers and knickpoints</option></select>${XR.fig.kind === "attr" ? `<select id="x4Fm">${Object.entries(FIGM).map(([k, m]) => `<option value="${k}"${k === XR.fig.metric ? " selected" : ""}>${m[0]}</option>`).join("")}</select>` : ""}<button class="sm pri" id="x4Fgo">Build figure</button></div>
    <p class="note">Uses the selected stretch and the current map view (for the imagery panel). Figures are white-background, vector (SVG) with a scale bar, north arrow, legend, coordinate note and an automatic caption giving data sources, resolution, method and parameters.</p><div id="x4Fout" class="figout"></div>`;
  $("x4Fk").onchange = e => { XR.fig.kind = e.target.value; renderFigures(); }; if ($("x4Fm")) $("x4Fm").onchange = e => XR.fig.metric = e.target.value;
  $("x4Fgo").onclick = async () => { actSet("fig4", "Building the figure…"); try { const F = await buildFigure(); const o = $("x4Fout"); o.innerHTML = `<div class="figsvg">${F.svg}</div><div class="btns"><button class="sm" id="x4Fsvg">⬇ SVG (editable vector)</button><button class="sm" id="x4Fpng">⬇ PNG (300 dpi-class, 3×)</button></div>`;
      const nm = (R.name + "_" + XR.fig.kind).replace(/[^\w]+/g, "_"); $("x4Fsvg").onclick = () => save(nm + ".svg", F.svg); $("x4Fpng").onclick = () => svgToPng(F.svg, 3).then(b => save(nm + ".png", b)).catch(e => toast(e.message)); } catch(e){ toast(e.message); } finally { actEnd("fig4"); } };
}
async function svgToPng(svg, k){ const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"})); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("could not render the figure")); img.src = url; });
  const c = document.createElement("canvas"); c.width = img.width*k; c.height = img.height*k; const g = c.getContext("2d"); g.scale(k, k); g.drawImage(img, 0, 0); URL.revokeObjectURL(url); return new Promise(r => c.toBlob(r, "image/png")); }

/* ---------- 6. terrain routing in a Web Worker (keeps the map responsive) ---------- */
let hydroWorkerURL = null;
function hydroAsync(g){
  return new Promise(resolve => {
    let w; try { if (!hydroWorkerURL) hydroWorkerURL = URL.createObjectURL(new Blob([`const NB8=${JSON.stringify(NB8)},SQ2=Math.SQRT2;${hydro.toString()};onmessage=e=>{const r=hydro(e.data);const o=new Int32Array(r.order);postMessage({F:r.F,rec:r.rec,order:o,acc:r.acc,sea:r.sea},[r.F.buffer,r.rec.buffer,o.buffer,r.acc.buffer,r.sea.buffer]);};`], {type: "text/javascript"})); w = new Worker(hydroWorkerURL); }
    catch(_){ resolve(hydro(g)); return; }
    const t = setTimeout(() => { w.terminate(); resolve(hydro(g)); }, 240000);
    w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
    w.onerror = e => { clearTimeout(t); w.terminate(); e.preventDefault && e.preventDefault(); resolve(hydro(g)); };
    w.postMessage({W: g.W, H: g.H, E: g.E, cellM: g.cellM});
  });
}

/* ---------- 7. acquisition dates for archive imagery ---------- */
async function waybackAcqDate(rel, lat, lon){
  if (!rel.meta) return null;
  const d = .01, u = `${rel.meta}/identify?f=json&geometry=${encodeURIComponent(JSON.stringify({x: lon, y: lat, spatialReference: {wkid: 4326}}))}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=2&mapExtent=${lon - d},${lat - d},${lon + d},${lat + d}&imageDisplay=600,600,96&returnGeometry=false`;
  const j = await xfetchJSON(u, {}, 1, 12000), rs = (j.results || []).map(r => r.attributes || {}).filter(a => Object.keys(a).some(k => /SRC_DATE/i.test(k)));
  if (!rs.length) return null; const val = a => a[Object.keys(a).find(k => /SRC_DATE/i.test(k))], resv = a => +(a[Object.keys(a).find(k => /SRC_RES/i.test(k))] || 99);
  rs.sort((a, b) => resv(a) - resv(b)); const v = val(rs[0]), s = String(v); let dt = null;
  if (/^\d{8}$/.test(s)) dt = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; else if (/^\d{10,}$/.test(s)) dt = new Date(+s).toISOString().slice(0, 10); else if (!isNaN(Date.parse(s))) dt = new Date(s).toISOString().slice(0, 10);
  const a = rs[0], pick = re => { const k = Object.keys(a).find(k2 => re.test(k2)); return k ? a[k] : null; };
  return dt ? {date: dt, res: pick(/SRC_RES/i), acc: pick(/SRC_ACC/i), src: pick(/NICE_NAME|SRC_DESC/i)} : null;
}

/* ---------- 8. self-test with synthetic geometry of known answer ---------- */
async function runSelfTest(){
  const T = [], ok = (name, got, exp, tol, unit, kind) => { const err = exp === 0 ? Math.abs(got) : Math.abs(got - exp)/Math.abs(exp); T.push({name, got, exp, tol, unit, pass: Number.isFinite(got) && err <= tol, err, kind: kind || "relative"}); };
  const mk = pts => { const R = {name: "synthetic", osm: "draw:test", main: pts, cum: withCum(pts), side: [], tribs: [], dams: [], reaches: null}; R.L = R.cum[R.cum.length - 1]; return R; };
  // 1. straight line 100 km due north
  { const lat0 = 10, pts = []; const dlat = 100/(R_E*D2R); for (let i = 0; i <= 1000; i++) pts.push([lat0 + dlat*i/1000, 20]); const R = mk(pts); ok("Straight channel length (100 km)", R.L, 100, .01, "km"); ok("Straight channel sinuosity (1.000)", reachStats(R, 0, R.L, 0).sin, 1, .02, ""); }
  // 2. sine-generated meanders: wavelength 5 km, amplitude 1 km over 50 km valley
  { const lat0 = 0, lon0 = 30, kx = Math.cos(lat0*D2R)*R_E*D2R, ky = R_E*D2R, pts = [], N = 20000, Lv = 50, lam = 5, A = 1; for (let i = 0; i <= N; i++){ const x = Lv*i/N, y = A*Math.sin(2*Math.PI*x/lam); pts.push([lat0 + y/ky, lon0 + x/kx]); }
    let tl = 0; for (let i = 1; i <= N; i++){ const x0 = Lv*(i - 1)/N, x1 = Lv*i/N; tl += Math.hypot(x1 - x0, A*(Math.sin(2*Math.PI*x1/lam) - Math.sin(2*Math.PI*x0/lam))); }
    const R = mk(pts), st = reachStats(R, 0, R.L, 0); ok("Sine channel length (analytic)", R.L, tl, .01, "km"); ok("Sine channel sinuosity", st.sin, tl/Lv, .02, ""); ok("Meander wavelength (5 km)", st.lambda, lam, .05, "km");
    R.reaches = [{...st, i: 0}]; geomExtras(R, R.reaches[0]); ok("Meander amplitude (2 km peak-to-peak)", R.reaches[0].amp, 2*A, .05, "km"); }
  // 3. catchment area on a synthetic tilted valley with closed walls and one outlet
  { const W = 120, H = 120, E = new Float32Array(W*H), cell = 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1; E[y*W + x] = edge ? 5000 : 100 + 2*Math.abs(x - W/2) + (H - y)*1; }
    const out = (H - 1)*W + W/2; E[out] = 0; const g = {W, H, E, cellM: new Float32Array(H).fill(cell)}, hy = await hydroAsync(g), interior = (W - 2)*(H - 2)*(cell/1000)**2;
    ok("Catchment area of a closed synthetic valley (Web Worker routing)", hy.acc[out], interior, .01, "km²"); }
  // 4. repeatability
  { const pts = []; for (let i = 0; i <= 3000; i++) pts.push([.01*Math.sin(i/90), i/3000]); const R = mk(pts), a = reachStats(R, 0, R.L, 0), b = reachStats(R, 0, R.L, 0); T.push({name: "Repeatability (identical inputs → identical outputs)", got: a.sin === b.sin && a.lambda === b.lambda ? 1 : 0, exp: 1, pass: a.sin === b.sin && (a.lambda === b.lambda || (isNaN(a.lambda) && isNaN(b.lambda))), err: 0, unit: "", kind: "exact"}); }
  // 5. export integrity: every result has a unit field and a method or a hint
  { const pts = []; for (let i = 0; i <= 500; i++) pts.push([45 + i/5000, 10 + .002*Math.sin(i/20)]); const R = mk(pts); buildReaches(R); const rs = resultSet(R), bad = rs.filter(r => r.unit === undefined || !(r.method || r.hint || r.value == null)); T.push({name: "Export integrity (units and method on every result)", got: rs.length - bad.length, exp: rs.length, pass: !bad.length, err: bad.length, unit: "results", kind: "count"}); }
  return T;
}
async function showSelfTest(){
  const el = $("x4Self"); if (!el) return; el.innerHTML = `<p class="note shimmer">Running synthetic tests…</p>`; actSet("self", "Running synthetic self-tests…");
  try { const T = await runSelfTest(), np = T.filter(t => t.pass).length;
    el.innerHTML = `<p class="${np === T.length ? "note" : "warn"}">${np} of ${T.length} synthetic tests passed. These check the geometry, routing and export code against shapes with known answers; they do not validate real-world accuracy, which depends on the data sources.</p><div class="scroll"><table class="grid"><tr><th>Test</th><th>result</th><th>expected</th><th>error</th><th>tolerance</th><th></th></tr>${T.map(t => `<tr><td>${esc(t.name)}</td><td>${tfmt(t.got)} ${esc(t.unit)}</td><td>${tfmt(t.exp)} ${esc(t.unit)}</td><td>${t.kind === "relative" ? nf(t.err*100, 2) + "%" : tfmt(t.err)}</td><td>${t.tol != null ? nf(t.tol*100) + "%" : "exact"}</td><td><span class="qc ${t.pass ? "ok" : "missing"}">${t.pass ? "pass" : "fail"}</span></td></tr>`).join("")}</table></div>`;
    XR.selfTest = {when: new Date().toISOString(), tests: T};
  } catch(e){ el.innerHTML = `<p class="warn">Self-test failed to run: ${esc(e.message)}</p>`; } finally { actEnd("self"); }
}

/* ---------- panel hooks ---------- */
function renderModules4(){ try { if (XR.tab === "interp") renderInterp(); } catch(e){ console.error(e); } try { if (XR.tab === "width") renderWidthTab(); } catch(e){ console.error(e); } try { const fe = $("x4-figures"); if (XR.tab === "figures" && fe && (!$("x4Fout") || fe.dataset.r !== XR.river.osm)) renderFigures(); } catch(e){ console.error(e); }
  const d = $("x4-data"); if (d && !d.dataset.on){ d.dataset.on = 1; d.innerHTML = `<h4>Validation</h4><div class="btns"><button class="sm" id="x4SelfGo">Run synthetic self-test</button><button class="sm" id="x4Cache">Clear cached map data</button></div><div id="x4Self"></div>`; $("x4SelfGo").onclick = showSelfTest; $("x4Cache").onclick = clearCache; } }

/** analysis presets: one action instead of visiting each module */
async function runLevel(level){
  const R = XR.river; if (!R) return; const s = selRange(), rs = (R.reaches || []).filter(r => r.k1 > s.k0 && r.k0 < s.k1 && !r.width);
  if (rs.length){ xstatus(`Standard analysis: measuring channel widths on ${rs.length} reach${rs.length > 1 ? "es" : ""}…`, "busy"); try { await runWidth(rs); } catch(e){ console.warn(e); } }
  if (!R.basin && /^(relation|way)\//.test(R.osm)){ try { await runBasin(R); } catch(e){ console.warn(e); xstatus("Catchment: " + esc(e.message), "err"); } }
  if (level === "detailed"){ try { XR.fpH = XR.fpH || 5; await runFloodplain(R, s.k0, s.k1); } catch(e){ console.warn(e); } try { await loadOxbows(R); } catch(e){ console.warn(e); } }
  renderX(); showXTab("interp"); xstatus(`${level === "detailed" ? "Detailed" : "Standard"} analysis finished: interpretation updated.`, "ok");
}
window.__selfTest = runSelfTest;
