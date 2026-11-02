import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { Art } from './Art'
import { answerStory, finishRecipe } from './engine'
import type { Game, Language, State } from './engine'
import { getRecipeRound, ingredientPrompt, ingredients, kitchenAudio, recipeIds, recipes } from './recipes'
import type { Ingredient, RecipeId } from './recipes'
import './kitchen.css'

function RecipeArt({ id, label }: { id: RecipeId | 'salt'; label: string }) {
  const frame = { salad: '0 55 620 535', soup: '627 0 627 615', smoothie: '0 585 625 669', salt: '627 627 627 627' }[id]
  return <svg className="recipe-art" viewBox={frame} role="img" aria-label={label}><image href="/assets/kitchen-recipes-v22.png" width="1254" height="1254"/></svg>
}
function Food({ id, language }: { id: Ingredient; language: Language }) {
  return id === 'salt' ? <RecipeArt id="salt" label={ingredients.salt[language]}/> : <Art concept={id}/>
}

export function KitchenGame({ game, recipeId, onRecipe, language, busy, paused, run, startButton, claimButton, playAudio }: {
  game: Game | null; recipeId: RecipeId; onRecipe: (id: RecipeId) => void; language: Language; busy: boolean; paused: boolean;
  run: (action: (state: State) => State) => Promise<State | null>;
  startButton: ReactNode; claimButton: ReactNode; playAudio: (url: string) => Promise<boolean>;
}) {
  const id = game?.cooking?.recipe ?? recipeId, recipe = recipes[id], english = language === 'en-US'
  const [demoProgress, setDemoProgress] = useState(0), [demoServed, setDemoServed] = useState(false)
  const progress = game?.progress ?? demoProgress, served = game?.cooking?.served ?? demoServed
  const [heard, setHeard] = useState(false), [hearing, setHearing] = useState(false)
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState<{ ingredient: Ingredient; progress: number; x: number; y: number; dx: number; dy: number } | null>(null)
  const [cooking, setCooking] = useState(false), [wrong, setWrong] = useState<Ingredient | null>(null)
  const [ghost, setGhost] = useState<{ ingredient: Ingredient; x: number; y: number } | null>(null)
  const destination = useRef<HTMLDivElement>(null), buttons = useRef<(HTMLButtonElement | null)[]>([])
  const drag = useRef<{ pointer: number; slot: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false), lock = useRef(false), epoch = useRef(0), speech = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const player = useRef(playAudio); player.current = playAudio
  const shownProgress = adding?.progress ?? progress
  const round = getRecipeRound(id, game?.id ?? 'kitchen-demo', Math.min(shownProgress, 2))
  const blocked = paused || busy || hearing || !heard || !!adding || cooking || served || wrong !== null || progress === 3
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function cancelDrag() { if (drag.current) suppressClick.current = true; drag.current = null; setGhost(null) }
  function resetTransient() {
    epoch.current++; speech.current++; lock.current = false
    if (timer.current) clearTimeout(timer.current)
    if (speechTimer.current) clearTimeout(speechTimer.current)
    setAdding(null); setCooking(false); setWrong(null); setHeard(false); setHearing(false); setMessage(''); cancelDrag()
  }
  useEffect(() => {
    resetTransient(); setDemoProgress(0); setDemoServed(false)
    return () => { epoch.current++; speech.current++; if (timer.current) clearTimeout(timer.current); if (speechTimer.current) clearTimeout(speechTimer.current) }
  }, [game?.id, id, language])
  useEffect(() => { if (paused) resetTransient() }, [paused])
  useEffect(() => {
    window.addEventListener('resize', cancelDrag)
    return () => window.removeEventListener('resize', cancelDrag)
  }, [])

  async function listen() {
    if (paused || progress >= 3 || served) return
    const token = ++speech.current
    if (speechTimer.current) clearTimeout(speechTimer.current)
    speechTimer.current = setTimeout(() => {
      if (token !== speech.current) return
      speech.current++; setHeard(false); setHearing(false)
      setMessage(english ? 'Tap Listen to try again.' : '声音停住了，点小喇叭再听一次。')
    }, 12000)
    setHeard(false); setHearing(true); setMessage(english ? 'Little ears, listen…' : '小耳朵听一听…')
    const ok = await player.current(kitchenAudio(round.target, language))
    if (token !== speech.current) return
    if (speechTimer.current) clearTimeout(speechTimer.current)
    setHeard(ok); setHearing(false)
    setMessage(ok ? english ? 'Drag it into the bowl, pot or blender. Tapping works too!' : '拖进容器里，也可以轻点食材加入。' : english ? 'Tap to listen again.' : '声音还没播完，点小喇叭再听一次。')
  }
  useEffect(() => {
    // Let the recipe reset finish before starting the next spoken step.
    const pending = setTimeout(() => { if (!paused && !adding && !cooking && progress < 3 && (game || progress > 0)) void listen() }, 0)
    return () => { clearTimeout(pending); speech.current++ }
  }, [game?.id, id, language, progress, paused, Boolean(adding)])

  async function choose(slot: number, point?: { x: number; y: number }) {
    if (blocked || lock.current) return
    lock.current = true
    const token = epoch.current, ingredient = round.choices[slot]
    if (ingredient !== round.target) {
      setWrong(ingredient); setMessage(english ? `First, add the ${round.target}. We'll use this later!` : `先放${ingredients[round.target][language]}，这个待会儿用哦。`)
      timer.current = setTimeout(() => { setWrong(null); lock.current = false }, 700)
      return
    }
    const from = buttons.current[slot]!.getBoundingClientRect(), to = destination.current!.getBoundingClientRect()
    const x = point?.x ?? from.x + from.width / 2, y = point?.y ?? from.y + from.height / 2
    setAdding({ ingredient, progress, x, y, dx: to.x + to.width / 2 - x, dy: to.y + to.height * .45 - y }); setHeard(false)
    setMessage(english ? 'In it goes!' : ingredient === 'salt' ? '轻轻撒一点点盐。' : ingredient === 'milk' ? '咕嘟咕嘟，倒进来。' : '放进去啦！')
    if (game) {
      const next = await run(state => answerStory(state, game.id, progress, slot, true))
      if (token !== epoch.current) return
      if (!next || next.game?.progress !== progress + 1) { setAdding(null); lock.current = false; return }
    }
    timer.current = setTimeout(() => {
      if (!game) setDemoProgress(progress + 1)
      setAdding(null); lock.current = false
    }, reduced() ? 100 : 850)
  }
  function cook() {
    if (paused || busy || lock.current || adding || served || progress !== 3) return
    lock.current = true; setCooking(true); setMessage('')
    const token = epoch.current
    timer.current = setTimeout(async () => {
      if (game) {
        const next = await run(state => finishRecipe(state, game.id))
        if (token !== epoch.current) return
        if (!next?.game?.cooking?.served) { setCooking(false); lock.current = false; return }
      } else setDemoServed(true)
      setCooking(false); lock.current = false
      void player.current(kitchenAudio(`${id}-done`, language))
    }, reduced() ? 150 : 2600)
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
    if (active.moved) { suppressClick.current = true; setGhost({ ingredient: round.choices[active.slot], x: event.clientX, y: event.clientY }) }
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = null; setGhost(null)
    if (!active.moved) return
    suppressClick.current = true
    const rect = destination.current!.getBoundingClientRect(), x = event.clientX, y = event.clientY
    if (x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12) void choose(active.slot, { x, y })
    else setMessage(english ? 'Try dragging it into the container.' : '食材回到盘子啦，拖进容器里试试。')
  }
  const caption = served ? `${recipe.title[language]}${english ? ' is ready!' : '做好啦！'}` : cooking ? (english ? 'Watch it come together…' : '一起来做菜……') : progress === 3 && !adding ? (english ? 'All three ingredients are in!' : '三样材料齐啦！') : ingredientPrompt(round.target, language)
  return <div className={`story-game recipe-game recipe-${id}${cooking ? ' is-cooking' : ''}${served ? ' is-served' : ''}`} data-recipe={id} data-round={progress}>
    {!game && <div className="recipe-picker" aria-label="选择食谱">{recipeIds.map(key => <button key={key} disabled={paused || busy || !!adding || cooking || hearing} aria-label={`选择${recipes[key].title['zh-CN']}`} aria-pressed={id === key} onClick={() => { onRecipe(key); void player.current(kitchenAudio(`${key}-intro`, language)) }}><RecipeArt id={key} label={recipes[key].title[language]}/><span>{recipes[key].title[language]}</span></button>)}</div>}
    <div className="story-question recipe-question"><div><span className="story-round">{game ? recipe.title[language] : english ? 'Try a whole recipe · free' : '免费做一道菜 · 不用游戏币'} · {Math.min(shownProgress, 3)} / 3</span><h2>{caption}</h2></div>{progress < 3 && <button className="bubble-listen" aria-label="听厨房题目" disabled={paused || busy || !!adding || !!ghost || cooking} onClick={() => void listen()}>♫ {hearing ? (english ? 'Listen…' : '正在说…') : (english ? 'Listen' : '听一听')}</button>}</div>
    <div className="story-world recipe-world">
      <img className="recipe-chef" src="/assets/red-monster-chef-v21.png" alt="红怪兽小厨师" draggable="false"/>
      <div className="recipe-nameplate">{recipe.title[language]}<span>{id === 'soup' ? (english ? 'Water is already in the pot' : '锅里已经加好水') : english ? 'Three ingredients, one tasty dish' : '三样材料，做成一道美味'}</span></div>
      <div ref={destination} className={`recipe-worktop${ghost ? ' ready-for-food' : ''}`} aria-label={english ? `Put ingredients in the ${recipe.vessel}` : '把食材放进这里'}>
        {served ? <div className="recipe-result"><RecipeArt id={id} label={recipe.title[language]}/><span aria-hidden="true">✦　✧　✦</span></div> : <>
          <svg className="recipe-vessel" viewBox="0 0 260 205" aria-hidden="true">
            {id === 'smoothie' ? <><path d="M63 23h135l-15 136H78Z" fill="#f1fff8cc" stroke="#65958c" strokeWidth="6"/><path d="M195 48h22q28 45-28 55" fill="none" stroke="#65958c" strokeWidth="9"/><path d="M81 115h104l-6 37H85Z" fill="#efb4b3" opacity={shownProgress ? .8 : .2}/><rect x="62" y="158" width="134" height="40" rx="14" fill="#86afa2"/><circle cx="130" cy="177" r="10" fill="#ffe2a0"/><path className="blender-lid" d="M57 22h146" stroke="#638b80" strokeWidth="13" strokeLinecap="round"/></> : <><ellipse cx="130" cy="88" rx="107" ry="34" fill="#6b8b72"/><path d={id === 'soup' ? 'M22 89h216l-13 83q-95 39-190 0Z' : 'M23 90h214q-8 100-107 105Q33 190 23 90Z'} fill={id === 'soup' ? '#cc9569' : '#a6c5a1'} stroke={id === 'soup' ? '#8b6547' : '#648c70'} strokeWidth="5"/>{id === 'soup' && <><path d="M23 110Q-8 109 8 144h22M237 110q31-1 15 34h-22" fill="none" stroke="#95653e" strokeWidth="9"/><ellipse cx="130" cy="90" rx="100" ry="26" fill="#e6c476"/></>}<ellipse cx="130" cy="86" rx="106" ry="31" fill="none" stroke="#d5e0bd" strokeWidth="7"/></>}
          </svg>
          <div className="recipe-mix" aria-label={english ? `${shownProgress} ingredients added` : `已经加入 ${shownProgress} 样材料`}>{recipe.ingredients.slice(0, shownProgress).map((food, i) => <span key={food} style={{ '--food-index': i } as CSSProperties}><Food id={food} language={language}/></span>)}</div>
          <span className="recipe-spoon" aria-hidden="true"/><span className="recipe-steam" aria-hidden="true"><i/><i/><i/></span>
          {cooking && <span className="recipe-cooking-label">{recipe.action[language]} ✦</span>}
          {!cooking && progress < 3 && <span className="recipe-drop-label">{english ? 'Add here ↓' : '放到这里 ↓'}</span>}
        </>}
      </div>
      <div className="recipe-ingredients">{round.choices.map((food, slot) => {
        const used = recipe.ingredients.slice(0, shownProgress).some(added => added === food)
        return <button key={food} ref={el => { buttons.current[slot] = el }} className={`recipe-ingredient${used ? ' added' : ''}${wrong === food ? ' wrong-food' : ''}${ghost?.ingredient === food ? ' being-dragged' : ''}`} aria-label={`加入${ingredients[food]['zh-CN']}`} disabled={blocked || used}
          onPointerDown={e => beginDrag(e, slot)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={() => { if (drag.current) cancelDrag() }}
          onDragStart={e => e.preventDefault()} onContextMenu={e => e.preventDefault()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') suppressClick.current = false }}
          onClick={e => { if (suppressClick.current && e.detail !== 0) { suppressClick.current = false; return } suppressClick.current = false; void choose(slot) }}><Food id={food} language={language}/><span>{used ? '✓ ' : ''}{ingredients[food][language]}</span></button>
      })}</div>
    </div>
    {ghost && <span className="food-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}><Food id={ghost.ingredient} language={language}/></span>}
    {adding && <span className={`food-ghost recipe-food-flight flight-${adding.ingredient}`} aria-hidden="true" style={{ left: adding.x, top: adding.y, '--food-dx': `${adding.dx}px`, '--food-dy': `${adding.dy}px` } as CSSProperties}><Food id={adding.ingredient} language={language}/></span>}
    <p className="story-feedback" role="status">{served ? (game ? (english ? 'Made with love! Your friend can come home.' : '一道菜做好啦，接小伙伴回家吧。') : english ? 'You made it! Try another recipe.' : '你会做菜啦！还可以换一道食谱。') : progress === 3 && !adding ? (english ? 'Tap the button to finish your dish.' : '点下面的按钮，亲手把它做成一道菜。') : message || (english ? 'Tap Listen, then add the ingredient.' : '先点小喇叭，听听第一样要放什么。')}</p>
    <div className="story-footer recipe-footer"><div className="recipe-checklist" aria-label={`已加入 ${shownProgress} 样材料`}>{recipe.ingredients.map((food, i) => <span key={food} className={i < shownProgress ? 'filled' : ''}>{i < shownProgress ? '✓' : i + 1}</span>)}</div>
      {progress === 3 && !served ? <button className="primary recipe-cook" disabled={paused || busy || !!adding || cooking} onClick={cook}>{cooking ? (english ? 'Cooking…' : '做好吃的……') : recipe.action[language]}</button> : served && game ? claimButton : !game ? <>{served && <button className="secondary" disabled={paused || busy} onClick={() => { resetTransient(); setDemoServed(false); setDemoProgress(0) }}>{english ? 'Cook again' : '再做一次'}</button>}{startButton}</> : <span className="story-goal">{english ? 'Add → Cook → Serve' : '放食材 → 做一道菜 → 接伙伴回家'}</span>}
    </div>
  </div>
}
