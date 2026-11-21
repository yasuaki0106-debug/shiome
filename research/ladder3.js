require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>+x[4]>0);
const t=rows.map(x=>x[0]), c=rows.map(x=>+x[4]), n=rows.length, ix=d=>t.findIndex(x=>x>=d);
const H=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const L={t:Array.from(d.t),c:Array.from(d.c)}, ls=E.longSeries(L);
const R=E.run(d,{pl:ls.resid,w200:ls.w200}), P={s:R.hz.s.sc.pct,m:R.hz.m.sc.pct,l:R.hz.l.sc.pct}, ind=R.ind;
const s50=ind.s50, s200=ind.s200, r14=ind.r14;
const pc=x=>(x>0?'+':'')+(x*100).toFixed(1)+'%';
// weekly plan over bottom phase; weight w(i) decides how many units to buy this week; unspent cash rolls; at phase end, remaining cash is spent over the following 8 weeks (or immediately if signal)
function run(a,b,wfn){ const weeks=[]; for(let i=a;i<=b;i+=7) weeks.push(i); const N=weeks.length; let cash=N, units=0;
  weeks.forEach((i,k)=>{ const left=N-k; const base=cash/left; const w=Math.max(0,wfn(i)); const spend=Math.min(cash,base*w); units+=spend/c[i]; cash-=spend; });
  // leftover: spend evenly over next 8 weeks
  for(let k=1;k<=8&&cash>1e-9;k++){ const i=Math.min(n-1,b+7*k); const sp=cash/(9-k); units+=sp/c[i]; cash-=sp; }
  return N/units; }
const W={
 '毎週同額':i=>1,
 '中期スコアで増減':i=>P.m[i]>=60?2:P.m[i]<40?0.5:1,
 '短期スコアで増減':i=>P.s[i]>=60?2:P.s[i]<40?0.5:1,
 '短期+中期の平均':i=>{const v=(P.s[i]+P.m[i])/2;return v>=60?2:v<40?0.5:1;},
 '長期スコアで増減':i=>P.l[i]>=75?1.5:P.l[i]<50?0.5:1,
 '見送りの週は買わない（中期）':i=>P.m[i]<40?0:1,
 '下げの勢いが止まるまで控える（50日線が上向き）':i=>s50[i]>=s50[i-7]?2:0.5,
 '売られすぎで多く（RSI<35）':i=>r14[i]<35?2:1,
 '200日線から深く下で多く':i=>c[i]/s200[i]<0.8?2:1,
};
const tot={}; Object.keys(W).forEach(k=>tot[k]=[]);
for(const k of [0,1,2,3]){ const a=H[k]+750, b=Math.min(n-1,H[k]+1000); if(a>=n)continue;
  const base=run(a,b,W['毎週同額']); let line=`${t[H[k]].slice(0,4)}年: `;
  Object.entries(W).forEach(([nm,f])=>{ const v=run(a,b,f)/base-1; tot[nm].push(v); });
}
console.log('毎週同額と比べた平均の買値（マイナス＝安く買えた）  [2015, 2018, 2022, 2026途中] 平均');
Object.entries(tot).forEach(([nm,v])=>console.log(`  ${nm.padEnd(26)} ${v.map(pc).join(' ')}  | 平均 ${pc(v.reduce((a,b)=>a+b,0)/v.length)}  勝ち ${v.filter(x=>x<-0.001).length}/${v.length}`));
