
(() => {
"use strict";
const $ = id => document.getElementById("s_" + id);
const root = document.getElementById("app-studio");
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------------- Data ---------------- */
const BANDS = [
  {k:"red", name:"Reds", c:0, col:"#e5484d"},
  {k:"orange", name:"Oranges", c:30, col:"#f08a3c"},
  {k:"yellow", name:"Yellows", c:58, col:"#e8c547"},
  {k:"green", name:"Greens", c:115, col:"#46a758"},
  {k:"cyan", name:"Aquas", c:180, col:"#3fc1d3"},
  {k:"blue", name:"Blues", c:225, col:"#3e63dd"},
  {k:"purple", name:"Purples", c:285, col:"#8e4ec6"},
];
const GMAPS = {
  none:   {name:"Off", stops:null},
  tidal:  {name:"Tidal Ink", stops:[["#05070a",0],["#23272c",.30],["#e7edf0",.52],["#2aa7bf",.76],["#bff1f7",1]]},
  mars:   {name:"Mars", stops:[["#0b1630",0],["#5b1d14",.28],["#c2461c",.55],["#f29a4a",.8],["#fdebd2",1]]},
  copper: {name:"Copper Teal", stops:[["#04191f",0],["#16606a",.3],["#c98a52",.65],["#fff0da",1]]},
  aurora: {name:"Aurora", stops:[["#090318",0],["#3b1a6e",.3],["#169c86",.62],["#d8f99b",1]]},
  sunset: {name:"Sunset", stops:[["#150826",0],["#6d1d58",.32],["#e2603b",.64],["#ffd791",1]]},
  glacier:{name:"Glacier", stops:[["#031021",0],["#0d4f73",.35],["#6fc7dc",.68],["#f4fbff",1]]},
  mono:   {name:"Mono", stops:[["#000000",0],["#ffffff",1]]},
};
const CHANNELS = [
  {k:"normal", name:"Natural"},
  {k:"ir", name:"Infrared"},
  {k:"alien", name:"Alien"},
  {k:"invert", name:"Negative"},
];
const SLIDERS = [
  ["Light", null],
  ["exposure","Exposure",-100,100],
  ["contrast","Contrast",-100,100],
  ["shadows","Shadows",-100,100],
  ["highlights","Highlights",-100,100],
  ["fade","Fade",0,100],
  ["Texture", null],
  ["dehaze","Dehaze",-50,100],
  ["clarity","Clarity",-50,100],
  ["detail","Detail",0,100],
  ["Color", null],
  ["vib","Vibrance",-100,100],
  ["sat","Saturation",-100,100],
  ["temp","Warmth",-100,100],
  ["tint","Tint",-100,100],
  ["hue","Hue",-180,180],
  ["Finish", null],
  ["vignette","Vignette",0,100],
  ["grain","Grain",0,100],
];
const NUMKEYS = ["exposure","contrast","shadows","highlights","fade","dehaze","clarity","detail","vib","sat","temp","tint","hue","vignette","grain","gmapAmt"];

function defaults(){
  const p = {gmap:"none", channel:"normal", bands:{}};
  NUMKEYS.forEach(k => p[k] = 0);
  BANDS.forEach(b => p.bands[b.k] = [0,0,0]);
  return p;
}
function mk(o){
  const p = defaults();
  for (const k in o) if (k !== "bands") p[k] = o[k];
  if (o.bands) for (const b in o.bands) p.bands[b] = o.bands[b].slice();
  return p;
}
const PRESETS = [
  {name:"Original", p:{}},
  {name:"Atlas Pro", p:{clarity:.12, detail:.2, contrast:.05, vib:.06}},
  {name:"Atlas", p:{dehaze:.25,contrast:.16,clarity:.35,detail:.45,vib:.22,sat:.04,shadows:.12,highlights:-.12}},
  {name:"Vivid", p:{dehaze:.3,contrast:.2,clarity:.35,detail:.3,vib:.35,sat:.15,shadows:.15}},
  {name:"Namib Fire", p:{dehaze:.35,contrast:.28,clarity:.4,detail:.35,sat:.05,vib:.15,temp:.05,shadows:.1,highlights:-.15,
     bands:{red:[0,.45,-.12],orange:[-6,.55,-.16],yellow:[-8,.15,0],green:[30,.5,-.15],cyan:[0,.6,-.12],blue:[-20,.4,-.05]}}},
  {name:"Tundra Glow", p:{dehaze:.45,contrast:.22,clarity:.45,detail:.3,vib:.38,sat:.12,highlights:-.25,shadows:.2,
     bands:{orange:[-6,.5,-.05],yellow:[28,.35,0],green:[10,.35,.06],cyan:[0,.6,0],blue:[0,.4,0]}}},
  {name:"Tidal Ink", p:{gmap:"tidal",gmapAmt:1,contrast:.2,clarity:.6,detail:.45,dehaze:.3}},
  {name:"Infrared", p:{channel:"ir",sat:.35,vib:.2,contrast:.25,clarity:.4,detail:.3,dehaze:.35}},
  {name:"Mars", p:{gmap:"mars",gmapAmt:.85,clarity:.5,detail:.35,contrast:.15,dehaze:.2}},
  {name:"Copper Teal", p:{gmap:"copper",gmapAmt:.8,clarity:.45,detail:.3,contrast:.15,dehaze:.25}},
  {name:"Aurora", p:{gmap:"aurora",gmapAmt:.9,clarity:.5,detail:.35,contrast:.2,dehaze:.25}},
  {name:"Glacier", p:{gmap:"glacier",gmapAmt:.75,clarity:.45,detail:.3,dehaze:.3,contrast:.15}},
  {name:"Golden Hour", p:{temp:.4,sat:.15,vib:.3,fade:.08,contrast:.18,clarity:.3,dehaze:.2,vignette:.25}},
  {name:"Arctic", p:{temp:-.4,sat:-.25,fade:.12,clarity:.45,detail:.3,dehaze:.3,highlights:-.1,bands:{blue:[0,.4,.05],cyan:[0,.5,.05]}}},
  {name:"Alien", p:{channel:"alien",sat:.25,vib:.2,clarity:.45,contrast:.2,dehaze:.3}},
  {name:"Noir", p:{sat:-1,contrast:.45,clarity:.6,detail:.4,dehaze:.4,vignette:.35,grain:.2}},
  {name:"Matte Film", p:{fade:.25,contrast:.1,sat:-.1,grain:.3,temp:.1,vignette:.25,clarity:.2}},
  {name:"Sunset", p:{gmap:"sunset",gmapAmt:.8,clarity:.45,detail:.3,contrast:.15,dehaze:.2}},
].map(x => ({name:x.name, p:mk(x.p)}));

const ASPECTS = [["4:5",4/5],["5:7",5/7],["1:1",1],["9:16",9/16],["3:4",3/4],["16:9",16/9],["Original",0]];
const BORDERS = [["None","none"],["Thin white","thin"],["Gallery","gallery"],["Black mat","black"],["Data card","data"]];
const OVSTYLES = [["Off","off"],["White","white"],["Gold","gold"],["Neon","neon"],["Ink","ink"]];
const FONTS = [["Grotesk","500 {s}px 'Space Grotesk', sans-serif"],["Serif","italic 500 {s}px 'Playfair Display', serif"],["Mono","500 {s}px 'JetBrains Mono', monospace"],["Atlas serif","700 {s}px 'Libre Baskerville', Georgia, serif"]];
const CAPSTYLES = [["Overlay text","overlay"],["Label box","box"]];
const CAPPOS = [["Bottom right","br"],["Bottom centre","bc"],["Bottom left","bl"],["Top left","tl"]];
const SIZES = [["1080 px", 1080],["2160 px", 2160]];
const FORMATS = [["JPG","jpg"],["PNG","png"]];

/* ---------------- State ---------------- */
const S = {
  img:null, iw:0, ih:0,
  params: defaults(),
  presetIdx: 0, intensity: 1,
  rot:0, zoom:1, cx:0, cy:0,
  aspect: 4/5, aspectKey:"4:5",
  border:"none", font:0, title:"", sub:"",
  size:1080, fmt:"jpg",
  band:"orange", compare:false,
  keyStats:[], ov:"off", srcMap:null, capStyle:"overlay", capPos:"br",
};

/* ---------------- Color helpers ---------------- */
function hex(h){ const n = parseInt(h.slice(1),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]; }
const lutCache = {};
function gmapLUT(key){
  if (lutCache[key]) return lutCache[key];
  const st = GMAPS[key].stops; const lut = new Float32Array(256*3);
  for (let i=0;i<256;i++){
    const t = i/255; let j = 0;
    while (j < st.length-2 && t > st[j+1][1]) j++;
    const a = st[j], b = st[j+1]; const u = clamp((t-a[1])/(b[1]-a[1]||1),0,1);
    const s = u*u*(3-2*u); const ca = hex(a[0]), cb = hex(b[0]);
    for (let c=0;c<3;c++) lut[i*3+c] = ca[c]+(cb[c]-ca[c])*s;
  }
  return lutCache[key] = lut;
}

function boxBlur(src, w, h, r){
  r = Math.max(1, Math.round(r));
  let a = src, b = new Float32Array(src.length);
  for (let pass=0; pass<3; pass++){
    // horizontal a->b
    for (let y=0;y<h;y++){
      const o = y*w; let sum = 0; const n = 2*r+1;
      for (let i=-r;i<=r;i++) sum += a[o + clamp(i,0,w-1)];
      for (let x=0;x<w;x++){
        b[o+x] = sum/n;
        sum += a[o + Math.min(x+r+1, w-1)] - a[o + Math.max(x-r, 0)];
      }
    }
    // vertical b->a2
    const c = pass===0 ? new Float32Array(src.length) : a;
    for (let x=0;x<w;x++){
      let sum = 0; const n = 2*r+1;
      for (let i=-r;i<=r;i++) sum += b[clamp(i,0,h-1)*w + x];
      for (let y=0;y<h;y++){
        c[y*w+x] = sum/n;
        sum += b[Math.min(y+r+1,h-1)*w + x] - b[Math.max(y-r,0)*w + x];
      }
    }
    a = c;
  }
  return a;
}

/* ---------------- Core processing ---------------- */
function processImageData(id, p){
  const d = id.data, w = id.width, h = id.height, N = w*h;
  const scale = Math.max(w,h)/1000;
  const F = new Float32Array(N*3);
  const ch = p.channel;
  for (let i=0,j=0;i<N;i++,j+=4){
    let r=d[j]/255, g=d[j+1]/255, b=d[j+2]/255;
    // srgb-ish -> keep gamma space (perceptual edits)
    if (ch==="ir"){ const t=r; r=g*1.05; g=t*0.9+b*0.1; b=b*0.85+t*0.15; }
    else if (ch==="alien"){ const t=r; r=b; b=g; g=t; }
    else if (ch==="invert"){ r=1-r; g=1-g; b=1-b; }
    F[i*3]=r; F[i*3+1]=g; F[i*3+2]=b;
  }
  // luminance
  const L = new Float32Array(N);
  for (let i=0;i<N;i++) L[i] = .2126*F[i*3]+.7152*F[i*3+1]+.0722*F[i*3+2];

  // dehaze: estimate haze floor from dark percentile
  let haze = 0;
  if (p.dehaze){
    const hist = new Uint32Array(256);
    for (let i=0;i<N;i+=3){ const m=Math.min(F[i*3],F[i*3+1],F[i*3+2]); hist[Math.min(255,m*255|0)]++; }
    let acc=0, tgt=Math.ceil(N/3)*0.02, k=0; while (k<255 && (acc+=hist[k])<tgt) k++;
    haze = k/255;
  }
  const clar = p.clarity, det = p.detail;
  const blurBig = clar ? boxBlur(L, w, h, 18*scale) : null;
  const blurSmall = det ? boxBlur(L, w, h, Math.max(1, 1.6*scale)) : null;

  const ev = Math.pow(2, p.exposure*1.5);
  const con = 1 + p.contrast*0.9;
  const dh = p.dehaze;
  const anyBand = BANDS.some(b => { const v=p.bands[b.k]; return v[0]||v[1]||v[2]; });
  const bandArr = BANDS.map(b => [b.c, ...p.bands[b.k]]);
  const lut = (p.gmap!=="none" && p.gmapAmt>0) ? gmapLUT(p.gmap) : null;
  const gm = p.gmapAmt;
  // hue rotation matrix
  let hm = null;
  if (p.hue){
    const a = p.hue*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
    hm = [.213+c*.787-s*.213, .715-c*.715-s*.715, .072-c*.072+s*.928,
          .213-c*.213+s*.143, .715+c*.285+s*.140, .072-c*.072-s*.283,
          .213-c*.213-s*.787, .715-c*.715+s*.715, .072+c*.928+s*.072];
  }
  const vg = p.vignette, gr = p.grain, fade = p.fade;
  const cxm = w/2, cym = h/2, rmax = Math.hypot(cxm, cym);
  let seed = 12345;
  const rnd = () => (seed = (seed*1664525 + 1013904223) >>> 0) / 4294967296;

  for (let y=0,i=0;y<h;y++){
    for (let x=0;x<w;x++,i++){
      let r=F[i*3], g=F[i*3+1], b=F[i*3+2];
      // dehaze
      if (dh){
        const hz = haze*dh*1.6;
        r=(r-hz)/(1-hz); g=(g-hz)/(1-hz); b=(b-hz)/(1-hz);
        // add a touch of saturation with dehaze
        const l=.2126*r+.7152*g+.0722*b, k=1+dh*.25;
        r=l+(r-l)*k; g=l+(g-l)*k; b=l+(b-l)*k;
      }
      // exposure
      r*=ev; g*=ev; b*=ev;
      // white balance
      if (p.temp){ r+=p.temp*.07; b-=p.temp*.07; g+=p.temp*.01; }
      if (p.tint){ g-=p.tint*.06; r+=p.tint*.025; b+=p.tint*.025; }
      // local contrast
      let add = 0;
      if (clar) add += (L[i]-blurBig[i])*clar*1.6;
      if (det) add += (L[i]-blurSmall[i])*det*2.2;
      if (add){ r+=add; g+=add; b+=add; }
      // shadows / highlights
      let l = .2126*r+.7152*g+.0722*b;
      if (p.shadows || p.highlights){
        const lc = clamp(l,0,1);
        const s = p.shadows*.35*Math.pow(1-lc,3) + p.highlights*.35*Math.pow(lc,3);
        r+=s; g+=s; b+=s;
      }
      // contrast (around mid grey, slight S)
      if (con!==1){
        r=(r-.5)*con+.5; g=(g-.5)*con+.5; b=(b-.5)*con+.5;
      }
      // selective color
      if (anyBand){
        r=clamp(r,0,1); g=clamp(g,0,1); b=clamp(b,0,1);
        const mx=Math.max(r,g,b), mn=Math.min(r,g,b), dl=mx-mn;
        if (dl>0.004){
          let hh = mx===r ? ((g-b)/dl)%6 : mx===g ? (b-r)/dl+2 : (r-g)/dl+4;
          hh*=60; if (hh<0) hh+=360;
          let ll=(mx+mn)/2, ss = dl/(1-Math.abs(2*ll-1)||1);
          const cs0 = dl/mx, sw = cs0<.12 ? 0 : cs0>.5 ? 1 : ((cs0-.12)/.38)*((cs0-.12)/.38)*(3-2*(cs0-.12)/.38);
          let dH=0,dS=0,dL=0;
          for (let q=0;q<bandArr.length;q++){
            const bb=bandArr[q]; let dd=Math.abs(hh-bb[0]); if (dd>180) dd=360-dd;
            const wt = dd<40 ? (Math.cos(dd/40*Math.PI)+1)/2 : 0;
            if (wt){ dH+=bb[1]*wt; dS+=bb[2]*wt; dL+=bb[3]*wt; }
          }
          hh=(hh+dH*sw+360)%360;
          ss=clamp(ss*(1+dS*sw),0,1);
          ll=clamp(ll+dL*sw*.5,0,1);
          // hsl->rgb
          const C=(1-Math.abs(2*ll-1))*ss, X=C*(1-Math.abs((hh/60)%2-1)), m=ll-C/2;
          const sec = hh/60|0;
          let rr,gg,bb2;
          if (sec===0){rr=C;gg=X;bb2=0}else if(sec===1){rr=X;gg=C;bb2=0}else if(sec===2){rr=0;gg=C;bb2=X}
          else if(sec===3){rr=0;gg=X;bb2=C}else if(sec===4){rr=X;gg=0;bb2=C}else{rr=C;gg=0;bb2=X}
          r=rr+m; g=gg+m; b=bb2+m;
        }
      }
      // hue rotate
      if (hm){
        const r2=hm[0]*r+hm[1]*g+hm[2]*b, g2=hm[3]*r+hm[4]*g+hm[5]*b, b2=hm[6]*r+hm[7]*g+hm[8]*b;
        r=r2; g=g2; b=b2;
      }
      // vibrance + saturation
      if (p.sat || p.vib){
        l=.2126*r+.7152*g+.0722*b;
        const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
        const cs = mx>0 ? (mx-mn)/mx : 0;
        let k = 1+p.sat;
        if (p.vib) k += p.vib*(1-cs)*1.2;
        k = Math.max(0,k);
        r=l+(r-l)*k; g=l+(g-l)*k; b=l+(b-l)*k;
      }
      // gradient map
      if (lut){
        l = clamp(.2126*r+.7152*g+.0722*b,0,1);
        const li=(l*255|0)*3;
        r+= (lut[li]-r)*gm; g+=(lut[li+1]-g)*gm; b+=(lut[li+2]-b)*gm;
      }
      // fade (matte blacks)
      if (fade){ const f=fade*.22; r=r*(1-f)+f; g=g*(1-f)+f; b=b*(1-f)+f*1.05; }
      // vignette
      if (vg){
        const dd = Math.hypot(x-cxm, y-cym)/rmax;
        const v = 1 - vg*.75*Math.pow(clamp((dd-.35)/.65,0,1),1.6);
        r*=v; g*=v; b*=v;
      }
      // grain
      if (gr){ const n=(rnd()+rnd()-1)*gr*.12; r+=n; g+=n; b+=n; }
      const j=i*4;
      d[j]=clamp(r,0,1)*255+.5; d[j+1]=clamp(g,0,1)*255+.5; d[j+2]=clamp(b,0,1)*255+.5;
    }
  }
  return id;
}

/* ---------------- Layout / framing ---------------- */
function rotDims(){ return (S.rot%180===0) ? [S.iw,S.ih] : [S.ih,S.iw]; }
function frameAspect(){
  if (S.aspect) return S.aspect;
  const [w,h]=rotDims(); return w/h;
}
// outer canvas layout for a given output long-edge-ish width
function layout(W){
  const A = frameAspect();
  const H = Math.round(W / A);
  let m = {l:0,t:0,r:0,b:0};
  const u = Math.min(W,H);
  if (S.border==="thin") m = {l:u*.03,t:u*.03,r:u*.03,b:u*.03};
  else if (S.border==="gallery") m = {l:u*.07,t:u*.07,r:u*.07,b:u*.17};
  else if (S.border==="black") m = {l:u*.06,t:u*.06,r:u*.06,b:u*.15};
  else if (S.border==="data") m = {l:u*.045,t:u*.045,r:u*.045,b:u*(S.keyStats.length > 3 ? .40 : .30)};
  if (S.border!=="none" && (S.border==="thin") && (S.title||S.sub)) m.b = u*.12;
  const ir = {x:Math.round(m.l), y:Math.round(m.t), w:Math.round(W-m.l-m.r), h:Math.round(H-m.t-m.b)};
  return {W,H,ir};
}
function coverScale(fw, fh){
  const [w,h]=rotDims(); return Math.max(fw/w, fh/h)*S.zoom;
}
function clampPan(fw, fh){
  const [w,h]=rotDims(); const sc = coverScale(fw,fh);
  const hw = fw/2/sc, hh = fh/2/sc;
  S.cx = clamp(S.cx, hw, w-hw); S.cy = clamp(S.cy, hh, h-hh);
}
function drawSource(ctx, fw, fh){
  const [w,h]=rotDims(); const sc = coverScale(fw,fh);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.translate(fw/2, fh/2); ctx.scale(sc, sc); ctx.translate(-S.cx, -S.cy);
  ctx.translate(w/2, h/2); ctx.rotate(S.rot*Math.PI/180);
  ctx.drawImage(S.img, -S.iw/2, -S.ih/2);
  ctx.restore();
}

function renderTo(canvas, W, opts={}){
  const {W:CW,H:CH,ir} = layout(W);
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext("2d", {willReadFrequently:true});
  // background / border
  const dark = S.border==="black" || S.border==="data";
  ctx.fillStyle = S.border==="data" ? "#0d0f12" : dark ? "#0b0b0c" : "#fbfaf7";
  ctx.fillRect(0,0,CW,CH);
  // image area
  clampPan(ir.w, ir.h);
  const off = document.createElement("canvas"); off.width = ir.w; off.height = ir.h;
  const octx = off.getContext("2d", {willReadFrequently:true});
  drawSource(octx, ir.w, ir.h);
  if (!opts.raw){
    const id = octx.getImageData(0,0,ir.w,ir.h);
    processImageData(id, S.params);
    octx.putImageData(id,0,0);
  }
  if (!opts.raw && S.ov !== "off") drawOverlay(octx, ir.w, ir.h);
  if (!opts.raw) drawFigureMarks(octx, ir.w, ir.h);
  ctx.drawImage(off, ir.x, ir.y);
  if (S.border === "data") drawDataCard(ctx, CW, CH, ir); else drawCaption(ctx, CW, CH, ir, dark);
}

const OV_ORDER = ["#7fdcff","#3fc1d3","#5bd17a","#e8c547","#ff9a3c","#ff4d7e","#c86bff","#ffffff"];
function drawOverlay(ctx, fw, fh){
  const api = window.__labAPI; if (!api || !S.srcMap) return;
  const geom = api.geometry(); if (!geom.lines.length) return;
  const [w,h] = rotDims(), sc = coverScale(fw, fh), m = S.srcMap, px = sc*m.k, unit = Math.max(1, fw/700);
  ctx.save();
  ctx.translate(fw/2, fh/2); ctx.scale(sc, sc); ctx.translate(-S.cx, -S.cy);
  ctx.translate(w/2, h/2); ctx.rotate(S.rot*Math.PI/180); ctx.translate(-S.iw/2, -S.ih/2);
  ctx.scale(m.k, m.k); ctx.translate(-m.x0, -m.y0);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const sorted = geom.lines.slice().sort((a, b) => a.wt - b.wt);
  for (const L of sorted){
    if (L.pts.length < 2 || !S.ovLayers[L.kind || "main"]) continue;
    ctx.beginPath(); L.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    let col = "rgba(255,255,255,.9)";
    if (S.ov === "gold") col = "rgba(255,210,122,.95)";
    else if (S.ov === "ink") col = "rgba(8,10,14,.85)";
    else if (S.ov === "neon"){ col = L.main ? "#ffffff" : OV_ORDER[Math.min(OV_ORDER.length-1, Math.max(0, (L.order||1)-1))]; ctx.shadowColor = col; ctx.shadowBlur = 6*unit; }
    ctx.strokeStyle = col; ctx.lineWidth = L.wt*unit/px; ctx.stroke(); ctx.shadowBlur = 0;
  }
  ctx.restore();
}
function drawDataCard(ctx, CW, CH, ir){
  const u = Math.min(CW, CH), x = ir.x, y0 = ir.y + ir.h, wd = ir.w;
  ctx.save(); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  const title = S.title || "Landscape analysis", fontT = FONTS[S.font][1];
  ctx.fillStyle = "#f2f0ea"; ctx.font = fontT.replace("{s}", u*.05); ctx.fillText(title, x, y0 + u*.075, wd*.68);
  if (S.sub){ ctx.font = "500 " + u*.021 + "px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(242,240,234,.55)"; ctx.fillText(S.sub.toUpperCase(), x, y0 + u*.112, wd); }
  const st = S.keyStats.slice(0, 6), cols = 3, cw = wd/cols, top = y0 + u*.16;
  st.forEach((k, i) => {
    const cx = x + (i % cols)*cw, cy = top + Math.floor(i/cols)*u*.115;
    ctx.fillStyle = "#ff9a5c"; ctx.fillRect(cx, cy, u*.03, u*.004);
    ctx.fillStyle = "#f2f0ea"; ctx.font = "500 " + u*.046 + "px 'JetBrains Mono', monospace"; ctx.fillText(k.value, cx, cy + u*.056, cw - u*.02);
    ctx.fillStyle = "rgba(242,240,234,.62)"; ctx.font = "500 " + u*.024 + "px 'Space Grotesk', sans-serif"; ctx.fillText(k.label, cx, cy + u*.09, cw - u*.02);
  });
  ctx.fillStyle = "rgba(242,240,234,.35)"; ctx.font = "500 " + u*.015 + "px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
  ctx.fillText("MEASURED WITH EARTHFORM LENS", x + wd, y0 + u*.075);
  ctx.restore();
}
function drawCaption(ctx, CW, CH, ir, dark){
  if (!S.title && !S.sub) return;
  const u = Math.min(CW, CH);
  const fontT = FONTS[S.font][1];
  ctx.save();
  ctx.textBaseline = "alphabetic";
  if (S.border==="none" && S.capStyle==="box"){
    const s1 = u*.042, s2 = u*.026, padX = s1*.55, padY = s1*.38, m = u*.05;
    ctx.font = "700 " + s1 + "px 'Libre Baskerville', Georgia, serif";
    const w1 = S.title ? ctx.measureText(S.title).width : 0;
    ctx.font = "500 " + s2 + "px 'Libre Baskerville', Georgia, serif";
    const w2 = S.sub ? ctx.measureText(S.sub).width : 0;
    const bw = Math.min(CW - 2*m, Math.max(w1, w2) + 2*padX), bh = (S.title ? s1*1.25 : 0) + (S.sub ? s2*1.45 : 0) + 2*padY - (S.title && S.sub ? 0 : s1*.15);
    let bx = S.capPos === "bl" || S.capPos === "tl" ? m : S.capPos === "bc" ? (CW - bw)/2 : CW - m - bw;
    let by = S.capPos === "tl" ? m : CH - m - bh;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#111"; ctx.textAlign = "left"; let ty = by + padY + s1*.95;
    if (S.title){ ctx.font = "700 " + s1 + "px 'Libre Baskerville', Georgia, serif"; ctx.fillText(S.title, bx + padX, ty, bw - 2*padX); ty += s2*1.5; }
    else ty = by + padY + s2;
    if (S.sub){ ctx.font = "500 " + s2 + "px 'Libre Baskerville', Georgia, serif"; ctx.fillStyle = "#333"; ctx.fillText(S.sub, bx + padX, ty, bw - 2*padX); }
  } else if (S.border==="none"){
    const s1 = u*.045, s2 = u*.024, pad = u*.05;
    // soft gradient for legibility
    const g = ctx.createLinearGradient(0, CH-u*.32, 0, CH);
    g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,.45)");
    ctx.fillStyle = g; ctx.fillRect(0, CH-u*.32, CW, u*.32);
    ctx.fillStyle = "#fff"; ctx.shadowColor="rgba(0,0,0,.4)"; ctx.shadowBlur = u*.01;
    let y = CH - pad;
    if (S.sub){ ctx.font = "500 "+s2+"px 'JetBrains Mono', monospace"; ctx.globalAlpha=.85; ctx.fillText(S.sub.toUpperCase(), pad, y); ctx.globalAlpha=1; y -= s2*1.6; }
    if (S.title){ ctx.font = fontT.replace("{s}", s1); ctx.fillText(S.title, pad, y); }
  } else {
    const mb = CH - (ir.y+ir.h);
    const s1 = Math.min(u*.042, mb*.36), s2 = Math.min(u*.022, mb*.2);
    ctx.fillStyle = dark ? "#f2f0ea" : "#151515";
    const midY = ir.y + ir.h + mb/2;
    if (S.title && S.sub){
      ctx.font = fontT.replace("{s}", s1); ctx.textAlign = "left";
      ctx.fillText(S.title, ir.x, midY + s1*.15);
      ctx.font = "500 "+s2+"px 'JetBrains Mono', monospace"; ctx.globalAlpha=.6;
      ctx.fillText(S.sub.toUpperCase(), ir.x, midY + s1*.15 + s2*1.7);
    } else {
      const t = S.title || S.sub;
      ctx.font = S.title ? fontT.replace("{s}", s1) : "500 "+s2+"px 'JetBrains Mono', monospace";
      ctx.textAlign = "center"; ctx.fillText(S.title ? t : t.toUpperCase(), CW/2, midY + s1*.3);
    }
  }
  ctx.restore();
}

/* ---------------- Preview rendering ---------------- */
const view = $("view");
let rafPending = false, lowRes = false, idleTimer = 0;
function previewWidth(){
  const box = $("stage").getBoundingClientRect();
  const A = frameAspect();
  const maxH = window.innerHeight*.62;
  let cssW = Math.min(box.width, maxH*A);
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  return Math.round(cssW*dpr);
}
function schedule(fast){
  if (!S.img) return;
  lowRes = !!fast;
  $("busy").classList.add("on");
  if (!rafPending){
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const pw = previewWidth();
      if (pw < 10){ $("busy").classList.remove("on"); return; }
      renderTo(view, lowRes ? Math.round(pw*.5) : pw, {raw:S.compare});
      const A = view.width/view.height;
      const box = $("stage").getBoundingClientRect();
      const cssW = Math.min(box.width, window.innerHeight*.62*A);
      view.style.width = cssW+"px"; view.style.height = (cssW/A)+"px";
      $("busy").classList.remove("on");
    });
  }
  clearTimeout(idleTimer);
  if (fast) idleTimer = setTimeout(() => schedule(false), 180);
}

