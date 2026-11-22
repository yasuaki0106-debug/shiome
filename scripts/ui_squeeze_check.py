import asyncio,subprocess,time,json,csv,datetime as dt,sys
from playwright.async_api import async_playwright
rows=[r for r in csv.DictReader(open('/home/claude/btc/btc.csv')) if r['date']>='2017-08-17']
def ms(d): return int(dt.datetime.strptime(d,'%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp()*1000)
kl=[[ms(r['date']),r['open'],r['high'],r['low'],r['close'],r['volume'],0] for r in rows]; kl.append([ms('2026-11-21'),'58815','60570','55106','60230','3000',0]); NOW=kl[-1][0]+86400000+1*3600000
JS="""(()=>{const out=[];document.querySelectorAll('#view *').forEach(e=>{if(!e.offsetParent)return;const t=(e.innerText||'').trim();if(t.length<5)return;
 if(e.children.length>0 && [...e.children].some(c=>(c.innerText||'').trim().length>0) && !['B','SPAN','SMALL','TD','TH','DT','DD','A','BUTTON'].includes(e.tagName)) return;
 const r=e.getBoundingClientRect(); const lh=parseFloat(getComputedStyle(e).lineHeight)||18; const lines=r.height/lh;
 const perLine=t.length/Math.max(1,lines);
 if(r.width<80 && lines>=3 && perLine<5) out.push(e.tagName+' w='+Math.round(r.width)+' lines='+Math.round(lines)+' | '+t.slice(0,40).replace(/\\n/g,' '));});return out;})()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for W in [360,390,412]:
            pg=await b.new_page(viewport=dict(width=W,height=800),locale='ja-JP',timezone_id='Asia/Tokyo')
            await pg.add_init_script(f"const _N={NOW};const _D=Date;Date=class extends _D{{constructor(...a){{if(a.length)super(...a);else super(_N)}}static now(){{return _N}}}};")
            await pg.add_init_script("try{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.clear();localStorage.setItem('shiome.pos',JSON.stringify([{sym:'CONL',cost:4.49,qty:4363,date:'2026-06-03',kind:'old'}]));localStorage.setItem('shiome.cash','4730.74')}}catch(e){}")
            async def h(route):
                u=route.request.url
                if '/api/v3/klines' in u and 'interval=1d' in u:
                    from urllib.parse import urlparse,parse_qs
                    st=int(parse_qs(urlparse(u).query)['startTime'][0]); return await route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps([k for k in kl if k[0]>=st][:1000]))
                if 'gateio' in u:
                    sym='MSTRX_USDT' if 'MSTRX' in u else 'COINX_USDT'; px='78.48' if 'MSTRX' in u else '101.64'
                    return await route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps([{'currency_pair':sym,'last':px,'high_24h':'87.9','low_24h':'72.4'}]))
                if 'raw.githubusercontent' in u: return await route.fulfill(status=200,content_type='text/plain',headers={'access-control-allow-origin':'*'},body=open('/home/claude/btc/btc.csv').read())
                return await route.abort()
            await pg.route(lambda u: not u.startswith('http://localhost') or 'okx_oi.json' in u,h)
            await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_function("window.__S && window.__S.at && !window.__S.loading",timeout=60000); await pg.wait_for_timeout(400)
            for tab in ['judge','chart','verify','flow','events','stocks']:
                await pg.evaluate(f"location.hash='{tab}'"); await pg.wait_for_timeout(300)
                await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await pg.wait_for_timeout(100)
                res=await pg.evaluate(JS)
                for x in res: print(W,tab,x)
            await pg.close()
        await b.close()
srv=subprocess.Popen(['python3','-m','http.server','8765'],cwd='/home/claude/btc',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try: asyncio.run(main())
finally: srv.terminate()
