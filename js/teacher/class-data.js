// 오늘 현황·체크판·살핌판이 함께 쓰는 큰 컬렉션(학생·과제·제출 기록·결석부).
// 예전엔 탭을 오갈 때마다 각자 처음부터 다시 읽어 Firestore 무료 한도(하루 읽기 5만)를 넘었다.
// 2분 동안은 읽은 것을 다시 쓰고, 그 탭에서 무언가를 바꾼 뒤에는 fresh로 새로 읽는다.
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { cached, forget, MIN } from '../common/read-cache.js';

const TTL = 2 * MIN;
const all = (name, fresh) => cached(`t:${name}`, () => getDocs(collection(db, name)), TTL, { fresh });

export const studentsSnap = (fresh = false) => all('students', fresh);
export const tasksSnap = (fresh = false) => all('tasks', fresh);
export const attendanceSnap = (fresh = false) => all('attendance', fresh);
// 제출 기록은 Map(문서 id → 내용)으로. 체크판이 칸을 누르면 그 과제 것만 이 Map에 고쳐 넣어
// 다른 탭도 바로 같은 내용을 본다.
export const subsMap = (fresh = false) => cached('t:submissions',
  async () => new Map((await getDocs(collection(db, 'submissions'))).docs.map((d) => [d.id, d.data()])), TTL, { fresh });

// 다른 화면에서 이 컬렉션을 바꿨을 때(학생 등록, 쉬는 날, 면제권 사용 등) 다음에 새로 읽게
export const forgetClass = (...names) => forget(...names.map((n) => `t:${n}`));
