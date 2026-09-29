import './ui/styles.css';
import { debugView } from './debug';
import type { WorldId } from './worlds/types';
import { Game } from './game/Game';
import { Menu } from './ui/Menu';
import { settings } from './core/Settings';
import { audio } from './core/Audio';

const q = new URLSearchParams(location.search);

function boot() {
  const app = document.getElementById('app')!;
  const game = new Game(app);
  const menu = new Menu(app, game);
  audio.setVolumes(settings.master, settings.music, settings.sfx);
  game.startAttract(settings.lastWorld);
  // first gesture anywhere unlocks audio (autoplay policies)
  const unlock = () => {
    audio.unlock();
    audio.startMusic(game.state === 'menu' ? 'menu' : (game.worldId ?? 'menu'));
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
  (window as unknown as { __game: Game; __menu: Menu }).__game = game;
  (window as unknown as { __game: Game; __menu: Menu }).__menu = menu;
  document.getElementById('boot')?.remove();
  // test hook: ?autostart=world:mode
  const auto = q.get('autostart');
  if (auto) {
    const [w, m] = auto.split(':');
    settings.lastWorld = (w as WorldId) || settings.lastWorld;
    settings.lastMode = m || settings.lastMode;
    menu.startMatch();
  }
}

/** Wait (briefly) for the web fonts so canvas-drawn labels use them. */
async function fontsReady() {
  const fonts = ['20px "Luckiest Guy"', '20px Bangers', '700 20px Fredoka', '20px "Permanent Marker"', '700 20px Orbitron'];
  try {
    await Promise.race([
      Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fonts API unavailable */
  }
}

if (q.get('debug')) debugView(q.get('debug') as WorldId);
else fontsReady().then(boot);
