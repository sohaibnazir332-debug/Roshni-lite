// offline.js — API key ke bina bhi chalne wali coaching aur plan.
// Input wohi "facts" hain jo AI Context List se nikalte hain (exclude kiye hue items shamil nahi).

// Halat ko 5 qismon mein baant deta hai (chip ho ya user ka likha hua).
export function classifyMood(mood) {
  if (!mood) return 'neutral';
  if (['fresh', 'thaka', 'kamwaqt', 'atka'].includes(mood.id)) return mood.id;
  const t = String(mood.label || '').toLowerCase();
  if (/thak|neend|sust|udas|dukhi|bore|bimar|tired/.test(t)) return 'thaka';
  if (/waqt|jaldi|masroof|busy|hurry/.test(t)) return 'kamwaqt';
  if (/atk|phans|confus|samajh|stuck|block/.test(t)) return 'atka';
  if (/fresh|theek|acha|achha|energy|tayyar|khush|motivat/.test(t)) return 'fresh';
  return 'neutral';
}

const SLOT_NOTE = {
  subah: 'Din ki shuruaat mein sab se zaroori kaam pehle rakhein.',
  dopahar: 'Dopahar mein energy ghat sakti hai, thoda paani aur chhota break madadgar rahega.',
  shaam: 'Shaam ko din ka chhota sa jaiza lein aur kal ka pehla kaam likh lein.',
};

const target = (f) => (f.goal && f.goal.next) || f.pending[0] || null;
const q = (s) => `"${s}"`;

export function offlineCoach(facts) {
  const kind = classifyMood(facts.mood);
  const t = target(facts);
  let mashwara;
  let steps;

  if (kind === 'thaka') {
    mashwara = 'Aaj jism thoda thaka hua lag raha hai, is liye khud par bojh na daalein. Pehle paani piyein aur 2-3 gehri saansein lein. Chhota qadam bhi qadam hi hota hai.';
    steps = [
      t ? `${q(t)} sirf 5 minute ke liye karein` : 'Aaj ka sab se halka kaam list mein jorein',
      '5 minute ka break lein aur paani piyein',
    ];
  } else if (kind === 'kamwaqt') {
    mashwara = 'Waqt kam hai, is liye sirf ek sab se zaroori kaam chunein. Baqi sab ko baad ke liye chhor dein, is mein koi burai nahi.';
    steps = [
      t ? `Sirf ${q(t)} 10 minute mein karein` : 'Sab se zaroori ek kaam chunein aur 10 minute dein',
      'Phone door rakh kar timer lagayein',
    ];
  } else if (kind === 'fresh') {
    mashwara = 'Aap fresh hain, yehi asal kaam ka sahi mauqa hai. 25 minute ka focus timer lagayein aur sirf ek kaam par rahein.';
    steps = [
      t ? `${q(t)} par 25 minute focus karein` : 'Sab se ahem kaam chunein aur 25 minute ka timer lagayein',
      'Timer ke baad 5 minute ka break lein',
    ];
  } else if (kind === 'atka') {
    mashwara = 'Atak jana bilkul normal hai. Bara kaam chhor kar sab se chhota aaghaz chunein jo sirf 2 minute ka ho. Jagah ya tareeqa badalna bhi madad karta hai.';
    steps = [
      t ? `${q(t)} ka sirf pehla 2 minute karein` : 'Jo kaam atka hua hai uski pehli line likhein',
      'Jagah badlein ya masla ek jumle mein likh dein',
    ];
  } else {
    mashwara = 'Ek waqt mein ek hi kaam karein. Apni list se agla sab se asaan kaam chunein aur shuru kar dein.';
    steps = [
      t ? `${q(t)} se aaghaz karein` : 'Aaj ka pehla chhota kaam list mein jorein',
    ];
  }

  if (facts.slot && SLOT_NOTE[facts.slot]) mashwara += ' ' + SLOT_NOTE[facts.slot];
  if (facts.streak > 0 && kind !== 'neutral') mashwara += ` Aap ka ${facts.streak} din ka streak chal raha hai, use na toren.`;
  return { mashwara, steps: steps.slice(0, 2), source: 'offline' };
}

// Baray goal ko chhote qadamon mein todna (bina AI ke).
export function offlinePlan(goalTitle, facts) {
  const kind = classifyMood(facts && facts.mood);
  const small = kind === 'thaka' || kind === 'kamwaqt' || kind === 'atka';
  const g = String(goalTitle).slice(0, 60);
  return [
    `${q(g)} ka maqsad ek jumle mein likhein (2 minute)`,
    'Zaroori cheezon aur madad ki chhoti list banayein (10 minute)',
    small ? 'Sab se pehla chhota hissa sirf 5 minute ke liye shuru karein' : 'Sab se pehla hissa 25 minute focus ke saath shuru karein',
    'Jo bana usay ek baar dekh kar kamiyan note karein',
    'Kal ka agla qadam likh kar aaj ka kaam band karein',
  ];
}
