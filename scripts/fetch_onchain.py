"""底の判定に使う指標の履歴を取得して data/ に保存する（毎日更新）。
- 恐怖と強欲指数（alternative.me）
- MVRV（時価総額÷実現時価総額）、取引所外を含む（Coin Metrics の無料API）
- ハッシュレートとマイナー収入（blockchain.com）
ブラウザから直接読めるとは限らないため、ここで控えを作る。"""
import json, os, sys, time, urllib.request
D = os.path.join(os.path.dirname(__file__), "..", "data")
UA = {"User-Agent": "Mozilla/5.0 (shiome onchain)"}
def get(u, t=60):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return json.loads(r.read().decode())
out = {"updated": int(time.time())}
try:
    j = get("https://api.alternative.me/fng/?limit=0&format=json")
    out["fng"] = sorted([[time.strftime("%Y-%m-%d", time.gmtime(int(x["timestamp"]))), int(x["value"])] for x in j["data"]])
except Exception as e: print("warn fng", e, file=sys.stderr)
try:
    rows, nxt = [], "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD&frequency=1d&page_size=10000&start_time=2011-01-01"
    while nxt:
        j = get(nxt); rows += [[x["time"][:10], float(x.get("CapMVRVCur") or "nan")] for x in j.get("data", [])]; nxt = j.get("next_page_url")
    out["mvrv"] = [r for r in rows if r[1] == r[1]]
except Exception as e: print("warn mvrv", e, file=sys.stderr)
for key, chart in [("hash", "hash-rate"), ("minerrev", "miners-revenue")]:
    try:
        j = get(f"https://api.blockchain.info/charts/{chart}?timespan=all&format=json&sampled=false")
        out[key] = [[time.strftime("%Y-%m-%d", time.gmtime(int(p["x"]))), float(p["y"])] for p in j["values"]]
    except Exception as e: print("warn", chart, e, file=sys.stderr)
json.dump(out, open(os.path.join(D, "onchain.json"), "w"), separators=(",", ":"))
print({k: (len(v) if isinstance(v, list) else v) for k, v in out.items()})
