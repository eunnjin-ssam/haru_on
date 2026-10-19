// 보안 규칙 자동 시험. 실행: npm run test:rules
import { describe, it, before, beforeEach, after } from 'node:test';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { makeEnv, seed, login, teacher, today, weekId, isWeekday } from './helpers.js';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });

const T = () => today();
const tx = (sid, type, wallet, total, ref, by = sid) =>
  ({ sid, type, wallet, total, reason: '', ref, by, at: serverTimestamp() });
// 거래 1줄 + 요약 변경을 한 묶음에 넣는다
function addTx(b, db, id, data, extra = {}) {
  b.set(doc(db, `points/${id}`), data);
  b.update(doc(db, `summaries/${data.sid}`), {
    wallet: increment(data.wallet), total: increment(data.total), lastTx: id, ...extra,
  });
}

// ---------------------------------------------------------------
describe('로그인', () => {
  it('맞는 PIN이면 세션이 만들어진다', async () => {
    await assertSucceeds(login(env, '1'));
  });
  it('틀린 PIN이면 거절된다', async () => {
    await assertFails(login(env, '1', '9999'));
  });
  it('다른 학생 번호에 내 PIN을 넣으면 거절된다', async () => {
    await assertFails(login(env, '2', '1111'));
  });
  it('구글 계정으로는 학생 세션을 만들 수 없다', async () => {
    const db = env.authenticatedContext('g1', { firebase: { sign_in_provider: 'google.com' } }).firestore();
    await assertFails(setDoc(doc(db, 'sessions/g1'), { number: '1', sid: 's1', pin: '1111', at: serverTimestamp() }));
  });
  it('로그인 전: 번호표 한 장은 읽고, 명단·PIN은 못 읽는다', async () => {
    const db = env.authenticatedContext('anon-x', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertSucceeds(getDoc(doc(db, 'numbers/1')));
    await assertFails(getDocs(collection(db, 'numbers')));
    await assertFails(getDoc(doc(db, 'students/s1')));
    await assertFails(getDoc(doc(db, 'studentPins/1')));
  });
  it('로그인한 학생도 PIN 명부와 교사 설정은 못 읽는다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(getDoc(doc(db, 'students/s2')));
    await assertFails(getDoc(doc(db, 'studentPins/1')));
    await assertFails(getDoc(doc(db, 'settings/teacher')));
    await assertSucceeds(getDoc(doc(db, 'settings/main')));
  });
});

// ---------------------------------------------------------------
describe('학생 PIN 바꾸기', () => {
  it('지금 PIN을 맞게 넣으면 새 PIN으로 바꾸고, 새 PIN으로 로그인된다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(updateDoc(doc(db, 'studentPins/1'), { pin: '4321', prev: '1111' }));
    await assertSucceeds(login(env, '1', '4321'));
    await assertFails(login(env, '1', '1111'));
  });
  it('지금 PIN이 틀리면 못 바꾼다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '4321', prev: '0000' }));
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '4321' }));
  });
  it('친구 PIN은 못 바꾼다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'studentPins/2'), { pin: '4321', prev: '2222' }));
  });
  it('4자리 숫자가 아니거나 같은 PIN이면 거절된다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '12a4', prev: '1111' }));
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '12345', prev: '1111' }));
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '1111', prev: '1111' }));
  });
  it('학생ID를 바꾸거나 다른 칸을 넣을 수 없고, 바꾼 뒤에도 PIN은 못 읽는다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '4321', prev: '1111', sid: 's2' }));
    await assertFails(updateDoc(doc(db, 'studentPins/1'), { pin: '4321', prev: '1111', x: 1 }));
    await assertSucceeds(updateDoc(doc(db, 'studentPins/1'), { pin: '4321', prev: '1111' }));
    await assertFails(getDoc(doc(db, 'studentPins/1')));
  });
});

