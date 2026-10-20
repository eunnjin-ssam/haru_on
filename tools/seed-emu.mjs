// 에뮬레이터에 손으로 시험해 볼 데이터를 넣는다(규칙 우회). 실행 전 `npm run emu` 가 떠 있어야 한다.
//   node tools/seed-emu.mjs
// 학생 1번(PIN 1111), 2번(PIN 2222), 1인1역 '우유 당번'(담당 1번, 확인 담당 2번), 기초미션 샘플 문제은행과 단원.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { DEFAULT_SETTINGS, DEFAULT_TEACHER_SETTINGS } from '../js/common/defaults.js';
import { CATALOG } from '../js/character/catalog.js';

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

  // 상점 기본 쿠폰
  const shop = [
    ['prep', '준비물 대여권', '준비물을 빌려줘요', 10, true, 2, 'week', 0],
    ['lunch', '급식 먼저 먹기권', '급식을 먼저 먹어요', 30, false, 0, 'none', 1],
    ['snack', '간식권', '간식을 먹어요', 35, false, 1, 'week', 0],
    ['seat', '자유자리권', '자리를 바꿔 앉아요', 40, false, 0, 'none', 3],
    ['nohw', '숙제면제권', '숙제를 한 번 면제해요', 70, false, 1, 'month', 0],
  ];
  let order = 0;
  for (const [id, name, desc, price, instant, buyLimit, buyPeriod, dailyUse] of shop) {
    await put(`shopItems/${id}`, { name, desc, price, instant, buyLimit, buyPeriod, dailyUse, onSale: true, order: order++ });
  }

  // 공동 목표
  await put('goals/g1', { title: '학급 보드게임 사기', target: 100, reward: '다 같이 보드게임!', raised: 0, donors: 0, status: 'open', lastTx: '' });

  // 캐릭터 아이템(Firestore 메타: 가격·판매 여부)
  for (const [id, it] of Object.entries(CATALOG)) {
    await put(`items/${id}`, { category: it.category, name: it.name, prices: it.prices, onSale: true, starter: !!it.starter });
  }
});

await env.cleanup();
console.log(`시드 완료: 학생 1번(1111)·2번(2222), 단원 ${units.length}개, 문제 ${bank.length}개, 역할 '우유 당번'`);
