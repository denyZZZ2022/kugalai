# PROJECT_CONTEXT — KLUG Sound (Telegram Mini App)

> Статический музыкальный мини-апп для KlugAI.
> Дата: 2026-11-09.
> Автор: `@lexoffpls`.
> Рабочая папка: `/home/lexoffpls/bot/mini-app`.

---

## 1. Что это

**KLUG Sound** — музыкальный плеер внутри Telegram. Это отдельный статический сайт из двух страниц:

- `index.html` — лендинг проекта, объясняет возможности, источники и запуск;
- `player.html` — полноценное SPA-приложение: главная, поиск, исполнители, плейлисты, коллекция и плеер.

Приложение не требует аккаунта, сервера, API-ключей и сборки. Оно размещается на GitHub Pages и открывается как Telegram Mini App через menu button бота KlugAI.

### Ключевые сценарии

1. Пользователь открывает лендинг и нажимает «Открыть плеер».
2. На главной видит тренды Audius, плейлисты и исполнителей.
3. Ищет трек или артиста — результаты приходят из Audius и Apple Music одновременно.
4. Открывает страницу исполнителя, слушает треки или включает весь список.
5. Управляет очередью, перематывает, меняет громкость, включает shuffle/repeat.
6. Ставит лайки, возвращается в «Любимые», смотрит историю.
7. Продолжает слушать при переходах между экранами — плеер не перезагружается.

---

## 2. Статус

| Параметр | Значение |
|---|---|
| Готовность | Готово к деплою на GitHub Pages |
| Стек | HTML5 + CSS3 + vanilla ES modules |
| Сборка | Не требуется |
| Backend | Нет |
| Авторизация | Нет |
| API-ключи | Не требуются |
| Хранилище | `localStorage` на устройстве |
| PWA | Manifest + service worker (HTTPS) |
| Язык интерфейса | Русский |
| Бренд | KLUG Sound, автор `@lexoffpls` |

---

## 3. Файлы

```text
mini-app/
├── index.html              # лендинг
├── player.html             # оболочка плеера (DOM всех экранов)
├── 404.html                # статическая страница ошибки
├── manifest.webmanifest    # PWA
├── sw.js                   # service worker
├── .nojekyll               # отключает Jekyll на GitHub Pages
├── README.md               # инструкция по запуску и деплою
├── PROJECT_CONTEXT.md      # этот файл
├── assets/
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png / icon-512.svg
│   ├── apple-touch-icon.png
│   ├── og.png              # 1200×630 для Open Graph
│   └── fonts/              # Manrope + Unbounded, WOFF2, кириллица/латиница
├── css/
│   ├── fonts.css           # @font-face
│   ├── base.css            # токены, reset, кнопки, range, art, toast
│   ├── landing.css         # лендинг и адаптив
│   └── player.css          # приложение и адаптив
└── js/
    ├── api.js              # Audius + iTunes, нормализация, кэш, дедупликация
    ├── store.js            # localStorage
    ├── icons.js            # инлайновые SVG-иконки
    ├── landing.js          # анимации и Telegram на лендинге
    └── app.js              # роутер, экраны, аудио, очередь, лайки, Telegram
```

Точка входа плеера: `player.html` → `js/app.js` → `init()`.

---

## 4. Архитектура

### 4.1. Слои

```text
HTML (index.html / player.html)
  │
  ├── CSS: токены base.css → landing.css / player.css
  │
  └── JS
       ├── api.js      — сеть, нормализация, кэш, дедупликация
       ├── store.js    — likes / recent / settings / searches
       ├── icons.js    — SVG для динамических экранов
       ├── landing.js  — только лендинг
       └── app.js      — состояние, роутер, рендер, audio engine
```

### 4.2. Состояние приложения (`app.js`)

