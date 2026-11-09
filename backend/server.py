"""KLUG Sound backend — YouTube Music (ytmusicapi) + yt-dlp stream resolver.

Endpoints:
  GET /api/health
  GET /api/search?q=...&limit=...
  GET /api/artist?channel_id=UC... (or ?q=artist name)
  GET /api/trending
  GET /api/stream/<video_id>        (proxies audio with CORS)

Run:
  python3 backend/server.py
"""
import os
import re
import subprocess
import threading
import time

import requests
import yt_dlp
from flask import Flask, Response, request, jsonify, stream_with_context, send_from_directory
from ytmusicapi import YTMusic

PORT = int(os.environ.get("PORT") or os.environ.get("KLUG_PORT") or "8799")
HOST = os.environ.get("KLUG_HOST", "0.0.0.0")

app = Flask(__name__)
yt = YTMusic()

_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 300


def _now():
    return time.time()


def cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (entry["at"] + entry["ttl"] > _now()):
            return entry["value"]
    return None


def cache_set(key, value, ttl=CACHE_TTL):
    with _cache_lock:
        _cache[key] = {"at": _now(), "ttl": ttl, "value": value}
        if len(_cache) > 300:
            oldest = sorted(_cache.items(), key=lambda kv: kv[1]["at"])[:60]
            for k, _ in oldest:
                _cache.pop(k, None)


def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Range"
    resp.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range, Accept-Ranges"
    return resp


@app.after_request
def _cors(resp):
    return cors(resp)


@app.route("/api/<path:_>", methods=["OPTIONS"])
def _options(_):
    return cors(Response(status=204))


def clean_title(value):
    text = str(value or "").replace("_", " ")
    text = re.sub(r"\s*\[[^\]]*\]\s*", " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    text = re.sub(r"\s+[-–—:]\s*$", "", text).strip()
    return text or "Без названия"


def clean_artist(value):
    return re.sub(r"\s+", " ", str(value or "").replace("_", " ")).strip()


def normalize(value):
    import unicodedata
    text = str(value or "").lower()
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"[\u0300-\u036f]", "", text)
    text = re.sub(r"\b(feat|ft|featuring)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


REMIX_PATTERN = re.compile(
    r"\b(mix|remix|remake|cover|bootleg|acoustic|live|radio[-_ ]?edit|edit|instrumental|electroacoustic|rework|flip|take|slowed|sped up|speed up)\b",
    re.IGNORECASE,
)


def is_remix(title):
    return bool(REMIX_PATTERN.search(str(title or "")))


def thumb_of(thumbs):
    if not thumbs:
        return ""
    best = max(thumbs, key=lambda t: (t.get("width") or 0) * (t.get("height") or 0))
    return best.get("url") or (thumbs[-1].get("url") if thumbs else "")


def parse_duration(value):
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value or "")
    parts = text.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        return int(float(text))
    except Exception:
        return 0


def map_track(t, album_title="", artist_override=None, artist_id_override=None):
    if not t or not t.get("videoId"):
        return None
    vid = t["videoId"]
    artists = t.get("artists") or []
    if artist_override:
        artist_name = artist_override
    elif artists:
        artist_name = artists[0].get("name") or "Неизвестный исполнитель"
    else:
        artist_name = "Неизвестный исполнитель"
    artist_id = artist_id_override or (artists[0].get("id") if artists else "")
    album_info = t.get("album")
    if isinstance(album_info, dict):
        album_name = album_info.get("name")
        album_thumbs = album_info.get("thumbnails")
    else:
        album_name = album_info
        album_thumbs = None
    album = album_title or album_name or ""
    thumbs = t.get("thumbnails") or album_thumbs or []
    artwork = thumb_of(thumbs)
    duration = t.get("duration_seconds") or parse_duration(t.get("duration"))
    title = clean_title(t.get("title") or "Без названия")
    return {
        "key": f"youtube:{vid}",
        "source": "youtube",
        "id": str(vid),
        "title": title,
        "artist": clean_artist(artist_name),
        "artistKey": f"youtube:{artist_id}" if artist_id else "",
        "artistId": str(artist_id or ""),
        "artistHandle": "",
        "album": clean_title(album) if album else "",
        "artwork": artwork,
        "duration": int(duration or 0),
        "genre": "",
        "plays": 0,
        "streamUrl": f"/api/stream/{vid}",
        "isPreview": False,
        "permalink": f"https://music.youtube.com/watch?v={vid}",
        "year": "",
        "isRemix": is_remix(title),
    }


