import * as THREE from 'three';
import {
  ABILITIES,
  type GameModeDef,
  type MapDef,
  type SpeedstarDef,
  type VehicleDef,
} from '../shared/gameData';
import type { AnimState } from './CharacterBuilder';
import type { BuiltMap, GrindRail, TrackSampler } from './MapBuilder';
import type { InputSnapshot } from './PlayerController';
import type { AudioManager } from './AudioManager';
import { isDynamicIceAt, isDynamicPuddleAt, type WeatherSnapshot } from './WeatherSystem';

export type ZeroPointPhase = 'inactive' | 'activate' | 'awaken' | 'transcend' | 'finish';

export interface ZeroPointState {
  phase: ZeroPointPhase;
  timer: number;
  worldTimeScale: number;
  justEnteredPhase: ZeroPointPhase | null;
  postGlowTimer: number;
}

export interface TutorialTelemetry {
  ranDistance: number;
  jumped: number;
  slid: number;
  wallRunSec: number;
  railGrindSec: number;
  turboUsed: number;
  abilityUsed: number;
}

export interface ActiveAbilityRuntime {
  id: string;
  name: string;
  cooldownLeft: number;
  maxCooldown: number;
  activeTimeLeft: number;
  kind: 'active' | 'passive';
}

export class SpeedSystem {
  public baseTopSpeed = 24;
  public sprintMultiplier = 1.24;
  public turboMultiplier = 1.38;
  public accelRate = 28;
  public decelRate = 24;

  public configureFromSpeedstar(star: SpeedstarDef): void {
    this.baseTopSpeed = 21 + (star.stats.speed - 65) * 0.14;
    this.accelRate = 24 + (star.stats.acceleration - 65) * 0.25;
  }
}

export class TurboSystem {
  public meter = 40; // 0..100
  public active = false;
  public durationLeft = 0;
  public maxDuration = 3.5;
  public activations = 0;
  public statEfficiency = 1.0;

  public configureFromSpeedstar(star: SpeedstarDef): void {
    const turboNorm = (star.stats.turbo - 65) / 30;
    this.statEfficiency = 0.9 + turboNorm * 0.24;
  }

  public reset(): void {
    this.meter = 45;
    this.active = false;
    this.durationLeft = 0;
    this.activations = 0;
  }

  public addCharge(amount: number): void {
    if (!this.active) {
      this.meter = Math.min(100, this.meter + amount * this.statEfficiency);
    }
  }

  public tryActivate(hasTurboOverdrive: boolean, audio?: AudioManager): boolean {
    if (this.active || this.meter < 25) return false;
    this.active = true;
    const scale = (hasTurboOverdrive ? 1.25 : 1.0) * (0.94 + (this.statEfficiency - 0.9) * 0.5);
    this.maxDuration = (1.6 + (this.meter / 100) * 2.4) * scale;
    this.durationLeft = this.maxDuration;
    this.meter = 0;
    this.activations += 1;
    audio?.playTurboStart();
    return true;
  }

  public update(dt: number, speedRatio: number, isGrinding: boolean, hasTurboOverdrive: boolean, audio?: AudioManager): void {
    if (this.active) {
      this.durationLeft -= dt;
      if (this.durationLeft <= 0) {
        this.active = false;
        this.durationLeft = 0;
        audio?.playTurboEnd();
      }
    } else {
      const recharge =
        (3.2 + speedRatio * 4.5 + (isGrinding ? 14 : 0)) *
        (hasTurboOverdrive ? 1.28 : 1) *
        this.statEfficiency;
      this.meter = Math.min(100, this.meter + recharge * dt);
    }
  }
}

export class AbilitySystem {
  public equipped: ActiveAbilityRuntime[] = [];
  public cooldownScale = 1.0;
  public shieldTimeLeft = 0;
  public glideTimeLeft = 0;
  public magnetTimeLeft = 0;
  public cycloneTimeLeft = 0;
  public flightTimeLeft = 0;
  public lowGravTimeLeft = 0;
  public gadgetCooldownLeft = 0;

  public configureFromSpeedstar(star: SpeedstarDef): void {
    const abilityNorm = (star.stats.abilityPower - 65) / 30;
    this.cooldownScale = 1.06 - abilityNorm * 0.16;
  }

