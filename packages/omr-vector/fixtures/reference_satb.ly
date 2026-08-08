\version "2.24.0"
\header {
  title = "기준악보"
  subtitle = "for SATB voices"
  tagline = ##f
}

global = {
  \key ees \major
  \time 3/4
  \tempo 4 = 82
}

sopranoMusic = \relative c'' {
  \global
  r4 bes8 bes c bes |
  g2. |
  r4 bes8 bes c bes |
  aes2. |
}

altoMusic = \relative c'' {
  \global
  r4 g8 g aes g |
  ees2. |
  r4 g8 g aes g |
  f2. |
}

tenorMusic = \relative c' {
  \global
  r4 ees8 ees ees ees |
  bes2. |
  r4 ees8 ees f ees |
  c2. |
}

bassMusic = \relative c {
  \global
  r4 ees8 ees aes ees |
  ees2. |
  r4 ees8 ees f g |
  aes2. |
}

verseText = \lyricmode {
  주 의 은 혜 로
  대 속 하 여 서
}

\score {
  \new ChoirStaff <<
    \new Staff \with { instrumentName = "S" } { \clef treble \sopranoMusic }
    \addlyrics { \verseText }
    \new Staff \with { instrumentName = "A" } { \clef treble \altoMusic }
    \addlyrics { \verseText }
    \new Staff \with { instrumentName = "T" } { \clef "treble_8" \tenorMusic }
    \addlyrics { \verseText }
    \new Staff \with { instrumentName = "B" } { \clef bass \bassMusic }
    \addlyrics { \verseText }
  >>
  \layout { }
}
