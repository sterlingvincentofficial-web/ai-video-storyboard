import { debugView } from './debug';
import type { WorldId } from './worlds/types';

const q = new URLSearchParams(location.search);
if (q.get('debug')) debugView(q.get('debug') as WorldId);
