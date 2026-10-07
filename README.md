# GrowAm

GrowAm (Growam) is a local, single-page habit game made with plain HTML, CSS, and JavaScript. Complete self-reported, small eco-habit missions to earn points and grow an original inline-SVG mango tree. GrowAm has five tree levels, a profile stored on this device, dated task history, and a square progress card that can be downloaded and shared manually.

## Run the app locally

No build step, package install, account, or external service is needed. Open PowerShell in the GrowAm project folder and start Python's simple static web server:

```powershell
py -m http.server 8000
```

If `py` is not available, use `python -m http.server 8000`. Keep the server running and open [http://localhost:8000/](http://localhost:8000/) in a browser. Stop the server with Ctrl+C. Any simple static-file server can be used instead.

## Missions and points

| Mission | Points | Availability |
| --- | ---: | --- |
| Refill a reusable bottle | 5 | Once per local calendar day |
| Turn off unnecessary lights | 5 | Once per local calendar day |
| Save water while brushing or washing | 10 | Once per local calendar day |
| Plant or care for a real tree (weekly bonus) | 20 | Once per Monday-to-Sunday local calendar week |

Each mission has **Do** and **Undo** controls. Undo reverses that mission's points for its current period and removes its attached pictures. Points otherwise do not reset automatically. Completing the three daily missions and the weekly bonus once each awards 40 points in total.

## Tree levels

The game has five tree levels (the full five-stage progression):

| Level | Points |
| --- | ---: |
| Speed Starter | 0–4 |
| Post Scout | 5–9 |
| Playing Keeper | 10–19 |
| Tree Guardian | 20–39 |
| Mango Hero | 40 or more |

The tree illustration changes from a seed in soil to a sprout, leafy sapling, larger tree, and mango-bearing tree. The progress bar shows progress within the current level; at Mango Hero it shows 100% and the reward area congratulates the player. Completing the four available missions can demonstrate all five levels in one session. Reduced-motion preferences are respected.

## Profile, history, and local storage

GrowAm saves data under the `growam-progress-v1` key in the current browser's local storage. It stores the nickname, optional Instagram and Facebook text, total points, completed mission periods, dated completion history, celebration state, and optional task pictures. Profile fields are limited in length, shown as text, and stay read-only after saving; use the profile icon in the header to edit them. A save displays “Saved”.

Mission periods use local calendar dates (not UTC): daily tasks unlock on the next local day, and the weekly bonus unlocks when the local week changes on Monday. `data/index.html` shows the saved profile, task-completion count, and completions grouped by local date, including weekends. Data is specific to this browser and device; clearing browser storage or switching browsers/devices removes or does not carry it over. If saved data is invalid or its points do not match its completion history, GrowAm starts safely with zero progress.

After completing a mission, the user may add up to three pictures for that mission period. Each image may be up to 8 MB before browser-side resizing. Pictures remain in local storage and are shown on the history page. Reset progress asks for confirmation before deleting the profile and game progress.

## Download and manually share the progress card

1. Optionally save a nickname, Instagram name, and Facebook name in the profile. Social fields may be left blank.
2. Select **Download progress card**. The browser draws a 1080 × 1080 PNG locally, with GrowAm branding, the current tree stage, nickname (if present), point total, and supplied Instagram/Facebook names.
3. Save the PNG when prompted. Select **Copy caption** to copy a short caption that clearly describes progress as self-reported.
4. Manually upload the saved image to Instagram or Facebook and paste the caption if desired. GrowAm does not post it for you.

The progress card is the only downloadable reward. No certificate, backend, account, package, external API, or API key is used.

## Honest progress

All mission completions are self-reported. GrowAm does not independently verify actions, environmental impact, carbon savings, or whether a real tree has been planted.

## Project files

- `index.html` — game, profile, missions, tree, and reward interface
- `style.css` — responsive layout, tree art animation, and reduced-motion styling
- `app.js` — mission rules, local persistence, history integrity checks, and PNG/caption actions
- `data/index.html` — profile and dated task-history page
- `data/records.js` and `data/records.css` — local history rendering and styling
