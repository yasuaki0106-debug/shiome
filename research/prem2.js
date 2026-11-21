require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const all=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const LR=all.filter(x=>x[0]>='2012-01-01'&&+x[4]>0), L={t:LR.map(x=>Date.parse(x[0]+'T00:00:00Z')),c:LR.map(x=>+x[4])};
const ls=E.longSeries(L), lmap=new Map(LR.map((x,i)=>[x[0],i]));
// use Binance closes as base (same as app)
const P=fs.readFileSync('premium.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]<'2026-11-21');
const pmap=new Map(P.map(x=>[x[0],+x[1]/+x[2]-1]));
const rows=all.filter(x=>x[0]>='2017-08-17'&&x[0]<'2026-11-21'), n=rows.length;
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const al=a=>Float64Array.from(rows,x=>{const i=lmap.get(x[0]);return i==null?NaN:a[i]});
const cbp=Float64Array.from(rows,x=>pmap.has(x[0])?pmap.get(x[0]):NaN);
const pc=x=>x===x?(x*100).toFixed(1)+'%':'—';
for(const [nm,ex] of [['今',{pl:al(ls.resid),w200:al(ls.w200)}],['+コインベース',{pl:al(ls.resid),w200:al(ls.w200),cbp}]]){
  const R=E.run(d,ex); console.log('#',nm);
  for(const h of E.HORIZONS){ if(h.k==='d')continue; const z=R.hz[h.k],ev=z.ev;
    console.log(` ${h.name}: now ${z.pct.toFixed(0)} [${ev.status}] 買い系 ${pc(ev.st.sig.win)}/${pc(ev.st.sig.mean)} 全日 ${pc(ev.st.all.win)}/${pc(ev.st.all.mean)} 見送り ${pc(ev.st.avoid.win)}/${pc(ev.st.avoid.mean)} | 直近2年 買い系 ${pc(ev.rc.sig.win)}/${pc(ev.rc.sig.mean)} 全日 ${pc(ev.rc.all.win)}/${pc(ev.rc.all.mean)} 見送り ${pc(ev.rc.avoid.win)}/${pc(ev.rc.avoid.mean)} | 売買 年率${pc(z.sim.cagr)} 最大下落${pc(z.sim.mdd)}`);
    const f=z.sc.factors.find(f=>f.id==='u_cbp'); if(f&&nm!=='今') console.log('    cbp ic',(f.ic||0).toFixed(3),'w',f.w.toFixed(3),'z',(f.z||0).toFixed(2),f.text);
  }
}
