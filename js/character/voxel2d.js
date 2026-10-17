// 복셀 캐릭터 정면 그림(2D). 우리 반 격자처럼 여러 개를 가볍게 그릴 때 쓴다(WebGL 없이).
import { buildBoxes } from './catalog.js';

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
  // 월드 x[-6,6] y[0,23] → 캔버스
  const scale = Math.min(W / 13, H / 25);
  const ox = W / 2;
  const oy = H - (H - 23 * scale) / 2;
  const tx = (x) => ox + x * scale;
  const ty = (y) => oy - y * scale;

  const boxes = buildBoxes(equip).slice().sort((a, b2) => (b2.z + b2.d) - (a.z + a.d));
  for (const bx of boxes) {
    const x = tx(bx.x); const y = ty(bx.y + bx.h);
    const w = bx.w * scale; const hh = bx.h * scale;
    ctx.fillStyle = bx.color;
    ctx.fillRect(x, y, w, hh);
    ctx.fillStyle = shade(bx.color, 0.82);
    ctx.fillRect(x, y, w, Math.max(1, scale * 0.25)); // 윗면 살짝
  }
}
