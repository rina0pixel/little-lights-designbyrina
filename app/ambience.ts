// Night-garden ambience, generated live with the Web Audio API (no audio files, no licences).
// Rina's chosen mix: crickets 35%, night breeze 25%, wind chimes 15%, saung-style harp 10%, pagoda bells 60%.
// The same engine powers the "Little Lights Night Sounds" picker page, so the game sounds like the preview.

type LayerId = "crickets" | "breeze" | "chimes" | "harp" | "bells";
type Engine = {
  start(st: any, out: AudioNode): void;
  schedule(st: any, out: AudioNode, from: number, to: number): void;
};

export const AMBIENCE_MIX: Record<LayerId, number> = {
  crickets: 35,
  breeze: 25,
  chimes: 15,
  harp: 10,
  bells: 60,
};
const REVERB_SEND: Record<LayerId, number> = {
  crickets: 0.15,
  breeze: 0.05,
  chimes: 0.55,
  harp: 0.4,
  bells: 0.5,
};
const MASTER = 0.6;

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0]; // Myanmar-style pentatonic: C D E G A
const note = (i: number) =>
  PENTA[((i % 5) + 5) % 5] * Math.pow(2, Math.floor(i / 5));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Ambience {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private layers = new Map<LayerId, { out: GainNode; state: any }>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private plucks = new Map<number, AudioBuffer>();
  private on = false;

  /** Start (or resume) the ambience. Call from a click so browsers allow audio. */
  async start() {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    this.on = true;
    this.fade(MASTER, 2.5);
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), 120);
  }
  /** Fade out and pause scheduling. */
  stop() {
    this.on = false;
    if (!this.ctx) return;
    this.fade(0, 1);
    setTimeout(() => {
      if (!this.on && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    }, 1100);
  }
  /** Pause audio while the tab is hidden, resume when visible again. */
  setVisible(visible: boolean) {
    if (!this.ctx) return;
    if (!visible) this.ctx.suspend();
    else if (this.on) this.ctx.resume();
  }
  dispose() {
    if (this.ticker) clearInterval(this.ticker);
    this.ctx?.close();
    this.ctx = null;
  }

  private fade(to: number, seconds: number) {
    const ctx = this.ctx!,
      g = this.master.gain,
      t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + seconds);
  }
  private build() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = (this.ctx = new AC());
    this.noiseBuf = this.makeNoise();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    reverb.connect(wet).connect(this.master);
    for (const id of Object.keys(AMBIENCE_MIX) as LayerId[]) {
      const gain = ctx.createGain();
      gain.gain.value = (AMBIENCE_MIX[id] / 100) * 1.4;
      gain.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = REVERB_SEND[id];
      gain.connect(send).connect(reverb);
      const state = {};
      this.engines[id].start(state, gain);
      this.layers.set(id, { out: gain, state });
    }
  }
  private tick() {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    for (const [id, l] of this.layers)
      this.engines[id].schedule(l.state, l.out, now + 0.05, now + 0.45);
  }

  /* ---------- building blocks ---------- */
  private makeNoise() {
    const ctx = this.ctx!,
      b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate),
      d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.5 + last * 3;
    }
    return b;
  }
  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!,
      len = ctx.sampleRate * seconds,
      b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  private noiseSource() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start();
    return s;
  }
  private pan(node: AudioNode, value: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return node;
    const p = ctx.createStereoPanner();
    p.pan.value = value;
    node.connect(p);
    return p;
  }
  private env(
    param: AudioParam,
    t: number,
    peak: number,
    attack: number,
    release: number,
  ) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  /** Karplus-Strong plucked string, rendered once per pitch. */
  private pluck(freq: number) {
    const key = Math.round(freq);
    const cached = this.plucks.get(key);
    if (cached) return cached;
    const ctx = this.ctx!,
      sr = ctx.sampleRate,
      len = Math.floor(sr * 3),
      N = Math.round(sr / freq);
    const b = ctx.createBuffer(1, len, sr),
      d = b.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * 0.8;
    for (let i = N; i < len; i++)
      d[i] = 0.497 * (d[i - N] + d[Math.max(0, i - N - 1)]);
    let max = 0;
    for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= max || 1;
    this.plucks.set(key, b);
    return b;
  }

  /* ---------- the five layers in Rina's mix ---------- */
  private engines: Record<LayerId, Engine> = {
    crickets: {
      start: (st) => {
        st.voices = [
          { f: 4400, p: -0.5, next: 0 },
          { f: 5050, p: 0.35, next: 0.4 },
          { f: 3850, p: 0.1, next: 0.9 },
        ];
      },
      schedule: (st, out, from, to) => {
        const ctx = this.ctx!;
        for (const v of st.voices) {
          if (v.next < from) v.next = from + Math.random() * 0.5;
          while (v.next < to) {
            const pulses = 2 + Math.floor(Math.random() * 3);
            for (let k = 0; k < pulses; k++) {
              const t = v.next + k * 0.05,
                o = ctx.createOscillator(),
                g = ctx.createGain();
              o.frequency.value = v.f + rnd(-40, 40);
              o.connect(g);
              this.env(g.gain, t, 0.05, 0.006, 0.03);
              this.pan(g, v.p).connect(out);
              o.start(t);
              o.stop(t + 0.06);
            }
            v.next += Math.random() < 0.15 ? rnd(2.5, 5) : rnd(0.55, 1.4);
          }
        }
      },
    },
    breeze: {
      start: (st, out) => {
        const ctx = this.ctx!,
          n = this.noiseSource(),
          f = ctx.createBiquadFilter(),
          g = ctx.createGain();
        f.type = "lowpass";
        f.frequency.value = 450;
        g.gain.value = 0.25;
        n.connect(f).connect(g).connect(out);
        st.f = f;
        st.g = g;
        st.next = 0;
      },
      schedule: (st, _out, from, to) => {
        if (st.next < to) {
          const t = Math.max(st.next, from),
            d = rnd(3, 6);
          st.f.frequency.linearRampToValueAtTime(rnd(280, 900), t + d);
          st.g.gain.linearRampToValueAtTime(rnd(0.12, 0.45), t + d);
          st.next = t + d;
        }
      },
    },
    chimes: {
      start: (st) => {
        st.next = 0.5;
      },
      schedule: (st, out, from, to) => {
        const ctx = this.ctx!;
        if (st.next < from) st.next = from + rnd(0.2, 1.5);
        while (st.next < to) {
          const f = note(10 + Math.floor(Math.random() * 6)),
            t = st.next,
            p = rnd(-0.8, 0.8);
          for (const [mul, amp] of [
            [1, 0.05],
            [2.76, 0.015],
            [5.4, 0.006],
          ]) {
            const o = ctx.createOscillator(),
              g = ctx.createGain();
            o.frequency.value = f * mul;
            o.connect(g);
            this.env(g.gain, t, amp, 0.004, 3.2 / mul + 0.6);
            this.pan(g, p).connect(out);
            o.start(t);
            o.stop(t + 4);
          }
          st.next += Math.random() < 0.3 ? rnd(0.15, 0.4) : rnd(1.2, 4.5);
        }
      },
    },
    harp: {
      start: (st) => {
        st.next = 0.3;
        st.i = 7;
        st.phrase = 0;
      },
      schedule: (st, out, from, to) => {
        const ctx = this.ctx!;
        if (st.next < from) st.next = from + 0.2;
        while (st.next < to) {
          const t = st.next;
          if (st.phrase >= 6 + Math.floor(Math.random() * 4)) {
            st.phrase = 0;
            st.next += rnd(2.5, 4.5);
            continue;
          }
          st.i = Math.max(
            4,
            Math.min(
              13,
              st.i + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)],
            ),
          );
          const play = (idx: number, vol: number, delay: number) => {
            const s = ctx.createBufferSource(),
              g = ctx.createGain(),
              f = ctx.createBiquadFilter();
            s.buffer = this.pluck(note(idx));
            f.type = "lowpass";
            f.frequency.value = 2600;
            g.gain.value = vol;
            s.connect(f).connect(g);
            this.pan(g, rnd(-0.25, 0.25)).connect(out);
            s.start(t + delay);
          };
          play(st.i, 0.32, 0);
          if (Math.random() < 0.18) play(st.i - 5, 0.18, 0.01);
          if (Math.random() < 0.12) play(st.i + 2, 0.18, 0.18);
          st.phrase++;
          st.next += [0.55, 0.55, 0.8, 1.1, 0.4, 1.6][
            Math.floor(Math.random() * 6)
          ];
        }
      },
    },
    bells: {
      start: (st) => {
        st.next = 0.4;
      },
      schedule: (st, out, from, to) => {
        const ctx = this.ctx!;
        if (st.next < from) st.next = from + rnd(0.3, 2);
        while (st.next < to) {
          const t = st.next,
            f = [98.0, 110.0, 130.81][Math.floor(Math.random() * 3)];
          for (const [mul, amp, dec] of [
            [1, 0.2, 8],
            [1.004, 0.12, 8],
            [2.0, 0.07, 6],
            [2.76, 0.06, 4.5],
            [5.4, 0.025, 2.5],
            [8.93, 0.01, 1.5],
          ]) {
            const o = ctx.createOscillator(),
              g = ctx.createGain();
            o.frequency.value = f * mul;
            o.connect(g);
            this.env(g.gain, t, amp, 0.01, dec);
            g.connect(out);
            o.start(t);
            o.stop(t + dec + 0.2);
          }
          st.next += rnd(9, 15);
        }
      },
    },
  };
}
