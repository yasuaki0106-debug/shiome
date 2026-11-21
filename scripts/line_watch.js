/* 1時間ごと（live.yml）：BTCの1時間足の終値が、見張っている節目（data/lines.json）を上下に抜けたら通知する。
   ヒゲではなく1時間足の終値で判定。抜けた方向と、その節目が何かで、判断の材料になる一言を添える */
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..'), TOPIC = process.env.NTFY_TOPIC || '';
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const live = rd('research/live.json'), L = rd('data/lines.json'), ST = path.join(ROOT, 'data', 'line_state.json'), st = rd('data/line_state.json') || {};
if (!live || !L) { console.log('データなし'); process.exit(0); }
const now = Date.now() / 1000, bars = live.h1.filter(b => b[0] + 3600 <= now);   // 確定した1時間足だけ
if (!bars.length) process.exit(0);
const last = bars[bars.length - 1], close = last[4], tkey = String(last[0]);
if (st.t === tkey) { console.log('同じ足'); process.exit(0); }
const usd = x => '$' + Math.round(x).toLocaleString('en-US'), msgs = [], side = {};
L.lines.forEach(l => {
  // 線の上下を行ったり来たりしても何度も鳴らないように、線から0.3%以上離れて抜けたときだけ「抜けた」とする
  const id = l.kind + ':' + l.p, was = st.side && st.side[id], now = close >= l.p * 1.003 ? 'up' : close <= l.p * 0.997 ? 'dn' : (was || (close >= l.p ? 'up' : 'dn')); side[id] = now;
  if (!was || was === now) return;
  const up = now === 'up', head = 'BTCが ' + usd(l.p) + '（' + l.name + '）を' + (up ? '上に抜けました' : '割りました');
  const why = { split: up ? '前の安値の試し直しから戻した形です。朝9時の日足で上なら、二番底の見方が残ります' : '朝9時の日足の終値でも下なら、過去は一段下げの形です。買い下がりの指値が届きやすくなります',
    prevlow: up ? '前の安値の上に戻しました。下げ止まりの初めのサイン' : '前の安値を割りました。分かれ目まで下げやすい位置です',
    wall: up ? '止められやすい節目を抜けて、戻りが強まっています。2倍に戻すか・確認買いかは、朝9時の判定で確認してください' : '壁の下に押し戻されました。戻りはいったん止められた形です',
    support: up ? '支えの上に戻しました' : '支えを割りました。下げが続きやすい形です。買い下がりの指値が近づいています',
    ma: up ? '流れの線の上に戻しました。戻りが本物になりやすいサイン' : '流れの線の下に落ちました',
    day: up ? '前日の高値を超えました。過去は、その後7日で上がった割合56%と、続きやすさはわずかです' : '前日の安値を割りました。過去は、割った後3〜7日でむしろ戻した方が多い（55〜57%）。慌てて売る場面ではありません',
    week: up ? '1週間の高値を超えました。過去は、その後7日で上がった割合60%と、上げが続きやすい形です' : '1週間の安値を割りました。過去は、割った後3〜7日で戻した方が多い（56〜59%）。買い下がりの指値が近づいています',
    recentlow: up ? '直近の安値の上に戻しました' : '直近の安値を割りました。新しい安値を更新中です。買い下がりの指値が近づいています',
    round: up ? 'キリのいい値段を上に抜けました' : 'キリのいい値段を割りました' }[l.kind] || '';
  msgs.push([head, '1時間足の終値 ' + usd(close) + '。' + why + (l.why ? '（' + l.why + '）' : ''), up ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend']);
});
fs.writeFileSync(ST, JSON.stringify({ t: tkey, close, side }));
// moomooの24時間取引で動ける時間か（米国東部時間 日曜20時〜金曜20時）と、MSTR・COINの今の値段（24時間取引のトークン化株式）
function sessionNote() { const n = new Date(), et = new Date(n.getTime() - 5 * 36e5), w = et.getUTCDay(), h = et.getUTCHours();
  const open = (w >= 1 && w <= 4) || (w === 0 && h >= 20) || (w === 5 && h < 20); return open ? '今はmoomooの24時間取引で注文が通る時間です。' : '今は週末で、米国株は動かせません（月曜の朝10時から）。'; }
async function stockNote() { const out = []; for (const [s, pair] of [['MSTR', 'MSTRX_USDT'], ['COIN', 'COINX_USDT']]) { try { const j = await (await fetch('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=' + pair)).json(); if (j && j[0] && +j[0].last > 0) out.push(s + ' $' + (+j[0].last).toFixed(2)); } catch (e) { /* なし */ } } return out.length ? '今の値段の目安：' + out.join('・') + '。' : ''; }
(async () => {
  if (!st.side) { console.log('初回なので記録だけ'); return; }
  if (msgs.length) { const extra = sessionNote() + await stockNote(); msgs.forEach(m => { m[1] += ' ' + extra; }); }
  if (!TOPIC || process.env.DRY) { msgs.forEach(m => console.log(m[0], '|', m[1])); return; }
  for (const [title, message, tag] of msgs) { const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: TOPIC, title, message, tags: [tag], click: 'https://yasuaki0106-debug.github.io/shiome/', priority: 4 }) }); console.log('ntfy', r.status, title); }
})();