  public configure(equippedIds: string[], ranked: boolean): void {
    this.equipped = equippedIds
      .map((id) => ABILITIES.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .filter((a) => !ranked || a.rankedAllowed)
      .slice(0, 3)
      .map((a) => ({
        id: a.id,
        name: a.name,
        cooldownLeft: 0,
        maxCooldown: a.cooldown,
        activeTimeLeft: 0,
        kind: a.kind,
      }));
    this.shieldTimeLeft = 0;
    this.glideTimeLeft = 0;
    this.magnetTimeLeft = 0;
    this.cycloneTimeLeft = 0;
    this.flightTimeLeft = 0;
    this.lowGravTimeLeft = 0;
    this.gadgetCooldownLeft = 0;
  }

  public has(id: string): boolean {
    return this.equipped.some((a) => a.id === id);
  }

  public update(dt: number): void {
    for (const ab of this.equipped) {
      if (ab.cooldownLeft > 0) ab.cooldownLeft = Math.max(0, ab.cooldownLeft - dt);
      if (ab.activeTimeLeft > 0) ab.activeTimeLeft = Math.max(0, ab.activeTimeLeft - dt);
    }
    if (this.shieldTimeLeft > 0) this.shieldTimeLeft = Math.max(0, this.shieldTimeLeft - dt);
    if (this.glideTimeLeft > 0) this.glideTimeLeft = Math.max(0, this.glideTimeLeft - dt);
    if (this.magnetTimeLeft > 0) this.magnetTimeLeft = Math.max(0, this.magnetTimeLeft - dt);
    if (this.cycloneTimeLeft > 0) this.cycloneTimeLeft = Math.max(0, this.cycloneTimeLeft - dt);
    if (this.flightTimeLeft > 0) this.flightTimeLeft = Math.max(0, this.flightTimeLeft - dt);
    if (this.lowGravTimeLeft > 0) this.lowGravTimeLeft = Math.max(0, this.lowGravTimeLeft - dt);
    if (this.gadgetCooldownLeft > 0) this.gadgetCooldownLeft = Math.max(0, this.gadgetCooldownLeft - dt);
  }
}

export class VehicleManager {
  public mounted = false;
  public activeVehicle: VehicleDef | null = null;

  public setVehicle(v: VehicleDef | null, autoMount: boolean): void {
    this.activeVehicle = v;
    this.mounted = Boolean(v && autoMount);
  }

  public toggle(allowed: boolean): boolean {
    if (!allowed || !this.activeVehicle) return false;
    this.mounted = !this.mounted;
    return this.mounted;
  }
}

export interface PlayerPhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  speed: number;
  grounded: boolean;
  sliding: boolean;
  slideTimer: number;
  wallRunning: boolean;
  wallSide: number; // -1 or 1
  railGrinding: boolean;
  activeRail: GrindRail | null;
  railT: number;
  doubleJumpUsed: boolean;
  airDashUsed: boolean;
  boostTimer: number;
  stunTimer: number;
  animState: AnimState;
  lastSafePos: THREE.Vector3;
  lastSafeYaw: number;
  trackProgress: number;
  currentSurface: string;
}

export class MovementSystem {
  public readonly speedSys = new SpeedSystem();
  public readonly turboSys = new TurboSystem();
  public readonly abilitySys = new AbilitySystem();
  public readonly vehicleMgr = new VehicleManager();

  public devFlight = false;
  public devInfiniteTurbo = false;
  public devNoCooldowns = false;
  public lastLandingForce = 0;

  public zeroPoint: ZeroPointState = {
    phase: 'inactive',
    timer: 0,
    worldTimeScale: 1,
    justEnteredPhase: null,
    postGlowTimer: 0,
  };

  public tutorialTelemetry: TutorialTelemetry = {
    ranDistance: 0,
    jumped: 0,
    slid: 0,
    wallRunSec: 0,
    railGrindSec: 0,
    turboUsed: 0,
    abilityUsed: 0,
  };

  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpVec = new THREE.Vector3();

  public resetTutorialTelemetry(): void {
    this.tutorialTelemetry = {
      ranDistance: 0,
      jumped: 0,
      slid: 0,
      wallRunSec: 0,
      railGrindSec: 0,
      turboUsed: 0,
      abilityUsed: 0,
    };
  }

  public activateZeroPoint(state: PlayerPhysicsState, audio?: AudioManager): void {
    if (this.zeroPoint.phase !== 'inactive') return;
    this.zeroPoint.phase = 'activate';
    this.zeroPoint.timer = 0.65;
    this.zeroPoint.worldTimeScale = 0.65;
    this.zeroPoint.justEnteredPhase = 'activate';
    this.zeroPoint.postGlowTimer = 0;
    state.railGrinding = false;
    state.wallRunning = false;
    state.sliding = false;
    state.grounded = false;
    state.velocity.y = 2.2;
    audio?.playZeroPointActivate();
  }

