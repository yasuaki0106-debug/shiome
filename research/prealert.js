require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const ls=E.longSeries({t:Array.from(d.t),c:Array.from(d.c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct, S7=R.hz.s.sc.pct;
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>T.findIndex(x=>x>=s));
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
for(const [nm,trig] of [['中期40以上（見送り脱出）',i=>M[i]>=40&&M[i-1]<40],['中期50以上',i=>M[i]>=50&&M[i-1]<50],['中期60以上（打診買い）',i=>M[i]>=60&&M[i-1]<60],['短期60以上',i=>S7[i]>=60&&S7[i-1]<60]]){
  const res=[]; 
  for(let k=0;k<4;k++){ const a=HV[k]+750, b=Math.min(n-1,HV[k]+1460); let firstBuy=null; for(let i=a;i<=b;i++) if(M[i]>=75){firstBuy=i;break;}
    for(let i=a;i<=(firstBuy??b);i++){ if(trig(i)){ let j=i; while(j<n&&j<=i+60&&!(M[j]>=75)) j++; res.push({k,i,lead:(j<=i+60&&j<n&&M[j]>=75)?j-i:null, chg: j<n? d.c[Math.min(j,n-1)]/d.c[i]-1:null}); } } }
  const hit=res.filter(r=>r.lead!==null), lead=hit.map(r=>r.lead).sort((a,b)=>a-b);
  console.log(`${nm}: 底値圏で ${res.length}回点灯 → 60日以内に買い好機 ${hit.length}回（${(hit.length/res.length*100).toFixed(0)}%）、その日数 中央${lead[Math.floor(lead.length/2)]}日 [${lead[0]}〜${lead[lead.length-1]}] | 値動き（点灯→買い好機）中央 ${pc(hit.map(r=>r.chg).sort((a,b)=>a-b)[Math.floor(hit.length/2)])}`);
  console.log('   ',res.map(r=>`${T[r.i].slice(2)}${r.lead!==null?'→'+r.lead+'日':'×'}`).join(' '));
}
