import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, GraduationCap, SkipForward, Sparkles } from 'lucide-react';
import type { ControlBindings } from '../shared/types';
import type { HudSnapshot } from '../engine/RaceManager';

interface TutorialOverlayProps {
  hud: HudSnapshot;
  bindings: ControlBindings;
  onStepComplete: () => void;
  onCompleteTutorial: () => void;
  onSkipTutorial: () => void;
}

function formatKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

interface TutorialStepDef {
  id: string;
  title: string;
  instruction: string;
  cue: string;
  check: (hud: HudSnapshot) => { done: boolean; progressLabel: string };
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  hud,
  bindings,
  onStepComplete,
  onCompleteTutorial,
  onSkipTutorial,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [stepDone, setStepDone] = useState(false);

  const steps: TutorialStepDef[] = [
    {
      id: 'run',
      title: '1. Basic Movement & Sprint',
      instruction: `Hold [${formatKey(bindings.forward)}] to accelerate and steer with [${formatKey(bindings.steerLeft)}] / [${formatKey(bindings.steerRight)}]. Build momentum down the track!`,
      cue: 'Run at least 35 meters along the Neon Rush circuit.',
      check: (h) => ({
        done: h.tutorialSignals.ranDistance >= 35,
        progressLabel: `${Math.min(35, Math.round(h.tutorialSignals.ranDistance))} / 35m`,
      }),
    },
    {
      id: 'jump-slide',
      title: '2. Jumping & Sliding',
      instruction: `Press [${formatKey(bindings.jump)}] to leap over barriers, and hold [${formatKey(bindings.slide)}] while sprinting to slide smoothly underneath hazards.`,
      cue: 'Perform 1 Jump and 1 Slide.',
      check: (h) => ({
        done: h.tutorialSignals.jumped >= 1 && h.tutorialSignals.slid >= 1,
        progressLabel: `Jumps: ${Math.min(1, h.tutorialSignals.jumped)}/1 · Slides: ${Math.min(1, h.tutorialSignals.slid)}/1`,
      }),
    },
    {
      id: 'turbo',
      title: '3. Turbo Ignition',
      instruction: `Watch your Turbo meter fill as you run, grind, or collect orbs. Once at 25%+, press [${formatKey(bindings.turbo)}] to ignite Turbo Surge!`,
      cue: 'Activate Turbo once.',
      check: (h) => ({
        done: h.tutorialSignals.turboUsed >= 1,
        progressLabel: `Turbo Meter: ${h.turboMeter}% · Used: ${Math.min(1, h.tutorialSignals.turboUsed)}/1`,
      }),
    },
    {
      id: 'rail',
      title: '4. Rail Grinding',
      instruction: `Jump onto one of the glowing cyan Grind Rails along the edges of the course to lock on and build rapid Turbo energy.`,
      cue: 'Grind on a rail for 0.4s.',
      check: (h) => ({
        done: h.tutorialSignals.railGrindSec >= 0.4,
        progressLabel: `Grind: ${Math.min(0.4, h.tutorialSignals.railGrindSec).toFixed(1)} / 0.4s`,
      }),
    },
    {
      id: 'wall',
      title: '5. Wall Running',
      instruction: `Leap while airborne right next to an illuminated vertical Wall Panel to kick into a high-speed horizontal wall run!`,
      cue: 'Wall-run along a panel for 0.3s (or jump off it).',
      check: (h) => ({
        done: h.tutorialSignals.wallRunSec >= 0.3,
        progressLabel: `Wall Run: ${Math.min(0.3, h.tutorialSignals.wallRunSec).toFixed(1)} / 0.3s`,
      }),
    },
    {
      id: 'ability',
      title: '6. Abilities & Loadout',
      instruction: `Equip up to 3 abilities in the Garage before a race. Press [${formatKey(bindings.ability)}] for your primary ability or [${formatKey(bindings.airDash)}] mid-air for Air Dash!`,
      cue: 'Trigger an active ability or Air Dash once.',
      check: (h) => ({
        done: h.tutorialSignals.abilityUsed >= 1,
        progressLabel: `Abilities Used: ${Math.min(1, h.tutorialSignals.abilityUsed)}/1`,
      }),
    },
  ];

  const current = steps[stepIdx];
  const evalRes = current.check(hud);

  useEffect(() => {
    if (evalRes.done && !stepDone) {
      setStepDone(true);
      onStepComplete();
    }
  }, [evalRes.done, stepDone, onStepComplete]);

  const handleNext = () => {
    if (stepIdx < steps.length - 1) {
      setStepIdx((i) => i + 1);
      setStepDone(false);
    } else {
      onCompleteTutorial();
    }
  };

  return (
    <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-30 w-[min(560px,92vw)]">
      <div className="pointer-events-auto bg-[#0B111E]/95 border border-cyan-400/40 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-cyan-400" />
            <span className="text-xs font-bold tracking-wider uppercase text-cyan-300">
              Speedstars Academy · Step {stepIdx + 1} / {steps.length}
            </span>
          </div>
          <button
            onClick={onSkipTutorial}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300"
          >
            <SkipForward className="w-3 h-3" />
            <span>Exit Tutorial</span>
          </button>
        </div>

        {/* Step Progress Pills */}
        <div className="grid grid-cols-6 gap-1.5">
          {steps.map((s, idx) => (
            <div
              key={s.id}
              className={`h-1.5 rounded-full ${
                idx < stepIdx
                  ? 'bg-emerald-400'
                  : idx === stepIdx
                  ? stepDone
                    ? 'bg-emerald-400'
                    : 'bg-cyan-400'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        <div>
          <h3 className="font-display text-lg font-bold text-white">{current.title}</h3>
          <p className="text-xs text-slate-200 mt-1 leading-relaxed">{current.instruction}</p>
        </div>

        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 border ${
            stepDone
              ? 'bg-emerald-500/15 border-emerald-400/40'
              : 'bg-slate-900/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            {stepDone ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div>
              <div className={stepDone ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
                {stepDone ? 'Challenge Complete!' : current.cue}
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-300">{evalRes.progressLabel}</div>
            </div>
          </div>

          <button
            onClick={handleNext}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              stepDone
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span>{stepIdx === steps.length - 1 ? 'Finish Tutorial' : stepDone ? 'Next Challenge' : 'Skip Step'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
