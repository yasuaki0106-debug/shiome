(function () {
'use strict';
const E = window.Engine, DAY = 864e5;
const $ = s => document.querySelector(s);
const LS = {
  get(k, def) { try { const v = localStorage.getItem('shiome.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('shiome.' + k, JSON.stringify(v)); } catch (e) { /* 容量超過などは無視 */ } },
  del(k) { try { localStorage.removeItem('shiome.' + k); } catch (e) { /* noop */ } }
};
const S = { sel: 'm', range: 365, tab: 'judge', status: {}, cfg: LS.get('cfg', { src: 'auto', tdKey: '' }), stocks: {}, loading: false };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = x => x != null && x === x && isFinite(x);
const usd = x => ok(x) ? '$' + Math.round(x).toLocaleString('en-US') : '—';
const usd2 = x => ok(x) ? '$' + x.toFixed(2) : '—';
const kfmt = v => v >= 1e5 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0);
const pc = (x, dg, sign) => { if (!ok(x)) return '—'; let t = (x * 100).toFixed(dg == null ? 1 : dg); if (+t === 0) t = t.replace('-', ''); return (sign !== false && +t > 0 ? '+' : '') + t + '%'; };
const dkey = t => new Date(t).toISOString().slice(0, 10);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const md = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); };
const ymd = t => { const d = new Date(t); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); };
const mdw = t => { const d = new Date(t); return md(t) + '（' + WD[d.getDay()] + '）'; };
const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const ORDER = ['avoid', 'wait', 'try', 'buy'];

async function jget(url, ms) {
  const c = new AbortController(), id = setTimeout(() => c.abort(), ms || 15000);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(id); }
}
async function tget(url, ms) {
  const c = new AbortController(), id = setTimeout(() => c.abort(), ms || 20000);
  try { const r = await fetch(url, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(id); }
}

/* ================= data loaders ================= */
const SRCNAME = { binance: 'Binance（BTC/USDT 現物）', bitstamp: 'Bitstamp（BTC/USD）', kraken: 'Kraken（BTC/USD）' };
const LOADERS = {
  async binance(cached) {
    let rows = cached ? cached.slice(0, -1) : [];
    let start = rows.length ? rows[rows.length - 1][0] + DAY : Date.UTC(2017, 7, 17);
    let lastErr;
    for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
      try {
        const add = []; let st = start;
        for (let i = 0; i < 8; i++) {
          const k = await jget(host + '/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=' + st + '&limit=1000');
          if (!Array.isArray(k)) throw new Error('形式が違います');
          k.forEach(x => add.push([+x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]));
          if (k.length < 1000) break; st = +k[k.length - 1][0] + DAY;
        }
        return rows.concat(add);
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  },
  async bitstamp() {
    return (await loadCsv()).filter(p => p[0] >= '2014-01-01').map(p => [Date.parse(p[0] + 'T00:00:00Z'), +p[1], +p[2], +p[3], +p[4], +p[5]]);
  },
  async kraken() {
    const j = await jget('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440');
    const key = Object.keys(j.result || {}).find(k => k !== 'last'); if (!key) throw new Error('形式が違います');
    return j.result[key].map(x => [x[0] * 1000, +x[1], +x[2], +x[3], +x[4], +x[6]]);
  }
};
async function loadDaily() {
  const cache = LS.get('daily', null), pref = S.cfg.src;
  const order = pref === 'bitstamp' ? ['bitstamp', 'binance', 'kraken'] : pref === 'binance' ? ['binance', 'bitstamp', 'kraken'] : ['binance', 'bitstamp', 'kraken'];
  const errs = [];
  for (const src of order) {
    try {
      const fresh = src === 'bitstamp' && cache && cache.src === src && Date.now() - cache.at < 36e5;
      const rows = fresh ? cache.rows : await LOADERS[src](cache && cache.src === src ? cache.rows : null);
      if (rows && rows.length > 300) {
        const at = fresh ? cache.at : Date.now();
        if (!fresh) LS.set('daily', { src, rows, at });
        S.status.price = { ok: true, name: '価格・出来高', note: SRCNAME[src] + '、' + rows.length + '日分' + (errs.length ? '（' + errs.join('、') + ' は取得できず切り替え）' : '') };
        return { src, rows, at, live: true };
      }
      errs.push(SRCNAME[src]);
    } catch (e) { errs.push(SRCNAME[src]); }
  }
  if (cache) { S.status.price = { ok: false, name: '価格・出来高', note: '取得できません。' + ymd(cache.at) + ' に保存したデータを表示中' }; return cache; }
  throw new Error('価格データを取得できません。通信環境を確認して、右上の更新ボタンを押してください。');
}
const CSV_OWN = 'data/btc-usd-daily.csv', CSV_EXT = 'https://raw.githubusercontent.com/rcaljouw/btc-price-history/main/data/btc-usd-daily.csv';
async function loadCsv() { // 自分のリポジトリの控えを先に見て、古ければ外部の控えも見る。新しい方を使う
  const parse = txt => txt.trim().split('\n').slice(1).map(l => l.split(',')).filter(p => p.length >= 6 && +p[4] > 0);
  let a = null, b = null;
  try { a = parse(await tget(CSV_OWN + '?t=' + Math.floor(Date.now() / 36e5))); } catch (e) { /* 自前の控えなし */ }
  const fresh = a && a.length > 2000 && Date.now() - Date.parse(a[a.length - 1][0]) < 2.6 * DAY;
  if (!fresh) { try { b = parse(await tget(CSV_EXT)); } catch (e) { /* 外部も不可 */ } }
  const best = [a, b].filter(x => x && x.length > 2000).sort((x, y) => (x[x.length - 1][0] < y[y.length - 1][0] ? 1 : -1))[0];
  if (!best) throw new Error('csv');
  return best;
}
async function loadLong() {
  const c = LS.get('long', null); if (c && Date.now() - c.at < 6 * 36e5) return c.rows;
  const rows = (await loadCsv()).filter(p => p[0] >= '2012-01-01').map(p => [Date.parse(p[0] + 'T00:00:00Z'), +p[4]]);
  if (rows.length < 2000) throw new Error('short');
  LS.set('long', { at: Date.now(), rows }); return rows;
}
async function loadHourly() { // 直近8日ほどの1時間足。米国株の引けの時刻のBTC価格を知るために使う
  let lastErr;
  for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    try { const k = await jget(host + '/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=200'); if (!Array.isArray(k) || !k.length) throw new Error('empty'); const m = new Map(); k.forEach(x => m.set(+x[0], +x[4])); return m; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const DB = 'https://www.deribit.com/api/v2/public/';
async function loadOptions() {
  const [bs, ix] = await Promise.all([jget(DB + 'get_book_summary_by_currency?currency=BTC&kind=option', 20000), jget(DB + 'get_index_price?index_name=btc_usd')]);
  if (!bs.result || !bs.result.length) throw new Error('empty');
  return { list: bs.result, spot: ix.result.index_price };
}
async function loadDvol() {
  const c = LS.get('dvol', {}), keys = Object.keys(c).sort();
  const start = keys.length ? Date.parse(keys[keys.length - 1]) - 2 * DAY : Date.UTC(2021, 2, 1);
  let end = Date.now();
  for (let i = 0; i < 8; i++) {
    const j = await jget(DB + 'get_volatility_index_data?currency=BTC&start_timestamp=' + start + '&end_timestamp=' + end + '&resolution=1D');
    const r = j.result || {}, data = r.data || [];
    data.forEach(x => { c[dkey(x[0])] = +x[4]; });
    if (!r.continuation || !data.length || r.continuation <= start) break; end = r.continuation;
  }
  LS.set('dvol', c); return c;
}
const FB = 'https://fapi.binance.com';
async function loadFunding() {
  const c = LS.get('fund', { last: 0, days: {} });
  let start = c.last ? c.last + 1 : Date.UTC(2019, 8, 1);
  for (let i = 0; i < 12; i++) {
    const a = await jget(FB + '/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=' + start + '&limit=1000');
    if (!Array.isArray(a) || !a.length) break;
    a.forEach(x => { const k = dkey(+x.fundingTime), o = c.days[k] || (c.days[k] = [0, 0]); o[0] += +x.fundingRate; o[1]++; c.last = Math.max(c.last, +x.fundingTime); });
    if (a.length < 1000) break; start = c.last + 1;
  }
  LS.set('fund', c); return c;
}
async function loadFutures() {
  const q = '?symbol=BTCUSDT&period=4h&limit=180';
  const r = await Promise.allSettled([
    jget(FB + '/fapi/v1/premiumIndex?symbol=BTCUSDT'), jget(FB + '/futures/data/openInterestHist' + q),
    jget(FB + '/futures/data/globalLongShortAccountRatio' + q), jget(FB + '/futures/data/topLongShortPositionRatio' + q)
  ]);
  const val = i => r[i].status === 'fulfilled' ? r[i].value : null, out = {};
  if (val(0) && val(0).lastFundingRate != null) { out.fundNow = +val(0).lastFundingRate; out.mark = +val(0).markPrice; }
  if (Array.isArray(val(1))) out.oi = val(1).map(x => ({ t: +x.timestamp, oi: +x.sumOpenInterest, px: +x.sumOpenInterestValue / +x.sumOpenInterest })).filter(x => x.oi > 0 && x.px > 0);
  if (Array.isArray(val(2))) out.ls = val(2).map(x => ({ t: +x.timestamp, r: +x.longShortRatio }));
  if (Array.isArray(val(3))) out.top = val(3).map(x => ({ t: +x.timestamp, r: +x.longShortRatio }));
  if (!out.oi && out.fundNow == null) throw new Error('empty');
  return out;
}
async function loadOkx() {
  const [oi, fr] = await Promise.all([jget('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP'), jget('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP')]);
  const o = oi.data && oi.data[0], f = fr.data && fr.data[0]; if (!o) throw new Error('empty');
  let hist = null; try { const h = await jget('data/okx_oi.json?t=' + Math.floor(Date.now() / 6e5)); if (h && Array.isArray(h.rows)) hist = h.rows; } catch (e) { /* 履歴の控えなし */ }
  return { oi: +o.oiCcy, oiUsd: +o.oiUsd, t: +o.ts, fund: f ? +f.fundingRate : NaN, hist };
}
async function loadBybit() {
  const q = 'category=linear&symbol=BTCUSDT';
  const [tk, oh, ar] = await Promise.allSettled([jget('https://api.bybit.com/v5/market/tickers?' + q), jget('https://api.bybit.com/v5/market/open-interest?' + q + '&intervalTime=4h&limit=200'), jget('https://api.bybit.com/v5/market/account-ratio?' + q + '&period=4h&limit=180')]);
  const t = tk.status === 'fulfilled' && tk.value.result && tk.value.result.list && tk.value.result.list[0]; if (!t) throw new Error('empty');
  const out = { oi: +t.openInterest, oiUsd: +t.openInterestValue, fund: +t.fundingRate };
  if (oh.status === 'fulfilled' && oh.value.result) out.hist = oh.value.result.list.map(x => [+x.timestamp, +x.openInterest]);
  if (ar.status === 'fulfilled' && ar.value.result) out.ls = ar.value.result.list.map(x => ({ t: +x.timestamp, r: +x.buyRatio / Math.max(1e-9, +x.sellRatio) }));
  return out;
}
async function loadOnchain() { // 恐怖と強欲指数・MVRV・ハッシュレート・マイナー収入（リポジトリの控え＋恐怖指数の最新値）
  const j = await jget('data/onchain.json?t=' + Math.floor(Date.now() / 36e5), 30000);
  try { const f = await jget('https://api.alternative.me/fng/?limit=3'); (f.data || []).forEach(x => { const k = dkey(+x.timestamp * 1000); if (j.fng && !j.fng.some(r => r[0] === k)) j.fng.push([k, +x.value]); }); } catch (e) { /* 最新値なし */ }
  return j;
}
async function loadCoinbase() {
  const [tk, cd] = await Promise.all([jget('https://api.exchange.coinbase.com/products/BTC-USD/ticker'), jget('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400')]);
  const days = {}; (cd || []).forEach(x => { days[dkey(x[0] * 1000)] = +x[4]; });
  return { now: +tk.price, days };
}
async function loadDeribitPerp() {
  const j = await jget(DB + 'get_book_summary_by_currency?currency=BTC&kind=future');
  const p = (j.result || []).find(x => x.instrument_name === 'BTC-PERPETUAL'); if (!p) throw new Error('empty');
  return { fundNow: +p.funding_8h, mark: +p.mark_price };
}
async function loadStockRepo() {
  const txt = await tget('data/stocks.json?t=' + Math.floor(Date.now() / 6e5), 15000);
  const j = JSON.parse(txt); if (!j || !j.symbols) throw new Error('empty');
  return j;
}
async function loadStock(sym) {
  const today = dkey(Date.now()), c = LS.get('stk.' + sym, null);
  if (c && c.day === today && c.key === S.cfg.tdKey) return c.vals;
  const j = await jget('https://api.twelvedata.com/time_series?symbol=' + sym + '&interval=1day&outputsize=1500&apikey=' + encodeURIComponent(S.cfg.tdKey), 20000);
  if (j.status === 'error' || !Array.isArray(j.values)) throw new Error(j.message || '取得できません');
  const vals = j.values.map(x => [x.datetime.slice(0, 10), +x.close]).filter(x => x[1] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1);
  LS.set('stk.' + sym, { day: today, key: S.cfg.tdKey, vals }); return vals;
}

/* ================= events ================= */
const U = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi || 0);
const BUILTIN = [
  [U(2026, 12, 4, 13, 30), '米雇用統計（11月分）', 3], [U(2026, 12, 9, 19), 'FOMC 政策金利発表', 3], [U(2026, 12, 10, 13, 30), '米CPI（11月分）', 3],
  [U(2027, 1, 8, 13, 30), '米雇用統計（12月分）', 3], [U(2027, 1, 13, 13, 30), '米CPI（12月分）', 3], [U(2027, 1, 27, 19), 'FOMC 政策金利発表', 3],
  [U(2027, 2, 5, 13, 30), '米雇用統計（1月分）', 3], [U(2027, 2, 11, 13, 30), '米CPI（1月分）', 3],
  [U(2027, 3, 5, 13, 30), '米雇用統計（2月分）', 3], [U(2027, 3, 10, 13, 30), '米CPI（2月分）', 3], [U(2027, 3, 17, 18), 'FOMC 政策金利発表', 3],
  [U(2027, 4, 2, 12, 30), '米雇用統計（3月分）', 3], [U(2027, 4, 13, 12, 30), '米CPI（3月分）', 3], [U(2027, 4, 28, 18), 'FOMC 政策金利発表', 3],
  [U(2027, 5, 12, 12, 30), '米CPI（4月分）', 3], [U(2027, 6, 9, 18), 'FOMC 政策金利発表', 3], [U(2027, 6, 10, 12, 30), '米CPI（5月分）', 3],
  [U(2027, 7, 2, 12, 30), '米雇用統計（6月分）', 3], [U(2027, 7, 14, 12, 30), '米CPI（6月分）', 3], [U(2027, 7, 28, 18), 'FOMC 政策金利発表', 3],
  [U(2027, 9, 14, 12, 30), '米CPI（8月分）', 3], [U(2027, 9, 15, 18), 'FOMC 政策金利発表', 3], [U(2027, 11, 17, 19), 'FOMC 政策金利発表', 3],
  [U(2027, 12, 3, 13, 30), '米雇用統計（11月分）', 3], [U(2027, 12, 10, 13, 30), '米CPI（11月分）', 3]
].map(x => ({ t: x[0], title: x[1], impact: x[2], kind: 'macro' }));
function allEvents() {
  const now = Date.now(), custom = LS.get('events', []).map((e, i) => Object.assign({ custom: true, idx: i }, e));
  return BUILTIN.concat(E.autoExpiries(now, 4), custom).filter(e => e.t > now - 6 * 36e5).sort((a, b) => a.t - b.t);
}

/* ================= compute ================= */
function setData(rows, src, asOf) {
  // asOf: そのデータを取得した時刻。取得時点で未確定だった日足は、日付が変わっても確定扱いにしない
  const now = Date.now(), cut = Math.min(now, asOf || now), done = rows.filter(r => r[0] + DAY <= cut);
  const lr = rows.length ? rows[rows.length - 1] : null, live = lr && lr[0] + DAY > cut && lr[0] <= now && lr[0] + DAY > now ? lr : null;
  const n = done.length, d = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
  done.forEach((r, i) => { d.t[i] = r[0]; d.o[i] = r[1]; d.h[i] = r[2]; d.l[i] = r[3]; d.c[i] = r[4]; d.v[i] = r[5]; });
  S.d = d; S.src = src; S.liveRow = live;
  S.stale = n ? (now - (d.t[n - 1] + DAY)) / DAY : 99;
}
function alignMap(getter) { const d = S.d, a = new Float64Array(d.c.length).fill(NaN); for (let i = 0; i < a.length; i++) { const v = getter(dkey(d.t[i])); if (ok(v)) a[i] = v; } return a; }

function compute() {
  const d = S.d; if (!d || d.c.length < 300) return;
  const n = d.c.length, now = Date.now();
  const ex = {
    dvol: S.dvol ? alignMap(k => S.dvol[k]) : null,
    fund: S.fund ? alignMap(k => { const o = S.fund.days[k]; return o && o[1] ? o[0] / o[1] : NaN; }) : null
  };
  S.cyc = null;
  if (S.longRows && S.longRows.length > 2000) {
    const lt = [], lc = [], lastL = S.longRows[S.longRows.length - 1][0];
    S.longRows.forEach(r => { lt.push(r[0]); lc.push(r[1]); });
    for (let i = 0; i < n; i++) if (d.t[i] > lastL) { lt.push(d.t[i]); lc.push(d.c[i]); }
    const L = { t: lt, c: lc }, ls = E.longSeries(L), im = new Map(); lt.forEach((t, i) => im.set(t, i));
    const al = a => { const o = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) { const k = im.get(d.t[i]); if (k != null) o[i] = a[k]; } return o; };
    ex.pl = al(ls.resid); ex.w200 = al(ls.w200); S._L = L; S._ls = ls;
  }
  S._ex = ex;
  S.R = E.run(d, ex);
  S.price = (S.liveRow && S.liveRow[4]) || (S.optRaw && S.optRaw.spot) || (S.fut && S.fut.mark) || d.c[n - 1];
  S.opt = S.optRaw ? E.analyzeOptions(S.optRaw.list, S.optRaw.spot || S.price, now) : null;
  if (S.opt && S.dvol) { const ks = Object.keys(S.dvol).sort(), last = ks[ks.length - 1]; S.opt.dvol = S.dvol[last]; const yr = ks.slice(-365).map(k => S.dvol[k]); S.opt.dvolPct = yr.filter(x => x < S.opt.dvol).length / yr.length; }
  if (S._L && S.longRows) { try { S.cyc = E.cycleInfo(S._L, S._ls, now, S.price); } catch (e) { S.cyc = null; } }
  { const m = S.R.ind.s200; let b = 0; for (let i = n - 14; i < n; i++) if (ok(m[i]) && d.c[i] < m[i]) b++; S.below200 = b >= 14; S.above200 = b === 0; }
  S.agg = aggregateFutures();
  S.liq = E.analyzeLiq({ oi: S.agg.series || (S.fut && S.fut.oi), fundDaily: ex.fund, fundNow: S.fut ? S.fut.fundNow : NaN, ls: S.agg.ls || (S.fut && S.fut.ls), top: S.fut && S.fut.top }, d, S.price);
  if (S.liq) { S.liq.agg = S.agg; }
  S.cbp = coinbasePremium();
  S.zones = E.entryZones(d, S.R.ind, S.price, S.opt, S.liq);
  S.events = allEvents();
  S.prov = null;
  decide(); computeStocks(); S.up = upside(); S.plan = buildPlan(); S.bo = bottomOutlook(); try { S.bg = bottomGauge(); } catch (e) { S.bg = null; } S.hold = holdAll(); S.pick = pickStock(); writeLog();
}

function actsFrom(R) { // スコアの判定に、検証結果・イベント・清算リスクによる引き下げを反映する
  const liq = S.liq, acts = {};
  E.HORIZONS.forEach(h => {
    const z = R.hz[h.k]; let a = z.verdict; const why = [];
    const down = r => { const i = ORDER.indexOf(a); if (i >= 2) { a = ORDER[i - 1]; why.push(r); } };
    if (a !== 'na') {
      if (z.ev.status === 'bad' && ORDER.indexOf(a) >= 2) { a = 'wait'; why.push('検証で優位性を確認できず'); }
      if ((h.k === 's' || h.k === 'd') && S.ev48) down('重要イベント前');
      if ((h.k === 'd' || h.k === 's' || h.k === 'm') && liq && liq.ok && liq.longRisk >= 65) down('ロング清算リスク高');
    }
    acts[h.k] = { a, why, raw: z.verdict };
  });
  return acts;
}
const MAXBUY = 4, ADD_GAP = 14;
function cycleBuys() { // この端末に記録した「買った日」のうち、今のサイクルの底値圏以降のもの
  const c = S.cyc; if (!c) return [];
  const from = c.cur.h + 750 * DAY; return LS.get('buys', []).filter(b => b.t >= from).sort((a, b) => a.t - b.t);
}
function planDecision(acts) {
  // 買う／買わない の二択。ルールは過去4回のサイクルの検証で決めたもの（research/buyrule5.js の E）：
  //   1回目：底値圏〜回復期（半減期から750日目以降）で、中期の判定が「買い好機」
  //   買い足し：前回の買いから14日以上たち、中期の判定が「打診買い」以上。合計4回まで
  const c = S.cyc, liq = S.liq || {}, chk = [], why = [];
  if (!c) { // 長期の履歴が取れずサイクルを判定できないときは、中期の判定だけで決める
    const okm = acts.m.a === 'buy'; chk.push({ ok: okm, text: '中期の判定が「買い好機」（今は「' + E.VERDICT[acts.m.a] + '」）' });
    return { a: okm ? 'buy' : 'skip', why: [okm ? '中期が買い好機' : '中期の判定が買い好機ではない'], chk, n: 0, kind: 'first' };
  }
  const inPhase = c.phase === 'bottom' || c.phase === 'recover';
  chk.push({ ok: inPhase, text: 'サイクルが底値圏〜回復期（今は' + c.name + '、半減期から' + c.day + '日目）' });
  const buys = cycleBuys(), n = buys.length, last = n ? buys[n - 1].t : 0, gap = last ? (Date.now() - last) / DAY : Infinity;
  const first = n === 0, need = first ? 'buy' : 'try', lvM = ORDER.indexOf(acts.m.a), okM = lvM >= ORDER.indexOf(need);
  chk.push({ ok: okM, text: '中期の判定が「' + (first ? '買い好機' : '打診買い') + '」以上（今は「' + E.VERDICT[acts.m.a] + '」' + (acts.m.why.length ? '、' + acts.m.why.join('・') + 'で引き下げ中' : '') + '）' });
  if (!first) chk.push({ ok: gap >= ADD_GAP, text: '前回の買いから14日以上（今は' + Math.floor(gap) + '日）' });
  chk.push({ ok: n < MAXBUY, text: '今のサイクルの買いが4回未満（今は' + n + '回）' });
  const evOk = !(S.ev48 && S.bigEv); chk.push({ ok: evOk, text: evOk ? '48時間以内に重要イベントなし' : S.bigEv.title + 'が48時間以内' });
  const lqOk = !(liq.ok && liq.longRisk >= 65); chk.push({ ok: lqOk, text: lqOk ? 'ロングの清算リスクは警戒水準ではない' : 'ロングの清算リスクが警戒水準' });
  const a = chk.every(x => x.ok) ? 'buy' : 'skip';
  if (a === 'buy') why.push(first ? '底値圏で、中期の判定が買い好機になった' : '買い判定が続いている（' + (n + 1) + '回目）');
  else why.push(chk.filter(x => !x.ok).map(x => x.text).join('／'));
  return { a, why, chk, n, kind: first ? 'first' : 'add' };
}
function computeProv() { // 暫定：今の値段のまま今日の日足が確定した場合の判定
  S.prov = null;
  const d = S.d, lr = S.liveRow, n = d ? d.c.length : 0, ex0 = S._ex; if (!lr || !ex0 || !S.freshDaily || S.stale >= 1 || !S.R) return;
  const now = Date.now(), frac = Math.min(1, Math.max(0, (now - lr[0]) / DAY)); if (frac < 0.15) return;
  const px = S.price, d2 = {}; ['t', 'o', 'h', 'l', 'c', 'v'].forEach(k => { d2[k] = new Float64Array(n + 1); d2[k].set(d[k]); });
  d2.t[n] = lr[0]; d2.o[n] = lr[1]; d2.h[n] = Math.max(lr[2], px); d2.l[n] = Math.min(lr[3], px); d2.c[n] = px; d2.v[n] = lr[5] / frac;   // 出来高は1日分に換算
  const ext = (a, v) => { if (!a) return null; const o = new Float64Array(n + 1).fill(NaN); o.set(a); o[n] = ok(v) ? v : a[n - 1]; return o; };
  const key = dkey(lr[0]), fd = S.fund && S.fund.days[key];
  const ex2 = { dvol: ext(ex0.dvol, S.dvol ? S.dvol[key] : NaN), fund: ext(ex0.fund, fd && fd[1] ? fd[0] / fd[1] : NaN), pl: null, w200: null };
  if (S._L && ex0.pl) { const L2 = { t: S._L.t.concat([lr[0]]), c: S._L.c.concat([px]) }, l2 = E.longSeries(L2), m = L2.c.length - 1; ex2.pl = ext(ex0.pl, l2.resid[m]); ex2.w200 = ext(ex0.w200, l2.w200[m]); }
  const R2 = E.run(d2, ex2), acts = actsFrom(R2), dec = planDecision(acts), pct = {};
  E.HORIZONS.forEach(h => { pct[h.k] = R2.hz[h.k].pct; });
  S.prov = { frac, pct, acts, a: dec.a, why: dec.why, at: now };
}
function aggregateFutures() {
  // Binance先物の4時間足の建玉に、OKX・Bybitの建玉（同じ時刻に最も近い値）を足す。期間の大半をカバーできる取引所だけを合算する
  const bin = S.fut && S.fut.oi, out = { ex: [], series: null, fund: NaN, ls: null, total: NaN };
  const cur = [];
  if (S.fut && bin && bin.length) cur.push({ name: 'Binance', oi: bin[bin.length - 1].oi, fund: S.fut.fundNow });
  if (S.okx) cur.push({ name: 'OKX', oi: S.okx.oi, fund: S.okx.fund });
  if (S.bybit) cur.push({ name: 'Bybit', oi: S.bybit.oi, fund: S.bybit.fund });
  const tot = cur.reduce((a, b) => a + (ok(b.oi) ? b.oi : 0), 0); out.total = tot; out.ex = cur.map(x => Object.assign({ share: tot > 0 ? x.oi / tot : NaN }, x));
  const fw = cur.filter(x => ok(x.fund) && ok(x.oi)); if (fw.length) out.fund = fw.reduce((a, b) => a + b.fund * b.oi, 0) / fw.reduce((a, b) => a + b.oi, 0);
  if (!bin || bin.length < 12) return out;
  const near = (h, t) => { let best = null, bd = Infinity; for (const x of h) { const dd = Math.abs(x[0] - t); if (dd < bd) { bd = dd; best = x; } } return bd <= 3 * 36e5 ? best[1] : NaN; };
  const extra = [];
  if (S.okx && S.okx.hist && S.okx.hist.length) { const h = S.okx.hist.concat([[S.okx.t, S.okx.oi]]); extra.push({ name: 'OKX', h }); }
  if (S.bybit && S.bybit.hist && S.bybit.hist.length) extra.push({ name: 'Bybit', h: S.bybit.hist });
  const use = extra.filter(e => bin.filter(b => ok(near(e.h, b.t))).length >= bin.length * 0.9);
  if (use.length) {
    out.series = bin.map(b => { let v = b.oi; for (const e of use) { const x = near(e.h, b.t); if (!ok(x)) return null; v += x; } return { t: b.t, oi: v, px: b.px }; }).filter(Boolean);
    out.seriesEx = ['Binance'].concat(use.map(e => e.name));
  }
  if (S.bybit && S.bybit.ls && S.fut && S.fut.ls) { const m = new Map(S.bybit.ls.map(x => [x.t, x.r])); out.ls = S.fut.ls.filter(x => m.has(x.t)).map(x => ({ t: x.t, r: (x.r + m.get(x.t)) / 2 })); if (out.ls.length < 20) out.ls = null; }
  return out;
}
function coinbasePremium() { // コインベースとBinanceの価格差。7日平均と90日平均の差を見る（検証では7〜30日後のリターンと同じ向き）
  const c = S.cb, d = S.d; if (!c || !d) return null;
  const n = d.c.length, prem = [];
  for (let i = Math.max(0, n - 120); i < n; i++) { const k = dkey(d.t[i]); if (ok(c.days[k])) prem.push(c.days[k] / d.c[i] - 1); }
  if (prem.length < 90) return null;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length, p7 = avg(prem.slice(-7)), p90 = avg(prem.slice(-90));
  const live = ok(c.now) && S.liveRow ? c.now / S.price - 1 : NaN;
  return { p7, p90, gap: p7 - p90, live };
}
function decide() {
  const now = Date.now(), flags = [], liq = S.liq, opt = S.opt, price = S.price;
  const big = S.events.find(e => e.impact >= 3 && e.t > now), hrs = big ? (big.t - now) / 36e5 : Infinity;
  const ev48 = hrs <= 48;
  if (big && hrs <= 48) flags.push({ lv: 'warn', src: 'イベント', text: big.title + ' まであと' + (hrs < 1 ? '1時間以内' : Math.round(hrs) + '時間') + '。前後は値が飛びやすいため、短期の買い判定は一段階下げます。' });
  else if (big && hrs <= 24 * 7) flags.push({ lv: 'info', src: 'イベント', text: mdw(big.t) + ' ' + hm(big.t) + ' に ' + big.title + '。その前に全額を入れない前提で。' });
  if (liq && liq.ok) {
    if (liq.flush) flags.push({ lv: 'good', src: '清算', text: '建玉が急減しました（24時間 ' + pc(liq.oi1) + '、3日 ' + pc(liq.oi3) + '）。レバレッジの整理が進んだ直後です。' });
    if (liq.longRisk >= 65) flags.push({ lv: 'warn', src: '清算', text: 'ロングの清算リスクが高い状態（' + liq.longRisk + '/100）。買いが積み上がっており、下げ始めると連鎖しやすいため、短期・中期の買い判定は一段階下げます。' });
    else if (liq.longRisk >= 45) flags.push({ lv: 'info', src: '清算', text: 'ロングがやや積み上がっています（清算リスク ' + liq.longRisk + '/100）。' });
    if (liq.shortRisk >= 65) flags.push({ lv: 'info', src: '清算', text: 'ショートが積み上がっています（踏み上げリスク ' + liq.shortRisk + '/100）。上に動くと買い戻しで加速しやすい形です。' });
    const cb = liq.clusters && liq.clusters.below[0];
    if (cb && cb.dist > -0.06) flags.push({ lv: 'info', src: '清算', text: '下 ' + pc(cb.dist) + '（' + usd(cb.p) + ' 付近）にロング清算の集中帯（推定）。そこまで下ヒゲが伸びる展開に注意。' });
  }
  const cp = S.cbp;
  if (cp && ok(cp.gap) && Math.abs(cp.gap) >= 0.0008) flags.push({ lv: 'info', src: '米国の需給', text: cp.gap > 0 ? '米国の取引所（Coinbase）で買いが強まっています。過去は、この状態の後1週間〜1か月が上がりやすい傾向でした。' : '米国の取引所（Coinbase）で売りが優勢です。過去は、この状態の後1週間〜1か月が弱めの傾向でした。' });
  if (opt) {
    if (ok(opt.skew) && opt.skew >= 8) flags.push({ lv: 'info', src: 'オプション', text: 'プットが割高です（スキュー ' + opt.skew.toFixed(1) + 'pt）。オプション市場は下落への備えを強めています。' });
    if (ok(opt.skew) && opt.skew <= -5) flags.push({ lv: 'info', src: 'オプション', text: 'コールが割高です（スキュー ' + opt.skew.toFixed(1) + 'pt）。上昇期待が先行しています。' });
    const nr = opt.near;
    if (nr && nr.days <= 5 && ok(nr.maxPain) && Math.abs(nr.maxPain / price - 1) >= 0.03) flags.push({ lv: 'info', src: 'オプション', text: md(nr.exp) + ' 満期のマックスペインは ' + usd(nr.maxPain) + '（現値比 ' + pc(nr.maxPain / price - 1) + '）。満期までその方向に寄りやすいとされます。' });
    if (opt.callWall && opt.callWall.K / price - 1 <= 0.05) flags.push({ lv: 'info', src: 'オプション', text: '上 ' + pc(opt.callWall.K / price - 1) + ' の ' + usd(opt.callWall.K) + ' にコール建玉の壁。上値が重くなりやすい水準です。' });
  }
  S.ev48 = ev48; S.bigEv = big;
  S.act = actsFrom(S.R);
  if (S.stkStale) flags.unshift({ lv: 'warn', src: 'データ', text: 'MSTR・COINの株価が ' + S.stkLast + ' で止まっています。株価の目安は古い終値からの換算です。' });
  if (S.status.price && !S.status.price.ok && !(S.stale > 2.5)) flags.unshift({ lv: 'warn', src: 'データ', text: '価格データを更新できていません。' + ymd(S.d.t[S.d.c.length - 1]) + ' の確定分までで表示しています。通信を確認して「いま更新する」を押してください。' });
  if (S.stale > 2.5) flags.unshift({ lv: 'warn', src: 'データ', text: '価格データが ' + Math.floor(S.stale) + ' 日前で止まっています。判定は最新ではありません。' });
  S.flags = flags;
}

/* ---------- 上値の見通し：踏み上げか、蓋か ---------- */
function upside() {
  const q = S.liq, o = S.opt, price = S.price; if (!q || !q.ok) return null;
  const all = (q.clusters && q.clusters.all) || [];
  const fuelS = all.filter(x => x.side === 'S' && x.p < price * 1.08).reduce((a, b) => a + b.w, 0);
  const fuelL = all.filter(x => x.side === 'L' && x.p > price * 0.92).reduce((a, b) => a + b.w, 0);
  const ratio = fuelS + fuelL > 0 ? fuelS / (fuelS + fuelL) : NaN;
  const sc = (q.clusters && q.clusters.above) || [];
  const nearS = sc.slice().sort((a, b) => a.p - b.p)[0], bigS = sc.filter(x => x.dist <= 0.10).sort((a, b) => b.share - a.share)[0];
  const cw = o && o.callWall && o.callWall.K / price - 1 <= 0.08 ? o.callWall : null;
  const za = (S.zones.above || []).find(z => z.strength >= 2 && z.dist <= 0.06);
  const sq = [], lid = [];
  if (q.shortRisk >= 55) sq.push('ショートが積み上がっている（踏み上げリスク ' + q.shortRisk + '）');
  if (ok(q.fund7) && q.fund7 < 0) sq.push('資金調達率がマイナス（ショートが手数料を払ってでも売っている）');
  if (ok(q.oi3) && ok(q.px1) && q.oi3 > 0.03 && q.px1 <= 0) sq.push('値下がり中に建玉が増えている（新しいショートが入っている）');
  if (ok(ratio) && ratio >= 0.6) sq.push('上の清算の燃料が下より多い');
  if (nearS && nearS.dist <= 0.04) sq.push('すぐ上 ' + pc(nearS.dist) + ' にショート清算の集中帯');
  if (cw) lid.push('上 ' + pc(cw.K / price - 1) + ' の ' + usd(cw.K) + ' にコール建玉の壁');
  if (q.longRisk >= 55) lid.push('ロングが積み上がっていて、上がると利益確定の売りが出やすい（清算リスク ' + q.longRisk + '）');
  if (ok(q.fundPct) && q.fundPct >= 0.8) lid.push('資金調達率が過去1年の上位' + pc(1 - q.fundPct, 0, false) + '（買いが混んでいる）');
  if (za) lid.push('上 ' + pc(za.dist) + ' に節目が重なる価格帯（' + [...new Set(za.items.map(i => i.label))].slice(0, 2).join('、') + '）');
  if (ok(ratio) && ratio <= 0.35) lid.push('上に清算の燃料が少なく、上げても加速しにくい');
  const sp = sq.length, lp = lid.length;
  const type = sp >= 2 && sp > lp ? 'squeeze' : lp >= 2 && lp > sp ? 'lid' : 'neutral';
  const lidLv = [cw && cw.K, za && za.lo].filter(ok).sort((a, b) => a - b)[0];
  const tgt = bigS ? bigS.p : nearS ? nearS.p : NaN;
  return { type, sq, lid, lidLv, tgt, ratio };
}
const UPS = { squeeze: ['踏み上げ型', '上がり始めたら、ショートの買い戻しで加速しやすい形です。', 'v-buy'], lid: ['蓋をされやすい', '上がっても、売りに押さえられて止まりやすい形です。', 'v-avoid'], neutral: ['どちらとも言えない', '踏み上げの材料と、蓋の材料が拮抗しているか、どちらも弱い状態です。', 'v-wait'] };
function upsideCard(full) {
  const u = S.up; if (!u) return '';
  const [lab, txt, cls] = UPS[u.type];
  const lv = [];
  if (u.type !== 'lid' && ok(u.tgt)) lv.push(['踏み上げで走りやすい先', usd(u.tgt) + '（' + pc(u.tgt / S.price - 1) + '）']);
  if (ok(u.lidLv)) lv.push(['蓋になりやすい水準', usd(u.lidLv) + '（' + pc(u.lidLv / S.price - 1) + '）']);
  ['MSTR', 'COIN'].forEach(sym => { const an = S.stocks[sym] && S.stocks[sym].an; if (!an) return; const xs = []; if (u.type !== 'lid' && ok(u.tgt)) xs.push('走る先 ' + usd2(stockAt(an, u.tgt))); if (ok(u.lidLv)) xs.push('蓋 ' + usd2(stockAt(an, u.lidLv))); if (xs.length) lv.push([sym + ' 換算', xs.join('、')]); });
  const li = (arr, c) => arr.map(x => '<li class="' + c + '">' + esc(x) + '</li>').join('');
  return '<section class="card"><div class="row"><h2>上がったらどうなる？</h2><b class="' + cls + '">' + lab + '</b></div><p>' + txt + '</p>' +
    (u.sq.length || u.lid.length ? '<ul class="why2">' + li(u.sq, 'up') + li(u.lid, 'dn') + '</ul>' : '') +
    (lv.length ? '<dl class="kv">' + lv.map(x => '<dt>' + x[0] + '</dt><dd class="num">' + x[1] + '</dd>').join('') + '</dl>' : '') +
    (full ? upRecord() : '') +
    '<p class="sub">建玉・資金調達率・ロングショート比・清算の集中帯（推定）・オプションの建玉から判定しています。長い過去データがないため、バックテストではなく、日々の記録で答え合わせをしています。</p></section>';
}
function upRecord() {
  const d = S.d, idx = new Map(); for (let i = 0; i < d.t.length; i++) idx.set(dkey(d.t[i]), i);
  let n = 0, hit = 0, pend = 0; const rows = [];
  LS.get('log', []).filter(x => x.up).forEach(x => {
    const i = idx.get(x.k); if (i == null) return; if (i + 3 >= d.c.length) { pend++; return; }
    let mx = 0; for (let j = i + 1; j <= i + 3; j++) mx = Math.max(mx, d.h[j]);
    let r = null;
    if (x.up.t === 'lid' && x.up.lid) r = mx < x.up.lid * 1.005;
    else if (x.up.t === 'squeeze' && x.up.tg) r = mx >= x.up.tg * 0.995;
    if (r === null) return; n++; if (r) hit++; rows.push(x.k.slice(5).replace('-', '/') + ' ' + UPS[x.up.t][0] + '：' + (r ? '的中' : '外れ'));
  });
  if (!n && !pend) return '';
  return '<p class="sub">これまでの答え合わせ：' + (n ? n + '回中 ' + hit + '回的中' : 'まだ判定なし') + (pend ? '（' + pend + '回が判定待ち）' : '') + '。「蓋」は3日以内に蓋の水準を超えなければ的中、「踏み上げ」は3日以内に走る先へ届けば的中。' + (rows.length ? '直近：' + rows.slice(-3).join('、') : '') + '</p>';
}

/* ---------- 今日の行動プラン ---------- */
const lvOf = k => ORDER.indexOf(S.act[k].a);
function nyDST(t) { const d = new Date(t), y = d.getUTCFullYear(); const nth = (m, k) => { const x = new Date(Date.UTC(y, m, 1)); const off = (7 - x.getUTCDay()) % 7; return Date.UTC(y, m, 1 + off + 7 * (k - 1)); }; return t >= nth(2, 2) + 7 * 36e5 && t < nth(10, 1) + 6 * 36e5; }
function usSession(now) {
  for (let k = 0; k < 8; k++) {
    const day = new Date(now + k * DAY), y = day.getUTCFullYear(), m = day.getUTCMonth(), dd = day.getUTCDate();
    const base = Date.UTC(y, m, dd), wd = new Date(base).getUTCDay(); if (wd === 0 || wd === 6) continue;
    const off = nyDST(base + 15 * 36e5) ? 4 : 5, open = base + (9.5 + off) * 36e5, close = base + (16 + off) * 36e5;
    if (now < close) return { open, close, live: now >= open };
  }
  return null;
}
// 米国株式市場の休場日と短縮取引日（2026年11月〜2027年）。日付は米国東部の日付
const US_CLOSED = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'];
const US_HALF = ['2026-11-27', '2026-12-24', '2027-11-26'];   // 13時（東部時間）で通常取引が終わる日
function usSegments(now, count) {
  // 米国株の取引時間（ET）：夜間 20:00-翌4:00（日〜木の夜）、プレ 4:00-9:30、通常 9:30-16:00、アフター 16:00-20:00（月〜金）
  const segs = [], H = 36e5, n0 = new Date(now);
  for (let k = -2; k <= 7; k++) {
    const base = Date.UTC(n0.getUTCFullYear(), n0.getUTCMonth(), n0.getUTCDate() + k), key = dkey(base);
    const off = nyDST(base + 15 * H) ? 4 : 5, at = h => base + (h + off) * H, wd = new Date(base).getUTCDay();
    const closed = US_CLOSED.includes(key), half = US_HALF.includes(key), nextClosed = US_CLOSED.includes(dkey(base + DAY));
    if (wd >= 1 && wd <= 5 && !closed) {
      const end = half ? 13 : 16;
      segs.push({ k: 'pre', name: 'プレ', s: at(4), e: at(9.5) }, { k: 'reg', name: half ? '通常取引（短縮）' : '通常取引', s: at(9.5), e: at(end) }, { k: 'aft', name: 'アフター', s: at(end), e: at(half ? 17 : 20) });
    }
    if (wd >= 0 && wd <= 4 && !closed && !nextClosed && !half) segs.push({ k: 'ovn', name: '夜間', s: at(20), e: at(28) });
  }
  segs.sort((a, b) => a.s - b.s);
  const i = segs.findIndex(x => now < x.e); if (i < 0) return [];
  return segs.slice(i, i + (count || 4)).map(x => Object.assign(x, { live: now >= x.s }));
}
function sessionStrip() {
  const now = Date.now(), sg = usSegments(now); if (!sg.length) return '';
  const cur = sg[0].live ? sg[0] : null;
  const lead = cur ? 'いま：' + cur.name + '（' + (cur.k === 'reg' ? '' : '指値のみで。') + 'あと' + Math.max(1, Math.round((cur.e - now) / 36e5)) + '時間）' : '米国株は休場中。次は ' + mdw(sg[0].s) + ' ' + hm(sg[0].s) + ' の' + sg[0].name + 'から';
  const far = now > Date.UTC(2027, 11, 31) ? '<p class="sub">2028年以降の米国の休場日は入っていません。</p>' : '';
  return '<div class="sess"><p class="sess-now">' + lead + '</p>' + far + '<ol>' + sg.map(x => '<li class="' + (x.live ? 'on' : '') + '"><b>' + x.name + '</b><span class="num">' + hm(x.s) + '〜' + hm(x.e) + '</span></li>').join('') + '</ol></div>';
}
function todayRange() {
  // 今日（朝9時〜翌朝9時）の値幅の予測。今日の日足の始値を中心に、その日に最初に取れた値幅の見込みで一度だけ決め、翌朝9時まで変えない
  const lr = S.liveRow, f = S.R.hz.d.fc; if (!lr || !S.freshDaily) return null;
  const key = dkey(lr[0]), all = LS.get('ranges', []), have = all.find(x => x.k === key);
  if (have) return { lo: have.lo, hi: have.hi, open: have.o, src: have.src, at: have.at, fixed: true };
  const o = S.opt, m = o && ok(o.move1) ? o.move1 : f ? (f.q75 - f.q25) / 2 : NaN; if (!ok(m)) return null;
  const rec = { k: key, o: lr[1], lo: Math.round(lr[1] * (1 - m)), hi: Math.round(lr[1] * (1 + m)), m: +m.toFixed(4), src: o && ok(o.move1) ? 'オプションが織り込む1日の値幅' : '過去の1日の値動き', at: Date.now() };
  all.push(rec); LS.set('ranges', all.slice(-400));
  return { lo: rec.lo, hi: rec.hi, open: rec.o, src: rec.src, at: rec.at, fixed: true };
}
function rangeRecord() { // 確定した日について、終値が予測の値幅に収まったか
  const d = S.d, idx = new Map(); for (let i = 0; i < d.t.length; i++) idx.set(dkey(d.t[i]), i);
  let n = 0, inC = 0, inHL = 0; LS.get('ranges', []).forEach(r => { const i = idx.get(r.k); if (i == null) return; n++; if (d.c[i] >= r.lo && d.c[i] <= r.hi) inC++; if (d.h[i] <= r.hi && d.l[i] >= r.lo) inHL++; });
  return { n, inC, inHL };
}
function reachProb(target) {
  const d = S.d, n = d.c.length, dist = target / S.price - 1; if (dist >= 0) return 1;
  const a = Math.max(1, n - 730); let hit = 0, m = 0;
  for (let i = a; i < n; i++) { m++; if (d.l[i] / d.c[i - 1] - 1 <= dist) hit++; }
  return m ? hit / m : NaN;
}
function stockAt(an, btc) { return an.px * (1 + an.beta * (btc / an.btcAt - 1)); }
function buildPlan() {
  const price = S.price, dec = planDecision(S.act);
  const zs = S.zones.below, rng = todayRange();
  const near = zs.find(z => z.strength >= 2 && z.dist > -0.08) || zs[0];
  const strong = zs.slice().sort((x, y) => y.strength - x.strength || y.dist - x.dist)[0];
  const a = dec.a, why = dec.why;
  const deep = zs.filter(z => !rng || z.hi < rng.lo).sort((x, y) => y.strength - x.strength || y.dist - x.dist)[0];
  const target = a === 'skip' ? (deep || strong) : near;
  const stocks = {};
  ['MSTR', 'COIN'].forEach(sym => {
    const an = S.stocks[sym] && S.stocks[sym].an; if (!an) return;
    let sa = a; const note = [];
    if (sa === 'buy' && ok(an.rz) && an.rz >= 1.5) note.push('この銘柄はBTCに対して割高です。もう一方を優先する材料になります');
    stocks[sym] = { a: sa, now: stockAt(an, price), lim: target ? stockAt(an, target.mid) : NaN, stop: target ? stockAt(an, target.stop) : NaN, lo: rng ? stockAt(an, rng.lo) : NaN, hi: rng ? stockAt(an, rng.hi) : NaN, note };
  });
  return { a, why, chk: dec.chk, n: dec.n, kind: dec.kind, target, rng, reach: target ? reachProb(target.mid) : NaN, stocks, sess: usSession(Date.now()) };
}
const ETF = { MSTU: { und: 'MSTR', L: 2 }, MSTZ: { und: 'MSTR', L: -2 }, CONL: { und: 'COIN', L: 2 }, MSTR: { und: 'MSTR', L: 1 }, COIN: { und: 'COIN', L: 1 } };
function etfClose(sym, date) { // 元の株の終値と同じ日の終値を使う（日付がずれると2倍の計算が二重になる）
  const v = S.etf && S.etf[sym]; if (!v || !v.length) return null;
  for (let i = v.length - 1; i >= 0 && i >= v.length - 6; i--) if (v[i][0] === date) return v[i];
  return null;
}
function etfAt(sym, btc) { // BTCがその値段のときのETFの目安
  const e = ETF[sym], an = S.stocks[e.und] && S.stocks[e.und].an, lc = an ? etfClose(sym, an.date) : null; if (!an || !lc) return NaN;
  const und = stockAt(an, btc) / an.px - 1; return lc[1] * Math.max(0.05, 1 + e.L * und);
}
const HOLD = { hold: ['持ち続ける', 'v-buy'], add: ['買い足し可', 'v-buy'], trim: ['一部売る', 'v-wait'], sell: ['売る', 'v-avoid'], na: ['判定できません', 'v-na'] };
function holdOne(p) {
  const e = ETF[p.sym], c = S.cyc, ph = c ? c.phase : null, plan = S.plan, now = etfAt(p.sym, S.price); let a = 'hold'; const why = [];
  if (!ok(now)) return { a: 'na', why: ['株価データを取得できていません'], now: NaN };
  if (e.L > 0) {
    if (ph === 'top') { if (S.below200) { a = 'sell'; why.push('天井圏で、BTCが200日線を2週間下回りました。出口の合図です'); } else { a = 'trim'; why.push('サイクルは天井圏（半減期から' + c.day + '日目）。分けて売っていく時期です'); } }
    else if (ph === 'down') { a = lvOf('m') >= 2 ? 'trim' : 'sell'; why.push('天井を過ぎた下落期。レバレッジETFは目減りするので持ち越しません'); }
    else if (ph === 'up' && c.day >= 300 && S.below200) { a = 'trim'; why.push('上昇期ですが、BTCが200日線を2週間下回りました'); }
    else if ((ph === 'bottom' || ph === 'recover') && plan && plan.a === 'buy') { a = 'add'; why.push('買い判定が出ています（' + plan.why.join('、') + '）'); }
    else { a = 'hold'; why.push(ph ? 'サイクルは' + c.name + '。売る合図は出ていません' : '売る合図は出ていません'); if ((ph === 'bottom' || ph === 'recover') && plan && plan.a === 'skip') why.push('買い足しは、買い判定が出るまで待ちます'); }
  } else {
    if (ph === 'down' && lvOf('m') === 0 && lvOf('s') === 0) { a = 'hold'; why.push('下落期で、判定も見送り。ただし逆2倍は目減りが大きいので短期で'); }
    else { a = 'sell'; why.push('このアプリは下げを予測できません。' + (ph ? 'サイクルは' + c.name + 'で、' : '') + '逆2倍は持つほど目減りします'); }
  }
  const pl = now / p.cost - 1, days = p.date ? Math.max(0, Math.round((Date.now() - Date.parse(p.date)) / DAY)) : null;
  let decay = null, undRet = null;
  if (p.date && S.etf && S.etf[p.sym] && S.etf[e.und] && e.L !== 1) {
    const ev = S.etf[p.sym], uv = S.etf[e.und], i = ev.findIndex(r => r[0] >= p.date), j = uv.findIndex(r => r[0] >= p.date);
    if (i >= 0 && j >= 0 && i < ev.length - 1) { undRet = uv[uv.length - 1][1] / uv[j][1] - 1; decay = (ev[ev.length - 1][1] / ev[i][1] - 1) - e.L * undRet; }
  }
  const an = S.stocks[e.und] && S.stocks[e.und].an;
  const need = e.L > 0 && pl < 0 ? Math.pow(p.cost / now, 1 / e.L) - 1 : null;
  const lim = a === 'add' && plan && plan.target ? etfAt(p.sym, plan.target.mid) : NaN;
  return { a, why, now, pl, plUsd: p.qty ? (now - p.cost) * p.qty : null, days, decay, undRet, need, undNeed: need != null && an ? stockAt(an, S.price) * (1 + need) : null, lim };
}
function holdAll() { return LS.get('pos', []).map((p, i) => Object.assign({ i, p }, holdOne(p))); }
function holdCards() {
  const hs = S.hold || []; if (!hs.length) return '';
  return '<h2 class="sec">持っている銘柄</h2>' + hs.map(h => {
    const [lab, cls] = HOLD[h.a], e = ETF[h.p.sym], kv = [];
    if (ok(h.now)) { kv.push(['いまの目安 / 買値', usd2(h.now) + ' / ' + usd2(h.p.cost)]); kv.push(['損益', pc(h.pl) + (h.plUsd != null ? '（' + (h.plUsd < 0 ? '-' : '+') + '$' + Math.abs(Math.round(h.plUsd)).toLocaleString('en-US') + '）' : '')]); }
    if (ok(h.lim)) kv.push(['買い足しの指値', usd2(h.lim)]);
    if (h.days != null) kv.push(['持っている日数', h.days + '日']);
    if (h.decay != null) kv.push([h.decay < 0 ? '2倍の計算より目減りした分' : '2倍の計算より上振れした分', pc(h.decay) + '（' + e.und + 'は' + pc(h.undRet) + '）']);
    if (h.need != null) kv.push(['買値に戻るには', e.und + 'が ' + pc(h.need) + (h.undNeed ? '（' + usd2(h.undNeed) + '）' : '') + ' 以上']);
    return '<div class="plan-stock"><div class="row"><b class="sym">' + h.p.sym + '</b><b class="' + cls + ' plan-v">' + lab + '</b></div><p class="sub" style="margin-top:4px">' + esc(h.why.join('。')) + '</p><dl class="kv">' + kv.map(l => '<dt>' + l[0] + '</dt><dd class="num">' + l[1] + '</dd>').join('') + '</dl>' + (h.need != null && e.L > 1 ? '<p class="sub">「買値に戻るには」は目減りを無視した最低ラインです。時間がかかるほど、必要な上昇は大きくなります。</p>' : '') + '</div>';
  }).join('');
}
function cycleStrip() {
  const c = S.cyc; if (!c) return '';
  const act = { up: '持つ時期', top: '売っていく時期', down: '買わない時期', bottom: '仕込む時期', recover: '持つ時期' }[c.phase];
  return '<p class="cyc"><b>サイクル：' + c.name + '（' + act + '）</b><span class="num">' + c.day + '日目・条件' + c.score + '/3</span></p>';
}
function cycleCard() {
  const c = S.cyc; if (!c) return '';
  const rows = c.cyc.map(x => '<tr><th>' + new Date(x.h).getUTCFullYear() + '年</th><td class="num">' + x.peakDay + '</td><td class="num">' + x.lowDay + (x.done ? '' : '※') + '</td><td class="num">' + pc(x.dd, 0) + '</td></tr>').join('');
  const nh = c.nextHalving, f = t => { const d = new Date(t); return d.getFullYear() + '年' + (d.getMonth() + 1) + '月'; };
  return '<section class="card"><div class="row"><h2>ビットコインのサイクル</h2><b class="' + ({ bottom: 'v-buy', recover: 'v-buy', up: 'v-buy', top: 'v-wait', down: 'v-avoid' }[c.phase]) + '">' + c.name + '</b></div>' +
    '<ul class="why2">' + c.checks.map(x => '<li class="' + (x.ok ? 'up' : 'dn') + ' chk">' + esc(x.text) + '</li>').join('') + '</ul>' +
    '<table class="tbl"><thead><tr><th>半減期</th><th>天井（日目）</th><th>底（日目）</th><th>下落率</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="sub">日数は半減期から数えた日数。※は今のサイクルのここまでの安値で、まだ確定していません。</p><h3>出口の目安</h3><ul class="exit"><li>次の半減期（' + f(nh) + 'ごろの見込み）から400〜550日目、' + f(nh + 400 * DAY) + '〜' + f(nh + 550 * DAY) + 'ごろに分けて売る</li><li>その時期に入ってからBTCが200日線を2週間下回ったら、残りも売る</li><li>レバレッジETFは天井を過ぎて持たない。過去の検証では、売らなかった場合に利益の大半が消えました</li></ul>' +
    '<p class="sub">時期の区切りは、半減期から400日目まで上昇期、600日目まで天井圏、750日目まで下落期、1000日目まで底値圏、その後が回復期です。過去3回のサイクルだけが根拠で、上昇幅は回を追うごとに小さくなっています。次も同じになる保証はありません。</p></section>';
}
function pickStock() {
  const A = S.stocks.MSTR && S.stocks.MSTR.an, B = S.stocks.COIN && S.stocks.COIN.an; if (!A || !B) return null;
  const sc = { MSTR: 0, COIN: 0 }, why = [], pz = pairZ(), ph = S.cyc ? S.cyc.phase : null;
  // 割安・割高は、その銘柄で実際に効いていたか（全期間と直近2年の両方）を毎回確かめてから点数にする
  [['MSTR', A, 'COIN'], ['COIN', B, 'MSTR']].forEach(([k, an, other]) => {
    const r = an.rel; if (!ok(an.rz) || !r) return;
    const f = x => pc(x.mean) + '、' + x.n + '日';
    if (an.rz <= -1.5) {
      if (r.lo.n >= 30 && r.lo2.n >= 15 && r.lo.mean > 0 && r.lo2.mean > 0) { sc[k] += 2; why.push({ s: k, t: k + 'がBTCに対して割安（' + an.rz.toFixed(1) + 'σ）。同じ状況の後3か月は、BTCを上回っていました（全期間 ' + f(r.lo) + '／直近2年 ' + f(r.lo2) + '）' }); }
      else why.push({ s: null, t: k + 'もBTCに対して割安（' + an.rz.toFixed(1) + 'σ）ですが、その後BTCを上回る傾向が安定していないため、材料にしていません（全期間 ' + f(r.lo) + '／直近2年 ' + f(r.lo2) + '）' });
    }
    if (an.rz >= 1.5) {
      if (r.hi.n >= 30 && r.hi.mean < 0 && (r.hi2.n < 15 || r.hi2.mean < 0)) { sc[k] -= 2; why.push({ s: other, t: k + 'がBTCに対して割高（+' + an.rz.toFixed(1) + 'σ）。同じ状況の後3か月は、BTCに負けていました（全期間 ' + f(r.hi) + '）' }); }
      else why.push({ s: null, t: k + 'はBTCに対して割高（+' + an.rz.toFixed(1) + 'σ）ですが、その後の傾向が安定していないため、材料にしていません' });
    }
  });
  if (ok(pz) && pz >= 1) { sc.COIN += 1; why.push({ s: 'COIN', t: 'MSTRがCOINに対して割高（+' + pz.toFixed(1) + 'σ）' }); }
  if (ok(pz) && pz <= -1) { sc.MSTR += 1; why.push({ s: 'MSTR', t: 'MSTRがCOINに対して割安（' + pz.toFixed(1) + 'σ）' }); }
  if (ph === 'bottom' || ph === 'recover' || ph === 'up') { sc.MSTR += 1; why.push({ s: 'MSTR', t: 'サイクルの上昇局面では、MSTRの方が大きく動きます（前回の底からBTC天井まで MSTR +2188%、COIN +836%）' }); }
  ['MSTR', 'COIN'].forEach(k => { const an = k === 'MSTR' ? A : B, b = an.bt.l; if (b && b.sig.n >= 30 && ok(b.sig.mean) && ok(b.all.mean)) { if (b.sig.mean > b.all.mean) { sc[k] += 1; why.push({ s: k, t: k + 'は長期の買い判定が当たっている（買い判定の日の平均 ' + pc(b.sig.mean) + '、全日 ' + pc(b.all.mean) + '）' }); } } });
  // 手持ち
  const ex = { MSTR: 0, COIN: 0 }; let haveQty = false, lossy = [];
  (S.hold || []).forEach(h => { const e = ETF[h.p.sym]; if (e.L < 0) return; if (h.p.qty && ok(h.now)) { ex[e.und] += h.p.qty * h.now * Math.abs(e.L); haveQty = true; } if (h.pl <= -0.4) lossy.push(h.p.sym); });
  const tot = ex.MSTR + ex.COIN, hold = [];
  let tilt = null;
  if (haveQty && tot > 0) { const sh = ex.MSTR / tot; if (sh >= 0.7) tilt = 'COIN'; else if (sh <= 0.3) tilt = 'MSTR'; hold.push('手持ちのレバレッジ込みの金額は MSTR系 ' + pc(sh, 0, false) + '、COIN系 ' + pc(1 - sh, 0, false) + '。' + (tilt ? '偏っているので、新しく買うなら ' + tilt + '系で偏りを減らせます' : '偏りは大きくありません')); }
  else if ((S.hold || []).length) hold.push('保有銘柄に株数を入れると、どちらに偏っているかも見ます');
  if (lossy.length) hold.push(lossy.join('・') + 'は含み損が大きいですが、それを理由に同じ銘柄を選ぶことはしていません。取り返しやすさは、どちらを買っても変わらないためです');
  const diff = sc.MSTR - sc.COIN;
  let pick = diff >= 2 ? 'MSTR' : diff <= -2 ? 'COIN' : 'even';
  let final = pick;
  if (tilt && pick === 'even') final = tilt;
  return { pick, final, sc, why, hold, tilt };
}
function pickCard() {
  const k = S.pick; if (!k) return '';
  const skip = S.plan && S.plan.a === 'skip', lev = { MSTR: 'MSTU', COIN: 'CONL' };
  const title = k.final === 'even' ? '半分ずつ' : k.final + '（' + lev[k.final] + '）';
  const li = k.why.map(w => '<li class="' + (w.s === 'MSTR' ? 'pm' : w.s === 'COIN' ? 'pc' : 'pn') + '">' + (w.s ? '<b>' + w.s + '</b> ' : '') + esc(w.t) + '</li>').join('');
  return '<section class="card"><div class="row"><h2>' + (skip ? '買うときに選ぶなら' : 'どっちを買うか') + '</h2><b class="v-buy">' + title + '</b></div>' +
    '<p class="sub" style="margin-top:4px">点数：MSTR ' + k.sc.MSTR + ' ／ COIN ' + k.sc.COIN + (k.final === 'even' ? '（互角なので、MSTUとCONLに半分ずつ）' : k.final !== k.pick ? '（点数は互角。手持ちの偏りから ' + k.final + ' を選んでいます）' : '') + '</p>' +
    '<ul class="why3">' + li + '</ul>' + (k.hold.length ? '<h3>手持ちを踏まえると</h3><ul class="why3">' + k.hold.map(x => '<li class="pn">' + esc(x) + '</li>').join('') + '</ul>' : '') +
    '<p class="sub">差が2点以上なら片方、それ未満なら半分ずつにしています。割安・割高は、株価とBTCの比率が直近90日の平均からどれだけ離れているかです。割安・割高を点数に入れるのは、過去の全期間と直近2年の両方で実際に効いていた場合だけで、開くたびに確かめ直しています。</p></section>';
}
const PLAN = { buy: ['買う', 'v-buy'], limit: ['指値で待つ', 'v-wait'], skip: ['買わない', 'v-avoid'] };
function planLabel(a) {
  if (a !== 'buy') return PLAN[a][0];
  const v = S.plan && S.plan.kind === 'add' ? '買い足す' : '買う';
  const now = Date.now(), reg = usSegments(now, 12).find(x => x.k === 'reg'); if (!reg) return v;
  if (reg.live) return 'いま' + v;
  const hrs = (reg.s - now) / 36e5;
  return hrs <= 14 ? '今夜' + v : mdw(reg.s) + 'の取引で' + v;
}

/* ---------- live log (forward verification) ---------- */
function writeLog() {
  if (!S.freshDaily || S.stale > 1.5) return;   // 保存データや古いデータからは記録しない
  const d = S.d, n = d.c.length, key = dkey(d.t[n - 1]), log = LS.get('log', []);
  const old = log.find(x => x.k === key);
  const liq = S.liq || {}, opt = S.opt || {};
  const pct = {}, act = {}; E.HORIZONS.forEach(h => { pct[h.k] = Math.round(S.R.hz[h.k].pct); act[h.k] = S.act[h.k].a; });
  const pl = S.plan, sp = {}; if (pl) Object.keys(pl.stocks).forEach(sym => { const x = pl.stocks[sym]; sp[sym] = { a: x.a, px: +x.now.toFixed(2), lim: ok(x.lim) ? +x.lim.toFixed(2) : null }; });
  const up = S.up && S.up.type !== 'neutral' ? { t: S.up.type, lid: ok(S.up.lidLv) ? Math.round(S.up.lidLv) : null, tg: ok(S.up.tgt) ? Math.round(S.up.tgt) : null } : null;
  const pk = S.pick ? S.pick.final : null;
  const hv = (S.hold || []).filter(h => ok(h.now)).map(h => ({ s: h.p.sym, a: h.a, px: +h.now.toFixed(2) }));
  const rec = { k: key, t: d.t[n - 1], px: d.c[n - 1], pct, act, pa: pl ? pl.a : null, sp, up, hv, pk, cy: S.cyc ? S.cyc.phase : null, lr: ok(liq.longRisk) && liq.ok ? liq.longRisk : null, sr: ok(liq.shortRisk) && liq.ok ? liq.shortRisk : null, fl: !!liq.flush, sk: ok(opt.skew) ? +opt.skew.toFixed(1) : null, pcr: ok(opt.pcrOI) ? +opt.pcrOI.toFixed(2) : null, bg: S.bg ? Math.round(S.bg.g * 100) : null, st: (() => { try { return stageOf().k; } catch (e) { return null; } })(), bo: S.bo ? { zl: S.bo.zone ? Math.round(S.bo.zone.lo) : null, zh: S.bo.zone ? Math.round(S.bo.zone.hi) : null, e1: S.bo.eta ? dkey(S.bo.eta.from) : null, e2: S.bo.eta ? dkey(S.bo.eta.to) : null } : null, ev: !!S.ev48, cbp: S.cbp && ok(S.cbp.gap) ? +S.cbp.gap.toFixed(5) : null };
  const pv = S.prov ? { a: S.prov.a, f: +S.prov.frac.toFixed(2), s: Math.round(S.prov.pct.s), m: Math.round(S.prov.pct.m), l: Math.round(S.prov.pct.l) } : null;
  if (pv) rec.pv = pv;
  if (!old) { log.push(rec); LS.set('log', log.slice(-900)); return; }
  // その日の最初の判定は書き換えない。取得できていなかった項目だけを後から埋める
  let ch = false;
  if (pv) { old.pv = pv; ch = true; }
  if ((!old.sp || !Object.keys(old.sp).length) && Object.keys(sp).length) { old.sp = sp; old.pa = rec.pa; ch = true; }
  if (!old.up && up && old.lr == null) { old.up = up; ch = true; }
  if (old.lr == null && rec.lr != null) { old.lr = rec.lr; old.sr = rec.sr; old.fl = rec.fl; ch = true; }
  if (old.sk == null && rec.sk != null) { old.sk = rec.sk; old.pcr = rec.pcr; ch = true; }
  if (!old.pk && pk) { old.pk = pk; ch = true; }
  if (!old.cy && rec.cy) { old.cy = rec.cy; ch = true; }
  const have = new Set((old.hv || []).map(x => x.s)); hv.forEach(x => { if (!have.has(x.s)) { (old.hv = old.hv || []).push(x); ch = true; } });
  if (ch) LS.set('log', log);
}
function evalLog() {
  const d = S.d, log = LS.get('log', []), idx = new Map(); for (let i = 0; i < d.t.length; i++) idx.set(dkey(d.t[i]), i);
  const res = { n: log.length, first: log.length ? log[0].t : null, hz: {}, risk: null };
  E.HORIZONS.forEach(h => {
    let buyN = 0, buyHit = 0, avN = 0, avHit = 0, pend = 0;
    log.forEach(x => { const i = idx.get(x.k); if (i == null || !x.act[h.k]) return; const j = i + h.d; if (j >= d.c.length) { pend++; return; } const r = d.c[j] / d.c[i] - 1, a = x.act[h.k]; if (a === 'buy' || a === 'try') { buyN++; if (r > 0) buyHit++; } else if (a === 'avoid') { avN++; if (r < 0) avHit++; } });
    res.hz[h.k] = { buyN, buyHit, avN, avHit, pend };
  });
  const hi = [], lo = [];
  log.forEach(x => { const i = idx.get(x.k); if (i == null || x.lr == null || i + 7 >= d.c.length) return; (x.lr >= 65 ? hi : lo).push(d.c[i + 7] / d.c[i] - 1); });
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  if (hi.length >= 5 && lo.length >= 5) res.risk = { hiN: hi.length, hi: mean(hi), loN: lo.length, lo: mean(lo) };
  return res;
}

/* ---------- stocks ---------- */
function pairZ() {
  const a = S.stocks.MSTR && S.stocks.MSTR.an, b = S.stocks.COIN && S.stocks.COIN.an; if (!a || !b) return NaN;
  const ds = [...a.vmap.keys()].filter(k => b.vmap.has(k)).sort().slice(-90); if (ds.length < 60) return NaN;
  const r = ds.map(k => Math.log(a.vmap.get(k) / b.vmap.get(k))), mu = r.reduce((x, y) => x + y, 0) / r.length, sd = Math.sqrt(r.reduce((x, y) => x + (y - mu) ** 2, 0) / r.length);
  return sd > 0 ? (r[r.length - 1] - mu) / sd : NaN;
}
function computeStocks() {
  const d0 = S.d, idx = new Map(); for (let i = 0; i < d0.t.length; i++) idx.set(dkey(d0.t[i]), i);
  // 米国株の終値（21時UTC）が出た時点では、同じ日付のBTC日足はまだ確定していない。その日はBTCの現在値で対応させる
  const n0 = d0.c.length, nextKey = dkey(d0.t[n0 - 1] + DAY), ext = S.stale < 1 && ok(S.price);
  const d = { c: ext ? Float64Array.from([...d0.c, S.price]) : d0.c }; if (ext) idx.set(nextKey, n0);
  ['MSTR', 'COIN'].forEach(sym => {
    const st = S.stocks[sym]; if (!st || !st.vals) return;
    const v = st.vals.filter(x => idx.has(x[0])), m = v.length; if (m < 120) { st.an = null; return; }
    const sc = Float64Array.from(v, x => x[1]), bi = v.map(x => idx.get(x[0]));
    const rs = [], rb = [];
    for (let i = Math.max(1, m - 90); i < m; i++) { rs.push(Math.log(sc[i] / sc[i - 1])); rb.push(Math.log(d.c[bi[i]] / d.c[bi[i - 1]])); }
    const mu = a => a.reduce((s, x) => s + x, 0) / a.length, ms = mu(rs), mb = mu(rb);
    let cov = 0, vb = 0, vs = 0; for (let i = 0; i < rs.length; i++) { cov += (rs[i] - ms) * (rb[i] - mb); vb += (rb[i] - mb) ** 2; vs += (rs[i] - ms) ** 2; }
    const beta = cov / vb, corr = cov / Math.sqrt(vb * vs);
    const ratio = []; for (let i = Math.max(0, m - 90); i < m; i++) ratio.push(Math.log(sc[i] / d.c[bi[i]]));
    const rm = mu(ratio), rsd = Math.sqrt(mu(ratio.map(x => (x - rm) ** 2))), rz = rsd > 0 ? (ratio[ratio.length - 1] - rm) / rsd : NaN;
    const r14 = E.rsi(sc, 14), s50 = E.sma(sc, 50), s200 = E.sma(sc, 200);
    const bt = {};
    E.HORIZONS.forEach(h => {
      const td = Math.round(h.d * 252 / 365), pctA = S.R.hz[h.k].sc.pct, all = [], sig = [], av = [];
      for (let i = 0; i + td < m; i++) { const p = pctA[bi[i] - 1]; if (!ok(p)) continue; const r = sc[i + td] / sc[i] - 1; all.push(r); if (p >= E.TH.try_) sig.push(r); else if (p < E.TH.wait) av.push(r); }
      bt[h.k] = { td, all: E.summarize(all), sig: E.summarize(sig), avoid: E.summarize(av) };
    });
    // BTCに対する割安・割高（90日）の後、63営業日でBTCをどれだけ上回ったか
    const rel = { lo: [], hi: [], lo2: [], hi2: [] }, lrb = Array.from(sc, (x, i) => Math.log(x / d.c[bi[i]]));
    for (let i = 90; i + 63 < m; i++) {
      let s1 = 0, s2 = 0; for (let j = i - 89; j <= i; j++) { s1 += lrb[j]; s2 += lrb[j] * lrb[j]; }
      const mu9 = s1 / 90, sd9 = Math.sqrt(Math.max(0, s2 / 90 - mu9 * mu9)); if (!(sd9 > 0)) continue;
      const z = (lrb[i] - mu9) / sd9, r = (sc[i + 63] / sc[i]) / (d.c[bi[i + 63]] / d.c[bi[i]]) - 1;
      if (z <= -1.5) { rel.lo.push(r); if (i >= m - 504 - 63) rel.lo2.push(r); } else if (z >= 1.5) { rel.hi.push(r); if (i >= m - 504 - 63) rel.hi2.push(r); }
    }
    Object.keys(rel).forEach(k => { rel[k] = E.summarize(rel[k]); });
    // 換算の誤差：直近2年、その時点で分かっていたベータで「BTCの動き×ベータ」を当てはめたときの、実際の終値とのずれ（平均）
    let errSum = 0, errN = 0;
    { const R1 = [], B1 = []; for (let i = 1; i < m; i++) { R1.push(Math.log(sc[i] / sc[i - 1])); B1.push(Math.log(d.c[bi[i]] / d.c[bi[i - 1]])); }
      for (let i = Math.max(90, R1.length - 504); i < R1.length; i++) { let a = 0, b = 0, ab = 0, bb = 0; for (let j = i - 90; j < i; j++) { a += R1[j]; b += B1[j]; } a /= 90; b /= 90; for (let j = i - 90; j < i; j++) { ab += (R1[j] - a) * (B1[j] - b); bb += (B1[j] - b) ** 2; } if (!(bb > 0)) continue; errSum += Math.abs(Math.exp(ab / bb * B1[i]) - Math.exp(R1[i])); errN++; } }
    const estErr = errN >= 100 ? errSum / errN : NaN;
    // 株の終値が付いた時刻（米国東部16時、短縮日は13時）のBTC価格。1時間足があればそれを使い、なければ日足の終値で代用
    let btcAt = d.c[bi[m - 1]];
    { const base = Date.parse(v[m - 1][0] + 'T00:00:00Z'), off = nyDST(base + 15 * 36e5) ? 4 : 5, ct = base + ((US_HALF.includes(v[m - 1][0]) ? 13 : 16) + off) * 36e5, hv = S.hourly && S.hourly.get(ct - 36e5); if (ok(hv)) btcAt = hv; }
    st.an = { rel, vmap: new Map(v), px: sc[m - 1], date: v[m - 1][0], chg: sc[m - 1] / sc[m - 2] - 1, beta, corr, rz, rsi: r14[m - 1], s50: s50[m - 1], s200: s200[m - 1], bt, btcAt, estErr };
  });
}

/* ================= refresh ================= */
async function refreshAll() {
  if (S.loading) return; S.loading = true; S.fatal = null; renderTop();
  S.freshDaily = false;
  try { const dd = await loadDaily(); setData(dd.rows, dd.src, dd.at); S.freshDaily = !!dd.live; } catch (e) { if (!S.d) S.fatal = e.message; }
  const mark = (k, name, p, okNote, ngNote) => p.then(v => { S.status[k] = { ok: true, name, note: typeof okNote === 'function' ? okNote(v) : okNote }; return v; }, () => { S.status[k] = { ok: false, name, note: ngNote }; return null; });
  const tasks = [
    mark('opt', 'オプション', loadOptions(), v => 'Deribit、' + v.list.length + '銘柄', 'Deribit から取得できません。オプション関連は非表示です').then(v => { S.optRaw = v || null; }),
    mark('dvol', 'インプライドボラ履歴', loadDvol(), v => 'Deribit DVOL、' + Object.keys(v).length + '日分', '取得できません。オプション要因はスコアから外れます').then(v => { if (v) S.dvol = v; else S.dvol = Object.keys(LS.get('dvol', {})).length ? LS.get('dvol', {}) : null; }),
    mark('fund', '資金調達率の履歴', loadFunding(), v => 'Binance先物、' + Object.keys(v.days).length + '日分', '取得できません。建玉要因はスコアから外れます').then(v => { if (v) S.fund = v; else { const c = LS.get('fund', null); S.fund = c && c.last ? c : null; } }),
    mark('fut', '建玉・ロングショート比', loadFutures(), v => 'Binance先物' + (v.oi ? '、直近30日' : '（建玉履歴なし）'), '').then(async v => {
      if (v) { S.fut = v; return; }
      try { S.fut = await loadDeribitPerp(); S.status.fut = { ok: false, name: '建玉・ロングショート比', note: 'Binance先物に接続できません。Deribitの資金調達率のみ表示（清算の集中帯は推定不可）' }; }
      catch (e) { S.fut = null; S.status.fut = { ok: false, name: '建玉・ロングショート比', note: '取得できません。清算の予兆は表示できません' }; }
    })
  ];
  tasks.push(Promise.allSettled([loadOkx(), loadBybit()]).then(([a, b]) => {
    S.okx = a.status === 'fulfilled' ? a.value : null; S.bybit = b.status === 'fulfilled' ? b.value : null;
    const got = ['Binance先物'].concat(S.okx ? ['OKX'] : [], S.bybit ? ['Bybit'] : []), miss = [].concat(S.okx ? [] : ['OKX'], S.bybit ? [] : ['Bybit']);
    S.status.agg = { ok: !miss.length, name: '建玉の合算', note: got.join('・') + (miss.length ? '（' + miss.join('・') + ' は取得できず）' : '') };
  }));
  tasks.push(loadOnchain().then(v => { S.oc = v; S.status.oc = { ok: true, name: 'オンチェーン・恐怖指数', note: 'MVRV・マイナー収入・ハッシュレート・恐怖と強欲指数' }; }, () => { S.oc = null; S.status.oc = { ok: false, name: 'オンチェーン・恐怖指数', note: '取得できません。底らしさの一部が出ません' }; }));
  tasks.push(loadCoinbase().then(v => { S.cb = v; S.status.cb = { ok: true, name: 'コインベース・プレミアム', note: 'Coinbase BTC-USD' }; }, () => { S.cb = null; S.status.cb = { ok: false, name: 'コインベース・プレミアム', note: '取得できません' }; }));
  tasks.push(loadHourly().then(m => { S.hourly = m; }, () => { S.hourly = null; }));
  tasks.push(mark('long', '長期の価格履歴（サイクル用）', loadLong(), v => 'Bitstamp、' + v.length + '日分', '取得できません。サイクルの表示と長期要因は使えません').then(v => { if (v) S.longRows = v; else { const c = LS.get('long', null); S.longRows = c ? c.rows : null; } }));
  tasks.push((async () => {
    let repo = null; try { repo = await loadStockRepo(); } catch (e) { /* リポジトリ版がない */ }
    if (repo) S.etf = repo.symbols;
    for (const sym of ['MSTR', 'COIN']) {
      const v = repo && repo.symbols[sym];
      if (v && v.length > 120) { S.stocks[sym] = { vals: v }; const ld = v[v.length - 1][0]; S.stkLast = ld; S.stkSrc = '毎日自動取得（' + (repo.source || 'Yahoo Finance') + '、' + ld.slice(5).replace('-', '/') + ' の終値まで）'; continue; }
      if (S.cfg.tdKey) { try { S.stocks[sym] = { vals: await loadStock(sym) }; S.stkSrc = 'Twelve Data'; } catch (e) { S.stocks[sym] = { err: e.message }; } }
      else S.stocks[sym] = { err: '株価データがまだ用意されていません（毎日の自動取得を待っています）' };
    }
  })());
  await Promise.allSettled(tasks);
  { const er = ['MSTR', 'COIN'].filter(s => S.stocks[s] && S.stocks[s].err), old = S.stkLast ? (Date.now() - Date.parse(S.stkLast)) / DAY : 0;
    S.stkStale = !er.length && old > 5.5;
    S.status.stk = { ok: !er.length && !S.stkStale, name: '関連株（MSTR・COIN）', note: er.length ? er.join('・') + '：' + S.stocks[er[0]].err : S.stkSrc + (S.stkStale ? '。株価の自動取得が ' + Math.floor(old) + ' 日止まっています' : '') }; }
  try { compute(); } catch (e) { S.fatal = '計算中にエラーが起きました：' + e.message; }
  S.loading = false; S.at = Date.now(); render();
  setTimeout(() => { try { computeProv(); if (S.prov) { writeLog(); render(); } } catch (e) { S.prov = null; } }, 50);
}

/* ================= charts ================= */
const path = pts => pts.length ? 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') : '';
function logTicks(lo, hi, k) {
  const out = [], a = Math.log(lo), b = Math.log(hi);
  for (let i = 0; i < k; i++) { let v = Math.exp(a + (b - a) * (i + 0.5) / k); const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1); v = Math.round(v / mag) * mag; if (!out.includes(v)) out.push(v); }
  return out;
}
function priceChart() {
  const d = S.d, n = d.c.length, N = Math.min(S.range, n), a = n - N, hz = S.R.hz[S.sel], fc = hz.fc, H = hz.sc.H, ind = S.R.ind, price = S.price;
  const fut = Math.max(H, Math.round(N * 0.1)), Wd = 360, Hh = 230, pl = 4, pr = 44, pt = 10, pb = 30;
  let lo = Infinity, hi = -Infinity; for (let i = a; i < n; i++) { lo = Math.min(lo, d.l[i]); hi = Math.max(hi, d.h[i]); }
  if (fc) { lo = Math.min(lo, price * (1 + fc.q10)); hi = Math.max(hi, price * (1 + fc.q90)); }
  const zs = S.zones.below.slice().sort((x, y) => y.strength - x.strength).slice(0, 3).filter(z => z.mid > lo * 0.85);
  zs.forEach(z => { lo = Math.min(lo, z.lo * 0.99); });
  lo *= 0.98; hi *= 1.02;
  const sy = v => pt + (Math.log(hi) - Math.log(v)) / (Math.log(hi) - Math.log(lo)) * (Hh - pt - pb), sx = i => pl + (i - a) / (N - 1 + fut) * (Wd - pl - pr);
  const line = arr => { const p = []; for (let i = a; i < n; i++) if (ok(arr[i])) p.push([sx(i), sy(arr[i])]); return path(p); };
  let g = '';
  logTicks(lo, hi, 4).forEach(v => { g += '<line x1="' + pl + '" x2="' + (Wd - pr) + '" y1="' + sy(v).toFixed(1) + '" y2="' + sy(v).toFixed(1) + '" class="grid"/><text x="' + (Wd - pr + 4) + '" y="' + (sy(v) + 3).toFixed(1) + '" class="ax">' + kfmt(v) + '</text>'; });
  zs.forEach(z => { const y0 = sy(z.hi * 1.004), y1 = sy(z.lo * 0.996); g += '<rect x="' + pl + '" y="' + y0.toFixed(1) + '" width="' + (Wd - pr - pl) + '" height="' + Math.max(2, y1 - y0).toFixed(1) + '" class="zone"/>'; });
  if (fc) {
    const x0 = sx(n - 1), x1 = sx(n - 1 + H), y0 = sy(price), P = q => sy(price * (1 + q));
    g += '<polygon points="' + [x0, y0, x1, P(fc.q90), x1, P(fc.q10)].map(v => v.toFixed(1)).join(' ') + '" class="cone1"/>';
    g += '<polygon points="' + [x0, y0, x1, P(fc.q75), x1, P(fc.q25)].map(v => v.toFixed(1)).join(' ') + '" class="cone2"/>';
    g += '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + P(fc.q50).toFixed(1) + '" class="med"/>';
    g += '<line x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + pt + '" y2="' + (Hh - pb) + '" class="nowl"/>';
  }
  g += '<path d="' + line(ind.s200) + '" class="ma200"/><path d="' + line(ind.s50) + '" class="ma50"/><path d="' + line(d.c) + '" class="px"/>';
  g += '<circle cx="' + sx(n - 1).toFixed(1) + '" cy="' + sy(price).toFixed(1) + '" r="3" class="dot"/>';
  // signal ribbon
  const pctA = hz.sc.pct; let run = null; const yb = Hh - pb + 4;
  const flush = (end) => { if (run && run.v !== 'na') g += '<rect x="' + sx(run.s).toFixed(1) + '" y="' + yb + '" width="' + Math.max(0.6, sx(end) - sx(run.s)).toFixed(1) + '" height="5" class="rb-' + run.v + '"/>'; };
  for (let i = a; i < n; i++) { const v = E.verdictOf(pctA[i]); if (!run || run.v !== v) { flush(i); run = { v, s: i }; } }
  flush(n - 1);
  const xl = [[a, ymd(d.t[a])], [n - 1, '現在']]; if (fc) xl.push([n - 1 + H, H + '日後']);
  xl.forEach((x, k) => { g += '<text x="' + sx(x[0]).toFixed(1) + '" y="' + (Hh - 4) + '" class="ax" text-anchor="' + (k === 0 ? 'start' : k === 1 ? 'end' : 'middle') + '">' + x[1] + '</text>'; });
  return '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="chart" role="img" aria-label="BTC価格、移動平均、過去の判定、予測レンジ">' + g + '</svg>';
}
function equityChart() {
  const sim = S.R.hz[S.sel].sim, n = sim.T.length; if (n < 10) return '';
  const Wd = 360, Hh = 170, pl = 4, pr = 44, pt = 8, pb = 18; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, sim.E[i], sim.B[i]); hi = Math.max(hi, sim.E[i], sim.B[i]); }
  const sy = v => pt + (Math.log(hi) - Math.log(v)) / (Math.log(hi) - Math.log(lo)) * (Hh - pt - pb), sx = i => pl + i / (n - 1) * (Wd - pl - pr), step = Math.max(1, Math.floor(n / 500));
  const ln = arr => { const p = []; for (let i = 0; i < n; i += step) p.push([sx(i), sy(arr[i])]); p.push([sx(n - 1), sy(arr[n - 1])]); return path(p); };
  let g = '';
  logTicks(lo, hi, 3).forEach(v => { g += '<line x1="' + pl + '" x2="' + (Wd - pr) + '" y1="' + sy(v).toFixed(1) + '" y2="' + sy(v).toFixed(1) + '" class="grid"/><text x="' + (Wd - pr + 4) + '" y="' + (sy(v) + 3).toFixed(1) + '" class="ax">' + (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '倍</text>'; });
  g += '<path d="' + ln(sim.B) + '" class="ma200"/><path d="' + ln(sim.E) + '" class="px"/>';
  g += '<text x="' + pl + '" y="' + (Hh - 3) + '" class="ax">' + ymd(sim.T[0]) + '</text><text x="' + (Wd - pr) + '" y="' + (Hh - 3) + '" class="ax" text-anchor="end">' + ymd(sim.T[n - 1]) + '</text>';
  return '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="chart" role="img" aria-label="シグナルに従った場合と持ち続けた場合の資産推移">' + g + '</svg>';
}
function strikeChart() {
  const o = S.opt.main, price = S.price, ks = o.strikes.filter(k => k.K > price * 0.65 && k.K < price * 1.45 && (k.c + k.p) > 0); if (ks.length < 3) return '';
  const Wd = 360, Hh = 180, pl = 4, pr = 4, mid = 84, mx = Math.max(...ks.map(k => Math.max(k.c, k.p))), lo = ks[0].K, hi = ks[ks.length - 1].K;
  const sx = K => pl + 8 + (K - lo) / (hi - lo) * (Wd - pl - pr - 16), bw = Math.max(2, Math.min(10, (Wd - 24) / ks.length - 1.5));
  let g = '<line x1="' + pl + '" x2="' + (Wd - pr) + '" y1="' + mid + '" y2="' + mid + '" class="grid"/>';
  ks.forEach(k => { const x = sx(k.K) - bw / 2; g += '<rect x="' + x.toFixed(1) + '" y="' + (mid - k.c / mx * 70).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (k.c / mx * 70).toFixed(1) + '" class="bar-c"/><rect x="' + x.toFixed(1) + '" y="' + mid + '" width="' + bw.toFixed(1) + '" height="' + (k.p / mx * 70).toFixed(1) + '" class="bar-p"/>'; });
  const vline = (K, cls, label, up) => { if (K < lo || K > hi) return; const x = sx(K); g += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="10" y2="158" class="' + cls + '"/><text x="' + x.toFixed(1) + '" y="' + (up ? 8 : 168) + '" class="ax" text-anchor="middle">' + label + '</text>'; };
  vline(price, 'nowl', '現値', true); vline(o.maxPain, 'med', 'マックスペイン', false);
  g += '<text x="' + pl + '" y="178" class="ax">' + kfmt(lo) + '</text><text x="' + (Wd - pr) + '" y="178" class="ax" text-anchor="end">' + kfmt(hi) + '</text>';
  return '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="chart" role="img" aria-label="権利行使価格ごとの建玉。上がコール、下がプット">' + g + '</svg>';
}
function clusterChart() {
  const cl = S.liq.clusters; if (!cl || !cl.all.length) return '';
  const price = S.price, rows = []; for (let k = -15; k < 15; k++) rows.push({ k, L: 0, S: 0 });
  cl.all.forEach(x => { const k = Math.floor((x.p / price - 1) * 100); if (k >= -15 && k < 15) rows[k + 15][x.side] += x.w; });
  const mx = Math.max(...rows.map(r => Math.max(r.L, r.S))) || 1, Wd = 360, rh = 6, Hh = 30 * rh + 16, pl = 60;
  let g = '';
  rows.forEach((r, i) => { const y = 8 + (29 - i) * rh, w = (r.k < 0 ? r.L : r.S) / mx * (Wd - pl - 8); if (w > 0.3) g += '<rect x="' + pl + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + (rh - 1.5) + '" class="' + (r.k < 0 ? 'bar-p' : 'bar-c') + '"/>'; });
  [-15, -10, -5, 0, 5, 10, 15].forEach(p => { const y = 8 + (15 - p) * rh; g += '<text x="' + (pl - 6) + '" y="' + (y + 3) + '" class="ax" text-anchor="end">' + (p === 0 ? '現値 ' : (p > 0 ? '+' : '') + p + '% ') + kfmt(price * (1 + p / 100)) + '</text>'; if (p === 0) g += '<line x1="' + pl + '" x2="' + (Wd - 4) + '" y1="' + y + '" y2="' + y + '" class="nowl"/>'; });
  return '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="chart" role="img" aria-label="現値の上下15%にある清算の集中帯の推定">' + g + '</svg>';
}
function spark(vals, cls) {
  const v = vals.filter(ok); if (v.length < 3) return '';
  const lo = Math.min(...v), hi = Math.max(...v), Wd = 120, Hh = 28, p = v.map((x, i) => [i / (v.length - 1) * Wd, 2 + (hi - x) / ((hi - lo) || 1) * (Hh - 4)]);
  return '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="spark" aria-hidden="true"><path d="' + path(p) + '" class="' + (cls || 'px') + '"/></svg>';
}

/* ================= render ================= */
const railHTML = h => {
  const z = S.R.hz[h.k], a = S.act[h.k], p = z.pct, fc = z.fc, st = z.ev.status;
  const sub = !ok(p) ? '履歴が足りず判定できません' : fc ? '同じ水準だった過去 ' + fc.n + ' 日では、' + h.d + '日後に上昇 ' + pc(fc.up, 0, false) + '、中央値 ' + pc(fc.q50) : '';
  const note = a.why.length ? '<span class="rail-why">スコア上は「' + E.VERDICT[a.raw] + '」ですが引き下げています（' + a.why.join('、') + '）</span>' : '';
  const warn = st === 'warn' ? '<span class="rail-why">直近2年はこの時間軸のシグナルが平均を下回っています</span>' : st === 'bad' && !a.why.length ? '<span class="rail-why">この時間軸は検証で優位性を確認できていません</span>' : '';
  return '<button class="rail' + (S.sel === h.k ? ' on' : '') + '" data-h="' + h.k + '" aria-pressed="' + (S.sel === h.k) + '">' +
    '<span class="rail-head"><span class="rail-name">' + h.name + '<small>' + h.span + '</small></span><span class="rail-verdict v-' + a.a + '">' + E.VERDICT[a.a] + '</span></span>' +
    '<span class="track"><i class="z za"></i><i class="z zw"></i><i class="z zt"></i><i class="z zb"></i>' + (S.prov && ok(S.prov.pct[h.k]) && Math.abs(S.prov.pct[h.k] - p) >= 3 ? '<b class="needle pv" style="left:' + S.prov.pct[h.k].toFixed(1) + '%" title="暫定"></b>' : '') + (ok(p) ? '<b class="needle" style="left:' + p.toFixed(1) + '%"><em class="num">' + Math.round(p) + '</em></b>' : '') + '</span>' +
    (S.prov && ok(S.prov.pct[h.k]) && Math.abs(S.prov.pct[h.k] - p) >= 3 ? '<span class="rail-sub">暫定（今日がこのまま終わった場合）：<span class="num">' + Math.round(S.prov.pct[h.k]) + '</span>　' + E.VERDICT[S.prov.acts[h.k].a] + '</span>' : '') +
    '<span class="rail-sub">' + sub + '</span>' + note + warn + '</button>';
};
function provBox() {
  const v = S.prov, p = S.plan; if (!v || !p) return S.liveRow && S.freshDaily ? '<p class="prov same">暫定の判定は、今日の日足が15%進んでから出します（朝9時が0%）。</p>' : '';
  const el = Math.round(v.frac * 100), nm = { buy: '買う', limit: '指値で待つ', skip: '買わない' };
  const chg = E.HORIZONS.filter(h => h.k !== 'd' && v.acts[h.k].a !== S.act[h.k].a).map(h => h.name + 'が「' + E.VERDICT[S.act[h.k].a] + '」→「' + E.VERDICT[v.acts[h.k].a] + '」');
  if (v.a === p.a) return '<p class="prov same">暫定：今の値段のまま今日が終わっても、結論は同じです' + (chg.length ? '（' + chg.join('、') + '）' : '') + '。今日の日足は ' + el + '% 経過。</p>';
  const up = ORDERP.indexOf(v.a) > ORDERP.indexOf(p.a);
  return '<div class="prov chg ' + (up ? 'pu' : 'pd') + '"><b>暫定：このまま今日が終わると、明日朝9時の結論は「' + nm[v.a] + '」に変わります</b><p>' + (chg.length ? chg.join('、') + '。' : '') + '今日の日足は ' + el + '% 経過' + (el < 60 ? '。まだ変わりやすい時間帯です' : '。残りが少ないので、確定に近い値です') + '。</p><p>' +
    (up ? '置いていかれたくない場合は、確定を待たずに予定の一部だけ先に入れる方法があります。暫定は確定までに元に戻ることもあります。' : '買いを考えていた場合は、確定を待つか、量を減らす判断材料になります。') + '</p></div>';
}
const ORDERP = ['skip', 'limit', 'buy'];
/* ---------- 底と買い場の見込み ---------- */
// 過去3回の底値圏（半減期から750〜1100日目）で、中期スコアが20以下だった日から「買い好機」が出るまで（research/wait.js）
const WAIT = { med: 106, q25: 52, q75: 170, dnMed: -0.19, dnQ25: -0.49, pxMed: 0.0, pxQ25: -0.16, pxQ75: 0.29 };
function bottomOutlook() {
  const c = S.cyc, L = S._L, ls = S._ls; if (!c || !L || !ls || !S.R) return null;
  const n = L.c.length, px = L.c[n - 1], peak = c.cur.peak, now = Date.now();
  const daysTop = Math.floor((now - c.cur.peakT) / DAY), past = c.past;
  const r = ls.resid[n - 1], w = ls.w200[n - 1], w200 = px / Math.exp(w), atResid = q => px * Math.exp(q - r);
  // 値段のシナリオ
  const lowSoFar = c.cur.low, pastDD = past.map(x => x.dd), pastResid = past.map(x => { let k = 0; for (let i = 0; i < n; i++) if (L.t[i] >= x.lowT) { k = i; break; } return ls.resid[k]; });
  const pastW = past.map(x => { let k = 0; for (let i = 0; i < n; i++) if (L.t[i] >= x.lowT) { k = i; break; } return ok(ls.w200[k]) ? Math.exp(ls.w200[k]) - 1 : NaN; }).filter(ok);
  const lev = [];
  lev.push({ p: peak * 0.4, why: '天井から-60%' });
  if (pastW.length) lev.push({ p: w200 * (1 + Math.min(...pastW)), why: '200週線の' + pc(Math.min(...pastW), 0) + '（前回の底）' });
  const rMid = pastResid.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, pastResid.length - 1); lev.push({ p: atResid(rMid), why: '長期成長線に対して、直近2回の底と同じ位置' });
  const below = lev.filter(x => x.p < px * 0.97), above = lev.filter(x => x.p >= px * 0.97);
  const zone = below.length ? { lo: Math.min(...below.map(x => x.p)), hi: Math.max(...below.map(x => x.p)), lev: below, above } : null;
  const deep = peak * (1 + Math.max(...pastDD));
  // 時期
  const tdays = past.map(x => Math.round((x.lowT - x.peakT) / DAY)), hdays = past.map(x => x.lowDay);
  const timeDone = daysTop >= Math.max(...tdays) && c.day >= Math.max(...hdays);
  // 数週間の下値（30日）
  const fm = S.R.hz.m.fc, near = [];
  if (fm) { near.push({ p: S.price * (1 + fm.q25), why: '30日以内：似た状況の過去で、4回に1回はここまで下げた' }); near.push({ p: S.price * (1 + fm.q10), why: '30日以内：10回に1回はここまで下げた' }); }
  const cl = S.liq && S.liq.clusters && S.liq.clusters.below && S.liq.clusters.below[0]; if (cl) near.push({ p: cl.p, why: 'ロング清算の集中帯（推定）。下ヒゲで突きやすい' });
  if (S.opt && S.opt.putWall) near.push({ p: S.opt.putWall.K, why: 'プット建玉の壁' });
  // 買い判定までの見込み
  const mNow = S.R.hz.m.pct, lowScore = ok(mNow) && mNow <= 20;
  const eta = lowScore ? { from: now + WAIT.q25 * DAY, to: now + WAIT.q75 * DAY, med: now + WAIT.med * DAY } : null;
  return { px, peak, daysTop, day: c.day, dd: px / peak - 1, w200, wr: Math.exp(w) - 1, valPct: c.valPct, lowSoFar, lowT: c.cur.lowT, zone, deep, tdays, hdays, timeDone, near: near.filter(x => ok(x.p) && x.p < S.price).sort((a, b) => b.p - a.p), mNow, eta };
}
function bottomGauge() {
  // 底らしさ：いくつかの指標が、今のサイクルの天井の日から「過去の底の水準」までのどこまで来たか。過去の底の値のうち一番穏やかなものを目標にする（research/botind.py）
  const c = S.cyc, L = S._L, ls = S._ls; if (!c || !L || !ls) return null;
  const n = L.c.length, t = L.t, C = L.c, idx = new Map(); t.forEach((x, i) => idx.set(dkey(x), i));
  const at = T => { let k = -1; for (let i = 0; i < n; i++) { if (t[i] <= T) k = i; else break; } return k; };
  const mk = () => new Array(n).fill(NaN), fromOc = key => { const a = mk(); ((S.oc && S.oc[key]) || []).forEach(([d, v]) => { const i = idx.get(d); if (i != null) a[i] = +v; }); return a; };
  const ff = a => { let last = NaN, gap = 0; for (let i = 0; i < n; i++) { if (a[i] === a[i]) { last = a[i]; gap = 0; } else if (last === last && ++gap <= 3) a[i] = last; } return a; };
  const mvrv = ff(fromOc('mvrv')), mr = fromOc('minerrev'), fng = ff(fromOc('fng')), hr = fromOc('hash');
  const sm = (a, w) => { const o = mk(); let s = 0, q = 0; for (let i = 0; i < n; i++) { const x = a[i]; if (x === x) { s += x; q++; } if (i >= w) { const y = a[i - w]; if (y === y) { s -= y; q--; } } if (i >= w - 1 && q >= w * 0.9) o[i] = s / q; } return o; };
  const m200 = sm(C, 200), mr365 = sm(mr, 365), f30 = sm(fng, 30), h30 = sm(hr, 30), h60 = sm(hr, 60);
  const wk = []; for (let i = n - 1; i >= 0; i -= 7) wk.unshift(i); const wr = E.rsi(Float64Array.from(wk.map(i => C[i])), 14), wrsi = mk(); wk.forEach((i, k) => { for (let j = i; j < Math.min(n, i + 7); j++) wrsi[j] = wr[k]; });
  let mx = 0; const dd = C.map(x => { mx = Math.max(mx, x); return x / mx - 1; });
  const w2 = Array.from(ls.w200, x => Math.exp(x));
  const SER = [['MVRV（時価総額÷実現時価総額）', mvrv, 0.60, x => x.toFixed(2)], ['マイナー収入（1年平均比）', mr.map((x, i) => x / mr365[i]), 0.63, x => x.toFixed(2)], ['週足RSI', wrsi, 0.59, x => x.toFixed(0)], ['天井からの下落', dd, 0.56, x => pc(x, 0)], ['200週線比', w2, 0.47, x => x.toFixed(2)], ['200日線比', C.map((x, i) => x / m200[i]), 0.45, x => x.toFixed(2)]];
  const pk = at(c.cur.peakT), lows = c.past.map(p => at(p.lowT)).filter(i => i >= 0), i0 = n - 1, parts = []; let tot = 0, ws = 0;
  SER.forEach(([nm, a, w, fmt]) => {
    const bots = lows.map(i => a[i]).filter(ok), now = a[i0], top = a[pk]; if (!bots.length || !ok(now) || !ok(top)) return;
    const tgt = Math.max(...bots); if (!(top > tgt)) return;
    const p = Math.min(1, Math.max(0, (top - now) / (top - tgt))); tot += p * w; ws += w;
    parts.push({ nm, p, now: fmt(now), bots: bots.map(fmt).join('・') });
  });
  const extra = [];
  if (ok(fng[i0])) extra.push('恐怖と強欲指数 ' + fng[i0] + (ok(f30[i0]) ? '（30日平均 ' + Math.round(f30[i0]) + '）' : '') + '。極度の恐怖（25以下）は底の近く以外でもよく出るため、底らしさには入れていません');
  if (ok(h30[i0]) && ok(h60[i0])) extra.push('ハッシュレートの30日平均は60日平均の' + pc(h30[i0] / h60[i0] - 1, 1) + (h30[i0] < h60[i0] ? '（マイナーの撤退中。回復すると「ハッシュリボン」の買いの合図）' : ''));
  return ws ? { g: tot / ws, parts, extra } : null;
}
function stageOf() { // まだ／準備／買い の3段階
  const p = S.plan, m = S.R.hz.m.pct, ph = S.cyc ? S.cyc.phase : null, inPhase = ph === 'bottom' || ph === 'recover';
  if (p && p.a === 'buy') return { k: 'buy', name: '買い', cls: 'v-buy', text: '買い判定が出ています。上の「今日どうするか」のとおりに買ってください。' };
  if (inPhase && ok(m) && m >= 40) return { k: 'ready', name: '準備', cls: 'v-wait', text: '中期の判定が持ち直してきました（今 ' + Math.round(m) + '、買い好機は75）。過去の底値圏では、この段階から半分くらいの確率で、1か月前後で買い判定が出ています（残りは、いったん弱まりました）。予定額を手元に用意して、毎日見てください。' };
  return { k: 'wait', name: 'まだ', cls: 'v-avoid', text: inPhase ? '中期の判定はまだ弱いままです（今 ' + (ok(m) ? Math.round(m) : '—') + '）。40を超えると「準備」に変わります。' : 'サイクルは' + (S.cyc ? S.cyc.name : '不明') + 'です。' };
}
function bottomCard() {
  const b = S.bo; if (!b) return '';
  const f = t => { const d = new Date(t); return (d.getMonth() + 1) + '月' + (d.getDate() <= 10 ? '上旬' : d.getDate() <= 20 ? '中旬' : '下旬'); };
  const scen = [
    ['底はもう付けた', usd(b.lowSoFar) + '（' + md(b.lowT) + '）', b.timeDone ? '時期は過去の底をすべて過ぎている（天井から' + b.daysTop + '日、過去は' + b.tdays.join('・') + '日）' : '時期はまだ過去の底の範囲内'],
    b.zone ? ['もう一段下げて底', usd(b.zone.lo) + '〜' + usd(b.zone.hi), b.zone.lev.map(x => x.why + ' ' + usd(x.p)).join('、') + (b.zone.above.length ? '。なお' + b.zone.above.map(x => x.why).join('、') + 'の水準（' + b.zone.above.map(x => usd(x.p)).join('、') + '）には、もう届いています' : '')] : ['もう一段下げて底', '—', '過去の底の基準になる水準には、すでにすべて届いています'],
    ['過去並みの深い下げ', usd(b.deep) + '前後', '天井から' + pc(b.deep / b.peak - 1, 0) + '（過去の底の下落率のうち一番浅い値）。下落率は回を追って浅くなっていて、可能性は低め']
  ];
  const near = b.near.slice(0, 4).map(x => '<li><b class="num">' + usd(x.p) + '</b><span class="num dist">' + pc(x.p / S.price - 1) + '</span><span>' + esc(x.why) + '</span></li>').join('');
  const sg = stageOf(), gg = S.bg;
  const gauge = gg ? '<h3>底らしさ <span class="num">' + Math.round(gg.g * 100) + '%</span></h3><p class="sub" style="margin-top:0">天井の日を0%、過去の底の水準を100%として、今どこまで来たか（6つの指標の加重平均）。</p><ul class="gauge">' + gg.parts.map(x => '<li><span>' + esc(x.nm) + '</span><span class="gbar"><b style="width:' + Math.round(x.p * 100) + '%"></b></span><span class="num">' + Math.round(x.p * 100) + '%</span><span class="sub2">今 ' + x.now + '／過去の底 ' + x.bots + '</span></li>').join('') + '</ul>' + gg.extra.map(x => '<p class="sub">' + esc(x) + '</p>').join('') + '<p class="sub">過去の検証では、この数字が高まるのは底の数か月前からで、「あと何日」を当てる力はありません。底値圏にいることの確認に使い、買う日は下の判定で決めます。</p>' : '';
  return '<section class="card"><div class="row"><h2>底と買い場の見込み</h2><b class="' + sg.cls + '">' + sg.name + '</b></div><p>' + esc(sg.text) + '</p>' + gauge +
    '<p>今は天井から <b class="num">' + pc(b.dd, 0) + '</b>、' + b.daysTop + '日。半減期から' + b.day + '日目。200週線の' + pc(b.wr, 0) + '、長期成長線に対して過去の下位' + pc(b.valPct, 0, false) + 'の安さです。</p>' +
    '<h3>底の値段のシナリオ</h3><table class="tbl"><tbody>' + scen.map(x => '<tr><th>' + x[0] + '</th><td class="num">' + x[1] + '</td></tr><tr><td colspan="2" class="sub" style="text-align:left;padding-top:0">' + esc(x[2]) + '</td></tr>').join('') + '</tbody></table>' +
    (near ? '<h3>この先数週間の下値の目安</h3><ul class="clist">' + near + '</ul>' : '') +
    '<h3>買い判定（買う）が出るまでの見込み</h3>' + (b.eta ? '<p>中期の判定が今と同じくらい弱かった日から、過去3回の底値圏で買い判定が出るまでは、中央値で' + WAIT.med + '日、半分のケースが' + WAIT.q25 + '〜' + WAIT.q75 + '日でした。今日から数えると <b>' + f(b.eta.from) + '〜' + f(b.eta.to) + '</b>（中心は' + f(b.eta.med) + '）です。</p><p class="sub">その間にさらに下げた幅は中央値で' + pc(WAIT.dnMed, 0) + '、悪い方の4回に1回は' + pc(WAIT.dnQ25, 0) + '。買い判定が出た日の値段は、今日の値段と比べて中央値で' + pc(WAIT.pxMed, 0) + '（' + pc(WAIT.pxQ25, 0) + '〜' + pc(WAIT.pxQ75, 0) + '）でした。底で買うのではなく、底を打って上向いたのを確認した値段で買う、という見込みです。</p>' : '<p>中期の判定はすでに弱い水準を抜けています（今は' + Math.round(b.mNow) + '、買い好機は75以上）。買い判定は近いうちに出る可能性があります。上の「今日どうするか」と暫定の枠を毎日見てください。</p>') +
    '<p class="sub">準備の目安：見込みの時期に入るまでに、予定額と、4回に分けたときの1回分を決めておく。時期に入ったら毎日、朝9時以降に結論を見る。</p>' +
    '<p class="sub">この見込みは毎朝9時の確定データで計算し直します。根拠は過去3回のサイクルだけなので、時期も値段も幅を持って見てください。毎日の見込みは記録して、後で当たり外れを確かめます。</p></section>';
}
function todayCard() {
  const p = S.plan; if (!p) return '';
  const cls = PLAN[p.a][1], t = p.target, lab = planLabel(p.a);

  const nb = p.n || 0;
  let lead = p.a === 'buy'
    ? (p.kind === 'add' ? '買い判定が続いています。予定額の4分の1を買い足します（' + (nb + 1) + '回目／4回）。' : '買い判定が出ました。予定額の4分の1を買います（1回目／4回）。残りは、14日以上あけて判定が続いていれば買い足します。')
    : '今は買いません。下の条件がすべてそろった日に「買う」に変わります。';
  const syms = Object.keys(p.stocks);
  const rows = syms.map(sym => {
    const x = p.stocks[sym], sc = PLAN[x.a][1], sl = planLabel(x.a);
    const lines = [];
    const an = S.stocks[sym].an;
    lines.push(['終値（' + an.date.slice(5).replace('-', '/') + ' 通常取引）', usd2(an.px)]);
    lines.push(['いまの値段の目安（BTCの現在値から換算）', usd2(x.now) + (ok(an.estErr) ? ' ±' + (an.estErr * 100).toFixed(1) + '%' : '')]);
    if (x.a === 'limit') { lines.push(['指値', usd2(x.lim)]); }
    if (ok(x.lo)) lines.push(['今日の予測値幅（朝9時に固定）', usd2(x.lo) + '〜' + usd2(x.hi)]);
    const lev = sym === 'MSTR' ? 'MSTU' : 'CONL', en = etfAt(lev, S.price);
    if (ok(en)) lines.push([lev + '（2倍）の目安', usd2(en)]);
    return '<div class="plan-stock"><div class="row"><b class="sym">' + sym + '</b><b class="' + sc + ' plan-v">' + sl + '</b></div><dl class="kv">' + lines.map(l => '<dt>' + l[0] + '</dt><dd class="num">' + l[1] + '</dd>').join('') + '</dl>' + (x.note.length ? '<p class="sub">' + x.note.join('。') + '</p>' : '') + '</div>';
  }).join('');
  const btc = [];
  if (p.a === 'buy') btc.push('下に指値を置いて待たず、この取引時間のうちに買ってください。過去の買い判定の日に4%下へ指値を置いて2週間待つと、届いたのは3回に1回で、届かずに上で買い直した分、平均で約7%高い買値になりました');
  if (p.rng) { const rr = rangeRecord(); btc.push('今日（朝9時〜翌朝9時）のBTCの予測値幅 <span class="num">' + usd(p.rng.lo) + '〜' + usd(p.rng.hi) + '</span>。今日の始値 ' + usd(p.rng.open) + ' を中心に、' + p.rng.src + 'で ' + hm(p.rng.at) + ' に決めた値で、翌朝9時まで変えません' + (rr.n >= 5 ? '。これまで終値がこの幅に収まったのは ' + rr.n + '日中 ' + rr.inC + '日' : '')); }
  const fd = S.R.hz.d, u = S.up;
  if (u && u.type === 'lid' && p.a !== 'skip' && ok(u.lidLv)) btc.push('上は ' + '<span class="num">' + usd(u.lidLv) + '</span> 付近で蓋をされやすい形です。買った後はそこで一部の利益確定を考えます');
  if (u && u.type === 'squeeze' && ok(u.tgt)) btc.push('踏み上げ型です。上がり始めたら <span class="num">' + usd(u.tgt) + '</span> 付近まで走りやすく、指値が置いていかれることもあります');
  const chk = (p.chk || []).length ? '<ul class="why2 chks">' + p.chk.map(x => '<li class="' + (x.ok ? 'up' : 'dn') + ' chk">' + esc(x.text) + '</li>').join('') + '</ul>' : '';
  const buys = cycleBuys(), rec = '<div class="buyrec"><span>このサイクルで買った回数：<b class="num">' + buys.length + '</b>／4' + (buys.length ? '（最後は ' + md(buys[buys.length - 1].t) + '、BTC ' + usd(buys[buys.length - 1].btc) + '）' : '') + '</span><span><button class="link" id="buy-add">買ったので記録する</button>' + (buys.length ? '　<button class="link" id="buy-undo">最後の記録を取り消す</button>' : '') + '</span></div>';
  return '<section class="today">' + sessionStrip() + cycleStrip() + '<h1 class="' + cls + '">' + lab + '</h1><p class="today-lead">' + lead + '</p>' + chk + rec + provBox() +
    (rows || '<p class="sub">MSTR・COINの株価を読み込めていないため、BTCの価格で表示しています。</p>') +
    '<ul class="today-btc">' + btc.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
    '<p class="sub">この買い方を過去4回のサイクルに当てはめると、4回買い終えた後の含み損は最大で7〜25%（BTC）、過去3回は次の天井までに5.6〜74倍でした（今回のサイクルは進行中で、含み損25%の側にいます）。MSTR・COINの含み損はその1.5倍前後、MSTU・CONLはさらに大きくなります。詳しくは検証タブにあります。株価は BTCとの連動（ベータ）から換算した目安で、±の数字は過去2年の平均的なずれです。2倍ETFのずれはその約2倍になります。正確な値段はmoomooで確認してください。</p></section>';
}
function viewJudge() {
  if (!S.R) return '<section class="card"><p class="muted">データを読み込んでいます…</p></section>';
  const hz = S.R.hz[S.sel], H = E.HORIZONS.find(h => h.k === S.sel), price = S.price;
  const lv = { warn: '注意', info: '参考', good: '好材料' };
  const flags = S.flags.length ? '<ul class="flags">' + S.flags.map(f => '<li class="f-' + f.lv + '"><b>' + f.src + '</b><span>' + esc(f.text) + '</span><i>' + lv[f.lv] + '</i></li>').join('') + '</ul>' : '';
  const cats = Object.keys(E.CATS).map(k => { const p = hz.sc.catPct[k]; return '<div class="cat"><span>' + E.CATS[k] + '</span><span class="cat-bar">' + (ok(p) ? '<b style="width:' + p.toFixed(0) + '%" class="cb-' + E.verdictOf(p) + '"></b>' : '') + '</span><span class="num">' + (ok(p) ? Math.round(p) : '—') + '</span></div>'; }).join('');
  const fs = hz.sc.factors.filter(f => f.contrib).sort((x, y) => Math.abs(y.contrib) - Math.abs(x.contrib)).slice(0, 6);
  const facts = fs.length ? '<ul class="facts">' + fs.map(f => '<li><span class="' + (f.contrib > 0 ? 'up' : 'dn') + '">' + (f.contrib > 0 ? '押し上げ' : '押し下げ') + '</span><span>' + f.label + '</span><span class="num">' + f.text + '</span></li>').join('') + '</ul>' : '';
  const stockCols = ['MSTR', 'COIN'].filter(s => S.stocks[s] && S.stocks[s].an);
  const zrow = (z, up) => '<li class="zrow"><div><b class="num">' + (z.hi / z.lo - 1 > 0.002 ? usd(z.lo) + '〜' + usd(z.hi) : usd(z.mid)) + '</b><span class="num dist">' + pc(z.dist) + '</span>' + (!up ? '<span class="str" title="根拠の重なり">' + '●'.repeat(Math.min(4, z.strength)) + '</span>' : '') + '</div><p>' + [...new Set(z.items.map(i => i.label))].join('、') + '</p>' +
    (!up ? '<p class="sub">割れたら撤退を考える目安 <span class="num">' + usd(z.stop) + '</span>' + stockCols.map(s => { const an = S.stocks[s].an; return '　' + s + ' 換算 <span class="num">' + usd2(an.px * (1 + an.beta * (z.mid / an.btcAt - 1))) + '</span>'; }).join('') + '</p>' : '') + '</li>';
  const below = S.zones.below.slice(0, 5).map(z => zrow(z, false)).join('') || '<li class="muted">現値より下に目立った節目がありません。</li>';
  const above = S.zones.above.slice(0, 3).map(z => zrow(z, true)).join('');
  const fcRows = E.HORIZONS.map(h => { const f = S.R.hz[h.k].fc; return f ? '<tr><th>' + h.d + '日後</th><td class="num">' + usd(price * (1 + f.q25)) + '〜' + usd(price * (1 + f.q75)) + '</td><td class="num">' + usd(price * (1 + f.q50)) + '</td><td class="num">' + pc(f.up, 0, false) + '</td></tr>' : ''; }).join('');
  const im = S.opt && ok(S.opt.move7) ? '<p class="sub">オプション市場が織り込む変動幅（1標準偏差）：7日で ±' + pc(S.opt.move7, 1, false) + '、30日で ±' + pc(S.opt.move30, 1, false) + '</p>' : '';
  const stat = Object.keys(S.status).map(k => { const s = S.status[k]; return '<li class="' + (s.ok ? 'ok' : 'ng') + '"><b>' + s.name + '</b><span>' + esc(s.note || '') + '</span></li>'; }).join('');
  return todayCard() + bottomCard() + pickCard() + holdCards() + '<h2 class="sec">時間軸ごとの判定</h2>' +
    '<section class="rails" aria-label="時間軸ごとの判定">' + E.HORIZONS.filter(h => h.k !== 'd').map(railHTML).join('') + '<p class="legend"><span><i class="z za"></i>見送り</span><span><i class="z zw"></i>様子見</span><span><i class="z zt"></i>打診買い</span><span><i class="z zb"></i>買い好機</span></p></section>' +
    flags + cycleCard() + upsideCard(false) +
    '<section class="card"><h2>' + H.name + 'の判定の内訳</h2><div class="cats">' + cats + '</div>' + facts + '<p class="sub">各要因の重みは、過去4年のデータで ' + H.d + ' 日後の値動きと実際に連動していた度合いから毎回計算し直しています。</p></section>' +
    '<section class="card"><div class="row"><h2>価格と予測レンジ</h2><div class="seg" role="group" aria-label="表示期間">' + [[90, '3か月'], [365, '1年'], [1460, '4年']].map(r => '<button data-range="' + r[0] + '" aria-pressed="' + (S.range === r[0]) + '">' + r[1] + '</button>').join('') + '</div></div>' + priceChart() +
    '<p class="keys"><span><i class="k-px"></i>終値</span><span><i class="k-50"></i>50日線</span><span><i class="k-200"></i>200日線</span><span><i class="k-cone"></i>予測の幅（濃い帯は50%、薄い帯は80%）</span><span><i class="k-zone"></i>エントリー候補</span></p><p class="sub">チャート下の帯は、その日に出ていた' + H.name + '判定です。</p></section>' +
    '<section class="card"><h2>エントリー候補の価格帯</h2><p class="sub">現値 <span class="num">' + usd(price) + '</span> より下で、テクニカル・出来高・オプション・清算の節目が重なる水準です。●が多いほど根拠が重なっています。</p><ul class="zones">' + below + '</ul>' + (above ? '<h3>上値の節目</h3><ul class="zones">' + above + '</ul>' : '') + '</section>' +

    '<section class="card"><h2>データの取得状況</h2><ul class="stat">' + stat + '</ul><p class="sub">判定に使う日足は ' + ymd(S.d.t[S.d.c.length - 1]) + '（UTC）の確定分まで。開いている間は5分ごとに更新します。</p></section>' +
    '<p class="disc">過去データの統計にもとづく目安で、将来の値動きを保証するものではありません。投資の判断はご自身の責任で行ってください。</p>';
}

