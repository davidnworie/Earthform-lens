/* ===================== Science-report slides: figure, caption, units, scale, sources ===================== */
// Each finding becomes a self-contained figure: a declarative title, a map panel (scale bar, north arrow, legend),
// an optional chart panel, the key measurements with units, a numbered figure caption with the method, and a source line.
const SCI = {bg:"#fbfaf6", ink:"#16191d", sub:"#4b525a", rule:"#d9d6cc", acc:"#0e5a8a", warn:"#a3461f"};
const SCI_REFS = [
  ["Leopold & Wolman 1957", "River channel patterns: braided, meandering and straight. USGS Prof. Paper 282-B.", "sinuosity above 1.5 = meandering"],
  ["Leopold & Wolman 1960", "River meanders. GSA Bulletin 71.", "meander wavelength ≈ 10–14 channel widths; bend radius ≈ 2–3 widths"],
  ["Hickin & Nanson 1975", "The character of channel migration on the Beatton River. GSA Bulletin 86.", "bends migrate fastest near radius ÷ width ≈ 2.5"],
  ["Seybold, Rothman & Kirchner 2017", "Climate's watermark in the geometry of stream networks. Geophysical Research Letters 44.", "junction angles ≈ 72° in humid, narrower in arid landscapes"],
  ["Strahler 1957; Horton 1945", "Stream ordering and network laws.", "bifurcation ratio typically 3–5"],
];
function lenUnits(maxPx){ if (!G.pxm) return {k: 1, u: "px"}; const m = maxPx*G.pxm; return m > 5000 ? {k: G.pxm/1000, u: "km"} : {k: G.pxm, u: "m"}; }
function sciConfidence(){ const W = G.chan ? G.chan.W : (G.chStats && G.chStats[0] ? G.chStats[0].st.W : 0); if (!G.pxm) return "no scale set: lengths are in pixels"; return W >= 5 ? "" : W >= 3 ? `channels are only ${W.toFixed(0)}–${(W*1.5).toFixed(0)} px wide: widths are approximate` : `channels are under 3 px wide: widths are unreliable`; }