/* ---------------- Thumbnails ---------------- */
let thumbSrc = null, thumbTimer = 0;
function buildThumbs(){
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    if (!S.img) return;
    const tw = 96, th = 120;
    const c = document.createElement("canvas"); c.width=tw; c.height=th;
    const ctx = c.getContext("2d", {willReadFrequently:true});
    // use current framing center region
    drawThumbSource(ctx, tw, th);
    thumbSrc = ctx.getImageData(0,0,tw,th);
    root.querySelectorAll(".look canvas").forEach((cv, idx) => {
      cv.width=tw; cv.height=th;
      const id = new ImageData(new Uint8ClampedArray(thumbSrc.data), tw, th);
      processImageData(id, PRESETS[idx].p);
      cv.getContext("2d").putImageData(id,0,0);
    });
  }, 120);
}
function drawThumbSource(ctx, tw, th){
  const [w,h]=rotDims();
  const fw = tw, fh = th;
  const sc = Math.max(fw/w, fh/h)*S.zoom;
  const hw=fw/2/sc, hh=fh/2/sc;
  const cx = clamp(S.cx, hw, w-hw), cy = clamp(S.cy, hh, h-hh);
  ctx.save(); ctx.imageSmoothingQuality="high";
  ctx.translate(fw/2,fh/2); ctx.scale(sc,sc); ctx.translate(-cx,-cy);
  ctx.translate(w/2,h/2); ctx.rotate(S.rot*Math.PI/180); ctx.drawImage(S.img,-S.iw/2,-S.ih/2);
  ctx.restore();
}

