// Runs the solver off the main thread so the board never freezes.
import { solve, findWinnableDeal, findProgress } from './solver.js';

self.onmessage = (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'deal') {
      const { draw, scoring } = e.data;
      self.postMessage({ id, ok: true, ...findWinnableDeal(draw, scoring) });
    } else if (type === 'progress') {
      const { state, limit } = e.data;
      self.postMessage({ id, ok: true, ...findProgress(state, limit) });
    } else if (type === 'solve') {
      const { state, limit } = e.data;
      self.postMessage({ id, ok: true, ...solve(state, limit) });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
