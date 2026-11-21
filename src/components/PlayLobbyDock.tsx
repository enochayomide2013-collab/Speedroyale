import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Ghost, GraduationCap, Play, RefreshCw, Users, Globe } from 'lucide-react';
import { GAME_MODES, MAPS, SPEEDSTARS, getSpeedstarMasteryRank, type GameModeId } from '../shared/gameData';
import type {
  GhostRunRecord,
  GhostSelection,
  LiveRoomSummary,
  MultiplayerRoomState,
  PlayerProfile,
} from '../shared/types';
import { fetchLiveRooms } from '../services/api';
import { TrackBlueprint } from './TrackBlueprint';

interface PlayLobbyDockProps {
  profile: PlayerProfile;
  selectedModeId: GameModeId;
  selectedMapId: string;
  rankedMode: boolean;
  ghostSelection: GhostSelection;
  personalBestGhost: GhostRunRecord | null;
  globalTopGhost: GhostRunRecord | null;
  room: MultiplayerRoomState | null;
  wsConnected: boolean;
  localClientId: string | null;
  mpError: string | null;
  onSelectMode: (id: GameModeId) => void;
  onSelectMap: (id: string) => void;
  onToggleRanked: (v: boolean) => void;
  onSelectGhost: (sel: GhostSelection) => void;
  onPreviewAnim: (anim: 'idle' | 'sprint' | 'turbo' | 'victory') => void;
  onStartLocalRace: () => void;
  onStartTutorial: () => void;
  onQuickMatch: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSpectateRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onVoteMap: (mapId: string) => void;
  onToggleRoomBots: (fill: boolean) => void;
  onStartRoom: () => void;
}

