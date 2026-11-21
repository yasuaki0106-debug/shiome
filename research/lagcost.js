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
const pc=x=>(x>0?'+':'')+(x*100).toFixed(1)+'%', mean=a=>a.reduce((s,v)=>s+v,0)/a.length, med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
// plan type per day from acts (s,m,l) : buy if best>=2 && s>=1 ; limit if best>=2 || (m>=1&&l>=1); else skip
const lv=p=>p!==p?-1:p>=75?3:p>=60?2:p>=40?1:0;
const plan=i=>{const s=lv(R.hz.s.sc.pct[i]),m=lv(R.hz.m.sc.pct[i]),l=lv(R.hz.l.sc.pct[i]),b=Math.max(s,m,l); return b>=2&&s>=1?'buy':(b>=2||(m>=1&&l>=1))?'limit':'skip';};
const on=[]; for(let i=800;i<n-1;i++) if(plan(i)==='buy'&&plan(i-1)!=='buy') on.push(i);
console.log('「買う」に切り替わった日',on.length,'回');
console.log(' その日のBTCの値動き（前日終値→当日終値）: 平均',pc(mean(on.map(i=>d.c[i]/d.c[i-1]-1))),'中央',pc(med(on.map(i=>d.c[i]/d.c[i-1]-1))),' +3%以上だった割合',(on.filter(i=>d.c[i]/d.c[i-1]-1>=0.03).length/on.length*100).toFixed(0)+'%');
console.log(' うち安値→終値: 平均',pc(mean(on.map(i=>d.c[i]/d.l[i]-1))));
for(const sym of ['MSTR','COIN']){ const v=new Map(S[sym]), ds=S[sym].map(x=>x[0]); const sameD=[],nextD=[];
  on.forEach(i=>{ const D=rows[i][0]; const k=ds.indexOf(D); if(k<1||k+1>=ds.length)return; sameD.push(S[sym][k][1]/S[sym][k-1][1]-1); nextD.push(S[sym][k+1][1]/S[sym][k][1]-1); });
  console.log(` ${sym}: 切り替わった日（判定が出る前）の株の値動き 平均${pc(mean(sameD))} 中央${pc(med(sameD))} n${sameD.length} | 翌営業日 平均${pc(mean(nextD))}`);
}
// big up days
for(const th of [0.05,0.08]){ const big=[]; for(let i=800;i<n-30;i++) if(d.c[i]/d.c[i-1]-1>=th) big.push(i);
  console.log(`BTCが1日で${th*100}%以上上げた日 ${big.length}回: 翌日 ${pc(mean(big.map(i=>d.c[i+1]/d.c[i]-1)))} 7日後 ${pc(mean(big.map(i=>d.c[i+7]/d.c[i]-1)))} 30日後 ${pc(mean(big.map(i=>d.c[i+30]/d.c[i]-1)))} | その日の前の判定が買う/指値だった割合 ${(big.filter(i=>plan(i-1)!=='skip').length/big.length*100).toFixed(0)}%`);}
