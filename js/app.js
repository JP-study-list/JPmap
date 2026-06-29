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
  drive: { label: '開車 / 公車', color: '#378ADD', dash: [8, 4], gmMode: 'DRIVING' },
  walk:  { label: '走路',        color: '#EF9F27', dash: [4, 4], gmMode: 'WALKING' },
  train: { label: '電車',        color: '#D85A30', dash: [12, 3], gmMode: 'TRANSIT' },
};
const TAG_STYLE = {
  '美食': { bg: '#FAEEDA', text: '#633806' },
  '神社': { bg: '#E1F5EE', text: '#085041' },
  '自然': { bg: '#EAF3DE', text: '#27500A' },
  '文化': { bg: '#EEEDFE', text: '#3C3489' },
  '購物': { bg: '#FAECE7', text: '#712B13' },
  '住宿': { bg: '#E8F0FE', text: '#1A3A7A' },
};

// ── State ──
let map, directionsService, directionsRenderer, autocompleteService, placesService;
let currentUser, unsubscribePlaces, unsubscribeRoutes;
let places = [], routes = [];
let markers = {}, polylines = {};
let mode = 'view', activeTab = 'places', currentFilter = '全部';
let selectedPlaceId = null, selectedRouteId = null;
let editingPlaceId = null, pendingLatLng = null;
let drawingRoute = null, drawPolyline = null, drawPath = [];
let pendingTransport = 'drive';
let pendingImport = null;
let sidebarOpen = true;
let routeTabMode = 'auto';
let deleteSelected = new Set();
let searchTimeout = null;

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
    document.getElementById('user-email-display').textContent = user.email || user.displayName || '';
    initMapWhenReady();
    subscribeData();
  } else {
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    if (unsubscribePlaces) unsubscribePlaces();
    if (unsubscribeRoutes) unsubscribeRoutes();
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
    styles: [
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ]
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    preserveViewport: true,
  });
  autocompleteService = new google.maps.places.AutocompleteService();
  placesService = new google.maps.places.PlacesService(map);

  map.addListener('click', (e) => {
    if (mode === 'pin') {
      pendingLatLng = e.latLng;
      editingPlaceId = null;
      openAddModal();
    } else if (mode === 'draw' && drawingRoute) {
      addDrawPoint(e.latLng);
    }
  });

  map.addListener('dblclick', (e) => {
    if (mode === 'draw' && drawingRoute) finishDrawing();
  });

  setupPlaceSearch();
  setupRouteSearch();
}

// ── Place Search in Add Modal ──
function setupPlaceSearch() {
  const input = document.getElementById('f-search');
  const results = document.getElementById('search-results');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const val = input.value.trim();
    if (!val) { results.classList.add('hidden'); return; }
    searchTimeout = setTimeout(() => {
      autocompleteService.getPlacePredictions(
        { input: val, componentRestrictions: { country: 'jp' }, language: 'zh-TW' },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            results.classList.add('hidden'); return;
          }
          results.innerHTML = predictions.slice(0, 5).map(p =>
            `<div class="search-result-item" onclick="selectSearchPlace('${p.place_id}','${esc(p.structured_formatting.main_text)}')">
              <div class="sr-name">${esc(p.structured_formatting.main_text)}</div>
              <div class="sr-addr">${esc(p.structured_formatting.secondary_text || '')}</div>
            </div>`
          ).join('');
          results.classList.remove('hidden');
        }
      );
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.classList.add('hidden');
  });
}

window.selectSearchPlace = function(placeId, name) {
  document.getElementById('f-search').value = name;
  document.getElementById('search-results').classList.add('hidden');
  placesService.getDetails({ placeId, fields: ['name', 'geometry', 'address_components', 'formatted_address'] }, (place, status) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK) return;
    document.getElementById('f-name').value = place.name || name;
    // Extract city from address components
    const cityComp = place.address_components?.find(c => c.types.includes('locality') || c.types.includes('administrative_area_level_1'));
    if (cityComp) document.getElementById('f-city').value = cityComp.long_name;
    pendingLatLng = place.geometry.location;
    map.panTo(pendingLatLng);
    map.setZoom(15);
  });
};

