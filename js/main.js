import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  Position,
  RED,
  BLACK,
  MATE,
  moveFrom,
  moveTo,
  makeMove,
  rowOf,
  colOf,
  moveNotation,
} from './engine.js';

// ---------------------------------------------------------------------------
// Hằng số

const FONT = '"Noto Serif TC", "KaiTi", "STKaiti", "BiauKai", "SimSun", serif';
const CHARS = {
  [RED]: ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'],
  [BLACK]: ['', '將', '士', '象', '馬', '車', '砲', '卒'],
};

const BOARD_W = 10;
const BOARD_D = 11.4;
const BOARD_H = 0.5;
const TOP = BOARD_H; // mặt bàn cờ
const PIECE_R = 0.43;
const PIECE_H = 0.24;
const MOVE_MS = 420;
const MIN_AI_MS = 450; // máy đi quá nhanh trông thiếu tự nhiên
const NO_CAPTURE_DRAW = 120; // số nửa nước không ăn quân thì xử hòa

const $ = (id) => document.getElementById(id);
const sqX = (sq) => colOf(sq) - 4;
const sqZ = (sq) => rowOf(sq) - 4.5;

// ---------------------------------------------------------------------------
// Trạng thái ván cờ

const state = {
  pos: new Position(),
  history: [], // { move, captured, notation }
  human: RED,
  level: 'medium',
  legal: [],
  selected: -1,
  targets: [],
  locked: false, // đang chạy hiệu ứng
  thinking: false,
  over: false,
  gen: 0, // tăng mỗi khi ván mới / đi lại để bỏ qua kết quả cũ
  sound: true,
};

// ---------------------------------------------------------------------------
// Three.js

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
$('scene').appendChild(renderer.domElement);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a120d);
scene.fog = new THREE.Fog(0x1a120d, 35, 70);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, TOP, 0);

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1c12, 1.0));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.position.set(-7, 16, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xffc58a, 0.6);
rim.position.set(8, 6, -10);
scene.add(rim);

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function canvasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function woodGrain(g, w, h, base, grain, lines = 260) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) {
    g.strokeStyle = grain.replace('A', (Math.random() * 0.09 + 0.02).toFixed(3));
    g.lineWidth = Math.random() * 3 + 0.6;
    g.beginPath();
    let y = Math.random() * h;
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) {
      y += (Math.random() - 0.5) * 7;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

// Mặt bàn gỗ phía dưới
function buildTable() {
  const [cv, g] = makeCanvas(512, 512);
  woodGrain(g, 512, 512, '#4a2c18', 'rgba(20,10,4,A)', 180);
  const tex = canvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);
}

