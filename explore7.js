
/* ===================== Earthform Lens — map controls, journal-quality export, trace editor, data sources ===================== */

/* ---------- 1. data sources: choice, recommendations, sampling ---------- */
EX.openmeteo = "https://api.open-meteo.com/v1/elevation";
const SRC_KEY = "efl.src";
XR.src = Object.assign({dem: "auto", water: "osm", autoW: true}, (() => { try { return JSON.parse(localStorage.getItem(SRC_KEY)) || {}; } catch(_){ return {}; } })());
if (XR.src.dem === "user") XR.src.dem = "auto"; // a user DEM is not kept between visits
function srcSave(){ try { localStorage.setItem(SRC_KEY, JSON.stringify(XR.src)); } catch(_){} }
const DEMSRC = {
  auto: {n: "AWS Terrain Tiles — automatic detail", res: "≈ 40–300 m sampling (zoom 9–12, chosen from the river's length)", cover: "Global land and sea floor", date: "Mosaic: SRTM (2000), GMTED, ETOPO1, national DEMs (e.g. USGS 3DEP)",
    pro: "Fast, global, no limits; same source as catchment and floodplain analysis", con: "Mixed sources and dates; SRTM is a radar surface model (tree canopy and buildings raise it); voids cause spikes"},
  hi: {n: "AWS Terrain Tiles — high detail", res: "4× finer sampling than automatic (up to zoom 14)", cover: "Global", date: "As above",
    pro: "Resolves short, steep steps on small rivers; finer where national lidar is in the mosaic (USA, parts of Europe)", con: "Up to 16× more tiles, so slower; outside lidar areas the underlying data is still ≈30 m, so detail gains are small"},
  glo90: {n: "Copernicus DEM GLO-90 (via Open-Meteo)", res: "90 m grid, read at every profile sample", cover: "Global land", date: "TanDEM-X, 2011–2015; one consistent product",
    pro: "One consistent DEM everywhere (no mosaic seams); good for comparing rivers on different continents; a strong second opinion", con: "Digital surface model (canopy, buildings); daily request limits on the free service; not used for catchment routing"},
  user: {n: "Your own DEM (GeoTIFF)", res: "Native resolution of your file", cover: "Your file's extent", date: "Your file",
    pro: "Best accuracy where you have lidar or a national DEM; stays in your browser", con: "Must be lat/lon (EPSG:4326) or WGS 84 UTM; parts of the river outside the file fall back to terrain tiles"},
};
const WATSRC = {
  osm: {n: "OpenStreetMap water areas", res: "Mapped boundaries, rasterised at 4–50 m", date: "Undated, mixed origin", pro: "Global, fast, includes bars and islands where mapped", con: "Coverage varies; narrow rivers are often mapped only as lines, so no width there"},
  user: {n: "Your water polygons (GeoJSON)", res: "As digitised", date: "Your date", pro: "Dated, checked boundaries for publication or change through time", con: "You need to digitise or export them (e.g. from QGIS or Google Earth Engine)"},
};
const BASENOTE = {imagery: ["Esri World Imagery", "≈0.3–1 m in most places; mixed dates (use Changes over time for dated Wayback captures)"], topo: ["Esri Topographic", "Cartographic context"], osm: ["OpenStreetMap", "Mapped features; shows what the trace is built from"], plain: ["Plain white", "Cleanest for figures"], s2: ["Sentinel-2 cloudless (EOX)", "10 m, one cloud-free mosaic per year 2016–2023: consistent colours, good for comparisons"]};
function demRecommend(R){
  if (XR.userDem && R && demCoverage(XR.userDem, R) > .5) return ["user", "your DEM covers most of this river and is likely the most accurate"];
  if (R && R.L < 120) return ["hi", `short river (${km(R.L)}): finer sampling resolves channel-scale steps`];
  if (R && R.L > 1500) return ["auto", "long river: automatic detail keeps loading fast; cross-check with Copernicus GLO-90 for a consistent second profile"];
  return ["auto", "fast and global; cross-check with Copernicus GLO-90 before publishing slopes or knickpoints"];
}
function demLabel(pr, withRes, long){
  if (!pr) return "–"; if (pr.user) return long ? "Elevations supplied in your GeoJSON" : "elevations supplied with the line";
  const s = pr.src || {};
  if (s.key === "glo90") return "Copernicus DEM GLO-90 via Open-Meteo" + (withRes ? " (90 m)" : "");
  if (s.key === "user") return `your DEM “${s.n}”` + (withRes ? ` (≈${nf(s.res)} m)` : "") + (s.part ? `, terrain tiles where it has no data (${nf(100*s.part, 0)} % of samples)` : "");
  return (long ? "AWS Terrain Tiles (Mapzen terrarium; SRTM / GMTED / ETOPO and others), zoom " : "AWS Terrain Tiles z") + pr.z + (s.key === "hi" ? " (high detail)" : "") + (withRes && pr.res ? ` (≈${nf(pr.res)} m)` : "");
}
/** fill zr (raw elevation per sample) from the chosen source; returns the number of samples without data */
async function sampleElev(R, pts, z, need, zr){
  const n = pts.length, src0 = XR.srcOverride || XR.src.dem, src = src0 === "user" && !XR.userDem ? "auto" : src0; R.demSrc = {key: src};
  const prog = (t, f) => actSet("elev", t, f);
  try {
    let todo = null;
    if (src === "user" && XR.userDem){ const D = XR.userDem; todo = []; for (let i = 0; i < n; i++){ const v = demAtUser(D, pts[i]); zr[i] = v; if (!Number.isFinite(v)) todo.push(i); } R.demSrc = {key: "user", n: D.name, res: D.res, part: todo.length/n}; if (!todo.length) return 0; }
    if (src === "glo90"){ try { await sampleOpenMeteo(pts, zr, prog); R.demSrc = {key: "glo90"}; return Array.from(zr).filter(v => !Number.isFinite(v)).length; } catch(e){ console.warn(e); toast("Copernicus GLO-90 unavailable (" + e.message + "): using terrain tiles", 4000); R.demSrc = {key: "auto", fallback: "glo90"}; } }
    const zz = src === "hi" ? Math.min(14, z + 2) : z; if (zz !== z) R.demSrc.z = zz;
    const idx = todo || Array.from({length: n}, (_, i) => i), nd = new Map();
    for (const i of idx){ const p = pts[i], X = lon2x(p[1], zz), Y = lat2y(p[0], zz), k = Math.floor(X/256) + "/" + Math.floor(Y/256); (nd.get(k) || nd.set(k, []).get(k)).push([i, X, Y]); }
    const keys = [...nd.keys()]; let done = 0, failed = 0, at = 0;
    const worker = async () => { while (at < keys.length){ const k = keys[at++], [tx, ty] = k.split("/").map(Number), e = await demTile(zz, tx, ty); done++;
      for (const [i, X, Y] of nd.get(k)){ if (!e){ zr[i] = NaN; failed++; continue; } const px = Math.floor(X - tx*256), py = Math.floor(Y - ty*256); let m = Infinity; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const xx = clamp(px + dx, 0, 255), yy = clamp(py + dy, 0, 255); m = Math.min(m, e[yy*256 + xx]); } zr[i] = m; }
      if (done % 4 === 0 || done === keys.length) prog(`Reading elevation (${zz === z ? "terrain tiles" : "high detail"}): ${Math.round(done/keys.length*100)}%`, done/keys.length); } };
    await Promise.all(Array.from({length: Math.min(16, keys.length)}, worker));
    return failed;
  } finally { actEnd("elev"); }
}
async function sampleOpenMeteo(pts, zr, prog){
  const B = 100, batches = []; for (let i = 0; i < pts.length; i += B) batches.push(i); let done = 0, at = 0;
  const worker = async () => { while (at < batches.length){ const i0 = batches[at++], P = pts.slice(i0, i0 + B);
    const url = `${EX.openmeteo}?latitude=${P.map(p => p[0].toFixed(5)).join(",")}&longitude=${P.map(p => p[1].toFixed(5)).join(",")}`;
    const j = await xfetchJSON(url, {}, 3, 20000); if (!j || !Array.isArray(j.elevation)) throw new Error(j && j.reason ? j.reason : "no elevation in the answer");
    j.elevation.forEach((v, k) => { zr[i0 + k] = Number.isFinite(v) && v > -1000 ? v : NaN; }); done++; prog(`Reading Copernicus GLO-90: ${Math.round(done/batches.length*100)}%`, done/batches.length); } };
  await Promise.all([worker(), worker(), worker()]);
}
{ const _lp = loadProfile; loadProfile = async function(R, zoom, quiet){ const p = await _lp(R, zoom, quiet); if (p && R.demSrc && !R.zUser){ p.src = R.demSrc; if (R.demSrc.z) p.z = R.demSrc.z; } return p; }; }

