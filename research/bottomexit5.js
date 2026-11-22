require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2012-01-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, ls=E.longSeries({t:Array.from(d.t),c:Array.from(c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct, s200=R.ind.s200;
const ix=s=>T.findIndex(x=>x>=s), I=new Map(T.map((x,i)=>[x,i]));
const HV=['2012-11-28','2016-07-09','2020-05-11','2024-04-20'].map(ix), PK=['2013-12-04','2017-12-16','2021-11-08','2025-10-06'].map(ix), LOW=['2015-01-14','2018-12-15','2022-11-21'].map(ix);
// ---- causal gauge (same as app)
const oc=JSON.parse(fs.readFileSync('onchain.json','utf8')); const ser=k=>{const a=new Array(n).fill(NaN);(oc[k]||[]).forEach(([dd,v])=>{const i=I.get(dd);if(i!=null)a[i]=+v;});return a;};
const sm=(a,w)=>{const o=new Array(n).fill(NaN);let s=0,q=0;for(let i=0;i<n;i++){const x=a[i];if(x===x){s+=x;q++;}if(i>=w){const y=a[i-w];if(y===y){s-=y;q--;}}if(i>=w-1&&q>=w*0.9)o[i]=s/q;}return o;};
const mvrv=ser('mvrv'), mr=ser('minerrev'), mr365=sm(mr,365), m200=sm(Array.from(c),200);
const wk=[];for(let i=n-1;i>=0;i-=7)wk.unshift(i);const wr=E.rsi(Float64Array.from(wk.map(i=>c[i])),14),wrsi=new Array(n).fill(NaN);wk.forEach((i,k)=>{for(let j=i;j<Math.min(n,i+7);j++)wrsi[j]=wr[k];});
let mx=0;const dd=Array.from(c).map(x=>{mx=Math.max(mx,x);return x/mx-1;}), w2=Array.from(ls.w200,x=>Math.exp(x));
const SER=[[mvrv,0.60],[mr.map((x,i)=>x/mr365[i]),0.63],[wrsi,0.59],[dd,0.56],[Array.from(c).map((x,i)=>x/m200[i]),0.45]];
function gauge(i,k){ const prev=LOW.filter(L=>L<PK[k]); if(!prev.length) return NaN; let tot=0,ws=0; for(const [a,w] of SER){ const bots=prev.map(L=>a[L]).filter(x=>x===x), now=a[i], top=a[PK[k]]; if(!bots.length||!(now===now)||!(top===top))continue; const tgt=Math.max(...bots); if(!(top>tgt))continue; tot+=Math.min(1,Math.max(0,(top-now)/(top-tgt)))*w; ws+=w;} return ws?tot/ws:NaN; }

const s20=R.ind.s20, GTH=0.50;
function exitIdx(k){ if(k>=3) return n-1; const nh=HV[k+1]; for(let i=nh+400;i<Math.min(n,nh+551);i++){ let b=0; for(let j=i-13;j<=i;j++) if(c[j]<s200[j]) b++; if(b===14) return i; } return Math.min(n-1,nh+550); }
const pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
const okG=(i,k)=>{const g=gauge(i,k);return !(g===g)||g>=GTH;};
const cross=i=>{ if(!(c[i]>s20[i]&&c[i-1]<=s20[i-1]))return false; let m=Infinity; for(let j=i-90;j<=i;j++)m=Math.min(m,c[j]); for(let j=i-20;j<=i;j++) if(c[j]<=m*1.001) return true; return false; };

const Sx=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols;
function assetSeries(name){ if(name==='BTC') return {ds:T,px:Array.from(c)}; const v=Sx[name]; return {ds:v.map(x=>x[0]),px:v.map(x=>x[1])}; }
function simAll(k,name,lev,O={}){ const BUD0=O.bud||100, TA=O.ta===undefined?12.5:O.ta; // lev: 1 or 2 (2 = 2倍＋守りのルール)
  const A=assetSeries(name), a=HV[k]+750, b=Math.min(n-1,k<3?HV[k+1]:n-1), ex=exitIdx(k);
  if(A.ds[0]>T[a]) return null;
  // map BTC day index -> asset index (last trading day <= date) and next trading index (> date)
  const idxOf=new Map(A.ds.map((d,i)=>[d,i])); let ptr=0; const cur=new Array(n).fill(-1);
  for(let i=0;i<n;i++){ while(ptr+1<A.ds.length&&A.ds[ptr+1]<=T[i])ptr++; cur[i]=A.ds[ptr]<=T[i]?ptr:-1; }
  const nextIdx=i=>{ const j=cur[i]; return name==='BTC'?j:(j+1<A.ds.length?j+1:-1); };
  let cash=BUD0, lots=[], log=[], last=-1e9, nb=0, trialOpen=null, cool=-1, firstBuy=null, levOn=true, minV=BUD0, peakV=BUD0, mdd=0, series=[], stops=0, sw=0, warn=0;
  const val=ai=>cash+lots.reduce((s,l)=>s+l.units*l.mult*A.px[ai]/1,0);
  let prevAi=-1;
  for(let i=a;i<=ex;i++){
    const ai=cur[i]; if(ai<0) continue;
    // daily revaluation of lots (apply leverage path) on new trading day
    if(ai!==prevAi&&prevAi>=0){ const r=A.px[ai]/A.px[prevAi]-1; lots.forEach(l=>{ if(prevAi<l.startAi) return; const L=(lev===2&&levOn)?2:1; l.v*=Math.max(0,1+L*r-((lev===2&&levOn)?(0.0105+0.05)/252*(ai-prevAi):0)); }); }
    prevAi=ai;
    if(i<=b){
      const g=gauge(i,k), okg=!(g===g)||g>=GTH;
      // protective leverage rule
      if(lev===2&&lots.length){ if(levOn&&M[i]<20){levOn=false;sw++;log.push([T[i],'2倍→1倍']);} else if(!levOn&&M[i]>=75){levOn=true;sw++;log.push([T[i],'1倍→2倍']);} }
      // trial stop
      lots.filter(l=>l.kind==='trial'&&!l.sold).forEach(l=>{ if(c[i]<l.btc*0.9){ cash+=l.v; log.push([T[i],'試しを撤退 '+((l.v/l.cost-1)*100).toFixed(0)+'%']); l.sold=true; stops++; cool=i+7; } });
      lots=lots.filter(l=>!l.sold);
      lots.filter(l=>l.kind==='buy'&&!l.warned).forEach(l=>{ if(c[i]<l.btc*0.65){ l.warned=true; warn++; log.push([T[i],'想定外ラインのアラーム']); } });
      // full buy
      const okm=nb===0?M[i]>=75:(M[i]>=60&&i-last>=14);
      if(okm&&okg&&nb<4&&cash>0.5){ const amt=Math.min(25,cash); cash-=amt; lots.push({kind:'buy',cost:amt,v:amt,btc:c[i],startAi:nextIdx(i)}); nb++; last=i; if(firstBuy==null)firstBuy=i; log.push([T[i],'買い'+nb+'回目']); if(lev===2&&!levOn&&M[i]>=75){levOn=true;} }
      // trial (only before first full buy, one at a time)
      if(firstBuy==null&&!lots.some(l=>l.kind==='trial')&&i>=cool&&cross(i)&&okg){ if(TA<=0) {} else { const amt=Math.min(TA,cash); cash-=amt; lots.push({kind:'trial',cost:amt,v:amt,btc:c[i],startAi:nextIdx(i)}); log.push([T[i],'試し買い']); } }
    }
    const V=cash+lots.reduce((s,l)=>s+l.v,0); peakV=Math.max(peakV,V); mdd=Math.min(mdd,V/peakV-1); minV=Math.min(minV,V); series.push([T[i],+V.toFixed(1)]);
  }
  const V=series[series.length-1][1];
  return {name,lev,k,final:V,minV:+minV.toFixed(1),mdd,stops,sw,warn,log,series,exit:T[ex]};
}

// ---- 買い下がり（ナンピン）＋損切り
function ladder(k,name,opt){ const BUD=opt.bud||100;
  const A=assetSeries(name), a=HV[k]+750, b=Math.min(n-1,k<3?HV[k+1]:n-1), ex=exitIdx(k);
  if(A.ds[0]>T[a]) return null;
  let ptr=0; const cur=new Array(n).fill(-1); for(let i=0;i<n;i++){ while(ptr+1<A.ds.length&&A.ds[ptr+1]<=T[i])ptr++; cur[i]=A.ds[ptr]<=T[i]?ptr:-1; }
  let pendBase=false; let cash=BUD, pos=[], base=null, stops=0, buys=0, minV=BUD, peak=BUD, mdd=0, armed=true, prevAi=-1, done=false;
  const unit=BUD/4;
  for(let i=a;i<=ex;i++){
    const ai=cur[i]; if(ai<0) continue;
    if(prevAi>=0&&ai!==prevAi){ const r=A.px[ai]/A.px[prevAi]-1; pos.forEach(p=>{ if(prevAi>=p.s) p.v*=1+r; }); if(pendBase&&pos.length&&ai>=pos[0].s){ base=A.px[pos[0].s]; pendBase=false; } }
    prevAi=ai; const px=A.px[ai];
    if(i<=b&&!done){
      const g=gauge(i,k), okg=!(g===g)||g>=GTH;
      if(!pos.length){
        const trig = opt.trig==='phase' ? (armed&&okg) : opt.trig==='low' ? (armed&&okg&&c[i]<=low90(i)*1.001) : (armed&&okg&&cross(i));
        if(trig&&cash>1){ const amt=Math.min(unit,cash); cash-=amt; const st=name==='BTC'?ai:Math.min(ai+1,A.px.length-1); pos.push({v:amt,s:st}); if(st===ai) base=px; else { base=px; pendBase=true; } buys++; armed=false; }
      } else {
        const lv=pos.length; // next level
        if(!pendBase && lv<4 && px<=base*(1-opt.step*lv) && cash>1){ const amt=Math.min(unit,cash); cash-=amt; pos.push({v:amt,s:ai}); buys++; }
        if(px<base*(1-opt.step*3-opt.stop)){ cash+=pos.reduce((s,p)=>s+p.v,0); pos=[]; stops++; armed=false; base=null; }
      }
      // re-arm after a stop: wait for the app's trial signal (20日線の上抜き) or mid>=75
      if(!pos.length&&!armed&&(cross(i)||M[i]>=75)) armed=true;
      // once in, after full fill & recovery keep holding to the exit
    }
    const V=cash+pos.reduce((s,p)=>s+p.v,0); peak=Math.max(peak,V); mdd=Math.min(mdd,V/peak-1); minV=Math.min(minV,V);
  }
  // unused cash at the end of the bottom window is invested? no – leave as cash (same as app)
  const V=cash+pos.reduce((s,p)=>s+p.v,0);
  return {final:V,minV,mdd,stops,buys};
}
const low90=i=>{let m=Infinity;for(let j=i-90;j<=i;j++)m=Math.min(m,c[j]);return m;};




const LS=E.longSeries({t:Array.from(T.map(x=>Date.parse(x+'T00:00:00Z'))),c:Array.from(c)});
const wk2=[]; for(let i=n-1;i>=0;i-=7) wk2.unshift(i); const wr2=E.rsi(Float64Array.from(wk2.map(i=>c[i])),14), wrsi2=new Array(n).fill(NaN); wk2.forEach((i,k)=>{ for(let j=i;j<Math.min(n,i+7);j++) wrsi2[j]=wr2[k]; });
const newLow=i=>{ let m=Infinity; for(let j=i-90;j<i;j++) m=Math.min(m,c[j]); return c[i]<=m; };
const quiet=i=>{ for(let j=i-9;j<=i;j++) if(newLow(j)) return false; return true; };
// 過去の底（終値の最安）
const LOWS=[0,1,2].map(k=>{ let pk=HV[k]; for(let i=HV[k];i<Math.min(HV[k+1],HV[k]+900);i++) if(c[i]>c[pk]) pk=i; let lo=pk; for(let i=pk;i<HV[k+1];i++) if(c[i]<c[lo]) lo=i; return lo; });
const lowDays=LOWS.map((l,k)=>l-HV[k]);
const near=i=>LOWS.some(l=>Math.abs(i-l)<=90);

const s50=R.ind.s50, V=Array.from(d.v);
const flow=i=>{ let u=0; for(let j=i-19;j<=i;j++){ const r=c[j]-c[j-1]; u+= r>0? V[j] : -V[j]; } return u>0; };
const hi7=i=>{ let m=0; for(let j=i-7;j<i;j++) m=Math.max(m,d.h[j]); return m; };
const quiet30=i=>{ for(let j=i-29;j<=i;j++) if(newLow(j)) return false; return true; };
const cpk=k=>{ let pk=HV[k]; for(let i=HV[k];i<Math.min(n,HV[k]+900);i++) if(c[i]>c[pk]) pk=i; return pk; };
const newCycLow=(i,k)=>{ const pk=cpk(k); let m=Infinity; for(let j=pk;j<i;j++) m=Math.min(m,c[j]); return c[i]<m; };
const quiet30c=(i,k)=>{ for(let j=i-29;j<=i;j++) if(newCycLow(j,k)) return false; return true; };
const hiN=(i,N)=>{ let m=0; for(let j=i-N;j<i;j++) m=Math.max(m,d.h[j]); return m; };
const quietNc=(i,k,N)=>{ for(let j=i-N+1;j<=i;j++) if(newCycLow(j,k)) return false; return true; };
const cycLowAt=(i,k)=>{ const pk=cpk(k); let m=Infinity; for(let j=pk;j<=i;j++) m=Math.min(m,c[j]); return m; };
const SIGK={
  '今：30日安値更新なし＋1週間の高値を上抜け': (i,k)=> quiet30c(i,k)&&c[i]>hi7(i),
  '案1：30日安値更新なし＋20日の高値を上抜け': (i,k)=> quietNc(i,k,30)&&c[i]>hiN(i,20),
  '案2：30日安値更新なし＋30日の高値を上抜け': (i,k)=> quietNc(i,k,30)&&c[i]>hiN(i,30),
  '案3：30日安値更新なし＋20日の高値を上抜け＋20日線が上向き': (i,k)=> quietNc(i,k,30)&&c[i]>hiN(i,20)&&s20[i]>s20[i-5],
  '案4：30日安値更新なし＋50日の高値を上抜け': (i,k)=> quietNc(i,k,30)&&c[i]>hiN(i,50),
};
const SIG={
  'A：1週間の高値の上抜け＋10日新安値なし＋出来高の買い越し': i=> quiet(i)&&c[i]>hi7(i)&&flow(i),
  'B：1週間の高値の上抜け＋30日新安値なし': i=> quiet30(i)&&c[i]>hi7(i),
  'C：30日新安値なし＋50日線の上': i=> quiet30(i)&&c[i]>s50[i],
  'D：重みづけの会議（検証3・形2・需給1・気持ち1、7票中4票）': i=> ((M[i]>=75)?3:0)+((quiet30(i)&&c[i]>hi7(i))?2:0)+(flow(i)?1:0)+(wrsi2[i]>=45?1:0)>=4,
  '形：10日新安値なし＋20日線の上': i=> quiet(i)&&c[i]>s20[i],
  '形：50日線の上': i=> c[i]>s50[i],
  '形：1週間の高値を上抜け＋10日新安値なし': i=> quiet(i)&&c[i]>hi7(i),
  '検証：中期75以上': i=> M[i]>=75,
  '需給：20日の出来高が買い越し': i=> flow(i),
  '気持ち：週足RSI 50以上': i=> wrsi2[i]>=50,
};
// 底の出口の合図：底値圏に入ってから（半減期+750日）、底の180日後までに初めて点いた日。点いた後60日以内に、点いた日の終値の-10%を割ったら「だまし」
const starts=[0,1,2].map(k=>HV[k]+750);
console.log('サイクル: 底の日 / 底値圏の入り口');
[0,1,2].forEach(k=>console.log(' ',T[LOWS[k]],'/',T[starts[k]]));
for(const [nm2,f0] of Object.entries(SIGK)){ const f=f0;
  const out=[]; let falseN=0;
  [0,1,2].forEach(k=>{ const a=starts[k], lo=LOWS[k], b=lo+180; let first=null;
    for(let i=a;i<=b;i++){ if(!f(i,k)) continue;
      let m=Infinity; for(let j=i+1;j<=Math.min(n-1,i+60);j++) m=Math.min(m,c[j]);
      if(m<c[i]*0.9){ falseN++; i+=10; continue; }   // だまし（10日飛ばして数え直す）
      first=i; break; }
    out.push(first==null?'点かず':T[first]+'（底から'+(first-lo)+'日、底値の'+(c[first]/c[lo]*100-100>=0?'+':'')+Math.round(c[first]/c[lo]*100-100)+'%）'); });
  console.log(nm2.padEnd(24),'| だまし',falseN,'回 | 本物の初回:',out.join('　'));
}
process.exit(0);
const COND={
  '時期（前の回までの底の日を過ぎた）': (i,k)=>{ const prev=lowDays.slice(0,k); const th=prev.length?Math.min(...prev):750; return i-HV[k]>=th; },
  '底らしさ70%以上（5つの指標）': (i,k)=>{ const g=gauge(i,k); return g===g&&g>=0.7; },
  '長期成長線の0.5倍以下': (i,k)=> Math.exp(LS.resid[i])<=0.5,
  '週足RSI 35以下': (i,k)=> wrsi2[i]<=35,
  '10日間 新しい安値なし': (i,k)=> quiet(i),
};
let base=0,tot=0; const res={}; Object.keys(COND).forEach(x=>res[x]=[0,0]);
for(const k of [0,1,2]){ for(let i=HV[k]+400;i<HV[k+1];i++){ tot++; if(near(i)) base++; for(const [nmc,f] of Object.entries(COND)){ if(f(i,k)){ res[nmc][0]++; if(near(i)) res[nmc][1]++; } } } }
console.log('底の前後90日に入っている日の割合（何もしないときの当たり）',Math.round(base/tot*100)+'%');
for(const [nmc,[a,b]] of Object.entries(res)) console.log(nmc.padEnd(24),'当てはまる日',a,'→ 底の前後90日だった割合',Math.round(b/a*100)+'%','（何もしないときの',(b/a/(base/tot)).toFixed(1)+'倍）');
console.log('過去の底の日', LOWS.map(l=>T[l]));
