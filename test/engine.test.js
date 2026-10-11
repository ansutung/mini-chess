import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Position, search, moveNotation, makeMove, MATE,
  RED, KING, CHARIOT, HORSE, CANNON, PAWN,
} from '../js/engine.js';

const sq = (r, c) => r * 9 + c;

function emptyPosition(pieces, side = RED) {
  const b = new Int8Array(90);
  for (const [r, c, p] of pieces) b[sq(r, c)] = p;
  return new Position(b, side);
}

test('perft thế cờ khởi đầu', () => {
  const pos = new Position();
  assert.equal(pos.perft(1), 44);
  assert.equal(pos.perft(2), 1920);
  assert.equal(pos.perft(3), 79666);
});

test('make/unmake khôi phục đúng hash và điểm', () => {
  const pos = new Position();
  const { hashLo, hashHi, score } = pos;
  const board = Array.from(pos.board);
  for (const m of pos.legalMoves()) {
    pos.make(m);
    pos.unmake();
  }
  assert.deepEqual(Array.from(pos.board), board);
  assert.equal(pos.hashLo, hashLo);
  assert.equal(pos.hashHi, hashHi);
  assert.equal(pos.score, score);
});

test('hash tính tăng dần khớp với tính lại từ đầu', () => {
  const pos = new Position();
  for (let i = 0; i < 40; i++) {
    const moves = pos.legalMoves();
    if (!moves.length) break;
    pos.make(moves[(i * 7) % moves.length]);
    const fresh = new Position(pos.board, pos.side);
    assert.equal(pos.hashLo, fresh.hashLo);
    assert.equal(pos.hashHi, fresh.hashHi);
    assert.equal(pos.score, fresh.score);
  }
});

test('không được để hai tướng đối mặt', () => {
  const pos = emptyPosition([
    [0, 4, -KING],
    [9, 4, KING],
    [5, 4, CHARIOT],
  ]);
  const moves = pos.legalMoves();
  // Xe đang che mặt tướng nên chỉ được đi dọc trên cột 4
  for (const m of moves) {
    if ((m & 127) === sq(5, 4)) assert.equal((m >> 7) % 9, 4);
  }
});

test('mã bị cản chân', () => {
  const pos = new Position();
  const horseMoves = pos.legalMoves().filter((m) => (m & 127) === sq(9, 1)).map((m) => m >> 7);
  assert.deepEqual(horseMoves.sort((a, b) => a - b), [sq(7, 0), sq(7, 2)]);
});

test('pháo phải có ngòi mới ăn được', () => {
  const pos = emptyPosition([
    [0, 3, -KING],
    [9, 4, KING],
    [5, 0, CANNON],
    [5, 3, -PAWN],
    [5, 6, -HORSE],
  ]);
  const targets = pos.legalMoves().filter((m) => (m & 127) === sq(5, 0)).map((m) => m >> 7);
  assert.ok(!targets.includes(sq(5, 3)), 'không ăn trực tiếp');
  assert.ok(targets.includes(sq(5, 6)), 'ăn qua ngòi');
});

test('AI tìm ra nước chiếu bí một nước', () => {
  const pos = emptyPosition([
    [0, 4, -KING],
    [9, 3, KING],
    [1, 0, CHARIOT],
    [5, 8, CHARIOT],
  ]);
  const res = search(pos, { timeMs: 2000, maxDepth: 4 });
  assert.ok(res.score > MATE - 10, `score=${res.score}`);
  pos.make(res.move);
  assert.equal(pos.legalMoves().length, 0);
});

test('AI ăn quân miễn phí', () => {
  const pos = emptyPosition([
    [0, 4, -KING],
    [9, 3, KING],
    [5, 1, CHARIOT],
    [2, 1, -CHARIOT],
  ]);
  const res = search(pos, { timeMs: 1000, maxDepth: 4 });
  assert.equal(res.move, makeMove(sq(5, 1), sq(2, 1)));
});

test('AI trả về nước hợp lệ ở thế khởi đầu', () => {
  const pos = new Position();
  const res = search(pos, { timeMs: 500 });
  assert.ok(pos.legalMoves().includes(res.move));
  assert.ok(res.depth >= 3, `depth=${res.depth}`);
});

test('ký hiệu nước đi', () => {
  const pos = new Position();
  assert.equal(moveNotation(pos.board, makeMove(sq(7, 7), sq(7, 4))), 'P2-5');
  assert.equal(moveNotation(pos.board, makeMove(sq(9, 1), sq(7, 2))), 'M8.7');
  assert.equal(moveNotation(pos.board, makeMove(sq(9, 0), sq(8, 0))), 'X9.1');
  assert.equal(moveNotation(pos.board, makeMove(sq(2, 1), sq(2, 4))), 'P2-5');
});
