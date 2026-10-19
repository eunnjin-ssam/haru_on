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
  // 상의
  topPlain: { category: 'top', name: '무지 티셔츠', starter: true, defColor: '#3b6cf6', prices: { default: 0, blue: 6, red: 6, green: 6, yellow: 8, purple: 8, pink: 8, mint: 8, orange: 8, white: 8, black: 8, navy: 10 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 6, 3.4, c), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  topHood: { category: 'top', name: '후드티', starter: false, prices: { gray: 18, blue: 20, pink: 20, purple: 22, red: 20, green: 20, mint: 20, black: 20, white: 20, navy: 22 },
    boxes: (c) => [b(-3.3, 7, -1.8, 6.6, 6.2, 3.6, c), b(-5.3, 9, -1.3, 2.5, 4.5, 2.5, c), b(2.8, 9, -1.3, 2.5, 4.5, 2.5, c), b(-3, 12.5, -2, 6, 1.5, 1, c)] },
  topStripe: { category: 'top', name: '줄무늬 티', starter: false, prices: { red: 16, blue: 16, green: 16, yellow: 16, purple: 16, mint: 16, orange: 16, black: 16, navy: 18 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 2, 3.4, c), b(-3.2, 10.5, -1.7, 6.4, 2, 3.4, c), b(-3.2, 9, -1.7, 6.4, 1.5, 3.4, '#f5f5f5'), b(-3.2, 12.5, -1.7, 6.4, 0.5, 3.4, '#f5f5f5'), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  // 하의
  bottomPlain: { category: 'bottom', name: '기본 바지', starter: true, defColor: '#2b2b2b', prices: { default: 0, blue: 6, black: 6, brown: 8, navy: 8, green: 8, purple: 8, red: 8, mint: 8, white: 8, gray: 8 },
    boxes: (c) => [b(-2.8, 0, -1.4, 2.6, 7.2, 2.8, c), b(0.2, 0, -1.4, 2.6, 7.2, 2.8, c)] },
  bottomSkirt: { category: 'bottom', name: '치마', starter: false, prices: { pink: 15, red: 15, purple: 18, blue: 18, mint: 18, yellow: 18, green: 18, black: 18, navy: 20 },
    boxes: (c) => [b(-3.6, 5, -2, 7.2, 3, 4, c), b(-2.8, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5'), b(0.2, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5')] },
  bottomShorts: { category: 'bottom', name: '반바지', starter: false, prices: { blue: 10, green: 10, yellow: 10, red: 10, purple: 10, mint: 10, orange: 10, pink: 10, black: 10, navy: 12 },
    boxes: (c) => [b(-2.8, 3.5, -1.5, 2.6, 3.7, 3, c), b(0.2, 3.5, -1.5, 2.6, 3.7, 3, c)] },
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
  // 얼굴 소품
  glasses: { category: 'faceAcc', name: '안경', starter: false, prices: { black: 12, brown: 12, blue: 14, red: 14, mint: 14, purple: 14 },
    boxes: (c) => [b(-2.8, 16.6, -3.8, 1.9, 1.5, 0.4, c), b(0.9, 16.6, -3.8, 1.9, 1.5, 0.4, c), b(-0.9, 17.1, -3.8, 1.8, 0.3, 0.4, c)] },
  mask: { category: 'faceAcc', name: '마스크', starter: false, prices: { white: 8, blue: 10, black: 10, pink: 10, mint: 10, green: 10 },
    boxes: (c) => [b(-3.2, 13.8, -4.2, 6.4, 2.9, 0.7, c)] },
};

// 착용 상태(equip) → 그릴 블록 전체 목록.
// 기본(무료) 아이템은 color가 'default'인데, 아이템마다 defColor가 있으면 그 예쁜 기본색을 쓴다.
// 아무것도 안 꾸민 학생의 기본 차림(우리 반 격자·대시보드에서 맨몸 방지)
export const DEFAULT_LOOK = {
  hair: { item: 'hairBasic', color: 'default' }, face: { item: 'faceSmile', color: 'default' },
  top: { item: 'topPlain', color: 'default' }, bottom: { item: 'bottomPlain', color: 'default' },
  shoes: { item: 'shoesBasic', color: 'default' },
};
// 입은 게 하나도 없으면 기본 차림으로
export const lookOf = (equip) => (equip && Object.values(equip).some(Boolean) ? equip : DEFAULT_LOOK);

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
