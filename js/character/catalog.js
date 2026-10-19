// 복셀 캐릭터 아이템 도감. 모양(블록 목록)은 여기(정적 코드)에 두고,
// 가격·판매 여부는 Firestore items/{id} 에 둔다(선생님이 바꾸므로). 같은 id로 연결된다.
// 블록: { x, y, z, w, h, d, color } — (x,y,z)는 최소 모서리, 캐릭터는 x=0 중심, 발이 y=0.

export const COLORS = {
  default: '#cfd3da', black: '#2b2b2b', brown: '#8b5a2b', red: '#d9443a', orange: '#e67e22',
  blue: '#3b6cf6', skyblue: '#56c4e8', green: '#2ecc71', yellow: '#f1c40f',
  pink: '#ff8fb3', purple: '#9b59b6', white: '#f5f5f5', gray: '#9aa0ab', gold: '#ffd700',
  mint: '#4fd1b8', navy: '#2a3f7a',
};
// 색 이름은 영어 id로 저장하고(보안 규칙), 화면에는 한글로 보여 준다.
export const COLOR_LABEL = {
  black: '검정', brown: '갈색', red: '빨강', orange: '주황', blue: '파랑',
  skyblue: '하늘', green: '초록', yellow: '노랑', pink: '분홍', purple: '보라',
  white: '흰색', gray: '회색', gold: '금색', mint: '민트', navy: '남색',
};
export const colorHex = (c) => COLORS[c] ?? c ?? COLORS.default;
export const colorLabel = (c) => COLOR_LABEL[c] ?? c;
export const COLOR_LIST = Object.keys(COLORS).filter((c) => c !== 'default');

const SKIN = '#f1c9a5';
const b = (x, y, z, w, h, d, color) => ({ x, y, z, w, h, d, color });

// 늘 그리는 몸통 뼈대 (팔다리·머리·목)
export const BODY = [
  b(-2.6, 0, -1.2, 2.2, 7, 2.4, SKIN), // 왼다리
  b(0.4, 0, -1.2, 2.2, 7, 2.4, SKIN), // 오른다리
  b(-3, 7, -1.5, 6, 6, 3, SKIN), // 몸통(상의가 덮음)
  b(-5, 6.5, -1, 2, 6.5, 2, SKIN), // 왼팔
  b(3, 6.5, -1, 2, 6.5, 2, SKIN), // 오른팔
  b(-1, 12.8, -0.6, 2, 1, 1.2, SKIN), // 목
  b(-4.5, 13.3, -3.5, 9, 8, 7, SKIN), // 머리(가로로 넓게: 9×8×7)
];

