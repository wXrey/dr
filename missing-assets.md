# Missing and re-do assets

Drop each file into the folder shown, using the given name (or any name containing the keyword).
The watcher (`npm run assets:watch`) processes it immediately. All sprite prompts use a flat
magenta background, which the pipeline removes.

---

## 1. Missing — needed now

### items/soul-gems.jpg — 16:9
```
Game pickup sheet for a dark gothic game, three separate glowing soul crystals laid out left to right with wide gaps: small green crystal, medium blue crystal, large gold crystal, each faceted and softly glowing, same viewing angle, painterly hand-painted style, solid flat magenta background, no text
```

### items/relic-chest.jpg — 1:1
```
Dark gothic ornate reliquary chest of black iron and gold, lid closed, faint golden light leaking from the seams, 3/4 top-down view, centered, filling 70% of the frame, painterly hand-painted style, muted palette with gold accents, soft rim light, solid flat magenta background, no shadow, no text, game asset
```

### items/trait-icons.jpg — 16:9
Shown on the level-up cards, in this exact order.
```
Set of 11 square game trait icons in a dark gothic style, arranged in 3 rows (4, 4, 3) with wide gaps: crossed swords for might, a blood-red star burst for ferocity, a swift motion-blurred blade for haste, a skull with an axe for executioner, an anatomical heart for vitality, an iron scale plate for ironskin, a glowing green cross for regeneration, a winged boot for fleet foot, a long sword sweeping an arc for reach, a soul-pulling horseshoe magnet for soul magnet, a rolling figure for tumbler, each inside a dark ornate iron frame, painterly hand-painted style, muted palette with deep red accents, solid flat magenta background, no text
```

### items/relic-icons.jpg — 16:9
```
Set of 15 square game relic icons in a dark gothic style, arranged in 3 rows of 5 with wide gaps: gravedigger whetstone, black powder horn, bronze death bell, executioner seal ring, broken tower shield, quickdraw charm on a chain, glowing wolf heart, silver wolf fang, beast hide pelt, rot censer, martyr's chalice, ash scripture book, ash crown, bishop's rosary, bone key, each inside a dark ornate gold frame, painterly hand-painted style, muted palette, solid flat magenta background, no text
```

### screens/main-menu.jpg — 16:9
```
Dark gothic key art, a lone hooded knight with a red scarf standing before a ruined black cathedral at night under a blood-red moon, graveyard in the foreground, fog, ravens circling, wide cinematic composition with empty dark space in the center for a title, painterly hand-painted style, muted desaturated palette with deep red accents, no text
```

### screens/loading.jpg — 16:9
```
Dark gothic illustration, an ornate reliquary chest on a cathedral altar surrounded by melted candles and falling ash, dramatic golden light, wide cinematic composition, painterly hand-painted style, muted palette with gold and deep red accents, no text
```

### props/forest-props.jpg — 16:9
```
Game prop sheet for a dark gothic top-down game, 6 separate isolated objects with wide gaps between them: two twisted root clusters, a giant pale mushroom cluster, a hollow fallen log, a gnarled dead tree, a moss-covered boulder, 3/4 top-down view, all at the same scale, painterly hand-painted style, muted grey-brown palette, solid flat magenta background, no text
```

### props/ash-ruins-props.jpg — 16:9
```
Game prop sheet for a dark gothic top-down game, 6 separate isolated objects with wide gaps between them: two broken stone wall chunks, a collapsed pillar, a smoldering iron brazier, a rubble pile with glowing embers, a charred wooden beam, 3/4 top-down view, all at the same scale, painterly hand-painted style, muted grey and ember-orange palette, solid flat magenta background, no text
```

### props/cathedral-props.jpg — 16:9
```
Game prop sheet for a dark gothic top-down game, 6 separate isolated objects with wide gaps between them: two cracked stone pillars, a cluster of melted candles, a toppled wooden pew, a stone altar, a pile of broken stained glass, 3/4 top-down view, all at the same scale, painterly hand-painted style, muted black-violet and gold palette, solid flat magenta background, no text
```

---

## 2. Re-do — so the animation looks right

The knight is now a cut-out rig: hips, knees, shoulders and elbows move separately, so the body-part
sheets matter more than the full-body sprites. A **fixed grid layout** lets me map pieces
automatically. Keep the row order exactly as written.

