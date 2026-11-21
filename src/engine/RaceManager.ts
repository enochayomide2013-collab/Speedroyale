import * as THREE from 'three';
import type { GameModeDef } from '../shared/gameData';
import type { CheckpointGate } from './MapBuilder';
import type { AudioManager } from './AudioManager';
import type { ZeroPointPhase } from './MovementSystem';
import type { WeatherCondition } from './WeatherSystem';
import type { GhostSelection } from '../shared/types';

export interface RacerProgress {
  id: string;
  name: string;
  speedstarId: string;
  isHuman: boolean;
  isRemote: boolean;
  team: 'cyan' | 'amber' | null;
  nextCheckpointIndex: number; // 0..checkpoints.length (when === checkpoints.length, needs finish line)
  progress: number;            // 0..1+
  finished: boolean;
  eliminated: boolean;
  finishTimeSec: number | null;
  starsCollected: number;
}

export interface RaceFeedEvent {
  id: number;
  text: string;
  tone: 'cyan' | 'amber' | 'rose' | 'emerald';
  timestampSec: number;
}

export interface RadarDotSnapshot {
  id: string;
  x: number;
  z: number;
  yaw: number;
  isHuman: boolean;
  isLeader: boolean;
  isGhost?: boolean;
  ghostTone?: 'cyan' | 'amber';
  eliminated: boolean;
  team: 'cyan' | 'amber' | null;
}

export interface HudSnapshot {
  phase: 'lobby' | 'countdown' | 'racing' | 'finished';
  mapId: string;
  countdownValue: number; // 3, 2, 1, 0
  raceTimeSec: number;
  placement: number;
  totalRacers: number;
  remainingRacers: number;
  speedKmh: number;
  turboMeter: number;
  turboActive: boolean;
  checkpointCurrent: number;
  checkpointTotal: number;
  starsCollected: number;
  modeId: string;
  modeObjectiveText: string;
  eliminated: boolean;
  mountedVehicle: boolean;
  zeroPointPhase: ZeroPointPhase;
  zeroPointTimeLeft: number;
  abilities: {
    id: string;
    name: string;
    cooldownLeft: number;
    maxCooldown: number;
    kind: 'active' | 'passive';
  }[];
  gadgetCooldownLeft: number;
  standings: {
    id: string;
    name: string;
    speedstarId: string;
    isHuman: boolean;
    team: 'cyan' | 'amber' | null;
    progress: number;
    finished: boolean;
    eliminated: boolean;
    finishTimeSec: number | null;
    starsCollected: number;
  }[];
  teamScores: { cyan: number; amber: number } | null;
  championshipStage: number; // 1..3
  spectating: {
    active: boolean;
    liveRoom: boolean;
    roomCode: string | null;
    cameraMode: 'follow' | 'free';
    targetId: string | null;
    targetName: string;
    targetSpeedstarId: string;
    targetSpeedKmh: number;
    targetProgress: number;
    targetPlacement: number;
    targetTurbo: boolean;
    isReplay: boolean;
    replayAvailable: boolean;
    replayPlaying: boolean;
    replayTimeSec: number;
    replayDurationSec: number;
    replaySpeed: number;
  };
  tutorialSignals: {
    ranDistance: number;
    jumped: number;
    slid: number;
    wallRunSec: number;
    railGrindSec: number;
    turboUsed: number;
    abilityUsed: number;
    speedKmh: number;
  };
  debugInfo: {
    x: number;
    y: number;
    z: number;
    speedMs: number;
    surface: string;
    fps: number;
    trackProgress: number;
    state: string;
  };
  radarDots: RadarDotSnapshot[];
  raceEvents: RaceFeedEvent[];
  weather: {
    condition: WeatherCondition;
    label: string;
    roadConditionLabel: string;
    wetness: number;
    icing: number;
  };
  ghost: {
    active: boolean;
    selection: GhostSelection;
    label: string;
    username: string;
    speedstarId: string;
    targetTimeSec: number;
    deltaSec: number | null;
  } | null;
}

export class CheckpointManager {
  private readonly checkpoints: CheckpointGate[];

  constructor(checkpoints: CheckpointGate[]) {
    this.checkpoints = checkpoints;
  }

  public get total(): number {
    return this.checkpoints.length;
  }