  public resetState(
    state: PlayerPhysicsState,
    spawnPos: THREE.Vector3,
    spawnYaw: number,
    speedstar: SpeedstarDef
  ): void {
    this.speedSys.configureFromSpeedstar(speedstar);
    this.turboSys.configureFromSpeedstar(speedstar);
    this.abilitySys.configureFromSpeedstar(speedstar);
    this.turboSys.reset();
    this.zeroPoint = {
      phase: 'inactive',
      timer: 0,
      worldTimeScale: 1,
      justEnteredPhase: null,
      postGlowTimer: 0,
    };
    state.position.copy(spawnPos);
    state.velocity.set(0, 0, 0);
    state.yaw = spawnYaw;
    state.speed = 0;
    state.grounded = true;
    state.sliding = false;
    state.slideTimer = 0;
    state.wallRunning = false;
    state.railGrinding = false;
    state.activeRail = null;
    state.doubleJumpUsed = false;
    state.airDashUsed = false;
    state.boostTimer = 0;
    state.stunTimer = 0;
    state.animState = 'idle';
    state.lastSafePos.copy(spawnPos);
    state.lastSafeYaw = spawnYaw;
    state.trackProgress = 0;
    state.currentSurface = 'normal';
  }

  public step(
    state: PlayerPhysicsState,
    input: InputSnapshot,
    dt: number,
    speedstar: SpeedstarDef,
    mapDef: MapDef,
    builtMap: BuiltMap,
    sampler: TrackSampler,
    mode: GameModeDef,
    audio?: AudioManager,
    onStarCollected?: (kind: 'star' | 'turbo', pos: THREE.Vector3) => void,
    onBoostTrigger?: (pos: THREE.Vector3) => void,
    weather?: WeatherSnapshot
  ): void {
    const safeDt = Math.min(0.05, dt);
    this.lastLandingForce = 0;
    this.abilitySys.update(safeDt);

    // Owner's Vault Overrides
    if (this.devNoCooldowns) {
      for (const ab of this.abilitySys.equipped) {
        ab.cooldownLeft = 0;
      }
      this.abilitySys.gadgetCooldownLeft = 0;
    }
    if (this.devInfiniteTurbo) {
      this.turboSys.meter = 100;
      if (this.turboSys.active) {
        this.turboSys.durationLeft = Math.max(this.turboSys.durationLeft, 3.0);
      }
    }

    // Update Zero Point 4-phase state machine
    this.stepZeroPoint(safeDt, state, audio);

    if (input.respawnPressed) {
      this.respawnToSafe(state, audio);
      return;
    }

    if (input.vehicleTogglePressed) {
      this.vehicleMgr.toggle(mode.vehiclesAllowed && mapDef.vehicleFriendly);
    }

    // Turbo activation
    if (input.turboPressed) {
      if (this.turboSys.tryActivate(this.abilitySys.has('turbo'), audio)) {
        this.tutorialTelemetry.turboUsed += 1;
      }
    }

    // Active ability trigger [Q]
    if (input.abilityPressed) {
      if (this.triggerPrimaryActiveAbility(state, mode, sampler, audio)) {
        this.tutorialTelemetry.abilityUsed += 1;
      }
    }

    // Dedicated Air Dash [E]
    if (input.airDashPressed && !state.grounded && !state.airDashUsed && this.abilitySys.has('air-dash')) {
      const ab = this.abilitySys.equipped.find((a) => a.id === 'air-dash');
      if (ab && ab.cooldownLeft <= 0) {
        ab.cooldownLeft = this.devNoCooldowns ? 0 : ab.maxCooldown * this.abilitySys.cooldownScale;
        state.airDashUsed = true;
        state.velocity.y = Math.max(state.velocity.y, 4.5);
        state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * 1.45);
        this.tutorialTelemetry.abilityUsed += 1;
        audio?.playAbility();
        onBoostTrigger?.(state.position);
      }
    }

    if (state.boostTimer > 0) state.boostTimer = Math.max(0, state.boostTimer - safeDt);
    if (state.stunTimer > 0) state.stunTimer = Math.max(0, state.stunTimer - safeDt);

    // Developer Flight Mode (full 3D free inspection flight)
    if (this.devFlight) {
      if (Math.abs(input.steer) > 0.01) {
        state.yaw -= input.steer * 2.8 * safeDt;
      }
      const flyTarget = input.forward * (this.turboSys.active ? 54 : 38);
      state.speed = THREE.MathUtils.damp(state.speed, flyTarget, 10, safeDt);
      state.velocity.y = input.jumpHeld ? 22 : input.slideHeld ? -22 : 0;
      this.tmpDir.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      state.position.addScaledVector(this.tmpDir, state.speed * safeDt);
      state.position.y += state.velocity.y * safeDt;
      state.grounded = false;
      state.railGrinding = false;
      state.wallRunning = false;
      state.animState = 'fly';
      const s = sampler.sampleClosest(state.position, state.trackProgress);
      state.trackProgress = s.progress;
      state.currentSurface = s.surface;
      return;
    }

