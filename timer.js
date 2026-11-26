// timer.js — har waqt (Subah/Dopahar/Shaam) ka apna focus timer.
// endsAt (asal waqt) par chalta hai, is liye tab background mein ho tab bhi sahi rehta hai.

export class Timers {
  constructor({ onDone, now = () => Date.now() } = {}) {
    this.onDone = onDone || (() => {});
    this.now = now;
    this.t = {};
  }

  get(slot) {
    if (!this.t[slot]) this.t[slot] = { dur: 25 * 60, remaining: 25 * 60, endsAt: null };
    return this.t[slot];
  }

  isRunning(slot) { return this.get(slot).endsAt !== null; }
  isFresh(slot) { const x = this.get(slot); return x.endsAt === null && x.remaining === x.dur; }

  setMinutes(slot, min) {
    const x = this.get(slot);
    if (x.endsAt !== null) return false; // chalte timer ka dauraniya nahi badalta
    x.dur = min * 60;
    x.remaining = x.dur;
    return true;
  }

  start(slot) {
    const x = this.get(slot);
    if (x.endsAt !== null) return;
    if (x.remaining <= 0) x.remaining = x.dur;
    x.endsAt = this.now() + x.remaining * 1000;
  }

  pause(slot) {
    const x = this.get(slot);
    if (x.endsAt === null) return;
    x.remaining = Math.max(0, Math.ceil((x.endsAt - this.now()) / 1000));
    x.endsAt = null;
  }

  reset(slot) {
    const x = this.get(slot);
    x.endsAt = null;
    x.remaining = x.dur;
  }

  // Har ~500ms par chalta hai. true wapas aaye to koi timer khatam hua (UI refresh karein).
  tick() {
    let finished = false;
    for (const [slot, x] of Object.entries(this.t)) {
      if (x.endsAt === null) continue;
      x.remaining = Math.max(0, Math.ceil((x.endsAt - this.now()) / 1000));
      if (x.remaining <= 0) {
        x.endsAt = null;
        x.remaining = x.dur;
        finished = true;
        this.onDone(slot, Math.round(x.dur / 60));
      }
    }
    return finished;
  }
}

export function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
