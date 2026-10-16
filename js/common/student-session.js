// 학생 로그인: 익명 로그인 → 번호표로 학생ID 확인 → PIN과 함께 세션 문서 만들기.
// PIN 대조는 보안 규칙이 서버에서 한다(firestore.rules의 sessionOK).
import { signInAnonymously, signOut } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

export class LoginError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// 지금 로그인된 학생 { sid, number, name } 또는 null
export async function currentStudent() {
  const user = auth.currentUser;
  if (!user || !user.isAnonymous) return null;
  const session = await getDoc(doc(db, 'sessions', user.uid)).catch(() => null);
  if (!session?.exists()) return null;
  const { sid } = session.data();
  const student = await getDoc(doc(db, 'students', sid));
  return { sid, ...student.data() };
}

export async function loginStudent(number, pin) {
  const num = String(Number(number));
  if (!auth.currentUser || !auth.currentUser.isAnonymous) await signInAnonymously(auth);
  const sessionRef = doc(db, 'sessions', auth.currentUser.uid);

  const entry = await getDoc(doc(db, 'numbers', num));
  if (!entry.exists()) throw new LoginError('no-number');

  await deleteDoc(sessionRef); // 이 기기의 이전 세션 정리
  try {
    await setDoc(sessionRef, { number: num, sid: entry.data().sid, pin, at: serverTimestamp() });
  } catch (e) {
    if (e.code === 'permission-denied') throw new LoginError('wrong-pin');
    throw e;
  }
  return currentStudent();
}

export async function logoutStudent() {
  const user = auth.currentUser;
  if (user) await deleteDoc(doc(db, 'sessions', user.uid)).catch(() => {});
  await signOut(auth);
}
