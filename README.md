# Roshni Lite

Mobile-first coaching app (installable PWA). Plain HTML/CSS/JS, koi build step ya package nahi.
UI aur AI ke jawab sada Roman Urdu mein. Bina Gemini key ke bhi poori offline coaching chalti hai.

## Structure

```
roshni-lite/
├─ index.html              # shell: header, pills, tabs, bottom bar, sheets
├─ manifest.webmanifest    # PWA (install karne ke liye)
├─ sw.js                   # offline cache (Gemini requests ko nahi chheda)
├─ css/style.css           # cream / espresso / amber theme
├─ icons/                  # icon.svg, icon-192.png, icon-512.png
├─ js/
│  ├─ app.js               # UI + events
│  ├─ store.js             # state, localStorage, streak, tasks, goals
│  ├─ context.js           # "AI Ko Dikhane Wali List" (Safe Context Filter)
│  ├─ gemini.js            # Gemini REST + system instructions
│  ├─ offline.js           # key ke bina coaching / plan
│  ├─ timer.js             # 15/25 min focus timer (har waqt ka apna)
│  └─ icons.js
└─ tests/logic.test.mjs    # node tests/logic.test.mjs
```

## AI Context List kaise kaam karti hai

`context.js` har baar state se list banata hai. **Jata hai:** mojooda waqt, halat, kaam ki summary,
baqi kaam (max 4), mukammal kaam (max 3), streak, active goal ka agla qadam.
**Nahi jata:** API key, history, doosray waqt ke kaam, purane goals.
Email / phone / link khud chhup jate hain. User "AI Ko Kya Dikhega" mein kisi bhi item ka tick hata sakta hai;
offline coaching bhi isi filtered list se chalti hai. Smart Plan mein goal ka naam bhi Gemini ko jata hai.

## Run karna

```bash
cd roshni-lite
python3 -m http.server 8080      # ya: npx serve .
```
Laptop par `http://localhost:8080` kholein (ES modules ki wajah se `file://` se nahi chalta).

## Phone par test

1. **Fori (Android + Chrome):** USB se phone jorein, laptop Chrome mein `chrome://inspect/#devices` ->
   *Port forwarding* mein `8080 -> localhost:8080`, phir phone par `http://localhost:8080` kholein.
   Yeh "secure context" hai, is liye install aur offline dono chalte hain.
2. **Same Wi-Fi:** phone par `http://<laptop-ka-IP>:8080`. App chalegi, magar install/offline (service worker) nahi.
3. **Asli install:** Netlify / Vercel / GitHub Pages (HTTPS) par folder upload karein, phone mein kholein ->
   Chrome menu -> *Add to Home screen* (iPhone: Safari -> Share -> *Add to Home Screen*).
4. **Native APK/IPA chahiye?** Capacitor: web files ko `www/` mein rakhein, phir
   `npm i @capacitor/core @capacitor/cli && npx cap init && npx cap add android && npx cap sync && npx cap open android`.

## Gemini key

AI Key pill -> key paste karein (aistudio.google.com/apikey se milti hai) -> *Key test karein*.
Default model `gemini-3.8-flash` hai; naam badal jaye to drawer mein model likh dein. Model na mile to
`gemini-3.5-flash-lite`, phir `gemini-2.5-flash` khud try hote hain. Koi error aaye to offline coaching chal jati hai.

**Zaroori:** key is device ke localStorage mein rehti hai, yani apne istemal ke liye theek hai. Dosron ko
dene wali app mein key app ke andar na rakhein; chhota sa backend proxy banayein jo key server par rakhe.
Free tier mein Google data ko apne products behtar karne ke liye istemal kar sakta hai, is liye Google ki
shartein dekh lein aur list chhoti rakhein.

## Tests

```bash
node tests/logic.test.mjs
```
