// 내 캐릭터: 3D 복셀 캐릭터(밀어서 회전) + 아이템 상점(사고 입기). (우리 반 탭·칭호는 character2.js에서 합침)
import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { CATALOG, colorHex } from '../character/catalog.js';
import { renderCharacter3D } from '../character/voxel3d.js';

const CATS = [['hair', '헤어'], ['face', '얼굴'], ['top', '상의'], ['bottom', '하의'], ['shoes', '신발'], ['headAcc', '머리 소품'], ['faceAcc', '얼굴 소품']];
const EMPTY = { hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };

export async function renderCharacter(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  let cat = 'hair';
  let view = null; // 3D 핸들
  let data;

  async function load() {
    const [profSnap, ownedSnap, sumSnap, itemsSnap] = await Promise.all([
      getDoc(doc(db, 'profiles', sid)),
      getDocs(query(collection(db, 'ownedItems'), where('sid', '==', sid))),
      getDoc(doc(db, 'summaries', sid)).catch(() => null),
      getDocs(collection(db, 'items')),
    ]);
    const equip = profSnap.exists() ? (profSnap.data().equip ?? { ...EMPTY }) : { ...EMPTY };
    const owned = new Map(ownedSnap.docs.map((d) => [d.id, d.data()])); // id → {item,color}
    const items = new Map(itemsSnap.docs.map((d) => [d.id, d.data()])); // Firestore 메타(가격·판매)
    const summary = sumSnap?.exists() ? sumSnap.data() : { wallet: 0 };
    data = { equip, owned, items, summary };
  }

  async function ensureStarters() {
    const starters = Object.entries(CATALOG).filter(([, it]) => it.starter);
    const missing = starters.filter(([id]) => !data.owned.has(`${sid}_${id}_free`));
    if (missing.length) {
      const b = writeBatch(db);
      for (const [id, it] of missing) {
        b.set(doc(db, 'ownedItems', `${sid}_${id}_free`), { sid, item: id, category: it.category, color: 'default', at: serverTimestamp() });
      }
      await b.commit();
      await load();
    }
    const empty = Object.values(data.equip).every((v) => v == null);
    if (empty) {
      const eq = { ...EMPTY };
      for (const [id, it] of starters) eq[it.category] = { owned: `${sid}_${id}_free`, item: id, color: 'default' };
      await updateDoc(doc(db, 'profiles', sid), { equip: eq });
      await load();
    }
  }

  const ownedId = (item, color) => (color === 'default' ? `${sid}_${item}_free` : `${sid}_${item}_${color}`);
  const owns = (item, color) => data.owned.has(ownedId(item, color));
  const priceOf = (item, color) => (data.items.get(item)?.prices ?? CATALOG[item].prices)[color];

  async function buy(item, color) {
    const price = priceOf(item, color);
    if (price == null) { toast('이 색은 살 수 없어요.', 'error'); return; }
    if ((data.summary.wallet ?? 0) < price) { toast('포인트가 모자라요.', 'error'); return; }
    if (!confirm(`'${CATALOG[item].name}'(${color})을 ${price} ${currency}에 살까요?`)) return false;
    const id = ownedId(item, color);
    const b = writeBatch(db);
    b.set(doc(db, 'ownedItems', id), { sid, item, category: CATALOG[item].category, color, at: serverTimestamp() });
    b.set(doc(db, 'points', `item_${id}`), { sid, type: 'item', wallet: -price, total: 0, reason: `아이템 ${CATALOG[item].name}`, ref: id, by: sid, at: serverTimestamp() });
    b.update(doc(db, 'summaries', sid), { wallet: increment(-price), lastTx: `item_${id}` });
    await b.commit();
    return true;
  }

  async function equip(item, color) {
    const slot = CATALOG[item].category;
    await updateDoc(doc(db, 'profiles', sid), { [`equip.${slot}`]: { owned: ownedId(item, color), item, color } });
  }
  async function unequip(slot) {
    await updateDoc(doc(db, 'profiles', sid), { [`equip.${slot}`]: null });
  }

  async function pick(item, color) {
    try {
      if (!owns(item, color)) { const bought = await buy(item, color); if (!bought) return; }
      await equip(item, color);
      await load(); draw();
    } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
  }

  function draw() {
    const stage = h('div', { class: 'char-stage' });
    const items = Object.entries(CATALOG).filter(([, it]) => it.category === cat);
    const equipped = data.equip[cat];

    const catBtns = CATS.map(([c, label]) => h('button', { class: `chip${cat === c ? ' on' : ''}`, onclick: () => { cat = c; draw(); } }, label));

    const itemCards = items.map(([id, it]) => {
      const meta = data.items.get(id);
      const onSale = meta ? meta.onSale !== false : true;
      const colors = Object.keys(it.prices);
      const swatches = colors.map((color) => {
        const have = owns(id, color);
        const price = priceOf(id, color) ?? '?';
        const isOn = equipped && equipped.item === id && equipped.color === color;
        return h('button', {
          class: `swatch${isOn ? ' on' : ''}`, title: have ? '입기' : `${price} ${currency}`,
          style: `background:${colorHex(color)}`, disabled: !have && !onSale,
          onclick: () => pick(id, color),
        }, have ? '✓' : (color === 'default' ? '' : ''));
      });
      return h('div', { class: 'item-card' },
        h('div', { class: 'ic-name' }, it.name, !onSale ? h('span', { class: 'muted small' }, ' (숨김)') : null),
        h('div', { class: 'swatches' }, ...swatches),
        h('div', { class: 'muted small' }, colors.map((c) => `${c} ${priceOf(id, c)}`).join(' · ')),
      );
    });

    content.replaceChildren(h('div', { class: 'character' },
      h('div', { class: 'char-top' },
        stage,
        h('div', { class: 'muted small', style: 'text-align:center' }, `지갑: ${data.summary.wallet ?? 0} ${currency} · 밀어서 돌려보세요`)),
      h('div', { class: 'char-shop' },
        h('div', { class: 'subtabs' }, ...catBtns),
        equipped ? h('button', { class: 'btn secondary small', onclick: () => { unequip(cat).then(() => load().then(draw)); } }, '이 칸 벗기') : null,
        h('div', { class: 'item-grid' }, ...itemCards),
      ),
    ));

    if (view) view.dispose();
    view = renderCharacter3D(stage, data.equip);
  }

  await load();
  await ensureStarters();
  draw();
}
