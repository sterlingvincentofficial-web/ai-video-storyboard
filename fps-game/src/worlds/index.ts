import type { WorldDef, WorldId } from './types';
import { plaza } from './plaza';
import { paper } from './paper';
import { comic } from './comic';
import { toy } from './toy';
import { neon } from './neon';

export const WORLDS: Record<WorldId, WorldDef> = { plaza, paper, comic, toy, neon };

export const WORLD_ORDER: WorldId[] = ['plaza', 'paper', 'comic', 'toy', 'neon'];
