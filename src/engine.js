(function (g) {
'use strict';
const HORIZONS = [
  { k: 'd', d: 1, name: '今日', span: '明朝9時まで' },
  { k: 's', d: 7, name: '短期', span: '1週間' },
  { k: 'm', d: 30, name: '中期', span: '1か月' },
  { k: 'l', d: 90, name: '長期', span: '3か月' }
];
const W = 1460, MIN_Z = 250, MIN_IC = 365, IC_FLOOR = 0.03;
const TH = { buy: 75, try_: 60, wait: 40 };
const CATS = { tech: 'テクニカル', vol: '出来高', opt: 'オプション', lev: '建玉・資金調達', cyc: '長期サイクル' };

/* ---------- basic series helpers ---------- */
const nan = n => new Float64Array(n).fill(NaN);
function sma(a, n) {
  const o = nan(a.length); let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === a[i]) { s += a[i]; c++; }
    if (i >= n) { const x = a[i - n]; if (x === x) { s -= x; c--; } }
    if (c === n) o[i] = s / n;
  }
  return o;
}
function ema(a, n) {
  const o = nan(a.length), k = 2 / (n + 1); let p = NaN;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x !== x) { o[i] = p; continue; }
    p = p === p ? p + k * (x - p) : x; o[i] = p;
  }
  return o;
}
function rollStd(a, n) {
  const o = nan(a.length); let s = 0, ss = 0, c = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === a[i]) { s += a[i]; ss += a[i] * a[i]; c++; }
    if (i >= n) { const x = a[i - n]; if (x === x) { s -= x; ss -= x * x; c--; } }
    if (c === n) { const m = s / n; o[i] = Math.sqrt(Math.max(0, ss / n - m * m)); }
  }
  return o;
}
function rollExt(a, n, isMax) {
  const o = nan(a.length);
  for (let i = 0; i < a.length; i++) {
    let m = isMax ? -Infinity : Infinity;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) { const x = a[j]; if (x === x) m = isMax ? Math.max(m, x) : Math.min(m, x); }
    o[i] = isFinite(m) ? m : NaN;
  }
  return o;
}
function rsi(c, n) {
  const o = nan(c.length); let ag = 0, al = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], gn = Math.max(d, 0), ls = Math.max(-d, 0);
    if (i <= n) { ag += gn / n; al += ls / n; if (i === n) o[i] = 100 - 100 / (1 + ag / (al || 1e-12)); }
    else { ag = (ag * (n - 1) + gn) / n; al = (al * (n - 1) + ls) / n; o[i] = 100 - 100 / (1 + ag / (al || 1e-12)); }
  }
  return o;
}
function atr(d, n) {
  const tr = nan(d.c.length);
  for (let i = 1; i < d.c.length; i++) tr[i] = Math.max(d.h[i] - d.l[i], Math.abs(d.h[i] - d.c[i - 1]), Math.abs(d.l[i] - d.c[i - 1]));
  return sma(tr, n);
}
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- factors ---------- */
function buildFactors(d, ex) {
  const n = d.c.length, c = d.c, v = d.v;
  const ret = nan(n); for (let i = 1; i < n; i++) ret[i] = Math.log(c[i] / c[i - 1]);
  const s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200), sd20 = rollStd(c, 20);
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = nan(n); for (let i = 0; i < n; i++) macd[i] = e12[i] - e26[i];
  const sig = ema(macd, 9), r14 = rsi(c, 14), hi365 = rollExt(d.h, 365, true);
  const rv30 = rollStd(ret, 30);
  const v20 = sma(v, 20), v100 = sma(v, 100);
  const sv = nan(n), cap = nan(n), obv = nan(n);
  let ob = 0;
  for (let i = 1; i < n; i++) {
    const rel = v20[i] > 0 ? v[i] / v20[i] - 1 : NaN;
    sv[i] = rel === rel ? Math.sign(ret[i]) * rel : NaN;
    cap[i] = rel === rel ? Math.max(0, -ret[i]) * Math.max(0, rel) : NaN;
    ob += Math.sign(ret[i]) * v[i]; obv[i] = ob;
  }
  const svE = ema(sv, 5), capE = ema(cap, 10), obvS = sma(obv, 30), vSum30 = sma(v, 30);
  const dv = ex && ex.dvol ? ex.dvol : nan(n), fu = ex && ex.fund ? ex.fund : nan(n);
  const dv365 = sma(dv, 365), fu7 = sma(fu, 7), fu30 = sma(fu, 30);
  const cpl = ex && ex.pl ? ex.pl : nan(n), cw2 = ex && ex.w200 ? ex.w200 : nan(n);
  const F = [
    { id: 't_ma200', cat: 'tech', label: '200日線からの乖離', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(1) + '%' },
    { id: 't_cross', cat: 'tech', label: '50日線と200日線の位置', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(1) + '%' },
    { id: 't_mom30', cat: 'tech', label: '30日モメンタム', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(1) + '%' },
    { id: 't_mom7', cat: 'tech', label: '7日モメンタム', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(1) + '%' },
    { id: 't_rsi', cat: 'tech', label: 'RSI(14)', x: r14, fmt: x => x.toFixed(0) },
    { id: 't_macd', cat: 'tech', label: 'MACDヒストグラム', x: nan(n), fmt: x => (x * 100).toFixed(2) + '%' },
    { id: 't_bb', cat: 'tech', label: 'ボリンジャーバンド位置', x: nan(n), fmt: x => x.toFixed(2) + 'σ' },
    { id: 't_dd', cat: 'tech', label: '1年高値からの下落率', x: nan(n), fmt: x => (x * 100).toFixed(1) + '%' },
    { id: 't_rv', cat: 'tech', label: '実現ボラティリティ(30日)', x: nan(n), fmt: x => (x * 100).toFixed(0) + '%' },
    { id: 'v_flow', cat: 'vol', label: '方向つき出来高（買い/売りの勢い）', x: svE, fmt: x => (x >= 0 ? '+' : '') + x.toFixed(2) },
    { id: 'v_obv', cat: 'vol', label: 'OBVのトレンド', x: nan(n), fmt: x => (x >= 0 ? '+' : '') + x.toFixed(2) },
    { id: 'v_cap', cat: 'vol', label: '投げ売り出来高（セリングクライマックス）', x: capE, fmt: x => (x * 100).toFixed(2) },
    { id: 'v_trend', cat: 'vol', label: '出来高の増減（20日/100日）', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(0) + '%' },
    { id: 'o_dvol', cat: 'opt', label: 'インプライドボラ（DVOL）の水準', x: nan(n), fmt: x => (Math.expm1(x) * 100).toFixed(0) + '%（1年平均比）' },
    { id: 'o_vrp', cat: 'opt', label: 'IVと実現ボラの差', x: nan(n), fmt: x => (x >= 0 ? '+' : '') + x.toFixed(0) + 'pt' },
    { id: 'f_fund7', cat: 'lev', label: '資金調達率（7日平均）', x: fu7, fmt: x => (x * 100).toFixed(4) + '%' },
    { id: 'f_fund30', cat: 'lev', label: '資金調達率（30日平均）', x: fu30, fmt: x => (x * 100).toFixed(4) + '%' },
    { id: 'c_pl', cat: 'cyc', label: '長期成長線からの乖離（レインボー）', x: cpl, fmt: x => (Math.expm1(x) * 100).toFixed(0) + '%' },
    { id: 'c_w200', cat: 'cyc', label: '200週線からの乖離', x: cw2, fmt: x => (Math.expm1(x) * 100).toFixed(0) + '%' }
  ];
  const get = id => F.find(f => f.id === id).x;
  for (let i = 0; i < n; i++) {
    if (s200[i] === s200[i]) { get('t_ma200')[i] = Math.log(c[i] / s200[i]); get('t_cross')[i] = Math.log(s50[i] / s200[i]); }
    if (i >= 30) get('t_mom30')[i] = Math.log(c[i] / c[i - 30]);
    if (i >= 7) get('t_mom7')[i] = Math.log(c[i] / c[i - 7]);
    get('t_macd')[i] = (macd[i] - sig[i]) / c[i];
    if (sd20[i] > 0) get('t_bb')[i] = (c[i] - s20[i]) / sd20[i];
    if (hi365[i] === hi365[i]) get('t_dd')[i] = c[i] / hi365[i] - 1;
    get('t_rv')[i] = rv30[i] * Math.sqrt(365);
    if (vSum30[i] > 0 && obvS[i] === obvS[i]) get('v_obv')[i] = (obv[i] - obvS[i]) / (vSum30[i] * 30);
    if (v100[i] > 0 && v20[i] > 0) get('v_trend')[i] = Math.log(v20[i] / v100[i]);
    if (dv[i] > 0 && dv365[i] > 0) get('o_dvol')[i] = Math.log(dv[i] / dv365[i]);
    if (dv[i] > 0 && rv30[i] === rv30[i]) get('o_vrp')[i] = dv[i] - rv30[i] * Math.sqrt(365) * 100;
  }
  return { F, ind: { s20, s50, s200, sd20, r14, rv30, atr14: atr(d, 14) } };
}