/* ---------------- UI construction ---------------- */
function chipGroup(el, items, getOn, onPick, render){
  el.innerHTML = "";
  items.forEach((it, idx) => {
    const b = document.createElement("button"); b.className = "chip";
    b.innerHTML = render ? render(it) : it[0];
    b.onclick = () => { onPick(it, idx); refresh(); };
    b._it = it; el.appendChild(b);
  });
  const refresh = () => [...el.children].forEach((b,idx) => b.classList.toggle("on", getOn(b._it, idx)));
  refresh(); el._refresh = refresh;
}

// Looks
const looksEl = $("looks");
PRESETS.forEach((pr, idx) => {
  const b = document.createElement("button"); b.className = "look";
  b.innerHTML = `<canvas></canvas><span>${pr.name}</span>`;
  b.onclick = () => applyPreset(idx);
  looksEl.appendChild(b);
});
function markLook(){ [...looksEl.children].forEach((b,i)=>b.classList.toggle("on", i===S.presetIdx)); }
function lerpParams(t){
  const base = defaults(), pr = PRESETS[S.presetIdx].p, out = defaults();
  NUMKEYS.forEach(k => out[k] = base[k] + (pr[k]-base[k])*t);
  BANDS.forEach(b => out.bands[b.k] = pr.bands[b.k].map(v => v*t));
  out.gmap = pr.gmap; out.channel = t>0 ? pr.channel : "normal";
  out.gmapAmt = clamp(out.gmapAmt,0,1);
  return out;
}
function applyPreset(idx){
  S.presetIdx = idx; S.intensity = 1; $("intensity").value = 100; $("intensityOut").textContent = "100";
  S.params = lerpParams(1); markLook(); syncControls(); schedule();
}
$("intensity").oninput = e => {
  S.intensity = e.target.value/100; $("intensityOut").textContent = e.target.value;
  S.params = lerpParams(S.intensity); syncControls(); schedule(true);
};

