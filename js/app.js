// ── Firebase ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCN2CD_zIC7FedAfRm6ZnVh7jIqhZD6NWs",
  authDomain: "japan-map-500903.firebaseapp.com",
  projectId: "japan-map-500903",
  storageBucket: "japan-map-500903.firebasestorage.app",
  messagingSenderId: "447815719019",
  appId: "1:447815719019:web:16c9a59eef4e71fe3c392e"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const googleProvider = new GoogleAuthProvider();

// ── Constants ──
const TRANSPORT = {
  drive: { label: '開車 / 公車', color: '#378ADD', dash: [8, 4] },
  walk:  { label: '走路',        color: '#EF9F27', dash: [4, 4] },
  train: { label: '電車',        color: '#D85A30', dash: [12, 3] },
};
// Route-specific categories (separate from place tags)
const ROUTE_CATEGORIES = ['散步', '通勤', '觀光', '美食巡禮', '購物', '其他'];
// Color used for places marked as "want to go" (not yet visited)
const WISHLIST_COLOR = '#1a1a1a';
const TAG_STYLE = {
  '美食': { bg: '#FAEEDA', text: '#633806' },
  '神社': { bg: '#E1F5EE', text: '#085041' },
  '自然': { bg: '#EAF3DE', text: '#27500A' },
  '文化': { bg: '#EEEDFE', text: '#3C3489' },
  '購物': { bg: '#FAECE7', text: '#712B13' },
  '住宿': { bg: '#E8F0FE', text: '#1A3A7A' },
  '交通': { bg: '#FCE8E6', text: '#8C2D1E' },
  '活動': { bg: '#FDF6D8', text: '#7A5B00' },
};

// Icon catalog — keys map to SVG symbol ids in index.html (pin-*).
// Each entry has a label and the inner SVG path markup (used to build map marker data-URIs).
const ICON_CATALOG = {
  pin:      { label: '圖釘' },
  food:     { label: '美食' },
  cafe:     { label: '咖啡' },
  shrine:   { label: '神社' },
  castle:   { label: '城堡' },
  nature:   { label: '自然' },
  shopping: { label: '購物' },
  lodging:  { label: '住宿' },
  station:  { label: '車站' },
  camera:   { label: '景點' },
  heart:    { label: '愛心' },
  star:     { label: '星星' },
};

// Default icon per category
const TAG_DEFAULT_ICON = {
  '美食': 'food', '神社': 'shrine', '自然': 'nature', '文化': 'castle',
  '購物': 'shopping', '住宿': 'lodging', '交通': 'station', '活動': 'star',
};
// Default color per category
const TAG_DEFAULT_COLOR = {
  '美食': '#E8833A', '神社': '#0E8A6E', '自然': '#4C9A2A', '文化': '#6C5CE7',
  '購物': '#D6336C', '住宿': '#2B7DE9', '交通': '#C0392B', '活動': '#F1B807',
};

// Color palette for the picker (8-10 common colors)
const COLOR_PALETTE = ['#E0392B', '#E8833A', '#F1B807', '#4C9A2A', '#0E8A6E', '#2B7DE9', '#6C5CE7', '#D6336C', '#7A5C3E', '#566573'];

// Raw SVG inner markup for each icon, used to render map markers as data-URIs.
// (Kept minimal — white stroke on a colored circle.)
const ICON_SVG_PATHS = {
  pin:      '<path d="M12 21c-3.5-3.5-7-6.93-7-11a7 7 0 0 1 14 0c0 4.07-3.5 7.5-7 11Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="#fff" stroke-width="1.8"/>',
  food:     '<path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v5M9 3v5M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  cafe:     '<path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8ZM17 9h2a2 2 0 0 1 0 4h-2M7 3v2M10 3v2M13 3v2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  shrine:   '<path d="M3 7h18M4 7l1-2.5h14L20 7M6 7v13M18 7v13M5 11h14" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  castle:   '<path d="M4 21V8l2 1V6l2 1V5l2 1V4h4v2l2-1v2l2-1v3l2-1v13M4 21h16M9 21v-4a3 3 0 0 1 6 0v4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  nature:   '<path d="M12 3 5 13h4l-3 5h12l-3-5h4L12 3ZM12 18v3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  shopping: '<path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8ZM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  lodging:  '<path d="M3 18v-6a2 2 0 0 1 2-2h10a4 4 0 0 1 4 4v4M3 14h16M3 18v2M21 14v6M7 10V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  station:  '<rect x="5" y="3" width="14" height="13" rx="3" fill="none" stroke="#fff" stroke-width="1.7"/><line x1="5" y1="10" x2="19" y2="10" stroke="#fff" stroke-width="1.7"/><circle cx="9" cy="13.2" r="1" fill="#fff"/><circle cx="15" cy="13.2" r="1" fill="#fff"/><line x1="8.5" y1="16" x2="7" y2="20" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><line x1="15.5" y1="16" x2="17" y2="20" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  camera:   '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" fill="none" stroke="#fff" stroke-width="1.6"/>',
  heart:    '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>',
  star:     '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
};

// Resolve a place's effective icon and color (custom overrides, else category default, else fallback)
function placeIcon(p) { return p.icon || TAG_DEFAULT_ICON[p.tag] || 'pin'; }
function placeColor(p) { return p.wishlist ? WISHLIST_COLOR : (p.color || TAG_DEFAULT_COLOR[p.tag] || '#566573'); }
// Route effective color: custom color if set, else the transport's default color
function routeColor(r) { return r.color || (TRANSPORT[r.transport] || TRANSPORT.drive).color; }

