#!/usr/bin/env bash
#
# Render the router ConfigMap with the live backend ClusterIPs.
#
# The router config in Git carries __QWEN_ENDPOINT_IP__ / __PHI_ENDPOINT_IP__
# placeholders rather than real addresses, because Envoy's ORIGINAL_DST cluster
# dials the x-vsr-destination-endpoint header value directly and performs no DNS
# resolution — so the config genuinely needs IPs, and IPs are cluster-specific.
#
# Usage:
#   scripts/wire-endpoints.sh            # apply to the cluster and restart if changed
#   scripts/wire-endpoints.sh --print    # print the rendered manifests, apply nothing
#
# Env: NS (default "models")

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PRINT_ONLY=false
[[ "${1:-}" == "--print" ]] && PRINT_ONLY=true

require_login

step "Resolving backend ClusterIPs in namespace $NS"
QWEN_IP="$(resolve_endpoint_ip "$QWEN_STABLE_SVC" "$QWEN_MODEL")"
PHI_IP="$(resolve_endpoint_ip "$PHI_STABLE_SVC" "$PHI_MODEL")"
ok "$QWEN_MODEL  -> $QWEN_IP:8080"
ok "$PHI_MODEL -> $PHI_IP:8080"

render() {
  oc kustomize "$REPO_ROOT/deploy/router" \
    | sed -e "s/__QWEN_ENDPOINT_IP__/${QWEN_IP}/g" \
          -e "s/__PHI_ENDPOINT_IP__/${PHI_IP}/g"
}

if [[ "$PRINT_ONLY" == true ]]; then
  render
  exit 0
fi

# Hash the live config so we only bounce the router when the content actually
# changed. The ConfigMap name is stable (no kustomize hash suffix) because the
# router reads it from a mounted path, so nothing else would trigger a restart.
before="$(oc get cm semantic-router-config -n "$NS" -o jsonpath='{.data.config\.yaml}' 2>/dev/null | shasum | awk '{print $1}')"

step "Applying router manifests"
render | oc apply -n "$NS" -f -

after="$(oc get cm semantic-router-config -n "$NS" -o jsonpath='{.data.config\.yaml}' | shasum | awk '{print $1}')"

if [[ -n "$before" && "$before" != "$after" ]]; then
  step "Router config changed — restarting the router"
  oc rollout restart deployment/semantic-router -n "$NS"
  oc rollout status deployment/semantic-router -n "$NS" --timeout=15m
  ok "Router restarted with the new backend addresses."
elif [[ -z "$before" ]]; then
  info "Router config created for the first time."
else
  ok "Router config unchanged — no restart needed."
fi
