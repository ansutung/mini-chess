// Web Worker chạy AI để giao diện 3D không bị giật khi máy đang tính.
import { Position, search } from './engine.js';

export const LEVELS = {
  easy: { maxDepth: 2, timeMs: 400, noise: 60 },
  medium: { maxDepth: 5, timeMs: 1200, noise: 10 },
  hard: { maxDepth: 64, timeMs: 3500, noise: 0 },
};

self.onmessage = (e) => {
  const { token, purpose, board, side, lo, hi, level } = e.data;
  const pos = new Position(Int8Array.from(board), side);
  // Đưa lịch sử ván vào để AI biết tránh / tận dụng thế lặp lại.
  pos.loStack = lo.slice();
  pos.hiStack = hi.slice();
  const opts = LEVELS[level] ?? LEVELS.medium;
  const res = search(pos, opts);
  self.postMessage({ token, purpose, ...(res ?? { move: 0 }) });
};
