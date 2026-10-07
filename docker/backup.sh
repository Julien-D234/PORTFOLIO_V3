#!/usr/bin/env bash
# Sauvegarde quotidienne de Postgres (cron sur le VPS). Rotation : 14 jours.
#   0 3 * * * /srv/portfolio/docker/backup.sh >> /srv/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=/srv/backups
mkdir -p "$DEST"; umask 077
set -a; . ./.env; set +a
F="$DEST/portfolio-$(date +%F-%H%M).sql.gz"
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$F"
[ -s "$F" ] || { echo "sauvegarde vide" >&2; rm -f "$F"; exit 1; }
find "$DEST" -name 'portfolio-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) OK $F"
