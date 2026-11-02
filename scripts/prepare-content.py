#!/usr/bin/env python3
"""Preserve the handoff catalog, add explicit local concepts, and render missing MP3s."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/qiqi-codex-kit/content"
OUTPUT = ROOT / "public/audio"
CONCEPTS = ["cat", "dog", "fish", "bird", "ball", "book", "water", "rice", "apple", "banana", "orange", "strawberry", "rabbit", "bear", "duck", "car", "bus", "sun", "moon", "red-monster"]
ENGLISH_EXPANSION_V8 = {
    "cow": "The cow says moo.", "pig": "The pig is pink.",
    "horse": "The horse can run.", "sheep": "The sheep is fluffy.",
    "grape": "The grape is purple.", "pear": "The pear is green.",
    "milk": "I drink milk.", "bread": "I eat bread.", "egg": "This is an egg.",
    "cup": "My cup is blue.", "spoon": "I use a spoon.", "bowl": "The bowl is empty.",
    "hat": "I wear a hat.", "shoe": "This is my shoe.", "sock": "My sock is soft.",
    "train": "The train goes choo-choo.", "star": "I see a star.",
    "cloud": "The cloud is white.", "tree": "The tree is green.", "flower": "The flower is yellow.",
}
ENGLISH_EXPANSION_V11 = {
    "head": "Touch your head.", "hand": "Show me your hand.",
    "foot": "Tap your foot.", "eye": "Close your eyes.",
    "clap": "Clap your hands.", "jump": "Jump up high.",
    "wave": "Wave hello.", "run": "I can run.",
}
ENGLISH_EXPANSION_V13 = {'turtle': 'The turtle can swim.', 'crab': 'The crab walks sideways.', 'whale': 'The whale is big.', 'dolphin': 'The dolphin can jump.', 'lion': 'The lion has a mane.', 'tiger': 'The tiger has stripes.', 'elephant': 'The elephant has a long trunk.', 'monkey': 'The monkey can climb.', 'bed': 'I sleep in my bed.', 'lamp': 'Turn on the lamp.', 'pillow': 'My pillow is soft.', 'blanket': 'My blanket keeps me warm.'}
OCEAN_FRIENDS_V16 = {
    'baby-shark': ('Baby Shark', '宝宝鲨', 'Baby Shark lives in the ocean.'),
    'mama-shark': ('Mama Shark', '妈妈鲨', 'Mama Shark can swim.'),
    'papa-shark': ('Papa Shark', '爸爸鲨', 'Papa Shark has a big tail.'),
    'grandma-shark': ('Grandma Shark', '奶奶鲨', 'Grandma Shark has no teeth.'),
    'grandpa-shark': ('Grandpa Shark', '爷爷鲨', 'Grandpa Shark wears glasses.'),
    'octopus': ('octopus', '蓝色章鱼', 'The octopus is blue.'),
    'starfish': ('starfish', '红色海星', 'The starfish is red.'),
}
ENGLISH_EXPANSION_V16 = {concept: value[2] for concept, value in OCEAN_FRIENDS_V16.items()}
NEW_NAMES = {'turtle': '海龟', 'crab': '螃蟹', 'whale': '鲸鱼', 'dolphin': '海豚', 'lion': '狮子', 'tiger': '老虎', 'elephant': '大象', 'monkey': '猴子', 'bed': '床', 'lamp': '台灯', 'pillow': '枕头', 'blanket': '毯子'}
NEW_NAMES.update({concept: value[1] for concept, value in OCEAN_FRIENDS_V16.items()})

DAILY_DISCOVERIES_V19 = {'peach': ('桃子', 'The peach is pink.', '桃子是粉红色的。', '水果时间'),
 'watermelon': ('西瓜', 'I eat watermelon.', '这是一片西瓜。', '水果时间'),
 'lemon': ('柠檬', 'The lemon is yellow.', '柠檬是黄色的。', '水果时间'),
 'cherry': ('樱桃', 'The cherry is red.', '樱桃红红的。', '水果时间'),
 'pineapple': ('菠萝', 'The pineapple has green leaves.', '菠萝有绿色的叶子。', '水果时间'),
 'carrot': ('胡萝卜', 'The carrot is orange.', '胡萝卜是橙色的。', '蔬菜厨房'),
 'broccoli': ('西兰花', 'The broccoli is green.', '西兰花是绿色的。', '蔬菜厨房'),
 'corn': ('玉米', 'The corn is yellow.', '玉米是黄色的。', '蔬菜厨房'),
 'tomato': ('番茄', 'The tomato is red.', '番茄是红色的。', '蔬菜厨房'),
 'cucumber': ('黄瓜', 'The cucumber is long.', '黄瓜长长的。', '蔬菜厨房'),
 'airplane': ('飞机', 'The airplane flies in the sky.', '飞机在天空中飞。', '交通工具'),
 'helicopter': ('直升机', 'The helicopter flies up.', '直升机飞起来了。', '交通工具'),
 'boat': ('小船', 'The boat floats on the water.', '小船浮在水面上。', '交通工具'),
 'bicycle': ('自行车', 'The bicycle has two wheels.', '自行车有两个轮子。', '交通工具'),
 'fire-truck': ('消防车', 'The fire truck is red.', '消防车是红色的。', '交通工具'),
 'ambulance': ('救护车', 'The ambulance helps people.', '救护车帮助生病的人。', '交通工具'),
 'umbrella': ('雨伞', 'Open the umbrella.', '把雨伞撑开。', '天气发现'),
 'rainbow': ('彩虹', 'I see a rainbow.', '我看见一道彩虹。', '天气发现'),
 'rain': ('下雨', 'Here comes the rain.', '外面下雨了。', '天气发现'),
 'snowflake': ('雪花', 'The snowflake is white.', '雪花白白的。', '天气发现')}
NEW_NAMES.update({concept: value[0] for concept, value in DAILY_DISCOVERIES_V19.items()})

WARDROBE_GARDEN_V26 = {
    'shirt': ('上衣', 'Put on your shirt.', '穿上你的上衣。', '自己穿衣服'),
    'pants': ('裤子', 'These are my pants.', '这是我的裤子。', '自己穿衣服'),
    'dress': ('连衣裙', 'The dress is pink.', '连衣裙是粉红色的。', '自己穿衣服'),
    'coat': ('外套', 'Put on your coat.', '穿上外套再出门。', '自己穿衣服'),
    'scarf': ('围巾', 'My scarf keeps me warm.', '围上围巾，暖暖的。', '自己穿衣服'),
    'backpack': ('背包', 'My book is in my backpack.', '我的书在背包里。', '自己穿衣服'),
    'butterfly': ('蝴蝶', 'The butterfly can fly.', '蝴蝶飞起来了。', '花园小发现'),
    'bee': ('蜜蜂', 'The bee can buzz.', '蜜蜂在飞。', '花园小发现'),
    'ant': ('蚂蚁', 'The ant is small.', '蚂蚁小小的。', '花园小发现'),
    'snail': ('蜗牛', 'The snail moves slowly.', '蜗牛慢慢爬。', '花园小发现'),
    'ladybug': ('瓢虫', 'The ladybug has spots.', '瓢虫身上有小圆点。', '花园小发现'),
    'mushroom': ('蘑菇', 'The mushroom has a cap.', '蘑菇像一把小伞。', '花园小发现'),
}
NEW_NAMES.update({concept: value[0] for concept, value in WARDROBE_GARDEN_V26.items()})

VEHICLES_V27 = {
    'police-car': ('警车', 'The police car has flashing lights.', '警车的灯在闪。', '救援车与工程车'),
    'excavator': ('挖掘机', 'The excavator digs a hole.', '挖掘机在挖土。', '救援车与工程车'),
    'bulldozer': ('推土机', 'The bulldozer pushes the dirt.', '推土机把土推平。', '救援车与工程车'),
}
NEW_NAMES.update({concept: value[0] for concept, value in VEHICLES_V27.items()})

FAMILY_VEHICLES_V28 = {
    'model-y': ('爸爸的车', "This is Daddy's black car.", '爸爸的车是黑色的。', '我们家的车'),
    'tiguan': ('爷爷的车', "Grandpa's car is brown.", '爷爷的车是棕色的。', '我们家的车'),
    'pink-bicycle': ('我的自行车', 'My bicycle is pink.', '我的自行车是粉红色的。', '我们家的车'),
}
FAMILY_VEHICLE_DETAILS_V28 = {
    'model-y': ("Daddy's car", "Find Daddy's car.", '黑色 Tesla Model Y · 绿牌'),
    'tiguan': ("Grandpa's car", "Find Grandpa's car.", '棕色老款大众途观 · 蓝牌'),
    'pink-bicycle': ('My bicycle', 'Find your bicycle.', '迪卡侬 · 粉红色儿童自行车'),
}
NEW_NAMES.update({concept: value[0] for concept, value in FAMILY_VEHICLES_V28.items()})

HOME_NATURE_V30 = {'chick': ('小鸡', 'The chick is yellow.', '小鸡黄黄的。', '农场朋友'), 'donkey': ('驴', 'The donkey has long ears.', '小驴有长长的耳朵。', '农场朋友'), 'frog': ('青蛙', 'The frog can jump.', '青蛙会跳。', '池塘朋友'), 'dragonfly': ('蜻蜓', 'The dragonfly has four wings.', '蜻蜓有四只翅膀。', '花园小发现'), 'cheese': ('奶酪', 'I eat cheese.', '我吃一小块奶酪。', '早餐时间'), 'plate': ('盘子', 'The plate is round.', '盘子圆圆的。', '餐桌小帮手'), 'fork': ('叉子', 'This is my fork.', '这是我的叉子。', '餐桌小帮手'), 'toothbrush': ('牙刷', 'I brush my teeth.', '我用牙刷刷牙。', '自己洗漱'), 'toothpaste': ('牙膏', 'This is my toothpaste.', '这是我的牙膏。', '自己洗漱'), 'towel': ('毛巾', 'I dry my hands with a towel.', '我用毛巾擦干手。', '自己洗漱'), 'soap': ('肥皂', 'I wash my hands with soap.', '我用肥皂洗手。', '自己洗漱'), 'comb': ('梳子', 'I comb my hair.', '我用梳子梳头。', '自己洗漱')}
NEW_NAMES.update({concept: value[0] for concept, value in HOME_NATURE_V30.items()})

ACTION_HINTS = {"head": "轻轻摸摸头", "hand": "伸出一只小手", "foot": "轻轻点点脚", "eye": "闭上眼睛，再睁开", "clap": "跟着拍拍手", "jump": "在空地方轻轻跳一下", "wave": "挥挥手，说声你好", "run": "摆动手臂，学一学跑步"}
VOICES = {"zh-CN": "Tingting", "en-US": "Samantha"}
RATES = {"zh-CN": 150, "en-US": 140}
SOURCE_CONCEPT = {"rice": "cooked_rice", "orange": "orange_fruit"}

# These concepts are absent from the corresponding handoff language catalog.
CUSTOM_CONTENT = {
    "zh-CN": {
        "apple": ("苹", "苹果", "这是一个苹果。", "找一找，苹果在哪里？", "请找出苹果的苹字。", "在绘本或水果玩具中找苹果。", "水果时间"),
        "banana": ("蕉", "香蕉", "香蕉弯弯的。", "找一找，香蕉在哪里？", "请找出香蕉的蕉字。", "用手指比一比香蕉弯弯的形状。", "水果时间"),
        "orange": ("橙", "橙子", "橙子圆圆的。", "找一找，橙子在哪里？", "请找出橙子的橙字。", "在绘本或水果玩具中找橙子。", "水果时间"),
        "strawberry": ("莓", "草莓", "草莓上有小点点。", "找一找，草莓在哪里？", "请找出草莓的莓字。", "和家长看看草莓图片上的小点点。", "水果时间"),
        "bear": ("熊", "小熊", "小熊挥挥手。", "找一找，小熊在哪里？", "请找出小熊的熊字。", "抱一抱小熊玩偶，向它挥挥手。", "动物朋友"),
        "bus": ("巴", "公交车", "公交车开来了。", "找一找，公交车在哪里？", "请找出巴士的巴字。", "在绘本或玩具里找一辆公交车。", "出门看看"),
        "red-monster": ("怪", "红色小怪兽", "红色小怪兽，毛茸茸的。", "找一找，红色小怪兽在哪里？", "请找出小怪兽的怪字。", "和家长画一只友好的红色小怪兽，给它起个名字。", "想象朋友"),
    },
    "en-US": {
        **{'turtle': ('turtle', 'turtle', 'The turtle can swim.', 'Find the turtle.', None, '和家长在绘本里找一找海龟，听听英文名字。', '海洋朋友'), 'crab': ('crab', 'crab', 'The crab walks sideways.', 'Find the crab.', None, '和家长在绘本里找一找螃蟹，听听英文名字。', '海洋朋友'), 'whale': ('whale', 'whale', 'The whale is big.', 'Find the whale.', None, '和家长在绘本里找一找鲸鱼，听听英文名字。', '海洋朋友'), 'dolphin': ('dolphin', 'dolphin', 'The dolphin can jump.', 'Find the dolphin.', None, '和家长在绘本里找一找海豚，听听英文名字。', '海洋朋友'), 'lion': ('lion', 'lion', 'The lion has a mane.', 'Find the lion.', None, '和家长在绘本里找一找狮子，听听英文名字。', '森林动物'), 'tiger': ('tiger', 'tiger', 'The tiger has stripes.', 'Find the tiger.', None, '和家长在绘本里找一找老虎，听听英文名字。', '森林动物'), 'elephant': ('elephant', 'elephant', 'The elephant has a long trunk.', 'Find the elephant.', None, '和家长在绘本里找一找大象，听听英文名字。', '森林动物'), 'monkey': ('monkey', 'monkey', 'The monkey can climb.', 'Find the monkey.', None, '和家长在绘本里找一找猴子，听听英文名字。', '森林动物'), 'pillow': ('pillow', 'pillow', 'My pillow is soft.', 'Find the pillow.', None, '和家长在绘本里找一找枕头，听听英文名字。', '晚安时间'), 'blanket': ('blanket', 'blanket', 'My blanket keeps me warm.', 'Find the blanket.', None, '和家长在绘本里找一找毯子，听听英文名字。', '晚安时间')},
        "wave": ("wave", "wave", "Wave hello.", "Who is waving?", None, "和家人挥挥手，说声 hello。", "身体和动作"),
        "strawberry": ("strawberry", "strawberry", "The strawberry is red.", "Find the strawberry.", None, "和家长看看草莓图片上的小点点。", "水果时间"),
        "bear": ("bear", "bear", "The bear waves hello.", "Find the bear.", None, "抱一抱小熊玩偶，向它挥挥手。", "动物朋友"),
        "red-monster": ("red monster", "red monster", "The red monster is fluffy.", "Find the red monster.", None, "和家长画一只友好的红色小怪兽，给它起个名字。", "想象朋友"),
    },
}
CUSTOM_CONTENT['en-US'].update({
    concept: (label, label, example, f'Find {label}.' if concept.endswith('-shark') else f'Find the {label}.', None,
              f'和家长在海洋绘本里找一找{meaning}，听听英文名字。', '鲨鱼一家' if concept.endswith('-shark') else '海洋朋友')
    for concept, (label, meaning, example) in OCEAN_FRIENDS_V16.items()
})


# Only fill missing source concepts; the 200 supplied catalog entries remain intact.
CHINESE_EXPANSION_V17 = {
    'pig': ('猪', '小猪', '小猪是粉红色的。', '动物朋友'),
    'grape': ('葡萄', '葡萄', '葡萄是紫色的。', '水果时间'),
    'milk': ('牛奶', '牛奶', '喝一杯牛奶。', '餐桌和水果'),
    'bread': ('面包', '面包', '面包软软的。', '餐桌和水果'),
    'train': ('火车', '火车', '火车开来了。', '出门看看'),
    'clap': ('拍手', '拍手', '跟我一起拍拍手。', '身体和动作'),
    'jump': ('跳', '跳一跳', '轻轻跳一下。', '身体和动作'),
    'wave': ('挥手', '挥挥手', '挥挥手，说你好。', '身体和动作'),
    'turtle': ('海龟', '海龟', '海龟在水里游。', '海洋朋友'),
    'crab': ('螃蟹', '螃蟹', '螃蟹横着走。', '海洋朋友'),
    'whale': ('鲸鱼', '鲸鱼', '鲸鱼的身体大大的。', '海洋朋友'),
    'dolphin': ('海豚', '海豚', '海豚跳出水面。', '海洋朋友'),
    'lion': ('狮子', '狮子', '狮子的鬃毛蓬蓬的。', '森林动物'),
    'tiger': ('老虎', '老虎', '老虎身上有条纹。', '森林动物'),
    'elephant': ('大象', '大象', '大象的鼻子长长的。', '森林动物'),
    'monkey': ('猴子', '猴子', '小猴子会爬树。', '森林动物'),
    'pillow': ('枕头', '枕头', '枕头软软的。', '晚安时间'),
    'blanket': ('毯子', '毯子', '盖好毯子，暖暖的。', '晚安时间'),
    'baby-shark': ('宝宝鲨', '宝宝鲨', '宝宝鲨住在大海里。', '鲨鱼一家'),
    'mama-shark': ('妈妈鲨', '妈妈鲨', '妈妈鲨在海里游。', '鲨鱼一家'),
    'papa-shark': ('爸爸鲨', '爸爸鲨', '爸爸鲨的尾巴大大的。', '鲨鱼一家'),
    'grandma-shark': ('奶奶鲨', '奶奶鲨', '奶奶鲨没有牙齿。', '鲨鱼一家'),
    'grandpa-shark': ('爷爷鲨', '爷爷鲨', '爷爷鲨戴着眼镜。', '鲨鱼一家'),
    'octopus': ('章鱼', '蓝色章鱼', '这只章鱼是蓝色的。', '海洋朋友'),
    'starfish': ('海星', '红色海星', '这只海星是红色的。', '海洋朋友'),
}
CUSTOM_CONTENT['zh-CN'].update({
    concept: (target, label, example, f'找一找，{label}在哪里？',
              f'请找出{target}这个字。' if len(target) == 1 else f'请找出{target}这几个字。',
              f'和家长在绘本或生活中找一找{label}。', theme)
    for concept, (target, label, example, theme) in CHINESE_EXPANSION_V17.items()
})


# Reuse supplied IDs when available; only add absent concepts to the catalog.
for language, filename in [('zh-CN', 'zh-100.json'), ('en-US', 'en-100.json')]:
    source_keys = {item['concept_key'] for item in json.loads((SOURCE / filename).read_text())['items']}
    for concept, (meaning, english_example, chinese_example, theme) in {**DAILY_DISCOVERIES_V19, **WARDROBE_GARDEN_V26, **VEHICLES_V27, **FAMILY_VEHICLES_V28, **HOME_NATURE_V30}.items():
        if concept in source_keys:
            continue
        label = ('小蘑菇' if concept == 'mushroom' else meaning) if language == 'zh-CN' else FAMILY_VEHICLE_DETAILS_V28[concept][0] if concept in FAMILY_VEHICLE_DETAILS_V28 else concept.replace('-', ' ')
        target = ('雨' if concept == 'rain' else meaning) if language == 'zh-CN' else label
        CUSTOM_CONTENT[language][concept] = (
            target, label, chinese_example if language == 'zh-CN' else english_example,
            f'找一找，{label}在哪里？' if language == 'zh-CN' else FAMILY_VEHICLE_DETAILS_V28[concept][1] if concept in FAMILY_VEHICLE_DETAILS_V28 else f'Find the {label}.',
            (f'请找出{target}这个字。' if len(target) == 1 else f'请找出{target}这几个字。') if language == 'zh-CN' else None,
            f'和家长在绘本或生活中找一找{meaning}。', theme,
        )


def custom_items(language):
    result = []
    for concept, (target, label, example, prompt, character, offline, theme) in CUSTOM_CONTENT[language].items():
        result.append({
            "id": f"{language[:2]}_custom_{concept.replace('-', '_')}",
            "target": target, "audio_label": label, "example": example, "listen_prompt": prompt,
            "character_prompt": character, "offline_prompt_zh": offline, "concept_key": SOURCE_CONCEPT.get(concept, concept),
            "meaning_zh": label if language == "zh-CN" else {"strawberry": "草莓", "bear": "熊", "red-monster": "红色小怪兽", "wave": "挥手", **NEW_NAMES}[concept],
            "theme_id": "custom_expansion", "theme": theme, "content_source": "local-expansion-v30" if concept in HOME_NATURE_V30 else "local-expansion-v28" if concept in FAMILY_VEHICLES_V28 else "local-expansion-v27" if concept in VEHICLES_V27 else "local-expansion-v26" if concept in WARDROBE_GARDEN_V26 else "local-expansion-v19" if concept in DAILY_DISCOVERIES_V19 else "local-expansion-v17" if language == "zh-CN" and concept in CHINESE_EXPANSION_V17 else "local-expansion-v16" if concept in ENGLISH_EXPANSION_V16 else "local-expansion-v13" if concept in ENGLISH_EXPANSION_V13 else "local-expansion-v11" if concept == "wave" else "local-expansion-v3",
            "teaching_note_zh": "新增试玩内容；先听词认图。中文选字由家长开启，不将认图等同于识字。" + ("这是想象中的友好角色，不代表真实动物。" if concept == "red-monster" else ""),
        })
    return result


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare_content():
    original_audio = {clip["id"]: clip for clip in read_json(SOURCE / "audio-plan.json")["clips"]}
    trial, catalog, clips = [], [], []
    for language, filename in [("zh-CN", "zh-100.json"), ("en-US", "en-100.json")]:
        source = read_json(SOURCE / filename)
        themes = {theme["id"]: theme["name_zh"] for theme in source["themes"]}
        added = custom_items(language)
        all_items = source["items"] + added
        by_concept = {item["concept_key"]: item for item in all_items}
        assert len(by_concept) == len(all_items), "Custom items must not replace original concepts"
        selected_ids = set()
        selected_concepts = CONCEPTS + list(ENGLISH_EXPANSION_V8) + list(ENGLISH_EXPANSION_V11) + list(ENGLISH_EXPANSION_V13) + list(ENGLISH_EXPANSION_V16) + list(DAILY_DISCOVERIES_V19) + list(WARDROBE_GARDEN_V26) + list(VEHICLES_V27) + list(FAMILY_VEHICLES_V28) + list(HOME_NATURE_V30)
        for concept in selected_concepts:
            original_item = by_concept[SOURCE_CONCEPT.get(concept, concept)]
            item = {**original_item}
            expansion = language == "en-US" and concept in {**ENGLISH_EXPANSION_V8, **ENGLISH_EXPANSION_V11, **ENGLISH_EXPANSION_V13, **ENGLISH_EXPANSION_V16}
            edition = "V16" if concept in ENGLISH_EXPANSION_V16 else "V13" if concept in ENGLISH_EXPANSION_V13 else "V11" if concept in ENGLISH_EXPANSION_V11 else "V8"
            if expansion:
                item["example"] = {**ENGLISH_EXPANSION_V8, **ENGLISH_EXPANSION_V11, **ENGLISH_EXPANSION_V13, **ENGLISH_EXPANSION_V16}[concept]
            discovery = HOME_NATURE_V30 if concept in HOME_NATURE_V30 else FAMILY_VEHICLES_V28 if concept in FAMILY_VEHICLES_V28 else VEHICLES_V27 if concept in VEHICLES_V27 else WARDROBE_GARDEN_V26 if concept in WARDROBE_GARDEN_V26 else DAILY_DISCOVERIES_V19
            discovery_edition = 'V30' if concept in HOME_NATURE_V30 else 'V28' if concept in FAMILY_VEHICLES_V28 else 'V27' if concept in VEHICLES_V27 else 'V26' if concept in WARDROBE_GARDEN_V26 else 'V19'
            discovery_source = 'HOME_NATURE_V30' if concept in HOME_NATURE_V30 else 'FAMILY_VEHICLES_V28' if concept in FAMILY_VEHICLES_V28 else 'VEHICLES_V27' if concept in VEHICLES_V27 else 'WARDROBE_GARDEN_V26' if concept in WARDROBE_GARDEN_V26 else 'DAILY_DISCOVERIES_V19'
            if concept in discovery:
                item['example'] = discovery[concept][1 if language == 'en-US' else 2]
            selected_ids.add(item["id"])
            roles = {"label": "label", "prompt": "listen_prompt", "example": "example"}
            if language == "zh-CN":
                roles["character"] = "character_prompt"
            audio = {}
            for role, source_role in roles.items():
                original = original_audio.get(f"{item['id']}.{source_role}")
                override = (expansion or concept in discovery) and role == "example"
                text = item["example"] if override else original["text"] if original else item["audio_label" if source_role == "label" else source_role]
                path = f"/audio/{item['id']}-{role}.mp3"
                audio[role] = path
                clips.append({
                    "id": f"{item['id']}-{role}", "item_id": item["id"],
                    "role": role, "language": language, "text": text,
                    "path": path, "source": f"scripts/prepare-content.py#{discovery_source}/{concept}/{language}/example" if override and concept in discovery else f"scripts/prepare-content.py#ENGLISH_EXPANSION_{edition}/{concept}/example" if override else f"content/audio-plan.json#{original['id']}" if original else f"scripts/prepare-content.py#CUSTOM_CONTENT/{language}/{concept}/{role}",
                })
            current = {
                "id": item["id"], "concept": concept, "language": language,
                "target": item["target"], "label": item["audio_label"],
                "prompt": item["listen_prompt"], "example": item["example"],
                "audio": audio, "offlinePrompt": item["offline_prompt_zh"],
                "theme": item.get("theme") or themes[item["theme_id"]],
            }
            if language == "zh-CN" and concept not in CONCEPTS:
                current["contentSource"] = "chinese-expansion-v17"
            if expansion:
                current["contentSource"] = f"english-expansion-{edition.lower()}"
                current["exampleSource"] = f"scripts/prepare-content.py#ENGLISH_EXPANSION_{edition}/{concept}"
                current["originalExample"] = original_item["example"]
            if concept in discovery:
                current['contentSource'] = f'bilingual-expansion-{discovery_edition.lower()}'
                current['exampleSource'] = f'scripts/prepare-content.py#{discovery_source}/{concept}/{language}'
                current['originalExample'] = original_item['example']
                current['theme'] = discovery[concept][3]
            if concept in HOME_NATURE_V30:
                current['pictureNote'] = {'chick': '黄色的小鸡', 'donkey': '长耳朵的小驴', 'frog': '绿色青蛙', 'dragonfly': '四只翅膀的蜻蜓', 'cheese': '一小块黄色奶酪', 'plate': '蓝边圆盘', 'fork': '红柄叉子', 'toothbrush': '绿色牙刷', 'toothpaste': '蓝色牙膏管', 'towel': '粉红色毛巾', 'soap': '肥皂和泡泡', 'comb': '橙色梳子'}[concept]
            if concept in FAMILY_VEHICLE_DETAILS_V28:
                current['pictureNote'] = FAMILY_VEHICLE_DETAILS_V28[concept][2]
            if concept in ACTION_HINTS:
                current["actionHint"] = ACTION_HINTS[concept]
                current["theme"] = "身体和动作"
            if language == "zh-CN":
                original = original_audio.get(f"{item['id']}.character_prompt")
                current["characterPrompt"] = original["text"] if original else item["character_prompt"]
            trial.append(current)
        for item in all_items:
            catalog.append({
                **item, "language": language, "theme": item.get("theme") or themes[item["theme_id"]],
                "label": item["audio_label"], "available": item["id"] in selected_ids,
            })
        for item in source["items"]:
            copied = next(entry for entry in catalog if entry["id"] == item["id"])
            assert all(copied[key] == value for key, value in item.items()), f"Original catalog changed: {item['id']}"
    additions = {
        "zh-CN": {
            "choose": "听一听，再点一张图片。",
            "good": "找到啦。",
            "game": "选一个喜欢的娃娃，把它带回家吧。",
            "done": "今天玩好了，我们去看看身边的世界吧。",
        },
        "en-US": {
            "choose": "Listen, then tap a picture.",
            "good": "You found it.",
            "coin": "You have a play coin.",
            "rest": "Let's take a break.",
            "match": "Find the same one.",
            "game": "Choose a little friend to take home.",
            "done": "All done. Let's play away from the screen.",
        },
    }
    system_audio = {}
    for language, prefix in [("zh-CN", "zh"), ("en-US", "en")]:
        system_audio[language] = {}
        for role in ["start", "again", "help", "finished", "coin", "rest", "match", "choose", "good", "game", "done"]:
            original_id = f"system.{prefix}_{role}"
            original = original_audio.get(original_id)
            text = original["text"] if original else additions[language][role]
            clip_id = f"system-{prefix}-{role}"
            path = f"/audio/{clip_id}.mp3"
            system_audio[language][role] = path
            clips.append({
                "id": clip_id, "item_id": None, "role": role, "language": language,
                "text": text, "path": path,
                "source": f"content/audio-plan.json#{original_id}" if original else "trial fixed interface prompt",
            })
    assert len(CONCEPTS) == len(set(CONCEPTS)) == 20
    assert len(trial) == 234 and len(catalog) == 342
    assert len({item["id"] for item in catalog}) == 342
    assert len({clip["path"] for clip in clips}) == len(clips) == 841
    for language in VOICES:
        assert {item["concept"] for item in trial if item["language"] == language} == set(CONCEPTS + list(ENGLISH_EXPANSION_V8) + list(ENGLISH_EXPANSION_V11) + list(ENGLISH_EXPANSION_V13) + list(ENGLISH_EXPANSION_V16) + list(DAILY_DISCOVERIES_V19) + list(WARDROBE_GARDEN_V26) + list(VEHICLES_V27) + list(FAMILY_VEHICLES_V28) + list(HOME_NATURE_V30))
    for item in trial:
        for role, source_role in [("label", "label"), ("prompt", "listen_prompt"), ("example", "example")]:
            original = original_audio.get(f"{item['id']}.{source_role}")
            assert item[role] and (not original or item[role] == original["text"] or (role == "example" and item["concept"] in {**DAILY_DISCOVERIES_V19, **WARDROBE_GARDEN_V26, **VEHICLES_V27, **FAMILY_VEHICLES_V28, **HOME_NATURE_V30} and item[role] == {**DAILY_DISCOVERIES_V19, **WARDROBE_GARDEN_V26, **VEHICLES_V27, **FAMILY_VEHICLES_V28, **HOME_NATURE_V30}[item["concept"]][1 if item["language"] == "en-US" else 2]) or (role == "example" and item.get("contentSource") in {"english-expansion-v8", "english-expansion-v11", "english-expansion-v13", "english-expansion-v16"} and item[role] == {**ENGLISH_EXPANSION_V8, **ENGLISH_EXPANSION_V11, **ENGLISH_EXPANSION_V13, **ENGLISH_EXPANSION_V16}[item["concept"]]))
        if item["language"] == "zh-CN":
            assert 1 <= len(item["target"]) <= 6 and item["characterPrompt"]
    write_json(ROOT / "src/catalog.json", catalog)
    write_json(ROOT / "src/trial-content.json", {"items": trial, "systemAudio": system_audio})
    write_json(ROOT / "output/current-audio-plan.json", {"clips": clips})
    return clips


def render(clips):
    for executable in ["say", "ffmpeg", "ffprobe"]:
        if not shutil.which(executable):
            raise RuntimeError(f"Required local tool is missing: {executable}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    previous = {c["id"]: c for c in read_json(manifest_path)["clips"]} if manifest_path.exists() else {}
    manifest_clips = []
    with tempfile.TemporaryDirectory(prefix="qiqi-local-voice-") as temporary:
        for clip in clips:
            destination = OUTPUT / Path(clip["path"]).name
            voice, rate = VOICES[clip["language"]], RATES[clip["language"]]
            old = previous.get(clip["id"])
            preserve_neural = old and old.get("generator", "").startswith("Kokoro-")
            if preserve_neural:
                assert destination.exists(), "Restore the missing neural clip or use its language-specific audio generator"
                assert old["text"] == clip["text"], "Speech text changed; regenerate neural audio explicitly"
                assert hashlib.sha256(destination.read_bytes()).hexdigest() == old["sha256"], "Neural audio checksum changed"
            elif destination.exists() and old:
                assert (old["text"], old["voice"], old["words_per_minute"]) == (clip["text"], voice, rate), (
                    f"Audio settings changed for {destination.name}; remove that generated file explicitly before regenerating."
                )
                assert hashlib.sha256(destination.read_bytes()).hexdigest() == old["sha256"], "Existing audio checksum changed"
            audio_to_check = destination
            if not destination.exists():
                aiff = Path(temporary) / f"{clip['id']}.aiff"
                temporary_mp3 = Path(temporary) / destination.name
                subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), clip["text"]], check=True)
                subprocess.run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(aiff),
                    "-af", "loudnorm=I=-19:TP=-2:LRA=7", "-ar", "44100", "-ac", "1",
                    "-codec:a", "libmp3lame", "-b:a", "96k", str(temporary_mp3),
                ], check=True)
                audio_to_check = temporary_mp3
            metadata = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
                "-of", "json", str(audio_to_check),
            ], text=True))
            duration_ms = round(float(metadata["format"]["duration"]) * 1000)
            assert 150 <= duration_ms <= 20000, f"Unexpected duration: {destination.name} {duration_ms} ms"
            assert metadata["streams"][0]["codec_name"] == "mp3"
            if audio_to_check != destination:
                shutil.copyfile(audio_to_check, destination)
            manifest_clips.append(old if old and audio_to_check == destination else {
                **clip, "voice": voice, "words_per_minute": rate,
                "generator": "macOS say -> AIFF -> ffmpeg libmp3lame",
                "media_type": "audio/mpeg", "size_bytes": destination.stat().st_size,
                "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                "duration_ms": duration_ms, "status": "generated",
                "human_review_status": "pending", "device_playback_status": "pending",
            })
            print(f"{destination.name}: {duration_ms} ms", flush=True)
    write_json(manifest_path, {
        "schema_version": 1, "content_source": "references/qiqi-codex-kit/content",
        "generation": "Local generated speech; each clip records its voice and generator. No online TTS API used.",
        "review_note": "ffprobe validated; listening, pronunciation and actual iPad playback are not yet fully reviewed.",
        "clips": manifest_clips,
    })
    print(f"Validated {len(manifest_clips)} MP3 files, {sum(c['size_bytes'] for c in manifest_clips)} bytes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--content-only", action="store_true", help="Generate JSON without rendering audio.")
    args = parser.parse_args()
    selected = prepare_content()
    if not args.content_only:
        render(selected)
