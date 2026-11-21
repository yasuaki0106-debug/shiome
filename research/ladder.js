require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2014-01-01');
const n=rows.length,d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), r14=R.ind.r14, pm=R.hz.m.sc.pct, idx=new Map(); rows.forEach((x,i)=>idx.set(x[0],i));
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%', med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}, mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function run(name, dates, px, lo, step, btcIdx){
  const m=px.length, eps=[];
  for(let i=1;i<m-60;i++){
    const b=btcIdx(i); if(b==null||!(r14[b-1]<30)) continue;      // 前日確定のBTCでRSI30割れ
    if(eps.length&&i<eps[eps.length-1].end) continue;
    const e0=px[i]; let fills=[e0], k=1, sigAt=null, end=Math.min(m-1,i+60);
    for(let j=i+1;j<=end&&fills.length<4;j++){
      while(k<3&&fills.length<3&&lo[j]<=e0*(1-step*k)){fills.push(e0*(1-step*k));k++;}
      const bj=btcIdx(j); if(bj!=null&&pm[bj-1]>=60){ sigAt=j; while(fills.length<4)fills.push(px[j]); break;}
    }
    if(fills.length<4){ while(fills.length<4)fills.push(px[end]); }
    const cost=fills.reduce((s,v)=>s+v,0)/4;
    let mn=Infinity; for(let j=i;j<=Math.min(m-1,i+60);j++)mn=Math.min(mn,lo[j]);
    const r60=px[Math.min(m-1,i+60)]/cost-1;
    eps.push({d:dates[i],end:end,cost,e0,sig:sigAt!=null?px[sigAt]:null,dd:mn/cost-1,r60});
  }
  const withSig=eps.filter(e=>e.sig);
  console.log(`\n### ${name}: 発動 ${eps.length}回`);
  console.log(`  平均取得単価は最初の買値比 中央${pc(med(eps.map(e=>e.cost/e.e0-1)))} | 60日後の損益 中央${pc(med(eps.map(e=>e.r60)))} 勝率${(eps.filter(e=>e.r60>0).length/eps.length*100).toFixed(0)}% | 途中の最大含み損 中央${pc(med(eps.map(e=>e.dd)))} 最悪${pc(Math.min(...eps.map(e=>e.dd)))}`);
  if(withSig.length) console.log(`  買い判定が後で点いた ${withSig.length}回: 判定時の株価より取得単価が 中央${pc(med(withSig.map(e=>e.cost/e.sig-1)))} 安い/高い（マイナス=安く仕込めた）`);
  console.log('  ', eps.slice(-6).map(e=>`${e.d}: 60日後${pc(e.r60)} 最大含み損${pc(e.dd)}`).join(' | '));
}
// BTC
run('BTC', rows.map(x=>x[0]), Array.from(d.c), Array.from(d.l), 0.08, i=>i);
for(const sym of ['MSTR','COIN']){
  const v=S[sym].filter(x=>idx.has(x[0])); run(sym, v.map(x=>x[0]), v.map(x=>x[1]), v.map(x=>x[1]), 0.12, i=>idx.get(v[i][0]));
}
