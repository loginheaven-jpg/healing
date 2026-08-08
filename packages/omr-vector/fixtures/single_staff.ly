% 단성부 악보 픽스처.
% 성가대 파트 연습용으로 한 파트만 뽑은 악보, 또는 독창 악보가 이 형태다.
% 파서는 이 경우 4파트로 나누려 하지 말고 단일 성부로 처리해야 한다.
\version "2.24.0"
\header { tagline = ##f }

melody = \relative c'' {
  \key f \major \time 4/4
  c4 c8 c8 d4 c4 |
  a4 a8 bes8 c2 |
  d4 c8 bes8 a4 g4 |
  f2 f2 |
}

words = \lyricmode {
  주 님 의 사 랑 이 내 게 임 하 시 니 기 쁘 다
}

\score {
  \new Staff <<
    \new Voice = "mel" { \clef treble \melody }
    \new Lyrics \lyricsto "mel" \words
  >>
  \layout { }
  \midi { }
}
