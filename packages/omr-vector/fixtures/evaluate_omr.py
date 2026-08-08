#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
evaluate_omr.py
OMR 산출물을 정답 악보와 비교해 정량 채점한다.

채점 항목:
  구조   : 보표 수, 마디 수, 조표, 박자표
  음정   : 음높이 시퀀스 일치율 (레벤슈타인 기반)
  리듬   : 음길이 시퀀스 일치율
  가사   : 음절 인식률
"""

import argparse
import zipfile
from pathlib import Path

from music21 import converter, stream, note, chord, key, meter


def load_score(path: str):
    return converter.parse(path)


def flatten_pitches(part) -> list:
    """파트의 음높이 시퀀스를 뽑는다. 화음은 최고음 기준."""
    out = []
    for n in part.recurse().notesAndRests:
        if isinstance(n, note.Rest):
            out.append("R")
        elif isinstance(n, chord.Chord):
            out.append(n.pitches[-1].nameWithOctave)
        else:
            out.append(n.nameWithOctave)
    return out


def flatten_durations(part) -> list:
    return [round(float(n.duration.quarterLength), 3)
            for n in part.recurse().notesAndRests]


def flatten_lyrics(score) -> list:
    return [n.lyric.strip() for n in score.recurse().notes
            if n.lyric and n.lyric.strip()]


def levenshtein(a: list, b: list) -> int:
    """시퀀스 편집거리."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1,          # 삭제
                           cur[j - 1] + 1,       # 삽입
                           prev[j - 1] + (ca != cb)))  # 치환
        prev = cur
    return prev[-1]


def seq_accuracy(gt: list, pred: list) -> float:
    """1 - 정규화 편집거리. 0~1."""
    if not gt:
        return 0.0
    d = levenshtein(gt, pred)
    return max(0.0, 1.0 - d / max(len(gt), len(pred)))


def structure_info(sc) -> dict:
    parts = list(sc.parts)
    ks = [k.sharps for k in sc.recurse().getElementsByClass(key.KeySignature)]
    ts = [f"{t.numerator}/{t.denominator}"
          for t in sc.recurse().getElementsByClass(meter.TimeSignature)]
    measures = max((len(p.getElementsByClass(stream.Measure)) for p in parts),
                   default=0)
    return {
        "parts": len(parts),
        "measures": measures,
        "key_sharps": ks[0] if ks else None,
        "time_sig": ts[0] if ts else None,
        "notes": len(list(sc.recurse().notes)),
        "lyrics": len(flatten_lyrics(sc)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt", required=True, help="정답 MusicXML")
    ap.add_argument("--pred", required=True, help="OMR 산출 MusicXML/MXL")
    ap.add_argument("--label", default="", help="실험 라벨")
    args = ap.parse_args()

    gt = load_score(args.gt)
    pred = load_score(args.pred)

    gi, pi = structure_info(gt), structure_info(pred)

    print("=" * 66)
    print(f" OMR 채점 {('- ' + args.label) if args.label else ''}")
    print("=" * 66)
    print(f"{'항목':<14}{'정답':>14}{'OMR':>14}{'판정':>10}")
    print("-" * 66)
    for k, kr in [("parts", "보표 수"), ("measures", "마디 수"),
                  ("key_sharps", "조표"), ("time_sig", "박자표"),
                  ("notes", "음표 수"), ("lyrics", "가사 수")]:
        ok = "일치" if gi[k] == pi[k] else "불일치"
        print(f"{kr:<14}{str(gi[k]):>14}{str(pi[k]):>14}{ok:>10}")

    # 파트별 음정/리듬 정확도 (파트 수가 같을 때만)
    gparts, pparts = list(gt.parts), list(pred.parts)
    print("-" * 66)
    if len(gparts) == len(pparts):
        for i, (g, p) in enumerate(zip(gparts, pparts)):
            pa = seq_accuracy(flatten_pitches(g), flatten_pitches(p))
            da = seq_accuracy(flatten_durations(g), flatten_durations(p))
            print(f"  파트{i+1}  음정 정확도 {pa*100:5.1f}%   리듬 정확도 {da*100:5.1f}%")
    else:
        print("  보표 수 불일치로 파트별 대조 불가")

    # 전체 음정 시퀀스 (파트 순서 무관하게 전체 비교)
    gall, pall = [], []
    for g in gparts:
        gall += flatten_pitches(g)
    for p in pparts:
        pall += flatten_pitches(p)
    print("-" * 66)
    print(f"  전체 음정 시퀀스 정확도 : {seq_accuracy(gall, pall)*100:5.1f}%")

    gl, pl = flatten_lyrics(gt), flatten_lyrics(pred)
    print(f"  가사 음절 정확도        : {seq_accuracy(gl, pl)*100:5.1f}%"
          f"   (정답 {len(gl)}음절 / 인식 {len(pl)}음절)")
    if pl:
        print(f"  인식된 가사: {pl[:20]}")


if __name__ == "__main__":
    main()
