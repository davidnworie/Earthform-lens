/* ===================== River Explorer: deeper modules, map tools, provenance & exports ===================== */
// Map layers (Sentinel-2 cloudless years, JRC Global Surface Water, ESA WorldCover, Macrostrat geology), swipe & animation,
// pick-a-river / choose-outlet / digitise tools, profile parameters, transects, junction angles & drainage pattern,
// land cover & lithology of catchments, cross-sections, terraces, oxbows, delta distributaries & angles, sediment weights,
// cross-plots / histograms / box plots, method & provenance notes, JSON / SVG / PNG / report exports.

/* ---------- extra base maps and overlays ---------- */
{
  const eox = (id, yr) => ({n: `Sentinel-2 cloudless ${yr}`, year: yr, url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/${id}/default/g/${z}/${y}/${x}.jpg`, max: 15, attr: `Sentinel-2 cloudless ${yr} by EOX (contains modified Copernicus Sentinel data)`});
  Object.assign(EX.base, {s2_2016: eox("s2cloudless_3857", 2016), s2_2018: eox("s2cloudless-2018_3857", 2018), s2_2019: eox("s2cloudless-2019_3857", 2019), s2_2020: eox("s2cloudless-2020_3857", 2020), s2_2021: eox("s2cloudless-2021_3857", 2021), s2_2022: eox("s2cloudless-2022_3857", 2022), s2_2023: eox("s2cloudless-2023_3857", 2023)});
  const gsw = k => (z, x, y) => `https://storage.googleapis.com/global-surface-water/tiles2021/${k}/${z}/${x}/${y}.png`;
  EX.over = {
    gsw_occ: {n: "Surface water occurrence 1984–2021 (JRC)", url: gsw("occurrence"), max: 13, attr: "JRC Global Surface Water (Pekel et al. 2016)", alpha: .85},
    gsw_chg: {n: "Surface water change 1984–2021 (JRC)", url: gsw("change"), max: 13, attr: "JRC Global Surface Water", alpha: .85},
    gsw_trn: {n: "Water transitions 1984–2021 (JRC)", url: gsw("transitions"), max: 13, attr: "JRC Global Surface Water", alpha: .85},
    gsw_sea: {n: "Water seasonality (JRC)", url: gsw("seasonality"), max: 13, attr: "JRC Global Surface Water", alpha: .85},
    wc: {n: "Land cover 2021 (ESA WorldCover)", url: (z, x, y) => `https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=default&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix=EPSG%3A3857%3A${z}&TileCol=${x}&TileRow=${y}`, max: 15, attr: "ESA WorldCover 2021 (CC BY 4.0)", alpha: .7},
    geo: {n: "Geology (Macrostrat)", url: (z, x, y) => `https://tiles.macrostrat.org/carto/${z}/${x}/${y}.png`, max: 14, attr: "Geology © Macrostrat and data providers", alpha: .65},
  };
  XR.overlay = ""; XR.opacity = 1;
}
function drawLayerExtras(ctx, M, w, h){
  if (XR.swipe && EX.base[XR.swipe.b]){ const x = Math.round(w*XR.swipe.x); ctx.save(); ctx.beginPath(); ctx.rect(x, 0, w - x, h); ctx.clip(); if (EX.base[XR.swipe.b].plain){ ctx.fillStyle = "#fff"; ctx.fillRect(x, 0, w - x, h); } else M.drawTiles(ctx, w, h, M.lat, M.lon, M.z, EX.base[XR.swipe.b]); ctx.restore();
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 1, 0, 2, h); ctx.beginPath(); ctx.arc(x, h/2, 13, 0, 7); ctx.fill(); ctx.fillStyle = "#111"; ctx.font = "bold 12px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("⇆", x, h/2 + 4); ctx.textAlign = "left";
    ctx.font = "11px Inter, sans-serif"; const la = EX.base[XR.base].n, lb = EX.base[XR.swipe.b].n; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x - ctx.measureText(la).width - 16, 54, ctx.measureText(la).width + 10, 18); ctx.fillRect(x + 6, 54, ctx.measureText(lb).width + 10, 18); ctx.fillStyle = "#fff"; ctx.fillText(la, x - ctx.measureText(la).width - 11, 67); ctx.fillText(lb, x + 11, 67); }
  const o = XR.overlay && EX.over[XR.overlay]; if (o){ ctx.save(); ctx.globalAlpha = o.alpha*XR.opacity; M.drawTiles(ctx, w, h, M.lat, M.lon, M.z, o); ctx.restore(); }
}

/* ---------- map interaction modes: pick river, choose outlet, digitise ---------- */
function xSetMode(m, extra){ XR.mode = m; XR.dig = m === "dig" ? {kind: extra.kind, pts: [], line: !!extra.line, date: extra.date || ""} : null; renderModeBar(); xmap.req(); }
function renderModeBar(){
  const b = $("xModeBar"); if (!b) return; const m = XR.mode; b.style.display = m ? "" : "none"; if (!m) return;
  const msg = m === "pick" ? "Tap a river on the map to load it" : m === "outlet" ? "Tap the river where the catchment outlet should be" : m === "transect" ? "Tap a transect to exclude it (tap again to restore)" : `Digitising ${DIGN[XR.dig.kind] || XR.dig.kind}: tap points (${XR.dig.pts.length} so far)`;
  b.innerHTML = `<span>${msg}</span>${m === "dig" ? `<button class="sm" id="xMbUndo">Undo</button><button class="sm pri" id="xMbDone">Finish</button>` : ""}<button class="sm" id="xMbX">${m === "transect" ? "Done" : "Cancel"}</button>`;
  $("xMbX").onclick = () => { if (m === "transect" && XR.river) recomputeWidths(XR.river); xSetMode(null); renderX(); };
  if (m === "dig"){ $("xMbUndo").onclick = () => { XR.dig.pts.pop(); renderModeBar(); xmap.req(); }; $("xMbDone").onclick = finishDig; }
}
const DIGN = {belt: "channel-belt boundary", water: "dated water outline", floodplain: "floodplain boundary", lobe: "depositional lobe", shoreline: "shoreline", delta: "delta boundary", terrace: "terrace", channel: "channel centreline", oxbow: "oxbow / abandoned channel"};
function modeTap(sx, sy){
  const ll = xmap.toGeo(sx, sy), m = XR.mode, R = XR.river;
  if (m === "pick"){ xSetMode(null); pickRiverAt(ll); return true; }
  if (m === "outlet" && R){ xSetMode(null); runOutletBasin(R, ll, `Catchment above ${ll[0].toFixed(3)}°, ${ll[1].toFixed(3)}°`).catch(e => xstatus("Outlet: " + esc(e.message), "err")); return true; }
  if (m === "dig"){ XR.dig.pts.push(ll); renderModeBar(); xmap.req(); return true; }
  if (m === "transect" && R){ let best = null, bd = 16; for (const r of R.reaches || []) for (const t of (r.width && r.width.tr) || []){ const a = xmap.toScr(...t.a), b = xmap.toScr(...t.b), q = [(a[0] + b[0])/2, (a[1] + b[1])/2], d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; best = t; } }
    if (best){ best.off = !best.off; xmap.req(); } return true; }
  return false;
}
function finishDig(){
  const D = XR.dig, R = XR.river; if (!D || !R) return xSetMode(null); const min = D.line ? 2 : 3; if (D.pts.length < min) return toast(`Tap at least ${min} points`);
  R.digit = R.digit || []; const f = {kind: D.kind, pts: D.pts.slice(), line: D.line, date: D.date, made: new Date().toISOString()};
  if (D.line){ f.len = withCum(f.pts).pop(); } else { const L = toLocal([...f.pts, f.pts[0]], f.pts[0][0], f.pts[0][1]); let a = 0; for (let i = 0; i + 1 < L.length; i++) a += L[i][0]*L[i+1][1] - L[i+1][0]*L[i][1]; f.area = Math.abs(a)/2;
    // channel length inside the polygon → mean width along the river
    let inside = 0; for (let i = 1; i < R.main.length; i++) if (pip(R.main[i], f.pts)) inside += R.cum[i] - R.cum[i - 1]; f.chanKm = inside; f.meanW = inside > 0 ? f.area/inside*1000 : NaN; }
  R.digit.push(f); xSetMode(null); renderX(); toast(`${DIGN[f.kind] || f.kind} saved`);
}
function pip(p, poly){ let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const a = poly[i], b = poly[j]; if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < (b[1] - a[1])*(p[0] - a[0])/(b[0] - a[0]) + a[1]) c = !c; } return c; }
async function pickRiverAt(ll){
  xstatus("Looking for rivers at this point…", "busy");
  const q = `[out:json][timeout:30];way(around:2500,${ll[0]},${ll[1]})[${XWW}]->.w;.w out tags center 30;rel(bw.w)["waterway"]->.r;.r out tags;`;
  try { const j = await overpass(q), els = j.elements || [], rels = els.filter(e => e.type === "relation" && e.tags && e.tags.name), ways = els.filter(e => e.type === "way" && e.tags && e.tags.name);
    const hits = [...rels.map(r => ({osm_type: "relation", osm_id: r.id, name: r.tags["name:en"] || r.tags.name, type: r.tags.waterway, water: true, where: r.tags.name !== (r.tags["name:en"] || r.tags.name) ? r.tags.name : "", display_name: r.tags.name, lat: ll[0], lon: ll[1], wikidata: r.tags.wikidata})),
      ...ways.filter(w => !rels.some(r => (r.tags.name === w.tags.name))).map(w => ({osm_type: "way", osm_id: w.id, name: w.tags["name:en"] || w.tags.name, type: w.tags.waterway, water: true, where: "mapped stretch", display_name: w.tags.name, lat: w.center ? w.center.lat : ll[0], lon: w.center ? w.center.lon : ll[1]}))];
    const seen = new Set(), list = hits.filter(h => { const k = h.osm_type + h.osm_id; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => (a.osm_type === "relation" ? 0 : 1) - (b.osm_type === "relation" ? 0 : 1) || (/river/.test(a.type) ? 0 : 1) - (/river/.test(b.type) ? 0 : 1)).slice(0, 10);
    if (!list.length) return xstatus("No mapped river within 2.5 km of that point. Zoom in and tap closer to the channel.", "err");
    XR.searchQ = "__pick"; const box = $("xResults"); box.innerHTML = list.map((r, i) => `<button class="xres" data-i="${i}" style="--d:${i*30}ms"><i class="xri">〰</i><span class="xrt"><b>${esc(r.name)}</b><small>${esc(r.where || r.type)}</small></span><span class="xrb">${r.osm_type === "relation" ? `<em class="ok">whole river</em>` : ""}<em>${esc(r.type)}</em></span></button>`).join(""); box.classList.add("open");
    box.querySelectorAll(".xres").forEach(bt => bt.onclick = () => { const r = list[+bt.dataset.i]; box.classList.remove("open"); box.innerHTML = ""; XR.stack = []; loadRiver(r).catch(e => { console.error(e); xstatus(esc(e.message), "err"); }); });
    xstatus(`${list.length} waterway${list.length > 1 ? "s" : ""} here: pick one.`, "ok");
  } catch(e){ xstatus("Pick on map: " + esc(e.message), "err"); }
}

/* ---------- drawing of measurement geometry on the map ---------- */
function drawMapExtras(ctx, M, w, h){
  try { if (drawWidthOnMap(ctx, M)) drawMapLegend(ctx, w, h); } catch(e){ console.warn(e); }
  const R = XR.river, line = (pts, close) => { ctx.beginPath(); pts.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); if (close) ctx.closePath(); };
  ctx.save(); ctx.lineJoin = ctx.lineCap = "round";
  if (R){
    // width transects (Channel geometry)
    if ((XR.tab === "reaches" && !(R.reaches || []).some(r => r.width && r.width.stations)) || XR.mode === "transect") for (const r of R.reaches || []) for (const t of (r.width && r.width.tr) || []){ ctx.strokeStyle = t.off ? "rgba(255,90,90,.9)" : t.n > 1 ? "#ffd84a" : "#43d9e8"; ctx.lineWidth = t.off ? 1 : 1.6; ctx.setLineDash(t.off ? [3, 3] : []); line([t.a, t.b]); ctx.stroke(); }
    ctx.setLineDash([]);
    // floodplain cross-sections
    if (XR.tab === "floodplain" && R.fp) for (const q of R.fp.secs){ if (!q.ends) continue; ctx.strokeStyle = "rgba(76,209,122,.85)"; ctx.lineWidth = 1.4; line(q.ends); ctx.stroke(); if (q.vends){ ctx.strokeStyle = "rgba(255,216,74,.45)"; ctx.lineWidth = 1; line(q.vends); ctx.stroke(); } }
    if ((XR.tab === "floodplain" || XR.tab === "delta") && R.oxbows) for (const o of R.oxbows){ ctx.fillStyle = "rgba(201,167,255,.35)"; ctx.strokeStyle = "#c9a7ff"; ctx.lineWidth = 1.5; line(o.ring, true); ctx.fill(); ctx.stroke(); }
    // delta: mouths, apex, bifurcations
    if (XR.tab === "delta" && R.delta && !R.delta.single){ const D = R.delta; for (const p of D.mouthPts){ const q = M.toScr(p[0], p[1]); ctx.fillStyle = "#4aa8ff"; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fill(); }
      for (const b of D.bifs || []){ const q = M.toScr(b.p[0], b.p[1]); ctx.strokeStyle = "#ff8a4c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke(); }
      const a = M.toScr(D.apex[0], D.apex[1]); ctx.fillStyle = "#ff8a4c"; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 8); ctx.lineTo(a[0] + 7, a[1] + 5); ctx.lineTo(a[0] - 7, a[1] + 5); ctx.closePath(); ctx.fill(); }
    // sediment zones as a halo along the river
    if (XR.tab === "sediment") for (const r of R.reaches || []){ if (!r.zone) continue; ctx.strokeStyle = ZCOL3[r.zone] || "#999"; ctx.globalAlpha = .55; ctx.lineWidth = 12; line(resampleKm(R, r.k0, r.k1, Math.max(.05, r.L/80))); ctx.stroke(); ctx.globalAlpha = 1; }
    // digitised features
    for (const f of R.digit || []){ const c = DCOL[f.kind] || "#fff"; ctx.strokeStyle = c; ctx.fillStyle = c + "33"; ctx.lineWidth = 2.2; line(f.pts, !f.line); if (!f.line) ctx.fill(); ctx.stroke(); }
  }
  if (XR.dig && XR.dig.pts.length){ ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); line(XR.dig.pts, !XR.dig.line && XR.dig.pts.length > 2); ctx.stroke(); ctx.setLineDash([]); for (const p of XR.dig.pts){ const q = M.toScr(p[0], p[1]); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fill(); } }
  ctx.restore();
}
const DCOL = {belt: "#c9a7ff", water: "#4aa8ff", floodplain: "#4cd17a", lobe: "#c9a7ff", shoreline: "#4aa8ff", delta: "#ff8a4c", terrace: "#ffd84a", channel: "#43d9e8", oxbow: "#c9a7ff"};
const ZCOL3 = {source: "#e8452c", transfer: "#f7b733", storage: "#4aa8ff", sink: "#9b6bff", unknown: "#bdbdbd"};

