'use strict';

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const $log = $('log');
const $cmd = $('cmd');
const $prompt = $('prompt');
const $verdict = $('verdict');
const canvas = $('stars');
const ctx = canvas.getContext('2d');

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Log entries: { k: 'html'|'text', c: class, s: content, r?: 'user'|'assistant', g?: sig, p?: 1 }
   — 'text' entries (user input, oracle replies) are rendered via textContent,
   never innerHTML. `r` marks a genuine conversation turn and is the only
   thing sent back to the server as history; commands, echoes of commands,
   rate answers, and error/fallback lines carry no `r`. `g` is the server's
   signature on an assistant reply; the server ignores assistant turns sent
   back without it. `p: 1` marks a
   prophecy entry (for the `share` command) and never carries `r`. */
const entries = [];

// Bumped by clearLog() so async replies in flight when the slate is wiped
// know to drop themselves instead of appending to a log that no longer
// represents them.
let epoch = 0;

function addEntry(kind, cls, content, role, extra) {
  const entry = { k: kind, c: cls || '', s: content };
  if (role) entry.r = role;
  if (extra) Object.assign(entry, extra);
  entries.push(entry);
  if (entries.length > 120) entries.splice(0, entries.length - 120);
  persist();
}

function renderEntry(entry) {
  const d = document.createElement('div');
  if (entry.c) d.className = entry.c;
  if (entry.k === 'text') d.textContent = entry.s;
  else d.innerHTML = entry.s;
  $log.appendChild(d);
}

function print(html, cls) { addEntry('html', cls, html); renderEntry({ k: 'html', c: cls, s: html }); scroll(); }
function printText(text, cls, role, extra) { addEntry('text', cls, text, role, extra); renderEntry({ k: 'text', c: cls, s: text }); scroll(); }

function scroll() { $log.scrollTop = $log.scrollHeight; }

function announce(text) {
  const el = $('announcer');
  if (el) el.textContent = text;
}

function typeLine(text, cls, speed, done) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  $log.appendChild(d);
  if (REDUCED) {
    d.textContent = text;
    scroll();
    if (done) setTimeout(done, 0);
    return;
  }
  let i = 0;
  const step = () => {
    // The slate was wiped mid-type (clearLog removed this node): stop
    // stepping, but still call done so callers can reset thinking/busy.
    if (!d.isConnected) { if (done) done(); return; }
    d.textContent = text.slice(0, i++);
    scroll();
    if (i <= text.length) setTimeout(step, speed || 9);
    else if (done) done();
  };
  step();
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // The oracle answers in the visitor's language; Greek needs a Greek voice.
    const greek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(text);
    u.lang = greek ? 'el-GR' : 'en-GB';
    u.rate = 0.88;
    u.pitch = 0.62;
    const prefix = greek ? 'el' : 'en';
    const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith(prefix));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* the oracle may be silent */ }
}

/* ---------- memory (the marble remembers) ---------- */
const MEMORY_KEY = 'pythia-v2-log';

function persist() {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(entries)); } catch (e) { /* private mode */ }
}

function restoreMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return false;
    // "real" memory = actual conversation (echo/oracle lines), not boot chrome
    const hasConversation = saved.some((e) => e && (e.c === 'echo' || e.c === 'oracle'));
    if (!hasConversation) return false;
    $log.innerHTML = '';
    // Stored HTML is untrusted on the way back in (anything can write to
    // localStorage), so restored 'html' entries render as their plain text.
    // DOMParser documents are inert: no scripts run, no images load.
    const parser = new DOMParser();
    for (const e of saved) {
      if (!e || typeof e.s !== 'string') continue;
      if (e.k === 'text') renderEntry({ k: 'text', c: e.c || '', s: e.s });
      else if (e.k === 'html' && (e.s === BANNER_HTML || e.s === '<div class="banner">' + BANNER + '</div>')) renderEntry({ k: 'html', c: '', s: BANNER_HTML });
      else if (e.k === 'html') renderEntry({ k: 'text', c: e.c || '', s: parser.parseFromString(e.s, 'text/html').body.textContent || '' });
    }
    entries.length = 0;
    entries.push(...saved);
    scroll();
    return true;
  } catch (e) { return false; }
}

