/* ==========================================================================
   KLUG Sound — player application
   ========================================================================== */

import { icon } from "./icons.js";
import * as api from "./api.js";
import * as store from "./store.js";

/* ------------------------------------------------------------------------ */
/* DOM helpers                                                              */
/* ------------------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  view: $("#view"),
  main: $(".main"),
  topbarContext: $("#topbarContext"),
  backBtn: $("#backBtn"),
  randomBtn: $("#randomBtn"),
  userChip: $("#userChip"),
  userAvatar: $("#userAvatar"),
  userName: $("#userName"),
  likedCount: $("#likedCount"),
  audio: $("#audio"),
  playerbar: $("#playerbar"),
  pbArt: $("#pbArt"),
  pbArtBtn: $("#pbArtBtn"),
  pbTitle: $("#pbTitle"),
  pbSub: $("#pbSub"),
  pbLike: $("#pbLike"),
  playBtn: $("#playBtn"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  shuffleBtn: $("#shuffleBtn"),
  repeatBtn: $("#repeatBtn"),
  progress: $("#progress"),
  curTime: $("#curTime"),
  durTime: $("#durTime"),
  volume: $("#volume"),
  muteBtn: $("#muteBtn"),
  queueBtn: $("#queueBtn"),
  expandBtn: $("#expandBtn"),
  pbLoading: $("#pbLoading"),
  queueDrawer: $("#queueDrawer"),
  queueTitle: $("#queueTitle"),
  queueList: $("#queueList"),
  queueClose: $("#queueClose"),
  scrim: $("#scrim"),
  nowPlaying: $("#nowPlaying"),
  npBg: $("#npBg"),
  npClose: $("#npClose"),
  npArt: $("#npArt"),
  npTitle: $("#npTitle"),
  npArtist: $("#npArtist"),
  npSource: $("#npSource"),
  npLike: $("#npLike"),
  npProgress: $("#npProgress"),
  npCur: $("#npCur"),
  npDur: $("#npDur"),
  npShuffle: $("#npShuffle"),
  npPrev: $("#npPrev"),
  npPlay: $("#npPlay"),
  npNext: $("#npNext"),
  npRepeat: $("#npRepeat"),
  npVolume: $("#npVolume"),
  npMute: $("#npMute"),
  npQueue: $("#npQueue"),
  npQueueCount: $("#npQueueCount"),
  toasts: $("#toasts"),
};

const audio = els.audio;

/* ------------------------------------------------------------------------ */
/* App state                                                                */
/* ------------------------------------------------------------------------ */

const state = {
  route: { name: "home", params: new URLSearchParams() },
  routeToken: 0,
  lists: new Map(),
  tracks: new Map(),
  artists: new Map(),
  likes: new Set(store.getLikes().map((track) => track.key)),
  settings: store.getSettings(),
  current: null,
  queue: [],
  index: -1,
  playing: false,
  seeking: false,
  homeCache: null,
  searchCache: new Map(),
  artistCache: new Map(),
  playlistCache: new Map(),
  search: {
    q: "",
    tab: "all",
    data: null,
    loading: false,
    error: null,
    token: 0,
    originalOnly: true,
  },
  npOpen: false,
  drawerOpen: false,
  user: null,
  tg: null,
  lastVolume: 0.8,
  loadingTimer: null,
};

const PALETTE = [
  ["#d4ff57", "#18352a"],
  ["#7db8ff", "#1a2344"],
  ["#ff8eb7", "#3a1527"],
  ["#a99bff", "#231b48"],
  ["#ffd166", "#3b2a10"],
  ["#6fe7c4", "#10362c"],
  ["#ff9f7a", "#3a1c12"],
  ["#c4b5fd", "#251a3c"],
  ["#8ef0a3", "#123a1e"],
  ["#f0a6ff", "#34163c"],
];

/* ------------------------------------------------------------------------ */
/* Small utilities                                                          */
/* ------------------------------------------------------------------------ */

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number >= 1e9) return `${(number / 1e9).toFixed(1).replace(".", ",")} млрд`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1).replace(".", ",")} тыс.`;
  return String(Math.max(0, Math.round(number)));
}

function formatFollowers(value) {
  if (value == null) return "";
  return `${formatCompact(value)} подписчиков`;
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function gradientFor(value) {
  return PALETTE[hashString(value) % PALETTE.length];
}

function initialsOf(value, max = 2) {
  const words = String(value || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "K";
  return words
    .slice(0, max)
    .map((word) => [...word][0] || "")
    .join("")
    .toUpperCase();
}

function artistHref(key) {
  if (!key) return "#/search";
  const separator = key.indexOf(":");
  if (separator < 0) return "#/search";
  const source = key.slice(0, separator);
  const id = key.slice(separator + 1);
  return `#/artist/${source}/${encodeURIComponent(id)}`;
}

function artistLink(track, className = "") {
  if (!track?.artistKey) return `<span>${esc(track?.artist || "Неизвестный исполнитель")}</span>`;
  return `<a class="${className}" href="${artistHref(track.artistKey)}">${esc(track.artist)}</a>`;
}

