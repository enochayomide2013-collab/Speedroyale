import {
  MASTERY_TIERS,
  ROSTER_RARITY_COUNTS,
  SPEEDSTARS,
  STARTER_SPEEDSTAR_IDS,
  UNLOCKABLE_SPEEDSTAR_IDS,
  getSpeedstarMasteryRank,
  type HeadgearStyle,
  type SpeedstarDef,
  type SpeedstarMasteryTier,
  type SpeedstarRarity,
  type SpeedstarStats,
  type TurboVisualStyle,
} from './rosterData.ts';

export {
  MASTERY_TIERS,
  ROSTER_RARITY_COUNTS,
  SPEEDSTARS,
  STARTER_SPEEDSTAR_IDS,
  UNLOCKABLE_SPEEDSTAR_IDS,
  getSpeedstarMasteryRank,
  type HeadgearStyle,
  type SpeedstarDef,
  type SpeedstarMasteryTier,
  type SpeedstarRarity,
  type SpeedstarStats,
  type TurboVisualStyle,
};

export type SurfaceType = 'normal' | 'ice' | 'water' | 'conveyor' | 'lowgrav' | 'boost';

export interface MapWaypoint {
  x: number;
  y: number;
  z: number;
  width?: number;
  surface?: SurfaceType;
}

export interface MapDef {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 'Rookie' | 'Pro' | 'Elite';
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  trackColor: string;
  curbColor: string;
  accentColor: string;
  ambience: 'city' | 'beach' | 'snow' | 'lava' | 'forest' | 'space' | 'desert' | 'sky' | 'factory' | 'candy' | 'rain' | 'stadium';
  mechanics: string[];
  vehicleFriendly: boolean;
  waterSections: boolean;
  lowGravity: boolean;
  weather: 'clear' | 'rain' | 'snow' | 'embers' | 'sandstorm' | 'starfield';
  waypoints: MapWaypoint[];
}

export type GameModeId =
  | 'royale-race'
  | 'speed-royale'
  | 'obstacle-rush'
  | 'time-attack'
  | 'team-sprint'
  | 'last-runner-standing'
  | 'star-collector'
  | 'head-to-head'
  | 'training-grounds'
  | 'championship';

export interface GameModeDef {
  id: GameModeId;
  name: string;
  shortDesc: string;
  rulesSummary: string;
  maxCompetitors: number;
  rankedAllowed: boolean;
  vehiclesAllowed: boolean;
  flightAllowed: boolean;
  roundDurationSec: number;
  laps: number;
}

export type ShopCategory =
  | 'speedstars'
  | 'abilities'
  | 'vehicles'
  | 'gadgets'
  | 'skins'
  | 'trails'
  | 'emotes'
  | 'victoryAnimations'
  | 'collectibles';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  price: number;
  cooldown: number;
  duration: number;
  energyCost: number; // Turbo meter requirement (0 if none)
  rankedAllowed: boolean;
  compatibility: string;
  kind: 'active' | 'passive';
  accentColor: string;
  ownerOnly?: boolean;
}

export interface VehicleDef {
  id: string;
  name: string;
  category: 'Supercar' | 'Hovercar' | 'Bike' | 'Hoverboard' | 'Speed Bike' | 'Sky Craft';
  description: string;
  price: number;
  speedBonus: number;
  handlingFactor: number;
  hoverHeight: number;
  canFly: boolean;
  primaryColor: string;
  accentColor: string;
}

export interface GadgetDef {
  id: string;
  name: string;
  description: string;
  price: number;
  cooldown: number;
  effectType: 'bumper' | 'decoy' | 'spring' | 'nova' | 'foam' | 'magnet-pulse';
  counterNote: string;
  accentColor: string;
}

export interface CosmeticDef {
  id: string;
  category: 'skins' | 'trails' | 'emotes' | 'victoryAnimations' | 'collectibles';
  name: string;
  description: string;
  price: number;
  tier: 'Standard' | 'Premium' | 'Legendary';
  colorHex: string;
}

export interface RankTierDef {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'champion';
  name: string;
  minMmr: number;
  color: string;
  seasonRewardSc: number;
}

export type MissionMetric =
  | 'races'
  | 'wins'
  | 'podiums'
  | 'turbo'
  | 'stars'
  | 'ranked'
  | 'time-attack'
  | 'abilities';

export interface MissionDef {
  id: string;
  period: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  metric: MissionMetric;
  rewardSc: number;
  rewardXp: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  metric: 'races' | 'wins' | 'unlocks' | 'level' | 'stars';
  target: number;
  rewardSc: number;
  badgeTitle: string;
}

// 30 PLAYABLE SPEEDSTARS are defined in ./rosterData.ts and re-exported above.