// Adjust sliders
const adj = $("p-adjust");
const sliderEls = {};
SLIDERS.forEach(s => {
  if (!s[1]){ const h = document.createElement("h4"); h.textContent = s[0]; adj.appendChild(h); return; }
  const [k,label,min,max] = s;
  const row = document.createElement("div"); row.className="row";
  row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" value="0"><output>0</output>`;
  const inp = row.querySelector("input"), out = row.querySelector("output");
  inp.oninput = () => {
    const v = +inp.value; out.textContent = v;
    S.params[k] = k==="hue" ? v : v/100; schedule(true);
  };
  inp.ondblclick = () => { inp.value = 0; inp.oninput(); };
  sliderEls[k] = {inp,out}; adj.appendChild(row);
});

// Gradient maps
const gEl = $("gmaps");
Object.entries(GMAPS).forEach(([k,g]) => {
  const b = document.createElement("button"); b.className="sw"; b.dataset.k=k;
  b.style.background = g.stops ? `linear-gradient(90deg,${g.stops.map(s=>s[0]+" "+(s[1]*100)+"%").join(",")})` : "var(--panel2)";
  b.innerHTML = `<span>${g.name}</span>`;
  b.onclick = () => {
    S.params.gmap = k;
    if (k!=="none" && S.params.gmapAmt===0) S.params.gmapAmt = .8;
    if (k==="none") S.params.gmapAmt = 0;
    syncControls(); schedule();
  };
  gEl.appendChild(b);
});
$("gmapAmt").oninput = e => { S.params.gmapAmt = e.target.value/100; $("gmapAmtOut").textContent=e.target.value; schedule(true); };