// ── Route Search (Directions API) ──
function setupRouteSearch() {
  setupRouteAutocomplete('r-origin', 'origin-results');
  setupRouteAutocomplete('r-dest', 'dest-results');
}

function setupRouteAutocomplete(inputId, resultsId) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    const val = input.value.trim();
    if (!val) { results.classList.add('hidden'); return; }
    t = setTimeout(() => {
      autocompleteService.getPlacePredictions(
        { input: val, componentRestrictions: { country: 'jp' }, language: 'zh-TW' },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            results.classList.add('hidden'); return;
          }
          results.innerHTML = predictions.slice(0, 5).map(p =>
            `<div class="search-result-item" onclick="fillRouteInput('${inputId}','${resultsId}','${esc(p.description)}')">
              <div class="sr-name">${esc(p.structured_formatting.main_text)}</div>
              <div class="sr-addr">${esc(p.structured_formatting.secondary_text || '')}</div>
            </div>`
          ).join('');
          results.classList.remove('hidden');
        }
      );
    }, 300);
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.classList.add('hidden');
  });
}

window.fillRouteInput = function(inputId, resultsId, value) {
  document.getElementById(inputId).value = value;
  document.getElementById(resultsId).classList.add('hidden');
};

// ── Firestore ──
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
}

async function addPlace(data) { await addDoc(collection(db, 'places'), { ...data, uid: currentUser.uid, createdAt: Date.now() }); }
async function updatePlace(id, data) { await updateDoc(doc(db, 'places', id), data); }
async function deletePlace(id) { await deleteDoc(doc(db, 'places', id)); }
async function addRoute(data) { await addDoc(collection(db, 'routes'), { ...data, uid: currentUser.uid, createdAt: Date.now() }); }
async function deleteRoute(id) { await deleteDoc(doc(db, 'routes', id)); }

// ── Markers ──
function syncPlaceMarkers() {
  const ids = new Set(places.map(p => p.id));
  Object.keys(markers).forEach(id => { if (!ids.has(id)) { markers[id].setMap(null); delete markers[id]; } });
  places.forEach(p => {
    const s = TAG_STYLE[p.tag] || { bg: '#E6F1FB', text: '#185FA5' };
    const sel = selectedPlaceId === p.id;
    const icon = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: s.bg, fillOpacity: 1,
      strokeColor: s.text, strokeWeight: sel ? 2.5 : 1.5,
      scale: sel ? 11 : 8,
    };
    if (markers[p.id]) { markers[p.id].setIcon(icon); return; }
    const marker = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.name, icon });
    marker.addListener('click', () => selectPlace(p.id));
    markers[p.id] = marker;
  });
}

function syncRoutePolylines() {
  const ids = new Set(routes.map(r => r.id));
  Object.keys(polylines).forEach(id => { if (!ids.has(id)) { polylines[id].setMap(null); delete polylines[id]; } });
  routes.forEach(r => {
    const t = TRANSPORT[r.transport] || TRANSPORT.drive;
    const sel = selectedRouteId === r.id;
    if (polylines[r.id]) {
      polylines[r.id].setOptions({ strokeWeight: sel ? 5 : 3, strokeOpacity: sel ? 1 : 0.75 });
      return;
    }
    const path = (r.points || []).map(p => ({ lat: p.lat, lng: p.lng }));
    const poly = new google.maps.Polyline({
      path, map,
      strokeColor: t.color, strokeWeight: 3, strokeOpacity: 0.75,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: `${t.dash[0] + t.dash[1]}px` }]
    });
    poly.addListener('click', () => selectRoute(r.id));
    polylines[r.id] = poly;
  });
}

