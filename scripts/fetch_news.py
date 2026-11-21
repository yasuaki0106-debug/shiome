"""関連株のニュースと決算日を data/news.json にまとめる（毎日）。
見出しはGoogleニュースのRSS。中身は読まず、見出しの言葉で種類（指数・規制・決算・増資・格付け・ハッキング）と懸念を付ける。"""
import json, os, re, sys, time, urllib.parse, urllib.request, email.utils, xml.etree.ElementTree as ET
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "news.json")
UA = {"User-Agent": "Mozilla/5.0 (shiome news)", "Accept": "application/json, text/plain, */*"}
def get(u, t=30):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read().decode("utf-8", "replace")
QJ = {   # 日本語の記事（訳さずにそのまま使える）
  "MSTR": '(ストラテジー OR マイクロストラテジー OR セイラー) ビットコイン when:30d',
  "COIN": 'コインベース when:30d',
  "REG":  '(暗号資産 OR 仮想通貨 OR ビットコイン) (法案 OR 規制 OR SEC OR 金融庁 OR 議会) when:30d',
}
CONCERN_JA = r"(除外|外れ|格下げ|引き下げ|下方修正|訴訟|提訴|調査|規制強化|増資|希薄化|ハッキング|流出|不正|赤字|減収|急落|暴落|売り推奨)"
Q = {
  "MSTR": '"Strategy" (MSTR OR Saylor OR bitcoin) OR MicroStrategy when:30d',
  "COIN": 'Coinbase (COIN OR stock OR shares) when:30d',
  "REG":  '(crypto OR bitcoin) (bill OR Congress OR SEC OR CFTC OR "market structure" OR CLARITY) when:30d',
}
TAGS = [
  ("指数", r"\b(MSCI|S&P 500|S&P|Nasdaq[- ]100|Russell|FTSE|index|indices|indexes)\b"),
  ("規制・法律", r"\b(SEC|CFTC|regulat\w*|bill|Act|law|lawsuit|sue[sd]?|court|judge|Congress|Senate|ban|charter|license)\b"),
  ("決算", r"\b(earnings|results|quarterly|Q[1-4] (2026|2027)|revenue|guidance)\b"),
  ("増資・社債", r"\b(offering|convertible|notes|ATM|dilut\w*|raise[sd]?|preferred|STRK|STRF|STRD|STRC|debt)\b"),
  ("BTC購入", r"\b(buys|bought|acquire[sd]?|purchase[sd]?|adds)\b.*\b(bitcoin|BTC)\b"),
  ("格付け", r"\b(downgrade[sd]?|upgrade[sd]?|price target|rating|Sell rating|Buy rating)\b"),
  ("ハッキング", r"\b(hack\w*|breach|exploit|stolen|theft)\b"),
]
CONCERN = r"\b(exclu\w*|delet\w*|remov\w*|exit\w*|drop(s|ped)? from|kicked out|downgrade[sd]?|cut[s]? (price )?target|lawsuit|sue[sd]?|charge[sd]?|probe|investigat\w*|ban(s|ned)?|hack\w*|breach|theft|stolen|dilut\w*|offering|plunge[sd]?|slump\w*|miss(es|ed)?|warn\w*|sell rating|underweight|forced sell\w*)\b"
def parse(q, q_key="", lang="en"):
    loc = {"hl": "en-US", "gl": "US", "ceid": "US:en"} if lang == "en" else {"hl": "ja", "gl": "JP", "ceid": "JP:ja"}
    x = get("https://news.google.com/rss/search?" + urllib.parse.urlencode(dict({"q": q}, **loc)))
    root = ET.fromstring(x); out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip(); link = it.findtext("link") or ""; src = (it.find("source").text if it.find("source") is not None else "")
        if src and title.endswith(" - " + src): title = title[: -len(src) - 3]
        try: t = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception: t = 0
        if src.lower().startswith("coinbase") or re.search(r"Price, .* Live Charts|Tokenized Stock\)", title): continue   # 取引所の銘柄ページなど、ニュースでないもの
        if q_key == "REG" and not re.search(r"crypto|bitcoin|BTC|stablecoin|digital asset|token", title, re.I): continue   # 暗号資産と関係ない見出し
        tags = [k for k, rx in TAGS if re.search(rx, title, re.I)]
        conc = bool(re.search(CONCERN, title, re.I)) if lang == "en" else bool(re.search(CONCERN_JA, title))
        if lang == "ja": tags = [k for k, rx in [("指数", r"指数|MSCI|S&P"), ("規制・法律", r"規制|法案|法律|SEC|金融庁|訴訟|議会"), ("決算", r"決算|売上|業績"), ("増資・社債", r"増資|社債|転換|優先株|希薄化"), ("BTC購入", r"買い増し|追加購入|購入"), ("格付け", r"格下げ|格上げ|目標株価"), ("ハッキング", r"ハッキング|流出|不正アクセス")] if re.search(rx, title)]
        out.append({"t": t, "title": title, "src": src, "link": link, "tags": tags, "concern": conc, "lang": lang})
    out.sort(key=lambda r: -r["t"]); seen = set(); res = []
    for r in out:
        k = re.sub(r"\W+", "", r["title"].lower())[:60]
        if k in seen: continue
        seen.add(k); res.append(r)
    return res[:25]