// Channels
chipGroup($("channels"), CHANNELS, it => S.params.channel===it.k, it => { S.params.channel = it.k; schedule(); }, it => it.name);

// Bands
const bandSl = $("bandSliders");
const bandRows = ["Hue","Saturation","Lightness"].map((lab, qi) => {
  const row = document.createElement("div"); row.className="row";
  const [mn,mx] = qi===0 ? [-45,45] : [-100,100];
  row.innerHTML = `<label>${lab}</label><input type="range" min="${mn}" max="${mx}" value="0"><output>0</output>`;
  const inp=row.querySelector("input"), out=row.querySelector("output");
  inp.oninput = () => { const v=+inp.value; out.textContent=v; S.params.bands[S.band][qi] = qi===0 ? v : v/100; schedule(true); };
  inp.ondblclick = () => { inp.value=0; inp.oninput(); };
  bandSl.appendChild(row); return {inp,out};
});
chipGroup($("bands"), BANDS, it => S.band===it.k, it => { S.band = it.k; syncControls(); },
  it => `<span class="dot" style="background:${it.col}"></span>${it.name}`);

// Frame
chipGroup($("aspects"), ASPECTS, it => S.aspectKey===it[0], it => { S.aspectKey=it[0]; S.aspect=it[1]; schedule(); buildThumbs(); });
chipGroup($("borders"), BORDERS, it => S.border===it[1], it => { S.border=it[1]; schedule(); });
chipGroup($("capstyles"), CAPSTYLES, it => S.capStyle===it[1], it => { S.capStyle=it[1]; schedule(); });
chipGroup($("cappos"), CAPPOS, it => S.capPos===it[1], it => { S.capPos=it[1]; schedule(); });
chipGroup($("fonts"), FONTS, (it,i) => S.font===i, (it,i) => { S.font=i; schedule(); });
chipGroup($("sizes"), SIZES, it => S.size===it[1], it => { S.size=it[1]; });
chipGroup($("formats"), FORMATS, it => S.fmt===it[1], it => { S.fmt=it[1]; });
$("zoom").oninput = e => { setZoom(e.target.value/100); schedule(true); };
$("capTitle").oninput = e => { S.title=e.target.value; schedule(true); };
$("capSub").oninput = e => { S.sub=e.target.value; schedule(true); };
$("btnRotate").onclick = () => { S.rot=(S.rot+90)%360; centerImage(); schedule(); buildThumbs(); };
$("btnCenter").onclick = () => { centerImage(); schedule(); buildThumbs(); };

function setZoom(z){
  S.zoom = clamp(z,1,6); $("zoom").value = Math.round(S.zoom*100); $("zoomOut").textContent = S.zoom.toFixed(1)+"×";
}
function centerImage(){ const [w,h]=rotDims(); S.cx=w/2; S.cy=h/2; }

function syncControls(){
  NUMKEYS.forEach(k => { const s = sliderEls[k]; if (!s) return;
    const v = k==="hue" ? Math.round(S.params[k]) : Math.round(S.params[k]*100); s.inp.value=v; s.out.textContent=v; });
  [...gEl.children].forEach(b => b.classList.toggle("on", b.dataset.k===S.params.gmap));
  const ga = Math.round(S.params.gmapAmt*100); $("gmapAmt").value=ga; $("gmapAmtOut").textContent=ga;
  $("channels")._refresh(); $("bands")._refresh();
  const bv = S.params.bands[S.band];
  bandRows.forEach((r,qi) => { const v = qi===0 ? Math.round(bv[0]) : Math.round(bv[qi]*100); r.inp.value=v; r.out.textContent=v; });
}

