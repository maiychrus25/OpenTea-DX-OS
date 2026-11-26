# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""`make stt-measure` (M15 C5): runs a folder of .ogg recordings with .txt transcripts through the running STT server.
Prints the word error rate and the seconds per file of the model it currently runs; the Makefile repeats it for each model."""
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable


def _words(text: str) -> list[str]:
    return re.sub(r"[^\w\s]", " ", text.lower()).split()


def _errors(reference: str, hypothesis: str) -> tuple[int, int]:
    """Word edit distance, and the number of reference words."""
    ref, hyp = _words(reference), _words(hypothesis)
    row = list(range(len(hyp) + 1))
    for i, ref_word in enumerate(ref, 1):
        prev, row[0] = row[0], i
        for j, hyp_word in enumerate(hyp, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ref_word != hyp_word))
    return row[-1], len(ref)


def word_error_rate(reference: str, hypothesis: str) -> float:
    errors, words = _errors(reference, hypothesis)
    return errors / words if words else float(bool(errors))


def measure(folder: Path, stt: Any, clock: Callable[[], float] = time.monotonic) -> dict[str, float]:
    errors = words = count = 0
    seconds = 0.0
    for audio in sorted(folder.glob("*.ogg")):
        transcript = audio.with_suffix(".txt")
        if not transcript.is_file():
            continue
        start = clock()
        heard = stt.transcribe(audio.read_bytes())
        seconds += clock() - start
        wrong, total = _errors(transcript.read_text(encoding="utf-8"), heard)
        errors, words, count = errors + wrong, words + total, count + 1
    return {"files": count, "wer": round(errors / words, 4) if words else 0.0, "seconds_per_file": round(seconds / count, 2) if count else 0.0}


def main(argv: list[str]) -> int:
    import os

    from .stt import SttClient

    result = measure(Path(argv[1]), SttClient(os.environ.get("DXOS_STT_URL", "http://dxos-stt:8080")))
    if not result["files"]:
        print("no .ogg file with a matching .txt transcript found", file=sys.stderr)
        return 1
    print(f"model={os.environ.get('DXOS_STT_MODEL', '?')} files={result['files']} wer={result['wer']:.1%} seconds_per_file={result['seconds_per_file']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
