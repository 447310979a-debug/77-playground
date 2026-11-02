#!/usr/bin/env python3
"""Measure local speech, then apply checked fixed gain with peak protection."""
import argparse
import array
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import statistics
import subprocess

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "public/audio"
MANIFEST = AUDIO / "manifest.json"
BACKUP = ROOT / "references/audio-pre-v7-normalization"
OUTPUT = ROOT / "output/audio-normalization-v7"
TARGET = -18.0
VERSION = "v7-fixed-gain"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def active_rms(samples):
    # Short words cannot fill an EBU 400 ms block; use 20 ms speech frames instead.
    powers = [sum(v * v for v in samples[i:i + 882]) / len(samples[i:i + 882])
              for i in range(0, len(samples), 882)]
    active = [power for power in powers if power >= max(powers) * 0.001]
    assert active and max(powers) > 0, "Silent speech file"
    return 10 * math.log10(sum(active) / len(active))


def measure(path):
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
        "loudnorm=I=-18:TP=-2:LRA=7:print_format=json", "-f", "null", "-",
    ], capture_output=True, text=True, check=True)
    loudness = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr).group())
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
        "-of", "json", str(path),
    ], text=True))
    stream = probe["streams"][0]
    assert (stream["codec_name"], stream["sample_rate"], stream["channels"]) == ("mp3", "44100", 1)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "44100", "-"])
    samples = array.array("f")
    samples.frombytes(raw)
    assert samples and all(math.isfinite(value) for value in samples)
    integrated = float(loudness["input_i"])
    return {
        "integrated_lufs": integrated if math.isfinite(integrated) else None,
        "true_peak_dbtp": float(loudness["input_tp"]),
        "active_rms_dbfs": round(active_rms(samples), 4),
        "sample_peak_dbfs": round(20 * math.log10(max(abs(value) for value in samples)), 4),
        "decoded_samples": len(samples),
        "duration_ms": round(float(probe["format"]["duration"]) * 1000),
        "size_bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def limiter_delay():
    samples = array.array("f", [0.0]) * 38400
    samples[9600] = 0.5
    assert abs(active_rms(array.array("f", [value * 2 for value in samples])) - active_rms(samples) - 6.0206) < 0.001
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-f", "f32le", "-ar", "192000", "-ac", "1", "-i", "pipe:0",
        "-af", "alimiter=limit=0.707945784:attack=5:release=50:level=false", "-f", "f32le", "pipe:1",
    ], input=samples.tobytes(), capture_output=True, check=True)
    filtered = array.array("f")
    filtered.frombytes(result.stdout)
    delay = max(range(len(filtered)), key=lambda i: abs(filtered[i])) - 9600
    assert len(filtered) == len(samples) and 0 <= delay <= 960
    assert abs(filtered[9600 + delay] - 0.5) < 0.00001
    return delay


def summarize(rows):
    finite = [row["integrated_lufs"] for row in rows if row["integrated_lufs"] is not None]
    return {
        "count": len(rows), "finite_lufs_count": len(finite),
        "integrated_lufs_min": min(finite), "integrated_lufs_max": max(finite),
        "max_true_peak_dbtp": max(row["true_peak_dbtp"] for row in rows),
        "undefined_lufs_count": len(rows) - len(finite),
    }


