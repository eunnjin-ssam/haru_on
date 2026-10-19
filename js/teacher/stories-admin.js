// 약속마당 관리: 이야기 단계(이야기→안건→약속/보류), 가리기, 익명 작성자 확인, 안건 공감 기준,
// 비슷한 이야기 합치기, 회의 화면(스마트보드용 크게 보기), 약속 점검(확정 n주 뒤), 신고된 댓글 처리,
// 선생님만 보기 이야기함(새 표시·상담 메모).
import {
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc, query, where,
  writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, addDaysId } from '../common/dates.js';

const STAGES = [['story', '이야기'], ['agenda', '회의 안건'], ['promise', '우리반 약속'], ['hold', '보류']];
const REVIEW_DAYS = 21; // 약속 확정 뒤 점검까지(기획서: 3주)
const md = (id) => (id ? `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}` : '');
const toInput = (id) => (id ? `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}` : '');

export async function renderStoriesAdmin(root) {
  let stories = [];
  let authors = new Map();
  let privates = [];
  let newPrivates = new Set(); // 이번에 처음 본 것(‘새’ 표시)
  let notes = new Map();
  let reported = []; // 신고된 댓글 { story, id, ...comment }
  let names = new Map();
  let threshold = 5;

  async function load() {
    const [stSnap, auSnap, prSnap, stuSnap, cfgSnap, noteSnap] = await Promise.all([
      getDocs(collection(db, 'stories')),
      getDocs(collection(db, 'storyAuthors')),
      getDocs(collection(db, 'privateStories')),
      getDocs(collection(db, 'students')),
      getDoc(doc(db, 'settings', 'main')),
      getDocs(collection(db, 'storyNotes')),
    ]);
    stories = stSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    authors = new Map(auSnap.docs.map((d) => [d.id, d.data().sid]));
    privates = prSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    names = new Map(stuSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
    threshold = cfgSnap.data()?.storyAgendaLikes ?? 5;
    notes = new Map(noteSnap.docs.map((d) => [d.id, d.data().memo ?? '']));
    const rep = await Promise.all(stories.map((s) =>
      getDocs(query(collection(db, 'stories', s.id, 'comments'), where('status', '==', 'reported')))
        .then((x) => x.docs.map((d) => ({ story: s, id: d.id, ...d.data() }))).catch(() => [])));
    reported = rep.flat();
  }

  // 선생님만 보기 이야기: 처음 본 것은 ‘새’로 표시하고 본 것으로 기록(오늘 현황 배지에서 빠짐)
  async function markPrivatesSeen() {
    const unseen = privates.filter((p) => !p.seenAt);
    newPrivates = new Set(unseen.map((p) => p.id));
    if (!unseen.length) return;
    const b = writeBatch(db);
    for (const p of unseen) b.update(doc(db, 'privateStories', p.id), { seenAt: serverTimestamp() });
    await b.commit().catch((e) => console.error(e));
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  const authorOf = (s) => (s.mode === 'anon' ? authors.get(s.id) : s.author);
  function authorLabel(s) {
    const real = authors.get(s.id);
    const realName = real ? names.get(real) ?? real : '?';
    if (s.mode === 'anon') return `익명 (실제: ${realName})`;
    return names.get(s.author) ?? realName;
  }
  const isAgenda = (s) => !s.hidden && (s.stage === 'agenda' || (s.stage === 'story' && (s.likes ?? 0) >= threshold));
  const reviewDue = (s) => s.stage === 'promise' && s.reviewAt && s.reviewAt <= todayId();

  // 약속으로 정하기: 정한 문장 + 확정일 + 점검일
  function promiseData(decided) {
    return { stage: 'promise', decided, confirmedAt: todayId(), reviewAt: addDaysId(todayId(), REVIEW_DAYS) };
  }
  function setStage(s, stage) {
    if (stage === 'promise') {
      const decided = prompt('우리가 정한 것(약속 문장)을 적어 주세요.', s.decided || s.wish);
      if (decided == null) { draw(); return; }
      run(() => updateDoc(doc(db, 'stories', s.id), promiseData(decided.trim() || s.wish)), '우리반 약속으로 올렸어요');
    } else {
      run(() => updateDoc(doc(db, 'stories', s.id), { stage }), '단계를 바꿨어요');
    }
  }

  // 비슷한 이야기 합치기: 공감을 옮기되 같은 학생 공감은 한 번만, 원래 이야기는 가리고 작성자에게 쪽지
  async function merge(src, dst) {
    const [srcLikes, dstLikes] = await Promise.all([
      getDocs(collection(db, 'stories', src.id, 'likes')), getDocs(collection(db, 'stories', dst.id, 'likes'))]);
    const have = new Set(dstLikes.docs.map((d) => d.id));
    const add = srcLikes.docs.filter((d) => !have.has(d.id));
    const b = writeBatch(db);
    for (const d of add) b.set(doc(db, 'stories', dst.id, 'likes', d.id), { at: d.data().at ?? serverTimestamp() });
    if (add.length) b.update(doc(db, 'stories', dst.id), { likes: increment(add.length) });
    b.update(doc(db, 'stories', src.id), { hidden: true, mergedInto: dst.id });
    const to = authorOf(src);
    if (to) {
      b.set(doc(collection(db, 'messages')), {
        to, from: 'teacher', at: serverTimestamp(), readAt: null,
        body: `올려 준 이야기 '${src.wish.slice(0, 20)}'를 비슷한 이야기 '${dst.wish.slice(0, 20)}'와 합쳤어요. 공감도 함께 모았어요. 고마워요! 😊`,
      });
    }
    await b.commit();
    return add.length;
  }
  function openMerge(s) {
    const others = stories.filter((o) => o.id !== s.id && !o.hidden && o.stage !== 'hold');
    if (!others.length) { toast('합칠 다른 이야기가 없어요.', 'error'); return; }
    const sel = h('select', null, ...others.map((o) => h('option', { value: o.id }, `${o.wish} (♥ ${o.likes ?? 0})`)));
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box' },
      h('h3', null, '비슷한 이야기에 합치기'),
      h('p', { class: 'muted small', style: 'margin:0' }, `‘${s.wish}’를 아래 이야기에 합쳐요. 공감은 옮기되 같은 학생은 한 번만 세고, 이 이야기는 가려지며 작성자에게 쪽지가 가요.`),
      sel,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => {
          const dst = others.find((o) => o.id === sel.value);
          dlg.remove();
          run(async () => { const n = await merge(s, dst); toast(`합쳤어요 (공감 +${n})`); });
        } }, '합치기'),
        h('button', { class: 'btn secondary', onclick: () => dlg.remove() }, '취소'))));
    document.body.append(dlg);
  }

  // ---- 회의 화면(스마트보드용 크게 보기) ----
  async function openMeeting() {
    const list = stories.filter(isAgenda).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    if (!list.length) { toast('지금 회의 안건이 없어요.', 'error'); return; }
    let i = 0;
    const box = h('div', { class: 'meet-box' });
    const dlg = h('div', { class: 'meet' }, box);
    const close = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); dlg.remove(); load().then(draw); };
    document.body.append(dlg);

    async function show() {
      const s = list[i];
      const cSnap = await getDocs(query(collection(db, 'stories', s.id, 'comments'), where('status', '==', 'public'))).catch(() => null);
      const comments = (cSnap?.docs ?? []).map((d) => d.data());
      const decided = h('textarea', { class: 'meet-input', rows: '2', placeholder: '회의에서 정한 것을 적어요 (예) 복도에서는 걸어 다녀요' }, s.decided || '');
      const done = s.stage === 'promise' ? '✅ 약속으로 정했어요' : (s.stage === 'hold' ? '⏸ 보류했어요' : '');
      box.replaceChildren(...[
        h('div', { class: 'meet-top' },
          h('span', { class: 'meet-count' }, `안건 ${i + 1} / ${list.length} · ♥ ${s.likes ?? 0}`),
          h('div', { class: 'row' },
            h('button', { class: 'btn secondary small', onclick: () => dlg.requestFullscreen?.().catch(() => {}) }, '전체 화면'),
            h('button', { class: 'btn secondary small', onclick: close }, '닫기'))),
        h('h1', { class: 'meet-wish' }, s.wish),
        h('p', { class: 'meet-reason' }, s.reason),
        (s.what || s.feeling) ? h('p', { class: 'meet-more' }, [s.what && `무슨 일: ${s.what}`, s.feeling && `그때 마음: ${s.feeling}`].filter(Boolean).join('  ·  ')) : null,
        comments.length ? h('div', { class: 'meet-ideas' }, h('h3', null, `💡 친구들의 생각 ${comments.length}`),
          ...comments.map((c) => h('p', null, `${c.kind === 'opinion' ? '🗨️' : '💡'} ${c.text}`))) : null,
        done ? h('p', { class: 'meet-done' }, done) : null,
        h('div', { class: 'meet-decide' }, decided,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: async () => {
              const text = decided.value.trim();
              if (!text) { toast('정한 것을 적어 주세요.', 'error'); return; }
              try { await updateDoc(doc(db, 'stories', s.id), promiseData(text)); Object.assign(s, promiseData(text)); toast('우리반 약속으로 정했어요'); show(); }
              catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
            } }, '✅ 약속으로 정하기'),
            h('button', { class: 'btn secondary', onclick: async () => {
              try { await updateDoc(doc(db, 'stories', s.id), { stage: 'hold' }); s.stage = 'hold'; toast('보류했어요'); show(); }
              catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
            } }, '⏸ 보류'))),
        h('div', { class: 'meet-nav' },
          h('button', { class: 'btn secondary', disabled: i === 0, onclick: () => { i -= 1; show(); } }, '◀ 이전 안건'),
          h('button', { class: 'btn secondary', disabled: i === list.length - 1, onclick: () => { i += 1; show(); } }, '다음 안건 ▶')),
      ].filter(Boolean));
    }
    show();
  }

  // ---- 약속 점검 ----
  function reviewCard() {
    const due = stories.filter(reviewDue);
    if (!due.length) return null;
    return h('section', { class: 'card review-card' },
      h('h2', null, `🔎 점검할 약속 (${due.length})`),
      h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '정한 지 시간이 지난 약속이에요. 학생 화면에 “잘 지켜지고 있나요?”가 함께 보여요. 이야기 나눈 뒤 골라 주세요.'),
      ...due.map((s) => h('div', { class: 'req-row' },
        h('div', null, h('b', null, s.decided || s.wish), h('div', { class: 'muted small' }, `${md(s.confirmedAt)} 확정 · 점검일 ${md(s.reviewAt)}`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => run(() => updateDoc(doc(db, 'stories', s.id), { reviewAt: addDaysId(todayId(), REVIEW_DAYS) }), `유지해요. ${REVIEW_DAYS / 7}주 뒤에 다시 점검해요`) }, '유지'),
          h('button', { class: 'btn secondary small', onclick: () => {
            const text = prompt('약속을 어떻게 고칠까요?', s.decided || s.wish);
            if (text == null || !text.trim()) return;
            run(() => updateDoc(doc(db, 'stories', s.id), promiseData(text.trim())), '약속을 고쳤어요');
          } }, '고치기'),
          h('button', { class: 'btn danger small', onclick: () => { if (confirm('이 약속을 없앨까요? (보류로 옮겨요)')) run(() => updateDoc(doc(db, 'stories', s.id), { stage: 'hold' }), '약속을 없앴어요'); } }, '없애기')))));
  }

  // ---- 신고된 댓글 ----
  function reportedCard() {
    if (!reported.length) return null;
    return h('section', { class: 'card' },
      h('h2', null, `🚩 신고된 댓글 (${reported.length})`),
      h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '신고되면 바로 숨겨져요. 확인하고 다시 보이게 하거나 지워요.'),
      ...reported.map((c) => h('div', { class: 'req-row' },
        h('div', null, h('b', null, c.text), h('div', { class: 'muted small' }, `${names.get(c.author) ?? c.author} · 이야기 ‘${c.story.wish}’`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'stories', c.story.id, 'comments', c.id), { status: 'public' }), '다시 보이게 했어요') }, '복구'),
          h('button', { class: 'btn danger small', onclick: () => { if (confirm('이 댓글을 지울까요?')) run(() => deleteDoc(doc(db, 'stories', c.story.id, 'comments', c.id)), '지웠어요'); } }, '삭제')))));
  }

  function card(s) {
    const over = isAgenda(s) && s.stage === 'story';
    const stageSel = h('select', { onchange: (e) => setStage(s, e.target.value) },
      ...STAGES.map(([v, l]) => h('option', { value: v, selected: s.stage === v }, l)));
    const reviewIn = s.stage === 'promise' ? h('input', { type: 'date', value: toInput(s.reviewAt), title: '점검일 바꾸기',
      onchange: (e) => run(() => updateDoc(doc(db, 'stories', s.id), { reviewAt: e.target.value.replaceAll('-', '') }), '점검일을 바꿨어요') }) : null;
    return h('article', { class: `admin-post${over ? ' flag' : ''}${s.mergedInto ? ' done' : ''}` },
      h('div', { class: 'ap-head' },
        h('div', null,
          h('b', null, s.wish), ' ',
          over ? h('span', { class: 'badge new' }, '안건 기준 넘음') : null,
          s.mergedInto ? h('span', { class: 'badge' }, '합쳐짐') : null,
          h('div', { class: 'muted small' }, `${authorLabel(s)} · ♥ ${s.likes ?? 0}${s.decided ? ` · 약속: ${s.decided}` : ''}${s.confirmedAt ? ` · ${md(s.confirmedAt)} 확정` : ''}`)),
      ),
      h('p', { class: 'ap-body muted' }, s.reason),
      h('div', { class: 'row' },
        h('span', { class: 'muted small' }, '단계:'), stageSel,
        reviewIn ? h('span', { class: 'muted small' }, '점검일') : null, reviewIn,
        h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'stories', s.id), { hidden: !s.hidden }), s.hidden ? '다시 보여요' : '가렸어요') }, s.hidden ? '숨김 해제' : '가리기'),
        s.hidden || s.stage === 'hold' ? null : h('button', { class: 'btn secondary small', onclick: () => openMerge(s) }, '합치기'),
        s.hidden ? h('span', { class: 'badge skip' }, '숨김') : null,
      ),
    );
  }

  function privateCard(p) {
    const memo = h('input', { type: 'text', value: notes.get(p.id) ?? '', placeholder: '상담 메모 (선생님만 봐요)', style: 'flex:1',
      onchange: (e) => run(() => setDoc(doc(db, 'storyNotes', p.id), { memo: e.target.value, at: serverTimestamp() }), '메모를 저장했어요') });
    return h('article', { class: 'admin-post' },
      h('div', null, h('b', null, p.wish), ' ', newPrivates.has(p.id) ? h('span', { class: 'badge error' }, '새') : null),
      h('div', { class: 'muted small' }, names.get(p.author) ?? p.author),
      h('p', { class: 'ap-body muted' }, p.reason),
      (p.when || p.what || p.feeling) ? h('p', { class: 'muted small' }, [p.when && `언제: ${p.when}`, p.what && `무슨 일: ${p.what}`, p.feeling && `마음: ${p.feeling}`].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'row' }, memo));
  }

  function draw() {
    const thInput = h('input', { type: 'number', min: '1', value: String(threshold), style: 'width:70px' });
    const agendaN = stories.filter(isAgenda).length;
    root.replaceChildren(...[
      reviewCard(),
      reportedCard(),
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', null,
            h('h2', null, '약속마당 관리'),
            h('p', { class: 'muted small', style: 'margin:0' }, `이야기 ${stories.length}개 · 공감 ${threshold}개를 넘으면 회의 안건이 돼요. 단계를 바꾸거나 가리고, 비슷한 이야기는 합칠 수 있어요.`)),
          h('div', { class: 'row' },
            h('button', { class: 'btn', disabled: agendaN === 0, onclick: openMeeting }, `🗣️ 회의 화면 (${agendaN})`),
            h('span', { class: 'muted small' }, '안건 공감 기준'), thInput,
            h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'settings', 'main'), { storyAgendaLikes: Number(thInput.value) || 5 }), '기준을 바꿨어요') }, '저장'))),
        stories.length === 0 ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '아직 올라온 이야기가 없어요.')
          : h('div', { class: 'admin-posts' }, ...stories.map(card)),
      ),
      h('section', { class: 'card' },
        h('h2', null, `선생님만 보기 이야기함${newPrivates.size ? ` (새 ${newPrivates.size})` : ''}`),
        h('p', { class: 'muted small', style: 'margin:-2px 0 6px' }, '학생이 ‘선생님만 보기’로 올린 이야기예요. 다른 학생에게는 보이지 않아요. 메모는 선생님만 봐요.'),
        privates.length === 0 ? h('p', { class: 'muted' }, '아직 없어요.')
          : h('div', { class: 'admin-posts' }, ...privates.map(privateCard)),
      ),
    ].filter(Boolean));
  }

  await load();
  await markPrivatesSeen();
  draw();
}
