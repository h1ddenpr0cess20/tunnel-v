// Synthesized sound, no samples. Audio starts on the first key press or tap.
//
// The tunnel: a Shepard tone that rises for ever and never gets any higher
// (the sound of chasing something you never reach), played as if off a
// worn tape, wavering with wow and flutter. Under it: the hiss of static,
// louder the faster you fly, the hum of the mains, the thin whine of a
// picture tube high up, and the crackle of a record. Telephones ring as you
// come up on them; things going by close sound like the dial being turned;
// crashing switches the set off.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const PARTIALS = 6;   // octaves in the Shepard tone
const LEVEL = 0.7;

export const Sound = {
  ac: null, out: null, sfx: null, bed: null, noise: null,
  shep: [], phase: 0, hiss: null, hissF: null, clock: 0,
  muted: store.get('nt5-muted') === '1',

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ac = new AC(); } catch { return; }
    const ac = this.ac;
    this.out = ac.createGain();
    this.out.gain.value = this.muted ? 0 : LEVEL;
    // Glue, so a crash on top of everything doesn't clip.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 5;
    comp.connect(this.out);
    this.out.connect(ac.destination);
    this.sfx = ac.createGain(); this.sfx.connect(comp);
    this.bed = ac.createGain(); this.bed.gain.value = 0.6; this.bed.connect(comp);

    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Shepard tone: sines an octave apart, each a pair a hair out of tune,
    // through a dull tape-ish filter.
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.9;
    const sg = ac.createGain(); sg.gain.value = 0.9;
    lp.connect(sg); sg.connect(this.bed);
    for (let k = 0; k < PARTIALS; k++) {
      const g = ac.createGain(); g.gain.value = 0;
      const pair = [1, 1.005].map(m => {
        const o = ac.createOscillator();
        o.type = k < 2 ? 'triangle' : 'sine'; o.connect(g); o.start();
        return { o, m };
      });
      g.connect(lp);
      this.shep.push({ g, pair, oct: -1 });
    }

    // Mains hum: 60 cycles and its buzz.
    const hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 60;
    const humF = ac.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 320;
    const humG = ac.createGain(); humG.gain.value = 0.035;
    hum.connect(humF); humF.connect(humG); humG.connect(this.bed); hum.start();

    // The picture tube's whine, way up.
    const whine = ac.createOscillator(); whine.frequency.value = 15734;
    const whineG = ac.createGain(); whineG.gain.value = 0.004;
    whine.connect(whineG); whineG.connect(this.bed); whine.start();

    // Static.
    const src = ac.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.4;
    const hg = ac.createGain(); hg.gain.value = 0.03;
    src.connect(bp); bp.connect(hg); hg.connect(this.bed); src.start();
    this.hiss = hg; this.hissF = bp;
  },

  setMuted(m) {
    this.muted = m;
    store.set('nt5-muted', m ? '1' : '0');
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : LEVEL, this.ac.currentTime, 0.05);
  },

  suspend(p) { if (this.ac) (p ? this.ac.suspend() : this.ac.resume()); },

  ok() { return this.ac && !this.muted && this.ac.state === 'running'; },

  pan(p, node) {
    if (!p || !this.ac.createStereoPanner) return node;
    const s = this.ac.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p));
    s.connect(node);
    return s;
  },

  burst(dur, freq, gain, type = 'lowpass', q = 0.8, f1 = freq, pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.pan(pan, this.sfx));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  },

  tone(f0, f1, dur, gain, type = 'sine', pan = 0, at = 0) {
    if (!this.ok()) return;
    const ac = this.ac, t = ac.currentTime + at;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.pan(pan, this.sfx));
    o.start(t); o.stop(t + dur + 0.02);
  },

  // A struck bell: a few inharmonic partials ringing down.
  bell(f, dur, gain, pan = 0, at = 0) {
    for (const [m, g] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]) this.tone(f * m, f * m * 0.998, dur / Math.sqrt(m), gain * g, 'sine', pan, at);
  },

  // Every frame: the Shepard tone climbs and wavers, the static follows your
  // speed, and the record crackles.
  update(dt, speed, lateral, off = 0) {
    if (!this.ac || this.ac.state !== 'running') return;
    const t = this.ac.currentTime;
    this.clock += dt;
    this.phase = (this.phase + dt * (0.01 + speed * 0.004)) % 1;
    const wow = 1 + 0.006 * Math.sin(this.clock * Math.PI * 2 * 0.55) + 0.0025 * Math.sin(this.clock * Math.PI * 2 * 6.3);
    for (let k = 0; k < PARTIALS; k++) {
      const p = this.shep[k];
      const oct = (k + this.phase) % PARTIALS;
      const f = 27.5 * Math.pow(2, oct) * wow;
      const wrapped = oct < p.oct;
      p.oct = oct;
      for (const { o, m } of p.pair) {
        if (wrapped) o.frequency.setValueAtTime(f * m, t);
        else o.frequency.setTargetAtTime(f * m, t, 0.03);
      }
      p.g.gain.setTargetAtTime(0.045 * Math.exp(-((oct - 3) ** 2) / (2 * 1.1 * 1.1)), t, 0.03);
    }
    this.hiss.gain.setTargetAtTime(0.02 + speed * 0.0035, t, 0.2);
    this.hissF.frequency.setTargetAtTime(1800 + speed * 120 + Math.abs(lateral) * 500, t, 0.2);
    this.bed.gain.setTargetAtTime((speed > 2 ? 1 : 0.6) * (1 - 0.9 * off), t, 0.08);
    if (Math.random() < dt * (5 + speed * 0.5)) {
      this.burst(0.004 + Math.random() * 0.006, 1500 + Math.random() * 4000, 0.02 + Math.random() * 0.05, 'highpass', 0.7, undefined, Math.random() * 1.6 - 0.8);
    }
  },

  // Switching on: the thunk of the switch, the tube whining up, a rush of static.
  start() {
    this.tone(90, 40, 0.25, 0.25, 'sine');
    this.tone(4000, 15000, 0.6, 0.012, 'sine', 0, 0.05);
    this.burst(0.9, 600, 0.2, 'bandpass', 0.6, 5000, 0, 0.08);
  },
  // Close: a whoosh, and a twist of the dial through the static.
  nearMiss(side, k, kind) {
    this.burst(0.45, 3200, 0.18 + 0.3 * k, 'bandpass', 1.4, 380, side * 0.75);
    this.burst(0.25, 900, 0.06 + 0.1 * k, 'bandpass', 6, 4200, side * 0.5, 0.05);
    this.tone(110, 52, 0.4, 0.08 * k, 'sine', side * 0.5);
    if (kind === 'record') this.tone(520, 300, 0.4, 0.03 * k, 'triangle', side * 0.6);
  },
  // A telephone's bell: the clapper hammering between two gongs.
  ring(side) {
    for (let i = 0; i < 18; i++) this.bell(i % 2 ? 1180 : 1320, 0.25, 0.022, side * 0.7, i * 0.05);
  },
  // The crash, and the set switching off: a pop, the tube's whine falling away.
  crash(kind) {
    this.burst(1.3, 2200, 0.8, 'lowpass', 0.8, 55);
    this.tone(120, 28, 0.9, 0.35);
    this.tone(15000, 180, 1.1, 0.03, 'sine', 0, 0.25);
    this.tone(60, 30, 0.12, 0.4, 'square', 0, 1.0);
    if (kind === 'tv' || kind === 'wall') {
      // Glass.
      this.burst(0.6, 6000, 0.35, 'highpass', 0.7, 9000);
      for (const [f, g] of [[2310, 0.05], [3470, 0.04], [5120, 0.03], [7020, 0.02]]) this.tone(f, f * 0.99, 0.7, g);
    } else if (kind === 'phone') {
      this.bell(1250, 1.6, 0.08);
    } else if (kind === 'record') {
      // The needle skidding across.
      this.burst(0.5, 1200, 0.25, 'bandpass', 3, 5200);
    } else {
      this.burst(0.12, 2500, 0.4, 'bandpass', 2, 1800);
    }
  },
  // The test tone, at every milestone.
  chime() {
    this.tone(1000, 1000, 0.7, 0.03, 'sine', 0);
  },
};

export { store };