// Tabs
root.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  root.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x===t));
  root.querySelectorAll(".panel").forEach(p => p.classList.toggle("on", p.id==="s_p-"+t.dataset.t));
});

/* ---------------- Gestures ---------------- */
const pointers = new Map(); let gesture = null;
view.addEventListener("pointerdown", e => {
  view.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  startGesture();
});
view.addEventListener("pointermove", e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  moveGesture();
});
const endP = e => { pointers.delete(e.pointerId); if (pointers.size) startGesture(); else { gesture=null; schedule(false); buildThumbs(); } };
view.addEventListener("pointerup", endP); view.addEventListener("pointercancel", endP);
view.addEventListener("wheel", e => { e.preventDefault(); setZoom(S.zoom*Math.exp(-e.deltaY*.0015)); schedule(true); buildThumbs(); }, {passive:false});

function imgRectCSS(){
  const {W,H,ir} = layout(1000); const r = view.getBoundingClientRect();
  return {k: r.width/W, irw: ir.w, irh: ir.h};
}
function startGesture(){
  const pts=[...pointers.values()];
  const {k,irw,irh} = imgRectCSS();
  gesture = {pts:pts.map(p=>({...p})), cx:S.cx, cy:S.cy, zoom:S.zoom, k, irw, irh,
    dist: pts.length>1 ? Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y) : 0};
  $("hint").style.opacity = 0;
}
function moveGesture(){
  if (!gesture) return;
  const pts=[...pointers.values()];
  if (pts.length>1 && gesture.dist){
    const d = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    setZoom(gesture.zoom * d/gesture.dist);
  }
  const p0 = gesture.pts[0], p1 = pts[0];
  // css px -> rotated-image px
  const sc = coverScale(gesture.irw, gesture.irh); // image px per layout px
  const dx = (p1.x-p0.x)/gesture.k/sc, dy = (p1.y-p0.y)/gesture.k/sc;
  S.cx = gesture.cx - dx; S.cy = gesture.cy - dy;
  schedule(true);
}

// Compare
const cmp = $("btnCompare");
const cmpOn = e => { e.preventDefault(); S.compare=true; schedule(); };
const cmpOff = () => { if (S.compare){ S.compare=false; schedule(); } };
cmp.addEventListener("pointerdown", cmpOn); cmp.addEventListener("pointerup", cmpOff);
cmp.addEventListener("pointerleave", cmpOff); cmp.addEventListener("pointercancel", cmpOff);
cmp.addEventListener("contextmenu", e => e.preventDefault());

/* ---------------- Loading ---------------- */
function setSource(img, opts = {}){
  const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
  const f = opts.f || 1, roi = opts.roi || {x0:0, y0:0, x1:nw/f, y1:nh/f};
  const sx = roi.x0*f, sy = roi.y0*f, sw = (roi.x1-roi.x0)*f, sh = (roi.y1-roi.y0)*f;
  const MAX = 4800, s = Math.min(1, MAX/Math.max(sw, sh));
  const c = document.createElement("canvas"); c.width = Math.max(2, Math.round(sw*s)); c.height = Math.max(2, Math.round(sh*s));
  const cx = c.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const keep = opts.keepFrame && S.img && S.iw ? {fx: S.cx/S.iw, fy: S.cy/S.ih, z: S.zoom, rot: S.rot} : null;
  S.img = c; S.iw = c.width; S.ih = c.height; S.rot = 0;
  S.srcMap = {x0: roi.x0, y0: roi.y0, k: f*s};
  if (keep){ S.rot = keep.rot; S.cx = keep.fx*S.iw; S.cy = keep.fy*S.ih; setZoom(keep.z); } else { centerImage(); setZoom(1); }
  $("empty").style.display="none"; view.style.display="block"; cmp.style.display="block";
  ["btnSave","btnReset","btnSurprise","btnAutoStyle","btnEnhance"].forEach(id => $(id) && ($(id).disabled=false));
  if (!opts.keepLook){ if (S.presetIdx===0) applyPreset(1); else schedule(); }
  buildThumbs();
}

/* ---------------- Surprise / reset ---------------- */
$("btnSurprise").onclick = () => {
  const idx = 1 + Math.floor(Math.random()*(PRESETS.length-1));
  applyPreset(idx);
  const p = S.params, j = (a)=> (Math.random()*2-1)*a;
  p.clarity = clamp(p.clarity + j(.2), -.2, 1); p.contrast = clamp(p.contrast + j(.15), -.3, .8);
  p.vib = clamp(p.vib + j(.25), -.5, 1); p.temp = clamp(p.temp + j(.25), -1, 1);
  if (Math.random()<.35){ const keys=Object.keys(GMAPS).filter(k=>k!=="none"&&k!=="mono"); p.gmap=keys[Math.floor(Math.random()*keys.length)]; p.gmapAmt=.5+Math.random()*.45; }
  if (Math.random()<.3) p.hue = Math.round(j(40));
  syncControls(); schedule(); toast("✦ " + PRESETS[idx].name + " remix");
};
$("btnReset").onclick = () => { applyPreset(0); };

/* ---------------- Export ---------------- */
let downloads = null;
if (window.claude && window.claude.use) window.claude.use("downloads").then(d => { downloads = d; }).catch(()=>{});
else downloads = {save: async ({filename, data}) => { const b = data instanceof Blob ? data : new Blob([data], {type: "text/plain"}), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }};
let lastBlob = null, lastName = "";
$("btnSave").onclick = async () => {
  if (!S.img) return;
  const btn = $("btnSave"); btn.disabled = true; btn.textContent = "Rendering…";
  await new Promise(r => setTimeout(r, 30));
  try{
    try { await document.fonts.ready; } catch(_){}
    const c = document.createElement("canvas");
    // size = width of the shorter edge for portrait, long edge for landscape cap
    const A = frameAspect();
    const W = A >= 1 ? Math.round(S.size*A > S.size*2 ? S.size*2 : S.size*A) : S.size;
    renderTo(c, W);
    const mime = S.fmt==="png" ? "image/png" : "image/jpeg";
    const blob = await new Promise(r => c.toBlob(r, mime, .93));
    lastBlob = blob;
    const base = (S.title || "earthform-lens").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "earthform-lens";
    lastName = `${base}-${PRESETS[S.presetIdx].name.toLowerCase().replace(/\s+/g,"-")}.${S.fmt}`;
    $("sheetImg").src = URL.createObjectURL(blob);
    $("sheetMsg").textContent = `${c.width} × ${c.height} px · ${(blob.size/1048576).toFixed(1)} MB. Press and hold the image to save or share it.`;
    $("btnSheetSave").style.display = downloads ? "block" : "none";
    $("sheet").classList.add("on");
    if (downloads) trySave();
  } catch(err){
    toast("Export failed — try a smaller size");
  } finally { btn.disabled=false; btn.textContent="Save image"; }
};
async function trySave(){
  if (!downloads || !lastBlob) return;
  try { await downloads.save({filename:lastName, data:lastBlob}); toast("Saved"); }
  catch(e){
    const c = e && e.code;
    if (c==="unavailable"||c==="not_granted"||c==="capability_disabled"||c==="capability_removed"){ downloads=null; $("btnSheetSave").style.display="none"; }
    else if (c==="too_large") toast("Too large — choose a smaller size");
  }
}
$("btnSheetSave").onclick = trySave;
$("btnSheetClose").onclick = () => $("sheet").classList.remove("on");

