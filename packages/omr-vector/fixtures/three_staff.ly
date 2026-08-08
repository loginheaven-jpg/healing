% 3단 혼합 악보 픽스처.
% 성악 2단(S+A / T+B 축소) + 피아노 반주 1단이 붙은 형태를 단순화한 것.
% 실제로 흔한 형태는 성악 2단 + 반주 2단(총 4단)인데, 이 경우 오선 수만
% 보면 4단 SATB 개방악보와 구별되지 않는다. 3단은 그 중간 케이스다.
\version "2.24.0"
\header { tagline = ##f }

sa = \relative c'' {
  \key c \major \time 4/4
  <c e>4 <c e>4 <d f>4 <c e>4 |
  <b d>4 <b d>4 <c e>2 |
}

tb = \relative c {
  \clef bass
  \key c \major \time 4/4
  <c g>4 <c g>4 <d a>4 <c g>4 |
  <g d'>4 <g d'>4 <c g'>2 |
}

acc = \relative c {
  \clef bass
  \key c \major \time 4/4
  c8 g c g c g c g |
  g8 d g d c g c g |
}

\score {
  <<
    \new Staff { \sa }
    \new Staff { \tb }
    \new Staff { \acc }
  >>
  \layout { }
  \midi { }
}
