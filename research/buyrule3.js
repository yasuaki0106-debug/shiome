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


const med=a=>{const s=a.filter(x=>x===x).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN};
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const HVi=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>T.findIndex(x=>x>=s));
const lowsI=['2015-01-14','2018-12-15','2022-11-21'].map(s=>T.findIndex(x=>x>=s));
const conds={
 '時期のみ（入った日に買う）':i=>true,
 '中期60以上':i=>P.m[i]>=60,
 '中期75以上':i=>P.m[i]>=75,
 '短期60＋中期60':i=>P.s[i]>=60&&P.m[i]>=60,
 '長期75＋中期60':i=>P.l[i]>=75&&P.m[i]>=60,
 '長期75のみ':i=>P.l[i]>=75,
 '50日線の上＋上向き':i=>c[i]>s50[i]&&slope50(i)>0,
 '割安35＋中期60':i=>valPct[i]<=0.35&&P.m[i]>=60,
 '高値-50%＋中期60':i=>dd(i)<=-0.5&&P.m[i]>=60,
 '20日線回復（安値から10日以上）':i=>c[i]>s20[i]&&sinceLow(i)>=10,
};
for(const g0 of [700,750,800]){
 console.log(`\n===== 時期の条件：半減期から${g0}日目以降（〜1100日目）。買い場が出るたびに1回、最大4回まで買う =====`);
 console.log('条件 | 各サイクル[初回の買い:底からの日数,底値比 / 4回の平均単価の底値比 / 初回から底までの含み損 / 初回から1年後] | 平均単価の底値比の平均');
 for(const [nm,f] of Object.entries(conds)){
  const outs=[]; const avgs=[];
  for(let k=0;k<3;k++){ const a=HVi[k]+g0, b=HVi[k]+1100, L=lowsI[k];
    const eps=[]; let last=-99; for(let i=a;i<=b;i++){ if(f(i)){ if(i-last>30) eps.push(i); last=i; } }
    const four=eps.slice(0,4); if(!four.length){ outs.push('[なし]'); continue; }
    const avg=four.length/four.reduce((s,i)=>s+1/c[i],0), first=four[0];
    let mn=Infinity; for(let j=first;j<=Math.min(n-1,first+365);j++) mn=Math.min(mn,lo[j]);
    avgs.push(avg/lo[L]-1);
    outs.push(`[${first-L}日,${pc(c[first]/lo[L]-1)} / ${pc(avg/lo[L]-1)} n${four.length} / ${pc(mn/c[first]-1)} / ${pc(fwd(first,365))}]`);
  }
  // current cycle
  const a=HVi[3]+g0, eps=[]; let last=-99; for(let i=a;i<n;i++){ if(f(i)){ if(i-last>30) eps.push(i); last=i; } }
  const cur=eps.slice(0,4).map(i=>`${T[i].slice(5)} $${Math.round(c[i]/1000)}k`).join(', ');
  console.log(`${nm.padEnd(18)} ${outs.join(' ')} | ${avgs.length?pc(avgs.reduce((x,y)=>x+y,0)/avgs.length):'—'} | 今回: ${cur||'なし'}`);
 }
}