// ============================================================================
// 12 UNIQUE 3D MAPS
// ============================================================================
export const MAPS: MapDef[] = [
  {
    id: 'neon-rush-city',
    index: 1,
    name: 'Neon Rush City',
    subtitle: 'Skyscraper Canyon Circuit',
    description: 'Futuristic metropolitan highway with rooftop shortcuts, glowing neon tunnels, speed ramps, and elevated grind rails.',
    difficulty: 'Rookie',
    skyColor: '#0B1224',
    fogColor: '#0E172E',
    fogDensity: 0.0024,
    sunColor: '#93C5FD',
    sunIntensity: 1.5,
    hemiSky: '#38BDF8',
    hemiGround: '#1E1B4B',
    trackColor: '#1E293B',
    curbColor: '#06B6D4',
    accentColor: '#22D3EE',
    ambience: 'city',
    mechanics: ['Speed Ramps', 'Grind Rails', 'Wall-Run Billboards', 'Rooftop Shortcut'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: 0, y: 0, z: -70, width: 16, surface: 'boost' },
      { x: 25, y: 4, z: -145, width: 15 },
      { x: 95, y: 8, z: -195, width: 14 },
      { x: 165, y: 4, z: -175, width: 15, surface: 'boost' },
      { x: 190, y: 0, z: -100, width: 16 },
      { x: 145, y: 6, z: -30, width: 14 },
      { x: 120, y: 12, z: 50, width: 14 },
      { x: 65, y: 4, z: 95, width: 15, surface: 'boost' },
      { x: 5, y: 0, z: 65, width: 16 },
    ],
  },
  {
    id: 'paradise-sprint',
    index: 2,
    name: 'Paradise Sprint',
    subtitle: 'Tropical Archipelago',
    description: 'Sun-drenched beaches, palm bridges, waterfall tunnels, and turquoise ocean water-running channels.',
    difficulty: 'Rookie',
    skyColor: '#38BDF8',
    fogColor: '#7DD3FC',
    fogDensity: 0.0018,
    sunColor: '#FEF08A',
    sunIntensity: 2.1,
    hemiSky: '#7DD3FC',
    hemiGround: '#D97706',
    trackColor: '#E7C68E',
    curbColor: '#14B8A6',
    accentColor: '#F59E0B',
    ambience: 'beach',
    mechanics: ['Water-Run Ocean Paths', 'Wooden Bridges', 'Waterfall Boosts'],
    vehicleFriendly: true,
    waterSections: true,
    lowGravity: false,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 17 },
      { x: -18, y: 1, z: -75, width: 16 },
      { x: 20, y: 0, z: -155, width: 18, surface: 'water' },
      { x: 90, y: 0, z: -190, width: 18, surface: 'water' },
      { x: 155, y: 5, z: -140, width: 15, surface: 'boost' },
      { x: 170, y: 8, z: -60, width: 14 },
      { x: 125, y: 3, z: 20, width: 16 },
      { x: 75, y: 0, z: 85, width: 16, surface: 'water' },
      { x: 15, y: 0, z: 70, width: 17 },
    ],
  },
  {
    id: 'frozen-velocity',
    index: 3,
    name: 'Frozen Velocity',
    subtitle: 'Alpine Glacier Ridge',
    description: 'High-altitude snowy mountain passes with slick ice bridges, snowdrifts, and crystalline boost tunnels.',
    difficulty: 'Pro',
    skyColor: '#1E3A5F',
    fogColor: '#93C5FD',
    fogDensity: 0.0028,
    sunColor: '#E0F2FE',
    sunIntensity: 1.8,
    hemiSky: '#BAE6FD',
    hemiGround: '#334155',
    trackColor: '#CBD5E1',
    curbColor: '#38BDF8',
    accentColor: '#7DD3FC',
    ambience: 'snow',
    mechanics: ['Slippery Ice Zones', 'Glacier Ramps', 'Snowstorm Visibility'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'snow',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: 10, y: -3, z: -80, width: 15, surface: 'ice' },
      { x: -35, y: -6, z: -160, width: 14, surface: 'ice' },
      { x: 35, y: 2, z: -225, width: 15, surface: 'boost' },
      { x: 125, y: 10, z: -190, width: 14 },
      { x: 165, y: 6, z: -105, width: 15, surface: 'ice' },
      { x: 130, y: 0, z: -20, width: 15 },
      { x: 80, y: 4, z: 65, width: 14, surface: 'boost' },
      { x: 15, y: 0, z: 70, width: 16 },
    ],
  },
  {
    id: 'inferno-circuit',
    index: 4,
    name: 'Inferno Circuit',
    subtitle: 'Volcanic Caldera',
    description: 'Molten lava canyon featuring basalt sky-bridges, rising thermal vents, and hazard boulders.',
    difficulty: 'Elite',
    skyColor: '#2A0A0A',
    fogColor: '#450A0A',
    fogDensity: 0.0026,
    sunColor: '#FB923C',
    sunIntensity: 1.9,
    hemiSky: '#F97316',
    hemiGround: '#1C1917',
    trackColor: '#292524',
    curbColor: '#F97316',
    accentColor: '#EF4444',
    ambience: 'lava',
    mechanics: ['Thermal Boost Strips', 'Falling Basalt Gaps', 'Ember Hazards'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'embers',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 15 },
      { x: -15, y: 4, z: -75, width: 14, surface: 'boost' },
      { x: 25, y: 10, z: -150, width: 13 },
      { x: 105, y: 6, z: -195, width: 14 },
      { x: 175, y: 12, z: -135, width: 13, surface: 'boost' },
      { x: 160, y: 4, z: -45, width: 14 },
      { x: 100, y: 8, z: 35, width: 13 },
      { x: 45, y: 2, z: 85, width: 15 },
    ],
  },
  {
    id: 'wildwood-run',
    index: 5,
    name: 'Wildwood Run',
    subtitle: 'Bioluminescent Ancient Forest',
    description: 'Towering redwoods, giant root bridges, glowing flora caverns, and hidden elevated canopy rails.',
    difficulty: 'Rookie',
    skyColor: '#062019',
    fogColor: '#064E3B',
    fogDensity: 0.0024,
    sunColor: '#A7F3D0',
    sunIntensity: 1.6,
    hemiSky: '#34D399',
    hemiGround: '#1C1917',
    trackColor: '#3F2E21',
    curbColor: '#10B981',
    accentColor: '#34D399',
    ambience: 'forest',
    mechanics: ['Root Bridges', 'Canopy Grind Rails', 'Shallow Creek Water-Run'],
    vehicleFriendly: true,
    waterSections: true,
    lowGravity: false,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: 25, y: 2, z: -75, width: 15 },
      { x: -10, y: 6, z: -155, width: 14, surface: 'boost' },
      { x: 55, y: 3, z: -215, width: 16, surface: 'water' },
      { x: 140, y: 8, z: -175, width: 14 },
      { x: 160, y: 2, z: -85, width: 15 },
      { x: 110, y: 5, z: 10, width: 14, surface: 'boost' },
      { x: 45, y: 1, z: 75, width: 16 },
    ],
  },
  {
    id: 'cosmic-velocity',
    index: 6,
    name: 'Cosmic Velocity',
    subtitle: 'Orbital Starway',
    description: 'Zero-atmosphere orbital track surrounded by ringed gas giants, holographic boosters, and low-gravity leaps.',
    difficulty: 'Elite',
    skyColor: '#030712',
    fogColor: '#0B1120',
    fogDensity: 0.0014,
    sunColor: '#C4B5FD',
    sunIntensity: 1.7,
    hemiSky: '#818CF8',
    hemiGround: '#1E1B4B',
    trackColor: '#1E1B4B',
    curbColor: '#A855F7',
    accentColor: '#38BDF8',
    ambience: 'space',
    mechanics: ['Low-Gravity Zones', 'Orbital Jump Gaps', 'Hyper-Boost Gates'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: true,
    weather: 'starfield',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 15 },
      { x: 0, y: 6, z: -80, width: 14, surface: 'lowgrav' },
      { x: 45, y: 14, z: -165, width: 13, surface: 'boost' },
      { x: 130, y: 18, z: -195, width: 14, surface: 'lowgrav' },
      { x: 195, y: 8, z: -120, width: 14 },
      { x: 165, y: 12, z: -25, width: 13, surface: 'lowgrav' },
      { x: 95, y: 4, z: 65, width: 14, surface: 'boost' },
      { x: 25, y: 0, z: 75, width: 15 },
    ],
  },
  {
    id: 'pharaohs-run',
    index: 7,
    name: "Pharaoh's Run",
    subtitle: 'Sunstone Pyramid Dunes',
    description: 'Monumental sandstone pyramids, ancient obelisk avenues, oasis water channels, and desert sandstorms.',
    difficulty: 'Pro',
    skyColor: '#7C2D12',
    fogColor: '#B45309',
    fogDensity: 0.0022,
    sunColor: '#FDE047',
    sunIntensity: 2.2,
    hemiSky: '#FCD34D',
    hemiGround: '#78350F',
    trackColor: '#D6B37C',
    curbColor: '#F59E0B',
    accentColor: '#FBBF24',
    ambience: 'desert',
    mechanics: ['Temple Ramps', 'Oasis Water Shortcut', 'Sandstorm Gusts'],
    vehicleFriendly: true,
    waterSections: true,
    lowGravity: false,
    weather: 'sandstorm',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: -20, y: 3, z: -80, width: 15 },
      { x: 15, y: 8, z: -160, width: 14, surface: 'boost' },
      { x: 95, y: 2, z: -200, width: 16, surface: 'water' },
      { x: 165, y: 6, z: -135, width: 14 },
      { x: 145, y: 10, z: -45, width: 14 },
      { x: 90, y: 4, z: 45, width: 15, surface: 'boost' },
      { x: 25, y: 0, z: 70, width: 16 },
    ],
  },
  {
    id: 'skybreak',
    index: 8,
    name: 'Skybreak',
    subtitle: 'Cloudtop Archipelago',
    description: 'Floating celestial islands connected by high-altitude sky rails, cloud platforms, and massive aerial jumps.',
    difficulty: 'Elite',
    skyColor: '#0284C7',
    fogColor: '#BAE6FD',
    fogDensity: 0.0017,
    sunColor: '#FFFFFF',
    sunIntensity: 2.0,
    hemiSky: '#E0F2FE',
    hemiGround: '#38BDF8',
    trackColor: '#F1F5F9',
    curbColor: '#0EA5E9',
    accentColor: '#38BDF8',
    ambience: 'sky',
    mechanics: ['Sky Grind Rails', 'Wind Glide Gaps', 'Floating Cloud Platforms'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: true,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 15 },
      { x: 15, y: 5, z: -75, width: 14, surface: 'boost' },
      { x: -25, y: 12, z: -155, width: 13, surface: 'lowgrav' },
      { x: 55, y: 18, z: -220, width: 14 },
      { x: 145, y: 14, z: -175, width: 14, surface: 'boost' },
      { x: 175, y: 8, z: -80, width: 13 },
      { x: 115, y: 4, z: 25, width: 14, surface: 'lowgrav' },
      { x: 40, y: 0, z: 75, width: 15 },
    ],
  },
  {
    id: 'nitro-factory',
    index: 9,
    name: 'Nitro Factory',
    subtitle: 'Heavy Turbine Works',
    description: 'High-speed assembly line featuring moving conveyor belts, steam vents, steel catwalks, and pipe grind rails.',
    difficulty: 'Pro',
    skyColor: '#18181B',
    fogColor: '#27272A',
    fogDensity: 0.0025,
    sunColor: '#FDBA74',
    sunIntensity: 1.6,
    hemiSky: '#94A3B8',
    hemiGround: '#292524',
    trackColor: '#3F3F46',
    curbColor: '#F59E0B',
    accentColor: '#FB923C',
    ambience: 'factory',
    mechanics: ['Speed Conveyors', 'Pipe Grind Rails', 'Piston Obstacles'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'embers',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: 0, y: 0, z: -80, width: 15, surface: 'conveyor' },
      { x: 45, y: 5, z: -155, width: 14 },
      { x: 125, y: 8, z: -175, width: 14, surface: 'conveyor' },
      { x: 175, y: 4, z: -95, width: 15, surface: 'boost' },
      { x: 140, y: 2, z: -15, width: 15 },
      { x: 85, y: 6, z: 65, width: 14, surface: 'conveyor' },
      { x: 20, y: 0, z: 70, width: 16 },
    ],
  },
  {
    id: 'sugar-rush-boulevard',
    index: 10,
    name: 'Sugar Rush Boulevard',
    subtitle: 'Confectionery Speedway',
    description: 'Vibrant candy-coated avenue with waffle ramps, candy-cane grind rails, and bouncy frosting pads.',
    difficulty: 'Rookie',
    skyColor: '#F472B6',
    fogColor: '#FBCFE8',
    fogDensity: 0.0018,
    sunColor: '#FFFBEB',
    sunIntensity: 1.9,
    hemiSky: '#FDE68A',
    hemiGround: '#BE185D',
    trackColor: '#EC4899',
    curbColor: '#FDE047',
    accentColor: '#22D3EE',
    ambience: 'candy',
    mechanics: ['Bounce Platforms', 'Candy-Cane Rails', 'Syrup Boost Lanes'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 17 },
      { x: -20, y: 3, z: -75, width: 16, surface: 'boost' },
      { x: 10, y: 7, z: -155, width: 15 },
      { x: 95, y: 4, z: -195, width: 16 },
      { x: 165, y: 9, z: -135, width: 15, surface: 'boost' },
      { x: 145, y: 3, z: -40, width: 16 },
      { x: 85, y: 5, z: 50, width: 15 },
      { x: 20, y: 0, z: 75, width: 17 },
    ],
  },
  {
    id: 'midnight-metro',
    index: 11,
    name: 'Midnight Metro',
    subtitle: 'Rain-Slicked Transit Grid',
    description: 'Reflective nocturnal city streets, rain-soaked corners, subway tunnel shortcuts, and monorail tracks.',
    difficulty: 'Pro',
    skyColor: '#090D16',
    fogColor: '#111827',
    fogDensity: 0.0028,
    sunColor: '#60A5FA',
    sunIntensity: 1.3,
    hemiSky: '#38BDF8',
    hemiGround: '#0F172A',
    trackColor: '#0F172A',
    curbColor: '#3B82F6',
    accentColor: '#F43F5E',
    ambience: 'rain',
    mechanics: ['Wet Drift Corners', 'Monorail Grind', 'Subway Shortcuts'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'rain',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 16 },
      { x: 15, y: -2, z: -85, width: 15, surface: 'boost' },
      { x: -20, y: -4, z: -170, width: 15, surface: 'ice' },
      { x: 65, y: 2, z: -215, width: 15 },
      { x: 155, y: 6, z: -165, width: 14, surface: 'boost' },
      { x: 170, y: 0, z: -75, width: 15 },
      { x: 115, y: 3, z: 25, width: 15 },
      { x: 40, y: 0, z: 80, width: 16 },
    ],
  },
  {
    id: 'royale-stadium',
    index: 12,
    name: 'Royale Stadium',
    subtitle: 'Grand Championship Coliseum',
    description: 'Massive floodlit championship arena with tiered cheering stands, multi-lane speed zones, and iconic finish podium.',
    difficulty: 'Pro',
    skyColor: '#0B1020',
    fogColor: '#172554',
    fogDensity: 0.0016,
    sunColor: '#FFFFFF',
    sunIntensity: 2.0,
    hemiSky: '#60A5FA',
    hemiGround: '#1E293B',
    trackColor: '#1E293B',
    curbColor: '#FACC15',
    accentColor: '#06B6D4',
    ambience: 'stadium',
    mechanics: ['Multi-Lane Splits', 'Championship Boost Strips', 'Stadium Jump Arch'],
    vehicleFriendly: true,
    waterSections: false,
    lowGravity: false,
    weather: 'clear',
    waypoints: [
      { x: 0, y: 0, z: 0, width: 18 },
      { x: 0, y: 0, z: -85, width: 18, surface: 'boost' },
      { x: 45, y: 4, z: -170, width: 17 },
      { x: 125, y: 6, z: -195, width: 17, surface: 'boost' },
      { x: 185, y: 2, z: -120, width: 18 },
      { x: 165, y: 5, z: -30, width: 17 },
      { x: 95, y: 3, z: 65, width: 17, surface: 'boost' },
      { x: 15, y: 0, z: 75, width: 18 },
    ],
  },
];

