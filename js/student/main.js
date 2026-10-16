// 학생 앱 시작점
import { auth } from '../common/firebase.js';
import { currentStudent } from '../common/student-session.js';
import { renderLogin } from './login.js';
import { renderHome } from './home.js';

const root = document.getElementById('app');

function showLogin() { renderLogin(root, showHome); }
function showHome(student) { renderHome(root, student, showLogin); }

await auth.authStateReady();
const student = await currentStudent().catch(() => null);
if (student) showHome(student);
else showLogin();
