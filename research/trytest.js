require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2014-01-01');
const n=rows.length,d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), c=d.c, I=R.ind, P=k=>R.hz[k].sc.pct;
const st=(a)=>a.length?`n${String(a.length).padStart(4)} 勝${(a.filter(x=>x>0).length/a.length*100).toFixed(0)}% 平均${(a.reduce((s,v)=>s+v,0)/a.length*100).toFixed(1)}%`:'n0';
const split=n-730;
function eval_(name,k,cond){ const H=R.hz[k].sc.H, A=[],B=[]; for(let i=450;i+H<n;i++){ if(!cond(i))continue; const r=c[i+H]/c[i]-1; (i<split?A:B).push(r);} console.log(`${name.padEnd(34)} 前期 ${st(A)} | 直近2年 ${st(B)}`); }
for(const k of ['s','m']){
  const H=R.hz[k].sc.H; console.log(`\n=== ${k} (${H}日)`);
  const p=P(k), ok=x=>x===x, other=k==='s'?'m':'s';
  eval_('全日',k,i=>ok(p[i]));
  eval_('打診買い(60-75)',k,i=>p[i]>=60&&p[i]<75);
  eval_('買い好機(75+)',k,i=>p[i]>=75);
  eval_('打診 & 他軸≥40',k,i=>p[i]>=60&&p[i]<75&&P(other)[i]>=40);
  eval_('打診 & 他軸<40',k,i=>p[i]>=60&&p[i]<75&&P(other)[i]<40);
  eval_('打診 & 長期≥40',k,i=>p[i]>=60&&p[i]<75&&P('l')[i]>=40);
  eval_('打診 & 3軸平均≥55',k,i=>p[i]>=60&&p[i]<75&&(P('s')[i]+P('m')[i]+P('l')[i])/3>=55);
  eval_('打診 & 3軸平均<55',k,i=>p[i]>=60&&p[i]<75&&(P('s')[i]+P('m')[i]+P('l')[i])/3<55);
  eval_('打診 & 200日線より上',k,i=>p[i]>=60&&p[i]<75&&c[i]>I.s200[i]);
  eval_('打診 & 200日線より下',k,i=>p[i]>=60&&p[i]<75&&c[i]<=I.s200[i]);
  eval_('打診 & スコア上昇中(5日前より+10)',k,i=>p[i]>=60&&p[i]<75&&p[i]-p[i-5]>=10);
  eval_('打診 & スコア低下中',k,i=>p[i]>=60&&p[i]<75&&p[i]-p[i-5]<0);
  eval_('3軸平均≥55(単独)',k,i=>(P('s')[i]+P('m')[i]+P('l')[i])/3>=55);
}