/* your own DEM: GeoTIFF in lat/lon or WGS 84 UTM */
function utmFwd(lat, lon, zone){
  const a = 6378137, f = 1/298.257223563, k0 = .9996, e2 = f*(2 - f), ep2 = e2/(1 - e2), l0 = ((zone - 1)*6 - 180 + 3)*D2R, p = lat*D2R, l = lon*D2R;
  const N = a/Math.sqrt(1 - e2*Math.sin(p)**2), T = Math.tan(p)**2, C = ep2*Math.cos(p)**2, A = Math.cos(p)*(l - l0);
  const M = a*((1 - e2/4 - 3*e2*e2/64 - 5*e2**3/256)*p - (3*e2/8 + 3*e2*e2/32 + 45*e2**3/1024)*Math.sin(2*p) + (15*e2*e2/256 + 45*e2**3/1024)*Math.sin(4*p) - (35*e2**3/3072)*Math.sin(6*p));
  const x = k0*N*(A + (1 - T + C)*A**3/6 + (5 - 18*T + T*T + 72*C - 58*ep2)*A**5/120) + 500000;
  let y = k0*(M + N*Math.tan(p)*(A*A/2 + (5 - T + 9*C + 4*C*C)*A**4/24 + (61 - 58*T + T*T + 600*C - 330*ep2)*A**6/720)); if (lat < 0) y += 1e7; return [x, y];
}
async function loadUserDem(file){
  const T = await readTIFF(await file.arrayBuffer()), g = T.geo || {};
  if (T.spp !== 1) throw new Error("this GeoTIFF has several bands; an elevation model has one");
  if (!g.scale || !g.tie) throw new Error("no georeferencing (tie point and pixel size) in the file");
  const epsg = +g.epsg || 0, utm = epsg >= 32601 && epsg <= 32660 ? {zone: epsg - 32600, south: false} : epsg >= 32701 && epsg <= 32760 ? {zone: epsg - 32700, south: true} : null;
  if (!g.geographic && !utm) throw new Error(`coordinate system EPSG:${epsg || "unknown"} is not supported: reproject to lat/lon (EPSG:4326) or WGS 84 UTM first (QGIS: Raster → Projections → Warp)`);
  const D = {name: file.name, W: T.width, H: T.height, z: T.bands[0], x0: g.tie[3], y0: g.tie[4], sx: g.scale[0], sy: g.scale[1], geo: !!g.geographic, utm};
  D.res = D.geo ? D.sx*111320*Math.cos(((D.y0 - D.sy*D.H/2))*D2R) : D.sx; XR.userDem = D; return D;
}
function demAtUser(D, p){
  let X, Y; if (D.geo){ X = (p[1] - D.x0)/D.sx; Y = (D.y0 - p[0])/D.sy; } else { const [e, nn] = utmFwd(p[0], p[1], D.utm.zone); X = (e - D.x0)/D.sx; Y = (D.y0 - (D.utm.south ? nn : nn - (p[0] < 0 ? 1e7 : 0)))/D.sy; }
  const px = Math.floor(X), py = Math.floor(Y); if (px < 0 || py < 0 || px >= D.W || py >= D.H) return NaN;
  let m = Infinity; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const xx = clamp(px + dx, 0, D.W - 1), yy = clamp(py + dy, 0, D.H - 1), v = D.z[yy*D.W + xx]; if (Number.isFinite(v)) m = Math.min(m, v); }
  return Number.isFinite(m) ? m : NaN;
}
function demCoverage(D, R){ const st = Math.max(1, Math.floor(R.main.length/300)); let a = 0, b = 0; for (let i = 0; i < R.main.length; i += st){ b++; if (Number.isFinite(demAtUser(D, R.main[i]))) a++; } return b ? a/b : 0; }

/** a second elevation source along the same samples: bias, spread and differences in fall and gradient */
async function crossCheckDem(R, key){
  const pr = R.prof; if (!pr) throw new Error("load the profile first");
  const pts = Array.from(pr.d, k => pointAtKm(R, k)), zr = new Float64Array(pts.length).fill(NaN), z = pr.z, save = R.demSrc;
  XR.srcOverride = key; try { await sampleElev(R, pts, key === "hi" ? z : Math.min(z, 12), null, zr); } finally { XR.srcOverride = null; R.demSrc = save; }
  const dz = [], a = pr.zs || pr.zr; for (let i = 0; i < zr.length; i++) if (Number.isFinite(zr[i]) && Number.isFinite(a[i])) dz.push(zr[i] - a[i]);
  if (dz.length < 10) throw new Error("the second source returned too few values");
  const med = median(dz), mad = 1.4826*median(dz.map(v => Math.abs(v - med))), rms = Math.sqrt(dz.reduce((s, v) => s + v*v, 0)/dz.length);
  const first = Array.from(zr).find(Number.isFinite), last = [...zr].reverse().find(Number.isFinite), fall = first - last;
  pr.alt = {key, label: DEMSRC[key].n, z: Array.from(zr), n: dz.length, bias: med, sd: mad, rms, fall, fallMain: pr.drop, grad: fall/R.L, made: new Date().toISOString()};
  return pr.alt;
}
function altHTML(pr){ const a = pr && pr.alt; if (!a) return ""; const dF = a.fall - a.fallMain;
  return `<div class="card x7alt"><b>Cross-check: ${esc(a.label)}</b><div class="kv"><div><span>Samples compared</span><b>${a.n}</b></div><div><span>Median difference (second − first)</span><b>${nf(a.bias, 1)} m</b></div><div><span>Robust spread of differences</span><b>${nf(a.sd, 1)} m</b></div><div><span>RMS difference</span><b>${nf(a.rms, 1)} m</b></div><div><span>Total fall: first / second</span><b>${nf(a.fallMain)} / ${nf(a.fall)} m (${dF >= 0 ? "+" : ""}${nf(dF)} m)</b></div></div>
  <p class="note">${Math.abs(dF) > .1*Math.max(1, a.fallMain) ? "The two sources disagree on the total fall by more than 10 %: treat slopes and knickpoints as uncertain and check against a third source or field data." : "The two sources agree on the total fall within 10 %."} A constant offset is expected (different vertical datums and surface models); the spread is what matters for slopes. The second profile is drawn dashed in the clean view.</p></div>`; }

