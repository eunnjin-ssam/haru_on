// 나의마당: 이번 주 내 상태(과제·포인트·기분·기초미션·글마당). 지난주 넘겨보기.
import {
  collection, doc, getDoc, getDocs, query, where,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h } from '../common/ui.js';
import { weekInfo, todayId } from '../common/dates.js';
import { MOODS } from './mood.js';
import { isShown, isExpiredRepeat } from '../common/task-visible.js';
import { loadAbsentDays, isAbsentTask } from './absent.js';

const moodEmoji = (id) => (id === 'custom' ? '✏️' : MOODS.find((m) => m.id === id)?.emoji ?? '');
const WD = ['월', '화', '수', '목', '금'];

export async function renderMyWeek(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const perDay = settings.mission.perDay;
  const bonusDays = settings.points.bonusDays;
  let offset = 0;
  let base;

  // 학생별로 안 바뀌는 것(과제·제출·전체 거래/풀이/글)은 한 번만 읽는다
  async function loadBase() {
    const [taskSnap, subSnap, ptSnap, attSnap, postSnap, absentDays] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', sid))),
      getDocs(query(collection(db, 'submissions'), where('sid', '==', sid))),
      getDocs(query(collection(db, 'points'), where('sid', '==', sid))),
      getDocs(query(collection(db, 'missionAttempts'), where('sid', '==', sid))),
      getDocs(query(collection(db, 'posts'), where('author', '==', sid))),
      loadAbsentDays(sid),
    ]);
    base = {
      tasks: taskSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.kind === 'homework' && isShown(t)),
      subs: new Map(subSnap.docs.map((d) => [d.id, d.data()])),
      points: ptSnap.docs.map((d) => d.data()),
      attempts: attSnap.docs.map((d) => d.data()),
      posts: postSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      absentDays,
    };
  }

  async function weekData() {
    const { week, days } = weekInfo(offset);
    const [moodSnaps, wkSnap] = await Promise.all([
      Promise.all(days.map((dt) => getDoc(doc(db, 'moods', `${sid}_${dt}`)).catch(() => null))),
      getDoc(doc(db, 'writingWeeks', `${sid}_${week}`)).catch(() => null),
    ]);
    const moods = days.map((_, i) => (moodSnaps[i]?.exists() ? moodSnaps[i].data().mood : null));
    const writingDays = wkSnap?.exists() ? (wkSnap.data().days ?? []) : [];
    return { week, days, moods, writingDays };
  }

  function pointsInWeek(days) {
    // 거래에는 날짜 필드가 없으니 at(타임스탬프)로 이번 주인지 가른다
    const start = Date.parse(`${days[0].slice(0, 4)}-${days[0].slice(4, 6)}-${days[0].slice(6, 8)}T00:00:00+09:00`);
    const end = start + 7 * 86400000;
    return base.points.filter((p) => { const t = p.at?.toMillis?.(); return t != null && t >= start && t < end; });
  }

  function taskCard() {
    const now = Date.now();
    // 결석한 날 올라온 과제(아직 안 냄)는 세지 않는다
    const tasks = base.tasks.filter((t) => !isAbsentTask(t, base.subs.get(`${t.id}_${sid}`), base.absentDays)
      && !isExpiredRepeat(t, base.subs.get(`${t.id}_${sid}`))); // 지난 반복 과제(안 냄)도 세지 않음
    const done = tasks.filter((t) => ['done', 'exempt'].includes(base.subs.get(`${t.id}_${sid}`)?.status)).length;
    const total = tasks.length;
    const left = tasks.filter((t) => !['done', 'exempt'].includes(base.subs.get(`${t.id}_${sid}`)?.status))
      .sort((a, b) => (a.dueAt?.toMillis?.() ?? Infinity) - (b.dueAt?.toMillis?.() ?? Infinity));
    return h('section', { class: 'card' }, h('h3', null, '과제'),
      h('p', null, `${total}개 중 ${done}개 완료`),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${total ? (done / total) * 100 : 0}%` })),
      left.length ? h('ul', { class: 'mw-list' }, ...left.map((t) => {
        const overdue = t.dueAt?.toMillis && t.dueAt.toMillis() < now;
        return h('li', { class: overdue ? 'overdue' : '' }, `${t.title}${overdue ? ' · 늦었어요' : ''}`);
      })) : h('p', { class: 'muted' }, '남은 과제가 없어요! 🎉'),
    );
  }

  // 포인트 내역: 날짜별로 묶어 최근 날짜가 위. 오늘은 펼쳐 두고 지난 날짜는 접어 둔다(눌러서 열기)
  function pointCard(days) {
    const pts = pointsInWeek(days).sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    const got = pts.filter((p) => p.wallet > 0).reduce((s, p) => s + p.wallet, 0);
    const spent = pts.filter((p) => p.wallet < 0).reduce((s, p) => s - p.wallet, 0);
    const byDay = new Map();
    for (const p of pts) { const d = todayId(p.at.toDate()); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(p); }
    const today = todayId();
    const dayLabel = (d) => {
      const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
      return `${+d.slice(4, 6)}월 ${+d.slice(6, 8)}일 (${'일월화수목금토'[dt.getUTCDay()]})${d === today ? ' · 오늘' : ''}`;
    };
    const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;
    const groups = [...byDay.entries()].map(([d, list]) => {
      const sum = list.reduce((s, p) => s + p.wallet, 0);
      return h('details', { class: 'pt-day', open: d === today },
        h('summary', null, h('span', null, dayLabel(d)), h('span', { class: sum >= 0 ? 'plus' : 'minus' }, signed(sum))),
        h('ul', { class: 'mw-list' }, ...list.map((p) => h('li', null,
          h('span', null, p.reason || p.type),
          h('span', { class: p.wallet >= 0 ? 'plus' : 'minus' }, signed(p.wallet))))));
    });
    return h('section', { class: 'card' }, h('h3', null, '포인트'),
      h('p', null, `받은 ${got} · 쓴 ${spent} ${currency}`),
      groups.length ? h('div', { class: 'pt-days' }, ...groups) : h('p', { class: 'muted' }, '이번 주 포인트 변화가 없어요.'),
    );
  }

  function moodCard(moods) {
    return h('section', { class: 'card' }, h('h3', null, '기분 흐름'),
      h('div', { class: 'mw-row' }, ...moods.map((m, i) => h('div', { class: 'mw-cell' },
        h('div', { class: 'wd' }, WD[i]), h('div', { class: 'em' }, m ? moodEmoji(m) : '·')))),
      h('p', { class: 'muted small' }, '기분은 나와 선생님만 봐요.'),
    );
  }

  function missionCard(days) {
    const byDay = new Map();
    for (const a of base.attempts) {
      if (!days.includes(a.date)) continue;
      const d = byDay.get(a.date) ?? { graded: 0, correct: 0 };
      if ('correct' in a) { d.graded += 1; if (a.correct) d.correct += 1; }
      byDay.set(a.date, d);
    }
    let graded = 0; let correct = 0;
    for (const d of byDay.values()) { graded += d.graded; correct += d.correct; }
    const rate = graded ? Math.round((correct / graded) * 100) : 0;
    return h('section', { class: 'card' }, h('h3', null, '기초미션'),
      h('div', { class: 'mw-row' }, ...days.map((dt, i) => {
        const done = (byDay.get(dt)?.graded ?? 0) >= perDay;
        return h('div', { class: 'mw-cell' }, h('div', { class: 'wd' }, WD[i]), h('div', { class: 'em' }, done ? '🟢' : '·'));
      })),
      h('p', { class: 'muted small' }, `이번 주 정답률 ${rate}%`),
    );
  }

  function writingCard(days, writingDays) {
    const start = Date.parse(`${days[0].slice(0, 4)}-${days[0].slice(4, 6)}-${days[0].slice(6, 8)}T00:00:00+09:00`);
    const end = start + 7 * 86400000;
    const posts = base.posts.filter((p) => { const t = p.at?.toMillis?.(); return t != null && t >= start && t < end; });
    const cnt = writingDays.filter((d) => days.includes(d)).length;
    return h('section', { class: 'card' }, h('h3', null, '글마당'),
      h('p', null, `주간 보너스: ${bonusDays}일 중 ${Math.min(cnt, bonusDays)}일`),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${Math.min(100, (cnt / bonusDays) * 100)}%` })),
      posts.length ? h('ul', { class: 'mw-list' }, ...posts.map((p) => h('li', null, `${p.title}${p.status !== 'public' ? ' (숨김)' : ''}`))) : h('p', { class: 'muted' }, '이번 주 쓴 글이 없어요.'),
    );
  }

  // '20261019'~'20261023' → '10월 19일(월) ~ 10월 23일(금)'
  const dayLabel = (dt) => `${Number(dt.slice(4, 6))}월 ${Number(dt.slice(6, 8))}일`;
  const weekRange = (days) => `${dayLabel(days[0])}(월) ~ ${dayLabel(days[days.length - 1])}(금)`;

  async function draw() {
    const wk = await weekData();
    const nav = h('div', { class: 'row' },
      h('button', { class: 'pill', onclick: () => { offset = Math.min(4, offset + 1); draw(); } }, '◀ 지난주'),
      offset > 0 ? h('button', { class: 'pill', onclick: () => { offset = Math.max(0, offset - 1); draw(); } }, '이번 주 ▶') : null);
    const head = h('div', { class: 'board-head' },
      h('div', null,
        h('div', { class: 'bh-title' }, offset === 0 ? '이번 주 나의마당' : (offset === 1 ? '지난 주 나의마당' : `${offset}주 전 나의마당`),
          h('span', { class: 'bh-range' }, weekRange(wk.days))),
        h('div', { class: 'bh-sub' }, '과제·포인트·기분·기초미션·글마당을 한눈에 봐요')),
      nav);
    content.replaceChildren(h('div', { class: 'myweek' },
      head,
      h('div', { class: 'feed-grid' },
        taskCard(),
        pointCard(wk.days),
        moodCard(wk.moods),
        missionCard(wk.days),
        writingCard(wk.days, wk.writingDays),
      ),
    ));
  }

  await loadBase();
  await draw();
}
