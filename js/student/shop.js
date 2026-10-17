// 상점: 내 씨앗 나무 + 쿠폰 사기/쓰기 + 쿠폰 제안. (공동 목표는 goal.js)
import {
  collection, doc, getDoc, getDocs, query, where, setDoc,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, weekId, monthId } from '../common/dates.js';

const STATUS_LABEL = { pending: '구매 승인 대기', useRequested: '사용 승인 대기' };

export async function renderShop(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const periodKey = (item) => (item.buyPeriod === 'week' ? weekId() : (item.buyPeriod === 'month' ? monthId() : 'all'));
  let data;

  async function load() {
    const [itemSnap, couponSnap, sumSnap, ideaSnap] = await Promise.all([
      getDocs(query(collection(db, 'shopItems'), where('onSale', '==', true))),
      getDocs(query(collection(db, 'coupons'), where('sid', '==', sid))),
      getDoc(doc(db, 'summaries', sid)).catch(() => null),
      getDocs(query(collection(db, 'couponIdeas'), where('sid', '==', sid))),
    ]);
    const items = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const coupons = couponSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const summary = sumSnap?.exists() ? sumSnap.data() : { wallet: 0, total: 0 };
    const ideasThisWeek = ideaSnap.docs.map((d) => d.data()).filter((i) => i.week === weekId());
    data = { items, coupons, summary, ideasThisWeek };
  }

  async function reload() { await load(); draw(); }

  // ---- 쿠폰 사기 ----
  async function buy(item) {
    const period = periodKey(item);
    const owned = data.coupons.filter((c) => c.coupon === item.id && c.period === period);
    const limit = item.buyLimit === 0 ? 999 : item.buyLimit;
    if (owned.length >= limit) { toast('이번 기간 구매 한도를 다 썼어요.', 'error'); return; }
    if ((data.summary.wallet ?? 0) < item.price) { toast('포인트가 모자라요.', 'error'); return; }
    if (!confirm(`'${item.name}'을(를) ${item.price}${currency}에 살까요?`)) return;
    const n = owned.length + 1;
    const id = `${sid}_${item.id}_${period}_${n}`;
    const b = writeBatch(db);
    b.set(doc(db, 'coupons', id), {
      sid, coupon: item.id, period, n, status: item.instant ? 'owned' : 'pending', price: item.price, use: null, at: serverTimestamp(),
    });
    b.set(doc(db, 'points', `buy_${id}`), {
      sid, type: 'buy', wallet: -item.price, total: 0, reason: `상점 ${item.name}`, ref: id, by: sid, at: serverTimestamp(),
    });
    b.update(doc(db, 'summaries', sid), { wallet: increment(-item.price), lastTx: `buy_${id}` });
    try { await b.commit(); toast(item.instant ? '샀어요!' : '신청했어요. 선생님 승인을 기다려요.'); await reload(); }
    catch (e) { console.error(e); toast('사지 못했어요. 다시 해 주세요.', 'error'); }
  }

  // ---- 쿠폰 쓰기 ----
  async function useOne(coupon, item, useId, n) {
    const b = writeBatch(db);
    b.set(doc(db, 'couponUses', useId), {
      sid, coupon: coupon.id, type: item.id, date: todayId(), n, task: null, status: 'requested', at: serverTimestamp(),
    });
    b.update(doc(db, 'coupons', coupon.id), { status: 'useRequested', use: useId });
    await b.commit();
  }

  async function use(coupon) {
    const item = data.items.find((i) => i.id === coupon.coupon) ?? { dailyUse: 0, name: coupon.coupon };
    try {
      if (item.dailyUse === 0) {
        await useOne(coupon, item, `u_${coupon.id}`, 0);
      } else {
        let done = false;
        for (let n = 1; n <= item.dailyUse; n++) {
          try { await useOne(coupon, item, `${item.id}_${todayId()}_${n}`, n); done = true; break; }
          catch (e) { if (e.code !== 'permission-denied') throw e; }
        }
        if (!done) { toast('오늘 사용 한도가 찼어요. 내일 써주세요.', 'error'); return; }
      }
      toast('사용 신청했어요. 선생님이 확인해요.'); await reload();
    } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
  }

  // ---- 쿠폰 제안 ----
  async function suggest(f) {
    const n = data.ideasThisWeek.length + 1;
    await setDoc(doc(db, 'couponIdeas', `${sid}_${weekId()}_${n}`), {
      sid, week: weekId(), n, what: f.what, price: Number(f.price) || 0, why: f.why, at: serverTimestamp(),
    });
  }

  // ---- 화면 ----
  function treeCard() {
    const total = data.summary.total ?? 0;
    const stages = settings.tree ?? [];
    let cur = stages[0] ?? { name: '새싹', min: 0 };
    let next = null;
    for (let i = 0; i < stages.length; i++) {
      if (total >= stages[i].min) { cur = stages[i]; next = stages[i + 1] ?? null; }
    }
    const pct = next ? Math.min(100, ((total - cur.min) / (next.min - cur.min)) * 100) : 100;
    return h('section', { class: 'card tree' },
      h('div', { class: 'tree-emoji' }, '🌱'),
      h('div', { class: 'tree-info' },
        h('div', { class: 'tree-name' }, `내 씨앗 나무 · ${cur.name}`),
        h('div', { class: 'muted' }, `누적 ${total} ${currency}`),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
        next ? h('div', { class: 'muted small' }, `다음 '${next.name}'까지 ${next.min - total} ${currency}`) : h('div', { class: 'muted small' }, '가장 큰 나무예요! 🌳'),
      ),
    );
  }

  function buyCard(item) {
    const period = periodKey(item);
    const ownedCount = data.coupons.filter((c) => c.coupon === item.id && c.period === period).length;
    const limit = item.buyLimit === 0 ? null : item.buyLimit;
    const full = limit != null && ownedCount >= limit;
    const periodName = item.buyPeriod === 'week' ? '주' : (item.buyPeriod === 'month' ? '월' : '');
    return h('div', { class: 'shop-item' },
      h('div', null, h('div', { class: 'si-name' }, item.name),
        h('div', { class: 'muted small' }, `${item.desc || ''}${limit ? ` · ${periodName} ${limit}장${full ? ' (다 씀)' : ''}` : ''}`)),
      h('button', { class: 'btn small', disabled: full, onclick: () => buy(item) }, `${item.price} ${currency}`),
    );
  }

  function myCoupons() {
    const owned = data.coupons.filter((c) => c.status === 'owned');
    const waiting = data.coupons.filter((c) => c.status === 'pending' || c.status === 'useRequested');
    const nameOf = (c) => data.items.find((i) => i.id === c.coupon)?.name ?? c.coupon;
    if (owned.length === 0 && waiting.length === 0) return h('p', { class: 'muted' }, '아직 가진 쿠폰이 없어요.');
    return h('div', null,
      ...owned.map((c) => h('div', { class: 'shop-item' },
        h('span', { class: 'si-name' }, nameOf(c)),
        h('button', { class: 'btn secondary small', onclick: () => use(c) }, '쓸래요'))),
      ...waiting.map((c) => h('div', { class: 'shop-item' },
        h('span', null, nameOf(c)), h('span', { class: 'badge-wait' }, STATUS_LABEL[c.status]))),
    );
  }

  function ideaForm() {
    if (data.ideasThisWeek.length >= 2) return h('p', { class: 'muted' }, '이번 주 제안을 다 했어요(주 2개).');
    const what = h('input', { type: 'text', maxlength: '100', placeholder: '어떤 쿠폰이 있으면 좋을까요?' });
    const price = h('input', { type: 'number', min: '0', max: '1000', placeholder: '몇 포인트?', style: 'width:110px' });
    const why = h('input', { type: 'text', maxlength: '300', placeholder: '왜요?' });
    const btn = h('button', { class: 'btn', onclick: async () => {
      if (!what.value.trim()) { toast('쿠폰 이름을 써 주세요.', 'error'); return; }
      try { await suggest({ what: what.value.trim(), price: price.value, why: why.value.trim() }); toast('제안을 보냈어요'); await reload(); }
      catch (e) { console.error(e); toast('보내지 못했어요', 'error'); }
    } }, '보내기');
    return h('div', { class: 'idea-form' }, what, h('div', { class: 'row' }, price, why), btn);
  }

  function draw() {
    content.replaceChildren(h('div', { class: 'shop' },
      treeCard(),
      h('section', { class: 'card' }, h('h2', null, '쿠폰 사기'),
        h('div', { class: 'muted small', style: 'margin-bottom:8px' }, `내 지갑: ${data.summary.wallet ?? 0} ${currency}`),
        data.items.length ? h('div', null, ...data.items.map(buyCard)) : h('p', { class: 'muted' }, '상점에 쿠폰이 없어요.')),
      h('section', { class: 'card' }, h('h2', null, '내 쿠폰'), myCoupons()),
      h('section', { class: 'card' }, h('h2', null, '이런 쿠폰이 있으면 좋겠어요'), ideaForm()),
    ));
  }

  await load();
  draw();
}