/* ---------- walk-forward scoring ---------- */
function prefix1(x) {
  const n = x.length, N = new Float64Array(n + 1), S = new Float64Array(n + 1), Q = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const ok = x[i] === x[i]; N[i + 1] = N[i] + (ok ? 1 : 0); S[i + 1] = S[i] + (ok ? x[i] : 0); Q[i + 1] = Q[i] + (ok ? x[i] * x[i] : 0); }
  return { N, S, Q };
}
function prefix2(x, y) {
  const n = x.length, N = new Float64Array(n + 1), X = new Float64Array(n + 1), Y = new Float64Array(n + 1), XX = new Float64Array(n + 1), YY = new Float64Array(n + 1), XY = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const ok = x[i] === x[i] && y[i] === y[i], a = ok ? x[i] : 0, b = ok ? y[i] : 0;
    N[i + 1] = N[i] + (ok ? 1 : 0); X[i + 1] = X[i] + a; Y[i + 1] = Y[i] + b; XX[i + 1] = XX[i] + a * a; YY[i + 1] = YY[i] + b * b; XY[i + 1] = XY[i] + a * b;
  }
  return { N, X, Y, XX, YY, XY };
}
function corrRange(p, a, b) { // inclusive a..b
  if (b < a) return NaN;
  const n = p.N[b + 1] - p.N[a]; if (n < MIN_IC) return NaN;
  const sx = p.X[b + 1] - p.X[a], sy = p.Y[b + 1] - p.Y[a];
  const vx = (p.XX[b + 1] - p.XX[a]) - sx * sx / n, vy = (p.YY[b + 1] - p.YY[a]) - sy * sy / n;
  if (vx <= 0 || vy <= 0) return NaN;
  return ((p.XY[b + 1] - p.XY[a]) - sx * sy / n) / Math.sqrt(vx * vy);
}

