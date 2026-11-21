"""会話の中で今の相場を確認するための控え。Coinbase（BTC-USD）の1時間足を直近72時間ぶん取って research/live.json に保存する。"""
import json, os, time, urllib.request, datetime as dt
UA = {"User-Agent": "Mozilla/5.0 (shiome live)"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: return json.loads(r.read().decode())
end = dt.datetime.now(dt.timezone.utc); start = end - dt.timedelta(hours=72)
rows = get(f"https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start={start.strftime('%Y-%m-%dT%H:%M:%SZ')}&end={end.strftime('%Y-%m-%dT%H:%M:%SZ')}")
tk = get("https://api.exchange.coinbase.com/products/BTC-USD/ticker")
out = {"at": end.strftime("%Y-%m-%dT%H:%M:%SZ"), "price": float(tk["price"]), "h1": sorted([[r[0], r[3], r[2], r[1], r[4]] for r in rows])}  # [t, open, high, low, close]
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "research", "live.json"), "w"))
print(out["at"], out["price"], len(out["h1"]))
