// 기초미션: 하루 perDay문제. 학생마다 무작위 출제, 재시도 없음, 맞힌 개수만큼 1점씩.
// 문제 내용은 missionQuestions(정답 없음)에서 읽고, 정답 대조는 서버(규칙)가 missionKeys로 한다.
// 채점: '정답이라 가정'하고 포인트까지 한 묶음으로 써 본다 → 거부되면 오답이라 포인트 없이 채점만.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, increment, serverTimestamp, query, where,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId, addDaysId } from '../common/dates.js';

// 오늘 푼 문제들 (index 0 = 1번). 없으면 null, 채점 전이면 correct 없음
async function loadAttempts(sid, perDay) {
  const snaps = await Promise.all(
    Array.from({ length: perDay }, (_, i) =>
      getDoc(doc(db, 'missionAttempts', `${sid}_${todayId()}_${i + 1}`)).catch(() => null)),
  );
  return snaps.map((s, i) => (s?.exists() ? { n: i + 1, ...s.data() } : null));
}

// 고른 단원 문제만 읽는다(단원이 30개 이하면 'in' 한 번, 넘으면 30개씩). 문제은행 전체를 읽지 않게.
// 문제 내용은 거의 안 바뀌니, 같은 단원 묶음은 이 컴퓨터에 저장해 두고 다시 안 읽는다.
// (선생님이 단원을 바꾸면 묶음이 달라져 새로 읽는다. 문제은행을 다시 가져와 내용을 바꿨다면 그 기기에서 저장소를 지워야 새로 읽힌다.)
async function loadQuestions(units) {
  if (!units.length) return [];
  const key = `missQ:${units.slice().sort().join(',')}`;
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch { /* 저장소를 못 쓰면 읽는다 */ }
  const chunks = [];
  for (let i = 0; i < units.length; i += 30) chunks.push(units.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map((c) => getDocs(query(collection(db, 'missionQuestions'), where('unit', 'in', c)))));
  const questions = snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  try { localStorage.setItem(key, JSON.stringify(questions)); } catch { /* 너무 크면 저장 안 하고 넘어간다 */ }
  return questions;
}

// 최근 2주 정답률(채점된 문제가 LOW_MIN개 이상일 때만). 계속 낮으면 그날 첫 문제를 기초로 낸다.
// 예전엔 그 학생의 기초미션 기록을 전부 읽어 학기가 쌓일수록 커졌다. 지난날 기록은 다시 바뀌지 않으니
// 날짜별 '푼 수·맞힌 수'만 이 컴퓨터에 저장하고, 처음 보는 날만 그날 풀이(최대 perDay건)를 읽는다.
const LOW_MIN = 10; const LOW_RATE = 0.5;
const DAY_KEY = (sid, d) => `missDay:${sid}:${d}`;
async function loadRecentLow(sid, perDay) {
  try {
    const today = todayId();
    const days = Array.from({ length: 14 }, (_, i) => addDaysId(today, -(i + 1))); // 어제 ~ 14일 전
    const counts = new Map(); const need = [];
    for (const d of days) {
      try { const v = localStorage.getItem(DAY_KEY(sid, d)); if (v) { counts.set(d, JSON.parse(v)); continue; } } catch { /* 저장소를 못 쓰면 읽는다 */ }
      need.push(d);
    }
    for (const d of need) {
      const snaps = await Promise.all(Array.from({ length: perDay }, (_, i) => getDoc(doc(db, 'missionAttempts', `${sid}_${d}_${i + 1}`)).catch(() => null)));
      let n = 0; let ok = 0;
      for (const s of snaps) { if (s?.exists()) { const a = s.data(); if ('correct' in a) { n += 1; if (a.correct) ok += 1; } } }
      const v = { n, ok }; counts.set(d, v);
      try { localStorage.setItem(DAY_KEY(sid, d), JSON.stringify(v)); } catch { /* 다음에 다시 읽으면 된다 */ }
    }
    let graded = 0; let correct = 0;
    for (const v of counts.values()) { graded += v.n; correct += v.ok; }
    if (graded < LOW_MIN) return false;
    return correct / graded < LOW_RATE;
  } catch { return false; }
}

