// 1인1역 희망 받기(학생): 선생님이 다음 기간 희망 받기를 열면 대시보드에 1~3지망 카드가 뜬다.
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const md = (id) => `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}`;

// 열린 기간이 없으면 null
export async function loadWish(sid) {
  const tSnap = await getDocs(query(collection(db, 'roleTerms'), where('wishOpen', '==', true))).catch(() => null);
  const term = tSnap?.docs.map((d) => ({ id: d.id, ...d.data() }))[0];
  if (!term) return null;
  const [rSnap, wSnap] = await Promise.all([
    getDocs(collection(db, 'roles')),
    getDoc(doc(db, 'roleWishes', `${term.id}_${sid}`)).catch(() => null),
  ]);
  const roles = rSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ko'));
  return { term, roles, picks: wSnap?.exists() ? wSnap.data().picks ?? [] : [] };
}

export function wishCard(sid, w, onSaved) {
  if (!w) return null;
  let editing = w.picks.length === 0;
  const box = h('section', { class: 'card wish-card' });
  const nameOf = (rid) => w.roles.find((r) => r.id === rid)?.name ?? '?';

  function draw() {
    if (!editing) {
      box.replaceChildren(
        h('h2', null, '🧹 다음 1인1역 희망'),
        h('p', { class: 'muted small', style: 'margin:0 0 8px' }, `${md(w.term.start)}부터 2주 동안 맡을 역할이에요.`),
        h('p', { class: 'wish-done' }, '✅ 냈어요: ', w.picks.map((p, i) => `${i + 1}지망 ${nameOf(p)}`).join(' · ')),
        h('button', { class: 'btn secondary small', onclick: () => { editing = true; draw(); } }, '바꾸기'));
      return;
    }
    const sels = [0, 1, 2].map((i) => h('select', { class: 'wish-sel' },
      h('option', { value: '' }, i === 0 ? '1지망 고르기' : `${i + 1}지망 (안 골라도 돼요)`),
      ...w.roles.map((r) => h('option', { value: r.id, selected: w.picks[i] === r.id }, `${r.name}${r.desc ? ` — ${r.desc}` : ''}`))));
    const save = h('button', { class: 'btn', onclick: async () => {
      const picks = sels.map((s) => s.value).filter(Boolean);
      if (!picks.length) { toast('1지망을 골라 주세요.', 'error'); return; }
      if (new Set(picks).size !== picks.length) { toast('같은 역할을 두 번 골랐어요.', 'error'); return; }
      save.disabled = true;
      try {
        await setDoc(doc(db, 'roleWishes', `${w.term.id}_${sid}`), { sid, term: w.term.id, picks, at: serverTimestamp() });
        w.picks = picks; editing = false; toast('희망을 냈어요!'); draw(); onSaved?.();
      } catch (e) { console.error(e); toast('내지 못했어요. 희망 받기가 끝났을 수 있어요.', 'error'); save.disabled = false; }
    } }, '희망 내기');
    box.replaceChildren(
      h('h2', null, '🧹 다음 1인1역 희망 받기'),
      h('p', { class: 'muted small', style: 'margin:0 0 8px' }, `${md(w.term.start)}~${md(w.term.end)} 2주 동안 맡고 싶은 역할을 골라요. 지금 하는 역할은 연속으로 맡지 않아요.`),
      ...sels, save);
  }
  draw();
  return box;
}
