// store.js — app ki state, localStorage, streak aur task/goal ke chhote helpers.
// Is file mein DOM ka koi kaam nahi, is liye Node mein test bhi ho jati hai.

export const SLOTS = [
  { id: 'subah', label: 'Subah', hint: 'Din ka aaghaz' },
  { id: 'dopahar', label: 'Dopahar', hint: 'Din ka darmiyan' },
  { id: 'shaam', label: 'Shaam', hint: 'Din ka ikhtitam' },
];

export const MOODS = [
  { id: 'fresh', label: 'Fresh hoon' },
  { id: 'thaka', label: 'Thaka hua' },
  { id: 'kamwaqt', label: 'Kam waqt' },
  { id: 'atka', label: 'Atka hua' },
];

export const QUICK = ['Namaz', '30 Min Padhai', 'Project Kaam', 'Book Reading', 'Paani'];

const STATE_KEY = 'roshni-lite:state:v1';
const AI_KEY = 'roshni-lite:ai:v1';

// localStorage na chale (private mode wagairah) to memory mein chalta rahe.
const mem = {};
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
};

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function slotForHour(h) {
  return h < 12 ? 'subah' : h < 17 ? 'dopahar' : 'shaam';
}

function fresh() {
  return {
    v: 1,
    slot: slotForHour(new Date().getHours()),
    mood: { id: 'fresh', label: 'Fresh hoon' },
    tasks: [],      // { id, slot, title, doneOn: 'YYYY-MM-DD' | null }
    goals: [],      // { id, slot, title, steps: [{ id, text, done }] }
    streak: { count: 0, best: 0, last: null },
    activeDays: {}, // { 'YYYY-MM-DD': n }
    history: [],    // { id, t, type, text }
    excluded: {},   // AI list se hataye gaye items: { key: true }
  };
}

export function load() {
  const base = fresh();
  const raw = ls.get(STATE_KEY);
  if (!raw) return base;
  try {
    const p = JSON.parse(raw);
    return {
      ...base,
      ...p,
      slot: base.slot, // app kholte waqt mojooda waqt ke hisab se
      mood: p.mood && p.mood.label ? p.mood : base.mood,
      streak: { ...base.streak, ...(p.streak || {}) },
    };
  } catch {
    return base;
  }
}

export function save(state) {
  ls.set(STATE_KEY, JSON.stringify(state));
}

// ---- AI settings (key alag jagah, state ke saath export/log na ho) ----
export function loadAI() {
  try {
    const o = JSON.parse(ls.get(AI_KEY) || '{}');
    return { key: o.key || '', model: o.model || '' };
  } catch {
    return { key: '', model: '' };
  }
}
export function saveAI(o) { ls.set(AI_KEY, JSON.stringify({ key: o.key || '', model: o.model || '' })); }
export function clearAIKey() { const o = loadAI(); saveAI({ key: '', model: o.model }); }

// ---- history aur streak ----
export function log(state, type, text, now = new Date()) {
  state.history.unshift({ id: uid(), t: now.getTime(), type, text: clip(text, 100) });
  if (state.history.length > 120) state.history.length = 120;
}

export function markActive(state, now = new Date()) {
  const today = dateKey(now);
  const s = state.streak;
  state.activeDays[today] = (state.activeDays[today] || 0) + 1;
  if (s.last === today) return;
  s.count = s.last === addDays(today, -1) ? s.count + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best, s.count);
}

export function streakNow(state, now = new Date()) {
  const today = dateKey(now);
  const { last, count } = state.streak;
  return last === today || last === addDays(today, -1) ? count : 0;
}

// ---- tasks (roz ki aadatein: har din naye sire se) ----
export const isDone = (t, today = dateKey()) => t.doneOn === today;

export function addTask(state, slot, title) {
  const clean = clip(title, 120); // coach ke steps lambe ho sakte hain
  if (!clean) return { error: 'khali' };
  if (state.tasks.some((t) => t.slot === slot && t.title.toLowerCase() === clean.toLowerCase())) {
    return { error: 'maujood' };
  }
  const task = { id: uid(), slot, title: clean, doneOn: null };
  state.tasks.push(task);
  return { task };
}

export function toggleTask(state, id, now = new Date()) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return null;
  const today = dateKey(now);
  if (t.doneOn === today) { t.doneOn = null; return { task: t, done: false }; }
  t.doneOn = today;
  log(state, 'done', `Mukammal: ${t.title}`, now);
  markActive(state, now);
  return { task: t, done: true };
}

export function editTask(state, id, { title, slot }) {
  const t = state.tasks.find((x) => x.id === id);
  const clean = clip(title, 80);
  if (!t || !clean) return false;
  t.title = clean;
  if (slot) t.slot = slot;
  return true;
}

export function removeTask(state, id) {
  const i = state.tasks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  return { kind: 'task', index: i, item: state.tasks.splice(i, 1)[0] };
}

// ---- goals ----
export const goalProgress = (g) => ({ done: g.steps.filter((s) => s.done).length, total: g.steps.length });

export function addGoal(state, slot, title, steps = []) {
  const clean = clip(title, 80);
  if (!clean) return null;
  const g = {
    id: uid(), slot, title: clean,
    steps: steps.map((s) => ({ id: uid(), text: clip(s, 120), done: false })).filter((s) => s.text),
  };
  state.goals.push(g);
  return g;
}

export function editGoal(state, id, { title, slot }) {
  const g = state.goals.find((x) => x.id === id);
  const clean = clip(title, 80);
  if (!g || !clean) return false;
  g.title = clean;
  if (slot) g.slot = slot;
  return true;
}

export function removeGoal(state, id) {
  const i = state.goals.findIndex((x) => x.id === id);
  if (i < 0) return null;
  return { kind: 'goal', index: i, item: state.goals.splice(i, 1)[0] };
}

export function addStep(state, goalId, text) {
  const g = state.goals.find((x) => x.id === goalId);
  const clean = clip(text, 120);
  if (!g || !clean) return null;
  const s = { id: uid(), text: clean, done: false };
  g.steps.push(s);
  return s;
}

export function toggleStep(state, goalId, stepId, now = new Date()) {
  const g = state.goals.find((x) => x.id === goalId);
  const s = g && g.steps.find((x) => x.id === stepId);
  if (!s) return null;
  s.done = !s.done;
  if (s.done) {
    log(state, 'step', `Qadam mukammal: ${s.text}`, now);
    markActive(state, now);
  }
  return { goal: g, step: s };
}

export function editStep(state, goalId, stepId, text) {
  const g = state.goals.find((x) => x.id === goalId);
  const s = g && g.steps.find((x) => x.id === stepId);
  const clean = clip(text, 120);
  if (!s || !clean) return false;
  s.text = clean;
  return true;
}

export function removeStep(state, goalId, stepId) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return null;
  const i = g.steps.findIndex((x) => x.id === stepId);
  if (i < 0) return null;
  return { kind: 'step', goalId, index: i, item: g.steps.splice(i, 1)[0] };
}

// delete ke baad "Wapas" ke liye
export function restore(state, r) {
  if (!r) return;
  if (r.kind === 'task') state.tasks.splice(Math.min(r.index, state.tasks.length), 0, r.item);
  if (r.kind === 'goal') state.goals.splice(Math.min(r.index, state.goals.length), 0, r.item);
  if (r.kind === 'step') {
    const g = state.goals.find((x) => x.id === r.goalId);
    if (g) g.steps.splice(Math.min(r.index, g.steps.length), 0, r.item);
  }
}
