#!/usr/bin/env python3
"""Render English MP3s locally with pinned Kokoro assets; leave Chinese untouched."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / ".tools/kokoro/models"
MANIFEST = ROOT / "public/audio/manifest.json"
BACKUP = ROOT / "references/audio-v1"
SAMPLES = ROOT / "references/audio-v2-samples"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
ASSETS = {
    "kokoro-v1.0.onnx": (325505369, "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a"),
    "voices-v1.0.bin": (28214398, "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}
VOICE = "af_heart"
SPEED = 0.96
SAMPLE_IDS = ["en_021-label", "en_022-label", "en_021-prompt", "en_022-example", "system-en-game"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_models():
    MODELS.mkdir(parents=True, exist_ok=True)
    for filename, (size, expected) in ASSETS.items():
        destination = MODELS / filename
        if not destination.exists():
            temporary = destination.with_suffix(destination.suffix + ".partial")
            with urllib.request.urlopen(RELEASE + filename, timeout=120) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
            assert temporary.stat().st_size == size and digest(temporary) == expected, f"Invalid model download: {filename}"
            temporary.replace(destination)
        assert destination.stat().st_size == size and digest(destination) == expected, f"Model checksum mismatch: {filename}"


def metadata(path):
    details = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
        "-of", "json", str(path),
    ], text=True))
    stream = details["streams"][0]
    duration = round(float(details["format"]["duration"]) * 1000)
    assert stream["codec_name"] == "mp3" and stream["channels"] == 1 and stream["sample_rate"] == "44100"
    assert 300 <= duration <= 20000, f"Unexpected audio duration: {path.name}: {duration}"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], check=True, capture_output=True)
    return {"size_bytes": path.stat().st_size, "sha256": digest(path), "duration_ms": duration}


def render(kokoro, clip, destination):
    import numpy as np
    import soundfile as sf
    text = clip["text"]
    synthesis_text = text if text[-1] in ".!?" else text + "."
    phonemes = kokoro.tokenizer.phonemize(synthesis_text, lang="en-us")
    samples, rate = kokoro.create(synthesis_text, voice=VOICE, speed=SPEED, lang="en-us")
    assert rate == 24000 and len(samples) > 4800 and np.isfinite(samples).all()
    assert float(np.max(np.abs(samples))) > 0.01 and float(np.std(samples)) > 0.001, f"Silent synthesis: {clip['id']}"
    samples = np.concatenate([np.zeros(round(rate * .08)), samples, np.zeros(round(rate * .15))])
    wav = destination.with_suffix(".wav")
    sf.write(wav, samples, rate, subtype="PCM_16")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
        "-af", "loudnorm=I=-19:TP=-2:LRA=7", "-ar", "44100", "-ac", "1",
        "-codec:a", "libmp3lame", "-b:a", "96k", str(destination),
    ], check=True)
    wav.unlink()
    updated = {**clip, **metadata(destination)}
    updated.pop("words_per_minute", None)
    updated.update({
        "voice": VOICE, "speed": SPEED, "synthesis_text": synthesis_text, "phonemes": phonemes,
        "generator": "Kokoro-82M v1.0 FP32 / kokoro-onnx 0.6.1 CPU -> PCM WAV -> ffmpeg libmp3lame",
        "model_license": "Apache-2.0", "runtime_license": "MIT",
        "model_source": RELEASE + "kokoro-v1.0.onnx", "model_sha256": ASSETS["kokoro-v1.0.onnx"][1],
        "voice_source": RELEASE + "voices-v1.0.bin", "voice_file_sha256": ASSETS["voices-v1.0.bin"][1],
        "media_type": "audio/mpeg", "status": "generated", "human_review_status": "pending",
        "device_playback_status": "pending",
    })
    print(f"{clip['id']}: {updated['duration_ms']} ms", flush=True)
    return updated


def sample_reel(paths, output):
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for path in paths:
        command.extend(["-i", str(path)])
    filters = [f"[{i}:a]apad=pad_dur=0.45[a{i}]" for i in range(len(paths))]
    filters.append("".join(f"[a{i}]" for i in range(len(paths))) + f"concat=n={len(paths)}:v=0:a=1[out]")
    subprocess.run(command + ["-filter_complex", ";".join(filters), "-map", "[out]", "-codec:a", "libmp3lame", "-b:a", "96k", str(output)], check=True)


def main(apply, add_missing=False):
    # The runtime's API opt-out happens too late to suppress initialization telemetry.
    os.environ["ORT_DISABLE_TELEMETRY"] = "1"
    import onnxruntime as ort
    from kokoro_onnx import Kokoro
    ort.disable_telemetry_events()
    assert importlib.metadata.version("kokoro-onnx") == "0.6.1", "Use scripts/requirements-kokoro.lock"
    original_bytes = MANIFEST.read_bytes()
    original = json.loads(original_bytes)
    trial = json.loads((ROOT / "src/trial-content.json").read_text())
    expected_paths = {path for item in trial["items"] for path in item["audio"].values()}
    expected_paths.update(path for roles in trial["systemAudio"].values() for path in roles.values())
    additions = []
    if add_missing:
        assert apply, "--add-missing requires --apply"
        plan = json.loads((ROOT / "output/current-audio-plan.json").read_text())["clips"]
        assert len(plan) == len(expected_paths) == 631
        assert len({clip["id"] for clip in plan}) == len(plan)
        assert {clip["path"] for clip in plan} == expected_paths
        previous = {clip["id"]: clip for clip in original["clips"]}
        for clip in plan:
            assert re.fullmatch(r"/audio/[a-zA-Z0-9_-]+\.mp3", clip["path"])
            old = previous.get(clip["id"])
            if old:
                assert all(old[key] == clip[key] for key in ["path", "text", "language", "role", "item_id"])
            else:
                assert clip["language"] == "en-US" and clip["role"] in {"label", "prompt", "example"}
                assert not (ROOT / "public" / clip["path"].lstrip("/")).exists(), "Untracked audio file exists"
                additions.append(clip)
        assert len(additions) in {0, 60} and len(original["clips"]) + len(additions) == 631
    else:
        assert {clip["path"] for clip in original["clips"]} == expected_paths
    english = [clip for clip in original["clips"] if clip["language"] == "en-US"]
    assert len({clip["id"] for clip in english}) == len(english)
    chinese_hashes = {}
    for clip in original["clips"]:
        assert re.fullmatch(r"/audio/[a-zA-Z0-9_-]+\.mp3", clip["path"])
        file = ROOT / "public" / clip["path"].lstrip("/")
        assert digest(file) == clip["sha256"], f"Current audio disagrees with manifest: {file.name}"
        if add_missing or clip["language"] != "en-US":
            chinese_hashes[file] = digest(file)
    trial_texts = {path: item[role] for item in trial["items"] for role, path in item["audio"].items() if role != "character"}
    for clip in [*original["clips"], *additions]:
        if clip["path"] in trial_texts:
            assert clip["text"] == trial_texts[clip["path"]], f"Trial text mismatch: {clip['id']}"
    if add_missing and not additions:
        print("All 631 clips already exist and hashes match; no files changed.")
        return
    ensure_models()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(MODELS / "kokoro-v1.0.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    kokoro = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))
    SAMPLES.mkdir(parents=True, exist_ok=True)
    selected = additions if add_missing else [clip for clip in english if not (
        clip.get("generator", "").startswith("Kokoro-") and clip.get("voice") == VOICE
        and clip.get("speed") == SPEED and clip.get("model_sha256") == ASSETS["kokoro-v1.0.onnx"][1]
    )] if apply else [clip for clip in english if clip["id"] in SAMPLE_IDS]
    replacements = {}
    with tempfile.TemporaryDirectory(prefix="qiqi-kokoro-") as folder:
        stage = Path(folder)
        for clip in selected:
            replacements[clip["id"]] = render(kokoro, clip, stage / Path(clip["path"]).name)
        for clip_id in ([] if add_missing else SAMPLE_IDS):
            clip = next(clip for clip in english if clip["id"] == clip_id)
            name = Path(clip["path"]).name
            current = stage / name if (stage / name).exists() else ROOT / "public/audio" / name
            shutil.copyfile(current, SAMPLES / ("kokoro-" + name))
            old = BACKUP / name if (BACKUP / name).exists() else ROOT / "public/audio" / name
            shutil.copyfile(old, SAMPLES / ("samantha-" + name))
        for version in ([] if add_missing else ["kokoro", "samantha"]):
            sample_reel([SAMPLES / f"{version}-{clip_id}.mp3" for clip_id in SAMPLE_IDS], SAMPLES / f"{version}-comparison.mp3")
        if not add_missing:
            (SAMPLES / "sample-text.json").write_text(json.dumps([
                {"id": clip_id, "text": next(clip["text"] for clip in english if clip["id"] == clip_id)} for clip_id in SAMPLE_IDS
            ], ensure_ascii=False, indent=2) + "\n")
        if apply:
            assert MANIFEST.read_bytes() == original_bytes, "Audio manifest changed during synthesis; retry after coordinating edits"
            BACKUP.mkdir(parents=True, exist_ok=True)
            backup_manifest = BACKUP / "manifest.json"
            if not backup_manifest.exists():
                for clip in english:
                    name = Path(clip["path"]).name
                    shutil.copy2(ROOT / "public/audio" / name, BACKUP / name)
                backup_manifest.write_bytes(original_bytes)
            else:
                for clip in json.loads(backup_manifest.read_bytes())["clips"]:
                    if clip["language"] == "en-US":
                        assert digest(BACKUP / Path(clip["path"]).name) == clip["sha256"], "Original backup was changed"
            before = {}
            for clip in selected:
                path = ROOT / "public/audio" / Path(clip["path"]).name
                before[path] = path.read_bytes() if path.exists() else None
            updated = {**original, "generation": "Chinese: preserved as recorded per clip. English: local Kokoro-82M v1.0 af_heart. No online TTS API used.", "clips": [replacements.get(clip["id"], clip) for clip in [*original["clips"], *additions]]}
            try:
                for destination in before:
                    temporary = destination.with_suffix(".mp3.next")
                    shutil.copyfile(stage / destination.name, temporary)
                    temporary.replace(destination)
                pending = MANIFEST.with_suffix(".json.next")
                pending.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                pending.replace(MANIFEST)
                assert all(digest(path) == expected for path, expected in chinese_hashes.items()), "Protected existing audio changed"
            except BaseException:
                for destination, content in before.items():
                    if content is None:
                        destination.unlink(missing_ok=True)
                    else:
                        destination.write_bytes(content)
                MANIFEST.write_bytes(original_bytes)
                raise
    kokoro.voices.close()
    print(f"Added {len(additions)} English files; preserved all {len(original['clips'])} existing hashes. Normalize the new batch before use." if add_missing else f"Replaced {len(selected)} English files; preserved {len(english) - len(selected)} current neural clips; Chinese hashes unchanged." if apply else "Rendered comparison samples only; app audio unchanged.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Upgrade English clips that are not already using the checked neural voice; default creates samples only.")
    parser.add_argument("--add-missing", action="store_true", help="Add the 60 daily discovery clips from the verified content plan; preserve every existing file.")
    arguments = parser.parse_args()
    main(arguments.apply, arguments.add_missing)
