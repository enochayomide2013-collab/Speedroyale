import type {
  ControlBindings,
  ControlSchemePreset,
  GamepadBindings,
  GhostRunRecord,
  LeaderboardEntry,
  LiveRoomSummary,
  MapRecordEntry,
  PlayerLoadout,
  PlayerProfile,
  PlayerSettings,
  RaceFinishSubmission,
  RaceRewardResult,
} from '../shared/types';

let sessionToken: string | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  const rawText = await res.text();
  let data: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      const preview = rawText.replace(/\s+/g, ' ').trim().slice(0, 80);
      throw new Error(
        res.ok
          ? `Unexpected non-JSON response from server: ${preview}`
          : `Server unavailable (${res.status}): ${preview}`
      );
    }
  }
  if (!res.ok) {
    const errMsg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  if (data === null) {
    throw new Error(`Empty response from server (${res.status})`);
  }
  return data as unknown as T;
}

export async function initSession(username?: string): Promise<PlayerProfile> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await requestJson<{ token?: string; profile: PlayerProfile }>('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      if (data.token) {
        sessionToken = data.token;
      }
      return data.profile;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unable to connect to game server.');
}

export async function renamePlayer(username: string): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/profile/rename', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  return data.profile;
}

export async function saveLoadout(loadout: PlayerLoadout): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/profile/loadout', {
    method: 'POST',
    body: JSON.stringify(loadout),
  });
  return data.profile;
}

export async function saveSettings(settings: PlayerSettings): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/profile/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return data.profile;
}

export async function saveControls(payload: {
  controls: ControlBindings;
  gamepad: GamepadBindings;
  savedSchemes: ControlSchemePreset[];
}): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/profile/controls', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.profile;
}

export async function unlockVault(passcode: string): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/vault/unlock', {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });
  return data.profile;
}

export async function runVaultAction(
  action: 'add-sc' | 'unlock-all' | 'reset-economy'
): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/vault/action', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  return data.profile;
}

export async function purchaseShopItem(itemId: string): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/shop/purchase', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
  return data.profile;
}

export async function startServerRaceSession(modeId: string, mapId: string): Promise<string> {
  const data = await requestJson<{ raceSessionId: string }>('/api/race/session', {
    method: 'POST',
    body: JSON.stringify({ modeId, mapId }),
  });
  return data.raceSessionId;
}

export async function submitRaceComplete(submission: RaceFinishSubmission): Promise<RaceRewardResult> {
  return requestJson<RaceRewardResult>('/api/race/complete', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

export async function claimMission(missionId: string): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/missions/claim', {
    method: 'POST',
    body: JSON.stringify({ missionId }),
  });
  return data.profile;
}

export async function claimAchievement(achievementId: string): Promise<PlayerProfile> {
  const data = await requestJson<{ profile: PlayerProfile }>('/api/achievements/claim', {
    method: 'POST',
    body: JSON.stringify({ achievementId }),
  });
  return data.profile;
}

export async function fetchLeaderboards(): Promise<{
  rankedTop: LeaderboardEntry[];
  mapRecords: Record<string, MapRecordEntry[]>;
  onlineCount: number;
  activeRooms: number;
}> {
  return requestJson('/api/leaderboards');
}

export async function fetchLiveRooms(): Promise<{ rooms: LiveRoomSummary[] }> {
  return requestJson('/api/rooms/live');
}

export async function fetchMapGhosts(mapId: string): Promise<{
  personalBest: GhostRunRecord | null;
  globalTop: GhostRunRecord | null;
}> {
  return requestJson(`/api/ghosts/${encodeURIComponent(mapId)}`);
}
