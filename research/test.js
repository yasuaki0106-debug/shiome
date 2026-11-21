require('./engine.js');
const fs=require('fs');const E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(','));
function load(from){const r=rows.filter(x=>x[0]>=from);const n=r.length;const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
r.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});return d;}
const from=process.argv[2]||'2014-01-01';
const d=load(from);console.log('days',d.c.length,'from',from,'last close',d.c[d.c.length-1]);
let t0=Date.now();const R=E.run(d,null);console.log('run ms',Date.now()-t0);
const pc=x=>x===x?(x*100).toFixed(1)+'%':'—';
for(const h of E.HORIZONS){const z=R.hz[h.k],ev=z.ev;
 console.log(`\n== ${h.name} H=${h.d}  now pct=${z.pct.toFixed(1)} ${E.VERDICT[z.verdict]} status=${ev.status} firstOOS=${new Date(d.t[ev.first]).toISOString().slice(0,10)} indep≈${ev.indep}`);
 for(const k of ['all','buy','try','wait','avoid','sig'])console.log(`  ${k.padEnd(6)} n=${String(ev.st[k].n).padStart(5)} win=${pc(ev.st[k].win)} mean=${pc(ev.st[k].mean)} med=${pc(ev.st[k].med)}`);
 console.log(`  recent2y: all ${pc(ev.rc.all.win)}/${pc(ev.rc.all.mean)}  sig n=${ev.rc.sig.n} ${pc(ev.rc.sig.win)}/${pc(ev.rc.sig.mean)}  avoid n=${ev.rc.avoid.n} ${pc(ev.rc.avoid.win)}/${pc(ev.rc.avoid.mean)}`);
 console.log(`  sim: cagr ${pc(z.sim.cagr)} vs bh ${pc(z.sim.bcagr)}  mdd ${pc(z.sim.mdd)} vs ${pc(z.sim.bmdd)} exposure ${pc(z.sim.exposure)} trades ${z.sim.trades} sharpe ${z.sim.sharpe.toFixed(2)} yrs ${z.sim.years.toFixed(1)}`);
 console.log(`  fc: n=${z.fc.n} up=${pc(z.fc.up)} q10 ${pc(z.fc.q10)} q25 ${pc(z.fc.q25)} q50 ${pc(z.fc.q50)} q75 ${pc(z.fc.q75)} q90 ${pc(z.fc.q90)}`);
 console.log('  factors:',z.sc.factors.filter(f=>f.w).map(f=>`${f.id}:ic${f.ic.toFixed(2)},z${f.z.toFixed(1)}`).join(' '));
 console.log('  calls:',ev.calls.slice(0,8).map(c=>`${new Date(c.t).toISOString().slice(5,10)} ${c.v} ${pc(c.r)} ${c.hit===null?'-':c.hit?'✓':'✗'}`).join(' | '));
}
const price=d.c[d.c.length-1];const Z=E.entryZones(d,R.ind,price,null,null);
console.log('\nzones below:',Z.below.slice(0,5).map(z=>`${z.lo.toFixed(0)}-${z.hi.toFixed(0)} (${pc(z.dist)}) s${z.strength} [${z.items.map(i=>i.label).join(',')}]`).join('\n  '));
console.log('zones above:',Z.above.slice(0,4).map(z=>`${z.lo.toFixed(0)}-${z.hi.toFixed(0)} (${pc(z.dist)}) [${z.items.map(i=>i.label).join(',')}]`).join('\n  '));
