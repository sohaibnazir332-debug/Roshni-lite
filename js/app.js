// app.js — UI, events aur sab modules ko jodna.
import * as S from './store.js';
import { buildContext, factsFrom, contextToText } from './context.js';
import { askCoach, askPlan, testKey, DEFAULT_MODEL } from './gemini.js';
import { offlineCoach, offlinePlan } from './offline.js';
import { Timers, fmt } from './timer.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

const state = S.load();
let ai = S.loadAI();
const ui = { ctxOpen: false, coach: null, coachBusy: false, planBusy: false, sheet: null, undo: null, toastTimer: null };

const slotMeta = (id = state.slot) => S.SLOTS.find((s) => s.id === id) || S.SLOTS[0];
const hasKey = () => !!ai.key;
const persist = () => S.save(state);
const buzz = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } };

/* ------------------------------------------------------------------ timers */
const timers = new Timers({
  onDone: (slot, min) => {
    S.log(state, 'focus', `Focus session: ${min} min (${slotMeta(slot).label})`);
    S.markActive(state);
    persist();
    buzz([200, 100, 200]);
    toast(`${min} minute ka focus poora hua. Shabash!`);
  },
});

setInterval(() => {
  if (timers.tick()) render(); else updateTimerDOM();
}, 500);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { if (timers.tick()) render(); else updateTimerDOM(); }
});

const RING = 2 * Math.PI * 52;
function updateTimerDOM() {
  const x = timers.get(state.slot);
  const t = $('#t-time');
  const r = $('#t-ring');
  if (t) t.textContent = fmt(x.remaining);
  if (r) r.setAttribute('stroke-dashoffset', String(RING * (1 - x.remaining / x.dur)));
}

/* ------------------------------------------------------------------ chrome */
function renderChrome() {
  const today = S.dateKey();
  $('#pills').innerHTML = `
    <button class="pill" data-action="open-sheet" data-sheet="streak">${icon.flame}<span>Streak</span><b>${S.streakNow(state)}</b></button>
    <button class="pill" data-action="open-sheet" data-sheet="key">${icon.key}<span>AI Key</span>${hasKey() ? '<i class="dot" title="Key lagi hui hai"></i>' : ''}</button>
    <button class="pill" data-action="open-sheet" data-sheet="history">${icon.history}<span>History</span></button>`;

  $('#tabs').innerHTML = S.SLOTS.map((s) => {
    const tasks = state.tasks.filter((t) => t.slot === s.id);
    const done = tasks.filter((t) => S.isDone(t, today)).length;
    const on = s.id === state.slot;
    return `<button role="tab" class="tab ${on ? 'is-active' : ''}" aria-selected="${on}" data-action="nav" data-slot="${s.id}">
      <span>${s.label}</span><small>${tasks.length ? `${done}/${tasks.length} mukammal` : s.hint}</small></button>`;
  }).join('');

  const i = S.SLOTS.findIndex((s) => s.id === state.slot);
  $('#btn-back').disabled = i === 0;
  $('#btn-next').disabled = i === S.SLOTS.length - 1;
  $('#bar-pos').textContent = `${i + 1} / ${S.SLOTS.length}`;
}

/* -------------------------------------------------------------------- view */
function taskRow(t, today) {
  const done = S.isDone(t, today);
  return `<li class="task ${done ? 'is-done' : ''}">
    <button class="check" data-action="toggle-task" data-id="${t.id}" role="checkbox" aria-checked="${done}" aria-label="${esc(t.title)} mukammal"><span class="box">${icon.check}</span></button>
    <span class="task-title">${esc(t.title)}</span>
    <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Tabdeel karein">${icon.pencil}</button>
    <button class="icon-btn danger" data-action="delete-task" data-id="${t.id}" aria-label="Mita dein">${icon.trash}</button>
  </li>`;
}

