#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/grahamhau/Documents/Loom"
NODE_PATH_PREFIX="/opt/homebrew/opt/node@22/bin"
export PATH="$NODE_PATH_PREFIX:$PATH"
export PORT="${PORT:-3000}"
export HOST="${HOST:-127.0.0.1}"
export NODE_ENV="${NODE_ENV:-development}"
export LOOM_SYNC_REMOTE_DB_ON_START="${LOOM_SYNC_REMOTE_DB_ON_START:-true}"
export LOOM_SYNC_REMOTE_DB_INTERVAL_SECONDS="${LOOM_SYNC_REMOTE_DB_INTERVAL_SECONDS:-120}"

cd "$ROOT"
mkdir -p logs data
RESTART_MARKER="$ROOT/logs/local-server.restart"

if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env.local"
  set +a
elif [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env"
  set +a
fi

export DATABASE_PATH="${DATABASE_PATH:-$ROOT/data/loom.remote.snapshot.sqlite}"
SYNC_SNAPSHOT_PATH="$ROOT/data/loom.remote.snapshot.pending.sqlite"

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${VITE_PID:-}" ] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "${SYNC_PID:-}" ] && kill -0 "$SYNC_PID" 2>/dev/null; then
    kill "$SYNC_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

sync_remote_db() {
  rm -f "$SYNC_SNAPSHOT_PATH" "$SYNC_SNAPSHOT_PATH-wal" "$SYNC_SNAPSHOT_PATH-shm" "$SYNC_SNAPSHOT_PATH.next" "$SYNC_SNAPSHOT_PATH.next-wal" "$SYNC_SNAPSHOT_PATH.next-shm"
  npm run db:pull-remote -- --out "$SYNC_SNAPSHOT_PATH" --backup false >> logs/local-db-sync.log 2>&1
}

start_server() {
  npm run server:dev >> logs/local-server.log 2>&1 &
  SERVER_PID=$!
}

install_synced_db() {
  if [ ! -f "$SYNC_SNAPSHOT_PATH" ]; then
    return 0
  fi
  rm -f "$DATABASE_PATH-wal" "$DATABASE_PATH-shm"
  mv "$SYNC_SNAPSHOT_PATH" "$DATABASE_PATH"
  rm -f "$SYNC_SNAPSHOT_PATH-wal" "$SYNC_SNAPSHOT_PATH-shm"
  "$NODE_PATH_PREFIX/node" --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(process.env.DATABASE_PATH, { readonly: true, fileMustExist: true }); const check = db.pragma('quick_check', { simple: true }); db.close(); if (check !== 'ok') { throw new Error('installed local snapshot quick_check failed: ' + check); }"
  "$NODE_PATH_PREFIX/node" scripts/normalize-field-tags.js --db "$DATABASE_PATH" >> logs/local-db-sync.log 2>&1
}

restart_server() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  install_synced_db
  start_server
}

if [ "$LOOM_SYNC_REMOTE_DB_ON_START" != "false" ] && [ ! -f "$DATABASE_PATH" ]; then
  if sync_remote_db; then
    install_synced_db
  fi
fi

if [ "${LOOM_SYNC_REMOTE_DB_INTERVAL_SECONDS:-0}" -gt 0 ]; then
  (
    if [ "$LOOM_SYNC_REMOTE_DB_ON_START" != "false" ] && [ -f "$DATABASE_PATH" ]; then
      if sync_remote_db; then
        touch "$RESTART_MARKER"
      fi
    fi
    while true; do
      sleep "$LOOM_SYNC_REMOTE_DB_INTERVAL_SECONDS"
      if sync_remote_db; then
        touch "$RESTART_MARKER"
      fi
    done
  ) &
  SYNC_PID=$!
fi

start_server

npm run dev >> logs/local-vite.log 2>&1 &
VITE_PID=$!

while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID" || exit $?
    exit 1
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    wait "$VITE_PID" || exit $?
    exit 1
  fi
  if [ -f "$RESTART_MARKER" ]; then
    rm -f "$RESTART_MARKER"
    restart_server
  fi
  sleep 5
done
