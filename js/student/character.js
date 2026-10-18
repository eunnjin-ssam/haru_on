// 내 캐릭터: 3D 복셀 캐릭터 + 아이템 상점 + 칭호. '우리 반' 탭은 반 전체 정면 그림 격자(누르면 3D).
import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG, colorHex } from '../character/catalog.js';
import { renderCharacter3D } from '../character/voxel3d.js';
import { drawFront } from '../character/voxel2d.js';

const CATS = [['hair', '헤어'], ['face', '얼굴'], ['top', '상의'], ['bottom', '하의'], ['shoes', '신발'], ['headAcc', '머리 소품'], ['faceAcc', '얼굴 소품']];
const EMPTY = { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };
const TITLE_FIELDS = [['reading', 'reading'], ['mission', 'missionDays'], ['role', 'roleDays']];

export async function renderCharacter(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  const titleColors = settings.titleColors ?? ['#fff', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f'];
  let topView = 'me';
  let cat = 'hair';
  let view = null;
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
    const starters = Object.entries(CATALOG).filter(([, it]) => it.starter);
    const missing = starters.filter(([id]) => !data.owned.has(`${sid}_${id}_free`));
    if (missing.length) {
      const b = writeBatch(db);
      for (const [id, it] of missing) b.set(doc(db, 'ownedItems', `${sid}_${id}_free`), { sid, item: id, category: it.category, color: 'default', at: serverTimestamp() });
      await b.commit(); await load();
    }
    if (Object.values(data.equip).every((v) => v == null)) {
      const eq = { ...EMPTY };
      for (const [id, it] of starters) eq[it.category] = { owned: `${sid}_${id}_free`, item: id, color: 'default' };
      await updateDoc(doc(db, 'profiles', sid), { equip: eq }); await load();
    }
  }

  const ownedId = (item, color) => (color === 'default' ? `${sid}_${item}_free` : `${sid}_${item}_${color}`);
  const owns = (item, color) => data.owned.has(ownedId(item, color));
  const priceOf = (item, color) => (data.items.get(item)?.prices ?? CATALOG[item].prices)[color];

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

  // ---- 3D 무대 ----
  function stageWith(equip, worn) {
    const stage = h('div', { class: 'char-stage' });
    queueMicrotask(() => { if (view) view.dispose(); view = renderCharacter3D(stage, equip, worn ? { title: worn.name, titleColor: worn.color } : {}); });
    return stage;
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
  function itemsCard() {
    const items = Object.entries(CATALOG).filter(([, it]) => it.category === cat);
    const equipped = data.equip[cat];
    const catBtns = CATS.map(([c, label]) => h('button', { class: `chip${cat === c ? ' on' : ''}`, onclick: () => { cat = c; draw(); } }, label));
    const cards = items.map(([id, it]) => {
      const meta = data.items.get(id);
      const onSale = meta ? meta.onSale !== false : true;
      const colors = Object.keys(it.prices);
      return h('div', { class: 'item-card' },
        h('div', { class: 'ic-name' }, it.name, !onSale ? h('span', { class: 'muted small' }, ' (숨김)') : null),
        h('div', { class: 'swatches' }, ...colors.map((color) => {
          const have = owns(id, color);
          const isOn = equipped && equipped.item === id && equipped.color === color;
          return h('button', { class: `swatch${isOn ? ' on' : ''}`, title: have ? '입기' : `${priceOf(id, color)} ${currency}`, style: `background:${colorHex(color)}`, disabled: !have && !onSale, onclick: () => pick(id, color) }, have ? '✓' : '');
        })),
        h('div', { class: 'muted small' }, colors.map((c) => `${c} ${priceOf(id, c)}`).join(' · ')),
      );
    });
    return h('div', { class: 'char-shop' },
      h('div', { class: 'subtabs' }, ...catBtns),
      equipped ? h('button', { class: 'btn secondary small', onclick: () => act(() => updateDoc(doc(db, 'profiles', sid), { [`equip.${cat}`]: null })) }, '이 칸 벗기') : null,
      h('div', { class: 'item-grid' }, ...cards));
  }

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
      const cv = h('canvas', { width: 120, height: 150 });
      queueMicrotask(() => drawFront(cv, p.equip ?? {}));
      grid.append(h('button', { class: 'char-cell', onclick: () => openFriend(p, `${s.number}번 ${s.name}`, titleName ? { name: titleName, color: '#f1c40f' } : null) },
        cv, h('div', { class: 'nm' }, s.name), titleName ? h('div', { class: 'tt muted' }, titleName) : null));
    }
    return grid;
  }

  async function draw() {
    const toggle = h('div', { class: 'filterbar', style: 'margin-bottom:4px' },
      h('div', { class: 'seg' },
        h('button', { class: `subtab${topView === 'me' ? ' on' : ''}`, onclick: () => { topView = 'me'; draw(); } }, '내 캐릭터'),
        h('button', { class: `subtab${topView === 'class' ? ' on' : ''}`, onclick: () => { if (view) { view.dispose(); view = null; } topView = 'class'; draw(); } }, '우리 반')));

    if (topView === 'class') {
      if (view) { view.dispose(); view = null; }
      content.replaceChildren(h('div', { class: 'character' }, toggle, h('p', { class: 'muted small' }, '친구를 누르면 3D로 볼 수 있어요.'), await classGrid()));
      return;
    }
    const worn = wornTitle();
    content.replaceChildren(h('div', { class: 'character' }, toggle,
      h('div', { class: 'char-top' }, stageWith(data.equip, worn),
        h('div', { class: 'muted small', style: 'text-align:center' }, `지갑: ${data.summary.wallet ?? 0} ${currency} · 밀어서 돌려보세요`)),
      titlesCard(),
      itemsCard()));
  }

  await load();
  await ensureStarters();
  draw();
}
