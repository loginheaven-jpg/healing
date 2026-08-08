%% tenor_octave — 옥타브 이조 음자리표 회귀 픽스처
%%
%% docs/tasks/P1.md 3.4 가 요구하는 새 픽스처입니다.
%%
%% 왜 필요한가 —
%% 기존 open_satb.pdf 는 테너가 65~77 로 비정상적으로 높습니다(알토보다 높다).
%% 그래서 음자리표 인식이 틀려도 음역 휴리스틱이 개입하지 않아, 결함이
%% 있는지 없는지 가릴 수 없습니다. 이 픽스처는 테너를 **진짜 테너 음역**
%% (52~69, E3~A4)에 두어 그 구분을 가능하게 합니다.
%%
%% 테너 오선은 \clef "treble_8" 을 씁니다. LilyPond 는 입력을 항상 실음으로
%% 받고, 이 음자리표는 표시 위치만 한 옥타브 올려 그립니다. 따라서 파서가
%% 옥타브 표시를 놓치면 결과가 정확히 한 옥타브 높게 나옵니다.
%%
%% 생성 방법 (LilyPond 2.24 이상):
%%   lilypond -o tenor_octave tenor_octave.ly
%%     → tenor_octave.pdf, tenor_octave.midi
%%   python3 gen_single_gt.py  형식으로 MIDI 에서 정답을 뽑아
%%     → ground_truth_tenor_octave.json
%%
%% **정답은 손으로 적지 않습니다.** LilyPond 가 낸 MIDI 가 정답입니다.

\version "2.24.0"

\header {
  title = "Tenor Octave Test"
  tagline = ##f
}

global = {
  \key c \major
  \time 4/4
}

%% 소프라노: C5~E5 부근 (72~76)
soprano = \relative c'' {
  \global
  c4 d e f | g2 e | f4 e d c | d2 c \bar "|."
}

%% 알토: G4~C5 부근 (67~72)
alto = \relative c' {
  \global
  g4 a b c | d2 c | c4 c b a | b2 g \bar "|."
}

%% 테너: E3~A4 (52~69). 실제 테너 음역이며 알토보다 낮다.
%% 이것이 이 픽스처의 요점이다.
tenor = \relative c {
  \global
  e4 f g a | b2 a | a4 g f e | g2 e \bar "|."
}

%% 베이스: C2~C3 부근 (36~48)
bass = \relative c, {
  \global
  c4 d e f | g2 a | f4 g a c | g2 c, \bar "|."
}

\score {
  \new ChoirStaff <<
    \new Staff \with { instrumentName = "S" } { \clef "treble" \soprano }
    \new Staff \with { instrumentName = "A" } { \clef "treble" \alto }
    \new Staff \with { instrumentName = "T" } { \clef "treble_8" \tenor }
    \new Staff \with { instrumentName = "B" } { \clef "bass" \bass }
  >>
  \layout { }
  \midi { \tempo 4 = 82 }
}
