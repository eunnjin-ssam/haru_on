// Firebase 초기화. 다른 모듈은 여기서 app, auth, db를 가져다 쓴다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
