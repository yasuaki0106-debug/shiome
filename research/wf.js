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
const SER=[[mvrv,0.60],[mr.map((x,i)=>x/mr365[i]),0.63],[wrsi,0.59],[dd,0.56],[w2,0.47],[Array.from(c).map((x,i)=>x/m200[i]),0.45]];
function gauge(i,k){ const prev=LOW.filter(L=>L<PK[k]); if(!prev.length) return NaN; let tot=0,ws=0; for(const [a,w] of SER){ const bots=prev.map(L=>a[L]).filter(x=>x===x), now=a[i], top=a[PK[k]]; if(!bots.length||!(now===now)||!(top===top))continue; const tgt=Math.max(...bots); if(!(top>tgt))continue; tot+=Math.min(1,Math.max(0,(top-now)/(top-tgt)))*w; ws+=w;} return ws?tot/ws:NaN; }
// ---- cycle exit (fixed rule)
function exitIdx(k){ if(k>=3) return n-1; const nh=HV[k+1]; for(let i=nh+400;i<Math.min(n,nh+551);i++){ let b=0; for(let j=i-13;j<=i;j++) if(c[j]<s200[j]) b++; if(b===14) return i; } return Math.min(n-1,nh+550); }
// ---- simulate buy rule for cycle k
function sim(k,p){ const a=HV[k]+p.g0, b=Math.min(n-1,k<3?HV[k+1]:n-1), end=exitIdx(k); const buys=[]; let last=-1e9;
  for(let i=a;i<=b&&buys.length<4;i++){ const g=gauge(i,k); const okg = !(g===g) || g>=p.gth; const okm = buys.length===0? M[i]>=p.f : (M[i]>=p.ad && i-last>=p.gap); if(okm&&okg){buys.push(i);last=i;} }
  if(!buys.length) return {buys,mult:1,mdd:0,none:true};
  let worst=0; for(let j=buys[0];j<=end;j++){ const done=buys.filter(x=>x<=j); const u=done.reduce((s,x)=>s+1/c[x],0); worst=Math.min(worst,u*c[j]/done.length-1); }
  const avg=buys.length/buys.reduce((s,x)=>s+1/c[x],0);
  return {buys,avg,mult:c[end]/avg,mdd:worst}; }
const obj=r=>r.none?-1:Math.log(r.mult)+2*r.mdd;      // 増え方（対数）と含み損の深さの両方を見る
const grid=[]; for(const g0 of [650,700,750,800,850]) for(const f of [60,75,90]) for(const ad of [40,60,75]) for(const gap of [7,14,30]) for(const gth of [0,0.45,0.55,0.65]) grid.push({g0,f,ad,gap,gth});
const cur={g0:750,f:75,ad:60,gap:14,gth:0.55};
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%', show=(k,r)=>r.none?'買いなし':`${r.buys.map(i=>T[i].slice(2)).join(',')} 平均$${Math.round(r.avg)} 含み損${pc(r.mdd)} ${k<3?'天井で'+r.mult.toFixed(1)+'倍':'今'+pc(r.mult-1)}`;
console.log('候補',grid.length,'通り');
for(const k of [1,2,3]){
  // choose best params using only cycles before k
  let best=null,bs=-1e9; for(const p of grid){ let s=0; for(let j=0;j<k;j++) s+=obj(sim(j,p)); s/=k; if(s>bs){bs=s;best=p;} }
  // rank of current params in training, and OOS results
  const rk=grid.map(p=>{let s=0;for(let j=0;j<k;j++)s+=obj(sim(j,p));return s/k;}).sort((a,b)=>b-a); let sc=0; for(let j=0;j<k;j++) sc+=obj(sim(j,cur)); sc/=k;
  const oosAll=grid.map(p=>obj(sim(k,p))).sort((a,b)=>b-a), oBest=obj(sim(k,best)), oCur=obj(sim(k,cur));
  const rank=v=>oosAll.findIndex(x=>x<=v)+1;
  console.log(`\n■ ${T[HV[k]].slice(0,4)}年サイクルを、それ以前の${k}回だけで決めたルールで試す`);
  console.log('  それ以前で最良だった設定:',JSON.stringify(best),'→ このサイクルで:',show(k,sim(k,best)),`（${grid.length}通り中 ${rank(oBest)}位）`);
  console.log('  今アプリに入っている設定:',JSON.stringify(cur),'→',show(k,sim(k,cur)),`（${rank(oCur)}位。学習期間での順位 ${rk.findIndex(x=>x<=sc)+1}位）`);
  const medI=oosAll[Math.floor(oosAll.length/2)]; const medP=grid.map(p=>sim(k,p)).sort((a,b)=>obj(b)-obj(a))[Math.floor(grid.length/2)];
  console.log('  参考：全候補の真ん中の成績 →',show(k,medP));
}
