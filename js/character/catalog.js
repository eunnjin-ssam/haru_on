// 복셀 캐릭터 아이템 도감. 모양(블록 목록)은 여기(정적 코드)에 두고,
// 가격·판매 여부는 Firestore items/{id} 에 둔다(선생님이 바꾸므로). 같은 id로 연결된다.
// 블록: { x, y, z, w, h, d, color } — (x,y,z)는 최소 모서리, 캐릭터는 x=0 중심, 발이 y=0.

export const COLORS = {
  default: '#cfd3da', black: '#2b2b2b', brown: '#8b5a2b', red: '#d9443a', orange: '#e67e22',
  blue: '#3b6cf6', skyblue: '#56c4e8', green: '#2ecc71', yellow: '#f1c40f',
  pink: '#ff8fb3', purple: '#9b59b6', white: '#f5f5f5', gray: '#9aa0ab', gold: '#ffd700',
};
export const colorHex = (c) => COLORS[c] ?? c ?? COLORS.default;
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
  b(-1, 13, -0.5, 2, 1, 1, SKIN), // 목
  b(-3, 14, -3, 6, 6, 6, SKIN), // 머리
];

// 각 아이템: category, name, starter, prices(기본값), boxes(hex) → 블록 목록
export const CATALOG = {
  // 헤어
  hairBasic: { category: 'hair', name: '기본 머리', starter: true, defColor: '#5b3a1e', prices: { default: 0, brown: 5, black: 5, yellow: 8 },
    boxes: (c) => [
      b(-3.3, 19, -3.3, 6.6, 1.6, 6.6, c), // 윗머리
      b(-3.3, 15, 2.3, 6.6, 4.2, 1, c), // 뒤
      b(-3.3, 15, -3.3, 1, 4.2, 6.6, c), // 왼쪽 옆
      b(2.3, 15, -3.3, 1, 4.2, 6.6, c), // 오른쪽 옆
      b(-3.3, 18, -3.4, 6.6, 1.3, 0.6, c), // 앞머리(눈 위)
    ] },
  hairLong: { category: 'hair', name: '긴 머리', starter: false, prices: { brown: 15, black: 15, yellow: 18, pink: 20 },
    boxes: (c) => [b(-3.3, 19, -3.3, 6.6, 1.6, 6.6, c), b(-3.3, 11, -3.3, 1.2, 8, 6.6, c), b(2.1, 11, -3.3, 1.2, 8, 6.6, c)] },
  hairSpiky: { category: 'hair', name: '뾰족 머리', starter: false, prices: { black: 18, blue: 20, red: 20 },
    boxes: (c) => [b(-3.2, 19, -3.2, 6.4, 1, 6.4, c), b(-2, 20, -1, 1.2, 2, 1.2, c), b(1, 20, -1, 1.2, 2, 1.2, c), b(-0.6, 20.3, 0.5, 1.2, 2.3, 1.2, c)] },
  // 얼굴 (눈·입·볼, 머리 앞면에 또렷이 붙는다. 색은 고정)
  faceSmile: { category: 'face', name: '웃는 눈', starter: true, prices: { default: 0 },
    boxes: () => [
      b(-2.1, 15.7, -3.5, 1.6, 2.0, 0.6, '#2b2b2b'), b(0.5, 15.7, -3.5, 1.6, 2.0, 0.6, '#2b2b2b'), // 눈
      b(-1.8, 16.9, -3.6, 0.6, 0.6, 0.5, '#ffffff'), b(0.8, 16.9, -3.6, 0.6, 0.6, 0.5, '#ffffff'), // 흰 반짝
      b(-2.9, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'), b(1.8, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'), // 볼
      b(-0.8, 14.4, -3.5, 1.6, 0.5, 0.5, '#7a4a3a'), // 입
    ] },
  faceWink: { category: 'face', name: '윙크', starter: false, prices: { default: 10 },
    boxes: () => [
      b(-2.1, 15.7, -3.5, 1.6, 2.0, 0.6, '#2b2b2b'), b(-1.8, 16.9, -3.6, 0.6, 0.6, 0.5, '#ffffff'),
      b(0.5, 16.4, -3.5, 1.6, 0.5, 0.6, '#2b2b2b'), // 감은 눈(가로줄)
      b(-2.9, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'), b(1.8, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'),
      b(-0.8, 14.4, -3.5, 1.6, 0.5, 0.5, '#7a4a3a'),
    ] },
  faceStar: { category: 'face', name: '반짝 눈', starter: false, prices: { default: 12 },
    boxes: () => [
      b(-2.1, 15.7, -3.5, 1.6, 2.0, 0.6, '#f1c40f'), b(0.5, 15.7, -3.5, 1.6, 2.0, 0.6, '#f1c40f'),
      b(-1.8, 16.9, -3.6, 0.6, 0.6, 0.5, '#ffffff'), b(0.8, 16.9, -3.6, 0.6, 0.6, 0.5, '#ffffff'),
      b(-2.9, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'), b(1.8, 15.0, -3.4, 1.1, 0.8, 0.4, '#ffb3c6'),
      b(-0.8, 14.4, -3.5, 1.6, 0.5, 0.5, '#7a4a3a'),
    ] },
  // 상의
  topPlain: { category: 'top', name: '무지 티셔츠', starter: true, defColor: '#3b6cf6', prices: { default: 0, blue: 6, red: 6, green: 6, yellow: 8 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 6, 3.4, c), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  topHood: { category: 'top', name: '후드티', starter: false, prices: { gray: 18, blue: 20, pink: 20, purple: 22 },
    boxes: (c) => [b(-3.3, 7, -1.8, 6.6, 6.2, 3.6, c), b(-5.3, 9, -1.3, 2.5, 4.5, 2.5, c), b(2.8, 9, -1.3, 2.5, 4.5, 2.5, c), b(-3, 12.5, -2, 6, 1.5, 1, c)] },
  topStripe: { category: 'top', name: '줄무늬 티', starter: false, prices: { red: 16, blue: 16, green: 16 },
    boxes: (c) => [b(-3.2, 7, -1.7, 6.4, 2, 3.4, c), b(-3.2, 10.5, -1.7, 6.4, 2, 3.4, c), b(-3.2, 9, -1.7, 6.4, 1.5, 3.4, '#f5f5f5'), b(-3.2, 12.5, -1.7, 6.4, 0.5, 3.4, '#f5f5f5'), b(-5.2, 11, -1.2, 2.4, 2.5, 2.4, c), b(2.8, 11, -1.2, 2.4, 2.5, 2.4, c)] },
  // 하의
  bottomPlain: { category: 'bottom', name: '기본 바지', starter: true, defColor: '#2b2b2b', prices: { default: 0, blue: 6, black: 6, brown: 8 },
    boxes: (c) => [b(-2.8, 0, -1.4, 2.6, 7.2, 2.8, c), b(0.2, 0, -1.4, 2.6, 7.2, 2.8, c)] },
  bottomSkirt: { category: 'bottom', name: '치마', starter: false, prices: { pink: 15, red: 15, purple: 18 },
    boxes: (c) => [b(-3.6, 5, -2, 7.2, 3, 4, c), b(-2.8, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5'), b(0.2, 0, -1.4, 2.6, 5, 2.8, '#f1c9a5')] },
  bottomShorts: { category: 'bottom', name: '반바지', starter: false, prices: { blue: 10, green: 10, yellow: 10 },
    boxes: (c) => [b(-2.8, 3.5, -1.5, 2.6, 3.7, 3, c), b(0.2, 3.5, -1.5, 2.6, 3.7, 3, c)] },
  // 신발
  shoesBasic: { category: 'shoes', name: '운동화', starter: true, defColor: '#f5f5f5', prices: { default: 0, white: 5, black: 5, red: 8 },
    boxes: (c) => [b(-2.9, 0, -1.6, 2.4, 1.6, 3, c), b(0.3, 0, -1.6, 2.4, 1.6, 3, c)] },
  // 머리 소품
  capCap: { category: 'headAcc', name: '모자', starter: false, prices: { blue: 15, red: 15, black: 15, green: 15 },
    boxes: (c) => [b(-3.4, 19.4, -3.4, 6.8, 1.6, 6.8, c), b(-3.4, 19.4, -5, 6.8, 1, 2, c)] },
  crown: { category: 'headAcc', name: '왕관', starter: false, prices: { yellow: 100, gold: 120 },
    boxes: () => [b(-3.4, 20, -3.4, 6.8, 1, 6.8, '#f1c40f'), b(-3, 21, -3, 1.2, 1.5, 1.2, '#f1c40f'), b(-0.6, 21, -0.6, 1.2, 1.8, 1.2, '#f1c40f'), b(1.8, 21, -3, 1.2, 1.5, 1.2, '#f1c40f'), b(-3, 21, 1.8, 1.2, 1.5, 1.2, '#f1c40f'), b(1.8, 21, 1.8, 1.2, 1.5, 1.2, '#f1c40f')] },
  // 얼굴 소품
  glasses: { category: 'faceAcc', name: '안경', starter: false, prices: { black: 12, brown: 12 },
    boxes: (c) => [b(-2.2, 16.2, -3.3, 1.6, 1.4, 0.4, c), b(0.6, 16.2, -3.3, 1.6, 1.4, 0.4, c), b(-0.6, 16.6, -3.3, 1.2, 0.3, 0.4, c)] },
  mask: { category: 'faceAcc', name: '마스크', starter: false, prices: { white: 8, blue: 10, black: 10 },
    boxes: (c) => [b(-2.4, 14, -3.3, 4.8, 2.4, 0.5, c)] },
};

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