function art(item, { round = false, className = "", label = "" } = {}) {
  const [g1, g2] = gradientFor(item?.key || item?.artwork || item?.name || item?.title || "klug");
  const src = item?.artwork || item?.avatar || "";
  const caption = initialsOf(label || item?.artist || item?.name || item?.title || "K");
  return `<span class="art ${round ? "art--round" : ""} ${className}" style="--g1:${g1};--g2:${g2}">
    <span class="art-fallback">${esc(caption)}</span>
    ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()" />` : ""}
  </span>`;
}

function sourceBadge(track) {
  // Источники скрыты: не показываем, откуда трек.
  return track?.isRemix ? '<span class="src-badge src-badge--remix">REMIX</span>' : "";
}

function sourceLabel(track) {
  return "";
}

function verifiedMark(artist, className = "") {
  return artist?.verified
    ? `<span class="verified-mark ${className}" title="Проверенный исполнитель">${icon("verified")}</span>`
    : "";
}

function setRange(input, value) {
  if (!input) return;
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const next = clamp(Number(value) || 0, min, max);
  input.value = String(next);
  input.style.setProperty("--v", `${((next - min) / (max - min)) * 100}%`);
}

function registerTrack(track) {
  if (track?.key) state.tracks.set(track.key, track);
  return track;
}

function registerList(id, tracks) {
  const clean = (tracks || []).filter((track) => track?.key).map(registerTrack);
  state.lists.set(id, clean);
  return id;
}

function registerArtist(artist) {
  if (artist?.key) state.artists.set(artist.key, artist);
  return artist;
}

function getList(id) {
  return state.lists.get(id) || [];
}

function hydrateIcons() {
  $$("[data-icon]").forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}

function haptic(type = "light") {
  try {
    const method = type === "heavy" ? "impactOccurred" : "impactOccurred";
    state.tg?.HapticFeedback?.[method]?.(type === "heavy" ? "medium" : "light");
  } catch {
    /* no-op */
  }
}

function toast(message, type = "info") {
  if (!els.toasts) return;
  const element = document.createElement("div");
  element.className = `toast${type === "error" ? " toast--error" : ""}`;
  element.innerHTML = `${icon(type === "error" ? "alert" : type === "success" ? "check" : "info")}<span>${esc(
    message
  )}</span>`;
  els.toasts.append(element);
  while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
  setTimeout(() => {
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 240);
  }, 3200);
}

/* ------------------------------------------------------------------------ */
/* Telegram + user                                                         */
/* ------------------------------------------------------------------------ */

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  state.tg = tg;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#07080b");
    tg.setBackgroundColor?.("#07080b");
    tg.disableVerticalSwipes?.();
    tg.BackButton?.onClick?.(() => {
      if (history.length > 1) history.back();
      else navigate("#/home");
    });
  } catch {
    /* optional */
  }

  const user = tg.initDataUnsafe?.user;
  if (user) {
    state.user = user;
  }
}

/* ------------------------------------------------------------------------ */
/* Navigation                                                              */
/* ------------------------------------------------------------------------ */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "").trim();
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  if (!parts.length) return { name: "home", params };

  const [name, ...rest] = parts;
  if (name === "artist" && rest.length >= 2) {
    return {
      name: "artist",
      params,
      source: rest[0],
      id: decodeURIComponent(rest[1]),
    };
  }
  if (name === "playlist" && rest[0]) {
    return { name: "playlist", params, id: decodeURIComponent(rest[0]) };
  }
  if (name === "myplaylist" && rest[0]) {
    return { name: "myplaylist", params, id: decodeURIComponent(rest[0]) };
  }
  if (["home", "search", "library", "liked", "recent"].includes(name)) {
    return { name, params };
  }
  return { name: "home", params };
}

function contextFor(route) {
  return {
    home: "Главная",
    search: "Поиск",
    artist: "Исполнитель",
    playlist: "Плейлист",
    myplaylist: "Мой плейлист",
    library: "Библиотека",
    liked: "Любимые треки",
    recent: "Недавно слушали",
  }[route.name] || "KLUG Sound";
}

function navFor(route) {
  if (route.name === "home") return "home";
  if (route.name === "search") return "search";
  if (["library", "liked", "recent", "myplaylist"].includes(route.name)) return "library";
  return "";
}

function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, "", hash);
    return;
  }
  if (location.hash === hash) {
    handleRoute();
    return;
  }
  location.hash = hash;
}

function handleRoute() {
  const route = parseRoute();
  state.route = route;
  state.routeToken += 1;

  const nav = navFor(route);
  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === nav);
  });

  els.topbarContext.textContent = contextFor(route);
  const showBack = ["artist", "playlist", "liked", "recent"].includes(route.name);
  els.backBtn.hidden = !showBack;
  document.body.classList.toggle("has-back", showBack);
  try {
    if (showBack) state.tg?.BackButton?.show?.();
    else state.tg?.BackButton?.hide?.();
  } catch {
    /* optional */
  }

  els.main.scrollTop = 0;
  closeDrawer({ silent: true });
  closeNowPlaying({ silent: true });

  switch (route.name) {
    case "search":
      renderSearch();
      break;
    case "artist":
      renderArtist(route.source, route.id);
      break;
    case "playlist":
      renderPlaylist(route.id);
      break;
    case "myplaylist":
      renderMyPlaylist(route.id);
      break;
    case "library":
      renderLibrary();
      break;
    case "liked":
      renderLiked();
      break;
    case "recent":
      renderRecent();
      break;
    default:
      renderHome();
  }
}

/* ------------------------------------------------------------------------ */
/* Rendering primitives                                                     */
/* ------------------------------------------------------------------------ */

function trackCard(track, listId) {
  registerTrack(track);
  return `<article class="track-card">
    <div class="tc-art">
      ${art(track)}
      <span class="tc-badge">${sourceBadge(track)}</span>
      <button class="tc-play" type="button" data-action="play" data-list="${esc(listId)}" data-key="${esc(
    track.key
  )}" aria-label="Слушать ${esc(track.title)}">${icon("play")}</button>
    </div>
    <div class="tc-title" title="${esc(track.title)}">${esc(track.title)}</div>
    <a class="tc-sub" href="${artistHref(track.artistKey)}" title="${esc(track.artist)}">${esc(track.artist)}</a>
  </article>`;
}

function artistCard(artist) {
  registerArtist(artist);
  return `<a class="artist-card" href="${artistHref(artist.key)}">
    <span class="ac-art">${art(
      { key: artist.key, artwork: artist.avatar, name: artist.name },
      { round: true, label: artist.name }
    )}</span>
    <span class="ac-name">${esc(artist.name)}${verifiedMark(artist, "verified-mark--sm")}</span>
  </a>`;
}

function artistTile(artist) {
  registerArtist(artist);
  return `<a class="artist-tile" href="${artistHref(artist.key)}">
    ${art({ key: artist.key, artwork: artist.avatar, name: artist.name }, { round: true, label: artist.name })}
    <span class="artist-tile-info">
      <span class="artist-tile-name">${esc(artist.name)}${verifiedMark(artist, "verified-mark--sm")}</span>
    </span>
  </a>`;
}

function playlistCard(playlist) {
  return `<a class="track-card" href="#/playlist/${encodeURIComponent(playlist.id)}">
    <div class="tc-art">
      ${art(
        { key: playlist.key, artwork: playlist.artwork, title: playlist.title, artist: playlist.curator },
        { label: playlist.title }
      )}
      <span class="tc-badge"><span class="src-badge src-badge--full">PLAYLIST</span></span>
      <span class="tc-play">${icon("play")}</span>
    </div>
    <div class="tc-title" title="${esc(playlist.title)}">${esc(playlist.title)}</div>
    <div class="tc-sub">${esc(playlist.curator)} · ${playlist.trackCount || 0} треков</div>
  </a>`;
}

function trackList(tracks, listId, { showHeader = true, meta = "album", startIndex = 0 } = {}) {
  registerList(listId, tracks);
  const head = showHeader
    ? `<div class="track-head">
        <span>#</span><span></span><span>Трек</span><span>${
          meta === "plays" ? "Прослушивания" : "Альбом"
        }</span><span></span><span>Время</span><span></span>
      </div>`
    : "";
  const rows = tracks
    .map((track, index) => {
      const liked = state.likes.has(track.key);
      const metaText =
        meta === "plays"
          ? track.plays
            ? `${formatCompact(track.plays)} прослушиваний`
            : track.genre || "—"
          : [track.album, track.year].filter(Boolean).join(" · ") || track.genre || "—";
      return `<div class="track-row" data-row-key="${esc(track.key)}" data-list="${esc(listId)}">
        <button class="tr-play" type="button" data-action="play" data-list="${esc(listId)}" data-key="${esc(
        track.key
      )}" aria-label="Слушать ${esc(track.title)}">
          <span class="tr-num">${String(index + 1 + startIndex).padStart(2, "0")}</span>
          <span class="tr-hover-play">${icon("play")}</span>
          <span class="tr-eq"><i></i><i></i><i></i></span>
        </button>
        <span class="tr-art">${art(track)}</span>
        <div class="tr-main">
          <div class="tr-title" title="${esc(track.title)}">${esc(track.title)}</div>
          <div class="tr-sub">${artistLink(track)}</div>
        </div>
        <div class="tr-album" title="${esc(metaText)}">${esc(metaText)}</div>
        <div class="tr-src">${sourceBadge(track)}</div>
        <div class="tr-dur">${formatTime(track.duration)}</div>
        <div class="tr-actions">
          <button class="tr-like${liked ? " is-liked" : ""}" type="button" data-action="like" data-key="${esc(
        track.key
      )}" aria-label="${liked ? "Убрать из любимых" : "Добавить в любимые"}" aria-pressed="${liked}">
            ${icon(liked ? "heartFill" : "heart")}
          </button>
          <button class="tr-addpl" type="button" data-action="add-to-playlist" data-key="${esc(
        track.key
      )}" aria-label="Добавить в плейлист">${icon("plus")}</button>
        </div>
      </div>`;
    })
    .join("");
  return `${head}<div class="track-list">${rows}</div>`;
}

function emptyState({ iconName = "music", title, text, actions = "" }) {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actions ? `<div class="empty-actions">${actions}</div>` : ""}
  </div>`;
}

function errorState({ title = "Что-то пошло не так", text, action = "Повторить" } = {}) {
  return `<div class="empty">
    <span class="empty-icon empty-icon--error">${icon("alert")}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(text || "Не удалось загрузить данные. Проверь соединение и попробуй ещё раз.")}</p>
    <div class="empty-actions">
      <button class="btn-accent" type="button" data-action="retry">${icon("refresh")}${esc(action)}</button>
    </div>
  </div>`;
}

function homeSkeleton() {
  const cards = Array.from({ length: 6 })
    .map(() => `<div class="sk-card"><div class="sk-art skeleton"></div><div class="sk-line skeleton"></div><div class="sk-line sk-line--short skeleton"></div></div>`)
    .join("");
  return `<div class="skeleton sk-head"></div><div class="skeleton sk-sub"></div>
    <div class="quick-grid">${Array.from({ length: 4 })
      .map(() => '<div class="skeleton" style="height:60px;border-radius:14px"></div>')
      .join("")}</div>
    <div class="skeleton sk-banner"></div>
    <div class="skeleton sk-row-head"></div>
    <div class="sk-grid">${cards}</div>`;
}

function listSkeleton(rows = 8, showBanner = false) {
  return `${showBanner ? '<div class="skeleton sk-banner"></div>' : '<div class="skeleton sk-head"></div><div class="skeleton sk-sub"></div>'}
    <div class="sk-list">${Array.from({ length: rows })
      .map(() => '<div class="sk-list-row skeleton"></div>')
      .join("")}</div>`;
}

function nowPlayingRow(track) {
  return `<div class="track-row" data-row-key="${esc(track.key)}">
    <button class="tr-play" type="button" data-action="play" data-key="${esc(track.key)}" aria-label="Слушать ${esc(
    track.title
  )}">${icon("play")}</button>
    <span class="tr-art">${art(track)}</span>
    <div class="tr-main"><div class="tr-title">${esc(track.title)}</div><div class="tr-sub">${artistLink(
    track
  )}</div></div>
    <div class="tr-album">${esc(track.album || track.genre || "")}</div>
    <div class="tr-src">${sourceBadge(track)}</div>
    <div class="tr-dur">${formatTime(track.duration)}</div>
    <button class="tr-like${state.likes.has(track.key) ? " is-liked" : ""}" type="button" data-action="like" data-key="${esc(
    track.key
  )}" aria-label="Любимые">${icon(state.likes.has(track.key) ? "heartFill" : "heart")}</button>
  </div>`;
}

/* ------------------------------------------------------------------------ */
/* Home                                                                     */
/* ------------------------------------------------------------------------ */

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

function renderHome() {
  setContext("Главная");
  const token = state.routeToken;

  if (state.homeCache && Date.now() - state.homeCache.at < 3 * 60 * 1000) {
    paintHome(state.homeCache.data);
    return;
  }

  els.view.innerHTML = homeSkeleton();
  api
    .getHome()
    .then((data) => {
      if (token !== state.routeToken) return;
      state.homeCache = { at: Date.now(), data };
      paintHome(data);
    })
    .catch((error) => {
      if (token !== state.routeToken) return;
      els.view.innerHTML = errorState({
        title: "Каталог не отвечает",
        text: error?.message || "Audius временно недоступен. Попробуй обновить через минуту.",
      });
    });
}

function paintHome(data) {
  const tracks = data.tracks || [];
  const featured = data.featured || tracks[0];
  if (!featured) {
    els.view.innerHTML = errorState({ title: "Пока пусто", text: "В каталоге нет доступных треков." });
    return;
  }

  const listId = "home-trending";
  registerList(listId, tracks);
  const liked = store.getLikes().length;
  const recent = store.getRecent().length;
  const [g1, g2] = gradientFor(featured.key);

  els.view.innerHTML = `
    <section class="home-greeting">
      <div>
        <h1>${greeting()}</h1>
        <p>Что послушаем сегодня? В каталоге ${formatCompact(tracks.length * 25)}+ треков.</p>
      </div>
      <span class="stat-chip">${icon("globe")} Музыка</span>
    </section>

    <div class="quick-grid">
      <a class="quick-card" href="#/liked">
        <span class="quick-icon quick-icon--rose">${icon("heart")}</span>
        <span class="quick-copy"><strong>Любимые</strong><small>${liked} треков</small></span>
      </a>
      <a class="quick-card" href="#/recent">
        <span class="quick-icon quick-icon--cyan">${icon("clock")}</span>
        <span class="quick-copy"><strong>Недавно</strong><small>${recent} в истории</small></span>
      </a>
      <button class="quick-card" type="button" data-action="random">
        <span class="quick-icon quick-icon--violet">${icon("sparkles")}</span>
        <span class="quick-copy"><strong>Случайный трек</strong><small>Доверься алгоритму</small></span>
      </button>
      <a class="quick-card" href="#/search">
        <span class="quick-icon quick-icon--lime">${icon("search")}</span>
        <span class="quick-copy"><strong>Найти музыку</strong><small>Треки и исполнители</small></span>
      </a>
    </div>

    <section class="hero-feature">
      <div class="hf-bg" aria-hidden="true">
        <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,#5b8def,#1a2344 70%)"></div>
      </div>
      <div class="hf-copy">
        <span class="hf-badge">${icon("sparkles")} KLUG AI</span>
        <h2>KLUG AI — твой умный помощник</h2>
        <p style="margin:6px 0 14px;opacity:0.85">Бот в Telegram: музыка, управление ПК, файлы, скриншоты и многое другое. Открой и попробуй прямо сейчас.</p>
        <div class="hf-actions">
          <a class="btn-accent" href="https://t.me/klugai" target="_blank" rel="noopener noreferrer">${icon("telegram")} Открыть</a>
        </div>
      </div>
      <div class="hf-art">${art(featured)}</div>
    </section>
  `;

  syncRowStates();
  updateLikeButtons();
}