// Build a Google Maps marker icon (data-URI SVG): colored teardrop pin with white glyph inside.
function buildMarkerIcon(iconKey, color, scale) {
  const glyph = ICON_SVG_PATHS[iconKey] || ICON_SVG_PATHS.pin;
  const size = Math.round(scale * 3.2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <g transform="translate(2.6 2.6) scale(0.78)">${glyph}</g>
  </svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}
// Marker base scale at zoom 14; scales down/up with zoom level
const MARKER_BASE_ZOOM = 14;
const MARKER_BASE_SCALE = 7;
const MARKER_MIN_SCALE = 3;
const MARKER_MAX_SCALE = 9.5;

// ── State ──
let map, directionsService, directionsRenderer, autocompleteService, placesService;
let currentUser, unsubscribePlaces, unsubscribeRoutes, unsubscribeTrips;
let places = [], routes = [], trips = [];
let markers = {}, polylines = {};
let mode = 'view', activeTab = 'places', currentFilter = '全部';
let viewMode = 'all';            // 'all' (flat) | 'trips' (grouped by year)
let selectedTripId = null;       // currently expanded/selected trip in trips view
let collapsedYears = new Set();  // which year groups are collapsed
let selectedPlaceId = null, selectedRouteId = null;
let editingPlaceId = null, pendingLatLng = null;
let editingTripId = null;        // for trip create/edit modal
let tripModalReturnToPlace = false;  // after creating a trip from the place modal, reopen place modal
let pendingIcon = 'food', pendingColor = '#E8833A';  // for the icon/color picker in add/edit modal
let topTransport = 'drive';       // for top search bar route mode
let routeClickTarget = null;      // pending {lat,lng,label} when picking origin/dest from map in route mode
let routeOriginCoord = null, routeDestCoord = null;  // precise coords when origin/dest picked from map
let pendingRoute = null;          // computed route awaiting details-form confirmation
let pendingRouteColor = '#378ADD';  // selected color in route details modal
let pendingImport = null;
let sidebarOpen = true;
let deleteSelected = new Set();
let searchMode = 'place'; // 'place' | 'route'

// ── Auth ──
window._auth = {
  async login() {
    const email = document.getElementById('l-email').value.trim();
    const pass  = document.getElementById('l-password').value;
    const err   = document.getElementById('login-error');
    err.classList.add('hidden');
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch(e) { err.textContent = friendlyError(e.code); err.classList.remove('hidden'); }
  },
  async loginGoogle() {
    try { await signInWithPopup(auth, googleProvider); }
    catch(e) { console.error(e); }
  },
  async signup() {
    const email = document.getElementById('s-email').value.trim();
    const pass  = document.getElementById('s-password').value;
    const err   = document.getElementById('signup-error');
    err.classList.add('hidden');
    try { await createUserWithEmailAndPassword(auth, email, pass); }
    catch(e) { err.textContent = friendlyError(e.code); err.classList.remove('hidden'); }
  },
  async logout() { await signOut(auth); },
  showSignup() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('signup-screen').classList.remove('hidden');
  },
  showLogin() {
    document.getElementById('signup-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  }
};

function friendlyError(code) {
  const m = {
    'auth/invalid-email': '電子郵件格式不正確',
    'auth/user-not-found': '找不到此帳號',
    'auth/wrong-password': '密碼錯誤',
    'auth/email-already-in-use': '此電子郵件已被使用',
    'auth/weak-password': '密碼至少需要 6 個字元',
    'auth/invalid-credential': '電子郵件或密碼錯誤',
  };
  return m[code] || '發生錯誤，請再試一次';
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('signup-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('settings-user-email').textContent = user.email || user.displayName || '';
    initMapWhenReady();
    subscribeData();
  } else {
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    if (unsubscribePlaces) unsubscribePlaces();
    if (unsubscribeRoutes) unsubscribeRoutes();
    if (unsubscribeTrips) unsubscribeTrips();
    clearMap();
  }
});

// ── Map ──
function initMapWhenReady() {
  if (window._mapReady && !map) initGoogleMap();
  else if (!map) window._onMapReady = initGoogleMap;
}

function initGoogleMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 36.2, lng: 138.5 },
    zoom: 5,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    gestureHandling: 'greedy',
    clickableIcons: true,  // keep Google's POI icons clickable
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: true, preserveViewport: true });
  // New Places API classes are loaded lazily via importLibrary in the search/POI functions.

  map.addListener('click', (e) => {
    // MANUAL DRAW MODE (train fallback): each click adds a point along the track
    if (manualDraw) {
      if (e.placeId) e.stop();
      addManualDrawPoint(e.latLng);
      return;
    }

    // ROUTE MODE: when the search bar is in route mode, clicking the map lets the user
    // set that point as origin or destination (works on both POIs and blank spots).
    if (searchMode === 'route') {
      if (e.placeId) {
        e.stop();
        // Fetch the POI's name so the route input shows a readable label
        handleRoutePointPick(e.latLng, e.placeId);
      } else {
        handleRoutePointPick(e.latLng, null);
      }
      return;
    }

    // If a built-in POI was clicked, e.placeId is set — show our own info card instead of Google's
    if (e.placeId) {
      e.stop();  // prevent Google's default POI info window
      if (mode === 'pin') {
        handlePoiClick(e.placeId, e.latLng, true);
      } else {
        handlePoiClick(e.placeId, e.latLng, false);
      }
      return;
    }
    if (mode === 'pin') {
      pendingLatLng = e.latLng;
      editingPlaceId = null;
      openAddModal();
    }
  });

  // Double-click finishes a manual draw
  map.addListener('dblclick', (e) => {
    if (manualDraw) { e.stop(); window.finishManualDraw(); }
  });

  // Rescale markers as zoom changes
  map.addListener('zoom_changed', () => { syncPlaceMarkers(); });

  setupTopSearch();
}

// Handle clicking a built-in Google POI icon: fetch details (new Places API), show info card
async function handlePoiClick(placeId, latLng, addImmediately) {
  try {
    const { Place } = await google.maps.importLibrary('places');
    const place = new Place({ id: placeId });
    await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount'] });
    const loc = place.location || latLng;
    if (addImmediately) {
      pendingLatLng = loc;
      editingPlaceId = null;
      openAddModal(place.displayName || '');
      return;
    }
    showPoiCard(place, loc);
  } catch (err) {
    console.warn('POI details error:', err);
  }
}

let poiCardData = null;
function showPoiCard(place, loc) {
  const name = place.displayName || '未命名地點';
  poiCardData = { name, loc };
  document.getElementById('poi-card-name').textContent = name;
  const addr = place.formattedAddress || '';
  let metaHtml = addr ? `<div class="poi-card-addr">${esc(addr)}</div>` : '';
  if (place.rating) {
    metaHtml += `<div class="poi-card-rating">★ ${place.rating} <span style="color:#aaa;">(${place.userRatingCount || 0})</span></div>`;
  }
  document.getElementById('poi-card-meta').innerHTML = metaHtml;
  document.getElementById('poi-card').classList.remove('hidden');
  map.panTo(loc);
}

window.closePoiCard = function() {
  document.getElementById('poi-card').classList.add('hidden');
  poiCardData = null;
};

window.addPoiToMap = function() {
  if (!poiCardData) return;
  pendingLatLng = poiCardData.loc;
  editingPlaceId = null;
  openAddModal(poiCardData.name);
  closePoiCard();
};

// ── Route-mode map click: pick this point as origin or destination ──
// Shows a small popup at screen position with two choices.
async function handleRoutePointPick(latLng, placeId) {
  let label;
  if (placeId) {
    // Resolve POI name via new Places API
    try {
      const { Place } = await google.maps.importLibrary('places');
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ['displayName', 'location'] });
      label = place.displayName || '選定地點';
    } catch {
      label = '選定地點';
    }
  } else {
    // Blank spot (or an unclickable label like a station name): reverse-geocode to a nearby name.
    label = await reverseGeocodeLabel(latLng);
  }
  routeClickTarget = { lat: latLng.lat(), lng: latLng.lng(), label };
  showRoutePointMenu(latLng);
}

// Reverse geocode a coordinate to the most useful nearby name (prefers stations/POIs)
function reverseGeocodeLabel(latLng) {
  return new Promise((resolve) => {
    try {
      if (!window._geocoder) window._geocoder = new google.maps.Geocoder();
      window._geocoder.geocode({ location: latLng, language: 'zh-TW' }, (results, status) => {
        if (status === 'OK' && results && results.length) {
          // Prefer a result that looks like a station or point of interest
          const station = results.find(r => (r.types || []).some(t =>
            ['transit_station', 'train_station', 'subway_station', 'point_of_interest', 'establishment'].includes(t)));
          const best = station || results[0];
          // Use the short name (first address component) rather than the full address
          const name = best.address_components && best.address_components.length
            ? best.address_components[0].long_name
            : best.formatted_address;
          resolve(name || `座標 ${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`);
        } else {
          resolve(`座標 ${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`);
        }
      });
    } catch {
      resolve(`座標 ${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`);
    }
  });
}

function showRoutePointMenu(latLng) {
  const menu = document.getElementById('route-point-menu');
  if (!menu) return;
  document.getElementById('rpm-label').textContent = routeClickTarget.label;
  menu.classList.remove('hidden');
}

window.setRoutePoint = function(which) {
  if (!routeClickTarget) return;
  // Make sure the search bar is in route mode and visible
  setSearchMode('route');
  const input = document.getElementById(which === 'origin' ? 'top-r-origin' : 'top-r-dest');
  if (input) input.value = routeClickTarget.label;
  // Store the actual coordinates so route search can use them precisely
  if (which === 'origin') routeOriginCoord = { lat: routeClickTarget.lat, lng: routeClickTarget.lng };
  else routeDestCoord = { lat: routeClickTarget.lat, lng: routeClickTarget.lng };
  closeRoutePointMenu();
};

window.closeRoutePointMenu = function() {
  document.getElementById('route-point-menu').classList.add('hidden');
  routeClickTarget = null;
};

function markerScaleForZoom() {
  const zoom = map.getZoom() || MARKER_BASE_ZOOM;
  const diff = zoom - MARKER_BASE_ZOOM;
  const scale = MARKER_BASE_SCALE + diff * 1.1;
  return Math.max(MARKER_MIN_SCALE, Math.min(MARKER_MAX_SCALE, scale));
}

// ══════════════════════════════════════
// TOP SEARCH BAR (Google Maps style)
// ══════════════════════════════════════
function setupTopSearch() {
  setupAutocompleteInput('top-search', 'top-search-results', async (prediction) => {
    // Place mode: selecting a result fetches details then opens add-place flow
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] });
    pendingLatLng = place.location;
    editingPlaceId = null;
    map.panTo(pendingLatLng);
    map.setZoom(16);
    openAddModal(place.displayName || '');
    document.getElementById('top-search').value = '';
    document.getElementById('top-search-results').classList.add('hidden');
  });

  setupAutocompleteInput('top-r-origin', 'top-origin-results', null, true);
  setupAutocompleteInput('top-r-dest', 'top-dest-results', null, true);
}