// ---------------------------------------------------------------
describe('포인트 기본', () => {
  it('내 요약은 읽고, 친구 요약은 못 읽는다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(getDoc(doc(db, 'summaries/s1')));
    await assertFails(getDoc(doc(db, 'summaries/s2')));
  });
  it('거래 없이 지갑 숫자만 바꿀 수 없다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'summaries/s1'), { wallet: 999 }));
  });
  it('학생은 교사용 거래 종류를 만들 수 없다', async () => {
    const db = await login(env, '1');
    const b = writeBatch(db);
    addTx(b, db, 'grant_x', tx('s1', 'grant', 100, 100, 'x'));
    await assertFails(b.commit());
  });
  it('친구 지갑에 포인트를 넣을 수 없다', async () => {
    const db = await login(env, '1');
    const b = writeBatch(db);
    addTx(b, db, 'buy_x', tx('s2', 'buy', 100, 0, 'x'));
    await assertFails(b.commit());
  });
  it('교사도 거래 내역은 고칠 수 없다', async () => {
    const t = teacher(env);
    await assertSucceeds(setDoc(doc(t, 'points/grant_1'), tx('s1', 'grant', 3, 3, 'x', 't1')));
    await assertFails(updateDoc(doc(t, 'points/grant_1'), { wallet: 300 }));
    await assertSucceeds(deleteDoc(doc(t, 'points/grant_1')));
  });
});

// ---------------------------------------------------------------
describe('기초미션', () => {
  const aid = (n) => `s1_${T()}_${n}`;
  const attempt = (n, qid = `q${n}`, answer = '3/4') =>
    ({ sid: 's1', date: T(), n, qid, answer, at: serverTimestamp() });

  async function solve(db, n, answer, { withPoint } = {}) {
    await setDoc(doc(db, `missionAttempts/${aid(n)}`), attempt(n, `q${n}`, answer));
    const correct = answer === '3/4';
    const b = writeBatch(db);
    b.update(doc(db, `missionAttempts/${aid(n)}`), { correct });
    const extra = n === 5 ? { missionDays: increment(1) } : {};
    if (correct && withPoint !== false) {
      addTx(b, db, `mission_${aid(n)}`, tx('s1', 'mission', 1, 1, aid(n)), extra);
    } else if (n === 5) {
      b.update(doc(db, 'summaries/s1'), extra);
    }
    return b.commit();
  }

  it('정답을 맞히면 1점을 받는다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(solve(db, 1, '3/4'));
    const s = (await getDoc(doc(db, 'summaries/s1'))).data();
    if (s.wallet !== 21 || s.total !== 21) throw new Error('지갑 값이 틀림');
  });
  it('오답을 정답이라고 채점할 수 없다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, `missionAttempts/${aid(1)}`), attempt(1, 'q1', '1/2'));
    const b = writeBatch(db);
    b.update(doc(db, `missionAttempts/${aid(1)}`), { correct: true });
    addTx(b, db, `mission_${aid(1)}`, tx('s1', 'mission', 1, 1, aid(1)));
    await assertFails(b.commit());
  });
  it('정답이어도 1점이 아닌 금액은 거절된다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, `missionAttempts/${aid(1)}`), attempt(1));
    const b = writeBatch(db);
    b.update(doc(db, `missionAttempts/${aid(1)}`), { correct: true });
    addTx(b, db, `mission_${aid(1)}`, tx('s1', 'mission', 100, 100, aid(1)));
    await assertFails(b.commit());
  });
  it('제출한 답은 고칠 수 없다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, `missionAttempts/${aid(1)}`), attempt(1, 'q1', '1/2'));
    await assertFails(updateDoc(doc(db, `missionAttempts/${aid(1)}`), { answer: '3/4' }));
  });
  it('앞 문제를 채점하기 전에 다음 문제를 풀 수 없다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, `missionAttempts/${aid(1)}`), attempt(1));
    await assertFails(setDoc(doc(db, `missionAttempts/${aid(2)}`), attempt(2)));
  });
  it('같은 문제로 포인트를 두 번 받을 수 없다', async () => {
    const db = await login(env, '1');
    await solve(db, 1, '3/4');
    const b = writeBatch(db);
    addTx(b, db, `mission_${aid(1)}`, tx('s1', 'mission', 1, 1, aid(1)));
    await assertFails(b.commit());
  });
  it('6번째 문제는 없다', async () => {
    const db = await login(env, '1');
    for (let n = 1; n <= 5; n++) await solve(db, n, '3/4');
    await assertFails(setDoc(doc(db, `missionAttempts/${aid(6)}`), attempt(6)));
  });
  it('5문제를 다 풀면 참여일이 1 늘고, 4문제 정답이면 4점', async () => {
    const db = await login(env, '1');
    for (let n = 1; n <= 4; n++) await assertSucceeds(solve(db, n, '3/4'));
    await assertSucceeds(solve(db, 5, '1/2'));
    const s = (await getDoc(doc(db, 'summaries/s1'))).data();
    if (s.wallet !== 24 || s.missionDays !== 1) throw new Error(JSON.stringify(s));
  });
  it('5문제 전에는 참여일을 늘릴 수 없다', async () => {
    const db = await login(env, '1');
    await solve(db, 1, '3/4');
    await assertFails(updateDoc(doc(db, 'summaries/s1'), { missionDays: increment(1) }));
  });
  it('정답 금고는 못 읽고, 출제 범위 밖 문제는 못 푼다', async () => {
    const db = await login(env, '1');
    await assertFails(getDoc(doc(db, 'missionKeys/q1')));
    await assertFails(setDoc(doc(db, `missionAttempts/${aid(1)}`), attempt(1, 'qx', '1')));
  });
  it('친구의 풀이는 못 읽는다', async () => {
    const db1 = await login(env, '1');
    await solve(db1, 1, '3/4');
    const db2 = await login(env, '2');
    await assertFails(getDoc(doc(db2, `missionAttempts/${aid(1)}`)));
  });
});

