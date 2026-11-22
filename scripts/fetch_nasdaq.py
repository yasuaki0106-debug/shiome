"""ナスダック総合指数の日足（2014年以降）を data/nasdaq.json に保存。アプリが週足のRSI・CCIを計算して「今どこ？」に出す"""
import json, os, time, urllib.request
UA = {"User-Agent": "Mozilla/5.0"}
u = "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?period1=1388534400&period2=" + str(int(time.time())) + "&interval=1d"
try:
    j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())
    r = j["chart"]["result"][0]
    rows = [[time.strftime("%Y-%m-%d", time.gmtime(t)), round(c, 2)] for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]) if c]
    if len(rows) > 1000:
        json.dump({"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "rows": rows}, open(os.path.join(os.path.dirname(__file__), "..", "data", "nasdaq.json"), "w"), separators=(",", ":"))
        print("nasdaq", len(rows), rows[-1])
except Exception as e:
    print("warn nasdaq", e)
