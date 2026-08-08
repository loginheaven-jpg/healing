\version "2.24.0"

\header {
  title = "OMR Test Hymn"
  composer = "Test"
  tagline = ##f
}

global = { \key f \major \time 4/4 }

soprano = \relative c'' {
  \global
  \partial 4 c4 |
  f4 f8 g a4 a8 bes |
  c2 c4 a |
  bes4 a g f |
  g2. f4 |
  a4 a bes c |
  d2 c4 bes |
  a4 g8 f g4 f |
  f2. \bar "|."
}

alto = \relative c' {
  \global
  \partial 4 a4 |
  c4 c8 c f4 f8 f |
  f2 f4 f |
  f4 f e f |
  e2. c4 |
  f4 f f a |
  bes2 a4 g |
  f4 e8 d e4 c |
  c2. \bar "|."
}

tenor = \relative c' {
  \global
  \partial 4 f4 |
  a4 a8 bes c4 c8 d |
  a2 a4 c |
  d4 c bes a |
  bes2. a4 |
  c4 c d f |
  f2 f4 d |
  c4 bes8 a bes4 a |
  a2. \bar "|."
}

bass = \relative c {
  \global
  \partial 4 f4 |
  f4 f8 f f4 f8 f |
  f2 f4 f |
  bes,4 c d d |
  c2. f4 |
  f4 f bes, f' |
  bes,2 c4 g |
  f4 g8 d g4 f |
  f2. \bar "|."
}

sopranoWords = \lyricmode {
  A -- ma -- zing grace how sweet the sound that saved a wretch like me I on -- ce was lost but now am found was blind but now I see
}

\score {
  \new ChoirStaff <<
    \new Staff \with { instrumentName = "Soprano" } { \clef treble \soprano }
    \addlyrics { \sopranoWords }
    \new Staff \with { instrumentName = "Alto" } { \clef treble \alto }
    \new Staff \with { instrumentName = "Tenor" } { \clef "treble_8" \tenor }
    \new Staff \with { instrumentName = "Bass" } { \clef bass \bass }
  >>
  \midi { }
  \layout { }
}
