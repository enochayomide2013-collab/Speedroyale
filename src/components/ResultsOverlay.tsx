import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, RotateCcw, Eye, ArrowLeft, Award, Sparkles, Star, Flame, CheckCircle2 } from 'lucide-react';
import type { RaceCompletePayload } from '../engine/GameEngine';
import type { RaceRewardResult } from '../shared/types';
import { MAPS, GAME_MODES, MISSIONS, SPEEDSTARS, getSpeedstarMasteryRank } from '../shared/gameData';

interface ResultsOverlayProps {
  result: RaceCompletePayload;
  rewards: RaceRewardResult | null;
  championshipStage: number;
  onClaimMission?: (missionId: string) => Promise<void>;
  onPlayAgain: () => void;
  onNextStage: () => void;
  onSpectate: () => void;
  onReturnLobby: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const ResultsOverlay: React.FC<ResultsOverlayProps> = ({
  result,
  rewards,
  championshipStage,
  onClaimMission,
  onPlayAgain,
  onNextStage,
  onSpectate,
  onReturnLobby,
}) => {
  const [claimedInOverlay, setClaimedInOverlay] = useState<string[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const mapName = MAPS.find((m) => m.id === result.mapId)?.name ?? result.mapId;
  const modeName = GAME_MODES.find((m) => m.id === result.modeId)?.name ?? result.modeId;
  const podium = result.standings.slice(0, 3);
  const isChampionshipNext = result.modeId === 'championship' && championshipStage < 3;

  const activeStarId = rewards?.profile.loadout.speedstarId ?? result.standings.find((s) => s.isHuman)?.speedstarId ?? 'vortex';
  const activeStar = SPEEDSTARS.find((s) => s.id === activeStarId) ?? SPEEDSTARS[0];
  const masteryEntry = rewards?.profile.speedstarMastery?.[activeStarId] ?? { xp: 0, races: 1, wins: result.placement === 1 ? 1 : 0 };
  const masteryRank = getSpeedstarMasteryRank(masteryEntry.xp);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="w-full max-w-4xl bg-[#0D1322] border border-white/12 rounded-2xl p-6 md:p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-xs text-cyan-400 font-medium">
              {modeName} · {mapName}
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mt-1">
              {result.eliminated
                ? 'Eliminated'
                : result.placement === 1
                ? '1st Place — Champion!'
                : `Finished #${result.placement} of ${result.totalRacers}`}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Official Time</div>
            <div className="font-display text-2xl font-bold text-amber-400 font-mono-tabular">
              {formatTime(result.finishTimeSec)}
            </div>
            {rewards?.newPersonalBest && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 360, damping: 20 }}
                className="text-xs text-emerald-400 font-semibold mt-0.5"
              >
                New Personal Record!
              </motion.div>
            )}
          </div>
        </div>

        {/* Rewards Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.25, ease: EASE_OUT }}
            className="bg-[#131B2E] border border-amber-400/25 rounded-xl p-4"
          >
            <div className="text-xs text-slate-400">Round Completion Reward</div>
            <div className="font-display text-2xl font-bold text-amber-400 font-mono-tabular mt-1">
              +{rewards ? rewards.roundCompletionSc.toLocaleString() : '5,000'} SC
            </div>
            <div className="text-xs text-slate-400 mt-1">Guaranteed per completed round</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.25, ease: EASE_OUT }}
            className="bg-[#131B2E] border border-white/10 rounded-xl p-4"
          >
            <div className="text-xs text-slate-400">Total SpeedCredits Earned</div>
            <div className="font-display text-2xl font-bold text-cyan-400 font-mono-tabular mt-1">
              +{rewards ? rewards.totalScEarned.toLocaleString() : '5,000'} SC
            </div>
            {rewards && (
              <div className="text-xs text-slate-400 mt-1 font-mono-tabular">
                Place +{rewards.placementBonusSc} · Stars +{rewards.starBonusSc}
                {rewards.firstWinBonusSc > 0 ? ` · First Win +${rewards.firstWinBonusSc}` : ''}
                {rewards.masteryBonusSc > 0 ? ` · Mastery +${rewards.masteryBonusSc}` : ''}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.25, ease: EASE_OUT }}
            className="bg-[#131B2E] border border-white/10 rounded-xl p-4"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{activeStar.name} Mastery</span>
              <span className="font-semibold" style={{ color: masteryRank.color }}>
                {masteryRank.name}
              </span>
            </div>
            <div className="font-display text-xl font-bold text-white font-mono-tabular mt-1 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 shrink-0" />
              <span>+{rewards ? rewards.masteryEarnedXp : 150} Mastery XP</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${masteryRank.progressPct}%` }}
                transition={{ delay: 0.28, duration: 0.55, ease: EASE_OUT }}
                className="h-full rounded-full"
                style={{ backgroundColor: masteryRank.color }}
              />
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono-tabular flex items-center justify-between">
              <span>
                {masteryRank.nextMinXp
                  ? `${masteryEntry.xp} / ${masteryRank.nextMinXp} XP`
                  : `${masteryEntry.xp} XP (MAX)`}
              </span>
              {rewards && rewards.mmrDelta !== 0 && (
                <span className={rewards.mmrDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  MMR {rewards.mmrDelta > 0 ? `+${rewards.mmrDelta}` : rewards.mmrDelta}
                </span>
              )}
            </div>
          </motion.div>
        </div>

        {rewards?.masteryTierUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 320, damping: 22 }}
            className="mb-5 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/45 text-xs"
          >
            <div className="flex items-center gap-2 text-amber-200 font-semibold">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {activeStar.name} reached {rewards.masteryTierUp.newTierName} Mastery!
              </span>
            </div>
            <span className="font-mono-tabular font-bold text-amber-300">
              +{rewards.masteryTierUp.bonusSc.toLocaleString()} Bonus SC
            </span>
          </motion.div>
        )}

        {rewards?.newlyCompletedMissions && rewards.newlyCompletedMissions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.25, ease: EASE_OUT }}
            className="mb-5 space-y-2"
          >
            {rewards.newlyCompletedMissions.map((mId) => {
              const def = MISSIONS.find((m) => m.id === mId);
              if (!def) return null;
              const isClaimed = claimedInOverlay.includes(mId);
              return (
                <div
                  key={mId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-cyan-500/12 border border-cyan-400/35 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-semibold text-white">
                      {def.period === 'daily' ? 'Daily Mission Complete:' : 'Weekly Mission Complete:'}
                    </span>
                    <span className="text-cyan-200 truncate">
                      {def.title} ({def.description})
                    </span>
                  </div>
                  {isClaimed ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-semibold shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Claimed +{def.rewardSc.toLocaleString()} SC
                    </span>
                  ) : onClaimMission ? (
                    <button
                      disabled={claimingId === mId}
                      onClick={async () => {
                        setClaimingId(mId);
                        try {
                          await onClaimMission(mId);
                          setClaimedInOverlay((prev) => [...prev, mId]);
                        } finally {
                          setClaimingId(null);
                        }
                      }}
                      className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold shrink-0"
                    >
                      {claimingId === mId ? 'Claiming...' : `Claim +${def.rewardSc.toLocaleString()} SC`}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Podium + Standings */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="md:col-span-2 bg-[#131B2E] border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Race Podium</span>
            </div>
            <div className="space-y-2.5">
              {podium.map((p, idx) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.16 + idx * 0.08, duration: 0.24, ease: EASE_OUT }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                    p.isHuman
                      ? 'bg-cyan-500/15 border-cyan-400/40'
                      : 'bg-slate-900/60 border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-display text-lg font-bold text-amber-400 w-5 font-mono-tabular">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-slate-400 capitalize">{p.speedstarId.replace('-', ' ')}</div>
                    </div>
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-300">
                    {p.finishTimeSec ? formatTime(p.finishTimeSec) : `${Math.round(p.progress * 100)}%`}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 bg-[#131B2E] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between text-sm font-semibold text-white mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-cyan-400" />
                <span>Full Classification</span>
              </div>
              {result.teamScores && (
                <span className="text-xs font-mono-tabular text-cyan-300">
                  Team Cyan {result.teamScores.cyan} vs Amber {result.teamScores.amber}
                </span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto custom-scroll space-y-1.5 pr-1">
              {result.standings.map((s, idx) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-3 py-1.5 rounded text-xs ${
                    s.isHuman ? 'bg-cyan-500/15 text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 font-mono-tabular text-slate-400">#{idx + 1}</span>
                    <span>{s.name}</span>
                    {s.eliminated && <span className="text-rose-400">(Eliminated)</span>}
                  </div>
                  <div className="font-mono-tabular">
                    {result.modeId === 'star-collector'
                      ? `${s.starsCollected} Stars`
                      : s.finishTimeSec
                      ? formatTime(s.finishTimeSec)
                      : `${Math.round(s.progress * 100)}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 mt-6 pt-4 border-t border-white/10">
          <button
            onClick={onSpectate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Eye className="w-4 h-4" />
            <span>Spectate &amp; Replay</span>
          </button>
          <button
            onClick={onReturnLobby}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Lobby</span>
          </button>
          {isChampionshipNext ? (
            <button
              onClick={onNextStage}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <span>Advance to Stage {championshipStage + 1}</span>
            </button>
          ) : (
            <button
              onClick={onPlayAgain}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
