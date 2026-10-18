// 학생 대시보드: 지갑과 오늘 할 일을 먼저, 아래에 공동 목표 보태기까지.
import {
  doc, getDoc, getDocs, collection, query, where, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';
import { loadMood, renderMood, moodLabel } from './mood.js';
import { loadRoles, requestRole, approveRole, redoRole } from './roles.js';

export async function renderDashboard(content, student, settings, { openMission }) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const perDay = settings.mission.perDay;
  let data;

  async function load() {
    const [summarySnap, mood, roles, attemptSnaps, studentsSnap, goalSnap, msgSnap] = await Promise.all([
      getDoc(doc(db, 'summaries', sid)), loadMood(sid), loadRoles(sid),
      Promise.all(Array.from({ length: perDay }, (_, i) => getDoc(doc(db, 'missionAttempts', `${sid}_${todayId()}_${i + 1}`)).catch(() => null))),
      getDocs(collection(db, 'students')),
      getDocs(query(collection(db, 'goals'), where('status', '==', 'open'))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('to', '==', sid))).catch(() => null),
    ]);
    data = {
      summary: summarySnap.exists() ? summarySnap.data() : { wallet: 0, total: 0 },
      mood,
      roles,
      missionGraded: attemptSnaps.filter((s) => s?.exists() && 'correct' in s.data()).length,
      missionGot: attemptSnaps.filter((s) => s?.exists() && s.data().correct === true).length,
      names: new Map(studentsSnap.docs.map((d) => [d.id, d.data().name])),
      goals: goalSnap ? goalSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
      messages: msgSnap ? msgSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !m.readAt).sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0)) : [],
    };
  }

  async function refresh() { await load(); draw(); }
  async function act(fn) {
    try { await fn(); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await refresh();
  }

  async function donate(goal, amount) {
    const donateId = `donate_${goal.id}_${sid}_${Date.now()}`;
    const donorRef = doc(db, 'goals', goal.id, 'donors', sid);
    const firstTime = !(await getDoc(donorRef).catch(() => null))?.exists();
    const newRaised = goal.raised + amount;
    const b = writeBatch(db);
    b.set(doc(db, 'points', donateId), { sid, type: 'donate', wallet: -amount, total: 0, reason: `공동 목표 ${goal.title}`, ref: goal.id, by: sid, at: serverTimestamp() });
    b.update(doc(db, 'goals', goal.id), { raised: increment(amount), donors: increment(firstTime ? 1 : 0), lastTx: donateId, status: newRaised >= goal.target ? 'done' : 'open' });
    b.set(donorRef, { total: increment(amount) });
    b.update(doc(db, 'summaries', sid), { wallet: increment(-amount), lastTx: donateId });
    await b.commit();
  }

  function todos() {
    const items = [];
    if (!data.mood.mood) items.push('기분');
    if (data.missionGraded < perDay) items.push('기초미션');
    for (const { status } of data.roles.mine) if (status !== 'approved') items.push('역할');
    return items;
  }

  // ---- 조각 ----
  function hero() {
    const remaining = todos().length;
    const total = 2 + data.roles.mine.length;
    const done = total - remaining;
    return h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        h('div', { class: 'avatar' }, '🙂'),
        h('div', { class: 'hero-id' },
          h('div', { class: 'name' }, `${student.number}번 ${student.name}`),
          h('div', { class: 'wallet-pill' }, `🪙 ${data.summary.wallet} ${currency}`)),
        h('div', { class: 'hero-count' },
          h('div', { class: 'big' }, `${done}/${total}`),
          h('div', { class: 'sub' }, '오늘'))),
      h('div', { class: 'todo-line' }, remaining > 0 ? `오늘 할 일이 ${remaining}가지 남았어요` : '오늘 할 일을 모두 마쳤어요! 🎉'),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${total ? (done / total) * 100 : 100}%` })),
    );
  }

  function requestCard() {
    const reqs = data.roles.requests;
    if (reqs.length === 0) return null;
    return h('section', { class: 'card requests' },
      h('h2', null, '친구 확인 요청'),
      ...reqs.map(({ check, role }) => h('div', { class: 'request-row' },
        h('span', null, `${data.names.get(check.sid) ?? '친구'} · ${role.name}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => act(() => approveRole(sid, check, role)) }, `승인 (+${role.points})`),
          h('button', { class: 'btn secondary small', onclick: () => act(() => redoRole(sid, check)) }, '다시 해줘')))));
  }

  function moodCard() {
    const box = h('div', { class: 'mood-box' });
    renderMood(box, sid, { ...data.mood }, () => refresh());
    return h('section', { class: 'card' }, h('h2', null, '오늘 기분'), box);
  }

  function todoRow(icon, label, btn, cls = '') {
    return h('div', { class: `todo ${cls}` }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, icon), h('span', null, label)), btn);
  }

  function todoCard() {
    const rows = [];
    if (data.missionGraded < perDay) {
      rows.push(todoRow('🧮', `기초미션 (${data.missionGraded}/${perDay})`,
        h('button', { class: 'btn small', onclick: openMission }, data.missionGraded > 0 ? '이어 풀기' : '풀기')));
    }
    for (const { role, status } of data.roles.mine) {
      if (status === 'approved') continue;
      if (status === 'requested') rows.push(todoRow('🧹', role.name, h('span', { class: 'state' }, '확인 기다리는 중…'), 'done-wait'));
      else if (status === 'redo') rows.push(todoRow('🧹', `${role.name} · 다시 해달래요`, h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, true)) }, '다시 했어요')));
      else rows.push(todoRow('🧹', role.name, h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, false)) }, '했어요')));
    }
    if (rows.length === 0) return h('section', { class: 'card' }, h('h2', null, '오늘 할 일'), h('p', { class: 'empty' }, '남은 할 일이 없어요! 🎉'));
    return h('section', { class: 'card' }, h('h2', null, '오늘 할 일'), ...rows);
  }

  function doneCard() {
    const rows = [];
    if (data.mood.mood) {
      const label = data.mood.mood === 'custom' ? `직접 씀: ${data.mood.note}` : moodLabel(data.mood.mood);
      rows.push(h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '😊'), h('span', null, `기분 · ${label}`))));
    }
    if (data.missionGraded >= perDay) rows.push(h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '🧮'), h('span', null, '기초미션')), h('span', { class: 'got' }, `+${data.missionGot}`)));
    for (const { role, status } of data.roles.mine) {
      if (status === 'approved') rows.push(h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '🧹'), h('span', null, role.name)), h('span', { class: 'got' }, `+${role.points}`)));
    }
    if (rows.length === 0) return h('section', { class: 'card' }, h('h2', null, '오늘 한 일'), h('p', { class: 'empty' }, '아직 없어요. 위에서 하나씩 해봐요!'));
    return h('section', { class: 'card' }, h('h2', null, '오늘 한 일'), ...rows);
  }

  function goalCard() {
    const goal = (data.goals ?? [])[0];
    if (!goal) return null;
    const remaining = goal.target - goal.raised;
    const pct = goal.target ? Math.min(100, (goal.raised / goal.target) * 100) : 0;
    const wallet = data.summary.wallet ?? 0;
    const give = (amount) => {
      if (amount <= 0) return;
      if (amount > wallet) { toast('지갑 포인트가 모자라요.', 'error'); return; }
      if (amount > remaining) { toast('남은 포인트보다 많이 보탤 수 없어요.', 'error'); return; }
      if (!confirm(`'${goal.title}'에 ${amount} ${currency}을 보탤까요?`)) return;
      act(async () => { await donate(goal, amount); toast(`${amount} ${currency}을 보탰어요! 💚`); });
    };
    const custom = h('input', { type: 'number', min: '1', placeholder: '직접', class: 'goal-custom' });
    return h('section', { class: 'card goal' },
      h('h2', null, '우리반 공동 목표'),
      h('div', { class: 'goal-title' }, goal.title),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, `${goal.raised} / ${goal.target} ${currency} · ${goal.donors ?? 0}명이 보탰어요`),
      h('div', { class: 'give-row' },
        ...[1, 5, 10].filter((a) => a <= remaining).map((a) => h('button', { class: 'give-btn', onclick: () => give(a) }, `+${a}`)),
        custom,
        h('button', { class: 'btn small', onclick: () => give(Number(custom.value) || 0) }, '보태기')),
      h('div', { class: 'muted small' }, `내 지갑: ${wallet} ${currency}`),
    );
  }

  function messagesCard() {
    if (data.messages.length === 0) return null;
    return h('section', { class: 'card messages-card' },
      h('h2', null, '💌 선생님 쪽지'),
      ...data.messages.map((m) => h('div', { class: 'msg-row' },
        h('p', null, m.body),
        h('button', { class: 'btn small', onclick: () => act(() => updateDoc(doc(db, 'messages', m.id), { readAt: serverTimestamp() })) }, '읽었어요'))));
  }

  function draw() {
    const grid = h('div', { class: 'dash-grid' },
      h('div', { class: 'dash-col' }, moodCard(), doneCard()),
      h('div', { class: 'dash-col' }, ...[todoCard(), goalCard()].filter(Boolean)));
    content.replaceChildren(h('div', { class: 'dash' }, ...[
      messagesCard(), hero(), requestCard(), grid,
    ].filter(Boolean)));
  }

  await load();
  draw();
}
