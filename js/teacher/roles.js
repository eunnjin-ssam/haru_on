// 관리: 1인1역 역할 만들기 — 이름, 하는 일, 담당(최대 2명), 확인 담당, 포인트.
// (희망 받기·자동 배정 같은 2주 교체는 이후 단계에서)
import {
  collection, doc, getDocs, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

async function loadAll() {
  const [sSnap, rSnap] = await Promise.all([
    getDocs(collection(db, 'students')),
    getDocs(collection(db, 'roles')),
  ]);
  const students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() }))
    .filter((s) => s.active).sort((a, b) => a.number - b.number);
  const roles = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { students, roles };
}

export async function renderRoles(root) {
  let { students, roles } = await loadAll();
  let editing = null; // 고치는 중인 역할 id, 또는 null(새로 만들기)

  const nameOf = (sid) => { const s = students.find((x) => x.sid === sid); return s ? `${s.number}번 ${s.name}` : '?'; };

  async function reload() { ({ students, roles } = await loadAll()); draw(); }
  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('저장하지 못했어요.', 'error'); }
    await reload();
  }

  function form() {
    const cur = editing ? roles.find((r) => r.id === editing) : null;
    const name = h('input', { type: 'text', value: cur?.name ?? '', placeholder: '예) 우유 당번' });
    const desc = h('input', { type: 'text', value: cur?.desc ?? '', placeholder: '하는 일 (예) 우유를 나눠 줘요' });
    const points = h('input', { type: 'number', min: '0', value: String(cur?.points ?? 4), style: 'width:80px' });

    const memberBoxes = students.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: cur?.members?.includes(s.sid) });
      return { sid: s.sid, cb, el: h('label', { class: 'pick' }, cb, `${s.number} ${s.name}`) };
    });
    const checker = h('select', null,
      h('option', { value: '' }, '확인 담당 고르기'),
      ...students.map((s) => h('option', { value: s.sid, selected: cur?.checker === s.sid }, `${s.number}번 ${s.name}`)),
    );

    const save = h('button', { class: 'btn', onclick: () => {
      const members = memberBoxes.filter((m) => m.cb.checked).map((m) => m.sid);
      if (!name.value.trim()) { toast('역할 이름을 써 주세요.', 'error'); return; }
      if (members.length === 0) { toast('담당 학생을 1명 이상 골라 주세요.', 'error'); return; }
      if (members.length > 2) { toast('담당은 최대 2명이에요.', 'error'); return; }
      if (!checker.value) { toast('확인 담당을 골라 주세요.', 'error'); return; }
      if (members.includes(checker.value)) { toast('확인 담당은 담당 학생이 아닌 다른 친구로 골라 주세요.', 'error'); return; }
      const ref = editing ? doc(db, 'roles', editing) : doc(collection(db, 'roles'));
      run(() => setDoc(ref, {
        name: name.value.trim(), desc: desc.value.trim(),
        members, checker: checker.value, points: Number(points.value) || 0,
      }), editing ? '역할을 고쳤어요' : '역할을 만들었어요').then(() => { editing = null; });
    } }, editing ? '고치기' : '역할 만들기');

    return h('section', { class: 'card' },
      h('h2', null, editing ? '역할 고치기' : '역할 만들기'),
      students.length === 0
        ? h('p', { class: 'muted' }, '먼저 학생 명단을 등록해 주세요.')
        : h('div', { class: 'role-form' },
          h('label', { class: 'field' }, h('span', null, '역할 이름'), name),
          h('label', { class: 'field' }, h('span', null, '하는 일'), desc),
          h('label', { class: 'field' }, h('span', null, '포인트'), points),
          h('div', { class: 'field' }, h('span', null, '담당 (최대 2명)'), h('div', { class: 'picks' }, ...memberBoxes.map((m) => m.el))),
          h('label', { class: 'field' }, h('span', null, '확인 담당'), checker),
          h('div', { class: 'row' }, save,
            editing ? h('button', { class: 'btn secondary', onclick: () => { editing = null; draw(); } }, '취소') : null),
        ),
    );
  }

  function list() {
    return h('section', { class: 'card' },
      h('h2', null, `역할 (${roles.length})`),
      roles.length === 0
        ? h('p', { class: 'muted' }, '아직 만든 역할이 없어요.')
        : h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, '역할'), h('th', null, '하는 일'), h('th', null, '담당'),
            h('th', null, '확인 담당'), h('th', null, '점수'), h('th', null, ''))),
          h('tbody', null, roles.map((r) => h('tr', null,
            h('td', null, r.name),
            h('td', { class: 'muted' }, r.desc || '-'),
            h('td', null, (r.members ?? []).map(nameOf).join(', ')),
            h('td', null, nameOf(r.checker)),
            h('td', { class: 'num' }, r.points),
            h('td', { class: 'actions' },
              h('button', { class: 'btn secondary small', onclick: () => { editing = r.id; draw(); } }, '고치기'),
              h('button', { class: 'btn danger small', onclick: () => {
                if (confirm(`'${r.name}' 역할을 지울까요?`)) run(() => deleteDoc(doc(db, 'roles', r.id)), '지웠어요');
              } }, '지우기'),
            ),
          ))),
        ),
    );
  }

  function draw() { root.replaceChildren(list(), form()); }
  draw();
}
