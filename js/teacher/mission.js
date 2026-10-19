// 관리: 기초미션 준비 — 문제은행 가져오기 + 출제 범위(학년·학기별 단원 고르기, 단원 이름 바꾸기).
// 문제 내용은 missionQuestions(정답 없음)에, 정답은 missionKeys(교사 전용)에 나눠 쓴다.
import {
  collection, doc, getDoc, getDocs, writeBatch, updateDoc, query, where, arrayUnion, arrayRemove,
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
  // 선생님이 바꾼 단원 이름(원래 이름 → 새 이름)은 다시 가져와도 유지한다
  const renames = (await getDoc(doc(db, 'settings', 'main'))).data()?.mission?.renames ?? {};
  const unitOf = (u) => renames[u] ?? u;
  // 한 batch 500칸 제한(문제당 2칸) → 넉넉히 200문제씩 나눠 쓴다
  for (let i = 0; i < list.length; i += 200) {
    const b = writeBatch(db);
    for (const q of list.slice(i, i + 200)) {
      b.set(doc(db, 'missionQuestions', q.id), {
        grade: q.grade ?? null, term: q.term ?? null, topic: q.topic ?? '',
        unit: unitOf(q.unit), difficulty: q.difficulty ?? 'normal',
        type: q.type, question: q.question ?? '', choices: q.choices ?? [],
      });
      b.set(doc(db, 'missionKeys', q.id), { unit: unitOf(q.unit), answers: q.answers });
    }
    await b.commit();
  }
  return list.length;
}

// 단원 이름 바꾸기: 문제·정답의 unit을 모두 바꾸고, 출제 단원 목록과 ‘바꾼 이름’ 기록도 고친다.
// 학생 채점 규칙이 정답의 unit이 출제 단원에 있는지 보므로, 새 이름을 먼저 출제 목록에 넣고 → 바꾸고 → 옛 이름을 뺀다.
async function renameUnit(oldName, newName, chosen) {
  const mainRef = doc(db, 'settings', 'main');
  const mission = (await getDoc(mainRef)).data()?.mission ?? {};
  if (chosen) await updateDoc(mainRef, { 'mission.units': arrayUnion(newName) });
  const [qs, ks] = await Promise.all([
    getDocs(query(collection(db, 'missionQuestions'), where('unit', '==', oldName))),
    getDocs(query(collection(db, 'missionKeys'), where('unit', '==', oldName))),
  ]);
  const refs = [...qs.docs, ...ks.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    for (const r of refs.slice(i, i + 400)) b.update(r, { unit: newName });
    await b.commit();
  }
  // 원래 이름 기록: A→B 다음 B→C면 A→C로
  const renames = { ...(mission.renames ?? {}) };
  const original = Object.keys(renames).find((k) => renames[k] === oldName) ?? oldName;
  renames[original] = newName;
  if (original === newName) delete renames[original];
  await updateDoc(mainRef, { 'mission.units': arrayRemove(oldName), 'mission.renames': renames });
  if (chosen) await updateDoc(mainRef, { 'mission.units': arrayUnion(newName) }); // 혹시 지워졌으면 다시
}

// 학년·학기 묶음 이름
const scopeKey = (u) => (u.grade ? `${u.grade}-${u.term ?? ''}` : '');
const scopeLabel = (k) => { if (!k) return '학년·학기 정보 없음'; const [g, t] = k.split('-'); return `${g}학년${t ? ` ${t}학기` : ''}`; };