/* ------------------------------------------------------------------------ */
/* Search                                                                   */
/* ------------------------------------------------------------------------ */

const GENRES = ["Lo-Fi", "Hip-Hop", "Electronic", "Chill", "House", "Ambient", "Jazz", "Phonk"];
const POPULAR = ["The Weeknd", "Billie Eilish", "Arctic Monkeys", "lofi", "Tame Impala"];

function searchShellHtml() {
  return `<section class="search-head">
    <span class="kicker">Поиск по каталогам</span>
    <h1>Найди свой трек</h1>
    <p>Название, исполнитель или настроение — найди свой трек.</p>
    <form class="search-box" id="searchForm" role="search" autocomplete="off">
      <span class="search-icon">${icon("search")}</span>
      <input class="search-input" id="searchInput" type="search" name="q" inputmode="search"
        enterkeyhint="search" spellcheck="false" placeholder="Например, The Weeknd или lo-fi" aria-label="Поиск музыки" />
      <button class="search-clear" id="clearSearch" type="button" data-action="clear-search" aria-label="Очистить" hidden>${icon("x")}</button>
    </form>
    <div class="search-tabs" id="searchTabs" hidden></div>
  </section>
  <div class="search-body" id="searchResults"></div>`;
}

function renderSearch() {
  setContext("Поиск");
  const urlQuery = state.route.params.get("q") || "";
  if (urlQuery && urlQuery !== state.search.q) {
    state.search.q = urlQuery;
    state.search.data = null;
    state.search.error = null;
    state.search.loading = false;
  }

  els.view.innerHTML = searchShellHtml();
  const input = $("#searchInput");
  if (input) input.value = state.search.q;
  syncSearchClear();

  if (state.search.q.trim().length >= 2) {
    const key = state.search.q.trim().toLowerCase();
    const cached = state.searchCache.get(key);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      state.search.data = cached.data;
      state.search.error = null;
      state.search.loading = false;
      paintSearchResults();
      return;
    }
    runSearch(state.search.q);
  } else {
    paintSearchDiscovery();
  }
}

function syncSearchClear() {
  const input = $("#searchInput");
  const clear = $("#clearSearch");
  if (clear) clear.hidden = !input?.value;
}

function paintSearchDiscovery() {
  const container = $("#searchResults");
  const tabs = $("#searchTabs");
  if (tabs) tabs.hidden = true;
  if (!container) return;

  const searches = store.getSearches();
  container.innerHTML = `
    ${
      searches.length
        ? `<div class="row-head" style="margin-top:0"><div><h2>Недавние запросы</h2></div>
            <button class="text-btn" type="button" data-action="clear-search-history">${icon("trash")} Очистить</button></div>
          <div class="recent-searches">${searches
            .map(
              (term) =>
                `<button class="recent-chip" type="button" data-action="search-query" data-query="${esc(
                  term
                )}">${icon("clock")}${esc(term)}</button>`
            )
            .join("")}</div>`
        : ""
    }
    <div class="row-head" style="margin-top:${searches.length ? "34px" : "0"}">
      <div><h2>Попробуй прямо сейчас</h2><p>Подборки по настроению и знакомые имена</p></div>
    </div>
    <div class="genre-grid" style="justify-content:flex-start;max-width:none;margin:0">
      ${POPULAR.map(
        (term) =>
          `<button class="genre-chip" type="button" data-action="search-query" data-query="${esc(
            term
          )}">${esc(term)}</button>`
      ).join("")}
    </div>
    <div class="genre-grid" style="justify-content:flex-start;max-width:none;margin-top:10px">
      ${GENRES.map(
        (genre) =>
          `<button class="genre-chip" type="button" data-action="search-query" data-query="${esc(
            genre
          )}">${esc(genre)}</button>`
      ).join("")}
    </div>
    <div class="empty" style="padding-top:46px">
      <span class="empty-icon">${icon("search")}</span>
      <h3>Начни с двух букв</h3>
      <p>Поиск работает на русском и английском. Можно искать по названию, исполнителю или жанру.</p>
    </div>`;
}

function renderSearchTabs() {
  const container = $("#searchTabs");
  if (!container) return;
  const data = state.search.data;
  if (!data || !state.search.q.trim()) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const tabs = [
    { id: "all", label: "Всё", count: data.tracks.length + data.artists.length },
    { id: "tracks", label: "Треки", count: data.tracks.length },
    { id: "artists", label: "Исполнители", count: data.artists.length },
  ];
  container.hidden = false;
  container.innerHTML = tabs
    .map(
      (tab) =>
        `<button class="tab-btn${state.search.tab === tab.id ? " is-active" : ""}" type="button" data-action="search-tab" data-tab="${
          tab.id
        }">${tab.label}<span class="tab-count">${tab.count}</span></button>`
    )
    .join("");
}

function paintSearchResults() {
  renderSearchTabs();
  const container = $("#searchResults");
  if (!container) return;

  if (state.search.loading) {
    container.innerHTML = `<div class="search-meta"><span>Ищем совпадения…</span><span></span></div>
      <div class="sk-list">${Array.from({ length: 7 })
        .map(() => '<div class="sk-list-row skeleton"></div>')
        .join("")}</div>`;
    return;
  }

  if (state.search.error) {
    container.innerHTML = errorState({
      title: "Поиск не отвечает",
      text: state.search.error,
    });
    return;
  }

  const data = state.search.data;
  if (!data) {
    paintSearchDiscovery();
    return;
  }

  if (!data.tracks.length && !data.artists.length) {
    container.innerHTML = emptyState({
      iconName: "search",
      title: "Ничего не нашлось",
      text: `По запросу «${state.search.q}» нет совпадений. Попробуй другое название, исполнителя или жанр.`,
      actions: `<button class="btn-soft" type="button" data-action="clear-search">${icon("x")} Сбросить</button>`,
    });
    return;
  }

  const tracks = state.search.originalOnly ? data.tracks.filter((track) => !track.isRemix) : data.tracks;

  const errors = data.errors?.length
    ? `<span class="source-note-inline">${icon("info")} Некоторые источники сейчас недоступны</span>`
    : `<span>Найдено ${data.tracks.length + data.artists.length} совпадений</span>`;

  let body = "";
  if (state.search.tab === "artists") {
    body = data.artists.length
      ? `<div class="artist-grid">${data.artists.map(artistTile).join("")}</div>`
      : emptyState({
          iconName: "user",
          title: "Исполнители не найдены",
          text: "Попробуй другое имя или переключись на треки.",
        });
  } else if (state.search.tab === "tracks") {
    body = tracks.length
      ? trackList(tracks, "search-tracks", { showHeader: true, meta: "album" })
      : emptyState({
          iconName: "music",
          title: "Треки не найдены",
          text: "Попробуй другой запрос или посмотри исполнителей.",
        });
  } else {
    const artistBlock = data.artists.length
      ? `<div class="row-head" style="margin-top:0"><div><h2>Исполнители</h2></div>
          <button class="row-link" type="button" data-action="search-tab" data-tab="artists">Все ${icon(
          "arrowRight"
        )}</button></div>
        <div class="artist-grid">${data.artists.slice(0, 6).map(artistTile).join("")}</div>`
      : "";
    const trackBlock = tracks.length
      ? `<div class="row-head"><div><h2>Треки</h2><p>Треки</p></div>
          ${
            tracks.length > 20
              ? `<button class="row-link" type="button" data-action="search-tab" data-tab="tracks">Все ${tracks.length} ${icon(
                  "arrowRight"
                )}</button>`
              : ""
          }</div>
        ${trackList(tracks.slice(0, 20), "search-tracks", { showHeader: true, meta: "album" })}`
      : emptyState({
          iconName: "music",
          title: "Треки не найдены",
          text: "Попробуй другой запрос или посмотри исполнителей.",
        });
    body = `${artistBlock}${trackBlock}`;
  }

  const originalNote = state.search.originalOnly && data.tracks.some((track) => track.isRemix)
    ? `<div class="source-note-inline"><span>${icon("music")} Оригинальные версии · ремиксы скрыты</span><button class="text-btn" type="button" data-action="search-filter" data-filter="all">${icon("sparkles")} Показать ремиксы</button></div>`
    : "";

  container.innerHTML = `<div class="search-meta"><span>Результаты по запросу «${esc(
    state.search.q
  )}»</span>${errors}</div>${originalNote}${body}`;
  syncRowStates();
  updateLikeButtons();
}

function commitSearch(query) {
  const term = String(query || "").trim();
  if (term === state.search.q && state.search.data) return;
  state.search.q = term;
  state.search.tab = "all";
  state.search.originalOnly = true;
  const hash = term.length >= 2 ? `#/search?q=${encodeURIComponent(term)}` : "#/search";
  history.replaceState(null, "", hash);
  state.route = parseRoute();
  store.addSearch(term);
  if (term.length >= 2) runSearch(term);
  else paintSearchDiscovery();
}

