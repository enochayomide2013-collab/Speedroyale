import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  type ControlBindings,
  type GamepadBindings,
} from '../shared/types';

export interface InputSnapshot {
  forward: number; // -1..1
  steer: number;   // -1..1
  sprint: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  slideHeld: boolean;
  turboPressed: boolean;
  abilityPressed: boolean;
  airDashPressed: boolean;
  gadgetPressed: boolean;
  vehicleTogglePressed: boolean;
  respawnPressed: boolean;
  emotePressed: boolean;
}

export class PlayerController {
  private keys = new Set<string>();
  private jumpQueued = false;
  private turboQueued = false;
  private abilityQueued = false;
  private airDashQueued = false;
  private gadgetQueued = false;
  private vehicleQueued = false;
  private respawnQueued = false;
  private emoteQueued = false;

  private bindings: ControlBindings = { ...DEFAULT_KEYBOARD_BINDINGS };
  private gamepadBindings: GamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  private prevGamepadButtons: boolean[] = [];

  // Touch / virtual input overrides
  public touchMove = { x: 0, y: 0 };
  public touchSlide = false;
  public touchSprint = false;
  public autoSprint = true;

  public setBindings(controls: ControlBindings, gamepad: GamepadBindings): void {
    this.bindings = { ...DEFAULT_KEYBOARD_BINDINGS, ...controls };
    this.gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS, ...gamepad };
  }

  public getBindings(): { controls: ControlBindings; gamepad: GamepadBindings } {
    return { controls: { ...this.bindings }, gamepad: { ...this.gamepadBindings } };
  }

  private isBoundElsewhere(code: string, exclude: keyof ControlBindings): boolean {
    for (const [k, v] of Object.entries(this.bindings)) {
      if (k !== exclude && v === code) return true;
    }
    return false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    if (!this.keys.has(code)) {
      if (code === this.bindings.jump) this.jumpQueued = true;
      if (code === this.bindings.turbo) this.turboQueued = true;
      if (code === this.bindings.ability) this.abilityQueued = true;
      if (code === this.bindings.airDash) this.airDashQueued = true;
      if (code === this.bindings.gadget) this.gadgetQueued = true;
      if (code === this.bindings.vehicle) this.vehicleQueued = true;
      if (code === this.bindings.respawn) this.respawnQueued = true;
      if (code === this.bindings.emote) this.emoteQueued = true;
    }
    this.keys.add(code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  public attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  public detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
  }

  public triggerTouchAction(action: 'jump' | 'turbo' | 'ability' | 'dash' | 'gadget' | 'vehicle'): void {
    if (action === 'jump') this.jumpQueued = true;
    if (action === 'turbo') this.turboQueued = true;
    if (action === 'ability') this.abilityQueued = true;
    if (action === 'dash') this.airDashQueued = true;
    if (action === 'gadget') this.gadgetQueued = true;
    if (action === 'vehicle') this.vehicleQueued = true;
  }

  public consumeSnapshot(): InputSnapshot {
    let forward = this.touchMove.y;
    if (
      this.keys.has(this.bindings.forward) ||
      (!this.isBoundElsewhere('ArrowUp', 'forward') && this.keys.has('ArrowUp'))
    ) {
      forward += 1;
    }
    if (
      this.keys.has(this.bindings.backward) ||
      (!this.isBoundElsewhere('ArrowDown', 'backward') && this.keys.has('ArrowDown'))
    ) {
      forward -= 1;
    }

    let steer = this.touchMove.x;
    if (
      this.keys.has(this.bindings.steerLeft) ||
      (!this.isBoundElsewhere('ArrowLeft', 'steerLeft') && this.keys.has('ArrowLeft'))
    ) {
      steer -= 1;
    }
    if (
      this.keys.has(this.bindings.steerRight) ||
      (!this.isBoundElsewhere('ArrowRight', 'steerRight') && this.keys.has('ArrowRight'))
    ) {
      steer += 1;
    }

    let gpJumpHeld = false;
    let gpSlideHeld = false;
    let gpSprint = false;

    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads ? Array.from(pads).find((p): p is Gamepad => Boolean(p && p.connected)) : undefined;
    if (gp) {
      const axisX = Math.abs(gp.axes[0] || 0) > 0.16 ? gp.axes[0] : 0;
      const axisY = Math.abs(gp.axes[1] || 0) > 0.16 ? -gp.axes[1] : 0;
      steer += axisX;
      forward += axisY;

      // D-pad support (12 Up, 13 Down, 14 Left, 15 Right)
      if (gp.buttons[12]?.pressed) forward += 1;
      if (gp.buttons[13]?.pressed) forward -= 1;
      if (gp.buttons[14]?.pressed) steer -= 1;
      if (gp.buttons[15]?.pressed) steer += 1;

      const pressed = (idx: number) => Boolean(gp.buttons[idx]?.pressed);
      const justPressed = (idx: number) => pressed(idx) && !this.prevGamepadButtons[idx];

      if (justPressed(this.gamepadBindings.jump)) this.jumpQueued = true;
      if (justPressed(this.gamepadBindings.turbo)) this.turboQueued = true;
      if (justPressed(this.gamepadBindings.ability)) this.abilityQueued = true;
      if (justPressed(this.gamepadBindings.airDash)) this.airDashQueued = true;
      if (justPressed(this.gamepadBindings.gadget)) this.gadgetQueued = true;
      if (justPressed(this.gamepadBindings.vehicle)) this.vehicleQueued = true;
      if (justPressed(this.gamepadBindings.respawn)) this.respawnQueued = true;

      gpJumpHeld = pressed(this.gamepadBindings.jump);
      gpSlideHeld = pressed(this.gamepadBindings.slide);
      gpSprint = pressed(6) || pressed(7) || pressed(10);

      this.prevGamepadButtons = gp.buttons.map((b) => Boolean(b.pressed));
    }

    forward = Math.max(-1, Math.min(1, forward));
    steer = Math.max(-1, Math.min(1, steer));

    const sprint =
      this.autoSprint ||
      this.touchSprint ||
      gpSprint ||
      this.keys.has(this.bindings.sprint) ||
      this.keys.has('ShiftRight');

    const snap: InputSnapshot = {
      forward,
      steer,
      sprint,
      jumpPressed: this.jumpQueued,
      jumpHeld: this.keys.has(this.bindings.jump) || gpJumpHeld,
      slideHeld: this.touchSlide || gpSlideHeld || this.keys.has(this.bindings.slide) || this.keys.has('ControlLeft'),
      turboPressed: this.turboQueued,
      abilityPressed: this.abilityQueued,
      airDashPressed: this.airDashQueued,
      gadgetPressed: this.gadgetQueued,
      vehicleTogglePressed: this.vehicleQueued,
      respawnPressed: this.respawnQueued,
      emotePressed: this.emoteQueued,
    };

    this.jumpQueued = false;
    this.turboQueued = false;
    this.abilityQueued = false;
    this.airDashQueued = false;
    this.gadgetQueued = false;
    this.vehicleQueued = false;
    this.respawnQueued = false;
    this.emoteQueued = false;

    return snap;
  }
}
