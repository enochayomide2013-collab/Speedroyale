import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import * as THREE from 'three';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ABILITIES,
  ACHIEVEMENTS,
  COSMETICS,
  DAILY_MISSION_POOL,
  DAILY_SWEEP_BONUS_SC,
  GADGETS,
  GAME_MODES,
  MAPS,
  MISSIONS,
  ROUND_COMPLETION_SC,
  VEHICLES,
  WEEKLY_MISSIONS,
  getCanonicalShopCatalog,
  getLevelFromXp,
  type GameModeId,
} from './src/shared/gameData.ts';
import { SPEEDSTARS, STARTER_SPEEDSTAR_IDS, getSpeedstarMasteryRank } from './src/shared/rosterData.ts';
import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  type GhostRunRecord,
  type GhostSample,
  type LeaderboardEntry,
  type LiveRoomSummary,
  type LobbyMember,
  type MapRecordEntry,
  type MultiplayerRoomState,
  type PlayerProfile,
  type RaceFinishSubmission,
  type RaceRewardResult,
} from './src/shared/types.ts';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

interface StoreData {
  profiles: Record<string, PlayerProfile>;
  tokens: Record<string, string>; // token -> playerId
  mapRecords: Record<string, MapRecordEntry[]>; // mapId -> sorted best times
  personalGhosts: Record<string, Record<string, GhostRunRecord>>; // playerId -> mapId -> GhostRunRecord
  globalGhosts: Record<string, GhostRunRecord>; // mapId -> GhostRunRecord
}

const defaultStarterUnlocks = [
  ...STARTER_SPEEDSTAR_IDS,
  'double-jump',
  'air-dash',
  'turbo',
];

const dailyMissionById = new Map(DAILY_MISSION_POOL.map((m) => [m.id, m]));

function getTodayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function selectRandomDailyMissionIds(): string[] {
  const pool = [...DAILY_MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked: string[] = [];
  const usedMetrics = new Set<string>();
  for (const def of pool) {
    if (usedMetrics.has(def.metric)) continue;
    picked.push(def.id);
    usedMetrics.add(def.metric);
    if (picked.length === 3) break;
  }
  for (const def of pool) {
    if (picked.length >= 3) break;
    if (!picked.includes(def.id)) {
      picked.push(def.id);
    }
  }
  return picked;
}

function refreshDailyMissions(player: PlayerProfile): boolean {
  const today = getTodayUtcDateKey();
  if (!player.missions || typeof player.missions !== 'object') {
    player.missions = {};
  }
  const hasValidIds =
    Array.isArray(player.dailyMissionIds) &&
    player.dailyMissionIds.length === 3 &&
    player.dailyMissionIds.every((id) => dailyMissionById.has(id));

  let dirty = false;
  if (player.dailyMissionDate !== today || !hasValidIds) {
    const chosenIds = selectRandomDailyMissionIds();
    const nextMissions: PlayerProfile['missions'] = {};
    for (const [k, v] of Object.entries(player.missions)) {
      if (!k.startsWith('daily-')) {
        nextMissions[k] = v;
      }
    }
    for (const id of chosenIds) {
      nextMissions[id] = { progress: 0, claimed: false };
    }
    player.missions = nextMissions;
    player.dailyMissionIds = chosenIds;
    player.dailyMissionDate = today;
    if (player.dailySweepClaimedDate && player.dailySweepClaimedDate !== today) {
      player.dailySweepClaimedDate = undefined;
    }
    dirty = true;
  } else {
    for (const id of player.dailyMissionIds!) {
      if (!player.missions[id]) {
        player.missions[id] = { progress: 0, claimed: false };
        dirty = true;
      }
    }
  }
  return dirty;
}

function createFreshProfile(id: string, username: string): PlayerProfile {
  const profile: PlayerProfile = {
    id,
    username,
    speedCredits: 25000,
    xp: 0,
    mmr: 1000,
    racesCompleted: 0,
    wins: 0,
    starsCollected: 0,
    turboActivations: 0,
    rankedRaces: 0,
    vaultUnlocked: false,
    unlockedIds: [...defaultStarterUnlocks],
    claimedAchievements: [],
    missions: {},
    loadout: {
      speedstarId: 'vortex',
      abilityIds: ['double-jump', 'air-dash', 'turbo'],
      vehicleId: null,
      gadgetId: null,
      skinId: null,
      trailId: null,
      emoteId: null,
      victoryAnimId: null,
    },
    settings: {
      quality: 'high',
      masterVolume: 0.7,
      sfxVolume: 0.85,
      musicVolume: 0.45,
      autoSprint: true,
      touchControls: false,
      cameraFovBoost: true,
      controls: { ...DEFAULT_KEYBOARD_BINDINGS },
      gamepad: { ...DEFAULT_GAMEPAD_BINDINGS },
      savedSchemes: [],
    },
    personalBests: {},
    speedstarMastery: {},
  };
  refreshDailyMissions(profile);
  return profile;
}

function hydrateProfile(p: PlayerProfile): PlayerProfile {
  if (typeof p.vaultUnlocked !== 'boolean') p.vaultUnlocked = false;
  if (!p.settings.controls) p.settings.controls = { ...DEFAULT_KEYBOARD_BINDINGS };
  if (!p.settings.gamepad) p.settings.gamepad = { ...DEFAULT_GAMEPAD_BINDINGS };
  if (!Array.isArray(p.settings.savedSchemes)) p.settings.savedSchemes = [];
  if (!Array.isArray(p.unlockedIds)) p.unlockedIds = [];
  if (!p.speedstarMastery || typeof p.speedstarMastery !== 'object') p.speedstarMastery = {};
  for (const id of defaultStarterUnlocks) {
    if (!p.unlockedIds.includes(id)) {
      p.unlockedIds.push(id);
    }
  }
  refreshDailyMissions(p);
  return p;
}

let store: StoreData = {
  profiles: {},
  tokens: {},
  mapRecords: {},
  personalGhosts: {},
  globalGhosts: {},
};

const SEED_CHAMPIONS = [
  { id: 'seed-1', username: 'ApexKai', speedstarId: 'sonic' },
  { id: 'seed-2', username: 'VeloceAria', speedstarId: 'flash' },
  { id: 'seed-3', username: 'NitroZane', speedstarId: 'shadow' },
  { id: 'seed-4', username: 'SkylineMika', speedstarId: 'quicksilver' },
  { id: 'seed-5', username: 'CobaltRyu', speedstarId: 'jet' },
];

function generateBenchmarkGhostForMap(mapIndex: number): GhostRunRecord {
  const mapDef = MAPS[mapIndex];
  const points = mapDef.waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
  const totalLength = Math.max(200, curve.getLength());
  const champ = SEED_CHAMPIONS[mapIndex % SEED_CHAMPIONS.length];
  const paceMs = 31.5 + (mapIndex % 4) * 1.4;
  const totalTimeSec = Number((totalLength / paceMs).toFixed(2));
  const stepSec = 0.1;
  const sampleCount = Math.max(20, Math.ceil(totalTimeSec / stepSec));
  const up = new THREE.Vector3(0, 1, 0);
  const samples: GhostSample[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = Math.min(totalTimeSec, Number((i * stepSec).toFixed(2)));
    // Normalized progress wrapping smoothly from start (0.992) across full lap
    const u = (0.994 + (t / totalTimeSec) * 0.995) % 1;
    const pt = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    const right = new THREE.Vector3().crossVectors(tan, up).normalize();
    const sway = Math.sin(u * Math.PI * 6 + mapIndex) * 1.2;
    const pos = pt.addScaledVector(right, sway);
    samples.push({
      t,
      x: Number(pos.x.toFixed(2)),
      y: Number(pos.y.toFixed(2)),
      z: Number(pos.z.toFixed(2)),
      yaw: Number(Math.atan2(tan.x, tan.z).toFixed(3)),
    });
  }

  return {
    mapId: mapDef.id,
    playerId: champ.id,
    username: champ.username,
    speedstarId: champ.speedstarId,
    timeSec: totalTimeSec,
    samples,
    updatedAt: new Date().toISOString(),
  };
}

function ensureSeededGlobalGhosts(): boolean {
  let dirty = false;
  MAPS.forEach((m, idx) => {
    if (!store.globalGhosts[m.id] || store.globalGhosts[m.id].samples.length < 5) {
      const ghost = generateBenchmarkGhostForMap(idx);
      store.globalGhosts[m.id] = ghost;
      const existing = store.mapRecords[m.id] || [];
      if (existing.length === 0) {
        store.mapRecords[m.id] = [
          {
            mapId: m.id,
            playerId: ghost.playerId,
            username: ghost.username,
            speedstarId: ghost.speedstarId,
            timeSec: ghost.timeSec,
          },
        ];
      }
      dirty = true;
    }
  });
  return dirty;
}

let writeChain: Promise<void> = Promise.resolve();

async function loadStore(): Promise<void> {
  let loaded = false;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    if (parsed && parsed.profiles && parsed.tokens) {
      const hydrated: Record<string, PlayerProfile> = {};
      for (const [k, v] of Object.entries(parsed.profiles)) {
        hydrated[k] = hydrateProfile(v);
      }
      store = {
        profiles: hydrated,
        tokens: parsed.tokens,
        mapRecords: parsed.mapRecords || {},
        personalGhosts: parsed.personalGhosts || {},
        globalGhosts: parsed.globalGhosts || {},
      };
      loaded = true;
    }
  } catch {
    // Seed initial competitive leaderboard profiles
    SEED_CHAMPIONS.forEach((champ, idx) => {
      const p = createFreshProfile(champ.id, champ.username);
      p.mmr = 1650 - idx * 120;
      p.wins = 14 - idx * 2;
      p.racesCompleted = 28 - idx * 3;
      p.xp = 4200 - idx * 600;
      p.loadout.speedstarId = champ.speedstarId;
      store.profiles[champ.id] = p;
    });
  }
  const seeded = ensureSeededGlobalGhosts();
  if (!loaded || seeded) {
    await saveStore();
  }
}

function saveStore(): Promise<void> {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmpPath, STORE_PATH);
  });
  return writeChain;
}

