import { expansionConcepts, themeConcepts, oceanConcepts, dailyConcepts, wardrobeGardenConcepts, vehicleConcepts, familyVehicleConcepts, homeNatureConcepts, isAmbiguousVehiclePair, type Concept } from './concepts.ts';
import type { Language } from './engine.ts';

// Saves without a pool version keep the original order and therefore the same questions.
export const BUBBLE_CONCEPTS: readonly Concept[] = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'apple', 'banana', 'orange', 'strawberry', 'rabbit', 'bear', 'duck', 'car', 'bus', 'sun', 'moon', 'red-monster'];

export function bubbleConcepts(version = 1, language: Language = 'en-US'): readonly Concept[] {
  return version >= 2 && (language === 'en-US' || version >= 5) ? [...BUBBLE_CONCEPTS, ...expansionConcepts, ...(version >= 3 ? themeConcepts : []), ...(version >= 4 ? oceanConcepts : []), ...(version >= 6 ? dailyConcepts : []), ...(version >= 7 ? wardrobeGardenConcepts : []), ...(version >= 8 ? vehicleConcepts : []), ...(version >= 9 ? familyVehicleConcepts : []), ...(version >= 10 ? homeNatureConcepts : [])] : BUBBLE_CONCEPTS;
}

export function getBubbleRound(gameId: string, toyId: string, progress: number, version = 1, language: Language = 'en-US'): { target: Concept; choices: Concept[] } {
  if (!Number.isInteger(progress) || progress < 0 || progress >= 3) throw new Error('泡泡回合无效。');
  const pool = bubbleConcepts(version, language);
  let seed = 0;
  for (const char of gameId) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  // Legacy prizes without recorded words keep their prize and use an available listening prompt.
  const toy = pool.find(concept => concept === toyId) ?? pool[seed % pool.length];
  const others = pool.filter(concept => concept !== toy);
  const first = others.splice(seed % others.length, 1)[0];
  const targets = [toy, first, others[Math.floor(seed / 17) % others.length]];
  const target = targets[(seed % 3 + progress) % 3];
  const distractors = pool.filter(concept => concept !== target && (version < 9 || !isAmbiguousVehiclePair(target, concept)));
  const offset = (seed + progress * 5) % distractors.length;
  const choices = [distractors[offset], distractors[(offset + 7) % distractors.length]];
  choices.splice((Math.floor(seed / 3) + progress) % 3, 0, target);
  return { target, choices };
}
