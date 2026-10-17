// 기초미션: 하루 perDay문제. 학생마다 무작위 출제, 재시도 없음, 맞힌 개수만큼 1점씩.
// 문제 내용은 missionQuestions(정답 없음)에서 읽고, 정답 대조는 서버(규칙)가 missionKeys로 한다.
// 채점: '정답이라 가정'하고 포인트까지 한 묶음으로 써 본다 → 거부되면 오답이라 포인트 없이 채점만.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { todayId } from '../common/dates.js';

// 오늘 푼 문제들 (index 0 = 1번). 없으면 null, 채점 전이면 correct 없음
async function loadAttempts(sid, perDay) {
  const snaps = await Promise.all(
    Array.from({ length: perDay }, (_, i) =>
      getDoc(doc(db, 'missionAttempts', `${sid}_${todayId()}_${i + 1}`)).catch(() => null)),
  );
  return snaps.map((s, i) => (s?.exists() ? { n: i + 1, ...s.data() } : null));
}

async function loadQuestions(units) {
  const snap = await getDocs(collection(db, 'missionQuestions'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((q) => units.includes(q.unit));
}

// 다음 문제 고르기: 1번은 보통, 직전에 틀렸으면 기초, 맞았으면 보통. 이미 푼 문제는 제외.
function pickQuestion(questions, attempts, n) {
  const usedQids = new Set(attempts.filter(Boolean).map((a) => a.qid));
  const prev = attempts[n - 2]; // 직전 문제 (n은 1부터)
  const wantBasic = prev && prev.correct === false;
  const pool = questions.filter((q) => !usedQids.has(q.id));
  if (pool.length === 0) return null;
  const want = n === 1 ? 'normal' : (wantBasic ? 'basic' : 'normal');
  const preferred = pool.filter((q) => q.difficulty === want);
  const from = preferred.length ? preferred : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export async function renderMission(root, student, settings, onBack) {
  const sid = student.sid;
  const perDay = settings.mission.perDay;
  const units = settings.mission.units ?? [];
  const reward = settings.points.mission;

  let questions = [];
  let attempts = [];

  async function reload() {
    [questions, attempts] = await Promise.all([loadQuestions(units), loadAttempts(sid, perDay)]);
  }

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
    const q = pickQuestion(questions, attempts, n);
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

  await reload();
  if (units.length === 0 || questions.length === 0) {
    shell(h('p', { class: 'banner' }, '아직 기초미션이 준비되지 않았어요. 선생님이 단원과 문제를 준비하면 열려요.'));
    return;
  }
  showNext();
}