function ruleSignals() { // 今のサイクルで、買いルールが実際に点いた日（この端末のデータで再計算）
  const c = S.cyc, d = S.d; if (!c || !d) return null;
  const p = S.R.hz.m.sc.pct, from = c.cur.h + 750 * DAY, out = []; let last = -1e18;
  for (let i = 0; i < d.c.length && out.length < MAXBUY; i++) { if (d.t[i] < from || !ok(p[i])) continue; const okk = out.length === 0 ? p[i] >= E.TH.buy : (p[i] >= E.TH.try_ && d.t[i] - last >= ADD_GAP * DAY); if (okk) { out.push({ t: d.t[i], px: d.c[i] }); last = d.t[i]; } }
  if (!out.length) return { out, avg: NaN, dd: NaN };
  const avg = out.length / out.reduce((a, b) => a + 1 / b.px, 0); let mn = Infinity; for (let i = 0; i < d.c.length; i++) if (d.t[i] >= out[out.length - 1].t) mn = Math.min(mn, d.c[i]);
  return { out, avg, dd: mn / avg - 1, now: S.price / avg - 1 };
}
function fixedCard() {
  const rr = rangeRecord();
  return '<section class="card"><h2>予測と、いまの値の違い</h2><ul class="exit"><li><b>予測（朝9時に決めて、翌朝9時まで変えない）</b>：買う／買わない、短期・中期・長期の判定、今日の予測値幅、その先7日〜90日の値幅</li><li><b>いまの値（5分ごとに変わる）</b>：BTCの現在値、それを換算した株価の目安、清算やオプションの状況</li><li><b>暫定</b>：今の値段のまま今日が終わった場合の判定。わざと動くように作っている、確定前の速報です</li></ul>' +
    '<p class="sub">予定外に判定が変わるのは、重要イベントが48時間以内に入ったときと、清算リスクが警戒水準を超えたときだけです。</p>' +
    (rr.n ? '<p>今日の予測値幅の答え合わせ：' + rr.n + '日中、終値が幅に収まったのは ' + rr.inC + '日、1日中その幅の中で動いたのは ' + rr.inHL + '日です。オプションの値幅は「7割前後の日は終値がこの中に収まる」くらいの幅です。</p>' : '<p class="sub">今日の予測値幅は、翌朝9時の確定後に、終値が幅に収まったかを自動で記録していきます。</p>') + '</section>';
}
function ruleCard() {
  const r = ruleSignals();
  const rows = [['2015年', '1/26・2/13・2/27・3/13', '$261', '-21%', '74倍'], ['2019年', '4/2・4/16・5/3・5/17', '$5,641', '-14%', '12倍'], ['2023年', '1/12・1/26・2/15・3/13', '$22,358', '-7%', '5.6倍']];
  const cur = r && r.out.length ? '<tr><th>今回</th><td>' + r.out.map(x => md(x.t)).join('・') + '</td><td class="num">' + usd(r.avg) + '</td><td class="num">' + pc(r.dd, 0) + '</td><td>進行中</td></tr>' : '<tr><th>今回</th><td colspan="4">まだ買い判定は出ていません</td></tr>';
  return '<section class="card"><h2>買い判定のルールと、過去の結果</h2><p>買い判定は次のルールで出しています。</p><ul class="exit"><li>1回目：半減期から750日目以降（底値圏〜回復期）で、中期の判定が「買い好機」になった日</li><li>買い足し：前回から14日以上たち、中期の判定が「打診買い」以上の日。合計4回まで</li><li>重要イベントの48時間前と、ロングの清算リスクが警戒水準の日は見送る</li></ul>' +
    '<table class="tbl"><thead><tr><th>底の年</th><th>買い判定の日</th><th>平均の買値</th><th>最大の含み損</th><th>次の天井まで</th></tr></thead><tbody>' + rows.map(x => '<tr><th>' + x[0] + '</th><td>' + x[1] + '</td><td class="num">' + x[2] + '</td><td class="num">' + x[3] + '</td><td class="num">' + x[4] + '</td></tr>').join('') + cur + '</tbody></table>' +
    (r && r.out.length ? '<p class="sub">今回のサイクルでは、すでに買い判定が ' + r.out.length + ' 回出ていて、その平均の買値に対して今は ' + pc(r.now, 0) + ' です。判定が出た後に下げが続いた形で、過去3回より悪い展開になっています。</p>' : '') +
    '<p class="sub">BTCの値段での結果です。含み損は4回買い終えた後、その持ち高全体で見た最大の値。MSTR・COINはこの1.5倍前後、MSTU・CONLはさらに大きく動きます。</p>' +
    '<p class="sub">候補にしたルールは30通りほどで、「買った後の含み損が浅いこと」と「底から遅れすぎないこと」で選びました。時期を見ずに毎月買うと含み損は40〜55%、中期の判定が「打診買い」の段階で買い始めると28〜29%でした。ただし検証できるサイクルは4回しかなく、たまたま合っているだけの可能性は残ります。</p></section>';
}
function provRecord() {
  const log = LS.get('log', []), by = new Map(log.map(x => [x.k, x])); let n = 0, hit = 0, n6 = 0, hit6 = 0, chN = 0, chHit = 0;
  log.forEach(x => { if (!x.pv) return; const nx = by.get(dkey(Date.parse(x.k + 'T00:00:00Z') + DAY)); if (!nx || !nx.pa) return;
    const okk = x.pv.a === nx.pa; n++; if (okk) hit++; if (x.pv.f >= 0.6) { n6++; if (okk) hit6++; } if (x.pv.a !== x.pa) { chN++; if (okk) chHit++; } });
  return '<section class="card"><h2>暫定の判定は当たっていたか</h2>' + (n ? '<p>暫定の結論が翌朝の確定と同じだったのは ' + n + '回中 ' + hit + '回。日足が60%以上進んでからの暫定に限ると ' + n6 + '回中 ' + hit6 + '回。暫定が「結論が変わる」と出した ' + chN + '回のうち、実際にそうなったのは ' + chHit + '回です。</p>' : '<p class="muted">まだ記録がありません。翌朝の確定と突き合わせて、自動で集計します。</p>') + '<p class="sub">暫定は、その日に最後に開いたときの内容で記録します。</p></section>';
}
function viewVerify() {
  if (!S.R) return '';
  const h = E.HORIZONS.find(x => x.k === S.sel), z = S.R.hz[S.sel], ev = z.ev, sim = z.sim;
  const stTxt = { ok: ['有効', 'シグナルが出た日の成績が、いつ買っても同じ場合を上回っています。'], warn: ['要注意', '全期間では上回っていますが、直近2年は下回っています。この時間軸の判定は割り引いて見てください。'], bad: ['機能していない', 'シグナルの優位性を確認できません。この時間軸では買い判定を出さず「様子見」に抑えています。'], thin: ['データ不足', '検証に必要な件数が足りません。'] }[ev.status];
  const tr = (label, a, b) => '<tr><th>' + label + '</th><td class="num">' + pc(a.win, 0, false) + '</td><td class="num">' + pc(a.mean) + '</td><td class="num">' + pc(b.win, 0, false) + '</td><td class="num">' + pc(b.mean) + '</td></tr>';
  const calls = ev.calls.map(c => '<li><span class="num">' + ymd(c.t) + '</span><span class="v-' + c.v + '">' + E.VERDICT[c.v] + '</span><span class="num">' + usd(c.px) + ' → ' + usd(c.px2) + '（' + pc(c.r) + '）</span><b class="' + (c.hit === null ? 'na' : c.hit ? 'hit' : 'miss') + '">' + (c.hit === null ? '対象外' : c.hit ? '的中' : '外れ') + '</b></li>').join('');
  const judged = ev.calls.filter(c => c.hit !== null), hits = judged.filter(c => c.hit).length;
  const pend = ev.pending.map(c => '<li><span class="num">' + ymd(c.t) + '</span><span class="v-' + c.v + '">' + E.VERDICT[c.v] + '</span><span class="num">' + usd(c.px) + '</span><b class="na">' + md(c.due) + ' に判定</b></li>').join('');
  const lg = evalLog(), lz = lg.hz[S.sel];
  const live = lg.n ? '<p>' + ymd(lg.first) + ' から ' + lg.n + ' 日分を記録。' + h.name + 'では、買い系の判定 ' + lz.buyN + ' 件中 ' + lz.buyHit + ' 件が的中、見送り判定 ' + lz.avN + ' 件中 ' + lz.avHit + ' 件が的中、' + lz.pend + ' 件が判定待ちです。</p>' + (lg.risk ? '<p>ロング清算リスクが「警戒」だった日の7日後は平均 ' + pc(lg.risk.hi) + '（' + lg.risk.hiN + '件）、それ以外の日は平均 ' + pc(lg.risk.lo) + '（' + lg.risk.loN + '件）。</p>' : '<p class="sub">清算・オプションの警戒フラグは過去データがないため、ここに記録が5件以上たまった時点で当たり外れを表示します。</p>') : '<p class="muted">まだ記録がありません。</p>';
  return '<section class="lead"><h1>判定は当たっていたか</h1><p>開くたびに全期間を計算し直し、過去の判定をその後の値動きと突き合わせています。</p></section>' +
    '<div class="seg wide" role="group" aria-label="時間軸">' + E.HORIZONS.map(x => '<button data-h="' + x.k + '" aria-pressed="' + (S.sel === x.k) + '">' + x.name + '<small>' + (x.d === 1 ? '1日' : x.d + '日') + '</small></button>').join('') + '</div>' +
    '<section class="card"><div class="row"><h2>' + h.name + 'シグナルの成績</h2><span class="badge b-' + ev.status + '">' + stTxt[0] + '</span></div><p>' + stTxt[1] + '</p>' +
    '<table class="tbl"><thead><tr><th></th><th colspan="2">全期間</th><th colspan="2">直近2年</th></tr><tr><th></th><th>勝率</th><th>平均</th><th>勝率</th><th>平均</th></tr></thead><tbody>' + tr('買い系の判定の日', ev.st.sig, ev.rc.sig) + tr('いつ買っても', ev.st.all, ev.rc.all) + tr('見送り判定の日', ev.st.avoid, ev.rc.avoid) + '</tbody></table>' +
    '<p class="sub">' + h.d + '日後に上がっていれば勝ち。検証期間は ' + (ev.first >= 0 ? ymd(S.d.t[ev.first]) : '—') + ' 以降の ' + ev.st.all.n + ' 日（重なりのない独立した期間に直すと約 ' + ev.indep + ' 回分）。各日の判定には、その日までに分かっていたデータだけを使っています。</p></section>' +
    '<section class="card"><h2>シグナルどおりに売買した場合</h2>' + equityChart() + '<p class="keys"><span><i class="k-px"></i>シグナルに従う</span><span><i class="k-200"></i>持ち続ける</span></p>' +
    '<table class="tbl"><thead><tr><th></th><th>年率</th><th>最大下落</th><th>保有日の割合</th></tr></thead><tbody><tr><th>シグナルに従う</th><td class="num">' + pc(sim.cagr, 0) + '</td><td class="num">' + pc(sim.mdd, 0) + '</td><td class="num">' + pc(sim.exposure, 0, false) + '</td></tr><tr><th>持ち続ける</th><td class="num">' + pc(sim.bcagr, 0) + '</td><td class="num">' + pc(sim.bmdd, 0) + '</td><td class="num">100%</td></tr></tbody></table>' +
    '<p class="sub">スコア60以上で買い、40未満で売り、その間は維持。売買のたびに手数料0.1%を引いています。売買 ' + sim.trades + ' 回、' + sim.years.toFixed(1) + ' 年間。BTC現物での結果で、関連株の結果は「関連株」タブにあります。</p></section>' +
    '<section class="card"><div class="row"><h2>直近の答え合わせ</h2><span class="num muted">' + hits + '/' + judged.length + ' 的中</span></div><ul class="calls">' + pend + calls + '</ul><p class="sub">' + h.d + '日おきに1件ずつ。買い系は上昇で的中、見送りは下落で的中、様子見は対象外です。</p></section>' +
    ruleCard() + fixedCard() + provRecord() + '<section class="card"><h2>このアプリが記録した判定</h2>' + live + '<p class="sub">開いた日の判定をこの端末に保存し、期日が来たら自動で照合します。後から計算し直した判定ではなく、その日に実際に表示した内容の記録です。</p></section>' +
    '<details class="card"><summary>計算のしかた</summary><p>テクニカル9種、出来高4種、オプション2種（Deribit DVOL、2021年以降）、資金調達率2種（Binance先物、2019年以降）、長期サイクル2種（長期成長線と200週線からの乖離。長期の判定だけに使用）の指標を毎日計算します。各指標が過去4年間で「' + h.d + '日後のリターン」とどれだけ連動していたかを相関で測り、それを重みにして合成したものがスコアです。スコアは過去4年の中での順位（0〜100）に直しています。</p><p>重みの計算にはその日より前に結果が確定していたデータしか使わないため、上の成績はすべて「当時知り得た情報だけで出した判定」の結果です。プット・コール比率、スキュー、建玉、清算の集中帯は長期の履歴が公開されていないのでスコアには入れず、警戒フラグとして判定を一段階下げる用途に限っています。</p></details>';
}