### player/knight-light-parts.jpg — 16:9 (replace) — most important
The current sheet has no cloak, so the light knight looks thin and bare next to the full sprite.
```
Game sprite parts sheet for cutout animation, front view, the hooded knight in dark leather armor with a long tattered grey cloak and red scarf, split into separate pieces arranged in a neat grid with wide gaps, all pieces at the same scale: top row: hooded head with shadowed face, leather chest torso with belt, cloak back panel hanging long and tattered, red scarf; middle row: left upper arm with leather sleeve, left forearm with leather bracer and gloved hand, right upper arm with leather sleeve, right forearm with leather bracer and gloved hand; bottom row: left thigh in dark trousers, left shin with tall leather boot, right thigh in dark trousers, right shin with tall leather boot. Rounded overlapping ends at the elbows and knees, painterly hand-painted style, muted desaturated palette with deep red accents, solid flat magenta background, no text
```

### player/knight-heavy-parts.jpg — 16:9 (replace, optional)
The heavy sheet works well; it's just missing upper arms, so the gauntlets hang straight from the pauldrons.
```
Game sprite parts sheet for cutout animation, front view, knight in heavy blackened plate armor with a tattered red tabard and closed helm, split into separate pieces arranged in a neat grid with wide gaps, all pieces at the same scale: top row: closed helmet, breastplate torso, long red cape back panel, red tabard front panel; middle row: left pauldron, left upper arm in chainmail sleeve, left gauntlet forearm with fist, right pauldron, right upper arm in chainmail sleeve, right gauntlet forearm with fist; bottom row: left thigh plate, left greave with sabaton, right thigh plate, right greave with sabaton. Rounded overlapping ends at the elbows and knees, painterly hand-painted style, muted palette with deep red accents, solid flat magenta background, no text
```

### pets/raven-wings-up.jpg and pets/raven-wings-down.jpg — 1:1 each
Two poses so the raven actually flaps.
```
Dark gothic game pet, the same black raven with glowing red eyes, flying, side view facing right, wings raised fully UP above the body, centered, painterly hand-painted style, muted palette with red accents, soft rim light, solid flat magenta background, no shadow, no text, game asset
```
```
Dark gothic game pet, the same black raven with glowing red eyes, flying, side view facing right, wings swept fully DOWN below the body, centered, painterly hand-painted style, muted palette with red accents, soft rim light, solid flat magenta background, no shadow, no text, game asset
```

### weapons/flintlock-pistol.jpg — 1:1 (replace, optional)
Every other weapon points up-right, but this one faces left. The code compensates, but matching orientation is cleaner.
```
Dark gothic flintlock pistol, dark wood stock, engraved tarnished brass fittings, laid diagonally with the grip at the bottom-left and the muzzle pointing to the top-right, centered, painterly hand-painted style, muted palette, soft rim light, solid flat magenta background, no text, game item asset
```

---

## 3. Optional — limb animation for the common enemies

Enemies currently animate as whole sprites: waddle, lean, lunge, flash on hit, fall over on death. Part
sheets for the two most common enemies would give them real walk cycles (same rig as the knight).

### enemies/skeleton-parts.jpg — 16:9
```
Game sprite parts sheet for cutout animation, front view, shambling skeleton warrior with a rusty sword, split into separate pieces arranged in a neat grid with wide gaps, all pieces at the same scale: top row: skull, ribcage torso with spine, pelvis, rusty sword; middle row: left upper arm bone, left forearm bones with bony hand, right upper arm bone, right forearm bones with bony hand; bottom row: left thigh bone, left shin bones with bony foot, right thigh bone, right shin bones with bony foot. Painterly hand-painted style, muted desaturated palette, solid flat magenta background, no text
```

### enemies/zombie-parts.jpg — 16:9
```
Game sprite parts sheet for cutout animation, front view, bloated rotting zombie peasant in torn clothes, split into separate pieces arranged in a neat grid with wide gaps, all pieces at the same scale: top row: head, torso with torn shirt; middle row: left upper arm, left forearm with clawed hand, right upper arm, right forearm with clawed hand; bottom row: left thigh in torn trousers, left shin with bare foot, right thigh in torn trousers, right shin with bare foot. Painterly hand-painted style, muted desaturated greenish palette, solid flat magenta background, no text
```

---

## 4. Not needed from Grok

Bullets, tracers, muzzle flashes, sparks, blood, bone chips, slashes and dust are generated in code and
already look right.
