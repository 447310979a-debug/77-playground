import { collectionPositions } from './rooms'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { catalog, concepts, bilingualConcepts, clothingConcepts, gardenConcepts, vehicleConcepts, rescueConstructionConcepts, familyVehicleConcepts, familyRoadConcepts, homeNatureConcepts, washroomConcepts, freshFoodConcepts, travelConcepts, weatherConcepts, bodyActionConcepts, sharkConcepts, conceptNames, systemAudio, trialItems } from './content'
import type { Concept } from './content'
import { Art } from './Art'
import { Arcade } from './Arcade'
import { CollectionRoom } from './CollectionRoom'
import { OfflineUpdate } from './OfflineUpdate'
import { MatchTask } from './MatchTask'
import { PandaRaceGame } from './PandaRaceGame'
import { PandaPig } from './PandaPig'
import {
  addActiveTime, completeTask, dayKey, getDayUsage, getRemainingSeconds,
  recordAttempt, recordExposure, startPlan, validateState, answerMatch, moveRoomToy,
} from './engine'
import type { State, Settings, TrialItem, GameKind } from './engine'
import { loadState, transact } from './storage'

type Page = 'home' | 'browse' | 'lesson' | 'reward' | 'game' | 'collection' | 'parent' | 'end'
const browseGroups: Record<string, readonly Concept[]> = {
  '自己洗漱': washroomConcepts,
  '农场朋友': ['cow','pig','horse','sheep','duck','chick','donkey'],
  '池塘朋友': ['fish','frog','boat'],
  '餐桌小帮手': ['cup','spoon','bowl','plate','fork'],
  '我们家的车': familyRoadConcepts,
  '救援车与工程车': rescueConstructionConcepts,
  '自己穿衣服': [...clothingConcepts, 'hat', 'shoe', 'sock'],
  '花园小发现': [...gardenConcepts,'dragonfly'],
  '蔬菜厨房': ['carrot', 'broccoli', 'corn', 'tomato', 'cucumber'],
  '天气发现': weatherConcepts,
  '交通工具': ['car', 'bus', 'train', ...travelConcepts, ...vehicleConcepts, ...familyVehicleConcepts],
  '鲨鱼一家': sharkConcepts,
  '海洋朋友': ['turtle','crab','whale','dolphin','octopus','starfish'],
  '森林动物': ['lion','tiger','elephant','monkey'],
  '晚安时间': ['bed','lamp','pillow','blanket'],
  '身体和动作': [...bodyActionConcepts],
  '动物朋友': ['cat', 'dog', 'fish', 'bird', 'rabbit', 'bear', 'duck', 'cow', 'pig', 'horse', 'sheep', 'chick', 'donkey', 'frog'],
  '水果和食物': ['water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'grape', 'pear', 'milk', 'bread', 'egg', 'cheese', ...freshFoodConcepts],
  '生活和玩具': ['ball', 'book', 'red-monster', 'cup', 'spoon', 'bowl', 'hat', 'shoe', 'sock'],
  '自然发现': ['sun', 'moon', 'star', 'cloud', 'tree', 'flower'],
}
const byId = new Map(trialItems.map(item => [item.id, item]))
type ArcadeKind = GameKind | 'race'
const games: { kind: ArcadeKind; title: string; english: string; description: string; icon: string }[] = [
  { kind: 'race', title: '熊猫猪猪赛跑', english: 'Panda Pig race', description: '五条跑道，选一只小猪加油。猜中冠军得 1 币！', icon: 'play' },
  { kind: 'hide', title: '小屋捉迷藏', english: 'Peekaboo friends', description: '听听是谁，点开沙发、柜门和窗帘找朋友。', icon: 'home' },
  { kind: 'kitchen', title: '红怪兽厨房', english: 'Monster kitchen', description: '听提示放食材，拌沙拉、煮汤、做奶昔。', icon: 'heart' },
  { kind: 'claw', title: '小小抓娃娃', english: 'Claw friends', description: '左右移动、对准、下爪！试试你的好眼力。', icon: 'claw' },
  { kind: 'pusher', title: '小小推币机', english: 'Push & play', description: '选个位置投币，看硬币互相挤着落下来。', icon: 'coin' },
  { kind: 'bubbles', title: '泡泡找朋友', english: 'Bubble friends', description: '听名字，点出泡泡里的朋友。找对 3 次，接伙伴回家。', icon: 'bubbles' },
]

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    play: <path d="m9 5 11 7-11 7z" />,
    sound: <><path d="M11 4 5 9H2v6h3l6 5z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    back: <path d="m14 5-7 7 7 7M7 12h14" />,
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="m12 7 1.6 3.3 3.6.5-2.6 2.6.6 3.6-3.2-1.7L8.8 17l.6-3.6-2.6-2.6 3.6-.5z" /></>,
    heart: <path d="M12 21 3.5 13A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 8.5 7z" />,
    book: <><path d="M12 5C8 2 3 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-1-1-6-2-10 1zm0 0v15" /></>,
    claw: <><path d="M12 2v9m-5 0h10m-9 1-4 6 4 4m8-10 4 6-4 4m-4-10v7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    leaf: <><path d="M20 3C5 1 1 10 7 17c7 6 16 2 13-14zM5 20 16 8" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    bubbles: <><circle cx="8" cy="8" r="5" /><circle cx="17" cy="16" r="5" /><circle cx="5" cy="19" r="2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.heart}</svg>
}