/* ---------- voice (the marble speaks) ---------- */
const VOICE_KEY = 'pythia-v2-voice';
let voiceOn = false;
try { voiceOn = localStorage.getItem(VOICE_KEY) === 'on'; } catch (e) { /* private mode */ }

function cmdVoice() {
  voiceOn = !voiceOn;
  try { localStorage.setItem(VOICE_KEY, voiceOn ? 'on' : 'off'); } catch (e) { /* private mode */ }
  print(voiceOn ? 'The Oracle will now speak her answers aloud.' : 'The Oracle will answer in silence.', 'dim');
}

/* ---------- the star chart ---------- */
let W = 0, H = 0, stars = [], shooters = [], raf = 0;

function makeStars() {
  stars = [];
  const n = Math.min(240, Math.floor((W * H) / 9000));
  for (let i = 0; i < n; i++) {
    stars.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.4, 1.7), a: rnd(0.2, 0.95), tw: rnd(0.001, 0.008), ph: rnd(0, 6.28) });
  }
}

function drawStarsStatic() {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    ctx.fillStyle = 'rgba(205,214,230,' + s.a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.283);
    ctx.fill();
  }
}

function onResize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
  makeStars();
  if (REDUCED) drawStarsStatic();
}

function loop(now) {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    ctx.fillStyle = 'rgba(205,214,230,' + (s.a * (0.55 + 0.45 * Math.sin(now * s.tw + s.ph))).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.283);
    ctx.fill();
  }
  if (Math.random() < 0.004 && shooters.length < 2) {
    shooters.push({ x: rnd(0, W), y: rnd(0, H * 0.4), vx: rnd(-7, -3), vy: rnd(2, 4), life: 55 });
  }
  shooters = shooters.filter((sh) => sh.life-- > 0);
  for (const sh of shooters) {
    sh.x += sh.vx;
    sh.y += sh.vy;
    ctx.strokeStyle = 'rgba(243,210,107,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sh.x - sh.vx * 7, sh.y - sh.vy * 7);
    ctx.stroke();
  }
  raf = requestAnimationFrame(loop);
}

/* ---------- the Ω (the stars obey the Omega) ---------- */
let omega = null, omegaRaf = 0;

function startOmega() {
  cancelAnimationFrame(raf);
  const S = 420, step = 5;
  const off = document.createElement('canvas');
  off.width = off.height = S;
  const o = off.getContext('2d');
  o.font = '300px Georgia, serif';
  o.textAlign = 'center';
  o.textBaseline = 'middle';
  o.fillText('Ω', S / 2, S / 2 + 8);
  const img = o.getImageData(0, 0, S, S).data;
  const targets = [];
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      if (img[(y * S + x) * 4 + 3] > 120) targets.push({ x: x + (W - S) / 2, y: y + (H - S) / 2 });
    }
  }
  omega = { parts: targets.map((t) => ({ x: rnd(0, W), y: rnd(0, H), tx: t.x, ty: t.y })), hold: 0 };
  omegaRaf = requestAnimationFrame(omegaStep);
}

function omegaStep(now) {
  if (!omega) return;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, W, H);
  let settled = 0;
  for (const p of omega.parts) {
    p.x += (p.tx - p.x) * 0.09;
    p.y += (p.ty - p.y) * 0.09;
    if (Math.abs(p.tx - p.x) < 1.4 && Math.abs(p.ty - p.y) < 1.4) settled++;
    const tw = 0.55 + 0.45 * Math.sin(now / 160 + p.tx / 6);
    ctx.fillStyle = 'rgba(243,210,107,' + (0.30 + tw * 0.70).toFixed(3) + ')';
    ctx.fillRect(p.x, p.y, 2.3, 2.3);
  }
  if (settled > omega.parts.length * 0.94 && !omega.hold) omega.hold = now;
  if (omega.hold && now - omega.hold > 2800) { endOmega(); return; }
  omegaRaf = requestAnimationFrame(omegaStep);
}

