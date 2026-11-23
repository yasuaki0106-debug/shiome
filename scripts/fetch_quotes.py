"""米国の実際の株価（MSTR・MSTU・COIN・CONL）を、取引時間外の値段（プレ・アフター）も含めて data/quotes.json に保存（1時間ごと）
アプリは、トークン化株式やBTCからの換算より、こちらを優先して指値の計算に使う"""
import json, os, time, urllib.request
UA = {"User-Agent": "Mozilla/5.0"}
out = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "q": {}}
for s in ["MSTR", "MSTU", "COIN", "CONL", "ASST"]:
    try:
        u = f"https://query1.finance.yahoo.com/v8/finance/chart/{s}?range=2d&interval=5m&includePrePost=true"
        j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
        r = j["chart"]["result"][0]; m = r["meta"]; ts = r.get("timestamp") or []; cl = r["indicators"]["quote"][0]["close"]
        last = [(t, c) for t, c in zip(ts, cl) if c]
        t, c = last[-1] if last else (m.get("regularMarketTime"), m.get("regularMarketPrice"))
        out["q"][s] = {"px": round(c, 4), "t": int(t), "reg": round(m.get("regularMarketPrice"), 4), "regT": int(m.get("regularMarketTime") or 0), "prev": m.get("chartPreviousClose")}
    except Exception as e:
        print("warn", s, e)
if out["q"]:
    json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "data", "quotes.json"), "w"), separators=(",", ":"))
    print(out)
