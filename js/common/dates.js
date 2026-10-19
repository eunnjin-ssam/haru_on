// 날짜 문자열을 서버(한국 시간) 기준과 똑같이 만든다.
// 보안 규칙(firestore.rules)은 request.time + 9시간을 'YYYYMMDD'로 만들어 문서 id를 검사한다.
// 앱도 기기 시간대와 상관없이 같은 값을 만들어야 쓰기가 통과한다.

// 지금(또는 주어진 시각)의 한국 시간 Date
export function kstNow(now = new Date()) {
  // UTC 밀리초 + 9시간. getTime()은 시간대와 무관한 UTC 기준값이다.
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function ymd(d) {
  // getUTC* 를 써야 위에서 더한 9시간이 그대로 '한국 시간의 연·월·일'이 된다.
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 오늘 '20261017'
export function todayId(now = new Date()) {
  return ymd(kstNow(now));
}

// 이번 달 '202610'
export function monthId(now = new Date()) {
  const k = kstNow(now);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 이번 주 월요일 '20261013' (규칙과 동일하게 월요일 시작)
export function weekId(now = new Date()) {
  const k = kstNow(now);
  const dow = k.getUTCDay() === 0 ? 7 : k.getUTCDay(); // 월=1 … 일=7
  k.setUTCDate(k.getUTCDate() - (dow - 1));
  return ymd(k);
}

// ---- 날짜 id('YYYYMMDD') 계산 (반복 과제용) ----
const parseId = (id) => [Number(id.slice(0, 4)), Number(id.slice(4, 6)), Number(id.slice(6, 8))];
// id에서 n일 뒤(음수면 앞)의 id
export function addDaysId(id, n) {
  const [y, m, d] = parseId(id);
  return ymd(new Date(Date.UTC(y, m - 1, d + n)));
}
// 요일: 월=1 … 일=7
export function dowOfId(id) {
  const [y, m, d] = parseId(id);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
// 한국 시간 그 날짜 hh:mm 의 실제 Date
export function kstDate(id, hhmm = '00:00') {
  const [y, m, d] = parseId(id);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm));
}

// 두 날짜 id 사이의 날 수 (b - a)
export function daysBetweenIds(a, b) {
  const [y1, m1, d1] = parseId(a); const [y2, m2, d2] = parseId(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
// 마감 표시: 달력 날짜(한국 시간)로 센다. 오늘 마감 → D-day, 지났으면 'D+n 지남'
export function ddayLabel(dueAt) {
  if (!dueAt?.toMillis) return '';
  const ms = dueAt.toMillis();
  const diff = daysBetweenIds(todayId(), todayId(new Date(ms)));
  if (ms < Date.now()) return diff === 0 ? '오늘 마감 지남' : `D+${-diff} 지남`;
  return diff === 0 ? 'D-day' : `D-${diff}`;
}

// offset주 전(0=이번 주)의 { week: 월요일id, days: [월~금 날짜 5개] }
export function weekInfo(offset = 0, now = new Date()) {
  const k = kstNow(now);
  const dow = k.getUTCDay() === 0 ? 7 : k.getUTCDay();
  k.setUTCDate(k.getUTCDate() - (dow - 1) - offset * 7); // 대상 주 월요일 (offset주 전)
  const week = ymd(k);
  const days = [];
  for (let i = 0; i < 5; i++) { const d = new Date(k); d.setUTCDate(k.getUTCDate() + i); days.push(ymd(d)); }
  return { week, days };
}
