/* ===================== River Explorer: a whole river, source to sink, from live open data ===================== */
// Data: OpenStreetMap (Nominatim search, Overpass geometry), AWS Terrain Tiles (elevation), Esri World Imagery (satellite),
// Wikidata (length, basin area, discharge). All are keyless and CORS-enabled, so this works on any static host (GitHub Pages).
const EX = {
  nominatim: "https://nominatim.openstreetmap.org/search",
  overpass: ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"],
  photon: "https://photon.komoot.io/api/",
  wdapi: "https://www.wikidata.org/w/api.php",
  wikidata: "https://query.wikidata.org/sparql",
  dem: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  base: {
    plain: {n: "Plain (white, no imagery)", plain: true, url: () => "", max: 22, attr: "No base map"},
    imagery: {n: "Satellite", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max: 19, attr: "Imagery © Esri, Maxar, Earthstar Geographics"},
    topo: {n: "Topographic", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`, max: 18, attr: "© Esri, HERE, Garmin, USGS, OpenStreetMap contributors"},
    osm: {n: "OpenStreetMap", url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: "© OpenStreetMap contributors"},
  },
};
const XR = {tab: "profile", river: null, base: "imagery", metric: "elevation", pos: 0, sel: null, draw: null, reachKm: 0, play: null};
const D2R = Math.PI/180, R_E = 6371.0088;
const hav = (a, b) => { const dLa = (b[0] - a[0])*D2R, dLo = (b[1] - a[1])*D2R, s = Math.sin(dLa/2)**2 + Math.cos(a[0]*D2R)*Math.cos(b[0]*D2R)*Math.sin(dLo/2)**2; return 2*R_E*Math.asin(Math.min(1, Math.sqrt(s))); };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const km = v => !Number.isFinite(v) ? "–" : v >= 100 ? v.toFixed(0) + " km" : v >= 10 ? v.toFixed(1) + " km" : v >= 1 ? v.toFixed(2) + " km" : (v*1000).toFixed(0) + " m";
const nf = (v, d = 0) => !Number.isFinite(v) ? "–" : v.toLocaleString("en", {maximumFractionDigits: d, minimumFractionDigits: d});
/* ---------- loading stepper ---------- */
const XSTEPS = [["find", "Find the river"], ["course", "Trace source → mouth"], ["tribs", "Tributaries & dams"], ["elev", "Elevation profile"], ["facts", "River facts"], ["width", "Channel width"]];
let XST = null, xstT = 0;
function stepReset(){ XST = Object.fromEntries(XSTEPS.map(([k]) => [k, {s: "wait", note: ""}])); clearTimeout(xstT); renderSteps(); }
function stepStart(k, note){ if (!XST) stepReset(); XST[k] = {s: "run", note: note || ""}; renderSteps(); }
function stepDone(k, note){ if (!XST) return; XST[k] = {s: "done", note: note || ""}; renderSteps(); if (XSTEPS.every(([q]) => XST[q].s === "done" || XST[q].s === "skip")){ xstT = setTimeout(() => { XST = null; renderSteps(); }, 2600); } }
function stepFail(msg){ if (!XST) return; const k = XSTEPS.find(([q]) => XST[q].s === "run"); if (k) XST[k[0]] = {s: "fail", note: msg}; renderSteps(); }
function renderSteps(){ const el = $("xSteps"); if (!el) return; const fl = document.querySelector(".xfloat"); if (fl) el.style.top = (fl.offsetHeight + 18) + "px"; if (!XST){ el.classList.remove("on"); return; } el.classList.add("on");
  const n = XSTEPS.filter(([k]) => XST[k].s === "done" || XST[k].s === "skip").length;
  el.innerHTML = `<div class="xbar"><i style="width:${n/XSTEPS.length*100}%"></i></div>` + XSTEPS.map(([k, t]) => `<div class="xstep ${XST[k].s}"><i></i><span>${t}${XST[k].note ? `<small>${esc(XST[k].note)}</small>` : ""}</span></div>`).join(""); }
async function showConn(){
  const el = $("xConnBox"); if (!el) return; el.classList.add("on"); const fl = document.querySelector(".xfloat"); if (fl) el.style.top = (fl.offsetHeight + 18) + "px"; el.innerHTML = `<div class="xconn-h"><b>Connection check</b><button class="sm" id="xConnX">✕</button></div><div class="shimmer xres-empty">Testing each service…</div>`;
  $("xConnX").onclick = () => el.classList.remove("on");
  const r = await checkServices(), ok = r.filter(x => x.ok).length;
  el.innerHTML = `<div class="xconn-h"><b>Connection check</b><button class="sm" id="xConnX">✕</button></div>${r.map(x => `<div class="xconn ${x.ok ? "ok" : "bad"}"><i></i><span>${esc(x.n)}</span><small>${x.ok ? x.ms + " ms" : esc(x.err)}</small></div>`).join("")}
    <p class="note">${ok === r.length ? "Everything answers: searching and loading rivers should work." : ok === 0 ? (inClaude() ? "Nothing answers because this copy runs inside Claude, which blocks outside services. Open your GitHub Pages copy." : "Nothing answers: you may be offline, or a browser extension / network filter is blocking these sites.") : "Some services are down or blocked; the app falls back to the others where it can. Overpass servers are often busy for a few minutes."}</p>`;
  $("xConnX").onclick = () => el.classList.remove("on");
}
const xstatus = (t, cls) => { const el = $("xStatus"); if (el){ el.innerHTML = t; el.className = "xstatus " + (cls || ""); }
  if (cls === "busy") actSet("x", String(t).replace(/<[^>]+>/g, "")); else { actEnd("x"); if (cls === "err" || cls === "ok") actFlash(String(t).replace(/<[^>]+>/g, ""), cls); } };

/* ---------- global activity indicator: anything loading is always visible ---------- */
const ACT = {tasks: new Map(), timer: 0, lastBtn: null};
function actSet(id, label, pct){
  let t = ACT.tasks.get(id); const now = performance.now(), m = /(\d{1,3})\s*%/.exec(label || ""); if (pct == null && m) pct = +m[1]/100;
  if (!t){ t = {t0: now, btn: null}; ACT.tasks.set(id, t);
    const b = ACT.lastBtn; if (b && now - b.t < 700 && b.el && b.el.isConnected && !b.el.classList.contains("loading")){ t.btn = b.el; b.el.classList.add("loading"); b.el.setAttribute("aria-busy", "true"); ACT.lastBtn = null; } }
  t.label = label; t.pct = pct; const dn = document.getElementById("actDone"); if (dn) dn.className = ""; actRender(); if (!ACT.timer) ACT.timer = setInterval(actRender, 1000);
}
function actEnd(id){ const t = ACT.tasks.get(id); if (!t) return; if (t.btn){ t.btn.classList.remove("loading"); t.btn.removeAttribute("aria-busy"); } ACT.tasks.delete(id); if (!ACT.tasks.size){ clearInterval(ACT.timer); ACT.timer = 0; } actRender(); }
async function actWrap(id, label, fn){ actSet(id, label); await new Promise(r => setTimeout(r, 30)); try { return await fn(); } finally { actEnd(id); } }
function actRender(){
  let el = document.getElementById("actPill"); if (!el){ el = document.createElement("div"); el.id = "actPill"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); const bar = document.createElement("div"); bar.id = "actBar"; bar.innerHTML = "<i></i>"; document.body.appendChild(bar); }
  const bar = document.getElementById("actBar"), T = [...ACT.tasks.values()];
  if (!T.length){ el.classList.remove("on"); bar.classList.remove("on"); return; }
  const t = T[T.length - 1], sec = Math.round((performance.now() - t.t0)/1000), slow = sec >= 20;
  el.classList.add("on"); bar.classList.add("on"); bar.classList.toggle("det", t.pct != null); bar.firstChild.style.width = t.pct != null ? Math.round(t.pct*100) + "%" : "";
  el.innerHTML = `<span class="aspin"></span><span class="atx"><b>${esc(t.label || "Working…")}</b><small>${sec >= 2 ? sec + " s" : "just started"}${T.length > 1 ? ` · ${T.length - 1} more task${T.length > 2 ? "s" : ""} running` : ""}${slow ? " · large areas and busy map servers can take a minute or two" : ""}</small></span>${t.pct != null ? `<span class="apct">${Math.round(t.pct*100)}%</span>` : ""}${ACT.cancel && ACT.tasks.has("x") ? `<button class="sm acx" id="actCancel">Cancel</button>` : ""}`;
  const cx = document.getElementById("actCancel"); if (cx) cx.onclick = () => { const f = ACT.cancel; ACT.cancel = null; f && f(); actEnd("x"); };
}
let actFlashT = 0;
function actFlash(text, cls){ if (!text) return; let el = document.getElementById("actDone"); if (!el){ el = document.createElement("div"); el.id = "actDone"; document.body.appendChild(el); }
  el.className = "on " + cls; el.innerHTML = `<span>${cls === "ok" ? "✓" : "!"}</span>${esc(text.length > 160 ? text.slice(0, 157) + "…" : text)}`; clearTimeout(actFlashT); actFlashT = setTimeout(() => el.className = "", cls === "err" ? 7000 : 3500); el.onclick = () => el.className = ""; }
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("button, label.filebtn, .chip"); if (b) ACT.lastBtn = {el: b, t: performance.now()}; }, true);

/* ---------- web requests ---------- */
async function xfetchJSON(url, opt = {}, tries = 2, ms = 0){
  let last;
  for (let i = 0; i < tries; i++){ try { let ctl = null, tm = null; if (ms && typeof AbortController !== "undefined"){ ctl = new AbortController(); tm = setTimeout(() => ctl.abort(), ms); }
    if (!ctl && XR.ctl && typeof AbortController !== "undefined") ctl = new AbortController(); const ext = XR.ctl, onX = () => ctl && ctl.abort(); if (ext && ctl) ext.signal.addEventListener("abort", onX); if (opt.signal && ctl){ if (opt.signal.aborted) ctl.abort(); opt.signal.addEventListener("abort", onX); }
    const r = await fetch(url, ctl ? {...opt, signal: ctl.signal} : opt).finally(() => { tm && clearTimeout(tm); ext && ext.signal.removeEventListener("abort", onX); }); if (r.status === 429 || r.status === 504){ last = new Error("server busy (" + r.status + ")"); await new Promise(s => setTimeout(s, 2500*(i + 1))); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch(e){ last = e; } }
  throw last;
}
/** OpenStreetMap (Overpass): the mirror that answered last time starts at once; if it has not answered within a few seconds the
 *  next mirror is asked as well (4 s, 12 s, 25 s), and the first good answer wins — a busy server no longer costs minutes. */
async function overpass(q){
  try { return await overpassRace(q, false); }
  catch(e){ if (XR.ctl && XR.ctl.signal.aborted) throw e; const url = EX.overpass[0] + "?data=" + encodeURIComponent(q); if (url.length > 7500) throw e;
    // second round: wait a moment, then ask every mirror again with a plain GET (some networks and browsers drop the POST)
    actSet("op2", "OpenStreetMap servers busy — trying again…"); try { await new Promise(r => setTimeout(r, 3000)); return await overpassRace(q, true); } finally { actEnd("op2"); } }
}
async function overpassRace(q, get){
  const eps = [...EX.overpass].sort((a, b) => (b === XR.opOK) - (a === XR.opOK)), body = "data=" + encodeURIComponent(q), ctls = [], errs = [], timers = []; let started = 0, failed = 0, done = false;
  return new Promise((resolve, reject) => {
    const finish = () => { timers.forEach(clearTimeout); };
    const start = () => { if (done || started >= eps.length) return; const ep = eps[started++], ctl = typeof AbortController !== "undefined" ? new AbortController() : null; if (ctl) ctls.push(ctl);
      xfetchJSON(get ? ep + "?" + body : ep, {...(get ? {} : {method: "POST", body, headers: {"Content-Type": "application/x-www-form-urlencoded"}}), ...(ctl ? {signal: ctl.signal} : {})}, 1, 200000).then(j => {
        if (done) return; if (j && j.remark && /runtime error|out of memory|timed out/i.test(j.remark) && !(j.elements || []).length) throw new Error(j.remark);
        done = true; finish(); XR.opOK = ep; ctls.forEach(c => c !== ctl && c.abort()); resolve(j); }).catch(e => { if (done) return; errs.push(e); failed++; console.warn("overpass", ep, e);
        if (failed >= eps.length){ done = true; finish(); const last = errs[errs.length - 1]; reject(new Error("none of the OpenStreetMap (Overpass) servers answered (" + (last && /abort/i.test(last.message) ? "timed out" : /load failed|failed to fetch|networkerror/i.test(last && last.message || "") ? "connection refused or dropped — usually a server that is overloaded" : last && last.message) + "). Press Check connection to see which servers are up, or wait a minute and try again.")); }
        else start(); }); };
    start(); for (const ms of [4000, 12000, 25000]) timers.push(setTimeout(start, ms));
  });
}

/* ---------- tiles (shared by map, elevation and captures) ---------- */
const tileCache = new Map();
function lon2x(lon, z){ return (lon + 180)/360*256*2**z; }
function lat2y(lat, z){ const s = Math.sin(lat*D2R); return (.5 - Math.log((1 + s)/(1 - s))/(4*Math.PI))*256*2**z; }
function x2lon(x, z){ return x/(256*2**z)*360 - 180; }
function y2lat(y, z){ const n = Math.PI - 2*Math.PI*y/(256*2**z); return Math.atan(Math.sinh(n))/D2R; }
function getTile(url, cors = true){
  let t = tileCache.get(url); if (t) return t;
  t = {img: new Image(), ok: false, cors, p: null}; tileCache.set(url, t);
  t.p = new Promise(res => { const im = t.img; if (cors) im.crossOrigin = "anonymous";
    im.onload = () => { t.ok = true; res(t); if (xmap) xmap.req(); };
    im.onerror = () => { if (cors){ tileCache.delete(url); const u = getTile(url, false); u.p.then(res); } else res(t); };
    im.src = url; });
  if (tileCache.size > 900){ const k = tileCache.keys().next().value; tileCache.delete(k); }
  return t;
}
const demCache = new Map();
async function demTile(z, x, y){
  const k = z + "/" + x + "/" + y; if (demCache.has(k)) return demCache.get(k);
  const p = (async () => { const t = getTile(EX.dem(z, x, y), true); await t.p; if (!t.ok || !t.cors) return null;
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(t.img, 0, 0);
    try { const d = g.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536); for (let i = 0; i < 65536; i++) e[i] = d[i*4]*256 + d[i*4+1] + d[i*4+2]/256 - 32768; return e; } catch(_){ return null; } })();
  demCache.set(k, p); return p;
}

/* ---------- the map ---------- */
let xmap = null;
function makeMap(cv){
  const M = {lat: 47, lon: 15, z: 5, rot: 0, cv, ctx: cv.getContext("2d"), pending: false, ptrs: new Map(), dpr: Math.min(2, window.devicePixelRatio || 1)};
  M.req = () => { if (!M.pending){ M.pending = true; requestAnimationFrame(() => { M.pending = false; M.draw(); }); } };
  M.size = () => { const r = cv.getBoundingClientRect(); const w = Math.max(200, r.width), h = Math.max(200, r.height); if (cv.width !== Math.round(w*M.dpr)){ cv.width = Math.round(w*M.dpr); cv.height = Math.round(h*M.dpr); } return [w, h]; };
  M.toScr = (lat, lon) => { const [w, h] = M.size(), zi = Math.floor(M.z), s = 2**(M.z - zi); return [(lon2x(lon, zi) - lon2x(M.lon, zi))*s + w/2, (lat2y(lat, zi) - lat2y(M.lat, zi))*s + h/2]; };
  M.toGeo = (sx, sy) => { const [w, h] = M.size(), zi = Math.floor(M.z), s = 2**(M.z - zi); return [y2lat(lat2y(M.lat, zi) + (sy - h/2)/s, zi), x2lon(lon2x(M.lon, zi) + (sx - w/2)/s, zi)]; };
  M.mpp = () => 40075016.686*Math.cos(M.lat*D2R)/(256*2**M.z);
  M.fit = (pts, pad = 30) => { if (!pts || !pts.length) return; let a = 90, b = -90, c = 180, d = -180; for (const p of pts){ a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
    const [w, h] = M.size(); M.lat = (a + b)/2; M.lon = (c + d)/2; for (let z = 18; z >= 1; z -= .25){ const dx = lon2x(d, z) - lon2x(c, z), dy = lat2y(a, z) - lat2y(b, z); if (dx < w - 2*pad && dy < h - 2*pad){ M.z = z; break; } } M.req(); };
  M.drawTiles = (ctx, w, h, lat, lon, z, base) => {
    const zi = Math.max(0, Math.min(base.max, Math.round(z + (M.tileBias || 0)))), s = 2**(z - zi), cx = lon2x(lon, zi), cy = lat2y(lat, zi), n = 2**zi;
    const x0 = Math.floor((cx - w/2/s)/256), x1 = Math.floor((cx + w/2/s)/256), y0 = Math.max(0, Math.floor((cy - h/2/s)/256)), y1 = Math.min(n - 1, Math.floor((cy + h/2/s)/256));
    let missing = 0;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++){
      const wx = ((tx % n) + n) % n, t = getTile(base.url(zi, wx, ty)), sx = (tx*256 - cx)*s + w/2, sy = (ty*256 - cy)*s + h/2, sz = 256*s + .5;
      if (t.ok) ctx.drawImage(t.img, sx, sy, sz, sz);
      else { missing++; // draw a coarser parent while loading
        for (let up = 1; up <= 4; up++){ const pz = zi - up; if (pz < 0) break; const k = 2**up, pt = tileCache.get(base.url(pz, Math.floor(wx/k), Math.floor(ty/k))); if (pt && pt.ok){ const ox = (wx % k)*256/k, oy = (ty % k)*256/k; ctx.drawImage(pt.img, ox, oy, 256/k, 256/k, sx, sy, sz, sz); break; } } }
    }
    return missing;
  };
  M.draw = () => {
    const [w, h] = M.size(), ctx = M.ctx; ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0); ctx.fillStyle = "#0d1418"; ctx.fillRect(0, 0, w, h);
    const LY = XR.lay || {}, plainB = EX.base[XR.base].plain || LY.imagery === false, rot = M.rot || 0, Dg = Math.ceil(Math.hypot(w, h));
    let miss = 0; if (plainB){ ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); } else { ctx.save(); if (rot){ ctx.translate(w/2, h/2); ctx.rotate(rot); ctx.translate(-Dg/2, -Dg/2); miss = M.drawTiles(ctx, Dg, Dg, M.lat, M.lon, M.z, EX.base[XR.base]); } else miss = M.drawTiles(ctx, w, h, M.lat, M.lon, M.z, EX.base[XR.base]); ctx.restore(); }
    M.miss = miss; { const tl = document.getElementById("xTiles"); if (tl){ tl.classList.toggle("on", miss > 0); tl.textContent = miss > 0 ? `Loading imagery… ${miss} tile${miss > 1 ? "s" : ""}` : ""; } }
    ctx.save(); if (rot){ ctx.translate(w/2, h/2); ctx.rotate(rot); ctx.translate(-w/2, -h/2); } XR._inRot = true;
    try { drawLayerExtras(ctx, M, w, h); } catch(e){ console.warn(e); }
    drawBasinOnMap(ctx, M, w, h);
    drawRiverLayers(ctx, M, w, h); drawSelOnMap(ctx, M);
    try { drawMapExtras(ctx, M, w, h); } catch(e){ console.warn(e); }
    try { typeof drawTraceEdit === "function" && drawTraceEdit(ctx, M, w, h); } catch(e){ console.warn(e); }
    XR._inRot = false; ctx.restore();
    if (LY.legend !== false) try { drawLegendStack(ctx, w, h, LY.scale !== false || M.exporting); } catch(e){ console.warn(e); }
    if (M.exporting || FURN.north.map || rot) furnNorthCanvas(ctx, w - 30, M.exporting || innerWidth > 760 ? 34 : 120, rot);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.font = "11px Space Grotesk, sans-serif"; const at = EX.base[XR.base].attr + (XR.overlay && EX.over[XR.overlay] ? " · " + EX.over[XR.overlay].attr : "") + (XR.swipe && EX.base[XR.swipe.b] ? " | right: " + EX.base[XR.swipe.b].n : "") + " · rivers © OpenStreetMap contributors", tw = ctx.measureText(at).width; ctx.fillRect(w - tw - 10, h - 17, tw + 10, 17); ctx.fillStyle = "#ddd"; ctx.fillText(at, w - tw - 5, h - 5);
    // scale bar
    if (LY.scale === false && !M.exporting) return;
    furnScaleCanvas(ctx, w, h, M.mpp());
  };
  // interaction: drag to pan, wheel / pinch to zoom, tap to pick
  let down = null, moved = 0, pinch = null;
  const fr = (x, y) => { const r = M.rot || 0; if (!r) return [x, y]; const [w, h] = M.size(), dx = x - w/2, dy = y - h/2, c = Math.cos(-r), n = Math.sin(-r); return [w/2 + dx*c - dy*n, h/2 + dx*n + dy*c]; }; M.fr = fr;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); M.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); if (M.ptrs.size === 1){ const f = fr(e.offsetX, e.offsetY); down = [f[0], f[1], M.lat, M.lon]; moved = 0; } else if (M.ptrs.size === 2){ const [a, b] = [...M.ptrs.values()]; pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: M.z, a: Math.atan2(b[1] - a[1], b[0] - a[0]), rot: M.rot || 0, rotOn: false}; } });
  cv.addEventListener("pointermove", e => { if (!M.ptrs.has(e.pointerId)) return; M.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (M.ptrs.size === 2 && pinch){ const [a, b] = [...M.ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), an = Math.atan2(b[1] - a[1], b[0] - a[0]); M.z = clamp(pinch.z + Math.log2(d/pinch.d), 2, 19);
      if ((XR.lay || {}).rotGesture !== false){ let da = an - pinch.a; da = Math.atan2(Math.sin(da), Math.cos(da)); if (!pinch.rotOn && Math.abs(da) > .22){ pinch.rotOn = true; pinch.a = an; pinch.rot = M.rot || 0; da = 0; } if (pinch.rotOn){ M.rot = pinch.rot + da; typeof mapCtlSync === "function" && mapCtlSync(); } }
      moved = 99; M.req(); return; }
    if (!down) return; const f = fr(e.offsetX, e.offsetY), dx = f[0] - down[0], dy = f[1] - down[1]; moved = Math.max(moved, Math.hypot(dx, dy)); const zi = Math.floor(M.z), s = 2**(M.z - zi);
    M.lon = x2lon(lon2x(down[3], zi) - dx/s, zi); M.lat = clamp(y2lat(lat2y(down[2], zi) - dy/s, zi), -85, 85); M.req(); });
  const up = e => { const was = M.ptrs.size; M.ptrs.delete(e.pointerId); if (was === 1 && down && moved < 6) mapTap(...fr(e.offsetX, e.offsetY)); if (M.ptrs.size < 2) pinch = null; if (!M.ptrs.size) down = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); const [ox, oy] = fr(e.offsetX, e.offsetY), g = M.toGeo(ox, oy); M.z = clamp(M.z - e.deltaY*.0025, 2, 19); const s2 = M.toScr(g[0], g[1]); const zi = Math.floor(M.z), s = 2**(M.z - zi); M.lon = x2lon(lon2x(M.lon, zi) + (s2[0] - ox)/s, zi); M.lat = y2lat(lat2y(M.lat, zi) + (s2[1] - oy)/s, zi); M.req(); }, {passive: false});
  new ResizeObserver(() => M.req()).observe(cv);
  return M;
}

/* ---------- colour scales ---------- */
const XRAMP = [[0, [43, 131, 186]], [.25, [171, 221, 164]], [.5, [255, 255, 191]], [.75, [253, 174, 97]], [1, [215, 25, 28]]];
function xcol(u){ u = clamp(u, 0, 1); let j = 0; while (j < XRAMP.length - 2 && u > XRAMP[j+1][0]) j++; const a = XRAMP[j], b = XRAMP[j+1], t = (u - a[0])/(b[0] - a[0]); return `rgb(${a[1].map((v, k) => Math.round(v + (b[1][k] - v)*t)).join(",")})`; }
const XMETRIC = {
  elevation: {n: "Elevation", u: "m", get: (R, i) => R.prof ? R.prof.zcAt[i] : NaN},
  slope: {n: "Slope", u: "m/km", get: (R, i) => R.prof ? R.prof.sAt[i] : NaN, log: true},
  sinuosity: {n: "Sinuosity", u: "", get: (R, i) => { const r = reachAt(R, R.cum[i]); return r ? r.sin : NaN; }},
  width: {n: "Width", u: "m", get: (R, i) => { const r = reachAt(R, R.cum[i]); return r && r.width ? r.width.med : NaN; }},
  plain: {n: "Plain line", u: "", get: () => NaN},
};

/* ---------- drawing the river on the map ---------- */
function drawRiverLayers(ctx, M, w, h){
  const R = XR.river;
  if (!R && XR.preview){ const P = XR.preview, st = Math.max(1, Math.floor(P.length/3000)); ctx.save(); ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 6; ctx.beginPath(); for (let i = 0; i < P.length; i += st){ const q = M.toScr(P[i][0], P[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); ctx.strokeStyle = "#43d9e8"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -(performance.now()/40 % 14); ctx.stroke(); ctx.restore(); setTimeout(() => XR.preview && M.req(), 60); }
  if (R){
    const step = Math.max(1, Math.floor(R.main.length/Math.max(400, w*3*2**(M.z - 6)))), met = XMETRIC[XR.metric], vals = [];
    for (let i = 0; i < R.main.length; i += step){ const v = met.get(R, i); if (Number.isFinite(v)) vals.push(met.log ? Math.log10(Math.max(v, 1e-3)) : v); }
    const lo = vals.length ? quantile(vals, .02) : 0, hi = vals.length ? quantile(vals, .98) : 1;
    XR.legend = {key: XR.metric, met, lo, hi, n: vals.length, inv: XR.metric === "elevation", clipLo: vals.some(v => v < lo - 1e-9), clipHi: vals.some(v => v > hi + 1e-9)};
    // side channels
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const LY = XR.lay || {};
    if (LY.side !== false) for (const s of R.side){ ctx.strokeStyle = "rgba(120,220,255,.85)"; ctx.lineWidth = 1.6; ctx.beginPath(); s.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
    // tributary mouths (last stretch)
    if (LY.tribs !== false) for (const t of R.tribs){ if (!t.stub) continue; ctx.strokeStyle = t === XR.sel ? "#fff" : "rgba(90,200,255,.9)"; ctx.lineWidth = t === XR.sel ? 3 : 1.8; ctx.beginPath(); t.stub.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
    // main stem coloured by metric
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); for (let i = 0; i < R.main.length; i += step){ const q = M.toScr(R.main[i][0], R.main[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke();
    ctx.lineWidth = 3.4;
    for (let i = 0; i + step < R.main.length; i += step){ const a = M.toScr(R.main[i][0], R.main[i][1]), b = M.toScr(R.main[i+step][0], R.main[i+step][1]);
      if ((a[0] < -50 && b[0] < -50) || (a[0] > w + 50 && b[0] > w + 50) || (a[1] < -50 && b[1] < -50) || (a[1] > h + 50 && b[1] > h + 50)) continue;
      const v = met.get(R, i), u = Number.isFinite(v) ? ((met.log ? Math.log10(Math.max(v, 1e-3)) : v) - lo)/((hi - lo) || 1) : NaN;
      ctx.strokeStyle = Number.isFinite(u) ? xcol(XR.metric === "elevation" ? 1 - u : u) : "#ff8a4c"; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // reach boundaries
    if (R.reaches && LY.reaches !== false) for (const r of R.reaches){ const p = pointAtKm(R, r.k0), q = M.toScr(p[0], p[1]); ctx.fillStyle = "#fff"; ctx.fillRect(q[0] - 1.5, q[1] - 5, 3, 10); }
    // dams
    if (LY.dams !== false) for (const d of R.dams){ const q = M.toScr(d.lat, d.lon); ctx.fillStyle = "#111"; ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10); ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 2; ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10); }
    // confluence dots, labelled when zoomed or large
    ctx.font = "600 11px Space Grotesk, sans-serif";
    const big = R.tribs.filter(t => t.area).sort((a, b) => b.area - a.area).slice(0, 12);
    if (LY.tribs !== false) for (const t of R.tribs){ const q = M.toScr(t.lat, t.lon); if (q[0] < -20 || q[0] > w + 20 || q[1] < -20 || q[1] > h + 20) continue; const r = t === XR.sel ? 7 : 4.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = t.side === "left" ? "#5ad1ff" : "#b4f05a"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.4; ctx.stroke();
      if (LY.labels !== false && (t === XR.sel || big.includes(t) || M.z > 9)){ const tx = t.name, tw = ctx.measureText(tx).width; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(q[0] + 8, q[1] - 9, tw + 8, 16); ctx.fillStyle = "#fff"; ctx.fillText(tx, q[0] + 12, q[1] + 3); } }
    // source / mouth
    const s0 = M.toScr(R.main[0][0], R.main[0][1]), s1 = M.toScr(R.main[R.main.length-1][0], R.main[R.main.length-1][1]);
    for (const [q, t, c] of [[s0, "Source", "#4cd17a"], [s1, "Mouth", "#ff4d5e"]]){ ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); if (LY.labels === false) continue; ctx.fillStyle = "rgba(0,0,0,.7)"; const tw = ctx.measureText(t).width; ctx.fillRect(q[0] + 9, q[1] - 9, tw + 8, 16); ctx.fillStyle = "#fff"; ctx.fillText(t, q[0] + 13, q[1] + 3); }
    // position marker
    const p = pointAtKm(R, XR.pos), q = M.toScr(p[0], p[1]); if (LY.pos !== false){ ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); }
  }
  // a line being drawn by hand
  if (XR.draw && XR.draw.pts.length){ ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.beginPath(); XR.draw.pts.forEach((p, j) => { const q = M.toScr(p[0], p[1]); j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]);
    for (const p of XR.draw.pts){ const q = M.toScr(p[0], p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fillStyle = "#ffd84a"; ctx.fill(); } }
}
function mapTap(sx, sy){
  const M = xmap, R = XR.river;
  if (XR.mode && modeTap(sx, sy)) return;
  if (widthTap(sx, sy)) return;
  if (XR.draw){ XR.draw.pts.push(M.toGeo(sx, sy)); renderDrawBar(); M.req(); return; }
  if (!R) return;
  let best = null, bd = 18; for (const t of R.tribs){ const q = M.toScr(t.lat, t.lon), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; best = t; } }
  if (best){ XR.sel = best; setPos(best.km); renderTribs(); showXTab("tribs"); return; }
  // nearest point on the main stem
  let bi = -1; bd = 24; const st = Math.max(1, Math.floor(R.main.length/4000)); for (let i = 0; i < R.main.length; i += st){ const q = M.toScr(R.main[i][0], R.main[i][1]), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd){ bd = d; bi = i; } }
  if (bi >= 0) setPos(R.cum[bi]);
}

/* ---------- geometry helpers ---------- */
function idxAtKm(R, k){ let lo = 0, hi = R.cum.length - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (R.cum[m] < k) lo = m; else hi = m; } return lo; }
function pointAtKm(R, k){ k = clamp(k, 0, R.L); const i = idxAtKm(R, k), a = R.main[i], b = R.main[Math.min(i + 1, R.main.length - 1)], d = (R.cum[i + 1] ?? R.cum[i]) - R.cum[i], t = d > 0 ? (k - R.cum[i])/d : 0; return [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t]; }
function reachAt(R, k){ if (!R.reaches) return null; for (const r of R.reaches) if (k >= r.k0 && k <= r.k1) return r; return null; }
function withCum(pts){ const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i-1] + hav(pts[i-1], pts[i])); return c; }
/** local metric coordinates (km) around a reference latitude */
function toLocal(pts, lat0, lon0){ const kx = Math.cos(lat0*D2R)*R_E*D2R, ky = R_E*D2R; return pts.map(p => [(p[1] - lon0)*kx, (lat0 - p[0])*ky]); }
function resampleKm(R, k0, k1, step){ const out = []; for (let k = k0; k <= k1 + 1e-9; k += step) out.push(pointAtKm(R, k)); return out; }

/* ---------- 1. find the river and assemble its course ---------- */
/* ---------- river search: three independent services, merged ---------- */
const typeOk = t => /river|stream|canal|waterway|tidal|wadi|creek/i.test(t || "");
function nomHit(r){ return {osm_type: r.osm_type, osm_id: r.osm_id, lat: +r.lat, lon: +r.lon, name: r.name || r.display_name.split(",")[0], display_name: r.display_name, where: r.display_name.split(",").slice(1).map(s => s.trim()).filter(Boolean).slice(-2).join(", "), type: r.type, water: r.category === "waterway" || typeOk(r.type), boundingbox: r.boundingbox, wikidata: r.extratags && r.extratags.wikidata, src: "OpenStreetMap"}; }
function photonHit(f){ const p = f.properties || {}, T = {R: "relation", W: "way", N: "node"}, ex = p.extent; return {osm_type: T[p.osm_type] || p.osm_type, osm_id: p.osm_id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.name, display_name: [p.name, p.state, p.country].filter(Boolean).join(", "), where: [p.state, p.country].filter(Boolean).join(", "), type: p.osm_value, water: p.osm_key === "waterway" || typeOk(p.osm_value), boundingbox: ex ? [ex[3], ex[1], ex[0], ex[2]] : null, src: "Photon"}; }
async function searchPhoton(q, ms){ const j = await xfetchJSON(`${EX.photon}?q=${encodeURIComponent(q)}&limit=12&lang=en&osm_tag=waterway`, {}, 1, ms); return (j.features || []).filter(f => f.properties && f.properties.name).map(photonHit); }
async function searchNominatim(q, ms){ const j = await xfetchJSON(`${EX.nominatim}?format=jsonv2&limit=12&extratags=1&q=${encodeURIComponent(q)}`, {headers: {"Accept-Language": "en"}}, 1, ms); return j.map(nomHit); }
async function searchWikidata(q, ms){
  const s = await xfetchJSON(`${EX.wdapi}?action=wbsearchentities&format=json&origin=*&language=en&uselang=en&type=item&limit=12&search=${encodeURIComponent(q)}`, {}, 1, ms);
  const ids = (s.search || []).map(x => x.id); if (!ids.length) return [];
  const e = await xfetchJSON(`${EX.wdapi}?action=wbgetentities&format=json&origin=*&props=claims|labels|descriptions&languages=en&ids=${ids.join("|")}`, {}, 1, ms);
  const out = [];
  for (const id of ids){ const it = e.entities && e.entities[id]; if (!it || !it.claims) continue; const rel = it.claims.P402 && it.claims.P402[0].mainsnak.datavalue; if (!rel) continue;
    const co = it.claims.P625 && it.claims.P625[0].mainsnak.datavalue, desc = (it.descriptions && it.descriptions.en && it.descriptions.en.value) || "", nm = (it.labels && it.labels.en && it.labels.en.value) || (s.search.find(x => x.id === id) || {}).label;
    out.push({osm_type: "relation", osm_id: +rel.value, lat: co ? co.value.latitude : NaN, lon: co ? co.value.longitude : NaN, name: nm, display_name: nm + (desc ? ", " + desc : ""), where: desc, type: /river|stream|canal|tributary|watercourse/i.test(desc) ? "river" : "", water: /river|stream|canal|tributary|watercourse|wadi|creek/i.test(desc), wikidata: id, src: "Wikidata"}); }
  return out;
}
/** query the services in parallel; onPartial(list) gets the merged list as each answers */
async function searchRivers(q, onPartial, opts = {}){
  const prov = [["Photon", searchPhoton], ["Wikidata", searchWikidata], ...(opts.live ? [] : [["OpenStreetMap", searchNominatim]])], seen = new Map(), status = {};
  const rank = r => (r.water ? 0 : 4) + (r.osm_type === "relation" ? 0 : 2) + (/^river$/i.test(r.type || "") ? 0 : 1) + (r.name && r.name.toLowerCase() === q.toLowerCase() ? -1 : 0);
  const merged = () => { const a = [...seen.values()]; const w = a.filter(r => r.water); return (w.length ? w : a).sort((x, y) => rank(x) - rank(y)).slice(0, 10); };
  await Promise.all(prov.map(async ([n, f]) => { try { const r = await f(q, opts.live ? 6000 : 12000); status[n] = r.length;
      for (const h of r){ if (h.osm_id == null) continue; const k = h.osm_type + "/" + h.osm_id, o = seen.get(k); if (o){ o.srcs.add(h.src); if (!o.wikidata && h.wikidata) o.wikidata = h.wikidata; if (!Number.isFinite(o.lat) && Number.isFinite(h.lat)){ o.lat = h.lat; o.lon = h.lon; } if (!o.boundingbox && h.boundingbox) o.boundingbox = h.boundingbox; if (h.src === "Wikidata" && h.where) o.desc = h.where; } else seen.set(k, {...h, srcs: new Set([h.src]), desc: h.src === "Wikidata" ? h.where : ""}); }
      if (onPartial) onPartial(merged(), status); } catch(e){ status[n] = e.name === "AbortError" ? "timeout" : (e.message || "failed"); console.warn("search", n, e); if (onPartial) onPartial(merged(), status); } }));
  const res = merged(); res.status = status; return res;
}
/** quick reachability check of every service the explorer needs */
async function checkServices(){
  const T = [["Photon search", `${EX.photon}?q=Danube&limit=1`], ["OpenStreetMap search", `${EX.nominatim}?format=jsonv2&limit=1&q=Danube`], ["Wikidata", `${EX.wdapi}?action=wbsearchentities&format=json&origin=*&language=en&limit=1&search=Danube`],
    ...EX.overpass.map(u => ["Overpass " + new URL(u).hostname, u + "?data=" + encodeURIComponent("[out:json];node(1);out ids;")]), ["Elevation tiles", null], ["Satellite tiles", null]];
  const out = [];
  await Promise.all(T.map(async ([n, u], i) => { const t0 = performance.now(); try {
      if (n === "Elevation tiles"){ if (!(await demTile(3, 4, 2))) throw new Error("no tile"); }
      else if (n === "Satellite tiles"){ await new Promise((ok, no) => { const im = new Image(); im.onload = ok; im.onerror = () => no(new Error("blocked")); im.src = EX.base.imagery.url(2, 1, 1) + "?t=" + Date.now(); setTimeout(() => no(new Error("timeout")), 8000); }); }
      else await xfetchJSON(u, {}, 1, 10000);
      out[i] = {n, ok: true, ms: Math.round(performance.now() - t0)}; } catch(e){ out[i] = {n, ok: false, err: e.name === "AbortError" ? "timed out" : e.message}; } }));
  return out;
}
const inClaude = () => /claude\.ai|claudeusercontent|anthropic/.test(location.hostname) || location.protocol === "blob:" || (location.origin === "null" && location.protocol !== "file:");
const XWW = '"waterway"~"^(river|stream|canal|drain|tidal_channel)$"';
function relSet(id){ return `rel(${id})->.r0; (.r0; rel(r.r0);)->.rr;`; }
function aroundQuery(waysSel){
  return `[out:json][timeout:240];
${waysSel}
node(w.w)->.n;
(way(bn.n)[${XWW}]; - way.w;)->.t;
.t out geom;
rel(bw.t)["waterway"]->.tr;
.tr out body;
node(w.w)["waterway"~"^(dam|weir|lock_gate)$"];
out;
way(bn.n)["waterway"~"^(dam|weir)$"];
out center tags;`;
}
const qstr = v => String(v || "").replace(/\\/g, "").replace(/"/g, '\\"');
/** turn any search hit (relation, way or node) into a river relation if one exists */
async function resolveSel(sel){
  if (sel.osm_type === "relation") return sel;
  let local = sel.name;
  if (sel.osm_type === "way"){ try { const t = await overpass(`[out:json][timeout:30];way(${sel.osm_id});out tags;`); const w = (t.elements || [])[0]; if (w && w.tags && w.tags.name) local = w.tags.name; } catch(_){} }
  const names = [...new Set([local, sel.name].filter(Boolean))], lat = +sel.lat, lon = +sel.lon;
  const q = `[out:json][timeout:60];(${names.map(n => `rel["waterway"]["name"="${qstr(n)}"](around:40000,${lat},${lon});rel["waterway"]["name:en"="${qstr(n)}"](around:40000,${lat},${lon});`).join("")});out tags;`;
  try { const r = await overpass(q), rel = (r.elements || []).find(e => e.type === "relation" && /river|stream|canal/.test((e.tags && e.tags.waterway) || "")) || (r.elements || [])[0];
    if (rel) return {...sel, osm_type: "relation", osm_id: rel.id, name: (rel.tags && (rel.tags["name:en"] || rel.tags.name)) || sel.name}; } catch(_){}
  return {...sel, localName: local};
}
function assembleMain(ways){
  // directed node graph (OSM waterways are drawn in the direction of flow)
  const main = ways.filter(w => w.role !== "side_stream" && w.role !== "tributary" && w.role !== "spring" || ways.every(v => v.role === "side_stream"));
  const coord = new Map(), out = new Map(), indeg = new Map();
  for (const w of main){ if (!w.nodes || w.nodes.length !== w.geom.length) w.nodes = w.geom.map(p => p[0].toFixed(7) + "," + p[1].toFixed(7));
    for (let i = 0; i < w.nodes.length; i++){ coord.set(w.nodes[i], w.geom[i]); if (!indeg.has(w.nodes[i])) indeg.set(w.nodes[i], 0); }
    for (let i = 0; i + 1 < w.nodes.length; i++){ const a = w.nodes[i], b = w.nodes[i+1]; if (a === b) continue; let o = out.get(a); if (!o) out.set(a, o = []); o.push(b); indeg.set(b, (indeg.get(b) || 0) + 1); } }
  // bridge small gaps in the mapping: link each dead end to the nearest start of another stretch within 3 km
  { const outdeg = n => (out.get(n) || []).length, srcs = [...indeg].filter(([, d]) => d === 0).map(([n]) => n), sinks = [...coord.keys()].filter(n => !outdeg(n));
    if (srcs.length > 1 && srcs.length < 3000) for (const s0 of sinks){ let best = null, bd = 3; const p = coord.get(s0); for (const t of srcs){ if (t === s0) continue; const d = hav(p, coord.get(t)); if (d < bd){ bd = d; best = t; } } if (best != null && bd > 0){ (out.get(s0) || out.set(s0, []).get(s0)).push(best); indeg.set(best, (indeg.get(best) || 0) + 1); } } }
  // longest path in the DAG (Kahn order); falls back to undirected diameter if tagging has loops
  const order = [], deg = new Map(indeg), q = [...deg].filter(([, d]) => d === 0).map(([n]) => n); while (q.length){ const n = q.pop(); order.push(n); for (const m of out.get(n) || []){ deg.set(m, deg.get(m) - 1); if (deg.get(m) === 0) q.push(m); } }
  const best = new Map(), prev = new Map();
  if (order.length >= .9*coord.size){
    for (const n of order){ const bn = best.get(n) || 0; for (const m of out.get(n) || []){ const d = bn + hav(coord.get(n), coord.get(m)); if (d > (best.get(m) || 0)){ best.set(m, d); prev.set(m, n); } } }
  } else { // undirected: two BFS passes for the diameter
    const adj = new Map(); for (const [a, os] of out) for (const b of os){ (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const far = s => { const dist = new Map([[s, 0]]), pr = new Map(), qq = [s]; let f = s; for (let i = 0; i < qq.length; i++){ const n = qq[i]; for (const m of adj.get(n) || []) if (!dist.has(m)){ dist.set(m, dist.get(n) + hav(coord.get(n), coord.get(m))); pr.set(m, n); qq.push(m); if (dist.get(m) > dist.get(f)) f = m; } } return {f, dist, pr}; };
    const a = far(coord.keys().next().value), b = far(a.f); for (const [k, v] of b.dist) best.set(k, v); for (const [k, v] of b.pr) prev.set(k, v);
  }
  let end = null, bd = -1; for (const [n, d] of best) if (d > bd){ bd = d; end = n; }
  const path = []; for (let n = end; n != null; n = prev.get(n)) path.push(n); path.reverse();
  const nodeIdx = new Map(path.map((n, i) => [n, i]));
  return {pts: path.map(n => coord.get(n)), nodes: path, nodeIdx, coord, coordKeys: typeof path[0] === "string"};
}
async function loadRiver(sel0){
  XR.river = null; XR.sel = null; XR.range = null; XR.preview = null; renderX(); xstatus("Finding the river in OpenStreetMap…", "busy"); stepReset(); stepStart("find", sel0.name);
  const tok = XR.loadTok = (XR.loadTok || 0) + 1; XR.ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  ACT.cancel = () => { XR.loadTok++; XR.ctl && XR.ctl.abort(); XR.preview = null; xmap.req(); };
  try { return await loadRiverInner(sel0, tok); } catch(e){ if (tok !== XR.loadTok){ stepReset(); XST = null; renderSteps(); xstatus("Loading cancelled.", "err"); return; } stepFail(e.message); throw e; } finally { if (tok === XR.loadTok) ACT.cancel = null; }
}
async function loadRiverInner(sel0, tok){
  const chk = () => { if (tok !== XR.loadTok) throw new Error("cancelled"); };
  const sel = await resolveSel(sel0), isRel = sel.osm_type === "relation"; chk();
  stepDone("find", isRel ? `OSM relation ${sel.osm_id}` : "matched by name"); stepStart("course");
  xstatus("Loading the river's course from OpenStreetMap… (large rivers take up to a minute)", "busy");
  let q1;
  if (isRel) q1 = `[out:json][timeout:240];${relSet(sel.osm_id)}.rr out body;way(r.rr)->.w;.w out geom;`;
  else { const bb = sel.boundingbox ? sel.boundingbox.map(Number) : [+sel.lat - 1, +sel.lat + 1, +sel.lon - 1, +sel.lon + 1], p = .3; q1 = `[out:json][timeout:240];way[${XWW}]["name"="${qstr(sel.localName || sel.name)}"](${bb[0] - p},${bb[2] - p},${bb[1] + p},${bb[3] + p});out geom;`; }
  const data = await overpass(q1), els = data.elements || []; chk();
  if (data.remark && !els.some(e => e.type === "way")) throw new Error("OpenStreetMap server: " + data.remark.slice(0, 160));
  const rels = els.filter(e => e.type === "relation"), rel = isRel ? (rels.find(e => e.id === +sel.osm_id) || rels[0]) : null, relTag = rel;
  const roles = new Map(); for (const r of rels) if (r.members) for (const m of r.members) if (m.type === "way" && !roles.has(m.ref)) roles.set(m.ref, m.role || "");
  const memberWays = els.filter(e => e.type === "way" && e.geometry && e.geometry.length > 1);
  if (!memberWays.length) throw new Error(`OpenStreetMap returned no lines for “${esc(sel.name || sel0.name)}” (${els.length} items). Try another result in the list, or the local name.`);
  const ways = memberWays.map(w => ({id: w.id, role: roles.has(w.id) ? roles.get(w.id) : "", nodes: w.nodes && w.nodes.length === w.geometry.length ? w.nodes : w.geometry.map(g => g.lat.toFixed(7) + "," + g.lon.toFixed(7)), geom: w.geometry.map(g => [g.lat, g.lon])}));
  const A = assembleMain(ways);
  XR.preview = A.pts; xmap.fit(A.pts); xmap.req(); // show the course straight away
  const name = (relTag && relTag.tags && (relTag.tags["name:en"] || relTag.tags.name)) || sel.name || sel.display_name.split(",")[0];
  const R = {name, osm: isRel ? "relation/" + sel.osm_id : sel0.osm_type + "/" + sel0.osm_id, wikidata: relTag && relTag.tags && relTag.tags.wikidata, main: A.pts, cum: withCum(A.pts), side: [], tribs: [], dams: [], prof: null, reaches: null, wd: null, nodeIdx: A.nodeIdx};
  R.L = R.cum[R.cum.length - 1]; R.mainNodes = A.nodes;
  // speed: read the elevation profile at the same time as the tributary request (it only needs the course)
  stepStart("elev", km(R.L)); const profP = loadProfile(R, null, true).then(p => { stepDone("elev", `${nf(p.drop)} m fall`); if (XR.river === R && tok === XR.loadTok){ buildReaches(R); renderX(); } return p; }, e => { console.warn("profile", e); return Promise.reject(e); }); profP.catch(() => {});
  // speed: the river is usable straight away; tributaries and dams are added when their (slower) request answers
  R.region = sel0.desc || sel0.where || (sel0.display_name || "").split(",").slice(1).map(x => x.trim()).filter(Boolean).slice(-2).join(", "); R.partial = true;
  XR.river = R; XR.preview = null; XR.pos = 0; XR.sel = null; XR.reachKm = 0; buildReaches(R); xmap.fit(R.main); renderX();
  stepStart("facts"); actSet("wd", "Loading river facts from Wikidata…"); const wdP = loadWikidata(R).finally(() => actEnd("wd")).then(() => { stepDone("facts", R.wd ? "Wikidata" : "none listed"); if (XR.river === R) renderX(); }).catch(e => { console.warn("wikidata", e); stepDone("facts", "unavailable"); });
  // tributaries, distributaries and dams: a second, separate request so a slow answer can't lose the river itself
  xstatus(`Course loaded (${memberWays.length} pieces). Finding tributaries and dams…`, "busy"); stepDone("course", `${memberWays.length} pieces`); stepStart("tribs");
  let around = {elements: []};
  try { around = await overpass(aroundQuery(isRel ? `${relSet(sel.osm_id)}way(r.rr)->.w;` : `way(id:${memberWays.map(w => w.id).join(",")})->.w;`)); } catch(e){ console.warn(e); xstatus("Tributaries could not be loaded (" + esc(e.message) + "); showing the river alone.", "err"); }
  chk(); const tribWays = (around.elements || []).filter(e => e.type === "way" && e.geometry && e.nodes && !roles.has(e.id) && !(e.tags && /dam|weir/.test(e.tags.waterway || "")));
  const aroundEls = around.elements || [];
  R.region = sel0.desc || sel0.where || (sel0.display_name || "").split(",").slice(1).map(x => x.trim()).filter(Boolean).slice(-2).join(", ");
  // full directed graph of every mapped channel (main, side streams, ways touching the river) for delta analysis
  { const out = new Map(), coord = new Map(), add = (ns, gs) => { for (let i = 0; i < ns.length; i++) coord.set(ns[i], gs[i]); for (let i = 0; i + 1 < ns.length; i++){ if (ns[i] === ns[i+1]) continue; const o = out.get(ns[i]) || out.set(ns[i], []).get(ns[i]); if (!o.includes(ns[i+1])) o.push(ns[i+1]); } };
    for (const w of ways) add(w.nodes, w.geom);
    for (const w of tribWays){ const ns = A.coordKeys ? w.geometry.map(g => g.lat.toFixed(7) + "," + g.lon.toFixed(7)) : w.nodes; if (ns.length === w.geometry.length) add(ns, w.geometry.map(g => [g.lat, g.lon])); }
    R.graph = {out, coord}; }
  const onMain = new Set(A.nodes);
  R.side = ways.filter(w => !w.nodes.every(n => onMain.has(n))).map(w => w.geom);
  R.sideLen = ways.filter(w => !w.nodes.every(n => onMain.has(n))).reduce((s, w) => s + withCum(w.geom).pop(), 0);
  // tributaries: ways that touch the main stem; group by their river relation (or name)
  const relOf = new Map(); for (const e of aroundEls) if (e.type === "relation" && e.id !== (relTag && relTag.id) && e.members) for (const m of e.members) if (m.type === "way") relOf.set(m.ref, e);
  const groups = new Map();
  for (const w of tribWays){
    const keys = A.coordKeys ? w.geometry.map(g => g.lat.toFixed(7) + "," + g.lon.toFixed(7)) : w.nodes; const j = keys.findIndex(n => A.nodeIdx.has(n)); if (j < 0) continue;
    const r = relOf.get(w.id), nm = (r && r.tags && (r.tags["name:en"] || r.tags.name)) || (w.tags && (w.tags["name:en"] || w.tags.name)); if (!nm) continue;
    const key = r ? "r" + r.id : "n" + nm, mi = A.nodeIdx.get(keys[j]);
    // the tributary must flow INTO the main stem: its touching node is (near) the end of the way
    const flowsIn = j >= w.nodes.length - 2, flowsOut = j <= 1 && w.nodes.length > 3;
    const g = groups.get(key); const cand = {key, name: nm, rel: r ? r.id : null, wikidata: r && r.tags && r.tags.wikidata, waterway: (r && r.tags && r.tags.waterway) || w.tags.waterway, mi, j, w, flowsOut: flowsOut && !flowsIn};
    if (!g || mi > g.mi) groups.set(key, cand);
  }
  for (const g of groups.values()){
    const p = A.pts[g.mi], geo = g.w.geometry.map(e => [e.lat, e.lon]), stub = g.j >= geo.length - 2 ? geo.slice(Math.max(0, geo.length - 40)) : geo.slice(0, 40);
    // bank: which side of the main stem the tributary comes from, looking downstream
    const a = A.pts[Math.max(0, g.mi - 3)], b = A.pts[Math.min(A.pts.length - 1, g.mi + 3)], far = stub[g.j >= geo.length - 2 ? 0 : stub.length - 1];
    const L0 = toLocal([a, b, far], p[0], p[1]), cross = (L0[1][0] - L0[0][0])*(L0[2][1]) - (L0[1][1] - L0[0][1])*(L0[2][0]);
    R.tribs.push({name: g.name, rel: g.rel, wikidata: g.wikidata, waterway: g.waterway, km: R.cum[g.mi], lat: p[0], lon: p[1], side: cross > 0 ? "right" : "left", distributary: g.flowsOut, stub});
  }
  R.tribs.sort((a, b) => a.km - b.km);
  for (const e of aroundEls){ if (e.type === "node" && e.tags && /dam|weir|lock_gate/.test(e.tags.waterway || "")){ const i = A.nodeIdx.get(A.coordKeys ? e.lat.toFixed(7) + "," + e.lon.toFixed(7) : e.id); if (i != null) R.dams.push({lat: e.lat, lon: e.lon, km: R.cum[i], name: e.tags.name || e.tags.waterway, kind: e.tags.waterway}); }
    if (e.type === "way" && e.center && e.tags && /dam|weir/.test(e.tags.waterway || "")){ let bi = 0, bd = Infinity; const st = Math.max(1, Math.floor(A.pts.length/3000)); for (let i = 0; i < A.pts.length; i += st){ const d = hav(A.pts[i], [e.center.lat, e.center.lon]); if (d < bd){ bd = d; bi = i; } } if (bd < 3) R.dams.push({lat: e.center.lat, lon: e.center.lon, km: R.cum[bi], name: e.tags.name || e.tags.waterway, kind: e.tags.waterway}); } }
  R.dams.sort((a, b) => a.km - b.km);
  R.partial = false; if (XR.river !== R) XR.river = R; XR.preview = null;
  buildReaches(R); renderX();
  stepDone("tribs", `${R.tribs.length} tributaries, ${R.dams.length} dams`);
  if (!R.prof) xstatus(`<b>${esc(R.name)}</b>: ${km(R.L)} traced from source to mouth, ${R.tribs.length} tributaries, ${R.dams.length} dams and weirs. Finishing the elevation profile…`, "busy");
  await profP; chk(); buildReaches(R); renderX();
  xstatus(`<b>${esc(R.name)}</b>: ${km(R.L)} from source to mouth, falling ${nf(R.prof ? R.prof.drop : NaN)} m. Tap the map or a chart to move along it.`, "ok");
  if (typeof autoWidth === "function") autoWidth(R, tok);
}

/* ---------- 2. long profile ---------- */
async function loadProfile(R, zoom, quiet){
  const PP = XR.pp || {}, z = zoom || (R.L > 1500 ? 9 : R.L > 400 ? 10 : R.L > 80 ? 11 : 12), step = PP.step > 0 ? Math.max(.02, PP.step, R.L/20000) : Math.max(.1, R.L/2500), n = Math.floor(R.L/step) + 1 + (R.L - Math.floor(R.L/step)*step > 1e-6 ? 1 : 0); // the last sample is always the mouth itself
  const d = new Float64Array(n), zr = new Float64Array(n); let done = 0;
  const pts = []; for (let i = 0; i < n; i++){ d[i] = Math.min(R.L, i*step); pts.push(pointAtKm(R, d[i])); }
  const need = new Map(); pts.forEach((p, i) => { const X = lon2x(p[1], z), Y = lat2y(p[0], z), k = Math.floor(X/256) + "/" + Math.floor(Y/256); (need.get(k) || need.set(k, []).get(k)).push([i, X, Y]); });
  let failed = 0;
  if (R.zUser){ // elevations supplied with the line (GeoJSON third coordinate): interpolate, no download
    let j = 0; for (let i = 0; i < n; i++){ while (j + 1 < R.cum.length - 1 && R.cum[j + 1] < d[i]) j++; const t = (d[i] - R.cum[j])/Math.max(1e-9, R.cum[j + 1] - R.cum[j]); zr[i] = R.zUser[j] + (R.zUser[j + 1] - R.zUser[j])*clamp(t, 0, 1); }
  } else {
  failed = await sampleElev(R, pts, z, need, zr);
  }
  // samples with no elevation at all (missing tiles, outside a user DEM) are flagged, not silently trusted
  const gap = new Uint8Array(n); let nGap = 0; for (let i = 0; i < n; i++) if (!Number.isFinite(zr[i])){ gap[i] = 1; nGap++; } if (nGap === n) throw new Error("no elevation data could be read for this river");
  // 1. remove spikes: raw samples far below (DEM voids, water-surface artefacts) or above (bridges, embankments) the local median
  const hw = Math.max(5, Math.round((PP.smoothKm > 0 ? PP.smoothKm : 3)/step)), zs = Float64Array.from(zr), spike = new Uint8Array(n), kS = PP.spikeK ?? 4;
  if (PP.despike !== false) for (let i = 0; i < n; i++){ const a = []; for (let k = Math.max(0, i - hw); k <= Math.min(n - 1, i + hw); k++) if (Number.isFinite(zr[k])) a.push(zr[k]); if (a.length < 5 || !Number.isFinite(zr[i])) continue;
    const m = median(a), mad = median(a.map(v => Math.abs(v - m)))*1.4826, lim = Math.max(kS*mad, PP.spikeMin ?? 8); if (zr[i] < m - lim || zr[i] > m + lim*1.5){ spike[i] = 1; zs[i] = NaN; } }
  // fill removed samples by linear interpolation between valid neighbours
  { let last = -1; for (let i = 0; i < n; i++){ if (Number.isFinite(zs[i])){ if (last >= 0 && i - last > 1) for (let k = last + 1; k < i; k++) zs[k] = zs[last] + (zs[i] - zs[last])*(k - last)/(i - last); last = i; } } }
  // 2. median smoothing
  const mh = PP.smoothKm > 0 ? Math.max(0, Math.round(PP.smoothKm/2/step)) : 3, med = new Float64Array(n); for (let i = 0; i < n; i++){ const a = []; for (let k = Math.max(0, i - mh); k <= Math.min(n - 1, i + mh); k++) if (Number.isFinite(zs[k])) a.push(zs[k]); med[i] = a.length ? median(a) : NaN; }
  // 3. hydrological conditioning (water can't flow uphill). Default: least-squares monotone fit (isotonic regression),
  //    which neither digs every low sample into a long flat step (running minimum) nor fills every high one (running maximum).
  const cm = PP.cond || "iso", zc = new Float64Array(n);
  { const f = med.findIndex(Number.isFinite); for (let i = 0; i < n; i++) if (!Number.isFinite(med[i])) med[i] = i < f ? med[f] : med[i - 1]; }
  if (cm === "none") zc.set(med);
  else if (cm === "min"){ let run = Infinity; for (let i = 0; i < n; i++){ run = Math.min(run, med[i]); zc[i] = run; } }
  else if (cm === "fill"){ let run = -Infinity; for (let i = n - 1; i >= 0; i--){ run = Math.max(run, med[i]); zc[i] = run; } }
  else { // pool-adjacent-violators for a non-increasing sequence
    const val = [], wt = [], len = []; for (let i = 0; i < n; i++){ val.push(med[i]); wt.push(1); len.push(1); while (val.length > 1 && val[val.length - 2] < val[val.length - 1]){ const v2 = val.pop(), w2 = wt.pop(), l2 = len.pop(), v1 = val.pop(), w1 = wt.pop(), l1 = len.pop(); val.push((v1*w1 + v2*w2)/(w1 + w2)); wt.push(w1 + w2); len.push(l1 + l2); } }
    let i = 0; for (let b = 0; b < val.length; b++) for (let k = 0; k < len[b]; k++) zc[i++] = val[b]; }
  // how much conditioning changed the smoothed profile (both directions)
  let condMax = 0, condKm = 0, condAt = NaN; if (cm !== "none") for (let i = 0; i < n; i++){ const d0 = Math.abs(med[i] - zc[i]); if (d0 > condMax){ condMax = d0; condAt = i*step; } if (d0 > 2) condKm += step; }
  const noCond = cm === "none";
  // slope over a window (m/km)
  const win = Math.max(1, Math.round((PP.slopeKm > 0 ? PP.slopeKm/2 : Math.max(2, R.L/150))/step)), s = new Float64Array(n);
  for (let i = 0; i < n; i++){ const a = Math.max(0, i - win), b = Math.min(n - 1, i + win); s[i] = (zc[a] - zc[b])/Math.max(1e-6, d[b] - d[a]); }
  // knickpoints: local slope well above the slope of the surrounding river; keep the evidence for display
  const knicks = [], big = Math.max(win*6, Math.round(n/30)), kR = PP.kRatio || 2.5, kD = PP.kDrop ?? 5;
  for (let i = win; i < n - win; i++){ const a = Math.max(0, i - big), b = Math.min(n - 1, i + big), around = (zc[a] - zc[b])/Math.max(1e-6, d[b] - d[a]);
    if (s[i] > kR*Math.max(around, .02) && s[i] >= s[i-1] && s[i] >= s[i+1] && (zc[Math.max(0, i - win)] - zc[Math.min(n - 1, i + win)]) > kD) knicks.push(i); }
  const kp = []; for (const i of knicks) if (!kp.length || d[i] - d[kp[kp.length - 1]] > R.L/40) kp.push(i); else if (s[i] > s[kp[kp.length - 1]]) kp[kp.length - 1] = i;
  // multiscale check: is the steepening still there with half and double the slope window?
  const slopeAt = (i, w) => { const a = Math.max(0, i - w), b = Math.min(n - 1, i + w); return (zc[a] - zc[b])/Math.max(1e-6, d[b] - d[a]); };
  const scaleOK = (i, w) => { let best = 0; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) best = Math.max(best, slopeAt(j, w)); const a = Math.max(0, i - big), b = Math.min(n - 1, i + big), around = (zc[a] - zc[b])/Math.max(1e-6, d[b] - d[a]); return best > kR*Math.max(around, .02); };
  // vertical uncertainty: robust spread of the despiked samples about the conditioned profile
  const unc = new Float64Array(n); { const res = Array.from(zs, (v, i) => v - zc[i]), hu = Math.max(5, Math.round(2/step)); for (let i = 0; i < n; i++){ const a = []; for (let k = Math.max(0, i - hu); k <= Math.min(n - 1, i + hu); k++) if (Number.isFinite(res[k])) a.push(res[k]); unc[i] = a.length > 3 ? 1.4826*median(a.map(v => Math.abs(v - median(a)))) : NaN; } }
  const kDetail = i => { const a = Math.max(0, i - big), b = Math.min(n - 1, i + big), around = (zc[a] - zc[b])/Math.max(1e-6, d[b] - d[a]), w0 = Math.max(0, i - win), w1 = Math.min(n - 1, i + win), sp = spike.slice(w0, w1 + 1).reduce((x, y) => x + y, 0);
    return {local: s[i], around, ratio: s[i]/Math.max(around, .02), drop: zc[w0] - zc[w1], win: [d[w0], d[w1]], ctx: [d[a], d[b]], zw: [zc[w0], zc[w1]], zctx: [zc[a], zc[b]], spikesNear: sp, condHere: Math.max(...Array.from({length: w1 - w0 + 1}, (_, j) => Math.abs(med[w0 + j] - zc[w0 + j]))), scales: 1 + (scaleOK(i, Math.max(1, Math.round(win/2))) ? 1 : 0) + (scaleOK(i, win*2) ? 1 : 0)}; };
  // concavity (Langbein): area between the straight line source→mouth and the profile, normalised
  const H = zc[0] - zc[n - 1]; let area = 0; for (let i = 1; i < n; i++){ const ch = zc[0] - H*d[i]/R.L, prof = zc[i]; area += (ch - prof)*(d[i] - d[i-1]); }
  const conc = H > 0 ? 2*area/(H*R.L) : NaN;
  // per main-stem vertex lookups (for colouring the map)
  const zcAt = new Float32Array(R.main.length), sAt = new Float32Array(R.main.length);
  for (let i = 0; i < R.main.length; i++){ const k = Math.min(n - 1, Math.round(R.cum[i]/step)); zcAt[i] = zc[k]; sAt[i] = s[k]; }
  R.prof = {z: zoom || z, user: !!R.zUser, gaps: Array.from(gap.entries()).filter(e => e[1]).map(e => e[0]), gapKm: nGap*step, params: {stepKm: step, smoothKm: (2*mh + 1)*step, slopeKm: 2*win*step, contextKm: 2*big*step, kRatio: kR, kDrop: kD, cond: {iso: "isotonic (least-squares monotone)", min: "running minimum (carve)", fill: "running maximum (fill)", none: "none"}[cm], despike: PP.despike !== false, spikeK: kS}, cond: {max: condMax, km: condKm, at: condAt}, spikes: Array.from(spike).map((v, i) => v ? i : -1).filter(i => i >= 0), zs: Array.from(zs), zm: Array.from(med), made: new Date().toISOString(), step, d: Array.from(d), zr: Array.from(zr), zc: Array.from(zc), s: Array.from(s), knick: kp.map(i => { const k = {km: d[i], z: zc[i], slope: s[i], ...kDetail(i)}; k.artefact = k.spikesNear > 0 || k.condHere > Math.max(10, .5*k.drop); k.confidence = k.artefact ? "possible artefact" : k.scales === 3 ? "robust (3 of 3 scales)" : k.scales === 2 ? "moderate (2 of 3 scales)" : "weak (1 of 3 scales)"; return k; }), unc: Array.from(unc), conc, drop: H, zSrc: zc[0], zMouth: zc[n - 1], grad: H/R.L, failed, zcAt, sAt, res: 40075016.686*Math.cos(R.main[0][0]*D2R)/(256*2**z)};
  return R.prof;
}

/* ---------- 3. planform by reach ---------- */
function buildReaches(R){
  const len = XR.reachKm || (R.L > 2000 ? 100 : R.L > 800 ? 50 : R.L > 200 ? 20 : R.L > 50 ? 5 : Math.max(1, R.L/10));
  const n = Math.max(1, Math.round(R.L/len)), rs = [];
  for (let i = 0; i < n; i++){ const k0 = i*R.L/n, k1 = (i + 1)*R.L/n; rs.push(reachStats(R, k0, k1, i)); }
  R.reaches = rs; return rs;
}
function reachStats(R, k0, k1, i){
  const a = pointAtKm(R, k0), b = pointAtKm(R, k1), straight = hav(a, b), L = k1 - k0;
  // bends from curvature sign changes on a smoothed, evenly resampled centreline
  const step = clamp(L/600, .02, .5), P = toLocal(resampleKm(R, k0, k1, step), (a[0] + b[0])/2, (a[1] + b[1])/2), n = P.length;
  const sm = P.map((_, j) => { let x = 0, y = 0, w = 0; for (let t = -3; t <= 3; t++){ const q = P[clamp(j + t, 0, n - 1)], g = Math.exp(-t*t/4.5); x += q[0]*g; y += q[1]*g; w += g; } return [x/w, y/w]; });
  const cur = []; for (let j = 1; j < n - 1; j++){ const u = [sm[j][0] - sm[j-1][0], sm[j][1] - sm[j-1][1]], v = [sm[j+1][0] - sm[j][0], sm[j+1][1] - sm[j][1]]; cur.push(Math.atan2(u[0]*v[1] - u[1]*v[0], u[0]*v[0] + u[1]*v[1])); }
  const infl = []; let sign = 0; for (let j = 0; j < cur.length; j++){ const s = Math.abs(cur[j]) < .002 ? 0 : Math.sign(cur[j]); if (s && s !== sign){ if (sign) infl.push(j); sign = s; } }
  const half = []; for (let j = 1; j < infl.length; j++){ const p = sm[infl[j-1]], q = sm[infl[j]]; half.push(Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const bends = half.filter(h => h > 3*step).length, lambda = half.length ? 2*median(half) : NaN;
  const az = (Math.atan2((b[1] - a[1])*Math.cos(a[0]*D2R), b[0] - a[0])/D2R + 360) % 360;
  const pr = R.prof; let z0 = NaN, z1 = NaN; if (pr){ z0 = pr.zc[Math.min(pr.zc.length - 1, Math.round(k0/pr.step))]; z1 = pr.zc[Math.min(pr.zc.length - 1, Math.round(k1/pr.step))]; }
  let side = 0; for (const s of R.side){ const m = s[Math.floor(s.length/2)], i0 = idxAtKm(R, k0), i1 = idxAtKm(R, k1); let near = false; for (let t = i0; t <= i1; t += Math.max(1, Math.floor((i1 - i0)/60))) if (hav(R.main[t], m) < Math.max(.5, L/20)){ near = true; break; } if (near) side += withCum(s).pop(); }
  const prev = R.reaches && R.reaches[i] && R.reaches[i].k0 === k0 ? R.reaches[i].width : null;
  return {i, k0, k1, L, straight, sin: L/Math.max(1e-6, straight), bends, lambda, az, z0, z1, drop: z0 - z1, slope: (z0 - z1)/L, multi: 1 + side/L, tribs: R.tribs.filter(t => t.km >= k0 && t.km < k1).length, width: prev};
}
const compass = a => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((a % 360) + 360) % 360/45) % 8];

/** width from OpenStreetMap water areas: rasterise the river's water polygons, then measure across the centreline */
async function measureWidth(R, r){
  const spKm = XR.trSp > 0 ? Math.max(.02, XR.trSp/1000, r.L/2000) : Math.max(.05, r.L/400), a = pointAtKm(R, r.k0), b = pointAtKm(R, r.k1), pts = resampleKm(R, r.k0, r.k1, spKm);
  let s = 90, n = -90, w = 180, e = -180; for (const p of pts){ s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
  const pad = .02; const bb = `${s - pad},${w - pad},${n + pad},${e + pad}`;
  const q = `[out:json][timeout:120];(way["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["natural"="water"](${bb});relation["waterway"="riverbank"](${bb}););out geom;`;
  const data = await overpass(q), lat0 = (s + n)/2, lon0 = (w + e)/2;
  const L = toLocal([[n + pad, w - pad], [s - pad, e + pad]], lat0, lon0), res = clamp(r.L/2500, .005, .05); // km per raster cell
  const W = Math.ceil((L[1][0] - L[0][0])/res), H = Math.ceil((L[1][1] - L[0][1])/res); if (W*H > 2.4e7) throw new Error("reach too large to rasterise: use shorter reaches");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d", {willReadFrequently: true}); g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.fillStyle = "#fff";
  const ring = arr => { const P = toLocal(arr, lat0, lon0); P.forEach((p, j) => { const x = (p[0] - L[0][0])/res, y = (p[1] - L[0][1])/res; j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  for (const el of data.elements || []){ g.beginPath();
    if (el.type === "way" && el.geometry) ring(el.geometry.map(p => [p.lat, p.lon]));
    else if (el.type === "relation" && el.members) for (const m of el.members) if (m.geometry && m.geometry.length > 2) ring(m.geometry.map(p => [p.lat, p.lon]));
    g.fill("evenodd"); }
  const img = g.getImageData(0, 0, W, H).data, inside = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < W && yi < H && img[(yi*W + xi)*4] > 127; };
  const LP = toLocal(pts, lat0, lon0).map(p => [(p[0] - L[0][0])/res, (p[1] - L[0][1])/res]), out = [], tr = [];
  const kx = Math.cos(lat0*D2R)*R_E*D2R, ky = R_E*D2R, geo = (x, y) => [lat0 - (y*res + L[0][1])/ky, lon0 + (x*res + L[0][0])/kx];
  for (let j = 1; j < LP.length - 1; j++){ const [x, y] = LP[j]; const tx = LP[j+1][0] - LP[j-1][0], ty = LP[j+1][1] - LP[j-1][1], tl = Math.hypot(tx, ty) || 1, nx = -ty/tl, ny = tx/tl;
    if (!inside(x, y)) { out.push(NaN); continue; } let w2 = 0, ends = [];
    for (const sg of [1, -1]){ let t = 0; while (t < 4000 && inside(x + sg*nx*t, y + sg*ny*t)) t += .5; w2 += t; ends.push([x + sg*nx*t, y + sg*ny*t]); }
    // braiding: separate wet runs along a transect three channel-widths each side
    const span = Math.max(3*w2, 20); let runs = 0, wet = false; for (let t = -span; t <= span; t += .5){ const v = inside(x + nx*t, y + ny*t); if (v && !wet) runs++; wet = v; }
    out.push(w2*res*1000); tr.push({km: r.k0 + j*spKm, w: w2*res*1000, a: geo(...ends[0]), b: geo(...ends[1]), n: runs, off: false}); }
  const ok = out.filter(Number.isFinite);
  r.width = ok.length > 5 ? {med: median(ok), p10: quantile(ok, .1), p90: quantile(ok, .9), cover: ok.length/out.length, prof: out, km0: r.k0, stepKm: spKm, tr, braid: tr.reduce((s2, t) => s2 + t.n, 0)/Math.max(1, tr.length), made: new Date().toISOString()} : {med: NaN, cover: 0, prof: out, tr};
  return r.width;
}

/* ---------- 4. tributaries: Wikidata facts ---------- */
async function loadWikidata(R){
  const ids = [R.wikidata, ...R.tribs.map(t => t.wikidata)].filter(v => /^Q\d+$/.test(v || "")); if (!ids.length) return;
  const q = `SELECT ?item ?len ?area ?q WHERE { VALUES ?item { ${[...new Set(ids)].map(i => "wd:" + i).join(" ")} }
    OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?len. } OPTIONAL { ?item p:P2053/psn:P2053/wikibase:quantityAmount ?area. } OPTIONAL { ?item p:P2225/psn:P2225/wikibase:quantityAmount ?q. } }`;
  const j = await xfetchJSON(`${EX.wikidata}?format=json&query=${encodeURIComponent(q)}`, {headers: {Accept: "application/sparql-results+json"}});
  const by = new Map(); for (const b of j.results.bindings){ const id = b.item.value.split("/").pop(), o = by.get(id) || {}; if (b.len) o.len = Math.max(o.len || 0, +b.len.value/1000); if (b.area) o.area = Math.max(o.area || 0, +b.area.value/1e6); if (b.q) o.q = Math.max(o.q || 0, +b.q.value); by.set(id, o); }
  R.wd = by.get(R.wikidata) || null; for (const t of R.tribs){ const o = by.get(t.wikidata); if (o){ t.len = o.len; t.area = o.area; t.q = o.q; } }
}

/* ---------- charts (SVG, real pixel size) ---------- */
function svgChart(el, spec){
  const W = Math.max(280, el.clientWidth || 360), H = spec.h || 220, m = {l: 54, r: 12, t: 12, b: 34}, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xs = spec.series.flatMap(s => s.x.filter(Number.isFinite)), ys = spec.series.flatMap(s => s.y.filter(Number.isFinite));
  if (!xs.length || !ys.length){ el.innerHTML = `<p class="note">No data yet.</p>`; return; }
  const lg = spec.logy, f = v => lg ? Math.log10(Math.max(v, 1e-4)) : v;
  let x0 = spec.x0 ?? Math.min(...xs), x1 = spec.x1 ?? Math.max(...xs), y0 = spec.y0 ?? Math.min(...ys.map(f)), y1 = Math.max(...ys.map(f)); if (y1 === y0){ y1 += 1; y0 -= 1; }
  const pad = (y1 - y0)*.06; y0 -= spec.y0 != null ? 0 : pad; y1 += pad;
  const X = v => m.l + (v - x0)/((x1 - x0) || 1)*pw, Y = v => m.t + ph - (f(v) - y0)/((y1 - y0) || 1)*ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xsvg">`;
  for (const t of niceTicks(y0, y1, 4)){ const yy = m.t + ph - (t - y0)/((y1 - y0) || 1)*ph; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="gl"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end">${esc(lg ? tfmt(10**t) : tfmt(t))}</text>`; }
  for (const t of niceTicks(x0, x1, W < 420 ? 4 : 6)) s += `<text x="${X(t)}" y="${H - 16}" text-anchor="middle">${esc(tfmt(t))}</text>`;
  s += `<text x="${m.l + pw/2}" y="${H - 2}" text-anchor="middle" class="al">${esc(spec.xlab)}</text><text transform="translate(12 ${m.t + ph/2}) rotate(-90)" text-anchor="middle" class="al">${esc(spec.ylab)}</text>`;
  for (const v of spec.vlines || []) s += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${m.t}" y2="${m.t + ph}" stroke="${v.c}" stroke-dasharray="${v.dash ? "4 3" : ""}" stroke-width="${v.w || 1}"/>${v.t ? `<text x="${X(v.x) + 3}" y="${m.t + 10 + (v.dy || 0)}" fill="${v.c}" class="vl">${esc(v.t)}</text>` : ""}`;
  for (const sr of spec.series){
    if (sr.bars){ sr.x.forEach((x, i) => { if (!Number.isFinite(sr.y[i])) return; s += `<rect x="${X(x) - (sr.bw || 3)/2}" y="${Math.min(Y(sr.y[i]), Y(sr.base ?? 0))}" width="${sr.bw || 3}" height="${Math.abs(Y(sr.base ?? 0) - Y(sr.y[i]))}" fill="${sr.c}"/>`; }); continue; }
    if (sr.dots){ sr.x.forEach((x, i) => { if (Number.isFinite(sr.y[i])) s += `<circle cx="${X(x)}" cy="${Y(sr.y[i])}" r="${sr.r || 3}" fill="${sr.c}"/>`; }); continue; }
    let d = "", pen = false; const st = Math.max(1, Math.floor(sr.x.length/(pw*1.5))); for (let i = 0; i < sr.x.length; i += st){ if (!Number.isFinite(sr.y[i])){ pen = false; continue; } d += (pen ? "L" : "M") + X(sr.x[i]).toFixed(1) + " " + Y(sr.y[i]).toFixed(1); pen = true; }
    s += `<path d="${d}" fill="none" stroke="${sr.c}" stroke-width="${sr.w || 2}" ${sr.dash ? 'stroke-dasharray="4 3"' : ""}/>`;
  }
  if (spec.cursor != null) s += `<line x1="${X(spec.cursor)}" x2="${X(spec.cursor)}" y1="${m.t}" y2="${m.t + ph}" class="cur"/>`;
  s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent" class="hit"/></svg>`;
  el.innerHTML = s;
  const hit = el.querySelector(".hit"); if (hit && spec.onPick) hit.addEventListener("click", e => { const r = el.querySelector("svg").getBoundingClientRect(); spec.onPick(x0 + (e.clientX - r.left - m.l)/pw*(x1 - x0)); });
}

/* ---------- UI ---------- */
function showXTab(k){ XR.tab = k; document.querySelectorAll("#xTabs button").forEach(b => { b.classList.toggle("on", b.dataset.xt === k); if (b.dataset.xt === k && b.scrollIntoView) try { b.scrollIntoView({inline: "center", block: "nearest", behavior: "smooth"}); } catch(_){} }); document.querySelectorAll(".xpanel").forEach(p => { const on = p.id === "xp-" + k; p.style.display = on ? "" : "none"; if (on){ p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); } }); renderX(); }
function setPos(k){ const R = XR.river; if (!R) return; XR.pos = clamp(k, 0, R.L); const sl = $("xPos"); if (sl) sl.value = XR.pos; if (XR.follow){ const p = pointAtKm(R, XR.pos); xmap.lat = p[0]; xmap.lon = p[1]; } xmap.req(); renderPosInfo(); renderCharts(); }
function renderPosInfo(){
  const R = XR.river, el = $("xPosInfo"); if (!el || !R) return; const k = XR.pos, pr = R.prof, i = pr ? Math.min(pr.zc.length - 1, Math.round(k/pr.step)) : -1, r = reachAt(R, k);
  const nextT = R.tribs.find(t => t.km >= k), prevT = [...R.tribs].reverse().find(t => t.km < k);
  el.innerHTML = `<div class="xkv"><span>Distance from source</span><b>${km(k)}</b></div><div class="xkv"><span>To the mouth</span><b>${km(R.L - k)}</b></div>
    <div class="xkv"><span>Elevation</span><b>${pr ? nf(pr.zc[i]) + " m" : "–"}</b></div><div class="xkv"><span>Slope here</span><b>${pr ? nf(pr.s[i], 2) + " m/km" : "–"}</b></div>
    <div class="xkv"><span>Reach sinuosity</span><b>${r ? nf(r.sin, 2) : "–"}</b></div><div class="xkv"><span>Channel width</span><b>${r && r.width && Number.isFinite(r.width.med) ? nf(r.width.med) + " m" : "<button class='sm' id='xWidthHere'>measure</button>"}</b></div>
    <div class="xkv wide"><span>Tributaries around here</span><b>${prevT ? esc(prevT.name) + " (" + km(k - prevT.km) + " upstream)" : "–"} · ${nextT ? esc(nextT.name) + " (" + km(nextT.km - k) + " downstream)" : "–"}</b></div>`;
  const b = $("xWidthHere"); if (b && r) b.onclick = () => runWidth([r]);
}
async function runWidth(list){
  const R = XR.river; let i = 0;
  for (const r of list){ i++; xstatus(`Measuring channel width from OpenStreetMap water areas: reach ${i} of ${list.length}…`, "busy"); try { await measureWidth(R, r); } catch(e){ xstatus("Width: " + esc(e.message), "err"); return; } renderX(); if (list.length > 1) await new Promise(s => setTimeout(s, 1200)); }
  xstatus(`Widths measured for ${list.length} reach${list.length > 1 ? "es" : ""}. Reaches where the river is drawn only as a line have no width.`, "ok");
}
function renderCharts(){
  const R = XR.river; if (!R) return; const pr = R.prof, pick = k => setPos(k);
  if (XR.tab === "profile" && pr){
    svgChart($("xcProfile"), {h: Math.round(240*(XR.vex || 1)), xlab: "Distance from source (km)", ylab: "Elevation (m)", cursor: XR.pos, onPick: pick, series: [{x: pr.d, y: pr.zs || pr.zr, c: "rgba(150,160,170,.6)", w: 1}, {x: pr.d, y: pr.zc, c: "#4aa8ff", w: 2.4}],
      vlines: [...pr.knick.map(k => ({x: k.km, c: "#ff6b6b", dash: true, t: "K"})), ...R.dams.slice(0, 60).map(d => ({x: d.km, c: "#ffd84a", w: .8}))]});
    svgChart($("xcSlope"), {h: 190, xlab: "Distance from source (km)", ylab: "Slope (m/km, log)", logy: true, cursor: XR.pos, onPick: pick, series: [{x: pr.d, y: pr.s.map(v => Math.max(v, .005)), c: "#ff8a4c", w: 1.8}]});
  }
  if (XR.tab === "reaches" && R.reaches){
    const rs = R.reaches, mid = rs.map(r => (r.k0 + r.k1)/2);
    svgChart($("xcReach"), {h: 210, xlab: "Distance from source (km)", ylab: "Sinuosity", y0: 1, x0: 0, x1: R.L, cursor: XR.pos, onPick: pick, series: [{x: mid, y: rs.map(r => r.sin), c: "#c9a7ff", bars: true, base: 1, bw: Math.max(3, ($("xcReach").clientWidth - 70)/rs.length - 2)}]});
    const wr = rs.filter(r => r.width && Number.isFinite(r.width.med));
    if (wr.length) svgChart($("xcWidth"), {h: 190, xlab: "Distance from source (km)", ylab: "Median width (m)", x0: 0, x1: R.L, cursor: XR.pos, onPick: pick, series: [{x: wr.map(r => (r.k0 + r.k1)/2), y: wr.map(r => r.width.med), c: "#43d9e8", dots: true, r: 4}, {x: wr.map(r => (r.k0 + r.k1)/2), y: wr.map(r => r.width.med), c: "#43d9e8", w: 1.2}]});
    else $("xcWidth").innerHTML = `<p class="note">Widths come from OpenStreetMap's water areas. Measure one reach from its row, or all of them with the button above.</p>`;
  }
  if (XR.tab === "tribs"){
    const T = R.tribs.filter(t => !t.distributary), hasA = T.some(t => t.area);
    svgChart($("xcTrib"), {h: 220, xlab: "Distance from source (km)", ylab: hasA ? "Basin area (km², log)" : "Tributaries", logy: hasA, x0: 0, x1: R.L, cursor: XR.pos, onPick: pick,
      series: hasA ? [{x: T.filter(t => t.area && t.side === "left").map(t => t.km), y: T.filter(t => t.area && t.side === "left").map(t => t.area), c: "#5ad1ff", dots: true, r: 4.5}, {x: T.filter(t => t.area && t.side === "right").map(t => t.km), y: T.filter(t => t.area && t.side === "right").map(t => t.area), c: "#b4f05a", dots: true, r: 4.5}]
        : [{x: T.map(t => t.km), y: T.map(t => t.side === "left" ? 1 : -1), c: "#5ad1ff", bars: true, bw: 2}]});
    // downstream growth: basin area added by tributaries
    const withA = T.filter(t => t.area).sort((a, b) => a.km - b.km);
    if (withA.length >= 2){ let c = 0; const xs = [0], ys = [0]; for (const t of withA){ xs.push(t.km); ys.push(c); c += t.area; xs.push(t.km); ys.push(c); } xs.push(R.L); ys.push(c);
      svgChart($("xcGrow"), {h: 190, xlab: "Distance from source (km)", ylab: "Tributary basin area (km²)", y0: 0, cursor: XR.pos, onPick: pick, series: [{x: xs, y: ys, c: "#4cd17a", w: 2.2}], vlines: R.wd && R.wd.area ? [] : []}); }
    else $("xcGrow").innerHTML = `<p class="note">Basin areas come from Wikidata; none were found for these tributaries yet.</p>`;
    const LA = T.filter(t => t.len && t.area);
    if (LA.length >= 4){ const lx = LA.map(t => Math.log10(t.area)), ly = LA.map(t => Math.log10(t.len)), mx = lx.reduce((a, b) => a + b)/lx.length, my = ly.reduce((a, b) => a + b)/ly.length;
      let sxy = 0, sxx = 0; lx.forEach((v, i) => { sxy += (v - mx)*(ly[i] - my); sxx += (v - mx)**2; }); const hk = sxy/sxx, c0 = 10**(my - hk*mx); XR.hack = {h: hk, c: c0, n: LA.length};
      const ax = [Math.min(...LA.map(t => t.area)), Math.max(...LA.map(t => t.area))];
      svgChart($("xcHack"), {h: 210, xlab: "log₁₀ basin area (km²)", ylab: "log₁₀ length (km)", series: [{x: lx, y: ly, c: "#ffd84a", dots: true, r: 4}, {x: ax.map(Math.log10), y: ax.map(a => Math.log10(c0*a**hk)), c: "#fff", w: 1.4, dash: true}]});
      $("xHackNote").textContent = `Hack's law fit over ${LA.length} tributaries: length ≈ ${tfmt(c0)} × area^${hk.toFixed(2)} (Hack 1957 found an exponent near 0.6).`; }
    else { $("xcHack").innerHTML = ""; $("xHackNote").textContent = "Hack's law needs length and basin area for at least four tributaries (from Wikidata)."; XR.hack = null; }
  }
  renderChartsTail();
}
function renderChartsTail(){ try { moduleCharts(); } catch(e){ console.error(e); } }
function renderX(){
  const R = XR.river;
  $("xEmpty").style.display = R ? "none" : ""; $("xBody").style.display = R ? "" : "none";
  if (xmap) xmap.req();
  if (!R) return;
  const pr = R.prof;
  const tiles = [["Length traced", R.L, "km", 0], ["Source → mouth fall", pr ? pr.drop : NaN, "m", 0], ["Mean gradient", pr ? pr.grad : NaN, "m/km", 3], ["Overall sinuosity", R.L/Math.max(1e-6, hav(R.main[0], R.main[R.main.length - 1])), "", 2], ["Tributaries", R.tribs.filter(t => !t.distributary).length, "", 0], ["Dams & weirs", R.dams.length, "", 0], ...(R.wd && R.wd.area ? [["Basin area", R.wd.area, "km²", 0]] : []), ...(R.wd && R.wd.q ? [["Mean discharge", R.wd.q, "m³/s", 0]] : []), ...(R.basin ? [["Catchment (terrain)", R.basin.area, "km²", 0]] : [])];
  $("xHead").innerHTML = `<div class="xtitle"><span class="kicker">${R.osm.startsWith("draw") ? "Hand-drawn line" : R.osm.startsWith("file:") ? "Your GeoJSON" : "River system"}</span><h2>${esc(R.name)}${R.region ? `<small>${esc(R.region)}</small>` : ""}</h2>
    <p class="xsrc">${R.osm.startsWith("draw") || R.osm.startsWith("file:") ? esc(R.osm.replace(/^file:/, "")) : `OpenStreetMap <a href="https://www.openstreetmap.org/${esc(R.osm)}" target="_blank" rel="noopener">${esc(R.osm)}</a>`}${R.wikidata ? ` · Wikidata <a href="https://www.wikidata.org/wiki/${esc(R.wikidata)}" target="_blank" rel="noopener">${esc(R.wikidata)}</a>` : ""}</p></div>
    <div class="xstats xtiles">${tiles.map(([a, v, u, d]) => `<div><span>${a}</span><b data-v="${Number.isFinite(v) ? v : ""}" data-d="${d}">${Number.isFinite(v) ? nf(v, d) : "…"}</b>${u ? `<em>${u}</em>` : ""}</div>`).join("")}</div>`;
  if (XR.animFor !== R && pr){ XR.animFor = R; $("xHead").querySelectorAll("b[data-v]").forEach(el => { const v = +el.dataset.v, d = +el.dataset.d; if (!el.dataset.v) return; const t0 = performance.now(), T = 900; const f = t => { const u = Math.min(1, (t - t0)/T), e = 1 - (1 - u)**3; el.textContent = nf(v*e, d); if (u < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }); }
  const sl = $("xPos"); sl.max = R.L; sl.step = Math.max(.01, R.L/2000); sl.value = XR.pos;
  $("xMetric").innerHTML = Object.entries(XMETRIC).map(([k, m]) => `<option value="${k}"${k === XR.metric ? " selected" : ""}>Colour by ${m.n.toLowerCase()}</option>`).join("");
  // profile panel
  $("xProfStats").innerHTML = pr ? `${(pr.gaps || []).length > .05*pr.d.length ? `<p class="warn">Quality flag: ${pr.gaps.length} samples (${nf(100*pr.gaps.length/pr.d.length, 0)} %) had no elevation data and were interpolated.</p>` : ""}${pr.cond && pr.cond.max > 15 ? `<p class="warn">Quality flag: forcing the profile to only go downhill changed it by up to ${nf(pr.cond.max)} m (near km ${nf(pr.cond.at)}) and changed ${km(pr.cond.km)} of it by more than 2 m. A low outlier (bridge, dense forest, DEM pit) may be flattening the profile downstream: compare conditioning methods in Parameters.</p>` : ""}<div class="xstats">${[["Source elevation", nf(pr.zSrc) + " m"], ["Mouth elevation", nf(pr.zMouth) + " m"], ["Concavity (0 straight, 1 very concave)", nf(pr.conc, 2)], ["Knickpoints", String(pr.knick.length)], ["Elevation data", `${demLabel(pr, true)} — a terrain surface, not the channel bed; tile zoom sets sampling, not accuracy`], ["Spikes removed", `${pr.spikes ? pr.spikes.length : 0} of ${pr.d.length} samples`], ["Samples with no data (interpolated)", `${(pr.gaps || []).length} (${km(pr.gapKm || 0)})`], ["Conditioning", pr.params.cond === "none" ? "none (smoothed samples)" : `${pr.params.cond}: changed up to ${nf(pr.cond.max, 1)} m over ${km(pr.cond.km)}`]].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}</div>
    ${pr.knick.length ? `<table class="grid"><tr><th>Knickpoint</th><th>km</th><th>elevation</th><th>slope</th><th>dam nearby</th></tr>${pr.knick.map((k, j) => { const dm = R.dams.find(d => Math.abs(d.km - k.km) < Math.max(2, R.L/200)); return `<tr data-k="${k.km}"><td>K${j + 1}</td><td>${nf(k.km, 1)}</td><td>${nf(k.z)} m</td><td>${nf(k.slope, 2)} m/km</td><td>${dm ? esc(dm.name) : "–"}</td></tr>`; }).join("")}</table>` : ""}` : `<p class="note">Reading elevation…</p>`;
  // reaches panel
  const rs = R.reaches || [];
  $("xReachTbl").innerHTML = `<div class="scroll"><table class="grid"><tr><th>Reach</th><th>km</th><th>length</th><th>sinuosity</th><th>bends</th><th>wavelength</th><th>slope</th><th>fall</th><th>multi-channel</th><th>width</th><th>flows</th></tr>
    ${rs.map(r => `<tr data-k="${(r.k0 + r.k1)/2}" class="${XR.pos >= r.k0 && XR.pos <= r.k1 ? "on" : ""}"><td>${r.i + 1}</td><td>${nf(r.k0)}–${nf(r.k1)}</td><td>${km(r.L)}</td><td>${nf(r.sin, 2)}</td><td>${r.bends}</td><td>${km(r.lambda)}</td><td>${nf(r.slope, 3)} m/km</td><td>${nf(r.drop)} m</td><td>${nf(r.multi, 2)}</td><td>${r.width ? (Number.isFinite(r.width.med) ? nf(r.width.med) + " m" : "no area") : `<button class="sm" data-w="${r.i}">measure</button>`}</td><td>${compass(r.az)}</td></tr>`).join("")}</table></div>`;
  $("xReachLen").value = XR.reachKm || "";
  // tributaries panel
  const T = R.tribs; const sel = XR.sel;
  $("xTribSel").innerHTML = sel ? `<div class="card"><b>${esc(sel.name)}</b> <span class="note">${sel.distributary ? "distributary (leaves the river)" : sel.side + " bank tributary"} · joins at km ${nf(sel.km, 1)}</span>
    <div class="xstats">${[["Length (Wikidata)", sel.len ? km(sel.len) : "–"], ["Basin area", sel.area ? nf(sel.area) + " km²" : "–"], ["Mean discharge", sel.q ? nf(sel.q) + " m³/s" : "–"], ["Share of main basin", sel.area && R.wd && R.wd.area ? nf(sel.area/R.wd.area*100, 1) + "%" : "–"]].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}</div>
    <div class="btns">${sel.rel ? `<button class="sm pri" id="xOpenTrib">Explore the ${esc(sel.name)} from source to mouth</button>` : ""}<button class="sm" id="xTribClose">Close</button></div></div>` : "";
  $("xTribTbl").innerHTML = `<div class="scroll"><table class="grid"><tr><th>Tributary</th><th>joins at</th><th>bank</th><th>length</th><th>basin</th><th>discharge</th></tr>${T.map((t, j) => `<tr data-t="${j}" class="${t === sel ? "on" : ""}"><td>${esc(t.name)}${t.distributary ? " <small>(leaves)</small>" : ""}</td><td>${nf(t.km, 1)} km</td><td>${t.side}</td><td>${t.len ? km(t.len) : "–"}</td><td>${t.area ? nf(t.area) + " km²" : "–"}</td><td>${t.q ? nf(t.q) + " m³/s" : "–"}</td></tr>`).join("")}</table></div>`;
  const ot = $("xOpenTrib"); if (ot) ot.onclick = () => { XR.stack = XR.stack || []; XR.stack.push(R); loadRiver({osm_type: "relation", osm_id: sel.rel, name: sel.name, display_name: sel.name}).catch(e => xstatus(esc(e.message), "err")); };
  const tc = $("xTribClose"); if (tc) tc.onclick = () => { XR.sel = null; renderX(); };
  $("xBack").style.display = XR.stack && XR.stack.length ? "" : "none";
  try { renderModules(); } catch(e){ console.error(e); }
  document.querySelectorAll("#xBody [data-k]").forEach(tr => tr.onclick = () => setPos(+tr.dataset.k));
  document.querySelectorAll("#xBody [data-t]").forEach(tr => tr.onclick = () => { XR.sel = R.tribs[+tr.dataset.t]; setPos(XR.sel.km); const p = pointAtKm(R, XR.sel.km); xmap.lat = p[0]; xmap.lon = p[1]; xmap.z = Math.max(xmap.z, 9); renderX(); });
  document.querySelectorAll("#xBody [data-w]").forEach(b => b.onclick = e => { e.stopPropagation(); runWidth([R.reaches[+b.dataset.w]]); });
  renderPosInfo(); renderCharts();
}

/* ---------- fly-along & hand-off to the image tools ---------- */
function flyTo(k, zoom){ const R = XR.river; if (!R) return; XR.follow = true; const p = pointAtKm(R, k); xmap.lat = p[0]; xmap.lon = p[1]; if (zoom) xmap.z = zoom; setPos(k); }
function togglePlay(){
  if (XR.play){ clearInterval(XR.play); XR.play = null; $("xPlay").textContent = "▶ Fly along"; return; }
  const R = XR.river; if (!R) return; if (xmap.z < 10) xmap.z = 12; $("xPlay").textContent = "❚❚ Pause";
  XR.play = setInterval(() => { const viewKm = xmap.mpp()*xmap.size()[0]/1000; let k = XR.pos + viewKm*.12; if (k >= R.L){ k = R.L; togglePlay(); } flyTo(k); }, 450);
}
async function captureView(){
  if (EX.base[XR.base].plain){ const [w0, h0] = xmap.size(), c0 = document.createElement("canvas"); c0.width = w0; c0.height = h0; const g0 = c0.getContext("2d"); g0.fillStyle = "#fff"; g0.fillRect(0, 0, w0, h0); return {canvas: c0, mpp: 40075016.686*Math.cos(xmap.lat*D2R)/(256*2**xmap.z)}; }
  const [w, h] = xmap.size(), z = Math.round(xmap.z), base = EX.base[XR.base], scale = Math.min(2, 1600/Math.max(w, h)), W = Math.round(w*scale), H = Math.round(h*scale), zz = xmap.z + Math.log2(scale);
  const zi = Math.max(0, Math.min(base.max, Math.round(zz))), s = 2**(zz - zi), cx = lon2x(xmap.lon, zi), cy = lat2y(xmap.lat, zi), x0 = Math.floor((cx - W/2/s)/256), x1 = Math.floor((cx + W/2/s)/256), y0 = Math.floor((cy - H/2/s)/256), y1 = Math.floor((cy + H/2/s)/256), n = 2**zi;
  const ps = []; for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) ps.push(getTile(base.url(zi, ((tx % n) + n) % n, ty)).p); await Promise.all(ps);
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); xmap.drawTiles(g, W, H, xmap.lat, xmap.lon, zz, base);
  try { g.getImageData(0, 0, 1, 1); } catch(_){ throw new Error("this imagery server doesn't allow reading its pixels here; try another base map"); }
  const mpp = 40075016.686*Math.cos(xmap.lat*D2R)/(256*2**zz);
  return {canvas: c, mpp};
}
async function sendViewToLab(fig){
  try { xstatus("Capturing this view…", "busy"); const {canvas, mpp} = await captureView(); const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", .92));
    const R = XR.river, label = R ? `${R.name}, km ${nf(XR.pos)} from source` : "Map view";
    window.__pendingPlace = {caption: label, title: label}; window.__pendingScale = mpp;
    await loadFile(new File([blob], (label.replace(/[^\w]+/g, "_") || "view") + ".jpg", {type: "image/jpeg"}), "A");
    xstatus(`Sent to the image tools at ${mpp.toPrecision(3)} m per pixel.`, "ok");
    if (fig === true){ actSet("fig", "Measuring the view for the figure…"); try { await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 240 && G._autoRunning; i++) await new Promise(r => setTimeout(r, 500)); } finally { actEnd("fig"); } makeFigure(); }
  } catch(e){ xstatus(esc(e.message), "err"); }
}

/* ---------- drawing a river by hand ---------- */
function renderDrawBar(){ const b = $("xDrawBar"); if (!b) return; b.style.display = XR.draw ? "" : "none"; if (XR.draw) $("xDrawN").textContent = `${XR.draw.pts.length} point${XR.draw.pts.length === 1 ? "" : "s"}: tap along the river from source to mouth`; }
async function useDrawn(){
  const P = XR.draw && XR.draw.pts; if (!P || P.length < 2) return toast("Tap at least two points");
  const dense = []; for (let i = 0; i + 1 < P.length; i++){ const n = Math.max(1, Math.ceil(hav(P[i], P[i+1])/.05)); for (let t = 0; t < n; t++) dense.push([P[i][0] + (P[i+1][0] - P[i][0])*t/n, P[i][1] + (P[i+1][1] - P[i][1])*t/n]); } dense.push(P[P.length - 1]);
  const R = {name: "Hand-drawn river", osm: "draw", main: dense, cum: withCum(dense), side: [], tribs: [], dams: [], prof: null, reaches: null};
  R.L = R.cum[R.cum.length - 1]; XR.draw = null; renderDrawBar(); XR.river = R; XR.pos = 0; buildReaches(R); renderX();
  try { xstatus("Reading elevation along your line…", "busy"); await loadProfile(R); buildReaches(R); renderX(); xstatus(`Your line: ${km(R.L)}, falling ${nf(R.prof.drop)} m.`, "ok"); } catch(e){ xstatus(esc(e.message), "err"); }
}

/* ---------- exports ---------- */
/* text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start) is prefixed with ' so a downloaded CSV is safe to open */
function csvSafe(v){ const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) && !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? "'" + t : t; }
function csvCell(v){ if (v == null || (typeof v === "number" && !Number.isFinite(v))) return ""; if (typeof v === "number") return String(v); const t = csvSafe(v); return /[,"\n\r]/.test(t) || t !== String(v) ? `"${t.replace(/"/g, '""')}"` : t; }
function xcsv(rows){ const k = Object.keys(rows[0] || {}); return [k.map(csvCell).join(","), ...rows.map(r => k.map(c => typeof r[c] === "number" ? (Number.isFinite(r[c]) ? +r[c].toPrecision(7) : "") : `"${csvSafe(r[c]).replace(/"/g, '""')}"`).join(","))].join("\n"); }
function exportX(kind){
  const R = XR.river; if (!R) return; const nm = R.name.replace(/[^\w]+/g, "_");
  if (kind === "profile" && R.prof) { const G = new Set(R.prof.gaps || []), S = new Set(R.prof.spikes || []); save(nm + "_long_profile.csv", xcsv(R.prof.d.map((d, i) => ({km_from_source: d, elevation_raw_m: R.prof.zr[i], elevation_despiked_m: R.prof.zs ? R.prof.zs[i] : "", elevation_smoothed_m: R.prof.zm ? R.prof.zm[i] : "", elevation_conditioned_m: R.prof.zc[i], residual_raw_minus_conditioned_m: Number.isFinite(R.prof.zr[i]) ? R.prof.zr[i] - R.prof.zc[i] : "", spread_1sd_m: R.prof.unc ? R.prof.unc[i] : "", slope_m_per_km: R.prof.s[i], flag_no_data_interpolated: G.has(i) ? 1 : 0, flag_spike_removed: S.has(i) ? 1 : 0, dem: demLabel(R.prof, true), vertical_datum: (R.prof.src && R.prof.src.key === "glo90") ? "EGM2008 (Copernicus)" : "mixed (EGM96 / national; see source)", conditioning: String(R.prof.params.cond)})))); }
  if (kind === "reaches") save(nm + "_reaches.csv", xcsv(R.reaches.map(r => ({reach: r.i + 1, km_start: r.k0, km_end: r.k1, length_km: r.L, straight_km: r.straight, sinuosity: r.sin, bends: r.bends, wavelength_km: r.lambda, slope_m_per_km: r.slope, fall_m: r.drop, multichannel_index: r.multi, median_width_m: r.width ? r.width.med : NaN, width_p10_m: r.width ? r.width.p10 : NaN, width_p90_m: r.width ? r.width.p90 : NaN, direction: compass(r.az), tributaries: r.tribs}))));
  if (kind === "tribs") save(nm + "_tributaries.csv", xcsv(R.tribs.map(t => ({name: t.name, joins_at_km: t.km, bank: t.side, distributary: t.distributary ? "yes" : "no", length_km: t.len ?? NaN, basin_km2: t.area ?? NaN, discharge_m3s: t.q ?? NaN, osm_relation: t.rel || "", wikidata: t.wikidata || "", lat: t.lat, lon: t.lon}))));
  if (kind === "basin" && R.basin){ const B = R.basin, N2 = R.net2; save(nm + "_catchment_network.csv", xcsv([...[["catchment_area_km2", B.area], ["relief_m", B.relief], ["max_elevation_m", B.zmax], ["min_elevation_m", B.zmin], ["hypsometric_integral", B.HI], ["basin_length_km", B.Lb], ["relief_ratio", B.reliefRatio], ["elongation_ratio", B.Re], ["terrain_cell_m", B.cellKm*1000], ["edge_clipped", B.clipped ? 1 : 0], ...(N2 ? [["channel_threshold_km2", N2.At], ["max_strahler_order", N2.maxO], ["bifurcation_ratio", N2.Rb], ["length_ratio", N2.Rl], ["drainage_density_km_per_km2", N2.Dd], ["stream_frequency_per_km2", N2.freq], ...N2.orders.flatMap(o => [["order_" + o + "_segments", N2.counts[o]], ["order_" + o + "_length_km", N2.lens[o]]])] : []), ...B.curve.map(c => ["hypsometry_a" + c[0].toFixed(2), c[1]])].map(([k, v]) => ({measure: k, value: v}))])); }
  if (kind === "floodplain" && R.fp) save(nm + "_floodplain_sections.csv", xcsv(R.fp.secs.map(q => ({km_from_source: q.km, channel_elevation_m: q.z0, floodplain_width_m: q.fp, valley_floor_width_m: q.valley, at_search_limit: q.capped ? 1 : 0, asymmetry_left_minus_right: q.asym}))));
  if (kind === "geojson") save(nm + ".geojson", JSON.stringify({type: "FeatureCollection", features: [{type: "Feature", properties: {name: R.name, length_km: R.L}, geometry: {type: "LineString", coordinates: R.main.map(p => [+p[1].toFixed(6), +p[0].toFixed(6)])}}, ...R.tribs.map(t => ({type: "Feature", properties: {name: t.name, km: t.km, bank: t.side}, geometry: {type: "Point", coordinates: [t.lon, t.lat]}}))]}));
}

/* ---------- wiring ---------- */
{
  const cv = $("xMap"); if (cv){ xmap = makeMap(cv); xmap.req(); }
  const ICON = t => /canal/i.test(t || "") ? "⛴" : /stream|creek|brook/i.test(t || "") ? "≈" : "〰";
  const showResults = (res, q, done, status) => {
    const box = $("xResults"); if (XR.searchQ !== q) return;
    if (!res.length){ box.innerHTML = done ? `<div class="xres-empty">No river called “${esc(q)}” found.${status ? `<small>${Object.entries(status).map(([n, v]) => `${n}: ${typeof v === "number" ? v + " results" : esc(v)}`).join(" · ")}</small>` : ""}</div>` : `<div class="xres-empty shimmer">Searching…</div>`; box.classList.add("open"); return; }
    box.innerHTML = res.map((r, i) => `<button class="xres" data-i="${i}" style="--d:${i*30}ms"><i class="xri">${ICON(r.type)}</i><span class="xrt"><b>${esc(r.name)}</b><small>${esc(r.desc || r.where || r.display_name)}</small></span><span class="xrb">${r.osm_type === "relation" ? `<em class="ok">whole river</em>` : `<em>${esc(r.osm_type)}</em>`}${r.type ? `<em>${esc(r.type)}</em>` : ""}</span></button>`).join("") + (done ? "" : `<div class="xres-more shimmer">more results coming…</div>`);
    box.classList.add("open");
    box.querySelectorAll(".xres").forEach(bt => bt.onclick = () => { const r = res[+bt.dataset.i]; box.classList.remove("open"); box.innerHTML = ""; $("xQ").value = r.name; $("xQ").blur(); XR.stack = []; loadRiver(r).catch(e => { console.error(e); stepFail(e.message); xstatus(esc(e.message), "err"); }); });
  };
  const go = async (live) => { const q = $("xQ").value.trim(); if (!q || (live && q.length < 3)) return; XR.searchQ = q; const sb = document.querySelector(".xsearch"); sb && sb.classList.add("searching"); try { await goInner(live, q); } finally { if (XR.searchQ === q && sb) sb.classList.remove("searching"); } };
  const goInner = async (live, q) => {
    if (!live) xstatus(`Searching for “${esc(q)}”…`, "busy");
    showResults([], q, false);
    try { const res = await searchRivers(q, (part, st) => showResults(part, q, false, st), {live});
      if (XR.searchQ !== q) return; showResults(res, q, true, res.status);
      const st = res.status, failed = Object.values(st).filter(v => typeof v !== "number").length;
      if (!res.length && failed === Object.keys(st).length){ const blocked = inClaude(); $("xResults").classList.remove("open"); xstatus(blocked ? "This copy runs inside Claude, which blocks live map services. Open your GitHub Pages copy of Earthform Lens to search rivers." : "None of the search services answered. Check your connection, or tap <b>Check connection</b>.", "err"); showConn(); }
      else if (!live) xstatus(res.length ? `${res.length} match${res.length > 1 ? "es" : ""}: pick the river.${failed ? ` (${failed} service${failed > 1 ? "s" : ""} didn't answer.)` : ""}` : `Nothing found for “${esc(q)}”. Try the local name (e.g. “Donau”) or another spelling.`, res.length ? "ok" : "err");
    } catch(e){ xstatus("Search failed: " + esc(e.message), "err"); } };
  let liveT = 0;
  if ($("xGo")){ $("xGo").onclick = () => go(false);
    $("xQ").addEventListener("keydown", e => { if (e.key === "Enter"){ clearTimeout(liveT); go(false); } if (e.key === "Escape") $("xResults").classList.remove("open"); });
    $("xQ").addEventListener("input", () => { clearTimeout(liveT); liveT = setTimeout(() => go(true), 450); });
    $("xQ").addEventListener("focus", () => { if ($("xResults").innerHTML) $("xResults").classList.add("open"); });
    document.addEventListener("click", e => { if (!e.target.closest(".xsearchbox")) $("xResults").classList.remove("open"); }); }
  $("xConn") && ($("xConn").onclick = () => showConn());
  $("logoHome") && ($("logoHome").onclick = () => showApp("home"));
  if (inClaude()) xstatus("You're viewing the copy inside Claude: live river data is blocked here. Open your GitHub Pages copy to search rivers (everything else works).", "err");
  document.querySelectorAll("#xTabs button").forEach(b => b.onclick = () => showXTab(b.dataset.xt));
  document.querySelectorAll("[data-xq]").forEach(b => b.onclick = () => { $("xQ").value = b.dataset.xq; go(false); $("xQ").scrollIntoView({block: "center", behavior: "smooth"}); });
  $("xBase") && ($("xBase").innerHTML = Object.entries(EX.base).map(([k, b]) => `<option value="${k}">${b.n}</option>`).join(""), $("xBase").onchange = e => { XR.base = e.target.value; xmap.req(); });
  $("xMetric") && ($("xMetric").onchange = e => { XR.metric = e.target.value; xmap.req(); });
  $("xPos") && ($("xPos").oninput = e => { XR.follow = $("xFollow").checked; setPos(+e.target.value); });
  $("xFollow") && ($("xFollow").onchange = e => { XR.follow = e.target.checked; if (XR.follow) setPos(XR.pos); });
  $("xPlay") && ($("xPlay").onclick = togglePlay);
  $("xToLab") && ($("xToLab").onclick = () => sendViewToLab(false));
  $("xToFig") && ($("xToFig").onclick = () => sendViewToLab(true));
  $("xFit") && ($("xFit").onclick = () => XR.river && xmap.fit(XR.river.main));
  $("xSrc") && ($("xSrc").onclick = () => flyTo(0, 12)); $("xMouth") && ($("xMouth").onclick = () => flyTo(XR.river.L, 12));
  $("xReachLen") && ($("xReachLen").onchange = e => { XR.reachKm = Math.max(0, +e.target.value || 0); if (XR.river){ XR.river.reachKm = 0; buildReaches(XR.river); renderX(); } });
  $("xWidthAll") && ($("xWidthAll").onclick = () => XR.river && runWidth(XR.river.reaches.filter(r => !r.width)));
  $("xRefine") && ($("xRefine").onclick = async () => { const R = XR.river; if (!R || !R.prof) return; try { xstatus("Reading finer elevation…", "busy"); await loadProfile(R, Math.min(13, R.prof.z + 2)); buildReaches(R); renderX(); xstatus("Profile refined.", "ok"); } catch(e){ xstatus(esc(e.message), "err"); } });
  $("xDraw") && ($("xDraw").onclick = () => { XR.draw = XR.draw ? null : {pts: []}; renderDrawBar(); xmap.req(); });
  $("xDrawUndo") && ($("xDrawUndo").onclick = () => { if (XR.draw){ XR.draw.pts.pop(); renderDrawBar(); xmap.req(); } });
  $("xDrawUse") && ($("xDrawUse").onclick = useDrawn);
  $("xDrawCancel") && ($("xDrawCancel").onclick = () => { XR.draw = null; renderDrawBar(); xmap.req(); });
  $("xBack") && ($("xBack").onclick = () => { const p = XR.stack.pop(); if (p){ XR.river = p; XR.sel = null; XR.pos = 0; xmap.fit(p.main); renderX(); } });
  document.querySelectorAll("[data-xexp]").forEach(b => b.onclick = () => exportX(b.dataset.xexp));
  window.addEventListener("resize", () => renderCharts());
  window.__xr = XR; window.__xmap = () => xmap;
}
