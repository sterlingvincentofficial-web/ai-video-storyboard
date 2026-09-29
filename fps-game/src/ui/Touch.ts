import type { Input } from '../core/Input';
import { settings } from '../core/Settings';

/**
 * Mobile controls: floating joystick on the left half, drag-to-look on the right half,
 * and action buttons. Writes into the shared Input.
 */
export class TouchControls {
  root: HTMLDivElement;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private fireLookId: number | null = null;
  private btns: Record<string, HTMLDivElement> = {};
  active = false;
  onPause: (() => void) | null = null;
  onScoreboard: ((v: boolean) => void) | null = null;

  constructor(parent: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch hidden';
    parent.appendChild(this.root);
    const zoneL = this.div('tzone left');
    const zoneR = this.div('tzone right');
    this.stick = this.div('stick');
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.stick.appendChild(this.knob);

    const mk = (id: string, label: string, cls = '') => {
      const b = this.div(`tbtn ${id} ${cls}`);
      b.innerHTML = `<span>${label}</span>`;
      this.btns[id] = b;
      return b;
    };
    mk('fire', '🔥', 'big');
    mk('fire2', '🔥', 'small');
    mk('jump', '⤒');
    mk('aim', '◎');
    mk('reload', '↻');
    mk('swap', '⇄');
    mk('nade', '💣');
    mk('sprint', '»');
    mk('pause', 'Ⅱ', 'tiny');
    mk('score', '☰', 'tiny');

    // --- joystick (left half, floating)
    zoneL.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.stickId !== null) break;
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
        this.stick.classList.add('on');
        this.knob.style.transform = 'translate(-50%,-50%)';
      }
      e.preventDefault();
    }, { passive: false });
    // --- look (right half)
    zoneR.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.lookId !== null) break;
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.active) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          const R = 56 * settings.touchScale;
          let dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
          const l = Math.hypot(dx, dy);
          if (l > R) {
            // drag the stick origin along (floating stick)
            const k = (l - R) / l;
            this.stickOrigin.x += dx * k;
            this.stickOrigin.y += dy * k;
            this.stick.style.left = `${this.stickOrigin.x}px`;
            this.stick.style.top = `${this.stickOrigin.y}px`;
            dx = t.clientX - this.stickOrigin.x;
            dy = t.clientY - this.stickOrigin.y;
          }
          this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          const nx = dx / R, ny = dy / R;
          const dz = 0.12;
          const mag = Math.min(1, Math.hypot(nx, ny));
          const m2 = mag < dz ? 0 : (mag - dz) / (1 - dz);
          const ang = Math.atan2(ny, nx);
          this.input.touchMoveX = Math.cos(ang) * m2;
          this.input.touchMoveY = -Math.sin(ang) * m2;
          // push stick far forward = sprint
          this.input.touchSprint = this.sprintLatch || (-ny > 0.95 && l > R * 0.98);
        } else if (t.identifier === this.lookId || t.identifier === this.fireLookId) {
          const last = t.identifier === this.lookId ? this.lookLast : this.fireLast;
          const dx = t.clientX - last.x, dy = t.clientY - last.y;
          last.x = t.clientX;
          last.y = t.clientY;
          const s = 2.2 * settings.touchSensitivity;
          this.input.lookDX += dx * s;
          this.input.lookDY += dy * s;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          this.stickId = null;
          this.input.touchMoveX = this.input.touchMoveY = 0;
          this.input.touchSprint = this.sprintLatch;
          this.stick.classList.remove('on');
        }
        if (t.identifier === this.lookId) this.lookId = null;
        if (t.identifier === this.fireLookId) {
          this.fireLookId = null;
          this.input.fire = false;
          this.btns.fire.classList.remove('down');
          this.btns.fire2.classList.remove('down');
        }
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    // --- buttons
    const press = (id: string, down: () => void, up?: () => void, lookThrough = false) => {
      const b = this.btns[id];
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('down');
        down();
        if (lookThrough && this.fireLookId === null) {
          const t = e.changedTouches[0];
          this.fireLookId = t.identifier;
          this.fireLast = { x: t.clientX, y: t.clientY };
        }
      }, { passive: false });
      if (!lookThrough)
        b.addEventListener('touchend', (e) => {
          e.preventDefault();
          b.classList.remove('down');
          up?.();
        });
    };
    // fire button doubles as a look pad (drag while firing)
    press('fire', () => { this.input.fire = true; }, undefined, true);
    press('fire2', () => { this.input.fire = true; }, undefined, true);
    press('jump', () => { this.input.jumpPressed = true; this.input.jumpHeld = true; }, () => { this.input.jumpHeld = false; });
    press('aim', () => { this.aimLatch = !this.aimLatch; this.input.aim = this.aimLatch; this.btns.aim.classList.toggle('latched', this.aimLatch); });
    press('reload', () => { this.input.reloadPressed = true; });
    press('swap', () => { this.input.cycle = 1; });
    press('nade', () => { this.input.grenadePressed = true; });
    press('sprint', () => { this.sprintLatch = !this.sprintLatch; this.input.touchSprint = this.sprintLatch; this.btns.sprint.classList.toggle('latched', this.sprintLatch); });
    press('pause', () => this.onPause?.());
    press('score', () => { this.sbOn = !this.sbOn; this.onScoreboard?.(this.sbOn); });
  }
  private fireLast = { x: 0, y: 0 };
  private aimLatch = false;
  private sprintLatch = false;
  private sbOn = false;

  private div(cls: string) {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  setActive(v: boolean) {
    this.active = v;
    this.root.classList.toggle('hidden', !v);
    document.body.classList.toggle('touch-ui', v);
    this.root.style.setProperty('--ts', String(settings.touchScale));
    if (!v) {
      this.stickId = this.lookId = this.fireLookId = null;
      this.aimLatch = false;
      this.sprintLatch = false;
      this.input.aim = false;
      this.input.fire = false;
      this.input.touchMoveX = this.input.touchMoveY = 0;
      this.input.touchSprint = false;
      Object.values(this.btns).forEach((b) => b.classList.remove('down', 'latched'));
    }
  }

  /** Reset aim latch (e.g. after switching weapons / dying). */
  resetAim() {
    this.aimLatch = false;
    this.input.aim = false;
    this.btns.aim.classList.remove('latched');
  }

  setWeaponHasScope(v: boolean) {
    this.btns.aim.classList.toggle('dim', !v);
  }
}
