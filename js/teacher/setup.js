// 관리 페이지 > 기본 설정: 처음 한 번 설정 문서를 만든다. 값 바꾸기 화면은 관리 페이지 단계에서.
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { DEFAULT_SETTINGS, DEFAULT_TEACHER_SETTINGS } from '../common/defaults.js';

export async function renderSetup(root, { open }) {
  const snap = await getDoc(doc(db, 'settings', 'main'));

  if (snap.exists()) {
    const s = snap.data();
    root.replaceChildren(h('section', { class: 'card' },
      h('h2', null, '기본 설정'),
      h('p', null, '기본 설정이 저장되어 있어요.'),
      h('ul', null,
        h('li', null, `화폐 이름: ${s.names.currency}`),
        h('li', null, `기초미션: 하루 ${s.mission.perDay}문제, 1문제 ${s.points.mission}점`),
        h('li', null, `글마당: ${s.points.writing}점, 주간 보너스 ${s.points.bonusDays}일 ${s.points.writingBonus}점`),
        h('li', null, `늦은 제출: 마감 후 ${s.lateDays}일까지 절반`),
      ),
      h('p', { class: 'muted' }, '값을 바꾸는 화면은 관리 페이지 단계에서 만들어요.'),
    ));
    return;
  }

  const save = h('button', { class: 'btn', onclick: async () => {
    save.disabled = true;
    try {
      await setDoc(doc(db, 'settings', 'main'), DEFAULT_SETTINGS);
      await setDoc(doc(db, 'settings', 'teacher'), DEFAULT_TEACHER_SETTINGS);
      toast('기본 설정을 저장했어요');
      open('roster');
    } catch (e) {
      console.error(e);
      toast('저장하지 못했어요', 'error');
      save.disabled = false;
    }
  } }, '기본 설정 저장하기');

  root.replaceChildren(h('section', { class: 'card' },
    h('h2', null, '처음 설정'),
    h('p', null, '포인트 값, 칭호 기준, 메뉴 이름 같은 기본 설정을 저장해요. 처음 한 번만 하면 돼요.'),
    h('p', { class: 'muted' }, '기획서의 값(기초미션 1문제 1점, 글마당 2점, 주간 보너스 3일 3점, 늦은 제출 7일 등)으로 시작하고, 나중에 바꿀 수 있어요.'),
    save,
  ));
}