function meter(val, label, level) { return '<div class="meter"><div class="row"><span>' + label + '</span><b class="lvl-' + (val >= 65 ? 'hi' : val >= 45 ? 'mid' : 'lo') + '">' + level + '<span class="num"> ' + val + '</span></b></div><div class="mtrack"><b style="width:' + val + '%" class="m-' + (val >= 65 ? 'hi' : val >= 45 ? 'mid' : 'lo') + '"></b></div></div>'; }
function viewFlow() {
  if (!S.R) return '';
  const q = S.liq, o = S.opt, price = S.price; let h = '<section class="lead"><h1>建玉とオプションの偏り</h1><p>レバレッジの積み上がりと、オプション市場の構えを見ます。</p></section>';
  h += upsideCard(true);
  if (q && q.ok) {
    const kv = [];
    const ag = q.agg;
    if (ag && ag.ex.length > 1) { kv.push(['建玉の合計（' + ag.ex.map(x => x.name).join('・') + '）', Math.round(ag.total).toLocaleString('en-US') + ' BTC']); kv.push(['取引所ごとの割合', ag.ex.map(x => x.name + ' ' + pc(x.share, 0, false)).join('、')]); if (ok(ag.fund)) kv.push(['資金調達率（建玉で加重した平均）', pc(ag.fund, 4) + ' / 8時間']); }
    if (ok(q.fundNow)) kv.push(['資金調達率（Binance・直近）', pc(q.fundNow, 4) + ' / 8時間']);
    if (ok(q.fund7)) kv.push(['同 7日平均', pc(q.fund7, 4) + (ok(q.fundPct) ? '（1年の下位' + pc(q.fundPct, 0, false) + '）' : '')]);
    if (ok(q.oiNow)) { kv.push(['建玉（Binance USDT無期限）', Math.round(q.oiNow).toLocaleString('en-US') + ' BTC（約 $' + (q.oiVal / 1e9).toFixed(1) + 'B）']); kv.push(['建玉の増減', '24時間 ' + pc(q.oi1) + '、7日 ' + pc(q.oi7)]); kv.push(['同じ7日の価格', pc(q.px7)]); }
    if (ok(q.ls)) kv.push(['ロング/ショート口座比', q.ls.toFixed(2) + (ok(q.lsPct) ? '（30日の下位' + pc(q.lsPct, 0, false) + '）' : '')]);
    if (ok(q.top)) kv.push(['大口のロング/ショート比', q.top.toFixed(2)]);
    h += '<section class="card"><h2>清算の予兆</h2>' + meter(q.longRisk, 'ロング清算リスク（下への連鎖）', q.longLevel) + meter(q.shortRisk, 'ショート踏み上げリスク（上への連鎖）', q.shortLevel) +
      (q.flush ? '<p class="note good">建玉が急減しています。清算が一巡した可能性があります。</p>' : '') +
      '<dl class="kv">' + kv.map(x => '<dt>' + x[0] + '</dt><dd class="num">' + x[1] + '</dd>').join('') + '</dl>' +
      (q.oiSeries ? '<div class="row"><span class="sub">建玉の30日推移</span>' + spark(q.oiSeries.map(x => x.oi)) + '</div>' : '') +
      '<p class="sub">資金調達率が高い・建玉が急増・ロング口座が多い、が重なるほどロング清算リスクを高く出します。65以上で「警戒」とし、短期・中期の判定を一段階下げます。</p></section>';
    if (q.clusters) {
      const li = (x, lab) => '<li><b class="num">' + usd(x.p) + '</b><span class="num dist">' + pc(x.dist) + '</span><span>' + lab + '</span></li>';
      h += '<section class="card"><h2>清算が集中しそうな価格帯（推定）</h2>' + clusterChart() + '<p class="keys"><span><i class="k-p"></i>ロングの清算（下）</span><span><i class="k-c"></i>ショートの清算（上）</span></p>' +
        '<ul class="clist">' + q.clusters.above.slice(0, 2).sort((x, y) => y.p - x.p).map(x => li(x, 'ショート清算')).join('') + q.clusters.below.slice(0, 3).sort((x, y) => y.p - x.p).map(x => li(x, 'ロング清算')).join('') + '</ul>' +
        (ag && ag.seriesEx ? '<p class="sub">清算の集中帯は ' + ag.seriesEx.join('・') + ' の建玉を合算して推定しています。</p>' : '<p class="sub">清算の集中帯は Binance の建玉だけで推定しています（他の取引所の履歴を取得できていません）。</p>') + '<p class="sub">直近30日で建玉が増えた価格を建値とみなし、10・25・50・100倍のレバレッジで清算される水準を積み上げた推定です。すでに価格が通過した水準は除いています。取引所の実際の清算注文ではありません。</p></section>';
    }
  } else h += '<section class="card"><h2>清算の予兆</h2><p class="muted">先物データを取得できないため表示できません。' + esc((S.status.fut && S.status.fut.note) || '') + '</p></section>';
  if (o) {
    const kv = [['P/C比（建玉）', ok(o.pcrOI) ? o.pcrOI.toFixed(2) : '—'], ['P/C比（24時間の出来高）', ok(o.pcrVol) ? o.pcrVol.toFixed(2) : '—'], ['IV（約' + Math.round(o.ivDays) + '日満期・現値付近）', ok(o.atmIV) ? o.atmIV.toFixed(1) + '%' : '—'],
      ['スキュー（下10%プット−上10%コール）', ok(o.skew) ? (o.skew > 0 ? '+' : '') + o.skew.toFixed(1) + 'pt' : '—'], ['DVOL', ok(o.dvol) ? o.dvol.toFixed(1) + (ok(o.dvolPct) ? '（1年の下位' + pc(o.dvolPct, 0, false) + '）' : '') : '—'],
      ['織り込む変動幅', ok(o.move7) ? '7日 ±' + pc(o.move7, 1, false) + '（' + usd(price * (1 - o.move7)) + '〜' + usd(price * (1 + o.move7)) + '）' : '—'],
      ['コール建玉の壁', o.callWall ? usd(o.callWall.K) + '（' + pc(o.callWall.K / price - 1) + '）' : '—'], ['プット建玉の壁', o.putWall ? usd(o.putWall.K) + '（' + pc(o.putWall.K / price - 1) + '）' : '—']];
    h += (S.cbp ? '<section class="card"><h2>コインベース・プレミアム</h2><dl class="kv"><dt>直近7日の平均</dt><dd class="num">' + pc(S.cbp.p7, 3) + '</dd><dt>90日の平均</dt><dd class="num">' + pc(S.cbp.p90, 3) + '</dd><dt>その差</dt><dd class="num">' + pc(S.cbp.gap, 3) + '</dd>' + (ok(S.cbp.live) ? '<dt>いま</dt><dd class="num">' + pc(S.cbp.live, 3) + '</dd>' : '') + '</dl><p class="sub">米国の取引所Coinbaseの価格が、Binanceよりどれだけ高いかです。プラスなら米国の買いが強い状態です。2017年以降の検証では、7日平均が90日平均を上回るほど、その後1週間〜1か月のBTCが上がりやすい傾向でした。ただし今の判定にすでに含まれる情報と重なりが大きく、スコアに加えても成績は改善しなかったため、参考表示と注意喚起だけに使っています。</p></section>' : '') +
      '<section class="card"><h2>オプション市場</h2><dl class="kv">' + kv.map(x => '<dt>' + x[0] + '</dt><dd class="num">' + x[1] + '</dd>').join('') + '</dl></section>' +
      '<section class="card"><h2>' + ymd(o.main.exp) + ' 満期の建玉（最大の満期）</h2>' + strikeChart() + '<p class="keys"><span><i class="k-c"></i>コール（上）</span><span><i class="k-p"></i>プット（下）</span></p>' +
      '<dl class="kv"><dt>マックスペイン</dt><dd class="num">' + usd(o.main.maxPain) + '（' + pc(o.main.maxPain / price - 1) + '）</dd><dt>満期まで</dt><dd class="num">' + o.main.days.toFixed(1) + ' 日</dd><dt>この満期のP/C比</dt><dd class="num">' + (ok(o.main.pcr) ? o.main.pcr.toFixed(2) : '—') + '</dd>' +
      (o.near.exp !== o.main.exp ? '<dt>直近満期（' + md(o.near.exp) + '）のマックスペイン</dt><dd class="num">' + usd(o.near.maxPain) + '</dd>' : '') + '</dl>' +
      '<p class="sub">マックスペインは、オプションの買い手の受け取りが最も小さくなる価格です。満期が近いほど、価格がそこへ寄る傾向があるとされます。</p></section>';
  } else h += '<section class="card"><h2>オプション市場</h2><p class="muted">Deribit から取得できないため表示できません。</p></section>';
  return h;
}

