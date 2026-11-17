# Turtle

A Claude Code plugin: a forest-and-walnut look, and a small pixel turtle who keeps you company above the prompt. Works in the terminal and in the desktop and mobile apps.

## What he does

- **Walks while Claude works**, from one side of the band to the other.
- **Walks faster when Claude is busy.** Three or more tool calls in 30 seconds and he picks up the pace; six or more and he hurries.
- **Hops when a check passes** and hides in his shell when one fails. A check is any command that tests, builds, lints or type-checks.
- **Celebrates when a turn finishes**, with how long it took. If the turn was stopped, he tucks in.
- **Naps** after five minutes with nothing happening, and wakes when you send a message.
- **Keeps time.** After 10 seconds of a turn, the status line shows how long he has been walking.
- **Waits with long tool calls.** Any call running over 5 seconds gets a "still going" line under it.
- **Makes a soft plop** when a turn finishes.

## Commands

| Command | What it does |
|---|---|
| `/turtle` | A random turtle fact |
| `/turtle sound off` | Turns the sound off. The choice is remembered |
| `/turtle sound on` | Turns the sound back on |
| `/turtle theme off` | Returns the desktop and mobile apps to their own colours. Remembered |
| `/turtle theme on` | Brings the turtle's colours back |

## Install

```bash
claude plugin marketplace add ThePotatoTurtle/turtle
```

```bash
claude plugin install turtle@turtle
```

Restart Claude Code afterwards. To pick up a new version later:

```bash
claude plugin update turtle@turtle
```

## Colours

**Desktop and mobile apps.** The plugin recolours the app, on by default:

- **Dark mode:** deep forest green throughout, cream text, walnut accents, sage green for success. The page, cards and message box are one colour, with no lighter boxes.
- **Light mode:** warm cream paper with forest green ink and deeper walnut accents.

The app follows your own light or dark setting. `/turtle theme off` turns the colours off. Note that this clears the app's look whichever plugin set it.

**Terminal.** The plugin includes a dark terminal theme named "Turtle" (`themes/turtle.json`) in the same palette. Choose it with `/theme`.

## Notes

- **Sound:** plays in the desktop app and in a macOS terminal. Windows and Linux terminals have no player, so they stay silent.
- **Reduced motion:** the hop animations stop when your system asks for reduced motion.
- **Terminal:** the turtle is drawn from half-block characters, so the band needs at least 24 columns to show him walking and 40 to show the greeting.

## Layout

| Path | What |
|---|---|
| `.claude-plugin/plugin.json` | Name, version, description |
| `.claude-plugin/marketplace.json` | Lets the repository be added as a marketplace |
| `hooks/register.tsx` | Everything the turtle does, and the app colours |
| `hooks/make-colors.js` | Claude Code's own colour builder, copied in unchanged. Don't edit it |
| `types/index.d.ts` | The one value the plugin keeps in session state |
| `themes/turtle.json` | The terminal theme |
| `sounds/done.wav` | The plop |

To release a change, raise `version` in `.claude-plugin/plugin.json`, commit and push.
