# Firestore 데이터 구조

1단계에서 정한 구조. 보안 규칙은 `/firestore.rules`. 새 컬렉션을 만들면 이 문서와 규칙을 함께 고친다.

표기: `학생` = 학생ID, `날짜` = KST `20261016`, `주` = 그 주 월요일 날짜, `월` = `202610`. 🔒 = 교사 전용.
날짜는 모두 서버 시간(request.time + 9시간)으로 규칙이 검사하므로, 앱은 같은 방식으로 계산한 값을 넣어야 한다.

## 컬렉션

| 컬렉션 | 문서 id | 필드 |
|---|---|---|
| teachers 🔒 | 교사 uid | (콘솔에서 직접 추가) |
| students | 학생ID | number, name, active |
| numbers | 번호 `'7'` | sid (로그인 전 조회용, 한 장씩만 읽기) |
| studentPins 🔒 | 번호 `'7'` | pin(4자리 문자열), sid, prev(학생이 직접 바꿀 때 넣은 이전 PIN — 규칙이 지금 PIN과 대조) |
| sessions | 익명 uid | number, sid, pin, at |
| settings | `main` / `teacher`🔒 | `js/common/defaults.js` 참고 (main.mission.renames: 바꾼 단원 이름 {원래: 새 이름}, main.writingMin: 글마당 최소 글자 수 {summary, thoughts}) |
| notices | 자동 | title, body, start, end |
| notices/{id}/reads | 학생 | at |
| messages | 자동 | to(학생), body, from, at, readAt(처음엔 null) |
| feedback | 학생_날짜_1~3 | sid, kind(bug/idea), menu, category, body, device, status, at |
| points | 아래 '거래 id' | sid, type, wallet, total, reason, ref, by, at |
| summaries | 학생 | wallet, total, lastTx, reading, missionDays, roleDays |
| moods | 학생_날짜 | sid, date, mood(excited/good/okay/upset/angry/tired/custom), at |
| moodNotes | 학생_날짜 | sid, date, text, at (본인·교사만) |
| attendance 🔒 | 날짜 | absent: [학생], noSchool(true면 반 전체 쉬는 날 — 공휴일·재량휴업일, 계산에서 그날을 뺌) (1인1역 오늘 탭에서 표시, 1인1역 완료율·살핌판 계산에서 그날을 뺌) |
| missionKeys 🔒 | 문제 id | unit, answers: [정답 문자열] |
| missionQuestions | 문제 id | grade, term, topic, unit, difficulty(basic/normal/challenge), type(choice/number), question, choices: [보기] (정답 없음, 학생 읽기 가능) |
| missionAttempts | 학생_날짜_1~5 | sid, date, n, qid, answer, at, correct(채점 후) |
| roles | 자동 | name, desc, members: [학생], checker, points |
| roleChecks | 날짜_역할_학생 | sid, role, date, status(requested/approved/redo), by, at, reqAt(요청 시각, 확인 담당 처리 속도용) |
| roleTerms | 자동 | start, end('YYYYMMDD'), wishOpen, status(wish/assigned/confirmed/applied), plan{학생:역할}, ranks{학생:0~3지망}, checkers{역할:학생}, prev(적용 전 역할 기록), appliedAt. 시작일에 선생님 화면을 열면 확정 기간을 roles에 반영 |
| roleWishes | 기간_학생 | sid, term, picks: [역할 1~3개], at |
| posts | 학생_날짜 | author, readDate, title, summary, thoughts, status(public/reported/hidden/deleted), likes, editedByTeacher, at |
| posts/{id}/likes | 학생 | at |
| writingWeeks | 학생_주 | sid, week, days: [날짜] |
| drafts | 학생 | readDate, title, summary, thoughts, at |
| reports 🔒 | post_글id_신고자 / comment_댓글id_신고자 | kind, target, story, reporter, reason(tease/swear/etc), at |
| stories | 자동 | mode(named/anon), author(named일 때만), wish, reason, when, what, feeling, likes, stage(story/agenda/promise/hold), hidden, at (+교사: decided, mergedInto, confirmedAt·reviewAt(약속 확정일·점검일 'YYYYMMDD')) |
| stories/{id}/likes | 학생 | at |
| stories/{id}/comments | 자동 | author, text, kind(idea/opinion), status(public/reported/hidden), at |
| storyAuthors 🔒 | 이야기 id | sid, at (본인은 자기 것 읽기 가능) |
| privateStories | 자동 | author, wish, reason, when, what, feeling, at, (+교사: seenAt = 선생님이 본 때) (본인·교사만) |
| storyNotes 🔒 | privateStories id | memo, at (상담 메모) |
| promises | (안 씀) | 약속은 stories의 stage=promise·decided·confirmedAt·reviewAt로 관리한다 |
| tasks | 자동 / 반복은 `규칙id_날짜` | kind(homework/check), title, desc, subject, dueAt, submitType(check/text), points, targets: [학생], notify, repeatWeekly, (반복이면) repeat, showAt(이때부터 학생에게 보임) |
| taskRepeats 🔒 | 자동 | 반복 규칙: kind, title, desc, subject, submitType, points, targets, notify, mode(daily/days), days[1=월…7=일], dueTime('HH:MM'), leadDays, startDate, endDate, skip[날짜], active, createdAt. 선생님 화면을 열 때 오늘부터 2주치 tasks를 미리 만든다 |
| submissions | 과제_학생 | task, sid, status(submitted/done/redo/exempt), text, firstAt, lastAt (+교사: comment) |
| shopItems | 자동 | name, desc, price, instant, buyLimit(0=무제한), buyPeriod(week/month/none), dailyUse(0=무제한), onSale, order |
| coupons | 학생_쿠폰_기간_번호 | sid, coupon, period, n, status(pending/owned/useRequested/used/rejected), price, use, at |
| couponUses | 쿠폰_날짜_1~한도 / u_쿠폰id | sid, coupon, type, date, n, task, status, at |
| couponIdeas | 학생_주_1~2 | sid, week, n, what, price, why, at |
| goals | 자동 | title, target, reward, raised, donors, status(open/done/closed), lastTx |
| goals/{id}/donors 🔒 | 학생 | total (본인은 자기 것 읽기 가능) |
| items | 아이템 id | category(hair/face/top/bottom/shoes/headAcc/faceAcc), name, prices: {색: 가격}, onSale, starter |
| ownedItems | 학생_아이템_색 / 학생_아이템_free | sid, item, category, color, at |
| profiles | 학생 | equip: {칸: {owned, item, color} 또는 null}, title, awarded: [칭호 이름] |
| careNotes 🔒 | 학생 | 살핌판 메모, checkedAt |

