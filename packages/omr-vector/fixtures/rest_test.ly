\version "2.24.0"
\header { title = "Rest Test" tagline = ##f }
global = { \key ees \major \time 3/4 }

sop = \relative c'' { \global r4 bes8 bes c bes | g2. | r4 bes8 bes c bes | aes2. }
alt = \relative c'' { \global r4 g8 g aes g | ees2. | r4 g8 g aes g | f2. }
ten = \relative c'  { \global r4 ees8 ees ees ees | bes2. | r4 ees8 ees f ees | c2. }
bas = \relative c   { \global r4 ees8 ees aes ees | ees2. | r4 ees8 ees f g | aes2. }

\score {
  \new PianoStaff <<
    \new Staff { \clef treble << { \voiceOne \sop } \\ { \voiceTwo \alt } >> }
    \new Staff { \clef bass  << { \voiceOne \ten } \\ { \voiceTwo \bas } >> }
  >>
  \layout { }
}
