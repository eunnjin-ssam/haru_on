// 포인트 관리: 쿠폰 요청(구매 승인/거절·사용 완료/다음에), 학생 제안, 상점 쿠폰 관리.
// (공동 목표는 goals-admin.js) 포인트 거래는 교사가 쓰며 규칙은 금액을 검사하지 않는다.
import {
  collection, doc, getDocs, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const PERIODS = [['none', '없음'], ['week', '주'], ['month', '월']];

export async function renderPointsAdmin(root) {
  let items = []; let coupons = []; let uses = []; let ideas = []; let names = new Map();
  let editing = null; let showForm = false; let prefill = null;

  async function load() {
    const [itemSnap, cSnap, uSnap, iSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'shopItems')),
      getDocs(collection(db, 'coupons')),
      getDocs(collection(db, 'couponUses')),
      getDocs(collection(db, 'couponIdeas')),
      getDocs(collection(db, 'students')),
    ]);
    items = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    coupons = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    uses = uSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ideas = iSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    names = new Map(sSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  const itemName = (id) => items.find((i) => i.id === id)?.name ?? id;

  // 구매 승인 / 거절(환불)
  function approveBuy(c) { return updateDoc(doc(db, 'coupons', c.id), { status: 'owned' }); }
  async function rejectBuy(c) {
    const b = writeBatch(db);
    b.update(doc(db, 'coupons', c.id), { status: 'rejected' });
    const txId = `refund_${c.id}`;
    b.set(doc(db, 'points', txId), { sid: c.sid, type: 'refund', wallet: c.price, total: 0, reason: `환불 ${itemName(c.coupon)}`, ref: c.id, by: 'teacher', at: serverTimestamp() });
    b.update(doc(db, 'summaries', c.sid), { wallet: increment(c.price), lastTx: txId });
    await b.commit();
  }

  // 사용 완료 / 다음에
  async function completeUse(u) {
    const b = writeBatch(db);
    b.update(doc(db, 'couponUses', u.id), { status: 'used' });
    b.update(doc(db, 'coupons', u.coupon), { status: 'used' });
    await b.commit();
  }
  async function declineUse(u) {
    const b = writeBatch(db);
    b.update(doc(db, 'couponUses', u.id), { status: 'declined' });
    b.update(doc(db, 'coupons', u.coupon), { status: 'owned', use: null });
    await b.commit();
  }

  // 학생 제안 → 상점에 올리기(폼 미리 채움) / 삭제(자동 쪽지)
  function publishIdea(idea) {
    prefill = { name: idea.what, desc: idea.why, price: idea.price, _ideaId: idea.id, _ideaSid: idea.sid };
    editing = null; showForm = true; draw();
  }
  async function dismissIdea(idea) {
    const b = writeBatch(db);
    b.delete(doc(db, 'couponIdeas', idea.id));
    b.set(doc(collection(db, 'messages')), { to: idea.sid, body: `제안해 준 '${idea.what}' 쿠폰을 살펴봤어요. 고마워요!`, from: 'teacher', at: serverTimestamp(), readAt: null });
    await b.commit();
  }

  async function saveItem(f, ideaInfo) {
    const data = {
      name: f.name, desc: f.desc, price: Number(f.price) || 0, instant: f.instant,
      buyLimit: Number(f.buyLimit) || 0, buyPeriod: f.buyPeriod, dailyUse: Number(f.dailyUse) || 0,
      onSale: f.onSale, order: f.order ?? items.length,
    };
    const b = writeBatch(db);
    if (editing) b.update(doc(db, 'shopItems', editing), data);
    else b.set(doc(collection(db, 'shopItems')), data);
    if (ideaInfo?._ideaId) {
      b.delete(doc(db, 'couponIdeas', ideaInfo._ideaId));
      b.set(doc(collection(db, 'messages')), { to: ideaInfo._ideaSid, body: `제안한 '${f.name}' 쿠폰을 상점에 올렸어요! 🎉`, from: 'teacher', at: serverTimestamp(), readAt: null });
    }
    await b.commit();
  }

  // ---- 화면 조각 ----
  function requests() {
    const buys = coupons.filter((c) => c.status === 'pending');
    const useReqs = uses.filter((u) => u.status === 'requested');
    return h('section', { class: 'card' }, h('h2', null, `쿠폰 요청 (${buys.length + useReqs.length})`),
      h('p', { class: 'muted small', style: 'margin:-2px 0 6px' }, '학생이 쿠폰을 사거나 쓰겠다고 신청하면 여기서 승인해요.'),
      buys.length === 0 && useReqs.length === 0 ? h('p', { class: 'empty-ok' }, '✅ 지금 처리할 요청이 없어요.') : null,
      ...buys.map((c) => h('div', { class: 'req-row' },
        h('span', null, `${names.get(c.sid) ?? c.sid} · ${itemName(c.coupon)} 구매 신청 (${c.price})`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => run(() => approveBuy(c), '승인했어요') }, '승인'),
          h('button', { class: 'btn danger small', onclick: () => run(() => rejectBuy(c), '거절하고 환불했어요') }, '거절·환불')))),
      ...useReqs.map((u) => h('div', { class: 'req-row' },
        h('span', null, `${names.get(u.sid) ?? u.sid} · ${itemName(u.type)} 사용 요청`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => run(() => completeUse(u), '사용 완료했어요') }, '사용 완료'),
          h('button', { class: 'btn secondary small', onclick: () => run(() => declineUse(u), '다음에로 돌렸어요') }, '다음에')))),
    );
  }

  function studentCoupons() {
    const owned = coupons.filter((c) => c.status === 'owned');
    return h('section', { class: 'card' }, h('h2', null, '학생별 보유 쿠폰'),
      owned.length === 0 ? h('p', { class: 'muted' }, '보유 중인 쿠폰이 없어요.')
        : h('ul', null, ...owned.map((c) => h('li', null, `${names.get(c.sid) ?? c.sid} · ${itemName(c.coupon)}`))));
  }

  function ideaList() {
    return h('section', { class: 'card' }, h('h2', null, `학생 제안 (${ideas.length})`),
      ideas.length === 0 ? h('p', { class: 'muted' }, '아직 제안이 없어요.')
        : h('div', null, ...ideas.map((idea) => h('div', { class: 'req-row' },
          h('span', null, `${names.get(idea.sid) ?? idea.sid} · ${idea.what} (${idea.price}) — ${idea.why || ''}`),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => publishIdea(idea) }, '상점에 올리기'),
            h('button', { class: 'btn secondary small', onclick: () => run(() => dismissIdea(idea), '쪽지 보내고 지웠어요') }, '삭제'))))));
  }

  function itemForm() {
    const cur = editing ? items.find((i) => i.id === editing) : prefill;
    const f = {
      name: cur?.name ?? '', desc: cur?.desc ?? '', price: cur?.price ?? 10, instant: cur?.instant ?? false,
      buyLimit: cur?.buyLimit ?? 0, buyPeriod: cur?.buyPeriod ?? 'none', dailyUse: cur?.dailyUse ?? 0,
      onSale: cur?.onSale ?? true, order: cur?.order,
    };
    const ideaInfo = prefill?._ideaId ? prefill : null;
    const inp = (key, type = 'text', style = '') => h('input', { type, value: String(f[key] ?? ''), style, oninput: (e) => { f[key] = e.target.value; } });
    const name = inp('name'); const desc = inp('desc'); const price = inp('price', 'number', 'width:90px');
    const buyLimit = inp('buyLimit', 'number', 'width:90px'); const dailyUse = inp('dailyUse', 'number', 'width:90px');
    const instant = h('input', { type: 'checkbox', checked: f.instant, onchange: (e) => { f.instant = e.target.checked; } });
    const onSale = h('input', { type: 'checkbox', checked: f.onSale, onchange: (e) => { f.onSale = e.target.checked; } });
    const period = h('select', { onchange: (e) => { f.buyPeriod = e.target.value; } }, ...PERIODS.map(([v, l]) => h('option', { value: v, selected: f.buyPeriod === v }, l)));
    return h('section', { class: 'card' }, h('h3', null, editing ? '쿠폰 고치기' : '쿠폰 추가'),
      h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '이름'), name),
        h('label', { class: 'field' }, h('span', null, '설명'), desc),
        h('label', { class: 'field' }, h('span', null, '가격'), price),
        h('label', { class: 'pick' }, instant, '바로 구매(선생님 승인 없이 지급)'),
        h('label', { class: 'field' }, h('span', null, '구매 한도 (0=무제한)'), buyLimit),
        h('label', { class: 'field' }, h('span', null, '한도 기간'), period),
        h('label', { class: 'field' }, h('span', null, '하루 사용 한도(반 전체, 0=무제한)'), dailyUse),
        h('label', { class: 'pick' }, onSale, '판매 중'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => {
            if (!f.name.trim()) { toast('이름을 써 주세요.', 'error'); return; }
            try { await saveItem(f, ideaInfo); toast(editing ? '고쳤어요' : '추가했어요'); }
            catch (e) { console.error(e); toast('안 됐어요', 'error'); }
            editing = null; showForm = false; prefill = null; await load(); draw();
          } }, editing ? '고치기' : '추가'),
          h('button', { class: 'btn secondary', onclick: () => { editing = null; showForm = false; prefill = null; draw(); } }, '취소'))));
  }

  function shopList() {
    return h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', null, '상점 쿠폰 관리'),
        showForm ? null : h('button', { class: 'btn', onclick: () => { editing = null; prefill = null; showForm = true; draw(); } }, '+ 쿠폰 추가')),
      items.length === 0 ? h('p', { class: 'muted' }, '쿠폰이 없어요.')
        : h('table', null, h('thead', null, h('tr', null,
          h('th', null, '이름'), h('th', null, '가격'), h('th', null, '구매'), h('th', null, '하루 사용'), h('th', null, '판매'), h('th', null, ''))),
        h('tbody', null, ...items.map((i) => h('tr', null,
          h('td', null, i.name), h('td', { class: 'num' }, i.price),
          h('td', null, `${i.instant ? '즉시' : '승인'}${i.buyLimit ? ` · ${PERIODS.find((p) => p[0] === i.buyPeriod)?.[1] ?? ''} ${i.buyLimit}` : ''}`),
          h('td', null, i.dailyUse ? `하루 ${i.dailyUse}` : '무제한'),
          h('td', null, i.onSale ? '판매중' : '숨김'),
          h('td', { class: 'actions' },
            h('button', { class: 'btn secondary small', onclick: () => { editing = i.id; prefill = null; showForm = true; draw(); } }, '고치기'),
            h('button', { class: 'btn danger small', onclick: () => { if (confirm(`'${i.name}'을(를) 지울까요?`)) run(() => deleteDoc(doc(db, 'shopItems', i.id)), '지웠어요'); } }, '삭제')))))));
  }

  function draw() {
    root.replaceChildren(...[requests(), ideaList(), shopList(), showForm ? itemForm() : null, studentCoupons()].filter(Boolean));
  }

  await load();
  draw();
}
