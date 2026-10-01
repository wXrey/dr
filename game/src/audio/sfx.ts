// Procedural audio: every sound is synthesized with Web Audio (no files). Voice limiting keeps
// hundreds of hits per second from turning into noise. Swap any entry for a sample later.
import type { GameEvent, World } from '../core/world';
import { BIOMES } from '../core/data';
import { settings } from '../settings';

type Voice = { until: number };
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; music!: GainNode; noise!: AudioBuffer;
  voices = new Map<string, Voice[]>();
  drone: { o: OscillatorNode[]; g: GainNode; f: BiquadFilterNode; biome: number } | null = null;
  bossPulse = 0;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const c = this.ctx = new AudioContext();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6; comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.applyVolumes();
    this.noise = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  applyVolumes() { if (!this.ctx) return; this.master.gain.value = settings.master; this.music.gain.value = settings.music; this.sfx.gain.value = settings.sfx; }
  private limit(key: string, max: number, dur: number) {
    const now = this.ctx!.currentTime, list = (this.voices.get(key) || []).filter(v => v.until > now);
    if (list.length >= max) { this.voices.set(key, list); return false; }
    list.push({ until: now + dur }); this.voices.set(key, list); return true;
  }
  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private noiseHit(o: { t?: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; peak: number; a?: number; d: number; pan?: number; out?: AudioNode }) {
    const c = this.ctx!, t = o.t ?? c.currentTime, src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1.2; f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.a ?? 0.005) + o.d);
    const g = c.createGain(); this.env(g, t, o.peak, o.a ?? 0.005, o.d);
    const p = c.createStereoPanner(); p.pan.value = o.pan ?? 0;
    src.connect(f).connect(g).connect(p).connect(o.out || this.sfx); src.start(t, Math.random() * 0.5); src.stop(t + (o.a ?? 0.005) + o.d + 0.05);
  }
  private tone(o: { t?: number; type?: OscillatorType; f0: number; f1?: number; peak: number; a?: number; d: number; pan?: number; out?: AudioNode }) {
    const c = this.ctx!, t = o.t ?? c.currentTime, osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t); if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.a ?? 0.005) + o.d);
    const g = c.createGain(); this.env(g, t, o.peak, o.a ?? 0.005, o.d);
    const p = c.createStereoPanner(); p.pan.value = o.pan ?? 0;
    osc.connect(g).connect(p).connect(o.out || this.sfx); osc.start(t); osc.stop(t + (o.a ?? 0.005) + o.d + 0.05);
  }
  private bell(f: number, peak: number, d: number, t?: number) { for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) this.tone({ t, f0: f * m, peak: peak * a, a: 0.003, d: d / Math.sqrt(m) }); }

  play(e: GameEvent, w: World) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, now = c.currentTime;
    const pan = 'x' in e && typeof e.x === 'number' ? Math.max(-0.8, Math.min(0.8, (e.x - w.p.x) / 600)) : 0;
    switch (e.t) {
      case 'swing': if (!this.limit('swing', 3, 0.15)) break;
        this.noiseHit({ f0: e.heavy || e.w === 'greatsword' ? 900 : 2200, f1: e.heavy || e.w === 'greatsword' ? 250 : 600, q: 0.9, peak: e.heavy ? 0.35 : 0.2, a: 0.02, d: e.w === 'greatsword' ? 0.28 : 0.14 }); break;
      case 'shot': {
        if (!this.limit('shot', 4, 0.2)) break;
        if (e.w === 'crossbow') { this.tone({ type: 'triangle', f0: 240, f1: 110, peak: 0.25, d: 0.16 }); this.noiseHit({ type: 'highpass', f0: 3000, peak: 0.12, d: 0.03 }); break; }
        const big = e.w === 'blunderbuss' ? 1.4 : e.w === 'arquebus' ? 1.2 : 1;
        this.noiseHit({ type: 'lowpass', f0: 4200, f1: 500, q: 0.7, peak: 0.45 * big, a: 0.002, d: 0.22 * big });
        this.tone({ f0: 110, f1: 38, peak: 0.5 * big, a: 0.002, d: 0.18 * big });
        if (e.w === 'arquebus') this.noiseHit({ type: 'highpass', f0: 2500, peak: 0.25, a: 0.001, d: 0.05 });
        break;
      }
      case 'hit': if (!this.limit('hit', 6, 0.06)) break;
        this.noiseHit({ f0: 900 + Math.random() * 900, q: 2, peak: e.crit ? 0.2 : 0.1, d: 0.05, pan });
        if (e.crit) this.tone({ type: 'square', f0: 1400, f1: 900, peak: 0.04, d: 0.05, pan }); break;
      case 'kill': if (!this.limit('kill', 4, 0.1)) break;
        if (e.type === 'skeleton' || e.type === 'archer') { for (let i = 0; i < 3; i++) this.noiseHit({ t: now + i * 0.025, f0: 2500 + Math.random() * 1500, q: 6, peak: 0.08, d: 0.03, pan }); }
        else this.noiseHit({ type: 'lowpass', f0: 700, f1: 200, peak: 0.18, d: 0.12, pan });
        break;
      case 'roll': this.noiseHit({ f0: 350, f1: 1500, q: 1, peak: 0.18, a: 0.06, d: 0.22 }); break;
      case 'hurt': this.tone({ f0: 140, f1: 55, peak: 0.45, d: 0.22 }); this.noiseHit({ type: 'lowpass', f0: 1500, peak: 0.2, d: 0.1 }); break;
      case 'block': this.bell(620, 0.12, 0.5); break;
      case 'perfect': this.tone({ f0: 1100, f1: 1900, peak: 0.08, a: 0.01, d: 0.18 }); break;
      case 'pickup': if (!this.limit('pickup', 2, 0.05)) break; this.tone({ f0: 900 + Math.min(600, (e.v || 1) * 8), f1: 1500, peak: 0.035, d: 0.05 }); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone({ t: now + i * 0.07, type: 'triangle', f0: f, peak: 0.12, d: 0.35 })); break;
      case 'tele': if (!this.limit('tele', 2, 0.2)) break; this.tone({ f0: 330, f1: 300, peak: 0.05, a: 0.02, d: 0.2, pan }); break;
      case 'ring': this.bell(196, 0.16, 1.4); break;
      case 'blast': if (!this.limit('blast', 3, 0.2)) break; this.noiseHit({ type: 'lowpass', f0: 900, f1: 120, peak: 0.35, d: 0.4, pan }); this.tone({ f0: 70, f1: 30, peak: 0.35, d: 0.3 }); break;
      case 'shock': case 'bell': this.tone({ f0: 90, f1: 40, peak: 0.4, d: 0.35 }); this.bell(260, 0.06, 0.8); break;
      case 'pool': this.noiseHit({ type: 'lowpass', f0: 500, peak: 0.12, a: 0.05, d: 0.4, pan }); break;
      case 'eshot': if (!this.limit('eshot', 2, 0.2)) break; this.tone({ type: 'triangle', f0: 300, f1: 150, peak: 0.06, d: 0.1, pan }); break;
      case 'bite': if (!this.limit('bite', 2, 0.1)) break; this.noiseHit({ f0: 600, f1: 300, q: 3, peak: 0.12, d: 0.08, pan }); break;
      case 'dive': if (!this.limit('dive', 2, 0.1)) break; this.noiseHit({ f0: 2800, f1: 1800, q: 4, peak: 0.06, d: 0.06, pan }); break;
      case 'frenzy': this.tone({ type: 'sawtooth', f0: 110, f1: 220, peak: 0.08, a: 0.1, d: 0.4 }); break;
      case 'revive': [392, 494, 587, 784].forEach((f, i) => this.tone({ t: now + i * 0.09, f0: f, peak: 0.1, d: 0.6 })); break;
      case 'gate': this.bell(110, 0.3, 3); break;
      case 'boss': this.tone({ type: 'sawtooth', f0: 55, peak: 0.12, a: 0.6, d: 1.6 }); this.tone({ type: 'sawtooth', f0: 82.4, peak: 0.08, a: 0.6, d: 1.6 }); break;
      case 'bossDead': this.noiseHit({ type: 'lowpass', f0: 600, f1: 80, peak: 0.5, d: 1.2 }); [262, 330, 392, 523].forEach((f, i) => this.tone({ t: now + 0.3 + i * 0.12, type: 'triangle', f0: f, peak: 0.1, d: 1.2 })); break;
      case 'chest': [784, 988, 1175, 1568].forEach((f, i) => this.tone({ t: now + i * 0.06, f0: f, peak: 0.06, d: 0.8 })); break;
      case 'win': [262, 330, 392, 523, 659].forEach((f, i) => this.tone({ t: now + i * 0.2, type: 'triangle', f0: f, peak: 0.12, d: 2 })); break;
      case 'lose': this.tone({ type: 'sawtooth', f0: 110, f1: 55, peak: 0.12, a: 0.1, d: 2.5 }); break;
    }
  }

  /** ambient drone per biome + heartbeat during boss fights */
  update(w: World | null, dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, want = w ? w.biome : -1;
    if (this.drone && this.drone.biome !== want) { const d = this.drone; d.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.8); setTimeout(() => d.o.forEach(o => o.stop()), 4000); this.drone = null; }
    if (!this.drone && want >= 0) {
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.09, c.currentTime, 1.5);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 4;
      const [a, b] = BIOMES[want].music;
      const o = [a, a * 1.005, b, b * 0.997].map((fr, i) => { const o = c.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 220; lfo.connect(lg).connect(f.frequency); lfo.start(); o.push(lfo);
      f.connect(g).connect(this.music);
      this.drone = { o, g, f, biome: want };
    }
    if (w && w.boss && w.mode === 'play') {
      this.bossPulse -= dt;
      if (this.bossPulse <= 0) { this.bossPulse = 0.78; const t = c.currentTime;
        this.tone({ t, f0: 62, f1: 40, peak: 0.3, d: 0.16, out: this.music }); this.tone({ t: t + 0.2, f0: 58, f1: 38, peak: 0.2, d: 0.14, out: this.music }); }
    }
  }
}
