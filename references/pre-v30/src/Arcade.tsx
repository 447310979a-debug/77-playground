import { useEffect, useRef, useState } from 'react'
import './arcade.css'
import type { CSSProperties } from 'react'
import { Art } from './Art'
import { CoinPusher } from './CoinPusher'
import { BubbleGame } from './BubbleGame'
import { StoryGame } from './StoryGame'
import { KitchenGame } from './KitchenGame'
import type { RecipeId } from './recipes'
import { conceptNames, toyConcepts, trialItems } from './content'
import type { Concept } from './content'
import { attemptClaw, CLAW_CATCH_RADIUS, claimGame, getRemainingSeconds, moveClaw, startGame } from './engine'
import type { GameKind, State } from './engine'

type Props = {
  state: State; kind: GameKind; selectedToy: Concept; onSelectToy: (toy: Concept) => void;
  busy: boolean; paused: boolean; run: (action: (current: State) => State, queued?: boolean) => Promise<State | null>;
  onClaim: () => void; onSpeak: (toy: string) => void; onPrompt: (toy: string) => Promise<boolean>;
  playAudio: (url: string) => Promise<boolean>;
}

function ClawGraphic() {
  return <g className="crane-head">
    <path className="finger-left" d="M-20 18 -72 60 -70 104 -60 110" fill="none" stroke="#719497" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <path className="finger-right" d="M20 18 72 60 70 104 60 110" fill="none" stroke="#719497" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="-24" width="48" height="28" rx="11" fill="url(#claw-metal)" stroke="#597c7d" strokeWidth="3" />
    <circle cy="13" r="5" fill="#edbd61" />
  </g>
}

