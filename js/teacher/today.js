// 선생님 첫 화면: 오늘 현황. 반 전체의 기분·기초미션·1인1역·남은 과제를 한눈에 본다.
// (글마당 열은 글마당 단계에서 추가)
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, kstNow } from '../common/dates.js';
import { MOODS, moodLabel } from '../student/mood.js';
import { isShown } from '../common/task-visible.js';

const NEGATIVE = ['upset', 'angry', 'tired'];
const moodEmoji = (id) => (id === 'custom' ? '✏️' : MOODS.find((m) => m.id === id)?.emoji ?? '');

function dayIdOffset(days) {
  const k = kstNow();
  k.setUTCDate(k.getUTCDate() - days);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
}

export async function renderToday(root, { open }) {
  let onlyTodo = false;
  let data;

  async function load() {
    const today = todayId();
    const recent = [today, dayIdOffset(1), dayIdOffset(2)];
    const [
      studentsSnap, settingsSnap, moodsSnap, notesSnap, attemptsSnap,
      rolesSnap, checksSnap, tasksSnap, subsSnap, recentMoodsSnap,
    ] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDoc(doc(db, 'settings', 'main')),
      getDocs(query(collection(db, 'moods'), where('date', '==', today))),
      getDocs(query(collection(db, 'moodNotes'), where('date', '==', today))),
      getDocs(query(collection(db, 'missionAttempts'), where('date', '==', today))),
      getDocs(collection(db, 'roles')),
      getDocs(query(collection(db, 'roleChecks'), where('date', '==', today))),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'submissions')),
      getDocs(query(collection(db, 'moods'), where('date', 'in', recent))),
    ]);

    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const perDay = settings.mission?.perDay ?? 5;
    const students = studentsSnap.docs.map((d) => ({ sid: d.id, ...d.data() }))
      .filter((s) => s.active).sort((a, b) => a.number - b.number);

    const moods = new Map(moodsSnap.docs.map((d) => [d.data().sid, d.data().mood]));
    const notes = new Map(notesSnap.docs.map((d) => [d.data().sid, d.data().text]));

    // 기초미션: 학생별 맞힌 수 / 채점한 수
    const mission = new Map();
    for (const d of attemptsSnap.docs) {
      const a = d.data();
      const m = mission.get(a.sid) ?? { graded: 0, correct: 0 };
      if ('correct' in a) { m.graded += 1; if (a.correct) m.correct += 1; }
      mission.set(a.sid, m);
    }

    const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const checks = checksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 과제: 학생별 남은 과제(늦음 포함), 확인 대기 수
    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.kind === 'homework' && isShown(t));
    const subs = new Map(subsSnap.docs.map((d) => [d.id, d.data()]));
    let waiting = 0;
    for (const s of subsSnap.docs) if (s.data().status === 'submitted') waiting += 1;

    // 3일 연속 부정 기분
    const byStudentDay = new Map(); // sid -> {date -> mood}
    for (const d of recentMoodsSnap.docs) {
      const m = d.data();
      const map = byStudentDay.get(m.sid) ?? {};
      map[m.date] = m.mood;
      byStudentDay.set(m.sid, map);
    }
    const streak = students.filter((s) => {
      const map = byStudentDay.get(s.sid) ?? {};
      return recent.every((dt) => NEGATIVE.includes(map[dt]));
    });

    data = { today, perDay, settings, students, moods, notes, mission, roles, checks, tasks, subs, waiting, streak };
  }

  function roleState(sid) {
    const mine = data.roles.filter((r) => (r.members ?? []).includes(sid));
    if (mine.length === 0) return { label: '-', kind: 'none', requests: [] };
    const requests = mine
      .map((r) => ({ role: r, check: data.checks.find((c) => c.role === r.id && c.sid === sid) }))
      .filter((x) => x.check?.status === 'requested');
    if (requests.length) return { label: '요청중', kind: 'req', requests };
    const allApproved = mine.every((r) => data.checks.find((c) => c.role === r.id && c.sid === sid)?.status === 'approved');
    return allApproved ? { label: '완료', kind: 'done', requests: [] } : { label: '미완료', kind: 'todo', requests: [] };
  }

  function taskState(sid) {
    const mine = data.tasks.filter((t) => (t.targets ?? []).includes(sid));
    let left = 0; let late = 0;
    const now = Date.now();
    for (const t of mine) {
      const sub = data.subs.get(`${t.id}_${sid}`);
      const finished = sub && ['done', 'exempt'].includes(sub.status);
      if (!finished) {
        left += 1;
        if (t.dueAt?.toMillis && t.dueAt.toMillis() < now) late += 1;
      }
    }
    return { left, late };
  }

  async function approveFor(sid, { role, check }) {
    const txId = `role_${check.id}`;
    const b = writeBatch(db);
    b.update(doc(db, 'roleChecks', check.id), { status: 'approved', by: 'teacher', at: serverTimestamp() });
    b.set(doc(db, 'points', txId), {
      sid, type: 'role', wallet: role.points, total: role.points,
      reason: `1인1역 ${role.name} (선생님 승인)`, ref: check.id, by: 'teacher', at: serverTimestamp(),
    });
    b.update(doc(db, 'summaries', sid), {
      wallet: increment(role.points), total: increment(role.points), roleDays: increment(1), lastTx: txId,
    });
    await b.commit();
  }

  async function run(task) {
    try { await task(); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await load(); draw();
  }

  function hero() {
    const k = kstNow();
    const wd = ['일', '월', '화', '수', '목', '금', '토'][k.getUTCDay()];
    const dateStr = `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${wd})`;
    return h('section', { class: 'card t-hero' },
      h('div', null,
        h('div', { class: 't-hero-date' }, dateStr),
        h('div', { class: 't-hero-sub' }, `우리 반 ${data.students.length}명 · 오늘 현황을 한눈에 봐요`)),
      h('div', { class: 't-hero-emoji' }, '🌤️'));
  }

  function statCard(icon, label, done, total, tone) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h('div', { class: `stat-card ${tone || ''}` },
      h('div', { class: 'stat-top' }, h('span', { class: 'stat-ico' }, icon), h('span', { class: 'stat-pct' }, `${pct}%`)),
      h('div', { class: 'stat-num' }, h('b', null, String(done)), ` / ${total}`),
      h('div', { class: 'stat-label' }, label),
      h('div', { class: 'stat-bar' }, h('div', { class: 'stat-fill', style: `width:${pct}%` })));
  }

  function stats() {
    const { students, moods, mission, perDay } = data;
    const total = students.length;
    const moodDone = students.filter((s) => moods.has(s.sid)).length;
    const missionDone = students.filter((s) => (mission.get(s.sid)?.graded ?? 0) >= perDay).length;
    const roleHolders = students.filter((s) => data.roles.some((r) => (r.members ?? []).includes(s.sid)));
    const roleDone = roleHolders.filter((s) => roleState(s.sid).kind === 'done').length;
    const negToday = students.filter((s) => { const m = moods.get(s.sid); return m && NEGATIVE.includes(m); }).length;
    return h('div', { class: 'stat-grid' },
      statCard('😊', '기분 기록', moodDone, total, ''),
      statCard('🧮', '기초미션 완료', missionDone, total, 'ok'),
      statCard('🧹', '1인1역 완료', roleDone, roleHolders.length, 'warn'),
      statCard('💗', '오늘 힘든 친구', negToday, total, 'care'));
  }

  function attention() {
    const items = [];
    const reqCount = data.checks.filter((c) => c.status === 'requested').length;
    if (reqCount) items.push({ ico: '🧹', text: '1인1역 승인 대기 — 아래 표에서 승인해요', n: reqCount, tone: 'req' });
    if (data.waiting) items.push({ ico: '📋', text: '과제 확인 대기', n: data.waiting, tone: 'wait', go: 'board' });
    if (data.streak.length) items.push({ ico: '💗', text: `3일째 힘든 친구: ${data.streak.map((s) => s.name).join(', ')}`, n: '', tone: 'care', go: 'care' });
    return h('section', { class: 'card' },
      h('h2', null, '오늘 살펴볼 일'),
      items.length === 0
        ? h('p', { class: 'empty-ok' }, '✅ 지금 바로 처리할 일은 없어요. 좋아요!')
        : h('div', { class: 'attn-list' }, ...items.map((it) => {
          const attrs = { class: `attn-item ${it.tone}` };
          if (it.go) attrs.onclick = () => open(it.go);
          return h(it.go ? 'button' : 'div', attrs,
            h('span', { class: 'attn-ico' }, it.ico),
            h('span', { class: 'attn-text' }, it.text),
            it.n !== '' ? h('span', { class: 'attn-n' }, String(it.n)) : null);
        })));
  }

  function row(s) {
    const mood = data.moods.get(s.sid);
    const note = data.notes.get(s.sid);
    const m = data.mission.get(s.sid);
    const rs = roleState(s.sid);
    const ts = taskState(s.sid);
    const negative = mood && (NEGATIVE.includes(mood) || mood === 'custom');

    const roleCell = rs.kind === 'req'
      ? h('td', null, ...rs.requests.map(({ role, check }) =>
        h('button', { class: 'btn small', title: '대신 승인', onclick: () => run(() => approveFor(s.sid, { role, check })) }, `승인: ${role.name}`)))
      : h('td', { class: `role-${rs.kind}` }, rs.label);

    const moodCell = mood
      ? h('td', { class: negative ? 'mood-neg' : '' },
        note
          ? h('button', { class: 'linkish', title: note, onclick: () => alert(`${s.number}번 ${s.name}: ${note}`) }, `${moodEmoji(mood)} 말풍선`)
          : `${moodEmoji(mood)} ${moodLabel(mood)}`)
      : h('td', { class: 'muted' }, '-');

    return h('tr', { class: negative ? 'row-neg' : '' },
      h('td', { class: 'num' }, s.number),
      h('td', null, s.name),
      moodCell,
      h('td', null, m ? `${m.correct}/${data.perDay}` : h('span', { class: 'muted' }, '-')),
      roleCell,
      h('td', { class: ts.late ? 'mood-neg' : '' }, ts.left ? `${ts.left}개${ts.late ? ` (늦음 ${ts.late})` : ''}` : h('span', { class: 'muted' }, '0')),
    );
  }

  function draw() {
    const rows = data.students.filter((s) => {
      if (!onlyTodo) return true;
      const done = data.moods.has(s.sid)
        && (data.mission.get(s.sid)?.graded ?? 0) >= data.perDay
        && roleState(s.sid).kind !== 'todo' && roleState(s.sid).kind !== 'req';
      return !done;
    });

    const filterBtn = h('button', { class: 'btn secondary small', onclick: () => { onlyTodo = !onlyTodo; draw(); } },
      onlyTodo ? '모든 학생 보기' : '아직 안 한 학생만 보기');

    root.replaceChildren(
      hero(),
      stats(),
      attention(),
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h2', null, '학생별 현황'), filterBtn),
        data.students.length === 0
          ? h('p', { class: 'muted' }, '등록된 학생이 없어요.')
          : h('div', { class: 'table-wrap' }, h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, '번호'), h('th', null, '이름'), h('th', null, '기분'),
              h('th', null, '기초미션'), h('th', null, '1인1역'), h('th', null, '남은 과제'))),
            h('tbody', null, ...rows.map(row)))),
        h('p', { class: 'muted small' }, '요청중 칸을 누르면 선생님이 대신 승인해요.'),
      ),
    );
  }

  await load();
  draw();
}
