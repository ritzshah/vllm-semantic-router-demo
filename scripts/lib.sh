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

# Resolve the ClusterIP the router should dial for a model.
#
# The stable Service is preferred because its IP survives InferenceService
# redeploys. If its selector does not match any pod — which happens when a
# different KServe version labels predictor pods differently — fall back to the
# predictor Service that KServe generated, and say so loudly, because that IP
# will change the next time the InferenceService is updated.
resolve_endpoint_ip() {
  local stable_svc="$1" model="$2" ip eps

  ip="$(oc get svc "$stable_svc" -n "$NS" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)"
  eps="$(oc get endpoints "$stable_svc" -n "$NS" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)"

  if [[ -n "$ip" && -n "$eps" ]]; then
    printf '%s' "$ip"
    return 0
  fi

  if [[ -n "$ip" && -z "$eps" ]]; then
    warn "Service $stable_svc exists but has no endpoints — its selector does not match the predictor pods."
    warn "Predictor pod labels in $NS:"
    oc get pods -n "$NS" -l "serving.kserve.io/inferenceservice=$model" \
      -o jsonpath='{range .items[*]}      {.metadata.name}{"\t"}{.metadata.labels}{"\n"}{end}' >&2 2>/dev/null || true
  fi

  local fallback="${model}-predictor"
  ip="$(oc get svc "$fallback" -n "$NS" -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)"
  [[ -n "$ip" ]] || die "Could not resolve a ClusterIP for $model (tried $stable_svc and $fallback)."

  warn "Falling back to $fallback ($ip). This IP changes when the InferenceService is redeployed —"
  warn "re-run scripts/wire-endpoints.sh after any model redeploy."
  printf '%s' "$ip"
}

router_route_host() {
  oc get route semantic-router -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null || true
}

demo_route_host() {
  oc get route semantic-router-demo -n "$NS" -o jsonpath='{.spec.host}' 2>/dev/null || true
}
