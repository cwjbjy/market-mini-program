#!/bin/bash
set -euo pipefail

mongo_pid=''
backend_pid=''
mongo_uri='mongodb://127.0.0.1:27017/admin?directConnection=true&serverSelectionTimeoutMS=1000'

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
    stop_child "$mongo_pid"
}

wait_for_mongo() {
    local check="$1"
    local deadline=$((SECONDS + 90))
    until mongosh "$mongo_uri" --quiet --norc --eval "$check" >/dev/null 2>&1; do
        if ! kill -0 "$mongo_pid" 2>/dev/null || (( SECONDS >= deadline )); then
            echo 'MongoDB did not become ready.' >&2
            return 1
        fi
        sleep 1
    done
}

trap stop_services EXIT
trap 'exit 0' TERM INT

chown mongodb:mongodb /data/db
mkdir -p "$MARKET_UPLOAD_DIR"
chown market:market "$MARKET_UPLOAD_DIR"

gosu mongodb mongod --dbpath /data/db --replSet rs0 --bind_ip 127.0.0.1 &
mongo_pid=$!

wait_for_mongo 'quit(db.runCommand({ping: 1}).ok ? 0 : 1)'
mongosh "$mongo_uri" --quiet --norc --eval '
    try {
        rs.status();
    } catch (error) {
        if (error.code !== 94) throw error;
        const result = rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]});
        if (!result.ok) throw new Error(JSON.stringify(result));
    }
'
wait_for_mongo 'quit(db.hello().isWritablePrimary ? 0 : 1)'

gosu market "$@" &
backend_pid=$!

while kill -0 "$mongo_pid" 2>/dev/null && kill -0 "$backend_pid" 2>/dev/null; do
    sleep 1
done
echo 'MongoDB or the backend exited unexpectedly.' >&2
exit 1