// ---------------------------------------------------------------
describe('기분', () => {
  it('오늘 기분은 쓰고 다시 고를 수 있다', async () => {
    const db = await login(env, '1');
    const ref = doc(db, `moods/s1_${T()}`);
    await assertSucceeds(setDoc(ref, { sid: 's1', date: T(), mood: 'good', at: serverTimestamp() }));
    await assertSucceeds(setDoc(ref, { sid: 's1', date: T(), mood: 'tired', at: serverTimestamp() }));
  });
  it('다른 날짜의 기분은 쓸 수 없다', async () => {
    const db = await login(env, '1');
    await assertFails(setDoc(doc(db, 'moods/s1_20200101'),
      { sid: 's1', date: '20200101', mood: 'good', at: serverTimestamp() }));
  });
  it('직접 쓴 기분은 본인은 읽고 친구는 못 읽는다', async () => {
    const db1 = await login(env, '1');
    const id = `moodNotes/s1_${T()}`;
    await assertSucceeds(setDoc(doc(db1, id), { sid: 's1', date: T(), text: '속상해', at: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db1, id)));
    const db2 = await login(env, '2');
    await assertFails(getDoc(doc(db2, id)));
    await assertFails(getDoc(doc(db2, `moods/s1_${T()}`)));
  });
});

// ---------------------------------------------------------------
describe('1인1역', () => {
  const rid = () => `${T()}_r1_s1`;
  const request = (db) => setDoc(doc(db, `roleChecks/${rid()}`),
    { sid: 's1', role: 'r1', date: T(), status: 'requested', by: 's1', at: serverTimestamp() });
  function approve(db, by) {
    const b = writeBatch(db);
    b.update(doc(db, `roleChecks/${rid()}`), { status: 'approved', by, at: serverTimestamp() });
    addTx(b, db, `role_${rid()}`, tx('s1', 'role', 4, 4, rid(), by), { roleDays: increment(1) });
    return b.commit();
  }

  it('담당 학생은 요청하고, 확인 담당이 승인하면 4점', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(request(db1));
    const db2 = await login(env, '2');
    await assertSucceeds(approve(db2, 's2'));
    const s = (await getDoc(doc(teacher(env), 'summaries/s1'))).data();
    if (s.wallet !== 24 || s.roleDays !== 1) throw new Error(JSON.stringify(s));
  });
  it('요청 시각(reqAt)을 함께 쓸 수 있고, 승인해도 남는다', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(setDoc(doc(db1, `roleChecks/${rid()}`),
      { sid: 's1', role: 'r1', date: T(), status: 'requested', by: 's1', at: serverTimestamp(), reqAt: serverTimestamp() }));
    const db2 = await login(env, '2');
    await assertSucceeds(approve(db2, 's2'));
    const c = (await getDoc(doc(teacher(env), `roleChecks/${rid()}`))).data();
    if (!c.reqAt || c.status !== 'approved') throw new Error(JSON.stringify(c));
  });
  it('요청 시각을 꾸며 쓸 수 없다', async () => {
    const db1 = await login(env, '1');
    await assertFails(setDoc(doc(db1, `roleChecks/${rid()}`),
      { sid: 's1', role: 'r1', date: T(), status: 'requested', by: 's1', at: serverTimestamp(), reqAt: new Date(2020, 0, 1) }));
  });
  it('담당이 아닌 학생은 요청할 수 없다', async () => {
    const db3 = await login(env, '3');
    await assertFails(setDoc(doc(db3, `roleChecks/${T()}_r1_s3`),
      { sid: 's3', role: 'r1', date: T(), status: 'requested', by: 's3', at: serverTimestamp() }));
  });
  it('확인 담당이 아니면 승인할 수 없다 (본인 포함)', async () => {
    const db1 = await login(env, '1');
    await request(db1);
    await assertFails(approve(db1, 's1'));
    const db3 = await login(env, '3');
    await assertFails(approve(db3, 's3'));
  });
  it('확인 담당도 포인트 없이 승인만 하거나, 다른 금액을 줄 수 없다', async () => {
    const db1 = await login(env, '1');
    await request(db1);
    const db2 = await login(env, '2');
    await assertFails(updateDoc(doc(db2, `roleChecks/${rid()}`), { status: 'approved', by: 's2', at: serverTimestamp() }));
    const b = writeBatch(db2);
    b.update(doc(db2, `roleChecks/${rid()}`), { status: 'approved', by: 's2', at: serverTimestamp() });
    addTx(b, db2, `role_${rid()}`, tx('s1', 'role', 40, 40, rid(), 's2'));
    await assertFails(b.commit());
  });
  it('다시 해줘 → 다시 요청 → 승인', async () => {
    const db1 = await login(env, '1');
    await request(db1);
    const db2 = await login(env, '2');
    await assertSucceeds(updateDoc(doc(db2, `roleChecks/${rid()}`), { status: 'redo', by: 's2', at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db1, `roleChecks/${rid()}`), { status: 'requested', by: 's1', at: serverTimestamp() }));
    await assertSucceeds(approve(db2, 's2'));
  });
  it('희망은 받기 기간에만 낼 수 있다', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(setDoc(doc(db1, 'roleWishes/term1_s1'), { sid: 's1', term: 'term1', picks: ['r1'], at: serverTimestamp() }));
    await assertFails(setDoc(doc(db1, 'roleWishes/term2_s1'), { sid: 's1', term: 'term2', picks: ['r1'], at: serverTimestamp() }));
  });
});

