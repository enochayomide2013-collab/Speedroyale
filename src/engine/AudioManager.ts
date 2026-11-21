export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private surfaceFilter: BiquadFilterNode | null = null;
  private surfaceGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private weatherWindBoost = 0;
  private weatherWindFreqBoost = 0;

  private masterVolume = 0.7;
  private sfxVolume = 0.85;
  private musicVolume = 0.45;
  private musicTimer: number | null = null;
  private stepIndex = 0;
  private isMusicPlaying = false;
  private turboBoostMultiplier = 1;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.ambienceGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.ambienceGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.buildNoiseBuffer();
      this.setupContinuousLayers();
      this.applyVolumes();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.12) * 0.5;
    }
    this.noiseBuffer = buf;
  }

  private setupContinuousLayers(): void {
    if (!this.ctx || !this.ambienceGain || !this.noiseBuffer) return;

    // Continuous speed-reactive wind rush layer
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 1.1;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambienceGain);
    windSrc.start();

    // Continuous rain / atmospheric bed layer
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this.noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1400;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambienceGain);
    rainSrc.start();

    // Continuous wet-road hydroplane hiss & icy scrape layer
    const surfaceSrc = this.ctx.createBufferSource();
    surfaceSrc.buffer = this.noiseBuffer;
    surfaceSrc.loop = true;
    this.surfaceFilter = this.ctx.createBiquadFilter();
    this.surfaceFilter.type = 'bandpass';
    this.surfaceFilter.frequency.value = 2200;
    this.surfaceFilter.Q.value = 0.9;
    this.surfaceGain = this.ctx.createGain();
    this.surfaceGain.gain.value = 0.0;
    surfaceSrc.connect(this.surfaceFilter);
    this.surfaceFilter.connect(this.surfaceGain);
    this.surfaceGain.connect(this.ambienceGain);
    surfaceSrc.start();

    // Vehicle harmonic engine layer
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 65;
    const engFilter = this.ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 340;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(engFilter);
    engFilter.connect(this.engineGain);
    this.engineGain.connect(this.ambienceGain);
    this.engineOsc.start();
  }

  public setVolumes(master: number, sfx: number, music: number): void {
    this.masterVolume = Math.max(0, Math.min(1, master));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.masterVolume, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVolume, now, 0.03);
    this.ambienceGain.gain.setTargetAtTime(this.sfxVolume * 0.75, now, 0.05);
  }

  public setEnvironmentAmbience(weather: string, inRace: boolean): void {
    if (!this.ctx || !this.rainGain) return;
    const now = this.ctx.currentTime;
    const targetRain = inRace ? (weather === 'rain' ? 0.14 : weather === 'sandstorm' ? 0.09 : 0.015) : 0.0;
    this.rainGain.gain.setTargetAtTime(targetRain, now, 0.25);
  }

  public setWeatherAudio(
    rainIntensity: number,
    snowIntensity: number,
    sandIntensity: number,
    wetness: number,
    icing: number,
    speedRatio: number,
    surface: string,
    mountedVehicle: boolean,
    inRace: boolean
  ): void {
    if (!inRace) {
      this.weatherWindBoost = 0;
      this.weatherWindFreqBoost = 0;
    } else {
      this.weatherWindBoost = Math.min(0.085, snowIntensity * 0.04 + sandIntensity * 0.075 + rainIntensity * 0.03);
      this.weatherWindFreqBoost = snowIntensity * 210 + sandIntensity * 340 + rainIntensity * 140;
    }

    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this.rainGain) {
      const targetRain = inRace
        ? Math.min(0.22, rainIntensity * 0.17 + sandIntensity * 0.075 + snowIntensity * 0.04 + 0.008)
        : 0;
      this.rainGain.gain.setTargetAtTime(targetRain, now, 0.22);
    }

    if (this.surfaceGain && this.surfaceFilter) {
      const clampedSpd = Math.max(0, Math.min(1.8, speedRatio));
      if (!inRace || clampedSpd < 0.15) {
        this.surfaceGain.gain.setTargetAtTime(0, now, 0.08);
      } else {
        const vehicleMult = mountedVehicle ? 1.35 : 0.85;
        if (surface === 'puddle' || surface === 'water') {
          this.surfaceFilter.frequency.setTargetAtTime(1750 + clampedSpd * 520, now, 0.06);
          this.surfaceGain.gain.setTargetAtTime(Math.min(0.18, 0.045 + clampedSpd * 0.08 * vehicleMult), now, 0.06);
        } else if (surface === 'ice') {
          this.surfaceFilter.frequency.setTargetAtTime(3250 + clampedSpd * 650, now, 0.06);
          this.surfaceGain.gain.setTargetAtTime(Math.min(0.13, 0.025 + clampedSpd * 0.055 * vehicleMult), now, 0.06);
        } else if (wetness > 0.22) {
          this.surfaceFilter.frequency.setTargetAtTime(2250 + clampedSpd * 420, now, 0.08);
          this.surfaceGain.gain.setTargetAtTime(Math.min(0.085, wetness * clampedSpd * 0.052 * vehicleMult), now, 0.08);
        } else if (icing > 0.28) {
          this.surfaceFilter.frequency.setTargetAtTime(2900 + clampedSpd * 400, now, 0.08);
          this.surfaceGain.gain.setTargetAtTime(Math.min(0.065, icing * clampedSpd * 0.038 * vehicleMult), now, 0.08);
        } else {
          this.surfaceGain.gain.setTargetAtTime(0, now, 0.08);
        }
      }
    }
  }

  public setSpeedIntensity(speedRatio: number, turboActive: boolean, mountedVehicle = false): void {
    this.turboBoostMultiplier = turboActive ? 1.35 : 1 + Math.min(0.25, speedRatio * 0.25);
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this.windFilter && this.windGain) {
      const clamped = Math.max(0, Math.min(2.2, speedRatio));
      const speedWind = clamped > 0.22 ? Math.min(0.18, (clamped - 0.2) * 0.095) * (turboActive ? 1.35 : 1) : 0;
      const targetGain = Math.min(0.22, speedWind + this.weatherWindBoost);
      this.windGain.gain.setTargetAtTime(targetGain, now, 0.08);
      this.windFilter.frequency.setTargetAtTime(
        260 + clamped * 520 + (turboActive ? 350 : 0) + this.weatherWindFreqBoost,
        now,
        0.08
      );
    }

    if (this.engineOsc && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(mountedVehicle ? 0.065 : 0, now, 0.08);
      this.engineOsc.frequency.setTargetAtTime(58 + Math.min(1.8, speedRatio) * 85 + (turboActive ? 45 : 0), now, 0.06);
    }
  }

  public startMusic(mode: 'lobby' | 'race'): void {
    this.unlock();
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    const tempoMs = mode === 'race' ? 145 : 240;
    const bassNotes = mode === 'race'
      ? [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42]
      : [55, 0, 65.41, 0, 49, 0, 61.74, 0];
    const leadNotes = mode === 'race'
      ? [220, 261.63, 329.63, 392, 440, 392, 329.63, 293.66]
      : [220, 0, 261.63, 329.63, 0, 246.94, 293.66, 0];

    const tick = () => {
      if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;
      if (this.ctx.state !== 'running') {
        this.musicTimer = window.setTimeout(tick, tempoMs);
        return;
      }
      const now = this.ctx.currentTime;
      const idx = this.stepIndex % bassNotes.length;
      const bass = bassNotes[idx];
      if (bass > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(bass, now);
        g.gain.setValueAtTime(0.13, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.15);
      }
      const lead = leadNotes[idx];
      if (lead > 0 && (this.stepIndex % 2 === 0 || this.turboBoostMultiplier > 1.15)) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1050 * this.turboBoostMultiplier, now);
        osc.frequency.setValueAtTime(lead, now);
        g.gain.setValueAtTime(0.048, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.14);
      }
      this.stepIndex++;
      const nextMs = Math.max(105, Math.round(tempoMs / (mode === 'race' ? Math.min(1.22, this.turboBoostMultiplier) : 1)));
      this.musicTimer = window.setTimeout(tick, nextMs);
    };
    this.musicTimer = window.setTimeout(tick, tempoMs);
  }

  public stopMusic(): void {
    this.isMusicPlaying = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.weatherWindBoost = 0;
    this.weatherWindFreqBoost = 0;
    this.setEnvironmentAmbience('clear', false);
    this.setWeatherAudio(0, 0, 0, 0, 0, 0, 'normal', false, false);
    this.setSpeedIntensity(0, false, false);
  }

  private playTone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(filterFreq: number, filterType: BiquadFilterType, duration: number, volume: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(now, Math.random() * 1.2, duration + 0.02);
  }

  public playUiClick(): void {
    this.unlock();
    this.playTone(620, 880, 0.06, 'sine', 0.16);
  }

  public playPurchase(): void {
    this.unlock();
    this.playTone(523.25, 659.25, 0.09, 'triangle', 0.22);
    window.setTimeout(() => this.playTone(783.99, 1046.5, 0.16, 'triangle', 0.24), 80);
  }

  public playFootstep(sprint: boolean, surface: string, ambience = 'city'): void {
    const vol = sprint ? 0.12 : 0.08;
    if (surface === 'water' || surface === 'puddle') {
      this.playNoiseBurst(1650, 'bandpass', 0.095, vol * 1.45);
      this.playTone(270, 130, 0.06, 'sine', vol * 0.55);
    } else if (surface === 'ice' || ambience === 'snow') {
      this.playNoiseBurst(2650, 'bandpass', 0.065, vol * 1.25);
      this.playTone(235, 95, 0.045, 'triangle', vol * 0.42);
    } else if (ambience === 'desert' || ambience === 'beach') {
      this.playNoiseBurst(1200, 'bandpass', 0.075, vol * 1.1);
    } else if (ambience === 'forest') {
      this.playNoiseBurst(800, 'lowpass', 0.06, vol * 1.2);
      this.playTone(105, 58, 0.05, 'triangle', vol * 0.55);
    } else {
      // Concrete / asphalt sneaker impact
      this.playNoiseBurst(1100, 'bandpass', 0.04, vol * 0.9);
      this.playTone(135 + (Math.random() - 0.5) * 20, 52, 0.055, 'triangle', vol * 0.8);
    }
  }

  public playJump(isDouble: boolean): void {
    this.playTone(isDouble ? 340 : 190, isDouble ? 740 : 440, 0.14, 'sine', 0.18);
    this.playNoiseBurst(900, 'highpass', 0.09, 0.07);
  }

  public playLand(): void {
    this.playTone(120, 42, 0.12, 'triangle', 0.22);
    this.playNoiseBurst(420, 'lowpass', 0.1, 0.14);
  }

  public playSlide(): void {
    this.playNoiseBurst(1500, 'bandpass', 0.24, 0.16);
    this.playTone(240, 105, 0.18, 'sawtooth', 0.07);
  }

  public playPuddleSplash(intensity = 1): void {
    const clamped = Math.max(0.4, Math.min(1.5, intensity));
    this.playNoiseBurst(1450, 'bandpass', 0.18, 0.14 * clamped);
    this.playTone(210, 82, 0.11, 'sine', 0.09 * clamped);
  }

  public playIceSkid(): void {
    this.playNoiseBurst(3400, 'bandpass', 0.16, 0.11);
    this.playTone(620, 420, 0.1, 'triangle', 0.045);
  }

  public playWeatherCue(condition: string): void {
    if (condition === 'rain') {
      this.playNoiseBurst(140, 'lowpass', 1.1, 0.22);
      this.playTone(64, 34, 0.85, 'triangle', 0.16);
    } else if (condition === 'snow') {
      this.playNoiseBurst(760, 'bandpass', 0.72, 0.14);
      this.playTone(880, 1174.66, 0.22, 'sine', 0.06);
    } else if (condition === 'sandstorm') {
      this.playNoiseBurst(520, 'bandpass', 0.8, 0.16);
    } else if (condition === 'clear') {
      this.playTone(523.25, 783.99, 0.26, 'sine', 0.075);
    }
  }

  public playTurboStart(): void {
    this.playTone(140, 740, 0.32, 'sawtooth', 0.26);
    this.playNoiseBurst(1800, 'bandpass', 0.35, 0.18);
    window.setTimeout(() => this.playTone(440, 880, 0.28, 'sine', 0.18), 60);
  }

  public playTurboEnd(): void {
    this.playTone(420, 130, 0.22, 'sine', 0.14);
  }

  public playAbility(): void {
    this.playTone(380, 960, 0.18, 'triangle', 0.22);
  }

  public playStarPickup(): void {
    this.playTone(740, 1180, 0.1, 'sine', 0.2);
  }

  public playCheckpoint(): void {
    this.playTone(523.25, 783.99, 0.14, 'triangle', 0.2);
  }

  public playCountdown(go: boolean): void {
    this.unlock();
    if (go) {
      this.playTone(880, 1174.66, 0.35, 'triangle', 0.3);
    } else {
      this.playTone(440, 440, 0.16, 'sine', 0.22);
    }
  }

  public playFinish(won: boolean): void {
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [440, 523.25, 659.25];
    notes.forEach((n, i) => {
      window.setTimeout(() => this.playTone(n, n * 1.02, 0.24, 'triangle', 0.25), i * 110);
    });
  }

  public playZeroPointActivate(): void {
    this.unlock();
    this.playTone(330, 660, 0.48, 'sine', 0.22);
    this.playTone(495, 990, 0.48, 'triangle', 0.12);
  }

  public playZeroPointSequence(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterVolume, now);
    this.masterGain.gain.linearRampToValueAtTime(0.02, now + 0.06);
    this.masterGain.gain.setValueAtTime(0.02, now + 0.32);
    this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.45);

    window.setTimeout(() => {
      this.playTone(110, 42, 0.85, 'sawtooth', 0.28);
      this.playTone(220, 880, 0.65, 'sine', 0.24);
      this.playTone(329.63, 659.25, 0.72, 'triangle', 0.18);
    }, 340);
  }

  public playZeroPointFinish(): void {
    this.unlock();
    this.playTone(587.33, 196, 0.55, 'sine', 0.24);
    window.setTimeout(() => this.playTone(440, 110, 0.45, 'triangle', 0.16), 90);
  }

  public playTutorialStep(): void {
    this.unlock();
    this.playTone(587.33, 783.99, 0.1, 'triangle', 0.2);
    window.setTimeout(() => this.playTone(880, 1174.66, 0.16, 'sine', 0.22), 75);
  }

  public dispose(): void {
    this.stopMusic();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
