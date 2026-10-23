// 학생 화면 잠금: 선생님이 정한 쉬는시간(월~금 같은 시간표)에만 열고, 선생님이 그날 직접 열거나 잠글 수 있다.
// settings/main.access = {
//   enabled: 시간표를 쓰는지(false면 늘 열림 — 선생님 직접 잠금은 그래도 됨),
//   windows: [{ start: 'HH:MM', end: 'HH:MM' }] 쉬는시간(월~금 공통),
//   override: null | { mode: 'open' | 'locked', day: 'YYYYMMDD', until?: 'HH:MM' }  선생님이 직접 열기·잠그기
//     - 지금 잠그기: 지금 쉬는시간이 끝날 때까지(until)만, 그 뒤엔 시간표대로
//     - 지금 열기: 다음 쉬는시간이 시작될 때까지(until)만, 그 뒤엔 시간표대로(남은 쉬는시간이 없으면 그날 끝까지)
//     - until이 없으면 그날 끝까지. 다음 날엔 늘 시간표대로
// }
// 방과 후·주말은 잠김. 시각은 한국 시간(기기 시계 기준).
import { kstNow, todayId } from './dates.js';

const mins = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export const sortWindows = (ws) => (ws ?? []).filter((w) => w?.start && w?.end && mins(w.start) < mins(w.end))
  .sort((a, b) => mins(a.start) - mins(b.start));

// 반환: { locked, reason, until?, next? }
//  reason: 'off'(시간표 안 씀) | 'open'(선생님이 엶) | 'lock'(선생님이 잠금) | 'break'(쉬는시간) | 'class'(쉬는시간 아님)
export function accessState(access, now = new Date()) {
  const a = access ?? {};
  const today = todayId(now);
  const k = kstNow(now); const dow = k.getUTCDay(); const cur = k.getUTCHours() * 60 + k.getUTCMinutes();
  const ov = a.override;
  if (ov?.day === today && (!ov.until || cur < mins(ov.until))) {
    if (ov.mode === 'open') return { locked: false, reason: 'open', until: ov.until ?? null };
    // 잠근 쉬는시간이 끝난 뒤 다음에 열리는 때
    if (ov.mode === 'locked') return { locked: true, reason: 'lock', until: ov.until ?? null, next: nextOpen(a, ov.until ? new Date(now.getTime() + (mins(ov.until) - cur) * 60000) : now) };
  }
  if (!a.enabled) return { locked: false, reason: 'off' };
  const ws = sortWindows(a.windows);
  if (dow >= 1 && dow <= 5) {
    const w = ws.find((x) => mins(x.start) <= cur && cur < mins(x.end));
    if (w) return { locked: false, reason: 'break', until: w.end };
  }
  return { locked: true, reason: 'class', next: nextOpen(a, now) };
}

// 다음에 열리는 때: '10:30' / '내일 9:40' / '월요일 9:40' (시간표가 없으면 null)
export function nextOpen(access, now = new Date()) {
  const ws = sortWindows(access?.windows);
  if (!access?.enabled || !ws.length) return null;
  const k = kstNow(now); const dow = k.getUTCDay(); const cur = k.getUTCHours() * 60 + k.getUTCMinutes();
  const later = (dow >= 1 && dow <= 5) ? ws.find((x) => mins(x.start) > cur) : null;
  if (later) return later.start;
  const nd = dow === 5 ? 1 : dow === 6 ? 1 : (dow + 1) % 7; // 금·토 → 월요일
  const label = (dow >= 0 && dow <= 4) ? '내일' : `${WEEK[nd]}요일`;
  return `${label} ${ws[0].start}`;
}

// 선생님이 누른 버튼 → 저장할 override (null이면 시간표대로)
export function overrideFor(mode, access, now = new Date()) {
  if (!mode) return null;
  const a = access ?? {};
  const day = todayId(now);
  if (!a.enabled) return mode === 'locked' ? { mode, day } : null; // 시간표를 안 쓰면: 잠그기는 그날 끝까지, 열기는 원래 열림
  const k = kstNow(now); const dow = k.getUTCDay(); const cur = k.getUTCHours() * 60 + k.getUTCMinutes();
  const ws = (dow >= 1 && dow <= 5) ? sortWindows(a.windows) : [];
  if (mode === 'locked') {
    const w = ws.find((x) => mins(x.start) <= cur && cur < mins(x.end));
    return w ? { mode, day, until: w.end } : null; // 쉬는시간이 아니면 시간표가 이미 잠가요
  }
  const nextBreak = ws.find((x) => mins(x.start) > cur);
  return nextBreak ? { mode, day, until: nextBreak.start } : { mode, day }; // 남은 쉬는시간이 없으면 그날 끝까지
}
