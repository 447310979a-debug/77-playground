import { sharkConcepts, rescueConstructionConcepts } from './concepts.ts'
import { makeRoomPages as legacyPages, roomMoveBounds as legacyBounds } from './rooms-v28.ts'
export { clampRoomPosition } from './rooms-v28.ts'
export type { RoomPosition, RoomBounds } from './rooms-v28.ts'
import type { RoomPosition, RoomBounds } from './rooms-v28.ts'
type Place = RoomPosition & { place: string }
const place = (x: number, y: number, name: string): Place => ({ x, y, place: name })
const rooms = {
  living: ['cat', 'dog', 'rabbit', 'red-monster'],
  wardrobe: ['shirt', 'pants', 'dress', 'coat', 'scarf', 'hat'],
  entry: ['shoe', 'sock', 'backpack', 'umbrella'],
  bedroom: ['bed', 'lamp', 'pillow', 'blanket'],
  kitchen: ['water', 'rice', 'cup', 'spoon', 'bowl'],
  breakfast: ['milk', 'bread', 'egg'],
  orchard: ['apple', 'banana', 'orange', 'strawberry', 'grape', 'pear'],
  market: ['peach', 'watermelon', 'lemon', 'cherry', 'pineapple'],
  vegetables: ['carrot', 'broccoli', 'corn', 'tomato', 'cucumber'],
  playroom: ['train', 'ball', 'book'],
  farm: ['cow', 'pig', 'horse', 'sheep', 'duck'],
  garden: ['bird', 'tree', 'flower', 'butterfly', 'bee'],
  meadow: ['ant', 'snail', 'ladybug', 'mushroom'],
  pond: ['fish', 'boat'],
  forest: ['lion', 'tiger', 'elephant', 'monkey', 'bear'],
  sea: ['turtle', 'crab', 'whale', 'dolphin', 'octopus', 'starfish'],
  reef: [...sharkConcepts],
  sky: ['sun', 'moon', 'star', 'cloud', 'rainbow', 'rain', 'snowflake'],
  airport: ['airplane', 'helicopter'],
  street: ['car', 'bicycle', 'bus', 'model-y', 'tiguan', 'pink-bicycle'],
  road: [...rescueConstructionConcepts],
} satisfies Record<string, string[]>
export type RoomKind = keyof typeof rooms
export const roomNames: Record<RoomKind, string> = {
  living: '暖暖客厅', wardrobe: '我的小衣柜', entry: '出门准备间', bedroom: '晚安小屋', kitchen: '小小厨房',
  breakfast: '早餐面包屋', orchard: '果园采摘篮', market: '海岛水果摊', vegetables: '小小蔬菜园', playroom: '玩具阅读角',
  farm: '快乐小农场', garden: '蝴蝶花园', meadow: '草丛微观世界', pond: '清清小池塘', forest: '森林营地',
  sea: '海底小屋', reef: '鲨鱼珊瑚湾', sky: '天空观察屋', airport: '蓝天小机场', street: '我家门前的路', road: '救援站与小工地',
}
// Each scene owns one distinct illustration; atlas quadrants are separate paintings.
export const sceneArt: Partial<Record<RoomKind, { sheet: string; quadrant: number }>> = {
  wardrobe: { sheet: 'a', quadrant: 0 }, entry: { sheet: 'a', quadrant: 1 }, farm: { sheet: 'a', quadrant: 2 }, meadow: { sheet: 'a', quadrant: 3 },
  pond: { sheet: 'b', quadrant: 0 }, reef: { sheet: 'b', quadrant: 1 }, breakfast: { sheet: 'b', quadrant: 2 }, orchard: { sheet: 'b', quadrant: 3 },
  market: { sheet: 'c', quadrant: 0 }, vegetables: { sheet: 'c', quadrant: 1 }, airport: { sheet: 'c', quadrant: 2 }, street: { sheet: 'c', quadrant: 3 },
}
export function roomFor(toy: string): RoomKind {
  return (Object.keys(rooms) as RoomKind[]).find(room => (rooms[room] as string[]).includes(toy)) ?? 'living'
}
const surfaces: Partial<Record<RoomKind, Place[]>> = {
  living: [place(24,56,'沙发左边'),place(45,56,'沙发右边'),place(36,71,'桌子左边'),place(61,71,'桌子右边')],
  wardrobe: [place(26,43,'衣柜上排挂钩'),place(50,43,'衣柜上排挂钩'),place(74,43,'衣柜上排挂钩'),place(26,73,'衣柜下排挂钩'),place(50,73,'衣柜下排挂钩'),place(74,73,'衣柜下排挂钩')],
  entry: [place(22,87,'换鞋凳下的鞋格'),place(38,68,'换鞋凳上'),place(60,51,'玄关墙上挂钩'),place(81,83,'门边雨伞架')],
  kitchen: [place(25,67,'餐桌左边'),place(49,67,'餐桌中间'),place(73,67,'餐桌右边'),place(30,42,'厨房台面'),place(57,42,'厨房台面')],
  breakfast: [place(20,72,'早餐盘'),place(50,72,'早餐盘'),place(80,72,'早餐盘')],
  orchard: [place(24,50,'后排果篮'),place(50,50,'后排果篮'),place(76,50,'后排果篮'),place(21,77,'前排果篮'),place(50,77,'前排果篮'),place(79,77,'前排果篮')],
  market: [place(28,52,'后排水果木箱'),place(50,52,'后排水果木箱'),place(72,52,'后排水果木箱'),place(35,80,'前排水果木箱'),place(66,80,'前排水果木箱')],
  vegetables: [place(23,59,'后排种植床'),place(50,59,'后排种植床'),place(77,59,'后排种植床'),place(34,83,'前排种植床'),place(66,83,'前排种植床')],
  farm: [place(24,73,'农场草地'),place(44,90,'农场草地'),place(51,70,'农场草地'),place(21,93,'农场草地'),place(81,80,'农场小池塘')],
  meadow: [place(24,82,'草地小径'),place(44,94,'草地小径'),place(65,82,'草地小径'),place(80,93,'草地小径')],
  pond: [place(42,80,'池塘水下'),place(64,51,'池塘水面')],
  reef: [place(50,56,'珊瑚湾海水里'),place(28,36,'珊瑚湾海水里'),place(73,36,'珊瑚湾海水里'),place(27,73,'珊瑚湾海水里'),place(74,73,'珊瑚湾海水里')],
  airport: [place(32,38,'机场上方天空'),place(68,52,'机场上方天空')],
  street: [place(24,71,'家门前马路'),place(79,72,'自行车道'),place(52,68,'公交站前马路'),place(24,91,'家门前马路'),place(52,88,'家门前马路'),place(82,92,'自行车道')],
  sky: [place(28,32,'窗外天空'),place(68,32,'窗外天空'),place(48,25,'窗外天空'),place(47,55,'窗外天空'),place(48,40,'窗外天空'),place(26,57,'窗外天空'),place(70,57,'窗外天空')],
}
const oldSeats = legacyPages(Object.values(rooms).flat()).flatMap(page => page.toys)
function seatFor(kind: RoomKind, id: string): Place {
  const index = (rooms[kind] as string[]).indexOf(id)
  if (surfaces[kind]) return surfaces[kind]![index] ?? place(70,51,'小柜子上')
  if (id === 'bear') return place(25,88,'森林草地')
  return oldSeats.find(toy => toy.id === id)?.seat ?? place(70,51,'小柜子上')
}
export function makeRoomPages(toys: string[]) {
  const pages: { kind: RoomKind; toys: { id: string; seat: Place }[] }[] = []
  for (const kind of Object.keys(rooms) as RoomKind[]) {
    const ids = [...new Set(toys)].filter(toy => roomFor(toy) === kind)
    if (ids.length) pages.push({ kind, toys: ids.map(id => ({ id, seat: seatFor(kind,id) })) })
  }
  return pages.length ? pages : [{ kind: 'living' as const, toys: [] }]
}
export function roomMoveBounds(kind: RoomKind, toy: string, seat: Place): RoomBounds {
  if (kind === 'farm') return toy === 'duck' ? { left: 76, right: 88, top: 77, bottom: 84 } : { left: 16, right: 62, top: 68, bottom: 94 }
  if (kind === 'meadow') return { left: 16, right: 85, top: 77, bottom: 95 }
  if (kind === 'pond') return toy === 'fish' ? { left: 24, right: 76, top: 68, bottom: 88 } : { left: 24, right: 77, top: 49, bottom: 53 }
  if (kind === 'reef') return { left: 23, right: 78, top: 30, bottom: 76 }
  if (kind === 'airport') return { left: 19, right: 80, top: 25, bottom: 59 }
  if (kind === 'street') return toy.includes('bicycle') ? { left: 75, right: 85, top: 68, bottom: 93 } : { left: 18, right: 64, top: 66, bottom: 93 }
  if (['wardrobe','entry','breakfast','orchard','market','vegetables'].includes(kind)) return { left: seat.x - 5, right: seat.x + 5, top: seat.y - 1, bottom: seat.y + 1 }
  return legacyBounds(kind as Parameters<typeof legacyBounds>[0], toy, seat)
}
// Keep V28 coordinates intact in the save; use them only where the supporting scene still fits.
export function collectionPositions(legacy: Record<string, RoomPosition> = {}, current: Record<string, RoomPosition> = {}) {
  return { ...Object.fromEntries(Object.entries(legacy).filter(([id]) => !sceneArt[roomFor(id)] && id !== 'bear')), ...current }
}