function habitsCard() {
  const slot = slotMeta();
  const today = S.dateKey();
  const tasks = state.tasks.filter((t) => t.slot === slot.id);
  const done = tasks.filter((t) => S.isDone(t, today)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const chips = S.QUICK.map((q) => {
    const has = tasks.some((t) => t.title.toLowerCase() === q.toLowerCase());
    return `<button class="chip ${has ? 'is-added' : ''}" data-action="quick" data-title="${esc(q)}">${has ? icon.check : icon.plus}<span>${esc(q)}</span></button>`;
  }).join('');
  return `<section class="card">
    <div class="card-head"><h2>Aadatein</h2><span class="count">${done}/${tasks.length}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <div class="chips" role="group" aria-label="Jaldi chunein">${chips}</div>
    ${tasks.length
      ? `<ul class="list">${tasks.map((t) => taskRow(t, today)).join('')}</ul>`
      : '<p class="empty">Abhi koi aadat nahi. Upar se ek chip dabayein ya neeche apna kaam likhein.</p>'}
    <div class="row">
      <input id="task-in" data-keep data-enter="add-custom" class="input" type="text" maxlength="120" placeholder="Apna kaam likhein…" autocomplete="off" enterkeyhint="done" aria-label="Apna kaam likhein">
      <button class="btn btn-accent" data-action="add-custom">Jorein</button>
    </div>
  </section>`;
}

function timerCard() {
  const slot = state.slot;
  const x = timers.get(slot);
  const running = timers.isRunning(slot);
  const label = running ? 'Rukein' : timers.isFresh(slot) ? 'Shuru karein' : 'Jari rakhein';
  const seg = [15, 25].map((m) =>
    `<button class="seg-btn ${x.dur === m * 60 ? 'is-on' : ''}" data-action="timer-dur" data-min="${m}" ${running ? 'disabled' : ''}>${m} min</button>`).join('');
  return `<section class="card">
    <div class="card-head"><h2>Focus Timer</h2><div class="seg" role="group" aria-label="Dauraniya">${seg}</div></div>
    <div class="timer-body">
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle id="t-ring" class="ring-fg" cx="60" cy="60" r="52" transform="rotate(-90 60 60)"
            stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - x.remaining / x.dur)}"/>
        </svg>
        <div class="ring-time" id="t-time" role="timer">${fmt(x.remaining)}</div>
      </div>
      <div class="timer-actions">
        <button class="btn btn-accent btn-lg" data-action="timer-toggle">${running ? icon.pause : icon.play}<span>${label}</span></button>
        <button class="btn btn-ghost" data-action="timer-reset">${icon.reset}<span>Dobara</span></button>
      </div>
    </div>
  </section>`;
}

function goalHTML(g) {
  const p = S.goalProgress(g);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const steps = g.steps.map((s) => `<li class="step ${s.done ? 'is-done' : ''}">
      <button class="check" data-action="toggle-step" data-goal="${g.id}" data-id="${s.id}" role="checkbox" aria-checked="${s.done}" aria-label="${esc(s.text)}"><span class="box">${icon.check}</span></button>
      <span class="task-title">${esc(s.text)}</span>
      <button class="icon-btn" data-action="edit-step" data-goal="${g.id}" data-id="${s.id}" aria-label="Qadam tabdeel karein">${icon.pencil}</button>
      <button class="icon-btn danger" data-action="delete-step" data-goal="${g.id}" data-id="${s.id}" aria-label="Qadam mita dein">${icon.trash}</button>
    </li>`).join('');
  return `<article class="goal">
    <div class="goal-head">
      <h3>${esc(g.title)}</h3>
      <div class="goal-tools">
        <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Goal tabdeel karein">${icon.pencil}</button>
        <button class="icon-btn danger" data-action="delete-goal" data-id="${g.id}" aria-label="Goal mita dein">${icon.trash}</button>
      </div>
    </div>
    <div class="goal-meta"><span>${p.total ? `${p.done}/${p.total} qadam mukammal` : 'Abhi koi qadam nahi'}</span><span>${pct}%</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    ${steps ? `<ul class="list steps">${steps}</ul>` : ''}
    <div class="row">
      <input id="step-in-${g.id}" data-keep data-enter="add-step" data-id="${g.id}" class="input input-sm" type="text" maxlength="120" placeholder="Naya qadam…" autocomplete="off" aria-label="Naya qadam">
      <button class="btn btn-soft btn-sm" data-action="add-step" data-id="${g.id}" aria-label="Qadam jorein">${icon.plus}</button>
    </div>
  </article>`;
}

function goalsCard() {
  const goals = state.goals.filter((g) => g.slot === state.slot);
  return `<section class="card">
    <div class="card-head"><h2>Baray Goals</h2><span class="count">${goals.length}</span></div>
    ${goals.length ? goals.map(goalHTML).join('') : '<p class="empty">Koi baray goal nahi. Neeche likhein aur Smart Plan se chhote qadam banwayein.</p>'}
    <div class="goal-new">
      <input id="goal-in" data-keep data-enter="smart-plan" class="input" type="text" maxlength="80" placeholder="Baray goal likhein, jaise: Portfolio website banana" autocomplete="off" aria-label="Baray goal">
      <button class="btn btn-gold btn-lg btn-block" data-action="smart-plan" ${ui.planBusy ? 'disabled' : ''}>
        ${ui.planBusy ? '<span class="spin"></span><span>Plan ban raha hai…</span>' : `${icon.spark}<span>Smart Plan Banao</span>`}
      </button>
      <button class="btn btn-ghost btn-block" data-action="goal-empty">Sirf goal jorein (qadam khud likhunga)</button>
    </div>
  </section>`;
}

function coachHTML() {
  if (ui.coachBusy) return '<div class="coach is-busy"><span class="spin"></span><span>Aap ki list dekh kar mashwara ban raha hai…</span></div>';
  const c = ui.coach;
  if (!c) return '';
  return `<div class="coach" aria-live="polite">
    <span class="badge ${c.source === 'gemini' ? 'badge-gold' : ''}">${c.source === 'gemini' ? 'Gemini ka mashwara' : 'Offline mashwara'}</span>
    <p class="coach-text">${esc(c.mashwara)}</p>
    ${c.steps.length ? `<ol class="coach-steps">${c.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>` : ''}
    <button class="btn btn-accent btn-block" data-action="coach-add" ${c.added ? 'disabled' : ''}>
      ${c.added ? `${icon.check}<span>Aaj ke task mein jur gaya</span>` : `${icon.plus}<span>Aaj Ke Task Mein Jorein</span>`}
    </button>
    ${c.note ? `<p class="muted small">${esc(c.note)}</p>` : ''}
    ${c.source === 'offline' && !hasKey() ? '<p class="muted small">Zyada khaas mashwara chahiye? <button class="link" data-action="open-sheet" data-sheet="key">AI Key lagayein</button></p>' : ''}
  </div>`;
}

function aiCard() {
  const items = buildContext(state);
  const inc = items.filter((i) => i.included).length;
  const customOn = state.mood.id === 'custom';
  const moods = S.MOODS.map((m) =>
    `<button class="chip" data-action="mood" data-id="${m.id}" aria-pressed="${state.mood.id === m.id}">${esc(m.label)}</button>`).join('')
    + (customOn ? `<button class="chip" data-action="mood-custom-keep" aria-pressed="true">${esc(state.mood.label)}</button>` : '');

  const list = items.map((it) => `<li><label class="ctx-item ${it.included ? '' : 'off'}">
      <input type="checkbox" data-action="ctx-item" data-key="${esc(it.key)}" ${it.included ? 'checked' : ''}>
      <span class="tick">${icon.check}</span><span class="ctx-text">${esc(it.text)}</span></label></li>`).join('');

  return `<section class="card">
    <div class="card-head"><h2>Aap Ki Halat</h2><span class="badge">${slotMeta().label}</span></div>
    <div class="chips" role="group" aria-label="Halat chunein">${moods}</div>
    <div class="row">
      <input id="mood-in" data-keep data-enter="mood-custom" class="input" type="text" maxlength="40" placeholder="Ya apni halat likhein…" autocomplete="off" aria-label="Apni halat likhein">
      <button class="btn btn-soft" data-action="mood-custom">Set</button>
    </div>

    <div class="ctx">
      <button class="ctx-head" data-action="toggle-ctx" aria-expanded="${ui.ctxOpen}" aria-controls="ctx-body">
        ${icon.eye}<span>AI Ko Kya Dikhega</span><span class="badge">${inc}/${items.length}</span><span class="chev">${icon.chevron}</span>
      </button>
      <div class="ctx-body" id="ctx-body" ${ui.ctxOpen ? '' : 'hidden'}>
        <p class="muted small">Gemini ko sirf yeh list jati hai. Jo cheez nahi dikhani, uska tick hata dein.</p>
        <ul class="ctx-list">${list}</ul>
        <p class="muted small">Kabhi nahi jata: API key, purani history, doosray waqt ke kaam.</p>
      </div>
    </div>

    <button class="btn btn-dark btn-lg btn-block" data-action="coach" ${ui.coachBusy ? 'disabled' : ''}>${icon.spark}<span>Mashwara Lo</span></button>
    ${coachHTML()}
  </section>`;
}

function render() {
  const view = $('#view');
  const y = window.scrollY;
  const keep = {};
  view.querySelectorAll('input[data-keep]').forEach((i) => { keep[i.id] = i.value; });
  const active = document.activeElement && document.activeElement.id && keep[document.activeElement.id] !== undefined
    ? { id: document.activeElement.id, pos: document.activeElement.selectionStart } : null;

  view.innerHTML = habitsCard() + timerCard() + goalsCard() + aiCard();

  Object.entries(keep).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
  if (active) {
    const el = document.getElementById(active.id);
    if (el) { el.focus(); try { el.setSelectionRange(active.pos, active.pos); } catch { /* ignore */ } }
  }
  renderChrome();
  window.scrollTo(0, y);
}

/* ------------------------------------------------------------------- toast */
function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 220);
}
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-action="${action.act}">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
}

