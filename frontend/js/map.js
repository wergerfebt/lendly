/* ═══════════════════════════════════════════════════════
   map.js — Google Maps initialisation, price-pin markers,
             and API key fallback handling.
   Depends on: data.js  (listings, mapInstance, pinRefs)
               cards.js (selectListing)

   initMap() is registered as the Maps JS API callback.
   ═══════════════════════════════════════════════════════ */

function initMap() {
  mapInstance = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 37.762, lng: -122.437 },
    zoom: 13,
    mapId: 'DEMO_MAP_ID',
    clickableIcons: false,
    gestureHandling: 'greedy',
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  listings.forEach(l => {
    const el = document.createElement('div');
    el.className = 'price-pin';
    el.textContent = `$${l.price}`;

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: mapInstance,
      position: l.location,
      content: el,
      title: l.title,
      zIndex: 1,
    });

    pinRefs[l.id] = { marker, el };

    marker.addListener('click', () => {
      selectListing(l.id);
      mapInstance.panTo(l.location);
    });
  });
}

// ── Fallback shown when the API key is missing/invalid ──

function showFallback(headline, detail) {
  document.getElementById('map').innerHTML = `
    <div class="map-fallback">
      <div class="map-fallback-card">
        <div class="icon">🗺️</div>
        <h3>${headline}</h3>
        <p>${detail}</p>
        <code>
          &lt;script src="https://maps.googleapis.com/maps/api/js<br>
          &nbsp;&nbsp;<em>?key=YOUR_API_KEY</em><br>
          &nbsp;&nbsp;&amp;libraries=marker<br>
          &nbsp;&nbsp;&amp;callback=initMap" async defer&gt;
        </code>
      </div>
    </div>`;
}

window.gm_authFailure = () =>
  showFallback(
    'Google Maps API key required',
    'Add a valid API key to the Maps SDK script tag in index.html.'
  );
