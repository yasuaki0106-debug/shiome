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
const RULES={
 'A 今の方式（長期スコア75以上）': i=>P.l[i]>=75,
 'B 割安のみ（長期成長線の下位25%）': i=>valPct[i]<=0.25,
 'C 割安＋50日線の上': i=>valPct[i]<=0.25&&c[i]>s50[i],
 'D 割安＋50日線が上向き': i=>valPct[i]<=0.25&&c[i]>s50[i]&&slope50(i)>0,
 'E 割安＋中期スコア60以上': i=>valPct[i]<=0.25&&P.m[i]>=60,
 'F 割安＋短期・中期とも60以上': i=>valPct[i]<=0.25&&P.m[i]>=60&&P.s[i]>=60,
 'G 割安＋安値から15%戻し＋安値から10日以上': i=>valPct[i]<=0.25&&reb(i)>=0.15&&sinceLow(i)>=10,
 'H 割安＋安値から25%戻し': i=>valPct[i]<=0.25&&reb(i)>=0.25,
 'I 底値圏の時期（750-1000日）のみ': i=>cyDay(i)>=750&&cyDay(i)<=1000,
 'J 時期＋割安': i=>cyDay(i)>=750&&cyDay(i)<=1000&&valPct[i]<=0.25,
 'K 時期＋割安＋中期60以上': i=>cyDay(i)>=750&&cyDay(i)<=1000&&valPct[i]<=0.25&&P.m[i]>=60,
 'L 高値から-50%以上＋中期60以上': i=>dd(i)<=-0.5&&P.m[i]>=60,
 'M 高値から-50%以上＋50日線の上＋上向き': i=>dd(i)<=-0.5&&c[i]>s50[i]&&slope50(i)>0,
 'N 割安(下位35%)＋中期60以上': i=>valPct[i]<=0.35&&P.m[i]>=60,
 'O 割安＋200日線の上': i=>valPct[i]<=0.25&&c[i]>s200[i],
 'Z いつ買っても': i=>true,
};
const med=a=>{const s=a.filter(x=>x===x).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN}, q=(a,p)=>{const s=a.filter(x=>x===x).sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)*p)]:NaN};
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const start=T.findIndex(x=>x>='2014-06-01');
const eras=[['2014-06-01','2016-07-08'],['2016-07-09','2020-05-10'],['2020-05-11','2024-04-19'],['2024-04-20','2026-12-31']];
console.log('ルール | 該当日数 | 買い場の回数 | 180日以内の最大含み損(中央/悪い方10%) | 1年後(中央) 1年後勝率 | 時代ごとの[日数 含み損中央 1年後中央]');
for(const [nm,f] of Object.entries(RULES)){
  const idx=[]; for(let i=Math.max(start,400);i<n;i++) if(f(i)) idx.push(i);
  let ep=0,last=-99; idx.forEach(i=>{ if(i-last>30) ep++; last=i; });
  const M=idx.map(i=>mae(i,180)), F=idx.map(i=>fwd(i,365));
  const per=eras.map(([a,b])=>{ const k=idx.filter(i=>T[i]>=a&&T[i]<=b); return `[${k.length} ${pc(med(k.map(i=>mae(i,180))))} ${pc(med(k.map(i=>fwd(i,365))))}]`; }).join(' ');
  console.log(`${nm.padEnd(30)} ${String(idx.length).padStart(5)} ${String(ep).padStart(3)}回 | ${pc(med(M))} / ${pc(q(M,0.1))} | ${pc(med(F))} ${(F.filter(x=>x>0).length/F.filter(x=>x===x).length*100).toFixed(0)}% | ${per}`);
}