async function runSearch(query) {
  const term = String(query || "").trim();
  if (term.length < 2) {
    paintSearchDiscovery();
    return;
  }
  state.search.token += 1;
  const token = state.search.token;
  state.search.loading = true;
  state.search.error = null;
  state.search.data = null;
  paintSearchResults();

  try {
    const data = await api.searchAll(term);
    if (token !== state.search.token || state.search.q !== term) return;
    state.search.data = data;
    state.search.loading = false;
    state.searchCache.set(term.toLowerCase(), { at: Date.now(), data });
    paintSearchResults();
  } catch (error) {
    if (token !== state.search.token || state.search.q !== term) return;
    state.search.loading = false;
    state.search.error = error?.message || "Проверь соединение и попробуй снова.";
    paintSearchResults();
  }
}

/* ------------------------------------------------------------------------ */
/* Artist page                                                              */
/* ------------------------------------------------------------------------ */

function setContext(text) {
  if (els.topbarContext) els.topbarContext.textContent = text;
}

function renderArtist(source, id) {
  setContext("Исполнитель");
  const cacheKey = `${source}:${id}`;
  const token = state.routeToken;
  const cached = state.artistCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    paintArtist(cached.data);
    return;
  }

  els.view.innerHTML = listSkeleton(7, true);
  api
    .getArtist(source, id)
    .then((data) => {
      if (token !== state.routeToken) return;
      state.artistCache.set(cacheKey, { at: Date.now(), data });
      paintArtist(data);
    })
    .catch((error) => {
      if (token !== state.routeToken) return;
      els.view.innerHTML = errorState({
        title: "Исполнитель не открылся",
        text: error?.message || "Не удалось загрузить страницу исполнителя.",
      });
    });
}

function paintArtist(data) {
  const artist = registerArtist(data.artist);
  const tracks = data.tracks || [];
  const albums = data.albums || [];
  const popular = data.popular || [];
  const listId = `artist-${artist.key}`;
  registerList(listId, tracks);
  const banner = artist.cover || artist.avatar;
  const stats = [
    artist.followers != null ? formatFollowers(artist.followers) : "",
    artist.trackCount != null ? `${formatCompact(artist.trackCount)} треков` : tracks.length ? `${tracks.length} треков` : "",
    artist.genre || "",
  ].filter(Boolean);

  els.view.innerHTML = `
    <section class="artist-hero">
      ${
        banner
          ? `<div class="artist-banner"><img src="${esc(banner)}" alt="" loading="lazy" onerror="this.remove()" /></div>`
          : ""
      }
      <div class="artist-hero-content">
        <div class="artist-avatar">${art(
          { key: artist.key, artwork: artist.avatar, name: artist.name },
          { round: true, label: artist.name }
        )}</div>
        <div class="artist-info">
          <span class="kicker">${artist.genre || "Артист"}</span>
          <h1 class="artist-name">${esc(artist.name)}${verifiedMark(artist)}</h1>
          <div class="artist-meta">
            ${stats.map((stat) => `<span class="stat-chip">${esc(stat)}</span>`).join("")}
          </div>
          ${artist.bio ? `<p class="artist-bio">${esc(artist.bio)}</p>` : ""}
          <div class="artist-actions">
            ${
              tracks.length
                ? `<button class="btn-accent" type="button" data-action="play-all" data-list="${esc(
                    listId
                  )}">${icon("play")} Слушать всё</button>
                   <button class="btn-soft" type="button" data-action="shuffle-play" data-list="${esc(
                     listId
                   )}">${icon("shuffle")} Перемешать</button>`
                : ""
            }
            ${
              artist.permalink
                ? `<a class="btn-round" href="${esc(
                    artist.permalink
                  )}" target="_blank" rel="noopener noreferrer" aria-label="Открыть профиль исполнителя">${icon(
                    "external"
                  )}</a>`
                : ""
            }
          </div>
        </div>
      </div>
    </section>

    ${
      popular.length
        ? `<section class="page-section">
      <div class="page-section-head">
        <h2>Популярные треки</h2>
        <span class="kicker">Топ ${Math.min(5, popular.length)} из ${popular.length}</span>
      </div>

      ${(() => {
        const popListId = `${listId}-popular`;
        registerList(popListId, popular);
        const first = popular.slice(0, 5);
        const rest = popular.slice(5, 10);
        const restListId = `${listId}-popular-more`;
        registerList(restListId, rest);
        return `
        ${trackList(first, popListId, { showHeader: true, meta: "album" })}
        <div id="popularMore" hidden>
          ${rest.length ? trackList(rest, restListId, { showHeader: false, meta: "album", startIndex: 5 }) : ""}
        </div>
        ${
          rest.length
            ? `<div style="margin-top:10px"><button class="btn-soft" type="button" data-action="toggle-popular">${icon("chevronDown")} Показать ещё</button></div>`
            : ""
        }`;
      })()}
    </section>`
        : ""
    }
    <section class="page-section">
      <div class="page-section-head">
        <h2>Треки</h2>
        <span class="kicker">${tracks.length} ${
    artist.source === "itunes" ? "· 30 сек" : "· полные"
  } · ${albums.length ? albums.length + " альбомов" : ""}</span>
      </div>
      ${
        tracks.length
          ? (albums.length
              ? albums
                  .map((album, albumIndex) => {
                    const albumListId = `${listId}-album-${albumIndex}`;
                    registerList(albumListId, album.tracks);
                    const artHtml = album.artwork
                      ? `<img src="${esc(album.artwork)}" alt="" loading="lazy" onerror="this.remove()" />`
                      : "";
                    return `<div class="album-block" style="margin-bottom:24px">
                      <div class="album-head" style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                        <span class="art" style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex:0 0 56px">${artHtml}</span>
                        <div>
                          <div style="font-weight:700">${esc(album.title)}</div>
                          <div class="kicker">${esc(album.year || "")} · ${album.tracks.length} треков</div>
                        </div>
                        <button class="btn-soft" type="button" data-action="play-all" data-list="${esc(albumListId)}" style="margin-left:auto">${icon("play")} Играть</button>
                      </div>
                      ${trackList(album.tracks, albumListId, { showHeader: true, meta: "album" })}
                    </div>`;
                  })
                  .join("")
              : trackList(tracks, listId, { showHeader: true, meta: "album" }))
          : emptyState({
              iconName: "music",
              title: "Треков пока нет",
              text: "У этого исполнителя нет доступных для прослушивания треков.",
              actions: `<a class="btn-soft" href="#/search">${icon("search")} Найти музыку</a>`,
            })
      }
    </section>`;
  syncRowStates();
  updateLikeButtons();
}

/* ------------------------------------------------------------------------ */
/* Playlist page                                                            */
/* ------------------------------------------------------------------------ */

function renderPlaylist(id) {
  setContext("Плейлист");
  const token = state.routeToken;
  const cached = state.playlistCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    paintPlaylist(cached.data);
    return;
  }

  els.view.innerHTML = listSkeleton(8, true);
  api
    .getPlaylist(id)
    .then((data) => {
      if (token !== state.routeToken) return;
      state.playlistCache.set(id, { at: Date.now(), data });
      paintPlaylist(data);
    })
    .catch((error) => {
      if (token !== state.routeToken) return;
      els.view.innerHTML = errorState({
        title: "Плейлист не открылся",
        text: error?.message || "Не удалось загрузить плейлист.",
      });
    });
}

function renderMyPlaylist(id) {
  setContext("Мой плейлист");
  const playlist = store.getPlaylistById(id);
  if (!playlist) {
    els.view.innerHTML = errorState({ title: "Плейлист не найден", text: "Возможно, он был удалён." });
    return;
  }
  const tracks = playlist.tracks || [];
  const listId = `myplaylist-${playlist.id}`;
  registerList(listId, tracks);

  els.view.innerHTML = `
    <section class="playlist-hero">
      <div class="playlist-cover">${art(
        { key: playlist.id, artwork: tracks[0]?.artwork, title: playlist.name, artist: "Мой плейлист" },
        { label: playlist.name }
      )}</div>
      <div class="playlist-info">
        <span class="kicker">Мой плейлист · ${tracks.length} треков</span>
        <h1>${esc(playlist.name)}</h1>
        <div class="playlist-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          ${
            tracks.length
              ? `<button class="btn-accent" type="button" data-action="play-all" data-list="${esc(listId)}">${icon("play")} Слушать</button>
                 <button class="btn-soft" type="button" data-action="shuffle-play" data-list="${esc(listId)}">${icon("shuffle")} Перемешать</button>`
              : ""
          }
          <button class="btn-soft" type="button" data-action="rename-playlist" data-id="${esc(playlist.id)}">${icon("more")} Переименовать</button>
          <button class="btn-soft" type="button" data-action="delete-playlist" data-id="${esc(playlist.id)}">${icon("trash")} Удалить</button>
        </div>
      </div>
    </section>
    <section class="page-section">
      <div class="page-section-head"><h2>Треки</h2><span class="kicker">${tracks.length}</span></div>
      ${
        tracks.length
          ? trackList(tracks, listId, { showHeader: true, meta: "album" }).replace(
              /<button class="tr-addpl" type="button" data-action="add-to-playlist" data-key="([^"]*)" aria-label="Добавить в плейлист">[\s\S]*?<\/button>/g,
              (match, key) =>
                `<button class="tr-addpl" type="button" data-action="remove-from-playlist" data-key="${key}" data-playlist-id="${esc(
                  playlist.id
                )}" aria-label="Удалить из плейлиста">${icon("trash")}</button>`
            )
          : emptyState({
              iconName: "queue",
              title: "Плейлист пуст",
              text: "Добавляй треки кнопкой «+» у любого трека.",
              actions: `<a class="btn-soft" href="#/search">${icon("search")} Найти музыку</a>`,
            })
      }
    </section>`;
  syncRowStates();
  updateLikeButtons();
}

function paintPlaylist(data) {
  const playlist = data.playlist;
  const tracks = data.tracks || [];
  const listId = `playlist-${playlist.id}`;
  registerList(listId, tracks);

  els.view.innerHTML = `
    <section class="playlist-hero">
      <div class="playlist-cover">${art(
        { key: playlist.key, artwork: playlist.artwork, title: playlist.title, artist: playlist.curator },
        { label: playlist.title }
      )}</div>
      <div class="playlist-info">
        <span class="kicker">Плейлист</span>
        <h1>${esc(playlist.title)}</h1>
        <div class="playlist-meta">
          ${
            playlist.curatorKey
              ? `<a class="stat-chip" href="${artistHref(playlist.curatorKey)}">${icon("user")}${esc(
                  playlist.curator
                )}</a>`
              : `<span class="stat-chip">${icon("user")}${esc(playlist.curator)}</span>`
          }
          <span class="stat-chip">${icon("music")}${playlist.trackCount || tracks.length} треков</span>
          <span class="stat-chip">${icon("wave")}Полные треки</span>
        </div>
        ${playlist.description ? `<p class="playlist-desc">${esc(playlist.description)}</p>` : ""}
        <div class="playlist-actions">
          ${
            tracks.length
              ? `<button class="btn-accent" type="button" data-action="play-all" data-list="${esc(
                  listId
                )}">${icon("play")} Слушать</button>
                 <button class="btn-soft" type="button" data-action="shuffle-play" data-list="${esc(
                   listId
                 )}">${icon("shuffle")} Перемешать</button>`
              : ""
          }
          ${
            playlist.permalink
              ? `<a class="btn-round" href="${esc(
                  playlist.permalink
                )}" target="_blank" rel="noopener noreferrer" aria-label="Открыть на Audius">${icon(
                  "external"
                )}</a>`
              : ""
          }
        </div>
      </div>
    </section>

    <section class="page-section">
      <div class="page-section-head"><h2>Треки</h2><span class="kicker">${tracks.length}</span></div>
      ${
        tracks.length
          ? trackList(tracks, listId, { showHeader: true, meta: "album" })
          : emptyState({
              iconName: "queue",
              title: "Плейлист пуст",
              text: "В этой подборке пока нет доступных треков.",
            })
      }
    </section>`;
  syncRowStates();
  updateLikeButtons();
}

/* ------------------------------------------------------------------------ */
/* Library                                                                  */
/* ------------------------------------------------------------------------ */

function renderLibrary() {
  setContext("Библиотека");
  const liked = store.getLikes();
  const recent = store.getRecent();
  const minutes = Math.round(liked.reduce((sum, track) => sum + (track.duration || 0), 0) / 60);

  els.view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="kicker">Твоя коллекция</span>
        <h1>Библиотека</h1>
        <p>Всё, что ты лайкнул и слушал — хранится только на этом устройстве.</p>
      </div>
      <a class="btn-soft" href="#/search">${icon("search")} Найти музыку</a>
    </div>

    <div class="library-stats">
      <div class="stat-card">
        <span class="stat-icon">${icon("heart")}</span>
        <div><strong>${liked.length}</strong><span>любимых треков</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--cyan">${icon("clock")}</span>
        <div><strong>${recent.length}</strong><span>в истории</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-icon stat-icon--rose">${icon("wave")}</span>
        <div><strong>${minutes}</strong><span>минут в любимом</span></div>
      </div>
    </div>

    <section>
      <div class="collection-head">
        <h2>${icon("heart")} Любимые треки</h2>
        <div class="collection-actions">${
          liked.length ? `<a class="text-btn" href="#/liked">Все ${icon("arrowRight")}</a>` : ""
        }</div>
      </div>
      ${
        liked.length
          ? trackList(liked.slice(0, 6), "library-liked", { showHeader: false, meta: "album" })
          : `<div class="empty" style="padding:34px 20px">
              <span class="empty-icon">${icon("heart")}</span>
              <h3>Здесь пока тихо</h3>
              <p>Нажми на сердечко у трека — и он появится в этой коллекции.</p>
              <div class="empty-actions"><a class="btn-accent" href="#/search">${icon("search")} Найти музыку</a></div>
            </div>`
      }
    </section>

    <section>
      <div class="collection-head">
        <h2>${icon("clock")} Недавно слушали</h2>
        <div class="collection-actions">${
          recent.length ? `<a class="text-btn" href="#/recent">Все ${icon("arrowRight")}</a>` : ""
        }</div>
      </div>
      ${
        recent.length
          ? trackList(recent.slice(0, 6), "library-recent", { showHeader: false, meta: "album" })
          : `<div class="empty" style="padding:34px 20px">
              <span class="empty-icon">${icon("headphones")}</span>
              <h3>История пуста</h3>
              <p>Включи любой трек — и он появится здесь.</p>
            </div>`
      }
    </section>

    <section>
      <div class="collection-head">
        <h2>${icon("list")} Мои плейлисты</h2>
        <div class="collection-actions">
          <button class="btn-accent" type="button" data-action="create-playlist">${icon("plus")} Создать</button>
        </div>
      </div>
      ${(() => {
        const playlists = store.getPlaylists();
        if (!playlists.length) {
          return `<div class="empty" style="padding:34px 20px">
            <span class="empty-icon">${icon("list")}</span>
            <h3>Плейлистов пока нет</h3>
            <p>Создай свой первый плейлист и добавляй в него треки кнопкой «+» у трека.</p>
          </div>`;
        }
        return `<div class="card-grid">${playlists
          .map(
            (playlist) => `<a class="track-card" href="#/myplaylist/${encodeURIComponent(playlist.id)}">
              <div class="tc-art">
                ${art(
                  { key: playlist.id, artwork: playlist.tracks[0]?.artwork, title: playlist.name, artist: "Мой плейлист" },
                  { label: playlist.name }
                )}
                <span class="tc-badge"><span class="src-badge src-badge--full">PLAYLIST</span></span>
              </div>
              <div class="tc-title" title="${esc(playlist.name)}">${esc(playlist.name)}</div>
              <div class="tc-sub">${playlist.tracks.length} треков</div>
            </a>`
          )
          .join("")}</div>`;
      })()}
    </section>`;
  syncRowStates();
  updateLikeButtons();
}

