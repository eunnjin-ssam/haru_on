// 체크판: 학생 × 과제 격자. 과제 만들기·수정·삭제, 빈칸 완료(포인트 지급), 제출 확인/다시 해오기, 모두 완료.
// 선생님 확인용(가정통신문 회신 등)은 아래 구역에 따로, 포인트 없음.
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  writeBatch, increment, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

// 체크판 좁은 칸용 이름: 3글자 이상이면 성을 빼고 이름만(예: 김하늘 → 하늘)
const shortName = (name) => (name && name.length >= 3 ? name.slice(1) : (name ?? ''));

// datetime-local 값 ↔ Timestamp
function toTimestamp(v) { return v ? Timestamp.fromDate(new Date(v)) : null; }
function toInputValue(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dueLabel(ts) {
  if (!ts?.toDate) return '기한 없음';
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function renderBoard(root, { open }) {
  let students = [];
  let tasks = [];
  let subs = new Map();
  let currency = '포인트';
  let editing = null; // 수정 중 task id
  let showForm = false;
  let prefill = null;

  async function load() {
    const [sSnap, tSnap, subSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'submissions')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    tasks = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    subs = new Map(subSnap.docs.map((d) => [d.id, d.data()]));
    currency = cfgSnap.data()?.names?.currency ?? '포인트';
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await load(); draw();
  }

  const subOf = (taskId, sid) => subs.get(`${taskId}_${sid}`);
  const isTarget = (t, sid) => (t.targets ?? []).includes(sid);

  function pointsFor(task, sub) {
    const full = task.points ?? 0;
    const late = sub?.firstAt?.toMillis && task.dueAt?.toMillis && sub.firstAt.toMillis() > task.dueAt.toMillis();
    return late ? Math.floor(full / 2) : full;
  }

  // 완료 처리: 제출 done + 과제 포인트 거래 + 요약을 한 묶음으로
  function completeInBatch(b, task, sid, existingSub) {
    const subId = `${task.id}_${sid}`;
    const p = pointsFor(task, existingSub);
    if (existingSub) {
      b.update(doc(db, 'submissions', subId), { status: 'done', lastAt: serverTimestamp() });
    } else {
      b.set(doc(db, 'submissions', subId), {
        task: task.id, sid, status: 'done', text: '', comment: '',
        firstAt: serverTimestamp(), lastAt: serverTimestamp(),
      });
    }
    if (p > 0) {
      const txId = `task_${subId}`;
      b.set(doc(db, 'points', txId), {
        sid, type: 'task', wallet: p, total: p, reason: `과제 ${task.title}`, ref: subId, by: 'teacher', at: serverTimestamp(),
      });
      b.update(doc(db, 'summaries', sid), { wallet: increment(p), total: increment(p), lastTx: txId });
    }
  }

  async function completeOne(task, sid) {
    const b = writeBatch(db);
    completeInBatch(b, task, sid, subOf(task.id, sid));
    await b.commit();
  }

  async function completeAll(task) {
    const targets = students.filter((s) => isTarget(task, s.sid));
    const todo = targets.filter((s) => !['done', 'exempt'].includes(subOf(task.id, s.sid)?.status));
    for (let i = 0; i < todo.length; i += 100) {
      const b = writeBatch(db);
      for (const s of todo.slice(i, i + 100)) completeInBatch(b, task, s.sid, subOf(task.id, s.sid));
      await b.commit();
    }
  }

  async function redoOne(task, sid) {
    const comment = prompt('다시 해오기 메모 (학생에게 보여요)', '') ?? '';
    await updateDoc(doc(db, 'submissions', `${task.id}_${sid}`), { status: 'redo', comment, lastAt: serverTimestamp() });
  }

  // 선생님 확인용: 회신 표시(포인트 없음) / 되돌리기
  async function markReturn(task, sid, on) {
    const subId = `${task.id}_${sid}`;
    if (on) {
      await setDoc(doc(db, 'submissions', subId), {
        task: task.id, sid, status: 'done', text: '', comment: '', firstAt: serverTimestamp(), lastAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(doc(db, 'submissions', subId));
    }
  }

  async function saveTask(form) {
    const data = {
      kind: form.kind, title: form.title, desc: form.desc, subject: form.subject,
      dueAt: toTimestamp(form.dueAt), submitType: form.submitType,
      points: form.kind === 'homework' ? Number(form.points) || 0 : 0,
      targets: form.targets, notify: form.notify, repeatWeekly: false,
    };
    if (editing) await updateDoc(doc(db, 'tasks', editing), data);
    else await addDoc(collection(db, 'tasks'), data);
  }

  async function deleteTask(t) {
    if (!confirm(`'${t.title}' 과제를 지울까요? (학생들의 제출 기록도 함께 지워요)`)) return;
    await run(async () => {
      const b = writeBatch(db);
      for (const s of students) { const id = `${t.id}_${s.sid}`; if (subs.has(id)) b.delete(doc(db, 'submissions', id)); }
      b.delete(doc(db, 'tasks', t.id));
      await b.commit();
    }, '지웠어요');
  }

  // ---- 과제 만들기 폼 ----
  function taskForm() {
    const cur = editing ? tasks.find((t) => t.id === editing) : prefill;
    const f = {
      kind: cur?.kind ?? 'homework', title: cur?.title ?? '', desc: cur?.desc ?? '', subject: cur?.subject ?? '',
      dueAt: toInputValue(cur?.dueAt), submitType: cur?.submitType ?? 'check',
      points: cur?.points ?? 5, targetAll: cur ? (cur.targets?.length === students.length) : true,
      targets: cur?.targets ?? students.map((s) => s.sid), notify: cur?.notify ?? false,
    };

    const kindSel = h('select', { onchange: (e) => { f.kind = e.target.value; drawForm(); } },
      h('option', { value: 'homework', selected: f.kind === 'homework' }, '학생 과제 (포인트)'),
      h('option', { value: 'check', selected: f.kind === 'check' }, '선생님 확인용 (회신 등, 포인트 없음)'));
    const title = h('input', { type: 'text', value: f.title, placeholder: '제목 (예) 수학 익힘책 30쪽', oninput: (e) => { f.title = e.target.value; } });
    const desc = h('input', { type: 'text', value: f.desc, placeholder: '설명 (선택)', oninput: (e) => { f.desc = e.target.value; } });
    const subject = h('input', { type: 'text', value: f.subject, placeholder: '과목 (선택)', oninput: (e) => { f.subject = e.target.value; } });
    const due = h('input', { type: 'datetime-local', value: f.dueAt, oninput: (e) => { f.dueAt = e.target.value; } });
    const submitType = h('select', { onchange: (e) => { f.submitType = e.target.value; } },
      h('option', { value: 'check', selected: f.submitType === 'check' }, '체크만'),
      h('option', { value: 'text', selected: f.submitType === 'text' }, '글로 제출'));
    const points = h('input', { type: 'number', min: '0', value: String(f.points), style: 'width:80px', oninput: (e) => { f.points = e.target.value; } });

    const memberBoxes = students.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: f.targets.includes(s.sid) });
      return { sid: s.sid, cb, el: h('label', { class: 'pick' }, cb, `${s.number} ${s.name}`) };
    });
    const allCb = h('input', { type: 'checkbox', checked: f.targetAll, onchange: (e) => {
      f.targetAll = e.target.checked;
      memberBoxes.forEach((m) => { m.cb.checked = e.target.checked; });
    } });

    const notify = h('input', { type: 'checkbox', checked: f.notify, onchange: (e) => { f.notify = e.target.checked; } });

    const container = h('div');
    function drawForm() {
      container.replaceChildren(h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '종류'), kindSel),
        h('label', { class: 'field' }, h('span', null, '제목'), title),
        h('label', { class: 'field' }, h('span', null, '설명'), desc),
        h('label', { class: 'field' }, h('span', null, '과목'), subject),
        h('label', { class: 'field' }, h('span', null, '마감'), due),
        f.kind === 'homework' ? h('label', { class: 'field' }, h('span', null, '제출 방식'), submitType) : null,
        f.kind === 'homework' ? h('label', { class: 'field' }, h('span', null, `포인트 (늦으면 자동 절반)`), points) : null,
        h('div', { class: 'field' }, h('span', null, '대상'),
          h('label', { class: 'pick' }, allCb, '전체'),
          h('div', { class: 'picks' }, ...memberBoxes.map((m) => m.el))),
        h('label', { class: 'pick' }, notify, '학생 대시보드에 알림'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => {
            if (!f.title.trim()) { toast('제목을 써 주세요.', 'error'); return; }
            const targets = memberBoxes.filter((m) => m.cb.checked).map((m) => m.sid);
            if (targets.length === 0) { toast('대상을 1명 이상 골라 주세요.', 'error'); return; }
            const msg = editing ? '고쳤어요' : '과제를 만들었어요';
            try { await saveTask({ ...f, title: f.title.trim(), targets }); toast(msg); }
            catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
            editing = null; showForm = false; prefill = null;
            await load(); draw();
          } }, editing ? '고치기' : '만들기'),
          h('button', { class: 'btn secondary', onclick: () => { editing = null; showForm = false; prefill = null; draw(); } }, '취소'),
        ),
      ));
    }
    drawForm();
    return h('section', { class: 'card' }, h('h2', null, editing ? '과제 고치기' : '새 과제'), container);
  }

  // ---- 격자 ----
  function cell(task, s) {
    if (!isTarget(task, s.sid)) return h('td', { class: 'cell off' }, '');
    const sub = subOf(task.id, s.sid);
    const st = sub?.status;
    if (st === 'done') {
      const late = sub.firstAt?.toMillis && task.dueAt?.toMillis && sub.firstAt.toMillis() > task.dueAt.toMillis();
      return h('td', { class: `cell done${late ? ' late' : ''}`, title: late ? '늦은 완료' : '완료' }, late ? '✓늦' : '✓');
    }
    if (st === 'exempt') return h('td', { class: 'cell' }, '면');
    if (st === 'submitted') {
      return h('td', { class: 'cell sub' },
        h('button', { class: 'dot', title: '확인하면 완료 + 포인트', onclick: () => run(() => completeOne(task, s.sid), '완료했어요') }, '●'),
        h('button', { class: 'redo', title: '다시 해오기', onclick: () => run(() => redoOne(task, s.sid)) }, '↺'));
    }
    if (st === 'redo') return h('td', { class: 'cell redo-cell', title: '다시 해오기 요청함' }, '↺');
    // 빈칸: 직접 누르면 즉시 완료 + 포인트
    return h('td', { class: 'cell blank', title: '누르면 완료 + 포인트', onclick: () => run(() => completeOne(task, s.sid), '완료했어요') }, '');
  }

  function doneCount(task) {
    const targets = students.filter((s) => isTarget(task, s.sid));
    const done = targets.filter((s) => ['done', 'exempt'].includes(subOf(task.id, s.sid)?.status)).length;
    return `${done}/${targets.length}`;
  }

  function homeworkGrid() {
    const list = tasks.filter((t) => t.kind === 'homework');
    if (list.length === 0) return h('p', { class: 'muted' }, '아직 과제가 없어요. 아래 ‘새 과제’로 만들어 주세요.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'board' },
      h('thead', null, h('tr', null,
        h('th', { class: 'stick' }, '과제'),
        ...students.map((s) => h('th', { class: 'stu' }, h('div', { class: 'stu-no' }, s.number), h('div', { class: 'stu-nm' }, shortName(s.name)))),
        h('th', null, '완료'))),
      h('tbody', null, ...list.map((t) => h('tr', null,
        h('td', { class: 'stick taskname' },
          h('button', { class: 'linkish', onclick: () => { editing = t.id; showForm = true; draw(); } }, t.title),
          h('div', { class: 'muted small' }, `${t.subject ? t.subject + ' · ' : ''}${dueLabel(t.dueAt)} · ${t.points}${currency}`),
          h('div', { class: 'row', style: 'margin-top:4px' },
            h('button', { class: 'btn secondary tiny', onclick: () => run(() => completeAll(t), '모두 완료했어요') }, '모두 완료'),
            h('button', { class: 'btn secondary tiny', onclick: () => { prefill = { ...t, title: `${t.title} (복사)`, id: undefined }; editing = null; showForm = true; draw(); } }, '복사'),
            h('button', { class: 'btn danger tiny', onclick: () => deleteTask(t) }, '삭제')),
        ),
        ...students.map((s) => cell(t, s)),
        h('td', { class: 'num' }, doneCount(t)),
      ))),
    ));
  }

  function checkGrid() {
    const list = tasks.filter((t) => t.kind === 'check');
    return h('section', { class: 'card' },
      h('h2', null, '선생님 확인용 (회신 등)'),
      h('p', { class: 'muted' }, '포인트 없이 회신만 표시해요. 과제마당에는 보이지 않아요.'),
      list.length === 0
        ? h('p', { class: 'muted' }, '아직 없어요. ‘새 과제’에서 종류를 ‘선생님 확인용’으로 만들면 여기 나와요.')
        : h('div', { class: 'table-wrap' }, h('table', { class: 'board' },
          h('thead', null, h('tr', null,
            h('th', { class: 'stick' }, '항목'), ...students.map((s) => h('th', { class: 'stu' }, h('div', { class: 'stu-no' }, s.number), h('div', { class: 'stu-nm' }, shortName(s.name)))), h('th', null, '회신'))),
          h('tbody', null, ...list.map((t) => h('tr', null,
            h('td', { class: 'stick taskname' },
              h('button', { class: 'linkish', onclick: () => { editing = t.id; showForm = true; draw(); } }, t.title),
              h('div', { class: 'muted small' }, dueLabel(t.dueAt)),
              h('button', { class: 'btn danger tiny', style: 'margin-top:4px', onclick: () => deleteTask(t) }, '삭제')),
            ...students.map((s) => {
              if (!isTarget(t, s.sid)) return h('td', { class: 'cell off' }, '');
              const done = subOf(t.id, s.sid)?.status === 'done';
              return h('td', { class: `cell ${done ? 'done' : 'blank'}`, title: done ? '회신함 (눌러 취소)' : '누르면 회신 표시',
                onclick: () => run(() => markReturn(t, s.sid, !done)) }, done ? '✓' : '');
            }),
            h('td', { class: 'num' }, doneCount(t)),
          ))),
        )),
    );
  }

  function draw() {
    root.replaceChildren(...[
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h2', null, '체크판'),
          showForm ? null : h('button', { class: 'btn', onclick: () => { editing = null; prefill = null; showForm = true; draw(); } }, '+ 새 과제')),
        homeworkGrid(),
        h('p', { class: 'muted' }, '빈칸을 누르면 바로 완료 + 포인트예요. 파란 점(●)은 학생이 제출한 것 — 누르면 완료, ↺는 다시 해오기.'),
      ),
      showForm ? taskForm() : null,
      checkGrid(),
    ].filter(Boolean));
  }

  await load();
  draw();
}
