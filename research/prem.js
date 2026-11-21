require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const P=fs.readFileSync('premium.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]<'2026-11-21');
const n=P.length, cb=P.map(x=>+x[1]), bn=P.map(x=>+x[2]), prem=cb.map((x,i)=>x/bn[i]-1);
// USDT/USD basis contaminates: use 7-day mean and z-score vs 90d to remove slow drift
const sma=(a,w)=>a.map((_,i)=>i<w-1?NaN:a.slice(i-w+1,i+1).reduce((s,v)=>s+v,0)/w);
const p7=sma(prem,7), p30=sma(prem,30), p90=sma(prem,90);
const sd90=prem.map((_,i)=>{if(i<89)return NaN;const w=prem.slice(i-89,i+1),m=w.reduce((s,v)=>s+v,0)/90;return Math.sqrt(w.reduce((s,v)=>s+(v-m)**2,0)/90)});
const feats={'プレミアム(当日)':prem,'7日平均':p7,'7日平均−90日平均':p7.map((x,i)=>x-p90[i]),'z(当日,90日)':prem.map((x,i)=>(x-p90[i])/sd90[i]),'7日の変化':p7.map((x,i)=>i>=7?x-p7[i-7]:NaN)};
const corr=(x,y)=>{const p=[];for(let i=0;i<x.length;i++)if(x[i]===x[i]&&y[i]===y[i]&&isFinite(x[i]))p.push([x[i],y[i]]);const k=p.length,mx=p.reduce((s,v)=>s+v[0],0)/k,my=p.reduce((s,v)=>s+v[1],0)/k;let a=0,b=0,c=0;p.forEach(v=>{a+=(v[0]-mx)*(v[1]-my);b+=(v[0]-mx)**2;c+=(v[1]-my)**2});return a/Math.sqrt(b*c);};
const half=P.findIndex(x=>x[0]>='2022-01-01'), cut2=n-730;
console.log('期間',P[0][0],'〜',P[n-1][0],'n',n,' 現在 prem',(prem[n-1]*100).toFixed(3)+'%','7日',(p7[n-1]*100).toFixed(3)+'%');
for(const H of [7,30,90]){ const y=bn.map((x,i)=>i+H<n?Math.log(bn[i+H]/x):NaN);
  console.log(`\n== ${H}日後リターンとの相関（2017-2021 / 2022- / 直近2年）`);
  for(const [k,f] of Object.entries(feats)) console.log(`  ${k.padEnd(14)} ${corr(f.slice(0,half),y.slice(0,half)).toFixed(3)} / ${corr(f.slice(half),y.slice(half)).toFixed(3)} / ${corr(f.slice(cut2),y.slice(cut2)).toFixed(3)}`);
}
// incremental value over the engine: run engine with BTC (binance closes) and check residual correlation
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2017-08-17'&&x[0]<'2026-11-21');
const m=rows.length, d={t:new Float64Array(m),o:new Float64Array(m),h:new Float64Array(m),l:new Float64Array(m),c:new Float64Array(m),v:new Float64Array(m)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), pm=new Map(P.map((x,i)=>[x[0],i]));
for(const [k,H] of [['s',7],['m',30]]){ const sc=R.hz[k].sc.pct; const fz=[],yy=[],ss=[];
  rows.forEach((x,i)=>{const j=pm.get(x[0]); if(j==null||i+H>=m)return; fz.push(feats['7日平均−90日平均'][j]); yy.push(Math.log(d.c[i+H]/d.c[i])); ss.push(sc[i]);});
  // partial: residual of y after regressing on score
  const ok=fz.map((_,i)=>fz[i]===fz[i]&&ss[i]===ss[i]); const F=fz.filter((_,i)=>ok[i]),Y=yy.filter((_,i)=>ok[i]),Sx=ss.filter((_,i)=>ok[i]);
  const mS=Sx.reduce((a,b)=>a+b,0)/Sx.length,mY=Y.reduce((a,b)=>a+b,0)/Y.length; let c=0,v=0; Sx.forEach((s,i)=>{c+=(s-mS)*(Y[i]-mY);v+=(s-mS)**2}); const b=c/v; const res=Y.map((y,i)=>y-mY-b*(Sx[i]-mS));
  console.log(`\n${k}: 今のスコアで説明した残りとの相関（プレミアムの上乗せ効果）: ${corr(F,res).toFixed(3)}  / スコアとプレミアムの相関 ${corr(F,Sx).toFixed(3)}`);
}
