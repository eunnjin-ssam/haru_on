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
  sp.scale.set(14, 3.5, 1); sp.position.set(0, 25, 0);
  return sp;
}

// container 안에 캐릭터를 그린다. { title, titleColor, rotate(자동회전) } 옵션.
// 반환: { dispose() }
export function renderCharacter3D(container, equip, opts = {}) {
  const w = container.clientWidth || 280;
  const hgt = container.clientHeight || 340;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / hgt, 0.1, 200);
  camera.position.set(0, 12, 46);
  camera.lookAt(0, 11, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, hgt);
  container.replaceChildren(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 15); scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-10, 5, -10); scene.add(dir2);

  const group = new THREE.Group();
  for (const bx of buildBoxes(equip)) {
    const geo = new THREE.BoxGeometry(bx.w, bx.h, bx.d);
    const mat = new THREE.MeshLambertMaterial({ color: bx.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx.x + bx.w / 2, bx.y + bx.h / 2, bx.z + bx.d / 2);
    group.add(mesh);
  }
  scene.add(group);

  let sprite = null;
  if (opts.title) { sprite = titleSprite(opts.title, opts.titleColor || '#ffffff'); group.add(sprite); }

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
