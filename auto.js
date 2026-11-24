/* ===================== Automation, report & app shell ===================== */
const UIROW = .35;
function geometry(){
  const lines = [];
  if (G.hydro && G.hydro.lines) for (const l of G.hydro.lines) lines.push({pts:l.pts, order:l.order, wt:.5 + .5*l.order});
  if (G.net && G.net.lines) for (const l of G.net.lines) lines.push({pts:l.pts, order:l.order, wt:.6 + .55*l.order});
  if (G.chan) lines.push({pts:G.chan.pts, order:9, wt:2.6, main:true});
  else if (G.hydro && G.hydro.stem) lines.push({pts:G.hydro.stem, order:9, wt:2.4, main:true});
  return {lines};
}
function studioSource(){
  const D = G.D;
  if (D.img && !G.labelMask) return {img: D.img, f: D.img.naturalWidth/G.w};
  const c = document.createElement("canvas"); c.width = G.w; c.height = G.h;
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(D.rgba), G.w, G.h), 0, 0);
  return {img: c, f: 1};
}
function sendToStudio(keepLook){
  if (!G.D || !window.__studio) return;
  const s = studioSource();
  window.__studio.setSource(s.img, {f: s.f, roi: G.roi || null, keepLook: !!keepLook});
  if (keepLook) window.__studio.schedule();
}

/* ---------- 1. phone / map UI removal ---------- */
function autoChrome(){
  const D = G.D, w = G.w, h = G.h, c = D.rgba, ui = new Uint8Array(w*h), rowF = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = y*w+x, r = c[i*4], g = c[i*4+1], b = c[i*4+2], mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    if (mx - mn <= 12 && mx >= 12 && mx <= 62){ ui[i] = 1; rowF[y]++; }
  }
  for (let y = 0; y < h; y++) rowF[y] /= w;
  let top = 0, bot = h;
  for (let y = 0; y < Math.floor(h*.22); y++) if (rowF[y] > UIROW) top = y+1;
  for (let y = h-1; y > Math.floor(h*.7); y--) if (rowF[y] > UIROW) bot = y;
  if (top > 0) top = Math.min(h-10, top + Math.round(h*.004) + 2);
  if (bot < h) bot = Math.max(top+10, bot - Math.round(h*.004) - 2);
  // floating round buttons near the side edges
  let buttons = 0;
  const {L, comps} = label(ui, w, h);
  const amin = (w*.03)**2, amax = (w*.22)**2;
  for (const cp of comps){
    const bw = cp.x1-cp.x0+1, bh = cp.y1-cp.y0+1, cx = cp.sx/cp.area, cy = cp.sy/cp.area;
    if (cp.area < amin*.5 || bw*bh > amax || cy < top || cy > bot) continue;
    if (cp.area/(bw*bh) < .45 || Math.max(bw, bh)/Math.min(bw, bh) > 2.2) continue;
    if (!(cx > w*.78 || cx < w*.22)) continue;
    const pad = Math.round(Math.max(bw, bh)*.12) + 2;
    for (let y = Math.max(0, cp.y0-pad); y <= Math.min(h-1, cp.y1+pad); y++) for (let x = Math.max(0, cp.x0-pad); x <= Math.min(w-1, cp.x1+pad); x++){
      const dx = (x - (cp.x0+cp.x1)/2)/(bw/2+pad), dy = (y - (cp.y0+cp.y1)/2)/(bh/2+pad); if (dx*dx + dy*dy <= 1.05) G.excl[y*w+x] = 1;
    }
    buttons++;
  }
  // existing caption labels (white boxes with text, as in shared satellite posts)
  let labels = 0;
  const wm = new Uint8Array(w*h);
  for (let i = 0; i < w*h; i++){ const r = c[i*4], g = c[i*4+1], b = c[i*4+2]; if (Math.min(r,g,b) > 222 && Math.max(r,g,b) - Math.min(r,g,b) < 22) wm[i] = 1; }
  const wl = label(closing(wm, w, h, Math.max(4, Math.round(h/180))), w, h);
  for (const cp of wl.comps){
    const bw = cp.x1-cp.x0+1, bh = cp.y1-cp.y0+1;
    if (cp.area < w*h*.003 || bw < bh*2.5 || cp.area/(bw*bh) < .5 || cp.y0 < h*.55 && cp.y1 > h*.2) continue;
    for (let y = Math.max(0, cp.y0-4); y <= Math.min(h-1, cp.y1+4); y++) for (let x = Math.max(0, cp.x0-4); x <= Math.min(w-1, cp.x1+4); x++) G.excl[y*w+x] = 1;
    labels++;
  }
  // map text labels and scale bars (small, bright, neutral marks): painted over with surrounding colours so rivers aren't cut
  let txt = 0; G.scaleBar = null;
  { const bm = new Uint8Array(w*h); for (let i = 0; i < w*h; i++){ const r = c[i*4], g = c[i*4+1], b = c[i*4+2]; if (Math.min(r,g,b) > 222 && Math.max(r,g,b) - Math.min(r,g,b) < 26) bm[i] = 1; }
    const tl = label(bm, w, h), amax = w*h*.0015, lm = new Uint8Array(w*h);
    for (const cp of tl.comps){ const bh = cp.y1-cp.y0+1, bw = cp.x1-cp.x0+1;
      // scale bar: a long, thin horizontal line near an image corner
      if (bw > w*.08 && bh <= Math.max(8, h*.03) && cp.area/bw < 6 && bw > 3*bh && cp.y0 > h*.75 && (!G.scaleBar || bw > G.scaleBar.px)) G.scaleBar = {px: bw, x0: cp.x0, y: cp.y0};
      if (cp.area < 3 || cp.area > amax*(bw > w*.08 ? 4 : 1) || bh > h*.05 || cp.area/(bw*bh) > .85 && bw*bh > 400) continue;
      for (let y = Math.max(0, cp.y0-1); y <= Math.min(h-1, cp.y1+1); y++) for (let x = Math.max(0, cp.x0-1); x <= Math.min(w-1, cp.x1+1); x++) if (bm[y*w+x]) lm[y*w+x] = 1;
      txt++; }
    if (txt){ const dm = dilate(lm, w, h, 2.5); const nm = dilate(lm, w, h, 6), na = dilate(lm, w, h, 4); if (G.labelMask && G.labelMaskFor === G.D){ for (let i = 0; i < nm.length; i++){ if (nm[i]) G.labelMask[i] = 1; if (na[i]) G.labelArt[i] = 1; } } else { G.labelMask = nm; G.labelArt = na; G.labelMaskFor = G.D; } inpaint(G.D, dm); } }
  if (top > 0 || bot < h) G.roi = {x0:0, y0:top, x1:w, y1:bot};
  rebuildOverlay();
  const parts = [];
  if (top > 0 || bot < h) parts.push(`trimmed ${top ? "top bar" : ""}${top && bot < h ? " and " : ""}${bot < h ? "bottom toolbar" : ""}`);
  if (buttons) parts.push(`masked ${buttons} floating button${buttons > 1 ? "s" : ""}`);
  if (labels) parts.push(`masked ${labels} caption label${labels > 1 ? "s" : ""}`);
  if (txt > 5) parts.push(`painted out map text and scale bar (${txt} marks)`);
  if (G.scaleBar && !G.pxm) parts.push(`found a scale bar ${G.scaleBar.px} px long; tell me its length to get metres`);
  renderScalePrompt();
  return parts.length ? parts.join(", ") : "no screen buttons found";
}

