require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const ls=E.longSeries({t:Array.from(d.t),c:Array.from(d.c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct, I=R.ind;
const ix=s=>T.findIndex(x=>x>=s), c=d.c, s50=I.s50, s200=I.s200;
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix);
const BUYS=[['2015-01-26','2015-02-13','2015-02-27','2015-03-13'],['2019-04-02','2019-04-16','2019-05-03','2019-05-17'],['2023-01-12','2023-01-26','2023-02-15','2023-03-13'],['2026-08-19']].map(a=>a.map(ix));
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols, mstr=new Map(S.MSTR);
// exit at cycle top: from next halving+400, sell when close<200d MA for 14 days; at latest halving+550
function exitIdx(k){ const nh=k<3?HV[k+1]:null; if(nh==null) return n-1; for(let i=nh+400;i<Math.min(n,nh+551);i++){ let b=0; for(let j=i-13;j<=i;j++) if(c[j]<s200[j]) b++; if(b===14) return i; } return Math.min(n-1,nh+550); }
const pc=x=>(x>0?'+':'')+(x*100).toFixed(0)+'%';
function sim(k,rule,asset){ // asset: 'btc' or 'mstr'
  const px=i=>asset==='btc'?c[i]:mstr.get(T[i]); const buys=BUYS[k], end=exitIdx(k);
  if(asset==='mstr' && !px(buys[0])) return null;
  let units=0, invested=0, val=0, lev=true, peak=0, mdd=0, sw=0, last=null, pkV=0, offAt=null;
  const st={peakSinceOn:0};
  for(let i=buys[0];i<=end;i++){ const p=px(i); if(!p) continue;
    if(last!=null){ const r=p/last-1, L=lev?2:(rule==='P6'?0:1); val*=Math.max(0,1+L*r-(lev?0.0105+0.05:0)/252); }
    if(buys.includes(i)){ val+=1; invested+=1; }
    // rule
    const was=lev;
    if(rule==='P1'){ if(lev&&M[i]<40) lev=false; else if(!lev&&M[i]>=75) lev=true; }
    if(rule==='P2'){ if(lev&&M[i]<40) lev=false; else if(!lev&&M[i]>=60) lev=true; }
    if(rule==='P3'){ if(lev){ st.peakSinceOn=Math.max(st.peakSinceOn,val/invested); if(val/invested<st.peakSinceOn*0.65){lev=false;} } else if(M[i]>=75){ lev=true; st.peakSinceOn=val/invested; } }
    if(rule==='P4'){ let b=0; for(let j=i-6;j<=i;j++) if(c[j]<s50[j]) b++; if(lev&&b===7) lev=false; else if(!lev&&c[i]>s50[i]&&M[i]>=60) lev=true; }
    if(rule==='P6'){ if(lev&&M[i]<20) lev=false; else if(!lev&&M[i]>=75) lev=true; }
    if(rule==='P5'){ if(lev&&M[i]<20) lev=false; else if(!lev&&M[i]>=75) lev=true; }
    if(was!==lev) sw++;
    last=p; const v=val/invested; pkV=Math.max(pkV,v); mdd=Math.min(mdd,v/pkV-1);
  }
  return {mult:val/invested, mdd, sw, end:T[end]};
}
const names={P0:'守りなし（天井まで2倍で持つ）',P6:'中期20未満で全部売って現金、75以上で2倍を買い直す',P1:'中期40未満で1倍に、75以上で2倍に戻す',P2:'中期40未満で1倍に、60以上で2倍に戻す',P5:'中期20未満で1倍に、75以上で2倍に戻す',P3:'2倍の評価額が高値から-35%で1倍に、75以上で戻す',P4:'50日線を7日割れで1倍に、上抜け＋中期60で戻す'};
for(const asset of ['btc','mstr']){
  console.log(`\n=== ${asset==='btc'?'BTCの2倍':'MSTRの2倍'}（買いルールの日に同額ずつ、次の天井の出口ルールで売る。今回は11/20まで） ===`);
  for(const [r,nm] of Object.entries(names)){
    const cells=[0,1,2,3].map(k=>{ const x=sim(k,r==='P0'?'none':r,asset); return x?`${x.mult.toFixed(1)}倍 最大下落${pc(x.mdd)} 切替${x.sw}`:'—'; });
    console.log(`${nm.padEnd(30)} | 2015: ${cells[0]} | 2019: ${cells[1]} | 2023: ${cells[2]} | 今回: ${cells[3]}`);
  }
}
