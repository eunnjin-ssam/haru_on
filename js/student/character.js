// 내 캐릭터: 3D 복셀 캐릭터 + 아이템 상점 + 칭호. '우리 반' 탭은 반 전체 정면 그림 격자(누르면 3D).
import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG, colorHex, colorLabel, COLORS, DEFAULT_LOOK, CORE_SLOTS } from '../character/catalog.js';
import { renderCharacter3D } from '../character/voxel3d.js';
import { drawFront, drawItem } from '../character/voxel2d.js';

const SECTION = { hair: '헤어스타일', face: '얼굴 표정', skin: '얼굴 색', top: '상의', bottom: '하의', shoes: '신발', headAcc: '모자·머리 소품', faceAcc: '얼굴 소품', hand: '손에 드는 소품', back: '기타 소품' };
const SECTION_ORDER = ['hair', 'face', 'skin', 'top', 'bottom', 'shoes', 'headAcc', 'faceAcc', 'hand', 'back'];
const EMPTY = { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };
const TITLE_FIELDS = [['reading', 'reading'], ['mission', 'missionDays'], ['role', 'roleDays']];

export async function renderCharacter(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const titleColors = settings.titleColors ?? ['#fff', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f'];
  let topView = 'me';
  let view = null;
  let selected = null; // 오른쪽 패널에서 고른 { item, color }
  let trying = {};     // 칸(category)별로 입어 보는 중인 { item, color } — 여러 칸을 함께 입어 볼 수 있다
  let data;

  async function load() {
    const [profSnap, ownedSnap, sumSnap, itemsSnap] = await Promise.all([
      getDoc(doc(db, 'profiles', sid)),
      getDocs(query(collection(db, 'ownedItems'), where('sid', '==', sid))),
      getDoc(doc(db, 'summaries', sid)).catch(() => null),
      getDocs(collection(db, 'items')),
    ]);
    const profile = profSnap.exists() ? profSnap.data() : { equip: { ...EMPTY }, title: null, awarded: [] };
    data = {
      profile,
      equip: profile.equip ?? { ...EMPTY },
      owned: new Map(ownedSnap.docs.map((d) => [d.id, d.data()])),
      items: new Map(itemsSnap.docs.map((d) => [d.id, d.data()])),
      summary: sumSnap?.exists() ? sumSnap.data() : { wallet: 0 },
    };
  }

  async function ensureStarters() {
    // 선생님 화면이 상점(items)에 아직 안 넣은 새 기본 아이템은 건너뛴다(보안 규칙이 items 문서를 확인함)
    const starters = Object.entries(CATALOG).filter(([id, it]) => it.starter && data.items.has(id));
    const missing = starters.filter(([id]) => !data.owned.has(`${sid}_${id}_free`));
    if (missing.length) {
      const b = writeBatch(db);
      for (const [id, it] of missing) b.set(doc(db, 'ownedItems', `${sid}_${id}_free`), { sid, item: id, category: it.category, color: 'default', at: serverTimestamp() });
      await b.commit(); await load();
    }
    // 머리·얼굴·상의·하의·신발·얼굴 색 칸이 비어 있으면 무료 기본 아이템을 입힌다(예전에 ‘벗기’로 비운 칸 포함)
    const fill = {};
    for (const c of CORE_SLOTS) {
      const id = DEFAULT_LOOK[c].item;
      if (!data.equip[c]?.item && data.owned.has(`${sid}_${id}_free`)) fill[`equip.${c}`] = { owned: `${sid}_${id}_free`, item: id, color: 'default' };
    }
    if (Object.keys(fill).length) { await updateDoc(doc(db, 'profiles', sid), fill); await load(); }
  }

  const ownedId = (item, color) => (color === 'default' ? `${sid}_${item}_free` : `${sid}_${item}_${color}`);
  const owns = (item, color) => data.owned.has(ownedId(item, color));
  const colorsOf = (item) => data.items.get(item)?.prices ?? CATALOG[item].prices;
  const priceOf = (item, color) => colorsOf(item)[color];
  const dotHex = (item, c) => (c === 'default' ? (CATALOG[item].defColor ?? COLORS.default) : colorHex(c));
  const onSaleOf = (id) => { const m = data.items.get(id); return m ? m.onSale !== false : true; };
  const ownsAny = (id) => Object.keys(colorsOf(id)).some((c) => owns(id, c));
  function firstColor(item) {
    const cs = Object.keys(colorsOf(item));
    return cs.find((c) => owns(item, c)) ?? (cs.includes('default') ? 'default' : cs[0]);
  }
  function defaultColorFor(item) {
    const eq = data.equip[CATALOG[item].category];
    return (eq && eq.item === item) ? eq.color : firstColor(item);
  }

  async function buy(item, color) {
    const price = priceOf(item, color);
    if (price == null) { toast('이 색은 살 수 없어요.', 'error'); return false; }
    if ((data.summary.wallet ?? 0) < price) { toast('포인트가 모자라요.', 'error'); return false; }
    if (!confirm(`'${CATALOG[item].name}'(${color})을 ${price} ${currency}에 살까요?`)) return false;
    const id = ownedId(item, color);
    const b = writeBatch(db);
    b.set(doc(db, 'ownedItems', id), { sid, item, category: CATALOG[item].category, color, at: serverTimestamp() });
    b.set(doc(db, 'points', `item_${id}`), { sid, type: 'item', wallet: -price, total: 0, reason: `아이템 ${CATALOG[item].name}`, ref: id, by: sid, at: serverTimestamp() });
    b.update(doc(db, 'summaries', sid), { wallet: increment(-price), lastTx: `item_${id}` });
    await b.commit(); return true;
  }

  async function pick(item, color) {
    try {
      if (!owns(item, color)) { if (!(await buy(item, color))) return; }
      await updateDoc(doc(db, 'profiles', sid), { [`equip.${CATALOG[item].category}`]: { owned: ownedId(item, color), item, color } });
      await load(); draw();
    } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
  }
  const act = (fn) => fn().then(() => load()).then(draw).catch((e) => { console.error(e); toast('안 됐어요.', 'error'); });

  // 달 수 있는 칭호들
  function myTitles() {
    const out = [];
    for (const [cat2, field] of TITLE_FIELDS) {
      (settings.titles?.[cat2] ?? []).forEach((def, i) => {
        if ((data.summary[field] ?? 0) >= def.min) out.push({ id: `${cat2}_${i}`, name: def.name, color: titleColors[i] ?? '#fff' });
      });
    }
    (data.profile.awarded ?? []).forEach((name, i) => out.push({ id: `award_${i}`, name, color: titleColors[4] ?? '#f1c40f' }));
    return out;
  }
  function wornTitle() {
    const t = data.profile.title;
    if (!t) return null;
    return myTitles().find((x) => x.id === t) ?? null;
  }

  // ---- 친구 캐릭터 3D 팝업 ----
  function openFriend(p, name, worn) {
    const box = h('div', { class: 'char-stage', style: 'height:360px' });
    let fv = null;
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, name), box,
      h('button', { class: 'btn', onclick: () => { if (fv) fv.dispose(); dlg.remove(); } }, '닫기')));
    document.body.append(dlg);
    fv = renderCharacter3D(box, p.equip ?? {}, worn ? { title: worn.name, titleColor: worn.color } : {});
  }

  // ---- 그리기 ----
  function titlesCard() {
    const titles = myTitles();
    const worn = data.profile.title;
    return h('section', { class: 'card' }, h('h2', null, '내 칭호'),
      titles.length === 0 ? h('p', { class: 'muted' }, '아직 받은 칭호가 없어요. 열심히 모아 보세요!')
        : h('div', { class: 'title-list' },
          h('button', { class: `title-chip${!worn ? ' on' : ''}`, onclick: () => act(() => updateDoc(doc(db, 'profiles', sid), { title: null })) }, '안 달기'),
          ...titles.map((t) => h('button', { class: `title-chip${worn === t.id ? ' on' : ''}`, style: `color:${t.color}`, onclick: () => act(() => updateDoc(doc(db, 'profiles', sid), { title: t.id })) }, t.name))));
  }

  async function classGrid() {
    const [profSnap, stuSnap] = await Promise.all([getDocs(collection(db, 'profiles')), getDocs(collection(db, 'students'))]);
    const profiles = new Map(profSnap.docs.map((d) => [d.id, d.data()]));
    const students = stuSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    const grid = h('div', { class: 'char-grid' });
    for (const s of students) {
      const p = profiles.get(s.sid) ?? { equip: {} };
      const titleName = (() => {
        const t = p.title; if (!t) return '';
        if (t.startsWith('award_')) return (p.awarded ?? [])[Number(t.split('_')[1])] ?? '';
        const [c, i] = t.split('_'); return settings.titles?.[c]?.[Number(i)]?.name ?? '';
      })();
      // 아직 아무것도 안 꾸민 학생은 기본 차림으로 보여 준다(맨몸 방지).
      const eq = (p.equip && Object.values(p.equip).some(Boolean)) ? p.equip : DEFAULT_LOOK;
      const cv = h('canvas', { width: 120, height: 150 });
      queueMicrotask(() => drawFront(cv, eq));
      grid.append(h('button', { class: 'char-cell', onclick: () => openFriend({ ...p, equip: eq }, `${s.number}번 ${s.name}`, titleName ? { name: titleName, color: '#f1c40f' } : null) },
        cv, h('div', { class: 'nm' }, s.name), titleName ? h('div', { class: 'tt muted' }, titleName) : null));
    }
    return grid;
  }

  async function draw() {
    const toggle = h('div', { class: 'filterbar', style: 'margin-bottom:4px' },
      h('div', { class: 'seg' },
        h('button', { class: `subtab${topView === 'me' ? ' on' : ''}`, onclick: () => { topView = 'me'; draw(); } }, '아이템 상점'),
        h('button', { class: `subtab${topView === 'mine' ? ' on' : ''}`, onclick: () => { topView = 'mine'; draw(); } }, `내 아이템 ${data.owned.size}`),
        h('button', { class: `subtab${topView === 'class' ? ' on' : ''}`, onclick: () => { if (view) { view.dispose(); view = null; } topView = 'class'; draw(); } }, '우리 반')));

    if (topView === 'class') {
      if (view) { view.dispose(); view = null; }
      content.replaceChildren(h('div', { class: 'character' }, toggle, h('p', { class: 'muted small' }, '친구를 누르면 3D로 볼 수 있어요.'), await classGrid()));
      return;
    }

    const worn = wornTitle();
    const wornOpts = () => (worn ? { title: worn.name, titleColor: worn.color } : {});

    // ---- 내 아이템: 가진 아이템을 칸별로 보고 바로 입기 ----
    if (topView === 'mine') {
      if (view) { view.dispose(); view = null; }
      const stage = h('div', { class: 'char-stage' });
      const owned = [...data.owned.values()].filter((o) => CATALOG[o.item]);
      const groups = SECTION_ORDER.map((c) => {
        const list = owned.filter((o) => CATALOG[o.item].category === c)
          .sort((a, b) => CATALOG[a.item].name.localeCompare(CATALOG[b.item].name, 'ko'));
        if (!list.length) return null;
        return h('section', { class: 'cat-sec' },
          h('h3', { class: 'cat-h' }, SECTION[c], h('span', { class: 'cat-n muted' }, ` ${list.length}`)),
          h('div', { class: 'item-grid' }, ...list.map((o) => {
            const eq = data.equip[c];
            const on = eq && eq.item === o.item && eq.color === o.color;
            const cv = h('canvas', { width: 120, height: 150, class: 'item-canvas' });
            queueMicrotask(() => drawItem(cv, o.item, o.color));
            return h('div', { class: `item-card mine-card${on ? ' sel' : ''}` },
              on ? h('span', { class: 'ic-badge' }, '착용 중') : null,
              cv,
              h('div', { class: 'ic-name' }, CATALOG[o.item].name),
              h('div', { class: 'ic-price muted small' }, o.color === 'default' ? '기본' : colorLabel(o.color)),
              on
                ? (CORE_SLOTS.includes(c) ? h('span', { class: 'mine-on' }, '입고 있어요') : h('button', { class: 'btn secondary small', onclick: () => act(() => updateDoc(doc(db, 'profiles', sid), { [`equip.${c}`]: null })) }, '빼기'))
                : h('button', { class: 'btn small', onclick: () => pick(o.item, o.color) }, '입기'));
          })));
      }).filter(Boolean);
      queueMicrotask(() => { view = renderCharacter3D(stage, data.equip, wornOpts()); });
      content.replaceChildren(h('div', { class: 'character' },
        h('div', { class: 'board-head' },
          h('div', null, h('div', { class: 'bh-title' }, '내 아이템'), h('div', { class: 'bh-sub' }, `가지고 있는 아이템 ${owned.length}개 · 눌러서 바로 입어요`)),
          h('div', { class: 'wallet-chip' }, `🪙 ${data.summary.wallet ?? 0} ${currency}`)),
        toggle,
        h('div', { class: 'char-layout' },
          h('div', { class: 'char-left' }, h('div', { class: 'char-stage-box' }, stage, h('div', { class: 'muted small', style: 'text-align:center;margin-top:4px' }, '지금 내 모습'))),
          h('div', { class: 'char-catalog' }, ...groups))));
      return;
    }

    if (!selected) {
      selected = data.equip.hair?.item
        ? { item: data.equip.hair.item, color: data.equip.hair.color }
        : { item: 'hairBasic', color: defaultColorFor('hairBasic') };
    }

    const stageBox = h('div', { class: 'char-stage' });
    const fitBox = h('div', { class: 'fit-panel' });
    const catalog = h('div', { class: 'char-catalog' });
    const cards = new Map();

    // 입고 있는 것 위에, 칸마다 입어 보는 중인 것을 겹쳐 보여 준다
    const previewEquip = () => ({ ...data.equip, ...trying });
    // 입고 있는 것과 다른 '입어 보는 중' 칸들
    const tryingDiff = () => Object.entries(trying).filter(([c, t]) => {
      const eq = data.equip[c];
      return !eq || eq.item !== t.item || eq.color !== t.color;
    });
    const tryBar = h('div', { class: 'try-bar' });
    // 입어 보는 중인 아이템 목록: 아이템마다 그림·색·가격과 사기(가진 것은 입기) 버튼
    function renderTryBar() {
      const diff = tryingDiff().sort(([a], [b]) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b));
      if (!diff.length) { tryBar.replaceChildren(); return; }
      const toBuy = diff.filter(([, t]) => !owns(t.item, t.color));
      const sum = toBuy.reduce((n, [, t]) => n + (priceOf(t.item, t.color) ?? 0), 0);
      const wallet = data.summary.wallet ?? 0;
      tryBar.replaceChildren(...[
        h('div', { class: 'try-head' },
          h('b', null, `입어 보는 중 ${diff.length}개`),
          h('button', { class: 'btn secondary small', onclick: () => { trying = {}; refreshPreview(); } }, '모두 되돌리기')),
        ...diff.map(([c, t]) => {
          const have = owns(t.item, t.color);
          const price = priceOf(t.item, t.color);
          const cv = h('canvas', { width: 56, height: 56, class: 'try-cv' });
          queueMicrotask(() => drawItem(cv, t.item, t.color));
          return h('div', { class: 'try-row' }, cv,
            h('div', { class: 'try-info' },
              h('div', { class: 'try-name' }, CATALOG[t.item].name),
              h('div', { class: 'muted small' }, `${SECTION[c]} · ${t.color === 'default' ? '기본' : colorLabel(t.color)}`)),
            h('div', { class: 'try-price' }, have ? '가지고 있어요' : `${price} ${currency}`),
            h('button', { class: 'btn small', onclick: () => pick(t.item, t.color) }, have ? '입기' : '사기'),
            h('button', { class: 'try-x', title: '그만 입어 보기', onclick: () => { delete trying[c]; refreshPreview(); } }, '✕'));
        }),
        toBuy.length ? h('p', { class: `try-sum${sum > wallet ? ' short' : ''}` },
          `살 것 ${toBuy.length}개 · 모두 ${sum} ${currency}`, sum > wallet ? ` (지갑 ${wallet} ${currency} — ${sum - wallet} 모자라요)` : ` (지갑 ${wallet} ${currency})`) : null,
      ].filter(Boolean));
    }
    function refreshPreview() {
      renderFit();
      renderTryBar();
      if (view) view.update(previewEquip(), wornOpts());
      markSelected();
    }
    function markSelected() { for (const [id, el] of cards) el.classList.toggle('sel', selected.item === id); }
    function select(item, color) {
      selected = { item, color: color ?? defaultColorFor(item) };
      trying[CATALOG[item].category] = { ...selected };
      refreshPreview();
    }
    function unequip(c) {
      delete trying[c];
      act(() => updateDoc(doc(db, 'profiles', sid), { [`equip.${c}`]: null }));
    }

    function renderFit() {
      const item = CATALOG[selected.item];
      const c = item.category;
      const isOwned = owns(selected.item, selected.color);
      const eqNow = data.equip[c];
      const isEquipped = eqNow && eqNow.item === selected.item && eqNow.color === selected.color;
      const price = priceOf(selected.item, selected.color);
      const wallet = data.summary.wallet ?? 0;

      const primary = isEquipped
        ? h('button', { class: 'btn', disabled: true }, '입고 있어요')
        : h('button', { class: 'btn', onclick: () => pick(selected.item, selected.color) }, isOwned ? '입기' : '🛒 사기');
      // 모자·얼굴 소품만 뺄 수 있다(머리·옷·신발은 늘 입고 있어요)
      const takeOff = CORE_SLOTS.includes(c) ? null : h('button', { class: 'btn secondary', disabled: !eqNow, onclick: () => unequip(c) }, '빼기');

      const colorChips = Object.keys(colorsOf(selected.item)).map((col) => {
        const have = owns(selected.item, col);
        return h('button', { class: `color-chip${selected.color === col ? ' on' : ''}`, onclick: () => select(selected.item, col) },
          h('span', { class: 'cdot', style: `background:${dotHex(selected.item, col)}` }),
          h('span', { class: 'cname' }, col === 'default' ? '기본' : colorLabel(col)),
          h('span', { class: 'cprice muted' }, have ? '✓' : String(priceOf(selected.item, col))));
      });

      fitBox.replaceChildren(
        h('div', { class: 'fit-head' },
          h('div', null, h('div', { class: 'fit-name' }, item.name), h('div', { class: 'fit-cat muted small' }, SECTION[c])),
          h('div', { class: 'fit-price' }, isEquipped ? '입고 있어요' : (isOwned ? '가지고 있어요' : `${price} ${currency}`))),
        h('div', { class: 'fit-actions' }, primary, takeOff),
        h('p', { class: 'muted small' }, `지갑에 ${wallet} ${currency} 있어요. 눌러 입어 보고 마음에 들면 사기!`),
        h('div', { class: 'fit-colors' }, ...colorChips),
      );
    }

    function itemCard(id, it) {
      const colors = Object.keys(colorsOf(id));
      const prices = colors.map((col) => priceOf(id, col)).filter((n) => typeof n === 'number');
      const minP = prices.length ? Math.min(...prices) : 0;
      const freeStart = colors.includes('default') && priceOf(id, 'default') === 0;
      const equipped = data.equip[it.category]?.item === id;
      const cv = h('canvas', { width: 120, height: 150, class: 'item-canvas' });
      queueMicrotask(() => drawItem(cv, id, firstColor(id)));
      const card = h('button', { class: `item-card${selected.item === id ? ' sel' : ''}`, onclick: () => select(id) },
        equipped ? h('span', { class: 'ic-badge' }, '착용 중') : null,
        cv,
        h('div', { class: 'ic-name' }, it.name),
        h('div', { class: 'ic-price muted small' }, ownsAny(id) && !freeStart ? '가진 색 있음' : (freeStart ? '무료부터' : `${minP} ${currency}~`)),
        h('div', { class: 'swatch-dots' },
          ...colors.slice(0, 7).map((col) => h('span', { class: 'sdot', style: `background:${dotHex(id, col)}` })),
          colors.length > 7 ? h('span', { class: 'sdot-more muted' }, `+${colors.length - 7}`) : null));
      cards.set(id, card);
      return card;
    }

    const sections = SECTION_ORDER.map((c) => {
      const items = Object.entries(CATALOG).filter(([id, it]) => it.category === c && (onSaleOf(id) || ownsAny(id)));
      if (!items.length) return null;
      return h('section', { class: 'cat-sec' },
        h('h3', { class: 'cat-h' }, SECTION[c], h('span', { class: 'cat-n muted' }, ` ${items.length}`)),
        h('div', { class: 'item-grid' }, ...items.map(([id, it]) => itemCard(id, it))));
    }).filter(Boolean);
    catalog.replaceChildren(...sections);

    if (view) { view.dispose(); view = null; }
    queueMicrotask(() => { view = renderCharacter3D(stageBox, previewEquip(), wornOpts()); });
    renderFit();
    renderTryBar();

    content.replaceChildren(h('div', { class: 'character' },
      h('div', { class: 'board-head' },
        h('div', null, h('div', { class: 'bh-title' }, '꾸미기'), h('div', { class: 'bh-sub' }, '아이템을 눌러 입어 보고, 사기로 내 것을 만들어요')),
        h('div', { class: 'wallet-chip' }, `🪙 ${data.summary.wallet ?? 0} ${currency}`)),
      toggle,
      h('div', { class: 'char-layout' },
        h('div', { class: 'char-left' },
          h('div', { class: 'char-stage-box' }, stageBox, h('div', { class: 'muted small', style: 'text-align:center;margin-top:4px' }, '밀어서 돌려보세요')),
          tryBar,
          fitBox),
        catalog),
      titlesCard(),
    ));
  }

  await load();
  await ensureStarters();
  draw();
}