    // Phase 1 & 2 of Zero Point lock player into dramatic activation pose
    if (this.zeroPoint.phase === 'activate' || this.zeroPoint.phase === 'awaken') {
      state.speed = THREE.MathUtils.damp(state.speed, 0, 8, safeDt);
      state.position.y += state.velocity.y * safeDt;
      state.velocity.y = THREE.MathUtils.damp(state.velocity.y, 0.35, 6, safeDt);
      state.animState = 'zeroPointActivate';
      return;
    }

    // Sample track relative to current position
    const sample = sampler.sampleClosest(state.position, state.trackProgress);
    state.trackProgress = sample.progress;

    const wetness = weather ? weather.wetness : mapDef.weather === 'rain' ? 0.85 : 0;
    const icing = weather ? weather.icing : mapDef.ambience === 'snow' ? 0.85 : 0;
    const sandIntensity = weather ? weather.sandIntensity : mapDef.weather === 'sandstorm' ? 1 : 0;

    const inDynamicPuddle = isDynamicPuddleAt(sample.progress, wetness);
    const onDynamicIce = isDynamicIceAt(sample.progress, icing);
    const isIcySurface = sample.surface === 'ice' || onDynamicIce;
    const isWaterSurface = sample.surface === 'water';

    state.currentSurface = isIcySurface
      ? 'ice'
      : isWaterSurface
      ? 'water'
      : inDynamicPuddle
      ? 'puddle'
      : sample.surface;

    // Speed calculations
    const handlingNorm = (speedstar.stats.handling - 65) / 30; // 0..1
    const agilityNorm = (speedstar.stats.agility - 65) / 30;
    const airControlNorm = (speedstar.stats.airControl - 65) / 30;
    const momentumNorm = (speedstar.stats.momentum - 65) / 30;

    const isZeroTranscend = this.zeroPoint.phase === 'transcend';
    let maxSpeed = this.speedSys.baseTopSpeed;
    if (input.sprint) maxSpeed *= this.speedSys.sprintMultiplier;
    if (this.turboSys.active) maxSpeed *= this.speedSys.turboMultiplier;
    if (state.boostTimer > 0) maxSpeed *= 1.32;
    if (this.abilitySys.cycloneTimeLeft > 0) maxSpeed *= 1.18;
    if (this.vehicleMgr.mounted && this.vehicleMgr.activeVehicle) {
      maxSpeed *= this.vehicleMgr.activeVehicle.speedBonus;
    }
    if (isZeroTranscend) {
      // Infinite Velocity leaves normal Turbo far behind
      maxSpeed = Math.max(maxSpeed, 52);
    }

    // Surface & weather modifiers (Zero Point transcends drag)
    if (
      !isZeroTranscend &&
      isWaterSurface &&
      !this.abilitySys.has('water-runner') &&
      !this.vehicleMgr.mounted
    ) {
      maxSpeed *= 0.62;
    } else if (!isZeroTranscend && inDynamicPuddle && !this.abilitySys.has('water-runner')) {
      maxSpeed *= this.vehicleMgr.mounted ? 0.92 : 0.84;
    } else if (sample.surface === 'conveyor') {
      maxSpeed *= 1.2;
    }
    if (!isZeroTranscend && sandIntensity > 0.2 && !this.turboSys.active && !this.vehicleMgr.mounted) {
      maxSpeed *= 1 - 0.05 * sandIntensity;
    }

    // Turning: realistic speed-dependent turn rate & dynamic wet/icy traction
    const speedTurnDamp = isZeroTranscend ? 0.85 : THREE.MathUtils.lerp(1.0, 0.52, Math.min(1, state.speed / 35));
    const wetGripFactor = 1 - wetness * (this.vehicleMgr.mounted ? 0.22 : 0.16);
    const iceGripFactor = isIcySurface ? (sample.surface === 'ice' ? 0.54 : 0.64) : 1 - icing * 0.25;
    const puddleGripFactor = inDynamicPuddle && !this.abilitySys.has('water-runner') ? 0.84 : 1.0;
    const surfaceGrip = isZeroTranscend ? 1.0 : Math.min(wetGripFactor, iceGripFactor) * puddleGripFactor;
    const turnRate =
      (2.4 + handlingNorm * 0.8) *
      speedTurnDamp *
      (state.grounded ? surfaceGrip : 0.65 + airControlNorm * 0.35) *
      (this.vehicleMgr.mounted && this.vehicleMgr.activeVehicle ? this.vehicleMgr.activeVehicle.handlingFactor : 1);

    if (Math.abs(input.steer) > 0.01 && !state.railGrinding && !state.wallRunning) {
      state.yaw -= input.steer * turnRate * safeDt;
    }

