# Screenshots

Drop PNG files here matching the filenames below. The main `README.md`
references them — once you save these files with the right names, the
repo page on GitHub instantly gets a hero gallery.

## Required shots

| Filename | What to capture |
|----------|-----------------|
| `hero.png` | Homepage — the Earth-zoom video frame with "Math Collective / Where Mathematics Becomes Monument" title overlay. Take it mid-scroll if you can. |
| `arena.png` | `/arena` page — a challenge mid-solve, so the question + options + XP bar are all visible. |
| `leaderboard.png` | `/leaderboard` page — the weekly + all-time rankings, ideally with a handful of users visible. |
| `chat.png` | The E2EE chat panel open with a conversation visible. Blur the content if you want. Identity glyph should be visible in the header. |
| `admin-dashboard.png` | `/admin` — overview page showing the four stat cards + weekly leaderboard cycle card. |
| `certificate.png` | An actual issued certificate PDF rendered (just export it via Chrome "Save as PDF" → screenshot). Shows QR + cert ID. |
| `identity-ceremony.png` | The Identity Ceremony modal showing the 12-word recovery phrase grid. (Blur the real words if this is a real account — or generate a throwaway.) |
| `live-quiz.png` | A live quiz in progress — question on screen with the countdown timer + answer grid. |

## Specs

- **Format:** PNG (lossless, GitHub renders crisp)
- **Dimensions:** 1600×1000 ideal; 1280×800 minimum
- **File size:** keep under 500 KB each — GitHub has a soft limit and large READMEs feel sluggish. Run through https://tinypng.com if needed.
- **Color:** take them on a dark-themed OS / browser for visual consistency with the app theme

## Quick capture on Windows

1. Press **Win + Shift + S** → select area → save
2. OR use the Snipping Tool's "Timed screenshot" for the 3D scene (gives you 3 sec to set up the camera angle)
3. For full-page shots (e.g. a long dashboard): Chrome DevTools → `Ctrl + Shift + P` → type "screenshot" → **Capture full size screenshot**

## Capture tips

- Open DevTools → **Toggle device toolbar** (`Ctrl+Shift+M`) → set device to "Responsive" and width to 1600px → take shots at that size for consistent framing.
- For the live-quiz shot you need two browser windows (host + player) — use guest mode for the second window.
- The certificate shot is easiest: issue a cert to yourself, download the PDF, open in Chrome, zoom to 100%, `Ctrl+Shift+P` → "Capture full size screenshot".

## Commit the shots

Once you've got them all:
```bash
git add docs/screenshots/*.png
git commit -m "Add README screenshots"
git push
```

The README will light up on GitHub immediately. No further action needed.
