// 읽은 결과를 잠깐 기억해 두는 곳(같은 화면 안에서만, 새로고침하면 사라짐).
// 학생·선생님 화면은 메뉴를 오갈 때마다 같은 컬렉션을 처음부터 다시 읽어서 Firestore 무료 한도
// (하루 읽기 5만)를 넘었다. 자주 안 바뀌는 것은 정한 시간 동안 다시 쓰고, 내가 바꾼 뒤에는 forget으로 지운다.
const store = new Map(); // key → { at, value(Promise) }

export const MIN = 60 * 1000;

// key로 기억한 값이 ttl 안이면 그대로, 아니면 load()를 불러 새로 기억한다. fresh면 늘 새로.
export function cached(key, load, ttl, { fresh = false } = {}) {
  const c = store.get(key);
  if (!fresh && c && Date.now() - c.at < ttl) return c.value;
  const value = load();
  store.set(key, { at: Date.now(), value });
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); }); // 실패한 건 기억하지 않음
  return value;
}

// key가 prefix로 시작하는 기억을 지운다(다음에 새로 읽게)
export function forget(...prefixes) {
  for (const k of [...store.keys()]) if (prefixes.some((p) => k.startsWith(p))) store.delete(k);
}
