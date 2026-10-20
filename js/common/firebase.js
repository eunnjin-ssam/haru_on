// Firebase 초기화. 다른 모듈은 여기서 app, auth, db를 가져다 쓴다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// 내 컴퓨터에서 주소 끝에 ?emu 를 붙이면 에뮬레이터(시험용 가짜 Firebase)에 연결한다.
export const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).has('emu');

// 학생 화면과 선생님 화면이 같은 주소에 있어서, 로그인 정보를 따로 보관해야 서로 덮어쓰지 않는다.
// (예전엔 같은 브라우저에서 학생 화면을 열면 선생님 Google 로그인이 익명 로그인으로 바뀌어
//  선생님 화면에 '불러오지 못했어요'가 떴다.) Firebase는 앱 이름마다 로그인을 따로 저장한다.
const isTeacherPage = /\/(teacher|board)(\.html)?$/.test(location.pathname);
export const app = initializeApp(
  useEmulator ? { ...firebaseConfig, projectId: 'demo-class-app' } : firebaseConfig,
  isTeacherPage ? '[DEFAULT]' : 'student',
);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
