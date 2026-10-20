// 에뮬레이터 전용: '학생 기록 지우기' 시험용으로 s1의 기록과 s2의 기록을 몇 개 넣는다.
// 실행: node tools/seed-test-records.mjs   (확인: node tools/seed-test-records.mjs count)
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, getDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-class-app',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});
const now = new Date();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const put = (path, data) => setDoc(doc(db, path), data);
  if (process.argv[2] === 'count') {
    const out = {};
    for (const c of ['points', 'moods', 'missionAttempts', 'submissions', 'coupons', 'messages', 'posts', 'stories', 'privateStories', 'ownedItems']) {
      const snap = await getDocs(collection(db, c));
      out[c] = snap.docs.map((d) => d.id).join(',');
    }
    out.s2postLikes = (await getDoc(doc(db, 'posts/s2_20261020'))).data()?.likes;
    out.s2storyLikes = (await getDoc(doc(db, 'stories/st2'))).data()?.likes;
    out.s2storyComments = (await getDocs(collection(db, 'stories/st2/comments'))).docs.map((d) => d.id).join(',');
    out.goal = JSON.stringify((await getDoc(doc(db, 'goals/g1'))).data());
    out.sum1 = JSON.stringify((await getDoc(doc(db, 'summaries/s1'))).data());
    out.sum2 = JSON.stringify((await getDoc(doc(db, 'summaries/s2'))).data());
    console.log(out);
    return;
  }
  for (const sid of ['s1', 's2']) {
    await put(`points/give_${sid}_1`, { sid, type: 'give', wallet: 30, total: 30, reason: '시험', ref: '', by: 'teacher', at: now });
    await put(`summaries/${sid}`, { wallet: 30, total: 30, lastTx: `give_${sid}_1`, reading: 1, missionDays: 1, roleDays: 0 });
    await put(`moods/${sid}_20261020`, { sid, date: '20261020', mood: 'good', at: now });
    await put(`missionAttempts/${sid}_20261020_1`, { sid, date: '20261020', n: 1, qid: 'q1', answer: '1', at: now, correct: true });
    await put(`submissions/k1_${sid}`, { task: 'k1', sid, status: 'submitted', text: '', firstAt: now, lastAt: now });
    await put(`coupons/${sid}_c1_w_1`, { sid, coupon: 'c1', period: 'w', n: 1, status: 'owned', price: 10, use: 0, at: now });
    await put(`messages/m_${sid}`, { to: sid, body: '안녕', from: 'teacher', at: now, readAt: null });
    await put(`posts/${sid}_20261020`, { author: sid, readDate: '20261020', title: '책', summary: '', thoughts: '', status: 'public', likes: 1, at: now });
  }
  await put('posts/s2_20261020/likes/s1', { at: now }); // s1이 s2 글에 공감
  await put('posts/s1_20261020/likes/s2', { at: now });
  await put('stories/st1', { mode: 'named', author: 's1', wish: '시험 이야기', likes: 0, stage: 'story', at: now });
  await put('stories/st2', { mode: 'named', author: 's2', wish: '친구 이야기', likes: 1, stage: 'story', at: now });
  await put('stories/st2/likes/s1', { at: now });
  await put('stories/st2/comments/cm1', { author: 's1', text: '좋아', kind: 'idea', status: 'public', at: now });
  await put('stories/st2/comments/cm2', { author: 's2', text: '나도', kind: 'idea', status: 'public', at: now });
  await put('stories/st3', { mode: 'anon', wish: '익명 시험', likes: 0, stage: 'story', at: now });
  await put('storyAuthors/st3', { sid: 's1', at: now });
  await put('privateStories/ps1', { author: 's1', wish: '비밀', at: now });
  await put('goals/g1', { title: '영화', target: 100, reward: '영화', raised: 20, donors: 2, status: 'open', lastTx: '' });
  await put('goals/g1/donors/s1', { total: 12 });
  await put('goals/g1/donors/s2', { total: 8 });
  console.log('넣었어요');
});
await env.cleanup();
