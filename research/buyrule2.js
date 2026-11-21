require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, lo=d.l, hi=d.h;
const L={t:Array.from(d.t),c:Array.from(c)}, ls=E.longSeries(L);
const R=E.run(d,{pl:ls.resid,w200:ls.w200}), P={s:R.hz.s.sc.pct,m:R.hz.m.sc.pct,l:R.hz.l.sc.pct}, I=R.ind;
// features (all causal)
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>Date.parse(s+'T00:00:00Z'));
const cyDay=i=>{let h=null;for(const x of HV)if(x<=d.t[i])h=x;return h?Math.round((d.t[i]-h)/864e5):NaN;};
const valPct=new Float64Array(n).fill(NaN); { const seen=[]; for(let i=0;i<n;i++){ const r=ls.resid[i]; if(r===r){ if(seen.length>=365){ let k=0; for(const s of seen) if(s<r)k++; valPct[i]=k/seen.length; } seen.push(r);} } }
const ath=new Float64Array(n); { let m=0; for(let i=0;i<n;i++){ m=Math.max(m,hi[i]); ath[i]=m; } }
const dd=i=>c[i]/ath[i]-1;
const s20=I.s20,s50=I.s50,s200=I.s200,rsi=I.r14;
const low90=E.rollExt(lo,90,false), low365=E.rollExt(lo,365,false);
const reb=i=>c[i]/low90[i]-1;                      // 90日安値からの戻り
const sinceLow=i=>{ for(let k=0;k<=90;k++) if(lo[i-k]<=low90[i]*1.0001) return k; return 91; };
const slope50=i=>s50[i]/s50[i-10]-1;
// labels
const fwd=(i,H)=>i+H<n?c[i+H]/c[i]-1:NaN;
const mae=(i,H)=>{ let m=Infinity; for(let j=i+1;j<=Math.min(n-1,i+H);j++) m=Math.min(m,lo[j]); return i+H<n?m/c[i]-1:NaN; };

const pcy=cyDay;
const mk=(ddTh,need)=>i=>dd(i)<=ddTh&&need(i);
const RULES={
 'dd-40':i=>dd(i)<=-0.4, 'dd-50':i=>dd(i)<=-0.5, 'dd-60':i=>dd(i)<=-0.6,
 'dd-40＋中期60':mk(-0.4,i=>P.m[i]>=60), 'dd-50＋中期60':mk(-0.5,i=>P.m[i]>=60), 'dd-60＋中期60':mk(-0.6,i=>P.m[i]>=60),
 'dd-50＋中期75':mk(-0.5,i=>P.m[i]>=75), 'dd-50＋短期60':mk(-0.5,i=>P.s[i]>=60), 'dd-50＋短期中期60':mk(-0.5,i=>P.s[i]>=60&&P.m[i]>=60),
 'dd-50＋長期75':mk(-0.5,i=>P.l[i]>=75), 'dd-50＋長期75＋中期60':mk(-0.5,i=>P.l[i]>=75&&P.m[i]>=60),
 'dd-50＋50日線上':mk(-0.5,i=>c[i]>s50[i]), 'dd-50＋20日線が50日線の上':mk(-0.5,i=>s20[i]>s50[i]),
 '(dd-50 or 割安35)＋中期60':i=>(dd(i)<=-0.5||valPct[i]<=0.35)&&P.m[i]>=60,
 '(dd-45 or 割安35)＋中期60':i=>(dd(i)<=-0.45||valPct[i]<=0.35)&&P.m[i]>=60,
 '(dd-50 or 割安35)＋中期60＋時期600日以降':i=>(dd(i)<=-0.5||valPct[i]<=0.35)&&P.m[i]>=60&&pcy(i)>=600,
};
const med=a=>{const s=a.filter(x=>x===x).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN}, q=(a,p)=>{const s=a.filter(x=>x===x).sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)*p)]:NaN};
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const start=T.findIndex(x=>x>='2014-06-01');
// cycle lows (bear market lows) for lag measurement
const lows=[['2015-01-14','2014-06-01','2016-07-08'],['2018-12-15','2018-01-01','2020-05-10'],['2022-11-21','2021-11-10','2024-04-19']].map(([d0,a,b])=>({i:T.findIndex(x=>x>=d0),a,b}));
console.log('ルール | 日数 買い場 | 180日含み損 中央/悪10% | 1年後 中央 勝率 | 各底での初回の買い[底からの日数, 底値比] | 4回分割で買った平均単価の底値比');
for(const [nm,f] of Object.entries(RULES)){
  const idx=[]; for(let i=Math.max(start,400);i<n;i++) if(f(i)) idx.push(i);
  const eps=[]; let last=-99; idx.forEach(i=>{ if(i-last>30) eps.push(i); last=i; });
  const M=idx.map(i=>mae(i,180)), F=idx.map(i=>fwd(i,365));
  const lag=lows.map(L=>{ // first episode start within the bear window (from ATH -x to next halving)
     const e=eps.filter(i=>T[i]>=L.a&&T[i]<=L.b); if(!e.length) return '[なし]';
     const first=e[0]; const four=e.slice(0,4); const avg=four.length/four.reduce((s,i)=>s+1/c[i],0);
     return `[${first-L.i}日, ${pc(c[first]/lo[L.i]-1)} | 4回平均 ${pc(avg/lo[L.i]-1)} n${four.length}]`; }).join(' ');
  console.log(`${nm.padEnd(26)} ${String(idx.length).padStart(4)} ${String(eps.length).padStart(2)}回 | ${pc(med(M))} / ${pc(q(M,0.1))} | ${pc(med(F))} ${(F.filter(x=>x>0).length/Math.max(1,F.filter(x=>x===x).length)*100).toFixed(0)}% | ${lag}`);
}
// current status
const Z=n-1; console.log('\n現在',T[Z],'dd',pc(dd(Z)),'valPct',valPct[Z].toFixed(2),'短期',P.s[Z].toFixed(0),'中期',P.m[Z].toFixed(0),'長期',P.l[Z].toFixed(0),'cyDay',cyDay(Z));