// ============================================================================
// 10 GAME MODES
// ============================================================================
export const GAME_MODES: GameModeDef[] = [
  {
    id: 'royale-race',
    name: 'Royale Race',
    shortDesc: '12-runner high-speed circuit sprint. First across the finish wins.',
    rulesSummary: '1 lap circuit · 12 competitors · All checkpoints required · Full abilities enabled',
    maxCompetitors: 12,
    rankedAllowed: true,
    vehiclesAllowed: true,
    flightAllowed: false,
    roundDurationSec: 180,
    laps: 1,
  },
  {
    id: 'speed-royale',
    name: 'Speed Royale',
    shortDesc: 'Up to 30 runners in staged eliminations until one champion survives.',
    rulesSummary: '30 competitors · Trailing runners eliminated at Gate 3, Gate 6, and Gate 8',
    maxCompetitors: 30,
    rankedAllowed: true,
    vehiclesAllowed: false,
    flightAllowed: false,
    roundDurationSec: 210,
    laps: 1,
  },
  {
    id: 'obstacle-rush',
    name: 'Obstacle Rush',
    shortDesc: 'Parkour gauntlet emphasizing wall-runs, rail grinds, slides, and precision jumps.',
    rulesSummary: '12 competitors · Dense kinetic barriers · Parkour mastery earns Turbo',
    maxCompetitors: 12,
    rankedAllowed: true,
    vehiclesAllowed: false,
    flightAllowed: false,
    roundDurationSec: 180,
    laps: 1,
  },
  {
    id: 'time-attack',
    name: 'Time Attack',
    shortDesc: 'Solo run against the clock, your personal ghost, and global track records.',
    rulesSummary: 'Solo + Ghost Replay · Official leaderboard time submission',
    maxCompetitors: 1,
    rankedAllowed: false,
    vehiclesAllowed: true,
    flightAllowed: false,
    roundDurationSec: 180,
    laps: 1,
  },
  {
    id: 'team-sprint',
    name: 'Team Sprint',
    shortDesc: '6v6 Cyan Vortex vs Amber Apex squad race scored by combined placements.',
    rulesSummary: '12 competitors (2 teams of 6) · Placement points summed for team victory',
    maxCompetitors: 12,
    rankedAllowed: true,
    vehiclesAllowed: true,
    flightAllowed: false,
    roundDurationSec: 180,
    laps: 1,
  },
  {
    id: 'last-runner-standing',
    name: 'Last Runner Standing',
    shortDesc: 'Survival endurance race with a closing elimination zone and moving sweepers.',
    rulesSummary: '12 competitors · Stay ahead of the closing Storm Surge ring to survive',
    maxCompetitors: 12,
    rankedAllowed: false,
    vehiclesAllowed: false,
    flightAllowed: true,
    roundDurationSec: 120,
    laps: 1,
  },
  {
    id: 'star-collector',
    name: 'Star Collector',
    shortDesc: 'Gather high-value Energy Stars across the course before the 75s timer expires.',
    rulesSummary: '12 competitors · 75 seconds · Collect stars and finish high for bonus multiplier',
    maxCompetitors: 12,
    rankedAllowed: false,
    vehiclesAllowed: true,
    flightAllowed: true,
    roundDurationSec: 75,
    laps: 1,
  },
  {
    id: 'head-to-head',
    name: 'Head-to-Head',
    shortDesc: 'Intense 1v1 sprint duel with zero traffic and pure line-choice skill.',
    rulesSummary: '2 competitors · Pure 1v1 ranked-ready duel',
    maxCompetitors: 2,
    rankedAllowed: true,
    vehiclesAllowed: false,
    flightAllowed: false,
    roundDurationSec: 150,
    laps: 1,
  },
  {
    id: 'training-grounds',
    name: 'Training Grounds',
    shortDesc: 'Open practice run to master Turbo, wall-running, rails, abilities, and vehicles.',
    rulesSummary: 'No timer limit · Test any owned ability/vehicle freely · Complete anytime for 5,000 SC',
    maxCompetitors: 1,
    rankedAllowed: false,
    vehiclesAllowed: true,
    flightAllowed: true,
    roundDurationSec: 600,
    laps: 1,
  },
  {
    id: 'championship',
    name: 'Speedstars Championship',
    shortDesc: '3-stage tournament: Qualifier, Semifinal, and Grand Final for trophy points.',
    rulesSummary: '3 rounds · Top placement points advance and crown the Championship Winner',
    maxCompetitors: 12,
    rankedAllowed: true,
    vehiclesAllowed: true,
    flightAllowed: false,
    roundDurationSec: 180,
    laps: 1,
  },
];

