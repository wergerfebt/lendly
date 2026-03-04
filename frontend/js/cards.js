/* ═══════════════════════════════════════════════════════
   cards.js — Rental card rendering and card interactions.
   Depends on: data.js (listings, activeId, mapInstance,
                        mapVisible, pinRefs)
   ═══════════════════════════════════════════════════════ */

// ── Render ────────────────────────────────────────────

function renderCards() {
  document.getElementById('cardsContainer').innerHTML = listings.map(l => `
    <div class="rental-card" id="card-${l.id}"
         onmouseenter="onCardEnter(${l.id})"
         onmouseleave="onCardLeave(${l.id})"
         onclick="onCardClick(${l.id})">
      <div class="card-img-wrap">
        <img class="card-img" src="${l.image}" alt="${l.title}" loading="lazy" />
        <span class="card-badge">${l.category}</span>
      </div>
      <div class="card-body">
        <div class="card-top-row">
          <div class="card-title">${l.title}</div>
          <div class="card-price">$${l.price}<span class="unit">/day</span></div>
        </div>
        <div class="card-footer">
          <div class="lister-info">
            <div class="lister-avatar" style="background:${l.lister.color}">${l.lister.initials}</div>
            <span class="lister-name">${l.lister.name}</span>
          </div>
          <div class="rating-info">
            <span class="star">★</span>
            ${l.rating}
            <span class="review-count">(${l.reviews})</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Card event handlers ───────────────────────────────

function onCardEnter(id) {
  setPin(id, true);
  document.getElementById(`card-${id}`).classList.add('active');
}

function onCardLeave(id) {
  if (id !== activeId) {
    setPin(id, false);
    document.getElementById(`card-${id}`).classList.remove('active');
  }
}

function onCardClick(id) {
  selectListing(id);
  if (mapInstance && mapVisible) {
    const listing = listings.find(l => l.id === id);
    if (listing) mapInstance.panTo(listing.location);
  }
}

// ── Selection state ───────────────────────────────────

function selectListing(id) {
  if (activeId !== null && activeId !== id) {
    setPin(activeId, false);
    const prev = document.getElementById(`card-${activeId}`);
    if (prev) prev.classList.remove('active');
  }
  activeId = id;
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  setPin(id, true);
}

// ── Pin helpers (shared with map.js) ─────────────────

function setPin(id, active) {
  const ref = pinRefs[id];
  if (!ref) return;
  ref.el.classList.toggle('active', active);
  ref.marker.zIndex = active ? 10 : 1;
}
