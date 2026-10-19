// 약속마당: 우리 반 이야기 올리기(이름 공개/익명/선생님만 보기) → 공감 → 회의 안건 → 약속.
// 공개 글에 친구 이름이 들어가면 올리기 전 경고하고 '선생님만 보기'를 권한다. 포인트 없음.
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, updateDoc,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';

const REPORT_REASONS = [['tease', '놀리는 말'], ['swear', '욕설'], ['etc', '기타']];
const EFF_LABEL = { story: '🌱 이야기 중', agenda: '🍲 회의 안건', promise: '✅ 우리가 정한 것', hold: '보류' };
const KINDS = [['idea', '💡', '이렇게 해보면'], ['opinion', '💬', '내 생각은']];
const RANK = { agenda: 0, story: 1 };

function fmtDate(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function renderStories(content, student, settings) {
  const sid = student.sid;
  const threshold = settings.storyAgendaLikes ?? 5;
  let view = 'list';
  let data;

  // 공감 수가 기준을 넘으면 화면에서 '회의 안건'으로 보여 준다(교사가 바꾼 단계도 반영).
  function effStage(s) {
    if (s.stage === 'promise') return 'promise';
    if (s.stage === 'hold') return 'hold';
    if (s.stage === 'agenda' || (s.likes ?? 0) >= threshold) return 'agenda';
    return 'story';
  }

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

  async function addComment(s, text, kind) {
    await addDoc(collection(db, 'stories', s.id, 'comments'), { author: sid, text, status: 'public', kind, at: serverTimestamp() });
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
    const eff = effStage(s);
    const likes = s.likes ?? 0;
    const box = h('article', { class: 'story-card' });
    let open = false; // 의견 펼침
    let kind = 'idea'; // 쓰려는 의견 종류
    let draft = ''; // 쓰던 내용(종류 바꿔도 유지)

    function fill() {
      const ideaN = comments.filter((c) => (c.kind ?? 'idea') === 'idea').length;
      const opN = comments.filter((c) => c.kind === 'opinion').length;

      // 공감 진행 바 + 안내 (약속은 제외)
      const progress = eff === 'promise' ? null : h('div', { class: 'sc-progress' },
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${Math.min(100, (likes / threshold) * 100)}%` })),
        h('div', { class: 'muted small', style: 'margin-top:6px' },
          eff === 'agenda' ? '다음 학급회의에서 함께 이야기해요'
            : `${Math.max(0, threshold - likes)}명 더 공감하면 회의 안건이 돼요`));

      // 의견 쓰기 폼
      const commentInput = h('textarea', { maxlength: '300', class: 'comment-input', placeholder: kind === 'idea' ? '이렇게 하면 어떨까요?' : '내 생각을 적어 주세요', oninput: (e) => { draft = e.target.value; } });
      commentInput.value = draft;
      const kindBtns = KINDS.map(([k, emoji, label]) => h('button', {
        class: `kind-btn${kind === k ? ' on' : ''}`, type: 'button', onclick: () => { kind = k; fill(); },
      }, `${emoji} ${label}`));
      const addBtn = h('button', { class: 'btn', onclick: async () => {
        const t = commentInput.value.trim();
        if (!t) { toast('의견을 써 주세요.', 'error'); return; }
        const hits = findNames(t);
        if (hits.length && !confirm(`"${hits.join(', ')}" 친구 이름이 있어요. 그래도 올릴까요?`)) return;
        try { draft = ''; await addComment(s, t, kind); toast('의견을 남겼어요'); await reload(); } catch (e) { console.error(e); toast('안 됐어요', 'error'); }
      } }, '의견 남기기');

      const hasComments = (ideaN + opN) > 0;
      const commentToggle = h('button', { class: 'linkish comment-toggle', onclick: () => { open = !open; fill(); } },
        hasComments ? `💡 ${ideaN} · 💬 ${opN} 의견 ${open ? '접기' : '보기'}` : (open ? '닫기' : '💬 의견 쓰기'));

      const commentBox = open ? h('div', { class: 'comments' },
        ...comments.map((c) => h('div', { class: 'comment' },
          h('span', null, `${c.kind === 'opinion' ? '💬' : '💡'} `,
            h('b', null, `${c.author === sid ? '나' : (data.names.get(c.author) ?? '친구')}`), `  ${c.text}`),
          c.author === sid ? null : h('button', { class: 'linkish report', onclick: () => reportCommentMenu(s, c) }, '신고'))),
        h('div', { class: 'comment-form' },
          h('div', { class: 'row' }, ...kindBtns),
          commentInput,
          addBtn),
      ) : null;

      box.replaceChildren(...[
        h('div', { class: 'sc-head' },
          h('span', { class: `stage stage-${eff}` }, EFF_LABEL[eff]),
          h('span', { class: 'muted small' }, `${who(s)}${fmtDate(s.at) ? ` · ${fmtDate(s.at)}` : ''}`)),
        h('p', { class: 'sc-wish' }, s.wish),
        h('p', { class: 'muted' }, s.reason),
        (s.when || s.what || s.feeling) ? h('details', null, h('summary', { class: 'muted' }, '자세히'),
          s.when ? h('p', null, `언제: ${s.when}`) : null,
          s.what ? h('p', null, `무슨 일: ${s.what}`) : null,
          s.feeling ? h('p', null, `내 마음: ${s.feeling}`) : null) : null,
        progress,
        h('div', { class: 'sc-foot' },
          h('button', { class: `like${liked ? ' on' : ''}`, disabled: (s.author === sid) || liked, onclick: async () => {
            try { await like(s); await reload(); } catch (e) { console.error(e); toast('공감은 한 번만 할 수 있어요', 'error'); }
          } }, `🫶 공감 ${likes}`),
          commentToggle),
        commentBox,
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

  function guideCard() {
    return h('section', { class: 'card guide' },
      h('ol', { class: 'guide-steps' },
        h('li', null, '같이 고치고 싶은 일을 올려요.'),
        h('li', null, '친구 ', h('b', null, `${threshold}명`), '이 공감하면 ', h('b', null, '학급회의 안건'), '이 돼요.'),
        h('li', null, '회의에서 정한 것은 ', h('b', null, '우리 반 약속'), '이 돼요.')),
      h('p', { class: 'guide-note muted' }, '여기는 누가 잘못했는지 가리는 곳이 아니에요. ', h('b', null, '친구 이름은 쓰지 않아요.')));
  }

  function listView() {
    const promises = data.stories.filter((s) => effStage(s) === 'promise');
    const others = data.stories.filter((s) => { const e = effStage(s); return e !== 'promise' && e !== 'hold'; })
      .sort((a, b) => (RANK[effStage(a)] - RANK[effStage(b)])
        || ((b.likes ?? 0) - (a.likes ?? 0))
        || ((b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0)));
    return h('div', { class: 'stories-list' },
      guideCard(),
      promises.length ? h('section', { class: 'card promises' },
        h('h3', null, '🤝 우리 반 약속'),
        h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '회의에서 함께 정한 것'),
        ...promises.map((s) => h('p', { class: 'promise-item' }, `✅ ${s.decided || s.wish}`,
          // 선생님이 정한 점검일이 되면: 잘 지켜지고 있는지 함께 돌아보기
          s.reviewAt && s.reviewAt <= todayId() ? h('span', { class: 'promise-review' }, '🔎 잘 지켜지고 있나요?') : null))) : null,
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