/* ---------- 2. channel geometry: amplitude, valley sinuosity, braiding, distributions ---------- */
function geomExtras(R, r){
  if (r.amp !== undefined) return; const step = clamp(r.L/600, .02, .5), a = pointAtKm(R, r.k0), b = pointAtKm(R, r.k1), lat0 = (a[0] + b[0])/2, lon0 = (a[1] + b[1])/2, P = toLocal(resampleKm(R, r.k0, r.k1, step), lat0, lon0), n = P.length;
  if (n < 10){ r.amp = NaN; return; }
  // valley axis: centreline smoothed over about one meander wavelength
  const span = Math.max(3, Math.round((Number.isFinite(r.lambda) ? r.lambda*(r.sin || 1) : r.L/4)/step/2)) /* one wavelength measured along the channel path */, ax = P.map((_, j) => { let x = 0, y = 0, c = 0; for (let t = -span; t <= span; t++){ const q = P[clamp(j + t, 0, n - 1)]; x += q[0]; y += q[1]; c++; } return [x/c, y/c]; });
  let axL = 0; for (let j = 1; j < n; j++) axL += Math.hypot(ax[j][0] - ax[j-1][0], ax[j][1] - ax[j-1][1]);
  const dev = P.map((p, j) => { const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1), tx = ax[j1][0] - ax[j0][0], ty = ax[j1][1] - ax[j0][1], tl = Math.hypot(tx, ty) || 1; return ((p[0] - ax[j][0])*(-ty) + (p[1] - ax[j][1])*tx)/tl; });
  const peaks = []; let cur = 0, sg = 0; for (const v of dev){ const s2 = Math.sign(v); if (s2 && s2 !== sg){ if (sg) peaks.push(cur); cur = 0; sg = s2; } cur = Math.max(cur, Math.abs(v)); }
  r.halfAmp = peaks.length ? median(peaks) : NaN; r.amp = 2*r.halfAmp; r.valleyL = axL; r.valleySin = r.L/Math.max(1e-6, axL);
}
function recomputeWidths(R){ for (const r of R.reaches || []){ const W = r.width; if (!W || !W.tr) continue; const ok = W.tr.filter(t => !t.off).map(t => t.w).filter(Number.isFinite); if (ok.length > 3){ W.med = median(ok); W.p10 = quantile(ok, .1); W.p90 = quantile(ok, .9); W.braid = W.tr.filter(t => !t.off).reduce((s, t) => s + t.n, 0)/ok.length; W.edited = W.tr.filter(t => t.off).length; } if (Number.isFinite(r.Rc) && W.med) r.RcW = r.Rc*1000/W.med; } }

/* ---------- 3. drainage network: junction angles, pattern ---------- */
function junctionAngles(R){
  for (const t of R.tribs){ if (t.jAng != null || !t.stub || t.stub.length < 3) continue; const i = idxAtKm(R, t.km), p = R.main[i];
    const st = t.distributary ? t.stub : t.stub.slice().reverse(); // ordered away from the junction
    let k = 1, d = 0; while (k < st.length - 1 && d < 2){ d = hav(p, st[k]); k++; } const far = st[Math.min(k, st.length - 1)];
    const dn = pointAtKm(R, Math.min(R.L, t.km + 2)), up = pointAtKm(R, Math.max(0, t.km - 2)), L0 = toLocal([up, dn, far, p], p[0], p[1]);
    const m = [L0[1][0] - L0[0][0], L0[1][1] - L0[0][1]], tv = t.distributary ? [L0[2][0], L0[2][1]] : [-L0[2][0], -L0[2][1]]; // tributary flow vector towards the junction
    const c = (m[0]*tv[0] + m[1]*tv[1])/(Math.hypot(...m)*Math.hypot(...tv) || 1); t.jAng = Math.acos(clamp(c, -1, 1))/D2R; }
}
function drainagePattern(R){
  junctionAngles(R); const a = R.tribs.filter(t => !t.distributary && Number.isFinite(t.jAng)).map(t => t.jAng); if (a.length < 5) return {cls: "not enough junctions (need ≥5)", n: a.length};
  const m = a.reduce((s, v) => s + v, 0)/a.length, sd = Math.sqrt(a.reduce((s, v) => s + (v - m)**2, 0)/a.length), right = a.filter(v => v > 70 && v < 110).length/a.length, low = a.filter(v => v < 35).length/a.length;
  const cls = right > .6 && sd < 18 ? "rectangular (near-orthogonal junctions, low spread)" : right > .5 ? "trellis (many right-angle junctions)" : low > .6 ? "parallel (tributaries join at low angles)" : "dendritic (acute junctions of varied angle)";
  return {cls, n: a.length, mean: m, sd, right, low};
}

/* ---------- 4. catchment: land cover (ESA WorldCover) and lithology (Macrostrat) ---------- */
const WCC = [[10, "Tree cover", [0, 100, 0]], [20, "Shrubland", [255, 187, 34]], [30, "Grassland", [255, 255, 76]], [40, "Cropland", [240, 150, 255]], [50, "Built-up", [250, 0, 0]], [60, "Bare / sparse", [180, 180, 180]], [70, "Snow & ice", [240, 240, 240]], [80, "Water", [0, 100, 200]], [90, "Wetland", [0, 150, 160]], [95, "Mangroves", [0, 207, 117]], [100, "Moss & lichen", [250, 230, 160]]];
function basinSamples(B, n){ const {g, inB} = B, idx = []; for (let i = 0; i < inB.length; i++) if (inB[i]) idx.push(i); const out = []; if (!idx.length) return out; const st = idx.length/n; for (let k = 0; k < n; k++){ const i = idx[Math.floor((k + .5)*st)]; out.push(gridLL(g, i % g.W, (i/g.W)|0)); } return out; }
async function enrichBasin(R, B){
  B.lc = {status: "loading"}; B.lith = {status: "loading"}; renderX(); actSet("lc", "Reading land cover (ESA WorldCover) for the catchment…");
  // land cover: read ESA WorldCover tile pixels at sample points
  try { const pts = basinSamples(B, 600), z = clamp(Math.round(Math.log2(40075016*Math.cos(B.outletLL[0]*D2R)/(256*Math.max(30, Math.sqrt(B.area*1e6/600))))), 4, 12), o = EX.over.wc, cnt = {}; let ok = 0, need = new Map();
    for (const p of pts){ const X = lon2x(p[1], z), Y = lat2y(p[0], z), k = Math.floor(X/256) + "/" + Math.floor(Y/256); (need.get(k) || need.set(k, []).get(k)).push([X, Y]); }
    for (const [k, list] of need){ const [x, y] = k.split("/").map(Number), t = getTile(o.url(z, x, y), true); await t.p; if (!t.ok) continue; let px; try { const c = document.createElement("canvas"); c.width = c.height = 256; const gx = c.getContext("2d"); gx.drawImage(t.img, 0, 0); px = gx.getImageData(0, 0, 256, 256).data; } catch(_){ throw new Error("the land-cover server does not allow reading its pixels"); }
      for (const [X, Y] of list){ const j = ((Math.floor(Y) & 255)*256 + (Math.floor(X) & 255))*4; if (px[j + 3] < 10) continue; let best = null, bd = 1e9; for (const c of WCC){ const d = (px[j] - c[2][0])**2 + (px[j+1] - c[2][1])**2 + (px[j+2] - c[2][2])**2; if (d < bd){ bd = d; best = c; } } if (best && bd < 2500){ cnt[best[1]] = (cnt[best[1]] || 0) + 1; ok++; } } }
    B.lc = ok ? {status: "ok", n: ok, z, frac: Object.fromEntries(Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v/ok]))} : {status: "unavailable", why: "no readable land-cover pixels"};
  } catch(e){ B.lc = {status: "unavailable", why: e.message}; }
  actEnd("lc"); renderX(); actSet("lith", "Reading geology (Macrostrat) for the catchment…");
  // lithology: Macrostrat map units at a few dozen points
  try { const pts = basinSamples(B, B.area > 1e5 ? 48 : 32), cnt = {}, ages = {}; let ok = 0;
    for (let k = 0; k < pts.length; k += 6){ actSet("lith", `Reading geology (Macrostrat) for the catchment… ${Math.round(k/pts.length*100)}%`); await Promise.all(pts.slice(k, k + 6).map(async p => { try { const j = await xfetchJSON(`https://macrostrat.org/api/v2/geologic_units/map?lat=${p[0].toFixed(4)}&lng=${p[1].toFixed(4)}&scale=small`, {}, 1, 12000); const u = j.success && j.success.data && j.success.data[0]; if (!u) return;
        const lith = (u.lith || u.name || "unknown").replace(/^(Major|Minor):?\s*/i, "").split(/[,;{}]/).map(s => s.trim()).filter(Boolean)[0] || "unknown"; cnt[lith] = (cnt[lith] || 0) + 1; const age = u.b_int_name || u.best_int_name; if (age) ages[age] = (ages[age] || 0) + 1; ok++; } catch(_){} })); }
    B.lith = ok ? {status: "ok", n: ok, frac: Object.fromEntries(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, v/ok])), ages: Object.entries(ages).sort((a, b) => b[1] - a[1]).slice(0, 5).map(a => a[0])} : {status: "unavailable", why: "Macrostrat returned no mapped units here"};
  } catch(e){ B.lith = {status: "unavailable", why: e.message}; }
  actEnd("lith");
}

/* ---------- 5. floodplain: area, cross-section profiles, terraces, oxbows ---------- */
function fpExtras(R){
  const fp = R.fp; if (!fp || fp.area != null) return; const s = fp.secs; let a = 0; for (let i = 1; i < s.length; i++) a += (s[i].fp + s[i - 1].fp)/2/1000*(s[i].km - s[i - 1].km); fp.area = a;
  for (const q of s){ if (!q.prof) continue; const {d, z} = q.prof, z0 = q.z0, benches = []; // terraces: benches clearly flatter than the valley side around them
    const sl = d.map((_, i) => i ? Math.abs(z[i] - z[i - 1])/Math.max(1, Math.abs(d[i] - d[i - 1])) : 0), side = sl.filter((v, i) => z[i] - z0 > fp.h*1.2), ref = side.length ? median(side) : 0;
    let run = []; for (let i = 1; i < d.length; i++){ const h = z[i] - z0; if (h > fp.h*1.2 && h < 150 && sl[i] < Math.min(.01, .3*ref)) run.push(i); else { if (run.length >= 4) benches.push(run); run = []; } }
    if (run.length >= 4) benches.push(run);
    q.terraces = benches.map(b => ({h: median(b.map(i => z[i] - z0)), w: Math.abs(d[b[b.length - 1]] - d[b[0]]), at: median(b.map(i => d[i]))})).filter(t => t.w > 2*fp.cell); }
}
async function loadOxbows(R){
  const s = R.fp || {k0: 0, k1: R.L}, pts = resampleKm(R, s.k0, s.k1, Math.max(.5, (s.k1 - s.k0)/200)); let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; for (const p of pts){ la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); }
  const pad = .05, bb = `${la0 - pad},${lo0 - pad},${la1 + pad},${lo1 + pad}`; xstatus("Looking for mapped oxbow lakes and abandoned channels…", "busy");
  const j = await overpass(`[out:json][timeout:90];(way["water"="oxbow"](${bb});relation["water"="oxbow"](${bb});way["natural"="water"]["water"="lake"]["name"~"[Oo]xbow|[Aa]ltarm|[Aa]ltwasser|[Mm]orta"](${bb}););out geom;`);
  R.oxbows = []; for (const e of j.elements || []){ const ring = e.geometry ? e.geometry.map(p => [p.lat, p.lon]) : (e.members || []).filter(m => m.role !== "inner" && m.geometry).flatMap(m => m.geometry.map(p => [p.lat, p.lon])); if (ring.length < 3) continue;
    const L = toLocal(ring, ring[0][0], ring[0][1]); let a = 0; for (let i = 0; i + 1 < L.length; i++) a += L[i][0]*L[i+1][1] - L[i+1][0]*L[i][1]; let bk = 0, bd = Infinity; const c = ring[0]; for (let i = 0; i < R.main.length; i += Math.max(1, Math.floor(R.main.length/3000))){ const d = hav(c, R.main[i]); if (d < bd){ bd = d; bk = R.cum[i]; } }
    R.oxbows.push({ring, area: Math.abs(a)/2, km: bk, dist: bd, name: e.tags && e.tags.name}); }
  R.oxbows.sort((a, b) => a.km - b.km); renderX(); xstatus(`${R.oxbows.length} oxbow lake${R.oxbows.length === 1 ? "" : "s"} mapped in OpenStreetMap along this stretch (only those tagged water=oxbow or named as such).`, "ok");
}

