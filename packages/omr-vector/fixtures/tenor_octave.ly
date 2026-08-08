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
%% 생성 방법 (실제로 쓴 것: LilyPond 2.26.0):
%%
%%   cd packages/omr-vector/fixtures
%%   lilypond -o tenor_octave tenor_octave.ly     → .pdf, .mid
%%   mv tenor_octave.mid tenor_octave.midi        (다른 픽스처와 확장자 통일)
%%
%%   cd ../../..
%%   node --import tsx scripts/midi-gt.mts \
%%     packages/omr-vector/fixtures/tenor_octave.midi Soprano Alto Tenor Bass \
%%     > packages/omr-vector/fixtures/ground_truth_tenor_octave.json
%%
%% **정답은 손으로 적지 않습니다.** LilyPond 가 낸 MIDI 가 정답입니다.
%% scripts/midi-gt.mts 는 의존성 없이 MIDI 를 읽습니다. 기존 python+music21
%% 스크립트와 같은 값을 내는지 three_staff 로 대조해 확인했습니다.

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

%% 알토: C4~G4 (60~67).
%%
%% 오선 안에 머물러야 한다. 처음에 \relative c' 로 g4 를 썼더니 LilyPond 가
%% 가장 가까운 G3(55)를 골라 알토가 통째로 한 옥타브 내려갔고, 그 덧줄 음이
%% 아래 테너 오선에 더 가까워져 테너가 흡수했다. 이 픽스처가 시험하려는
%% 것은 옥타브 음자리표이지 덧줄 귀속 판정이 아니므로, 성부를 제 음역에 둔다.
alto = \relative c' {
  \global
  c4 d e f | g2 f | f4 f e d | e2 c \bar "|."
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