function openSources(){
  const R = XR.river, [rk, why] = demRecommend(R), cur = XR.src.dem, bases = Object.keys(EX.base);
  const opt = (k, o, sel, name, rec) => `<label class="x7opt${sel ? " on" : ""}"><input type="radio" name="${name}" value="${k}"${sel ? " checked" : ""}${k === "user" && name === "dem" && !XR.userDem ? " disabled" : ""}><div><b>${esc(o.n)}${rec ? ` <span class="x7rec">Recommended</span>` : ""}</b><small>${esc(o.res)} · ${esc(o.date)}</small><small class="pro">＋ ${esc(o.pro)}</small><small class="con">− ${esc(o.con)}</small></div></label>`;
  modal(`<h3>Data sources</h3><p class="note">Every result records which source it came from. Pick a source for each kind of data; the recommendation depends on the river you have loaded${R ? ` (<b>${esc(R.name)}</b>, ${km(R.L)})` : ""}.</p>
    <h4>Elevation</h4>${Object.entries(DEMSRC).map(([k, o]) => opt(k, o, cur === k, "dem", rk === k)).join("")}
    <p class="note x7why">Why: ${esc(why)}.</p>
    <div class="btns"><label class="sm filebtn">⇪ Load your DEM (GeoTIFF)<input type="file" id="x7Dem" accept=".tif,.tiff,image/tiff" hidden></label>${R && R.prof ? `<button class="sm" id="x7Cross">Cross-check with a second source</button>` : ""}</div><div id="x7DemMsg">${XR.userDem ? `<p class="note">Loaded: ${esc(XR.userDem.name)}, ${XR.userDem.W}×${XR.userDem.H} cells, ≈${nf(XR.userDem.res)} m${R ? `, covers ${nf(100*demCoverage(XR.userDem, R), 0)} % of this river` : ""}.</p>` : ""}</div>
    <h4>Water boundaries (channel width)</h4>${Object.entries(WATSRC).map(([k, o]) => opt(k, o, XR.src.water === k, "wat", k === (XR.userWater ? "user" : "osm"))).join("")}
    <div class="btns"><label class="sm filebtn">⇪ Load water polygons (GeoJSON)<input type="file" id="x7Wat" accept=".json,.geojson" hidden></label></div><div id="x7WatMsg">${XR.userWater ? `<p class="note">Loaded ${XR.userWater.length} polygons.</p>` : ""}</div>
    <p class="note">JRC Global Surface Water is available as a map overlay only: its public tiles are coloured pictures, not measurements, so widths are not measured from them.</p>
    <label class="chk"><input type="checkbox" id="x7AutoW"${XR.src.autoW ? " checked" : ""}> Measure channel width automatically after each river loads</label>
    <h4>River centreline</h4><p class="note">OpenStreetMap (search) by default. You can also open your own line (GeoJSON, KML or GPX), draw one, or correct the traced line with <b>Edit trace</b> when parts are missing or wrong.</p>
    <div class="btns"><label class="sm filebtn">⇪ Open KML / GPX line<input type="file" id="x7Line" accept=".kml,.gpx,.xml" hidden></label></div>
    <h4>Satellite and base maps</h4><div class="x7bases">${bases.map(k => { const b = BASENOTE[k] || [EX.base[k].n, ""]; return `<label class="x7opt${XR.base === k ? " on" : ""}"><input type="radio" name="base" value="${k}"${XR.base === k ? " checked" : ""}><div><b>${esc(EX.base[k].n || b[0])}</b><small>${esc(b[1])}</small></div></label>`; }).join("")}</div>
    <div class="btns"><button class="pri" id="x7Apply">Apply${R ? " and re-read elevation" : ""}</button><button id="x7Close">Close</button></div>`);
  $("x7Close").onclick = closeModal;
  $("x7Dem").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const m = $("x7DemMsg"); m.innerHTML = `<p class="note shimmer">Reading ${esc(f.name)}…</p>`; try { const D = await loadUserDem(f); m.innerHTML = `<p class="note">Loaded ${esc(f.name)}: ${D.W}×${D.H} cells, ≈${nf(D.res)} m${R ? `, covers ${nf(100*demCoverage(D, R), 0)} % of this river` : ""}. Choose “Your own DEM” and press Apply.</p>`; const r = document.querySelector('input[name="dem"][value="user"]'); if (r){ r.disabled = false; r.checked = true; } } catch(err){ m.innerHTML = `<p class="warn">${esc(err.message)}</p>`; } };
  $("x7Wat").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { const j = JSON.parse(await f.text()), P = []; for (const ft of (j.features || [j])){ const g = ft.geometry || ft; const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; for (const pg of polys) P.push({bar: !!(ft.properties && /bar|sand|shoal/i.test(JSON.stringify(ft.properties))), rings: pg.map(r => r.map(c => [c[1], c[0]]))}); }
      if (!P.length) throw new Error("no polygons in the file"); XR.userWater = P; $("x7WatMsg").innerHTML = `<p class="note">Loaded ${P.length} polygons from ${esc(f.name)}.</p>`; const r = document.querySelector('input[name="wat"][value="user"]'); if (r) r.checked = true; } catch(err){ $("x7WatMsg").innerHTML = `<p class="warn">${esc(err.message)}</p>`; } };
  $("x7Line").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f){ closeModal(); importLineFile(f); } };
  if ($("x7Cross")) $("x7Cross").onclick = async () => { const k = XR.src.dem === "glo90" ? "auto" : "glo90"; const b = $("x7Cross"); b.disabled = true; b.textContent = "Reading the second source…"; try { await crossCheckDem(R, k); closeModal(); renderX(); showXTab("profile"); xstatus(`Cross-check with ${DEMSRC[k].n}: median difference ${nf(R.prof.alt.bias, 1)} m, spread ${nf(R.prof.alt.sd, 1)} m. See the Profile tab.`, "ok"); } catch(err){ b.disabled = false; b.textContent = "Cross-check with a second source"; toast(err.message, 4000); } };
  $("x7Apply").onclick = async () => { const v = n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value; const dem = v("dem"), wat = v("wat"), base = v("base"), changed = dem !== XR.src.dem, wChanged = wat !== XR.src.water;
    XR.src.dem = dem || "auto"; XR.src.water = wat || "osm"; XR.src.autoW = $("x7AutoW").checked; srcSave(); if (base && base !== XR.base){ XR.base = base; const sb = $("xBase"); if (sb) sb.value = base; xmap && xmap.req(); } closeModal();
    if (R && (changed || !R.prof)){ xstatus(`Re-reading elevation from ${DEMSRC[XR.src.dem].n}…`, "busy"); try { await loadProfile(R); buildReaches(R); renderX(); xstatus(`Elevation now from ${demLabel(R.prof, true)}: fall ${nf(R.prof.drop)} m.`, "ok"); } catch(err){ xstatus("Elevation: " + esc(err.message), "err"); } }
    if (R && wChanged){ for (const r of R.reaches || []) r.width = null; autoWidth(R, XR.loadTok, true); } };
}
/* KML and GPX lines become a GeoJSON-style river */
async function importLineFile(f){
  try { const t = await f.text(), doc = new DOMParser().parseFromString(t, "application/xml"); let pts = [];
    if (/\.gpx$/i.test(f.name) || doc.querySelector("gpx")){ pts = [...doc.querySelectorAll("trkpt, rtept")].map(e => [+e.getAttribute("lat"), +e.getAttribute("lon"), e.querySelector("ele") ? +e.querySelector("ele").textContent : NaN]); }
    else { const cs = [...doc.getElementsByTagName("coordinates")].map(c => c.textContent.trim().split(/\s+/).map(q => q.split(",").map(Number))).sort((a, b) => b.length - a.length)[0] || []; pts = cs.map(c => [c[1], c[0], c[2]]); }
    pts = pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])); if (pts.length < 2) throw new Error("no line found in the file");
    const hasZ = pts.filter(p => Number.isFinite(p[2]) && p[2] !== 0).length > pts.length*.8, gj = {type: "Feature", properties: {name: f.name.replace(/\.(kml|gpx|xml)$/i, "")}, geometry: {type: "LineString", coordinates: pts.map(p => hasZ ? [p[1], p[0], p[2]] : [p[1], p[0]])}};
    await importGeoJSON(new File([JSON.stringify(gj)], f.name.replace(/\.(kml|gpx|xml)$/i, "") + ".geojson"), false);
  } catch(e){ xstatus("Line file: " + esc(e.message), "err"); }
}
/* width can use your own polygons */
/* speed: water areas are fetched once for a block of neighbouring reaches (up to ~60 × 60 km or 400 km of river) and reused,
   instead of one OpenStreetMap request per reach; concurrent reaches wait for the same request */
