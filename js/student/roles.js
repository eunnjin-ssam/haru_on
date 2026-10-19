// 1인1역 (학생 쪽): 했어요 → 요청중 → 확인 담당 승인 시 포인트.
// 확인 담당은 '승인' 또는 '다시 해줘'를 누른다.
import {
  collection, doc, getDocs, query, where, setDoc, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { todayId } from '../common/dates.js';

// 내 역할들의 오늘 상태 + 내가 확인 담당인 요청 목록
export async function loadRoles(sid) {
  const [rolesSnap, checksSnap] = await Promise.all([
    getDocs(collection(db, 'roles')),
    getDocs(query(collection(db, 'roleChecks'), where('date', '==', todayId()))),
  ]);
  const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const checks = checksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const mine = roles
    .filter((r) => (r.members ?? []).includes(sid))
    .map((r) => ({ role: r, status: checks.find((c) => c.role === r.id && c.sid === sid)?.status ?? null }));

  const requests = [];
  for (const r of roles.filter((r) => r.checker === sid)) {
    for (const c of checks.filter((c) => c.role === r.id && c.status === 'requested' && c.sid !== sid)) {
      requests.push({ check: c, role: r });
    }
  }
  return { mine, requests };
}

// '했어요' (또는 '다시 해줘'를 받은 뒤 다시 요청)
export async function requestRole(sid, roleId, redo) {
  const id = `${todayId()}_${roleId}_${sid}`;
  if (redo) {
    await updateDoc(doc(db, 'roleChecks', id), { status: 'requested', by: sid, at: serverTimestamp(), reqAt: serverTimestamp() });
  } else {
    await setDoc(doc(db, 'roleChecks', id), {
      sid, role: roleId, date: todayId(), status: 'requested', by: sid, at: serverTimestamp(), reqAt: serverTimestamp(),
    });
  }
}

// 확인 담당의 승인: 거래 1줄 + 요청 학생 요약을 같은 묶음으로 쓴다
export async function approveRole(checkerSid, check, role) {
  const txId = `role_${check.id}`;
  const b = writeBatch(db);
  b.update(doc(db, 'roleChecks', check.id), { status: 'approved', by: checkerSid, at: serverTimestamp() });
  b.set(doc(db, 'points', txId), {
    sid: check.sid, type: 'role', wallet: role.points, total: role.points,
    reason: `1인1역 ${role.name}`, ref: check.id, by: checkerSid, at: serverTimestamp(),
  });
  b.update(doc(db, 'summaries', check.sid), {
    wallet: increment(role.points), total: increment(role.points),
    roleDays: increment(1), lastTx: txId,
  });
  await b.commit();
}

export async function redoRole(checkerSid, check) {
  await updateDoc(doc(db, 'roleChecks', check.id), { status: 'redo', by: checkerSid, at: serverTimestamp() });
}
