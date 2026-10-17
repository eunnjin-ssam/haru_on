// 약속마당 관리: 이야기 단계(이야기→안건→약속/보류), 숨기기, 익명 작성자 확인,
// 안건 공감 기준 조절, 선생님만 보기 이야기함. (회의 큰 화면·약속 점검은 이후에)
import {
  collection, doc, getDoc, getDocs, updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const STAGES = [['story', '이야기'], ['agenda', '회의 안건'], ['promise', '우리반 약속'], ['hold', '보류']];

export async function renderStoriesAdmin(root) {
  let stories = [];
  let authors = new Map();
  let privates = [];
  let names = new Map();
  let threshold = 5;

  async function load() {
    const [stSnap, auSnap, prSnap, stuSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'stories')),
      getDocs(collection(db, 'storyAuthors')),
      getDocs(collection(db, 'privateStories')),
      getDocs(collection(db, 'students')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    stories = stSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    authors = new Map(auSnap.docs.map((d) => [d.id, d.data().sid]));
    privates = prSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    names = new Map(stuSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
    threshold = cfgSnap.data()?.storyAgendaLikes ?? 5;
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  function authorLabel(s) {
    const real = authors.get(s.id);
    const realName = real ? names.get(real) ?? real : '?';
    if (s.mode === 'anon') return `익명 (실제: ${realName})`;
    return names.get(s.author) ?? realName;
  }

  function setStage(s, stage) {
    if (stage === 'promise') {
      const decided = prompt('우리가 정한 것(약속 문장)을 적어 주세요.', s.decided || s.wish);
      if (decided == null) return;
      run(() => updateDoc(doc(db, 'stories', s.id), { stage, decided }), '우리반 약속으로 올렸어요');
    } else {
      run(() => updateDoc(doc(db, 'stories', s.id), { stage }), '단계를 바꿨어요');
    }
  }

  function card(s) {
    const isAgenda = (s.likes ?? 0) >= threshold && s.stage === 'story';
    const stageSel = h('select', { onchange: (e) => setStage(s, e.target.value) },
      ...STAGES.map(([v, l]) => h('option', { value: v, selected: s.stage === v }, l)));
    return h('article', { class: `admin-post${isAgenda ? ' flag' : ''}` },
      h('div', { class: 'ap-head' },
        h('div', null,
          h('b', null, s.wish), ' ',
          isAgenda ? h('span', { class: 'badge new' }, '안건 기준 넘음') : null,
          h('div', { class: 'muted small' }, `${authorLabel(s)} · ♥ ${s.likes ?? 0}${s.decided ? ` · 약속: ${s.decided}` : ''}`)),
      ),
      h('p', { class: 'ap-body muted' }, s.reason),
      h('div', { class: 'row' },
        h('span', { class: 'muted small' }, '단계:'), stageSel,
        h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'stories', s.id), { hidden: !s.hidden }), s.hidden ? '다시 보여요' : '가렸어요') }, s.hidden ? '숨김 해제' : '가리기'),
        s.hidden ? h('span', { class: 'badge skip' }, '숨김') : null,
      ),
    );
  }

  function draw() {
    const thInput = h('input', { type: 'number', min: '1', value: String(threshold), style: 'width:70px' });
    root.replaceChildren(
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h2', null, '약속마당 관리'),
          h('div', { class: 'row' }, h('span', { class: 'muted small' }, '안건 공감 기준'), thInput,
            h('button', { class: 'btn secondary small', onclick: () => run(() => updateDoc(doc(db, 'settings', 'main'), { storyAgendaLikes: Number(thInput.value) || 5 }), '기준을 바꿨어요') }, '저장'))),
        stories.length === 0 ? h('p', { class: 'muted' }, '아직 이야기가 없어요.')
          : h('div', { class: 'admin-posts' }, ...stories.map(card)),
      ),
      h('section', { class: 'card' },
        h('h2', null, '선생님만 보기 이야기함'),
        privates.length === 0 ? h('p', { class: 'muted' }, '아직 없어요.')
          : h('div', { class: 'admin-posts' }, ...privates.map((p) => h('article', { class: 'admin-post' },
            h('b', null, p.wish),
            h('div', { class: 'muted small' }, names.get(p.author) ?? p.author),
            h('p', { class: 'ap-body muted' }, p.reason),
            (p.when || p.what || p.feeling) ? h('p', { class: 'muted small' }, [p.when && `언제: ${p.when}`, p.what && `무슨 일: ${p.what}`, p.feeling && `마음: ${p.feeling}`].filter(Boolean).join(' · ')) : null,
          ))),
      ),
    );
  }

  await load();
  draw();
}