/* ------------------------------------------------------------------ sheets */
const DAYS = ['Itw', 'Pir', 'Man', 'Bud', 'Jer', 'Jum', 'Haf'];
const fmtTime = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function sheetNaya(d) {
  const edit = d.mode === 'edit';
  const title = !edit ? 'Naya jorein' : d.kind === 'goal' ? 'Goal tabdeel karein' : d.kind === 'step' ? 'Qadam tabdeel karein' : 'Kaam tabdeel karein';
  const kinds = edit ? '' : `<div class="seg seg-full" role="group" aria-label="Qisam">
      <button class="seg-btn ${d.kind === 'task' ? 'is-on' : ''}" data-action="naya-kind" data-kind="task">Aadat / Kaam</button>
      <button class="seg-btn ${d.kind === 'goal' ? 'is-on' : ''}" data-action="naya-kind" data-kind="goal">Baray Goal</button></div>`;
  const slots = d.kind === 'step' ? '' : `<label class="label">Kis waqt?</label>
    <div class="chips">${S.SLOTS.map((s) => `<button class="chip" data-action="naya-slot" data-slot="${s.id}" aria-pressed="${d.slot === s.id}">${s.label}</button>`).join('')}</div>`;
  const label = d.kind === 'goal' ? 'Goal kya hai?' : d.kind === 'step' ? 'Qadam' : 'Kya karna hai?';
  let buttons;
  if (edit) buttons = '<button class="btn btn-accent btn-lg btn-block" data-action="naya-save">Mehfooz karein</button>';
  else if (d.kind === 'goal') buttons = `<button class="btn btn-gold btn-lg btn-block" data-action="naya-save" data-plan="1">${icon.spark}<span>Smart Plan Banao</span></button>
      <button class="btn btn-ghost btn-block" data-action="naya-save">Sirf goal jorein</button>`;
  else buttons = '<button class="btn btn-accent btn-lg btn-block" data-action="naya-save">Jorein</button>';
  return {
    title,
    body: `${kinds}<label class="label" for="naya-in">${label}</label>
      <input id="naya-in" data-enter="naya-save" class="input" type="text" maxlength="${d.kind === 'step' ? 120 : 80}" value="${esc(d.text || '')}" autocomplete="off">
      ${slots}<div class="stack">${buttons}</div>`,
  };
}

