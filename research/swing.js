require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2014-01-01');
const n=rows.length,d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), c=d.c, med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}, pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
// zigzag 30%
const piv=[]; let dir=0, ext=0;
for(let i=1;i<n;i++){ if(dir>=0){ if(c[i]>c[ext]) ext=i; else if(c[i]<c[ext]*0.7){piv.push(['H',ext]);dir=-1;ext=i;} }
  if(dir<0){ if(c[i]<c[ext]) ext=i; else if(c[i]>c[ext]*1.3){piv.push(['L',ext]);dir=1;ext=i;} } }
const ups=[]; for(let k=0;k+1<piv.length;k++) if(piv[k][0]==='L'&&piv[k+1][0]==='H'&&piv[k][1]>450) ups.push([piv[k][1],piv[k+1][1]]);
console.log('上昇波(30%以上)',ups.length,'回');
for(const k of ['s','m','l']){
  const p=R.hz[k].sc.pct; const ent=[],ex=[],cap=[],miss=[];
  for(const [a,b] of ups){ const tot=Math.log(c[b]/c[a]); let e=-1;
    for(let i=a-20;i<=b;i++) if(p[i]>=60&&(e<0)){ if(i<a){ /* already on before bottom */ } e=i; }
    // first time on at/after bottom-20, treat state at bottom
    let pos=0,bought=null,gain=0; for(let i=a;i<=b;i++){ if(p[i]>=60)pos=1; else if(p[i]<40)pos=0; if(pos&&bought===null)bought=i; if(i<b)gain+=pos*Math.log(c[i+1]/c[i]); }
    if(bought===null){miss.push(1);cap.push(0);continue;}
    ent.push(Math.log(c[bought]/c[a])/tot); cap.push(gain/tot);
  }
  console.log(`${k}: 初めて買いが点いた位置 中央 上昇幅の${pc(med(ent))}地点 / 取れた割合 中央${pc(med(cap))} / 一度も点かず ${miss.length}回`);
}
// bottom-signal candidates
const ind=R.ind, r14=ind.r14, F=R.hz.m.sc.factors; 
const base={7:[],30:[],90:[]}; for(let i=400;i<n-90;i++)for(const H of [7,30,90])base[H].push(c[i+H]/c[i]-1);
const hi90=E.rollExt(d.h,90,true), v20=E.sma(d.v,20);
function test(name,cond){ const out={7:[],30:[],90:[]}, dd=[], near=[]; let last=-99, cnt=0;
  for(let i=400;i<n-90;i++){ if(!cond(i))continue; if(i-last<10){last=i;continue;} last=i; cnt++;
    for(const H of [7,30,90])out[H].push(c[i+H]/c[i]-1);
    let mn=Infinity; for(let j=i;j<=i+30;j++)mn=Math.min(mn,d.l[j]); dd.push(mn/c[i]-1);
    // distance to nearest zigzag low within 30 days
    const L=piv.filter(q=>q[0]==='L'&&Math.abs(q[1]-i)<=30); near.push(L.length?1:0);
  }
  const w=a=>(a.filter(x=>x>0).length/a.length*100).toFixed(0)+'%';
  console.log(`\n[${name}] ${cnt}回 | 30日後 勝率${w(out[30])} 中央${pc(med(out[30]))} | 90日後 勝率${w(out[90])} 中央${pc(med(out[90]))} | その後30日の追加下落 中央${pc(med(dd))} 最悪${pc(Math.min(...dd))} | 大底±30日以内 ${(near.filter(x=>x).length/near.length*100).toFixed(0)}%`);
}
console.log(`\n[いつ買っても] 30日後 勝率${(base[30].filter(x=>x>0).length/base[30].length*100).toFixed(0)}% 中央${pc(med(base[30]))} | 90日後 勝率${(base[90].filter(x=>x>0).length/base[90].length*100).toFixed(0)}% 中央${pc(med(base[90]))}`);
test('RSI30割れ', i=>r14[i]<30);
test('90日高値から-30%以上', i=>c[i]/hi90[i]-1<=-0.30);
test('投げ売り(下落日に出来高2.5倍)', i=>c[i]<c[i-1]*0.95&&d.v[i]>2.5*v20[i-1]);
test('底の複合: 90日高値-25%以上 & RSI<35 & 投げ売り出来高', i=>{ if(!(c[i]/hi90[i]-1<=-0.25&&r14[i]<35))return false; for(let j=i-5;j<=i;j++) if(d.v[j]>2*v20[j-1]&&c[j]<c[j-1])return true; return false;});
test('底の複合+反転確認(前日比プラス&安値更新止まる)', i=>{ if(!(c[i]/hi90[i]-1<=-0.25&&r14[i-1]<35&&c[i]>c[i-1]&&d.l[i]>d.l[i-1]))return false; for(let j=i-7;j<=i;j++) if(d.v[j]>2*v20[j-1]&&c[j]<c[j-1])return true; return false;});
