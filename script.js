'use strict';
/* ===================================================================
   script.js — lomda engine (starter from the stem-lomda-builder skill)

   Distilled from the approved Flickering Lights lomda. Screens are plain
   HTML; this file reads what each screen declares and runs it:

     <section class="screen" data-screen="N" data-sid="q1" data-type="question" ...>

   data-type selects the behaviour (opening, explain, video, tiles, hub,
   question, applet, finish). Almost every screen needs NO code here. When
   one really does, add an entry to HOOKS below, keyed by its data-sid.

   QA contract — the QA system reads the page through these. Do not
   rename them, wrap this file in a function, or make it a module:
     goTo, TOTAL_SCREENS, window.lomdaState, LOMDA_SCREEN_CHANGED,
     LOMDA_COMPLETE, DEV_READY / DEV_GOTO.

   Learner-facing Hebrew lives in index.html, not here, so the translation
   export finds every string in one place.
   =================================================================== */

const TOTAL_SCREENS = 15;              // must equal the number of <section class="screen">
window.TOTAL_SCREENS = TOTAL_SCREENS;
let currentScreen = 1;
let finalStage = false;   // true while the end-of-lomda pop-up or the dark screen is up (see "The end of every lomda")

window.lomdaState = {
  score: 0,             // running grade, 0-100
  questionScores: {},   // sid -> points earned
  DONE: {}              // screen number -> true once resolved (resume lock)
};

/* Per-screen extras, keyed by data-sid. Both functions are optional.
   enter(screen, n)            runs every time the screen is entered
   resolved(screen, n, outcome) runs once a question is answered
                               ('correct' | 'partial' | 'wrong2')
   grade(values)               decides a typed answer (data-grade="hook")
   Example:
   HOOKS['q7'] = { resolved: function (screen) { screen.querySelector('.teacher').hidden = false; } };
*/
const HOOKS = {};

/* Q4 (slides 20-21): many plans are right — any where day 2 = 2 × day 1,
   day 3 is less than 1/2, and the three parts add up to 1 (slide 21's note).
   Each value is [numerator, denominator]; integers only, no rounding. */
HOOKS['q4'] = {
  grade: function (v) {
    const a = v.d1, b = v.d2, c = v.d3;
    if (!a || !b || !c || a[0] <= 0 || b[0] <= 0 || c[0] <= 0 || a[1] <= 0 || b[1] <= 0 || c[1] <= 0) return false;   // every day gets a real, positive part
    const twice = b[0] * a[1] === 2 * a[0] * b[1];
    const lessThanHalf = 2 * c[0] < c[1];
    const whole = a[0] * b[1] * c[1] + b[0] * a[1] * c[1] + c[0] * a[1] * b[1] === a[1] * b[1] * c[1];
    return twice && lessThanHalf && whole;
  }
};

/* ---------------- Small helpers ---------------- */
function screenEl(n) { return document.querySelector('.screen[data-screen="' + n + '"]'); }
function screenOf(el) { return el && el.closest ? el.closest('.screen') : null; }
function screenNum(el) { return parseInt(el.getAttribute('data-screen'), 10); }
function sidOf(el) { return el.getAttribute('data-sid') || ('s' + screenNum(el)); }
function announce(msg) {
  const el = document.getElementById('a11y-status');
  if (el) { el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30); }
}
function uiText(key) {
  // Engine strings (screen-reader announcements) live once in index.html, #ui-text.
  const el = document.querySelector('#ui-text [data-key="' + key + '"]');
  return el ? el.textContent : '';
}

/* ---------------- Canvas scaling ----------------
   The design is a fixed 1920x1080 stage. A QA host embeds the page in an
   iframe whose size is not always settled when this first runs, and a parent
   resizing the iframe does not always fire 'resize' inside it — so scale on
   every signal available and re-run a few times during the first seconds. */
function scaleApp() {
  const app = document.getElementById('app');
  if (!app || !window.innerWidth || !window.innerHeight) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  app.style.transform = 'scale(' + scale + ')';
  app.style.left = ((window.innerWidth - 1920 * scale) / 2) + 'px';
  app.style.top = ((window.innerHeight - 1080 * scale) / 2) + 'px';
}
function appScale() { return Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1; }
window.addEventListener('resize', scaleApp);
window.addEventListener('load', scaleApp);
document.addEventListener('visibilitychange', function () { if (!document.hidden) scaleApp(); });
requestAnimationFrame(scaleApp);
[100, 300, 800, 1500, 3000].forEach(function (ms) { setTimeout(scaleApp, ms); });
if (window.ResizeObserver) new ResizeObserver(scaleApp).observe(document.documentElement);

/* ---------------- Navigation ---------------- */
function goTo(n) {
  if (n < 1 || n > TOTAL_SCREENS) return;
  leaveFinalStage();
  pauseAllMedia();
  closeAllOverlays();
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  const target = screenEl(n);
  if (target) target.classList.add('active');
  currentScreen = n;
  resetScreenState(n);
  notifyScreenChanged(n);
  schedulePreload(n + 1);
  schedulePreload(n - 1);
}

/* The forward arrow is the gate. While it is hidden the learner cannot move
   on — the keyboard path (ArrowLeft) goes through here too, so it is gated. */
function advanceScreen() {
  const s = screenEl(currentScreen);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow && arrow.classList.contains('hidden')) return;
  goTo(currentScreen + 1);
}
function goBack() { goTo(currentScreen - 1); }

function revealForwardNav(n) {
  const s = screenEl(n);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow) { arrow.classList.remove('hidden'); arrow.classList.add('blink'); }
}
function hideForwardNav(n) {
  const s = screenEl(n);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow) { arrow.classList.add('hidden'); arrow.classList.remove('blink'); }
}

function pauseAllMedia() {
  document.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} });
}

/* Warm the neighbouring screens' images while the learner reads this one.
   All screens live in the DOM at once; their <img loading="lazy"> only start
   fetching when the screen is shown, so without this every image pops in. */
const preloaded = {};
function preloadScreenImages(n) {
  if (preloaded[n]) return;
  preloaded[n] = true;
  const s = screenEl(n);
  if (!s) return;
  s.querySelectorAll('img[src]').forEach(function (img) { (new Image()).src = img.getAttribute('src'); });
}
function schedulePreload(n) {
  const run = function () { preloadScreenImages(n); };
  if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 500);
}

/* ---------------- QA / dev bridge ----------------
   index_dev.html and the QA system embed this page in an iframe and talk to
   it only through postMessage (file:// blocks direct access between frames). */
function notifyScreenChanged(n) {
  try { window.parent.postMessage({ type: 'LOMDA_SCREEN_CHANGED', screen: n }, '*'); } catch (e) {}
}
let handshakeAcked = false;
function announceReady() {
  if (handshakeAcked) return;
  try {
    if (window.parent && window.parent !== window) {
      const screens = Array.prototype.map.call(document.querySelectorAll('.screen'), function (s) {
        return { n: screenNum(s), sid: s.getAttribute('data-sid') || '', type: s.getAttribute('data-type') || '' };
      });
      window.parent.postMessage({ type: 'DEV_READY', total: TOTAL_SCREENS, screens: screens }, '*');
    }
  } catch (e) {}
}
/* One "ready" message can be lost if the host attaches its listener late, so
   re-announce until the host answers with a DEV_GOTO (or 20 tries pass). */
let handshakeTries = 0;
const handshakeTimer = setInterval(function () {
  announceReady();
  if (handshakeAcked || ++handshakeTries > 20) clearInterval(handshakeTimer);
}, 400);
window.addEventListener('load', announceReady);

window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'DEV_GOTO' && typeof d.screen === 'number') {
    handshakeAcked = true;
    goTo(d.screen);
  } else if (d.type === 'APPLET_STARTED') {
    onAppletStarted(e.source);
  }
});

/* Some hosts switch screens by toggling .active themselves instead of calling
   goTo(). Catch that and run the normal entry logic. */
(function () {
  const app = document.getElementById('app');
  if (!app || typeof MutationObserver === 'undefined') return;
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      const el = m.target;
      if (!el.classList || !el.classList.contains('screen') || !el.classList.contains('active')) return;
      const n = screenNum(el);
      if (isNaN(n) || n === currentScreen) return;
      leaveFinalStage();
      currentScreen = n;
      resetScreenState(n);
      notifyScreenChanged(n);
    });
  }).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();