function viewEvents() {
  const now = Date.now(), ev = (S.events || allEvents()).filter(e => e.t < now + 120 * DAY);
  const li = ev.map(e => { const dd = (e.t - now) / DAY, left = dd < 0 ? '発表済み' : dd < 1 ? 'あと' + Math.max(1, Math.round(dd * 24)) + '時間' : 'あと' + Math.floor(dd) + '日'; return '<li class="' + (dd >= 0 && dd <= 2 && e.impact >= 3 ? 'soon' : '') + '"><div><b>' + esc(e.title) + '</b><span class="imp" aria-label="重要度' + e.impact + '">' + '●'.repeat(e.impact) + '</span></div><div class="sub"><span class="num">' + mdw(e.t) + ' ' + hm(e.t) + '</span>　' + left + (e.custom ? '　<button class="link" data-del="' + e.idx + '">削除する</button>' : '') + '</div></li>'; }).join('');
  return '<section class="lead"><h1>控えているイベント</h1><p>重要度●●●のイベントの48時間前から、短期の判定を一段階下げます。時刻はこの端末の現地時間です。</p></section>' +
    (BUILTIN.filter(e => e.t > now).length < 4 ? '<section class="card"><p>内蔵しているFOMC・雇用統計・CPIの予定が残りわずかです。新しい年の日程を入れ直す必要があります。</p></section>' : '') +
    '<section class="card"><ul class="events">' + li + '</ul><p class="sub">FOMCと米雇用統計・CPIは、FRBと米労働統計局が2026年11月時点で公表している予定です。日程は変更されることがあります。オプション満期は毎月最終金曜（17時 日本時間）を自動で計算しています。</p></section>' +
    '<section class="card"><h2>イベントを追加する</h2><p class="sub">MSTR・COINの決算日など、発表されたら追加してください。</p><div class="form"><label>内容<input id="ev-title" type="text" placeholder="例：MSTR 決算発表" maxlength="40"></label><label>日時<input id="ev-time" type="datetime-local"></label><label>重要度<select id="ev-imp"><option value="3">●●● 判定を下げる</option><option value="2">●● 表示のみ</option><option value="1">● 表示のみ</option></select></label><button class="btn" id="ev-add">イベントを追加する</button></div></section>';
}

