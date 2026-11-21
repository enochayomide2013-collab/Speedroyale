import type { GameModeId } from './gameData.ts';

export interface PlayerLoadout {
  speedstarId: string;
  abilityIds: string[]; // Max 3
  vehicleId: string | null;
  gadgetId: string | null;
  skinId: string | null;
  trailId: string | null;
  emoteId: string | null;
  victoryAnimId: string | null;
}

export interface ControlBindings {
  forward: string;
  backward: string;
  steerLeft: string;
  steerRight: string;
  sprint: string;
  jump: string;
  slide: string;
  turbo: string;
  ability: string;
  airDash: string;
  gadget: string;
  vehicle: string;
  respawn: string;
  emote: string;
}

export interface GamepadBindings {
  jump: number;
  slide: number;
  turbo: number;
  ability: number;
  airDash: number;
  gadget: number;
  vehicle: number;
  respawn: number;
}

export interface ControlSchemePreset {
  name: string;
  keyboard: ControlBindings;
  gamepad: GamepadBindings;
}

export const DEFAULT_KEYBOARD_BINDINGS: ControlBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  slide: 'KeyC',
  turbo: 'KeyF',
  ability: 'KeyQ',
  airDash: 'KeyE',
  gadget: 'KeyX',
  vehicle: 'KeyV',
  respawn: 'KeyR',
  emote: 'KeyG',
};

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  jump: 0,     // A / Cross
  slide: 1,    // B / Circle
  turbo: 2,    // X / Square
  ability: 3,  // Y / Triangle
  airDash: 5,  // RB / R1
  gadget: 4,   // LB / L1
  vehicle: 8,  // Back / Select
  respawn: 9,  // Start
};

export interface PlayerSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  masterVolume: number; // 0..1
  sfxVolume: number;    // 0..1
  musicVolume: number;  // 0..1
  autoSprint: boolean;
  touchControls: boolean;
  cameraFovBoost: boolean;
  controls: ControlBindings;
  gamepad: GamepadBindings;
  savedSchemes: ControlSchemePreset[];
}

export interface MissionProgressMap {
  [missionId: string]: {
    progress: number;
    claimed: boolean;
  };
}

export interface SpeedstarMasteryEntry {
  xp: number;
  races: number;
  wins: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  speedCredits: number;
  xp: number;
  mmr: number;
  racesCompleted: number;
  wins: number;
  starsCollected: number;
  turboActivations: number;
  rankedRaces: number;
  vaultUnlocked: boolean;
  unlockedIds: string[];
  claimedAchievements: string[];
  missions: MissionProgressMap;
  loadout: PlayerLoadout;
  settings: PlayerSettings;
  personalBests: Record<string, number>; // mapId -> bestTimeSec
  speedstarMastery: Record<string, SpeedstarMasteryEntry>;
  dailyMissionDate?: string;
  dailyMissionIds?: string[];
  dailySweepClaimedDate?: string;
}

export interface GhostSample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export type GhostSelection = 'off' | 'personal-best' | 'global-top';

export interface GhostRunRecord {
  mapId: string;
  playerId: string;
  username: string;
  speedstarId: string;
  timeSec: number;
  samples: GhostSample[];
  updatedAt: string;
}

export interface RaceFinishSubmission {
  raceSessionId: string;
  modeId: GameModeId;
  mapId: string;
  ranked: boolean;
  placement: number;
  totalRacers: number;
  finishTimeSec: number;
  starsCollected: number;
  turboUsedCount: number;
  completed: boolean;
  ghostSamples?: GhostSample[];
}

export interface RaceRewardResult {
  roundCompletionSc: number; // Guaranteed 5000 SC
  placementBonusSc: number;
  firstWinBonusSc: number;
  starBonusSc: number;
  masteryBonusSc: number;
  totalScEarned: number;
  xpEarned: number;
  masteryEarnedXp: number;
  masteryTierUp: { speedstarId: string; newTierName: string; bonusSc: number } | null;
  mmrDelta: number;
  newPersonalBest: boolean;
  newlyCompletedMissions?: string[];
  profile: PlayerProfile;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  speedstarId: string;
  mmr: number;
  wins: number;
  racesCompleted: number;
}

export interface MapRecordEntry {
  mapId: string;
  playerId: string;
  username: string;
  speedstarId: string;
  timeSec: number;
}

// WebSocket Multiplayer Protocol
export interface LobbyMember {
  clientId: string;
  username: string;
  speedstarId: string;
  ready: boolean;
  isHost: boolean;
  voteMapId: string | null;
}

export interface MultiplayerRoomState {
  roomCode: string;
  modeId: GameModeId;
  mapId: string;
  ranked: boolean;
  fillBots: boolean;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  countdownSec: number;
  members: LobbyMember[];
  mapVotes: Record<string, number>;
  spectatorCount?: number;
}

export interface LiveRoomSummary {
  roomCode: string;
  modeId: GameModeId;
  mapId: string;
  ranked: boolean;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  memberCount: number;
  spectatorCount: number;
}

export interface RemoteRacerFrame {
  clientId: string;
  username: string;
  speedstarId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  animState: string;
  turboActive: boolean;
  vehicleId: string | null;
  checkpointIndex: number;
  progress: number;
  finished: boolean;
  finishTimeSec: number | null;
}
