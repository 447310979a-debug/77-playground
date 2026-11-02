import { freshFoodConcepts, type Concept } from './concepts.ts';
import type { Language } from './engine.ts';

export type StoryKind = 'hide' | 'kitchen';
export const hidingPlaces = ['沙发靠垫后', '衣柜里', '窗帘后'] as const;

// Version 1 pools stay fixed so reloading a paid round never changes its hiding places or order.
export function storyPool(kind: StoryKind, language: Language, version = 1): readonly Concept[] {
  if (kind === 'kitchen') return (language === 'en-US' || version >= 2)
    ? ['apple', 'banana', 'orange', 'strawberry', 'grape', 'pear', 'bread', 'egg', ...(version >= 3 ? freshFoodConcepts : [])]
    : ['apple', 'banana', 'orange', 'strawberry'];
  return (language === 'en-US' || version >= 2)
    ? ['cat', 'dog', 'rabbit', 'bear', 'duck', 'bird', 'red-monster', 'lion', 'tiger', 'elephant', 'monkey']
    : ['cat', 'dog', 'rabbit', 'bear', 'duck', 'bird', 'red-monster'];
}

export function getStoryRound(id: string, progress: number, kind: StoryKind, language: Language, version = 1) {
  if (!Number.isInteger(progress) || progress < 0 || progress > 2) throw new Error('小游戏回合无效。');
  let seed = 0;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const pool = storyPool(kind, language, version);
  const target = pool[(seed % pool.length + progress) % pool.length];
  const others = pool.filter(concept => concept !== target);
  const offset = (Math.floor(seed / 5) + progress) % others.length;
  const choices = [others[offset], others[(offset + 1) % others.length]];
  choices.splice((Math.floor(seed / 3) + progress) % 3, 0, target);
  return { target, choices };
}
