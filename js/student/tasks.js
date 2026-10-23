// 과제마당: 선생님이 낸 과제를 보고 제출한다. 제출하면 체크판에 '확인 대기'로 들어간다.
// 포인트는 선생님이 확인할 때 지급(마감 뒤에 내면 0점). 여기서는 제출만 한다.
import {
  collection, doc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { ddayLabel as dday } from '../common/dates.js';
import { isShown, isExpiredRepeat } from '../common/task-visible.js';
import { loadAbsentDays, isAbsentTask } from './absent.js';

export async function renderTasks(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  let tab = 'todo';
  let data;

  async function load() {
    const [taskSnap, subSnap, absentDays] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', sid))),
      getDocs(query(collection(db, 'submissions'), where('sid', '==', sid))),
      loadAbsentDays(sid),
    ]);
    const subs = new Map(subSnap.docs.map((d) => [d.id, d.data()]));
    const tasks = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.kind === 'homework' && isShown(t))
      .map((t) => { const sub = subs.get(`${t.id}_${sid}`); return { ...t, sub, absent: isAbsentTask(t, sub, absentDays), expired: isExpiredRepeat(t, sub) }; })
      .sort((a, b) => (a.dueAt?.toMillis?.() ?? Infinity) - (b.dueAt?.toMillis?.() ?? Infinity));
    data = { tasks };
  }

  async function reload() { await load(); draw(); }

  async function submit(t, text) {
    const subId = `${t.id}_${sid}`;
    if (t.sub?.status === 'redo') {
      await updateDoc(doc(db, 'submissions', subId), { status: 'submitted', text: text ?? '', lastAt: serverTimestamp() });
    } else {
      await setDoc(doc(db, 'submissions', subId), {
        task: t.id, sid, status: 'submitted', text: text ?? '', firstAt: serverTimestamp(), lastAt: serverTimestamp(),
      });
    }
  }

  function statusChip(t) {
    const s = t.sub?.status;
    if (t.absent) return h('span', { class: 'chip-s' }, '결석'); // 올라온 날 결석 — 안 내도 됨
    if (t.expired) return h('span', { class: 'chip-s' }, '마감 지남'); // 반복 과제는 그날 지나면 끝
    if (s === 'submitted') return h('span', { class: 'chip-s wait' }, '확인 대기');
    if (s === 'done') return h('span', { class: 'chip-s ok' }, '완료');
    if (s === 'redo') return h('span', { class: 'chip-s redo' }, '다시 해오기');
    if (s === 'exempt') return h('span', { class: 'chip-s' }, '면제');
    return h('span', { class: 'chip-s todo' }, '해야 해요');
  }

  function card(t) {
    const s = t.sub?.status;
    const canSubmit = (!s || s === 'redo') && !t.absent && !t.expired;
    const box = h('article', { class: 'task-card' });

    // 결석한 날 과제는 '결석', 마감 지나 아직 안 냈으면 '지금 내면 0'
    const overdue = !s && t.dueAt?.toMillis && t.dueAt.toMillis() < Date.now();
    const pointLabel = t.absent ? '결석' : t.expired ? '포인트 없음' : `${overdue ? '지금 내면 0' : t.points}${currency}`;

    function fill(open) {
      const head = h('div', { class: 'tc-head' },
        h('div', null, h('div', { class: 'tc-title' }, t.title),
          h('div', { class: 'muted small' }, `${t.subject ? t.subject + ' · ' : ''}${dday(t.dueAt)} · ${pointLabel}`)),
        statusChip(t));
      const children = [head];
      if (t.desc) children.push(h('p', { class: 'muted' }, t.desc));
      if (t.sub?.comment && s === 'redo') children.push(h('p', { class: 'banner' }, `선생님: ${t.sub.comment}`));

      if (canSubmit) {
        if (t.submitType === 'text') {
          if (open) {
            const ta = h('textarea', { placeholder: '여기에 써서 제출해요', maxlength: '5000' }, t.sub?.text ?? '');
            const go = h('button', { class: 'btn', onclick: async () => {
              if (!ta.value.trim()) { toast('내용을 써 주세요.', 'error'); return; }
              go.disabled = true;
              try { await submit(t, ta.value.trim()); toast('제출했어요'); await reload(); }
              catch (e) { console.error(e); toast('제출하지 못했어요', 'error'); go.disabled = false; }
            } }, s === 'redo' ? '다시 제출' : '제출');
            children.push(ta, h('div', { class: 'row' }, go));
          } else {
            children.push(h('button', { class: 'btn', onclick: () => fill(true) }, s === 'redo' ? '다시 쓰기' : '글 쓰고 제출'));
          }
        } else {
          children.push(h('button', { class: 'btn', onclick: async () => {
            try { await submit(t); toast('제출했어요'); await reload(); }
            catch (e) { console.error(e); toast('제출하지 못했어요', 'error'); }
          } }, s === 'redo' ? '다시 제출' : '다 했어요 (제출)'));
        }
      } else if (s === 'done') {
        children.push(h('p', { class: 'muted' }, '선생님이 확인했어요. 잘했어요! 🎉'));
      } else if (s === 'submitted') {
        children.push(h('p', { class: 'muted' }, '선생님 확인을 기다리고 있어요.'));
        // 잘못 눌렀으면 선생님 확인 전까지 취소할 수 있다(반복 과제는 마감이 지나면 다시 낼 수 없어서 알려 줌)
        const pastDue = t.dueAt?.toMillis && t.dueAt.toMillis() < Date.now();
        children.push(h('button', { class: 'btn secondary small', onclick: async () => {
          const warn = t.repeat && pastDue ? '\n마감이 지나서 취소하면 다시 낼 수 없어요.' : '';
          if (!confirm(`'${t.title}' 제출을 취소할까요?${warn}`)) return;
          try { await deleteDoc(doc(db, 'submissions', `${t.id}_${sid}`)); toast('제출을 취소했어요'); await reload(); }
          catch (e) { console.error(e); toast('취소하지 못했어요', 'error'); }
        } }, '제출 취소'));
      }
      box.replaceChildren(...children.filter(Boolean));
    }
    fill(false);
    return box;
  }

  // 지난 과제는 최근 1주일 것만: 마감(없으면 마지막 제출 시각)이 7일 안이거나 아직 안 된 과제
  const PAST_DAYS = 7;
  const recent = (t) => {
    const ms = t.dueAt?.toMillis?.() ?? t.sub?.lastAt?.toMillis?.() ?? null;
    return ms == null || ms >= Date.now() - PAST_DAYS * 86400000;
  };

  function listFor(which) {
    return data.tasks.filter((t) => {
      const s = t.sub?.status;
      if (which === 'past' && !recent(t)) return false;
      if (t.absent || t.expired) return which === 'past'; // 결석한 날 과제·지난 반복 과제는 지난 과제로
      if (which === 'todo') return !s || s === 'redo';
      if (which === 'sent') return s === 'submitted';
      return s === 'done' || s === 'exempt'; // past
    });
  }

  function draw() {
    const TABS = [['todo', '해야 할 과제'], ['sent', '제출한 과제'], ['past', '지난 과제']];
    const counts = { todo: listFor('todo').length, sent: listFor('sent').length, past: listFor('past').length };
    const list = listFor(tab);
    const head = h('div', { class: 'board-head' },
      h('div', null,
        h('div', { class: 'bh-title' }, '과제마당'),
        h('div', { class: 'bh-sub' }, `해야 할 과제 ${counts.todo}개 · 제출한 과제 ${counts.sent}개`)));
    content.replaceChildren(h('div', { class: 'tasks' },
      head,
      h('div', { class: 'filterbar' },
        h('div', { class: 'seg' }, ...TABS.map(([id, label]) => h('button', {
          class: `subtab${tab === id ? ' on' : ''}`, onclick: () => { tab = id; draw(); },
        }, counts[id] ? `${label} ${counts[id]}` : label)))),
      list.length === 0
        ? h('p', { class: 'muted', style: 'padding:20px' }, tab === 'past' ? '최근 1주일 동안 끝난 과제가 없어요.' : '여기에는 과제가 없어요.')
        : h('div', null, tab === 'past' ? h('p', { class: 'muted small', style: 'margin:0 2px 8px' }, '최근 1주일 동안의 과제만 보여요.') : null, h('div', { class: 'feed-grid' }, ...list.map(card))),
    ));
  }

  await load();
  draw();
}
