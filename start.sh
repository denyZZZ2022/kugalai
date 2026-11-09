#!/usr/bin/env bash
# Запуск KLUG Sound: бэкенд + cloudflared-туннель (+ опционально бот)
# Использование:
#   ./start.sh            # бэкенд + туннель
#   RUN_BOT=1 ./start.sh  # + бот (путь задаётся в BOT_DIR/BOT_CMD)

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
VENV="$BACKEND_DIR/venv2"
PORT="${KLUG_PORT:-8800}"
BOT_DIR="${BOT_DIR:-/home/lexoffpls/mybot}"
BOT_CMD="${BOT_CMD:-python3 bot.py}"

if [[ ! -d "$VENV" ]]; then
  echo "Создаю venv2..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

# --- бэкенд ---
echo "Запускаю бэкенд на порту $PORT..."
KLUG_PORT="$PORT" "$VENV/bin/python" "$BACKEND_DIR/server.py" > /tmp/klug-backend.log 2>&1 &
BACKEND_PID=$!

# ждём готовности
for i in {1..20}; do
  if curl -s "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "Бэкенд готов: http://127.0.0.1:$PORT"
    break
  fi
  sleep 1
done

# --- туннель ---
echo "Запускаю cloudflared-туннель..."
cloudflared tunnel --url "http://localhost:$PORT" > /tmp/klug-tunnel.log 2>&1 &
TUNNEL_PID=$!

# ждём URL
TUNNEL_URL=""
for i in {1..30}; do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/klug-tunnel.log | head -1)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

echo ""
echo "============================================================"
echo "Туннель:  $TUNNEL_URL"
echo "Бэкенд:   http://127.0.0.1:$PORT"
echo "Сайт:     $TUNNEL_URL"
echo "Локально: http://localhost:$PORT"
echo "============================================================"
echo "Не закрывай этот терминал (Ctrl+C — остановить всё)."

# --- бот (опционально) ---
BOT_PID=""
if [[ "${RUN_BOT:-0}" == "1" ]]; then
  echo "Запускаю бота из $BOT_DIR..."
  (
    cd "$BOT_DIR"
    source .venv/bin/activate 2>/dev/null || true
    exec $BOT_CMD
  ) > /tmp/klug-bot.log 2>&1 &
  BOT_PID=$!
fi

cleanup() {
  echo ""
  echo "Останавливаю..."
  kill "$BACKEND_PID" "$TUNNEL_PID" 2>/dev/null
  [[ -n "$BOT_PID" ]] && kill "$BOT_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# держим скрипт живым
wait "$BACKEND_PID" "$TUNNEL_PID"