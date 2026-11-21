require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const all=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const LR=all.filter(x=>x[0]>='2012-01-01'&&+x[4]>0), L={t:LR.map(x=>Date.parse(x[0]+'T00:00:00Z')),c:LR.map(x=>+x[4])};
const ls=E.longSeries(L), lmap=new Map(LR.map((x,i)=>[x[0],i]));
const rows=all.filter(x=>x[0]>='2017-08-17'), n=rows.length;
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const al=a=>Float64Array.from(rows,x=>{const i=lmap.get(x[0]);return i==null?NaN:a[i]});
const R=E.run(d,{pl:al(ls.resid),w200:al(ls.w200)}), idx=new Map(rows.map((x,i)=>[x[0],i]));
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(1)+'%':'—', mean=a=>a.reduce((s,v)=>s+v,0)/a.length, win=a=>a.filter(x=>x>0).length/a.length;
// common dates
const mv=new Map(S.MSTR.map(x=>[x[0],x[1]])), cv=new Map(S.COIN.map(x=>[x[0],x[1]]));
const ds=S.COIN.map(x=>x[0]).filter(x=>mv.has(x)&&idx.has(x)); const m=ds.length, cut=m-504;
const M=ds.map(x=>mv.get(x)), C=ds.map(x=>cv.get(x)), B=ds.map(x=>d.c[idx.get(x)]);
console.log('共通期間',ds[0],'〜',ds[m-1],m);
// 1) signal edge per stock with new engine, by horizon
for(const k of ['s','m','l']){ const td=Math.round(R.hz[k].sc.H*252/365), p=R.hz[k].sc.pct;
  for(const [nm,X] of [['MSTR',M],['COIN',C]]){ const g={a:[],s:[],a2:[],s2:[]};
    for(let i=0;i+td<m;i++){const q=p[idx.get(ds[i])-1]; if(!(q===q))continue; const r=X[i+td]/X[i]-1; g.a.push(r); if(q>=60)g.s.push(r); if(i>=cut){g.a2.push(r); if(q>=60)g.s2.push(r);} }
    console.log(`${k} ${nm}: 買い系 ${pc(win(g.s))}/${pc(mean(g.s))} vs 全日 ${pc(win(g.a))}/${pc(mean(g.a))} | 直近2年 買い系 ${pc(win(g.s2))}/${pc(mean(g.s2))} vs ${pc(win(g.a2))}/${pc(mean(g.a2))}`);
  }}
// 2) relative value: ratio z of log(MSTR/COIN) and stock/BTC (90d) -> forward 21/63d relative return
function z90(arr,i){ const w=arr.slice(i-89,i+1), mu=mean(w), sd=Math.sqrt(mean(w.map(x=>(x-mu)**2))); return (arr[i]-mu)/sd; }
const lr=M.map((x,i)=>Math.log(x/C[i]));
for(const H of [21,63]){ const lo=[],hi=[],mid=[],lo2=[],hi2=[];
  for(let i=90;i+H<m;i++){ const z=z90(lr,i), rel=(M[i+H]/M[i])/(C[i+H]/C[i])-1; (z<=-1?lo:z>=1?hi:mid).push(rel); if(i>=cut){ if(z<=-1)lo2.push(rel); if(z>=1)hi2.push(rel);} }
  console.log(`MSTR/COIN比 ${H}日後のMSTRの相対成績: 比が割安(z≤-1) ${pc(mean(lo))} 勝${pc(win(lo))} n${lo.length} | 割高(z≥1) ${pc(mean(hi))} 勝${pc(win(hi))} n${hi.length} | 直近2年 割安 ${pc(mean(lo2))} n${lo2.length} 割高 ${pc(mean(hi2))} n${hi2.length}`);
}
// 3) beta in up vs down BTC moves (last 2y), and cycle bottom performance
function beta(X,a,b){const rs=[],rb=[];for(let i=a+1;i<b;i++){rs.push(Math.log(X[i]/X[i-1]));rb.push(Math.log(B[i]/B[i-1]));}const ms=mean(rs),mb=mean(rb);let c=0,v=0;for(let i=0;i<rs.length;i++){c+=(rs[i]-ms)*(rb[i]-mb);v+=(rb[i]-mb)**2;}return c/v;}
console.log('ベータ 全期間 MSTR',beta(M,0,m).toFixed(2),'COIN',beta(C,0,m).toFixed(2),'| 直近1年 MSTR',beta(M,m-252,m).toFixed(2),'COIN',beta(C,m-252,m).toFixed(2));
const j=ds.findIndex(x=>x>='2022-11-21'), k2=ds.findIndex(x=>x>='2024-03-13'), k3=ds.findIndex(x=>x>='2025-10-06');
console.log(`前回の底→BTC天井: BTC ${pc(B[k3]/B[j]-1)} MSTR ${pc(M[k3]/M[j]-1)} COIN ${pc(C[k3]/C[j]-1)} | 底→2024/3: BTC ${pc(B[k2]/B[j]-1)} MSTR ${pc(M[k2]/M[j]-1)} COIN ${pc(C[k2]/C[j]-1)}`);
const j2=ds.findIndex(x=>x>='2026-06-30');
console.log(`今回の安値(6/30)から今: BTC ${pc(B[m-1]/B[j2]-1)} MSTR ${pc(M[m-1]/M[j2]-1)} COIN ${pc(C[m-1]/C[j2]-1)} | BTC天井から: BTC ${pc(B[m-1]/B[k3]-1)} MSTR ${pc(M[m-1]/M[k3]-1)} COIN ${pc(C[m-1]/C[k3]-1)}`);
console.log('現在 MSTR/COIN比 z90:', z90(lr,m-1).toFixed(2), ' MSTR/BTC z90:', z90(M.map((x,i)=>Math.log(x/B[i])),m-1).toFixed(2),' COIN/BTC z90:', z90(C.map((x,i)=>Math.log(x/B[i])),m-1).toFixed(2));
for(const [nm,X] of [['MSTR',M],['COIN',C]]){ const r=X.map((x,i)=>Math.log(x/B[i]));
  for(const H of [21,63]){ const lo=[],hi=[],lo2=[],hi2=[];
    for(let i=90;i+H<m;i++){ const z=z90(r,i), rel=(X[i+H]/X[i])/(B[i+H]/B[i])-1; if(z<=-1.5){lo.push(rel); if(i>=cut)lo2.push(rel);} if(z>=1.5){hi.push(rel); if(i>=cut)hi2.push(rel);} }
    console.log(`${nm}/BTC ${H}日後のBTC比: 割安(z≤-1.5) ${pc(mean(lo))} 勝${pc(win(lo))} n${lo.length} | 割高(z≥1.5) ${pc(mean(hi))} 勝${pc(win(hi))} n${hi.length} | 直近2年 割安 ${pc(mean(lo2))} n${lo2.length} 割高 ${pc(mean(hi2))} n${hi2.length}`); } }
