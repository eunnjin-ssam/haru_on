// 학생 앱 셸: 머리줄(이름·나가기) + 화면 + 아래 메뉴. 메뉴로 대시보드·글마당·과제마당·약속마당을 오간다.
import { h } from '../common/ui.js';
import { logoutStudent } from '../common/student-session.js';
import { loadSettings } from '../common/settings.js';
import { renderDashboard } from './dashboard.js';
import { renderMission } from './mission.js';
import { renderWriting } from './writing.js';
import { renderTasks } from './tasks.js';

export async function renderApp(root, student, onLogout) {
  const settings = await loadSettings();
  const menus = settings.names.menus;
  const content = h('main', { class: 'screen' });
  let current = 'dashboard';

  const NAV = [
    ['dashboard', menus.dashboard, '🏠'],
    ['writing', menus.writing, '📖'],
    ['tasks', menus.tasks, '📋'],
    ['stories', menus.stories, '💬'],
  ];
  const navButtons = NAV.map(([id, label, icon]) => h('button', {
    class: 'nav-btn', type: 'button', onclick: () => open(id),
  }, h('span', { class: 'ico' }, icon), h('span', { class: 'lbl' }, label)));

  function logoutButton() {
    let asking = false;
    const btn = h('button', { class: 'logout', type: 'button', onclick: async () => {
      if (!asking) {
        asking = true;
        btn.textContent = '정말 나갈까요?';
        btn.classList.add('confirm');
        setTimeout(() => { asking = false; btn.textContent = '나가기'; btn.classList.remove('confirm'); }, 3000);
        return;
      }
      await logoutStudent();
      onLogout();
    } }, '나가기');
    return btn;
  }

  function openMission() {
    renderMission(root, student, settings, () => { build(); open('dashboard'); });
  }

  async function open(id) {
    current = id;
    NAV.forEach(([nid], i) => navButtons[i].classList.toggle('on', nid === id));
    content.replaceChildren(h('p', { class: 'muted', style: 'padding:24px' }, '불러오는 중…'));
    try {
      if (id === 'dashboard') await renderDashboard(content, student, settings, { openMission });
      else if (id === 'writing') await renderWriting(content, student, settings);
      else if (id === 'tasks') await renderTasks(content, student, settings);
      else content.replaceChildren(h('section', { class: 'card' },
        h('h2', null, NAV.find(([n]) => n === id)[1]),
        h('p', { class: 'muted' }, '곧 만들어요.')));
    } catch (e) {
      console.error(e);
      content.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'banner' }, '불러오지 못했어요. 새로고침해 주세요.')));
    }
  }

  function build() {
    root.replaceChildren(h('div', { class: 'student-app' },
      h('header', { class: 'app-header' }, h('span', { class: 'who' }, `${student.number}번 ${student.name}`), logoutButton()),
      content,
      h('nav', { class: 'bottomnav' }, ...navButtons),
    ));
  }

  build();
  open(current);
}
