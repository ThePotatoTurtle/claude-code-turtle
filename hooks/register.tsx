import { atom, read, update } from 'claude-code'
import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

// The turtle logo, one letter per pixel on its 16 x 10 grid.
const PIXELS = [
  '....LLLLSS......',
  '..LLLLSSSSSS....',
  '.LLLSSSSSSSSS...',
  '.LLSSSSSSSSSS.GG',
  'LSSSSSSSSSSSSGEG',
  'SSSSSSSSSSSSDGGG',
  'DDDDDDDDDDDDDGG.',
  '.GGGGGGGGGGGG...',
  '..GG.....GG.....',
  '..GG.....GG.....',
]

// Tucked into the shell: no head, no legs. Used when hiding and when asleep.
const TUCKED_PIXELS = [
  '....LLLLSS......',
  '..LLLLSSSSSS....',
  '.LLLSSSSSSSSS...',
  '.LLSSSSSSSSSS...',
  'LSSSSSSSSSSSS...',
  'SSSSSSSSSSSSD...',
  'DDDDDDDDDDDDD...',
  '.GGGGGGGGGGG....',
  '................',
  '................',
]

const COLORS: Record<string, string> = {
  L: '#d8b897',
  S: '#c79a6b',
  D: '#9b7853',
  G: '#8fbf9a',
  E: '#0f1612',
  F: '#6a9475',
}

const WALNUT = '#c79a6b'
const SAGE = '#8fbf9a'
const MUTED = '#8f8a78'
const RED = '#d0604f'

type Cell = { glyph: string; color?: string; backgroundColor?: string }

// Two pixel rows per terminal row: the upper half block takes the top pixel as
// its color and the bottom pixel as its background.
function turtleRows(pixels: string[]): Cell[][] {
  const rows: Cell[][] = []

  for (let y = 0; y < pixels.length; y += 2) {
    const row: Cell[] = []

    for (let x = 0; x < 16; x++) {
      const top = COLORS[pixels[y]![x]!]
      const bottom = COLORS[pixels[y + 1]![x]!]

      if (top && bottom) {
        row.push({ glyph: '▀', color: top, backgroundColor: bottom })
      } else if (top) {
        row.push({ glyph: '▀', color: top })
      } else if (bottom) {
        row.push({ glyph: '▄', color: bottom })
      } else {
        row.push({ glyph: ' ' })
      }
    }

    rows.push(row)
  }

  return rows
}

const TURTLE = turtleRows(PIXELS)
const TUCKED = turtleRows(TUCKED_PIXELS)

// The walk: a diagonal four-legged gait. Each leg plants ahead, slides back
// under the shell as the body moves on (the sprite advances one column a beat,
// so a planted foot stays put on the ground), then lifts and swings forward.
// Near-front and far-back step together; near-back and far-front opposite.
type Leg = { x: number; isDown: boolean }

const CYCLE: Leg[] = [
  { x: 1, isDown: true },
  { x: 0, isDown: true },
  { x: -1, isDown: true },
  { x: 0, isDown: false },
]

function frame(beat: number): string[] {
  const rows = [Array<string>(16).fill('.'), Array<string>(16).fill('.')]

  const paint = (base: number, phase: number, color: string) => {
    const leg = CYCLE[(beat + phase) % 4]!

    for (const dx of [0, 1]) {
      const x = base + leg.x + dx
      rows[0]![x] = color

      if (leg.isDown) {
        rows[1]![x] = color
      }
    }
  }

  paint(5, 0, 'F') // far back
  paint(11, 2, 'F') // far front
  paint(2, 2, 'G') // near back
  paint(9, 0, 'G') // near front

  return [...PIXELS.slice(0, 8), rows[0]!.join(''), rows[1]!.join('')]
}

const STRIDE = [0, 1, 2, 3].map(beat => turtleRows(frame(beat)))

const WIDTH = 16

// ---- Pace: the turtle walks faster the busier Claude is ----
// Busy = tool calls started in the last 30 seconds of the turn.
type Pace = { stepMs: number; crossS: number }