function renderLiked() {
  setContext("Любимые треки");
  const liked = store.getLikes();
  const minutes = Math.round(liked.reduce((sum, track) => sum + (track.duration || 0), 0) / 60);
  const listId = "liked";
  registerList(listId, liked);

  els.view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="kicker">Коллекция</span>
        <h1>Любимые треки</h1>
        <p>${liked.length} треков · ${minutes} минут · на этом устройстве</p>
      </div>
      ${
        liked.length
          ? `<div class="collection-actions">
              <button class="btn-accent" type="button" data-action="play-all" data-list="${listId}">${icon(
              "play"
            )} Слушать</button>
              <button class="btn-soft" type="button" data-action="shuffle-play" data-list="${listId}">${icon(
              "shuffle"
            )} Перемешать</button>
            </div>`
          : ""
      }
    </div>
    ${
      liked.length
        ? trackList(liked, listId, { showHeader: true, meta: "album" })
        : emptyState({
            iconName: "heart",
            title: "Здесь пока тихо",
            text: "Ставь лайки трекам, которые зацепили. Они останутся на этом устройстве и будут доступны без входа в аккаунт.",
            actions: `<a class="btn-accent" href="#/search">${icon("search")} Найти музыку</a>`,
          })
    }`;
  syncRowStates();
  updateLikeButtons();
}

function renderRecent() {
  setContext("Недавно слушали");
  const recent = store.getRecent();
  const listId = "recent";
  registerList(listId, recent);

  els.view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="kicker">История</span>
        <h1>Недавно слушали</h1>
        <p>${recent.length} треков · последние прослушивания</p>
      </div>
      ${
        recent.length
          ? `<div class="collection-actions">
              <button class="btn-accent" type="button" data-action="play-all" data-list="${listId}">${icon(
              "play"
            )} Слушать</button>
              <button class="btn-soft" type="button" data-action="clear-recent">${icon("trash")} Очистить</button>
            </div>`
          : ""
      }
    </div>
    ${
      recent.length
        ? trackList(recent, listId, { showHeader: true, meta: "album" })
        : emptyState({
            iconName: "clock",
            title: "История пока пуста",
            text: "Как только включишь трек, он появится здесь. История хранится на устройстве.",
            actions: `<a class="btn-accent" href="#/home">${icon("home")} На главную</a>`,
          })
    }`;
  syncRowStates();
  updateLikeButtons();
}

/* ------------------------------------------------------------------------ */
/* Player engine                                                            */
/* ------------------------------------------------------------------------ */

function currentTrack() {
  return state.queue[state.index] || null;
}

function setMediaSession(track) {
  if (!("mediaSession" in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || "KLUG Sound",
      artwork: track.artwork
        ? [
            { src: track.artwork, sizes: "480x480", type: "image/jpeg" },
            { src: track.artwork, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
  } catch {
    /* metadata is best-effort */
  }
}

function initMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    previoustrack: () => previousTrack(),
    nexttrack: () => nextTrack(),
    seekbackward: (details) => {
      audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
    },
    seekforward: (details) => {
      audio.currentTime = Math.min(getDuration(), audio.currentTime + (details.seekOffset || 10));
    },
    seekto: (details) => {
      if (details.seekTime != null) audio.currentTime = details.seekTime;
    },
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* unsupported action */
    }
  });
}

function getDuration() {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  return currentTrack()?.duration || 0;
}

function playList(tracks, startIndex = 0, { shuffle = false } = {}) {
  const valid = (tracks || []).filter((track) => track?.streamUrl);
  if (!valid.length) {
    toast("В этом списке нет доступных треков", "error");
    return;
  }
  state.queue = valid;
  state.index = clamp(startIndex, 0, valid.length - 1);
  if (shuffle) {
    state.settings.shuffle = true;
    persistSettings();
    updateShuffleRepeat();
  }
  loadCurrent(true);
}

function playFromList(listId, key = "") {
  const list = getList(listId);
  if (!list.length) {
    const fallback = state.tracks.get(key);
    if (fallback) playList([fallback], 0);
    return;
  }
  const index = key ? list.findIndex((track) => track.key === key) : 0;
  playList(list, index >= 0 ? index : 0);
}

function playShuffled(listId) {
  const list = getList(listId);
  if (!list.length) {
    toast("Плейлист пуст", "error");
    return;
  }
  const index = Math.floor(Math.random() * list.length);
  state.settings.shuffle = true;
  persistSettings();
  updateShuffleRepeat();
  playList(list, index);
}

