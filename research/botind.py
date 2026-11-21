import json, csv, math, datetime as dt, statistics as st
oc=json.load(open('onchain.json'))
rows=[r for r in csv.DictReader(open('btc.csv')) if float(r['close'])>0]
D=[r['date'] for r in rows]; C=[float(r['close']) for r in rows]; V=[float(r['volume']) for r in rows]; n=len(D); I={d:i for i,d in enumerate(D)}
def ser(k):
    a=[float('nan')]*n
    for d,v in oc.get(k,[]):
        if d in I: a[I[d]]=v
    return a
mvrv,fng,hr,mr=ser('mvrv'),ser('fng'),ser('hash'),ser('minerrev')
def sma(a,w):
    o=[float('nan')]*n; s=0; q=[]
    for i,x in enumerate(a):
        q.append(x); 
        if len(q)>w: q.pop(0)
        if len(q)==w and all(v==v for v in q): o[i]=sum(q)/w
    return o
m200=sma(C,200); w200=sma(C,1400); hr30=sma(hr,30); hr60=sma(hr,60); mr365=sma(mr,365); f30=sma(fng,30); v20=sma(V,20)
ath=[];m=0
for x in C: m=max(m,x); ath.append(m)
# rsi14 daily and weekly
def rsi(a,n_=14):
    o=[float('nan')]*len(a); ag=al=0
    for i in range(1,len(a)):
        d=a[i]-a[i-1]; g=max(d,0); l=max(-d,0)
        if i<=n_: ag+=g/n_; al+=l/n_; 
        else: ag=(ag*(n_-1)+g)/n_; al=(al*(n_-1)+l)/n_
        if i>=n_: o[i]=100-100/(1+ag/(al or 1e-12))
    return o
r14=rsi(C)
wk=list(range(n-1,-1,-7))[::-1]; wr=rsi([C[i] for i in wk]); wrsi=[float('nan')]*n
for k,i in enumerate(wk):
    for j in range(i,min(n,i+7)): wrsi[j]=wr[k]
def climax(i):
    for j in range(max(1,i-30),i+1):
        if C[j]<C[j-1]*0.95 and v20[j-1]==v20[j-1] and V[j]>2.5*v20[j-1] and r14[j]==r14[j] and r14[j]<30: return True
    return False
hash_buy=[False]*n
for i in range(1,n):
    # hash ribbon: 30d crosses above 60d after having been below at some point in last 60 days
    if hr30[i]==hr30[i] and hr60[i]==hr60[i] and hr30[i]>hr60[i] and hr30[i-1]<=hr60[i-1]: 
        for j in range(i,min(n,i+30)): hash_buy[j]=True
IND={
 'MVRV<1.0':lambda i: mvrv[i]<1.0,
 'MVRV<1.1':lambda i: mvrv[i]<1.1,
 '恐怖指数30日平均<25':lambda i: f30[i]<25,
 '恐怖指数≤15':lambda i: fng[i]<=15,
 'ハッシュリボン買い（30日以内）':lambda i: hash_buy[i],
 'Puell<0.6':lambda i: mr365[i]==mr365[i] and mr[i]/mr365[i]<0.6,
 'Mayer<0.8':lambda i: m200[i]==m200[i] and C[i]/m200[i]<0.8,
 '200週線の下':lambda i: w200[i]==w200[i] and C[i]<w200[i],
 '週足RSI<35':lambda i: wrsi[i]<35,
 'セリクラ（30日以内）':lambda i: climax(i),
 '高値から-70%以上':lambda i: C[i]/ath[i]-1<=-0.70,
}
lows=['2015-01-14','2018-12-15','2022-11-21']; LI=[I[x] for x in lows]
start=I['2014-06-01']
def near_low(i,w): return any(abs(i-L)<=w for L in LI)
pc=lambda x:('+' if x>0 else '')+f'{x*100:.0f}%'
print('指標 | 点灯日数 | 底±90日に入っていた割合(精度) | 各底の前後で初めて点いた日（底からの日数） | 点灯日の1年後 中央値 | 今')
for k,f in IND.items():
    on=[i for i in range(start,n) if f(i)]
    prec=sum(near_low(i,90) for i in on)/len(on) if on else float('nan')
    firsts=[]
    for L in LI:
        w=[i for i in on if L-200<=i<=L+120]
        firsts.append(str(w[0]-L) if w else 'なし')
    fy=[C[i+365]/C[i]-1 for i in on if i+365<n]
    now=f(n-1)
    print(f"{k:22s} {len(on):5d} | {prec*100:4.0f}% | {', '.join(firsts):20s} | {pc(st.median(fy)) if fy else '—':>6s} | {'点灯' if now else '-'}")
