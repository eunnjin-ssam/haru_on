// 복셀 캐릭터 정면 그림(2D). 우리 반 격자처럼 여러 개를 가볍게 그릴 때 쓴다(WebGL 없이).
import { buildBoxes, CATALOG, colorHex, BODY } from './catalog.js';

const HEAD = BODY[6]; // 얼굴 아이템 아이콘은 머리 위에 그린다

// 색을 살짝 어둡게 (옆면 음영 느낌)
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const bl = Math.round((n & 255) * f);
  return `rgb(${r},${g},${bl})`;
}

export function drawFront(canvas, equip) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // 월드 x[-7.3,6.7] y[0,27] → 캔버스 (머리 위 소품, 왼발 옆 펫까지 들어오게. 펫 쪽으로 조금 넓힘)
  const scale = Math.min(W / 14.6, H / 28);
  const ox = W / 2 + 0.3 * scale;
  const oy = H - (H - 27 * scale) / 2;
  const tx = (x) => ox + x * scale;
  const ty = (y) => oy - y * scale;

  // 앞면(작은 z)이 위에 오도록 뒤→앞 순서로 그린다(옷이 몸 위에 보이게).
  const boxes = buildBoxes(equip).slice().sort((a, b2) => b2.z - a.z);
  for (const bx of boxes) {
    const x = tx(bx.x); const y = ty(bx.y + bx.h);
    const w = bx.w * scale; const hh = bx.h * scale;
    ctx.fillStyle = bx.color;
    ctx.fillRect(x, y, w, hh);
    ctx.fillStyle = shade(bx.color, 0.82);
    ctx.fillRect(x, y, w, Math.max(1, scale * 0.25)); // 윗면 살짝
  }
}

// 아이템 하나만 그린다(아바타 없이). 상점 카드 아이콘용.
export function drawItem(canvas, item, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const it = CATALOG[item];
  if (!it) return;
  const hex = (color === 'default' && it.defColor) ? it.defColor : colorHex(color);
  let boxes = it.boxes(hex);
  // 얼굴·얼굴소품은 머리 위에 올려야 아이콘이 얼굴처럼 보인다
  if (it.category === 'face' || it.category === 'faceAcc') boxes = [HEAD, ...boxes];
  // 얼굴 색은 모양이 없으니 그 색 얼굴(웃는 눈)로 보여 준다
  if (it.category === 'skin') boxes = [{ ...HEAD, color: it.tone }, ...CATALOG.faceSmile.boxes()];
  if (!boxes.length) return;

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
    minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
  }
  const bw = (maxX - minX) || 1; const bh = (maxY - minY) || 1;
  const pad = 0.16;
  const scale = Math.min((W * (1 - pad * 2)) / bw, (H * (1 - pad * 2)) / bh);
  const leftM = (W - bw * scale) / 2; const topM = (H - bh * scale) / 2;
  const tx = (x) => leftM + (x - minX) * scale;
  const ty = (y) => topM + (maxY - y) * scale;

  const sorted = boxes.slice().sort((a, b2) => b2.z - a.z);
  for (const bx of sorted) {
    const x = tx(bx.x); const y = ty(bx.y + bx.h);
    const w = bx.w * scale; const hh = bx.h * scale;
    ctx.fillStyle = bx.color;
    ctx.fillRect(x, y, w, hh);
    ctx.fillStyle = shade(bx.color, 0.82);
    ctx.fillRect(x, y, w, Math.max(1, scale * 0.22));
  }
}