```js
state = {
  route, routeToken,
  lists: Map,        // listId -> Track[]
  tracks: Map,       // trackKey -> Track
  artists: Map,
  likes: Set,        // ключи любимых треков
  settings,          // volume, muted, shuffle, repeat
  current, queue, index,
  playing, seeking,
  homeCache, searchCache, artistCache, playlistCache,
  search,            // q, tab, data, loading, error, token
  npOpen, drawerOpen,
  user, tg,
}
```

- `routeToken` защищает от гонок: ответ старого запроса не перерисует новый экран.
- `state.lists` позволяет кнопкам `data-list` / `data-key` запускать нужный список без повторного fetch.
- `state.tracks` нужен для лайков и восстановления трека по ключу.

### 4.3. Рендеринг

- Экраны возвращают HTML-строку и вставляются в `#view`.
- Пользовательские строки экранируются через `esc()`.
- События делегируются: `#view` слушает `click`, `input`, `submit`, `keydown`.
- Иконки подставляются либо при загрузке (`hydrateIcons()`), либо через `icon(name)`.
- Артворк: `<span class="art">` с градиентом и инициалами; `<img>` поверх, `onerror="this.remove()"` — при ошибке остаётся красивый fallback.

---

## 5. Роутинг

Используется hash-роутинг, потому что GitHub Pages не умеет отдавать `index.html` на произвольные пути без серверных настроек.

| Hash | Экран |
|---|---|
| `#/home` | главная |
| `#/search` | поиск и подсказки |
| `#/search?q=weeknd` | результаты поиска |
| `#/artist/audius/:id` | исполнитель Audius |
| `#/artist/itunes/:id` | исполнитель Apple Music |
| `#/playlist/:id` | плейлист Audius |
| `#/library` | библиотека |
| `#/liked` | любимые треки |
| `#/recent` | история |
| неизвестный | редирект на главную |

Парсер: `parseRoute()` в `js/app.js`. ID декодируются через `decodeURIComponent`.

BackButton Telegram и кнопка `#backBtn` показываются только на вложенных экранах: `artist`, `playlist`, `liked`, `recent`. На главной/поиске/библиотеке — скрыты. На мобильных при наличии back-кнопки бренд в топбаре скрывается через `body.has-back`.

---

## 6. Источники данных

### 6.1. Audius

Базовый хост: `https://api.audius.co`, при ошибке — `discoveryprovider.audius.co` и `discoveryprovider2.audius.co`. Хост определяется через `GET https://api.audius.co`.

Используемые эндпоинты:

| Назначение | Endpoint |
|---|---|
| Тренды | `/v1/tracks/trending?time=week&limit=24` |
| Плейлисты | `/v1/playlists/trending?time=week&limit=8` |
| Поиск треков | `/v1/tracks/search?query=...&limit=50` |
| Поиск артистов | `/v1/users/search?query=...&limit=12` |
- Артист | `/v1/users/:id` |
| Треки артиста | `/v1/users/:id/tracks?limit=100&sort=plays` |
| Плейлист | `/v1/playlists/:id` |
| Треки плейлиста | `/v1/playlists/:id/tracks?limit=100` |
| Поток | `/v1/tracks/:id/stream?app_name=KLUG-MiniApp` |

Нормализация: `mapAudiusTrack`, `mapAudiusArtist`, `mapAudiusPlaylist`.

Ключ трека: `audius:<trackId>`. Ключ артиста: `audius:<userId>`.

Поток отдаёт 302 на CDN. Некоторые старые/удалённые треки отвечают 404 — приложение показывает toast и автоматически переключает на следующий трек.

Для артистов Audius с пустым кэшем треков (`!tracks.length`) выполняется fallback: поиск треков по имени артиста. Пример: `audius:bgRdX` (MORGENSHTERN) → 36 треков.

### 6.2. iTunes Search API

База: `https://itunes.apple.com`.

