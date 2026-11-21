import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Check, Lock, MapPin, Search, Sparkles, Star, Users, X } from 'lucide-react';
import { MAPS, type MapDef } from '../shared/gameData';
import {
  SPEEDSTARS,
  getSpeedstarMasteryRank,
  type SpeedstarDef,
  type SpeedstarRarity,
} from '../shared/rosterData';
import type { PlayerProfile } from '../shared/types';
import { TrackBlueprint } from './TrackBlueprint';

const RARITY_STYLES: Record<SpeedstarRarity, { text: string; bg: string; border: string }> = {
  Common: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-400/35' },
  Rare: { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-sky-400/35' },
  Epic: { text: 'text-violet-300', bg: 'bg-violet-500/15', border: 'border-violet-400/35' },
  Legendary: { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-400/40' },
};

const RARITY_OPTIONS: Array<'All' | SpeedstarRarity> = ['All', 'Common', 'Rare', 'Epic', 'Legendary'];

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

interface RosterPanelProps {
  profile: PlayerProfile;
  onSelectSpeedstar: (id: string) => void;
  onUnlockSpeedstar: (id: string) => Promise<void>;
  onPreviewSpeedstar: (id: string) => void;
  onClose: () => void;
}

type SortKey = 'default' | 'speed' | 'acceleration' | 'agility' | 'turbo' | 'price-asc' | 'price-desc';

export const RosterPanel: React.FC<RosterPanelProps> = ({
  profile,
  onSelectSpeedstar,
  onUnlockSpeedstar,
  onPreviewSpeedstar,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'free' | 'unlockable' | 'owned'>('all');
  const [rarityFilter, setRarityFilter] = useState<'All' | SpeedstarRarity>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<SpeedstarDef>(
    () => SPEEDSTARS.find((s) => s.id === profile.loadout.speedstarId) ?? SPEEDSTARS[0]
  );
  const [busy, setBusy] = useState(false);
  const [justUnlockedId, setJustUnlockedId] = useState<string | null>(null);

  useEffect(() => {
    if (!justUnlockedId) return;
    const timer = window.setTimeout(() => setJustUnlockedId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [justUnlockedId]);

  const unlocked = useMemo(() => new Set(profile.unlockedIds), [profile.unlockedIds]);
  const list = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = SPEEDSTARS.filter((s) => {
      if (filter === 'free' && s.price !== 0) return false;
      if (filter === 'unlockable' && s.price === 0) return false;
      if (filter === 'owned' && !unlocked.has(s.id)) return false;
      if (rarityFilter !== 'All' && s.rarity !== rarityFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.title} ${s.signatureAbilityName} ${s.personality}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortBy === 'default') return filtered;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === 'speed') return b.stats.speed - a.stats.speed;
      if (sortBy === 'acceleration') return b.stats.acceleration - a.stats.acceleration;
      if (sortBy === 'agility') return b.stats.agility - a.stats.agility;
      if (sortBy === 'turbo') return b.stats.turbo - a.stats.turbo;
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      return 0;
    });
    return sorted;
  }, [filter, rarityFilter, searchQuery, sortBy, unlocked]);

  const isOwned = unlocked.has(inspected.id);
  const isStarter = inspected.price === 0;
  const isEquipped = profile.loadout.speedstarId === inspected.id;
  const inspectedRarity = RARITY_STYLES[inspected.rarity];
  const showUnlockCelebration = justUnlockedId === inspected.id;
  const inspectedMastery = profile.speedstarMastery?.[inspected.id] ?? { xp: 0, races: 0, wins: 0 };
  const inspectedMasteryRank = getSpeedstarMasteryRank(inspectedMastery.xp);
  const compareTarget = compareId ? SPEEDSTARS.find((s) => s.id === compareId) ?? null : null;

  const handleInspect = (s: SpeedstarDef) => {
    setInspected(s);
    onPreviewSpeedstar(s.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.985 }}
      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
      className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">30 Speedstars Roster</h2>
            <p className="text-xs text-slate-400">
              12 Common Free Starters · 18 Permanent SC Unlocks (Rare, Epic, Legendary) · Balanced competitive stats
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ['all', 'All 30'],
              ['free', '12 Free'],
              ['unlockable', '18 Unlockable'],
              ['owned', 'Owned'],
            ] as const
          ).map(([key, label]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active ? 'text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="roster-availability-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-cyan-500"
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
          <button
            onClick={onClose}
            className="ml-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="px-6 py-2.5 border-b border-white/8 bg-[#0D1424] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Rarity</span>
          {RARITY_OPTIONS.map((tier) => {
            const active = rarityFilter === tier;
            const style = tier === 'All' ? null : RARITY_STYLES[tier];
            return (
              <button
                key={tier}
                onClick={() => setRarityFilter(tier)}
                className={`relative px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? style
                      ? `${style.text} ${style.border}`
                      : 'text-cyan-300 border-cyan-400/40'
                    : 'bg-slate-900/70 text-slate-400 border-white/8 hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="roster-rarity-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className={`absolute inset-0 rounded-md ${style ? style.bg : 'bg-cyan-500/20'}`}
                  />
                )}
                <span className="relative z-10">{tier === 'All' ? 'All Tiers' : tier}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Speedstar or ability..."
              className="w-48 bg-slate-900 border border-white/12 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-slate-900 border border-white/12 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-400/60"
          >
            <option value="default">Sort: Default</option>
            <option value="speed">Sort: Top Speed</option>
            <option value="acceleration">Sort: Acceleration</option>
            <option value="agility">Sort: Agility</option>
            <option value="turbo">Sort: Turbo</option>
            <option value="price-asc">Sort: Price Low–High</option>
            <option value="price-desc">Sort: Price High–Low</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3">
        {/* Roster Grid */}
        <div className="lg:col-span-2 overflow-y-auto custom-scroll p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
          <AnimatePresence mode="popLayout">
            {list.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-slate-400">
                No Speedstars match your current filter or search query.
              </div>
            ) : (
              list.map((s) => {
                const owned = unlocked.has(s.id);
                const selected = inspected.id === s.id;
                const equipped = profile.loadout.speedstarId === s.id;
                const isCompared = compareId === s.id;
                const rStyle = RARITY_STYLES[s.rarity];
                const unlockedNow = justUnlockedId === s.id;
                const sMastery = profile.speedstarMastery?.[s.id];
                const sRank = sMastery && sMastery.xp > 0 ? getSpeedstarMasteryRank(sMastery.xp) : null;
                return (
                  <motion.button
                    layout
                    key={s.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                    onClick={() => handleInspect(s)}
                    className={`relative text-left p-3 rounded-xl border transition-colors ${
                      selected
                        ? 'border-cyan-400/70 shadow-lg shadow-cyan-500/10'
                        : isCompared
                        ? 'bg-[#121A2B] border-violet-400/50'
                        : 'bg-[#121A2B] border-white/10 hover:border-white/25'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="roster-card-highlight"
                        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                        className="absolute inset-0 rounded-xl bg-cyan-500/12 pointer-events-none"
                      />
                    )}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.primaryColor }} />
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${rStyle.bg} ${rStyle.text} ${rStyle.border}`}>
                            {s.rarity}
                          </span>
                        </div>
                        <AnimatePresence mode="wait" initial={false}>
                          {equipped ? (
                            <motion.span
                              key="active"
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              transition={{ duration: 0.15 }}
                              className="text-[11px] font-semibold text-cyan-400 shrink-0"
                            >
                              Active
                            </motion.span>
                          ) : s.price === 0 ? (
                            <span key="free" className="text-[11px] font-semibold text-emerald-400 shrink-0">
                              Free
                            </span>
                          ) : owned ? (
                            <motion.span
                              key="owned"
                              initial={unlockedNow ? { opacity: 0, scale: 1.25 } : false}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 shrink-0"
                            >
                              <Check className="w-3 h-3" /> Unlocked
                            </motion.span>
                          ) : (
                            <span key="locked" className="flex items-center gap-1 text-[11px] font-mono-tabular text-amber-400 shrink-0">
                              <Lock className="w-3 h-3" /> {(s.price / 1000).toFixed(0)}k SC
                            </span>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="flex items-center justify-between gap-1.5 mt-2">
                        <div className="text-sm font-bold text-white truncate">{s.name}</div>
                        {sRank && (
                          <span className="text-[10px] font-semibold shrink-0" style={{ color: sRank.color }}>
                            {sRank.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{s.title}</div>
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
                        <span>SPD {s.stats.speed}</span>
                        <span>ACC {s.stats.acceleration}</span>
                        <span>TRB {s.stats.turbo}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Character Inspector */}
        <div className="relative border-t lg:border-t-0 lg:border-l border-white/10 p-6 bg-[#0F1627] flex flex-col justify-between overflow-y-auto custom-scroll">
          {/* Dynamic Speedstar Accent Bar */}
          <motion.div
            animate={{ backgroundColor: inspected.primaryColor }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute inset-x-0 top-0 h-1 opacity-85"
          />

          <div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={inspected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${inspectedRarity.bg} ${inspectedRarity.text} ${inspectedRarity.border}`}>
                      {inspected.rarity}
                    </span>
                    <span className="truncate">{inspected.archetype}</span>
                  </div>
                  <span className={`font-semibold shrink-0 ${isStarter ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isStarter ? 'Free Starter' : `${inspected.price.toLocaleString()} SC`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-2xl font-bold text-white mt-1.5">{inspected.name}</h3>
                  <button
                    onClick={() => setCompareId((prev) => (prev === inspected.id ? null : inspected.id))}
                    className={`mt-1.5 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors shrink-0 ${
                      compareId === inspected.id
                        ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                        : 'bg-slate-900 border-white/12 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>{compareId === inspected.id ? 'Pinned' : 'Compare'}</span>
                  </button>
                </div>
                <div className="text-xs font-medium text-cyan-400">
                  {inspected.title} · <span className="capitalize text-slate-300">{inspected.turboVisual.replace('-', ' ')} Turbo</span>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{inspected.personality}</p>

                {/* Speedstar Mastery Progress */}
                <div className="mt-3 p-2.5 rounded-lg bg-slate-900/70 border border-white/8 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Star className="w-3 h-3 text-amber-400" /> Mastery Rank
                    </span>
                    <span className="font-semibold" style={{ color: inspectedMasteryRank.color }}>
                      {inspectedMasteryRank.name} · {inspectedMastery.races} Races / {inspectedMastery.wins} Wins
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1.5">
                    <motion.div
                      initial={false}
                      animate={{ width: `${inspectedMasteryRank.progressPct}%` }}
                      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: inspectedMasteryRank.color }}
                    />
                  </div>
                </div>

                <div className="mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-white/8 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">Signature Ability</span>
                    <span className="text-[11px] font-semibold text-cyan-300">{inspected.signatureAbilityName}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{inspected.signatureAbilityDescription}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {compareTarget && compareTarget.id !== inspected.id && (
              <div className="mt-3 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-violet-500/12 border border-violet-400/35 text-[11px] text-violet-200">
                <span>
                  Comparing vs <strong>{compareTarget.name}</strong> ({compareTarget.price === 0 ? 'Free' : `${(compareTarget.price / 1000).toFixed(0)}k SC`})
                </span>
                <button
                  onClick={() => setCompareId(null)}
                  className="text-violet-300 hover:text-white"
                  title="Clear comparison"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {(
                [
                  ['Speed', inspected.stats.speed, compareTarget?.stats.speed],
                  ['Acceleration', inspected.stats.acceleration, compareTarget?.stats.acceleration],
                  ['Agility', inspected.stats.agility, compareTarget?.stats.agility],
                  ['Turbo', inspected.stats.turbo, compareTarget?.stats.turbo],
                  ['Ability', inspected.stats.abilityPower, compareTarget?.stats.abilityPower],
                  ['Handling', inspected.stats.handling, compareTarget?.stats.handling],
                  ['Air Control', inspected.stats.airControl, compareTarget?.stats.airControl],
                  ['Momentum', inspected.stats.momentum, compareTarget?.stats.momentum],
                ] as const
              ).map(([label, val, cmpVal]) => {
                const delta = cmpVal !== undefined && compareTarget?.id !== inspected.id ? val - cmpVal : null;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">{label}</span>
                      <div className="flex items-center gap-1 font-mono-tabular">
                        {delta !== null && delta !== 0 && (
                          <span className={delta > 0 ? 'text-emerald-400 text-[10px]' : 'text-rose-400 text-[10px]'}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                        <motion.span
                          key={`${inspected.id}-${label}`}
                          initial={{ opacity: 0.45, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-white font-semibold"
                        >
                          {val}
                        </motion.span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={false}
                        animate={{ width: `${val}%`, backgroundColor: inspected.primaryColor }}
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
            <AnimatePresence>
              {showUnlockCelebration && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-xs font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{inspected.name} Permanently Unlocked!</span>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-[11px] text-slate-400 text-center">
              {isStarter
                ? 'Starter Speedstar — switch freely anytime without paying SC.'
                : isOwned
                ? 'Permanently unlocked on your account — equip anytime for free.'
                : `Balance: ${profile.speedCredits.toLocaleString()} SC · Permanent account unlock.`}
            </p>

            <AnimatePresence mode="wait" initial={false}>
              {isEquipped ? (
                <motion.div
                  key={`equipped-${inspected.id}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  className="w-full py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-center text-xs font-bold text-cyan-300"
                >
                  Currently Selected
                </motion.div>
              ) : isOwned ? (
                <motion.button
                  key={`equip-${inspected.id}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  onClick={() => onSelectSpeedstar(inspected.id)}
                  className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
                >
                  Equip {inspected.name} (Free)
                </motion.button>
              ) : (
                <motion.button
                  key={`unlock-${inspected.id}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={busy || profile.speedCredits < inspected.price ? undefined : { scale: 1.015 }}
                  whileTap={busy || profile.speedCredits < inspected.price ? undefined : { scale: 0.985 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  disabled={busy || profile.speedCredits < inspected.price}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onUnlockSpeedstar(inspected.id);
                      setJustUnlockedId(inspected.id);
                      onSelectSpeedstar(inspected.id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-slate-950 text-xs font-bold transition-colors"
                >
                  {busy
                    ? 'Unlocking...'
                    : profile.speedCredits < inspected.price
                    ? `Need ${(inspected.price - profile.speedCredits).toLocaleString()} more SC`
                    : `Unlock Permanently for ${inspected.price.toLocaleString()} SC`}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface MapsPanelProps {
  selectedMapId: string;
  personalBests: Record<string, number>;
  onSelectMap: (mapId: string) => void;
  onClose: () => void;
}

export const MapsPanel: React.FC<MapsPanelProps> = ({
  selectedMapId,
  personalBests,
  onSelectMap,
  onClose,
}) => {
  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">12 Worlds & Circuits</h2>
            <p className="text-xs text-slate-400">Select a destination map for Solo, AI, or Custom Lobby races</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {MAPS.map((m: MapDef) => {
          const active = m.id === selectedMapId;
          const pb = personalBests[m.id];
          return (
            <button
              key={m.id}
              onClick={() => {
                onSelectMap(m.id);
                onClose();
              }}
              className={`text-left rounded-xl border p-4 transition-colors flex flex-col justify-between gap-3 ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/60'
                  : 'bg-[#121A2B] border-white/10 hover:border-white/25'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>World {String(m.index).padStart(2, '0')} · {m.difficulty}</span>
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: m.accentColor }} />
                </div>
                <div className="flex items-start justify-between gap-2 mt-1">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold text-white">{m.name}</h3>
                    <div className="text-xs text-cyan-300">{m.subtitle}</div>
                  </div>
                  <div className="rounded-lg bg-slate-950/70 border border-white/8 p-1 shrink-0">
                    <TrackBlueprint map={m} size={44} />
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{m.description}</p>
              </div>
              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[180px]">{m.mechanics.slice(0, 2).join(' · ')}</span>
                <span className="font-mono-tabular text-amber-400 shrink-0">
                  {pb ? `PB ${pb.toFixed(2)}s` : 'No PB'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
