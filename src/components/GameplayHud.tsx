import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CloudRain, Droplets, Flame, Ghost, Snowflake, Sparkles, Sun, Wind } from 'lucide-react';
import type { PlayerController } from '../engine/PlayerController';
import type { HudSnapshot } from '../engine/RaceManager';
import { MAPS } from '../shared/gameData';
import type { ControlBindings, GhostSelection } from '../shared/types';
import { TrackBlueprint } from './TrackBlueprint';

interface GameplayHudProps {
  hud: HudSnapshot;
  controller: PlayerController;
  bindings: ControlBindings;
  touchControls: boolean;
  hasVehicle: boolean;
  hasGadget: boolean;
  debugMode: boolean;
  vaultUnlocked: boolean;
  hasPersonalGhost?: boolean;
  hasGlobalGhost?: boolean;
  onSelectGhost?: (sel: GhostSelection) => void;
  onOpenVault?: () => void;
  onSpectateNext: () => void;
  onFinishTraining: () => void;
  onQuitToLobby: () => void;
}

function formatKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const ZERO_POINT_BANNERS: Record<string, { title: string; sub: string; color: string }> = {
  activate: {
    title: 'ZERO POINT · ACTIVATION',
    sub: 'Cosmic seal awakening beneath your feet...',
    color: 'border-cyan-400/70 text-cyan-300',
  },
  awaken: {
    title: 'ZERO POINT AWAKENS',
    sub: 'World Pulse expanding · Time Fracture engaged',
    color: 'border-violet-400/80 text-violet-300',
  },
  transcend: {
    title: 'ZERO POINT TRANSCENDENCE',
    sub: 'Infinite Velocity · Zero Gravity · Reality Trail',
    color: 'border-fuchsia-400/80 text-fuchsia-200',
  },
  finish: {
    title: 'COSMIC FINISH',
    sub: 'Energy dissipating · Reality stabilizing',
    color: 'border-amber-400/70 text-amber-300',
  },
};