def map_artist_search(row):
    if not row or not row.get("browseId"):
        return None
    thumbs = row.get("thumbnails") or []
    avatar = thumb_of(thumbs)
    return {
        "key": f"youtube:{row['browseId']}",
        "source": "youtube",
        "id": str(row["browseId"]),
        "name": clean_artist(row.get("artist") or row.get("title") or "Неизвестный исполнитель"),
        "handle": "",
        "avatar": avatar,
        "cover": avatar,
        "bio": "",
        "followers": None,
        "trackCount": None,
        "verified": False,
        "genre": "",
        "permalink": f"https://music.youtube.com/channel/{row['browseId']}",
    }


def do_search(q, limit=30):
    cache_key = f"ytm:search:{normalize(q)}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    tracks = []
    artists = []
    try:
        songs = yt.search(q, filter="songs", limit=limit)
        for s in songs:
            t = map_track(s)
            if t:
                tracks.append(t)
    except Exception:
        pass
    try:
        arts = yt.search(q, filter="artists", limit=12)
        for a in arts:
            ma = map_artist_search(a)
            if ma:
                artists.append(ma)
    except Exception:
        pass

    # dedupe tracks by id
    seen = set()
    deduped = []
    for t in tracks:
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        deduped.append(t)

    # dedupe artists by name
    by_name = {}
    for a in artists:
        by_name.setdefault(normalize(a["name"]), a)
    artists = list(by_name.values())[:12]

    deduped.sort(key=lambda t: (1 if t.get("isRemix") else 0,))

    result = {"tracks": deduped[:limit], "artists": artists, "errors": []}
    cache_set(cache_key, result)
    return result


def fetch_album_tracks(browse_id, album_title, artist_name, artist_id):
    tracks = []
    try:
        album = yt.get_album(browse_id)
        title = album.get("title") or album_title
        year = str(album.get("year") or "")
        thumbs = album.get("thumbnails") or []
        artwork = thumb_of(thumbs)
        for t in album.get("tracks", []) or []:
            mt = map_track(t, album_title=title, artist_override=artist_name, artist_id_override=artist_id)
            if mt:
                if not mt["artwork"]:
                    mt["artwork"] = artwork
                if year and not mt["year"]:
                    mt["year"] = year
                tracks.append(mt)
        return title, year, artwork, tracks
    except Exception:
        return album_title, "", "", tracks


