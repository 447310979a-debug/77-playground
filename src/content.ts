import catalogData from './catalog.json'
import trialData from './trial-content.json'

import { concepts, bodyActionConcepts } from './concepts.ts'
import type { Concept } from './concepts.ts'
export type Language = 'zh-CN' | 'en-US'
export { concepts, bilingualConcepts, expansionConcepts, bodyActionConcepts, themeConcepts, sharkConcepts, oceanConcepts, freshFoodConcepts, travelConcepts, weatherConcepts, dailyConcepts, clothingConcepts, gardenConcepts, wardrobeGardenConcepts, vehicleConcepts, rescueConstructionConcepts, familyVehicleConcepts, familyRoadConcepts, homeNatureConcepts, washroomConcepts } from './concepts.ts'
export type { Concept } from './concepts.ts'
export const conceptNames: Record<Concept, string> = {
  chick: '小鸡', donkey: '驴', frog: '青蛙', dragonfly: '蜻蜓', cheese: '奶酪', plate: '盘子', fork: '叉子', toothbrush: '牙刷', toothpaste: '牙膏', towel: '毛巾', soap: '肥皂', comb: '梳子',
  'model-y': '爸爸的车', tiguan: '爷爷的车', 'pink-bicycle': '我的自行车',
  'police-car': '警车', excavator: '挖掘机', bulldozer: '推土机',
  shirt: '上衣', pants: '裤子', dress: '连衣裙', coat: '外套', scarf: '围巾', backpack: '背包',
  butterfly: '蝴蝶', bee: '蜜蜂', ant: '蚂蚁', snail: '蜗牛', ladybug: '瓢虫', mushroom: '蘑菇',
  peach: '桃子', watermelon: '西瓜', lemon: '柠檬', cherry: '樱桃', pineapple: '菠萝', carrot: '胡萝卜', broccoli: '西兰花', corn: '玉米', tomato: '番茄', cucumber: '黄瓜',
  airplane: '飞机', helicopter: '直升机', boat: '小船', bicycle: '自行车', 'fire-truck': '消防车', ambulance: '救护车', umbrella: '雨伞', rainbow: '彩虹', rain: '下雨', snowflake: '雪花',
  'baby-shark': '宝宝鲨', 'mama-shark': '妈妈鲨', 'papa-shark': '爸爸鲨', 'grandma-shark': '奶奶鲨', 'grandpa-shark': '爷爷鲨', octopus: '蓝色章鱼', starfish: '红色海星',
  turtle: '海龟', crab: '螃蟹', whale: '鲸鱼', dolphin: '海豚', lion: '狮子', tiger: '老虎', elephant: '大象', monkey: '猴子', bed: '床', lamp: '台灯', pillow: '枕头', blanket: '毯子',
  head: '头', hand: '手', foot: '脚', eye: '眼睛', clap: '拍手', jump: '跳跃', wave: '挥手', run: '跑步',
  cat: '小猫', dog: '小狗', fish: '小鱼', bird: '小鸟', ball: '小球', book: '书', water: '水', rice: '米饭',
  apple: '苹果', banana: '香蕉', orange: '橙子', strawberry: '草莓', rabbit: '兔子', bear: '小熊', duck: '鸭子',
  cow: '奶牛', pig: '小猪', horse: '小马', sheep: '绵羊', grape: '葡萄', pear: '梨', milk: '牛奶', bread: '面包', egg: '鸡蛋', cup: '杯子', spoon: '勺子', bowl: '碗', hat: '帽子', shoe: '鞋子', sock: '袜子', train: '火车', star: '星星', cloud: '云', tree: '树', flower: '花',
  car: '小汽车', bus: '公交车', sun: '太阳', moon: '月亮', 'red-monster': '红色小怪兽',
}
export const toyConcepts: readonly Concept[] = concepts.filter(concept => concept !== 'water' && concept !== 'rice' && !(bodyActionConcepts as readonly string[]).includes(concept))

export interface TrialItem {
  id: string
  concept: Concept
  language: Language
  target: string
  label: string
  prompt: string
  example: string
  pictureNote?: string
  actionHint?: string
  characterPrompt?: string
  audio: { label: string; prompt: string; example: string; character?: string }
  offlinePrompt: string
  theme: string
}

export interface CatalogItem {
  id: string
  target: string
  language: Language
  label: string
  theme: string
  available: boolean
  meaning_zh: string
  concept_key: string
  example: string
  listen_prompt: string
  offline_prompt_zh: string
  teaching_note_zh: string
}

export const trialItems = trialData.items as TrialItem[]
export const catalog = catalogData as CatalogItem[]
export const systemAudio = trialData.systemAudio
