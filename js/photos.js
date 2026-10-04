// ══════════════════════════════════════
// photos.js — 照片：縮小並去除中繼資料、存進 Firestore `photos` 集合、讀取顯示
// 地點的 photos[] 存「fs:<文件ID>」；舊的網址照片照常顯示。被 app.js 與 share.html 引用
// ══════════════════════════════════════
import { collection, doc, addDoc, getDoc, updateDoc, deleteDoc, Bytes }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const MAX_PHOTOS = 5;
const MAX_EDGE = 1280;            // long edge in px
const MAX_BYTES = 900 * 1024;     // Firestore documents are limited to 1 MiB
const FS_PREFIX = 'fs:';

export const isFsPhoto = (ref) => typeof ref === 'string' && ref.startsWith(FS_PREFIX);
const fsId = (ref) => ref.slice(FS_PREFIX.length);

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片')); };
    img.src = url;
  });
}

// Resize to ≤1280px and re-encode as JPEG. Drawing through a canvas drops all metadata
// (GPS location, camera, time); the browser applies EXIF orientation when decoding.
export async function compressPhoto(blob) {
  const img = await loadImage(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  for (const quality of [0.75, 0.6, 0.45]) {
    const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (out && out.size <= MAX_BYTES) return { blob: out, w, h };
  }
  throw new Error('照片壓縮後仍太大');
}

// ref → Promise<display URL | null>. Firestore photos become blob: URLs (cached per page).
const urlCache = new Map();
export function photoUrl(db, ref) {
  if (!isFsPhoto(ref)) return Promise.resolve(ref || null);
  if (!urlCache.has(ref)) {
    urlCache.set(ref, getDoc(doc(db, 'photos', fsId(ref))).then((snap) => {
      if (!snap.exists()) return null;
      const bytes = snap.data().data.toUint8Array();
      return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    }).catch((err) => {
      console.warn('Photo load error:', ref, err);
      urlCache.delete(ref);  // allow a retry later (e.g. back online)
      return null;
    }));
  }
  return urlCache.get(ref);
}

// Upload a compressed photo; returns its "fs:<id>" ref. `shared` photos are readable by
// anyone who has a share link (see firestore.rules).
export async function uploadPhoto(db, uid, { blob, w, h }) {
  const bytes = Bytes.fromUint8Array(new Uint8Array(await blob.arrayBuffer()));
  const ref = await addDoc(collection(db, 'photos'), { uid, data: bytes, w, h, shared: false, createdAt: Date.now() });
  const key = FS_PREFIX + ref.id;
  urlCache.set(key, Promise.resolve(URL.createObjectURL(blob)));  // no need to download what we just uploaded
  return key;
}

export async function deletePhoto(db, ref) {
  if (!isFsPhoto(ref)) return;
  urlCache.delete(ref);
  await deleteDoc(doc(db, 'photos', fsId(ref)));
}

export async function sharePhoto(db, ref) {
  if (!isFsPhoto(ref)) return;
  await updateDoc(doc(db, 'photos', fsId(ref)), { shared: true });
}
