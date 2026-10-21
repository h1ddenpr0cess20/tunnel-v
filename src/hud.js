// HUD, whispers and the title / game-over / pause panels.
import { yearsLeft } from './game.js';

const $ = id => document.getElementById(id);

export function fmtYears(L) {
  if (L >= 10) return `${L.toFixed(1)} years`;
  if (L >= 1) return `${L.toFixed(2)} years`;
  if (L < 1e-12) return `${L.toExponential(3)} years`;
  return `${L.toFixed(Math.min(16, 3 - Math.floor(Math.log10(L))))} years`;
}
const fmtM = m => Math.floor(m).toLocaleString('en-US');

const MILESTONES = [
  [60, 'stay tuned'], [200, 'the eighties'], [420, 'the seventies'],
  [700, 'you can make out the bars'], [1050, 'the sixties'], [1500, 'adjust the rabbit ears'],
  [2100, 'almost tuned in'], [2900, 'it was right there a second ago'],
  [3900, 'please stand by'], [5200, 'nearly'], [7000, 'do not adjust your set'],
];
const HINTS = {
  tv: ['steer round it', 'drag to steer'],
  wall: ['find the gap', 'find the gap'],
  tape: ['tapes', 'tapes'],
  phone: ["don't answer it", "don't answer it"],
  record: ['records', 'records'],
  cassette: ['thread through', 'thread through'],
};
const DEATH = {
  tv: 'you hit a TV set', wall: 'you hit a wall of TVs', tape: 'a tape got you',
  phone: 'you answered the phone', record: 'a record got you', cassette: 'you hit a cassette',
};

export function createHud(store) {
  const el = {
    hud: $('hud'), dist: $('dist'), years: $('years'), whisper: $('whisper'),
    title: $('title'), bestTitle: $('best-title'),
    over: $('over'), overHead: $('over-head'), overDist: $('over-dist'), overYears: $('over-years'), overBest: $('over-best'),
    paused: $('paused'), pauseBtn: $('pause'), snd: $('snd'), error: $('error'), errorMsg: $('error-msg'),
  };
  let best = Number(store.get('nt5-best')) || 0;
  let milestone = 0;
  let timer = 0;
  let last = '';
  const hinted = {};

  function whisper(text, ms = 2600) {
    el.whisper.textContent = text;
    el.whisper.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.whisper.classList.remove('on'), ms);
  }

  if (best) {
    el.bestTitle.hidden = false;
    el.bestTitle.textContent = `Your best: ${fmtM(best)} m. 1950 was ${fmtYears(yearsLeft(best))} away.`;
  }

  return {
    start() {
      milestone = 0; last = '';
      el.title.hidden = true; el.over.hidden = true; el.paused.hidden = true;
      el.hud.hidden = false; el.pauseBtn.hidden = false; el.pauseBtn.textContent = 'Pause';
    },
    progress(m) {
      const t = `${fmtM(m)} m|${fmtYears(yearsLeft(m))}`;
      if (t !== last) {
        last = t;
        const [d, l] = t.split('|');
        el.dist.textContent = d;
        el.years.textContent = l;
      }
      const ms = MILESTONES[milestone];
      if (ms && m >= ms[0]) { milestone++; whisper(ms[1]); return true; }
      return false;
    },
    approach(kind, touch) {
      if (hinted[kind] || !HINTS[kind]) return;
      hinted[kind] = true;
      whisper(HINTS[kind][touch ? 1 : 0], 1800);
    },
    die() { el.pauseBtn.hidden = true; },
    over(kind, m) {
      const isBest = m > best;
      if (isBest) { best = m; store.set('nt5-best', String(Math.floor(m))); }
      el.overHead.textContent = DEATH[kind] || 'off the air';
      el.overDist.textContent = `${fmtM(m)} m`;
      el.overYears.textContent = `1950 is still ${fmtYears(yearsLeft(m))} away.`;
      el.overBest.textContent = isBest && m > 0 ? 'Your farthest trip back yet.' : `Your best: ${fmtM(best)} m`;
      el.hud.hidden = true; el.over.hidden = false;
    },
    pause(p) {
      el.paused.hidden = !p;
      el.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    sound(muted) { el.snd.textContent = muted ? 'Sound off' : 'Sound on'; },
    error(msg) {
      el.title.hidden = true;
      el.error.hidden = false;
      el.errorMsg.textContent = msg;
    },
    buttons: { pause: el.pauseBtn, sound: el.snd },
  };
}