/** chart and key numbers for each finding (added to findings after they are built) */
function sciEnrich(F){
  const c = G.chan, sc = G.pxm || 1, L = v => U.L(v).s;
  for (const f of F){
    f.stats = f.stats || null; f.chart = f.chart || null;
    if (f.key === "path" && c){ const u = lenUnits(c.len), uw = lenUnits(Math.max(...c.w)); f.stats = [["Channel length", L(c.len)], ["Straight-line distance", L(c.straight)], ["Sinuosity", (c.len/c.straight).toFixed(2)]];
      f.chart = {type:"line", x: c.s.map(v => v*u.k), y: Array.from(gauss1d(Float64Array.from(c.w), 6), v => v*uw.k), xlab:`Distance from outlet (${u.u})`, ylab:`Width (${uw.u})`, title:"Channel width downstream → upstream"}; }
    if (f.key === "bends" && c){ const rw = c.bends.map(b => b.Rc/c.W).filter(Number.isFinite); f.stats = [["Bends", String(c.bends.length)], ["Median radius ÷ width", median(rw).toFixed(2)], ["Wavelength ÷ width", (c.lambda/c.W).toFixed(1)]];
      f.chart = {type:"hist", v: rw.filter(v => v < 12), xlab:"Bend radius ÷ channel width", ylab:"Bends", band:[2, 3], bandLabel:"typical 2–3"}; }
    if (f.key === "tribs" && G.branches){ const A = G.branches.tribs.map(o => o.angle).filter(Number.isFinite); f.stats = [["Tributaries", String(G.branches.tribs.length)], ["Median junction angle", A.length ? median(A).toFixed(0) + "°" : "–"], ["Left / right bank", `${G.branches.left} / ${G.branches.right}`]];
      if (A.length >= 3) f.chart = {type:"hist", v: A, xlab:"Junction angle (°)", ylab:"Tributaries", band:[65, 79], bandLabel:"humid ≈ 72°"}; }
    if ((f.key === "rivers" || f.key === "compare" || f.key === "cmp" || f.key === "channels") && G.chStats){
      const rows = f.key === "rivers" ? G.chStats.filter(r => r.type === "major") : f.key === "cmp" ? exSelected() : G.chStats.slice().sort((a, b) => b.st.len - a.st.len).slice(0, 6);
      const u = lenUnits(Math.max(...rows.map(r => r.st.len)));
      if (rows.length >= 2) f.chart = {type:"bars", labels: rows.map(r => chName(r)), v: rows.map(r => r.st.len*u.k), v2: rows.map(r => r.st.sin), cols: rows.map(r => exColor(r.id)), xlab:`Length (${u.u})`, x2lab:"Sinuosity"};
      f.stats = rows.slice(0, 3).map(r => [chName(r), `${L(r.st.len)} · ${Number.isFinite(r.st.sin) ? r.st.sin.toFixed(2) + "×" : "–"}`]); }
    if (f.key === "network" && G.net && G.net.lines){ const cnt = {}; for (const l of G.net.lines) cnt[l.order] = (cnt[l.order] || 0) + 1; const ks = Object.keys(cnt).map(Number).sort((a, b) => a - b);
      f.stats = [["Highest order", String(G.net.maxO)], ["Bifurcation ratio", fx(G.net.Rb, 2)], ["Channel heads", String(G.net.sources)]];
      f.chart = {type:"bars", labels: ks.map(k => "Order " + k), v: ks.map(k => cnt[k]), cols: ks.map(k => `hsl(${200 - 25*(k - 1)},70%,${55 - 4*k}%)`), xlab:"Channel segments"}; }
    if (f.key === "change" && G.sv){ const iv = G.sv.intervals[G.sv.sel]; f.chart = {type:"bars", labels:["Water → land", "Land → water"], v:[(iv.dep || 0)*sc*sc/1e6, (iv.ero || 0)*sc*sc/1e6], cols:["#2e8b57", "#c0392b"], xlab: G.pxm ? "Area (km²)" : "Area (px²)"}; if (!G.pxm) f.chart.v = [iv.dep || 0, iv.ero || 0]; }
    if (f.key === "lakes" && G.lakes){ const el = G.lakes.lakes.map(l => l.elong).filter(v => Number.isFinite(v) && v < 8); if (el.length >= 5) f.chart = {type:"hist", v: el, xlab:"Lake elongation (long ÷ short axis)", ylab:"Lakes"}; }
    if (!f.stats) f.stats = [[f.bigLabel, f.big]];
    // plain declarative titles for reporting
    const riv = G.seafloor ? "channel" : "river";
    if (f.key === "path" && c) f.sciTitle = `Main ${riv}: sinuosity ${(c.len/c.straight).toFixed(2)} over ${L(c.len)} of channel`;
    if (f.key === "bends" && c) f.sciTitle = `${c.bends.length} meander bends; median radius ${(c.Rc/c.W).toFixed(1)} channel widths`;
    if (f.key === "tribs" && G.branches){ const A = G.branches.tribs.map(o => o.angle).filter(Number.isFinite); f.sciTitle = `${G.branches.tribs.length} tributar${G.branches.tribs.length === 1 ? "y" : "ies"} join the main ${riv}${A.length ? `; median junction angle ${median(A).toFixed(0)}°` : ""}`; }
    if (f.key === "rivers" && G.rivers){ const M = G.rivers.filter(r => r.major); f.sciTitle = `${M.length} major rivers identified in the scene`; }
    if (f.key === "neck") f.sciTitle = `Narrow meander neck: ${f.big} between two loops`;
    if (f.key === "oxbows") f.sciTitle = `${f.big} oxbow lakes (abandoned meander loops)`;
    if (f.key === "network" && G.net) f.sciTitle = `Channel network reaches Strahler order ${G.net.maxO}; bifurcation ratio ${fx(G.net.Rb, 1)}`;
    if (f.key === "dists" && G.branches) f.sciTitle = `${G.branches.dists.length} distributar${G.branches.dists.length === 1 ? "y leaves" : "ies leave"} the main ${riv}`;
    if (f.key === "lakes" && G.lakes) f.sciTitle = `${G.lakes.lakes.length} lakes and ponds cover ${disp("lakes", "Lake cover (limnicity)")} of the land`;
  }
  return F;
}

