// 관리 페이지 > 학생 명단: 등록(엑셀 붙여넣기), PIN 발급·재설정, 이름 고치기, 전학 처리, PIN 카드 인쇄
import {
  collection, doc, getDocs, query, where, writeBatch, setDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { forgetClass } from './class-data.js';

const MANY_DEVICES = 3; // 로그인 기기가 이만큼 넘으면 PIN 유출을 의심해 빨갛게 표시
const EMPTY_EQUIP ={ hair: null, face: null, top: null, bottom: null, shoes: null, headAcc: null, faceAcc: null };

function newPin() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(4, '0');
}

// "1	김하늘" / "1 김하늘" / "1,김하늘" 줄들을 읽는다
export function parseRoster(text) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || /^번호/.test(t)) return;
    const m = t.match(/^(\d{1,2})[\s,]+(.+)$/);
    if (!m || Number(m[1]) < 1) { errors.push(`${i + 1}번째 줄 "${t}"`); return; }
    rows.push({ number: Number(m[1]), name: m[2].replace(/\t/g, ' ').trim() });
  });
  return { rows, errors };
}

async function loadAll() {
  const [studentsSnap, pinsSnap, sessionsSnap] = await Promise.all([
    getDocs(collection(db, 'students')),
    getDocs(collection(db, 'studentPins')),
    getDocs(collection(db, 'sessions')),
  ]);
  const pins = new Map(pinsSnap.docs.map((d) => [d.data().sid, d.data().pin]));
  const logins = new Map();
  for (const d of sessionsSnap.docs) {
    const { sid, at } = d.data();
    const cur = logins.get(sid) ?? { count: 0, last: null };
    cur.count += 1;
    if (at && (!cur.last || at.toMillis() > cur.last.toMillis())) cur.last = at;
    logins.set(sid, cur);
  }
  const students = studentsSnap.docs
    .map((d) => ({ sid: d.id, ...d.data(), pin: pins.get(d.id) ?? '', login: logins.get(d.id) }))
    .sort((a, b) => a.number - b.number);
  return students;
}

async function clearSessions(sid) {
  const snap = await getDocs(query(collection(db, 'sessions'), where('sid', '==', sid)));
  const b = writeBatch(db);
  snap.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
}

function studentUrl() {
  return new URL('./', location.origin + location.pathname).href;
}