// Generic autocomplete wiring using the NEW Places API (AutocompleteSuggestion).
// onPredictionSelected(prediction): called with a PlacePrediction (place search mode)
// textOnly: if true, just fills the input text value (route origin/destination mode)
function setupAutocompleteInput(inputId, resultsId, onPredictionSelected, textOnly) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    // If the user manually edits a route input, drop any map-picked coordinate for that field
    if (inputId === 'top-r-origin') routeOriginCoord = null;
    if (inputId === 'top-r-dest') routeDestCoord = null;
    const val = input.value.trim();
    if (!val) { results.classList.add('hidden'); return; }
    t = setTimeout(() => fetchSuggestions(val, results, input, onPredictionSelected, textOnly), 280);
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.classList.add('hidden');
  });
}

async function fetchSuggestions(val, results, input, onPredictionSelected, textOnly) {
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
    if (!window._autoToken) window._autoToken = new AutocompleteSessionToken();
    // includedRegionCodes restricts to Japan; matches CJK/English/Japanese input alike.
    const request = {
      input: val,
      language: 'zh-TW',
      region: 'jp',
      includedRegionCodes: ['jp'],
      sessionToken: window._autoToken,
    };
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    if (!suggestions || suggestions.length === 0) {
      results.innerHTML = '<div class="search-result-empty">找不到符合的地點</div>';
      results.classList.remove('hidden');
      return;
    }
    const preds = suggestions.map(s => s.placePrediction).filter(Boolean);
    results.innerHTML = preds.slice(0, 6).map((p, i) => {
      const main = p.mainText?.text || p.text?.text || '';
      const secondary = p.secondaryText?.text || '';
      return `<div class="search-result-item" data-idx="${i}">
        <div class="sr-name">${esc(main)}</div>
        <div class="sr-addr">${esc(secondary)}</div>
      </div>`;
    }).join('');
    results.classList.remove('hidden');
    results.querySelectorAll('.search-result-item').forEach((el, i) => {
      el.onclick = async () => {
        const pred = preds[i];
        if (textOnly) {
          const main = pred.mainText?.text || pred.text?.text || '';
          const secondary = pred.secondaryText?.text || '';
          input.value = secondary ? `${main} ${secondary}` : main;
          results.classList.add('hidden');
        } else if (onPredictionSelected) {
          window._autoToken = null; // end session after selection
          await onPredictionSelected(pred);
        }
      };
    });
  } catch (err) {
    console.warn('Autocomplete error:', err);
    results.innerHTML = '<div class="search-result-empty">搜尋發生錯誤，請確認 Places API (New) 已啟用</div>';
    results.classList.remove('hidden');
  }
}

window.setSearchMode = function(m) {
  searchMode = m;
  document.getElementById('smode-place').classList.toggle('active', m === 'place');
  document.getElementById('smode-route').classList.toggle('active', m === 'route');
  document.getElementById('search-place-row').classList.toggle('hidden', m !== 'place');
  document.getElementById('search-route-row').classList.toggle('hidden', m !== 'route');
};

window.selectTopTransport = function(t) {
  topTransport = t;
  ['drive', 'walk', 'train'].forEach(x => document.getElementById('rt-' + x).classList.toggle('active', x === t));
};

window.topSearchRoute = function() {
  const originText = document.getElementById('top-r-origin').value.trim();
  const destText   = document.getElementById('top-r-dest').value.trim();
  if (!originText || !destText) { alert('請輸入起點和終點'); return; }
  // Use precise coordinates if the point was picked from the map, else use the typed text
  const origin = routeOriginCoord || originText;
  const dest   = routeDestCoord || destText;
  const name = `${originText} → ${destText}`;
  searchAndSaveRoute(origin, dest, name, topTransport, 'top-route-go');
};

// ══════════════════════════════════════
// Firestore
// ══════════════════════════════════════
function subscribeData() {
  const uid = currentUser.uid;
  const pq = query(collection(db, 'places'), where('uid', '==', uid));
  unsubscribePlaces = onSnapshot(pq, (snap) => {
    places = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    syncPlaceMarkers();
    renderList();
  });
  const rq = query(collection(db, 'routes'), where('uid', '==', uid));
  unsubscribeRoutes = onSnapshot(rq, (snap) => {
    routes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    syncRoutePolylines();
    renderList();
  });
  const tq = query(collection(db, 'trips'), where('uid', '==', uid));
  unsubscribeTrips = onSnapshot(tq, (snap) => {
    trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshTripDropdowns();
    renderList();
  });
}

async function addPlace(data) { await addDoc(collection(db, 'places'), { ...data, uid: currentUser.uid, createdAt: Date.now() }); }
async function updatePlace(id, data) { await updateDoc(doc(db, 'places', id), data); }
async function deletePlace(id) { await deleteDoc(doc(db, 'places', id)); }
async function addRoute(data) { await addDoc(collection(db, 'routes'), { ...data, uid: currentUser.uid, createdAt: Date.now() }); }
async function deleteRoute(id) { await deleteDoc(doc(db, 'routes', id)); }
async function addTrip(data) { return await addDoc(collection(db, 'trips'), { ...data, uid: currentUser.uid, createdAt: Date.now() }); }
async function updateTrip(id, data) { await updateDoc(doc(db, 'trips', id), data); }
async function deleteTrip(id) { await deleteDoc(doc(db, 'trips', id)); }

// Year derived from a trip's start date
function tripYear(t) { return (t.start || '').slice(0, 4) || '未定年份'; }

// ══════════════════════════════════════
// Markers & Polylines
// ══════════════════════════════════════
function syncPlaceMarkers() {
  const ids = new Set(places.map(p => p.id));
  Object.keys(markers).forEach(id => { if (!ids.has(id)) { markers[id].setMap(null); delete markers[id]; } });
  const scale = markerScaleForZoom();
  places.forEach(p => {
    const sel = selectedPlaceId === p.id;
    const iconKey = placeIcon(p);
    const color = placeColor(p);
    const icon = buildMarkerIcon(iconKey, color, sel ? scale * 1.35 : scale);
    if (markers[p.id]) { markers[p.id].setIcon(icon); markers[p.id].setZIndex(sel ? 999 : 1); return; }
    const marker = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.name, icon, zIndex: sel ? 999 : 1 });
    marker.addListener('click', () => selectPlace(p.id));
    markers[p.id] = marker;
  });
}

function syncRoutePolylines() {
  const ids = new Set(routes.map(r => r.id));
  Object.keys(polylines).forEach(id => { if (!ids.has(id)) { polylines[id].setMap(null); delete polylines[id]; } });
  routes.forEach(r => {
    const t = TRANSPORT[r.transport] || TRANSPORT.drive;
    const color = routeColor(r);
    const sel = selectedRouteId === r.id;
    if (polylines[r.id]) {
      polylines[r.id].setOptions({ strokeColor: color, strokeWeight: sel ? 5 : 3, strokeOpacity: sel ? 1 : 0.75 });
      return;
    }
    const path = (r.points || []).map(p => ({ lat: p.lat, lng: p.lng }));
    const poly = new google.maps.Polyline({
      path, map,
      strokeColor: color, strokeWeight: 3, strokeOpacity: 0.75,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: `${t.dash[0] + t.dash[1]}px` }]
    });
    poly.addListener('click', () => selectRoute(r.id));
    // Hover tooltip: show route name + transport type
    poly.addListener('mouseover', (e) => showRouteTooltip(e.latLng, r));
    poly.addListener('mousemove', (e) => moveRouteTooltip(e.latLng));
    poly.addListener('mouseout', hideRouteTooltip);
    polylines[r.id] = poly;
  });
}

// Route hover tooltip (an InfoWindow that follows the cursor)
let routeTooltip = null;
function showRouteTooltip(latLng, r) {
  const t = TRANSPORT[r.transport] || TRANSPORT.drive;
  if (!routeTooltip) routeTooltip = new google.maps.InfoWindow({ disableAutoPan: true });
  const fareStr = r.fare ? `｜¥${esc(String(r.fare))}` : '';
  routeTooltip.setContent(
    `<div style="font-size:12px;padding:2px 4px;"><b>${esc(r.name)}</b><br>交通方式：${t.label}${r.cat ? '｜' + esc(r.cat) : ''}${fareStr}</div>`
  );
  routeTooltip.setPosition(latLng);
  routeTooltip.open(map);
}
function moveRouteTooltip(latLng) { if (routeTooltip) routeTooltip.setPosition(latLng); }
function hideRouteTooltip() { if (routeTooltip) routeTooltip.close(); }