function sheetKey() {
  const saved = hasKey();
  return {
    title: 'Gemini AI Key',
    body: `<p class="muted">Key optional hai. Bina key ke bhi poori offline coaching chalti hai. Key lagane par Gemini aap ki halat dekh kar zyada khaas mashwara deta hai.</p>
      ${saved ? `<p class="status"><i class="dot"></i> Key lagi hui hai (••••${esc(ai.key.slice(-4))})</p>` : ''}
      <label class="label" for="key-in">Gemini API Key</label>
      <input id="key-in" data-enter="key-save" class="input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${saved ? 'Nayi key (khali chhorein to purani rahegi)' : 'AIza…'}">
      <label class="label" for="model-in">Model (zaroorat ho to badlein)</label>
      <input id="model-in" data-enter="key-save" class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ai.model)}" placeholder="${DEFAULT_MODEL}">
      <div class="stack">
        <button class="btn btn-accent btn-lg btn-block" data-action="key-save">Mehfooz karein</button>
        <button class="btn btn-soft btn-block" data-action="key-test">Key test karein</button>
        ${saved ? '<button class="btn btn-ghost btn-block danger-text" data-action="key-clear">Key hata dein</button>' : ''}
      </div>
      <div class="note">${icon.shield}<p>Key sirf is device ke storage mein rehti hai. Gemini ko sirf "AI Ko Kya Dikhega" wali list jati hai (Smart Plan mein goal ka naam bhi). Key password ki tarah hai, kisi se share na karein.</p></div>
      <p class="muted small">Key yahan se banayein: <a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></p>`,
  };
}

