# Paint the Music

A visual instrument: you draw on a grid, and every stroke becomes a note.
Pitches are constrained to the chosen scale, so playing a wrong note is not
possible you can put anything anywhere and it still holds together.

Everything runs in the browser. No account, no server, no dependency: opening
`index.html` is enough.

The interface is available in English and French; the button in the top bar
switches between them.

## Running it

Double-clicking `index.html` is enough to draw and to play.

MIDI and offline use need a secure context: run `serve.cmd`, then open
http://localhost:8777. The app then becomes installable from the browser.

## How it works

- Horizontal axis: time, one column per step. Vertical axis: pitch.
- A continuous stroke along one row becomes **a single held note**, not a
  burst. A voice can be set to "repeated" so it replays on every step which
  is what you want for a hi-hat or a driving bass.
- The force of the gesture sets the dynamic: stylus pressure, or the speed of
  the stroke with a mouse. A soft note is also a duller note; the filter
  follows.
- 16 palette slots, each playing one of the 25 instruments in the library.
  Changing an instrument never touches the drawing.

## The tools

| Tool | What it does |
| --- | --- |
| Brush | lays down notes; three sizes, plus a chord brush |
| Eraser | rubs them out |
| Select | frames a region: move, transpose, stretch, harmonise, humanise, loop, repeat |
| Note | grabs one note: handles to stretch it, exact length from the keyboard |

Four pages, chainable into an arrangement (1-2-3-2-3-4, say) played as a loop.
Playable keyboard and live recording. MIDI in and out. WAV export, WAV stems,
and MIDI.

## Shortcuts

| Key | Effect |
| --- | --- |
| `Space` | play / stop |
| `1`–`9` | pick a colour |
| `B` `E` `S` `N` | brush, eraser, select, note |
| `G` | show or hide the grid |
| `[` `]` | previous / next page |
| `+` `-` `0` | zoom in, out, fit |
| `Ctrl`+wheel | zoom around the cursor |
| arrows | move the selection (`Shift`: by an octave) |
| `Ctrl+X` `C` `V` `D` | cut, copy, paste, duplicate |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| right click or `Alt` | erase without switching tool |

The canvas can also be drawn entirely from the keyboard: the arrows move a
cursor, `Enter` puts a note down or takes it away.

## Saving

Work in progress is saved automatically in the browser. Projects can be named,
exported as `.json` and imported back.

Before any operation an undo cannot catch opening another project, importing,
clearing a page, shrinking the grid a full copy is tucked away in the
**restore points**, which survive a reload.

## Layout

    index.html        the page
    serve.cmd         local server, for MIDI and offline use
    manifest.webmanifest, sw.js   install and offline cache
    css/style.css     the skin
    js/i18n.js        English and French wording
    js/scales.js      scales, row → pitch mapping
    js/audio.js       synthesis: 25 instruments, reverb, echo
    js/clock.js       the scheduler's clock
    js/model.js       grid, pages, regions, arrangement, saving
    js/midi.js        MIDI in and out
    js/restore.js     restore points
    js/projects.js    named projects and .json files
    js/canvas.js      rendering, pitch ruler, zoom, strokes
    js/export.js      WAV and MIDI
    js/app.js         interface, transport, scheduler

## A few implementation choices

- **No dependencies.** No library, no CDN, no remote font. All the sound is
  synthesised; there is not one sample in the project.
- **The clock runs in a worker.** A background tab sees `setInterval` throttled
  to 1 Hz, which would cut playback off; a worker is not throttled, with an
  ordinary timer standing by as a fallback.
- **The canvas is on two layers.** The decor sheet, grid, ruler is only
  redrawn on a scroll or a zoom; while you paint, only the notes and the
  playhead move.
- **A cell is a single integer**: four bits of colour, five of dynamic. Files
  stay compact and older saves still load.
- **The grid is a single layer.** Two voices cannot occupy the same row at the
  same step. That is the format's structuring constraint: in practice, each
  voice gets its own register.

## Privacy

Nothing is collected, nothing is sent, no cookie is set. See
[PRIVACY.md](PRIVACY.md) (French version: [PRIVACY.fr.md](PRIVACY.fr.md)).

## Licence and credits

Licence to be settled before publication. Where everything comes from, and the
intellectual property position: [CREDITS.md](CREDITS.md).