XR.wcache = new Map();
function reachBB(R, k0, k1, pad){ const pts = resampleKm(R, k0, k1, Math.max(.05, (k1 - k0)/200)); let s = 90, n = -90, w = 180, e = -180; for (const p of pts){ s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); } return [s - pad, w - pad, n + pad, e + pad]; }
const bbIn = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3], bbArea = b => (b[2] - b[0])*(b[3] - b[1])*Math.cos((b[0] + b[2])/2*D2R);
function waterChunkFetch(R, hit){
  if (hit.p) return hit.p; const line = resampleKm(R, Math.max(0, hit.k0 - 2), Math.min(R.L, hit.k1 + 2), Math.max(.5, (hit.k1 - hit.k0)/160)), ar = `around:3000,${line.map(p => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(",")}`;
  const q = `[out:json][timeout:180];(way["natural"="water"](${ar});way["waterway"="riverbank"](${ar});relation["natural"="water"](${ar});relation["waterway"="riverbank"](${ar});way["natural"~"^(shoal|sand)$"](${ar});relation["natural"~"^(shoal|sand)$"](${ar});way["wetland"="tidalflat"](${ar}););out geom;`;
  hit.p = overpass(q).then(d => (d.elements || []).map(el => ({bar: !!(el.tags && (/^(shoal|sand)$/.test(el.tags.natural || "") || el.tags.wetland === "tidalflat")), rings: el.type === "way" && el.geometry ? [el.geometry.map(p => [p.lat, p.lon])] : (el.members || []).filter(m => m.geometry && m.geometry.length > 2).map(m => m.geometry.map(p => [p.lat, p.lon]))})).filter(p => p.rings.length).map(p => { let a2 = 90, b2 = -90, c2 = 180, d2 = -180; for (const rg of p.rings) for (const q2 of rg){ a2 = Math.min(a2, q2[0]); b2 = Math.max(b2, q2[0]); c2 = Math.min(c2, q2[1]); d2 = Math.max(d2, q2[1]); } p.bbx = [a2, c2, b2, d2]; return p; }));
  hit.p.catch(() => { hit.p = null; }); return hit.p;
}
async function waterPolys(R, k0, k1){
  const key = R.osm + "|" + R.L.toFixed(3) + "|" + (R.reaches || []).length; let C = XR.wcache.get(key);
  if (!C){ // plan corridor blocks of whole reaches, about 300 km each (one request per block instead of one per reach)
    C = []; let a = 0, acc = 0; const rs = (R.reaches || []).slice().sort((x, y) => x.k0 - y.k0); rs.forEach((r, i) => { acc = r.k1 - a; if (acc >= 300 || i === rs.length - 1){ C.push({k0: a, k1: r.k1}); a = r.k1; } }); XR.wcache.set(key, C); }
  let i = C.findIndex(c => k0 >= c.k0 - 1e-6 && k1 <= c.k1 + 1e-6);
  if (i < 0){ C.push({k0, k1: Math.max(k1, Math.min(R.L, k0 + 300))}); i = C.length - 1; }
  const p = waterChunkFetch(R, C[i]); if (C[i + 1] && C[i + 1].k0 >= C[i].k1 - 1e-6) waterChunkFetch(R, C[i + 1]); // fetch the next block while this one is measured
  const need = reachBB(R, k0, k1, .025), polys = await p; return polys.filter(q => q.bbx[2] >= need[0] && q.bbx[0] <= need[2] && q.bbx[3] >= need[1] && q.bbx[1] <= need[3]);
}
{ const _wr = waterRaster; waterRaster = async function(R, k0, k1, extra){ if (!extra && XR.src.water === "user" && XR.userWater) return _wr(R, k0, k1, {polys: XR.userWater}); if (!extra && R && R.osm && !String(R.osm).startsWith("net")) return _wr(R, k0, k1, {polys: await waterPolys(R, k0, k1)}); return _wr(R, k0, k1, extra); }; }

/* ---------- 2. channel width runs with the other analyses ---------- */
function stepSkip(k, note){ if (!XST) return; XST[k] = {s: "skip", note}; renderSteps(); if (XSTEPS.every(([q]) => XST[q].s === "done" || XST[q].s === "skip")){ clearTimeout(xstT); xstT = setTimeout(() => { XST = null; renderSteps(); }, 2600); } }
async function autoWidth(R, tok, force, bg){
  const st = bg ? () => {} : null, sStart = bg ? st : stepStart, sDone = bg ? st : stepDone, sSkip = bg ? st : stepSkip;
  if ((!XR.src.autoW && !force) || !R || !R.reaches || !R.reaches.length){ sSkip("width", XR.src.autoW ? "no reaches" : "off — turn on with ⇔ Widths, or measure in the Width tab"); return; }
  const list = R.reaches.filter(r => !r.width), total = list.length; if (!total){ sDone("width", "already measured"); return; }
  let i = 0, ok = 0, at = 0; sStart("width", `0 of ${total} reaches`);
  const worker = async () => { while (at < list.length){ if (tok !== XR.loadTok || (!bg && XR.river !== R)) return; const r = list[at++];
    try { await measureWidth(R, r); if (r.width && Number.isFinite(r.width.med)) ok++; } catch(e){ console.warn("width", e); }
    i++; if (!bg && XST && XST.width) { XST.width.note = `${i} of ${total} reaches`; renderSteps(); } actSet("aw", `Measuring channel width: reach ${i} of ${total}`, i/total); if (i % 3 === 0 || i === total) renderX(); } };
  try { await Promise.all([worker(), worker(), worker()]); } finally { actEnd("aw"); }
  if (tok !== XR.loadTok || (!bg && XR.river !== R)) return;
  sDone("width", ok ? `${ok} of ${total} reaches have mapped water` : "river mapped only as a line"); renderX();
  if (!ok && !bg) xstatus(`Channel width: no mapped water areas along ${esc(R.name)} (it is drawn only as a line in OpenStreetMap). Load your own water polygons under Data sources.`, "ok");
}

