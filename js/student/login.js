// 학생 로그인 화면: 번호 → PIN 4자리
import { h } from '../common/ui.js';
import { loginStudent, LoginError } from '../common/student-session.js';

const MESSAGES = {
  'no-number': '그 번호는 없어요. 번호를 다시 확인해 주세요.',
  'wrong-pin': '비밀번호가 맞지 않아요. 다시 눌러 주세요.',
  'too-many': '여러 번 틀렸어요. 30초 뒤에 다시 해 주세요.',
  'network': '연결이 안 돼요. 인터넷을 확인하고 다시 해 주세요.',
};
const PIN_LENGTH = 4;

// 같은 기기에서 연속으로 틀리면 잠깐 쉬게 한다 (서버 쪽 잠금은 무료 요금제로는 불가)
let fails = 0;
let lockedUntil = 0;

export function renderLogin(root, onLoggedIn) {
  let step = 'number';
  let number = '';
  let pin = '';
  let message = '';
  let busy = false;

  function draw() { root.replaceChildren(view()); }

  function press(key) {
    if (busy) return;
    message = '';
    if (step === 'number') {
      if (key === 'back') number = number.slice(0, -1);
      else if (key === 'ok') { if (Number(number) > 0) step = 'pin'; }
      else if (number.length < 2) number = (number + key).replace(/^0/, '');
    } else {
      if (key === 'back') pin = pin.slice(0, -1);
      else if (key === 'change') { step = 'number'; pin = ''; }
      else if (pin.length < PIN_LENGTH) pin += key;
      if (pin.length === PIN_LENGTH) { submit(); return; }
    }
    draw();
  }

  async function submit() {
    if (Date.now() < lockedUntil) {
      message = MESSAGES['too-many'];
      pin = '';
      draw();
      return;
    }
    busy = true;
    draw();
    try {
      const student = await loginStudent(number, pin);
      fails = 0;
      document.removeEventListener('keydown', onKey);
      onLoggedIn(student);
      return;
    } catch (e) {
      const code = e instanceof LoginError ? e.code : 'network';
      if (!(e instanceof LoginError)) console.error(e);
      if (code === 'wrong-pin' && ++fails >= 5) {
        fails = 0;
        lockedUntil = Date.now() + 30_000;
      }
      message = MESSAGES[code];
      pin = '';
      if (code === 'no-number') { step = 'number'; number = ''; }
    }
    busy = false;
    draw();
  }

  function onKey(e) {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter' && step === 'number') press('ok');
  }
  document.addEventListener('keydown', onKey);

  function key(label, value, cls = '') {
    return h('button', {
      class: `key ${cls}`,
      type: 'button',
      disabled: busy,
      'aria-label': value === 'back' ? '지우기' : null,
      onclick: () => press(value),
    }, label);
  }

  function view() {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, d));
    if (step === 'number') {
      return h('section', { class: 'login' },
        h('img', { class: 'login-logo', src: 'img/logo.webp', alt: '하루 On' }),
        h('h1', null, '내 번호를 눌러요'),
        h('div', { class: 'display', 'aria-live': 'polite' },
          number ? `${number}번` : h('span', { class: 'placeholder' }, '번호')),
        h('p', { class: 'message', role: 'alert' }, message),
        h('div', { class: 'keypad' },
          digits, key('⌫', 'back', 'fn'), key('0', '0'),
          key('다음', 'ok', 'ok')),
      );
    }
    return h('section', { class: 'login' },
      h('img', { class: 'login-logo', src: 'img/logo.webp', alt: '하루 On' }),
      h('h1', null, `${number}번, 비밀번호를 눌러요`),
      h('p', { class: 'guide' }, busy ? '확인하는 중…' : '선생님이 준 숫자 4개'),
      h('div', { class: 'display', 'aria-label': `${pin.length}개 입력함` },
        Array.from({ length: PIN_LENGTH }, (_, i) => h('span', { class: `dot ${i < pin.length ? 'on' : ''}` }))),
      h('p', { class: 'message', role: 'alert' }, message),
      h('div', { class: 'keypad' },
        digits, key('⌫', 'back', 'fn'), key('0', '0'), key('', '', 'blank')),
      h('button', { class: 'link', type: 'button', onclick: () => press('change') }, '번호 다시 고르기'),
    );
  }

  draw();
}
