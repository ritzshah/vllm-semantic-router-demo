# vLLM Semantic Router on OpenShift AI — demo

Intent-aware LLM routing, guardrails and semantic caching in front of two vLLM
model servers on OpenShift AI, with a click-driven console built for presenting
to an audience.

Every request arrives at one OpenAI-compatible endpoint asking for `model: "auto"`.
The router reads the prompt and decides what should happen to it:

```
                                 ┌──────────────────────────────┐
  POST /v1/chat/completions      │  Guardrails (highest first)  │
  { "model": "auto", ... }  ───► │  PII · unsafe · jailbreak    │ ──► blocked,
                                 └──────────────┬───────────────┘     no GPU used
                                                │
                                 ┌──────────────┴───────────────┐
                                 │  Semantic cache (MiniLM)     │ ──► cached answer,
                                 └──────────────┬───────────────┘     no GPU used
                                                │
                                 ┌──────────────┴───────────────┐
                                 │  Routing decisions           │
                                 │  policy > complexity > intent│
                                 └───────┬──────────────┬───────┘
                                         ▼              ▼
                              qwen-2.5-7b-instruct   phi-3-mini
                              (hard / urgent /       (easy / general
                               security / math)       chat)
```

The point of the demo is that the client never changes. The same request body,
sent to the same URL, lands on a different model — or on no model at all —
depending on what was actually asked.

---

## What you get

| | |
|---|---|
| **2 model backends** | Qwen-2.5-7B-Instruct and Phi-3-mini-128k, served by vLLM on KServe |
| **1 gateway** | vLLM Semantic Router + Envoy, exposing an OpenAI-compatible API |
| **5 classifiers** | ModernBERT for category, PII (Presidio token model) and jailbreak, MiniLM for embeddings and cache |
| **15 use cases** | Intent routing, complexity scaling, policy overrides, guardrails, caching, cost |
| **1 demo console** | Click a case, watch which model answered, with a pass/fail badge against the expected route |

---

## Prerequisites

- OpenShift 4.14+ with **OpenShift AI / KServe** installed and the
  `serving.kserve.io` CRDs present.
