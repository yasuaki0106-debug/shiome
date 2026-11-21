require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, lo=d.l, ls=E.longSeries({t:Array.from(d.t),c:Array.from(c)});
const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct;
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>T.findIndex(x=>x>=s));
const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor((s.length-1)*p)]}, pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
// in bottom phases (750-1100) of past 3 cycles: from days with mid<=20, days until mid>=75 and how much lower price went before that, and price change to that day
for(const th of [10,20]){ const wait=[],dn=[],up=[];
  for(let k=0;k<3;k++){ for(let i=HV[k]+750;i<=HV[k]+1100;i++){ if(!(M[i]<=th))continue; let j=i+1; while(j<n&&!(M[j]>=75)) j++; if(j>=n)continue; wait.push(j-i); let mn=Infinity; for(let z=i;z<=j;z++) mn=Math.min(mn,lo[z]); dn.push(mn/c[i]-1); up.push(c[j]/c[i]-1); } }
  console.log(`中期スコア${th}以下の日（底値圏・過去3回, ${wait.length}日）→ 買い好機まで: 日数 中央${q(wait,0.5)} [25%:${q(wait,0.25)} 75%:${q(wait,0.75)} 90%:${q(wait,0.9)}] | その間の最大下落 中央${pc(q(dn,0.5))} [悪い方25%:${pc(q(dn,0.25))} 10%:${pc(q(dn,0.1))}] | 買い好機の日の価格 中央${pc(q(up,0.5))} [${pc(q(up,0.25))}〜${pc(q(up,0.75))}]`);
}
console.log('現在 中期',M[n-1].toFixed(0),T[n-1]);