function scoreHorizon(d, F, H) {
  const n = d.c.length, c = d.c;
  const y = nan(n); for (let s = 0; s + H < n; s++) y[s] = Math.log(c[s + H] / c[s]);
  const p1 = F.map(f => prefix1(f.x)), p2 = F.map(f => prefix2(f.x, y));
  const raw = nan(n), pct = nan(n);
  const cats = Object.keys(CATS), catRaw = {}; cats.forEach(k => catRaw[k] = nan(n));
  let last = null;
  for (let t = 0; t < n; t++) {
    const b = t - H, a = Math.max(0, b - W + 1), za = Math.max(0, t - W + 1);
    let num = 0, den = 0; const cn = {}, cd = {}, det = [];
    for (let j = 0; j < F.length; j++) {
      let ic = b >= 0 ? corrRange(p2[j], a, b) : NaN;
      const w = ic === ic && Math.abs(ic) >= IC_FLOOR && !(F[j].cat === 'cyc' && H < 30) ? ic : 0;
      const x = F[j].x[t], q = p1[j], m = q.N[t + 1] - q.N[za];
      let z = NaN;
      if (x === x && m >= MIN_Z) {
        const mu = (q.S[t + 1] - q.S[za]) / m, va = (q.Q[t + 1] - q.Q[za]) / m - mu * mu;
        if (va > 0) z = clamp((x - mu) / Math.sqrt(va), -3, 3);
      }
      if (w !== 0 && z === z) {
        num += w * z; den += Math.abs(w);
        const k = F[j].cat; cn[k] = (cn[k] || 0) + w * z; cd[k] = (cd[k] || 0) + Math.abs(w);
      }
      if (t === n - 1) det.push({ id: F[j].id, cat: F[j].cat, label: F[j].label, ic, w, z, x, text: x === x ? F[j].fmt(x) : '—' });
    }
    if (den > 0) raw[t] = num / den;
    cats.forEach(k => { if (cd[k] > 0) catRaw[k][t] = cn[k] / cd[k]; });
    if (t === n - 1) { det.forEach(o => o.contrib = den > 0 && o.w !== 0 && o.z === o.z ? o.w * o.z / den : 0); last = det; }
  }
  const rank = (arr, t) => {
    const v = arr[t]; if (v !== v) return NaN;
    let lo = 0, m = 0;
    for (let s = Math.max(0, t - W); s < t; s++) { const u = arr[s]; if (u === u) { m++; if (u < v) lo++; else if (u === v) lo += 0.5; } }
    return m >= MIN_Z ? 100 * lo / m : NaN;
  };
  for (let t = 0; t < n; t++) pct[t] = rank(raw, t);
  const catPct = {}; cats.forEach(k => catPct[k] = rank(catRaw[k], n - 1));
  return { H, raw, pct, catPct, factors: last };
}

const verdictOf = p => p !== p ? 'na' : p >= TH.buy ? 'buy' : p >= TH.try_ ? 'try' : p >= TH.wait ? 'wait' : 'avoid';
const VERDICT = { buy: '買い好機', try: '打診買い', wait: '様子見', avoid: '見送り', na: '判定不能' };

function summarize(rs) {
  if (!rs.length) return { n: 0, win: NaN, mean: NaN, med: NaN };
  const s = rs.slice().sort((a, b) => a - b);
  return { n: rs.length, win: rs.filter(x => x > 0).length / rs.length, mean: rs.reduce((a, b) => a + b, 0) / rs.length, med: quantile(s, 0.5) };
}