export const GameplayHud: React.FC<GameplayHudProps> = ({
  hud,
  controller,
  bindings,
  touchControls,
  hasVehicle,
  hasGadget,
  debugMode,
  vaultUnlocked,
  hasPersonalGhost = false,
  hasGlobalGhost = false,
  onSelectGhost,
  onOpenVault,
  onSpectateNext,
  onFinishTraining,
  onQuitToLobby,
}) => {
  const zpBanner = hud.zeroPointPhase !== 'inactive' ? ZERO_POINT_BANNERS[hud.zeroPointPhase] : null;
  const activeMap = MAPS.find((m) => m.id === hud.mapId) ?? MAPS[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 md:p-6 select-none">
      {/* Top Row: Placement | Timer | Actions */}
      <div className="flex items-start justify-between gap-4">
        {/* Placement & Mode Progress */}
        <div className="flex flex-col gap-2">
          <div className="bg-[#0B111E]/90 border border-white/10 rounded-xl px-4 py-3 min-w-[200px]">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-bold text-amber-400 font-mono-tabular">
                {ordinal(hud.placement)}
              </span>
              <span className="text-xs text-slate-400 font-mono-tabular">
                / {hud.totalRacers} {hud.remainingRacers < hud.totalRacers ? `(${hud.remainingRacers} Alive)` : ''}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-300 font-medium">{hud.modeObjectiveText}</div>
            {hud.teamScores && (
              <div className="mt-1.5 flex items-center gap-3 text-xs font-mono-tabular">
                <span className="text-cyan-400">Cyan {hud.teamScores.cyan}</span>
                <span className="text-slate-500">/</span>
                <span className="text-amber-400">Amber {hud.teamScores.amber}</span>
              </div>
            )}
            {hud.modeId === 'championship' && (
              <div className="mt-1 text-xs text-cyan-300">Championship Stage {hud.championshipStage} / 3</div>
            )}
          </div>

          {/* Live Ghost Opponent & Split Card (Time Attack & Training) */}
          {hud.ghost && (
            <div className="pointer-events-auto bg-[#0B111E]/90 border border-white/12 rounded-xl px-3.5 py-2.5 min-w-[220px] space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Ghost
                    className={`w-3.5 h-3.5 ${
                      hud.ghost.selection === 'global-top'
                        ? 'text-amber-400'
                        : hud.ghost.selection === 'personal-best'
                        ? 'text-cyan-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>
                    {hud.ghost.active
                      ? `${hud.ghost.label} Ghost`
                      : 'Ghost: Off'}
                  </span>
                </span>
                {hud.ghost.active && hud.ghost.deltaSec !== null && (
                  <span
                    className={`font-mono-tabular font-bold ${
                      hud.ghost.deltaSec <= 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {hud.ghost.deltaSec <= 0
                      ? `${hud.ghost.deltaSec.toFixed(2)}s`
                      : `+${hud.ghost.deltaSec.toFixed(2)}s`}
                  </span>
                )}
              </div>
              {hud.ghost.active && (
                <div className="text-[11px] text-slate-400 truncate">
                  {hud.ghost.username} ·{' '}
                  <span className="font-mono-tabular text-slate-200">{hud.ghost.targetTimeSec.toFixed(2)}s</span>
                </div>
              )}
              {onSelectGhost && (
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    onClick={() => onSelectGhost('off')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      hud.ghost.selection === 'off'
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    disabled={!hasPersonalGhost}
                    onClick={() => onSelectGhost('personal-best')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold disabled:opacity-40 ${
                      hud.ghost.selection === 'personal-best'
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    Personal Best
                  </button>
                  <button
                    disabled={!hasGlobalGhost}
                    onClick={() => onSelectGhost('global-top')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold disabled:opacity-40 ${
                      hud.ghost.selection === 'global-top'
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    Global Top
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Owner's Vault Debug Mode Telemetry Overlay */}
          {debugMode && (
            <div className="bg-[#0B111E]/92 border border-emerald-400/40 rounded-xl px-3.5 py-2.5 text-[11px] font-mono-tabular text-emerald-200 space-y-0.5">
              <div className="text-emerald-400 font-bold uppercase tracking-wider">Debug Telemetry</div>
              <div>
                FPS: <strong className="text-white">{hud.debugInfo.fps}</strong> · State:{' '}
                <strong className="text-white">{hud.debugInfo.state}</strong>
              </div>
              <div>
                Pos: X {hud.debugInfo.x} · Y {hud.debugInfo.y} · Z {hud.debugInfo.z}
              </div>
              <div>
                Speed: {hud.debugInfo.speedMs} m/s ({hud.speedKmh} km/h) · Surface: {hud.debugInfo.surface}
              </div>
              <div>
                Track: {hud.debugInfo.trackProgress}% · CP {hud.checkpointCurrent}/{hud.checkpointTotal}
              </div>
            </div>
          )}
        </div>

        {/* Center Race Timer + Dynamic Weather & Road Condition */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-[#0B111E]/90 border border-white/10 rounded-xl px-5 py-2.5 text-center">
            <div className="text-[11px] tracking-wider text-slate-400 uppercase">Race Time</div>
            <div className="font-display text-2xl font-bold text-white font-mono-tabular">
              {formatTime(hud.raceTimeSec)}
            </div>
          </div>
          <div className="bg-[#0B111E]/90 border border-white/10 rounded-lg px-3 py-1 flex items-center gap-2 text-[11px]">
            {hud.weather.condition === 'rain' ? (
              <CloudRain className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            ) : hud.weather.condition === 'snow' ? (
              <Snowflake className="w-3.5 h-3.5 text-sky-200 shrink-0" />
            ) : hud.weather.condition === 'sandstorm' ? (
              <Wind className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            ) : hud.weather.condition === 'embers' ? (
              <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            ) : hud.weather.condition === 'starfield' ? (
              <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="font-medium text-slate-200">{hud.weather.label}</span>
            <span className="text-slate-600">·</span>
            <span
              className={`flex items-center gap-1 font-medium ${
                hud.weather.icing >= 0.28
                  ? 'text-sky-300'
                  : hud.weather.wetness >= 0.25
                  ? 'text-cyan-300'
                  : 'text-emerald-300'
              }`}
            >
              {(hud.weather.wetness >= 0.25 || hud.weather.icing >= 0.28) && (
                <Droplets className="w-3 h-3 shrink-0" />
              )}
              {hud.weather.roadConditionLabel}
            </span>
          </div>
        </div>

        {/* Top-Right Controls + Minimap Radar + Live Race Feed */}
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            {vaultUnlocked && onOpenVault && (
              <button
                onClick={onOpenVault}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-violet-500/25 border border-violet-400/45 text-violet-200 hover:bg-violet-500/35 transition-colors whitespace-nowrap shrink-0"
              >
                Owner&apos;s Vault
              </button>
            )}
            {hud.modeId === 'training-grounds' && (
              <button
                onClick={onFinishTraining}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
              >
                Complete Training (+5,000 SC)
              </button>
            )}
            {hud.eliminated && (
              <button
                onClick={onSpectateNext}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                Spectate Next
              </button>
            )}
            <button
              onClick={onQuitToLobby}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#0B111E]/90 border border-white/15 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Exit Race
            </button>
          </div>

          {/* Live Track Minimap & Rival Radar */}
          <div className="hidden sm:flex flex-col items-center bg-[#0B111E]/88 border border-white/10 rounded-xl p-2">
            <TrackBlueprint map={activeMap} dots={hud.radarDots} size={108} />
            <div className="w-full flex items-center justify-between text-[10px] text-slate-400 px-1 mt-0.5">
              <span className="truncate max-w-[78px]">{activeMap.name}</span>
              <span className="font-mono-tabular text-cyan-300">
                CP {hud.checkpointCurrent}/{hud.checkpointTotal}
              </span>
            </div>
          </div>

          {/* Live Race Event Callouts */}
          <div className="flex flex-col items-end gap-1 max-w-[240px]">
            <AnimatePresence initial={false}>
              {hud.raceEvents.map((ev) => {
                const toneClass =
                  ev.tone === 'emerald'
                    ? 'border-emerald-400/45 text-emerald-200'
                    : ev.tone === 'amber'
                    ? 'border-amber-400/45 text-amber-200'
                    : ev.tone === 'rose'
                    ? 'border-rose-400/50 text-rose-200'
                    : 'border-cyan-400/45 text-cyan-200';
                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.2 }}
                    className={`bg-[#0B111E]/90 border rounded-lg px-2.5 py-1 text-[11px] font-medium shadow ${toneClass}`}
                  >
                    {ev.text}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Center Countdown or Zero Point Banner */}
      {hud.phase === 'countdown' ? (
        <div className="flex items-center justify-center">
          <div className="bg-[#0B111E]/95 border border-cyan-400/40 rounded-2xl px-10 py-6 text-center">
            <div className="text-xs tracking-widest text-cyan-400 uppercase mb-1">Get Ready</div>
            <div className="font-display text-6xl font-bold text-white font-mono-tabular">
              {hud.countdownValue > 0 ? hud.countdownValue : 'GO!'}
            </div>
          </div>
        </div>
      ) : zpBanner ? (
        <div className="flex items-center justify-center">
          <div className={`bg-[#070414]/90 border rounded-xl px-6 py-2.5 text-center ${zpBanner.color}`}>
            <div className="font-display text-sm font-bold tracking-widest uppercase">
              {zpBanner.title} {hud.zeroPointTimeLeft > 0 ? `· ${hud.zeroPointTimeLeft}s` : ''}
            </div>
            <div className="text-[11px] text-slate-300">{zpBanner.sub}</div>
          </div>
        </div>
      ) : null}

      {/* Bottom Row: Controls Help + Speedometer / Turbo / Abilities */}
      <div className="flex flex-col gap-3">
        {/* Optional Touch Controls */}
        {touchControls && (
          <div className="pointer-events-auto flex items-end justify-between gap-4">
            <div className="grid grid-cols-3 gap-1.5 w-36">
              <div />
              <button
                onPointerDown={() => (controller.touchMove.y = 1)}
                onPointerUp={() => (controller.touchMove.y = 0)}
                onPointerLeave={() => (controller.touchMove.y = 0)}
                className="h-11 rounded-lg bg-[#0B111E]/90 border border-white/15 text-xs font-bold text-white active:bg-cyan-500/40"
              >
                {formatKey(bindings.forward)}
              </button>
              <div />
              <button
                onPointerDown={() => (controller.touchMove.x = -1)}
                onPointerUp={() => (controller.touchMove.x = 0)}
                onPointerLeave={() => (controller.touchMove.x = 0)}
                className="h-11 rounded-lg bg-[#0B111E]/90 border border-white/15 text-xs font-bold text-white active:bg-cyan-500/40"
              >
                {formatKey(bindings.steerLeft)}
              </button>
              <button
                onPointerDown={() => (controller.touchMove.y = -1)}
                onPointerUp={() => (controller.touchMove.y = 0)}
                onPointerLeave={() => (controller.touchMove.y = 0)}
                className="h-11 rounded-lg bg-[#0B111E]/90 border border-white/15 text-xs font-bold text-white active:bg-cyan-500/40"
              >
                {formatKey(bindings.backward)}
              </button>
              <button
                onPointerDown={() => (controller.touchMove.x = 1)}
                onPointerUp={() => (controller.touchMove.x = 0)}
                onPointerLeave={() => (controller.touchMove.x = 0)}
                className="h-11 rounded-lg bg-[#0B111E]/90 border border-white/15 text-xs font-bold text-white active:bg-cyan-500/40"
              >
                {formatKey(bindings.steerRight)}
              </button>
            </div>

            <div className="flex flex-wrap justify-end gap-2 max-w-[240px]">
              <button
                onPointerDown={() => controller.triggerTouchAction('jump')}
                className="px-4 py-3 rounded-lg bg-cyan-500/90 text-slate-950 text-xs font-bold"
              >
                JUMP
              </button>
              <button
                onPointerDown={() => controller.triggerTouchAction('turbo')}
                className="px-4 py-3 rounded-lg bg-amber-500/90 text-slate-950 text-xs font-bold"
              >
                TURBO
              </button>
              <button
                onPointerDown={() => controller.triggerTouchAction('ability')}
                className="px-4 py-3 rounded-lg bg-indigo-500/90 text-white text-xs font-bold"
              >
                ABILITY
              </button>
              <button
                onPointerDown={() => (controller.touchSlide = true)}
                onPointerUp={() => (controller.touchSlide = false)}
                className="px-4 py-3 rounded-lg bg-slate-800/90 border border-white/20 text-white text-xs font-bold"
              >
                SLIDE
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          {/* Compact Dynamic Keybind Bar */}
          <div className="hidden md:flex items-center gap-3 bg-[#0B111E]/88 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-300">
            <span>
              <strong className="text-white">
                {formatKey(bindings.forward)}
                {formatKey(bindings.steerLeft)}
                {formatKey(bindings.backward)}
                {formatKey(bindings.steerRight)}
              </strong>{' '}
              Move
            </span>
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-white">{formatKey(bindings.jump)}</strong> Jump
            </span>
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-white">{formatKey(bindings.slide)}</strong> Slide
            </span>
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-amber-400">{formatKey(bindings.turbo)}</strong> Turbo
            </span>
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-cyan-400">{formatKey(bindings.ability)}</strong> Ability
            </span>
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-rose-400">{formatKey(bindings.airDash)}</strong> Air Dash
            </span>
            {hasVehicle && (
              <>
                <span className="text-slate-600">·</span>
                <span>
                  <strong className="text-emerald-400">{formatKey(bindings.vehicle)}</strong> Vehicle
                </span>
              </>
            )}
            <span className="text-slate-600">·</span>
            <span>
              <strong className="text-white">{formatKey(bindings.respawn)}</strong> Respawn
            </span>
          </div>

          {/* Abilities + Turbo + Speedometer Cluster */}
          <div className="flex items-end gap-3 ml-auto">
            {/* Equipped Abilities */}
            <div className="flex items-center gap-2">
              {hud.abilities.map((ab, idx) => (
                <div
                  key={ab.id}
                  className={`bg-[#0B111E]/92 border rounded-xl px-3 py-2 min-w-[92px] ${
                    ab.id === 'zero-point' ? 'border-violet-400/60' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {ab.kind === 'active'
                        ? `[${ab.id === 'air-dash' ? formatKey(bindings.airDash) : formatKey(bindings.ability)}]`
                        : 'PASSIVE'}
                    </span>
                    <span className="font-mono-tabular text-cyan-300">
                      {ab.cooldownLeft > 0 ? `${ab.cooldownLeft}s` : 'READY'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white truncate max-w-[110px] mt-0.5">
                    {ab.name}
                  </div>
                  {idx === 0 && hasGadget && (
                    <div className="text-[10px] text-pink-300 mt-0.5">
                      [{formatKey(bindings.gadget)}] Gadget{' '}
                      {hud.gadgetCooldownLeft > 0 ? `${hud.gadgetCooldownLeft}s` : 'Ready'}
                    </div>
                  )}
                </div>
              ))}
              {hasVehicle && (
                <div className="bg-[#0B111E]/92 border border-white/10 rounded-xl px-3 py-2">
                  <div className="text-[11px] text-slate-400">[{formatKey(bindings.vehicle)}] Vehicle</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-0.5">
                    {hud.mountedVehicle ? 'Mounted' : 'On Foot'}
                  </div>
                </div>
              )}
            </div>

            {/* Speedometer & Turbo Meter */}
            <div className="bg-[#0B111E]/92 border border-white/10 rounded-xl px-4 py-2.5 min-w-[190px]">
              <div className="flex items-baseline justify-between">
                <span
                  className={`font-display text-3xl font-bold font-mono-tabular ${
                    hud.zeroPointPhase === 'transcend'
                      ? 'text-fuchsia-300'
                      : hud.turboActive
                      ? 'text-amber-400'
                      : 'text-white'
                  }`}
                >
                  {hud.speedKmh}
                </span>
                <span className="text-xs text-slate-400">KM/H</span>
              </div>
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className={hud.turboActive ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                    {hud.turboActive ? 'TURBO ACTIVE' : `TURBO [${formatKey(bindings.turbo)}]`}
                  </span>
                  <span className="font-mono-tabular text-slate-200">{hud.turboMeter}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      hud.zeroPointPhase === 'transcend'
                        ? 'bg-violet-400'
                        : hud.turboActive
                        ? 'bg-amber-400'
                        : hud.turboMeter >= 25
                        ? 'bg-cyan-400'
                        : 'bg-slate-500'
                    }`}
                    style={{ width: `${hud.turboActive ? 100 : hud.turboMeter}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
