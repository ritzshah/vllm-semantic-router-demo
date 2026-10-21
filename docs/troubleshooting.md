# Troubleshooting

## Quick triage

```bash
oc get pods -n models
oc get inferenceservice -n models
oc get route -n models
oc logs -n models deploy/semantic-router -c semantic-router --tail=100
oc logs -n models deploy/semantic-router -c envoy-proxy  --tail=100
```

The Envoy access log is the fastest way to see what happened to a request. It
is formatted to show everything that matters on one line:

```
status=200 total_ms=2841 upstream_ms=2790 cluster=vllm_dynamic_cluster vsr=172.30.171.217:8080 method=POST path=/v1/chat/completions
```

- `vsr=` is the backend the router picked. Empty means the router did not set a
  destination — a guardrail block or a cache hit.
- `cluster=vllm_dynamic_cluster` means it went to a model.
- `total_ms` far above `upstream_ms` points at the router's classification pass,
  not at the model.

---

## `503 no healthy upstream`

The single most common failure, and almost always the backend addresses.

```bash
# What does the router think the backends are?
oc get cm semantic-router-config -n models -o jsonpath='{.data.config\.yaml}' \
  | grep -A2 'vllm_endpoints' -A8

# What are they actually?
oc get svc -n models | grep stable
```

If the config still contains `__QWEN_ENDPOINT_IP__`, the manifests were applied
directly rather than through the wiring script:

```bash
./scripts/wire-endpoints.sh
```

If the IPs are real but stale — a model was redeployed and its stable Service
recreated — the same command fixes it.

