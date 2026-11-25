# Tandon Residence — Interactive 3D Walkthrough

An interactive, browser-based 3D model of **Pratik Tandon's Residence, Bilaspur** (Ar. Mithlesh Sinha). It was reconstructed from the 2D floor plans in `PRATIK TANDON.pdf` (G + 2 floors + terrace) and built with **Three.js** and **Vite**. The structured data model is authored in **metres**. The original imperial drawing labels are kept for reference only.

## Quick start

Requirements: Node.js 18+ (tested with Node 24) and a WebGL2-capable browser.

```bash
cd house3d
npm install          # installs three + vite
npm run dev          # http://localhost:5173 (also printed with your LAN IP for phones)
npm run build        # production build -> dist/ (static files, relative paths)
npm run preview      # serve the production build
npm run validate     # architectural/model validation -> VALIDATION_REPORT.md
```

> If your npm is configured for a private registry that rejects the install, run
> `npm install --registry=https://registry.npmjs.org/`.

`dist/` is fully static, so you can host it on any web server or static host. All textures are generated procedurally at runtime, so the app makes no external network requests.

## Free hosting (Vercel or Netlify)

The app builds to static files in `dist/` (no server needed), and both configs are included: [`vercel.json`](vercel.json) and [`netlify.toml`](netlify.toml) (Node 20, public npm registry, long-cache headers for hashed assets).

**Vercel**
1. Push this repo to GitHub.
2. At https://vercel.com/new, import the repo. Framework, build command and output directory are read from `vercel.json`.
3. Click **Deploy**. You get `https://<project>.vercel.app`.

**Netlify**
1. Push this repo to GitHub.
2. At https://app.netlify.com/start, import the repo. Build settings are read from `netlify.toml`.
3. Click **Deploy**. You get `https://<site>.netlify.app`.

**Without GitHub:** run `npm run build`, then drag the `dist/` folder onto https://app.netlify.com/drop.

**From the CLI:** `npx vercel --prod`, or `npx netlify-cli deploy --build --prod`.

## Features

| Feature | How |
|---|---|
| Structured data model (metres) | [`src/data/house.json`](src/data/house.json): levels, rooms, walls with openings, slabs and voids, stairs, railings, furniture, decor, presentation viewpoints, assumptions and inconsistencies |
| Cinematic presentation | 16 curated shots (exterior, then every main room) with slow dolly moves, fade transitions, lower-third captions, pause/skip and "Explore here" to continue on foot |
| Interior themes | **Modern Luxury**, **Minimalist Contemporary**, **Warm Scandinavian**. Switching takes about 1 s with no reload: shared materials are updated in place and unused theme textures are freed |
| Materials | Procedural, tileable PBR maps (albedo, normal, roughness): plank-staggered wood with grain and bevels, domain-warped marble slabs, limestone/porcelain, boucle and woven fabrics with sheen, fluted walnut and slatted oak panels, terrazzo. Glass uses a physical material with IBL reflections |
| Natural light | Physical sky, a sun with soft PCF shadows (default azimuth assumes the road faces south), rect-area "window light" at each room's main glazing, and a warm ceiling bounce. Presets: **Day / Golden hour / Twilight** |
| Artificial light | Downlights, pendants, chandelier, table and floor lamps (emissive), plus a pooled set of warm point lights reassigned per floor. Colour temperature is set by the theme (2700-3500 K) |
| Reflections and AO | Per-floor environment maps baked from the real model (cube camera → PMREM, re-baked lazily after theme or time changes). GTAO ambient occlusion (glass excluded), subtle bloom, 4× MSAA. Live mirror reflections in the gym |
| Decor and balance | Artwork in theme colours, curtains at bedroom, office and living windows, scatter cushions, throws, vases, books, fruit bowls, lamps, and richer foliage |
| First-person navigation | Eye height 1.60 m, 60-84° FOV fitted to the screen, eased acceleration and braking, damped look, eye height smoothed on stairs. Guided walks steer with look-ahead and ease in and out |
| Plan, orbit, guided walk, mini-map, collision, touch | As before, now reporting metric sizes (m, m²) |
| Validation | `npm run validate` plus the in-app **Specs & checks** panel |

### Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | W A S D / arrow keys (Shift = run) | Left joystick |
| Look | Click the view to capture the mouse (Esc releases), or drag | Drag the right half of the screen |
| Change view | `1` Walk · `2` Plan · `3` Orbit · `P` Presentation (←/→ shots, Space pause, Esc exit) | Top bar |
| Change floor | Walk the stairs, use the level buttons, or PgUp / PgDn (guided walk) | ▲ / ▼ Floor buttons |
| Go to a room | Room list → Go, or click a room in Plan / mini-map → Walk there | Same |

## Client customisations (v2)

| Area | Change |
|---|---|
| GF store (6'-6" × 8'-0") | Now a **Utility / Laundry**: stacked washer-dryer, sink on a terrazzo counter with backsplash, tall storage, upper cabinets, terrazzo floor and a window. It has a door from the kitchen and a **second door to the green area**. |
| GF open kitchen | Laid out as drawn: rear counter with the hob, a tall fridge unit at the right, a **peninsula from the courtyard wall with the sink**, a lower breakfast table with 3 stools, and a wash basin on the dining glass wall. |
| GF living | Laid out as drawn: **L-shaped sofa** against the east wall and glass partition, an armchair, a **centre coffee table**, a 2-seater by the entrance and the TV console on the courtyard wall. The L-sofa gets an L-shaped collision footprint, so you can walk into its inside corner. |
| GF common toilet | Now **entered from the living / foyer** through its north wall, as drawn. It has a WC and a vanity on the rear wall; the porch-side wall is solid. |
| SF balcony | **Snooker lounge**: 8' table with balls and cue, a pendant light and a wall cue rack. |
| Terrace living | **Gym**: rubber floor, a 15' **live-reflection mirror wall** with a clerestory above, a **hanging boxing bag**, treadmill, bench with barbell, dumbbell rack and yoga mats. The kitchen island follows the terrace plan. |

## Presentation upgrade (v3)

- **Metric data model**: `house.json` converted from feet to metres (exact ×0.3048, mm precision). All UI, plan labels, the HUD, specs and the validator now report m and m².
- **Layout preserved**: no wall, opening, room or level changed. The one data correction follows the drawing: the GF bedroom south wall has **two** windows either side of a solid section holding the TV unit, where v2 had a single central window (I17).
- **Furniture corrected to the plans**:
  - GF bedroom: bed on the north wall with nightstands, 2-seater and console on the east wall, TV unit on the south wall.
  - GF toilet: WC and basin on the east wall, shower on the west.
  - SF guest room: sofa on the west wall; the wardrobe, which is not drawn, was removed.
  - SF bedroom: two armchairs and a round table by the front window.
  - Dining table centred as drawn.
  - Proportions follow standard dimensions: seat 0.45 m, dining table 0.75 m, counter 0.90 m, wardrobe 2.40 m.
- **No new property features**: everything added is movable staging (art, curtains, decor, lamps). The intro and specs carry a staging disclaimer, and areas are labelled indicative (sum of modelled clear room areas, not a saleable area).

## Elevation, kitchen and bedroom upgrade (v4)

| Area | Change |
|---|---|
| Front elevation | Styled after the client reference and the architect's render (PDF p.1): dark stone cladding on the street faces, charcoal render, black slab-edge bands, timber/bronze vertical fins with uplight washes, a geometric laser-cut jali on the FF balcony, a dark FF balcony fascia with trailing planters, timber soffits with downlights over the porch and parking, a ceiling fan, stone gate pillars with slatted infill panels, an uplit planter, slatted black-framed pedestrian and car gates, a number/name pillar with a wall light, and palms |
| Slanted slab | The terrace-level roof frame has a timber soffit that rises from the building face to a thin outer edge. Its left end is a wedge whose underside slopes up to a knife edge, as in the render. The right side is a full-height dark frame with a timber-clad inner face and an LED wash |
| Green area → outside | The wall stub west of the GF common toilet (not on the drawing) is removed. The courtyard now continues through a 0.84 m stone passage into the front yard, and is walkable and listed as "Courtyard Passage" |
| Luxury modular kitchen | Same footprint and layout as drawn: rear-wall run plus peninsula. Finishes follow the reference photo: high-gloss lacquer shutters, bronze J-profile handles, black-and-gold marble backsplash, lit glass display uppers, chimney hood over the hob, a lit open-shelf tall unit, an integrated tall fridge unit with a fluted-glass top, and under-cabinet LED. Each theme has its own kitchen palette |
| TVs | Living rooms (GF, FF, terrace gym/living) and all bedrooms (GF, FF, SF master and the SF guest room) have a TV showing an ambient-mode picture, with a back-light glow |
| Round beds | FF and SF master bedrooms: round upholstered bed with channel segments, round mattress, rectangular channel-tufted headboard, layered pillows and a throw. Also an upholstered panel wall with LED edges, a circular cove ceiling and a round rug (per the reference photo) |
| Correction | The GF kitchen rear wall is drawn solid, so the window assumed in v1–v3 is removed (I18) |

## Central air-conditioning and roof water tanks (v5)

**VRV/VRF system**: two outdoor systems, so a fault affects only half the house. Sizing comes from [`src/core/hvac.js`](src/core/hvac.js) and is checked by `npm run validate`.

| System | Serves | Outdoor unit | Indoor units connected | Connection ratio |
|---|---|---|---|---|
| ODU-1 | GF + FF | 20 HP / 56 kW | 12 cassettes = 69.0 kW | 123% |
| ODU-2 | SF + Terrace | 14 HP / 40 kW | 8 cassettes = 47.2 kW | 118% |

- **Cooled spaces:** living, dining, both kitchens, all bedrooms, dressings, office, lobbies and the terrace gym. Toilets, utility, stores, stair and open balconies are ventilated, not cooled.
- **Indoor units:** 20 ceiling cassettes, round-flow (950 mm panel) or compact (620 mm). They are placed by load and throw radius, clear of beds, pendants, the chandelier, cove ceilings and the atrium void. Ceiling downlights are moved off the cassettes.
- **Outdoor units:** on galvanised frames against the rear parapet of the open terrace, with open sky above for discharge and front service space. They have colliders, so you can't walk through them.
- **Refrigerant risers:** run in the plumbing shaft. The *AC & water services (X-ray)* toggle shows the per-floor refrigerant routing (orange = system 1, teal = system 2) and the water downtake (blue).
- **Room loads:** every room card and the HUD show that room's AC units. *Specs & checks* has the full room-by-room load table (kW and TR).

**Water**: two 2,000 L overhead tanks (≈1.50 m Ø × 1.40 m) on 450 mm RCC pedestals:
- OHT-1 sits over the terrace toilet/shaft roof, so its downtake is short.
- OHT-2 sits over the stair-cabin roof.
- A steel cat ladder with safety hoops gives roof access.
- Each full tank weighs about 2.05 t (≈ 11 kN/m² under the pedestal), so the pedestals must bear on beams; flagged for the structural engineer.

The presentation has a new **Terrace Services** shot. All AC figures are indicative estimates; a consultant's detailed heat-load calculation should confirm them before procurement (A26).

## Shoe bench and pergola (v6)

- **GF living, by the main entrance:** the 2-seater sofa is replaced by an L-shaped built-in shoe rack. It runs along the east wall under the window and turns along the front wall up to the main door. It has two tiers of open cubbies, an upholstered seat pad and scatter cushions. Its finishes follow the selected theme.
- **Terrace:** the pergola moves from the small deck in front of the terrace room to the larger open terrace over the SF bedroom, about 4.6 × 5.1 m. It has four posts, timber rafters, a perimeter frame and downlights, with the outdoor dining set, loungers and planter beneath. The former pergola deck is now plain open terrace with its own table. The posts are colliders, and the deck is reachable from the main gate.

## SF bedroom balcony and west CNC grill (v7)

- **SF bedroom balcony:** a cantilevered balcony (≈ 3.47 × 1.24 m) in front of the second-floor bedroom, styled after the reference. It has a dark fascia, a frameless glass railing with a bronze top rail, planters, an LED wash at the railing base and soffit downlights.
  - Access is through a new sliding door; the rest of the front opening stays a window.
  - The bedroom's sitting corner shifts right to keep the door clear.
  - This matches the projecting balcony in the architect's render (I8 resolved) and needs a structural cantilever.
- **CNC grill:** the open west side of the SF snooker balcony is now screened floor-to-slab by the same laser-cut metal jali used on the facade, with a frame, vertical mullions and a warm uplight. It is also a collider.

## Matching CNC grill (v8)

- The front-left timber fins are replaced by a full-height CNC-cut metal jali spanning the first and second floors. It matches the side grill and acts as a collider.
- All jali screens (front-left, FF balcony and the SF west side) now use a dense interlocking star-lattice pattern, after the client's reference. A warm glow shows through them at twilight.

## Dark exterior (v9)

- The whole exterior follows the client's dark reference:
  - Every outward-facing wall face is clad, including terrace-room, stair-cabin and side walls that were previously light. Street faces get veined dark-grey stone; the rest gets charcoal render.
  - Balcony and overhang undersides are charcoal, except the timber soffits over the porch and parking.
  - Planters are charcoal.
- Timber soffits, the timber side fin, black jali screens and slatted gates provide the warm contrast, and the uplights and downlights read best at Golden hour or Twilight.

## Full-bay front grill (v10)

- At second-floor level the front CNC grill now covers the complete left bay: the full width of the snooker balcony, from the floor up to the slanted timber soffit. It wraps around the corner into the west-side grill.
- At first-floor level the grill stays on the left part, so the living room's sliding door to the front balcony remains usable.

## Living-room window (v11)

- The opening from the GF living room to the green area is now a window (0.91 m sill), not a sliding door, as the client confirmed. The green area is still reached from the front yard passage and from the utility room's door.

## Rendering performance and mobile

Quality is detected automatically. You can override it with `?quality=high|balanced|performance` or from the panel; the choice is remembered.

| Tier | Default on | Pixel ratio | Shadows | Post-processing | Lights | Textures |
|---|---|---|---|---|---|---|
| High | Desktop | up to 2.0 (dynamic down to 1.0) | 2048 soft PCF | MSAA 4×, GTAO, bloom | 8 point + 4 window | 1024 px |
| Balanced | Optional | up to 1.5 | 2048 soft PCF | MSAA 4×, bloom | 6 point + 2 window | 1024 px |
| Performance | Phones, tablets, ≤4 GB RAM or ≤4 cores | up to 1.25 (dynamic down to 0.7) | 1024 PCF | none (direct render) | 3 point | 512 px, low-poly foliage and curves |

- **Geometry**:
  - Architecture is merged per material.
  - Each floor's furniture and decor is baked into one mesh per material, so about 200 draw calls cover the whole house.
  - Rounded and curved parts share cached geometry.
- **Rendering on demand**: frames are drawn only while the camera, a route or the presentation is moving; an idle scene costs no GPU time. The sun shadow map renders only when lighting or visibility changes.
- **Dynamic resolution** keeps the frame rate near 60 fps by scaling the pixel ratio within the tier's range. The live frame rate, draw-call and triangle counts are shown under *Rendering quality*.
- **Textures**: everything is generated on the device, so nothing is downloaded. Repeat scales are physical, and theme switching disposes the previous theme's GPU textures.

**Measured** (headless Chrome on this Mac):
- Desktop High: 60 fps while walking, model ready in about 2 s.
- iPhone-size viewport with 4× CPU throttling: the Performance tier is selected automatically, the model is ready in about 6.5 s, and it runs at 60 fps with about 210 draw calls and 196k triangles.

## Project structure

```
house3d/
├─ index.html               app shell: hero intro, presentation bar, panels
├─ vite.config.js
├─ package.json
├─ scripts/validate.mjs     Node validator (metric input and output) -> VALIDATION_REPORT.md
├─ VALIDATION_REPORT.md
└─ src/
   ├─ main.js               bootstrap, quality tiers, modes, presentation, plan, guided walk, HUD, mini-map
   ├─ style.css             dark-glass UI
   ├─ data/house.json       structured building model in METRES (single source of truth)
   ├─ core/units.js         metric <-> internal unit adapter and metric formatters
   ├─ core/hvac.js          VRV load estimate, unit catalogue, sizing, tank loads (shared with the validator)
   ├─ core/geometry.js      wall splitting, slab decomposition, colliders, walkable surfaces, A*, routing
   ├─ controls/walker.js    first-person controller (eased motion, collisions, autopilot, touch)
   └─ scene/
      ├─ builder.js         walls, openings, slabs, stairs, railings, curtains, window-light placement, exterior
      ├─ furniture.js       procedural furniture and decor library + static mesh merging
      ├─ textures.js        procedural tileable PBR texture generators
      ├─ materials.js       material registry and the three interior themes
      ├─ lighting.js        sky, sun, light pools, time-of-day presets, per-floor environment baking
      └─ post.js            GTAO, bloom, MSAA, output pipeline
```

### Data model (`src/data/house.json`, metres)

- **Units**: `meta.units = "m"`. Every length is in metres to the millimetre: walls, openings, sill and head heights, room rectangles, furniture, stairs, site, exterior and presentation cameras. Unitless fields are `rot` (degrees), `seats`, `sinks`, `risersPerFlight`, `art`, `orbit` and `version`. `planLabel.text` keeps the imperial label exactly as printed on the drawing; `planLabel.w`/`d` hold its value in metres.
- **Coordinates**: `x` runs left→right of the drawn plan, `z` runs rear (z = 0) → road (+z), and `y` is up. Level elevations: GF 0.000, FF 3.200, SF 6.401, Terrace 9.601 m (roof 12.802 m).
- **walls**: axis-aligned boxes `{x1, z1, x2, z2, h?, mat?, openings[]}`. Openings are `{type, from, to, sill?, head?}` along the wall's long axis. Types: `door`, `door2`, `opening`, `slide`, `window`, `vent`, `glazing`, `gate`.
- **rooms**: `{id, name, type, floor, rects[[x1,z1,x2,z2]], planLabel?, outdoor?, accessible?}`.
- **slab**: `rects` minus `holes` (stair core, atrium void), decomposed automatically.
- **furniture**: `{type, room, x, z, w, d, rot}`. `w`/`d` are the world footprint after rotation. Wall art is `{type: "art", h, y, art}`.
- **presentation**: shots for the cinematic tour (`eye`/`look` plan points; exterior `camera`/`target`).
- The engine converts metres to its internal units once at load (`core/units.js`). The validator uses the same adapter, so the JSON is the only source of truth.

## Assumptions

- A1. Units are metres. No overall plot dimensions are given on the drawings. The building envelope (approx. 12.47 m x 15.57 m including the front setback) is derived by chaining the labelled clear room sizes (feet-inches on the drawings) with 230 mm walls.
- A2. External and main internal walls are 230 mm (9") brick; toilet/shaft partitions are 115 mm (4.5"). Wall thickness is not dimensioned on the plans.
- A3. Floor-to-floor height is 3.20 m (10'-6") with a 150 mm RCC slab (3.05 m clear). No section drawing was provided.
- A4. The ground floor is modelled at a single level (no plinth or entrance steps); plinth height is not shown.
- A5. No north arrow is provided; the road side (front, +z) is assumed to face south for the sun simulation.
- A6. Door widths: main entrance 1.37 m double door, bedroom doors 0.84-0.91 m, toilet doors 0.76 m. Window sills 0.91 m and heads 2.13 m (kitchen sill 1.07 m). Typical values; the plans show openings without sizes.
- A7. Staircase: dog-leg with 2 flights of 10 risers per floor (riser 160 mm, going ~198 mm) inside a 3.05 m x 3.05 m core, landing at mid-height. Riser/tread counts are not shown and are inferred from the core size.
- A8. The double-height void above the GF dining is drawn on both the FF and SF plans and is modelled as a continuous triple-height atrium under the terrace slab.
- A9. The GF store (6'-6" x 8', 1.98 m x 2.44 m) is used as a Utility / Laundry at the client's request (stacked washer-dryer, sink, tall storage). It has a door from the kitchen plus a second door to the green area (client request).
- A10. Terrace room height 3.05 m with a flat RCC roof; parapets 1.07 m high; balcony and void railings are 1.07 m frameless glass.
- A11. Furniture follows the furniture symbols drawn on the plans where present (beds, sofas, dining, WCs, wardrobes, consoles) and typical layouts elsewhere, at standard catalogue sizes. All furniture, decor, art, curtains and appliances are indicative staging.
- A12. Exterior features (white cantilever frame, wood-clad fin, CNC jali screen, front fence fins) are approximated from the renders; they are not dimensioned.
- A13. The FF/SF office and guest room project west over the GF green area (cantilever or columns not shown).
- A14. FF/SF east-wall bedroom windows and toilet ventilators are assumed; the east wall is drawn mostly solid.
- A15. The GF common toilet is entered from the living / foyer through its north wall, as drawn (door arc); its east wall to the porch is solid.
- A16. GF kitchen, living and bedroom furniture follow the GF plan: rear counter with hob, tall fridge unit, peninsula with sink and breakfast ledge, L-sofa on the east wall, armchair, centre coffee table, 2-seater by the entrance; bed on the north wall with a TV unit between the two south windows.
- A17. The SF balcony snooker table is an 8 ft table (outer ~2.62 m x 1.49 m), the largest that leaves cue clearance in the 4.70 m x 3.91 m balcony. A full-size 12 ft table needs a room of roughly 6.7 m x 4.9 m.
- A18. The terrace living room is staged as a gym at the client's request (rubber floor, mirror wall on the solid west wall with a clerestory above, hanging boxing bag, treadmill, bench, dumbbell rack, yoga mats). The kitchen island follows the terrace plan.
- A19. Interior themes change finishes, furniture fabrics and decor only. Walls, openings, room sizes and furniture positions are identical in every theme.
- A20. Lighting is simulated (sun and sky model, window daylight, indicative ceiling downlights and lamps) for visualisation; it is not a daylight or lux calculation.
- A21. Front elevation styled after the client-supplied reference and the architect's render (PDF p.1): dark stone cladding to front-facing walls, charcoal render elsewhere, a terrace-level roof frame with a slanted timber soffit (left end), timber/bronze vertical fins and a geometric jali on the first-floor balcony, black-framed slatted gates and pillars. Cladding is a finish; wall and opening positions are unchanged. The earlier flat second-floor-level canopy (an approximation) is replaced by this frame.
- A22. The green area opens to the front yard through the 0.84 m strip west of the GF common toilet, as drawn; the short wall stub that closed it in v1-v3 is removed.
- A23. GF kitchen staged as a luxury modular kitchen (high-gloss lacquer shutters, bronze J-profile handles, black-and-gold marble backsplash, lit glass display uppers, chimney hood, lit open-shelf tall unit, integrated tall fridge unit). The rear wall is modelled solid as drawn (v1 had assumed a window).
- A24. FF and SF master bedrooms are staged with round upholstered beds (~2.29 m diameter), channel-tufted headboards, upholstered wall panels and a circular cove ceiling feature; TVs are provided in all bedrooms and living rooms. All are indicative staging.
- A25. Central air-conditioning is a VRV/VRF heat-pump system (client brief) with two outdoor systems: ODU-1 serves GF+FF, ODU-2 serves SF+terrace, so a fault affects only half the house. Outdoor units stand on galvanised frames against the rear parapet of the open terrace (x 9.37-11.98 m, z 0.33-1.10 m), with >= 1.4 m front service space and open sky for top discharge.
- A26. Cooling loads are an indicative rule-based estimate for Bilaspur (~44 C DB summer design, 24 C/50% RH indoors): floor area x type density (bedroom 215, living/dining 245, office 245, kitchen 340, gym 310, dressing 160, lobby 150 W/m2) + glazing x 230 W/m2 + exposed roof x 80 W/m2 + atrium allowance, x 1.10 safety. Outdoor units use a 0.75 diversity on the block load; connection ratios stay within 50-130%. A consultant's detailed heat-load calculation should confirm the sizes before procurement.
- A27. Indoor units are ceiling cassettes (round-flow 950 x 950 mm panel, or compact 620 x 620 mm) placed by load and throw coverage, clear of beds, pendants, chandelier, cove ceilings and the atrium void. They need a ~300 mm false ceiling (finished height ~2.74 m); the model shows panels at slab soffit for simplicity. Condensate is pumped (built-in drain pumps) to the nearest toilet or shaft. Toilets, utility, stores, stair and open balconies are ventilated, not cooled.
- A28. Refrigerant risers run vertically in the plumbing shaft (riser at x 8.32 m, z 0.58 m, inside the GF duct / FF-SF-terrace shaft overlap) and exit to the outdoor units through the terrace toilet's east wall.
- A29. Two 2,000 L overhead tanks (approx. 1.50 m dia x 1.40 m, triple-layer polyethylene) stand on 450 mm RCC pedestals at roof level (12.80 m): OHT-1 over the terrace toilet/shaft roof, OHT-2 over the stair-cabin roof. Each full tank is ~2.05 t (about 11 kN/m2 under the pedestal), so the pedestals must bear on beams/walls; the structural engineer must confirm the roof slab for this load. Roof access is by a steel cat ladder with safety hoops on the stair-cabin wall.
- A30. Client changes (v6): the GF living 2-seater by the entrance is replaced by an L-shaped built-in shoe-rack bench (open cubbies, cushioned seat, scatter cushions) along the east wall and the front wall up to the main door; the terrace pergola is moved from the small deck in front of the terrace room to the larger open terrace over the SF bedroom (approx. 4.6 m x 5.1 m, four posts). The former pergola deck becomes open terrace.
- A31. Client changes (v7): a cantilevered balcony (approx. 3.47 m x 1.24 m, frameless glass railing, planters, LED trim and soffit downlights) is added in front of the SF bedroom, reached through a sliding door; the remaining front opening stays a window. This matches the projecting SF balcony shown in the architect's render (resolving I8) and needs a structural cantilever from the SF slab. A floor-to-slab CNC-cut metal grill now also screens the open west side of the SF snooker balcony.

## Architectural inconsistencies identified

These come from analysing the drawings; several are confirmed automatically by `npm run validate`.

| ID | Severity | Finding |
|---|---|---|
| I1 | minor | GF Dining is labelled 16'-0" (4.88 m) wide, but holding the bedroom at its labelled 16'-0" with 230 mm walls leaves ~4.70 m (15'-5") for the dining zone. |
| I2 | minor | GF Dining (14'-4") + Living (14'-4") depths are ~0.53 m (1'-9") shorter than the drawn depth alongside the 30'-0" (9.14 m) green area; the extra depth is assigned to the living/foyer zone. |
| I3 | minor | FF Living is labelled 14'-0" (4.27 m) wide but measures ~4.70 m between line B and the bedroom wall. |
| I4 | major | Duct/shaft boxes do not stack: the GF duct spans x 7.54-9.98 m while the FF/SF shaft spans x 7.37-9.09 m. Plumbing stacks need a common vertical shaft. |
| I5 | minor | The SF/terrace sheet is drawn at a different scale (~15.5 px/ft vs 14.05 px/ft); SF stair and dressing widths do not match GF/FF and were fitted to the common stair core. |
| I6 | major | The FF/SF west wall (office / guest room) sits ~0.89 m inside the GF outer wall line, and the green area below is open: the upper rooms cantilever or transfer over the courtyard with no columns drawn. |
| I7 | minor | The SF plan repeats the FF double-height void, implying a triple-height atrium; this is not confirmed by any section. |
| I8 | minor | The renders show a projecting SF balcony on the middle-right of the front facade, whereas the SF plan places the open balcony on the left over the FF living. Resolved in v7 at the client's request: a projecting balcony is added in front of the SF bedroom (A31). |
| I9 | minor | The terrace common toilet is labelled 4'-0" x 8'-0" (1.22 m x 2.44 m) but drawn ~1.73 m x 1.42 m (it stacks over the shower below). |
| I10 | minor | The FF/SF "Toilet 15'-0" x 7'-8"" label appears to include the separate shower cubicle; the WC/bath room alone is ~3.05 m x 2.34 m. |
| I11 | major | With a 3.05 m core and 3.20 m floor-to-floor, each flight has ~198 mm goings and 160 mm risers; NBC 2016 recommends goings of at least 250 mm for residential stairs. |
| I12 | info | Plot size, setbacks and north direction are not given on any sheet. |
| I13 | info | Door positions/swings for stores and some toilets are not drawn and were inferred. |
| I14 | major | The terrace kitchen (wet area) sits directly above the SF guest bedroom (dry area); drainage would run through the guest room ceiling unless a sunken slab or external stack is provided. |
| I15 | minor | The FF/SF shower cubicles sit above the GF store (dry) and have no external wall; they depend on the adjoining shaft for exhaust and drainage. |
| I16 | info | Several upper-floor walls (office/guest room walls, FF front glazing wall, terrace room walls) have no wall directly below; an RCC frame with beams/transfer girders is implied but no structural drawings are provided. |
| I17 | info | Model correction (v3): the GF bedroom south wall was previously modelled with one central window. The plan shows two windows (~7.37-8.41 m and ~10.55-11.60 m) either side of a solid section holding the TV unit; the model now follows the plan. |
| I18 | info | Model correction (v4): the GF kitchen rear wall is drawn solid; the window assumed there in earlier versions is removed. The kitchen is lit by the courtyard glazing of the adjoining dining and the atrium. |
| I19 | info | The drawings show no services. The plumbing shaft (with its GF/FF offset, I4) is the only vertical service route, and the refrigerant risers, condensate and the tank downtake must share it; the shaft size should be checked by the MEP consultant. No roof access is drawn for the overhead tanks; a cat ladder is assumed (A29). |

## Validation

`npm run validate` checks the model and writes `VALIDATION_REPORT.md`. Current result: **0 errors, 13 warnings, 15 info**, and **38 of 38 accessible spaces are reachable** from the main gate. All values are reported in metres; the 13 warnings are genuine issues in the drawings (see the inconsistencies above).

| Check | What it verifies |
|---|---|
| Schema | Unique IDs, non-degenerate walls, furniture references valid rooms |
| Units | `meta.units` must be `m` |
| Air-conditioning | Every conditioned room has a cassette, installed kW ≥ design load, catalogue sizes, cassettes inside the room and not over the void, wall clearance, clashes with pendants/fans, throw coverage, outdoor-unit capacity vs block load, connection ratio 50–130%, outdoor-unit placement and service space, risers inside the shaft on every floor |
| Water tanks | On the roof, spacing ≥ 0.3 m, full weight and bearing pressure |
| Openings | Inside their wall, non-overlapping, head ≤ wall height, door clear widths ≥ 0.76 m |
| Rooms | No overlapping rooms, rooms do not cut through walls, upper-floor rooms are fully supported by the slab |
| Furniture | Inside its room, not intersecting walls, no overlaps between solid items |
| Plan labels | Modelled clear sizes vs. the sizes printed on the plan (flags I1, I3, I9, I10) |
| Circulation | A* route from the gate to every accessible room through real door openings, across floors via the stairs |
| Stairs | Riser, going, 2R+G, width, headroom (flags I11) |
| Plumbing | Wet-over-dry stacking and shaft alignment (flags I4, I14, I15) |
| Structure | Upper walls without a wall below (needs beams; I6, I16) |
| Daylight | Glazed and ventilator area per room vs. the NBC 10 % guideline; toilets without an external opening |

The browser app was also tested end-to-end with headless Chrome:
- Auto-walk reached all 40 room targets (including multi-floor routes over the stairs) using the real physics.
- Collisions held against walls, glass, furniture and the stair well.
- Plan, orbit, the four themes, three lighting presets and the mobile touch layout were exercised.
- There were no console errors.

## Known limitations

- The geometry is orthogonal (no curved walls). The round bed and the curved headboard are the only curved objects.
- Furniture and materials are procedural approximations, not catalogue models.
- The exterior jali, frame and fins are simplified from the renders. Neighbouring buildings are placeholder massing.
- Door leaves are modelled permanently open, so doorways never block movement.