def do_artist(channel_id=None, query=None, limit=100):
    cache_key = f"ytm:artist:{channel_id or query}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # Resolve browseId
    bid = channel_id
    if not bid and query:
        try:
            arts = yt.search(query, filter="artists", limit=5)
            if arts:
                bid = arts[0].get("browseId")
        except Exception:
            bid = None
    if not bid:
        raise RuntimeError("Исполнитель не найден")

    try:
        artist_data = yt.get_artist(bid)
    except Exception as exc:
        raise RuntimeError(f"YTMusic artist failed: {exc}")

    name = artist_data.get("name") or bid
    thumbs = artist_data.get("thumbnails") or []
    avatar = thumb_of(thumbs)

    albums_out = []
    all_tracks = []
    seen_ids = set()

    def add_album(title, year, artwork, tracks):
        nonlocal all_tracks
        album_tracks = []
        for t in tracks:
            if t["id"] in seen_ids:
                continue
            seen_ids.add(t["id"])
            album_tracks.append(t)
            all_tracks.append(t)
        if album_tracks:
            albums_out.append({
                "title": title or "Альбом",
                "year": year or "",
                "artwork": artwork or avatar,
                "tracks": album_tracks,
            })

    from concurrent.futures import ThreadPoolExecutor

    # Albums
    album_items = (artist_data.get("albums", {}) or {}).get("results", []) or []
    def fetch_one_album(a):
        abid = a.get("browseId")
        if not abid:
            return None
        title, year, artwork, tracks = fetch_album_tracks(abid, a.get("title") or "", name, bid)
        if not year:
            year = str(a.get("year") or "")
        if not artwork:
            artwork = thumb_of(a.get("thumbnails") or [])
        return (title or a.get("title") or "Альбом", year, artwork, tracks)

    with ThreadPoolExecutor(max_workers=8) as executor:
        album_results = list(executor.map(fetch_one_album, album_items))
    for res in album_results:
        if not res:
            continue
        title, year, artwork, tracks = res
        add_album(title, year, artwork, tracks)

    # Singles: get full list via get_artist_albums
    singles_browse = (artist_data.get("singles", {}) or {}).get("browseId")
    singles_list = (artist_data.get("singles", {}) or {}).get("results", []) or []
    if singles_browse:
        try:
            more = yt.get_artist_albums(bid, singles_browse, limit=100)
            if more:
                singles_list = more
        except Exception:
            pass
    def fetch_one_single(s):
        sbid = s.get("browseId")
        if not sbid:
            return None
        title, year, artwork, tracks = fetch_album_tracks(sbid, s.get("title") or "", name, bid)
        if not year:
            year = str(s.get("year") or "")
        if not artwork:
            artwork = thumb_of(s.get("thumbnails") or [])
        return (title or s.get("title") or "Сингл", year, artwork, tracks)

    with ThreadPoolExecutor(max_workers=8) as executor:
        single_results = list(executor.map(fetch_one_single, singles_list))
    for res in single_results:
        if not res:
            continue
        title, year, artwork, tracks = res
        add_album(title, year, artwork, tracks)

    # Popular songs: fetch full list from the songs playlist (up to 100), take first 10.
    popular_tracks = []
    popular_ids = set()
    songs_browse = (artist_data.get("songs", {}) or {}).get("browseId")
    song_items = []
    if songs_browse:
        try:
            pl = yt.get_playlist(songs_browse, limit=100)
            song_items = pl.get("tracks", []) or []
        except Exception:
            song_items = (artist_data.get("songs", {}) or {}).get("results", []) or []
    else:
        song_items = (artist_data.get("songs", {}) or {}).get("results", []) or []
    for s in song_items:
        mt = map_track(s, artist_override=name, artist_id_override=bid)
        if mt and mt["id"] not in popular_ids:
            popular_ids.add(mt["id"])
            popular_tracks.append(mt)
            if len(popular_tracks) >= 10:
                break
    # Add any popular tracks not already in albums to all_tracks
    for t in popular_tracks:
        if t["id"] not in seen_ids:
            seen_ids.add(t["id"])
            all_tracks.append(t)

    # Sort albums newest -> oldest by year
    def album_year(a):
        y = str(a.get("year") or "")
        digits = re.sub(r"[^0-9]", "", y)
        return int(digits[:4]) if digits else 0
    albums_out.sort(key=album_year, reverse=True)

    artist = {
        "key": f"youtube:{bid}",
        "source": "youtube",
        "id": str(bid),
        "name": clean_artist(name),
        "handle": "",
        "avatar": avatar,
        "cover": avatar,
        "bio": (artist_data.get("description") or "")[:400],
        "followers": None,
        "trackCount": len(all_tracks),
        "verified": False,
        "genre": "",
        "permalink": f"https://music.youtube.com/channel/{bid}",
        "subscribers": artist_data.get("subscribers"),
        "monthlyListeners": artist_data.get("monthlyListeners"),
    }

    result = {"artist": artist, "tracks": all_tracks, "albums": albums_out, "popular": popular_tracks}
    cache_set(cache_key, result)
    return result


def do_trending(limit=20):
    cache_key = f"ytm:trending:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        songs = yt.search("новые песни 2026", filter="songs", limit=limit)
        tracks = []
        seen = set()
        for s in songs:
            t = map_track(s)
            if t and t["id"] not in seen:
                seen.add(t["id"])
                tracks.append(t)
        cache_set(cache_key, tracks)
        return tracks
    except Exception:
        return []