function loadCurrent(autoplay = true) {
  const track = currentTrack();
  if (!track) {
    state.current = null;
    state.playing = false;
    renderPlayerMeta();
    updatePlayButtons();
    renderQueue();
    return;
  }

  state.current = track;
  state.playing = autoplay;
  audio.pause();
  els.pbLoading.hidden = false;
  const loadingText = $("#pbLoadingText");
  const loadingFill = $("#pbLoadingFill");
  if (loadingText) loadingText.textContent = "Загрузка трека… 0%";
  if (loadingFill) loadingFill.style.width = "0%";
  toast("Загрузка трека…", "info");
  // Быстрая анимация прогресса (0→90) за ~1.5 сек, финальные 100% — при canplay
  if (state.loadingTimer) clearInterval(state.loadingTimer);
  let pct = 0;
  state.loadingTimer = setInterval(() => {
    if (pct >= 90) {
      clearInterval(state.loadingTimer);
      state.loadingTimer = null;
      return;
    }
    pct = Math.min(90, pct + Math.random() * 8 + 4);
    if (loadingText) loadingText.textContent = `Загрузка трека… ${Math.round(pct)}%`;
    if (loadingFill) loadingFill.style.width = `${pct}%`;
  }, 120);
  audio.src = track.streamUrl;
  audio.load();
  audio.volume = state.settings.muted ? 0 : state.settings.volume;
  audio.muted = state.settings.muted;

  store.addRecent(track);
  setMediaSession(track);
  renderPlayerMeta();
  renderNowPlaying();
  renderQueue();
  updatePlayButtons();
  syncRowStates();
  updateLikeButtons();
  setRange(els.progress, 0);
  setRange(els.npProgress, 0);
  els.curTime.textContent = "0:00";
  els.durTime.textContent = formatTime(track.duration);
  els.npCur.textContent = "0:00";
  els.npDur.textContent = formatTime(track.duration);

  if (autoplay) {
    const promise = audio.play();
    if (promise) {
      promise.catch((error) => {
        if (error?.name === "AbortError") return;
        state.playing = false;
        updatePlayButtons();
        toast("Не удалось запустить воспроизведение", "error");
      });
    }
  }
}

function togglePlay() {
  if (!state.current) {
    const homeTracks = state.homeCache?.data?.tracks || [];
    if (homeTracks.length) {
      playList(homeTracks, 0);
      return;
    }
    startRandom();
    return;
  }
  if (audio.paused) {
    audio.play().catch(() => toast("Нажми ещё раз, чтобы включить звук", "error"));
  } else {
    audio.pause();
  }
}

function nextTrack({ auto = false } = {}) {
  if (!state.queue.length) return;
  if (state.settings.shuffle && state.queue.length > 1) {
    let index = state.index;
    while (index === state.index) index = Math.floor(Math.random() * state.queue.length);
    state.index = index;
    loadCurrent(true);
    return;
  }
  if (state.index < state.queue.length - 1) {
    state.index += 1;
    loadCurrent(true);
    return;
  }
  if (state.settings.repeat === "all" || !auto) {
    state.index = 0;
    loadCurrent(true);
    return;
  }
  state.playing = false;
  audio.pause();
  updatePlayButtons();
}

function previousTrack() {
  if (!state.queue.length) return;
  if (audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }
  state.index = state.index > 0 ? state.index - 1 : state.queue.length - 1;
  loadCurrent(true);
}

function onEnded() {
  if (state.settings.repeat === "one") {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  nextTrack({ auto: true });
}

function updateProgress() {
  const duration = getDuration();
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const ratio = duration > 0 ? current / duration : 0;

  if (!state.seeking) {
    setRange(els.progress, ratio * 1000);
    setRange(els.npProgress, ratio * 1000);
  }
  els.curTime.textContent = formatTime(current);
  els.durTime.textContent = formatTime(duration);
  els.npCur.textContent = formatTime(current);
  els.npDur.textContent = formatTime(duration);

  if ("mediaSession" in navigator && duration > 0 && Number.isFinite(audio.currentTime)) {
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: audio.playbackRate || 1,
        position: clamp(audio.currentTime, 0, duration),
      });
    } catch {
      /* optional */
    }
  }
}

function seekTo(input) {
  const duration = getDuration();
  if (!duration) return;
  const ratio = clamp(Number(input.value) / 1000, 0, 1);
  audio.currentTime = ratio * duration;
  updateProgress();
}

function applyVolume(value, { persist = true } = {}) {
  const volume = clamp(Number(value), 0, 1);
  state.settings.volume = volume;
  if (state.settings.muted && volume > 0) state.settings.muted = false;
  audio.volume = state.settings.muted ? 0 : volume;
  audio.muted = state.settings.muted;
  if (persist) persistSettings();
  updateVolumeUI();
}

function toggleMute() {
  state.settings.muted = !state.settings.muted;
  audio.muted = state.settings.muted;
  if (!state.settings.muted && state.settings.volume === 0) {
    state.settings.volume = 0.6;
    audio.volume = 0.6;
  }
  persistSettings();
  updateVolumeUI();
}

function persistSettings() {
  store.saveSettings(state.settings);
}

function updateVolumeUI() {
  const effective = state.settings.muted ? 0 : state.settings.volume;
  $$("#volume, #npVolume").forEach((input) => setRange(input, effective * 100));
  const iconName = state.settings.muted || state.settings.volume === 0 ? "volumeX" : state.settings.volume < 0.5 ? "volume1" : "volume";
  els.muteBtn.innerHTML = icon(iconName);
  els.npMute.innerHTML = icon(iconName);
  els.muteBtn.setAttribute("aria-label", state.settings.muted ? "Включить звук" : "Выключить звук");
  els.npMute.setAttribute("aria-label", state.settings.muted ? "Включить звук" : "Выключить звук");
}

function updateShuffleRepeat() {
  const shuffleActive = Boolean(state.settings.shuffle);
  [els.shuffleBtn, els.npShuffle].forEach((button) => {
    button.classList.toggle("is-active", shuffleActive);
    button.setAttribute("aria-pressed", String(shuffleActive));
  });

  const repeat = state.settings.repeat;
  const repeatActive = repeat !== "off";
  [els.repeatBtn, els.npRepeat].forEach((button) => {
    button.classList.toggle("is-active", repeatActive);
    button.innerHTML = icon(repeat === "one" ? "repeat1" : "repeat");
    button.setAttribute("aria-pressed", String(repeatActive));
    button.title = repeat === "one" ? "Повтор одного трека" : repeat === "all" ? "Повтор всех" : "Повтор выключен";
  });
}

function updatePlayButtons() {
  const playing = state.playing && !audio.paused;
  const name = playing ? "pause" : "play";
  els.playBtn.innerHTML = icon(name);
  els.npPlay.innerHTML = icon(name);
  els.playBtn.setAttribute("aria-label", playing ? "Пауза" : "Играть");
  els.npPlay.setAttribute("aria-label", playing ? "Пауза" : "Играть");
  document.body.classList.toggle("is-playing", playing);
}

function updateLikeButtons() {
  const current = state.current;
  const currentLiked = current ? state.likes.has(current.key) : false;

  els.pbLike.disabled = !current;
  els.pbLike.classList.toggle("is-liked", currentLiked);
  els.pbLike.innerHTML = icon(currentLiked ? "heartFill" : "heart");
  els.pbLike.setAttribute("aria-label", currentLiked ? "Убрать из любимых" : "Добавить в любимые");

  els.npLike.disabled = !current;
  els.npLike.classList.toggle("is-liked", currentLiked);
  els.npLike.innerHTML = icon(currentLiked ? "heartFill" : "heart");
  els.npLike.setAttribute("aria-label", currentLiked ? "Убрать из любимых" : "Добавить в любимые");

  $$("[data-action='like'][data-key]").forEach((button) => {
    const liked = state.likes.has(button.dataset.key);
    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", String(liked));
    button.setAttribute("aria-label", liked ? "Убрать из любимых" : "Добавить в любимые");
    button.innerHTML = icon(liked ? "heartFill" : "heart");
  });

  if (els.likedCount) els.likedCount.textContent = String(state.likes.size);

  const quickCounts = $$("[data-like-count]");
  quickCounts.forEach((element) => {
    element.textContent = String(state.likes.size);
  });
}

function toggleLike(key) {
  let track = state.tracks.get(key);
  if (!track && state.current?.key === key) track = state.current;
  if (!track) return;
  const liked = store.toggleLike(track);
  if (liked) state.likes.add(key);
  else state.likes.delete(key);
  haptic();
  updateLikeButtons();
  syncRowStates();
  toast(liked ? "Добавлено в любимые" : "Убрано из любимых", liked ? "success" : "info");

  if (state.route.name === "liked") {
    const scroll = els.main.scrollTop;
    renderLiked();
    els.main.scrollTop = scroll;
  } else if (state.route.name === "library") {
    const scroll = els.main.scrollTop;
    renderLibrary();
    els.main.scrollTop = scroll;
  }
}

function syncRowStates() {
  const key = state.current?.key;
  const playing = state.playing && !audio.paused;
  $$("[data-row-key]").forEach((row) => {
    const isCurrent = Boolean(key) && row.dataset.rowKey === key;
    row.classList.toggle("is-current", isCurrent);
    row.classList.toggle("is-playing", isCurrent && playing);
  });
}

function renderPlayerMeta() {
  const track = state.current;
  if (!track) {
    els.pbTitle.textContent = "Ничего не играет";
    els.pbSub.textContent = "Выбери трек в каталоге";
    els.pbArt.innerHTML = art({ key: "empty", title: "KLUG", artist: "Sound" }, { label: "K" });
    els.pbLike.disabled = true;
    els.pbLike.classList.remove("is-liked");
    els.pbLike.innerHTML = icon("heart");
    document.title = "KLUG Sound — плеер";
    return;
  }
  els.pbTitle.textContent = track.title;
  els.pbTitle.title = track.title;
  els.pbSub.innerHTML = `${artistLink(track)}`;
  els.pbArt.innerHTML = art(track);
  document.title = `${track.title} — ${track.artist} · KLUG Sound`;
  updateLikeButtons();
}

