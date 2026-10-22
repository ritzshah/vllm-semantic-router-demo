#!/usr/bin/env bash
#
# One command to stand up the whole demo.
#
#   scripts/deploy.sh                 # models + router + demo console
#   scripts/deploy.sh --skip-models   # models already exist, just the router + UI
#   scripts/deploy.sh --ui-only       # re-push the console after editing use cases
#
# Env:
#   NS=models                 target namespace
#   MODEL_TIMEOUT=45m         how long to wait for the InferenceServices
#
# Safe to re-run: every step is an apply or a wait, nothing is deleted.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_TIMEOUT="${MODEL_TIMEOUT:-45m}"
SKIP_MODELS=false
UI_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-models) SKIP_MODELS=true ;;
    --ui-only)     UI_ONLY=true ;;
    -h|--help)     sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)             die "Unknown argument: $1" ;;
  esac
  shift
done

require_login
require_cmd sed

step "Target"
info "cluster    $(oc whoami --show-server)"
info "user       $(oc whoami)"
info "namespace  $NS"

# ---------------------------------------------------------------- UI only --

if [[ "$UI_ONLY" == true ]]; then
  step "Applying the demo console"
  oc apply -k "$REPO_ROOT/deploy/demo-ui" -n "$NS"
  oc rollout status deployment/semantic-router-demo-ui -n "$NS" --timeout=5m
  ok "Console updated: https://$(demo_route_host)"
  exit 0
fi

# ----------------------------------------------------------------- models --

if [[ "$SKIP_MODELS" == false ]]; then
  step "Preflight: GPU capacity"
  # `|| true`: grep exits non-zero when no node reports a GPU, which under
  # `set -euo pipefail` would abort the preflight instead of warning about it.
  gpus="$(oc get nodes -o jsonpath='{range .items[*]}{.status.capacity.nvidia\.com/gpu}{"\n"}{end}' \
          | grep -E '^[0-9]+$' | awk '{s+=$1} END {print s+0}' || true)"
  gpus="${gpus:-0}"
  if [[ "$gpus" -lt 2 ]]; then
    warn "Found $gpus allocatable NVIDIA GPU(s). This demo asks for 2 (one per model)."
    warn "Both InferenceServices will stay Pending until there is capacity."
  else
    ok "$gpus NVIDIA GPU(s) visible across the cluster."
  fi

  step "Deploying model backends (Qwen-2.5-7B, Phi-3-mini)"
  oc apply -k "$REPO_ROOT/deploy/models"

  step "Waiting for models to become Ready (up to $MODEL_TIMEOUT)"
  info "First run pulls both models from Hugging Face — this is the slow part."
  for m in "$QWEN_MODEL" "$PHI_MODEL"; do
    if oc wait --for=condition=Ready "inferenceservice/$m" -n "$NS" --timeout="$MODEL_TIMEOUT"; then
      ok "$m is Ready"
    else
      oc get inferenceservice "$m" -n "$NS" -o wide || true
      oc get pods -n "$NS" -l "serving.kserve.io/inferenceservice=$m" || true
      die "$m did not become Ready. Inspect the predictor pod above, then re-run with --skip-models once it is up."
    fi
  done
else
  info "Skipping model deployment (--skip-models)."
fi

# ----------------------------------------------------------------- router --

step "Deploying the semantic router"
# wire-endpoints.sh resolves the backend ClusterIPs, substitutes them for the
# placeholders in the router ConfigMap, applies the whole router overlay, and
# restarts the router only if the resulting config differs from what is live.
"$REPO_ROOT/scripts/wire-endpoints.sh"

step "Waiting for the router to roll out"
info "Cold start downloads ~4 GB of ModernBERT classifiers onto the PVC, then"
info "loads four models on CPU. Allow several minutes the first time."
if ! oc rollout status deployment/semantic-router -n "$NS" --timeout=20m; then
  oc get pods -n "$NS" -l app=semantic-router
  oc logs -n "$NS" deploy/semantic-router -c model-downloader --tail=40 2>/dev/null || true
  oc logs -n "$NS" deploy/semantic-router -c semantic-router --tail=40 2>/dev/null || true
  die "Router did not roll out. Logs above."
fi
ok "Router is running."

# ---------------------------------------------------------------- console --

step "Deploying the demo console"
oc apply -k "$REPO_ROOT/deploy/demo-ui" -n "$NS"
oc rollout status deployment/semantic-router-demo-ui -n "$NS" --timeout=5m
ok "Console is running."

# ------------------------------------------------------------------ done ---

DEMO_HOST="$(demo_route_host)"
ROUTER_HOST="$(router_route_host)"

step "Done"
printf '\n'
printf '  %sDemo console%s   https://%s\n' "$C_B" "$C_OFF" "$DEMO_HOST"
printf '  %sRouter API%s     https://%s/v1/chat/completions\n' "$C_B" "$C_OFF" "$ROUTER_HOST"
printf '\n'
printf '  Validate every use case from the terminal before you present:\n'
printf '    %sscripts/smoke-test.sh%s\n' "$C_DIM" "$C_OFF"
printf '\n'