let toastT=0;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"),1800); }

window.addEventListener("resize", () => schedule());
markLook(); syncControls(); setTimeout(() => { try { renderLink(); } catch(_){} }, 0);

/* ---------------- overlay chips ---------------- */
chipGroup($("ovs"), OVSTYLES, it => S.ov===it[1], it => { S.ov = it[1]; if (S.ov !== "off" && !(window.__labAPI && window.__labAPI.geometry().lines.length)) toast("Run Channel, Network or Terrain → Flow in the Lab first"); schedule(); });
$("btnUseRoi").onclick = () => { window.__labAPI && window.__labAPI.sendToStudio(true); };
$("btnEnhance").onclick = () => { if (!window.__labAPI) return; const on = !$("btnEnhance").classList.contains("on"); $("btnEnhance").textContent = "Enhancing…"; setTimeout(() => { window.__labAPI.enhanceToStudio(on); $("btnEnhance").classList.toggle("on", on); $("btnEnhance").textContent = on ? "✦ Atlas enhance: on" : "✦ Atlas enhance"; if (on) setPreset("Atlas Pro"); }, 30); };
$("btnAutoStyle").onclick = () => { if (window.__labAPI) window.__labAPI.autoArt(true); else autoStyle({}); };

/* ---------------- automatic styling ---------------- */
function smallSource(maxD){
  const s = Math.min(1, maxD/Math.max(S.iw, S.ih)), c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(S.iw*s)); c.height = Math.max(8, Math.round(S.ih*s));
  const x = c.getContext("2d", {willReadFrequently:true}); x.drawImage(S.img, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}
function imgStats(id){
  const d = id.data, N = d.length/4; let red = 0, green = 0, blue = 0, sat = 0;
  for (let i = 0; i < N; i++){
    const r = d[i*4]/255, g = d[i*4+1]/255, b = d[i*4+2]/255, mx = Math.max(r,g,b), mn = Math.min(r,g,b), dl = mx-mn, sv = mx ? dl/mx : 0;
    sat += sv;
    if (sv > .18 && mx > .15){
      let h = mx===r ? ((g-b)/dl)%6 : mx===g ? (b-r)/dl+2 : (r-g)/dl+4; h *= 60; if (h < 0) h += 360;
      if (h < 45 || h >= 330) red++; else if (h < 170) green++; else if (h < 270) blue++;
    }
  }
  return {red:red/N, green:green/N, blue:blue/N, sat:sat/N};
}
function scoreImg(id){
  const d = id.data, N = d.length/4; let mrg = 0, myb = 0, srg = 0, syb = 0, mL = 0, sL = 0, clip = 0;
  for (let i = 0; i < N; i++){
    const r = d[i*4], g = d[i*4+1], b = d[i*4+2], rg = r-g, yb = .5*(r+g)-b, L = .2126*r+.7152*g+.0722*b;
    mrg += rg; myb += yb; srg += rg*rg; syb += yb*yb; mL += L; sL += L*L; if (L < 4 || L > 251) clip++;
  }
  mrg /= N; myb /= N; mL /= N;
  const cf = Math.sqrt(Math.max(0, srg/N - mrg*mrg) + Math.max(0, syb/N - myb*myb)) + .3*Math.hypot(mrg, myb);
  const sd = Math.sqrt(Math.max(0, sL/N - mL*mL));
  return cf/100*.55 + sd/64*.45 - (clip/N)*3;
}
function cropSearch(base){
  const w = base.width, h = base.height, d = base.data, E = new Float64Array((w+1)*(h+1));
  const L = i => .2126*d[i*4] + .7152*d[i*4+1] + .0722*d[i*4+2];
  for (let y = 0; y < h; y++){ let row = 0;
    for (let x = 0; x < w; x++){
      const i = y*w+x, gx = x < w-1 ? L(i+1) - L(i) : 0, gy = y < h-1 ? L(i+w) - L(i) : 0;
      row += Math.hypot(gx, gy); E[(y+1)*(w+1) + x+1] = E[y*(w+1) + x+1] + row;
    }
  }
  const box = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(w, Math.round(x1)); y1 = Math.min(h, Math.round(y1)); const a = Math.max(1, (x1-x0)*(y1-y0)); return (E[y1*(w+1)+x1] - E[y0*(w+1)+x1] - E[y1*(w+1)+x0] + E[y0*(w+1)+x0])/a; };
  const k = w/S.iw, A = frameAspect(), [rw, rh] = rotDims(); let best = null;
  for (const z of [1, 1.25, 1.5]){
    const sc = Math.max(A/rw, 1/rh)*z, Wf = A/sc, Hf = 1/sc;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++){
      const cx = Wf/2 + (rw - Wf)*i/8, cy = Hf/2 + (rh - Hf)*j/8;
      const sco = box((cx-Wf/2)*k, (cy-Hf/2)*k, (cx+Wf/2)*k, (cy+Hf/2)*k)*(1 - .35*(z-1)) * (1 - .05*Math.hypot(i/8-.5, j/8-.5));
      if (!best || sco > best.s) best = {s:sco, z, cx, cy};
    }
  }
  if (best){ setZoom(best.z); S.cx = best.cx; S.cy = best.cy; }
}
function syncAll(){
  markLook(); syncControls();
  ["aspects","borders","fonts","ovs","sizes","formats","capstyles","cappos"].forEach(id => $(id)._refresh && $(id)._refresh());
  $("capTitle").value = S.title; $("capSub").value = S.sub; setZoom(S.zoom);
}
function autoStyle(opts = {}){
  if (!S.img) return null;
  const base = smallSource(220), st = imgStats(base);
  const cand = opts.dem ? ["Vivid","Atlas","Golden Hour","Arctic","Glacier","Copper Teal","Matte Film"] : ["Atlas","Vivid","Namib Fire","Tundra Glow","Golden Hour","Arctic","Glacier","Copper Teal","Tidal Ink","Infrared"];
  const bonus = {}; const gm = ["Glacier","Copper Teal","Tidal Ink","Infrared"];
  if (st.red > .3) bonus["Namib Fire"] = .35;
  if (st.green > .2 && st.red < .3) bonus["Tundra Glow"] = .3;
  if (st.blue > .25) bonus["Glacier"] = .25;
  if (st.sat < .12) bonus["Vivid"] = .15;
  if (opts.dem) bonus["Golden Hour"] = .25;
  const scores = {};
  for (const name of cand){
    const idx = PRESETS.findIndex(p => p.name === name); if (idx < 0) continue;
    const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    processImageData(copy, PRESETS[idx].p);
    scores[name] = scoreImg(copy) + (bonus[name] || 0) - (gm.includes(name) && !bonus[name] ? .15 : 0);
  }
  const bestName = opts.preset || Object.keys(scores).reduce((a, b) => scores[b] > scores[a] ? b : a);
  applyPreset(PRESETS.findIndex(p => p.name === bestName));
  if (opts.aspect){ const a = ASPECTS.find(x => x[0] === opts.aspect); if (a){ S.aspectKey = a[0]; S.aspect = a[1]; } }
  cropSearch(base);
  S.title = opts.title || ""; S.sub = opts.sub || ""; S.keyStats = opts.keyStats || [];
  S.border = opts.border || "none"; S.ov = opts.ov || "off";
  if (opts.capStyle) S.capStyle = opts.capStyle; if (opts.capPos) S.capPos = opts.capPos;
  syncAll(); schedule(); buildThumbs();
  return {preset: bestName, scores, stats: st};
}
function setStyle(o){ Object.assign(S, o); syncAll(); schedule(); }
function setPreset(name){ const i = PRESETS.findIndex(p => p.name === name); if (i >= 0) applyPreset(i); }
async function renderBlob(W, fmt){
  try { await document.fonts.ready; } catch(_){}
  const c = document.createElement("canvas"); renderTo(c, W || 1080);
  return {canvas: c, blob: await new Promise(r => c.toBlob(r, fmt === "png" ? "image/png" : "image/jpeg", .93))};
}

