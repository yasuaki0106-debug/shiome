"""関連株のニュースと決算日を data/news.json にまとめる（毎日）。
見出しはGoogleニュースのRSS。中身は読まず、見出しの言葉で種類（指数・規制・決算・増資・格付け・ハッキング）と懸念を付ける。"""
import json, os, re, sys, time, urllib.parse, urllib.request, email.utils, xml.etree.ElementTree as ET
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "news.json")
UA = {"User-Agent": "Mozilla/5.0 (shiome news)", "Accept": "application/json, text/plain, */*"}
def get(u, t=30):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read().decode("utf-8", "replace")
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
def parse(q):
    x = get("https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"}))
    root = ET.fromstring(x); out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip(); link = it.findtext("link") or ""; src = (it.find("source").text if it.find("source") is not None else "")
        if src and title.endswith(" - " + src): title = title[: -len(src) - 3]
        try: t = int(email.utils.parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception: t = 0
        if src.lower().startswith("coinbase") or re.search(r"Price, .* Live Charts", title): continue   # 取引所の銘柄ページなど、ニュースでないもの
        tags = [k for k, rx in TAGS if re.search(rx, title, re.I)]
        out.append({"t": t, "title": title, "src": src, "link": link, "tags": tags, "concern": bool(re.search(CONCERN, title, re.I))})
    out.sort(key=lambda r: -r["t"]); seen = set(); res = []
    for r in out:
        k = re.sub(r"\W+", "", r["title"].lower())[:60]
        if k in seen: continue
        seen.add(k); res.append(r)
    return res[:25]
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
for k, q in Q.items():
    try: out["items"][k] = parse(q)
    except Exception as e:
        print("warn news", k, e, file=sys.stderr); out["items"][k] = old.get("items", {}).get(k, [])
for s in ["MSTR", "COIN"]:
    d = earnings(s)
    if d: out["earn"][s] = d
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print({k: len(v) for k, v in out["items"].items()}, out["earn"])
