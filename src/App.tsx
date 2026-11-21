import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Lock, Unlock } from 'lucide-react';
import { GameEngine, type RaceCompletePayload } from './engine/GameEngine';
import type { HudSnapshot } from './engine/RaceManager';
import {
  GAME_MODES,
  MAPS,
  WEEKLY_MISSIONS,
  getActiveDailyMissions,
  getLevelFromXp,
  getRankForMmr,
  type GameModeId,
} from './shared/gameData';
import {
  DEFAULT_KEYBOARD_BINDINGS,
  type ControlBindings,
  type ControlSchemePreset,
  type GamepadBindings,
  type GhostRunRecord,
  type GhostSelection,
  type MultiplayerRoomState,
  type PlayerLoadout,
  type PlayerProfile,
  type PlayerSettings,
  type RaceRewardResult,
} from './shared/types';
import {
  claimAchievement,
  claimMission,
  fetchMapGhosts,
  initSession,
  purchaseShopItem,
  renamePlayer,
  runVaultAction,
  saveControls,
  saveLoadout,
  saveSettings,
  startServerRaceSession,
  submitRaceComplete,
  unlockVault,
} from './services/api';
import { MultiplayerClient } from './services/multiplayer';
import { GameplayHud } from './components/GameplayHud';
import { SpectatorHud } from './components/SpectatorHud';
import { TutorialOverlay } from './components/TutorialOverlay';
import { OwnersVaultModal, type VaultRuntimeFlags } from './components/OwnersVaultModal';
import { ResultsOverlay } from './components/ResultsOverlay';
import { PlayLobbyDock } from './components/PlayLobbyDock';
import { DailyMissionsWidget } from './components/DailyMissionsWidget';
import { MapsPanel, RosterPanel } from './components/RosterAndMaps';
import { GaragePanel, ShopPanel } from './components/ShopAndGarage';
import { ProfileAndSettingsPanel, RankedPanel } from './components/RankedAndProfile';

