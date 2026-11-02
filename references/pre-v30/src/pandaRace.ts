export const pandaRacers = [
  { name: '红豆', english: 'Ruby', color: '#bf654e', trait: '起跑像小火箭', rhythm: [1.4, 1.15, .8, .9, 1], bounce: '.29s' },
  { name: '布丁', english: 'Pudding', color: '#aa7c29', trait: '小步子不停歇', rhythm: [1, 1, 1, 1, 1], bounce: '.38s' },
  { name: '豆苗', english: 'Sprout', color: '#4d866e', trait: '越跑越有劲', rhythm: [.75, .85, 1, 1.15, 1.4], bounce: '.33s' },
  { name: '泡泡', english: 'Bubbles', color: '#518dba', trait: '蹦蹦跳跳向前跑', rhythm: [.9, 1.35, .8, 1.3, 1], bounce: '.43s' },
  { name: '花花', english: 'Blossom', color: '#9970aa', trait: '最后再冲一小段', rhythm: [1, .85, .85, 1, 1.5], bounce: '.36s' },
] as const;
// Keep the saved race timeline compatible; the spoken countdown runs before this offset.
export const RACE_COUNTDOWN_MS = 3600;
export const RACE_REQUIRED_SECONDS = 25;
export interface PandaRace {
  id: string; seed: number; picked: number; language: 'zh-CN' | 'en-US'; startedAt: string; settledAt?: string;
}
export function racePlan(seed: number) {
  let value = seed >>> 0;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  const order = [0, 1, 2, 3, 4];
  for (let i = 4; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const runners = pandaRacers.map((racer, lane) => ({
    finishMs: 12000 + order.indexOf(lane) * 650 + Math.floor(random() * 300),
    strides: racer.rhythm.map(weight => weight * (.8 + random() * .4)),
  }));
  return { order, runners, duration: RACE_COUNTDOWN_MS + Math.max(...runners.map(r => r.finishMs)) };
}
export function racePosition(runner: ReturnType<typeof racePlan>['runners'][number], elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / runner.finishMs)) * runner.strides.length;
  const segment = Math.floor(t), sum = runner.strides.reduce((a, b) => a + b, 0);
  const covered = runner.strides.slice(0, segment).reduce((a, b) => a + b, 0) + (runner.strides[segment] ?? 0) * (t - segment);
  return covered / sum;
}
export const raceLines = {
  'zh-CN': { intro: '五只小猪，选一只，为它加油吧！', ready: '准备好了吗？小猪要出发啦！', three: '三', two: '二', one: '一', go: '出发', cheer: '小猪小猪，加油呀！', win: '猜中啦！送你一枚小金币。', finish: '大家都跑到啦！每只小猪都很棒。', pick0: '红豆，起跑像小火箭。', pick1: '布丁，小步子不停歇。', pick2: '豆苗，越跑越有劲。', pick3: '泡泡，蹦蹦跳跳向前跑。', pick4: '花花，最后再冲一小段。' },
  'en-US': { intro: 'Five little pigs! Pick a friend to cheer for.', ready: 'Three, two, one, go!', three: 'Three', two: 'Two', one: 'One', go: 'Go', cheer: 'Go, little pig, go!', win: 'You guessed it! Here is one coin.', finish: 'Everyone made it! Well done, little pigs.', pick0: 'Ruby! Ready, set, go!', pick1: 'Pudding! Keep on running!', pick2: 'Sprout! Faster and faster!', pick3: 'Bubbles! Jump and run!', pick4: 'Blossom! Go for the finish!' },
} as const;
export type RaceLine = keyof typeof raceLines['en-US'];
export const raceAudio = (key: RaceLine, language: 'zh-CN' | 'en-US') => `/audio/race-${['three','two','one','go'].includes(key) ? 'v29' : 'v25'}-${language === 'zh-CN' ? 'zh' : 'en'}-${key}.mp3`;

export const countdownSteps = ['three', 'two', 'one', 'go'] as const;
export const COUNTDOWN_HOLD_MS = 1500;
