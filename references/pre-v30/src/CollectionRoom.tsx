import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Art } from './Art'
import { conceptNames, trialItems } from './content'
import type { Concept } from './content'
import type { Language } from './engine'
import './collection-room.css'
import { makeRoomPages, roomNames, roomMoveBounds, clampRoomPosition, sceneArt } from './rooms'
import type { RoomPosition, RoomBounds } from './rooms'

export function CollectionRoom({ toys, language, onSpeak, positions = {}, onMove, disabled }: {
  toys: string[]; language: Language; onSpeak: (url: string) => Promise<boolean>
  positions?: Record<string, RoomPosition>; disabled: boolean
  onMove: (toy: string, position: RoomPosition) => Promise<boolean>
}) {
  const rooms = makeRoomPages(toys)
  const [page, setPage] = useState(Math.max(0, rooms.findIndex(room => room.toys.some(toy => toy.id === toys.at(-1)))))
  const [selected, setSelected] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; pointer: number; button: HTMLButtonElement; startX: number; startY: number; origin: RoomPosition; bounds: RoomBounds; width: number; height: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<{ id: string; point: RoomPosition; bounds: RoomBounds } | null>(null)
  const saving = useRef(false)
  const suppressClick = useRef(false)
  const [message, setMessage] = useState('')
  function cancelDrag() {
    const active = drag.current
    if (!active) return
    drag.current = null
    suppressClick.current = true
    setPreview(null)
    if (active.button.hasPointerCapture(active.pointer)) active.button.releasePointerCapture(active.pointer)
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) cancelDrag() }
    window.addEventListener('resize', cancelDrag)
    document.addEventListener('visibilitychange', hide)
    return () => { cancelDrag(); window.removeEventListener('resize', cancelDrag); document.removeEventListener('visibilitychange', hide) }
  }, [])
  useEffect(() => { if (disabled) cancelDrag() }, [disabled])
  async function savePosition(id: string, point: RoomPosition, bounds: RoomBounds) {
    if (saving.current) return
    saving.current = true
    setSelected(id)
    setPreview({ id, point, bounds })
    setMessage('正在记住位置…')
    try { setMessage(await onMove(id, point) ? '摆好啦，位置记住了' : '没有保存成功，已回到原位置，请再试一次') }
    catch { setMessage('没有保存成功，已回到原位置，请再试一次') }
    finally { saving.current = false; setPreview(null) }
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>, id: string, origin: RoomPosition, bounds: RoomBounds) {
    if (disabled || saving.current || drag.current || !event.isPrimary || event.button !== 0 || !stage.current) return
    const rect = stage.current.getBoundingClientRect()
    suppressClick.current = false
    setMessage('')
    drag.current = { id, pointer: event.pointerId, button: event.currentTarget, startX: event.clientX, startY: event.clientY, origin, bounds, width: rect.width, height: rect.height, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function dragPoint(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    const dx = event.clientX - active.startX, dy = event.clientY - active.startY
    if (!active.moved && Math.hypot(dx, dy) < 8) return
    active.moved = true
    suppressClick.current = true
    return clampRoomPosition({ x: active.origin.x + dx / active.width * 100, y: active.origin.y + dy / active.height * 100 }, active.bounds)
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const point = dragPoint(event)
    if (point && drag.current) setPreview({ id: drag.current.id, point, bounds: drag.current.bounds })
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.pointer !== event.pointerId) return
    const point = dragPoint(event), active = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (point) void savePosition(active.id, point, active.bounds)
  }
    const pages = rooms.length
  const room = rooms[Math.min(page, pages - 1)]
  const art = sceneArt[room.kind]
  const newRoomIndex = ['sea','forest','bedroom'].indexOf(room.kind)
  const quadrant = ['kitchen', 'playroom', 'garden', 'sky'].indexOf(room.kind)
  const itemFor = (toy: string) => trialItems.find(item => item.concept === toy && item.language === language)
    ?? trialItems.find(item => item.concept === toy && item.language === 'en-US')
  const nameFor = (toy: string) => language === 'en-US' ? itemFor(toy)?.target ?? toy : conceptNames[toy as Concept] ?? toy
  const item = selected ? itemFor(selected) : undefined

  return <section className="collection-room" aria-label="小伙伴的小屋">
    <div className="room-stage">
      <div ref={stage} className={`living-room room-${room.kind}`}>
        {art ? <svg className="room-background" viewBox={`${art.quadrant % 2 * 836 + 2} ${Math.floor(art.quadrant / 2) * 470.5 + 2} 832 466.5`} role="img" aria-label={roomNames[room.kind]}><image href={`/assets/collection-scenes-v29-${art.sheet}.png`} width="1672" height="941" /></svg> : room.kind === 'living' ? <img className="room-background" src="/assets/collection-living-room-v10.png" alt="温暖的小客厅：绿色沙发、木桌、小柜子、衣柜和墙上搁板" draggable={false} />
          : room.kind === 'road' ? <img className="room-background" src="/assets/collection-road-v27.png" alt="小镇马路：消防站、警察站和沙地施工区" draggable={false} />
          : newRoomIndex >= 0 ? <svg className="room-background" viewBox={`0 ${newRoomIndex * 1630 / 3} 965 ${1630 / 3}`} role="img" aria-label={roomNames[room.kind]}><image href="/assets/rooms-v13.png" width="965" height="1630" /></svg> : <svg className="room-background" viewBox={`${quadrant % 2 * 836} ${Math.floor(quadrant / 2) * 470.5} 836 470.5`} role="img" aria-label={roomNames[room.kind]}><image href="/assets/collection-rooms-v11.png" width="1672" height="941" /></svg>}
        {preview && <div className="room-move-area" aria-hidden="true" style={{ left: `${preview.bounds.left}%`, top: `${preview.bounds.top}%`, width: `${preview.bounds.right - preview.bounds.left}%`, height: `${preview.bounds.bottom - preview.bounds.top}%` }} />}
        {room.toys.map(({ id: toy, seat }) => {
          const bounds = roomMoveBounds(room.kind, toy, seat)
          const point = preview?.id === toy ? preview.point : positions[toy] ?? seat
          return <button key={toy} className={`room-toy toy-${toy}${preview?.id === toy ? ' moving' : ''}`} aria-label={`${nameFor(toy)} · ${seat.place} · 可拖动，轻点听名字`} aria-pressed={selected === toy}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onPointerDown={event => beginDrag(event, toy, point, bounds)} onPointerMove={moveDrag} onPointerUp={endDrag}
            onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) cancelDrag() }}
            onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) cancelDrag() }}
            onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
              event.preventDefault()
              if (disabled || saving.current || drag.current) return
              const x = point.x + (event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0)
              const y = point.y + (event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0)
              void savePosition(toy, clampRoomPosition({ x, y }, bounds), bounds)
            }}
            onClick={() => {
              if (suppressClick.current) { suppressClick.current = false; return }
              if (disabled || saving.current || drag.current) return
              setMessage(''); setSelected(toy)
              const greeting = itemFor(toy); if (greeting) void onSpeak(greeting.audio.label)
            }}>
            <Art concept={toy} />
          </button>
        })}
        {!toys.length && <p className="room-empty-note">留一个位置，等小伙伴回家</p>}
      </div>
    </div>
    <div className="room-toolbar">
      <p className="room-greeting" role="status">{selected ? <><strong>{nameFor(selected)}</strong><span>{preview ? '在亮起的区域挪一挪，松手就记住' : message || (!item ? '这位老朋友还没有录音' : language !== item.language ? '听英文 · 和朋友打个招呼' : '轻点听名字，也可以用手指拖着摆')}</span></> : <><strong>{toys.length ? `${roomNames[room.kind]} · 共收藏 ${toys.length} 位小伙伴` : '小客厅准备好啦'}</strong><span>{toys.length ? preview ? '在亮起的区域挪一挪，松手就记住' : '轻点听名字，拖动换位置；松手自动保存' : '去玩一个小游戏，接第一位朋友回家'}</span></>}</p>
      {pages > 1 && <nav className="room-pagination" aria-label="翻看小伙伴">
        <button aria-label="上一页小伙伴" disabled={page === 0 || !!preview || disabled} onClick={() => { cancelDrag(); setPage(page - 1); setSelected(null); setMessage('') }}>←</button>
        <span aria-live="polite">{page + 1} / {pages}</span>
        <button aria-label="下一页小伙伴" disabled={page === pages - 1 || !!preview || disabled} onClick={() => { cancelDrag(); setPage(page + 1); setSelected(null); setMessage('') }}>→</button>
      </nav>}
    </div>
  </section>
}
