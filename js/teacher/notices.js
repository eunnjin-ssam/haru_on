// 새소식: 제목·내용·게시 기간 → 학생 첫 화면 팝업. '확인했어요'를 누른 학생 수를 본다.
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, addDaysId } from '../common/dates.js';

// 'YYYYMMDD' ↔ <input type=date>
const toInput = (id) => (id ? `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}` : '');
const fromInput = (v) => (v ? v.replaceAll('-', '') : '');
const label = (id) => `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}`;

export async function renderNotices(root) {
  let notices = []; let students = []; let reads = new Map(); // id → Set(sid)
  let editing = null; let showForm = false;

  async function load() {
    const [nSnap, sSnap] = await Promise.all([getDocs(collection(db, 'notices')), getDocs(collection(db, 'students'))]);
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    notices = nSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
    const rs = await Promise.all(notices.map((n) => getDocs(collection(db, 'notices', n.id, 'reads'))));
    reads = new Map(notices.map((n, i) => [n.id, new Set(rs[i].docs.map((d) => d.id))]));
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await load(); draw();
  }

  async function remove(n) {
    if (!confirm(`'${n.title}' 새소식을 지울까요?`)) return;
    await run(async () => {
      const b = writeBatch(db);
      for (const sid of reads.get(n.id) ?? []) b.delete(doc(db, 'notices', n.id, 'reads', sid));
      b.delete(doc(db, 'notices', n.id));
      await b.commit();
    }, '지웠어요');
  }

  function form() {
    const cur = editing ? notices.find((n) => n.id === editing) : null;
    const title = h('input', { type: 'text', maxlength: '60', value: cur?.title ?? '', placeholder: '(예) 내일은 현장체험학습 날!' });
    const body = h('textarea', { maxlength: '1000', rows: '5', placeholder: '학생 첫 화면에 팝업으로 보여 줄 내용' }, cur?.body ?? '');
    const start = h('input', { type: 'date', value: toInput(cur?.start ?? todayId()) });
    const end = h('input', { type: 'date', value: toInput(cur?.end ?? addDaysId(todayId(), 6)) });
    const save = h('button', { class: 'btn', onclick: () => {
      const data = { title: title.value.trim(), body: body.value.trim(), start: fromInput(start.value), end: fromInput(end.value) };
      if (!data.title) { toast('제목을 써 주세요.', 'error'); return; }
      if (!data.start || !data.end || data.end < data.start) { toast('게시 기간을 확인해 주세요.', 'error'); return; }
      editing = null; showForm = false;
      run(() => (cur ? updateDoc(doc(db, 'notices', cur.id), data) : addDoc(collection(db, 'notices'), { ...data, at: serverTimestamp() })), cur ? '고쳤어요' : '새소식을 올렸어요');
    } }, cur ? '고치기' : '올리기');
    return h('section', { class: 'card' }, h('h3', null, cur ? '새소식 고치기' : '새소식 쓰기'),
      h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '제목'), title),
        h('label', { class: 'field' }, h('span', null, '내용'), body),
        h('div', { class: 'field' }, h('span', null, '게시 기간 (이 기간에 학생이 앱을 열면 팝업이 떠요)'),
          h('div', { class: 'row' }, start, h('span', { class: 'muted' }, '~'), end)),
        h('div', { class: 'row' }, save, h('button', { class: 'btn secondary', onclick: () => { editing = null; showForm = false; draw(); } }, '취소'))));
  }

  function card(n) {
    const today = todayId();
    const state = today < n.start ? ['예정', 'skip'] : (today > n.end ? ['끝남', ''] : ['게시 중', 'new']);
    const read = reads.get(n.id) ?? new Set();
    const notRead = students.filter((s) => !read.has(s.sid));
    return h('article', { class: 'admin-post' },
      h('div', { class: 'ap-head' },
        h('div', null, h('b', null, n.title), ' ', h('span', { class: `badge ${state[1]}` }, state[0]),
          h('div', { class: 'muted small' }, `${label(n.start)} ~ ${label(n.end)} · 확인 ${read.size}/${students.length}명`))),
      n.body ? h('p', { class: 'ap-body' }, n.body) : null,
      notRead.length && read.size ? h('details', null, h('summary', { class: 'muted small' }, `아직 확인 안 한 학생 ${notRead.length}명`),
        h('p', { class: 'muted small' }, notRead.map((s) => `${s.number} ${s.name}`).join(', '))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn secondary small', onclick: () => { editing = n.id; showForm = true; draw(); } }, '고치기'),
        h('button', { class: 'btn danger small', onclick: () => remove(n) }, '삭제')));
  }

  function draw() {
    root.replaceChildren(...[
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', null, h('h2', null, '새소식'),
            h('p', { class: 'muted small', style: 'margin:0' }, '게시 기간 동안 학생이 앱을 열면 팝업으로 떠요. 학생이 ‘확인했어요’를 누르면 다시 뜨지 않아요.')),
          showForm ? null : h('button', { class: 'btn', onclick: () => { editing = null; showForm = true; draw(); } }, '+ 새소식 쓰기')),
        notices.length === 0 ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아직 올린 새소식이 없어요.')
          : h('div', { class: 'admin-posts' }, ...notices.map(card))),
      showForm ? form() : null,
    ].filter(Boolean));
  }

  await load();
  draw();
}
