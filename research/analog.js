require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, ls=E.longSeries({t:Array.from(d.t),c:Array.from(c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct;
const ix=s=>T.findIndex(x=>x>=s), PK=['2013-12-04','2017-12-16','2021-11-08','2025-10-06'].map(ix), HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix);
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
// state: after cycle peak; price within +5% of the lowest close since peak; there was an earlier low >=60 days ago followed by a rally >=30% (failed rally → retest)
function state(i,k){ let lo=Infinity,li=-1; for(let j=PK[k];j<i-59;j++) if(c[j]<lo){lo=c[j];li=j;} if(li<0) return null; let hi=0; for(let j=li;j<i;j++) hi=Math.max(hi,c[j]); const rally=hi/lo-1; let cur=Infinity; for(let j=PK[k];j<=i;j++) cur=Math.min(cur,c[j]); return {retest:c[i]<=Math.min(lo,cur)*1.05, rally, lo, li, dd:c[i]/c[PK[k]]-1, days:i-PK[k]}; }
const eps=[];
for(let k=0;k<4;k++){ const end=k<3?HV[k+1]:n-1; let last=-999; for(let i=PK[k]+120;i<=end;i++){ const s=state(i,k); if(s&&s.retest&&s.rally>=0.3&&i-last>45){ eps.push({k,i,s}); last=i; } else if(s&&s.retest&&s.rally>=0.3) last=i; } }
console.log('「安値を付ける→3割以上戻す→また安値を試す」局面（天井の後）');
for(const e of eps){ const i=e.i; const f=H=>i+H<n?c[i+H]/c[i]-1:NaN; let mn=Infinity,mi=i; for(let j=i;j<=Math.min(n-1,i+365);j++) if(c[j]<mn){mn=c[j];mi=j;}
  console.log(` ${T[i]} $${Math.round(c[i])} 天井から${pc(e.s.dd)}・${e.s.days}日 | 前の安値 ${T[e.s.li]} $${Math.round(e.s.lo)} から${pc(e.s.rally)}戻した後 | 中期${M[i]===M[i]?M[i].toFixed(0):'—'} | その後: 30日${pc(f(30))} 90日${pc(f(90))} 180日${pc(f(180))} 1年${pc(f(365))} | さらに下げた幅 ${pc(mn/c[i]-1)}（${mi-i}日後に底）`); }

// ---- 「前の安値（その後3割以上戻した安値）を、終値で3%以上割り込んだ日」とその後
console.log('\n前の安値を割り込んだ日（初回）とその後');
for(let k=0;k<4;k++){ const end=k<3?HV[k+1]:n-1; const done=new Set();
  for(let i=PK[k]+120;i<=end;i++){ const s=state(i,k); if(!s||s.rally<0.3) continue; if(c[i]<s.lo*0.97 && !done.has(s.li)){ done.add(s.li);
      let mn=Infinity,mi=i; for(let j=i;j<=Math.min(n-1,i+365);j++) if(c[j]<mn){mn=c[j];mi=j;}
      console.log(` ${T[i]} $${Math.round(c[i])}（天井から${s.days}日）前の安値 ${T[s.li]} $${Math.round(s.lo)} を割る → その後さらに ${pc(mn/c[i]-1)}、前の安値比 ${pc(mn/s.lo-1)}、底まで${mi-i}日 | 1年後 ${pc(i+365<n?c[i+365]/c[i]-1:NaN)}`); } } }