export const PlayLobbyDock: React.FC<PlayLobbyDockProps> = ({
  profile,
  selectedModeId,
  selectedMapId,
  rankedMode,
  ghostSelection,
  personalBestGhost,
  globalTopGhost,
  room,
  wsConnected,
  localClientId,
  mpError,
  onSelectMode,
  onSelectMap,
  onToggleRanked,
  onSelectGhost,
  onPreviewAnim,
  onStartLocalRace,
  onStartTutorial,
  onQuickMatch,
  onCreateRoom,
  onJoinRoom,
  onSpectateRoom,
  onLeaveRoom,
  onToggleReady,
  onVoteMap,
  onToggleRoomBots,
  onStartRoom,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [showMpDrawer, setShowMpDrawer] = useState(false);
  const [liveRooms, setLiveRooms] = useState<LiveRoomSummary[]>([]);

  const loadLiveRooms = () => {
    fetchLiveRooms()
      .then((res) => setLiveRooms(res.rooms || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (showMpDrawer) {
      loadLiveRooms();
    }
  }, [showMpDrawer]);

  const mode = GAME_MODES.find((m) => m.id === selectedModeId) ?? GAME_MODES[0];
  const map = MAPS.find((m) => m.id === selectedMapId) ?? MAPS[0];
  const activeStar = SPEEDSTARS.find((s) => s.id === profile.loadout.speedstarId) ?? SPEEDSTARS[0];
  const masteryEntry = profile.speedstarMastery?.[activeStar.id] ?? { xp: 0, races: 0, wins: 0 };
  const masteryRank = getSpeedstarMasteryRank(masteryEntry.xp);
  const mapPb = profile.personalBests?.[map.id];

  const myMember = room?.members.find((m) => m.clientId === localClientId);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(960px,95vw)] flex flex-col items-center pointer-events-none">
      {/* Animation Preview & Collapse Pill Bar */}
      <div className="pointer-events-auto flex items-center gap-2 mb-2 bg-[#0B111E]/90 border border-white/12 rounded-xl px-3 py-1.5">
        <span className="text-xs font-semibold text-white">{activeStar.name}</span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-white/10 bg-slate-900/90"
          style={{ color: masteryRank.color }}
        >
          {masteryRank.name}
        </span>
        <span className="text-slate-600">·</span>
        {(['idle', 'sprint', 'turbo', 'victory'] as const).map((anim) => (
          <button
            key={anim}
            onClick={() => onPreviewAnim(anim)}
            className="px-2 py-0.5 rounded text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 capitalize whitespace-nowrap shrink-0"
          >
            {anim}
          </button>
        ))}
        <span className="text-slate-600">|</span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? 'Show Dock' : 'Hide Dock'}</span>
        </button>
      </div>

      {!collapsed && (
        <div className="pointer-events-auto w-full bg-[#0B111E]/92 border border-white/12 rounded-2xl p-4 shadow-2xl space-y-3">
          {/* Active Room View when connected to a Multiplayer Lobby */}
          {room ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-cyan-400 font-semibold">
                    Multiplayer Room {room.roomCode} · {room.ranked ? 'Ranked' : 'Unranked'}
                  </div>
                  <div className="text-sm font-bold text-white">
                    {GAME_MODES.find((m) => m.id === room.modeId)?.name} on{' '}
                    {MAPS.find((m) => m.id === room.mapId)?.name}
                    {room.status === 'countdown' && ` — Starting in ${room.countdownSec}s`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {myMember?.isHost && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 mr-2">
                      <input
                        type="checkbox"
                        checked={room.fillBots}
                        onChange={(e) => onToggleRoomBots(e.target.checked)}
                        className="accent-cyan-500"
                      />
                      <span>Fill open slots with AI</span>
                    </label>
                  )}
                  <button
                    onClick={() => onToggleReady(!myMember?.ready)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 ${
                      myMember?.ready ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-white hover:bg-slate-700'
                    }`}
                  >
                    {myMember?.ready ? 'Ready' : 'Mark Ready'}
                  </button>
                  {myMember?.isHost && (
                    <button
                      onClick={onStartRoom}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
                    >
                      Launch Race
                    </button>
                  )}
                  <button
                    onClick={onLeaveRoom}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 whitespace-nowrap shrink-0"
                  >
                    Leave
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/70 border border-white/10 rounded-xl p-3">
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Connected Human Players ({room.members.length})
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto custom-scroll">
                    {room.members.map((m) => (
                      <div key={m.clientId} className="flex items-center justify-between text-xs">
                        <span className="text-white">
                          {m.username} {m.isHost ? '(Host)' : ''} · <span className="text-slate-400 capitalize">{m.speedstarId}</span>
                        </span>
                        <span className={m.ready ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {m.ready ? 'Ready' : 'Waiting'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/70 border border-white/10 rounded-xl p-3">
                  <div className="text-xs font-semibold text-slate-300 mb-2">Map Vote</div>
                  <div className="flex flex-wrap gap-1.5">
                    {MAPS.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onVoteMap(m.id)}
                        className={`px-2.5 py-1 rounded text-[11px] ${
                          myMember?.voteMapId === m.id
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {m.name} ({room.mapVotes[m.id] || 0})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Standard Mode & Map Selection Dock */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-4">
                  <label className="block text-[11px] text-slate-400 mb-1">Game Mode (10 Modes)</label>
                  <select
                    value={selectedModeId}
                    onChange={(e) => onSelectMode(e.target.value as GameModeId)}
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  >
                    {GAME_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.maxCompetitors === 1 ? 'Solo' : `${m.maxCompetitors}P`})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4">
                  <label className="block text-[11px] text-slate-400 mb-1">World / Circuit (12 Maps)</label>
                  <select
                    value={selectedMapId}
                    onChange={(e) => onSelectMap(e.target.value)}
                    className="w-full bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  >
                    {MAPS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {String(m.index).padStart(2, '0')}. {m.name} ({m.difficulty})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4 flex flex-wrap items-end justify-end gap-2 pt-3 md:pt-4">
                  <button
                    onClick={onStartTutorial}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-emerald-300 whitespace-nowrap shrink-0"
                    title="Interactive Movement & Ability Tutorial"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Tutorial</span>
                  </button>
                  <button
                    onClick={() => setShowMpDrawer((v) => !v)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
                  >
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Multiplayer</span>
                  </button>
                  <button
                    onClick={onStartLocalRace}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Race</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 pt-2 border-t border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:flex items-center justify-center rounded-lg bg-slate-950/75 border border-white/10 p-1 shrink-0">
                    <TrackBlueprint map={map} size={52} />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-slate-300 font-medium truncate">
                      {map.name} · <span className="text-cyan-300">{map.difficulty}</span>
                      {mapPb ? (
                        <span className="ml-2 font-mono-tabular text-amber-300">PB {mapPb.toFixed(2)}s</span>
                      ) : (
                        <span className="ml-2 text-slate-500">No PB yet</span>
                      )}
                    </div>
                    <div className="truncate">{mode.rulesSummary}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span>{map.mechanics.slice(0, 2).join(' · ')}</span>
                  {mode.rankedAllowed && (
                    <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rankedMode}
                        onChange={(e) => onToggleRanked(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <span>Ranked Match</span>
                    </label>
                  )}
                </div>
              </div>

              {(selectedModeId === 'time-attack' || selectedModeId === 'training-grounds') && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Ghost className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-semibold text-white">Ghost Opponent</span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      Race a semi-transparent hologram record on {map.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => onSelectGhost('off')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                        ghostSelection === 'off'
                          ? 'bg-slate-700 border-white/25 text-white'
                          : 'bg-slate-900/70 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      Off
                    </button>
                    <button
                      disabled={!personalBestGhost}
                      onClick={() => onSelectGhost('personal-best')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        ghostSelection === 'personal-best'
                          ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                          : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-cyan-400/40'
                      }`}
                    >
                      Personal Best{' '}
                      <span className="font-mono-tabular text-[10px] opacity-85">
                        {personalBestGhost ? `(${personalBestGhost.timeSec.toFixed(2)}s)` : '(No Run Yet)'}
                      </span>
                    </button>
                    <button
                      disabled={!globalTopGhost}
                      onClick={() => onSelectGhost('global-top')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        ghostSelection === 'global-top'
                          ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                          : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-amber-400/40'
                      }`}
                    >
                      Global Top{' '}
                      <span className="font-mono-tabular text-[10px] opacity-85">
                        {globalTopGhost
                          ? `(${globalTopGhost.username} · ${globalTopGhost.timeSec.toFixed(2)}s)`
                          : '(Unavailable)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {showMpDrawer && (
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      <span>{wsConnected ? 'Live Server Connected' : 'Connecting to Multiplayer...'}</span>
                      {mpError && <span className="text-rose-400">· {mpError}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={!wsConnected}
                        onClick={onQuickMatch}
                        className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/30 disabled:opacity-40 text-xs font-semibold text-cyan-300 whitespace-nowrap shrink-0"
                      >
                        Quick Match
                      </button>
                      <button
                        disabled={!wsConnected}
                        onClick={onCreateRoom}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 disabled:opacity-40 text-xs font-semibold text-amber-300 whitespace-nowrap shrink-0"
                      >
                        Create Lobby
                      </button>
                      <div className="flex items-center gap-1">
                        <input
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="ROOM CODE"
                          maxLength={6}
                          className="w-24 bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular text-white"
                        />
                        <button
                          disabled={!wsConnected || joinCode.length < 4}
                          onClick={() => onJoinRoom(joinCode)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                        >
                          Join
                        </button>
                        <button
                          disabled={!wsConnected || joinCode.length < 4}
                          onClick={() => onSpectateRoom(joinCode)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-400/40 hover:bg-violet-500/30 disabled:opacity-40 text-xs font-semibold text-violet-200 whitespace-nowrap shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Spectate</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Ongoing Races Browser for Spectator Mode */}
                  <div className="bg-slate-900/65 border border-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Ongoing Multiplayer Races (Spectate)
                      </span>
                      <button
                        onClick={loadLiveRooms}
                        className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh</span>
                      </button>
                    </div>
                    {liveRooms.length === 0 ? (
                      <div className="text-xs text-slate-400">
                        No live races in progress right now. Create a lobby or enter a Room Code to spectate.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-28 overflow-y-auto custom-scroll">
                        {liveRooms.map((lr) => (
                          <div
                            key={lr.roomCode}
                            className="flex items-center justify-between bg-slate-950/70 border border-white/10 rounded-lg px-3 py-1.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">
                                Room {lr.roomCode} · {GAME_MODES.find((m) => m.id === lr.modeId)?.name}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {MAPS.find((m) => m.id === lr.mapId)?.name} · {lr.memberCount} Racers ·{' '}
                                <span className="capitalize text-cyan-300">{lr.status}</span>
                              </div>
                            </div>
                            <button
                              disabled={!wsConnected}
                              onClick={() => onSpectateRoom(lr.roomCode)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 hover:bg-cyan-500/30 text-[11px] font-semibold text-cyan-200 shrink-0 ml-2"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Watch</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