/* ---------------- link with the Lab: one image, one set of measurements ---------------- */
S.ovLayers = {main: true, net: true, flow: true}; S.fig = {scale: false, north: false, legend: false};
const escS = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const LAYN = {main: "Main channel", net: "Channel network", flow: "Flow lines (terrain)"};
function ovColor(kind, order){ return S.ov === "gold" ? "rgba(255,210,122,.95)" : S.ov === "ink" ? "rgba(8,10,14,.85)" : S.ov === "neon" ? (kind === "main" ? "#ffffff" : OV_ORDER[Math.min(OV_ORDER.length - 1, Math.max(0, (order || 1) - 1))]) : "rgba(255,255,255,.9)"; }
function labInfo(){ const api = window.__labAPI; try { return api && api.linkInfo ? api.linkInfo() : null; } catch(_){ return null; } }
function niceLen(m){ const p = 10**Math.floor(Math.log10(m)); return [1, 2, 5, 10].map(k => k*p).filter(v => v <= m).pop() || p; }
function drawFigureMarks(ctx, fw, fh){
  const L = labInfo(); if (!L || !S.srcMap) return; const unit = Math.max(1, Math.min(fw, fh)/700), sc = coverScale(fw, fh), pxOut = sc*S.srcMap.k; ctx.save();
  if (S.fig.scale && L.pxm){ const mpp = L.pxm/pxOut, len = niceLen(fw*.22*mpp), w = len/mpp, x = fw*.05, y = fh - fh*.06;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(x - 8*unit, y - 24*unit, w + 16*unit, 34*unit);
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, 4*unit); ctx.fillRect(x, y - 5*unit, 2*unit, 9*unit); ctx.fillRect(x + w - 2*unit, y - 5*unit, 2*unit, 9*unit);
    ctx.font = `600 ${12*unit}px Inter, 'Space Grotesk', sans-serif`; ctx.textBaseline = "alphabetic"; ctx.fillText(len >= 1000 ? len/1000 + " km" : len + " m", x, y - 8*unit); }
  if (S.fig.north){ const r = 16*unit, cx = fw - fw*.06, cy = fh*.07 + r; ctx.translate(cx, cy); ctx.rotate(-((L.north || 0) - S.rot)*Math.PI/180);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.arc(0, 0, r*1.45, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r*.55, r*.7); ctx.lineTo(0, r*.35); ctx.lineTo(-r*.55, r*.7); ctx.closePath(); ctx.fill();
    ctx.rotate(((L.north || 0) - S.rot)*Math.PI/180); ctx.font = `700 ${11*unit}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.fillText("N", 0, -r*1.65 + 2*unit); ctx.setTransform(1, 0, 0, 1, 0, 0); }
  if (S.fig.legend && S.ov !== "off"){ const items = Object.entries(L.layers).filter(([k, n]) => n && S.ovLayers[k]); if (items.length){ const lh = 18*unit, bw = 170*unit, bh = lh*items.length + 12*unit, x = fw - bw - fw*.04, y = fh - bh - fh*.05;
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x, y, bw, bh); ctx.font = `500 ${11.5*unit}px Inter, sans-serif`; ctx.textAlign = "left";
    items.forEach(([k], i) => { const yy = y + 6*unit + lh*i + lh/2; ctx.strokeStyle = ovColor(k, 3); ctx.lineWidth = (k === "main" ? 3.2 : 2)*unit; ctx.beginPath(); ctx.moveTo(x + 8*unit, yy); ctx.lineTo(x + 30*unit, yy); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText(LAYN[k], x + 38*unit, yy + 4*unit); }); } }
  ctx.restore();
}
function renderLink(){
  const el = $("link"); if (!el) return; const L = labInfo();
  if (!L){ el.innerHTML = `<div class="lk-row"><span class="lk-dot off"></span><span class="lk-t">No image yet. Open an image, or send a map view from Rivers: the <b>Image lab</b> measures it and this <b>Figure studio</b> turns the same image and its measurements into figures and art.</span></div>`; return; }
  const n = L.layers, any = n.main + n.net + n.flow;
  el.innerHTML = `<div class="lk-row"><span class="lk-dot ${L.fresh ? "ok" : "warn"}"></span><span class="lk-t"><b>Linked to the Image lab:</b> ${escS(L.name)} <small>${escS(L.size)} · ${escS(L.scale)}${L.fresh ? "" : " · the Lab now has a different image or crop"}</small></span>${L.fresh ? "" : `<button class="sm pri" id="s_lkSync">↻ Use the Lab's image</button>`}<button class="sm" id="s_lkLab">‹ Measure in Lab</button></div>
    <div class="lk-row"><span class="lk-l">Measured layers</span>${Object.keys(LAYN).map(k => `<button class="chip${S.ovLayers[k] && n[k] ? " on" : ""}${n[k] ? "" : " dim"}" data-lk="${k}" ${n[k] ? "" : "disabled"}>${LAYN[k]} ${n[k] ? "(" + n[k] + ")" : "· not measured"}</button>`).join("")}${any ? "" : `<span class="lk-h">Run Channel, Network or Terrain → Flow in the Lab to draw them here.</span>`}</div>
    <div class="lk-row"><span class="lk-l">Figure marks</span>${[["scale", "Scale bar" + (L.pxm ? "" : " (needs scale)")], ["north", "North arrow"], ["legend", "Legend"]].map(([k, t]) => `<button class="chip${S.fig[k] ? " on" : ""}" data-fg="${k}" ${k === "scale" && !L.pxm ? "disabled" : ""}>${t}</button>`).join("")}<button class="chip" id="s_lkStats" ${L.keyStats.length ? "" : "disabled"}>Data card with ${L.keyStats.length || "no"} measurements</button><button class="chip" id="s_lkFig">✦ Scientific figure</button></div>`;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  on("lkLab", () => window.showAppGlobal && window.showAppGlobal("lab"));
  on("lkSync", () => { window.__labAPI && window.__labAPI.sendToStudio(true); });
  on("lkStats", () => { S.keyStats = L.keyStats; S.border = "data"; if (!S.title && L.name) S.title = L.name; syncAll(); schedule(); });
  on("lkFig", () => figureMode({title: L.name, keyStats: L.keyStats, lines: any}));
  el.querySelectorAll("[data-lk]").forEach(b => b.onclick = () => { S.ovLayers[b.dataset.lk] = !S.ovLayers[b.dataset.lk]; if (S.ov === "off") S.ov = "white"; syncAll(); schedule(); renderLink(); });
  el.querySelectorAll("[data-fg]").forEach(b => b.onclick = () => { S.fig[b.dataset.fg] = !S.fig[b.dataset.fg]; schedule(); renderLink(); });
}
function figureMode(o){ const L = labInfo(); S.fig = {scale: !!(L && L.pxm), north: true, legend: !!o.lines}; if (o.lines && S.ov === "off") S.ov = "white"; S.ovLayers = {main: true, net: true, flow: true};
  if (o.keyStats && o.keyStats.length){ S.keyStats = o.keyStats; S.border = "data"; } if (o.title && !S.title) S.title = o.title; syncAll(); schedule(); renderLink(); }
function labChanged(){ renderLink(); if (S.img && S.ov !== "off") schedule(); }

window.__studio = {figureMode, labChanged, renderLink, setSource, autoStyle, setStyle, setPreset, renderTo, renderBlob, schedule, applyPreset, syncAll, S, PRESETS, save: () => $("btnSave").click(), hasImage: () => !!S.img};

})();
