import { todayId } from './dates.js';

// 반복 과제는 미리 만들어 두고 showAt부터 보여 준다. showAt이 없으면(보통 과제) 늘 보인다.
export const isShown = (task, now = Date.now()) => !task.showAt?.toMillis || task.showAt.toMillis() <= now;

// 과제가 학생에게 처음 올라온 날('YYYYMMDD'): 보통 과제는 만든 날(postDay), 반복 과제는 보이기 시작한 날(showAt).
// 예전에 만든 보통 과제는 기록이 없어 null.
export const postDayOf = (t) => t.postDay ?? (t.showAt?.toDate ? todayId(t.showAt.toDate()) : null);
// 과제가 올라온 날 결석한 학생은 그 과제를 안 내도 된다(체크판 칸 비활성화, 남은 과제에서 뺌).
// absentOn: Map(날짜 → Set(학생))
export const excusedFor = (t, sid, absentOn) => { const d = postDayOf(t); return !!(d && absentOn?.get(d)?.has(sid)); };

// 반복 과제는 학생 자율: 마감이 지나도록 안 냈으면(다시 해오기를 받고 안 낸 것 포함) 그걸로 끝 — 남은 과제·할 일에서 뺀다.
// 마감 전에 내서 선생님 확인을 기다리는 것은 끝난 게 아니다(늦게라도 확인해 포인트를 줄 수 있게).
// sub: 이 학생의 제출 기록 또는 그 상태 문자열(없으면 undefined)
export const isExpiredRepeat = (t, sub, now = Date.now()) => {
  const status = typeof sub === 'string' ? sub : sub?.status;
  return !!(t.repeat && (!status || status === 'redo') && t.dueAt?.toMillis && t.dueAt.toMillis() < now);
};