function planRecord() {
  const log = LS.get('log', []).filter(x => x.sp && Object.keys(x.sp).length); if (!log.length) return '';
  const items = [];
  log.slice().reverse().slice(0, 14).forEach(x => {
    Object.keys(x.sp).forEach(sym => {
      const st = S.stocks[sym]; if (!st || !st.vals) return;
      const v = st.vals, i = v.findIndex(r => r[0] > x.k); const e = x.sp[sym];
      let res = '判定待ち', cls = 'na';
      if (i >= 0 && i + 4 < v.length) {
        const after = v.slice(i, i + 5).map(r => r[1]), last = after[4], r5 = last / e.px - 1, minc = Math.min(...after);
        if (e.a === 'buy') { res = '5日後 ' + pc(r5); cls = r5 > 0 ? 'hit' : 'miss'; }
        else if (e.a === 'limit') { if (e.lim && minc <= e.lim) { res = '指値に到達'; cls = 'hit'; } else if (r5 > 0) { res = '届かず上昇 ' + pc(r5); cls = 'miss'; } else { res = '届かず下落 ' + pc(r5); cls = 'hit'; } }
        else { res = '5日後 ' + pc(r5); cls = r5 < 0 ? 'hit' : 'miss'; }
      }
      items.push('<li><span class="num">' + x.k.slice(5).replace('-', '/') + '</span><span>' + sym + ' ' + (e.a === 'buy' ? '買う' : PLAN[e.a][0]) + '</span><span class="num">' + usd2(e.px) + (e.lim && e.a !== 'buy' ? '（指値 ' + usd2(e.lim) + '）' : '') + '</span><b class="' + cls + '">' + res + '</b></li>');
    });
  });
  return '<section class="card"><h2>「今日どうする」の答え合わせ</h2><ul class="calls">' + items.join('') + '</ul><p class="sub">開いた日に表示した行動を記録し、5営業日後の株価で自動判定します。「買う」は上がれば的中、「今日は買わない」は下がれば的中、「指値で待つ」は指値に届くか、届かずに下がれば的中です（終値ベースの概算）。</p></section>';
}
function viewStocks() {
  let h = '<section class="lead"><h1>MSTR・COIN</h1><p>BTCの判定を、2銘柄の値動きに当てはめて確かめます。</p></section>';
  const have = ['MSTR', 'COIN'].filter(s => S.stocks[s] && S.stocks[s].an);
  ['MSTR', 'COIN'].forEach(sym => {
    const st = S.stocks[sym]; if (!st) return;
    if (st.err) { h += '<section class="card"><h2>' + sym + '</h2><p class="muted">取得できません：' + esc(st.err) + '</p></section>'; return; }
    const an = st.an; if (!an) { h += '<section class="card"><h2>' + sym + '</h2><p class="muted">データが足りません。</p></section>'; return; }
    const rel = !ok(an.rz) ? '—' : an.rz <= -1 ? 'BTCに対して割安（' + an.rz.toFixed(1) + 'σ）' : an.rz >= 1 ? 'BTCに対して割高（+' + an.rz.toFixed(1) + 'σ）' : 'BTCに対して平均的（' + (an.rz > 0 ? '+' : '') + an.rz.toFixed(1) + 'σ）';
    const rows = E.HORIZONS.map(x => { const b = an.bt[x.k]; return '<tr><th>' + x.name + '（' + b.td + '営業日）</th><td class="num">' + pc(b.sig.win, 0, false) + '</td><td class="num">' + pc(b.sig.mean) + '</td><td class="num">' + pc(b.all.win, 0, false) + '</td><td class="num">' + pc(b.all.mean) + '</td></tr>'; }).join('');
    const zl = S.zones.below.slice(0, 3).map(z => '<li><span class="num">BTC ' + usd(z.mid) + '</span><span class="num">' + sym + ' ' + usd2(an.px * (1 + an.beta * (z.mid / an.btcAt - 1))) + '</span></li>').join('');
    h += '<section class="card"><div class="row"><h2>' + sym + '</h2><span class="num big">' + usd2(an.px) + ' <small>' + pc(an.chg) + '</small></span></div>' +
      '<dl class="kv"><dt>BTCへの感応度（ベータ、90営業日）</dt><dd class="num">' + an.beta.toFixed(2) + ' 倍</dd><dt>BTCとの相関</dt><dd class="num">' + an.corr.toFixed(2) + '</dd><dt>BTC比の割安・割高</dt><dd>' + rel + '</dd><dt>RSI(14)</dt><dd class="num">' + an.rsi.toFixed(0) + '</dd><dt>50日線 / 200日線</dt><dd class="num">' + usd2(an.s50) + ' / ' + usd2(an.s200) + '</dd></dl>' +
      '<h3>BTCのシグナルで買った場合の成績</h3><table class="tbl"><thead><tr><th></th><th colspan="2">買い系の判定の日</th><th colspan="2">いつ買っても</th></tr><tr><th></th><th>勝率</th><th>平均</th><th>勝率</th><th>平均</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="sub">前日のBTC判定を見て、当日の終値で買ったと仮定。件数は ' + an.bt.m.all.n + ' 営業日（' + an.date + ' まで）。</p>' +
      (zl ? '<h3>BTCのエントリー候補に対応する株価の目安</h3><ul class="pair">' + zl + '</ul><p class="sub">現在のベータで単純換算した値です。個別の材料や決算では大きくずれます。</p>' : '') + '</section>';
  });
  const pos = LS.get('pos', []);
  h += '<section class="card"><h2>持っている銘柄を登録する</h2>' + (pos.length ? '<ul class="pair">' + pos.map((p, i) => '<li><span><b>' + p.sym + '</b>　<span class="num">' + usd2(p.cost) + (p.qty ? ' × ' + p.qty + '株' : '') + (p.date ? '　' + esc(p.date) : '') + '</span></span><button class="link" data-delpos="' + i + '">削除する</button></li>').join('') + '</ul>' : '<p class="muted">まだ登録がありません。登録すると、判定タブに「持ち続ける／買い足し可／一部売る／売る」が毎日出ます。</p>') +
    '<div class="form"><label>銘柄<select id="pos-sym"><option>MSTU</option><option>CONL</option><option>MSTZ</option><option>MSTR</option><option>COIN</option></select></label><label>平均の買値（ドル）<input id="pos-cost" type="number" inputmode="decimal" step="0.01" placeholder="例：25.40"></label><label>株数（空欄でも可）<input id="pos-qty" type="number" inputmode="decimal" placeholder="例：100"></label><label>買った日（空欄でも可。入れると目減りを計算します）<input id="pos-date" type="date"></label><button class="btn" id="pos-add">保有銘柄を登録する</button></div><p class="sub">この端末の中だけに保存されます。株式併合があった銘柄は、moomooに表示されている今の平均取得単価を入れてください。</p></section>';
  h += planRecord();
  if (!have.length && !['MSTR', 'COIN'].some(s => S.stocks[s])) h += '<section class="card"><p class="muted">株価を読み込んでいます…</p></section>';
  if (S.stkSrc) h += '<p class="sub">株価：' + esc(S.stkSrc) + '。米国市場の終値を、取引終了後に毎日取り込んでいます。</p>';
  h += '<section class="card"><h2>設定</h2><div class="form"> <details><summary class="sub">予備の株価データ（通常は不要）</summary><label>Twelve Data のAPIキー<input id="td-key" type="text" autocomplete="off" value="' + esc(S.cfg.tdKey || '') + '" placeholder="キーを貼り付け"></label></details><label>BTCの価格データ<select id="src"><option value="auto"' + (S.cfg.src !== 'bitstamp' ? ' selected' : '') + '>Binance（2017年〜、出来高が大きい）</option><option value="bitstamp"' + (S.cfg.src === 'bitstamp' ? ' selected' : '') + '>Bitstamp（2014年〜、検証期間が長い）</option></select></label><button class="btn" id="cfg-save">設定を保存して更新する</button><button class="btn ghost" id="cfg-reset">保存データをすべて消す</button></div><p class="sub">設定・判定の記録・追加したイベントは、このブラウザの中だけに保存されます。</p></section>';
  return h;
}

