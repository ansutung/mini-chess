// Cờ tướng (Xiangqi) engine: luật đi quân + AI tìm kiếm alpha-beta.
//
// Bàn cờ là mảng 90 ô, chỉ số = hàng * 9 + cột.
// Hàng 0 ở phía trên (quân Đen), hàng 9 ở phía dưới (quân Đỏ).
// Quân Đỏ là số dương, quân Đen là số âm.

export const EMPTY = 0;
export const KING = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const CHARIOT = 5;
export const CANNON = 6;
export const PAWN = 7;

export const RED = 1;
export const BLACK = -1;

export const MATE = 30000;
const MATE_BOUND = MATE - 500;
const MAX_PLY = 96;

export const rowOf = (sq) => (sq / 9) | 0;
export const colOf = (sq) => sq % 9;
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => m >> 7;
export const makeMove = (from, to) => from | (to << 7);

export function initialBoard() {
  const b = new Int8Array(90);
  const back = [CHARIOT, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, CHARIOT];
  for (let c = 0; c < 9; c++) {
    b[c] = -back[c];
    b[81 + c] = back[c];
  }
  b[2 * 9 + 1] = b[2 * 9 + 7] = -CANNON;
  b[7 * 9 + 1] = b[7 * 9 + 7] = CANNON;
  for (let c = 0; c < 9; c += 2) {
    b[3 * 9 + c] = -PAWN;
    b[6 * 9 + c] = PAWN;
  }
  return b;
}

// ---------------------------------------------------------------------------
// Đánh giá thế cờ: giá trị quân + bảng vị trí (nhìn từ phía Đỏ, hàng 0 = đất địch)

const VALUE = [0, 0, 120, 120, 400, 900, 450, 100];

const ZERO_PST = new Array(90).fill(0);

// prettier-ignore
const KING_PST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, -12, -10, -12, 0, 0, 0,
  0, 0, 0, -6, -4, -6, 0, 0, 0,
  0, 0, 0, 2, 6, 2, 0, 0, 0,
];

// prettier-ignore
const ADVISOR_PST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, -2, 0, -2, 0, 0, 0,
  0, 0, 0, 0, 6, 0, 0, 0, 0,
  0, 0, 0, 2, 0, 2, 0, 0, 0,
];

// prettier-ignore
const ELEPHANT_PST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, -2, 0, 0, 0, -2, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  -4, 0, 0, 0, 8, 0, 0, 0, -4,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 2, 0, 0, 0, 2, 0, 0,
];

// prettier-ignore
const HORSE_PST = [
  4, 8, 16, 12, 4, 12, 16, 8, 4,
  4, 10, 28, 16, 8, 16, 28, 10, 4,
  12, 14, 16, 20, 18, 20, 16, 14, 12,
  8, 24, 18, 24, 20, 24, 18, 24, 8,
  6, 16, 14, 18, 16, 18, 14, 16, 6,
  4, 12, 16, 14, 12, 14, 16, 12, 4,
  2, 6, 8, 6, 10, 6, 8, 6, 2,
  4, 2, 8, 8, 4, 8, 8, 2, 4,
  0, 2, 4, 4, -2, 4, 4, 2, 0,
  0, -4, 0, 0, 0, 0, 0, -4, 0,
];

// prettier-ignore
const CHARIOT_PST = [
  14, 14, 12, 18, 16, 18, 12, 14, 14,
  16, 20, 18, 24, 26, 24, 18, 20, 16,
  12, 12, 12, 18, 18, 18, 12, 12, 12,
  12, 18, 16, 22, 22, 22, 16, 18, 12,
  12, 14, 12, 18, 18, 18, 12, 14, 12,
  12, 16, 14, 20, 20, 20, 14, 16, 12,
  6, 10, 8, 14, 14, 14, 8, 10, 6,
  4, 8, 6, 14, 12, 14, 6, 8, 4,
  8, 4, 8, 16, 8, 16, 8, 4, 8,
  -2, 10, 6, 14, 12, 14, 6, 10, -2,
];