// ---------------------------------------------------------------
describe('글마당', () => {
  const pid = () => `s1_${T()}`;
  const post = (author = 's1') => ({
    author, readDate: T(), title: '책', summary: '줄거리', thoughts: '생각',
    status: 'public', likes: 0, editedByTeacher: false, at: serverTimestamp(),
  });
  function write(db) {
    const b = writeBatch(db);
    b.set(doc(db, `posts/${pid()}`), post());
    addTx(b, db, `writing_${pid()}`, tx('s1', 'writing', 2, 2, pid()), { reading: increment(1) });
    return b.commit();
  }

  it('글을 올리면 2점과 편수 +1, 같은 날 두 번째 글은 안 된다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(write(db));
    await assertFails(setDoc(doc(db, `posts/${pid()}`), post()));
    const s = (await getDoc(doc(db, 'summaries/s1'))).data();
    if (s.wallet !== 22 || s.reading !== 1) throw new Error(JSON.stringify(s));
  });
  it('남의 이름으로 글을 쓸 수 없다', async () => {
    const db = await login(env, '1');
    await assertFails(setDoc(doc(db, `posts/s2_${T()}`), post('s2')));
  });
  it('글 없이 글마당 포인트를 받을 수 없다', async () => {
    const db = await login(env, '1');
    const b = writeBatch(db);
    addTx(b, db, `writing_${pid()}`, tx('s1', 'writing', 2, 2, pid()));
    await assertFails(b.commit());
  });
  it('주간 보너스는 3일이 안 되면 받을 수 없다', { skip: !isWeekday() && '주말에는 주간 기록을 쓸 수 없음' }, async () => {
    const db = await login(env, '1');
    await write(db);
    await assertSucceeds(setDoc(doc(db, `writingWeeks/s1_${weekId()}`), { sid: 's1', week: weekId(), days: [T()] }));
    // 같은 날을 두 번 넣을 수 없다
    await assertFails(updateDoc(doc(db, `writingWeeks/s1_${weekId()}`), { days: [T(), T()] }));
    const b = writeBatch(db);
    addTx(b, db, `writingBonus_s1_${weekId()}`, tx('s1', 'writingBonus', 3, 3, `s1_${weekId()}`));
    await assertFails(b.commit());
  });
  it('공감은 1인 1번, 내 글은 안 된다', async () => {
    const db1 = await login(env, '1');
    await write(db1);
    const like = (db, sid) => {
      const b = writeBatch(db);
      b.update(doc(db, `posts/${pid()}`), { likes: increment(1) });
      b.set(doc(db, `posts/${pid()}/likes/${sid}`), { at: serverTimestamp() });
      return b.commit();
    };
    const db2 = await login(env, '2');
    await assertSucceeds(like(db2, 's2'));
    await assertFails(like(db2, 's2'));
    await assertFails(like(db1, 's1'));
    await assertFails(updateDoc(doc(db2, `posts/${pid()}`), { likes: increment(10) }));
  });
  it('신고하면 바로 숨겨지고, 신고자는 친구에게 안 보인다', async () => {
    const db1 = await login(env, '1');
    await write(db1);
    const db2 = await login(env, '2');
    const rep = `post_${pid()}_s2`;
    const b = writeBatch(db2);
    b.update(doc(db2, `posts/${pid()}`), { status: 'reported' });
    b.set(doc(db2, `reports/${rep}`), { kind: 'post', target: pid(), story: '', reporter: 's2', reason: 'tease', at: serverTimestamp() });
    await assertSucceeds(b.commit());
    const db3 = await login(env, '3');
    await assertFails(getDoc(doc(db3, `posts/${pid()}`)));
    await assertSucceeds(getDoc(doc(db1, `posts/${pid()}`)));
    await assertFails(getDoc(doc(db1, `reports/${rep}`)));
    await assertFails(setDoc(doc(db2, `reports/${rep}`), { kind: 'post', target: pid(), story: '', reporter: 's2', reason: 'etc', at: serverTimestamp() }));
  });
  it('신고 기록 없이 글을 숨길 수 없다', async () => {
    const db1 = await login(env, '1');
    await write(db1);
    const db2 = await login(env, '2');
    await assertFails(updateDoc(doc(db2, `posts/${pid()}`), { status: 'reported' }));
  });
});