const PACES: Pace[] = [
  { stepMs: 110, crossS: 20 }, // strolling
  { stepMs: 80, crossS: 14 }, // 3 or more calls
  { stepMs: 55, crossS: 9 }, // 6 or more calls
]
const BUSY_WINDOW_MS = 30_000

// ---- Desktop and mobile apps ----
// The terminal draws the turtle from half-block characters, two pixels per character.
// The apps draw text in a proportional font with space between lines, so those blocks
// come apart. There the turtle is drawn as a small vector image instead, with the same
// pixels, and the walk runs as an animation inside the image.

const PX = 4 // CSS pixels per turtle pixel
const BAND_H = 12 * PX // two pixels of headroom above the turtle, for the hop

const rects = (pixels: string[]) =>
  pixels
    .map((row, y) => {
      let out = ''

      for (let x = 0; x < row.length; ) {
        const fill = COLORS[row[x]!]
        let run = 1

        while (row[x + run] === row[x]) {
          run++
        }

        if (fill) {
          out += `<rect x="${x}" y="${y}" width="${run}" height="1.02" fill="${fill}"/>`
        }
        x += run
      }

      return out
    })
    .join('')

const sprite = (pixels: string[], extraStyle = '', inner?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${16 * PX}" height="${BAND_H}" viewBox="0 -2 16 12" shape-rendering="crispEdges">${extraStyle}${inner ?? rects(pixels)}</svg>`

const STILL_SVG = sprite(PIXELS)
const TUCKED_SVG = sprite(TUCKED_PIXELS)
// Happy: two little hops.
const HAPPY_SVG = sprite(
  PIXELS,
  '<style>.h{animation:h .5s ease-in-out 2}@keyframes h{50%{transform:translateY(-2px)}}@media (prefers-reduced-motion:reduce){.h{animation:none}}</style>',
  `<g class="h">${rects(PIXELS)}</g>`,
)

type WalkMode = 'walk' | 'hop' | 'hide'

// The desktop walk. The app draws an image no wider than a few hundred pixels, so one
// wide animated strip gets cut off partway across a large window. Instead the turtle
// is a small image, and the layout moves it: an empty box before it and one after it
// share the spare width in proportion to how far along he is, so he always crosses
// the whole band whatever its width. The band is redrawn several times a second, as
// the terminal's is; each drawing picks the leg position for that moment.
const TICK_MS = 125
const raisedSprite = (pixels: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${16 * PX}" height="${BAND_H}" viewBox="0 0 16 12" shape-rendering="crispEdges">${rects(pixels)}</svg>`
const STRIDE_SVG = [0, 1, 2, 3].map(beat => sprite(frame(beat)))
const STRIDE_UP_SVG = [0, 1, 2, 3].map(beat => raisedSprite(frame(beat)))

// ---- The look: colours for the desktop and mobile apps ----
// The turtle's own palette, from leonlin.ca. Dark is the site itself: one deep forest
// green for the page, cards and panels alike, so nothing sits in a lighter box, with
// menus a shade lighter so they can be told from what is behind them. Light is the
// same idea on paper: a warm cream page with forest green ink. Both keep walnut for
// accents and green for success. The app follows the person's own light or dark mode.
const { theme: COLORS_THEME, problems: THEME_PROBLEMS } = makeColors({
  label: 'Turtle',
  roles: { accent: '#c79a6b', danger: '#d0604f', success: '#8fbf9a', warning: '#d6b045', pro: '#a08bc4' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0f1612',
        'surface-1': '#0f1612',
        'surface-2': '#0f1612',
        'surface-3': '#141c17',
        'text-primary': '#efe8d8',
        'text-secondary': '#c9c3b2',
        'text-muted': '#9a9583',
      },
    },
  },
  light: {
    // Deeper walnut, green and amber, so they read on cream.
    roles: { accent: '#9a6a35', success: '#3f7d55', warning: '#a86f14' },
    git: {
      added: '#2f7a46',
      removed: '#b3392f',
      modified: '#8a6417',
      merged: '#6d4f94',
      closed: '#a8432f',
      conflicting: '#a86f14',
      draft: '#5c6659',
    },
    gray: {
      anchors: {
        'surface-0': '#f5f0e4',
        'surface-1': '#f5f0e4',
        'surface-2': '#f9f5ec',
        'surface-3': '#f9f5ec',
        'text-primary': '#18211b',
        'text-secondary': '#3b463d',
        'text-muted': '#5c6659',
      },
    },
  },
})