/* ---------- 3. map controls: zoom, rotate, layers, declutter ---------- */
const LAY_KEY = "efl.lay";
XR.lay = Object.assign({imagery: true, side: true, tribs: true, labels: true, reaches: true, dams: true, pos: true, legend: true, scale: true, controls: true, rotGesture: true}, (() => { try { return JSON.parse(localStorage.getItem(LAY_KEY)) || {}; } catch(_){ return {}; } })());
XR.lay.controls = true; XR.lay.imagery = XR.lay.imagery !== false;
const LAYDEF = [["imagery", "Satellite / base map"], ["side", "Side channels"], ["tribs", "Tributaries"], ["labels", "Names and labels"], ["reaches", "Reach boundaries"], ["dams", "Dams and weirs"], ["pos", "Position marker"], ["legend", "Colour legend"], ["scale", "Scale bar"], ["controls", "Map menus (base map, overlay, colour by)"], ["rotGesture", "Two-finger rotation"]];
function drawNorth(ctx, x, y, rot){ ctx.save(); ctx.translate(x, y); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill(); ctx.rotate(rot || 0); ctx.fillStyle = "#d62728"; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(6, 3); ctx.lineTo(0, 0); ctx.lineTo(-6, 3); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#333"; ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(6, 3); ctx.lineTo(0, 0); ctx.lineTo(-6, 3); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#111"; ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("N", 0, -15 + 0); ctx.restore(); }
function laySave(){ try { localStorage.setItem(LAY_KEY, JSON.stringify(XR.lay)); } catch(_){} }
function mapZoom(dz){ if (!xmap) return; xmap.z = clamp(xmap.z + dz, 2, 19); xmap.req(); }
function mapRotate(da){ if (!xmap) return; xmap.rot = da === null ? 0 : (xmap.rot || 0) + da; mapCtlSync(); xmap.req(); }
function mapCtlSync(){ const c = $("x7Compass"); if (c) c.style.transform = `rotate(${((xmap && xmap.rot) || 0)*180/Math.PI}deg)`; const box = document.querySelector(".xmapbox"); if (box) box.classList.toggle("x7clean", !XR.lay.controls); }
function initMapCtl(){
  const box = document.querySelector(".xmapbox"); if (!box || $("x7Ctl")) return;
  const d = document.createElement("div"); d.id = "x7Ctl"; d.className = "x7ctl";
  d.innerHTML = `<button id="x7Find" title="Search for a river" aria-label="Search for a river">🔍</button><button id="x7Zi" title="Zoom in" aria-label="Zoom in">＋</button><button id="x7Zo" title="Zoom out" aria-label="Zoom out">－</button><button id="x7Rl" title="Rotate left 15°" aria-label="Rotate left">⟲</button><button id="x7Rr" title="Rotate right 15°" aria-label="Rotate right">⟳</button><button id="x7N" title="North up (reset rotation)" aria-label="North up"><span id="x7Compass" class="x7compass"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 1l4 9h-8z" fill="#ff4d4f"/><path d="M10 19l4-9h-8z" fill="#cfd6dd"/></svg></span></button><button id="x7Lay" title="Layers and map options (base map, overlay, colour by)" aria-label="Layers and map options">☰</button><button id="x7Exp" title="Export this map (PNG / PDF)" aria-label="Export map">⬇</button>`;
  box.appendChild(d);
  const p = document.createElement("div"); p.id = "x7LayP"; p.className = "x7layp glass"; p.style.display = "none"; p.innerHTML = `<div id="x7LayBody"></div><div id="x7MapSel" class="x7mapsel"></div>`; box.appendChild(p);
  const place = () => { const ctl = document.querySelector(".xmapctl"), slot = $("x7MapSel"); if (!ctl || !slot) return; const narrow = innerWidth <= 760; if (narrow && ctl.parentElement !== slot) slot.appendChild(ctl); else if (!narrow && ctl.parentElement === slot) box.appendChild(ctl); slot.style.display = narrow ? "" : "none"; };
  place(); addEventListener("resize", place);
  $("x7Find").onclick = () => { const q = $("xQ"); if (!q) return; XR.lay.controls = true; laySave(); mapCtlSync(); const mb = document.querySelector(".xmapbox"); if (mb) mb.scrollIntoView({behavior: "smooth", block: "start"}); setTimeout(() => q.focus(), 350); }; $("x7Zi").onclick = () => mapZoom(1); $("x7Zo").onclick = () => mapZoom(-1); $("x7Rl").onclick = () => mapRotate(-Math.PI/12); $("x7Rr").onclick = () => mapRotate(Math.PI/12); $("x7N").onclick = () => mapRotate(null);
  $("x7Lay").onclick = () => { const v = p.style.display === "none"; p.style.display = v ? "" : "none"; if (v) renderLayP(); };
  $("x7Exp").onclick = () => exportMapDialog();
  mapCtlSync();
}
function renderLayP(){ const p = $("x7LayBody"); if (!p) return;
  p.innerHTML = `<div class="x7lh"><b>Layers & map options</b><button class="sm" id="x7LayX">✕</button></div>${LAYDEF.map(([k, t]) => `<label class="chk"><input type="checkbox" data-lay="${k}"${XR.lay[k] !== false ? " checked" : ""}> ${t}</label>`).join("")}<div class="btns"><button class="sm" id="x7LayMin">Minimal</button><button class="sm" id="x7LayAll">Show all</button></div><p class="note">Hidden layers are also left out of map exports.</p>`;
  p.querySelectorAll("[data-lay]").forEach(c => c.onchange = () => { XR.lay[c.dataset.lay] = c.checked; laySave(); mapCtlSync(); xmap && xmap.req(); });
  $("x7LayX").onclick = () => { $("x7LayP").style.display = "none"; };
  $("x7LayMin").onclick = () => { Object.assign(XR.lay, {side: false, tribs: false, labels: false, reaches: false, dams: false}); laySave(); renderLayP(); mapCtlSync(); xmap.req(); };
  $("x7LayAll").onclick = () => { LAYDEF.forEach(([k]) => XR.lay[k] = true); laySave(); renderLayP(); mapCtlSync(); xmap.req(); };
}

/* ---------- 4. journal-quality export of every map and plot ---------- */
const EXPW = [["85", "Single column (85 mm)"], ["120", "1.5 column (120 mm)"], ["180", "Double column (180 mm)"], ["0", "As on screen"]];
const EXPOPT = Object.assign({fmt: "png", w: "180", dpi: 300, journal: true}, (() => { try { return JSON.parse(localStorage.getItem("efl.exp")) || {}; } catch(_){ return {}; } })());
const STYLEPROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill-opacity", "opacity", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "stroke-linecap", "stroke-linejoin", "display", "visibility"];
const parseRGB = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const v = m[1].split(",").map(s => parseFloat(s)); return {r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1}; };
/** a standalone SVG string from a live chart: computed styles inlined; optionally restyled for print (dark text on white) */
function inlineSvg(svg, journal){
  const cl = svg.cloneNode(true), src = [svg, ...svg.querySelectorAll("*")], dst = [cl, ...cl.querySelectorAll("*")];
  src.forEach((el, i) => { const o = dst[i]; if (!o || !o.setAttribute) return; const cs = getComputedStyle(el); let st = "";
    for (const k of STYLEPROPS){ let v = cs.getPropertyValue(k); if (!v) continue;
      if (journal && (k === "fill" || k === "stroke")){ const c = parseRGB(v); if (c){ const lum = (.2126*c.r + .7152*c.g + .0722*c.b)/255, sat = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
          if (el.tagName === "text" && k === "fill" && sat < 60) v = lum > .5 ? "#1a1a1a" : v;
          else if (sat < 40 && k === "stroke" && lum > .55) v = el.classList && el.classList.contains("gl") ? "#e3e3e3" : "#555";
          else if (sat < 40 && k === "fill" && lum < .3 && /rect|path|circle/.test(el.tagName) && c.a > .5) v = "#ffffff"; } }
      st += `${k}:${v};`; }
    o.setAttribute("style", st); if (o.classList && o.classList.contains("hit")) o.remove(); });
  cl.querySelectorAll(".x7eb").forEach(b => b.remove());
  const vb = (svg.getAttribute("viewBox") || `0 0 ${svg.clientWidth} ${svg.clientHeight}`).split(/[\s,]+/).map(Number);
  cl.setAttribute("xmlns", "http://www.w3.org/2000/svg"); cl.setAttribute("viewBox", vb.join(" ")); cl.setAttribute("width", vb[2]); cl.setAttribute("height", vb[3]);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("x", vb[0]); bg.setAttribute("y", vb[1]); bg.setAttribute("width", vb[2]); bg.setAttribute("height", vb[3]); bg.setAttribute("fill", "#ffffff"); cl.insertBefore(bg, cl.firstChild);
  return new XMLSerializer().serializeToString(cl);
}
async function svgToCanvas(svg, pxW){
  const m = /viewBox="([^"]+)"/.exec(svg), vb = m ? m[1].split(/[\s,]+/).map(Number) : [0, 0, 800, 600], k = pxW ? pxW/vb[2] : 2;
  const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"})); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("could not render the figure")); img.src = url; });
  const c = document.createElement("canvas"); c.width = Math.round(vb[2]*k); c.height = Math.round(vb[3]*k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); return c;
}
/** PNG with its print resolution recorded (pHYs chunk), so it opens at the right size in Word, Illustrator and journal systems */
async function pngWithDpi(canvas, dpi){
  const b = await new Promise(r => canvas.toBlob(r, "image/png")); if (!b) throw new Error("the browser could not encode the image (too large?)");
  const u = new Uint8Array(await b.arrayBuffer()), ppm = Math.round(dpi/.0254), ch = new Uint8Array(21), dv = new DataView(ch.buffer);
  dv.setUint32(0, 9); ch.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1; dv.setUint32(17, crc32(ch.subarray(4, 17)));
  const at = 33, out = new Uint8Array(u.length + 21); out.set(u.subarray(0, at)); out.set(ch, at); out.set(u.subarray(at), at + 21); return new Blob([out], {type: "image/png"});
}
/** a real PDF file (not a print dialog): the figure as a lossless image at the chosen size and resolution */
async function canvasToPdf(canvas, wMm, title){
  const W = canvas.width, H = canvas.height, pw = wMm/25.4*72, ph = pw*H/W, g = canvas.getContext("2d"), px = g.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W*H*3);
  for (let i = 0, j = 0; i < px.length; i += 4){ const a = px[i + 3]/255; rgb[j++] = px[i]*a + 255*(1 - a); rgb[j++] = px[i + 1]*a + 255*(1 - a); rgb[j++] = px[i + 2]*a + 255*(1 - a); }
  let data, filter;
  if (typeof CompressionStream !== "undefined"){ data = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer()); filter = "/FlateDecode"; }
  else { data = new Uint8Array(await (await new Promise(r => canvas.toBlob(r, "image/jpeg", .97))).arrayBuffer()); filter = "/DCTDecode"; }
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0; const push = x => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); if (typeof body === "string") push(body + "\nendobj\n"); else { push(body[0]); push(body[1]); push(body[2] + "\nendobj\n"); } };
  const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`, safe = s => String(s || "").replace(/[()\\]/g, "").replace(/[^\x20-\x7e]/g, "");
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${data.length} >>\nstream\n`, data, "\nendstream"]);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${safe(title)}) /Producer (Earthform Lens) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}) >>`);
  const xref = len; push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, {type: "application/pdf"});
}
const MAXPX = 16.7e6;
/** target pixel width for a physical width and resolution, kept under the browser's canvas limit */
function expPixels(wMm, dpi, aspect, screenW){ let px = wMm > 0 ? Math.round(wMm/25.4*dpi) : Math.round(screenW*Math.max(2, dpi/150)); let note = ""; if (px*px*aspect > MAXPX){ const k = Math.sqrt(MAXPX/(px*px*aspect)); px = Math.floor(px*k); note = `Reduced to ${px} px wide (≈${Math.round(px/((wMm || screenW/96*25.4)/25.4))} dpi) to stay within this browser's image size limit.`; } return {px, note}; }
/**
 * o.name   file name stem
 * o.title  shown in the dialog and PDF metadata
 * o.svg    () => SVG string (vector source) — or
 * o.canvas async (pxW) => canvas (raster source, e.g. the live map)
 * o.parts  optional [[key, label, () => svg]] to export part of a figure
 */