/* ---------------- Screen entry ---------------- */
const ENTER = {
  opening: function () {},
  explain: enterExplain,
  video: enterVideo,
  tiles: enterTiles,
  hub: enterExplain,       // a guided hub moves on through its own button; a final hub may show the arrow
  question: enterQuestion,
  applet: enterApplet,
  finish: enterFinish
};

function resetScreenState(n) {
  const s = screenEl(n);
  if (!s) return;
  updateStepper(s);
  const type = s.getAttribute('data-type') || 'explain';
  (ENTER[type] || enterExplain)(s, n);
  const hook = HOOKS[sidOf(s)];
  if (hook && hook.enter) hook.enter(s, n);
  s.focus({ preventScroll: true });
}

/* Explanation screens: the arrow appears at once, or after data-arrow-delay seconds. */
const arrowTimers = {};
function enterExplain(s, n) {
  if (!s.querySelector('.nav-next')) return;
  if (s.querySelector('.narration-audio')) { enterNarration(s, n); return; }
  const delay = parseFloat(s.getAttribute('data-arrow-delay') || '0');
  if (!delay || window.lomdaState.DONE[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
  clearTimeout(arrowTimers[n]);
  arrowTimers[n] = setTimeout(function () { window.lomdaState.DONE[n] = true; revealForwardNav(n); }, delay * 1000);
}

/* ---------------- Narrated explanation screens ----------------
   Reveal cues follow audio.currentTime, so pausing also pauses the sequence.
   As on other explanation screens, forward navigation opens once all text
   has appeared. Revisited screens keep their text; the button can replay audio. */
const narrationStates = new WeakMap();

function syncNarration(s, n, state) {
  const audio = state.audio, button = state.button;
  const showAll = state.failed || audio.ended || !!window.lomdaState.DONE[n];
  let allVisible = true;
  state.lines.forEach(function (line) {
    const visible = showAll || audio.currentTime >= line.start;
    line.el.classList.toggle('is-visible', visible);
    if (!visible) allVisible = false;
  });
  if (allVisible && !window.lomdaState.DONE[n]) {
    window.lomdaState.DONE[n] = true;
    revealForwardNav(n);
  }
  const playing = !audio.paused && !audio.ended && !state.failed;
  button.classList.toggle('is-playing', playing);
  button.setAttribute('aria-pressed', String(playing));
  const label = state.failed ? 'narration-unavailable' : playing ? 'narration-pause'
    : audio.ended ? 'narration-replay' : audio.currentTime > 0 ? 'narration-resume' : 'narration-play';
  button.setAttribute('aria-label', uiText(label));
  button.disabled = state.failed;
}

function playNarration(s, n, state) {
  if (state.failed || !s.classList.contains('active')) return;
  const pending = state.audio.play();
  if (pending && pending.catch) pending.catch(function () {
    // Autoplay may need a learner click. Keep the sound button ready to play.
    if (state.audio.error) state.failed = true;
    syncNarration(s, n, state);
  });
}

function initNarration(s, n) {
  if (narrationStates.has(s)) return narrationStates.get(s);
  const audio = s.querySelector('.narration-audio'), button = s.querySelector('.narration-toggle');
  if (!audio || !button) return null;
  const state = { audio: audio, button: button, frame: 0, failed: !!audio.error,
    lines: Array.prototype.map.call(s.querySelectorAll('[data-narration-at]'), function (el) {
      return { el: el, start: parseFloat(el.getAttribute('data-narration-at')) };
    }) };
  narrationStates.set(s, state);
  const sync = function () { syncNarration(s, n, state); };
  const stopTick = function () { cancelAnimationFrame(state.frame); state.frame = 0; };
  const tick = function () {
    state.frame = 0;
    if (!s.classList.contains('active')) { audio.pause(); return; }
    sync();
    if (!audio.paused && !audio.ended) state.frame = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', function () { stopTick(); tick(); });
  audio.addEventListener('pause', function () { stopTick(); sync(); });
  audio.addEventListener('ended', function () { stopTick(); sync(); });
  audio.addEventListener('timeupdate', sync);
  audio.addEventListener('seeked', sync);
  audio.addEventListener('error', function () { stopTick(); state.failed = true; sync(); });
  button.addEventListener('click', function () {
    if (audio.paused || audio.ended) {
      if (audio.ended) audio.currentTime = 0;
      playNarration(s, n, state);
    } else audio.pause();
  });
  return state;
}

function enterNarration(s, n) {
  const state = initNarration(s, n);
  if (!state) { revealForwardNav(n); return; }
  if (window.lomdaState.DONE[n]) revealForwardNav(n); else hideForwardNav(n);
  syncNarration(s, n, state);
  if (!window.lomdaState.DONE[n] && !state.failed) playNarration(s, n, state);
}

/* ===================================================================
   Feedback popup (one, shared, outside every screen)
   showFeedback(type, { title, body }) — type is the outcome:
   retry | retryPartial | correct | partial | wrong2.
   The popup also gets the class fb-<sid>, so a screen can move it in CSS:
     #feedback-popup.fb-q3 { left: 340px; bottom: 185px; }
   and, for a question part, fb-<sid>-p<part> (#feedback-popup.fb-q2-p3).
   =================================================================== */
function showFeedback(type, cfg, unit) {
  const popup = document.getElementById('feedback-popup');
  const s = screenEl(currentScreen);
  popup.className = 'show ' + type + (s ? ' fb-' + sidOf(s) : '') +
    (isPart(unit) ? ' fb-' + sidOf(s) + '-p' + unit.getAttribute('data-part') : '') +
    ((isPart(unit) || (s && s.hasAttribute('data-feedback-close'))) && type !== 'retry' && type !== 'retryPartial' ? ' has-close' : '');
  const titleEl = document.getElementById('fb-title');
  titleEl.textContent = (cfg && cfg.title) || '';
  if (cfg && cfg.titleEl) {                       // keep inline parts of the title (a red outcome, a white rest)
    titleEl.textContent = '';
    cfg.titleEl.childNodes.forEach(function (node) { titleEl.appendChild(node.cloneNode(true)); });
  }
  const body = document.getElementById('fb-body');
  body.innerHTML = '';
  ((cfg && cfg.body) || []).forEach(function (line) {
    if (line && line.nodeType === 1) { body.appendChild(line.cloneNode(true)); return; }
    const p = document.createElement('p');
    p.textContent = line;
    body.appendChild(p);
  });
  openOverlayFocus(popup);
}
/* Optional X on final feedback: row explanations and screens with data-feedback-close. */
document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('#feedback-popup .fb-close')) hideFeedback();
});
function hideFeedback() {
  const popup = document.getElementById('feedback-popup');
  if (popup.classList.contains('show')) { popup.classList.remove('show'); returnOverlayFocus(); }
}

/* Feedback text is written in the screen itself:
     <div class="fb-src" hidden>
       <div data-fb="correct"><p class="fb-t">צדקת!</p><p>הסבר…</p></div>
     </div>
   Read it into { correct: {title, body:[<p>…]}, … }. */
function readFeedback(s) {
  const out = {};
  s.querySelectorAll(':scope > .fb-src > [data-fb]').forEach(function (box) {
    const t = box.querySelector('.fb-t');
    out[box.getAttribute('data-fb')] = {
      title: t ? t.textContent.trim() : '',
      titleEl: t || null,
      body: Array.prototype.filter.call(box.children, function (c) { return c !== t; })
    };
  });
  return out;
}

/* ---------------- Overlays + focus (a11y) ---------------- */
let lastFocusedBeforeOverlay = null;
function openOverlayFocus(el) {
  if (!el) return;
  if (!lastFocusedBeforeOverlay) lastFocusedBeforeOverlay = document.activeElement;
  el.focus({ preventScroll: true });
}
function returnOverlayFocus() {
  const el = lastFocusedBeforeOverlay;
  lastFocusedBeforeOverlay = null;
  if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
}
function getOpenDialog() {
  const pop = document.querySelector('.popup-src.show');
  if (pop) return pop;
  const ids = ['img-zoom-modal', 'reopen-popup', 'feedback-popup'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (el && el.classList.contains('show')) return el;
  }
  return null;
}
function getFocusable(container) {
  return Array.prototype.slice
    .call(container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), iframe'))
    .filter(function (el) { return el.tagName === 'IFRAME' || el.offsetParent !== null; });
}
function closeAllOverlays() {
  closePopups('nav');
  ['feedback-popup', 'img-zoom-modal', 'reopen-popup'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  const body = document.getElementById('reopen-popup-body');
  if (body) body.innerHTML = '';
  document.querySelectorAll('.reopen-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
  document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });
  returnOverlayFocus();
}

