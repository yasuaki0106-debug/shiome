require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, lo=d.l, L={t:Array.from(d.t),c:Array.from(c)}, ls=E.longSeries(L);
const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct;
const pc=x=>(x>0?'+':'')+(x*100).toFixed(1)+'%', mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
// signal days: all days with mid>=75 after 2014 where previous day <75 (fresh signals) + also rule E days in cycles
const sig=[]; for(let i=800;i<n-60;i++) if(M[i]>=75) sig.push(i);
const fresh=sig.filter(i=>!(M[i-1]>=75));
function evalSet(name,set){
  console.log(`\n## ${name}（${set.length}日）`);
  for(const N of [3,7,14]){ const line=[];
    for(const X of [0.02,0.04,0.06,0.08]){
      let hit=0; const cost=[]; set.forEach(i=>{ const L=c[i]*(1-X); let got=null; for(let j=i+1;j<=i+N;j++){ if(lo[j]<=L){got=L;break;} } if(got){hit++; cost.push(got/c[i]-1);} else cost.push(c[i+N]/c[i]-1); });
      line.push(`-${X*100}%: 届く${(hit/set.length*100).toFixed(0)}% 実質 ${pc(mean(cost))}`);
    }
    console.log(`  ${N}日以内に指値（届かなければ${N}日後に買う） | ${line.join(' | ')}`);
  }
}
evalSet('中期が買い好機になった初日',fresh);
evalSet('中期が買い好機の日すべて',sig);
// rule E in cycles
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>T.findIndex(x=>x>=s)); const ruleE=[];
for(let k=0;k<4;k++){ const a=HV[k]+750, b=Math.min(n-61,HV[k]+1460); let last=-1e9, cnt=0; for(let i=a;i<=b&&cnt<4;i++){ const okk=cnt===0?M[i]>=75:(M[i]>=60&&i-last>=14); if(okk){ruleE.push(i);last=i;cnt++;} } }
evalSet('サイクルの買い判定の日（16回）',ruleE);
