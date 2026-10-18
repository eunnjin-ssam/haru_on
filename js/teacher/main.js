// 선생님 앱 시작점: 로그인 확인 → 메뉴
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { auth, db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { signInTeacher, signOutTeacher, isTeacher } from '../common/teacher-auth.js';
import { renderRoster } from './roster.js';
import { renderSetup } from './setup.js';
import { renderRoles } from './roles.js';
import { renderMission } from './mission.js';
import { renderToday } from './today.js';
import { renderBoard } from './board.js';
import { renderWritingAdmin } from './writing-admin.js';
import { renderStoriesAdmin } from './stories-admin.js';
import { renderPointsAdmin } from './points-admin.js';
import { renderGoalsAdmin } from './goals-admin.js';
import { renderCharacterAdmin } from './character-admin.js';
import { renderCare } from './care.js';
import { renderAdmin } from './admin.js';
import { renderFeedbackAdmin } from './feedback-admin.js';

const root = document.getElementById('app');

const TABS = [
  { id: 'today', label: '오늘 현황', render: renderToday },
  { id: 'board', label: '체크판', render: renderBoard },
  { id: 'care', label: '살핌판', render: renderCare },
  { id: 'feedback', label: '건의함', render: renderFeedbackAdmin },
  { id: 'writing', label: '글마당 관리', render: renderWritingAdmin },
  { id: 'stories', label: '약속마당 관리', render: renderStoriesAdmin },
  { id: 'points', label: '포인트 관리', render: renderPointsAdmin },
  { id: 'goals', label: '공동 목표', render: renderGoalsAdmin },
  { id: 'character', label: '캐릭터·칭호', render: renderCharacterAdmin },
  { id: 'roster', label: '학생 명단', render: renderRoster },
  { id: 'roles', label: '1인1역', render: renderRoles },
  { id: 'mission', label: '기초미션', render: renderMission },
  { id: 'setup', label: '기본 설정', render: renderSetup },
  { id: 'admin', label: '백업·초기화', render: renderAdmin },
];

async function start() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return showSignIn();
  if (!(await isTeacher(user))) return showNotRegistered(user);
  const hasSettings = (await getDoc(doc(db, 'settings', 'main'))).exists();
  showApp(user, hasSettings ? 'today' : 'setup');
}

function showSignIn() {
  root.replaceChildren(h('section', { class: 'gate card' },
    h('h1', null, '선생님 로그인'),
    h('p', { class: 'muted' }, '학급 관리용 Google 계정으로 로그인해 주세요.'),
    h('div', null, h('button', { class: 'btn', onclick: async () => {
      try {
        await signInTeacher();
        start();
      } catch (e) {
        if (e.code !== 'auth/popup-closed-by-user') toast('로그인하지 못했어요. 다시 해 주세요.', 'error');
      }
    } }, 'Google로 로그인')),
  ));
}

// 교사 명단에 없는 계정: 콘솔에서 등록하는 방법 안내
function showNotRegistered(user) {
  const copy = h('button', { class: 'btn secondary small', onclick: async () => {
    await navigator.clipboard.writeText(user.uid);
    toast('복사했어요');
  } }, '복사');
  root.replaceChildren(h('section', { class: 'gate card' },
    h('h1', null, '교사 등록이 필요해요'),
    h('p', null, `${user.email} 계정은 아직 교사 명단에 없어요. 아래 계정 번호를 Firebase 콘솔에 한 번만 등록하면 돼요.`),
    h('div', { class: 'uid-box' }, h('code', null, user.uid), copy),
    h('ol', null,
      h('li', null, 'Firebase 콘솔 → 빌드 → Firestore Database → 데이터 탭'),
      h('li', null, '+ 컬렉션 시작 → 컬렉션 ID에 teachers 입력 → 다음'),
      h('li', null, '문서 ID 칸에 위 계정 번호 붙여넣기'),
      h('li', null, '필드 이름 email, 값에 내 이메일 입력 → 저장'),
      h('li', null, '이 화면에서 "다시 확인" 누르기'),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: start }, '다시 확인'),
      h('button', { class: 'btn secondary', onclick: async () => { await signOutTeacher(); start(); } }, '다른 계정으로 로그인'),
    ),
  ));
}

function showApp(user, firstTab) {
  const content = h('main', { class: 'content' });
  const tabButtons = TABS.map((tab) => h('button', { class: 'tab', onclick: () => open(tab.id) }, tab.label));

  async function open(id) {
    TABS.forEach((tab, i) => tabButtons[i].classList.toggle('on', tab.id === id));
    content.replaceChildren(h('p', { class: 'muted' }, '불러오는 중…'));
    try {
      await TABS.find((tab) => tab.id === id).render(content, { open });
    } catch (e) {
      console.error(e);
      content.replaceChildren(h('p', { class: 'banner' }, '불러오지 못했어요. 새로고침해 주세요.'));
    }
  }

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('span', { class: 'title' }, '우리 반 관리'),
      h('nav', null, tabButtons),
      h('span', { class: 'account' }, user.email),
      h('button', { class: 'btn secondary small', onclick: async () => { await signOutTeacher(); start(); } }, '로그아웃'),
    ),
    content,
  );
  open(firstTab);
}

start();