// 각 아이템: category, name, starter, prices(기본값), boxes(hex) → 블록 목록
export const CATALOG = {
  // 헤어
  hairBasic: { category: 'hair', name: '기본 머리', starter: true, defColor: '#5b3a1e', prices: { default: 0, brown: 5, black: 5, yellow: 8, blue: 8, red: 8, pink: 8, purple: 8, mint: 8, orange: 8, white: 8, green: 8, navy: 10 },
    boxes: (c) => [
      b(-4.8, 20.5, -3.8, 9.6, 1.6, 7.6, c), // 윗머리(넓게)
      b(-4.0, 22.0, -3.1, 8.0, 1.0, 6.2, c), // 정수리(둥글게)
      b(-4.8, 16.0, 2.6, 9.6, 5.3, 1.2, c), // 뒤
      b(-4.8, 16.0, -3.8, 1.2, 5.3, 7.6, c), // 왼쪽 옆
      b(3.6, 16.0, -3.8, 1.2, 5.3, 7.6, c), // 오른쪽 옆
      b(-4.8, 19.4, -3.9, 9.6, 1.5, 0.7, c), // 앞머리(눈 위)
    ] },
  hairLong: { category: 'hair', name: '긴 머리', starter: false, prices: { brown: 15, black: 15, yellow: 18, pink: 18, blue: 18, red: 18, purple: 18, mint: 18, orange: 18, white: 18, green: 18, navy: 20 },
    boxes: (c) => [
      b(-4.8, 20.5, -3.8, 9.6, 1.6, 7.6, c), // 윗머리
      b(-4.0, 22.0, -3.1, 8.0, 1.0, 6.2, c), // 정수리
      b(-4.8, 10, -3.8, 1.4, 11, 7.6, c), // 왼쪽 길게
      b(3.4, 10, -3.8, 1.4, 11, 7.6, c), // 오른쪽 길게
      b(-4.8, 19.4, -3.9, 9.6, 1.5, 0.7, c), // 앞머리
    ] },
  hairSpiky: { category: 'hair', name: '뾰족 머리', starter: false, prices: { black: 18, brown: 18, blue: 20, red: 20, pink: 20, purple: 20, mint: 20, orange: 20, white: 20, green: 20, yellow: 20, navy: 22 },
    boxes: (c) => [
      b(-4.6, 20.5, -3.6, 9.2, 1.1, 7.2, c), // 윗머리
      b(-4.6, 16.2, -3.6, 1.1, 4.5, 7.2, c), // 왼쪽 옆
      b(3.5, 16.2, -3.6, 1.1, 4.5, 7.2, c), // 오른쪽 옆
      b(-2.3, 21.6, -1.1, 1.4, 2.2, 1.4, c), // 뿔1
      b(1, 21.6, -1.1, 1.4, 2.2, 1.4, c), // 뿔2
      b(-0.7, 21.9, 0.6, 1.4, 2.5, 1.4, c), // 뿔3
    ] },
  hairPony: { category: 'hair', name: '하나로 묶은 머리', starter: false, prices: { brown: 15, black: 15, yellow: 18, pink: 18, red: 18, purple: 18, mint: 18, orange: 18, blue: 18, navy: 20 },
    boxes: (c) => [
      b(-4.8, 20.5, -3.8, 9.6, 1.6, 7.6, c), // 윗머리
      b(-4.0, 22.0, -3.1, 8.0, 1.0, 6.2, c), // 정수리
      b(-4.8, 17.0, 2.6, 9.6, 4.3, 1.2, c), // 뒤
      b(-4.8, 17.5, -3.8, 1.2, 3.8, 7.6, c), b(3.6, 17.5, -3.8, 1.2, 3.8, 7.6, c), // 옆(짧게)
      b(-4.8, 19.4, -3.9, 9.6, 1.5, 0.7, c), // 앞머리
      b(-1.1, 17.2, 3.7, 2.2, 0.9, 1.4, '#e74c3c'), // 머리끈
      b(-0.9, 11.8, 3.8, 1.8, 5.6, 1.4, c), // 묶은 머리
    ] },
  hairBob: { category: 'hair', name: '단발', starter: false, prices: { brown: 16, black: 16, yellow: 18, pink: 18, red: 18, purple: 18, mint: 18, orange: 18, blue: 18, white: 18, navy: 20 },
    boxes: (c) => [
      b(-4.9, 20.5, -3.9, 9.8, 1.6, 7.8, c), b(-4.1, 22.0, -3.2, 8.2, 1.0, 6.4, c),
      b(-5.0, 14.4, -3.9, 1.4, 6.6, 7.8, c), b(3.6, 14.4, -3.9, 1.4, 6.6, 7.8, c), // 옆(턱까지)
      b(-5.0, 14.4, 2.6, 10, 6.6, 1.4, c), // 뒤(턱까지)
      b(-4.9, 19.0, -4.0, 9.8, 1.9, 0.8, c), // 일자 앞머리
    ] },
  hairPerm: { category: 'hair', name: '파마', starter: false, prices: { brown: 20, black: 20, yellow: 22, pink: 22, red: 22, purple: 22, mint: 22, orange: 22, white: 22, navy: 24 },
    boxes: (c) => [
      b(-5.0, 20.3, -3.9, 10, 1.8, 7.8, c), b(-5.0, 15.5, -3.9, 1.5, 5, 7.8, c), b(3.5, 15.5, -3.9, 1.5, 5, 7.8, c), b(-5.0, 15.5, 2.5, 10, 5, 1.5, c),
      // 뽀글뽀글한 덩어리
      b(-4.2, 22.0, -3.2, 2.2, 1.6, 2.2, c), b(-1.1, 22.2, -3.2, 2.2, 1.6, 2.2, c), b(2.0, 22.0, -3.2, 2.2, 1.6, 2.2, c),
      b(-3.0, 22.1, 0.4, 2.2, 1.6, 2.2, c), b(0.8, 22.1, 0.4, 2.2, 1.6, 2.2, c),
      b(-5.6, 17.0, -2.5, 1.4, 2, 2, c), b(4.2, 17.0, -2.5, 1.4, 2, 2, c), b(-5.6, 15.0, 0.5, 1.4, 2, 2, c), b(4.2, 15.0, 0.5, 1.4, 2, 2, c),
      b(-4.9, 19.3, -4.0, 9.8, 1.2, 0.8, c), // 앞머리
    ] },
  hairPigtail: { category: 'hair', name: '양갈래', starter: false, prices: { brown: 18, black: 18, yellow: 20, pink: 20, red: 20, purple: 20, mint: 20, orange: 20, blue: 20, navy: 22 },
    boxes: (c) => [
      b(-4.8, 20.5, -3.8, 9.6, 1.6, 7.6, c), b(-4.0, 22.0, -3.1, 8.0, 1.0, 6.2, c),
      b(-4.8, 16.0, 2.6, 9.6, 5.3, 1.2, c), b(-4.8, 17.5, -3.8, 1.2, 3.8, 7.6, c), b(3.6, 17.5, -3.8, 1.2, 3.8, 7.6, c),
      b(-4.8, 19.4, -3.9, 9.6, 1.5, 0.7, c),
      b(-6.3, 18.6, -0.9, 1.6, 1.0, 1.8, '#ff8fb3'), b(4.7, 18.6, -0.9, 1.6, 1.0, 1.8, '#ff8fb3'), // 방울
      b(-6.6, 13.2, -0.8, 1.8, 5.4, 1.6, c), b(4.8, 13.2, -0.8, 1.8, 5.4, 1.6, c), // 양쪽 묶은 머리
    ] },
  hairSport: { category: 'hair', name: '스포츠 머리', starter: false, prices: { black: 12, brown: 12, yellow: 15, blue: 15, red: 15, green: 15, orange: 15, white: 15, navy: 16 },
    boxes: (c) => [
      b(-4.7, 20.6, -3.7, 9.4, 1.0, 7.4, c), // 짧은 윗머리
      b(-4.7, 18.6, -3.7, 0.9, 2.0, 7.4, c), b(3.8, 18.6, -3.7, 0.9, 2.0, 7.4, c), // 짧은 옆
      b(-4.7, 17.0, 2.7, 9.4, 3.6, 0.9, c), // 뒤
      b(-4.7, 20.3, -3.8, 9.4, 0.5, 0.5, c), // 앞 라인
    ] },
  // 얼굴 (눈·입·볼, 머리 앞면에 또렷이 붙는다. 색은 고정)
  faceSmile: { category: 'face', name: '웃는 눈', starter: true, prices: { default: 0 },
    boxes: () => [
      b(-2.16, 16.9, -4.0, 0.72, 0.85, 0.6, '#2b2b2b'), b(1.44, 16.9, -4.0, 0.72, 0.85, 0.6, '#2b2b2b'), // 눈(작게)
      b(-0.75, 15.4, -4.0, 1.5, 0.5, 0.6, '#c0574a'), // 입 가운데(낮게)
      b(-1.5, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 왼쪽 끝(올라감)
      b(0.75, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 오른쪽 끝(올라감)
    ] },
  faceWink: { category: 'face', name: '윙크', starter: false, prices: { default: 10 },
    boxes: () => [
      b(-2.16, 16.9, -4.0, 0.72, 0.85, 0.6, '#2b2b2b'), // 뜬 눈
      b(1.25, 17.15, -4.0, 0.92, 0.38, 0.6, '#2b2b2b'), // 감은 눈(가로줄)
      b(-0.75, 15.4, -4.0, 1.5, 0.5, 0.6, '#c0574a'), // 입 가운데(낮게)
      b(-1.5, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 왼쪽 끝(올라감)
      b(0.75, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 오른쪽 끝(올라감)
    ] },
  faceStar: { category: 'face', name: '반짝 눈', starter: false, prices: { default: 12 },
    boxes: () => [
      b(-2.16, 16.9, -4.0, 0.72, 0.85, 0.6, '#f1c40f'), b(1.44, 16.9, -4.0, 0.72, 0.85, 0.6, '#f1c40f'), // 별 눈(작게)
      b(-0.75, 15.4, -4.0, 1.5, 0.5, 0.6, '#c0574a'), // 입 가운데(낮게)
      b(-1.5, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 왼쪽 끝(올라감)
      b(0.75, 15.75, -4.0, 0.75, 0.5, 0.6, '#c0574a'), // 입 오른쪽 끝(올라감)
    ] },
  faceSleepy: { category: 'face', name: '졸린 눈', starter: false, prices: { default: 10 },
    boxes: () => [
      b(-2.35, 17.0, -4.0, 1.1, 0.36, 0.6, '#2b2b2b'), b(1.25, 17.0, -4.0, 1.1, 0.36, 0.6, '#2b2b2b'), // 반쯤 감은 눈
      b(-0.6, 15.55, -4.0, 1.2, 0.4, 0.6, '#c0574a'), // 일자 입
      b(3.0, 19.0, -4.0, 0.5, 0.5, 0.4, '#5b8def'), b(3.7, 19.7, -4.0, 0.4, 0.4, 0.4, '#5b8def'), // 졸음 방울
    ] },
  faceSurprise: { category: 'face', name: '놀란 얼굴', starter: false, prices: { default: 12 },
    boxes: () => [
      b(-2.3, 16.8, -4.0, 1.0, 1.1, 0.6, '#2b2b2b'), b(1.3, 16.8, -4.0, 1.0, 1.1, 0.6, '#2b2b2b'), // 동그란 눈
      b(-2.4, 18.4, -4.0, 1.2, 0.3, 0.6, '#5b3a1e'), b(1.2, 18.4, -4.0, 1.2, 0.3, 0.6, '#5b3a1e'), // 올라간 눈썹
      b(-0.55, 14.9, -4.0, 1.1, 1.1, 0.6, '#c0574a'), // 'O' 입
    ] },
  // 상의
  topPlain: { category: 'top', name: '무지 티셔츠', starter: true, defColor: '#3b6cf6', prices: { default: 0, blue: 6, red: 6, green: 6, yellow: 8, purple: 8, pink: 8, mint: 8, orange: 8, white: 8, black: 8, navy: 10 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 6, 3.4, c), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  topHood: { category: 'top', name: '후드티', starter: false, prices: { gray: 18, blue: 20, pink: 20, purple: 22, red: 20, green: 20, mint: 20, black: 20, white: 20, navy: 22 },
    boxes: (c) => [b(-3.3, 7, -1.8, 6.6, 6.2, 3.6, c), b(-5.3, 9, -1.3, 2.5, 4.5, 2.5, c), b(2.8, 9, -1.3, 2.5, 4.5, 2.5, c), b(-3, 12.5, -2, 6, 1.5, 1, c)] },
  topStripe: { category: 'top', name: '줄무늬 티', starter: false, prices: { red: 16, blue: 16, green: 16, yellow: 16, purple: 16, mint: 16, orange: 16, black: 16, navy: 18 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 2, 3.4, c), b(-3.2, 10.5, -1.7, 6.4, 2, 3.4, c), b(-3.2, 9, -1.7, 6.4, 1.5, 3.4, '#f5f5f5'), b(-3.2, 12.5, -1.7, 6.4, 0.5, 3.4, '#f5f5f5'), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  topShirt: { category: 'top', name: '셔츠', starter: false, prices: { white: 18, skyblue: 18, pink: 18, yellow: 18, mint: 18, blue: 20, navy: 20 },
    boxes: (c) => [
      b(-3.2, 7, -1.7, 6.4, 6, 3.4, c), b(-5.2, 10.5, -1.2, 2.4, 3, 2.4, c), b(2.8, 10.5, -1.2, 2.4, 3, 2.4, c),
      b(-1.7, 12.2, -1.95, 1.4, 0.8, 0.4, '#f5f5f5'), b(0.3, 12.2, -1.95, 1.4, 0.8, 0.4, '#f5f5f5'), // 칼라
      b(-0.2, 11.0, -1.85, 0.4, 0.4, 0.2, '#555'), b(-0.2, 9.6, -1.85, 0.4, 0.4, 0.2, '#555'), b(-0.2, 8.2, -1.85, 0.4, 0.4, 0.2, '#555'), // 단추
    ] },
  topGym: { category: 'top', name: '체육복', starter: false, prices: { navy: 22, blue: 22, red: 22, green: 22, black: 22, purple: 22, gray: 22 },
    boxes: (c) => [
      b(-3.3, 7, -1.8, 6.6, 6.2, 3.6, c), b(-5.3, 7.5, -1.3, 2.5, 6, 2.5, c), b(2.8, 7.5, -1.3, 2.5, 6, 2.5, c), // 긴팔 점퍼
      b(-0.2, 7, -1.95, 0.4, 6, 0.2, '#f5f5f5'), // 지퍼
      b(-5.45, 7.5, -0.3, 0.2, 6, 0.6, '#f5f5f5'), b(5.25, 7.5, -0.3, 0.2, 6, 0.6, '#f5f5f5'), // 팔 줄
      b(-2.9, 12.6, -1.95, 5.8, 0.6, 0.3, '#f5f5f5'), // 목 둘레
    ] },
  topOverall: { category: 'top', name: '멜빵', starter: false, prices: { blue: 24, navy: 24, red: 24, green: 24, yellow: 24, pink: 24, brown: 24 },
    boxes: (c) => [
      b(-3.2, 7, -1.7, 6.4, 6, 3.4, '#f5f5f5'), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, '#f5f5f5'), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, '#f5f5f5'), // 흰 티
      b(-2.4, 7, -1.95, 4.8, 3.6, 0.4, c), // 앞판
      b(-2.4, 10.4, -1.95, 1.0, 2.6, 0.4, c), b(1.4, 10.4, -1.95, 1.0, 2.6, 0.4, c), // 앞 멜빵끈
      b(-2.4, 7, 1.6, 1.0, 6, 0.4, c), b(1.4, 7, 1.6, 1.0, 6, 0.4, c), // 뒤 멜빵끈
      b(-2.2, 10.6, -2.15, 0.6, 0.6, 0.2, '#f1c40f'), b(1.6, 10.6, -2.15, 0.6, 0.6, 0.2, '#f1c40f'), // 단추
      b(-0.8, 7.8, -2.15, 1.6, 1.2, 0.2, c), // 주머니(살짝 튀어나옴)
    ] },
  topSuit: { category: 'top', name: '정장', starter: false, prices: { black: 50, navy: 50, gray: 50, brown: 50, purple: 55, white: 55 },
    boxes: (c) => [
      b(-3.3, 7, -1.8, 6.6, 6.2, 3.6, c), b(-5.3, 7, -1.3, 2.5, 6.5, 2.5, c), b(2.8, 7, -1.3, 2.5, 6.5, 2.5, c), // 재킷
      b(-1.0, 9.2, -1.95, 2.0, 4.0, 0.3, '#f5f5f5'), // 흰 셔츠
      b(-0.35, 8.6, -2.1, 0.7, 4.2, 0.3, '#d9443a'), // 넥타이
      b(-2.0, 8.0, -2.0, 0.4, 0.4, 0.2, '#ddd'), b(-2.0, 9.4, -2.0, 0.4, 0.4, 0.2, '#ddd'), // 단추
    ] },
  topRobe: { category: 'top', name: '마법사 로브', starter: false, prices: { purple: 60, navy: 60, black: 60, blue: 60, red: 60, green: 60 },
    boxes: (c) => [
      b(-3.6, 2.5, -2.0, 7.2, 10.7, 4.0, c), // 발목까지 오는 로브
      b(-5.7, 8.0, -1.6, 2.9, 5.2, 3.2, c), b(2.8, 8.0, -1.6, 2.9, 5.2, 3.2, c), // 넓은 소매
      b(-3.65, 7.0, -2.05, 7.3, 0.6, 4.1, '#f1c40f'), // 허리띠
      b(-1.9, 10.2, -2.15, 0.8, 0.8, 0.2, '#f1c40f'), b(1.0, 4.5, -2.15, 0.8, 0.8, 0.2, '#f1c40f'), b(-2.2, 3.6, -2.15, 0.6, 0.6, 0.2, '#f5f5f5'), // 별 무늬
    ] },
  topDiamond: { category: 'top', name: '다이아 갑옷', starter: false, prices: { mint: 120, skyblue: 120, blue: 120, purple: 125 },
    boxes: (c) => [
      b(-3.4, 7, -1.9, 6.8, 6.2, 3.8, c), // 몸판
      b(-5.6, 11.4, -1.5, 2.8, 1.9, 3.0, c), b(2.8, 11.4, -1.5, 2.8, 1.9, 3.0, c), // 어깨 보호대
      b(-5.3, 7.5, -1.3, 2.5, 3.9, 2.5, c), b(2.8, 7.5, -1.3, 2.5, 3.9, 2.5, c), // 팔
      b(-1.0, 9.4, -2.1, 2.0, 2.0, 0.3, '#e9fcff'), // 가슴 보석
      b(-3.45, 7.0, -2.0, 6.9, 0.5, 4.0, '#2a3f7a'), // 아래 테두리
    ] },
  // 하의
  bottomPlain: { category: 'bottom', name: '기본 바지', starter: true, defColor: '#2b2b2b', prices: { default: 0, blue: 6, black: 6, brown: 8, navy: 8, green: 8, purple: 8, red: 8, mint: 8, white: 8, gray: 8 },
    boxes: (c) => [b(-2.8, 0, -1.4, 2.6, 7.2, 2.8, c), b(0.2, 0, -1.4, 2.6, 7.2, 2.8, c)] },
  bottomSkirt: { category: 'bottom', name: '치마', starter: false, prices: { pink: 15, red: 15, purple: 18, blue: 18, mint: 18, yellow: 18, green: 18, black: 18, navy: 20 },
    boxes: (c) => [b(-3.6, 5, -2, 7.2, 3, 4, c), b(-2.8, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5'), b(0.2, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5')] },
  bottomShorts: { category: 'bottom', name: '반바지', starter: false, prices: { blue: 10, green: 10, yellow: 10, red: 10, purple: 10, mint: 10, orange: 10, pink: 10, black: 10, navy: 12 },
    boxes: (c) => [b(-2.8, 3.5, -1.5, 2.6, 3.7, 3, c), b(0.2, 3.5, -1.5, 2.6, 3.7, 3, c)] },
  bottomJeans: { category: 'bottom', name: '청바지', starter: false, prices: { blue: 18, navy: 18, skyblue: 18, black: 20, gray: 20, white: 20 },
    boxes: (c) => [
      b(-2.8, 0, -1.4, 2.6, 7.2, 2.8, c), b(0.2, 0, -1.4, 2.6, 7.2, 2.8, c),
      b(-3.0, 6.4, -1.55, 6.0, 0.8, 3.1, '#8b5a2b'), // 허리띠
      b(-0.3, 6.5, -1.65, 0.6, 0.6, 0.2, '#f1c40f'), // 버클
      b(-2.9, 0, -1.5, 0.15, 7.2, 0.15, '#f1c40f'), b(2.75, 0, -1.5, 0.15, 7.2, 0.15, '#f1c40f'), // 바깥 박음질
    ] },
  bottomTrack: { category: 'bottom', name: '트레이닝 바지', starter: false, prices: { navy: 18, black: 18, gray: 18, blue: 18, red: 18, green: 18, purple: 18 },
    boxes: (c) => [
      b(-2.8, 0, -1.4, 2.6, 7.2, 2.8, c), b(0.2, 0, -1.4, 2.6, 7.2, 2.8, c),
      b(-2.95, 0, -0.3, 0.2, 7.2, 0.6, '#f5f5f5'), b(2.75, 0, -0.3, 0.2, 7.2, 0.6, '#f5f5f5'), // 옆줄
    ] },
  bottomDiamond: { category: 'bottom', name: '다이아 하의', starter: false, prices: { mint: 110, skyblue: 110, blue: 110, purple: 115 },
    boxes: (c) => [
      b(-2.95, 0, -1.55, 2.9, 7.3, 3.1, c), b(0.05, 0, -1.55, 2.9, 7.3, 3.1, c),
      b(-2.2, 3.2, -1.75, 1.4, 1.2, 0.3, '#e9fcff'), b(0.8, 3.2, -1.75, 1.4, 1.2, 0.3, '#e9fcff'), // 무릎 보석
      b(-3.0, 6.6, -1.6, 6.0, 0.7, 3.2, '#2a3f7a'), // 허리 테두리
    ] },
  // 신발
  shoesBasic: { category: 'shoes', name: '운동화', starter: true, defColor: '#f5f5f5', prices: { default: 0, white: 5, black: 5, red: 8, blue: 8, green: 8, yellow: 8, pink: 8, purple: 8, mint: 8, orange: 8, navy: 10 },
    boxes: (c) => [b(-2.9, 0, -1.6, 2.4, 1.6, 3, c), b(0.3, 0, -1.6, 2.4, 1.6, 3, c)] },
  // 머리 소품
  capCap: { category: 'headAcc', name: '모자', starter: false, prices: { blue: 15, red: 15, black: 15, green: 15, yellow: 15, purple: 15, pink: 15, mint: 15, orange: 15, white: 15, navy: 18 },
    boxes: (c) => [b(-4.9, 20.5, -3.9, 9.8, 1.6, 7.8, c), b(-4.9, 20.5, -5.6, 9.8, 1, 2, c)] },
  crown: { category: 'headAcc', name: '왕관', starter: false, prices: { yellow: 100, gold: 120 },
    boxes: () => [b(-4.9, 21.1, -3.9, 9.8, 1, 7.8, '#f1c40f'), b(-4.5, 22.1, -3.5, 1.3, 1.5, 1.3, '#f1c40f'), b(-0.65, 22.1, -0.65, 1.3, 1.8, 1.3, '#f1c40f'), b(3.2, 22.1, -3.5, 1.3, 1.5, 1.3, '#f1c40f'), b(-4.5, 22.1, 2.2, 1.3, 1.5, 1.3, '#f1c40f'), b(3.2, 22.1, 2.2, 1.3, 1.5, 1.3, '#f1c40f')] },
  halo: { category: 'headAcc', name: '빛나는 고리', starter: false, prices: { gold: 100, yellow: 90 },
    boxes: (c) => [b(-3.0, 25.3, -3.2, 6.0, 0.8, 0.9, c), b(-3.0, 25.3, 2.3, 6.0, 0.8, 0.9, c), b(-3.2, 25.3, -3.0, 0.9, 0.8, 6.0, c), b(2.3, 25.3, -3.0, 0.9, 0.8, 6.0, c)] },
  beanie: { category: 'headAcc', name: '비니', starter: false, prices: { red: 40, blue: 40, green: 40, pink: 40, purple: 40, orange: 40, black: 40, white: 40, mint: 40, yellow: 40, navy: 45 },
    boxes: (c) => [b(-5, 20.5, -4.3, 10, 3.3, 8.6, c), b(-5.1, 18.9, -4.4, 10.2, 1.3, 8.8, '#f5f5f5')] },
  strawHat: { category: 'headAcc', name: '밀짚모자', starter: false, prices: { yellow: 60, brown: 60, orange: 60, white: 60, green: 60 },
    boxes: (c) => [b(-6, 20.3, -6, 12, 0.6, 12, c), b(-3.7, 20.6, -3.7, 7.4, 0.4, 7.4, '#c79a4a'), b(-3.5, 20.9, -3.5, 7, 1.5, 7, c)] },
  pirateHat: { category: 'headAcc', name: '해적 모자', starter: false, prices: { black: 80, navy: 80, brown: 80, red: 85 },
    boxes: (c) => [b(-5, 20.3, -3.8, 10, 1.2, 7.6, c), b(-3.4, 21.3, -3.6, 6.8, 1, 7.2, c), b(-1, 20.8, -4, 2, 1, 0.5, '#f5f5f5')] },
  headphones: { category: 'headAcc', name: '헤드폰', starter: false, prices: { mint: 60, blue: 60, red: 60, black: 60, pink: 60, purple: 60, green: 60, navy: 65 },
    boxes: (c) => [
      b(-4.7, 21, -1, 9.4, 1.3, 2, c), // 윗 띠(머리 위를 가로질러 양쪽 컵 연결)
      b(-5.5, 18, -1, 1.1, 3.3, 2, c), // 왼쪽 세로 연결
      b(4.4, 18, -1, 1.1, 3.3, 2, c), // 오른쪽 세로 연결
      b(-5.8, 15.5, -1.4, 1.6, 3.2, 2.8, c), // 왼쪽 이어컵
      b(4.2, 15.5, -1.4, 1.6, 3.2, 2.8, c), // 오른쪽 이어컵
    ] },
  catEars: { category: 'headAcc', name: '고양이 귀', starter: false, prices: { black: 50, brown: 50, pink: 50, white: 50, orange: 50, purple: 50, blue: 50 },
    boxes: (c) => [b(-4.0, 23, -1.8, 2.4, 2.0, 2.4, c), b(-3.5, 24.8, -1.3, 1.5, 1.5, 1.5, c), b(1.6, 23, -1.8, 2.4, 2.0, 2.4, c), b(2.0, 24.8, -1.3, 1.5, 1.5, 1.5, c)] },
  flower: { category: 'headAcc', name: '꽃 장식', starter: false, prices: { pink: 40, red: 40, purple: 40, white: 40, yellow: 40, blue: 40, orange: 40 },
    boxes: (c) => [b(1.1, 23.2, -1.2, 1.3, 1.3, 1.1, c), b(3.0, 23.2, -1.2, 1.3, 1.3, 1.1, c), b(2.05, 24.3, -1.2, 1.3, 1.3, 1.1, c), b(2.05, 22.1, -1.2, 1.3, 1.3, 1.1, c), b(1.95, 23.2, -1.3, 1.5, 1.3, 1.1, '#f7d14b')] },
  tiara: { category: 'headAcc', name: '다이아몬드 티아라', starter: false, prices: { blue: 120, mint: 120, purple: 120, pink: 120, white: 125 },
    boxes: (c) => [b(-4.4, 20.5, -3.85, 8.8, 0.9, 1.1, c), b(-0.9, 21.3, -3.95, 1.8, 1.3, 0.9, '#8fe3f0'), b(-2.8, 21, -3.9, 1, 0.9, 0.8, '#bfeef7'), b(1.8, 21, -3.9, 1, 0.9, 0.8, '#bfeef7')] },
  headband: { category: 'headAcc', name: '머리띠', starter: false, prices: { pink: 15, red: 15, black: 15, white: 15, yellow: 15, purple: 15, mint: 15, blue: 15 },
    boxes: (c) => [b(-4.95, 21.9, -1.4, 9.9, 0.7, 1.5, c), b(-5.05, 18.0, -1.4, 0.6, 4.6, 1.5, c), b(4.45, 18.0, -1.4, 0.6, 4.6, 1.5, c)] },
  ribbon: { category: 'headAcc', name: '리본', starter: false, prices: { pink: 18, red: 18, purple: 18, yellow: 18, mint: 18, blue: 18, white: 18 },
    boxes: (c) => [b(1.9, 23.1, -0.7, 1.0, 1.0, 1.0, c), b(0.4, 22.8, -0.6, 1.5, 1.6, 0.8, c), b(2.9, 22.8, -0.6, 1.5, 1.6, 0.8, c)] },
  dogEars: { category: 'headAcc', name: '강아지 귀', starter: false, prices: { brown: 50, black: 50, white: 50, orange: 50, gray: 50 },
    boxes: (c) => [b(-5.6, 21.0, -1.3, 2.0, 1.0, 2.6, c), b(-6.0, 16.8, -1.3, 1.3, 4.4, 2.6, c), b(3.6, 21.0, -1.3, 2.0, 1.0, 2.6, c), b(4.7, 16.8, -1.3, 1.3, 4.4, 2.6, c)] },
  diamondHelmet: { category: 'headAcc', name: '다이아 헬멧', starter: false, prices: { mint: 120, skyblue: 120, blue: 120, purple: 125 },
    boxes: (c) => [
      b(-5.1, 20.3, -4.1, 10.2, 2.4, 8.2, c), // 윗판
      b(-5.2, 15.0, -4.1, 0.9, 5.4, 8.2, c), b(4.3, 15.0, -4.1, 0.9, 5.4, 8.2, c), // 옆판
      b(-5.1, 15.0, 3.3, 10.2, 5.4, 0.9, c), // 뒤판
      b(-5.1, 19.5, -4.35, 10.2, 0.8, 0.5, '#e9fcff'), // 이마 테두리
      b(-0.7, 22.6, -0.7, 1.4, 1.0, 1.4, '#e9fcff'), // 꼭대기 보석
    ] },
  // 얼굴 소품
  glasses: { category: 'faceAcc', name: '안경', starter: false, prices: { black: 12, brown: 12, blue: 14, red: 14, mint: 14, purple: 14 },
    boxes: (c) => [b(-2.8, 16.6, -3.8, 1.9, 1.5, 0.4, c), b(0.9, 16.6, -3.8, 1.9, 1.5, 0.4, c), b(-0.9, 17.1, -3.8, 1.8, 0.3, 0.4, c)] },
  mask: { category: 'faceAcc', name: '마스크', starter: false, prices: { white: 8, blue: 10, black: 10, pink: 10, mint: 10, green: 10 },
    boxes: (c) => [b(-3.2, 13.8, -4.2, 6.4, 2.9, 0.7, c)] },
  sunglasses: { category: 'faceAcc', name: '선글라스', starter: false, prices: { black: 18, navy: 18, purple: 20, red: 20, pink: 20, orange: 20 },
    boxes: (c) => [b(-3.0, 16.4, -3.95, 2.3, 1.6, 0.45, c), b(0.7, 16.4, -3.95, 2.3, 1.6, 0.45, c), b(-0.7, 17.4, -3.95, 1.4, 0.35, 0.45, '#2b2b2b'),
      b(-4.6, 17.3, -3.6, 0.3, 0.35, 3, '#2b2b2b'), b(4.3, 17.3, -3.6, 0.3, 0.35, 3, '#2b2b2b')] },
  bandage: { category: 'faceAcc', name: '반창고', starter: false, prices: { default: 8 },
    boxes: () => [b(1.6, 15.4, -4.1, 2.0, 0.8, 0.3, '#f0b45a'), b(2.3, 15.5, -4.2, 0.6, 0.6, 0.15, '#fff3dc')] },
  starSticker: { category: 'faceAcc', name: '별 스티커', starter: false, prices: { yellow: 10, pink: 10, mint: 10, blue: 10, purple: 10, gold: 15 },
    boxes: (c) => [b(-3.35, 15.2, -4.1, 0.6, 1.6, 0.3, c), b(-3.85, 15.7, -4.1, 1.6, 0.6, 0.3, c)] },
  robotMask: { category: 'faceAcc', name: '로봇 가면', starter: false, prices: { gray: 45, white: 45, black: 45, blue: 45, red: 48 },
    boxes: (c) => [
      b(-4.7, 13.5, -4.3, 9.4, 7.3, 0.7, c), // 얼굴판
      b(-2.7, 16.7, -4.45, 1.5, 0.8, 0.2, '#ff4d4d'), b(1.2, 16.7, -4.45, 1.5, 0.8, 0.2, '#ff4d4d'), // 빛나는 눈
      b(-1.6, 14.5, -4.45, 3.2, 0.25, 0.2, '#2b2b2b'), b(-1.6, 15.0, -4.45, 3.2, 0.25, 0.2, '#2b2b2b'), // 입 그릴
      b(-0.2, 20.8, -0.2, 0.4, 2.2, 0.4, '#9aa0ab'), b(-0.45, 22.9, -0.45, 0.9, 0.9, 0.9, '#ff4d4d'), // 안테나
    ] },
};

// 아무것도 안 꾸민 학생의 기본 차림(우리 반 격자·대시보드에서 맨몸 방지)
export const DEFAULT_LOOK = {
  hair: { item: 'hairBasic', color: 'default' }, face: { item: 'faceSmile', color: 'default' },
  top: { item: 'topPlain', color: 'default' }, bottom: { item: 'bottomPlain', color: 'default' },
  shoes: { item: 'shoesBasic', color: 'default' },
};
// 입은 게 하나도 없으면 기본 차림으로
export const lookOf = (equip) => (equip && Object.values(equip).some(Boolean) ? equip : DEFAULT_LOOK);

// 착용 상태(equip) → 그릴 블록 전체 목록.
// 기본(무료) 아이템은 color가 'default'인데, 아이템마다 defColor가 있으면 그 예쁜 기본색을 쓴다.
export function buildBoxes(equip) {
  const boxes = [...BODY];
  const order = ['bottom', 'top', 'shoes', 'hair', 'headAcc', 'face', 'faceAcc'];
  for (const slot of order) {
    const e = equip?.[slot];
    if (!e || !e.item) continue;
    const item = CATALOG[e.item];
    if (!item) continue;
    const hex = (e.color === 'default' && item.defColor) ? item.defColor : colorHex(e.color);
    boxes.push(...item.boxes(hex));
  }
  return boxes;
}
