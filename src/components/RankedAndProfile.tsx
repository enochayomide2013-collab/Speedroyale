import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Clock, Flame, Medal, Settings, Trophy, User } from 'lucide-react';
import {
  ACHIEVEMENTS,
  DAILY_SWEEP_BONUS_SC,
  MAPS,
  RANK_TIERS,
  WEEKLY_MISSIONS,
  getActiveDailyMissions,
  getLevelFromXp,
  getMissionResetCountdown,
  getRankForMmr,
} from '../shared/gameData';
import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  type ControlBindings,
  type ControlSchemePreset,
  type GamepadBindings,
  type LeaderboardEntry,
  type MapRecordEntry,
  type PlayerProfile,
  type PlayerSettings,
} from '../shared/types';
import { fetchLeaderboards } from '../services/api';

interface RankedPanelProps {
  profile: PlayerProfile;
  onStartRanked: () => void;
  onClose: () => void;
}

export const RankedPanel: React.FC<RankedPanelProps> = ({ profile, onStartRanked, onClose }) => {
  const [rankedTop, setRankedTop] = useState<LeaderboardEntry[]>([]);
  const [mapRecords, setMapRecords] = useState<Record<string, MapRecordEntry[]>>({});
  const [selectedMap, setSelectedMap] = useState(MAPS[0].id);
  const [onlineInfo, setOnlineInfo] = useState({ onlineCount: 1, activeRooms: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboards()
      .then((res) => {
        setRankedTop(res.rankedTop);
        setMapRecords(res.mapRecords);
        setOnlineInfo({ onlineCount: res.onlineCount, activeRooms: res.activeRooms });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentRank = getRankForMmr(profile.mmr);
  const nextRank = RANK_TIERS.find((r) => r.minMmr > profile.mmr);
  const records = mapRecords[selectedMap] || [];

  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">Ranked Arena & Leaderboards</h2>
            <p className="text-xs text-slate-400">
              Fair competitive matchmaking · {onlineInfo.onlineCount} Players Connected · {onlineInfo.activeRooms} Active Rooms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onClose();
              onStartRanked();
            }}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
          >
            Queue Ranked Match
          </button>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-6">
        {/* Rank Tiers Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {RANK_TIERS.map((tier) => {
            const active = currentRank.id === tier.id;
            return (
              <div
                key={tier.id}
                className={`rounded-xl border p-3.5 ${
                  active ? 'bg-cyan-500/15 border-cyan-400/60' : 'bg-[#121A2B] border-white/10'
                }`}
              >
                <div className="text-xs font-bold" style={{ color: tier.color }}>
                  {tier.name}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-300 mt-1">{tier.minMmr}+ MMR</div>
                <div className="text-[11px] text-slate-400 mt-1">Season: {(tier.seasonRewardSc / 1000).toFixed(0)}k SC</div>
              </div>
            );
          })}
        </div>

        {/* Player Rank Summary */}
        <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Your Competitive Standing</div>
            <div className="font-display text-2xl font-bold text-white mt-0.5">
              <span style={{ color: currentRank.color }}>{currentRank.name}</span> ·{' '}
              <span className="font-mono-tabular">{profile.mmr} MMR</span>
            </div>
          </div>
          <div className="text-xs text-slate-300 font-mono-tabular">
            Ranked Matches: {profile.rankedRaces} · Total Wins: {profile.wins} ·{' '}
            {nextRank ? `${nextRank.minMmr - profile.mmr} MMR to ${nextRank.name}` : 'Highest Tier Reached'}
          </div>
        </div>

        {/* Leaderboards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
              <Medal className="w-4 h-4 text-amber-400" />
              <span>Global Ranked Leaderboard</span>
            </div>
            {loading ? (
              <div className="text-xs text-slate-400 py-6">Loading rankings...</div>
            ) : (
              <div className="space-y-1.5">
                {rankedTop.map((r, idx) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                      r.playerId === profile.id ? 'bg-cyan-500/15 text-white font-semibold' : 'bg-slate-900/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 font-mono-tabular text-amber-400">#{idx + 1}</span>
                      <span>{r.username}</span>
                    </div>
                    <div className="font-mono-tabular text-slate-300">
                      {r.mmr} MMR · {r.wins}W
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-bold text-white">Track Time Attack Records</span>
              <select
                value={selectedMap}
                onChange={(e) => setSelectedMap(e.target.value)}
                className="bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-slate-200"
              >
                {MAPS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            {records.length === 0 ? (
              <div className="text-xs text-slate-400 py-6">
                No official lap records yet for this world. Set the first record!
              </div>
            ) : (
              <div className="space-y-1.5">
                {records.map((rec, idx) => (
                  <div
                    key={`${rec.playerId}-${idx}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/50 text-xs text-slate-300"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 font-mono-tabular text-cyan-400">#{idx + 1}</span>
                      <span>{rec.username}</span>
                    </div>
                    <span className="font-mono-tabular text-amber-400 font-semibold">{rec.timeSec.toFixed(2)}s</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ProfileAndSettingsProps {
  profile: PlayerProfile;
  initialTab?: 'profile' | 'settings';
  onRename: (name: string) => Promise<void>;
  onClaimMission: (id: string) => Promise<void>;
  onClaimAchievement: (id: string) => Promise<void>;
  onSaveSettings: (s: PlayerSettings) => Promise<void>;
  onSaveControls: (payload: {
    controls: ControlBindings;
    gamepad: GamepadBindings;
    savedSchemes: ControlSchemePreset[];
  }) => Promise<void>;
  onClose: () => void;
}

const KEY_LABELS: [keyof ControlBindings, string][] = [
  ['forward', 'Move Forward'],
  ['backward', 'Move Backward'],
  ['steerLeft', 'Steer Left'],
  ['steerRight', 'Steer Right'],
  ['sprint', 'Sprint'],
  ['jump', 'Jump / Double Jump'],
  ['slide', 'Slide / Crouch'],
  ['turbo', 'Activate Turbo'],
  ['ability', 'Primary Ability'],
  ['airDash', 'Air Dash'],
  ['gadget', 'Arcade Gadget'],
  ['vehicle', 'Mount / Dismount Vehicle'],
  ['respawn', 'Checkpoint Respawn'],
  ['emote', 'Emote'],
];

const GAMEPAD_LABELS: [keyof GamepadBindings, string][] = [
  ['jump', 'Jump'],
  ['slide', 'Slide'],
  ['turbo', 'Turbo'],
  ['ability', 'Ability'],
  ['airDash', 'Air Dash'],
  ['gadget', 'Gadget'],
  ['vehicle', 'Vehicle'],
  ['respawn', 'Respawn'],
];

const GP_BTN_NAMES: Record<number, string> = {
  0: 'A / Cross',
  1: 'B / Circle',
  2: 'X / Square',
  3: 'Y / Triangle',
  4: 'LB / L1',
  5: 'RB / R1',
  6: 'LT / L2',
  7: 'RT / R2',
  8: 'Back / Select',
  9: 'Start / Options',
  10: 'L3 Stick',
  11: 'R3 Stick',
};

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export const ProfileAndSettingsPanel: React.FC<ProfileAndSettingsProps> = ({
  profile,
  initialTab = 'profile',
  onRename,
  onClaimMission,
  onClaimAchievement,
  onSaveSettings,
  onSaveControls,
  onClose,
}) => {
  const [tab, setTab] = useState<'profile' | 'settings'>(initialTab);
  const [callsign, setCallsign] = useState(profile.username);
  const [renameFeedback, setRenameFeedback] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlayerSettings>(profile.settings);
  const [controls, setControls] = useState<ControlBindings>(
    profile.settings.controls || { ...DEFAULT_KEYBOARD_BINDINGS }
  );
  const [gamepad, setGamepad] = useState<GamepadBindings>(
    profile.settings.gamepad || { ...DEFAULT_GAMEPAD_BINDINGS }
  );
  const [savedSchemes, setSavedSchemes] = useState<ControlSchemePreset[]>(
    profile.settings.savedSchemes || []
  );
  const [listeningKey, setListeningKey] = useState<keyof ControlBindings | null>(null);
  const [listeningGp, setListeningGp] = useState<keyof GamepadBindings | null>(null);
  const [schemeName, setSchemeName] = useState('');
  const [ctrlFeedback, setCtrlFeedback] = useState<string | null>(null);

  const lvl = getLevelFromXp(profile.xp);
  const rank = getRankForMmr(profile.mmr);

  const updateSetting = <K extends keyof PlayerSettings>(key: K, val: PlayerSettings[K]) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    onSaveSettings(next);
  };

  useEffect(() => {
    if (!listeningKey) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningKey(null);
        return;
      }
      const next = { ...controls };
      const prevCode = next[listeningKey];
      for (const k of Object.keys(next) as (keyof ControlBindings)[]) {
        if (k !== listeningKey && next[k] === e.code) {
          next[k] = prevCode;
        }
      }
      next[listeningKey] = e.code;
      setControls(next);
      setListeningKey(null);
      onSaveControls({ controls: next, gamepad, savedSchemes }).catch(() => {});
      setCtrlFeedback(`Bound ${listeningKey} to ${formatKeyCode(e.code)}`);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listeningKey, controls, gamepad, savedSchemes, onSaveControls]);

  useEffect(() => {
    if (!listeningGp) return;
    let raf = 0;
    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads ? Array.from(pads).find((p): p is Gamepad => Boolean(p && p.connected)) : undefined;
      if (gp) {
        const idx = gp.buttons.findIndex((b) => b.pressed);
        if (idx >= 0) {
          const nextGp = { ...gamepad };
          const prevBtn = nextGp[listeningGp];
          for (const k of Object.keys(nextGp) as (keyof GamepadBindings)[]) {
            if (k !== listeningGp && nextGp[k] === idx) {
              nextGp[k] = prevBtn;
            }
          }
          nextGp[listeningGp] = idx;
          setGamepad(nextGp);
          setListeningGp(null);
          onSaveControls({ controls, gamepad: nextGp, savedSchemes }).catch(() => {});
          setCtrlFeedback(`Bound controller ${listeningGp} to Button ${idx}`);
          return;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [listeningGp, controls, gamepad, savedSchemes, onSaveControls]);

  const applyPreset = async (preset: 'wasd' | 'arrows' | 'reset') => {
    const nextKb: ControlBindings =
      preset === 'arrows'
        ? {
            ...DEFAULT_KEYBOARD_BINDINGS,
            forward: 'ArrowUp',
            backward: 'ArrowDown',
            steerLeft: 'ArrowLeft',
            steerRight: 'ArrowRight',
          }
        : { ...DEFAULT_KEYBOARD_BINDINGS };
    const nextGp = preset === 'reset' ? { ...DEFAULT_GAMEPAD_BINDINGS } : gamepad;
    setControls(nextKb);
    setGamepad(nextGp);
    await onSaveControls({ controls: nextKb, gamepad: nextGp, savedSchemes });
    setCtrlFeedback(preset === 'arrows' ? 'Applied Arrow Keys preset' : 'Restored default controls');
  };

  const handleSaveScheme = async () => {
    const name = schemeName.trim() || `Custom ${savedSchemes.length + 1}`;
    const filtered = savedSchemes.filter((s) => s.name !== name);
    const nextSchemes = [{ name, keyboard: controls, gamepad }, ...filtered].slice(0, 6);
    setSavedSchemes(nextSchemes);
    setSchemeName('');
    await onSaveControls({ controls, gamepad, savedSchemes: nextSchemes });
    setCtrlFeedback(`Saved scheme "${name}"`);
  };

  const handleLoadScheme = async (scheme: ControlSchemePreset) => {
    setControls(scheme.keyboard);
    setGamepad(scheme.gamepad);
    await onSaveControls({ controls: scheme.keyboard, gamepad: scheme.gamepad, savedSchemes });
    setCtrlFeedback(`Loaded scheme "${scheme.name}"`);
  };

  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-5xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTab('profile')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'profile' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile & Missions</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'settings' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings & Controls</span>
          </button>
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-6">
        {tab === 'profile' ? (
          <div className="space-y-6">
            {/* Identity & Level Card */}
            <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <input
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    maxLength={18}
                    className="bg-slate-900 border border-white/15 rounded-lg px-3 py-1.5 text-sm font-bold text-white w-48"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await onRename(callsign);
                        setRenameFeedback('Callsign updated');
                      } catch (err) {
                        setRenameFeedback(err instanceof Error ? err.message : 'Rename failed');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                  >
                    Save Name
                  </button>
                  {renameFeedback && <span className="text-xs text-cyan-400">{renameFeedback}</span>}
                </div>
                <div className="text-xs text-slate-400 mt-2 font-mono-tabular">
                  Level {lvl.level} · {lvl.currentXp} / {lvl.nextLevelXp} XP · Rank{' '}
                  <span style={{ color: rank.color }}>{rank.name}</span> ({profile.mmr} MMR)
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs font-mono-tabular">
                <div>
                  <div className="text-slate-400">Races</div>
                  <div className="text-lg font-bold text-white">{profile.racesCompleted}</div>
                </div>
                <div>
                  <div className="text-slate-400">Wins</div>
                  <div className="text-lg font-bold text-amber-400">{profile.wins}</div>
                </div>
                <div>
                  <div className="text-slate-400">Stars</div>
                  <div className="text-lg font-bold text-cyan-400">{profile.starsCollected}</div>
                </div>
                <div>
                  <div className="text-slate-400">Unlocked</div>
                  <div className="text-lg font-bold text-emerald-400">{profile.unlockedIds.length}</div>
                </div>
              </div>
            </div>

            {/* Daily & Weekly Missions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5 space-y-4">
                {(() => {
                  const activeDaily = getActiveDailyMissions(profile.dailyMissionIds);
                  const claimedDailyCount = activeDaily.filter((m) => profile.missions[m.id]?.claimed).length;
                  const sweepClaimed =
                    Boolean(profile.dailySweepClaimedDate) &&
                    profile.dailySweepClaimedDate === profile.dailyMissionDate;
                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-amber-400" />
                          <h3 className="font-display text-base font-bold text-white">Today&apos;s Daily Missions</h3>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] font-mono-tabular text-cyan-300">
                          <Clock className="w-3 h-3" />
                          Resets in {getMissionResetCountdown()}
                        </span>
                      </div>

                      <div className="bg-slate-900/90 border border-amber-400/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-amber-300">
                            Daily Sweep Bonus ({claimedDailyCount}/3 Claimed)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Claim all 3 daily tasks to earn +{DAILY_SWEEP_BONUS_SC.toLocaleString()} bonus SC
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-mono-tabular font-bold shrink-0 ${
                            sweepClaimed ? 'text-emerald-400' : 'text-amber-300'
                          }`}
                        >
                          {sweepClaimed ? 'Awarded' : `+${DAILY_SWEEP_BONUS_SC.toLocaleString()} SC`}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {activeDaily.map((m) => {
                          const st = profile.missions[m.id] || { progress: 0, claimed: false };
                          const clamped = Math.min(st.progress, m.target);
                          const pct = Math.min(100, Math.round((clamped / m.target) * 100));
                          const done = st.progress >= m.target;
                          return (
                            <div
                              key={m.id}
                              className={`border rounded-lg p-3 space-y-2 ${
                                st.claimed
                                  ? 'bg-emerald-950/20 border-emerald-500/25'
                                  : done
                                  ? 'bg-amber-500/10 border-amber-400/40'
                                  : 'bg-slate-900/70 border-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white">{m.title}</div>
                                  <div className="text-[11px] text-slate-400">{m.description}</div>
                                </div>
                                {st.claimed ? (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Claimed
                                  </span>
                                ) : done ? (
                                  <button
                                    onClick={() => onClaimMission(m.id)}
                                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0"
                                  >
                                    Claim
                                  </button>
                                ) : (
                                  <span className="text-xs font-mono-tabular text-slate-400 shrink-0">
                                    {clamped}/{m.target}
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    st.claimed ? 'bg-emerald-400' : done ? 'bg-amber-400' : 'bg-cyan-400'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono-tabular text-cyan-300">
                                <span>
                                  {clamped} / {m.target}
                                </span>
                                <span className="text-amber-300">
                                  +{m.rewardSc.toLocaleString()} SC · +{m.rewardXp} XP
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-white/10">
                        <h4 className="font-display text-sm font-bold text-slate-200 mb-2.5">Weekly Missions</h4>
                        <div className="space-y-2">
                          {WEEKLY_MISSIONS.map((m) => {
                            const st = profile.missions[m.id] || { progress: 0, claimed: false };
                            const clamped = Math.min(st.progress, m.target);
                            const done = st.progress >= m.target;
                            return (
                              <div
                                key={m.id}
                                className="bg-slate-900/70 border border-white/10 rounded-lg p-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white">{m.title}</div>
                                  <div className="text-[11px] text-slate-400">{m.description}</div>
                                  <div className="text-[11px] font-mono-tabular text-cyan-300 mt-1">
                                    {clamped} / {m.target} · +{m.rewardSc.toLocaleString()} SC
                                  </div>
                                </div>
                                {st.claimed ? (
                                  <span className="text-xs font-semibold text-emerald-400 shrink-0">Claimed</span>
                                ) : done ? (
                                  <button
                                    onClick={() => onClaimMission(m.id)}
                                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0"
                                  >
                                    Claim
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-500 shrink-0">In Progress</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Achievements */}
              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-amber-400" />
                  <h3 className="font-display text-base font-bold text-white">Achievements & Badges</h3>
                </div>
                <div className="space-y-2.5">
                  {ACHIEVEMENTS.map((a) => {
                    const claimed = profile.claimedAchievements.includes(a.id);
                    const val =
                      a.metric === 'races'
                        ? profile.racesCompleted
                        : a.metric === 'wins'
                        ? profile.wins
                        : a.metric === 'stars'
                        ? profile.starsCollected
                        : a.metric === 'level'
                        ? lvl.level
                        : profile.unlockedIds.length;
                    const done = val >= a.target;
                    return (
                      <div key={a.id} className="bg-slate-900/70 border border-white/10 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white">{a.title}</div>
                          <div className="text-[11px] text-slate-400">{a.description}</div>
                          <div className="text-[11px] font-mono-tabular text-amber-300 mt-1">
                            Badge: {a.badgeTitle} · +{a.rewardSc.toLocaleString()} SC
                          </div>
                        </div>
                        {claimed ? (
                          <span className="text-xs font-semibold text-emerald-400 shrink-0">Unlocked</span>
                        ) : done ? (
                          <button
                            onClick={() => onClaimAchievement(a.id)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shrink-0"
                          >
                            Claim
                          </button>
                        ) : (
                          <span className="text-xs font-mono-tabular text-slate-400 shrink-0">
                            {Math.min(val, a.target)}/{a.target}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="font-display text-base font-bold text-white">Graphics & Camera</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Render Quality Preset</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => updateSetting('quality', q)}
                      className={`py-2 rounded-lg text-xs font-semibold capitalize ${
                        settings.quality === q ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer pt-2">
                <span>Dynamic Speed FOV Boost</span>
                <input
                  type="checkbox"
                  checked={settings.cameraFovBoost}
                  onChange={(e) => updateSetting('cameraFovBoost', e.target.checked)}
                  className="accent-cyan-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>Auto-Sprint (Shift to toggle if off)</span>
                <input
                  type="checkbox"
                  checked={settings.autoSprint}
                  onChange={(e) => updateSetting('autoSprint', e.target.checked)}
                  className="accent-cyan-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                <span>On-Screen Touch Controls</span>
                <input
                  type="checkbox"
                  checked={settings.touchControls}
                  onChange={(e) => updateSetting('touchControls', e.target.checked)}
                  className="accent-cyan-500 w-4 h-4"
                />
              </label>
            </div>

            <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="font-display text-base font-bold text-white">Audio Mix</h3>
              {(
                [
                  ['Master Volume', 'masterVolume'],
                  ['Sound Effects', 'sfxVolume'],
                  ['Adaptive Music', 'musicVolume'],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono-tabular text-cyan-400">{Math.round(settings[key] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings[key]}
                    onChange={(e) => updateSetting(key, Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              ))}
            </div>

            {/* Customizable Keyboard & Controller Controls */}
            <div className="md:col-span-2 bg-[#121A2B] border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    Customizable Controls &amp; Keybinds
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click any binding to rebind Keyboard keys or Controller buttons. Save and load custom schemes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => applyPreset('wasd')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                  >
                    WASD Preset
                  </button>
                  <button
                    onClick={() => applyPreset('arrows')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                  >
                    Arrow Keys Preset
                  </button>
                  <button
                    onClick={() => applyPreset('reset')}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 text-xs font-semibold text-rose-200"
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>

              {ctrlFeedback && (
                <div className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-lg px-3 py-1.5">
                  {ctrlFeedback}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Keyboard Bindings */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Keyboard Actions
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {KEY_LABELS.map(([key, label]) => {
                      const listening = listeningKey === key;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setListeningGp(null);
                            setListeningKey(listening ? null : key);
                          }}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                            listening
                              ? 'bg-cyan-500/20 border-cyan-400 text-white'
                              : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <span>{label}</span>
                          <span className="font-mono-tabular font-bold text-cyan-300">
                            {listening ? 'Press key...' : formatKeyCode(controls[key])}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Gamepad Bindings & Saved Schemes */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Controller / Gamepad Buttons
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {GAMEPAD_LABELS.map(([key, label]) => {
                        const listening = listeningGp === key;
                        const btnIdx = gamepad[key];
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              setListeningKey(null);
                              setListeningGp(listening ? null : key);
                            }}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                              listening
                                ? 'bg-amber-500/20 border-amber-400 text-white'
                                : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <span>{label}</span>
                            <span className="font-mono-tabular font-bold text-amber-300">
                              {listening ? 'Press button...' : GP_BTN_NAMES[btnIdx] || `Btn ${btnIdx}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Save & Load Custom Schemes */}
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Save &amp; Load Custom Schemes
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={schemeName}
                        onChange={(e) => setSchemeName(e.target.value)}
                        placeholder="Scheme name (e.g. Claw Pro)"
                        maxLength={24}
                        className="flex-1 bg-slate-900 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        onClick={handleSaveScheme}
                        className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                      >
                        Save Scheme
                      </button>
                    </div>
                    {savedSchemes.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {savedSchemes.map((sch) => (
                          <div
                            key={sch.name}
                            className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs"
                          >
                            <button
                              onClick={() => handleLoadScheme(sch)}
                              className="text-cyan-300 hover:text-white font-semibold"
                            >
                              Load {sch.name}
                            </button>
                            <button
                              onClick={() => {
                                const next = savedSchemes.filter((s) => s.name !== sch.name);
                                setSavedSchemes(next);
                                onSaveControls({ controls, gamepad, savedSchemes: next }).catch(() => {});
                              }}
                              className="text-slate-500 hover:text-rose-400 ml-1"
                              title="Delete scheme"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
