#!/usr/bin/env bash
# §13 D3: deploy origin/live on the server (run as ubuntu, from any folder)
set -euo pipefail

LOCK_FILE="${TMPDIR:-/tmp}/slsea-deploy.lock"
HEALTH_URL='http://localhost:3000/'
HEALTH_SECONDS=30

log() {
  printf '%s deploy: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# §13 D3: nvm is not loaded by a non-interactive login shell
load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    set +eu
    . "$NVM_DIR/nvm.sh"
    set -eu
  fi
  command -v npm >/dev/null || { log 'npm not found'; exit 1; }
  command -v pm2 >/dev/null || { log 'pm2 not found'; exit 1; }
}

# §13 D3: ORIGIN_SECRET from .env, never printed
origin_secret() {
  local line
  line=$(grep -E '^ORIGIN_SECRET=' .env 2>/dev/null | tail -n 1 || true)
  line=${line#ORIGIN_SECRET=}
  line=${line%$'\r'}
  line=${line#[\"\']}
  line=${line%[\"\']}
  printf '%s' "$line"
}

# §13 D3: header on stdin, so the secret is not in the process list
health_status() {
  local secret
  secret=$(origin_secret)
  if [ -n "$secret" ]; then
    printf 'X-Origin-Secret: %s\n' "$secret" |
      curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H @- "$HEALTH_URL" || true
  else
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true
  fi
}

health_check() {
  local deadline=$((SECONDS + HEALTH_SECONDS))
  local status
  while [ "$SECONDS" -lt "$deadline" ]; do
    status=$(health_status)
    if [ "$status" = '200' ]; then
      return 0
    fi
    sleep 1
  done
  log "health check got ${status:-no answer}, expected 200"
  return 1
}

rollback() {
  log "rolling back to $PREVIOUS"
  git reset --hard "$PREVIOUS"
  log 'rollback: npm ci --omit=dev'
  npm ci --omit=dev
  log 'rollback: pm2 startOrReload'
  pm2 startOrReload ecosystem.config.cjs
  log "rolled back to $PREVIOUS; deploy failed"
  exit 1
}

# §13 D3: any failure after the merge rolls back
stage() {
  local name=$1
  shift
  log "$name"
  if ! "$@"; then
    log "$name failed"
    rollback
  fi
}

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  log "repository $(pwd)"

  exec 9>"$LOCK_FILE"
  log 'waiting for the deploy lock'
  flock -w 600 9 || { log 'another deploy holds the lock'; exit 1; }

  load_nvm

  # §13 D3: rollback (reset --hard) never throws away local changes
  if ! git diff --quiet HEAD; then
    log 'tracked files have local changes; not deploying'
    exit 1
  fi

  PREVIOUS=$(git rev-parse HEAD)
  log "current commit $PREVIOUS"

  log 'git fetch origin live'
  git fetch origin live
  local target
  target=$(git rev-parse origin/live)
  if [ "$target" = "$PREVIOUS" ]; then
    log 'up to date'
    exit 0
  fi

  log "git merge --ff-only origin/live ($target)"
  git merge --ff-only origin/live

  stage 'npm ci --omit=dev' npm ci --omit=dev
  stage 'pm2 startOrReload' pm2 startOrReload ecosystem.config.cjs
  stage 'pm2 save' pm2 save
  stage "health check (up to ${HEALTH_SECONDS} s)" health_check

  log "deployed $(git rev-parse HEAD)"
}

# §13 D3: main is parsed in full first, so the merge may replace this file
main "$@"
exit 0
