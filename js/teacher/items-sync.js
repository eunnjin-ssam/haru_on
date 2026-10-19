// 도감(catalog.js)에 새로 생긴 아이템을 상점(items)에 자동으로 넣는다. 이미 있는 아이템의 가격·판매 여부는 건드리지 않는다.
// (학생이 아이템을 사려면 items/{id}가 있어야 보안 규칙이 가격을 확인할 수 있다)
import { collection, doc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { CATALOG } from '../character/catalog.js';

export async function ensureItems() {
  const have = new Set((await getDocs(collection(db, 'items'))).docs.map((d) => d.id));
  if (have.size === 0) return 0; // 아직 ‘기본 아이템 넣기’를 안 했으면 선생님이 직접 하도록 둔다
  const missing = Object.entries(CATALOG).filter(([id]) => !have.has(id));
  if (!missing.length) return 0;
  const b = writeBatch(db);
  for (const [id, it] of missing) {
    b.set(doc(db, 'items', id), { category: it.category, name: it.name, prices: it.prices, onSale: true, starter: !!it.starter });
  }
  await b.commit();
  return missing.length;
}
