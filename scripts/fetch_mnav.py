"""Strategy（MSTR）の mNAV（株の価値が保有BTCの何倍か）を、strategy.com の公開ページから毎日記録する。
過去の履歴は無料では取れないため、ここで記録をためて、後から効くかを検証する。"""
import json, os, re, sys, time, urllib.request
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "mnav.json")
UA = {"User-Agent": "Mozilla/5.0 (shiome mnav)"}
try:
    html = urllib.request.urlopen(urllib.request.Request("https://www.strategy.com/", headers=UA), timeout=30).read().decode("utf-8", "replace")
except Exception as e:
    print("warn", e, file=sys.stderr); sys.exit(0)
txt = re.sub(r"<[^>]+>", " ", html); txt = re.sub(r"\s+", " ", txt)
def num(rx):
    m = re.search(rx, txt); return float(m.group(1).replace(",", "")) if m else None
rec = {"d": time.strftime("%Y-%m-%d", time.gmtime()), "mnav": num(r"mNAV\s+([0-9.]+)x"), "btc": num(r"BTC\s+([0-9,]{6,})"), "price": num(r"MSTR Price\s+\$([0-9.,]+)")}
print(rec)
if rec["mnav"] is None:
    # ページが画面描画型で数字が取れない場合は、ページ内のJSONを探す
    m = re.search(r'"mnav"\s*:\s*([0-9.]+)', html, re.I)
    if m: rec["mnav"] = float(m.group(1))
if rec["mnav"] is None: print("warn: mNAVが見つからない", file=sys.stderr); sys.exit(0)
old = []
if os.path.exists(OUT):
    try: old = json.load(open(OUT))
    except Exception: old = []
old = [r for r in old if r["d"] != rec["d"]] + [rec]
json.dump(old[-2000:], open(OUT, "w"), separators=(",", ":"))
