// 관리: 기초미션 준비 — 문제은행 가져오기 + 출제 단원 고르기.
// 문제 내용은 missionQuestions(정답 없음)에, 정답은 missionKeys(교사 전용)에 나눠 쓴다.
import {
  collection, doc, getDoc, getDocs, writeBatch, updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';

const DIFF = { basic: '기초', normal: '보통', challenge: '도전' };

function validateBank(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('문제 목록이 비어 있어요.');
  for (const q of list) {
    if (!q.id || !/^[A-Za-z0-9_~-]{1,120}$/.test(q.id)) throw new Error(`문제 id가 이상해요: ${q.id}`);
    if (!q.unit) throw new Error(`단원(unit)이 없어요: ${q.id}`);
    if (!['choice', 'number'].includes(q.type)) throw new Error(`type은 choice/number 만 돼요: ${q.id}`);
    if (!Array.isArray(q.answers) || q.answers.length === 0) throw new Error(`정답(answers)이 없어요: ${q.id}`);
    if (q.type === 'choice' && !Array.isArray(q.choices)) throw new Error(`보기(choices)가 없어요: ${q.id}`);
  }
}

async function importBank(list) {
  validateBank(list);
  // 한 batch 500칸 제한(문제당 2칸) → 넉넉히 200문제씩 나눠 쓴다
  for (let i = 0; i < list.length; i += 200) {
    const b = writeBatch(db);
    for (const q of list.slice(i, i + 200)) {
      b.set(doc(db, 'missionQuestions', q.id), {
        grade: q.grade ?? null, term: q.term ?? null, topic: q.topic ?? '',
        unit: q.unit, difficulty: q.difficulty ?? 'normal',
        type: q.type, question: q.question ?? '', choices: q.choices ?? [],
      });
      b.set(doc(db, 'missionKeys', q.id), { unit: q.unit, answers: q.answers });
    }
    await b.commit();
  }
  return list.length;
}

export async function renderMission(root) {
  async function load() {
    const [qSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'missionQuestions')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byUnit = new Map();
    for (const q of questions) {
      const u = byUnit.get(q.unit) ?? { total: 0, basic: 0, normal: 0, challenge: 0 };
      u.total += 1;
      u[q.difficulty] = (u[q.difficulty] ?? 0) + 1;
      byUnit.set(q.unit, u);
    }
    return { byUnit, chosen: new Set(sSnap.data()?.mission?.units ?? []), perDay: sSnap.data()?.mission?.perDay };
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast(e.message || '안 됐어요.', 'error'); }
    draw();
  }

  async function draw() {
    const { byUnit, chosen, perDay } = await load();
    const paste = h('textarea', { class: 'paste', placeholder: '직접 만든 문제은행(JSON)을 붙여 넣을 수도 있어요. 형식은 data/math-sample.json 과 같아요.' });

    const units = [...byUnit.keys()].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    const total = [...byUnit.values()].reduce((n, c) => n + c.total, 0);
    const chosenNow = units.filter((u) => chosen.has(u)).length;
    const dirtyNote = h('span', { class: 'muted small' });

    const unitRows = units.map((unit) => {
      const c = byUnit.get(unit);
      const cb = h('input', { type: 'checkbox', checked: chosen.has(unit) });
      const row = h('label', { class: `unit-row${cb.checked ? ' on' : ''}` }, cb,
        h('span', { class: 'unit-name' }, unit),
        h('span', { class: 'muted' }, `문제 ${c.total}개 (기초 ${c.basic} · 보통 ${c.normal} · 도전 ${c.challenge})`),
      );
      cb.addEventListener('change', () => { row.classList.toggle('on', cb.checked); markDirty(); });
      return row;
    });
    const boxes = () => unitRows.map((r) => r.querySelector('input'));
    function markDirty() {
      const changed = boxes().some((cb, i) => cb.checked !== chosen.has(units[i]));
      dirtyNote.textContent = changed ? '바뀐 내용이 있어요. 저장을 눌러 주세요.' : '';
    }
    function setAll(on) {
      boxes().forEach((cb, i) => { cb.checked = on; unitRows[i].classList.toggle('on', on); });
      markDirty();
    }

    const saveUnits = h('button', { class: 'btn', disabled: byUnit.size === 0, onclick: () => {
      const picked = units.filter((_, i) => boxes()[i].checked);
      run(() => updateDoc(doc(db, 'settings', 'main'), { 'mission.units': picked }),
        picked.length ? `출제 단원 ${picked.length}개를 저장했어요` : '출제 단원을 모두 껐어요');
    } }, '출제 단원 저장');

    const unitCard = h('section', { class: 'card' },
      h('h2', null, '출제 단원 고르기'),
      byUnit.size === 0
        ? h('p', { class: 'muted' }, '아직 문제은행이 없어요. 위에서 먼저 가져와 주세요.')
        : h('div', null,
          h('p', { class: 'muted small', style: 'margin:-2px 0 8px' }, `체크한 단원에서만 학생에게 문제가 나가요.${perDay ? ` 학생은 하루 ${perDay}문제를 풀어요.` : ''}`),
          h('div', { class: 'mission-sum' },
            h('span', { class: 'todo-badge' }, `문제 ${total}개`),
            h('span', { class: 'todo-badge' }, `단원 ${units.length}개`),
            h('span', { class: `todo-badge${chosenNow ? '' : ' care'}` }, chosenNow ? `출제 중 ${chosenNow}개 단원` : '출제 중인 단원 없음')),
          h('div', { class: 'row', style: 'margin:10px 0 8px' },
            h('button', { class: 'btn secondary small', onclick: () => setAll(true) }, '모두 고르기'),
            h('button', { class: 'btn secondary small', onclick: () => setAll(false) }, '모두 끄기')),
          h('div', { class: 'units' }, ...unitRows),
          h('div', { class: 'row', style: 'margin-top:12px' }, saveUnits, dirtyNote),
        ),
    );

    root.replaceChildren(...[
      byUnit.size ? unitCard : null,
      h('section', { class: 'card' },
        h('h2', null, '문제은행 가져오기'),
        h('p', { class: 'muted' }, '버튼을 누르면 문제가 들어가요. 같은 문제를 다시 넣으면 덮어써서 중복되지 않아요. 6학년 2학기는 천재교과서 6개 단원 156문제예요.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => {
            const res = await fetch('data/math-6-2.json');
            const list = await res.json();
            run(async () => { const n = await importBank(list); toast(`6학년 2학기 ${n}문제를 넣었어요`); });
          } }, '6학년 2학기 문제은행 가져오기'),
          h('button', { class: 'btn secondary', onclick: async () => {
            const res = await fetch('data/math-sample.json');
            const list = await res.json();
            run(async () => { const n = await importBank(list); toast(`샘플 ${n}문제를 넣었어요`); });
          } }, '샘플(분수·소수) 가져오기'),
        ),
        h('details', { class: 'paste-more' }, h('summary', null, '직접 만든 문제 붙여 넣기 (고급)'),
          h('div', { style: 'margin-top:8px' }, paste,
            h('div', { class: 'row', style: 'margin-top:8px' },
              h('button', { class: 'btn secondary', onclick: () => {
                let list;
                try { list = JSON.parse(paste.value); } catch { toast('JSON 형식이 아니에요.', 'error'); return; }
                run(async () => { const n = await importBank(list); toast(`${n}문제를 넣었어요`); });
              } }, '붙여 넣은 문제 가져오기'),
            ),
          ),
        ),
      ),
      byUnit.size ? null : unitCard,
    ].filter(Boolean));
  }

  await draw();
}
