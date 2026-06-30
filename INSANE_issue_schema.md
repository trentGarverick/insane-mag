# INSANE Magazine — `issue.json` Field Schema (Authoritative)

*Derived directly from `pre-generate.mjs` (656 lines). These are the exact field names
the build script reads. Anything else is ignored silently — which is what caused the
Vol. 1 No. 8 round-trips. When in doubt, this file wins.*

---

## Top-level fields (the object wrapping `pages[]`)

| Field          | Purpose | Notes |
|----------------|---------|-------|
| `id`           | Folder/file id, e.g. `vol1no8` | Must match `issues/<id>/` and the `node pre-generate.mjs <id>` argument |
| `order`        | **Hub sort order (integer)** | **REQUIRED.** Missing → defaults to 99 → arbitrary card order |
| `volume`       | e.g. `VOL. 1` | |
| `number`       | e.g. `NO. 8` | |
| `date`         | e.g. `JUNE 30, 2026` | |
| `title`        | Issue title (hub card + nav bar) | |
| `subtitle`     | Hub card subtitle | |
| `price`        | e.g. `$6.99 CHEAP!` | |
| `eyebrow`      | **Hub card label** e.g. `VOL. 1 · NO. 8` | **Missing → card shows "Issue ?"** |
| `eyebrowDesc`  | Hub card description line | Falls back to `subtitle` if absent |
| `tagline`      | Cover/identity tagline | |
| `stylePrefix`  | Prepended to every page `scene` for the FLUX prompt | Set a consistent art-style string for visual consistency across the issue |
| `palette`      | `{ accent, navBg }` | Card accent + nav colors |

---

## Page types (`pages[].type`)

### `cover-full`
```json
{ "type": "cover-full", "illoId": "cover", "alt": "..." }
```

### `cover`
```json
{ "type": "cover", "illoId": "cover", "volNum": "VOL. 1 · NO. 8",
  "date": "JUNE 30, 2026", "price": "$6.99", "coverLines": ["...", "..."] }
```

### `editorial`
```json
{ "type": "editorial", "title": "...", "illoId": "...", "scene": "...",
  "salutation": "...", "paragraphs": ["..."], "signature": "...", "ps": "..." }
```

### `masthead`
```json
{ "type": "masthead", "title": "...", "illoId": "...", "scene": "...",
  "staff": [ { "role": "...", "name": "..." } ],
  "subscriberAlert": {
    "title": "...", "subtitle": "...",
    "items": ["...", "..."],            // ARRAY OF STRINGS
    "price": "...", "disclaimer": "..." },
  "disclaimer": "..." }
```
> `staff` items are **objects** `{role, name}`, not strings.
> `subscriberAlert` is an **object**, not a string.

### `contents`
```json
{ "type": "contents", "title": "...", "illoId": "...", "scene": "...",
  "edition": "...", "ticker": "...",
  "items": [ { "page": "04", "emoji": "👑", "title": "...", "desc": "..." } ],
  "scorecard": { "items": [ { "emoji": "📈", "label": "...", "value": "..." } ] } }
```
> The list field is **`items`** (NOT `entries`). Each item's number field is **`page`** (NOT `num`).
> `scorecard` and `ticker` are optional — these power an "INSANE Stock Ticker" style feature.

### `story`  (also used for Man & Woman in the Street, Crazy Comments, Classifieds)
```json
{ "type": "story", "illoId": "...", "scene": "...",
  "eyebrow": "...",          // optional kicker above heading
  "heading": "...",          // NOT "title"
  "subheading": "...",       // NOT "subtitle"
  "deck": "...",             // optional intro line
  "byline": "...",
  "paragraphs": ["..."],     // inline HTML allowed (e.g. <strong>)
  // optional blocks:
  "pullQuote": "...",
  "sidebarList": { "title": "...", "items": ["..."] },
  "fakeAd": { "headline": "...", "subheadline": "...", "bullets": ["..."],
              "price": "...", "disclaimer": "..." },
  "glossary": { "title": "...", "entries": [ { "word": "...", "def": "..." } ] },
  "theEnd": { "title": "...", "sub": "..." },
  "caption": "...",          // caption under the illustration
  "flip": true               // flips illo/text layout side
}
```
> Headline/subhead fields are **`heading` / `subheading`**, not `title` / `subtitle`.

### `spy-vs-spy`
```json
{ "type": "spy-vs-spy", "title": "...", "subtitle": "...", "illoId": "...", "scene": "...",
  "white": { "panels": ["...", "...", "..."] },
  "black": { "panels": ["...", "...", "..."] },
  "result": "..." }
```

### `awards`
```json
{ "type": "awards", "title": "...", "illoId": "...", "scene": "...", "date": "...",
  "categories": [ { "name": "...", "gold": "...", "silver": "...", "bronze": "..." } ] }
```

### `fold-in`
```json
{ "type": "fold-in", "illoId": "...", "scene": "...",
  "leftText": "...", "question": "...", "rightText": "...", "answer": "..." }
```

---

## Illustration generation rules

- A page generates an illustration **only if it has BOTH `scene` AND `illoId`.**
  Missing `scene` → no image, and the script misleadingly says "All images present."
- Model: **FLUX.1.1-pro** at a fixed **1024 × 768** (both multiples of 32).
- Final prompt = `stylePrefix + " " + scene`.
- The **cover ships pre-made** as `images/<id>-cover.png` (1200px-wide PNG via Pillow);
  the script does NOT generate the cover.

## Deploy sequence (PowerShell)
```powershell
Expand-Archive -Path <patch>.zip -DestinationPath . -Force
node pre-generate.mjs <id>
netlify deploy --prod --dir .
git add issues\<id>\ images\
git commit -m "..."
git push
```

## Pre-deploy sanity check
After `node pre-generate.mjs`, open `issues/<id>/index.html` and click through every page
before deploying. A 30-second pass catches any field issue before it reaches the live site.
