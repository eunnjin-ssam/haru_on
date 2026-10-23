// 관리: 기본 설정. 처음 한 번 저장하고, 그 뒤로는 값(이름·포인트·기준 등)을 바꾼다.
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteField,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { DEFAULT_SETTINGS, DEFAULT_TEACHER_SETTINGS, writingMinOf } from '../common/defaults.js';

const MENU_KEYS = [['dashboard', '대시보드'], ['writing', '글마당'], ['stories', '약속마당'], ['tasks', '과제마당'], ['myweek', '나의마당'], ['character', '내 캐릭터'], ['shop', '상점']];
const TITLE_CATS = [['reading', '독서(글마당 편수)'], ['mission', '기초미션(참여일)'], ['role', '1인1역(완료일)']];

const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);
const numInput = (v) => h('input', { type: 'number', value: String(v ?? 0), style: 'width:110px' });
const txtInput = (v) => h('input', { type: 'text', value: v ?? '' });
const num = (el) => Number(el.value) || 0;
// 제목을 누르면 펼쳐지고 다시 누르면 접히는 섹션
const fold = (title, ...body) => h('details', { class: 'setup-sec' }, h('summary', null, title), h('div', { class: 'setup-body' }, ...body));

export async function renderSetup(root, { open }) {
  const [mainSnap, teacherSnap] = await Promise.all([
    getDoc(doc(db, 'settings', 'main')),
    getDoc(doc(db, 'settings', 'teacher')),
  ]);

  // 처음 한 번: 기본값 저장
  if (!mainSnap.exists()) {
    const save = h('button', { class: 'btn', onclick: async () => {
      save.disabled = true;
      try {
        await setDoc(doc(db, 'settings', 'main'), DEFAULT_SETTINGS);
        await setDoc(doc(db, 'settings', 'teacher'), DEFAULT_TEACHER_SETTINGS);
        toast('기본 설정을 저장했어요');
        open('roster');
      } catch (e) { console.error(e); toast('저장하지 못했어요', 'error'); save.disabled = false; }
    } }, '기본 설정 저장하기');
    root.replaceChildren(h('section', { class: 'card' },
      h('h2', null, '처음 설정'),
      h('p', null, '포인트 값, 칭호 기준, 메뉴 이름 같은 기본 설정을 저장해요. 처음 한 번만 하면 돼요.'),
      h('p', { class: 'muted' }, '기획서의 값(기초미션 1문제 1점, 글마당 2점, 주간 보너스 3일 3점 등)으로 시작하고, 나중에 바꿀 수 있어요.'),
      save,
    ));
    return;
  }

  const s = mainSnap.data();
  const t = teacherSnap.exists() ? teacherSnap.data() : DEFAULT_TEACHER_SETTINGS;

  async function save(path, data, done) {
    try { await updateDoc(doc(db, 'settings', path), data); toast(done ?? '저장했어요'); }
    catch (e) { console.error(e); toast('저장하지 못했어요', 'error'); }
  }

  // ----- 학생 메뉴 켜기/끄기 (대시보드는 첫 화면이라 항상 켬) -----
  function menusCard() {
    const hidden = new Set(s.hiddenMenus ?? []);
    const keys = MENU_KEYS.filter(([k]) => k !== 'dashboard');
    const boxes = keys.map(([k, label]) => {
      const cb = h('input', { type: 'checkbox', checked: !hidden.has(k) });
      const state = h('span', { class: 'mt-state' });
      const row = h('label', { class: 'menu-toggle' },
        h('span', { class: 'mt-name' }, s.names.menus?.[k] || label), state, cb, h('span', { class: 'switch' }));
      const sync = () => { row.classList.toggle('off', !cb.checked); state.textContent = cb.checked ? '보임' : '숨김'; };
      cb.addEventListener('change', sync);
      sync();
      return { k, cb, row };
    });
    const btn = h('button', { class: 'btn', onclick: () => {
      const hiddenMenus = boxes.filter((b) => !b.cb.checked).map((b) => b.k);
      save('main', { hiddenMenus }, hiddenMenus.length ? `메뉴 ${hiddenMenus.length}개를 숨겼어요` : '모든 메뉴를 보여 줘요');
    } }, '메뉴 저장');
    return fold('학생 메뉴 보이기/숨기기',
      h('p', { class: 'muted small', style: 'margin:0 0 10px' }, '지금 쓰지 않는 메뉴를 끄면 학생 화면에서 사라져요. 기록은 지워지지 않고, 다시 켜면 그대로 보여요. 학생이 앱을 새로 열면 바뀐 메뉴가 보여요. (대시보드는 첫 화면이라 항상 보여요)'),
      h('div', { class: 'menu-toggles' }, ...boxes.map((b) => b.row)),
      h('div', { class: 'row', style: 'margin-top:12px' }, btn));
  }

  // ----- 이름 -----
  function namesCard() {
    const currency = txtInput(s.names.currency);
    const menus = MENU_KEYS.map(([k]) => txtInput(s.names.menus?.[k]));
    const btn = h('button', { class: 'btn', onclick: () => {
      const data = { 'names.currency': currency.value.trim() || '포인트' };
      MENU_KEYS.forEach(([k], i) => { data[`names.menus.${k}`] = menus[i].value.trim() || k; });
      save('main', data, '이름을 바꿨어요');
    } }, '이름 저장');
    return fold('이름',
      h('div', { class: 'role-form' },
        field('화폐 이름 (예: 포인트, 별, 우리반 코인)', currency),
        ...MENU_KEYS.map(([k, label], i) => field(`메뉴 이름: ${label}`, menus[i])),
        h('div', { class: 'row' }, btn)));
  }

  // ----- 포인트·기간 -----
  function pointsCard() {
    const perDay = numInput(s.mission?.perDay ?? 5);
    const mission = numInput(s.points.mission);
    const writing = numInput(s.points.writing);
    const bonus = numInput(s.points.writingBonus);
    const bonusDays = numInput(s.points.bonusDays);
    const agenda = numInput(s.storyAgendaLikes);
    const wMin = writingMinOf(s);
    const minSummary = numInput(wMin.summary);
    const minThoughts = numInput(wMin.thoughts);
    const btn = h('button', { class: 'btn', onclick: () => save('main', {
      'mission.perDay': num(perDay),
      'points.mission': num(mission), 'points.writing': num(writing),
      'points.writingBonus': num(bonus), 'points.bonusDays': num(bonusDays),
      storyAgendaLikes: num(agenda),
      'writingMin.summary': num(minSummary), 'writingMin.thoughts': num(minThoughts),
    }, '포인트·기준을 바꿨어요') }, '포인트 저장');
    return fold('포인트·기준',
      h('div', { class: 'role-form' },
        field('기초미션 하루 문제 수', perDay),
        field('기초미션 1문제 점수', mission),
        field('글마당 점수 (하루 1회)', writing),
        field('글마당 주간 보너스 점수', bonus),
        field('글마당 줄거리 최소 글자 수 (띄어쓰기 빼고, 0이면 제한 없음)', minSummary),
        field('글마당 생각과 느낌 최소 글자 수 (띄어쓰기 빼고, 0이면 제한 없음)', minThoughts),
        field('주간 보너스 기준 일수', bonusDays),
        field('약속마당 회의 안건 공감 기준 수', agenda),
        h('div', { class: 'row' }, btn)));
  }

  // ----- 칭호 기준 -----
  function titlesCard() {
    const rows = {};
    const sections = TITLE_CATS.map(([cat, label]) => {
      const arr = s.titles?.[cat] ?? [];
      rows[cat] = arr.map((it) => ({ name: txtInput(it.name), min: numInput(it.min) }));
      return h('div', null, h('h3', null, label),
        h('table', null, h('thead', null, h('tr', null, h('th', null, '단계'), h('th', null, '칭호 이름'), h('th', null, '기준 수'))),
          h('tbody', null, ...rows[cat].map((r, i) => h('tr', null,
            h('td', null, ['초보', '중급', '고급', '마스터', '그랜드마스터'][i] ?? `${i + 1}`),
            h('td', null, r.name), h('td', null, r.min))))));
    });
    const btn = h('button', { class: 'btn', onclick: () => {
      const data = {};
      for (const [cat] of TITLE_CATS) data[`titles.${cat}`] = rows[cat].map((r) => ({ name: r.name.value.trim(), min: num(r.min) }));
      save('main', data, '칭호 기준을 바꿨어요');
    } }, '칭호 기준 저장');
    return fold('칭호 기준',
      ...sections, h('div', { class: 'row' }, btn));
  }

  // ----- 씨앗 나무 -----
  function treeCard() {
    const arr = s.tree ?? [];
    const rows = arr.map((it) => ({ name: txtInput(it.name), min: numInput(it.min) }));
    const btn = h('button', { class: 'btn', onclick: () => save('main', { tree: rows.map((r) => ({ name: r.name.value.trim(), min: num(r.min) })) }, '씨앗 나무 기준을 바꿨어요') }, '씨앗 나무 저장');
    return fold('씨앗 나무 단계 (누적 포인트 기준)',
      h('table', null, h('thead', null, h('tr', null, h('th', null, '단계 이름'), h('th', null, '시작 누적 포인트'))),
        h('tbody', null, ...rows.map((r) => h('tr', null, h('td', null, r.name), h('td', null, r.min))))),
      h('div', { class: 'row' }, btn));
  }

  // ----- 살핌판 기준 -----
  function careCard() {
    const c = t.care ?? {};
    const moodNeg = numInput(c.moodNegative ?? 3);
    const tasksLeft = numInput(c.tasksLeft ?? 2);
    const activity = numInput(Math.round((c.activityRate ?? 0.5) * 100));
    const custom = numInput(c.customRepeat ?? 2);
    const late = numInput(c.lateRepeat ?? 2);
    const dropFrom = numInput(Math.round((c.dropFrom ?? 0.9) * 100));
    const dropTo = numInput(Math.round((c.dropTo ?? 0.3) * 100));
    const btn = h('button', { class: 'btn', onclick: () => save('teacher', {
      'care.moodNegative': num(moodNeg), 'care.tasksLeft': num(tasksLeft),
      'care.activityRate': num(activity) / 100,
      'care.customRepeat': num(custom), 'care.lateRepeat': num(late),
      'care.dropFrom': num(dropFrom) / 100, 'care.dropTo': num(dropTo) / 100,
    }, '살핌판 기준을 바꿨어요') }, '살핌판 기준 저장');
    return fold('살핌판 기준',
      h('div', { class: 'role-form' },
        field('최근 5일 중 부정 기분 며칠 이상이면 살펴보기', moodNeg),
        field('최근 5일 중 기분을 직접 쓴 날이 며칠 이상이면 살펴보기', custom),
        field('남은 과제 몇 개 이상이면 살펴보기', tasksLeft),
        field('최근 2주 늦은 제출·다시 해오기가 몇 번 이상이면 살펴보기', late),
        field('최근 2주 활동 완료율(%) 이 값 미만이면 살펴보기', activity),
        field('갑작스러운 변화: 지난 3주 평균 완료율(%)이 이 값 이상이었는데…', dropFrom),
        field('…이번 주 완료율(%)이 이 값 이하로 떨어지면 살펴보기', dropTo),
        h('div', { class: 'row' }, btn)));
  }

  // ----- 학생 화면 열리는 시간(쉬는시간, 월~금 공통) -----
  // settings/main.access.enabled·windows. 그 밖의 시간·방과 후·주말은 잠김. 선생님 직접 열기·잠그기는 머리줄 버튼으로.
  function accessCard() {
    const acc = s.access ?? {};
    const on = h('input', { type: 'checkbox', checked: !!acc.enabled });
    const list = h('div', { class: 'win-list' });
    const rows = [];
    const addRow = (w = { start: '', end: '' }) => {
      const st = h('input', { type: 'time', value: w.start });
      const en = h('input', { type: 'time', value: w.end });
      const row = h('div', { class: 'win-row' }, st, h('span', { class: 'muted' }, '~'), en,
        h('button', { class: 'pc-del', title: '이 시간 빼기', onclick: (e) => { e.preventDefault(); rows.splice(rows.indexOf(item), 1); row.remove(); } }, '✕'));
      const item = { st, en, row };
      rows.push(item); list.append(row);
    };
    (acc.windows ?? []).forEach(addRow);
    if (!rows.length) addRow();
    const btn = h('button', { class: 'btn', onclick: () => {
      const windows = [];
      for (const { st, en } of rows) {
        if (!st.value && !en.value) continue;
        if (!st.value || !en.value || st.value >= en.value) { toast('시작이 끝보다 빠르게 시간을 모두 넣어 주세요.', 'error'); return; }
        windows.push({ start: st.value, end: en.value });
      }
      windows.sort((a, b) => a.start.localeCompare(b.start));
      if (on.checked && !windows.length) { toast('열어 둘 쉬는시간을 하나 이상 넣어 주세요.', 'error'); return; }
      save('main', { 'access.enabled': on.checked, 'access.windows': windows }, on.checked ? '쉬는시간에만 열리게 했어요' : '시간표를 껐어요(늘 열림)');
    } }, '시간 저장');
    return fold('학생 화면 열리는 시간 (쉬는시간)',
      h('p', { class: 'muted small', style: 'margin:0 0 10px' }, '켜 두면 월~금 아래 시간에만 학생 화면이 열리고, 그 밖의 시간·방과 후·주말에는 잠겨요. 학생은 로그인한 채로 잠금 화면을 봐요. 화면 위쪽의 ‘학생 화면’ 버튼을 한 번 누르면 열림 ↔ 잠김이 바뀌고, 그대로 두면 다음 쉬는시간 전후로 저절로 시간표대로 돌아가요.'),
      h('label', { class: 'menu-toggle' }, h('span', { class: 'mt-name' }, '쉬는시간에만 열기'), on, h('span', { class: 'switch' })),
      h('div', { style: 'margin-top:10px' }, list),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn secondary small', onclick: () => addRow() }, '+ 시간 추가'), btn));
  }

  // ----- 쉬는 날(공휴일·재량휴업일): 반 전체가 등교하지 않은 평일 -----
  // attendance/{날짜}.noSchool = true. 살핌판 활동률·1인1역 완료율에서 그날을 아예 뺀다.
  function offDaysCard() {
    const list = h('div', { class: 'offday-list' });
    const date = h('input', { type: 'date' });
    const ymd = (v) => v.replaceAll('-', '');
    const label = (id) => {
      const d = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8)));
      return `${+id.slice(4, 6)}월 ${+id.slice(6, 8)}일(${'일월화수목금토'[d.getUTCDay()]})`;
    };
    async function refresh() {
      const snap = await getDocs(query(collection(db, 'attendance'), where('noSchool', '==', true)));
      const ids = snap.docs.map((d) => d.id).sort();
      list.replaceChildren(...(ids.length
        ? ids.map((id) => h('span', { class: 'offday' }, `${id.slice(0, 4)}년 ${label(id)}`,
          h('button', { class: 'pc-del', title: '쉬는 날에서 빼기', onclick: async () => {
            try { await updateDoc(doc(db, 'attendance', id), { noSchool: deleteField() }); toast('뺐어요'); } catch (e) { console.error(e); toast('안 됐어요', 'error'); }
            refresh();
          } }, '✕')))
        : [h('p', { class: 'muted', style: 'margin:0' }, '아직 없어요.')]));
    }
    const add = h('button', { class: 'btn', onclick: async () => {
      if (!date.value) { toast('날짜를 골라 주세요.', 'error'); return; }
      const id = ymd(date.value);
      const dow = new Date(`${date.value}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) { toast('토·일요일은 원래 계산에 안 들어가요. 평일을 골라 주세요.', 'error'); return; }
      try { await setDoc(doc(db, 'attendance', id), { noSchool: true }, { merge: true }); toast(`${label(id)}을 쉬는 날로 넣었어요`); date.value = ''; }
      catch (e) { console.error(e); toast('안 됐어요', 'error'); }
      refresh();
    } }, '쉬는 날 넣기');
    refresh().catch((e) => console.error(e));
    return fold('쉬는 날 (공휴일·재량휴업일)',
      h('p', { class: 'muted small', style: 'margin:0 0 10px' }, '반 전체가 등교하지 않은 평일을 넣어 주세요. 그날은 살핌판 활동률과 1인1역 완료율 계산에서 아예 빠져요. 미리 넣어 둬도 돼요.'),
      h('div', { class: 'row' }, date, add),
      h('div', { style: 'margin-top:12px' }, list));
  }

  root.replaceChildren(
    h('section', { class: 'card' }, h('h2', null, '설정'),
      h('p', { class: 'muted' }, '학생 메뉴·이름·포인트·기준을 바꿀 수 있어요. 각 칸을 고치고 그 칸의 저장 버튼을 누르면 바로 반영돼요.')),
    menusCard(), accessCard(), namesCard(), pointsCard(), titlesCard(), treeCard(), careCard(), offDaysCard(),
  );
}
