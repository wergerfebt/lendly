# Lendly — Frontend

A peer-to-peer equipment rental marketplace UI. Static HTML/CSS/JS mockup with live Google Maps integration, resizable split-panel layout, multi-column responsive grid, and client-side filtering.

---

## Project structure

```
frontend/
├── index.html          ← Single-page shell; all markup lives here
├── css/
│   └── main.css        ← All styles; CSS custom properties design system
└── js/
    ├── data.js         ← Shared state, constants, mock listings array
    ├── cards.js        ← Card rendering + map marker sync
    ├── layout.js       ← Resizable panel, column grid, map toggle
    ├── map.js          ← Google Maps init, price pins, auth fallback
    ├── filters.js      ← Filter state, dropdowns, modal, apply logic
    └── app.js          ← DOMContentLoaded bootstrap entry point
```

Scripts must be loaded in this exact order — each module reads globals set by the previous one.

---

## Running locally

No build step required. Open `frontend/index.html` directly in a browser, or serve it from a local static server:

```bash
# Python
python -m http.server 8080 --directory frontend

# Node (npx)
npx serve frontend
```

> **Google Maps API key** — the key in `index.html` is for development only. If the map shows an error banner, replace the key in the `<script src="https://maps.googleapis.com/...">` tag at the bottom of `index.html` with a valid key that has the **Maps JavaScript API** enabled.

---

## Layout

The page is divided into three vertical zones:

```
┌────────────────────────────────────────────────────────┐
│  Header: logo · search pill · List an item · Sign in  │  ← fixed, 76px
├────────────────────────────────────────────────────────┤
│  Filter bar: Category · Delivery · Distance · Price   │  ← fixed, 50px
├──────────────────────┬─┬───────────────────────────────┤
│                      │ │                               │
│   Listings panel     │▌│        Google Maps            │
│   (scrollable)       │ │        (fills remainder)      │
│                      │ │                               │
└──────────────────────┴─┴───────────────────────────────┘
                       ↑
                  drag handle
```

| Control | Behaviour |
|---------|-----------|
| Drag the `▌` handle | Resize the panel (min 320 px, max 72 % of viewport) |
| **Hide map** button | Expands listings panel to full width; re-entering shows the map again |
| Panel ≥ 680 px | Grid switches to `repeat(auto-fill, minmax(280px, 1fr))` — 2, 3, or 4 columns |
| Panel < 680 px | Single-column layout |

---

## Listing cards

Each card shows:
- Cover image
- Price badge ($/day)
- Title
- Category tag
- Lister name + avatar (initials-based, coloured)
- Star rating + review count

**Interactions:**
- Hover a card → corresponding map pin highlights
- Click a card → map pans to that listing, pin activates
- Click a map pin → card scrolls into view and activates

---

## Filters

The filter bar has four pill buttons, each opening a positioned dropdown:

| Filter | Type | Options |
|--------|------|---------|
| **Category** | Multi-select checkboxes | Home, Construction, Automotive, Photography, Audio, Commercial AV, Party & Event |
| **Delivery** | Single-select radio | Same Day, Next Day, Pickup |
| **Distance** | Single-select radio | Under 5 mi, Under 10 mi, Under 25 mi, Under 50 mi, Any |
| **Price / day** | Single-select radio | Under $25, $25–$50, $50–$100, Over $100, Any |

The **All Filters** button opens a modal that exposes all four filters in one view. State is kept in a single `filterState` object and synced between the dropdown and modal UIs so both always reflect the same selection.

Filtered cards are hidden via `display: none` (not removed from the DOM) so map pins and card selection state are preserved across filter changes.

---

## Google Maps integration

