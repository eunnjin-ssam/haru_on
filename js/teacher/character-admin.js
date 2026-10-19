// 캐릭터·칭호 관리: 아이템 판매/숨김, 칭호 수여(선생님 수여는 금색), 스마트보드 화면 링크.
import {
  collection, doc, getDocs, setDoc, updateDoc, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG, colorLabel } from '../character/catalog.js';

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

  // 색 이름(한글) 옆에 가격 입력칸, '가격 저장'으로 items/{id}.prices 갱신
  function priceEditor(item) {
    const inputs = {};
    const chips = Object.entries(item.prices ?? {}).map(([c, p]) => {
      const inp = h('input', { type: 'number', min: '0', value: String(p), class: 'price-input' });
      inputs[c] = inp;
      return h('label', { class: 'price-chip' }, h('span', { class: 'pc-name' }, c === 'default' ? '기본' : colorLabel(c)), inp);
    });
    const save = h('button', { class: 'btn small', onclick: () => {
      const prices = {};
      for (const [c, inp] of Object.entries(inputs)) prices[c] = Math.max(0, Number(inp.value) || 0);
      run(() => updateDoc(doc(db, 'items', item.id), { prices }), '가격을 저장했어요');
    } }, '가격 저장');
    return h('div', { class: 'price-editor' }, h('div', { class: 'price-chips' }, ...chips), save);
  }

  function itemsCard() {
    const onSale = items.filter((i) => i.onSale !== false).length;
    const seedBtn = h('button', { class: 'btn secondary', onclick: () => {
      if (items.length && !confirm('도감 기본값으로 다시 넣을까요?\n고친 가격이 기본 가격으로 되돌아가고, 숨긴 아이템도 다시 판매돼요.')) return;
      run(seedItems, '기본 아이템을 넣었어요');
    } }, items.length ? '기본값으로 되돌리기' : '기본 아이템 넣기');
    return h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', null,
          h('h2', null, '아이템 관리'),
          h('p', { class: 'muted small', style: 'margin:0' },
            items.length ? `아이템 ${items.length}개 · 판매중 ${onSale}개 · 숨김 ${items.length - onSale}개. 색 이름 옆 숫자를 고치고 ‘가격 저장’을 누르면 바뀌어요.` : '학생이 캐릭터 상점에서 사는 옷과 소품이에요.')),
        seedBtn),
      items.length === 0 ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아이템이 없어요. ‘기본 아이템 넣기’를 눌러 주세요.')
        : h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '이름'), h('th', null, '칸'), h('th', null, '색·가격 (고쳐서 저장)'), h('th', null, '판매'), h('th', null, ''))),
          h('tbody', null, ...items.map((i) => h('tr', { class: i.onSale === false ? 'item-off' : '' },
            h('td', null, i.name), h('td', null, CAT_LABEL[i.category] ?? i.category),
            h('td', null, priceEditor(i)),
            h('td', null, i.onSale !== false ? h('span', { class: 'badge new' }, '판매중') : h('span', { class: 'badge' }, '숨김')),
            h('td', { class: 'actions' }, h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'items', i.id), { onSale: i.onSale === false }), i.onSale === false ? '다시 판매해요' : '상점에서 숨겼어요') }, i.onSale !== false ? '숨기기' : '판매하기'))))))),
      h('p', { class: 'muted small' }, '숨긴 아이템은 상점에 안 보이지만, 이미 산 학생은 계속 쓸 수 있어요.'),
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
        h('div', { class: 'row' }, ...awards.map((a) => h('button', { class: 'btn secondary small', title: '회수', onclick: () => { if (confirm(`${s.name}의 ‘${a}’ 칭호를 회수할까요?`)) run(() => updateDoc(doc(db, 'profiles', s.sid), { awarded: arrayRemove(a) }), '칭호를 회수했어요'); } }, `${a} ✕`))));
    }).filter(Boolean);

    return h('section', { class: 'card' }, h('h2', null, '칭호 수여 (금색 전용)'),
      h('p', { class: 'muted small', style: 'margin:-2px 0 10px' }, '선생님이 주는 칭호는 금색으로 빛나요. 업적 칭호(독서·기초미션·1인1역)는 학생이 기준을 채우면 자동으로 받아요.'),
      h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '학생'), sel),
        h('label', { class: 'field' }, h('span', null, '칭호 이름'), name),
        h('div', { class: 'row' }, give)),
      h('div', { style: 'margin-top:14px' }, h('h3', null, `수여한 칭호${list.length ? ` (${list.length}명)` : ''}`),
        list.length ? h('div', null, ...list) : h('p', { class: 'muted' }, '아직 수여한 칭호가 없어요.')),
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
