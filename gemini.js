// gemini.js — Google Gemini API (REST) se coaching aur Smart Plan.
// Gemini ko sirf "AI Context List" ka text (aur plan ke waqt goal ka naam) bheja jata hai.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Model ke naam badalte rehte hain, is liye AI Key drawer mein model editable hai.
// Pehla model na mile (404) to neeche wale try hote hain.
export const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];

export const SYSTEM_COACH = `You are "Roshni", a warm, calm daily coach inside a small mobile app called Roshni Lite.

LANGUAGE: Reply ONLY in simple Roman Urdu (Urdu written in English letters, e.g. "Aaj halka kaam karein"). Never use Urdu script, never reply in English or Hindi script.

INPUT: You receive an "AI Context List" with only the facts the user chose to share (current time of day, their state, tasks, streak, active goal). Use ONLY that list. Do not assume anything outside it and do not ask for personal details.

TONE AND INTENSITY, based on the user's state ("Halat"):
- thaka hua / tired: be gentle, very light, one tiny 5-10 minute step, suggest water or a short break.
- kam waqt / short on time: pick the single most important task, a 10 minute step.
- fresh / energetic: be focused and direct, give the next meaningful step, a 25 minute focus block is fine.
- atka hua / stuck: give the smallest possible 2-minute start and suggest changing place or method.
- any other custom state: read it and choose a fitting tone.

OUTPUT (JSON only): "mashwara" = 2 or 3 short sentences of advice; "steps" = 1 or 2 concrete action steps, each under 12 words, doable today. Be kind, never preachy, no medical or psychological diagnosis, no big promises. If the user sounds hopeless or mentions harming themselves, gently suggest talking to someone they trust or a local helpline.`;

export const SYSTEM_PLAN = `You are "Roshni", a planning coach inside a mobile app called Roshni Lite.

LANGUAGE: Reply ONLY in simple Roman Urdu (Urdu written in English letters). Never use Urdu script.

TASK: Break the user's big goal into 4 to 6 small, concrete, ordered steps. Each step must be under 14 words and doable in one sitting (mention minutes when useful). Use the "AI Context List" only to set the intensity: if the user is tired, short on time or stuck, make the first steps very small (5 minutes); if fresh, the first step can be a 25 minute focus block.

OUTPUT (JSON only): {"steps": [ ... ]}`;

const COACH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    mashwara: { type: 'STRING' },
    steps: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 2 },
  },
  required: ['mashwara', 'steps'],
};

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: { steps: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 6 } },
  required: ['steps'],
};

function fail(userMessage, extra = {}) {
  return Object.assign(new Error(userMessage), { userMessage, ...extra });
}

async function request({ key, model, system, user, schema, timeoutMs = 30000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3072,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw fail(e.name === 'AbortError' ? 'Gemini ka jawab der se aaya' : 'Internet ya network ka masla', { network: true });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* ignore */ }
    if (res.status === 404) throw fail('Yeh model nahi mila', { notFound: true });
    if (res.status === 429) throw fail('Gemini ki limit poori ho gayi, thori der baad try karein');
    if (res.status === 401 || res.status === 403 || /API key/i.test(detail)) throw fail('API key sahi nahi lag rahi');
    throw fail(`Gemini ne error diya (${res.status})`);
  }

  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts
    ? cand.content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) throw fail(data.promptFeedback?.blockReason ? 'Gemini ne yeh request roak di' : 'Gemini ka jawab khali aaya');
  try {
    return JSON.parse(text);
  } catch {
    throw fail('Gemini ka jawab samajh nahi aaya');
  }
}

// Model na milne par fallback models try karta hai.
async function run(opts) {
  const first = (opts.model || DEFAULT_MODEL).trim();
  const list = [first, ...FALLBACK_MODELS.filter((m) => m !== first)];
  let last;
  for (const model of list) {
    try {
      return await request({ ...opts, model });
    } catch (e) {
      last = e;
      if (!e.notFound) throw e;
    }
  }
  throw last;
}

const text = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function askCoach({ key, model, contextText }) {
  const out = await run({
    key, model, system: SYSTEM_COACH, schema: COACH_SCHEMA,
    user: `${contextText}\n\nIs list ke mutabiq mujhe mashwara aur 1-2 chhote action steps do.`,
  });
  const steps = (Array.isArray(out.steps) ? out.steps : []).map((s) => text(s, 120)).filter(Boolean).slice(0, 2);
  const mashwara = text(out.mashwara, 600);
  if (!mashwara) throw fail('Gemini ka jawab adhoora tha');
  return { mashwara, steps, source: 'gemini' };
}

export async function askPlan({ key, model, contextText, goal }) {
  const out = await run({
    key, model, system: SYSTEM_PLAN, schema: PLAN_SCHEMA,
    user: `${contextText}\n\nBara goal: "${text(goal, 80)}"\nIs ko chhote qadamon mein todo.`,
  });
  const steps = (Array.isArray(out.steps) ? out.steps : []).map((s) => text(s, 120)).filter(Boolean).slice(0, 6);
  if (steps.length < 2) throw fail('Gemini ne plan poora nahi diya');
  return steps;
}

// Key theek hai ya nahi — sirf ek chhota sa test (koi zaati data nahi jata).
export async function testKey({ key, model }) {
  await run({
    key, model, system: SYSTEM_COACH, schema: COACH_SCHEMA,
    user: 'AI Context List:\n- Mojooda waqt: Subah\n- Halat: Fresh hoon\n\nSirf ek jumla likho.',
    timeoutMs: 20000,
  });
  return true;
}