/* ---------- 6. delta: distributary paths, bifurcation angles, morphology ---------- */
function deltaExtras(R){
  const D = R.delta; if (!D || D.single || D.paths) return; const {out, coord} = R.graph, apexN = R.mainNodes[R.main.indexOf(D.apex)] ?? null;
  const start = R.mainNodes.find((n, i) => R.main[i] === D.apex) || [...D.nodes][0], mouths = new Set([...D.nodes].filter(n => !(out.get(n) || []).length));
  // shortest path (in length) from the apex to each mouth
  const dist = new Map([[start, 0]]), prev = new Map(), Q = [start]; while (Q.length){ Q.sort((a, b) => dist.get(b) - dist.get(a)); const n = Q.pop(); for (const m of out.get(n) || []){ const d = dist.get(n) + hav(coord.get(n), coord.get(m)); if (!dist.has(m) || d < dist.get(m)){ dist.set(m, d); prev.set(m, n); Q.push(m); } } }
  D.paths = [...mouths].filter(m => dist.has(m)).map(m => ({len: dist.get(m), mouth: coord.get(m)})).sort((a, b) => b.len - a.len);
  // bifurcation angles: directions of the two outgoing branches ~1.5 km downstream
  const walk = (a, b) => { let p = a, c = b, d = 0, k = 0; while (d < 1.5 && k < 400){ const o = out.get(c) || []; d += hav(coord.get(p), coord.get(c)); if (o.length !== 1) break; p = c; c = o[0]; k++; } return coord.get(c); };
  D.bifs = []; for (const n of D.nodes){ const o = out.get(n) || []; if (o.length < 2) continue; const p = coord.get(n), e1 = walk(n, o[0]), e2 = walk(n, o[1]), L = toLocal([p, e1, e2], p[0], p[1]), c = (L[1][0]*L[2][0] + L[1][1]*L[2][1])/(Math.hypot(...L[1])*Math.hypot(...L[2]) || 1); D.bifs.push({p, ang: Math.acos(clamp(c, -1, 1))/D2R}); }
  D.density = D.chanLen/Math.max(1e-6, D.area);
  // morphology (interpretation): elongation of the distributary fan and number of mouths
  const el = D.length/Math.max(1e-6, 2*Math.sqrt(D.area/Math.PI)), nm = D.mouths;
  D.morph = el > 1.6 && nm <= 6 ? "elongate / bird-foot: suggests river-dominated progradation" : D.opening > 120 && nm >= 4 ? "lobate to arcuate fan: mixed river–wave influence" : nm <= 2 && D.opening < 45 ? "few, narrow mouths: possibly wave- or tide-modified (cuspate / estuarine)" : "lobate: river-dominated with some reworking";
  D.elong = el;
}

/* ---------- 8. sediment routing: weights and terminal sinks ---------- */
XR.sw = {slope: 2, conf: 1, multi: 1, power: 1, delta: 2, dam: .5};
function classifyZones3(R){
  const rs = R.reaches; if (!rs || !rs.length || !R.prof) return; const W = XR.sw, ZO = XR.zoneOpt, S = rs.map(r => r.slope).filter(Number.isFinite).sort((a, b) => a - b), rel = ZO.slopeMode !== "absolute", hi = rel ? quantile(S, .67) : ZO.hiAbs, lo = rel ? quantile(S, .33) : ZO.loAbs;
  R.zoneRule = {version: "efl-zones-2", slopeClasses: rel ? `within-river terciles (≤ ${nf(lo, 3)} gentle, ≥ ${nf(hi, 3)} m/km steep)` : `absolute thresholds (≤ ${ZO.loAbs} gentle, ≥ ${ZO.hiAbs} m/km steep)`, upstreamPrior: ZO.prior !== false, unknownMargin: ZO.unknownMargin, weights: {...W}};
  rs.forEach((r, i) => { const next = rs[i + 1], P = Number.isFinite(r.power) ? r.power : null, dP = P != null && next && Number.isFinite(next.power) ? (next.power - P)/Math.max(P, 1e-9) : 0, sc = {source: 0, transfer: 0, storage: 0}, why = [];
    if (!Number.isFinite(r.slope)){ why.push("no slope"); } else if (r.slope >= hi){ sc.source += W.slope; why.push("steep"); } else if (r.slope <= lo){ sc.storage += W.slope; why.push("gentle"); } else { sc.transfer += .75*W.slope; why.push("moderate slope"); }
    if (/^confined/.test(r.confClass || "")){ sc.source += .5*W.conf; sc.transfer += W.conf; why.push("confined valley"); } else if (/^unconfined/.test(r.confClass || "")){ sc.storage += 1.5*W.conf; why.push("wide floodplain"); } else if (r.confClass){ sc.transfer += W.conf; why.push("partly confined"); }
    if (r.multi > 1.15 || (r.width && r.width.braid > 1.3)){ sc.storage += W.multi; why.push("multiple channels"); }
    if (dP < -.25){ sc.storage += W.power; why.push("stream power falls downstream"); } else if (dP > .25){ sc.transfer += .5*W.power; why.push("stream power rises downstream"); }
    if (ZO.prior !== false && i < rs.length*.2){ sc.source += .5; why.push("upstream prior (first 20 %)"); }
    if (R.delta && !R.delta.single && r.k1 >= R.delta.apexKm){ sc.storage += W.delta; why.push("delta"); }
    const dams = R.dams.filter(d => d.km >= r.k0 && d.km <= r.k1); if (dams.length){ sc.storage += W.dam*dams.length; why.push(`${dams.length} dam/weir (barrier, reservoir trapping)`); }
    const ord = Object.entries(sc).sort((a, b) => b[1] - a[1]), margin = ord[0][1] - ord[1][1], nInd = why.length;
    r.zoneScores = {...sc}; r.zonePredictors = {slope_m_per_km: r.slope, slopeClass: !Number.isFinite(r.slope) ? null : r.slope >= hi ? "steep" : r.slope <= lo ? "gentle" : "moderate", confClass: r.confClass || null, multi: r.multi, braid: r.width ? r.width.braid : null, powerChange: dP, dams: dams.length, delta: !!(R.delta && !R.delta.single && r.k1 >= R.delta.apexKm)};
    const evid = why.filter(w => !/prior|no slope/.test(w)).length;
    r.zone = margin < (ZO.unknownMargin ?? .5) || evid === 0 ? "unknown" : ord[0][0]; r.zoneWhy = why.join(", ") + (r.zone === "unknown" ? (evid ? `; top two zones within ${nf(margin, 2)} points — unknown` : "; no independent indicator — unknown") : ""); r.barrier = dams.length;
    // evidence strength (rule-based, not a calibrated probability): how clearly the top zone wins and how many indicators were available
    r.zoneConf = margin >= 2 && nInd >= 3 ? "strong" : margin >= 1 && nInd >= 2 ? "moderate" : "weak"; r.zoneMargin = margin; });
  // terminal sink: the last reach into the sea, a lake or a delta
  // terminal sink only where the river ends in a delta or at sea level; a river joining another river passes its sediment on
  const last = rs[rs.length - 1], delta = R.delta && !R.delta.single, sea = R.prof.zMouth != null && R.prof.zMouth <= 5;
  if (last && (delta || sea)){ last.zone = "sink"; last.zoneWhy = (delta ? "mapped delta, " : "") + `outlet at ${nf(R.prof.zMouth)} m: terminal receiving basin`; last.zoneConf = delta && sea ? "strong" : "moderate"; }
  else if (last){ last.zoneWhy += (last.zoneWhy ? "; " : "") + `outlet at ${nf(R.prof.zMouth)} m without a delta: likely joins another river or basin (not a terminal sink)`; R.outletNote = "joins another river or basin"; }
}

/* ---------- comparison: cross-plots, histograms, box plots, synced slider ---------- */
const CXM = {
  dist: {n: "Relative downstream distance", get: (r, c) => ((r.k0 + r.k1)/2 - c.k0)/(c.k1 - c.k0)}, km: {n: "Downstream distance (km)", get: (r, c) => (r.k0 + r.k1)/2 - c.k0},
  area: {n: "Drainage area (km²)", get: r => r.A, log: true}, slope: {n: "Gradient (m/km)", get: r => r.slope, log: true}, sin: {n: "Sinuosity", get: r => r.sin}, width: {n: "Channel width (m)", get: r => r.width && r.width.med, log: true},
  lambda: {n: "Meander wavelength (km)", get: r => r.lambda, log: true}, curv: {n: "Mean curvature (rad/km)", get: r => r.meanK, log: true}, ksn: {n: "Steepness ksn", get: r => r.ksn, log: true}, fp: {n: "Floodplain width (m)", get: r => r.fpW, log: true},
  conf: {n: "Floodplain ÷ channel width", get: r => r.confine, log: true}, braid: {n: "Braiding index", get: r => r.width && r.width.braid}, amp: {n: "Meander amplitude (km)", get: r => r.amp, log: true},
  store: {n: "Storage potential (0 source, 1 storage)", get: r => r.zone ? {source: 0, transfer: .5, storage: 1, sink: 1}[r.zone] : NaN}};
XR.cx = {x: "area", y: "width", kind: "scatter"};
function cmpReaches(c){ const R = c.R; (R.reaches || []).forEach(r => { if (r.meanK == null) curvatureStats(R, r); geomExtras(R, r); }); return (R.reaches || []).filter(r => r.k1 > c.k0 && r.k0 < c.k1); }
function compareStudio(){
  const el = $("xCmpStudio"); if (!el) return; const C = XR.cmp; if (!C.length){ el.innerHTML = ""; return; }
  const opt = sel => Object.entries(CXM).map(([k, m]) => `<option value="${k}"${k === sel ? " selected" : ""}>${m.n}</option>`).join("");
  el.innerHTML = `<h4>Plot studio</h4><div class="row"><select id="xCxK"><option value="scatter"${XR.cx.kind === "scatter" ? " selected" : ""}>Cross-plot</option><option value="hist"${XR.cx.kind === "hist" ? " selected" : ""}>Histogram</option><option value="box"${XR.cx.kind === "box" ? " selected" : ""}>Box plot</option><option value="ecdf"${XR.cx.kind === "ecdf" ? " selected" : ""}>Cumulative distribution (ECDF)</option></select>${XR.cx.kind === "scatter" ? `<label>x</label><select id="xCxX">${opt(XR.cx.x)}</select>` : ""}<label>${XR.cx.kind === "scatter" ? "y" : "of"}</label><select id="xCxY">${opt(XR.cx.y)}</select></div>
    <div class="chips">${[["area", "width", "Width vs drainage area"], ["slope", "sin", "Sinuosity vs gradient"], ["width", "lambda", "Wavelength vs width"], ["curv", "width", "Width vs curvature"], ["ksn", "dist", "ksn downstream"], ["conf", "fp", "Floodplain vs confinement"], ["dist", "store", "Storage potential downstream"]].map(([x, y, t]) => `<button class="chip" data-cxp="${x},${y}">${t}</button>`).join("")}</div>
    <div class="xchart" id="xcCx"></div><p class="note" id="xCxNote"></p>
    <h4>Synchronised position</h4><div class="row"><input type="range" id="xCmpSync" min="0" max="100" value="${Math.round((XR.cmpCursor ?? 0)*100)}" style="flex:1"><span id="xCmpSyncV">${Math.round((XR.cmpCursor ?? 0)*100)}% of downstream distance</span></div><div id="xCmpSyncT"></div>`;
  $("xCxK").onchange = e => { XR.cx.kind = e.target.value; compareStudio(); }; if ($("xCxX")) $("xCxX").onchange = e => { XR.cx.x = e.target.value; drawCx(); }; $("xCxY").onchange = e => { XR.cx.y = e.target.value; drawCx(); };
  el.querySelectorAll("[data-cxp]").forEach(b => b.onclick = () => { const [x, y] = b.dataset.cxp.split(","); XR.cx = {x, y, kind: "scatter"}; compareStudio(); });
  $("xCmpSync").oninput = e => { XR.cmpCursor = +e.target.value/100; XR.cmpAxis = "norm"; $("xCmpSyncV").textContent = `${e.target.value}% of downstream distance`; syncTable(); try { compareCharts(); document.querySelectorAll(".cmpmap").forEach(cv => drawMini(cv, XR.cmp[+cv.dataset.ci], CMPC[+cv.dataset.ci])); } catch(_){} };
  drawCx(); syncTable();
}
function syncTable(){ const el = $("xCmpSyncT"); if (!el) return; const u = XR.cmpCursor ?? 0;
  el.innerHTML = `<div class="scroll"><table class="grid"><tr><th></th>${XR.cmp.map((c, i) => `<th style="color:${CMPC[i]}">${esc(c.label)}</th>`).join("")}</tr>${[["km from start", c => nf((c.k1 - c.k0)*u, 1)], ["Elevation", c => { const pr = c.R.prof; if (!pr) return "–"; const i = Math.min(pr.zc.length - 1, Math.round((c.k0 + (c.k1 - c.k0)*u)/pr.step)); return nf(pr.zc[i]) + " m"; }], ["Slope", c => { const pr = c.R.prof; if (!pr) return "–"; const i = Math.min(pr.s.length - 1, Math.round((c.k0 + (c.k1 - c.k0)*u)/pr.step)); return nf(pr.s[i], 3) + " m/km"; }], ["Reach sinuosity", c => { const r = reachAt(c.R, c.k0 + (c.k1 - c.k0)*u); return r ? nf(r.sin, 2) : "–"; }], ["Width", c => { const r = reachAt(c.R, c.k0 + (c.k1 - c.k0)*u); return r && r.width && Number.isFinite(r.width.med) ? nf(r.width.med) + " m" : "–"; }], ["Zone", c => { const r = reachAt(c.R, c.k0 + (c.k1 - c.k0)*u); return r && r.zone ? r.zone : "–"; }]].map(([n, f]) => `<tr><td>${n}</td>${XR.cmp.map(c => `<td>${f(c)}</td>`).join("")}</tr>`).join("")}</table></div>`; }