// ============================================================================
// 15 ABILITIES (EXACT BRIEF PRICING)
// ============================================================================
export const ABILITIES: AbilityDef[] = [
  {
    id: 'turbo',
    name: 'Turbo Overdrive',
    description: 'Upgrades your core Turbo surge with +25% longer burn duration and faster energy recharge.',
    price: 300000,
    cooldown: 0,
    duration: 4.5,
    energyCost: 25,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'passive',
    accentColor: '#F59E0B',
  },
  {
    id: 'star-magnet',
    name: 'Star Magnet',
    description: 'Projects a magnetic field pulling nearby Energy Stars and Turbo Orbs directly to you.',
    price: 300000,
    cooldown: 12,
    duration: 6,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'active',
    accentColor: '#FACC15',
  },
  {
    id: 'speed-shield',
    name: 'Speed Shield',
    description: 'Surrounds you in a kinetic barrier blocking arcade gadgets and obstacle slowdowns.',
    price: 350000,
    cooldown: 14,
    duration: 5,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Competitive Modes',
    kind: 'active',
    accentColor: '#38BDF8',
  },
  {
    id: 'super-jump',
    name: 'Super Jump',
    description: 'Channels spring energy into a high-altitude vertical leap to reach upper shortcuts.',
    price: 400000,
    cooldown: 7,
    duration: 1.2,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'active',
    accentColor: '#A855F7',
  },
  {
    id: 'double-jump',
    name: 'Double Jump',
    description: 'Enables a crisp second mid-air jump to recover from missed landings or chain platforms.',
    price: 400000,
    cooldown: 0,
    duration: 0,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'passive',
    accentColor: '#22D3EE',
  },
  {
    id: 'air-dash',
    name: 'Air Dash',
    description: 'Fires an instant directional burst while airborne to cross wide gaps or dodge hazards.',
    price: 450000,
    cooldown: 5,
    duration: 0.35,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'active',
    accentColor: '#F43F5E',
  },
  {
    id: 'rail-master',
    name: 'Rail Master',
    description: 'Increases grind rail speed by +22% and doubles Turbo charge generated while grinding.',
    price: 450000,
    cooldown: 0,
    duration: 0,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'Rail-Enabled Maps',
    kind: 'passive',
    accentColor: '#4ADE80',
  },
  {
    id: 'wall-run',
    name: 'Wall Run Mastery',
    description: 'Boosts wall-run speed and extends wall adhesion duration across vertical surfaces.',
    price: 500000,
    cooldown: 0,
    duration: 0,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'passive',
    accentColor: '#EC4899',
  },
  {
    id: 'wind-glide',
    name: 'Wind Glide',
    description: 'Deploys aerodynamic energy wings when airborne to glide gracefully over long gaps.',
    price: 650000,
    cooldown: 8,
    duration: 3.5,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'active',
    accentColor: '#2DD4BF',
  },
  {
    id: 'cyclone',
    name: 'Cyclone Surge',
    description: 'Generates a personal slipstream vortex that boosts top speed and nudges close rivals aside.',
    price: 800000,
    cooldown: 14,
    duration: 4,
    energyCost: 15,
    rankedAllowed: true,
    compatibility: 'All Competitive Modes',
    kind: 'active',
    accentColor: '#06B6D4',
  },
  {
    id: 'water-runner',
    name: 'Water Runner',
    description: 'Allows full-speed hydroplaning across designated water surfaces without slowing down.',
    price: 850000,
    cooldown: 0,
    duration: 0,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'Paradise Sprint, Wildwood, Pharaoh',
    kind: 'passive',
    accentColor: '#0EA5E9',
  },
  {
    id: 'blink',
    name: 'Phase Blink',
    description: 'Teleports forward 16 meters along the track tangent, bypassing solid ground obstacles.',
    price: 900000,
    cooldown: 11,
    duration: 0.2,
    energyCost: 15,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'active',
    accentColor: '#8B5CF6',
  },
  {
    id: 'phoenix-recovery',
    name: 'Phoenix Recovery',
    description: 'Automatically restores 75% top speed and shields you for 2s after checkpoint respawn or impact.',
    price: 1000000,
    cooldown: 15,
    duration: 2.5,
    energyCost: 0,
    rankedAllowed: true,
    compatibility: 'All Modes & Maps',
    kind: 'passive',
    accentColor: '#F97316',
  },
  {
    id: 'gravity-control',
    name: 'Gravity Control',
    description: 'Modulates personal gravity for floaty moon-jumps and rapid slam landings on command.',
    price: 1200000,
    cooldown: 13,
    duration: 4.5,
    energyCost: 10,
    rankedAllowed: false,
    compatibility: 'Unranked, Cosmic, Skybreak, Training',
    kind: 'active',
    accentColor: '#6366F1',
  },
  {
    id: 'flight',
    name: 'Aero Flight',
    description: 'Engages controlled thruster flight for 3 seconds within track checkpoint corridors.',
    price: 1500000,
    cooldown: 18,
    duration: 3.0,
    energyCost: 30,
    rankedAllowed: false,
    compatibility: 'Supported Modes (Survival, Star, Training)',
    kind: 'active',
    accentColor: '#FACC15',
  },
  {
    id: 'zero-point',
    name: 'ZERO POINT',
    description: 'Transcend every normal Speedstar limit: Infinite Velocity, Time Fracture, Zero Gravity, Reality Trail, Phantom Echoes, World Pulse, and Cosmic Finish.',
    price: 0,
    cooldown: 22,
    duration: 8.8,
    energyCost: 0,
    rankedAllowed: false,
    compatibility: "Owner's Vault Exclusive",
    kind: 'active',
    accentColor: '#A855F7',
    ownerOnly: true,
  },
];

