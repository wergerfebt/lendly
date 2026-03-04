/* ═══════════════════════════════════════════════════════
   app.js — Bootstrap entry point.
   Wires together all modules once the DOM is ready.
   Load order in index.html: data → cards → layout → map → app
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Set the initial listing panel width (JS-controlled, not via CSS)
  document.getElementById('listingsPanel').style.width = INIT_PANEL_W + 'px';

  renderCards();         // cards.js  — populate the listing grid
  updateToggleBtn();     // layout.js — set initial button label
  initResizeHandle();    // layout.js — wire up the drag handle
  initResizeObserver();  // layout.js — watch panel width for column changes
});
