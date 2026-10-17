// 기분 고르기: 하루 1장, 그날 안에서는 다시 고를 수 있음. 포인트 없음.
// 직접 쓴 기분(custom)은 본인과 선생님만 본다(moodNotes).
import {
  doc, getDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';

export const MOODS = [
  { id: 'excited', emoji: '😆', label: '신나요' },
  { id: 'good', emoji: '🙂', label: '좋아요' },
  { id: 'okay', emoji: '😐', label: '보통이에요' },
  { id: 'upset', emoji: '😢', label: '속상해요' },
  { id: 'angry', emoji: '😠', label: '화나요' },
  { id: 'tired', emoji: '😮‍💨', label: '힘들어요' },
];

export function moodLabel(id) {
  if (id === 'custom') return '직접 씀';
  return MOODS.find((m) => m.id === id)?.label ?? '';
}

// 오늘의 기분 { mood, note } (없으면 mood: null)
export async function loadMood(sid) {
  const id = `${sid}_${todayId()}`;
  // 아직 안 만든 문서는 규칙이 읽기를 거부한다 → '없음'으로 본다.
  const [mood, note] = await Promise.all([
    getDoc(doc(db, 'moods', id)).catch(() => null),
    getDoc(doc(db, 'moodNotes', id)).catch(() => null),
  ]);
  return {
    mood: mood?.exists() ? mood.data().mood : null,
    note: note?.exists() ? note.data().text : '',
  };
}

async function saveMood(sid, mood, text) {
  const id = `${sid}_${todayId()}`;
  const date = todayId();
  const b = writeBatch(db);
  b.set(doc(db, 'moods', id), { sid, date, mood, at: serverTimestamp() });
  if (mood === 'custom') {
    b.set(doc(db, 'moodNotes', id), { sid, date, text, at: serverTimestamp() });
  }
  await b.commit();
}

// container 안에 기분 카드를 그린다. 고르면 onChange(mood) 를 부른다.
export function renderMood(container, sid, current, onChange) {
  let picking = current.mood; // 지금 눌러 둔 값
  let customText = current.note;

  function draw() {
    const buttons = MOODS.map((m) => h('button', {
      type: 'button',
      class: `mood-btn${picking === m.id ? ' on' : ''}`,
      onclick: () => choose(m.id),
    }, h('span', { class: 'emoji' }, m.emoji), h('span', { class: 'label' }, m.label)));

    const customBtn = h('button', {
      type: 'button',
      class: `mood-btn${picking === 'custom' ? ' on' : ''}`,
      onclick: () => choose('custom'),
    }, h('span', { class: 'emoji' }, '✏️'), h('span', { class: 'label' }, '직접 쓸래요'));

    const customBox = picking === 'custom' ? h('div', { class: 'mood-custom' },
      h('input', {
        type: 'text', maxlength: '100', value: customText,
        placeholder: '오늘 기분을 한 줄로 써 보세요 (선생님만 봐요)',
        oninput: (e) => { customText = e.target.value; },
      }),
      h('button', { class: 'btn small', onclick: () => commit('custom') }, '저장'),
    ) : null;

    container.replaceChildren(...[
      h('div', { class: 'mood-grid' }, ...buttons, customBtn),
      customBox,
    ].filter(Boolean));
  }

  function choose(mood) {
    picking = mood;
    if (mood === 'custom') { draw(); return; } // 글을 쓰고 저장 버튼을 누른다
    commit(mood);
  }

  async function commit(mood) {
    const text = customText.trim();
    if (mood === 'custom' && !text) { toast('한 줄 써 주세요', 'error'); return; }
    try {
      await saveMood(sid, mood, text);
      current.mood = mood;
      current.note = text;
      toast('기분을 담았어요');
      onChange?.(mood);
    } catch (e) {
      console.error(e);
      toast('담지 못했어요. 다시 해 주세요.', 'error');
    }
    draw();
  }

  draw();
}
