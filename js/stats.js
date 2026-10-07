// Game history, streaks and the lazy-move trend. Saved on this device.
import { kvGet, kvSet, kvDel, deviceId } from './storage.js';

const KEY = 'stats';
const day = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const DAY = 86400000;

export class Stats {
  constructor() { this.records = []; this.listeners = new Set(); }

  async load() {
    const saved = await kvGet(KEY);
    this.records = Array.isArray(saved) ? saved : [];
    this.emit();
  }
  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  async add(rec) {
    const dev = await deviceId();
    this.records.push({ id: crypto.randomUUID(), deviceId: dev, updatedAt: Date.now(), date: Date.now(), ...rec });
    if (this.records.length > 1000) this.records.splice(0, this.records.length - 1000);
    await kvSet(KEY, this.records);
    this.emit();
  }
  async reset() { this.records = []; await kvDel(KEY); this.emit(); }
  async replaceAll(records) { this.records = Array.isArray(records) ? records : []; await kvSet(KEY, this.records); this.emit(); }

  get gamesPlayed() { return this.records.length; }
  get wins() { return this.records.filter((r) => r.won).length; }
  get winRate() { return this.records.length ? this.wins / this.records.length : null; }
  get bestStandardScore() {
    const s = this.records.filter((r) => r.won && r.scoring === 'standard').map((r) => r.score);
    return s.length ? Math.max(...s) : null;
  }

  get currentWinStreak() {
    let n = 0;
    for (let i = this.records.length - 1; i >= 0 && this.records[i].won; i--) n++;
    return n;
  }
  get bestWinStreak() {
    let best = 0, run = 0;
    for (const r of this.records) { run = r.won ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  }

  get playedDays() { return [...new Set(this.records.map((r) => day(r.date)))].sort((a, b) => a - b); }

  /** Days in a row with a game. Still alive if she played yesterday but not yet today. */
  get currentDayStreak() {
    const days = new Set(this.playedDays);
    let d = day(Date.now());
    if (!days.has(d)) {
      d -= DAY;
      if (!days.has(d)) return 0;
    }
    let n = 0;
    while (days.has(d)) { n++; d -= DAY; }
    return n;
  }
  get bestDayStreak() {
    let best = 0, run = 0, prev = null;
    for (const d of this.playedDays) {
      run = prev !== null && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = d;
    }
    return best;
  }

  get scored() { return this.records.filter((r) => r.feedbackWasOn); }
  static avg(list) { return list.length ? list.reduce((a, r) => a + r.lazyMoves, 0) / list.length : null; }
  get recentLazyAverage() { return Stats.avg(this.scored.slice(-10)); }
  get earlierLazyAverage() { return Stats.avg(this.scored.slice(-20, -10)); }
  get lazyChartRecords() { return this.scored.slice(-20); }
}