function sheetStreak() {
  const n = S.streakNow(state);
  const best = Math.max(state.streak.best, n);
  const todayKey = S.dateKey();
  let week = '';
  for (let i = 6; i >= 0; i--) {
    const k = S.addDays(todayKey, -i);
    const [y, m, d] = k.split('-').map(Number);
    const on = !!state.activeDays[k];
    week += `<div class="day ${on ? 'on' : ''} ${i === 0 ? 'today' : ''}"><i>${icon.check}</i><span>${DAYS[new Date(y, m - 1, d).getDay()]}</span></div>`;
  }
  return {
    title: 'Aap ka Streak',
    body: `<div class="streak-big">${n}</div><p class="center muted">din ka streak</p>
      <div class="week" aria-label="Pichhle 7 din">${week}</div>
      <p class="center">Behtareen streak: <b>${best} din</b></p>
      <p class="muted small center">Din tab gina jata hai jab aap kam az kam ek kaam ya qadam mukammal karein, ya ek focus session poora karein.</p>`,
  };
}

function sheetHistory() {
  const rows = state.history.length
    ? `<ul class="hist">${state.history.map((h) => `<li><span>${esc(h.text)}</span><time>${fmtTime(h.t)}</time></li>`).join('')}</ul>
       <div class="stack"><button class="btn btn-ghost btn-block danger-text" data-action="history-clear">History saaf karein</button></div>`
    : '<p class="empty">Abhi koi record nahi. Pehla kaam mukammal karte hi yahan nazar aayega.</p>';
  return { title: 'History', body: rows };
}

function renderSheet() {
  const d = ui.sheet;
  if (!d) return;
  const { title, body } = { naya: sheetNaya, key: sheetKey, streak: sheetStreak, history: sheetHistory }[d.name](d);
  $('#sheet-body').innerHTML = `<div class="sheet-head"><h2>${title}</h2>
    <button class="icon-btn" data-action="close-sheet" aria-label="Band karein">${icon.close}</button></div>${body}`;
}

