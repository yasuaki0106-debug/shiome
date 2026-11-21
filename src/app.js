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
    const txt = await tget('https://raw.githubusercontent.com/rcaljouw/btc-price-history/main/data/btc-usd-daily.csv');
    const rows = [];
    txt.trim().split('\n').slice(1).forEach(l => { const p = l.split(','); if (p[0] >= '2014-01-01' && +p[4] > 0) rows.push([Date.parse(p[0] + 'T00:00:00Z'), +p[1], +p[2], +p[3], +p[4], +p[5]]); });
    return rows;
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
        if (!fresh) LS.set('daily', { src, rows, at: Date.now() });
        S.status.price = { ok: true, name: '価格・出来高', note: SRCNAME[src] + '、' + rows.length + '日分' + (errs.length ? '（' + errs.join('、') + ' は取得できず切り替え）' : '') };
        return { src, rows };
      }
      errs.push(SRCNAME[src]);
    } catch (e) { errs.push(SRCNAME[src]); }
  }
  if (cache) { S.status.price = { ok: false, name: '価格・出来高', note: '取得できません。' + ymd(cache.at) + ' に保存したデータを表示中' }; return cache; }
  throw new Error('価格データを取得できません。通信環境を確認して、右上の更新ボタンを押してください。');
}
async function loadLong() {
  const c = LS.get('long', null); if (c && Date.now() - c.at < 6 * 36e5) return c.rows;
  const txt = await tget('https://raw.githubusercontent.com/rcaljouw/btc-price-history/main/data/btc-usd-daily.csv');
  const rows = []; txt.trim().split('\n').slice(1).forEach(l => { const p = l.split(','); if (p[0] >= '2012-01-01' && +p[4] > 0) rows.push([Date.parse(p[0] + 'T00:00:00Z'), +p[4]]); });
  if (rows.length < 2000) throw new Error('short');
  LS.set('long', { at: Date.now(), rows }); return rows;
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
function setData(rows, src) {
  const now = Date.now(), done = rows.filter(r => r[0] + DAY <= now), live = rows.length && rows[rows.length - 1][0] + DAY > now ? rows[rows.length - 1] : null;
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
  S.R = E.run(d, ex);
  S.price = (S.optRaw && S.optRaw.spot) || (S.fut && S.fut.mark) || (S.liveRow && S.liveRow[4]) || d.c[n - 1];
  S.opt = S.optRaw ? E.analyzeOptions(S.optRaw.list, S.optRaw.spot || S.price, now) : null;
  if (S.opt && S.dvol) { const ks = Object.keys(S.dvol).sort(), last = ks[ks.length - 1]; S.opt.dvol = S.dvol[last]; const yr = ks.slice(-365).map(k => S.dvol[k]); S.opt.dvolPct = yr.filter(x => x < S.opt.dvol).length / yr.length; }
  if (S._L && S.longRows) { try { S.cyc = E.cycleInfo(S._L, S._ls, now, S.price); } catch (e) { S.cyc = null; } }
  { const m = S.R.ind.s200; let b = 0; for (let i = n - 14; i < n; i++) if (ok(m[i]) && d.c[i] < m[i]) b++; S.below200 = b >= 14; S.above200 = b === 0; }
  S.liq = E.analyzeLiq({ oi: S.fut && S.fut.oi, fundDaily: ex.fund, fundNow: S.fut ? S.fut.fundNow : NaN, ls: S.fut && S.fut.ls, top: S.fut && S.fut.top }, d, S.price);
  S.zones = E.entryZones(d, S.R.ind, S.price, S.opt, S.liq);
  S.events = allEvents();
  decide(); computeStocks(); S.up = upside(); S.plan = buildPlan(); S.hold = holdAll(); S.pick = pickStock(); writeLog();
}

function decide() {
  const now = Date.now(), flags = [], liq = S.liq, opt = S.opt, price = S.price;
  const big = S.events.find(e => e.impact >= 3 && e.t > now), hrs = big ? (big.t - now) / 36e5 : Infinity;
  const ev48 = hrs <= 48;
  if (big && hrs <= 48) flags.push({ lv: 'warn', src: 'イベント', text: big.title + ' まであと' + (hrs < 1 ? '1時間以内' : Math.round(hrs) + '時間') + '。発表の前後は値が飛びやすいため、短期の判定を一段階下げています。' });
  else if (big && hrs <= 24 * 7) flags.push({ lv: 'info', src: 'イベント', text: mdw(big.t) + ' ' + hm(big.t) + ' に ' + big.title + '。その前に全額を入れない前提で。' });
  if (liq && liq.ok) {
    if (liq.flush) flags.push({ lv: 'good', src: '清算', text: '建玉が急減しました（24時間 ' + pc(liq.oi1) + '、3日 ' + pc(liq.oi3) + '）。レバレッジの整理が進んだ直後です。' });
    if (liq.longRisk >= 65) flags.push({ lv: 'warn', src: '清算', text: 'ロングの清算リスクが高い状態（' + liq.longRisk + '/100）。買いが積み上がっており、下げ始めると連鎖しやすいため、短期・中期の判定を一段階下げています。' });
    else if (liq.longRisk >= 45) flags.push({ lv: 'info', src: '清算', text: 'ロングがやや積み上がっています（清算リスク ' + liq.longRisk + '/100）。' });
    if (liq.shortRisk >= 65) flags.push({ lv: 'info', src: '清算', text: 'ショートが積み上がっています（踏み上げリスク ' + liq.shortRisk + '/100）。上に動くと買い戻しで加速しやすい形です。' });
    const cb = liq.clusters && liq.clusters.below[0];
    if (cb && cb.dist > -0.06) flags.push({ lv: 'info', src: '清算', text: '下 ' + pc(cb.dist) + '（' + usd(cb.p) + ' 付近）にロング清算の集中帯（推定）。そこまで下ヒゲが伸びる展開に注意。' });
  }
  if (opt) {
    if (ok(opt.skew) && opt.skew >= 8) flags.push({ lv: 'info', src: 'オプション', text: 'プットが割高です（スキュー ' + opt.skew.toFixed(1) + 'pt）。オプション市場は下落への備えを強めています。' });
    if (ok(opt.skew) && opt.skew <= -5) flags.push({ lv: 'info', src: 'オプション', text: 'コールが割高です（スキュー ' + opt.skew.toFixed(1) + 'pt）。上昇期待が先行しています。' });
    const nr = opt.near;
    if (nr && nr.days <= 5 && ok(nr.maxPain) && Math.abs(nr.maxPain / price - 1) >= 0.03) flags.push({ lv: 'info', src: 'オプション', text: md(nr.exp) + ' 満期のマックスペインは ' + usd(nr.maxPain) + '（現値比 ' + pc(nr.maxPain / price - 1) + '）。満期までその方向に寄りやすいとされます。' });
    if (opt.callWall && opt.callWall.K / price - 1 <= 0.05) flags.push({ lv: 'info', src: 'オプション', text: '上 ' + pc(opt.callWall.K / price - 1) + ' の ' + usd(opt.callWall.K) + ' にコール建玉の壁。上値が重くなりやすい水準です。' });
  }
  S.act = {};
  E.HORIZONS.forEach(h => {
    const z = S.R.hz[h.k]; let a = z.verdict; const why = [];
    const down = r => { const i = ORDER.indexOf(a); if (i >= 2) { a = ORDER[i - 1]; why.push(r); } };
    if (a !== 'na') {
      if (z.ev.status === 'bad' && ORDER.indexOf(a) >= 2) { a = 'wait'; why.push('検証で優位性を確認できず'); }
      if ((h.k === 's' || h.k === 'd') && ev48) down('重要イベント前');
      if ((h.k === 'd' || h.k === 's' || h.k === 'm') && liq && liq.ok && liq.longRisk >= 65) down('ロング清算リスク高');
    }
    S.act[h.k] = { a, why, raw: z.verdict };
  });
  if (S.stale > 2.5) flags.unshift({ lv: 'warn', src: 'データ', text: '価格データが ' + Math.floor(S.stale) + ' 日前で止まっています。判定は最新ではありません。' });
  S.flags = flags; S.ev48 = ev48; S.bigEv = big;
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
function usSegments(now) {
  // 米国株の取引時間（ET）：夜間 20:00-翌4:00（日〜木の夜）、プレ 4:00-9:30、通常 9:30-16:00、アフター 16:00-20:00（月〜金）
  const segs = [], H = 36e5;
  for (let k = -2; k <= 5; k++) {
    const base = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + k);
    const off = nyDST(base + 15 * H) ? 4 : 5, at = h => base + (h + off) * H, wd = new Date(base).getUTCDay();
    if (wd >= 1 && wd <= 5) { segs.push({ k: 'pre', name: 'プレ', s: at(4), e: at(9.5) }, { k: 'reg', name: '通常取引', s: at(9.5), e: at(16) }, { k: 'aft', name: 'アフター', s: at(16), e: at(20) }); }
    if (wd >= 0 && wd <= 4) segs.push({ k: 'ovn', name: '夜間', s: at(20), e: at(28) });
  }
  segs.sort((a, b) => a.s - b.s);
  const i = segs.findIndex(x => now < x.e);
  return segs.slice(i, i + 4).map(x => Object.assign(x, { live: now >= x.s }));
}
function sessionStrip() {
  const now = Date.now(), sg = usSegments(now); if (!sg.length) return '';
  const cur = sg[0].live ? sg[0] : null;
  const lead = cur ? 'いま：' + cur.name + '（' + (cur.k === 'reg' ? '' : '指値のみで。') + 'あと' + Math.max(1, Math.round((cur.e - now) / 36e5)) + '時間）' : '米国株は休場中。次は ' + mdw(sg[0].s) + ' ' + hm(sg[0].s) + ' の' + sg[0].name + 'から';
  return '<div class="sess"><p class="sess-now">' + lead + '</p><ol>' + sg.map(x => '<li class="' + (x.live ? 'on' : '') + '"><b>' + x.name + '</b><span class="num">' + hm(x.s) + '〜' + hm(x.e) + '</span></li>').join('') + '</ol></div>';
}
function todayRange() {
  const price = S.price, o = S.opt, f = S.R.hz.d.fc;
  if (o && ok(o.move1)) return { lo: price * (1 - o.move1), hi: price * (1 + o.move1), src: 'オプションが織り込む1日の値幅' };
  if (f) return { lo: price * (1 + f.q25), hi: price * (1 + f.q75), src: '過去の1日の値動き' };
  return null;
}
function reachProb(target) {
  const d = S.d, n = d.c.length, dist = target / S.price - 1; if (dist >= 0) return 1;
  const a = Math.max(1, n - 730); let hit = 0, m = 0;
  for (let i = a; i < n; i++) { m++; if (d.l[i] / d.c[i - 1] - 1 <= dist) hit++; }
  return m ? hit / m : NaN;
}
function stockAt(an, btc) { return an.px * (1 + an.beta * (btc / an.btcAt - 1)); }
function buildPlan() {
  const best = Math.max(lvOf('s'), lvOf('m'), lvOf('l')), price = S.price, liq = S.liq || {};
  const zs = S.zones.below, rng = todayRange();
  const near = zs.find(z => z.strength >= 2 && z.dist > -0.08) || zs[0];
  const strong = zs.slice().sort((x, y) => y.strength - x.strength || y.dist - x.dist)[0];
  let a, why = [];
  const blockers = [];
  if (S.ev48 && S.bigEv) blockers.push(S.bigEv.title + 'の直前');
  if (liq.ok && liq.longRisk >= 65) blockers.push('ロング清算リスクが高い');
  if (best >= 2 && lvOf('s') >= 1 && !blockers.length) { a = 'buy'; why.push(E.HORIZONS.filter(h => h.k !== 'd' && lvOf(h.k) >= 2).map(h => h.name).join('・') + 'が買い判定'); }
  else if (best >= 2 || (lvOf('m') >= 1 && lvOf('l') >= 1)) { a = 'limit'; if (best >= 2) why.push('買い判定の時間軸あり'); if (blockers.length) why.push(blockers.join('、')); if (lvOf('s') < 1) why.push('短期は見送り'); }
  else { a = 'skip'; why.push(E.HORIZONS.filter(h => h.k !== 'd').map(h => h.name + 'は' + E.VERDICT[S.act[h.k].a]).join('、')); if (blockers.length) why.push(blockers.join('、')); }
  const deep = zs.filter(z => !rng || z.hi < rng.lo).sort((x, y) => y.strength - x.strength || y.dist - x.dist)[0];
  const ph = S.cyc ? S.cyc.phase : null;
  if (ph === 'top' || ph === 'down') { a = 'skip'; why = ['サイクルは' + S.cyc.name + '（半減期から' + S.cyc.day + '日目）。新しく買う時期ではありません']; }
  const target = a === 'skip' ? (deep || strong) : near;
  const stocks = {};
  ['MSTR', 'COIN'].forEach(sym => {
    const an = S.stocks[sym] && S.stocks[sym].an; if (!an) return;
    let sa = a; const note = [];
    if (sa === 'buy' && ok(an.rz) && an.rz >= 1.5) { sa = 'limit'; note.push('BTCに対して割高なので指値に'); }
    stocks[sym] = { a: sa, now: stockAt(an, price), lim: target ? stockAt(an, target.mid) : NaN, stop: target ? stockAt(an, target.stop) : NaN, lo: rng ? stockAt(an, rng.lo) : NaN, hi: rng ? stockAt(an, rng.hi) : NaN, note };
  });
  return { a, why, target, rng, reach: target ? reachProb(target.mid) : NaN, stocks, sess: usSession(Date.now()) };
}
const ETF = { MSTU: { und: 'MSTR', L: 2 }, MSTZ: { und: 'MSTR', L: -2 }, CONL: { und: 'COIN', L: 2 }, MSTR: { und: 'MSTR', L: 1 }, COIN: { und: 'COIN', L: 1 } };
function etfClose(sym) { const v = S.etf && S.etf[sym]; return v && v.length ? v[v.length - 1] : null; }
function etfAt(sym, btc) { // BTCがその値段のときのETFの目安
  const e = ETF[sym], an = S.stocks[e.und] && S.stocks[e.und].an, lc = etfClose(sym); if (!an || !lc) return NaN;
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
    else if (ph === 'bottom' && plan && plan.a !== 'skip') { a = 'add'; why.push('サイクルは底値圏で、入る判定も出ています（' + plan.why.join('、') + '）'); }
    else { a = 'hold'; why.push(ph ? 'サイクルは' + c.name + '。売る合図は出ていません' : '売る合図は出ていません'); if (ph === 'bottom' && plan && plan.a === 'skip') why.push('買い足しは、入る判定が出るまで待ちます'); }
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
  if (ok(B.rz) && B.rz <= -1.5) { sc.COIN += 2; why.push({ s: 'COIN', t: 'COINがBTCに対して割安（' + B.rz.toFixed(1) + 'σ）。過去は、この後3か月でBTCより平均10%強上回り、直近2年でも同じ傾向でした' }); }
  if (ok(B.rz) && B.rz >= 1.5) { sc.COIN -= 2; why.push({ s: 'MSTR', t: 'COINがBTCに対して割高（+' + B.rz.toFixed(1) + 'σ）。この後はBTCに負けやすい傾向でした' }); }
  if (ok(A.rz) && A.rz >= 1.5) { sc.MSTR -= 2; why.push({ s: 'COIN', t: 'MSTRがBTCに対して割高（+' + A.rz.toFixed(1) + 'σ）。この後はBTCに負けやすい傾向でした' }); }
  if (ok(A.rz) && A.rz <= -1.5) why.push({ s: null, t: 'MSTRもBTCに対して割安（' + A.rz.toFixed(1) + 'σ）ですが、直近2年は割安なまま戻らない傾向で、材料にしていません' });
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
    '<p class="sub">差が2点以上なら片方、それ未満なら半分ずつにしています。割安・割高は、株価とBTCの比率が直近90日の平均からどれだけ離れているかです。</p></section>';
}
const PLAN = { buy: ['今夜買う', 'v-buy'], limit: ['指値で待つ', 'v-wait'], skip: ['今日は買わない', 'v-avoid'] };

/* ---------- live log (forward verification) ---------- */
function writeLog() {
  const d = S.d, n = d.c.length, key = dkey(d.t[n - 1]), log = LS.get('log', []);
  if (log.some(x => x.k === key)) return;
  const liq = S.liq || {}, opt = S.opt || {};
  const pct = {}, act = {}; E.HORIZONS.forEach(h => { pct[h.k] = Math.round(S.R.hz[h.k].pct); act[h.k] = S.act[h.k].a; });
  const pl = S.plan, sp = {}; if (pl) Object.keys(pl.stocks).forEach(sym => { const x = pl.stocks[sym]; sp[sym] = { a: x.a, px: +x.now.toFixed(2), lim: ok(x.lim) ? +x.lim.toFixed(2) : null }; });
  const up = S.up && S.up.type !== 'neutral' ? { t: S.up.type, lid: ok(S.up.lidLv) ? Math.round(S.up.lidLv) : null, tg: ok(S.up.tgt) ? Math.round(S.up.tgt) : null } : null;
  const pk = S.pick ? S.pick.final : null;
  const hv = (S.hold || []).filter(h => ok(h.now)).map(h => ({ s: h.p.sym, a: h.a, px: +h.now.toFixed(2) }));
  log.push({ k: key, t: d.t[n - 1], px: d.c[n - 1], pct, act, pa: pl ? pl.a : null, sp, up, hv, pk, cy: S.cyc ? S.cyc.phase : null, lr: ok(liq.longRisk) && liq.ok ? liq.longRisk : null, sr: ok(liq.shortRisk) && liq.ok ? liq.shortRisk : null, fl: !!liq.flush, sk: ok(opt.skew) ? +opt.skew.toFixed(1) : null, pcr: ok(opt.pcrOI) ? +opt.pcrOI.toFixed(2) : null, ev: !!S.ev48 });
  LS.set('log', log.slice(-900));
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
  const d = S.d, idx = new Map(); for (let i = 0; i < d.t.length; i++) idx.set(dkey(d.t[i]), i);
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
    st.an = { vmap: new Map(v), px: sc[m - 1], date: v[m - 1][0], chg: sc[m - 1] / sc[m - 2] - 1, beta, corr, rz, rsi: r14[m - 1], s50: s50[m - 1], s200: s200[m - 1], bt, btcAt: d.c[bi[m - 1]] };
  });
}

