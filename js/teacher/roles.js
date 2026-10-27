// 1인1역 관리: 오늘(상태·대신 승인, 결석 표시는 오늘 현황) / 기록(학생×요일·역할별 완료율·확인 담당 처리 속도) /
// 2주 교체(희망 받기 → 자동 배정 → 조정 → 확정) / 역할 설정(이름·하는 일·담당 2명·확인 담당·포인트).
import {
  collection, doc, getDocs, setDoc, deleteDoc, updateDoc, addDoc, writeBatch, increment, serverTimestamp, query, where,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, weekInfo } from '../common/dates.js';
import {
  loadTerms, currentTerm, nextTerm, nextMonday, twoWeeksFrom, daysLeft, autoAssign, pickCheckers, summary, applyTerm,
} from './role-terms.js';

const TABS = [['today', '오늘'], ['record', '기록'], ['term', '2주 교체'], ['setup', '역할 설정']];
const WD = ['월', '화', '수', '목', '금'];
const md = (id) => (id ? `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}` : '');
const toInput = (id) => (id ? `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}` : '');
const STATUS = { requested: ['요청중', 'role-req'], approved: ['완료', 'role-done'], redo: ['다시 해줘', 'role-todo'] };

let tab = 'today'; // 메뉴를 다시 열어도 보던 탭 유지