/** fill masked pixels with the average colour of their unmasked neighbours, peeling inward (onion-peel inpainting) */
function inpaint(D, m){
  const w = D.w, h = D.h, c = D.rgba, todo = new Uint8Array(m); let left = 0; for (const v of todo) left += v;
  for (let pass = 0; pass < 40 && left; pass++){
    const set = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const i = y*w+x; if (!todo[i]) continue; let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of NB8){ const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny*w+nx; if (todo[q]) continue; r += c[q*4]; g += c[q*4+1]; b += c[q*4+2]; n++; }
      if (n >= 2) set.push([i, r/n, g/n, b/n]);
    }
    for (const [i, r, g, b] of set){ c[i*4] = r; c[i*4+1] = g; c[i*4+2] = b; todo[i] = 0; left--; }
    if (!set.length) break;
  }
  D.lab = null; D._patVal = null; G.idxCache = null;
  if (typeof paintBase === "function") paintBase();
}
function renderScalePrompt(){
  const html = G.scaleBar && !G.pxm ? `<div class="card"><b>Scale bar found (${G.scaleBar.px} px).</b> What does it read?<div class="chips" style="margin-top:6px">${[["100 m",100],["200 m",200],["500 m",500],["1 km",1000],["2 km",2000],["5 km",5000],["10 km",10000],["20 km",20000],["50 km",50000],["100 km",100000]].map(([t, m]) => `<button class="chip" data-sb="${m}">${t}</button>`).join("")}</div><div class="row" style="margin:6px 0 0"><label>Or type it</label><input type="number" class="sbv" step="any" placeholder="7000"><select class="sbu"><option value="1">m</option><option value="1000">km</option><option value="1609.344">mi</option><option value="0.3048">ft</option></select><button class="sm sbgo">Set</button></div></div>` : "";
  document.querySelectorAll(".scaleprompt").forEach(e => { e.innerHTML = html; e.querySelectorAll("[data-sb]").forEach(b => b.onclick = () => { G.pxm = +b.dataset.sb/G.scaleBar.px; G.pxSrc = "from the image's scale bar"; updateInfo(); updateThresholdLabels(); renderScalePrompt(); toast(`Scale set: ${G.pxm.toPrecision(3)} m/px. Re-running…`); runAuto(); });
    const go = e.querySelector(".sbgo"); if (go) go.onclick = () => { const v = parseFloat(e.querySelector(".sbv").value), u = +e.querySelector(".sbu").value; if (!(v > 0)) return toast("Enter the scale bar's length"); G.pxm = v*u/G.scaleBar.px; G.pxSrc = "from the image's scale bar"; updateInfo(); updateThresholdLabels(); renderScalePrompt(); toast(`Scale set: ${G.pxm.toPrecision(3)} m/px. Re-running…`); runAuto(); }; });
}
/* ---------- 2. water without taps ---------- */
function computeWater(){
  G.mask = classify(G.D); G.maskV++; G.prep = G.chan = G.net = G.lakes = null;
  const {comps} = label(G.mask, G.w, G.h); let area = 0; for (const c of comps) area += c.area;
  comps.sort((a, b) => b.area - a.area); const ra = roiArea();
  showRes("water", [
    R("Water area", U.A(area)), R("Share of analysis area", U.P(area/ra)),
    R("Separate water bodies", U.N(comps.length, 0)),
    R("Largest body", U.A(comps[0] ? comps[0].area : 0), comps[0] ? (100*comps[0].area/Math.max(1, area)).toFixed(0) + "% of all water" : ""),
    R("Analysis area", U.A(ra)),
  ]);
  rebuildOverlay();
  return {area, share: area/ra, n: comps.length, largest: comps[0] ? comps[0].area : 0};
}
/** a drawn map (flat colours, few distinct shades) rather than a photo */
function isMapGraphic(D){
  if (!D.rgba || D.kind === "dem") return false;
  const N = D.w*D.h, st = Math.max(1, Math.floor(N/60000)), hist = new Map(); let n = 0;
  for (let i = 0; i < N; i += st){ const k = (D.rgba[i*4] >> 3) << 10 | (D.rgba[i*4+1] >> 3) << 5 | (D.rgba[i*4+2] >> 3); hist.set(k, (hist.get(k) || 0) + 1); n++; }
  const top = [...hist.values()].sort((a, b) => b - a).slice(0, 8).reduce((s, v) => s + v, 0);
  return top/n > .55;
}
/** on a drawn map, rivers and lakes are the blue strokes and fills */
function mapWater(){
  const D = G.D, w = G.w, h = G.h, N = w*h, L = ensureLab(D); let m = new Uint8Array(N), n = 0;
  for (let i = 0; i < N; i++){ const l = L[i*3], a = L[i*3+1], b = L[i*3+2]; if (b < -12 && Math.hypot(a, b) > 16 && l > 20 && l < 88 && a < 12){ m[i] = 1; n++; } }
  if (n < .002*N) return null;
  // the sea is often drawn in a pale blue too: drop very large flat blobs touching the frame
  const lb = label(m, w, h); for (const c of lb.comps) if (c.area > .12*N && (c.x0 === 0 || c.y0 === 0 || c.x1 === w-1 || c.y1 === h-1)) for (let i = 0; i < N; i++) if (lb.L[i] === c.id) m[i] = 0;
  m = closing(m, w, h, 1); // drawn lines are clean: no gap bridging, which would join neighbouring rivers' headwaters
  G.mask = m; G.maskV++; G.prep = G.chan = G.net = G.lakes = null; G.isMap = true;
  const {comps} = label(m, w, h); let area = 0; for (const c of comps) area += c.area; comps.sort((a, b) => b.area - a.area); const ra = roiArea();
  showRes("water", [SEC("Drawn map"), R("Share of analysis area", U.P(area/ra), "blue lines and fills"), R("Separate water bodies", U.N(comps.length, 0)), R("Largest body", U.A(comps[0] ? comps[0].area : 0))]);
  rebuildOverlay();
  return {ok: true, share: area/ra, n: comps.length, largest: comps[0] ? Math.max(comps[0].area, ra*.005) : 0, msg: `drawn map: rivers and lakes taken from the blue lines (${(area/ra*100).toFixed(1)}% of the view)`};
}
/** build a colour-cluster water model for dataset D within valid pixels (no global side-effects) */
function waterModel(D, valid){
  const w = D.w, h = D.h;
  const L = ensureLab(D), rr = roiOrFull(), tot = (rr.x1-rr.x0)*(rr.y1-rr.y0), stride = Math.max(1, Math.floor(Math.sqrt(tot/30000)));
  const ok = i => !G.excl[i] && D.rgba[i*4+3] && (!valid || valid[i]);
  const s = [];
  for (let y = rr.y0; y < rr.y1; y += stride) for (let x = rr.x0; x < rr.x1; x += stride){ const i = y*w+x; if (ok(i)) s.push(L[i*3], L[i*3+1], L[i*3+2]); }
  if (s.length < 300) return {skip:"too little valid image"};
  const K = 8, C = kmeans(Float64Array.from(s), K, 16);
  const I1 = new Float64Array((w+1)*(h+1)), I2 = new Float64Array((w+1)*(h+1));
  for (let y = 0; y < h; y++){ let a = 0, b = 0; for (let x = 0; x < w; x++){ const v = L[(y*w+x)*3]; a += v; b += v*v; I1[(y+1)*(w+1)+x+1] = I1[y*(w+1)+x+1] + a; I2[(y+1)*(w+1)+x+1] = I2[y*(w+1)+x+1] + b; } }
  const cls = new Int8Array(w*h).fill(-1), n = new Float64Array(K), tex = new Float64Array(K);
  let arid = 0, nv = 0;
  for (let y = rr.y0; y < rr.y1; y++) for (let x = rr.x0; x < rr.x1; x++){
    const i = y*w+x; if (!ok(i)) continue;
    let b = 0, bd = Infinity;
    for (let c = 0; c < K; c++){ const d = (L[i*3]-C[c*3])**2*.5 + (L[i*3+1]-C[c*3+1])**2 + (L[i*3+2]-C[c*3+2])**2; if (d < bd){ bd = d; b = c; } }
    cls[i] = b; n[b]++; nv++;
    if (L[i*3+1] > 10 && L[i*3+2] > 16) arid++;
    const x0 = Math.max(0, x-2), x1 = Math.min(w, x+3), y0 = Math.max(0, y-2), y1 = Math.min(h, y+3), ar = (x1-x0)*(y1-y0);
    const s1 = I1[y1*(w+1)+x1] - I1[y0*(w+1)+x1] - I1[y1*(w+1)+x0] + I1[y0*(w+1)+x0], s2 = I2[y1*(w+1)+x1] - I2[y0*(w+1)+x1] - I2[y1*(w+1)+x0] + I2[y0*(w+1)+x0];
    tex[b] += Math.sqrt(Math.max(0, s2/ar - (s1/ar)**2));
  }
  const isArid = arid/nv > .25, info = [];
  // texture only from class interiors (5×5 window all the same class), so narrow rivers aren't penalised for their banks
  const tin = new Float64Array(K), nin = new Float64Array(K);
  for (let y = Math.max(rr.y0, 2); y < Math.min(rr.y1, h-2); y++) for (let x = Math.max(rr.x0, 2); x < Math.min(rr.x1, w-2); x++){
    const i = y*w+x, c0 = cls[i]; if (c0 < 0) continue; let same = true;
    for (let dy = -2; dy <= 2 && same; dy++) for (let dx = -2; dx <= 2; dx++) if (cls[i + dy*w + dx] !== c0){ same = false; break; }
    if (!same) continue;
    const s1 = I1[(y+3)*(w+1)+x+3] - I1[(y-2)*(w+1)+x+3] - I1[(y+3)*(w+1)+x-2] + I1[(y-2)*(w+1)+x-2], s2 = I2[(y+3)*(w+1)+x+3] - I2[(y-2)*(w+1)+x+3] - I2[(y+3)*(w+1)+x-2] + I2[(y-2)*(w+1)+x-2];
    tin[c0] += Math.sqrt(Math.max(0, s2/25 - (s1/25)**2)); nin[c0]++;
  }
  const interior = Array.from(nin, (v, c) => n[c] ? v/n[c] : 0);
  for (let c = 0; c < K; c++) if (nin[c] >= 50) tex[c] = tin[c]/nin[c]; else if (n[c]) tex[c] = -1;
  { const known = Array.from(tex).filter(t => t >= 0 && t < 99), md = known.length ? median(known) : 1; for (let c = 0; c < K; c++) if (tex[c] === -1) tex[c] = md; }
  let maxTex = 0; for (let c = 0; c < K; c++){ if (!n[c]) tex[c] = 99; else maxTex = Math.max(maxTex, tex[c]); }
  const medTex = median(Array.from(tex).filter(t => t < 99));
  // spatial coherence: share of a class's pixels with ≥6 of 8 neighbours in the same class (rivers are coherent ribbons; shades of forest are speckle)
  const coh = new Float64Array(K);
  for (let y = Math.max(rr.y0, 1); y < Math.min(rr.y1, h-1); y++) for (let x = Math.max(rr.x0, 1); x < Math.min(rr.x1, w-1); x++){
    const i = y*w+x, c0 = cls[i]; if (c0 < 0) continue; let k = 0;
    for (const [dx, dy] of NB8) if (cls[i + dy*w + dx] === c0) k++;
    if (k >= 6) coh[c0]++; }
  const diag = Math.hypot(rr.x1-rr.x0, rr.y1-rr.y0);
  for (let c = 0; c < K; c++){
    const l = C[c*3], a = C[c*3+1], b = C[c*3+2], chroma = Math.hypot(a, b), frac = n[c]/nv;
    let conn = 0, span = 0, ribW = 0; const cohc = n[c] ? coh[c]/n[c] : 0;
    // long ribbon test: after a 2 px closing, does one piece of this colour reach across a large part of the view?
    if (frac > .004 && frac < .2 && cohc > .5 && chroma < 35 && a < 12 && (a > -5 || (l < 32 && chroma < 10))){
      const m = new Uint8Array(w*h); for (let i = 0; i < m.length; i++) m[i] = cls[i] === c ? 1 : 0;
      const cl = label(dilate(m, w, h, 2), w, h); let big = null; for (const q of cl.comps) if (!big || q.area > big.area) big = q;
      if (big){ const sp = Math.hypot(big.x1-big.x0, big.y1-big.y0); let own = 0; for (let i = 0; i < m.length; i++) if (m[i] && cl.L[i] === big.id) own++;
        ribW = own/Math.max(1, sp); if (ribW < .025*diag) span = sp/diag; }
    }
    const ribbon = span > .35;
    if (frac > .002){ const m = new Uint8Array(w*h); for (let i = 0; i < m.length; i++) m[i] = cls[i] === c ? 1 : 0; const {comps} = label(m, w, h); conn = comps.length ? Math.max(...comps.map(q => q.area))/n[c] : 0; }
    let sc = 2*(1 - tex[c]/maxTex) + .8*conn;
    const thin = interior[c] < .35 && frac < .25;
    const blue = b < -6 && conn >= .3, dark = ((l < 25 && chroma < 12) || (l < 30 && chroma < 9 && cohc > .5)) && (conn >= .3 || ribbon), pale = chroma >= 8 && chroma < 30 && l > 45 && (tex[c] <= 1.1*medTex || thin) && conn >= .3;
    if (b < -6) sc += 1.5; if (pale && l > 68) sc += .6; if (dark) sc += .4; if (thin && conn >= .3 && (pale || blue || dark)) sc += .8;
    if (a > 12) sc -= 1.5; if (a < -8 && b > 4) sc -= 1;
    if (frac > .6) sc -= 2; if (frac < .004) sc -= 2;
    if (isArid && b > -4) sc -= 1.5;
    const sc0 = sc; if (ribbon){ sc += 1.2 + span; }
    info.push({c, l, a, b, frac, tex: tex[c], conn, sc, sc0, cue0: blue || dark || pale, cue: blue || dark || pale || ribbon, pale, thin, interior: interior[c], span, coh: cohc, ribbon, ribW});
  }
  if (!isArid){ const pl = info.filter(o => o.pale && o.frac > .004).sort((p, q) => q.l - p.l); if (pl[0]) pl[0].sc += .8; if (pl[1]) pl[1].sc += .3; }
  // a long river ribbon outranks small bright patches (mines, clouds, sandbars, leftover labels)
  if (info.some(o => o.ribbon && o.span > .4)) for (const o of info) if (!o.ribbon && o.b >= -6 && o.l > 80 && o.frac < .02) o.sc -= 1.5;
  info.sort((p, q) => (q.cue - p.cue) || (q.sc - p.sc));
  const best = info[0] && info[0].cue && info[0].sc >= 1.3 ? info[0] : null;
  if (!best) return {skip: isArid ? "arid scene with no clear water" : "no clear water found", info, isArid};
  const water = [best];
  // how much of a class's edge touches the best water class (shades of the same water body touch a lot; look-alike land doesn't)
  const touchFrac = c => { let edge = 0, t = 0;
    for (let y = Math.max(rr.y0, 1); y < Math.min(rr.y1, h-1); y += 1) for (let x = Math.max(rr.x0, 1); x < Math.min(rr.x1, w-1); x += 1){
      const i = y*w+x; if (cls[i] !== c) continue; let isEdge = false, tb = false;
      for (const j of [i-1, i+1, i-w, i+w]){ if (cls[j] !== c){ isEdge = true; if (cls[j] === best.c) tb = true; } }
      if (isEdge){ edge++; if (tb) t++; } }
    return edge ? t/edge : 0; };
  for (const o of info.slice(1)){
    const dE = Math.hypot(o.l-best.l, o.a-best.a, o.b-best.b);
    if ((o.cue0 || (best.b < -6 && o.b < -6)) && ((dE < 14 && o.tex < best.tex*1.35 && o.sc0 > .6 && o.frac < .5) || (o.sc0 >= 2 && o.frac < .35))){ water.push(o); }
    else if (o.cue0 && o.l < 32 && o.span > .25 && o.frac < .08) water.push(o); // blackwater tributaries joining a sediment-laden river
  }
  const flags = new Array(K).fill(false); water.forEach(o => flags[o.c] = true);
  return {C, water: flags, K, info, nWater: water.length, best, isArid};
}
function autoWater(){
  const D = G.D;
  if (D.kind === "dem") return {skip:"elevation model: water is not mapped from colour"};
  if (D.bands && D.bandMap.nir >= 0){
    setMode("ndwi"); G.thrVal = otsu(getIdx(D, "ndwi"), roiMask()); updateThrSlider();
    const r = computeWater(); return {ok:true, msg:`NDWI threshold ${G.thrVal.toFixed(2)} · ${(r.share*100).toFixed(1)}% water`, ...r};
  }
  if (isMapGraphic(D)){ const r = mapWater(); if (r) return r; }
  const md = waterModel(D);
  G.arid = !!md.isArid;
  if (md.skip) return md;
  G.autoC = md; G.samples = md.info.filter(o => md.water[o.c]).map(o => [o.l, o.a, o.b]);
  $("wSampN").textContent = G.samples.length + " auto sample" + (G.samples.length > 1 ? "s" : "");
  setMode("clusters");
  let r = computeWater(), used = md.nWater;
  if (r.share > .6 && md.nWater > 1){ md.water.fill(false); md.water[md.best.c] = true; used = 1; r = computeWater(); }
  return {ok:true, info: md.info, msg:`${used} water colour class${used > 1 ? "es" : ""} of ${md.K}` + (G.mlInfo && G.mlInfo.used ? ` + ML classifier (${(G.mlInfo.acc*100).toFixed(0)}% seed accuracy)` : "") + ` · ${(r.share*100).toFixed(1)}% water` + (G.bridges ? ` · ${G.bridges} gap${G.bridges > 1 ? "s" : ""} bridged` : ""), ...r};
}

