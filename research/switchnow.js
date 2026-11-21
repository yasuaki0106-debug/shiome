require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const ls=E.longSeries({t:Array.from(d.t),c:Array.from(d.c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct;
const ix=s=>T.findIndex(x=>x>=s), HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix);
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%', med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
function test(name){
  const ds = name==='BTC'?T:S[name].map(x=>x[0]), px = name==='BTC'?Array.from(d.c):S[name].map(x=>x[1]);
  const bi = new Map(T.map((x,i)=>[x,i]));
  const out=[]; let last=-99;
  for(let a=1;a<ds.length-1;a++){
    const i=bi.get(ds[a]); if(i==null) continue;
    const k=[0,1,2].find(k=>i>=HV[k]+600&&i<=HV[k+1]+300); if(k==null) continue;   // 下落期〜底値圏
    if(!(M[i]<20) || a-last<10) continue; last=a;
    // hold from a until mid>=75 (BTC day) or 250 trading days
    let b=a+1; while(b<ds.length-1 && b-a<250){ const j=bi.get(ds[b]); if(j!=null&&M[j]>=75) break; b++; }
    let v2=1; for(let z=a+1;z<=b;z++){ const r=px[z]/px[z-1]-1; v2*=Math.max(0,1+2*r-(0.0105+0.05)/252); }
    const v1=px[b]/px[a];
    out.push({d:ds[a],days:b-a,v1,v2});
  }
  const better=out.filter(x=>x.v1>x.v2).length;
  console.log(`\n## ${name}（中期20未満の日に、2倍のまま持つか1倍にするか。判定が75に戻るまで比べる）: ${out.length}回`);
  console.log(`  1倍の方が良かった ${better}回（${(better/out.length*100).toFixed(0)}%）| 1倍 中央${pc(med(out.map(x=>x.v1-1)))} / 2倍 中央${pc(med(out.map(x=>x.v2-1)))} | 2倍が1倍の半分以下になった回 ${out.filter(x=>x.v2<x.v1*0.5).length}`);
  console.log('  ', out.map(x=>`${x.d.slice(2)}:${x.days}日 1倍${pc(x.v1-1)} 2倍${pc(x.v2-1)}`).join(' | '));
}
test('BTC'); test('MSTR'); test('COIN');
