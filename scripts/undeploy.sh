#!/usr/bin/env bash
#
# Tear the demo down.
#
#   scripts/undeploy.sh              # router + console, models left running
#   scripts/undeploy.sh --all        # everything including the models
#   scripts/undeploy.sh --all --pvcs # everything including the model-cache PVCs
#
# The models are kept by default because they are the slow part to rebuild —
# redeploying the router against existing models takes a couple of minutes,
# redeploying the models takes the better part of an hour.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ALL=false
PVCS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)     ALL=true ;;
    --pvcs)    PVCS=true ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         die "Unknown argument: $1" ;;
  esac
  shift
done

require_login

step "About to delete from namespace $NS on $(oc whoami --show-server)"
info "demo console   yes"
info "router         yes"
info "models         $([[ "$ALL" == true ]] && echo yes || echo 'no (keep)')"
info "router PVCs    $([[ "$PVCS" == true ]] && echo yes || echo 'no (keep)')"
printf '\n    Type %syes%s to continue: ' "$C_B" "$C_OFF"
read -r confirm
[[ "$confirm" == "yes" ]] || die "Aborted."

step "Removing the demo console"
oc delete -k "$REPO_ROOT/deploy/demo-ui" -n "$NS" --ignore-not-found

step "Removing the router"
# --print renders with the IP placeholders substituted; delete does not care
# about the values, only the object identities.
"$REPO_ROOT/scripts/wire-endpoints.sh" --print 2>/dev/null \
  | oc delete -n "$NS" -f - --ignore-not-found \
  || oc delete -n "$NS" deployment/semantic-router svc/semantic-router route/semantic-router \
       cm/semantic-router-config cm/semantic-router-envoy-config sa/semantic-router --ignore-not-found

if [[ "$PVCS" == true ]]; then
  step "Removing router PVCs (classifier models will be re-downloaded next deploy)"
  oc delete pvc semantic-router-models semantic-router-cache -n "$NS" --ignore-not-found
fi

if [[ "$ALL" == true ]]; then
  step "Removing the model backends"
  oc delete -k "$REPO_ROOT/deploy/models" -n "$NS" --ignore-not-found
fi

step "Done"
oc get pods -n "$NS" 2>/dev/null || true
