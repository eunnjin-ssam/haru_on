// 관리: 전체 백업 내려받기, 백업에서 복원, 학생 기록 지우기, 학년말 전체 초기화.
import {
  collection, doc, getDocs, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { resetStudent } from './student-reset.js';

// 백업에 담는 최상위 컬렉션
const COLLECTIONS = [
  'students', 'numbers', 'studentPins', 'settings', 'notices', 'messages', 'feedback',
  'points', 'summaries', 'moods', 'moodNotes', 'attendance', 'missionKeys', 'missionQuestions',
  'missionAttempts', 'roles', 'roleChecks', 'roleTerms', 'roleWishes', 'posts', 'writingWeeks',
  'drafts', 'reports', 'stories', 'storyAuthors', 'privateStories', 'storyNotes', 'promises',
  'tasks', 'taskRepeats', 'submissions', 'shopItems', 'coupons', 'couponUses', 'couponIdeas', 'goals',
  'items', 'ownedItems', 'profiles', 'careNotes',
];
// 하위 컬렉션 (부모 → 이름들)
const SUBCOLS = { posts: ['likes'], stories: ['likes', 'comments'], goals: ['donors'], notices: ['reads'] };
// 초기화 때 지우지 않는 것(선생님·설정·문제은행·상점/아이템 틀)
const KEEP = new Set(['settings', 'missionKeys', 'missionQuestions', 'shopItems', 'items']);

// Timestamp → {__ts} 로 바꿔 JSON에 담고, 되돌릴 수 있게 한다
function enc(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = enc(v[k]); return o; }
  return v;
}
function dec(v) {
  if (v && typeof v === 'object' && '__ts' in v && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
  return v;
}

async function buildBackup() {
  const out = { at: new Date().toISOString(), collections: {}, sub: {} };
  for (const c of COLLECTIONS) {
    const snap = await getDocs(collection(db, c));
    out.collections[c] = {};
    for (const d of snap.docs) {
      out.collections[c][d.id] = enc(d.data());
      for (const sc of (SUBCOLS[c] ?? [])) {
        const ssnap = await getDocs(collection(db, c, d.id, sc));
        if (ssnap.empty) continue;
        const key = `${c}/${d.id}/${sc}`;
        out.sub[key] = {};
        for (const sd of ssnap.docs) out.sub[key][sd.id] = enc(sd.data());
      }
    }
  }
  return out;
}

async function commitChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) op(b);
    await b.commit();
  }
}

async function restore(backup) {
  const ops = [];
  for (const [c, docs] of Object.entries(backup.collections ?? {})) {
    for (const [id, dataVal] of Object.entries(docs)) ops.push((b) => b.set(doc(db, c, id), dec(dataVal)));
  }
  for (const [path, docs] of Object.entries(backup.sub ?? {})) {
    const [c, pid, sc] = path.split('/');
    for (const [id, dataVal] of Object.entries(docs)) ops.push((b) => b.set(doc(db, c, pid, sc, id), dec(dataVal)));
  }
  await commitChunks(ops);
}

async function resetAll() {
  const ops = [];
  for (const c of COLLECTIONS) {
    if (KEEP.has(c)) continue;
    const snap = await getDocs(collection(db, c));
    for (const d of snap.docs) {
      for (const sc of (SUBCOLS[c] ?? [])) {
        const ssnap = await getDocs(collection(db, c, d.id, sc));
        for (const sd of ssnap.docs) ops.push((b) => b.delete(doc(db, c, d.id, sc, sd.id)));
      }
      ops.push((b) => b.delete(doc(db, c, d.id)));
    }
  }
  await commitChunks(ops);
}

