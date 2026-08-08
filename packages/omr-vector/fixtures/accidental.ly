% 임시표 검증용 픽스처.
% 목적: 마디 안에서 임시표가 이후 같은 음에 지속되고, 마디선을 넘으면
%       초기화되는 규칙(서양 기보법 표준)을 파서가 지키는지 확인한다.
%
% 1마디: fis 뒤에 f 를 쓰면 LilyPond는 자연표를 찍는다 → 명시적 취소
% 2마디: fis 뒤 같은 마디의 f4는 샾이 유지된 상태로 적으면 되지만,
%        검증은 "우리 파서 결과 == LilyPond MIDI" 로만 판단하므로
%        LilyPond가 어떻게 조판하든 정답은 MIDI가 확정한다.
\version "2.24.0"
\header { tagline = ##f }

music = \relative c'' {
  \key c \major \time 4/4
  % 마디1: 임시표가 같은 마디 안에서 지속되는지
  fis4 fis4 g4 fis4 |
  % 마디2: 마디선을 넘으면 초기화되는지 (여기 f는 자연음이어야 한다)
  f4 f4 g4 a4 |
  % 마디3: 내림표와 겹올림/겹내림
  bes4 bes4 aes4 g4 |
  % 마디4: 자연표로 취소
  bes4 b4 c4 c4 |
}

bassmusic = \relative c {
  \key c \major \time 4/4
  c4 c4 d4 c4 |
  f4 f4 e4 d4 |
  ees4 ees4 f4 g4 |
  ees4 e4 c4 c4 |
}

\score {
  \new PianoStaff <<
    \new Staff { \clef treble \music }
    \new Staff { \clef bass \bassmusic }
  >>
  \layout { }
  \midi { }
}
