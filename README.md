# 潮目

ビットコインのテクニカル・出来高・オプション・建玉から、MSTR・COIN のエントリー時期を判定するスマホ向けアプリ。

- アプリ本体：`index.html`（開いた端末から取引所の公開データを直接取得して計算）
- 株価：`.github/workflows/update-stocks.yml` が平日の米国市場終了後に `data/stocks.json` を自動更新
