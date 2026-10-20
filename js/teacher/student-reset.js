// 학생 한 명의 기록만 지우기(시험 기록 정리용). 학생 명단·번호·PIN·로그인은 그대로 둔다.
// 지우는 것: 포인트 내역(요약은 0으로), 기분, 기초미션, 1인1역 확인·희망, 과제 제출, 글마당 글·공감·임시저장,
// 약속마당 이야기·댓글·공감·선생님만 보기 이야기, 신고, 쿠폰, 아이템·캐릭터 모습·칭호, 공동 목표 기부, 쪽지, 건의, 살핌판 메모.
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, increment,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';

// sid(또는 다른 필드)로 찾아 지우는 컬렉션
const BY_FIELD = [
  ['points', 'sid'], ['moods', 'sid'], ['moodNotes', 'sid'], ['missionAttempts', 'sid'],
  ['roleChecks', 'sid'], ['roleWishes', 'sid'], ['writingWeeks', 'sid'], ['submissions', 'sid'],
  ['coupons', 'sid'], ['couponUses', 'sid'], ['couponIdeas', 'sid'], ['ownedItems', 'sid'],
  ['feedback', 'sid'], ['messages', 'to'], ['reports', 'reporter'],
  ['privateStories', 'author'],
];

async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) op(b);
    await b.commit();
  }
}

export async function resetStudent(sid) {
  const ops = [];
  const del = (ref) => ops.push((b) => b.delete(ref));
  const ids = async (c, field) => (await getDocs(query(collection(db, c), where(field, '==', sid)))).docs;

  for (const [c, field] of BY_FIELD) {
    for (const d of await ids(c, field)) {
      del(d.ref);
      if (c === 'privateStories') del(doc(db, 'storyNotes', d.id)); // 상담 메모도 함께
    }
  }
  del(doc(db, 'drafts', sid));
  del(doc(db, 'careNotes', sid));

  // 글마당: 이 학생 글(공감까지) 지우기, 다른 친구 글에 누른 공감은 빼고 숫자도 줄이기
  for (const p of (await getDocs(collection(db, 'posts'))).docs) {
    if (p.data().author === sid) {
      for (const l of (await getDocs(collection(db, 'posts', p.id, 'likes'))).docs) del(l.ref);
      del(p.ref);
    } else if ((await getDoc(doc(db, 'posts', p.id, 'likes', sid))).exists()) {
      del(doc(db, 'posts', p.id, 'likes', sid));
      ops.push((b) => b.update(p.ref, { likes: increment(-1) }));
    }
  }

  // 약속마당: 이 학생이 쓴 이야기(이름·익명 모두)는 공감·댓글·신고까지 지우고,
  // 다른 이야기에 단 댓글·공감은 빼기
  const anonMine = new Set((await ids('storyAuthors', 'sid')).map((d) => d.id));
  for (const s of (await getDocs(collection(db, 'stories'))).docs) {
    if (s.data().author === sid || anonMine.has(s.id)) {
      const [likes, comments, reps] = await Promise.all([
        getDocs(collection(db, 'stories', s.id, 'likes')),
        getDocs(collection(db, 'stories', s.id, 'comments')),
        getDocs(query(collection(db, 'reports'), where('story', '==', s.id))),
      ]);
      for (const d of [...likes.docs, ...comments.docs, ...reps.docs]) del(d.ref);
      del(doc(db, 'storyAuthors', s.id));
      del(s.ref);
      continue;
    }
    for (const c of (await getDocs(query(collection(db, 'stories', s.id, 'comments'), where('author', '==', sid)))).docs) del(c.ref);
    if ((await getDoc(doc(db, 'stories', s.id, 'likes', sid))).exists()) {
      del(doc(db, 'stories', s.id, 'likes', sid));
      ops.push((b) => b.update(s.ref, { likes: increment(-1) }));
    }
  }

  // 공동 목표: 보탠 만큼 모인 포인트에서 빼기(포인트 내역은 위에서 지웠으니 돌려주지 않는다)
  for (const g of (await getDocs(collection(db, 'goals'))).docs) {
    const dn = await getDoc(doc(db, 'goals', g.id, 'donors', sid));
    if (!dn.exists()) continue;
    const amt = dn.data().total ?? 0;
    del(dn.ref);
    const raised = Math.max(0, (g.data().raised ?? 0) - amt);
    const status = g.data().status === 'done' && raised < (g.data().target ?? 0) ? 'open' : g.data().status;
    ops.push((b) => b.update(g.ref, { raised, donors: increment(-1), status }));
  }

  // 요약은 0으로, 캐릭터는 처음 모습으로(다음에 들어오면 기본 아이템을 다시 받아요)
  ops.push((b) => b.set(doc(db, 'summaries', sid), { wallet: 0, total: 0, lastTx: '', reading: 0, missionDays: 0, roleDays: 0 }));
  ops.push((b) => b.set(doc(db, 'profiles', sid), {
    equip: { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null }, title: null, awarded: [],
  }));

  await commitOps(ops);
}
