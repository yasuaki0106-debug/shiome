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
MODE=sys.argv[1] if len(sys.argv)>1 else 'full'
def klines(url):
    from urllib.parse import urlparse,parse_qs
    q=parse_qs(urlparse(url).query); st=int(q['startTime'][0]); out=[k for k in kl if k[0]>=st][:1000]; return out
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
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for scheme in ['dark','light']:
            ctx=await b.new_context(viewport=dict(width=390,height=844),device_scale_factor=2,color_scheme=scheme,locale='ja-JP',timezone_id='Asia/Tokyo')
            pg=await ctx.new_page()
            await pg.add_init_script(f"const _N={NOW};const _D=Date;Date=class extends _D{{constructor(...a){{if(a.length)super(...a);else super(_N)}}static now(){{return _N}}}};")
            errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
            async def handle(route):
                u=route.request.url
                def js(o): return route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(o))
                if 'fonts.g' in u: return await route.abort()
                if MODE=='offline' and not 'raw.githubusercontent' in u: return await route.abort()
                if '/api/v3/klines' in u: return await js(klines(u))
                if 'raw.githubusercontent' in u: return await route.fulfill(status=200,content_type='text/plain',headers={'access-control-allow-origin':'*'},body=open('btc.csv').read())
                if 'kind=option' in u: return await js(options())
                if 'get_index_price' in u: return await js(dict(result=dict(index_price=spot)))
                if 'get_volatility_index_data' in u: return await js(dvol(u))
                if 'fundingRate' in u: return await js(funding(u))
                if 'premiumIndex' in u: return await js(dict(symbol='BTCUSDT',markPrice=str(spot),lastFundingRate="0.00031",nextFundingTime=0))
                if 'openInterestHist' in u: return await js(oihist())
                if 'LongShort' in u: return await js(lsr())
                if 'twelvedata' in u: return await js(stock('X'))
                return await route.abort()
            await pg.route(lambda u: not u.startswith('file:'),handle)
            if MODE=='full' : await pg.add_init_script("try{localStorage.setItem('shiome.cfg',JSON.stringify({src:'auto',tdKey:'TESTKEY'}))}catch(e){}")
            await pg.goto('file:///home/claude/btc/index.html')
            await pg.wait_for_function("window.__S && window.__S.at && !window.__S.loading",timeout=60000)
            await pg.wait_for_timeout(300)
            st=await pg.evaluate("JSON.stringify({status:__S.status,act:__S.act,flags:__S.flags,price:__S.price,liq:{lr:__S.liq.longRisk,sr:__S.liq.shortRisk,oi7:__S.liq.oi7,fp:__S.liq.fundPct,cl:__S.liq.clusters&&__S.liq.clusters.below},opt:__S.opt&&{pcr:__S.opt.pcrOI,skew:__S.opt.skew,atm:__S.opt.atmIV,mp:__S.opt.main.maxPain,cw:__S.opt.callWall,pw:__S.opt.putWall},n:__S.d.c.length,fac:__S.R.hz.m.sc.factors.filter(f=>f.w).map(f=>f.id+':'+f.ic.toFixed(2)),stk:__S.stocks.MSTR&&__S.stocks.MSTR.an&&{b:__S.stocks.MSTR.an.beta,c:__S.stocks.MSTR.an.corr,bt:__S.stocks.MSTR.an.bt.m}})")
            if scheme=='dark': print(json.dumps(json.loads(st),ensure_ascii=False,indent=1)[:5000])
            for tab in ['judge','verify','flow','events','stocks']:
                await pg.evaluate(f"location.hash='{tab}'"); await pg.wait_for_timeout(250)
                await pg.screenshot(path=f'shot_{MODE}_{scheme}_{tab}.png',full_page=True)
                ov=await pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
                if ov: print('H-OVERFLOW',tab)
            print(scheme,'errors:',errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
