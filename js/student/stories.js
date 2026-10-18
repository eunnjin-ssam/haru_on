// 약속마당: 우리 반 이야기 올리기(이름 공개/익명/선생님만 보기) → 공감 → 회의 안건 → 약속.
// 공개 글에 친구 이름이 들어가면 올리기 전 경고하고 '선생님만 보기'를 권한다. 포인트 없음.
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, updateDoc,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const REPORT_REASONS = [['tease', '놀리는 말'], ['swear', '욕설'], ['etc', '기타']];
const STAGE = { story: '이야기', agenda: '회의 안건', promise: '우리반 약속', hold: '보류' };

export async function renderStories(content, student, settings) {
  const sid = student.sid;
  let view = 'list';
  let data;

  async function load() {
    const [storySnap, stuSnap] = await Promise.all([
      getDocs(query(collection(db, 'stories'), where('hidden', '==', false))),
      getDocs(collection(db, 'students')),
    ]);
    const stories = storySnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    const names = new Map(stuSnap.docs.map((d) => [d.id, d.data().name]));
    // 내 공감 여부 + 공개 댓글
    const [likeSnaps, commentSnaps] = await Promise.all([
      Promise.all(stories.map((s) => getDoc(doc(db, 'stories', s.id, 'likes', sid)).catch(() => null))),
      Promise.all(stories.map((s) => getDocs(query(collection(db, 'stories', s.id, 'comments'), where('status', '==', 'public'))).catch(() => null))),
    ]);
    const liked = new Set();
    stories.forEach((s, i) => { if (likeSnaps[i]?.exists()) liked.add(s.id); });
    const comments = new Map();
    stories.forEach((s, i) => { comments.set(s.id, (commentSnaps[i]?.docs ?? []).map((d) => ({ id: d.id, ...d.data() }))); });
    data = { stories, names, liked, comments, classNames: [...names.values()] };
  }

  async function reload() { await load(); draw(); }

  const findNames = (text) => data.classNames.filter((n) => n && text.includes(n));

  // ---- 올리기 ----
  async function postStory(mode, f) {
    if (mode === 'private') {
      const payload = { author: sid, wish: f.wish, reason: f.reason, at: serverTimestamp() };
      if (f.when) payload.when = f.when;
      if (f.what) payload.what = f.what;
      if (f.feeling) payload.feeling = f.feeling;
      await addDoc(collection(db, 'privateStories'), payload);
      return;
    }
    const ref = doc(collection(db, 'stories'));
    const base = { mode, wish: f.wish, reason: f.reason, likes: 0, stage: 'story', hidden: false, at: serverTimestamp() };
    if (mode === 'named') base.author = sid;
    if (f.when) base.when = f.when;
    if (f.what) base.what = f.what;
    if (f.feeling) base.feeling = f.feeling;
    const b = writeBatch(db);
    b.set(ref, base);
    b.set(doc(db, 'storyAuthors', ref.id), { sid, at: serverTimestamp() });
    await b.commit();
  }

  function writeView() {
    const f = { wish: '', reason: '', when: '', what: '', feeling: '' };
    let mode = 'named';
    let more = false;

    const wish = h('textarea', { placeholder: '우리 반이 이러면 좋겠어요', maxlength: '500', oninput: (e) => { f.wish = e.target.value; } });
    const reason = h('textarea', { placeholder: '왜 그렇게 생각했나요?', maxlength: '1000', oninput: (e) => { f.reason = e.target.value; } });
    const when = h('textarea', { placeholder: '언제 그런 일이 있었나요?', maxlength: '300', oninput: (e) => { f.when = e.target.value; } });
    const what = h('textarea', { placeholder: '무슨 일이 있었나요?', maxlength: '1000', oninput: (e) => { f.what = e.target.value; } });
    const feeling = h('textarea', { placeholder: '그때 내 마음은 어땠나요?', maxlength: '500', oninput: (e) => { f.feeling = e.target.value; } });

    const modeBtns = [['named', '이름 공개'], ['anon', '익명'], ['private', '선생님만 보기']];
    const container = h('div');

    function drawForm() {
      const btns = modeBtns.map(([m, label]) => h('button', { class: `chip${mode === m ? ' on' : ''}`, onclick: () => { mode = m; drawForm(); } }, label));
      container.replaceChildren(h('section', { class: 'card' },
        h('h3', null, '누구에게 보여줄까요?'),
        h('div', { class: 'row' }, ...btns),
        mode === 'anon' ? h('p', { class: 'muted small' }, '친구들에게는 익명이지만, 선생님은 누가 썼는지 볼 수 있어요.') : null,
        mode === 'private' ? h('p', { class: 'muted small' }, '선생님만 볼 수 있어요. 공감·회의 안건에는 올라가지 않아요.') : null,
        h('label', { class: 'wf' }, h('span', null, '우리 반이 이러면 좋겠어요'), wish),
        h('label', { class: 'wf' }, h('span', null, '왜 그렇게 생각했나요'), reason),
        h('button', { class: 'linkish', onclick: () => { more = !more; drawForm(); } }, more ? '접기' : '더 자세히 쓸래요'),
        more ? h('div', null,
          h('label', { class: 'wf' }, h('span', null, '언제'), when),
          h('label', { class: 'wf' }, h('span', null, '무슨 일'), what),
          h('label', { class: 'wf' }, h('span', null, '그때 내 마음'), feeling)) : null,
        h('button', { class: 'btn', onclick: () => trySubmit(mode) }, '올리기'),
      ));
    }

    async function doPost(m) {
      try { await postStory(m, f); toast('이야기를 올렸어요'); view = 'list'; await reload(); }
      catch (e) { console.error(e); toast('올리지 못했어요. 다시 해 주세요.', 'error'); }
    }

    function trySubmit(m) {
      if (!f.wish.trim() || !f.reason.trim()) { toast('두 칸을 모두 써 주세요.', 'error'); return; }
      const hits = m !== 'private' ? findNames(`${f.wish} ${f.reason} ${f.when} ${f.what} ${f.feeling}`) : [];
      if (hits.length) {
        const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
          h('h3', null, '친구 이름이 들어 있어요'),
          h('p', null, `"${hits.join(', ')}" 같은 친구 이름이 보여요. 친구가 속상할 수 있어요. '선생님만 보기'로 올리는 건 어때요?`),
          h('button', { class: 'btn', onclick: () => { dlg.remove(); doPost('private'); } }, '선생님만 보기로 올리기'),
          h('button', { class: 'btn secondary', onclick: () => { dlg.remove(); doPost(m); } }, '그래도 공개로 올리기'),
          h('button', { class: 'link', onclick: () => dlg.remove() }, '다시 쓸래요')));
        document.body.append(dlg);
        return;
      }
      doPost(m);
    }

    drawForm();
    return container;
  }

  // ---- 목록 ----
  async function like(s) {
    const b = writeBatch(db);
    b.update(doc(db, 'stories', s.id), { likes: increment(1) });
    b.set(doc(db, 'stories', s.id, 'likes', sid), { at: serverTimestamp() });
    await b.commit();
  }

  async function addComment(s, text) {
    await addDoc(collection(db, 'stories', s.id, 'comments'), { author: sid, text, status: 'public', at: serverTimestamp() });
  }

  async function reportComment(s, c, reason) {
    const b = writeBatch(db);
    b.update(doc(db, 'stories', s.id, 'comments', c.id), { status: 'reported' });
    b.set(doc(db, 'reports', `comment_${c.id}_${sid}`), {
      kind: 'comment', target: c.id, story: s.id, reporter: sid, reason, at: serverTimestamp(),
    });
    await b.commit();
  }

  function who(s) {
    if (s.mode === 'anon') return '익명';
    return s.author === sid ? '나' : (data.names.get(s.author) ?? '친구');
  }

  function storyCard(s) {
    const liked = data.liked.has(s.id);
    const comments = data.comments.get(s.id) ?? [];
    const box = h('article', { class: 'story-card' });

    function fill() {
      const commentInput = h('input', { type: 'text', maxlength: '300', placeholder: '이렇게 하면 좋을 것 같아요' });
      const addBtn = h('button', { class: 'btn secondary small', onclick: async () => {
        const t = commentInput.value.trim();
        if (!t) return;
        const hits = findNames(t);
        if (hits.length && !confirm(`"${hits.join(', ')}" 친구 이름이 있어요. 그래도 올릴까요?`)) return;
        try { await addComment(s, t); toast('댓글을 올렸어요'); await reload(); } catch (e) { console.error(e); toast('안 됐어요', 'error'); }
      } }, '올리기');

      box.replaceChildren(...[
        h('div', { class: 'sc-head' },
          h('span', { class: `stage stage-${s.stage}` }, STAGE[s.stage] ?? s.stage),
          h('span', { class: 'muted small' }, who(s)),
        ),
        h('p', { class: 'sc-wish' }, s.wish),
        h('p', { class: 'muted' }, s.reason),
        (s.when || s.what || s.feeling) ? h('details', null, h('summary', { class: 'muted' }, '자세히'),
          s.when ? h('p', null, `언제: ${s.when}`) : null,
          s.what ? h('p', null, `무슨 일: ${s.what}`) : null,
          s.feeling ? h('p', null, `내 마음: ${s.feeling}`) : null) : null,
        h('div', { class: 'sc-actions' },
          h('button', { class: `like${liked ? ' on' : ''}`, disabled: (s.author === sid) || liked, onclick: async () => {
            try { await like(s); await reload(); } catch (e) { console.error(e); toast('공감은 한 번만 할 수 있어요', 'error'); }
          } }, `♥ ${s.likes ?? 0}`),
        ),
        h('div', { class: 'comments' },
          ...comments.map((c) => h('div', { class: 'comment' },
            h('span', null, `${c.author === sid ? '나' : (data.names.get(c.author) ?? '친구')}: ${c.text}`),
            c.author === sid ? null : h('button', { class: 'linkish report', onclick: () => reportCommentMenu(s, c) }, '신고'))),
          h('div', { class: 'add-comment' }, commentInput, addBtn),
        ),
      ].filter(Boolean));
    }
    fill();
    return box;
  }

  function reportCommentMenu(s, c) {
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, '왜 신고하나요?'),
      ...REPORT_REASONS.map(([code, label]) => h('button', { class: 'btn secondary', onclick: async () => {
        dlg.remove();
        try { await reportComment(s, c, code); toast('신고했어요'); await reload(); } catch (e) { console.error(e); toast('안 됐어요', 'error'); }
      } }, label)),
      h('button', { class: 'link', onclick: () => dlg.remove() }, '취소')));
    document.body.append(dlg);
  }

  function listView() {
    const promises = data.stories.filter((s) => s.stage === 'promise');
    const others = data.stories.filter((s) => s.stage !== 'promise');
    return h('div', null,
      promises.length ? h('section', { class: 'card promises' },
        h('h3', null, '우리반 약속'),
        ...promises.map((s) => h('p', { class: 'promise-item' }, `✅ ${s.decided || s.wish}`))) : null,
      others.length === 0
        ? h('p', { class: 'muted', style: 'padding:20px' }, '아직 이야기가 없어요. 우리 반 이야기를 올려 보세요!')
        : h('div', { class: 'feed-grid' }, ...others.map(storyCard)),
    );
  }

  function draw() {
    const writeBtn = h('button', { class: view === 'write' ? 'btn secondary' : 'btn', onclick: () => { view = view === 'write' ? 'list' : 'write'; draw(); } },
      view === 'write' ? '← 이야기 보기' : '✏️ 이야기 올리기');
    const head = h('div', { class: 'board-head' },
      h('div', null,
        h('div', { class: 'bh-title' }, view === 'write' ? '우리 반 이야기 올리기' : '우리 반 이야기'),
        h('div', { class: 'bh-sub' }, view === 'write' ? '이름 공개·익명·선생님만 보기 중에 골라요' : '함께 읽고 공감·댓글을 남겨요')),
      writeBtn);
    content.replaceChildren(h('div', { class: 'stories' },
      head,
      view === 'write' ? writeView() : listView(),
    ));
  }

  await load();
  draw();
}
