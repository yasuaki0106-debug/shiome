"""コインベース・プレミアムの日次履歴を data/cb-premium.csv に保存する（標準ライブラリのみ）。
Coinbase BTC-USD と Binance BTC-USDT の日足終値（00:00 UTC 区切り）の差。"""
import csv, json, os, sys, time, urllib.request, datetime as dt

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "cb-premium.csv")
UA = {"User-Agent": "Mozilla/5.0 (shiome premium updater)"}
START = dt.datetime(2017, 8, 17, tzinfo=dt.timezone.utc)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def day(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")

def coinbase(since):
    out, cur, now = {}, since, dt.datetime.now(dt.timezone.utc)
    while cur < now:
        end = min(cur + dt.timedelta(days=299), now)
        rows = get("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=%s&end=%s" % (cur.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")))
        for t, lo, hi, op, cl, vol in rows:
            if t + 86400 <= time.time():
                out[day(t)] = cl
        cur = end; time.sleep(0.4)
    return out

def binance(since):
    out, st = {}, int(since.timestamp() * 1000)
    for host in ("https://data-api.binance.vision", "https://api.binance.com"):
        try:
            while True:
                k = get(host + "/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=%d&limit=1000" % st)
                if not k:
                    break
                for x in k:
                    if x[0] / 1000 + 86400 <= time.time():
                        out[day(x[0] / 1000)] = float(x[4])
                if len(k) < 1000:
                    break
                st = k[-1][0] + 86400000
            return out
        except Exception as e:
            print("warn: binance", host, e, file=sys.stderr)
    return out

def main():
    old = {}
    if os.path.exists(OUT):
        for r in list(csv.reader(open(OUT, encoding="utf-8")))[1:]:
            old[r[0]] = r
    since = START if not old else dt.datetime.strptime(max(old), "%Y-%m-%d").replace(tzinfo=dt.timezone.utc) - dt.timedelta(days=3)
    cb, bn = coinbase(since), binance(since)
    print("coinbase", len(cb), "binance", len(bn))
    for k in sorted(set(cb) & set(bn)):
        old[k] = [k, "%.2f" % cb[k], "%.2f" % bn[k], "%.6f" % (cb[k] / bn[k] - 1)]
    if not old:
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(["date", "coinbase", "binance", "premium"])
        for k in sorted(old):
            w.writerow(old[k])
    print("last:", old[max(old)])

if __name__ == "__main__":
    main()
