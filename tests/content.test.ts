import { raceLines, raceAudio } from '../src/pandaRace.ts'
import test from 'node:test'
import { kitchenLines, kitchenAudio } from '../src/recipes.ts'
import { dailyConcepts, wardrobeGardenConcepts, vehicleConcepts, familyVehicleConcepts, homeNatureConcepts } from '../src/concepts.ts'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

async function json(path: string) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
}

test('117 English and 117 Chinese concepts have complete teaching and local audio', async () => {
  const content = await json('../src/trial-content.json')
  const manifest = await json('../public/audio/manifest.json')
  const expected = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'rabbit', 'bear', 'duck', 'car', 'bus', 'sun', 'moon', 'red-monster']
  assert.equal(content.items.length, 234)
  assert.equal(new Set(content.items.map((item: any) => item.id)).size, 234)
  const clips = new Map(manifest.clips.map((clip: any) => [clip.path, clip]))
  const referenced = new Set<string>()
  for (const language of ['zh-CN', 'en-US']) {
    const items = content.items.filter((item: any) => item.language === language)
    assert.deepEqual(items.map((item: any) => item.concept), [...expected, 'cow', 'pig', 'horse', 'sheep', 'grape', 'pear', 'milk', 'bread', 'egg', 'cup', 'spoon', 'bowl', 'hat', 'shoe', 'sock', 'train', 'star', 'cloud', 'tree', 'flower', 'head', 'hand', 'foot', 'eye', 'clap', 'jump', 'wave', 'run', 'turtle','crab','whale','dolphin','lion','tiger','elephant','monkey','bed','lamp','pillow','blanket','baby-shark','mama-shark','papa-shark','grandma-shark','grandpa-shark','octopus','starfish',...dailyConcepts,...wardrobeGardenConcepts,...vehicleConcepts,...familyVehicleConcepts,...homeNatureConcepts])
    for (const item of items) {
      for (const [role, text] of Object.entries({ label: item.label, prompt: item.prompt, example: item.example, ...(language === 'zh-CN' ? { character: item.characterPrompt } : {}) })) {
        assert.ok(typeof text === 'string' && text.length > 0)
        const clip: any = clips.get(item.audio[role])
        assert.ok(clip, `Missing ${item.id}/${role} audio`)
        assert.equal(clip.item_id, item.id)
        assert.equal(clip.language, language)
        assert.equal(clip.text, text)
        referenced.add(item.audio[role])
      }
      if (language === 'zh-CN') assert.ok(item.target.length >= 1 && item.target.length <= 6)
    }
    for (const path of Object.values(content.systemAudio[language]) as string[]) {
      assert.ok(clips.has(path))
      referenced.add(path)
    }
  }
  for (const language of ['zh-CN', 'en-US'] as const) for (const line of kitchenLines(language)) {
    const path = kitchenAudio(line.key, language), clip: any = clips.get(path)
    assert.ok(clip); assert.equal(clip.text, line.text); assert.equal(clip.language, language)
    referenced.add(path)
  }
  for (const language of ['zh-CN', 'en-US'] as const) for (const [key, text] of Object.entries(raceLines[language])) {
    const path = raceAudio(key as keyof typeof raceLines['en-US'], language), clip: any = clips.get(path)
    assert.ok(clip); assert.equal(clip.text, text); assert.equal(clip.language, language); referenced.add(path)
  }
  assert.equal(referenced.size, 895)
  assert.equal(clips.size, 895)
  assert.deepEqual(new Set(clips.keys()), referenced)
  const english = manifest.clips.filter((clip: any) => clip.language === 'en-US')
  assert.equal(english.length, 389)
  assert.equal(manifest.clips.filter((clip: any) => clip.language === 'zh-CN').length, 506)
  assert.ok(english.every((clip: any) => clip.voice === 'af_heart' && clip.generator.startsWith('Kokoro-')))
  assert.ok(manifest.clips.filter((clip: any) => clip.language === 'zh-CN').every((clip: any) => clip.voice === 'Uncle_Fu' && clip.voice_style === 'D-playful' && clip.generator.startsWith('Qwen3-TTS') && clip.normalization?.version === (content.items.some((i: any) => i.id === clip.item_id && i.contentSource === 'bilingual-expansion-v30') ? 'v30-vocabulary-fixed-gain' : content.items.some((i: any) => i.id === clip.item_id && i.contentSource === 'bilingual-expansion-v28') ? 'v28-family-vehicles-fixed-gain' : content.items.some((i: any) => i.id === clip.item_id && i.contentSource === 'bilingual-expansion-v27') ? 'v27-vehicles-fixed-gain' : content.items.some((i: any) => i.id === clip.item_id && i.contentSource === 'bilingual-expansion-v26') ? 'v26-vocabulary-fixed-gain' : clip.id.startsWith('race-v29-') ? 'v29-countdown-fixed-gain' : clip.id.startsWith('race-v25-') ? 'v25-race-fixed-gain' : clip.id.startsWith('kitchen22-') ? 'v22-kitchen-fixed-gain' : 'v20-qwen-D-fixed-gain')))
  const monster = content.items.find((item: any) => item.concept === 'red-monster' && item.language === 'en-US')
  assert.equal(monster.label, 'red monster')
  assert.equal(monster.example, 'The red monster is fluffy.')
})