| Назначение | Endpoint |
|---|---|
| Поиск треков | `/search?term=...&media=music&entity=song&limit=50&country=us` |
| Поиск артистов | `/search?term=...&media=music&entity=musicArtist&limit=12&country=us` |
| Артист + треки | `/lookup?id=:artistId&entity=song&limit=200&country=us` |

Особенности:

- отдаёт `previewUrl` — только 30 секунд;
- обложки масштабируются заменой `100x100bb` на `600x600bb`;
- ключ трека: `itunes:<trackId>`, ключ артиста: `itunes:<artistId>`;
- `isPreview: true` → бейдж `30 SEC`, в плеере длительность определяется реальным файлом (≈30 с), хотя в списке показывается полная длительность трека.

### 6.2.1. Deezer (временно через браузер недоступен)

База: `https://api.deezer.com`.

| Назначение | Endpoint |
|---|---|
| Поиск треков | `/search?q=...&index=track&limit=24` |
| Поиск артистов | `/search?q=...&index=artist&limit=12` |
| Артист | `/artist/:id` |
| Треки артиста | `/artist/:id/tracks?limit=100` |
| Поток | `/track/:id/stream` |

Карта: `mapDeezermTrack`, `mapDeezermArtist`.

Текущий статус: запросы к Deezer из браузера блокируются CORS, поэтому Deezer-поиск сейчас отображается как недоступный источник, но код и ветки источников оставлены для будущего прокси. Поток Deezer поддерживает Range-запросы и готов к использованию, если CORS будет решён на хосте.

Для Deezer используются прокси-кандидаты через `fetchJsonProxied()`: `api.allorigins.win/raw`, `corsproxy.io`, `api.codetabs.com/v1/proxy`. При недоступности одного прокси автоматически пробуется следующий.

### 6.3. Объединение поиска

`searchAll(query)`:

1. Параллельно запускает `searchAudius(term, 50)`, `searchItunes(term, 50)` и `searchDeezermTracks(term, 24)`.
2. iTunes-результаты идут первыми, Audius — вторыми, Deezer — третьим источником.
3. `dedupeTracks()` убирает дубли по нормализованной паре `artist|title`.
4. `mergeArtists()` объединяет артистов из всех источников по нормализованному имени, дополняя аватар/био/статистику.
5. Трек помечается флагом `isRemix` по регулярному выражению (`mix|remix|remake|cover|bootleg|acoustic|live|radio edit|edit|instrumental|electroacoustic|rework|flip|take`).
6. Сортировка: оригинальные версии идут раньше ремиксов.
7. Результат: до 40 треков и 12 артистов; кэш 3 минуты.

UI применяет `state.search.originalOnly` (по умолчанию `true`) и фильтрует ремиксы через `data-action="search-filter"`. Кнопка «Показать ремиксы» переключает режим.

`normalize()` приводит строки к нижнему регистру, убирает диакритику, `feat/ft`, пунктуацию.

### 6.4. Кэш

- In-memory `Map` в `api.js` с TTL:
  - поиск — 3 минуты;
  - главная — 4 минуты;
  - артист/плейлист — 8 минут;
  - тренды — 2 минуты;
  - Deezer-исполнитель — 8 минут.
- Максимум 80 записей, старые 20 вытесняются.
- Дополнительно кэшируются страницы в `state.artistCache` / `playlistCache`.

---

## 7. Аудио-движок

Один `<audio id="audio" preload="metadata" playsinline>` на всё приложение. Он не пересоздаётся при переходах, поэтому музыка продолжает играть.

### 7.1. Очередь

```js
state.queue = Track[]
state.index = number
state.current = Track | null
```

- `playList(tracks, startIndex, { shuffle })` — запускает список.
- `playFromList(listId, key)` — находит индекс по ключу.
- `loadCurrent(autoplay)` — ставит `audio.src`, пишет историю, обновляет метаданные, очередь и UI.
- `nextTrack({ auto })` — следующий; при `repeat: "all"` или ручном нажатии в конце возвращается в начало.
- `previousTrack()` — если прошло больше 4 секунд, перематывает в начало; иначе предыдущий трек.
- `onEnded()` — `repeat: "one"` повторяет трек, иначе `nextTrack({ auto: true })`.
- Shuffle выбирает случайный индекс, отличный от текущего.

