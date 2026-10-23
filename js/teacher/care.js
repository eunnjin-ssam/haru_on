// 살핌판: 자기관리 현황 표(살펴볼 점: 마음·과제·활동·갑작스러운 변화, 열 눌러 정렬, 이름 눌러 2주 상세·메모)
// + 쪽지/포인트(지급·지급취소·차감). 기준은 settings/teacher.care. 학생에게 보이지 않음.
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { weekInfo, todayId } from '../common/dates.js';
import { MOODS, moodLabel } from '../student/mood.js';
import { isShown, excusedFor, isExpiredRepeat } from '../common/task-visible.js';
import { DEFAULT_TEACHER_SETTINGS } from '../common/defaults.js';

const NEG = ['upset', 'angry', 'tired'];
const moodEmoji = (id) => (id === 'custom' ? '✏️' : MOODS.find((m) => m.id === id)?.emoji ?? '·');
const WD = ['월', '화', '수', '목', '금'];
const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
const md = (id) => `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}`;

export async function renderCare(root) {
  let data;
  const selected = new Set();
  let sortKey = 'number'; let sortDir = 1;

  async function load() {
    const today = todayId();
    const weeks = [weekInfo(0), weekInfo(1), weekInfo(2), weekInfo(3)]; // 이번 주, 1~3주 전
    const past = (days) => days.filter((d) => d <= today);
    const recent = past([...weeks[1].days, ...weeks[0].days]); // 최근 2주 평일(오늘까지)
    const last5 = recent.slice(-5);
    const closed = recent.filter((d) => d < today); // 끝난 날(오늘은 아직 진행 중이라 완료율에서 뺌)
    const [stuSnap, sumSnap, moodSnap, noteSnap, attSnap, subSnap, taskSnap, careSnap, tcfgSnap, cfgSnap, roleSnap, checkSnap, postSnap, absSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'summaries')),
      getDocs(collection(db, 'moods')),
      getDocs(collection(db, 'moodNotes')),
      getDocs(collection(db, 'missionAttempts')),
      getDocs(collection(db, 'submissions')),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'careNotes')),
      getDoc(doc(db, 'settings', 'teacher')),
      getDoc(doc(db, 'settings', 'main')),
      getDocs(collection(db, 'roles')),
      getDocs(collection(db, 'roleChecks')),
      getDocs(collection(db, 'posts')),
      getDocs(collection(db, 'attendance')),
    ]);
    const students = stuSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    const sums = new Map(sumSnap.docs.map((d) => [d.id, d.data()]));
    const care = new Map(careSnap.docs.map((d) => [d.id, d.data()]));
    const cfg = { ...DEFAULT_TEACHER_SETTINGS.care, ...(tcfgSnap.data()?.care ?? {}) };
    const main = cfgSnap.data() ?? {};
    const perDay = main.mission?.perDay ?? 5;
    const bonusDays = main.points?.bonusDays ?? 3;
    // 기본 설정에서 글마당 메뉴를 숨겼으면 글마당은 활동률에서 뺀다(학생이 쓸 수 없으니)
    const writingOn = !(main.hiddenMenus ?? []).includes('writing');

    // 학생별 날짜 → 값
    const by = () => new Map();
    const moodBy = by(); const noteBy = by(); const missBy = by(); const roleBy = by(); const postBy = by();
    const put = (m, sid, date, v) => { const o = m.get(sid) ?? {}; o[date] = v; m.set(sid, o); };
    for (const d of moodSnap.docs) { const m = d.data(); put(moodBy, m.sid, m.date, m.mood); }
    for (const d of noteSnap.docs) { const m = d.data(); put(noteBy, m.sid, m.date, m.text); }
    for (const d of attSnap.docs) {
      const a = d.data(); if (!('correct' in a)) continue;
      const o = missBy.get(a.sid) ?? {}; const c = o[a.date] ?? { n: 0, ok: 0 }; c.n += 1; if (a.correct) c.ok += 1; o[a.date] = c; missBy.set(a.sid, o);
    }
    for (const d of checkSnap.docs) { const c = d.data(); if (c.status === 'approved') put(roleBy, c.sid, c.date, true); }
    for (const d of postSnap.docs) { const p = d.data(); const date = d.id.slice(d.id.lastIndexOf('_') + 1); put(postBy, p.author, date, p.title ?? true); }
    // 결석한 날은 완료율 계산에서 뺀다(attendance/{날짜}.absent)
    const absentOn = new Map(absSnap.docs.map((d) => [d.id, new Set(d.data().absent ?? [])]));
    // 쉬는 날(공휴일·재량휴업일, attendance/{날짜}.noSchool)은 반 전체가 계산에서 빠진다
    const noSchool = new Set(absSnap.docs.filter((d) => d.data().noSchool === true).map((d) => d.id));
    const present = (sid, days) => days.filter((d) => !noSchool.has(d) && !absentOn.get(d)?.has(sid));
    const roleHolders = new Set(roleSnap.docs.flatMap((d) => d.data().members ?? []));

    const subs = new Map(subSnap.docs.map((d) => [d.id, d.data()]));
    const tasks = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.kind === 'homework' && isShown(t));
    const since2w = Date.now() - 14 * 86400000;

    // 그날 할 일 완료율(기초미션 + 1인1역이 있으면 1인1역)
    const dayRate = (sid, date) => {
      const parts = [(missBy.get(sid)?.[date]?.n ?? 0) >= perDay ? 1 : 0];
      if (roleHolders.has(sid)) parts.push(roleBy.get(sid)?.[date] ? 1 : 0);
      return parts.reduce((a, b) => a + b, 0) / parts.length;
    };
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const rows = students.map((s) => {
      const mp = moodBy.get(s.sid) ?? {};
      const mi = missBy.get(s.sid) ?? {};
      const graded = recent.reduce((n, d) => n + (mi[d]?.n ?? 0), 0);
      const correct = recent.reduce((n, d) => n + (mi[d]?.ok ?? 0), 0);
      const myClosed = present(s.sid, closed);
      const partDays = myClosed.filter((d) => (mi[d]?.n ?? 0) >= perDay).length;
      const roleDays = myClosed.filter((d) => roleBy.get(s.sid)?.[d]).length;
      const writeDays = (w) => w.days.filter((d) => postBy.get(s.sid)?.[d]).length;
      // 활동률(최근 2주): 기초미션 참여일, 1인1역 완료일(맡은 역할이 있을 때), 글마당(주마다 보너스 기준 일수 대비)
      const comps = [partDays / Math.max(1, myClosed.length)];
      if (roleHolders.has(s.sid)) comps.push(roleDays / Math.max(1, myClosed.length));
      // 글마당은 주 단위라, 끝난 지난 두 주로 센다
      if (writingOn) comps.push((Math.min(writeDays(weeks[1]), bonusDays) + Math.min(writeDays(weeks[2]), bonusDays)) / (2 * bonusDays));
      const activity = avg(comps);
      // 갑작스러운 변화: 지난 3주 평균 vs 이번 주(이틀 이상 지났을 때)
      const thisDays = present(s.sid, past(weeks[0].days)).filter((d) => d < today || (mi[d]?.n ?? 0) >= perDay);
      const before = avg([1, 2, 3].flatMap((i) => present(s.sid, weeks[i].days).map((d) => dayRate(s.sid, d))));
      const now = thisDays.length >= 2 ? avg(thisDays.map((d) => dayRate(s.sid, d))) : null;

      const neg = last5.filter((d) => NEG.includes(mp[d])).length;
      const customN = last5.filter((d) => mp[d] === 'custom').length;
      // 과제가 올라온 날 결석했고 안 낸 과제는 남은 과제에서 뺀다
      const remaining = tasks.filter((t) => (t.targets ?? []).includes(s.sid) && !['done', 'exempt'].includes(subs.get(`${t.id}_${s.sid}`)?.status)
        && !(!subs.get(`${t.id}_${s.sid}`) && excusedFor(t, s.sid, absentOn))
        && !isExpiredRepeat(t, subs.get(`${t.id}_${s.sid}`))).length; // 지난 반복 과제는 안 셈
      const lateOrRedo = tasks.filter((t) => {
        const sub = subs.get(`${t.id}_${s.sid}`);
        if (!sub || !t.dueAt?.toMillis || t.dueAt.toMillis() < since2w) return false;
        const late = !t.repeat && sub.firstAt?.toMillis && sub.firstAt.toMillis() > t.dueAt.toMillis(); // 반복 과제는 늦음으로 안 셈
        return late || sub.status === 'redo';
      }).length;

      const flags = [];
      if (neg >= cfg.moodNegative) flags.push(`최근 ${last5.length}일 중 ${neg}일 마음이 힘들어 보여요`);
      if (customN >= cfg.customRepeat) flags.push(`기분을 직접 쓴 날이 ${customN}일`);
      if (remaining >= cfg.tasksLeft) flags.push(`남은 과제 ${remaining}개`);
      if (lateOrRedo >= cfg.lateRepeat) flags.push(`최근 2주 늦은 제출·다시 해오기 ${lateOrRedo}번`);
      if (activity != null && activity < cfg.activityRate) flags.push(`최근 2주 활동률 ${pct(activity)}`);
      if (before != null && now != null && before >= cfg.dropFrom && now <= cfg.dropTo) flags.push(`갑자기 줄었어요 (평소 ${pct(before)} → 이번 주 ${pct(now)})`);

      const cn = care.get(s.sid);
      return {
        ...s, summary: sums.get(s.sid) ?? {}, partDays, days: myClosed.length,
        rate: graded ? correct / graded : null, activity, remaining,
        recentMoods: weeks[0].days.map((dt) => mp[dt]), flags, memo: cn?.memo ?? '',
      };
    });
    data = { rows, recent, perDay, moodBy, noteBy, missBy, roleBy, postBy, roleHolders, tasks, subs, writingOn, noSchool, absentOn };
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  async function sendMessage(body) {
    const b = writeBatch(db);
    for (const sid of selected) b.set(doc(collection(db, 'messages')), { to: sid, body, from: 'teacher', at: serverTimestamp(), readAt: null });
    await b.commit();
  }
  // kind: give(지급) / cancel(지급취소) / deduct(차감)
  async function givePoints(kind, amount, reason) {
    const b = writeBatch(db);
    for (const sid of selected) {
      const txId = `${kind}_${sid}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const wallet = kind === 'give' ? amount : -amount;
      const total = kind === 'give' ? amount : (kind === 'cancel' ? -amount : 0);
      b.set(doc(db, 'points', txId), { sid, type: kind, wallet, total, reason, ref: '', by: 'teacher', at: serverTimestamp() });
      b.update(doc(db, 'summaries', sid), { wallet: increment(wallet), total: increment(total), lastTx: txId });
    }
    await b.commit();
  }

  const saveMemo = (sid, memo) => run(() => setDoc(doc(db, 'careNotes', sid), { memo }, { merge: true }), '메모를 저장했어요');

  // 이름 → 최근 2주 상세(날짜별 기분·기초미션·1인1역·글마당(숨기지 않았을 때)) + 남은 과제 + 메모
  function openDetail(r) {
    const d = data;
    const cells = d.recent.map((date) => {
      const mood = d.moodBy.get(r.sid)?.[date];
      const note = d.noteBy.get(r.sid)?.[date];
      const mi = d.missBy.get(r.sid)?.[date];
      const dow = WD[(new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8))).getUTCDay() + 6) % 7];
      return h('tr', { class: NEG.includes(mood) ? 'row-neg' : '' },
        h('td', null, `${md(date)} (${dow})`, d.noSchool.has(date) ? h('span', { class: 'badge skip', style: 'margin-left:6px' }, '쉬는 날') : null),
        h('td', null, mood ? `${moodEmoji(mood)} ${mood === 'custom' ? `“${note ?? ''}”` : moodLabel(mood)}` : h('span', { class: 'muted' }, '-')),
        h('td', null, mi ? `${mi.ok}/${mi.n}${mi.n >= d.perDay ? '' : ' (덜 풂)'}` : h('span', { class: 'muted' }, '-')),
        d.roleHolders.has(r.sid) ? h('td', null, d.roleBy.get(r.sid)?.[date] ? '✓' : h('span', { class: 'muted' }, '-')) : null,
        d.writingOn ? h('td', null, d.postBy.get(r.sid)?.[date] ? '✓' : h('span', { class: 'muted' }, '-')) : null);
    });
    const left = d.tasks.filter((t) => (t.targets ?? []).includes(r.sid) && !['done', 'exempt'].includes(d.subs.get(`${t.id}_${r.sid}`)?.status)
      && !(!d.subs.get(`${t.id}_${r.sid}`) && excusedFor(t, r.sid, d.absentOn))
      && !isExpiredRepeat(t, d.subs.get(`${t.id}_${r.sid}`)));
    const memo = h('input', { type: 'text', value: r.memo, placeholder: '메모 (선생님만 봐요)', style: 'flex:1' });
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box wide care-detail' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { style: 'margin:0' }, `${r.number}번 ${r.name} · 최근 2주`),
        h('button', { class: 'btn secondary small', onclick: () => dlg.remove() }, '닫기')),
      r.flags.length ? h('div', { class: 'ca-flags' }, ...r.flags.map((f) => h('span', { class: 'ca-flag' }, f))) : h('p', { class: 'empty-ok' }, '✅ 특별히 살펴볼 점은 없어요.'),
      h('p', { class: 'muted small', style: 'margin:0' }, `기초미션 참여 ${r.partDays}/${r.days}일 · 정답률 ${pct(r.rate)} · 활동률 ${pct(r.activity)} · 남은 과제 ${r.remaining}개`),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '날짜'), h('th', null, '기분'), h('th', null, '기초미션'),
          d.roleHolders.has(r.sid) ? h('th', null, '1인1역') : null, d.writingOn ? h('th', null, '글마당') : null)),
        h('tbody', null, ...cells))),
      left.length ? h('p', { class: 'muted small', style: 'margin:0' }, `남은 과제: ${left.map((t) => t.title).join(', ')}`) : null,
      h('div', { class: 'row' }, memo, h('button', { class: 'btn small', onclick: () => { dlg.remove(); saveMemo(r.sid, memo.value); } }, '메모 저장'))));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
    document.body.append(dlg);
  }

  function toolbar() {
    if (selected.size === 0) return null;
    const msg = h('input', { type: 'text', placeholder: '쪽지 내용', style: 'flex:1' });
    const amt = h('input', { type: 'number', min: '1', value: '5', style: 'width:70px' });
    const reason = h('input', { type: 'text', placeholder: '사유(필수)', style: 'flex:1' });
    const needReason = () => { if (!reason.value.trim()) { toast('사유를 써 주세요.', 'error'); return false; } return true; };
    const amount = () => Math.max(1, Number(amt.value) || 0);
    return h('section', { class: 'card care-toolbar' },
      h('h3', null, `${selected.size}명 선택됨`),
      h('div', { class: 'row' }, msg, h('button', { class: 'btn', onclick: () => { if (!msg.value.trim()) { toast('쪽지 내용을 써 주세요.', 'error'); return; } run(() => sendMessage(msg.value.trim()), '쪽지를 보냈어요'); } }, '쪽지 보내기')),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, '포인트'), amt, reason,
        h('button', { class: 'btn small', onclick: () => { if (needReason()) run(() => givePoints('give', amount(), reason.value.trim()), '지급했어요'); } }, '지급'),
        h('button', { class: 'btn secondary small', onclick: () => { if (needReason()) run(() => givePoints('cancel', amount(), reason.value.trim()), '지급 취소했어요'); } }, '지급 취소'),
        h('button', { class: 'btn danger small', onclick: () => { if (needReason()) run(() => givePoints('deduct', amount(), reason.value.trim()), '차감했어요'); } }, '차감')),
    );
  }

  // 열 제목 눌러 정렬(한 번 더 누르면 반대로)
  const COLS = [
    ['number', '번호', (r) => r.number], ['name', '이름', (r) => r.name],
    ['partDays', '기초미션', (r) => r.partDays], ['rate', '정답률', (r) => r.rate ?? -1],
    ['activity', '활동률', (r) => r.activity ?? -1], ['mood', '이번 주 기분', null],
    ['wallet', '지갑', (r) => r.summary.wallet ?? 0], ['total', '누적', (r) => r.summary.total ?? 0],
    ['flags', '살펴볼 점', (r) => r.flags.length],
  ];
  function sortedRows() {
    const get = COLS.find((c) => c[0] === sortKey)?.[2] ?? ((r) => r.number);
    return data.rows.slice().sort((a, b) => {
      const x = get(a); const y = get(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'ko') : x - y) * sortDir || a.number - b.number;
    });
  }

  function table() {
    // 전체 선택: 모두 골랐으면 체크, 일부만이면 '−'(중간 상태). 누르면 모두 고르기 ↔ 모두 풀기
    const allSids = data.rows.map((r) => r.sid);
    const picked = allSids.filter((sid) => selected.has(sid)).length;
    const all = h('input', { type: 'checkbox', title: '학생 모두 고르기', checked: allSids.length > 0 && picked === allSids.length, onchange: (e) => {
      if (e.target.checked) allSids.forEach((sid) => selected.add(sid)); else selected.clear();
      draw();
    } });
    all.indeterminate = picked > 0 && picked < allSids.length;
    const head = h('tr', null, h('th', null, all), ...COLS.map(([key, label, get]) => (get
      ? h('th', { class: 'sortable', onclick: () => { if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === 'number' || key === 'name' ? 1 : -1; } draw(); } },
        label, sortKey === key ? (sortDir > 0 ? ' ▲' : ' ▼') : '')
      : h('th', null, label))));
    return h('section', { class: 'card' }, h('h2', null, '자기관리 현황'),
      h('p', { class: 'muted small', style: 'margin:-2px 0 10px' }, `최근 2주 기초미션 참여·정답률·활동률(기초미션·1인1역${data.writingOn ? '·글마당' : ''})·기분·포인트와 살펴볼 점(기준은 기본 설정)이에요. 열 제목을 누르면 정렬, 이름을 누르면 2주 상세와 메모를 봐요.`),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, head),
        h('tbody', null, ...sortedRows().map((r) => h('tr', { class: r.flags.length ? 'flagged' : '' },
          h('td', null, h('input', { type: 'checkbox', checked: selected.has(r.sid), onchange: (e) => { if (e.target.checked) selected.add(r.sid); else selected.delete(r.sid); draw(); } })),
          h('td', { class: 'num' }, r.number),
          h('td', null, h('button', { class: 'linkish', title: '2주 상세 보기·메모', onclick: () => openDetail(r) }, r.name),
            r.memo ? h('span', { class: 'memo-mark', title: r.memo }, ' 📝') : null),
          h('td', null, `${r.partDays}/${r.days}일`), h('td', null, pct(r.rate)), h('td', null, pct(r.activity)),
          h('td', null, r.recentMoods.map((m) => (m ? moodEmoji(m) : '·')).join(' ')),
          h('td', { class: 'num' }, r.summary.wallet ?? 0), h('td', { class: 'num' }, r.summary.total ?? 0),
          h('td', null, r.flags.length ? h('div', { class: 'ca-flags' }, ...r.flags.map((f) => h('span', { class: 'ca-flag' }, f))) : h('span', { class: 'muted' }, '-')))))),
      ),
      h('p', { class: 'muted small' }, '체크해서 여러 명에게 한 번에 쪽지·포인트를 줄 수 있어요. 살핌판은 학생에게 보이지 않아요.'),
    );
  }

  function draw() { root.replaceChildren(...[toolbar(), table()].filter(Boolean)); }

  await load();
  draw();
}
