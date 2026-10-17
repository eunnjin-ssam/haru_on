// 학생 대시보드: 지갑 포인트와 오늘 남은 할 일을 가장 먼저 보여준다.
// 3단계 범위: 기분 고르기, 기초미션, 1인1역. (과제·공동목표·쪽지는 이후 단계)
import { doc, getDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { logoutStudent } from '../common/student-session.js';
import { loadSettings } from '../common/settings.js';
import { todayId } from '../common/dates.js';
import { loadMood, renderMood, moodLabel } from './mood.js';
import { loadRoles, requestRole, approveRole, redoRole } from './roles.js';
import { renderMission } from './mission.js';

export async function renderDashboard(root, student, onLogout) {
  const sid = student.sid;
  const settings = await loadSettings();
  const currency = settings.names.currency;
  const perDay = settings.mission.perDay;

  let data;

  async function load() {
    const [summarySnap, mood, roles, attemptSnaps, studentsSnap] = await Promise.all([
      getDoc(doc(db, 'summaries', sid)),
      loadMood(sid),
      loadRoles(sid),
      Promise.all(Array.from({ length: perDay }, (_, i) =>
        getDoc(doc(db, 'missionAttempts', `${sid}_${todayId()}_${i + 1}`)).catch(() => null))),
      getDocs(collection(db, 'students')),
    ]);
    data = {
      summary: summarySnap.exists() ? summarySnap.data() : { wallet: 0, total: 0 },
      mood,
      roles,
      missionGraded: attemptSnaps.filter((s) => s?.exists() && 'correct' in s.data()).length,
      missionGot: attemptSnaps.filter((s) => s?.exists() && s.data().correct === true).length,
      names: new Map(studentsSnap.docs.map((d) => [d.id, d.data().name])),
    };
  }

  async function refresh() { await load(); draw(); }

  async function act(fn) {
    try { await fn(); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await refresh();
  }

  function openMission() {
    renderMission(root, student, settings, refresh);
  }

  // ---- 조각 ----
  function logoutButton() {
    let asking = false;
    const btn = h('button', { class: 'logout', type: 'button', onclick: async () => {
      if (!asking) {
        asking = true;
        btn.textContent = '정말 나갈까요?';
        btn.classList.add('confirm');
        setTimeout(() => { asking = false; btn.textContent = '나가기'; btn.classList.remove('confirm'); }, 3000);
        return;
      }
      await logoutStudent();
      onLogout();
    } }, '나가기');
    return btn;
  }

  function todos() {
    const items = [];
    if (!data.mood.mood) items.push('기분');
    if (data.missionGraded < perDay) items.push('기초미션');
    for (const { role, status } of data.roles.mine) {
      if (status !== 'approved') items.push(role.name);
    }
    return items;
  }

  function hero() {
    const remaining = todos().length;
    const total = 2 + data.roles.mine.length;
    const done = total - remaining;
    return h('section', { class: 'card hero' },
      h('div', { class: 'who-line' }, h('span', { class: 'avatar' }, '🙂'),
        h('div', null,
          h('div', { class: 'name' }, `${student.number}번 ${student.name}`),
          h('div', { class: 'wallet' }, `${data.summary.wallet} ${currency}`),
        )),
      h('div', { class: 'todo-line' },
        remaining > 0 ? `오늘 남은 할 일 ${remaining}개` : '오늘 할 일을 모두 마쳤어요! 🎉'),
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
          h('button', { class: 'btn secondary small', onclick: () => act(() => redoRole(sid, check)) }, '다시 해줘'),
        ),
      )),
    );
  }

  function moodCard() {
    const box = h('div', { class: 'mood-box' });
    renderMood(box, sid, { ...data.mood }, () => refresh());
    return h('section', { class: 'card' }, h('h2', null, '오늘 기분'), box);
  }

  function roleTodo({ role, status }) {
    if (status === 'requested') {
      return h('div', { class: 'todo done-wait' }, h('span', null, role.name), h('span', { class: 'state' }, '확인 기다리는 중…'));
    }
    if (status === 'redo') {
      return h('div', { class: 'todo' },
        h('span', null, `${role.name} · 다시 해달래요`),
        h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, true)) }, '다시 했어요'),
      );
    }
    return h('div', { class: 'todo' },
      h('span', null, role.name),
      h('button', { class: 'btn small', onclick: () => act(() => requestRole(sid, role.id, false)) }, '했어요'),
    );
  }

  function todoCard() {
    const rows = [];
    if (data.missionGraded < perDay) {
      rows.push(h('div', { class: 'todo' },
        h('span', null, `기초미션 (${data.missionGraded}/${perDay})`),
        h('button', { class: 'btn small', onclick: openMission }, data.missionGraded > 0 ? '이어 풀기' : '풀기'),
      ));
    }
    for (const r of data.roles.mine) {
      if (r.status !== 'approved') rows.push(roleTodo(r));
    }
    if (rows.length === 0) return null;
    return h('section', { class: 'card' }, h('h2', null, '오늘 할 일'), ...rows);
  }

  function doneCard() {
    const rows = [];
    if (data.mood.mood) {
      const label = data.mood.mood === 'custom' ? `직접 씀: ${data.mood.note}` : moodLabel(data.mood.mood);
      rows.push(h('div', { class: 'done' }, h('span', null, `기분 · ${label}`)));
    }
    if (data.missionGraded >= perDay) {
      rows.push(h('div', { class: 'done' }, h('span', null, '기초미션'), h('span', { class: 'got' }, `+${data.missionGot}`)));
    }
    for (const { role, status } of data.roles.mine) {
      if (status === 'approved') rows.push(h('div', { class: 'done' }, h('span', null, role.name), h('span', { class: 'got' }, `+${role.points}`)));
    }
    if (rows.length === 0) return null;
    return h('section', { class: 'card' }, h('h2', null, '오늘 한 일'), ...rows);
  }

  function draw() {
    root.replaceChildren(h('div', { class: 'dash' },
      h('header', null, h('span', { class: 'who' }, `${student.number}번 ${student.name}`), logoutButton()),
      hero(),
      requestCard(),
      moodCard(),
      todoCard(),
      doneCard(),
    ));
  }

  await load();
  draw();
}
