// 에뮬레이터에 손으로 시험해 볼 데이터를 넣는다(규칙 우회). 실행 전 `npm run emu` 가 떠 있어야 한다.
//   node tools/seed-emu.mjs
// 학생 1번(PIN 1111), 2번(PIN 2222), 1인1역 '우유 당번'(담당 1번, 확인 담당 2번), 기초미션 샘플 문제은행과 단원.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { DEFAULT_SETTINGS, DEFAULT_TEACHER_SETTINGS } from '../js/common/defaults.js';

const bank = JSON.parse(readFileSync('data/math-sample.json', 'utf8'));
const units = [...new Set(bank.map((q) => q.unit))];
const emptyEquip = { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };

const env = await initializeTestEnvironment({
  projectId: 'demo-class-app',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const put = (path, data) => setDoc(doc(db, path), data);

  await put('settings/main', { ...DEFAULT_SETTINGS, mission: { perDay: 5, units } });
  await put('settings/teacher', DEFAULT_TEACHER_SETTINGS);

  for (const [n, sid, name] of [['1', 's1', '김하늘'], ['2', 's2', '이바다']]) {
    await put(`students/${sid}`, { number: Number(n), name, active: true });
    await put(`numbers/${n}`, { sid });
    await put(`studentPins/${n}`, { pin: `${n}${n}${n}${n}`, sid });
    await put(`summaries/${sid}`, { wallet: 0, total: 0, lastTx: '', reading: 0, missionDays: 0, roleDays: 0 });
    await put(`profiles/${sid}`, { equip: emptyEquip, title: null, awarded: [] });
  }

  for (const q of bank) {
    const { answers, ...rest } = q;
    await put(`missionQuestions/${q.id}`, rest);
    await put(`missionKeys/${q.id}`, { unit: q.unit, answers });
  }

  await put('roles/r1', { name: '우유 당번', desc: '우유를 나눠 줘요', members: ['s1'], checker: 's2', points: 4 });
});

await env.cleanup();
console.log(`시드 완료: 학생 1번(1111)·2번(2222), 단원 ${units.length}개, 문제 ${bank.length}개, 역할 '우유 당번'`);
