"""BTC/USD の日足（Bitstamp）を data/btc-usd-daily.csv に追記する（標準ライブラリのみ）。
長期サイクルの計算に使う。確定した日（UTC）だけを入れる。"""
import csv, json, os, sys, time, urllib.request, datetime as dt

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "btc-usd-daily.csv")
UA = {"User-Agent": "Mozilla/5.0 (shiome btc updater)"}
MIRROR = "https://raw.githubusercontent.com/rcaljouw/btc-price-history/main/data/btc-usd-daily.csv"

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8")

def read():
    if not os.path.exists(OUT):
        return []
    return [r for r in csv.reader(open(OUT, encoding="utf-8"))][1:]

def from_bitstamp(start_ts):
    rows, now = [], time.time()
    for _ in range(10):
        j = json.loads(get(f"https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start={int(start_ts)}"))
        o = j["data"]["ohlc"]
        if not o:
            break
        for x in o:
            t = int(x["timestamp"])
            if t + 86400 <= now and float(x["close"]) > 0:
                rows.append([dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), x["open"], x["high"], x["low"], x["close"], x["volume"], "bitstamp"])
        if len(o) < 1000:
            break
        start_ts = int(o[-1]["timestamp"]) + 86400
    return rows

def main():
    rows = read()
    last = rows[-1][0] if rows else "2011-08-17"
    start = dt.datetime.strptime(last, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc).timestamp() + 86400
    new = []
    try:
        new = [r for r in from_bitstamp(start) if r[0] > last]
        print("bitstamp: +%d" % len(new))
    except Exception as e:
        print("warn: bitstamp", e, file=sys.stderr)
        try:
            m = [l.split(",") for l in get(MIRROR).strip().splitlines()[1:]]
            new = [r for r in m if r[0] > last]
            print("mirror: +%d" % len(new))
        except Exception as e2:
            print("warn: mirror", e2, file=sys.stderr)
    if not new:
        return
    seen = {r[0] for r in rows}
    rows += [r for r in new if r[0] not in seen]
    rows.sort(key=lambda r: r[0])
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f); w.writerow(["date", "open", "high", "low", "close", "volume", "source"]); w.writerows(rows)
    print("last:", rows[-1])

if __name__ == "__main__":
    main()
