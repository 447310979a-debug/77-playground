import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { finishPandaRace, getRemainingSeconds, startPandaRace, type State } from './engine'
import { pandaRacers, racePlan, racePosition, RACE_COUNTDOWN_MS, raceAudio, countdownSteps, COUNTDOWN_HOLD_MS, RACE_REQUIRED_SECONDS, type RaceLine } from './pandaRace'
import { PandaPig } from './PandaPig'
import { createPusherSound } from './pusherSound'
import './pandaRace.css'

type Props = {
  state: State; busy: boolean; paused: boolean;
  run: (action: (current: State) => State) => Promise<State | null>;
  playAudio: (url: string, onStarted?: () => void) => Promise<boolean>; stopAudio: () => void;
}

export function PandaRaceGame({ state, busy, paused, run, playAudio, stopAudio }: Props) {
  const race = state.race;
  const [picked, setPicked] = useState<number | null>(race?.picked ?? null);
  const [choosing, setChoosing] = useState(!race);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countStep, setCountStep] = useState(0);
  const [countLabel, setCountLabel] = useState<string | null>(null);
  const [countError, setCountError] = useState(false);
  const clock = useRef(0), lock = useRef(false), cheerAt = useRef(0);
  const [cheering, setCheering] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sound = useRef<ReturnType<typeof createPusherSound> | null>(null);
  const plan = useMemo(() => racePlan(race?.seed ?? 77), [race?.seed]);
  const finished = !choosing && !!race?.settledAt;
  const active = !choosing && !!race && !finished;
  const language = active || finished ? race!.language : state.settings.language;
  const english = language === 'en-US';
  const winner = plan.order[0], won = finished && race!.picked === winner;
  const time = finished ? plan.duration : elapsed;
  const countdown = active && countStep < countdownSteps.length;
  const progress = plan.runners.map(r => choosing ? 0 : racePosition(r, time - RACE_COUNTDOWN_MS));
  const leader = progress.some(p => p >= 1) ? winner : progress.indexOf(Math.max(...progress));
  const display = (lane: number) => english ? pandaRacers[lane].english : pandaRacers[lane].name;
  const speak = (key: RaceLine) => void playAudio(raceAudio(key, language));
  const selected = choosing ? picked : race?.picked;
  const unavailable = busy || paused;

  useEffect(() => () => { sound.current?.close(); clearTimeout(cheerTimer.current); stopAudio(); }, [stopAudio]);
  useEffect(() => { if (paused) sound.current?.stop(); }, [paused]);

  useEffect(() => {
    if (!running || paused || !countdown) return;
    let cancelled = false, startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setCountError(false);
    void playAudio(raceAudio(countdownSteps[countStep], language), () => {
      if (cancelled) return;
      startedAt = performance.now();
      setCountLabel(countStep < 3 ? String(3 - countStep) : english ? 'Go!' : '出发！');
    }).then(ok => {
      if (cancelled) return;
      if (!ok || !startedAt) { setCountError(true); setRunning(false); return; }
      // Advance only after both the spoken number and its minimum display time finish.
      timer = setTimeout(() => {
        if (cancelled) return;
        if (countStep === 3) { clock.current = RACE_COUNTDOWN_MS; setElapsed(RACE_COUNTDOWN_MS); }
        setCountStep(countStep + 1);
      }, Math.max(0, COUNTDOWN_HOLD_MS - (performance.now() - startedAt)));
    });
    return () => { cancelled = true; clearTimeout(timer); stopAudio(); };
  }, [running, paused, countdown, countStep, language, english, playAudio, stopAudio]);

  async function settle() {
    if (!race || lock.current) return;
    lock.current = true;
    try {
      const next = await run(current => finishPandaRace(current, race.id));
      if (next?.race?.settledAt) {
        const win = next.race.picked === racePlan(next.race.seed).order[0];
        if (win) { sound.current?.resume(); sound.current?.impact(1); }
        speak(win ? 'win' : 'finish');
      }
    } finally { lock.current = false; }
  }

  useEffect(() => {
    if (!running || paused || !active || !race || countdown) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) clock.current = Math.min(plan.duration, clock.current + now - last);
      last = now; setElapsed(clock.current);
      if (clock.current >= plan.duration) { setRunning(false); void settle(); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, paused, active, race?.id, plan.duration, countdown]);

  async function begin() {
    if (picked === null || unavailable || lock.current) return;
    lock.current = true;
    sound.current ??= createPusherSound(); sound.current.unlock();
    try {
      const next = await run(current => startPandaRace(current, picked));
      if (!next?.race) return;
      clock.current = 0; setElapsed(0); setCountStep(0); setCountLabel(null); setChoosing(false); setRunning(true);
    } finally { lock.current = false; }
  }

  function cheer() {
    if (performance.now() - cheerAt.current < 1800) return;
    cheerAt.current = performance.now(); setCheering(true); speak('cheer');
    clearTimeout(cheerTimer.current); cheerTimer.current = setTimeout(() => setCheering(false), 1100);
  }

  return <section className={`panda-race ${running && !paused ? 'is-running' : ''} ${finished ? 'is-finished' : ''} ${cheering ? 'is-cheering' : ''}`} aria-label="熊猫猪猪五道赛跑">
    <div className="race-banner"><span>小猪运动会 <small>PANDA PIG FIELD DAY</small></span><span className="race-ticket">免费参加 · 猜中 +1 币</span></div>
    <div className="race-content">
      <aside className="race-lineup">
        <div className="race-lineup-heading"><strong>{choosing ? '选一位，给它加油' : '我的加油小队'}</strong><button className="race-listen" aria-label="听听赛跑怎么玩" disabled={unavailable || running} onClick={() => speak('intro')}>♪</button></div>
        <div className="race-picks">{pandaRacers.map((racer, lane) => <button key={racer.name} className={`race-pick ${selected === lane ? 'selected' : ''}`} style={{ '--racer-color': racer.color } as CSSProperties} aria-label={`支持${lane + 1}号${racer.name}`} aria-pressed={selected === lane} disabled={unavailable || !choosing} onClick={() => { setPicked(lane); speak(`pick${lane}` as RaceLine); }}>
          <span className="race-pick-number">{lane + 1}</span><PandaPig lane={lane}/><span className="race-pick-text"><strong>{display(lane)}</strong><small>{racer.trait}</small></span><span className="race-picked-mark" aria-hidden="true">{selected === lane ? '♥' : '○'}</span>
        </button>)}</div>
      </aside>
      <div className="race-course">
        <div className="race-landscape" aria-hidden="true"><span className="race-sun">☀</span><span className="race-pennants">▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾</span><span className="race-farm">77 · 两头乌小牧场</span><span className="race-cloud" /></div>
        <div className="race-track" aria-label="五条小猪跑道">
          <div className="race-finish-line" aria-hidden="true"><span>终点</span></div>
          {pandaRacers.map((racer, lane) => <div className={`race-lane ${selected === lane ? 'supported' : ''} ${finished && winner === lane ? 'winner' : ''}`} key={racer.name} style={{ '--racer-color': racer.color } as CSSProperties}>
            <span className="race-lane-number">{lane + 1}</span><div className="race-runway"><div className="race-runner" style={{ left: `${progress[lane] * 100}%`, '--stride': racer.bounce } as CSSProperties}>
              {selected === lane && <span className="race-support-flag">♥</span>}<span className="race-dust"/><PandaPig lane={lane} className={progress[lane] >= 1 ? 'crossed' : ''}/>
              {progress[lane] >= 1 && <span className="race-place">{plan.order.indexOf(lane) === 0 ? '★' : plan.order.indexOf(lane) + 1}</span>}
            </div></div>
          </div>)}
          {countdown && running && <div className="race-countdown" aria-live="polite"><strong key={countLabel}>{countLabel ?? (english ? 'Ready' : '预备')}</strong><span>{english ? "Count with me!" : "一起慢慢数，准备出发"}</span></div>}
          {finished && <div className="race-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties}/>)}</div>}
        </div>
        <div className="race-course-caption">{finished ? `★ ${display(winner)} 冲线第一名！` : active && time > RACE_COUNTDOWN_MS ? `${display(leader)} 跑在前面！` : '黑脑袋、黑尾巴，白肚皮的小猪准备好啦。'}</div>
      </div>
    </div>
    <div className="race-bottom">
      <div className="race-status" role="status"><strong>{finished ? won ? '猜中冠军啦！ +1 币' : `${display(winner)} 赢啦，给每只小猪拍拍手！` : active ? running ? countdown ? '预备，马上出发！' : `${display(race!.picked)}，加油！` : countError ? '倒数声音没有播出来，点继续再试一次。' : '这一场还在，接着看小猪跑吧。' : picked === null ? '你觉得谁会先跑到？' : `你支持 ${display(picked)}，准备出发！`}</strong><small>{finished ? won ? '小金币已放进口袋，可以去玩其他小游戏。' : '这次没猜中也没关系，没有扣金币。' : '每只都有机会赢 · 猜错不扣币'}</small></div>
      <div className="race-actions">
        {choosing ? <button className="primary" disabled={unavailable || picked === null || getRemainingSeconds(state) < RACE_REQUIRED_SECONDS} onClick={() => void begin()}>开始赛跑 →</button>
          : finished ? <button className="primary" disabled={unavailable} onClick={() => { setChoosing(true); setPicked(null); setRunning(false); clock.current = 0; setElapsed(0); stopAudio(); }}>再选一位朋友 ↻</button>
          : running ? <><button className="secondary" aria-label="暂停赛跑" disabled={unavailable} onClick={() => { setRunning(false); stopAudio(); }}>Ⅱ</button><button className="primary" disabled={unavailable || countdown} onClick={cheer}>给小猪加油 ♥</button></>
          : <button className="primary" disabled={unavailable} onClick={() => { if (elapsed >= plan.duration) void settle(); else { sound.current?.resume(); setRunning(true); } }}>{elapsed >= plan.duration ? '保存比赛结果' : '继续这场赛跑 →'}</button>}
      </div>
    </div>
  </section>
}
