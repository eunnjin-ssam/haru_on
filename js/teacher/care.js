// 살핌판: 자기관리 현황 표 + 살펴볼 학생 + 쪽지/포인트(지급·지급취소·차감). 학생에게 보이지 않음.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { db } from '../common/firebase.js';
import { h, toast } from '../common/ui.js';
import { weekInfo } from '../common/dates.js';
import { MOODS } from '../student/mood.js';

const NEG = ['upset', 'angry', 'tired'];
const moodEmoji = (id) => (id === 'custom' ? '✏️' : MOODS.find((m) => m.id === id)?.emoji ?? '·');

export async function renderCare(root) {
  let data;
  const selected = new Set();

  async function load() {
    const this2 = weekInfo(0); const last = weekInfo(1);
    const recent = [...last.days, ...this2.days]; // 최근 2주 평일
    const [stuSnap, sumSnap, moodSnap, attSnap, subSnap, taskSnap, careSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'summaries')),
      getDocs(collection(db, 'moods')),
      getDocs(collection(db, 'missionAttempts')),
      getDocs(collection(db, 'submissions')),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'careNotes')),
      getDoc(doc(db, 'settings', 'teacher')),
    ]);
    const students = stuSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    const sums = new Map(sumSnap.docs.map((d) => [d.id, d.data()]));
    const care = new Map(careSnap.docs.map((d) => [d.id, d.data()]));
    const cfg = cfgSnap.data()?.care ?? {};

    // 기분(최근 2주, 학생별 날짜→mood)
    const moodBy = new Map();
    for (const d of moodSnap.docs) { const m = d.data(); if (!recent.includes(m.date)) continue; const mp = moodBy.get(m.sid) ?? {}; mp[m.date] = m.mood; moodBy.set(m.sid, mp); }
    // 기초미션(최근 2주): 참여일·정답
    const missBy = new Map();
    for (const d of attSnap.docs) { const a = d.data(); if (!recent.includes(a.date)) continue; const mp = missBy.get(a.sid) ?? { days: new Set(), graded: 0, correct: 0, perDayCount: {} }; if ('correct' in a) { mp.graded += 1; if (a.correct) mp.correct += 1; mp.perDayCount[a.date] = (mp.perDayCount[a.date] ?? 0) + 1; } missBy.set(a.sid, mp); }
    // 과제: 학생별 남은 과제
    const subs = new Map(subSnap.docs.map((d) => [d.id, d.data()]));
    const tasks = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.kind === 'homework');

    const rows = students.map((s) => {
      const mp = moodBy.get(s.sid) ?? {};
      const moodList = recent.map((dt) => mp[dt]).filter(Boolean);
      const recent5 = this2.days.map((dt) => mp[dt]).filter(Boolean);
      const neg = recent5.filter((m) => NEG.includes(m) || m === 'custom').length;
      const miss = missBy.get(s.sid) ?? { days: new Set(), graded: 0, correct: 0, perDayCount: {} };
      const perDay = 5;
      const partDays = Object.values(miss.perDayCount).filter((n) => n >= perDay).length;
      const rate = miss.graded ? Math.round((miss.correct / miss.graded) * 100) : null;
      const remaining = tasks.filter((t) => (t.targets ?? []).includes(s.sid) && !['done', 'exempt'].includes(subs.get(`${t.id}_${s.sid}`)?.status)).length;
      const activity = partDays / 10; // 최근 10평일 중 참여일 비율
      const todayMood = this2.days.map((dt) => mp[dt]).reverse().find(Boolean);

      const flags = [];
      if (neg >= (cfg.moodNegative ?? 3)) flags.push('마음이 힘들어 보여요');
      if (remaining >= (cfg.tasksLeft ?? 2)) flags.push(`남은 과제 ${remaining}개`);
      if (miss.graded > 0 && activity < (cfg.activityRate ?? 0.5)) flags.push('요즘 활동이 뜸해요');

      const cn = care.get(s.sid);
      const checkedRecently = cn?.checkedAt?.toMillis && (Date.now() - cn.checkedAt.toMillis()) < (cfg.recheckDays ?? 7) * 86400000;

      return { ...s, summary: sums.get(s.sid) ?? {}, partDays, rate, remaining, recentMoods: this2.days.map((dt) => mp[dt]), todayMood, flags, memo: cn?.memo ?? '', checkedRecently };
    });
    data = { rows };
  }

  async function run(task, done) {
    try { await task(); if (done) toast(done); } catch (e) { console.error(e); toast('안 됐어요.', 'error'); }
    await load(); draw();
  }

  async function sendMessage(body) {
    const b = writeBatch(db);
    for (const sid of selected) b.set(doc(collection(db, 'messages')), { to: sid, body, from: 'teacher', at: serverTimestamp(), readAt: null });
    await b.commit();
  }
  // kind: give(지급) / cancel(지급취소) / deduct(차감)
  async function givePoints(kind, amount, reason) {
    const b = writeBatch(db);
    for (const sid of selected) {
      const txId = `${kind}_${sid}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const wallet = kind === 'give' ? amount : -amount;
      const total = kind === 'give' ? amount : (kind === 'cancel' ? -amount : 0);
      b.set(doc(db, 'points', txId), { sid, type: kind, wallet, total, reason, ref: '', by: 'teacher', at: serverTimestamp() });
      b.update(doc(db, 'summaries', sid), { wallet: increment(wallet), total: increment(total), lastTx: txId });
    }
    await b.commit();
  }

  function careList() {
    const flagged = data.rows.filter((r) => r.flags.length && !r.checkedRecently);
    return h('section', { class: 'card' },
      h('h2', null, flagged.length ? `살펴볼 학생 (${flagged.length})` : '살펴볼 학생'),
      h('p', { class: 'muted small', style: 'margin:-2px 0 4px' }, '기분·과제·활동을 보고 살펴보면 좋을 학생을 모았어요. 이 화면은 학생에게 보이지 않아요.'),
      flagged.length === 0
        ? h('p', { class: 'empty-ok' }, '✅ 지금은 특별히 살펴볼 학생이 없어요.')
        : h('div', { class: 'care-cards' }, ...flagged.map((r) => h('div', { class: 'care-alert' },
          h('div', { class: 'ca-head' },
            h('b', null, `${r.number}번 ${r.name}`),
            h('div', { class: 'ca-flags' }, ...r.flags.map((f) => h('span', { class: 'ca-flag' }, f)))),
          h('div', { class: 'row' },
            h('input', { type: 'text', value: r.memo, placeholder: '메모', style: 'flex:1', onchange: (e) => run(() => setDoc(doc(db, 'careNotes', r.sid), { memo: e.target.value }, { merge: true })) }),
            h('button', { class: 'btn secondary small', onclick: () => run(() => setDoc(doc(db, 'careNotes', r.sid), { checkedAt: serverTimestamp() }, { merge: true }), '살펴봤어요') }, '살펴봤어요'))))),
    );
  }

  function toolbar() {
    if (selected.size === 0) return null;
    const msg = h('input', { type: 'text', placeholder: '쪽지 내용', style: 'flex:1' });
    const amt = h('input', { type: 'number', min: '1', value: '5', style: 'width:70px' });
    const reason = h('input', { type: 'text', placeholder: '사유(필수)', style: 'flex:1' });
    const needReason = () => { if (!reason.value.trim()) { toast('사유를 써 주세요.', 'error'); return false; } return true; };
    const amount = () => Math.max(1, Number(amt.value) || 0);
    return h('section', { class: 'card care-toolbar' },
      h('h3', null, `${selected.size}명 선택됨`),
      h('div', { class: 'row' }, msg, h('button', { class: 'btn', onclick: () => { if (!msg.value.trim()) { toast('쪽지 내용을 써 주세요.', 'error'); return; } run(() => sendMessage(msg.value.trim()), '쪽지를 보냈어요'); } }, '쪽지 보내기')),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, '포인트'), amt, reason,
        h('button', { class: 'btn small', onclick: () => { if (needReason()) run(() => givePoints('give', amount(), reason.value.trim()), '지급했어요'); } }, '지급'),
        h('button', { class: 'btn secondary small', onclick: () => { if (needReason()) run(() => givePoints('cancel', amount(), reason.value.trim()), '지급 취소했어요'); } }, '지급 취소'),
        h('button', { class: 'btn danger small', onclick: () => { if (needReason()) run(() => givePoints('deduct', amount(), reason.value.trim()), '차감했어요'); } }, '차감')),
    );
  }

  function table() {
    const head = h('tr', null, h('th', null, ''), h('th', null, '번호'), h('th', null, '이름'), h('th', null, '기초미션'), h('th', null, '정답률'), h('th', null, '최근 기분'), h('th', null, '지갑'), h('th', null, '누적'));
    return h('section', { class: 'card' }, h('h2', null, '자기관리 현황'),
      h('p', { class: 'muted small', style: 'margin:-2px 0 10px' }, '최근 2주 기초미션 참여·정답률·기분·포인트를 한눈에 봐요.'),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, head),
        h('tbody', null, ...data.rows.map((r) => h('tr', { class: r.flags.length ? 'flagged' : '' },
          h('td', null, h('input', { type: 'checkbox', checked: selected.has(r.sid), onchange: (e) => { if (e.target.checked) selected.add(r.sid); else selected.delete(r.sid); draw(); } })),
          h('td', { class: 'num' }, r.number), h('td', null, r.name),
          h('td', null, `${r.partDays}/10일`), h('td', null, r.rate == null ? '-' : `${r.rate}%`),
          h('td', null, r.recentMoods.map((m) => (m ? moodEmoji(m) : '·')).join(' ')),
          h('td', { class: 'num' }, r.summary.wallet ?? 0), h('td', { class: 'num' }, r.summary.total ?? 0))))),
      ),
      h('p', { class: 'muted small' }, '체크해서 여러 명에게 한 번에 쪽지·포인트를 줄 수 있어요. 살핌판은 학생에게 보이지 않아요.'),
    );
  }

  function draw() { root.replaceChildren(...[careList(), toolbar(), table()].filter(Boolean)); }

  await load();
  draw();
}
