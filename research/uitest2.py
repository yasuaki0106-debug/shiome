import asyncio, json, csv, math, random, datetime as dt, sys
from playwright.async_api import async_playwright
random.seed(7)
rows=list(csv.DictReader(open('btc.csv')))
rows=[r for r in rows if r['date']>='2017-08-17']
def ms(d): return int(dt.datetime.strptime(d,'%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp()*1000)
kl=[[ms(r['date']),r['open'],r['high'],r['low'],r['close'],r['volume'],ms(r['date'])+86399999] for r in rows]
last=kl[-1]; spot=float(last[4])
NOW=last[0]+86400000*2+3600000*5   # 2 days after last candle → add 1 completed + 1 live candle
kl.append([last[0]+86400000,last[4],str(spot*1.01),str(spot*0.97),str(spot*0.985),"1300",0])
kl.append([last[0]+2*86400000,str(spot*0.985),str(spot*0.99),str(spot*0.97),str(spot*0.98),"400",0])
spot=spot*0.98
NOWV=[NOW]; KL=[kl]
MODE=sys.argv[1] if len(sys.argv)>1 else 'full'
def klines(url):
    from urllib.parse import urlparse,parse_qs
    q=parse_qs(urlparse(url).query)
    if q.get('interval',[''])[0]=='1h':
        t0=NOWV[0]-(NOWV[0]%3600000); return [[t0-(199-i)*3600000,"0","0","0",str(spot*(1+0.0005*((i*7)%11-5))),"1"] for i in range(200)]
    st=int(q['startTime'][0]); out=[k for k in KL[0] if k[0]>=st][:1000]; return out
def options():
    out=[]
    exps=[('27NOV26',5),('4DEC26',12),('25DEC26',33),('26MAR27',124)]
    for name,days in exps:
        for K in range(40000,100001,2000):
            m=K/spot
            for tp in 'CP':
                oi=max(0,random.gauss(300,150))*(2 if days==33 else 1)*(1.5 if (tp=='C' and m>1) or (tp=='P' and m<1) else 0.4)
                iv=52+ (1-m)*40*(1 if m<1 else -0.3)
                out.append(dict(instrument_name=f'BTC-{name}-{K}-{tp}',open_interest=round(oi,1),volume=round(oi*0.1,1),mark_iv=round(iv,2),underlying_price=spot*1.002))
    return dict(result=out)
def dvol(url):
    data=[[k[0],50,55,45,50+10*math.sin(i/40)+random.random()] for i,k in enumerate(kl) if k[0]>=ms('2021-03-24')]
    return dict(result=dict(data=data,continuation=None))
def funding(url):
    from urllib.parse import urlparse,parse_qs
    st=int(parse_qs(urlparse(url).query)['startTime'][0]); out=[]
    t=max(st,ms('2019-09-10')); t=t-(t%28800000)+28800000
    while t<NOW and len(out)<1000:
        out.append(dict(symbol='BTCUSDT',fundingTime=t,fundingRate=str(round(0.0001+0.0002*math.sin(t/8e9)+random.gauss(0,0.00005),8)),markPrice="0")); t+=28800000
    return out
def oihist():
    out=[];base=82000
    for i in range(180):
        t=NOW-(179-i)*4*3600000; px=spot*(1+0.25*(179-i)/179)+random.gauss(0,300); oi=base+i*120+random.gauss(0,300)
        out.append(dict(symbol='BTCUSDT',sumOpenInterest=str(oi),sumOpenInterestValue=str(oi*px),timestamp=t))
    return out
def lsr():
    return [dict(symbol='BTCUSDT',longShortRatio=str(1.5+0.5*math.sin(i/20)+i/400),longAccount="0.6",shortAccount="0.4",timestamp=NOW-(179-i)*4*3600000) for i in range(180)]
def stock(sym):
    vals=[];p=300.0
    for k in kl[-1500:]:
        d=dt.datetime.fromtimestamp(k[0]/1000,dt.timezone.utc)
        if d.weekday()>=5: continue
        i=kl.index(k); r=math.log(float(kl[i][4])/float(kl[i-1][4])) if i else 0
        p*=math.exp(1.6*r+random.gauss(0,0.02)); vals.append(dict(datetime=d.strftime('%Y-%m-%d'),open=str(p),high=str(p),low=str(p),close=str(round(p,2)),volume="1"))
    return dict(meta=dict(symbol=sym),values=vals[::-1],status='ok')

MODE='full'
def make_handler(state):
    async def handle(route):
        u=route.request.url
        def js(o): return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(o))
        if 'fonts.g' in u: return await route.abort()
        if '/api/v3/klines' in u: return await js(klines(u))
        if 'raw.githubusercontent' in u: return await route.fulfill(status=200,content_type='text/plain',headers={'access-control-allow-origin':'*'},body=open('btc.csv').read())
        if 'kind=option' in u: return await js(options())
        if 'get_index_price' in u: return await js(dict(result=dict(index_price=state['spot'])))
        if 'get_volatility_index_data' in u: return await js(dvol(u))
        if 'fundingRate' in u: return await js(funding(u))
        if 'premiumIndex' in u: return await js(dict(symbol='BTCUSDT',markPrice=str(state['spot']),lastFundingRate="0.00031",nextFundingTime=0))
        if 'openInterestHist' in u: return await js(oihist())
        if 'okx.com' in u and 'open-interest' in u: return await js(okx_oi_mock())
        if 'okx.com' in u and 'funding-rate' in u: return await js(okx_fr_mock())
        if 'okx_oi.json' in u: return await js(okx_hist_file())
        if 'bybit.com' in u and 'tickers' in u: return await js(bybit_tk())
        if 'bybit.com' in u and 'open-interest' in u: return await js(bybit_oi())
        if 'bybit.com' in u and 'account-ratio' in u: return await js(bybit_ar())
        if 'coinbase.com' in u and 'ticker' in u: return await js(cb_tk())
        if 'coinbase.com' in u and 'candles' in u: return await js(cb_cd())
        if 'LongShort' in u: return await js(lsr())
        return await route.abort()
    return handle

def okx_oi_mock():
    return {"code":"0","data":[{"instId":"BTC-USDT-SWAP","oiCcy":"33588.4","oiUsd":str(33588.4*spot),"ts":str(NOW)}]}
def okx_fr_mock():
    return {"code":"0","data":[{"fundingRate":"-0.0000551"}]}
def okx_hist_file():
    return {"rows":[[NOW-(179-i)*4*3600000, 30000+i*20] for i in range(180)]}
def bybit_tk():
    return {"retCode":0,"result":{"list":[{"openInterest":"52000","openInterestValue":str(52000*spot),"fundingRate":"0.00008"}]}}
def bybit_oi():
    return {"retCode":0,"result":{"list":[{"openInterest":str(50000+i*10),"timestamp":str(NOW-(i)*4*3600000)} for i in range(200)]}}
def bybit_ar():
    return {"retCode":0,"result":{"list":[{"buyRatio":"0.58","sellRatio":"0.42","timestamp":str(NOW-(179-i)*4*3600000)} for i in range(180)]}}
def cb_tk():
    return {"price":str(spot*1.0008)}
def cb_cd():
    out=[]
    for k in kl[-300:]:
        out.append([k[0]//1000,0,0,0,float(k[4])*(1+0.0004),1])
    return out[::-1]

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport=dict(width=390,height=844),locale='ja-JP',timezone_id='Asia/Tokyo')
        state={'spot':spot,'now':NOW}
        async def newpage(now):
            pg=await ctx.new_page()
            await pg.add_init_script(f"const _N={now};const _D=Date;Date=class extends _D{{constructor(...a){{if(a.length)super(...a);else super(_N)}}static now(){{return _N}}}};")
            errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.route(lambda u: not u.startswith('http://localhost') or 'okx_oi.json' in u,make_handler(state))
            return pg,errs
        # ---- day 1
        pg,errs=await newpage(NOW); await pg.goto('http://localhost:8765/index.html')
        await pg.wait_for_function("window.__S && window.__S.at && !window.__S.loading",timeout=60000)
        await pg.wait_for_timeout(600)
        print('prov normal:',await pg.evaluate("JSON.stringify(__S.prov&&{a:__S.prov.a,f:+__S.prov.frac.toFixed(2),pct:Object.values(__S.prov.pct).map(x=>Math.round(x))})"),'official:',await pg.evaluate("JSON.stringify({a:__S.plan.a,pct:['d','s','m','l'].map(k=>Math.round(__S.R.hz[k].pct))})"))
        # surge: BTC +14% intraday
        old=(kl[-1][2],kl[-1][4],state['spot']); kl[-1][2]=str(spot*1.16); kl[-1][4]=str(spot*1.14); kl[-1][5]="5200"; state['spot']=spot*1.14
        t0=await pg.evaluate("performance.now()"); await pg.evaluate("__T.refreshAll()"); await pg.wait_for_function("!window.__S.loading",timeout=60000); await pg.wait_for_timeout(900)
        print('prov surge:',await pg.evaluate("JSON.stringify(__S.prov&&{a:__S.prov.a,f:+__S.prov.frac.toFixed(2),pct:Object.values(__S.prov.pct).map(x=>Math.round(x)),why:__S.prov.why})"),'official:',await pg.evaluate("__S.plan.a"),'price',await pg.evaluate("Math.round(__S.price)"))
        await pg.screenshot(path='shot_prov.png',full_page=False)
        print('pv in log:',await pg.evaluate("JSON.stringify(__T.LS.get('log',[]).map(x=>[x.k,x.pa,x.pv]))"))
        kl[-1][2],kl[-1][4],state['spot']=old; kl[-1][5]="400"
        await pg.evaluate("__T.refreshAll()"); await pg.wait_for_function("!window.__S.loading",timeout=60000); await pg.wait_for_timeout(600)
        log1=await pg.evaluate("JSON.stringify(__T.LS.get('log',[]).map(x=>[x.k,x.px,x.pa,Object.keys(x.sp||{}).length,x.up&&x.up.t,x.pk]))")
        print('day1 log',log1, 'price',await pg.evaluate("__S.price"),'errs',errs)
        # form persistence across auto refresh
        await pg.evaluate("location.hash='stocks'"); await pg.wait_for_timeout(200)
        await pg.fill('#pos-cost','12.34'); await pg.fill('#pos-qty','77'); await pg.select_option('#pos-sym','CONL')
        await pg.evaluate("__T.refreshAll()"); await pg.wait_for_function("!window.__S.loading",timeout=60000); await pg.wait_for_timeout(200)
        print('form kept:',await pg.evaluate("[document.querySelector('#pos-cost').value,document.querySelector('#pos-qty').value,document.querySelector('#pos-sym').value]"))
        # session unit tests
        tests={'土曜 02:00UTC':'2026-11-21T02:00:00Z','感謝祭 木 15:00UTC':'2026-11-26T15:00:00Z','感謝祭前日 水 22:00UTC':'2026-11-25T22:00:00Z','短縮日 金 16:00UTC':'2026-11-27T16:00:00Z','夏時間初日後 月 14:00UTC':'2027-03-15T14:00:00Z','通常 火 15:00UTC':'2026-12-01T15:00:00Z','夜間 火 02:00UTC':'2026-12-01T02:00:00Z'}
        for nm,iso in tests.items():
            r=await pg.evaluate("(iso)=>{const t=Date.parse(iso);return __T.usSegments(t).map(x=>x.name+(x.live?'*':'')+' '+new Date(x.s).toISOString().slice(5,16)+'~'+new Date(x.e).toISOString().slice(11,16)).join(' | ')}",iso)
            print(' ',nm,'→',r)
        print('planLabel(buy) now:',await pg.evaluate("__T.planLabel('buy')"))
        await pg.close()
        # ---- day 2: yesterday's partial candle is finalized at a different close; a new partial starts
        kl[-1][4]=str(spot*0.95); kl[-1][3]=str(spot*0.94); kl.append([kl[-1][0]+86400000,str(spot*0.95),str(spot*0.97),str(spot*0.94),str(spot*0.96),"300",0])
        state['spot']=spot*0.96; state['now']=NOW+86400000; NOWV[0]=state['now']
        # day 2, network down: cache boot must not treat yesterday's partial candle as final, and must not log
        pg0=await ctx.new_page()
        await pg0.add_init_script(f"const _N={state['now']};const _D=Date;Date=class extends _D{{constructor(...a){{if(a.length)super(...a);else super(_N)}}static now(){{return _N}}}};")
        async def dead(route): await route.abort()
        await pg0.route(lambda u: not u.endswith('index.html'),dead)
        await pg0.goto('http://localhost:8765/index.html'); await pg0.wait_for_function("window.__S && window.__S.at && !window.__S.loading",timeout=60000)
        print('day2 offline:',await pg0.evaluate("JSON.stringify({log:__T.LS.get('log',[]).map(x=>x.k),last:new Date(__S.d.t[__S.d.c.length-1]).toISOString().slice(0,10),stale:+__S.stale.toFixed(2),flags:__S.flags.map(f=>f.src),price:__S.price,status:Object.values(__S.status).map(s=>s.ok)})"))
        await pg0.close()
        pg,errs=await newpage(state['now'])
        await pg.goto('http://localhost:8765/index.html')
        boot=await pg.evaluate("JSON.stringify({log:__T.LS.get('log',[]).map(x=>[x.k,x.px]),last:new Date(__S.d.t[__S.d.c.length-1]).toISOString().slice(0,10),lastc:__S.d.c[__S.d.c.length-1],stale:__S.stale})")
        print('day2 at boot (cache only):',boot)
        await pg.wait_for_function("window.__S && window.__S.at && !window.__S.loading",timeout=60000)
        after=await pg.evaluate("JSON.stringify({log:__T.LS.get('log',[]).map(x=>[x.k,x.px]),last:new Date(__S.d.t[__S.d.c.length-1]).toISOString().slice(0,10),lastc:__S.d.c[__S.d.c.length-1],price:__S.price})")
        print('day2 after refresh:',after,'true close',spot*0.95,'errs',errs)
        await b.close()
asyncio.run(main())