function drawCx(){
  const C = XR.cmp, el = $("xcCx"); if (!el) return; const X = CXM[XR.cx.x], Y = CXM[XR.cx.y], k = XR.cx.kind;
  const data = C.map((c, i) => { const rs = cmpReaches(c); return {c, i, xs: rs.map(r => X.get(r, c)), ys: rs.map(r => Y.get(r, c))}; });
  if (k === "scatter"){ const lx = X.log, ly = Y.log, tr = (v, lg) => lg ? (v > 0 ? Math.log10(v) : NaN) : v;
    const ser = data.map(d => { const xs = [], ys = []; d.xs.forEach((x, j) => { const a = tr(x, lx), b = tr(d.ys[j], ly); if (Number.isFinite(a) && Number.isFinite(b)){ xs.push(a); ys.push(b); } }); return {x: xs, y: ys, c: CMPC[d.i], dots: true, r: 3.5, n: xs.length}; });
    svgChart(el, {h: 260, xlab: (lx ? "log₁₀ " : "") + X.n, ylab: (ly ? "log₁₀ " : "") + Y.n, series: ser});
    const fits = ser.map((s, i) => { if (s.x.length < 4) return `${esc(C[i].label)}: ${s.x.length} reaches with both values`; const mx = s.x.reduce((a, b) => a + b)/s.x.length, my = s.y.reduce((a, b) => a + b)/s.y.length; let sxy = 0, sxx = 0, syy = 0; s.x.forEach((v, j) => { sxy += (v - mx)*(s.y[j] - my); sxx += (v - mx)**2; syy += (s.y[j] - my)**2; }); const b = sxy/sxx, r = sxy/Math.sqrt(sxx*syy); return `${esc(C[i].label)}: slope ${nf(b, 3)}${lx && ly ? " (power-law exponent)" : ""}, r = ${nf(r, 2)}, n = ${s.x.length}`; });
    $("xCxNote").innerHTML = fits.join("<br>") + `<br>Each point is one reach. Missing values (e.g. widths not yet measured, catchment not yet run) are left out.`; return; }
  const vals = data.map(d => d.ys.filter(Number.isFinite)), all = vals.flat(); if (!all.length){ el.innerHTML = `<p class="note">No values yet for ${esc(Y.n)}.</p>`; $("xCxNote").textContent = ""; return; }
  const lg = Y.log && all.every(v => v > 0), T = v => lg ? Math.log10(v) : v, lo = Math.min(...all.map(T)), hi = Math.max(...all.map(T));
  if (k === "ecdf"){ svgChart(el, {h: 240, xlab: (lg ? "log₁₀ " : "") + Y.n, ylab: "Cumulative share of reaches", y0: 0, series: vals.map((v, i) => { const s2 = v.map(T).sort((a, b) => a - b); return {x: s2, y: s2.map((_, j) => (j + 1)/s2.length), c: CMPC[i], w: 2}; })});
    $("xCxNote").textContent = vals.map((v, i) => `${C[i].label}: n=${v.length}, P10 ${tfmt(quantile(v, .1))}, P50 ${tfmt(quantile(v, .5))}, P90 ${tfmt(quantile(v, .9))}`).join(" · "); return; }
  if (k === "hist"){ const nb = 16, bw = (hi - lo)/nb || 1, edges = Array.from({length: nb}, (_, b) => lo + (b + .5)*bw);
    svgChart(el, {h: 240, xlab: (lg ? "log₁₀ " : "") + Y.n, ylab: "Share of reaches (%)", y0: 0, series: vals.map((v, i) => { const h = new Array(nb).fill(0); v.forEach(x => h[Math.min(nb - 1, Math.floor((T(x) - lo)/bw))]++); return {x: edges.map(e => e + (i - (vals.length - 1)/2)*bw*.25), y: h.map(c => c/Math.max(1, v.length)*100), c: CMPC[i], bars: true, bw: Math.max(3, 200/nb/vals.length), base: 0}; })});
    $("xCxNote").textContent = vals.map((v, i) => `${C[i].label}: n=${v.length}, median ${tfmt(median(v))}`).join(" · "); return; }
  // box plots: one box per system
  const W = Math.max(280, el.clientWidth || 360), H = 240, m = {l: 54, r: 12, t: 12, b: 34}, pw = W - m.l - m.r, ph = H - m.t - m.b, Yp = v => m.t + ph - (T(v) - lo)/((hi - lo) || 1)*ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xsvg">`; for (const t of niceTicks(lo, hi, 4)){ const yy = m.t + ph - (t - lo)/((hi - lo) || 1)*ph; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="gl"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${esc(lg ? tfmt(10**t) : tfmt(t))}</text>`; }
  vals.forEach((v, i) => { if (!v.length) return; const cx = m.l + pw*(i + .5)/vals.length, bw = Math.min(60, pw/vals.length*.5), q = [0, .25, .5, .75, 1].map(p => quantile(v, p)), c = CMPC[i];
    s += `<line x1="${cx}" x2="${cx}" y1="${Yp(q[0])}" y2="${Yp(q[4])}" stroke="${c}"/><rect x="${cx - bw/2}" y="${Yp(q[3])}" width="${bw}" height="${Math.max(1, Yp(q[1]) - Yp(q[3]))}" fill="${c}33" stroke="${c}"/><line x1="${cx - bw/2}" x2="${cx + bw/2}" y1="${Yp(q[2])}" y2="${Yp(q[2])}" stroke="#fff" stroke-width="2"/><text x="${cx}" y="${H - 14}" text-anchor="middle" fill="${c}">${esc(C[i].label.slice(0, 22))}</text>`; });
  s += `<text transform="translate(12 ${m.t + ph/2}) rotate(-90)" text-anchor="middle" class="al">${esc((lg ? "log scale: " : "") + Y.n)}</text></svg>`; el.innerHTML = s;
  $("xCxNote").textContent = "Boxes: interquartile range, white line: median, whiskers: minimum and maximum over the reaches.";
}

/* ---------- method & provenance notes ---------- */
function provHTML(k, R){
  const pr = R.prof, rows = {
    profile: [["Data", pr ? demLabel(pr, true, true) : "–"], ["Centreline", R.osm.startsWith("relation") || R.osm.startsWith("way") ? "OpenStreetMap waterway ways (ODbL), longest directed path source → mouth" : R.osm], ["Sampling", pr ? `every ${nf(pr.params.stepKm*1000)} m; minimum of 3×3 cells; median smoothing over ${nf(pr.params.smoothKm, 2)} km; spikes removed: ${pr.spikes ? pr.spikes.length : 0}; conditioning: ${pr.params.cond}${pr.cond && pr.params.cond !== "none" ? ` (max lowering ${nf(pr.cond.max, 1)} m, ${km(pr.cond.km)} changed > 2 m)` : ""}; raw samples kept and exported` : "–"], ["Gradient", pr ? `elevation difference over a ${nf(pr.params.slopeKm, 2)} km window` : "–"], ["Knickpoints", pr ? `local slope > ${pr.params.kRatio}× surrounding slope and > ${pr.params.kDrop} m drop` : "–"], ["Concavity", "Langbein index 2A/(H·L); slope–area θ from S = ks·A^−θ (needs Catchment); ksn with θref = 0.45, A in m²"], ["Quality", "terrain cells of tens to hundreds of metres smooth out short steps; tall bridges, dams and dense forest can bias the surface"]],
    reaches: [["Data", "OpenStreetMap water areas (natural=water, waterway=riverbank) rasterised; centreline from OSM"], ["Width", `perpendicular transects every ${XR.trSp ? XR.trSp + " m" : "L/400"}; bank-to-bank distance inside the water areas; you can exclude bad transects on the map`], ["Sinuosity", "channel length ÷ straight distance (reach) and ÷ valley-axis length (axis = centreline smoothed over ~1 wavelength)"], ["Curvature", "turning angle per km on a Gaussian-smoothed centreline; bend radius = 1/peak |curvature|"], ["Wavelength / amplitude", "2 × median half-bend length; amplitude = 2 × median peak offset from the valley axis"], ["Braiding index", "separate water bodies crossed by each transect (OSM water areas)"], ["Quality", "OSM water areas may be missing or outdated; reaches drawn only as lines get no width"]],
    network: [["Data", "AWS Terrain Tiles resampled to ≤2.2 million cells over the basin window"], ["Method", "priority-flood depression filling (+ε), D8 steepest descent, accumulated area; channels = cells above the area threshold; Strahler ordering on that network; Rb and Rl as geometric means"], ["Junction angles", "between tributary flow (last ~2 km of the OSM tributary) and the main-stem flow direction"], ["Pattern", "interpretation from junction-angle statistics; not a mapped classification"], ["Quality", "dynamic delineation, not precomputed HydroBASINS; flat deltas, karst and endorheic areas route poorly"]],
    catchment: [["Data", "terrain as for the network; land cover ESA WorldCover 2021 (10 m, sampled at ≤600 points from map tiles); lithology Macrostrat map units at a few dozen points"], ["Method", "upstream contributing area of the outlet cell; perimeter from the raster boundary × π/4; circularity 4πA/P²; elongation 2√(A/π)/basin length; hypsometry from cell elevations"], ["Type", "dynamically delineated here (not a precomputed boundary)"], ["Quality", "basins touching the terrain window are flagged; coarse cells for very large basins"]],
    floodplain: [["Data", `AWS Terrain Tiles ${R.fp ? `zoom ${R.fp.z}, ≈${nf(R.fp.cell)} m cells` : ""}`], ["Method", `cross-sections perpendicular to the centreline; floodplain = continuous ground within ${R.fp ? R.fp.h : XR.fpH || 5} m of the channel bed, valley floor within 4× that height`], ["Confinement", "reported both ways: floodplain ÷ channel width (classes <2 confined, 2–10 partly confined, >10 unconfined) and channel ÷ valley-bottom width"], ["Terraces", "flat benches (<1% slope) higher than 1.2× the flood height in each cross-section: candidates only"], ["Oxbows", "OpenStreetMap lakes tagged water=oxbow (or named as such)"], ["Quality", "terrain noise and vegetation can widen or narrow the floodplain; check sections on the map"]],
    delta: [["Data", "OpenStreetMap channels of the river relation and ways touching it"], ["Method", "directed (distributive) network: apex = first main-stem split leading to different mouths; paths apex → mouths; bifurcation angles from branch directions ~1.5 km downstream; density = channel length ÷ hull area"], ["Morphology", "interpretation from elongation, opening angle and number of mouths: not a measured wave/tide index"], ["Quality", "incomplete mapping of small distributaries is common; shoreline change needs dated imagery (Temporal evolution) or digitised shorelines"]],
    time: [["Imagery", "Esri World Imagery Wayback (2014 → today, Maxar and others) and Sentinel-2 cloudless annual mosaics by EOX (2016–2023, 10 m)"], ["Water history", "JRC Global Surface Water 1984–2021 (Landsat, 30 m): occurrence, change, transitions, seasonality as map layers"], ["Change measurement", "two captured dates are aligned and differenced in the Lab (water masks, bank shift, migration)"], ["Caution", "water-level and seasonal differences, clouds, mosaicking seams and registration errors can look like erosion or accretion; treat results as potential change"]],
    sediment: [["Inputs", "reach gradient, confinement class, multi-channel / braiding index, stream-power proxy (area × slope) and its downstream change, dams, delta"], ["Weights", Object.entries(XR.sw).map(([k, v]) => `${k} ${v}`).join(", ")], ["Status", "a geomorphological interpretation of potential source, transfer, storage and sink zones: not measured sediment flux or a sediment budget"]],
  }[k];
  return rows ? `<details class="prov"><summary>Method, data & provenance</summary><table class="grid">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table></details>` : "";
}

