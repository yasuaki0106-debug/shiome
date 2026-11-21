"""米国の現物ビットコインETFの資金の出入り（1日ごと、百万ドル）を Farside Investors の公開の表から取って data/etf_flows.json に保存する。"""
import json, os, re, sys, time, urllib.request, datetime as dt
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "etf_flows.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9"}
rows = []
for url in ["https://farside.co.uk/bitcoin-etf-flow-all-data/", "https://farside.co.uk/btc/"]:
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode("utf-8", "replace")
    except Exception as e:
        print("warn", url, e, file=sys.stderr); continue
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        if len(cells) < 3: continue
        try: d = dt.datetime.strptime(cells[0], "%d %b %Y").date().isoformat()
        except Exception: continue
        v = cells[-1].replace(",", "")
        neg = v.startswith("(") and v.endswith(")"); v = v.strip("()")
        try: f = float(v) * (-1 if neg else 1)
        except Exception: continue
        rows.append([d, f])
    if rows: break
print("rows", len(rows), rows[:2], rows[-2:])
if len(rows) > 50:
    rows = sorted({r[0]: r for r in rows}.values())
    json.dump({"updated": int(time.time()), "flows": rows}, open(OUT, "w"), separators=(",", ":"))