업적 칭호는 저장하지 않는다. summaries의 횟수와 settings.titles 기준으로 계산한다.
칭호 id: `reading_0`~`reading_4`, `mission_0`~`4`, `role_0`~`4`, 선생님 수여는 `award_번호`(awarded 목록 위치).

## 포인트 쓰기 방법

학생 쪽 포인트는 **거래 1줄 + summaries 변경을 하나의 batch**로 쓴다.
summaries는 `increment()`로 바꾸고 `lastTx`에 거래 id를 넣는다. 다른 학생의 요약은 읽을 수 없으므로 꼭 increment를 쓴다.

| type | 거래 id | 같은 batch에 들어가야 하는 것 |
|---|---|---|
| mission | `mission_학생_날짜_n` | missionAttempts 채점(correct: true) |
| writing | `writing_학생_날짜` | posts 새 글, summaries.reading +1 |
| writingBonus | `writingBonus_학생_주` | (writingWeeks.days가 기준 이상이어야 함) |
| role | `role_날짜_역할_학생` | roleChecks requested→approved (확인 담당이 씀), summaries.roleDays +1 |
| buy | `buy_쿠폰문서id` | coupons 새 문서 |
| item | `item_학생_아이템_색` | ownedItems 새 문서 |
| donate | `donate_자동id` | goals.raised·donors·lastTx, goals/{id}/donors/{학생}.total |

교사 쪽(과제 포인트, 지급, 지급 취소, 차감, 환불, 글 삭제 회수)은 규칙이 금액을 검사하지 않는다. 교사 화면 코드가 거래와 요약을 같은 batch로 맞춰 써야 한다.
- 과제: `task_과제_학생`, 지급 취소: wallet·total 모두 감소, 차감: wallet만 감소, 환불: wallet만 증가.

## 기초미션 순서

문제 지문·보기는 `missionQuestions`(정답 없음, 학생 읽기 가능)에서 읽고, 정답은 `missionKeys`(교사 전용)에만 둔다. 둘은 같은 문제 id로 연결된다. 선생님이 문제은행을 가져올 때 두 컬렉션을 함께 쓴다.

채점은 학생이 정답을 모르므로 '정답이라 가정'하고 포인트까지 한 묶음으로 써 본다. 규칙이 missionKeys와 대조해 틀리면 묶음 전체가 거부되고, 앱은 그때 포인트 없이 `correct: false`만 쓴다.

1. `missionAttempts/학생_날짜_n` 만들기 (qid, answer). 답은 이후 수정 불가.
2. 같은 문서에 `correct` 추가 → 규칙이 missionKeys의 answers와 대조해 참/거짓이 맞아야 통과.
   정답이면 같은 batch에 mission 거래 + summaries. n = 5이면 summaries.missionDays +1.
3. n번을 채점해야 n+1번을 만들 수 있다.

분수 답은 앱이 약분한 형태로 바꿔서 보내고, missionKeys.answers에도 약분한 형태를 넣는다.

## 학생 로그인 순서

1. 익명 로그인
2. `numbers/{번호}`를 읽어 sid 확인
3. `sessions/{uid}`에 {number, sid, pin, at: serverTimestamp()} 만들기. 규칙이 studentPins와 대조한다.
4. 학생이 직접 PIN 바꾸기: studentPins/{번호}를 {pin: 새 PIN, prev: 지금 PIN}으로 update. 읽기는 여전히 불가.
5. PIN 재설정 또는 전학 시 교사가 그 학생의 sessions를 모두 지운다. 전학이면 numbers·studentPins도 지운다.

학생 등록 시 교사 화면이 한 batch로 만드는 것: students, numbers, studentPins, summaries(0으로), profiles.
