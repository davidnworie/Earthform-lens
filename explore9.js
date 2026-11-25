
/* ===================== Earthform Lens — figure composer: several maps, plots and an inset in one publication figure ===================== */
let FCN = 0;
const FC = Object.assign({tpl: "overview", cols: 0, text: 2.2, letters: true, sat: true, inset: true, maps: ["elevation", "sinuosity", "zone"], plots: ["elevation", "sinuosity"], title: "", caption: true, cmpMetric: "sinuosity"}, (() => { try { const o = JSON.parse(localStorage.getItem("efl.fc")) || {}; delete o.title; return o; } catch(_){ return {}; } })());
function fcSave(){ try { localStorage.setItem("efl.fc", JSON.stringify({...FC, title: ""})); } catch(_){} }
/** run fn with another river (and a fresh clean-view geometry) as the current one; synchronous only */
function withRiver(R, fn){ const kR = XR.river, kG = CV.geo, kV = CV.vb, kP = CV.panelV, kRot = CV.rot; XR.river = R; CV.geo = cvGeometry(R); CV.rot = 0; try { return fn(); } finally { XR.river = kR; CV.geo = kG; CV.vb = kV; CV.panelV = kP; CV.rot = kRot; } }
const letter = (i, x, y) => FC.letters ? `<text x="${x}" y="${y}" font-size="${Math.round(14*(FC.text || 2.2))}" font-weight="700" fill="#111">${"abcdefghijklmnop"[i]}</text>` : "";
/** a to-scale plan map of one river coloured by one measure, with legend, scale bar and north arrow */
function fcMap(R, metric, W0, H0, opt = {}){
  const k = FC.text || 2.2, W = W0/k, H = H0/k;
  return withRiver(R, () => {
    const G = CV.geo; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of G.main){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const V = cvValuesFor(metric); CV.panelV = [V]; const id = "fc" + (++FCN), L0 = cvLegendSVG(V), kL = FURN.legend.k || 1, L = {w: L0.w*kL, h: L0.h*kL, s: `<g transform="scale(${kL})">${L0.s}</g>`}, m = .04, pd = 6;
    const t0 = W*.22, IW = 112, IH = 84, sbW = Math.min(W*.3, 150) + 26, sbH = 30;
    // fit the river, leaving room for the legend where it overlaps least
    const fit = (aw, ah, ox, oy) => { const sc = opt.s || Math.max((x1 - x0)/Math.max(40, aw - 76), (y1 - y0)/Math.max(30, ah - 40)) || 1; return {cx: (x0 + x1)/2 - (ox + aw/2 - W/2)*sc, cy: (y0 + y1)/2 - (oy + ah/2 - H/2)*sc, s: sc}; };
    const ptsFor = vb => { const st = Math.max(1, Math.floor(G.main.length/700)), P = []; for (let i = 0; i < G.main.length; i += st) P.push([(G.main[i][0] - vb.cx)/vb.s + W/2, (G.main[i][1] - vb.cy)/vb.s + H/2]); return P; };
    const hits = (P, b) => P.reduce((c, q) => c + (q[0] > b[0] - 5 && q[0] < b[0] + b[2] + 5 && q[1] > b[1] - 5 && q[1] < b[1] + b[3] + 5 ? 1 : 0), 0);
    const corners = (w, h) => [[W - w - pd, H - h - pd], [pd, H - h - pd], [W - w - pd, pd + 14], [pd, pd + 18], [(W - w)/2, H - h - pd], [(W - w)/2, pd + 14]].map(([x, y]) => [x, y, w, h]);
    const inter = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
    const place = (P, w, h, used) => { let best = null, bc = Infinity; for (const b of corners(w, h)){ const c = hits(P, b) + (used.some(u => inter(u, b)) ? 1e6 : 0); if (c < bc){ bc = c; best = b; } } return [best, bc]; };
    const cands = [fit(W, H, 0, 0), fit(W, H - L.h - pd*2, 0, 0), fit(W, H - L.h - pd*2, 0, L.h + pd*2), fit(W - L.w - pd*2, H, 0, 0), fit(W - L.w - pd*2, H, L.w + pd*2, 0)];
    let vb = cands[0], P = ptsFor(vb), [lb, lc] = place(P, L.w, L.h, []);
    const inside = P2 => P2.every(q => q[0] > 2 && q[0] < W - 2 && q[1] > 2 && q[1] < H - 2);
    if (lc > 0) for (const c of cands.slice(1)){ const P2 = ptsFor(c); if (opt.s && !inside(P2)) continue; const [b2, c2] = place(P2, L.w, L.h, []); if (c2 < lc || (c2 === lc && c.s < vb.s)){ if (c2 < lc || c2 === 0){ vb = c; P = P2; lb = b2; lc = c2; } } if (lc === 0 && !opt.s) break; }
    CV.vb = vb; const s = vb.s;
    let body = cvPanel(metric, 0, W, H, V).replace(/cvClip0/g, id);
    const used = [lb], labBox = opt.label ? [0, 0, 26 + opt.label.length*6.6, 20] : [0, 0, 24, 20]; used.push(labBox);
    const t = W*.22*s, p = 10**Math.floor(Math.log10(t)), len = [1, 2, 5, 10].map(k => k*p).filter(v => v <= t).pop() || p, px = len/s;
    const kS = FURN.scale.k || 1, kN = (FURN.north.k || 1)*.8, [nb] = place(P, 32*kN, 40*kN, used); used.push(nb);
    const [ib] = opt.inset ? place(P, IW, IH, used) : [null]; if (ib) used.push(ib);
    const [sb] = place(P, (px + 26)*kS, 34*kS, used);
    body += `<g transform="translate(${lb[0]},${lb[1]})">${L.s}</g>`;
    { const S = furnScaleSVG(px, len >= 1 ? tfmt(len) + " km" : nf(len*1000) + " m"); body += `<g transform="translate(${sb[0]},${sb[1]}) scale(${FURN.scale.k || 1})">${S.s}</g>`; const Nn = furnNorthSVG(0); body += `<g transform="translate(${nb[0]},${nb[1]}) scale(${(FURN.north.k || 1)*.8})">${Nn.s}</g>`; }
    if (XR.dn && XR.dn.segs && CV.show.net !== false && DNSTY.show.legend){ const Ln = dnLegendSVG(), [nl] = place(P, Ln.w, Ln.h, used.concat([sb, nb, lb])); if (nl) body += `<g transform="translate(${nl[0]},${nl[1]})">${Ln.s}</g>`; }
    if (opt.label) body += `<text x="${opt.lx || 20}" y="14" font-size="11.5" font-weight="600" fill="#222">${esc(opt.label)}</text>`;
    if (ib) body += `<g transform="translate(${ib[0]},${ib[1]})"><rect width="${IW}" height="${IH}" rx="4" fill="#fff" stroke="#888" stroke-width=".6"/><image href="${opt.inset.url}" x="3" y="3" width="${IW - 6}" height="${IH - 6}" preserveAspectRatio="xMidYMid slice"/></g>`;
    return `<g transform="scale(${k})"><defs><clipPath id="${id}"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>${body}<rect width="${W}" height="${H}" fill="none" stroke="#cfd4d9" stroke-width="${1/k}"/></g>`;
  });
}
function fcExtent(R){ return withRiver(R, () => { const G = CV.geo; let a = Infinity, b = -Infinity, d = Infinity, e = -Infinity; for (const p of G.main){ a = Math.min(a, p[0]); b = Math.max(b, p[0]); d = Math.min(d, p[1]); e = Math.max(e, p[1]); } return {w: Math.max(1e-6, b - a), h: Math.max(1e-6, e - d)}; }); }
/** panel height that fits the river's shape (little empty space) */
function fcPanelH(R, cw){ const E = fcExtent(R), a = E.h/E.w, k = FC.text || 2.2; return clamp(cw*(a*1.06 + .04) + 44*k, cw*.3, cw*1.15); }
/** the downstream plots (profile with layers, sinuosity, width…) at a given width */
function fcPlots(R, list, W0){
  const k = FC.text || 2.2, W = Math.round(W0/k);
  return withRiver(R, () => {
    const old = $("cvProf"); if (old) old.id = "cvProfKeep";
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg"); tmp.id = "cvProf"; tmp.style.cssText = `position:absolute;left:-99999px;top:0;width:${W}px`; document.body.appendChild(tmp);
    const kp = CV.plots, km0 = CV.plotMode; CV.plots = list; CV.plotMode = "stack";
    try { cvPlots(); const h = +tmp.getAttribute("height") || 300, vbw = +(tmp.getAttribute("viewBox") || "0 0 " + W).split(" ")[2] || W; return {h: h*W/vbw*k, s: `<g transform="scale(${W/vbw*k})">${tmp.innerHTML}</g>`}; }
    finally { CV.plots = kp; CV.plotMode = km0; tmp.remove(); if (old) old.id = "cvProf"; }
  });
}
/** the live satellite map as an image (needs a base map that allows export) */
async function fcSat(W, H){
  const M = xmap, cv0 = M.cv, kt = FC.text || 2.2, lw = W/kt, lh = H/kt, od = M.dpr, ob = M.tileBias || 0, oz = M.z, oc = [M.lat, M.lon], osz = M.size, orot = M.rot;
  const kl = {...XR.lay}; Object.assign(XR.lay, {legend: false, labels: false, scale: true}); M.rot = 0; M.dpr = 2*kt; M.tileBias = Math.min(2, Math.round(Math.log2(kt)));
  M.size = () => { if (cv0.width !== Math.round(lw*M.dpr)){ cv0.width = Math.round(lw*M.dpr); cv0.height = Math.round(lh*M.dpr); } return [lw, lh]; };
  try { if (XR.river) M.fit(XR.river.main, 10); for (let t = 0; t < 30; t++){ M.draw(); if (!M.miss) break; await new Promise(r => setTimeout(r, 350)); } M.draw(); return cv0.toDataURL("image/jpeg", .92); }
  catch(e){ return null; }
  finally { Object.assign(XR.lay, kl); M.size = osz; M.rot = orot; M.dpr = od; M.tileBias = ob; M.z = oz; M.lat = oc[0]; M.lon = oc[1]; M.req(); }
}
async function fcInset(R){ const keep = CV.inset, kR = XR.river; XR.river = R; try { CV.inset = null; await cvMakeInset(); return CV.inset; } catch(_){ return null; } finally { XR.river = kR; const got = CV.inset; CV.inset = keep || got; } }
function fcCaption(R){ const pr = R.prof, sin = R.L/Math.max(1e-6, hav(R.main[0], R.main[R.main.length - 1]));
  return `${R.name}${R.region ? " (" + R.region + ")" : ""}: ${km(R.L)} traced, whole-river sinuosity ${nf(sin, 2)}${pr ? `, fall ${nf(pr.drop)} m, mean gradient ${nf(pr.grad, 3)} m/km, ${pr.spikes ? pr.spikes.length : 0} elevation spikes removed, conditioning ${String(pr.params.cond).split(" (")[0]}` : ""}. Centreline © OpenStreetMap contributors${R.edits ? " (edited by the user)" : ""}; elevation ${pr ? demLabel(pr, true) : "–"}${XR.base && !EX.base[XR.base].plain && FC.sat ? `; ${String(EX.base[XR.base].attr || EX.base[XR.base].n).replace(/^imagery\s*/i, "imagery ")}` : ""}. Sediment zones are a rule-based interpretation. Made with Earthform Lens, ${new Date().toISOString().slice(0, 10)}.`; }
