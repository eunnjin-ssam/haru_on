// 건의·신고: 학생이 '앱이 이상해요(버그)' 또는 '이런 게 있으면 좋겠어요(제안)'를 보낸다.
// feedback 컬렉션에 저장되고 선생님만 본다. 하루 3건까지(규칙으로 제한).
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';

const SCREENS = ['오늘', '글마당', '약속마당', '과제마당', '나의마당', '내 캐릭터', '상점', '기타'];
const IDEA_CATS = ['새 기능', '아이템', '기타'];

async function nextSlot(sid) {
  for (let n = 1; n <= 3; n++) {
    const snap = await getDoc(doc(db, 'feedback', `${sid}_${todayId()}_${n}`)).catch(() => null);
    if (!snap?.exists()) return n;
  }
  return null;
}

export function openFeedback(student) {
  const sid = student.sid;
  const box = h('div', { class: 'sheet-box wide' });
  const dlg = h('div', { class: 'sheet' }, box);
  const close = () => dlg.remove();
  document.body.append(dlg);

  function chooseKind() {
    box.replaceChildren(
      h('h3', null, '무엇을 보낼까요?'),
      h('button', { class: 'fb-choice', onclick: () => form('bug') },
        h('span', { class: 'fb-emoji' }, '🛠️'),
        h('div', null, h('div', { class: 'fb-t' }, '앱이 이상해요'), h('div', { class: 'muted small' }, '안 되거나 잘못 나와요'))),
      h('button', { class: 'fb-choice', onclick: () => form('idea') },
        h('span', { class: 'fb-emoji' }, '💡'),
        h('div', null, h('div', { class: 'fb-t' }, '이런 게 있으면 좋겠어요'), h('div', { class: 'muted small' }, '새 기능 · 아이템'))),
      h('button', { class: 'link', onclick: close }, '닫기'),
    );
  }

  function form(kind) {
    const opts = kind === 'bug' ? SCREENS : IDEA_CATS;
    const sel = h('select', null, ...opts.map((o) => h('option', { value: o }, o)));
    const body = h('textarea', { maxlength: '1000', placeholder: kind === 'bug' ? '어떤 점이 이상한지 써 주세요.' : '어떤 게 있으면 좋을지 써 주세요.' });
    const send = h('button', { class: 'btn', onclick: async () => {
      if (!body.value.trim()) { toast('내용을 써 주세요.', 'error'); return; }
      send.disabled = true;
      try {
        const n = await nextSlot(sid);
        if (n == null) { toast('오늘은 3번까지 보낼 수 있어요. 내일 또 보내 주세요.', 'error'); close(); return; }
        const device = `${navigator.userAgent} · ${window.screen?.width}x${window.screen?.height}`.slice(0, 300);
        await setDoc(doc(db, 'feedback', `${sid}_${todayId()}_${n}`), {
          sid,
          kind,
          menu: kind === 'bug' ? sel.value : '제안',
          category: kind === 'bug' ? '앱 오류' : sel.value,
          body: body.value.trim(),
          device,
          status: 'new',
          at: serverTimestamp(),
        });
        toast('선생님께 보냈어요. 고마워요!');
        close();
      } catch (e) { console.error(e); toast('보내지 못했어요. 다시 해 주세요.', 'error'); send.disabled = false; }
    } }, '보내기');

    box.replaceChildren(
      h('h3', null, kind === 'bug' ? '앱이 이상해요' : '이런 게 있으면 좋겠어요'),
      h('label', { class: 'wf' }, h('span', null, kind === 'bug' ? '어떤 화면인가요?' : '무엇인가요?'), sel),
      h('label', { class: 'wf' }, h('span', null, '내용'), body),
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('button', { class: 'link', onclick: chooseKind }, '← 뒤로'),
        h('div', { class: 'row' }, h('button', { class: 'btn secondary', onclick: close }, '취소'), send)),
    );
  }

  chooseKind();
}