/* ---------- panel rendering ---------- */
function renderModules3(){
  const R = XR.river; if (!R) return; const pr = R.prof, rs = R.reaches || [];
  rs.forEach(r => geomExtras(R, r)); if (R.delta && !R.delta.single) deltaExtras(R); if (R.fp) fpExtras(R); classifyZones3(R);
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  // 1. profile parameters
  const PP = XR.pp || {};
  set("x3-profile", `<h4>Parameters</h4><div class="pgrid"><label>Sampling interval (m)<input type="number" id="ppStep" min="20" step="10" value="${PP.step ? PP.step*1000 : pr ? Math.round(pr.params.stepKm*1000) : ""}"></label><label>Smoothing window (km)<input type="number" id="ppSm" min="0" step=".1" value="${PP.smoothKm || (pr ? +pr.params.smoothKm.toFixed(2) : "")}"></label><label>Gradient window (km)<input type="number" id="ppSl" min=".1" step=".1" value="${PP.slopeKm || (pr ? +pr.params.slopeKm.toFixed(2) : "")}"></label><label>Knickpoint sensitivity (× surrounding slope)<input type="number" id="ppKr" min="1.2" step=".1" value="${PP.kRatio || 2.5}"></label><label>Minimum knickpoint drop (m)<input type="number" id="ppKd" min="0" step="1" value="${PP.kDrop ?? 5}"></label><label>Conditioning<select id="ppCond">${[["iso", "Isotonic: least-squares downhill fit (recommended)"], ["min", "Running minimum: carve (old default)"], ["fill", "Running maximum: fill"], ["none", "None: smoothed samples"]].map(([v, t]) => `<option value="${v}"${(PP.cond || "iso") === v ? " selected" : ""}>${t}</option>`).join("")}</select></label><label>Spike removal<select id="ppDs"><option value="1"${PP.despike !== false ? " selected" : ""}>On: drop samples ≥ k·MAD from the local median</option><option value="0"${PP.despike === false ? " selected" : ""}>Off</option></select></label><label>Spike threshold k (× MAD)<input type="number" id="ppSk" min="2" step=".5" value="${PP.spikeK ?? 4}"></label><label>Vertical exaggeration of the chart<input type="range" id="ppVe" min="1" max="4" step=".25" value="${XR.vex || 1}"></label></div><div class="btns"><button class="sm pri" id="ppGo">Recalculate profile</button><button class="sm" id="ppReset">Defaults</button></div>${pr ? `<p class="note">Chart vertical exaggeration ≈ ${tfmt(profVE(R))}× (vertical m per horizontal m on screen).</p>` : ""}` + provHTML("profile", R));
  // 2. channel geometry extras
  const wtr = rs.flatMap(r => (r.width && r.width.tr) || []).filter(t => !t.off);
  set("x3-reaches", kv([["Valley-axis sinuosity (median)", nf(median(rs.map(r => r.valleySin).filter(Number.isFinite)), 2)], ["Meander amplitude (median)", km(median(rs.map(r => r.amp).filter(Number.isFinite)))], ["Mean flow direction", compass(bearingLL(R.main[0], R.main[R.main.length - 1]))], ["Braiding index (transects)", wtr.length ? nf(wtr.reduce((s, t) => s + t.n, 0)/wtr.length, 2) : "measure widths"], ["Transects", wtr.length ? `${wtr.length} used${rs.some(r => r.width && r.width.edited) ? `, ${rs.reduce((s, r) => s + ((r.width && r.width.edited) || 0), 0)} excluded by you` : ""}` : "–"]]) +
    `<div class="row"><label>Transect spacing (m)</label><input type="number" id="xTrSp" min="20" step="10" value="${XR.trSp || ""}" placeholder="auto" style="width:100px"><button class="sm" id="xTrEdit">Review transects on map</button></div>
    <h4>Width distribution</h4><div class="xchart" id="xcWHist"></div><h4>Curvature distribution</h4><div class="xchart" id="xcKHist"></div>
    <div class="scroll"><table class="grid"><tr><th>Reach</th><th>valley sinuosity</th><th>amplitude</th><th>bend radius</th><th>curvature</th><th>braiding</th><th>direction</th></tr>${rs.map(r => `<tr data-k="${(r.k0 + r.k1)/2}"><td>${r.i + 1}</td><td>${nf(r.valleySin, 2)}</td><td>${km(r.amp)}</td><td>${km(r.Rc)}</td><td>${nf(r.meanK, 3)}</td><td>${r.width && r.width.braid ? nf(r.width.braid, 2) : "–"}</td><td>${compass(r.az)}</td></tr>`).join("")}</table></div>` + provHTML("reaches", R));
  // 3. network extras
  const pat = drainagePattern(R), T = R.tribs.filter(t => !t.distributary);
  set("x3-network", `<h4>Tributary junctions (OpenStreetMap)</h4>${kv([["Junctions measured", String(pat.n)], ["Mean junction angle", Number.isFinite(pat.mean) ? nf(pat.mean) + "° ± " + nf(pat.sd) : "–"], ["Drainage pattern (interpretation)", esc(pat.cls)]])}
    <div class="xchart" id="xcJA"></div>
    <div class="scroll"><table class="grid"><tr><th>Tributary</th><th>joins at</th><th>bank</th><th>angle</th><th>length</th><th>basin</th><th></th></tr>${T.map(t => `<tr><td>${esc(t.name)}</td><td>${nf(t.km)} km</td><td>${t.side}</td><td>${Number.isFinite(t.jAng) ? nf(t.jAng) + "°" : "–"}</td><td>${t.len ? km(t.len) : "–"}</td><td>${t.area ? nf(t.area) + " km²" : "–"}</td><td><button class="sm" data-tsub="${R.tribs.indexOf(t)}">Catchment</button></td></tr>`).join("")}</table></div>` + provHTML("network", R));
  // 4. catchment extras
  const B = R.basin, O = R.ob, bx = (b, title) => !b ? "" : `<h4>${esc(title)}</h4>${kv([["Area", nf(b.area, b.area < 100 ? 1 : 0) + " km²"], ["Perimeter", km(b.perim)], ["Circularity ratio", nf(b.Rc, 2)], ["Elongation ratio", nf(b.Re, 2)], ["Mean elevation", nf(b.zmean) + " m"], ["Relief", nf(b.relief) + " m"], ["Hypsometric integral", nf(b.HI, 2)], ["Mean slope", nf(b.slopeMean, 1) + "°"], ["Strahler order", b.net ? String(b.net.maxO) : "–"], ["Drainage density", b.net ? nf(b.net.Dd, 3) + " km/km²" : "–"], ["Outlet", b.outletLL ? `${b.outletLL[0].toFixed(4)}°, ${b.outletLL[1].toFixed(4)}°` : "–"], ["Type", "delineated here from terrain"]])}${b.clipped ? `<p class="warn">Touches the terrain window: may be cut off.</p>` : ""}
    ${lcHTML(b.lc, "Land cover (ESA WorldCover 2021)")}${lcHTML(b.lith, "Lithology (Macrostrat, dominant unit)", b.lith && b.lith.ages)}`;
  set("x3-catchment", `<div class="btns"><button class="sm" id="xOutlet">🎯 Choose an outlet on the map</button>${O ? `<button class="sm" id="xObClear">Clear selected-outlet catchment</button>` : ""}</div>${bx(B, "Whole river (outlet at the mouth)")}${bx(O, O ? O.label : "")}<h4>Slope distribution</h4><div class="xchart" id="xcSlopeH"></div>` + provHTML("catchment", R));
  // 5. floodplain extras
  const fp = R.fp, sec = fp && fp.secs.length ? fp.secs.reduce((a, b) => Math.abs(b.km - XR.pos) < Math.abs(a.km - XR.pos) ? b : a) : null, fd = (R.digit || []).filter(f => f.kind === "floodplain");
  set("x3-floodplain", (fp ? kv([["Floodplain area (measured stretch)", nf(fp.area, 1) + " km²"], ["Channel ÷ valley-bottom width", nf(median(rs.filter(r => r.width && Number.isFinite(r.width.med) && r.valleyW).map(r => r.width.med/r.valleyW)), 3)], ["Terrace candidates", String(fp.secs.reduce((s, q) => s + (q.terraces || []).length, 0))], ["Channel-belt width", "needs dated centrelines: digitise them or use Temporal evolution"]]) : "") +
    `${sec && sec.prof ? `<h4>Cross-section at km ${nf(sec.km, 1)} (move the position slider)</h4><div class="xchart" id="xcXs"></div>${(sec.terraces || []).length ? `<p class="note">Terrace candidates here: ${sec.terraces.map(t => `${nf(t.h, 1)} m above the bed, ${nf(t.w)} m wide`).join("; ")}.</p>` : ""}` : ""}
    <div class="btns"><button class="sm" id="xOxb">Find oxbow lakes</button><button class="sm" data-dig="floodplain">✎ Digitise floodplain boundary</button><button class="sm" data-dig="terrace">✎ Digitise terrace</button><button class="sm" data-dig="oxbow">✎ Digitise abandoned channel</button></div>
    ${R.oxbows ? `<p class="note">${R.oxbows.length} mapped oxbow lake(s), total ${nf(R.oxbows.reduce((s, o) => s + o.area, 0), 2)} km²${R.oxbows.length ? `; nearest the channel at km ${R.oxbows.slice(0, 6).map(o => nf(o.km)).join(", ")}` : ""}.</p>` : ""}
    ${digTable(R, ["floodplain", "terrace", "oxbow"])}` + provHTML("floodplain", R));
  // 6. delta extras
  const D = R.delta;
  set("x3-delta", (D && !D.single ? kv([["Distributary density", nf(D.density, 3) + " km/km²"], ["Distributary paths apex → mouth", D.paths ? `${D.paths.length}: ${D.paths.slice(0, 6).map(p => km(p.len)).join(", ")}${D.paths.length > 6 ? "…" : ""}` : "–"], ["Bifurcation angle (median)", D.bifs && D.bifs.length ? nf(median(D.bifs.map(b => b.ang))) + "° (" + D.bifs.length + " splits)" : "–"], ["Elongation (length ÷ equivalent diameter)", nf(D.elong, 2)], ["Morphology (interpretation)", esc(D.morph || "–")]]) : "") +
    `<p class="note">Avulsion, distributary abandonment, mouth bars and lobe switching show up as change between dates: use the Temporal evolution tab (Wayback, Sentinel-2 years, JRC water transitions) at the mouth, and digitise what you see.</p>
    <div class="row"><label>Date of the line/lobe</label><input type="date" id="xDigDate" value="${XR.digDate || ""}"><button class="sm" data-dig="shoreline" data-line="1">✎ Digitise shoreline</button><button class="sm" data-dig="lobe">✎ Digitise depositional lobe</button><button class="sm" data-dig="delta">✎ Digitise delta boundary</button></div>
    ${shorelineChange(R)}${digTable(R, ["shoreline", "lobe", "delta"])}` + provHTML("delta", R));
  // 7. temporal extras
  const yrs = Object.entries(EX.base).filter(([, b]) => b.year);
  set("x3-time", `<h4>Compare on the map</h4><div class="row"><label>Left</label><select id="xSwA">${Object.entries(EX.base).map(([k, b]) => `<option value="${k}"${k === XR.base ? " selected" : ""}>${esc(b.n)}</option>`).join("")}</select><label>Right</label><select id="xSwB">${Object.entries(EX.base).map(([k, b]) => `<option value="${k}"${XR.swipe && k === XR.swipe.b ? " selected" : ""}>${esc(b.n)}</option>`).join("")}</select></div>
    <div class="row"><label>Swipe</label><input type="range" id="xSwX" min="0" max="100" value="${XR.swipe ? Math.round(XR.swipe.x*100) : 50}" style="flex:1"><button class="sm${XR.swipe ? " pri" : ""}" id="xSwOn">${XR.swipe ? "Swipe on" : "Swipe off"}</button></div>
    <div class="btns"><button class="sm" id="xAnim">${XR.anim ? "■ Stop animation" : "▶ Animate Sentinel-2 years"}</button>${yrs.map(([k, b]) => `<button class="chip${XR.base === k ? " on" : ""}" data-yr="${k}">${b.year}</button>`).join("")}</div>
    <h4>Water history 1984–2021 (JRC, Landsat)</h4><div class="chips">${Object.entries(EX.over).filter(([k]) => k.startsWith("gsw")).map(([k, o]) => `<button class="chip${XR.overlay === k ? " on" : ""}" data-ov="${k}">${esc(o.n.replace(" (JRC)", ""))}</button>`).join("")}<button class="chip" data-ov="">none</button></div>
    <p class="note">Transitions legend: blue permanent water, light blue new permanent, red lost permanent, green seasonal, orange new seasonal, pink lost seasonal (JRC). Change: green gain, red loss of water occurrence.</p>` + provHTML("time", R));
  // 8. sediment extras
  set("x3-sediment", `<h4>Classification weights</h4><div class="pgrid">${[["slope", "Gradient"], ["conf", "Confinement"], ["multi", "Multi-channel / braiding"], ["power", "Stream-power change"], ["delta", "Delta"], ["dam", "Dams & reservoirs"]].map(([k, n]) => `<label>${n} <b>${XR.sw[k]}</b><input type="range" data-sw="${k}" min="0" max="4" step=".25" value="${XR.sw[k]}"></label>`).join("")}</div>
    ${kv([["Barriers (dams & weirs)", String(R.dams.length)], ["Terminal sink", rs.length && rs[rs.length - 1].zone === "sink" ? esc(rs[rs.length - 1].zoneWhy) : "not identified (mouth above sea level or no delta)"], ["Connected pathway", R.dams.length ? `interrupted at ${R.dams.length} barrier(s): first at km ${nf(R.dams[0].km)}` : "continuous from source to mouth (no mapped barriers)"]])}` + provHTML("sediment", R));
  set("x3-compare", XR.cmp.length > 1 ? `<div class="card cmpq">${cmpQuality()}<div class="btns"><button class="sm pri" id="xCmpMatch">Match sampling & reach length</button></div></div><div id="xCmpStudio"></div>` : `<div id="xCmpStudio"></div>`); compareStudio();
  set("x3-data", `<h4>Project</h4><p class="note">Save everything you set up here (rivers, selected reaches, comparison, parameters, digitised features) and open it again later or share the file. Your last session is also kept in this browser.</p><div class="btns"><button class="sm pri" id="xProjSave">💾 Save project</button><label class="sm filebtn">📂 Open project<input type="file" id="xProjOpen" accept=".json,.eflproj" hidden></label></div><h4>Exports</h4><div class="btns"><button class="sm" id="xJson">⬇ All results JSON (with provenance)</button><button class="sm" id="xGeoAll">⬇ Measurement geometries GeoJSON</button><button class="sm" id="xReport">🖨 Printable report</button><button class="sm" id="xPng">⬇ Map PNG</button></div><p class="note">Every chart has its own ⬇ SVG / PNG buttons (hover or tap the chart).</p>`);
  wire3(R); autosave();
}
function lcHTML(o, title, ages){ if (!o) return ""; if (o.status === "loading") return `<p class="note shimmer">${title}: loading…</p>`; if (o.status !== "ok") return `<p class="note">${title}: unavailable (${esc(o.why || "")}).</p>`;
  return `<h4>${title}</h4><div class="lcbar">${Object.entries(o.frac).map(([k, v], i) => `<span style="flex:${v};background:${lcCol(k, i)}" title="${esc(k)} ${nf(v*100)}%"></span>`).join("")}</div><div class="zleg">${Object.entries(o.frac).map(([k, v], i) => `<span><i style="background:${lcCol(k, i)}"></i>${esc(k)} ${nf(v*100)}%</span>`).join("")}</div><p class="note">${o.n} sample points${o.z ? ` (tiles z${o.z})` : ""}${ages && ages.length ? `; dominant ages: ${ages.map(esc).join(", ")}` : ""}.</p>`; }