function clearMap() {
  Object.values(markers).forEach(m => m.setMap(null));
  Object.values(polylines).forEach(p => p.setMap(null));
  markers = {}; polylines = {}; places = []; routes = []; trips = [];
}

// ══════════════════════════════════════
// Selection
// ══════════════════════════════════════
function selectPlace(id) {
  if (mode === 'delete') { toggleDeleteItem('place', id); return; }
  selectedPlaceId = id; selectedRouteId = null;
  const p = places.find(x => x.id === id);
  if (!p) return;
  const color = placeColor(p);
  document.getElementById('info-name').textContent = p.name;
  document.getElementById('info-meta').innerHTML =
    `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:${color}22;color:${color};margin-right:6px;">${p.tag}</span>${p.date || ''}`;
  document.getElementById('info-note').textContent = p.note || '（尚無筆記）';
  document.getElementById('info-panel').classList.remove('hidden');
  syncPlaceMarkers(); renderList();
  map.panTo({ lat: p.lat, lng: p.lng });
}

function selectRoute(id) {
  if (mode === 'delete') { toggleDeleteItem('route', id); return; }
  selectedRouteId = id; selectedPlaceId = null;
  document.getElementById('info-panel').classList.add('hidden');
  syncRoutePolylines(); renderList();
}

window.closeInfoPanel = function() {
  selectedPlaceId = null; selectedRouteId = null;
  document.getElementById('info-panel').classList.add('hidden');
  syncPlaceMarkers(); renderList();
};

window.editSelectedPlace = function() {
  const p = places.find(x => x.id === selectedPlaceId);
  if (!p) return;
  editingPlaceId = p.id;
  document.getElementById('modal-title').textContent = '編輯地點';
  document.getElementById('f-name').value = p.name;
  document.getElementById('f-tag').value = p.tag || '美食';
  document.getElementById('f-date').value = p.date || '';
  document.getElementById('f-note').value = p.note || '';
  document.getElementById('f-wishlist').checked = !!p.wishlist;
  applyWishlistUI(!!p.wishlist);
  // Populate pickers with this place's stored icon/color (raw, not the black wishlist override)
  pendingIcon = p.icon || TAG_DEFAULT_ICON[p.tag] || 'pin';
  pendingColor = p.color || TAG_DEFAULT_COLOR[p.tag] || '#566573';
  renderIconPicker();
  renderColorPicker();
  refreshTripDropdowns();
  document.getElementById('f-trip').value = p.tripId || '';
  document.getElementById('add-modal').classList.remove('hidden');
};

window.deleteSelectedPlace = async function() {
  if (!selectedPlaceId || !confirm('確定要刪除這個地點嗎？')) return;
  if (markers[selectedPlaceId]) { markers[selectedPlaceId].setMap(null); delete markers[selectedPlaceId]; }
  await deletePlace(selectedPlaceId);
  selectedPlaceId = null;
  document.getElementById('info-panel').classList.add('hidden');
};

// ══════════════════════════════════════
// Delete Mode
// ══════════════════════════════════════
function toggleDeleteItem(type, id) {
  const key = `${type}:${id}`;
  if (deleteSelected.has(key)) deleteSelected.delete(key);
  else deleteSelected.add(key);
  document.getElementById('delete-count').textContent = `已選 ${deleteSelected.size} 項`;
  renderList();
}

window.confirmDelete = async function() {
  if (deleteSelected.size === 0) return;
  if (!confirm(`確定要刪除 ${deleteSelected.size} 個項目嗎？此動作無法復原。`)) return;
  for (const key of deleteSelected) {
    const [type, id] = key.split(':');
    if (type === 'place') {
      if (markers[id]) { markers[id].setMap(null); delete markers[id]; }
      await deletePlace(id);
    } else if (type === 'route') {
      if (polylines[id]) { polylines[id].setMap(null); delete polylines[id]; }
      await deleteRoute(id);
    }
  }
  deleteSelected.clear();
  setMode('view');
};

// ══════════════════════════════════════
// Mode
// ══════════════════════════════════════
window.setMode = function(m) {
  mode = m;
  deleteSelected.clear();
  ['view', 'pin'].forEach(x => {
    const b = document.getElementById('btn-' + x);
    if (b) b.classList.toggle('active', x === m);
  });
  const delBtn = document.getElementById('btn-delete');
  if (delBtn) delBtn.classList.toggle('delete-mode', m === 'delete');
  const delBar = document.getElementById('delete-bar');
  delBar.classList.toggle('hidden', m !== 'delete');
  document.getElementById('delete-count').textContent = '已選 0 項';
  const ind = document.getElementById('mode-indicator');
  if (m === 'pin') { ind.textContent = '點擊地圖新增地點'; ind.classList.remove('hidden'); }
  else if (m === 'delete') { ind.textContent = '點擊地點或路線來選取'; ind.classList.remove('hidden'); }
  else { ind.classList.add('hidden'); }
  if (map) map.setOptions({ draggableCursor: (m === 'pin') ? 'crosshair' : '' });
  renderList();
};

// ══════════════════════════════════════
// Sidebar / Tabs / Filter
// ══════════════════════════════════════
window.toggleSidebar = function() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sidebarOpen);
  document.getElementById('reopen-btn').classList.toggle('hidden', sidebarOpen);
};

window.switchTab = function(tab) {
  activeTab = tab;
  document.getElementById('tab-places').classList.toggle('active', tab === 'places');
  document.getElementById('tab-routes').classList.toggle('active', tab === 'routes');
  document.getElementById('filter-bar').style.display = tab === 'places' ? 'flex' : 'none';
  renderList();
};

window.filterTag = function(el, tag) {
  currentFilter = tag;
  document.querySelectorAll('.tag-filter').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderList();
};

window.setViewMode = function(vm) {
  viewMode = vm;
  document.getElementById('vm-all').classList.toggle('active', vm === 'all');
  document.getElementById('vm-trips').classList.toggle('active', vm === 'trips');
  document.getElementById('all-view').classList.toggle('hidden', vm !== 'all');
  document.getElementById('trips-view').classList.toggle('hidden', vm !== 'trips');
  renderList();
};

// ══════════════════════════════════════
// Render List
// ══════════════════════════════════════
function renderList() {
  if (viewMode === 'trips') { renderTripsTree(); renderStats(); return; }

  const list = document.getElementById('content-list');
  if (activeTab === 'places') {
    const f = currentFilter === '全部' ? places : places.filter(p => p.tag === currentFilter);
    if (f.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無地點記錄<br>用上方搜尋列或「新增」按鈕加入地點</div>';
    } else {
      list.innerHTML = f.map(p => placeItemHtml(p)).join('');
    }
  } else {
    if (routes.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無路線記錄<br>用上方搜尋列規劃路線，或手動畫路線</div>';
    } else {
      list.innerHTML = routes.map(r => routeItemHtml(r)).join('');
    }
  }
  renderStats();
}

function placeItemHtml(p) {
  const sel = selectedPlaceId === p.id;
  const delSel = deleteSelected.has(`place:${p.id}`);
  const color = placeColor(p);
  const iconKey = placeIcon(p);
  const wishBadge = p.wishlist ? `<span class="wish-badge">想去</span>` : '';
  const fav = !!p.favorite;
  const heart = mode === 'delete' ? '' :
    `<button class="fav-btn${fav ? ' active' : ''}" title="${fav ? '取消收藏' : '加入我的最愛'}" onclick="event.stopPropagation();toggleFavorite('${p.id}')">
      <svg class="icon"><use href="#icon-heart-${fav ? 'filled' : 'outline'}"/></svg>
    </button>`;
  return `<div class="place-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" onclick="selectPlace('${p.id}')">
    ${mode === 'delete' ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
    ${heart}
    <div class="place-icon" style="background:${color};"><svg class="icon" style="color:#fff;"><use href="#pin-${iconKey}"/></svg></div>
    <div class="place-info">
      <div class="place-name">${esc(p.name)}${wishBadge}</div>
      <div class="place-meta">${p.date || ''}</div>
      <span class="place-tag" style="background:${color}1f;color:${color};">${p.tag}</span>
    </div>
  </div>`;
}