// Bàn cờ: khối gỗ + texture vẽ lưới bằng canvas
function buildBoard() {
  const U = 128;
  const [cv, g] = makeCanvas(BOARD_W * U, BOARD_D * U);
  woodGrain(g, cv.width, cv.height, '#e4bb7c', 'rgba(130,72,20,A)');
  const vg = g.createRadialGradient(cv.width / 2, cv.height / 2, U * 2, cv.width / 2, cv.height / 2, U * 7.5);
  vg.addColorStop(0, 'rgba(255,240,200,0.18)');
  vg.addColorStop(1, 'rgba(90,45,10,0.25)');
  g.fillStyle = vg;
  g.fillRect(0, 0, cv.width, cv.height);

  const X = (c) => (c + (BOARD_W - 8) / 2) * U;
  const Y = (r) => (r + (BOARD_D - 9) / 2) * U;
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  g.strokeStyle = '#3a200c';
  g.lineCap = 'round';

  g.lineWidth = 9;
  g.strokeRect(X(0) - 18, Y(0) - 18, 8 * U + 36, 9 * U + 36);
  g.lineWidth = 3.5;
  for (let r = 0; r <= 9; r++) line(X(0), Y(r), X(8), Y(r));
  for (let c = 0; c <= 8; c++) {
    if (c === 0 || c === 8) line(X(c), Y(0), X(c), Y(9));
    else {
      line(X(c), Y(0), X(c), Y(4));
      line(X(c), Y(5), X(c), Y(9));
    }
  }
  // Cung tướng
  line(X(3), Y(0), X(5), Y(2));
  line(X(5), Y(0), X(3), Y(2));
  line(X(3), Y(7), X(5), Y(9));
  line(X(5), Y(7), X(3), Y(9));

  // Dấu vị trí pháo, tốt
  g.lineWidth = 3;
  const mark = (r, c) => {
    const o = 9;
    const l = 24;
    for (const dx of [-1, 1]) {
      if (c + dx < 0 || c + dx > 8) continue;
      for (const dy of [-1, 1]) {
        g.beginPath();
        g.moveTo(X(c) + dx * (o + l), Y(r) + dy * o);
        g.lineTo(X(c) + dx * o, Y(r) + dy * o);
        g.lineTo(X(c) + dx * o, Y(r) + dy * (o + l));
        g.stroke();
      }
    }
  };
  for (const [r, c] of [[2, 1], [2, 7], [7, 1], [7, 7]]) mark(r, c);
  for (const r of [3, 6]) for (let c = 0; c <= 8; c += 2) mark(r, c);

  // Sông
  g.fillStyle = '#5b3313';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${U * 0.6}px ${FONT}`;
  g.fillText('楚  河', X(2), Y(4.5));
  g.fillText('漢  界', X(6), Y(4.5));

  // Số cột: Đen 1→9 (phía trên), Đỏ 一→九 tính từ phải sang (phía dưới)
  g.font = `700 ${U * 0.26}px ${FONT}`;
  const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  for (let c = 0; c <= 8; c++) {
    g.fillStyle = '#2a2a2a';
    g.fillText(String(c + 1), X(c), Y(-0.78));
    g.fillStyle = '#9b2318';
    g.fillText(cn[8 - c], X(c), Y(9.72));
  }

  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W, BOARD_D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(cv), roughness: 0.6 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = TOP + 0.001;
  top.receiveShadow = true;

  const [scv, sg] = makeCanvas(512, 64);
  woodGrain(sg, 512, 64, '#9c6232', 'rgba(60,25,5,A)', 60);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_D),
    new THREE.MeshStandardMaterial({ map: canvasTexture(scv), roughness: 0.7 }),
  );
  body.position.y = BOARD_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body, top);
}

// ---------------------------------------------------------------------------
// Quân cờ

const pieceGeometry = (() => {
  const bevel = 0.045;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, PIECE_R - bevel, 0, Math.PI * 2, false);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: PIECE_H - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 48,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
})();
const faceGeometry = new THREE.CircleGeometry(PIECE_R - 0.05, 48).rotateX(-Math.PI / 2);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c995, roughness: 0.55 });
const faceMaterials = new Map();

function faceMaterial(p) {
  if (faceMaterials.has(p)) return faceMaterials.get(p);
  const side = Math.sign(p);
  const S = 256;
  const [cv, g] = makeCanvas(S, S);
  const col = side === RED ? '#b3241a' : '#1c1c1c';
  const bg = g.createRadialGradient(S * 0.38, S * 0.32, S * 0.05, S / 2, S / 2, S * 0.55);
  bg.addColorStop(0, '#fff6df');
  bg.addColorStop(1, '#e0c18b');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = col;
  g.lineWidth = 9;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.41, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.35, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = col;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${S * 0.46}px ${FONT}`;
  g.fillText(CHARS[side][Math.abs(p)], S / 2, S / 2 + S * 0.02);
  const mat = new THREE.MeshStandardMaterial({ map: canvasTexture(cv), roughness: 0.45 });
  faceMaterials.set(p, mat);
  return mat;
}

const pieceRoot = new THREE.Group();
const graveRoot = new THREE.Group();
scene.add(pieceRoot, graveRoot);
let meshes = new Array(90).fill(null);
const graveCount = { [RED]: 0, [BLACK]: 0 };

function createPiece(p) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(pieceGeometry, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  const face = new THREE.Mesh(faceGeometry, faceMaterial(p));
  face.position.y = PIECE_H + 0.002;
  face.receiveShadow = true;
  group.add(body, face);
  group.rotation.y = state.human === BLACK ? Math.PI : 0;
  group.userData = { piece: p, lift: 0, anim: false };
  return group;
}

function gravePosition(side) {
  const k = graveCount[side]++;
  const dir = side === BLACK ? 1 : -1;
  const z = -3.6 + Math.floor(k / 2) * 0.95;
  return new THREE.Vector3(dir * (5.9 + (k % 2) * 0.95), 0, state.human === BLACK ? -z : z);
}