document.addEventListener('keydown', function (e) {
  const dialog = getOpenDialog();
  // Keep Tab inside an open dialog (feedback is non-modal on purpose: the
  // learner re-picks an answer while the retry message stays up).
  if (dialog && dialog.id !== 'feedback-popup' && e.key === 'Tab') {
    const f = getFocusable(dialog);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (e.key === 'Escape') {
    const pop = document.querySelector('.popup-src.show');
    if (pop) closePopup(pop, 'esc'); else closeAllOverlays();
    return;
  }
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (!dialog && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    if (e.key === 'ArrowLeft') advanceScreen();   // RTL: forward is on the left
    if (e.key === 'ArrowRight') goBack();
  }
  if (e.key === 'Enter' || e.key === ' ') {
    // div/span widgets with role=button/radio/checkbox get no native Enter/Space.
    const el = document.activeElement;
    const role = el && el.getAttribute && el.getAttribute('role');
    if (el && el.tagName !== 'BUTTON' && (role === 'button' || role === 'radio' || role === 'checkbox')) {
      e.preventDefault();
      el.click();
    }
  }
});

/* ---------------- Delegated clicks ----------------
   Markup declares intent with data-action / classes; no inline onclick. */
document.addEventListener('click', function (e) {
  const t = e.target;
  let el;
  if ((el = t.closest('.nav-next'))) { advanceScreen(); return; }
  if ((el = t.closest('.nav-prev'))) { goBack(); return; }
  if ((el = t.closest('[data-action="next"]'))) { goTo(currentScreen + 1); return; }
  if ((el = t.closest('[data-action="finish"]'))) { finishLomda(); return; }
  if ((el = t.closest('.play-btn-big'))) { playVideo(screenOf(el)); return; }
  if ((el = t.closest('.popup-close'))) { closePopup(el.closest('.popup-src'), 'x'); return; }
  if (t.classList && t.classList.contains('popup-src')) { closePopup(t, 'esc'); return; }   // the dark backdrop
  if ((el = t.closest('[data-popup]'))) { openPopup(el); return; }
  if ((el = t.closest('.q-opt'))) { qSelect(el); return; }
  if ((el = t.closest('.btn-check'))) { checkAnswer(unitOf(el)); return; }
  if ((el = t.closest('.tile'))) { revealTile(el); return; }
  if ((el = t.closest('.reopen-btn'))) { toggleReopen(el); return; }
  if ((el = t.closest('[data-zoom-src]'))) { openZoom(el); return; }
  if ((el = t.closest('[data-zoom-close]'))) { closeZoom(); return; }
  if ((el = t.closest('.term'))) { toggleTerm(el); return; }
  if ((el = t.closest('.dnd-chip'))) { dndChipClick(el); return; }
  if ((el = t.closest('.dnd-slot'))) { dndSlotClick(el); return; }
  if ((el = t.closest('.dnd-bank'))) { dndBankClick(); return; }
});

document.addEventListener('input', function (e) {
  if (e.target.classList && e.target.classList.contains('q-in')) onTyped(e.target);
  if (e.target.matches && e.target.matches('textarea[data-min-chars]')) {
    const u = unitOf(e.target);
    if (u && !qEnsure(u).done) updateCheckable(u);
  }
});

/* A row's final feedback (Q2) sits over the other rows' check buttons, as in the design.
   Starting on another row closes it, so those buttons are never out of reach. The focus
   is left where the learner put it (hideFeedback would send it back to the old button). */
document.addEventListener('focusin', function (e) {
  const t = e.target;
  if (!t.classList || !t.classList.contains('q-in')) return;
  const part = t.closest('.q-part');
  const pop = document.getElementById('feedback-popup');
  if (!part || !pop.classList.contains('show') || pop.classList.contains('retry') || pop.classList.contains('retryPartial')) return;
  const m = /fb-[a-z0-9-]+-p(\d+)/.exec(pop.className);
  if (m && m[1] !== part.getAttribute('data-part')) { pop.classList.remove('show'); lastFocusedBeforeOverlay = null; }
});

/* ===================================================================
   Video screens
   <div class="video-wrap">
     <video class="video-el" playsinline preload="metadata" ...><source src="assets/videos/x.mp4#t=0.001" type="video/mp4"></video>
     <div class="vcap-src" data-clear-after="21.5" hidden>
       <span data-t="0.4">first caption line</span>
       <span data-t="3.2">second caption line</span>
     </div>
     <div class="video-caption hidden"><p></p></div>
     <button class="play-btn-big" type="button" aria-label="…"></button>
   </div>
   The control bar (.vctrls) is cloned from #vctrls-tpl, so its labels exist
   once. A <video data-pending-asset> has no file yet: "playing" it unlocks
   the arrow after 1.5 s, so gating can be tested before the video arrives.
   =================================================================== */
const videoStarted = {};
const videoEnded = {};
const captionsOn = {};

function enterVideo(s, n) {
  if (videoStarted[n]) return;          // resume lock: keep the arrow if already earned
  const big = s.querySelector('.play-btn-big');
  if (big) big.classList.remove('hidden');
  hideForwardNav(n);
}

function readCues(wrap) {
  const src = wrap.querySelector('.vcap-src');
  if (!src) return [];
  const spans = Array.prototype.slice.call(src.querySelectorAll('span[data-t]'));
  const clear = parseFloat(src.getAttribute('data-clear-after') || 'Infinity');
  return spans.map(function (sp, i) {
    const start = parseFloat(sp.getAttribute('data-t'));
    const end = sp.hasAttribute('data-end') ? parseFloat(sp.getAttribute('data-end'))
      : (i + 1 < spans.length ? parseFloat(spans[i + 1].getAttribute('data-t')) : clear);
    return { start: start, end: end, el: sp };
  });
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function initVideo(wrap) {
  const s = screenOf(wrap), n = screenNum(s);
  const video = wrap.querySelector('video');
  if (!video) return;
  const tpl = document.getElementById('vctrls-tpl');
  if (tpl && !wrap.querySelector('.vctrls')) wrap.appendChild(tpl.content.cloneNode(true));
  const bar = wrap.querySelector('.vctrls');
  const cues = readCues(wrap);
  const capEl = wrap.querySelector('.video-caption');
  const capText = capEl && capEl.querySelector('p');
  captionsOn[n] = true;
  // The poster is only a fallback: it shows when the video file cannot be loaded (the source's
  // error does not bubble, so listen in the capture phase). Otherwise the first frame is the picture.
  // data-preview-at: the still the learner sees before pressing play is this frame (seconds);
  // playback itself, and its audio, still start at 0:00.
  const previewAt = parseFloat(video.getAttribute('data-preview-at') || '');
  if (previewAt > 0) {
    const showPreview = function () {
      if (!videoStarted[n] && video.readyState >= 1 && video.currentTime < previewAt) video.currentTime = previewAt;
    };
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(function (ev) { video.addEventListener(ev, showPreview); });
    showPreview();
  }
  const fallbackPoster = video.getAttribute('data-poster');
  if (fallbackPoster) video.addEventListener('error', function () { video.setAttribute('poster', fallbackPoster); }, true);

  video.addEventListener('timeupdate', function () {
    if (capEl && capText) {
      const t = video.currentTime;
      const cue = captionsOn[n] && videoStarted[n] && cues.find(function (c) { return t >= c.start && t < c.end; });
      if (cue) { capText.textContent = cue.el.textContent; capEl.classList.remove('hidden'); }
      else capEl.classList.add('hidden');
    }
    // Unlock a little before the real end: in some embeds 'ended' fires late or never.
    if (!videoEnded[n] && video.duration && video.duration - video.currentTime <= 3) onVideoEnded(n);
  });
  video.addEventListener('ended', function () { onVideoEnded(n); });
  if (!bar) return;

  const playBtn = bar.querySelector('[data-play]');
  const curEl = bar.querySelector('[data-cur]');
  const durEl = bar.querySelector('[data-dur]');
  const seek = bar.querySelector('[data-seek]');
  const ccBtn = bar.querySelector('[data-cc]');
  const muteBtn = bar.querySelector('[data-mute]');
  const vol = bar.querySelector('[data-vol]');
  const fullBtn = bar.querySelector('[data-full]');
  let seeking = false;

  function syncPlay() { playBtn.textContent = video.paused ? '▶' : '⏸'; }
  video.addEventListener('play', syncPlay);
  video.addEventListener('pause', syncPlay);
  playBtn.addEventListener('click', function () { if (video.paused) playVideo(s); else video.pause(); });
  video.addEventListener('loadedmetadata', function () { durEl.textContent = formatTime(video.duration); });
  video.addEventListener('timeupdate', function () {
    curEl.textContent = formatTime(video.currentTime);
    if (!seeking && video.duration) seek.value = String(Math.round(video.currentTime / video.duration * 1000));
  });
  seek.addEventListener('input', function () {
    seeking = true;
    if (video.duration) curEl.textContent = formatTime(seek.value / 1000 * video.duration);
  });
  seek.addEventListener('change', function () {
    if (video.duration) video.currentTime = seek.value / 1000 * video.duration;
    seeking = false;
  });
  if (!cues.length && ccBtn) ccBtn.hidden = true;
  if (ccBtn) ccBtn.addEventListener('click', function () {
    captionsOn[n] = !captionsOn[n];
    ccBtn.classList.toggle('is-off', !captionsOn[n]);
    ccBtn.setAttribute('aria-pressed', String(captionsOn[n]));
  });
  function syncMute() {
    const muted = video.muted || video.volume === 0;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(muted));
  }
  muteBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    vol.value = video.muted ? '0' : String(Math.round(video.volume * 100));
    syncMute();
  });
  vol.addEventListener('input', function () {
    video.volume = vol.value / 100;
    video.muted = video.volume === 0;
    syncMute();
  });
  syncMute();
  // Fullscreen only ever from the learner's own click, never automatically.
  fullBtn.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', function () {
    fullBtn.setAttribute('aria-pressed', String(document.fullscreenElement === wrap));
  });
}