function renderTop() {
  const p = S.price, d = S.d, prev = d && d.c.length ? d.c[d.c.length - 1] : NaN;
  $('#px').textContent = ok(p) ? usd(p) : '—';
  $('#chg').textContent = ok(p) && ok(prev) && p !== prev ? '前日終値比 ' + pc(p / prev - 1) : '';
  $('#at').textContent = S.loading ? '更新中…' : S.at ? hm(S.at) + ' 更新' : '';
  $('#refresh').disabled = !!S.loading;
}
function render() {
  renderTop();
  const v = $('#view');
  if (S.fatal && !S.R) { v.innerHTML = '<section class="card"><h2>読み込めませんでした</h2><p>' + esc(S.fatal) + '</p><button class="btn" id="retry">もう一度読み込む</button></section>'; return; }
  const views = { judge: viewJudge, verify: viewVerify, flow: viewFlow, events: viewEvents, stocks: viewStocks };
  // 入力中の内容と、開いている折りたたみは、自動更新で消えないように引き継ぐ
  const keep = {}, same = v.dataset.tab === S.tab, ae = document.activeElement, focusId = ae && v.contains(ae) ? ae.id : null;
  if (same) v.querySelectorAll('input[id],select[id]').forEach(el => { keep[el.id] = el.value; });
  const opened = same ? [...v.querySelectorAll('details')].map(el => el.open) : [];
  const err = S.fatal ? '<section class="card"><h2>最新の計算に失敗しました</h2><p>' + esc(S.fatal) + '</p><p class="sub">下に出ているのは、前回うまく計算できたときの内容です。</p><button class="btn" id="retry">もう一度読み込む</button></section>' : '';
  v.innerHTML = err + (views[S.tab] || viewJudge)(); v.dataset.tab = S.tab;
  if (same) { Object.keys(keep).forEach(id => { const el = document.getElementById(id); if (el && keep[id] !== '' && id !== 'src') el.value = keep[id]; }); v.querySelectorAll('details').forEach((el, i) => { if (opened[i]) el.open = true; }); if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); } }
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === S.tab ? 'page' : 'false'));
}

