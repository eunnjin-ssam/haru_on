// 학생 앱 셸: 왼쪽 사이드바(메뉴) + 상단바(건의·신고, 나가기) + 화면. 가로 넓은 디벗에 맞춘다.
import { h } from '../common/ui.js';
import { logoutStudent } from '../common/student-session.js';
import { loadSettings } from '../common/settings.js';
import { renderDashboard } from './dashboard.js';
import { renderMission } from './mission.js';
import { renderWriting } from './writing.js';
import { renderTasks } from './tasks.js';
import { renderStories } from './stories.js';
import { renderShop } from './shop.js';
import { renderCharacter } from './character.js';
import { renderMyWeek } from './myweek.js';
import { openFeedback } from './feedback.js';

export async function renderApp(root, student, onLogout) {
  const settings = await loadSettings();
  const menus = settings.names.menus;
  const content = h('main', { class: 'screen' });
  let current = 'dashboard';

  const NAV = [
    ['dashboard', menus.dashboard, '🏠'],
    ['writing', menus.writing, '📖'],
    ['stories', menus.stories, '💬'],
    ['tasks', menus.tasks, '📋'],
    ['myweek', menus.myweek, '📅'],
    ['character', menus.character, '🧑'],
    ['shop', menus.shop, '🛍️'],
  ];
  const navButtons = NAV.map(([id, label, icon]) => h('button', {
    class: 'nav-btn', type: 'button', onclick: () => open(id),
  }, h('span', { class: 'ico' }, icon), h('span', { class: 'lbl' }, label)));

  const pageTitle = h('div', { class: 'page-title' });

  function logoutButton() {
    let asking = false;
    const btn = h('button', { class: 'pill', type: 'button', onclick: async () => {
      if (!asking) {
        asking = true; btn.textContent = '정말 나갈까요?'; btn.classList.add('danger');
        setTimeout(() => { asking = false; btn.textContent = '나가기'; btn.classList.remove('danger'); }, 3000);
        return;
      }
      await logoutStudent(); onLogout();
    } }, '나가기');
    return btn;
  }

  function openMission() {
    renderMission(root, student, settings, () => { build(); open('dashboard'); });
  }

  async function open(id) {
    current = id;
    NAV.forEach(([nid], i) => navButtons[i].classList.toggle('on', nid === id));
    pageTitle.textContent = NAV.find(([n]) => n === id)?.[1] ?? '';
    content.replaceChildren(h('p', { class: 'muted', style: 'padding:24px' }, '불러오는 중…'));
    try {
      if (id === 'dashboard') await renderDashboard(content, student, settings, { openMission });
      else if (id === 'writing') await renderWriting(content, student, settings);
      else if (id === 'tasks') await renderTasks(content, student, settings);
      else if (id === 'stories') await renderStories(content, student, settings);
      else if (id === 'shop') await renderShop(content, student, settings);
      else if (id === 'character') await renderCharacter(content, student, settings);
      else if (id === 'myweek') await renderMyWeek(content, student, settings);
    } catch (e) {
      console.error(e);
      content.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'banner' }, '불러오지 못했어요. 새로고침해 주세요.')));
    }
  }

  function build() {
    root.replaceChildren(h('div', { class: 'student-app' },
      h('aside', { class: 'sidebar' },
        h('div', { class: 'brand' },
          h('span', { class: 'brand-logo' }, '🌱'),
          h('div', null, h('div', { class: 'brand-name' }, '우리 반'),
            h('div', { class: 'brand-sub' }, `${student.number}번 ${student.name}`))),
        h('nav', { class: 'side-nav' }, ...navButtons)),
      h('div', { class: 'main-col' },
        h('header', { class: 'topbar' },
          pageTitle,
          h('div', { class: 'top-actions' },
            h('button', { class: 'pill', type: 'button', onclick: () => openFeedback(student, settings) }, '💬 건의·신고'),
            logoutButton())),
        content)));
  }

  build();
  open(current);
}
