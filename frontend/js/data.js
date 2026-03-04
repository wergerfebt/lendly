/* ═══════════════════════════════════════════════════════
   data.js — App constants, shared state, and listings data.
   All other modules read/write state from this file.
   ═══════════════════════════════════════════════════════ */

// ── Layout constants ──────────────────────────────────
const MIN_PANEL_W  = 320;   // px — minimum readable 1-col width
const INIT_PANEL_W = 460;   // px — default width on load
const TWO_COL_W    = 680;   // px — panel width that triggers 2-column grid

// ── Shared application state ──────────────────────────
let activeId    = null;      // id of the currently selected listing
let mapInstance = null;      // google.maps.Map instance (set by map.js)
let mapVisible  = true;      // whether the map panel is open
let panelWidth  = INIT_PANEL_W; // saved listing-panel width in px
const pinRefs   = {};        // { [id]: { marker, el } } — price-pin references

// ── Listings data ─────────────────────────────────────
// group    — maps to a filter category shown in the toolbar
// delivery — array of supported modes: 'same-day' | 'next-day' | 'pickup'
// distanceMi — mock distance from user's location (miles)
const listings = [
  {
    id: 1,
    title: 'Sony A7 IV Mirrorless Camera Kit',
    category: 'Camera',
    group: 'Photography',
    price: 85,
    image: 'https://picsum.photos/seed/camera-lens-42/460/200',
    lister: { name: 'GearLoft', initials: 'GL', color: '#2563EB' },
    location: { lat: 37.7946, lng: -122.3999 },
    rating: 4.9, reviews: 127,
    delivery: ['same-day', 'pickup'],
    distanceMi: 1.2,
  },
  {
    id: 2,
    title: 'DJI Mavic 3 Pro Drone + ND Filters',
    category: 'Drone',
    group: 'Photography',
    price: 120,
    image: 'https://picsum.photos/seed/aerial-sky-88/460/200',
    lister: { name: 'SkyRentals', initials: 'SR', color: '#7C3AED' },
    location: { lat: 37.7785, lng: -122.4056 },
    rating: 4.8, reviews: 89,
    delivery: ['next-day', 'pickup'],
    distanceMi: 3.4,
  },
  {
    id: 3,
    title: 'Gibson Les Paul Standard 59',
    category: 'Guitar',
    group: 'Audio',
    price: 45,
    image: 'https://picsum.photos/seed/guitar-studio-17/460/200',
    lister: { name: 'MusicShare', initials: 'MS', color: '#DC2626' },
    location: { lat: 37.7599, lng: -122.4148 },
    rating: 4.7, reviews: 64,
    delivery: ['pickup'],
    distanceMi: 4.1,
  },
  {
    id: 4,
    title: 'REI Co-op 4-Person Camping Tent',
    category: 'Camping Gear',
    group: 'Home',
    price: 35,
    image: 'https://picsum.photos/seed/forest-camp-55/460/200',
    lister: { name: 'OutdoorGear', initials: 'OG', color: '#059669' },
    location: { lat: 37.7609, lng: -122.4350 },
    rating: 4.6, reviews: 43,
    delivery: ['same-day', 'next-day', 'pickup'],
    distanceMi: 6.7,
  },
  {
    id: 5,
    title: 'Blackmagic Pocket Cinema 6K G2',
    category: 'Cinema Camera',
    group: 'Commercial AV',
    price: 155,
    image: 'https://picsum.photos/seed/film-shoot-23/460/200',
    lister: { name: 'FilmHouse', initials: 'FH', color: '#1D4ED8' },
    location: { lat: 37.7692, lng: -122.4481 },
    rating: 5.0, reviews: 31,
    delivery: ['same-day', 'pickup'],
    distanceMi: 2.8,
  },
  {
    id: 6,
    title: 'Moog Sub37 Analogue Synthesizer',
    category: 'Synthesizer',
    group: 'Audio',
    price: 65,
    image: 'https://picsum.photos/seed/synth-keys-77/460/200',
    lister: { name: 'SynthCity', initials: 'SC', color: '#B45309' },
    location: { lat: 37.7793, lng: -122.4839 },
    rating: 4.9, reviews: 55,
    delivery: ['pickup'],
    distanceMi: 9.2,
  },
  {
    id: 7,
    title: '7ft Ocean Longboard Surfboard',
    category: 'Surf Gear',
    group: 'Home',
    price: 30,
    image: 'https://picsum.photos/seed/ocean-surf-11/460/200',
    lister: { name: 'CoastGear', initials: 'CG', color: '#0891B2' },
    location: { lat: 37.7577, lng: -122.4876 },
    rating: 4.5, reviews: 78,
    delivery: ['same-day', 'pickup'],
    distanceMi: 11.5,
  },
  {
    id: 8,
    title: 'Trek FX3 Disc E-Bike — Daily Rental',
    category: 'E-Bike',
    group: 'Automotive',
    price: 55,
    image: 'https://picsum.photos/seed/ebike-city-33/460/200',
    lister: { name: 'CityRide', initials: 'CR', color: '#16A34A' },
    location: { lat: 37.8061, lng: -122.4103 },
    rating: 4.8, reviews: 102,
    delivery: ['same-day', 'next-day', 'pickup'],
    distanceMi: 0.8,
  },
];