    // Slide handling
    if (input.slideHeld && state.grounded && state.speed > 10 && !this.vehicleMgr.mounted && !isZeroTranscend) {
      if (!state.sliding) {
        state.sliding = true;
        state.slideTimer = 0.75;
        state.speed += 2.2; // Momentum burst into slide
        this.tutorialTelemetry.slid += 1;
        audio?.playSlide();
      }
    } else if (!input.slideHeld) {
      state.sliding = false;
    }
    if (state.sliding) {
      state.slideTimer -= safeDt;
      if (state.slideTimer <= 0 || state.speed < 7) state.sliding = false;
    }

    // Acceleration & Deceleration (Instant Momentum in Zero Point)
    const targetSpeed =
      input.forward > 0.05
        ? maxSpeed * input.forward
        : input.forward < -0.05
        ? -8
        : this.turboSys.active || isZeroTranscend
        ? maxSpeed * 0.92
        : 0;

    const weatherTraction = isZeroTranscend ? 1.0 : 1 - wetness * 0.14 - icing * 0.12;
    const iceAccelScale = isIcySurface ? 0.62 : 1.0;
    const iceDecelScale = isIcySurface ? 0.36 : inDynamicPuddle ? 1.12 : 1.0;
    const accel = isZeroTranscend
      ? 240
      : (state.grounded ? this.speedSys.accelRate : this.speedSys.accelRate * (0.45 + airControlNorm * 0.35)) *
        iceAccelScale *
        weatherTraction;
    const decel =
      (state.sliding ? 5.5 : this.speedSys.decelRate) *
      (1 - momentumNorm * 0.25) *
      iceDecelScale *
      weatherTraction;

    if (targetSpeed > state.speed) {
      state.speed = Math.min(targetSpeed, state.speed + accel * safeDt);
    } else if (targetSpeed < state.speed) {
      state.speed = Math.max(targetSpeed, state.speed - decel * safeDt);
    }

    if (state.stunTimer > 0 && !isZeroTranscend) {
      state.speed = Math.min(state.speed, 10);
    }

    // Check Grind Rail snap
    if (!state.railGrinding && !state.grounded && state.velocity.y <= 3) {
      for (const rail of builtMap.grindRails) {
        for (let i = 0; i < rail.points.length; i++) {
          if (state.position.distanceToSquared(rail.points[i]) < 3.6) {
            state.railGrinding = true;
            state.activeRail = rail;
            state.railT = i / (rail.points.length - 1);
            state.velocity.y = 0;
            state.doubleJumpUsed = false;
            state.airDashUsed = false;
            break;
          }
        }
        if (state.railGrinding) break;
      }
    }

    // Rail grinding movement
    if (state.railGrinding && state.activeRail) {
      const railBonus = this.abilitySys.has('rail-master') ? 1.22 : 1.08;
      const railSpeed = Math.max(22, state.speed * railBonus);
      const railLen = state.activeRail.curve.getLength();
      state.railT += (railSpeed * safeDt) / Math.max(1, railLen);
      this.turboSys.addCharge((this.abilitySys.has('rail-master') ? 28 : 14) * safeDt);

      if (input.jumpPressed) {
        state.railGrinding = false;
        state.activeRail = null;
        state.velocity.y = 13.5;
        state.grounded = false;
        audio?.playJump(false);
      } else if (state.railT >= 1) {
        state.railGrinding = false;
        state.activeRail = null;
        state.velocity.y = 6;
        state.grounded = false;
      } else {
      const pt = state.activeRail.curve.getPointAt(state.railT);
        const tan = state.activeRail.curve.getTangentAt(state.railT).normalize();
        state.position.copy(pt);
        state.yaw = Math.atan2(tan.x, tan.z);
        state.animState = 'railGrind';
        this.tutorialTelemetry.railGrindSec += safeDt;
        this.turboSys.update(safeDt, 1, true, this.abilitySys.has('turbo'), audio);
        return;
      }
    }

