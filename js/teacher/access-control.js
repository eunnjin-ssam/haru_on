// 선생님 머리줄의 '학생 화면' 버튼: 지금 학생 화면이 열렸는지/잠겼는지 보여 주고,
// 누르면 직접 열기(잠금 풀기)·잠그기, 또는 시간표대로 되돌리기.
// 지금 잠그기는 지금 쉬는시간이 끝날 때까지, 지금 열기는 다음 쉬는시간이 시작될 때까지만이고 그 뒤엔 저절로 시간표대로.
import { doc, onSnapshot, updateDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { accessState, overrideFor } from '../common/access.js';

let stopPrev = null; // 다시 로그인해 머리줄을 새로 만들면 예전 감시는 끈다

export function accessControl() {
  if (stopPrev) stopPrev();
  let access = null;
  const label = h('span', { class: 'ac-label' }, '학생 화면 …');
  const btn = h('button', { class: 'ac-btn', title: '학생 화면 열기·잠그기' }, label);
  const menu = h('div', { class: 'ac-menu', hidden: true });
  const wrap = h('div', { class: 'ac-wrap' }, btn, menu);

  const set = (mode, msg) => {
    menu.hidden = true;
    updateDoc(doc(db, 'settings', 'main'), { 'access.override': overrideFor(mode, access) })
      .then(() => toast(msg)).catch((e) => { console.error(e); toast('바꾸지 못했어요.', 'error'); });
  };

  function paint() {
    const st = accessState(access);
    const text = {
      off: '학생 화면 열림',
      open: `학생 화면 열림 · 선생님이 엶${st.until ? ` (${st.until}까지)` : ''}`,
      lock: `학생 화면 잠김 · 선생님이 잠금${st.until ? ` (${st.until}까지)` : ''}`,
      break: `학생 화면 열림 · ${st.until}까지`,
      class: `학생 화면 잠김${st.next ? ` · ${st.next}에 열림` : ''}`,
    }[st.reason];
    label.textContent = `${st.locked ? '🔒' : '🔓'} ${text}`;
    btn.classList.toggle('locked', st.locked);
    const manual = access?.override && (st.reason === 'open' || st.reason === 'lock');
    menu.replaceChildren(...[
      h('div', { class: 'ac-title' }, '학생 화면'),
      st.locked ? h('button', { class: 'btn small', onclick: () => set('open', '학생 화면을 열었어요') }, '🔓 지금 열기 (잠금 풀기)') : null,
      !st.locked ? h('button', { class: 'btn danger small', onclick: () => set('locked', '학생 화면을 잠갔어요') }, '🔒 지금 잠그기') : null,
      manual ? h('button', { class: 'btn secondary small', onclick: () => set(null, access?.enabled ? '시간표대로 돌렸어요' : '잠금을 풀었어요') }, access?.enabled ? '⏰ 시간표대로' : '처음대로(늘 열림)') : null,
      h('p', { class: 'muted small', style: 'margin:4px 0 0' }, access?.enabled ? '지금 잠그기는 이번 쉬는시간이 끝날 때까지, 지금 열기는 다음 쉬는시간이 시작될 때까지예요. 그 뒤엔 저절로 시간표대로 돌아가요.' : '쉬는시간 시간표는 기본 설정에서 켤 수 있어요.'),
    ].filter(Boolean));
  }

  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  const close = (e) => { if (!wrap.contains(e.target)) menu.hidden = true; };
  document.addEventListener('click', close);
  const unsub = onSnapshot(doc(db, 'settings', 'main'), (snap) => { access = snap.data()?.access ?? null; paint(); }, (e) => console.error(e));
  const timer = setInterval(paint, 20000);
  stopPrev = () => { unsub(); clearInterval(timer); document.removeEventListener('click', close); };
  paint();
  return wrap;
}
