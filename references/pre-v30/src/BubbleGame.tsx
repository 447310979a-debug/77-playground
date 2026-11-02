import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Art } from './Art'
import { getBubbleRound } from './bubbles'
import { conceptNames, trialItems } from './content'
import type { Concept } from './content'
import { answerBubble } from './engine'
import type { Game, State } from './engine'

type Round = { target: Concept; choices: Concept[] }
const demo: Round = { target: 'fish', choices: ['cat', 'fish', 'bird'] }

export function BubbleGame({ game, toy, language, busy, paused, run, startButton, claimButton, onPrompt, onSpeak }: {
  game: Game | null; toy: string; language: State['settings']['language']; busy: boolean; paused: boolean;
  run: (action: (state: State) => State) => Promise<State | null>;
  startButton: ReactNode; claimButton: ReactNode;
  onPrompt: (concept: string) => Promise<boolean>; onSpeak: (concept: string) => void;
}) {
  const progress = game?.progress ?? 0
  const round = game ? getBubbleRound(game.id, game.toyId, Math.min(progress, 2), game.bubblePoolVersion, game.language) : demo
  const [popping, setPopping] = useState<{ round: Round; progress: number } | null>(null)
  const [wrong, setWrong] = useState<Concept | null>(null)
  const [demoFound, setDemoFound] = useState(false)
  const [heard, setHeard] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [message, setMessage] = useState('点小喇叭听一听，再点泡泡里的朋友。')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lock = useRef(false)
  const generation = useRef(0)
  const operation = useRef(0)
  const prompt = useRef(onPrompt)
  prompt.current = onPrompt
  const complete = game ? progress === 3 && !popping : demoFound
  const shown = popping?.round ?? round
  const item = trialItems.find(item => item.concept === shown.target && item.language === language)!

  async function listen(retry = false) {
    const token = ++generation.current
    setHeard(false); setHearing(true)
    setMessage(retry ? '再听一次，找找声音里的朋友。' : '小耳朵听一听…')
    const ok = await prompt.current(round.target)
    if (token !== generation.current) return
    setHeard(ok); setHearing(false)
    setMessage(ok ? '听到了吗？点一下那个朋友。' : '还没听到声音？点小喇叭再听一次。')
  }

  useEffect(() => {
    operation.current++
    generation.current++
    if (timer.current) clearTimeout(timer.current)
    lock.current = false
    setPopping(null); setWrong(null); setHeard(false); setHearing(false); setDemoFound(false)
    return () => { operation.current++; generation.current++; if (timer.current) clearTimeout(timer.current) }
  }, [game?.id, paused])

  useEffect(() => {
    if (game && !paused && progress < 3 && !popping) void listen()
    return () => { generation.current++ }
  }, [game?.id, progress, paused, Boolean(popping), language])

  async function choose(choice: Concept) {
    if (paused || busy || lock.current || !heard || complete) return
    lock.current = true
    if (choice !== round.target) {
      setWrong(choice)
      void listen(true)
      timer.current = setTimeout(() => { setWrong(null); lock.current = false }, 450)
      return
    }
    const token = operation.current
    setPopping({ round, progress })
    setMessage('找到了！啵——小伙伴跳进篮子啦。')
    if (game) {
      const next = await run(current => answerBubble(current, game.id, progress, choice))
      if (token !== operation.current) return
      if (!next || next.game?.progress !== progress + 1) { setPopping(null); lock.current = false; return }
    }
    timer.current = setTimeout(() => {
      setPopping(null); lock.current = false
      if (!game) { setDemoFound(true); setMessage('就是这样玩！正式游戏找对 3 次，就能带走你选的小伙伴。') }
      else if (progress === 2) onSpeak(toy)
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 950)
  }

  const found = game ? Array.from({ length: Math.min(progress, 3) }, (_, i) => getBubbleRound(game.id, game.toyId, i, game.bubblePoolVersion, game.language).target) : demoFound ? ['fish'] : []
  return <>
    <div className="bubble-sky listen-bubbles" data-round={progress} data-mode={game ? 'game' : 'demo'}>
      <span className="bubble-cloud cloud-left"/><span className="bubble-cloud cloud-right"/>
      <div className="bubble-round-label">{game ? `找朋友 · ${Math.min(progress + 1, 3)} / 3` : '免费试一题 · 不用游戏币'}</div>
      <div className="bubble-question">
        <h2>{complete ? game ? '三个朋友都找到了！' : '你会玩啦！' : item.prompt}</h2>
        {!complete && <button className={`bubble-listen ${hearing ? 'is-speaking' : ''}`} aria-label="听泡泡题目" disabled={paused || !!popping || busy} onClick={() => void listen()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4ZM15 8q5 4 0 8M18 5q8 7 0 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>{hearing ? '正在说…' : '听一听'}</button>}
        <p>{complete ? game ? `把${conceptNames[toy as Concept] ?? '小伙伴'}带回家吧。` : '听声音，再点出对应的朋友。' : '听声音，点泡泡里的朋友'}</p>
      </div>
      {!complete && <div className="bubble-orchard" key={game ? `${game.id}-${popping?.progress ?? progress}` : 'demo'}>{shown.choices.map((choice, index) => <button key={choice} className={`pop-target bubble-${index} ${popping?.round.target === choice ? 'has-popped' : ''} ${wrong === choice ? 'wrong-bubble' : ''}`} aria-label={'选择泡泡里的' + conceptNames[choice]} disabled={paused || busy || !heard || !!popping || !!wrong} onClick={() => void choose(choice)}>
        <span className="bubble-shell"><Art concept={choice}/><i/></span>
        {popping?.round.target === choice && <><span className="pop-burst">{Array.from({length:8},(_,i)=><i key={i} style={{'--ray':i} as CSSProperties}/>)}</span><span className="bubble-flight" style={{'--drift':`${(1-index)*105}%`} as CSSProperties}><Art concept={choice}/></span></>}
      </button>)}</div>}
      <div className={`bubble-basket ${complete && game ? 'basket-full' : ''}`} aria-label={game ? `已经找对 ${progress} 次` : demoFound ? '已经学会试玩' : '等待找到小鱼'}>
        {complete && game ? <Art concept={toy}/> : [0,1,2].map(index => <span className="bubble-found" key={index}>{found[index] ? <Art concept={found[index]}/> : <span>{index + 1}</span>}</span>)}<i/>
      </div>
      {!game && demoFound && <button className="text-button bubble-demo-again" onClick={() => { setDemoFound(false); void listen() }}>再试一次 ↻</button>}
    </div>
    <p className="arcade-feedback" aria-live="polite">{complete && game ? '找齐啦！谢谢你帮朋友们回家。' : message}</p>
    <div className="arcade-controls">{!game ? startButton : complete ? claimButton : <span>找对 3 次，带{conceptNames[toy as Concept] ?? '小伙伴'}回家</span>}</div>
    {!game && <p className="arcade-small-note">正式游戏会换不同的朋友；点错也没关系，可以再听、再试。</p>}
  </>
}