function playVideo(s) {
  if (!s) return;
  const n = screenNum(s);
  const video = s.querySelector('.video-wrap video');
  const big = s.querySelector('.play-btn-big');
  videoStarted[n] = true;
  if (big) big.classList.add('hidden');
  if (!video) return;
  if (video.hasAttribute('data-pending-asset')) {
    setTimeout(function () { onVideoEnded(n); }, 1500);
    return;
  }
  if (video.hasAttribute('data-preview-at')) video.currentTime = 0;   // the still was a later frame; play from the start
  video.play().catch(function () {});
}

function onVideoEnded(n) {
  if (videoEnded[n]) return;
  videoEnded[n] = true;
  const vs = screenEl(n);
  if (vs && vs.getAttribute('data-type') === 'question' && !screenResolved(vs)) return;   // the video belongs to the feedback: only after the answer
  window.lomdaState.DONE[n] = true;
  revealForwardNav(n);
}

/* ===================================================================
   Reveal tiles — click every tile; the arrow appears when all were seen.
   <div class="tiles" data-mode="grayscale-once|card-flip">
     <div class="tile" data-tile-id="noa" role="button" tabindex="0" aria-label="…">
       …tile face…
       <div class="tile-content" hidden>the text this tile reveals</div>
     </div>
   </div>
   <div class="tiles-board" aria-live="polite"></div>   (grayscale-once only)
   =================================================================== */