def resolve_audio_url(video_id):
    cache_key = f"yt:stream:{video_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    url = f"https://www.youtube.com/watch?v={video_id}"
    # Путь к cookies (если загружены на хостинг) — обходит проверку бота.
    cookies_path = os.environ.get("YOUTUBE_COOKIES_FILE") or os.path.join(os.path.dirname(__file__), "cookies.txt")
    has_cookies = os.path.exists(cookies_path)

    last_error = None
    for client in ("android", "ios", "mweb", "web"):
        try:
            opts = {
                "quiet": True,
                "no_warnings": True,
                "format": "best",
                "skip_download": True,
                "extractor_args": {"youtube": {"player_client": [client]}},
                "http_headers": {
                    "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
                },
            }
            if has_cookies:
                opts["cookiefile"] = cookies_path
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            audio_url = info.get("url")
            if not audio_url:
                formats = info.get("formats") or []
                audio_formats = [f for f in formats if f.get("acodec") and f.get("acodec") != "none"]
                if audio_formats:
                    audio_formats.sort(key=lambda f: (f.get("abr") or 0, f.get("filesize") or 0), reverse=True)
                    audio_url = audio_formats[0].get("url")
                elif formats:
                    audio_url = formats[-1].get("url")
            if audio_url:
                cache_set(cache_key, audio_url, ttl=600)
                return audio_url
        except Exception as exc:
            last_error = exc
            continue
    raise RuntimeError(f"Аудио-поток не найден: {last_error}")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "service": "klug-ytmusic", "yt_dlp": getattr(yt_dlp, "__version__", "unknown")})


@app.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").replace("+", " ").strip()
    q = re.sub(r"\s+", " ", q)
    if len(q) < 2:
        return jsonify({"tracks": [], "artists": [], "errors": []})
    limit = int(request.args.get("limit") or 30)
    try:
        data = do_search(q, limit=limit)
        return jsonify(data)
    except Exception as exc:
        return jsonify({"tracks": [], "artists": [], "errors": ["YouTube Music"], "message": str(exc)}), 502


@app.route("/api/artist")
def api_artist():
    channel_id = (request.args.get("channel_id") or "").strip()
    q = re.sub(r"\s+", " ", (request.args.get("q") or "").replace("+", " ").strip())
    limit = int(request.args.get("limit") or 100)
    try:
        data = do_artist(channel_id=channel_id or None, query=q or None, limit=limit)
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.route("/api/trending")
def api_trending():
    limit = int(request.args.get("limit") or 20)
    try:
        tracks = do_trending(limit=limit)
        return jsonify({"tracks": tracks})
    except Exception as exc:
        return jsonify({"tracks": [], "error": str(exc)}), 502


@app.route("/api/stream/<video_id>")
def api_stream(video_id):
    video_id = video_id.strip()
    try:
        audio_url = resolve_audio_url(video_id)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    # Кэшируем аудио на диск: первый запуск транскодирует, повторные — мгновенно.
    import os as _os
    cache_dir = _os.path.join(_os.path.dirname(__file__), "cache", "audio")
    _os.makedirs(cache_dir, exist_ok=True)
    cache_file = _os.path.join(cache_dir, f"{video_id}.m4a")

    if not _os.path.exists(cache_file):
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", audio_url,
            "-vn", "-acodec", "aac", "-b:a", "128k",
            cache_file,
        ]
        try:
            subprocess.run(cmd, check=True, timeout=300)
        except Exception as exc:
            # fallback: редирект на прямой URL
            from flask import redirect
            return redirect(audio_url, code=302)

    # Ограничение кэша: удаляем старые файлы, если больше 200MB
    try:
        files = sorted(
            (os.path.join(cache_dir, f) for f in os.listdir(cache_dir) if f.endswith(".m4a")),
            key=os.path.getmtime,
        )
        total = sum(os.path.getsize(f) for f in files)
        while total > 200 * 1024 * 1024 and len(files) > 5:
            oldest = files.pop(0)
            total -= os.path.getsize(oldest)
            os.remove(oldest)
    except Exception:
        pass

    from flask import send_file
    resp = send_file(cache_file, mimetype="audio/mp4", conditional=True)
    cors(resp)
    return resp


# --- Статика фронтенда (чтобы всё работало с одного порта) ---
FRONTEND_ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))

@app.route("/")
def index():
    return send_from_directory(FRONTEND_ROOT, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    # API уже обработан выше; сюда попадают только статические файлы
    if filename.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    full = os.path.join(FRONTEND_ROOT, filename)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_ROOT, filename)
    # fallback для SPA (hash-роутинг не требует сервера, но на всякий случай)
    if filename.endswith(".html") or "." not in filename:
        return send_from_directory(FRONTEND_ROOT, "player.html")
    return jsonify({"error": "not found"}), 404


if __name__ == "__main__":
    print(f"KLUG Sound (frontend + backend) starting on http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True)
