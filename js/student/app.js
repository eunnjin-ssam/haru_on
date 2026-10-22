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
import { openPinChange } from './pin.js';
import { showNotices } from './notice-popup.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { accessState } from '../common/access.js';

export async function renderApp(root, student, onLogout) {
  const settings = await loadSettings();
  const menus = settings.names.menus;
  const content = h('main', { class: 'screen' });
  let current = 'dashboard';

  // 선생님이 기본 설정에서 끈 메뉴는 빼고 보여 준다(대시보드는 항상 보임)
  const hidden = new Set(settings.hiddenMenus ?? []);
  const NAV = [
    ['dashboard', menus.dashboard, '🏠'],
    ['writing', menus.writing, '📖'],
    ['stories', menus.stories, '💬'],
    ['tasks', menus.tasks, '📋'],
    ['myweek', menus.myweek, '📅'],
    ['character', menus.character, '🧑'],
    ['shop', menus.shop, '🛍️'],
  ].filter(([id]) => id === 'dashboard' || !hidden.has(id));
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
      stopLock(); await logoutStudent(); onLogout();
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
      if (id === 'dashboard') {
        await renderDashboard(content, student, settings, {
          openMission,
          openTasks: hidden.has('tasks') ? null : () => open('tasks'),
        });
      }
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
          h('img', { class: 'brand-img', src: 'img/logo.webp', alt: '하루 On · 슬기로운 학급생활' }),
          h('div', { class: 'brand-sub' }, `${student.number}번 ${student.name}`)),
        h('nav', { class: 'side-nav' }, ...navButtons)),
      h('div', { class: 'main-col' },
        h('header', { class: 'topbar' },
          pageTitle,
          h('div', { class: 'top-actions' },
            h('button', { class: 'pill', type: 'button', onclick: () => openFeedback(student, settings) }, '💬 건의·신고'),
            h('button', { class: 'pill', type: 'button', onclick: () => openPinChange(student) }, '🔑 비밀번호 바꾸기'),
            logoutButton())),
        content)));
  }

  let access = settings.access ?? null; let unsub = null; let timer = null; let cover = null; // 잠금 화면 상태
  build();
  open(current);
  showNotices(student); // 새소식 팝업(게시 중이고 아직 확인 안 한 것)
  startLock();

  // ---- 잠금 화면: 쉬는시간이 아니거나 선생님이 잠갔으면 화면 전체를 덮는다(로그인은 그대로) ----
  // 선생님이 바꾸면 바로 반영되도록 설정 문서를 지켜보고, 시간이 흐르는 것도 20초마다 다시 본다.
  function paintLock() {
    const st = accessState(access);
    if (!st.locked) { if (cover) { cover.remove(); cover = null; } return; }
    const msg = st.reason === 'lock' ? '선생님이 잠깐 잠갔어요.' : '지금은 수업 시간이에요.';
    const next = st.next ? `다음에 열리는 시간: ${st.next}` : '선생님이 열어 주면 다시 쓸 수 있어요.';
    const box = h('div', { class: 'lock-box' },
      h('div', { class: 'lock-ico' }, '🔒'),
      h('h2', null, msg),
      h('p', null, '쉬는 시간에 다시 만나요!'),
      h('p', { class: 'lock-next' }, next),
      h('p', { class: 'muted small' }, `${student.number}번 ${student.name}`));
    if (!cover) { cover = h('div', { class: 'lock-cover' }); document.body.append(cover); }
    cover.replaceChildren(box);
  }
  function startLock() {
    paintLock();
    unsub = onSnapshot(doc(db, 'settings', 'main'), (snap) => { access = snap.data()?.access ?? null; paintLock(); }, (e) => console.error(e));
    timer = setInterval(paintLock, 20000);
  }
  function stopLock() {
    if (unsub) unsub(); if (timer) clearInterval(timer); if (cover) cover.remove();
    unsub = null; timer = null; cover = null;
  }
}