const tilesSeen = {};
function enterTiles(s, n) {
  if (!tilesSeen[n]) tilesSeen[n] = new Set();
  if (window.lomdaState.DONE[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
}
function revealTile(tile) {
  const s = screenOf(tile), n = screenNum(s);
  const group = tile.closest('.tiles');
  const mode = (group && group.getAttribute('data-mode')) || 'grayscale-once';
  if (!tilesSeen[n]) tilesSeen[n] = new Set();
  const content = tile.querySelector('.tile-content');
  if (mode === 'card-flip') {
    tile.classList.toggle('flipped');
  } else {
    const board = s.querySelector('.tiles-board');
    if (board && content) { board.innerHTML = content.innerHTML; board.classList.remove('empty'); }
    s.querySelectorAll('.tile.current').forEach(function (t) { t.classList.remove('current'); });
    tile.classList.add('viewed', 'current');
    if (group) group.classList.add('started');
  }
  tilesSeen[n].add(tile.getAttribute('data-tile-id'));
  if (tilesSeen[n].size >= s.querySelectorAll('.tile').length) {
    window.lomdaState.DONE[n] = true;
    revealForwardNav(n);
  }
}

/* ===================================================================
   Questions — single choice, multiple choice, drag and drop, typed answers.
   Declared on the section:
     data-type="question" data-kind="single|multi|dnd|input" data-weight="10"
   Correct options carry data-correct; drop slots carry data-accept; typed
   answers carry data-answer on their .q-input.
   Two attempts:
     1st wrong  -> retry message, nothing turns red, the check button hides
                   until the answer changes.
     correct, or 2nd wrong -> final feedback, answer revealed, arrow appears.
   Marks are given once; coming back shows the final state again.

   A question can be split into parts (rows of a table, each with its own
   check button, help and feedback): mark each with class="q-part" and
   data-part="1"…, and put its .btn-check and .fb-src inside it. Each part is
   checked on its own and gets an equal share of data-weight; the arrow
   appears when every part is done. Everything below works on a "unit": the
   screen itself, or one .q-part.

   Typed answers (data-kind="input"):
     <span class="q-input frac-input" data-answer="3/5" data-match="value">
       <input class="q-in" data-frac="num" inputmode="numeric" aria-label="…">
       <input class="q-in" data-frac="den" inputmode="numeric" aria-label="…">
     </span>
     <span class="q-input" data-answer="30" data-match="value"><input class="q-in" …></span>
   data-match="value": any equal value is right (6/10 = 3/5). With
   data-grade="hook" on the section, HOOKS[sid].grade(values) decides instead
   ({name: [numerator, denominator]}, for answers with many right forms).
   =================================================================== */
const QCONFIG = {};   // screen number -> { kind, key, weight, feedback, parts } (read by the Arabic QA tools too)
const QPARTS = {};    // unit key -> config of one .q-part
const qState = {};    // unit key -> { attempts, done, outcome, lastWrong }

function isPart(u) { return !!u && !!u.classList && u.classList.contains('q-part'); }
function unitOf(el) { return el.closest('.q-part') || screenOf(el); }
function unitScreen(u) { return isPart(u) ? screenOf(u) : u; }
function unitKey(u) { return isPart(u) ? sidOf(screenOf(u)) + '-' + u.getAttribute('data-part') : sidOf(u); }
function qUnits(s) {
  const parts = s.querySelectorAll('.q-part');
  return parts.length ? Array.prototype.slice.call(parts) : [s];
}

function qConfig(u) {
  if (isPart(u)) {
    const k = unitKey(u);
    if (!QPARTS[k]) {
      const s = screenOf(u), sc = qConfig(s);
      QPARTS[k] = { kind: sc.kind, key: k, weight: sc.weight / qUnits(s).length, maxAttempts: sc.maxAttempts,
                    feedback: readFeedback(u), part: u.getAttribute('data-part') };
    }
    return QPARTS[k];
  }
  const n = screenNum(u);
  if (!QCONFIG[n]) {
    QCONFIG[n] = {
      kind: u.getAttribute('data-kind') || 'single',
      key: sidOf(u),
      weight: parseFloat(u.getAttribute('data-weight') || '0'),
      maxAttempts: parseInt(u.getAttribute('data-attempts') || '2', 10),
      feedback: readFeedback(u)
    };
    const parts = u.querySelectorAll('.q-part');
    if (parts.length) QCONFIG[n].parts = Array.prototype.map.call(parts, function (p) { return qConfig(p); });
  }
  return QCONFIG[n];
}
function qEnsure(u) {
  const k = unitKey(u);
  if (!qState[k]) qState[k] = { attempts: 0, done: false, outcome: null, lastWrong: null };
  return qState[k];
}
function checkBtn(u) {
  return isPart(u) || !u.querySelector('.q-part') ? u.querySelector('.btn-check') : null;
}
function setCheckable(u, can) {
  const b = checkBtn(u);
  if (!b) return;
  b.disabled = !can;   // a disabled check button is hidden by CSS, never shown faded
}
/* A question whose feedback holds a video the learner must watch (data-require-video on the
   section, e.g. q5) keeps its forward arrow hidden until that video has played to the end. */
function videoGate(s, n) { return s.hasAttribute('data-require-video') && !videoEnded[n]; }
function screenResolved(s) {
  return qUnits(s).every(function (u) { return qEnsure(u).done; });
}

function enterQuestion(s, n) {
  const units = qUnits(s);
  units.forEach(enterUnit);
  if (screenResolved(s)) {
    if (videoGate(s, n)) hideForwardNav(n); else revealForwardNav(n);
    if (units.length === 1) { const st = qEnsure(units[0]); showFeedback(st.outcome, qConfig(units[0]).feedback[st.outcome], units[0]); }
  } else hideForwardNav(n);
}
function enterUnit(u) {
  const cfg = qConfig(u), st = qEnsure(u);
  if (st.done) {
    renderFinal(u, cfg, st);
    setCheckable(u, false);
    return;
  }
  if (cfg.kind === 'dnd') dndReset(u);
  else {
    u.querySelectorAll('.q-opt').forEach(function (o) {
      o.classList.remove('selected', 'correct', 'wrong');
      o.setAttribute('aria-checked', 'false');
    });
    u.querySelectorAll('textarea[data-min-chars]').forEach(function (t) { t.value = ''; t.disabled = false; });
    resetFreeHint(u);
    u.querySelectorAll('.q-input').forEach(function (qi) {
      qi.classList.remove('correct', 'wrong', 'revealed');
      qi.querySelectorAll('.q-in').forEach(function (i) { i.value = ''; i.disabled = false; });
    });
  }
  st.attempts = 0;
  st.lastWrong = null;
  setCheckable(u, false);
}

function qSelect(opt) {
  const u = unitOf(opt), cfg = qConfig(u), st = qEnsure(u);
  if (st.done) return;
  if (cfg.kind === 'single') {
    u.querySelectorAll('.q-opt').forEach(function (o) {
      const on = o === opt;
      o.classList.toggle('selected', on);
      o.setAttribute('aria-checked', String(on));
    });
  } else {
    const on = !opt.classList.contains('selected');
    opt.classList.toggle('selected', on);
    opt.setAttribute('aria-checked', String(on));
  }
  updateCheckable(u);
}

/* Typed answers: digits only, and the check button follows what is typed. */
function onTyped(input) {
  const clean = input.value.replace(/[^\d]/g, '').slice(0, 4);
  if (clean !== input.value) input.value = clean;
  const u = unitOf(input);
  if (u && !qEnsure(u).done) {
    // Q2's wide retry sits over the submit column. Editing dismisses it so
    // the next check is reachable, while focus stays in the answer field.
    const popup = document.getElementById('feedback-popup');
    if (isPart(u) && sidOf(screenOf(u)) === 'q2' && popup && popup.classList.contains('show') &&
        popup.classList.contains('fb-q2') && popup.classList.contains('retry')) {
      popup.classList.remove('show');
      lastFocusedBeforeOverlay = null;
    }
    updateCheckable(u);
  }
}
function inputValue(qi) {
  // -> [numerator, denominator] as integers, or null while a box is empty
  const ins = qi.querySelectorAll('.q-in');
  if (!ins.length || Array.prototype.some.call(ins, function (i) { return i.value.trim() === ''; })) return null;
  const num = qi.querySelector('[data-frac="num"]'), den = qi.querySelector('[data-frac="den"]');
  if (num && den) return [parseInt(num.value, 10), parseInt(den.value, 10)];
  return [parseInt(ins[0].value, 10), 1];
}
function parseValue(text) {
  const m = String(text).trim().match(/^(\d+)\s*(?:\/\s*(\d+))?$/);
  return m ? [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 1] : null;
}
function sameValue(a, b) { return !!a && !!b && a[1] !== 0 && b[1] !== 0 && a[0] * b[1] === b[0] * a[1]; }
function inputRight(qi) { return sameValue(inputValue(qi), parseValue(qi.getAttribute('data-answer'))); }
function inputValues(u) {
  const out = {};
  u.querySelectorAll('.q-input').forEach(function (qi, i) { out[qi.getAttribute('data-name') || i] = inputValue(qi); });
  return out;
}

function answerSnapshot(u) {
  const cfg = qConfig(u);
  if (cfg.kind === 'dnd') {
    return JSON.stringify(Array.prototype.map.call(u.querySelectorAll('.dnd-slot'), function (slot) {
      const c = slot.querySelector('.dnd-chip');
      return c ? c.getAttribute('data-chip') : '';
    }));
  }
  if (cfg.kind === 'input') {
    return JSON.stringify(Array.prototype.map.call(u.querySelectorAll('.q-in'), function (i) { return i.value; }));
  }
  return JSON.stringify(Array.prototype.map.call(u.querySelectorAll('.q-opt.selected'), function (o) {
    return o.getAttribute('data-id');
  }).sort());
}
function hasAnswer(u) {
  const kind = qConfig(u).kind;
  if (kind === 'dnd') {
    return Array.prototype.every.call(u.querySelectorAll('.dnd-slot'), function (sl) { return !!sl.querySelector('.dnd-chip'); });
  }
  if (kind === 'input') {
    return Array.prototype.every.call(u.querySelectorAll('.q-in'), function (i) { return i.value.trim() !== ''; });
  }
  return !!u.querySelector('.q-opt.selected') && freeTextOk(u);
}
/* A question with an explanation box (textarea[data-min-chars]) needs that many characters
   before it can be checked; until then a hint tells the learner what is missing. */
function freeTextOk(u) {
  return Array.prototype.every.call(u.querySelectorAll('textarea[data-min-chars]'), function (t) {
    return t.value.trim().length >= parseInt(t.getAttribute('data-min-chars'), 10);
  });
}
/* The hint (glow + hand) appears 3 seconds after an option was picked, and only if the
   explanation is still too short by then. Switching between yes and no does not restart the clock. */
const FREE_HINT_DELAY = 3000;
function resetFreeHint(u) {
  u.querySelectorAll('textarea[data-min-chars]').forEach(function (t) {
    clearTimeout(t._hintTimer); t._hintTimer = null; t._hintReady = false;
    t.classList.remove('needs-text');
  });
  u.querySelectorAll('.q-free-hint').forEach(function (hh) { hh.hidden = true; });
}
function updateFreeHint(u) {
  const st = qEnsure(u);
  const picked = !!u.querySelector('.q-opt.selected');
  u.querySelectorAll('textarea[data-min-chars]').forEach(function (t) {
    if (st.done || !picked) { clearTimeout(t._hintTimer); t._hintTimer = null; t._hintReady = false; }
    else if (!t._hintReady && !t._hintTimer) {
      t._hintTimer = setTimeout(function () { t._hintTimer = null; t._hintReady = true; updateFreeHint(u); }, FREE_HINT_DELAY);
    }
    const need = !st.done && picked && !!t._hintReady && !freeTextOk(u);
    t.classList.toggle('needs-text', need);
    const hint = u.querySelector('.q-free-hint');
    if (hint) hint.hidden = !need;
  });
}
function updateCheckable(u) {
  const st = qEnsure(u);
  const moved = qConfig(u).kind !== 'dnd' || !dndSwapMode(u) || st.touched;    // swap mode starts full
  setCheckable(u, !st.done && moved && hasAnswer(u) && answerSnapshot(u) !== st.lastWrong);
  updateFreeHint(u);
}

/* -> 'correct' | 'partialClean' (only right picks, not all) | 'partialMixed' (some right + wrong) | 'wrong' */
function grade(u) {
  const cfg = qConfig(u);
  if (cfg.kind === 'dnd') {
    const slots = u.querySelectorAll('.dnd-slot');
    let right = 0;
    slots.forEach(function (sl) { if (dndSlotRight(sl)) right++; });
    return right === slots.length ? 'correct' : (right > 0 ? 'partialMixed' : 'wrong');
  }
  if (cfg.kind === 'input') {
    const s = unitScreen(u);
    if (s.getAttribute('data-grade') === 'hook') {
      const hook = HOOKS[sidOf(s)];
      return hook && hook.grade && hook.grade(inputValues(u)) ? 'correct' : 'wrong';
    }
    return Array.prototype.every.call(u.querySelectorAll('.q-input'), inputRight) ? 'correct' : 'wrong';
  }
  let rightPicked = 0, wrongPicked = 0, rightTotal = 0;
  u.querySelectorAll('.q-opt').forEach(function (o) {
    const isRight = o.hasAttribute('data-correct'), on = o.classList.contains('selected');
    if (isRight) rightTotal++;
    if (on && isRight) rightPicked++;
    if (on && !isRight) wrongPicked++;
  });
  if (rightPicked === rightTotal && wrongPicked === 0) return 'correct';
  if (rightPicked > 0 && wrongPicked === 0) return 'partialClean';
  if (rightPicked > 0) return 'partialMixed';
  return 'wrong';
}

function checkAnswer(u) {
  if (!u) return;
  const s = unitScreen(u), n = screenNum(s), cfg = qConfig(u), st = qEnsure(u);
  if (st.done || !hasAnswer(u)) return;
  st.attempts++;
  const g = grade(u);
  const fb = cfg.feedback;

  if (g !== 'correct' && st.attempts < cfg.maxAttempts) {
    st.lastWrong = answerSnapshot(u);
    setCheckable(u, false);
    // data-partial-hint="any": the "on the right track" hint also when a wrong pick is mixed in
    const anyHint = s.getAttribute('data-partial-hint') === 'any';
    const type = ((g === 'partialClean' || (anyHint && g === 'partialMixed')) && fb.retryPartial) ? 'retryPartial' : 'retry';
    showFeedback(type, fb[type], u);
    return;
  }

  let outcome = 'correct';
  if (g !== 'correct') outcome = (cfg.kind === 'multi' && fb.partial && g !== 'wrong') ? 'partial' : 'wrong2';
  st.done = true;
  st.outcome = outcome;
  recordScore(cfg.key, outcome === 'correct' ? cfg.weight : 0);
  setCheckable(u, false);
  renderFinal(u, cfg, st, true);
  showFeedback(outcome, fb[outcome], u);
  if (screenResolved(s)) {
    const hook = HOOKS[sidOf(s)];
    if (hook && hook.resolved) hook.resolved(s, n, outcome);
    if (!videoGate(s, n)) { window.lomdaState.DONE[n] = true; revealForwardNav(n); }   // else onVideoEnded does it
  }
}

/* Mark the final state: right answers green; wrong picks marked wrong. A
   typed answer that was wrong twice shows the right one (green); one graded
   by a hook has many right answers, so it is only marked wrong. */
function renderFinal(u, cfg, st, justChecked) {
  u.querySelectorAll('textarea[data-min-chars]').forEach(function (t) { t.disabled = true; });   // the explanation is final with the answer
  resetFreeHint(u);
  if (cfg.kind === 'dnd') {
    if (st.outcome === 'correct') { dndMark(u, true); dndLock(u); return; }
    dndMark(u, false);
    dndLock(u);
    const reveal = function () { dndRevealCorrect(u); dndMark(u, true); };
    if (justChecked) setTimeout(reveal, 2000); else reveal();
    return;
  }
  if (cfg.kind === 'input') {
    const byHook = unitScreen(u).getAttribute('data-grade') === 'hook';
    u.querySelectorAll('.q-input').forEach(function (qi) {
      qi.querySelectorAll('.q-in').forEach(function (i) { i.disabled = true; });
      if (st.outcome === 'correct') { qi.classList.add('correct'); return; }
      if (byHook) { qi.classList.add('wrong'); return; }
      const ans = parseValue(qi.getAttribute('data-answer'));
      const num = qi.querySelector('[data-frac="num"]'), den = qi.querySelector('[data-frac="den"]');
      if (ans && num && den) { num.value = ans[0]; den.value = ans[1]; }
      else if (ans) qi.querySelector('.q-in').value = ans[0];
      qi.classList.add('revealed');
    });
    return;
  }
  u.querySelectorAll('.q-opt').forEach(function (o) {
    const isRight = o.hasAttribute('data-correct'), on = o.classList.contains('selected');
    o.classList.remove('correct', 'wrong');
    if (isRight) o.classList.add('correct');
    else if (on) o.classList.add('wrong');
  });
}

/* ===================================================================
   Drag and drop — chips into slots. Pointer Events, so it works with a
   mouse, a finger and a pen; click-to-pick / click-to-place doubles as the
   keyboard path (Enter on a chip, then Enter on a slot).

   Bank mode (default): chips start in a bank and are dragged into slots.
     <div class="dnd-bank"> <button class="dnd-chip" type="button" data-chip="c1">word</button> … </div>
     … <span class="dnd-slot" data-accept="c1" role="button" tabindex="0" aria-label="…"></span> …
   Swap mode (data-dnd-mode="swap" on the section): the chips start INSIDE
   the slots, shuffled, and the learner swaps them into order. No bank.
   data-accept may list several chip ids (interchangeable answers): "c1 c4".
   Every chip remembers where it started, so a reset puts it back there.
   =================================================================== */
let dndPicked = null;     // chip chosen by click/keyboard, waiting for a slot
let dndDrag = null;       // { chip, ghost, startX, startY, moved }

function dndBank(s) { return s.querySelector('.dnd-bank'); }
function dndSwapMode(s) { return s.getAttribute('data-dnd-mode') === 'swap'; }
function dndSlotRight(slot) {
  const chip = slot.querySelector('.dnd-chip');
  const ok = (slot.getAttribute('data-accept') || '').split(/\s+/);
  return !!chip && ok.indexOf(chip.getAttribute('data-chip')) !== -1;
}
function dndRemember(s) {
  s.querySelectorAll('.dnd-chip').forEach(function (c, i) {
    if (!c._home) { c._home = c.parentElement; c._homeIndex = i; }
  });
}
function dndRefresh(s) {
  s.querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.toggle('filled', !!sl.querySelector('.dnd-chip')); });
  updateCheckable(s);
}
function dndReset(s) {
  dndRemember(s);
  const chips = Array.prototype.slice.call(s.querySelectorAll('.dnd-chip'));
  chips.sort(function (a, b) { return a._homeIndex - b._homeIndex; });
  chips.forEach(function (c) { c.classList.remove('picked', 'locked'); c.disabled = false; c._home.appendChild(c); });
  s.querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.remove('correct', 'wrong', 'drop-target'); });
  s.classList.remove('dnd-locked');
  qEnsure(s).touched = false;
  dndRefresh(s);
}
/* Put a chip in a slot. If the slot is taken, the chip already there moves to
   where the new one came from (another slot = a swap), or back to the bank. */