// ---------------------------------------------------------------
describe('약속마당', () => {
  it('익명 이야기는 친구가 작성자를 알 수 없다', async () => {
    const db1 = await login(env, '1');
    const b = writeBatch(db1);
    b.set(doc(db1, 'stories/st1'), { mode: 'anon', wish: '조용히', reason: '시끄러워서', likes: 0, stage: 'story', hidden: false, at: serverTimestamp() });
    b.set(doc(db1, 'storyAuthors/st1'), { sid: 's1', at: serverTimestamp() });
    await assertSucceeds(b.commit());
    const db2 = await login(env, '2');
    await assertSucceeds(getDoc(doc(db2, 'stories/st1')));
    await assertFails(getDoc(doc(db2, 'storyAuthors/st1')));
    await assertSucceeds(getDoc(doc(db1, 'storyAuthors/st1')));
  });
  it('익명 이야기에 작성자 칸을 넣거나, 남을 작성자로 적을 수 없다', async () => {
    const db1 = await login(env, '1');
    const b = writeBatch(db1);
    b.set(doc(db1, 'stories/st2'), { mode: 'anon', author: 's1', wish: 'a', reason: 'b', likes: 0, stage: 'story', hidden: false, at: serverTimestamp() });
    b.set(doc(db1, 'storyAuthors/st2'), { sid: 's1', at: serverTimestamp() });
    await assertFails(b.commit());
    const c = writeBatch(db1);
    c.set(doc(db1, 'stories/st3'), { mode: 'named', author: 's2', wish: 'a', reason: 'b', likes: 0, stage: 'story', hidden: false, at: serverTimestamp() });
    c.set(doc(db1, 'storyAuthors/st3'), { sid: 's1', at: serverTimestamp() });
    await assertFails(c.commit());
  });
  it('선생님만 보기 이야기는 친구가 못 읽는다', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(setDoc(doc(db1, 'privateStories/p1'), { author: 's1', wish: 'a', reason: 'b', at: serverTimestamp() }));
    const db2 = await login(env, '2');
    await assertFails(getDoc(doc(db2, 'privateStories/p1')));
    await assertSucceeds(getDoc(doc(teacher(env), 'privateStories/p1')));
  });
});