const STEP_UP = { basic: 'normal', normal: 'challenge', challenge: 'challenge' };
// 다음 문제 고르기. 이미 푼 문제는 제외.
// 1번: 보통(최근 정답률이 계속 낮으면 기초) / 직전에 맞았으면 한 단계 위(기초→보통→도전) / 틀렸으면 같은 단원 기초
function pickQuestion(questions, attempts, n, startBasic) {
  const usedQids = new Set(attempts.filter(Boolean).map((a) => a.qid));
  const pool = questions.filter((q) => !usedQids.has(q.id));
  if (pool.length === 0) return null;
  const prev = attempts[n - 2]; // 직전 문제 (n은 1부터)
  const prevQ = prev && questions.find((q) => q.id === prev.qid);
  let want = startBasic ? 'basic' : 'normal';
  let unit = null;
  if (prev && prev.correct === false) { want = 'basic'; unit = prevQ?.unit ?? null; }
  else if (prev && prev.correct === true) want = STEP_UP[prevQ?.difficulty] ?? 'normal';
  const tries = [
    (q) => q.difficulty === want && (!unit || q.unit === unit),
    (q) => q.difficulty === want,
    (q) => !unit || q.unit === unit,
    () => true,
  ];
  for (const ok of tries) {
    const from = pool.filter(ok);
    if (from.length) return from[Math.floor(Math.random() * from.length)];
  }
  return null;
}

