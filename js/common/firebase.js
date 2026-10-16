// Firebase 초기화. 다른 모듈은 여기서 app, auth, db를 가져다 쓴다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// 내 컴퓨터에서 주소 끝에 ?emu 를 붙이면 에뮬레이터(시험용 가짜 Firebase)에 연결한다.
export const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).has('emu');

export const app = initializeApp(useEmulator ? { ...firebaseConfig, projectId: 'demo-class-app' } : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
