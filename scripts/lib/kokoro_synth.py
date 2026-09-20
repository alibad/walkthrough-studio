"""
Batch Kokoro synthesis. Reads a JSON job on stdin, writes WAVs, reports durations.

Run through `uv run --with kokoro-onnx --with soundfile`, so there is no Python
dependency in this repo and nothing to install by hand — see `tts.mjs`.

Batching matters: the model takes ~0.6s to load and ~0.4s per second of audio,
so loading it once per line would spend more time on startup than on speech.
One process, one load, every line.

stdin:  {"model": "...", "voices": "...", "voice": "af_heart", "speed": 1.0,
         "lang": "en-us", "items": [{"id": "0", "text": "...", "out": "/abs.wav"}]}
stdout: {"results": [{"id": "0", "out": "/abs.wav", "seconds": 6.06}]}
"""

import json
import sys

import soundfile as sf
from kokoro_onnx import Kokoro


def main() -> int:
    job = json.load(sys.stdin)
    kokoro = Kokoro(job["model"], job["voices"])

    available = set(kokoro.get_voices())
    voice = job.get("voice") or "af_heart"
    if voice not in available:
        print(
            json.dumps(
                {
                    "error": f"unknown voice {voice!r}",
                    "available": sorted(available),
                }
            )
        )
        return 1

    results = []
    for item in job["items"]:
        samples, rate = kokoro.create(
            item["text"],
            voice=voice,
            speed=float(job.get("speed", 1.0)),
            lang=job.get("lang", "en-us"),
        )
        sf.write(item["out"], samples, rate)
        results.append(
            {"id": item["id"], "out": item["out"], "seconds": len(samples) / rate}
        )

    print(json.dumps({"results": results, "voice": voice, "rate": rate}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
