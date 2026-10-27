// 반복 과제: taskRepeats 규칙(매일·요일)으로 tasks/{규칙id}_{날짜}를 미리 만든다.
// Cloud Functions 없이 돌리려고, 선생님 화면을 열 때마다 오늘부터 AHEAD일치를 채운다(이미 있으면 건너뜀).
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { todayId, addDaysId, dowOfId, kstDate } from '../common/dates.js';

export const AHEAD = 14;
const DOW = ['', '월', '화', '수', '목', '금', '토', '일'];

// 이 규칙에서 그 날짜에 과제가 생기는지
function occursOn(r, id) {
  if (id < r.startDate || (r.endDate && id > r.endDate) || (r.skip ?? []).includes(id)) return false;
  const days = r.mode === 'daily' ? [1, 2, 3, 4, 5] : (r.days ?? []);
  return days.includes(dowOfId(id));
}

export const whenText = (r) => (r.mode === 'daily' ? '매일(월~금)' : `매주 ${(r.days ?? []).slice().sort().map((d) => DOW[d]).join('·')}요일`);
export function ruleText(r) {
  const when = whenText(r);
  const show = r.leadDays ? `, ${r.leadDays}일 전부터 보임` : '';
  return `${when} ${r.dueTime}까지${show}`;
}

// 규칙 하나로 만들 과제 문서
function instance(r, id) {
  return {
    kind: r.kind, title: r.title, desc: r.desc ?? '', subject: r.subject ?? '',
    dueAt: Timestamp.fromDate(kstDate(id, r.dueTime)),
    showAt: Timestamp.fromDate(kstDate(addDaysId(id, -(r.leadDays ?? 0)), '00:00')),
    submitType: r.submitType ?? 'check', points: r.points ?? 0,
    targets: r.targets ?? [], notify: !!r.notify, repeatWeekly: false, repeat: r.id,
  };
}

// 켜져 있는 모든 규칙에 대해 오늘~AHEAD일 뒤 과제를 채운다. 만든 개수를 돌려준다.
export async function ensureRepeatTasks() {
  const repSnap = await getDocs(query(collection(db, 'taskRepeats'), where('active', '==', true)));
  if (repSnap.empty) return 0;
  const today = todayId();
  // 만들 차례인 날짜의 과제만 하나씩 있는지 본다(과제 전체를 읽으면 날이 갈수록 읽는 양이 는다)
  const want = [];
  for (const d of repSnap.docs) {
    const r = { id: d.id, ...d.data() };
    for (let i = 0; i < AHEAD; i++) {
      const id = addDaysId(today, i);
      if (occursOn(r, id)) want.push([`${r.id}_${id}`, r, id]);
    }
  }
  const have = await Promise.all(want.map(([tid]) => getDoc(doc(db, 'tasks', tid)).then((s) => s.exists())));
  const toMake = want.filter((_, i) => !have[i]).map(([tid, r, id]) => [tid, instance(r, id)]);
  for (let i = 0; i < toMake.length; i += 400) {
    const b = writeBatch(db);
    for (const [tid, data] of toMake.slice(i, i + 400)) b.set(doc(db, 'tasks', tid), data);
    await b.commit();
  }
  return toMake.length;
}
