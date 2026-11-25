/* ===================== Earthform Lens — river batches that run in the background =====================
   The batch runs in a hidden copy of the app (an invisible frame on the same page). It writes into the same libraries
   (IndexedDB) and reports progress by message, so the visible app stays free for other work. */
const EFL_WORKER = /[?&]efl-batch=1/.test(location.search);
/* one background batch at a time across tabs: the worker beats a lock every 4 s; another tab will not start a second one */
const RV_OWNER = (() => { try { let v = sessionStorage.getItem("efl.tab"); if (!v){ v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("efl.tab", v); } return (location.search.match(/[?&]owner=(\w+)/) || [])[1] || v; } catch(_){ return "x"; } })();
function rvLock(){ try { return JSON.parse(localStorage.getItem("efl.rvlock") || "null"); } catch(_){ return null; } }
const rvChan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("efl-batch") : null;
function rvEta(B){ const d = B.jobs.filter(j => j.status === "done" && j.secs), left = B.jobs.filter(j => j.status === "waiting" || j.status === "running").length; if (!d.length || !left) return ""; const s = d.reduce((a, j) => a + j.secs, 0)/d.length*left; return ` · about ${s > 5400 ? nf(s/3600, 1) + " h" : Math.max(1, Math.round(s/60)) + " min"} left`; }
let rvWake = null;
async function wakeOn(){ try { if (navigator.wakeLock && !rvWake){ rvWake = await navigator.wakeLock.request("screen"); rvWake.addEventListener("release", () => { rvWake = null; }); } } catch(_){} }
function wakeOff(){ try { if (rvWake) rvWake.release(); } catch(_){} rvWake = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && XR.rvBatch && XR.rvBatch.bgRunning && XR.rvBatch.wake !== false) wakeOn(); });