### 7.2. Управление

- Play/pause — `togglePlay()`.
- Seek — range `0..1000`, `seekTo()` переводит в секунды.
- Громкость — 0..1, mute, сохранение в `localStorage`.
- `MediaSession` — метаданные, play/pause/prev/next/seek handlers.
- При ошибке `audio.error` — toast и авто-переход.
- Загрузка показывается спиннером `#pbLoading`.

### 7.3. Горячие клавиши

| Клавиша | Действие |
|---|---|
| `Space` | play/pause |
| `←` / `→` | ±5 секунд |
| `↑` / `↓` | громкость |
| `M` | mute |
| `L` | лайк |
| `Q` | очередь |
| `Esc` | закрыть overlays |

---

## 8. Хранилище

`js/store.js`, префикс `klug.music.`.

| Ключ | Формат | Назначение |
|---|---|---|
| `klug.music.likes.v1` | `Track[]` | любимые, до 400 |
| `klug.music.recent.v1` | `Track[]` | история, до 40 |
| `klug.music.player.v1` | `{ volume, muted, shuffle, repeat }` | настройки |
| `klug.music.searches.v1` | `string[]` | история поиска, до 8 |

`Track` — нормализованный объект:

```js
{
  key, source, id, title, artist, artistKey, artistId,
  artistHandle, album, artwork, duration, genre, plays,
  streamUrl, isPreview, permalink, year
}
```

`isTrack()` проверяет наличие `key`, `title`, `artist`, `streamUrl`. Битые записи отбрасываются.

Все данные локальные: нет синхронизации, нет отправки на сервер.

---

## 9. Дизайн и UI

### 9.1. Токены

- Фон: `#07080b` / `#050609`.
- Акцент: лайм `#c6ff4a`, второй акцент: мята `#6fe7c4`.
- Текст: `#f4f6f9`, вторичный `#c7ccd6`, muted `#8b92a2`.
- Радиусы 10–36 px, тёмные поверхности, тонкие бордеры `rgba(255,255,255,.08)`.
- Шрифты: **Manrope** (UI) и **Unbounded** (заголовки), self-hosted WOFF2.
- `font-display: swap`, preload основных сабсетов.

### 9.2. Лендинг

- Атмосферные орбы, сетка, зерно.
- Hero с крупной типографикой и интерактивным мокапом плеера (tilt на pointer).
- Бенто-сетка возможностей.
- Секция двух каталогов.
- Шаги «Открыл — Нашёл — Слушай».
- Финальный CTA и футер.
- Reveal-анимации через IntersectionObserver, отключаются при `prefers-reduced-motion`.

### 9.3. Плеер

- Сайдбар на desktop (≥1080 px), мобильная нижняя навигация на узких экранах.
- Верхний бар: контекст, back, случайный трек, профиль.
- Фиксированный playerbar: обложка, метаданные, лайк, управление, прогресс, громкость, очередь, expand.
- Drawer очереди справа.
- Полноэкранный «Сейчас играет»: размытый фон обложки, крупная обложка, очередь.
- Тосты, skeleton-загрузка, empty states.
- Safe-area: `env(safe-area-inset-bottom)`, `viewport-fit=cover`.
- Мобильный отступ контента учитывает высоту playerbar и нижней навигации.

### 9.4. Доступность

- `aria-label` у кнопок, `aria-hidden` у декоративных элементов.
- Skip-link.
- `aria-live` для тостов.
- Кнопки реальные `<button>`, ссылки — `<a>`.
- Контраст текста на тёмном фоне.
- Уважение `prefers-reduced-motion` на лендинге.

---

## 10. Telegram-интеграция

