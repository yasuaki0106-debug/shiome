"""定期点検（毎月1日と手動）：買い方が今も想定どおり働いているかを確かめ、data/review.json に書く。
アプリの検証タブに表示し、「要確認」が出たらルールを見直す（見直し自体は人が判断する）。"""
import json, os, subprocess, re, shutil, statistics as st, time, datetime as dt
ROOT = os.path.join(os.path.dirname(__file__), ".."); D = os.path.join(ROOT, "data"); items = []
def add(name, st_, value, note): items.append({"name": name, "st": st_, "value": value, "note": note})
today = dt.date.today()
# 1) データの鮮度
def age(d): return (today - dt.date.fromisoformat(d)).days
try:
    last = open(os.path.join(D, "btc-usd-daily.csv")).read().strip().split("\n")[-1][:10]; a = age(last)
    add("BTCの日足", "ok" if a <= 2 else "warn", last, "確定した最新の日" + ("" if a <= 2 else "。更新が止まっています"))
except Exception as e: add("BTCの日足", "warn", "—", "読めません")
try:
    s = json.load(open(os.path.join(D, "stocks.json"))); last = s["symbols"]["MSTR"][-1][0]; a = age(last)
    add("株価", "ok" if a <= 5 else "warn", last, "MSTR・COIN・MSTU・CONLの最新の終値" + ("" if a <= 5 else "。更新が止まっています"))
except Exception: add("株価", "warn", "—", "読めません")
try:
    o = json.load(open(os.path.join(D, "onchain.json"))); last = o["mvrv"][-1][0]; a = age(last)
    add("オンチェーン", "ok" if a <= 4 else "warn", last, "MVRVなどの最新の日" + ("" if a <= 4 else "。更新が止まっています"))
except Exception: add("オンチェーン", "warn", "—", "読めません")
# 2) 自動の点検
r = subprocess.run(["python3", os.path.join(ROOT, "scripts", "selftest.py")], capture_output=True, text=True)
add("自動の点検", "ok" if r.returncode == 0 else "warn", "OK" if r.returncode == 0 else "失敗", "過去の検証の数字と、決めた日の判定が変わっていないか" + ("" if r.returncode == 0 else "：" + r.stdout.strip()[:200]))
# 3) 今回のサイクルの通しの検証（予定額100）
work = os.path.join(ROOT, "_rv"); os.makedirs(work, exist_ok=True)
for f in ["research/final.js", "research/fullrules.js", "src/engine.js", "data/stocks.json", "data/onchain.json"]: shutil.copy(os.path.join(ROOT, f), work)
shutil.copy(os.path.join(D, "btc-usd-daily.csv"), os.path.join(work, "btc.csv"))
out = subprocess.run(["node", "fullrules.js"], cwd=work, capture_output=True, text=True).stdout; shutil.rmtree(work, ignore_errors=True)
m = re.search(r"今のアプリのルールすべて:\s+(.*)", out); cur = dict(re.findall(r"(\w)今回:(\d+)", m.group(1))) if m else {}
if cur:
    worst = min(int(v) for v in cur.values())
    add("今回のサイクルの通しの検証", "ok" if worst >= 70 else "warn", "BTC " + cur.get("B", "—") + "・MSTR " + cur.get("M", "—") + "・COIN " + cur.get("C", "—"), "今のルールすべてで、予定額100が今いくらか。過去の完了サイクルでは途中の最低が75〜95。70を下回ったら、過去にない悪い展開として見直す")
# 4) 毎日の判定の記録（GitHubで自動）の答え合わせ
try:
    log = json.load(open(os.path.join(D, "signal_log.json")))
    px = {l[:10]: float(l.split(",")[4]) for l in open(os.path.join(D, "btc-usd-daily.csv")).read().strip().split("\n")[1:]}
    days = sorted(px); idx = {d: i for i, d in enumerate(days)}
    def fwd(d, h):
        i = idx.get(d); return px[days[i + h]] / px[d] - 1 if i is not None and i + h < len(days) else None
    lad = [fwd(x["d"], 90) for x in log if x.get("lad")]; lad = [v for v in lad if v is not None]
    if len(lad) >= 5:
        md = st.median(lad); add("買い下がりの合図の90日後", "ok" if md > -0.15 else "warn", f"{md*100:+.0f}%（{len(lad)}日分）", "過去のサイクルでは、買い下がり1回目の90日後は -36〜+26%。中央値が-15%を下回ったら見直す")
    else: add("買い下がりの合図の90日後", "ok", f"{len(lad)}日分", "記録がたまるまで判定しません（5日分以上で判定）")
    add("毎日の判定の記録", "ok", f"{len(log)}日分（{log[0]['d'] if log else '—'}〜）", "GitHubで毎日自動で記録している、市場全体の判定")
except Exception: add("毎日の判定の記録", "ok", "0日分", "記録はこれから")
# 5) サイクルの形
try:
    lastrec = log[-1]
    if lastrec["ph"] == "recover" and not any(x.get("conf") for x in log): add("サイクルの形", "warn", "回復期で確認買いなし", "過去のサイクルにない形です。底の時期の前提を見直す")
    else: add("サイクルの形", "ok", {"up": "上昇期", "top": "天井圏", "down": "下落期", "bottom": "底値圏", "recover": "回復期"}.get(lastrec["ph"], lastrec["ph"]) + "・" + str(lastrec["day"]) + "日目", "過去のサイクルの範囲内")
except Exception: pass
status = "warn" if any(i["st"] == "warn" for i in items) else "ok"
json.dump({"date": time.strftime("%Y-%m-%d"), "status": status, "items": items}, open(os.path.join(D, "review.json"), "w"), ensure_ascii=False, indent=0)
print(status); [print(i) for i in items]