def main(apply, check, batch="v7"):
    global BACKUP, OUTPUT, VERSION
    original_bytes = MANIFEST.read_bytes()
    original = json.loads(original_bytes)
    all_clips = original["clips"]
    assert len({clip["path"] for clip in all_clips}) == len(all_clips)
    assert len({clip["id"] for clip in all_clips}) == len(all_clips)
    original_ids = {clip["id"] for clip in json.loads((ROOT / "references/audio-pre-v7-normalization/manifest.json").read_text())["clips"]}
    assert len(original_ids) == 162 and original_ids <= {clip["id"] for clip in all_clips}
    if batch == "english40":
        BACKUP = ROOT / "references/audio-pre-english40-normalization"
        OUTPUT = ROOT / "output/audio-normalization-english40"
        VERSION = "v8-english40-fixed-gain"
        v8_ids = {clip["id"] for clip in json.loads((BACKUP / "manifest.json").read_text())["clips"]} - original_ids
        clips = [clip for clip in all_clips if clip["id"] in v8_ids]
        assert len(clips) == 60
        assert all(clip["language"] == "en-US" for clip in clips)
    elif batch == "body-actions":
        BACKUP = ROOT / "references/audio-pre-body-actions-normalization"
        OUTPUT = ROOT / "output/audio-normalization-body-actions"
        VERSION = "v11-body-actions-fixed-gain"
        previous_ids = {clip["id"] for clip in json.loads((ROOT / "references/audio-pre-body-actions/manifest.json").read_text())["clips"]}
        batch_ids = {clip["id"] for clip in json.loads((BACKUP / "manifest.json").read_text())["clips"]} - previous_ids
        clips = [clip for clip in all_clips if clip["id"] in batch_ids]
        assert len(clips) == 24
        assert all(clip["language"] == "en-US" for clip in clips)
    elif batch == "themes-v13":
        BACKUP = ROOT / "references/audio-pre-v13-normalization"
        OUTPUT = ROOT / "output/audio-normalization-v13"
        VERSION = "v13-themes-fixed-gain"
        previous_ids = {clip["id"] for clip in json.loads((ROOT / "references/audio-pre-v13/manifest.json").read_text())["clips"]}
        batch_ids = {clip["id"] for clip in json.loads((BACKUP / "manifest.json").read_text())["clips"]} - previous_ids
        clips = [clip for clip in all_clips if clip["id"] in batch_ids]
        assert len(clips) == 36
        assert all(clip["language"] == "en-US" for clip in clips)
    elif batch == "daily-v19":
        BACKUP = ROOT / "references/audio-pre-v19-normalization"
        OUTPUT = ROOT / "output/audio-normalization-v19"
        VERSION = "v19-daily-fixed-gain"
        previous_ids = {clip['id'] for clip in json.loads((ROOT / 'references/audio-pre-v19/manifest.json').read_text())['clips']}
        clips = [clip for clip in all_clips if clip['id'] not in previous_ids]
        assert len(clips) == 140
        assert sum(clip['language'] == 'zh-CN' for clip in clips) == 80
    elif batch == "chinese-v17":
        BACKUP = ROOT / "references/audio-pre-v17-normalization"
        OUTPUT = ROOT / "output/audio-normalization-v17"
        VERSION = "v17-chinese-fixed-gain"
        batch_ids = {clip['id'] for clip in json.loads((BACKUP / 'manifest.json').read_text())['clips'] if clip['language'] == 'zh-CN'}
        clips = [clip for clip in all_clips if clip['id'] in batch_ids]
        assert len(clips) == 279
    elif batch == "ocean-v16":
        BACKUP = ROOT / "references/audio-pre-v16-normalization"
        OUTPUT = ROOT / "output/audio-normalization-v16"
        VERSION = "v16-ocean-fixed-gain"
        batch_ids = {f"en_custom_{concept}-{role}" for concept in ['baby_shark','mama_shark','papa_shark','grandma_shark','grandpa_shark','octopus','starfish'] for role in ['label','prompt','example']}
        clips = [clip for clip in all_clips if clip["id"] in batch_ids]
        assert len(clips) == 21
        assert all(clip["language"] == "en-US" for clip in clips)
    else:
        clips = [clip for clip in all_clips if clip["id"] in original_ids]
        assert len(clips) == 162
        if any(clip["language"] == "zh-CN" and clip.get("normalization", {}).get("version") != "v7-fixed-gain" for clip in clips):
            clips = [clip for clip in clips if clip["language"] == "en-US"]
            assert len(clips) == 71
    for clip in all_clips:
        assert re.fullmatch(r"/audio/[a-zA-Z0-9_-]+\.mp3", clip["path"])
        assert sha256(AUDIO / Path(clip["path"]).name) == clip["sha256"], clip["id"]
    assert {path.name for path in AUDIO.glob("*.mp3")} == {Path(clip["path"]).name for clip in all_clips}
    if apply and all(clip.get("normalization", {}).get("version") == VERSION for clip in clips):
        print(f"All {len(clips)} clips in {batch} already use this normalization; checksums match. No files changed.")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        before = list(pool.map(lambda clip: measure(AUDIO / Path(clip["path"]).name), clips))
    print("Before:" if apply else "Current:", json.dumps(summarize(before)), flush=True)
    if not apply:
        if check:
            reference = json.loads((OUTPUT / "verification.json").read_text())
            source_clips = {clip["id"]: clip for clip in json.loads((BACKUP / "manifest.json").read_text())["clips"]}
            assert all(clip.get("normalization", {}).get("version") == VERSION for clip in clips)
            if batch == "v7" and len(clips) == 71:
                reference["clips"] = [record for record in reference["clips"] if record["language"] == "en-US"]
                reference["after"] = summarize([record["after"] for record in reference["clips"]])
            assert len(reference["clips"]) == len(clips)
            assert summarize(before) == reference["after"]
            if batch == "v7" and len(clips) == 162:
                assert summarize(before)["finite_lufs_count"] == 159
                assert {clip["id"] for clip, stats in zip(clips, before) if stats["integrated_lufs"] is None} == {
                    "zh_021-label", "zh_022-label", "zh_039-label",
                }
            for clip, stats, record in zip(clips, before, reference["clips"]):
                assert clip["id"] == record["id"] and stats == record["after"], clip["id"]
                unchanged = lambda value: {key: item for key, item in value.items() if key not in {"normalization", "sha256", "size_bytes"}}
                assert unchanged(clip) == unchanged(source_clips[clip["id"]]), "Speech content or voice metadata changed"
                assert stats["true_peak_dbtp"] <= -1.5, clip["id"]
                target = TARGET if stats["integrated_lufs"] is not None else reference["short_clip_active_rms_targets"][clip["language"]]
                metric = "integrated_lufs" if stats["integrated_lufs"] is not None else "active_rms_dbfs"
                assert abs(stats[metric] - target) <= 0.2, clip["id"]
                assert sha256(BACKUP / Path(clip["path"]).name) == record["before"]["sha256"]
            print(f"PASS: {len(clips)} decoded clips in {batch}, loudness within 0.2 LU of -18 LUFS or checked RMS fallback, true peaks <= -1.5 dBTP; original backups intact.")
        (OUTPUT / "measurement-current.json").write_text(json.dumps([
            {"id": clip["id"], **stats} for clip, stats in zip(clips, before)
        ], indent=2) + "\n")
        return
    fallback_targets = {}
    for language in {clip["language"] for clip in clips}:
        fallback_targets[language] = statistics.median(
            stats["active_rms_dbfs"] + TARGET - stats["integrated_lufs"]
            for clip, stats in zip(clips, before)
            if clip["language"] == language and clip["role"] == "label" and stats["integrated_lufs"] is not None
        )
    delay = limiter_delay()
    stage = OUTPUT / "normalized"
    stage.mkdir(exist_ok=True)

    def render(pair):
        clip, stats = pair
        destination = stage / Path(clip["path"]).name
        metric = "integrated_lufs" if stats["integrated_lufs"] is not None else "active_rms_dbfs"
        target = TARGET if metric == "integrated_lufs" else fallback_targets[clip["language"]]
        gain = target - stats[metric]
        # A 192 kHz limiter protects intersample peaks; 3 dB headroom also covers MP3 overshoot.
        for attempt in range(4):
            filters = (
                f"volume={gain:.6f}dB,aresample=192000,apad=pad_len={delay},"
                f"alimiter=limit=0.707945784:attack=5:release=50:level=false,"
                f"atrim=start_sample={delay},asetpts=PTS-STARTPTS,aresample=44100,"
                f"atrim=end_sample={stats['decoded_samples']}"
            )
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-i", str(AUDIO / destination.name),
                "-af", filters, "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", str(destination),
            ], check=True)
            after = measure(destination)
            error = target - after[metric]
            if abs(error) <= 0.15:
                break
            gain += error
        assert abs(error) <= 0.15, (clip["id"], error)
        assert after["true_peak_dbtp"] <= -1.5, (clip["id"], after["true_peak_dbtp"])
        assert after["decoded_samples"] == stats["decoded_samples"], clip["id"]
        assert after["duration_ms"] == stats["duration_ms"], clip["id"]
        return {
            "id": clip["id"], "path": clip["path"], "language": clip["language"], "role": clip["role"],
            "method": metric, "target": round(target, 4), "fixed_gain_db": round(gain, 4),
            "limiter_max_required_db": round(max(0, stats["true_peak_dbtp"] + gain + 3), 4),
            "before": stats, "after": after,
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(render, zip(clips, before)))
    assert MANIFEST.read_bytes() == original_bytes, "Manifest changed during normalization"
    assert all(sha256(AUDIO / Path(clip["path"]).name) == clip["sha256"] for clip in all_clips)
    BACKUP.mkdir(parents=True, exist_ok=True)
    for clip in clips:
        source = AUDIO / Path(clip["path"]).name
        backup = BACKUP / source.name
        if not backup.exists():
            shutil.copy2(source, backup)
        assert sha256(backup) == clip["sha256"], "Original backup differs; do not overwrite"
    backup_manifest = BACKUP / "manifest.json"
    if not backup_manifest.exists():
        backup_manifest.write_bytes(original_bytes)
    assert backup_manifest.read_bytes() == original_bytes, "Original manifest backup differs; do not overwrite"
    replacements = {clip["id"]: {
        **clip, **{key: row["after"][key] for key in ["size_bytes", "sha256", "duration_ms"]},
        "normalization": {"version": VERSION, "target_lufs": TARGET, "method": row["method"],
                          "measured_lufs": row["after"]["integrated_lufs"], "true_peak_dbtp": row["after"]["true_peak_dbtp"]},
        "human_review_status": "pending", "device_playback_status": "pending",
    } for clip, row in zip(clips, rows)}
    updated = {**original, "clips": [replacements.get(clip["id"], clip) for clip in all_clips]}
    try:
        for clip in clips:
            name = Path(clip["path"]).name
            pending = AUDIO / (name + ".next")
            shutil.copy2(stage / name, pending)
            pending.replace(AUDIO / name)
        pending_manifest = MANIFEST.with_suffix(".json.next")
        pending_manifest.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
        pending_manifest.replace(MANIFEST)
        assert all(sha256(AUDIO / Path(clip["path"]).name) == clip["sha256"] for clip in updated["clips"])
    except BaseException:
        for clip in clips:
            name = Path(clip["path"]).name
            shutil.copy2(BACKUP / name, AUDIO / name)
        MANIFEST.write_bytes(original_bytes)
        raise
    report = {
        "version": VERSION, "target_lufs": TARGET, "limiter_ceiling_dbfs": -3,
        "limiter_sample_rate": 192000, "limiter_compensated_delay_samples": delay,
        "short_clip_active_rms_targets": fallback_targets,
        "before": summarize(before), "after": summarize([row["after"] for row in rows]),
        "all_paths_and_durations_and_decoded_sample_counts_preserved": True,
        "human_listening": "pending", "real_ipad_playback": "pending", "clips": rows,
    }
    (OUTPUT / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print("After:", json.dumps(report["after"]), flush=True)
    print(f"Normalized {len(clips)} speech files in {batch}; preserved {len(all_clips) - len(clips)} other files. Original backups: {BACKUP}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Normalize this 162-clip batch after measuring and validating every output; default only measures.")
    mode.add_argument("--check", action="store_true", help="Independently decode and remeasure every final file and assert loudness, peaks, hashes, duration and backups.")
    parser.add_argument("--batch", choices=["v7", "english40", "body-actions", "themes-v13", "ocean-v16", "chinese-v17", "daily-v19"], default="v7", help="Normalize only the selected versioned batch; preserve other files.")
    args = parser.parse_args()
    main(args.apply, args.check, args.batch)