function evaluate(d, sc) {
  const n = d.c.length, H = sc.H, c = d.c, lastM = n - 1 - H;
  const groups = { all: [], buy: [], try: [], wait: [], avoid: [], sig: [] }, rec = { all: [], sig: [], avoid: [] }, yr = { all: [], sig: [], avoid: [] };
  let first = -1;
  for (let t = 0; t <= lastM; t++) {
    const p = sc.pct[t]; if (p !== p) continue;
    if (first < 0) first = t;
    const r = c[t + H] / c[t] - 1, v = verdictOf(p);
    groups.all.push(r); groups[v].push(r); if (p >= TH.try_) groups.sig.push(r);
    if (t > lastM - 730) { rec.all.push(r); if (p >= TH.try_) rec.sig.push(r); if (v === 'avoid') rec.avoid.push(r); }
    if (t > lastM - 365) { yr.all.push(r); if (p >= TH.try_) yr.sig.push(r); if (v === 'avoid') yr.avoid.push(r); }
  }
  const st = {}; Object.keys(groups).forEach(k => st[k] = summarize(groups[k]));
  const rc = {}; Object.keys(rec).forEach(k => rc[k] = summarize(rec[k]));
  const y1 = {}; Object.keys(yr).forEach(k => y1[k] = summarize(yr[k]));
  const edgeAll = st.sig.mean - st.all.mean, edgeRec = rc.sig.n >= 20 ? rc.sig.mean - rc.all.mean : NaN;
  const sepAll = st.sig.mean - st.avoid.mean;
  let status = 'ok';
  if (!(st.sig.n >= 60)) status = 'thin';
  else if (!(edgeAll > 0) || !(sepAll > 0)) status = 'bad';
  else if (edgeRec === edgeRec && edgeRec <= 0) status = 'warn';
  // non-overlapping recent calls
  const calls = [];
  for (let t = lastM; t >= 0 && calls.length < 12; t -= H) {
    const p = sc.pct[t]; if (p !== p) break;
    const r = c[t + H] / c[t] - 1, v = verdictOf(p);
    const hit = v === 'buy' || v === 'try' ? r > 0 : v === 'avoid' ? r < 0 : null;
    calls.push({ t: d.t[t], p, v, px: c[t], px2: c[t + H], r, hit });
  }
  // pending (not matured yet) calls
  const pending = [];
  for (let t = n - 1; t > lastM && pending.length < 3; t -= Math.max(1, Math.floor(H / 3))) {
    const p = sc.pct[t]; if (p === p) pending.push({ t: d.t[t], p, v: verdictOf(p), px: c[t], due: d.t[t] + H * 864e5 });
  }
  return { H, first, st, rc, y1, edgeAll, edgeRec, sepAll, status, calls, pending, indep: Math.floor(st.all.n / H) };
}

function simulate(d, sc) {
  const n = d.c.length, c = d.c, fee = 0.001;
  let pos = 0, eq = 1, bh = 1, peak = 1, mdd = 0, bpeak = 1, bmdd = 0, days = 0, inDays = 0, trades = 0, start = -1;
  const E = [], B = [], T = [], rets = [];
  for (let t = 0; t < n - 1; t++) {
    const p = sc.pct[t]; if (p !== p) { if (start >= 0) { /* hold state */ } else continue; }
    if (start < 0) start = t;
    let np = pos;
    if (p === p) { if (p >= TH.try_) np = 1; else if (p < TH.wait) np = 0; }
    if (np !== pos) { eq *= 1 - fee; trades++; pos = np; }
    const r = c[t + 1] / c[t] - 1, sr = pos ? r : 0;
    eq *= 1 + sr; bh *= 1 + r; rets.push(sr);
    peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1);
    bpeak = Math.max(bpeak, bh); bmdd = Math.min(bmdd, bh / bpeak - 1);
    days++; inDays += pos; E.push(eq); B.push(bh); T.push(d.t[t + 1]);
  }
  const yrs = days / 365, mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (rets.length || 1));
  return { T, E, B, cagr: Math.pow(eq, 1 / yrs) - 1, bcagr: Math.pow(bh, 1 / yrs) - 1, mdd, bmdd, exposure: inDays / days, trades, sharpe: sd > 0 ? mu / sd * Math.sqrt(365) : NaN, years: yrs, total: eq - 1, btotal: bh - 1 };
}

function forecast(d, sc) {
  const n = d.c.length, H = sc.H, c = d.c, now = sc.pct[n - 1];
  if (now !== now) return null;
  let band = 12.5, rs = [];
  for (let k = 0; k < 3 && rs.length < 60; k++, band *= 1.6) {
    rs = [];
    for (let t = 0; t + H < n; t++) { const p = sc.pct[t]; if (p === p && Math.abs(p - now) <= band) rs.push(c[t + H] / c[t] - 1); }
  }
  rs.sort((a, b) => a - b);
  return { H, n: rs.length, up: rs.filter(x => x > 0).length / (rs.length || 1), q10: quantile(rs, 0.1), q25: quantile(rs, 0.25), q50: quantile(rs, 0.5), q75: quantile(rs, 0.75), q90: quantile(rs, 0.9) };
}

/* ---------- volume profile & entry zones ---------- */
function volumeProfile(d, days, bins) {
  const n = d.c.length, a = Math.max(0, n - days); let lo = Infinity, hi = -Infinity;
  for (let i = a; i < n; i++) { lo = Math.min(lo, d.l[i]); hi = Math.max(hi, d.h[i]); }
  const w = (hi - lo) / bins, vol = new Float64Array(bins);
  for (let i = a; i < n; i++) {
    const b0 = clamp(Math.floor((d.l[i] - lo) / w), 0, bins - 1), b1 = clamp(Math.floor((d.h[i] - lo) / w), 0, bins - 1), sh = d.v[i] / (b1 - b0 + 1);
    for (let b = b0; b <= b1; b++) vol[b] += sh;
  }
  let poc = 0; for (let b = 1; b < bins; b++) if (vol[b] > vol[poc]) poc = b;
  const nodes = [];
  for (let b = 1; b < bins - 1; b++) if (vol[b] >= vol[b - 1] && vol[b] >= vol[b + 1] && vol[b] >= 0.6 * vol[poc]) nodes.push({ price: lo + (b + 0.5) * w, vol: vol[b], poc: b === poc });
  if (!nodes.some(x => x.poc)) nodes.push({ price: lo + (poc + 0.5) * w, vol: vol[poc], poc: true });
  return { lo, hi, w, vol, nodes };
}

