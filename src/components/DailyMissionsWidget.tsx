import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Flame } from 'lucide-react';
import {
  DAILY_SWEEP_BONUS_SC,
  getActiveDailyMissions,
  getMissionResetCountdown,
} from '../shared/gameData';
import type { PlayerProfile } from '../shared/types';

interface DailyMissionsWidgetProps {
  profile: PlayerProfile;
  onClaimMission: (missionId: string) => Promise<void>;
}

export const DailyMissionsWidget: React.FC<DailyMissionsWidgetProps> = ({
  profile,
  onClaimMission,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const dailyMissions = getActiveDailyMissions(profile.dailyMissionIds);
  const readyCount = dailyMissions.filter((m) => {
    const st = profile.missions[m.id];
    return st && !st.claimed && st.progress >= m.target;
  }).length;
  const claimedCount = dailyMissions.filter((m) => profile.missions[m.id]?.claimed).length;
  const sweepClaimed =
    Boolean(profile.dailySweepClaimedDate) &&
    profile.dailySweepClaimedDate === profile.dailyMissionDate;

  const handleClaim = async (id: string) => {
    if (claimingId) return;
    setClaimingId(id);
    try {
      await onClaimMission(id);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="fixed top-28 left-4 md:left-6 z-10 w-[min(296px,calc(100vw-2rem))] bg-[#0B111E]/92 border border-white/12 rounded-xl shadow-2xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-display text-xs font-bold text-white tracking-wide truncate">
            Daily Missions
          </span>
          <span className="text-[11px] font-mono-tabular text-slate-400">
            {claimedCount}/3
          </span>
          {readyCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
              {readyCount} Ready
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
            <span className="flex items-center gap-1 text-cyan-300">
              <Clock className="w-3 h-3" />
              Reset in {getMissionResetCountdown()}
            </span>
            <span className={sweepClaimed ? 'text-emerald-400 font-semibold' : 'text-amber-300'}>
              {sweepClaimed ? 'Sweep Claimed' : `3/3: +${(DAILY_SWEEP_BONUS_SC / 1000).toFixed(0)}k SC`}
            </span>
          </div>

          <div className="space-y-1.5">
            {dailyMissions.map((m) => {
              const st = profile.missions[m.id] || { progress: 0, claimed: false };
              const clamped = Math.min(st.progress, m.target);
              const pct = Math.min(100, Math.round((clamped / m.target) * 100));
              const done = st.progress >= m.target;
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${
                    st.claimed
                      ? 'bg-emerald-950/20 border-emerald-500/20'
                      : done
                      ? 'bg-amber-500/10 border-amber-400/40'
                      : 'bg-slate-900/75 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate">{m.description}</div>
                      <div className="text-[10px] font-mono-tabular text-amber-300">
                        +{m.rewardSc.toLocaleString()} SC
                      </div>
                    </div>
                    {st.claimed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : done ? (
                      <button
                        disabled={claimingId === m.id}
                        onClick={() => handleClaim(m.id)}
                        className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-[10px] font-bold shrink-0"
                      >
                        {claimingId === m.id ? '...' : 'Claim'}
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono-tabular text-slate-300 shrink-0">
                        {clamped}/{m.target}
                      </span>
                    )}
                  </div>
                  <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        st.claimed ? 'bg-emerald-400' : done ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