function lcCol(k, i){ const c = WCC.find(c => c[1] === k); return c ? `rgb(${c[2].join(",")})` : ["#c9a7ff", "#ff8a4c", "#43d9e8", "#ffd84a", "#4cd17a", "#e8452c", "#9fa8b3", "#4aa8ff", "#f096ff", "#b4b4b4"][i % 10]; }
function digTable(R, kinds){ const F = (R.digit || []).filter(f => kinds.includes(f.kind)); if (!F.length) return "";
  return `<div class="scroll"><table class="grid"><tr><th>Digitised</th><th>date</th><th>size</th><th>mean width</th><th></th></tr>${F.map(f => `<tr><td>${DIGN[f.kind] || f.kind}</td><td>${esc(f.date || "–")}</td><td>${f.line ? km(f.len) : nf(f.area, 3) + " km²"}</td><td>${Number.isFinite(f.meanW) ? nf(f.meanW) + " m" : "–"}</td><td><button class="sm" data-dx="${R.digit.indexOf(f)}">✕</button></td></tr>`).join("")}</table></div>`; }
function shorelineChange(R){
  const S = (R.digit || []).filter(f => f.kind === "shoreline" && f.date).sort((a, b) => a.date.localeCompare(b.date)); if (S.length < 2) return `<p class="note">Digitise two dated shorelines to measure progradation or retreat.</p>`;
  const a = S[0], b = S[S.length - 1], yrs = (new Date(b.date) - new Date(a.date))/3.15576e10, apex = R.delta && R.delta.apex;
  const dists = b.pts.map(p => { let best = Infinity; for (let i = 0; i + 1 < a.pts.length; i++) best = Math.min(best, segDist(p, a.pts[i], a.pts[i + 1])); return best; });
  let sign = 0; if (apex){ const ma = median(a.pts.map(p => hav(apex, p))), mb = median(b.pts.map(p => hav(apex, p))); sign = Math.sign(mb - ma); }
  const m = median(dists)*1000; return kv([["Shorelines compared", `${a.date} → ${b.date} (${nf(yrs, 1)} years)`], ["Median displacement", nf(m) + " m"], ["Rate", nf(m/yrs, 1) + " m/yr"], ["Direction", apex ? (sign > 0 ? "seaward: progradation" : sign < 0 ? "landward: retreat" : "no net change") : "needs a delta apex to tell seaward from landward"]]);
}
function segDist(p, a, b){ const L = toLocal([p, a, b], p[0], p[1]), [x0, y0] = L[0], [x1, y1] = L[1], [x2, y2] = L[2], dx = x2 - x1, dy = y2 - y1, t = clamp(((x0 - x1)*dx + (y0 - y1)*dy)/((dx*dx + dy*dy) || 1), 0, 1); return Math.hypot(x1 + t*dx - x0, y1 + t*dy - y0); }
function bearingLL(a, b){ const L = toLocal([a, b], a[0], a[1]); return (Math.atan2(L[1][0], -L[1][1])/D2R + 360) % 360; }
function profVE(R){ const pr = R.prof, el = $("xcProfile"); if (!pr || !el) return NaN; const W = Math.max(280, el.clientWidth || 360) - 66, H = 240*(XR.vex || 1) - 46, zr = Math.max(...pr.zc) - Math.min(...pr.zc); return (H/zr)/(W/(R.L*1000)); }

function wire3(R){
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on("ppGo", async () => { XR.pp = {step: (+$("ppStep").value || 0)/1000, smoothKm: +$("ppSm").value || 0, slopeKm: +$("ppSl").value || 0, kRatio: +$("ppKr").value || 2.5, kDrop: $("ppKd").value === "" ? 5 : +$("ppKd").value, cond: $("ppCond").value, despike: $("ppDs").value === "1", spikeK: +$("ppSk").value || 4}; xstatus("Recalculating the profile…", "busy"); try { await loadProfile(R, R.prof && R.prof.z); buildReaches(R); R.basin && alongRiverArea(R); renderX(); xstatus(`Profile recalculated: ${R.prof.knick.length} knickpoints.`, "ok"); } catch(e){ xstatus(esc(e.message), "err"); } });
  on("ppReset", async () => { XR.pp = null; XR.vex = 1; await loadProfile(R, R.prof && R.prof.z); buildReaches(R); renderX(); });
  const ve = $("ppVe"); if (ve) ve.oninput = e => { XR.vex = +e.target.value; renderCharts(); };
  const ts = $("xTrSp"); if (ts) ts.onchange = e => { XR.trSp = +e.target.value || 0; toast("Re-measure widths to apply the new spacing"); };
  on("xTrEdit", () => { if (!R.reaches.some(r => r.width && r.width.tr && r.width.tr.length)) return toast("Measure widths first"); xSetMode("transect"); showXTab("reaches"); });
  document.querySelectorAll("[data-tsub]").forEach(b => b.onclick = () => { const t = R.tribs[+b.dataset.tsub], p = t.stub[t.distributary ? Math.min(3, t.stub.length - 1) : Math.max(0, t.stub.length - 4)]; showXTab("catchment"); runOutletBasin(R, p, `${t.name} catchment`).catch(e => xstatus(esc(e.message), "err")); });
  on("xOutlet", () => xSetMode("outlet")); on("xObClear", () => { R.ob = null; renderX(); });
  on("xOxb", () => loadOxbows(R).catch(e => xstatus("Oxbows: " + esc(e.message), "err")));
  document.querySelectorAll("[data-dig]").forEach(b => b.onclick = () => { const date = $("xDigDate") ? $("xDigDate").value : ""; XR.digDate = date; if (b.dataset.dig === "shoreline" && !date) return toast("Set the date of the shoreline first"); xSetMode("dig", {kind: b.dataset.dig, line: !!b.dataset.line, date}); });
  const dd = $("xDigDate"); if (dd) dd.onchange = e => XR.digDate = e.target.value;
  document.querySelectorAll("[data-dx]").forEach(b => b.onclick = () => { R.digit.splice(+b.dataset.dx, 1); renderX(); });
  const swA = $("xSwA"), swB = $("xSwB"); if (swA) swA.onchange = e => { XR.base = e.target.value; $("xBase").value = XR.base; xmap.req(); }; if (swB) swB.onchange = e => { XR.swipe = {b: e.target.value, x: XR.swipe ? XR.swipe.x : .5}; renderX(); };
  const sx = $("xSwX"); if (sx) sx.oninput = e => { if (!XR.swipe) XR.swipe = {b: swB.value, x: .5}; XR.swipe.x = +e.target.value/100; xmap.req(); };
  on("xSwOn", () => { XR.swipe = XR.swipe ? null : {b: swB.value, x: +$("xSwX").value/100}; renderX(); });
  document.querySelectorAll("[data-yr]").forEach(b => b.onclick = () => { XR.base = b.dataset.yr; $("xBase").value = XR.base; xmap.req(); renderX(); });
  on("xAnim", () => { if (XR.anim){ clearInterval(XR.anim); XR.anim = null; renderX(); return; } const ks = Object.keys(EX.base).filter(k => EX.base[k].year); let i = 0; XR.anim = setInterval(() => { XR.base = ks[i++ % ks.length]; if ($("xBase")) $("xBase").value = XR.base; xstatus(`Showing ${EX.base[XR.base].n}`, "ok"); xmap.req(); }, 1400); renderX(); });
  document.querySelectorAll("[data-ov]").forEach(b => b.onclick = () => { XR.overlay = b.dataset.ov; if ($("xOver")) $("xOver").value = XR.overlay; xmap.req(); renderX(); });
  document.querySelectorAll("[data-sw]").forEach(b => b.onchange = e => { XR.sw[b.dataset.sw] = +e.target.value; renderX(); });
  on("xCmpMatch", () => matchSampling().catch(e => xstatus(esc(e.message), "err")));
  on("xProjSave", () => saveProject());
  const po = $("xProjOpen"); if (po) po.onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) f.text().then(t => openProject(JSON.parse(t))).catch(er => xstatus("Project: " + esc(er.message), "err")); };
  on("xJson", () => exportJSON(R)); on("xGeoAll", () => exportGeoAll(R)); on("xReport", () => printReport(R)); on("xPng", () => exportMapPNG());
}