function rebuildPieces() {
  pieceRoot.clear();
  graveRoot.clear();
  meshes = new Array(90).fill(null);
  graveCount[RED] = graveCount[BLACK] = 0;
  const b = state.pos.board;
  for (let sq = 0; sq < 90; sq++) {
    if (!b[sq]) continue;
    const m = createPiece(b[sq]);
    m.position.set(sqX(sq), TOP, sqZ(sq));
    m.userData.sq = sq;
    pieceRoot.add(m);
    meshes[sq] = m;
  }
  for (const h of state.history) {
    if (!h.captured) continue;
    const m = createPiece(h.captured);
    m.position.copy(gravePosition(Math.sign(h.captured)));
    graveRoot.add(m);
  }
}

// ---------------------------------------------------------------------------
// Đánh dấu: nước đi hợp lệ, quân đang chọn, nước vừa đi, chiếu tướng, gợi ý

const markerRoot = new THREE.Group();
scene.add(markerRoot);
const dotGeo = new THREE.CircleGeometry(0.14, 32).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.47, 0.55, 48).rotateX(-Math.PI / 2);
const checkGeo = new THREE.RingGeometry(0.5, 0.66, 48).rotateX(-Math.PI / 2);
const flatMat = (color, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const MAT = {
  move: flatMat(0x27c46b),
  capture: flatMat(0xff4d2e),
  select: flatMat(0x35d0ff),
  last: flatMat(0xffb22e, 0.75),
  check: flatMat(0xff1f1f),
  hint: flatMat(0x5b7cff),
};

function marker(geo, mat, sq, y = 0.012) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(sqX(sq), TOP + y, sqZ(sq));
  m.renderOrder = 2;
  return m;
}

const layers = { targets: [], select: [], last: [], check: [], hint: [] };
function setLayer(name, items) {
  for (const m of layers[name]) markerRoot.remove(m);
  layers[name] = items;
  for (const m of items) markerRoot.add(m);
}

function showTargets() {
  const b = state.pos.board;
  setLayer(
    'targets',
    state.targets.map((sq) => (b[sq] ? marker(ringGeo, MAT.capture, sq) : marker(dotGeo, MAT.move, sq))),
  );
  setLayer('select', state.selected >= 0 ? [marker(ringGeo, MAT.select, state.selected)] : []);
}

function showLastMove() {
  const h = state.history[state.history.length - 1];
  if (!h) return setLayer('last', []);
  const from = moveFrom(h.move);
  const to = moveTo(h.move);
  setLayer('last', [marker(dotGeo, MAT.last, from), marker(ringGeo, MAT.last, to, 0.008)]);
}

function showCheck() {
  const pos = state.pos;
  if (!pos.inCheck(pos.side)) return setLayer('check', []);
  const k = pos.findKing(pos.side);
  setLayer('check', [marker(checkGeo, MAT.check, k, 0.014)]);
}

// ---------------------------------------------------------------------------
// Hiệu ứng chuyển động

