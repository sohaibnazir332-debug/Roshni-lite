// Chalane ke liye: node tests/logic.test.mjs   (koi package install nahi chahiye)
import assert from 'node:assert/strict';
import * as S from '../js/store.js';
import { buildContext, factsFrom, contextToText, redact } from '../js/context.js';
import { offlineCoach, offlinePlan, classifyMood } from '../js/offline.js';
import { Timers } from '../js/timer.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok  -', name); };
const mk = () => {
  const s = S.load();
  s.slot = 'subah';
  return s;
};

t('task add / dedupe / toggle', () => {
  const s = mk();
  assert.ok(S.addTask(s, 'subah', 'Namaz').task);
  assert.equal(S.addTask(s, 'subah', 'namaz').error, 'maujood');
  assert.equal(S.addTask(s, 'subah', '   ').error, 'khali');
  const id = s.tasks[0].id;
  assert.equal(S.toggleTask(s, id).done, true);
  assert.equal(S.toggleTask(s, id).done, false);
});

t('streak: lagataar din, toot-na', () => {
  const s = mk();
  const d = (k) => new Date(k + 'T12:00:00');
  S.markActive(s, d('2026-11-24'));
  S.markActive(s, d('2026-11-24'));
  assert.equal(s.streak.count, 1);
  S.markActive(s, d('2026-11-25'));
  S.markActive(s, d('2026-11-26'));
  assert.equal(s.streak.count, 3);
  assert.equal(S.streakNow(s, d('2026-11-27')), 3);  // kal tak bacha hua
  assert.equal(S.streakNow(s, d('2026-11-29')), 0);  // toot gaya
  S.markActive(s, d('2026-11-29'));
  assert.equal(s.streak.count, 1);
  assert.equal(s.streak.best, 3);
});

t('goal steps aur undo', () => {
  const s = mk();
  const g = S.addGoal(s, 'subah', 'Website banana', ['A', 'B', 'C']);
  S.toggleStep(s, g.id, g.steps[0].id);
  assert.deepEqual(S.goalProgress(g), { done: 1, total: 3 });
  const r = S.removeGoal(s, g.id);
  assert.equal(s.goals.length, 0);
  S.restore(s, r);
  assert.equal(s.goals.length, 1);
});

t('context: sirf zaroori cheezein, doosre waqt ke kaam nahi', () => {
  const s = mk();
  S.addTask(s, 'subah', 'Namaz');
  S.addTask(s, 'dopahar', 'Raaz wala kaam');
  S.addGoal(s, 'subah', 'Website', ['Khaka', 'Design']);
  const text = contextToText(buildContext(s));
  assert.match(text, /Mojooda waqt: Subah/);
  assert.match(text, /Baqi kaam: Namaz/);
  assert.match(text, /agla qadam: Khaka/);
  assert.doesNotMatch(text, /Raaz/);
});

t('context: exclude kiya hua item nahi jata', () => {
  const s = mk();
  S.addTask(s, 'subah', 'Namaz');
  s.excluded['streak'] = true;
  s.excluded['task:' + s.tasks[0].id] = true;
  const text = contextToText(buildContext(s));
  assert.doesNotMatch(text, /Streak/);
  assert.doesNotMatch(text, /Namaz/);
});

t('context: email/phone/link chhup jate hain', () => {
  assert.equal(redact('mail a@b.com call 0300 1234567 http://x.io'), 'mail [email] call [number] [link]');
  const s = mk();
  S.addTask(s, 'subah', 'Ali ko 03001234567 par call');
  assert.doesNotMatch(contextToText(buildContext(s)), /03001234567/);
});

t('context: API key / history kabhi nahi', () => {
  const s = mk();
  S.log(s, 'done', 'POSHEEDA-HISTORY');
  S.saveAI({ key: 'AIzaSECRET-KEY-1234567890', model: '' });
  const text = contextToText(buildContext(s));
  assert.doesNotMatch(text, /POSHEEDA|SECRET|AIza/);
});

t('offline coaching halat ke hisab se', () => {
  const base = (mood) => {
    const s = mk();
    s.mood = mood;
    S.addTask(s, 'subah', 'Project Kaam');
    return offlineCoach(factsFrom(buildContext(s)));
  };
  const thaka = base({ id: 'thaka', label: 'Thaka hua' });
  const fresh = base({ id: 'fresh', label: 'Fresh hoon' });
  const atka = base({ id: 'atka', label: 'Atka hua' });
  const kam = base({ id: 'kamwaqt', label: 'Kam waqt' });
  assert.match(thaka.steps[0], /5 minute/);
  assert.match(fresh.steps[0], /25 minute/);
  assert.match(atka.steps[0], /2 minute/);
  assert.match(kam.steps[0], /10 minute/);
  [thaka, fresh, atka, kam].forEach((r) => {
    assert.ok(r.steps.length >= 1 && r.steps.length <= 2);
    assert.ok(r.mashwara.length > 20);
  });
  assert.equal(classifyMood({ id: 'custom', label: 'bohat thak gaya' }), 'thaka');
  assert.equal(classifyMood({ id: 'custom', label: 'ajeeb sa mood' }), 'neutral');
});

t('offline plan 4-6 qadam', () => {
  const p = offlinePlan('Portfolio banana', { mood: { id: 'thaka', label: 'Thaka hua' } });
  assert.ok(p.length >= 4 && p.length <= 6);
  assert.match(p[2], /5 minute/);
});

t('timer: start / pause / khatam', () => {
  let now = 0;
  let done = null;
  const tm = new Timers({ now: () => now, onDone: (slot, min) => { done = [slot, min]; } });
  tm.setMinutes('subah', 15);
  tm.start('subah');
  now = 60000;
  tm.tick();
  assert.equal(tm.get('subah').remaining, 14 * 60);
  tm.pause('subah');
  now = 600000;
  tm.tick();
  assert.equal(tm.get('subah').remaining, 14 * 60); // paused mein nahi ghata
  tm.start('subah');
  now += 14 * 60 * 1000;
  assert.equal(tm.tick(), true);
  assert.deepEqual(done, ['subah', 15]);
  assert.equal(tm.isFresh('subah'), true);
});

console.log(`\n${n} tests pass`);