function clearMap() {
  Object.values(markers).forEach(m => m.setMap(null));
  Object.values(polylines).forEach(p => p.setMap(null));
  markers = {}; polylines = {}; places = []; routes = [];
}

// ── Selection ──
function selectPlace(id) {
  if (mode === 'delete') { toggleDeleteItem('place', id); return; }
  selectedPlaceId = id; selectedRouteId = null;
  const p = places.find(x => x.id === id);
  if (!p) return;
  const s = TAG_STYLE[p.tag] || {};
  document.getElementById('info-name').textContent = p.name;
  document.getElementById('info-meta').innerHTML =
    `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:${s.bg};color:${s.text};margin-right:6px;">${p.tag}</span>${p.city || ''}${p.city && p.date ? ' · ' : ''}${p.date || ''}`;
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
  document.getElementById('f-search').value = '';
  document.getElementById('f-name').value = p.name;
  document.getElementById('f-city').value = p.city || '';
  document.getElementById('f-tag').value = p.tag || '美食';
  document.getElementById('f-date').value = p.date || '';
  document.getElementById('f-note').value = p.note || '';
  document.getElementById('add-modal').classList.remove('hidden');
};

window.deleteSelectedPlace = async function() {
  if (!selectedPlaceId || !confirm('確定要刪除這個地點嗎？')) return;
  if (markers[selectedPlaceId]) { markers[selectedPlaceId].setMap(null); delete markers[selectedPlaceId]; }
  await deletePlace(selectedPlaceId);
  selectedPlaceId = null;
  document.getElementById('info-panel').classList.add('hidden');
};

// ── Delete Mode ──
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

// ── Mode ──
window.setMode = function(m) {
  mode = m;
  deleteSelected.clear();
  ['view', 'pin'].forEach(x => {
    const b = document.getElementById('btn-' + x);
    if (b) b.classList.toggle('active', x === m);
  });
  document.getElementById('btn-route').classList.toggle('active', m === 'draw');
  const delBtn = document.getElementById('btn-delete');
  if (delBtn) delBtn.classList.toggle('delete-mode', m === 'delete');
  const delBar = document.getElementById('delete-bar');
  delBar.classList.toggle('hidden', m !== 'delete');
  document.getElementById('delete-count').textContent = '已選 0 項';
  const ind = document.getElementById('mode-indicator');
  if (m === 'pin') { ind.textContent = '點擊地圖新增地點'; ind.classList.remove('hidden'); }
  else if (m === 'draw') { ind.textContent = '點擊畫點 — 雙擊完成'; ind.classList.remove('hidden'); }
  else if (m === 'delete') { ind.textContent = '點擊地點或路線來選取'; ind.classList.remove('hidden'); }
  else { ind.classList.add('hidden'); }
  if (map) map.setOptions({ draggableCursor: (m === 'pin' || m === 'draw') ? 'crosshair' : '' });
  renderList();
};

// ── Sidebar ──
window.toggleSidebar = function() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sidebarOpen);
};

// ── Tabs & Filter ──
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

