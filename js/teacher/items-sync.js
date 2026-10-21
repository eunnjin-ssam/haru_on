// 도감(catalog.js)과 상점(items)을 맞춘다. 선생님 화면을 열 때 한 번 돈다.
//  - 도감에 새로 생긴 아이템은 상점에 넣는다(판매 중).
//  - 아이템 이름은 도감을 따른다(이름은 선생님 화면에서 고치지 않으므로).
//  - 도감에 나중에 추가한 색(NEW_COLORS)은 한 번만 넣는다. 선생님이 그 색을 지우면 다시 넣지 않는다(colorAdds에 기록).
//  이미 있는 아이템의 가격·판매 여부는 건드리지 않는다.
// (학생이 아이템을 사려면 items/{id}가 있어야 보안 규칙이 가격을 확인할 수 있다)
import { collection, doc, getDocs, writeBatch, arrayUnion } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { CATALOG } from '../character/catalog.js';

// 아이템 → 나중에 추가한 색 (2026-10-21: 왕관·천사 링 은색)
const NEW_COLORS = { crown: ['silver'], halo: ['silver'] };

export async function ensureItems() {
  const snap = await getDocs(collection(db, 'items'));
  if (snap.empty) return 0; // 아직 ‘기본 아이템 넣기’를 안 했으면 선생님이 직접 하도록 둔다
  const have = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const b = writeBatch(db); let n = 0;
  for (const [id, it] of Object.entries(CATALOG)) {
    const cur = have.get(id);
    if (!cur) {
      b.set(doc(db, 'items', id), { category: it.category, name: it.name, prices: it.prices, onSale: true, starter: !!it.starter, colorAdds: NEW_COLORS[id] ?? [] });
      n += 1; continue;
    }
    const upd = {};
    if (cur.name !== it.name) upd.name = it.name;
    const adds = (NEW_COLORS[id] ?? []).filter((c) => !(cur.colorAdds ?? []).includes(c));
    for (const c of adds) if (!(c in (cur.prices ?? {})) && it.prices[c] != null) upd[`prices.${c}`] = it.prices[c];
    if (adds.length) upd.colorAdds = arrayUnion(...adds);
    if (Object.keys(upd).length) { b.update(doc(db, 'items', id), upd); n += 1; }
  }
  if (n) await b.commit();
  return n;
}