// ============================================================================
// VEHICLES (100,000 - 600,000 SC)
// ============================================================================
export const VEHICLES: VehicleDef[] = [
  {
    id: 'pulse-board',
    name: 'Pulse Hoverboard',
    category: 'Hoverboard',
    description: 'Sleek anti-grav board with agile carving and effortless jump clearance.',
    price: 100000,
    speedBonus: 1.08,
    handlingFactor: 1.05,
    hoverHeight: 0.45,
    canFly: false,
    primaryColor: '#06B6D4',
    accentColor: '#22D3EE',
  },
  {
    id: 'apex-bike',
    name: 'Apex Speed Bike',
    category: 'Speed Bike',
    description: 'Twin-turbine sport bike built for narrow city shortcuts and crisp lean angles.',
    price: 180000,
    speedBonus: 1.12,
    handlingFactor: 1.0,
    hoverHeight: 0,
    canFly: false,
    primaryColor: '#EF4444',
    accentColor: '#F59E0B',
  },
  {
    id: 'stratos-moto',
    name: 'Stratos Neon Bike',
    category: 'Bike',
    description: 'Light-trail cruiser with balanced suspension and boosted drift stability.',
    price: 250000,
    speedBonus: 1.13,
    handlingFactor: 1.04,
    hoverHeight: 0,
    canFly: false,
    primaryColor: '#8B5CF6',
    accentColor: '#38BDF8',
  },
  {
    id: 'vanguard-gt',
    name: 'Vanguard GT Supercar',
    category: 'Supercar',
    description: 'Low-slung aerodynamic supercar with wide drift grip and active rear wing.',
    price: 380000,
    speedBonus: 1.16,
    handlingFactor: 0.96,
    hoverHeight: 0,
    canFly: false,
    primaryColor: '#F59E0B',
    accentColor: '#1E293B',
  },
  {
    id: 'solaris-hovercar',
    name: 'Solaris Mag-Hovercar',
    category: 'Hovercar',
    description: 'Magnetic cushion coupe that glides smoothly over rough terrain and ice.',
    price: 480000,
    speedBonus: 1.17,
    handlingFactor: 1.02,
    hoverHeight: 0.55,
    canFly: false,
    primaryColor: '#10B981',
    accentColor: '#A7F3D0',
  },
  {
    id: 'valkyrie-jet',
    name: 'Valkyrie Sky Skimmer',
    category: 'Sky Craft',
    description: 'Special flying hover-craft with wing-assisted air stability in supported modes.',
    price: 600000,
    speedBonus: 1.18,
    handlingFactor: 1.0,
    hoverHeight: 0.85,
    canFly: true,
    primaryColor: '#F43F5E',
    accentColor: '#FDE047',
  },
];

