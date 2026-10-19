// 관리: 전체 백업 내려받기, 백업에서 복원, 학년말 전체 초기화.
import {
  collection, doc, getDocs, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

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