window.toggleFavorite = async function(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  await updatePlace(id, { favorite: !p.favorite });
};

function routeItemHtml(r) {
  const t = TRANSPORT[r.transport] || TRANSPORT.drive;
  const color = routeColor(r);
  const sel = selectedRouteId === r.id;
  const delSel = deleteSelected.has(`route:${r.id}`);
  const catBadge = r.cat ? `<span class="route-cat-badge">${esc(r.cat)}</span>` : '';
  const fareStr = r.fare ? ` · ¥${esc(String(r.fare))}` : '';
  return `<div class="route-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" onclick="selectRoute('${r.id}')">
    ${mode === 'delete' ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
    <div class="route-swatch" style="background:${color};"></div>
    <div class="route-info">
      <div class="route-name">${esc(r.name)}</div>
      <div class="route-meta">${r.date || ''}${r.date ? ' · ' : ''}${(r.points || []).length} 個節點${fareStr}</div>
      <span class="transport-badge" style="background:${color}22;color:${color};">${t.label}</span>${catBadge}
    </div>
  </div>`;
}

// Render the year → trip → items tree
function renderTripsTree() {
  const list = document.getElementById('content-list');
  const wishPlaces = places.filter(p => p.wishlist);
  const favPlaces = places.filter(p => p.favorite);
  const realPlaces = places.filter(p => !p.wishlist);  // visited/normal places

  if (trips.length === 0 && realPlaces.every(p => !p.tripId) && routes.every(r => !r.tripId) && wishPlaces.length === 0 && favPlaces.length === 0) {
    list.innerHTML = '<div class="list-empty">尚無行程<br>點上方「新增行程」建立你的第一個行程<br>或在新增地點時勾選「想去的地方」</div>';
    return;
  }

  let html = '';

  // ── 我的最愛 group (all favorited places) ──
  if (favPlaces.length > 0) {
    const collapsed = collapsedYears.has('__favorite__');
    html += `<div class="year-group">
      <div class="favorite-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__favorite__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        <svg class="icon" style="width:14px;height:14px;color:#E0245E;"><use href="#icon-heart-filled"/></svg>
        我的最愛
        <span class="year-count">${favPlaces.length} 個</span>
      </div>`;
    if (!collapsed) {
      html += favPlaces.map(p => placeItemHtml(p)).join('');
    }
    html += `</div>`;
  }

  // ── 想去的地方 group (all wishlist places, regardless of their tripId) ──
  if (wishPlaces.length > 0) {
    const collapsed = collapsedYears.has('__wishlist__');
    html += `<div class="year-group">
      <div class="wishlist-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__wishlist__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        <svg class="icon" style="width:14px;height:14px;color:#1a1a1a;"><use href="#pin-heart"/></svg>
        想去的地方
        <span class="year-count">${wishPlaces.length} 個</span>
      </div>`;
    if (!collapsed) {
      html += wishPlaces.map(p => placeItemHtml(p)).join('');
    }
    html += `</div>`;
  }

  // Group trips by year
  const byYear = {};
  trips.forEach(t => {
    const y = tripYear(t);
    (byYear[y] = byYear[y] || []).push(t);
  });
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  // Within a year, sort by the user's manual order if set, else by start date descending
  years.forEach(y => byYear[y].sort((a, b) => {
    const ao = (typeof a.order === 'number') ? a.order : null;
    const bo = (typeof b.order === 'number') ? b.order : null;
    if (ao !== null && bo !== null) return ao - bo;
    if (ao !== null) return -1;
    if (bo !== null) return 1;
    return (b.start || '').localeCompare(a.start || '');
  }));

  years.forEach(y => {
    const collapsed = collapsedYears.has(y);
    html += `<div class="year-group">
      <div class="year-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('${y}')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        ${y} 年
        <span class="year-count">${byYear[y].length} 個行程</span>
      </div>`;
    if (!collapsed) {
      byYear[y].forEach(t => {
        // Visited places only (wishlist places live in their own group)
        const tripPlaces = realPlaces.filter(p => p.tripId === t.id);
        const tripRoutes = routes.filter(r => r.tripId === t.id);
        const expanded = selectedTripId === t.id;
        const dateStr = t.start ? (t.end && t.end !== t.start ? `${t.start} ~ ${t.end}` : t.start) : '';
        html += `<div class="trip-folder" draggable="true" data-trip-id="${t.id}" data-year="${y}"
            ondragstart="onTripDragStart(event,'${t.id}','${y}')"
            ondragover="onTripDragOver(event)"
            ondrop="onTripDrop(event,'${t.id}','${y}')"
            ondragend="onTripDragEnd(event)">
          <div class="trip-header${expanded ? ' selected' : ''}" onclick="toggleTrip('${t.id}')">
            <svg class="drag-handle icon" title="拖曳排序"><use href="#icon-grip"/></svg>
            <svg class="trip-folder-icon icon"><use href="#pin-star"/></svg>
            <div style="flex:1;min-width:0;">
              <div class="trip-name">${esc(t.name)}</div>
              <div class="trip-dates">${dateStr} · ${tripPlaces.length} 地點 / ${tripRoutes.length} 路線</div>
            </div>
            <button class="trip-edit-btn" onclick="event.stopPropagation();editTrip('${t.id}')"><svg class="icon"><use href="#icon-edit"/></svg></button>
          </div>`;
        if (expanded) {
          html += '<div class="trip-children">';
          if (tripPlaces.length === 0 && tripRoutes.length === 0) {
            html += '<div class="list-empty" style="padding:10px 14px;">此行程尚無地點或路線</div>';
          } else {
            html += tripPlaces.map(p => placeItemHtml(p)).join('');
            html += tripRoutes.map(r => routeItemHtml(r)).join('');
          }
          html += '</div>';
        }
        html += `</div>`;
      });
    }
    html += `</div>`;
  });

  // Unfiled (no trip, visited only) section
  const unfiledPlaces = realPlaces.filter(p => !p.tripId);
  const unfiledRoutes = routes.filter(r => !r.tripId);
  if (unfiledPlaces.length > 0 || unfiledRoutes.length > 0) {
    const collapsed = collapsedYears.has('__unfiled__');
    html += `<div class="year-group">
      <div class="unfiled-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__unfiled__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        未分類
        <span class="year-count">${unfiledPlaces.length + unfiledRoutes.length} 項</span>
      </div>`;
    if (!collapsed) {
      html += unfiledPlaces.map(p => placeItemHtml(p)).join('');
      html += unfiledRoutes.map(r => routeItemHtml(r)).join('');
    }
    html += `</div>`;
  }

  list.innerHTML = html;
}

window.toggleYear = function(y) {
  if (collapsedYears.has(y)) collapsedYears.delete(y);
  else collapsedYears.add(y);
  renderTripsTree();
};

window.toggleTrip = function(id) {
  selectedTripId = selectedTripId === id ? null : id;
  renderTripsTree();
};