/* ---------- 3. most regular pattern tile ---------- */
function autoPattern(){
  const r = roiOrFull(), rw = r.x1-r.x0, rh = r.y1-r.y0, S = Math.floor(Math.min(rw, rh)/2);
  let best = null;
  if (S >= 96){
    const nx = Math.max(1, Math.round((rw - S)/(S/2))), ny = Math.max(1, Math.round((rh - S)/(S/2)));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++){
      const x0 = Math.round(r.x0 + (rw - S)*(nx ? i/nx : .5)), y0 = Math.round(r.y0 + (rh - S)*(ny ? j/ny : .5));
      const box = {x0, y0, x1:x0+S, y1:y0+S};
      try { const q = analyzePattern(box, true); if (!best || q.prom > best.prom) best = q; } catch(e){}
    }
  }
  const whole = analyzePattern(r, true);
  if (!best || whole.prom >= best.prom*.9) best = whole;
  G.pbox = best.box === r ? null : best.box;
  analyzePattern(best.box);
  return `spacing ${U.L(best.spacing).s}, crests ${ax180(best.crest)}°, prominence ${best.prom.toFixed(1)}${G.pbox ? " (best tile)" : ""}`;
}

/* ---------- metric helpers ---------- */
const getM = (mod, key) => (G.results[mod] || []).find(r => r.k === key);
const val = (mod, key) => { const r = getM(mod, key); return r ? r.v : NaN; };
const disp = (mod, key) => { const r = getM(mod, key); return r ? r.s : "–"; };
function landscapeType(){
  const D = G.D;
  const FT = {submarine:"Submarine canyon system", coast:"Coast & lagoon", meander:"Meandering river", braided:"Braided river", tidal:"Tidal channel network", delta:"River delta", lakes:"Lake-studded plain", dunes:"Dune field", basin: G.hydro ? `Drainage basin · order ${G.hydro.maxO}` : "Drainage basin"};
  if (G.focusEff && FT[G.focusEff]) return FT[G.focusEff];
  if (D.kind === "dem") return G.hydro ? `Drainage basin · order ${G.hydro.maxO}` : "Elevation model";
  const sin = val("channel", "Sinuosity"), cci = val("channel", "Channel count index"), loops = val("network", "Loops (cycles)");
  const nl = val("lakes", "Water bodies"), lim = val("lakes", "Lake cover (limnicity)"), prom = G.pattern ? G.pattern.prom : 0;
  const water = val("water", "Share of analysis area");
  if (G.chan && cci > 1.6 && loops > 5) return "Braided / multi-thread channels";
  if (G.chan && sin > 1.5) return "Meandering channel";
  if (G.chan && sin > 1.1) return "Sinuous channel";
  if (nl >= 20 && lim > 2) return "Lake-studded plain";
  if (prom > 8 && !(water > 2)) return G.arid ? "Patterned terrain · dunes or ridges" : "Patterned landscape";
  if (G.chan) return "Straight channel";
  return "Landscape";
}
function keyStats(){
  const out = [], add = (label, value) => { if (value && value !== "–" && out.length < 6 && !out.some(o => o.label === label)) out.push({label, value}); };
  const sc = !!G.pxm, fe = G.focusEff;
  if (fe === "delta" && G.delta){ add("Mouths", disp("delta", "Mouths")); add("Opening angle", disp("delta", "Opening angle")); add("Bifurcations", disp("delta", "Bifurcations below the apex")); if (sc) add("Delta area", disp("delta", "Delta area")); }
  if (fe === "braided" && G.braid){ add("Channel count", disp("braid", "Channel count index (full braidplain)")); add("Total sinuosity", disp("braid", "Total sinuosity")); add("Bars", disp("braid", "Bars")); }
  if (fe === "meander" && G.chx){ add("Sinuosity", disp("channel", "Sinuosity")); add("Narrow necks", String(G.chx.necks.filter(n => n.ratio <= 1.5).length)); add("Oxbow lakes", String(G.chx.oxbows.length)); }
  if (fe === "tidal" && G.netx){ add("Stream order", disp("network", "Highest Strahler order")); add("Junction angle", disp("networkx", "Median junction angle")); add("Loops", disp("network", "Loops (cycles)")); }
  if (fe === "dunes" && G.field){ add("Crest spacing", disp("field", "Median spacing")); add("Crest trend", disp("field", "Mean crest trend")); add("Alignment", disp("field", "Alignment strength")); }
  if (G.D.kind === "dem"){
    add("Relief", disp("terrain", "Relief")); add("Hypsometric integral", disp("terrain", "Hypsometric integral"));
    add("Mean slope", disp("terrain", "Mean slope")); add("Drainage area", disp("hydro", "Drainage area"));
    add("Stream order", disp("hydro", "Highest Strahler order")); add("Drainage density", disp("hydro", "Drainage density"));
    add("Concavity θ", disp("hydro", "Concavity θ")); add("Steepness kₛₙ", disp("hydro", "Normalised steepness kₛₙ (θref 0.45)"));
  }
  if (fe === "submarine" && G.chan){ add("Channel sinuosity", disp("channel", "Sinuosity")); if (sc) add("Channel length", disp("channel", "Channel length")); }
  if (G.branches && (G.branches.tribs.length || G.branches.dists.length)){ add("Tributaries", String(G.branches.tribs.length)); if (G.branches.dists.length) add("Distributaries", String(G.branches.dists.length)); }
  if (G.chan){
    add("Sinuosity", disp("channel", "Sinuosity")); add("Meander bends", disp("channel", "Bends between inflections"));
    if (sc) add("Channel length", disp("channel", "Channel length"));
    add("Bend radius ÷ width", disp("channel", "Radius ÷ width"));
    if (sc) add("Median width", disp("channel", "Median width")); else add("Wavelength ÷ width", disp("channel", "Wavelength ÷ width"));
  }
  if (G.net){ add("Stream order", disp("network", "Highest Strahler order")); add("Bifurcation ratio", disp("network", "Bifurcation ratio Rb")); }
  if (G.lakes && G.lakes.lakes.length >= 5){ add("Lakes", disp("lakes", "Water bodies")); add("Lake cover", disp("lakes", "Lake cover (limnicity)")); }
  if (G.pattern && G.pattern.prom > 8 && !G.chan && !G.field){ add(sc ? "Crest spacing" : "Crest spacing (px)", disp("pattern", "Spacing (wavelength)")); add("Crest trend", disp("pattern", "Crest trend")); }
  if (G.cover) add("Cover diversity H′", disp("cover", "Shannon diversity H′"));
  add("Water", disp("water", "Share of analysis area"));
  return out;
}
function narrative(){
  const P = [], D = G.D, sc = !!G.pxm, fe = G.focusEff;
  if (fe === "delta" && G.delta){ const d = G.delta; P.push(`<b>Delta.</b> ${d.mouths.length} distributary mouths reach open water. Below the apex the network splits ${d.bif} times, and the mouths fan out over an opening angle of ${fx(d.opening, 0)}° at a median distance of ${U.L(median(d.dists)).s} from the apex. The shoreline's fractal dimension is ${fx(d.fd.D, 2)}.`); }
  if (fe === "braided" && G.braid) P.push(`<b>Braided river.</b> Transects across the whole braidplain cross ${disp("braid", "Channel count index (full braidplain)")} wet channels on average, and total sinuosity is ${disp("braid", "Total sinuosity")}. There are ${disp("braid", "Bars")} bars, typically elongated ${disp("braid", "Median bar elongation")}×, with long axes about ${disp("braid", "Bar axis vs flow (median)")} from the flow direction.`);
  if (fe === "meander" && G.chx){ const nk = G.chx.necks, crit = nk.filter(n => n.cls === "critical").length; P.push(`<b>Meandering river.</b> ${nk.length ? `${nk.length} meander neck${nk.length > 1 ? "s" : ""} found where the channel loops back to within 3 widths of itself${crit ? `, ${crit} of them critical (gap ≤ half a channel width), so a cutoff is likely in the next large flood` : ""}. The narrowest gap is ${U.L(nk[0].gap).s}.` : "No neck is close to cutting off."} ${G.chx.oxbows.length ? `${G.chx.oxbows.length} detached, channel-width lakes in the meander belt look like oxbows: former loops already cut off.` : ""} ${G.chx.downSk + G.chx.upSk ? `${G.chx.downSk} bends are downstream-skewed and ${G.chx.upSk} upstream-skewed; ${G.chx.compound} are compound (multi-lobed).` : ""}`); }
  if (fe === "tidal" && G.netx) P.push(`<b>Tidal channels.</b> Tributaries meet at a median angle of ${disp("networkx", "Median junction angle")}, and each Strahler order is ${disp("networkx", "Width ratio Rw")}× wider than the one below. Land lies a median ${disp("network", "Median")} from the nearest channel, a measure of how efficiently the marsh drains.`);
  if (fe === "dunes" && G.field) P.push(`<b>Dunes and bedforms.</b> Across ${G.field.tiles.length} tiles, crests trend ${disp("field", "Mean crest trend")} on average with an alignment strength of ${disp("field", "Alignment strength")}. The spacing is typically ${disp("field", "Median spacing")}.`);
  if (D.kind === "dem"){
    const HI = val("terrain", "Hypsometric integral");
    P.push(`The elevation model spans ${disp("terrain", "Relief")} of relief with a mean slope of ${disp("terrain", "Mean slope")}. Its hypsometric integral of ${disp("terrain", "Hypsometric integral")} suggests ${HI > .6 ? "a youthful, little-dissected landscape" : HI < .35 ? "a mature, deeply dissected landscape" : "a landscape near erosional equilibrium"}.`);
    if (G.hydro) P.push(`Flow routing gives a basin of ${disp("hydro", "Drainage area")} drained by a network up to Strahler order ${disp("hydro", "Highest Strahler order")}, with a drainage density of ${disp("hydro", "Drainage density")}. The main stem's slope–area relationship gives a concavity of ${disp("hydro", "Concavity θ")} and normalised steepness of ${disp("hydro", "Normalised steepness kₛₙ (θref 0.45)")}.`);
  }
  const ws = val("water", "Share of analysis area");
  if (G.mask && Number.isFinite(ws)) P.push(`Water or wet sediment covers about ${disp("water", "Share of analysis area")} of the analysed area, split into ${disp("water", "Separate water bodies")} separate bodies.`);
  if (G.chan){
    const sin = val("channel", "Sinuosity"), rcw = val("channel", "Radius ÷ width"), lw = val("channel", "Wavelength ÷ width"), cci = val("channel", "Channel count index");
    P.push(`The main channel is ${sin > 1.5 ? "meandering" : sin > 1.05 ? "sinuous" : "nearly straight"} (sinuosity ${sin.toFixed(2)})${sc ? `, ${disp("channel", "Channel length")} long and typically ${disp("channel", "Median width")} wide` : ""}, with ${disp("channel", "Bends between inflections")} bends between inflection points. ` +
      (Number.isFinite(rcw) ? `Bends are ${rcw < 2 ? "tight" : rcw > 3 ? "open" : "typical"}: radius ≈ ${rcw.toFixed(1)} widths and wavelength ≈ ${lw.toFixed(1)} widths, compared with roughly 2–3 and 10–14 for many rivers. ` : "") +
      (G.chan.Lb ? `The channel widens toward its outlet with a convergence length of ${U.L(G.chan.Lb).s}, a signature of tidal influence. ` : "") +
      (cci > 1.5 ? (G.focusEff === "meander" ? `Short cross-sections meet ${cci.toFixed(1)} wet channels on average, mostly because they also cut through neighbouring loops of this tightly meandering channel.` : `Cross-sections meet ${cci.toFixed(1)} wet channels on average, so the planform is multi-thread or closely looped.`) : ""));
  }
  if (G.branches){ const B = G.branches, t = B.tribs[0], d = B.dists[0];
    if (B.tribs.length || B.dists.length || B.sides.length) P.push(`<b>Branches.</b> ${B.tribs.length} tributar${B.tribs.length === 1 ? "y joins" : "ies join"} the main channel (${B.left} from the left bank, ${B.right} from the right, looking downstream)${t ? `; the largest, ${t.id}, is ${U.L(t.len).s} long and enters ${U.L(t.s).s} from the outlet at ${fx(t.angle, 0)}°` : ""}. ` +
      (d ? `${B.dists.length} distributar${B.dists.length === 1 ? "y leaves" : "ies leave"} it, the largest (${d.id}) splitting off ${U.L(d.s).s} from the outlet. ` : "No distributaries split off. ") + (B.sides.length ? `${B.sides.length} side channel${B.sides.length > 1 ? "s" : ""} split and rejoin around islands.` : "")); }
  if (G.focusEff === "submarine" && G.chan) P.push(`<b>Seafloor channel.</b> The view is Google Earth's ocean-floor shading, so channels were traced as dark troughs (canyon floors and channel axes) rather than as water. Lighter blue is shallower, so the main channel was followed from its shallowest end to the deepest, the direction turbidity currents and sediment flows travel. Its sinuosity is ${disp("channel", "Sinuosity")}${G.pxm ? ` over ${disp("channel", "Channel length")}` : ""}. Branches whose far ends are shallower were counted as tributary gullies or channels.`);
  if (G.net) P.push(`The connected channel network reaches Strahler order ${G.net.maxO} with ${G.net.sources} channel heads${G.net.loops ? ` and ${G.net.loops} loops (interconnected channels)` : " and no loops (tree-like)"}. Its bifurcation ratio is ${fx(G.net.Rb, 2)}; natural networks usually fall between 3 and 5.`);
  if (G.lakes && G.lakes.lakes.length >= 3) P.push(`There are ${disp("lakes", "Water bodies")} separate lakes or ponds covering ${disp("lakes", "Lake cover (limnicity)")}. Their median elongation is ${disp("lakes", "Median elongation")}, and the long axes of elongated lakes favour a bearing of ${disp("lakes", "Preferred long-axis bearing")}.`);
  if (G.pattern){
    const p = G.pattern.prom;
    const shortWl = G.pattern.spacing < 25 && G.D.kind === "image";
    P.push(p > 5 ? `A ${p > 12 ? "strong" : "moderate"} repeating pattern has crests spaced ${disp("pattern", "Spacing (wavelength)")} apart, trending ${disp("pattern", "Crest trend")}.` + (shortWl ? " The spacing is only a few pixels, so this may be image texture (or patterned ground such as permafrost polygons) rather than dunes." : " In dune fields the formative wind blew across this line.") : `No strongly regular pattern (dunes, ridges or ripples) stands out (prominence ${p.toFixed(1)}).`);
  }
  if (G.cover) P.push(`Surface colours split into ${disp("cover", "Classes")} classes with a Shannon diversity of ${disp("cover", "Shannon diversity H′")} (evenness ${disp("cover", "Evenness")}).`);
  if (!sc && D.kind !== "dem") P.push(`<span class="warn">No scale is set, so lengths are in pixels and only ratios (sinuosity, widths, orientations) are physically meaningful. Add a scale in Lab → Setup and re-run to get metres.</span>`);
  return P;
}

