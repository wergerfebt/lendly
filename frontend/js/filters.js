/* ═══════════════════════════════════════════════════════
   filters.js — Filter bar state, dropdown management,
                and filter application logic.
   Depends on: data.js  (listings, filterState)
               cards.js (renderCards — for toggling visibility)
   ═══════════════════════════════════════════════════════ */

// ── Filter State ──────────────────────────────────────
const filterState = {
  category: new Set(),  // Set<string>  e.g. 'Photography', 'Audio'
  delivery: null,       // 'same-day' | 'next-day' | 'pickup' | null
  distance: null,       // max miles (number) | null
  price:    null,       // { min, max } | null
};

const PRICE_PRESETS = {
  'any':      null,
  'under25':  { min: 0,   max: 25  },
  '25-50':    { min: 25,  max: 50  },
  '50-100':   { min: 50,  max: 100 },
  'over100':  { min: 100, max: Infinity },
};

// ── Dropdown open/close ───────────────────────────────
let activeDropdown = null;

function toggleFilterDropdown(name, triggerEl) {
  if (activeDropdown === name) {
    closeAllDropdowns();
  } else {
    openDropdown(name, triggerEl);
  }
}

function openDropdown(name, triggerEl) {
  closeAllDropdowns();

  const dd = document.getElementById(`dd-${name}`);
  if (!dd) return;

  // Position below the trigger pill
  const rect = triggerEl.getBoundingClientRect();
  dd.style.top  = (rect.bottom + 6) + 'px';
  dd.style.left = rect.left + 'px';
  dd.classList.add('visible');

  // Prevent right-edge overflow once visible
  const ddRect = dd.getBoundingClientRect();
  if (ddRect.right > window.innerWidth - 12) {
    dd.style.left = (window.innerWidth - ddRect.width - 12) + 'px';
  }

  triggerEl.classList.add('open');
  activeDropdown = name;
}

function closeAllDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('open'));
  activeDropdown = null;
}

// Close when clicking outside any dropdown or pill
document.addEventListener('click', e => {
  if (
    !e.target.closest('.filter-dropdown') &&
    !e.target.closest('.filter-pill') &&
    !e.target.closest('.filter-all-btn')
  ) {
    closeAllDropdowns();
  }
});

// ── Filter Application ────────────────────────────────
function getFilteredListings() {
  return listings.filter(l => {
    if (filterState.category.size > 0 && !filterState.category.has(l.group)) return false;
    if (filterState.delivery && !l.delivery.includes(filterState.delivery)) return false;
    if (filterState.distance !== null && l.distanceMi > filterState.distance) return false;
    if (filterState.price) {
      const { min = 0, max = Infinity } = filterState.price;
      if (l.price < min || l.price > max) return false;
    }
    return true;
  });
}

function applyFilters() {
  const filtered = getFilteredListings();
  const count = filtered.length;

  // Update results header
  const header = document.getElementById('resultsHeader');
  if (header) {
    header.innerHTML = `<strong>${count} rental${count !== 1 ? 's' : ''}</strong> near San Francisco`;
  }

  // Show/hide cards
  const visibleIds = new Set(filtered.map(l => l.id));
  listings.forEach(l => {
    const card = document.getElementById(`card-${l.id}`);
    if (card) card.style.display = visibleIds.has(l.id) ? '' : 'none';
  });

  // Update "Show N results" in All Filters footer
  const applyBtn = document.getElementById('afApplyBtn');
  if (applyBtn) applyBtn.textContent = `Show ${count} result${count !== 1 ? 's' : ''}`;

  updateAllBadges();
}

// ── Badge / active state ──────────────────────────────
function updateAllBadges() {
  updatePillBadge('category', filterState.category.size);
  updatePillBadge('delivery', filterState.delivery ? 1 : 0);
  updatePillBadge('distance', filterState.distance !== null ? 1 : 0);
  updatePillBadge('price',    filterState.price ? 1 : 0);

  // "All filters" total badge
  const total =
    filterState.category.size +
    (filterState.delivery ? 1 : 0) +
    (filterState.distance !== null ? 1 : 0) +
    (filterState.price ? 1 : 0);

  const badge = document.getElementById('allFiltersBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
}

function updatePillBadge(filterName, count) {
  const pill  = document.querySelector(`.filter-pill[data-filter="${filterName}"]`);
  if (!pill) return;
  const badge = pill.querySelector('.pill-badge');
  pill.classList.toggle('active', count > 0);
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// ── Input handlers ────────────────────────────────────
function onCategoryChange(checkbox) {
  // Sync the paired input (dropdown ↔ All Filters modal) by value
  const paired = document.querySelectorAll(
    `input[type=checkbox][value="${CSS.escape(checkbox.value)}"]`
  );
  paired.forEach(cb => { cb.checked = checkbox.checked; });

  if (checkbox.checked) filterState.category.add(checkbox.value);
  else                   filterState.category.delete(checkbox.value);
  applyFilters();
}

function onDeliveryChange(radio) {
  // Sync paired radio group (dropdown uses name="delivery", modal uses name="af-delivery")
  const value = radio.value;
  document.querySelectorAll('input[name="delivery"], input[name="af-delivery"]').forEach(r => {
    r.checked = r.value === value;
  });
  filterState.delivery = value === 'any' ? null : value;
  applyFilters();
}

function onDistanceChange(radio) {
  const value = radio.value;
  document.querySelectorAll('input[name="distance"], input[name="af-distance"]').forEach(r => {
    r.checked = r.value === value;
  });
  filterState.distance = value === 'any' ? null : parseInt(value, 10);
  applyFilters();
}

function onPriceChange(radio) {
  const value = radio.value;
  document.querySelectorAll('input[name="price"], input[name="af-price"]').forEach(r => {
    r.checked = r.value === value;
  });
  filterState.price = PRICE_PRESETS[value];
  applyFilters();
}

// ── Clear ─────────────────────────────────────────────
function clearFilter(name) {
  switch (name) {
    case 'category':
      filterState.category.clear();
      document.querySelectorAll('input[type=checkbox][value]').forEach(cb => {
        if (['Home','Construction','Automotive','Photography','Audio','Commercial AV','Party & Event'].includes(cb.value)) {
          cb.checked = false;
        }
      });
      break;
    case 'delivery':
      filterState.delivery = null;
      document.querySelectorAll('input[name="delivery"], input[name="af-delivery"]').forEach(r => {
        r.checked = r.value === 'any';
      });
      break;
    case 'distance':
      filterState.distance = null;
      document.querySelectorAll('input[name="distance"], input[name="af-distance"]').forEach(r => {
        r.checked = r.value === 'any';
      });
      break;
    case 'price':
      filterState.price = null;
      document.querySelectorAll('input[name="price"], input[name="af-price"]').forEach(r => {
        r.checked = r.value === 'any';
      });
      break;
  }
  applyFilters();
}

function clearAllFilters() {
  filterState.category.clear();
  filterState.delivery = null;
  filterState.distance = null;
  filterState.price    = null;

  document.querySelectorAll('.filter-dropdown input, .af-panel input').forEach(input => {
    if (input.type === 'checkbox') input.checked = false;
    if (input.type === 'radio')    input.checked = input.value === 'any';
  });

  applyFilters();
}

// ── All Filters modal ─────────────────────────────────
function openAllFilters() {
  closeAllDropdowns();
  document.getElementById('allFiltersOverlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeAllFilters() {
  document.getElementById('allFiltersOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('allFiltersOverlay')) {
    closeAllFilters();
  }
}

// ── Init ──────────────────────────────────────────────
function initFilters() {
  applyFilters();
}
