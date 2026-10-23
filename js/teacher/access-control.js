// 선생님 머리줄의 '학생 화면' 버튼: 지금 학생 화면이 열렸는지/잠겼는지 보여 주고, 한 번 누르면 열림 ↔ 잠김.
// 수업 중에 열면 다음 쉬는시간이 시작될 때까지, 쉬는시간에 잠그면 그 쉬는시간이 끝날 때까지만 바뀌고
// 그 뒤엔 선생님이 아무것도 안 해도 저절로 시간표대로 돌아간다(js/common/access.js).
import { doc, onSnapshot, updateDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { accessState, overrideFor } from '../common/access.js';

let stopPrev = null; // 다시 로그인해 머리줄을 새로 만들면 예전 감시는 끈다

export function accessControl() {
  if (stopPrev) stopPrev();
  let access = null;
  const btn = h('button', { class: 'ac-btn' }, '학생 화면 …');

  async function toggle() {
    const st = accessState(access);
    const want = st.locked ? 'open' : 'locked';
    // 바꾸려는 상태가 시간표와 같으면 직접 바꾼 것을 지우고 시간표대로
    const plan = accessState({ ...(access ?? {}), override: null });
    const override = (want === 'open') === !plan.locked ? null : overrideFor(want, access);
    btn.disabled = true;
    try {
      await updateDoc(doc(db, 'settings', 'main'), { 'access.override': override });
      toast(want === 'open' ? '학생 화면을 열었어요' : '학생 화면을 잠갔어요');
    } catch (e) { console.error(e); toast('바꾸지 못했어요.', 'error'); }
    btn.disabled = false;
  }
  btn.addEventListener('click', toggle);

  function paint() {
    const st = accessState(access);
    const until = st.reason === 'break' || st.reason === 'open' || st.reason === 'lock' ? st.until : null;
    btn.textContent = `${st.locked ? '🔒 학생 화면 잠김' : '🔓 학생 화면 열림'}${until ? ` · ${until}까지` : ''}`;
    btn.classList.toggle('locked', st.locked);
    btn.title = `${st.locked ? '누르면 학생 화면을 열어요' : '누르면 학생 화면을 잠가요'}${access?.enabled ? ' (다음 쉬는시간 전후로 저절로 시간표대로 돌아가요)' : ''}`;
  }

  const unsub = onSnapshot(doc(db, 'settings', 'main'), (snap) => { access = snap.data()?.access ?? null; paint(); }, (e) => console.error(e));
  const timer = setInterval(paint, 20000);
  stopPrev = () => { unsub(); clearInterval(timer); };
  paint();
  return btn;
}
