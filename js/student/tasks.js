// 과제마당: 선생님이 낸 과제를 보고 제출한다. 제출하면 체크판에 '확인 대기'로 들어간다.
// 포인트는 선생님이 확인할 때 지급(마감 뒤에 내면 0점). 여기서는 제출만 한다.
import {
  collection, doc, getDocs, query, where, setDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { ddayLabel as dday } from '../common/dates.js';
import { isShown } from '../common/task-visible.js';

export async function renderTasks(content, student, settings) {
  const sid = student.sid;
  const currency = settings.names.currency;
  let tab = 'todo';
  let data;

  async function load() {
    const [taskSnap, subSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), where('targets', 'array-contains', sid))),
      getDocs(query(collection(db, 'submissions'), where('sid', '==', sid))),
    ]);
    const subs = new Map(subSnap.docs.map((d) => [d.id, d.data()]));
    const tasks = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.kind === 'homework' && isShown(t))
      .map((t) => ({ ...t, sub: subs.get(`${t.id}_${sid}`) }))
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
    if (s === 'submitted') return h('span', { class: 'chip-s wait' }, '확인 대기');
    if (s === 'done') return h('span', { class: 'chip-s ok' }, '완료');
    if (s === 'redo') return h('span', { class: 'chip-s redo' }, '다시 해오기');
    if (s === 'exempt') return h('span', { class: 'chip-s' }, '면제');
    return h('span', { class: 'chip-s todo' }, '해야 해요');
  }

  function card(t) {
    const s = t.sub?.status;
    const canSubmit = !s || s === 'redo';
    const box = h('article', { class: 'task-card' });

    function fill(open) {
      const head = h('div', { class: 'tc-head' },
        h('div', null, h('div', { class: 'tc-title' }, t.title),
          h('div', { class: 'muted small' }, `${t.subject ? t.subject + ' · ' : ''}${dday(t.dueAt)} · ${!s && t.dueAt?.toMillis && t.dueAt.toMillis() < Date.now() ? '지금 내면 0' : t.points}${currency}`)),
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
      }
      box.replaceChildren(...children.filter(Boolean));
    }
    fill(false);
    return box;
  }

  function listFor(which) {
    return data.tasks.filter((t) => {
      const s = t.sub?.status;
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
        ? h('p', { class: 'muted', style: 'padding:20px' }, '여기에는 과제가 없어요.')
        : h('div', { class: 'feed-grid' }, ...list.map(card)),
    ));
  }

  await load();
  draw();
}