/* ---------- charts of the extra modules ---------- */
function histSeries(v, nb, c, lg){ v = v.filter(x => Number.isFinite(x) && (!lg || x > 0)); if (!v.length) return null; const T = x => lg ? Math.log10(x) : x; let lo = Infinity, hi = -Infinity; for (const x of v){ const t = T(x); if (t < lo) lo = t; if (t > hi) hi = t; } const bw = (hi - lo)/nb || 1, h = new Array(nb).fill(0); v.forEach(x => h[Math.min(nb - 1, Math.floor((T(x) - lo)/bw))]++); return {x: h.map((_, b) => lo + (b + .5)*bw), y: h, c, bars: true, bw: 10, base: 0}; }
function moduleCharts3(){
  const R = XR.river; if (!R) return; const t = XR.tab;
  if (t === "reaches"){ const w = (R.reaches || []).flatMap(r => (r.width && r.width.tr || []).filter(q => !q.off).map(q => q.w)), hs = histSeries(w, 20, "#43d9e8", true);
    if (hs) svgChart($("xcWHist"), {h: 180, xlab: "log₁₀ channel width (m)", ylab: "Transects", y0: 0, series: [hs]}); else if ($("xcWHist")) $("xcWHist").innerHTML = `<p class="note">Measure widths to see their distribution.</p>`;
    const k = (R.reaches || []).map(r => r.meanK), hk = histSeries(k, 16, "#ff8a4c", false); if (hk) svgChart($("xcKHist"), {h: 170, xlab: "Mean curvature per reach (rad/km)", ylab: "Reaches", y0: 0, series: [hk]}); }
  if (t === "network"){ const a = R.tribs.filter(q => Number.isFinite(q.jAng)).map(q => q.jAng), ha = histSeries(a, 12, "#4cd17a", false); if (ha) svgChart($("xcJA"), {h: 170, xlab: "Junction angle (°)", ylab: "Tributaries", y0: 0, series: [ha]}); else if ($("xcJA")) $("xcJA").innerHTML = ""; }
  if (t === "catchment"){ const B = R.ob || R.basin, hs = B && B.slopes ? histSeries(B.slopes, 24, "#ffd84a", false) : null; if (hs){ svgChart($("xcSlopeH"), {h: 170, xlab: "Terrain slope (°)", ylab: "Cells (sample)", y0: 0, series: [hs]}); }
    if (R.ob && R.basin && $("xcHyps")) svgChart($("xcHyps"), {h: 220, xlab: "Relative area above (a/A)", ylab: "Relative height (h/H)", x0: 0, x1: 1, y0: 0, series: [{x: R.basin.curve.map(c => c[0]), y: R.basin.curve.map(c => c[1]), c: "#4cd17a", w: 2.4}, {x: R.ob.curve.map(c => c[0]), y: R.ob.curve.map(c => c[1]), c: "#ffd84a", w: 2.2}, {x: [0, 1], y: [1, 0], c: "rgba(255,255,255,.35)", w: 1, dash: true}]});
    else if (R.ob && $("xcHyps")) svgChart($("xcHyps"), {h: 220, xlab: "Relative area above (a/A)", ylab: "Relative height (h/H)", x0: 0, x1: 1, y0: 0, series: [{x: R.ob.curve.map(c => c[0]), y: R.ob.curve.map(c => c[1]), c: "#ffd84a", w: 2.2}]}); }
  if (t === "floodplain" && R.fp && $("xcXs")){ const sec = R.fp.secs.reduce((a, b) => Math.abs(b.km - XR.pos) < Math.abs(a.km - XR.pos) ? b : a); if (sec.prof) svgChart($("xcXs"), {h: 200, xlab: "Distance across the valley (m, left bank negative)", ylab: "Elevation (m)", series: [{x: sec.prof.d, y: sec.prof.z, c: "#c9b28a", w: 2}, {x: [sec.prof.d[0], sec.prof.d[sec.prof.d.length - 1]], y: [sec.z0 + R.fp.h, sec.z0 + R.fp.h], c: "#4aa8ff", w: 1.4, dash: true}, ...(sec.terraces || []).map(tq => ({x: [tq.at - tq.w/2, tq.at + tq.w/2], y: [sec.z0 + tq.h, sec.z0 + tq.h], c: "#ffd84a", w: 3}))]}); }
  addChartTools();
}

/* ---------- exports ---------- */
function addChartTools(){ document.querySelectorAll("#xBody .xchart").forEach(el => { if (el.querySelector(".ctool") || !el.querySelector("svg")) return; const d = document.createElement("div"); d.className = "ctool"; d.innerHTML = `<button class="sm" data-ct="svg">⬇ SVG</button><button class="sm" data-ct="png">⬇ PNG</button>`; el.appendChild(d);
  d.querySelectorAll("button").forEach(b => b.onclick = e => { e.stopPropagation(); chartExport(el, b.dataset.ct); }); }); }
