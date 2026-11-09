/* ==========================================================================
   KLUG Sound — data layer
   Two keyless, CORS-friendly catalogues:
   · Audius   — full-length tracks, artists, playlists (streamed from Audius)
   · iTunes   — mainstream search + 30-second Apple Music previews
   No API keys, no server, no user data leaves the device.
   ========================================================================== */

const AUDIUS_APP = "KLUG-MiniApp";
const AUDIUS_DISCOVERY = "https://api.audius.co";
const AUDIUS_FALLBACKS = [
  "https://api.audius.co",
  "https://discoveryprovider.audius.co",
  "https://discoveryprovider2.audius.co",
];
const ITUNES_BASE = "https://itunes.apple.com";
const DEEZER_BASE = "https://api.deezer.com";
const MB_BASE = "https://musicbrainz.org/ws/2";
const DEFAULT_TIMEOUT = 14000;

const BACKEND_BASE = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("backend");
    if (fromQuery) {
      localStorage.setItem("klug.backendUrl", fromQuery);
      return fromQuery.replace(/\/+$/, "");
    }
    const stored = localStorage.getItem("klug.backendUrl");
    if (stored) return stored.replace(/\/+$/, "");
  } catch {
    /* no-op */
  }
  return "https://hydrogen-fibre-bigger-proved.trycloudflare.com";
})();

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

let audiusHostPromise = null;
let audiusHost = null;
const cache = new Map();

/* ------------------------------------------------------------------------ */
/* Fetch helpers                                                            */
/* ------------------------------------------------------------------------ */

async function fetchJson(url, { timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Превышено время ожидания");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonp(url, { timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = "dz_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      if (window[callbackName]) {
        delete window[callbackName];
        script.remove();
        reject(new Error("Превышено время ожидания"));
      }
    }, timeout);
    window[callbackName] = (data) => {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      resolve(data);
    };
    script.onerror = () => {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      reject(new Error("Ошибка загрузки скрипта"));
    };
    script.src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=" + encodeURIComponent(callbackName);
    document.head.appendChild(script);
  });
}

async function resolveAudiusHost() {
  if (audiusHost) return audiusHost;
  if (!audiusHostPromise) {
    audiusHostPromise = (async () => {
      try {
        const payload = await fetchJson(AUDIUS_DISCOVERY, { timeout: 8000 });
        const list = Array.isArray(payload?.data)
          ? payload.data.filter((host) => typeof host === "string" && host.startsWith("https://"))
          : [];
        audiusHost =
          list.find((host) => host.includes("api.audius.co")) || list[0] || AUDIUS_FALLBACKS[0];
      } catch {
        audiusHost = AUDIUS_FALLBACKS[0];
      }
      return audiusHost;
    })();
  }
  return audiusHostPromise;
}

async function audiusGet(path, options) {
  const host = await resolveAudiusHost();
  try {
    return await fetchJson(host + path, options);
  } catch (error) {
    const fallback = AUDIUS_FALLBACKS.find((candidate) => candidate !== host);
    if (!fallback) throw error;
    const payload = await fetchJson(fallback + path, options);
    audiusHost = fallback;
    audiusHostPromise = Promise.resolve(fallback);
    return payload;
  }
}

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 80) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 20);
    oldest.forEach(([entry]) => cache.delete(entry));
  }
  return value;
}

export function clearApiCache() {
  cache.clear();
}

/* ------------------------------------------------------------------------ */
/* Normalisation                                                           */
/* ------------------------------------------------------------------------ */

function artworkFromAudius(art) {
  if (!art || typeof art !== "object") return "";
  return (
    art["1000x1000"] ||
    art["480x480"] ||
    art["150x150"] ||
    art["2000x"] ||
    art["640x"] ||
    ""
  );
}

