import React, { useState } from 'react';
import {
  Activity,
  Compass,
  Coins,
  Feather,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Unlock,
  Zap,
} from 'lucide-react';
import { MAPS } from '../shared/gameData';
import type { PlayerProfile } from '../shared/types';

export interface VaultRuntimeFlags {
  devFlight: boolean;
  devInfiniteTurbo: boolean;
  devNoCooldowns: boolean;
  debugMode: boolean;
}

interface OwnersVaultModalProps {
  profile: PlayerProfile;
  inRace: boolean;
  flags: VaultRuntimeFlags;
  onUnlockPasscode: (passcode: string) => Promise<void>;
  onVaultAction: (action: 'add-sc' | 'unlock-all' | 'reset-economy') => Promise<void>;
  onToggleFlag: (key: keyof VaultRuntimeFlags) => void;
  onEquipZeroPoint: () => Promise<void>;
  onTriggerZeroPoint: () => void;
  onTeleportMap: (mapId: string) => void;
  onTeleportProgress: (pct: number) => void;
  onSpawnItems: () => void;
  onClose: () => void;
}

export const OwnersVaultModal: React.FC<OwnersVaultModalProps> = ({
  profile,
  inRace,
  flags,
  onUnlockPasscode,
  onVaultAction,
  onToggleFlag,
  onEquipZeroPoint,
  onTriggerZeroPoint,
  onTeleportMap,
  onTeleportProgress,
  onSpawnItems,
  onClose,
}) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [teleportMapId, setTeleportMapId] = useState(MAPS[0].id);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlockPasscode(passcode.trim());
      setPasscode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid passcode');
    } finally {
      setBusy(false);
    }
  };

  const runServerAction = async (action: 'add-sc' | 'unlock-all' | 'reset-economy', msg: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await onVaultAction(action);
      setFeedback(msg);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const hasZeroPointEquipped = profile.loadout.abilityIds.includes('zero-point');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#0B111E] border border-violet-400/40 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {profile.vaultUnlocked ? (
              <Unlock className="w-5 h-5 text-violet-400" />
            ) : (
              <Lock className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h2 className="font-display text-xl font-bold text-white">
                Owner&apos;s Vault — Secret Developer Zone
              </h2>
              <p className="text-xs text-slate-400">
                {profile.vaultUnlocked
                  ? 'Authorized Developer Sandbox · ZERO POINT Transcendent Ability Unlocked'
                  : 'Restricted developer console. Enter authorization passcode to unlock.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
          >
            Exit Vault
          </button>
        </div>

        {!profile.vaultUnlocked ? (
          <form onSubmit={handleUnlock} className="p-8 max-w-md mx-auto w-full space-y-4 text-center">
            <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
            <div className="text-sm text-slate-200">
              Enter Owner Passcode to access developer controls and unlock <strong className="text-cyan-300">ZERO POINT</strong>.
            </div>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter Vault Passcode"
              autoFocus
              className="w-full bg-slate-900 border border-white/15 rounded-xl px-4 py-3 text-center text-base font-mono-tabular tracking-widest text-white"
            />
            {error && <div className="text-xs text-rose-400 font-semibold">{error}</div>}
            <button
              type="submit"
              disabled={busy || !passcode.trim()}
              className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white text-sm font-bold"
            >
              {busy ? 'Verifying...' : 'Unlock Owner’s Vault'}
            </button>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-5">
            {feedback && (
              <div className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-xs font-semibold text-emerald-300">
                {feedback}
              </div>
            )}

            {/* ZERO POINT Signature Spotlight */}
            <div className="rounded-2xl border border-violet-400/45 bg-gradient-to-r from-violet-950/70 via-[#111827] to-cyan-950/60 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  <Sparkles className="w-4 h-4 text-violet-300" />
                  <span>Owner&apos;s Vault Exclusive Ability</span>
                </div>
                <h3 className="font-display text-2xl font-bold text-white">ZERO POINT</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Infinite Velocity · Reality Trail cracks · Time Fracture world slowdown · Zero Gravity sky/water/wall
                  running · Instant Momentum · Phantom Echoes · World Pulse &amp; Cosmic Finish.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    await onEquipZeroPoint();
                    setFeedback('ZERO POINT equipped to Slot 1!');
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold ${
                    hasZeroPointEquipped
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  {hasZeroPointEquipped ? 'ZERO POINT Equipped' : 'Equip ZERO POINT'}
                </button>
                {inRace && (
                  <button
                    onClick={() => {
                      onTriggerZeroPoint();
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold"
                  >
                    Activate ZERO POINT Now
                  </button>
                )}
              </div>
            </div>

            {/* Economy & Unlocks */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                  <Coins className="w-4 h-4" />
                  <span>Infinite SpeedCredits</span>
                </div>
                <p className="text-xs text-slate-400">
                  Balance: <strong className="text-white font-mono-tabular">{profile.speedCredits.toLocaleString()} SC</strong>
                </p>
                <button
                  disabled={busy}
                  onClick={() => runServerAction('add-sc', '+10,000,000 SC credited!')}
                  className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  +10,000,000 SC
                </button>
              </div>

              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
                  <Unlock className="w-4 h-4" />
                  <span>Unlock All Items</span>
                </div>
                <p className="text-xs text-slate-400">
                  Unlocked: <strong className="text-white font-mono-tabular">{profile.unlockedIds.length}</strong> items
                </p>
                <button
                  disabled={busy}
                  onClick={() => runServerAction('unlock-all', 'All Speedstars, abilities, vehicles & cosmetics unlocked!')}
                  className="w-full py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                >
                  Unlock Everything
                </button>
              </div>

              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-rose-400">
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Economy</span>
                </div>
                <p className="text-xs text-slate-400">Restore test balance to 25,000 SC &amp; starter loadout.</p>
                <button
                  disabled={busy}
                  onClick={() => runServerAction('reset-economy', 'Economy reset to starter test state.')}
                  className="w-full py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 text-rose-200 text-xs font-bold"
                >
                  Reset Balance &amp; Inventory
                </button>
              </div>
            </div>

            {/* Gameplay Testing Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => onToggleFlag('devInfiniteTurbo')}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  flags.devInfiniteTurbo
                    ? 'bg-amber-500/20 border-amber-400 text-white'
                    : 'bg-[#121A2B] border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Turbo Testing</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {flags.devInfiniteTurbo ? 'ENABLED · 100% Infinite Turbo' : 'Click to enable infinite Turbo'}
                </div>
              </button>

              <button
                onClick={() => onToggleFlag('devNoCooldowns')}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  flags.devNoCooldowns
                    ? 'bg-cyan-500/20 border-cyan-400 text-white'
                    : 'bg-[#121A2B] border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Ability Testing</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {flags.devNoCooldowns ? 'ENABLED · 0s Cooldowns' : 'Click for instant 0s cooldowns'}
                </div>
              </button>

              <button
                onClick={() => onToggleFlag('devFlight')}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  flags.devFlight
                    ? 'bg-violet-500/20 border-violet-400 text-white'
                    : 'bg-[#121A2B] border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Feather className="w-4 h-4 text-violet-400" />
                  <span>Developer Flight</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {flags.devFlight ? 'ENABLED · Free 3D Flight' : 'Fly freely around maps'}
                </div>
              </button>

              <button
                onClick={() => onToggleFlag('debugMode')}
                className={`p-4 rounded-xl border text-left space-y-1 ${
                  flags.debugMode
                    ? 'bg-emerald-500/20 border-emerald-400 text-white'
                    : 'bg-[#121A2B] border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Debug Mode</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {flags.debugMode ? 'ENABLED · Telemetry Overlay' : 'View XYZ, speed, FPS & checkpoints'}
                </div>
              </button>
            </div>

            {/* Map Teleport & Collectible Spawner */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Compass className="w-4 h-4" />
                  <span>Map Teleport</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={teleportMapId}
                    onChange={(e) => setTeleportMapId(e.target.value)}
                    className="flex-1 bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {MAPS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.index}. {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      onTeleportMap(teleportMapId);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                  >
                    Jump to Map
                  </button>
                </div>
                {inRace && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[0, 0.25, 0.5, 0.75, 0.92].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          onTeleportProgress(pct);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono-tabular text-slate-200"
                      >
                        Warp {Math.round(pct * 100)}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#121A2B] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-amber-300">Spawn Items (Test Collectibles)</div>
                <p className="text-xs text-slate-400">
                  Spawns a cluster of 8 collectible Energy Stars &amp; Turbo Orbs directly ahead of your Speedstar.
                </p>
                <button
                  disabled={!inRace}
                  onClick={() => {
                    onSpawnItems();
                    setFeedback('Spawned 8 Stars & Turbo Orbs ahead!');
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold"
                >
                  {inRace ? 'Spawn Test Collectibles' : 'Enter a Race / Training Run to Spawn'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