/* ---------- 4. art ---------- */
function prettyName(n){
  if (!n) return "";
  const stem = n.replace(/\.[^.]+$/, "");
  if (/^(img|image|dsc|pxl|screenshot|photo|scan|file)[-_ ]?\d/i.test(stem) || /^[0-9a-f]{6,}[-_]/i.test(stem) || !/[a-z]{3}/i.test(stem)) return "";
  return stem.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40);
}
function autoArt(fromButton){
  if (!G.D || !window.__studio) return "no studio";
  if (!window.__studio.hasImage() || !fromButton) sendToStudio(false);
  const nm = (G.place && G.place.caption) || prettyName(G.D.name), type = landscapeType(), geo = G.D.geo;
  let sub = type;
  if (geo && geo.lat !== undefined && geo.lon != null) sub = `${Math.abs(geo.lat).toFixed(2)}°${geo.lat >= 0 ? "N" : "S"} ${Math.abs(geo.lon).toFixed(2)}°${geo.lon >= 0 ? "E" : "W"} · ` + type;
  G.keyStats = keyStats();
  const r = window.__studio.autoStyle({title: nm, sub: G.place ? "" : nm ? sub : (geo && geo.lat !== undefined ? sub.split(" · ")[0] : ""), keyStats: G.keyStats, dem: G.D.kind === "dem", aspect: "4:5", capStyle: G.place ? "box" : "overlay"});
  G.art = {title: nm || type, sub, preset: r && r.preset}; G.artText = null;
  return r ? `look “${r.preset}”, auto-crop at ${window.__studio.S.zoom.toFixed(1)}×` : "skipped";
}

