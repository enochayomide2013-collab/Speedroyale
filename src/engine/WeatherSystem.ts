import * as THREE from 'three';
import type { MapDef } from '../shared/gameData';

export type WeatherCondition = 'clear' | 'rain' | 'snow' | 'embers' | 'sandstorm' | 'starfield';

export interface WeatherSnapshot {
  condition: WeatherCondition;
  targetCondition: WeatherCondition;
  label: string;
  roadConditionLabel: string;
  rainIntensity: number; // 0..1
  snowIntensity: number; // 0..1
  sandIntensity: number; // 0..1
  emberIntensity: number; // 0..1
  starIntensity: number; // 0..1
  wetness: number; // 0..1
  icing: number; // 0..1
  windStrength: number; // 0..1
  time: number;
}

interface WeatherStage {
  startSec: number;
  condition: WeatherCondition;
  label: string;
}

export class WeatherSystem {
  private schedule: WeatherStage[] = [];
  private activeMap: MapDef | null = null;
  private currentStageIdx = 0;

  public condition: WeatherCondition = 'clear';
  public targetCondition: WeatherCondition = 'clear';
  public label = 'Clear Skies';
  public rainIntensity = 0;
  public snowIntensity = 0;
  public sandIntensity = 0;
  public emberIntensity = 0;
  public starIntensity = 0;
  public wetness = 0;
  public icing = 0;
  public windStrength = 0.15;
  public time = 0;

  private pendingTransition: { condition: WeatherCondition; label: string } | null = null;

  public resetForMap(mapDef: MapDef): void {
    this.activeMap = mapDef;
    this.time = 0;
    this.currentStageIdx = 0;
    this.pendingTransition = null;
    this.schedule = this.buildSchedule(mapDef);

    const initial = this.schedule[0]?.condition ?? mapDef.weather;
    this.condition = initial;
    this.targetCondition = initial;
    this.label = this.schedule[0]?.label ?? this.formatLabel(initial, mapDef);

    this.rainIntensity = initial === 'rain' ? 1 : 0;
    this.snowIntensity = initial === 'snow' ? 1 : 0;
    this.sandIntensity = initial === 'sandstorm' ? 1 : 0;
    this.emberIntensity = initial === 'embers' ? 1 : 0;
    this.starIntensity = initial === 'starfield' ? 1 : 0;

    this.wetness = initial === 'rain' ? 0.85 : mapDef.waterSections ? 0.25 : 0;
    this.icing = initial === 'snow' || mapDef.ambience === 'snow' ? 0.85 : 0;
    this.windStrength = initial === 'clear' ? 0.18 : 0.72;
  }

  private buildSchedule(mapDef: MapDef): WeatherStage[] {
    if (mapDef.weather === 'snow' || mapDef.ambience === 'snow') {
      return [
        { startSec: 0, condition: 'snow', label: 'Alpine Snowfall' },
        { startSec: 12, condition: 'clear', label: 'Sunlit Glacier Clear' },
        { startSec: 28, condition: 'snow', label: 'Blizzard Squall' },
        { startSec: 46, condition: 'clear', label: 'Crisp Horizon Clear' },
      ];
    }
    if (mapDef.weather === 'rain' || mapDef.ambience === 'rain') {
      return [
        { startSec: 0, condition: 'rain', label: 'Neon Downpour' },
        { startSec: 12, condition: 'clear', label: 'Clearing Mist' },
        { startSec: 27, condition: 'rain', label: 'Heavy Storm Front' },
        { startSec: 45, condition: 'clear', label: 'After-Rain Shine' },
      ];
    }
    if (mapDef.weather === 'sandstorm' || mapDef.ambience === 'desert') {
      return [
        { startSec: 0, condition: 'sandstorm', label: 'Desert Sandstorm' },
        { startSec: 13, condition: 'clear', label: 'Blazing Oasis Sun' },
        { startSec: 29, condition: 'sandstorm', label: 'Gale Dust Front' },
        { startSec: 47, condition: 'clear', label: 'Calm Dune Skies' },
      ];
    }
    if (mapDef.weather === 'embers') {
      return [
        { startSec: 0, condition: 'embers', label: 'Thermal Ember Drift' },
        { startSec: 13, condition: 'clear', label: 'Caldera Vent Clear' },
        { startSec: 29, condition: 'embers', label: 'Ash & Spark Surge' },
      ];
    }
    if (mapDef.weather === 'starfield') {
      return [
        { startSec: 0, condition: 'starfield', label: 'Orbital Starlight' },
        { startSec: 14, condition: 'clear', label: 'Solar Corona Gleam' },
        { startSec: 30, condition: 'starfield', label: 'Meteor Shower' },
      ];
    }
    // Clear-starting maps (City, Beach, Forest, Sky, Candy, Stadium) dynamically transition into rain showers and back!
    const stormLabel =
      mapDef.ambience === 'beach'
        ? 'Tropical Cloudburst'
        : mapDef.ambience === 'sky'
        ? 'High-Altitude Squall'
        : 'Sudden Rainstorm';
    const clearLabel =
      mapDef.ambience === 'beach'
        ? 'Golden Coastal Sun'
        : mapDef.ambience === 'city'
        ? 'Vice Dusk Clear'
        : 'Clear Skies';

    return [
      { startSec: 0, condition: 'clear', label: clearLabel },
      { startSec: 11, condition: 'rain', label: stormLabel },
      { startSec: 29, condition: 'clear', label: 'Sunbreak Clearing' },
      { startSec: 46, condition: 'rain', label: stormLabel },
    ];
  }