export async function renderAdmin(root) {
  function download(obj) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `우리반-백업-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('백업 파일로 복원할까요? 지금 데이터 위에 덮어써요.')) return;
    try {
      const backup = JSON.parse(await f.text());
      await restore(backup);
      toast('복원했어요.');
    } catch (err) { console.error(err); toast('복원하지 못했어요. 파일을 확인해 주세요.', 'error'); }
    fileInput.value = '';
  } });

  // 학생 기록 지우기: 고른 학생의 기록만 지우고 명단·번호·PIN은 남긴다(시험 기록 정리용)
  const students = (await getDocs(collection(db, 'students'))).docs
    .map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active !== false).sort((a, b) => a.number - b.number);
  function resetStudentCard() {
    const checks = students.map((s) => ({ s, box: h('input', { type: 'checkbox' }) }));
    const btn = h('button', { class: 'btn danger', onclick: async () => {
      const picked = checks.filter((c) => c.box.checked).map((c) => c.s);
      if (!picked.length) { toast('기록을 지울 학생을 골라 주세요.', 'error'); return; }
      const who = picked.map((s) => `${s.number}번 ${s.name}`).join(', ');
      if (!confirm(`${who}의 기록을 모두 지울까요?\n포인트·기분·기초미션·과제·글·아이템 등이 지워지고 되돌릴 수 없어요.`)) return;
      if (!confirm('한 번 더 확인해요. 정말 지울까요? (학생 명단·번호·PIN은 남아요)')) return;
      btn.disabled = true;
      try {
        for (const s of picked) { toast(`${s.number}번 ${s.name} 기록을 지우는 중…`); await resetStudent(s.sid); }
        toast('기록을 지웠어요.');
        for (const c of checks) c.box.checked = false;
      } catch (e) { console.error(e); toast('다 지우지 못했어요. 다시 눌러 주세요.', 'error'); }
      btn.disabled = false;
    } }, '고른 학생 기록 지우기');
    return h('section', { class: 'card' }, h('h2', null, '학생 기록 지우기'),
      h('p', { class: 'muted' }, '시험 삼아 써 본 학생의 기록만 깨끗이 지워요. 학생 명단·번호·PIN은 그대로라 바로 다시 쓸 수 있어요.'),
      h('p', { class: 'muted small' }, '지우는 것: 포인트 내역(지갑·누적 0), 기분, 기초미션, 1인1역 확인·희망, 과제 제출, 글마당 글·공감, 약속마당 이야기·댓글·공감, 신고, 쿠폰, 아이템·캐릭터 모습·칭호, 공동 목표 기부, 쪽지, 건의, 살핌판 메모'),
      students.length
        ? h('div', { class: 'reset-pick' }, ...checks.map(({ s, box }) => h('label', { class: 'reset-chip' }, box, ` ${s.number}번 ${s.name}`)))
        : h('p', { class: 'muted' }, '학생이 없어요.'),
      h('div', { class: 'row', style: 'margin-top:10px' }, btn));
  }

  root.replaceChildren(
    h('section', { class: 'card' }, h('h2', null, '데이터 백업'),
      h('p', { class: 'muted' }, '우리 반의 모든 데이터를 파일 하나로 내려받아요. 가끔 받아 두면 안전해요.'),
      h('button', { class: 'btn', onclick: async () => {
        toast('백업을 만드는 중…');
        try { download(await buildBackup()); toast('백업 파일을 내려받았어요.'); } catch (e) { console.error(e); toast('백업하지 못했어요.', 'error'); }
      } }, '전체 백업 내려받기')),

    h('section', { class: 'card' }, h('h2', null, '백업에서 복원'),
      h('p', { class: 'muted' }, '내려받은 백업 파일로 되돌려요. 지금 데이터 위에 덮어써요(지우지는 않아요).'),
      h('button', { class: 'btn secondary', onclick: () => fileInput.click() }, '백업 파일 고르기'), fileInput),

    resetStudentCard(),

    h('section', { class: 'card danger-zone' }, h('h2', null, '⚠️ 학년말 전체 초기화'),
      h('p', { class: 'banner' }, '학생·포인트·글·과제 등 한 해 기록을 모두 지워요. 설정·문제은행·상점 틀은 남아요. 되돌릴 수 없으니 먼저 백업을 받아 주세요.'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('정말 전체 초기화할까요? 되돌릴 수 없어요.')) return;
        if (!confirm('한 번 더 확인해요. 백업은 받으셨나요? 지금 모든 학생 기록을 지웁니다.')) return;
        toast('초기화하는 중…');
        try { await resetAll(); toast('초기화했어요.'); } catch (e) { console.error(e); toast('초기화하지 못했어요.', 'error'); }
      } }, '학년말 전체 초기화')),
  );
}