export async function renderMission(root, student, settings, onBack) {
  const sid = student.sid;
  const perDay = settings.mission.perDay;
  const units = settings.mission.units ?? [];
  const reward = settings.points.mission;

  let questions = [];
  let attempts = [];
  let startBasic = false;

  // 문제·최근 정답률은 이 화면을 열 때 한 번만 읽고, 문제를 풀 때마다는 오늘 푼 기록만 다시 읽는다
  // (예전엔 1문제마다 문제은행 전체와 지금까지 푼 기록 전체를 다시 읽어 읽기 한도를 금방 넘었다)
  async function loadAll() {
    [questions, attempts, startBasic] = await Promise.all([loadQuestions(units), loadAttempts(sid, perDay), loadRecentLow(sid, perDay)]);
  }
  async function reload() { attempts = await loadAttempts(sid, perDay); }

  // 정답이라 가정하고 포인트까지 한 묶음으로 시도. 거부되면 오답 처리. 맞았으면 true.
  async function grade(a) {
    const attemptId = `${sid}_${todayId()}_${a.n}`;
    const txId = `mission_${attemptId}`;
    try {
      const b = writeBatch(db);
      b.update(doc(db, 'missionAttempts', attemptId), { correct: true });
      b.set(doc(db, 'points', txId), {
        sid, type: 'mission', wallet: reward, total: reward,
        reason: '기초미션', ref: attemptId, by: sid, at: serverTimestamp(),
      });
      const sumChange = { wallet: increment(reward), total: increment(reward), lastTx: txId };
      if (a.n === perDay) sumChange.missionDays = increment(1);
      b.update(doc(db, 'summaries', sid), sumChange);
      await b.commit();
      return true;
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
      // 오답: 포인트 없이 채점만. 마지막 문제면 참여일만 올린다.
      if (a.n === perDay) {
        const b = writeBatch(db);
        b.update(doc(db, 'missionAttempts', attemptId), { correct: false });
        b.update(doc(db, 'summaries', sid), { missionDays: increment(1) });
        await b.commit();
      } else {
        await updateDoc(doc(db, 'missionAttempts', attemptId), { correct: false });
      }
      return false;
    }
  }

  async function submit(n, qid, answer) {
    const attemptId = `${sid}_${todayId()}_${n}`;
    await setDoc(doc(db, 'missionAttempts', attemptId), {
      sid, date: todayId(), n, qid, answer, at: serverTimestamp(),
    });
    const correct = await grade({ n, qid, answer });
    await reload();
    showResult(n, correct);
  }

  // ---- 화면 ----
  function shell(...children) {
    root.replaceChildren(h('section', { class: 'mission' },
      h('header', null,
        h('button', { class: 'back', onclick: onBack }, '← 대시보드'),
        h('span', { class: 'who' }, `${student.number}번 ${student.name}`),
      ),
      ...children,
    ));
  }

  function progressBar() {
    const graded = attempts.filter((a) => a && 'correct' in a).length;
    const got = attempts.filter((a) => a?.correct === true).length;
    return h('div', { class: 'mission-top' },
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${(graded / perDay) * 100}%` })),
      h('p', { class: 'muted' }, `${perDay}문제 중 ${graded}문제 풀었어요 · 지금까지 ${got}점`),
    );
  }

  function showResult(n, correct) {
    const last = n === perDay;
    shell(
      progressBar(),
      h('div', { class: `result ${correct ? 'ok' : 'no'}` },
        h('div', { class: 'big' }, correct ? '정답! 🎉' : '아쉬워요'),
        h('p', null, correct ? `+${reward}점` : '다음 문제는 조금 쉬워요'),
      ),
      last
        ? h('button', { class: 'btn', onclick: () => showDone() }, '다 풀었어요! 결과 보기')
        : h('button', { class: 'btn', onclick: () => showNext() }, '다음 문제'),
    );
  }

  function showDone() {
    const got = attempts.filter((a) => a?.correct === true).length;
    shell(
      progressBar(),
      h('div', { class: 'result ok' },
        h('div', { class: 'big' }, '오늘 기초미션 끝! 🌟'),
        h('p', null, `${perDay}문제 중 ${got}문제 맞혀서 ${got}점을 모았어요.`),
        h('p', { class: 'muted' }, '참여일 1일을 채웠어요.'),
      ),
      h('button', { class: 'btn', onclick: onBack }, '대시보드로'),
    );
  }

  function showQuestion(n) {
    const q = pickQuestion(questions, attempts, n, startBasic);
    if (!q) {
      shell(progressBar(), h('p', { class: 'banner' }, '낼 수 있는 문제가 더 없어요. 선생님께 알려 주세요.'));
      return;
    }

    let chosen = null;
    const body = h('div', { class: 'q-answer' });

    function draw() {
      if (q.type === 'choice') {
        body.replaceChildren(h('div', { class: 'choices' }, ...q.choices.map((c) => h('button', {
          type: 'button',
          class: `choice${chosen === c ? ' on' : ''}`,
          onclick: () => { chosen = c; draw(); },
        }, c))));
      } else {
        body.replaceChildren(h('input', {
          class: 'num', type: 'text', inputmode: 'decimal', value: chosen ?? '',
          placeholder: '답을 입력하세요',
          oninput: (e) => { chosen = e.target.value; },
        }));
      }
    }
    draw();

    const go = h('button', { class: 'btn', onclick: async () => {
      const answer = (chosen ?? '').toString().trim();
      if (!answer) { toast('답을 골라 주세요', 'error'); return; }
      go.disabled = true;
      try {
        await submit(n, q.id, answer);
      } catch (e) {
        console.error(e);
        toast('보내지 못했어요. 다시 해 주세요.', 'error');
        go.disabled = false;
      }
    } }, '제출');

    shell(
      progressBar(),
      h('div', { class: 'q-card' },
        h('div', { class: 'q-no' }, `${n}번 문제`),
        h('p', { class: 'q-text' }, q.question),
        body,
      ),
      go,
    );
  }

  // 다음에 할 일 결정: 채점 안 된 문제가 있으면 먼저 채점(이어 풀기), 다 풀었으면 결과, 아니면 다음 문제.
  function showNext() {
    const pending = attempts.find((a) => a && !('correct' in a));
    if (pending) { resumePending(pending); return; }
    const graded = attempts.filter((a) => a && 'correct' in a).length;
    if (graded >= perDay) { showDone(); return; }
    showQuestion(graded + 1);
  }

  async function resumePending(a) {
    const correct = await grade(a);
    await reload();
    showResult(a.n, correct);
  }

  await loadAll();
  if (units.length === 0 || questions.length === 0) {
    shell(h('p', { class: 'banner' }, '아직 기초미션이 준비되지 않았어요. 선생님이 단원과 문제를 준비하면 열려요.'));
    return;
  }
  showNext();
}