/* ---------- 5. pipeline ---------- */
async function runAuto(){
  if (!G.D) return toast("Open an image first");
  const D = G.D, dem = D.kind === "dem", F = G.focus;
  G.autoLog = null; G.findings = null; if (G.post) G.post.edits = {}; G.chSel = null; G.chStats = null; if (G.post) G.post.userCmp = null; G._autoRunning = true;
  G.mask = null; applyFocusSettings(F === "auto" ? "meander" : F); clearTimeout(waterT);
  G.excl.fill(0); G.roi = null; G.pbox = null; G.autoC = null; G.enhanced = null; G.enhOn = false; G.outlet = null; G.head = null; G.hl = null; G.arid = false; G.focusEff = null;
  G.seafloor = G.depth = G.branches = G.channelSet = G.rivers = null; G.outlet = null; if (G.tables) delete G.tables.branches;
  G.prep = G.chan = G.net = G.lakes = G.pattern = G.cover = G.terr = G.hydro = null; G.chanCls = G.chanStats = null; G.chx = G.netx = G.delta = G.braid = G.field = null; G.mask = null; G.results = {};
  document.querySelectorAll('#app-lab [id^="res-"]').forEach(e => { if (e.id !== "res-change") e.innerHTML = ""; });
  const steps = []; let water = null;
  const S = (name, fn, cond) => steps.push({name, fn, cond});
  const fx2 = () => G.focusEff || F;
  const wantWater = !dem && F !== "dunes";
  if (!dem) S("Removing screen buttons and toolbars", () => autoChrome());
  if (wantWater) S("Finding water and channels", () => {
    if (F === "submarine" || (F === "auto" && isBathymetry(G.D))){ water = seafloorChannels(); if (water.skip) return {skip: water.skip}; return water.msg; }
    water = autoWater(); if (water.skip) return {skip: water.skip}; return water.msg; });
  const hasChannel = () => water && water.ok && water.largest > roiArea()*.004 && F !== "lakes";
  S("Tracing the main channel", () => {
    analyzeChannel();
    // flow direction: by default the widest end is the outlet. Deltas and fans are the exception (the wide trunk is upstream), and the user can reverse it
    { const hint = deltaHint(); G.flowWhy = hint ? hint : "the widest end is taken as downstream";
      if (G.chan && (!!hint !== !!G.flowFlip)){ const e = G.chan.pts[G.chan.pts.length-1]; G.outlet = [e[0], e[1]]; G.prep = null; analyzeChannel(); }
      if (G.flowFlip) G.flowWhy = "reversed by you"; }
    G.colourSplit = null; try { rerouteByColour(); } catch(e){ console.error(e); }
    if (G.chan.len/Math.max(1, G.chan.W) < 6 || (G.chan.bends.length === 0 && G.chan.len/Math.max(1, G.chan.W) < 25)){ G.chan = null; G.chanCls = G.chanStats = null; delete G.results.channel; delete G.results.channelx; $("res-channel").innerHTML = ""; $("res-channelx").innerHTML = ""; G.chx = null; rebuildOverlay(); return {skip:"the main water body is a lake or bay, not a channel"}; }
    return `sinuosity ${disp("channel", "Sinuosity")}, ${disp("channel", "Bends between inflections")} bends, ${G.chx ? G.chx.necks.filter(n => n.ratio <= 1.5).length : 0} narrow necks`; }, hasChannel);
  S("Mapping the channel network", () => { analyzeNetwork(); return `order ${G.net.maxO}, ${G.net.sources} heads, ${G.net.loops} loops`; }, () => hasChannel() && !!G.chan);
  S("Splitting networks into rivers", () => { const R0 = analyzeRivers(); const maj = R0.filter(r => r.major); return R0.length ? `${R0.length} rivers, ${maj.length} major (${maj.slice(0, 4).map(r => r.id).join(", ")})` : {skip:"no river-shaped water"}; }, () => water && water.ok && !G.seafloor);
  S("Inventory of separate channels", () => { const r = analyzeChannelSet(); return r.list.length ? `${r.list.length} channel${r.list.length > 1 ? "s" : ""} (${r.list.filter(c => !c.main).length} not connected to the main one)` : {skip:"no channel-shaped water"}; }, () => water && water.ok);
  S("Finding tributaries & distributaries", () => { analyzeBranches(); buildChannelStats(true); const B = G.branches; return `${B.tribs.length} tributar${B.tribs.length === 1 ? "y" : "ies"} join, ${B.dists.length} distributar${B.dists.length === 1 ? "y" : "ies"} leave, ${B.sides.length} side channel${B.sides.length === 1 ? "" : "s"}`; }, () => !!G.chan);
  S("Measuring lakes and ponds", () => { $("lkNoNet").checked = !!G.chan; try { analyzeLakes(); } catch(e){ return {skip: e.message}; } return `${G.lakes.lakes.length} water bodies`; }, () => water && water.ok && !G.seafloor);
  if (dem){
    S("Terrain statistics", () => { analyzeTerrain(); return `relief ${disp("terrain", "Relief")}, HI ${disp("terrain", "Hypsometric integral")}`; });
    S("Routing flow and extracting streams", () => { runHydro(); return `basin ${disp("hydro", "Drainage area")}, order ${G.hydro.maxO}`; });
  }
  S("Searching for repeating patterns", () => autoPattern());
  S(F === "auto" ? "Deciding what kind of landscape this is" : "Applying focus: " + FOCUS[F].n, () => {
    if (F === "auto"){ const [k, why] = detectFocus(); G.focusEff = k; G.focusWhy = why; return `${FOCUS[k].n}: ${why}`; }
    G.focusEff = F; G.focusWhy = "chosen by you"; return FOCUS[F].d;
  });
  S("Focus analysis", () => {
    const f = fx2();
    if (f === "delta"){ if (!analyzeDelta(true)){ const B = G.branches; return {skip: `no sea or lake in view, so this is the upper delta: ${B ? B.dists.length : 0} distributaries split from the trunk`}; } analyzeDelta(); return `${G.delta.mouths.length} mouths, opening angle ${fx(G.delta.opening, 0)}°`; }
    if (f === "braided"){ analyzeBraid(); return `channel count ${disp("braid", "Channel count index (full braidplain)")}, ${disp("braid", "Bars")} bars`; }
    if (f === "dunes"){ analyzeField(); return `${G.field.tiles.length} tiles, mean crest ${disp("field", "Mean crest trend")}`; }
    if (f === "meander") return G.chx ? `${G.chx.necks.length} necks, ${G.chx.oxbows.length} oxbow candidates` : {skip:"no channel"};
    if (f === "tidal") return G.netx ? `median junction angle ${disp("networkx", "Median junction angle")}` : {skip:"no network"};
    if (f === "submarine") return G.chan ? `main channel ${disp("channel", "Channel length")}, sinuosity ${disp("channel", "Sinuosity")}; ${G.branches ? G.branches.tribs.length : 0} tributary gullies or channels join it` : {skip:"no channel traced"};
    if (f === "lakes") return G.lakes ? `${G.lakes.lakes.length} lakes` : {skip:"no lakes"};
    if (f === "coast"){ G.chan = null; G.branches = null; G.chanCls = G.chanStats = null; G.chx = null; delete G.results.channel; delete G.results.channelx; rebuildOverlay(); return "water areas and shorelines; add another year to see how the coast changed"; }
    return {skip:"nothing extra for this focus"};
  });
  if (!dem) S("Classifying surface cover", () => { analyzeCover(); G.lay.cover = false; document.querySelector('.lay[data-k="cover"]').classList.remove("on"); rebuildOverlay(); return `${disp("cover", "Classes")} classes`; });
  S("Styling the artwork", () => autoArt(false));
  const box = $("autoSteps"); box.innerHTML = steps.map((s, i) => `<div class="st" id="ast${i}"><span class="ic">○</span><div><b>${s.name}</b><small></small></div></div>`).join("");
  $("autoModal").classList.add("on");
  const log = [];
  for (let i = 0; i < steps.length; i++){
    const s = steps[i], el = $("ast" + i), ic = el.querySelector(".ic"), sm = el.querySelector("small");
    if (s.cond && !s.cond()){ ic.textContent = "–"; el.classList.add("skip"); sm.textContent = "not applicable"; log.push({step:s.name, status:"skipped", note:"not applicable"}); continue; }
    ic.textContent = "◌"; el.classList.add("run"); await tick(); await tick();
    try {
      const r = s.fn();
      if (r && r.skip){ ic.textContent = "–"; el.classList.add("skip"); sm.textContent = r.skip; log.push({step:s.name, status:"skipped", note:r.skip}); }
      else { ic.textContent = "✓"; el.classList.add("ok"); sm.textContent = r || ""; log.push({step:s.name, status:"done", note:r || ""}); }
    } catch (e){ console.error(e); ic.textContent = "!"; el.classList.add("bad"); sm.textContent = e.message; log.push({step:s.name, status:"failed", note:e.message}); }
    el.classList.remove("run");
  }
  G.autoLog = log; G._autoRunning = false;
  G.hl = {submarine:"branches", delta:"delta", braided:"braid", dunes:"field", meander: G.chx && G.chx.necks.length ? "necks" : null, tidal: G.netx ? "junctions" : null}[G.focusEff] || null;
  rebuildOverlay();
  await renderReport();
  setTimeout(() => $("autoModal").classList.remove("on"), 500);
  showApp("report");
}