// ---------------------------------------------------------------
describe('과제', () => {
  const sub = { task: 'k1', sid: 's1', status: 'submitted', text: '', firstAt: serverTimestamp(), lastAt: serverTimestamp() };
  it('나에게 낸 과제만 보이고 제출할 수 있다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', 's1'))));
    await assertFails(getDoc(doc(db, 'tasks/k2')));
    await assertSucceeds(setDoc(doc(db, 'submissions/k1_s1'), sub));
    await assertFails(setDoc(doc(db, 'submissions/k2_s1'), { ...sub, task: 'k2' }));
  });
  it('처음 제출 시각과 완료 상태는 학생이 바꿀 수 없다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, 'submissions/k1_s1'), sub);
    await assertFails(updateDoc(doc(db, 'submissions/k1_s1'), { firstAt: new Date(2020, 0, 1) }));
    await assertFails(updateDoc(doc(db, 'submissions/k1_s1'), { status: 'done' }));
    await assertFails(updateDoc(doc(db, 'submissions/k1_s1'), { status: 'submitted', text: 'x', lastAt: serverTimestamp() }));
  });
  it('다시 해오기 상태면 재제출할 수 있다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, 'submissions/k1_s1'), sub);
    await updateDoc(doc(teacher(env), 'submissions/k1_s1'), { status: 'redo', comment: '다시' });
    await assertSucceeds(updateDoc(doc(db, 'submissions/k1_s1'), { status: 'submitted', text: '고침', lastAt: serverTimestamp() }));
  });
});

// ---------------------------------------------------------------
describe('상점', () => {
  const cid = (n, sid = 's1') => `${sid}_c1_${weekId()}_${n}`;
  function buy(db, n, sid = 's1') {
    const b = writeBatch(db);
    b.set(doc(db, `coupons/${cid(n, sid)}`), { sid, coupon: 'c1', period: weekId(), n, status: 'owned', price: 5, use: null, at: serverTimestamp() });
    addTx(b, db, `buy_${cid(n, sid)}`, tx(sid, 'buy', -5, 0, cid(n, sid)));
    return b.commit();
  }
  function useReq(db, n, slot, sid = 's1') {
    const useId = `c1_${T()}_${slot}`;
    const b = writeBatch(db);
    b.set(doc(db, `couponUses/${useId}`), { sid, coupon: cid(n, sid), type: 'c1', date: T(), n: slot, task: null, status: 'requested', at: serverTimestamp() });
    b.update(doc(db, `coupons/${cid(n, sid)}`), { status: 'useRequested', use: useId });
    return b.commit();
  }

  it('쿠폰을 사면 지갑만 줄고 누적은 그대로', async () => {
    const db = await login(env, '1');
    await assertSucceeds(buy(db, 1));
    const s = (await getDoc(doc(db, 'summaries/s1'))).data();
    if (s.wallet !== 15 || s.total !== 20) throw new Error(JSON.stringify(s));
  });
  it('주 2장 한도를 넘을 수 없다', async () => {
    const db = await login(env, '1');
    await buy(db, 1);
    await buy(db, 2);
    await assertFails(buy(db, 3));
    await assertFails(buy(db, 1));
  });
  it('하루 1번 쿠폰은 오늘 1장만 살 수 있고, 기간 표시는 오늘 날짜여야 한다', async () => {
    await setDoc(doc(teacher(env), 'shopItems/c3'), { name: '하루권', price: 2, instant: true, buyLimit: 1, buyPeriod: 'day', dailyUse: 0, onSale: true });
    const db = await login(env, '1');
    const buyDay = (n, period = `d${T()}`) => {
      const id = `s1_c3_${period}_${n}`;
      const b = writeBatch(db);
      b.set(doc(db, `coupons/${id}`), { sid: 's1', coupon: 'c3', period, n, status: 'owned', price: 2, use: null, at: serverTimestamp() });
      addTx(b, db, `buy_${id}`, tx('s1', 'buy', -2, 0, id));
      return b.commit();
    };
    await assertFails(buyDay(1, 'd20000101'));
    await assertSucceeds(buyDay(1));
    await assertFails(buyDay(2));
  });
  it('가격을 깎아서 살 수 없다', async () => {
    const db = await login(env, '1');
    const b = writeBatch(db);
    b.set(doc(db, `coupons/${cid(1)}`), { sid: 's1', coupon: 'c1', period: weekId(), n: 1, status: 'owned', price: 1, use: null, at: serverTimestamp() });
    addTx(b, db, `buy_${cid(1)}`, tx('s1', 'buy', -1, 0, cid(1)));
    await assertFails(b.commit());
  });
  it('승인이 필요한 쿠폰을 바로 보유 상태로 만들 수 없다', async () => {
    const db = await login(env, '1');
    const id = 's1_c2_all_1';
    const b = writeBatch(db);
    b.set(doc(db, `coupons/${id}`), { sid: 's1', coupon: 'c2', period: 'all', n: 1, status: 'owned', price: 20, use: null, at: serverTimestamp() });
    addTx(b, db, `buy_${id}`, tx('s1', 'buy', -20, 0, id));
    await assertFails(b.commit());
  });
  it('포인트가 모자라면 살 수 없다', async () => {
    await env.clearFirestore();
    await seed(env, { wallet: 3 });
    const db = await login(env, '1');
    await assertFails(buy(db, 1));
  });
  it('반 전체 하루 사용 한도(1명)를 넘을 수 없다', async () => {
    const db1 = await login(env, '1');
    await buy(db1, 1);
    await assertSucceeds(useReq(db1, 1, 1));
    const db2 = await login(env, '2');
    await buy(db2, 1, 's2');
    await assertFails(useReq(db2, 1, 1, 's2'));
    await assertFails(useReq(db2, 1, 2, 's2'));
  });
});

