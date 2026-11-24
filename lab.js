/* ===================== Earthform Lens — application ===================== */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const labRoot = document.getElementById("app-lab");
const tick = () => new Promise(r => setTimeout(r, 25));

/* ---------------- state ---------------- */
const G = {
  D: null,              // dataset A {w,h,rgba,bands,bandMap,dem,name,kind,geo}
  DB: null,             // dataset B (change)
  w: 0, h: 0,
  pxm: null, pxSrc: "", north: 0,
  maxDim: 1600,
  roi: null, pbox: null, scaleLine: null,
  excl: null, mask: null, maskV: 0,
  samples: [],
  outlet: null, head: null,
  prep: null, chan: null, net: null, lakes: null, pattern: null, cover: null, terr: null, hydro: null, change: null,
  meas: [], cur: null,
  tool: "pan",
  lay: {chans:true, mask:true, net:false, lakes:true, cover:false, streams:true, basin:true, change:true, excl:true, vec:true},
  results: {}, tables: {},
  view: {s:1, x:0, y:0},
};
window.__lab = G;

/* ---------------- units ---------------- */
const fx = (v, d) => !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toFixed(d);
const U = {
  L(px){
    if (!Number.isFinite(px)) return {v:NaN, u:"", s:"–"};
    if (!G.pxm) return {v:px, u:"px", s:fx(px, px < 10 ? 1 : 0) + " px"};
    const m = px*G.pxm;
    return m >= 1000 ? {v:m, u:"m", s:fx(m/1000, m >= 1e4 ? 1 : 2) + " km"} : {v:m, u:"m", s:fx(m, m < 10 ? 2 : 1) + " m"};
  },
  A(px2){
    if (!Number.isFinite(px2)) return {v:NaN, u:"", s:"–"};
    if (!G.pxm) return {v:px2, u:"px²", s:fx(px2, 0) + " px²"};
    const m2 = px2*G.pxm*G.pxm;
    return m2 >= 1e6 ? {v:m2, u:"m²", s:fx(m2/1e6, m2 >= 1e8 ? 1 : 3) + " km²"} : m2 >= 1e4 ? {v:m2, u:"m²", s:fx(m2/1e4, 2) + " ha"} : {v:m2, u:"m²", s:fx(m2, 0) + " m²"};
  },
  N(v, d = 2, u = ""){ return {v, u, s: fx(v, d) + (u ? " " + u : "")}; },
  D(v){ return {v, u:"°", s: fx(v, 0) + "°"}; },
  P(v){ return {v: v*100, u:"%", s: fx(v*100, 1) + " %"}; },
};
const ax180 = a => { const v = Math.round(((a % 180) + 180) % 180); return v === 180 ? 0 : v; };
const lenUnit = () => G.pxm ? "m" : "px";
const minOf = a => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
const maxOf = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };

/* ---------------- results rendering ---------------- */
function showRes(mod, rows, extra = ""){
  G.results[mod] = rows.filter(r => r && !r.sec);
  let h = '<table class="res">', idx = 0;
  for (const r of rows){
    if (!r) continue;
    if (r.sec){ h += `<tr class="sec"><td colspan="2">${r.sec}</td></tr>`; continue; }
    h += `<tr data-gk="${mod}|${idx++}"><td>${r.k}${r.n ? `<br><small>${r.n}</small>` : ""}</td><td>${r.s}</td></tr>`;
  }
  h += "</table>";
  if (!G.pxm && ["channel","network","lakes","pattern","change","measure"].includes(mod)) h = '<p class="warn">Scale not set, so lengths are in pixels. Set it in Setup to get metres.</p>' + h;
  $("res-" + mod).innerHTML = h + extra;
}
const R = (k, o, n) => ({k, v:o.v, u:o.u, s:o.s, n});
const SEC = t => ({sec:t});

/* ---------------- tabs, tools, layers ---------------- */
const TABS = [["setup","Image & scale"],["water","Water"],["channel","Channel"],["network","Network & delta"],["lakes","Lakes"],["pattern","Patterns"],["cover","Surface"],["terrain","Terrain"],["measure","Measure by hand"],["change","Change over time"],["plot","Plot"],["export","Export"],["learn","Learn"]];
const TAB_NAME = Object.fromEntries(TABS);
const STEPS = [["prepare","Prepare","image & water",["setup","water"]],["measure","Measure","forms & patterns",["channel","network","lakes","pattern","cover","terrain","measure"]],["compare","Compare","dates",["change"]],["results","Results","plot & export",["plot","export","learn"]]];
const STEP_TOOLS = {prepare:["pan","scale","roi","sample","erase"], measure:["pan","outlet","head","pbox","line","poly"], compare:["pan"], results:["pan"]};
const stepOf = k => (STEPS.find(s => s[3].includes(k)) || STEPS[0])[0];
G.lastTab = {};
STEPS.forEach(([k, n, sub, tabs], i) => {
  const b = document.createElement("button"); b.dataset.step = k; b.innerHTML = `${i+1} · ${n}<small>${sub}</small>`;
  b.onclick = () => showTab(G.lastTab[k] || tabs[0]); $("steps").appendChild(b);
});
function showTab(k){
  const st = stepOf(k), step = STEPS.find(s => s[0] === st); G.lastTab[st] = k;
  // sub-tabs for this step only
  $("tabs").innerHTML = step[3].length > 1 ? step[3].map(t => `<button class="tab${t === k ? " on" : ""}" data-t="${t}">${TAB_NAME[t]}</button>`).join("") : "";
  $("tabs").querySelectorAll(".tab").forEach(b => b.onclick = () => showTab(b.dataset.t));
  $("tabs").style.display = step[3].length > 1 ? "" : "none";
  document.querySelectorAll("#steps button").forEach(b => b.classList.toggle("on", b.dataset.step === st));
  // tools for this step only
  const allowed = STEP_TOOLS[st];
  document.querySelectorAll("#tools .tool").forEach(b => b.style.display = allowed.includes(b.dataset.k) ? "" : "none");
  if (G.tool && !allowed.includes(G.tool) && typeof setTool === "function" && document.querySelector("#tools .tool")) { G.tool = "pan"; document.querySelectorAll(".tool").forEach(t => t.classList.toggle("on", t.dataset.k === "pan")); }
  G.tab = k; labRoot.classList.toggle("noview", k === "learn" || k === "plot");
  if (k === "change" && G.sv && !["compare","migration","dates"].includes(G.hl)){ G.hl = "compare"; rebuildOverlay(); }
  else if (k !== "change" && G.sv && ["compare","migration","dates"].includes(G.hl)){ G.hl = null; G.swipe = null; if ($("swipe")) $("swipe").value = 0; rebuildOverlay(); }
  if (k === "plot" && typeof renderPlotUI === "function") requestAnimationFrame(renderPlotUI);
  labRoot.querySelectorAll(".panel").forEach(p => p.classList.toggle("on", p.id === "p-" + k));
  requestAnimationFrame(() => document.querySelectorAll("#p-" + k + " canvas").forEach(c => { if (c._pending){ const f = c._pending; c._pending = null; f(); } }));
}
showTab("setup");

const TOOLS = [
  ["pan","✋ Pan","Drag to move, pinch or scroll to zoom."],
  ["sample","💧 Sample","Tap water to add colour samples."],
  ["scale","📏 Scale","Drag along something of known length, then enter the length in Setup."],
  ["roi","⬚ Area","Drag a box around the area to analyse."],
  ["erase","🧽 Erase","Paint over areas to leave out of the mask."],
  ["outlet","⊙ Outlet","Tap the mouth or downstream end of the channel."],
  ["head","◎ Head","Tap the upstream end of the main channel."],
  ["pbox","▦ Pattern","Drag a box over a repeating pattern such as dunes or ridges."],
  ["line","／ Line","Tap points along a feature. Finish in Measure."],
  ["poly","⬠ Polygon","Tap around a feature. Finish in Measure."],
];
TOOLS.forEach(([k, n]) => {
  const b = document.createElement("button"); b.className = "tool" + (k === "pan" ? " on" : ""); b.textContent = n; b.dataset.k = k;
  b.onclick = () => setTool(k); $("tools").appendChild(b);
});
function setTool(k){
  if (G.cur && k !== G.tool) finishShape();
  G.tool = k;
  document.querySelectorAll(".tool").forEach(t => t.classList.toggle("on", t.dataset.k === k));
  const t = TOOLS.find(x => x[0] === k);
  const vh = $("vhint"); vh.textContent = t[2]; vh.style.display = G.D ? "block" : "none";
  clearTimeout(setTool.t); setTool.t = setTimeout(() => vh.style.display = "none", 4000);
  if (k === "sample" || k === "erase") showTab("water");
  if (k === "scale") showTab("setup");
  if (k === "line" || k === "poly") showTab("measure");
}
const LAYERS = [["chans","Channels"],["mask","Water"],["net","Stream order"],["lakes","Lakes"],["cover","Cover"],["streams","Streams"],["basin","Basin"],["change","Change"],["excl","Erased"],["vec","Lines & marks"]];
$("btnLayers").onclick = () => { const l = $("layers"); l.style.display = l.style.display === "none" ? "flex" : "none"; };
LAYERS.forEach(([k, n]) => {
  const b = document.createElement("button"); b.className = "lay" + (G.lay[k] ? " on" : ""); b.textContent = n; b.dataset.k = k;
  b.onclick = () => { G.lay[k] = !G.lay[k]; b.classList.toggle("on", G.lay[k]); rebuildOverlay(); };
  $("layers").appendChild(b);
});

/* ---------------- misc UI helpers ---------------- */
let toastT = 0;
function toast(m, ms = 2400){ const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); }
async function busy(msg, fn){
  $("busyMsg").textContent = msg; $("busy").classList.add("on"); actSet("lab", msg); await tick();
  try { return await fn(); }
  catch (e){ console.error(e); toast("Error: " + (e.message || e), 4000); }
  finally { $("busy").classList.remove("on"); actEnd("lab"); }
}
function modal(html){ $("modalBox").innerHTML = html; $("modal").classList.add("on"); }
function closeModal(){ $("modal").classList.remove("on"); }
$("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
function bindRange(id, fmt, cb){
  const el = $(id), out = $(id + "O");
  const f = () => { if (out) out.textContent = fmt(+el.value); cb && cb(+el.value); };
  el.addEventListener("input", f); f();
  return el;
}
const roiOrFull = () => G.roi || {x0:0, y0:0, x1:G.w, y1:G.h};
function roiMask(){
  const m = new Uint8Array(G.w*G.h), r = roiOrFull();
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) m[y*G.w+x] = 1;
  return m;
}
function roiArea(){ const r = roiOrFull(); return (r.x1-r.x0)*(r.y1-r.y0); }

/* ---------------- loading ---------------- */
$("btnOpen").onclick = $("btnOpen2").onclick = () => $("fileA").click();
$("fileA").onchange = e => { const f = e.target.files[0]; if (f) loadFile(f, "A"); e.target.value = ""; };