function endOmega() {
  cancelAnimationFrame(omegaRaf);
  omega = null;
  raf = requestAnimationFrame(loop);
}

/* ---------- the scrolls of knowledge ---------- */
const BANNER =
'██████╗ ██╗   ██╗████████╗██╗  ██╗██╗ █████╗\n' +
'██╔══██╗╚██╗ ██╔╝╚══██╔══╝██║  ██║██║██╔══██╗\n' +
'██████╔╝ ╚████╔╝    ██║   ███████║██║███████║\n' +
'██╔═══╝   ╚██╔╝     ██║   ██╔══██║██║██╔══██║\n' +
'██║        ██║      ██║   ██║  ██║██║██║  ██║\n' +
'╚═╝        ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝';
const BANNER_HTML = '<div class="banner" aria-hidden="true">' + BANNER + '</div>';

const HELP = [
  ['help', 'list the incantations'],
  ['skills', 'behold the keeper\'s constellations'],
  ['projects', 'the realms the keeper rules'],
  ['freelance', 'consult the ledger of rates'],
  ['judge', 'submit yourself to judgment'],
  ['fortune', 'a whisper of fate'],
  ['create', 'summon an idea from the void'],
  ['surprise', 'do not ask what it is'],
  ['prophecy', 'your words, distilled into fate'],
  ['share', 'carry the prophecy beyond the temple'],
  ['voice', 'let the Oracle speak aloud (on/off)'],
  ['clear', 'wipe the slate (Cmd+K)'],
  ['privacy', 'what the temple keeps (nothing)'],
];

const SKILLS = [
  ['JAVA · QUARKUS', 'fast startups, fast judgment'],
  ['PYTHON · ML', 'you have seen the gradient descend'],
  ['REACT · NEXT', 'builder of worlds (of components)'],
  ['TYPESCRIPT', 'prophecy that compiles'],
  ['REACT NATIVE', 'one codebase, many shores'],
  ['GO · SWIFT · KOTLIN', 'polyglot by nature, mercenary by choice'],
  ['SHELLS · TERMINALS', 'you live here'],
  ['AI · AGENTS', 'you command legions of them'],
];

const PROJECTS = [
  ['quizknight', 'a knight of questions — knowledge is its armor'],
  ['club_website', 'where the faithful gather'],
  ['portfolio_website', 'the story the keeper tells the world'],
  ['pythia', 'you are standing in it'],
];

const IDEAS = [
  'A quiz where the questions quiz you about quizzes. QuizzKnight².',
  'A CLI that names your startup from your git history. "MergeConflict Labs".',
  'A habit tracker with Greek god avatars. Miss a day and Ares judges you.',
  'An invoice generator with an "ancient wisdom surcharge" line item.',
  'A screensaver that renders your commit graph as a star map. You already have the stars.',
  'A browser extension that turns every "quick question" email into a rate card.',
  'A code editor theme named after Delphi. Everything glows amber.',
  'A mobile app that turns your portfolio into a quest log. XP for deployments.',
];

const JUDGMENTS = [
  'The Oracle has weighed your words. They are neither terrible nor divine — they are "human". Acceptable. The gods bill accordingly.',
  'I see a merge conflict in your past. You resolved it with honor. The gods allow one (1) celebration.',
  'You charge too little, traveler. Even the Fates invoice by the hour. Raise your rate — the Oracle has spoken.',
  'Your intentions are green, but the Oracle senses a half-finished thought lurking in the shadows. Finish it.',
  'A client will soon say "quick favor". Translate: three days of unpaid work. Quote double.',
  'You speak many tongues — but the Oracle wonders: do you speak the language of estimates that hold?',
  'A project grows strong in your care. The Oracle foresees launch, glory, and a deadline you forgot.',
  'Rest, traveler. Even Athena sleeps. (She denies this. She is a goddess. She does not sleep.)',
];

