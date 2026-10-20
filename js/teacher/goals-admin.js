// 공동 목표 관리: 목표 만들기·고치기·닫기·삭제, 기부 학생 명단과 금액(선생님만), 기부 돌려주기, 지난 목표.
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

export async function renderGoalsAdmin(root) {
  let goals = []; let donorsByGoal = new Map(); let names = new Map(); let currency = '포인트';
  let editing = null; let showForm = false;

  async function load() {
    const [gSnap, sSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'goals')),
      getDocs(collection(db, 'students')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    currency = cfgSnap.data()?.names?.currency ?? '포인트';
    goals = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    names = new Map(sSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
    donorsByGoal = new Map();
    await Promise.all(goals.map(async (g) => {
      const dSnap = await getDocs(collection(db, 'goals', g.id, 'donors'));
      donorsByGoal.set(g.id, dSnap.docs.map((d) => ({ sid: d.id, total: d.data().total })).sort((a, b) => b.total - a.total));
    }));
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  // ---- 기부 돌려주기 ----
  // 한 학생 몫: 돌려받음 거래(지갑만 +, 누적은 그대로 — 기부할 때 누적은 안 줄었으니까) + 요약 + 기부 명단에서 빼기 + 쪽지
  function refundInBatch(b, g, sid, amount) {
    const txId = `refund_${g.id}_${sid}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    b.set(doc(db, 'points', txId), {
      sid, type: 'refund', wallet: amount, total: 0, reason: `공동 목표 ‘${g.title}’ 돌려받음`, ref: g.id, by: 'teacher', at: serverTimestamp(),
    });
    b.update(doc(db, 'summaries', sid), { wallet: increment(amount), lastTx: txId });
    b.delete(doc(db, 'goals', g.id, 'donors', sid));
    b.set(doc(collection(db, 'messages')), {
      to: sid, from: 'teacher', at: serverTimestamp(), readAt: null,
      body: `공동 목표 ‘${g.title}’에 보탠 ${amount}${currency}를 돌려받았어요. 지갑을 확인해 보세요! 😊`,
    });
  }
  // 달성했던 목표에서 돌려주면 다시 '진행 중'으로(닫힌 목표는 그대로)
  const statusAfter = (g) => (g.status === 'done' ? 'open' : g.status);

  async function refundOne(g, d) {
    if (!confirm(`${names.get(d.sid) ?? '학생'}에게 ${d.total}${currency}를 돌려줄까요?`)) return;
    await run(async () => {
      const b = writeBatch(db);
      refundInBatch(b, g, d.sid, d.total);
      b.update(doc(db, 'goals', g.id), { raised: increment(-d.total), donors: increment(-1), status: statusAfter(g) });
      await b.commit();
    }, '돌려줬어요');
  }

  async function refundAll(g) {
    const donors = donorsByGoal.get(g.id) ?? [];
    for (let i = 0; i < donors.length; i += 100) {
      const b = writeBatch(db);
      for (const d of donors.slice(i, i + 100)) refundInBatch(b, g, d.sid, d.total);
      await b.commit();
    }
    await updateDoc(doc(db, 'goals', g.id), { raised: 0, donors: 0, status: statusAfter(g) });
  }

  // ---- 목표 지우기: 기부가 있으면 돌려줄지 고른다 ----
  function deleteGoal(g) {
    const donors = donorsByGoal.get(g.id) ?? [];
    const remove = async () => {
      for (const d of (await getDocs(collection(db, 'goals', g.id, 'donors'))).docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db, 'goals', g.id));
    };
    if (!donors.length) {
      if (confirm(`‘${g.title}’ 목표를 지울까요?`)) run(remove, '목표를 지웠어요');
      return;
    }
    const sum = donors.reduce((n, d) => n + d.total, 0);
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, `‘${g.title}’ 지우기`),
      h('p', { style: 'margin:0' }, `${donors.length}명이 모두 ${sum}${currency}를 보탰어요. 보탠 포인트를 어떻게 할까요?`),
      h('p', { class: 'muted small', style: 'margin:0' }, '달성해서 보상을 받은 목표라면 ‘그냥 지우기’, 취소된 목표라면 ‘돌려주고 지우기’를 골라요.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { dlg.remove(); run(async () => { await refundAll(g); await remove(); }, '돌려주고 지웠어요'); } }, '돌려주고 지우기'),
        h('button', { class: 'btn danger small', onclick: () => { dlg.remove(); run(remove, '목표를 지웠어요'); } }, '그냥 지우기'),
        h('button', { class: 'btn secondary', onclick: () => dlg.remove() }, '취소'))));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
    document.body.append(dlg);
  }

  async function save(f) {
    const data = { title: f.title, target: Number(f.target) || 0, reward: f.reward };
    if (editing) await updateDoc(doc(db, 'goals', editing), data);
    else await addDoc(collection(db, 'goals'), { ...data, raised: 0, donors: 0, status: 'open', lastTx: '' });
  }

  function form() {
    const cur = editing ? goals.find((g) => g.id === editing) : null;
    const title = h('input', { type: 'text', value: cur?.title ?? '', placeholder: '목표 (예) 학급 보드게임 사기' });
    const target = h('input', { type: 'number', min: '1', value: String(cur?.target ?? 100), style: 'width:120px' });
    const reward = h('input', { type: 'text', value: cur?.reward ?? '', placeholder: '보상 (예) 다 같이 보드게임!' });
    return h('section', { class: 'card' }, h('h3', null, editing ? '목표 고치기' : '새 목표'),
      h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '목표'), title),
        h('label', { class: 'field' }, h('span', null, '목표 포인트'), target),
        h('label', { class: 'field' }, h('span', null, '보상'), reward),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => {
            if (!title.value.trim()) { toast('목표를 써 주세요.', 'error'); return; }
            try { await save({ title: title.value.trim(), target: target.value, reward: reward.value.trim() }); toast(editing ? '고쳤어요' : '만들었어요'); }
            catch (e) { console.error(e); toast('안 됐어요', 'error'); }
            editing = null; showForm = false; await load(); draw();
          } }, editing ? '고치기' : '만들기'),
          h('button', { class: 'btn secondary', onclick: () => { editing = null; showForm = false; draw(); } }, '취소'))));
  }

  function goalCard(g) {
    const donors = donorsByGoal.get(g.id) ?? [];
    const pct = g.target ? Math.min(100, (g.raised / g.target) * 100) : 0;
    return h('section', { class: `card${g.status === 'open' ? '' : ' muted-card'}` },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', null, g.title),
        h('span', { class: `badge ${g.status === 'open' ? 'new' : 'skip'}` }, g.status === 'done' ? '달성!' : (g.status === 'closed' ? '닫힘' : '진행 중'))),
      h('div', { class: 'muted small' }, `보상: ${g.reward || '-'}`),
      h('div', { class: 'goal-bar' }, h('div', { class: 'goal-fill', style: `width:${pct}%` })),
      h('div', { class: 'goal-line' }, h('b', null, `${Math.round(pct)}%`), ` · ${g.raised} / ${g.target} · ${g.donors ?? 0}명 참여`),
      donors.length ? h('details', { style: 'margin-top:8px' }, h('summary', { class: 'muted' }, `기부 명단 (선생님만) · ${donors.length}명`),
        h('div', { class: 'donor-list' }, ...donors.map((d) => h('div', { class: 'req-row' },
          h('span', null, `${names.get(d.sid) ?? d.sid} · ${d.total}${currency}`),
          h('button', { class: 'btn secondary small', onclick: () => refundOne(g, d) }, '돌려주기')))),
        h('button', { class: 'btn secondary small', style: 'margin-top:8px', onclick: () => {
          const sum = donors.reduce((n, d) => n + d.total, 0);
          if (confirm(`${donors.length}명에게 보탠 포인트(모두 ${sum}${currency})를 모두 돌려줄까요?\n모인 포인트가 0이 돼요.`)) run(() => refundAll(g), '모두 돌려줬어요');
        } }, '모두 돌려주기')) : null,
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'btn secondary small', onclick: () => { editing = g.id; showForm = true; draw(); } }, '고치기'),
        g.status === 'open' ? h('button', { class: 'btn secondary small', onclick: () => { if (confirm('이 목표를 닫을까요? 더는 보탤 수 없어요.')) run(() => updateDoc(doc(db, 'goals', g.id), { status: 'closed' }), '닫았어요'); } }, '닫기') : null,
        h('button', { class: 'btn danger small', style: 'margin-left:auto', onclick: () => deleteGoal(g) }, '삭제')),
    );
  }

  function draw() {
    const open = goals.filter((g) => g.status === 'open' || g.status === 'done');
    const past = goals.filter((g) => g.status === 'closed');
    root.replaceChildren(...[
      h('section', { class: 'card' }, h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', null,
          h('h2', null, '우리반 공동 목표'),
          h('p', { class: 'muted small', style: 'margin:0' }, '반 전체가 포인트를 모아 목표를 이뤄요. 기부 명단은 선생님만 봐요.')),
        showForm ? null : h('button', { class: 'btn', onclick: () => { editing = null; showForm = true; draw(); } }, '+ 새 목표'))),
      showForm ? form() : null,
      (!showForm && open.length === 0) ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아직 진행 중인 목표가 없어요. ‘+ 새 목표’로 만들어 보세요.') : null,
      ...open.map(goalCard),
      past.length ? h('h3', { style: 'margin-top:8px' }, '지난 목표') : null,
      ...past.map(goalCard),
    ].filter(Boolean));
  }

  await load();
  draw();
}
