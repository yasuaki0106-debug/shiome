require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2011-09-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]), c=rows.map(x=>+x[4]), t=rows.map(x=>Date.parse(x[0]+'T00:00:00Z'));
const ls=E.longSeries({t,c}), w=E.sma(Float64Array.from(c),1400);
const ix=s=>T.findIndex(x=>x>=s), pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
const cyc=[['2012-11-28','2013-12-04','2015-01-14'],['2016-07-09','2017-12-16','2018-12-15'],['2020-05-11','2021-11-08','2022-11-21'],['2024-04-20','2025-10-06',null]];
console.log('サイクル | 天井→底 日数 | 下落率 | 底の200週線比 | 底のべき乗則残差 | 天井から946日相当で底を過ぎていたか');
for(const [h,top,low] of cyc){ const hi=ix(h), ti=ix(top); const li=low?ix(low):null;
  if(li==null){ const n1=n-1; console.log(`${h.slice(0,4)} | 天井から${n1-ti}日 | 今 ${pc(c[n1]/c[ti]-1)} | 200週線比 ${pc(c[n1]/w[n1]-1)} | 残差 ${ls.resid[n1].toFixed(2)} | 半減期から${n1-hi}日`); continue; }
  console.log(`${h.slice(0,4)} | ${li-ti}日 | ${pc(c[li]/c[ti]-1)} | ${w[li]?pc(c[li]/w[li]-1):'—'} | ${ls.resid[li].toFixed(2)} | 底は半減期から${li-hi}日目`);
}
// fitted power-law at today and +90d using full-history fit (same as engine's expanding fit at last point)
const GEN=Date.UTC(2009,0,3); let sx=0,sy=0,sxx=0,sxy=0,m=0; for(let i=0;i<n;i++){const X=Math.log((t[i]-GEN)/864e5),Y=Math.log(c[i]);sx+=X;sy+=Y;sxx+=X*X;sxy+=X*Y;m++;}
const b=(m*sxy-sx*sy)/(m*sxx-sx*sx), a=(sy-b*sx)/m, fair=tt=>Math.exp(a+b*Math.log((tt-GEN)/864e5));
const now=t[n-1];
console.log('\nべき乗則の中心値 今',Math.round(fair(now)),' 90日後',Math.round(fair(now+90*864e5)));
for(const r of [-0.6,-0.8,-1.0,-1.2]) console.log(`  残差${r} の価格: 今 $${Math.round(fair(now)*Math.exp(r))} / 60日後 $${Math.round(fair(now+60*864e5)*Math.exp(r))}`);
console.log('200週線 今', Math.round(w[n-1]), ' 1年高値', Math.max(...c.slice(n-400)));
