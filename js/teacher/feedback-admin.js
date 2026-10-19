// 건의함: 학생이 보낸 건의·신고를 보고 처리한다(확인함/고쳤어요/반영할게요). 처리 시 학생에게 자동 쪽지.
import {
  collection, doc, getDocs, updateDoc, deleteDoc, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const KIND_LABEL = { bug: '🛠️ 앱 오류', idea: '💡 제안' };
const STATUS_LABEL = { new: '새 건의', seen: '확인함', fixed: '고쳤어요', planned: '반영할게요' };
const ORDER = { new: 0, seen: 1, planned: 2, fixed: 3 };

export async function renderFeedbackAdmin(root) {
  let items = []; let names = new Map();
  let onlyOpen = false; // 처리 안 한 건의(새 건의·확인함)만 보기

  async function load() {
    const [fbSnap, stuSnap] = await Promise.all([
      getDocs(collection(db, 'feedback')),
      getDocs(collection(db, 'students')),
    ]);
    items = fbSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    names = new Map(stuSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  // 상태 바꾸기 (+처리 시 학생에게 자동 쪽지)
  async function setStatus(f, status, notify) {
    const b = writeBatch(db);
    b.update(doc(db, 'feedback', f.id), { status });
    if (notify) {
      const msg = status === 'fixed'
        ? `건의해 준 '${f.body.slice(0, 20)}…' 고쳤어요. 고마워요! 😊`
        : `건의해 준 '${f.body.slice(0, 20)}…' 앞으로 반영할게요. 좋은 생각 고마워요! 😊`;
      b.set(doc(collection(db, 'messages')), { to: f.sid, body: msg, from: 'teacher', at: serverTimestamp(), readAt: null });
    }
    await b.commit();
  }

  function card(f) {
    const badge = h('span', { class: `badge ${f.status === 'new' ? 'new' : 'skip'}` }, STATUS_LABEL[f.status] ?? f.status);
    const closed = f.status === 'fixed' || f.status === 'planned';
    return h('article', { class: `admin-post${f.status === 'new' ? ' flag' : ''}${closed ? ' done' : ''}` },
      h('div', { class: 'ap-head' },
        h('div', null,
          h('b', null, KIND_LABEL[f.kind] ?? f.kind), ' ', badge,
          h('div', { class: 'muted small' }, `${names.get(f.sid) ?? f.sid} · ${f.menu}${f.category ? ' · ' + f.category : ''}`))),
      h('p', { class: 'ap-body' }, f.body),
      h('details', null, h('summary', { class: 'muted small' }, '기기 정보'), h('p', { class: 'muted small' }, f.device || '-')),
      h('div', { class: 'row' },
        f.status === 'new' ? h('button', { class: 'btn secondary small', onclick: () => run(() => setStatus(f, 'seen', false), '확인함으로 바꿨어요') }, '확인함') : null,
        h('button', { class: 'btn small', onclick: () => run(() => setStatus(f, 'fixed', true), '고쳤어요 + 쪽지 보냄') }, '고쳤어요'),
        h('button', { class: 'btn small', onclick: () => run(() => setStatus(f, 'planned', true), '반영할게요 + 쪽지 보냄') }, '반영할게요'),
        h('button', { class: 'btn danger small', onclick: () => { if (confirm('이 건의를 지울까요?')) run(() => deleteDoc(doc(db, 'feedback', f.id)), '지웠어요'); } }, '삭제')),
    );
  }

  function draw() {
    const nw = items.filter((f) => f.status === 'new').length;
    const open = items.filter((f) => f.status === 'new' || f.status === 'seen');
    const shown = onlyOpen ? open : items;
    const filterBtn = h('button', { class: 'btn secondary small', disabled: items.length === 0, onclick: () => { onlyOpen = !onlyOpen; draw(); } },
      onlyOpen ? '모두 보기' : '처리 안 한 것만 보기');
    root.replaceChildren(h('section', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', null,
          h('h2', null, `건의함${nw ? ` (새 건의 ${nw})` : ''}`),
          h('p', { class: 'muted small', style: 'margin:0' },
            `학생이 보낸 앱 오류·제안이에요. 모두 ${items.length}건 · 처리 안 함 ${open.length}건. ‘고쳤어요’·‘반영할게요’를 누르면 학생에게 고맙다는 쪽지가 자동으로 가요.`)),
        filterBtn),
      items.length === 0 ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아직 들어온 건의가 없어요.')
        : shown.length === 0 ? h('p', { class: 'empty-ok', style: 'margin-top:12px' }, '✅ 처리할 건의를 모두 처리했어요.')
          : h('div', { class: 'admin-posts' }, ...shown.map(card)),
    ));
  }

  await load();
  draw();
}