Обе страницы подключают `https://telegram.org/js/telegram-web-app.js`.

В `app.js` / `landing.js`:

```js
tg.ready();
tg.expand();
tg.setHeaderColor?.("#07080b");
tg.setBackgroundColor?.("#07080b");
tg.disableVerticalSwipes?.();
tg.BackButton?.onClick?.(...);
```

Всё обёрнуто в `try/catch`, потому что старые клиенты Telegram не поддерживают часть методов.

- Имя и аватар пользователя берутся из `tg.initDataUnsafe.user` и используются **только для отображения**.
- `BackButton` показывается на вложенных экранах и скрывается на главной/поиске/библиотеке.
- Haptics: `impactOccurred("light")`.
- `disableVerticalSwipes()` вызывается, чтобы полноэкранный плеер не закрывался свайпом (где поддерживается).
- Никакие данные не отправляются на сервер. `initData` не валидируется, потому что серверной части нет.

---

## 11. PWA и офлайн

### `manifest.webmanifest`

- `start_url: "./player.html"`, `scope: "./"`.
- `display: standalone`, `display_override: ["window-controls-overlay","standalone","minimal-ui"]`.
- Иконки 192/512, maskable.
- Shortcuts: поиск и любимые.

### `sw.js`

- Версия кэша: `klug-sound-v1`.
- Precache app shell: страницы, стили, JS, шрифты, иконки, OG, manifest.
- Навигация: network-first → fallback на кэш → fallback на `index.html`.
- Статика: cache-first + фоновое обновление.
- Не перехватывает cross-origin: аудио, API, обложки идут напрямую.
- Регистрация только на HTTPS и не на localhost.

При изменении файлов нужно поднять `VERSION` в `sw.js`, иначе у пользователей останется старый кэш.

---

## 12. GitHub Pages

### Ограничения

- Только статика, без серверных редиректов и секретов.
- Нет фоновых задач и прокси.
- Лимиты: ~1 ГБ на сайт, ~100 ГБ/месяц мягкого трафика, 10 сборок/час.
- HTTPS включён.
- Jekyll отключён через `.nojekyll`.
- Все пути относительные (`./...`) — работает и в корне, и в подпапке `/repo/`.
- Глубокие ссылки — только через hash.

### Деплой

1. Залить содержимое папки в репозиторий, ветка `main`.
2. Settings → Pages → Deploy from a branch → `main` / root.
3. Открыть `https://USERNAME.github.io/REPO/`.

### Open Graph

В `index.html` и `player.html` сейчас относительные `og:image`/`og:url`. После деплоя желательно заменить их на абсолютные URL, иначе Telegram/соцсети могут не показать превью.

---

## 13. Интеграция с KlugAI

Бот: **KlugAI**, автор `@lexoffpls`. Музыкальные команды бота (`music`) и мини-апп — разные интерфейсы. Мини-апп можно открыть кнопкой меню или inline-кнопкой.

### BotFather

`/mybots` → бот → **Bot Settings → Menu Button → Configure menu button** → URL:

```text
https://USERNAME.github.io/REPO/player.html
```

### aiogram

```python
from aiogram import Bot
from aiogram.types import MenuButtonWebApp, WebAppInfo

WEBAPP_URL = "https://USERNAME.github.io/REPO/player.html"

await bot.set_chat_menu_button(
    chat_id=user_id,
    menu_button=MenuButtonWebApp(
        text="Музыка",
        web_app=WebAppInfo(url=WEBAPP_URL),
    ),
)
```

Inline:

```python
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

keyboard = InlineKeyboardMarkup(
    inline_keyboard=[[
        InlineKeyboardButton(
            text="Открыть KLUG Sound",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )
    ]]
)
```

Требования Telegram: HTTPS, домен доступен снаружи, без Basic Auth. GitHub Pages подходит.

---

## 14. Проверки

Выполнено 2026-11-09 (и доработки после этого):

