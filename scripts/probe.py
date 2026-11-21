"""各取引所の公開APIに接続できるか、ブラウザから読める設定（CORS）かを確かめる（診断用）。"""
import json, urllib.request
URLS = {
 "bybit_tickers": "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
 "bybit_oi": "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=4h&limit=3",
 "bybit_ratio": "https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=4h&limit=3",
 "okx_oi": "https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP",
 "okx_fund": "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",
 "okx_oihist": "https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=4H",
 "okx_ls": "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=4H",
 "coinbase": "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
 "deribit_perp": "https://www.deribit.com/api/v2/public/get_book_summary_by_instrument?instrument_name=BTC-PERPETUAL",
 "binance_fapi": "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
 "bitget": "https://api.bitget.com/api/v2/mix/market/open-interest?symbol=BTCUSDT&productType=usdt-futures",
}
out = {}
for k, u in URLS.items():
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0", "Origin": "https://yasuaki0106-debug.github.io"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8")[:300]
            out[k] = {"status": r.status, "cors": r.headers.get("Access-Control-Allow-Origin"), "body": body}
    except Exception as e:
        hdr = getattr(e, "headers", None)
        out[k] = {"error": str(e)[:120], "cors": hdr.get("Access-Control-Allow-Origin") if hdr else None}
# Hyperliquid (POST)
try:
    req = urllib.request.Request("https://api.hyperliquid.xyz/info", data=json.dumps({"type": "metaAndAssetCtxs"}).encode(), headers={"Content-Type": "application/json", "Origin": "https://yasuaki0106-debug.github.io"})
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.loads(r.read().decode()); i = [u["name"] for u in j[0]["universe"]].index("BTC")
        out["hyperliquid"] = {"status": r.status, "cors": r.headers.get("Access-Control-Allow-Origin"), "btc": j[1][i]}
except Exception as e:
    out["hyperliquid"] = {"error": str(e)[:120]}
json.dump(out, open("data/probe.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False)[:3000])