    // Wall-run detection when airborne near wall panels
    state.wallRunning = false;
    if (!state.grounded && !this.vehicleMgr.mounted) {
      for (const wp of builtMap.wallPanels) {
        const dx = state.position.x - wp.center.x;
        const dy = state.position.y - wp.center.y;
        const dz = state.position.z - wp.center.z;
        const along = dx * wp.tangent.x + dz * wp.tangent.z;
        const distFromWall = Math.abs(dx * wp.normal.x + dz * wp.normal.z);
        if (Math.abs(along) < wp.length * 0.5 && Math.abs(dy) < wp.height * 0.55 && distFromWall < 2.2) {
          state.wallRunning = true;
          this.tutorialTelemetry.wallRunSec += safeDt;
          state.wallSide = wp.normal.x * Math.cos(state.yaw) - wp.normal.z * Math.sin(state.yaw) >= 0 ? 1 : -1;
          state.velocity.y = Math.max(state.velocity.y, -0.5);
          state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * (this.abilitySys.has('wall-run') ? 1.24 : 1.1));
          state.doubleJumpUsed = false;
          if (input.jumpPressed) {
            state.wallRunning = false;
            state.velocity.y = 14;
            state.position.addScaledVector(wp.normal, 1.4);
            this.tutorialTelemetry.jumped += 1;
            audio?.playJump(true);
          }
          break;
        }
      }
    }

    // Jumping & Double Jumping
    if (input.jumpPressed && !state.wallRunning && !isZeroTranscend) {
      const jumpPower = 13.5 + agilityNorm * 1.4;
      if (state.grounded) {
        state.velocity.y = jumpPower;
        state.grounded = false;
        state.sliding = false;
        this.tutorialTelemetry.jumped += 1;
        audio?.playJump(false);
      } else if (!state.doubleJumpUsed) {
        if (this.abilitySys.has('double-jump')) {
          state.velocity.y = jumpPower * 0.94;
          state.doubleJumpUsed = true;
          state.animState = 'doubleJump';
          this.tutorialTelemetry.jumped += 1;
          audio?.playJump(true);
        }
      }
    }

    // Gravity, Zero Gravity & Flight / Glide
    let gravity = mapDef.lowGravity ? -17.5 : -32;
    if (this.abilitySys.lowGravTimeLeft > 0) gravity *= 0.55;
    if (isZeroTranscend) {
      // Zero Gravity: run across sky, water, walls, and floating structures freely
      gravity = 0;
      const targetVy = input.jumpHeld ? 15 : input.slideHeld ? -13 : 0;
      state.velocity.y = THREE.MathUtils.damp(state.velocity.y, targetVy, 12, safeDt);
    } else if (this.abilitySys.flightTimeLeft > 0) {
      gravity = 0;
      state.velocity.y = input.jumpHeld ? 7 : input.slideHeld ? -5 : 1.2;
      state.grounded = false;
    } else if (this.abilitySys.glideTimeLeft > 0 && !state.grounded && state.velocity.y < 0) {
      gravity = -6.5;
      state.velocity.y = Math.max(state.velocity.y, -4.5);
    }

    state.velocity.y += gravity * safeDt;

    // Horizontal displacement along forward yaw
    this.tmpDir.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const disp = state.speed * safeDt;
    state.position.addScaledVector(this.tmpDir, disp);
    state.position.y += state.velocity.y * safeDt;
    this.tutorialTelemetry.ranDistance += Math.abs(disp);

    // Track Surface & Boundary Grounding
    const updatedSample = sampler.sampleClosest(state.position, state.trackProgress);
    state.trackProgress = updatedSample.progress;
    const onTrackHorizontal = Math.abs(updatedSample.lateralOffset) <= updatedSample.halfWidth + 1.2;
    const trackY = updatedSample.point.y;

    if (isZeroTranscend) {
      // Keep above track floor if descending onto track; allow free sky running anywhere above
      if (onTrackHorizontal && state.position.y < trackY) {
        state.position.y = trackY;
        state.velocity.y = Math.max(0, state.velocity.y);
      }
      state.grounded = true; // Lets player sprint-animate across sky & water
      if (Math.abs(updatedSample.lateralOffset) <= updatedSample.halfWidth * 0.75) {
        state.lastSafePos.copy(updatedSample.point);
        state.lastSafeYaw = Math.atan2(updatedSample.tangent.x, updatedSample.tangent.z);
      }
    } else if (onTrackHorizontal && state.position.y <= trackY + 0.15 && state.position.y >= trackY - 3.5 && state.velocity.y <= 0) {
      if (!state.grounded && state.velocity.y < -7) {
        this.lastLandingForce = Math.min(25, Math.abs(state.velocity.y));
        if (state.velocity.y < -8) {
          audio?.playLand();
        }
      }
      state.position.y = trackY;
      state.velocity.y = 0;
      state.grounded = true;
      state.doubleJumpUsed = false;
      state.airDashUsed = false;

      // Record safe checkpoint spot when firmly on track
      if (Math.abs(updatedSample.lateralOffset) <= updatedSample.halfWidth * 0.75) {
        state.lastSafePos.copy(updatedSample.point);
        state.lastSafeYaw = Math.atan2(updatedSample.tangent.x, updatedSample.tangent.z);
      }
    } else if (state.position.y > trackY + 0.25 || !onTrackHorizontal) {
      state.grounded = false;
    }

    // Soft lateral curb guardrails (disabled in Zero Point Zero Gravity so you can transcend track bounds)
    if (!isZeroTranscend && onTrackHorizontal && Math.abs(updatedSample.lateralOffset) > updatedSample.halfWidth - 0.5 && state.position.y <= trackY + 2.0) {
      const sign = Math.sign(updatedSample.lateralOffset);
      const excess = Math.abs(updatedSample.lateralOffset) - (updatedSample.halfWidth - 0.5);
      state.position.addScaledVector(updatedSample.right, -sign * excess * 0.65);
    }

    // Fall recovery to last valid checkpoint/track point
    if (state.position.y < trackY - 14) {
      this.respawnToSafe(state, audio);
    }

    // Boost Zones
    for (const bz of builtMap.boostZones) {
      if (state.position.distanceToSquared(bz.center) < bz.radius * bz.radius && Math.abs(state.position.y - bz.center.y) < 3) {
        if (state.boostTimer < 0.8) {
          state.boostTimer = 1.45;
          state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * 1.42);
          this.turboSys.addCharge(10);
          onBoostTrigger?.(state.position);
        }
      }
    }

    // Jump Ramps
    for (const ramp of builtMap.jumpRamps) {
      if (state.position.distanceToSquared(ramp.center) < 12 && Math.abs(state.position.y - ramp.center.y) < 3.2 && state.velocity.y < 10) {
        state.velocity.y = 17.5;
        state.grounded = false;
        state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * 1.25);
        audio?.playJump(true);
        onBoostTrigger?.(state.position);
      }
    }

    // Obstacles Collision
    const playerHeight = state.sliding ? 0.95 : 1.9;
    for (const obs of builtMap.obstacles) {
      const distSq = state.position.distanceToSquared(obs.mesh.position);
      if (distSq < (obs.halfWidth + 0.7) * (obs.halfWidth + 0.7)) {
        const obsBottom = obs.mesh.position.y - obs.height * 0.5;
        const obsTop = obs.mesh.position.y + obs.height * 0.5;
        const playerBottom = state.position.y;
        const playerTop = state.position.y + playerHeight;
        if (playerTop > obsBottom && playerBottom < obsTop) {
          if (this.abilitySys.shieldTimeLeft > 0) {
            // Speed Shield shatters obstacle impact cleanly
            continue;
          }
          // Push back slightly & slow down
          state.speed = Math.min(state.speed, 6);
          state.stunTimer = 0.45;
          this.tmpVec.copy(state.position).sub(obs.mesh.position).setY(0).normalize();
          state.position.addScaledVector(this.tmpVec, 1.4);
        }
      }
    }

    // Collectibles Pickup (with Star Magnet radius)
    const pickupRadius = this.abilitySys.magnetTimeLeft > 0 || this.abilitySys.has('star-magnet') ? 7.5 : 2.2;
    const pickupSq = pickupRadius * pickupRadius;
    for (const col of builtMap.collectibles) {
      if (col.collected) continue;
      if (state.position.distanceToSquared(col.pos) < pickupSq) {
        col.collected = true;
        col.mesh.visible = false;
        col.respawnTimer = 14;
        if (col.kind === 'turbo') {
          this.turboSys.addCharge(24);
        } else {
          this.turboSys.addCharge(8);
        }
        audio?.playStarPickup();
        onStarCollected?.(col.kind, col.pos);
      }
    }

    // Turbo & Animation State Resolution
    const speedRatio = Math.min(1, Math.abs(state.speed) / this.speedSys.baseTopSpeed);
    this.turboSys.update(safeDt, speedRatio, false, this.abilitySys.has('turbo'), audio);

    if (isZeroTranscend) {
      state.animState = 'turbo';
    } else if (this.abilitySys.flightTimeLeft > 0) {
      state.animState = 'fly';
    } else if (state.wallRunning) {
      state.animState = 'wallRun';
    } else if (!state.grounded) {
      if (state.animState !== 'doubleJump' || state.velocity.y < -1.5) {
        state.animState = state.velocity.y > 0.5 ? 'jump' : 'fall';
      }
    } else if (state.sliding) {
      state.animState = 'slide';
    } else if (this.turboSys.active) {
      state.animState = 'turbo';
    } else if (Math.abs(state.speed) > 18) {
      state.animState = 'sprint';
    } else if (Math.abs(state.speed) > 7) {
      state.animState = 'run';
    } else if (Math.abs(state.speed) > 1) {
      state.animState = 'walk';
    } else {
      state.animState = input.emotePressed ? 'emote' : 'idle';
    }
  }

  private stepZeroPoint(dt: number, state: PlayerPhysicsState, audio?: AudioManager): void {
    if (this.zeroPoint.postGlowTimer > 0) {
      this.zeroPoint.postGlowTimer = Math.max(0, this.zeroPoint.postGlowTimer - dt);
    }
    if (this.zeroPoint.phase === 'inactive') {
      this.zeroPoint.worldTimeScale = 1;
      return;
    }

    this.zeroPoint.timer -= dt;
    if (this.zeroPoint.phase === 'activate') {
      this.zeroPoint.worldTimeScale = 0.5;
      if (this.zeroPoint.timer <= 0) {
        this.zeroPoint.phase = 'awaken';
        this.zeroPoint.timer = 0.45;
        this.zeroPoint.worldTimeScale = 0.22;
        this.zeroPoint.justEnteredPhase = 'awaken';
        audio?.playZeroPointSequence();
      }
    } else if (this.zeroPoint.phase === 'awaken') {
      this.zeroPoint.worldTimeScale = 0.22;
      if (this.zeroPoint.timer <= 0) {
        this.zeroPoint.phase = 'transcend';
        this.zeroPoint.timer = 6.4;
        this.zeroPoint.worldTimeScale = 0.22;
        this.zeroPoint.justEnteredPhase = 'transcend';
        state.speed = 46; // Instant Momentum snap
      }
    } else if (this.zeroPoint.phase === 'transcend') {
      this.zeroPoint.worldTimeScale = 0.22;
      if (this.zeroPoint.timer <= 0) {
        this.zeroPoint.phase = 'finish';
        this.zeroPoint.timer = 1.1;
        this.zeroPoint.justEnteredPhase = 'finish';
        this.zeroPoint.postGlowTimer = 3.2;
        audio?.playZeroPointFinish();
      }
    } else if (this.zeroPoint.phase === 'finish') {
      this.zeroPoint.worldTimeScale = THREE.MathUtils.lerp(this.zeroPoint.worldTimeScale, 1.0, Math.min(1, dt * 4));
      if (this.zeroPoint.timer <= 0) {
        this.zeroPoint.phase = 'inactive';
        this.zeroPoint.timer = 0;
        this.zeroPoint.worldTimeScale = 1.0;
        this.zeroPoint.justEnteredPhase = 'inactive';
      }
    }
  }

  private triggerPrimaryActiveAbility(
    state: PlayerPhysicsState,
    mode: GameModeDef,
    sampler: TrackSampler,
    audio?: AudioManager
  ): boolean {
    const active = this.abilitySys.equipped.find((a) => a.kind === 'active' && a.cooldownLeft <= 0);
    if (!active) return false;

    const def = ABILITIES.find((d) => d.id === active.id);
    if (!def) return false;
    if (def.energyCost > 0 && this.turboSys.meter < def.energyCost) return false;
    if (def.id === 'flight' && !mode.flightAllowed) return false;

    if (def.energyCost > 0) this.turboSys.meter -= def.energyCost;
    active.cooldownLeft = this.devNoCooldowns ? 0 : active.maxCooldown * this.abilitySys.cooldownScale;
    active.activeTimeLeft = def.duration;

    if (def.id === 'zero-point') {
      this.activateZeroPoint(state, audio);
      return true;
    }

    audio?.playAbility();

    if (def.id === 'speed-shield') {
      this.abilitySys.shieldTimeLeft = def.duration;
    } else if (def.id === 'wind-glide') {
      this.abilitySys.glideTimeLeft = def.duration;
      if (state.grounded) {
        state.velocity.y = 12;
        state.grounded = false;
      }
    } else if (def.id === 'super-jump') {
      state.velocity.y = 21;
      state.grounded = false;
    } else if (def.id === 'star-magnet') {
      this.abilitySys.magnetTimeLeft = def.duration;
    } else if (def.id === 'cyclone') {
      this.abilitySys.cycloneTimeLeft = def.duration;
      state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * 1.3);
    } else if (def.id === 'blink') {
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      state.position.addScaledVector(forward, 15);
      const s = sampler.sampleClosest(state.position, state.trackProgress);
      state.position.y = Math.max(state.position.y, s.point.y + 0.5);
    } else if (def.id === 'flight') {
      this.abilitySys.flightTimeLeft = def.duration;
      state.grounded = false;
      state.velocity.y = 6;
    } else if (def.id === 'gravity-control') {
      this.abilitySys.lowGravTimeLeft = def.duration;
      state.velocity.y = Math.max(state.velocity.y, 10);
    } else if (def.id === 'air-dash') {
      state.speed = Math.max(state.speed, this.speedSys.baseTopSpeed * 1.42);
      state.velocity.y = Math.max(state.velocity.y, 5);
    }
    return true;
  }

  private respawnToSafe(state: PlayerPhysicsState, audio?: AudioManager): void {
    state.position.copy(state.lastSafePos).add(new THREE.Vector3(0, 1.2, 0));
    state.velocity.set(0, 0, 0);
    state.yaw = state.lastSafeYaw;
    if (this.abilitySys.has('phoenix-recovery')) {
      state.speed = this.speedSys.baseTopSpeed * 0.85;
      this.abilitySys.shieldTimeLeft = Math.max(this.abilitySys.shieldTimeLeft, 2.0);
    } else {
      state.speed = 6;
    }
    state.grounded = false;
    state.railGrinding = false;
    state.wallRunning = false;
    audio?.playLand();
  }
}