function dndPlace(chip, slot) {
  const s = screenOf(chip);
  const from = chip.parentElement;
  const prev = slot.querySelector('.dnd-chip');
  if (prev === chip) return;
  if (prev) {
    if (from.classList.contains('dnd-slot')) from.appendChild(prev);
    else (dndBank(s) || from).appendChild(prev);
  }
  slot.appendChild(chip);
  qEnsure(s).touched = true;
  dndRefresh(s);
  announce(uiText('dnd-placed'));
}
function dndReturn(chip) {
  const s = screenOf(chip);
  const bank = dndBank(s);
  if (!bank) return;                       // swap mode: a chip always stays in a slot
  bank.appendChild(chip);
  qEnsure(s).touched = true;
  dndRefresh(s);
}
/* Click (or Enter) on a chip picks it up; then a slot places it, and the
   bank takes it back. Clicking the picked chip again puts it down. */
function dndChipClick(chip) {
  const s = screenOf(chip);
  if (s.classList.contains('dnd-locked')) return;
  if (dndDrag && dndDrag.moved) return;               // the pointerup already handled it
  if (dndPicked === chip) { chip.classList.remove('picked'); dndPicked = null; return; }
  // A chip is waiting and this one sits in a slot: the click means "put it here".
  if (dndPicked && chip.closest('.dnd-slot')) { dndSlotClick(chip.closest('.dnd-slot')); return; }
  if (dndPicked) dndPicked.classList.remove('picked');
  dndPicked = chip;
  chip.classList.add('picked');
  announce(uiText('dnd-picked'));
}
function dndSlotClick(slot) {
  if (!dndPicked) return;
  const chip = dndPicked;
  chip.classList.remove('picked');
  dndPicked = null;
  dndPlace(chip, slot);
  chip.focus({ preventScroll: true });
}
function dndBankClick() {
  if (!dndPicked || !dndPicked.closest('.dnd-slot')) return;
  const chip = dndPicked;
  chip.classList.remove('picked');
  dndPicked = null;
  dndReturn(chip);
  chip.focus({ preventScroll: true });
}

/* Pointer dragging. The stage is scaled, so pointer positions are converted
   to stage pixels before the floating copy is placed. */
