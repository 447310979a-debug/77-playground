#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
qiqi_node="$HOME/.local/bin/node"
if [[ ! -x "$qiqi_node" ]]; then qiqi_node="$(command -v node)"; fi
exec "$qiqi_node" scripts/preview-https.mjs
