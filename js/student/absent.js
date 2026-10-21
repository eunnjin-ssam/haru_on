// 내가 결석한 날 목록(absences/{학생}.days, 선생님이 결석 표시할 때 생김).
// 결석한 날 올라온 과제는 안 내도 돼서 '결석'으로 보여 준다(아직 아무것도 안 냈을 때만).
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { postDayOf } from '../common/task-visible.js';

export async function loadAbsentDays(sid) {
  const snap = await getDoc(doc(db, 'absences', sid)).catch(() => null);
  return new Set(snap?.exists() ? snap.data().days ?? [] : []);
}

// sub: 이 과제의 내 제출 기록(없으면 undefined)
export const isAbsentTask = (t, sub, days) => !sub && days.has(postDayOf(t));