export async function renderRoles(root) {
  let students = []; let roles = []; let checks = []; let absent = new Map(); // date → Set(sid)
  let noSchool = new Set(); // 쉬는 날(공휴일·재량휴업일)
  let terms = []; let wishes = new Map(); // termId → Map(sid → picks)
  let editing = null; let weekOffset = 0;
  let draft = null; // 교체 조정 중인 { plan, ranks, checkers }

  // 1인1역 확인 기록은 하루 최대 반 인원만큼 쌓인다. 기록 탭이 보는 주(기본 최근 3주)부터만 읽고,
  // '◀ 지난주'로 더 앞을 보면 그때 그 주부터 다시 읽는다.
  let loadedSince = null;
  async function load() {
    loadedSince = weekInfo(Math.max(2, weekOffset)).days[0];
    const [sSnap, rSnap, cSnap, aSnap, wSnap] = await Promise.all([
      getDocs(collection(db, 'students')), getDocs(collection(db, 'roles')),
      getDocs(query(collection(db, 'roleChecks'), where('date', '>=', loadedSince))), getDocs(collection(db, 'attendance')), getDocs(collection(db, 'roleWishes')),
    ]);
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    roles = rSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ko'));
    checks = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    absent = new Map(aSnap.docs.map((d) => [d.id, new Set(d.data().absent ?? [])]));
    noSchool = new Set(aSnap.docs.filter((d) => d.data().noSchool === true).map((d) => d.id)); // 쉬는 날(반 전체)
    terms = await loadTerms();
    wishes = new Map();
    for (const d of wSnap.docs) {
      const w = d.data();
      const m = wishes.get(w.term) ?? new Map(); m.set(w.sid, w.picks ?? []); wishes.set(w.term, m);
    }
  }
  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('저장하지 못했어요.', 'error'); }
    await load(); draw();
  }

  const nameOf = (sid) => { const s = students.find((x) => x.sid === sid); return s ? `${s.number}번 ${s.name}` : '?'; };
  const short = (sid) => students.find((x) => x.sid === sid)?.name ?? '?';
  const roleName = (rid) => roles.find((r) => r.id === rid)?.name ?? '-';
  const isAbsent = (date, sid) => absent.get(date)?.has(sid) ?? false;
  const checkOf = (date, rid, sid) => checks.find((c) => c.date === date && c.role === rid && c.sid === sid);

  // ---- 공통 동작 ----
  function approveBatch(b, sid, role, checkId) {
    const txId = `role_${checkId}`;
    b.set(doc(db, 'points', txId), {
      sid, type: 'role', wallet: role.points, total: role.points,
      reason: `1인1역 ${role.name} (선생님 승인)`, ref: checkId, by: 'teacher', at: serverTimestamp(),
    });
    b.update(doc(db, 'summaries', sid), { wallet: increment(role.points), total: increment(role.points), roleDays: increment(1), lastTx: txId });
  }
  // 요청중 → 대신 승인 / 요청 없음 → 선생님이 바로 완료
  async function teacherApprove(role, sid) {
    const date = todayId(); const id = `${date}_${role.id}_${sid}`;
    const c = checkOf(date, role.id, sid);
    const b = writeBatch(db);
    if (c) b.update(doc(db, 'roleChecks', id), { status: 'approved', by: 'teacher', at: serverTimestamp() });
    else b.set(doc(db, 'roleChecks', id), { sid, role: role.id, date, status: 'approved', by: 'teacher', at: serverTimestamp() });
    approveBatch(b, sid, role, id);
    await b.commit();
  }

  // ---- 오늘 ----
  function todayTab() {
    const date = todayId();
    const rows = roles.flatMap((r) => (r.members ?? []).map((sid) => ({ r, sid })));
    const done = rows.filter(({ r, sid }) => checkOf(date, r.id, sid)?.status === 'approved').length;
    const abs = absent.get(date) ?? new Set();
    return [
      h('section', { class: 'card' },
        h('h2', null, `오늘 1인1역 (${done}/${rows.length})`),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '확인 담당이 결석했거나 확인을 못 했으면 선생님이 대신 승인해요. 결석한 학생은 완료율·기록에서 빠져요.'),
        rows.length === 0 ? h('p', { class: 'muted' }, '아직 역할이 없어요. ‘역할 설정’에서 만들어 주세요.')
          : h('div', { class: 'table-wrap' }, h('table', null,
            h('thead', null, h('tr', null, h('th', null, '역할'), h('th', null, '담당'), h('th', null, '확인 담당'), h('th', null, '상태'), h('th', null, ''))),
            h('tbody', null, ...rows.map(({ r, sid }) => {
              const c = checkOf(date, r.id, sid);
              const [label, cls] = isAbsent(date, sid) ? ['결석', 'muted'] : (STATUS[c?.status] ?? ['미완료', 'role-todo']);
              return h('tr', null,
                h('td', null, r.name), h('td', null, nameOf(sid)),
                h('td', null, nameOf(r.checker), isAbsent(date, r.checker) ? h('span', { class: 'badge skip', style: 'margin-left:6px' }, '결석') : null),
                h('td', { class: cls }, label),
                h('td', { class: 'actions' }, c?.status === 'approved' || isAbsent(date, sid) ? null
                  : h('button', { class: 'btn small', onclick: () => run(() => teacherApprove(r, sid), `${short(sid)} 완료 처리했어요 (+${r.points})`) }, c?.status === 'requested' ? '대신 승인' : '완료 처리')));
            }))))),
      h('p', { class: 'muted small', style: 'margin:0 2px' }, abs.size
        ? `오늘 결석 ${abs.size}명: ${[...abs].map(short).join(', ')} · 결석 표시는 ‘오늘 현황 → 학생별 현황’의 결석 버튼으로 해요.`
        : '결석 표시는 ‘오늘 현황 → 학생별 현황’의 결석 버튼으로 해요.'),
    ];
  }

  // ---- 기록 ----
  function recordTab() {
    const { days } = weekInfo(weekOffset);
    const today = todayId();
    const roleOf = new Map(); for (const r of roles) for (const sid of r.members ?? []) roleOf.set(sid, r);
    // 학생 × 요일
    const cell = (sid, date) => {
      if (date > today) return h('td', { class: 'cell off' }, '');
      if (noSchool.has(date)) return h('td', { class: 'cell off', title: '쉬는 날(공휴일·재량휴업일)' }, '쉼');
      if (isAbsent(date, sid)) return h('td', { class: 'cell', title: '결석' }, '결');
      const mine = checks.filter((c) => c.date === date && c.sid === sid);
      if (mine.some((c) => c.status === 'approved')) return h('td', { class: 'cell done' }, '✓');
      if (mine.some((c) => c.status === 'requested')) return h('td', { class: 'cell', title: '요청중' }, '…');
      if (mine.some((c) => c.status === 'redo')) return h('td', { class: 'cell redo-cell' }, '↺');
      return h('td', { class: 'cell' }, roleOf.has(sid) ? '·' : '');
    };
    // 역할별 완료율(지난 2주 + 이번 주, 오늘 제외, 결석·쉬는 날 뺌)
    const range = [...weekInfo(2).days, ...weekInfo(1).days, ...weekInfo(0).days].filter((d) => d < today && !noSchool.has(d));
    const roleRates = roles.map((r) => {
      let need = 0; let ok = 0;
      for (const d of range) for (const sid of r.members ?? []) {
        if (isAbsent(d, sid)) continue;
        need += 1; if (checkOf(d, r.id, sid)?.status === 'approved') ok += 1;
      }
      return { r, need, ok };
    });
    // 확인 담당 처리 속도: 요청 → 승인/다시 해줘까지(학생 확인 담당만, reqAt 있는 것)
    const speed = new Map();
    for (const c of checks) {
      if (!c.reqAt?.toMillis || !c.at?.toMillis || c.status === 'requested' || c.by === 'teacher') continue;
      const mins = (c.at.toMillis() - c.reqAt.toMillis()) / 60000;
      if (mins < 0) continue;
      const o = speed.get(c.by) ?? []; o.push(mins); speed.set(c.by, o);
    }
    const waiting = new Map(); // 지금 확인 대기 중인 수
    for (const c of checks.filter((x) => x.date === today && x.status === 'requested')) {
      const ck = roles.find((r) => r.id === c.role)?.checker; if (ck) waiting.set(ck, (waiting.get(ck) ?? 0) + 1);
    }
    const fmt = (m) => (m < 60 ? `${Math.round(m)}분` : `${(m / 60).toFixed(1)}시간`);
    const checkerRows = [...new Set(roles.map((r) => r.checker).filter(Boolean))].map((sid) => {
      const arr = speed.get(sid) ?? []; const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      return { sid, n: arr.length, avg, wait: waiting.get(sid) ?? 0 };
    });
    return [
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h2', null, `${weekOffset === 0 ? '이번 주' : `${weekOffset}주 전`} 1인1역 (${md(days[0])}~${md(days[4])})`),
          h('div', { class: 'row' },
            h('button', { class: 'btn secondary small', onclick: async () => { weekOffset += 1; if (weekInfo(weekOffset).days[0] < loadedSince) await load(); draw(); } }, '◀ 지난주'),
            weekOffset > 0 ? h('button', { class: 'btn secondary small', onclick: () => { weekOffset -= 1; draw(); } }, '다음 주 ▶') : null)),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '✓ 완료 · … 요청중 · ↺ 다시 해줘 · 결 결석 · 쉼 쉬는 날 · · 안 함'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'board' },
          h('thead', null, h('tr', null, h('th', { class: 'stick' }, '학생 · 역할'), ...WD.map((w, i) => h('th', null, `${w} ${md(days[i])}`)))),
          h('tbody', null, ...students.map((s) => h('tr', null,
            h('td', { class: 'stick' }, `${s.number} ${s.name}`, h('span', { class: 'muted small' }, roleOf.has(s.sid) ? ` · ${roleOf.get(s.sid).name}` : '')),
            ...days.map((d) => cell(s.sid, d)))))))),
      h('section', { class: 'card' },
        h('h2', null, '역할별 완료율'),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, `최근 3주(오늘 빼고 ${range.length}일) 기준이에요. 결석한 날과 쉬는 날(기본 설정)은 빼고 계산해요.`),
        roles.length === 0 ? h('p', { class: 'muted' }, '역할이 없어요.')
          : h('table', null, h('thead', null, h('tr', null, h('th', null, '역할'), h('th', null, '담당'), h('th', null, '완료'), h('th', null, '완료율'))),
            h('tbody', null, ...roleRates.map(({ r, need, ok }) => h('tr', null,
              h('td', null, r.name), h('td', null, (r.members ?? []).map(short).join(', ')),
              h('td', { class: 'num' }, `${ok}/${need}`),
              h('td', null, need ? h('div', { class: 'mini-bar' }, h('div', { style: `width:${Math.round((ok / need) * 100)}%` }), h('span', null, `${Math.round((ok / need) * 100)}%`)) : '-')))))),
      h('section', { class: 'card' },
        h('h2', null, '확인 담당 처리 속도'),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '친구가 ‘했어요’를 누른 뒤 확인 담당이 승인(또는 다시 해줘)하기까지 걸린 평균 시간이에요(최근 3주).'),
        checkerRows.length === 0 ? h('p', { class: 'muted' }, '확인 담당이 없어요.')
          : h('table', null, h('thead', null, h('tr', null, h('th', null, '확인 담당'), h('th', null, '처리한 수'), h('th', null, '평균 시간'), h('th', null, '지금 대기'))),
            h('tbody', null, ...checkerRows.map((x) => h('tr', null,
              h('td', null, nameOf(x.sid)), h('td', { class: 'num' }, x.n), h('td', null, x.avg == null ? '-' : fmt(x.avg)),
              h('td', { class: x.wait ? 'role-req' : 'muted' }, x.wait ? `${x.wait}건` : '0')))))),
    ];
  }

  // ---- 2주 교체 ----
  function termTab() {
    const cur = currentTerm(terms);
    const next = nextTerm(terms);
    const out = [];
    // 지금 기간
    out.push(h('section', { class: 'card' },
      h('h2', null, '지금 기간'),
      cur ? h('p', null, `${md(cur.start)} ~ ${md(cur.end)} · ${daysLeft(cur) >= 0 ? `끝나기까지 ${daysLeft(cur)}일` : '끝났어요'}`)
        : h('p', { class: 'muted' }, '아직 2주 기간을 쓰지 않았어요. 지금 역할은 ‘역할 설정’에서 정한 대로예요.'),
      cur && daysLeft(cur) <= 3 && !next ? h('p', { class: 'banner' }, '곧 끝나요. 다음 기간 희망 받기를 열까요?') : null,
      next ? null : h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: roles.length === 0, onclick: () => openNewTerm(cur) }, '+ 다음 기간 만들고 희망 받기'))));
    if (!next) {
      const past = terms.filter((t) => t.status === 'applied' && t.id !== cur?.id).reverse();
      if (past.length) out.push(h('section', { class: 'card' }, h('h2', null, '지난 기간 기록'),
        ...past.map((t) => h('details', null, h('summary', null, `${md(t.start)} ~ ${md(t.end)}`),
          h('ul', { class: 'term-log' }, ...roles.map((r) => {
            const members = Object.entries(t.plan ?? {}).filter(([, rid]) => rid === r.id).map(([sid]) => short(sid));
            return members.length ? h('li', null, `${r.name}: ${members.join(', ')} (확인 ${t.checkers?.[r.id] ? short(t.checkers[r.id]) : '-'})`) : null;
          }).filter(Boolean))))));
      return out;
    }
    // 다음 기간 진행
    const w = wishes.get(next.id) ?? new Map();
    const steps = [['wish', '1. 희망 받기'], ['assigned', '2. 배정·조정'], ['confirmed', '3. 확정']];
    const stepIdx = steps.findIndex(([k]) => k === next.status);
    out.push(h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', null, `다음 기간 ${md(next.start)} ~ ${md(next.end)}`),
        h('button', { class: 'btn danger small', onclick: () => { if (confirm('다음 기간을 지울까요? (받은 희망도 함께 지워요)')) run(() => deleteTerm(next), '지웠어요'); } }, '기간 지우기')),
      h('div', { class: 'steps' }, ...steps.map(([, l], i) => h('span', { class: `step${i === stepIdx ? ' on' : ''}${i < stepIdx ? ' done' : ''}` }, l))),
      next.status === 'wish' ? wishPanel(next, w) : null,
      next.status === 'assigned' ? assignPanel(next, w) : null,
      next.status === 'confirmed' ? h('div', null,
        h('p', null, `확정했어요. ${md(next.start)}부터 새 역할이 적용돼요(그날 선생님 화면을 열면 자동으로 바뀌어요).`),
        h('p', { class: 'muted small' }, summary(students, next.plan ?? {}, next.ranks ?? {})),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => { if (confirm('지금 바로 새 역할로 바꿀까요?')) run(() => applyTerm(next, roles), '새 역할로 바꿨어요'); } }, '지금 바로 적용'),
          h('button', { class: 'btn secondary', onclick: () => run(() => updateDoc(doc(db, 'roleTerms', next.id), { status: 'assigned' }), '다시 조정할 수 있어요') }, '다시 조정'))) : null));
    return out;
  }

  function openNewTerm(cur) {
    const start = cur ? (cur.end >= todayId() ? nextMonday(cur.end) : nextMonday()) : nextMonday();
    const s = h('input', { type: 'date', value: toInput(start) });
    const e = h('input', { type: 'date', value: toInput(twoWeeksFrom(start).end) });
    s.addEventListener('change', () => { e.value = toInput(twoWeeksFrom(s.value.replaceAll('-', '')).end); });
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, '다음 1인1역 기간'),
      h('p', { class: 'muted small', style: 'margin:0' }, '기간을 만들면 바로 학생 대시보드에 ‘희망 받기’가 열려요(1~3지망).'),
      h('div', { class: 'row' }, s, h('span', { class: 'muted' }, '~'), e),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => {
          const st = s.value.replaceAll('-', ''); const en = e.value.replaceAll('-', '');
          if (!st || !en || en < st) { toast('기간을 확인해 주세요.', 'error'); return; }
          dlg.remove();
          run(() => addDoc(collection(db, 'roleTerms'), { start: st, end: en, wishOpen: true, status: 'wish', createdAt: serverTimestamp() }), '희망 받기를 열었어요');
        } }, '만들고 희망 받기 열기'),
        h('button', { class: 'btn secondary', onclick: () => dlg.remove() }, '취소'))));
    document.body.append(dlg);
  }

  async function deleteTerm(t) {
    const b = writeBatch(db);
    for (const sid of (wishes.get(t.id) ?? new Map()).keys()) b.delete(doc(db, 'roleWishes', `${t.id}_${sid}`));
    b.delete(doc(db, 'roleTerms', t.id));
    await b.commit();
  }

  function prevRanksOf() { return currentTerm(terms)?.ranks ?? {}; }
  // 지난 기간에 희망을 낸 학생들(희망을 냈는데 못 받은 학생을 다음번에 먼저 배정하려고)
  function prevWishedOf() { return new Set((wishes.get(currentTerm(terms)?.id) ?? new Map()).keys()); }

  function wishPanel(t, w) {
    const missing = students.filter((s) => !w.has(s.sid));
    return h('div', null,
      h('p', null, `희망 낸 학생 ${w.size}/${students.length}명`),
      missing.length ? h('p', { class: 'muted small' }, `아직 안 낸 학생: ${missing.map((s) => s.name).join(', ')} — 안 내면 남은 역할을 맡아요.`) : null,
      w.size ? h('details', null, h('summary', { class: 'muted small' }, '받은 희망 보기'),
        h('ul', { class: 'term-log' }, ...[...w.entries()].map(([sid, picks]) => h('li', null, `${short(sid)}: ${picks.map((p, i) => `${i + 1}지망 ${roleName(p)}`).join(' · ')}`)))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => {
          if (missing.length && !confirm(`${missing.length}명이 아직 희망을 안 냈어요. 희망 받기를 닫고 자동 배정할까요?`)) return;
          const res = autoAssign({ students, roles, wishes: Object.fromEntries(w), prevRanks: prevRanksOf(), prevWished: prevWishedOf() });
          run(() => updateDoc(doc(db, 'roleTerms', t.id), { wishOpen: false, status: 'assigned', ...res }), '자동 배정했어요. 확인하고 고쳐 주세요');
        } }, '희망 받기 닫고 자동 배정')));
  }

  function assignPanel(t, w) {
    if (!draft || draft.id !== t.id) draft = { id: t.id, plan: { ...(t.plan ?? {}) }, ranks: { ...(t.ranks ?? {}) }, checkers: { ...(t.checkers ?? {}) } };
    const rankOf = (sid, rid) => { const i = (w.get(sid) ?? []).indexOf(rid); return i >= 0 ? i + 1 : 0; };
    const counts = new Map(roles.map((r) => [r.id, 0]));
    for (const rid of Object.values(draft.plan)) counts.set(rid, (counts.get(rid) ?? 0) + 1);
    const box = h('div');
    const rows = students.map((s) => {
      const sel = h('select', { onchange: (e) => {
        if (e.target.value) { draft.plan[s.sid] = e.target.value; draft.ranks[s.sid] = rankOf(s.sid, e.target.value); }
        else { delete draft.plan[s.sid]; delete draft.ranks[s.sid]; }
        draw();
      } }, h('option', { value: '' }, '(없음)'), ...roles.map((r) => h('option', { value: r.id, selected: draft.plan[s.sid] === r.id }, r.name)));
      const rk = draft.plan[s.sid] ? draft.ranks[s.sid] ?? 0 : null;
      const nowR = roles.find((r) => (r.members ?? []).includes(s.sid));
      return h('tr', null, h('td', null, `${s.number} ${s.name}`),
        h('td', { class: 'muted small' }, (w.get(s.sid) ?? []).map((p, i) => `${i + 1}.${roleName(p)}`).join(' ') || '희망 없음'),
        h('td', { class: 'muted small' }, nowR?.name ?? '-'),
        h('td', null, sel),
        h('td', null, rk == null ? h('span', { class: 'badge error' }, '없음') : h('span', { class: `badge${rk === 1 ? ' new' : ''}` }, rk ? `${rk}지망` : '남은 역할')),
        h('td', null, nowR && draft.plan[s.sid] === nowR.id ? h('span', { class: 'badge skip' }, '연속') : null));
    });
    const checkerRows = roles.map((r) => {
      const members = Object.entries(draft.plan).filter(([, rid]) => rid === r.id).map(([sid]) => sid);
      const sel = h('select', { onchange: (e) => { draft.checkers[r.id] = e.target.value; } },
        h('option', { value: '' }, '확인 담당'), ...students.filter((s) => !members.includes(s.sid)).map((s) => h('option', { value: s.sid, selected: draft.checkers[r.id] === s.sid }, `${s.number} ${s.name}`)));
      return h('tr', null, h('td', null, r.name), h('td', null, members.map(short).join(', ') || h('span', { class: 'muted' }, '비어 있음')),
        h('td', { class: counts.get(r.id) > 2 ? 'role-todo' : '' }, `${counts.get(r.id) ?? 0}명`), h('td', null, sel));
    });
    const seats = roles.reduce((n, r) => n + Math.min(2, Math.max(1, (r.members ?? []).length || 1)), 0);
    box.replaceChildren(
      h('p', { class: 'say' }, summary(students, draft.plan, draft.ranks)),
      seats < students.length ? h('p', { class: 'banner' }, `역할 자리(${seats}자리)가 학생 수(${students.length}명)보다 적어요. ‘역할 설정’에서 역할을 늘리거나 담당을 2명으로 해 주세요. 아래에서 직접 넣을 수도 있어요.`) : null,
      h('p', { class: 'muted small' }, '학생별 역할을 바꾸면 몇 지망인지 다시 계산돼요. ‘연속’은 지금과 같은 역할이에요.'),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '학생'), h('th', null, '희망'), h('th', null, '지금 역할'), h('th', null, '새 역할'), h('th', null, ''), h('th', null, ''))),
        h('tbody', null, ...rows))),
      h('h3', null, '역할별 담당·확인 담당'),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '역할'), h('th', null, '담당'), h('th', null, '인원'), h('th', null, '확인 담당'))),
        h('tbody', null, ...checkerRows))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn secondary', onclick: () => { draft.checkers = pickCheckers(students, roles, draft.plan); draw(); } }, '확인 담당 다시 고르기'),
        h('button', { class: 'btn secondary', onclick: () => {
          const res = autoAssign({ students, roles, wishes: Object.fromEntries(w), prevRanks: prevRanksOf(), prevWished: prevWishedOf() });
          draft = { id: t.id, ...res }; draw();
        } }, '처음부터 다시 배정'),
        h('button', { class: 'btn', onclick: () => {
          const bad = roles.filter((r) => (counts.get(r.id) ?? 0) > 0 && !draft.checkers[r.id]);
          if (bad.length) { toast(`확인 담당을 골라 주세요: ${bad.map((r) => r.name).join(', ')}`, 'error'); return; }
          if (!confirm(`이대로 확정할까요? ${md(t.start)}부터 새 역할이 적용돼요.`)) return;
          const { plan, ranks, checkers } = draft; draft = null;
          run(() => updateDoc(doc(db, 'roleTerms', t.id), { plan, ranks, checkers, status: 'confirmed' }), '확정했어요');
        } }, '확정')));
    return box;
  }

  // ---- 역할 설정 ----
  function form() {
    const cur = editing ? roles.find((r) => r.id === editing) : null;
    const name = h('input', { type: 'text', value: cur?.name ?? '', placeholder: '예) 우유 당번' });
    const desc = h('input', { type: 'text', value: cur?.desc ?? '', placeholder: '하는 일 (예) 우유를 나눠 줘요' });
    const points = h('input', { type: 'number', min: '0', value: String(cur?.points ?? 4), style: 'width:80px' });
    // 이미 다른 역할을 맡은 학생은 담당 목록에서 뺀다(고치는 중인 역할의 담당은 그대로 보임)
    const taken = new Set(roles.filter((r) => r.id !== editing).flatMap((r) => r.members ?? []));
    const memberBoxes = students.filter((s) => !taken.has(s.sid)).map((s) => {
      const cb = h('input', { type: 'checkbox', checked: cur?.members?.includes(s.sid) });
      return { sid: s.sid, cb, el: h('label', { class: 'pick' }, cb, `${s.number} ${s.name}`) };
    });
    const checker = h('select', null, h('option', { value: '' }, '확인 담당 고르기'),
      ...students.map((s) => h('option', { value: s.sid, selected: cur?.checker === s.sid }, `${s.number}번 ${s.name}`)));
    const save = h('button', { class: 'btn', onclick: () => {
      const members = memberBoxes.filter((m) => m.cb.checked).map((m) => m.sid);
      if (!name.value.trim()) { toast('역할 이름을 써 주세요.', 'error'); return; }
      if (members.length === 0) { toast('담당 학생을 1명 이상 골라 주세요.', 'error'); return; }
      if (members.length > 2) { toast('담당은 최대 2명이에요.', 'error'); return; }
      if (!checker.value) { toast('확인 담당을 골라 주세요.', 'error'); return; }
      if (members.includes(checker.value)) { toast('확인 담당은 담당 학생이 아닌 다른 친구로 골라 주세요.', 'error'); return; }
      const ref = editing ? doc(db, 'roles', editing) : doc(collection(db, 'roles'));
      editing = null;
      run(() => setDoc(ref, { name: name.value.trim(), desc: desc.value.trim(), members, checker: checker.value, points: Number(points.value) || 0 }),
        cur ? '역할을 고쳤어요' : '역할을 만들었어요');
    } }, editing ? '고치기' : '역할 만들기');
    return h('section', { class: 'card' },
      h('h2', null, editing ? '역할 고치기' : '역할 만들기'),
      students.length === 0 ? h('p', { class: 'muted' }, '먼저 학생 명단을 등록해 주세요.')
        : h('div', { class: 'role-form' },
          h('label', { class: 'field' }, h('span', null, '역할 이름'), name),
          h('label', { class: 'field' }, h('span', null, '하는 일'), desc),
          h('label', { class: 'field' }, h('span', null, '포인트'), points),
          h('div', { class: 'field' }, h('span', null, '담당 (최대 2명 — 2주 교체 때 이 인원만큼 배정해요)'), memberBoxes.length
            ? h('div', { class: 'picks' }, ...memberBoxes.map((m) => m.el))
            : h('p', { class: 'muted', style: 'margin:0' }, '모든 학생이 이미 다른 역할을 맡고 있어요. 위 표에서 다른 역할의 담당을 고친 뒤 골라 주세요.')),
          h('label', { class: 'field' }, h('span', null, '확인 담당'), checker),
          h('div', { class: 'row' }, save, editing ? h('button', { class: 'btn secondary', onclick: () => { editing = null; draw(); } }, '취소') : null)));
  }
  function setupTab() {
    return [
      h('section', { class: 'card' },
        h('h2', null, `역할 (${roles.length})`),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '담당 학생이 ‘했어요’를 누르면 확인 담당 친구(또는 선생님)가 승인하고 포인트를 줘요.'),
        roles.length === 0 ? h('p', { class: 'muted' }, '아직 만든 역할이 없어요. 아래에서 만들어 주세요.')
          : h('table', null,
            h('thead', null, h('tr', null, h('th', null, '역할'), h('th', null, '하는 일'), h('th', null, '담당'), h('th', null, '확인 담당'), h('th', null, '점수'), h('th', null, ''))),
            h('tbody', null, ...roles.map((r) => h('tr', null,
              h('td', null, r.name), h('td', { class: 'muted' }, r.desc || '-'),
              h('td', null, (r.members ?? []).map(nameOf).join(', ')), h('td', null, nameOf(r.checker)),
              h('td', { class: 'num' }, r.points),
              h('td', { class: 'actions' },
                h('button', { class: 'btn secondary small', onclick: () => { editing = r.id; draw(); } }, '고치기'),
                h('button', { class: 'btn danger small', onclick: () => { if (confirm(`'${r.name}' 역할을 지울까요?`)) run(() => deleteDoc(doc(db, 'roles', r.id)), '지웠어요'); } }, '지우기'))))))),
      form(),
    ];
  }

  function draw() {
    const next = nextTerm(terms);
    const tabs = h('div', { class: 'seg-tabs' }, ...TABS.map(([id, label]) => h('button', {
      class: `seg${tab === id ? ' on' : ''}`, onclick: () => { tab = id; draw(); },
    }, label, id === 'term' && next?.status === 'wish' ? h('span', { class: 'seg-dot' }, '●') : null)));
    const body = tab === 'today' ? todayTab() : tab === 'record' ? recordTab() : tab === 'term' ? termTab() : setupTab();
    root.replaceChildren(tabs, ...body.filter(Boolean));
  }

  await load();
  draw();
}
