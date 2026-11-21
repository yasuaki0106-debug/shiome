"""自動の点検：変更のたびに、過去の検証の数字と今日の判定が変わっていないかを確かめる。
決めた値（research/expected.json）から外れたら失敗にする。"""
import json, os, subprocess, sys, re, shutil
ROOT = os.path.join(os.path.dirname(__file__), ".."); R = os.path.join(ROOT, "research"); fail = []
exp = json.load(open(os.path.join(R, "expected.json")))
# 1) アプリのコードの文法
for f in ["src/app.js", "src/engine.js"]:
    r = subprocess.run(["node", "--check", os.path.join(ROOT, f)], capture_output=True, text=True)
    if r.returncode: fail.append(f + " の文法エラー: " + r.stderr[:200])
# 2) 公開ページが最新のソースから作られているか
t = open(os.path.join(ROOT, "src", "tpl.html"), encoding="utf8").read().replace("/*__ENGINE__*/", open(os.path.join(ROOT, "src", "engine.js"), encoding="utf8").read()).replace("/*__APP__*/", open(os.path.join(ROOT, "src", "app.js"), encoding="utf8").read())
if t != open(os.path.join(ROOT, "index.html"), encoding="utf8").read(): fail.append("index.html が src から作り直されていません")
# 3) 過去の検証の数字（完了したサイクル）
work = os.path.join(ROOT, "_work"); os.makedirs(work, exist_ok=True)
for f in ["final.js"]: shutil.copy(os.path.join(R, f), work)
shutil.copy(os.path.join(ROOT, "src", "engine.js"), work)
lines = open(os.path.join(ROOT, "data", "btc-usd-daily.csv")).read().strip().split("\n")
open(os.path.join(work, "btc.csv"), "w").write("\n".join([l for l in lines if l[:10] <= exp["asof"] or l.startswith("date")]) + "\n")
for f in ["stocks.json", "onchain.json"]: shutil.copy(os.path.join(ROOT, "data", f), work)
out = subprocess.run(["node", "final.js"], cwd=work, capture_output=True, text=True).stdout
m = re.search(r"買い下がり50%＋確認買い50%\s+(.*)", out)
if not m: fail.append("通しの検証が動きません: " + out[-300:])
else:
    got = dict(re.findall(r"(\w\d{4}):(\d+)", m.group(1)))
    for k, v in exp["e2e"].items():
        g = int(got.get(k, -1))
        if abs(g - v) > max(2, v * 0.01): fail.append(f"通しの検証 {k}: 期待 {v} → 今 {g}")
# 4) 決めた日の判定
r = subprocess.run(["node", os.path.join(ROOT, "scripts", "daily_signal.js")], cwd=work, capture_output=True, text=True, env=dict(os.environ, DRY="1", SIGNAL_CSV=os.path.join(work, "btc.csv"), SIGNAL_NOLOG="1"))
try:
    rec = json.loads(r.stdout.strip().split("\n")[0])
    for k, v in exp["signal"].items():
        g = rec.get(k)
        if (isinstance(v, (int, float)) and abs((g or 0) - v) > 3) or (not isinstance(v, (int, float)) and g != v): fail.append(f"{exp['asof']} の判定 {k}: 期待 {v} → 今 {g}")
except Exception as e: fail.append("毎日の判定が動きません: " + (r.stderr or r.stdout)[-300:])
shutil.rmtree(work, ignore_errors=True)
print("\n".join(fail) if fail else "点検OK")
json.dump({"ok": not fail, "fail": fail}, open(os.path.join(ROOT, "data", "selftest.json"), "w"), ensure_ascii=False)
sys.exit(1 if fail else 0)