document.addEventListener('pointerdown', function (e) {
  const chip = e.target.closest && e.target.closest('.dnd-chip');
  if (!chip || e.button > 0) return;
  const s = screenOf(chip);
  if (!s || s.classList.contains('dnd-locked')) return;
  dndDrag = { chip: chip, ghost: null, startX: e.clientX, startY: e.clientY, moved: false };
  chip.setPointerCapture && chip.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', function (e) {
  if (!dndDrag) return;
  const d = dndDrag;
  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
  const app = document.getElementById('app').getBoundingClientRect(), k = appScale();
  if (!d.moved) {
    d.moved = true;
    const r = d.chip.getBoundingClientRect();
    d.ghost = d.chip.cloneNode(true);
    d.ghost.classList.add('dnd-ghost');
    d.ghost.style.width = (r.width / k) + 'px';
    d.ghost.style.height = (r.height / k) + 'px';
    d.offX = (e.clientX - r.left) / k;
    d.offY = (e.clientY - r.top) / k;
    document.getElementById('app').appendChild(d.ghost);
    d.chip.classList.add('dragging');
  }
  d.ghost.style.left = ((e.clientX - app.left) / k - d.offX) + 'px';
  d.ghost.style.top = ((e.clientY - app.top) / k - d.offY) + 'px';
  const slot = dndSlotAt(screenOf(d.chip), e.clientX, e.clientY);
  screenOf(d.chip).querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.toggle('drop-target', sl === slot); });
});
function dndEndDrag(e) {
  if (!dndDrag) return;
  const d = dndDrag;
  if (d.moved) {
    const s = screenOf(d.chip);
    const slot = dndSlotAt(s, e.clientX, e.clientY);
    s.querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.remove('drop-target'); });
    if (slot) dndPlace(d.chip, slot);
    else if (d.chip.closest('.dnd-slot')) dndReturn(d.chip);   // dragged out of a slot -> back to the bank
    d.ghost.remove();
    d.chip.classList.remove('dragging');
    if (dndPicked) { dndPicked.classList.remove('picked'); dndPicked = null; }
    setTimeout(function () { dndDrag = null; }, 0);         // let the click that follows see .moved
  } else {
    dndDrag = null;
  }
}
document.addEventListener('pointerup', dndEndDrag);
document.addEventListener('pointercancel', dndEndDrag);

/* The slot under the pointer, or the nearest one within 90 stage px (small
   targets are hard to hit, especially with a finger). */
function dndSlotAt(s, x, y) {
  let best = null, bestD = Infinity;
  const k = appScale();
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    const r = sl.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy) / k;
    if (dist < bestD) { bestD = dist; best = sl; }
  });
  return bestD <= 90 ? best : null;
}
function dndMark(s, allRight) {
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    sl.classList.remove('correct', 'wrong');
    sl.classList.add(allRight || dndSlotRight(sl) ? 'correct' : 'wrong');
  });
}
function dndLock(s) {
  s.classList.add('dnd-locked');
  s.querySelectorAll('.dnd-chip').forEach(function (c) { c.classList.add('locked'); c.classList.remove('picked'); });
}
/* Put the right chip in every slot. A slot may accept several chips; each
   chip is used once. */
function dndRevealCorrect(s) {
  const pool = document.createDocumentFragment();
  s.querySelectorAll('.dnd-chip').forEach(function (c) { pool.appendChild(c); });
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    const ok = (sl.getAttribute('data-accept') || '').split(/\s+/);
    for (let i = 0; i < ok.length; i++) {
      const c = pool.querySelector('.dnd-chip[data-chip="' + ok[i] + '"]');
      if (c) { sl.appendChild(c); break; }
    }
    sl.classList.add('filled');
  });
  const bank = dndBank(s);
  Array.prototype.slice.call(pool.children).forEach(function (c) { (bank || c._home).appendChild(c); });   // spare chips
}

/* ---------------- Scoring + completion ---------------- */
/* The grade is out of 100 even when the storyboard's weights do not add up
   to 100 (qa_check.py warns about that). */
function totalWeight() {
  let t = 0;
  document.querySelectorAll('.screen[data-type="question"]').forEach(function (s) {
    t += parseFloat(s.getAttribute('data-weight') || '0');
  });
  return t;
}
function recordScore(key, points) {
  window.lomdaState.questionScores[key] = points;
  let earned = 0;
  Object.keys(window.lomdaState.questionScores).forEach(function (k) { earned += window.lomdaState.questionScores[k]; });
  const total = totalWeight();
  window.lomdaState.score = total ? earned * 100 / total : 0;
}
function computeFinalGrade() { return Math.round(window.lomdaState.score); }

function enterFinish(s, n) {
  window.lomdaState.DONE[n] = true;
}
let completeSent = false;
function sendComplete() {
  if (completeSent) return;
  completeSent = true;
  try { window.parent.postMessage({ type: 'LOMDA_COMPLETE', score: computeFinalGrade() }, '*'); } catch (e) {}
}
/* ===================================================================
   The end of every lomda: a score pop-up, then a dark screen sending the learner back to the
   Moodle (the quiz page that follows the lomda). Both are in index.html (#final-score,
   #final-return) so their text is translated with everything else.
     "סיימתי" (data-action="finish")  ->  finishLomda(): sends the grade, shows the score pop-up
     the pop-up's X (or Escape)      ->  showReturnScreen(): the dark screen with the instruction
   After the pop-up nothing else works: no arrows, no Tab out. The learner leaves through the Moodle.
   A lomda that skins its own finish popup (.popup-src with data-close-action="finish") gets the
   same ending: opening it sends the grade, its X shows the dark screen.
   =================================================================== */
/* Leaving the end: a host that jumps to another screen (index_dev.html, the QA system's screen list) takes the learner out of
   the ending, so the score pop-up, the dark screen and the key lock go. A learner cannot do this: the pop-up covers the stage
   and the keys are locked, so for a learner the ending stays final. Called before the new screen's entry logic. */
