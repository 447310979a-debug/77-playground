import { useEffect, useRef, useState } from 'react'
import { Art } from './Art'
import { conceptNames } from './content'
import type { Task, TrialItem } from './engine'

type Props = {
  task: Task; items: TrialItem[]; busy: boolean; paused: boolean;
  onListen: (url: string, onStarted: () => void) => Promise<boolean>;
  onStop: () => void;
  onPair: (wordId: string, pictureId: string, heard: boolean) => Promise<boolean>;
  onHelp: (wordId: string) => Promise<boolean>;
}

export function MatchTask({ task, items, busy, paused, onPair, onHelp, onListen, onStop }: Props) {
  const listeningMode = task.matchMode === 'listen'
  const [heard, setHeard] = useState(false)
  const request = useRef(0), pairing = useRef(false)
  useEffect(() => { if (paused) { request.current++; setHeard(false); select(null) } }, [paused])
  useEffect(() => () => { request.current++ }, [])
  const [selected, select] = useState<string | null>(null)
  const [message, setMessage] = useState(listeningMode ? '先点一个小喇叭，听出来就能找图片。' : '先点左边的词，再点右边的图片。')
  const [helped, setHelped] = useState<string | null>(null)
  const matched = task.matchedIds ?? []
  const words = task.optionIds.map(id => items.find(item => item.id === id)!)
  const order = [...task.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2
  const pictures = order ? [...words].reverse() : words
  const disabled = busy || paused
  const canPair = !listeningMode || heard

  async function pair(id: string) {
    if (!selected || disabled || !canPair || pairing.current) return
    const wordId = selected, token = ++request.current
    pairing.current = true
    onStop()
    try {
      if (!await onPair(wordId, id, heard) || token !== request.current) return
      if (wordId === id) {
        select(null); setHeard(false); setHelped(null)
        setMessage(listeningMode ? '配对啦！再听另一个声音。' : '配对啦！再给另一个词找朋友。')
      } else setMessage(listeningMode ? '再听听，声音说的是谁？' : '再看看，这个词的朋友在哪里？')
    } finally { pairing.current = false }
  }

  return <div className="matching-task">
    <p className="match-instruction">{listeningMode ? '点小喇叭，听出是谁，就点它的图片。' : '点一个词，再点它的图片，就能成为一对。'}</p>
    <div className="match-board" aria-label={listeningMode ? '声音与图片配对' : '单词与图片配对'}>
      <div className="match-column">
        <span className="match-column-label">{listeningMode ? '① 听一个声音' : '① 点一个词'}</span>
        {words.map((item, index) => <button key={item.id} className={`match-word ${matched.includes(item.id) ? 'matched' : ''}`} data-item-id={item.id}
          aria-label={listeningMode ? `播放声音 ${index + 1}` : `选择词语：${item.target}`} aria-pressed={selected === item.id}
          disabled={disabled || matched.includes(item.id)} onClick={async () => {
            if (disabled || pairing.current) return
            setHelped(null)
            if (!listeningMode) { select(item.id); setMessage('选好词啦，点右边对应的图片。'); return }
            const token = ++request.current; select(item.id); setHeard(false); setMessage('小耳朵听一听…')
            const ok = await onListen(item.audio.label, () => {
              if (token !== request.current) return
              setHeard(true); setMessage('听出是谁啦？点右边对应的图片。')
            })
            if (token !== request.current) return
            if (!ok) { setHeard(false); setMessage('声音没播出来，再点小喇叭试试。') }
          }}>
          <span lang={item.language}>{listeningMode ? `♪ ${index + 1}` : item.target}</span>{matched.includes(item.id) && <small>✓ 配对啦</small>}
        </button>)}
      </div>
      <div className="match-column">
        <span className="match-column-label">② 找它的图片</span>
        {pictures.map(item => <button key={item.id} className={`match-picture ${matched.includes(item.id) ? 'matched' : ''} ${helped === item.id ? 'hinted' : ''}`} data-item-id={item.id}
          aria-label={`配对图片：${conceptNames[item.concept]}`} disabled={disabled || !selected || !canPair || matched.includes(item.id)} onClick={() => void pair(item.id)}>
          <Art concept={item.concept} alternate />{matched.includes(item.id) && <small>✓ 配对啦</small>}
        </button>)}
      </div>
    </div>
    <p className="match-feedback" role="status">{message}</p>
    <div className="match-footer"><span>已配好 {matched.length} / {words.length} 对</span><button className="text-button" disabled={disabled || !selected || !canPair} onClick={async () => {
      if (!selected || pairing.current) return
      const wordId = selected, token = ++request.current
      pairing.current = true
      try { if (await onHelp(wordId) && token === request.current) { setHelped(wordId); setMessage('听听这个词，再看看亮起来的图片。') } }
      finally { pairing.current = false }
    }}>一起帮帮忙</button></div>
  </div>
}
