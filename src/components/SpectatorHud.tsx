import React from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  Home,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Video,
} from 'lucide-react';
import { SPEEDSTARS } from '../shared/gameData';
import type { ControlBindings } from '../shared/types';
import type { HudSnapshot } from '../engine/RaceManager';

interface SpectatorHudProps {
  hud: HudSnapshot;
  bindings: ControlBindings;
  canReturnToResults?: boolean;
  onPrevTarget: () => void;
  onNextTarget: () => void;
  onSelectTarget: (racerId: string) => void;
  onSetCamMode: (mode: 'follow' | 'free') => void;
  onRestartReplay: () => void;
  onToggleReplayPlay: () => void;
  onSeekReplay: (timeSec: number) => void;
  onSetReplaySpeed: (speed: 0.5 | 1 | 2) => void;
  onPlayAgain?: () => void;
  onLeaveSpectate: () => void;
  onExitToLobby?: () => void;
}

function formatKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTime(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export const SpectatorHud: React.FC<SpectatorHudProps> = ({
  hud,
  bindings,
  canReturnToResults = false,
  onPrevTarget,
  onNextTarget,
  onSelectTarget,
  onSetCamMode,
  onRestartReplay,
  onToggleReplayPlay,
  onSeekReplay,
  onSetReplaySpeed,
  onPlayAgain,
  onLeaveSpectate,
  onExitToLobby,
}) => {
  const spec = hud.spectating;
  const starDef = SPEEDSTARS.find((s) => s.id === spec.targetSpeedstarId);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-4 md:p-6 select-none">
      {/* Top Broadcast Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="bg-[#0B111E]/92 border border-cyan-400/35 rounded-xl px-4 py-2.5 flex items-center gap-3">
          {spec.isReplay ? (
            <Film className="w-4 h-4 text-amber-400" />
          ) : (
            <Eye className="w-4 h-4 text-cyan-400" />
          )}
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase text-cyan-300">
              {spec.isReplay
                ? 'RACE REPLAY · SPECTATOR CAM'
                : spec.liveRoom
                ? `LIVE RACE BROADCAST · ROOM ${spec.roomCode}`
                : 'SPECTATOR CAM'}
            </div>
            <div className="text-xs text-slate-300">
              {hud.modeObjectiveText} ·{' '}
              <span className="font-mono-tabular text-white">
                {formatTime(spec.isReplay ? spec.replayTimeSec : hud.raceTimeSec)}
                {spec.isReplay && spec.replayDurationSec > 0
                  ? ` / ${formatTime(spec.replayDurationSec)}`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Camera, Target Switcher, Replay & Leave Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#0B111E]/92 border border-white/15 rounded-lg p-1 gap-1">
            <button
              onClick={() => onSetCamMode('follow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                spec.cameraMode === 'follow'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Follow Racer</span>
            </button>
            <button
              onClick={() => onSetCamMode('free')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                spec.cameraMode === 'free'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Free Camera</span>
            </button>
          </div>

          {spec.cameraMode === 'follow' && (
            <div className="flex items-center bg-[#0B111E]/92 border border-white/15 rounded-lg p-1 gap-1">
              <button
                onClick={onPrevTarget}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-200"
                title="Previous Racer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-white max-w-[140px] truncate">
                {spec.targetName}
              </span>
              <button
                onClick={onNextTarget}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-200"
                title="Next Racer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {spec.replayAvailable && (
            <button
              onClick={onRestartReplay}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500/20 border border-amber-400/45 hover:bg-amber-500/30 text-xs font-semibold text-amber-200 transition-colors"
              title="Replay recorded race from start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{spec.isReplay ? 'Replay 00:00' : 'Watch Replay'}</span>
            </button>
          )}

          {!spec.liveRoom && onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-slate-950 transition-colors"
              title="Re-run this race from the start"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Race Again</span>
            </button>
          )}

          <button
            onClick={onLeaveSpectate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 text-xs font-semibold text-rose-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Spectate</span>
          </button>

          {canReturnToResults && onExitToLobby && (
            <button
              onClick={onExitToLobby}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B111E]/92 border border-white/15 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
              title="Return directly to Lobby"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lobby</span>
            </button>
          )}
        </div>
      </div>

      {/* Middle Right Clickable Live / Replay Standings */}
      <div className="hidden md:flex justify-end">
        <div className="pointer-events-auto bg-[#0B111E]/90 border border-white/10 rounded-xl p-3 w-64 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>{spec.isReplay ? 'Replay Racers' : 'Live Race Standings'}</span>
            <span className="text-[10px] font-normal text-cyan-300">Click to follow</span>
          </div>
          <div className="max-h-56 overflow-y-auto custom-scroll space-y-1 pr-0.5">
            {hud.standings.slice(0, 8).map((s, idx) => {
              const isFollowed = s.id === spec.targetId && spec.cameraMode === 'follow';
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectTarget(s.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                    isFollowed
                      ? 'bg-cyan-500/25 border border-cyan-400/50 text-white font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tabular text-amber-400 w-5">#{idx + 1}</span>
                    <span className="truncate">
                      {s.name}
                      {s.isHuman ? ' (You)' : ''}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0 ml-2">
                    {s.eliminated
                      ? 'OUT'
                      : s.finished
                      ? 'FIN'
                      : `${Math.round(Math.min(100, s.progress * 100))}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Telemetry / Free Cam Guide + Replay Transport Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {spec.cameraMode === 'free' ? (
          <div className="bg-[#0B111E]/92 border border-amber-400/35 rounded-xl px-4 py-3 text-xs text-slate-200 space-y-1">
            <div className="font-bold text-amber-300">Free Camera Controls</div>
            <div>
              <strong className="text-white">
                {formatKey(bindings.forward)}/{formatKey(bindings.backward)}/{formatKey(bindings.steerLeft)}/
                {formatKey(bindings.steerRight)}
              </strong>{' '}
              Fly · <strong className="text-white">{formatKey(bindings.jump)}</strong> Ascend ·{' '}
              <strong className="text-white">{formatKey(bindings.slide)}</strong> Descend ·{' '}
              <strong className="text-white">Hold {formatKey(bindings.sprint)}</strong> Fast ·{' '}
              <strong className="text-white">Click + Drag</strong> Look Around
            </div>
          </div>
        ) : (
          <div className="bg-[#0B111E]/92 border border-white/12 rounded-xl px-5 py-3.5 min-w-[290px] flex items-center justify-between gap-6">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">
                {spec.isReplay ? 'Following in Replay' : 'Spectating Competitor'}
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="font-display text-2xl font-bold text-amber-400 font-mono-tabular">
                  {ordinal(spec.targetPlacement)}
                </span>
                <span className="text-base font-bold text-white">{spec.targetName}</span>
              </div>
              <div className="text-xs text-cyan-300 mt-0.5">
                {starDef?.name ?? spec.targetSpeedstarId} ·{' '}
                {Math.round(Math.min(100, spec.targetProgress * 100))}% Course Progress
              </div>
            </div>

            <div className="text-right">
              <div className="font-display text-2xl font-bold text-white font-mono-tabular">
                {spec.targetSpeedKmh} <span className="text-xs font-normal text-slate-400">KM/H</span>
              </div>
              <div
                className={`text-[11px] font-bold mt-1 ${
                  spec.targetTurbo ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {spec.targetTurbo ? 'TURBO ENGAGED' : 'STANDARD PACE'}
              </div>
            </div>
          </div>
        )}

        {/* Replay Transport & Scrubber Bar */}
        {spec.isReplay && spec.replayDurationSec > 0 && (
          <div className="pointer-events-auto bg-[#0B111E]/94 border border-amber-400/35 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 min-w-[300px] flex-1 max-w-xl ml-auto">
            <button
              onClick={onToggleReplayPlay}
              className="w-8 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center transition-colors shrink-0"
              title={spec.replayPlaying ? 'Pause Replay' : 'Play Replay'}
            >
              {spec.replayPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={onRestartReplay}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors shrink-0"
              title="Restart Replay from 00:00"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-[140px] flex items-center gap-2.5">
              <input
                type="range"
                min={0}
                max={spec.replayDurationSec}
                step={0.05}
                value={spec.replayTimeSec}
                onChange={(e) => onSeekReplay(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
                aria-label="Replay Timeline"
              />
              <span className="text-[11px] font-mono-tabular text-slate-200 whitespace-nowrap shrink-0">
                {formatTime(spec.replayTimeSec)} / {formatTime(spec.replayDurationSec)}
              </span>
            </div>

            <div className="flex items-center bg-slate-900 border border-white/10 rounded-lg p-0.5 gap-0.5 shrink-0">
              {([0.5, 1, 2] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => onSetReplaySpeed(spd)}
                  className={`px-2 py-1 rounded text-[11px] font-mono-tabular font-semibold transition-colors ${
                    spec.replaySpeed === spd
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