// ── Trip drag-to-reorder (within the same year only) ──
let dragTripId = null, dragTripYear = null;
window.onTripDragStart = function(e, id, year) {
  dragTripId = id; dragTripYear = year;
  e.dataTransfer.effectAllowed = 'move';
  // Some browsers require data to be set for drag to work
  try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
  const folder = e.currentTarget;
  setTimeout(() => folder.classList.add('dragging'), 0);
};
window.onTripDragOver = function(e) {
  e.preventDefault();  // allow drop
  e.dataTransfer.dropEffect = 'move';
  const folder = e.currentTarget;
  document.querySelectorAll('.trip-folder.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (folder.dataset.tripId !== dragTripId && folder.dataset.year === dragTripYear) {
    folder.classList.add('drag-over');
  }
};
window.onTripDrop = async function(e, targetId, year) {
  e.preventDefault();
  document.querySelectorAll('.trip-folder.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (!dragTripId || dragTripId === targetId || year !== dragTripYear) return;

  // Build the current ordered list of trips in this year
  const yearTrips = trips.filter(t => tripYear(t) === year).sort((a, b) => {
    const ao = (typeof a.order === 'number') ? a.order : null;
    const bo = (typeof b.order === 'number') ? b.order : null;
    if (ao !== null && bo !== null) return ao - bo;
    if (ao !== null) return -1;
    if (bo !== null) return 1;
    return (b.start || '').localeCompare(a.start || '');
  });
  const ids = yearTrips.map(t => t.id);
  const from = ids.indexOf(dragTripId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;
  // Move dragged item to the target position
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  // Persist new order (index-based) for every trip in this year
  await Promise.all(ids.map((id, idx) => updateTrip(id, { order: idx })));
  dragTripId = null; dragTripYear = null;
};
window.onTripDragEnd = function(e) {
  document.querySelectorAll('.trip-folder.dragging, .trip-folder.drag-over')
    .forEach(el => el.classList.remove('dragging', 'drag-over'));
  dragTripId = null; dragTripYear = null;
};

function renderStats() {
  document.getElementById('st-places').textContent = places.length;
  document.getElementById('st-routes').textContent = routes.length;
  const st = document.getElementById('st-trips');
  if (st) st.textContent = trips.length;
}

// ══════════════════════════════════════
// Trips
// ══════════════════════════════════════
// Populate the trip <select> dropdowns in place modal
function refreshTripDropdowns() {
  const sorted = [...trips].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const opts = '<option value="">未分類</option>' +
    sorted.map(t => `<option value="${t.id}">${esc(t.name)}${t.start ? ' (' + t.start + ')' : ''}</option>`).join('') +
    '<option value="__new__">＋ 新增行程…</option>';
  const fTrip = document.getElementById('f-trip');
  if (fTrip) { const v = fTrip.value; fTrip.innerHTML = opts; fTrip.value = v; }
}

// When the place's trip dropdown changes to "新增行程", open the trip modal
window.onTripSelectChange = function() {
  const fTrip = document.getElementById('f-trip');
  if (fTrip && fTrip.value === '__new__') {
    fTrip.value = '';  // reset selection
    openTripModal(true);  // open in "return to place modal" mode
  }
};

window.openTripModal = function(returnToPlace) {
  editingTripId = null; window._editingTripId = null;
  tripModalReturnToPlace = !!returnToPlace;  // if true, after saving, reopen place modal with new trip selected
  document.getElementById('trip-modal-title').textContent = '新增行程';
  document.getElementById('tp-name').value = '';
  document.getElementById('tp-start').value = '';
  document.getElementById('tp-end').value = '';
  document.getElementById('trip-delete-btn').classList.add('hidden');
  document.getElementById('trip-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('tp-name').focus(), 50);
};

window.editTrip = function(id) {
  const t = trips.find(x => x.id === id);
  if (!t) return;
  editingTripId = id; window._editingTripId = id;
  tripModalReturnToPlace = false;
  document.getElementById('trip-modal-title').textContent = '編輯行程';
  document.getElementById('tp-name').value = t.name || '';
  document.getElementById('tp-start').value = t.start || '';
  document.getElementById('tp-end').value = t.end || '';
  document.getElementById('trip-delete-btn').classList.remove('hidden');
  document.getElementById('trip-modal').classList.remove('hidden');
};

window.closeTripModal = function() {
  document.getElementById('trip-modal').classList.add('hidden');
  editingTripId = null; window._editingTripId = null;
  tripModalReturnToPlace = false;
};

window.saveTrip = async function() {
  const name = document.getElementById('tp-name').value.trim();
  if (!name) { document.getElementById('tp-name').focus(); return; }
  const start = document.getElementById('tp-start').value;
  const end = document.getElementById('tp-end').value;
  // If only one date given, mirror it so the trip still has a year
  const data = { name, start: start || end || '', end: end || start || '' };
  let newId = null;
  if (editingTripId) {
    await updateTrip(editingTripId, data);
  } else {
    const ref = await addTrip(data);
    newId = ref.id;
    selectedTripId = ref.id;  // expand the newly created trip
  }
  const returnToPlace = tripModalReturnToPlace;
  closeTripModal();
  // If this trip was created from within the place modal, reopen it and select the new trip
  if (returnToPlace && newId) {
    document.getElementById('add-modal').classList.remove('hidden');
    refreshTripDropdowns();
    document.getElementById('f-trip').value = newId;
  }
};

// Delete a trip — its places/routes become unfiled (tripId cleared), not deleted
window.deleteTripById = async function(id) {
  if (!id) return;
  if (!confirm('確定刪除這個行程嗎？行程內的地點和路線會變回「未分類」，不會被刪除。')) return;
  for (const p of places.filter(x => x.tripId === id)) await updatePlace(p.id, { tripId: '' });
  for (const r of routes.filter(x => x.tripId === id)) await updateRoute(r.id, { tripId: '' });
  await deleteTrip(id);
  if (selectedTripId === id) selectedTripId = null;
  closeTripModal();
};

async function updateRoute(id, data) { await updateDoc(doc(db, 'routes', id), data); }

// ══════════════════════════════════════
// Add / Edit Place
// ══════════════════════════════════════
function openAddModal(prefillName) {
  document.getElementById('modal-title').textContent = '新增地點';
  document.getElementById('f-name').value = prefillName || '';
  document.getElementById('f-note').value = '';
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('f-tag').value = '美食';
  document.getElementById('f-wishlist').checked = false;
  applyWishlistUI(false);
  // New place starts with the default icon/color for the default category
  pendingIcon = TAG_DEFAULT_ICON['美食'];
  pendingColor = TAG_DEFAULT_COLOR['美食'];
  renderIconPicker();
  renderColorPicker();
  refreshTripDropdowns();
  // If adding while a trip is expanded in trips view, pre-select that trip
  const fTrip = document.getElementById('f-trip');
  if (fTrip) fTrip.value = (viewMode === 'trips' && selectedTripId && selectedTripId !== '__wishlist__') ? selectedTripId : '';
  document.getElementById('add-modal').classList.remove('hidden');
  if (!prefillName) setTimeout(() => document.getElementById('f-name').focus(), 50);
}

// Toggle UI hints when "want to go" is checked (date label becomes optional/planned)
window.onWishlistToggle = function() {
  applyWishlistUI(document.getElementById('f-wishlist').checked);
};
function applyWishlistUI(isWish) {
  document.getElementById('f-date-label').textContent = isWish ? '預計造訪日期（可不填）' : '造訪日期';
}

// Icon / color picker state and rendering
function renderIconPicker() {
  const wrap = document.getElementById('icon-picker');
  wrap.innerHTML = Object.keys(ICON_CATALOG).map(key =>
    `<div class="icon-choice${pendingIcon === key ? ' selected' : ''}" title="${ICON_CATALOG[key].label}" onclick="pickIcon('${key}')">
      <svg class="icon"><use href="#pin-${key}"/></svg>
    </div>`
  ).join('');
}
function renderColorPicker() {
  const wrap = document.getElementById('color-picker');
  wrap.innerHTML = COLOR_PALETTE.map(c =>
    `<div class="color-choice${pendingColor === c ? ' selected' : ''}" style="background:${c};color:${c};" onclick="pickColor('${c}')"></div>`
  ).join('');
}
window.pickIcon = function(key) { pendingIcon = key; renderIconPicker(); };
window.pickColor = function(c) { pendingColor = c; renderColorPicker(); };

// When category changes, update icon/color to that category's defaults
// (only if the user hasn't been manually overriding — simplest: always snap to new category default)
window.onTagChange = function() {
  const tag = document.getElementById('f-tag').value;
  pendingIcon = TAG_DEFAULT_ICON[tag] || 'pin';
  pendingColor = TAG_DEFAULT_COLOR[tag] || '#566573';
  renderIconPicker();
  renderColorPicker();
};

window.savePlace = async function() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { document.getElementById('f-name').focus(); return; }
  const data = {
    name,
    tag:   document.getElementById('f-tag').value,
    date:  document.getElementById('f-date').value,
    note:  document.getElementById('f-note').value.trim(),
    icon:  pendingIcon,
    color: pendingColor,
    tripId: document.getElementById('f-trip').value || '',
    wishlist: document.getElementById('f-wishlist').checked,
  };
  if (editingPlaceId) {
    await updatePlace(editingPlaceId, data);
    selectedPlaceId = editingPlaceId;
    editingPlaceId = null;
  } else if (pendingLatLng) {
    data.lat = typeof pendingLatLng.lat === 'function' ? pendingLatLng.lat() : pendingLatLng.lat;
    data.lng = typeof pendingLatLng.lng === 'function' ? pendingLatLng.lng() : pendingLatLng.lng;
    await addPlace(data);
    pendingLatLng = null;
  }
  closeModal();
};

window.closeModal = function() {
  document.getElementById('add-modal').classList.add('hidden');
  pendingLatLng = null; editingPlaceId = null;
};

// ══════════════════════════════════════
// Settings Modal
// ══════════════════════════════════════
window.openSettings = function() { document.getElementById('settings-overlay').classList.remove('hidden'); };
window.closeSettings = function() { document.getElementById('settings-overlay').classList.add('hidden'); };

// ══════════════════════════════════════
// Auto Route (Directions API) — used by top search bar
// ══════════════════════════════════════
function searchAndSaveRoute(origin, dest, name, transport, triggerBtnId) {
  const travelMode = {
    drive: google.maps.TravelMode.DRIVING,
    walk:  google.maps.TravelMode.WALKING,
    train: google.maps.TravelMode.TRANSIT,
  }[transport];

  const request = { origin, destination: dest, travelMode, region: 'jp' };
  if (transport === 'train') request.transitOptions = { departureTime: new Date() };
  // For driving, ask Google for 2-3 alternative routes so the user can choose
  if (transport === 'drive') request.provideRouteAlternatives = true;

  const btn = triggerBtnId ? document.getElementById(triggerBtnId) : null;
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '搜尋中...'; btn.disabled = true; }

  directionsService.route(request, async (result, status) => {
    if (btn) { btn.textContent = origText; btn.disabled = false; }

    if (status !== google.maps.DirectionsStatus.OK) {
      if (transport === 'train') {
        // Translate Google's status into a plain-language reason
        let reason;
        if (status === 'ZERO_RESULTS') {
          reason = 'Google 沒有這段電車路線資料（常見於跨區、偏遠或起訖點離車站太遠）。';
        } else if (status === 'NOT_FOUND') {
          reason = '起點或終點無法定位（站名可能不夠明確）。建議用完整車站名，例如「鎌倉駅」。';
        } else if (status === 'OVER_QUERY_LIMIT') {
          reason = '查詢次數過多，請稍候再試。';
        } else if (status === 'REQUEST_DENIED') {
          reason = 'Directions API 權限被拒，請確認已啟用 Directions API。';
        } else {
          reason = `Google 回傳狀態：${status}`;
        }
        // Train fallback → let the user hand-draw the route on the map
        const draw = confirm(`找不到電車路線。\n\n原因：${reason}\n\n要改用「手繪路線」嗎？\n（在地圖上沿著鐵路逐點點擊，雙擊完成）`);
        if (draw) {
          startManualDraw(name, 'train', pendingRouteColorForDraw());
        }
      } else {
        alert(`找不到路線（狀態：${status}）。\n\n建議：輸入完整站名或地標名稱。`);
      }
      return;
    }

    // Driving with multiple alternatives → let user pick
    if (transport === 'drive' && result.routes.length > 1) {
      openRouteAlternativesPicker(result, name, transport);
      return;
    }
    await saveRouteFromResult(result, name, transport);
  });
}

// Default color for a hand-drawn route (uses transport default)
function pendingRouteColorForDraw() { return null; }

function clearTopRouteInputs() {
  document.getElementById('top-r-origin').value = '';
  document.getElementById('top-r-dest').value = '';
  routeOriginCoord = null; routeDestCoord = null;
}

async function saveRouteFromResult(result, name, transport, routeIndex) {
  const t = TRANSPORT[transport];
  const idx = routeIndex || 0;
  const leg = result.routes[idx].legs[0];
  const points = [];
  leg.steps.forEach(step => {
    if (step.steps) {
      step.steps.forEach(sub => sub.path.forEach(ll => points.push({ lat: ll.lat(), lng: ll.lng() })));
    } else {
      step.path.forEach(ll => points.push({ lat: ll.lat(), lng: ll.lng() }));
    }
  });

  const maxPts = 200;
  const interval = Math.max(1, Math.floor(points.length / maxPts));
  const sampled = points.filter((_, i) => i % interval === 0);
  if (points.length > 0 && sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }

  // Show the computed route on the map as a preview while the user fills in details
  directionsRenderer.setMap(map);
  directionsRenderer.setDirections(result);
  directionsRenderer.setRouteIndex(idx);
  directionsRenderer.setOptions({ polylineOptions: { strokeColor: t.color, strokeWeight: 4, strokeOpacity: 0.6 } });

  // Stash the route data and open the details form to collect category/date/note/trip
  pendingRoute = { name, transport, points: sampled };
  openRouteDetailsModal(name);
}

// ── Driving alternatives: draw all on map, click a line to choose ──
let altPickerData = null;      // { result, name, transport, selectedIndex }
let altPolylines = [];         // preview polylines for each alternative
function openRouteAlternativesPicker(result, name, transport) {
  altPickerData = { result, name, transport, selectedIndex: 0 };
  // Hide the built-in renderer; we draw our own clickable previews
  directionsRenderer.setMap(null);
  drawAltPreviews();
  // Populate the floating list
  const list = document.getElementById('route-alt-list');
  list.innerHTML = result.routes.map((rt, i) => {
    const leg = rt.legs[0];
    const summary = rt.summary || `路線 ${i + 1}`;
    const dist = leg.distance ? leg.distance.text : '';
    const dur = leg.duration ? leg.duration.text : '';
    return `<div class="route-alt-item" data-idx="${i}" onclick="selectAltRoute(${i})">
      <div class="route-alt-name">路線 ${i + 1}${summary ? '：' + esc(summary) : ''}</div>
      <div class="route-alt-meta">${dist}${dist && dur ? ' · ' : ''}${dur}</div>
    </div>`;
  }).join('');
  updateAltListSelection();
  document.getElementById('route-alt-modal').classList.remove('hidden');
}

function drawAltPreviews() {
  clearAltPreviews();
  const { result, selectedIndex } = altPickerData;
  result.routes.forEach((rt, i) => {
    const path = rt.overview_path || [];
    const selected = i === selectedIndex;
    const poly = new google.maps.Polyline({
      path, map,
      strokeColor: selected ? '#185FA5' : '#9AA5B1',
      strokeWeight: selected ? 6 : 4,
      strokeOpacity: selected ? 0.95 : 0.5,
      zIndex: selected ? 10 : 1,
    });
    poly.addListener('click', () => selectAltRoute(i));
    altPolylines.push(poly);
  });
}

function clearAltPreviews() {
  altPolylines.forEach(p => p.setMap(null));
  altPolylines = [];
}

window.selectAltRoute = function(i) {
  if (!altPickerData) return;
  altPickerData.selectedIndex = i;
  drawAltPreviews();
  updateAltListSelection();
};

function updateAltListSelection() {
  document.querySelectorAll('#route-alt-list .route-alt-item').forEach(el => {
    el.classList.toggle('selected', Number(el.dataset.idx) === altPickerData.selectedIndex);
  });
}

window.confirmRouteAlternative = async function() {
  if (!altPickerData) return;
  const { result, name, transport, selectedIndex } = altPickerData;
  clearAltPreviews();
  document.getElementById('route-alt-modal').classList.add('hidden');
  altPickerData = null;
  await saveRouteFromResult(result, name, transport, selectedIndex);
};

window.closeRouteAltModal = function() {
  clearAltPreviews();
  document.getElementById('route-alt-modal').classList.add('hidden');
  directionsRenderer.setMap(null);
  altPickerData = null;
};

// ── Manual route drawing (used as train fallback) ──
let manualDraw = null;  // { name, transport, color, path:[], polyline }
function startManualDraw(name, transport, color) {
  const t = TRANSPORT[transport] || TRANSPORT.train;
  manualDraw = { name, transport, color, path: [], polyline: null };
  manualDraw.polyline = new google.maps.Polyline({
    path: [], map, strokeColor: color || t.color, strokeWeight: 4, strokeOpacity: 0.8,
  });
  setMode('view');
  const ind = document.getElementById('mode-indicator');
  ind.textContent = '手繪路線：沿鐵路逐點點擊，雙擊完成';
  ind.classList.remove('hidden');
  // Show a finish button
  document.getElementById('manual-draw-bar').classList.remove('hidden');
}

function addManualDrawPoint(latLng) {
  if (!manualDraw) return;
  manualDraw.path.push({ lat: latLng.lat(), lng: latLng.lng() });
  manualDraw.polyline.setPath(manualDraw.path.map(p => ({ lat: p.lat, lng: p.lng })));
}

window.finishManualDraw = async function() {
  if (!manualDraw) return;
  document.getElementById('manual-draw-bar').classList.add('hidden');
  document.getElementById('mode-indicator').classList.add('hidden');
  if (manualDraw.path.length < 2) {
    alert('至少需要點兩個點才能畫出路線。');
    if (manualDraw.polyline) manualDraw.polyline.setMap(null);
    manualDraw = null;
    return;
  }
  // Stash and open the details form (reuse the same modal)
  if (manualDraw.polyline) manualDraw.polyline.setMap(null);
  pendingRoute = { name: manualDraw.name, transport: manualDraw.transport, points: manualDraw.path };
  const nm = manualDraw.name;
  manualDraw = null;
  openRouteDetailsModal(nm);
};

window.cancelManualDraw = function() {
  if (manualDraw && manualDraw.polyline) manualDraw.polyline.setMap(null);
  manualDraw = null;
  document.getElementById('manual-draw-bar').classList.add('hidden');
  document.getElementById('mode-indicator').classList.add('hidden');
};

// ── Route details modal (filled in after a route is computed) ──
function openRouteDetailsModal(defaultName) {
  document.getElementById('rd-name').value = defaultName || '';
  document.getElementById('rd-cat').value = ROUTE_CATEGORIES[0];
  document.getElementById('rd-transport').value = pendingRoute.transport;
  document.getElementById('rd-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('rd-note').value = '';
  document.getElementById('rd-fare').value = '';
  // Default route color = the transport's default color, but user can change it
  pendingRouteColor = (TRANSPORT[pendingRoute.transport] || TRANSPORT.drive).color;
  renderRouteColorPicker();
  onRouteTransportChange();  // show/hide fare row based on transport
  refreshRouteTripDropdown();
  const rdTrip = document.getElementById('rd-trip');
  if (rdTrip) rdTrip.value = (viewMode === 'trips' && selectedTripId && selectedTripId !== '__wishlist__') ? selectedTripId : '';
  document.getElementById('route-details-modal').classList.remove('hidden');
}

// Show the fare field only when transport is 電車
window.onRouteTransportChange = function() {
  const isTrain = document.getElementById('rd-transport').value === 'train';
  document.getElementById('rd-fare-row').classList.toggle('hidden', !isTrain);
};

function renderRouteColorPicker() {
  const wrap = document.getElementById('rd-color-picker');
  if (!wrap) return;
  wrap.innerHTML = COLOR_PALETTE.map(c =>
    `<div class="color-choice${pendingRouteColor === c ? ' selected' : ''}" style="background:${c};color:${c};" onclick="pickRouteColor('${c}')"></div>`
  ).join('');
}
window.pickRouteColor = function(c) { pendingRouteColor = c; renderRouteColorPicker(); };

window.closeRouteDetailsModal = function() {
  document.getElementById('route-details-modal').classList.add('hidden');
  directionsRenderer.setMap(null);
  pendingRoute = null;
};

window.saveRouteDetails = async function() {
  if (!pendingRoute) return;
  const name = document.getElementById('rd-name').value.trim() || pendingRoute.name;
  const data = {
    name,
    transport: document.getElementById('rd-transport').value,
    points: pendingRoute.points,
    cat:   document.getElementById('rd-cat').value,
    color: pendingRouteColor,
    date:  document.getElementById('rd-date').value,
    note:  document.getElementById('rd-note').value.trim(),
    fare:  document.getElementById('rd-transport').value === 'train' ? (document.getElementById('rd-fare').value || '') : '',
    tripId: document.getElementById('rd-trip').value || '',
  };
  await addRoute(data);
  directionsRenderer.setMap(null);
  pendingRoute = null;
  document.getElementById('route-details-modal').classList.add('hidden');
  clearTopRouteInputs();
  if (viewMode === 'all' && activeTab !== 'routes') switchTab('routes');
}

// Populate trip dropdown in the route details modal
function refreshRouteTripDropdown() {
  const sorted = [...trips].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const opts = '<option value="">未分類</option>' +
    sorted.map(t => `<option value="${t.id}">${esc(t.name)}${t.start ? ' (' + t.start + ')' : ''}</option>`).join('');
  const rdTrip = document.getElementById('rd-trip');
  if (rdTrip) { const v = rdTrip.value; rdTrip.innerHTML = opts; rdTrip.value = v; }
}

// ══════════════════════════════════════
// Import (Google Timeline)
// ══════════════════════════════════════
window.openImport = function() {
  document.getElementById('import-overlay').classList.remove('hidden');
  document.getElementById('import-result').classList.add('hidden');
  document.getElementById('import-confirm').classList.add('hidden');
  document.getElementById('file-input').value = '';
  pendingImport = null;
};
window.closeImport = function() { document.getElementById('import-overlay').classList.add('hidden'); };
window.handleDrop = function(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragover');
  const f = e.dataTransfer.files[0]; if (f) handleFile(f);
};
window.handleFile = function(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const result = parseGoogleTimeline(data);
      const res = document.getElementById('import-result');
      res.classList.remove('hidden');
      if (result.places.length === 0 && result.routes.length === 0) {
        res.textContent = '找不到可匯入的資料，請確認檔案格式。';
        res.className = 'error';
        document.getElementById('import-confirm').classList.add('hidden');
        pendingImport = null;
      } else {
        res.textContent = `找到 ${result.places.length} 個地點、${result.routes.length} 條路線，確認後加入地圖。`;
        res.className = 'success';
        document.getElementById('import-confirm').classList.remove('hidden');
        pendingImport = result;
      }
    } catch {
      const res = document.getElementById('import-result');
      res.classList.remove('hidden');
      res.textContent = '無法解析 JSON 檔案，請確認檔案未損壞。';
      res.className = 'error';
    }
  };
  reader.readAsText(file);
};

