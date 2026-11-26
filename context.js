// context.js — "AI Ko Dikhane Wali List" (Safe Context Filter).
//
// Usool: AI ko sirf wahi cheezein jayein jo coaching ke liye zaroori hain.
//   JATA HAI : mojooda waqt, halat, kaam ki summary, baqi kaam (max 4), streak,
//              active goal ka agla qadam.
//   NAHI JATA: API key, history, doosray waqt ke kaam, purane goals, tareekhein.
// Har item par user ka control hai (preview mein tick hata kar exclude kar sakta hai).

import { SLOTS, dateKey, streakNow, isDone, goalProgress } from './store.js';

// Email / phone / link jaisi cheezein AI list mein jane se pehle chhupa di jati hain.
export function redact(s, max = 90) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, max);
}

export function buildContext(state, now = new Date()) {
  const today = dateKey(now);
  const slot = SLOTS.find((s) => s.id === state.slot) || SLOTS[0];
  const items = [];
  const push = (key, text, data) =>
    items.push({ key, text, data, included: !(state.excluded && state.excluded[key]) });

  push('slot', `Mojooda waqt: ${slot.label}`, { slot: slot.id });
  push('mood', `Halat: ${redact(state.mood.label, 40)}`, { mood: { id: state.mood.id, label: redact(state.mood.label, 40) } });

  const mine = state.tasks.filter((t) => t.slot === slot.id);
  const done = mine.filter((t) => isDone(t, today));
  const pending = mine.filter((t) => !isDone(t, today));

  if (mine.length) {
    push('summary', `Is waqt ke kaam: ${done.length} mukammal, ${pending.length} baqi`,
      { doneCount: done.length, pendingCount: pending.length });
  }
  pending.slice(0, 4).forEach((t) => {
    const title = redact(t.title);
    push('task:' + t.id, `Baqi kaam: ${title}`, { pendingTitle: title });
  });
  if (done.length) {
    const titles = done.slice(0, 3).map((t) => redact(t.title, 40));
    push('done', `Mukammal ho chuke: ${titles.join(', ')}`, { doneTitles: titles });
  }

  push('streak', `Streak: ${streakNow(state, now)} din`, { streak: streakNow(state, now) });

  const goal = state.goals.find((g) => g.slot === slot.id && g.steps.some((s) => !s.done));
  if (goal) {
    const p = goalProgress(goal);
    const next = goal.steps.find((s) => !s.done);
    const title = redact(goal.title);
    const nextText = redact(next.text, 80);
    push('goal:' + goal.id, `Active goal: ${title} (${p.done}/${p.total} qadam mukammal) — agla qadam: ${nextText}`,
      { goal: { title, next: nextText, done: p.done, total: p.total } });
  }
  return items;
}

// Sirf "included" items se wahi facts nikalta hai (offline coaching bhi isi se chalti hai,
// taake exclude kiya hua item kahin istemal na ho).
export function factsFrom(items) {
  const f = {
    slot: null, mood: null, doneCount: 0, pendingCount: 0,
    pending: [], doneTitles: [], streak: null, goal: null,
  };
  for (const it of items) {
    if (!it.included) continue;
    const d = it.data;
    if ('slot' in d) f.slot = d.slot;
    if ('mood' in d) f.mood = d.mood;
    if ('doneCount' in d) { f.doneCount = d.doneCount; f.pendingCount = d.pendingCount; }
    if ('pendingTitle' in d) f.pending.push(d.pendingTitle);
    if ('doneTitles' in d) f.doneTitles = d.doneTitles;
    if ('streak' in d) f.streak = d.streak;
    if ('goal' in d) f.goal = d.goal;
  }
  return f;
}

// Yehi text Gemini ko jata hai.
export function contextToText(items) {
  const lines = items.filter((i) => i.included).map((i) => `- ${i.text}`);
  return 'AI Context List:\n' + (lines.length ? lines.join('\n') : '- (user ne koi maloomat share nahi ki)');
}