if (EFL_WORKER){
  /* ---- inside the hidden frame: run the saved list, report each step ---- */
  const post = (type) => { try { rvChan && rvChan.postMessage({type, batch: XR.rvBatch}); } catch(_){} };
  { const _s = rvSaveBatch; rvSaveBatch = function(){ _s(); post("progress"); }; }
  { const _r = rvRender; rvRender = function(){ post("progress"); }; }
  if (rvChan) rvChan.onmessage = e => { const d = e.data || {}; if (d.cmd === "stop" && XR.rvBatch) XR.rvBatch.stop = true; if (d.cmd === "ping") post("progress"); };
  const beat = () => { try { localStorage.setItem("efl.rvlock", JSON.stringify({owner: RV_OWNER, t: Date.now()})); } catch(_){} }; beat(); const beatT = setInterval(beat, 4000);
  window.addEventListener("pagehide", () => { try { const l = rvLock(); if (l && l.owner === RV_OWNER) localStorage.removeItem("efl.rvlock"); } catch(_){} });
  setTimeout(async () => {
    try { const w = document.querySelector('.seg button[data-ws=explore]'); if (w) w.click(); } catch(_){}
    let b = null; try { b = JSON.parse(localStorage.getItem("efl.rvbatch") || "null"); } catch(_){}
    if (!b || !b.jobs){ post("done"); return; } b.running = false; b.bgRunning = true; b.jobs.forEach(j => { if (j.status === "running") j.status = "waiting"; }); XR.rvBatch = b;
    try { await rvRunBatch(); } catch(e){ console.error(e); } XR.rvBatch.bgRunning = false; XR.rvBatch.running = false; try { localStorage.setItem("efl.rvbatch", JSON.stringify(XR.rvBatch)); } catch(_){} clearInterval(beatT); try { localStorage.removeItem("efl.rvlock"); } catch(_){} post("done");
  }, 900);
} else {
  /* ---- in the visible app: start / stop the frame and show its progress ---- */
  let rvT = 0;
  window.rvStartWorker = function(){
    if ($("rvWorker")) return; const B = XR.rvBatch; if (!B) return; const lk = rvLock(); if (lk && lk.owner !== RV_OWNER && Date.now() - lk.t < 12000){ toast("A river batch is already running in another tab or window of this app — wait for it, or pause it there.", 6000); return false; } B.bgRunning = true; B.running = false; rvSaveBatch();
    const f = document.createElement("iframe"); f.id = "rvWorker"; f.title = "background river batch"; f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.src = location.href.split(/[?#]/)[0] + "?efl-batch=1&owner=" + RV_OWNER; f.style.cssText = "position:fixed;left:-13000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(f); if (B.wake !== false) wakeOn(); rvRender(); xstatus("River batch running in the background — keep using the app; progress is in Compare → Analyse a list of rivers (☰ Many rivers).", "ok");
  };
  window.rvStopWorker = function(){ try { rvChan && rvChan.postMessage({cmd: "stop"}); } catch(_){} };
  const finish = B => { const f = $("rvWorker"); if (f) f.remove(); if (XR.rvBatch) XR.rvBatch.bgRunning = false; wakeOff(); document.title = "Earthform Lens"; DNLIB = null; rvRender(); dnRender && XR.tab === "dnet" && dnRender();
    const ok = B ? B.jobs.filter(j => j.status === "done").length : 0, left = B ? B.jobs.filter(j => j.status === "waiting").length : 0; xstatus(left ? `River batch paused: ${ok} done, ${left} to go. Press Resume to continue.` : `River batch finished: ${ok} of ${B ? B.jobs.length : 0} rivers analysed and stored.`, "ok"); if (!left) toast("River batch finished", 5000); };
  if (rvChan) rvChan.onmessage = e => { const d = e.data || {}; if (!d.batch) return; if (d.type === "done"){ XR.rvBatch = Object.assign(d.batch, {bgRunning: false, running: false}); finish(XR.rvBatch); return; }
    XR.rvBatch = Object.assign(d.batch, {bgRunning: true, running: false}); const B = XR.rvBatch, fin = B.jobs.filter(j => j.status === "done" || j.status === "failed").length; document.title = `(${fin}/${B.jobs.length}) Earthform Lens`; actSet("rvb", `Rivers in the background: ${fin} of ${B.jobs.length}`, fin/B.jobs.length);
    DNLIB = null; clearTimeout(rvT); rvT = setTimeout(() => { rvRender(); if (XR.tab === "dnet") try { dnRender(); } catch(_){} }, 600); if (fin === B.jobs.length) actEnd("rvb"); };
  // a batch that was running when the page closed carries on by itself
  setTimeout(() => { const B = XR.rvBatch; if (B && B.bgPref !== false && (B.bgRunning || B.running) && B.jobs.some(j => j.status === "waiting" || j.status === "running")){ B.jobs.forEach(j => { if (j.status === "running") j.status = "waiting"; }); toast("Resuming the river batch in the background", 4000); rvStartWorker(); } }, 2500);
}

/* ---- the channel network you were working on comes back after a reload ---- */
if (!EFL_WORKER){
  let dnSaveT = 0;
  const dnPersist = () => { clearTimeout(dnSaveT); dnSaveT = setTimeout(() => { try { const N = XR.dn; if (!N || !N.lines){ localStorage.removeItem("efl.lastNet"); return; } const v = N.lines.reduce((a, l) => a + l.pts.length, 0); if (v > 30000) return;
    localStorage.setItem("efl.lastNet", JSON.stringify({name: N.name, src: N.src, lines: N.lines, directed: N.directed, osm: N.osm, apex: N.apex, apexGuess: N.apexGuess, manual: N.manual || null, widths: N.segs ? N.segs.filter(s => Number.isFinite(s.wmean)).map(s => [s.nodes[0] + ">" + s.nodes[s.nodes.length - 1], s.wi, s.wh, s.wf, s.wmean, s.wsrc]) : []})); } catch(_){} }, 1200); };
  { const _b = dnBuild; dnBuild = function(){ const r = _b.apply(this, arguments); if (!XR._dnRestoring && XR.dn && XR.dn === XR.dnLive) dnPersist(); return r; }; }
  { const _r = dnRender; dnRender = function(){ XR.dnLive = XR.dn; _r.apply(this, arguments); if (XR.dn && XR.dn.segs) dnPersist(); else if (!XR.dn) try { localStorage.removeItem("efl.lastNet"); } catch(_){} }; }
  setTimeout(() => { if (XR.dn) return; let o = null; try { o = JSON.parse(localStorage.getItem("efl.lastNet") || "null"); } catch(_){} if (!o || !o.lines) return;
    XR._dnRestoring = true; try { XR.dn = {name: o.name, src: o.src, lines: o.lines, directed: o.directed, osm: o.osm, apex: o.apex, apexGuess: o.apexGuess, manual: o.manual, segs: null, made: new Date().toISOString()}; dnBuild();
      const W = new Map((o.widths || []).map(w => [w[0], w])); for (const s of XR.dn.segs){ const w = W.get(s.nodes[0] + ">" + s.nodes[s.nodes.length - 1]); if (w && !Number.isFinite(s.wmean)){ [, s.wi, s.wh, s.wf, s.wmean, s.wsrc] = w; } } dnAngles(); dnSummary(); XR.dnLive = XR.dn; xmap && xmap.req(); if (!XR.river){ XR.dnOpen = true; dnRender(); } }
    catch(e){ console.warn("restore network", e); XR.dn = null; } finally { XR._dnRestoring = false; } }, 1800);
}

/* ---- sediment-routing labels: explicit rule settings, an unknown class, raw scores kept ---- */
ZONE_CAT.push(["unknown", "Unknown (weak or missing evidence)", "#bdbdbd"]);
XR.zoneOpt = Object.assign({slopeMode: "relative", hiAbs: 2, loAbs: .2, prior: true, unknownMargin: .5}, (() => { try { return JSON.parse(localStorage.getItem("efl.zoneopt")) || {}; } catch(_){ return {}; } })());
/* rule settings, the circularity warning and the raw scores, in the sediment tab */
{ const _rmz = renderModules4; renderModules4 = function(){ _rmz(); try { const R = XR.river, el = $("xSedStats"); if (!R || !el || !R.reaches || !R.reaches.some(r => r.zone) || el.querySelector(".x13z")) return; const ZO = XR.zoneOpt, unk = R.reaches.filter(r => r.zone === "unknown").reduce((a, r) => a + r.L, 0);
    el.insertAdjacentHTML("afterbegin", `<div class="card x13z"><p class="warn"><b>These are hypotheses, not measurements.</b> Zones come from rules (slope classes, confinement, channel pattern, power change, dams, delta${ZO.prior !== false ? ", an upstream prior" : ""}). Testing “alternation” with these labels alone tests the rules: compare them with independent evidence (repeat surveys, dated deposits, sediment flux) before drawing conclusions.</p>
      <p class="note">Rule ${esc(R.zoneRule ? R.zoneRule.version : "")}: slope classes by ${esc(R.zoneRule ? R.zoneRule.slopeClasses : "")}. Unknown: ${km(unk)} (${nf(100*unk/R.L, 0)} %) where the top two zones are within ${ZO.unknownMargin} points or no indicator is available.</p>
      <div class="pgrid"><label>Slope classes<select id="zoMode"><option value="relative"${ZO.slopeMode !== "absolute" ? " selected" : ""}>Within this river (terciles)</option><option value="absolute"${ZO.slopeMode === "absolute" ? " selected" : ""}>Absolute thresholds (same for every river)</option></select></label><label>Steep ≥ (m/km)<input type="number" id="zoHi" step="0.1" value="${ZO.hiAbs}"></label><label>Gentle ≤ (m/km)<input type="number" id="zoLo" step="0.05" value="${ZO.loAbs}"></label><label>Unknown if margin <<input type="number" id="zoUm" step="0.25" value="${ZO.unknownMargin}"></label><label class="chk"><input type="checkbox" id="zoPr"${ZO.prior !== false ? " checked" : ""}> Upstream prior (first 20 % favours source)</label></div>
      <div class="btns"><button class="sm" id="zoApply">Re-classify</button><button class="sm" id="zoCsv">⬇ Raw scores and predictors (CSV)</button></div></div>`);
    const go = () => { ZO.slopeMode = $("zoMode").value; ZO.hiAbs = +$("zoHi").value; ZO.loAbs = +$("zoLo").value; ZO.unknownMargin = +$("zoUm").value; ZO.prior = $("zoPr").checked; try { localStorage.setItem("efl.zoneopt", JSON.stringify(ZO)); } catch(_){} classifyZones(R); renderX(); };
    $("zoApply").onclick = go;
    $("zoCsv").onclick = () => save(R.name.replace(/\W+/g, "_") + "_zone_scores.csv", xcsv(R.reaches.map(r => ({reach: r.i + 1, km_from: r.k0, km_to: r.k1, zone: r.zone, evidence: r.zoneConf, margin: r.zoneMargin, score_source: r.zoneScores && r.zoneScores.source, score_transfer: r.zoneScores && r.zoneScores.transfer, score_storage: r.zoneScores && r.zoneScores.storage, ...(r.zonePredictors || {}), why: r.zoneWhy, rule: R.zoneRule && R.zoneRule.version, slope_classes: R.zoneRule && R.zoneRule.slopeClasses}))));
  } catch(e){ console.warn(e); } }; }

/* self-tests for the statistics added after the technical review */
{ const st0 = runSelfTest; runSelfTest = async function(){ const T = await st0();
    const K = kruskal([[2.9, 3.0, 2.5, 2.6, 3.2], [3.8, 2.7, 4.0, 2.4], [2.8, 3.4, 3.7, 2.2, 2.0]]);
    T.push({name: "Kruskal–Wallis H, Hollander & Wolfe example (SciPy: 0.7714)", got: K.H, exp: .7714, tol: .002, unit: "", pass: Math.abs(K.H - .7714) < .002, err: Math.abs(K.H - .7714), kind: "abs"});
    T.push({name: "Kruskal–Wallis p (SciPy: 0.6800)", got: K.p, exp: .68, tol: .002, unit: "", pass: Math.abs(K.p - .68) < .002, err: Math.abs(K.p - .68), kind: "abs"});
    // labels unrelated to the data: an honest cross-validated accuracy must sit near chance
    let s = 7; const rnd = () => (s = (s*16807) % 2147483647)/2147483647, L = []; for (let i = 0; i < 80; i++) L.push({id: "t" + i, group: i % 2 ? "A" : "B", m: {a: rnd(), b: rnd(), c: rnd(), d: 5}});
    const h = statsHTML(L, {met: [["a", "a"], ["b", "b"], ["c", "c"], ["d", "d"]], st: {m: "a", g1: "A", g2: "B", feats: ["a", "b", "c", "d"]}, px: "st"}), acc = +((h.match(/validated accuracy[^:]*: <b>([0-9]+)/) || [])[1]);
    T.push({name: "Classifier on random labels: cross-validated accuracy near chance (no leakage)", got: acc, exp: 50, tol: null, unit: "%", pass: acc >= 30 && acc <= 68, err: Math.abs(acc - 50), kind: "30–68 %"});
    T.push({name: "Constant feature left out of the classifier", got: /no variation/.test(h) ? 1 : 0, exp: 1, pass: /no variation/.test(h), err: 0, unit: "", kind: "flag"});
    return T; }; window.__selfTest = runSelfTest; }
