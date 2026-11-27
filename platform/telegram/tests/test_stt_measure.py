# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The model measurement (C5): word error rate and the folder walk."""
from dxos_telegram.stt_measure import measure, word_error_rate


def test_word_error_rate_ignores_case_and_punctuation():
    assert word_error_rate("Ghi nhật ký, bón phân!", "ghi nhật ký bón phân") == 0.0


def test_word_error_rate_counts_substitutions_deletions_and_insertions():
    assert word_error_rate("a b c d", "a x c") == 0.5  # one substitution and one deletion over four words
    assert word_error_rate("a b", "a b c d") == 1.0
    assert word_error_rate("", "") == 0.0
    assert word_error_rate("", "x") == 1.0


class FakeStt:
    def __init__(self, answers):
        self.answers = answers

    def transcribe(self, audio):
        return self.answers[audio]


def test_measure_pairs_each_ogg_with_its_transcript_and_reports_rate_and_time(tmp_path):
    (tmp_path / "a.ogg").write_bytes(b"A")
    (tmp_path / "a.txt").write_text("xin chào bà con")
    (tmp_path / "b.ogg").write_bytes(b"B")
    (tmp_path / "b.txt").write_text("bón phân")
    (tmp_path / "c.ogg").write_bytes(b"C")  # no transcript: skipped
    clock = iter([0.0, 1.0, 1.0, 4.0])
    result = measure(tmp_path, FakeStt({b"A": "xin chào bà con", b"B": "bón phản"}), clock=lambda: next(clock))
    assert result == {"files": 2, "wer": 0.1667, "seconds_per_file": 2.0}
