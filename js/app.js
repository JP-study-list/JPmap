// ── Firebase ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── App modules ──
import {
  firebaseConfig, TRANSPORT, ROUTE_CATEGORIES, WISHLIST_COLOR, TAG_STYLE,
  ICON_CATALOG, TAG_DEFAULT_ICON, TAG_DEFAULT_COLOR, COLOR_PALETTE, ICON_SVG_PATHS,
  MARKER_BASE_ZOOM, MARKER_BASE_SCALE, MARKER_MIN_SCALE, MARKER_MAX_SCALE, FOOD_TYPES,
} from './config.js';
import { esc, placeIcon, placeColor, routeColor, byOrder, fmtDate, localToday, stripUndefined } from './helpers.js';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
// Local persistence: places/routes/trips remain readable offline
const db = initializeFirestore(fbApp, { localCache: persistentLocalCache() });
const googleProvider = new GoogleAuthProvider();

// Build a Google Maps marker icon (data-URI SVG), with a cache so identical
// icon+color+size combos are generated only once (faster marker refresh).
const markerIconCache = new Map();
function buildMarkerIcon(iconKey, color, scale) {
  const size = Math.round(scale * 3.2);
  const cacheKey = `${iconKey}|${color}|${size}`;
  if (markerIconCache.has(cacheKey)) return markerIconCache.get(cacheKey);
  const glyph = ICON_SVG_PATHS[iconKey] || ICON_SVG_PATHS.pin;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <g transform="translate(2.6 2.6) scale(0.78)">${glyph}</g>
  </svg>`;
  const icon = {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
  markerIconCache.set(cacheKey, icon);
  return icon;
}

// ── State ──
let map, directionsService, directionsRenderer, autocompleteService, placesService;
let currentUser, unsubscribePlaces, unsubscribeRoutes, unsubscribeTrips;
let places = [], routes = [], trips = [];
let markers = {}, polylines = {};
let mode = 'view', activeTab = 'places', currentFilter = '全部';
let viewMode = 'all';            // 'all' (flat) | 'trips' (grouped by year)
let selectedTripId = null;       // currently expanded/selected trip in trips view
let expandedGroups = new Set(); // which groups are expanded (default: ALL collapsed for a clean trips view)
let hiddenTripIds = new Set();  // trips whose markers/routes are hidden via the eye toggle (session only)
let selectedPlaceId = null, selectedRouteId = null;
let editingPlaceId = null, pendingLatLng = null;
let editingTripId = null;        // for trip create/edit modal
let tripModalReturnToPlace = false;  // after creating a trip from the place modal, reopen place modal
let pendingIcon = 'food', pendingColor = '#E8833A';  // for the icon/color picker in add/edit modal
let pendingRating = 0;           // star rating in place modal (0 = none)
let pendingPhotos = [];          // photo URLs in place modal (max 5)
let topTransport = 'drive';       // for top search bar route mode
let routeClickTarget = null;      // pending {lat,lng,label} when picking origin/dest from map in route mode
let routeOriginCoord = null, routeDestCoord = null;  // precise coords when origin/dest picked from map
let routePickTarget = null;       // 'origin'|'dest' — armed field waiting for a sidebar place pick
let pendingRoute = null;          // computed route awaiting details-form confirmation
let pendingRouteColor = '#378ADD';  // selected color in route details modal
let editingRouteId = null;        // set when editing an existing route via the details modal
let routesHidden = false;         // when true, all route polylines are hidden on the map
let listSearchText = '';          // sidebar list search filter (matches place/route names)
let restaurantMode = false;       // restaurant mode: map/list show only food places, routes hidden
let foodTypeFilter = '全部';      // active pill in the food filter bar
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

// Reverse geocode a coordinate to the most useful nearby name (prefers stations/POIs).
// Results are cached by rounded coordinate to avoid repeat API calls for the same spot.
const geocodeCache = new Map();
function reverseGeocodeLabel(latLng) {
  const cacheKey = `${latLng.lat().toFixed(4)},${latLng.lng().toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) return Promise.resolve(geocodeCache.get(cacheKey));
  return new Promise((resolve) => {
    const done = (label) => { geocodeCache.set(cacheKey, label); resolve(label); };
    try {
      if (!window._geocoder) window._geocoder = new google.maps.Geocoder();
      window._geocoder.geocode({ location: latLng, language: 'zh-TW' }, (results, status) => {
        if (status === 'OK' && results && results.length) {
          // Prefer a result that looks like a station or point of interest
          const station = results.find(r => (r.types || []).some(t =>
            ['transit_station', 'train_station', 'subway_station', 'point_of_interest', 'establishment'].includes(t)));
          const best = station || results[0];
          const name = best.address_components && best.address_components.length
            ? best.address_components[0].long_name
            : best.formatted_address;
          done(name || `座標 ${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`);
        } else {
          done(`座標 ${latLng.lat().toFixed(4)}, ${latLng.lng().toFixed(4)}`);
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
  // Inverted: zooming OUT (negative diff) enlarges markers so they stay visible over all of Japan
  const scale = MARKER_BASE_SCALE - diff * 0.55;
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
    if (inputId === 'top-r-origin') { routeOriginCoord = null; clearRoutePick(); }
    if (inputId === 'top-r-dest') { routeDestCoord = null; clearRoutePick(); }
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

// Arm an origin/dest field: the next sidebar place click fills it
window.armRoutePick = function(which) {
  if (searchMode !== 'route') return;
  routePickTarget = which;
  document.getElementById('top-r-origin').classList.toggle('picking', which === 'origin');
  document.getElementById('top-r-dest').classList.toggle('picking', which === 'dest');
};
function clearRoutePick() {
  routePickTarget = null;
  const o = document.getElementById('top-r-origin'), d = document.getElementById('top-r-dest');
  if (o) o.classList.remove('picking');
  if (d) d.classList.remove('picking');
}

window.setSearchMode = function(m) {
  if (m !== 'route') clearRoutePick();
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
// Coalesce list re-renders: the 3 Firestore snapshots would otherwise each rebuild
// the whole sidebar on first load. Batch them into one render on the next frame.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderList(); });
}

function subscribeData() {
  const uid = currentUser.uid;
  const pq = query(collection(db, 'places'), where('uid', '==', uid));
  unsubscribePlaces = onSnapshot(pq, (snap) => {
    places = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    places.sort(byOrder);
    syncPlaceMarkers();
    scheduleRender();
  });
  const rq = query(collection(db, 'routes'), where('uid', '==', uid));
  unsubscribeRoutes = onSnapshot(rq, (snap) => {
    routes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    routes.sort(byOrder);
    syncRoutePolylines();
    scheduleRender();
  });
  const tq = query(collection(db, 'trips'), where('uid', '==', uid));
  unsubscribeTrips = onSnapshot(tq, (snap) => {
    trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshTripDropdowns();
    scheduleRender();
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
// Cluster renderer: brand-colored circle with the count
let clusterer = null;
function clusterRenderer() {
  return {
    render({ count, position }) {
      const size = count < 10 ? 40 : count < 50 ? 46 : 54;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="22" fill="#185FA5" fill-opacity="0.92" stroke="#fff" stroke-width="2.5"/>
      </svg>`;
      return new google.maps.Marker({
        position,
        icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(size, size), anchor: new google.maps.Point(size/2, size/2) },
        label: { text: String(count), color: '#fff', fontSize: '13px', fontWeight: '600' },
        zIndex: 2000 + count,
      });
    }
  };
}

function syncPlaceMarkers() {
  const ids = new Set(places.map(p => p.id));
  Object.keys(markers).forEach(id => { if (!ids.has(id)) { markers[id].setMap(null); delete markers[id]; } });
  const scale = markerScaleForZoom();
  const visible = [];
  places.forEach(p => {
    const sel = selectedPlaceId === p.id;
    const iconKey = placeIcon(p);
    const color = placeColor(p);
    const icon = buildMarkerIcon(iconKey, color, sel ? scale * 1.35 : scale);
    let show = !(p.tripId && hiddenTripIds.has(p.tripId));
    if (restaurantMode) show = isRestaurant(p) && restaurantMatchesFilter(p);
    if (!markers[p.id]) {
      // Markers are created WITHOUT a map — the clusterer manages attachment
      const marker = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, title: p.name, icon, zIndex: sel ? 999 : 1 });
      marker.addListener('click', () => selectPlace(p.id));
      markers[p.id] = marker;
    } else {
      markers[p.id].setIcon(icon);
      markers[p.id].setZIndex(sel ? 999 : 1);
    }
    if (show) visible.push(markers[p.id]);
    else markers[p.id].setMap(null);
  });

  // Clustering only when zoomed OUT beyond the threshold (whole-Japan view).
  // Zoomed in past it (region level, e.g. all of Shikoku), every marker shows.
  const CLUSTER_MAX_ZOOM = 8;
  const useCluster = window.markerClusterer && map && map.getZoom() < CLUSTER_MAX_ZOOM;
  if (useCluster) {
    if (!clusterer) clusterer = new markerClusterer.MarkerClusterer({ map, markers: [], renderer: clusterRenderer() });
    clusterer.clearMarkers(true);
    clusterer.addMarkers(visible);
  } else {
    if (clusterer) clusterer.clearMarkers(true);
    visible.forEach(m => m.setMap(map));
  }
}

function syncRoutePolylines() {
  const ids = new Set(routes.map(r => r.id));
  Object.keys(polylines).forEach(id => { if (!ids.has(id)) { polylines[id].setMap(null); delete polylines[id]; } });
  routes.forEach(r => {
    const t = TRANSPORT[r.transport] || TRANSPORT.drive;
    const color = routeColor(r);
    const sel = selectedRouteId === r.id;
    const targetMap = (restaurantMode || routesHidden || (r.tripId && hiddenTripIds.has(r.tripId))) ? null : map;
    if (polylines[r.id]) {
      polylines[r.id].setMap(targetMap);
      polylines[r.id].setOptions({ strokeColor: color, strokeWeight: sel ? 5 : 3, strokeOpacity: sel ? 1 : 0.75 });
      return;
    }
    const path = (r.points || []).map(p => ({ lat: p.lat, lng: p.lng }));
    const poly = new google.maps.Polyline({
      path, map: targetMap,
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

window.toggleHideRoutes = function() {
  routesHidden = !routesHidden;
  document.getElementById('btn-hide-routes').classList.toggle('routes-off', routesHidden);
  syncRoutePolylines();
};

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
  if (mode === 'delete' || mode === 'batch') { toggleDeleteItem('place', id); return; }
  // Route-pick mode: clicking a sidebar place fills the armed origin/dest field
  if (searchMode === 'route' && routePickTarget) {
    const p = places.find(x => x.id === id);
    if (p) {
      const input = document.getElementById(routePickTarget === 'origin' ? 'top-r-origin' : 'top-r-dest');
      input.value = p.name;
      if (routePickTarget === 'origin') routeOriginCoord = { lat: p.lat, lng: p.lng };
      else routeDestCoord = { lat: p.lat, lng: p.lng };
      clearRoutePick();
    }
    return;
  }
  selectedPlaceId = id; selectedRouteId = null;
  const p = places.find(x => x.id === id);
  if (!p) return;
  const color = placeColor(p);
  document.getElementById('info-name').textContent = p.name;
  const stars = p.rating ? `<span class="info-stars">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</span>` : '';
  document.getElementById('info-meta').innerHTML =
    `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:${color}22;color:${color};margin-right:6px;">${p.tag}</span>${p.date || ''}${stars}`;
  document.getElementById('info-note').textContent = p.note || '（尚無筆記）';
  infoPhotos = Array.isArray(p.photos) ? p.photos : (p.photo ? [p.photo] : []);
  infoPhotoIdx = 0;
  renderInfoCarousel();
  // Show "mark as visited" button only for wishlist places
  const visitedBtn = document.getElementById('mark-visited-btn');
  if (visitedBtn) visitedBtn.classList.toggle('hidden', !p.wishlist);
  document.getElementById('info-panel').classList.remove('hidden');
  syncPlaceMarkers();
  updateListSelection();
  // Only move the map if the place is outside the current view (avoids jumpy panning)
  const pos = { lat: p.lat, lng: p.lng };
  const bounds = map.getBounds();
  if (!bounds || !bounds.contains(pos)) map.panTo(pos);
}

// ── Info panel photo carousel ──
let infoPhotos = [], infoPhotoIdx = 0;
function renderInfoCarousel() {
  const gallery = document.getElementById('info-photos');
  if (!infoPhotos.length) { gallery.classList.add('hidden'); gallery.innerHTML = ''; return; }
  const multi = infoPhotos.length > 1;
  const dots = multi
    ? `<div class="carousel-dots">${infoPhotos.map((_, i) => `<span class="dot${i === infoPhotoIdx ? ' on' : ''}"></span>`).join('')}</div>`
    : '';
  gallery.innerHTML = `
    <div class="carousel">
      ${multi ? '<button class="car-nav prev" onclick="infoPhotoNav(-1)">‹</button>' : ''}
      <img src="${esc(infoPhotos[infoPhotoIdx])}" alt="地點照片" onerror="this.style.display='none'" onclick="openLightbox()" style="cursor:zoom-in;">
      ${multi ? '<button class="car-nav next" onclick="infoPhotoNav(1)">›</button>' : ''}
    </div>${dots}`;
  gallery.classList.remove('hidden');
  // Touch swipe (mobile)
  if (multi) {
    const car = gallery.querySelector('.carousel');
    let sx = null;
    car.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    car.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) window.infoPhotoNav(dx < 0 ? 1 : -1);
      sx = null;
    }, { passive: true });
  }
}
window.infoPhotoNav = function(dir) {
  if (!infoPhotos.length) return;
  infoPhotoIdx = (infoPhotoIdx + dir + infoPhotos.length) % infoPhotos.length;
  renderInfoCarousel();
};

// ── Fullscreen image lightbox ──
window.openLightbox = function() {
  if (!infoPhotos.length) return;
  renderLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
};
window.closeLightbox = function() { document.getElementById('lightbox').classList.add('hidden'); };
function renderLightbox() {
  const multi = infoPhotos.length > 1;
  document.getElementById('lightbox-img').src = infoPhotos[infoPhotoIdx];
  document.getElementById('lightbox-prev').classList.toggle('hidden', !multi);
  document.getElementById('lightbox-next').classList.toggle('hidden', !multi);
  document.getElementById('lightbox-count').textContent = multi ? `${infoPhotoIdx + 1} / ${infoPhotos.length}` : '';
}
window.lightboxNav = function(e, dir) {
  e.stopPropagation();
  if (!infoPhotos.length) return;
  infoPhotoIdx = (infoPhotoIdx + dir + infoPhotos.length) % infoPhotos.length;
  renderLightbox();
  renderInfoCarousel();  // keep the small carousel in sync
};

// One-click: convert a wishlist place to "visited"
window.markAsVisited = async function() {
  if (!selectedPlaceId) return;
  const p = places.find(x => x.id === selectedPlaceId);
  if (!p || !p.wishlist) return;
  await updatePlace(selectedPlaceId, { wishlist: false });
  document.getElementById('mark-visited-btn').classList.add('hidden');
};

function selectRoute(id) {
  if (mode === 'delete') { toggleDeleteItem('route', id); return; }
  selectedRouteId = id; selectedPlaceId = null;
  document.getElementById('info-panel').classList.add('hidden');
  syncRoutePolylines();
  updateListSelection();
}

// Fast path: toggle .selected classes in the visible list without a full re-render
// (prevents the flicker caused by rebuilding innerHTML on every click)
function updateListSelection() {
  document.querySelectorAll('#content-list .place-item, #content-list .route-item').forEach(el => {
    const kind = el.dataset.itemKind, iid = el.dataset.itemId;
    if (!kind || !iid) return;
    const isSel = (kind === 'place' && iid === selectedPlaceId) || (kind === 'route' && iid === selectedRouteId);
    el.classList.toggle('selected', isSel);
  });
}

window.closeInfoPanel = function() {
  selectedPlaceId = null; selectedRouteId = null;
  document.getElementById('info-panel').classList.add('hidden');
  syncPlaceMarkers();
  updateListSelection();
};

window.editSelectedPlace = function() {
  const p = places.find(x => x.id === selectedPlaceId);
  if (!p) return;
  editingPlaceId = p.id;
  document.getElementById('modal-title').textContent = '編輯地點';
  document.getElementById('f-name').value = p.name;
  document.getElementById('f-tag').value = p.tag || '美食';
  applyFoodTypeRow(p.foodType || '');
  document.getElementById('f-date').value = p.date || '';
  document.getElementById('f-note').value = p.note || '';
  document.getElementById('f-gmaps-url').value = '';
  document.getElementById('f-gmaps-hint').classList.add('hidden');
  pendingRating = p.rating || 0; renderRatingPicker();
  pendingPhotos = Array.isArray(p.photos) ? p.photos.slice() : (p.photo ? [p.photo] : []);
  renderPhotoInputs();
  document.getElementById('f-wishlist').checked = !!p.wishlist;
  applyWishlistUI(!!p.wishlist);
  // Populate pickers with this place's stored icon/color (raw, not the black wishlist override)
  pendingIcon = p.icon || TAG_DEFAULT_ICON[p.tag] || 'pin';
  pendingColor = p.color || TAG_DEFAULT_COLOR[p.tag] || '#566573';
  renderIconPicker();
  renderColorPicker();
  refreshTripDropdowns();
  document.getElementById('f-trip').value = p.tripId || '';
  applyTripDateRange(p.date || '');
  document.getElementById('add-modal').classList.remove('hidden');
};

window.deleteSelectedPlace = async function() {
  if (!selectedPlaceId || !confirm('確定要刪除這個地點嗎？')) return;
  const p = places.find(x => x.id === selectedPlaceId);
  if (markers[selectedPlaceId]) { markers[selectedPlaceId].setMap(null); delete markers[selectedPlaceId]; }
  await deletePlace(selectedPlaceId);
  selectedPlaceId = null;
  document.getElementById('info-panel').classList.add('hidden');
  if (p) { lastDeleted = { places: [{ ...p }], routes: [] }; showUndoBar(1); }
};

// ══════════════════════════════════════
// Delete Mode
// ══════════════════════════════════════
function toggleDeleteItem(type, id) {
  const key = `${type}:${id}`;
  if (deleteSelected.has(key)) deleteSelected.delete(key);
  else deleteSelected.add(key);
  document.getElementById('delete-count').textContent = `已選 ${deleteSelected.size} 項`;
  const bc = document.getElementById('batch-count');
  if (bc) { const n = [...deleteSelected].filter(k => k.startsWith('place:')).length; bc.textContent = `已選 ${n} 個地點`; }
  renderList();
}

// ── Delete undo: snapshot deleted docs, restore within 6s via the snackbar ──
let lastDeleted = null;   // { places: [docData...], routes: [docData...] }
let undoTimer = null;

function showUndoBar(count) {
  const bar = document.getElementById('undo-bar');
  document.getElementById('undo-text').textContent = `已刪除 ${count} 個項目`;
  bar.classList.remove('hidden');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndoBar, 6000);
}
function hideUndoBar() {
  document.getElementById('undo-bar').classList.add('hidden');
  lastDeleted = null;
}
window.undoDelete = async function() {
  if (!lastDeleted) return;
  const { places: dp, routes: dr } = lastDeleted;
  hideUndoBar();
  // Re-insert with the original data (new document ids; original uid/createdAt/order kept)
  for (const d of dp) { const { id, ...data } = d; await addDoc(collection(db, 'places'), stripUndefined(data)); }
  for (const d of dr) { const { id, ...data } = d; await addDoc(collection(db, 'routes'), stripUndefined(data)); }
};

window.confirmDelete = async function() {
  if (deleteSelected.size === 0) return;
  if (!confirm(`確定要刪除 ${deleteSelected.size} 個項目嗎？`)) return;
  const snap = { places: [], routes: [] };
  for (const key of deleteSelected) {
    const [type, id] = key.split(':');
    if (type === 'place') {
      const p = places.find(x => x.id === id);
      if (p) snap.places.push({ ...p });
      if (markers[id]) { markers[id].setMap(null); delete markers[id]; }
      await deletePlace(id);
    } else if (type === 'route') {
      const r = routes.find(x => x.id === id);
      if (r) snap.routes.push({ ...r });
      if (polylines[id]) { polylines[id].setMap(null); delete polylines[id]; }
      await deleteRoute(id);
    }
  }
  const n = snap.places.length + snap.routes.length;
  deleteSelected.clear();
  setMode('view');
  if (n > 0) { lastDeleted = snap; showUndoBar(n); }
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
  const batchBtn = document.getElementById('btn-batch');
  if (batchBtn) batchBtn.classList.toggle('active', m === 'batch');
  const delBar = document.getElementById('delete-bar');
  delBar.classList.toggle('hidden', m !== 'delete');
  const batchBar = document.getElementById('batch-bar');
  if (batchBar) batchBar.classList.toggle('hidden', m !== 'batch');
  document.getElementById('delete-count').textContent = '已選 0 項';
  if (m === 'batch') {
    document.getElementById('batch-count').textContent = '已選 0 個地點';
    refreshBatchTripDropdown();
  }
  const ind = document.getElementById('mode-indicator');
  if (m === 'pin') { ind.textContent = '點擊地圖新增地點'; ind.classList.remove('hidden'); }
  else if (m === 'delete') { ind.textContent = '點擊地點或路線來選取'; ind.classList.remove('hidden'); }
  else if (m === 'batch') { ind.textContent = '點選地點，再選行程套用'; ind.classList.remove('hidden'); }
  else { ind.classList.add('hidden'); }
  if (map) map.setOptions({ draggableCursor: (m === 'pin') ? 'crosshair' : '' });
  renderList();
};

// Populate the batch-assign trip dropdown
function refreshBatchTripDropdown() {
  const sel = document.getElementById('batch-trip');
  if (!sel) return;
  const sorted = [...trips].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  sel.innerHTML = '<option value="">— 選擇行程 —</option><option value="__unfile__">移出行程（未分類）</option>' +
    sorted.map(t => `<option value="${t.id}">${esc(t.name)}${t.start ? ' (' + t.start + ')' : ''}</option>`).join('');
}

window.applyBatchTrip = async function() {
  const sel = document.getElementById('batch-trip');
  const val = sel ? sel.value : '';
  if (!val) { alert('請先選擇要套用的行程'); return; }
  const picked = [...deleteSelected].filter(k => k.startsWith('place:')).map(k => k.slice(6));
  if (picked.length === 0) { alert('請先點選至少一個地點'); return; }
  const tripId = val === '__unfile__' ? '' : val;
  const batch = writeBatch(db);
  picked.forEach(id => batch.update(doc(db, 'places', id), { tripId }));
  await batch.commit();
  setMode('view');
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
// ── List search ──
window.onListSearch = function() {
  listSearchText = document.getElementById('list-search').value.trim().toLowerCase();
  document.getElementById('list-search-clear').classList.toggle('hidden', !listSearchText);
  renderList();
};
window.clearListSearch = function() {
  document.getElementById('list-search').value = '';
  listSearchText = '';
  document.getElementById('list-search-clear').classList.add('hidden');
  renderList();
};
function matchesSearch(name) {
  return !listSearchText || String(name || '').toLowerCase().includes(listSearchText);
}

function renderList() {
  // Restaurant mode: sidebar shows only restaurants (filtered by pill + search)
  if (restaurantMode) {
    const list = document.getElementById('content-list');
    const f = places.filter(p => isRestaurant(p) && restaurantMatchesFilter(p) && matchesSearch(p.name));
    list.innerHTML = f.length
      ? f.map(p => placeItemHtml(p, null)).join('')
      : '<div class="list-empty">此分類尚無餐廳<br>新增地點時分類選「美食」並選餐廳類型</div>';
    renderStats();
    return;
  }
  if (viewMode === 'trips') { renderTripsTree(); renderStats(); return; }

  const list = document.getElementById('content-list');
  if (activeTab === 'places') {
    let f = currentFilter === '全部' ? places : places.filter(p => p.tag === currentFilter);
    f = f.filter(p => matchesSearch(p.name));
    if (f.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無地點記錄<br>用上方搜尋列或「新增」按鈕加入地點</div>';
    } else {
      // Drag reorder only makes sense on the unfiltered full list
      list.innerHTML = f.map(p => placeItemHtml(p, currentFilter === '全部' ? 'all' : null)).join('');
    }
  } else {
    const fr = routes.filter(r => matchesSearch(r.name));
    if (fr.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無路線記錄<br>用上方搜尋列規劃路線，或手動畫路線</div>';
    } else {
      list.innerHTML = fr.map(r => routeItemHtml(r, 'all')).join('');
    }
  }
  renderStats();
}

function placeItemHtml(p, scope) {
  const sel = selectedPlaceId === p.id;
  const selecting = mode === 'delete' || mode === 'batch';  // both show checkboxes
  const delSel = deleteSelected.has(`place:${p.id}`);
  const color = placeColor(p);
  const iconKey = placeIcon(p);
  const wishBadge = p.wishlist ? `<span class="wish-badge">想去</span>` : '';
  const fav = !!p.favorite;
  const heart = selecting ? '' :
    `<button class="fav-btn${fav ? ' active' : ''}" title="${fav ? '取消收藏' : '加入我的最愛'}" onclick="event.stopPropagation();toggleFavorite('${p.id}')">
      <svg class="icon"><use href="#icon-heart-${fav ? 'filled' : 'outline'}"/></svg>
    </button>`;
  const dataAttrs = `data-item-kind="place" data-item-id="${p.id}" data-scope="${scope || 'all'}"`;
  const dragAttrs = (selecting || !scope) ? '' :
    `draggable="true" ondragstart="onItemDragStart(event)" ondragover="onItemDragOver(event)" ondrop="onItemDrop(event)" ondragend="onItemDragEnd(event)"`;
  return `<div class="place-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" ${dataAttrs} ${dragAttrs} onclick="selectPlace('${p.id}')">
    ${selecting ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
    ${heart}
    <div class="place-icon" style="background:${color};"><svg class="icon" style="color:#fff;"><use href="#pin-${iconKey}"/></svg></div>
    <div class="place-info">
      <div class="place-name">${esc(p.name)}${wishBadge}</div>
      <div class="place-meta">${p.date || ''}${p.rating ? ` <span style="color:#F1B807;">${'★'.repeat(p.rating)}</span>` : ''}</div>
      <span class="place-tag" style="background:${color}1f;color:${color};">${p.tag}</span>
    </div>
  </div>`;
}

window.toggleFavorite = async function(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  await updatePlace(id, { favorite: !p.favorite });
};

window.toggleRouteFavorite = async function(id) {
  const r = routes.find(x => x.id === id);
  if (!r) return;
  await updateRoute(id, { favorite: !r.favorite });
};

// Edit an existing route via the route-details modal (no map recompute)
window.editRoute = function(id) {
  const r = routes.find(x => x.id === id);
  if (!r) return;
  editingRouteId = id;
  pendingRoute = { name: r.name, transport: r.transport, points: r.points || [] };
  document.getElementById('rd-name').value = r.name || '';
  document.getElementById('rd-cat').value = r.cat || ROUTE_CATEGORIES[0];
  document.getElementById('rd-transport').value = r.transport || 'drive';
  document.getElementById('rd-date').value = r.date || '';
  document.getElementById('rd-note').value = r.note || '';
  document.getElementById('rd-fare').value = r.fare || '';
  pendingRouteColor = routeColor(r);
  renderRouteColorPicker();
  onRouteTransportChange();
  refreshRouteTripDropdown();
  document.getElementById('rd-trip').value = r.tripId || '';
  applyRouteTripDateRange(r.date || '');
  document.querySelector('#route-details-modal h3').textContent = '編輯路線';
  document.getElementById('route-details-modal').classList.remove('hidden');
};

function routeItemHtml(r, scope) {
  const t = TRANSPORT[r.transport] || TRANSPORT.drive;
  const color = routeColor(r);
  const sel = selectedRouteId === r.id;
  const delSel = deleteSelected.has(`route:${r.id}`);
  const catBadge = r.cat ? `<span class="route-cat-badge">${esc(r.cat)}</span>` : '';
  const fareStr = r.fare ? ` · ¥${esc(String(r.fare))}` : '';
  const kmStr = (() => { const d = routeDistance(r); return d ? ` · ${fmtKm(d)}` : ''; })();
  const fav = !!r.favorite;
  const heart = mode === 'delete' ? '' :
    `<button class="fav-btn${fav ? ' active' : ''}" title="${fav ? '取消收藏' : '加入我的最愛'}" onclick="event.stopPropagation();toggleRouteFavorite('${r.id}')">
      <svg class="icon"><use href="#icon-heart-${fav ? 'filled' : 'outline'}"/></svg>
    </button>`;
  const editBtn = mode === 'delete' ? '' :
    `<button class="route-edit-btn" title="編輯路線" onclick="event.stopPropagation();editRoute('${r.id}')"><svg class="icon"><use href="#icon-edit"/></svg></button>`;
  const dataAttrs = `data-item-kind="route" data-item-id="${r.id}" data-scope="${scope || 'all'}"`;
  const dragAttrs = (mode === 'delete' || !scope) ? '' :
    `draggable="true" ondragstart="onItemDragStart(event)" ondragover="onItemDragOver(event)" ondrop="onItemDrop(event)" ondragend="onItemDragEnd(event)"`;
  return `<div class="route-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" ${dataAttrs} ${dragAttrs} onclick="selectRoute('${r.id}')">
    ${mode === 'delete' ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
    ${heart}
    <div class="route-swatch" style="background:${color};"></div>
    <div class="route-info">
      <div class="route-name">${esc(r.name)}</div>
      <div class="route-meta">${r.date || ''}${r.date ? ' · ' : ''}${(r.points || []).length} 個節點${kmStr}${fareStr}</div>
      <span class="transport-badge" style="background:${color}22;color:${color};">${t.label}</span>${catBadge}
    </div>
    ${editBtn}
  </div>`;
}

// Render the year → trip → items tree
function renderTripsTree() {
  const list = document.getElementById('content-list');
  const sPlaces = places.filter(p => matchesSearch(p.name));
  const sRoutes = routes.filter(r => matchesSearch(r.name));
  const wishPlaces = sPlaces.filter(p => p.wishlist);
  const favPlaces = sPlaces.filter(p => p.favorite);
  const realPlaces = sPlaces.filter(p => !p.wishlist);  // visited/normal places

  if (trips.length === 0 && realPlaces.every(p => !p.tripId) && routes.every(r => !r.tripId) && wishPlaces.length === 0 && favPlaces.length === 0) {
    list.innerHTML = '<div class="list-empty">尚無行程<br>點上方「新增行程」建立你的第一個行程<br>或在新增地點時勾選「想去的地方」</div>';
    return;
  }

  let html = '';

  // ── 我的最愛 group (all favorited places) ──
  if (favPlaces.length > 0) {
    const collapsed = !expandedGroups.has('__favorite__');
    html += `<div class="year-group">
      <div class="favorite-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__favorite__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        <svg class="icon" style="width:14px;height:14px;color:#E0245E;"><use href="#icon-heart-filled"/></svg>
        我的最愛
        <span class="year-count">${favPlaces.length} 個</span>
      </div>`;
    if (!collapsed) {
      html += favPlaces.map(p => placeItemHtml(p, 'favorite')).join('');
    }
    html += `</div>`;
  }

  // ── 想去的地方 group (all wishlist places, regardless of their tripId) ──
  if (wishPlaces.length > 0) {
    const collapsed = !expandedGroups.has('__wishlist__');
    html += `<div class="year-group">
      <div class="wishlist-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__wishlist__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        <svg class="icon" style="width:14px;height:14px;color:#1a1a1a;"><use href="#pin-heart"/></svg>
        想去的地方
        <span class="year-count">${wishPlaces.length} 個</span>
      </div>`;
    if (!collapsed) {
      html += wishPlaces.map(p => placeItemHtml(p, 'wishlist')).join('');
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
    const collapsed = !expandedGroups.has(y);
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
        const tripRoutes = sRoutes.filter(r => r.tripId === t.id);
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
              <div class="trip-dates">${dateStr} · ${tripPlaces.length} 地點 / ${tripRoutes.length} 路線${(() => {
                const driveKm = tripRoutes.filter(r => r.transport === 'drive').reduce((s, r) => { const d = routeDistance(r); return s + (d ? d.km : 0); }, 0);
                return driveKm > 0 ? ` · <svg class="icon" style="width:11px;height:11px;vertical-align:-1.5px;"><use href="#icon-car"/></svg> ${driveKm < 10 ? driveKm.toFixed(1) : Math.round(driveKm)} km` : '';
              })()}</div>
            </div>
            <button class="trip-eye-btn${hiddenTripIds.has(t.id) ? ' off' : ''}" title="${hiddenTripIds.has(t.id) ? '顯示此行程的地標/路線' : '隱藏此行程的地標/路線'}" onclick="event.stopPropagation();toggleTripVisibility('${t.id}')"><svg class="icon"><use href="#icon-eye${hiddenTripIds.has(t.id) ? '-off' : ''}"/></svg></button>
            <button class="trip-edit-btn" onclick="event.stopPropagation();editTrip('${t.id}')"><svg class="icon"><use href="#icon-edit"/></svg></button>
          </div>`;
        if (expanded) {
          html += '<div class="trip-children">';
          if (tripPlaces.length === 0 && tripRoutes.length === 0) {
            html += '<div class="list-empty" style="padding:10px 14px;">此行程尚無地點或路線</div>';
          } else {
            html += tripPlaces.map(p => placeItemHtml(p, 'trip:'+t.id)).join('');
            html += tripRoutes.map(r => routeItemHtml(r, 'trip:'+t.id)).join('');
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
  const unfiledRoutes = sRoutes.filter(r => !r.tripId);
  if (unfiledPlaces.length > 0 || unfiledRoutes.length > 0) {
    const collapsed = !expandedGroups.has('__unfiled__');
    html += `<div class="year-group">
      <div class="unfiled-header${collapsed ? ' collapsed' : ''}" onclick="toggleYear('__unfiled__')">
        <svg class="icon chev"><use href="#icon-chevron-left"/></svg>
        未分類
        <span class="year-count">${unfiledPlaces.length + unfiledRoutes.length} 項</span>
      </div>`;
    if (!collapsed) {
      html += unfiledPlaces.map(p => placeItemHtml(p, 'unfiled')).join('');
      html += unfiledRoutes.map(r => routeItemHtml(r, 'unfiled')).join('');
    }
    html += `</div>`;
  }

  list.innerHTML = html;
}

window.toggleYear = function(y) {
  if (expandedGroups.has(y)) expandedGroups.delete(y);
  else expandedGroups.add(y);
  renderTripsTree();
};

window.toggleTrip = function(id) {
  selectedTripId = selectedTripId === id ? null : id;
  renderTripsTree();
};

// Eye toggle: show/hide all markers & routes of a trip (session-only, not saved)
window.toggleTripVisibility = function(id) {
  if (hiddenTripIds.has(id)) hiddenTripIds.delete(id);
  else hiddenTripIds.add(id);
  syncPlaceMarkers();
  syncRoutePolylines();
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
  const batch = writeBatch(db);
  ids.forEach((id, idx) => batch.update(doc(db, 'trips', id), { order: idx }));
  await batch.commit();
  dragTripId = null; dragTripYear = null;
};
window.onTripDragEnd = function(e) {
  document.querySelectorAll('.trip-folder.dragging, .trip-folder.drag-over')
    .forEach(el => el.classList.remove('dragging', 'drag-over'));
  dragTripId = null; dragTripYear = null;
};

// ── Generic place/route list item drag-to-reorder ──
// Reorders within the same kind (place|route) and scope; persists `order` on each.
let dragItem = null;  // { kind, id, scope }
window.onItemDragStart = function(e) {
  const el = e.currentTarget;
  dragItem = { kind: el.dataset.itemKind, id: el.dataset.itemId, scope: el.dataset.scope };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragItem.id); } catch (_) {}
  setTimeout(() => el.classList.add('dragging'), 0);
};
window.onItemDragOver = function(e) {
  if (!dragItem) return;
  const el = e.currentTarget;
  // Only allow dropping onto same kind + same scope
  if (el.dataset.itemKind !== dragItem.kind || el.dataset.scope !== dragItem.scope) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.place-item.drag-over, .route-item.drag-over').forEach(x => x.classList.remove('drag-over'));
  if (el.dataset.itemId !== dragItem.id) el.classList.add('drag-over');
};
window.onItemDrop = async function(e) {
  if (!dragItem) return;
  const el = e.currentTarget;
  if (el.dataset.itemKind !== dragItem.kind || el.dataset.scope !== dragItem.scope) return;
  e.preventDefault();
  document.querySelectorAll('.place-item.drag-over, .route-item.drag-over').forEach(x => x.classList.remove('drag-over'));
  const targetId = el.dataset.itemId;
  if (targetId === dragItem.id) return;
  await reorderItems(dragItem.kind, dragItem.scope, dragItem.id, targetId);
  dragItem = null;
};
window.onItemDragEnd = function(e) {
  document.querySelectorAll('.dragging, .drag-over').forEach(x => x.classList.remove('dragging', 'drag-over'));
  dragItem = null;
};

// Build the ordered id-list for a kind+scope, move dragged before target, persist order
async function reorderItems(kind, scope, dragId, targetId) {
  const arr = kind === 'place' ? places : routes;
  // Determine which items belong to this scope
  const inScope = (item) => {
    if (scope === 'all') return true;
    if (scope === 'wishlist') return !!item.wishlist;
    if (scope === 'favorite') return !!item.favorite;
    if (scope === 'unfiled') return !item.tripId && !item.wishlist;
    if (scope.startsWith('trip:')) return item.tripId === scope.slice(5) && !item.wishlist;
    return true;
  };
  const scoped = arr.filter(inScope).slice().sort(byOrder);
  const ids = scoped.map(x => x.id);
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  const coll = kind === 'place' ? 'places' : 'routes';
  const batch = writeBatch(db);
  ids.forEach((id, idx) => batch.update(doc(db, coll, id), { order: idx }));
  await batch.commit();
}

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

// When the place's trip dropdown changes to "新增行程", open the trip modal;
// otherwise sync the date field to the selected trip's day range.
window.onTripSelectChange = function() {
  const fTrip = document.getElementById('f-trip');
  if (fTrip && fTrip.value === '__new__') {
    fTrip.value = '';  // reset selection
    openTripModal(true);  // open in "return to place modal" mode
    return;
  }
  applyTripDateRange();
};

// Build a list of every date between a trip's start and end (inclusive)
function tripDayList(trip) {
  const days = [];
  if (!trip || !trip.start) return days;
  const start = new Date(trip.start + 'T00:00:00');
  const end = new Date((trip.end || trip.start) + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return trip.start ? [trip.start] : [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(fmtDate(d));
  }
  return days;
}

// Show a day-dropdown limited to the trip range; fall back to free date input otherwise
function applyTripDateRange(preferDate) {
  const fTrip = document.getElementById('f-trip');
  const dateInput = document.getElementById('f-date');
  const daySel = document.getElementById('f-date-select');
  const trip = trips.find(t => t.id === (fTrip ? fTrip.value : ''));
  const days = tripDayList(trip);
  if (trip && days.length) {
    // Populate dropdown with the trip's days
    daySel.innerHTML = days.map(d => `<option value="${d}">${d}</option>`).join('');
    // Keep an existing valid date if it falls within range, else default to first day
    const want = preferDate || dateInput.value;
    daySel.value = days.includes(want) ? want : days[0];
    daySel.classList.remove('hidden');
    dateInput.classList.add('hidden');
  } else {
    daySel.classList.add('hidden');
    dateInput.classList.remove('hidden');
  }
}

// Read whichever date control is currently active
function getPlaceDateValue() {
  const daySel = document.getElementById('f-date-select');
  if (daySel && !daySel.classList.contains('hidden')) return daySel.value;
  return document.getElementById('f-date').value;
}

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
    applyTripDateRange();
  }
};

// Delete a trip — its places/routes become unfiled (tripId cleared), not deleted
window.deleteTripById = async function(id) {
  if (!id) return;
  if (!confirm('確定刪除這個行程嗎？行程內的地點和路線會變回「未分類」，不會被刪除。')) return;
  const batch = writeBatch(db);
  places.filter(x => x.tripId === id).forEach(p => batch.update(doc(db, 'places', p.id), { tripId: '' }));
  routes.filter(x => x.tripId === id).forEach(r => batch.update(doc(db, 'routes', r.id), { tripId: '' }));
  await batch.commit();
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
  document.getElementById('f-gmaps-url').value = '';
  document.getElementById('f-gmaps-hint').classList.add('hidden');
  pendingRating = 0; renderRatingPicker();
  pendingPhotos = []; renderPhotoInputs();
  document.getElementById('f-date').value = localToday();
  document.getElementById('f-tag').value = '美食';
  applyFoodTypeRow();
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
  applyTripDateRange();
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

// ── Rating picker (0-5 stars) ──
function renderRatingPicker() {
  const wrap = document.getElementById('f-rating');
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<svg class="icon star-choice${i <= pendingRating ? ' on' : ''}" onclick="pickRating(${i})"><use href="#icon-star-${i <= pendingRating ? 'filled' : 'outline'}"/></svg>`;
  }
  html += `<span class="rating-clear" onclick="pickRating(0)">清除</span>`;
  wrap.innerHTML = html;
}
window.pickRating = function(n) { pendingRating = (n === pendingRating) ? 0 : n; renderRatingPicker(); };

// ── Multi-photo URL inputs (max 5) ──
function renderPhotoInputs() {
  const wrap = document.getElementById('f-photos');
  let html = pendingPhotos.map((url, i) =>
    `<div class="photo-input-row">
      <input type="text" value="${esc(url)}" placeholder="貼上圖片連結 https://..." oninput="updatePhotoUrl(${i}, this.value)">
      <button type="button" class="photo-del" onclick="removePhotoInput(${i})">✕</button>
    </div>`
  ).join('');
  if (pendingPhotos.length < 5) {
    html += `<button type="button" class="photo-add" onclick="addPhotoInput()">＋ 新增照片</button>`;
  }
  wrap.innerHTML = html;
}
window.addPhotoInput = function() { if (pendingPhotos.length < 5) { pendingPhotos.push(''); renderPhotoInputs(); } };
window.removePhotoInput = function(i) { pendingPhotos.splice(i, 1); renderPhotoInputs(); };
window.updatePhotoUrl = function(i, v) { pendingPhotos[i] = v; };  // no re-render (keeps focus)

// Parse a full Google Maps URL to extract coordinates (and name if present)
window.parseGmapsUrl = function() {
  const url = document.getElementById('f-gmaps-url').value.trim();
  const hint = document.getElementById('f-gmaps-hint');
  const show = (msg, ok) => { hint.textContent = msg; hint.classList.remove('hidden'); hint.style.color = ok ? '#27500A' : '#C0392B'; };
  if (!url) { show('請先貼上網址', false); return; }
  // Short links can't be resolved from the browser (redirect + CORS)
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(url)) {
    show('短連結無法解析。請在電腦版 Google Maps 開啟該地點，複製網址列上含 @座標 的完整網址。', false);
    return;
  }
  // Try several coordinate patterns: !3dLAT!4dLNG (most accurate), @LAT,LNG, q=LAT,LNG, ll=LAT,LNG
  let lat, lng;
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) { lat = +m[1]; lng = +m[2]; }
  if (lat == null) { m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) { lat = +m[1]; lng = +m[2]; } }
  if (lat == null) { m = url.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) { lat = +m[1]; lng = +m[2]; } }
  if (lat == null || lng == null) {
    show('找不到座標。請確認網址是電腦版含 @緯度,經度 的完整網址。', false);
    return;
  }
  pendingLatLng = { lat, lng };
  // Try to pull a place name from the /place/NAME/ segment
  const nameMatch = url.match(/\/place\/([^/@]+)/);
  if (nameMatch && !document.getElementById('f-name').value.trim()) {
    try { document.getElementById('f-name').value = decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')); } catch (_) {}
  }
  show(`已帶入座標：${lat.toFixed(5)}, ${lng.toFixed(5)}`, true);
  if (map) map.panTo({ lat, lng });
};

// When category changes, update icon/color to that category's defaults
// (only if the user hasn't been manually overriding — simplest: always snap to new category default)
window.onTagChange = function() {
  const tag = document.getElementById('f-tag').value;
  pendingIcon = TAG_DEFAULT_ICON[tag] || 'pin';
  pendingColor = TAG_DEFAULT_COLOR[tag] || '#566573';
  renderIconPicker();
  renderColorPicker();
  applyFoodTypeRow();
};

// Show the food-type dropdown only when tag = 美食
function applyFoodTypeRow(selected) {
  const row = document.getElementById('f-foodtype-row');
  const sel = document.getElementById('f-foodtype');
  const isFood = document.getElementById('f-tag').value === '美食';
  row.classList.toggle('hidden', !isFood);
  if (isFood && sel.options.length === 0) {
    sel.innerHTML = FOOD_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  }
  if (isFood) sel.value = (selected && FOOD_TYPES.includes(selected)) ? selected : '其他';
}

window.savePlace = async function() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { document.getElementById('f-name').focus(); return; }
  const data = {
    name,
    tag:   document.getElementById('f-tag').value,
    date:  getPlaceDateValue(),
    note:  document.getElementById('f-note').value.trim(),
    foodType: document.getElementById('f-tag').value === '美食' ? document.getElementById('f-foodtype').value : '',
    photos: pendingPhotos.map(u => u.trim()).filter(Boolean).slice(0, 5),
    rating: pendingRating || 0,
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

// ── Restaurant mode: map & sidebar show only food places ──
function isRestaurant(p) { return p.tag === '美食' || placeIcon(p) === 'cafe'; }
// Effective sub-type: explicit foodType, else cafe icon → 咖啡廳, else 其他
function foodTypeOf(p) { return p.foodType || (placeIcon(p) === 'cafe' ? '咖啡廳' : '其他'); }
function restaurantMatchesFilter(p) { return foodTypeFilter === '全部' || foodTypeOf(p) === foodTypeFilter; }

window.toggleRestaurantMode = function() {
  restaurantMode = !restaurantMode;
  if (restaurantMode) setMode('view');  // leave pin/delete/batch modes for a clean state
  foodTypeFilter = '全部';
  document.getElementById('btn-restaurants').classList.toggle('active', restaurantMode);
  document.getElementById('food-filter-bar').classList.toggle('hidden', !restaurantMode);
  if (restaurantMode) renderFoodFilterBar();
  syncPlaceMarkers();
  syncRoutePolylines();
  renderList();
};

// Pills: 全部 + only the types that actually exist among current restaurants
function renderFoodFilterBar() {
  const bar = document.getElementById('food-filter-bar');
  const present = new Set(places.filter(isRestaurant).map(foodTypeOf));
  const pills = ['全部', ...FOOD_TYPES.filter(t => present.has(t))];
  bar.innerHTML = pills.map(t =>
    `<button class="food-pill${foodTypeFilter === t ? ' active' : ''}" onclick="pickFoodType('${t}')">${t}</button>`
  ).join('');
}
window.pickFoodType = function(t) {
  foodTypeFilter = t;
  renderFoodFilterBar();
  syncPlaceMarkers();
  renderList();
};

window.openStats = function() {
  renderStatsContent();
  document.getElementById('stats-overlay').classList.remove('hidden');
};
window.closeStats = function() { document.getElementById('stats-overlay').classList.add('hidden'); };

// ── Export / Import (JSON backup) ──
window.exportData = function() {
  const strip = (o) => { const { id, uid, ...rest } = o; return rest; };
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    places: places.map(strip),
    routes: routes.map(strip),
    trips: trips.map(strip),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jpmap-backup-${localToday()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

window.importData = async function(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';  // reset so the same file can be re-selected later
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert('檔案格式錯誤，無法解析 JSON。'); return;
  }
  const nP = (data.places || []).length, nR = (data.routes || []).length, nT = (data.trips || []).length;
  if (!confirm(`即將匯入：${nP} 個地點、${nR} 條路線、${nT} 個行程。\n\n這些會「新增」到你現有的資料裡（不會覆蓋或刪除現有資料）。要繼續嗎？`)) return;

  try {
    // Trips first, remapping old trip ids → new ids so places/routes keep their grouping
    const tripIdMap = {};
    for (const t of (data.trips || [])) {
      const { id: oldId, ...rest } = t;
      const ref = await addTrip(stripUndefined(rest));
      if (oldId) tripIdMap[oldId] = ref.id;
    }
    for (const p of (data.places || [])) {
      const { id, ...rest } = p;
      if (rest.tripId && tripIdMap[rest.tripId]) rest.tripId = tripIdMap[rest.tripId];
      await addPlace(stripUndefined(rest));
    }
    for (const r of (data.routes || [])) {
      const { id, ...rest } = r;
      if (rest.tripId && tripIdMap[rest.tripId]) rest.tripId = tripIdMap[rest.tripId];
      await addRoute(stripUndefined(rest));
    }
    alert('匯入完成！');
    closeSettings();
  } catch (err) {
    alert('匯入過程發生錯誤：' + (err && err.message ? err.message : err));
  }
};


function renderStatsContent() {
  const visited = places.filter(p => !p.wishlist);
  const wish = places.filter(p => p.wishlist);
  const fav = places.filter(p => p.favorite);
  // Count by category (visited only)
  const byTag = {};
  visited.forEach(p => { byTag[p.tag] = (byTag[p.tag] || 0) + 1; });
  const tagRows = Object.keys(byTag).sort((a, b) => byTag[b] - byTag[a])
    .map(tag => {
      const color = TAG_DEFAULT_COLOR[tag] || '#888';
      return `<div class="stat-row">
        <span class="stat-dot" style="background:${color};"></span>
        <span class="stat-label">${esc(tag)}</span>
        <span class="stat-num">${byTag[tag]}</span>
      </div>`;
    }).join('');
  // Total mileage across all routes (precise where stored, otherwise approximated)
  let totalKm = 0, anyApprox = false;
  routes.forEach(r => { const d = routeDistance(r); if (d) { totalKm += d.km; if (d.approx) anyApprox = true; } });
  const totalKmStr = (anyApprox ? '約' : '') + (totalKm < 10 ? totalKm.toFixed(1) : Math.round(totalKm).toLocaleString()) + ' km';

  document.getElementById('stats-content').innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-card-num">${visited.length}</div><div class="stat-card-lbl">已去地點</div></div>
      <div class="stat-card"><div class="stat-card-num">${wish.length}</div><div class="stat-card-lbl">想去的地方</div></div>
      <div class="stat-card"><div class="stat-card-num">${fav.length}</div><div class="stat-card-lbl">我的最愛</div></div>
      <div class="stat-card"><div class="stat-card-num">${routes.length}</div><div class="stat-card-lbl">路線</div></div>
      <div class="stat-card"><div class="stat-card-num">${trips.length}</div><div class="stat-card-lbl">行程</div></div>
      <div class="stat-card"><div class="stat-card-num">${totalKmStr}</div><div class="stat-card-lbl">總里程</div></div>
    </div>
    ${tagRows ? `<div class="stat-section-title">已去地點分類</div><div class="stat-list">${tagRows}</div>` : ''}
  `;
}

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
  // Capture the precise distance (meters) from Google Directions for new routes.
  const distanceMeters = leg.distance ? leg.distance.value : null;
  pendingRoute = { name, transport, points: sampled, distanceMeters };
  openRouteDetailsModal(name);
}

// Haversine distance (km) between two lat/lng points
function haversineKm(a, b) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// A route's distance in km. Prefer the stored precise value; otherwise approximate
// by summing straight-line segments between stored points (returns {km, approx}).
function routeDistance(r) {
  if (typeof r.distanceMeters === 'number') return { km: r.distanceMeters / 1000, approx: false };
  const pts = r.points || [];
  if (pts.length < 2) return null;
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i-1], pts[i]);
  return { km, approx: true };
}
function fmtKm(d) {
  if (!d) return '';
  const n = d.km < 10 ? d.km.toFixed(1) : Math.round(d.km);
  return `${d.approx ? '約' : ''}${n} km`;
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

// Route modal: limit date to the selected trip's day range (mirrors the place modal)
function applyRouteTripDateRange(preferDate) {
  const rdTrip = document.getElementById('rd-trip');
  const dateInput = document.getElementById('rd-date');
  const daySel = document.getElementById('rd-date-select');
  const trip = trips.find(t => t.id === (rdTrip ? rdTrip.value : ''));
  const days = tripDayList(trip);
  if (trip && days.length) {
    daySel.innerHTML = days.map(d => `<option value="${d}">${d}</option>`).join('');
    const want = preferDate || dateInput.value;
    daySel.value = days.includes(want) ? want : days[0];
    daySel.classList.remove('hidden');
    dateInput.classList.add('hidden');
  } else {
    daySel.classList.add('hidden');
    dateInput.classList.remove('hidden');
  }
}
window.onRouteTripSelectChange = function() { applyRouteTripDateRange(); };
function getRouteDateValue() {
  const daySel = document.getElementById('rd-date-select');
  if (daySel && !daySel.classList.contains('hidden')) return daySel.value;
  return document.getElementById('rd-date').value;
}

// ── Route details modal (filled in after a route is computed) ──
function openRouteDetailsModal(defaultName) {
  document.getElementById('rd-name').value = defaultName || '';
  document.getElementById('rd-cat').value = ROUTE_CATEGORIES[0];
  document.getElementById('rd-transport').value = pendingRoute.transport;
  document.getElementById('rd-date').value = localToday();
  document.getElementById('rd-note').value = '';
  document.getElementById('rd-fare').value = '';
  // Default route color = the transport's default color, but user can change it
  pendingRouteColor = (TRANSPORT[pendingRoute.transport] || TRANSPORT.drive).color;
  renderRouteColorPicker();
  onRouteTransportChange();  // show/hide fare row based on transport
  refreshRouteTripDropdown();
  const rdTrip = document.getElementById('rd-trip');
  if (rdTrip) rdTrip.value = (viewMode === 'trips' && selectedTripId && selectedTripId !== '__wishlist__') ? selectedTripId : '';
  applyRouteTripDateRange();
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
  document.querySelector('#route-details-modal h3').textContent = '路線資料';
  directionsRenderer.setMap(null);
  pendingRoute = null;
  editingRouteId = null;
};

window.saveRouteDetails = async function() {
  if (!pendingRoute) return;
  const name = document.getElementById('rd-name').value.trim() || pendingRoute.name;
  const transport = document.getElementById('rd-transport').value;
  const data = {
    name,
    transport,
    points: pendingRoute.points,
    cat:   document.getElementById('rd-cat').value,
    color: pendingRouteColor,
    date:  getRouteDateValue(),
    note:  document.getElementById('rd-note').value.trim(),
    fare:  transport === 'train' ? (document.getElementById('rd-fare').value || '') : '',
    tripId: document.getElementById('rd-trip').value || '',
  };
  if (typeof pendingRoute.distanceMeters === 'number') data.distanceMeters = pendingRoute.distanceMeters;
  if (editingRouteId) {
    await updateRoute(editingRouteId, data);
    editingRouteId = null;
  } else {
    await addRoute(data);
  }
  directionsRenderer.setMap(null);
  pendingRoute = null;
  document.getElementById('route-details-modal').classList.add('hidden');
  document.querySelector('#route-details-modal h3').textContent = '路線資料';
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
// ── Keyboard shortcuts ──
// Esc: close the topmost open overlay / cancel manual draw / clear search focus
// Enter: submit the open modal (when focus is in a text/date input, not a textarea)
const MODAL_SUBMITS = {
  'add-modal': 'savePlace', 'trip-modal': 'saveTrip', 'route-details-modal': 'saveRouteDetails',
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lb = document.getElementById('lightbox');
    if (lb && !lb.classList.contains('hidden')) { window.closeLightbox(); return; }
    if (manualDraw) { window.cancelManualDraw(); return; }
    if (altPickerData) { window.closeRouteAltModal(); return; }
    // Close whichever overlay is open (top-most wins by order below)
    const overlays = [
      ['add-modal', 'closeModal'], ['trip-modal', 'closeTripModal'],
      ['route-details-modal', 'closeRouteDetailsModal'], ['stats-overlay', 'closeStats'],
      ['settings-overlay', 'closeSettings'], ['import-overlay', 'closeImport'],
    ];
    for (const [id, fn] of overlays) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) { if (window[fn]) window[fn](); return; }
    }
    const rpm = document.getElementById('route-point-menu');
    if (rpm && !rpm.classList.contains('hidden')) { window.closeRoutePointMenu(); return; }
    const info = document.getElementById('info-panel');
    if (info && !info.classList.contains('hidden')) { window.closeInfoPanel(); return; }
    const poi = document.getElementById('poi-card');
    if (poi && !poi.classList.contains('hidden') && window.closePoiCard) { window.closePoiCard(); return; }
  } else if (e.key === 'Enter' && e.target && (e.target.tagName === 'INPUT') && e.target.type !== 'checkbox') {
    // Submit the modal that contains the focused input
    for (const [id, fn] of Object.entries(MODAL_SUBMITS)) {
      const modal = document.getElementById(id);
      if (modal && !modal.classList.contains('hidden') && modal.contains(e.target)) {
        e.preventDefault();
        if (window[fn]) window[fn]();
        return;
      }
    }
  }
});

window.selectPlace = selectPlace;
window.selectRoute = selectRoute;


