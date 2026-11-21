require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const ls=E.longSeries({t:Array.from(d.t),c:Array.from(d.c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200});
const P={s:R.hz.s.sc.pct,m:R.hz.m.sc.pct,l:R.hz.l.sc.pct}, c=d.c, ix=s=>T.findIndex(x=>x>=s);
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
// monthly path
console.log('実際の値動き（月末終値）'); for(const m of ['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']){ const i=T.filter(x=>x.startsWith(m)).map(ix); const hi=Math.max(...i.map(k=>d.h[k])), lo=Math.min(...i.map(k=>d.l[k])); console.log(' ',m,'終値',Math.round(c[i[i.length-1]]),'高値',Math.round(hi),'安値',Math.round(lo)); }
// replay at dates: scores, plan stage (rule E), 30d forecast quantile using bands of similar mid pct up to that day
function fcAt(i,H){ const now=P.m[i]; const rs=[]; for(let t=0;t+H<i;t++){ const p=P.m[t]; if(p===p&&Math.abs(p-now)<=12.5) rs.push(c[t+H]/c[t]-1); } rs.sort((a,b)=>a-b); const q=x=>rs[Math.floor((rs.length-1)*x)]; return {q10:q(0.1),q25:q(0.25),q50:q(0.5),q75:q(0.75),q90:q(0.9),n:rs.length}; }
const HV=ix('2024-04-20');
let buys=[], last=-1e9;
for(let i=HV+750;i<n;i++){ const okk= buys.length===0 ? P.m[i]>=75 : (P.m[i]>=60 && i-last>=14); if(okk && buys.length<4){ buys.push(i); last=i; } }
console.log('\n買いルールが点いた日:',buys.map(i=>T[i]+' $'+Math.round(c[i])).join(', '));
for(const day of ['2026-06-30','2026-07-15','2026-08-01','2026-08-19','2026-09-18','2026-10-04','2026-10-20','2026-11-20']){
  const i=ix(day), f=fcAt(i,30), stage= buys.includes(i)?'買い':(P.m[i]>=40?'準備':'まだ');
  // realized 30d after
  const j=Math.min(n-1,i+30); let mn=Infinity; for(let k=i+1;k<=j;k++) mn=Math.min(mn,d.l[k]);
  console.log(`${day} $${Math.round(c[i])} | 短期${P.s[i].toFixed(0)} 中期${P.m[i].toFixed(0)} 長期${P.l[i].toFixed(0)} → ${stage} | 30日予測: 中央${pc(f.q50)} 4回に1回${pc(f.q25)} 10回に1回${pc(f.q10)}〜上は${pc(f.q75)}/${pc(f.q90)} | 実際の30日: 終値${pc(c[j]/c[i]-1)} 最安${pc(mn/c[i]-1)}`);
}