// ── Render List ──
function renderList() {
  const list = document.getElementById('content-list');
  if (activeTab === 'places') {
    const f = currentFilter === '全部' ? places : places.filter(p => p.tag === currentFilter);
    if (f.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無地點記錄<br>點「新增」後點擊地圖標記</div>';
    } else {
      list.innerHTML = f.map(p => {
        const s = TAG_STYLE[p.tag] || {};
        const sel = selectedPlaceId === p.id;
        const delSel = deleteSelected.has(`place:${p.id}`);
        return `<div class="place-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" onclick="selectPlace('${p.id}')">
          ${mode === 'delete' ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
          <div class="place-icon" style="background:${s.bg};"><i class="ti ti-map-pin" style="font-size:13px;color:${s.text};"></i></div>
          <div class="place-info">
            <div class="place-name">${esc(p.name)}</div>
            <div class="place-meta">${esc(p.city || '')}${p.city && p.date ? ' · ' : ''}${p.date || ''}</div>
            <span class="place-tag" style="background:${s.bg};color:${s.text};">${p.tag}</span>
          </div>
        </div>`;
      }).join('');
    }
  } else {
    if (routes.length === 0) {
      list.innerHTML = '<div class="list-empty">尚無路線記錄<br>點「路線」開始新增</div>';
    } else {
      list.innerHTML = routes.map(r => {
        const t = TRANSPORT[r.transport] || TRANSPORT.drive;
        const sel = selectedRouteId === r.id;
        const delSel = deleteSelected.has(`route:${r.id}`);
        return `<div class="route-item${sel ? ' selected' : ''}${delSel ? ' delete-selected' : ''}" onclick="selectRoute('${r.id}')">
          ${mode === 'delete' ? `<div class="delete-checkbox${delSel ? ' checked' : ''}"></div>` : ''}
          <div class="route-swatch" style="background:${t.color};"></div>
          <div class="route-info">
            <div class="route-name">${esc(r.name)}</div>
            <div class="route-meta">${(r.points || []).length} 個節點</div>
            <span class="transport-badge" style="background:${t.color}22;color:${t.color};">${t.label}</span>
          </div>
        </div>`;
      }).join('');
    }
  }
  renderStats();
}

function renderStats() {
  document.getElementById('st-places').textContent = places.length;
  document.getElementById('st-routes').textContent = routes.length;
  document.getElementById('st-cities').textContent = new Set(places.map(p => p.city).filter(Boolean)).size;
}

// ── Add/Edit Place ──
function openAddModal() {
  document.getElementById('modal-title').textContent = '新增地點';
  document.getElementById('f-search').value = '';
  document.getElementById('search-results').classList.add('hidden');
  ['f-name', 'f-city', 'f-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('f-tag').value = '美食';
  document.getElementById('add-modal').classList.remove('hidden');
}

window.savePlace = async function() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { document.getElementById('f-name').focus(); return; }
  const data = {
    name,
    city:  document.getElementById('f-city').value.trim(),
    tag:   document.getElementById('f-tag').value,
    date:  document.getElementById('f-date').value,
    note:  document.getElementById('f-note').value.trim(),
  };
  if (editingPlaceId) {
    await updatePlace(editingPlaceId, data);
    selectedPlaceId = editingPlaceId;
    editingPlaceId = null;
  } else if (pendingLatLng) {
    data.lat = pendingLatLng.lat();
    data.lng = pendingLatLng.lng();
    await addPlace(data);
    pendingLatLng = null;
  }
  closeModal();
};

window.closeModal = function() {
  document.getElementById('add-modal').classList.add('hidden');
  pendingLatLng = null; editingPlaceId = null;
};

