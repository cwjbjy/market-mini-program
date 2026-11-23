#!/bin/sh
# Run from the deployment directory before the first release.
set -eu

if [ -f .env ]; then
    echo '.env already exists. Keeping the current settings.'
    exit 0
fi

umask 077
app_password=$(openssl rand -hex 32)
root_password=$(openssl rand -hex 32)
temp_file=$(mktemp .env.tmp.XXXXXXXX)
trap 'rm -f -- "$temp_file"' 0
trap 'exit 1' HUP INT TERM

cat > "$temp_file" <<EOF
MARKET_MYSQL_USER=market
MARKET_MYSQL_PASSWORD=$app_password
MARKET_MYSQL_ROOT_PASSWORD=$root_password
MARKET_HOST_PORT=9001
EOF

# Publish the complete file without replacing a file created by another process.
if ln -T -- "$temp_file" .env 2>/dev/null; then
    echo 'Created .env with separate MySQL application and root passwords.'
elif [ -f .env ]; then
    echo '.env already exists. Keeping the current settings.'
else
    echo 'Could not create .env in the current directory.' >&2
    exit 1
fi
