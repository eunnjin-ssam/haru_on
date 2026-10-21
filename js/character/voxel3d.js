// 복셀 캐릭터 3D 보기(three.js). 밀어서 360도 회전. 머리 위에 칭호(항상 정면).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildBoxes } from './catalog.js';

function titleSprite(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.strokeText(text, 128, 34); ctx.fillStyle = color; ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(12, 3, 1); sp.position.set(0, 29.6, 0); // 가장 높은 소품(고양이 귀 26.3)보다 넉넉히 위
  return sp;
}

// container 안에 캐릭터를 그린다. { title, titleColor, rotate(자동회전) } 옵션.
// 반환: { dispose() }
export function renderCharacter3D(container, equip, opts = {}) {
  const w = container.clientWidth || 280;
  const hgt = container.clientHeight || 340;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / hgt, 0.1, 200);
  // 발끝(0)부터 칭호 위(31.1)까지 들어오고, 발 아래·칭호 위에 여백이 조금 남게
  // (보이는 높이 ≈ 15.5 ± 17.5 → 약 -2 ~ 33)
  camera.position.set(0, 17, 61);
  camera.lookAt(0, 15.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, hgt);
  container.replaceChildren(renderer.domElement);

  // three.js 0.155부터 빛 세기 단위가 바뀌어(π로 나눔) 예전 값이면 모든 색이 칙칙해진다.
  // 앞면이 원래 색에 가깝게 보이도록 π를 곱한다.
  scene.add(new THREE.AmbientLight(0xffffff, 0.7 * Math.PI));
  const dir = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
  dir.position.set(10, 20, 15); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.25 * Math.PI);
  dir2.position.set(-10, 5, -10); scene.add(dir2);

  const group = new THREE.Group();
  // 얼굴(−z)이 카메라(+z)를 향하도록 처음부터 앞모습으로 돌려 둔다.
  group.rotation.y = Math.PI;
  scene.add(group);

  // 입은 모습을 새로 그린다(회전 방향은 그대로 유지 → 색만 바꿔도 안 튄다).
  function fill(eq, op) {
    for (const c of [...group.children]) {
      group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
    }
    for (const bx of buildBoxes(eq)) {
      const geo = new THREE.BoxGeometry(bx.w, bx.h, bx.d);
      const mat = new THREE.MeshLambertMaterial({ color: bx.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx.x + bx.w / 2, bx.y + bx.h / 2, bx.z + bx.d / 2);
      group.add(mesh);
    }
    if (op?.title) group.add(titleSprite(op.title, op.titleColor || '#ffffff'));
  }
  fill(equip, opts);

  // 밀어서 회전
  let dragging = false; let lastX = 0; let vel = 0;
  const onDown = (e) => { dragging = true; lastX = (e.touches ? e.touches[0].clientX : e.clientX); vel = 0; };
  const onMove = (e) => {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    vel = (x - lastX) * 0.01; group.rotation.y += vel; lastX = x;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => { dragging = false; };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  renderer.domElement.style.touchAction = 'pan-y';

  let raf;
  function tick() {
    if (!dragging) {
      if (opts.rotate) group.rotation.y += 0.01;
      else { group.rotation.y += vel; vel *= 0.92; if (Math.abs(vel) < 0.0003) vel = 0; }
    }
    renderer.render(scene, camera); // 칭호 스프라이트는 항상 카메라를 향한다

    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    update(newEquip, newOpts) { fill(newEquip, newOpts ?? opts); },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };
}