function artworkFromItunes(url, size = 600) {
  if (!url) return "";
  return url
    .replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`)
    .replace(/\/\d+x\d+\./, `/${size}x${size}.`)
    .replace(/100x100bb/, `${size}x${size}bb`);
}

function mapAudiusTrack(track, host) {
  if (!track || !track.id) return null;
  const user = track.user || {};
  return {
    key: `audius:${track.id}`,
    source: "audius",
    id: String(track.id),
    title: cleanTitle(track.title || "Без названия"),
    artist: cleanArtistName(user.name || user.handle || "Неизвестный исполнитель"),
    artistKey: user.id ? `audius:${user.id}` : "",
    artistId: user.id ? String(user.id) : "",
    artistHandle: user.handle || "",
    album: cleanAlbumName(track.album_backlink?.playlist_name || ""),
    artwork: artworkFromAudius(track.artwork),
    duration: Number(track.duration) || 0,
    genre: track.genre || "",
    plays: Number(track.play_count) || 0,
    streamUrl: `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=${encodeURIComponent(
      AUDIUS_APP
    )}`,
    isPreview: false,
    permalink: track.permalink ? `https://audius.co${track.permalink}` : "",
    year: track.release_date ? String(track.release_date).slice(0, 4) : "",
  };
}

function mapAudiusArtist(user) {
  if (!user || !user.id) return null;
  return {
    key: `audius:${user.id}`,
    source: "audius",
    id: String(user.id),
    name: cleanArtistName(user.name || user.handle || "Неизвестный исполнитель"),
    handle: user.handle || "",
    avatar: artworkFromAudius(user.profile_picture),
    cover: artworkFromAudius(user.cover_photo),
    bio: user.bio || "",
    followers: Number(user.follower_count) || 0,
    trackCount: Number(user.track_count) || 0,
    verified: Boolean(user.is_verified),
    genre: user.genre || "",
    permalink: user.handle ? `https://audius.co/${user.handle}` : "",
  };
}

function mapAudiusPlaylist(playlist) {
  if (!playlist || !playlist.id) return null;
  const user = playlist.user || {};
  return {
    key: `audius:${playlist.id}`,
    id: String(playlist.id),
    source: "audius",
    title: playlist.playlist_name || "Плейлист",
    curator: user.name || user.handle || "Audius",
    curatorKey: user.id ? `audius:${user.id}` : "",
    artwork: artworkFromAudius(playlist.artwork),
    trackCount: Number(playlist.track_count) || 0,
    isAlbum: Boolean(playlist.is_album),
    description: playlist.description || "",
    permalink: playlist.permalink ? `https://audius.co${playlist.permalink}` : "",
  };
}

function mapItunesTrack(row) {
  if (!row || !row.previewUrl || !row.trackId) return null;
  return {
    key: `itunes:${row.trackId}`,
    source: "itunes",
    id: String(row.trackId),
    title: cleanTitle(row.trackName || "Без названия"),
    artist: cleanArtistName(row.artistName || "Неизвестный исполнитель"),
    artistKey: row.artistId ? `itunes:${row.artistId}` : "",
    artistId: row.artistId ? String(row.artistId) : "",
    album: cleanAlbumName(row.collectionName || ""),
    artwork: artworkFromItunes(row.artworkUrl100),
    duration: Math.max(1, Math.round((Number(row.trackTimeMillis) || 30000) / 1000)),
    genre: row.primaryGenreName || "",
    plays: 0,
    streamUrl: row.previewUrl,
    isPreview: true,
    permalink: row.trackViewUrl || "",
    year: row.releaseDate ? String(row.releaseDate).slice(0, 4) : "",
  };
}

function mapItunesArtistFromSearch(row) {
  if (!row || !row.artistId) return null;
  return {
    key: `itunes:${row.artistId}`,
    source: "itunes",
    id: String(row.artistId),
    name: row.artistName || "Неизвестный исполнитель",
    handle: "",
    avatar: "",
    cover: "",
    bio: "",
    followers: null,
    trackCount: null,
    verified: false,
    genre: row.primaryGenreName || "",
    permalink: row.artistLinkUrl || "",
  };
}

function mapItunesArtistFromTrack(track) {
  return {
    key: track.artistKey,
    source: "itunes",
    id: track.artistId,
    name: track.artist,
    handle: "",
    avatar: track.artwork,
    cover: "",
    bio: "",
    followers: null,
    trackCount: null,
    verified: false,
    genre: track.genre,
    permalink: "",
  };
}

