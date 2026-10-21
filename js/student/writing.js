// 글마당(독서 감상): 글쓰기(임시저장) + 친구 글(공감·신고). 하루 1편, 올린 날 +2점, 주간 보너스.
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, weekId, kstNow } from '../common/dates.js';
import { writingMinOf, charCount } from '../common/defaults.js';

const REPORT_REASONS = [['tease', '놀리는 말'], ['swear', '욕설'], ['etc', '기타']];
const STATUS_LABEL = { hidden: '선생님이 숨긴 글', reported: '신고되어 숨겨진 글' };

function todayDateInput() {
  const k = kstNow();
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}
const isWeekday = () => { const d = kstNow().getUTCDay(); return d >= 1 && d <= 5; };

export async function renderWriting(content, student, settings) {
  const sid = student.sid;
  const W = settings.points.writing;
  let view = 'feed';
  let onlyMine = false;
  let data;

  async function load() {
    const [myTodaySnap, draftSnap, publicSnap, mineSnap, studentsSnap] = await Promise.all([
      getDoc(doc(db, 'posts', `${sid}_${todayId()}`)).catch(() => null),
      getDoc(doc(db, 'drafts', sid)).catch(() => null),
      getDocs(query(collection(db, 'posts'), where('status', '==', 'public'))),
      getDocs(query(collection(db, 'posts'), where('author', '==', sid))),
      getDocs(collection(db, 'students')),
    ]);
    const map = new Map();
    for (const d of [...publicSnap.docs, ...mineSnap.docs]) map.set(d.id, { id: d.id, ...d.data() });
    const posts = [...map.values()].sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    const likeSnaps = await Promise.all(posts.map((p) => getDoc(doc(db, 'posts', p.id, 'likes', sid)).catch(() => null)));
    const likedIds = new Set();
    posts.forEach((p, i) => { if (likeSnaps[i]?.exists()) likedIds.add(p.id); });
    data = {
      postedToday: !!myTodaySnap?.exists(),
      draft: draftSnap?.exists() ? draftSnap.data() : null,
      posts,
      names: new Map(studentsSnap.docs.map((d) => [d.id, d.data().name])),
      liked: likedIds,
    };
  }

  async function reload() { await load(); draw(); }

  // ---- 글 올리기 ----
  async function saveDraft(f) {
    await setDoc(doc(db, 'drafts', sid), { ...f, at: serverTimestamp() });
  }

  async function post(f) {
    const postId = `${sid}_${todayId()}`;
    const txId = `writing_${postId}`;
    const b = writeBatch(db);
    b.set(doc(db, 'posts', postId), {
      author: sid, readDate: f.readDate, title: f.title, summary: f.summary, thoughts: f.thoughts,
      status: 'public', likes: 0, editedByTeacher: false, at: serverTimestamp(),
    });
    b.set(doc(db, 'points', txId), {
      sid, type: 'writing', wallet: W, total: W, reason: '글마당', ref: postId, by: sid, at: serverTimestamp(),
    });
    b.update(doc(db, 'summaries', sid), {
      wallet: increment(W), total: increment(W), reading: increment(1), lastTx: txId,
    });
    await b.commit();
    await deleteDoc(doc(db, 'drafts', sid)).catch(() => {});
    if (isWeekday()) await bumpWeek();
  }

  // 주간 보너스: 오늘을 이번 주 글쓴 날에 넣고, 서로 다른 날이 기준 이상이면 보너스 지급
  async function bumpWeek() {
    const wk = `${sid}_${weekId()}`;
    const ref = doc(db, 'writingWeeks', wk);
    const snap = await getDoc(ref).catch(() => null);
    const today = todayId();
    let days;
    if (!snap?.exists()) { days = [today]; await setDoc(ref, { sid, week: weekId(), days }); }
    else if (!snap.data().days.includes(today)) { days = [...snap.data().days, today]; await updateDoc(ref, { days }); }
    else days = snap.data().days;

    if (days.length >= settings.points.bonusDays) {
      const bonusId = `writingBonus_${wk}`;
      const exist = await getDoc(doc(db, 'points', bonusId)).catch(() => null);
      if (!exist?.exists()) {
        const BW = settings.points.writingBonus;
        const b = writeBatch(db);
        b.set(doc(db, 'points', bonusId), {
          sid, type: 'writingBonus', wallet: BW, total: BW, reason: '글마당 주간 보너스', ref: wk, by: sid, at: serverTimestamp(),
        });
        b.update(doc(db, 'summaries', sid), { wallet: increment(BW), total: increment(BW), lastTx: bonusId });
        await b.commit();
        toast(`주간 보너스 +${BW}점! 🎉`);
      }
    }
  }

  function writeView() {
    if (data.postedToday) {
      const mine = data.posts.find((p) => p.id === `${sid}_${todayId()}`);
      return h('section', { class: 'card' },
        h('h3', null, '오늘은 이미 글을 올렸어요 📖'),
        h('p', { class: 'muted' }, '글마당은 하루에 한 편 쓸 수 있어요. 내일 또 써요!'),
        mine ? h('div', { class: 'post-read' }, h('b', null, mine.title), h('p', { class: 'muted' }, mine.summary)) : null,
      );
    }
    const d = data.draft ?? {};
    const f = { readDate: d.readDate || todayDateInput(), title: d.title || '', summary: d.summary || '', thoughts: d.thoughts || '' };
    let timer = null;
    const autosave = () => { clearTimeout(timer); timer = setTimeout(() => saveDraft(f).catch(() => {}), 1200); };

    const readDate = h('input', { type: 'date', value: f.readDate, onchange: (e) => { f.readDate = e.target.value; autosave(); } });
    const title = h('input', { type: 'text', maxlength: '100', value: f.title, placeholder: '책 제목', oninput: (e) => { f.title = e.target.value; counts(); autosave(); } });
    const summary = h('textarea', { maxlength: '3000', placeholder: '어떤 이야기였나요? (줄거리)', oninput: (e) => { f.summary = e.target.value; counts(); autosave(); } }, f.summary);
    const thoughts = h('textarea', { maxlength: '3000', placeholder: '내 생각과 느낌', oninput: (e) => { f.thoughts = e.target.value; counts(); autosave(); } }, f.thoughts);
    // 칸마다 '지금 글자 수 / 최소 글자 수'(띄어쓰기 빼고). 채우면 초록색
    const min = writingMinOf(settings);
    const sumCnt = h('div', { class: 'wf-count' });
    const thoCnt = h('div', { class: 'wf-count' });
    const cnt = h('span', { class: 'muted small' }, '띄어쓰기는 글자 수에 넣지 않아요');
    function counts() {
      for (const [el, text, need] of [[sumCnt, f.summary, min.summary], [thoCnt, f.thoughts, min.thoughts]]) {
        const n = charCount(text);
        el.textContent = need > 0 ? (n >= need ? `${n}자 ✓` : `${n} / ${need}자 · ${need - n}자 더 써요`) : `${n}자`;
        el.classList.toggle('ok', n >= need);
      }
    }
    counts();

    const submit = h('button', { class: 'btn', onclick: async () => {
      if (!f.title.trim()) { toast('책 제목을 써 주세요.', 'error'); return; }
      if (!f.summary.trim() && !f.thoughts.trim()) { toast('줄거리나 느낌을 써 주세요.', 'error'); return; }
      if (charCount(f.summary) < min.summary) { toast(`줄거리를 ${min.summary}자 이상 써 주세요. (지금 ${charCount(f.summary)}자)`, 'error'); return; }
      if (charCount(f.thoughts) < min.thoughts) { toast(`생각과 느낌을 ${min.thoughts}자 이상 써 주세요. (지금 ${charCount(f.thoughts)}자)`, 'error'); return; }
      submit.disabled = true;
      try { await post(f); toast(`글을 올렸어요! +${W}점`); view = 'feed'; await reload(); }
      catch (e) { console.error(e); toast('올리지 못했어요. 다시 해 주세요.', 'error'); submit.disabled = false; }
    } }, '올리기');

    return h('section', { class: 'card writeform' },
      h('h3', null, '오늘의 독서 감상'),
      h('label', { class: 'wf' }, h('span', null, '읽은 날'), readDate),
      h('label', { class: 'wf' }, h('span', null, '책 제목'), title),
      h('label', { class: 'wf' }, h('span', null, '줄거리'), summary, sumCnt),
      h('label', { class: 'wf' }, h('span', null, '내 생각과 느낌'), thoughts, thoCnt),
      h('div', { class: 'row', style: 'justify-content:space-between' }, cnt,
        h('div', { class: 'row' },
          h('button', { class: 'btn secondary', onclick: () => { saveDraft(f).then(() => toast('임시저장했어요')); } }, '임시저장'),
          submit)),
    );
  }

  // ---- 친구 글 ----
  async function like(p) {
    const b = writeBatch(db);
    b.update(doc(db, 'posts', p.id), { likes: increment(1) });
    b.set(doc(db, 'posts', p.id, 'likes', sid), { at: serverTimestamp() });
    await b.commit();
  }

  async function report(p, reason) {
    const b = writeBatch(db);
    b.update(doc(db, 'posts', p.id), { status: 'reported' });
    b.set(doc(db, 'reports', `post_${p.id}_${sid}`), {
      kind: 'post', target: p.id, story: '', reporter: sid, reason, at: serverTimestamp(),
    });
    await b.commit();
  }

  function card(p) {
    const mine = p.author === sid;
    const name = mine ? '나' : (data.names.get(p.author) ?? '친구');
    const liked = data.liked.has(p.id);
    let expanded = false;
    const box = h('article', { class: 'post-card' });

    function fill() {
      const head = h('div', { class: 'pc-head' },
        h('div', null, h('div', { class: 'pc-title' }, p.title),
          h('div', { class: 'pc-meta muted' }, `${name} · ${p.readDate ?? ''}`)),
        p.status && p.status !== 'public' ? h('span', { class: 'badge-bad' }, STATUS_LABEL[p.status] ?? p.status) : null,
      );
      const body = expanded
        ? h('div', { class: 'pc-body' },
          p.summary ? h('p', null, p.summary) : null,
          p.thoughts ? h('p', null, h('b', null, '느낌: '), p.thoughts) : null,
          p.editedByTeacher ? h('p', { class: 'muted' }, '(선생님이 고친 글)') : null)
        : h('p', { class: 'pc-preview muted' }, (p.summary || p.thoughts || '').slice(0, 60) + '…');

      const actions = h('div', { class: 'pc-actions' },
        h('button', { class: `like${liked ? ' on' : ''}`, disabled: mine || liked, onclick: async () => {
          try { await like(p); toast('공감했어요'); await reload(); } catch (e) { console.error(e); toast('안 됐어요', 'error'); }
        } }, `♥ ${p.likes ?? 0}`),
        h('button', { class: 'linkish', onclick: () => { expanded = !expanded; fill(); } }, expanded ? '접기' : '더 보기'),
        mine ? null : h('button', { class: 'linkish report', onclick: () => reportMenu(p) }, '신고'),
      );
      box.replaceChildren(head, body, actions);
    }
    fill();
    return box;
  }

  function reportMenu(p) {
    const pick = REPORT_REASONS.map(([code, label]) => h('button', { class: 'btn secondary', onclick: async () => {
      dlg.remove();
      try { await report(p, code); toast('신고했어요. 선생님이 확인할 거예요.'); await reload(); }
      catch (e) { console.error(e); toast('신고하지 못했어요', 'error'); }
    } }, label));
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, '왜 신고하나요?'), ...pick,
      h('button', { class: 'link', onclick: () => dlg.remove() }, '취소')));
    document.body.append(dlg);
  }

  function feedView() {
    const list = data.posts.filter((p) => (onlyMine ? p.author === sid : (p.status === 'public' || p.author === sid)));
    return h('section', null,
      h('div', { class: 'filterbar', style: 'margin-bottom:16px' },
        h('div', { class: 'seg' },
          h('button', { class: `chip${onlyMine ? '' : ' on'}`, onclick: () => { onlyMine = false; draw(); } }, '전체'),
          h('button', { class: `chip${onlyMine ? ' on' : ''}`, onclick: () => { onlyMine = true; draw(); } }, '내 글'),
        ),
      ),
      list.length === 0
        ? h('p', { class: 'muted', style: 'padding:20px' }, '아직 글이 없어요. 첫 글을 올려 보세요!')
        : h('div', { class: 'feed-grid' }, ...list.map(card)),
    );
  }

  function draw() {
    const count = data.posts.filter((p) => p.status === 'public' || p.author === sid).length;
    const writeBtn = h('button', { class: view === 'write' ? 'btn secondary' : 'btn', onclick: () => { view = view === 'write' ? 'feed' : 'write'; draw(); } },
      view === 'write' ? '← 친구 글 보기' : '✍️ 글쓰기');
    const head = h('div', { class: 'board-head' },
      h('div', null,
        h('div', { class: 'bh-title' }, view === 'write' ? '오늘의 글쓰기' : '책 읽고 글 쓰기'),
        h('div', { class: 'bh-sub' }, view === 'write' ? '하루 한 편, 올리면 포인트를 받아요' : `친구들이 쓴 글을 함께 봐요 · 전체 ${count}편`)),
      writeBtn);
    content.replaceChildren(h('div', { class: 'writing' },
      head,
      view === 'write' ? writeView() : feedView(),
    ));
  }

  await load();
  draw();
}
