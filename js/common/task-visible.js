// 반복 과제는 미리 만들어 두고 showAt부터 보여 준다. showAt이 없으면(보통 과제) 늘 보인다.
export const isShown = (task, now = Date.now()) => !task.showAt?.toMillis || task.showAt.toMillis() <= now;