// The ground behind the conversation is the page colour of whichever mode is showing.
const LOOK: ThemeSetArgs = { colors: COLORS_THEME, backdrop: { color: 'surface-0' } }

// ---- Words ----

const FACTS = [
  "A turtle's shell is part of its skeleton, fused to the spine and ribs. It can't climb out of it.",
  'Turtles have been around for over 200 million years. They shared the Triassic with the first dinosaurs.',
  'Sea turtles find their way by the Earth’s magnetic field, and return to nest on the beach where they hatched.',
  'A leatherback sea turtle can dive more than a kilometre deep.',
  'Tortoises walk with a diagonal gait: front left with back right, then the other pair.',
  'Some turtles can breathe through their rear end while hibernating under ice. It is called cloacal respiration.',
  'For many turtles, the temperature of the nest decides whether the hatchlings are male or female.',
  'A group of turtles is called a bale.',
  'Turtles have no teeth. They bite with a hard beak, like a bird.',
  'The shell has nerves in it. A turtle can feel a scratch on its back.',
  'Giant tortoises can live well over a hundred years.',
  'Green sea turtles are named for the colour of their fat, not their shell.',
  'Slow and steady: a giant tortoise walks at about a quarter of a kilometre an hour.',
]

// A Bash or PowerShell command that tests, builds, checks or lints.
const CHECKS =
  /\b(test|tests|pytest|jest|vitest|mocha|playwright|tsc|typecheck|type-check|lint|eslint|build|cargo\s+(test|build|check|clippy)|go\s+(test|build|vet)|make|gradle|mvn|dotnet\s+(test|build))\b/i

const LONG_CALL_S = 5 // a tool call running this long gets a turtle beside it
const HAPPY_MS = 4000
const REACT_MS = 2600
const SLEEPY_AFTER_MS = 5 * 60_000
const PACE_STATUS_AFTER_MS = 10_000

const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

const isGreeted = atom({ plugin: 'turtle', key: 'isGreeted' } as const, false)

type Timer = { cancel: () => void }
type Mood = { kind: 'happy' | 'stopped' | 'sleepy'; note: string }

