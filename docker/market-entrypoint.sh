#!/bin/bash
set -euo pipefail

: "${MARKET_MYSQL_PASSWORD:?Set MARKET_MYSQL_PASSWORD for the application user}"
: "${MARKET_MYSQL_ROOT_PASSWORD:?Set MARKET_MYSQL_ROOT_PASSWORD for MySQL initialization}"
export MYSQL_PASSWORD="$MARKET_MYSQL_PASSWORD"
export MYSQL_ROOT_PASSWORD="$MARKET_MYSQL_ROOT_PASSWORD"
export MYSQL_USER="${MARKET_MYSQL_USER:-market}"

mysql_pid=''
backend_pid=''

stop_child() {
    local pid="$1"
    if [[ -n "$pid" ]]; then
        kill -TERM "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
    fi
}

stop_services() {
    trap '' TERM INT
    stop_child "$backend_pid"
    stop_child "$mysql_pid"
}

trap stop_services EXIT
trap 'exit 0' TERM INT

install -d -o market -g market "$MARKET_UPLOAD_DIR"

docker-entrypoint.sh mysqld --bind-address=127.0.0.1 --mysqlx=OFF &
mysql_pid=$!

deadline=$((SECONDS + 120))
until MYSQL_PWD="$MYSQL_PASSWORD" mysql --connect-timeout=2 --protocol=TCP -h 127.0.0.1 \
        -u "$MYSQL_USER" "$MYSQL_DATABASE" -e 'SELECT 1' >/dev/null 2>&1; do
    if ! kill -0 "$mysql_pid" 2>/dev/null || (( SECONDS >= deadline )); then
        echo 'MySQL did not become ready. Check the database volume and credentials.' >&2
        exit 1
    fi
    sleep 1
done

gosu market "$@" &
backend_pid=$!

while kill -0 "$mysql_pid" 2>/dev/null && kill -0 "$backend_pid" 2>/dev/null; do
    sleep 1
done
echo 'MySQL or the backend exited unexpectedly.' >&2
exit 1
