require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const all=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
const LR=all.filter(x=>x[0]>='2012-01-01'&&+x[4]>0), L={t:LR.map(x=>Date.parse(x[0]+'T00:00:00Z')),c:LR.map(x=>+x[4])};
const ls=E.longSeries(L), lmap=new Map(LR.map((x,i)=>[x[0],i]));
const from=process.argv[2]||'2017-08-17', rows=all.filter(x=>x[0]>=from), n=rows.length;
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const al=a=>Float64Array.from(rows,x=>{const i=lmap.get(x[0]);return i==null?NaN:a[i]});
const pc=x=>x===x?(x*100).toFixed(1)+'%':'—';
for(const [nm,ex] of [['従来',null],['長期サイクル要因あり',{pl:al(ls.resid),w200:al(ls.w200)}]]){
  const R=E.run(d,ex); console.log('\n#',nm);
  for(const h of E.HORIZONS){ if(h.k==='d')continue; const z=R.hz[h.k],ev=z.ev;
    console.log(` ${h.name}: now ${z.pct.toFixed(0)} ${E.VERDICT[z.verdict]} [${ev.status}] 買い系 ${pc(ev.st.sig.win)}/${pc(ev.st.sig.mean)} 全日 ${pc(ev.st.all.win)}/${pc(ev.st.all.mean)} 見送り ${pc(ev.st.avoid.win)}/${pc(ev.st.avoid.mean)} | 直近2年 買い系 ${pc(ev.rc.sig.win)}/${pc(ev.rc.sig.mean)} 全日 ${pc(ev.rc.all.win)}/${pc(ev.rc.all.mean)} | 売買 年率${pc(z.sim.cagr)} 最大下落${pc(z.sim.mdd)}`);
    if(ex) console.log('    cyc重み:',z.sc.factors.filter(f=>f.cat==='cyc').map(f=>`${f.id} ic${(f.ic||0).toFixed(2)} w${f.w.toFixed(2)} z${(f.z||0).toFixed(1)}`).join(' | '));
  }
}
const ci=E.cycleInfo(L,ls,L.t[L.t.length-1]+864e5,L.c[L.c.length-1]);
console.log('\ncycle:',ci.name,ci.day,'日目 score',ci.score,'valPct',ci.valPct.toFixed(2),'w200',ci.w200.toFixed(2)); ci.checks.forEach(c=>console.log('  ',c.ok?'✓':'×',c.text));
ci.cyc.forEach(c=>console.log('  ',new Date(c.h).toISOString().slice(0,10),'天井',new Date(c.peakT).toISOString().slice(0,10),Math.round(c.peak),c.peakDay,'底',new Date(c.lowT).toISOString().slice(0,10),Math.round(c.low),c.lowDay,(c.dd*100).toFixed(0)+'%'));