function leaveFinalStage() {
  if (!finalStage) return;
  finalStage = false;
  closePopups('nav');   // the lomda's own finish pop-up (.popup-src[data-close-action=finish]), when the host switched screens without goTo()
  ['final-score', 'final-return'].forEach(function (id) { const el = document.getElementById(id); if (el) el.hidden = true; });
}
function finishLomda() { showFinalScore(); }
function showFinalScore() {
  const box = document.getElementById('final-score');
  if (!box) { sendComplete(); return; }
  sendComplete();
  closeAllOverlays();
  pauseAllMedia();
  finalStage = true;
  box.querySelectorAll('[data-final-grade]').forEach(function (el) { el.textContent = computeFinalGrade(); });
  box.hidden = false;
  const x = box.querySelector('.final-score-close');
  (x || box).focus({ preventScroll: true });
}
function showReturnScreen() {
  const ret = document.getElementById('final-return');
  if (!ret) return;
  finalStage = true;
  closeAllOverlays();
  pauseAllMedia();
  document.dispatchEvent(new CustomEvent('lomda:end'));   // a lomda with its own sound (Web Audio) listens and stops it
  const box = document.getElementById('final-score');
  if (box) box.hidden = true;
  ret.hidden = false;
  ret.focus({ preventScroll: true });
}
document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('#final-score .final-score-close')) showReturnScreen();
});
/* Capture phase: once the score is shown, only the X (and Escape) do anything. */
document.addEventListener('keydown', function (e) {
  if (!finalStage) return;
  const ret = document.getElementById('final-return');
  if (e.key === 'Escape') { if (ret && ret.hidden) showReturnScreen(); e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

/* ---------------- Question stepper (progress pills) ----------------
   Built from the data-step numbers on question screens; shown only there. */
function buildStepper() {
  const st = document.getElementById('q-stepper');
  if (!st) return;
  let max = 0;
  document.querySelectorAll('.screen[data-step]').forEach(function (s) {
    max = Math.max(max, parseInt(s.getAttribute('data-step'), 10) || 0);
  });
  st.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    const pill = document.createElement('span');
    pill.className = 'q-step';
    pill.setAttribute('data-step', i);
    pill.textContent = i;
    st.appendChild(pill);
  }
}
function updateStepper(s) {
  const st = document.getElementById('q-stepper');
  if (!st) return;
  const step = parseInt(s.getAttribute('data-step') || '0', 10);
  st.classList.toggle('visible', step > 0);
  st.querySelectorAll('.q-step').forEach(function (p) {
    p.classList.toggle('active', parseInt(p.getAttribute('data-step'), 10) === step);
  });
}

/* ===================================================================
   Applets (iframes). The arrow appears N seconds after the learner starts
   the applet: the applet posts {type:'APPLET_STARTED'} to its parent.
     data-arrow-after="15"        seconds (default 15)
     data-arrow-trigger="enter"   start counting on entry instead (an
                                  applet that cannot post the message)
   =================================================================== */
const appletRevealed = {};
const appletTimer = {};
function enterApplet(s, n) {
  if (appletRevealed[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
  // a placeholder (no applet yet) cannot say it started, so count from entry
  if (s.getAttribute('data-arrow-trigger') === 'enter' || s.querySelector('.applet-frame[data-pending-asset]')) startAppletTimer(s);
}
function startAppletTimer(s) {
  const n = screenNum(s);
  if (appletTimer[n] || appletRevealed[n]) return;
  const sec = parseFloat(s.getAttribute('data-arrow-after') || '15');
  appletTimer[n] = setTimeout(function () {
    appletRevealed[n] = true;
    window.lomdaState.DONE[n] = true;
    if (currentScreen === n) revealForwardNav(n);
  }, sec * 1000);
}
function onAppletStarted(source) {
  document.querySelectorAll('.screen[data-type="applet"] iframe').forEach(function (f) {
    if (f.contentWindow === source) startAppletTimer(screenOf(f));
  });
}

/* ===================================================================
   Popups opened by a button, shown in place over their own screen:
     <button class="help-btn" type="button" data-popup="help-q1">עזרה</button>
     <div class="popup-src" id="help-q1" hidden>…any content…</div>
   Help texts, an applet, a video (from inside the feedback too), the finish
   popup. The engine wraps the content in .popup-panel and adds a close (X)
   button labelled from #ui-text. X, Escape or a click on the dark backdrop
   closes it. Extras on .popup-src:
     data-close-action="finish"   opening it sends the grade; closing it shows the dark back-to-the-Moodle screen
     [data-final-grade] inside    filled with the grade (0–100) on opening
   =================================================================== */
function initPopups() {
  document.querySelectorAll('.popup-src').forEach(function (p) {
    if (p.querySelector(':scope > .popup-panel')) return;
    const panel = document.createElement('div');
    panel.className = 'popup-panel';
    while (p.firstChild) panel.appendChild(p.firstChild);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'popup-close';
    x.setAttribute('aria-label', uiText('close'));
    panel.insertBefore(x, panel.firstChild);
    p.appendChild(panel);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('tabindex', '-1');
  });
}
let popupHidFeedback = false;
function openPopup(btn) {
  const p = document.getElementById(btn.getAttribute('data-popup'));
  if (!p) return;
  closePopups('nav');
  const fb = document.getElementById('feedback-popup');
  popupHidFeedback = fb.classList.contains('show');
  if (popupHidFeedback) fb.classList.remove('show');
  p.querySelectorAll('[data-final-grade]').forEach(function (el) { el.textContent = computeFinalGrade(); });
  if (p.getAttribute('data-close-action') === 'finish') { sendComplete(); finalStage = true; }   // from here on only its X / Escape work
  btn.classList.remove('blink');                 // a blinking button has done its job once used
  btn.classList.add('is-open');                  // the opener stays lit above the dark backdrop
  p._opener = btn;
  p.hidden = false;
  p.classList.add('show');
  openOverlayFocus(p.querySelector('.popup-close') || p);
}
/* how: 'x' (its close button), 'esc' (Escape / backdrop), 'nav' (leaving the screen) */
function closePopup(p, how) {
  if (!p || !p.classList.contains('show')) return;
  p.classList.remove('show');
  p.hidden = true;
  if (p._opener) { p._opener.classList.remove('is-open'); p._opener = null; }
  p.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} });
  if (how === 'nav') { popupHidFeedback = false; return; }
  if (p.getAttribute('data-close-action') === 'finish') { showReturnScreen(); return; }   // X, Escape or the backdrop: always the dark screen
  returnOverlayFocus();
  if (popupHidFeedback) { document.getElementById('feedback-popup').classList.add('show'); popupHidFeedback = false; }
}
function closePopups(how) {
  document.querySelectorAll('.popup-src.show').forEach(function (p) { closePopup(p, how); });
}

/* Reopen popup: a button on a later screen shows content from an earlier
   one again (an applet, a diagram, a reminder) without copying it:
     <button class="reopen-btn" data-reopen="soil-sim">…</button>
   clones the element marked [data-reopen-content] inside the screen whose
   data-sid is "soil-sim". */
let reopenHidFeedback = false;
function toggleReopen(btn) {
  const popup = document.getElementById('reopen-popup');
  const body = document.getElementById('reopen-popup-body');
  const fb = document.getElementById('feedback-popup');
  const wasOpen = popup.classList.contains('show') && btn.classList.contains('is-open');
  document.querySelectorAll('.reopen-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
  popup.classList.remove('show');
  body.innerHTML = '';
  if (wasOpen) {
    returnOverlayFocus();
    if (reopenHidFeedback) { fb.classList.add('show'); reopenHidFeedback = false; }
    return;
  }
  const src = document.querySelector('.screen[data-sid="' + btn.getAttribute('data-reopen') + '"] [data-reopen-content]');
  if (!src) return;
  const copy = src.cloneNode(true);
  copy.removeAttribute('data-reopen-content');
  copy.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
  body.appendChild(copy);
  reopenHidFeedback = fb.classList.contains('show');
  if (reopenHidFeedback) fb.classList.remove('show');
  popup.classList.add('show');
  btn.classList.add('is-open');
  openOverlayFocus(popup);
}

/* ---------------- Image zoom ---------------- */
function openZoom(btn) {
  const modal = document.getElementById('img-zoom-modal');
  const body = document.getElementById('img-zoom-body');
  body.innerHTML = '';
  const img = document.createElement('img');
  img.src = btn.getAttribute('data-zoom-src');
  img.alt = btn.getAttribute('data-zoom-alt') || '';
  body.appendChild(img);
  modal.classList.add('show');
  openOverlayFocus(modal.querySelector('[data-zoom-close]'));
}
function closeZoom() {
  document.getElementById('img-zoom-modal').classList.remove('show');
  returnOverlayFocus();
}

/* ---------------- Glossary terms ----------------
   <p>… <button class="term" type="button" aria-describedby="tip-x">term</button> …</p>
   <span class="term-tip" role="tooltip" id="tip-x">definition</span>     (AFTER the paragraph)
   Hover or keyboard focus shows the tip; a tap toggles it on touch screens.
   The tip sits outside the sentence so screen readers and the translation
   export read the sentence whole. */
function termTip(term) { return document.getElementById(term.getAttribute('aria-describedby') || ''); }
function showTerm(term, on) {
  const tip = termTip(term);
  if (tip) tip.classList.toggle('show', on);
  term.classList.toggle('is-open', on);
}
/* A tap fires mouseover AND click: with a finger only the click counts (it
   toggles); with a mouse, hovering shows the tip and a click changes nothing. */
let termTouch = false;
document.addEventListener('pointerdown', function (e) {
  termTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (!(e.target.closest && e.target.closest('.term'))) {
    document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });   // a tap elsewhere closes it
  }
}, true);
function toggleTerm(term) {
  if (!termTouch) return;
  const open = !term.classList.contains('is-open');
  document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });
  showTerm(term, open);
}
document.addEventListener('mouseover', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, true); });
document.addEventListener('mouseout', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, false); });
document.addEventListener('focusin', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, true); });
document.addEventListener('focusout', function (e) { const t = e.target.closest && e.target.closest('.term'); if (t) showTerm(t, false); });   // tapping elsewhere closes it too

/* ---------------- Start ---------------- */
/* While the final feedback box is open the screen's characters step aside (CSS: #app.fb-open). */
document.addEventListener('DOMContentLoaded', function () {
  const fb = document.getElementById('feedback-popup'), app = document.getElementById('app');
  if (!fb || !app || !window.MutationObserver) return;
  // only the final feedback (right / wrong on the second try) clears the characters; the retry message sits beside them
  const sync = function () { app.classList.toggle('fb-open', fb.classList.contains('show') && !fb.classList.contains('retry') && !fb.classList.contains('retryPartial')); };
  new MutationObserver(sync).observe(fb, { attributes: true, attributeFilter: ['class'] });
  sync();
});
document.addEventListener('DOMContentLoaded', function () {
  buildStepper();
  initPopups();
  document.querySelectorAll('.screen[data-kind="dnd"]').forEach(dndRemember);
  document.querySelectorAll('.video-wrap').forEach(initVideo);
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  // index.html#7 opens screen 7 directly (handy while building).
  const fromHash = parseInt((location.hash || '').replace('#', ''), 10);
  const first = fromHash >= 1 && fromHash <= TOTAL_SCREENS ? fromHash : 1;
  const s = screenEl(first);
  if (s) s.classList.add('active');
  currentScreen = first;
  resetScreenState(first);
  notifyScreenChanged(first);
  announceReady();
  schedulePreload(first + 1);
});