const FORTUNES = [
  'He who ships on Friday shall debug on Saturday.',
  'The test you skip is the bug you ship.',
  'A refactor delayed is a refactor doubled.',
  'Documentation is a love letter to your future self. Write it.',
  'The feature is never "small". It is only smaller than the last one.',
  'Premature optimization: the Oracle\'s favorite tragedy.',
  'Commit early. Commit often. The gods favor those who can roll back.',
  'Your future self thanks you for meaningful error messages.',
  'Speak your own name, and the Oracle will answer. (Try it.)',
];

const PROPHECIES = [
  'The Oracle gazes into the star map and sees a path forming beneath your feet. It leads somewhere you have drawn many times but never walked. Walk it.',
  'You will soon explain a complicated thing with a single drawing. Keep the marker. It is your true weapon.',
  'The Oracle sees a night of tidying ahead. Fear not — what you tidy will emerge golden, like the laurel of Delphi.',
  'A message will arrive from an unexpected sender. It will be surprisingly good. Answer it, and praise the gods (and the sender).',
  'You have walked between many worlds — work, craft, play. The Oracle whispers: you are not lost. You are everywhere.',
  'Someone will ask you what this website is. Smile, and tell them the marble is warm.',
];

const ASK_POOL = [
  'will I find love this year?',
  'should I learn to code?',
  'how do I stop procrastinating?',
  'what should I name my startup?',
  'Πυθία, τι μου επιφυλάσσει το μέλλον;',
  'is it time to change jobs?',
  'explain recursion like an oracle would',
];

