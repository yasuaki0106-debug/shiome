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

const S7=R.hz.s.sc.pct, s20=R.ind.s20, lo=d.l;
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const TR={
 'T1 中期40以上':i=>M[i]>=40,
 'T2 中期50以上':i=>M[i]>=50,
 'T3 中期60以上':i=>M[i]>=60,
 'T4 短期60＋中期40':i=>S7[i]>=60&&M[i]>=40,
 'T5 短期75以上':i=>S7[i]>=75,
 'T6 20日線回復（直近20日に90日安値）':i=>{ if(!(c[i]>s20[i]&&c[i-1]<=s20[i-1]))return false; let m=Infinity; for(let j=i-90;j<=i;j++)m=Math.min(m,c[j]); for(let j=i-20;j<=i;j++) if(c[j]<=m*1.001) return true; return false; },
};
const ST={
 'S1 直近30日の安値の3%下':(i)=>{let m=Infinity;for(let j=i-30;j<=i;j++)m=Math.min(m,c[j]);return m*0.97;},
 'S2 買値の-10%':(i)=>c[i]*0.90,
 'S3 買値の-15%':(i)=>c[i]*0.85,
};
function run(k,trig,stopf,gth){ // trials from gate until first full buy (mid>=75 & gauge>=.55) or end
  const a=HV[k]+750, b=Math.min(n-1,k<3?HV[k+1]:n-1); let full=null; for(let i=a;i<=b;i++){ const g=gauge(i,k); if(M[i]>=75&&(!(g===g)||g>=0.55)){full=i;break;} }
  const end=full??b; const trials=[]; let pos=null, cool=-1;
  for(let i=a;i<=end;i++){
    if(pos){ if(c[i]<pos.stop){ trials.push({in:pos.i,out:i,r:c[i]/c[pos.i]-1,stopped:true}); pos=null; cool=i+7; } }
    if(!pos && i>=cool && i<end){ const g=gauge(i,k); if(trig(i)&&(!(g===g)||g>=gth)){ pos={i,stop:stopf(i)}; } }
  }
  let carry=null; if(pos){ carry={in:pos.i,r:c[end]/c[pos.i]-1,stop:pos.stop}; }
  return {full,trials,carry,end};
}
for(const [tn,tf] of Object.entries(TR)) for(const [sn,sf] of Object.entries(ST)){
  let line=`${tn} × ${sn}: `; let tot=0, cnt=0, stops=0;
  for(const k of [0,1,2,3]){ const r=run(k,tf,sf,0.55); const loss=r.trials.reduce((s,t)=>s+t.r,0); const car=r.carry?r.carry.r:0; tot+=loss+car; cnt+=r.trials.length+(r.carry?1:0); stops+=r.trials.length;
    line+=`[${T[HV[k]].slice(0,4)}: 撤退${r.trials.length}回(計${pc(loss)}) ${r.carry?(r.full?'本買い時に':'今')+pc(car)+'（'+T[r.carry.in].slice(2)+'）':'持ち越しなし'}] `; }
  console.log(line+`| 合計 ${pc(tot)} / 試し${cnt}回 撤退${stops}回`);
}
