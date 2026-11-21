require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01');
const n=rows.length, t=rows.map(x=>Date.parse(x[0]+'T00:00:00Z')), c=rows.map(x=>+x[4]), DAY=864e5;
const halv=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(s=>Date.parse(s+'T00:00:00Z')), gen=Date.parse('2009-01-03T00:00:00Z');
// features
const phase=t.map(x=>{let h=halv.filter(y=>y<=x).pop(); return h?(x-h)/DAY:NaN;});
// expanding power-law fit: ln p = a + b ln(days since genesis); residual
const resid=new Array(n).fill(NaN); let sx=0,sy=0,sxx=0,sxy=0,m=0;
for(let i=0;i<n;i++){ const X=Math.log((t[i]-gen)/DAY), Y=Math.log(c[i]); if(m>730){const b=(m*sxy-sx*sy)/(m*sxx-sx*sx), a=(sy-b*sx)/m; resid[i]=Y-(a+b*X);} sx+=X;sy+=Y;sxx+=X*X;sxy+=X*Y;m++; }
// weekly RSI(14) approx: RSI on every-7th close
const wk=[]; for(let i=n-1;i>=0;i-=7)wk.unshift(i); const wr=E.rsi(Float64Array.from(wk.map(i=>c[i])),14); const wrsi=new Array(n).fill(NaN); wk.forEach((i,k)=>{for(let j=i;j<Math.min(n,i+7);j++)wrsi[j]=wr[k];});
const s200w=E.sma(Float64Array.from(c),1400); const ma200w=c.map((x,i)=>s200w[i]?Math.log(x/s200w[i]):NaN);
function corr(x,y){const p=[];for(let i=0;i<x.length;i++)if(x[i]===x[i]&&y[i]===y[i])p.push([x[i],y[i]]);const k=p.length,mx=p.reduce((s,v)=>s+v[0],0)/k,my=p.reduce((s,v)=>s+v[1],0)/k;let a=0,b=0,cc=0;p.forEach(v=>{a+=(v[0]-mx)*(v[1]-my);b+=(v[0]-mx)**2;cc+=(v[1]-my)**2});return [a/Math.sqrt(b*cc),k];}
const start=rows.findIndex(x=>x[0]>='2015-01-01'), mid=rows.findIndex(x=>x[0]>='2021-01-01');
for(const H of [30,90]){ const y=c.map((x,i)=>i+H<n?Math.log(c[i+H]/x):NaN);
  console.log(`\n== ${H}日後リターンとの相関（前半2015-2020 / 後半2021-）`);
  for(const [nm,f] of [['レインボー(べき乗則からの乖離)',resid],['週足RSI',wrsi],['200週線からの乖離',ma200w]]){
    const A=corr(f.slice(start,mid),y.slice(start,mid)),B=corr(f.slice(mid),y.slice(mid)); console.log(`  ${nm}: ${A[0].toFixed(2)} / ${B[0].toFixed(2)}`);}
}
// halving phase buckets by cycle
console.log('\n== 半減期からの経過日数ごとの90日後リターン（サイクル別・中央値）');
const med=a=>{if(!a.length)return NaN;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const bk=[[0,180],[180,365],[365,545],[545,730],[730,910],[910,1095],[1095,1280],[1280,1500]];
console.log('  経過日数      2012-     2016-     2020-     2024-');
for(const [a,b] of bk){ let line=`  ${String(a).padStart(4)}-${String(b).padEnd(4)}`; for(let k=0;k<4;k++){ const r=[]; for(let i=0;i+90<n;i++){ if(t[i]>=halv[k]&&(k==3||t[i]<halv[k+1])&&phase[i]>=a&&phase[i]<b) r.push(c[i+90]/c[i]-1);} line+=`  ${r.length?((med(r)>0?'+':'')+(med(r)*100).toFixed(0)+'%').padStart(7):'     — '}  `;} console.log(line);}
console.log('  現在の経過日数:',Math.round(phase[n-1]));
// month seasonality
console.log('\n== 月別の勝率（その月が上昇した年の割合、2014-2025）');
const mm={}; for(let y=2014;y<=2025;y++)for(let mo=1;mo<=12;mo++){const a=rows.findIndex(x=>x[0]>=`${y}-${String(mo).padStart(2,'0')}-01`), b=rows.findIndex(x=>x[0]>=(mo==12?`${y+1}-01-01`:`${y}-${String(mo+1).padStart(2,'0')}-01`)); if(a<0||b<0)continue; (mm[mo]=mm[mo]||[]).push(c[b-1]/c[a-1]-1);}
console.log('  '+Object.keys(mm).map(k=>`${k}月 ${mm[k].filter(x=>x>0).length}/${mm[k].length}`).join(' | '));