TR = {}
def prep(t): return re.sub(r"\bStrategy\b(?!\s+(to|for|of)\b)", "MicroStrategy", t)   # 会社名のStrategyが「戦略」と訳されないように
def mymemory(t):
    u = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode({"q": prep(t)[:450], "langpair": "en|ja"})
    j = json.loads(get(u, 20)); r = (j.get("responseData") or {}).get("translatedText")
    if r and j.get("responseStatus") in (200, "200") and "MYMEMORY WARNING" not in r: return r
    return None
def translate_all(titles):
    """まだ訳していない見出しを、まとめて少ない回数で訳す（Googleの翻訳。失敗したら英語のまま）"""
    todo = [t for t in dict.fromkeys(titles) if t not in TR]
    for k in range(0, len(todo), 12):
        chunk = todo[k:k + 12]
        for attempt in range(3):
            try:
                u = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode({"client": "gtx", "sl": "en", "tl": "ja", "dt": "t", "q": "\n".join(prep(t) for t in chunk)})
                j = json.loads(get(u, 20)); lines = "".join(seg[0] for seg in j[0] if seg and seg[0]).split("\n")
                if len(lines) == len(chunk):
                    for t, l in zip(chunk, lines): TR[t] = l.strip()
                break
            except Exception as e:
                print("warn translate", e, file=sys.stderr); time.sleep(5 * (attempt + 1))
        time.sleep(1.5)
    left = [t for t in todo if t not in TR][:40]   # Googleの翻訳が使えないときは、別の無料の翻訳で新しい見出しだけ訳す
    for t in left:
        try:
            r = mymemory(t)
            if r: TR[t] = r
        except Exception as e: print("warn mymemory", e, file=sys.stderr); break
        time.sleep(1)
def earnings(sym):
    try:
        j = json.loads(get(f"https://api.nasdaq.com/api/analyst/{sym}/earnings-date"))
        txt = json.dumps(j.get("data") or {})
        m = re.search(r"([A-Z][a-z]{2} \d{1,2}, \d{4})", txt)
        if m: return time.strftime("%Y-%m-%d", time.strptime(m.group(1), "%b %d, %Y"))
    except Exception as e: print("warn earnings", sym, e, file=sys.stderr)
    return None
old = {}
if os.path.exists(OUT):
    try: old = json.load(open(OUT))
    except Exception: old = {}
out = {"updated": int(time.time()), "items": {}, "earn": old.get("earn", {})}
for k, v in old.get("items", {}).items():
    for r in v:
        if r.get("ja") and "戦略" not in r["ja"]: TR[r["title"]] = r["ja"]   # 前回の訳を使う（会社名を「戦略」と訳したものは訳し直す）
for k, q in Q.items():
    try:
        out["items"][k] = parse(q, k)
    except Exception as e:
        print("warn news", k, e, file=sys.stderr); out["items"][k] = old.get("items", {}).get(k, [])
for k, q in QJ.items():
    try: out["items"][k + "_JA"] = parse(q, k, "ja")[:15]
    except Exception as e: print("warn news ja", k, e, file=sys.stderr); out["items"][k + "_JA"] = old.get("items", {}).get(k + "_JA", [])
translate_all([r["title"] for kk, v in out["items"].items() if not kk.endswith("_JA") for r in v])
for kk, v in out["items"].items():
    for r in v: r["ja"] = r["title"] if kk.endswith("_JA") else TR.get(r["title"])
for s in ["MSTR", "COIN"]:
    d = earnings(s)
    if d: out["earn"][s] = d
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out["items"].items()}, out["earn"])