// ---------------------------------------------------------------
describe('공동 목표', () => {
  function donate(db, amount, txId = 'donate_a1', sid = 's1') {
    const b = writeBatch(db);
    addTx(b, db, txId, tx(sid, 'donate', -amount, 0, 'g1'));
    b.update(doc(db, 'goals/g1'), { raised: increment(amount), donors: increment(1), lastTx: txId });
    b.set(doc(db, `goals/g1/donors/${sid}`), { total: amount });
    return b.commit();
  }
  it('보태면 모인 포인트와 인원이 늘고, 금액은 교사만 본다', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(donate(db1, 5));
    const g = (await getDoc(doc(db1, 'goals/g1'))).data();
    if (g.raised !== 5 || g.donors !== 1) throw new Error(JSON.stringify(g));
    const db2 = await login(env, '2');
    await assertFails(getDoc(doc(db2, 'goals/g1/donors/s1')));
    await assertSucceeds(getDoc(doc(db1, 'goals/g1/donors/s1')));
  });
  it('같은 학생이 또 보태면 인원은 그대로', async () => {
    const db1 = await login(env, '1');
    await donate(db1, 5);
    const b = writeBatch(db1);
    addTx(b, db1, 'donate_a2', tx('s1', 'donate', -3, 0, 'g1'));
    b.update(doc(db1, 'goals/g1'), { raised: increment(3), lastTx: 'donate_a2' });
    b.update(doc(db1, 'goals/g1/donors/s1'), { total: increment(3) });
    await assertSucceeds(b.commit());
    await assertFails(donate(db1, 1, 'donate_a3'));
  });
  it('남은 포인트보다 많이 보탤 수 없다', async () => {
    const db1 = await login(env, '1');
    await assertFails(donate(db1, 21));
  });
  it('목표를 채우면 닫힌다', async () => {
    const db1 = await login(env, '1');
    const b = writeBatch(db1);
    addTx(b, db1, 'donate_full', tx('s1', 'donate', -20, 0, 'g1'));
    b.update(doc(db1, 'goals/g1'), { raised: increment(20), donors: increment(1), lastTx: 'donate_full', status: 'done' });
    b.set(doc(db1, 'goals/g1/donors/s1'), { total: 20 });
    await assertSucceeds(b.commit());
  });
});

