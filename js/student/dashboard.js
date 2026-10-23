// 학생 대시보드: 지갑과 오늘 할 일을 먼저, 아래에 공동 목표 보태기까지.
import {
  doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, ddayLabel as dday } from '../common/dates.js';
import { loadMood, renderMood, moodLabel } from './mood.js';
import { loadRoles, requestRole, approveRole, redoRole } from './roles.js';
import { isShown } from '../common/task-visible.js';
import { lookOf } from '../character/catalog.js';
import { drawFront } from '../character/voxel2d.js';
import { celebrateGoal } from './celebrate.js';
import { loadWish, wishCard } from './role-wish.js';
import { treeCard } from './tree.js';
import { loadAbsentDays, isAbsentTask } from './absent.js';

export async function renderDashboard(content, student, settings, { openMission, openTasks }) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const perDay = settings.mission.perDay;
  let data;

  async function load() {
    const [summarySnap, mood, roles, attemptSnaps, studentsSnap, goalSnap, msgSnap, taskSnap, subSnap, profSnap] = await Promise.all([
      getDoc(doc(db, 'summaries', sid)), loadMood(sid), loadRoles(sid),
      Promise.all(Array.from({ length: perDay }, (_, i) => getDoc(doc(db, 'missionAttempts', `${sid}_${todayId()}_${i + 1}`)).catch(() => null))),
      getDocs(collection(db, 'students')),
      getDocs(query(collection(db, 'goals'), where('status', 'in', ['open', 'done']))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('to', '==', sid))).catch(() => null),
      getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', sid))).catch(() => null),
      getDocs(query(collection(db, 'submissions'), where('sid', '==', sid))).catch(() => null),
      getDoc(doc(db, 'profiles', sid)).catch(() => null),
    ]);
    const wish = await loadWish(sid).catch(() => null);
    const absentDays = await loadAbsentDays(sid);
    // 아직 안 낸 과제(제출 전이거나 '다시 해오기'), 마감 빠른 순
    const subs = new Map((subSnap?.docs ?? []).map((d) => [d.id, d.data().status]));
    const subData = new Map((subSnap?.docs ?? []).map((d) => [d.id, d.data()]));
    const allTasks = (taskSnap?.docs ?? []).map((d) => ({ id: d.id, ...d.data() })).filter((t) => isShown(t));
    // 선생님 확인용(가정통신문 회신 등) 중 '대시보드에 알림'을 켠 것: 아직 회신 안 한 학생에게만
    const checks = allTasks.filter((t) => t.kind === 'check' && t.notify && subs.get(`${t.id}_${sid}`) !== 'done');
    const tasks = allTasks
      .filter((t) => t.kind === 'homework')
      .map((t) => ({ ...t, status: subs.get(`${t.id}_${sid}`) }))
      .filter((t) => (!t.status || t.status === 'redo') && !isAbsentTask(t, t.status, absentDays)) // 결석한 날 과제는 할 일에서 뺌
      .sort((a, b) => (a.dueAt?.toMillis?.() ?? Infinity) - (b.dueAt?.toMillis?.() ?? Infinity));
    data = {
      summary: summarySnap.exists() ? summarySnap.data() : { wallet: 0, total: 0 },
      mood,
      roles,
      missionGraded: attemptSnaps.filter((s) => s?.exists() && 'correct' in s.data()).length,
      missionGot: attemptSnaps.filter((s) => s?.exists() && s.data().correct === true).length,
      names: new Map(studentsSnap.docs.map((d) => [d.id, d.data().name])),
      tasks,
      checks,
      // 오늘 낸 과제·확인용(오늘 한 일에 표시)
      doneToday: allTasks.map((t) => ({ t, sub: subData.get(`${t.id}_${sid}`) }))
        .filter(({ sub }) => sub && ['submitted', 'done'].includes(sub.status)
          && todayId((sub.lastAt ?? sub.firstAt)?.toDate?.() ?? new Date(0)) === todayId()),
      wish,
      equip: profSnap?.exists() ? profSnap.data().equip : null,
      goals: goalSnap ?goalSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
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
    return newRaised >= goal.target; // 이번에 달성했는지
  }

  function todos() {
    const items = [];
    if (!data.mood.mood) items.push('기분');
    if (data.missionGraded < perDay) items.push('기초미션');
    for (const { status } of data.roles.mine) if (status !== 'approved' && status !== 'requested') items.push('역할'); // 했어요를 누른 건 한 일
    for (const _ of data.tasks) items.push('과제');
    return items;
  }

  // ---- 조각 ----
  function hero() {
    const remaining = todos().length;
    const total = 2 + data.roles.mine.length + data.tasks.length;
    const done = total - remaining;
    return h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        avatar(),
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
    return h('section', { class: 'card mood-card' }, h('h2', null, '오늘 기분'), box);
  }

  function todoRow(icon, label, btn, cls = '') {
    return h('div', { class: `todo ${cls}` }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, icon), h('span', null, label)), btn);
  }

  // 기분 고르기 → 옆 '오늘 기분' 칸으로 이동해 잠깐 반짝
  function goMood() {
    const card = content.querySelector('.mood-card');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  }

  function todoCard() {
    const rows = [];
    // 아직 안 한 일만(한 일은 아래 '오늘 한 일'로)
    if (!data.mood.mood) rows.push(todoRow('😊', '기분 고르기', h('button', { class: 'btn small', onclick: goMood }, '고르기')));
    if (data.missionGraded < perDay) rows.push(todoRow('🧮', `기초미션 (${data.missionGraded}/${perDay})`,
      h('button', { class: 'btn small', onclick: openMission }, data.missionGraded > 0 ? '이어 풀기' : '풀기')));
    for (const { role, status } of data.roles.mine) {
      if (status === 'approved' || status === 'requested') continue;
      if (status === 'redo') rows.push(todoRow('🧹', `${role.name} · 다시 해달래요`, h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, true)) }, '다시 했어요')));
      else rows.push(todoRow('🧹', role.name, h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, false)) }, '했어요')));
    }
    // 아직 안 낸 과제 (있을 때만)
    for (const t of data.tasks) {
      const due = dday(t.dueAt);
      rows.push(todoRow('📋',
        h('span', null, t.title, t.status === 'redo' ? ' · 다시 해오기' : '',
          due ? h('span', { class: `todo-due${due.includes('지남') ? ' late' : ''}` }, due) : null),
        openTasks ? h('button', { class: 'btn small', onclick: openTasks }, '하러 가기') : null));
    }
    if (!rows.length) return h('section', { class: 'card' }, h('h2', null, '오늘 할 일'), h('p', { class: 'empty' }, '오늘 할 일을 모두 했어요! 🎉'));
    return h('section', { class: 'card' }, h('h2', null, '오늘 할 일'), ...rows);
  }

  function doneCard() {
    const rows = [];
    if (data.mood.mood) {
      const label = data.mood.mood === 'custom' ? `직접 씀: ${data.mood.note}` : moodLabel(data.mood.mood);
      rows.push(h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '😊'), h('span', null, `기분 · ${label}`))));
    }
    if (data.missionGraded >= perDay) rows.push(h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '🧮'), h('span', null, '기초미션')), h('span', { class: 'got' }, `+${data.missionGot}`)));
    const doneRow = (ico, label, right) => h('div', { class: 'done' }, h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, ico), h('span', null, label)), right);
    for (const { role, status } of data.roles.mine) {
      if (status === 'approved') rows.push(doneRow('🧹', role.name, h('span', { class: 'got' }, `+${role.points}`)));
      else if (status === 'requested') rows.push(doneRow('🧹', role.name, h('span', { class: 'state' }, '확인 기다리는 중…')));
    }
    // 오늘 낸 과제: 냈다는 표시(선생님이 확인했으면 '확인 완료')
    for (const { t, sub } of data.doneToday) {
      rows.push(doneRow(t.kind === 'check' ? '📄' : '📋', t.title,
        sub.status === 'done' ? h('span', { class: 'got' }, '✓ 확인 완료') : h('span', { class: 'got sent' }, '✓ 냈어요')));
    }
    if (rows.length === 0) return h('section', { class: 'card' }, h('h2', null, '오늘 한 일'), h('p', { class: 'empty' }, '아직 없어요. 위에서 하나씩 해봐요!'));
    return h('section', { class: 'card' }, h('h2', null, '오늘 한 일'), ...rows);
  }

  // 머리줄 왼쪽: 내 캐릭터 정면 그림(작게)
  function avatar() {
    const cv = h('canvas', { width: 116, height: 116, class: 'avatar-cv' });
    queueMicrotask(() => drawFront(cv, lookOf(data.equip)));
    return h('div', { class: 'avatar' }, cv);
  }

  // 선생님 확인용을 냈다고 알리기: 선생님 체크판에 회신(✓)으로 바로 표시된다(포인트 없음)
  function turnIn(t) {
    if (!confirm(`'${t.title}'을(를) 선생님께 냈나요?`)) return;
    act(async () => {
      await setDoc(doc(db, 'submissions', `${t.id}_${sid}`), {
        task: t.id, sid, status: 'done', text: '', firstAt: serverTimestamp(), lastAt: serverTimestamp(),
      });
      toast('냈다고 선생님께 알렸어요!');
    });
  }

  // 선생님 확인용 알림(가정통신문 회신 등): 아직 회신 안 했을 때만
  function checksCard() {
    if (!data.checks.length) return null;
    return h('section', { class: 'card checks-card' },
      h('h2', null, '📬 선생님께 내야 할 것'),
      ...data.checks.map((t) => h('div', { class: 'todo' },
        h('span', { class: 'todo-l' }, h('span', { class: 'todo-ico' }, '📄'),
          h('span', null, t.title, t.dueAt ? h('span', { class: 'todo-due' }, dday(t.dueAt)) : null)),
        h('button', { class: 'btn small', onclick: () => turnIn(t) }, '제출함'))));
  }

  // 달성한 목표: 축하 카드(보태기 닫힘)
  function goalDoneCard(goal) {
    return h('section', { class: 'card goal goal-done' },
      h('h2', null, '🎉 우리반 공동 목표 달성!'),
      h('div', { class: 'goal-title' }, goal.title),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:100%' })),
      h('div', { class: 'muted small', style: 'margin-top:6px' }, `${goal.target} ${currency} 모두 모았어요 · ${goal.donors ?? 0}명이 보탰어요`),
      goal.reward ? h('p', { class: 'goal-reward' }, `🎁 보상: ${goal.reward}`) : null);
  }

  function goalCard() {
    const done = (data.goals ?? []).find((g) => g.status === 'done');
    const goal = (data.goals ?? []).find((g) => g.status === 'open');
    if (!goal) return done ? goalDoneCard(done) : null;
    const remaining = goal.target - goal.raised;
    const pct = goal.target ? Math.min(100, (goal.raised / goal.target) * 100) : 0;
    const wallet = data.summary.wallet ?? 0;
    const give = (amount) => {
      if (amount <= 0) return;
      if (amount > wallet) { toast('지갑 포인트가 모자라요.', 'error'); return; }
      if (amount > remaining) { toast('남은 포인트보다 많이 보탤 수 없어요.', 'error'); return; }
      if (!confirm(`'${goal.title}'에 ${amount} ${currency}을 보탤까요?`)) return;
      act(async () => {
        const reached = await donate(goal, amount);
        if (reached) celebrateGoal(goal); else toast(`${amount} ${currency}을 보탰어요! 💚`);
      });
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
    // 윗줄: 오늘 기분 | 오늘 할 일 (같은 높이) / 아랫줄: 오늘 한 일 | 우리반 공동 목표 (같은 줄에서 시작)
    const grid = h('div', { class: 'dash-grid' },
      ...[moodCard(), todoCard(), doneCard(), goalCard()].filter(Boolean));
    content.replaceChildren(h('div', { class: 'dash' }, ...[
      messagesCard(), hero(), treeCard(data.summary.total ?? 0, settings), requestCard(), checksCard(), wishCard(sid, data.wish), grid,
    ].filter(Boolean)));
  }

  await load();
  draw();
}