function formatTime(ts) {
  const d = ts.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function renderRoster(root) {
  let students = await loadAll();
  let showPins = false;
  let preview = null; // { rows: [{number, name, status}], errors }

  const active = () => students.filter((s) => s.active);
  const left = () => students.filter((s) => !s.active);

  async function reload() {
    students = await loadAll();
    draw();
  }

  async function run(task, done) {
    try {
      await task();
      if (done) toast(done);
      forgetClass('students'); // 학생 이름·전학 등이 오늘 현황·체크판에 바로 보이게
    } catch (e) {
      console.error(e);
      toast('저장하지 못했어요. 다시 해 주세요.', 'error');
    }
    await reload();
  }

  // ----- 등록 -----
  function makePreview(text) {
    const { rows, errors } = parseRoster(text);
    const used = new Map(active().map((s) => [s.number, s]));
    const seen = new Set();
    preview = {
      errors,
      rows: rows.map((r) => {
        let status = 'new';
        if (seen.has(r.number)) status = 'dup';
        else if (used.has(r.number)) status = 'exists';
        seen.add(r.number);
        return { ...r, status, current: used.get(r.number)?.name };
      }),
    };
    draw();
  }

  async function register() {
    const toAdd = preview.rows.filter((r) => r.status === 'new');
    await run(async () => {
      const b = writeBatch(db);
      for (const r of toAdd) {
        const ref = doc(collection(db, 'students'));
        const sid = ref.id;
        b.set(ref, { number: r.number, name: r.name, active: true });
        b.set(doc(db, 'numbers', String(r.number)), { sid });
        b.set(doc(db, 'studentPins', String(r.number)), { pin: newPin(), sid });
        b.set(doc(db, 'summaries', sid), { wallet: 0, total: 0, lastTx: '', reading: 0, missionDays: 0, roleDays: 0 });
        b.set(doc(db, 'profiles', sid), { equip: EMPTY_EQUIP, title: null, awarded: [] });
      }
      await b.commit();
      preview = null;
    }, `${toAdd.length}명을 등록했어요`);
  }

  // ----- 학생별 관리 -----
  function rename(s) {
    const name = prompt(`${s.number}번 이름을 고쳐 주세요.`, s.name)?.trim();
    if (!name || name === s.name) return;
    run(() => updateDoc(doc(db, 'students', s.sid), { name }), '이름을 고쳤어요');
  }

  function resetPin(s) {
    if (!confirm(`${s.number}번 ${s.name}의 비밀번호를 새로 만들까요?\n지금 로그인된 기기에서는 모두 로그아웃돼요.`)) return;
    const pin = newPin();
    run(async () => {
      await setDoc(doc(db, 'studentPins', String(s.number)), { pin, sid: s.sid });
      await clearSessions(s.sid);
      showPins = true;
    }, `새 비밀번호: ${pin}`);
  }

  function transfer(s) {
    if (!confirm(`${s.number}번 ${s.name}을(를) 전학 처리할까요?\n로그인이 막히고, 그동안의 기록은 남아요. ${s.number}번은 비게 돼요.`)) return;
    run(async () => {
      const b = writeBatch(db);
      b.update(doc(db, 'students', s.sid), { active: false, leftAt: serverTimestamp() });
      b.delete(doc(db, 'numbers', String(s.number)));
      b.delete(doc(db, 'studentPins', String(s.number)));
      await b.commit();
      await clearSessions(s.sid);
    }, '전학 처리했어요');
  }

  function restore(s) {
    if (active().some((a) => a.number === s.number)) {
      alert(`${s.number}번은 지금 다른 학생이 쓰고 있어요. 먼저 번호를 정리해 주세요.`);
      return;
    }
    if (!confirm(`${s.number}번 ${s.name}을(를) 다시 재학으로 바꿀까요? 비밀번호는 새로 만들어요.`)) return;
    run(async () => {
      const b = writeBatch(db);
      b.update(doc(db, 'students', s.sid), { active: true, leftAt: null });
      b.set(doc(db, 'numbers', String(s.number)), { sid: s.sid });
      b.set(doc(db, 'studentPins', String(s.number)), { pin: newPin(), sid: s.sid });
      await b.commit();
    }, '재학으로 바꿨어요');
  }

  // ----- PIN 카드 인쇄 -----
  function printCards() {
    const url = studentUrl();
    document.getElementById('print-area').replaceChildren(...active().map((s) => h('div', { class: 'pin-card' },
      h('div', { class: 'name' }, `${s.number}번 ${s.name}`),
      h('div', null, '내 비밀번호'),
      h('div', { class: 'pin' }, s.pin),
      h('div', { class: 'url' }, url),
    )));
    window.print();
  }

  // ----- 그리기 -----
  function previewView() {
    if (!preview) return null;
    const label = { new: ['새 학생', 'new'], exists: ['이미 있는 번호 · 건너뜀', 'skip'], dup: ['번호가 겹쳐요 · 건너뜀', 'error'] };
    const count = preview.rows.filter((r) => r.status === 'new').length;
    return h('div', null,
      h('h3', null, '미리보기'),
      preview.errors.length
        ? h('p', { class: 'banner' }, `읽지 못한 줄: ${preview.errors.join(', ')}`) : null,
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '상태'))),
        h('tbody', null, preview.rows.map((r) => h('tr', null,
          h('td', { class: 'num' }, r.number),
          h('td', null, r.name),
          h('td', null, h('span', { class: `badge ${label[r.status][1]}` },
            label[r.status][0] + (r.status === 'exists' ? ` (지금: ${r.current})` : ''))),
        ))),
      ),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn', disabled: count === 0, onclick: register }, `${count}명 등록하기`),
        h('button', { class: 'btn secondary', onclick: () => { preview = null; draw(); } }, '취소'),
      ),
    );
  }

  function draw() {
    const textarea = h('textarea', {
      class: 'paste',
      placeholder: '엑셀에서 번호와 이름 두 칸을 복사해 여기에 붙여 넣으세요.\n예)\n1\t김하늘\n2\t이바다',
    });

    const list = active();
    const table = list.length === 0
      ? h('p', { class: 'muted' }, '아직 등록된 학생이 없어요. 아래에서 등록해 주세요.')
      : h('table', null,
        h('thead', null, h('tr', null,
          h('th', null, '번호'), h('th', null, '이름'), h('th', null, '비밀번호'),
          h('th', null, '로그인한 기기'), h('th', null, ''))),
        h('tbody', null, list.map((s) => h('tr', null,
          h('td', { class: 'num' }, s.number),
          h('td', null, h('button', { class: 'linkish', title: '이름 고치기', onclick: () => rename(s) }, s.name)),
          h('td', { class: 'pin' }, showPins ? s.pin : '••••'),
          h('td', { class: s.login?.count >= MANY_DEVICES ? 'login-warn' : 'muted' },
            s.login ? `${s.login.count}대 · 최근 ${formatTime(s.login.last)}${s.login.count >= MANY_DEVICES ? ' ⚠️' : ''}` : '아직 안 함'),
          h('td', { class: 'actions' },
            h('button', { class: 'btn secondary small', onclick: () => resetPin(s) }, '비밀번호 재설정'),
            h('button', { class: 'btn secondary small', onclick: () => transfer(s) }, '전학 처리'),
          ),
        ))),
      );

    root.replaceChildren(...[
      h('section', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', null, h('h2', null, `학생 명단 (${list.length}명)`),
            h('div', { class: 'url-box muted small' }, '학생 접속 주소', h('code', null, studentUrl()),
              h('button', { class: 'btn secondary small', onclick: async () => {
                try { await navigator.clipboard.writeText(studentUrl()); toast('주소를 복사했어요'); } catch { toast('복사하지 못했어요.', 'error'); }
              } }, '복사'))),
          h('div', { class: 'row' },
            h('button', { class: 'btn secondary', disabled: list.length === 0, onclick: () => { showPins = !showPins; draw(); } }, showPins ? '비밀번호 숨기기' : '비밀번호 보기'),
            h('button', { class: 'btn secondary', disabled: list.length === 0, onclick: printCards }, '비밀번호 카드 인쇄'),
          ),
        ),
        h('div', { style: 'margin-top:16px' }, table),
        list.length ? h('p', { class: 'muted small' }, `이름을 누르면 고칠 수 있어요. 로그인한 기기가 ${MANY_DEVICES}대 이상이면 빨갛게 보여요 — 모르는 기기가 있으면 비밀번호를 재설정해 주세요.`) : null,
      ),
      h('section', { class: 'card' },
        h('h2', null, '학생 등록'),
        preview ? null : h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, '엑셀에서 번호·이름 두 칸을 복사해 붙여 넣고 ‘미리보기’를 눌러요. 이미 있는 번호는 건너뛰어요.'),
        preview ? previewView() : h('div', null,
          textarea,
          h('div', { class: 'row', style: 'margin-top:12px' },
            h('button', { class: 'btn', onclick: () => makePreview(textarea.value) }, '미리보기'),
            h('span', { class: 'muted' }, '비밀번호는 4자리로 자동으로 만들어요.'),
          ),
        ),
      ),
      left().length ? h('section', { class: 'card' },
        h('h2', null, '전학 간 학생'),
        h('table', null, h('tbody', null, left().map((s) => h('tr', null,
          h('td', { class: 'num' }, s.number),
          h('td', null, s.name),
          h('td', { class: 'actions' }, h('button', { class: 'btn secondary small', onclick: () => restore(s) }, '재학으로 되돌리기')),
        )))),
      ) : null,
    ].filter(Boolean));
  }

  draw();
}