// prettier-ignore
const CANNON_PST = [
  6, 4, 0, -10, -12, -10, 0, 4, 6,
  2, 2, 0, -4, -14, -4, 0, 2, 2,
  2, 2, 0, -10, -8, -10, 0, 2, 2,
  0, 0, -2, 4, 10, 4, -2, 0, 0,
  0, 0, 0, 2, 8, 2, 0, 0, 0,
  -2, 0, 4, 2, 6, 2, 4, 0, -2,
  0, 0, 0, 2, 4, 2, 0, 0, 0,
  4, 0, 8, 6, 10, 6, 8, 0, 4,
  0, 2, 4, 6, 6, 6, 4, 2, 0,
  0, 0, 2, 6, 6, 6, 2, 0, 0,
];

// prettier-ignore
const PAWN_PST = [
  0, 0, 0, 2, 4, 2, 0, 0, 0,
  20, 30, 50, 65, 70, 65, 50, 30, 20,
  20, 30, 45, 55, 55, 55, 45, 30, 20,
  20, 27, 30, 40, 42, 40, 30, 27, 20,
  10, 18, 22, 35, 40, 35, 22, 18, 10,
  3, 0, 4, 0, 7, 0, 4, 0, 3,
  -2, 0, -2, 0, 6, 0, -2, 0, -2,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

const PST = [ZERO_PST, KING_PST, ADVISOR_PST, ELEPHANT_PST, HORSE_PST, CHARIOT_PST, CANNON_PST, PAWN_PST];

// PVT[(piece + 7) * 90 + sq] = giá trị của quân tại ô, tính theo góc nhìn Đỏ.
const PVT = new Int32Array(15 * 90);
for (let p = -7; p <= 7; p++) {
  if (p === 0) continue;
  for (let sq = 0; sq < 90; sq++) {
    const t = Math.abs(p);
    const mirror = (9 - rowOf(sq)) * 9 + colOf(sq);
    PVT[(p + 7) * 90 + sq] = p > 0 ? VALUE[t] + PST[t][sq] : -(VALUE[t] + PST[t][mirror]);
  }
}

// ---------------------------------------------------------------------------
// Zobrist hashing (64 bit = 2 số 32 bit). Dùng PRNG có seed cố định để
// luồng chính và Web Worker tính ra cùng một giá trị hash.

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}

const rand = mulberry32(0x9e3779b9);
const ZLO = new Int32Array(15 * 90);
const ZHI = new Int32Array(15 * 90);
for (let i = 0; i < ZLO.length; i++) {
  ZLO[i] = rand();
  ZHI[i] = rand();
}
const ZSIDE_LO = rand();
const ZSIDE_HI = rand();

// ---------------------------------------------------------------------------

