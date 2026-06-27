import { Howl } from 'howler';

export type SfxName =
    | 'jump' | 'doubleJump' | 'land' | 'landHeavy' | 'dash' | 'wallJump'
    | 'hit' | 'hitHeavy' | 'enemyDeath' | 'playerHit' | 'gameOver' | 'superJump' | 'bounce';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ToneSpec {
    freq: number;
    freqEnd?: number;   // sweep target (exponential)
    type?: Wave;
    duration?: number;  // seconds
    attack?: number;    // seconds
    release?: number;   // seconds
    volume?: number;    // 0..1
    delay?: number;     // start offset, seconds
}

interface NoiseSpec {
    duration?: number;
    volume?: number;
    type?: BiquadFilterType;
    freq?: number;
    delay?: number;
}

/**
 * Zero-asset procedural sound effects via the Web Audio API, plus optional file-backed
 * music via howler. SFX are synthesized on the fly, so the game is audible with no audio
 * assets shipped. The AudioContext must be resumed from a user gesture — call resume()
 * from the first keypress (GameRunner does this).
 */
export class AudioSystem {
    private static ctx: AudioContext | null = null;
    private static master: GainNode | null = null;
    private static _muted = false;
    private static _volume = 0.5;
    private static music: Howl | null = null;

    private static ensure(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.ctx) {
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this._muted ? 0 : this._volume;
            this.master.connect(this.ctx.destination);
        }
        return this.ctx;
    }

    /** Resume the AudioContext. Must be invoked from a user gesture (e.g. first keydown). */
    static resume() {
        const ctx = this.ensure();
        if (ctx && ctx.state === 'suspended') void ctx.resume();
    }

    static setVolume(v: number) {
        this._volume = Math.max(0, Math.min(1, v));
        if (this.master && !this._muted) this.master.gain.value = this._volume;
        if (this.music) this.music.volume(this._volume);
    }

    static setMuted(m: boolean) {
        this._muted = m;
        if (this.master) this.master.gain.value = m ? 0 : this._volume;
        if (this.music) this.music.mute(m);
    }

    static get muted() { return this._muted; }
    static get volume() { return this._volume; }

    private static tone(spec: ToneSpec) {
        const ctx = this.ensure();
        if (!ctx || !this.master || ctx.state !== 'running') return;
        const now = ctx.currentTime + (spec.delay ?? 0);
        const dur = spec.duration ?? 0.15;
        const attack = spec.attack ?? 0.005;
        const release = spec.release ?? Math.max(0.02, dur * 0.5);
        const vol = spec.volume ?? 0.3;

        const osc = ctx.createOscillator();
        osc.type = spec.type ?? 'square';
        osc.frequency.setValueAtTime(spec.freq, now);
        if (spec.freqEnd !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), now + dur);
        }

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(vol, now + attack);
        g.gain.linearRampToValueAtTime(0.0001, now + dur + release);

        osc.connect(g);
        g.connect(this.master);
        osc.start(now);
        osc.stop(now + dur + release + 0.02);
    }

    private static noise(spec: NoiseSpec) {
        const ctx = this.ensure();
        if (!ctx || !this.master || ctx.state !== 'running') return;
        const now = ctx.currentTime + (spec.delay ?? 0);
        const dur = spec.duration ?? 0.2;
        const vol = spec.volume ?? 0.3;

        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = spec.type ?? 'lowpass';
        filter.frequency.value = spec.freq ?? 1000;

        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(filter);
        filter.connect(g);
        g.connect(this.master);
        src.start(now);
        src.stop(now + dur);
    }

    /** Play a named SFX. Safe to call before resume() — it simply no-ops until running. */
    static play(name: SfxName) {
        switch (name) {
            case 'jump':
                this.tone({ freq: 320, freqEnd: 620, type: 'square', duration: 0.12, volume: 0.22 });
                break;
            case 'doubleJump':
                this.tone({ freq: 480, freqEnd: 900, type: 'square', duration: 0.12, volume: 0.2 });
                break;
            case 'land':
                this.noise({ duration: 0.09, volume: 0.16, type: 'lowpass', freq: 500 });
                break;
            case 'landHeavy':
                this.noise({ duration: 0.22, volume: 0.32, type: 'lowpass', freq: 350 });
                this.tone({ freq: 120, freqEnd: 40, type: 'sawtooth', duration: 0.18, volume: 0.22 });
                break;
            case 'dash':
                this.noise({ duration: 0.18, volume: 0.2, type: 'highpass', freq: 1200 });
                break;
            case 'wallJump':
                this.tone({ freq: 260, freqEnd: 520, type: 'triangle', duration: 0.1, volume: 0.2 });
                break;
            case 'hit':
                this.tone({ freq: 220, freqEnd: 110, type: 'square', duration: 0.08, volume: 0.22 });
                this.noise({ duration: 0.06, volume: 0.16, type: 'highpass', freq: 2000 });
                break;
            case 'hitHeavy':
                this.tone({ freq: 180, freqEnd: 60, type: 'sawtooth', duration: 0.18, volume: 0.28 });
                this.noise({ duration: 0.16, volume: 0.26, type: 'bandpass', freq: 800 });
                break;
            case 'enemyDeath':
                this.tone({ freq: 400, freqEnd: 80, type: 'sawtooth', duration: 0.3, volume: 0.26 });
                this.noise({ duration: 0.3, volume: 0.18, type: 'lowpass', freq: 1200 });
                break;
            case 'playerHit':
                this.tone({ freq: 300, freqEnd: 90, type: 'square', duration: 0.25, volume: 0.28 });
                break;
            case 'gameOver':
                this.tone({ freq: 440, freqEnd: 220, type: 'triangle', duration: 0.4, volume: 0.28 });
                this.tone({ freq: 330, freqEnd: 110, type: 'triangle', duration: 0.6, volume: 0.28, delay: 0.22 });
                break;
            case 'superJump':
                this.tone({ freq: 300, freqEnd: 1200, type: 'square', duration: 0.3, volume: 0.28 });
                break;
            case 'bounce':
                this.tone({ freq: 500, freqEnd: 1000, type: 'sine', duration: 0.12, volume: 0.24 });
                break;
        }
    }

    // ── Optional file-backed background music (via howler) ──

    /** Start looping background music from a URL (e.g. '/music/theme.mp3'). No-op assets aren't required. */
    static playMusic(src: string, opts: { loop?: boolean; volume?: number } = {}) {
        this.stopMusic();
        this.music = new Howl({
            src: [src],
            loop: opts.loop ?? true,
            volume: opts.volume ?? this._volume,
            mute: this._muted,
        });
        this.music.play();
    }

    static stopMusic() {
        if (this.music) {
            this.music.stop();
            this.music.unload();
            this.music = null;
        }
    }
}
