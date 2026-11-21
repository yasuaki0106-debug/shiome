require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const all=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const LR=all.filter(x=>x[0]>='2012-01-01'&&+x[4]>0), L={t:LR.map(x=>Date.parse(x[0]+'T00:00:00Z')),c:LR.map(x=>+x[4])};
const ls=E.longSeries(L), lmap=new Map(LR.map((x,i)=>[x[0],i]));
const rows=all.filter(x=>x[0]>='2017-08-17'), n=rows.length;
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const al=a=>Float64Array.from(rows,x=>{const i=lmap.get(x[0]);return i==null?NaN:a[i]});
const RB=E.run(d,{pl:al(ls.resid),w200:al(ls.w200)}), bidx=new Map(rows.map((x,i)=>[x[0],i]));
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(1)+'%':'—', mean=a=>a.reduce((s,v)=>s+v,0)/a.length, win=a=>a.filter(x=>x>0).length/a.length;
for(const sym of ['MSTR','COIN']){
  const v=S[sym].filter(x=>x[0]>='2015-01-01'), m=v.length;
  const s={t:new Float64Array(m),o:new Float64Array(m),h:new Float64Array(m),l:new Float64Array(m),c:new Float64Array(m),v:new Float64Array(m).fill(1)};
  v.forEach((x,i)=>{s.t[i]=Date.parse(x[0]+'T00:00:00Z');s.o[i]=s.h[i]=s.l[i]=s.c[i]=x[1];});
  // stock-own engine (trading-day horizons approx: 5/21/62 bars) – engine uses fixed 7/30/90 bars, so scale: run as-is but horizons are in bars
  const RS=E.run(s,null);
  console.log(`\n### ${sym} ${v[0][0]}〜 ${m}営業日（株自身の判定は終値のみ、出来高なし）`);
  const cut=m-504;
  for(const [k,td] of [['s',5],['m',21],['l',62]]){
    const pB=RB.hz[k].sc.pct, pS=RS.hz[k].sc.pct;
    const g={bA:[],bS:[],sA:[],sS:[],all:[],bS2:[],sS2:[],all2:[],both:[],both2:[]};
    for(let i=0;i+td<m;i++){ const bi=bidx.get(v[i][0]); const qb=bi!=null?pB[bi-1]:NaN, qs=pS[i]; if(!(qb===qb)||!(qs===qs))continue;
      const r=s.c[i+td]/s.c[i]-1; g.all.push(r); if(i>=cut)g.all2.push(r);
      if(qb>=60){g.bS.push(r); if(i>=cut)g.bS2.push(r);} if(qs>=60){g.sS.push(r); if(i>=cut)g.sS2.push(r);} if(qb>=60&&qs>=60){g.both.push(r); if(i>=cut)g.both2.push(r);} }
    const f=a=>`${pc(win(a))}/${pc(mean(a))} n${a.length}`;
    console.log(` ${k}(${td}日) 全日 ${f(g.all)} | BTC基準の買い ${f(g.bS)} | 株自身の買い ${f(g.sS)} | 両方 ${f(g.both)}`);
    console.log(`        直近2年: 全日 ${f(g.all2)} | BTC基準 ${f(g.bS2)} | 株自身 ${f(g.sS2)} | 両方 ${f(g.both2)}`);
  }
}