/* ================= events / boot ================= */
function route() { const t = (location.hash || '#judge').slice(1); S.tab = ['judge', 'verify', 'flow', 'events', 'stocks'].includes(t) ? t : 'judge'; render(); window.scrollTo(0, 0); }
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.h) { S.sel = t.dataset.h; render(); }
  else if (t.dataset.range) { S.range = +t.dataset.range; render(); }
  else if (t.id === 'refresh' || t.id === 'retry') refreshAll();
  else if (t.dataset.del != null) { const a = LS.get('events', []); a.splice(+t.dataset.del, 1); LS.set('events', a); S.events = allEvents(); if (S.R) decide(); render(); }
  else if (t.id === 'ev-add') {
    const title = $('#ev-title').value.trim(), tm = Date.parse($('#ev-time').value);
    if (!title || !ok(tm)) { t.textContent = '内容と日時を入力してください'; return; }
    const a = LS.get('events', []); a.push({ t: tm, title, impact: +$('#ev-imp').value, kind: 'custom' }); LS.set('events', a); $('#ev-title').value = ''; $('#ev-time').value = ''; S.events = allEvents(); if (S.R) decide(); render();
  }
  else if (t.dataset.delpos != null) { const a = LS.get('pos', []); a.splice(+t.dataset.delpos, 1); LS.set('pos', a); if (S.R) { S.hold = holdAll(); S.pick = pickStock(); } render(); }
  else if (t.id === 'pos-add') {
    const cost = +$('#pos-cost').value, qty = +$('#pos-qty').value || null, date = $('#pos-date').value || null;
    if (!(cost > 0)) { t.textContent = '買値を入力してください'; return; }
    const a = LS.get('pos', []); a.push({ sym: $('#pos-sym').value, cost, qty, date }); LS.set('pos', a); if (S.R) { S.hold = holdAll(); S.pick = pickStock(); writeLog(); } location.hash = 'judge';
  }
  else if (t.id === 'buy-add') { const a = LS.get('buys', []); a.push({ t: Date.now(), btc: Math.round(S.price) }); LS.set('buys', a); if (S.R) { S.plan = buildPlan(); S.hold = holdAll(); } render(); }
  else if (t.id === 'buy-undo') { const a = LS.get('buys', []); a.pop(); LS.set('buys', a); if (S.R) { S.plan = buildPlan(); S.hold = holdAll(); } render(); }
  else if (t.id === 'cfg-save') { S.cfg = { tdKey: $('#td-key').value.trim(), src: $('#src').value }; LS.set('cfg', S.cfg); S.stocks = {}; refreshAll(); }
  else if (t.id === 'cfg-reset') {
    if (t.dataset.sure) { ['daily', 'dvol', 'fund', 'log', 'events', 'cfg', 'stk.MSTR', 'stk.COIN', 'long', 'pos', 'buys', 'ranges'].forEach(LS.del); location.reload(); }
    else { t.dataset.sure = '1'; t.textContent = 'もう一度押すと、記録もすべて消えます'; }
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.at && Date.now() - S.at > 5 * 60e3) refreshAll(); });

const cache = LS.get('daily', null);
if (cache && cache.rows && cache.rows.length > 300) { try { setData(cache.rows, cache.src, cache.at); S.dvol = LS.get('dvol', null); const lg = LS.get('long', null); S.longRows = lg ? lg.rows : null; const f = LS.get('fund', null); S.fund = f && f.last ? f : null; compute(); } catch (e) { /* 保存データが壊れていたら無視 */ } }
route();
refreshAll();
setInterval(() => { if (!document.hidden) refreshAll(); }, 5 * 60e3);
window.__S = S; window.__T = { computeProv, usSegments, nyDST, planLabel, etfAt, stockAt, refreshAll, LS };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