const tweens = new Set();
function tween(duration, onUpdate, delay = 0) {
  return new Promise((resolve) => {
    tweens.add({ start: performance.now() + delay, duration, onUpdate, resolve });
  });
}
function runTweens(now) {
  for (const tw of tweens) {
    if (now < tw.start) continue;
    const t = Math.min(1, (now - tw.start) / tw.duration);
    tw.onUpdate(t);
    if (t >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function arcTo(mesh, target, duration, height, delay = 0) {
  const start = mesh.position.clone();
  mesh.userData.anim = true;
  return tween(
    duration,
    (t) => {
      const e = easeInOut(t);
      mesh.position.lerpVectors(start, target, e);
      mesh.position.y += Math.sin(Math.PI * e) * height;
      if (t >= 1) mesh.userData.anim = false;
    },
    delay,
  );
}

// ---------------------------------------------------------------------------
// Âm thanh tiếng quân gỗ (tổng hợp bằng WebAudio, không cần file)

let audio = null;
function clack(strong = false) {
  if (!state.sound) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const len = 0.09;
    const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = strong ? 1200 : 1900;
    bp.Q.value = 1.4;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(strong ? 1.0 : 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(bp).connect(gain).connect(audio.destination);
    src.start(t);
    const osc = audio.createOscillator();
    osc.frequency.setValueAtTime(strong ? 160 : 220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    const og = audio.createGain();
    og.gain.setValueAtTime(strong ? 0.5 : 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {
    // Trình duyệt không hỗ trợ âm thanh: bỏ qua
  }
}

// ---------------------------------------------------------------------------
// AI chạy trong Web Worker

let worker = null;
let aiToken = 0;
let aiStart = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onWorkerMessage;
    worker.onerror = (e) => {
      console.error(e);
      setStatus('Lỗi khi chạy AI', 'over');
    };
  }
  return worker;
}

function cancelAI() {
  aiToken++;
  if (worker && state.thinking) {
    worker.terminate();
    worker = null;
  }
  state.thinking = false;
}

function requestAI(purpose) {
  const pos = state.pos;
  state.thinking = true;
  aiStart = performance.now();
  getWorker().postMessage({
    token: ++aiToken,
    purpose,
    board: Array.from(pos.board),
    side: pos.side,
    lo: pos.loStack,
    hi: pos.hiStack,
    level: purpose === 'hint' ? 'medium' : state.level,
  });
  updateUI();
}

async function onWorkerMessage(e) {
  const res = e.data;
  if (res.token !== aiToken) return;
  state.thinking = false;
  if (res.purpose === 'hint') {
    if (res.move) {
      setLayer('hint', [marker(ringGeo, MAT.hint, moveFrom(res.move)), marker(dotGeo, MAT.hint, moveTo(res.move))]);
      $('ai-info').textContent = `Gợi ý: ${moveNotation(state.pos.board, res.move)}`;
    }
    updateUI();
    return;
  }
  showAiInfo(res);
  const wait = MIN_AI_MS - (performance.now() - aiStart);
  if (wait > 0) {
    const token = aiToken;
    await new Promise((r) => setTimeout(r, wait));
    if (token !== aiToken) return;
  }
  if (res.move) playMove(res.move);
}

function showAiInfo(res) {
  let evalText;
  if (Math.abs(res.score) > MATE - 500) {
    const plies = MATE - Math.abs(res.score);
    const moves = Math.ceil(plies / 2);
    evalText = res.score > 0 ? `máy thấy chiếu bí sau ${moves} nước` : `bạn có thể chiếu bí sau ${moves} nước`;
  } else {
    const v = -res.score / 100; // đổi sang góc nhìn người chơi
    evalText = `ưu thế của bạn ${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  }
  $('ai-info').textContent = `Máy: độ sâu ${res.depth} · ${(res.nodes / 1000).toFixed(0)}k thế · ${evalText}`;
}

// ---------------------------------------------------------------------------
// Luồng ván cờ

async function playMove(m) {
  const pos = state.pos;
  const gen = state.gen;
  const from = moveFrom(m);
  const to = moveTo(m);
  const captured = pos.board[to];
  const notation = moveNotation(pos.board, m);

  state.locked = true;
  clearSelection();
  setLayer('hint', []);
  setLayer('check', []);

  const mesh = meshes[from];
  const capMesh = meshes[to];
  pos.make(m);
  state.history.push({ move: m, captured, notation });
  meshes[to] = mesh;
  meshes[from] = null;
  mesh.userData.sq = to;
  mesh.userData.lift = 0;
  showLastMove();
  renderMoveList();
  updateUI();

  const anims = [arcTo(mesh, new THREE.Vector3(sqX(to), TOP, sqZ(to)), MOVE_MS, 0.9)];
  if (capMesh) {
    pieceRoot.remove(capMesh);
    graveRoot.add(capMesh);
    anims.push(arcTo(capMesh, gravePosition(Math.sign(captured)), 520, 1.6, MOVE_MS * 0.8));
  }
  await anims[0];
  clack(!!captured);
  await Promise.all(anims);
  if (gen !== state.gen) return;
  state.locked = false;
  afterMove();
}

function afterMove() {
  const pos = state.pos;
  state.legal = pos.legalMoves();
  showCheck();

  if (state.legal.length === 0) {
    const loser = pos.side;
    const mated = pos.inCheck(loser);
    endGame(loser === state.human ? 'lose' : 'win', mated ? 'Chiếu bí!' : 'Hết nước đi (bị vây khốn).');
    return;
  }
  if (pos.repetitionCount() >= 3) {
    endGame('draw', 'Thế cờ lặp lại 3 lần.');
    return;
  }
  let quiet = 0;
  for (let i = state.history.length - 1; i >= 0 && !state.history[i].captured; i--) quiet++;
  if (quiet >= NO_CAPTURE_DRAW) {
    endGame('draw', `${NO_CAPTURE_DRAW / 2} nước liên tiếp không ăn quân.`);
    return;
  }
  if (pos.side !== state.human) requestAI('move');
  updateUI();
}

function endGame(result, reason) {
  state.over = true;
  updateUI();
  const titles = { win: 'Bạn thắng! 🎉', lose: 'Máy thắng', draw: 'Hòa cờ' };
  $('modal-title').textContent = titles[result];
  $('modal-text').textContent = reason;
  $('modal').dataset.result = result;
  setTimeout(() => $('modal').classList.remove('hidden'), 500);
}

function newGame() {
  cancelAI();
  state.gen++;
  state.pos = new Position();
  state.history = [];
  state.over = false;
  state.locked = false;
  state.human = Number($('side').value);
  clearSelection();
  for (const k of Object.keys(layers)) setLayer(k, []);
  $('modal').classList.add('hidden');
  $('ai-info').textContent = '';
  document.body.classList.remove('panel-open');
  rebuildPieces();
  renderMoveList();
  cameraHome(true);
  afterMove();
}

function undo() {
  if (state.locked || !state.history.length) return;
  cancelAI();
  state.gen++;
  const pos = state.pos;
  // Lùi cho tới khi đến lượt người chơi (thường là 2 nửa nước)
  do {
    pos.unmake();
    state.history.pop();
  } while (state.history.length && pos.side !== state.human);
  state.over = false;
  clearSelection();
  setLayer('hint', []);
  $('modal').classList.add('hidden');
  $('ai-info').textContent = '';
  rebuildPieces();
  showLastMove();
  renderMoveList();
  afterMove();
}

function hint() {
  if (state.locked || state.over || state.thinking || state.pos.side !== state.human) return;
  $('ai-info').textContent = 'Đang tìm gợi ý…';
  requestAI('hint');
}

// ---------------------------------------------------------------------------
// Chọn quân và đi quân bằng chuột / cảm ứng

function clearSelection() {
  if (state.selected >= 0 && meshes[state.selected]) meshes[state.selected].userData.lift = 0;
  state.selected = -1;
  state.targets = [];
  showTargets();
}

function select(sq) {
  clearSelection();
  state.selected = sq;
  state.targets = state.legal.filter((m) => moveFrom(m) === sq).map(moveTo);
  meshes[sq].userData.lift = 1;
  showTargets();
}

function onSquareClick(sq) {
  if (state.over || state.locked || state.thinking || state.pos.side !== state.human) return;
  if (sq >= 0 && state.selected >= 0 && state.targets.includes(sq)) {
    playMove(makeMove(state.selected, sq));
    return;
  }
  const p = sq >= 0 ? state.pos.board[sq] : 0;
  if (p && Math.sign(p) === state.human && sq !== state.selected) {
    select(sq);
    clack();
  } else {
    clearSelection();
  }
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);

function pickSquare(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pieceRoot.children, true)[0];
  if (hit) {
    let o = hit.object;
    while (o && o.userData.sq === undefined) o = o.parent;
    if (o) return o.userData.sq;
  }
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(boardPlane, p)) return -1;
  const c = Math.round(p.x + 4);
  const r = Math.round(p.z + 4.5);
  if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
  if (Math.hypot(p.x - (c - 4), p.z - (r - 4.5)) > 0.5) return -1;
  return r * 9 + c;
}

let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved < 8) onSquareClick(pickSquare(e)); // kéo xoay camera thì không tính là bấm
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (downAt || state.locked || state.over || state.pos.side !== state.human) {
    renderer.domElement.style.cursor = '';
    return;
  }
  const sq = pickSquare(e);
  const own = sq >= 0 && Math.sign(state.pos.board[sq]) === state.human;
  renderer.domElement.style.cursor = own || state.targets.includes(sq) ? 'pointer' : '';
});

// ---------------------------------------------------------------------------
// Camera

function homePosition() {
  const panelW = window.innerWidth > 760 ? document.querySelector('.panel').offsetWidth + 18 : 0;
  const aspect = (window.innerWidth - panelW) / window.innerHeight;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const portrait = aspect < 1;
  const needW = portrait ? 10.5 : 15.5;
  const needD = portrait ? 11.5 : 12.5;
  const dist = Math.max(needW / 2 / Math.tan(hfov / 2), needD / 2 / Math.tan(vfov / 2)) * 1.05;
  const elev = THREE.MathUtils.degToRad(portrait ? 66 : 56);
  const dir = state.human === BLACK ? -1 : 1;
  return new THREE.Vector3(0, TOP + dist * Math.sin(elev), dir * dist * Math.cos(elev));
}

function cameraHome(animated) {
  const target = homePosition();
  if (!animated) {
    camera.position.copy(target);
    return;
  }
  const start = camera.position.clone();
  // Đi vòng qua phía trên để không xuyên qua bàn cờ khi đổi phe
  tween(900, (t) => {
    const e = easeInOut(t);
    camera.position.lerpVectors(start, target, e);
    camera.position.y += Math.sin(Math.PI * e) * (start.z * target.z < 0 ? 8 : 0);
  });
}

// Trên màn hình rộng, dịch khung nhìn sang trái để bàn cờ không bị bảng điều khiển che.
function updateViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  const panel = document.querySelector('.panel');
  if (w > 760 && panel) camera.setViewOffset(w, h, (panel.offsetWidth + 18) / 2, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', () => {
  updateViewport();
  cameraHome(false);
});

// ---------------------------------------------------------------------------
// Giao diện HTML

function setStatus(text, kind) {
  $('status-text').textContent = text;
  $('status').dataset.kind = kind;
}

function updateUI() {
  const pos = state.pos;
  const sideName = (s) => (s === RED ? 'Đỏ' : 'Đen');
  if (state.over) {
    setStatus('Ván cờ đã kết thúc', 'over');
  } else if (pos.side === state.human) {
    const check = pos.inCheck(pos.side) ? ' — Bị chiếu tướng!' : '';
    setStatus(`Lượt của bạn (${sideName(state.human)})${check}`, check ? 'check' : 'you');
  } else {
    setStatus(`Máy đang suy nghĩ…`, 'ai');
  }
  $('status').dataset.side = pos.side === RED ? 'red' : 'black';
  $('btn-undo').disabled = state.locked || !state.history.length;
  $('btn-hint').disabled = state.locked || state.over || state.thinking || pos.side !== state.human;
  $('btn-sound').textContent = state.sound ? '🔊' : '🔇';
}

function renderMoveList() {
  const list = $('moves');
  list.innerHTML = '';
  const h = state.history;
  for (let i = 0; i < h.length; i += 2) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.className = 'red';
    a.textContent = h[i].notation;
    li.append(a);
    if (h[i + 1]) {
      const b = document.createElement('span');
      b.className = 'black';
      b.textContent = h[i + 1].notation;
      li.append(b);
    }
    list.append(li);
  }
  list.scrollTop = list.scrollHeight;
}

$('btn-new').addEventListener('click', newGame);
$('modal-new').addEventListener('click', newGame);
$('modal-close').addEventListener('click', () => $('modal').classList.add('hidden'));
$('btn-undo').addEventListener('click', undo);
$('btn-hint').addEventListener('click', hint);
$('btn-view').addEventListener('click', () => cameraHome(true));
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  updateUI();
});
$('btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));
$('level').addEventListener('change', (e) => {
  state.level = e.target.value;
  try {
    localStorage.setItem('xq-level', state.level);
  } catch {
    // localStorage có thể bị chặn
  }
});
$('side').addEventListener('change', (e) => {
  try {
    localStorage.setItem('xq-side', e.target.value);
  } catch {
    // localStorage có thể bị chặn
  }
  newGame();
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') clearSelection();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

// ---------------------------------------------------------------------------
// Khởi động

function restorePrefs() {
  try {
    const lv = localStorage.getItem('xq-level');
    const sd = localStorage.getItem('xq-side');
    if (lv) $('level').value = lv;
    if (sd) $('side').value = sd;
  } catch {
    // bỏ qua
  }
  state.level = $('level').value;
  state.human = Number($('side').value);
}

async function loadFonts() {
  try {
    await Promise.race([
      document.fonts.load(`700 64px "Noto Serif TC"`, '帥將楚河'),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    // dùng font hệ thống
  }
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  runTweens(now);
  // Nhấc quân đang chọn lên
  for (const m of pieceRoot.children) {
    if (m.userData.anim) continue;
    const y = TOP + m.userData.lift * 0.35;
    m.position.y += (y - m.position.y) * Math.min(1, dt * 14);
  }
  // Nhịp đập của vòng chiếu tướng / gợi ý
  const pulse = 0.5 + 0.5 * Math.sin(now / 160);
  MAT.check.opacity = 0.45 + 0.5 * pulse;
  MAT.hint.opacity = 0.5 + 0.4 * pulse;
  controls.update();
  renderer.render(scene, camera);
}

restorePrefs();
updateViewport();
await loadFonts();
buildTable();
buildBoard();
rebuildPieces();
cameraHome(false);
renderer.setAnimationLoop(frame);
$('loading').classList.add('hidden');
afterMove();