print('\n今', D[-1], 'MVRV', round(mvrv[-1],3), 'FNG', fng[-1], 'FNG30', round(f30[-1],1), 'Puell', round(mr[-1]/mr365[-1],2), 'Mayer', round(C[-1]/m200[-1],2), '200W比', round(C[-1]/w200[-1],2), '週RSI', round(wrsi[-1],1), 'hr30/60', round(hr30[-1]/hr60[-1],3))
# MVRV/FNG at lows
for L,d in zip(LI,lows): print(d,'MVRV',round(mvrv[L],2),'FNG',fng[L],'Puell',round(mr[L]/mr365[L],2) if mr365[L]==mr365[L] else None,'Mayer',round(C[L]/m200[L],2),'週RSI',round(wrsi[L],1))

# ---- composite "bottom proximity" gauge, causal: targets = least-extreme value seen at PREVIOUS cycle lows only
peaks=['2013-12-04','2017-12-16','2021-11-08','2025-10-06']; PI=[I[p] for p in peaks]
w200r=[C[i]/w200[i] if w200[i]==w200[i] else float('nan') for i in range(n)]
puell=[mr[i]/mr365[i] if mr365[i]==mr365[i] and mr365[i]>0 else float('nan') for i in range(n)]
mayer=[C[i]/m200[i] if m200[i]==m200[i] else float('nan') for i in range(n)]
dd=[C[i]/ath[i]-1 for i in range(n)]
SER={'MVRV':(mvrv,0.60),'Puell':(puell,0.63),'週足RSI':(wrsi,0.59),'高値からの下落':(dd,0.56),'200週線比':(w200r,0.47),'Mayer':(mayer,0.45)}
def gauge(i,k):  # k: index of current cycle (peak PI[k]); targets from lows before PI[k]
    prev=[L for L in LI if L<PI[k]]
    if not prev: return None
    tot=0; wsum=0; parts={}
    for nm,(s,w) in SER.items():
        bots=[s[L] for L in prev if s[L]==s[L]]
        if not bots or s[i]!=s[i] or s[PI[k]]!=s[PI[k]]: continue
        tgt=max(bots)  # least extreme (all these indicators are lower at bottoms)
        top=s[PI[k]]
        if top<=tgt: continue
        p=min(1,max(0,(top-s[i])/(top-tgt))); parts[nm]=p; tot+=p*w; wsum+=w
    return (tot/wsum if wsum else None), parts
for k in [1,2,3]:
    L=LI[k] if k<3 else None
    seq=[]
    for i in range(PI[k],min(n,PI[k]+700)):
        g=gauge(i,k)
        if g and g[0] is not None: seq.append((i,g[0]))
    def first(th):
        for i,g in seq:
            if g>=th: return i
        return None
    out=[]
    for th in [0.6,0.7,0.8,0.9]:
        f=first(th); out.append(f"{int(th*100)}%到達: " + ('なし' if f is None else (D[f]+(f'（底の{L-f}日前）' if L and f<=L else (f'（底の{f-L}日後）' if L else '')))))
    print(f"\n{peaks[k]}の天井からのサイクル: 底 {D[L] if L else '未確定'} | "+' | '.join(out))
g=gauge(n-1,3); print('今の到達度', round(g[0]*100), {k:round(v*100) for k,v in g[1].items()})
