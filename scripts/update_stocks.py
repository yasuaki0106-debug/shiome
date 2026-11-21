"""MSTR・COIN の日足終値を取得して data/stocks.json に保存する（標準ライブラリのみ）。"""
import json, time, urllib.request, datetime as dt, sys, os

SYMS = ["MSTR", "COIN", "MSTU", "MSTZ", "CONL"]
UA = {"User-Agent": "Mozilla/5.0 (shiome stock updater)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "stocks.json")

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")

def yahoo(sym):
    last = None
    for host in ("query1", "query2"):
        try:
            j = json.loads(get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{sym}?range=10y&interval=1d&includeAdjustedClose=true"))
            r = j["chart"]["result"][0]
            ts, q = r["timestamp"], r["indicators"]["quote"][0]["close"]
            off = r.get("meta", {}).get("gmtoffset", -18000)
            rows = [[dt.datetime.utcfromtimestamp(t + off).strftime("%Y-%m-%d"), round(c, 4)] for t, c in zip(ts, q) if c]
            if len(rows) > 100:
                return rows
        except Exception as e:
            last = e
            time.sleep(2)
    raise RuntimeError(f"yahoo {sym}: {last}")

def stooq(sym):
    txt = get(f"https://stooq.com/q/d/l/?s={sym.lower()}.us&i=d")
    rows = []
    for line in txt.strip().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 5 and p[4] not in ("", "null"):
            rows.append([p[0], round(float(p[4]), 4)])
    if len(rows) < 100:
        raise RuntimeError(f"stooq {sym}: {txt[:80]}")
    return rows

def main():
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}
    out = {"symbols": {}, "source": "", "updated": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}
    used = set()
    for s in SYMS:
        rows = None
        for name, fn in (("Yahoo Finance", yahoo), ("Stooq", stooq)):
            try:
                rows = fn(s); used.add(name); break
            except Exception as e:
                print("warn:", e, file=sys.stderr)
        if rows is None:
            rows = old.get("symbols", {}).get(s)
            if not rows:
                print(f"error: {s} を取得できません", file=sys.stderr); sys.exit(1)
            print(f"warn: {s} は前回のデータを維持", file=sys.stderr)
        out["symbols"][s] = rows[-1600:]
        print(s, len(rows), rows[-1])
    out["source"] = "・".join(sorted(used)) or old.get("source", "")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))

if __name__ == "__main__":
    main()
