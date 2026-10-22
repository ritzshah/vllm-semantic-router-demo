#!/usr/bin/env bash
#
# Apply the router overlay, restarting the router only if its config changed.
#
#   scripts/apply-router.sh            # validate, apply, restart if needed
#   scripts/apply-router.sh --print    # render the manifests, apply nothing
#
# Env: NS (default "models")
#
# This used to be wire-endpoints.sh, which resolved backend ClusterIPs and
# substituted them into the config. That is no longer necessary: v0.3 routes by
# model name through per-model Envoy clusters, and those clusters are
# STRICT_DNS, so the backends are Service names that Envoy resolves itself. A
# model redeploy needs no re-wiring.
#
# The router reads its config from a mounted path and the ConfigMap name is
# stable (no kustomize hash suffix), so nothing would otherwise restart it
# after an edit — hence the content hash below.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PRINT_ONLY=false
[[ "${1:-}" == "--print" ]] && PRINT_ONLY=true

if [[ "$PRINT_ONLY" == true ]]; then
  oc kustomize "$REPO_ROOT/deploy/router"
  exit 0
fi

require_login

step "Validating the router config"
"$REPO_ROOT/scripts/validate-config.sh" || die "Config validation failed — not applying."

# `|| true`: on a first deploy the ConfigMap does not exist and `oc get` exits
# non-zero, which under `set -euo pipefail` would abort here silently, because
# the failure is inside a command substitution on an assignment.
config_hash() {
  oc get cm semantic-router-config -n "$NS" -o jsonpath='{.data.config\.yaml}' 2>/dev/null \
    | shasum | awk '{print $1}' || true
}
envoy_hash() {
  oc get cm semantic-router-envoy-config -n "$NS" -o jsonpath='{.data.envoy\.yaml}' 2>/dev/null \
    | shasum | awk '{print $1}' || true
}

before="$(config_hash)/$(envoy_hash)"

step "Applying router manifests"
oc apply -k "$REPO_ROOT/deploy/router" -n "$NS"

after="$(config_hash)/$(envoy_hash)"

if [[ -z "${before%%/*}" ]]; then
  info "Router config created for the first time."
elif [[ "$before" != "$after" ]]; then
  step "Config changed — restarting the router"
  oc rollout restart deployment/semantic-router -n "$NS"
  oc rollout status deployment/semantic-router -n "$NS" --timeout=15m
  ok "Router restarted."
else
  ok "Config unchanged — no restart needed."
fi