/* ------------------------------------------------------------------------ */
/* Deezer                                                                   */
/* ------------------------------------------------------------------------ */

function mapDeezermTrack(track) {
  if (!track || !track.id) return null;
  const artist = track.artist || {};
  return {
    key: `deezer:${track.id}`,
    source: "deezer",
    id: String(track.id),
    title: cleanTitle(track.title || "Без названия"),
    artist: cleanArtistName(artist.name || "Неизвестный исполнитель"),
    artistKey: artist.id ? `deezer:${artist.id}` : "",
    artistId: artist.id ? String(artist.id) : "",
    artistHandle: artist.id ? String(artist.id) : "",
    album: cleanAlbumName(track.album?.title || ""),
    artwork: track.cover_big || "",
    duration: Number(track.duration) || 0,
    genre: Array.isArray(track.genres?.data) ? track.genres.data[0]?.name || "" : "",
    plays: Number(track.play_count) || Number(track.track_count) || 0,
    streamUrl: `${DEEZER_BASE}/track/${encodeURIComponent(String(track.id))}/stream`,
    isPreview: false,
    permalink: track.link || "",
    year: track.release_date ? String(track.release_date).slice(0, 4) : "",
  };
}

function mapDeezermArtist(artist) {
  if (!artist || !artist.id) return null;
  return {
    key: `deezer:${artist.id}`,
    source: "deezer",
    id: String(artist.id),
    name: artist.name || "Неизвестный исполнитель",
    handle: artist.id ? String(artist.id) : "",
    avatar: artist.picture || "",
    cover: artist.picture || "",
    bio: artist.bio || "",
    followers: Number(artist.fan_count) || 0,
    trackCount: Number(artist.track_count) || 0,
    verified: false,
    genre: Array.isArray(artist.genres?.data) ? artist.genres.data[0]?.name || "" : "",
    permalink: artist.link || "",
  };
}

async function searchDeezermTracks(query, limit) {
  return cached(`deezer:track:${normalize(query)}`, 3 * 60 * 1000, async () => {
    const payload = await fetchJsonp(
      `${DEEZER_BASE}/search?q=${encodeURIComponent(query)}&index=track&limit=${limit}`
    );
    const tracks = (payload?.data || []).filter((row) => row?.id).map(mapDeezermTrack).filter(Boolean);
    return { tracks };
  });
}

async function searchDeezermArtists(query, limit) {
  return cached(`deezer:artist:${normalize(query)}`, 10 * 60 * 1000, async () => {
    const payload = await fetchJsonp(
      `${DEEZER_BASE}/search?q=${encodeURIComponent(query)}&index=artist&limit=${limit}`
    );
    const artists = (payload?.data || []).filter((row) => row?.id && !row.track).map(mapDeezermArtist).filter(Boolean);
    return { artists };
  });
}

/* ------------------------------------------------------------------------ */
/* YouTube (via local yt-dlp backend)                                      */
/* ------------------------------------------------------------------------ */