function chartSVG(el){ const s = el.querySelector("svg").cloneNode(true); s.setAttribute("xmlns", "http://www.w3.org/2000/svg"); const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = "text{font:11px Inter,sans-serif;fill:#cfd6dd}.al{fill:#9aa5b1}.gl{stroke:rgba(255,255,255,.08)}.cur{stroke:#fff;stroke-dasharray:3 3}"; s.insertBefore(st, s.firstChild); const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#0d1418"); s.insertBefore(bg, st.nextSibling); return new XMLSerializer().serializeToString(s); }
async function chartExport(el, kind){ const R = XR.river, name = ((R ? R.name : "chart") + "_" + (el.id || "chart").replace(/^xc/, "")).replace(/[^\w]+/g, "_"), svg = chartSVG(el);
  if (kind === "svg") return save(name + ".svg", svg);
  const img = new Image(), url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"})); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; }); const c = document.createElement("canvas"); c.width = img.width*2; c.height = img.height*2; const g = c.getContext("2d"); g.scale(2, 2); g.drawImage(img, 0, 0); URL.revokeObjectURL(url);
  c.toBlob(b => save(name + ".png", b), "image/png"); }
function exportMapPNG(){ try { $("xMap").toBlob(b => save(((XR.river && XR.river.name) || "map").replace(/[^\w]+/g, "_") + "_map.png", b), "image/png"); } catch(e){ toast("This map's tiles don't allow exporting pixels; switch base map"); } }
function resultsJSON(R){
  const pr = R.prof, B = R.basin, strip = b => b && {label: b.label, outlet: b.outletLL, area_km2: b.area, perimeter_km: b.perim, relief_m: b.relief, zmin_m: b.zmin, zmax_m: b.zmax, zmean_m: b.zmean, hypsometric_integral: b.HI, hypsometric_curve: b.curve, elongation_ratio: b.Re, circularity_ratio: b.Rc, relief_ratio: b.reliefRatio, mean_slope_deg: b.slopeMean, edge_clipped: b.clipped, cell_m: b.cellKm*1000, terrain_zoom: b.g.z, network: b.net && {threshold_km2: b.net.At, max_order: b.net.maxO, counts: b.net.counts, lengths_km: b.net.lens, Rb: b.net.Rb, Rl: b.net.Rl, drainage_density: b.net.Dd, stream_frequency: b.net.freq}, land_cover: b.lc, lithology: b.lith, made: b.made};
  return {app: "Earthform Lens", exported: new Date().toISOString(), river: {name: R.name, region: R.region, source: R.osm, wikidata: R.wikidata, length_km: R.L, source_point: R.main[0], mouth_point: R.main[R.main.length - 1]},
    provenance: {centreline: "OpenStreetMap contributors (ODbL)", elevation: pr ? demLabel(pr) : null, facts: "Wikidata (CC0)", imagery: "Esri World Imagery / Wayback, EOX Sentinel-2 cloudless", water_history: "JRC Global Surface Water", land_cover: "ESA WorldCover 2021", lithology: "Macrostrat"},
    longitudinal_profile: pr && {params: pr.params, terrain_zoom: pr.z, cell_m: pr.res, source_elevation_m: pr.zSrc, mouth_elevation_m: pr.zMouth, fall_m: pr.drop, mean_gradient_m_per_km: pr.grad, langbein_concavity: pr.conc, slope_area_theta: pr.theta, ks: pr.ks, knickpoints: pr.knick, samples: pr.d.map((d, i) => [d, pr.zr[i], pr.zc[i], pr.s[i], pr.A ? pr.A[i] : null])},
    reaches: (R.reaches || []).map(r => ({i: r.i + 1, km: [r.k0, r.k1], length_km: r.L, sinuosity: r.sin, valley_sinuosity: r.valleySin, bends: r.bends, wavelength_km: r.lambda, amplitude_km: r.amp, bend_radius_km: r.Rc, mean_curvature_rad_km: r.meanK, azimuth_deg: r.az, gradient_m_km: r.slope, fall_m: r.drop, multichannel_index: r.multi, width_m: r.width && {median: r.width.med, p10: r.width.p10, p90: r.width.p90, cover: r.width.cover, braiding_index: r.width.braid, transects: (r.width.tr || []).length, excluded: r.width.edited || 0}, drainage_area_km2: r.A, ksn: r.ksn, floodplain_width_m: r.fpW, valley_width_m: r.valleyW, confinement_fp_over_channel: r.confine, confinement_class: r.confClass, sediment_zone: r.zone, zone_reasons: r.zoneWhy})),
    tributaries: R.tribs.map(t => ({name: t.name, km: t.km, bank: t.side, distributary: t.distributary, junction_angle_deg: t.jAng, length_km: t.len, basin_km2: t.area, discharge_m3s: t.q, osm_relation: t.rel, wikidata: t.wikidata, point: [t.lat, t.lon]})), drainage_pattern: drainagePattern(R),
    catchment: strip(B), selected_outlet_catchment: strip(R.ob),
    floodplain: R.fp && {flood_height_m: R.fp.h, cell_m: R.fp.cell, terrain_zoom: R.fp.z, area_km2: R.fp.area, sections: R.fp.secs.map(q => ({km: q.km, bed_m: q.z0, floodplain_m: q.fp, valley_m: q.valley, at_limit: q.capped, terraces: q.terraces}))}, oxbows: R.oxbows && R.oxbows.map(o => ({km: o.km, area_km2: o.area, name: o.name})),
    delta: R.delta && (R.delta.single ? {single_mouth: true} : {apex_km: R.delta.apexKm, apex: R.delta.apex, mouths: R.delta.mouths, bifurcations: R.delta.bif, channel_length_km: R.delta.chanLen, area_km2: R.delta.area, opening_deg: R.delta.opening, density: R.delta.density, paths_km: (R.delta.paths || []).map(p => p.len), bifurcation_angles_deg: (R.delta.bifs || []).map(b => b.ang), morphology_interpretation: R.delta.morph}),
    sediment_routing: {status: "interpretation of potential zones, not measured sediment flux", weights: XR.sw}, digitised: R.digit || [], user_layers: R.user ? Object.fromEntries(Object.entries(R.user).filter(([k]) => k !== "layers")) : null};
}
function exportJSON(R){ save(R.name.replace(/[^\w]+/g, "_") + "_earthform_results.json", JSON.stringify(resultsJSON(R), null, 1)); }
function exportGeoAll(R){ const F = [], P = (c, p) => F.push({type: "Feature", properties: p, geometry: {type: "Point", coordinates: [+c[1].toFixed(6), +c[0].toFixed(6)]}}), Ln = (cs, p) => F.push({type: "Feature", properties: p, geometry: {type: "LineString", coordinates: cs.map(c => [+c[1].toFixed(6), +c[0].toFixed(6)])}});
  Ln(R.main, {role: "main", name: R.name, length_km: R.L}); for (const t of R.tribs) P([t.lat, t.lon], {role: "junction", name: t.name, km: t.km, angle_deg: t.jAng}); for (const k of (R.prof && R.prof.knick) || []) P(pointAtKm(R, k.km), {role: "knickpoint", km: k.km, elevation_m: k.z, slope_m_km: k.slope});
  for (const r of R.reaches || []) for (const t of (r.width && r.width.tr) || []) Ln([t.a, t.b], {role: "channel_width", km: t.km, width_m: t.w, channels: t.n, excluded: t.off});
  for (const q of (R.fp && R.fp.secs) || []) if (q.ends) Ln(q.ends, {role: "floodplain_width", km: q.km, width_m: q.fp});
  for (const f of R.digit || []) F.push({type: "Feature", properties: {role: f.kind, date: f.date, area_km2: f.area, length_km: f.len}, geometry: f.line ? {type: "LineString", coordinates: f.pts.map(c => [c[1], c[0]])} : {type: "Polygon", coordinates: [[...f.pts, f.pts[0]].map(c => [c[1], c[0]])]}});
  for (const o of R.oxbows || []) F.push({type: "Feature", properties: {role: "oxbow", area_km2: o.area}, geometry: {type: "Polygon", coordinates: [o.ring.map(c => [c[1], c[0]])]}});
  if (R.delta && !R.delta.single){ P(R.delta.apex, {role: "delta_apex"}); for (const m of R.delta.mouthPts) P(m, {role: "mouth"}); }
  save(R.name.replace(/[^\w]+/g, "_") + "_measurements.geojson", JSON.stringify({type: "FeatureCollection", features: F})); }
function printReport(R){
  const J = resultsJSON(R), charts = [...document.querySelectorAll("#xBody .xchart svg")].slice(0, 0); // charts are re-rendered below per tab
  const sec = (t, rows) => `<h2>${t}</h2><table>${rows.filter(r => r && r[1] != null && r[1] !== "").map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
  const pr = R.prof, B = R.basin, D = R.delta;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(R.name)} — Earthform Lens report</title><style>body{font:12px/1.45 Inter,system-ui,sans-serif;max-width:820px;margin:24px auto;color:#111}h1{margin:0 0 4px}h2{font-size:15px;border-bottom:2px solid #ff7a45;padding-bottom:3px;margin-top:22px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top}td:first-child{width:42%;color:#555}.note{color:#666;font-size:11px}svg{max-width:100%;background:#0d1418;border-radius:8px}@media print{h2{break-after:avoid}}</style></head><body>
    <h1>${esc(R.name)}</h1><div class="note">${esc(R.region || "")} · ${esc(R.osm)} · exported ${new Date().toLocaleString()} · Earthform Lens</div>
    ${sec("River", [["Length traced", km(R.L)], ["Source", R.main[0].map(v => v.toFixed(4)).join(", ")], ["Mouth", R.main[R.main.length - 1].map(v => v.toFixed(4)).join(", ")], ["Tributaries / dams", `${R.tribs.length} / ${R.dams.length}`], ["Wikidata basin area", R.wd && R.wd.area ? nf(R.wd.area) + " km²" : null]])}
    ${pr ? sec("Longitudinal profile", [["Fall", nf(pr.drop) + " m"], ["Mean gradient", nf(pr.grad, 3) + " m/km"], ["Langbein concavity", nf(pr.conc, 2)], ["Slope–area θ", pr.theta != null ? nf(pr.theta, 2) : "run Catchment"], ["Knickpoints", pr.knick.map(k => `km ${nf(k.km)} (${nf(k.z)} m)`).join(", ") || "none"], ["Method", `AWS Terrain Tiles z${pr.z} (~${nf(pr.res)} m); step ${nf(pr.params.stepKm*1000)} m; smoothing ${nf(pr.params.smoothKm, 2)} km; knickpoint ${pr.params.kRatio}× / ${pr.params.kDrop} m`]]) : ""}
    ${sec("Channel geometry (median of reaches)", [["Sinuosity", nf(median((R.reaches || []).map(r => r.sin)), 2)], ["Valley sinuosity", nf(median((R.reaches || []).map(r => r.valleySin).filter(Number.isFinite)), 2)], ["Meander wavelength", km(median((R.reaches || []).map(r => r.lambda).filter(Number.isFinite)))], ["Amplitude", km(median((R.reaches || []).map(r => r.amp).filter(Number.isFinite)))], ["Width", nf(median((R.reaches || []).map(r => r.width && r.width.med).filter(Number.isFinite))) + " m"]])}
    ${B ? sec("Catchment & drainage network", [["Area", nf(B.area) + " km²"], ["Perimeter", km(B.perim)], ["Relief", nf(B.relief) + " m"], ["Hypsometric integral", nf(B.HI, 2)], ["Elongation / circularity", `${nf(B.Re, 2)} / ${nf(B.Rc, 2)}`], ["Mean slope", nf(B.slopeMean, 1) + "°"], ["Strahler order", R.net2 && R.net2.maxO], ["Bifurcation ratio", R.net2 && nf(R.net2.Rb, 2)], ["Drainage density", R.net2 && nf(R.net2.Dd, 3) + " km/km²"], ["Drainage pattern (interpretation)", J.drainage_pattern.cls]]) : ""}
    ${R.fp ? sec("Floodplain", [["Stretch", `km ${nf(R.fp.k0)}–${nf(R.fp.k1)}`], ["Median floodplain width", nf(median(R.fp.secs.map(s => s.fp))) + " m"], ["Area", nf(R.fp.area, 1) + " km²"], ["Flood height", R.fp.h + " m"]]) : ""}
    ${D && !D.single ? sec("Delta", [["Apex", `km ${nf(D.apexKm)}`], ["Mouths / bifurcations", `${D.mouths} / ${D.bif}`], ["Area", nf(D.area) + " km²"], ["Distributary density", nf(D.density, 3) + " km/km²"], ["Morphology (interpretation)", D.morph]]) : ""}
    ${sec("Sediment routing (interpretation)", [["Zones", ["source", "transfer", "storage", "sink"].map(z => `${z} ${nf((R.reaches || []).filter(r => r.zone === z).reduce((s, r) => s + r.L, 0)/R.L*100)}%`).join(" · ")], ["Barriers", String(R.dams.length)], ["Note", "potential zones from gradient, confinement, channel pattern, stream-power proxy, dams and delta; not a sediment budget"]])}
    <h2>Charts</h2>${[...document.querySelectorAll("#xBody .xchart")].filter(el => el.querySelector("svg") && el.offsetParent).map(el => chartSVG(el)).join("<br>")}
    <p class="note">Data: OpenStreetMap contributors (ODbL); AWS Terrain Tiles; Esri World Imagery; EOX Sentinel-2 cloudless; JRC Global Surface Water; ESA WorldCover; Macrostrat; Wikidata. Measurements carry the limitations listed in the app's “Method, data & provenance” notes.</p>
    <script>setTimeout(()=>print(),400)<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], {type: "text/html"})), w = window.open(url, "_blank"); if (!w) save(R.name.replace(/[^\w]+/g, "_") + "_report.html", html);
}

/* ---------- wiring of map tools ---------- */
{
  const ov = $("xOver"); if (ov){ ov.innerHTML = `<option value="">No overlay</option>` + Object.entries(EX.over).map(([k, o]) => `<option value="${k}">${esc(o.n)}</option>`).join(""); ov.onchange = e => { XR.overlay = e.target.value; xmap.req(); }; }
  const bs = $("xBase"); if (bs) bs.innerHTML = Object.entries(EX.base).filter(([k]) => !k.startsWith("__")).map(([k, b]) => `<option value="${k}"${k === XR.base ? " selected" : ""}>${b.n}</option>`).join("");
  $("xPick") && ($("xPick").onclick = () => xSetMode("pick"));
}

/* ---------- comparison quality: consistent sampling ---------- */
function cmpQuality(){
  const C = XR.cmp, P = C.map(c => c.R.prof), steps = P.map(p => p ? p.params.stepKm : NaN), res = P.map(p => p ? p.res : NaN), rl = C.map(c => c.R.reaches && c.R.reaches[0] ? c.R.reaches[0].L : NaN), lens = C.map(c => c.k1 - c.k0);
  const spread = a => { const v = a.filter(Number.isFinite); return v.length > 1 ? Math.max(...v)/Math.min(...v) : 1; }, flags = [];
  if (spread(steps) > 1.25) flags.push(`profile sampling differs (${steps.map(v => nf(v*1000) + " m").join(" vs ")})`);
  if (spread(res) > 1.6) flags.push(`terrain resolution differs (${res.map(v => "≈" + nf(v) + " m").join(" vs ")})`);
  if (spread(rl) > 1.25) flags.push(`reach lengths differ (${rl.map(v => km(v)).join(" vs ")}): sinuosity and wavelength depend on reach length`);
  if (spread(lens) > 1.5 && C.some(c => !(c.k0 === 0 && c.k1 === c.R.L))) flags.push(`selected stretches have different lengths (${lens.map(km).join(" vs ")})`);
  return flags.length ? `<p class="warn">Comparability: ${flags.join("; ")}. Use “Match sampling & reach length”, or compare normalised values.</p>` : `<p class="note">Comparability: sampling, terrain resolution and reach length are consistent across these systems.</p>`;
}
async function matchSampling(){
  const C = XR.cmp, Rs = [...new Set(C.map(c => c.R))], step = Math.max(...Rs.map(R => R.prof ? R.prof.params.stepKm : .1)), z = Math.min(...Rs.map(R => R.prof ? R.prof.z : 12)), rl = Math.min(...C.map(c => (c.k1 - c.k0)))/Math.max(4, Math.min(20, Math.round(Math.min(...C.map(c => c.k1 - c.k0))/5)));
  const keepPP = XR.pp, keepRK = XR.reachKm; XR.pp = {...(XR.pp || {}), step}; XR.reachKm = +rl.toFixed(2);
  try { let i = 0; for (const R of Rs){ i++; xstatus(`Matching sampling: recalculating ${esc(R.name)} (${i} of ${Rs.length}) at ${nf(step*1000)} m steps, terrain z${z}, ${km(XR.reachKm)} reaches…`, "busy"); await loadProfile(R, z); buildReaches(R); R.basin && alongRiverArea(R); }
    xstatus(`All ${Rs.length} systems now use ${nf(step*1000)} m profile sampling, terrain z${z} and ${km(XR.reachKm)} reaches. Re-measure widths if you need them at the new reaches.`, "ok");
  } finally { XR.pp = keepPP; if (XR.river && !Rs.includes(XR.river)) XR.reachKm = keepRK; }
  renderX();
}

/* ---------- persistent projects ---------- */
function riverRef(R){ const o = {osm: R.osm, name: R.name, region: R.region || "", reachKm: R.reaches && R.reaches[0] ? +R.reaches[0].L.toFixed(3) : 0, digit: R.digit || [], params: R.prof ? R.prof.params : null};
  if (!/^(relation|way|node)\//.test(R.osm)) o.main = R.main.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]), o.z = R.zUser || null, o.user = R.user ? {...R.user} : null; return o; }
function projectState(){ const rs = [...new Set([XR.river, ...XR.cmp.map(c => c.R), ...(XR.stack || [])].filter(Boolean))];
  return {app: "Earthform Lens project", version: 1, saved: new Date().toISOString(), rivers: rs.map(riverRef), current: XR.river ? rs.indexOf(XR.river) : -1, range: XR.range && XR.range.R ? {r: rs.indexOf(XR.range.R), k0: XR.range.k0, k1: XR.range.k1} : null,
    cmp: XR.cmp.map(c => ({r: rs.indexOf(c.R), k0: c.k0, k1: c.k1, label: c.label})), pp: XR.pp || null, sw: XR.sw, fpH: XR.fpH || 5, trSp: XR.trSp || 0, base: XR.base, overlay: XR.overlay, tab: XR.tab}; }
function saveProject(){ const P = projectState(); save(((XR.river && XR.river.name) || "earthform") .replace(/[^\w]+/g, "_") + "_project.json", JSON.stringify(P, null, 1)); toast("Project saved"); }
async function openProject(P){
  if (!P || !Array.isArray(P.rivers)) throw new Error("not an Earthform Lens project file");
  XR.pp = P.pp || null; if (P.sw) XR.sw = P.sw; XR.fpH = P.fpH || 5; XR.trSp = P.trSp || 0; if (P.base && EX.base[P.base]) XR.base = P.base; XR.overlay = P.overlay || "";
  const out = []; let i = 0;
  for (const ref of P.rivers){ i++; xstatus(`Opening project: river ${i} of ${P.rivers.length} (${esc(ref.name)})…`, "busy"); let R = null;
    try { XR.reachKm = ref.reachKm || 0;
      if (ref.main){ R = {name: ref.name, osm: ref.osm, main: ref.main, cum: withCum(ref.main), side: [], tribs: [], dams: [], prof: null, reaches: null, user: ref.user || null, zUser: ref.z || null, region: ref.region}; R.L = R.cum[R.cum.length - 1]; await loadProfile(R); buildReaches(R); }
      else { const [t, id] = ref.osm.split("/"); await loadRiver({osm_type: t, osm_id: +id, name: ref.name, display_name: ref.name, desc: ref.region}); R = XR.river; }
      if (R){ R.digit = ref.digit || []; if (ref.reachKm){ XR.reachKm = ref.reachKm; buildReaches(R); } }
    } catch(e){ console.warn("project river", ref.name, e); xstatus(`Could not reload ${esc(ref.name)}: ${esc(e.message)}`, "err"); }
    out.push(R); }
  XR.cmp = (P.cmp || []).filter(c => out[c.r]).map(c => ({R: out[c.r], k0: c.k0, k1: c.k1, label: c.label}));
  const cur = out[P.current] || out.find(Boolean); if (cur){ XR.river = cur; XR.pos = 0; XR.stack = []; xmap.fit(cur.main); }
  XR.range = P.range && out[P.range.r] === cur ? {R: cur, k0: P.range.k0, k1: P.range.k1} : null;
  renderX(); if (P.tab) showXTab(P.tab); xstatus(`Project opened: ${out.filter(Boolean).length} of ${P.rivers.length} rivers restored. Measurements that need terrain (catchment, floodplain, widths) are recalculated on request.`, "ok");
}
// keep the last session in this browser
let autosaveT = 0;
function autosave(){ if (/[?&]efl-batch=1/.test(location.search)) return; clearTimeout(autosaveT); autosaveT = setTimeout(() => { try { if (XR.river || XR.cmp.length) localStorage.setItem("efl.lastProject", JSON.stringify(projectState())); } catch(_){} }, 1500); }
{
  const rs = $("xRestore"); let last = null; try { last = JSON.parse(localStorage.getItem("efl.lastProject") || "null"); } catch(_){}
  const isWorker = /[?&]efl-batch=1/.test(location.search);
  // reloading the page carries on where you stopped: the last rivers, comparison and tab come back by themselves
  if (!isWorker && last && last.rivers && last.rivers.length && Date.now() - new Date(last.saved).getTime() < 30*864e5){ setTimeout(() => { try { const w = document.querySelector('.seg button[data-ws=explore]'); if (w && !document.querySelector('#app-explore.on, .seg button[data-ws=explore].on')) w.click(); } catch(_){}
      xstatus(`Restoring where you left off: <b>${esc(last.rivers.map(r => r.name).slice(0, 3).join(", "))}</b>… <a href="#" id="xFresh">Start fresh instead</a>`, "busy"); const fr = $("xFresh"); if (fr) fr.onclick = ev => { ev.preventDefault(); try { localStorage.removeItem("efl.lastProject"); localStorage.removeItem("efl.lastNet"); } catch(_){} location.reload(); };
      openProject(last).catch(e => xstatus(esc(e.message), "err")); }, 600); }
  else if (!isWorker && rs && last && last.rivers && last.rivers.length){ rs.style.display = ""; rs.innerHTML = `<span>Continue where you left off: <b>${esc(last.rivers.map(r => r.name).slice(0, 3).join(", "))}</b>${last.cmp && last.cmp.length ? ` · ${last.cmp.length} in comparison` : ""} <small>(${new Date(last.saved).toLocaleString()})</small></span><button class="sm pri" id="xRestoreGo">Restore session</button><button class="sm" id="xRestoreX">✕</button>`;
    $("xRestoreGo").onclick = () => { rs.style.display = "none"; openProject(last).catch(e => xstatus(esc(e.message), "err")); }; $("xRestoreX").onclick = () => { rs.style.display = "none"; }; }
  const pe = $("xProjOpen0"); if (pe) pe.onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) f.text().then(t => openProject(JSON.parse(t))).catch(er => xstatus("Project: " + esc(er.message), "err")); };
}