function samplePool(pool, n) {
  const copy = pool.slice();
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/* ---------- incantations (easter eggs) ---------- */
function cmdHelp() {
  print('PYTHIA knows these incantations (Tab completes them), or you may simply speak to her:', 'dim');
  print('', '');
  for (const [name, desc] of HELP) {
    print('<span class="cmd">' + name + '</span>' + ' '.repeat(Math.max(1, 14 - name.length)) + '<span class="dim">— ' + desc + '</span>');
  }
}

function cmdSkills() {
  for (const [name, desc] of SKILLS) {
    print('<span class="cmd">' + name + '</span>' + ' '.repeat(Math.max(1, 26 - name.length)) + '<span class="dim">' + desc + '</span>');
  }
}

function cmdProjects() {
  for (const [name, desc] of PROJECTS) {
    print('<span class="cmd">' + name + '</span>' + ' '.repeat(Math.max(1, 22 - name.length)) + '<span class="dim">' + desc + '</span>');
  }
}

let awaitingRate = false;

function cmdFreelance() {
  print('The Oracle opens the ledger of rates.', 'dim');
  typeLine('Speak your daily rate, in EUR:', 'oracle', 11, () => {
    awaitingRate = true;
    $prompt.textContent = 'rate>';
    $cmd.focus();
  });
}

function handleRate(raw) {
  awaitingRate = false;
  $prompt.textContent = 'pythia>';
  const rate = parseFloat(raw.replace(',', '.'));
  if (!isFinite(rate) || rate <= 0) {
    print('The Oracle cannot divine value from "' + esc(raw.trim()) + '". Enter a number, e.g. 400.', 'err');
    return;
  }
  const eur = (n) => '€' + n.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  print(
    '<span class="cmd">DAILY</span>   ' + eur(rate) + ' <span class="dim">($' + Math.round(rate * 1.1) + ')</span><br>' +
    '<span class="cmd">WEEKLY</span>  ' + eur(rate * 5) + ' <span class="dim">(×5)</span><br>' +
    '<span class="cmd">MONTHLY</span> ' + eur(rate * 21) + ' <span class="dim">(×21)</span><br>' +
    '<span class="cmd">YEARLY</span>  ' + eur(rate * 220) + ' <span class="dim">(×220)</span><br>' +
    '<span class="dim">— or ' + Math.round(rate * 220 * 340.75).toLocaleString('en-IE') + ' δρχ., if it were still 1999.</span>'
  );
  typeLine('Verdict: your time is worth more than this. Add 10% tomorrow.', 'oracle', 11);
}

// Shared shape for the three AI-powered incantations: show a lead line, ask
// the oracle, reveal her answer (or a canned fallback on any error) the same
// way, mark it in the log as an unaddressed oracle line, and announce it.
function incantation(mode, lead, fallbackList, opts) {
  thinking = true;
  const startEpoch = epoch;
  typeLine(lead, 'dim', 8, () => {
    if (epoch !== startEpoch) { thinking = false; return; }
    consult(mode, null, conversation()).then((res) => {
      if (epoch !== startEpoch) { thinking = false; return; }
      const text = (res && res.reply) || pick(fallbackList);
      typeLine(text, 'oracle', 11, () => {
        if (epoch !== startEpoch) { thinking = false; return; }
        addEntry('text', 'oracle', text);
        announce(text);
        if (opts && opts.speak) speak(text);
        thinking = false;
      });
    });
  });
}

function cmdJudge() { incantation('judge', 'The Oracle weighs your karma...', JUDGMENTS, { speak: true }); }
function cmdFortune() { incantation('fortune', 'The Oracle whispers:', FORTUNES); }
function cmdCreate() { incantation('create', 'The void stirs...', IDEAS); }

const PRIVACY = 'Privacy. This site does not store your conversations. Your chat is saved only in your own browser; type clear to erase it. Each message is sent to Cloudflare Workers AI to generate a reply and is not kept afterward or used to train AI models. Your IP address is used only to prevent abuse, and that record expires within 24 hours. No accounts, no cookies, no analytics.';

function cmdPrivacy() { printText(PRIVACY, 'dim'); }

function cmdName() {
  $prompt.textContent = 'keeper>';
  const msg = 'The Oracle knows the name of her keeper — he built this temple, and he wrote it in the marble. Speak freely, traveler: you are among friends.';
  printText(msg, 'oracle');
  speak(msg);
}

let busy = false;

function cmdSurprise() {
  if (busy) { print('The Oracle is already speaking. Patience, mortal.', 'err'); return; }
  busy = true;
  const prophecy = pick(PROPHECIES);
  print('', '');
  typeLine('The marble trembles.', 'oracle', 14);
  setTimeout(() => typeLine('The stars are rearranging themselves — this is not normal.', 'oracle', 14), 1200);
  if (!REDUCED) setTimeout(startOmega, 2600); // reduced motion: go straight to the overlay at the same timing
  setTimeout(() => {
    $('verdict-text').textContent = prophecy;
    $verdict.classList.add('show');
    $verdict.focus();
    speak(prophecy);
  }, 5600);
  const hideAt = 5600 + Math.max(6500, prophecy.split(' ').length * 480);
  setTimeout(() => {
    $verdict.classList.remove('show');
    print('The stars return to their posts. The Oracle has spoken.', 'dim');
    busy = false;
  }, hideAt);
}

function cmdProphecy() {
  if (busy) { print('The Oracle is already speaking. Patience, mortal.', 'err'); return; }
  busy = true;
  thinking = true;
  const startEpoch = epoch;
  typeLine('The Oracle gathers your words...', 'oracle', 14);
  if (!REDUCED) startOmega();
  // Gemma often answers in about a second; give the stars time to form the Ω first.
  const formed = new Promise((r) => setTimeout(r, REDUCED ? 0 : 2600));
  Promise.all([consult('prophecy', null, conversation()), formed]).then(([res]) => {
    thinking = false;
    if (epoch !== startEpoch) { busy = false; return; }
    const text = (res && res.reply) || pick(PROPHECIES);
    if (omega) endOmega(); // still animating: end it cleanly rather than let two rAF loops fight
    $('verdict-text').textContent = text;
    $verdict.classList.add('show');
    $verdict.focus();
    speak(text);
    announce(text);
    printText(text, 'oracle', undefined, { p: 1 });
    print('Type share to carry this prophecy beyond the temple.', 'dim');
    const hideAt = Math.max(6500, text.split(' ').length * 480);
    setTimeout(() => {
      $verdict.classList.remove('show');
      busy = false;
    }, hideAt);
  });
}

function wrapText(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && g.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Canvas has no letter-spacing API worth relying on cross-browser; space the
// kicker out by hand instead.
function drawLetterSpaced(g, text, cx, y, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const prevAlign = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, x, y); x += widths[i] + spacing; });
  g.textAlign = prevAlign;
}

