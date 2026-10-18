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

// offset주 전(0=이번 주)의 { week: 월요일id, days: [월~금 날짜 5개] }
export function weekInfo(offset = 0, now = new Date()) {
  const k = kstNow(now);
  const dow = k.getUTCDay() === 0 ? 7 : k.getUTCDay();
  k.setUTCDate(k.getUTCDate() - (dow - 1) + offset * 7); // 대상 주 월요일
  const week = ymd(k);
  const days = [];
  for (let i = 0; i < 5; i++) { const d = new Date(k); d.setUTCDate(k.getUTCDate() + i); days.push(ymd(d)); }
  return { week, days };
}
