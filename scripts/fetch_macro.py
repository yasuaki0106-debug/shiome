"""検証用：ナスダック・S&P500・金・ドル指数・NVIDIA の日足と、米国のマネーサプライ（M2）を research/macro.json に保存"""
import json, os, time, urllib.request, csv, io
UA = {"User-Agent": "Mozilla/5.0"}
def yahoo(sym):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1=1388534400&period2=" + str(int(time.time())) + "&interval=1d"
    j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())
    r = j["chart"]["result"][0]; ts = r["timestamp"]; cl = r["indicators"]["quote"][0]["close"]
    return [[time.strftime("%Y-%m-%d", time.gmtime(t)), round(c, 4)] for t, c in zip(ts, cl) if c]
import urllib.parse
out = {}
for k, s in [("NASDAQ", "^IXIC"), ("SP500", "^GSPC"), ("GOLD", "GC=F"), ("DXY", "DX-Y.NYB"), ("NVDA", "NVDA"), ("VIX", "^VIX"), ("US10Y", "^TNX")]:
    try: out[k] = yahoo(s); print(k, len(out[k]))
    except Exception as e: print("warn", k, e)
try:
    t = urllib.request.urlopen(urllib.request.Request("https://fred.stlouisfed.org/graph/fredgraph.csv?id=M2SL", headers=UA), timeout=60).read().decode()
    out["M2"] = [[r[0], float(r[1])] for r in csv.reader(io.StringIO(t)) if r and r[0][:2] in ("19", "20") and r[1] not in ("", ".")]; print("M2", len(out["M2"]))
except Exception as e: print("warn M2", e)
try:
    j = json.loads(urllib.request.urlopen(urllib.request.Request("https://api.alternative.me/fng/?limit=0&format=json", headers=UA), timeout=60).read())
    out["FNG"] = sorted([[time.strftime("%Y-%m-%d", time.gmtime(int(x["timestamp"]))), int(x["value"])] for x in j["data"]]); print("FNG", len(out["FNG"]))
except Exception as e: print("warn FNG", e)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "research", "macro.json"), "w"), separators=(",", ":"))
