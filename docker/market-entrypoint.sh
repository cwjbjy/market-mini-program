#!/bin/sh
set -eu

install -d -o market -g market "$MARKET_UPLOAD_DIR"
# Files uploaded by an earlier image may be private to its former runtime UID.
find "$MARKET_UPLOAD_DIR" -maxdepth 1 -type f ! -user market \
    -exec chown --no-dereference market:market {} +
exec setpriv --reuid=market --regid=market --init-groups -- "$@"
