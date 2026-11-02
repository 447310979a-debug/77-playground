import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { Art } from './Art'
import { conceptNames, trialItems } from './content'
import { answerStory } from './engine'
import type { Game, State } from './engine'
import { getStoryRound, hidingPlaces } from './storyGames'
import type { StoryKind } from './storyGames'

type Round = ReturnType<typeof getStoryRound>
type Flight = { slot: number; x: number; y: number; dx: number; dy: number }
export function StoryGame({ kind, game, toy, language, busy, paused, run, startButton, claimButton, onPrompt, onSpeak }: {
  kind: StoryKind; game: Game | null; toy: string; language: State['settings']['language']; busy: boolean; paused: boolean;
  run: (action: (state: State) => State) => Promise<State | null>;
  startButton: ReactNode; claimButton: ReactNode; onPrompt: (concept: string) => Promise<boolean>; onSpeak: (concept: string) => void;
}) {
  const progress = game?.progress ?? 0
  const round = getStoryRound(game?.id ?? 'free-story-demo', Math.min(progress, 2), kind, language, game?.story?.version ?? 3)
  const [celebrating, setCelebrating] = useState<{ round: Round; slot: number; progress: number; opened: number[] } | null>(null)
  const [demoDone, setDemoDone] = useState(false)
  const [demoOpened, setDemoOpened] = useState<number[]>([])
  const [moreClues, setMoreClues] = useState(false)
  const [heard, setHeard] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [wrong, setWrong] = useState<number | null>(null)
  const [message, setMessage] = useState('先点小喇叭，听听这次的小任务。')
  const [ghost, setGhost] = useState<{ slot: number; x: number; y: number } | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const monster = useRef<HTMLDivElement>(null)
  const foodButtons = useRef<(HTMLButtonElement | null)[]>([])
  const drag = useRef<{ pointer: number; slot: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const lock = useRef(false), generation = useRef(0), operation = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prompt = useRef(onPrompt); prompt.current = onPrompt
  const complete = game ? progress === 3 && !celebrating : demoDone
  const shown = celebrating?.round ?? round
  const opened = celebrating?.opened ?? game?.story?.opened ?? demoOpened
  const blocked = paused || busy || !heard || hearing || !!celebrating || complete || wrong !== null
  const item = trialItems.find(item => item.concept === shown.target && item.language === language)!

  function cancelDrag() { if (drag.current) suppressClick.current = true; drag.current = null; setGhost(null) }
  async function listen() {
    const token = ++generation.current
    setHeard(false); setHearing(true); setMessage('小耳朵听一听…')
    const ok = await prompt.current(round.target)
    if (token !== generation.current) return
    setHeard(ok); setHearing(false)
    setMessage(ok ? kind === 'hide' ? '看看露出的耳朵、小脸和鼻子，找找声音里的朋友。' : '把食物拖到怪兽嘴边；轻点食物也可以喂。' : '还没听清？点小喇叭再听一次。')
  }
  useEffect(() => {
    setMoreClues(false)
  }, [game?.id, progress, kind, language, demoDone])
  useEffect(() => {
    operation.current++; generation.current++; lock.current = false
    if (timer.current) clearTimeout(timer.current)
    setCelebrating(null); setWrong(null); setFlight(null); cancelDrag()
    setHeard(false); setHearing(false); setDemoDone(false); setDemoOpened([])
    return () => { operation.current++; generation.current++; if (timer.current) clearTimeout(timer.current) }
  }, [game?.id, kind, paused, language])
  useEffect(() => {
    if (game && !paused && progress < 3 && !celebrating) void listen()
    return () => { generation.current++ }
  }, [game?.id, progress, paused, Boolean(celebrating), language, kind])
  useEffect(() => {
    window.addEventListener('resize', cancelDrag)
    return () => window.removeEventListener('resize', cancelDrag)
  }, [])

  async function choose(slot: number, from?: { x: number; y: number }) {
    if (blocked || lock.current) return
    lock.current = true
    const token = operation.current
    const correct = round.choices[slot] === round.target
    if (!game && kind === 'hide') setDemoOpened(old => [...new Set([...old, slot])])
    if (correct) {
      setCelebrating({ round, slot, progress, opened: [...opened, slot] }); setMessage(kind === 'hide' ? '找到啦！出来一起玩吧。' : '啊呜——嚼一嚼，真好吃！')
      if (kind === 'kitchen') {
        const source = foodButtons.current[slot]!.getBoundingClientRect(), destination = monster.current!.getBoundingClientRect()
        const x = from?.x ?? source.x + source.width / 2, y = from?.y ?? source.y + source.height / 2
        setFlight({ slot, x, y, dx: destination.x + destination.width / 2 - x, dy: destination.y + destination.height * .56 - y })
      }
    }
    if (game) {
      const next = await run(current => answerStory(current, game.id, progress, slot, true))
      if (token !== operation.current) return
      if (!next || correct && next.game?.progress !== progress + 1) { setCelebrating(null); setFlight(null); lock.current = false; return }
    }
    if (!correct) {
      setWrong(slot); setMessage(kind === 'hide' ? '这里是另一位朋友，再找找看。' : '这次想吃另一样哦，再听听。')
      timer.current = setTimeout(() => { setWrong(null); lock.current = false; void listen() }, 800)
      return
    }
    timer.current = setTimeout(() => {
      setCelebrating(null); setFlight(null); lock.current = false
      if (!game) { setDemoDone(true); setMessage('你会玩啦！可以再试一次，也可以选伙伴开始完整一局。') }
      else if (progress === 2) onSpeak(toy)
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : kind === 'hide' ? 1500 : 2300)
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>, slot: number) {
    if (blocked || lock.current || drag.current || event.button !== 0) return
    suppressClick.current = false
    drag.current = { pointer: event.pointerId, slot, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId || blocked) return
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 7) active.moved = true
    if (active.moved) { suppressClick.current = true; setGhost({ slot: active.slot, x: event.clientX, y: event.clientY }) }
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = null; setGhost(null)
    if (!active.moved) return
    suppressClick.current = true
    const rect = monster.current!.getBoundingClientRect(), x = event.clientX, y = event.clientY
    if (x >= rect.left - 15 && x <= rect.right + 15 && y >= rect.top && y <= rect.bottom) void choose(active.slot, { x, y })
    else setMessage('食物回到盘子啦，拖到怪兽身上就可以。')
  }

  return <div className={`story-game story-${kind}${celebrating ? ' is-celebrating' : ''}${wrong !== null ? ' is-trying' : ''}${moreClues ? ' more-clues' : ''}${paused ? ' is-paused' : ''}`} data-round={progress}>
    <div className="story-question">
      <div><span className="story-round">{game ? `一起${kind === 'hide' ? '找朋友' : '做点心'} · ${Math.min((celebrating?.progress ?? progress) + 1, 3)} / 3` : '免费试一题 · 不用游戏币'}</span><h2>{complete ? kind === 'hide' ? '朋友都找到啦！' : '谢谢你的小点心！' : item.prompt}</h2></div>
      {!complete && <div className="story-question-actions">{kind === 'hide' && <button className="secondary hide-hint" aria-pressed={moreClues} disabled={paused || busy || !!celebrating || moreClues} onClick={() => setMoreClues(true)}>{moreClues ? '线索露出来啦' : '再露一点'}</button>}<button className="bubble-listen" aria-label={kind === 'hide' ? '听捉迷藏题目' : '听厨房题目'} disabled={paused || busy || !!celebrating || !!ghost || wrong !== null} onClick={() => void listen()}>♫ {hearing ? '正在说…' : '听一听'}</button></div>}
    </div>
    <div className="story-world">
      {kind === 'hide' ? <div className="hide-furniture">{shown.choices.map((choice, slot) => <button key={`${choice}-${slot}`} className={`hiding-place place-${slot}${opened.includes(slot) || complete ? ' is-open' : ''}${celebrating?.slot === slot ? ' found-friend' : ''}`} aria-label={`打开${hidingPlaces[slot]}`} disabled={blocked || opened.includes(slot)} onClick={() => void choose(slot)}>
        <span className="hiding-cavity"><span className="hiding-friend" aria-hidden={!opened.includes(slot) && !complete}><Art concept={choice}/></span><span className="hide-cover"><i/><i/></span></span><span className="place-label">{hidingPlaces[slot]}</span>
        {celebrating?.slot === slot && <span className="found-sparkles" aria-hidden="true">✦　♡　✦</span>}
      </button>)}</div> : <>
        <div ref={monster} className={`kitchen-monster${ghost ? ' ready-to-eat' : ''}`} aria-label={celebrating ? '红怪兽正在嚼点心' : '把点心喂给红怪兽'}>
          <span className="monster-frame monster-neutral"/><span className="monster-frame monster-hungry"/><span className="monster-frame monster-chewing"/><span className="monster-frame monster-delighted"/>
          <span className="monster-yum" aria-hidden="true">Yummy! ♡</span>
        </div>
        <div className="kitchen-plates">{shown.choices.map((choice, slot) => <button ref={el => { foodButtons.current[slot] = el }} key={choice} className={`food-plate${ghost?.slot === slot ? ' being-dragged' : ''}${celebrating?.slot === slot ? ' is-fed' : ''}${wrong === slot ? ' wrong-food' : ''}`} aria-label={`喂${conceptNames[choice]}`} disabled={blocked}
          onPointerDown={event => beginDrag(event, slot)} onPointerMove={moveDrag} onPointerUp={endDrag}
          onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) cancelDrag() }} onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) cancelDrag() }}
          onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false }}
          onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return } suppressClick.current = false; void choose(slot) }}><Art concept={choice}/></button>)}</div>
      </>}
      {complete && <div className="story-finished"><Art concept={game ? toy : shown.target}/><span>{game ? '小伙伴想和你回家' : '试玩成功！'}</span></div>}
    </div>
    {ghost && <span className="food-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}><Art concept={shown.choices[ghost.slot]}/></span>}
    {flight && <span className="food-ghost food-flight" aria-hidden="true" style={{ left: flight.x, top: flight.y, '--food-dx': `${flight.dx}px`, '--food-dy': `${flight.dy}px` } as CSSProperties}><Art concept={shown.choices[flight.slot]}/></span>}
    <p className="story-feedback" role="status">{complete && game ? '完成啦，抱回小屋吧。' : message}</p>
    <div className="story-footer"><div className="story-stamps" aria-label={`已完成 ${game ? celebrating?.progress ?? progress : demoDone ? 1 : 0} 次`}>{[0,1,2].map(i => <span key={i} className={i < (game ? celebrating?.progress ?? progress : demoDone ? 1 : 0) ? 'filled' : ''}>{kind === 'hide' ? '✦' : '♡'}</span>)}</div>{!game ? <>{demoDone && <button className="secondary story-again" disabled={paused || busy} onClick={() => { setDemoDone(false); setDemoOpened([]); void listen() }}>再试一次</button>}{startButton}</> : complete ? claimButton : <span className="story-goal">{kind === 'hide' ? '找对三次，接伙伴回家' : '喂对三次，接伙伴回家'}</span>}</div>
  </div>
}
