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
import { ensureRepeatTasks } from './repeats.js';
import { ensureRoleTerms } from './role-terms.js';
import { renderNotices } from './notices.js';

const root = document.getElementById('app');

const TABS = [
  { id: 'today', label: '오늘 현황', icon: '📊', render: renderToday },
  { id: 'board', label: '체크판', icon: '✅', render: renderBoard },
  { id: 'care', label: '살핌판', icon: '💗', render: renderCare },
  { id: 'feedback', label: '건의함', icon: '💬', render: renderFeedbackAdmin },
  { id: 'notices', label: '새소식', icon: '📢', render: renderNotices },
  { id: 'writing', label: '글마당 관리', icon: '📖', render: renderWritingAdmin },
  { id: 'stories', label: '약속마당 관리', icon: '🗣️', render: renderStoriesAdmin },
  { id: 'points', label: '포인트 관리', icon: '🪙', render: renderPointsAdmin },
  { id: 'goals', label: '공동 목표', icon: '🎯', render: renderGoalsAdmin },
  { id: 'character', label: '캐릭터·칭호', icon: '🧑', render: renderCharacterAdmin },
  { id: 'roster', label: '학생 명단', icon: '📋', render: renderRoster },
  { id: 'roles', label: '1인1역', icon: '🧹', render: renderRoles },
  { id: 'mission', label: '기초미션', icon: '🧮', render: renderMission },
  { id: 'setup', label: '기본 설정', icon: '⚙️', render: renderSetup },
  { id: 'admin', label: '백업·초기화', icon: '💾', render: renderAdmin },
];

// 사이드바 메뉴 묶음
const GROUPS = [
  { label: '학급 현황', tabs: ['today', 'board', 'care', 'feedback', 'notices'] },
  { label: '마당 관리', tabs: ['writing', 'stories'] },
  { label: '포인트·캐릭터', tabs: ['points', 'goals', 'character'] },
  { label: '설정·관리', tabs: ['roster', 'roles', 'mission', 'setup', 'admin'] },
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
  const pageTitle = h('div', { class: 't-page-title' });
  const tabButtons = new Map();

  async function open(id) {
    for (const [tid, btn] of tabButtons) btn.classList.toggle('on', tid === id);
    pageTitle.textContent = TABS.find((t) => t.id === id)?.label ?? '';
    content.replaceChildren(h('p', { class: 'muted' }, '불러오는 중…'));
    try {
      await TABS.find((tab) => tab.id === id).render(content, { open });
    } catch (e) {
      console.error(e);
      content.replaceChildren(h('p', { class: 'banner' }, '불러오지 못했어요. 새로고침해 주세요.'));
    }
  }

  function navButton(tab) {
    const btn = h('button', { class: 't-nav-btn', type: 'button', onclick: () => open(tab.id) },
      h('span', { class: 'ico' }, tab.icon), h('span', null, tab.label));
    tabButtons.set(tab.id, btn);
    return btn;
  }

  const nav = GROUPS.map((g) => h('div', { class: 't-group' },
    h('div', { class: 't-group-label' }, g.label),
    ...g.tabs.map((id) => navButton(TABS.find((t) => t.id === id)))));

  root.replaceChildren(h('div', { class: 'teacher-app' },
    h('aside', { class: 't-sidebar' },
      h('div', { class: 't-brand' }, h('img', { class: 't-logo', src: 'img/logo.webp', alt: '하루 On' })),
      h('nav', { class: 't-nav' }, ...nav),
      h('div', { class: 't-account' },
        h('div', { class: 't-email muted' }, user.email),
        h('button', { class: 'btn secondary small', onclick: async () => { await signOutTeacher(); start(); } }, '로그아웃'))),
    h('div', { class: 't-main' },
      h('header', { class: 't-header' }, pageTitle),
      content)));
  // 반복 과제를 앞으로 2주치 채워 두고 첫 화면을 연다(실패해도 화면은 연다)
  // 1인1역: 시작일이 된 확정 기간을 역할에 반영
  Promise.all([ensureRepeatTasks(), ensureRoleTerms()].map((p) => p.catch((e) => console.error(e)))).finally(() => open(firstTab));
}

start();
