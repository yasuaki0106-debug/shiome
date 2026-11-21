/* 毎日の判定（GitHub Actions で実行）。アプリと同じエンジンで、確定した日足から「市場全体の判定」を出す。
   - data/signal_log.json に毎日の判定を記録（アプリの検証タブと、月次の見直しで使う）
   - 状態が変わったら ntfy にスマホ通知を送る（個人の記録は使わない・送らない）
   使うデータ：data/btc-usd-daily.csv（Bitstamp日足）、data/onchain.json（MVRV・マイナー収入）
   注意：アプリはBinanceの日足と資金調達率・オプションも使うので、スコアは少し違うことがある */
const fs = require('fs'), path = require('path');
global.window = global; require(path.join(__dirname, '..', 'src', 'engine.js')); const E = global.Engine;
const ROOT = path.join(__dirname, '..'), DAY = 864e5, TOPIC = process.env.NTFY_TOPIC || '', APP = 'https://yasuaki0106-debug.github.io/shiome/';
const rows = fs.readFileSync(process.env.SIGNAL_CSV || path.join(ROOT, 'data', 'btc-usd-daily.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).filter(p => p[0] >= '2012-01-01' && +p[4] > 0);
const n = rows.length, d = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
rows.forEach((x, i) => { d.t[i] = Date.parse(x[0] + 'T00:00:00Z'); d.o[i] = +x[1]; d.h[i] = +x[2]; d.l[i] = +x[3]; d.c[i] = +x[4]; d.v[i] = +x[5]; });
const L = { t: Array.from(d.t), c: Array.from(d.c) }, ls = E.longSeries(L), R = E.run(d, { pl: ls.resid, w200: ls.w200 });
const last = n - 1, key = rows[last][0], now = d.t[last] + DAY, price = d.c[last];
const cyc = E.cycleInfo(L, ls, now, price), MS = R.hz.s.pct, MM = R.hz.m.pct, ML = R.hz.l.pct;
// 底らしさ（アプリの bottomGauge と同じ5指標）
function gauge() {
  let oc = {}; try { oc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'onchain.json'), 'utf8')); } catch (e) { /* なし */ }
  const idx = new Map(rows.map((x, i) => [x[0], i])), mk = () => new Array(n).fill(NaN);
  const from = k => { const a = mk(); (oc[k] || []).forEach(([dd, v]) => { const i = idx.get(dd); if (i != null) a[i] = +v; }); let lv = NaN, g = 0; for (let i = 0; i < n; i++) { if (a[i] === a[i]) { lv = a[i]; g = 0; } else if (lv === lv && ++g <= 3) a[i] = lv; } return a; };
  const sm = (a, w) => { const o = mk(); let s = 0, q = 0; for (let i = 0; i < n; i++) { const x = a[i]; if (x === x) { s += x; q++; } if (i >= w) { const y = a[i - w]; if (y === y) { s -= y; q--; } } if (i >= w - 1 && q >= w * 0.9) o[i] = s / q; } return o; };
  const mvrv = from('mvrv'), mr = from('minerrev'), mr365 = sm(mr, 365), m200 = sm(Array.from(d.c), 200);
  const wk = []; for (let i = n - 1; i >= 0; i -= 7) wk.unshift(i); const wr = E.rsi(Float64Array.from(wk.map(i => d.c[i])), 14), wrsi = mk(); wk.forEach((i, k) => { for (let j = i; j < Math.min(n, i + 7); j++) wrsi[j] = wr[k]; });
  let mx = 0; const dd = Array.from(d.c).map(x => { mx = Math.max(mx, x); return x / mx - 1; });
  const at = T => { let k = -1; for (let i = 0; i < n; i++) if (d.t[i] <= T) k = i; return k; };
  const pk = at(cyc.cur.peakT), lows = cyc.past.map(p => at(p.lowT)).filter(i => i >= 0);
  const S = [[mvrv, .60], [mr.map((x, i) => x / mr365[i]), .63], [wrsi, .59], [dd, .56], [Array.from(d.c).map((x, i) => x / m200[i]), .45]];
  let tot = 0, ws = 0; S.forEach(([a, w]) => { const b = lows.map(i => a[i]).filter(x => x === x), nw = a[last], tp = a[pk]; if (!b.length || !(nw === nw) || !(tp === tp)) return; let tg = Math.max(...b); if (b.length >= 3) { const k = b.length, mx = (k - 1) / 2, my = b.reduce((x, y) => x + y, 0) / k; let sxy = 0, sxx = 0; b.forEach((v, j) => { sxy += (j - mx) * (v - my); sxx += (j - mx) ** 2; }); const pr = my + sxy / sxx * (k - mx); if (pr > tg && pr < tp) tg = pr; } if (!(tp > tg)) return; tot += Math.min(1, Math.max(0, (tp - nw) / (tp - tg))) * w; ws += w; });
  return ws ? tot / ws : NaN;
}
const g = gauge(), inPhase = cyc.phase === 'bottom' || cyc.phase === 'recover';
let m90 = Infinity; for (let j = last - 90; j <= last; j++) m90 = Math.min(m90, d.c[j]);
const ladder = inPhase && g >= 0.5 && price <= m90 * 1.001;
const confirm = inPhase && g >= 0.5 && MM >= 75;
const levOff = MM < 20, levOn = MM >= 75;
// 前の安値の試し直し（アプリの retestState と同じ）
let rt = null; { let pk = -1; for (let i = 0; i < n; i++) if (d.t[i] <= cyc.cur.peakT) pk = i; if (pk >= 0 && last - pk >= 120) { let lo = Infinity, li = -1; for (let j = pk; j < last - 59; j++) if (d.c[j] < lo) { lo = d.c[j]; li = j; } let hi = 0; for (let j = li; j < last; j++) hi = Math.max(hi, d.c[j]); const rally = hi / lo - 1; rt = { lo, lv: lo * 0.97, retest: rally >= .3 && price <= lo * 1.05, broke: rally >= .3 && price < lo * 0.97 }; } }
const rec = { d: key, px: Math.round(price), s: Math.round(MS), m: Math.round(MM), l: Math.round(ML), g: Math.round(g * 100), ph: cyc.phase, day: cyc.day, lad: ladder, conf: confirm, lev: levOff ? 'off' : levOn ? 'on' : 'keep', rt: rt ? (rt.broke ? 'broke' : rt.retest ? 'retest' : null) : null };
// 見張る節目（1時間ごとの line_watch.js が、抜けたら通知する）
try {
  const Z = E.entryZones(d, R.ind, price, null, null), L0 = [];
  const add = (p, name, kind, why) => { if (p > 0 && isFinite(p) && Math.abs(p / price - 1) < 0.3 && !L0.some(x => Math.abs(x.p / p - 1) < 0.01)) L0.push({ p: Math.round(p), name, kind, why }); };
  if (rt && (rt.retest || rt.broke)) { add(rt.lv, '分かれ目（前の安値の3%下）', 'split', '日足の終値で割ると、過去は一段下げの形'); add(rt.lo, '前の安値', 'prevlow', '二番底になるかの境目'); }
  { let l10 = Infinity; for (let j = last - 9; j <= last; j++) l10 = Math.min(l10, d.l[j]); if (rt && l10 < rt.lo) add(l10, '直近の安値（日中）', 'recentlow', 'ヒゲで付けた新しい安値。終値でここを割ると、本当の新安値'); }
  (Z.above || []).slice(0, 2).forEach(z => add(z.mid, '上値の壁', 'wall', [...new Set(z.items.map(x => x.label))].join('・')));
  (Z.below || []).slice(0, 2).forEach(z => add(z.mid, '下値の支え', 'support', [...new Set(z.items.map(x => x.label))].join('・')));
  // 短い時間の節目：前日の高値・安値、直近7日の高値・安値
  add(d.h[last], '前日の高値', 'day', '上抜けの後7日で上がった割合56%'); add(d.l[last], '前日の安値', 'day', '割った後はむしろ戻しやすい（55〜57%）');
  let h7 = 0, l7 = Infinity; for (let j = last - 6; j <= last; j++) { h7 = Math.max(h7, d.h[j]); l7 = Math.min(l7, d.l[j]); }
  add(h7, '直近7日の高値', 'week', '上抜けの後7日で上がった割合60%'); add(l7, '直近7日の安値', 'week', '割った後はむしろ戻しやすい（56〜59%）');
  // キリのいい値段は入れない（2020年以降の日足で、5千・1万ドル刻みの値段は半端な値段と比べて止まりやすくなかった）
  add(R.ind.s20[last], '20日線', 'ma', '短い流れの境目。上に戻ると戻りが本物になりやすい'); add(R.ind.s50[last], '50日線', 'ma', '中くらいの流れの境目'); add(R.ind.s200[last], '200日線', 'ma', '長い流れの境目');
  fs.writeFileSync(path.join(ROOT, 'data', 'lines.json'), JSON.stringify({ d: key, px: Math.round(price), lines: L0.sort((a, b) => b.p - a.p) }));
} catch (e) { console.log('lines', e.message); }
// 記録
const LOG = path.join(ROOT, 'data', 'signal_log.json'); let log = []; try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (e) { log = []; }
const prev = log.length ? log[log.length - 1] : null;
if ((!prev || prev.d !== key) && !process.env.SIGNAL_NOLOG) { log.push(rec); fs.writeFileSync(LOG, JSON.stringify(log)); }
console.log(JSON.stringify(rec));
// 通知（状態が変わったときだけ）
const msgs = [], usd = x => '$' + Math.round(x).toLocaleString('en-US');
if (prev && prev.d !== key) {
  if (rec.lad && !prev.lad) msgs.push(['買い下がり開始の合図', 'BTCの終値 ' + usd(price) + ' が90日ぶりの安値です（底値圏・底らしさ' + rec.g + '%）。アプリで金額と銘柄を確認してください。', 'chart_with_downwards_trend']);
  if (rec.conf && !prev.conf) msgs.push(['確認買いの条件がそろいました', '中期の判定が' + rec.m + '（買い好機）です。アプリで、確認買いの回数と金額を確認してください。', 'white_check_mark']);
  if (rec.lev === 'off' && prev.lev !== 'off') msgs.push(['2倍の玉は元の株へ', '中期の判定が' + rec.m + 'まで崩れました（20未満）。MSTU・CONLは元の株に乗り換える合図です。', 'warning']);
  if (rec.lev === 'on' && prev.lev !== 'on') msgs.push(['2倍に戻せます', '中期の判定が' + rec.m + 'まで戻りました（75以上）。元の株は2倍に戻す合図です。', 'arrow_up']);
  if (rec.rt === 'broke' && prev.rt !== 'broke') msgs.push(['前の安値を割りました', 'BTCの終値 ' + usd(price) + ' が、前の安値の3%下 ' + usd(rt.lv) + ' を割りました。過去はこの後さらに下げてから底を付けています。', 'rotating_light']);
  if (rec.ph !== prev.ph) msgs.push(['サイクルが「' + ({ up: '上昇期', top: '天井圏', down: '下落期', bottom: '底値圏', recover: '回復期' })[rec.ph] + '」に入りました', '半減期から' + rec.day + '日目です。アプリで、売り・買いの方針を確認してください。', 'calendar']);
}
// 大事な予定の2日前
const EV = [[Date.UTC(2026, 11, 4, 13, 30), '米雇用統計'], [Date.UTC(2026, 11, 9, 19), 'FOMC'], [Date.UTC(2026, 11, 10, 13, 30), '米CPI'], [Date.UTC(2027, 0, 8, 13, 30), '米雇用統計'], [Date.UTC(2027, 0, 13, 13, 30), '米CPI'], [Date.UTC(2027, 0, 27, 19), 'FOMC'], [Date.UTC(2027, 1, 5, 13, 30), '米雇用統計'], [Date.UTC(2027, 1, 11, 13, 30), '米CPI'], [Date.UTC(2027, 2, 5, 13, 30), '米雇用統計'], [Date.UTC(2027, 2, 10, 13, 30), '米CPI'], [Date.UTC(2027, 2, 17, 18), 'FOMC'], [Date.UTC(2027, 3, 28, 18), 'FOMC'], [Date.UTC(2027, 5, 9, 18), 'FOMC'], [Date.UTC(2027, 6, 28, 18), 'FOMC'], [Date.UTC(2027, 8, 15, 18), 'FOMC'], [Date.UTC(2027, 10, 17, 19), 'FOMC']];
if (prev && prev.d !== key) EV.forEach(([t, nm]) => { const h = (t - now) / 36e5; if (h > 24 && h <= 48) msgs.push([nm + 'まであと2日', '発表の前後は値が飛びやすく、確認買いは見送りになります。', 'hourglass']); });
if (process.env.NTFY_TEST) msgs.push(['潮目の通知テスト', 'この通知が届いていれば設定は完了です。大事な合図が出たときに、ここに届きます。今の判定：' + ({ up: '上昇期', top: '天井圏', down: '下落期', bottom: '底値圏', recover: '回復期' })[rec.ph] + '、中期 ' + rec.m + '、底らしさ ' + rec.g + '%' + (rec.lad ? '、買い下がりの合図あり' : ''), 'bell']);
// 買い下がり1本目の期限の朝に知らせる（アプリの ladderOrders と同じ決め方：開始から3営業日、近くに重要な発表や指数の実施日があればその翌営業日まで延ばす）
const US_CLOSED = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'];
const tdays = (from, k) => { let t = from, c = 0; while (c < k) { t += DAY; const dd = new Date(t), w = dd.getUTCDay(), kk = dd.toISOString().slice(0, 10); if (w && w !== 6 && !US_CLOSED.includes(kk)) c++; } return t; };
if (prev && prev.d !== key) {
  let st = -1; for (let i = log.length - 1; i >= 0; i--) { if (log[i].lad && (i === 0 || !log[i - 1].lad)) { st = i; break; } }
  if (st >= 0) {
    const d0 = Date.parse(log[st].d + 'T00:00:00Z') + DAY; let exp = tdays(d0, 3);
    const IDX = [[Date.UTC(2026, 10, 30), 'MSTRのMSCI除外']], cand = EV.map(([t, nm]) => [t - (t % DAY), nm]).concat(IDX).filter(([t, nm]) => t > d0 && t < exp + (/MSCI/.test(nm) ? 10 : 3) * DAY).sort((a, b) => b[0] - a[0]);
    if (cand.length && cand[0][0] + DAY > exp) exp = tdays(cand[0][0], 1);
    const today = now - (now % DAY); if (exp === today) msgs.push(['今日が買い下がり1本目の期限です', '1本目の指値が今日の引けまでに届かなければ、引けに成行で買ってください（' + log[st].d.slice(5) + 'に始まった買い下がり）。届いていたら、アプリで記録すると残りの指値を出し直します。', 'alarm_clock']);
  }
}
async function send() {
  if (!TOPIC || !msgs.length || process.env.DRY) { console.log('通知', msgs.length, '件', TOPIC ? '' : '（トピック未設定）'); msgs.forEach(m => console.log(' ', m[0], '|', m[1])); return; }
  for (const [title, message, tag] of msgs) {
    const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: TOPIC, title, message, tags: [tag], click: APP, priority: 4 }) });
    console.log('ntfy', r.status, title);
  }
}
send();