function renderQueue() {
  const current = state.current;
  if (!current) {
    els.queueTitle.textContent = "Очередь";
    els.queueList.innerHTML = `<div class="queue-empty">Очередь пуста.<br />Выбери трек, чтобы начать слушать.</div>`;
    els.npQueue.innerHTML = "";
    els.npQueueCount.textContent = "0";
    return;
  }

  const upcoming = state.queue.slice(state.index + 1);
  els.queueTitle.textContent = `Очередь · ${upcoming.length}`;
  els.queueList.innerHTML = `
    <div class="queue-group-label">Сейчас</div>
    ${queueItem(current, state.index, true)}
    <div class="queue-group-label">Далее · ${upcoming.length}</div>
    ${
      upcoming.length
        ? upcoming.map((track, offset) => queueItem(track, state.index + 1 + offset, false)).join("")
        : `<div class="queue-empty">Это последний трек в очереди.</div>`
    }`;

  els.npQueueCount.textContent = String(upcoming.length);
  els.npQueue.innerHTML = upcoming.length
    ? upcoming.slice(0, 8).map((track, offset) => queueItem(track, state.index + 1 + offset, false)).join("")
    : `<div class="queue-empty">Это последний трек в очереди.</div>`;
}

function queueItem(track, index, isCurrent) {
  return `<button class="queue-item${isCurrent ? " is-current" : ""}" type="button" data-action="play-queue" data-index="${index}">
    ${art(track)}
    <span class="queue-item-main">
      <span class="queue-item-title">${esc(track.title)}${isCurrent ? ` <span class="src-badge src-badge--full">СЕЙЧАС</span>` : ""}</span>
      <span class="queue-item-artist">${esc(track.artist)}</span>
    </span>
    <span class="queue-item-dur">${formatTime(track.duration)}</span>
  </button>`;
}

function renderNowPlaying() {
  const track = state.current;
  if (!track) {
    els.npArt.innerHTML = art({ key: "empty", title: "KLUG" }, { label: "K" });
    els.npTitle.textContent = "Ничего не играет";
    els.npArtist.textContent = "Найди свой первый трек";
    els.npArtist.href = "#/search";
    els.npSource.textContent = "Сейчас играет";
    els.npBg.style.backgroundImage = "none";
    els.npLike.disabled = true;
    return;
  }

  els.npArt.innerHTML = art(track);
  els.npTitle.textContent = track.title;
  els.npArtist.textContent = track.artist;
  els.npArtist.href = artistHref(track.artistKey);
  els.npSource.textContent = "Сейчас играет";
  els.npBg.style.backgroundImage = track.artwork
    ? `url("${track.artwork.replace(/["\\\n\r]/g, "")}")`
    : "none";
  els.npLike.disabled = false;
  updateLikeButtons();
  updateProgress();

  const upcoming = state.queue.slice(state.index + 1);
  els.npQueueCount.textContent = String(upcoming.length);
  els.npQueue.innerHTML = upcoming.length
    ? upcoming.slice(0, 8).map((next, offset) => queueItem(next, state.index + 1 + offset, false)).join("")
    : `<div class="queue-empty">Это последний трек в очереди.</div>`;
}

/* ------------------------------------------------------------------------ */
/* Overlays                                                                 */
/* ------------------------------------------------------------------------ */

function openNowPlaying() {
  if (!state.current) {
    if (state.homeCache?.data?.tracks?.length) playList(state.homeCache.data.tracks, 0);
    else startRandom();
    return;
  }
  state.npOpen = true;
  els.nowPlaying.classList.add("is-open");
  els.nowPlaying.setAttribute("aria-hidden", "false");
  renderNowPlaying();
  haptic();
}

function closeNowPlaying({ silent = false } = {}) {
  if (!state.npOpen) return;
  state.npOpen = false;
  els.nowPlaying.classList.remove("is-open");
  els.nowPlaying.setAttribute("aria-hidden", "true");
  if (!silent) haptic();
}

function openDrawer() {
  state.drawerOpen = true;
  els.queueDrawer.classList.add("is-open");
  els.queueDrawer.setAttribute("aria-hidden", "false");
  els.scrim.hidden = false;
  renderQueue();
  haptic();
}

function closeDrawer({ silent = false } = {}) {
  if (!state.drawerOpen) {
    els.scrim.hidden = true;
    return;
  }
  state.drawerOpen = false;
  els.queueDrawer.classList.remove("is-open");
  els.queueDrawer.setAttribute("aria-hidden", "true");
  els.scrim.hidden = true;
  if (!silent) haptic();
}

/* ------------------------------------------------------------------------ */
/* Random                                                                   */
/* ------------------------------------------------------------------------ */

async function startRandom() {
  try {
    const tracks = state.homeCache?.data?.tracks?.length
      ? state.homeCache.data.tracks
      : await api.getTrendingTracks(40);
    if (!tracks.length) throw new Error("Нет треков");
    const index = Math.floor(Math.random() * tracks.length);
    playList(tracks, index);
    toast("Включаю случайный трек из трендов", "success");
  } catch {
    toast("Не удалось найти трек. Попробуй ещё раз.", "error");
  }
}

/* ------------------------------------------------------------------------ */
/* Event handlers                                                          */
/* ------------------------------------------------------------------------ */