function entryZones(d, ind, price, opt, liq) {
  const n = d.c.length, i = n - 1, L = [];
  const add = (p, label, kind) => { if (p > 0 && isFinite(p)) L.push({ p, label, kind }); };
  add(ind.s20[i], '20日線', 'tech'); add(ind.s50[i], '50日線', 'tech'); add(ind.s200[i], '200日線', 'tech');
  add(ind.s20[i] - 2 * ind.sd20[i], 'ボリンジャー下限', 'tech'); add(ind.s20[i] + 2 * ind.sd20[i], 'ボリンジャー上限', 'tech');
  add(rollExt(d.l, 30, false)[i], '30日安値', 'tech'); add(rollExt(d.l, 90, false)[i], '90日安値', 'tech');
  add(rollExt(d.h, 30, true)[i], '30日高値', 'tech'); add(rollExt(d.h, 90, true)[i], '90日高値', 'tech');
  const vp = volumeProfile(d, 180, 48);
  vp.nodes.forEach(x => add(x.price, x.poc ? '出来高最多の価格帯' : '出来高の厚い価格帯', 'vol'));
  if (opt) {
    add(opt.main && opt.main.maxPain, 'マックスペイン', 'opt');
    add(opt.putWall && opt.putWall.K, 'プット建玉の壁', 'opt'); add(opt.callWall && opt.callWall.K, 'コール建玉の壁', 'opt');
  }
  if (liq && liq.clusters) {
    liq.clusters.below.slice(0, 2).forEach(x => add(x.p, 'ロング清算の集中帯（推定）', 'lev'));
    liq.clusters.above.slice(0, 2).forEach(x => add(x.p, 'ショート清算の集中帯（推定）', 'lev'));
  }
  const group = (arr) => {
    arr.sort((a, b) => a.p - b.p); const Z = [];
    arr.forEach(x => { const z = Z[Z.length - 1]; if (z && x.p / z.hi - 1 <= 0.015) { z.hi = x.p; z.items.push(x); } else Z.push({ lo: x.p, hi: x.p, items: [x] }); });
    Z.forEach(z => { z.mid = (z.lo + z.hi) / 2; z.dist = z.mid / price - 1; z.kinds = [...new Set(z.items.map(x => x.kind))]; z.strength = z.items.length + z.kinds.length - 1; });
    return Z;
  };
  const a14 = ind.atr14[i];
  const below = group(L.filter(x => x.p < price * 0.998 && x.p > price * 0.6)).reverse();
  const above = group(L.filter(x => x.p > price * 1.002 && x.p < price * 1.6));
  below.forEach(z => z.stop = z.lo - a14);
  return { below, above, atr: a14, vp };
}

