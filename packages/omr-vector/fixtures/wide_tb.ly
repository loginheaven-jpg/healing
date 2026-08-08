%% wide_tb — 넓은 테너·베이스 간격 오탐 회귀 픽스처
%%
%% 감리 지시로 만든 픽스처입니다.
%%
%% 왜 필요한가 —
%% POLYRHYTHM_SUSPECTED 검출에 한때 "화음 안 인접 음 16반음 초과" 를 신호로
%% 썼다가 정상 악보에 오탐이 났습니다. **테너와 베이스는 옥타브를 넘어
%% 벌어지는 것이 정상**이고, 찬송가 편곡에서 10도·12도가 흔합니다.
%%
%% 이 악보는 처음부터 끝까지 **완전 동리듬**입니다. 모든 성부가 4분음표로만
%% 움직이므로 폴리리듬이 존재할 수 없습니다. 그런데 테너와 베이스는 늘
%% 17~18반음(10도 남짓) 벌어져 있습니다.
%%
%% 기준: POLYRHYTHM_SUSPECTED 가 뜨지 않는다.
%%
%% 생성 방법 (LilyPond 2.26.0):
%%   cd packages/omr-vector/fixtures
%%   <LilyPond>/bin/lilypond -o wide_tb wide_tb.ly     → .pdf, .mid
%%   mv wide_tb.mid wide_tb.midi
%%
%%   cd ../../..
%%   node --import tsx scripts/midi-gt.mts \
%%     packages/omr-vector/fixtures/wide_tb.midi Soprano Alto Tenor Bass \
%%     > packages/omr-vector/fixtures/ground_truth_wide_tb.json
%%
%% 2단 축소악보라 보표 하나에 성부가 둘씩 화음으로 겹칩니다. midi-gt 가
%% 트랙 수의 두 배인 파트 이름을 받으면 각 트랙을 상성·하성으로 가릅니다.

\version "2.26.0"

\header {
  title = "Wide Tenor-Bass Test"
  tagline = ##f
}

global = {
  \key c \major
  \time 4/4
}

%% 상단 보표: 알토(64~71) + 소프라노(72~79). 화음의 아래가 알토다.
upper = \fixed c' {
  \global
  <e c'>4 <f d'> <g e'> <a f'> |
  <b g'>4 <a f'> <g e'> <f d'> |
  <e c'>4 <g e'> <f d'> <e c'> |
  <f d'>4 <e c'> <f d'> <e c'> \bar "|."
}

%% 하단 보표: 베이스(40~45) + 테너(57~62).
%% 둘의 간격이 늘 17~18반음이다. 이것이 이 픽스처의 요점이다.
lower = \fixed c' {
  \global
  <e,, a,>4 <f,, b,> <g,, c> <a,, d> |
  <a,, d>4 <g,, c> <f,, b,> <e,, a,> |
  <e,, a,>4 <g,, c> <f,, b,> <e,, a,> |
  <f,, b,>4 <e,, a,> <f,, b,> <e,, a,> \bar "|."
}

\score {
  \new ChoirStaff <<
    \new Staff { \clef "treble" \upper }
    \new Staff { \clef "bass" \lower }
  >>
  \layout {
    %% 두 오선을 넉넉히 벌린다.
    %%
    %% 기본 간격으로 조판하니 위 오선의 낮은 음과 아래 오선의 높은 음이
    %% 서로의 덧줄 영역에 들어가, 최근접 오선 판정이 음표를 뒤바꿨다
    %% (알토에 52, 테너에 74가 들어가고 DIVISI_SUSPECTED 까지 떴다).
    %%
    %% 실제 성가 2단 축소악보는 이만큼 좁지 않다. 이 픽스처가 시험하려는
    %% 것은 넓은 테너·베이스 간격이지 덧줄 귀속이 아니므로, 그 변수를 뺀다.
    \context {
      \Score
      \override StaffGrouper.staff-staff-spacing.basic-distance = #20
      \override StaffGrouper.staff-staff-spacing.minimum-distance = #18
    }
  }
  \midi { \tempo 4 = 80 }
}
