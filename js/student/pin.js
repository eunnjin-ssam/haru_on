// PIN 바꾸기: 지금 PIN + 새 PIN 두 번. 지금 PIN이 맞는지는 보안 규칙이 서버에서 확인한다(pinChangeOK).
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const pinInput = (placeholder) => h('input', {
  type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off',
  class: 'pin-input', placeholder,
});

export function openPinChange(student) {
  const box = h('div', { class: 'sheet-box' });
  const dlg = h('div', { class: 'sheet' }, box);
  const close = () => dlg.remove();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);

  const cur = pinInput('지금 PIN');
  const next = pinInput('새 PIN');
  const again = pinInput('새 PIN 한 번 더');
  const msg = h('p', { class: 'pin-msg' });
  const show = (text) => { msg.textContent = text; };
  // 숫자만 남기기
  for (const el of [cur, next, again]) el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 4); show(''); });

  const save = h('button', { class: 'btn', onclick: async () => {
    const [c, n, a] = [cur.value, next.value, again.value];
    if (!/^\d{4}$/.test(c)) { show('지금 PIN 4자리를 넣어 주세요.'); cur.focus(); return; }
    if (!/^\d{4}$/.test(n)) { show('새 PIN은 숫자 4자리예요.'); next.focus(); return; }
    if (n !== a) { show('새 PIN 두 칸이 서로 달라요.'); again.focus(); return; }
    if (n === c) { show('지금 PIN과 다른 숫자로 정해 주세요.'); next.focus(); return; }
    save.disabled = true;
    try {
      await updateDoc(doc(db, 'studentPins', String(student.number)), { pin: n, prev: c });
      close();
      toast('PIN을 바꿨어요. 다음부터 새 PIN으로 들어와요! 🔑');
    } catch (e) {
      console.error(e);
      // 규칙에서 막힘 = 지금 PIN이 틀림 (그 밖의 경우는 드묾)
      show(e.code === 'permission-denied' ? '지금 PIN이 맞지 않아요.' : '바꾸지 못했어요. 다시 해 주세요.');
      save.disabled = false;
    }
  } }, '바꾸기');

  box.replaceChildren(
    h('h3', null, '🔑 PIN 바꾸기'),
    h('p', { class: 'muted small', style: 'margin:0' }, '친구가 모르는 숫자 4자리로 정해요. 잊어버리면 선생님께 말씀드려요.'),
    cur, next, again, msg,
    h('div', { class: 'pin-actions' }, save, h('button', { class: 'btn secondary', onclick: close }, '닫기')),
  );
  cur.focus();
}
