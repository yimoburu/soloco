#!/bin/sh
# Bootstrap one private runtime. Never install into the company or alter user config.
set -eu
company_plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
company_data=${COMPANY_PLUGIN_DATA:-${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-${XDG_CACHE_HOME:-$HOME/.cache}/ai-operated-startup}}}
company_node=$(command -v node || true)
if [ -n "$company_node" ] && "$company_node" --no-warnings -e 'require("node:sqlite")' >/dev/null 2>&1; then
  exec "$company_node" --no-warnings "$company_plugin_root/runtime/main.mjs" "$@"
fi
company_version=v22.22.0
case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) company_platform=darwin-arm64; company_sha=5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640;;
  Darwin/x86_64) company_platform=darwin-x64; company_sha=5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce;;
  Linux/aarch64|Linux/arm64) company_platform=linux-arm64; company_sha=25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be;;
  Linux/x86_64) company_platform=linux-x64; company_sha=c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744;;
  *) echo 'Company currently supports macOS and Linux on ARM64/x64.' >&2; exit 1;;
esac
company_name=node-$company_version-$company_platform
company_node="$company_data/$company_name/bin/node"
if [ ! -x "$company_node" ]; then
  mkdir -p "$company_data"
  company_lock="$company_data/.runtime-install-lock"
  if ! mkdir "$company_lock" 2>/dev/null; then
    company_wait=0
    while [ ! -x "$company_node" ] && [ "$company_wait" -lt 60 ]; do
      sleep 1
      company_wait=$((company_wait + 1))
    done
    [ -x "$company_node" ] || { echo "Company runtime setup is incomplete. Retry setup; inspect $company_lock if the previous installer stopped." >&2; exit 1; }
    exec "$company_node" --no-warnings "$company_plugin_root/runtime/main.mjs" "$@"
  fi
  company_stage=$(mktemp -d "$company_data/.node-XXXXXX")
  trap 'rm -rf "$company_stage"; rmdir "$company_lock" 2>/dev/null || true' EXIT
  trap 'exit 1' HUP INT TERM
  echo 'Company: preparing its private Node runtime (one-time download from nodejs.org).' >&2
  curl --fail --silent --show-error --location --proto '=https' --connect-timeout 10 --max-time 120 "https://nodejs.org/dist/$company_version/$company_name.tar.gz" -o "$company_stage/node.tar.gz"
  if command -v sha256sum >/dev/null 2>&1; then
    company_actual=$(sha256sum "$company_stage/node.tar.gz" | cut -d ' ' -f 1)
  else
    company_actual=$(shasum -a 256 "$company_stage/node.tar.gz" | cut -d ' ' -f 1)
  fi
  [ "$company_actual" = "$company_sha" ] || { echo 'Company runtime checksum mismatch.' >&2; exit 1; }
  tar -xzf "$company_stage/node.tar.gz" -C "$company_stage"
  # Publish only after the archive checksum and extraction succeed.
  if [ ! -d "$company_data/$company_name" ]; then
    mv "$company_stage/$company_name" "$company_data/$company_name"
  fi
  rm -rf "$company_stage"
  rmdir "$company_lock"
  trap - EXIT HUP INT TERM
fi
exec "$company_node" --no-warnings "$company_plugin_root/runtime/main.mjs" "$@"
