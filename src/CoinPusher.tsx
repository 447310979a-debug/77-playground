import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Art } from './Art'
import { createPusherScene, dropPusherCoin, isPusherSettled, pusherPosition, stepPusher } from './pusher'
import type { PusherScene } from './pusher'
import { PUSHER_GOAL, savePusher } from './engine'
import type { Game, State } from './engine'
import { createPusherSound } from './pusherSound'
import './pusher.css'

type Props = {
  game: Game | null; toy: string; busy: boolean; paused: boolean;
  run: (action: (state: State) => State, queued?: boolean) => Promise<State | null>;
  startButton: ReactNode; claimButton: ReactNode; onSpeak: (toy: string) => void;
}

const project = (x: number, y: number, level = 0, z = 0) => ({ x: 300 + (x - 50) * (4.35 + y * .009), y: 135 + y * 3.1 - level * 32 - z * 5.2 })

export function CoinPusher({ game, toy, busy, paused, run, startButton, claimButton, onSpeak }: Props) {
  const scene = useRef(game?.pusher ? structuredClone(game.pusher) : createPusherScene(77))
  const [frame, render] = useState(0)
  const [aim, setAim] = useState(50)
  const [cooling, setCooling] = useState(false)
  const [muted, setMuted] = useState(false)
  const sound = useRef(createPusherSound())
  const announced = useRef(false)
  const landings = useRef(new Map<number, { x: number; at: number }>())
  const lastDrop = useRef(Number.NEGATIVE_INFINITY)
  const savedAt = useRef(0)
  const saving = useRef(false)
  const pendingSave = useRef<{id:string; snapshot:PusherScene} | null>(null)
  const active = Boolean(game)
  const goalReached = scene.current.fallen >= PUSHER_GOAL || game?.progress === 3
  const savedGoal = (game?.pusher?.fallen ?? 0) >= PUSHER_GOAL || game?.progress === 3
  const completed = savedGoal && goalReached && isPusherSettled(scene.current)
  const latest = useRef({ game, run, paused, completed, onSpeak, toy, muted })
  latest.current = { game, run, paused, completed, onSpeak, toy, muted }

  async function persist() {
    const current = latest.current
    if (!current.game) return
    pendingSave.current = {id:current.game.id,snapshot:structuredClone(scene.current)}
    if (saving.current) return
    saving.current = true
    try {
      while (pendingSave.current) {
        const save = pendingSave.current
        pendingSave.current = null
        // IndexedDB serializes these saves; the last pause/unmount snapshot must also commit.
        await current.run(state => savePusher(state, save.id, save.snapshot), true)
      }
    }
    finally { saving.current = false }
  }

  useEffect(() => {
    scene.current = game?.pusher ? structuredClone(game.pusher) : createPusherScene(77)
    if (game && !game.pusher && game.progress) scene.current.fallen = Math.min(PUSHER_GOAL, game.progress * 3)
    announced.current = false
    landings.current.clear()
    render(value => value + 1)
  }, [game?.id])

  useEffect(() => {
    let raf = 0, last = 0
    const animate = (now: number) => {
      const current = latest.current
      if (now - last >= 32) {
        const dt = last ? Math.min((now - last) / 1000, .05) : 0
        last = now
        if (current.game && !current.paused && !current.completed && !document.hidden) {
          const before = scene.current.fallen
          const falling = scene.current.coins.filter(coin => coin.chute)
          stepPusher(scene.current, dt)
          const remaining = new Set(scene.current.coins.map(coin => coin.id))
          falling.filter(coin => !remaining.has(coin.id)).forEach((coin, index) => landings.current.set(before + index, { x: project(coin.x, coin.y).x, at: scene.current.tick }))
          for (const [id, landing] of landings.current) if (scene.current.tick - landing.at > 1.2) landings.current.delete(id)
          if (scene.current.fallen > before && !current.muted) sound.current.impact(scene.current.fallen - before)
          const finished = scene.current.fallen >= PUSHER_GOAL && isPusherSettled(scene.current)
          if (finished && !announced.current) { announced.current = true; current.onSpeak(current.toy) }
          if (now - savedAt.current > 1000 || finished || (before < PUSHER_GOAL && scene.current.fallen >= PUSHER_GOAL)) {
            savedAt.current = now
            void persist()
          }
          render(value => value + 1)
        }
        if (now - lastDrop.current > 460) setCooling(false)
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(raf); sound.current.close(); void persist() }
  }, [])

  useEffect(() => {
    if (paused) { sound.current.stop(); void persist() }
    else if (!muted && !document.hidden) sound.current.resume()
  }, [paused, muted])
  useEffect(() => {
    const hide = () => {
      if (document.hidden) { sound.current.stop(); void persist() }
      else if (latest.current.game && !latest.current.paused && !latest.current.muted) sound.current.resume()
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  function drop() {
    if (!active || paused || goalReached || busy || cooling || performance.now() - lastDrop.current < 460) return
    if (!muted) sound.current.unlock()
    dropPusherCoin(scene.current, aim)
    lastDrop.current = performance.now()
    setCooling(true)
    render(value => value + 1)
    void persist()
  }

  const current = scene.current
  const wallY = project(50, pusherPosition(current.tick), 1).y
  const slotX = project(aim, 15, 1).x
  const coins = [...current.coins].sort((a,b) => Math.round(a.y / 3) - Math.round(b.y / 3) || (a.z ?? 0) - (b.z ?? 0))
  const fallen = Math.min(current.fallen, PUSHER_GOAL)

  return <>
    <div className="real-pusher" data-drops={current.drops} data-fallen={current.fallen} data-tick={current.tick} data-frame={frame} data-settled={isPusherSettled(current)}>
      <div className="pusher-score"><span>推倒小币塔，接朋友回家</span><strong aria-live="polite">{fallen} / {PUSHER_GOAL}<span> ★</span></strong><button type="button" className="pusher-sound" aria-label={muted ? '开启落币声音' : '关闭落币声音'} aria-pressed={!muted} onClick={() => { if (muted) { if (active && !paused) sound.current.unlock() } else sound.current.stop(); setMuted(!muted) }}>{muted ? '声音关' : '声音开'}</button></div>
      <div className="pusher-window">
        <svg className="pusher-table" viewBox="0 0 600 560" aria-label="高高叠起的星星币，推板推动币塔滑动、倾倒，落进下方接收槽" role="img">
          <defs>
            <linearGradient id="coin-face" x2=".6" y2="1"><stop stopColor="#fff4bd"/><stop offset=".45" stopColor="#eaca65"/><stop offset="1" stopColor="#c99739"/></linearGradient>
            <linearGradient id="coin-edge" x2="0" y2="1"><stop stopColor="#edca76"/><stop offset=".5" stopColor="#9d7132"/><stop offset="1" stopColor="#d6ab53"/></linearGradient>
            <linearGradient id="pusher-floor" x2="0" y2="1"><stop stopColor="#84aaa0"/><stop offset="1" stopColor="#d4dfcf"/></linearGradient>
            <linearGradient id="pusher-plate" x2="0" y2="1"><stop stopColor="#e0e6d6"/><stop offset="1" stopColor="#8aa99b"/></linearGradient>
            <linearGradient id="pusher-chute" x2="0" y2="1"><stop stopColor="#354d43"/><stop offset="1" stopColor="#a0baaa"/></linearGradient>
          </defs>
          <path d="M67 82H533L585 437H15Z" fill="#6b827a"/>
          <path d="M77 94H523L568 429H32Z" fill="url(#pusher-floor)"/>
          <path d="M77 94H523L545 249H55Z" fill="#b7cbbc"/>
          <path d="M55 249H545V269H55Z" fill="#617e6e"/>
          <path d="M55 249H545" stroke="#f2f1d9" strokeWidth="4"/>
          <path d={`M80 94H520L530 ${wallY}H70Z`} fill="url(#pusher-plate)"/>
          <path d={`M70 ${wallY}H530V${wallY+14}H70Z`} fill="#6b8a76" stroke="#476e59" strokeWidth="2"/>
          <text x="300" y={wallY-9} textAnchor="middle" fill="#f7f5de" fontSize="18" fontWeight="700">77</text>
          <path d="M15 437H585L568 543Q300 567 32 543Z" fill="url(#pusher-chute)"/>
          <path d="M32 446H568" stroke="#e5e5c8" strokeWidth="4"/>
          {Array.from({length:Math.min(current.fallen,26)},(_,offset) => {
            const i = Math.max(0, current.fallen - 26) + offset
            const scatter = ((Math.imul(i + 31, 2654435761) >>> 0) % 1000) / 1000
            const x = 65 + scatter * 470, y = 505 + ((i * 37) % 25)
            const landing = landings.current.get(i)
            return <g key={i} transform={`translate(${x} ${y}) rotate(${(i * 137) % 36 - 18})`}>
              <ellipse cy="9" rx="23" ry="7" fill="#203b3a30" />
              <g className={landing ? 'tray-coin arriving' : 'tray-coin'} style={{'--from-x':`${(landing?.x ?? x)-x}px`,'--bounce-turn':`${i%2?25:-25}deg`} as CSSProperties}>
                <ellipse cy="4" rx="21" ry="11" fill="url(#coin-edge)"/><ellipse rx="21" ry="11" fill="url(#coin-face)" stroke="#f8dfa0" strokeWidth="2"/>
                <ellipse rx="17" ry="8" fill="none" stroke="#bd913c"/><text y="5" textAnchor="middle" fill="#9c732e" fontSize="16">★</text>
              </g>
              {landing && <ellipse className="coin-impact-ring" rx="27" ry="9" fill="none" stroke="#ffe7a8" strokeWidth="2"/>}
            </g>
          })}
          {coins.map(coin => {
            const z = coin.z ?? 0
            const point = project(coin.x,coin.y,coin.level,z)
            const ground = project(coin.x,coin.y,coin.level)
            const radius = 22 + coin.y * .025
            const lift = coin.fall * 130
            const tilt = coin.tilt ?? 0
            const flipping = coin.chute || (z > 0 && coin.support == null)
            const faceScale = flipping ? .12 + .88 * Math.abs(Math.cos(tilt * Math.PI / 180)) : 1
            return <g key={coin.id} className="physical-coin" data-coin-id={coin.id} data-level={coin.level} data-z={z} data-support={coin.support ?? ''} data-chute={coin.chute ?? 0}>
              {!coin.chute && z < 2 && <ellipse cx={ground.x} cy={ground.y+8} rx={radius} ry={radius*.48} fill="#233d3330"/>}
              <g transform={`translate(${point.x} ${point.y-lift}) rotate(${tilt}) scale(1 ${faceScale})`}>
                <path d={`M${-radius} 0a${radius} ${radius*.49} 0 0 1 ${radius*2} 0v7a${radius} ${radius*.49} 0 0 1 ${-radius*2} 0Z`} fill="url(#coin-edge)" stroke="#8b652b" strokeWidth="1"/>
                {[-.65,-.3,0,.3,.65].map(offset=><path key={offset} d={`M${radius*offset} ${radius*.49*Math.sqrt(1-offset*offset)}v5`} stroke="#9b742f" strokeWidth="1.2"/>)}
                <ellipse rx={radius} ry={radius*.49} fill="url(#coin-face)" stroke="#f8dfa0" strokeWidth="1.5" opacity={.87 + coin.id % 5 * .03}/>
                <ellipse rx={radius-4} ry={(radius-4)*.46} fill="none" stroke="#bb9140" strokeWidth="1"/>
                <text y="5" textAnchor="middle" fontSize="18" fill="#a77b2e" transform={`rotate(${(coin.id*29)%28-14})`}>★</text>
              </g>
            </g>
          })}
          <path d="M67 82 15 437M533 82l52 355" stroke="#e1e6d4" strokeWidth="11"/>
          <path d="M67 82 15 437M533 82l52 355" stroke="#799580" strokeWidth="3"/>
          <path d="M32 543Q300 567 568 543" fill="none" stroke="#637f6f" strokeWidth="14"/>
          <g className="drop-spout" transform={`translate(${slotX} 20)`}><path d="M-22-15H22L15 18H-15Z" fill="#d0a25b" stroke="#8e733f" strokeWidth="2"/><rect x="-12" y="7" width="24" height="6" rx="3" fill="#5d6958"/></g>
        </svg>
        <div className={`pusher-friend ${completed ? 'friend-won' : ''}`}><Art concept={toy}/><span>{completed ? '接到啦！' : '我在这里等你'}</span></div>
      </div>
      <div className="pusher-aim">
        <label htmlFor="coin-aim">手指左右滑，选投币位置</label>
        <input id="coin-aim" type="range" min="7" max="93" value={aim} onChange={e=>setAim(Number(e.target.value))} disabled={paused || completed} aria-label="投币位置"/>
        <div className="pusher-positions">{[[15,'左边'],[50,'中间'],[85,'右边']].map(([x,label])=><button key={x} aria-label={`投币口移到${label}`} aria-pressed={aim===x} disabled={paused||completed} onClick={()=>setAim(Number(x))}>{label}</button>)}</div>
      </div>
    </div>
    <p className="arcade-feedback" aria-live="polite">{completed ? '哗啦！星星币接住啦，带朋友回家吧。' : goalReached ? '哗啦啦，等这一波星星币落稳……' : active ? '选好位置，让新币落在币堆上，等推板慢慢往前推。' : '币塔叠得高高的，推一推，会倒下哪一堆？'}</p>
    <div className="arcade-controls">{!active ? startButton : completed ? claimButton : <button className="primary drop-coin-button" onClick={drop} disabled={busy||paused||cooling||goalReached||current.coins.length>=120}>投一枚星星币 <span>↓</span></button>}</div>
    {active && !completed && <p className="arcade-small-note">这一局可以接着投，不再扣游戏币。已投 {current.drops} 枚</p>}
  </>
}
