// 선생님 첫 화면: 오늘 현황. 반 전체의 기분·기초미션·1인1역·남은 과제를 한눈에 본다.
// (글마당 열은 글마당 단계에서 추가)
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, increment, serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, kstNow, ddayLabel } from '../common/dates.js';
import { MOODS, moodLabel } from '../student/mood.js';
import { isShown, excusedFor, isExpiredRepeat } from '../common/task-visible.js';
import { loadSettings } from '../common/settings.js';
import { renderMyWeek } from '../student/myweek.js';
import { icon } from '../common/icons.js';
import { loadTerms, currentTerm, nextTerm, daysLeft } from './role-terms.js';

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

    // 처리할 일: 신고(글·댓글), 쿠폰 요청(구매·사용), 쿠폰 제안, 새 건의, 새 선생님만 보기 이야기
    const [repPosts, storiesSnap, buyReq, useReq, privSnap, terms, attSnap, wishSnap, ideaSnap, fbSnap] = await Promise.all([
      getDocs(query(collection(db, 'posts'), where('status', '==', 'reported'))).catch(() => null),
      getDocs(collection(db, 'stories')).catch(() => null),
      getDocs(query(collection(db, 'coupons'), where('status', '==', 'pending'))).catch(() => null),
      getDocs(query(collection(db, 'couponUses'), where('status', '==', 'requested'))).catch(() => null),
      getDocs(collection(db, 'privateStories')).catch(() => null),
      loadTerms().catch(() => []),
      getDocs(collection(db, 'attendance')).catch(() => null),
      getDocs(collection(db, 'roleWishes')).catch(() => null),
      getDocs(collection(db, 'couponIdeas')).catch(() => null), // 상점에 올리거나 지우기 전까지 남아 있음
      getDocs(query(collection(db, 'feedback'), where('status', '==', 'new'))).catch(() => null), // '확인함' 누르기 전
    ]);
    // 1인1역 교체: 희망 받는 중 / 확정 남음 / 끝나기 3일 전인데 다음 기간 없음
    const cur = currentTerm(terms); const next = nextTerm(terms);
    let roleTerm = null;
    if (next?.status === 'wish') roleTerm = { text: `1인1역 희망 받는 중 (${(wishSnap?.docs ?? []).filter((d) => d.data().term === next.id).length}/${students.length}명)`, tone: 'wait' };
    else if (next?.status === 'assigned') roleTerm = { text: '1인1역 새 배정 확정이 남았어요', tone: 'wait' };
    else if (!next && cur && daysLeft(cur) <= 3) roleTerm = { text: `1인1역이 ${daysLeft(cur) < 0 ? '끝났어요' : `${daysLeft(cur)}일 뒤 끝나요`} — 희망 받기를 열까요?`, tone: 'req' };
    const absentOn = new Map((attSnap?.docs ?? []).map((d) => [d.id, new Set(d.data().absent ?? [])]));
    const absent = absentOn.get(today) ?? new Set();
    const repComments = await Promise.all((storiesSnap?.docs ?? []).map((d) =>
      getDocs(query(collection(db, 'stories', d.id, 'comments'), where('status', '==', 'reported'))).then((x) => x.size).catch(() => 0)));
    const todo = {
      reportedPosts: repPosts?.size ?? 0,
      reportedComments: repComments.reduce((a, b) => a + b, 0),
      coupons: (buyReq?.size ?? 0) + (useReq?.size ?? 0),
      ideas: ideaSnap?.size ?? 0,
      feedback: fbSnap?.size ?? 0,
      privates: (privSnap?.docs ?? []).filter((d) => !d.data().seenAt).length,
      reviews: (storiesSnap?.docs ?? []).filter((d) => d.data().stage === 'promise' && d.data().reviewAt && d.data().reviewAt <= today).length,
    };

    data = { today, perDay, settings, students, moods, notes, mission, roles, checks, tasks, subs, waiting, streak, todo, roleTerm, absent, absentOn };
  }

  function roleState(sid) {
    const mine = data.roles.filter((r) => (r.members ?? []).includes(sid));
    if (mine.length === 0) return { label: '-', kind: 'none', requests: [] };
    const requests = mine
      .map((r) => ({ role: r, check: data.checks.find((c) => c.role === r.id && c.sid === sid) }))
      .filter((x) => x.check?.status === 'requested');
    if (requests.length) return { label: '요청중', kind: 'req', requests };
    const allApproved = mine.every((r) => data.checks.find((c) => c.role === r.id && c.sid === sid)?.status === 'approved');
    // 아직 안 한 역할(요청 없음·다시 해줘): 선생님이 보고 바로 완료 처리할 수 있게
    const todo = mine.filter((r) => data.checks.find((c) => c.role === r.id && c.sid === sid)?.status !== 'approved')
      .map((r) => ({ role: r, check: data.checks.find((c) => c.role === r.id && c.sid === sid) }));
    // 완료면 어떤 역할인지 함께: '완료 · 우유 당번'
    return allApproved ? { label: `완료 · ${mine.map((r) => r.name).join(', ')}`, kind: 'done', requests: [] } : { label: '미완료', kind: 'todo', requests: [], todo };
  }

  function taskState(sid) {
    const mine = data.tasks.filter((t) => (t.targets ?? []).includes(sid));
    let left = 0; let late = 0; const list = [];
    const now = Date.now();
    for (const t of mine) {
      const sub = data.subs.get(`${t.id}_${sid}`);
      const finished = sub && ['done', 'exempt'].includes(sub.status);
      // 과제가 올라온 날 결석했고 안 냈으면 안 내도 됨
      if (!sub && excusedFor(t, sid, data.absentOn)) continue;
      // 반복 과제는 마감이 지나도록 안 냈으면 끝(세지 않음)
      if (isExpiredRepeat(t, sub)) continue;
      if (!finished) {
        left += 1;
        // 늦음: 마감까지 안 낸 것(다시 해오기 포함)만. 낸 뒤 선생님 확인을 기다리는 건 늦음 아님.
        // 반복 과제는 학생 자율이라 늦음으로 세지 않는다
        const notSent = !sub || sub.status === 'redo';
        const isLate = !t.repeat && notSent && !!(t.dueAt?.toMillis && t.dueAt.toMillis() < now);
        if (isLate) late += 1;
        list.push({ t, sub, isLate });
      }
    }
    return { left, late, list };
  }

  // 요청을 대신 승인하거나, 학생이 '했어요'를 안 눌렀어도 선생님이 보고 바로 완료 처리(check 없음)
  async function approveFor(sid, { role, check }) {
    const id = check?.id ?? `${data.today}_${role.id}_${sid}`;
    const txId = `role_${id}`;
    const b = writeBatch(db);
    if (check) b.update(doc(db, 'roleChecks', id), { status: 'approved', by: 'teacher', at: serverTimestamp() });
    else b.set(doc(db, 'roleChecks', id), { sid, role: role.id, date: data.today, status: 'approved', by: 'teacher', at: serverTimestamp() });
    b.set(doc(db, 'points', txId), {
      sid, type: 'role', wallet: role.points, total: role.points,
      reason: `1인1역 ${role.name} (선생님 승인)`, ref: id, by: 'teacher', at: serverTimestamp(),
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

  function statCard(ico, label, done, total, tone) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h('div', { class: `stat-card ${tone || ''}` },
      h('div', { class: 'stat-top' }, h('span', { class: 'stat-ico' }, icon(ico, 20)), h('span', { class: 'stat-pct' }, `${pct}%`)),
      h('div', { class: 'stat-num' }, h('b', null, String(done)), ` / ${total}`),
      h('div', { class: 'stat-label' }, label),
      h('div', { class: 'stat-bar' }, h('div', { class: 'stat-fill', style: `width:${pct}%` })));
  }

  function stats() {
    const { moods, mission, perDay } = data;
    const students = data.students.filter((s) => !data.absent.has(s.sid)); // 결석한 학생은 빼고 센다
    const total = students.length;
    const moodDone = students.filter((s) => moods.has(s.sid)).length;
    const missionDone = students.filter((s) => (mission.get(s.sid)?.graded ?? 0) >= perDay).length;
    const roleHolders = students.filter((s) => data.roles.some((r) => (r.members ?? []).includes(s.sid)));
    const roleDone = roleHolders.filter((s) => roleState(s.sid).kind === 'done').length;
    const negToday = students.filter((s) => { const m = moods.get(s.sid); return m && NEGATIVE.includes(m); }).length;
    return h('div', { class: 'stat-grid' },
      statCard('smile', '기분 기록', moodDone, total, ''),
      statCard('calculator', '기초미션 완료', missionDone, total, 'ok'),
      statCard('list-checks', '1인1역 완료', roleDone, roleHolders.length, 'warn'),
      statCard('heart', '오늘 힘든 친구', negToday, total, 'care'));
  }

  function attention() {
    const items = [];
    const reqCount = data.checks.filter((c) => c.status === 'requested').length;
    if (reqCount) items.push({ ico: 'list-checks', text: '1인1역 승인 대기 — 아래 표에서 승인해요', n: reqCount, tone: 'req' });
    if (data.waiting) items.push({ ico: 'clipboard-check', text: '과제 확인 대기', n: data.waiting, tone: 'wait', go: 'board' });
    const t = data.todo;
    if (t.reportedPosts) items.push({ ico: 'flag', text: '신고된 글마당 글', n: t.reportedPosts, tone: 'care', go: 'writing' });
    if (t.reportedComments) items.push({ ico: 'flag', text: '신고된 약속마당 댓글', n: t.reportedComments, tone: 'care', go: 'stories' });
    if (t.coupons) items.push({ ico: 'ticket', text: '쿠폰 요청 (구매·사용)', n: t.coupons, tone: 'wait', go: 'points' });
    if (t.ideas) items.push({ ico: 'sparkles', text: '학생 쿠폰 제안', n: t.ideas, tone: 'wait', go: 'points' });
    if (t.feedback) items.push({ ico: 'message-square-text', text: '새 건의 (오류·아이디어)', n: t.feedback, tone: 'req', go: 'feedback' });
    if (t.privates) items.push({ ico: 'lock', text: '새 ‘선생님만 보기’ 이야기', n: t.privates, tone: 'req', go: 'stories' });
    if (data.roleTerm) items.push({ ico: 'list-checks', text: data.roleTerm.text, n: '', tone: data.roleTerm.tone, go: 'roles' });
    if (t.reviews) items.push({ ico: 'search-check', text: '점검할 우리반 약속', n: t.reviews, tone: 'wait', go: 'stories' });
    if (data.streak.length) items.push({ ico: 'heart', text: `3일째 힘든 친구: ${data.streak.map((s) => s.name).join(', ')}`, n: '', tone: 'care', go: 'care' });
    return h('section', { class: 'card' },
      h('h2', null, '오늘 살펴볼 일'),
      items.length === 0
        ? h('p', { class: 'empty-ok' }, '✅ 지금 바로 처리할 일은 없어요. 좋아요!')
        : h('div', { class: 'attn-list' }, ...items.map((it) => {
          const attrs = { class: `attn-item ${it.tone}` };
          if (it.go) attrs.onclick = () => open(it.go);
          return h(it.go ? 'button' : 'div', attrs,
            h('span', { class: 'attn-ico' }, icon(it.ico, 18)),
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
      : rs.kind === 'todo'
        ? h('td', null, ...rs.todo.map(({ role, check }) => h('button', {
          class: 'btn secondary small', title: '학생이 안 눌렀어도 선생님이 보고 완료 처리 (+포인트)',
          onclick: () => { if (confirm(`${s.name}의 ‘${role.name}’을 완료 처리할까요? (+${role.points})`)) run(() => approveFor(s.sid, { role, check })); },
        }, `완료 처리: ${role.name}`)))
        : h('td', { class: `role-${rs.kind}` }, rs.label);

    const moodCell = mood
      ? h('td', { class: negative ? 'mood-neg' : '' },
        note
          ? h('button', { class: 'linkish', title: note, onclick: () => alert(`${s.number}번 ${s.name}: ${note}`) }, `${moodEmoji(mood)} 말풍선`)
          : `${moodEmoji(mood)} ${moodLabel(mood)}`)
      : h('td', { class: 'muted' }, '-');

    // 결석: 기분·기초미션·1인1역·남은 과제 칸에 '결석'. 그날은 1인1역 완료율·살핌판 계산에서 빠진다
    const isAbs = data.absent.has(s.sid);
    const absBtn = h('td', null, h('button', {
      class: `btn small ${isAbs ? 'absent-on' : 'secondary'}`,
      title: isAbs ? '누르면 결석 취소' : '오늘 결석으로 표시',
      onclick: () => run(async () => {
        // 반 결석부와 학생 본인 결석 목록(학생 화면 '결석' 표시용)을 함께
        const b = writeBatch(db);
        const op = isAbs ? arrayRemove : arrayUnion;
        b.set(doc(db, 'attendance', data.today), { absent: op(s.sid) }, { merge: true });
        b.set(doc(db, 'absences', s.sid), { days: op(data.today) }, { merge: true });
        await b.commit();
      }),
    }, isAbs ? '결석 취소' : '결석'));
    const nameCell = h('td', null, h('button', { class: 'linkish', title: '이 학생의 나의마당 보기', onclick: () => openMyWeek(s) }, s.name));
    if (isAbs) {
      const absCell = () => h('td', null, h('span', { class: 'badge skip' }, '결석'));
      return h('tr', { class: 'row-absent' }, h('td', { class: 'num' }, s.number), nameCell, absCell(), absCell(), absCell(), absCell(), absBtn);
    }

    return h('tr', { class: negative ? 'row-neg' : '' },
      h('td', { class: 'num' }, s.number),
      nameCell,
      moodCell,
      h('td', null, m ? `${m.correct}/${data.perDay}` : h('span', { class: 'muted' }, '-')),
      roleCell,
      h('td', { class: ts.late ? 'mood-neg' : '' }, ts.left
        ? h('button', { class: 'linkish', title: '남은 과제 보기', onclick: () => openLeft(s, ts.list) }, `${ts.left}개${ts.late ? ` (늦음 ${ts.late})` : ''}`)
        : h('span', { class: 'muted' }, '0')),
      absBtn,
    );
  }

  // 창 하나 띄우기(바깥을 누르거나 닫기로 닫힘)
  function sheet(title, body) {
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box wide' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { style: 'margin:0' }, title),
        h('button', { class: 'btn secondary small', onclick: () => dlg.remove() }, '닫기')),
      body));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
    document.body.append(dlg);
  }

  // 남은 과제 숫자 → 목록(마감 순, 늦은 것은 빨강)
  function openLeft(s, list) {
    const items = list.slice().sort((a, b) => (a.t.dueAt?.toMillis?.() ?? Infinity) - (b.t.dueAt?.toMillis?.() ?? Infinity));
    const stateOf = (sub) => ({ submitted: '확인 대기', redo: '다시 해오기' }[sub?.status] ?? '안 함');
    sheet(`${s.number}번 ${s.name} · 남은 과제 ${items.length}개`,
      h('ul', { class: 'left-list' }, ...items.map(({ t, sub, isLate }) => h('li', { class: isLate ? 'late' : '' },
        h('span', null, t.title), h('span', { class: 'muted' }, `${ddayLabel(t.dueAt) || '기한 없음'} · ${stateOf(sub)}`)))));
  }

  // 이름 → 그 학생의 나의마당(학생 화면과 같은 내용)
  async function openMyWeek(s) {
    const box = h('div', { class: 'myweek-in-teacher' }, h('p', { class: 'muted' }, '불러오는 중…'));
    sheet(`${s.number}번 ${s.name}의 나의마당`, box);
    try { await renderMyWeek(box, { sid: s.sid, number: s.number, name: s.name }, await loadSettings()); }
    catch (e) { console.error(e); box.replaceChildren(h('p', { class: 'banner' }, '불러오지 못했어요.')); }
  }

  function draw() {
    const rows = data.students.filter((s) => {
      if (!onlyTodo) return true;
      if (data.absent.has(s.sid)) return false;
      const done = data.moods.has(s.sid)
        && (data.mission.get(s.sid)?.graded ?? 0) >= data.perDay
        && roleState(s.sid).kind !== 'todo' && roleState(s.sid).kind !== 'req';
      return !done;
    });

    const filterBtn = h('button', { class: 'btn secondary small', onclick: () => { onlyTodo = !onlyTodo; draw(); } },
      onlyTodo ? '모든 학생 보기' : '아직 안 한 학생만 보기');

    root.replaceChildren(
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
              h('th', null, '기초미션'), h('th', null, '1인1역'), h('th', null, '남은 과제'), h('th', null, '결석'))),
            h('tbody', null, ...rows.map(row)))),
        h('p', { class: 'muted small' }, '1인1역 칸: 요청중이면 ‘승인’, 학생이 안 눌렀어도 하는 걸 봤으면 ‘완료 처리’로 포인트를 줘요. 결석을 누르면 그날은 1인1역 완료율과 살핌판 계산에서 빠지고, 위 숫자에서도 빠져요. 한 번 더 누르면 취소돼요.'),
      ),
    );
  }

  await load();
  draw();
}
