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
  let tot = 0, ws = 0; S.forEach(([a, w]) => { const b = lows.map(i => a[i]).filter(x => x === x), nw = a[last], tp = a[pk]; if (!b.length || !(nw === nw) || !(tp === tp)) return; const tg = Math.max(...b); if (!(tp > tg)) return; tot += Math.min(1, Math.max(0, (tp - nw) / (tp - tg))) * w; ws += w; });
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
async function send() {
  if (!TOPIC || !msgs.length || process.env.DRY) { console.log('通知', msgs.length, '件', TOPIC ? '' : '（トピック未設定）'); msgs.forEach(m => console.log(' ', m[0], '|', m[1])); return; }
  for (const [title, message, tag] of msgs) {
    const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: TOPIC, title, message, tags: [tag], click: APP, priority: 4 }) });
    console.log('ntfy', r.status, title);
  }
}
send();
