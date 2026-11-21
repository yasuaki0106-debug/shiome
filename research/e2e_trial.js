require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, ls=E.longSeries({t:Array.from(d.t),c:Array.from(c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct, s200=R.ind.s200;
const ix=s=>T.findIndex(x=>x>=s), I=new Map(T.map((x,i)=>[x,i]));
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix), PK=['2013-12-04','2017-12-16','2021-11-08','2025-10-06'].map(ix), LOW=['2015-01-14','2018-12-15','2022-11-21'].map(ix);
// ---- causal gauge (same as app)
const oc=JSON.parse(fs.readFileSync('onchain.json','utf8')); const ser=k=>{const a=new Array(n).fill(NaN);(oc[k]||[]).forEach(([dd,v])=>{const i=I.get(dd);if(i!=null)a[i]=+v;});return a;};
const sm=(a,w)=>{const o=new Array(n).fill(NaN);let s=0,q=0;for(let i=0;i<n;i++){const x=a[i];if(x===x){s+=x;q++;}if(i>=w){const y=a[i-w];if(y===y){s-=y;q--;}}if(i>=w-1&&q>=w*0.9)o[i]=s/q;}return o;};
const mvrv=ser('mvrv'), mr=ser('minerrev'), mr365=sm(mr,365), m200=sm(Array.from(c),200);
const wk=[];for(let i=n-1;i>=0;i-=7)wk.unshift(i);const wr=E.rsi(Float64Array.from(wk.map(i=>c[i])),14),wrsi=new Array(n).fill(NaN);wk.forEach((i,k)=>{for(let j=i;j<Math.min(n,i+7);j++)wrsi[j]=wr[k];});
let mx=0;const dd=Array.from(c).map(x=>{mx=Math.max(mx,x);return x/mx-1;}), w2=Array.from(ls.w200,x=>Math.exp(x));
const SER=[[mvrv,0.60],[mr.map((x,i)=>x/mr365[i]),0.63],[wrsi,0.59],[dd,0.56],[Array.from(c).map((x,i)=>x/m200[i]),0.45]];
function gauge(i,k){ const prev=LOW.filter(L=>L<PK[k]); if(!prev.length) return NaN; let tot=0,ws=0; for(const [a,w] of SER){ const bots=prev.map(L=>a[L]).filter(x=>x===x), now=a[i], top=a[PK[k]]; if(!bots.length||!(now===now)||!(top===top))continue; const tgt=Math.max(...bots); if(!(top>tgt))continue; tot+=Math.min(1,Math.max(0,(top-now)/(top-tgt)))*w; ws+=w;} return ws?tot/ws:NaN; }

const s20=R.ind.s20, GTH=0.50;
function exitIdx(k){ if(k>=3) return n-1; const nh=HV[k+1]; for(let i=nh+400;i<Math.min(n,nh+551);i++){ let b=0; for(let j=i-13;j<=i;j++) if(c[j]<s200[j]) b++; if(b===14) return i; } return Math.min(n-1,nh+550); }
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const okG=(i,k)=>{const g=gauge(i,k);return !(g===g)||g>=GTH;};
const cross=i=>{ if(!(c[i]>s20[i]&&c[i-1]<=s20[i-1]))return false; let m=Infinity; for(let j=i-90;j<=i;j++)m=Math.min(m,c[j]); for(let j=i-20;j<=i;j++) if(c[j]<=m*1.001) return true; return false; };

const Sx=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
function assetSeries(name){ if(name==='BTC') return {ds:T,px:Array.from(c)}; const v=Sx[name]; return {ds:v.map(x=>x[0]),px:v.map(x=>x[1])}; }
function simAll(k,name,lev,TA=12.5){ // lev: 1 or 2 (2 = 2倍＋守りのルール)
  const A=assetSeries(name), a=HV[k]+750, b=Math.min(n-1,k<3?HV[k+1]:n-1), ex=exitIdx(k);
  if(A.ds[0]>T[a]) return null;
  // map BTC day index -> asset index (last trading day <= date) and next trading index (> date)
  const idxOf=new Map(A.ds.map((d,i)=>[d,i])); let ptr=0; const cur=new Array(n).fill(-1);
  for(let i=0;i<n;i++){ while(ptr+1<A.ds.length&&A.ds[ptr+1]<=T[i])ptr++; cur[i]=A.ds[ptr]<=T[i]?ptr:-1; }
  const nextIdx=i=>{ const j=cur[i]; return name==='BTC'?j:(j+1<A.ds.length?j+1:-1); };
  let cash=100, lots=[], log=[], last=-1e9, nb=0, trialOpen=null, cool=-1, firstBuy=null, levOn=true, minV=100, peakV=100, mdd=0, series=[], stops=0, sw=0, warn=0;
  const val=ai=>cash+lots.reduce((s,l)=>s+l.units*l.mult*A.px[ai]/1,0);
  let prevAi=-1;
  for(let i=a;i<=ex;i++){
    const ai=cur[i]; if(ai<0) continue;
    // daily revaluation of lots (apply leverage path) on new trading day
    if(ai!==prevAi&&prevAi>=0){ const r=A.px[ai]/A.px[prevAi]-1; lots.forEach(l=>{ if(prevAi<l.startAi) return; const L=(lev===2&&levOn)?2:1; l.v*=Math.max(0,1+L*r-((lev===2&&levOn)?(0.0105+0.05)/252*(ai-prevAi):0)); }); }
    prevAi=ai;
    if(i<=b){
      const g=gauge(i,k), okg=!(g===g)||g>=GTH;
      // protective leverage rule
      if(lev===2&&lots.length){ if(levOn&&M[i]<20){levOn=false;sw++;log.push([T[i],'2倍→1倍']);} else if(!levOn&&M[i]>=75){levOn=true;sw++;log.push([T[i],'1倍→2倍']);} }
      // trial stop
      lots.filter(l=>l.kind==='trial'&&!l.sold).forEach(l=>{ if(c[i]<l.btc*0.9){ cash+=l.v; log.push([T[i],'試しを撤退 '+((l.v/l.cost-1)*100).toFixed(0)+'%']); l.sold=true; stops++; cool=i+7; } });
      lots=lots.filter(l=>!l.sold);
      lots.filter(l=>l.kind==='buy'&&!l.warned).forEach(l=>{ if(c[i]<l.btc*0.65){ l.warned=true; warn++; log.push([T[i],'想定外ラインのアラーム']); } });
      // full buy
      const okm=nb===0?M[i]>=75:(M[i]>=60&&i-last>=14);
      if(okm&&okg&&nb<4){ const amt=25; cash-=amt; lots.push({kind:'buy',cost:amt,v:amt,btc:c[i],startAi:nextIdx(i)}); nb++; last=i; if(firstBuy==null)firstBuy=i; log.push([T[i],'買い'+nb+'回目']); if(lev===2&&!levOn&&M[i]>=75){levOn=true;} }
      // trial (only before first full buy, one at a time)
      if(firstBuy==null&&!lots.some(l=>l.kind==='trial')&&i>=cool&&cross(i)&&okg){ const amt=TA; cash-=amt; lots.push({kind:'trial',cost:amt,v:amt,btc:c[i],startAi:nextIdx(i)}); log.push([T[i],'試し買い']); }
    }
    const V=cash+lots.reduce((s,l)=>s+l.v,0); peakV=Math.max(peakV,V); mdd=Math.min(mdd,V/peakV-1); minV=Math.min(minV,V); series.push([T[i],+V.toFixed(1)]);
  }
  const V=series[series.length-1][1];
  return {name,lev,k,final:V,minV:+minV.toFixed(1),mdd,stops,sw,warn,log,series,exit:T[ex]};
}

console.log('試し買いの大きさを変えた場合（最終額／途中の最低額、予定額100）');
for(const [name,cy] of [['BTC',[0,1,2,3]],['MSTR',[2,3]],['COIN',[2,3]]]){ for(const TA of [12.5,25,50]){ let line=`${name} 試し${TA}: `; for(const k of cy){ const r=simAll(k,name,1,TA); line+=`[${['2015','2019','2023','今回'][k]} ${r.final.toFixed(0)}／${r.minV}] `; } console.log(line); } }
