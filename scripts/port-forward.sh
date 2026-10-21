#!/usr/bin/env bash
#
# Serve the demo console on localhost, bypassing the Route.
#
#   scripts/port-forward.sh          # console on http://localhost:8888
#
# Useful when the cluster Route is not reachable from the room you are
# presenting in (captive-portal wifi, VPN-only cluster), or when you want to
# edit the UI locally and reload without a redeploy.
#
# Ctrl-C to stop.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PORT="${PORT:-8888}"
require_login

step "Forwarding the demo console to http://localhost:$PORT"
info "The console proxies /v1 through the same pod, so routing, guardrails and"
info "the cache all behave exactly as they do over the Route."
printf '\n'

exec oc port-forward -n "$NS" svc/semantic-router-demo-ui "$PORT:80"
