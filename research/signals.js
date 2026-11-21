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
const out=[];
for(const k of [0,1,2,3]){ const a=HV[k]+750, b=Math.min(n-1,k<3?HV[k+1]:n-1), ex=exitIdx(k);
  // full buys
  const buys=[]; let last=-1e9; for(let i=a;i<=b&&buys.length<4;i++){ const okm=buys.length===0?M[i]>=75:(M[i]>=60&&i-last>=14); if(okm&&okG(i,k)){buys.push(i);last=i;} }
  // trials until first full buy
  const end=buys.length?buys[0]:b; const trials=[]; let pos=null,cool=-1;
  for(let i=a;i<=end;i++){ if(pos&&c[i]<pos.stop){ trials.push({i:pos.i,stopAt:i}); pos=null; cool=i+7; } if(!pos&&i>=cool&&i<end&&cross(i)&&okG(i,k)) pos={i,stop:c[i]*0.9}; }
  if(pos) trials.push({i:pos.i,stopAt:null});
  const f=(i,H)=>i+H<n?c[i+H]/c[i]-1:NaN;
  const row=(kind,i,stopAt)=>{ let mn=Infinity; for(let j=i;j<=Math.min(n-1,i+365);j++) mn=Math.min(mn,c[j]); return {cyc:T[HV[k]].slice(0,4),kind,date:T[i],px:Math.round(c[i]),g:Math.round((gauge(i,k)||NaN)*100),stop:stopAt!=null?pc(c[stopAt]/c[i]-1)+'（'+(stopAt-i)+'日後）':(kind==='試し'?'撤退なし':''),d30:pc(f(i,30)),d90:pc(f(i,90)),d365:pc(f(i,365)),top:k<3?pc(c[ex]/c[i]-1):'進行中 '+pc(c[n-1]/c[i]-1),mae:pc(mn/c[i]-1)}; };
  trials.forEach(t=>out.push(row('試し',t.i,t.stopAt))); buys.forEach(i=>out.push(row('買い',i,null)));
  console.log(`\n## ${T[HV[k]].slice(0,4)}年の半減期のサイクル（出口 ${k<3?T[ex]+' $'+Math.round(c[ex]):'未到来'}）`);
  out.filter(r=>r.cyc===T[HV[k]].slice(0,4)).forEach(r=>console.log(`  ${r.kind} ${r.date} $${r.px} 底らしさ${r.g}% | 撤退:${r.stop||'—'} | 30日${r.d30} 90日${r.d90} 1年${r.d365} | 天井の出口で売ると ${r.top} | 1年以内の最大含み損 ${r.mae}`));
}
require('fs').writeFileSync('signals.json',JSON.stringify(out));