/* ================= refresh ================= */
async function refreshAll() {
  if (S.loading) return; S.loading = true; S.fatal = null; renderTop();
  try { const dd = await loadDaily(); setData(dd.rows, dd.src); } catch (e) { if (!S.d) S.fatal = e.message; }
  const mark = (k, name, p, okNote, ngNote) => p.then(v => { S.status[k] = { ok: true, name, note: typeof okNote === 'function' ? okNote(v) : okNote }; return v; }, () => { S.status[k] = { ok: false, name, note: ngNote }; return null; });
  const tasks = [
    mark('opt', 'オプション', loadOptions(), v => 'Deribit、' + v.list.length + '銘柄', 'Deribit から取得できません。オプション関連は非表示です').then(v => { if (v) S.optRaw = v; }),
    mark('dvol', 'インプライドボラ履歴', loadDvol(), v => 'Deribit DVOL、' + Object.keys(v).length + '日分', '取得できません。オプション要因はスコアから外れます').then(v => { if (v) S.dvol = v; else S.dvol = Object.keys(LS.get('dvol', {})).length ? LS.get('dvol', {}) : null; }),
    mark('fund', '資金調達率の履歴', loadFunding(), v => 'Binance先物、' + Object.keys(v.days).length + '日分', '取得できません。建玉要因はスコアから外れます').then(v => { if (v) S.fund = v; else { const c = LS.get('fund', null); S.fund = c && c.last ? c : null; } }),
    mark('fut', '建玉・ロングショート比', loadFutures(), v => 'Binance先物' + (v.oi ? '、直近30日' : '（建玉履歴なし）'), '').then(async v => {
      if (v) { S.fut = v; return; }
      try { S.fut = await loadDeribitPerp(); S.status.fut = { ok: false, name: '建玉・ロングショート比', note: 'Binance先物に接続できません。Deribitの資金調達率のみ表示（清算の集中帯は推定不可）' }; }
      catch (e) { S.status.fut = { ok: false, name: '建玉・ロングショート比', note: '取得できません。清算の予兆は表示できません' }; }
    })
  ];
  tasks.push(mark('long', '長期の価格履歴（サイクル用）', loadLong(), v => 'Bitstamp、' + v.length + '日分', '取得できません。サイクルの表示と長期要因は使えません').then(v => { if (v) S.longRows = v; else { const c = LS.get('long', null); S.longRows = c ? c.rows : null; } }));
  tasks.push((async () => {
    let repo = null; try { repo = await loadStockRepo(); } catch (e) { /* リポジトリ版がない */ }
    if (repo) S.etf = repo.symbols;
    for (const sym of ['MSTR', 'COIN']) {
      const v = repo && repo.symbols[sym];
      if (v && v.length > 120) { S.stocks[sym] = { vals: v }; S.stkSrc = '毎日自動取得（' + (repo.source || 'Yahoo Finance') + '、' + String(repo.updated || '').slice(0, 10) + ' 更新）'; continue; }
      if (S.cfg.tdKey) { try { S.stocks[sym] = { vals: await loadStock(sym) }; S.stkSrc = 'Twelve Data'; } catch (e) { S.stocks[sym] = { err: e.message }; } }
      else S.stocks[sym] = { err: '株価データがまだ用意されていません（毎日の自動取得を待っています）' };
    }
  })());
  await Promise.allSettled(tasks);
  { const er = ['MSTR', 'COIN'].filter(s => S.stocks[s] && S.stocks[s].err); S.status.stk = { ok: !er.length, name: '関連株（MSTR・COIN）', note: er.length ? er.join('・') + '：' + S.stocks[er[0]].err : S.stkSrc }; }
  try { compute(); } catch (e) { S.fatal = '計算中にエラーが起きました：' + e.message; }
  S.loading = false; S.at = Date.now(); render();
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
    '<span class="track"><i class="z za"></i><i class="z zw"></i><i class="z zt"></i><i class="z zb"></i>' + (ok(p) ? '<b class="needle" style="left:' + p.toFixed(1) + '%"><em class="num">' + Math.round(p) + '</em></b>' : '') + '</span>' +
    '<span class="rail-sub">' + sub + '</span>' + note + warn + '</button>';
};
function todayCard() {
  const p = S.plan; if (!p) return '';
  const [lab, cls] = PLAN[p.a], t = p.target, ses = p.sess;

  let lead;
  if (p.a === 'buy') lead = '2回に分けて入るのが基本です。半分を今夜の取引で買い、残り半分を下の指値で待ちます。';
  else if (p.a === 'limit') lead = '今の値段では買わず、下の指値を置いて待ちます。届かなければ明日の判定で見直します。';
  else lead = '今日は何もしません。' + (t ? 'BTCが下の価格帯まで下がるか、判定が「打診買い」以上に変わったら検討します。' : '判定が「打診買い」以上に変わったら検討します。');
  const syms = Object.keys(p.stocks);
  const rows = syms.map(sym => {
    const x = p.stocks[sym], [sl, sc] = PLAN[x.a];
    const lines = [];
    const an = S.stocks[sym].an;
    lines.push(['終値（' + an.date.slice(5).replace('-', '/') + ' 通常取引）', usd2(an.px)]);
    lines.push(['いまの目安（BTCから換算）', usd2(x.now)]);
    if (x.a === 'buy') { lines.push(['残り半分の指値', usd2(x.lim)]); lines.push(['撤退の目安', usd2(x.stop)]); }
    else if (x.a === 'limit') { lines.push(['指値', usd2(x.lim)]); lines.push(['撤退の目安', usd2(x.stop)]); }
    else if (ok(x.lim)) lines.push(['検討を始める水準', usd2(x.lim)]);
    if (ok(x.lo)) lines.push(['今日の想定レンジ', usd2(x.lo) + '〜' + usd2(x.hi)]);
    const lev = sym === 'MSTR' ? 'MSTU' : 'CONL', en = etfAt(lev, S.price);
    if (ok(en)) lines.push([lev + '（2倍）の目安' + (x.a !== 'skip' && t ? ' / 指値' : ''), usd2(en) + (x.a !== 'skip' && t ? ' / ' + usd2(etfAt(lev, t.mid)) : '')]);
    return '<div class="plan-stock"><div class="row"><b class="sym">' + sym + '</b><b class="' + sc + ' plan-v">' + sl + '</b></div><dl class="kv">' + lines.map(l => '<dt>' + l[0] + '</dt><dd class="num">' + l[1] + '</dd>').join('') + '</dl>' + (x.note.length ? '<p class="sub">' + x.note.join('。') + '</p>' : '') + '</div>';
  }).join('');
  const btc = [];
  if (t) btc.push((p.a === 'skip' ? '検討を始めるBTCの価格帯 ' : 'BTCの指値の基準 ') + '<span class="num">' + usd(t.mid) + '（' + pc(t.dist) + '）</span>' + (p.a !== 'skip' && ok(p.reach) ? '。過去2年で、1日のうちにこの水準まで下げた日は ' + pc(p.reach, 0, false) : ''));
  if (p.rng) btc.push('今日のBTCの想定レンジ <span class="num">' + usd(p.rng.lo) + '〜' + usd(p.rng.hi) + '</span>（' + p.rng.src + '）');
  const fd = S.R.hz.d, u = S.up;
  if (u && u.type === 'lid' && p.a !== 'skip' && ok(u.lidLv)) btc.push('上は ' + '<span class="num">' + usd(u.lidLv) + '</span> 付近で蓋をされやすい形です。買った後はそこで一部の利益確定を考えます');
  if (u && u.type === 'squeeze' && ok(u.tgt)) btc.push('踏み上げ型です。上がり始めたら <span class="num">' + usd(u.tgt) + '</span> 付近まで走りやすく、指値が置いていかれることもあります');
  const ph = S.cyc ? S.cyc.phase : null;
  if (ph === 'bottom' && p.a === 'skip') lead = 'サイクルは仕込む時期ですが、今日の入る判定は見送りです。買い足しは、判定が「打診買い」以上になるか、下の水準まで待ちます。';
  if (ph === 'bottom' && p.a === 'limit') lead = 'サイクルは仕込む時期です。今の値段では買わず、下の指値を置いて待ちます。一度に全部ではなく、3〜4回に分けます。';
  if (ph === 'bottom' && p.a === 'buy') lead = 'サイクルは仕込む時期で、入る判定も出ています。予定額の4分の1ずつ、半分を今夜、残りを下の指値で。';
  if (ph === 'top') lead = 'サイクルは天井圏です。新しく買わず、持っている分を分けて売っていく時期です。';
  if (ph === 'down') lead = '天井を過ぎた下落期です。買いません。レバレッジETFは持ち越しません。';
  return '<section class="today">' + sessionStrip() + cycleStrip() + '<h1 class="' + cls + '">' + lab + '</h1><p class="today-lead">' + lead + '</p><p class="today-why">理由：' + esc(p.why.join('。')) + '</p>' +
    (rows || '<p class="sub">MSTR・COINの株価を読み込めていないため、BTCの価格で表示しています。</p>') +
    '<ul class="today-btc">' + btc.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
    '<p class="sub">今日1日の上げ下げは予想していません。過去の検証で1日先の方向の的中率は ' + pc(fd.ev.st.all.win, 0, false) + '前後とほぼ五分で、当てにならないためです。代わりに「どこで買うか」の値段と、1週間〜3か月の判定で決めています。株価は BTCとの連動（ベータ）から換算した目安です。</p></section>';
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
  return todayCard() + pickCard() + holdCards() + '<h2 class="sec">時間軸ごとの判定</h2>' +
    '<section class="rails" aria-label="時間軸ごとの判定">' + E.HORIZONS.filter(h => h.k !== 'd').map(railHTML).join('') + '<p class="legend"><span><i class="z za"></i>見送り</span><span><i class="z zw"></i>様子見</span><span><i class="z zt"></i>打診買い</span><span><i class="z zb"></i>買い好機</span></p></section>' +
    flags + cycleCard() + upsideCard(false) +
    '<section class="card"><h2>' + H.name + 'の判定の内訳</h2><div class="cats">' + cats + '</div>' + facts + '<p class="sub">各要因の重みは、過去4年のデータで ' + H.d + ' 日後の値動きと実際に連動していた度合いから毎回計算し直しています。</p></section>' +
    '<section class="card"><div class="row"><h2>価格と予測レンジ</h2><div class="seg" role="group" aria-label="表示期間">' + [[90, '3か月'], [365, '1年'], [1460, '4年']].map(r => '<button data-range="' + r[0] + '" aria-pressed="' + (S.range === r[0]) + '">' + r[1] + '</button>').join('') + '</div></div>' + priceChart() +
    '<p class="keys"><span><i class="k-px"></i>終値</span><span><i class="k-50"></i>50日線</span><span><i class="k-200"></i>200日線</span><span><i class="k-cone"></i>予測の幅（濃い帯は50%、薄い帯は80%）</span><span><i class="k-zone"></i>エントリー候補</span></p><p class="sub">チャート下の帯は、その日に出ていた' + H.name + '判定です。</p></section>' +
    '<section class="card"><h2>エントリー候補の価格帯</h2><p class="sub">現値 <span class="num">' + usd(price) + '</span> より下で、テクニカル・出来高・オプション・清算の節目が重なる水準です。●が多いほど根拠が重なっています。</p><ul class="zones">' + below + '</ul>' + (above ? '<h3>上値の節目</h3><ul class="zones">' + above + '</ul>' : '') + '</section>' +
    '<section class="card"><h2>この先の値幅の目安</h2><table class="tbl"><thead><tr><th></th><th>半分が収まった範囲</th><th>中央値</th><th>上昇した割合</th></tr></thead><tbody>' + fcRows + '</tbody></table><p class="sub">いまと同じスコア水準だった過去の日から、その後の値動きを集計したものです。</p>' + im + '</section>' +
    '<section class="card"><h2>データの取得状況</h2><ul class="stat">' + stat + '</ul><p class="sub">判定に使う日足は ' + ymd(S.d.t[S.d.c.length - 1]) + '（UTC）の確定分まで。開いている間は5分ごとに更新します。</p></section>' +
    '<p class="disc">過去データの統計にもとづく目安で、将来の値動きを保証するものではありません。投資の判断はご自身の責任で行ってください。</p>';
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
    '<section class="card"><h2>このアプリが記録した判定</h2>' + live + '<p class="sub">開いた日の判定をこの端末に保存し、期日が来たら自動で照合します。後から計算し直した判定ではなく、その日に実際に表示した内容の記録です。</p></section>' +
    '<details class="card"><summary>計算のしかた</summary><p>テクニカル9種、出来高4種、オプション2種（Deribit DVOL、2021年以降）、資金調達率2種（Binance先物、2019年以降）の指標を毎日計算します。各指標が過去4年間で「' + h.d + '日後のリターン」とどれだけ連動していたかを相関で測り、それを重みにして合成したものがスコアです。スコアは過去4年の中での順位（0〜100）に直しています。</p><p>重みの計算にはその日より前に結果が確定していたデータしか使わないため、上の成績はすべて「当時知り得た情報だけで出した判定」の結果です。プット・コール比率、スキュー、建玉、清算の集中帯は長期の履歴が公開されていないのでスコアには入れず、警戒フラグとして判定を一段階下げる用途に限っています。</p></details>';
}

