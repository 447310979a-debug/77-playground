export const baseConcepts = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'rabbit', 'bear', 'duck', 'car', 'bus', 'sun', 'moon', 'red-monster'] as const
export const expansionConcepts = ['cow', 'pig', 'horse', 'sheep', 'grape', 'pear', 'milk', 'bread', 'egg', 'cup', 'spoon', 'bowl', 'hat', 'shoe', 'sock', 'train', 'star', 'cloud', 'tree', 'flower'] as const
export const bodyActionConcepts = ['head', 'hand', 'foot', 'eye', 'clap', 'jump', 'wave', 'run'] as const
export const themeConcepts = ['turtle', 'crab', 'whale', 'dolphin', 'lion', 'tiger', 'elephant', 'monkey', 'bed', 'lamp', 'pillow', 'blanket'] as const
export const sharkConcepts = ['baby-shark', 'mama-shark', 'papa-shark', 'grandma-shark', 'grandpa-shark'] as const
export const oceanConcepts = [...sharkConcepts, 'octopus', 'starfish'] as const
export const freshFoodConcepts = ['peach', 'watermelon', 'lemon', 'cherry', 'pineapple', 'carrot', 'broccoli', 'corn', 'tomato', 'cucumber'] as const
export const travelConcepts = ['airplane', 'helicopter', 'boat', 'bicycle', 'fire-truck', 'ambulance'] as const
export const weatherConcepts = ['umbrella', 'rainbow', 'rain', 'snowflake'] as const
export const dailyConcepts = [...freshFoodConcepts, ...travelConcepts, ...weatherConcepts] as const
export const clothingConcepts = ['shirt', 'pants', 'dress', 'coat', 'scarf', 'backpack'] as const
export const gardenConcepts = ['butterfly', 'bee', 'ant', 'snail', 'ladybug', 'mushroom'] as const
export const wardrobeGardenConcepts = [...clothingConcepts, ...gardenConcepts] as const
export const vehicleConcepts = ['police-car', 'excavator', 'bulldozer'] as const
export const rescueConstructionConcepts = ['fire-truck', 'ambulance', ...vehicleConcepts] as const
export const familyVehicleConcepts = ['model-y', 'tiguan', 'pink-bicycle'] as const
export const familyRoadConcepts = ['bus', ...familyVehicleConcepts] as const
export const concepts = [...baseConcepts, ...expansionConcepts, ...bodyActionConcepts, ...themeConcepts, ...oceanConcepts, ...dailyConcepts, ...wardrobeGardenConcepts, ...vehicleConcepts, ...familyVehicleConcepts] as const
export const bilingualConcepts = concepts
export type Concept = typeof concepts[number]

// A generic car/bicycle prompt also describes its more specific family vehicle.
export function isAmbiguousVehiclePair(a: string, b: string): boolean {
  return a === 'car' && ['police-car', 'model-y', 'tiguan'].includes(b)
    || b === 'car' && ['police-car', 'model-y', 'tiguan'].includes(a)
    || a === 'bicycle' && b === 'pink-bicycle'
    || b === 'bicycle' && a === 'pink-bicycle'
}
