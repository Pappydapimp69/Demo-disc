# DEMO DISC VOL. 1

An old-school demo disc of playable spoof mobile games, built from the ad parodies in this project.
Boots with the ZANEPAUL STUDIO splash (it doesn't stay STUDIO for long), then one tile per game: swipe left/right and each tile plays that game's spoof ad; tap the tile to play the game.

Open `index.html` in a browser (no build step, no dependencies), or serve the folder with any static server.

## On the disc
| | | |
|---|---|---|
| **PLAY** | **ONLY 1% CAN SAVE HIM** | Pin puzzle with real liquid physics: lava + water = stone, lava melts gold, lava on the knight = FAIL. 3 levels. Fail a level 3 times and the knight gives up on you and solves it himself. |
| **PLAY** | **STICK SWARM 3D** | The ad: twenty thousand stickmen run through math gates. The game: a 2D sort puzzle with a few stickmen lying in jars. One colour per jar; a finished jar's crew stands up and cheers. Hints from the built-in solver, stars against its par. 8 levels, up to 8 colours, tall jars and a one-spare-jar level. |
| **PLAY** | **PARKING JAM** | The ad: Gary unjams a parking lot, then the planet. The game: a gem match-3 with no cars in it. 3 levels. |
| **PLAY** | **BLOCKING** | Stage-blocking puzzle: drag the actors so every seat in the house sees every actor. Seats go red while a sightline is cut. A small nudge isn't a stagger. 4 scenes, the last on a thrust stage. |
| **PLAY** | **HAIR SALON ASMR** | Real haircuts, with the rituals: cape on, pump the chair to the customer's height (a timing minigame: full strokes only when the pedal is back up, hold RELEASE if you overshoot, hold it in the green), spray the hair; afterwards brush the neck, cape off, clean the clippers. Each customer brings a goal photo: a guard per zone (top, sides, low sides). Snap on a guard (0, 1, 2, 3, 4, 6, 8; each clicks on and cuts to its own length), shave, hit DONE. Hair only gets shorter, but a bad cut never blocks you: move on or try again. 5 customers. |
| **PLAY** | **THE BOSS'S BAD DAY** | You are the dragon, and your daughter loves the knight. Let him win, but keep it dramatic: near-miss fire, roars, a lowered head. Your daughter reacts to all of it from her cage. 3 levels. |
| **PLAY** | **THE LAST NOTE** | 1-bit rhythm tiles at a funeral. On the beat is solemn; a little late is GROOVE and rolls the casket to the door. Land the last note on the beat. 10 funerals of about a minute each, starting slow and speeding up; each late guest requests a famous public-domain tune in their favourite era's style (Ode to Joy as '84 synth-pop, the Mountain King as a '95 rave, Chopin's Funeral March with a drop). |
| **PLAY** | **THIRSTY** | Sketchbook draw-physics: draw lines to steer the water into the glass, then close the tap. Leave it running and he grabs your pencil and drinks until he pops. Stars for less ink. 4 levels. |
| **PLAY** | **SOAP OPERA SOLITAIRE** | Ukiyo-e TriPeaks: every card you uncover flips with a soap-opera revelation, and the wild Joker on the middle peak has an announcement. Every deal is solver-checked winnable. 3 seasons. |
| **PLAY** | **THE INTERN** | Neon tower defence, framed as a creator video. The intern keeps moving your towers: tap his hand to swat it. Under 40% server HP you can unplug the server: wave cleared, technically, one star. 3 days. |
| **PLAY** | **STONEWAKE** | A pixel RPG vertical slice: walk the village, forest, crystal cave and dunes, collect the titan's three heart shards and a party of four, timed-hit turn-based battles (tap as the ring closes, tap to block). At the titan: fight it or calm it, two endings. |
| **PLAY** | **VEER** | The ad: a bright draw-the-path puzzle. The game: you and a friend are separated in fog, and you find them by ear. Whistle, listen for the answer (panned, fainter with distance, duller through trees), walk. With no sun you drift in circles without feeling it; a whistle carries 1.3 km in the open but ~150 m in deep woods. 7 levels. |
| **PLAY** | **EMBERS** | The ad: tap the fire, grow the fire, scare the wolves. The game: a night watch where the fire is the danger. Your eyes take minutes to adjust to the dark; a glance at the fire costs about 2 night-minutes of sight, a stare about 17. Warm your hands too little and you freeze, too long and you are blind when they come. A red torch shows only what is close and costs no sight. 5 nights. |
| **PLAY** | **GOING UP** | The ad: stack the tallest tower. The game: run the lifts inside it. Tap a lift, tap a floor; doors open, people get on and off, their floors light up. Always going to the nearest request keeps the busy floors happy and strands the far floor until they take the stairs; a sweep bounds everyone's wait. AUTO switches run either rule (and cap you at two stars). 5 days. |
| **PLAY** | **FARO** | The ad: find the ace, hit the jackpot. The game: a quiet puzzle of perfect shuffles. OUT keeps the top card on top, IN tucks it to second; send the ace to the gold slot (write the position in binary: 1 = IN, 0 = OUT), and put a 52-card deck back in order (eight OUT faros do it). 5 hands. |


## Controls
- **Menu:** swipe or ← → to change game, tap / Enter / A to play.
- **Only 1%:** tap a pin or the lever. Keys `1`–`3` pull pins in order. Enter retries, `H` asks the knight for help after 3 fails.
- **Hair Salon:** tap through each ritual step (chair: tap to pump, hold RELEASE or ↓ to lower), then drag to shave. Tap a guard in the tray, or keys `0`–`8` / Tab. Enter or DONE finishes the cut.
- **Faro:** tap OUT or IN. Keys: O/← out, I/→ in, U undo, R reset.
- **Going Up:** tap a lift to pick it, tap a floor to send it; AUTO buttons run a rule. Keys: ↑ ↓ send, Tab switch lift, N/S/M rules.
- **Embers:** drag to look around, tap what you see, hold WARM HANDS to look at the fire, RED TORCH toggles. Keys: ← → look, ↓ warm, Space shoo, T torch.
- **Veer:** hold to walk, drag sideways to turn, tap WHISTLE. Keys: ↑/W walk, ← → turn, Space whistle. Headphones help.
- **Blocking:** drag an actor, or `1`–`4` / Enter to pick one and arrows to walk them. Space or the button raises the curtain.
- **Stick Swarm:** tap a jar, then tap where its top stickman goes. HINT shows a good next move (3 per level). Keys: ← → and Enter, `U` undo, `H` hint, `R` restart.
- **Esc** in any game returns to the disc menu.

## Layout
```
index.html            splash + swipeable game tiles (touch, keyboard, gamepad)
shared/engine.js      fixed-timestep loop, unified input, Web Audio synth, test hook
games/only1/          pin puzzle (particle liquids)
games/stickswarm/     stickman sort puzzle
games/blocking/       stage-blocking sightline puzzle
games/veer/           foggy walk-and-whistle game
games/embers/         night-watch survival with dark adaptation
games/goingup/        elevator dispatch
games/faro/           perfect-shuffle card puzzle
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
- every faro hand is solved at par, and the binary rule and restore counts check out
- every going-up day is finished by the sweep rule, and nearest-first strands the top floor
- every embers night is survived by medium looks at the fire, while only-glancing freezes and staring gets hurt
- every veer level is found by an autopilot that only whistles, listens and walks (and the sound and drift models check out)
- every blocking scene refuses its opening layout and is won by its solution
- nothing logs an error
