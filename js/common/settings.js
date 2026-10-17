// settings/main 문서를 읽어 둔다. 포인트 값, 메뉴·화폐 이름, 칭호 기준 등은
// 하드코딩하지 않고 모두 여기서 읽는다. 한 화면 안에서는 한 번만 읽고 재사용한다.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from './firebase.js';

let cached = null;

export async function loadSettings() {
  if (cached) return cached;
  const snap = await getDoc(doc(db, 'settings', 'main'));
  if (!snap.exists()) throw new Error('settings/main 문서가 없어요. 선생님 화면에서 기본 설정을 먼저 저장해 주세요.');
  cached = snap.data();
  return cached;
}