function openSheet(name, data = {}) {
  ui.sheet = { name, ...data };
  renderSheet();
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  sheet.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('lock');
  requestAnimationFrame(() => {
    sheet.classList.add('is-open');
    scrim.classList.add('show');
    const first = $('#sheet-body input');
    if (first && name !== 'streak' && name !== 'history') first.focus();
  });
}

function closeSheet() {
  if (!ui.sheet) return;
  ui.sheet = null;
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  sheet.classList.remove('is-open');
  scrim.classList.remove('show');
  document.body.classList.remove('lock');
  setTimeout(() => { if (!ui.sheet) { sheet.hidden = true; scrim.hidden = true; } }, 260);
}

function syncNaya() {
  const el = $('#naya-in');
  if (el && ui.sheet && ui.sheet.name === 'naya') ui.sheet.text = el.value;
}

/* ----------------------------------------------------------------- actions */
function setSlot(id) {
  if (id === state.slot) return;
  state.slot = id;
  ui.coach = null;
  persist();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removed(r, label) {
  if (!r) return;
  ui.undo = r;
  persist();
  render();
  toast(`${label} mita diya`, { act: 'undo', label: 'Wapas' });
}

async function makePlan(title) {
  if (ui.planBusy) return;
  const slot = state.slot;
  ui.planBusy = true;
  render();
  const items = buildContext(state);
  const facts = factsFrom(items);
  let steps;
  let note = '';
  if (hasKey()) {
    try {
      steps = await askPlan({ key: ai.key, model: ai.model, contextText: contextToText(items), goal: title });
    } catch (e) {
      note = e.userMessage || 'Gemini nahi chala';
    }
  }
  const gemini = !!steps;
  if (!steps) steps = offlinePlan(title, facts);
  S.addGoal(state, slot, title, steps);
  S.log(state, 'plan', `Smart Plan: ${title}`);
  persist();
  ui.planBusy = false;
  const inp = $('#goal-in');
  if (inp) inp.value = '';
  render();
  toast(gemini ? `${steps.length} qadam ka Gemini plan ban gaya`
    : note ? `${note} — offline plan bana diya` : `${steps.length} qadam ka plan ban gaya`);
}

async function coach() {
  if (ui.coachBusy) return;
  const items = buildContext(state);
  const facts = factsFrom(items);
  ui.coachBusy = true;
  ui.coach = null;
  render();
  let result;
  let note = '';
  if (hasKey()) {
    try {
      result = await askCoach({ key: ai.key, model: ai.model, contextText: contextToText(items) });
    } catch (e) {
      note = `${e.userMessage || 'Gemini nahi chala'} — is liye offline mashwara diya.`;
    }
  }
  if (!result) result = offlineCoach(facts);
  result.note = note;
  result.added = false;
  result.slot = state.slot;
  ui.coach = result;
  ui.coachBusy = false;
  S.log(state, 'coach', `Mashwara liya (${slotMeta().label}, ${state.mood.label})`);
  persist();
  render();
  requestAnimationFrame(() => { const c = $('.coach'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
}

const act = {
  nav: (el) => setSlot(el.dataset.slot),
  back: () => { const i = S.SLOTS.findIndex((s) => s.id === state.slot); if (i > 0) setSlot(S.SLOTS[i - 1].id); },
  next: () => { const i = S.SLOTS.findIndex((s) => s.id === state.slot); if (i < S.SLOTS.length - 1) setSlot(S.SLOTS[i + 1].id); },

  quick: (el) => {
    const r = S.addTask(state, state.slot, el.dataset.title);
    if (r.error) { toast('Yeh pehle se list mein hai'); return; }
    buzz(); persist(); render();
  },
  'add-custom': () => {
    const inp = $('#task-in');
    const r = S.addTask(state, state.slot, inp ? inp.value : '');
    if (r.error === 'khali') { toast('Pehle kaam likhein'); return; }
    if (r.error) { toast('Yeh kaam pehle se maujood hai'); return; }
    inp.value = '';
    buzz(); persist(); render();
  },
  'toggle-task': (el) => { const r = S.toggleTask(state, el.dataset.id); if (r && r.done) buzz(); persist(); render(); },
  'edit-task': (el) => {
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    if (t) openSheet('naya', { mode: 'edit', kind: 'task', id: t.id, text: t.title, slot: t.slot });
  },
  'delete-task': (el) => removed(S.removeTask(state, el.dataset.id), 'Kaam'),

  'timer-dur': (el) => { timers.setMinutes(state.slot, Number(el.dataset.min)); render(); },
  'timer-toggle': () => { if (timers.isRunning(state.slot)) timers.pause(state.slot); else timers.start(state.slot); render(); },
  'timer-reset': () => { timers.reset(state.slot); render(); },

  'smart-plan': () => {
    const inp = $('#goal-in');
    const title = inp ? inp.value.trim() : '';
    if (!title) { toast('Pehle baray goal likhein'); if (inp) inp.focus(); return; }
    makePlan(title);
  },
  'goal-empty': () => {
    const inp = $('#goal-in');
    const g = S.addGoal(state, state.slot, inp ? inp.value : '', []);
    if (!g) { toast('Pehle baray goal likhein'); if (inp) inp.focus(); return; }
    inp.value = '';
    persist(); render();
  },
  'toggle-step': (el) => { const r = S.toggleStep(state, el.dataset.goal, el.dataset.id); if (r && r.step.done) buzz(); persist(); render(); },
  'add-step': (el) => {
    const id = el.dataset.id;
    const inp = document.getElementById(`step-in-${id}`);
    if (!S.addStep(state, id, inp ? inp.value : '')) { toast('Pehle qadam likhein'); return; }
    inp.value = '';
    persist(); render();
    const again = document.getElementById(`step-in-${id}`);
    if (again) again.focus();
  },
  'edit-step': (el) => {
    const g = state.goals.find((x) => x.id === el.dataset.goal);
    const s = g && g.steps.find((x) => x.id === el.dataset.id);
    if (s) openSheet('naya', { mode: 'edit', kind: 'step', id: s.id, goalId: g.id, text: s.text });
  },
  'delete-step': (el) => removed(S.removeStep(state, el.dataset.goal, el.dataset.id), 'Qadam'),
  'edit-goal': (el) => {
    const g = state.goals.find((x) => x.id === el.dataset.id);
    if (g) openSheet('naya', { mode: 'edit', kind: 'goal', id: g.id, text: g.title, slot: g.slot });
  },
  'delete-goal': (el) => removed(S.removeGoal(state, el.dataset.id), 'Goal'),

  mood: (el) => {
    const m = S.MOODS.find((x) => x.id === el.dataset.id);
    if (!m) return;
    state.mood = { ...m };
    ui.coach = null;
    persist(); render();
  },
  'mood-custom': () => {
    const inp = $('#mood-in');
    const text = S.clip(inp ? inp.value : '', 40);
    if (!text) { toast('Pehle apni halat likhein'); return; }
    state.mood = { id: 'custom', label: text };
    ui.coach = null;
    inp.value = '';
    persist(); render();
  },
  'mood-custom-keep': () => {},

  'toggle-ctx': () => { ui.ctxOpen = !ui.ctxOpen; render(); },
  'ctx-item': (el) => {
    const key = el.dataset.key;
    if (el.checked) delete state.excluded[key]; else state.excluded[key] = true;
    persist(); render();
    const again = document.querySelector(`[data-action="ctx-item"][data-key="${CSS.escape(key)}"]`);
    if (again) again.focus();
  },

  coach,
  'coach-add': () => {
    const c = ui.coach;
    if (!c || c.added) return;
    let added = 0;
    c.steps.forEach((s) => { if (S.addTask(state, c.slot, s.replace(/["“”]/g, '')).task) added += 1; });
    c.added = true;
    persist(); render();
    toast(added ? `${added} task aaj ki list mein jur gaye` : 'Yeh task pehle se list mein hain');
  },

  'open-sheet': (el) => {
    const name = el.dataset.sheet;
    if (name === 'naya') openSheet('naya', { mode: 'add', kind: 'task', text: '', slot: state.slot });
    else openSheet(name);
  },
  'close-sheet': closeSheet,
  'naya-kind': (el) => { syncNaya(); ui.sheet.kind = el.dataset.kind; renderSheet(); const i = $('#naya-in'); if (i) i.focus(); },
  'naya-slot': (el) => { syncNaya(); ui.sheet.slot = el.dataset.slot; renderSheet(); },
  'naya-save': (el) => {
    syncNaya();
    const d = ui.sheet;
    const text = S.clip(d.text, 120);
    if (!text) { toast('Pehle kuch likhein'); return; }

    if (d.mode === 'edit') {
      if (d.kind === 'task') S.editTask(state, d.id, { title: text, slot: d.slot });
      if (d.kind === 'goal') S.editGoal(state, d.id, { title: text, slot: d.slot });
      if (d.kind === 'step') S.editStep(state, d.goalId, d.id, text);
      persist(); closeSheet(); render(); toast('Tabdeel ho gaya');
      return;
    }
    if (d.kind === 'task') {
      const r = S.addTask(state, d.slot, text);
      if (r.error) { toast('Yeh kaam pehle se maujood hai'); return; }
      state.slot = d.slot; persist(); closeSheet(); render();
      return;
    }
    // goal
    state.slot = d.slot;
    closeSheet();
    if (el.dataset.plan) { makePlan(text); return; }
    S.addGoal(state, d.slot, text, []);
    persist(); render();
  },

  'key-save': () => {
    const k = $('#key-in').value.trim();
    const model = $('#model-in').value.trim();
    if (k && k.length < 20) { toast('Key bohat chhoti lag rahi hai'); return; }
    ai = { key: k || ai.key, model };
    S.saveAI(ai);
    closeSheet(); render();
    toast(ai.key ? 'Key mehfooz ho gayi' : 'Model mehfooz ho gaya');
  },
  'key-test': async (el) => {
    const key = $('#key-in').value.trim() || ai.key;
    if (!key) { toast('Pehle key likhein'); return; }
    const model = $('#model-in').value.trim() || ai.model;
    const old = el.textContent;
    el.disabled = true;
    el.textContent = 'Test ho raha hai…';
    try { await testKey({ key, model }); toast('Key theek chal rahi hai'); }
    catch (e) { toast(e.userMessage || 'Test nahi chala'); }
    el.disabled = false;
    el.textContent = old;
  },
  'key-clear': () => {
    S.clearAIKey();
    ai = S.loadAI();
    closeSheet(); render();
    toast('Key hata di. Ab offline coaching chalegi');
  },
  'history-clear': () => {
    if (!confirm('Poori history saaf kar dein?')) return;
    state.history = [];
    persist();
    renderSheet();
  },

  undo: () => {
    if (!ui.undo) return;
    S.restore(state, ui.undo);
    ui.undo = null;
    persist(); render(); hideToast();
  },
};

/* ------------------------------------------------------------------ events */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled || el.tagName === 'INPUT') return;
  const fn = act[el.dataset.action];
  if (fn) fn(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches && el.matches('input[data-action]')) { const fn = act[el.dataset.action]; if (fn) fn(el, e); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-enter]')) {
    e.preventDefault();
    const fn = act[e.target.dataset.enter];
    if (fn) fn(e.target, e);
  }
  if (e.key === 'Escape' && ui.sheet) closeSheet();
});
$('#scrim').addEventListener('click', closeSheet);

/* ------------------------------------------------------------------- start */
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
