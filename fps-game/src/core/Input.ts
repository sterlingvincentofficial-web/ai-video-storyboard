/**
 * Unified input state for keyboard/mouse and touch.
 * Touch controls write into the same fields.
 */
export class Input {
  moveX = 0; // strafe -1..1 (right +)
  moveY = 0; // forward -1..1
  lookDX = 0; // pixels-ish (already scaled by source)
  lookDY = 0;
  fire = false;
  aim = false;
  jumpHeld = false;
  jumpPressed = false;
  sprint = false;
  reloadPressed = false;
  grenadePressed = false;
  meleePressed = false;
  slotPressed = -1;
  cycle = 0;
  scoreboard = false;
  pausePressed = false;
  usePressed = false;
  pointerLocked = false;
  /** true when the last input came from touch. */
  touchMode = false;
  /** Mouse button currently held (for drag-look fallback). */
  private keys = new Set<string>();
  private dragLook = false;
  private lastX = 0;
  private lastY = 0;
  enabled = false;
  /** Fired when user clicks canvas while not locked (request lock). */
  onWantLock: (() => void) | null = null;
  touchMoveX = 0;
  touchMoveY = 0;
  touchSprint = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
    el.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.cycle = e.deltaY > 0 ? 1 : -1;
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      if (this.pointerLocked) this.lockFailed = false;
      if (!this.pointerLocked) { this.fire = false; this.aim = false; }
    });
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.code;
    if (down) {
      if (this.keys.has(k)) {
        if (k === 'Space') e.preventDefault();
        return;
      }
      this.keys.add(k);
      this.touchMode = false;
    } else this.keys.delete(k);
    if (!down) {
      if (k === 'Tab') this.scoreboard = false;
      this.updateAxes();
      return;
    }
    switch (k) {
      case 'Space': this.jumpPressed = true; e.preventDefault(); break;
      case 'KeyR': this.reloadPressed = true; break;
      case 'KeyG': case 'KeyQ': this.grenadePressed = true; break;
      case 'KeyV': case 'KeyC': this.meleePressed = true; break;
      case 'KeyE': case 'KeyF': this.usePressed = true; break;
      case 'Digit1': this.slotPressed = 0; break;
      case 'Digit2': this.slotPressed = 1; break;
      case 'Digit3': this.slotPressed = 2; break;
      case 'Digit4': this.slotPressed = 3; break;
      case 'Tab': this.scoreboard = true; e.preventDefault(); break;
      case 'Escape': case 'KeyP': this.pausePressed = true; break;
    }
    this.updateAxes();
  }

  private updateAxes() {
    const k = this.keys;
    const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const ky = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    this.turnX = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    this.turnY = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    this.kbX = kx;
    this.kbY = ky;
    this.jumpHeld = k.has('Space');
    this.kbSprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }
  private kbX = 0;
  private kbY = 0;
  turnX = 0;
  turnY = 0;
  /** Set when pointer lock was refused (sandboxed iframe): drag-to-look mode. */
  lockFailed = false;
  onLockFailed: (() => void) | null = null;
  private kbSprint = false;

  private onMouseDown(e: MouseEvent) {
    if (!this.enabled) return;
    this.touchMode = false;
    if (!this.pointerLocked) {
      // always try to (re)capture on click; if capture is known to fail, fall back to drag-look
      this.onWantLock?.();
      if (!this.lockFailed) return;
      // drag-look fallback when pointer lock unavailable (e.g. sandboxed iframes):
      // LMB-drag = look + fire, RMB-drag = look only
      this.dragLook = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 0) this.fire = true;
      return;
    }
    if (e.button === 0) this.fire = true;
    if (e.button === 2) this.aim = true;
    if (e.button === 1) { this.meleePressed = true; e.preventDefault(); }
  }
  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.fire = false;
    if (e.button === 2) this.aim = false;
    this.dragLook = false;
  }
  private onMouseMove(e: MouseEvent) {
    if (!this.enabled) return;
    if (this.pointerLocked) {
      // ignore absurd spikes some browsers produce on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    } else if (this.dragLook) {
      this.lookDX += (e.clientX - this.lastX) * 1.5;
      this.lookDY += (e.clientY - this.lastY) * 1.5;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  // ---- gamepad (standard mapping)
  private padPrev: boolean[] = [];
  private padFire = false;
  private padAim = false;
  padActive = false;
  private padX = 0;
  private padY = 0;
  private padSprint = false;
  onPadPause: (() => void) | null = null;

  private pollPad(dt: number) {
    let pads: (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { return; }
    const gp = pads.find((p) => p && p.connected && p.mapping === 'standard') ?? pads.find((p) => p && p.connected);
    if (!gp) {
      if (this.padActive) { this.padActive = false; this.padX = this.padY = 0; if (this.padFire) this.fire = false; if (this.padAim) this.aim = false; this.padFire = this.padAim = false; }
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const ax = gp.axes;
    const lx = dz(ax[0] ?? 0), ly = dz(ax[1] ?? 0), rx = dz(ax[2] ?? 0), ry = dz(ax[3] ?? 0);
    const b = (i: number) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value ?? 0) > 0.4;
    const pressed = (i: number) => b(i) && !this.padPrev[i];
    const any = lx || ly || rx || ry || gp.buttons.some((x) => x.pressed);
    if (any) { this.padActive = true; this.touchMode = false; }
    if (!this.padActive) return;
    this.padX = lx;
    this.padY = -ly;
    // look: quadratic curve for fine aim, ~3 rad/s at full tilt (expressed in mouse-pixel units)
    const curve = (v: number) => Math.sign(v) * v * v;
    this.lookDX += curve(rx) * 1300 * dt;
    this.lookDY += curve(ry) * 900 * dt;
    if (this.enabled) {
      const fire = b(7), aim = b(6);
      if (fire !== this.padFire) { this.fire = fire; this.padFire = fire; }
      if (aim !== this.padAim) { this.aim = aim; this.padAim = aim; }
      if (pressed(0)) this.jumpPressed = true;
      this.jumpHeld = this.jumpHeld || b(0);
      if (pressed(2)) this.reloadPressed = true;
      if (pressed(3)) this.cycle = 1;
      if (pressed(4)) this.grenadePressed = true;
      if (pressed(5) || pressed(1)) this.meleePressed = true;
      if (pressed(10)) this.padSprint = !this.padSprint;
      if (ly > -0.3) this.padSprint = false;
      if (pressed(12)) this.slotPressed = 0;
      if (pressed(13)) this.slotPressed = 1;
      if (pressed(14)) this.slotPressed = 2;
      if (pressed(15)) this.slotPressed = 3;
      this.scoreboard = b(8) || this.keys.has('Tab');
    }
    if (pressed(9)) this.onPadPause?.();
    this.padPrev = gp.buttons.map((x) => x.pressed || x.value > 0.4);
  }

  /** Called each frame before reading. Merges keyboard + touch axes. */
  poll(dt = 1 / 60) {
    this.pollPad(dt);
    let x = this.kbX + this.touchMoveX + this.padX;
    let y = this.kbY + this.touchMoveY + this.padY;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.moveX = x;
    this.moveY = y;
    this.sprint = this.kbSprint || this.touchSprint || this.padSprint;
  }

  /** Clear edge-triggered flags after the frame used them. */
  consume() {
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpPressed = false;
    this.reloadPressed = false;
    this.grenadePressed = false;
    this.meleePressed = false;
    this.slotPressed = -1;
    this.cycle = 0;
    this.pausePressed = false;
    this.usePressed = false;
  }

  clear() {
    this.keys.clear();
    this.updateAxes();
    this.fire = false;
    this.aim = false;
    this.touchMoveX = this.touchMoveY = 0;
    this.touchSprint = false;
    this.consume();
  }

  requestLock() {
    const fail = () => {
      if (!this.lockFailed) {
        this.lockFailed = true;
        this.onLockFailed?.();
      }
    };
    try {
      if (!this.el.requestPointerLock) return fail();
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(fail);
      // browsers without the promise form: detect via error event / timeout
      const onErr = () => { fail(); document.removeEventListener('pointerlockerror', onErr); };
      document.addEventListener('pointerlockerror', onErr);
      setTimeout(() => document.removeEventListener('pointerlockerror', onErr), 1500);
    } catch {
      fail();
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