/* ---------- options (Deribit book summary) ---------- */
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function parseInstr(name) {
  const m = /^BTC-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-([CP])$/.exec(name || ''); if (!m) return null;
  return { exp: Date.UTC(2000 + +m[3], MON[m[2]], +m[1], 8), K: +m[4], type: m[5] };
}
function analyzeOptions(list, spot, now) {
  const E = new Map(); let cO = 0, pO = 0, cV = 0, pV = 0; const byK = new Map();
  (list || []).forEach(r => {
    const q = parseInstr(r.instrument_name); if (!q || q.exp <= now) return;
    const oi = +r.open_interest || 0, vol = +r.volume || 0, iv = +r.mark_iv || 0;
    if (!E.has(q.exp)) E.set(q.exp, { exp: q.exp, callOI: 0, putOI: 0, callVol: 0, putVol: 0, K: new Map(), und: +r.underlying_price || spot });
    const e = E.get(q.exp); if (!e.K.has(q.K)) e.K.set(q.K, { K: q.K, c: 0, p: 0, civ: 0, piv: 0 });
    const k = e.K.get(q.K);
    if (q.type === 'C') { e.callOI += oi; e.callVol += vol; k.c += oi; k.civ = iv; cO += oi; cV += vol; }
    else { e.putOI += oi; e.putVol += vol; k.p += oi; k.piv = iv; pO += oi; pV += vol; }
    if (!byK.has(q.K)) byK.set(q.K, { K: q.K, c: 0, p: 0 });
    const a = byK.get(q.K); if (q.type === 'C') a.c += oi; else a.p += oi;
  });
  const exps = [...E.values()].sort((a, b) => a.exp - b.exp); if (!exps.length) return null;
  const days = e => (e.exp - now) / 864e5;
  const maxPain = e => {
    const ks = [...e.K.values()]; let best = NaN, bp = Infinity;
    ks.forEach(a => { let pain = 0; ks.forEach(b => { pain += b.c * Math.max(0, a.K - b.K) + b.p * Math.max(0, b.K - a.K); }); if (pain < bp) { bp = pain; best = a.K; } });
    return best;
  };
  const elig = exps.filter(e => days(e) >= 1);
  const pool = elig.length ? elig : exps;
  const mainE = pool.reduce((a, b) => (b.callOI + b.putOI > a.callOI + a.putOI ? b : a));
  const nearE = pool[0];
  const pack = e => ({ exp: e.exp, days: days(e), callOI: e.callOI, putOI: e.putOI, pcr: e.callOI > 0 ? e.putOI / e.callOI : NaN, maxPain: maxPain(e), strikes: [...e.K.values()].sort((a, b) => a.K - b.K), und: e.und });
  // ~30d expiry for IV / skew
  const c30 = exps.filter(e => days(e) >= 7); const e30 = (c30.length ? c30 : exps).reduce((a, b) => Math.abs(days(b) - 30) < Math.abs(days(a) - 30) ? b : a);
  const interp = (e, target, key) => {
    const ks = [...e.K.values()].filter(k => k[key] > 0).sort((a, b) => a.K - b.K); if (!ks.length) return NaN;
    if (target <= ks[0].K) return ks[0][key]; if (target >= ks[ks.length - 1].K) return ks[ks.length - 1][key];
    for (let i = 1; i < ks.length; i++) if (ks[i].K >= target) { const a = ks[i - 1], b = ks[i]; return a[key] + (b[key] - a[key]) * (target - a.K) / (b.K - a.K); }
    return NaN;
  };
  const Fw = e30.und || spot, atmC = interp(e30, Fw, 'civ'), atmP = interp(e30, Fw, 'piv');
  const atm = [atmC, atmP].filter(x => x === x); const atmIV = atm.length ? atm.reduce((a, b) => a + b, 0) / atm.length : NaN;
  const skew = interp(e30, Fw * 0.9, 'piv') - interp(e30, Fw * 1.1, 'civ');
  let callWall = null, putWall = null;
  byK.forEach(a => {
    if (a.K > spot && a.K < spot * 1.5 && (!callWall || a.c > callWall.oi)) callWall = { K: a.K, oi: a.c };
    if (a.K < spot && a.K > spot * 0.5 && (!putWall || a.p > putWall.oi)) putWall = { K: a.K, oi: a.p };
  });
  const d30 = days(e30);
  return {
    spot, pcrOI: cO > 0 ? pO / cO : NaN, pcrVol: cV > 0 ? pV / cV : NaN, callOI: cO, putOI: pO,
    main: pack(mainE), near: pack(nearE), atmIV, skew, ivDays: d30,
    move30: atmIV === atmIV ? atmIV / 100 * Math.sqrt(30 / 365) : NaN, move1: atmIV === atmIV ? atmIV / 100 * Math.sqrt(1 / 365) : NaN, move7: atmIV === atmIV ? atmIV / 100 * Math.sqrt(7 / 365) : NaN,
    callWall, putWall,
    expiries: exps.slice(0, 8).map(e => ({ exp: e.exp, days: days(e), oi: e.callOI + e.putOI }))
  };
}