  public evaluateRacer(
    racer: RacerProgress,
    pos: THREE.Vector3,
    trackProgress: number,
    isLocalHuman: boolean,
    audio?: AudioManager
  ): boolean {
    if (racer.finished || racer.eliminated) return false;

    const totalCp = this.checkpoints.length;
    if (racer.nextCheckpointIndex < totalCp) {
      const targetCp = this.checkpoints[racer.nextCheckpointIndex];
      const distSq = pos.distanceToSquared(targetCp.position);
      const passedByProgress = trackProgress >= targetCp.progress && trackProgress < targetCp.progress + 0.14;
      if (distSq < 196 || passedByProgress) {
        racer.nextCheckpointIndex += 1;
        if (isLocalHuman) audio?.playCheckpoint();
      }
      racer.progress = (racer.nextCheckpointIndex / (totalCp + 1)) + Math.min(0.08, Math.max(0, trackProgress - (racer.nextCheckpointIndex / (totalCp + 1))));
    } else {
      // Passed all checkpoints: crossing start/finish (trackProgress wraps near 0.96..1.0 or 0..0.08)
      if (trackProgress > 0.93 || (racer.progress > 0.85 && trackProgress < 0.12)) {
        racer.progress = 1.0;
        return true; // Just finished!
      }
      racer.progress = Math.max(racer.progress, 0.9 + trackProgress * 0.1);
    }
    return false;
  }
}

export class RaceManager {
  public phase: 'lobby' | 'countdown' | 'racing' | 'finished' = 'lobby';
  public countdownTimer = 3.2;
  public lastCountdownBeep = 4;
  public raceTimeSec = 0;
  public racers: RacerProgress[] = [];
  public eliminationStage = 0;
  public stormSafeProgress = 0;
  public championshipStage = 1;
  public ghostSamples: { t: number; x: number; y: number; z: number; yaw: number }[] = [];
  private ghostSampleAcc = 0;
  private events: RaceFeedEvent[] = [];
  private nextEventId = 1;
  private lastLeaderId: string | null = null;
  private finalStretchAnnounced = false;

  public pushEvent(text: string, tone: RaceFeedEvent['tone'] = 'cyan'): void {
    this.events.push({
      id: this.nextEventId++,
      text,
      tone,
      timestampSec: this.raceTimeSec,
    });
    if (this.events.length > 8) {
      this.events.shift();
    }
  }

  public getActiveEvents(): RaceFeedEvent[] {
    return this.events.filter((e) => this.raceTimeSec - e.timestampSec <= 4.5).slice(-3);
  }

  public startRace(
    racers: RacerProgress[],
    championshipStage: number,
    audio?: AudioManager
  ): void {
    this.racers = racers;
    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownBeep = 4;
    this.raceTimeSec = 0;
    this.eliminationStage = 0;
    this.stormSafeProgress = -0.08;
    this.championshipStage = championshipStage;
    this.ghostSamples = [];
    this.ghostSampleAcc = 0;
    this.events = [];
    this.lastLeaderId = racers[0]?.id ?? null;
    this.finalStretchAnnounced = false;
    audio?.startMusic('race');
  }

  public update(
    dt: number,
    mode: GameModeDef,
    localPlayerPos: THREE.Vector3,
    localPlayerYaw: number,
    audio?: AudioManager,
    onRaceFinished?: () => void
  ): void {
    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const sec = Math.ceil(this.countdownTimer);
      if (sec < this.lastCountdownBeep && sec >= 1) {
        this.lastCountdownBeep = sec;
        audio?.playCountdown(false);
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        audio?.playCountdown(true);
        this.pushEvent('GO! Full Throttle!', 'cyan');
      }
      return;
    }

    if (this.phase !== 'racing') return;

    this.raceTimeSec += dt;

    // Detect lead changes after opening pack separates
    if (this.racers.length > 1 && this.raceTimeSec > 2.5) {
      const leader = this.getSortedStandings(mode.id).find((r) => !r.eliminated);
      if (leader && leader.id !== this.lastLeaderId) {
        this.lastLeaderId = leader.id;
        this.pushEvent(
          leader.isHuman ? 'You took 1st Place!' : `${leader.name} takes the lead!`,
          leader.isHuman ? 'emerald' : 'amber'
        );
      }
    }

    // Record player ghost samples at 10Hz for Time Attack / Personal Best saving
    if (this.ghostSamples.length < 2400) {
      this.ghostSampleAcc += dt;
      if (this.ghostSampleAcc >= 0.1 || this.ghostSamples.length === 0) {
        this.ghostSampleAcc = 0;
        this.ghostSamples.push({
          t: Number(this.raceTimeSec.toFixed(2)),
          x: localPlayerPos.x,
          y: localPlayerPos.y,
          z: localPlayerPos.z,
          yaw: localPlayerYaw,
        });
      }
    }