// ============================================================================
// ARCADE GADGETS (200,000 SC EACH — NON-LETHAL FICTIONAL TECH)
// ============================================================================
export const GADGETS: GadgetDef[] = [
  {
    id: 'pulse-bumper',
    name: 'Pulse Bumper Orb',
    description: 'Drops a cartoon bounce dome behind you that gently boops trailing rivals sideways.',
    price: 200000,
    cooldown: 14,
    effectType: 'bumper',
    counterNote: 'Blocked by Speed Shield or jumped over cleanly.',
    accentColor: '#38BDF8',
  },
  {
    id: 'holo-decoy',
    name: 'Holo-Decoy Projector',
    description: 'Launches a shimmering holographic Speedstar ahead to bait rival tracking.',
    price: 200000,
    cooldown: 15,
    effectType: 'decoy',
    counterNote: 'Visual illusion only — vanishes on contact.',
    accentColor: '#A855F7',
  },
  {
    id: 'spring-trap',
    name: 'Arcade Spring Pad',
    description: 'Deploys a bright coil pad that launches anyone stepping on it upward into an arc.',
    price: 200000,
    cooldown: 13,
    effectType: 'spring',
    counterNote: 'Can be dodged or used intentionally for vertical shortcuts.',
    accentColor: '#FACC15',
  },
  {
    id: 'boost-nova',
    name: 'Kinetic Boost Ring',
    description: 'Places a temporary speed ring ahead that accelerates you and teammates.',
    price: 200000,
    cooldown: 14,
    effectType: 'nova',
    counterNote: 'Visible to all racers; rivals can also steal the slipstream.',
    accentColor: '#22D3EE',
  },
  {
    id: 'slippery-foam',
    name: 'Bubble Foam Slick',
    description: 'Coats a small track patch in bright arcade soap foam that causes playful sliding.',
    price: 200000,
    cooldown: 15,
    effectType: 'foam',
    counterNote: 'Countered by jumping, rail grinding, or Speed Shield.',
    accentColor: '#EC4899',
  },
  {
    id: 'magnet-pulse',
    name: 'Star Siphon Pulse',
    description: 'Emits a friendly radial shockwave that pulls nearby Energy Stars and charges +15% Turbo.',
    price: 200000,
    cooldown: 16,
    effectType: 'magnet-pulse',
    counterNote: 'Short 10m radius; rewards tight pack positioning.',
    accentColor: '#10B981',
  },
];

