require('./engine.js'); const fs=require('fs'), E=globalThis.Engine;
const rows=fs.readFileSync('btc.csv','utf8').trim().split('\n').slice(1).map(l=>l.split(',')).filter(x=>x[0]>=process.argv[2]);
const n=rows.length,d={t:new Float64Array(n),o:new Float64Array(n),h:new Float64Array(n),l:new Float64Array(n),c:new Float64Array(n),v:new Float64Array(n)};
rows.forEach((x,i)=>{d.t[i]=Date.parse(x[0]+'T00:00:00Z');d.o[i]=+x[1];d.h[i]=+x[2];d.l[i]=+x[3];d.c[i]=+x[4];d.v[i]=+x[5];});
const R=E.run(d,null), idx=new Map(); rows.forEach((x,i)=>idx.set(x[0],i));
const S=JSON.parse(fs.readFileSync('stocks.json','utf8')).symbols, pc=x=>x===x?(x>0?'+':'')+(x*100).toFixed(1)+'%':'—';
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, win=a=>a.filter(x=>x>0).length/a.length;
for(const sym of ['MSTR','COIN']){
  const v=S[sym].filter(x=>idx.has(x[0])), m=v.length, sc=v.map(x=>x[1]), bi=v.map(x=>idx.get(x[0]));
  console.log(`\n### ${sym} ${v[0][0]}〜${v[m-1][0]} ${m}営業日`);
  for(const h of E.HORIZONS){ if(h.k==='d')continue;
    const td=Math.round(h.d*252/365), pct=R.hz[h.k].sc.pct;
    const g={all:[],sig:[],av:[]},r2={all:[],sig:[],av:[]}, cut=m-504;
    for(let i=0;i+td<m;i++){const p=pct[bi[i]-1]; if(p!==p)continue; const r=sc[i+td]/sc[i]-1;
      const put=o=>{o.all.push(r); if(p>=60)o.sig.push(r); else if(p<40)o.av.push(r);}; put(g); if(i>=cut)put(r2);}
    const f=o=>`買い系 n${o.sig.length} 勝${pc(win(o.sig))} 平均${pc(mean(o.sig))} | 全日 勝${pc(win(o.all))} 平均${pc(mean(o.all))} | 見送り n${o.av.length} 勝${pc(win(o.av))} 平均${pc(mean(o.av))}`;
    console.log(`${h.name}(${td}日) 全期間: ${f(g)}\n         直近2年: ${f(r2)}`);
    // strategy
    let pos=0,eq=1,bh=1,pk=1,mdd=0,bpk=1,bmdd=0,tr=0,start=-1; let eq2=1,bh2=1;
    for(let i=0;i<m-1;i++){const p=pct[bi[i]]; if(p!==p&&start<0)continue; if(start<0)start=i;
      let np=pos; if(p>=60)np=1; else if(p<40)np=0; if(np!==pos){eq*=0.999;if(i>=cut)eq2*=0.999;tr++;pos=np;}
      const r=sc[i+1]/sc[i]-1; eq*=1+pos*r; bh*=1+r; if(i>=cut){eq2*=1+pos*r;bh2*=1+r;}
      pk=Math.max(pk,eq);mdd=Math.min(mdd,eq/pk-1);bpk=Math.max(bpk,bh);bmdd=Math.min(bmdd,bh/bpk-1);}
    const yrs=(m-1-start)/252;
    console.log(`         売買: 年率${pc(Math.pow(eq,1/yrs)-1)} 最大下落${pc(mdd)} / 持ち続け 年率${pc(Math.pow(bh,1/yrs)-1)} 最大下落${pc(bmdd)} | 直近2年 累計 ${pc(eq2-1)} vs ${pc(bh2-1)} 売買${tr}回`);
  }
}