    // Speed Royale staged elimination at Checkpoint thresholds
    if (mode.id === 'speed-royale') {
      const local = this.racers.find((r) => r.isHuman);
      const leaderProgress = Math.max(...this.racers.map((r) => (r.eliminated ? 0 : r.progress)));
      const thresholds = [0.3, 0.58, 0.82];
      const cutCounts = [8, 8, 6];
      if (this.eliminationStage < thresholds.length && leaderProgress >= thresholds[this.eliminationStage]) {
        const alive = this.racers.filter((r) => !r.eliminated && !r.finished);
        alive.sort((a, b) => a.progress - b.progress);
        const toCut = Math.min(cutCounts[this.eliminationStage], Math.max(0, alive.length - 4));
        for (let i = 0; i < toCut; i++) {
          alive[i].eliminated = true;
        }
        this.eliminationStage += 1;
        if (toCut > 0) {
          this.pushEvent(`Gate ${this.eliminationStage} Cut — ${toCut} runners eliminated!`, 'rose');
        }
        if (local?.eliminated) {
          this.phase = 'finished';
          audio?.playFinish(false);
          onRaceFinished?.();
          return;
        }
      }
    }

    // Last Runner Standing: advancing Storm Surge elimination zone
    if (mode.id === 'last-runner-standing') {
      this.stormSafeProgress += dt * 0.0145;
      for (const r of this.racers) {
        if (!r.eliminated && !r.finished && this.raceTimeSec > 10 && r.progress < this.stormSafeProgress) {
          r.eliminated = true;
          this.pushEvent(`${r.name} caught by Storm Surge!`, 'rose');
          if (r.isHuman) {
            this.phase = 'finished';
            audio?.playFinish(false);
            onRaceFinished?.();
            return;
          }
        }
      }
    }

    // Timed round expiry (Star Collector / Last Runner / Max round cap)
    if (mode.id === 'star-collector' && this.raceTimeSec >= mode.roundDurationSec) {
      this.finishAllRemaining(mode);
      audio?.playFinish(this.getPlacement('local') === 1);
      onRaceFinished?.();
      return;
    }

    const local = this.racers.find((r) => r.isHuman);
    if (local && !this.finalStretchAnnounced && local.progress >= 0.85 && !local.finished) {
      this.finalStretchAnnounced = true;
      this.pushEvent('Final Stretch — Finish Line ahead!', 'emerald');
    }
    if (local && local.finished) {
      this.phase = 'finished';
      audio?.playFinish(this.getPlacement('local') === 1);
      onRaceFinished?.();
    }
  }

  public finishTrainingNow(audio?: AudioManager): void {
    const local = this.racers.find((r) => r.isHuman);
    if (local) {
      local.finished = true;
      local.finishTimeSec = this.raceTimeSec;
    }
    this.phase = 'finished';
    audio?.playFinish(true);
  }

  private finishAllRemaining(mode: GameModeDef): void {
    for (const r of this.racers) {
      if (!r.finished && !r.eliminated) {
        r.finished = true;
        r.finishTimeSec = mode.roundDurationSec;
      }
    }
    this.phase = 'finished';
  }

  public getSortedStandings(modeId: string): RacerProgress[] {
    const copy = [...this.racers];
    copy.sort((a, b) => {
      if (modeId === 'star-collector') {
        if (b.starsCollected !== a.starsCollected) return b.starsCollected - a.starsCollected;
      }
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.finished && b.finished) {
        return (a.finishTimeSec ?? 9999) - (b.finishTimeSec ?? 9999);
      }
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    return copy;
  }

  public getPlacement(racerId: string, modeId = 'royale-race'): number {
    const sorted = this.getSortedStandings(modeId);
    const idx = sorted.findIndex((r) => r.id === racerId);
    return idx >= 0 ? idx + 1 : 1;
  }

  public getTeamScores(modeId: string): { cyan: number; amber: number } | null {
    if (modeId !== 'team-sprint') return null;
    const sorted = this.getSortedStandings(modeId);
    let cyan = 0;
    let amber = 0;
    sorted.forEach((r, idx) => {
      const pts = Math.max(1, sorted.length - idx);
      if (r.team === 'cyan') cyan += pts;
      if (r.team === 'amber') amber += pts;
    });
    return { cyan, amber };
  }
}