const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
// [dr, dc, chân mã dr, chân mã dc]
const HORSE_D = [
  [-2, -1, -1, 0],
  [-2, 1, -1, 0],
  [2, -1, 1, 0],
  [2, 1, 1, 0],
  [-1, -2, 0, -1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [1, 2, 0, 1],
];

const inPalace = (side, r, c) => c >= 3 && c <= 5 && (side > 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);

export class Position {
  constructor(board = initialBoard(), side = RED) {
    this.board = Int8Array.from(board);
    this.side = side;
    this.moveStack = [];
    this.capStack = [];
    // Hash của các thế cờ trước mỗi nước đi, dùng để phát hiện lặp lại.
    this.loStack = [];
    this.hiStack = [];
    this.scoreStack = [];
    this.nullMarks = []; // vị trí trong loStack của các nước bỏ lượt (null-move)
    this.recompute();
  }

  recompute() {
    let lo = 0;
    let hi = 0;
    let score = 0;
    for (let sq = 0; sq < 90; sq++) {
      const p = this.board[sq];
      if (!p) continue;
      const i = (p + 7) * 90 + sq;
      lo ^= ZLO[i];
      hi ^= ZHI[i];
      score += PVT[i];
    }
    if (this.side === BLACK) {
      lo ^= ZSIDE_LO;
      hi ^= ZSIDE_HI;
    }
    this.hashLo = lo;
    this.hashHi = hi;
    this.score = score; // theo góc nhìn Đỏ
  }

  make(m) {
    const from = m & 127;
    const to = m >> 7;
    const b = this.board;
    const p = b[from];
    const q = b[to];
    this.moveStack.push(m);
    this.capStack.push(q);
    this.loStack.push(this.hashLo);
    this.hiStack.push(this.hashHi);
    this.scoreStack.push(this.score);
    const pi = (p + 7) * 90;
    this.hashLo ^= ZLO[pi + from] ^ ZLO[pi + to] ^ ZSIDE_LO;
    this.hashHi ^= ZHI[pi + from] ^ ZHI[pi + to] ^ ZSIDE_HI;
    this.score += PVT[pi + to] - PVT[pi + from];
    if (q) {
      const qi = (q + 7) * 90 + to;
      this.hashLo ^= ZLO[qi];
      this.hashHi ^= ZHI[qi];
      this.score -= PVT[qi];
    }
    b[to] = p;
    b[from] = 0;
    this.side = -this.side;
  }

  unmake() {
    const m = this.moveStack.pop();
    const q = this.capStack.pop();
    const from = m & 127;
    const to = m >> 7;
    this.board[from] = this.board[to];
    this.board[to] = q;
    this.hashLo = this.loStack.pop();
    this.hashHi = this.hiStack.pop();
    this.score = this.scoreStack.pop();
    this.side = -this.side;
  }

  makeNull() {
    this.nullMarks.push(this.loStack.length);
    this.loStack.push(this.hashLo);
    this.hiStack.push(this.hashHi);
    this.scoreStack.push(this.score);
    this.hashLo ^= ZSIDE_LO;
    this.hashHi ^= ZSIDE_HI;
    this.side = -this.side;
  }

  unmakeNull() {
    this.nullMarks.pop();
    this.hashLo = this.loStack.pop();
    this.hashHi = this.hiStack.pop();
    this.score = this.scoreStack.pop();
    this.side = -this.side;
  }

  // Đi thử nước m; nếu khiến tướng mình bị chiếu thì hoàn tác và trả về false.
  makeLegal(m) {
    this.make(m);
    if (this.inCheck(-this.side)) {
      this.unmake();
      return false;
    }
    return true;
  }

  _add(out, from, to, capturesOnly) {
    const q = this.board[to] * this.side;
    if (q > 0) return;
    if (q === 0 && capturesOnly) return;
    out.push(from | (to << 7));
  }

  // Sinh nước đi giả hợp lệ (chưa kiểm tra tướng bị chiếu).
  generate(out, capturesOnly = false) {
    const b = this.board;
    const s = this.side;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq] * s;
      if (p <= 0) continue;
      const r = (sq / 9) | 0;
      const c = sq - r * 9;
      switch (p) {
        case KING:
          for (const [dr, dc] of ORTH) {
            const nr = r + dr;
            const nc = c + dc;
            if (inPalace(s, nr, nc)) this._add(out, sq, nr * 9 + nc, capturesOnly);
          }
          break;
        case ADVISOR:
          for (const [dr, dc] of DIAG) {
            const nr = r + dr;
            const nc = c + dc;
            if (inPalace(s, nr, nc)) this._add(out, sq, nr * 9 + nc, capturesOnly);
          }
          break;
        case ELEPHANT:
          for (const [dr, dc] of DIAG) {
            const nr = r + 2 * dr;
            const nc = c + 2 * dc;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
            if (s > 0 ? nr < 5 : nr > 4) continue; // không qua sông
            if (b[(r + dr) * 9 + c + dc] !== 0) continue; // cản mắt tượng
            this._add(out, sq, nr * 9 + nc, capturesOnly);
          }
          break;
        case HORSE:
          for (const [dr, dc, lr, lc] of HORSE_D) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
            if (b[(r + lr) * 9 + c + lc] !== 0) continue; // cản chân mã
            this._add(out, sq, nr * 9 + nc, capturesOnly);
          }
          break;
        case CHARIOT:
          for (const [dr, dc] of ORTH) {
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
              const to = nr * 9 + nc;
              const q = b[to];
              if (q === 0) {
                if (!capturesOnly) out.push(sq | (to << 7));
              } else {
                if (q * s < 0) out.push(sq | (to << 7));
                break;
              }
              nr += dr;
              nc += dc;
            }
          }
          break;
        case CANNON:
          for (const [dr, dc] of ORTH) {
            let nr = r + dr;
            let nc = c + dc;
            let screen = false;
            while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
              const to = nr * 9 + nc;
              const q = b[to];
              if (!screen) {
                if (q === 0) {
                  if (!capturesOnly) out.push(sq | (to << 7));
                } else {
                  screen = true;
                }
              } else if (q !== 0) {
                if (q * s < 0) out.push(sq | (to << 7));
                break;
              }
              nr += dr;
              nc += dc;
            }
          }
          break;
        case PAWN: {
          const nr = r + (s > 0 ? -1 : 1);
          if (nr >= 0 && nr <= 9) this._add(out, sq, nr * 9 + c, capturesOnly);
          const crossed = s > 0 ? r <= 4 : r >= 5;
          if (crossed) {
            if (c > 0) this._add(out, sq, sq - 1, capturesOnly);
            if (c < 8) this._add(out, sq, sq + 1, capturesOnly);
          }
          break;
        }
      }
    }
    return out;
  }

  findKing(side) {
    const r0 = side > 0 ? 7 : 0;
    const k = side * KING;
    for (let r = r0; r < r0 + 3; r++) {
      for (let c = 3; c <= 5; c++) {
        if (this.board[r * 9 + c] === k) return r * 9 + c;
      }
    }
    return -1;
  }

  // Tướng của `side` có đang bị chiếu không (bao gồm luật "lộ mặt tướng").
  inCheck(side) {
    const b = this.board;
    const k = this.findKing(side);
    if (k < 0) return true;
    const kr = (k / 9) | 0;
    const kc = k - kr * 9;
    const e = -side;

    // Xe, pháo và tướng đối mặt
    for (const [dr, dc] of ORTH) {
      let r = kr + dr;
      let c = kc + dc;
      let screen = false;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 8) {
        const p = b[r * 9 + c];
        if (p !== 0) {
          if (!screen) {
            if (p === e * CHARIOT || p === e * KING) return true;
            screen = true;
          } else {
            if (p === e * CANNON) return true;
            break;
          }
        }
        r += dr;
        c += dc;
      }
    }

    // Mã: chân mã luôn là ô chéo cạnh tướng
    for (const [dr, dc] of DIAG) {
      const lr = kr + dr;
      const lc = kc + dc;
      if (lr < 0 || lr > 9 || b[lr * 9 + lc] !== 0) continue;
      const hr = kr + 2 * dr;
      if (hr >= 0 && hr <= 9 && b[hr * 9 + lc] === e * HORSE) return true;
      const hc = kc + 2 * dc;
      if (hc >= 0 && hc <= 8 && b[lr * 9 + hc] === e * HORSE) return true;
    }

    // Tốt (tốt địch ở trong cung mình thì chắc chắn đã qua sông)
    const pr = kr + (e > 0 ? 1 : -1);
    if (pr >= 0 && pr <= 9 && b[pr * 9 + kc] === e * PAWN) return true;
    if (kc > 0 && b[k - 1] === e * PAWN) return true;
    if (kc < 8 && b[k + 1] === e * PAWN) return true;
    return false;
  }

  legalMoves() {
    const out = [];
    this.generate(out, false);
    const res = [];
    for (const m of out) {
      if (this.makeLegal(m)) {
        this.unmake();
        res.push(m);
      }
    }
    return res;
  }

  // Thế cờ hiện tại đã xuất hiện trước đó (cùng bên đi) chưa.
  isRepetition() {
    const lo = this.loStack;
    const hi = this.hiStack;
    const marks = this.nullMarks;
    // Thế cờ trước một nước bỏ lượt không thực sự xảy ra trên bàn, không được tính.
    const stop = Math.max(0, lo.length - 60, marks.length ? marks[marks.length - 1] + 1 : 0);
    for (let i = lo.length - 2; i >= stop; i -= 2) {
      if (lo[i] === this.hashLo && hi[i] === this.hashHi) return true;
    }
    return false;
  }

  // Số lần thế cờ hiện tại đã xuất hiện trong cả ván (tính cả hiện tại).
  repetitionCount() {
    let n = 1;
    for (let i = 0; i < this.loStack.length; i++) {
      if (this.loStack[i] === this.hashLo && this.hiStack[i] === this.hashHi) n++;
    }
    return n;
  }

  hasPieces(side) {
    for (let sq = 0; sq < 90; sq++) {
      const p = this.board[sq] * side;
      if (p === CHARIOT || p === HORSE || p === CANNON) return true;
    }
    return false;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const moves = [];
    this.generate(moves, false);
    let n = 0;
    for (const m of moves) {
      if (!this.makeLegal(m)) continue;
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// AI: iterative deepening + negamax alpha-beta (PVS), bảng chuyển vị,
// null-move, LMR, killer/history heuristic và quiescence search.

const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

let tt = null;
function getTT() {
  if (!tt) {
    tt = {
      lo: new Int32Array(TT_SIZE),
      hi: new Int32Array(TT_SIZE),
      move: new Int32Array(TT_SIZE),
      score: new Int32Array(TT_SIZE),
      depth: new Int8Array(TT_SIZE),
      flag: new Int8Array(TT_SIZE),
    };
  }
  return tt;
}

export function clearTT() {
  const t = getTT();
  t.lo.fill(0);
  t.hi.fill(0);
  t.flag.fill(0);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Searcher {
  constructor(pos, { timeMs, noise }) {
    this.pos = pos;
    this.tt = getTT();
    this.deadline = now() + timeMs;
    this.noise = noise | 0;
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.nodes = 0;
    this.stopped = false;
    this.canStop = false;
    this.rootBest = 0;
    this.killers = new Int32Array(MAX_PLY * 2);
    this.history = new Int32Array(90 * 90);
  }

  evaluate() {
    const pos = this.pos;
    let e = pos.score * pos.side;
    if (this.noise) {
      const h = ((pos.hashLo ^ this.seed) >>> 0) % (2 * this.noise + 1);
      e += h - this.noise;
    }
    return e;
  }

  tick() {
    if ((++this.nodes & 2047) === 0 && this.canStop && now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  scoreMoves(moves, ttMove, ply) {
    const b = this.pos.board;
    const scores = new Int32Array(moves.length);
    const k0 = this.killers[ply * 2];
    const k1 = this.killers[ply * 2 + 1];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const from = m & 127;
      const to = m >> 7;
      const q = b[to];
      if (m === ttMove) scores[i] = 1 << 30;
      else if (q) scores[i] = (1 << 24) + VALUE[Math.abs(q)] * 16 - VALUE[Math.abs(b[from])];
      else if (m === k0) scores[i] = (1 << 23) + 1;
      else if (m === k1) scores[i] = 1 << 23;
      else scores[i] = this.history[from * 90 + to];
    }
    return scores;
  }

  quiesce(alpha, beta, ply) {
    if (this.tick()) return 0;
    const stand = this.evaluate();
    if (ply >= MAX_PLY - 1 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const pos = this.pos;
    const moves = pos.generate([], true);
    const scores = this.scoreMoves(moves, 0, ply);
    for (let i = 0; i < moves.length; i++) {
      pickNext(moves, scores, i);
      if (!pos.makeLegal(moves[i])) continue;
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stopped) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  negamax(depth, alpha, beta, ply, allowNull) {
    const pos = this.pos;
    if (ply > 0 && pos.isRepetition()) return 0;
    const inCheck = pos.inCheck(pos.side);
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (this.tick()) return 0;
    if (ply >= MAX_PLY - 1) return this.evaluate();

    const t = this.tt;
    const idx = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (t.flag[idx] && t.lo[idx] === pos.hashLo && t.hi[idx] === pos.hashHi) {
      ttMove = t.move[idx];
      if (ply > 0 && t.depth[idx] >= depth) {
        let s = t.score[idx];
        if (s > MATE_BOUND) s -= ply;
        else if (s < -MATE_BOUND) s += ply;
        const f = t.flag[idx];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    // Null-move pruning
    if (allowNull && !inCheck && ply > 0 && depth >= 3 && beta < MATE_BOUND && pos.hasPieces(pos.side)) {
      pos.makeNull();
      const s = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stopped) return 0;
      if (s >= beta) return beta;
    }

    const moves = pos.generate([], false);
    const scores = this.scoreMoves(moves, ttMove, ply);
    const origAlpha = alpha;
    let best = -MATE - 1;
    let bestMove = 0;
    let legal = 0;

    for (let i = 0; i < moves.length; i++) {
      pickNext(moves, scores, i);
      const m = moves[i];
      const captured = pos.board[m >> 7];
      if (!pos.makeLegal(m)) continue;
      legal++;
      let s;
      if (legal === 1) {
        s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let reduce = 0;
        const mateWindow = alpha > MATE_BOUND || beta < -MATE_BOUND || alpha < -MATE_BOUND;
        if (
          ply > 0 &&
          depth >= 3 &&
          legal > 4 &&
          !inCheck &&
          !captured &&
          !mateWindow &&
          scores[i] < 1 << 23 &&
          !pos.inCheck(pos.side)
        ) {
          reduce = legal > 12 ? 2 : 1;
        }
        s = -this.negamax(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && reduce) s = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && s < beta) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stopped) return 0;

      if (s > best) {
        best = s;
        bestMove = m;
        if (ply === 0) this.rootBest = m;
      }
      if (s > alpha) {
        alpha = s;
        if (s >= beta) {
          if (!captured) {
            if (this.killers[ply * 2] !== m) {
              this.killers[ply * 2 + 1] = this.killers[ply * 2];
              this.killers[ply * 2] = m;
            }
            const h = (m & 127) * 90 + (m >> 7);
            this.history[h] = Math.min(this.history[h] + depth * depth, 1 << 22);
          }
          break;
        }
      }
    }

    // Trong cờ tướng, hết nước đi (kể cả không bị chiếu) là thua.
    if (legal === 0) return -MATE + ply;

    if (!t.flag[idx] || t.depth[idx] <= depth || t.lo[idx] !== pos.hashLo) {
      let s = best;
      if (s > MATE_BOUND) s += ply;
      else if (s < -MATE_BOUND) s -= ply;
      t.lo[idx] = pos.hashLo;
      t.hi[idx] = pos.hashHi;
      t.move[idx] = bestMove;
      t.score[idx] = s;
      t.depth[idx] = depth;
      t.flag[idx] = best >= beta ? TT_LOWER : best > origAlpha ? TT_EXACT : TT_UPPER;
    }
    return best;
  }
}

function pickNext(moves, scores, i) {
  let bi = i;
  for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
  if (bi !== i) {
    const m = moves[i];
    moves[i] = moves[bi];
    moves[bi] = m;
    const s = scores[i];
    scores[i] = scores[bi];
    scores[bi] = s;
  }
}

// Tìm nước đi tốt nhất cho bên đang tới lượt.
// Trả về { move, score, depth, nodes, timeMs } hoặc null nếu không còn nước đi.
export function search(pos, { timeMs = 1000, maxDepth = 64, noise = 0, clear = true } = {}) {
  const start = now();
  const legal = pos.legalMoves();
  if (legal.length === 0) return null;
  if (clear) clearTT();
  const s = new Searcher(pos, { timeMs, noise });
  let bestMove = legal[0];
  let bestScore = 0;
  let depthDone = 0;
  for (let d = 1; d <= maxDepth && d < MAX_PLY - 8; d++) {
    const score = s.negamax(d, -MATE - 1, MATE + 1, 0, false);
    if (s.stopped) break;
    if (s.rootBest) bestMove = s.rootBest;
    bestScore = score;
    depthDone = d;
    s.canStop = true;
    if (legal.length === 1) break;
    if (Math.abs(score) > MATE_BOUND && MATE - Math.abs(score) <= d) break;
    if (now() - start > timeMs * 0.45) break; // vòng sau khó kịp hoàn thành
  }
  return { move: bestMove, score: bestScore, depth: depthDone, nodes: s.nodes, timeMs: Math.round(now() - start) };
}

// ---------------------------------------------------------------------------
// Ký hiệu nước đi kiểu Việt Nam, ví dụ: P2-5, M8.7, X1/2
//   "."  = tiến, "/" = thoái, "-" = bình (đi ngang)

const VN_LETTERS = ['', 'Tg', 'S', 'T', 'M', 'X', 'P', 'B'];

export function moveNotation(board, m) {
  const from = moveFrom(m);
  const to = moveTo(m);
  const p = board[from];
  const side = Math.sign(p);
  const t = Math.abs(p);
  const file = (c) => (side > 0 ? 9 - c : c + 1);
  const fr = rowOf(from);
  const fc = colOf(from);
  const tr = rowOf(to);
  const tc = colOf(to);

  // Hai quân cùng loại trên một cột: thêm dấu trước (t) / sau (s)
  let prefix = VN_LETTERS[t] + file(fc);
  if (t !== KING) {
    const same = [];
    for (let r = 0; r < 10; r++) if (board[r * 9 + fc] === p) same.push(r);
    if (same.length === 2) {
      const front = side > 0 ? same[0] : same[1];
      prefix = VN_LETTERS[t] + (fr === front ? 't' : 's');
    }
  }

  if (fr === tr) return `${prefix}-${file(tc)}`;
  const forward = side > 0 ? tr < fr : tr > fr;
  const op = forward ? '.' : '/';
  const straight = t === KING || t === CHARIOT || t === CANNON || t === PAWN;
  return `${prefix}${op}${straight ? Math.abs(tr - fr) : file(tc)}`;
}
