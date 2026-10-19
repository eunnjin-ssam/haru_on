// 새소식 팝업: 게시 기간인 새소식 중 아직 '확인했어요'를 안 누른 것을 하나씩 띄운다.
import {
  collection, doc, getDoc, getDocs, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';

export async function showNotices(student) {
  const today = todayId();
  let list;
  try {
    const snap = await getDocs(collection(db, 'notices'));
    const live = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((n) => n.start <= today && today <= n.end)
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const read = await Promise.all(live.map((n) => getDoc(doc(db, 'notices', n.id, 'reads', student.sid)).catch(() => null)));
    list = live.filter((_, i) => !read[i]?.exists());
  } catch (e) { console.error(e); return; }

  // 하나 닫으면 다음 것
  function next(i) {
    if (i >= list.length) return;
    const n = list[i];
    const ok = h('button', { class: 'btn', onclick: async () => {
      ok.disabled = true;
      try { await setDoc(doc(db, 'notices', n.id, 'reads', student.sid), { at: serverTimestamp() }); }
      catch (e) { console.error(e); toast('저장하지 못했어요. 다음에 또 보여요.', 'error'); }
      dlg.remove(); next(i + 1);
    } }, '확인했어요');
    const dlg = h('div', { class: 'notice-pop' }, h('div', { class: 'notice-box' },
      h('div', { class: 'notice-tag' }, `📢 새소식${list.length > 1 ? ` ${i + 1}/${list.length}` : ''}`),
      h('h2', null, n.title),
      n.body ? h('p', { class: 'notice-body' }, n.body) : null,
      ok));
    document.body.append(dlg);
  }
  next(0);
}
