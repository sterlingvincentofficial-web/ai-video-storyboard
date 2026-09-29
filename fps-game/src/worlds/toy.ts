// Placeholder — replaced by the real toy world.
import { plaza } from './plaza';
import type { WorldDef } from './types';

export const toy: WorldDef = { ...plaza, theme: { ...plaza.theme, id: 'toy', name: 'toy (WIP)' } };
