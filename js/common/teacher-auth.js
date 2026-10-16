// 교사 로그인: Google 계정 + teachers 명단 확인
import { GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

export async function signInTeacher() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutTeacher() {
  await signOut(auth);
}

// teachers 명단에 있는 계정인지
export async function isTeacher(user) {
  if (!user || user.isAnonymous) return false;
  try {
    return (await getDoc(doc(db, 'teachers', user.uid))).exists();
  } catch {
    return false;
  }
}
