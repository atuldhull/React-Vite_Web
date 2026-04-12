## Visual Theme System

> Added: April 2026 | Last updated: April 13, 2026

### Concept: Mathematical Monuments

Every page in the app is visually set inside one of 8 hypothetical mathematical monuments — ancient or futuristic structures built around math. The theme is applied through a background layer and a CSS variable system, never by changing page logic.

### Monument → Page Mapping

| Monument | Biome | Accent Color | Assigned Pages |
|----------|-------|-------------|----------------|
| Desert Winds Observatory | Sand dunes, Fibonacci spirals | `#D4A017` | Arena, Home hero |
| Great Pyramid Theorem | Fractal glass pyramid, dusk desert | `#7B4FE0` | Dashboard, Test History |
| Glacial Citadel of Limits | Ice geometry, northern lights | `#00CFFF` | Leaderboard |
| Jungle Ruins of Infinity | Overgrown temple, Mobius aqueducts | `#2ECC71` | Events, Projects |
| Neon Spire City of Proofs | Cyberpunk function-curve skyline | `#FF2D78` | Login, Register, Billing |
| Abyssal Library of Constants | Underwater cathedral, bioluminescence | `#00FFC8` | Gallery, PANDA bot UI |
| Sky Archipelago of Transformations | Floating islands, integral bridges | `#B695F8` | Profile, Certificates, Notifications |
| Magma Forge of Axioms | Volcanic foundry, glowing runes | `#FF6B35` | Admin, Teacher, Super Admin |

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/styles/theme.css` | Monument CSS variables (`--monument-*`, `--page-accent`, `--page-glow`, clip-path tokens, panda/avatar/ring helpers) |
| `frontend/src/hooks/useMonument.js` | Hook that sets `data-monument` attribute on `document.body` for CSS scoping |
| `frontend/src/components/backgrounds/MonumentBackground.jsx` | Thin switch (53 lines) that picks the right biome component |
| `frontend/src/components/backgrounds/monument/` | The 8 biome scenes — `DesertBg`, `PyramidBg`, `GlacierBg`, `JungleBg`, `CityBg`, `AbyssBg`, `SkyBg`, `MagmaBg` — plus shared `keyframes.js` |
| `frontend/src/components/monument/MonumentHero.jsx` | Premium animated page headers with parallax |
| `frontend/src/components/monument/MonumentRouter.jsx` | Route->monument context provider |

> Note: `MonumentBackground.jsx` was previously one 672-line file. It was split during the April 2026 architecture pass — the switch logic stayed behind, each biome moved to its own file, and the shared `@keyframes` block is now injected once via `ensureKeyframes()`. No behavioural change; purely a maintainability split.

### CSS Variable System

Pages inherit their accent color automatically via `data-monument` on `<body>`:
```css
/* Set by useMonument hook */
[data-monument="desert"] { --page-accent: #D4A017; --page-glow: rgba(212,160,23,0.12); }
[data-monument="city"]   { --page-accent: #FF2D78; --page-glow: rgba(255,45,120,0.15); }
/* ...etc */
```

Buttons, cards, inputs, and progress bars all consume `--page-accent` and `--page-glow`. This means every page automatically gets a correctly-colored UI with no per-page overrides needed.

### UI Shape Language

Math-themed clip-paths replace all `border-radius` on interactive elements. Defined in `theme.css`:

| Token | Shape | Used On |
|-------|-------|---------|
| `--clip-hex` | Hexagon | Primary CTA buttons |
| `--clip-para` | Parallelogram | Secondary buttons, user chat bubbles, badges |
| `--clip-notch` | Corner-notched rect | Cards, bot messages, modals, chat panel |
| `--clip-diamond` | Diamond | Danger/destructive buttons |

### Fonts

- **Space Grotesk** — headings (`h1`-`h4`), monument names, hero text
- **JetBrains Mono** — all numbers, math symbols, XP values, quiz codes, counters. Apply via `className="math-text"`.
- **Outfit** — body text, labels

### Homepage

The homepage uses a scroll-synced cinematic video (not 3D):
- `MonumentGround.jsx` renders a `<video>` element synced to scroll position
- Video: `frontend/public/videos/desert_monument.mp4` (6.5MB, Cloudinary)
- Smooth 4% lerp interpolation, 15fps seek throttle for butter-smooth playback
- Title overlay ("Math Collective") fades based on scroll progress
- No WebGL/Canvas on the homepage — pure video + DOM for maximum performance

### Page Transitions

When navigating between routes, `MonumentTransition.jsx` plays a 1.5s full-screen overlay:
1. Dark overlay fades in (300ms)
2. Destination monument background plays at full intensity
3. Monument's signature math symbol animates in center (sum, integral, triangle, infinity, lambda, omega, phi, nabla)
4. Overlay fades out revealing new page

### Adding a Monument to a New Page

1. Call `useMonument('desert')` (or whichever biome) at the top of the component
2. Add `position: relative` to the outermost return div
3. Add `<MonumentBackground monument="desert" intensity={0.15} />` as the first child
4. That's it — accent colors, buttons, and inputs all inherit automatically

### What Was NOT Changed

- All API endpoints, Supabase queries, Socket.IO events
- Routing structure and protected route logic
- Zustand store files
- All backend files (`routes/`, `controllers/`, `middleware/`, `server.js`)
- Component prop APIs (existing props on Button, Card, InputField are unchanged)

### Files Cleaned Up (April 4, 2026)

The following were built during 3D experiments but are no longer used (homepage switched to video):
- ~~8 monument 3D scenes~~ (DesertObservatory, Pyramid, Glacier, etc.) — deleted
- ~~CinematicEarth, CinematicCamera, CinematicScene~~ — deleted
- ~~EarthHero (3D globe)~~ — deleted (replaced by video)
- ~~6 HDRI environment maps~~ — deleted (77MB)
- ~~4 terrain texture sets~~ — deleted
- Monument infrastructure (MonumentRouter, MonumentBackground, theme.css) is KEPT — still provides CSS themes for all pages