function WaterCup({ full }: { full: boolean }) {
  return <span className="water-scene" role="img" aria-label={full ? '装着清水的杯子' : '空杯子'}>
    <span className="glass">{full && <span className="water"><span /></span>}<i /></span>
    <span className="glass-shadow" />
  </span>
}

function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [gate, setGate] = useState(false)
  const [pin, setPin] = useState('')
  const [browseGroup, setBrowseGroup] = useState('全部')
  const [browseItem, setBrowseItem] = useState<TrialItem | null>(null)
  const [feedback, setFeedback] = useState('')
  const [promptPlayed, setPromptPlayed] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [selectedToy, setSelectedToy] = useState<Concept>('red-monster')
  const [selectedGame, setSelectedGame] = useState<ArcadeKind | null>(null)
  const [query, setQuery] = useState('')
  const [storageNote, setStorageNote] = useState('')
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioGeneration = useRef(0)
  const mutationLock = useRef(false)
  const cancelAudio = useRef<(() => void) | null>(null)
  const language = ((page === 'lesson' || page === 'reward') ? state?.plan?.language : page === 'game' && state?.game && !state.game.claimedAt ? state.game.language ?? state.settings.language : state?.settings.language) ?? 'en-US'
  const english = language === 'en-US'
  const currentTask = state?.plan?.tasks[state.plan.index]
  const currentItem = currentTask ? byId.get(currentTask.itemId) : undefined
  const currentTaskId = currentTask?.id
  const lessonAudio = currentTask && currentItem ? currentTask.kind === 'learn' ? currentItem.audio.label
    : currentTask.kind === 'character' ? currentItem.audio.character!
    : currentTask.kind === 'sentence' ? currentItem.audio.example : currentItem.audio.prompt : ''
  const ready = state !== null

  const stopAudio = useCallback(() => {
    audioGeneration.current++
    cancelAudio.current?.()
    cancelAudio.current = null
    if (audio.current) { audio.current.onended = null; audio.current.onerror = null; audio.current.pause(); audio.current.currentTime = 0 }
    setSpeaking(false)
  }, [])

  const play = useCallback(async (url: string, onStarted?: () => void): Promise<boolean> => {
    stopAudio()
    const generation = audioGeneration.current
    const sound = audio.current ?? new Audio()
    audio.current = sound
    sound.src = url
    setSpeaking(true)
    return new Promise(resolve => {
      cancelAudio.current = () => resolve(false)
      const finish = (success: boolean) => {
        if (generation === audioGeneration.current) setSpeaking(false)
        resolve(success && generation === audioGeneration.current)
      }
      sound.onended = () => finish(true)
      sound.onerror = () => { setError('声音暂时没有播放成功，请点小喇叭再试一次。'); finish(false) }
      sound.play().then(() => {
        if (generation === audioGeneration.current) onStarted?.()
      }).catch(() => { if (generation === audioGeneration.current) setSpeaking(false); resolve(false) })
    })
  }, [stopAudio])

  const run = useCallback(async (action: (current: State) => State, queued = false) => {
    if (mutationLock.current && !queued) return null
    if (!queued) { mutationLock.current = true; setBusy(true); setError('') }
    try {
      const next = await transact(action)
      setState(next)
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存没有成功，请保留此页面后重试。')
      return null
    } finally { if (!queued) { mutationLock.current = false; setBusy(false) } }
  }, [])

  function navigate(next: Page) {
    stopAudio()
    setFeedback('')
    setBrowseItem(null)
    setBrowseGroup('全部')
    if (next === 'game') setSelectedGame(null)
    setPage(next)
  }

  useEffect(() => {
    loadState().then(setState).catch(e => setError(`本机存档无法打开：${e.message}。请检查浏览器是否允许网站存储。`))
    return stopAudio
  }, [stopAudio])

  useEffect(() => {
    if (!ready || page === 'parent' || page === 'end' || paused) return
    let last = performance.now()
    let alive = true
    const saveTime = () => {
      const now = performance.now()
      const seconds = (now - last) / 1000
      last = now
      if (seconds <= 0) return
      transact(s => addActiveTime(s, seconds)).then(s => { if (alive) setState(s) }).catch(e => { setError(`用时未能保存：${e.message}`); setPaused(true) })
    }
    const visibility = () => {
      if (document.hidden) { saveTime(); stopAudio(); setPaused(true) }
      last = performance.now()
    }
    const timer = window.setInterval(() => { if (!document.hidden) saveTime() }, 3000)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      saveTime()
      alive = false
    }
  }, [ready, page, paused, stopAudio])

  useEffect(() => {
    if (state && getRemainingSeconds(state) <= 0 && page !== 'parent' && page !== 'end') {
      stopAudio()
      setPage('end')
    }
  }, [state, page, stopAudio])

  useEffect(() => {
    if (page !== 'lesson' || !currentTask || !currentItem || paused) return
    setPromptPlayed(false)
    setFeedback('')
    if (currentTask.kind === 'match') { stopAudio(); return }
    let active = true
    void play(lessonAudio).then(success => { if (active && success) setPromptPlayed(true) })
    return () => { active = false; stopAudio() }
  }, [page, currentTaskId, paused, play])

  useEffect(() => {
    if (page !== 'reward') return
    void play(systemAudio[language].coin)
    return stopAudio
  }, [page, language, play, stopAudio])


  async function begin() {
    const next = await run(s => startPlan(s, trialItems))
    if (!next) return
    if (!next.plan || next.plan.completedAt) { navigate('end'); return }
    navigate('lesson')
  }

  async function finishTask(assisted = false) {
    if (!currentTask) return
    const task = currentTask
    const next = await run(s => completeTask(s, {
      taskId: task.id,
      outcome: assisted || task.hintUsed || (task.kind !== 'learn' && !promptPlayed)
        ? 'assisted' : task.kind === 'learn' ? 'introduced' : 'independent_correct',
      promptPlayed,
    }))
    if (!next) return
    if (next.plan?.completedAt) {
      navigate('reward')
    }
  }

  async function answer(id: string) {
    if (!currentTask || !currentItem || busy || feedback === '选到啦！') return
    if (id === currentTask.itemId) { await finishTask(); return }
    const saved = await run(s => recordAttempt(s, currentTask.id))
    if (!saved) return
    setFeedback('我们一起找一找')
    void play(currentItem.audio.label)
  }

  async function settings(patch: Partial<Settings>) {
    await run(s => ({ ...s, settings: { ...s.settings, ...patch } }))
  }

  async function restore(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error('备份文件过大')
      const value: unknown = JSON.parse(await file.text())
      validateState(value)
      if (value.plan && !value.plan.completedAt && value.plan.tasks.some(task => !byId.has(task.itemId) || task.optionIds.some(id => id !== 'empty-cup' && !byId.has(id)))) throw new Error('这个存档的未完成轮次包含本试玩版没有的内容，请在对应版本恢复。')
      if (!window.confirm('恢复将替换此浏览器中的试玩进度。将先下载当前存档备份，是否继续？')) return
      downloadJson(state, '77-恢复前备份.json')
      await run(() => value)
    } catch (e) { setError(e instanceof Error ? e.message : '无法读取这个备份') }
  }

  const usage = state ? getDayUsage(state) : null
  const completedToday = Boolean(usage?.rewardPlanId)
  const unclaimedGame = state?.game && !state.game.claimedAt
  const gameKind = unclaimedGame ? state.game?.kind ?? 'claw' : selectedGame
  const gameInfo = games.find(game => game.kind === gameKind)
  const pendingLanguage = state?.plan && !state.plan.completedAt ? state.plan.language : null
  const uniqueToys = [...new Set(state?.collections.map(c => c.toyId) ?? [])]
  const currentBrowseItems = trialItems.filter(item => item.language === language)
  const browseFilter = browseGroup === '新朋友' ? homeNatureConcepts : browseGroups[browseGroup]
  const shownBrowseItems = currentBrowseItems.filter(item => !browseFilter || (browseFilter as readonly Concept[]).includes(item.concept))
  const parentManaged = state?.settings.parentManaged !== false

  return <div className={`app-shell page-${page}${page === 'lesson' && currentTask?.kind === 'match' ? ' is-matching' : ''}`}>
    <header className="topbar">
      <button className="brand" aria-label="回到乐园首页" onClick={() => navigate('home')}>
        <span className="brand-mark">77<span>✿</span></span>
        <span>小小乐园<small>LITTLE HAPPY WORLD</small></span>
      </button>
      <div className="top-actions">
        <span className="language-chip"><i />{english ? 'English time' : '中文时光'}</span>
        <span className="wallet" aria-label={`我的游戏币 ${state?.balance ?? 0}`}><Icon name="coin" size={21} />{state?.balance ?? 0}</span>
        <button className="parent-entry" onClick={() => { stopAudio(); setPaused(true); setGate(true); setPin('') }} aria-label="打开家长入口"><Icon name="lock" size={18} /><span>家长</span></button>
      </div>
    </header>
    <OfflineUpdate visible={page === 'home' || page === 'parent'} detailed={page === 'parent'} />

    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><Icon name="close" size={18} /></button></div>}
    {!state ? <main className="loading"><span className="little-flower">✿</span><p>{error ? '存档准备好后，我们再开始。' : '小伙伴们正在准备好…'}</p></main> : <>
      {page === 'home' && <main className="home-page">
        <div className="welcome-line"><span className="hand-note">HELLO, LITTLE EXPLORER</span><span className="local-badge">{currentBrowseItems.length} 个小发现</span></div>
        <section className="play-meadow" aria-label="今天的乐园">
          <div className="meadow-copy"><div className="eyebrow"><Icon name="leaf" size={18} /> {english ? 'ENGLISH TIME · 每天一点点' : '每一次发现，都是小小的快乐'}</div><h1>{english ? <>Hi, 77!<br />Let’s play.</> : <>77，今天<br />一起玩什么？</>}<span className="sun-doodle">☀</span></h1><p>{english ? <>听懂一个词，认识一个朋友。<br />Listen, find, and play.</> : <>听一听，找一找。<br className="mobile-break" /> 和小伙伴一起认识世界。</>}</p>
            <button className="primary start-button" onClick={begin} disabled={busy}><span className="button-play"><Icon name="play" size={21} /></span>{pendingLanguage ? (pendingLanguage === 'zh-CN' ? '继续中文这轮' : 'Keep playing') : completedToday ? (english ? 'Play another round' : '再玩一轮') : english ? 'Let’s play' : '今天一起玩'}<span className="button-arrow">↗</span></button>
            <span className="quiet-note">{pendingLanguage === 'zh-CN' && english ? '中文这轮会保留，英文图画书也可以听' : '不用着急，我们一起慢慢来'}</span>
            {!english && <button className="text-button english-shortcut" disabled={busy} onClick={() => void settings({ language: 'en-US' })}>切换到 English →</button>}
          </div>
          <div className="meadow-art" aria-hidden="true">
            <span className="cloud cloud-one" /><span className="cloud cloud-two" />
            <span className="scene-dot dot-one">✦</span><span className="scene-dot dot-two">✧</span>
            <div className="meadow-ground" />
            <Art concept="cat" className="hero-cat" /><Art concept="red-monster" className="hero-dog" />
            <Art concept="bird" className="hero-bird" /><Art concept="ball" className="hero-ball" />
            <span className="little-sign">红色小怪兽来啦</span><span className="meadow-flower flower-one">✿</span><span className="meadow-flower flower-two">✿</span>
          </div>
        </section>
        <section className="home-destinations" aria-label="乐园小天地">
          <button className="destination mint" onClick={() => navigate('browse')}><span className="destination-icon"><Icon name="book" size={30} /></span><span><strong>{english ? '英文图画书' : '认识新朋友'}</strong><small>{`${currentBrowseItems.length} 个发现 · 新增小鸡、青蛙和洗漱小帮手`}</small></span><span className="destination-arrow">↗</span></button>
          <button className="destination peach" onClick={() => navigate('game')}><span className="destination-icon"><Icon name="bubbles" size={32} /></span><span><strong>小小游戏屋</strong><small>{unclaimedGame ? '接着玩，刚才的进度还在' : '猪猪赛跑 · 怪兽厨房 · 更多游戏'}</small></span><span className="destination-arrow">↗</span></button>
          <button className="destination lilac" onClick={() => navigate('collection')}><span className="destination-icon"><Icon name="heart" size={30} /></span><span><strong>我的小伙伴</strong><small>{uniqueToys.length ? `${uniqueToys.length} 位朋友，等你来打招呼` : '把小小快乐收藏起来'}</small></span><span className="destination-arrow">↗</span></button>
        </section>
        <footer className="home-footer"><span>✳</span> 爸爸妈妈在身边，世界更好玩。<i /> 图画 · 声音 · 小小惊喜</footer>
      </main>}

      {page === 'browse' && <main className="inner-page">
        <PageHeading title={english ? 'My little picture book' : '认识新朋友'} subtitle={english ? '点一点，听单词；再听听它在一句话里。' : '点一点，听听它的名字。'} onBack={() => navigate('home')} />
        {browseItem ? <section className="browse-detail">
          <button className="round-button detail-close" aria-label="返回全部小伙伴" onClick={() => { stopAudio(); setBrowseItem(null) }}><Icon name="close" /></button>
          {browseItem.concept === 'water' ? <WaterCup full /> : <Art concept={browseItem.concept} />}
          <h2>{browseItem.target}</h2>
          {browseItem.pictureNote && <p>{browseItem.pictureNote}</p>}
          {!english && browseItem.label !== browseItem.target && <p>{browseItem.label}</p>}
          <div className="button-row"><button className={`primary ${speaking ? 'is-speaking' : ''}`} onClick={() => void play(browseItem.audio.label)}><Icon name="sound" />听听名字</button><button className="secondary" onClick={() => void play(browseItem.audio.example)}>听一句话</button></div>
          {english && <p className="example-line" lang="en">{browseItem.example}</p>}
          {browseItem.actionHint && <p className="movement-cue">一起做：{browseItem.actionHint}</p>}
          <p className="parent-whisper">一起玩：{browseItem.offlinePrompt}</p>
        </section> : <><div className="browse-filters" aria-label="图画书分类">{['全部', '新朋友', ...Object.keys(browseGroups)].map(group => <button key={group} aria-pressed={browseGroup === group} onClick={() => { stopAudio(); setBrowseGroup(group) }}>{group}{group === '全部' ? ` ${currentBrowseItems.length}` : group === '新朋友' ? ` ${homeNatureConcepts.length}` : ''}</button>)}</div><div className="concept-grid">{shownBrowseItems.map(item => <button key={item.id} className="concept-card" aria-label={item.target} onClick={async () => { const saved = await run(s => recordExposure(s, item)); if (!saved) return; setBrowseItem(item); void play(item.audio.label) }}>
          <Art concept={item.concept} /><span>{item.target}</span>{item.pictureNote && <small className="vehicle-note">{item.pictureNote}</small>}<i><Icon name="sound" size={20} /></i>
        </button>)}</div></>}
      </main>}

      {page === 'lesson' && currentTask && currentItem && <main className="lesson-page">
        <div className="lesson-top"><button className="round-button" aria-label="暂停学习" onClick={() => { stopAudio(); setPaused(true) }}><Icon name="pause" /></button>
          <div className="progress-pebbles" aria-label={`第 ${(state.plan?.index ?? 0) + 1} 步，共 5 步`}>{[0, 1, 2, 3, 4].map(i => <span key={i} className={i < state.plan!.index ? 'done' : i === state.plan!.index ? 'current' : ''}>{i < state.plan!.index ? <Icon name="check" size={17} /> : ''}</span>)}</div>
          <span className="lesson-mode">{currentTask.kind === 'match' ? currentTask.matchMode === 'listen' ? '听音配对' : '配成两对' : <button className={`round-button sound ${speaking ? 'is-speaking' : ''}`} aria-label="重听题目" onClick={() => { setPromptPlayed(false); void play(lessonAudio).then(ok => setPromptPlayed(ok)) }}><Icon name="sound" /></button>}</span></div>
        <div className="lesson-title"><span className="eyebrow">{currentTask.kind === 'learn' ? '和新朋友打个招呼' : currentTask.kind === 'match' ? currentTask.matchMode === 'listen' ? '给声音找朋友' : '给词语找朋友' : currentTask.kind === 'sentence' ? '听一句，找一找' : currentTask.kind === 'character' ? '认一认，找一找' : currentTask.optionIds.length === 3 ? '三个朋友，听听是哪一个' : '竖起小耳朵'}</span><h1>{currentTask.kind === 'learn' ? (english ? 'Hello, little friend!' : '你好呀，小伙伴') : currentTask.kind === 'match' ? currentTask.matchMode === 'listen' ? '听到的朋友，躲在哪张图里？' : '词语和图片，谁是一对？' : currentTask.kind === 'sentence' ? '这句话里，说到了谁？' : currentTask.kind === 'character' ? '哪个是刚才听到的字？' : english ? 'Listen. Can you find it?' : '听一听，它在哪里？'}</h1></div>
        {currentTask.kind === 'learn' ? <div className="learning-card">
          {currentItem.concept === 'water' ? <WaterCup full /> : <Art concept={currentItem.concept} />}
          <span className="learning-word">{currentItem.target}</span>
          <button className="lesson-example secondary" disabled={busy} onClick={() => void play(currentItem.audio.example)}><Icon name="sound" size={20} />{english ? currentItem.example : '听一句话'}</button>
          {currentItem.actionHint && <p className="movement-cue">一起做：{currentItem.actionHint}</p>}
          <button className="primary" disabled={busy} onClick={() => void finishTask()}>{english ? 'Let’s play' : '认识啦，接着玩'}<span>→</span></button>
        </div> : currentTask.kind === 'match' ? <MatchTask key={currentTask.id} task={currentTask} items={trialItems} busy={busy} paused={paused} onListen={play} onStop={stopAudio}
          onPair={async (wordId, pictureId, heard) => {
            const next = await run(s => answerMatch(s, currentTask.id, wordId, pictureId, new Date(), heard))
            if (!next) return false
            if (next.plan?.completedAt) navigate('reward')
            return true
          }}
          onHelp={async wordId => {
            const next = await run(s => recordAttempt(s, currentTask.id))
            if (!next) return false
            const item = byId.get(wordId)
            if (item) void play(currentTask.matchMode !== 'listen' && item.language === 'zh-CN' ? item.audio.character ?? item.audio.label : item.audio.label)
            return true
          }} /> : <>
          <div className={`answer-options ${currentTask.optionIds.length === 3 ? 'three-options' : ''} ${currentTask.kind === 'character' ? 'character-options' : ''}`}>
            {currentTask.optionIds.map(id => {
              const item = byId.get(id)
              const hinted = currentTask.hintUsed && id === currentTask.itemId
              return <button key={id} className={`answer-card ${hinted ? 'hinted' : ''}`} disabled={busy || (!promptPlayed && !currentTask.hintUsed)} aria-label={currentTask.kind === 'character' ? item?.target : id === 'empty-cup' ? '空杯子' : item?.label} onClick={() => void answer(id)}>
                {currentTask.kind === 'character' ? <span className="character">{item?.target}</span>
                  : currentItem.concept === 'water' ? <WaterCup full={id === currentTask.itemId} /> : item && <Art concept={item.concept} alternate={state.plan!.index >= 3} />}
                {hinted && <span className="hint-tag">在这里，我们一起点</span>}
              </button>
            })}
          </div>
          <div className="lesson-guidance" aria-live="polite">{feedback || (speaking ? '小耳朵听一听…' : promptPlayed ? '轻轻点一下就好' : '点右上角的小喇叭，听听题目')}<button disabled={busy} onClick={async () => { const saved = await run(s => recordAttempt(s, currentTask.id)); if (!saved) return; setFeedback('我们一起找一找'); void play(currentItem.audio.label) }}>一起帮帮忙</button></div>
          {currentTask.hintUsed && <button className="text-button assisted-next" onClick={() => void finishTask(true)} disabled={busy}>一起认识过了，接着玩 →</button>}
        </>}
      </main>}

      {page === 'reward' && <main className="celebration-page">
        <span className="eyebrow">每一小步，都值得开心</span><div className="reward-coin"><Icon name="coin" size={90} /><span>+1</span></div>
        <h1>这一轮，玩好啦！</h1><p>一枚小金币，送给认真探索的你。</p>
        <div className="button-row"><button className="primary" onClick={() => navigate('game')}><Icon name="bubbles" />选一个小游戏</button><button className="secondary" onClick={() => navigate('end')}>存起来，下次玩</button></div><Art concept="cat" className="reward-friend" />
      </main>}

      {page === 'game' && <main className={`game-page ${gameKind === 'race' ? 'panda-race-page' : ''}`}>
        <PageHeading title={gameInfo?.title ?? '小小游戏屋'} subtitle={gameInfo ? gameInfo.description : '今天想怎么玩？选一种，和小伙伴一起玩。'} onBack={() => { if (selectedGame && !unclaimedGame) setSelectedGame(null); else navigate('home') }} />
        {!gameKind ? <div className="game-picker">{games.map(game => <button className={'game-door ' + game.kind} key={game.kind} aria-label={'选择' + game.title} onClick={() => setSelectedGame(game.kind)}>
          <span className="game-door-scene" aria-hidden="true">{game.kind === 'race' ? <><span className="race-cover-flag">⚑</span><PandaPig className="art" /></> : game.kind === 'kitchen' ? <img className="art" src="/assets/red-monster-chef-v21.png" alt="" /> : <><Icon name={game.icon} size={66} /><Art concept={game.kind === 'claw' ? 'red-monster' : game.kind === 'hide' ? 'cat' : game.kind === 'pusher' ? 'dog' : 'fish'} /></>}</span>
          <strong>{game.title}</strong><span className="game-door-english">{game.english}</span><p>{game.description}</p><span className="game-door-entry">进去看看 ↗</span>
        </button>)}</div> : gameKind === 'race' ? <PandaRaceGame state={state} busy={busy} paused={paused} run={run} playAudio={play} stopAudio={stopAudio} /> : <Arcade playAudio={play} state={state} kind={gameKind} selectedToy={selectedToy} onSelectToy={setSelectedToy} busy={busy} paused={paused} run={run} onClaim={() => { navigate('collection'); void play(systemAudio[language].good) }} onSpeak={toy => { const item = trialItems.find(item => item.concept === toy && item.language === (unclaimedGame ? state.game?.language ?? language : language)); if (item) void play(item.audio.label) }} onPrompt={toy => { const item = trialItems.find(item => item.concept === toy && item.language === (unclaimedGame ? state.game?.language ?? language : language)); return item ? play(item.audio.prompt) : Promise.resolve(false) }} />}

        {!unclaimedGame && gameKind !== 'race' && <p className="game-note">{state.balance < 1 ? '一起玩完一轮，就会得到一枚游戏币。' : getRemainingSeconds(state) < 45 ? '金币已经存好，下次有充足时间再来玩。' : '收集伙伴的小游戏每局 1 币；猪猪赛跑免费。'}</p>}
        {!unclaimedGame && gameKind !== 'race' && state.balance < 1 && <button className="text-button" onClick={begin}>先去认识新朋友 →</button>}
      </main>}

      {page === 'collection' && <main className="inner-page collection-page">
        <PageHeading title="77 的小小家" subtitle="手指拖着摆，轻点听名字。每位朋友都有自己的位置。" onBack={() => navigate('home')} />
        <CollectionRoom toys={uniqueToys} language={language} onSpeak={play} positions={collectionPositions(state.roomPositions, state.scenePositions)} disabled={busy || paused} onMove={async (toy, position) => Boolean(await run(s => moveRoomToy(s, toy, position)))} />
        <div className="button-row"><button className="primary" onClick={begin} disabled={busy}>{uniqueToys.length ? '再认识新朋友 →' : '一起去认识朋友 →'}</button><button className="secondary" onClick={() => navigate('game')}>{uniqueToys.length ? '再选一个游戏' : '去小游戏屋'}</button>{uniqueToys.length > 0 && <button className="text-button" onClick={() => navigate('end')}>先休息一会儿</button>}</div>
      </main>}

      {page === 'end' && <main className="end-page">
        <span className="eyebrow">小小乐园，下次见</span><div className="end-art"><Art concept="book" /><span>✿</span></div><h1>把小快乐，带到生活里</h1><p>{currentItem?.offlinePrompt ?? '和爸爸妈妈选一本绘本，找找里面的小猫吧。'}</p><span className="saved-note"><Icon name="check" size={18} />进度和小金币都保管好啦</span>
        <button className="secondary" onClick={() => navigate('home')}><Icon name="home" size={20} />回到乐园</button>
      </main>}

      {page === 'parent' && <main className="parent-page">
        <PageHeading title="家长的小角落" subtitle="陪着玩，慢慢观察。每一次点击都只是一次小小的尝试。" onBack={() => navigate('home')} />
        <div className="parent-stats"><div><strong>{concepts.length} <small>个概念</small></strong><span>英文 {concepts.length} 项 · 中文 {bilingualConcepts.length} 项</span></div><div><strong>{Math.floor((usage?.activeSeconds ?? 0) / 60)} <small>分钟</small></strong><span>今天前台活动时间</span></div><div><strong>{state.balance} <small>枚币</small></strong><span>今天完成 {state.ledger.filter(entry => entry.kind === 'reward' && entry.dayKey === dayKey()).length} 轮</span></div></div>
        <div className="parent-columns"><section className="parent-panel"><h2>今天怎么一起玩</h2>
          <fieldset><legend>这一轮的语言</legend><div className="segmented">{([['zh-CN', '中文'], ['en-US', 'English']] as const).map(([value, label]) => <button aria-pressed={language === value} key={value} onClick={() => void settings({ language: value })}>{label}</button>)}</div><p>未完成的学习和小游戏保留原语言，下一轮使用新设置。</p></fieldset>
          <label className="toggle-row parent-managed"><span>由家长决定玩多久<small>开启后可继续学习和游戏，不设每日次数上限</small></span><input type="checkbox" checked={parentManaged} onChange={e => void settings({ parentManaged: e.target.checked })} /></label>
          {!parentManaged && <><fieldset><legend>每天正式认识的新内容</legend><div className="segmented">{([0, 1, 2] as const).map(value => <button key={value} aria-pressed={state.settings.dailyNewCap === value} onClick={() => void settings({ dailyNewCap: value })}>{value === 0 ? '只复习' : `${value} 项`}</button>)}</div></fieldset>
          <fieldset><legend>每天玩多久</legend><div className="segmented">{([180, 300, 480, 600] as const).map(value => <button key={value} aria-pressed={state.settings.budgetSeconds === value} onClick={() => void settings({ budgetSeconds: value })}>{value / 60} 分钟</button>)}</div></fieldset>
          </>}
          <label className="toggle-row"><span>中文认字与字图配对<small>听懂词语与认出字形分别记录</small></span><input type="checkbox" checked={state.settings.recognition} onChange={e => void settings({ recognition: e.target.checked })} /></label>
          <p className="muted">一轮 5 步，完成就得 1 币，可以继续下一轮。收集伙伴的小游戏每局用 1 币；抓娃娃没抓中可免费重试。猪猪赛跑免费，猜中冠军得 1 币。自由浏览不发币，前台时间照常记录。</p>
        </section><section className="parent-panel"><h2>存档与素材</h2><p>中文已统一为您选定的 D 普通话男声，词语、短句和游戏提示的音量也已统一。点下面的按钮可以试听；完成离线准备后可断网播放。</p><div className="button-row"><button className="secondary" onClick={() => void play(trialItems.find(item => item.language === 'zh-CN' && item.concept === 'grandma-shark')!.audio.label)}><Icon name="sound" size={18} />试听中文词语</button><button className="secondary" onClick={() => void play(trialItems.find(item => item.language === 'zh-CN' && item.concept === 'grandpa-shark')!.audio.example)}><Icon name="sound" size={18} />试听中文短句</button><button className="secondary" onClick={() => void play(trialItems.find(item => item.language === 'en-US' && item.concept === 'cat')!.audio.label)}><Icon name="sound" size={18} />试听英文单词</button><button className="secondary" onClick={() => void play(systemAudio['en-US'].game)}><Icon name="sound" size={18} />试听英文短句</button></div><div className="button-row"><button className="secondary" onClick={() => downloadJson(state, '77-乐园存档.json')}><Icon name="download" size={18} />导出存档</button><label className="secondary file-button">恢复存档<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void restore(file); e.target.value = '' }} /></label></div>
          <p className="muted">进度只保存在当前浏览器。清理网站数据或换设备前请导出。家长口令仅防误触。</p><hr /><h2>iPad 不开电脑怎么玩</h2><ol className="install-steps"><li>使用独立的 HTTPS 网址打开乐园。</li><li>Safari 点分享，再点“添加到主屏幕”。</li><li>从主屏幕打开，等待页面顶部显示图片和声音已保存到本机，再尝试断网玩。</li></ol><p>{window.isSecureContext ? '电脑关机后，已完整缓存的版本仍可使用；新版本需要联网更新。' : '现在是局域网试玩地址，需要电脑开着。独立网址尚未上线。'}</p><button className="secondary" onClick={async () => { if (!navigator.storage?.persist) { setStorageNote('这个浏览器暂不支持申请保留；请定期导出存档。'); return } try { const kept = await navigator.storage.persist(); setStorageNote(kept ? '浏览器已允许保留本机数据，仍建议定期导出存档。' : '浏览器暂未允许长期保留，请从主屏幕打开后再试，并定期导出存档。') } catch { setStorageNote('暂时无法申请保留，请定期导出存档。') } }}>申请保留本机数据</button>{storageNote && <p role="status">{storageNote}</p>}<hr /><h2>玩法会慢慢变多</h2><p className="muted">先听单词二选一；同一语言完成两轮、认识至少 3 个朋友后，加入三选一和词图配对。中英文从第四轮起再听短句找图片，第六轮起交替加入听音配对；中文认字关闭时只做听音配对，这是增加玩法，不代表已经掌握。</p><hr /><h2>最近的小发现</h2><div className="evidence-list">{state.events.length ? state.events.slice(-5).reverse().map(event => <div key={event.eventId}><span>{byId.get(event.contentId)?.label ?? event.contentId}</span><small>{event.ability === 'zh_character_recognition' ? '汉字识别' : event.ability === 'en_word_recognition' ? '英文词图辨认' : event.ability === 'exposure' ? '接触内容' : '听音辨认'}</small><em>{event.outcome === 'independent_correct' ? '本次独立选出' : event.outcome === 'assisted' ? '一起帮助完成' : '认识过了'}</em></div>) : <p className="muted">一起玩过以后，这里会留下记录。</p>}</div>
        </section></div>
        <section className="parent-panel catalog-panel"><div className="catalog-heading"><div><h2>完整内容目录</h2><p>保留原交接 200 项，补充本次新内容；当前英文 {concepts.length} 项、中文 {bilingualConcepts.length} 项，共 {trialItems.length} 项可玩。</p></div><input aria-label="搜索内容目录" type="search" placeholder="找一个字或单词…" value={query} onChange={e => setQuery(e.target.value)} /></div>
          <div className="catalog-list">{catalog.filter(item => `${item.target} ${item.label} ${item.theme}`.toLowerCase().includes(query.toLowerCase())).map(item => <div key={item.id}><strong>{item.target}</strong><span>{item.language === 'zh-CN' ? '中文' : '英文'} · {item.theme}</span><small className={item.available ? 'available' : ''}>{item.available ? '本次可玩' : '素材待制作'}</small></div>)}</div>
        </section>
      </main>}
    </>}

    {gate && <div className="modal-backdrop"><section className="modal parent-gate" role="dialog" aria-modal="true" aria-labelledby="gate-title"><button className="round-button modal-close" aria-label="关闭家长入口" onClick={() => setGate(false)}><Icon name="close" /></button><span className="modal-symbol"><Icon name="lock" size={32} /></span><h2 id="gate-title">爸爸妈妈的小角落</h2><p>请由家长输入试玩口令 <strong>7707</strong></p><form onSubmit={e => { e.preventDefault(); if (pin === '7707') { setGate(false); navigate('parent'); setPaused(false) } else setPin('') }}><input aria-label="家长口令" type="password" inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={e => setPin(e.target.value)} /><button className="primary" type="submit">进入家长设置</button></form><small>仅用于防止孩子误触，不是账号密码。</small></section></div>}
    {paused && !gate && page !== 'parent' && page !== 'end' && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span className="modal-symbol"><Icon name="leaf" size={36} /></span><h2 id="pause-title">小伙伴等着你</h2><p>刚才玩到的地方，已经记住啦。</p><button className="primary" onClick={async () => { if (page === 'lesson') { const next = await run(s => startPlan(s, trialItems)); if (!next) return } setPaused(false) }}><Icon name="play" size={20} />接着一起玩</button><button className="text-button" onClick={() => { setPaused(false); navigate('home') }}>先回乐园</button></section></div>}
  </div>
}

function PageHeading({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <div className="page-heading"><button className="round-button" aria-label="返回乐园" onClick={onBack}><Icon name="back" /></button><div><h1>{title}</h1><p>{subtitle}</p></div></div>
}