export const register: Register = on => {
  // Terminal walk
  let step = 0
  let walk: Timer | undefined
  let walkMs = PACES[0]!.stepMs

  // Desktop walk: where he is and how fast he goes
  let pace = PACES[0]!
  let pos = 0
  let lastAt = Date.now()
  let mode: WalkMode = 'walk'

  // The turn in progress on the main loop
  let turnStartedAt: number | undefined
  let callTimes: number[] = []
  let paceTimer: Timer | undefined
  let reactTimer: Timer | undefined

  // Between turns
  let mood: Mood | undefined
  let moodTimer: Timer | undefined
  let idleTimer: Timer | undefined
  let isSoundOn = true
  let isThemeOn = true

  // Long tool calls
  const callStarts = new Map<string, number>()

  // Carry the desktop walk on from where the turtle is now.
  const settle = () => {
    const now = Date.now()

    if (mode !== 'hide') {
      pos = (pos + (now - lastAt) / 1000 / pace.crossS) % 1
    }
    lastAt = now
  }

  const setWalk = (nextPace: Pace, nextMode: WalkMode) => {
    settle()
    pace = nextPace
    mode = nextMode
  }

  const paceNow = (): Pace => {
    const since = Date.now() - BUSY_WINDOW_MS
    callTimes = callTimes.filter(at => at >= since)

    return callTimes.length >= 6 ? PACES[2]! : callTimes.length >= 3 ? PACES[1]! : PACES[0]!
  }

  on('session.start', async ($, e, next) => {
    await $.command
      .register({ name: 'turtle', description: 'A turtle fact. Also "/turtle theme on|off" for the colours and "/turtle sound on|off".' })
      .catch(() => {})
    isSoundOn = (await $.store.get('sound').catch(() => undefined)) !== 'off'
    isThemeOn = (await $.store.get('theme').catch(() => undefined)) !== 'off'

    // The colours, unless "/turtle theme off" was chosen. The terminal draws no look,
    // and says so quietly; nothing is shown for that.
    if (isThemeOn) {
      const unpainted = THEME_PROBLEMS.find(line => line.startsWith("Desktop won't paint"))

      if (unpainted !== undefined) {
        $.ui.toast(unpainted)
      }
      await $.theme.set(LOOK).catch(() => {})
    }

    idleTimer?.cancel()
    idleTimer = $.clock.after(SLEEPY_AFTER_MS, () => {
      mood = { kind: 'sleepy', note: 'resting until you need him' }
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('command.run', { command: 'turtle' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()

    if (args === 'sound off' || args === 'quiet' || args === 'mute') {
      isSoundOn = false
      await $.store.set('sound', 'off').catch(() => {})

      return { text: '🐢 Sound off. "/turtle sound on" brings it back.' }
    }

    if (args === 'theme off') {
      isThemeOn = false
      await $.store.set('theme', 'off').catch(() => {})
      // Clears the look of the app, whichever plugin set it.
      await $.theme.clear().catch(() => {})

      return { text: '🐢 Colours off: the app is back to its own. "/turtle theme on" brings them back.' }
    }

    if (args === 'theme on' || args === 'theme') {
      isThemeOn = true
      await $.store.set('theme', 'on').catch(() => {})
      const set = await $.theme.set(LOOK).catch(() => undefined)

      return {
        text:
          set?.isDrawn === false
            ? '🐢 Colours on. They show in the desktop and mobile apps; this one draws no look.'
            : '🐢 Colours on: forest green in dark mode, cream paper in light.',
      }
    }

    if (args === 'sound on' || args === 'sound') {
      isSoundOn = true
      await $.store.set('sound', 'on').catch(() => {})
      void $.audio.play({ asset: 'sounds/done.wav' }, { gain: 0.6 }).catch(() => {})

      return { text: '🐢 Sound on: a soft plop when a turn finishes.' }
    }

    return { text: `🐢 ${FACTS[Math.floor(Math.random() * FACTS.length)]}` }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, isGreeted, () => true).catch(() => {})

    // Wake up.
    idleTimer?.cancel()
    idleTimer = undefined
    moodTimer?.cancel()
    mood = undefined

    return next(e)
  }).catch(($, e, next) => next(e)) // a fault of the turtle's never holds up a prompt

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      idleTimer?.cancel()
      idleTimer = undefined
      moodTimer?.cancel()
      reactTimer?.cancel()
      mood = undefined

      turnStartedAt = Date.now()
      callTimes = []
      pos = 0
      lastAt = turnStartedAt
      pace = PACES[0]!
      mode = 'walk'

      // Every 5 seconds: settle the pace, and after ten seconds show how long
      // he has been walking in the status line.
      paceTimer?.cancel()
      paceTimer = $.clock.every(5000, () => {
        if (turnStartedAt === undefined) {
          return
        }

        const settled = paceNow()

        if (settled !== pace && mode === 'walk') {
          setWalk(settled, 'walk')
          $.ui.invalidate('ui.render')
        }

        const elapsed = Date.now() - turnStartedAt

        if (elapsed >= PACE_STATUS_AFTER_MS) {
          $.ui.status(`🐢 ${span(elapsed)}`)
        }
      })

      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      paceTimer?.cancel()
      paceTimer = undefined
      reactTimer?.cancel()
      turnStartedAt = undefined
      callStarts.clear()
      $.ui.status(undefined)

      const isDone = e.reason === 'answer' && !e.isAborted

      // Happy when the turn finished; tucked in when it was cut short.
      mood = isDone
        ? { kind: 'happy', note: `all done · ${span(e.durationMs)}` }
        : { kind: 'stopped', note: e.isAborted ? 'stopped' : 'that one went wrong' }
      moodTimer?.cancel()
      moodTimer = $.clock.after(HAPPY_MS, () => {
        mood = undefined
        $.ui.invalidate('ui.render')
      })

      if (isDone && isSoundOn) {
        void $.audio.play({ asset: 'sounds/done.wav' }, { gain: 0.6 }).catch(() => {})
      }

      // Left alone long enough, he tucks in for a nap.
      idleTimer?.cancel()
      idleTimer = $.clock.after(SLEEPY_AFTER_MS, () => {
        mood = { kind: 'sleepy', note: 'resting until you need him' }
        $.ui.invalidate('ui.render')
      })

      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  // Every tool call: note it for the pace and for the long-call turtle, and react
  // to a test or build when it comes back.
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    let tick: Timer | undefined

    try {
      const now = Date.now()
      callStarts.set(id, now)
      callTimes.push(now)

      const faster = paceNow()

      if (turnStartedAt !== undefined && faster !== pace && mode === 'walk') {
        setWalk(faster, 'walk')
        $.ui.invalidate('ui.render')
      }

      // Redraw the call's row now and then, so its turtle appears and counts up.
      tick = $.clock.every(LONG_CALL_S * 1000, () => $.ui.invalidate('ui.render'))
    } catch {}

    const ran = await next(e)

    try {
      tick?.cancel()
      callStarts.delete(id)

      const command = (e as { command?: unknown }).command

      if (turnStartedAt !== undefined && typeof command === 'string' && CHECKS.test(command) && ran.deny === undefined) {
        // A hop for a pass, into the shell for a fail.
        setWalk(pace, ran.isError === true ? 'hide' : 'hop')
        reactTimer?.cancel()
        reactTimer = $.clock.after(REACT_MS, () => {
          setWalk(paceNow(), 'walk')
          $.ui.invalidate('ui.render')
        })
      }

      $.ui.invalidate('ui.render')
    } catch {}

    return ran
  }).catch(($, e, next) => next(e)) // nor a tool call

  // A small turtle under a tool call that has been running a while.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    const startedAt = callStarts.get(e.props.tool_use_id)

    if (!e.props.isRunning || startedAt === undefined) {
      return row
    }

    const seconds = Math.floor((Date.now() - startedAt) / 1000)

    if (seconds < LONG_CALL_S) {
      return row
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {row}
        <Text color={SAGE}>{`  🐢 still going · ${seconds}s`}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    // ---- Desktop and mobile apps ----
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Box, Text, Svg } = $.ui.resolve(e)

      if (e.props.isWorking) {
        if (walk === undefined || walkMs !== TICK_MS) {
          walk?.cancel()
          walkMs = TICK_MS
          walk = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
        }

        settle()

        const now = Date.now()
        const beat = Math.floor(now / ((300 * pace.crossS) / 20)) % 4
        const isUp = mode === 'hop' && Math.floor(now / 220) % 2 === 0
        const source = mode === 'hide' ? TUCKED_SVG : (isUp ? STRIDE_UP_SVG : STRIDE_SVG)[beat]!
        const before = Math.round(pos * 1000)

        return (
          <Box flexDirection="row" width="100%" alignItems="center">
            <Box flexGrow={before} />
            <Svg source={source} alt="A small pixel turtle walking along" width={16 * PX} height={BAND_H} />
            <Box flexGrow={1000 - before} />
          </Box>
        )
      }

      walk?.cancel()
      walk = undefined

      const card = (source: string, alt: string, title: string, note: string, titleColor = WALNUT) => (
        <Box flexDirection="row" alignItems="center" gap={2} paddingLeft={1}>
          <Svg source={source} alt={alt} width={16 * PX} height={BAND_H} />
          <Box flexDirection="column">
            <Text color={titleColor} bold>
              {title}
            </Text>
            <Text color={MUTED}>{note}</Text>
          </Box>
        </Box>
      )

      if (mood?.kind === 'happy') {
        return card(HAPPY_SVG, 'A happy pixel turtle, hopping', 'turtle', mood.note, SAGE)
      }

      if (mood?.kind === 'stopped') {
        return card(TUCKED_SVG, 'A pixel turtle tucked into its shell', 'turtle', mood.note, MUTED)
      }

      if (mood?.kind === 'sleepy') {
        return card(TUCKED_SVG, 'A pixel turtle asleep in its shell', 'z z z', mood.note, MUTED)
      }

      if (await read($, isGreeted)) {
        return next(e)
      }

      return card(STILL_SVG, 'A pixel turtle', 'turtle', 'slow and steady')
    }

    // ---- The terminal ----
    const { Box, Text } = $.ui.resolve(e)

    const cells = (row: Cell[]) =>
      row.map((cell, x) => (
        <Text key={`c${x}`} color={cell.color} backgroundColor={cell.backgroundColor}>
          {cell.glyph}
        </Text>
      ))

    if (e.props.isWorking) {
      if (e.props.bodyColumns < 24) {
        return next(e)
      }

      // The stride quickens with the pace; while hiding he stays where he is.
      if (walk === undefined || walkMs !== pace.stepMs) {
        walk?.cancel()
        walkMs = pace.stepMs
        walk = $.clock.every(walkMs, () => {
          if (mode !== 'hide') {
            step += 1
          }
          $.ui.invalidate('ui.render')
        })
      }

      const columns = e.props.bodyColumns - 1
      // Walks in from the left edge, off the right one, and round again.
      const offset = (step % (columns + WIDTH)) - WIDTH
      const from = Math.max(0, -offset)
      const to = Math.min(WIDTH, columns - offset)
      const rows = mode === 'hide' ? TUCKED : STRIDE[step % 4]!
      const word = mode === 'hop' ? ' ✓' : mode === 'hide' ? ' ✗' : ''
      const hasWord = word !== '' && to === WIDTH && offset + WIDTH + 2 < columns

      return (
        <Box flexDirection="column">
          {rows.map((row, y) => (
            <Text key={`w${y}`}>
              {' '.repeat(Math.max(0, offset))}
              {cells(row.slice(from, to))}
              {y === 1 && hasWord ? (
                <Text color={mode === 'hop' ? SAGE : RED} bold>
                  {word}
                </Text>
              ) : (
                ''
              )}
            </Text>
          ))}
        </Box>
      )
    }

    walk?.cancel()
    walk = undefined
    step = 0

    if (e.props.bodyColumns < 40) {
      return next(e)
    }

    const card = (rows: Cell[][], title: string, note: string, titleColor = WALNUT) => {
      const caption = ['', title, note, '']

      return (
        <Box flexDirection="column">
          {rows.map((row, y) => (
            <Text key={`r${y}`}>
              {'  '}
              {cells(row)}
              {'   '}
              {y === 1 ? (
                <Text color={titleColor} bold>
                  {caption[y]}
                </Text>
              ) : (
                <Text color={MUTED}>{caption[y] ?? ''}</Text>
              )}
            </Text>
          ))}
        </Box>
      )
    }

    if (mood?.kind === 'happy') {
      return card(TURTLE, 'turtle ♥', mood.note, SAGE)
    }

    if (mood?.kind === 'stopped') {
      return card(TUCKED, 'turtle', mood.note, MUTED)
    }

    if (mood?.kind === 'sleepy') {
      return card(TUCKED, 'z z z', mood.note, MUTED)
    }

    if (await read($, isGreeted)) {
      return next(e)
    }

    return card(TURTLE, 'turtle', 'slow and steady')
  })
}