/* ---------- 6. report ---------- */
let repVariant = "atlas";
async function renderReport(){
  const st = window.__studio;
  $("repEmpty").style.display = "none"; $("repBody").style.display = "block";
  const hasLines = geometry().lines.length > 0;
  document.querySelector('.rv[data-v="lines"]').style.display = hasLines ? "" : "none";
  if (!hasLines && repVariant === "lines") repVariant = "art";
  setVariant(repVariant, true);
  $("repTitle").textContent = (G.art && G.art.title) || landscapeType();
  $("repCaption").value = G.place ? G.place.caption : "";
  $("repSub").textContent = [G.D.name, G.pxm ? G.pxm.toPrecision(3) + " m/px" : "no scale"].filter(Boolean).join(" · ");
  $("repStats").innerHTML = (G.keyStats || keyStats()).map(k => `<div class="stat"><b>${k.value}</b><span>${k.label}</span></div>`).join("");
  $("repText").innerHTML = narrative().map(p => `<p>${p}</p>`).join("") + '<p class="note">Tap any measurement below to see what it means, the formula, and your numbers. Lab → Learn has the full guide.</p>';
  $("repFocus").textContent = G.focusEff ? `Landscape type: ${FOCUS[G.focusEff].n} · ${G.focusWhy} (change)` : "Landscape type (change)";
  renderFocusChips();
  const mods = [["water","Water"],["channel","Channel form"],["channelx","Channel+ · necks, oxbows, bends"],["delta","Delta"],["braid","Braided river"],["network","Channel network"],["networkx","Junctions & width scaling"],["branches","Tributaries & distributaries"],["field","Pattern map"],["lakes","Lakes & ponds"],["pattern","Bedforms & lineaments"],["cover","Surface cover"],["terrain","Terrain"],["hydro","Flow & drainage"]];
  $("repDetails").innerHTML = mods.filter(([k]) => G.results[k] && G.results[k].length).map(([k, n]) =>
    `<details><summary>${n} <small>${G.results[k].length} measures</small></summary><table class="res">${G.results[k].map((r, i) => `<tr data-gk="${k}|${i}"><td>${r.k}${r.n ? `<br><small>${r.n}</small>` : ""}</td><td>${r.s}</td></tr>`).join("")}</table><button class="sm" data-goto="${k === "hydro" ? "terrain" : k === "channelx" ? "channel" : ["networkx","delta","braid","branches"].includes(k) ? "network" : k === "field" ? "pattern" : k}">Open in Lab ›</button></details>`).join("");
  $("repDetails").querySelectorAll("[data-goto]").forEach(b => b.onclick = () => { showApp("lab"); showTab(b.dataset.goto); });
  renderReportChange();
  try { renderChannelStats(); } catch(e){ console.error(e); }
  try { renderRiverCard(); } catch(e){ console.error(e); }
  try { renderFindings(); } catch(e){ console.error(e); $("repFindings").innerHTML = `<p class="warn">Couldn't build findings: ${e.message}</p>`; }
  $("repLog").innerHTML = (G.autoLog || []).map(l => `<div class="lg ${l.status}"><span>${l.status === "done" ? "✓" : l.status === "failed" ? "!" : "–"}</span>${l.step}<small>${l.note}</small></div>`).join("");
}
async function setVariant(v, quiet){
  repVariant = v; const st = window.__studio; if (!st || !st.hasImage()) return;
  document.querySelectorAll(".rv").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (!G.artText) G.artText = {title: st.S.title, sub: st.S.sub};
  const T = G.artText, type = landscapeType();
  const art = G.art || {};
  const wantEnh = v === "atlas";
  if (wantEnh !== !!G.enhOn){ enhanceToStudio(wantEnh); G.enhOn = wantEnh; const eb = document.getElementById("s_btnEnhance"); if (eb){ eb.classList.toggle("on", wantEnh); eb.textContent = wantEnh ? "✦ Atlas enhance: on" : "✦ Atlas enhance"; } }
  if (v === "atlas"){ st.setPreset("Atlas Pro"); st.setStyle({zoom: 1, cx: st.S.iw/2, cy: st.S.ih/2,border:"none", ov:"off", capStyle:"box", capPos:"br", title: (G.place && G.place.caption) || T.title || type, sub:"", aspect:5/7, aspectKey:"5:7"}); }
  else { if (art.preset && st.S.presetIdx !== st.PRESETS.findIndex(p => p.name === art.preset)) st.setPreset(art.preset); st.setStyle({aspect:4/5, aspectKey:"4:5", capStyle: G.place ? "box" : "overlay"}); }
  if (v === "art") st.setStyle({border:"none", ov:"off", title:T.title, sub:T.sub});
  else if (v === "poster") st.setStyle({border:"data", ov: geometry().lines.length ? "white" : "off", keyStats: G.keyStats || keyStats(), title: T.title || type, sub: T.title ? T.sub : (G.D.name || "")});
  else if (v === "lines") st.setStyle({border:"none", ov: geometry().lines.length ? "neon" : "off", title:T.title, sub:T.sub});
  const cv = $("repArt"); st.renderTo(cv, 900);
}
document.querySelectorAll(".rv").forEach(b => b.onclick = () => setVariant(b.dataset.v));
$("repCaption").addEventListener("input", () => { const v = $("repCaption").value.trim(); G.place = v ? {caption: v} : null; G.artText = {title: v || (G.art && G.art.title) || landscapeType(), sub: ""}; clearTimeout(G._capT); G._capT = setTimeout(() => setVariant(repVariant), 250); });
$("repSave").onclick = () => window.__studio && window.__studio.save();
$("repEdit").onclick = () => showApp("studio");
$("repLab").onclick = () => showApp("lab");
$("repCsv").onclick = () => $("exMetrics").click();
$("repJson").onclick = () => $("exJSON").click();
$("repRerun").onclick = () => runAuto();
$("repPlot").onclick = () => { showApp("lab"); setTimeout(() => showTab("plot"), 60); };