- **NVIDIA GPU Operator**, and **two allocatable GPUs** — one per model. They do
  not have to match: the reference deployment runs Qwen-2.5-7B on an L40S and
  Phi-3-mini on a T4. See [GPU sizing](#gpu-sizing) below.
- Tolerations use `operator: Exists` on the `nvidia.com/gpu` key, so any taint
  *value* works (`true`, `l40-gpu`, `a10g`, …). Only the key has to match.
- A default `StorageClass` supporting `ReadWriteOnce` (the router needs 15 Gi
  across two PVCs for its classifier models).
- Cluster access with permission to create namespaces, and `oc`, `curl` and `jq`
  locally.
- Egress to `huggingface.co` (model weights), `ghcr.io` (router image) and
  `registry.redhat.io` (vLLM runtime). The vLLM runtime image needs a pull
  secret for `registry.redhat.io`; on a Red Hat Demo Platform cluster this is
  already present.

---

## Deploy

```bash
git clone https://github.com/ritzshah/vllm-semantic-router-demo.git
cd vllm-semantic-router-demo
oc login --token=<token> --server=<api-url>

./scripts/deploy.sh
```

That is the whole thing. It deploys the models, waits for them, resolves their
ClusterIPs into the router config, deploys the router, deploys the console, and
prints the two URLs.

Budget **45–60 minutes for the first run** — almost all of it is pulling
Qwen-2.5-7B from Hugging Face. Subsequent runs take a couple of minutes.

Re-running is safe. Useful variants:

```bash
./scripts/deploy.sh --skip-models   # models already up; just router + console
./scripts/deploy.sh --ui-only       # after editing a use case
./scripts/wire-endpoints.sh         # after redeploying a model, repoint the router
NS=my-demo ./scripts/deploy.sh      # different namespace
```

### GPU sizing

The two models are pinned to specific GPUs with a `nodeSelector` on
`nvidia.com/gpu.product`, a label published by NVIDIA GPU Feature Discovery:

| Model | Needs | Pinned to | Notes |
|---|---|---|---|
| `qwen-25-7b` | ~23 GB at `--max-model-len 20000` | `NVIDIA-L40S` | bf16 |
| `phi-3-mini-chat` | ~13 GB at `--max-model-len 8192` | `Tesla-T4` | needs `--dtype float16` |

Check what you have, then edit the two `nodeSelector` blocks in
`deploy/models/` to match — or delete them if every GPU in your cluster is the
same:

```bash
oc get nodes -L nvidia.com/gpu.product
```

Two things that bite on heterogeneous hardware:

- **Pre-Ampere GPUs have no native bfloat16.** The T4 is Turing, so vLLM refuses
  to start on a model whose config declares bf16 unless you pass
  `--dtype float16`. Phi-3 already does. If you move a model onto a T4 or V100,
  add the same flag.
- **The device plugin allocates whole GPUs, not memory.** A 46 GB card already
  hosting a small model has *no* allocatable GPU left, even with 40 GB free.
  If a model stays `Pending` with `Insufficient nvidia.com/gpu` while
  `nvidia-smi` shows plenty of headroom, that is why — see
  [troubleshooting](docs/troubleshooting.md#a-model-stays-pending-but-the-gpu-looks-free).

Need a second GPU node? `deploy/cluster/machineset-gpu-t4.yaml` adds a
`g4dn.2xlarge` (1× T4) on AWS. It is cluster-specific — read the header comment
for the fields to change before applying it anywhere else.

### Verify before you present

```bash
./scripts/smoke-test.sh
```

This runs all 15 cases through the live router and prints what each one actually
routed to, against what it was expected to route to:

```
  ✓ intent-coding                qwen-25-7b           2841 ms
  ✓ intent-general               phi-3-mini-chat      1203 ms
  ✓ guard-jailbreak-classifier   BLOCKED                74 ms
  ✓ cache-exact-run2             qwen-25-7b             91 ms
```

**Run this before every presentation.** Classifier thresholds that behave one
way on one cluster can behave differently on another, and it is much better to
find that out here. If something routes unexpectedly, see
[docs/troubleshooting.md](docs/troubleshooting.md#routing-to-the-wrong-model) —
it is nearly always a threshold to tune, not a breakage.

---

## Present

Open the console URL that `deploy.sh` printed:

```
https://semantic-router-demo-models.apps.<your-cluster>/
```

- Pick a use case in the left sidebar, press **Run**.
- The result card shows a large badge with **which model answered**, the latency,
  the token counts, and a **pass/fail** against the expected route.
- The header keeps a running tally — 7B vs 3.8B vs cached vs blocked — which
  makes a good closing slide after you have worked through the cases.
- Every prompt is **editable**. Changing a word and re-running, live, is the most
  convincing thing you can do with this demo.
- Keyboard: `↑`/`↓` to move, `Enter` to run, `c` to clear, `?` for the rest.
- `A+` / `A−` in the header scales the whole console for the projector.

If the room's network cannot reach the cluster Route:

```bash
./scripts/port-forward.sh     # console on http://localhost:8888
```

A suggested running order and talk track is in
[docs/presentation-runbook.md](docs/presentation-runbook.md).

---

## Repository layout

```
deploy/
  models/      Qwen + Phi InferenceServices, ServingRuntimes, stable Services
  router/      Semantic router: config, Envoy config, Deployment, Service, Route
  demo-ui/     The console — nginx Deployment plus the UI source in ui/
scripts/
  deploy.sh           stand up everything
  wire-endpoints.sh   resolve backend ClusterIPs into the router config
  smoke-test.sh       run all 15 use cases, report expected vs actual
  port-forward.sh     serve the console on localhost
  undeploy.sh         tear down
docs/
  architecture.md          how the pieces fit, and why
  use-cases.md             all 15 cases and the decision each exercises
  presentation-runbook.md  running order, talk track, failure recovery
  troubleshooting.md       what breaks and what to do about it
  llm-d-integration.md     where llm-d fits alongside this
```

### Editing the demo

The console is generated straight from
[`deploy/demo-ui/ui/usecases.js`](deploy/demo-ui/ui/usecases.js) by a kustomize
`configMapGenerator`. There is no image to build:

```bash
$EDITOR deploy/demo-ui/ui/usecases.js
./scripts/deploy.sh --ui-only
```

Routing behaviour lives in
[`deploy/router/03-configmap-router.yaml`](deploy/router/03-configmap-router.yaml)
— keyword rules, embedding signals, thresholds and the decision list with its
priorities. Change it and run `./scripts/wire-endpoints.sh`, which re-applies and
restarts the router only if the config actually changed.

---

## Two things worth knowing before you read the manifests

**The router config contains IP placeholders, on purpose.** Envoy's
`ORIGINAL_DST` cluster dials whatever address the router puts in the
`x-vsr-destination-endpoint` header, and it does not resolve DNS — a Service
hostname there produces `503 no healthy upstream`. So the config needs literal
ClusterIPs, which are cluster-specific, which is why Git carries
`__QWEN_ENDPOINT_IP__` and `scripts/wire-endpoints.sh` fills it in at deploy
time. The stable `*-predictor-stable` Services exist so those IPs survive
InferenceService redeploys.

**The demo console is same-origin by design.** Its nginx proxies `/v1` to the
router inside the cluster, so the browser never makes a cross-origin request
during a live demo. The router's Envoy *also* carries a permissive CORS policy,
which is what lets you open the same page from a laptop or GitHub Pages and
point it at the Route. Belt and braces: a CORS surprise on stage is not a good
time.

---

## Credits

- [vLLM Semantic Router](https://github.com/vllm-project/semantic-router) — the
  routing engine, classifiers and `extproc` image.
- Classifier models published by
  [LLM-Semantic-Router](https://huggingface.co/LLM-Semantic-Router) on Hugging Face.
- Manifests adapted from the `vllm/` and `ai-models/` paths of an internal
  GitOps catalogue.

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