document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f, "A"); });
document.addEventListener("paste", e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/")); if (it) loadFile(it.getAsFile(), "A"); });

const RES = [["Fast · 1000", 1000], ["Standard · 1600", 1600], ["Detailed · 2400", 2400]];
function renderResChips(){
  const el = $("resChips"); el.innerHTML = "";
  RES.forEach(([n, v]) => { const b = document.createElement("button"); b.className = "chip" + (G.maxDim === v ? " on" : ""); b.textContent = n; b.onclick = () => { G.maxDim = v; renderResChips(); }; el.appendChild(b); });
}
renderResChips();

async function loadFile(file, slot){
  await loadFile0(file, slot);
  if (slot !== "B" && G.D && window.__onLoaded) window.__onLoaded();
}
async function loadFile0(file, slot){
  const isTif = /\.tiff?$/i.test(file.name) || file.type === "image/tiff";
  await busy("Reading " + file.name + "…", async () => {
    if (isTif){
      const T = await readTIFF(await file.arrayBuffer());
      if (slot === "B"){ if (T.spp === 1 && T.sampleFormat === 3) throw new Error("The later image must be imagery, not a DEM"); return setB(fromTiffImagery(T, file.name)); }
      const looksDem = T.spp === 1 && (T.sampleFormat === 3 || T.bps >= 16);
      if (T.spp === 1){
        const choice = await askKind(looksDem);
        if (choice === "dem") return setA(fromTiffDem(T, file.name));
      }
      return setA(fromTiffImagery(T, file.name));
    }
    const img = await loadImg(file);
    const D = fromBitmap(img, slot === "B" ? G.w : null, slot === "B" ? G.h : null);
    D.name = file.name; D.img = img;
    if (slot === "B") setB(D); else setA(D);
  });
}
function askKind(dem){
  return new Promise(res => {
    modal(`<h3>Single-band GeoTIFF</h3><p class="note">Is this an elevation model or a single image band?</p>
      <div class="btns"><button class="${dem ? "pri" : ""}" id="kDem">Elevation (DEM)</button><button class="${dem ? "" : "pri"}" id="kImg">Image band</button></div>`);
    $("kDem").onclick = () => { closeModal(); res("dem"); };
    $("kImg").onclick = () => { closeModal(); res("img"); };
  });
}
function loadImg(file){
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Can't read image")); im.src = u; });
}
function workSize(W, H){ const M = Math.max(W, H), s = M < 900 ? Math.min(2, 1100/M) : Math.min(1, G.maxDim/M); /* small screenshots are upsampled so thin creeks are wide enough to detect */ return [Math.max(2, Math.round(W*s)), Math.max(2, Math.round(H*s)), W/Math.max(2, Math.round(W*s))]; }
function fromBitmap(img, fw, fh){
  let [w, h, f] = fw ? [fw, fh, img.naturalWidth/fw] : workSize(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", {willReadFrequently:true}); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, w, h);
  return {w, h, f, rgba: ctx.getImageData(0, 0, w, h).data, bands:null, dem:null, kind:"image", geo:null, srcW: img.naturalWidth, srcH: img.naturalHeight};
}
function stretch(b){
  const s = []; for (let i = 0; i < b.length; i += Math.max(1, (b.length/40000)|0)) if (Number.isFinite(b[i])) s.push(b[i]);
  return [quantile(s, .02), quantile(s, .98)];
}
function fromTiffImagery(T, name){
  const [w, h, f] = workSize(T.width, T.height);
  const bands = T.bands.map(b => resampleBand(b, T.width, T.height, w, h));
  const map = T.spp >= 4 ? {r:0, g:1, b:2, nir:3} : T.spp === 3 ? {r:0, g:1, b:2, nir:-1} : {r:0, g:0, b:0, nir:-1};
  const D = {w, h, f, bands, bandMap: map, dem:null, kind:"multiband", geo:T.geo, name, srcW:T.width, srcH:T.height, rgba: new Uint8ClampedArray(w*h*4)};
  renderBands(D);
  return D;
}
function renderBands(D){
  const m = D.bandMap, R = D.bands[m.r], Gg = D.bands[m.g], B = D.bands[m.b];
  const sr = stretch(R), sg = stretch(Gg), sb = stretch(B);
  for (let i = 0, n = D.w*D.h; i < n; i++){
    D.rgba[i*4] = 255*clamp((R[i]-sr[0])/(sr[1]-sr[0]), 0, 1);
    D.rgba[i*4+1] = 255*clamp((Gg[i]-sg[0])/(sg[1]-sg[0]), 0, 1);
    D.rgba[i*4+2] = 255*clamp((B[i]-sb[0])/(sb[1]-sb[0]), 0, 1);
    D.rgba[i*4+3] = Number.isFinite(R[i]) ? 255 : 0;
  }
  D.lab = null;
}
function fromTiffDem(T, name){
  const [w, h, f] = workSize(T.width, T.height);
  const dem = resampleBand(T.bands[0], T.width, T.height, w, h);
  const D = {w, h, f, dem, bands:null, kind:"dem", geo:T.geo, name, srcW:T.width, srcH:T.height, rgba: new Uint8ClampedArray(w*h*4)};
  D.cx = T.geo.dx ? T.geo.dx*f : null; D.cy = T.geo.dy ? T.geo.dy*f : null;
  return D;
}
function hillshade(D, zf, tint){
  const {w, h, dem} = D, dx = D.cx || 1, dy = D.cy || 1;
  let mn = Infinity, mx = -Infinity; for (const v of dem) if (Number.isFinite(v)){ if (v < mn) mn = v; if (v > mx) mx = v; }
  const zen = (90-45)*Math.PI/180, azs = 315*Math.PI/180;
  const Z = (x, y) => { x = clamp(x, 0, w-1); y = clamp(y, 0, h-1); const v = dem[y*w+x]; return Number.isFinite(v) ? v*zf : NaN; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = y*w+x, z0 = Z(x, y);
    if (!Number.isFinite(z0)){ D.rgba[i*4+3] = 0; continue; }
    const g = (a, b) => { const v = Z(a, b); return Number.isFinite(v) ? v : z0; };
    const a = g(x-1,y-1), b = g(x,y-1), c = g(x+1,y-1), d = g(x-1,y), f = g(x+1,y), gg = g(x-1,y+1), hh = g(x,y+1), ii = g(x+1,y+1);
    const p = ((c+2*f+ii)-(a+2*d+gg))/(8*dx), q = ((gg+2*hh+ii)-(a+2*b+c))/(8*dy);
    const slope = Math.atan(Math.hypot(p, q)), asp = Math.atan2(-p, q);
    let hs = Math.cos(zen)*Math.cos(slope) + Math.sin(zen)*Math.sin(slope)*Math.cos(azs - asp);
    hs = clamp(hs, 0, 1);
    let r = hs*255, gC = hs*255, bC = hs*255;
    if (tint){
      const t = (z0/zf - mn)/(mx - mn || 1);
      const ramp = [[.16,.36,.27],[.55,.62,.36],[.78,.7,.47],[.66,.52,.4],[.95,.95,.95]];
      const u = t*(ramp.length-1), k = Math.min(ramp.length-2, Math.floor(u)), fr = u-k;
      const col = [0,1,2].map(j => ramp[k][j]*(1-fr) + ramp[k+1][j]*fr);
      const sh = .35 + .75*hs; r = 255*clamp(col[0]*sh, 0, 1); gC = 255*clamp(col[1]*sh, 0, 1); bC = 255*clamp(col[2]*sh, 0, 1);
    }
    D.rgba[i*4] = r; D.rgba[i*4+1] = gC; D.rgba[i*4+2] = bC; D.rgba[i*4+3] = 255;
  }
  D.lab = null;
}

function setA(D){
  G.D = D; G.w = D.w; G.h = D.h; G.DB = null; G.thrVal = undefined; G.idxCache = null; G.series = []; G.sv = null; G.tl = 0; G.chx = G.netx = G.delta = G.braid = G.field = null; if (typeof renderSeries === "function") renderSeries(); { const y = yearFrom(D.name); $("yrRef").value = y || ""; }
  G.excl = new Uint8Array(D.w*D.h); G.mask = null; G.maskV++;
  G.roi = null; G.pbox = null; G.scaleLine = null; G.outlet = null; G.head = null; G.samples = [];
  G.prep = G.chan = G.net = G.lakes = G.pattern = G.cover = G.terr = G.hydro = G.change = null;
  G.meas = []; G.cur = null; G.results = {}; G.tables = {};
  document.querySelectorAll('[id^="res-"]').forEach(e => e.innerHTML = "");
  G.pxm = null; G.pxSrc = "";
  if (D.kind === "dem"){
    if (D.cx && D.cy){ G.pxm = Math.sqrt(D.cx*D.cy); G.pxSrc = "from GeoTIFF"; }
    hillshade(D, 1, true);
    $("terrNoDem").style.display = "none"; $("terrBox").style.display = "block";
    $("cellX").value = D.cx ? +D.cx.toFixed(3) : ""; $("cellY").value = D.cy ? +D.cy.toFixed(3) : "";
    setMode("elev");
  } else {
    if (D.geo && D.geo.dx){ G.pxm = Math.sqrt(D.geo.dx*D.geo.dy)*D.f; G.pxSrc = "from GeoTIFF"; }
    $("terrNoDem").style.display = "block"; $("terrBox").style.display = "none";
    setMode(D.bands && D.bandMap.nir >= 0 ? "ndwi" : "samples");
  }
  baseCanvas.width = D.w; baseCanvas.height = D.h; ovCanvas.width = D.w; ovCanvas.height = D.h;
  paintBase();
  $("vmsg").style.display = "none"; $("vstat").style.display = "block";
  fitView(); rebuildOverlay(); updateInfo(); renderBandMap(); updateThrSlider(); updateThresholdLabels();
  toast("Loaded " + (D.name || "image") + " · " + D.w + "×" + D.h + " working pixels");
  setTool("pan");
}
function setB(D){
  if (D.w !== G.w || D.h !== G.h){
    // resample B to A's working grid
    const c = document.createElement("canvas"); c.width = D.w; c.height = D.h; c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(D.rgba), D.w, D.h), 0, 0);
    const c2 = document.createElement("canvas"); c2.width = G.w; c2.height = G.h; const x2 = c2.getContext("2d", {willReadFrequently:true}); x2.drawImage(c, 0, 0, G.w, G.h);
    const ar = (D.w/D.h)/(G.w/G.h);
    if (D.bands) D.bands = D.bands.map(b => resampleBand(b, D.w, D.h, G.w, G.h));
    D.rgba = x2.getImageData(0, 0, G.w, G.h).data; D.w = G.w; D.h = G.h; D.lab = null;
    if (Math.abs(ar - 1) > .02) toast("Warning: the later image has a different shape, so it was stretched to match", 4000);
  }
  G.DB = D;
  toast("Later image loaded. Set the years, then tap Measure change.");
}
function updateInfo(){
  const D = G.D; if (!D) return;
  const rows = [["File", D.name || "image"], ["Type", D.kind === "dem" ? "Elevation model" : D.kind === "multiband" ? D.bands.length + "-band raster" : "RGB image"],
    ["Source size", D.srcW + " × " + D.srcH], ["Working size", D.w + " × " + D.h + (D.f > 1 ? ` (÷${D.f.toFixed(2)})` : "")],
    ["Scale", G.pxm ? G.pxm.toPrecision(4) + " m/px " + G.pxSrc : "not set"],
    ["Image area", G.pxm ? U.A(D.w*D.h).s : "–"]];
  if (D.geo && D.geo.lat !== undefined && D.geo.lon != null) rows.push(["Centre", D.geo.lat.toFixed(4) + "°, " + D.geo.lon.toFixed(4) + "°"]);
  if (D.geo && D.geo.epsg) rows.push(["CRS", "EPSG:" + D.geo.epsg]);
  $("dsInfo").innerHTML = rows.map(r => `<span class="note" style="margin:0">${r[0]}</span><span>${r[1]}</span>`).join("");
  $("scaleInfo").textContent = G.pxm ? `1 px = ${G.pxm.toPrecision(4)} m (${G.pxSrc}). The view is ${U.L(G.w).s} wide.` : "";
  $("vstat").textContent = G.pxm ? G.pxm.toPrecision(3) + " m/px" : "no scale";
}
function renderBandMap(){
  const D = G.D, el = $("bandMap"); el.innerHTML = "";
  if (!D || D.kind !== "multiband") return;
  const opts = (sel, none) => (none ? `<option value="-1">none</option>` : "") + D.bands.map((_, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>band ${i+1}</option>`).join("");
  el.innerHTML = `<h4>Band mapping</h4><p class="note">Sentinel‑2 and Landsat exports order bands differently, so match them to colours here. Near-infrared enables NDWI water detection.</p>
   <div class="row"><label>Red</label><select id="bmR">${opts(D.bandMap.r)}</select><label style="width:auto">Green</label><select id="bmG">${opts(D.bandMap.g)}</select></div>
   <div class="row"><label>Blue</label><select id="bmB">${opts(D.bandMap.b)}</select><label style="width:auto">NIR</label><select id="bmN">${opts(D.bandMap.nir, true)}</select></div>`;
  ["bmR","bmG","bmB","bmN"].forEach(id => $(id).onchange = () => {
    D.bandMap = {r:+$("bmR").value, g:+$("bmG").value, b:+$("bmB").value, nir:+$("bmN").value};
    renderBands(D); paintBase(); requestDraw(); setMode($("wMode").value);
  });
}

/* ---------------- scale ---------------- */
$("btnApplyScale").onclick = () => {
  const L = parseFloat($("knownLen").value), f = +$("knownUnit").value;
  if (!G.scaleLine) return toast("Draw a line with 📏 Scale first");
  if (!(L > 0)) return toast("Enter the known length");
  const [a, b] = G.scaleLine, px = Math.hypot(b[0]-a[0], b[1]-a[1]);
  if (px < 5) return toast("Scale line is too short");
  G.pxm = L*f/px; G.pxSrc = "from your scale line"; updateInfo(); toast("Scale set: " + G.pxm.toPrecision(4) + " m/px"); updateThresholdLabels();
};
$("btnApplyPxm").onclick = () => { const v = parseFloat($("pxmIn").value); if (!(v > 0)) return toast("Enter metres per pixel"); G.pxm = v; G.pxSrc = "entered"; updateInfo(); updateThresholdLabels(); };
$("northIn").oninput = e => { G.north = parseFloat(e.target.value) || 0; };
$("btnClearRoi").onclick = () => { G.roi = null; requestDraw(); };
const AZ = (dx, dy) => (azOf(dx, dy) + G.north + 360) % 360;

/* ---------------- viewer ---------------- */
const view = $("view"), vctx = view.getContext("2d");
const baseCanvas = document.createElement("canvas"), ovCanvas = document.createElement("canvas");
function paintBase(){
  const D = (G.tl && G.series[G.tl-1]) ? G.series[G.tl-1].D : G.D; if (!D) return;
  baseCanvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(D.rgba), G.w, G.h), 0, 0);
  requestDraw();
}
function sizeView(){
  const r = view.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  view.width = Math.round(r.width*dpr); view.height = Math.round(r.height*dpr); G.dpr = dpr;
}
function fitView(){
  sizeView(); const r = view.getBoundingClientRect();
  const s = Math.min(r.width/G.w, r.height/G.h); G.view = {s, x:(r.width - G.w*s)/2, y:(r.height - G.h*s)/2}; requestDraw();
}
$("btnFit").onclick = () => G.D && fitView();
window.addEventListener("resize", () => { if (G.D){ sizeView(); requestDraw(); } });
let drawQ = false;
function requestDraw(){ if (!drawQ){ drawQ = true; requestAnimationFrame(() => { drawQ = false; draw(); }); } }
const toImg = (sx, sy) => [(sx - G.view.x)/G.view.s, (sy - G.view.y)/G.view.s];

function draw(){
  if (!G.D) return;
  const ctx = vctx, dpr = G.dpr || 1, v = G.view;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, view.width, view.height);
  ctx.setTransform(dpr*v.s, 0, 0, dpr*v.s, dpr*v.x, dpr*v.y);
  ctx.imageSmoothingEnabled = v.s < 2;
  ctx.drawImage(baseCanvas, 0, 0);
  let swipeX = null;
  if (G.sv && G.swipe !== null && G.swipe !== undefined){
    const iv = G.sv.intervals[G.sv.sel], A = G.sv.dates[iv.a], B = G.sv.dates[iv.b];
    ctx.drawImage(dateCanvas(A), 0, 0);
    swipeX = G.swipe*G.w; ctx.save(); ctx.beginPath(); ctx.rect(swipeX, 0, G.w - swipeX, G.h); ctx.clip(); ctx.drawImage(dateCanvas(B), 0, 0); ctx.restore();
  }
  if (swipeX === null || G.hl !== "compare") ctx.drawImage(ovCanvas, 0, 0);
  // vectors in screen units
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const P = (x, y) => [v.x + x*v.s, v.y + y*v.s];
  const line = (pts, col, wdt, dash) => { if (pts.length < 2) return; ctx.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); };
  const rect = (r, col) => { const a = P(r.x0, r.y0), b = P(r.x1, r.y1); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]); ctx.strokeRect(a[0], a[1], b[0]-a[0], b[1]-a[1]); ctx.setLineDash([]); };
  const dot = (x, y, col, r = 4) => { const q = P(x, y); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke(); };
  const label = (x, y, t) => { const q = P(x, y); ctx.font = "11px Space Grotesk, sans-serif"; const w = ctx.measureText(t).width; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(q[0]+6, q[1]-16, w+8, 16); ctx.fillStyle = "#fff"; ctx.fillText(t, q[0]+10, q[1]-4); };
  if (G.roi) rect(G.roi, "#ffffff");
  if (G.pbox && (G.tab === "pattern" || G.hl === "pattern")) rect(G.pbox, "#3fc1d3");
  if (G.lay.vec){
    if (G.chan){
      const c = G.chan, p = c.pts, hl = G.hl;
      if (hl === "belt" && c.bx){ const ax = []; for (let i = 0; i < c.bx.length; i += 3) ax.push([c.bx[i], c.by[i]]); line(ax, "rgba(0,0,0,.6)", 4); line(ax, "#3fc1d3", 2.2, [7,4]); }
      line(p, "rgba(0,0,0,.6)", 4.5); line(p, "#ff7a45", hl === "path" ? 4 : 2.5);
      c.infl.forEach((i, n) => { dot(p[i][0], p[i][1], "#fff", hl === "bends" ? 4.5 : 3); if (hl === "bends" && n < c.infl.length-1){ const j = c.bends[n] ? Math.round((c.bends[n].i0 + c.bends[n].i1)/2) : i; label(p[j][0], p[j][1], "" + (n+1)); } });
      if (hl === "transects" && c.transects) for (const t of c.transects) line(t, "rgba(255,255,255,.7)", 1.2);
      if (hl === "straight"){ line([p[0], p[p.length-1]], "#000", 4); line([p[0], p[p.length-1]], "#fff", 2, [8,5]); const m = [(p[0][0]+p[p.length-1][0])/2, (p[0][1]+p[p.length-1][1])/2]; label(m[0], m[1], "D = " + U.L(c.straight).s); }
      if (hl === "width"){ const st = Math.max(1, Math.floor(p.length/14)); for (let i = st; i < p.length-1; i += st){ const q = P(p[i][0], p[i][1]); ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2, c.w[i]/2*v.s), 0, 7); ctx.strokeStyle = "#e8c547"; ctx.lineWidth = 1.8; ctx.stroke(); } }
    }
    if (G.hl === "pattern" && G.pattern && G.pattern.box){
      const b = G.pattern.box, cx = (b.x0+b.x1)/2, cy = (b.y0+b.y1)/2, lam = G.pattern.spacing, th = (G.pattern.crest - G.north)*Math.PI/180;
      const dx = Math.sin(th), dy = -Math.cos(th), nx = -dy, ny = dx, half = Math.max(b.x1-b.x0, b.y1-b.y0)/2;
      rect(b, "#3fc1d3");
      for (let k = -6; k <= 6; k++){ const ox = cx + nx*k*lam, oy = cy + ny*k*lam; line([[ox-dx*half*.6, oy-dy*half*.6], [ox+dx*half*.6, oy+dy*half*.6]], k ? "rgba(255,154,92,.9)" : "#fff", k ? 1.6 : 2.4); }
      label(cx, cy, "λ = " + U.L(lam).s);
    }
    if (G.hl === "roi"){ const r = roiOrFull(); rect(r, "#fff"); }
    if (G.hl === "necks" && G.chx) G.chx.necks.forEach((nk, i) => { const col = nk.cls === "critical" ? "#ff4d5e" : nk.cls === "narrow" ? "#ffb347" : "#e8c547"; line([nk.a, nk.b], "#000", 5); line([nk.a, nk.b], col, 3); if (i < 12) label((nk.a[0]+nk.b[0])/2, (nk.a[1]+nk.b[1])/2, "neck " + (i+1)); });
    if (G.hl === "oxbows" && G.chx) G.chx.oxbows.forEach((o, i) => { const q = P(o.c[0], o.c[1]); ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(9, Math.sqrt(o.area)*v.s*.9), 0, 7); ctx.strokeStyle = "#c86bff"; ctx.lineWidth = 2.5; ctx.stroke(); if (i < 10) label(o.c[0], o.c[1], "oxbow " + (i+1)); });
    if (G.hl === "localsin" && G.chx && G.chan){ const p = G.chan.pts, loc = G.chx.loc; let mx = -1e9, mn = 1e9; loc.forEach(x => { if (x > mx) mx = x; if (x < mn) mn = x; }); for (let i = 2; i < p.length; i += 2){ const t = (loc[i]-mn)/((mx-mn) || 1); line([p[i-2], p[i]], `hsl(${(1-t)*220},90%,55%)`, 5); } label(p[G.chx.iMax][0], p[G.chx.iMax][1], "most sinuous"); }
    if (G.hl === "junctions" && G.netx) G.netx.angles.forEach(a => { const q = P(a.x, a.y); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.fillStyle = `hsl(${clamp(a.ang, 20, 120)*2},85%,55%)`; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke(); });
    if (G.hl === "delta" && G.delta){ const d = G.delta; d.mouths.forEach(m => line([d.apex, m], "rgba(255,255,255,.4)", 1)); if (d.hull.length > 2) line(d.hull.concat([d.hull[0]]), "#ffd27a", 2, [6,4]); d.mouths.forEach(m => dot(m[0], m[1], "#3fc1d3", 5)); dot(d.apex[0], d.apex[1], "#ff4d5e", 8); label(d.apex[0], d.apex[1], "apex"); }
    if (G.hl === "field" && G.field) G.field.tiles.forEach(t => { const th = (t.crest - G.north)*Math.PI/180, L = Math.min(G.field.T*.45, t.spacing*2.5), dx = Math.sin(th)*L, dy = -Math.cos(th)*L, a = clamp((t.prom-3)/12, .15, 1); line([[t.cx-dx, t.cy-dy], [t.cx+dx, t.cy+dy]], "#000", 4.5); line([[t.cx-dx, t.cy-dy], [t.cx+dx, t.cy+dy]], `rgba(255,154,92,${a})`, 3); });
    if (G.sv && G.hl === "compare"){
      const iv = G.sv.intervals[G.sv.sel]; if (iv){ const A = iv.pathFrom || G.sv.dates[iv.a], B = G.sv.dates[iv.b];
        if (G.sv.mode === "river"){
          if (A.path) { const pp = A.path.pts.filter((_, k) => k % 2 === 0); line(pp, "rgba(0,0,0,.7)", 4); line(pp, "#3d8bff", 2.4); }
          if (B.path) { const pp = B.path.pts.filter((_, k) => k % 2 === 0); line(pp, "rgba(0,0,0,.7)", 4); line(pp, "#ffd23f", 2.4); } }
        (iv.events || []).forEach((e, k) => { const q = P(e.cx, e.cy); ctx.beginPath(); ctx.arc(q[0], q[1], 12, 0, 7); ctx.fillStyle = e.type === "land" ? "#1f8f4a" : "#c22b3b"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.font = "bold 10px Space Grotesk, sans-serif"; ctx.textAlign = "center"; ctx.fillText("E" + (k+1), q[0], q[1]+3.5); ctx.textAlign = "left"; });
        (iv.cutoffs || []).forEach(c => { dot(c.mid[0], c.mid[1], "#ff4d5e", 7); label(c.mid[0], c.mid[1], "cutoff"); });
        if (G.sv.mode === "river") (iv.reroutes || []).forEach((hh, k) => { const q = P(hh.p[0], hh.p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 13, 0, 7); ctx.fillStyle = "#ff4d5e"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.font = "bold 11px Space Grotesk, sans-serif"; ctx.textAlign = "center"; ctx.fillText("C" + (k+1), q[0], q[1]+4); ctx.textAlign = "left"; });
        if (G.sv.mode === "river") (iv.hot || []).forEach((hh, k) => { const q = P(hh.p[0], hh.p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 13, 0, 7); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "bold 11px Space Grotesk, sans-serif"; ctx.textAlign = "center"; ctx.fillText(k+1, q[0], q[1]+4); ctx.textAlign = "left"; });
        if (swipeX !== null){ const lab = d => String(d.year ?? d.name.slice(0, 8)), sx2 = P(swipeX, 0)[0], r = view.getBoundingClientRect();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx2, 0); ctx.lineTo(sx2, r.height); ctx.stroke();
          ctx.font = "bold 12px Space Grotesk, sans-serif"; const tA = "◀ " + lab(G.sv.dates[iv.a]), tB = lab(G.sv.dates[iv.b]) + " ▶";
          ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(sx2 - ctx.measureText(tA).width - 14, r.height - 52, ctx.measureText(tA).width + 10, 20); ctx.fillRect(sx2 + 4, r.height - 52, ctx.measureText(tB).width + 10, 20);
          ctx.fillStyle = "#fff"; ctx.fillText(tA, sx2 - ctx.measureText(tA).width - 9, r.height - 38); ctx.fillText(tB, sx2 + 9, r.height - 38); } }
    }
    if (G.sv && (G.hl === "dates" || G.hl === "migration")){
      const ds = G.sv.dates, nD = ds.length;
      ds.forEach((d, i) => { if (!d.path) return; const t = nD > 1 ? i/(nD-1) : 1; line(d.path.pts.filter((_, k) => k % 2 === 0), `hsl(${220 - t*200},90%,${50 + t*10}%)`, G.hl === "dates" ? 2.4 : 1.4); });
      if (G.hl === "migration"){ const iv = G.sv.intervals[G.sv.sel], X = +$("arrowX").value;
        if (iv && iv.vecs) iv.vecs.forEach(m => { const a = m.p, b = [a[0] + m.v[0]*X, a[1] + m.v[1]*X]; line([a, b], "#000", 3.5); line([a, b], "#fff", 1.6); dot(b[0], b[1], "#fff", 1.8); });
        if (iv && iv.cutoffs) iv.cutoffs.forEach(c => { dot(c.mid[0], c.mid[1], "#ff4d5e", 7); label(c.mid[0], c.mid[1], "cutoff"); }); }
    }
    if (G.rivers && !(G.sv && ["compare","migration","dates"].includes(G.hl))) drawRiversLab(ctx, P); else if (G.channelSet && !(G.sv && ["compare","migration","dates"].includes(G.hl))) drawChannelSetLab(ctx, P);
    if (G.branches && G.chan && (!G.rivers || ["branches", "chanset"].includes(G.hl)) && !(G.sv && ["compare","migration","dates"].includes(G.hl))) drawBranchesLab(ctx, P, v);
    if (G.hydro && G.hydro.stem) { line(G.hydro.stem, "rgba(0,0,0,.6)", 4.5); line(G.hydro.stem, "#ff7a45", 2.5); }
    if (G.lakes && G.lakes.axes && (G.tab === "lakes" || G.hl === "lakes")) for (const a of G.lakes.axes) line(a, "rgba(255,255,255,.75)", 1);
    for (const m of G.meas.concat(G.cur ? [G.cur] : [])){
      const pts = m.type === "poly" && m !== G.cur ? m.pts.concat([m.pts[0]]) : m.pts;
      line(pts, "#000", 4); line(pts, m === G.cur ? "#ffe066" : "#e8c547", 2);
      m.pts.forEach(p => dot(p[0], p[1], "#e8c547", 2.5));
      if (m.label) label(m.pts[m.pts.length-1][0], m.pts[m.pts.length-1][1], m.label);
    }
  }
  if (G.scaleLine){ line(G.scaleLine, "#000", 4); line(G.scaleLine, "#fff", 2); const b = G.scaleLine[1]; label(b[0], b[1], U.L(Math.hypot(G.scaleLine[1][0]-G.scaleLine[0][0], G.scaleLine[1][1]-G.scaleLine[0][1])).s); }
  if (G.outlet){ dot(G.outlet[0], G.outlet[1], "#ff4d5e", 6); label(G.outlet[0], G.outlet[1], "outlet"); }
  if (G.head){ dot(G.head[0], G.head[1], "#5bd17a", 6); label(G.head[0], G.head[1], "head"); }
  if (G.tool === "erase" && G.brushPos){ const q = P(G.brushPos[0], G.brushPos[1]); ctx.beginPath(); ctx.arc(q[0], q[1], +$("brush").value, 0, 7); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke(); }
  // legend for channel classes / change
  { const items = [];
    const rivMode = G.rivers && G.rivers.length && !["branches", "necks", "oxbows", "network", "delta", "bends"].includes(G.hl) && !(G.sv && ["compare","migration","dates"].includes(G.hl));
    if (rivMode){ const maj = G.rivers.filter(r => r.major).slice(0, 7); for (const r of maj) items.push([exColor(r.id), `${G.chNames[r.id] || r.id} (${U.L(r.len).s})`]); const n = G.rivers.length - maj.length; if (n > 0) items.push(["rgba(160,220,255,.8)", `${n} smaller river${n > 1 ? "s" : ""} (tap one to see it)`]); }
    else if (G.lay.chans && G.chanCls && G.chanStats && !(G.sv && ["compare","migration","dates"].includes(G.hl))){ const st = G.chanStats;
      items.push(["#ff7a45", `${G.seafloor ? "Main channel" : "Main river"} (${U.L(st.main).s})`]);
      if (G.branches){ const B = G.branches; if (B.tribs.length) items.push([BR_COL.trib, `Tributary junctions T (${B.tribs.length})`]); if (B.dists.length) items.push([BR_COL.dist, `Distributary junctions D (${B.dists.length})`]); if (B.sides.length) items.push([BR_COL.side, `Side channels S (${B.sides.length})`]); }
      if (st.other) items.push(["#3fc1d3", `Tributaries & side channels (${U.L(st.other).s})`]);
      if (G.channelSet){ const n = G.channelSet.list.filter(c => !c.main).length; if (n) items.push(["#78dcff", `Separate channels C (${n})`]); } else if (st.sep) items.push(["#78dcff", `Separate channels (${st.nSep})`]);
      if (st.ox) items.push(["#c86bff", `Oxbows / abandoned (${st.nOx})`]); }
    if (G.sv && G.lay.change && (G.tab === "change" || G.hl === "migration" || G.hl === "dates")){ const iv = G.sv.intervals[G.sv.sel], lab = d => d.year ?? d.name.slice(0, 8);
      if (iv){ const A = G.sv.dates[iv.a], B = G.sv.dates[iv.b];
        const kind = G.sv.mode === "river" ? "river centreline" : "shoreline";
        items.push(["#3d8bff", `${lab(G.sv.mode === "river" ? (iv.pathFrom || A) : A)} ${kind}`], ["#ffd23f", `${lab(B)} ${kind}`], ["#4cd17a", "New land"], ["#ff4d5e", "New water"]); } }
    if (items.length){ const r = view.getBoundingClientRect(); ctx.font = "11px Space Grotesk, sans-serif"; const wd = Math.max(...items.map(t => ctx.measureText(t[1]).width)) + 26, ht = items.length*16 + 8;
      ctx.fillStyle = "rgba(0,0,0,.66)"; ctx.fillRect(8, 8, wd, ht);
      items.forEach((t, k) => { ctx.fillStyle = t[0]; ctx.fillRect(14, 14 + k*16, 10, 10); ctx.fillStyle = "#fff"; ctx.fillText(t[1], 30, 23 + k*16); }); } }
  // scale bar
  if (G.pxm){
    const targetPx = 90, m = targetPx/v.s*G.pxm, p10 = Math.pow(10, Math.floor(Math.log10(m))), nice = [1,2,5,10].map(k => k*p10).filter(k => k <= m).pop() || p10;
    const wpx = nice/G.pxm*v.s, r = view.getBoundingClientRect();
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(8, r.height-28, wpx+16, 20);
    ctx.fillStyle = "#fff"; ctx.fillRect(16, r.height-14, wpx, 3);
    ctx.font = "10px JetBrains Mono, monospace"; ctx.fillText(nice >= 1000 ? (nice/1000) + " km" : nice + " m", 16, r.height-17);
  }
}

/* pointer handling */
const ptr = new Map(); let gest = null;
view.addEventListener("pointerdown", e => {
  if (!G.D) return;
  view.setPointerCapture(e.pointerId); ptr.set(e.pointerId, {x:e.offsetX, y:e.offsetY});
  const pts = [...ptr.values()];
  if (pts.length === 2){ cancelToolDrag(); gest = {type:"pinch", p0:pts.map(p => ({...p})), v0:{...G.view}}; return; }
  const [ix, iy] = toImg(e.offsetX, e.offsetY);
  gest = {type:"one", sx:e.offsetX, sy:e.offsetY, ix, iy, v0:{...G.view}, moved:false};
  if (G.tool === "erase"){ G.excl0 = true; paintErase(ix, iy); }
});
view.addEventListener("pointermove", e => {
  if (!G.D) return;
  const [ix, iy] = toImg(e.offsetX, e.offsetY);
  if (G.tool === "erase"){ G.brushPos = [ix, iy]; requestDraw(); }
  if (!ptr.has(e.pointerId)) return;
  ptr.set(e.pointerId, {x:e.offsetX, y:e.offsetY});
  const pts = [...ptr.values()];
  if (gest && gest.type === "pinch" && pts.length >= 2){
    const [a0, b0] = gest.p0, [a1, b1] = pts;
    const d0 = Math.hypot(a0.x-b0.x, a0.y-b0.y), d1 = Math.hypot(a1.x-b1.x, a1.y-b1.y);
    const s = clamp(gest.v0.s*d1/d0, .05, 80);
    const c0 = [(a0.x+b0.x)/2, (a0.y+b0.y)/2], c1 = [(a1.x+b1.x)/2, (a1.y+b1.y)/2];
    const ix0 = (c0[0]-gest.v0.x)/gest.v0.s, iy0 = (c0[1]-gest.v0.y)/gest.v0.s;
    G.view = {s, x:c1[0]-ix0*s, y:c1[1]-iy0*s}; requestDraw(); return;
  }
  if (!gest || gest.type !== "one") return;
  if (Math.hypot(e.offsetX-gest.sx, e.offsetY-gest.sy) > 6) gest.moved = true;
  const t = G.tool;
  if (t === "pan" || ["sample","outlet","head","line","poly"].includes(t)){
    if (gest.moved){ G.view = {...gest.v0, x:gest.v0.x + e.offsetX - gest.sx, y:gest.v0.y + e.offsetY - gest.sy}; requestDraw(); }
  } else if (t === "scale"){ G.scaleLine = [[gest.ix, gest.iy], [ix, iy]]; requestDraw(); }
  else if (t === "roi" || t === "pbox"){
    const r = {x0:Math.round(clamp(Math.min(gest.ix, ix), 0, G.w)), y0:Math.round(clamp(Math.min(gest.iy, iy), 0, G.h)), x1:Math.round(clamp(Math.max(gest.ix, ix), 0, G.w)), y1:Math.round(clamp(Math.max(gest.iy, iy), 0, G.h))};
    G[t] = r; requestDraw();
  } else if (t === "erase"){ paintErase(ix, iy); }
});
const endPtr = e => {
  if (!ptr.has(e.pointerId)) return;
  ptr.delete(e.pointerId);
  if (gest && gest.type === "one" && !gest.moved){ const [ix, iy] = toImg(e.offsetX, e.offsetY); tapAt(ix, iy); }
  if (gest && gest.type === "one" && G.tool === "erase"){ rebuildOverlay(); if (G.mask) scheduleWater(); }
  if (gest && (gest.type === "one") && (G.tool === "roi" || G.tool === "pbox")){
    const r = G[G.tool]; if (r && (r.x1 - r.x0 < 8 || r.y1 - r.y0 < 8)) G[G.tool] = null; requestDraw();
    if (G.tool === "roi" && G.mask) scheduleWater();
  }
  if (ptr.size === 0) gest = null;
  else if (ptr.size === 1){ const p = [...ptr.values()][0]; const [ix, iy] = toImg(p.x, p.y); gest = {type:"one", sx:p.x, sy:p.y, ix, iy, v0:{...G.view}, moved:true}; }
};
view.addEventListener("pointerup", endPtr); view.addEventListener("pointercancel", endPtr);
view.addEventListener("pointerleave", () => { G.brushPos = null; requestDraw(); });
view.addEventListener("wheel", e => {
  if (!G.D) return; e.preventDefault();
  const k = Math.exp(-e.deltaY*.0015), s = clamp(G.view.s*k, .05, 80);
  const [ix, iy] = toImg(e.offsetX, e.offsetY);
  G.view = {s, x:e.offsetX - ix*s, y:e.offsetY - iy*s}; requestDraw();
}, {passive:false});
function cancelToolDrag(){}
function tapAt(ix, iy){
  if (ix < 0 || iy < 0 || ix >= G.w || iy >= G.h) return;
  const t = G.tool;
  if (t === "sample"){
    const lab = sampleLab(G.D, ix, iy); G.samples.push(lab);
    $("wSampN").textContent = G.samples.length + " sample" + (G.samples.length === 1 ? "" : "s");
    if ($("wMode").value === "samples") scheduleWater(true);
  } else if (t === "pan"){ if (G.rivers) riverTap(ix, iy); }
  else if (t === "outlet"){ G.outlet = [ix, iy]; requestDraw(); toast("Outlet set"); setTool("pan"); }
  else if (t === "head"){ G.head = [ix, iy]; requestDraw(); toast("Head set"); setTool("pan"); }
  else if (t === "line" || t === "poly"){
    if (!G.cur || G.cur.type !== t) G.cur = {type:t, pts:[]};
    G.cur.pts.push([ix, iy]); updateCurLabel(); requestDraw();
  }
}
function paintErase(ix, iy){
  const r = +$("brush").value/G.view.s, restore = $("brushRestore").checked;
  const x0 = Math.max(0, Math.floor(ix-r)), x1 = Math.min(G.w-1, Math.ceil(ix+r)), y0 = Math.max(0, Math.floor(iy-r)), y1 = Math.min(G.h-1, Math.ceil(iy+r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x-ix)**2 + (y-iy)**2 <= r*r) G.excl[y*G.w+x] = restore ? 0 : 1;
  clearTimeout(paintErase.t); paintErase.t = setTimeout(rebuildOverlay, 60);
}
$("btnClearErase").onclick = () => { G.excl.fill(0); rebuildOverlay(); if (G.mask) scheduleWater(); };
bindRange("brush", v => v + " px");

/* ---------------- overlay composition ---------------- */
const ORDER_COL = ["#9ecae1","#4fb3d9","#2b8cbe","#e8c547","#ff7a45","#ff4d5e","#c2185b","#7b1fa2","#ffffff"];
const hexRGB = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
function rebuildOverlay(){
  if (!G.D) return; setTimeout(labChanged, 0);
  const cmpMode = G.sv && ["compare","migration","dates"].includes(G.hl);
  const hlLay = {mask:"mask", lakes:"lakes", network:"net", basin:"basin", streams:"streams", change:"change"}[G.hl];
  if (hlLay && !G.lay[hlLay]){ G.lay[hlLay] = true; const b = document.querySelector('.lay[data-k="' + hlLay + '"]'); if (b) b.classList.add("on"); }
  const w = G.w, h = G.h, N = w*h, id = new ImageData(w, h), d = id.data;
  const put = (i, r, g, b, a) => { const j = i*4, ao = d[j+3]/255, an = a + ao*(1-a); if (an <= 0) return; d[j] = (r*a + d[j]*ao*(1-a))/an; d[j+1] = (g*a + d[j+1]*ao*(1-a))/an; d[j+2] = (b*a + d[j+2]*ao*(1-a))/an; d[j+3] = an*255; };
  if (G.lay.cover && G.cover){ const {cls, cols} = G.cover; for (let i = 0; i < N; i++) if (cls[i] >= 0){ const c = cols[cls[i]]; put(i, c[0], c[1], c[2], .6); } }
  if (!cmpMode && G.lay.mask && G.mask) for (let i = 0; i < N; i++) if (G.mask[i]) put(i, 40, 140, 255, .42);
  if (G.lay.basin && G.hydro && G.hydro.basin) for (let i = 0; i < N; i++) if (G.hydro.basin[i]) put(i, 255, 214, 102, .14);
  if (!cmpMode && G.lay.lakes && G.lakes && G.lakes.Lmask) for (let i = 0; i < N; i++) if (G.lakes.Lmask[i]) put(i, 220, 70, 220, .55);
  if (G.lay.change && (G.sv || G.change) && (!G.sv || ["compare","migration","dates"].includes(G.hl) || G.tab === "change")){ const c = G.sv && G.sv.intervals[G.sv.sel] ? G.sv.intervals[G.sv.sel].map : G.change.map; for (let i = 0; i < N; i++){ if (c[i] === 1) put(i, 255, 60, 60, .55); else if (c[i] === 2) put(i, 80, 220, 120, .55); } }
  if (G.lay.streams && G.hydro && G.hydro.ord){ const o = G.hydro.ord; for (let i = 0; i < N; i++) if (o[i]){ const c = hexRGB(ORDER_COL[Math.min(o[i]-1, 8)]); put(i, c[0], c[1], c[2], 1); } }
  if (!cmpMode && G.lay.net && G.prep && G.prep.sk){
    const ord = G.net && G.net.pixOrder;
    const s = G.prep.sk;
    for (let i = 0; i < N; i++) if (s[i]){ const c = ord && ord[i] ? hexRGB(ORDER_COL[Math.min(ord[i]-1, 8)]) : [255, 230, 0]; put(i, c[0], c[1], c[2], 1); }
  }
  if (!cmpMode && G.lay.chans && G.chanCls){
    const cc = G.chanCls, col = {2:[63,193,211], 3:[200,107,255], 4:[255,77,126], 5:[120,220,255]};
    for (let i = 0; i < N; i++) if (cc[i] && cc[i] !== 1){ const c = col[cc[i]]; put(i, c[0], c[1], c[2], 1); }
  }
  if (G.hl === "braid" && G.braid){ const {plain, bars} = G.braid; for (let i = 0; i < N; i++){ if (bars[i]) put(i, 255, 210, 80, .65); else if (plain[i]) put(i, 90, 220, 120, .16); } }
  if (G.sv && G.sv.mode === "shore" && G.hl === "compare"){ const iv = G.sv.intervals[G.sv.sel]; if (iv && iv.shore){ const eA = dilate(iv.shore.edgeA, w, h, 1), eB = dilate(iv.shore.edgeB, w, h, 1);
    for (let i = 0; i < N; i++){ if (eA[i]) put(i, 61, 139, 255, 1); if (eB[i]) put(i, 255, 210, 63, .95); } } }
  if (G.lay.excl && G.excl) for (let i = 0; i < N; i++) if (G.excl[i]) put(i, 120, 120, 120, .6);
  ovCanvas.getContext("2d").putImageData(id, 0, 0);
  requestDraw();
}

/* ---------------- water classification ---------------- */
const MODES = [
  ["clusters","Automatic colour clusters"],
  ["samples","Tap-sampled colour"],
  ["silt","Pale, low-saturation (silty water)"],
  ["bright","Brightness"],
  ["dark","Darkness (clear or deep water)"],
  ["blue","Blueness"],
  ["green","Greenness (vegetation)"],
  ["ndwi","NDWI: green vs near-infrared"],
  ["elev","Elevation ≤ level (flooding / sea level)"],
];
MODES.forEach(([k, n]) => { const o = document.createElement("option"); o.value = k; o.textContent = n; $("wMode").appendChild(o); });
function setMode(k){
  const D = G.D;
  if (k === "ndwi" && !(D && D.bands && D.bandMap.nir >= 0)) k = "samples";
  if (k === "elev" && !(D && D.dem)) k = "samples";
  if (k === "clusters" && !G.autoC) k = "samples";
  [...$("wMode").options].forEach(o => o.disabled = (o.value === "ndwi" && !(D && D.bands && D.bandMap.nir >= 0)) || (o.value === "elev" && !(D && D.dem)) || (o.value === "clusters" && !G.autoC));
  $("wMode").value = k;
  $("wSampleBox").style.display = k === "samples" ? "block" : "none";
  $("wThrBox").style.display = k === "samples" || k === "clusters" ? "none" : "block";
  G.idxCache = null; updateThrSlider();
}
$("wMode").onchange = () => { setMode($("wMode").value); if (G.mask) scheduleWater(); };
function ensureLab(D){
  if (D.lab) return D.lab;
  const N = D.w*D.h, L = new Float32Array(N*3), c = D.rgba;
  const lut = new Float32Array(256); for (let i = 0; i < 256; i++){ const v = i/255; lut[i] = v > .04045 ? Math.pow((v+.055)/1.055, 2.4) : v/12.92; }
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787*t + 16/116;
  for (let i = 0; i < N; i++){
    const r = lut[c[i*4]], g = lut[c[i*4+1]], b = lut[c[i*4+2]];
    const x = f((r*.4124 + g*.3576 + b*.1805)/.95047), y = f(r*.2126 + g*.7152 + b*.0722), z = f((r*.0193 + g*.1192 + b*.9505)/1.08883);
    L[i*3] = 116*y - 16; L[i*3+1] = 500*(x-y); L[i*3+2] = 200*(y-z);
  }
  return D.lab = L;
}
function sampleLab(D, x, y){
  const L = ensureLab(D); let a = 0, b = 0, c = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++){
    const xx = Math.round(x)+dx, yy = Math.round(y)+dy; if (xx < 0 || yy < 0 || xx >= D.w || yy >= D.h) continue;
    const i = yy*D.w + xx; a += L[i*3]; b += L[i*3+1]; c += L[i*3+2]; n++;
  }
  return [a/n, b/n, c/n];
}
function computeIndex(D, mode){
  const N = D.w*D.h, o = new Float32Array(N), c = D.rgba;
  if (mode === "ndwi"){ const g = D.bands[D.bandMap.g], n = D.bands[D.bandMap.nir]; for (let i = 0; i < N; i++) o[i] = (g[i]-n[i])/(g[i]+n[i]); return o; }
  if (mode === "elev"){ for (let i = 0; i < N; i++) o[i] = D.dem[i]; return o; }
  for (let i = 0; i < N; i++){
    const r = c[i*4]/255, g = c[i*4+1]/255, b = c[i*4+2]/255, mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    const L = .2126*r + .7152*g + .0722*b, S = mx ? (mx-mn)/mx : 0;
    o[i] = mode === "bright" ? L : mode === "dark" ? 1-L : mode === "blue" ? (b-r)/(b+r+.02) : mode === "green" ? (2*g-r-b)/(r+g+b+.02) : mx*(1-S)*(1-S);
    if (!c[i*4+3]) o[i] = NaN;
  }
  return o;
}
function idxRange(idx){ const s = []; for (let i = 0; i < idx.length; i += Math.max(1, (idx.length/50000)|0)) if (Number.isFinite(idx[i])) s.push(idx[i]); return [quantile(s, .001), quantile(s, .999)]; }
function updateThrSlider(){
  const D = G.D, k = $("wMode").value; if (!D || k === "samples") return;
  const idx = getIdx(D, k), [a, b] = idxRange(idx); G.idxRng = [a, b];
  if (G.thrVal === undefined || G.thrMode !== k){ G.thrVal = otsu(idx, roiMask()); G.thrMode = k; $("wInv").checked = k === "elev"; }
  $("wThr").value = Math.round(clamp((G.thrVal - a)/(b - a || 1), 0, 1)*1000);
  $("wThrO").textContent = fmtThr(G.thrVal);
}
const fmtThr = v => $("wMode").value === "elev" ? fx(v, 1) + " m" : fx(v, 3);
function getIdx(D, k){ if (D === G.D && G.idxCache && G.idxCache.k === k) return G.idxCache.idx; const idx = computeIndex(D, k); if (D === G.D) G.idxCache = {k, idx}; return idx; }
$("wThr").oninput = () => { const [a, b] = G.idxRng || [0, 1]; G.thrVal = a + (b-a)*$("wThr").value/1000; $("wThrO").textContent = fmtThr(G.thrVal); scheduleWater(true); };
$("btnOtsu").onclick = () => { if (!G.D) return; G.thrVal = otsu(getIdx(G.D, $("wMode").value), roiMask()); updateThrSlider(); scheduleWater(); };
$("wInv").onchange = () => scheduleWater();
bindRange("wTol", v => v, () => G.samples.length && scheduleWater(true));
bindRange("wSmooth", v => v + " px", () => G.mask && scheduleWater(true));
bindRange("wHyst", v => (v/100).toFixed(2), () => G.mask && scheduleWater(true));
bindRange("wBridge", v => v ? v + " px" : "off", () => G.mask && scheduleWater(true));
$("wRidge").onchange = () => G.mask && scheduleWater(true);
bindRange("wMin", () => "", () => { updateThresholdLabels(); G.mask && scheduleWater(true); });
bindRange("wHole", () => "", () => { updateThresholdLabels(); G.mask && scheduleWater(true); });
bindRange("lkMin", () => "", () => updateThresholdLabels());
function updateThresholdLabels(){
  $("wMinO").textContent = U.A(+$("wMin").value).s; $("wHoleO").textContent = U.A(+$("wHole").value).s; $("lkMinO").textContent = U.A(+$("lkMin").value).s;
  if ($("thrA")) updateThrA();
}
$("btnClearSamp").onclick = () => { G.samples = []; $("wSampN").textContent = "0 samples"; };
$("btnWater").onclick = () => runWater();
let waterT = 0;
function scheduleWater(fast){ clearTimeout(waterT); waterT = setTimeout(() => runWater(true), fast ? 250 : 50); }

/** soft water probability P (0..1, 0.5 = class boundary) for the current method */
function waterProb(D, opts = {}){
  const w = D.w, h = D.h, N = w*h, mode = opts.mode || $("wMode").value, P = new Float32Array(N);
  if (mode === "clusters"){
    const model = opts.model || G.autoC; if (!model) throw new Error("Run automatic water detection first");
    const L = ensureLab(D), {C, water} = model, K = water.length;
    for (let i = 0; i < N; i++){
      const l = L[i*3], a = L[i*3+1], b = L[i*3+2]; let dw = Infinity, dl = Infinity;
      for (let c = 0; c < K; c++){ const d = (l-C[c*3])**2*.5 + (a-C[c*3+1])**2 + (b-C[c*3+2])**2; if (water[c]){ if (d < dw) dw = d; } else if (d < dl) dl = d; }
      const sw = Math.sqrt(dw), sl = Math.sqrt(dl); P[i] = sl/(sw + sl + 1e-9);
    }
  } else if (mode === "samples"){
    const S = opts.samples || G.samples; if (!S.length) throw new Error("Tap the water with 💧 Sample first");
    const L = ensureLab(D), tol = +$("wTol").value;
    for (let i = 0; i < N; i++){
      const l = L[i*3], a = L[i*3+1], b = L[i*3+2]; let dm = Infinity;
      for (let k = 0; k < S.length; k++){ const d = (l-S[k][0])**2*.5 + (a-S[k][1])**2 + (b-S[k][2])**2; if (d < dm) dm = d; }
      P[i] = tol/(tol + Math.sqrt(dm));
    }
  } else {
    const idx = D === G.D ? getIdx(D, mode) : computeIndex(D, mode);
    let thr = G.thrVal; if (opts.autoThr) thr = otsu(idx, roiMask());
    const inv = $("wInv").checked, rg = G.idxRng ? (G.idxRng[1] - G.idxRng[0]) || 1 : 1, sc = rg*.05;
    for (let i = 0; i < N; i++){ const v = idx[i]; P[i] = Number.isFinite(v) ? 1/(1 + Math.exp(-(inv ? thr - v : v - thr)/sc)) : 0; }
  }
  return P;
}
/** hysteresis + thin-channel ridge boost: strong pixels seed, weak pixels connected to them are kept */
function hysteresis(P, w, h, hyst, ridge){
  const N = w*h, weak = new Uint8Array(N), rid = new Uint8Array(N), out = new Uint8Array(N), depth = new Uint8Array(N).fill(255), st = new Int32Array(N); let sp = 0;
  const lo = .5 - hyst;
  for (let i = 0; i < N; i++){ if (P[i] > lo) weak[i] = 1; if (P[i] > .5){ out[i] = 1; depth[i] = 0; st[sp++] = i; } }
  if (ridge){
    // Hessian of the smoothed probability: bright, line-like structures (narrow channels) count as weak water
    const S = boxBlurF(boxBlurF(P, w, h, 1), w, h, 1);
    for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++){
      const i = y*w+x;
      const xx = S[i+1] - 2*S[i] + S[i-1], yy = S[i+w] - 2*S[i] + S[i-w], xy = (S[i+w+1] - S[i+w-1] - S[i-w+1] + S[i-w-1])/4;
      const tr = (xx+yy)/2, d = Math.sqrt(((xx-yy)/2)**2 + xy*xy), l1 = tr - d, l2 = tr + d;
      if (l1 < -.035 && Math.abs(l1) > 2.5*Math.abs(l2) && P[i] > .3){ weak[i] = 1; rid[i] = 1; }
    }
  }
  // grow from strong pixels into weak ones, but only 2 px beyond the strong core unless the path follows a line-like ridge
  while (sp){
    const p = st[--sp], x = p % w, y = (p/w)|0;
    for (let k = 0; k < 8; k++){
      const nx = x + NB8[k][0], ny = y + NB8[k][1]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny*w+nx; if (!weak[q]) continue;
      const dq = rid[q] ? 0 : depth[p] + 1; if (dq > 2 || dq >= depth[q]) continue;
      depth[q] = dq; out[q] = 1; st[sp++] = q;
    }
  }
  return out;
}
/** join channel fragments split by bridges, shadows, cloud or labels: from each channel end, search the cheapest
    short path through water-like pixels (cost rises as water probability falls) to another water body */
function bridgeGaps(m, w, h, maxGap, P){
  if (!(maxGap > 0)) return {m, n:0};
  const {L, comps} = label(m, w, h), sk = thin(m, w, h), hw = edtTo(notMask(m), w, h), out = new Uint8Array(m);
  const compA = {}; comps.forEach(c => compA[c.id] = c.area);
  const LM = G.labelMask; let n = 0;
  const R0 = Math.round(maxGap), side = 2*(R0+30)+1, dist = new Float64Array(side*side), prev = new Int32Array(side*side), hp = new Heap(256);
  for (let p = 0; p < sk.length; p++){
    if (!sk[p] || nbCount(sk, w, h, p) !== 1 || (compA[L[p]] || 0) < 30) continue;
    const px = p % w, py = (p/w)|0, own = L[p], R = R0 + (LM && LM[p] ? 30 : 0), S = 2*R+1;
    dist.fill(Infinity, 0, S*S); hp.n = 0; const c0 = R*S + R; dist[c0] = 0; prev[c0] = -1; hp.push(0, c0);
    let hit = -1, hitCost = 0;
    while (hp.n){
      const k = hp.pop(), d = hp.topKey; if (d > dist[k]) continue;
      const lx = k % S, ly = (k/S)|0, gx = px + lx - R, gy = py + ly - R, gi = gy*w + gx;
      if (k !== c0 && m[gi] && L[gi] !== own && (compA[L[gi]] || 0) >= 30){ hit = k; hitCost = d; break; }
      if (k !== c0 && m[gi] && L[gi] === own) continue; // don't wander back through our own body
      for (const [dx, dy] of NB8){
        const nx = lx+dx, ny = ly+dy; if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const qx = gx+dx, qy = gy+dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const qi = qy*w+qx, pr = P ? P[qi] : (m[qi] ? 1 : .3), lab = LM && LM[qi];
        const st = (dx && dy ? SQ2 : 1)*(1 + 4*(1 - (lab ? Math.max(pr, .45) : pr)));
        const nk = ny*S + nx, nd = d + st; if (nd < dist[nk] && nd < 3.2*R){ dist[nk] = nd; prev[nk] = k; hp.push(nd, nk); }
      }
    }
    if (hit < 0) continue;
    const r = Math.max(1, Math.round(hw[p]));
    for (let k = hit; k >= 0; k = prev[k]){ const gx = px + (k % S) - R, gy = py + ((k/S)|0) - R;
      for (let yy = gy-r+1; yy <= gy+r-1; yy++) for (let xx = gx-r+1; xx <= gx+r-1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy*w+xx] = 1; }
    n++;
  }
  return {m: out, n};
}
/** grow the main water body: cost-distance search through water-like pixels absorbs nearby fragments (several rounds) */
function connectToMain(m, w, h, P, budget){
  const N = w*h, out = new Uint8Array(m); let joined = 0;
  // only join channel ENDS to channel ENDS: real breaks (labels, haze, bridges) look like that; jumping across a meander neck does not
  const sk0 = thin(m, w, h), ends = new Uint8Array(N); for (let i = 0; i < N; i++) if (sk0[i] && nbCount(sk0, w, h, i) === 1) ends[i] = 1;
  const endNear = dilate(ends, w, h, 7);
  for (let round = 0; round < 30; round++){
    const {L, comps} = label(out, w, h); if (comps.length < 2) break;
    const main = comps.reduce((a, b) => b.area > a.area ? b : a).id;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), hp = new Heap(4096), reached = new Map();
    for (let i = 0; i < N; i++) if (L[i] === main){
      const x = i % w, y = (i/w)|0; let edge = false;
      for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && !out[ny*w+nx]){ edge = true; break; } }
      if (edge && endNear[i]){ dist[i] = 0; hp.push(0, i); }
    }
    const area = {}; comps.forEach(c => area[c.id] = c.area);
    while (hp.n){
      const p = hp.pop(), d = hp.topKey; if (d > dist[p]) continue;
      const x = p % w, y = (p/w)|0;
      for (const [dx, dy] of NB8){
        const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny*w+nx; if (L[q] === main) continue;
        if (out[q] && (area[L[q]] || 0) >= 25){ if (endNear[q] && !reached.has(L[q])) reached.set(L[q], p); continue; }
        const lab = G.labelMask && G.labelMask[q], pr = out[q] ? 1 : lab ? Math.max(P[q], .85) : P[q];
        const nd = d + (dx && dy ? SQ2 : 1)*(pr < .12 ? 25 : 1 + 6*(1-pr));
        if (nd < dist[q] && nd <= budget){ dist[q] = nd; prev[q] = p; hp.push(nd, q); }
      }
    }
    if (!reached.size) break;
    const hwm = edtTo(notMask(out), w, h);
    for (const [id, p0] of reached){
      for (let p = p0; p >= 0 && dist[p] > 0; p = prev[p]){ const x = p % w, y = (p/w)|0;
        for (let yy = y-1; yy <= y+1; yy++) for (let xx = x-1; xx <= x+1; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy*w+xx] = 1; }
      joined++;
    }
  }
  return {m: out, n: joined};
}
/** remove broad, patchy "water" (towns, clearings): areas much wider than the river whose lightness varies a lot inside */
/** sediment-coloured (tan) water looks like bare soil: drop detached tan patches that are neither channel-like (long, thin, single-thread)
    nor lake-like (compact, smooth). Also drops straight horizontal bars (map scale bars). */
function dropPaleBlobs(D, m, w, h){
  const N = w*h, Lab = ensureLab(D), lb = label(m, w, h); if (lb.comps.length < 2) return m;
  const main = lb.comps.reduce((a, c) => c.area > a.area ? c : a);
  const sk = thin(m, w, h), st = new Map();
  for (let i = 0; i < N; i++){ const id = lb.L[i]; if (!id) continue; let s = st.get(id); if (!s) st.set(id, s = {n:0, per:0, sk:0, L:0, b:0, f:-1});
    s.n++; s.L += Lab[i*3]; s.b += Lab[i*3+2]; const x = i % w, y = (i/w)|0;
    if (x === 0 || y === 0 || x === w-1 || y === h-1 || !m[i-1] || !m[i+1] || !m[i-w] || !m[i+w]) s.per++;
    if (sk[i]){ s.sk++; if (s.f < 0) s.f = i; } }
  const ms = st.get(main.id), mainW = ms ? ms.n/Math.max(1, ms.sk) : 10, drop = new Set();
  const mm = new Uint8Array(N); for (let i = 0; i < N; i++) mm[i] = lb.L[i] === main.id ? 1 : 0; const dM = edtTo(mm, w, h), near = new Map();
  for (let i = 0; i < N; i++){ const id = lb.L[i]; if (id && id !== main.id){ const v = near.get(id); if (v === undefined || dM[i] < v) near.set(id, dM[i]); } }
  for (const c of lb.comps){ if (c === main) continue; const s = st.get(c.id);
    if (c.y1 - c.y0 <= 6 && c.x1 - c.x0 > 40){ drop.add(c.id); continue; }
    if (s.n < 12 || s.f < 0) continue;
    const Lm = s.L/s.n, bm = s.b/s.n; if (!(bm > 6 && Lm > 40)) continue; // only tan, sediment-like water
    const D0 = skDiameter(sk, w, h, s.f), W = s.n/Math.max(1, s.sk), hair = s.sk/Math.max(1, D0), circ = 4*Math.PI*s.n/(s.per*s.per);
    const channel = D0/W >= 8 && hair <= 1.4, lake = circ >= .6 && s.n > .001*N, belt = near.get(c.id) <= 5*mainW; // tan water away from the rivers is rarely a pond: usually bare ground
    if (!channel && !lake && !belt) drop.add(c.id); }
  if (!drop.size) return m;
  const out = new Uint8Array(N); for (let i = 0; i < N; i++) out[i] = m[i] && !drop.has(lb.L[i]) ? 1 : 0;
  return out;
}
/** longest route (geodesic diameter) through a skeleton component, starting from any of its pixels */
function skDiameter(sk, w, h, s0, ret){
  const dist = new Map([[s0, 0]]); let q = [s0], far = s0;
  const run = () => { for (let qi = 0; qi < q.length; qi++){ const p = q[qi], x = p % w, y = (p/w)|0, d = dist.get(p);
    for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny*w+nx; if (!sk[r] || dist.has(r)) continue; dist.set(r, d + (dx && dy ? SQ2 : 1)); if (dist.get(r) > dist.get(far)) far = r; q.push(r); } } };
  run(); const a = far; dist.clear(); dist.set(a, 0); q = [a]; far = a; run();
  return ret ? {a, b: far, D: dist.get(far), n: dist.size} : dist.get(far);
}
function dropTowns(D, m, w, h){
  const N = w*h, sk = thin(m, w, h), hw = edtTo(notMask(m), w, h), ws = [];
  for (let i = 0; i < N; i++) if (sk[i]) ws.push(2*hw[i]);
  if (ws.length < 100) return m;
  const W90 = quantile(ws, .9);
  if (W90 > .04*Math.min(w, h)) return m; // broad water bodies are normal here (estuaries, lakes, coasts)
  const blob = opening(m, w, h, Math.max(3, .75*W90));
  let nb = 0; for (const v of blob) nb += v; if (!nb) return m;
  const L = ensureLab(D), Lc = new Float32Array(N); for (let i = 0; i < N; i++) Lc[i] = L[i*3];
  const mu = boxBlurF(Lc, w, h, 1), sq = new Float32Array(N); for (let i = 0; i < N; i++) sq[i] = Lc[i]*Lc[i];
  const m2 = boxBlurF(sq, w, h, 1), sd = i => Math.sqrt(Math.max(0, m2[i] - mu[i]*mu[i]));
  const ref = []; for (let i = 0; i < N; i++) if (sk[i] && !blob[i] && hw[i] >= 3) ref.push(sd(i));
  if (ref.length < 50) return m;
  const lim = Math.max(4, 1.8*quantile(ref, .5));
  const {L: lab, comps} = label(blob, w, h), patchy = new Map();
  for (const c of comps) patchy.set(c.id, [0, 0]);
  for (let i = 0; i < N; i++) if (blob[i]){ const e = patchy.get(lab[i]); e[1]++; if (sd(i) > lim) e[0]++; }
  const kill = new Uint8Array(N); let k = 0;
  for (let i = 0; i < N; i++) if (blob[i]){ const e = patchy.get(lab[i]); if (e[0]/e[1] > .3 && e[1] < .02*N){ kill[i] = 1; k++; } }
  if (!k) return m;
  const kd = dilate(kill, w, h, 2), out = new Uint8Array(m); for (let i = 0; i < N; i++) if (kd[i]) out[i] = 0;
  if (D === G.D) G.townsRemoved = k;
  return out;
}
/** second pass: learn the colour spread of confidently detected water and score every pixel against it (diagonal Mahalanobis in Lab) */
function refineProb(D, P){
  const w = D.w, h = D.h, N = w*h, L = ensureLab(D), core = new Uint8Array(N);
  for (let i = 0; i < N; i++) core[i] = P[i] > .6 && !G.excl[i] ? 1 : 0;
  const cr = erode(core, w, h, 1.5); let n = 0; const mu = [0,0,0], sq = [0,0,0];
  for (let i = 0; i < N; i++) if (cr[i]){ n++; for (let k = 0; k < 3; k++){ const v = L[i*3+k]; mu[k] += v; sq[k] += v*v; } }
  if (n < 200) return P;
  const sd = mu.map((m, k) => Math.max(k ? 2.5 : 4, Math.sqrt(sq[k]/n - (m/n)**2))); for (let k = 0; k < 3; k++) mu[k] /= n;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++){
    const d2 = ((L[i*3]-mu[0])/sd[0])**2*.6 + ((L[i*3+1]-mu[1])/sd[1])**2 + ((L[i*3+2]-mu[2])/sd[2])**2;
    out[i] = Math.max(P[i], .5*Math.exp(-(d2 - 6)/6) > .5 ? .5 + .25*Math.min(1, (6 - d2)/6) : .5*Math.exp(-(d2 - 6)/6));
  }
  // local contrast: water that is brighter (or darker) than its surroundings with the water's hue, even if dimmer overall
  const Lc = new Float32Array(N); for (let i = 0; i < N; i++) Lc[i] = L[i*3];
  let bg = Lc; for (let k = 0; k < 3; k++) bg = boxBlurF(bg, w, h, 14);
  const cs = []; for (let i = 0; i < N; i++) if (cr[i]) cs.push(Lc[i] - bg[i]);
  const muC = quantile(cs, .5); G._muC = muC;
  if (Math.abs(muC) > 8){
    const sgn = Math.sign(muC), T = .4*Math.abs(muC), sc = .12*Math.abs(muC), sa = Math.max(5, sd[1]*1.5), sb = Math.max(5, sd[2]*1.5);
    for (let i = 0; i < N; i++){
      const c = sgn*(Lc[i] - bg[i]); if (c < .2*Math.abs(muC)) continue;
      const hue = Math.exp(-.5*(((L[i*3+1]-mu[1])/sa)**2 + ((L[i*3+2]-mu[2])/sb)**2));
      const pc = hue/(1 + Math.exp(-(c - T)/sc));
      if (pc > out[i]) out[i] = pc;
    }
  }
  return out;
}
function classify(D, opts = {}){
  const w = D.w, h = D.h, N = w*h;
  let P = waterProb(D, opts);
  let m = hysteresis(P, w, h, +$("wHyst").value/100, $("wRidge").checked);
  if ($("wRefine") && $("wRefine").checked){
    // second pass, kept only if it extends the water modestly (it must not swallow similar-coloured land)
    const P2 = refineProb(D, P), m2 = hysteresis(P2, w, h, +$("wHyst").value/100, $("wRidge").checked);
    let a0 = 0, a2 = 0; for (let i = 0; i < N; i++){ a0 += m[i]; a2 += m2[i]; }
    if (a2 <= 1.6*a0 + .01*N){ P = P2; m = m2; if (D === G.D) G.refineUsed = true; } else if (D === G.D) G.refineUsed = false;
  }
  if ($("wML") && $("wML").checked && D.rgba && D.kind !== "dem"){
    // self-trained pixel classifier (logistic regression on colour, texture, relative-brightness and line features)
    let a0 = 0; for (let i = 0; i < N; i++) a0 += m[i];
    const r = mlWater(D, P, 2);
    if (r.info && !r.info.skipped && r.info.acc > .85){
      const m3 = hysteresis(r.P, w, h, +$("wHyst").value/100, $("wRidge").checked);
      { // pixels the classifier ADDS must look like water: smooth (coarse texture), and detached new patches must be channel- or oxbow-shaped
        const {T7} = pixelFeatures(D).raw, wt = []; for (let i = 0; i < N; i += 2) if (m[i]) wt.push(T7[i]);
        const tq = Math.max(.5, 2.8*median(wt));
        for (let i = 0; i < N; i++) if (m3[i] && !m[i] && T7[i] > tq) m3[i] = 0;
        const add = new Uint8Array(N); for (let i = 0; i < N; i++) add[i] = m3[i] && !m[i] ? 1 : 0;
        const {L, comps} = label(add, w, h), md = dilate(m, w, h, 1.5), touch = new Uint8Array(comps.length + 1), hwA = edtTo(notMask(add), w, h), hs = new Float64Array(comps.length + 1);
        for (let i = 0; i < N; i++) if (L[i]){ if (md[i]) touch[L[i]] = 1; hs[L[i]] += hwA[i]; }
        const drop = new Uint8Array(comps.length + 1);
        for (const c of comps){ if (touch[c.id]) continue; const wd = 2*hs[c.id]/c.area, len = c.area/Math.max(.5, wd); if (len/Math.max(1, wd) < 4) drop[c.id] = 1; }
        for (let i = 0; i < N; i++) if (L[i] && drop[L[i]]) m3[i] = 0;
      }
      let a3 = 0; for (let i = 0; i < N; i++) a3 += m3[i];
      let ceA = 0; if (r.info.ce && r.info.ce.mask) for (let i = 0; i < N; i++) ceA += r.info.ce.mask[i];
      const okA = a3 <= Math.max(2.4*a0 + .02*N, 1.25*(a0 + ceA)) && a3 <= .8*N;
      r.info.used = okA; r.info.before = a0/N; r.info.after = a3/N;
      if (okA){ P = r.P; m = m3; }
    }
    if (D === G.D) G.mlInfo = r.info;
  }
  const r = roiOrFull(), valid = opts.valid;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const i = y*w+x; if (x < r.x0 || x >= r.x1 || y < r.y0 || y >= r.y1 || G.excl[i] || (valid && !valid[i]) || (D.rgba && !D.rgba[i*4+3])) m[i] = 0; }
  { // close short gaps along channels, but only through pixels that are at least somewhat water-like
    const cm = closing(m, w, h, 4); for (let i = 0; i < m.length; i++) if (cm[i] && !m[i] && P[i] > .2) m[i] = 1;
  }
  if (G.labelMask){ // rejoin water broken up by painted-out map labels
    const cm = closing(m, w, h, 6); for (let i = 0; i < m.length; i++) if (G.labelMask[i] && cm[i]) m[i] = 1;
  }
  m = cleanMask(m, w, h);
  if (D.rgba && D.kind !== "dem") m = dropTowns(D, m, w, h);
  const br = bridgeGaps(m, w, h, +$("wBridge").value, P);
  let n = br.n, out = br.m;
  if (+$("wBridge").value > 0 && !opts.noConnect){ const cn = connectToMain(out, w, h, P, 18*+$("wBridge").value); out = cn.m; n += cn.n; }
  if (D.rgba && D.kind !== "dem") out = dropPaleBlobs(D, out, w, h);
  if (D === G.D) G.bridges = n;
  return out;
}
function cleanMask(m, w, h){
  const sm = +$("wSmooth").value;
  if (sm > 0) m = closing(m, w, h, sm); // closing only: opening would erase narrow channels
  const holes = +$("wHole").value; if (holes > 0) m = fillHoles(m, w, h, holes);
  const mn = +$("wMin").value; if (mn > 0) m = removeSmall(m, w, h, mn);
  return m;
}
async function runWater(quiet){
  if (!G.D) return toast("Open an image first");
  const go = async () => {
    G.mask = classify(G.D); G.maskV++;
    G.prep = G.chan = G.net = G.lakes = null;
    const {comps} = label(G.mask, G.w, G.h);
    let area = 0; for (const c of comps) area += c.area;
    comps.sort((a, b) => b.area - a.area);
    const ra = roiArea();
    showRes("water", [
      R("Water area", U.A(area)), R("Share of analysis area", U.P(area/ra)),
      R("Separate water bodies", U.N(comps.length, 0)),
      R("Largest body", U.A(comps[0] ? comps[0].area : 0), comps[0] ? (100*comps[0].area/Math.max(1, area)).toFixed(0) + "% of all water" : ""),
      R("Analysis area", U.A(ra)),
    ]);
    rebuildOverlay();
  };
  if (quiet) { try { await go(); } catch(e){ toast(e.message); } } else await busy("Detecting water…", go);
}

/* ---------------- channel preparation ---------------- */
bindRange("pruneK", v => (v/10).toFixed(1) + "× width", () => { G.prep = null; });
bindRange("trK", v => "±" + v + " widths");
function prepNetwork(){
  if (!G.mask) throw new Error("Detect water first (Water tab)");
  if (G.prep && G.prep.v === G.maskV && G.prep.k === +$("pruneK").value && G.prep.o === String(G.outlet)) return G.prep;
  const w = G.w, h = G.h;
  const {L, comps} = label(G.mask, w, h);
  let cid = 0;
  if (G.outlet){
    const q = nearestOn(G.mask, w, h, G.outlet[0], G.outlet[1], 60);
    if (q >= 0) cid = L[q];
  }
  if (!cid){ // pick the most channel-like body: longest estimated centreline (area ÷ mean width)
    const hwAll = edtTo(notMask(G.mask), w, h), sum = new Float64Array(comps.length+1);
    for (let i = 0; i < L.length; i++) if (L[i]) sum[L[i]] += hwAll[i];
    let best = -1;
    for (const c of comps){ if (c.area < 30) continue; const est = c.area/(2*Math.max(.5, sum[c.id]/c.area)); if (est > best){ best = est; cid = c.id; } }
  }
  if (!cid) throw new Error("No water found");
  const net = new Uint8Array(w*h); for (let i = 0; i < net.length; i++) net[i] = L[i] === cid ? 1 : 0;
  const halfW = edtTo(notMask(net), w, h);
  let sk = thin(net, w, h);
  // choose outlet skeleton pixel
  let outSk = -1;
  if (G.outlet) outSk = nearestOn(sk, w, h, G.outlet[0], G.outlet[1], 200);
  if (outSk < 0){
    // rivers usually enter and leave through the image edge: prefer the widest channel end on the border
    const g0 = buildGraph(sk, w, h), r0 = roiOrFull(); let bw = -1, bwAny = -1, anyEnd = -1;
    const onEdge = p => { const x = p % w, y = (p/w)|0; return x - r0.x0 < 4 || r0.x1 - 1 - x < 4 || y - r0.y0 < 4 || r0.y1 - 1 - y < 4; };
    // width measured a little way in from the tip, where the channel is at full width
    const wAt = p => { let m = 0; const x = p % w, y = (p/w)|0, R0 = 6; for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++){ const q = (y+dy)*w + x+dx; if (x+dx >= 0 && y+dy >= 0 && x+dx < w && y+dy < h && sk[q] && halfW[q] > m) m = halfW[q]; } return m; };
    for (const n of g0.nodes){ if (n.type !== "end") continue; const wv = wAt(n.pix[0]); if (onEdge(n.pix[0]) && wv > bw){ bw = wv; outSk = n.pix[0]; } if (wv > bwAny){ bwAny = wv; anyEnd = n.pix[0]; } }
    if (outSk < 0) outSk = anyEnd;
  }
  let headSk = G.head ? nearestOn(sk, w, h, G.head[0], G.head[1], 200) : -1;
  const k = +$("pruneK").value/10;
  if (k > 0){
    sk = pruneSkeleton(sk, w, h, halfW, k, [outSk, headSk].filter(p => p >= 0));
    if (outSk >= 0 && !sk[outSk]) outSk = nearestOn(sk, w, h, outSk % w, (outSk/w)|0, 60);
  }
  const comp = comps[cid-1];
  G.prep = {v:G.maskV, k:+$("pruneK").value, o:String(G.outlet), net, halfW, sk, outSk, comp, cid, L};
  return G.prep;
}

/* ---------------- channel analysis ---------------- */
$("btnChannel").onclick = () => busy("Tracing channel centreline…", () => { analyzeChannel(); });
function analyzeChannel(){
  const P = prepNetwork(), w = G.w, h = G.h, {sk, halfW, net} = P;
  if (P.outSk < 0) throw new Error("Couldn't find a channel end. Set ⊙ Outlet.");
  const {dist, prev} = skelDijkstra(sk, w, h, P.outSk);
  let head = G.head ? nearestOn(sk, w, h, G.head[0], G.head[1], 200) : -1;
  if (head >= 0 && !Number.isFinite(dist[head])) head = -1;
  let WT = null;
  if (head < 0){
    // main stem = the channel end on the image edge reached by the longest, widest route (length × mean width along it)
    const r0 = roiOrFull(); let bd = -1; const hsk = []; for (let i = 0; i < sk.length; i++) if (sk[i]) hsk.push(halfW[i]); const capH = Math.max(2, 2*median(hsk)), hwc = halfW.map(v => Math.min(v, capH)); WT = widestTree(sk, w, h, P.outSk, hwc);
    for (let i = 0; i < dist.length; i++) if (sk[i] && Number.isFinite(dist[i]) && dist[i] > bd){ bd = dist[i]; head = i; }
    let best = -1, headE = -1;
    for (let i = 0; i < dist.length; i++){
      if (!sk[i] || !Number.isFinite(WT.cost[i]) || i === P.outSk) continue; const x = i % w, y = (i/w)|0;
      if (nbCount(sk, w, h, i) !== 1) continue;
      const tol = Math.max(8, .03*Math.min(w, h)), edge = x - r0.x0 < tol || r0.x1 - 1 - x < tol || y - r0.y0 < tol || r0.y1 - 1 - y < tol;
      const str = Math.hypot(x - P.outSk % w, y - ((P.outSk/w)|0)), sinC = WT.len[i]/Math.max(1, str), sc = WT.len[i]*WT.len[i]/Math.max(1e-9, WT.cost[i])*(edge ? 1.5 : 1)*(sinC > 3.5 ? (3.5/sinC)**2 : 1); if (WT.len[i] > .3*bd && sc > best){ best = sc; headE = i; }
    }
    if (headE >= 0) head = headE;
  }
  let path = []; for (let p = head; p >= 0; p = prev[p]) path.push(p); path.reverse();
  if (G.pathMode !== "shortest"){ let wp = null; if (WT && Number.isFinite(WT.cost[head])){ wp = []; for (let p = head; p >= 0; p = WT.prev[p]) wp.push(p); wp.reverse(); } else wp = widestPath(sk, w, h, P.outSk, head, halfW); if (wp && wp.length > 20) path = wp; }
  if (path.length < 20) throw new Error("Channel path too short. Check the mask, outlet and head.");
  const res = analyzePath(path, halfW);
  G.chan = res;
  { // how much of the connected water lies along this channel (rivers ≈ most of it; lagoons, bays and coasts ≈ little)
    const mk = new Uint8Array(w*h); res.pts.forEach(p => mk[Math.round(p[1])*w + Math.round(p[0])] = 1);
    const cor = dilate(mk, w, h, Math.max(3, 2*res.W)); let inC = 0; for (let i = 0; i < mk.length; i++) if (P.net[i] && cor[i]) inC++;
    res.corrFrac = inC/Math.max(1, P.comp.area); }
  try { channelExtras(res, P); } catch(e){ console.error(e); }
  // whole-network extras
  let skLen = 0; for (let i = 0; i < sk.length; i++) if (sk[i]) skLen++;
  const W = res.W;
  const rows = [
    SEC("Main channel"),
    R("Channel length", U.L(res.len), "along centreline, outlet to head"),
    R("Straight-line distance", U.L(res.straight)),
    R("Sinuosity", U.N(res.len/res.straight, 2), res.len/res.straight > 1.5 ? "meandering (above 1.5)" : res.len/res.straight > 1.05 ? "sinuous" : "straight"),
    R("Meander-belt sinuosity", U.N(res.beltSin, 2), "channel length ÷ length of the smoothed belt axis"),
    R("Meander belt width", U.L(res.beltW)),
    R("Downstream direction", U.D(res.az), "bearing from head to outlet"),
    SEC("Width"),
    R("Median width", U.L(W)), R("Mean width", U.L(res.wMean)),
    R("Width range (5–95%)", {v:NaN, u:"", s:U.L(res.w05).s + " – " + U.L(res.w95).s}),
    R("Width near outlet / near head", {v:res.wOut/res.wHead, u:"ratio", s:U.L(res.wOut).s + " / " + U.L(res.wHead).s}),
    res.Lb ? R("Width convergence length", U.L(res.Lb), `e-folding distance of downstream widening (R² = ${res.convR2.toFixed(2)}). Typical of tide-dominated channels.`) : R("Width convergence", {v:NaN, u:"", s:"no widening"}, "width does not increase toward the outlet"),
    R("Network area ÷ centreline length", U.L(P.comp.area/Math.max(1, skLen)), "average width over the whole connected network"),
    SEC("Meanders"),
    R("Bends between inflections", U.N(res.bends.length, 0)),
    R("Meander wavelength", U.L(res.lambda), "two consecutive bend chords"),
    R("Wavelength ÷ width", U.N(res.lambda/W, 1), "rivers commonly 10–14"),
    R("Bend radius of curvature (median)", U.L(res.Rc)),
    R("Radius ÷ width", U.N(res.Rc/W, 2), "rivers commonly 2–3; tighter bends below about 2"),
    R("Bend amplitude (median)", U.L(res.amp)),
    R("Bend sinuosity (median)", U.N(res.bendSin, 2)),
    SEC("Planform"),
    R("Channel count index", U.N(res.cci, 2), `mean number of wet channels crossed per transect (±${$("trK").value} widths). 1 = single-thread, over 1.5 = braided or anabranching`),
  ];
  showRes("channel", rows, `<canvas class="chart" id="chW"></canvas><canvas class="chart" id="chK"></canvas>
    <h4>Bends</h4><div style="max-height:220px;overflow:auto"><table class="grid"><tr><th>#</th><th>arc</th><th>chord</th><th>amp.</th><th>Rc</th><th>sin.</th></tr>
    ${res.bends.map((b, i) => `<tr><td>${i+1}</td><td>${U.L(b.arc).s}</td><td>${U.L(b.chord).s}</td><td>${U.L(b.amp).s}</td><td>${U.L(b.Rc).s}</td><td>${b.sin.toFixed(2)}</td></tr>`).join("")}</table></div>`);
  const sc = G.pxm || 1, un = lenUnit();
  chart($("chW"), {title:"Width along channel (outlet → head)", xlab:"distance from outlet (" + un + ")", ylab:"width (" + un + ")",
    series:[{x:res.s.map(v => v*sc), y:res.w.map(v => v*sc), color:"#3fc1d3", alpha:.35}, {x:res.s.map(v => v*sc), y:gauss1d(res.w, 8).map(v => v*sc), color:"#ff7a45"}]});
  chart($("chK"), {title:"Centreline curvature (inflections where it crosses zero)", xlab:"distance from outlet (" + un + ")", ylab:"curvature (1/" + un + ")",
    series:[{x:res.s.map(v => v*sc), y:Array.from(res.k, v => v/sc), color:"#e8c547"}], zero:true});
  G.tables.bends = res.bends.map((b, i) => ({bend:i+1, arc:b.arc*sc, chord:b.chord*sc, amplitude:b.amp*sc, radius:b.Rc*sc, sinuosity:b.sin, side:b.side}));
  G.tables.widthProfile = res.s.map((s, i) => ({distance:s*sc, width:res.w[i]*sc, curvature:res.k[i]/sc, x:res.pts[i][0], y:res.pts[i][1]}));
  rebuildOverlay();
}
function analyzePath(path, halfW){
  const w = G.w, n = path.length;
  const X = new Float64Array(n), Y = new Float64Array(n), Wd = new Float64Array(n), S = new Float64Array(n);
  for (let i = 0; i < n; i++){ X[i] = path[i] % w; Y[i] = (path[i]/w)|0; Wd[i] = Math.max(1, 2*halfW[path[i]] - 1); if (i) S[i] = S[i-1] + Math.hypot(X[i]-X[i-1], Y[i]-Y[i-1]); }
  const W = median(Wd), len = S[n-1], straight = Math.hypot(X[n-1]-X[0], Y[n-1]-Y[0]);
  const sig = clamp(W*1.2, 3, 80);
  const xs = gauss1d(X, sig), ys = gauss1d(Y, sig);
  const k = new Float64Array(n);
  for (let i = 1; i < n-1; i++){
    const dx = (xs[i+1]-xs[i-1])/2, dy = (ys[i+1]-ys[i-1])/2, ddx = xs[i+1]-2*xs[i]+xs[i-1], ddy = ys[i+1]-2*ys[i]+ys[i-1];
    k[i] = (dx*ddy - dy*ddx)/Math.pow(dx*dx + dy*dy + 1e-9, 1.5);
  }
  k[0] = k[1]; k[n-1] = k[n-2];
  const ks = gauss1d(k, sig/2);
  // sign with minimum run length
  const sg = Array.from(ks, v => v >= 0 ? 1 : -1);
  for (let pass = 0; pass < 6; pass++){
    let changed = false, i = 0;
    while (i < n){
      let j = i; while (j < n && sg[j] === sg[i]) j++;
      if (i > 0 && j < n && S[j-1] - S[i] < 1.5*W){ for (let t = i; t < j; t++) sg[t] = sg[i-1]; changed = true; }
      i = j;
    }
    if (!changed) break;
  }
  const infl = []; for (let i = 1; i < n; i++) if (sg[i] !== sg[i-1]) infl.push(i);
  const bends = [];
  for (let b = 0; b+1 < infl.length; b++){
    const a = infl[b], c = infl[b+1];
    const ax = xs[a], ay = ys[a], cx = xs[c], cy = ys[c], chord = Math.hypot(cx-ax, cy-ay);
    let amp = 0, kmax = 0;
    for (let i = a; i <= c; i++){
      const d = chord > 0 ? Math.abs((cx-ax)*(ay-ys[i]) - (ax-xs[i])*(cy-ay))/chord : 0; if (d > amp) amp = d;
      if (Math.abs(ks[i]) > kmax) kmax = Math.abs(ks[i]);
    }
    bends.push({arc:S[c]-S[a], chord, amp, Rc: kmax > 0 ? 1/kmax : NaN, sin: chord > 0 ? (S[c]-S[a])/chord : NaN, side: sg[a+1] > 0 ? "left" : "right", i0:a, i1:c});
  }
  const waves = []; for (let b = 0; b+1 < bends.length; b++) waves.push(bends[b].chord + bends[b+1].chord);
  const lambda = median(waves);
  // meander belt axis
  const sigB = clamp((Number.isFinite(lambda) ? lambda : 10*W)*.6, 5*W, n/3);
  const bx = gauss1d(X, sigB), by = gauss1d(Y, sigB);
  let axisLen = 0; const dev = [];
  for (let i = 1; i < n; i++) axisLen += Math.hypot(bx[i]-bx[i-1], by[i]-by[i-1]);
  for (let i = 0; i < n; i++) dev.push(Math.hypot(X[i]-bx[i], Y[i]-by[i]));
  // width convergence
  const fx_ = [], fy_ = [];
  for (let i = Math.floor(n*.03); i < Math.floor(n*.97); i++){ fx_.push(S[i]); fy_.push(Math.log(Wd[i])); }
  const fit = linfit(fx_, fy_);
  const nq = Math.max(3, Math.floor(n*.08));
  const wOut = median(Wd.slice(0, nq)), wHead = median(Wd.slice(n-nq));
  // channel count index via transects
  const step = Math.max(10, 2*W), half = +$("trK").value*W, counts = [], transects = [];
  for (let s0 = step/2; s0 < len; s0 += step){
    let i = 0; while (i < n-1 && S[i] < s0) i++;
    const i0 = Math.max(0, i-2), i1 = Math.min(n-1, i+2);
    let tx = xs[i1]-xs[i0], ty = ys[i1]-ys[i0]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx; let cnt = 0, prevWet = 0;
    for (let t = -half; t <= half; t += .7){
      const px = Math.round(X[i] + nx*t), py = Math.round(Y[i] + ny*t);
      const wet = px >= 0 && py >= 0 && px < G.w && py < G.h && G.mask[py*G.w+px] ? 1 : 0;
      if (wet && !prevWet) cnt++; prevWet = wet;
    }
    counts.push(cnt);
    if (transects.length < 400) transects.push([[X[i]-nx*half, Y[i]-ny*half], [X[i]+nx*half, Y[i]+ny*half]]);
  }
  const pts = []; for (let i = 0; i < n; i++) pts.push([X[i], Y[i]]);
  return {
    pts, s: Array.from(S), w: Array.from(Wd), k: ks, infl, bends, W, len, straight, xs, ys,
    wMean: mean(Wd), w05: quantile(Wd, .05), w95: quantile(Wd, .95), wOut, wHead,
    Lb: fit.b < 0 ? -1/fit.b : null, convR2: fit.r2,
    lambda, Rc: median(bends.map(b => b.Rc)), amp: median(bends.map(b => b.amp)), bendSin: median(bends.map(b => b.sin)),
    beltSin: len/Math.max(1, axisLen), beltW: 2*quantile(dev, .95), axisLen, bx, by, nT: counts.length,
    az: AZ(X[0]-X[n-1], Y[0]-Y[n-1]), cci: mean(counts), transects: transects.length < 80 ? transects : transects.filter((_, i) => i % Math.ceil(transects.length/80) === 0),
  };
}

/* ---------------- network analysis ---------------- */
$("btnNetwork").onclick = () => busy("Building channel network…", () => { analyzeNetwork(); });
function analyzeNetwork(){
  const P = prepNetwork(), w = G.w, h = G.h;
  const Gr = buildGraph(P.sk, w, h), nodes = Gr.nodes, links = Gr.links.filter(l => l.a !== l.b);
  if (!links.length) throw new Error("No channel links found. Check the water mask.");
  const adj = nodes.map(() => []); links.forEach(l => { adj[l.a].push(l); adj[l.b].push(l); });
  // root node near outlet
  const ox = P.outSk >= 0 ? P.outSk % w : (G.outlet ? G.outlet[0] : 0), oy = P.outSk >= 0 ? (P.outSk/w)|0 : (G.outlet ? G.outlet[1] : 0);
  let root = -1, bd = Infinity;
  nodes.forEach(nd => { if (!adj[nd.id].length) return; const d = (nd.x-ox)**2 + (nd.y-oy)**2 - (nd.type === "end" ? 4 : 0); if (d < bd){ bd = d; root = nd.id; } });
  const seen = new Uint8Array(nodes.length), children = nodes.map(() => []), orderBFS = [], used = new Set();
  seen[root] = 1; const q = [root]; let reachedLinks = new Set();
  while (q.length){
    const v = q.shift(); orderBFS.push(v);
    for (const l of adj[v]){
      reachedLinks.add(l.id);
      const o = l.a === v ? l.b : l.a;
      if (!seen[o]){ seen[o] = 1; l.down = v; l.up = o; children[v].push(l); used.add(l.id); q.push(o); }
    }
  }
  const loops = reachedLinks.size - used.size;
  for (let t = orderBFS.length-1; t >= 0; t--){
    const v = orderBFS[t];
    for (const l of children[v]){
      const ups = children[l.up];
      if (!ups.length) l.order = 1;
      else { const m = Math.max(...ups.map(u => u.order)); l.order = ups.filter(u => u.order === m).length >= 2 ? m+1 : m; }
    }
  }
  const tree = [...used].map(i => Gr.links[i]);
  const maxO = Math.max(...tree.map(l => l.order));
  const N = new Array(maxO+1).fill(0), Lsum = new Array(maxO+1).fill(0);
  for (const l of tree){
    Lsum[l.order] += l.len;
    const ups = children[l.up];
    if (!ups.some(u => u.order === l.order)) N[l.order]++;
  }
  const Rb = [], Rl = [];
  for (let u = 1; u < maxO; u++){ if (N[u+1]) Rb.push(N[u]/N[u+1]); if (N[u] && N[u+1]) Rl.push((Lsum[u+1]/N[u+1])/(Lsum[u]/N[u])); }
  const totalLen = links.filter(l => reachedLinks.has(l.id)).reduce((s, l) => s + l.len, 0);
  const sources = nodes.filter(nd => seen[nd.id] && nd.type === "end" && nd.id !== root).length;
  const junctions = nodes.filter(nd => seen[nd.id] && nd.type === "junction").length;
  // pixel orders for display
  const pixOrder = new Uint8Array(w*h);
  for (const l of tree) for (const p of l.pix) if (!pixOrder[p] || pixOrder[p] < l.order) pixOrder[p] = l.order;
  // unchanneled flow length
  const dN = edtTo(P.net, w, h), r = roiOrFull(), land = [];
  for (let y = r.y0; y < r.y1; y += 1) for (let x = r.x0; x < r.x1; x += 1){ const i = y*w+x; if (!G.mask[i] && !G.excl[i]) land.push(dN[i]); }
  const ra = roiArea(), dens = totalLen/ra;
  G.net = {pixOrder, N, Lsum, maxO, loops, sources, totalLen, Rb: geomean(Rb), Rl: geomean(Rl),
    lines: tree.map(l => ({pts: l.pix.map(p => [p % w, (p/w)|0]), order: l.order}))};
  const tbl = `<h4>Horton analysis by Strahler order</h4><table class="grid"><tr><th>order</th><th>streams</th><th>mean length</th><th>total length</th></tr>` +
    N.map((c, u) => u ? `<tr><td><span class="swatch" style="background:${ORDER_COL[Math.min(u-1, 8)]}"></span>${u}</td><td>${c}</td><td>${U.L(Lsum[u]/Math.max(1, c)).s}</td><td>${U.L(Lsum[u]).s}</td></tr>` : "").join("") + "</table>";
  showRes("network", [
    SEC("Topology"),
    R("Highest Strahler order", U.N(maxO, 0)),
    R("Sources (channel heads)", U.N(sources, 0), "Shreve magnitude of the outlet"),
    R("Junctions", U.N(junctions, 0)), R("Links", U.N(reachedLinks.size, 0)),
    R("Loops (cycles)", U.N(loops, 0), loops ? "braided, anastomosing or tidal interconnections" : "tree-like (dendritic)"),
    R("Bifurcation ratio Rb", U.N(geomean(Rb), 2), "Horton; natural networks usually 3–5"),
    R("Length ratio RL", U.N(geomean(Rl), 2), "Horton; typically 1.5–3.5"),
    SEC("Extent"),
    R("Total channel length", U.L(totalLen)),
    R("Mean link length", U.L(totalLen/Math.max(1, reachedLinks.size))),
    R("Channel (drainage) density", G.pxm ? U.N(dens/G.pxm*1000, 2, "km/km²") : U.N(dens, 4, "px⁻¹"), "channel length ÷ analysis area"),
    R("Network water area", U.A(P.comp.area)),
    SEC("Distance from land to nearest channel"),
    R("Mean", U.L(mean(land)), "unchanneled flow length, a key measure of how well a marsh or tidal flat is drained"),
    R("Median", U.L(median(land))), R("90th percentile", U.L(quantile(land, .9))), R("Maximum", U.L(maxOf(land))),
  ], tbl + `<canvas class="chart" id="chUL"></canvas><canvas class="chart" id="chHort"></canvas>`);
  const sc = G.pxm || 1;
  histChart($("chUL"), land.map(v => v*sc), 30, {title:"Distance from land to nearest channel", xlab:lenUnit()});
  try { networkExtras({tree, children, nodes, P, w}); } catch(e){ console.error(e); }
  chart($("chHort"), {title:"Horton plot: streams per order (log scale)", xlab:"Strahler order", ylab:"number of streams", logy:true,
    series:[{x:N.map((_, u) => u).slice(1), y:N.slice(1), color:"#ff7a45", dots:true}]});
  rebuildOverlay();
}

/* ---------------- lakes ---------------- */
$("btnLakes").onclick = () => busy("Measuring water bodies…", () => { analyzeLakes(); });
function analyzeLakes(){
  if (!G.mask) throw new Error("Detect water first (Water tab)");
  const w = G.w, h = G.h, minA = +$("lkMin").value;
  const {L, comps} = label(G.mask, w, h, G.roi);
  let netId = 0;
  if ($("lkNoNet").checked){ try { netId = prepNetwork().cid; } catch(e){} }
  const lakes = [], keep = new Uint8Array(comps.length+1);
  for (const c of comps){
    if (c.id === netId || c.area < minA || ($("lkNoEdge").checked && c.border)) continue;
    const mx = c.sx/c.area, my = c.sy/c.area, a = c.sxx/c.area - mx*mx + 1/12, cc = c.syy/c.area - my*my + 1/12, b = c.sxy/c.area - mx*my;
    const tr = (a+cc)/2, dd = Math.sqrt(((a-cc)/2)**2 + b*b), l1 = tr+dd, l2 = Math.max(1e-6, tr-dd);
    const th = .5*Math.atan2(2*b, a-cc), major = 4*Math.sqrt(l1), minor = 4*Math.sqrt(l2);
    const P = c.perim*Math.PI/4;
    const az = (AZ(Math.cos(th), Math.sin(th)) % 180);
    lakes.push({id:c.id, area:c.area, perim:P, circ:Math.min(1, 4*Math.PI*c.area/(P*P)), major, minor, elong:major/minor, az, cx:mx, cy:my, th});
    keep[c.id] = 1;
  }
  if (!lakes.length) throw new Error("No separate water bodies found with these settings");
  const Lmask = new Uint8Array(w*h); for (let i = 0; i < Lmask.length; i++) if (keep[L[i]]) Lmask[i] = 1;
  const axes = lakes.filter(l => l.elong >= 1.3).slice(0, 800).map(l => { const hx = Math.cos(l.th)*l.major/2, hy = Math.sin(l.th)*l.major/2; return [[l.cx-hx, l.cy-hy], [l.cx+hx, l.cy+hy]]; });
  G.lakes = {Lmask, axes, lakes};
  const areas = lakes.map(l => l.area), tot = areas.reduce((s, v) => s+v, 0), ra = roiArea();
  G.lakes.tot = tot; G.lakes.ra = ra;
  // size–frequency exponent (upper half, cumulative)
  const sorted = [...areas].sort((a, b) => b - a), cx = [], cy = [];
  const amed = median(areas);
  sorted.forEach((a, i) => { if (a >= amed){ cx.push(Math.log10(a)); cy.push(Math.log10(i+1)); } });
  const pf = linfit(cx, cy);
  // orientation statistics (axial, elongated lakes)
  const el = lakes.filter(l => l.elong >= 1.5);
  let C = 0, Sn = 0; el.forEach(l => { const t = l.az*Math.PI/90; C += Math.cos(t)*(l.elong-1); Sn += Math.sin(t)*(l.elong-1); });
  const meanAz = ((Math.atan2(Sn, C)*90/Math.PI) + 180) % 180, Rbar = el.length ? Math.hypot(C, Sn)/el.reduce((s, l) => s + l.elong-1, 0) : NaN;
  // shoreline fractal dimension of all water
  const fd = fractalDim(G.mask, w, h);
  showRes("lakes", [
    SEC("Population"),
    R("Water bodies", U.N(lakes.length, 0)), R("Total lake area", U.A(tot)), R("Lake cover (limnicity)", U.P(tot/ra)),
    R("Density", G.pxm ? U.N(lakes.length/(ra*G.pxm*G.pxm/1e6), 2, "per km²") : U.N(lakes.length/ra*1e6, 2, "per Mpx")),
    R("Median area", U.A(median(areas))), R("Mean area", U.A(tot/lakes.length)), R("Largest", U.A(sorted[0])),
    R("Size–frequency exponent", U.N(-pf.b, 2), `slope of log N(>A) against log A for the larger half (R² = ${fx(pf.r2, 2)})`),
    SEC("Shape"),
    R("Median circularity", U.N(median(lakes.map(l => l.circ)), 2), "1 = circle"),
    R("Median elongation", U.N(median(lakes.map(l => l.elong)), 2), "long axis ÷ short axis"),
    R("Elongated lakes (≥1.5)", U.N(el.length, 0)),
    R("Preferred long-axis bearing", U.D(ax180(meanAz)), `axial mean; strength R = ${fx(Rbar, 2)} (0 = random, 1 = all aligned). Aligned thaw lakes often lie perpendicular to the prevailing wind.`),
    SEC("Shoreline"),
    R("Fractal dimension", U.N(fd.D, 3), `box-counting of all water edges (R² = ${fx(fd.r2, 3)}). 1 = smooth, toward 2 = very convoluted`),
  ], `<canvas class="chart" id="chLA"></canvas><canvas class="rose" id="chLR"></canvas><p class="note" style="text-align:center">Long-axis orientations of elongated lakes</p>`);
  const sc2 = G.pxm ? G.pxm*G.pxm : 1;
  histChart($("chLA"), areas.map(a => Math.log10(a*sc2)), 25, {title:"Lake size distribution", xlab:"log₁₀ area (" + (G.pxm ? "m²" : "px²") + ")"});
  rose($("chLR"), el.map(l => l.az), el.map(l => l.elong-1), true);
  G.tables.lakes = lakes.map((l, i) => ({lake:i+1, area:l.area*sc2, perimeter:l.perim*(G.pxm||1), circularity:l.circ, major_axis:l.major*(G.pxm||1), minor_axis:l.minor*(G.pxm||1), elongation:l.elong, bearing_deg:l.az, centroid_x:l.cx, centroid_y:l.cy}));
  rebuildOverlay();
}
function fractalDim(m, w, h){
  const b = []; const r = roiOrFull();
  for (let y = Math.max(1, r.y0); y < Math.min(h-1, r.y1); y++) for (let x = Math.max(1, r.x0); x < Math.min(w-1, r.x1); x++){ const i = y*w+x; if (m[i] && (!m[i-1] || !m[i+1] || !m[i-w] || !m[i+w])) b.push(i); }
  const xs = [], ys = [];
  for (let s = 2; s <= Math.min(r.x1-r.x0, r.y1-r.y0)/4; s *= 2){
    const gw = Math.ceil(w/s), seen = new Uint8Array(gw*Math.ceil(h/s)); let c = 0;
    for (const i of b){ const k = Math.floor((i/w)/s)*gw + Math.floor((i%w)/s); if (!seen[k]){ seen[k] = 1; c++; } }
    if (c){ xs.push(Math.log(1/s)); ys.push(Math.log(c)); }
  }
  const f = linfit(xs, ys); return {D:f.b, r2:f.r2};
}

/* ---------------- pattern (bedforms / lineaments) ---------------- */
$("btnPattern").onclick = () => busy("Computing 2-D spectrum…", () => { analyzePattern(); });
function patternVals(D, w){
  if (D._patVal) return D._patVal;
  const val = new Float32Array(w*G.h);
  if (D.dem) for (let i = 0; i < val.length; i++) val[i] = D.dem[i];
  else {
    const c = D.rgba; for (let i = 0; i < val.length; i++) val[i] = .2126*c[i*4] + .7152*c[i*4+1] + .0722*c[i*4+2];
    if (D.kind === "image"){ const t = boxBlurF(val, w, G.h, 1); val.set(boxBlurF(t, w, G.h, 1)); }
  }
  return D._patVal = val;
}
function analyzePattern(boxArg, quiet){
  if (!G.D) throw new Error("Open an image first");
  const box = boxArg || G.pbox || roiOrFull(), w = G.w, D = G.D;
  const bw = box.x1-box.x0, bh = box.y1-box.y0, S = Math.min(bw, bh);
  if (S < 32) throw new Error("Pattern box is too small");
  const cx = box.x0 + bw/2, cy = box.y0 + bh/2, x0 = cx - S/2, y0 = cy - S/2;
  let N = 64; while (N*2 <= Math.min(512, S)) N *= 2;
  const val = patternVals(D, w);
  // screenshots: ignore periods under 12 px (JPEG 8×8 blocks); rasters: under 6 px
  const minWl = D.kind === "image" ? 12 : 6;
  const bil = (x, y) => { x = clamp(x, 0, w-1.001); y = clamp(y, 0, G.h-1.001); const xi = x|0, yi = y|0, fx2 = x-xi, fy = y-yi, i = yi*w+xi;
    let a = val[i], b = val[i+1], c = val[i+w], d = val[i+w+1]; const m = [a,b,c,d].filter(Number.isFinite); const mm = m.length ? m.reduce((s,v)=>s+v,0)/m.length : 0;
    if (!Number.isFinite(a)) a = mm; if (!Number.isFinite(b)) b = mm; if (!Number.isFinite(c)) c = mm; if (!Number.isFinite(d)) d = mm;
    return a*(1-fx2)*(1-fy) + b*fx2*(1-fy) + c*(1-fx2)*fy + d*fx2*fy; };
  const re = new Float64Array(N*N), im = new Float64Array(N*N), step = S/N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) re[j*N+i] = bil(x0 + (i+.5)*step, y0 + (j+.5)*step);
  // detrend plane
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxz = 0, syz = 0, n = N*N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const z = re[j*N+i]; sx += i; sy += j; sz += z; sxx += i*i; syy += j*j; sxz += i*z; syz += j*z; }
  const ax = (sxz - sx*sz/n)/(sxx - sx*sx/n), ay = (syz - sy*sz/n)/(syy - sy*sy/n), a0 = sz/n - ax*sx/n - ay*sy/n;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const wv = (.5 - .5*Math.cos(2*Math.PI*i/(N-1)))*(.5 - .5*Math.cos(2*Math.PI*j/(N-1)));
    re[j*N+i] = (re[j*N+i] - (a0 + ax*i + ay*j))*wv;
  }
  fft2(re, im, N);
  const Pw = new Float64Array(N*N), half = N/2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const si = (i+half)%N, sj = (j+half)%N; Pw[sj*N+si] = re[j*N+i]**2 + im[j*N+i]**2; }
  // radial background spectrum
  const rad = new Float64Array(half+2), radN = new Float64Array(half+2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const r = Math.round(Math.hypot(i-half, j-half)); if (r > 0 && r <= half){ rad[r] += Pw[j*N+i]; radN[r]++; } }
  for (let r = 0; r <= half; r++) rad[r] = radN[r] ? rad[r]/radN[r] : 0;
  const radAt = r => { const a = Math.floor(r), f = r - a; return rad[a]*(1-f) + rad[Math.min(half, a+1)]*f; };
  // peak search on the whitened spectrum (power ÷ radial mean) so red-noise topography does not dominate
  const sm = (i, j) => { let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += Pw[(j+b)*N + i+a]; return s/9; };
  const peaks = [];
  for (let j = 1; j <= half; j++) for (let i = 1; i < N-1; i++){
    const kx = i-half, ky = j-half, r = Math.hypot(kx, ky); if (r < 3 || r > Math.min(half-2, S/minWl)) continue;
    const p = sm(i, j); peaks.push({kx, ky, r, p, sc: p/Math.max(1e-30, radAt(r))});
  }
  peaks.sort((a, b) => b.sc - a.sc);
  const p1 = {...peaks[0]};
  { // sub-bin refinement: power-weighted centroid in a 3×3 window
    const ci = p1.kx + half, cj = p1.ky + half; let sw = 0, sx = 0, sy = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++){ const v = Pw[(cj+b)*N + ci+a]; sw += v; sx += v*a; sy += v*b; }
    if (sw > 0){ p1.kx += sx/sw; p1.ky += sy/sw; p1.r = Math.hypot(p1.kx, p1.ky); }
  }
  const p2 = peaks.find(p => { const d = Math.min(Math.hypot(p.kx-p1.kx, p.ky-p1.ky), Math.hypot(p.kx+p1.kx, p.ky+p1.ky)); return d > Math.max(3, p1.r*.35); });
  const prom = p1.sc;
  const lam = r => S/r, waveAz = (kx, ky) => AZ(kx, ky) % 180;
  const crest1 = (waveAz(p1.kx, p1.ky) + 90) % 180;
  if (quiet) return {prom, spacing: lam(p1.r), crest: crest1, box};
  // structure tensor
  const st = structureTensor(val, w, G.h, box);
  showRes("pattern", [
    SEC("Dominant periodic pattern (Fourier)"),
    R("Spacing (wavelength)", U.L(lam(p1.r)), "crest-to-crest distance"),
    R("Crest trend", U.D(ax180(crest1)), "the same line also runs " + (ax180(crest1)+180).toFixed(0) + "°"),
    R("Spacing direction", U.D(ax180(waveAz(p1.kx, p1.ky))), "perpendicular to crests. For transverse dunes this is the formative wind axis; slip faces show which way"),
    R("Peak prominence", U.N(prom, 1), prom > 12 ? "strong, regular pattern" : prom > 5 ? "moderate regularity" : "weak or irregular, so treat with caution"),
    G.pxm ? R("Crests per km", U.N(1000/(lam(p1.r)*G.pxm), 2)) : null,
    p2 && p2.sc > 5 ? R("Secondary pattern spacing", U.L(lam(p2.r)), "crests trend " + ax180(waveAz(p2.kx, p2.ky)+90) + "°: a second set such as linear vs star dunes, or cross-cutting fractures") : null,
    SEC("Edge orientation (structure tensor)"),
    R("Dominant lineament trend", U.D(ax180(st.trend)), "average direction of linear features"),
    R("Coherence", U.N(st.coh, 2), "0 = no preferred direction, 1 = perfectly parallel"),
    R("Analysed window", U.L(S), N + "×" + N + " samples"),
  ], `<div class="chips" style="justify-content:center"><canvas id="specImg" width="${N}" height="${N}" style="width:200px;height:200px;border-radius:10px;image-rendering:pixelated"></canvas></div>
    <p class="note" style="text-align:center">Power spectrum (centre = long wavelengths). Bright off-centre spots = regular spacing.</p>
    <canvas class="chart" id="chRad"></canvas><canvas class="rose" id="chSt"></canvas><p class="note" style="text-align:center">Edge-orientation rose (weighted by edge strength)</p>`);
  // spectrum image
  const sc = $("specImg").getContext("2d"), idd = sc.createImageData(N, N);
  let mx = -Infinity, mn = Infinity; const lg = Pw.map(v => Math.log10(v + 1e-12)); for (const v of lg){ if (v > mx) mx = v; if (v < mn) mn = v; }
  const lo = mx - 6;
  for (let i = 0; i < N*N; i++){ const t = clamp((lg[i] - lo)/(mx - lo), 0, 1); const c = magma(t); idd.data[i*4] = c[0]; idd.data[i*4+1] = c[1]; idd.data[i*4+2] = c[2]; idd.data[i*4+3] = 255; }
  sc.putImageData(idd, 0, 0);
  const scl = G.pxm || 1, xsR = [], ysR = [];
  for (let r = 2; r < half; r++){ xsR.push(lam(r)*scl); ysR.push(rad[r]); }
  chart($("chRad"), {title:"Radially averaged spectrum", xlab:"wavelength (" + lenUnit() + ")", ylab:"power", logx:true, logy:true, series:[{x:xsR, y:ysR, color:"#3fc1d3"}], mark: lam(p1.r)*scl});
  rose($("chSt"), st.bins.map((_, i) => i*5 + 2.5), st.bins, true, true);
  G.pattern = {spacing: lam(p1.r), crest: crest1, prom, coh: st.coh, box, S, r: p1.r};
}
function boxBlurF(a, w, h, r){
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let s = 0, n = 0; for (let k = -r; k <= r; k++){ const xx = x+k; if (xx >= 0 && xx < w){ const v = a[y*w+xx]; if (Number.isFinite(v)){ s += v; n++; } } } t[y*w+x] = n ? s/n : NaN; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let s = 0, n = 0; for (let k = -r; k <= r; k++){ const yy = y+k; if (yy >= 0 && yy < h){ const v = t[yy*w+x]; if (Number.isFinite(v)){ s += v; n++; } } } o[y*w+x] = n ? s/n : NaN; }
  return o;
}
function structureTensor(val, w, h, box){
  const stp = Math.max(1, Math.round(Math.max(box.x1-box.x0, box.y1-box.y0)/500));
  let J11 = 0, J22 = 0, J12 = 0; const bins = new Array(36).fill(0);
  const V = (x, y) => { const v = val[y*w+x]; return Number.isFinite(v) ? v : 0; };
  for (let y = box.y0 + stp; y < box.y1 - stp; y += stp) for (let x = box.x0 + stp; x < box.x1 - stp; x += stp){
    const gx = (V(x+stp,y-stp) + 2*V(x+stp,y) + V(x+stp,y+stp)) - (V(x-stp,y-stp) + 2*V(x-stp,y) + V(x-stp,y+stp));
    const gy = (V(x-stp,y+stp) + 2*V(x,y+stp) + V(x+stp,y+stp)) - (V(x-stp,y-stp) + 2*V(x,y-stp) + V(x+stp,y-stp));
    const m2 = gx*gx + gy*gy; if (!m2) continue;
    J11 += gx*gx; J22 += gy*gy; J12 += gx*gy;
    const crest = (AZ(gx, gy) + 90) % 180; bins[Math.floor(crest/5) % 36] += m2;
  }
  const th = .5*Math.atan2(2*J12, J11 - J22);
  const coh = Math.sqrt((J11-J22)**2 + 4*J12*J12)/(J11 + J22 || 1);
  return {trend: (AZ(Math.cos(th), Math.sin(th)) + 90) % 180, coh, bins};
}
function magma(t){
  const s = [[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[250,193,39],[252,255,164]];
  const u = t*(s.length-1), k = Math.min(s.length-2, Math.floor(u)), f = u-k;
  return [0,1,2].map(j => s[k][j]*(1-f) + s[k+1][j]*f);
}

/* ---------------- surface cover ---------------- */
bindRange("kK", v => v);
$("btnCover").onclick = () => busy("Classifying surface…", () => { analyzeCover(); });
function analyzeCover(){
  if (!G.D) throw new Error("Open an image first");
  const D = G.D, L = ensureLab(D), w = G.w, h = G.h, r = roiOrFull(), k = +$("kK").value;
  const tot = (r.x1-r.x0)*(r.y1-r.y0), stride = Math.max(1, Math.floor(Math.sqrt(tot/30000)));
  const s = [];
  for (let y = r.y0; y < r.y1; y += stride) for (let x = r.x0; x < r.x1; x += stride){ const i = y*w+x; if (G.excl[i] || !D.rgba[i*4+3]) continue; s.push(L[i*3], L[i*3+1], L[i*3+2]); }
  const C = kmeans(Float64Array.from(s), k, 18);
  const cls = new Int8Array(w*h).fill(-1), cnt = new Array(k).fill(0);
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++){
    const i = y*w+x; if (G.excl[i] || !D.rgba[i*4+3]) continue;
    let b = 0, bd = Infinity;
    for (let c = 0; c < k; c++){ const d = (L[i*3]-C[c*3])**2 + (L[i*3+1]-C[c*3+1])**2 + (L[i*3+2]-C[c*3+2])**2; if (d < bd){ bd = d; b = c; } }
    cls[i] = b; cnt[b]++;
  }
  const valid = cnt.reduce((a, b) => a+b, 0);
  const cols = []; for (let c = 0; c < k; c++){ const [rr, gg, bb] = lab2rgb(C[c*3], C[c*3+1], C[c*3+2]); cols.push([rr, gg, bb]); }
  // vivid display colours for overlay
  const disp = cols.map(c => { const l = (c[0]+c[1]+c[2])/3; return c.map(v => clamp(l + (v-l)*2.2, 0, 255)); });
  // patches per class
  const patches = [];
  for (let c = 0; c < k; c++){
    const m = new Uint8Array(w*h); for (let i = 0; i < m.length; i++) m[i] = cls[i] === c ? 1 : 0;
    const {comps} = label(m, w, h); const big = comps.filter(p => p.area >= 4);
    patches.push({n: big.length, mean: big.length ? big.reduce((s, p) => s + p.area, 0)/big.length : 0, largest: big.length ? Math.max(...big.map(p => p.area))/Math.max(1, cnt[c]) : 0});
  }
  const ps = cnt.map(c => c/valid), H = -ps.reduce((s, p) => s + (p > 0 ? p*Math.log(p) : 0), 0);
  G.cover = {cls, cols: disp, ps};
  G.lay.cover = true; document.querySelector('.lay[data-k="cover"]').classList.add("on");
  const order = [...Array(k).keys()].sort((a, b) => cnt[b] - cnt[a]);
  const guess = c => { const [l, a, b] = [C[c*3], C[c*3+1], C[c*3+2]]; if (b < -8 && a < 5) return "water / blue"; if (a < -6) return "vegetation"; if (l > 75 && Math.hypot(a, b) < 12) return "bright: sand, salt, silt, snow"; if (l < 30) return "dark: shadow, deep water, wet ground"; if (a > 8 && b > 15) return "red-brown: oxidised sand, soil"; return "mixed or bare ground"; };
  showRes("cover", [
    R("Classes", U.N(k, 0)), R("Shannon diversity H′", U.N(H, 3), "higher = more evenly mixed landscape"), R("Evenness", U.N(H/Math.log(k), 3), "H′ ÷ ln k"),
  ], `<table class="grid"><tr><th>class</th><th>area</th><th>share</th><th>patches</th><th>mean patch</th></tr>` +
    order.map(c => `<tr><td><span class="swatch" style="background:rgb(${disp[c].map(Math.round)})"></span><span class="swatch" style="background:rgb(${cols[c].map(Math.round)})"></span>${guess(c)}</td><td>${U.A(cnt[c]).s}</td><td>${(100*ps[c]).toFixed(1)}%</td><td>${patches[c].n}</td><td>${U.A(patches[c].mean).s}</td></tr>`).join("") +
    `</table><p class="note">Left swatch = overlay colour, right = true average colour. Class names are rough guesses from colour, so check them against the image.</p>`);
  G.tables.cover = order.map(c => ({class:guess(c), area:cnt[c]*(G.pxm ? G.pxm**2 : 1), share:ps[c], patches:patches[c].n, mean_patch:patches[c].mean*(G.pxm ? G.pxm**2 : 1), L:C[c*3], a:C[c*3+1], b:C[c*3+2]}));
  rebuildOverlay();
}

/* ---------------- terrain & hydrology ---------------- */
function demZ(){
  const D = G.D, zf = parseFloat($("zFac").value) || 1;
  const cx = parseFloat($("cellX").value), cy = parseFloat($("cellY").value);
  if (!(cx > 0 && cy > 0)) throw new Error("Enter the DEM cell size in metres");
  D.cx = cx; D.cy = cy; G.pxm = Math.sqrt(cx*cy); G.pxSrc = "DEM cell size"; updateInfo();
  const z = zf === 1 ? D.dem : D.dem.map(v => v*zf);
  return {z, dx:cx, dy:cy};
}
$("btnTerrain").onclick = () => busy("Computing terrain statistics…", () => { analyzeTerrain(); });
function slopeAspect(z, w, h, dx, dy){
  const sl = new Float32Array(w*h).fill(NaN), as = new Float32Array(w*h).fill(NaN), tri = new Float32Array(w*h).fill(NaN);
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++){
    const i = y*w+x, z0 = z[i]; if (!Number.isFinite(z0)) continue;
    const g = (a, b) => { const v = z[(y+b)*w + x+a]; return Number.isFinite(v) ? v : z0; };
    const a = g(-1,-1), b = g(0,-1), c = g(1,-1), d = g(-1,0), f = g(1,0), gg = g(-1,1), hh = g(0,1), ii = g(1,1);
    const p = ((c+2*f+ii)-(a+2*d+gg))/(8*dx), q = ((gg+2*hh+ii)-(a+2*b+c))/(8*dy);
    sl[i] = Math.atan(Math.hypot(p, q))*180/Math.PI;
    as[i] = (AZ(-p, -q) + 360) % 360;
    tri[i] = Math.sqrt(((a-z0)**2+(b-z0)**2+(c-z0)**2+(d-z0)**2+(f-z0)**2+(gg-z0)**2+(hh-z0)**2+(ii-z0)**2));
  }
  return {sl, as, tri};
}
function inRoi(i){ const r = roiOrFull(), x = i % G.w, y = (i/G.w)|0; return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1; }
function analyzeTerrain(){
  const {z, dx, dy} = demZ(), w = G.w, h = G.h;
  const {sl, as, tri} = slopeAspect(z, w, h, dx, dy);
  const zs = [], ss = [], aw = new Array(36).fill(0), tr = [];
  for (let i = 0; i < z.length; i++){ if (!Number.isFinite(z[i]) || !inRoi(i)) continue; zs.push(z[i]); if (Number.isFinite(sl[i])){ ss.push(sl[i]); tr.push(tri[i]); if (sl[i] > 2) aw[Math.floor(as[i]/10) % 36] += 1; } }
  if (!zs.length) throw new Error("No valid elevations");
  const zmin = minOf(zs), zmax = maxOf(zs), zmean = mean(zs);
  let sd = 0; for (const v of zs) sd += (v-zmean)**2; sd = Math.sqrt(sd/zs.length);
  const HI = (zmean - zmin)/(zmax - zmin);
  const zsorted = Float64Array.from(zs).sort(), hyp = [];
  for (let t = 0; t <= 1.0001; t += .02){ const lvl = zmin + t*(zmax-zmin); let lo = 0, hi = zsorted.length; while (lo < hi){ const md = (lo+hi)>>1; if (zsorted[md] < lvl) lo = md+1; else hi = md; } hyp.push(1 - lo/zsorted.length); }
  G.terr = {zmin, zmax, HI, zmean};
  showRes("terrain", [
    SEC("Elevation"),
    R("Minimum", U.N(zmin, 1, "m")), R("Maximum", U.N(zmax, 1, "m")), R("Mean", U.N(zmean, 1, "m")), R("Std. deviation", U.N(sd, 1, "m")),
    R("Relief", U.N(zmax-zmin, 1, "m")),
    R("Hypsometric integral", U.N(HI, 3), HI > .6 ? "youthful, little-eroded (convex)" : HI < .35 ? "mature or old, well dissected (concave)" : "equilibrium (S-shaped)"),
    SEC("Slope"),
    R("Mean slope", {v:mean(ss), u:"°", s:fx(mean(ss), 1) + "°"}), R("Median slope", {v:median(ss), u:"°", s:fx(median(ss), 1) + "°"}), R("90th percentile", {v:quantile(ss, .9), u:"°", s:fx(quantile(ss, .9), 1) + "°"}),
    R("Area steeper than 15°", U.P(ss.filter(v => v > 15).length/ss.length)), R("Area steeper than 30°", U.P(ss.filter(v => v > 30).length/ss.length), "landslide- and rockfall-prone terrain"),
    R("Terrain ruggedness (TRI)", U.N(mean(tr), 2, "m"), "Riley et al. 1999"),
    R("Surface area ÷ planimetric area", U.N(mean(ss.map(s => 1/Math.cos(s*Math.PI/180))), 3)),
  ], `<canvas class="chart" id="chHyp"></canvas><canvas class="chart" id="chSl"></canvas><canvas class="rose" id="chAsp"></canvas><p class="note" style="text-align:center">Aspect: the direction slopes face (cells steeper than 2°)</p>`);
  chart($("chHyp"), {title:"Hypsometric curve", xlab:"relative area above (a/A)", ylab:"relative height (h/H)", series:[{x:hyp, y:hyp.map((_, i) => i*.02), color:"#ff7a45"}], xmin:0, xmax:1, ymin:0, ymax:1});
  histChart($("chSl"), ss, 30, {title:"Slope distribution", xlab:"slope (°)"});
  rose($("chAsp"), aw.map((_, i) => i*10 + 5), aw, false);
  G.tables.hypsometry = hyp.map((a, i) => ({rel_height:i*.02, rel_area:a}));
}
function updateThrA(){
  const v = +$("thrA").value; const cells = Math.round(Math.pow(10, 1 + v/1000*4)); G.thrCells = cells;
  $("thrAO").textContent = G.pxm ? U.A(cells).s : cells + " cells";
}
$("thrA").addEventListener("input", updateThrA);
$("btnHydro").onclick = () => busy("Routing flow across the DEM…", () => { runHydro(); });
function runHydro(){
  const {z, dx, dy} = demZ(), w = G.w, h = G.h, N = w*h;
  const {F, order} = priorityFlood(z, w, h);
  const {rcv, rd} = d8(F, w, h, dx, dy);
  const acc = new Float64Array(N);
  for (let t = order.length-1; t >= 0; t--){ const i = order[t]; acc[i] += 1; if (rcv[i] >= 0) acc[rcv[i]] += acc[i]; }
  const thr = G.thrCells || 1000, cellA = dx*dy;
  const stream = new Uint8Array(N); for (let i = 0; i < N; i++) if (acc[i] >= thr && Number.isFinite(z[i])) stream[i] = 1;
  // Strahler (process upstream → downstream)
  const ord = new Uint8Array(N), maxIn = new Uint8Array(N), cntMax = new Uint8Array(N);
  for (let t = order.length-1; t >= 0; t--){
    const i = order[t]; if (!stream[i]) continue;
    const o = maxIn[i] === 0 ? 1 : (cntMax[i] >= 2 ? maxIn[i]+1 : maxIn[i]); ord[i] = o;
    const r = rcv[i]; if (r >= 0 && stream[r]){ if (o > maxIn[r]){ maxIn[r] = o; cntMax[r] = 1; } else if (o === maxIn[r]) cntMax[r]++; }
  }
  // outlet
  let out = -1;
  if (G.outlet){
    let best = -1; const ox = Math.round(G.outlet[0]), oy = Math.round(G.outlet[1]), R0 = 15;
    for (let y = Math.max(0, oy-R0); y <= Math.min(h-1, oy+R0); y++) for (let x = Math.max(0, ox-R0); x <= Math.min(w-1, ox+R0); x++){ const i = y*w+x; if (acc[i] > best){ best = acc[i]; out = i; } }
  }
  if (out < 0){ let best = -1; for (let i = 0; i < N; i++) if (acc[i] > best){ best = acc[i]; out = i; } }
  const basin = new Uint8Array(N); basin[out] = 1;
  for (let t = 0; t < order.length; t++){ const i = order[t]; if (rcv[i] >= 0 && basin[rcv[i]]) basin[i] = 1; }
  // basin stats
  let bA = 0, bz = [], perim = 0, Lmax = 0; const ox = out % w, oy = (out/w)|0;
  for (let i = 0; i < N; i++){
    if (!basin[i]) continue; bA++; bz.push(z[i]);
    const x = i % w, y = (i/w)|0;
    if (x === 0 || !basin[i-1]) perim += dy; if (x === w-1 || !basin[i+1]) perim += dy;
    if (y === 0 || !basin[i-w]) perim += dx; if (y === h-1 || !basin[i+w]) perim += dx;
    const d = Math.hypot((x-ox)*dx, (y-oy)*dy); if (d > Lmax) Lmax = d;
  }
  perim *= Math.PI/4;
  const area = bA*cellA, bmin = minOf(bz), bmax = maxOf(bz), bmean = mean(bz);
  // streams in basin: length, Horton
  let sLen = 0; const No = [], Lo = [];
  for (let i = 0; i < N; i++){
    if (!stream[i] || !basin[i]) continue; const o = ord[i];
    sLen += rd[i] || 0; Lo[o] = (Lo[o] || 0) + (rd[i] || 0);
    if (maxIn[i] < o) No[o] = (No[o] || 0) + 1;
  }
  const maxO = No.length - 1, Rb = [], Rl = [];
  for (let u = 1; u < maxO; u++){ if (No[u] && No[u+1]){ Rb.push(No[u]/No[u+1]); Rl.push((Lo[u+1]/No[u+1])/(Lo[u]/No[u])); } }
  // main stem: walk upstream along max accumulation
  const stem = [], prof = []; let c = out, dist = 0;
  const donorsMax = i => { const x = i % w, y = (i/w)|0; let b = -1, ba = 0; for (const [ex, ey] of NB8){ const nx = x+ex, ny = y+ey; if (nx<0||ny<0||nx>=w||ny>=h) continue; const n = ny*w+nx; if (rcv[n] === i && acc[n] > ba){ ba = acc[n]; b = n; } } return b; };
  while (c >= 0){ stem.push(c); const n = donorsMax(c); if (n < 0) break; c = n; }
  stem.reverse(); // head → outlet
  for (let t = 0; t < stem.length; t++){ const i = stem[t]; if (t) dist += rd[stem[t-1]]; prof.push({d:dist, z:z[i], A:acc[i]*cellA}); }
  const Lstem = dist;
  // slope–area on basin stream cells
  const SA = [];
  for (let i = 0; i < N; i++){
    if (!stream[i] || !basin[i]) continue;
    let j = i, L = 0; for (let k = 0; k < 6 && rcv[j] >= 0; k++){ L += rd[j]; j = rcv[j]; }
    if (L <= 0) continue; const S = (z[i] - z[j])/L; if (S > 1e-5) SA.push([acc[i]*cellA, S]);
  }
  const bins = {}; for (const [A, S] of SA){ const k = Math.round(Math.log10(A)*10); (bins[k] = bins[k] || []).push(S); }
  const bx = [], by = []; for (const k of Object.keys(bins).map(Number).sort((a, b) => a-b)) if (bins[k].length >= 5){ bx.push(k/10); by.push(Math.log10(median(bins[k]))); }
  const saf = linfit(bx, by), theta = -saf.b, ks = Math.pow(10, saf.a), ksn = median(SA.map(([A, S]) => S*Math.pow(A, .45)));
  const relief = bmax - bmin;
  // vector stream lines for drawing: trace each stream from its head downstream until it meets a visited cell
  const seenS = new Uint8Array(N), slines = [];
  for (let t = order.length-1; t >= 0; t--){
    const i = order[t]; if (!stream[i] || maxIn[i] !== 0 || seenS[i]) continue;
    let c2 = i, pts = [], o = ord[i];
    while (c2 >= 0 && stream[c2]){
      pts.push([c2 % w, (c2/w)|0]);
      if (ord[c2] !== o && pts.length > 1){ slines.push({pts: pts.slice(), order: o}); pts = [pts[pts.length-1]]; o = ord[c2]; }
      if (seenS[c2]) break; seenS[c2] = 1; c2 = rcv[c2];
    }
    if (pts.length > 1) slines.push({pts, order: o});
  }
  G.hydro = {ord: ord.map((o, i) => basin[i] ? o : (o ? 1 : 0)), basin, stem: stem.map(i => [i % w, (i/w)|0]), lines: slines, maxO, area, relief, theta, ksn, HIb: (bmean-bmin)/relief, dd: sLen/1000/(area/1e6), Lmax, nb: bx.length};
  G.hydro.ord = ord; // show all streams
  G.lay.streams = true;
  showRes("hydro", [
    SEC("Basin above outlet"),
    R("Drainage area", U.A(bA)), R("Perimeter", U.L(perim/(G.pxm||1))),
    R("Basin length", U.L(Lmax/(G.pxm||1)), "outlet to farthest point"),
    R("Relief", U.N(relief, 1, "m")), R("Relief ratio", U.N(relief/Lmax, 4), "relief ÷ basin length"),
    R("Hypsometric integral", U.N((bmean-bmin)/relief, 3)),
    R("Elongation ratio", U.N(2*Math.sqrt(area/Math.PI)/Lmax, 3), "1 = circular basin"),
    R("Circularity ratio", U.N(4*Math.PI*area/(perim*perim), 3)),
    SEC("Drainage network"),
    R("Stream threshold", U.A(thr), "minimum contributing area for a channel"),
    R("Highest Strahler order", U.N(maxO, 0)),
    R("Total stream length", U.L(sLen/(G.pxm||1))),
    R("Drainage density", U.N(sLen/1000/(area/1e6), 2, "km/km²")),
    R("Bifurcation ratio Rb", U.N(geomean(Rb), 2)), R("Length ratio RL", U.N(geomean(Rl), 2)),
    SEC("Main stem & river incision"),
    R("Main stem length", U.L(Lstem/(G.pxm||1))), R("Main stem drop", U.N(prof[0].z - prof[prof.length-1].z, 1, "m")),
    R("Mean channel gradient", U.N((prof[0].z - prof[prof.length-1].z)/Lstem*1000, 2, "m/km")),
    R("Concavity θ", U.N(theta, 3), `from slope–area regression S = kₛA^−θ (R² = ${fx(saf.r2, 2)}); typically 0.3–0.7`),
    R("Steepness kₛ", U.N(ks, 2)),
    R("Normalised steepness kₛₙ (θref 0.45)", U.N(ksn, 1, "m⁰·⁹"), "higher = faster rock uplift or more resistant rock"),
  ], `<canvas class="chart" id="chLP"></canvas><canvas class="chart" id="chSA"></canvas>`);
  chart($("chLP"), {title:"Main stem long profile", xlab:"distance from head (m)", ylab:"elevation (m)", series:[{x:prof.map(p => p.d), y:prof.map(p => p.z), color:"#3fc1d3"}]});
  chart($("chSA"), {title:"Slope–area (binned medians)", xlab:"drainage area (m²)", ylab:"slope (m/m)", logx:true, logy:true,
    series:[{x:SA.filter((_, i) => i % Math.ceil(SA.length/1500) === 0).map(p => p[0]), y:SA.filter((_, i) => i % Math.ceil(SA.length/1500) === 0).map(p => p[1]), color:"rgba(158,202,225,.3)", dots:true, r:1.3}, {x:bx.map(v => Math.pow(10, v)), y:by.map(v => Math.pow(10, v)), color:"#ff7a45", dots:true}]});
  G.tables.longProfile = prof.map(p => ({distance_m:p.d, elevation_m:p.z, drainage_area_m2:p.A}));
  rebuildOverlay();
}

/* ---------------- change detection ---------------- */

let flickT = 0;
$("btnChange").onclick = () => busy("Comparing dates…", () => { analyzeChange(); });
function shiftMask(m, w, h, dx, dy){
  if (!dx && !dy) return m; const o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++){ const sy = y - dy; if (sy < 0 || sy >= h) continue; for (let x = 0; x < w; x++){ const sx = x - dx; if (sx >= 0 && sx < w) o[y*w+x] = m[sy*w+sx]; } }
  return o;
}
function biggestOrOutlet(m){
  const {L, comps} = label(m, G.w, G.h); if (!comps.length) return new Uint8Array(m.length);
  let id = 0; if (G.outlet){ const q = nearestOn(m, G.w, G.h, G.outlet[0], G.outlet[1], 60); if (q >= 0) id = L[q]; }
  if (!id) id = comps.reduce((a, b) => b.area > a.area ? b : a).id;
  const o = new Uint8Array(m.length); for (let i = 0; i < o.length; i++) o[i] = L[i] === id ? 1 : 0; return o;
}
function boundary(m, w, h){ const b = new Uint8Array(m.length); for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++){ const i = y*w+x; if (m[i] && (!m[i-1] || !m[i+1] || !m[i-w] || !m[i+w])) b[i] = 1; } return b; }
function analyzeChange(){
  if (!G.mask) throw new Error("Detect water on the first image first");
  if (!G.DB) throw new Error("Load the later image first");
  const w = G.w, h = G.h, A = G.mask;
  let B = classify(G.DB, {autoThr: $("bAuto").checked});
  B = shiftMask(B, w, h, +$("bdx").value, +$("bdy").value);
  const r = roiOrFull(), map = new Uint8Array(w*h);
  let aA = 0, aB = 0, ero = 0, acc = 0;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++){
    const i = y*w+x; if (G.excl[i]) continue;
    if (A[i]) aA++; if (B[i]) aB++;
    if (B[i] && !A[i]){ ero++; map[i] = 1; } else if (A[i] && !B[i]){ acc++; map[i] = 2; }
  }
  const nA = biggestOrOutlet(A), nB = biggestOrOutlet(B);
  const hwA = edtTo(notMask(nA), w, h);
  const skA = pruneSkeleton(thin(nA, w, h), w, h, hwA, 1.5, []), skB = pruneSkeleton(thin(nB, w, h), w, h, edtTo(notMask(nB), w, h), 1.5, []);
  const dA = edtTo(skA, w, h), dB = edtTo(skB, w, h), disp = [], dispR = [], widths = [];
  for (let i = 0; i < skB.length; i++) if (skB[i]) disp.push(dA[i]);
  for (let i = 0; i < skA.length; i++) if (skA[i]){ dispR.push(dB[i]); widths.push(2*hwA[i]-1); }
  const bA = boundary(A, w, h), bB = boundary(B, w, h), dbA = edtTo(bA, w, h), sh = [];
  for (let i = 0; i < bB.length; i++) if (bB[i]) sh.push(dbA[i]);
  const yrs = (parseFloat($("yrB").value) - parseFloat($("yrA").value));
  const per = Number.isFinite(yrs) && yrs > 0 ? yrs : null;
  const mig = (median(disp) + median(dispR))/2, W = median(widths);
  let skLen = 0; for (const v of skA) skLen += v;
  const rate = (o, d) => per ? R(o.k + " per year", {v:o.v/per, u:o.u + "/yr", s:(o.isArea ? U.A(d/per).s : U.L(d/per).s) + "/yr"}) : null;
  G.change = {map, mig, years: per, W};
  G.lay.change = true; document.querySelector('.lay[data-k="change"]').classList.add("on");
  const dAreaRow = R("Water area change", {v:(aB-aA)*(G.pxm ? G.pxm**2 : 1), u:G.pxm ? "m²" : "px²", s:(aB >= aA ? "+" : "−") + U.A(Math.abs(aB-aA)).s + ` (${(100*(aB-aA)/Math.max(1, aA)).toFixed(1)}%)`});
  showRes("change", [
    SEC("Area"),
    R("Water, first date", U.A(aA)), R("Water, later date", U.A(aB)), dAreaRow,
    R("Land became water (erosion / flooding)", U.A(ero), "red on the map"),
    R("Water became land (deposition / drying)", U.A(acc), "green on the map"),
    per ? R("Gross area change per year", {v:(ero+acc)/per, u:"", s:U.A((ero+acc)/per).s + "/yr"}) : null,
    SEC("Channel migration"),
    R("Median centreline shift", U.L(mig), "average of the A→B and B→A median distances between centrelines"),
    R("90th percentile shift", U.L(quantile(disp, .9))),
    per ? R("Migration rate", {v:mig*(G.pxm||1)/per, u:lenUnit() + "/yr", s:U.L(mig/per).s + "/yr"}) : null,
    per ? R("Migration rate ÷ channel width", U.N(mig/W/per, 3, "widths/yr"), "rivers typically migrate 0.01–0.1 widths per year; faster suggests very active banks") : null,
    R("Area-based migration", U.L((ero+acc)/(2*Math.max(1, skLen))), "(eroded + deposited area) ÷ (2 × centreline length)"),
    SEC("Shoreline / bank lines"),
    R("Median edge displacement", U.L(median(sh))), R("Mean edge displacement", U.L(mean(sh))),
    per ? R("Edge change rate", {v:median(sh)*(G.pxm||1)/per, u:lenUnit() + "/yr", s:U.L(median(sh)/per).s + "/yr"}) : null,
    !per ? R("Rates", {v:NaN, u:"", s:"enter both years"}) : null,
  ], `<p class="note">Check alignment: switch on "show later image" and flick it on and off. If features jump, use the nudge sliders. Clouds, tides and seasons all change apparent water extent.</p>`);
  rebuildOverlay();
}

/* ---------------- manual measurement ---------------- */
function updateCurLabel(){ if (G.cur) G.cur.label = shapeLabel(G.cur); }
function polyLen(p){ let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return s; }
function polyArea(p){ let s = 0; for (let i = 0; i < p.length; i++){ const a = p[i], b = p[(i+1) % p.length]; s += a[0]*b[1] - b[0]*a[1]; } return Math.abs(s)/2; }
function shapeLabel(m){ return m.type === "line" ? U.L(polyLen(m.pts)).s : m.pts.length >= 3 ? U.A(polyArea(m.pts)).s : ""; }
function finishShape(){
  if (!G.cur) return;
  if ((G.cur.type === "line" && G.cur.pts.length >= 2) || (G.cur.type === "poly" && G.cur.pts.length >= 3)){ G.cur.label = shapeLabel(G.cur); G.meas.push(G.cur); }
  G.cur = null; renderMeasures(); requestDraw();
}
$("btnFinish").onclick = finishShape;
$("btnUndoPt").onclick = () => { if (G.cur){ G.cur.pts.pop(); if (!G.cur.pts.length) G.cur = null; else updateCurLabel(); } else G.meas.pop(); renderMeasures(); requestDraw(); };
$("btnClearMeas").onclick = () => { G.meas = []; G.cur = null; renderMeasures(); requestDraw(); };
function renderMeasures(){
  const rows = [];
  G.meas.forEach((m, i) => {
    if (m.type === "line"){
      const L = polyLen(m.pts), a = m.pts[0], b = m.pts[m.pts.length-1], st = Math.hypot(b[0]-a[0], b[1]-a[1]);
      rows.push(SEC("Line " + (i+1)), R("Length", U.L(L)), R("Straight distance", U.L(st)), R("Sinuosity", U.N(L/Math.max(st, 1e-9), 3)), R("Bearing start → end", U.D(AZ(b[0]-a[0], b[1]-a[1]))));
      if (G.D.dem){
        const zs = sampleLine(m.pts); const v = zs.filter(p => Number.isFinite(p.z));
        if (v.length > 1){ const zmx = Math.max(...v.map(p => p.z)), zmn = Math.min(...v.map(p => p.z)); rows.push(R("Relief along line", U.N(zmx-zmn, 1, "m")), R("Mean gradient", U.N(Math.abs(v[v.length-1].z - v[0].z)/(L*(G.pxm||1))*100, 2, "%"))); m.prof = v; }
      }
    } else {
      const A = polyArea(m.pts), P = polyLen(m.pts.concat([m.pts[0]]));
      rows.push(SEC("Polygon " + (i+1)), R("Area", U.A(A)), R("Perimeter", U.L(P)), R("Circularity", U.N(4*Math.PI*A/(P*P), 3)), R("Equivalent diameter", U.L(2*Math.sqrt(A/Math.PI))));
    }
  });
  if (!rows.length){ $("res-measure").innerHTML = '<p class="note">No shapes yet.</p>'; G.results.measure = []; return; }
  const profs = G.meas.map((m, i) => m.prof ? `<canvas class="chart" id="mp${i}"></canvas>` : "").join("");
  showRes("measure", rows, profs);
  G.meas.forEach((m, i) => { if (m.prof) chart($("mp" + i), {title:"Elevation profile, line " + (i+1), xlab:"distance (" + lenUnit() + ")", ylab:"elevation (m)", series:[{x:m.prof.map(p => p.d*(G.pxm||1)), y:m.prof.map(p => p.z), color:"#e8c547"}]}); });
}
function sampleLine(pts){
  const out = []; let d = 0;
  for (let i = 1; i < pts.length; i++){
    const [ax, ay] = pts[i-1], [bx, by] = pts[i], L = Math.hypot(bx-ax, by-ay), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k < n; k++){ const t = k/n, x = Math.round(ax + (bx-ax)*t), y = Math.round(ay + (by-ay)*t); out.push({d: d + L*t, z: G.D.dem[y*G.w + x]}); }
    d += L;
  }
  return out;
}

/* ---------------- charts ---------------- */
function setupCanvas(cv){ const r = cv.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return null; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(10, r.width*dpr); cv.height = Math.max(10, r.height*dpr); const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, r.width, r.height]; }
function niceTicks(a, b, n){ const span = b - a || 1, st = Math.pow(10, Math.floor(Math.log10(span/n))), err = span/n/st, step = st*(err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1), t = []; for (let v = Math.ceil(a/step)*step; v <= b + 1e-9; v += step) t.push(+v.toPrecision(10)); return t; }
const tfmt = v => Math.abs(v) >= 1000 && Math.abs(v) < 1e5 && Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v) ? v.toExponential(0) : +v.toPrecision(3) + "";
function chart(cv, o){
  if (!cv) return; const sc0 = setupCanvas(cv); if (!sc0){ cv._pending = () => chart(cv, o); return; } const [c, W, H] = sc0, m = {l:46, r:10, t:22, b:30};
  const xs = o.series.flatMap(s => s.x).filter(v => Number.isFinite(v) && (!o.logx || v > 0)), ys = o.series.flatMap(s => s.y).filter(v => Number.isFinite(v) && (!o.logy || v > 0));
  if (!xs.length || !ys.length) return;
  const tx = v => o.logx ? Math.log10(v) : v, ty = v => o.logy ? Math.log10(v) : v;
  let x0 = o.xmin ?? Math.min(...xs.map(tx)), x1 = o.xmax ?? Math.max(...xs.map(tx)), y0 = o.ymin ?? Math.min(...ys.map(ty)), y1 = o.ymax ?? Math.max(...ys.map(ty));
  if (o.zero){ const a = Math.max(Math.abs(y0), Math.abs(y1)); y0 = -a; y1 = a; }
  if (o.xmin === undefined && o.xmax === undefined){ const p = (x1 - x0)*.04; x0 -= p; x1 += p; }
  if (o.ymin === undefined && o.ymax === undefined){ const p = (y1 - y0)*.06; y0 -= p; y1 += p; }
  if (x1 === x0){ x1 += 1; x0 -= 1; } if (y1 === y0){ y1 += 1; y0 -= 1; }
  const px = v => m.l + (tx(v) - x0)/(x1 - x0)*(W - m.l - m.r), py = v => H - m.b - (ty(v) - y0)/(y1 - y0)*(H - m.t - m.b);
  c.font = "10px JetBrains Mono, monospace"; c.fillStyle = "#8b929a"; c.strokeStyle = "#2a2e33"; c.lineWidth = 1;
  for (const v of niceTicks(x0, x1, 5)){ const X = m.l + (v - x0)/(x1 - x0)*(W - m.l - m.r); c.beginPath(); c.moveTo(X, m.t); c.lineTo(X, H - m.b); c.stroke(); c.textAlign = "center"; c.fillText(o.logx ? tfmt(Math.pow(10, v)) : tfmt(v), X, H - m.b + 12); }
  for (const v of niceTicks(y0, y1, 4)){ const Y = H - m.b - (v - y0)/(y1 - y0)*(H - m.t - m.b); c.beginPath(); c.moveTo(m.l, Y); c.lineTo(W - m.r, Y); c.stroke(); c.textAlign = "right"; c.fillText(o.logy ? tfmt(Math.pow(10, v)) : tfmt(v), m.l - 4, Y + 3); }
  c.textAlign = "left"; c.fillStyle = "#eef0f2"; c.font = "11.5px Space Grotesk, sans-serif"; c.fillText(o.title || "", m.l, 14);
  c.fillStyle = "#8b929a"; c.font = "10.5px Space Grotesk, sans-serif"; c.textAlign = "center"; c.fillText(o.xlab || "", (m.l + W - m.r)/2, H - 3);
  c.save(); c.translate(10, (m.t + H - m.b)/2); c.rotate(-Math.PI/2); c.fillText(o.ylab || "", 0, 0); c.restore();
  if (o.zero){ c.strokeStyle = "#555"; c.beginPath(); c.moveTo(m.l, py(0)); c.lineTo(W - m.r, py(0)); c.stroke(); }
  for (const s of o.series){
    c.strokeStyle = s.color; c.fillStyle = s.color; c.globalAlpha = s.alpha || 1; c.lineWidth = 1.5;
    if (s.dots){ for (let i = 0; i < s.x.length; i++){ if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i]) || (o.logx && s.x[i] <= 0) || (o.logy && s.y[i] <= 0)) continue; c.beginPath(); c.arc(px(s.x[i]), py(s.y[i]), s.r || 3, 0, 7); c.fill(); } }
    else { c.beginPath(); let st = false; const stp = Math.max(1, Math.floor(s.x.length/1500)); for (let i = 0; i < s.x.length; i += stp){ const X = s.x[i], Y = s.y[i]; if (!Number.isFinite(X) || !Number.isFinite(Y) || (o.logx && X <= 0) || (o.logy && Y <= 0)){ st = false; continue; } st ? c.lineTo(px(X), py(Y)) : c.moveTo(px(X), py(Y)); st = true; } c.stroke(); }
    c.globalAlpha = 1;
  }
  if (o.mark){ c.strokeStyle = "#ff7a45"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(px(o.mark), m.t); c.lineTo(px(o.mark), H - m.b); c.stroke(); c.setLineDash([]); }
}
function histChart(cv, vals, nb, o){
  const v = vals.filter(Number.isFinite); if (!v.length || !cv) return;
  const a = quantile(v, 0), b = quantile(v, .995), wdt = (b - a)/nb || 1, cnt = new Array(nb).fill(0);
  for (const x of v) cnt[Math.min(nb-1, Math.max(0, Math.floor((x - a)/wdt)))]++;
  const sc0 = setupCanvas(cv); if (!sc0){ cv._pending = () => histChart(cv, vals, nb, o); return; } const [c, W, H] = sc0, m = {l:40, r:10, t:22, b:30}, mx = Math.max(...cnt);
  c.fillStyle = "#eef0f2"; c.font = "11.5px Space Grotesk, sans-serif"; c.fillText(o.title || "", m.l, 14);
  for (let i = 0; i < nb; i++){ const x = m.l + i/nb*(W - m.l - m.r), bh = cnt[i]/mx*(H - m.t - m.b); c.fillStyle = "#3fc1d3"; c.fillRect(x + 1, H - m.b - bh, (W - m.l - m.r)/nb - 2, bh); }
  c.fillStyle = "#8b929a"; c.font = "10px JetBrains Mono, monospace"; c.textAlign = "center";
  for (const t of niceTicks(a, b, 5)){ const X = m.l + (t - a)/(b - a || 1)*(W - m.l - m.r); c.fillText(tfmt(t), X, H - m.b + 12); }
  c.font = "10.5px Space Grotesk, sans-serif"; c.fillText(o.xlab || "", (m.l + W - m.r)/2, H - 3);
  c.textAlign = "right"; c.fillText(mx, m.l - 4, m.t + 8); c.fillText("0", m.l - 4, H - m.b);
}
function rose(cv, angles, weights, axial, binned){
  if (!cv) return; const sc0 = setupCanvas(cv); if (!sc0){ cv._pending = () => rose(cv, angles, weights, axial, binned); return; } const [c, W, H] = sc0, cx = W/2, cy = H/2, R0 = Math.max(10, Math.min(W, H)/2 - 18);
  const nb = 36, bins = new Array(nb).fill(0), span = axial ? 180 : 360;
  angles.forEach((a, i) => { const k = Math.floor(((a % span) + span) % span/(span/nb)) % nb; bins[k] += weights ? weights[i] : 1; });
  const mx = Math.max(...bins) || 1;
  c.strokeStyle = "#2a2e33"; for (const f of [.33, .66, 1]){ c.beginPath(); c.arc(cx, cy, R0*f, 0, 7); c.stroke(); }
  c.fillStyle = "#8b929a"; c.font = "10px JetBrains Mono, monospace"; c.textAlign = "center";
  c.fillText("N", cx, cy - R0 - 5); c.fillText("S", cx, cy + R0 + 13); c.fillText("E", cx + R0 + 9, cy + 4); c.fillText("W", cx - R0 - 9, cy + 4);
  const draw1 = (k, off) => { const a0 = (k*span/nb + off - 90)*Math.PI/180, a1 = ((k+1)*span/nb + off - 90)*Math.PI/180, r = Math.sqrt(bins[k]/mx)*R0; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a0, a1); c.closePath(); c.fill(); };
  c.fillStyle = "rgba(255,122,69,.85)";
  for (let k = 0; k < nb; k++){ draw1(k, 0); if (axial) draw1(k, 180); }
}

/* ---------------- export ---------------- */
let downloads = null;
if (window.claude && window.claude.use) window.claude.use("downloads").then(d => downloads = d).catch(() => {});
else downloads = {save: async ({filename, data}) => { const b = data instanceof Blob ? data : new Blob([data], {type: "text/plain"}), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }}; // standalone (e.g. GitHub Pages): ordinary browser download
async function save(name, data){
  if (downloads){
    try { await downloads.save({filename:name, data}); toast("Saved " + name); return; }
    catch (e){ if (e && e.code === "declined") return; if (e && ["unavailable","not_granted","capability_disabled","capability_removed"].includes(e.code)) downloads = null; else { toast("Save failed: " + (e.code || e.message)); } }
  }
  if (typeof data === "string"){
    modal(`<h3>${name}</h3><p class="note">Downloading isn't available here. Copy the text instead.</p><textarea id="cpTxt"></textarea><div class="btns"><button class="pri" id="cpBtn">Copy</button><button id="cpClose">Close</button></div>`);
    $("cpTxt").value = data; $("cpBtn").onclick = async () => { try { await navigator.clipboard.writeText(data); toast("Copied"); } catch(e){ $("cpTxt").select(); toast("Select all and copy"); } };
    $("cpClose").onclick = closeModal;
  } else {
    const u = URL.createObjectURL(data);
    modal(`<h3>${name}</h3><p class="note">Press and hold the image to save it.</p><img src="${u}" style="max-width:100%;border-radius:8px"><div class="btns"><button id="cpClose">Close</button></div>`);
    $("cpClose").onclick = closeModal;
  }
}
const csvEsc = v => { const s = typeof v === "number" ? (Number.isFinite(v) ? +v.toPrecision(8) + "" : "") : String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = rows => { if (!rows || !rows.length) return ""; const keys = Object.keys(rows[0]); return keys.join(",") + "\n" + rows.map(r => keys.map(k => csvEsc(r[k])).join(",")).join("\n"); };
const base = () => (G.D && G.D.name ? G.D.name.replace(/\.[^.]+$/, "") : "earthform-lens").replace(/[^\w-]+/g, "_");
function allMetrics(){
  const out = [];
  for (const [mod, rows] of Object.entries(G.results)) for (const r of rows) out.push({module:mod, metric:r.k, value:Number.isFinite(r.v) ? r.v : "", unit:r.u || "", display:r.s, note:r.n || ""});
  return out;
}
$("exMetrics").onclick = () => { const m = allMetrics(); if (!m.length) return toast("Run an analysis first"); save(base() + "-metrics.csv", toCSV([{module:"setup", metric:"scale", value:G.pxm || "", unit:"m/px", display:G.pxSrc, note:""}].concat(m))); };
$("exLakes").onclick = () => G.tables.lakes ? save(base() + "-lakes.csv", toCSV(G.tables.lakes)) : toast("Run the lake analysis first");
$("exProfiles").onclick = () => {
  const parts = [];
  if (G.tables.widthProfile) parts.push("# channel width & curvature profile\n" + toCSV(G.tables.widthProfile));
  if (G.tables.bends) parts.push("# meander bends\n" + toCSV(G.tables.bends));
  if (G.tables.longProfile) parts.push("# DEM main-stem long profile\n" + toCSV(G.tables.longProfile));
  if (G.tables.hypsometry) parts.push("# hypsometric curve\n" + toCSV(G.tables.hypsometry));
  if (G.tables.cover) parts.push("# surface cover classes\n" + toCSV(G.tables.cover));
  if (!parts.length) return toast("Run channel, terrain or cover analyses first");
  save(base() + "-profiles.csv", parts.join("\n\n"));
};
$("exJSON").onclick = () => save(base() + "-report.json", JSON.stringify({file: G.D && G.D.name, scale_m_per_px: G.pxm, scale_source: G.pxSrc, north_offset_deg: G.north, analysis_area: G.roi, outlet: G.outlet, head: G.head, metrics: allMetrics(), tables: G.tables, generated: new Date().toISOString(), tool: "Earthform Lens"}, null, 1));
$("exPNG").onclick = async () => {
  if (!G.D) return;
  const c = document.createElement("canvas"); c.width = G.w; c.height = G.h; const x = c.getContext("2d");
  x.drawImage(baseCanvas, 0, 0); x.drawImage(ovCanvas, 0, 0);
  const save0 = {...G.view}, sv = view; // reuse vector drawing by temporarily drawing into export canvas
  const lw = Math.max(1, G.w/900);
  const pl = (pts, col, wd) => { if (pts.length < 2) return; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.strokeStyle = col; x.lineWidth = wd*lw; x.stroke(); };
  if (G.chan){ pl(G.chan.pts, "#000", 4); pl(G.chan.pts, "#ff7a45", 2.5); }
  if (G.hydro && G.hydro.stem){ pl(G.hydro.stem, "#000", 4); pl(G.hydro.stem, "#ff7a45", 2.5); }
  for (const m of G.meas) pl(m.type === "poly" ? m.pts.concat([m.pts[0]]) : m.pts, "#e8c547", 2);
  if (G.pxm){ const target = G.w/6, mm = target*G.pxm, p10 = Math.pow(10, Math.floor(Math.log10(mm))), nice = [1,2,5,10].map(k => k*p10).filter(k => k <= mm).pop(); const wp = nice/G.pxm;
    x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(10*lw, G.h - 40*lw, wp + 20*lw, 32*lw); x.fillStyle = "#fff"; x.fillRect(20*lw, G.h - 18*lw, wp, 4*lw); x.font = `${12*lw}px sans-serif`; x.fillText(nice >= 1000 ? nice/1000 + " km" : nice + " m", 20*lw, G.h - 23*lw); }
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  save(base() + "-map.png", blob);
};
$("methods").innerHTML = `
<p><b>Water mask:</b> colour-distance (CIELAB ΔE) to your samples, or a threshold on a spectral index (Otsu automatic). Cleaned with morphological opening/closing, hole filling and removal of specks.</p>
<p><b>Centreline:</b> Zhang–Suen thinning with spur pruning scaled to the local channel width. Widths come from the Euclidean distance transform (2d − 1). The main channel is the shortest path along the skeleton from outlet to head.</p>
<p><b>Meanders:</b> Gaussian-smoothed centreline curvature. Inflections are taken where the curvature changes sign, ignoring sign runs shorter than one channel width. Wavelength is the sum of two consecutive bend chords. Radius is 1 ÷ peak curvature in the bend.</p>
<p><b>Network:</b> skeleton graph with junction clusters merged; a breadth-first tree from the outlet; Strahler orders; Horton Rb and RL as geometric means; loops = links − tree links.</p>
<p><b>Lakes:</b> 8-connected components; perimeter from boundary edges × π/4; ellipse axes from second moments; axial orientation statistics; size–frequency exponent from a cumulative log–log fit; shoreline fractal dimension by box counting.</p>
<p><b>Pattern:</b> plane-detrended, Hann-windowed 2‑D FFT of brightness (or elevation). The dominant peak gives spacing and crest trend. Also a global structure tensor with an edge-orientation rose.</p>
<p><b>Terrain:</b> Horn slope and aspect; TRI; hypsometric integral. Hydrology uses priority-flood depression filling (Barnes et al. 2014), D8 flow routing and accumulation, Strahler orders, basin delineation, and slope–area regression for concavity θ and normalised steepness kₛₙ (θref = 0.45).</p>
<p><b>Change:</b> per-pixel water gain and loss; centreline and bank-line displacement from distance transforms; rates from the years you enter.</p>
<p class="warn">Limits: screenshots are compressed, re-coloured mosaics with no elevation. Treat widths under about 5 pixels and colour classes with caution. Bearings assume the image is north-up unless you set the offset in Setup. Web Mercator scale changes with latitude, so calibrate on each view.</p>`;

updateThrA();
/*AUTO*/
window.__labAPI = {linkInfo, makeFigure, labChanged, pixelFeatures, seafloorChannels, analyzeBranches, isBathymetry, depthProxy, buildFindings: (...a) => buildFindings(...a), renderSlide: (...a) => renderSlide(...a), enhanceToStudio, atlasEnhance, geometry, sendToStudio, autoArt, runAuto, autoWater, autoChrome, waterModel, label, edtTo, notMask, thin, nbCount, transferModel, waterProb, refineProb, ensureLab, connectToMain, tapAt, setTool, runWater, analyzeChannel, analyzeNetwork, analyzeLakes, analyzePattern, analyzeCover, analyzeTerrain, runHydro, analyzeChange, finishShape, setMode, fitView, showTab, rebuildOverlay};
})();
