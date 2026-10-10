// Talks to the solver in a Web Worker. Falls back to running it on the main thread.
export class SolverClient {
  constructor() {
    this.pending = new Map();
    this.nextId = 1;
    this.worker = null;
    try {
      this.worker = window.__WORKER_SRC__
        ? new Worker(URL.createObjectURL(new Blob([window.__WORKER_SRC__], { type: 'text/javascript' })))   // single-file build
        : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.error));
      };
      this.worker.onerror = () => this._fallBack();
    } catch {
      this.worker = null;
    }
  }

  _fallBack() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    const jobs = [...this.pending.values()];
    this.pending.clear();
    jobs.forEach((p) => this._inline(p.msg).then(p.resolve, p.reject));
  }

  async _inline(msg) {
    const solver = window.__solver || await import('./solver.js');
    return new Promise((resolve) => setTimeout(() => {
      resolve(msg.type === 'deal' ? solver.findWinnableDeal(msg.draw, msg.scoring)
        : msg.type === 'progress' ? solver.findProgress(msg.state, msg.limit) : solver.solve(msg.state, msg.limit));
    }, 0));
  }

  _call(msg) {
    if (!this.worker) return this._inline(msg);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, msg });
      this.worker.postMessage({ id, ...msg });
    });
  }

  /** -> { game, line } where line is null if the deal could not be verified */
  deal(draw, scoring) { return this._call({ type: 'deal', draw, scoring }); }
  /** -> { result: 'win'|'lost'|'unknown', line, nodes } */
  solve(state, limit) { return this._call({ type: 'solve', state, limit }); }
  /** -> { result: 'now'|'later'|'none'|'unknown', first, nodes } */
  progress(state, limit) { return this._call({ type: 'progress', state, limit }); }
}
