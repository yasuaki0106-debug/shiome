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

function report(name,f,g0,g1){
  console.log('\n■',name);
  for(let k=0;k<4;k++){ const a=HVi[k]+g0, b=Math.min(n-1,HVi[k]+g1); if(a>=n)continue;
    // cycle closing low within bear window
    let L=a-200; for(let i=a-200;i<=b;i++) if(c[i]<c[L]) L=i;
    const eps=[]; let last=-99; for(let i=a;i<=b;i++){ if(f(i)){ if(i-last>30) eps.push(i); last=i; } }
    const four=eps.slice(0,4); if(!four.length){ console.log(`  ${T[HVi[k]].slice(0,4)}年サイクル: 買い判定なし（終値の底 ${T[L]} $${Math.round(c[L])}）`); continue; }
    const avg=four.length/four.reduce((s,i)=>s+1/c[i],0), first=four[0];
    let mn=Infinity,mi=first; for(let j=first;j<=Math.min(n-1,first+365);j++) if(c[j]<mn){mn=c[j];mi=j;}
    const ddAvg=(()=>{ let m=Infinity; for(let j=four[four.length-1];j<=Math.min(n-1,four[four.length-1]+365);j++) m=Math.min(m,c[j]); return m/avg-1; })();
    console.log(`  ${T[HVi[k]].slice(0,4)}年サイクル: 終値の底 ${T[L]} $${Math.round(c[L])} | 買い ${four.map(i=>T[i].slice(2)+' $'+Math.round(c[i])).join(', ')} | 初回は底の${first-L>=0?(first-L)+'日後':(L-first)+'日前'}・底値比${pc(c[first]/c[L]-1)} | 初回後の最大含み損 ${pc(mn/c[first]-1)} | 平均単価の底値比 ${pc(avg/c[L]-1)}・買い終えた後の最大含み損 ${pc(ddAvg)} | 初回から1年後 ${pc(fwd(first,365))} 2年後 ${pc(fwd(first,730))}`);
  }
}
report('時期（750日目〜）のみ：入ったら毎月1回×4', i=>true,750,1100);
report('時期（750日目〜）＋中期の判定が打診買い以上', i=>P.m[i]>=60,750,1100);
report('時期（750日目〜）＋短期・中期とも打診買い以上', i=>P.m[i]>=60&&P.s[i]>=60,750,1100);
report('時期（750日目〜）＋中期が買い好機（75以上）', i=>P.m[i]>=75,750,1100);
report('時期（800日目〜）＋中期の判定が打診買い以上', i=>P.m[i]>=60,800,1100);
report('時期（750日目〜）＋中期60以上＋50日線の上', i=>P.m[i]>=60&&c[i]>s50[i],750,1100);
