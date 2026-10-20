// 체크판: 학생 × 과제 격자. 과제 만들기·수정·삭제, 빈칸 완료(포인트 지급), 제출 확인/다시 해오기, 모두 완료.
// 선생님 확인용(가정통신문 회신 등)은 아래 구역에 따로, 포인트 없음.
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  writeBatch, increment, serverTimestamp, Timestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';
import { isShown } from '../common/task-visible.js';
import { ensureRepeatTasks, ruleText, whenText, AHEAD } from './repeats.js';

const DOW = [[1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금'], [6, '토'], [7, '일']];
const OLD_DAYS = 7; // 모두 끝나고 마감이 이만큼 지난 과제는 접어 둔다
// 'YYYYMMDD' ↔ <input type=date> 값
const idToInput = (id) => (id ? `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}` : '');
const inputToId = (v) => (v ? v.replaceAll('-', '') : '');

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
  let repeats = [];
  let editing = null; // 수정 중 task id
  let showForm = false;
  let prefill = null;
  let showOld = false; // 접어 둔 지난 과제 펼치기

  async function load() {
    const [sSnap, tSnap, subSnap, cfgSnap, rSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'submissions')),
      getDoc(doc(db, 'settings', 'main')),
      getDocs(collection(db, 'taskRepeats')),
    ]);
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    // 반복 과제 중 아직 학생에게 안 보이는 미래 것은 체크판에서도 뺀다. 마감 순.
    tasks = tSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => isShown(t))
      .sort((a, b) => (a.dueAt?.toMillis?.() ?? Infinity) - (b.dueAt?.toMillis?.() ?? Infinity));
    repeats = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
        task: task.id, sid, status: 'done', text: '', comment: '', byTeacher: true,
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

  // 완료 취소: 준 포인트를 거둬들이고(거래 삭제 + 요약 되돌림),
  // 선생님이 바로 체크한 것은 빈칸으로, 학생이 제출했던 것은 '제출함'으로 돌린다
  async function undoComplete(task, sid) {
    const subId = `${task.id}_${sid}`;
    const sub = subOf(task.id, sid);
    const txRef = doc(db, 'points', `task_${subId}`);
    const tx = await getDoc(txRef);
    const amt = tx.exists() ? tx.data() : null;
    const st = students.find((x) => x.sid === sid);
    const back = amt?.wallet ? `\n줬던 ${amt.wallet}${currency}도 거둬들여요.` : '';
    if (!confirm(`${st ? st.name : '이 학생'}의 ‘${task.title}’ 완료를 취소할까요?${back}`)) return false;
    // 예전 기록엔 byTeacher가 없다: 선생님이 바로 체크한 건 처음·마지막 시각이 같다
    const direct = sub?.byTeacher || (sub?.firstAt?.toMillis && sub.firstAt.toMillis() === sub.lastAt?.toMillis?.());
    const b = writeBatch(db);
    if (direct) b.delete(doc(db, 'submissions', subId));
    else b.update(doc(db, 'submissions', subId), { status: 'submitted', lastAt: serverTimestamp() });
    if (amt) {
      b.delete(txRef);
      b.update(doc(db, 'summaries', sid), { wallet: increment(-(amt.wallet ?? 0)), total: increment(-(amt.total ?? 0)) });
    }
    await b.commit();
    return true;
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
    if (editing) { await updateDoc(doc(db, 'tasks', editing), data); return; }
    if (form.repeatMode === 'none') { await addDoc(collection(db, 'tasks'), data); return; }
    // 반복: 규칙을 저장하고 2주치를 바로 만든다
    const { dueAt, repeatWeekly, ...rest } = data;
    await addDoc(collection(db, 'taskRepeats'), {
      ...rest, mode: form.repeatMode, days: form.repeatMode === 'daily' ? [1, 2, 3, 4, 5] : form.days,
      dueTime: form.dueTime || '23:59', leadDays: Math.max(0, Math.floor(Number(form.leadDays) || 0)),
      startDate: form.startDate || todayId(), endDate: form.endDate || null,
      skip: [], active: true, createdAt: serverTimestamp(),
    });
    await ensureRepeatTasks();
  }

  async function deleteTask(t) {
    const note = t.repeat ? '\n반복 과제 중 이 날짜 것만 지우고, 다시 만들어지지 않아요.' : '';
    if (!confirm(`'${t.title}' 과제를 지울까요? (학생들의 제출 기록도 함께 지워요)${note}`)) return;
    await run(async () => {
      const b = writeBatch(db);
      for (const s of students) { const id = `${t.id}_${s.sid}`; if (subs.has(id)) b.delete(doc(db, 'submissions', id)); }
      b.delete(doc(db, 'tasks', t.id));
      // 반복 과제 하루치를 지우면 그 날짜를 건너뛰기에 넣어 다시 만들지 않게 한다
      if (t.repeat) b.update(doc(db, 'taskRepeats', t.repeat), { skip: arrayUnion(t.id.split('_').pop()) });
      await b.commit();
    }, '지웠어요');
  }

  // 반복 그만하기: 규칙을 끄고, 아직 학생에게 안 보인 미리 만든 과제는 지운다(이미 보인 것·제출 기록은 남김)
  async function stopRepeat(r) {
    if (!confirm(`'${r.title}' 반복을 그만할까요?\n이미 학생에게 보인 과제와 제출 기록은 그대로 남아요.`)) return;
    await run(async () => {
      const all = await getDocs(collection(db, 'tasks'));
      const b = writeBatch(db);
      for (const d of all.docs) if (d.data().repeat === r.id && !isShown(d.data())) b.delete(d.ref);
      b.update(doc(db, 'taskRepeats', r.id), { active: false, endDate: todayId() });
      await b.commit();
    }, '반복을 그만했어요');
  }

  // ---- 과제 만들기 폼 ----
  function taskForm() {
    const cur = editing ? tasks.find((t) => t.id === editing) : prefill;
    const f = {
      kind: cur?.kind ?? 'homework', title: cur?.title ?? '', desc: cur?.desc ?? '', subject: cur?.subject ?? '',
      dueAt: toInputValue(cur?.dueAt), submitType: cur?.submitType ?? 'check',
      points: cur?.points ?? 5, targetAll: cur ? (cur.targets?.length === students.length) : true,
      targets: cur?.targets ?? students.map((s) => s.sid), notify: cur?.notify ?? false,
      // 반복 (새로 만들 때만)
      repeatMode: 'none', days: [], dueTime: '23:59', leadDays: 0, startDate: todayId(), endDate: '',
    };
    const isRepeatInstance = !!(editing && cur?.repeat);

    const repeatSel = h('select', { onchange: (e) => { f.repeatMode = e.target.value; drawForm(); } },
      h('option', { value: 'none' }, '반복 안 함 (한 번만)'),
      h('option', { value: 'daily' }, '매일 (월~금)'),
      h('option', { value: 'days' }, '요일 고르기 (예: 매주 금요일)'));
    const dayBoxes = DOW.map(([n, label]) => {
      const cb = h('input', { type: 'checkbox', onchange: (e) => {
        f.days = e.target.checked ? [...new Set([...f.days, n])] : f.days.filter((x) => x !== n);
        updateSay();
      } });
      return { n, cb, el: h('label', { class: 'pick' }, cb, label) };
    });
    const dueTime = h('input', { type: 'time', value: f.dueTime, oninput: (e) => { f.dueTime = e.target.value; updateSay(); } });
    const leadDays = h('input', { type: 'number', min: '0', max: '6', value: '0', style: 'width:70px', oninput: (e) => { f.leadDays = e.target.value; updateSay(); } });
    const startDate = h('input', { type: 'date', value: idToInput(f.startDate), oninput: (e) => { f.startDate = inputToId(e.target.value); } });
    const endDate = h('input', { type: 'date', value: '', oninput: (e) => { f.endDate = inputToId(e.target.value); } });
    const repeatSay = h('p', { class: 'say' });

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
    function updateSay() {
      if (f.repeatMode === 'none') return;
      const r = { mode: f.repeatMode, days: f.days, dueTime: f.dueTime || '23:59', leadDays: Number(f.leadDays) || 0 };
      repeatSay.textContent = f.repeatMode === 'days' && f.days.length === 0
        ? '→ 요일을 하나 이상 골라 주세요.'
        : `→ ${whenText(r)}, 그날 ${r.dueTime}까지 하는 과제가 생겨요. 학생에게는 ${r.leadDays ? `${r.leadDays}일 전부터` : '그날 아침부터'} 보여요.`;
    }
    function repeatFields() {
      if (editing) {
        return isRepeatInstance
          ? h('p', { class: 'muted small' }, '🔁 반복 과제 중 이 날짜 것만 고쳐요. 반복 규칙은 아래 ‘반복 과제’에서 그만할 수 있어요.')
          : null;
      }
      const repeating = f.repeatMode !== 'none';
      updateSay();
      return h('div', { class: 'field repeat-box' }, h('span', null, '반복'), repeatSel,
        f.repeatMode === 'days' ? h('div', { class: 'picks' }, ...dayBoxes.map((d) => { d.cb.checked = f.days.includes(d.n); return d.el; })) : null,
        repeating ? h('div', { class: 'row' }, h('span', { class: 'muted' }, '마감 시각: 그날'), dueTime) : null,
        repeating ? h('div', { class: 'row' }, h('span', { class: 'muted' }, '학생에게 보이기: 마감'), leadDays, h('span', { class: 'muted' }, '일 전부터 (0 = 그날 아침부터)')) : null,
        repeating ? h('div', { class: 'row' }, h('span', { class: 'muted' }, '시작'), startDate, h('span', { class: 'muted' }, '끝 (비우면 계속)'), endDate) : null,
        repeating ? repeatSay : null);
    }
    function drawForm() {
      const repeating = !editing && f.repeatMode !== 'none';
      container.replaceChildren(h('div', { class: 'role-form' },
        h('label', { class: 'field' }, h('span', null, '종류'), kindSel),
        h('label', { class: 'field' }, h('span', null, '제목'), title),
        h('label', { class: 'field' }, h('span', null, '설명'), desc),
        h('label', { class: 'field' }, h('span', null, '과목'), subject),
        repeatFields(),
        repeating ? null : h('label', { class: 'field' }, h('span', null, '마감'), due),
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
            if (repeating && f.repeatMode === 'days' && f.days.length === 0) { toast('반복할 요일을 골라 주세요.', 'error'); return; }
            if (repeating && f.endDate && f.endDate < f.startDate) { toast('끝 날짜가 시작보다 빨라요.', 'error'); return; }
            const msg = editing ? '고쳤어요' : (repeating ? '반복 과제를 만들었어요' : '과제를 만들었어요');
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
      return h('td', { class: `cell done${late ? ' late' : ''}`, title: `${late ? '늦은 완료' : '완료'} — 누르면 취소`,
        onclick: async () => { if (await undoComplete(task, s.sid).catch((e) => { console.error(e); toast('안 됐어요.', 'error'); return false; })) { toast('완료를 취소했어요'); await load(); draw(); } } }, late ? '✓늦' : '✓');
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

  // 모두 끝났고 마감이 OLD_DAYS일보다 지난 과제
  function isOld(t) {
    if (!t.dueAt?.toMillis || t.dueAt.toMillis() > Date.now() - OLD_DAYS * 86400000) return false;
    return students.filter((s) => isTarget(t, s.sid)).every((s) => ['done', 'exempt'].includes(subOf(t.id, s.sid)?.status));
  }

  function homeworkGrid() {
    const all = tasks.filter((t) => t.kind === 'homework');
    if (all.length === 0) return h('p', { class: 'muted' }, '아직 과제가 없어요. 아래 ‘새 과제’로 만들어 주세요.');
    const oldN = all.filter(isOld).length;
    const list = showOld ? all : all.filter((t) => !isOld(t));
    const foldBtn = oldN ? h('button', { class: 'btn secondary small', style: 'margin-top:8px', onclick: () => { showOld = !showOld; draw(); } },
      showOld ? '끝난 지난 과제 접기' : `끝난 지난 과제 ${oldN}개 보기`) : null;
    return h('div', null, h('div', { class: 'table-wrap' }, h('table', { class: 'board' },
      h('thead', null, h('tr', null,
        h('th', { class: 'stick' }, '과제'),
        ...students.map((s) => h('th', { class: 'stu' }, h('div', { class: 'stu-no' }, s.number), h('div', { class: 'stu-nm' }, shortName(s.name)))),
        h('th', null, '완료'))),
      h('tbody', null, ...list.map((t) => h('tr', null,
        h('td', { class: 'stick taskname' },
          h('button', { class: 'linkish', onclick: () => { editing = t.id; showForm = true; draw(); } }, `${t.repeat ? '🔁 ' : ''}${t.title}`),
          h('div', { class: 'muted small' }, `${t.subject ? t.subject + ' · ' : ''}${dueLabel(t.dueAt)} · ${t.points}${currency}`),
          h('div', { class: 'row', style: 'margin-top:4px' },
            h('button', { class: 'btn secondary tiny', onclick: () => run(() => completeAll(t), '모두 완료했어요') }, '모두 완료'),
            h('button', { class: 'btn secondary tiny', onclick: () => { prefill = { ...t, title: `${t.title} (복사)`, id: undefined }; editing = null; showForm = true; draw(); } }, '복사'),
            h('button', { class: 'btn danger tiny', onclick: () => deleteTask(t) }, '삭제')),
        ),
        ...students.map((s) => cell(t, s)),
        h('td', { class: 'num' }, doneCount(t)),
      ))),
      leftRow(all, '남은 과제', (st) => !['done', 'exempt'].includes(st)),
    )), foldBtn);
  }

  // 맨 아래 줄: 학생별로 아직 안 끝난 개수(접어 둔 것 포함 전체 기준)
  function leftRow(list, label, notDone) {
    const counts = students.map((s) => list.filter((t) => isTarget(t, s.sid) && notDone(subOf(t.id, s.sid)?.status)).length);
    return h('tfoot', null, h('tr', { class: 'left-row' },
      h('th', { class: 'stick' }, label),
      ...counts.map((n) => h('td', { class: `num${n ? ' has-left' : ''}` }, n ? String(n) : '·')),
      h('td', { class: 'num' }, String(counts.reduce((a, b) => a + b, 0)))));
  }

  // 반복 규칙 목록: 켜진 것만, 그만하기
  function repeatList() {
    const on = repeats.filter((r) => r.active);
    if (on.length === 0) return null;
    return h('section', { class: 'card' },
      h('h2', null, `🔁 반복 과제 (${on.length})`),
      h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, `선생님 화면을 열 때마다 앞으로 ${AHEAD}일치 과제를 미리 만들어 둬요. 학생에게는 정한 날부터 보여요.`),
      ...on.map((r) => h('div', { class: 'req-row' },
        h('div', null,
          h('b', null, r.title), ' ', h('span', { class: 'badge' }, r.kind === 'check' ? '확인용' : `${r.points}${currency}`),
          h('div', { class: 'muted small' }, `${ruleText(r)} · ${r.targets?.length === students.length ? '전체' : `${r.targets?.length ?? 0}명`}${r.endDate ? ` · ${idToInput(r.endDate)}까지` : ''}`)),
        h('button', { class: 'btn secondary small', onclick: () => stopRepeat(r) }, '그만하기'))));
  }

  function checkGrid() {
    const list = tasks.filter((t) => t.kind === 'check' && (showOld || !isOld(t)));
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
              h('button', { class: 'linkish', onclick: () => { editing = t.id; showForm = true; draw(); } }, `${t.repeat ? '🔁 ' : ''}${t.title}`),
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
          leftRow(tasks.filter((t) => t.kind === 'check'), '미회신', (st) => st !== 'done'),
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
      repeatList(),
      checkGrid(),
    ].filter(Boolean));
  }

  await load();
  draw();
}