// ============================================================================
// COSMETICS (SKINS, TRAILS, EMOTES, VICTORY ANIMATIONS, COLLECTIBLES)
// ============================================================================
export const COSMETICS: CosmeticDef[] = [
  // Skins (10,000 - 75,000 basic; 500,000+ legendary)
  { id: 'skin-carbon', category: 'skins', name: 'Carbon Stealth Suit', description: 'Matte obsidian weave with subtle cyan seams.', price: 15000, tier: 'Standard', colorHex: '#1E293B' },
  { id: 'skin-solar', category: 'skins', name: 'Solar Flare Coating', description: 'Amber-gold metallic finish that catches stadium lights.', price: 35000, tier: 'Standard', colorHex: '#F59E0B' },
  { id: 'skin-arctic', category: 'skins', name: 'Arctic Chrome Finish', description: 'Frost-white anodized armor with ice-blue trim.', price: 65000, tier: 'Standard', colorHex: '#E0F2FE' },
  { id: 'skin-champion-gold', category: 'skins', name: 'Champion Sovereign Gold', description: 'Legendary championship brushed gold plating.', price: 500000, tier: 'Legendary', colorHex: '#FACC15' },

  // Trails (50,000 - 180,000 premium; 500,000+ legendary)
  { id: 'trail-cyan', category: 'trails', name: 'Cyber Cyan Streak', description: 'Crisp twin plasma ribbons.', price: 50000, tier: 'Premium', colorHex: '#06B6D4' },
  { id: 'trail-inferno', category: 'trails', name: 'Inferno Flame Wake', description: 'Blazing ember trail reacting to sprint speed.', price: 95000, tier: 'Premium', colorHex: '#F97316' },
  { id: 'trail-prism', category: 'trails', name: 'Prism Velocity Arc', description: 'Iridescent spectrum ribbon.', price: 165000, tier: 'Premium', colorHex: '#EC4899' },
  { id: 'trail-celestial', category: 'trails', name: 'Celestial Starlight Ribbon', description: 'Legendary star-dusted cosmic wake.', price: 550000, tier: 'Legendary', colorHex: '#FDE047' },

  // Emotes (10,000 - 75,000)
  { id: 'emote-wave', category: 'emotes', name: 'Champion Salute', description: 'Confident wave & visor tap.', price: 10000, tier: 'Standard', colorHex: '#38BDF8' },
  { id: 'emote-spin', category: 'emotes', name: '360 Heel Spin', description: 'Quick celebratory spin.', price: 25000, tier: 'Standard', colorHex: '#A855F7' },
  { id: 'emote-spark', category: 'emotes', name: 'Turbo Flex', description: 'Ignite brief energy sparks in place.', price: 55000, tier: 'Standard', colorHex: '#F59E0B' },

  // Victory Animations (25,000 - 75,000; 500,000 legendary)
  { id: 'vic-backflip', category: 'victoryAnimations', name: 'Acrobatic Backflip', description: 'Clean aerial tuck into podium landing.', price: 30000, tier: 'Standard', colorHex: '#22D3EE' },
  { id: 'vic-levitate', category: 'victoryAnimations', name: 'Zero-G Ascension', description: 'Hover triumphantly above the podium.', price: 75000, tier: 'Standard', colorHex: '#818CF8' },
  { id: 'vic-crown', category: 'victoryAnimations', name: 'Royale Trophy Burst', description: 'Legendary firework spin & crown salute.', price: 520000, tier: 'Legendary', colorHex: '#FACC15' },

  // Collectibles / Profile Badges
  { id: 'col-neon-badge', category: 'collectibles', name: 'Neon Rush Emblem', description: 'Collectible holographic city badge.', price: 15000, tier: 'Standard', colorHex: '#06B6D4' },
  { id: 'col-star-crest', category: 'collectibles', name: 'Golden Star Crest', description: 'Collector emblem for Star Collector fans.', price: 45000, tier: 'Standard', colorHex: '#FBBF24' },
  { id: 'col-apex-trophy', category: 'collectibles', name: 'Grand Apex Trophy', description: 'Legendary showroom trophy collectible.', price: 600000, tier: 'Legendary', colorHex: '#F59E0B' },
];

// ============================================================================
// RANKED SYSTEM TIERS
// ============================================================================
export const RANK_TIERS: RankTierDef[] = [
  { id: 'bronze', name: 'Bronze', minMmr: 0, color: '#CD7F32', seasonRewardSc: 15000 },
  { id: 'silver', name: 'Silver', minMmr: 1000, color: '#94A3B8', seasonRewardSc: 35000 },
  { id: 'gold', name: 'Gold', minMmr: 1400, color: '#FACC15', seasonRewardSc: 75000 },
  { id: 'platinum', name: 'Platinum', minMmr: 1800, color: '#22D3EE', seasonRewardSc: 150000 },
  { id: 'diamond', name: 'Diamond', minMmr: 2200, color: '#818CF8', seasonRewardSc: 300000 },
  { id: 'champion', name: 'Champion', minMmr: 2600, color: '#F43F5E', seasonRewardSc: 500000 },
];

// ============================================================================
// MISSIONS & ACHIEVEMENTS
// ============================================================================
export const DAILY_SWEEP_BONUS_SC = 25000;