const SHARE_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function cmdShare() {
  let last = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].p === 1) { last = entries[i]; break; }
  }
  if (!last) { print('The Oracle has not yet prophesied for you. Type prophecy first.', 'dim'); return; }
  shareProphecy(last.s);
}

function shareProphecy(text) {
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg').trim();
  const gold = cs.getPropertyValue('--gold').trim();
  const goldBright = cs.getPropertyValue('--gold-bright').trim();
  const dim = cs.getPropertyValue('--dim').trim();

  const IW = 1080, IH = 1350;
  const c = document.createElement('canvas');
  c.width = IW; c.height = IH;
  const g = c.getContext('2d');

  g.fillStyle = bg;
  g.fillRect(0, 0, IW, IH);

  const glow = g.createRadialGradient(IW / 2, IH / 2, 0, IW / 2, IH / 2, Math.max(IW, IH) * 0.6);
  glow.addColorStop(0, 'rgba(212,175,55,0.12)');
  glow.addColorStop(1, 'rgba(5,7,13,0.92)');
  g.fillStyle = glow;
  g.fillRect(0, 0, IW, IH);

  for (let i = 0; i < 120; i++) {
    g.fillStyle = 'rgba(205,214,230,' + rnd(0.15, 0.85).toFixed(3) + ')';
    g.beginPath();
    g.arc(rnd(0, IW), rnd(0, IH), rnd(0.6, 1.8), 0, 6.283);
    g.fill();
  }

  g.save();
  g.globalAlpha = 0.05;
  g.fillStyle = gold;
  g.font = '900px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Ω', IW / 2, IH / 2);
  g.restore();

  g.fillStyle = dim;
  g.font = '26px ' + SHARE_MONO;
  g.textBaseline = 'alphabetic';
  drawLetterSpaced(g, 'THE ORACLE HAS SPOKEN', IW / 2, 220, 7);

  let fontSize = 64;
  let lines = [text];
  for (; fontSize >= 40; fontSize -= 2) {
    g.font = 'italic ' + fontSize + 'px Georgia, serif';
    lines = wrapText(g, text, 860);
    if (lines.length * fontSize * 1.35 <= 640) break;
  }
  g.fillStyle = goldBright;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lineHeight = fontSize * 1.35;
  const startY = IH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => g.fillText(line, IW / 2, startY + i * lineHeight));

  g.fillStyle = dim;
  g.font = '22px ' + SHARE_MONO;
  g.fillText('γνῶθι σεαυτόν — know thyself', IW / 2, startY + lines.length * lineHeight + 50);

  g.fillStyle = gold;
  g.font = '20px ' + SHARE_MONO;
  g.fillText('pythia-oracle.pages.dev', IW / 2, IH - 80);

  c.toBlob((blob) => {
    if (!blob) { print('The prophecy resists the marble today. Try again.', 'dim'); return; }
    const file = new File([blob], 'pythia-prophecy.png', { type: 'image/png' });
    const inscribed = () => print('The prophecy is inscribed. (pythia-prophecy.png)', 'dim');
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: 'The Oracle has spoken. https://pythia-oracle.pages.dev' })
        .then(inscribed)
        .catch((err) => { if (!err || err.name !== 'AbortError') print('The prophecy resists the marble today. Try again.', 'dim'); });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pythia-prophecy.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      inscribed();
    }
  }, 'image/png');
}