**Do not substitute a DNS name for the IP.** Envoy's `ORIGINAL_DST` cluster
dials the header value literally and performs no resolution; a hostname there
produces exactly this error. See
[architecture.md](architecture.md#why-original_dst-and-why-the-ip-placeholders).

### Stable Service has no endpoints

`wire-endpoints.sh` warns about this and falls back to the KServe-generated
predictor Service. The cause is a label mismatch: the stable Services select
`app: isvc.<name>-predictor`, which some KServe versions do not set.

```bash
oc get pods -n models --show-labels | grep predictor
```

Find the label your predictor pods actually carry and update the `selector` in
[`deploy/models/stable-services.yaml`](../deploy/models/stable-services.yaml).
The fallback works, but its IP changes on every model redeploy, so fixing the
selector is worth it.

---

## Routing to the wrong model

Not a breakage. Classification is probabilistic, and the thresholds in the
config were tuned on one cluster with one pair of models.

First, find out what is actually firing:

```bash
oc logs -n models deploy/semantic-router -c semantic-router --since=5m \
  | grep -Ei 'decision|signal|category|similarity'
```

Then adjust in [`03-configmap-router.yaml`](../deploy/router/03-configmap-router.yaml):

| Symptom | Where to look |
|---|---|
| Everything lands on one model | `signals.complexity.code_complexity.threshold` — at 0.1 this fires readily; raise it to make the complexity decisions more selective |
| A prompt should route to Qwen but does not | Add a term to `code_keywords` / `math_keywords`, or add a phrase to the relevant `signals.embeddings.candidates` list |
| Embedding signals never fire | Lower the signal's `threshold` from 0.68 |
| The category classifier dominates | Raise `classifier.category_model.threshold` from 0.10 |
| A guardrail is too eager | Raise the `jailbreak_standard` threshold from 0.35, or the `pii_detected` threshold from 0.25 |
| A guardrail misses | Lower those thresholds, or add the phrase to the matching `keyword_rules` entry |

Apply and restart:

```bash
./scripts/wire-endpoints.sh     # re-applies and restarts only if the config changed
./scripts/smoke-test.sh
```

Changing a priority re-orders the whole ladder. Keep the three-digit gap
between guardrails (1000+) and routing (≤300) so a routing change can never
outrank a safety rule.

---

## Router pod will not start

### Stuck in `Init:0/1`

The init container is downloading about 4 GB of classifier models.

```bash
oc logs -n models deploy/semantic-router -c model-downloader -f
```

Expect several minutes on a first run. If it is not progressing, the cluster
probably cannot reach `huggingface.co`. The download is idempotent — each model
is skipped if its directory already exists — so a restart resumes rather than
starting over.

### CrashLoopBackOff on the `semantic-router` container

```bash
oc logs -n models deploy/semantic-router -c semantic-router --previous --tail=100
```

| In the log | Cause |
|---|---|
| `no such file or directory` under `/app/models` | The init container did not finish. Check it first. |
| OOMKilled, or the pod is killed while loading | Four ModernBERT models on CPU need headroom. Raise the memory limit from 8 Gi. |
| A gated-model or 401 error mentioning `mom-embedding-light` | The init container's alias step did not run. Delete the models PVC and redeploy: `./scripts/undeploy.sh --pvcs` then `./scripts/deploy.sh --skip-models`. |

### PVC `Pending`

```bash
oc get pvc -n models
oc get storageclass
```

No default StorageClass, or none supporting `ReadWriteOnce`. Set a default, or
add `storageClassName` to
[`02-pvcs.yaml`](../deploy/router/02-pvcs.yaml).

---

## Models will not become Ready

```bash
oc get inferenceservice -n models
oc describe pod -n models -l serving.kserve.io/inferenceservice=qwen-25-7b
```

| Symptom | Cause |
|---|---|
| Pod `Pending`, `Insufficient nvidia.com/gpu` | Fewer than two allocatable GPUs. Check `oc get nodes -o custom-columns=NAME:.metadata.name,GPU:.status.capacity.'nvidia\.com/gpu'`. Scale the node pool, or drop `maxReplicas`/one of the models. |
| Pod `Pending`, untolerated taint | Your GPU nodes carry a taint other than `nvidia.com/gpu=true:NoSchedule`. Update `tolerations` in both InferenceServices. |
| `ImagePullBackOff` on `registry.redhat.io/rhaiis/...` | No pull secret for `registry.redhat.io` in the namespace. Add one, or link it to the `default` ServiceAccount. |
| Container starts then exits during model load | GPU memory. Lower `--gpu-memory-utilization`, or `--max-model-len` (20000 for Qwen, 8192 for Phi). |
| `Unknown deployment mode "Standard"` | An older KServe. Change `serving.kserve.io/deploymentMode` to `RawDeployment` in both InferenceServices. |

A model that is slow rather than stuck is normal on a first run — Qwen-2.5-7B
is roughly 15 GB from Hugging Face.

---

## The console

### Blank page, or "unreachable" in the header

```bash
oc get pods -n models -l app=semantic-router-demo-ui
oc logs -n models deploy/semantic-router-demo-ui --tail=50
curl -sk "https://$(oc get route semantic-router-demo -n models -o jsonpath='{.spec.host}')/healthz"
```

If `/healthz` answers but the API status dot is red, nginx is up and the proxy
to the router is not — check the router pod.

### Edits to a use case do not show up

```bash
./scripts/deploy.sh --ui-only
```

The ConfigMap is hashed by kustomize, so this rolls the Deployment. If the
content is right in the ConfigMap but stale in the browser, hard-reload — the
nginx config sends `Cache-Control: no-store`, but a service worker or a proxy
in between may not care.

### CORS errors in the browser console

Only possible when the page is *not* served from the demo-ui pod. Either serve
it from the cluster, or confirm the Envoy CORS filter is live:

```bash
curl -ski -X OPTIONS \
  -H 'Origin: https://example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  "https://$(oc get route semantic-router -n models -o jsonpath='{.spec.host}')/v1/chat/completions" \
  | grep -i access-control
```

You should see `access-control-allow-origin`. If not, the router pod is running
an older Envoy ConfigMap — `./scripts/wire-endpoints.sh` to re-apply.

### Model name shows "from body"

Cosmetic. It means `x-vsr-selected-model` did not reach the page, so the console
fell back to the `model` field in the response body — which is what the backing
vLLM server reported, and is equally accurate for the purpose of the demo. It
happens when the router version does not set that header.

---

## Requests time out

Three timeouts stack up, longest-lived first:

| Where | Setting | File |
|---|---|---|
| OpenShift Route | `haproxy.router.openshift.io/timeout: 300s` | [`07-route.yaml`](../deploy/router/07-route.yaml) |
| Envoy route | `timeout: 300s` | [`04-configmap-envoy.yaml`](../deploy/router/04-configmap-envoy.yaml) |
| Envoy ext_proc | `message_timeout: 300s` | same file |
| nginx proxy | `proxy_read_timeout 300s` | [`nginx.conf`](../deploy/demo-ui/nginx.conf) |

If you raise one, raise all of them, outermost highest.

A first request after a cold start is legitimately slow — the model has to load
its weights into GPU memory. Run `./scripts/smoke-test.sh` to warm things up
before presenting.

---

## Starting over

```bash
./scripts/undeploy.sh                 # router + console, models stay up
./scripts/deploy.sh --skip-models     # ~2 minutes

./scripts/undeploy.sh --all --pvcs    # everything, including cached classifiers
./scripts/deploy.sh                   # ~45 minutes
```