function fcWrap(t, maxChars){ const w = t.split(/\s+/), L = []; let cur = ""; for (const x of w){ if ((cur + " " + x).trim().length > maxChars){ L.push(cur.trim()); cur = x; } else cur += " " + x; } if (cur.trim()) L.push(cur.trim()); return L; }

/** assemble the whole figure as one SVG */
async function composeFigure(){
  const W = 1800, pad = 36, gap = 26; let y = pad, out = "", li = 0; const R = XR.river;
  const add = (svg, x, yy, w, h) => { out += `<g transform="translate(${x},${yy})">${svg}</g>${letter(li++, x + 8, yy + Math.round(13*(FC.text || 2.2)))}`; };
  const title = FC.title || (FC.tpl === "compare" ? "River comparison" : R ? R.name + (R.region ? ", " + R.region : "") : "Figure");
  const tfs = Math.round(17*(FC.text || 2.2)); out += `<text x="${pad}" y="${y + tfs}" font-size="${tfs}" font-weight="700" fill="#111">${esc(title)}</text>`; y += tfs + 22;
  if (FC.tpl === "compare"){
    const C = XR.cmp.length ? XR.cmp : (R ? [{R, k0: 0, k1: R.L, label: R.name}] : []); if (!C.length) throw new Error("add rivers to the comparison first");
    const cols = FC.cols ? clamp(FC.cols, 1, 4) : (C.length <= 2 ? C.length : C.length <= 4 ? 2 : 3), cw = (W - 2*pad - (cols - 1)*gap)/cols, kt = FC.text || 2.2, Es = C.map(c => fcExtent(c.R));
    const legH = 64, ch = clamp((FC.cmpSame !== false ? cw*(Math.max(...Es.map(e => e.h))/Math.max(...Es.map(e => e.w))) : cw*median(Es.map(e => e.h/e.w)))*1.05 + (legH + 50)*kt, cw*.35, cw*1.2);
    // one shared scale so sizes compare directly (km per logical pixel), leaving a band for the legend
    const sMax = Math.max(...Es.map(e => Math.max(e.w/(cw/kt - 76), e.h/(ch/kt - legH - 48))));
    C.forEach((c, i) => { const col = i % cols, row = Math.floor(i/cols); add(fcMap(c.R, FC.cmpMetric, cw, ch, {s: FC.cmpSame !== false ? sMax : null, label: c.label, lx: 22}), pad + col*(cw + gap), y + row*(ch + gap), cw, ch); });
    y += Math.ceil(C.length/cols)*(ch + gap);
    // normalised profiles of all rivers
    const ph = 520, pw = W - 2*pad, m = {l: 100, r: 24, t: 24, b: 76}, X = u => m.l + u*(pw - m.l - m.r), Y = v => m.t + (1 - v)*(ph - m.t - m.b);
    let g = `<rect width="${pw}" height="${ph}" fill="#fff" stroke="#cfd4d9"/>`; for (const t of [0, .25, .5, .75, 1]) g += `<line x1="${X(0)}" x2="${X(1)}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/><text x="${X(0) - 10}" y="${Y(t) + 5}" font-size="22" text-anchor="end">${t}</text><text x="${X(t)}" y="${ph - m.b + 30}" font-size="22" text-anchor="middle">${t}</text>`;
    g += `<line x1="${X(0)}" y1="${Y(1)}" x2="${X(1)}" y2="${Y(0)}" stroke="#999" stroke-dasharray="6 5"/><text x="${(X(0) + X(1))/2}" y="${ph - 12}" font-size="23" text-anchor="middle">Distance ÷ length</text><text transform="translate(30 ${ph/2}) rotate(-90)" font-size="23" text-anchor="middle">Height above end ÷ fall</text>`;
    const pal = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf", "#8c564b", "#e377c2"];
    C.forEach((c, i) => { const pr = c.R.prof; if (!pr) return; const i0 = Math.round(c.k0/pr.step), i1 = Math.min(pr.d.length - 1, Math.round(c.k1/pr.step)), z0 = pr.zc[i0], z1 = pr.zc[i1], H = (z0 - z1) || 1, L = c.k1 - c.k0, st = Math.max(1, Math.floor((i1 - i0)/800)); let d = "";
      for (let j = i0; j <= i1; j += st) d += (d ? "L" : "M") + X((pr.d[j] - c.k0)/L).toFixed(1) + " " + Y((pr.zc[j] - z1)/H).toFixed(1); g += `<path d="${d}" fill="none" stroke="${pal[i % 8]}" stroke-width="3"/><rect x="${pw - 380}" y="${m.t + 12 + i*32}" width="30" height="6" fill="${pal[i % 8]}"/><text x="${pw - 340}" y="${m.t + 21 + i*32}" font-size="22">${esc(c.label)}</text>`; });
    add(g, pad, y, pw, ph); y += ph + gap;
    if (FC.caption){ const cap = `Plan views ${FC.cmpSame !== false ? "share one scale" : "are each fitted"}, coloured by ${(XMETRIC[FC.cmpMetric] || {n: "sediment zone"}).n.toLowerCase()}; normalised long profiles (dashed: uniform gradient). ${C.every(c => c.R.harm) ? "All rivers were re-measured with the same sources, sampling and reach definition." : "Rivers were not harmonised: use Make comparable before publishing."} Data: OpenStreetMap contributors; elevation ${C[0].R.prof ? demLabel(C[0].R.prof) : "–"}. Earthform Lens, ${new Date().toISOString().slice(0, 10)}.`;
      { const fs = Math.round(9.5*(FC.text || 2.2)), L = fcWrap(cap, Math.round(330/(FC.text || 2.2))); L.forEach((l, i) => { out += `<text x="${pad}" y="${y + fs + i*fs*1.35}" font-size="${fs}" fill="#333">${esc(l)}</text>`; }); y += L.length*fs*1.35 + 20; } }
  } else {
    if (!R) throw new Error("load a river first");
    const E = fcExtent(R), asp = E.h/E.w, cols = FC.cols ? clamp(FC.cols, 1, 3) : (asp < .3 ? 1 : asp < 1.6 ? 2 : 3), cw = (W - 2*pad - (cols - 1)*gap)/cols, ch = fcPanelH(R, cw), cells = [];
    if (FC.sat){ const url = await fcSat(cw, ch); if (url) cells.push(`<image href="${url}" width="${cw}" height="${ch}" preserveAspectRatio="xMidYMid slice"/><rect width="${cw}" height="${ch}" fill="none" stroke="#cfd4d9"/>`); else toast("The satellite panel was left out: this base map does not allow export (try Sentinel-2 or Topographic)", 5000); }
    let inset = null; if (FC.inset) inset = await fcInset(R);
    FC.maps.forEach((mtr, i) => cells.push(fcMap(R, mtr, cw, ch, {inset: i === 0 ? inset : null})));
    cells.forEach((s, i) => { const col = i % cols, row = Math.floor(i/cols); add(s, pad + col*(cw + gap), y + row*(ch + gap), cw, ch); });
    y += Math.ceil(cells.length/cols)*(ch + gap);
    if (FC.plots.length && R.prof){ const P = fcPlots(R, FC.plots, W - 2*pad); add(`<rect width="${W - 2*pad}" height="${P.h}" fill="#fff"/>${P.s}<rect width="${W - 2*pad}" height="${P.h}" fill="none" stroke="#cfd4d9"/>`, pad, y, W - 2*pad, P.h); y += P.h + gap; }
    if (FC.caption){ const L = fcWrap(fcCaption(R), Math.round(330/(FC.text || 2.2))); L.forEach((l, i) => { const fs = Math.round(9.5*(FC.text || 2.2)); out += `<text x="${pad}" y="${y + fs + i*fs*1.35}" font-size="${fs}" fill="#333">${esc(l)}</text>`; }); y += L.length*Math.round(9.5*(FC.text || 2.2))*1.35 + 20; }
  }
  const H = Math.round(y + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${out}</svg>`;
}

function openComposer(){
  const R = XR.river; if (!R && !XR.cmp.length) return toast("Load a river first");
  const metrics = Object.entries(XMETRIC).filter(([k]) => k !== "plain"), plots = PLOTS();
  const chip = (grp, k, t, on) => `<button class="chip${on ? " on" : ""}" data-fg="${grp}" data-fk="${k}">${esc(t)}</button>`;
  modal(`<h3>Compose a figure</h3><p class="note">Several maps, the satellite view, a location inset and the downstream plots in one publication figure, with panel letters and a caption. Export as PNG, PDF or SVG at journal sizes.</p>
    <label class="fl">Layout<select id="fcTpl"><option value="overview"${FC.tpl !== "compare" ? " selected" : ""}>One river: maps + plots</option><option value="compare"${FC.tpl === "compare" ? " selected" : ""}>Compare rivers (${XR.cmp.length} in the comparison)</option></select></label>
    <label class="fl">Title<input id="fcTitle" type="text" value="${esc(FC.title || "")}" placeholder="${esc(R ? R.name + (R.region ? ", " + R.region : "") : "River comparison")}"></label>
    <div id="fcOne"${FC.tpl === "compare" ? ' style="display:none"' : ""}>
      <div class="fl">Panels<div class="chips">${chip("sat", "sat", "Satellite view", FC.sat)}${chip("inset", "inset", "Location inset", FC.inset)}</div></div>
      <div class="fl">Maps coloured by<div class="chips">${metrics.map(([k, m]) => chip("maps", k, m.n, FC.maps.includes(k))).join("")}</div></div>
      <div class="fl">Plots along the river<div class="chips">${plots.map(([k, n]) => chip("plots", k, n, FC.plots.includes(k))).join("")}</div></div></div>
    <div id="fcCmp"${FC.tpl !== "compare" ? ' style="display:none"' : ""}><label class="fl">Colour the maps by<select id="fcCm">${metrics.map(([k, m]) => `<option value="${k}"${FC.cmpMetric === k ? " selected" : ""}>${esc(m.n)}</option>`).join("")}</select></label><label class="chk"><input type="checkbox" id="fcSame"${FC.cmpSame !== false ? " checked" : ""}> Same scale for every river</label></div>
    <label class="fl">Columns<select id="fcCols"><option value="0"${!FC.cols ? " selected" : ""}>Automatic (fit the river's shape)</option>${[1, 2, 3, 4].map(v => `<option value="${v}"${FC.cols === v ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="fl">Text and symbol size (at the printed width)<select id="fcTxt">${[[1.7, "Small (≈5 pt at 180 mm)"], [2.2, "Medium (≈6–7 pt)"], [2.8, "Large (≈8 pt)"], [3.4, "Extra large (slides, posters)"]].map(([v, t]) => `<option value="${v}"${FC.text === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="chk"><input type="checkbox" id="fcLet"${FC.letters ? " checked" : ""}> Panel letters (a, b, c…)</label><label class="chk"><input type="checkbox" id="fcCap"${FC.caption ? " checked" : ""}> Caption with data sources and methods</label>
    <div id="fcPrev" class="fcprev"><p class="note">Press Preview.</p></div>
    <div class="btns"><button id="fcGo">Preview</button><button class="pri" id="fcExp">⬇ Export…</button><button id="fcX">Close</button></div>`);
  const read = () => { FC.tpl = $("fcTpl").value; FC.title = $("fcTitle").value.trim(); FC.cols = +$("fcCols").value; FC.text = +$("fcTxt").value; FC.letters = $("fcLet").checked; FC.caption = $("fcCap").checked; FC.cmpMetric = $("fcCm").value; FC.cmpSame = $("fcSame").checked; fcSave(); };
  $("fcTpl").onchange = () => { read(); $("fcOne").style.display = FC.tpl === "compare" ? "none" : ""; $("fcCmp").style.display = FC.tpl === "compare" ? "" : "none"; };
  document.querySelectorAll("#modalBox [data-fg]").forEach(b => b.onclick = () => { const g = b.dataset.fg, k = b.dataset.fk; if (g === "sat" || g === "inset") FC[g] = !FC[g]; else { const a = FC[g], j = a.indexOf(k); if (j >= 0) a.splice(j, 1); else a.push(k); } b.classList.toggle("on"); fcSave(); });
  let last = null;
  const build = async () => { read(); const p = $("fcPrev"); p.innerHTML = `<p class="note shimmer">Composing…</p>`; actSet("fc", "Composing the figure…"); try { last = await composeFigure(); p.innerHTML = last.replace(/<svg /, '<svg style="width:100%;height:auto" '); } catch(e){ console.error(e); p.innerHTML = `<p class="warn">${esc(e.message)}</p>`; last = null; } finally { actEnd("fc"); } return last; };
  $("fcGo").onclick = build; $("fcX").onclick = closeModal;
  $("fcExp").onclick = async () => { const svg = last || await build(); if (!svg) return; const name = (FC.title || (FC.tpl === "compare" ? "river_comparison" : (R && R.name) || "figure")) + "_figure"; exportDialog({name, title: "the composed figure", journalOpt: false, svg: () => svg}); };
}
/* entry points: Figures tab, clean view, map controls */
{ const _ocv2 = openCleanView; openCleanView = function(){ _ocv2(); const bt = document.querySelector("#cvWrap .cvbtn"); if (bt && !$("cvComp")){ const b = document.createElement("button"); b.className = "sm"; b.id = "cvComp"; b.textContent = "▦ Compose figure"; b.onclick = openComposer; bt.insertBefore(b, $("cvSvg")); } }; }
{ const b = $("xClean"); if (b) b.onclick = () => openCleanView(); const b2 = $("xClean2"); if (b2) b2.onclick = () => openCleanView(); }
{ const _rm4 = renderModules4; renderModules4 = function(){ _rm4(); const fe = $("x4-figures"); if (fe && !$("fcOpen")){ fe.insertAdjacentHTML("afterbegin", `<div class="card"><h4>Compose a figure</h4><p class="note">Satellite view, maps coloured by several measures, a location inset and the downstream plots in one figure with panel letters and a caption — for one river or for every river in the comparison.</p><div class="btns"><button class="pri sm" id="fcOpen">▦ Compose figure</button></div></div>`); $("fcOpen").onclick = openComposer; } }; }
{ const ctl = $("x7Ctl"); if (ctl && !$("x7Comp")){ const b = document.createElement("button"); b.id = "x7Comp"; b.title = "Compose a multi-panel figure"; b.setAttribute("aria-label", "Compose figure"); b.textContent = "▦"; b.onclick = openComposer; ctl.appendChild(b); const c = document.createElement("button"); c.id = "x7Cv"; c.title = "Clean view: the river alone, to scale, on white"; c.setAttribute("aria-label", "Clean view"); c.textContent = "⬜"; c.onclick = () => openCleanView(); ctl.insertBefore(c, $("x7Exp")); } }