export function Arcade({ state, kind, selectedToy, onSelectToy, busy, paused, run, onClaim, onSpeak, onPrompt, playAudio }: Props) {
  const [recipe, setRecipe] = useState<RecipeId>('salad')
  const active = Boolean(state.game && !state.game.claimedAt)
  const game = active ? state.game : null
  const language = game?.language ?? state.settings.language
  const availableToys = toyConcepts.filter(concept => trialItems.some(item => item.concept === concept && item.language === state.settings.language))
  const selection = availableToys.includes(selectedToy) ? selectedToy : 'red-monster'
  const toy = game?.toyId ?? selection
  const claw = game?.claw
  const caught = Boolean(game && (!claw || claw.caught))
  const position = claw?.position ?? 50
  const target = claw?.target ?? 65
  const aligned = Math.abs(position - target) <= CLAW_CATCH_RADIUS
  const [animating, setAnimating] = useState(false)
  const [dropHit, setDropHit] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationLock = useRef(false)
  const unavailable = busy || paused || animating

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    animationLock.current = false
    setAnimating(false)
    return () => { if (timer.current) clearTimeout(timer.current); animationLock.current = false }
  }, [game?.id, paused])

  async function start() {
    const next = await run(current => startGame(current, selection, new Date(), kind, recipe))
    if (next && (kind === 'claw' || kind === 'pusher')) onSpeak(selection)
  }
  async function claim() {
    const next = await run(current => claimGame(current))
    if (next) onClaim()
  }
  function move(delta: number) {
    if (!game || !claw || unavailable) return
    void run(current => moveClaw(current, game.id, Math.max(0, Math.min(100, position + delta))))
  }
  function drop() {
    if (!game || !claw || unavailable || animationLock.current || caught) return
    animationLock.current = true
    setAnimating(true)
    setDropHit(aligned)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = setTimeout(async () => {
      const next = await run(current => attemptClaw(current, game.id, claw.attempts))
      animationLock.current = false
      setAnimating(false)
      if (next?.game?.claw?.caught) onSpeak(toy)
    }, reduced ? 200 : aligned ? 5400 : 2600)
  }
  const label = (value: string) => trialItems.find(item => item.concept === value && item.language === language)?.target ?? value
  const choices = ['red-monster', ...availableToys.filter(value => value !== 'red-monster')] as Concept[]
  const selector = !active && <div className="arcade-friends"><p>先选一位想带回家的朋友<span className="friend-scroll-note">上下滑动，看看其他朋友</span></p><div className="arcade-friend-grid">{choices.map(value => <button key={value} className={selection === value ? 'selected' : ''} aria-label={'选择' + conceptNames[value]} aria-pressed={selection === value} disabled={unavailable} onClick={() => onSelectToy(value)}><Art concept={value} /><span>{label(value)}</span></button>)}</div></div>
  const beginButton = <button className="primary arcade-start" disabled={unavailable || state.balance < 1 || getRemainingSeconds(state) < 45} onClick={() => void start()}>1 币 · 开始玩 <span>✦</span></button>
  const claimButton = <button className="primary arcade-claim" disabled={unavailable} onClick={() => void claim()}>抱回我的小屋 <span>♡</span></button>

  return <div className={`arcade ${active ? 'has-active-game' : 'choosing-friend'}`}>
    <section className={`arcade-cabinet ${kind} ${active ? 'is-playing' : ''}`}>
      <div className="arcade-marquee"><span>✦</span>{kind === 'claw' ? 'THE LITTLE CLAW CLUB' : kind === 'pusher' ? 'PUSH A LITTLE JOY' : kind === 'hide' ? 'PEEKABOO, LITTLE FRIEND!' : kind === 'kitchen' ? 'A LITTLE TREAT, A BIG SMILE' : 'POP & SAY HELLO'}<span>✦</span></div>
      {kind === 'claw' ? <>
        <div className={`crane-glass ${animating ? 'is-dropping' : ''} ${dropHit ? 'drop-hit' : 'drop-miss'} ${active && caught ? 'is-caught' : ''}`} style={{'--aim-x': `${100 + position * 4}px`, '--target-x': `${100 + target * 4}px`} as CSSProperties}>
          <svg className="crane-scene" viewBox="0 0 600 520" role="img" aria-label={caught ? '小伙伴已经穿过机器，来到下方打开的取物仓' : '移动爪子抱住小伙伴，送进通道，再从下方取物仓滑出来'}>
            <defs><linearGradient id="claw-metal"><stop stopColor="#c6dfdf" /><stop offset=".5" stopColor="#edf5ed" /><stop offset="1" stopColor="#719497" /></linearGradient><pattern id="crane-floor-lines" width="48" height="42" patternUnits="userSpaceOnUse"><rect width="48" height="42" fill="#eadaba"/><rect width="24" height="42" fill="#f2e4ca"/></pattern></defs>
            <text x="300" y="215" textAnchor="middle" fill="#d4e1cb" fontSize="72" fontWeight="800">77</text>
            <path d="M70 195l6 9-6 9-6-9zM540 155l6 9-6 9-6-9z" fill="#ebd198"/>
            <rect x="42" y="28" width="516" height="12" rx="6" fill="#9cbdb2" stroke="#76998d" strokeWidth="2"/>
            <path d="M0 368H600V520H0Z" fill="url(#crane-floor-lines)" stroke="#d4c19c" strokeWidth="3"/>
            <path d="M410 366V341Q480 318 550 341V366Z" fill="#8fae98" stroke="#6b8c7b" strokeWidth="3"/>
            <ellipse className="crane-chute" cx="480" cy="350" rx="65" ry="18" fill="#37594e" stroke="#b9cdb0" strokeWidth="4"/>
            <rect x="396" y="418" width="168" height="90" rx="14" fill="#37594e"/>
            <path d="M404 487Q480 502 556 487V508H404Z" fill="#9bb49b"/>
            {active && !caught && <g className={`aim-guide ${aligned ? 'aligned' : ''}`}><path d="M0 192V363" stroke="#c5aa77" strokeWidth="2" strokeDasharray="5 7"/><ellipse cy="369" rx="35" ry="6"/></g>}
            <g className="crane-prize"><foreignObject x="-56" width="112" height="112"><Art concept={toy}/></foreignObject></g>
            <g className="crane-trolley"><path className="crane-cable" d="M0 42V82" stroke="#88a79b" strokeWidth="4"/><ClawGraphic/><rect x="-22" y="20" width="44" height="23" rx="6" fill="#d5e3d4" stroke="#76998d" strokeWidth="3"/></g>
            {/* The solid fascia hides the same moving toy between the inlet and the lower hatch. */}
            <path className="crane-front" fillRule="evenodd" d="M0 368H600V520H0Z M412 418H548Q564 418 564 434V492Q564 508 548 508H412Q396 508 396 492V434Q396 418 412 418Z" fill="url(#crane-floor-lines)"/>
            <path d="M0 368H600M0 382H600" stroke="#cbb88f" strokeWidth="5"/>
            <path d="M412 361Q480 380 548 361V373Q480 389 412 373Z" fill="#719782" stroke="#b9cdb0" strokeWidth="3"/>
            <g className="crane-hatch">
              <rect x="399" y="420" width="162" height="85" rx="11" fill="#b1c6a9" stroke="#76998d" strokeWidth="3"/>
              <path d="M470 449L480 459L490 449M480 437V459" stroke="#fff9e6" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="453" y="478" width="54" height="6" rx="3" fill="#76998d"/>
            </g>
            <rect x="394" y="416" width="172" height="94" rx="17" fill="none" stroke="#779c86" strokeWidth="7"/>
            <path className="crane-cushion" d="M399 499Q480 507 561 499V510H399Z" fill="#cba565" stroke="#e7c890" strokeWidth="3"/>
            <g className="crane-arrival-glow" fill="#f5d57f"><path d="m378 443 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="m576 466 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></g>
            <circle className="crane-arrival-light" cx="361" cy="435" r="5" fill="#8fae98"/>
            <text x="480" y="402" textAnchor="middle" fill="#557561" fontSize="12" letterSpacing="1">取 物 仓</text>
            <text x="40" y="438" fill="#7c8c6e" fontSize="14" letterSpacing="2">HELLO, FRIEND!</text>
            <text x="40" y="465" fill="#9b8966" fontSize="12">从这里，回到你的小屋 ♡</text>
          </svg>
        </div>
        <p className="arcade-feedback" aria-live="polite">{!active ? '毛绒朋友准备好啦！' : animating ? '抱起来，送进通道，咚！从下面出来啦…' : caught ? '取物仓打开啦！把小伙伴带回家吧。' : (claw?.attempts ?? 0) > 0 && !aligned ? `差一点点，往${position < target ? '右' : '左'}挪一挪，再试试。` : aligned ? '对准啦，试着按下爪！' : '点左右箭头，把爪子移到朋友上方。'}</p>
        <div className="crane-controls">{!active ? beginButton : caught ? claimButton : <>
          <button className="crane-direction" aria-label="爪子向左移动" disabled={unavailable || position <= 0} onClick={() => move(-10)}>←</button>
          <button className="primary crane-drop" disabled={unavailable} onClick={drop}>{animating ? '抓取中…' : '下爪'}<span>↓</span></button>
          <button className="crane-direction" aria-label="爪子向右移动" disabled={unavailable || position >= 100} onClick={() => move(10)}>→</button>
        </>}</div>
        {active && !caught && <p className="arcade-small-note">没抓中也没关系，这一局可以接着试，不再扣币。</p>}
      </> : kind === 'pusher' ? <CoinPusher game={game} toy={toy} busy={busy} paused={paused} run={run} startButton={beginButton} claimButton={claimButton} onSpeak={onSpeak} /> : kind === 'kitchen' && (!game || game.cooking) ? <KitchenGame game={game} recipeId={recipe} onRecipe={setRecipe} language={language} busy={busy} paused={paused} run={run} startButton={beginButton} claimButton={claimButton} playAudio={playAudio} /> : kind === 'hide' || kind === 'kitchen' ? <StoryGame kind={kind} game={game} toy={toy} language={language} busy={busy} paused={paused} run={run} startButton={beginButton} claimButton={claimButton} onPrompt={onPrompt} onSpeak={onSpeak} /> : <BubbleGame game={game} toy={toy} language={language} busy={busy} paused={paused} run={run} startButton={beginButton} claimButton={claimButton} onPrompt={onPrompt} onSpeak={onSpeak} />}
    </section>
    {selector}
  </div>
}