export async function renderMission(root) {
  let scope = 'all'; // 보고 있는 학년·학기

  async function load() {
    const [qSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'missionQuestions')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byUnit = new Map();
    for (const q of questions) {
      const u = byUnit.get(q.unit) ?? { total: 0, basic: 0, normal: 0, challenge: 0, grade: q.grade ?? null, term: q.term ?? null };
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

    // 학년·학기 → 단원 순서(학년·학기 오름차순, 단원 이름 숫자순)
    const units = [...byUnit.keys()].sort((a, b) =>
      scopeKey(byUnit.get(a)).localeCompare(scopeKey(byUnit.get(b)), 'ko', { numeric: true }) || a.localeCompare(b, 'ko', { numeric: true }));
    const scopes = [...new Set(units.map((u) => scopeKey(byUnit.get(u))))];
    if (scope !== 'all' && !scopes.includes(scope)) scope = 'all';
    const total = [...byUnit.values()].reduce((n, c) => n + c.total, 0);
    const chosenNow = units.filter((u) => chosen.has(u)).length;
    const dirtyNote = h('span', { class: 'muted small' });

    // 체크 상태는 화면을 바꿔도 유지되게 따로 들고 있는다
    const picked = new Set(units.filter((u) => chosen.has(u)));
    function markDirty() {
      const changed = units.some((u) => picked.has(u) !== chosen.has(u));
      dirtyNote.textContent = changed ? '바뀐 내용이 있어요. 저장을 눌러 주세요.' : '';
    }

    function rename(unit) {
      const next = prompt(`‘${unit}’ 단원 이름을 무엇으로 바꿀까요?\n(문제와 정답, 출제 단원 목록이 함께 바뀌어요)`, unit)?.trim();
      if (!next || next === unit) return;
      if (next.length > 60) { toast('이름이 너무 길어요.', 'error'); return; }
      if (byUnit.has(next)) { toast('이미 있는 단원 이름이에요.', 'error'); return; }
      run(() => renameUnit(unit, next, chosen.has(unit)), `‘${next}’로 바꿨어요`);
    }

    const rowFor = (unit) => {
      const c = byUnit.get(unit);
      const cb = h('input', { type: 'checkbox', checked: picked.has(unit) });
      const row = h('div', { class: `unit-row${cb.checked ? ' on' : ''}` },
        h('label', { class: 'unit-pick' }, cb, h('span', { class: 'unit-name' }, unit)),
        h('span', { class: 'muted' }, `문제 ${c.total}개 (기초 ${c.basic} · 보통 ${c.normal} · 도전 ${c.challenge})`),
        h('button', { class: 'btn secondary tiny unit-rename', title: '단원 이름 바꾸기', onclick: () => rename(unit) }, '✏️ 이름'),
      );
      cb.addEventListener('change', () => { if (cb.checked) picked.add(unit); else picked.delete(unit); row.classList.toggle('on', cb.checked); markDirty(); });
      return row;
    };
    const unitsBox = h('div');
    function drawUnits() {
      const shown = scopes.filter((k) => scope === 'all' || k === scope);
      unitsBox.replaceChildren(...shown.map((k) => {
        const list = units.filter((u) => scopeKey(byUnit.get(u)) === k);
        const n = list.filter((u) => picked.has(u)).length;
        const setGroup = (on) => { for (const u of list) { if (on) picked.add(u); else picked.delete(u); } markDirty(); drawUnits(); };
        return h('div', { class: 'unit-group' },
          h('div', { class: 'unit-group-head' },
            h('b', null, scopeLabel(k)), h('span', { class: 'muted small' }, `${list.length}개 단원 중 ${n}개 고름`),
            h('button', { class: 'btn secondary tiny', onclick: () => setGroup(true) }, '이 학기 모두 고르기'),
            h('button', { class: 'btn secondary tiny', onclick: () => setGroup(false) }, '모두 끄기')),
          h('div', { class: 'units' }, ...list.map(rowFor)));
      }));
    }
    drawUnits();
    const scopeSel = h('select', { onchange: (e) => { scope = e.target.value; drawUnits(); } },
      h('option', { value: 'all', selected: scope === 'all' }, '모든 학년·학기'),
      ...scopes.map((k) => h('option', { value: k, selected: scope === k }, scopeLabel(k))));

    const saveUnits = h('button', { class: 'btn', disabled: byUnit.size === 0, onclick: () => {
      const list = units.filter((u) => picked.has(u));
      run(() => updateDoc(doc(db, 'settings', 'main'), { 'mission.units': list }),
        list.length ? `출제 단원 ${list.length}개를 저장했어요` : '출제 단원을 모두 껐어요');
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
            h('span', { class: 'muted small' }, '출제 범위'), scopeSel,
            h('span', { class: 'muted small' }, '— 학년·학기를 고르면 그 단원만 보여요. 단원 이름은 ✏️로 바꿀 수 있어요.')),
          unitsBox,
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
