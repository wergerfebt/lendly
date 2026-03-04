/* ═══════════════════════════════════════════════════════
   layout.js — Resizable panel, column grid observer,
               and map show/hide toggle.
   Depends on: data.js (MIN_PANEL_W, TWO_COL_W, mapVisible,
                        mapInstance, panelWidth)
   ═══════════════════════════════════════════════════════ */

// ── Column layout (driven by ResizeObserver) ──────────

function updateColumns(width) {
  const container = document.getElementById('cardsContainer');
  const w = width ?? document.getElementById('listingsPanel').offsetWidth;
  if (!mapVisible) {
    container.className = 'cards-grid grid-auto';
  } else if (w >= TWO_COL_W) {
    container.className = 'cards-grid grid-2col';
  } else {
    container.className = 'cards-grid';
  }
}

function initResizeObserver() {
  const panel = document.getElementById('listingsPanel');
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) updateColumns(entry.contentRect.width);
  });
  ro.observe(panel);
}

// ── Drag-to-resize handle ─────────────────────────────

function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  const panel  = document.getElementById('listingsPanel');

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('is-resizing');

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup',     onUp, { once: true });
    handle.addEventListener('pointercancel', onUp, { once: true });
  });

  function onMove(e) {
    const maxW = Math.floor(window.innerWidth * 0.72);
    panelWidth = Math.max(MIN_PANEL_W, Math.min(maxW, e.clientX));
    panel.style.width = panelWidth + 'px';
    // ResizeObserver fires automatically — updateColumns() is called reactively
  }

  function onUp() {
    handle.classList.remove('dragging');
    document.body.classList.remove('is-resizing');
    handle.removeEventListener('pointermove', onMove);
    // Nudge Google Maps to re-render to its new container size
    if (mapInstance) google.maps.event.trigger(mapInstance, 'resize');
  }
}

// ── Map toggle ────────────────────────────────────────

const MAP_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
  <line x1="9" y1="3" x2="9" y2="18"/>
  <line x1="15" y1="6" x2="15" y2="21"/>
</svg>`;

function updateToggleBtn() {
  const btn = document.getElementById('toggleMapBtn');
  btn.innerHTML = mapVisible
    ? `${MAP_ICON_SVG} Hide map`
    : `${MAP_ICON_SVG} Show map`;
}

function toggleMap() {
  mapVisible = !mapVisible;

  const layout   = document.getElementById('appLayout');
  const mapPanel = document.getElementById('mapPanel');
  const handle   = document.getElementById('resizeHandle');
  const panel    = document.getElementById('listingsPanel');

  layout.classList.add('is-transitioning');

  if (!mapVisible) {
    mapPanel.classList.add('map-hidden');
    handle.classList.add('handle-hidden');
    panel.style.width = '100%';
  } else {
    mapPanel.classList.remove('map-hidden');
    handle.classList.remove('handle-hidden');
    panel.style.width = panelWidth + 'px';
    // Wait for the CSS transition before telling Maps to re-render
    setTimeout(() => {
      if (mapInstance) google.maps.event.trigger(mapInstance, 'resize');
    }, 320);
  }

  setTimeout(() => layout.classList.remove('is-transitioning'), 360);
  updateToggleBtn();
  // updateColumns fires via ResizeObserver as the panel width settles
}