$verdict.addEventListener('click', () => $verdict.classList.remove('show'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $verdict.classList.contains('show')) {
    $verdict.classList.remove('show');
    $cmd.focus();
  }
});

function clearLog() {
  epoch++;
  $log.innerHTML = '';
  entries.length = 0;
  persist();
}

/* ---------- conversation with the Oracle ---------- */
let thinking = false;

// One line per server error code, in character. TOO_LONG/TOO_LARGE/EMPTY/BAD_JSON/BAD_MODE
// can't happen from this UI (the input is already capped and validated, and
// modes are hardcoded), so they fall through to the same default as an
// unrecognized code.
const TEMPLE_RESTLESS = 'The winds of prophecy are against us. The temple servers are restless. Try again, traveler.';
const ERROR_LINES = {
  RATE_LIMIT: 'The Oracle needs a breath — too many questions in too short a time. Return in a few minutes.',
  BUDGET: 'The Oracle has reached the edge of her strength for today. The marble is warm, but the fire is low. Return at dawn — the prophecies are free.',
  CAPACITY: TEMPLE_RESTLESS,
  AI: TEMPLE_RESTLESS,
  MODEL: TEMPLE_RESTLESS,
  EMPTY_REPLY: TEMPLE_RESTLESS,
  NETWORK: 'The temple is unreachable — the Oracle cannot hear you from this distance. Check the skies (the internet) and speak again.',
};

// The one fetch primitive: every conversational path (chat and the AI-powered
// incantations) goes through this. Resolves to { reply } or { error }, never
// rejects, so callers never need a .catch.
function consult(mode, message, history) {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, message, history }),
  })
    .then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch (e) { /* not json */ }
      if (res.ok && data && typeof data.reply === 'string') return { reply: data.reply, sig: data.sig };
      return { error: (data && data.error) || 'AI' };
    })
    .catch(() => ({ error: 'NETWORK' }));
}

// Builds the history array the server expects from entries already marked
// with a role: last 20 turns. User turns are clipped to 600 chars; assistant
// turns go back whole with their signature, or the server cannot verify them.
function conversation() {
  const history = [];
  for (const e of entries) {
    if (e.r === 'user' && e.k === 'text') history.push({ role: 'user', content: e.s.slice(0, 600) });
    else if (e.r === 'assistant' && e.k === 'text') history.push({ role: 'assistant', content: e.s, sig: e.g });
  }
  return history.slice(-20);
}

function askOracle(message, history) {
  thinking = true;
  const startEpoch = epoch;
  const d = document.createElement('div');
  d.className = 'oracle typing';
  d.textContent = 'The oracle weighs your words';
  $log.appendChild(d);
  scroll();

  consult('chat', message, history).then((res) => {
    d.remove();
    if (epoch !== startEpoch) { thinking = false; return; }
    if (res.reply) {
      const speed = Math.max(2, Math.min(12, 1800 / res.reply.length));
      typeLine(res.reply, 'oracle', speed, () => {
        if (epoch !== startEpoch) { thinking = false; return; }
        addEntry('text', 'oracle', res.reply, 'assistant', res.sig ? { g: res.sig } : undefined);
        announce(res.reply);
        if (voiceOn) speak(res.reply);
        thinking = false;
      });
    } else {
      printText(ERROR_LINES[res.error] || TEMPLE_RESTLESS, 'oracle');
      thinking = false;
    }
  });
}

/* ---------- the interpreter ---------- */
const COMMANDS = {
  help: cmdHelp,
  skills: cmdSkills,
  projects: cmdProjects,
  freelance: cmdFreelance,
  judge: cmdJudge,
  fortune: cmdFortune,
  create: cmdCreate,
  surprise: cmdSurprise,
  prophecy: cmdProphecy,
  share: cmdShare,
  voice: cmdVoice,
  clear: clearLog,
  privacy: cmdPrivacy,
  sotirios: cmdName,
  pythia: cmdName,
};

