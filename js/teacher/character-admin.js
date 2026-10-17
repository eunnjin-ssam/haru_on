// 캐릭터·칭호 관리: 아이템 판매/숨김, 칭호 수여(선생님 수여는 금색), 스마트보드 화면 링크.
import {
  collection, doc, getDocs, setDoc, updateDoc, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG } from '../character/catalog.js';

const CAT_LABEL = { hair: '헤어', face: '얼굴', top: '상의', bottom: '하의', shoes: '신발', headAcc: '머리소품', faceAcc: '얼굴소품' };

export async function renderCharacterAdmin(root) {
  let items = []; let profiles = new Map(); let students = [];

  async function load() {
    const [iSnap, pSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'items')),
      getDocs(collection(db, 'profiles')),
      getDocs(collection(db, 'students')),
    ]);
    items = iSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
    profiles = new Map(pSnap.docs.map((d) => [d.id, d.data()]));
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  async function seedItems() {
    for (const [id, it] of Object.entries(CATALOG)) {
      await setDoc(doc(db, 'items', id), { category: it.category, name: it.name, prices: it.prices, onSale: true, starter: !!it.starter }, { merge: true });
    }
  }

  function boardUrl() { return new URL('board.html' + location.search, location.href).href; }

  function itemsCard() {
    return h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', null, '아이템 관리'),
        h('button', { class: 'btn secondary', onclick: () => run(seedItems, '기본 아이템을 넣었어요') }, '기본 아이템 넣기')),
      items.length === 0 ? h('p', { class: 'muted' }, '아이템이 없어요. ‘기본 아이템 넣기’를 눌러 주세요.')
        : h('table', null, h('thead', null, h('tr', null, h('th', null, '이름'), h('th', null, '칸'), h('th', null, '가격'), h('th', null, '판매'), h('th', null, ''))),
          h('tbody', null, ...items.map((i) => h('tr', null,
            h('td', null, i.name), h('td', null, CAT_LABEL[i.category] ?? i.category),
            h('td', { class: 'muted small' }, Object.entries(i.prices ?? {}).map(([c, p]) => `${c} ${p}`).join(', ')),
            h('td', null, i.onSale !== false ? '판매중' : '숨김'),
            h('td', { class: 'actions' }, h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'items', i.id), { onSale: i.onSale === false }), '바꿨어요') }, i.onSale !== false ? '숨기기' : '판매하기')))))),
      h('p', { class: 'muted small' }, '색·가격은 도감 기본값을 써요. 자세한 가격 수정은 다음 단계에서 열어요.'),
    );
  }

  function awardCard() {
    const sel = h('select', null, h('option', { value: '' }, '학생 고르기'), ...students.map((s) => h('option', { value: s.sid }, `${s.number}번 ${s.name}`)));
    const name = h('input', { type: 'text', placeholder: '수여할 칭호 (예) 우리반 영웅' });
    const give = h('button', { class: 'btn', onclick: () => {
      if (!sel.value || !name.value.trim()) { toast('학생과 칭호를 입력해 주세요.', 'error'); return; }
      run(() => updateDoc(doc(db, 'profiles', sel.value), { awarded: arrayUnion(name.value.trim()) }), '칭호를 수여했어요').then(() => { name.value = ''; });
    } }, '수여');

    const list = students.map((s) => {
      const awards = profiles.get(s.sid)?.awarded ?? [];
      if (awards.length === 0) return null;
      return h('div', { class: 'req-row' }, h('span', null, `${s.number}번 ${s.name}: ${awards.join(', ')}`),
        h('div', { class: 'row' }, ...awards.map((a) => h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'profiles', s.sid), { awarded: arrayRemove(a) }), '지웠어요') }, `${a} ✕`))));
    }).filter(Boolean);

    return h('section', { class: 'card' }, h('h2', null, '칭호 수여 (금색 전용)'),
      h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '학생'), sel),
        h('label', { class: 'field' }, h('span', null, '칭호 이름'), name),
        h('div', { class: 'row' }, give)),
      list.length ? h('div', { style: 'margin-top:12px' }, h('h3', null, '수여한 칭호'), ...list) : null,
      h('p', { class: 'muted small' }, '업적 칭호(독서·기초미션·1인1역)는 학생이 기준을 채우면 자동으로 받아요.'),
    );
  }

  function boardCard() {
    return h('section', { class: 'card' }, h('h2', null, '우리 반 캐릭터 큰 화면 (스마트보드)'),
      h('p', { class: 'muted' }, '반 전체 캐릭터를 3D로 크게 띄워요. 새 탭에서 열려요.'),
      h('a', { class: 'btn', href: boardUrl(), target: '_blank', rel: 'noopener' }, '큰 화면 열기'));
  }

  function draw() { root.replaceChildren(itemsCard(), awardCard(), boardCard()); }

  await load();
  draw();
}
