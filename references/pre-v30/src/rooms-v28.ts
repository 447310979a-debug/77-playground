import { sharkConcepts, freshFoodConcepts, dailyConcepts, clothingConcepts, gardenConcepts, rescueConstructionConcepts, familyVehicleConcepts, familyRoadConcepts } from './concepts.ts'
type Place = { x: number; y: number; place: string }
export type RoomKind = 'living' | 'kitchen' | 'playroom' | 'garden' | 'sky' | 'sea' | 'forest' | 'bedroom' | 'road'
export const roomNames: Record<RoomKind, string> = { living: '暖暖客厅', kitchen: '小小厨房', playroom: '玩具车车屋', garden: '花园小屋', sky: '星空小屋', sea: '海底小屋', forest: '森林营地', bedroom: '晚安小屋', road: '小镇马路与工地' }
const rooms: Record<RoomKind, string[]> = {
  living: ['cat', 'dog', 'rabbit', 'bear', 'red-monster', 'hat', 'shoe', 'sock', 'umbrella', ...clothingConcepts],
  kitchen: ['water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'grape', 'pear', 'milk', 'bread', 'egg', 'cup', 'spoon', 'bowl', ...freshFoodConcepts],
  playroom: ['train', 'ball', 'book'],
  road: ['car', 'bus', 'bicycle', ...rescueConstructionConcepts, ...familyVehicleConcepts],
  garden: ['bird', 'duck', 'cow', 'pig', 'horse', 'sheep', 'tree', 'flower', 'fish', 'boat', ...gardenConcepts],
  sea: ['turtle','crab','whale','dolphin','octopus','starfish', ...sharkConcepts],
  forest: ['lion','tiger','elephant','monkey'],
  bedroom: ['bed','lamp','pillow','blanket'],
  sky: ['sun', 'moon', 'star', 'cloud', 'airplane', 'helicopter', 'rainbow', 'rain', 'snowflake'],
}
export function roomFor(toy: string): RoomKind {
  return (Object.keys(rooms) as RoomKind[]).find(room => rooms[room].includes(toy)) ?? 'living'
}
const place = (x: number, y: number, name: string): Place => ({ x, y, place: name })
const surfaces: Record<RoomKind, Place[]> = {
  living: [place(24,56,'沙发左边'),place(45,56,'沙发右边'),place(36,71,'桌子左边'),place(61,71,'桌子右边'),place(70,51,'小柜子上'),place(58,25,'墙上搁板')],
  kitchen: [place(25,67,'餐桌左边'),place(49,67,'餐桌中间'),place(73,67,'餐桌右边'),place(30,42,'厨房台面'),place(57,42,'厨房台面'),place(48,12,'厨房搁板')],
  playroom: [place(80,88,'地毯停车位'),place(32,66,'地毯上'),place(61,44,'书架上')],
  road: [place(24,88,'马路上'),place(51,79,'马路上'),place(80,88,'马路上'),place(51,79,'马路上'),place(80,88,'马路上'),place(24,88,'马路上'),place(60,44,'施工区沙地'),place(82,44,'施工区沙地'),place(24,72,'马路上'),place(79,72,'马路上'),place(33,91,'马路上')],
  garden: [place(22,80,'花园草地'),place(43,78,'花园草地'),place(59,84,'花园草地'),place(32,94,'花园草地'),place(52,94,'花园草地'),place(16,96,'花园草地')],
  sea: [place(30,58,'海水里'),place(35,88,'海底沙地'),place(55,40,'海水里'),place(73,65,'海水里'),place(59,88,'海底沙地'),place(77,88,'海底沙地'),place(50,54,'海水里'),place(29,38,'海水里'),place(71,38,'海水里'),place(30,68,'海水里'),place(70,68,'海水里')],
  forest: [place(28,72,'森林草地'),place(52,81,'森林草地'),place(72,72,'森林草地'),place(42,64,'森林草地')],
  bedroom: [place(48,91,'卧室地毯'),place(88,34,'床头柜上'),place(40,46,'床边长凳'),place(61,46,'床边长凳')],
  sky: [place(28,32,'窗外天空'),place(66,33,'窗外天空'),place(48,25,'窗外天空'),place(47,55,'窗外天空'),place(28,34,'窗外天空'),place(68,34,'窗外天空'),place(48,25,'窗外天空'),place(31,55,'窗外天空'),place(66,55,'窗外天空')],
}
export function makeRoomPages(toys: string[]) {
  const pages: { kind: RoomKind; toys: { id: string; seat: Place }[] }[] = []
  for (const kind of Object.keys(rooms) as RoomKind[]) {
    const inRoom = toys.filter(toy => roomFor(toy) === kind)
    // Keep the shark family together without moving older sea friends or saved positions.
    const family = kind === 'road' ? rescueConstructionConcepts : kind === 'living' ? clothingConcepts : kind === 'garden' ? gardenConcepts : kind === 'sea' ? sharkConcepts : kind === 'sky' || kind === 'playroom' ? dailyConcepts : []
    const groups = family.length ? [inRoom.filter(id => !(family as readonly string[]).includes(id)), inRoom.filter(id => (family as readonly string[]).includes(id))] : [inRoom]
    if (kind === 'road') {
      groups[0] = groups[0].filter(id => !(familyRoadConcepts as readonly string[]).includes(id))
      groups.push(inRoom.filter(id => (familyRoadConcepts as readonly string[]).includes(id)))
    }
    // Dedicated positions keep sky objects, cars and pond friends off furniture on every page.
    for (const group of groups) for (let start = 0; start < group.length; start += 6) {
      let grass = 0
      const batch = group.slice(start, start + 6).map((id, index) => {
        let seat = surfaces[kind][index % surfaces[kind].length]
        if (['sky','playroom','sea','forest','bedroom','road'].includes(kind)) seat = surfaces[kind][rooms[kind].indexOf(id)]
        if (kind === 'living' && ['shoe','sock'].includes(id)) seat = place(id === 'shoe' ? 74 : 88, 90, '地毯上')
        if (kind === 'living' && id === 'umbrella') seat = place(86, 80, '衣柜旁的地面')
        if (kind === 'living' && (clothingConcepts as readonly string[]).includes(id)) seat = id === 'backpack' ? place(84, 88, '衣柜旁的地毯') : surfaces.living[clothingConcepts.indexOf(id as typeof clothingConcepts[number])]
        if (kind === 'kitchen' && (freshFoodConcepts as readonly string[]).includes(id) && index === 5) seat = place(48, 24, '厨房搁板')
        if (kind === 'garden') {
          seat = id === 'fish' ? place(80,85,'小池塘里') : id === 'boat' ? place(91,83,'小池塘水面')
            : id === 'bird' ? place(84,35,'木头鸟架') : id === 'tree' ? place(55,65,'花园泥土里')
            : id === 'flower' ? place(13,93,'花园花坛') : surfaces.garden[grass++]
          if (id === 'butterfly' || id === 'bee') seat = place(id === 'butterfly' ? 32 : 54, 42, '花园上空')
        }
        return { id, seat }
      })
      pages.push({ kind, toys: batch })
    }
  }
  return pages.length ? pages : [{ kind: 'living' as const, toys: [] }]
}

export type RoomPosition = { x: number; y: number }
export type RoomBounds = { left: number; right: number; top: number; bottom: number }
export function roomMoveBounds(kind: RoomKind, toy: string, seat: Place): RoomBounds {
  // Road vehicles keep their old movement bounds so saved rug positions remain valid.
  if (kind === 'road') return ['excavator','bulldozer'].includes(toy) ? { left: 53, right: 88, top: 39, bottom: 46 } : { left: 18, right: 82, top: 66, bottom: 91 }
  if (kind === 'sea') return ['crab','octopus','starfish'].includes(toy) ? { left: 23, right: 78, top: 81, bottom: 91 } : { left: 24, right: 77, top: 30, bottom: 69 }
  if (kind === 'forest') return { left: 21, right: 77, top: 64, bottom: 89 }
  if (kind === 'bedroom') return toy === 'bed' ? { left: 35, right: 62, top: 83, bottom: 93 } : toy === 'lamp' ? { left: 85, right: 91, top: 32, bottom: 34 } : { left: 31, right: 70, top: 45, bottom: 47 }
  if (kind === 'sky') return { left: 21, right: 77, top: 24, bottom: 57 }
  if (kind === 'playroom' && toy !== 'book') return { left: 18, right: 82, top: 66, bottom: 91 }
  if (kind === 'living' && ['shoe', 'sock'].includes(toy)) return { left: 65, right: 89, top: 84, bottom: 93 }
  if (kind === 'living' && toy === 'umbrella') return { left: 78, right: 89, top: 76, bottom: 91 }
  if (kind === 'living' && toy === 'backpack') return { left: 74, right: 89, top: 82, bottom: 93 }
  if (kind === 'garden') {
    if (toy === 'butterfly' || toy === 'bee') return { left: 21, right: 69, top: 28, bottom: 57 }
    if (toy === 'fish' || toy === 'boat') return { left: 77, right: 91, top: 81, bottom: 88 }
    if (toy === 'bird') return { left: 78, right: 88, top: 34, bottom: 36 }
    if (toy === 'tree') return { left: 49, right: 63, top: 63, bottom: 67 }
    if (toy === 'flower') return { left: 10, right: 20, top: 90, bottom: 95 }
    return { left: 16, right: 63, top: 76, bottom: 96 }
  }
  // Furniture stays on its original supporting surface; no room-to-room transfers.
  return { left: Math.max(10, seat.x - 9), right: Math.min(89, seat.x + 9), top: seat.y - 1, bottom: seat.y + 1 }
}
export function clampRoomPosition(point: RoomPosition, bounds: RoomBounds): RoomPosition {
  return { x: Math.max(bounds.left, Math.min(bounds.right, point.x)), y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)) }
}