- Uses **Maps JavaScript API v3** with the `marker` library (`AdvancedMarkerElement`)
- One price pin per listing, created at init time and stored in `pinRefs[id]`
- Pin colour transitions between inactive (#333) and active (coral `#FF385C`) on hover / selection
- Map is re-triggered with `google.maps.event.trigger(map, 'resize')` after panel drag and after map toggle animation completes, so tiles re-render correctly
- If the API key is invalid or missing, `window.gm_authFailure` fires and a fallback card is shown in place of the map

---

## Design system (CSS custom properties)

```css
/* Colours */
--coral:      #FF385C   /* primary action / active state */
--coral-dark: #E0002C   /* hover darken */
--bg:         #F7F7F7
--white:      #FFFFFF
--border:     #DDDDDD
--text:       #222222
--text-mid:   #717171
--text-light: #B0B0B0

/* Layout */
--header-h:   76px
--filter-h:   50px
--chrome-h:   calc(var(--header-h) + var(--filter-h))  /* 126px total */
--radius:     14px
```

---

## Module reference

### `data.js` — shared state

| Symbol | Type | Description |
|--------|------|-------------|
| `MIN_PANEL_W` | `number` | Minimum listings panel width (320 px) |
| `INIT_PANEL_W` | `number` | Initial panel width (460 px) |
| `TWO_COL_W` | `number` | Breakpoint for 2-column grid (680 px) |
| `activeId` | `number\|null` | ID of the currently selected listing |
| `mapInstance` | `google.maps.Map\|null` | Map reference (set by `map.js`) |
| `mapVisible` | `boolean` | Whether the map panel is shown |
| `panelWidth` | `number` | Current listings panel width in px |
| `pinRefs` | `object` | `{ [id]: { marker, el } }` — map pin references |
| `listings` | `array` | Mock rental listings (see schema below) |

**Listing object shape:**
```js
{
  id:         1,
  title:      "Sony A7 IV Mirrorless Camera",
  category:   "Camera",
  group:      "Photography",          // maps to filter category
  price:      85,                     // per day
  image:      "https://...",
  lister:     { name, initials, color },
  location:   { lat, lng },
  rating:     4.9,
  reviews:    127,
  delivery:   ["same-day", "pickup"], // supported delivery modes
  distanceMi: 1.2,
}
```

---

### `cards.js`

| Function | Description |
|----------|-------------|
| `renderCards()` | Renders all listings into `#cardsGrid` |
| `onCardEnter(id)` | Highlights the map pin on card hover |
| `onCardLeave(id)` | Removes hover highlight (unless card is selected) |
| `onCardClick(id)` | Selects listing; pans map |
| `selectListing(id)` | Sets `activeId`; scrolls card into view; activates pin |
| `setPin(id, active)` | Toggles `.active` class on a price pin element |

---

### `layout.js`

| Function | Description |
|----------|-------------|
| `updateColumns(width)` | Switches grid CSS class based on `width` |
| `initResizeObserver()` | Attaches `ResizeObserver` to the listings panel |
| `initResizeHandle()` | Attaches pointer-event drag listeners to the `▌` handle |
| `toggleMap()` | Shows/hides the map panel; updates layout and triggers map resize |
| `updateToggleBtn()` | Syncs the toggle button label and icon to `mapVisible` |

---

### `map.js`

| Function | Description |
|----------|-------------|
| `initMap()` | Google Maps API async callback; creates map + all price pins |
| `showFallback(headline, detail)` | Replaces map canvas with a styled error card |
| `window.gm_authFailure()` | Called by Maps API on key failure; shows fallback |

---

### `filters.js`

| Function | Description |
|----------|-------------|
| `initFilters()` | Initial `applyFilters()` call on page load |
| `toggleFilterDropdown(name, el)` | Opens/closes a named dropdown |
| `openAllFilters()` / `closeAllFilters()` | Modal open/close |
| `handleOverlayClick(e)` | Closes modal only when clicking the backdrop |
| `onCategoryChange(checkbox)` | Syncs category checkboxes; applies filters |
| `onDeliveryChange(radio)` | Syncs delivery radios; applies filters |
| `onDistanceChange(radio)` | Syncs distance radios; applies filters |
| `onPriceChange(radio)` | Maps preset value to `{ min, max }` range; applies filters |
| `clearFilter(name)` | Resets one filter and re-applies |
| `clearAllFilters()` | Resets all filters |
| `applyFilters()` | Hides/shows cards; updates result count and badges |

---

## Known limitations / future work

| Item | Notes |
|------|-------|
| **Static mock data** | `listings` in `data.js` is hardcoded. Will be replaced with `GET /api/listings` calls once the frontend is wired to the backend. |
| **No auth flow** | Sign In and List an Item buttons are placeholder stubs. |
| **Google Maps API key** | The development key in `index.html` should be restricted by HTTP referrer and rotated before any public deployment. |
| **No module bundler** | Scripts are loaded with `<script>` tags in dependency order. A bundler (Vite, esbuild) will be added when backend integration begins. |
| **Images from picsum.photos** | Placeholder images. Will be replaced with real S3 URLs from the backend. |