function openAddToPlaylistModal(trackKey) {
  const track = state.tracks.get(trackKey) || (state.current?.key === trackKey ? state.current : null);
  if (!track) {
    toast("Трек не найден", "error");
    return;
  }
  const playlists = store.getPlaylists();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="page-section-head" style="margin-bottom:12px"><h3>Добавить в плейлист</h3></div>
      <div class="modal-list">
        ${
          playlists.length
            ? playlists
                .map(
                  (playlist) =>
                    `<button class="modal-item" type="button" data-action="add-to-playlist-confirm" data-id="${esc(
                      playlist.id
                    )}">${esc(playlist.name)} <span class="kicker">· ${playlist.tracks.length}</span></button>`
                )
                .join("")
            : `<p class="kicker">Плейлистов пока нет. Создай новый.</p>`
        }
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-accent" type="button" data-action="create-playlist-modal">Новый плейлист</button>
        <button class="btn-soft" type="button" data-action="close-modal">Закрыть</button>
      </div>
    </div>`;
  document.body.append(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "close-modal") {
      overlay.remove();
      return;
    }
    if (action === "create-playlist-modal") {
      const name = window.prompt("Название нового плейлиста", "Мой плейлист");
      if (name && name.trim()) {
        const playlist = store.createPlaylist(name.trim());
        const added = store.addToPlaylist(playlist.id, track);
        overlay.remove();
        toast(added ? `Добавлено в «${playlist.name}»` : "Трек уже в плейлисте", added ? "success" : "info");
        renderLibrary();
        renderSidePlaylists();
      }
      return;
    }
    if (action === "add-to-playlist-confirm") {
      const added = store.addToPlaylist(button.dataset.id, track);
      const playlist = store.getPlaylistById(button.dataset.id);
      overlay.remove();
      toast(added ? `Добавлено в «${playlist?.name}»` : "Трек уже в плейлисте", added ? "success" : "info");
      return;
    }
  });
}

function handleViewClick(event) {
  const anchor = event.target.closest("a");
  if (anchor) return;

  const actionElement = event.target.closest("[data-action]");
  if (actionElement) {
    const action = actionElement.dataset.action;
    switch (action) {
      case "play":
        playFromList(actionElement.dataset.list, actionElement.dataset.key);
        haptic();
        return;
      case "play-all":
        playFromList(actionElement.dataset.list);
        haptic();
        return;
      case "shuffle-play":
        playShuffled(actionElement.dataset.list);
        haptic();
        return;
      case "like":
        toggleLike(actionElement.dataset.key);
        return;
      case "random":
        startRandom();
        return;
      case "retry":
        handleRoute();
        return;
      case "search-query": {
        const query = actionElement.dataset.query || "";
        const input = $("#searchInput");
        if (input) {
          input.value = query;
          syncSearchClear();
        }
        commitSearch(query);
        return;
      }
      case "search-tab":
        state.search.tab = actionElement.dataset.tab || "all";
        paintSearchResults();
        return;
      case "search-filter":
        state.search.originalOnly = actionElement.dataset.filter === "all" ? false : true;
        if (state.search.data) paintSearchResults();
        return;
      case "clear-search": {
        const input = $("#searchInput");
        if (input) {
          input.value = "";
          syncSearchClear();
          input.focus();
        }
        state.search.q = "";
        state.search.data = null;
        state.search.error = null;
        state.search.loading = false;
        history.replaceState(null, "", "#/search");
        paintSearchDiscovery();
        return;
      }
      case "clear-search-history":
        store.clearSearches();
        paintSearchDiscovery();
        toast("История поиска очищена", "success");
        return;
      case "play-queue": {
        const index = Number(actionElement.dataset.index);
        if (Number.isInteger(index) && state.queue[index]) {
          state.index = index;
          loadCurrent(true);
          closeDrawer({ silent: true });
        }
        return;
      }
      case "clear-recent": {
        if (!window.confirm("Очистить историю прослушиваний?")) return;
        store.clearRecent();
        renderRecent();
        toast("История очищена", "success");
        return;
      }
      case "toggle-popular": {
        const more = $("#popularMore");
        if (!more) return;
        const hidden = more.hidden;
        more.hidden = !hidden;
        actionElement.innerHTML = hidden
          ? `${icon("collapse")} Скрыть`
          : `${icon("chevronDown")} Показать ещё`;
        return;
      }
      case "add-to-playlist": {
        openAddToPlaylistModal(actionElement.dataset.key);
        return;
      }
      case "remove-from-playlist": {
        const key = actionElement.dataset.key;
        const pid = actionElement.dataset.playlistId;
        store.removeFromPlaylist(pid, key);
        toast("Удалено из плейлиста", "info");
        handleRoute();
        return;
      }
      case "create-playlist": {
        const name = window.prompt("Название нового плейлиста", "Мой плейлист");
        if (name && name.trim()) {
          const playlist = store.createPlaylist(name.trim());
          toast(`Плейлист «${playlist.name}» создан`, "success");
          renderLibrary();
          renderSidePlaylists();
        }
        return;
      }
      case "delete-playlist": {
        if (!window.confirm("Удалить плейлист?")) return;
        store.deletePlaylist(actionElement.dataset.id);
        renderLibrary();
        renderSidePlaylists();
        toast("Плейлист удалён", "info");
        return;
      }
      case "rename-playlist": {
        const playlist = store.getPlaylistById(actionElement.dataset.id);
        if (!playlist) return;
        const name = window.prompt("Новое название", playlist.name);
        if (name && name.trim()) {
          store.renamePlaylist(actionElement.dataset.id, name.trim());
          renderLibrary();
          renderSidePlaylists();
          if (state.route.name === "myplaylist") handleRoute();
        }
        return;
      }
      default:
        break;
    }
  }

  const row = event.target.closest("[data-row-key]");
  if (row && !event.target.closest("button")) {
    playFromList(row.dataset.list, row.dataset.rowKey);
    haptic();
  }
}

function handleViewInput(event) {
  if (event.target.id !== "searchInput") return;
  syncSearchClear();
  const query = event.target.value;
  clearTimeout(state.searchTimer);
  if (query.trim().length < 2) {
    state.search.q = query.trim();
    state.search.data = null;
    state.search.error = null;
    state.search.loading = false;
    state.search.token += 1;
    history.replaceState(null, "", "#/search");
    paintSearchDiscovery();
    return;
  }
  state.searchTimer = setTimeout(() => commitSearch(query), 420);
}

function handleViewSubmit(event) {
  if (event.target.id !== "searchForm") return;
  event.preventDefault();
  clearTimeout(state.searchTimer);
  const input = $("#searchInput");
  commitSearch(input?.value || "");
}

function handleViewKeydown(event) {
  if (event.key !== "Enter") return;
  const row = event.target.closest("[data-row-key]");
  if (row && !event.target.closest("button, a")) {
    event.preventDefault();
    playFromList(row.dataset.list, row.dataset.rowKey);
  }
}

function setShuffle(value) {
  state.settings.shuffle = value;
  persistSettings();
  updateShuffleRepeat();
}

function cycleRepeat() {
  const order = ["off", "all", "one"];
  const index = order.indexOf(state.settings.repeat);
  state.settings.repeat = order[(index + 1) % order.length];
  persistSettings();
  updateShuffleRepeat();
  haptic();
}

function initAudioEvents() {
  audio.addEventListener("play", () => {
    state.playing = true;
    updatePlayButtons();
    syncRowStates();
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    } catch {
      /* optional */
    }
  });

  audio.addEventListener("pause", () => {
    state.playing = false;
    updatePlayButtons();
    syncRowStates();
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    } catch {
      /* optional */
    }
  });

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("durationchange", updateProgress);
  audio.addEventListener("progress", () => {
    const loadingText = $("#pbLoadingText");
    if (!loadingText || els.pbLoading.hidden) return;
    const duration = getDuration();
    if (!duration || !audio.buffered.length) return;
    const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
    const percent = Math.min(100, Math.round((bufferedEnd / duration) * 100));
    loadingText.textContent = `${percent}%`;
  });

  audio.addEventListener("waiting", () => {
    els.pbLoading.hidden = false;
  });

  audio.addEventListener("playing", () => {
    if (state.loadingTimer) {
      clearInterval(state.loadingTimer);
      state.loadingTimer = null;
    }
    const loadingText = $("#pbLoadingText");
    const loadingFill = $("#pbLoadingFill");
    if (loadingText) loadingText.textContent = "Загрузка трека… 100%";
    if (loadingFill) loadingFill.style.width = "100%";
    setTimeout(() => {
      els.pbLoading.hidden = true;
      if (loadingFill) loadingFill.style.width = "0%";
    }, 300);
  });

  audio.addEventListener("canplay", () => {
    if (state.loadingTimer) {
      clearInterval(state.loadingTimer);
      state.loadingTimer = null;
    }
    const loadingText = $("#pbLoadingText");
    const loadingFill = $("#pbLoadingFill");
    if (loadingText) loadingText.textContent = "Загрузка трека… 100%";
    if (loadingFill) loadingFill.style.width = "100%";
    setTimeout(() => {
      els.pbLoading.hidden = true;
      if (loadingFill) loadingFill.style.width = "0%";
    }, 300);
  });

  audio.addEventListener("ended", onEnded);

  audio.addEventListener("error", () => {
    const failed = currentTrack();
    if (state.loadingTimer) {
      clearInterval(state.loadingTimer);
      state.loadingTimer = null;
    }
    els.pbLoading.hidden = true;
    state.playing = false;
    updatePlayButtons();
    if (!failed) return;
    toast("Трек недоступен. Возможно, он удалён из каталога.", "error");
    if (state.queue.length > 1) {
      setTimeout(() => {
        if (currentTrack()?.key === failed.key) nextTrack({ auto: true });
      }, 1500);
    }
  });

  audio.addEventListener("volumechange", () => {
    // Keep UI in sync if the system changes volume or mute.
    if (audio.muted !== state.settings.muted) {
      state.settings.muted = audio.muted;
      updateVolumeUI();
    }
  });
}

function initPlayerControls() {
  els.playBtn.addEventListener("click", () => {
    togglePlay();
    haptic();
  });
  els.npPlay.addEventListener("click", () => {
    togglePlay();
    haptic();
  });
  els.prevBtn.addEventListener("click", () => {
    previousTrack();
    haptic();
  });
  els.npPrev.addEventListener("click", () => {
    previousTrack();
    haptic();
  });
  els.nextBtn.addEventListener("click", () => {
    nextTrack();
    haptic();
  });
  els.npNext.addEventListener("click", () => {
    nextTrack();
    haptic();
  });
  els.shuffleBtn.addEventListener("click", () => setShuffle(!state.settings.shuffle));
  els.npShuffle.addEventListener("click", () => setShuffle(!state.settings.shuffle));
  els.repeatBtn.addEventListener("click", cycleRepeat);
  els.npRepeat.addEventListener("click", cycleRepeat);
  els.pbLike.addEventListener("click", () => {
    if (state.current) toggleLike(state.current.key);
  });
  els.npLike.addEventListener("click", () => {
    if (state.current) toggleLike(state.current.key);
  });
  els.queueBtn.addEventListener("click", openDrawer);
  els.queueClose.addEventListener("click", () => closeDrawer());
  els.scrim.addEventListener("click", () => closeDrawer());
  els.expandBtn.addEventListener("click", openNowPlaying);
  els.pbArtBtn.addEventListener("click", openNowPlaying);
  els.npClose.addEventListener("click", () => closeNowPlaying());

  els.progress.addEventListener("pointerdown", () => {
    state.seeking = true;
  });
  [els.progress, els.npProgress].forEach((input) => {
    input.addEventListener("input", () => {
      state.seeking = true;
      const duration = getDuration();
      const current = (Number(input.value) / 1000) * duration;
      setRange(els.progress, Number(input.value));
      setRange(els.npProgress, Number(input.value));
      els.curTime.textContent = formatTime(current);
      els.npCur.textContent = formatTime(current);
    });
    input.addEventListener("change", () => {
      seekTo(input);
      state.seeking = false;
    });
    input.addEventListener("pointerup", () => {
      seekTo(input);
      state.seeking = false;
    });
  });

  [els.volume, els.npVolume].forEach((input) => {
    input.addEventListener("input", () => applyVolume(Number(input.value) / 100));
  });
  els.muteBtn.addEventListener("click", toggleMute);
  els.npMute.addEventListener("click", toggleMute);

  $("#randomBtn").addEventListener("click", startRandom);
  els.backBtn.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else navigate("#/home");
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.matches("input, textarea, select") || target.isContentEditable) return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      audio.currentTime = Math.min(getDuration(), audio.currentTime + 5);
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (event.code === "ArrowUp") {
      event.preventDefault();
      applyVolume(state.settings.volume + 0.05);
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      applyVolume(state.settings.volume - 0.05);
    } else if (event.code === "KeyM") {
      toggleMute();
    } else if (event.code === "KeyL" && state.current) {
      toggleLike(state.current.key);
    } else if (event.code === "KeyQ") {
      state.drawerOpen ? closeDrawer() : openDrawer();
    } else if (event.code === "Escape") {
      closeNowPlaying();
      closeDrawer();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-nav]");
    if (!link) return;
    haptic();
    const href = link.getAttribute("href");
    if (href && location.hash === href) {
      event.preventDefault();
      els.main.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function initViewListeners() {
  els.view.addEventListener("click", handleViewClick);
  els.view.addEventListener("input", handleViewInput);
  els.view.addEventListener("submit", handleViewSubmit);
  els.view.addEventListener("keydown", handleViewKeydown);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:") return;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

/* ------------------------------------------------------------------------ */
/* Boot                                                                     */
/* ------------------------------------------------------------------------ */

function renderSidePlaylists() {
  const container = $("#sidePlaylists");
  if (!container) return;
  const playlists = store.getPlaylists();
  if (!playlists.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = playlists
    .map(
      (playlist) =>
        `<a class="side-link side-link--sm side-playlist-link" href="#/myplaylist/${encodeURIComponent(
          playlist.id
        )}" data-nav="myplaylist">
          <span data-icon="list"></span>
          <span>${esc(playlist.name)}</span>
          <span class="side-count">${playlist.tracks.length}</span>
        </a>`
    )
    .join("");
  hydrateIcons();
}

function init() {
  hydrateIcons();
  initTelegram();
  initAudioEvents();
  initPlayerControls();
  initViewListeners();
  initMediaSession();

  state.settings.volume = clamp(state.settings.volume, 0, 1);
  state.lastVolume = state.settings.volume;
  audio.volume = state.settings.muted ? 0 : state.settings.volume;
  audio.muted = state.settings.muted;
  updateVolumeUI();
  updateShuffleRepeat();
  updatePlayButtons();
  updateLikeButtons();
  renderPlayerMeta();
  renderSidePlaylists();

  if (!location.hash) history.replaceState(null, "", "#/home");
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
  registerServiceWorker();
}

init();