const hist = [];
let hi = 0;

function route(raw) {
  const t = raw.trim().toLowerCase();
  if (awaitingRate) { printText(raw.trim(), 'echo'); handleRate(raw); return; }
  if (COMMANDS[t]) { printText(raw.trim(), 'echo'); COMMANDS[t](); return; }
  // Build history from entries already marked with a role BEFORE echoing this
  // new message, so the echo doesn't end up duplicated into its own history.
  const history = conversation();
  const message = raw.trim().slice(0, 600);
  printText(message, 'echo', 'user');
  askOracle(message, history);
}

function submit(raw) {
  if (thinking) return; // the Oracle is mid-reply; leave the text, say nothing
  if (!raw.trim()) { $cmd.value = ''; return; }
  $cmd.value = '';
  hist.push(raw);
  hi = hist.length;
  route(raw);
}

function longestCommonPrefix(strs) {
  let prefix = strs[0];
  for (let i = 1; i < strs.length && prefix; i++) {
    while (!strs[i].startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

$cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    submit($cmd.value);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (awaitingRate) return;
    const val = $cmd.value.trim().toLowerCase();
    if (!val) return;
    const matches = HELP.map(([name]) => name).filter((name) => name.startsWith(val));
    if (matches.length === 1) {
      $cmd.value = matches[0];
    } else if (matches.length > 1) {
      const lcp = longestCommonPrefix(matches);
      if (lcp.length > val.length) $cmd.value = lcp;
      else print(matches.join('  '), 'dim');
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (hi > 0) { hi--; $cmd.value = hist[hi]; }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (hi < hist.length) { hi++; $cmd.value = hist[hi] || ''; }
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    clearLog();
  }
});

$log.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ask]');
  if (!el || thinking || busy || awaitingRate) return;
  submit(el.dataset.ask);
});

// Refocus the input on background clicks only: leave links, the input, and
// any text the visitor is selecting (to copy a reply) alone.
document.addEventListener('click', (e) => {
  if (e.target.closest('a, input, button')) return;
  if (String(getSelection().toString())) return;
  $cmd.focus();
});
$('privacy-link').addEventListener('click', (e) => {
  e.preventDefault();
  printText('privacy', 'echo');
  cmdPrivacy();
});
window.addEventListener('resize', onResize);

/* ---------- awakening ---------- */
function boot() {
  if (restoreMemory()) {
    typeLine('The marble remembers you. Speak, traveler.', 'oracle', 15);
    return;
  }
  $log.innerHTML = '';
  entries.length = 0;
  print(BANNER_HTML);
  const lines = [
    ['PYTHIA KERNEL v2.0.0 — γνῶθι σεαυτόν', 'dim'],
    ['[ OK ] oracle voice ........ linked', 'ok'],
    ['[ OK ] star charts ......... rendered', 'ok'],
    ['[ OK ] the void ............ connected', 'ok'],
    ['[ OK ] judgment module ..... armed', 'ok'],
  ];
  let i = 0;
  const next = () => {
    if (i < lines.length) { typeLine(lines[i][0], lines[i][1], 8, next); i++; }
    else {
      print('', '');
      typeLine('Welcome, traveler. The marble is warm. Ask me anything (love, work, code, fate), in any language. Or type help for the old incantations.', 'oracle', 15, () => {
        print('try asking:', 'dim');
        for (const q of samplePool(ASK_POOL, 3)) {
          print('<span class="ask" data-ask="' + esc(q) + '">' + esc('› ' + q) + '</span>', 'dim');
        }
      });
    }
  };
  next();
}

onResize();
boot();
if (!REDUCED) raf = requestAnimationFrame(loop);
$cmd.focus();