async function backendAvailable() {
  try {
    const response = await fetch(`${BACKEND_BASE}/api/health`, {
      mode: "cors",
      credentials: "omit",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function mapYouTubeTrack(row) {
  if (!row || !row.id) return null;
  const streamUrl = row.streamUrl || row.stream_url || "";
  const absoluteStream = streamUrl.startsWith("http")
    ? streamUrl
    : `${BACKEND_BASE}${streamUrl.startsWith("/") ? "" : "/"}${streamUrl}`;
  return {
    key: row.key || `youtube:${row.id}`,
    source: "youtube",
    id: String(row.id),
    title: cleanTitle(row.title || "Без названия"),
    artist: cleanArtistName(row.artist || "Неизвестный исполнитель"),
    artistKey: row.artistKey || row.artist_key || (row.artistId ? `youtube:${row.artistId}` : ""),
    artistId: row.artistId ? String(row.artistId) : (row.artist_id ? String(row.artist_id) : ""),
    artistHandle: row.artistHandle || "",
    album: cleanAlbumName(row.album || ""),
    artwork: row.artwork || "",
    duration: Number(row.duration) || 0,
    genre: row.genre || "",
    plays: Number(row.plays) || 0,
    streamUrl: absoluteStream,
    isPreview: false,
    permalink: row.permalink || `https://www.youtube.com/watch?v=${row.id}`,
    year: row.year || "",
    isRemix: typeof row.isRemix === "boolean" ? row.isRemix : isLikelyRemix(row.title || ""),
  };
}

function mapYouTubeArtist(row) {
  if (!row || !row.id) return null;
  return {
    key: row.key || `youtube:${row.id}`,
    source: "youtube",
    id: String(row.id),
    name: cleanArtistName(row.name || "Неизвестный исполнитель"),
    handle: row.handle || "",
    avatar: row.avatar || row.artwork || "",
    cover: row.cover || row.avatar || "",
    bio: row.bio || "",
    followers: row.followers ?? null,
    trackCount: row.trackCount ?? row.track_count ?? null,
    verified: Boolean(row.verified),
    genre: row.genre || "",
    permalink: row.permalink || (row.id ? `https://www.youtube.com/channel/${row.id}` : ""),
  };
}

async function searchYouTube(query, limit) {
  if (!(await backendAvailable())) return { tracks: [], artists: [] };
  return cached(`youtube:track:${normalize(query)}`, 3 * 60 * 1000, async () => {
    const response = await fetchJson(
      `${BACKEND_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { timeout: 30000 }
    );
    const tracks = (response?.tracks || []).map(mapYouTubeTrack).filter(Boolean);
    const artists = (response?.artists || []).map(mapYouTubeArtist).filter(Boolean);
    return { tracks, artists };
  });
}

async function getYouTubeArtist(source, id) {
  if (!(await backendAvailable())) throw new Error("YouTube-бэкенд недоступен");
  // id may be channel id or search query
  const params = id && String(id).startsWith("UC")
    ? `channel_id=${encodeURIComponent(id)}`
    : `q=${encodeURIComponent(id)}`;
  const response = await fetchJson(
    `${BACKEND_BASE}/api/artist?${params}&limit=60`,
    { timeout: 60000 }
  );
  if (response?.error) throw new Error(response.error);
  const artist = mapYouTubeArtist(response?.artist);
  if (!artist) throw new Error("Исполнитель не найден");
  const tracks = (response?.tracks || []).map(mapYouTubeTrack).filter(Boolean);
  const albums = (response?.albums || []).map((album) => ({
    title: album?.title || "Альбом",
    year: album?.year || "",
    artwork: album?.artwork || "",
    tracks: (album?.tracks || []).map(mapYouTubeTrack).filter(Boolean),
  }));
  const popular = (response?.popular || []).map(mapYouTubeTrack).filter(Boolean);
  return { artist, tracks, albums, popular };
}

/* ------------------------------------------------------------------------ */
/* Deduplication                                                           */
/* ------------------------------------------------------------------------ */

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(feat|ft|featuring)\b[\s\S]*$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function trackSignature(track) {
  return `${normalize(track.artist)}|${normalize(track.title)}`;
}

function cleanTitle(value) {
  let text = String(value || "")
    .replace(/_/g, " ")
    .replace(/\s*\[([^\]]*)\]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  text = text.replace(/\s+[-–—:]\s*$/, "").trim();
  return text;
}

function cleanArtistName(value) {
  return String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function cleanAlbumName(value) {
  return String(value || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (!track || !track.streamUrl) return false;
    const signature = trackSignature(track);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function blend(primary, secondary) {
  const result = [];
  const length = Math.max(primary.length, secondary.length);
  for (let index = 0; index < length; index += 1) {
    if (primary[index]) result.push(primary[index]);
    if (secondary[index]) result.push(secondary[index]);
  }
  return result;
}

function mergeArtists(primary, secondary, ...rest) {
  const map = new Map();
  const sources = [primary, secondary, ...rest].filter((list) => Array.isArray(list));
  sources.flat().forEach((artist) => {
    if (!artist?.name) return;
    const signature = normalize(artist.name);
    const existing = map.get(signature);
    if (!existing) {
      map.set(signature, artist);
      return;
    }
    if (!existing.avatar && artist.avatar) existing.avatar = artist.avatar;
    if (!existing.bio && artist.bio) existing.bio = artist.bio;
    if (existing.followers == null && artist.followers != null) existing.followers = artist.followers;
    if (existing.trackCount == null && artist.trackCount != null) existing.trackCount = artist.trackCount;
  });
  return [...map.values()];
}

function isLikelyRemix(title) {
  const value = String(title || "");
  const pattern = /\b(mix|remix|remake|cover|bootleg|acoustic|live|radio[-_ ]?edit|edit|instrumental|electroacoustic|rework|flip|take)\b/i;
  return pattern.test(value);
}

/* ------------------------------------------------------------------------ */
/* Audius                                                                  */
/* ------------------------------------------------------------------------ */

async function searchAudius(query, limit) {
  const [tracksResult, artistsResult] = await Promise.allSettled([
    audiusGet(
      `/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${encodeURIComponent(
        AUDIUS_APP
      )}&limit=${limit}`
    ),
    audiusGet(
      `/v1/users/search?query=${encodeURIComponent(query)}&app_name=${encodeURIComponent(
        AUDIUS_APP
      )}&limit=10`
    ),
  ]);

  const host = await resolveAudiusHost();
  const rawTracks = tracksResult.status === "fulfilled" ? tracksResult.value?.data || [] : [];
  const tracks = dedupeTracks(
    rawTracks
      .filter((track) => !track.is_stream_gated && !track.is_delete)
      .map((track) => mapAudiusTrack(track, host))
  );

  const rawArtists = artistsResult.status === "fulfilled" ? artistsResult.value?.data || [] : [];
  const artists = rawArtists.map(mapAudiusArtist).filter(Boolean);

  if (tracksResult.status === "rejected" && artistsResult.status === "rejected") {
    throw tracksResult.reason;
  }
  return { tracks, artists };
}

async function searchItunes(query, limit) {
  const [songsResult, artistsResult] = await Promise.allSettled([
    fetchJson(
      `${ITUNES_BASE}/search?term=${encodeURIComponent(
        query
      )}&media=music&entity=song&limit=${limit}&country=us`
    ),
    fetchJson(
      `${ITUNES_BASE}/search?term=${encodeURIComponent(
        query
      )}&media=music&entity=musicArtist&limit=12&country=us`
    ),
  ]);

  const rawSongs = songsResult.status === "fulfilled" ? songsResult.value?.results || [] : [];
  const tracks = dedupeTracks(rawSongs.map(mapItunesTrack));

  const fromSongs = tracks.map(mapItunesArtistFromTrack);
  const rawArtists = artistsResult.status === "fulfilled" ? artistsResult.value?.results || [] : [];
  const fromApi = rawArtists.map(mapItunesArtistFromSearch);

  if (songsResult.status === "rejected" && artistsResult.status === "rejected") {
    throw songsResult.reason;
  }
  return { tracks, artists: mergeArtists(fromSongs, fromApi.filter(Boolean)) };
}

export async function searchAll(query) {
  const term = String(query || "").trim();
  if (term.length < 2) return { tracks: [], artists: [], errors: [] };

  return cached(`search:${normalize(term)}`, 3 * 60 * 1000, async () => {
    const [audius, itunes, youtube] = await Promise.allSettled([
      searchAudius(term, 50),
      searchItunes(term, 50),
      searchYouTube(term, 40),
    ]);

    const errors = [];
    if (audius.status === "rejected") errors.push("Audius");
    if (itunes.status === "rejected") errors.push("Apple Music");
    if (youtube.status === "rejected") errors.push("YouTube");

    if (
      audius.status === "rejected" &&
      itunes.status === "rejected" &&
      youtube.status === "rejected"
    ) {
      throw new Error("Каталоги временно недоступны");
    }

    const audiusValue = audius.status === "fulfilled" ? audius.value : { tracks: [], artists: [] };
    const itunesValue = itunes.status === "fulfilled" ? itunes.value : { tracks: [], artists: [] };
    const youtubeValue = youtube.status === "fulfilled" ? youtube.value : { tracks: [], artists: [] };

    // YouTube (yt-dlp) идёт первым — там есть русские исполнители и полные треки.
    const mergedTracks = dedupeTracks([...youtubeValue.tracks, ...itunesValue.tracks, ...audiusValue.tracks]);
    mergedTracks.forEach((track) => {
      track.isRemix = typeof track.isRemix === "boolean" ? track.isRemix : isLikelyRemix(track?.title);
    });
    // Оригиналы раньше ремиксов.
    mergedTracks.sort((a, b) => Number(!!a?.isRemix) - Number(!!b?.isRemix));

    const artistValue = mergeArtists(
      youtubeValue.artists,
      itunesValue.artists,
      audiusValue.artists
    ).slice(0, 12);

    return {
      tracks: mergedTracks.slice(0, 40),
      artists: artistValue,
      errors,
    };
  });
}

export async function getHome() {
  return cached("home", 4 * 60 * 1000, async () => {
    const [audiusTracks, audiusPlaylists] = await Promise.allSettled([
      audiusGet(
        `/v1/tracks/trending?app_name=${encodeURIComponent(
          AUDIUS_APP
        )}&time=week&limit=24`
      ),
      audiusGet(
        `/v1/playlists/trending?app_name=${encodeURIComponent(
          AUDIUS_APP
        )}&time=week&limit=8`
      ),
    ]);

    const host = await resolveAudiusHost();
    const rawTracks = audiusTracks.status === "fulfilled" ? audiusTracks.value?.data || [] : [];
    const audiusTracksNorm = dedupeTracks(
      rawTracks
        .filter((track) => !track.is_stream_gated && !track.is_delete)
        .map((track) => mapAudiusTrack(track, host))
    );

    const artistMap = new Map();
    rawTracks.forEach((track) => {
      if (track.user?.id && !artistMap.has(track.user.id)) {
        artistMap.set(track.user.id, mapAudiusArtist(track.user));
      }
    });

    const rawPlaylists =
      audiusPlaylists.status === "fulfilled" ? audiusPlaylists.value?.data || [] : [];
    const playlists = rawPlaylists.map(mapAudiusPlaylist).filter(Boolean);

    let youtubeTracks = [];
    let youtubeArtists = [];
    try {
      if (await backendAvailable()) {
        const ytPayload = await fetchJson(`${BACKEND_BASE}/api/trending?limit=24`, { timeout: 25000 });
        youtubeTracks = (ytPayload?.tracks || []).map(mapYouTubeTrack).filter(Boolean);
        youtubeArtists = (ytPayload?.artists || []).map(mapYouTubeArtist).filter(Boolean);
      }
    } catch {
      /* backend optional */
    }

    const tracks = dedupeTracks([...youtubeTracks, ...audiusTracksNorm]);
    if (!tracks.length) throw new Error("Каталог пуст");

    const artists = mergeArtists(youtubeArtists, [...artistMap.values()].filter(Boolean)).slice(0, 12);
    const playlistsFinal = playlists.slice(0, 8);

    return {
      tracks,
      artists,
      playlists: playlistsFinal,
      featured: tracks[0],
    };
  });
}

export async function getArtist(source, id) {
  if (!source || !id) throw new Error("Исполнитель не найден");
  return cached(`artist:${source}:${id}`, 8 * 60 * 1000, async () => {
    if (source === "audius") {
      const [userResult, tracksResult] = await Promise.all([
        audiusGet(
          `/v1/users/${encodeURIComponent(id)}?app_name=${encodeURIComponent(AUDIUS_APP)}`
        ),
        audiusGet(
          `/v1/users/${encodeURIComponent(id)}/tracks?app_name=${encodeURIComponent(
            AUDIUS_APP
          )}&limit=100&sort=plays`
        ),
      ]);
      const artist = mapAudiusArtist(userResult?.data);
      if (!artist) throw new Error("Исполнитель не найден");
      const host = await resolveAudiusHost();
      const rawTracks = tracksResult?.data || [];
      const tracks = dedupeTracks(
        rawTracks
          .filter((track) => !track.is_stream_gated && !track.is_delete)
          .map((track) => mapAudiusTrack(track, host))
      );
      if (!artist.avatar && tracks[0]?.artwork) artist.avatar = tracks[0].artwork;

      // У артистов с почти пустым каталогом ищем их треки по имени,
      // чтобы страница исполнителя не была пустой.
      if (!tracks.length) {
        const fallbackResult = await audiusGet(
          `/v1/tracks/search?query=${encodeURIComponent(artist.name || artist.handle || "")}&app_name=${encodeURIComponent(
            AUDIUS_APP
          )}&limit=40`
        );
        const fallbackRaw = fallbackResult?.data || [];
        tracks.push(
          ...fallbackRaw
            .filter((track) => !track.is_stream_gated && !track.is_delete)
            .map((track) => mapAudiusTrack(track, host))
        );
        artist.trackCount = tracks.length;
      }
      return { artist, tracks };
    }

    if (source === "itunes") {
      const payload = await fetchJson(
        `${ITUNES_BASE}/lookup?id=${encodeURIComponent(
          id
        )}&entity=song&limit=200&country=us`
      );
      const rows = payload?.results || [];
      const artistRow = rows.find((row) => row.wrapperType === "artist");
      const allTracks = rows
        .filter((row) => row.wrapperType === "track")
        .map(mapItunesTrack)
        .filter(Boolean);
      const own = allTracks.filter((track) => track.artistId === String(id));
      const featured = allTracks.filter((track) => track.artistId !== String(id));
      const tracks = dedupeTracks([...own, ...featured]).slice(0, 80);

      if (!artistRow && !tracks.length) throw new Error("Исполнитель не найден");

      const artist = {
        key: `itunes:${id}`,
        source: "itunes",
        id: String(id),
        name: artistRow?.artistName || tracks[0]?.artist || "Исполнитель",
        handle: "",
        avatar: tracks[0]?.artwork || "",
        cover: tracks[0]?.artwork || "",
        bio: "",
        followers: null,
        trackCount: tracks.length || null,
        verified: false,
        genre: artistRow?.primaryGenreName || tracks[0]?.genre || "",
        permalink: artistRow?.artistLinkUrl || "",
      };
      return { artist, tracks };
    }

    if (source === "deezer") {
      const artistPayload = await fetchJsonp(`${DEEZER_BASE}/artist/${encodeURIComponent(id)}`);
      const artist = mapDeezermArtist(artistPayload?.data || artistPayload);
      if (!artist) throw new Error("Deezer: исполнитель не найден");
      const tracksUrl = (artistPayload?.data || artistPayload)?.tracklist || `${DEEZER_BASE}/artist/${encodeURIComponent(id)}/top?limit=50`;
      const tracksPayload = await fetchJsonp(tracksUrl);
      const tracks = (tracksPayload?.data || []).filter((row) => row?.id).map(mapDeezermTrack).filter(Boolean);
      if (!artist.avatar && tracks[0]?.artwork) artist.avatar = tracks[0].artwork;
      return { artist, tracks };
    }

    if (source === "youtube") {
      return await getYouTubeArtist(source, id);
    }

    if (source === "musicbrainz") {
      const data = await getMbArtist(id);
      return { artist: data.artist, tracks: data.tracks };
    }

    throw new Error("Неизвестный источник");
  });
}

export async function getDeezermArtist(id) {
  if (!id) throw new Error("Исполнитель не найден");
  return cached(`deezer:artist:${id}`, 8 * 60 * 1000, async () => {
    const payload = await fetchJsonp(`${DEEZER_BASE}/artist/${encodeURIComponent(id)}`);
    const artist = mapDeezermArtist(payload?.data || payload);
    if (!artist) throw new Error("Deezer: исполнитель не найден");
    const tracksUrl = (payload?.data || payload)?.tracklist || `${DEEZER_BASE}/artist/${encodeURIComponent(id)}/top?limit=50`;
    const tracksPayload = await fetchJsonp(tracksUrl);
    const tracks = (tracksPayload?.data || []).filter((row) => row?.id).map(mapDeezermTrack).filter(Boolean);
    if (!artist.avatar && tracks[0]?.artwork) artist.avatar = tracks[0].artwork;
    return { artist, tracks };
  });
}

/* ------------------------------------------------------------------------ */
/* MusicBrainz                                                              */
/* ------------------------------------------------------------------------ */

function mapMbArtist(artist) {
  if (!artist?.id) return null;
  return {
    key: `mb:${artist.id}`,
    source: "musicbrainz",
    id: String(artist.id),
    name: cleanArtistName(artist.name || "Неизвестный исполнитель"),
    handle: "",
    avatar: "",
    cover: "",
    bio: artist.ongoingRelations?.[0]?.targetName || "",
    followers: null,
    trackCount: null,
    verified: false,
    genre: "",
    permalink: `https://musicbrainz.org/artist/${artist.id}`,
  };
}

async function searchMbArtists(query, limit) {
  const payload = await fetchJson(`${MB_BASE}/artist?artist=${encodeURIComponent(query)}&fmt=json&limit=${limit}`);
  const artists = (payload?.artists || []).map((row) => mapMbArtist(row)).filter(Boolean);
  return { artists };
}

async function getMbArtist(id) {
  const payload = await fetchJson(`${MB_BASE}/artist/${encodeURIComponent(id)}?inc=releases&fmt=json`);
  const artist = mapMbArtist(payload?.artist || payload);
  if (!artist) throw new Error("MusicBrainz: исполнитель не найден");
  const releases = payload?.releases || [];
  const tracks = releases.map((release) => ({
    key: `mb:${release.id}`,
    source: "musicbrainz",
    id: String(release.id),
    title: cleanTitle(release.title),
    artist: cleanArtistName(artist.name),
    artistKey: artist.key,
    artistId: artist.id,
    artistHandle: artist.handle,
    album: cleanAlbumName(release.title),
    artwork: "",
    duration: 0,
    genre: release?.primaryType || "",
    plays: 0,
    streamUrl: "",
    isPreview: false,
    permalink: artist.permalink,
    year: release.date ? String(release.date).slice(0, 4) : "",
  }));
  return { artist, releases, tracks };
}

export async function getPlaylist(id) {
  if (!id) throw new Error("Плейлист не найден");
  return cached(`playlist:${id}`, 8 * 60 * 1000, async () => {
    const [metaResult, tracksResult] = await Promise.all([
      audiusGet(
        `/v1/playlists/${encodeURIComponent(id)}?app_name=${encodeURIComponent(AUDIUS_APP)}`
      ),
      audiusGet(
        `/v1/playlists/${encodeURIComponent(id)}/tracks?app_name=${encodeURIComponent(
          AUDIUS_APP
        )}&limit=100`
      ),
    ]);

    const rawPlaylist = Array.isArray(metaResult?.data) ? metaResult.data[0] : metaResult?.data;
    const playlist = mapAudiusPlaylist(rawPlaylist);
    if (!playlist) throw new Error("Плейлист не найден");

    const host = await resolveAudiusHost();
    const rawTracks = tracksResult?.data || [];
    const tracks = dedupeTracks(
      rawTracks
        .filter((track) => !track.is_stream_gated && !track.is_delete)
        .map((track) => mapAudiusTrack(track, host))
    );
    return { playlist, tracks };
  });
}

export async function getTrendingTracks(limit = 50) {
  return cached(`trending:${limit}`, 2 * 60 * 1000, async () => {
    const payload = await audiusGet(
      `/v1/tracks/trending?app_name=${encodeURIComponent(
        AUDIUS_APP
      )}&time=week&limit=${limit}`
    );
    const host = await resolveAudiusHost();
    return dedupeTracks(
      (payload?.data || [])
        .filter((track) => !track.is_stream_gated && !track.is_delete)
        .map((track) => mapAudiusTrack(track, host))
    );
  });
}

export async function refreshStreamUrl(track) {
  if (track?.source !== "audius") return track?.streamUrl || "";
  const host = await resolveAudiusHost();
  return `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=${encodeURIComponent(
    AUDIUS_APP
  )}`;
}

export const SOURCE_LABELS = {
  audius: { short: "FULL", label: "Audius · полный трек" },
  itunes: { short: "30 SEC", label: "Apple Music · превью" },
  deezer: { short: "FULL", label: "Deezer · полный трек" },
  youtube: { short: "FULL", label: "YouTube · yt-dlp" },
};