test('all 200 handoff entries preserve their fields and custom additions identify their origin', async () => {
  const catalog = await json('../src/catalog.json')
  assert.equal(catalog.length, 342)
  assert.equal(new Set(catalog.map((item: any) => item.id)).size, 342)
  for (const filename of ['zh-100.json', 'en-100.json']) {
    const original = await json(`../references/qiqi-codex-kit/content/${filename}`)
    assert.equal(original.items.length, 100)
    for (const item of original.items) {
      const actual = catalog.find((entry: any) => entry.id === item.id)
      assert.ok(actual, `Lost original catalog item: ${item.id}`)
      for (const [key, value] of Object.entries(item)) assert.deepEqual(actual[key], value, `${item.id}.${key}`)
    }
  }
  const custom = catalog.filter((item: any) => item.id.includes('_custom_'))
  assert.equal(custom.length, 142)
  assert.ok(custom.every((item: any) => ['local-expansion-v30', 'local-expansion-v28', 'local-expansion-v27', 'local-expansion-v26', 'local-expansion-v3', 'local-expansion-v11', 'local-expansion-v13', 'local-expansion-v16', 'local-expansion-v17', 'local-expansion-v19'].includes(item.content_source) && item.available))
  assert.equal(catalog.filter((item: any) => item.available).length, 234)
})


test('new English examples carry explicit v8 provenance while the source catalog remains unchanged', async () => {
  const content = await json('../src/trial-content.json');
  const catalog = await json('../src/catalog.json');
  const added = content.items.filter((item: any) => item.contentSource === 'english-expansion-v8');
  assert.equal(added.length, 20);
  for (const item of added) {
    assert.equal(item.language, 'en-US');
    assert.equal(item.originalExample, catalog.find((entry: any) => entry.id === item.id).example);
    assert.equal(item.exampleSource, `scripts/prepare-content.py#ENGLISH_EXPANSION_V8/${item.concept}`);
    assert.equal(item.audio.character, undefined);
  }
});

test('Mandarin expansion preserves old learning content and all English audio while supplying every shared concept', async () => {
  const previous = await json('../references/content-pre-v17.json'), current = await json('../src/trial-content.json');
  for (const old of previous.items) assert.deepEqual(current.items.find((item: any) => item.id === old.id), old);
  assert.deepEqual(current.systemAudio, previous.systemAudio);
  const zh = current.items.filter((item: any) => item.language === 'zh-CN');
  assert.equal(zh.filter((item: any) => item.contentSource === 'chinese-expansion-v17').length, 47);
  assert.equal(new Set(zh.map((item: any) => item.target)).size, 117);
  assert.deepEqual(zh.map((item: any) => item.concept), current.items.filter((item: any) => item.language === 'en-US').map((item: any) => item.concept));
  const before = await json('../references/audio-pre-v17/manifest.json'), after = await json('../public/audio/manifest.json');
  for (const clip of before.clips.filter((clip: any) => clip.language === 'en-US')) {
    assert.deepEqual(after.clips.find((c: any) => c.id === clip.id), clip);
    assert.equal(createHash('sha256').update(await readFile(new URL(`../public${clip.path}`, import.meta.url))).digest('hex'), clip.sha256);
  }
});

test('body and action examples match their pictures and preserve source wording in the catalog', async () => {
  const content = await json('../src/trial-content.json');
  const added = content.items.filter((item: any) => item.contentSource === 'english-expansion-v11');
  assert.equal(added.length, 8);
  for (const item of added) { assert.ok(item.actionHint); assert.ok(item.audio.example); assert.equal(item.language, 'en-US'); }
  assert.equal(added.find((item: any) => item.concept === 'jump').example, 'Jump up high.');
  assert.equal(added.find((item: any) => item.concept === 'run').example, 'I can run.');
});

test('seven ocean additions describe the requested family and colors without changing old content or voices', async () => {
  const content = await json('../src/trial-content.json');
  const previousContent = await json('../references/content-pre-v16.json');
  for (const item of previousContent.items) assert.deepEqual(content.items.find((i: any) => i.id === item.id), item);
  assert.deepEqual(content.systemAudio, previousContent.systemAudio);
  const added = content.items.filter((i: any) => i.contentSource === 'english-expansion-v16');
  assert.equal(added.length, 7);
  const expected = {
    'baby-shark': ['Baby Shark', 'Baby Shark lives in the ocean.'],
    'mama-shark': ['Mama Shark', 'Mama Shark can swim.'],
    'papa-shark': ['Papa Shark', 'Papa Shark has a big tail.'],
    'grandma-shark': ['Grandma Shark', 'Grandma Shark has no teeth.'],
    'grandpa-shark': ['Grandpa Shark', 'Grandpa Shark wears glasses.'],
    octopus: ['octopus', 'The octopus is blue.'], starfish: ['starfish', 'The starfish is red.'],
  };
  for (const [concept, [label, example]] of Object.entries(expected)) {
    const item = added.find((i: any) => i.concept === concept);
    assert.equal(item.label, label); assert.equal(item.example, example); assert.equal(item.language, 'en-US');
  }
  const before = await json('../references/audio-pre-v16/manifest.json'), after = await json('../public/audio/manifest.json');
  assert.equal(before.clips.length, 282);
  for (const clip of before.clips.filter((clip: any) => clip.language === 'en-US')) {
    assert.deepEqual(after.clips.find((c: any) => c.id === clip.id), clip);
    const bytes = await readFile(new URL(`../public${clip.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  }
});
