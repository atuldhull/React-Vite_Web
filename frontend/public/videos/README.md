# Hero video assets

The landing page can run in two modes:

1. **Real-time WebGL** — `LibraryScene.jsx`, the Three.js cathedral
   library corridor. Ships as the default; runs forever without any
   external assets.
2. **Pre-rendered video scrub** — full-screen MP4 whose `currentTime`
   is driven by scroll position. Cinema-quality offline renders
   (Blender / Unreal Engine 5 / Cinema 4D / etc.) become possible
   because the visual fidelity isn't bound by the user's browser GPU.

This folder is where the video files go. `HeroExperience.jsx`
HEAD-requests `/app/videos/hero-night.mp4` on first load — if it
exists, the video path lights up; if not, Three.js stays.

## Expected files

| Filename | When it plays |
|---|---|
| `hero-night.mp4` | Default, and when the user has the "dark" or "eclipse" theme |
| `hero-day.mp4` | When the user toggles to the "light" theme |

The day variant is **optional** — without it, the light theme will
fall back to the night video. Add it later when you have it.

If you only have one variant, just ship `hero-night.mp4`. The video
mode activates as long as that one file is present.

## Render specs

Tune your offline renderer's output to these targets:

| Setting | Target | Why |
|---|---|---|
| Container | MP4 | Universal browser support |
| Codec | H.264 (baseline or main profile) | Lowest decoder cost on mobile |
| Resolution | 1920 × 1080 | Sharp on desktop, scales down on mobile |
| Frame rate | 24 or 30 fps | Cinematic vs smooth-scroll; pick one |
| Duration | ~25 to 40 seconds | Maps to the 500vh scroll spacer |
| Bitrate | 10–15 Mbps | Quality/size balance; ~30–60 MB total |
| Keyframe interval | Every 1 second (24 or 30 frames) | **Critical** — scroll-scrubbing seeks constantly; sparse keyframes cause jitter |
| Audio | Muted / silent track | The page mutes playback anyway; saves bytes |
| Pixel format | yuv420p | Required for cross-browser playback |

## What the video should depict

To match the existing scroll choreography (500vh, 3 phases), the
camera path should roughly follow:

- **0 → 15%**: Aerial top-down over a gothic university campus.
  Tower silhouettes, courtyards, lit windows, lanterns lining the
  paths. Trees, grass, atmospheric depth. Camera high up looking
  down, slow drift forward.
- **15 → 45%**: Camera dives down through the campus, slipping past
  spires and rooftops, descending toward a doorway / archway. The
  feeling is "we're entering somewhere".
- **45 → 75%**: Through the doorway. Inside a long library corridor
  lined with bookshelves, warm candlelight, lanterns. Camera glides
  forward down the corridor.
- **75 → 100%**: Camera comes to rest in the deep library. Holds
  position; the React-side overlays (CTA, page content) take over
  from here.

The night version of this should feel moonlit + lanternlit. The day
version should feel sunrise / golden hour — same camera path, warm
golden light filling the windows, no moon, longer shadows.

## Practical production paths

In rough order of effort vs result:

- **Blender (free, ~weeks to learn well)**: The pragmatic choice.
  Cycles renderer for photoreal stills, Eevee for faster preview /
  near-photoreal video. Lots of free YouTube tutorials.
- **Unreal Engine 5 (free, ~weeks to learn)**: Higher ceiling than
  Blender for real-time-ish photoreal. Lumen + Nanite are very
  forgiving. Heavier to set up.
- **Commission a 3D artist**: Fiverr / Behance / ArtStation. A 30s
  gothic flythrough in the $300–800 range. Give them this README.
- **Sketchfab CC-licensed gothic-castle pack + your own animation**:
  Cheapest paid path. You handle camera animation only; the model
  is pre-built.

## IP note

Modeling and shipping **real, recognisable buildings** from
copyrighted franchises (Harry Potter / Hogwarts) or trademarked
locations (specific named Oxford / Cambridge colleges in their
photographic form) invites takedown notices and worse. Keep the
visual direction **generic gothic-university inspired** — pointed
arches, spires, courtyards, ivy, gargoyles, lanterns. That carries
the same emotional charge with none of the legal exposure.

## Adding the file

1. Render your video, name it `hero-night.mp4` (and optionally
   `hero-day.mp4`), drop into this folder.
2. `git add` + commit. Even though MP4s are binary, committing them
   to the repo is the simplest deploy. Render rebuilds and ships.
3. Visit your site. The hero now uses the video. Three.js is
   automatically unloaded; the previous LibraryScene chunk becomes
   dead-code from the user's perspective.

If you ever want to roll back, just delete the file (or rename it to
something else) and the dispatcher falls back to Three.js on next
build.
