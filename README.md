# DEMO DISC VOL. 1

An old-school demo disc of playable spoof mobile games, built from the ad parodies in this project.
Boots with the ZANEPAUL STUDIO splash (it doesn't stay STUDIO for long), then one tile per game: swipe left/right and each tile plays that game's spoof ad; tap the tile to play the game.

Open `index.html` in a browser (no build step, no dependencies), or serve the folder with any static server.

## On the disc
| | | |
|---|---|---|
| **PLAY** | **ONLY 1% CAN SAVE HIM** | Pin puzzle with real liquid physics: lava + water = stone, lava melts gold, lava on the knight = FAIL. 3 levels. Fail a level 3 times and the knight gives up on you and solves it himself. |
| **PLAY** | **STICK SWARM 3D** | Crowd runner: steer through math gates, dodge saws, out-number the giant. 3 levels. Winning has a price. |
| **PLAY** | **PARKING JAM** | The ad: Gary unjams a parking lot, then the planet. The game: a gem match-3 with no cars in it. 3 levels. |
| **PLAY** | **HAIR SALON ASMR** | Drag the clippers. Each level's clippings become the next level's hair: customer, salon, dog, town, Earth. 5 levels. |
| **PLAY** | **THE BOSS'S BAD DAY** | You are the dragon, and your daughter loves the knight. Let him win, but keep it dramatic: near-miss fire, roars, a lowered head. 3 levels. |
| **PLAY** | **THE LAST NOTE** | 1-bit rhythm tiles at a funeral. On the beat is solemn; a little late is GROOVE and rolls the casket to the door. Land the last note on the beat. 3 levels. |


## Controls
- **Menu:** swipe or ← → to change game, tap / Enter / A to play.
- **Only 1%:** tap a pin or the lever. Keys `1`–`3` pull pins in order. Enter retries, `H` asks the knight for help after 3 fails.
- **Stick Swarm:** drag left/right, or ← → / A D, or the gamepad stick.
- **Esc** in any game returns to the disc menu.

## Layout
```
index.html            splash + swipeable game tiles (touch, keyboard, gamepad)
shared/engine.js      fixed-timestep loop, unified input, Web Audio synth, test hook
games/only1/          pin puzzle (particle liquids)
games/stickswarm/     crowd runner (pseudo-3D)
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
- every runner level is won by best-gate play and lost by worst-gate play
- nothing logs an error