type LobbyPanelType = 'none' | 'speedstars' | 'maps' | 'ranked' | 'shop' | 'garage' | 'profile' | 'settings';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const mpRef = useRef<MultiplayerClient | null>(null);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'lobby' | 'race'>('lobby');
  const [activePanel, setActivePanel] = useState<LobbyPanelType>('none');

  const [selectedModeId, setSelectedModeId] = useState<GameModeId>('royale-race');
  const [selectedMapId, setSelectedMapId] = useState<string>('neon-rush-city');
  const [rankedMatch, setRankedMatch] = useState(false);
  const [championshipStage, setChampionshipStage] = useState(1);
  const [ghostSelection, setGhostSelection] = useState<GhostSelection>('global-top');
  const [mapGhosts, setMapGhosts] = useState<{
    personalBest: GhostRunRecord | null;
    globalTop: GhostRunRecord | null;
  }>({ personalBest: null, globalTop: null });

  // Multiplayer state
  const [wsConnected, setWsConnected] = useState(false);
  const [localClientId, setLocalClientId] = useState<string | null>(null);
  const [room, setRoom] = useState<MultiplayerRoomState | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);

  // Active Race HUD & Results
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [raceResult, setRaceResult] = useState<RaceCompletePayload | null>(null);
  const [rewards, setRewards] = useState<RaceRewardResult | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultFlags, setVaultFlags] = useState<VaultRuntimeFlags>({
    devFlight: false,
    devInfiniteTurbo: false,
    devNoCooldowns: false,
    debugMode: false,
  });
  const raceSessionIdRef = useRef<string | null>(null);
  const profileRef = useRef<PlayerProfile | null>(null);
  const rankedRef = useRef(false);
  const ghostSelectionRef = useRef<GhostSelection>('global-top');
  const mapGhostsRef = useRef<{ personalBest: GhostRunRecord | null; globalTop: GhostRunRecord | null }>({
    personalBest: null,
    globalTop: null,
  });

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    rankedRef.current = rankedMatch;
  }, [rankedMatch]);

  useEffect(() => {
    ghostSelectionRef.current = ghostSelection;
  }, [ghostSelection]);

  useEffect(() => {
    mapGhostsRef.current = mapGhosts;
  }, [mapGhosts]);

  useEffect(() => {
    if (!profile) return;
    fetchMapGhosts(selectedMapId)
      .then((res) => {
        setMapGhosts(res);
      })
      .catch(() => {});
  }, [profile, selectedMapId]);

  const resolveGhostForSelection = useCallback(
    (
      sel: GhostSelection,
      ghosts: { personalBest: GhostRunRecord | null; globalTop: GhostRunRecord | null }
    ): { selection: GhostSelection; ghostRun: GhostRunRecord | null } => {
      if (sel === 'personal-best') {
        if (ghosts.personalBest) return { selection: 'personal-best', ghostRun: ghosts.personalBest };
        if (ghosts.globalTop) return { selection: 'global-top', ghostRun: ghosts.globalTop };
      }
      if (sel === 'global-top' && ghosts.globalTop) {
        return { selection: 'global-top', ghostRun: ghosts.globalTop };
      }
      return { selection: 'off', ghostRun: null };
    },
    []
  );

  const handleRaceComplete = useCallback(async (result: RaceCompletePayload) => {
    setRaceResult(result);
    setRewards(null);
    const rSid = raceSessionIdRef.current;
    if (!rSid) return;
    raceSessionIdRef.current = null;
    try {
      const rewardRes = await submitRaceComplete({
        raceSessionId: rSid,
        modeId: result.modeId as GameModeId,
        mapId: result.mapId,
        ranked: rankedRef.current,
        placement: result.placement,
        totalRacers: result.totalRacers,
        finishTimeSec: result.finishTimeSec,
        starsCollected: result.starsCollected,
        turboUsedCount: result.turboUsedCount,
        completed: true,
        ghostSamples: result.ghostSamples,
      });
      setRewards(rewardRes);
      setProfile(rewardRes.profile);
      fetchMapGhosts(result.mapId)
        .then((res) => setMapGhosts(res))
        .catch(() => {});
    } catch {
      // Fallback if round ended earlier than 4s minimum threshold
    }
  }, []);

  const launchRace = useCallback(
    async (opts: {
      modeId: GameModeId;
      mapId: string;
      ranked: boolean;
      fillBots: boolean;
      remoteMembers?: { clientId: string; username: string; speedstarId: string }[];
      stage?: number;
    }) => {
      const prof = profileRef.current;
      const engine = engineRef.current;
      if (!prof || !engine) return;

      engine.audio.unlock();
      engine.audio.playUiClick();

      setRaceResult(null);
      setRewards(null);
      setActivePanel('none');
      setScreen('race');
      setRankedMatch(opts.ranked);
      rankedRef.current = opts.ranked;
      const stage = opts.stage ?? 1;
      setChampionshipStage(stage);

      let ghostsForMap = mapGhostsRef.current;
      if (opts.modeId === 'time-attack' || opts.modeId === 'training-grounds') {
        try {
          ghostsForMap = await fetchMapGhosts(opts.mapId);
          setMapGhosts(ghostsForMap);
        } catch {
          // Use cached ghost data
        }
      }
      const resolvedGhost =
        opts.modeId === 'time-attack' || opts.modeId === 'training-grounds'
          ? resolveGhostForSelection(ghostSelectionRef.current, ghostsForMap)
          : { selection: 'off' as GhostSelection, ghostRun: null };

      try {
        raceSessionIdRef.current = await startServerRaceSession(opts.modeId, opts.mapId);
      } catch {
        raceSessionIdRef.current = null;
      }

      engine.startRace({
        modeId: opts.modeId,
        mapId: opts.mapId,
        ranked: opts.ranked,
        loadout: prof.loadout,
        username: prof.username,
        remoteMembers: opts.remoteMembers,
        fillBots: opts.fillBots,
        championshipStage: stage,
        ghostSelection: resolvedGhost.selection,
        ghostRun: resolvedGhost.ghostRun,
      });
    },
    [resolveGhostForSelection]
  );

  // Initialize Three.js Engine + Server Session + WebSocket Multiplayer once
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const engine = new GameEngine(
      canvasMountRef.current,
      (snapshot) => setHud(snapshot),
      (res) => {
        handleRaceComplete(res);
      },
      (frame) => {
        mpRef.current?.send('race:frame', frame);
      }
    );
    engineRef.current = engine;

    const mp = new MultiplayerClient({
      onConnected: (cid) => {
        setWsConnected(true);
        setLocalClientId(cid);
        setMpError(null);
      },
      onRoomState: (r) => {
        setRoom(r);
      },
      onRoomStart: (r) => {
        setRoom(r);
        const remotes = r.members
          .filter((m) => m.clientId !== mpRef.current?.clientId)
          .map((m) => ({
            clientId: m.clientId,
            username: m.username,
            speedstarId: m.speedstarId,
          }));
        launchRace({
          modeId: r.modeId,
          mapId: r.mapId,
          ranked: r.ranked,
          fillBots: r.fillBots,
          remoteMembers: remotes,
        });
      },
      onSpectateOk: (specRoom) => {
        setRaceResult(null);
        setRewards(null);
        setActivePanel('none');
        setTutorialActive(false);
        setScreen('race');
        engineRef.current?.startSpectatingLiveRoom(specRoom);
      },
      onRemoteFrame: (frame) => {
        engineRef.current?.applyRemoteFrame(frame);
      },
      onError: (msg) => setMpError(msg),
      onDisconnect: () => setWsConnected(false),
    });
    mpRef.current = mp;

    initSession()
      .then((prof) => {
        setProfile(prof);
        engine.applySettings(prof.settings);
        engine.enterLobby(prof.loadout);
        mp.connect();
      })
      .catch((err) => {
        setBootError(err instanceof Error ? err.message : 'Unable to connect to game server.');
      });

    return () => {
      mp.disconnect();
      engine.dispose();
      engineRef.current = null;
      mpRef.current = null;
    };
  }, [handleRaceComplete, launchRace]);

  const returnToLobby = () => {
    if (hud?.spectating.liveRoom) {
      mpRef.current?.send('room:leave');
    }
    setTutorialActive(false);
    setRaceResult(null);
    setRewards(null);
    setVaultFlags((f) => ({ ...f, devFlight: false, devInfiniteTurbo: false, devNoCooldowns: false }));
    setScreen('lobby');
    if (profile && engineRef.current) {
      engineRef.current.enterLobby(profile.loadout);
    }
  };

  const handleStartTutorial = async () => {
    if (!profile || !engineRef.current) return;
    engineRef.current.audio.unlock();
    engineRef.current.audio.playUiClick();
    setRaceResult(null);
    setRewards(null);
    setActivePanel('none');
    setTutorialActive(true);
    setScreen('race');
    raceSessionIdRef.current = null;
    startServerRaceSession('training-grounds', 'neon-rush-city')
      .then((sid) => {
        raceSessionIdRef.current = sid;
      })
      .catch(() => {});

    let ghosts = mapGhostsRef.current;
    try {
      ghosts = await fetchMapGhosts('neon-rush-city');
      setSelectedMapId('neon-rush-city');
      setMapGhosts(ghosts);
    } catch {
      // fallback to cached ghosts
    }
    const resolved = resolveGhostForSelection(ghostSelectionRef.current, ghosts);
    engineRef.current.startTutorial(profile.loadout, profile.username, {
      ghostSelection: resolved.selection,
      ghostRun: resolved.ghostRun,
    });
  };

  const handleSelectGhostInRace = (sel: GhostSelection) => {
    setGhostSelection(sel);
    const resolved = resolveGhostForSelection(sel, mapGhostsRef.current);
    engineRef.current?.setActiveGhost(resolved.selection, resolved.ghostRun);
  };

  const handleSaveLoadout = async (next: PlayerLoadout) => {
    const updated = await saveLoadout(next);
    setProfile(updated);
    engineRef.current?.updateLobbyPreview(updated.loadout);
  };

  const handlePurchase = async (itemId: string) => {
    const updated = await purchaseShopItem(itemId);
    setProfile(updated);
    engineRef.current?.audio.playPurchase();
  };

  const handleSaveSettings = async (next: PlayerSettings) => {
    const updated = await saveSettings(next);
    setProfile(updated);
    engineRef.current?.applySettings(updated.settings);
  };

  const handleSaveControls = async (payload: {
    controls: ControlBindings;
    gamepad: GamepadBindings;
    savedSchemes: ControlSchemePreset[];
  }) => {
    const updated = await saveControls(payload);
    setProfile(updated);
    engineRef.current?.applySettings(updated.settings);
  };

  const handleToggleVaultFlag = (key: keyof VaultRuntimeFlags) => {
    setVaultFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      engineRef.current?.setVaultOptions({
        devFlight: next.devFlight,
        devInfiniteTurbo: next.devInfiniteTurbo,
        devNoCooldowns: next.devNoCooldowns,
      });
      return next;
    });
  };

  const handleSelectMode = (id: GameModeId) => {
    setSelectedModeId(id);
    const modeDef = GAME_MODES.find((m) => m.id === id);
    if (modeDef && !modeDef.rankedAllowed) {
      setRankedMatch(false);
    }
  };

  const handleClaimMission = useCallback(async (id: string) => {
    const updated = await claimMission(id);
    setProfile(updated);
    engineRef.current?.audio.playPurchase();
  }, []);

  const levelInfo = profile ? getLevelFromXp(profile.xp) : { level: 1 };
  const rankInfo = profile ? getRankForMmr(profile.mmr) : { name: 'Bronze', color: '#CD7F32' };
  const claimableMissionCount = profile
    ? [...getActiveDailyMissions(profile.dailyMissionIds), ...WEEKLY_MISSIONS].filter((m) => {
        const st = profile.missions[m.id];
        return st && !st.claimed && st.progress >= m.target;
      }).length
    : 0;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080B12]">
      {/* Dedicated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Loading / Error State */}
      {!profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B12]">
          <div className="text-center space-y-3 px-6 max-w-md">
            <h1 className="font-display text-3xl font-bold text-white tracking-wide">SPEEDSTARS ROYALE</h1>
            <p className="text-sm text-slate-400">
              {bootError ? bootError : 'Connecting to Speedstars Arena...'}
            </p>
            {bootError && (
              <button
                onClick={() => {
                  setBootError(null);
                  initSession()
                    .then((prof) => {
                      setProfile(prof);
                      engineRef.current?.applySettings(prof.settings);
                      engineRef.current?.enterLobby(prof.loadout);
                      mpRef.current?.connect();
                    })
                    .catch((err) => {
                      setBootError(err instanceof Error ? err.message : 'Unable to connect to game server.');
                    });
                }}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lobby UI Overlay */}
      {profile && screen === 'lobby' && (
        <>
          {/* 3-Zone Top Navigation Bar */}
          <header className="fixed top-0 inset-x-0 z-30 h-16 px-4 md:px-8 flex items-center justify-between gap-8 bg-[#0B111E]/92 border-b border-white/10">
            {/* Zone 1: Brand Title */}
            <button
              onClick={() => {
                engineRef.current?.audio.playUiClick();
                setActivePanel('none');
              }}
              className="font-display text-lg md:text-xl font-bold tracking-wider text-white whitespace-nowrap shrink-0"
            >
              SPEEDSTARS ROYALE
            </button>

            {/* Zone 2: Concise Nav Links */}
            <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-slate-300">
              {(
                [
                  ['none', 'Play'],
                  ['speedstars', 'Speedstars'],
                  ['maps', 'Maps'],
                  ['ranked', 'Ranked'],
                  ['shop', 'Shop'],
                  ['garage', 'Garage'],
                  ['profile', 'Profile'],
                  ['settings', 'Settings'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    engineRef.current?.audio.playUiClick();
                    setActivePanel(key);
                  }}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    activePanel === key
                      ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold'
                      : 'hover:text-white'
                  }`}
                >
                  <span>{label}</span>
                  {key === 'profile' && claimableMissionCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold leading-tight">
                      {claimableMissionCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Zone 3: Primary Action, Owner's Vault & Player Credits */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2.5 text-xs font-mono-tabular">
                <span className="text-slate-400">Lv.{levelInfo.level}</span>
                <span className="text-slate-600">·</span>
                <span style={{ color: rankInfo.color }}>{rankInfo.name}</span>
                <span className="text-slate-600">·</span>
                <span className="text-amber-400 font-bold">{profile.speedCredits.toLocaleString()} SC</span>
              </div>
              <button
                onClick={() => {
                  engineRef.current?.audio.playUiClick();
                  setVaultOpen(true);
                }}
                title="Owner's Vault"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  profile.vaultUnlocked
                    ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 hover:bg-violet-500/30'
                    : 'bg-slate-900 border-white/15 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {profile.vaultUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">Vault</span>
              </button>
              <button
                onClick={() =>
                  launchRace({
                    modeId: selectedModeId,
                    mapId: selectedMapId,
                    ranked: rankedMatch,
                    fillBots: true,
                  })
                }
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
              >
                Race Now
              </button>
            </div>
          </header>

          {/* Mobile Compact Nav Row */}
          <div className="lg:hidden fixed top-16 inset-x-0 z-20 flex items-center gap-1.5 px-3 py-2 bg-[#0B111E]/90 border-b border-white/10 overflow-x-auto custom-scroll">
            {(
              [
                ['none', 'Play'],
                ['speedstars', 'Speedstars'],
                ['maps', 'Maps'],
                ['ranked', 'Ranked'],
                ['shop', 'Shop'],
                ['garage', 'Garage'],
                ['profile', 'Profile'],
                ['settings', 'Settings'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActivePanel(key)}
                className={`px-2.5 py-1 rounded text-xs whitespace-nowrap shrink-0 ${
                  activePanel === key ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Interactive Lobby Hint & Daily Missions Widget when Showcase is unobstructed */}
          {activePanel === 'none' && (
            <>
              <div className="pointer-events-none fixed top-20 left-6 z-10 hidden md:block">
                <div className="text-xs text-slate-400">
                  Drag 3D Showcase to rotate · <span className="text-slate-200">{profile.username}</span>
                </div>
              </div>
              <DailyMissionsWidget profile={profile} onClaimMission={handleClaimMission} />
            </>
          )}

          {/* Bottom Play & Multiplayer Dock */}
          {activePanel === 'none' && (
            <PlayLobbyDock
              profile={profile}
              selectedModeId={selectedModeId}
              selectedMapId={selectedMapId}
              rankedMode={rankedMatch}
              ghostSelection={ghostSelection}
              personalBestGhost={mapGhosts.personalBest}
              globalTopGhost={mapGhosts.globalTop}
              room={room}
              wsConnected={wsConnected}
              localClientId={localClientId}
              mpError={mpError}
              onSelectMode={handleSelectMode}
              onSelectMap={setSelectedMapId}
              onToggleRanked={setRankedMatch}
              onSelectGhost={setGhostSelection}
              onPreviewAnim={(anim) => engineRef.current?.setLobbyPreviewAnim(anim)}
              onStartLocalRace={() =>
                launchRace({
                  modeId: selectedModeId,
                  mapId: selectedMapId,
                  ranked: rankedMatch,
                  fillBots: true,
                })
              }
              onStartTutorial={handleStartTutorial}
              onQuickMatch={() =>
                mpRef.current?.send('room:quickmatch', {
                  modeId: selectedModeId,
                  mapId: selectedMapId,
                  ranked: rankedMatch,
                  speedstarId: profile.loadout.speedstarId,
                })
              }
              onCreateRoom={() =>
                mpRef.current?.send('room:create', {
                  modeId: selectedModeId,
                  mapId: selectedMapId,
                  ranked: rankedMatch,
                  fillBots: true,
                  speedstarId: profile.loadout.speedstarId,
                })
              }
              onJoinRoom={(code) =>
                mpRef.current?.send('room:join', {
                  roomCode: code,
                  speedstarId: profile.loadout.speedstarId,
                })
              }
              onSpectateRoom={(code) => mpRef.current?.send('room:spectate', { roomCode: code })}
              onLeaveRoom={() => mpRef.current?.send('room:leave')}
              onToggleReady={(ready) =>
                mpRef.current?.send('room:ready', { ready, speedstarId: profile.loadout.speedstarId })
              }
              onVoteMap={(mapId) => mpRef.current?.send('room:vote', { mapId })}
              onToggleRoomBots={(fillBots) => mpRef.current?.send('room:toggle-bots', { fillBots })}
              onStartRoom={() => mpRef.current?.send('room:start')}
            />
          )}

          <AnimatePresence>
            {activePanel === 'speedstars' && (
              <RosterPanel
                key="roster-panel"
                profile={profile}
                onPreviewSpeedstar={(id) =>
                  engineRef.current?.updateLobbyPreview({ ...profile.loadout, speedstarId: id })
                }
                onSelectSpeedstar={(id) => handleSaveLoadout({ ...profile.loadout, speedstarId: id })}
                onUnlockSpeedstar={handlePurchase}
                onClose={() => {
                  engineRef.current?.updateLobbyPreview(profile.loadout);
                  setActivePanel('none');
                }}
              />
            )}
          </AnimatePresence>

          {activePanel === 'maps' && (
            <MapsPanel
              selectedMapId={selectedMapId}
              personalBests={profile.personalBests}
              onSelectMap={setSelectedMapId}
              onClose={() => setActivePanel('none')}
            />
          )}

          {activePanel === 'ranked' && (
            <RankedPanel
              profile={profile}
              onStartRanked={() => {
                setSelectedModeId('royale-race');
                setRankedMatch(true);
                launchRace({
                  modeId: 'royale-race',
                  mapId: selectedMapId,
                  ranked: true,
                  fillBots: true,
                });
              }}
              onClose={() => setActivePanel('none')}
            />
          )}

          {activePanel === 'shop' && (
            <ShopPanel
              profile={profile}
              onPurchase={handlePurchase}
              onClose={() => setActivePanel('none')}
            />
          )}

          {activePanel === 'garage' && (
            <GaragePanel
              profile={profile}
              onSaveLoadout={handleSaveLoadout}
              onClose={() => setActivePanel('none')}
            />
          )}

          {(activePanel === 'profile' || activePanel === 'settings') && (
            <ProfileAndSettingsPanel
              profile={profile}
              initialTab={activePanel === 'settings' ? 'settings' : 'profile'}
              onRename={async (name) => {
                const updated = await renamePlayer(name);
                setProfile(updated);
              }}
              onClaimMission={handleClaimMission}
              onClaimAchievement={async (id) => {
                const updated = await claimAchievement(id);
                setProfile(updated);
                engineRef.current?.audio.playPurchase();
              }}
              onSaveSettings={handleSaveSettings}
              onSaveControls={handleSaveControls}
              onClose={() => setActivePanel('none')}
            />
          )}
        </>
      )}

      {/* Active Race Gameplay HUD or Spectator Broadcast HUD */}
      {profile && screen === 'race' && hud && engineRef.current && (
        hud.spectating.active ? (
          <SpectatorHud
            hud={hud}
            bindings={profile.settings.controls || DEFAULT_KEYBOARD_BINDINGS}
            canReturnToResults={Boolean(raceResult)}
            onPrevTarget={() => engineRef.current?.cycleSpectateTarget(-1)}
            onNextTarget={() => engineRef.current?.cycleSpectateTarget(1)}
            onSelectTarget={(racerId) => engineRef.current?.setSpectateTarget(racerId)}
            onSetCamMode={(mode) => engineRef.current?.setSpectatorCamMode(mode)}
            onRestartReplay={() => engineRef.current?.restartReplay()}
            onToggleReplayPlay={() => engineRef.current?.toggleReplayPlay()}
            onSeekReplay={(t) => engineRef.current?.seekReplay(t)}
            onSetReplaySpeed={(spd) => engineRef.current?.setReplaySpeed(spd)}
            onPlayAgain={() =>
              launchRace({
                modeId: selectedModeId,
                mapId: selectedMapId,
                ranked: rankedMatch,
                fillBots: true,
                stage: championshipStage,
              })
            }
            onLeaveSpectate={() => {
              if (raceResult && !hud.spectating.liveRoom) {
                engineRef.current?.exitPostRaceSpectate();
              } else {
                returnToLobby();
              }
            }}
            onExitToLobby={returnToLobby}
          />
        ) : (
          <>
            <GameplayHud
              hud={hud}
              controller={engineRef.current.controller}
              bindings={profile.settings.controls || DEFAULT_KEYBOARD_BINDINGS}
              touchControls={profile.settings.touchControls}
              hasVehicle={Boolean(profile.loadout.vehicleId)}
              hasGadget={Boolean(profile.loadout.gadgetId)}
              debugMode={vaultFlags.debugMode}
              vaultUnlocked={profile.vaultUnlocked}
              hasPersonalGhost={Boolean(mapGhosts.personalBest)}
              hasGlobalGhost={Boolean(mapGhosts.globalTop)}
              onSelectGhost={handleSelectGhostInRace}
              onOpenVault={() => setVaultOpen(true)}
              onSpectateNext={() => engineRef.current?.enterPostRaceSpectate()}
              onFinishTraining={() => engineRef.current?.finishTraining()}
              onQuitToLobby={returnToLobby}
            />
            {tutorialActive && (
              <TutorialOverlay
                hud={hud}
                bindings={profile.settings.controls || DEFAULT_KEYBOARD_BINDINGS}
                onStepComplete={() => engineRef.current?.audio.playTutorialStep()}
                onCompleteTutorial={() => {
                  setTutorialActive(false);
                  engineRef.current?.finishTraining();
                }}
                onSkipTutorial={returnToLobby}
              />
            )}
          </>
        )
      )}

      {/* Post-Race Results & Podium Screen */}
      {screen === 'race' && raceResult && !hud?.spectating.active && (
        <ResultsOverlay
          result={raceResult}
          rewards={rewards}
          championshipStage={championshipStage}
          onClaimMission={handleClaimMission}
          onPlayAgain={() =>
            launchRace({
              modeId: selectedModeId,
              mapId: selectedMapId,
              ranked: rankedMatch,
              fillBots: true,
              stage: 1,
            })
          }
          onNextStage={() => {
            const nextMap = MAPS[(MAPS.findIndex((m) => m.id === selectedMapId) + 1) % MAPS.length];
            setSelectedMapId(nextMap.id);
            launchRace({
              modeId: 'championship',
              mapId: nextMap.id,
              ranked: rankedMatch,
              fillBots: true,
              stage: championshipStage + 1,
            });
          }}
          onSpectate={() => {
            engineRef.current?.enterPostRaceSpectate();
          }}
          onReturnLobby={returnToLobby}
        />
      )}

      {/* Owner's Vault — Secret Developer Zone */}
      {profile && vaultOpen && (
        <OwnersVaultModal
          profile={profile}
          inRace={screen === 'race'}
          flags={vaultFlags}
          onUnlockPasscode={async (code) => {
            const updated = await unlockVault(code);
            setProfile(updated);
            engineRef.current?.audio.playPurchase();
          }}
          onVaultAction={async (action) => {
            const updated = await runVaultAction(action);
            setProfile(updated);
            engineRef.current?.audio.playPurchase();
          }}
          onToggleFlag={handleToggleVaultFlag}
          onEquipZeroPoint={async () => {
            const others = profile.loadout.abilityIds.filter((id) => id !== 'zero-point').slice(0, 2);
            const nextLoadout = { ...profile.loadout, abilityIds: ['zero-point', ...others] };
            await handleSaveLoadout(nextLoadout);
            engineRef.current?.movement.abilitySys.configure(nextLoadout.abilityIds, false);
          }}
          onTriggerZeroPoint={() => engineRef.current?.triggerZeroPointNow()}
          onTeleportMap={(mapId) => {
            setSelectedMapId(mapId);
            if (screen === 'race') {
              engineRef.current?.teleportMap(mapId);
            } else {
              launchRace({
                modeId: 'training-grounds',
                mapId,
                ranked: false,
                fillBots: false,
              });
            }
          }}
          onTeleportProgress={(pct) => engineRef.current?.teleportToProgress(pct)}
          onSpawnItems={() => engineRef.current?.spawnVaultCollectibles()}
          onClose={() => setVaultOpen(false)}
        />
      )}
    </div>
  );
}