// Active race sessions issued by server (prevents fake/replayed race reward submissions)
interface ActiveRaceSession {
  playerId: string;
  modeId: GameModeId;
  mapId: string;
  startedAtMs: number;
}
const activeRaceSessions = new Map<string, ActiveRaceSession>();

// ============================================================================
// WEBSOCKET MULTIPLAYER ROOMS
// ============================================================================
interface ConnectedClient {
  clientId: string;
  ws: WebSocket;
  playerId: string;
  username: string;
  speedstarId: string;
  roomCode: string | null;
  spectatingRoomCode: string | null;
}

interface InternalRoom {
  roomCode: string;
  modeId: GameModeId;
  mapId: string;
  ranked: boolean;
  fillBots: boolean;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  countdownSec: number;
  hostClientId: string;
  members: Map<string, LobbyMember>;
  spectators: Set<string>;
  countdownTimer?: NodeJS.Timeout;
}

const wsClients = new Map<string, ConnectedClient>();
const rooms = new Map<string, InternalRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function serializeRoom(room: InternalRoom): MultiplayerRoomState {
  const mapVotes: Record<string, number> = {};
  const members = Array.from(room.members.values());
  for (const m of members) {
    if (m.voteMapId) {
      mapVotes[m.voteMapId] = (mapVotes[m.voteMapId] || 0) + 1;
    }
  }
  return {
    roomCode: room.roomCode,
    modeId: room.modeId,
    mapId: room.mapId,
    ranked: room.ranked,
    fillBots: room.fillBots,
    status: room.status,
    countdownSec: room.countdownSec,
    members,
    mapVotes,
    spectatorCount: room.spectators.size,
  };
}