// ── Route Modal ──
window.openRouteModal = function() {
  pendingTransport = 'drive';
  document.querySelectorAll('.transport-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('t-drive').classList.add('selected');
  document.getElementById('r-name').value = '';
  document.getElementById('r-origin').value = '';
  document.getElementById('r-dest').value = '';
  switchRouteTab('auto');
  document.getElementById('route-modal').classList.remove('hidden');
};

window.switchRouteTab = function(tab) {
  routeTabMode = tab;
  document.getElementById('rtab-auto').style.background = tab === 'auto' ? '#185FA5' : '#fff';
  document.getElementById('rtab-auto').style.color = tab === 'auto' ? '#fff' : '#555';
  document.getElementById('rtab-manual').style.background = tab === 'manual' ? '#185FA5' : '#fff';
  document.getElementById('rtab-manual').style.color = tab === 'manual' ? '#fff' : '#555';
  document.getElementById('route-auto-section').classList.toggle('hidden', tab !== 'auto');
  document.getElementById('route-manual-section').classList.toggle('hidden', tab !== 'manual');
  document.getElementById('route-action-btn').textContent = tab === 'auto' ? '搜尋路線' : '開始畫路線';
};

window.selectTransport = function(t) {
  pendingTransport = t;
  document.querySelectorAll('.transport-option').forEach(el => el.classList.remove('selected'));
  document.getElementById('t-' + t).classList.add('selected');
};

window.closeRouteModal = function() {
  document.getElementById('route-modal').classList.add('hidden');
};

window.handleRouteAction = function() {
  if (routeTabMode === 'auto') searchAutoRoute();
  else startDrawing();
};

// Auto route via Directions API
function searchAutoRoute() {
  const origin = document.getElementById('r-origin').value.trim();
  const dest   = document.getElementById('r-dest').value.trim();
  const name   = document.getElementById('r-name').value.trim() || `${origin} → ${dest}`;
  if (!origin || !dest) { alert('請輸入起點和終點'); return; }

  const t = TRANSPORT[pendingTransport];
  const travelMode = {
    drive: google.maps.TravelMode.DRIVING,
    walk:  google.maps.TravelMode.WALKING,
    train: google.maps.TravelMode.TRANSIT,
  }[pendingTransport];

  directionsService.route({
    origin, destination: dest, travelMode,
    region: 'jp',
  }, async (result, status) => {
    if (status !== google.maps.DirectionsStatus.OK) {
      alert('找不到路線，請確認起點和終點是否正確'); return;
    }

    // Extract points from route
    const leg = result.routes[0].legs[0];
    const points = [];
    leg.steps.forEach(step => {
      step.path.forEach(latlng => {
        points.push({ lat: latlng.lat(), lng: latlng.lng() });
      });
    });

    // Sample every N points to avoid hitting Firestore limits
    const maxPts = 200;
    const step = Math.max(1, Math.floor(points.length / maxPts));
    const sampled = points.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);

    await addRoute({ name, transport: pendingTransport, points: sampled });
    closeRouteModal();
    if (activeTab !== 'routes') switchTab('routes');

    // Show route briefly on map
    directionsRenderer.setMap(map);
    directionsRenderer.setDirections(result);
    directionsRenderer.setOptions({ polylineOptions: { strokeColor: t.color, strokeWeight: 4 } });
    setTimeout(() => directionsRenderer.setMap(null), 3000);
  });
}

// Manual drawing
function startDrawing() {
  const name = document.getElementById('r-name').value.trim() || '未命名路線';
  drawingRoute = { name, transport: pendingTransport };
  drawPath = [];
  if (drawPolyline) { drawPolyline.setMap(null); drawPolyline = null; }
  closeRouteModal();
  setMode('draw');
  const t = TRANSPORT[pendingTransport];
  drawPolyline = new google.maps.Polyline({
    path: [], map,
    strokeColor: t.color, strokeWeight: 3, strokeOpacity: 0.6,
    icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: `${t.dash[0] + t.dash[1]}px` }]
  });
}

function addDrawPoint(latLng) {
  drawPath.push({ lat: latLng.lat(), lng: latLng.lng() });
  drawPolyline.setPath(drawPath.map(p => ({ lat: p.lat, lng: p.lng })));
}

async function finishDrawing() {
  if (drawPath.length >= 2 && drawingRoute) {
    await addRoute({ name: drawingRoute.name, transport: drawingRoute.transport, points: drawPath });
  }
  if (drawPolyline) { drawPolyline.setMap(null); drawPolyline = null; }
  drawPath = []; drawingRoute = null;
  setMode('view');
  if (activeTab !== 'routes') switchTab('routes');
}

// ── Import ──
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
            city: loc.address ? loc.address.split(',').slice(-3, -1).join('').trim() : '',
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

// ── Expose globals ──
window.selectPlace = selectPlace;
window.selectRoute = selectRoute;
window.startDrawing = startDrawing;

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