  private formatLabel(cond: WeatherCondition, mapDef: MapDef | null): string {
    switch (cond) {
      case 'rain':
        return mapDef?.ambience === 'beach' ? 'Tropical Cloudburst' : 'Rainstorm';
      case 'snow':
        return 'Alpine Snowfall';
      case 'sandstorm':
        return 'Desert Sandstorm';
      case 'embers':
        return 'Thermal Embers';
      case 'starfield':
        return 'Orbital Starlight';
      default:
        return 'Clear Skies';
    }
  }

  public update(dt: number, raceTimeSec: number): void {
    this.time += dt;
    if (this.schedule.length === 0) return;

    // Loop cleanly beyond final stage for extended runs / Training Grounds
    const lastStart = this.schedule[this.schedule.length - 1].startSec;
    const cycleSpan = Math.max(48, lastStart + 18);
    const loopT = raceTimeSec % cycleSpan;

    let nextIdx = 0;
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      if (loopT >= this.schedule[i].startSec) {
        nextIdx = i;
        break;
      }
    }

    if (nextIdx !== this.currentStageIdx) {
      this.currentStageIdx = nextIdx;
      const stage = this.schedule[nextIdx];
      if (stage && stage.condition !== this.targetCondition) {
        this.targetCondition = stage.condition;
        this.condition = stage.condition;
        this.label = stage.label;
        this.pendingTransition = { condition: stage.condition, label: stage.label };
      }
    }

    const rate = 0.85;
    this.rainIntensity = THREE.MathUtils.damp(this.rainIntensity, this.targetCondition === 'rain' ? 1 : 0, rate, dt);
    this.snowIntensity = THREE.MathUtils.damp(this.snowIntensity, this.targetCondition === 'snow' ? 1 : 0, rate, dt);
    this.sandIntensity = THREE.MathUtils.damp(this.sandIntensity, this.targetCondition === 'sandstorm' ? 1 : 0, rate, dt);
    this.emberIntensity = THREE.MathUtils.damp(this.emberIntensity, this.targetCondition === 'embers' ? 1 : 0, rate, dt);
    this.starIntensity = THREE.MathUtils.damp(this.starIntensity, this.targetCondition === 'starfield' ? 1 : 0, rate, dt);

    // Road wetness accumulates quickly during rain and dries slowly when sun returns
    const baseWetFloor = this.activeMap?.waterSections ? 0.2 : 0;
    if (this.rainIntensity > 0.25) {
      this.wetness = Math.min(1, this.wetness + dt * 0.16 * this.rainIntensity);
    } else {
      this.wetness = Math.max(baseWetFloor, this.wetness - dt * 0.055);
    }

    // Road icing thickens during snowfall and melts back to damp glaze in clear weather
    const isSnowBiome = this.activeMap?.ambience === 'snow';
    const baseIceFloor = isSnowBiome ? 0.32 : 0;
    if (this.snowIntensity > 0.25) {
      this.icing = Math.min(1, this.icing + dt * 0.14 * this.snowIntensity);
    } else {
      this.icing = Math.max(baseIceFloor, this.icing - dt * 0.045);
    }

    const targetWind =
      this.targetCondition === 'clear'
        ? 0.18
        : this.targetCondition === 'sandstorm'
        ? 0.95
        : this.targetCondition === 'rain'
        ? 0.78
        : 0.62;
    this.windStrength = THREE.MathUtils.damp(this.windStrength, targetWind, 0.9, dt);
  }

  public consumeTransition(): { condition: WeatherCondition; label: string } | null {
    const out = this.pendingTransition;
    this.pendingTransition = null;
    return out;
  }

  public getSnapshot(): WeatherSnapshot {
    let roadConditionLabel = 'Dry Grip';
    if (this.icing >= 0.55) roadConditionLabel = 'Icy & Slick';
    else if (this.icing >= 0.28) roadConditionLabel = 'Frost Patches';
    else if (this.wetness >= 0.55) roadConditionLabel = 'Flooded Puddles';
    else if (this.wetness >= 0.25) roadConditionLabel = 'Damp Asphalt';

    return {
      condition: this.condition,
      targetCondition: this.targetCondition,
      label: this.label,
      roadConditionLabel,
      rainIntensity: this.rainIntensity,
      snowIntensity: this.snowIntensity,
      sandIntensity: this.sandIntensity,
      emberIntensity: this.emberIntensity,
      starIntensity: this.starIntensity,
      wetness: this.wetness,
      icing: this.icing,
      windStrength: this.windStrength,
      time: this.time,
    };
  }
}

export function isDynamicPuddleAt(trackProgress: number, wetness: number): boolean {
  if (wetness < 0.35) return false;
  const wave = Math.sin(trackProgress * Math.PI * 26) * 0.5 + Math.cos(trackProgress * Math.PI * 14) * 0.5;
  return wave > 1.02 - wetness * 0.58;
}

export function isDynamicIceAt(trackProgress: number, icing: number): boolean {
  if (icing < 0.35) return false;
  const patch = Math.cos(trackProgress * Math.PI * 20) * 0.6 + Math.sin(trackProgress * Math.PI * 9) * 0.4;
  return patch > 0.95 - icing * 0.55;
}