function sciWrap(ctx, text, maxW, maxLines){ const L = wrapText(ctx, text, maxW); if (L.length > maxLines){ L.length = maxLines; L[maxLines - 1] = L[maxLines - 1].replace(/\s+\S*$/, "") + "…"; } return L; }
function sciScaleBar(ctx, cr, X, Y, W, H){
  if (!G.pxm) return; const s = W/cr.w, target = W*.22, m = target/s*G.pxm, p = Math.pow(10, Math.floor(Math.log10(m))), nice = [1, 2, 5, 10].map(k => k*p).filter(k => k <= m).pop() || p, wpx = nice/G.pxm*s;
  const x = X + 18, y = Y + H - 22, lab = nice >= 1000 ? `${nice/1000} km` : `${nice} m`;
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(x - 8, y - 26, wpx + 16, 36);
  ctx.fillStyle = SCI.ink; ctx.fillRect(x, y, wpx/2, 6); ctx.fillStyle = "#fff"; ctx.fillRect(x + wpx/2, y, wpx/2, 6); ctx.strokeStyle = SCI.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, wpx, 6);
  ctx.fillStyle = SCI.ink; ctx.font = `600 17px ${SANS}`; ctx.fillText("0", x - 4, y - 6); ctx.textAlign = "right"; ctx.fillText(lab, x + wpx + 4, y - 6); ctx.textAlign = "left";
}
function sciNorth(ctx, x, y, r){
  const a = -(G.north || 0)*Math.PI/180; ctx.save(); ctx.translate(x, y); ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, 7); ctx.fill(); ctx.rotate(a);
  ctx.fillStyle = SCI.ink; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r*.45, r*.55); ctx.lineTo(0, r*.25); ctx.closePath(); ctx.fill(); ctx.strokeStyle = SCI.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(-r*.45, r*.55); ctx.lineTo(0, r*.25); ctx.closePath(); ctx.stroke();
  ctx.rotate(-a); ctx.font = `700 16px ${SANS}`; ctx.textAlign = "center"; ctx.fillText("N", 0, -r - 1 + (Math.abs(a) > .5 ? 0 : 0) - 0); ctx.textAlign = "left"; ctx.restore();
}
function sciLegend(ctx, items, xR, yB){
  if (!items || !items.length) return; ctx.font = `500 17px ${SANS}`; const w = Math.max(...items.map(i => ctx.measureText(i[1]).width)) + 46, h = items.length*25 + 14, x = xR - w - 12, y = yB - h - 12;
  ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = SCI.rule; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w, h);
  items.forEach((it, i) => { const yy = y + 20 + i*25; ctx.strokeStyle = it[0]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 10, yy - 6); ctx.lineTo(x + 30, yy - 6); ctx.stroke(); ctx.fillStyle = SCI.ink; ctx.fillText(it[1], x + 38, yy); });
}
function sciPanelLetter(ctx, x, y, t){ ctx.fillStyle = "#fff"; ctx.fillRect(x, y, 30, 30); ctx.fillStyle = SCI.ink; ctx.font = `700 19px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(t, x + 15, y + 21); ctx.textAlign = "left"; }
function sciChart(ctx, ch, X, Y, W, H){
  ctx.save(); ctx.fillStyle = "#fff"; ctx.fillRect(X, Y, W, H); ctx.strokeStyle = SCI.rule; ctx.strokeRect(X + .5, Y + .5, W - 1, H - 1);
  const m = {l: 78, r: 22, t: ch.title ? 34 : 18, b: 50}, px = X + m.l, py = Y + m.t, pw = W - m.l - m.r, ph = H - m.t - m.b;
  ctx.font = `500 16px ${SANS}`; ctx.fillStyle = SCI.sub; if (ch.title) ctx.fillText(ch.title, px, Y + 24);
  const tick = (lo, hi, n) => niceTicks(lo, hi, n);
  if (ch.type === "bars"){
    const n = ch.v.length, mx = Math.max(...ch.v, 1e-9), bh = Math.min(30, ph/n*.7), lw = Math.min(220, W*.32), bx = X + lw, bw = W - lw - 90;
    ch.labels.forEach((lab, i) => { const y = py + (i + .5)*ph/n; ctx.fillStyle = SCI.ink; ctx.font = `500 16px ${SANS}`; ctx.textAlign = "right"; ctx.fillText(String(lab).slice(0, 22), bx - 10, y + 5); ctx.textAlign = "left";
      ctx.fillStyle = ch.cols ? ch.cols[i] : SCI.acc; ctx.fillRect(bx, y - bh/2, Math.max(2, bw*ch.v[i]/mx), bh);
      ctx.fillStyle = SCI.ink; ctx.font = `500 15px ${SANS}`; ctx.fillText(tfmt(ch.v[i]) + (ch.v2 && Number.isFinite(ch.v2[i]) ? `  (${ch.v2[i].toFixed(2)}×)` : ""), bx + Math.max(2, bw*ch.v[i]/mx) + 6, y + 5); });
    ctx.fillStyle = SCI.sub; ctx.font = `500 15px ${SANS}`; ctx.fillText(ch.xlab + (ch.v2 ? "   (sinuosity in brackets)" : ""), bx, Y + H - 14);
  } else {
    let xs, ys, bars = null;
    if (ch.type === "hist"){ const v = ch.v, lo = Math.min(...v, ch.band ? ch.band[0] : Infinity), hi = Math.max(...v, ch.band ? ch.band[1] : -Infinity), nb = clamp(Math.round(Math.sqrt(v.length)*1.5), 5, 18), bw = (hi - lo)/nb || 1, cnt = new Array(nb).fill(0);
      v.forEach(x => cnt[Math.min(nb - 1, Math.floor((x - lo)/bw))]++); bars = cnt.map((c, i) => [lo + i*bw, lo + (i + 1)*bw, c]); xs = [lo, hi]; ys = [0, Math.max(...cnt)]; }
    else { xs = ch.x; ys = ch.y; }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = ch.type === "hist" ? 0 : Math.min(0, Math.min(...ys)), y1 = Math.max(...ys)*1.08 || 1;
    const TX = v => px + (v - x0)/((x1 - x0) || 1)*pw, TY = v => py + ph - (v - y0)/((y1 - y0) || 1)*ph;
    if (ch.band){ ctx.fillStyle = "rgba(14,90,138,.10)"; ctx.fillRect(TX(ch.band[0]), py, TX(ch.band[1]) - TX(ch.band[0]), ph); ctx.fillStyle = SCI.acc; ctx.font = `500 14px ${SANS}`; ctx.fillText(ch.bandLabel || "", TX(ch.band[0]) + 4, py + 16); }
    ctx.strokeStyle = SCI.rule; ctx.lineWidth = 1; ctx.font = `500 14px ${SANS}`; ctx.fillStyle = SCI.sub;
    for (const t of tick(y0, y1, 4)){ const y = TY(t); ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(tfmt(t), px - 8, y + 5); }
    ctx.textAlign = "center"; for (const t of tick(x0, x1, 5)) ctx.fillText(tfmt(t), TX(t), py + ph + 22); ctx.textAlign = "left";
    if (bars){ ctx.fillStyle = SCI.acc; for (const [a, b, c] of bars) ctx.fillRect(TX(a) + 1, TY(c), Math.max(1, TX(b) - TX(a) - 2), py + ph - TY(c)); }
    else { ctx.strokeStyle = SCI.acc; ctx.lineWidth = 2.5; ctx.beginPath(); const st = Math.max(1, Math.floor(xs.length/600)); for (let i = 0; i < xs.length; i += st){ const X2 = TX(xs[i]), Y2 = TY(ys[i]); i ? ctx.lineTo(X2, Y2) : ctx.moveTo(X2, Y2); } ctx.stroke(); }
    ctx.strokeStyle = SCI.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph); ctx.lineTo(px + pw, py + ph); ctx.stroke();
    ctx.fillStyle = SCI.sub; ctx.font = `500 15px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(ch.xlab, px + pw/2, Y + H - 8);
    ctx.save(); ctx.translate(X + 20, py + ph/2); ctx.rotate(-Math.PI/2); ctx.fillText(ch.ylab || "", 0, 0); ctx.restore(); ctx.textAlign = "left";
  }
  ctx.restore();
}
function sciMeta(){ const m = G.post.meta || {}; return {src: m.src || "Google Earth", date: m.date || "", author: m.author || ""}; }
function sciFooter(ctx, W, H, M, idx, total){
  const mt = sciMeta(), parts = [`Imagery: ${mt.src}${mt.date ? ", " + mt.date : ""}`, G.pxm ? `pixel size ${G.pxm.toPrecision(3)} m` : "no scale set (lengths in pixels)", "Analysis: Earthform Lens"].concat(mt.author ? [mt.author] : []);
  ctx.strokeStyle = SCI.rule; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(M, H - M*.95); ctx.lineTo(W - M, H - M*.95); ctx.stroke();
  ctx.fillStyle = SCI.sub; ctx.font = `500 16px ${SANS}`; const L = sciWrap(ctx, parts.join("  ·  "), W - 2*M - 70, 2); L.forEach((l, i) => ctx.fillText(l, M, H - M*.95 + 24 + i*20));
  ctx.textAlign = "right"; ctx.fillText(`${idx + 1}/${total}`, W - M, H - M*.95 + 24); ctx.textAlign = "left";
}
function sciHeader(ctx, W, M, kicker){
  const place = placeName(), type = landscapeType();
  ctx.fillStyle = SCI.acc; ctx.font = `700 17px ${SANS}`; ctx.fillText(((kicker || type) + "").toUpperCase(), M, M + 6);
  ctx.fillStyle = SCI.sub; ctx.font = `500 17px ${SANS}`; ctx.textAlign = "right"; ctx.fillText((place && place !== type ? place : type).slice(0, 40), W - M, M + 6); ctx.textAlign = "left";
}
function renderSciSlide(cv, slide, idx, total, opt){
  const [W, H] = POST_FMT[opt.fmt || "4:5"], ctx = cv.getContext("2d"), M = 56; cv.width = W; cv.height = H;
  ctx.fillStyle = SCI.bg; ctx.fillRect(0, 0, W, H); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const place = placeName(), type = landscapeType(), F = (G.findings || []).filter(f => !G.post.edits[f.key] || !G.post.edits[f.key].off);
  const figNo = slide.kind === "finding" ? idx : null, footY = H - M*.95;
  if (slide.kind === "cover"){
    sciHeader(ctx, W, M, "Satellite image analysis");
    ctx.fillStyle = SCI.ink; const t = slide.title || (place && place !== type ? place : type); const ts = fitFont(ctx, t, W - 2*M, 60, 700, SERIF, 34); let y = M + 30 + ts;
    sciWrap(ctx, t, W - 2*M, 2).forEach((l, i) => { ctx.font = `700 ${ts}px ${SERIF}`; ctx.fillText(l, M, y + i*ts*1.15); }); y += ts*1.15*(Math.min(2, wrapText(ctx, t, W - 2*M).length) - 1) + 14;
    ctx.fillStyle = SCI.sub; ctx.font = `italic 400 26px ${SERIF}`; ctx.fillText(`${type}: what the image shows, measured`, M, y + 22); y += 46;
    const fh = Math.round(H*.43), fy = y; const ov = F.find(f => f.key === "rivers") || F.find(f => f.key === "path") || null;
    const cr = drawScene(ctx, ov ? {geom: ov.geom.filter(g => g.t !== "pin"), box: null} : null, M, fy, W - 2*M, fh, {dim: false, noPins: true, lw: .9}); ctx.strokeStyle = SCI.rule; ctx.strokeRect(M + .5, fy + .5, W - 2*M - 1, fh - 1);
    sciScaleBar(ctx, cr, M, fy, W - 2*M, fh); sciNorth(ctx, W - M - 34, fy + 40, 18); if (ov) sciLegend(ctx, ov.legend, W - M, fy + fh);
    y = fy + fh + 44; ctx.fillStyle = SCI.ink; ctx.font = `700 22px ${SANS}`; ctx.fillText("KEY FINDINGS", M, y); y += 10;
    for (const f of F.slice(0, H > W*1.5 ? 6 : 4)){ ctx.font = `400 24px ${SERIF}`; const L = sciWrap(ctx, `${f.sciTitle || f.title}`, W - 2*M - 30, 2); if (y + L.length*31 + 10 > footY - 10) break; ctx.fillStyle = SCI.acc; ctx.fillRect(M, y + 16, 10, 10); ctx.fillStyle = SCI.ink; L.forEach((l, i) => ctx.fillText(l, M + 26, y + 28 + i*30)); y += L.length*30 + 12; }
    sciFooter(ctx, W, H, M, idx, total); return;
  }
  if (slide.kind === "summary"){
    sciHeader(ctx, W, M, "Measurements & methods"); let y = M + 52; ctx.fillStyle = SCI.ink; ctx.font = `700 40px ${SERIF}`; ctx.fillText("Summary of measurements", M, y); y += 26;
    const st = (G.keyStats || keyStats()).slice(0, 10); ctx.font = `500 25px ${SANS}`;
    for (const s of st){ y += 46; ctx.fillStyle = SCI.sub; ctx.fillText(s.label, M, y); ctx.fillStyle = SCI.ink; ctx.textAlign = "right"; ctx.font = `600 25px "JetBrains Mono", monospace`; ctx.fillText(s.value, W - M, y); ctx.textAlign = "left"; ctx.font = `500 25px ${SANS}`; ctx.strokeStyle = SCI.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(M, y + 12); ctx.lineTo(W - M, y + 12); ctx.stroke(); }
    y += 50; ctx.fillStyle = SCI.ink; ctx.font = `700 21px ${SANS}`; ctx.fillText("METHOD", M, y); ctx.font = `400 22px ${SANS}`; ctx.fillStyle = SCI.sub;
    const meth = `${G.seafloor ? "Incised troughs traced in seafloor shading with a multi-scale Hessian valley filter." : G.isMap ? "Rivers taken from the blue line work of a drawn map." : "Water mapped by k-means colour clustering and a logistic-regression classifier trained on the image's own pixels."} Centrelines from the skeleton of the water mask; width = 2 × distance to the nearest bank; bends between curvature inflections; networks split into rivers at junctions by water colour and upstream size.`;
    for (const l of sciWrap(ctx, meth, W - 2*M, 6)){ y += 30; ctx.fillText(l, M, y); }
    const lim = sciConfidence(); y += 40; ctx.fillStyle = SCI.ink; ctx.font = `700 21px ${SANS}`; ctx.fillText("LIMITATIONS", M, y); ctx.font = `400 22px ${SANS}`; ctx.fillStyle = SCI.warn;
    for (const l of sciWrap(ctx, `Single image, no field validation; water detection can miss narrow or shaded channels and include bare ground of similar colour. Flow direction is inferred, not measured.${lim ? " Also: " + lim + "." : ""}`, W - 2*M, 5)){ y += 30; ctx.fillText(l, M, y); }
    y += 40; ctx.fillStyle = SCI.ink; ctx.font = `700 21px ${SANS}`; if (y < footY - 80){ ctx.fillText("REFERENCE VALUES", M, y); ctx.font = `400 19px ${SANS}`; ctx.fillStyle = SCI.sub;
      for (const [a, b, c] of SCI_REFS){ const L = sciWrap(ctx, `${a}: ${c}. ${b}`, W - 2*M, 2); if (y + L.length*25 + 14 > footY - 8) break; L.forEach(l => { y += 25; ctx.fillText(l, M, y); }); y += 6; } }
    sciFooter(ctx, W, H, M, idx, total); return;
  }
  // finding figure
  const f = slide.f; sciHeader(ctx, W, M, f.kicker);
  const edited = G.post.edits[f.key] && G.post.edits[f.key].title; ctx.fillStyle = SCI.ink; ctx.font = `700 38px ${SERIF}`; const TL = sciWrap(ctx, (edited ? f.title : f.sciTitle || f.title) || "", W - 2*M, 3); let y = M + 30; TL.forEach(l => { y += 46; ctx.fillText(l, M, y); }); y += 22;
  // stats row
  const stats = (f.stats || []).slice(0, 3), sw = (W - 2*M)/Math.max(1, stats.length);
  ctx.font = `400 22px ${SERIF}`; const cap = `Figure ${figNo}. ${f.text} ${f.why ? "Method: " + f.why : ""}`, CL = sciWrap(ctx, cap, W - 2*M, H > W*1.5 ? 7 : 5);
  const statH = stats.length ? 82 : 0, capH = CL.length*28 + 10, chartH = f.chart ? Math.round(Math.min(300, (H - y - statH - capH - (H - footY) - 40)*.38)) : 0;
  const figH = Math.max(260, footY - 24 - capH - statH - (chartH ? chartH + 16 : 0) - y - 12);
  const cr = drawScene(ctx, f, M, y, W - 2*M, figH, {dim: false, lw: .9}); ctx.strokeStyle = SCI.rule; ctx.lineWidth = 1; ctx.strokeRect(M + .5, y + .5, W - 2*M - 1, figH - 1);
  sciPanelLetter(ctx, M + 10, y + 10, "a"); sciScaleBar(ctx, cr, M, y, W - 2*M, figH); sciNorth(ctx, W - M - 34, y + 40, 18); sciLegend(ctx, f.legend, W - M, y + figH);
  if (f.box){ const iw = 150, ih = Math.round(iw*G.h/G.w), ix = W - M - iw - 78, iy = y + 12; if (ih < figH*.5){ ctx.fillStyle = "#fff"; ctx.fillRect(ix - 3, iy - 3, iw + 6, ih + 6); ctx.drawImage(storySource(), ix, iy, iw, ih); const crb = cropFor(f.box, (W - 2*M)/figH), k = iw/G.w; ctx.strokeStyle = "#e0402b"; ctx.lineWidth = 2.5; ctx.strokeRect(ix + crb.x*k, iy + crb.y*k, crb.w*k, crb.h*k); } }
  y += figH + 14;
  if (f.chart && chartH > 140){ sciChart(ctx, f.chart, M, y, W - 2*M, chartH); sciPanelLetter(ctx, M + 8, y + 8, "b"); y += chartH + 14; }
  if (stats.length){ stats.forEach((s, i) => { const x = M + i*sw; ctx.fillStyle = SCI.sub; ctx.font = `500 16px ${SANS}`; ctx.fillText(String(s[0]).toUpperCase().slice(0, 28), x, y + 22); ctx.fillStyle = SCI.ink; fitFont(ctx, s[1], sw - 18, 30, 700, SERIF, 18); ctx.fillText(s[1], x, y + 58); }); y += statH; }
  ctx.fillStyle = SCI.ink; ctx.font = `400 22px ${SERIF}`; CL.forEach((l, i) => { if (i === 0){ const fw = `Figure ${figNo}.`; ctx.font = `700 22px ${SERIF}`; ctx.fillText(fw, M, y + 22); const off = ctx.measureText(fw + " ").width; ctx.font = `400 22px ${SERIF}`; ctx.fillText(l.slice(fw.length + 1), M + off, y + 22); } else ctx.fillText(l, M, y + 22 + i*28); });
  const warn = sciConfidence(); if (warn){ ctx.fillStyle = SCI.warn; ctx.font = `600 16px ${SANS}`; ctx.fillText("⚠ " + warn, M, footY - 10); }
  sciFooter(ctx, W, H, M, idx, total);
}
function sciCaption(){
  const place = placeName(), type = landscapeType(), sl = deckSlides().filter(s => s.kind === "finding"), mt = sciMeta();
  const L = [`${type}${place && place !== type ? " — " + place : ""}: geomorphological measurements from a single satellite image.`, "", "Key findings:"];
  sl.forEach((s, i) => L.push(`• ${s.f.sciTitle || s.f.title}. ${(s.f.stats || []).map(x => `${x[0]}: ${x[1]}`).join("; ")} (Fig. ${i + 2}).`));
  L.push("", `Method: ${G.isMap ? "rivers from the map's blue line work" : "water mapped by colour clustering and an image-trained classifier"}; centrelines from the water-mask skeleton; widths from distance to banks; bends between curvature inflections. Reference values: Leopold & Wolman (1957, 1960); Seybold et al. (2017).`);
  L.push(`Data: ${mt.src}${mt.date ? " (" + mt.date + ")" : ""}${G.pxm ? `, ${G.pxm.toPrecision(3)} m per pixel` : "; no scale set, lengths in pixels"}. Single image, not field-validated; flow direction inferred.`);
  if (mt.author) L.push(mt.author);
  L.push("", hashtags()); return L.join("\n");
}