// ---------------------------------------------------------------
describe('캐릭터·칭호', () => {
  const free = { sid: 's1', item: 'hairBasic', category: 'hair', color: 'black', at: serverTimestamp() };
  it('처음 지급 아이템은 무료로 1번 받는다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(setDoc(doc(db, 'ownedItems/s1_hairBasic_free'), free));
    await assertFails(setDoc(doc(db, 'ownedItems/s1_crown_free'), { ...free, item: 'crown', category: 'headAcc', color: 'gold' }));
  });
  it('아이템은 가격만큼 내야 산다', async () => {
    const db = await login(env, '1');
    const id = 's1_crown_gold';
    const own = { sid: 's1', item: 'crown', category: 'headAcc', color: 'gold', at: serverTimestamp() };
    const cheap = writeBatch(db);
    cheap.set(doc(db, `ownedItems/${id}`), own);
    addTx(cheap, db, `item_${id}`, tx('s1', 'item', -1, 0, id));
    await assertFails(cheap.commit());
    const b = writeBatch(db);
    b.set(doc(db, `ownedItems/${id}`), own);
    addTx(b, db, `item_${id}`, tx('s1', 'item', -15, 0, id));
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(db, 'ownedItems/s1_crown_gold2'), own));
  });
  it('가진 아이템만 착용할 수 있다', async () => {
    const db = await login(env, '1');
    await setDoc(doc(db, 'ownedItems/s1_hairBasic_free'), free);
    await assertSucceeds(updateDoc(doc(db, 'profiles/s1'), { 'equip.hair': { owned: 's1_hairBasic_free', item: 'hairBasic', color: 'black' } }));
    await assertFails(updateDoc(doc(db, 'profiles/s1'), { 'equip.headAcc': { owned: 's1_crown_gold', item: 'crown', color: 'gold' } }));
  });
  it('기준을 못 채운 칭호는 못 달고, 선생님이 준 칭호는 단다', async () => {
    const db = await login(env, '1');
    await assertFails(updateDoc(doc(db, 'profiles/s1'), { title: 'reading_0' }));
    await assertSucceeds(updateDoc(doc(db, 'profiles/s1'), { title: 'award_0' }));
    await assertFails(updateDoc(doc(db, 'profiles/s1'), { title: 'award_1' }));
    await assertFails(updateDoc(doc(db, 'profiles/s1'), { awarded: ['내가 만든 칭호'] }));
  });
  it('기준을 채우면 업적 칭호를 단다', async () => {
    await updateDoc(doc(teacher(env), 'summaries/s1'), { reading: 10 });
    const db = await login(env, '1');
    await assertSucceeds(updateDoc(doc(db, 'profiles/s1'), { title: 'reading_0' }));
    await assertFails(updateDoc(doc(db, 'profiles/s1'), { title: 'reading_1' }));
  });
  it('친구 캐릭터는 볼 수 있지만 바꿀 수 없다', async () => {
    const db = await login(env, '1');
    await assertSucceeds(getDoc(doc(db, 'profiles/s2')));
    await assertFails(updateDoc(doc(db, 'profiles/s2'), { title: 'award_0' }));
  });
});

// ---------------------------------------------------------------
describe('알림·건의함·교사 전용', () => {
  it('내 쪽지만 읽고, 읽음 표시는 한 번만', async () => {
    const db1 = await login(env, '1');
    await assertSucceeds(getDocs(query(collection(db1, 'messages'), where('to', '==', 's1'))));
    await assertSucceeds(updateDoc(doc(db1, 'messages/m1'), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db1, 'messages/m1'), { body: '고침' }));
    const db2 = await login(env, '2');
    await assertFails(getDoc(doc(db2, 'messages/m1')));
  });
  it('건의함은 하루 3건까지', async () => {
    const db = await login(env, '1');
    const fb = { sid: 's1', kind: 'bug', menu: '상점', category: '', body: '안 돼요', device: 'tablet', status: 'new', at: serverTimestamp() };
    for (const n of [1, 2, 3]) await assertSucceeds(setDoc(doc(db, `feedback/s1_${T()}_${n}`), fb));
    await assertFails(setDoc(doc(db, `feedback/s1_${T()}_4`), fb));
  });
  it('학생은 교사 전용 컬렉션을 못 읽는다', async () => {
    const db = await login(env, '1');
    for (const path of ['careNotes/s1', 'attendance/20261016', 'storyNotes/x', 'teachers/t1']) {
      await assertFails(getDoc(doc(db, path)));
    }
  });
  it('반복 과제 규칙은 교사만 읽고 쓴다', async () => {
    const t = teacher(env);
    await assertSucceeds(setDoc(doc(t, 'taskRepeats/r1'), { title: '일기', mode: 'daily', targets: ['s1'], active: true }));
    const db = await login(env, '1');
    await assertFails(getDoc(doc(db, 'taskRepeats/r1')));
    await assertFails(setDoc(doc(db, 'taskRepeats/r2'), { title: '몰래', mode: 'daily', targets: ['s1'], active: true }));
    await assertFails(setDoc(doc(db, 'tasks/r1_20261020'), { kind: 'homework', title: '몰래', targets: ['s1'] }));
  });
  it('교사는 학생 데이터를 읽고 쓸 수 있다', async () => {
    const t = teacher(env);
    await assertSucceeds(getDoc(doc(t, 'studentPins/1')));
    await assertSucceeds(setDoc(doc(t, 'careNotes/s1'), { memo: '살펴보기' }));
    await assertSucceeds(getDocs(collection(t, 'summaries')));
  });
  it('교사 명단에 없는 구글 계정은 아무것도 못 한다', async () => {
    const db = env.authenticatedContext('stranger', { firebase: { sign_in_provider: 'google.com' } }).firestore();
    await assertFails(getDoc(doc(db, 'students/s1')));
    await assertFails(setDoc(doc(db, 'teachers/stranger'), {}));
  });
});
