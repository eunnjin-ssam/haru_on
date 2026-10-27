// 도감(catalog.js)과 상점(items)을 맞춘다. 선생님 화면을 열 때 한 번 돈다.
//  - 도감에 새로 생긴 아이템은 상점에 넣는다(판매 중).
//  - 아이템 이름은 도감을 따른다. 단, 선생님이 캐릭터·칭호에서 바꾼 이름(nameEdited)은 그대로 둔다.
//  - 도감에 나중에 추가한 색(NEW_COLORS)은 한 번만 넣는다. 선생님이 그 색을 지우면 다시 넣지 않는다(colorAdds에 기록).
//  - 도감에서 판매를 그만둔 아이템(retired)은 한 번만 숨긴다. 이미 산 학생은 계속 쓰고, 선생님이 다시 판매하면 그대로 둔다(retired에 기록).
//  이미 있는 아이템의 가격·판매 여부는 건드리지 않는다.
// (학생이 아이템을 사려면 items/{id}가 있어야 보안 규칙이 가격을 확인할 수 있다)
import { collection, doc, getDocs, writeBatch, arrayUnion } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { CATALOG } from '../character/catalog.js';

// 아이템 → 나중에 추가한 색 (2026-10-21: 왕관·천사 링 은색)
const NEW_COLORS = { crown: ['silver'], halo: ['silver'] };

// 도감에서 상점 맞추기에 쓰는 부분(id·이름·판매 그만둠·나중 색)을 짧은 글자로. 이게 지난번과 같으면
// 맞출 것이 없으니 상점(items, 100개 넘음)을 읽지 않는다 — 예전엔 선생님 화면을 열 때마다 다 읽었다.
function catalogSig() {
  const s = JSON.stringify([Object.entries(CATALOG).map(([id, it]) => [id, it.name, !!it.retired]), NEW_COLORS]);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${hash}`;
}
const SIG_KEY = 'itemsSyncSig';

export async function ensureItems() {
  const sig = catalogSig();
  try { if (localStorage.getItem(SIG_KEY) === sig) return 0; } catch { /* 저장소를 못 쓰면 그냥 맞춘다 */ }
  const snap = await getDocs(collection(db, 'items'));
  if (snap.empty) return 0; // 아직 ‘기본 아이템 넣기’를 안 했으면 선생님이 직접 하도록 둔다
  const have = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const b = writeBatch(db); let n = 0;
  for (const [id, it] of Object.entries(CATALOG)) {
    const cur = have.get(id);
    if (!cur) {
      b.set(doc(db, 'items', id), { category: it.category, name: it.name, prices: it.prices, onSale: !it.retired, starter: !!it.starter, colorAdds: NEW_COLORS[id] ?? [], ...(it.retired ? { retired: true } : {}) });
      n += 1; continue;
    }
    const upd = {};
    if (!cur.nameEdited && cur.name !== it.name) upd.name = it.name;
    if (it.retired && !cur.retired) { upd.onSale = false; upd.retired = true; }
    const adds = (NEW_COLORS[id] ?? []).filter((c) => !(cur.colorAdds ?? []).includes(c));
    for (const c of adds) if (!(c in (cur.prices ?? {})) && it.prices[c] != null) upd[`prices.${c}`] = it.prices[c];
    if (adds.length) upd.colorAdds = arrayUnion(...adds);
    if (Object.keys(upd).length) { b.update(doc(db, 'items', id), upd); n += 1; }
  }
  if (n) await b.commit();
  try { localStorage.setItem(SIG_KEY, sig); } catch { /* 다음에 다시 맞추면 된다 */ }
  return n;
}