function broadcastRoom(room: InternalRoom, type: string, payload: unknown, excludeClientId?: string): void {
  const msg = JSON.stringify({ type, payload });
  for (const memberId of room.members.keys()) {
    if (excludeClientId && memberId === excludeClientId) continue;
    const client = wsClients.get(memberId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
  for (const specId of room.spectators) {
    if (excludeClientId && specId === excludeClientId) continue;
    const client = wsClients.get(specId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function removeClientFromRoom(client: ConnectedClient): void {
  if (client.spectatingRoomCode) {
    const specRoom = rooms.get(client.spectatingRoomCode);
    client.spectatingRoomCode = null;
    if (specRoom) {
      specRoom.spectators.delete(client.clientId);
      broadcastRoom(specRoom, 'room:state', serializeRoom(specRoom));
    }
  }
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;
  room.members.delete(client.clientId);
  if (room.members.size === 0) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    rooms.delete(room.roomCode);
    return;
  }
  if (room.hostClientId === client.clientId) {
    const nextHost = room.members.values().next().value;
    if (nextHost) {
      nextHost.isHost = true;
      room.hostClientId = nextHost.clientId;
    }
  }
  broadcastRoom(room, 'room:state', serializeRoom(room));
}

function startRoomCountdown(room: InternalRoom): void {
  if (room.status !== 'waiting') return;
  // Pick most voted map if any votes exist
  const state = serializeRoom(room);
  let bestMap = room.mapId;
  let bestVotes = 0;
  for (const [mId, count] of Object.entries(state.mapVotes)) {
    if (count > bestVotes) {
      bestVotes = count;
      bestMap = mId;
    }
  }
  room.mapId = bestMap;
  room.status = 'countdown';
  room.countdownSec = 3;
  broadcastRoom(room, 'room:state', serializeRoom(room));

  room.countdownTimer = setInterval(() => {
    room.countdownSec -= 1;
    if (room.countdownSec <= 0) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      room.status = 'racing';
      broadcastRoom(room, 'room:start', serializeRoom(room));
    } else {
      broadcastRoom(room, 'room:state', serializeRoom(room));
    }
  }, 1000);
}

// ============================================================================
// SERVER BOOTSTRAP
// ============================================================================
async function startServer(): Promise<void> {
  await loadStore();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const shopCatalog = getCanonicalShopCatalog();
  const catalogById = new Map(shopCatalog.map((i) => [i.id, i]));

  function getAuthPlayer(req: express.Request): PlayerProfile | null {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    const playerId = store.tokens[token];
    if (!playerId) return null;
    return store.profiles[playerId] ?? null;
  }

  // Create or resume session
  app.post('/api/auth/session', async (req, res) => {
    const existing = getAuthPlayer(req);
    if (existing) {
      if (refreshDailyMissions(existing)) {
        await saveStore();
      }
      res.json({ profile: existing });
      return;
    }
    const rawName = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18) || `Speedstar_${Math.floor(1000 + Math.random() * 9000)}`;
    const playerId = `plr_${crypto.randomUUID()}`;
    const token = crypto.randomBytes(24).toString('hex');
    const profile = createFreshProfile(playerId, cleanName);

    store.profiles[playerId] = profile;
    store.tokens[token] = playerId;
    await saveStore();

    res.json({ token, profile });
  });

  app.get('/api/profile', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (refreshDailyMissions(player)) {
      await saveStore();
    }
    res.json({ profile: player });
  });

  app.post('/api/profile/rename', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const rawName = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18);
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Callsign must be 2-18 alphanumeric characters.' });
      return;
    }
    player.username = cleanName;
    await saveStore();
    res.json({ profile: player });
  });

  app.post('/api/profile/loadout', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid loadout' });
      return;
    }
    const unlocked = new Set(player.unlockedIds);

    if (typeof body.speedstarId === 'string' && unlocked.has(body.speedstarId)) {
      player.loadout.speedstarId = body.speedstarId;
    }
    if (Array.isArray(body.abilityIds)) {
      player.loadout.abilityIds = body.abilityIds
        .filter((id: unknown): id is string => typeof id === 'string' && unlocked.has(id))
        .slice(0, 3);
    }
    const optionalSlots = ['vehicleId', 'gadgetId', 'skinId', 'trailId', 'emoteId', 'victoryAnimId'] as const;
    for (const key of optionalSlots) {
      const val = body[key];
      if (val === null) {
        player.loadout[key] = null;
      } else if (typeof val === 'string' && unlocked.has(val)) {
        player.loadout[key] = val;
      }
    }
    await saveStore();
    res.json({ profile: player });
  });

  app.post('/api/profile/settings', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const s = req.body;
    if (s && typeof s === 'object') {
      if (['low', 'medium', 'high', 'ultra'].includes(s.quality)) player.settings.quality = s.quality;
      if (typeof s.masterVolume === 'number') player.settings.masterVolume = Math.max(0, Math.min(1, s.masterVolume));
      if (typeof s.sfxVolume === 'number') player.settings.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
      if (typeof s.musicVolume === 'number') player.settings.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
      if (typeof s.autoSprint === 'boolean') player.settings.autoSprint = s.autoSprint;
      if (typeof s.touchControls === 'boolean') player.settings.touchControls = s.touchControls;
      if (typeof s.cameraFovBoost === 'boolean') player.settings.cameraFovBoost = s.cameraFovBoost;
      await saveStore();
    }
    res.json({ profile: player });
  });

  app.post('/api/profile/controls', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = req.body;
    if (body && typeof body === 'object') {
      if (body.controls && typeof body.controls === 'object') {
        const next = { ...player.settings.controls };
        for (const k of Object.keys(DEFAULT_KEYBOARD_BINDINGS) as (keyof typeof DEFAULT_KEYBOARD_BINDINGS)[]) {
          if (typeof body.controls[k] === 'string' && body.controls[k].length <= 24) {
            next[k] = body.controls[k];
          }
        }
        player.settings.controls = next;
      }
      if (body.gamepad && typeof body.gamepad === 'object') {
        const nextGp = { ...player.settings.gamepad };
        for (const k of Object.keys(DEFAULT_GAMEPAD_BINDINGS) as (keyof typeof DEFAULT_GAMEPAD_BINDINGS)[]) {
          if (typeof body.gamepad[k] === 'number' && body.gamepad[k] >= 0 && body.gamepad[k] <= 32) {
            nextGp[k] = body.gamepad[k];
          }
        }
        player.settings.gamepad = nextGp;
      }
      if (Array.isArray(body.savedSchemes)) {
        player.settings.savedSchemes = body.savedSchemes.slice(0, 6);
      }
      await saveStore();
    }
    res.json({ profile: player });
  });

  // Owner's Vault: Server-Side Passcode Verification (never exposed in client bundle)
  app.post('/api/vault/unlock', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const submitted = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    const expected = (process.env.OWNER_VAULT_PASSCODE || '2013').trim();
    const hSubmitted = crypto.createHash('sha256').update(submitted).digest();
    const hExpected = crypto.createHash('sha256').update(expected).digest();

    if (!crypto.timingSafeEqual(hSubmitted, hExpected)) {
      res.status(403).json({ error: 'Access denied. Invalid Owner Vault passcode.' });
      return;
    }

    player.vaultUnlocked = true;
    if (!player.unlockedIds.includes('zero-point')) {
      player.unlockedIds.push('zero-point');
    }
    await saveStore();
    res.json({ profile: player });
  });

  app.post('/api/vault/action', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!player.vaultUnlocked) {
      res.status(403).json({ error: "Owner's Vault is locked." });
      return;
    }

    const action = String(req.body?.action || '');
    if (action === 'add-sc') {
      player.speedCredits = Math.min(999999999, player.speedCredits + 10000000);
    } else if (action === 'unlock-all') {
      const allIds = new Set<string>(player.unlockedIds);
      SPEEDSTARS.forEach((s) => allIds.add(s.id));
      ABILITIES.forEach((a) => allIds.add(a.id));
      VEHICLES.forEach((v) => allIds.add(v.id));
      GADGETS.forEach((g) => allIds.add(g.id));
      COSMETICS.forEach((c) => allIds.add(c.id));
      player.unlockedIds = Array.from(allIds);
    } else if (action === 'reset-economy') {
      player.speedCredits = 25000;
      player.unlockedIds = [...defaultStarterUnlocks, 'zero-point'];
      player.loadout = {
        speedstarId: 'vortex',
        abilityIds: ['double-jump', 'air-dash', 'turbo'],
        vehicleId: null,
        gadgetId: null,
        skinId: null,
        trailId: null,
        emoteId: null,
        victoryAnimId: null,
      };
    } else {
      res.status(400).json({ error: 'Unknown vault action.' });
      return;
    }

    await saveStore();
    res.json({ profile: player });
  });

  // Server-authoritative Shop Purchase
  app.post('/api/shop/purchase', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
    const item = catalogById.get(itemId);
    if (!item) {
      res.status(404).json({ error: 'Item not found in marketplace.' });
      return;
    }
    if (player.unlockedIds.includes(item.id)) {
      res.status(400).json({ error: 'Item already owned.' });
      return;
    }
    if (player.speedCredits < item.price) {
      res.status(400).json({ error: 'Insufficient SpeedCredits.' });
      return;
    }
    player.speedCredits -= item.price;
    player.unlockedIds.push(item.id);
    await saveStore();
    res.json({ profile: player, purchasedItem: item });
  });

  // Start Race Session (issues single-use server token)
  app.post('/api/race/session', (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const modeId = GAME_MODES.some((m) => m.id === req.body?.modeId) ? (req.body.modeId as GameModeId) : 'royale-race';
    const mapId = MAPS.some((m) => m.id === req.body?.mapId) ? String(req.body.mapId) : 'neon-rush-city';
    const raceSessionId = `race_${crypto.randomUUID()}`;
    activeRaceSessions.set(raceSessionId, {
      playerId: player.id,
      modeId,
      mapId,
      startedAtMs: Date.now(),
    });
    res.json({ raceSessionId });
  });

  // Complete Race & Grant Authoritative 5,000 SC + Bonuses + XP + MMR
  app.post('/api/race/complete', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = req.body as RaceFinishSubmission;
    if (!body || typeof body.raceSessionId !== 'string') {
      res.status(400).json({ error: 'Missing race session.' });
      return;
    }
    const session = activeRaceSessions.get(body.raceSessionId);
    if (!session || session.playerId !== player.id) {
      res.status(403).json({ error: 'Invalid or already claimed race session.' });
      return;
    }
    activeRaceSessions.delete(body.raceSessionId);

    // Sanity check elapsed time (at least 4 seconds real time to prevent instant API farming)
    const realElapsedSec = (Date.now() - session.startedAtMs) / 1000;
    if (realElapsedSec < 4) {
      res.status(400).json({ error: 'Round too short to validate.' });
      return;
    }

    const placement = Math.max(1, Math.min(30, Math.round(Number(body.placement) || 1)));
    const totalRacers = Math.max(1, Math.min(30, Math.round(Number(body.totalRacers) || 1)));
    const stars = Math.max(0, Math.min(200, Math.round(Number(body.starsCollected) || 0)));
    const turbos = Math.max(0, Math.min(100, Math.round(Number(body.turboUsedCount) || 0)));
    const finishTimeSec = Math.max(3, Math.min(3600, Number(body.finishTimeSec) || realElapsedSec));

    // Exact 5,000 SC round completion reward
    const roundCompletionSc = ROUND_COMPLETION_SC;
    const placementBonusSc =
      totalRacers > 1
        ? placement === 1
          ? 2500
          : placement === 2
          ? 1500
          : placement === 3
          ? 800
          : 0
        : 0;
    const firstWinBonusSc = player.wins === 0 && placement === 1 && totalRacers > 1 ? 5000 : 0;
    const starBonusSc = stars * 50;

    const xpEarned = 180 + (placement === 1 ? 140 : Math.max(30, 120 - placement * 10)) + stars * 4;
    const activeStarId = player.loadout.speedstarId || 'vortex';
    const masteryEarnedXp = Math.round(xpEarned * 0.85) + (placement === 1 && totalRacers > 1 ? 45 : 0);
    const prevMastery = player.speedstarMastery[activeStarId] || { xp: 0, races: 0, wins: 0 };
    const prevRank = getSpeedstarMasteryRank(prevMastery.xp);
    const nextMasteryXp = prevMastery.xp + masteryEarnedXp;
    const nextRank = getSpeedstarMasteryRank(nextMasteryXp);
    const masteryBonusSc = nextRank.tierIndex > prevRank.tierIndex ? nextRank.bonusSc : 0;
    const masteryTierUp =
      nextRank.tierIndex > prevRank.tierIndex
        ? { speedstarId: activeStarId, newTierName: nextRank.name, bonusSc: masteryBonusSc }
        : null;

    player.speedstarMastery[activeStarId] = {
      xp: nextMasteryXp,
      races: prevMastery.races + 1,
      wins: prevMastery.wins + (placement === 1 && totalRacers > 1 ? 1 : 0),
    };

    const totalScEarned = roundCompletionSc + placementBonusSc + firstWinBonusSc + starBonusSc + masteryBonusSc;

    let mmrDelta = 0;
    if (body.ranked && totalRacers > 1) {
      const mid = (totalRacers + 1) / 2;
      mmrDelta = Math.round((mid - placement) * 14);
      if (placement === 1) mmrDelta += 18;
      player.mmr = Math.max(0, player.mmr + mmrDelta);
      player.rankedRaces += 1;
    }

    player.speedCredits += totalScEarned;
    player.xp += xpEarned;
    player.racesCompleted += 1;
    if (placement === 1 && totalRacers > 1) player.wins += 1;
    player.starsCollected += stars;
    player.turboActivations += turbos;

    // Sanitize submitted ghost telemetry samples if provided
    const cleanSamples: GhostSample[] = Array.isArray(body.ghostSamples)
      ? body.ghostSamples
          .slice(0, 2400)
          .filter(
            (s): s is GhostSample =>
              Boolean(s) &&
              Number.isFinite(s.t) &&
              Number.isFinite(s.x) &&
              Number.isFinite(s.y) &&
              Number.isFinite(s.z) &&
              Number.isFinite(s.yaw)
          )
          .map((s) => ({
            t: Number(s.t.toFixed(2)),
            x: Number(s.x.toFixed(2)),
            y: Number(s.y.toFixed(2)),
            z: Number(s.z.toFixed(2)),
            yaw: Number(s.yaw.toFixed(3)),
          }))
      : [];

    // Personal Best & Map Leaderboard Record (for race/time-attack modes)
    let newPersonalBest = false;
    if (session.modeId !== 'training-grounds' && session.modeId !== 'star-collector') {
      const prevBest = player.personalBests[session.mapId];
      if (!prevBest || finishTimeSec < prevBest) {
        player.personalBests[session.mapId] = Number(finishTimeSec.toFixed(2));
        newPersonalBest = true;

        const list = store.mapRecords[session.mapId] || [];
        const filtered = list.filter((e) => e.playerId !== player.id);
        filtered.push({
          mapId: session.mapId,
          playerId: player.id,
          username: player.username,
          speedstarId: player.loadout.speedstarId,
          timeSec: Number(finishTimeSec.toFixed(2)),
        });
        filtered.sort((a, b) => a.timeSec - b.timeSec);
        store.mapRecords[session.mapId] = filtered.slice(0, 15);

        if (cleanSamples.length >= 5) {
          if (!store.personalGhosts[player.id]) {
            store.personalGhosts[player.id] = {};
          }
          const runRecord: GhostRunRecord = {
            mapId: session.mapId,
            playerId: player.id,
            username: player.username,
            speedstarId: player.loadout.speedstarId,
            timeSec: Number(finishTimeSec.toFixed(2)),
            samples: cleanSamples,
            updatedAt: new Date().toISOString(),
          };
          store.personalGhosts[player.id][session.mapId] = runRecord;

          const curGlobal = store.globalGhosts[session.mapId];
          if (!curGlobal || runRecord.timeSec < curGlobal.timeSec) {
            store.globalGhosts[session.mapId] = runRecord;
          }
        }
      }
    }

    // Ensure today's 3 daily missions are active before incrementing progress
    refreshDailyMissions(player);
    const activeDailySet = new Set(player.dailyMissionIds || []);
    const activeMissions = MISSIONS.filter(
      (m) => m.period === 'weekly' || activeDailySet.has(m.id)
    );
    const newlyCompletedMissions: string[] = [];

    for (const m of activeMissions) {
      const entry = player.missions[m.id] || { progress: 0, claimed: false };
      if (!entry.claimed) {
        const prevProgress = entry.progress;
        if (m.metric === 'races') entry.progress += 1;
        if (m.metric === 'wins' && placement === 1 && totalRacers > 1) entry.progress += 1;
        if (m.metric === 'podiums' && placement <= 3 && totalRacers > 1) entry.progress += 1;
        if (m.metric === 'turbo') entry.progress += turbos;
        if (m.metric === 'stars') entry.progress += stars;
        if (m.metric === 'ranked' && body.ranked) entry.progress += 1;
        if (m.metric === 'time-attack' && session.modeId === 'time-attack') entry.progress += 1;
        player.missions[m.id] = entry;
        if (prevProgress < m.target && entry.progress >= m.target) {
          newlyCompletedMissions.push(m.id);
        }
      }
    }

    await saveStore();

    const result: RaceRewardResult = {
      roundCompletionSc,
      placementBonusSc,
      firstWinBonusSc,
      starBonusSc,
      masteryBonusSc,
      totalScEarned,
      xpEarned,
      masteryEarnedXp,
      masteryTierUp,
      mmrDelta,
      newPersonalBest,
      newlyCompletedMissions,
      profile: player,
    };
    res.json(result);
  });

  app.post('/api/missions/claim', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (refreshDailyMissions(player)) {
      await saveStore();
      res.status(400).json({ error: 'Daily missions rolled over for the new day.' });
      return;
    }
    const missionId = String(req.body?.missionId || '');
    const activeDailySet = new Set(player.dailyMissionIds || []);
    const isWeekly = WEEKLY_MISSIONS.some((w) => w.id === missionId);
    const def = MISSIONS.find((m) => m.id === missionId);
    if (!def || (!isWeekly && !activeDailySet.has(missionId))) {
      res.status(404).json({ error: 'Mission not found in active rotation.' });
      return;
    }
    const state = player.missions[missionId];
    if (!state || state.claimed || state.progress < def.target) {
      res.status(400).json({ error: 'Mission not yet completed or already claimed.' });
      return;
    }
    state.claimed = true;
    player.speedCredits += def.rewardSc;
    player.xp += def.rewardXp;

    let sweepBonusSc = 0;
    const today = getTodayUtcDateKey();
    if (
      player.dailyMissionIds &&
      player.dailyMissionIds.length === 3 &&
      player.dailySweepClaimedDate !== today &&
      player.dailyMissionIds.every((id) => player.missions[id]?.claimed)
    ) {
      sweepBonusSc = DAILY_SWEEP_BONUS_SC;
      player.speedCredits += sweepBonusSc;
      player.dailySweepClaimedDate = today;
    }

    await saveStore();
    res.json({ profile: player, sweepBonusSc });
  });

  app.post('/api/achievements/claim', async (req, res) => {
    const player = getAuthPlayer(req);
    if (!player) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const achId = String(req.body?.achievementId || '');
    const def = ACHIEVEMENTS.find((a) => a.id === achId);
    if (!def) {
      res.status(404).json({ error: 'Achievement not found.' });
      return;
    }
    if (player.claimedAchievements.includes(achId)) {
      res.status(400).json({ error: 'Already claimed.' });
      return;
    }
    const level = getLevelFromXp(player.xp).level;
    const val =
      def.metric === 'races'
        ? player.racesCompleted
        : def.metric === 'wins'
        ? player.wins
        : def.metric === 'stars'
        ? player.starsCollected
        : def.metric === 'level'
        ? level
        : player.unlockedIds.length;
    if (val < def.target) {
      res.status(400).json({ error: 'Requirement not met yet.' });
      return;
    }
    player.claimedAchievements.push(achId);
    player.speedCredits += def.rewardSc;
    await saveStore();
    res.json({ profile: player });
  });

  app.get('/api/ghosts/:mapId', (req, res) => {
    const mapId = String(req.params.mapId || '');
    if (!MAPS.some((m) => m.id === mapId)) {
      res.status(404).json({ error: 'Map not found.' });
      return;
    }
    const player = getAuthPlayer(req);
    const personalBest = player ? store.personalGhosts[player.id]?.[mapId] ?? null : null;
    const globalTop = store.globalGhosts[mapId] ?? null;
    res.json({ personalBest, globalTop });
  });

  app.get('/api/leaderboards', (_req, res) => {
    const rankedTop: LeaderboardEntry[] = Object.values(store.profiles)
      .map((p) => ({
        playerId: p.id,
        username: p.username,
        speedstarId: p.loadout.speedstarId,
        mmr: p.mmr,
        wins: p.wins,
        racesCompleted: p.racesCompleted,
      }))
      .sort((a, b) => b.mmr - a.mmr)
      .slice(0, 25);

    res.json({
      rankedTop,
      mapRecords: store.mapRecords,
      onlineCount: wsClients.size,
      activeRooms: rooms.size,
    });
  });

  app.get('/api/rooms/live', (_req, res) => {
    const liveRooms: LiveRoomSummary[] = Array.from(rooms.values()).map((r) => ({
      roomCode: r.roomCode,
      modeId: r.modeId,
      mapId: r.mapId,
      ranked: r.ranked,
      status: r.status,
      memberCount: r.members.size,
      spectatorCount: r.spectators.size,
    }));
    res.json({ rooms: liveRooms });
  });

  // HTTP & WebSocket Server on same port 3000
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = `cli_${crypto.randomUUID().slice(0, 8)}`;
    let client: ConnectedClient | null = null;

    ws.on('message', (raw) => {
      let msg: { type: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === 'auth') {
        const token = String(msg.payload?.token || '');
        const playerId = store.tokens[token];
        const profile = playerId ? store.profiles[playerId] : null;
        if (!profile) {
          ws.send(JSON.stringify({ type: 'error', payload: 'Invalid session token' }));
          return;
        }
        client = {
          clientId,
          ws,
          playerId: profile.id,
          username: profile.username,
          speedstarId: profile.loadout.speedstarId,
          roomCode: null,
          spectatingRoomCode: null,
        };
        wsClients.set(clientId, client);
        ws.send(JSON.stringify({ type: 'auth:ok', payload: { clientId } }));
        return;
      }

      if (!client) return;

      if (msg.type === 'room:create') {
        removeClientFromRoom(client);
        const modeId = GAME_MODES.some((m) => m.id === msg.payload?.modeId)
          ? (msg.payload?.modeId as GameModeId)
          : 'royale-race';
        const mapId = MAPS.some((m) => m.id === msg.payload?.mapId)
          ? String(msg.payload?.mapId)
          : 'neon-rush-city';
        const ranked = Boolean(msg.payload?.ranked);
        const fillBots = msg.payload?.fillBots !== false;
        const roomCode = generateRoomCode();
        const room: InternalRoom = {
          roomCode,
          modeId,
          mapId,
          ranked,
          fillBots,
          status: 'waiting',
          countdownSec: 3,
          hostClientId: client.clientId,
          members: new Map(),
          spectators: new Set(),
        };
        room.members.set(client.clientId, {
          clientId: client.clientId,
          username: client.username,
          speedstarId: String(msg.payload?.speedstarId || client.speedstarId),
          ready: false,
          isHost: true,
          voteMapId: null,
        });
        rooms.set(roomCode, room);
        client.roomCode = roomCode;
        ws.send(JSON.stringify({ type: 'room:state', payload: serializeRoom(room) }));
        return;
      }

      if (msg.type === 'room:join') {
        const code = String(msg.payload?.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', payload: `Room ${code} not found.` }));
          return;
        }
        if (room.status !== 'waiting') {
          ws.send(JSON.stringify({ type: 'error', payload: 'Race already in progress. Use Spectate to watch live!' }));
          return;
        }
        removeClientFromRoom(client);
        room.members.set(client.clientId, {
          clientId: client.clientId,
          username: client.username,
          speedstarId: String(msg.payload?.speedstarId || client.speedstarId),
          ready: false,
          isHost: false,
          voteMapId: null,
        });
        client.roomCode = room.roomCode;
        broadcastRoom(room, 'room:state', serializeRoom(room));
        return;
      }

      if (msg.type === 'room:spectate') {
        const code = String(msg.payload?.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', payload: `Room ${code} not found.` }));
          return;
        }
        removeClientFromRoom(client);
        room.spectators.add(client.clientId);
        client.spectatingRoomCode = room.roomCode;
        ws.send(JSON.stringify({ type: 'room:spectate-ok', payload: serializeRoom(room) }));
        broadcastRoom(room, 'room:state', serializeRoom(room), client.clientId);
        return;
      }

      if (msg.type === 'room:quickmatch') {
        const modeId = GAME_MODES.some((m) => m.id === msg.payload?.modeId)
          ? (msg.payload?.modeId as GameModeId)
          : 'royale-race';
        const ranked = Boolean(msg.payload?.ranked);
        let found: InternalRoom | null = null;
        for (const r of rooms.values()) {
          if (r.status === 'waiting' && r.modeId === modeId && r.ranked === ranked && r.members.size < 12) {
            found = r;
            break;
          }
        }
        removeClientFromRoom(client);
        if (!found) {
          const roomCode = generateRoomCode();
          found = {
            roomCode,
            modeId,
            mapId: String(msg.payload?.mapId || 'neon-rush-city'),
            ranked,
            fillBots: true,
            status: 'waiting',
            countdownSec: 3,
            hostClientId: client.clientId,
            members: new Map(),
            spectators: new Set(),
          };
          rooms.set(roomCode, found);
        }
        found.members.set(client.clientId, {
          clientId: client.clientId,
          username: client.username,
          speedstarId: String(msg.payload?.speedstarId || client.speedstarId),
          ready: false,
          isHost: found.hostClientId === client.clientId,
          voteMapId: null,
        });
        client.roomCode = found.roomCode;
        broadcastRoom(found, 'room:state', serializeRoom(found));
        return;
      }

      if (msg.type === 'room:leave') {
        removeClientFromRoom(client);
        ws.send(JSON.stringify({ type: 'room:left', payload: {} }));
        return;
      }

      if (!client.roomCode) return;
      const room = rooms.get(client.roomCode);
      if (!room) return;
      const member = room.members.get(client.clientId);
      if (!member) return;

      if (msg.type === 'room:ready') {
        member.ready = Boolean(msg.payload?.ready);
        if (typeof msg.payload?.speedstarId === 'string') {
          member.speedstarId = msg.payload.speedstarId;
        }
        broadcastRoom(room, 'room:state', serializeRoom(room));
        // Auto-start if all members ready and > 1 human
        if (room.members.size > 1 && Array.from(room.members.values()).every((m) => m.ready)) {
          startRoomCountdown(room);
        }
        return;
      }

      if (msg.type === 'room:vote') {
        const voteMapId = String(msg.payload?.mapId || '');
        if (MAPS.some((m) => m.id === voteMapId)) {
          member.voteMapId = voteMapId;
          broadcastRoom(room, 'room:state', serializeRoom(room));
        }
        return;
      }

      if (msg.type === 'room:toggle-bots' && room.hostClientId === client.clientId) {
        room.fillBots = Boolean(msg.payload?.fillBots);
        broadcastRoom(room, 'room:state', serializeRoom(room));
        return;
      }

      if (msg.type === 'room:start' && room.hostClientId === client.clientId) {
        startRoomCountdown(room);
        return;
      }

      if (msg.type === 'race:frame' && room.status === 'racing') {
        broadcastRoom(
          room,
          'race:frame',
          {
            ...msg.payload,
            clientId: client.clientId,
            username: client.username,
            speedstarId: member.speedstarId,
          },
          client.clientId
        );
      }
    });

    ws.on('close', () => {
      if (client) {
        removeClientFromRoom(client);
        wsClients.delete(client.clientId);
      }
    });
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SPEEDSTARS ROYALE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server boot failure:', err);
  process.exit(1);
});