window.confirmImport = async function() {
  if (!pendingImport) return;
  const btn = document.getElementById('import-confirm');
  btn.textContent = '匯入中...'; btn.disabled = true;
  for (const p of pendingImport.places) await addPlace(p);
  for (const r of pendingImport.routes) await addRoute(r);
  closeImport();
  btn.textContent = '匯入'; btn.disabled = false;
};

function parseGoogleTimeline(data) {
  const out = { places: [], routes: [] };
  if (data.timelineObjects) {
    data.timelineObjects.forEach(obj => {
      if (obj.placeVisit) {
        const pv = obj.placeVisit; const loc = pv.location || {};
        if (loc.latitudeE7 && loc.longitudeE7) {
          out.places.push({
            name: loc.name || '未命名地點',
            tag: '文化', date: pv.duration?.startTimestamp?.slice(0, 10) || '',
            note: '從 Google 時間軸匯入',
            lat: loc.latitudeE7 / 1e7, lng: loc.longitudeE7 / 1e7,
          });
        }
      }
      if (obj.activitySegment) {
        const as = obj.activitySegment; const pts = [];
        if (as.startLocation?.latitudeE7) pts.push({ lat: as.startLocation.latitudeE7 / 1e7, lng: as.startLocation.longitudeE7 / 1e7 });
        if (as.endLocation?.latitudeE7) pts.push({ lat: as.endLocation.latitudeE7 / 1e7, lng: as.endLocation.longitudeE7 / 1e7 });
        if (pts.length >= 2) {
          const act = as.activityType || '';
          let transport = 'drive';
          if (act.includes('WALKING') || act.includes('FOOT')) transport = 'walk';
          else if (act.includes('SUBWAY') || act.includes('TRAIN') || act.includes('RAIL')) transport = 'train';
          out.routes.push({ name: '匯入路線', transport, points: pts });
        }
      }
    });
  }
  if (data.locations?.length > 0) {
    const pts = data.locations.slice(0, 100).filter(l => l.latitudeE7).map(l => ({ lat: l.latitudeE7 / 1e7, lng: l.longitudeE7 / 1e7 }));
    if (pts.length >= 2) out.routes.push({ name: '位置記錄軌跡', transport: 'drive', points: pts });
  }
  return out;
}

window.zoomIn = function() { if (map) map.setZoom(map.getZoom() + 1); };
window.zoomOut = function() { if (map) map.setZoom(map.getZoom() - 1); };
window.recenterMap = function() { if (map) { map.panTo({ lat: 36.2, lng: 138.5 }); map.setZoom(5); } };

// ── Expose globals ──
window.selectPlace = selectPlace;
window.selectRoute = selectRoute;

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
