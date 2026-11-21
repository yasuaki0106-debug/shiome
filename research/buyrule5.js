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


function plan(name,g0,g1,first,keep,gap,maxN){
  console.log('\n■',name); const rows=[];
  for(let k=0;k<4;k++){ const a=HVi[k]+g0, b=Math.min(n-1,HVi[k]+g1); if(a>=n)continue;
    let L=a-200; for(let i=a-200;i<=b;i++) if(c[i]<c[L]) L=i;
    const buys=[]; let last=-1e9;
    for(let i=a;i<=b&&buys.length<maxN;i++){ const okk = buys.length===0 ? first(i) : (keep(i)&&i-last>=gap); if(okk){ buys.push(i); last=i; } }
    if(!buys.length){ console.log(`  ${T[HVi[k]].slice(0,4)}年: 買い判定なし`); continue; }
    const avg=buys.length/buys.reduce((s,i)=>s+1/c[i],0), f0=buys[0], end=buys[buys.length-1];
    let mn=Infinity; for(let j=f0;j<=Math.min(n-1,f0+365);j++) mn=Math.min(mn,c[j]);
    // running portfolio drawdown: value/cost invested so far
    let worst=0; for(let j=f0;j<=Math.min(n-1,f0+365);j++){ const done=buys.filter(x=>x<=j); const u=done.reduce((s,x)=>s+1/c[x],0); worst=Math.min(worst,u*c[j]/done.length-1); }
    const top=k<3?Math.max(...Array.from(c.slice(HVi[k+1],HVi[k+1]+700))):NaN;
    console.log(`  ${T[HVi[k]].slice(0,4)}年: 底 ${T[L].slice(2)} $${Math.round(c[L])} | 買い ${buys.map(i=>T[i].slice(2)+' $'+Math.round(c[i])).join(', ')} | 平均単価 $${Math.round(avg)}（底値比${pc(avg/c[L]-1)}） | 持ち高全体の最大含み損 ${pc(worst)} | 次の天井まで ${top===top?pc(top/avg-1):'—'}`);
  }
}
const M=P.m;
plan('A: 中期75以上で初回、その後は30日ごとに中期60以上なら買い足し（最大4回）',750,1460,i=>M[i]>=75,i=>M[i]>=60,30,4);
plan('B: 中期75以上が出るたび（30日以上あけて）に買う（最大4回）',750,1460,i=>M[i]>=75,i=>M[i]>=75,30,4);
plan('C: 中期60以上が出るたび（30日以上あけて）に買う（最大4回）',750,1460,i=>M[i]>=60,i=>M[i]>=60,30,4);
plan('D: 時期に入ったら30日ごとに4回（判定を見ない）',750,1460,i=>true,i=>true,30,4);
plan('E: 中期75以上で初回、その後は14日ごとに中期60以上なら買い足し（最大4回）',750,1460,i=>M[i]>=75,i=>M[i]>=60,14,4);
