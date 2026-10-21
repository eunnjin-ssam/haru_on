// 상점: 내 씨앗 나무 + 쿠폰 사기/쓰기 + 쿠폰 제안. (공동 목표는 goal.js)
import {
  collection, doc, getDoc, getDocs, query, where, setDoc,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { treeCard } from './tree.js';
import { todayId, weekId, monthId } from '../common/dates.js';
import { celebrateGoal } from './celebrate.js';
import { isExemptCoupon } from '../common/coupons.js';
import { isShown } from '../common/task-visible.js';

const STATUS_LABEL = { pending: '구매 승인 대기', useRequested: '사용 승인 대기' };

export async function renderShop(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  // 보안 규칙의 periodKey와 같아야 한다
  const periodKey = (item) => (item.buyPeriod === 'day' ? `d${todayId()}`
    : (item.buyPeriod === 'week' ? weekId() : (item.buyPeriod === 'month' ? monthId() : 'all')));
  let data;

  async function load() {
    const [itemSnap, couponSnap, sumSnap, ideaSnap, goalSnap] = await Promise.all([
      getDocs(query(collection(db, 'shopItems'), where('onSale', '==', true))),
      getDocs(query(collection(db, 'coupons'), where('sid', '==', sid))),
      getDoc(doc(db, 'summaries', sid)).catch(() => null),
      getDocs(query(collection(db, 'couponIdeas'), where('sid', '==', sid))),
      getDocs(query(collection(db, 'goals'), where('status', '==', 'open'))),
    ]);
    const items = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const coupons = couponSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const summary = sumSnap?.exists() ? sumSnap.data() : { wallet: 0, total: 0 };
    const ideasThisWeek = ideaSnap.docs.map((d) => d.data()).filter((i) => i.week === weekId());
    const goals = goalSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    data = { items, coupons, summary, ideasThisWeek, goals };
  }

  // 공동 목표 보태기: 거래 + 목표 + 내 기부액 + 요약을 한 묶음으로
  async function donate(goal, amount) {
    const donateId = `donate_${goal.id}_${sid}_${Date.now()}`;
    const donorRef = doc(db, 'goals', goal.id, 'donors', sid);
    const donorSnap = await getDoc(donorRef).catch(() => null);
    const firstTime = !donorSnap?.exists();
    const newRaised = goal.raised + amount;
    const b = writeBatch(db);
    b.set(doc(db, 'points', donateId), { sid, type: 'donate', wallet: -amount, total: 0, reason: `공동 목표 ${goal.title}`, ref: goal.id, by: sid, at: serverTimestamp() });
    b.update(doc(db, 'goals', goal.id), { raised: increment(amount), donors: increment(firstTime ? 1 : 0), lastTx: donateId, status: newRaised >= goal.target ? 'done' : 'open' });
    b.set(donorRef, { total: increment(amount) });
    b.update(doc(db, 'summaries', sid), { wallet: increment(-amount), lastTx: donateId });
    await b.commit();
    return newRaised >= goal.target; // 이번에 달성했는지
  }

  async function reload() { await load(); draw(); }

  // ---- 쿠폰 사기 ----
  async function buy(item) {
    const period = periodKey(item);
    const owned = data.coupons.filter((c) => c.coupon === item.id && c.period === period);
    const limit = item.buyLimit === 0 ? 999 : item.buyLimit;
    if (owned.length >= limit) { toast('이 쿠폰은 지금은 더 살 수 없어요.', 'error'); return; }
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
  async function useOne(coupon, item, useId, n, task = null) {
    const b = writeBatch(db);
    b.set(doc(db, 'couponUses', useId), {
      sid, coupon: coupon.id, type: item.id, date: todayId(), n, task, status: 'requested', at: serverTimestamp(),
    });
    b.update(doc(db, 'coupons', coupon.id), { status: 'useRequested', use: useId });
    await b.commit();
  }

  // 과제 면제권: 면제받을 과제(아직 안 낸 것)를 고른다. 취소하면 null
  async function pickTask() {
    const [tSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', sid))),
      getDocs(query(collection(db, 'submissions'), where('sid', '==', sid))),
    ]);
    const subs = new Map(sSnap.docs.map((d) => [d.id, d.data().status]));
    const list = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.kind === 'homework' && isShown(t))
      .filter((t) => { const st = subs.get(`${t.id}_${sid}`); return !st || st === 'redo'; })
      .sort((a, b) => (a.dueAt?.toMillis?.() ?? Infinity) - (b.dueAt?.toMillis?.() ?? Infinity));
    if (!list.length) { toast('면제받을 과제가 없어요.', 'error'); return null; }
    return new Promise((resolve) => {
      const close = (v) => { dlg.remove(); resolve(v); };
      const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
        h('h3', null, '어떤 과제를 면제받을까요?'),
        h('p', { class: 'muted small', style: 'margin:0' }, '선생님이 확인하면 그 과제가 면제돼요. (포인트는 없어요)'),
        ...list.map((t) => h('button', { class: 'fb-choice', onclick: () => close(t.id) },
          h('span', { class: 'fb-emoji' }, '📋'),
          h('div', null, h('div', { class: 'fb-t' }, t.title), h('div', { class: 'muted small' }, t.subject || '')))),
        h('button', { class: 'link', onclick: () => close(null) }, '닫기')));
      document.body.append(dlg);
    });
  }

  async function use(coupon) {
    const item = data.items.find((i) => i.id === coupon.coupon) ?? { dailyUse: 0, name: coupon.coupon };
    let task = null;
    if (isExemptCoupon(item)) { task = await pickTask(); if (!task) return; }
    try {
      if (item.dailyUse === 0) {
        await useOne(coupon, item, `u_${coupon.id}`, 0, task);
      } else {
        let done = false;
        for (let n = 1; n <= item.dailyUse; n++) {
          try { await useOne(coupon, item, `${item.id}_${todayId()}_${n}`, n, task); done = true; break; }
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
  function buyCard(item) {
    const period = periodKey(item);
    const ownedCount = data.coupons.filter((c) => c.coupon === item.id && c.period === period).length;
    const limit = item.buyLimit === 0 ? null : item.buyLimit;
    const full = limit != null && ownedCount >= limit;
    const periodName = { day: '하루에', week: '일주일에', month: '한 달에' }[item.buyPeriod] ?? '모두';
    return h('div', { class: 'shop-item' },
      h('div', null, h('div', { class: 'si-name' }, item.name),
        h('div', { class: 'muted small' }, [item.desc, limit ? `${periodName} ${limit}장까지${full ? ' (다 샀어요)' : ''}` : ''].filter(Boolean).join(' · '))),
      h('button', { class: 'btn small price-btn', disabled: full, onclick: () => buy(item) }, `${item.price} ${currency}`),
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
    const price = h('input', { type: 'number', min: '0', max: '1000', placeholder: '가격은 몇 포인트로 할까요?' });
    const why = h('input', { type: 'text', maxlength: '300', placeholder: '이 쿠폰이 왜 필요한가요?' });
    const btn = h('button', { class: 'btn', onclick: async () => {
      if (!what.value.trim()) { toast('쿠폰 이름을 써 주세요.', 'error'); return; }
      try { await suggest({ what: what.value.trim(), price: price.value, why: why.value.trim() }); toast('제안을 보냈어요'); await reload(); }
      catch (e) { console.error(e); toast('보내지 못했어요', 'error'); }
    } }, '보내기');
    return h('div', { class: 'idea-form' }, what, price, why, btn);
  }

  function goalCard(goal) {
    const remaining = goal.target - goal.raised;
    const pct = Math.min(100, (goal.raised / goal.target) * 100);
    const wallet = data.summary.wallet ?? 0;
    const amounts = [1, 5, 10].filter((a) => a <= remaining);
    const give = async (amount) => {
      if (amount <= 0) return;
      if (amount > wallet) { toast('지갑 포인트가 모자라요.', 'error'); return; }
      if (amount > remaining) { toast('남은 포인트보다 많이 보탤 수 없어요.', 'error'); return; }
      if (!confirm(`'${goal.title}'에 ${amount} ${currency}을 보탤까요?`)) return;
      try {
        const reached = await donate(goal, amount);
        if (reached) celebrateGoal(goal); else toast(`${amount} ${currency}을 보탰어요! 고마워요 💚`);
        await reload();
      }
      catch (e) { console.error(e); toast('보태지 못했어요. 다시 해 주세요.', 'error'); }
    };
    const custom = h('input', { type: 'number', min: '1', placeholder: '직접', style: 'width:90px' });
    return h('section', { class: 'card goal' },
      h('h2', null, '우리반 공동 목표'),
      h('div', { class: 'goal-title' }, goal.title),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
      h('div', { class: 'muted small' }, `${goal.raised} / ${goal.target} ${currency} · 남은 ${remaining} · ${goal.donors ?? 0}명이 보탰어요`),
      h('div', { class: 'row', style: 'margin-top:10px' },
        ...amounts.map((a) => h('button', { class: 'btn secondary small', onclick: () => give(a) }, `+${a}`)),
        custom,
        h('button', { class: 'btn small', onclick: () => give(Number(custom.value) || 0) }, '보태기')),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, `내 지갑: ${wallet} ${currency}`),
    );
  }

  function draw() {
    const wallet = data.summary.wallet ?? 0;
    const head = h('div', { class: 'board-head' },
      h('div', null,
        h('div', { class: 'bh-title' }, '상점'),
        h('div', { class: 'bh-sub' }, '모은 포인트로 쿠폰을 사고 씨앗 나무를 키워요')),
      h('div', { class: 'wallet-chip' }, `🪙 ${wallet} ${currency}`));
    content.replaceChildren(h('div', { class: 'shop' },
      head,
      treeCard(data.summary.total ?? 0, settings),
      ...(data.goals ?? []).map(goalCard),
      h('div', { class: 'feed-grid' },
        h('section', { class: 'card' }, h('h2', null, '쿠폰 사기'),
          data.items.length ? h('div', null, ...data.items.map(buyCard)) : h('p', { class: 'muted' }, '상점에 쿠폰이 없어요.')),
        h('section', { class: 'card' }, h('h2', null, '내 쿠폰'), myCoupons()),
        h('section', { class: 'card' }, h('h2', null, '이런 쿠폰이 있으면 좋겠어요'), ideaForm())),
    ));
  }

  await load();
  draw();
}
