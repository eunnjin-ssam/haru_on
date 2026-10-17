// 학생 앱 시작점
import { auth } from '../common/firebase.js';
import { currentStudent } from '../common/student-session.js';
import { renderLogin } from './login.js';
import { renderApp } from './app.js';
import { h } from '../common/ui.js';

const root = document.getElementById('app');

function showLogin() { renderLogin(root, showHome); }
async function showHome(student) {
  try {
    await renderApp(root, student, showLogin);
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('section', { class: 'card' },
      h('p', { class: 'banner' }, '화면을 불러오지 못했어요.'),
      h('p', { class: 'muted' }, '선생님 화면에서 기본 설정을 저장했는지 확인하고 새로고침해 주세요.'),
    ));
  }
}

await auth.authStateReady();
const student = await currentStudent().catch(() => null);
if (student) showHome(student);
else showLogin();