/* ---------- liquidation precursors (futures OI / funding / positioning) ---------- */
function pctRank(arr, v) { const a = arr.filter(x => x === x); if (a.length < 20 || v !== v) return NaN; return a.filter(x => x < v).length / a.length; }
function analyzeLiq(inp, d, price) {
  // inp: { oi:[{t,oi,px}], fundDaily: Float64Array aligned to d, fundNow, ls:[{t,r}], top:[{t,r}] }
  const out = { ok: false, flags: [] };
  const n = d.c.length;
  const f7 = inp.fundDaily ? sma(inp.fundDaily, 7) : null;
  if (f7) {
    const cur = f7[n - 1]; out.fund7 = cur; out.fundPct = pctRank(Array.from(f7.slice(Math.max(0, n - 365))), cur);
  }
  out.fundNow = inp.fundNow;
  const oi = (inp.oi || []).slice().sort((a, b) => a.t - b.t);
  if (oi.length >= 12) {
    const lastO = oi[oi.length - 1], at = ms => { let b = oi[0]; for (const x of oi) { if (x.t <= lastO.t - ms) b = x; else break; } return b; };
    out.oiNow = lastO.oi; out.oiVal = lastO.oi * lastO.px;
    out.oi1 = lastO.oi / at(864e5).oi - 1; out.oi3 = lastO.oi / at(3 * 864e5).oi - 1; out.oi7 = lastO.oi / at(7 * 864e5).oi - 1;
    out.px7 = lastO.px / at(7 * 864e5).px - 1; out.px1 = lastO.px / at(864e5).px - 1;
    out.oiPct = pctRank(oi.map(x => x.oi), lastO.oi);
    out.oiSeries = oi;
    // estimated liquidation clusters
    const LEV = [[10, 0.35], [25, 0.35], [50, 0.2], [100, 0.1]], bw = 0.005, bins = new Map();
    const put = (p, w, side) => { const key = Math.round(Math.log(p) / bw); const k = side + key; const o = bins.get(k) || { p: Math.exp(key * bw), w: 0, side }; o.w += w; bins.set(k, o); };
    const k0 = Math.max(0, n - 60);
    const dayExt = ts => { let mn = Infinity, mx = -Infinity; for (let k = k0; k < n; k++) if (d.t[k] + 864e5 > ts) { mn = Math.min(mn, d.l[k]); mx = Math.max(mx, d.h[k]); } return [mn, mx]; };
    const sufMin = new Float64Array(oi.length + 1).fill(Infinity), sufMax = new Float64Array(oi.length + 1).fill(-Infinity);
    for (let i = oi.length - 1; i >= 0; i--) { sufMin[i] = Math.min(sufMin[i + 1], oi[i].px); sufMax[i] = Math.max(sufMax[i + 1], oi[i].px); }
    for (let i = 1; i < oi.length; i++) {
      const dO = oi[i].oi - oi[i - 1].oi; if (dO <= 0) continue;
      const ex = dayExt(oi[i].t + 864e5);
      const mn = Math.min(sufMin[i + 1], ex[0], price), mx = Math.max(sufMax[i + 1], ex[1], price);
      LEV.forEach(([lv, w]) => {
        const lp = oi[i].px * (1 - 1 / lv + 0.005), sp = oi[i].px * (1 + 1 / lv - 0.005);
        if (lp < mn) put(lp, dO * w, 'L'); if (sp > mx) put(sp, dO * w, 'S');
      });
    }
    const all = [...bins.values()], tot = all.reduce((a, b) => a + b.w, 0) || 1;
    const below = all.filter(x => x.side === 'L' && x.p < price && x.p > price * 0.8).sort((a, b) => b.w - a.w).slice(0, 4).map(x => ({ p: x.p, share: x.w / tot, dist: x.p / price - 1 }));
    const above = all.filter(x => x.side === 'S' && x.p > price && x.p < price * 1.2).sort((a, b) => b.w - a.w).slice(0, 4).map(x => ({ p: x.p, share: x.w / tot, dist: x.p / price - 1 }));
    const sum = (side, lo, hi) => all.filter(x => x.side === side && x.p > price * lo && x.p < price * hi).reduce((a, b) => a + b.w, 0);
    out.clusters = { below, above, near5L: sum('L', 0.95, 1), near5S: sum('S', 1, 1.05), all: all.filter(x => x.p > price * 0.8 && x.p < price * 1.2).map(x => ({ p: x.p, w: x.w / tot, side: x.side })) };
  }
  const ls = (inp.ls || []).slice().sort((a, b) => a.t - b.t);
  if (ls.length) { out.ls = ls[ls.length - 1].r; out.lsPct = pctRank(ls.map(x => x.r), out.ls); }
  const top = (inp.top || []).slice().sort((a, b) => a.t - b.t);
  if (top.length) out.top = top[top.length - 1].r;
  // composite risks 0-100
  const fp = out.fundPct === out.fundPct ? out.fundPct : 0.5, oz = out.oi7 === out.oi7 ? clamp(out.oi7 / 0.15, -1, 1) : 0, lp = out.lsPct === out.lsPct ? out.lsPct : 0.5;
  const fAbs = out.fund7 === out.fund7 ? clamp(out.fund7 / 0.0003, -1, 1) : 0; // 0.03%/8h = clearly crowded
  out.longRisk = Math.round(100 * clamp(0.3 * Math.max(0, (fp - 0.5) * 2) + 0.2 * Math.max(0, fAbs) + 0.3 * Math.max(0, oz) + 0.2 * lp, 0, 1));
  out.shortRisk = Math.round(100 * clamp(0.3 * Math.max(0, (0.5 - fp) * 2) + 0.2 * Math.max(0, -fAbs) + 0.3 * Math.max(0, oz) + 0.2 * (1 - lp), 0, 1));
  out.flush = out.oi3 === out.oi3 && (out.oi1 <= -0.07 || out.oi3 <= -0.12);
  out.ok = out.oiNow > 0 || out.fund7 === out.fund7;
  const lvl = r => r >= 65 ? '警戒' : r >= 45 ? '注意' : '平常';
  out.longLevel = lvl(out.longRisk); out.shortLevel = lvl(out.shortRisk);
  return out;
}

/* ---------- events ---------- */
function lastFriday(y, m) { const dt = new Date(Date.UTC(y, m + 1, 0, 8)); while (dt.getUTCDay() !== 5) dt.setUTCDate(dt.getUTCDate() - 1); return dt.getTime(); }
function autoExpiries(now, months) {
  const o = [], d0 = new Date(now);
  for (let k = 0; k < months; k++) {
    const y = d0.getUTCFullYear() + Math.floor((d0.getUTCMonth() + k) / 12), m = (d0.getUTCMonth() + k) % 12, t = lastFriday(y, m);
    if (t > now - 864e5) { const q = m % 3 === 2; o.push({ t, title: q ? 'BTCオプション四半期満期（Deribit）' : 'BTCオプション月次満期（Deribit）', kind: 'expiry', impact: q ? 3 : 2, auto: true }); }
  }
  return o;
}