function exportDialog(o){
  const hasSvg = !!(o.svg || o.parts), fmts = [["png", "PNG"], ["pdf", "PDF"], ...(hasSvg ? [["svg", "SVG (vector, editable)"]] : [])];
  if (!hasSvg && EXPOPT.fmt === "svg") EXPOPT.fmt = "png";
  modal(`<h3>Export ${esc(o.title || "figure")}</h3>
    ${o.parts ? `<label class="fl">Part<select id="x7Part">${o.parts.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join("")}</select></label>` : ""}
    <label class="fl">Format<select id="x7Fmt">${fmts.map(([k, t]) => `<option value="${k}"${EXPOPT.fmt === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="fl">Printed width<select id="x7W">${EXPW.map(([k, t]) => `<option value="${k}"${EXPOPT.w === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="fl">Resolution<select id="x7Dpi">${[[300, "300 dpi (photos, colour figures)"], [600, "600 dpi (line art with colour)"], [1000, "1000 dpi (fine line art)"]].map(([k, t]) => `<option value="${k}"${+EXPOPT.dpi === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    ${o.svg && o.journalOpt !== false ? `<label class="chk"><input type="checkbox" id="x7Jr"${EXPOPT.journal ? " checked" : ""}> Print style: white background, dark text and axes</label>` : ""}
    <p class="note" id="x7ExpInfo"></p>${o.note ? `<p class="note">${o.note}</p>` : ""}
    <div class="btns"><button class="pri" id="x7Go">⬇ Export</button><button id="x7Cancel">Cancel</button></div>`);
  const info = () => { const f = $("x7Fmt").value, w = +$("x7W").value, dpi = +$("x7Dpi").value; $("x7Dpi").disabled = f === "svg"; $("x7W").disabled = f === "svg";
    $("x7ExpInfo").textContent = f === "svg" ? "Vector file: scales to any size; fonts and lines stay editable in Illustrator or Inkscape. Check fonts are embedded or outlined before submission." : w ? `${w} mm at ${dpi} dpi = ${Math.round(w/25.4*dpi)} pixels wide. Most journals ask for 300 dpi for colour and 600–1000 dpi for line art.` : `Screen size at ${Math.max(2, dpi/150)}× pixel density.`; };
  ["x7Fmt", "x7W", "x7Dpi"].forEach(i => $(i).onchange = info); info();
  $("x7Cancel").onclick = closeModal;
  $("x7Go").onclick = async () => { const f = $("x7Fmt").value, w = +$("x7W").value, dpi = +$("x7Dpi").value, jr = $("x7Jr") ? $("x7Jr").checked : true, part = $("x7Part") ? $("x7Part").value : null;
    Object.assign(EXPOPT, {fmt: f, w: String(w), dpi, journal: jr}); try { localStorage.setItem("efl.exp", JSON.stringify(EXPOPT)); } catch(_){}
    const btn = $("x7Go"); btn.disabled = true; btn.textContent = "Preparing…"; actSet("exp", "Preparing the figure…");
    try {
      const stem = (o.name || "figure").replace(/[^\w.-]+/g, "_") + (part && part !== "whole" ? "_" + part : "");
      const svgFn = part ? o.parts.find(p => p[0] === part)[2] : o.svg, svg = svgFn ? svgFn(jr) : null;
      if (f === "svg"){ await save(stem + ".svg", svg); closeModal(); return; }
      let cv, note = "";
      if (svg){ const m = /viewBox="([^"]+)"/.exec(svg), vb = m ? m[1].split(/[\s,]+/).map(Number) : [0, 0, 800, 600], E = expPixels(w, dpi, vb[3]/vb[2], vb[2]); note = E.note; cv = await svgToCanvas(svg, E.px); }
      else { const sw = (o.screenW && o.screenW()) || 800, E = expPixels(w, dpi, (o.aspect && o.aspect()) || .7, sw); note = E.note; cv = await o.canvas(E.px); }
      const blob = f === "pdf" ? await canvasToPdf(cv, w || cv.width/(dpi/25.4), o.title) : await pngWithDpi(cv, w ? cv.width/(w/25.4) : dpi);
      await save(stem + "." + f, blob); closeModal(); if (note) toast(note, 5000);
    } catch(e){ console.error(e); btn.disabled = false; btn.textContent = "⬇ Export"; toast(/tainted|insecure|SecurityError/i.test(e.message + e.name) ? "This base map does not allow image export: switch the base map to Plain or Sentinel-2, or use the Clean view" : "Export failed: " + e.message, 5000); }
    finally { actEnd("exp"); } };
}
/* the live map, redrawn off screen at print resolution (sharper tiles are fetched for it) */
function exportMapDialog(){
  if (!xmap) return; const cv0 = xmap.cv, r0 = cv0.getBoundingClientRect();
  exportDialog({name: ((XR.river && XR.river.name) || "map") + "_map", title: "the map", screenW: () => r0.width, aspect: () => r0.height/r0.width,
    note: "Raster export of the map as you see it, with the layers that are switched on. For vector figures use the Clean view. Imagery licences (Esri, EOX) apply to published figures; the attribution line is kept.",
    canvas: async pxW => { const M = xmap, k = clamp(pxW/r0.width, 1, 8), od = M.dpr, ob = M.tileBias || 0; M.dpr = k; M.tileBias = Math.min(2, Math.round(Math.log2(k))); M.exporting = true;
      try { for (let t = 0; t < 40; t++){ M.draw(); if (!M.miss) break; await new Promise(r => setTimeout(r, 350)); } M.draw(); const c = document.createElement("canvas"); c.width = cv0.width; c.height = cv0.height; const g = c.getContext("2d"); g.drawImage(cv0, 0, 0); g.getImageData(0, 0, 1, 1); return c; }
      finally { M.dpr = od; M.tileBias = ob; M.exporting = false; M.req(); } }});
}
/* an export button on every chart in the app */
function decorateExports(){
  document.querySelectorAll("svg:not([data-x7])").forEach(s => { s.setAttribute("data-x7", "1");
    if (s.closest("#cvWrap, .x7ctl, button, .chip, .rcard, .xsearch, .nav, nav, header, .x7eb, #modal")) return;
    const r = s.getBoundingClientRect(), vb = (s.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number), w = r.width || vb[2] || 0, h = r.height || vb[3] || 0; if (w < 150 || h < 80) return;
    const par = s.parentElement; if (!par || par.querySelector(":scope > .x7eb")) return; if (getComputedStyle(par).position === "static") par.style.position = "relative";
    const b = document.createElement("button"); b.className = "x7eb"; b.type = "button"; b.title = "Export this plot (PNG, PDF, SVG)"; b.textContent = "⬇"; par.appendChild(b);
    b.onclick = e => { e.stopPropagation(); let t = ""; for (let n = par, up = 0; n && up < 4 && !t; n = n.parentElement, up++){ for (let p = n.previousElementSibling; p && !t; p = p.previousElementSibling){ if (/^H[2-5]$/.test(p.tagName)) t = p.textContent.trim(); } } t = (t || "plot").slice(0, 60);
      exportDialog({name: ((XR.river && XR.river.name) || "earthform") + "_" + t.toLowerCase().replace(/[^\w]+/g, "_").slice(0, 40), title: t, svg: jr => inlineSvg(s, jr)}); }; });
}
let x7obsT = 0; new MutationObserver(() => { clearTimeout(x7obsT); x7obsT = setTimeout(decorateExports, 300); }).observe(document.body, {childList: true, subtree: true});

/* clean view: map, plots or whole figure, at print size */
function cvPartSVG(part){
  const plan = $("cvPlan"), over = $("cvOver"), prof = $("cvProf"), [W, H] = cvSize(), ph = +prof.getAttribute("height") || 170;
  const ov = over.innerHTML.replace(/<rect x="-4" y="-4"[^>]*stroke-dasharray="4 3"\/>/g, "");
  if (part === "map") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><g>${plan.innerHTML}</g><g>${ov}</g></svg>`;
  if (part === "plots"){ const pw = +prof.getAttribute("width") || W; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw}" height="${ph}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${prof.innerHTML}</svg>`; }
  return cvExportSVG();
}
function cvExport(fmt){ const R = XR.river; EXPOPT.fmt = fmt; exportDialog({name: R.name + "_clean_view", title: "the clean view", journalOpt: false, parts: [["whole", "Whole figure (maps, plots, caption)", () => cvPartSVG("whole")], ["map", "Map(s) only", () => cvPartSVG("map")], ["plots", "Plots only", () => cvPartSVG("plots")]]}); }
function cvZoomBtns(){ const m = document.querySelector("#cvWrap .cvmain"); if (!m || $("cvZ")) return; const d = document.createElement("div"); d.id = "cvZ"; d.className = "x7ctl cvz";
  d.innerHTML = `<button data-cz="in" title="Zoom in">＋</button><button data-cz="out" title="Zoom out">－</button><button data-cz="l" title="Rotate left 15°">⟲</button><button data-cz="r" title="Rotate right 15°">⟳</button><button data-cz="n" title="North up"><span class="x7compass" id="cvCompass"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 1l4 9h-8z" fill="#ff4d4f"/><path d="M10 19l4-9h-8z" fill="#cfd6dd"/></svg></span></button>`; m.appendChild(d);
  d.querySelectorAll("[data-cz]").forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.cz; if (!CV.vb) return; if (k === "in") CV.vb.s /= 1.5; if (k === "out") CV.vb.s *= 1.5; if (k === "l") CV.rot = (CV.rot || 0) - Math.PI/12; if (k === "r") CV.rot = (CV.rot || 0) + Math.PI/12; if (k === "n") CV.rot = 0; $("cvCompass").style.transform = `rotate(${(CV.rot || 0)*180/Math.PI}deg)`; cvDraw(); });
  d.onpointerdown = e => e.stopPropagation(); }
{ const _ocv = openCleanView; openCleanView = function(){ _ocv(); if (!$("cvWrap") || !$("cvSvg")) return; $("cvSvg").onclick = () => cvExport("svg"); $("cvPng").onclick = () => cvExport("png"); $("cvPdf").onclick = () => cvExport("pdf"); cvZoomBtns(); }; }
{ const b = $("xClean"); if (b) b.onclick = () => openCleanView(); const b2 = $("xClean2"); if (b2) b2.onclick = () => openCleanView(); }

/* ---------- 5. trace editor: fix an incomplete or wrong centreline ---------- */
function traceStart(){
  const R = XR.river; if (!R) return toast("Load a river first");
  XR.te = {R, pts: R.main.map(p => [p[0], p[1]]), mode: null, undo: [], log: [], A: null, B: null, add: []}; renderTeBar(); xmap.req();
  xstatus("Editing the trace: cut it at the marker, extend either end by tapping the map or following OpenStreetMap, or redraw a stretch. Nothing changes until you press Apply.", "ok");
}
function teLen(P){ let s = 0; for (let i = 1; i < P.length; i++) s += hav(P[i - 1], P[i]); return s; }
function teNearest(P, ll){ let bi = 0, bd = Infinity; const st = Math.max(1, Math.floor(P.length/5000)); for (let i = 0; i < P.length; i += st){ const d = hav(P[i], ll); if (d < bd){ bd = d; bi = i; } } for (let i = Math.max(0, bi - st); i <= Math.min(P.length - 1, bi + st); i++){ const d = hav(P[i], ll); if (d < bd){ bd = d; bi = i; } } return [bi, bd]; }
function tePush(label){ const te = XR.te; te.undo.push({pts: te.pts, log: te.log.slice()}); if (te.undo.length > 30) te.undo.shift(); te.log.push(label); }
function teMarkerIdx(){ const te = XR.te, p = pointAtKm(te.R, XR.pos); return teNearest(te.pts, p)[0]; }
function teAct(k){
  const te = XR.te; if (!te) return;
  if (k === "cut0" || k === "cut1"){ const i = teMarkerIdx(); if (i < 1 || i > te.pts.length - 2) return toast("Move the marker (tap the river) to where the line should end"); const L0 = teLen(te.pts); tePush(""); te.pts = k === "cut0" ? te.pts.slice(i) : te.pts.slice(0, i + 1); te.log[te.log.length - 1] = `${k === "cut0" ? "removed upstream of" : "removed downstream of"} the marker (${nf(L0 - teLen(te.pts), 1)} km)`; }
  if (k === "ext0" || k === "ext1" || k === "redraw"){ te.mode = te.mode === k ? null : k; te.add = []; if (k === "redraw" && te.mode){ if (te.A == null || te.B == null){ te.mode = null; return toast("Set A and B on the river first (move the marker, then press Set A / Set B)"); } } toast(te.mode ? (k === "redraw" ? "Tap the new course from A towards B, then press Done" : "Tap points beyond the " + (k === "ext0" ? "source" : "mouth") + " along the channel, then press Done") : "Stopped"); }
  if (k === "done"){ if (te.mode && te.add.length){ tePush(""); const L0 = teLen(te.pts);
      if (te.mode === "ext0") te.pts = te.add.slice().reverse().concat(te.pts); else if (te.mode === "ext1") te.pts = te.pts.concat(te.add);
      else { let [a, b] = [te.A, te.B]; if (a > b) [a, b] = [b, a]; te.pts = te.pts.slice(0, a + 1).concat(te.A > te.B ? te.add.slice().reverse() : te.add, te.pts.slice(b)); te.A = te.B = null; }
      te.log[te.log.length - 1] = te.mode === "redraw" ? `redrew a stretch by hand (${te.add.length} points)` : `extended the ${te.mode === "ext0" ? "source" : "mouth"} by hand (${nf(teLen(te.pts) - L0, 1)} km)`; } te.mode = null; te.add = []; }
  if (k === "A" || k === "B") te[k] = teMarkerIdx();
  if (k === "rev"){ tePush("reversed the flow direction"); te.pts = te.pts.slice().reverse(); }
  if (k === "undo"){ const u = te.undo.pop(); if (u){ te.pts = u.pts; te.log = u.log; } }
  if (k === "osm0" || k === "osm1") return teFollowOSM(k === "osm1");
  if (k === "cancel"){ XR.te = null; renderTeBar(); xmap.req(); xstatus("Trace edit cancelled; nothing changed.", "ok"); return; }
  if (k === "apply") return teApply();
  renderTeBar(); xmap.req();
}
async function teFollowOSM(down){
  const te = XR.te, used = new Set(), L0 = teLen(te.pts); let steps = 0; tePush(""); actSet("te", `Following OpenStreetMap ${down ? "downstream" : "upstream"}…`);
  try {
    for (; steps < 14; steps++){
      const tip = down ? te.pts[te.pts.length - 1] : te.pts[0];
      const q = `[out:json][timeout:60];way(around:150,${tip[0].toFixed(6)},${tip[1].toFixed(6)})[waterway~"^(river|stream|canal|tidal_channel)$"];out geom tags;`;
      const els = ((await overpass(q)).elements || []).filter(w => w.type === "way" && w.geometry && w.geometry.length > 1 && !used.has(w.id));
      let best = null, bs = 0; const far = te.pts.filter((_, i) => i % Math.max(1, Math.floor(te.pts.length/400)) === 0);
      for (const w of els){ const g = w.geometry.map(p => [p.lat, p.lon]); let j = -1, jd = .15; g.forEach((p, i) => { const d = hav(p, tip); if (d < jd){ jd = d; j = i; } }); if (j < 0) continue;
        const seg = down ? g.slice(j + 1) : g.slice(0, j).reverse(); if (seg.length < 1) continue;
        const end = seg[seg.length - 1]; if (far.some(p => hav(p, end) < .08)) continue; // would double back onto the trace
        const len = teLen([tip, ...seg]), nm = w.tags && (w.tags.name || ""), score = len*(nm && nm === te.R.name ? 4 : 1)*(w.tags && w.tags.waterway === "river" ? 2 : 1);
        if (score > bs){ bs = score; best = {id: w.id, seg, nm}; } }
      if (!best) break; used.add(best.id); te.pts = down ? te.pts.concat(best.seg) : best.seg.slice().reverse().concat(te.pts); xmap.req();
      actSet("te", `Following OpenStreetMap ${down ? "downstream" : "upstream"}: +${nf(teLen(te.pts) - L0, 1)} km`);
    }
  } catch(e){ toast("OpenStreetMap: " + e.message, 4000); } finally { actEnd("te"); }
  const gain = teLen(te.pts) - L0; if (gain < .01){ te.undo.pop(); te.log.pop(); toast(`No connected ${down ? "downstream" : "upstream"} waterway found in OpenStreetMap: extend by tapping instead`, 4500); }
  else { te.log[te.log.length - 1] = `followed OpenStreetMap ${down ? "downstream" : "upstream"} (+${nf(gain, 1)} km, ${used.size} ways)`; toast(`Added ${nf(gain, 1)} km from ${used.size} OpenStreetMap ways. Check it, then Apply.`, 4000); }
  renderTeBar(); xmap.req();
}
async function teApply(){
  const te = XR.te, R = te.R; if (te.pts.length < 2) return toast("The line needs at least two points");
  const dense = []; for (let i = 0; i + 1 < te.pts.length; i++){ const a = te.pts[i], b = te.pts[i + 1], n = Math.max(1, Math.ceil(hav(a, b)/.08)); for (let t = 0; t < n; t++) dense.push([a[0] + (b[0] - a[0])*t/n, a[1] + (b[1] - a[1])*t/n]); } dense.push(te.pts[te.pts.length - 1]);
  const oldMouth = R.main[R.main.length - 1]; R.main = dense; R.cum = withCum(dense); R.L = R.cum[R.cum.length - 1];
  const reKm = (o, max) => { const [i, d] = teNearest(dense, [o.lat, o.lon]); o.km = R.cum[i]; return d <= max; };
  R.tribs = R.tribs.filter(t => reKm(t, 2)); R.dams = R.dams.filter(d => reKm(d, 1)); R.tribs.sort((a, b) => a.km - b.km); R.dams.sort((a, b) => a.km - b.km);
  R.nodeIdx = null; R.mainNodes = null; R.prof = null; R.reaches = null; R.fp = null; R.delta = null; if (hav(oldMouth, dense[dense.length - 1]) > .5) R.basin = null;
  R.edits = (R.edits || []).concat({when: new Date().toISOString(), ops: te.log.filter(Boolean)}); R.osmNote = "centreline edited by the user: " + R.edits.flatMap(e => e.ops).join("; ");
  XR.te = null; renderTeBar(); XR.pos = clamp(XR.pos, 0, R.L); XR.range = null; buildReaches(R); xmap.fit(R.main); renderX();
  xstatus(`Trace updated: ${km(R.L)}. Re-reading elevation and re-measuring…`, "busy");
  try { await loadProfile(R); buildReaches(R); renderX(); xstatus(`<b>${esc(R.name)}</b> (edited trace): ${km(R.L)}, falling ${nf(R.prof.drop)} m. All modules now use the edited line; the edit is recorded with the results.`, "ok"); autoWidth(R, XR.loadTok); }
  catch(e){ xstatus("Elevation: " + esc(e.message), "err"); }
}
function renderTeBar(){
  let b = $("x7TeBar"); const box = document.querySelector(".xmapbox"); if (!box) return;
  if (!b){ b = document.createElement("div"); b.id = "x7TeBar"; b.className = "x7tebar glass"; box.appendChild(b); }
  const te = XR.te; if (!te){ b.style.display = "none"; return; } b.style.display = "";
  const btn = (k, t, on, ttl) => `<button class="sm${on ? " pri" : ""}" data-te="${k}"${ttl ? ` title="${ttl}"` : ""}>${t}</button>`;
  b.innerHTML = `<div class="x7teh"><b>Edit trace</b><span>${km(teLen(te.pts))}${te.log.filter(Boolean).length ? " · " + te.log.filter(Boolean).length + " change" + (te.log.filter(Boolean).length > 1 ? "s" : "") : ""}</span></div>
    ${te.mode ? `<div class="x7terow"><span class="note">${te.mode === "redraw" ? "Tap the new course from A to B" : "Tap the map beyond the " + (te.mode === "ext0" ? "source" : "mouth")} · ${te.add.length} points</span>${btn("done", "✓ Done", true)}${btn(te.mode, "Stop")}</div>` : `
    <div class="x7terow">${btn("osm0", "⤴ Follow OSM upstream", false, "Add connected waterways above the source")}${btn("osm1", "⤵ Follow OSM downstream", false, "Add connected waterways below the mouth")}</div>
    <div class="x7terow">${btn("ext0", "＋ Extend source by hand")}${btn("ext1", "＋ Extend mouth by hand")}</div>
    <div class="x7terow">${btn("cut0", "✂ Cut above marker")}${btn("cut1", "✂ Cut below marker")}${btn("rev", "⇄ Reverse")}</div>
    <div class="x7terow">${btn("A", te.A != null ? "A ✓" : "Set A")}${btn("B", te.B != null ? "B ✓" : "Set B")}${btn("redraw", "✎ Redraw A→B")}</div>`}
    <div class="x7terow">${btn("undo", "↺ Undo")}${btn("apply", "Apply & re-analyse", true)}${btn("cancel", "Cancel")}</div>`;
  b.querySelectorAll("[data-te]").forEach(x => x.onclick = () => teAct(x.dataset.te));
}
function drawTraceEdit(ctx, M){
  const te = XR.te; if (!te) return; const P = te.pts, st = Math.max(1, Math.floor(P.length/4000));
  ctx.save(); ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 7; ctx.beginPath(); for (let i = 0; i < P.length; i += st){ const q = M.toScr(P[i][0], P[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } { const q = M.toScr(P[P.length - 1][0], P[P.length - 1][1]); ctx.lineTo(q[0], q[1]); } ctx.stroke();
  ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 3.5; ctx.stroke();
  if (te.add.length){ const base = te.mode === "ext0" ? P[0] : te.mode === "ext1" ? P[P.length - 1] : P[te.A]; ctx.setLineDash([7, 5]); ctx.strokeStyle = "#ff4dd2"; ctx.lineWidth = 3; ctx.beginPath(); [base, ...te.add].forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]); for (const p of te.add){ const q = M.toScr(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 7); ctx.fillStyle = "#ff4dd2"; ctx.fill(); } }
  for (const [i, t] of [[0, "Source"], [P.length - 1, "Mouth"], [te.A, "A"], [te.B, "B"]]){ if (i == null) continue; const q = M.toScr(P[i][0], P[i][1]); ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = "#ffd84a"; ctx.font = "700 11px Inter, sans-serif"; ctx.fillText(t, q[0] + 11, q[1] - 8); }
  ctx.restore();
}
{ const _mt = mapTap; mapTap = function(sx, sy){ const te = XR.te; if (te && te.mode){ te.add.push(xmap.toGeo(sx, sy)); renderTeBar(); xmap.req(); return; } if (te){ const R = XR.river, ll = xmap.toGeo(sx, sy), [i, d] = teNearest(te.pts, ll); const q = xmap.toScr(te.pts[i][0], te.pts[i][1]); if (Math.hypot(q[0] - sx, q[1] - sy) < 28 && R){ const [j] = teNearest(R.main, te.pts[i]); setPos(R.cum[j]); xmap.req(); } return; } return _mt(sx, sy); }; }

/* ---------- 6. wiring ---------- */
function initX7(){
  initMapCtl();
  const tools = document.querySelector(".xtools");
  if (tools && !$("x7SrcBtn")){ const a = document.createElement("button"); a.id = "x7SrcBtn"; a.className = "chipbtn"; a.textContent = "🗂 Data sources"; a.title = "Choose elevation, water and imagery sources (with recommendations)"; a.onclick = openSources; tools.appendChild(a);
    const wb = document.createElement("button"); wb.id = "x7WBtn"; wb.className = "chipbtn"; const wlab = () => { wb.textContent = XR.src.autoW ? "⇔ Widths: on" : "⇔ Widths: off"; wb.classList.toggle("off", !XR.src.autoW); }; wlab();
    wb.title = "Measure channel width automatically after a river loads (slower). Off: measure later from the Width tab."; wb.onclick = () => { XR.src.autoW = !XR.src.autoW; srcSave(); wlab(); toast(XR.src.autoW ? "Channel widths will be measured after each river loads" : "Channel widths are off: rivers load faster; measure them later in the Width tab", 4000); }; tools.insertBefore(wb, tools.children[1] || null);
    const e = document.createElement("button"); e.id = "x7EditBtn"; e.className = "chipbtn"; e.textContent = "✎ Edit trace"; e.title = "Fix an incomplete or wrong centreline"; e.onclick = traceStart; tools.appendChild(e); }
}
initX7();
{ const _rx = renderX; renderX = function(){ _rx(); try { const e = $("x7EditBtn"); if (e) e.style.display = XR.river ? "" : "none"; const ps = $("xProfStats"); if (ps && XR.river && XR.river.prof){ ps.querySelectorAll(".x7alt").forEach(n => n.remove()); const pr = XR.river.prof; ps.insertAdjacentHTML("beforeend", `<p class="note">Elevation source: ${esc(demLabel(pr, true))}. <a href="#" class="x7srcl">Change or cross-check</a></p>` + altHTML(pr)); const l = ps.querySelector(".x7srcl"); if (l) l.onclick = ev => { ev.preventDefault(); openSources(); }; } } catch(err){ console.warn(err); } }; }
