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

if (q.get('debug')) debugView(q.get('debug') as WorldId);
else boot();
