#!/usr/bin/env bash
# Shared helpers. Sourced by the other scripts; not meant to be run directly.

set -euo pipefail

NS="${NS:-models}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

QWEN_MODEL="${QWEN_MODEL:-qwen-25-7b}"
PHI_MODEL="${PHI_MODEL:-phi-3-mini-chat}"
QWEN_STABLE_SVC="${QWEN_STABLE_SVC:-${QWEN_MODEL}-predictor-stable}"
PHI_STABLE_SVC="${PHI_STABLE_SVC:-${PHI_MODEL}-predictor-stable}"

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[36m'; C_DIM=$'\033[2m';  C_OFF=$'\033[0m'; C_B=$'\033[1m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_DIM=''; C_OFF=''; C_B=''
fi

step() { printf '\n%s==>%s %s%s%s\n' "$C_BLU" "$C_OFF" "$C_B" "$*" "$C_OFF"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn() { printf '    %s!%s %s\n' "$C_YLW" "$C_OFF" "$*" >&2; }
die()  { printf '\n%serror:%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not on PATH."
}

require_login() {
  require_cmd oc
  oc whoami >/dev/null 2>&1 \
    || die "Not logged in to a cluster. Run: oc login --token=<token> --server=<api-url>"
}

router_route_host() {
  oc get route semantic-router -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null || true
}

demo_route_host() {
  oc get route semantic-router-demo -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null || true
}