- `deno check` для `js/api.js`, `js/app.js`, `js/icons.js`, `js/landing.js`, `js/store.js` — без ошибок.
- Headless Chromium (Playwright):
  - лендинг и плеер открываются без JS-ошибок;
  - 18/18 reveal-блоков лендинга появляются при скролле;
  - все роуты рендерятся: home, search, search?q=, artist (Audius и iTunes), playlist, library, liked, recent, неизвестный;
  - поиск `weeknd` даёт 52 результата (40 треков, 12 артистов);
  - `shape of you` → оригинальные версии первыми, ремиксы скрыты по умолчанию;
  - `morgenshtern` → оригинальные версии, ремиксы скрыты; artist-страница Audius (`audius:bgRdX`) получает fallback-треки, iTunes-страница (`itunes:1371400021`) показывает 80 треков;
  - полный трек Audius играет (`audio.currentTime > 0`, `duration ≈ 584 с`);
  - превью iTunes играет (`duration ≈ 30 с`);
  - пауза/play, лайк, очередь, полноэкранный режим работают;
  - мобильные 390×844: горизонтального скролла нет, контент не прячется под playerbar.
- Обложки Audius иногда отдают 503/ORB в headless — срабатывает fallback с инициалами.

---

## 15. Известные ограничения

1. **Apple Music — только 30 секунд.** Полные треки требуют MusicKit, подписки и серверной логики.
2. **Audius-каталог неравномерный.** Популярные мировые хиты часто представлены каверами и ремиксами; для mainstream нужен iTunes.
3. **Удалённые треки Audius.** Стрим может вернуть 404/503; приложение показывает toast и идёт дальше.
4. **Обложки Audius.** Часть CDN-хостов может отдавать 503 или блокироваться; остаётся градиентный fallback.
5. **Нет синхронизации.** Любимые и история живут в `localStorage` конкретного браузера.
6. **Нет авторизации.** `initDataUnsafe` не проверяется; для серверных функций понадобится валидация подписи.
7. **Нет офлайн-аудио.** Service worker кэширует только оболочку, не треки.
8. **Service worker только HTTPS.** На `http://` и `localhost` регистрация отключена.
9. **Зависимость от CORS.** Если Audius/iTunes изменят заголовки, понадобится прокси на своём сервере.
10. **Open Graph.** Относительный `og:image` нужно заменить на абсолютный после деплоя.

---

## 16. Приватность и безопасность

- Нет бэкенда, аккаунтов, трекинга и аналитики.
- Наружу уходят только запросы к Audius и iTunes.
- В `localStorage` хранятся названия треков, лайки и настройки — это может быть чувствительно на общем устройстве.
- Пользовательские строки экранируются (`esc`), HTML из API не вставляется без обработки.
- Внешние ссылки на Audius/Apple открываются с `rel="noopener noreferrer"`.
- `initData` не отправляется и не считается доверенным.
- CSP не настроен, потому что GitHub Pages не позволяет управлять заголовками; при переезде на свой хостинг стоит добавить.

---

## 17. Возможные улучшения

- Свой серверный прокси для обложек и стримов Audius (решит 503/ORB и скроет app_name).
- MusicKit JS для полных треков Apple Music (нужна подписка и developer token).
- Аккаунты и синхронизация лайков/истории между устройствами.
- Пользовательские плейлисты и экспорт.
- Поиск по альбомам, жанрам и настроениям.
- Эквалайзер, crossfade, скорость воспроизведения.
- Кэширование метаданных в IndexedDB.
- Тёмная/светлая темы.
- Локализация на английский.
- Абсолютные OG-теги и sitemap после выбора домена.

---

## 18. Быстрые ссылки

- Лендинг: `./index.html`
- Плеер: `./player.html`
- Контекст: `./PROJECT_CONTEXT.md`
- Инструкция: `./README.md`
- Автор: [@lexoffpls](https://t.me/lexoffpls)