/* ---------- app shell ---------- */
function showApp(k){
  if (k !== "home" && k !== "discover" && k !== "posts" && k !== "explore" && !G.D) k = "home";
  document.querySelectorAll(".appsec").forEach(s => s.classList.toggle("on", s.id === "app-" + k));
  document.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.app === k));
  if (k === "lab"){ requestAnimationFrame(() => { fitView(); showTab(G.tab || "setup"); }); }
  if (k === "studio" && window.__studio) requestAnimationFrame(() => window.__studio.schedule());
  if (k === "explore") requestAnimationFrame(() => { try { const m = window.__xmap && window.__xmap(); if (m) m.req(); } catch(_){} });
  if (k === "posts") requestAnimationFrame(() => { try { renderPosts(); } catch(e){ console.error(e); toast("Posts: " + e.message); } });
  if (k === "report" && G.D && !G.autoLog){ $("repEmpty").style.display = "block"; $("repBody").style.display = "none"; }
  window.scrollTo(0, 0);
}
document.querySelectorAll(".seg button").forEach(b => b.onclick = () => showApp(b.dataset.app));
$("homeOpen").onclick = () => $("fileA").click();
$("btnDelta").onclick = () => busy("Finding the delta…", () => { analyzeDelta(); G.hl = "delta"; requestDraw(); });
$("btnBraid").onclick = () => busy("Mapping the braidplain…", () => { analyzeBraid(); G.hl = "braid"; rebuildOverlay(); });
$("btnField").onclick = () => busy("Mapping patterns across the image…", () => { analyzeField(); });
G.pathMode = "widest";
function renderPathModes(){ const el = $("pathModes"); el.innerHTML = [["widest","Follow widest"],["shortest","Shortest route"]].map(([k, n]) => `<button class="chip${G.pathMode === k ? " on" : ""}" data-pm="${k}">${n}</button>`).join(""); el.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { G.pathMode = b.dataset.pm; renderPathModes(); }); }
renderPathModes(); renderFocusChips();
$("homeFind").onclick = () => showApp("discover");
$("homeRiver") && ($("homeRiver").onclick = () => showApp("explore"));
$("repAuto").onclick = () => runAuto();
$("btnAutoLab").onclick = () => runAuto();
window.__onLoaded = () => {
  G.isMap = false;
  G.flowFlip = false; G.channelSet = null; G.chSel = null; G.chNames = {};
  G.autoLog = null; G.hl = null; G.enhanced = null; G.enhOn = false; G.labelMask = null; G.labelMaskFor = null; G.scaleBar = null;
  G.place = window.__pendingPlace || null; window.__pendingPlace = null; if (window.__pendingScale){ G.pxm = window.__pendingScale*(G.D.f || 1); G.pxSrc = "from the map's zoom level"; G.north = 0; window.__pendingScale = null; try { updateInfo(); } catch(_){} } if ($("dPending")) $("dPending").innerHTML = "";
  sendToStudio(false);
  if ($("autoOnOpen").checked) runAuto(); else showApp("studio");
};
showApp("home");
