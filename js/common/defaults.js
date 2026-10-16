// settings/main 문서의 처음 값. 관리 페이지에서 처음 한 번 Firestore에 저장하고,
// 그 뒤로 앱은 이 파일이 아니라 Firestore의 settings/main을 읽는다.
// 보안 규칙도 settings/main의 값으로 포인트 금액과 칭호 기준을 검사한다.
export const DEFAULT_SETTINGS = {
  names: {
    currency: '포인트',
    menus: {
      dashboard: '대시보드',
      writing: '글마당',
      stories: '약속마당',
      tasks: '과제마당',
      myweek: '나의마당',
      character: '내 캐릭터',
      shop: '상점',
    },
  },
  points: {
    mission: 1,        // 기초미션 1문제 정답
    writing: 2,        // 글마당 (하루 1회)
    writingBonus: 3,   // 한 주 서로 다른 날 글쓰기 보너스
    bonusDays: 3,      // 보너스 기준 일수
  },
  mission: {
    perDay: 5,
    units: [],         // 출제할 단원 id 목록 (관리 페이지에서 체크)
  },
  lateDays: 7,         // 마감 후 절반 포인트를 받는 기간
  storyAgendaLikes: 5, // 약속마당 회의 안건 공감 기준
  titles: {
    reading: [
      { name: '초보 독서가', min: 10 },
      { name: '중급 독서가', min: 20 },
      { name: '고급 독서가', min: 30 },
      { name: '마스터 독서가', min: 50 },
      { name: '그랜드마스터 독서가', min: 70 },
    ],
    mission: [
      { name: '초보 수학 탐험가', min: 10 },
      { name: '중급 수학 탐험가', min: 30 },
      { name: '고급 수학 탐험가', min: 50 },
      { name: '마스터 수학 탐험가', min: 80 },
      { name: '그랜드마스터 수학 탐험가', min: 120 },
    ],
    role: [
      { name: '초보 도우미', min: 20 },
      { name: '중급 도우미', min: 40 },
      { name: '고급 도우미', min: 60 },
      { name: '마스터 도우미', min: 100 },
      { name: '그랜드마스터 도우미', min: 150 },
    ],
  },
  titleColors: ['#ffffff', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f'],
  tree: [
    { name: '새싹', min: 0 },
    { name: '줄기', min: 101 },
    { name: '어린 나무', min: 251 },
    { name: '꽃 피는 나무', min: 501 },
    { name: '열매 나무', min: 801 },
    { name: '큰 나무', min: 1201 },
  ],
};

// settings/teacher 문서 (살핌판 기준, 교사만 읽음)
export const DEFAULT_TEACHER_SETTINGS = {
  care: {
    moodDays: 5,          // 최근 5일 중
    moodNegative: 3,      // 3일 이상 부정 기분
    moodStreak: 3,        // 연속 부정 기분 알림
    tasksLeft: 2,         // 남은 과제 2개 이상
    activityWeeks: 2,     // 최근 2주
    activityRate: 0.5,    // 완료율 50% 미만
    dropFrom: 0.9,        // 평소 완료율
    dropTo: 0.3,          // 이번 주 완료율
    recheckDays: 7,       // '살펴봤어요' 뒤 다시 표시
  },
};
