// 1인1역 2주 교체: 기간(roleTerms) 만들기 → 희망 받기(roleWishes 1~3지망) → 자동 배정 → 조정 → 확정 → 시작일에 적용.
// 적용은 Cloud Functions 없이, 선생님 화면을 열 때 시작일이 된 확정 기간을 roles에 반영한다(ensureRoleTerms).
import {
  collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { todayId, addDaysId, dowOfId } from '../common/dates.js';

// roleTerms/{id}: start, end('YYYYMMDD'), wishOpen, status(wish/assigned/confirmed/applied),
//   plan {sid: roleId}, ranks {sid: 0~3}, checkers {roleId: sid}, prev(적용 전 역할 기록), appliedAt
export async function loadTerms() {
  const snap = await getDocs(collection(db, 'roleTerms'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.start)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// 지금 적용 중인 기간(적용된 것 중 가장 늦게 시작하는 것. ‘지금 바로 적용’으로 일찍 바꿨어도 이것)
export const currentTerm = (terms) => terms.filter((t) => t.status === 'applied').at(-1) ?? null;
// 다음 기간(아직 적용 안 된 것)
export const nextTerm = (terms) => terms.find((t) => t.status !== 'applied') ?? null;

// 다음 월요일(오늘이 월요일이면 다음 주 월요일)
export function nextMonday(from = todayId()) {
  const dow = dowOfId(from);
  return addDaysId(from, 8 - dow);
}
// 2주 기간: 월요일 시작, 둘째 주 금요일 끝
export const twoWeeksFrom = (start) => ({ start, end: addDaysId(start, 11) });

// 끝나기 며칠 전인지(지났으면 음수)
export const daysLeft = (term, today = todayId()) => {
  const p = (id) => Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8));
  return Math.round((p(term.end) - p(today)) / 86400000);
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 자동 배정
//  - 역할마다 자리 수 = 지금 담당 수(최소 1, 최대 2)
//  - 지난 기간에 2·3지망을 받은 학생 먼저(3지망이 더 먼저), 나머지는 무작위 순서
//  - 1지망 → 2지망 → 3지망 차례로 돌며 빈자리에 넣는다. 지금 하는 역할은 연속으로 맡지 않는다
//  - 희망을 안 냈거나 못 들어간 학생은 남은 역할에(가능하면 지금 역할 피해서)
//  - 확인 담당: 그 역할을 맡지 않은 학생 중 확인 담당을 덜 맡은 학생
export function autoAssign({ students, roles, wishes, prevRanks = {} }) {
  const cap = new Map(roles.map((r) => [r.id, Math.min(2, Math.max(1, (r.members ?? []).length || 1))]));
  const nowRole = new Map();
  for (const r of roles) for (const sid of r.members ?? []) nowRole.set(sid, r.id);
  const order = [
    ...shuffle(students.filter((s) => prevRanks[s.sid] === 3)),
    ...shuffle(students.filter((s) => prevRanks[s.sid] === 2)),
    ...shuffle(students.filter((s) => prevRanks[s.sid] !== 2 && prevRanks[s.sid] !== 3)),
  ].map((s) => s.sid);
  const plan = {}; const ranks = {};
  const take = (sid, rid, rank) => { plan[sid] = rid; ranks[sid] = rank; cap.set(rid, cap.get(rid) - 1); };
  for (let k = 0; k < 3; k++) {
    for (const sid of order) {
      if (plan[sid]) continue;
      const rid = wishes[sid]?.[k];
      if (rid && cap.get(rid) > 0 && rid !== nowRole.get(sid)) take(sid, rid, k + 1);
    }
  }
  for (const sid of order) {
    if (plan[sid]) continue;
    const open = shuffle(roles.filter((r) => cap.get(r.id) > 0));
    const pick = open.find((r) => r.id !== nowRole.get(sid)) ?? open[0];
    if (pick) take(sid, pick.id, 0);
  }
  return { plan, ranks, checkers: pickCheckers(students, roles, plan) };
}

export function pickCheckers(students, roles, plan) {
  const load = new Map(students.map((s) => [s.sid, 0]));
  const checkers = {};
  for (const r of shuffle(roles)) {
    const members = students.filter((s) => plan[s.sid] === r.id).map((s) => s.sid);
    if (!members.length) continue;
    const cands = shuffle(students.map((s) => s.sid).filter((sid) => !members.includes(sid)))
      .sort((a, b) => load.get(a) - load.get(b));
    if (cands[0]) { checkers[r.id] = cands[0]; load.set(cands[0], load.get(cands[0]) + 1); }
  }
  return checkers;
}

// 배정 요약: '1지망 18명 · 2지망 5명 · 3지망 1명 · 남은 역할 1명 · 못 맡음 0명'
export function summary(students, plan, ranks) {
  const c = [0, 0, 0, 0]; let none = 0;
  for (const s of students) { if (!plan[s.sid]) none += 1; else c[ranks[s.sid] ?? 0] += 1; }
  return `1지망 ${c[1]}명 · 2지망 ${c[2]}명 · 3지망 ${c[3]}명 · 남은 역할 ${c[0]}명${none ? ` · 못 맡음 ${none}명` : ''}`;
}

// 확정한 기간을 역할에 반영(이전 담당은 기간 문서에 남긴다)
export async function applyTerm(term, roles) {
  const b = writeBatch(db);
  const prev = roles.map((r) => ({ id: r.id, name: r.name, members: r.members ?? [], checker: r.checker ?? '' }));
  for (const r of roles) {
    const members = Object.entries(term.plan ?? {}).filter(([, rid]) => rid === r.id).map(([sid]) => sid);
    b.update(doc(db, 'roles', r.id), { members, checker: term.checkers?.[r.id] ?? r.checker ?? '' });
  }
  b.update(doc(db, 'roleTerms', term.id), { status: 'applied', wishOpen: false, prev, appliedAt: serverTimestamp() });
  await b.commit();
}

// 선생님 화면을 열 때: 시작일이 된 확정 기간을 적용한다. 적용했으면 true
export async function ensureRoleTerms() {
  const terms = await loadTerms();
  const due = terms.filter((t) => t.status === 'confirmed' && t.start <= todayId());
  if (!due.length) return false;
  const roles = (await getDocs(collection(db, 'roles'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  for (const t of due) await applyTerm(t, roles);
  return true;
}
