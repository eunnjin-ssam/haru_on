// 임시 첫 화면. 3단계에서 대시보드로 바뀐다.
import { h } from '../common/ui.js';
import { logoutStudent } from '../common/student-session.js';

export function renderHome(root, student, onLogout) {
  let asking = false;
  const logout = h('button', { class: 'logout', type: 'button', onclick: async () => {
    // 실수로 누르지 않게 두 번 눌러야 나간다
    if (!asking) {
      asking = true;
      logout.textContent = '정말 나갈까요?';
      logout.classList.add('confirm');
      setTimeout(() => {
        asking = false;
        logout.textContent = '나가기';
        logout.classList.remove('confirm');
      }, 3000);
      return;
    }
    await logoutStudent();
    onLogout();
  } }, '나가기');

  root.replaceChildren(h('section', { class: 'home' },
    h('header', null, h('span', { class: 'who' }, `${student.number}번 ${student.name}`), logout),
    h('h1', null, `반가워, ${student.name}!`),
    h('p', { class: 'muted' }, '곧 여기에 오늘 할 일이 나와요.'),
  ));
}
