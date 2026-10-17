// 스마트보드: 반 전체 캐릭터를 3D로 한꺼번에 띄우고 천천히 돈다. 포인트 비공개.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { collection, getDocs, getDoc, doc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { auth, db } from '../common/firebase.js';
import { buildBoxes } from './catalog.js';

const root = document.getElementById('board');

function label(text, color, scale) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.strokeText(text, 128, 34); ctx.fillStyle = color; ctx.fillText(text, 128, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  sp.scale.set(scale, scale / 4, 1);
  return sp;
}

function titleName(p, titles) {
  const t = p.title; if (!t) return '';
  if (t.startsWith('award_')) return (p.awarded ?? [])[Number(t.split('_')[1])] ?? '';
  const [c, i] = t.split('_'); return titles?.[c]?.[Number(i)]?.name ?? '';
}

async function start() {
  await auth.authStateReady();
  if (!auth.currentUser) { root.innerHTML = '<p class="msg">선생님 화면에서 로그인한 뒤 이 화면을 열어 주세요.</p>'; return; }

  let students; let profiles; let settings;
  try {
    const [sSnap, pSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'profiles')),
      getDoc(doc(db, 'settings', 'main')),
    ]);
    students = sSnap.docs.map((d) => ({ sid: d.id, ...d.data() })).filter((s) => s.active).sort((a, b) => a.number - b.number);
    profiles = new Map(pSnap.docs.map((d) => [d.id, d.data()]));
    settings = cfgSnap.data() ?? {};
  } catch (e) {
    root.innerHTML = '<p class="msg">불러오지 못했어요. 선생님 계정으로 로그인했는지 확인해 주세요.</p>';
    return;
  }
  if (students.length === 0) { root.innerHTML = '<p class="msg">등록된 학생이 없어요.</p>'; return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  root.replaceChildren(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(20, 40, 30); scene.add(dl);

  const world = new THREE.Group();
  const cols = Math.ceil(Math.sqrt(students.length));
  const rows = Math.ceil(students.length / cols);
  const SP = 20;
  students.forEach((s, idx) => {
    const p = profiles.get(s.sid) ?? { equip: {} };
    const g = new THREE.Group();
    for (const bx of buildBoxes(p.equip ?? {})) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bx.w, bx.h, bx.d), new THREE.MeshLambertMaterial({ color: bx.color }));
      m.position.set(bx.x + bx.w / 2, bx.y + bx.h / 2, bx.z + bx.d / 2);
      g.add(m);
    }
    const col = idx % cols; const row = Math.floor(idx / cols);
    g.position.set((col - (cols - 1) / 2) * SP, 0, (row - (rows - 1) / 2) * -SP);
    g.add((() => { const l = label(s.name, '#ffffff', 14); l.position.set(0, -3, 0); return l; })());
    const tn = titleName(p, settings.titles);
    if (tn) { const l = label(tn, '#ffd54a', 12); l.position.set(0, 24, 0); g.add(l); }
    world.add(g);
  });
  scene.add(world);

  const spread = Math.max(cols, rows) * SP;
  camera.position.set(0, 24, spread * 1.2 + 34);
  camera.lookAt(0, 9, 0);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  function tick() {
    world.rotation.y += 0.004;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

start();
