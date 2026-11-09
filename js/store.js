/* ==========================================================================
   KLUG Sound — local persistence
   Likes, listening history and player preferences stay on the device.
   ========================================================================== */

const KEYS = {
  likes: "klug.music.likes.v1",
  recent: "klug.music.recent.v1",
  settings: "klug.music.player.v1",
  searches: "klug.music.searches.v1",
  playlists: "klug.music.playlists.v1",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isTrack(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.key === "string" &&
      typeof value.title === "string" &&
      typeof value.artist === "string" &&
      typeof value.streamUrl === "string"
  );
}

/* Likes ------------------------------------------------------------------ */

export function getLikes() {
  const list = read(KEYS.likes, []);
  if (!Array.isArray(list)) return [];
  return list.filter(isTrack).slice(0, 400);
}

export function isLiked(key) {
  return getLikes().some((track) => track.key === key);
}

export function toggleLike(track) {
  if (!isTrack(track)) return false;
  const likes = getLikes();
  const index = likes.findIndex((item) => item.key === track.key);
  if (index >= 0) {
    likes.splice(index, 1);
    write(KEYS.likes, likes);
    return false;
  }
  likes.unshift(track);
  write(KEYS.likes, likes.slice(0, 400));
  return true;
}

export function removeLike(key) {
  const likes = getLikes().filter((track) => track.key !== key);
  write(KEYS.likes, likes);
}

/* Recent ----------------------------------------------------------------- */

export function getRecent() {
  const list = read(KEYS.recent, []);
  if (!Array.isArray(list)) return [];
  return list.filter(isTrack).slice(0, 40);
}

export function addRecent(track) {
  if (!isTrack(track)) return;
  const recent = getRecent().filter((item) => item.key !== track.key);
  recent.unshift(track);
  write(KEYS.recent, recent.slice(0, 40));
}

export function clearRecent() {
  write(KEYS.recent, []);
}

/* Player settings -------------------------------------------------------- */

const DEFAULT_SETTINGS = {
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
};

export function getSettings() {
  const raw = read(KEYS.settings, {});
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    volume:
      typeof value.volume === "number" && value.volume >= 0 && value.volume <= 1
        ? value.volume
        : DEFAULT_SETTINGS.volume,
    muted: Boolean(value.muted),
    shuffle: Boolean(value.shuffle),
    repeat: ["off", "all", "one"].includes(value.repeat) ? value.repeat : "off",
  };
}

export function saveSettings(settings) {
  write(KEYS.settings, { ...DEFAULT_SETTINGS, ...settings });
}

/* Search history --------------------------------------------------------- */

export function getSearches() {
  const list = read(KEYS.searches, []);
  return Array.isArray(list) ? list.filter((item) => typeof item === "string").slice(0, 8) : [];
}

export function addSearch(query) {
  const term = String(query || "").trim();
  if (term.length < 2) return;
  const list = getSearches().filter((item) => item.toLowerCase() !== term.toLowerCase());
  list.unshift(term);
  write(KEYS.searches, list.slice(0, 8));
}

export function clearSearches() {
  write(KEYS.searches, []);
}

/* Custom playlists ------------------------------------------------------- */

function isPlaylist(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      Array.isArray(value.tracks)
  );
}

export function getPlaylists() {
  const list = read(KEYS.playlists, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(isPlaylist)
    .map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      tracks: playlist.tracks.filter(isTrack).slice(0, 500),
      createdAt: playlist.createdAt || Date.now(),
    }))
    .slice(0, 100);
}

function savePlaylists(playlists) {
  write(KEYS.playlists, playlists.slice(0, 100));
}

export function createPlaylist(name) {
  const title = String(name || "").trim().slice(0, 60) || "Новый плейлист";
  const playlists = getPlaylists();
  const id = "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const playlist = { id, name: title, tracks: [], createdAt: Date.now() };
  playlists.unshift(playlist);
  savePlaylists(playlists);
  return playlist;
}

export function renamePlaylist(id, name) {
  const title = String(name || "").trim().slice(0, 60);
  if (!title) return false;
  const playlists = getPlaylists();
  const playlist = playlists.find((item) => item.id === id);
  if (!playlist) return false;
  playlist.name = title;
  savePlaylists(playlists);
  return true;
}

export function deletePlaylist(id) {
  const playlists = getPlaylists().filter((item) => item.id !== id);
  savePlaylists(playlists);
}

export function getPlaylistById(id) {
  return getPlaylists().find((item) => item.id === id) || null;
}

export function addToPlaylist(id, track) {
  if (!isTrack(track)) return false;
  const playlists = getPlaylists();
  const playlist = playlists.find((item) => item.id === id);
  if (!playlist) return false;
  if (playlist.tracks.some((item) => item.key === track.key)) return false;
  playlist.tracks.unshift(track);
  savePlaylists(playlists);
  return true;
}

export function removeFromPlaylist(id, trackKey) {
  const playlists = getPlaylists();
  const playlist = playlists.find((item) => item.id === id);
  if (!playlist) return false;
  playlist.tracks = playlist.tracks.filter((item) => item.key !== trackKey);
  savePlaylists(playlists);
  return true;
}