export const DAILY_MISSION_POOL: MissionDef[] = [
  { id: 'daily-3-races', period: 'daily', title: 'Daily Velocity', description: 'Finish 3 races in any mode', target: 3, metric: 'races', rewardSc: 15000, rewardXp: 450 },
  { id: 'daily-5-races', period: 'daily', title: 'Circuit Marathon', description: 'Finish 5 races across any circuits', target: 5, metric: 'races', rewardSc: 24000, rewardXp: 700 },
  { id: 'daily-40-stars', period: 'daily', title: 'Star Sweeper', description: 'Collect 40 Energy Stars', target: 40, metric: 'stars', rewardSc: 14000, rewardXp: 400 },
  { id: 'daily-100-stars', period: 'daily', title: 'Cosmic Harvester', description: 'Collect 100 Energy Stars', target: 100, metric: 'stars', rewardSc: 28000, rewardXp: 800 },
  { id: 'daily-10-turbo', period: 'daily', title: 'Afterburner', description: 'Use Turbo 10 times', target: 10, metric: 'turbo', rewardSc: 12000, rewardXp: 350 },
  { id: 'daily-20-turbo', period: 'daily', title: 'Overdrive Ignition', description: 'Use Turbo 20 times', target: 20, metric: 'turbo', rewardSc: 22000, rewardXp: 650 },
  { id: 'daily-1-win', period: 'daily', title: 'Apex Striker', description: 'Finish 1st place in a race', target: 1, metric: 'wins', rewardSc: 25000, rewardXp: 650 },
  { id: 'daily-2-podiums', period: 'daily', title: 'Podium Regular', description: 'Finish Top 3 in 2 races', target: 2, metric: 'podiums', rewardSc: 20000, rewardXp: 550 },
  { id: 'daily-1-ranked', period: 'daily', title: 'Ranked Contender', description: 'Complete 1 Ranked match', target: 1, metric: 'ranked', rewardSc: 18000, rewardXp: 500 },
  { id: 'daily-2-time-attack', period: 'daily', title: 'Clock Chaser', description: 'Finish 2 Time Attack runs', target: 2, metric: 'time-attack', rewardSc: 16000, rewardXp: 480 },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'weekly-10-races', period: 'weekly', title: 'World Tour', description: 'Complete 10 competitive rounds', target: 10, metric: 'races', rewardSc: 75000, rewardXp: 2000 },
  { id: 'weekly-3-ranked', period: 'weekly', title: 'Ranked Grinder', description: 'Complete 3 Ranked matches', target: 3, metric: 'ranked', rewardSc: 60000, rewardXp: 1500 },
  { id: 'weekly-250-stars', period: 'weekly', title: 'Constellation Run', description: 'Collect 250 Energy Stars', target: 250, metric: 'stars', rewardSc: 85000, rewardXp: 2200 },
];

export const MISSIONS: MissionDef[] = [...DAILY_MISSION_POOL, ...WEEKLY_MISSIONS];

export function getActiveDailyMissions(dailyMissionIds?: string[]): MissionDef[] {
  if (!Array.isArray(dailyMissionIds) || dailyMissionIds.length === 0) {
    return DAILY_MISSION_POOL.slice(0, 3);
  }
  const byId = new Map(DAILY_MISSION_POOL.map((m) => [m.id, m]));
  const resolved = dailyMissionIds
    .map((id) => byId.get(id))
    .filter((m): m is MissionDef => Boolean(m));
  return resolved.length > 0 ? resolved : DAILY_MISSION_POOL.slice(0, 3);
}

export function getMissionResetCountdown(now: Date = new Date()): string {
  const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  const diffMs = Math.max(0, nextUtcMidnight - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ach-first-finish', title: 'First Checkered Flag', description: 'Complete your first official round', metric: 'races', target: 1, rewardSc: 10000, badgeTitle: 'Rookie Finisher' },
  { id: 'ach-5-wins', title: 'Five-Time Champion', description: 'Win 5 competitive rounds', metric: 'wins', target: 5, rewardSc: 50000, badgeTitle: 'Apex Victor' },
  { id: 'ach-100-stars', title: 'Constellation', description: 'Collect 100 Energy Stars across all runs', metric: 'stars', target: 100, rewardSc: 40000, badgeTitle: 'Star Seeker' },
  { id: 'ach-level-5', title: 'Seasoned Speedstar', description: 'Reach Player Level 5', metric: 'level', target: 5, rewardSc: 50000, badgeTitle: 'Pro Runner' },
  { id: 'ach-collector', title: 'Marketplace Patron', description: 'Unlock 8 items across any categories', metric: 'unlocks', target: 8, rewardSc: 60000, badgeTitle: 'Gear Collector' },
];

export const ROUND_COMPLETION_SC = 5000;

export function getRankForMmr(mmr: number): RankTierDef {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (mmr >= tier.minMmr) {
      current = tier;
    }
  }
  return current;
}

export function getLevelFromXp(xp: number): { level: number; currentXp: number; nextLevelXp: number } {
  let level = 1;
  let remaining = Math.max(0, xp);
  let needed = 500;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(500 * Math.pow(1.25, level - 1));
  }
  return { level, currentXp: remaining, nextLevelXp: needed };
}

export interface ShopCatalogItem {
  id: string;
  category: ShopCategory;
  name: string;
  description: string;
  price: number;
  accentColor: string;
  meta: string;
  rankedAllowed?: boolean;
}

export function getCanonicalShopCatalog(): ShopCatalogItem[] {
  const items: ShopCatalogItem[] = [];
  for (const s of SPEEDSTARS) {
    items.push({
      id: s.id,
      category: 'speedstars',
      name: s.name,
      description: `${s.title} — ${s.personality}`,
      price: s.price,
      accentColor: s.primaryColor,
      meta: `${s.rarity} · Speed ${s.stats.speed} · Turbo ${s.stats.turbo}`,
    });
  }
  for (const a of ABILITIES) {
    if (a.ownerOnly) continue;
    items.push({
      id: a.id,
      category: 'abilities',
      name: a.name,
      description: a.description,
      price: a.price,
      accentColor: a.accentColor,
      meta: `${a.kind === 'active' ? `Cooldown ${a.cooldown}s` : 'Passive'} · ${a.compatibility}`,
      rankedAllowed: a.rankedAllowed,
    });
  }
  for (const v of VEHICLES) {
    items.push({
      id: v.id,
      category: 'vehicles',
      name: v.name,
      description: v.description,
      price: v.price,
      accentColor: v.primaryColor,
      meta: `${v.category} · +${Math.round((v.speedBonus - 1) * 100)}% Top Speed`,
    });
  }
  for (const g of GADGETS) {
    items.push({
      id: g.id,
      category: 'gadgets',
      name: g.name,
      description: `${g.description} Counter: ${g.counterNote}`,
      price: g.price,
      accentColor: g.accentColor,
      meta: `Cooldown ${g.cooldown}s · Arcade Gadget`,
    });
  }
  for (const c of COSMETICS) {
    items.push({
      id: c.id,
      category: c.category,
      name: c.name,
      description: c.description,
      price: c.price,
      accentColor: c.colorHex,
      meta: `${c.tier} Cosmetic`,
    });
  }
  return items;
}
