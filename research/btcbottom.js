require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>='2011-09-01'&&+x[4]>0);
const n=rows.length, T=rows.map(x=>x[0]);
const d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const c=d.c, ls=E.longSeries({t:Array.from(d.t),c:Array.from(c)}); const R=E.run(d,{pl:ls.resid,w200:ls.w200}), M=R.hz.m.sc.pct, S7=R.hz.s.sc.pct, I=R.ind;
const s20=I.s20, s50=I.s50, r14=I.r14, v20=E.sma(d.v,20);
const e12=E.ema(c,12), e26=E.ema(c,26), macd=c.map((_,i)=>e12[i]-e26[i]), sig=E.ema(Float64Array.from(macd),9);
// major lows: zigzag on closes, 30% down then 30% up
const piv=[]; let dir=0, ext=0;
for(let i=1;i<n;i++){ if(dir>=0){ if(c[i]>c[ext]) ext=i; else if(c[i]<c[ext]*0.7){piv.push(['H',ext]);dir=-1;ext=i;} } if(dir<0){ if(c[i]<c[ext]) ext=i; else if(c[i]>c[ext]*1.3){piv.push(['L',ext]);dir=1;ext=i;} } }
const START=T.findIndex(x=>x>='2013-01-01');
const lows=piv.filter(p=>p[0]==='L'&&p[1]>=START).map(p=>p[1]);
console.log('大きな底（3割以上下げて3割以上戻した谷）',lows.length,'回:',lows.map(i=>T[i].slice(2)).join(' '));
const low90=i=>{let m=Infinity;for(let j=i-90;j<=i;j++)m=Math.min(m,c[j]);return m;};
const freshLow=(i,w)=>{const m=low90(i);for(let j=i-w;j<=i;j++)if(c[j]<=m*1.001)return true;return false;};
const DET={
 'A 20日線の上抜き（20日以内に90日安値）':i=>c[i]>s20[i]&&c[i-1]<=s20[i-1]&&freshLow(i,20),
 'B RSIが30を下から上抜き':i=>r14[i]>=30&&r14[i-1]<30,
 'C 3日連続で上昇（10日以内に90日安値）':i=>c[i]>c[i-1]&&c[i-1]>c[i-2]&&c[i-2]>c[i-3]&&freshLow(i,10),
 'D MACDが買い転換（20日以内に90日安値）':i=>macd[i]>sig[i]&&macd[i-1]<=sig[i-1]&&freshLow(i,20),
 'E 安値から10%戻し（10日以内に90日安値）':i=>{const m=low90(i);return c[i]>=m*1.10&&c[i-1]<m*1.10&&freshLow(i,10);},
 'F 投げ売りの出来高の後の陽線（10日以内）':i=>{ if(!(c[i]>c[i-1]))return false; for(let j=i-10;j<i;j++) if(c[j]<c[j-1]*0.93&&d.v[j]>2.5*v20[j-1]) return freshLow(i,10); return false; },
 'G 短期スコアが60以上に（20日以内に90日安値）':i=>S7[i]>=60&&S7[i-1]<60&&freshLow(i,20),
 'H 中期スコアが40以上に（30日以内に90日安値）':i=>M[i]>=40&&M[i-1]<40&&freshLow(i,30),
 'I 10日線の上抜き（10日以内に90日安値）':i=>{const s10=(k)=>{let s=0;for(let j=k-9;j<=k;j++)s+=c[j];return s/10;};return c[i]>s10(i)&&c[i-1]<=s10(i-1)&&freshLow(i,10);},
};
const med=a=>{const s=a.slice().sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN}, pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(0)+'%':'—';
console.log('\n合図 | 出た回数 | 大きな底を30日以内に捉えた数 | 捉えたときの遅れ(日)・底値比 | 空振り率（底の後30日以内でなかった） | 撤退-10%つきの勝率（+20%が先） | 1回の平均');
for(const [nm,f] of Object.entries(DET)){
  const sigs=[]; let last=-99; for(let i=Math.max(START,400);i<n-1;i++){ if(f(i)&&i-last>5){sigs.push(i);last=i;} }
  // detection of each major low: first signal within 30 days after the low
  const det=lows.map(L=>{const s=sigs.find(i=>i>=L&&i<=L+30);return s!=null?{lag:s-L,up:c[s]/c[L]-1}:null;});
  const got=det.filter(Boolean);
  const hitSig=sigs.filter(i=>lows.some(L=>i>=L&&i<=L+30)).length;
  // trade outcome with -10% close stop vs +20% target (whichever first), max 180 days
  let win=0,tot=0,sum=0; for(const i of sigs){ let res=null; for(let j=i+1;j<=Math.min(n-1,i+180);j++){ if(c[j]<=c[i]*0.9){res=c[j]/c[i]-1;break;} if(c[j]>=c[i]*1.2){res=c[j]/c[i]-1;break;} } if(res==null)continue; tot++; sum+=res; if(res>0)win++; }
  console.log(`${nm.padEnd(30)} ${String(sigs.length).padStart(3)}回 | ${got.length}/${lows.length} | 中央${med(got.map(x=>x.lag))}日・${pc(med(got.map(x=>x.up)))} | ${(100-hitSig/sigs.length*100).toFixed(0)}% | ${(win/tot*100).toFixed(0)}%（${tot}回） | ${pc(sum/tot)}`);
}
// baseline: random day
{ let win=0,tot=0,sum=0; for(let i=Math.max(START,400);i<n-181;i+=3){ let res=null; for(let j=i+1;j<=i+180;j++){ if(c[j]<=c[i]*0.9){res=c[j]/c[i]-1;break;} if(c[j]>=c[i]*1.2){res=c[j]/c[i]-1;break;} } if(res==null)continue; tot++; sum+=res; if(res>0)win++; } console.log(`参考：いつ買っても                    | 撤退-10%つきの勝率 ${(win/tot*100).toFixed(0)}%（${tot}回） | ${pc(sum/tot)}`); }
