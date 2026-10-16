// 보안 규칙 시험용 도우미: 에뮬레이터 연결, 시험 데이터, 학생 로그인
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '../js/common/defaults.js';

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: 'demo-class-app',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
}

// 규칙과 같은 방식으로 한국 날짜 계산
function kst() { return new Date(Date.now() + 9 * 3600 * 1000); }
function ymd(d) {
  return String(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
}
export function today() { return ymd(kst()); }
export function weekId() {
  const d = kst();
  const dow = (d.getUTCDay() + 6) % 7; // 월요일 0
  return ymd(new Date(d.getTime() - dow * 86400000));
}
export function isWeekday() { return ((kst().getUTCDay() + 6) % 7) < 5; }

const emptyEquip = { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };

// 시험 데이터: 학생 s1(1번), s2(2번, 1인1역 확인 담당), s3(3번)
export async function seed(env, { wallet = 20 } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);
    await put('teachers/t1', {});
    await put('settings/main', { ...DEFAULT_SETTINGS, mission: { perDay: 5, units: ['u1'] } });
    await put('settings/teacher', { care: {} });
    for (const [n, sid] of [['1', 's1'], ['2', 's2'], ['3', 's3']]) {
      await put(`students/${sid}`, { number: Number(n), name: `학생${n}`, active: true });
      await put(`numbers/${n}`, { sid });
      await put(`studentPins/${n}`, { pin: `${n}${n}${n}${n}`, sid });
      await put(`summaries/${sid}`, { wallet, total: wallet, lastTx: '', reading: 0, missionDays: 0, roleDays: 0 });
      await put(`profiles/${sid}`, { equip: emptyEquip, title: null, awarded: ['최고 도우미'] });
    }
    for (let i = 1; i <= 6; i++) await put(`missionKeys/q${i}`, { unit: 'u1', answers: ['3/4'] });
    await put('missionKeys/qx', { unit: 'other', answers: ['1'] });
    await put('roles/r1', { name: '칠판', desc: '', members: ['s1'], checker: 's2', points: 4 });
    await put('roleTerms/term1', { wishOpen: true });
    await put('roleTerms/term2', { wishOpen: false });
    await put('tasks/k1', { kind: 'homework', title: '수학', targets: ['s1'], points: 5 });
    await put('tasks/k2', { kind: 'homework', title: '국어', targets: ['s2'], points: 5 });
    await put('shopItems/c1', { name: '자유자리권', price: 5, instant: true, buyLimit: 2, buyPeriod: 'week', dailyUse: 1, onSale: true });
    await put('shopItems/c2', { name: '간식권', price: 20, instant: false, buyLimit: 0, buyPeriod: 'none', dailyUse: 0, onSale: true });
    await put('items/hairBasic', { category: 'hair', name: '기본 머리', prices: { black: 0, brown: 5 }, onSale: true, starter: true });
    await put('items/crown', { category: 'headAcc', name: '왕관', prices: { gold: 15 }, onSale: true, starter: false });
    await put('goals/g1', { title: '영화', target: 20, reward: '영화', raised: 0, donors: 0, status: 'open', lastTx: '' });
    await put('messages/m1', { to: 's1', body: '안녕', from: 't1', at: new Date(), readAt: null });
  });
}

// 학생 로그인(익명 + PIN 세션). 성공하면 학생용 db를 돌려준다.
export async function login(env, number, pin = `${number}${number}${number}${number}`) {
  const uid = `anon-${number}-${Math.random().toString(36).slice(2, 8)}`;
  const db = env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await setDoc(doc(db, `sessions/${uid}`), {
    number, sid: `s${number}`, pin, at: serverTimestamp(),
  });
  return db;
}

export function teacher(env) {
  return env.authenticatedContext('t1', { firebase: { sign_in_provider: 'google.com' } }).firestore();
}