/* ---------- 長期サイクル ---------- */
const HALVINGS = [Date.UTC(2012, 10, 28), Date.UTC(2016, 6, 9), Date.UTC(2020, 4, 11), Date.UTC(2024, 3, 20)];
const GENESIS = Date.UTC(2009, 0, 3);
function longSeries(L) { // L: { t:[], c:[] } 日足
  const n = L.c.length, resid = nan(n); let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let i = 0; i < n; i++) {
    const X = Math.log((L.t[i] - GENESIS) / 864e5), Y = Math.log(L.c[i]);
    if (m > 730) { const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m; resid[i] = Y - (a + b * X); }
    sx += X; sy += Y; sxx += X * X; sxy += X * Y; m++;
  }
  const w = sma(Float64Array.from(L.c), 1400), w200 = nan(n);
  for (let i = 0; i < n; i++) if (w[i] > 0) w200[i] = Math.log(L.c[i] / w[i]);
  return { resid, w200 };
}
const PHASE = { up: '上昇期', top: '天井圏', down: '下落期', bottom: '底値圏', recover: '回復期' };
function cycleInfo(L, ls, now, price) {
  const n = L.c.length, DAYms = 864e5, cyc = [];
  HALVINGS.forEach((h, k) => {
    const nx = HALVINGS[k + 1] || Infinity; let pk = -1, lo = -1;
    for (let i = 0; i < n; i++) { if (L.t[i] < h || L.t[i] >= nx) continue; if (L.t[i] <= h + 900 * DAYms && (pk < 0 || L.c[i] > L.c[pk])) pk = i; }
    if (pk < 0) return;
    for (let i = pk; i < n && L.t[i] < nx; i++) if (lo < 0 || L.c[i] < L.c[lo]) lo = i;
    cyc.push({ h, peakT: L.t[pk], peak: L.c[pk], peakDay: Math.round((L.t[pk] - h) / DAYms), lowT: L.t[lo], low: L.c[lo], lowDay: Math.round((L.t[lo] - h) / DAYms), dd: L.c[lo] / L.c[pk] - 1, done: nx !== Infinity });
  });
  const cur = cyc[cyc.length - 1], past = cyc.filter(c => c.done), day = Math.floor((now - cur.h) / DAYms);
  const phase = day < 400 ? 'up' : day < 600 ? 'top' : day < 750 ? 'down' : day < 1000 ? 'bottom' : 'recover';
  const rs = Array.from(ls.resid).filter(x => x === x), rNow = ls.resid[n - 1];
  const valPct = rs.length ? rs.filter(x => x < rNow).length / rs.length : NaN;
  const ddNow = price / Math.max(cur.peak, price) - 1;
  const checks = [];
  if (phase === 'bottom' || phase === 'recover' || phase === 'down') {
    checks.push({ ok: day >= 750 && day <= 1000, text: '時期：半減期から ' + day + ' 日目（過去の底は ' + past.map(c => c.lowDay).join('・') + ' 日目）' });
    checks.push({ ok: ddNow <= -0.5, text: '下げ幅：天井から ' + (ddNow * 100).toFixed(0) + '%（過去の底は ' + past.map(c => (c.dd * 100).toFixed(0) + '%').join('・') + '）' });
    checks.push({ ok: valPct <= 0.25, text: '割安さ：長期成長線に対して過去の下位 ' + (valPct * 100).toFixed(0) + '%' });
  } else {
    checks.push({ ok: day >= 400 && day <= 600, text: '時期：半減期から ' + day + ' 日目（過去の天井は ' + past.map(c => c.peakDay).join('・') + ' 日目）' });
    checks.push({ ok: ddNow >= -0.15, text: '高値との距離：サイクル高値から ' + (ddNow * 100).toFixed(0) + '%' });
    checks.push({ ok: valPct >= 0.75, text: '割高さ：長期成長線に対して過去の上位 ' + ((1 - valPct) * 100).toFixed(0) + '%' });
  }
  return { cyc, cur, past, day, phase, name: PHASE[phase], valPct, w200: ls.w200[n - 1], ddNow, checks, score: checks.filter(c => c.ok).length, nextHalving: Date.UTC(2028, 3, 15) };
}

/* ---------- top level ---------- */
function run(d, ex) {
  const { F, ind } = buildFactors(d, ex);
  const res = { ind, hz: {} };
  HORIZONS.forEach(h => {
    const sc = scoreHorizon(d, F, h.d);
    res.hz[h.k] = { sc, ev: evaluate(d, sc), sim: simulate(d, sc), fc: forecast(d, sc), pct: sc.pct[d.c.length - 1], verdict: verdictOf(sc.pct[d.c.length - 1]) };
  });
  return res;
}

g.Engine = { HALVINGS, PHASE, longSeries, cycleInfo, HORIZONS, TH, CATS, VERDICT, verdictOf, run, entryZones, analyzeOptions, analyzeLiq, autoExpiries, volumeProfile, sma, ema, rsi, rollStd, rollExt, quantile, clamp, parseInstr, summarize };
})(typeof window !== 'undefined' ? window : globalThis);
