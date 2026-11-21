"""OKX（BTC-USDT無期限）の建玉の履歴（4時間ごと）を data/okx_oi.json にためる。
OKXのこの統計APIはブラウザから直接読めないため、ここで控えを作る。最新の値はアプリが直接取る。"""
import json, os, sys, time, urllib.request
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "okx_oi.json")
UA = {"User-Agent": "Mozilla/5.0 (shiome okx updater)"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: return json.loads(r.read().decode())
old = {}
if os.path.exists(OUT):
    try: old = {int(t): v for t, v in json.load(open(OUT))["rows"]}
    except Exception: old = {}
try:
    j = get("https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=4H&limit=100")
    for row in j.get("data", []): old[int(row[0])] = float(row[2])   # [ts, oi(枚), oiCcy(BTC), oiUsd]
except Exception as e:
    print("warn okx", e, file=sys.stderr)
cut = (time.time() - 60 * 86400) * 1000
rows = sorted([[t, v] for t, v in old.items() if t >= cut])
json.dump({"rows": rows, "updated": int(time.time())}, open(OUT, "w"), separators=(",", ":"))
print("rows", len(rows), rows[-1] if rows else None)