function meter(val, label, level) { return '<div class="meter"><div class="row"><span>' + label + '</span><b class="lvl-' + (val >= 65 ? 'hi' : val >= 45 ? 'mid' : 'lo') + '">' + level + '<span class="num"> ' + val + '</span></b></div><div class="mtrack"><b style="width:' + val + '%" class="m-' + (val >= 65 ? 'hi' : val >= 45 ? 'mid' : 'lo') + '"></b></div></div>'; }
function viewFlow() {
  if (!S.R) return '';
  const q = S.liq, o = S.opt, price = S.price; let h = '<section class="lead"><h1>建玉とオプションの偏り</h1><p>レバレッジの積み上がりと、オプション市場の構えを見ます。</p></section>';
  h += upsideCard(true);
  if (q && q.ok) {
    const kv = [];
    if (ok(q.fundNow)) kv.push(['資金調達率（直近）', pc(q.fundNow, 4) + ' / 8時間']);
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
        '<p class="sub">直近30日で建玉が増えた価格を建値とみなし、10・25・50・100倍のレバレッジで清算される水準を積み上げた推定です。すでに価格が通過した水準は除いています。取引所の実際の清算注文ではありません。</p></section>';
    }
  } else h += '<section class="card"><h2>清算の予兆</h2><p class="muted">先物データを取得できないため表示できません。' + esc((S.status.fut && S.status.fut.note) || '') + '</p></section>';
  if (o) {
    const kv = [['P/C比（建玉）', ok(o.pcrOI) ? o.pcrOI.toFixed(2) : '—'], ['P/C比（24時間の出来高）', ok(o.pcrVol) ? o.pcrVol.toFixed(2) : '—'], ['IV（約' + Math.round(o.ivDays) + '日満期・現値付近）', ok(o.atmIV) ? o.atmIV.toFixed(1) + '%' : '—'],
      ['スキュー（下10%プット−上10%コール）', ok(o.skew) ? (o.skew > 0 ? '+' : '') + o.skew.toFixed(1) + 'pt' : '—'], ['DVOL', ok(o.dvol) ? o.dvol.toFixed(1) + (ok(o.dvolPct) ? '（1年の下位' + pc(o.dvolPct, 0, false) + '）' : '') : '—'],
      ['織り込む変動幅', ok(o.move7) ? '7日 ±' + pc(o.move7, 1, false) + '（' + usd(price * (1 - o.move7)) + '〜' + usd(price * (1 + o.move7)) + '）' : '—'],
      ['コール建玉の壁', o.callWall ? usd(o.callWall.K) + '（' + pc(o.callWall.K / price - 1) + '）' : '—'], ['プット建玉の壁', o.putWall ? usd(o.putWall.K) + '（' + pc(o.putWall.K / price - 1) + '）' : '—']];
    h += '<section class="card"><h2>オプション市場</h2><dl class="kv">' + kv.map(x => '<dt>' + x[0] + '</dt><dd class="num">' + x[1] + '</dd>').join('') + '</dl></section>' +
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
      items.push('<li><span class="num">' + x.k.slice(5).replace('-', '/') + '</span><span>' + sym + ' ' + PLAN[e.a][0] + '</span><span class="num">' + usd2(e.px) + (e.lim && e.a !== 'buy' ? '（指値 ' + usd2(e.lim) + '）' : '') + '</span><b class="' + cls + '">' + res + '</b></li>');
    });
  });
  return '<section class="card"><h2>「今日どうする」の答え合わせ</h2><ul class="calls">' + items.join('') + '</ul><p class="sub">開いた日に表示した行動を記録し、5営業日後の株価で自動判定します。「今夜買う」は上がれば的中、「今日は買わない」は下がれば的中、「指値で待つ」は指値に届くか、届かずに下がれば的中です（終値ベースの概算）。</p></section>';
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
  h += '<section class="card"><h2>持っている銘柄を登録する</h2>' + (pos.length ? '<ul class="pair">' + pos.map((p, i) => '<li><span><b>' + p.sym + '</b>　<span class="num">' + usd2(p.cost) + (p.qty ? ' × ' + p.qty + '株' : '') + (p.date ? '　' + p.date : '') + '</span></span><button class="link" data-delpos="' + i + '">削除する</button></li>').join('') + '</ul>' : '<p class="muted">まだ登録がありません。登録すると、判定タブに「持ち続ける／買い足し可／一部売る／売る」が毎日出ます。</p>') +
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
  v.innerHTML = (views[S.tab] || viewJudge)();
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
    const a = LS.get('events', []); a.push({ t: tm, title, impact: +$('#ev-imp').value, kind: 'custom' }); LS.set('events', a); S.events = allEvents(); if (S.R) decide(); render();
  }
  else if (t.dataset.delpos != null) { const a = LS.get('pos', []); a.splice(+t.dataset.delpos, 1); LS.set('pos', a); if (S.R) { S.hold = holdAll(); S.pick = pickStock(); } render(); }
  else if (t.id === 'pos-add') {
    const cost = +$('#pos-cost').value, qty = +$('#pos-qty').value || null, date = $('#pos-date').value || null;
    if (!(cost > 0)) { t.textContent = '買値を入力してください'; return; }
    const a = LS.get('pos', []); a.push({ sym: $('#pos-sym').value, cost, qty, date }); LS.set('pos', a); if (S.R) { S.hold = holdAll(); S.pick = pickStock(); } location.hash = 'judge';
  }
  else if (t.id === 'cfg-save') { S.cfg = { tdKey: $('#td-key').value.trim(), src: $('#src').value }; LS.set('cfg', S.cfg); S.stocks = {}; refreshAll(); }
  else if (t.id === 'cfg-reset') {
    if (t.dataset.sure) { ['daily', 'dvol', 'fund', 'log', 'events', 'cfg', 'stk.MSTR', 'stk.COIN', 'long', 'pos'].forEach(LS.del); location.reload(); }
    else { t.dataset.sure = '1'; t.textContent = 'もう一度押すと、記録もすべて消えます'; }
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.at && Date.now() - S.at > 5 * 60e3) refreshAll(); });

const cache = LS.get('daily', null);
if (cache && cache.rows && cache.rows.length > 300) { try { setData(cache.rows, cache.src); S.dvol = LS.get('dvol', null); const lg = LS.get('long', null); S.longRows = lg ? lg.rows : null; const f = LS.get('fund', null); S.fund = f && f.last ? f : null; compute(); } catch (e) { /* 保存データが壊れていたら無視 */ } }
route();
refreshAll();
setInterval(() => { if (!document.hidden) refreshAll(); }, 5 * 60e3);
window.__S = S;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
