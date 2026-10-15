# DEMO DISC VOL. 1

An old-school demo disc of playable spoof mobile games, built from the ad parodies in this project.
Boots with the ZANEPAUL STUDIO splash (it doesn't stay STUDIO for long), then one tile per game: swipe left/right and each tile plays that game's spoof ad; tap the tile to play the game.

Open `index.html` in a browser (no build step, no dependencies), or serve the folder with any static server.

## On the disc
| | | |
|---|---|---|
| **PLAY** | **ONLY 1% CAN SAVE HIM** | Pin puzzle with real liquid physics: lava + water = stone, lava melts gold, lava on the knight = FAIL. 3 levels. Fail a level 3 times and the knight gives up on you and solves it himself. |
| **PLAY** | **STICK SWARM 3D** | The ad: twenty thousand stickmen run through math gates. The game: a 2D sort puzzle with a few stickmen lying in jars. One colour per jar. 3 levels. |
| **PLAY** | **PARKING JAM** | The ad: Gary unjams a parking lot, then the planet. The game: a gem match-3 with no cars in it. 3 levels. |
| **PLAY** | **BLOCKING** | Stage-blocking puzzle: drag the actors so every seat in the house sees every actor. Seats go red while a sightline is cut. A small nudge isn't a stagger. 4 scenes, the last on a thrust stage. |
| **PLAY** | **HAIR SALON ASMR** | Real haircuts, with the rituals: cape on, pump the chair to the customer's height (a timing minigame: full strokes only when the pedal is back up, hold RELEASE if you overshoot, hold it in the green), spray the hair; afterwards brush the neck, cape off, clean the clippers. Each customer brings a goal photo: a guard per zone (top, sides, low sides). Snap on a guard (0, 1, 2, 3, 4, 6, 8; each clicks on and cuts to its own length), shave, hit DONE. Hair only gets shorter, but a bad cut never blocks you: move on or try again. 5 customers. |
| **PLAY** | **THE BOSS'S BAD DAY** | You are the dragon, and your daughter loves the knight. Let him win, but keep it dramatic: near-miss fire, roars, a lowered head. 3 levels. |
| **PLAY** | **THE LAST NOTE** | 1-bit rhythm tiles at a funeral. On the beat is solemn; a little late is GROOVE and rolls the casket to the door. Land the last note on the beat. 10 funerals, each with the late guest's request: ten original songs in 1980-2020 styles. |
| **PLAY** | **THIRSTY** | Sketchbook draw-physics: draw lines to steer the water into the glass, then close the tap. Leave it running and he grabs your pencil and drinks until he pops. Stars for less ink. 4 levels. |
| **PLAY** | **VEER** | The ad: a bright draw-the-path puzzle. The game: you and a friend are separated in fog, and you find them by ear. Whistle, listen for the answer (panned, fainter with distance, duller through trees), walk. With no sun you drift in circles without feeling it; a whistle carries 1.3 km in the open but ~150 m in deep woods. 7 levels. |


## Controls
- **Menu:** swipe or ← → to change game, tap / Enter / A to play.
- **Only 1%:** tap a pin or the lever. Keys `1`–`3` pull pins in order. Enter retries, `H` asks the knight for help after 3 fails.
- **Hair Salon:** tap through each ritual step (chair: tap to pump, hold RELEASE or ↓ to lower), then drag to shave. Tap a guard in the tray, or keys `0`–`8` / Tab. Enter or DONE finishes the cut.
- **Veer:** hold to walk, drag sideways to turn, tap WHISTLE. Keys: ↑/W walk, ← → turn, Space whistle. Headphones help.
- **Blocking:** drag an actor, or `1`–`4` / Enter to pick one and arrows to walk them. Space or the button raises the curtain.
- **Stick Swarm:** tap a jar, then tap where its top stickman goes. Keys: ← → and Enter, `U` undo, `R` restart.
- **Esc** in any game returns to the disc menu.

## Layout
```
index.html            splash + swipeable game tiles (touch, keyboard, gamepad)
shared/engine.js      fixed-timestep loop, unified input, Web Audio synth, test hook
games/only1/          pin puzzle (particle liquids)
games/stickswarm/     stickman sort puzzle
games/blocking/       stage-blocking sightline puzzle
games/veer/           foggy walk-and-whistle game
trailers/             the spoof ads (mp4) + poster frames
tests/smoke.mjs       boot + completability tests (Playwright)
```

## Tests
```
node tests/smoke.mjs
```
Steps each game's simulation directly through `window.__game` (no real-time waits) and checks that:
- every menu entry resolves
- every pin-puzzle level is won by its solution, lost by each trap, and solved by the knight's hint
- every stick swarm level deals a solvable board and is sorted by the solver's moves
- every salon customer is satisfied by cutting to their order, each guard leaves its own length, and a too-short cut scores no stars but still moves on
- every veer level is found by an autopilot that only whistles, listens and walks (and the sound and drift models check out)
- every blocking scene refuses its opening layout and is won by its solution
- nothing logs an error
