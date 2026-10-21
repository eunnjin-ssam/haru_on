// 학생별 결석한 날 목록(absences/{학생}.days)을 반 결석부(attendance/{날짜}.absent)에 맞춘다.
// 학생은 반 결석부를 못 읽어서, 결석한 날 올라온 과제를 '결석'으로 보여 주려면 본인 목록이 필요하다.
// 결석 버튼은 둘을 함께 쓰고, 선생님 화면을 열 때 한 번 맞춰 본다(예전 기록·어긋난 것 바로잡기).
import { collection, doc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';

export async function ensureAbsences() {
  const [attSnap, absSnap] = await Promise.all([getDocs(collection(db, 'attendance')), getDocs(collection(db, 'absences'))]);
  const want = new Map(); // 학생 → 날짜 목록
  for (const d of attSnap.docs) for (const sid of d.data().absent ?? []) want.set(sid, [...(want.get(sid) ?? []), d.id]);
  const have = new Map(absSnap.docs.map((d) => [d.id, d.data().days ?? []]));
  const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const b = writeBatch(db); let n = 0;
  for (const sid of new Set([...want.keys(), ...have.keys()])) {
    const days = (want.get(sid) ?? []).sort();
    if (same(days, have.get(sid) ?? [])) continue;
    b.set(doc(db, 'absences', sid), { days }); n += 1;
    if (n >= 450) break; // 한 번에 너무 많으면 다음에 이어서
  }
  if (n) await b.commit();
}
