"""検証用データ：Coinbase（BTC-USD）とBinance（BTCUSDT）の日足、OKXの建玉履歴を取得して research/ に保存する。"""
import json, time, urllib.request, datetime as dt, os, sys
UA = {"User-Agent": "Mozilla/5.0 (shiome research)"}
D = os.path.join(os.path.dirname(__file__), "..", "research")
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: return json.loads(r.read().decode())
def coinbase():
    out = {}; start = dt.datetime(2015, 7, 20, tzinfo=dt.timezone.utc); now = dt.datetime.now(dt.timezone.utc)
    while start < now:
        end = min(start + dt.timedelta(days=299), now)
        try:
            rows = get(f"https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start={start.strftime('%Y-%m-%dT%H:%M:%SZ')}&end={end.strftime('%Y-%m-%dT%H:%M:%SZ')}")
            for t, lo, hi, op, cl, vol in rows: out[dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d")] = [op, hi, lo, cl, vol]
        except Exception as e: print("cb", start, e, file=sys.stderr)
        start = end + dt.timedelta(days=1); time.sleep(0.4)
    return out
def binance():
    out = {}; st = int(dt.datetime(2017, 8, 17, tzinfo=dt.timezone.utc).timestamp() * 1000)
    for _ in range(10):
        rows = get(f"https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime={st}&limit=1000")
        for k in rows: out[dt.datetime.utcfromtimestamp(k[0] / 1000).strftime("%Y-%m-%d")] = [float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5]), float(k[7])]
        if len(rows) < 1000: break
        st = rows[-1][0] + 86400000; time.sleep(0.3)
    return out
def okx_oi():
    try: return get("https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1D&limit=100")
    except Exception as e: return {"error": str(e)}
cb, bn = coinbase(), binance()
days = sorted(set(cb) & set(bn))
with open(os.path.join(D, "premium.csv"), "w") as f:
    f.write("date,cb_close,bn_close,cb_vol,bn_vol_btc,bn_quote_vol\n")
    for d in days: f.write(f"{d},{cb[d][3]},{bn[d][3]},{cb[d][4]},{bn[d][4]},{bn[d][5]}\n")
json.dump(okx_oi(), open(os.path.join(D, "okx_oi_1d.json"), "w"))
print("days", len(days), days[0] if days else None, days[-1] if days else None)
