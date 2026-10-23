// 캐릭터·칭호 관리: 아이템 판매/숨김, 칭호 수여(선생님 수여는 금색).
import {
  collection, doc, getDocs, setDoc, updateDoc, writeBatch, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG, colorLabel, colorHex, COLORS, COLOR_LIST, lookOf } from '../character/catalog.js';
import { drawItem, drawFront } from '../character/voxel2d.js';
import { renderCharacter3D } from '../character/voxel3d.js';
import { loadSettings } from '../common/settings.js';

const CAT_LABEL = { hair: '헤어', face: '얼굴', skin: '얼굴 색', top: '상의', bottom: '하의', shoes: '신발', headAcc: '머리 소품', faceAcc: '얼굴 소품', hand: '손 소품', back: '기타 소품', pet: '펫' };

export async function renderCharacterAdmin(root) {
  let items = []; let profiles = new Map(); let students = [];

  async function load() {
    const [iSnap, pSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'items')),
      getDocs(collection(db, 'profiles')),
      getDocs(collection(db, 'students')),
    ]);
    items = iSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    profiles = new Map(pSnap.docs.map((d) => [d.id, d.data()]));
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  async function seedItems() {
    for (const [id, it] of Object.entries(CATALOG)) {
      await setDoc(doc(db, 'items', id), { category: it.category, name: it.name, nameEdited: false, prices: it.prices, onSale: !it.retired, starter: !!it.starter }, { merge: true }); // 판매를 그만둔 아이템은 숨긴 채로
    }
  }

  // 추천 가격 적용: 지금 상점에 있는 색은 그대로 두고 값만 도감 가격으로 바꾼다(판매/숨김도 그대로).
  // 선생님이 추가한 색처럼 도감에 없는 색은 그 아이템의 도감 가격(가장 높은 값)을 쓴다.
  async function applyRecommended() {
    let b = writeBatch(db); let n = 0;
    for (const it of items) {
      const cat = CATALOG[it.id];
      if (!cat) continue;
      const base = Math.max(...Object.values(cat.prices));
      const prices = {};
      for (const c of Object.keys(it.prices ?? {})) prices[c] = (c === 'default' && cat.starter) ? 0 : (cat.prices[c] ?? base);
      b.update(doc(db, 'items', it.id), { prices });
      if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); }
    }
    await b.commit();
  }


  // 색 이름(한글) 옆에 가격 입력칸 + ✕(색 지우기), 아래에 색 추가. '가격 저장'으로 items/{id}.prices 갱신
  // 색을 지워도 이미 그 색을 산 학생은 계속 가지고 있어요(상점에서만 사라짐).
  function priceEditor(item) {
    const inputs = {};
    const current = () => {
      const prices = {};
      for (const [c, inp] of Object.entries(inputs)) prices[c] = Math.max(0, Number(inp.value) || 0);
      return prices;
    };
    const save = (prices, msg) => run(() => updateDoc(doc(db, 'items', item.id), { prices }), msg);
    const colors = Object.keys(item.prices ?? {});
    const chips = colors.map((c) => {
      const inp = h('input', { type: 'number', min: '0', value: String(item.prices[c]), class: 'price-input' });
      inputs[c] = inp;
      // 기본(무료) 아이템의 '기본' 색은 모두가 받는 거라 지울 수 없게 한다
      const locked = c === 'default' && item.starter;
      const del = locked || colors.length <= 1 ? null : h('button', { class: 'pc-del', title: `${colorLabel(c)} 지우기`, onclick: (e) => {
        e.preventDefault();
        if (!confirm(`‘${item.name}’의 ${c === 'default' ? '기본' : colorLabel(c)} 색을 상점에서 지울까요?\n이미 산 학생은 계속 쓸 수 있어요.`)) return;
        const prices = current(); delete prices[c];
        save(prices, '색을 지웠어요');
      } }, '✕');
      return h('label', { class: 'price-chip' },
        h('span', { class: 'pc-dot', style: `background:${c === 'default' ? (CATALOG[item.id]?.defColor ?? COLORS.default) : colorHex(c)}` }),
        h('span', { class: 'pc-name' }, c === 'default' ? '기본' : colorLabel(c)), inp, del);
    });
    // 색 추가: 아직 없는 색 고르기 + 가격
    // 얼굴 표정·반창고처럼 색이 고정된 아이템(모양 함수가 색을 받지 않음)은 색을 추가할 수 없다
    const fixedColor = CATALOG[item.id]?.boxes.length === 0;
    const missing = fixedColor ? [] : COLOR_LIST.filter((c) => !colors.includes(c));
    const addSel = h('select', { class: 'pc-add-sel' }, h('option', { value: '' }, '+ 색 추가'), ...missing.map((c) => h('option', { value: c }, colorLabel(c))));
    const addPrice = h('input', { type: 'number', min: '0', class: 'price-input', placeholder: '가격', value: String(Math.max(...Object.values(item.prices ?? { x: 10 }))) });
    const addBtn = h('button', { class: 'btn secondary small', onclick: () => {
      if (!addSel.value) { toast('추가할 색을 골라 주세요.', 'error'); return; }
      save({ ...current(), [addSel.value]: Math.max(0, Number(addPrice.value) || 0) }, `${colorLabel(addSel.value)} 색을 추가했어요`);
    } }, '추가');
    return h('div', { class: 'price-editor' },
      h('div', { class: 'price-chips' }, ...chips),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => save(current(), '가격을 저장했어요') }, '가격 저장'),
        missing.length ? h('span', { class: 'pc-add' }, addSel, addPrice, addBtn) : null));
  }

  // 아이템 이름 칸: '이름 바꾸기'를 누르면 그 자리에서 고친다. 바꾼 이름은 nameEdited로 표시해 도감 이름으로 덮어쓰지 않는다.
  function nameCell(item) {
    const td = h('td', { class: 'item-name-cell' });
    const orig = CATALOG[item.id]?.name;
    const show = () => td.replaceChildren(...[
      h('b', null, item.name),
      item.nameEdited && orig && orig !== item.name ? h('div', { class: 'muted small' }, `원래 이름: ${orig}`) : null,
      h('button', { class: 'linkish small', onclick: edit }, '이름 바꾸기'),
    ].filter(Boolean));
    function edit() {
      const inp = h('input', { type: 'text', value: item.name, maxlength: '20', class: 'name-input' });
      const save = () => {
        const v = inp.value.trim();
        if (!v) { toast('이름을 써 주세요.', 'error'); return; }
        if (v === item.name) { show(); return; }
        run(() => updateDoc(doc(db, 'items', item.id), { name: v, nameEdited: true }), '이름을 바꿨어요');
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') show(); });
      td.replaceChildren(...[
        inp,
        h('div', { class: 'row', style: 'margin-top:6px;gap:6px' },
          h('button', { class: 'btn small', onclick: save }, '저장'),
          h('button', { class: 'btn secondary small', onclick: show }, '취소'),
          item.nameEdited && orig ? h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'items', item.id), { name: orig, nameEdited: false }), '원래 이름으로 되돌렸어요') }, '원래 이름으로') : null),
      ].filter(Boolean));
      inp.focus(); inp.select();
    }
    show();
    return td;
  }

  let cat = 'hair'; // 보고 있는 칸
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
        items.length ? h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => {
            if (!confirm('모든 아이템 가격을 추천 가격으로 바꿀까요?\n색과 판매/숨김은 그대로이고, 이미 산 아이템도 학생에게 그대로 남아요.')) return;
            run(applyRecommended, '추천 가격을 적용했어요');
          } }, '추천 가격 적용'),
          seedBtn) : seedBtn),
      items.length === 0 ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아이템이 없어요. ‘기본 아이템 넣기’를 눌러 주세요.') : null,
      items.length === 0 ? null : h('div', { class: 'seg-tabs', style: 'margin-top:12px' }, ...Object.entries(CAT_LABEL).map(([k, label]) => {
        const n = items.filter((i) => i.category === k).length;
        return n ? h('button', { class: `seg${cat === k ? ' on' : ''}`, onclick: () => { cat = k; draw(); } }, `${label} ${n}`) : null;
      })),
      items.length === 0 ? null
        : h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, '이름'), h('th', null, '색·가격 (고쳐서 저장, ✕로 색 지우기)'), h('th', null, '판매'), h('th', null, ''))),
          h('tbody', null, ...items.filter((i) => i.category === cat).map((i) => h('tr', { class: i.onSale === false ? 'item-off' : '' },
            h('td', { class: 'item-pic' }, (() => {
              const cv = h('canvas', { width: 56, height: 56 });
              queueMicrotask(() => { if (CATALOG[i.id]) drawItem(cv, i.id, Object.keys(i.prices ?? {})[0] ?? 'default'); });
              return cv;
            })()),
            nameCell(i),
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

  // 우리 반 캐릭터: 학생 화면 '우리 반'처럼 반 전체 정면 모습. 누르면 3D로 크게(칭호 함께)
  let settings = null;
  function titleOf(p) {
    const t = p?.title; if (!t) return null;
    if (t.startsWith('award_')) { const name = (p.awarded ?? [])[Number(t.split('_')[1])]; return name ? { name, color: (settings?.titleColors ?? [])[4] ?? '#f1c40f' } : null; }
    const [c, i] = t.split('_'); const def = settings?.titles?.[c]?.[Number(i)];
    return def ? { name: def.name, color: (settings?.titleColors ?? [])[Number(i)] ?? '#ffffff' } : null;
  }
  function openStudent(s, p) {
    const box = h('div', { class: 'char-stage', style: 'height:380px' });
    let view = null;
    const close = () => { if (view) view.dispose(); dlg.remove(); };
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { style: 'margin:0' }, `${s.number}번 ${s.name}`), h('button', { class: 'btn secondary small', onclick: close }, '닫기')),
      box, h('p', { class: 'muted small', style: 'margin:0;text-align:center' }, '밀어서 돌려 보세요')));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.append(dlg);
    const t = titleOf(p);
    view = renderCharacter3D(box, lookOf(p?.equip), t ? { title: t.name, titleColor: t.color } : {});
  }
  function classCard() {
    const cells = students.map((s) => {
      const p = profiles.get(s.sid);
      const cv = h('canvas', { width: 120, height: 150 });
      queueMicrotask(() => drawFront(cv, lookOf(p?.equip)));
      const t = titleOf(p);
      return h('button', { class: 'char-cell', title: '누르면 3D로 크게 봐요', onclick: () => openStudent(s, p) },
        cv, h('div', { class: 'nm' }, `${s.number} ${s.name}`), t ? h('div', { class: 'tt', style: `color:${t.color === '#fff' || t.color === '#ffffff' ? 'var(--muted)' : t.color}` }, t.name) : null);
    });
    return h('details', { class: 'card class-chars', open: true },
      h('summary', null, h('h2', { style: 'display:inline' }, `우리 반 캐릭터 (${students.length}명)`), h('span', { class: 'muted small', style: 'margin-left:8px' }, '누르면 3D로 크게 봐요')),
      students.length ? h('div', { class: 'char-grid' }, ...cells) : h('p', { class: 'muted' }, '학생이 없어요.'));
  }

  function draw() { root.replaceChildren(classCard(), itemsCard(), awardCard()); }

  settings = await loadSettings().catch(() => null);
  await load();
  draw();
}
