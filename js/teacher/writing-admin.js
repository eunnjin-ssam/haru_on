// 글마당 관리: 카드 목록(신고 글 맨 앞), 검색·상태 필터, 숨기기/공개/삭제(포인트 회수)/수정.
import {
  collection, doc, getDoc, getDocs, updateDoc, writeBatch, increment,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const REASON_LABEL = { tease: '놀리는 말', swear: '욕설', etc: '기타' };
const ORDER = { reported: 0, hidden: 1, public: 2 };

function weekIdOf(dateStr) {
  const y = +dateStr.slice(0, 4); const m = +dateStr.slice(4, 6); const d = +dateStr.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export async function renderWritingAdmin(root) {
  let posts = [];
  let names = new Map();
  let reportsByTarget = new Map();
  let settings = {};
  let statusFilter = 'all';
  let search = '';

  async function load() {
    const [postSnap, stuSnap, repSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'posts')),
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'reports')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    posts = postSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
    names = new Map(stuSnap.docs.map((d) => [d.id, `${d.data().number}번 ${d.data().name}`]));
    reportsByTarget = new Map();
    for (const d of repSnap.docs) {
      const r = d.data();
      if (r.kind !== 'post') continue;
      const arr = reportsByTarget.get(r.target) ?? [];
      arr.push(r.reason);
      reportsByTarget.set(r.target, arr);
    }
    settings = cfgSnap.data() ?? {};
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요. 다시 해 주세요.', 'error'); }
    await load(); draw();
  }

  const setStatus = (p, status) => updateDoc(doc(db, 'posts', p.id), { status });

  async function deletePost(p) {
    const idx = p.id.lastIndexOf('_');
    const sid = p.id.slice(0, idx); const date = p.id.slice(idx + 1);
    const wk = `${sid}_${weekIdOf(date)}`;
    const writeTxRef = doc(db, 'points', `writing_${p.id}`);
    const [txSnap, weekSnap] = await Promise.all([getDoc(writeTxRef), getDoc(doc(db, 'writingWeeks', wk))]);
    let wallet = 0; let total = 0;
    const b = writeBatch(db);
    b.delete(doc(db, 'posts', p.id));
    if (txSnap.exists()) { wallet += txSnap.data().wallet; total += txSnap.data().total; b.delete(writeTxRef); }
    if (weekSnap.exists()) {
      const days = (weekSnap.data().days ?? []).filter((d) => d !== date);
      b.update(doc(db, 'writingWeeks', wk), { days });
      if (days.length < (settings.points?.bonusDays ?? 3)) {
        const bonusRef = doc(db, 'points', `writingBonus_${wk}`);
        const bSnap = await getDoc(bonusRef);
        if (bSnap.exists()) { wallet += bSnap.data().wallet; total += bSnap.data().total; b.delete(bonusRef); }
      }
    }
    b.update(doc(db, 'summaries', sid), { wallet: increment(-wallet), total: increment(-total), reading: increment(-1) });
    await b.commit();
  }

  function editPost(p) {
    const title = h('input', { type: 'text', value: p.title ?? '' });
    const summary = h('textarea', null, p.summary ?? '');
    const thoughts = h('textarea', null, p.thoughts ?? '');
    const dlg = h('div', { class: 'sheet' }, h('div', { class: 'sheet-box wide' },
      h('h3', null, '글 고치기'),
      h('label', { class: 'wf' }, h('span', null, '책 제목'), title),
      h('label', { class: 'wf' }, h('span', null, '줄거리'), summary),
      h('label', { class: 'wf' }, h('span', null, '느낌'), thoughts),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { dlg.remove(); run(() => updateDoc(doc(db, 'posts', p.id), { title: title.value, summary: summary.value, thoughts: thoughts.value, editedByTeacher: true }), '고쳤어요'); } }, '저장'),
        h('button', { class: 'btn secondary', onclick: () => dlg.remove() }, '취소'))));
    document.body.append(dlg);
  }

  function card(p) {
    const reasons = reportsByTarget.get(p.id) ?? [];
    const badge = p.status === 'reported'
      ? h('span', { class: 'badge error' }, `신고됨: ${reasons.map((r) => REASON_LABEL[r] ?? r).join(', ')}`)
      : (p.status === 'hidden' ? h('span', { class: 'badge skip' }, '숨김') : null);

    const actions = [];
    if (p.status === 'public') actions.push(h('button', { class: 'btn secondary small', onclick: () => run(() => setStatus(p, 'hidden'), '숨겼어요') }, '숨기기'));
    else actions.push(h('button', { class: 'btn secondary small', onclick: () => run(() => setStatus(p, 'public'), '다시 공개했어요') }, '공개하기'));
    actions.push(h('button', { class: 'btn secondary small', onclick: () => editPost(p) }, '수정'));
    actions.push(h('button', { class: 'btn danger small', onclick: () => { if (confirm('글을 삭제하고 포인트(주간 보너스 포함)를 회수할까요?')) run(() => deletePost(p), '삭제하고 포인트를 회수했어요'); } }, '삭제'));

    return h('article', { class: `admin-post${p.status === 'reported' ? ' flag' : ''}` },
      h('div', { class: 'ap-head' },
        h('div', null, h('b', null, p.title), ' ', badge,
          h('div', { class: 'muted small' }, `${names.get(p.author) ?? p.author} · ${ymdLabel(postedId(p))} 올림${p.readDate ? ` (읽은 날 ${p.readDate})` : ''} · ♥ ${p.likes ?? 0}${p.editedByTeacher ? ' · 선생님이 고침' : ''}`)),
      ),
      h('p', { class: 'ap-body' }, p.summary),
      p.thoughts ? h('p', { class: 'ap-body muted' }, `느낌: ${p.thoughts}`) : null,
      h('div', { class: 'row' }, ...actions),
    );
  }

  // 올린 날짜 'YYYYMMDD' (문서 id = 학생_날짜)
  const postedId = (p) => p.id.slice(p.id.lastIndexOf('_') + 1);
  const ymdLabel = (id) => `${Number(id.slice(4, 6))}/${Number(id.slice(6, 8))}`;
  // 필터 상태(여러 개 함께 적용)
  let month = ''; let from = ''; let to = ''; let who = '';

  function draw() {
    const listBox = h('div');
    const countLine = h('p', { class: 'muted small', style: 'margin:0' });

    function renderList() {
      const filtered = posts.filter((p) => {
        const d = postedId(p);
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (month && d.slice(0, 6) !== month) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (who && p.author !== who) return false;
        if (search) {
          const hay = `${p.title ?? ''} ${names.get(p.author) ?? ''}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      });
      const reportedN = posts.filter((p) => p.status === 'reported').length;
      countLine.textContent = `학생 글 ${posts.length}편${filtered.length !== posts.length ? ` 중 ${filtered.length}편` : ''}${reportedN ? ` · 🚩 신고 ${reportedN}` : ''} · 신고 글이 맨 앞에 와요`;
      listBox.replaceChildren(filtered.length === 0
        ? h('p', { class: 'muted', style: 'padding:4px 2px' }, '조건에 맞는 글이 없어요.')
        : h('div', { class: 'admin-posts' }, ...filtered.map(card)));
    }

    const months = [...new Set(posts.map((p) => postedId(p).slice(0, 6)))].sort().reverse();
    const students = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko', { numeric: true }));
    const dateIn = (v, set) => h('input', { type: 'date', value: v ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '', onchange: (e) => { set(e.target.value.replaceAll('-', '')); renderList(); } });

    const searchBox = h('input', { type: 'text', placeholder: '책 제목·학생 이름 검색', value: search, oninput: (e) => { search = e.target.value; renderList(); } });
    const statusSel = h('select', { onchange: (e) => { statusFilter = e.target.value; renderList(); } },
      ...[['all', '모든 상태'], ['public', '공개'], ['hidden', '숨김'], ['reported', '신고됨']].map(([v, l]) => h('option', { value: v, selected: statusFilter === v }, l)));
    const monthSel = h('select', { onchange: (e) => { month = e.target.value; renderList(); } },
      h('option', { value: '' }, '모든 달'), ...months.map((m) => h('option', { value: m, selected: month === m }, `${m.slice(0, 4)}년 ${Number(m.slice(4))}월`)));
    const whoSel = h('select', { onchange: (e) => { who = e.target.value; renderList(); } },
      h('option', { value: '' }, '모든 학생'), ...students.map(([sid, nm]) => h('option', { value: sid, selected: who === sid }, nm)));
    const reset = h('button', { class: 'btn secondary small', onclick: () => {
      search = ''; statusFilter = 'all'; month = ''; from = ''; to = ''; who = ''; draw();
    } }, '필터 지우기');

    root.replaceChildren(h('section', { class: 'card' },
      h('div', null, h('h2', null, '글마당 관리'), countLine),
      h('div', { class: 'filter-row' },
        searchBox, statusSel, monthSel, whoSel,
        h('span', { class: 'muted small' }, '올린 날'), dateIn(from, (v) => { from = v; }), h('span', { class: 'muted' }, '~'), dateIn(to, (v) => { to = v; }),
        reset),
      listBox,
    ));
    renderList();
  }

  await load();
  draw();
}
