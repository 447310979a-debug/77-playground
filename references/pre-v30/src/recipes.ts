import type { Language } from './engine.ts'

export const ingredients = {
  apple: { 'zh-CN': '苹果', 'en-US': 'apple' },
  banana: { 'zh-CN': '香蕉', 'en-US': 'banana' },
  strawberry: { 'zh-CN': '草莓', 'en-US': 'strawberry' },
  tomato: { 'zh-CN': '番茄', 'en-US': 'tomato' },
  corn: { 'zh-CN': '玉米', 'en-US': 'corn' },
  salt: { 'zh-CN': '盐', 'en-US': 'salt' },
  milk: { 'zh-CN': '牛奶', 'en-US': 'milk' },
} as const
export type Ingredient = keyof typeof ingredients
export const recipes = {
  salad: { title: { 'zh-CN': '水果沙拉', 'en-US': 'Fruit salad' }, ingredients: ['apple', 'banana', 'strawberry'], action: { 'zh-CN': '拌一拌', 'en-US': 'Mix it!' }, vessel: 'bowl' },
  soup: { title: { 'zh-CN': '番茄玉米汤', 'en-US': 'Tomato and corn soup' }, ingredients: ['tomato', 'corn', 'salt'], action: { 'zh-CN': '煮一煮', 'en-US': 'Cook it!' }, vessel: 'pot' },
  smoothie: { title: { 'zh-CN': '草莓香蕉奶昔', 'en-US': 'Strawberry banana smoothie' }, ingredients: ['strawberry', 'banana', 'milk'], action: { 'zh-CN': '搅一搅', 'en-US': 'Blend it!' }, vessel: 'blender' },
} as const
export type RecipeId = keyof typeof recipes
export const recipeIds = Object.keys(recipes) as RecipeId[]
export function isRecipeId(value: unknown): value is RecipeId { return typeof value === 'string' && recipeIds.includes(value as RecipeId) }
export function getRecipeRound(recipe: RecipeId, id: string, progress: number) {
  if (!isRecipeId(recipe) || !Number.isInteger(progress) || progress < 0 || progress > 2) throw new Error('食谱步骤无效。')
  const food = recipes[recipe].ingredients
  const offset = [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 3
  return { target: food[progress], choices: [...food.slice(offset), ...food.slice(0, offset)] }
}
export function ingredientPrompt(ingredient: Ingredient, language: Language) {
  if (language === 'zh-CN') return ingredient === 'salt' ? '加一点点盐。' : ingredient === 'milk' ? '倒入牛奶。' : `放入${ingredients[ingredient][language]}。`
  return ingredient === 'salt' ? 'Add a little salt.' : ingredient === 'milk' ? 'Pour in the milk.' : `Add the ${ingredient}.`
}
export function kitchenAudio(key: string, language: Language) { return `/audio/kitchen22-${language === 'zh-CN' ? 'zh' : 'en'}-${key}.mp3` }
export function kitchenLines(language: Language) {
  return [
    ...Object.keys(ingredients).map(key => ({ key, text: ingredientPrompt(key as Ingredient, language) })),
    ...recipeIds.flatMap(id => [
      { key: `${id}-intro`, text: language === 'zh-CN' ? `我们一起做${recipes[id].title[language]}吧。` : `Let's make ${recipes[id].title[language].toLowerCase()}.` },
      { key: `${id}-done`, text: language === 'zh-CN' ? `${recipes[id].title[language]}做好啦！` : `${recipes[id].title[language]} is ready!` },
    ]),
  ]
}
