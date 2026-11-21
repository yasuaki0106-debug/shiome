require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>+x[4]>0);
const t=rows.map(x=>x[0]), c=rows.map(x=>+x[4]), lo=rows.map(x=>+x[3]), n=rows.length;
const ix=d=>t.findIndex(x=>x>=d);
const H=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix);
const ret=c.map((x,i)=>i?Math.log(x/c[i-1]):0);
const vol=i=>{const w=ret.slice(i-29,i+1),m=w.reduce((a,b)=>a+b,0)/30;return Math.sqrt(w.reduce((a,b)=>a+(b-m)**2,0)/30);};
const pc=x=>(x>0?'+':'')+(x*100).toFixed(1)+'%';
// engine mid-horizon signal on full history (for "wait for signal" variant)
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), pm=R.hz.m.sc.pct, ps=R.hz.s.sc.pct;
function phase(k){ const a=H[k]+750, b=Math.min(n-1,H[k]+1000); return [a,b]; }
function sim(name,a,b,fn){ const r=fn(a,b); return r; }
const res={};
for(const k of [0,1,2,3]){ const [a,b]=phase(k); if(a>=n)continue;
  let minI=a; for(let i=a;i<=b;i++) if(lo[i]<lo[minI]) minI=i;
  const LOW=lo[minI], end=Math.min(n-1,b+365);
  const out={};
  // 1) 毎週同額（DCA）
  { const buys=[]; for(let i=a;i<=b;i+=7) buys.push(c[i]); out['毎週同額']=buys; }
  // 2) 1日の指値（今の方式に近い）：毎日、当日の値幅の下限（-1σ日次）に指値。週1回分を、その週に届いたら約定、届かなければ週末終値
  { const buys=[]; for(let w=a;w<=b;w+=7){ let got=null; for(let i=w;i<Math.min(w+7,b+1);i++){ const L=c[i-1]*Math.exp(-vol(i-1)); if(lo[i]<=L){got=L;break;} } buys.push(got??c[Math.min(w+6,b)]); } out['毎日その日の下限に指値']=buys; }
  // 3) 数週間の指値の段：毎週、30日先の下側（25%点・10%点）に半分ずつ指値。30日以内に届けば約定、届かなければ30日後の終値で買う
  { const buys=[]; for(let w=a;w<=b;w+=7){ const s=vol(w)*Math.sqrt(30); for(const z of [0.674,1.282]){ const L=c[w]*Math.exp(-z*s); let got=null; for(let i=w+1;i<=Math.min(w+30,n-1);i++){ if(lo[i]<=L){got=L;break;} } buys.push(got??c[Math.min(w+30,n-1)]); } } out['30日先の下側に段の指値']=buys; }
  // 4) 中期が打診買い以上の日だけ買う（今の「買う」に近い）
  { const buys=[]; for(let w=a;w<=b;w+=7){ let got=null; for(let i=w;i<=Math.min(w+60,n-1);i++){ if(pm[i]>=60){got=c[i];break;} } buys.push(got??c[Math.min(w+60,n-1)]); } out['中期の買い判定を待つ']=buys; }
  const avg=a=>a.length/a.reduce((s,v)=>s+1/v,0);   // 同額ずつ買った場合の平均取得単価
  console.log(`\n## ${t[H[k]].slice(0,4)}年の半減期 → 底値圏 ${t[a]}〜${t[b]}  期間中の最安 ${t[minI]} $${Math.round(LOW)}  1年後 $${Math.round(c[end])}`);
  for(const [nm,b2] of Object.entries(out)){ const av=avg(b2); console.log(`  ${nm.padEnd(18)} 平均単価 $${Math.round(av)}（最安比 ${pc(av/LOW-1)}、毎週同額比 ${pc(av/avg(out['毎週同額'])-1)}）`); }
}
