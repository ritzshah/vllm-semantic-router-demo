# Architecture

## The request path

Everything hangs off one pod that runs two containers: the semantic router and
an Envoy sidecar. Envoy owns the port; the router is an Envoy *external
processor* reached over gRPC on localhost.

```
  client
    │  POST /v1/chat/completions  { "model": "auto", ... }
    ▼
  Route (edge TLS, 300s timeout)
    ▼
  Service semantic-router:80 ──► Envoy :8801
                                   │
                                   │ 1. cors filter
                                   │    OPTIONS preflight answered here
                                   │
                                   │ 2. ext_proc filter ──gRPC──► 127.0.0.1:50051
                                   │                              ┌──────────────────┐
                                   │                              │ semantic-router  │
                                   │                              │                  │
                                   │                              │ Vela embedding   │
                                   │                              │ Vela Guard/PII/  │
                                   │                              │   Domain         │
                                   │                              │ keyword rules    │
                                   │                              │ decision list    │
                                   │                              │ semantic cache   │
                                   │                              └──────────────────┘
                                   │    router replies with either
                                   │      (a) an immediate response  → guardrail block
                                   │                                   or cache hit
                                   │      (b) a mutated request      → sets header
                                   │          x-selected-model: qwen-25-7b
                                   │
                                   │ 3. router filter — route matches that header
                       ┌───────────┴───────────┐
                       ▼                       ▼
                  qwen_cluster            phi_cluster
                  (STRICT_DNS)            (STRICT_DNS)
                       │                       │
                       ▼                       ▼
            qwen-25-7b-predictor     phi-3-mini-chat-predictor
            (vLLM, 1× GPU)           (vLLM, 1× GPU)
```

Two of the three outcomes never touch a GPU. A guardrail block and a cache hit
are both answered by the router itself through the `fast_response` path, which
is why blocked requests come back in tens of milliseconds while a real
generation takes seconds. That contrast is the most legible thing on stage.

## How Envoy learns where to send a request

The router does not hand Envoy an address. It sets **`x-selected-model`** to the
chosen model's logical *name*, and Envoy owns one named cluster per model, with
a route matching on that header:

```yaml
- match:
    prefix: "/"
    headers:
    - name: x-selected-model
      string_match: { exact: "qwen-25-7b" }
  route:
    cluster: qwen_cluster
```

The virtual host strips any `x-selected-model` the client supplied, so the
header can only have come from the router.

This layout mirrors the template the project ships at
`/app/cli/templates/envoy.template.yaml` inside the extproc image — worth
reading if you add a backend, since it is the authoritative shape.

Three consequences:

- **Backends are DNS names.** The clusters are `STRICT_DNS`, so they take
  `qwen-25-7b-predictor-stable.models.svc.cluster.local` and re-resolve on
  their own. No ClusterIP is ever written into Git, and a model redeploy needs
  no re-wiring.
- **The stable Services still earn their place**, just for a different reason:
  KServe recreates its generated predictor Services on every revision, so the
  DNS name has to be one that does not move.
- **Adding a model** is a route plus a cluster here, and a `providers.models`
  entry in the router config. The two must agree on the name.

### If you are porting an older config

This replaced a single `ORIGINAL_DST` cluster whose address came from an
`x-vsr-destination-endpoint` header holding a literal `IP:port`. That header
does not exist in v0.3.

Keeping the old shape fails in a way that wastes an afternoon: **guardrail
blocks and cache hits keep working**, because the router answers those itself
and never reaches a cluster. Only requests that actually need a model fail,
with `503 no healthy upstream` — so the half of the demo you check first looks
perfect. The tell is in the Envoy access log, where the header field prints
empty.


## How a decision is made

The router evaluates its `decisions` list in **descending priority order** and
takes the first whose rule matches. Each rule is a boolean tree over condition
types, and the condition types draw on different machinery:

| Condition type | Backed by | Cost |
|---|---|---|
| `keyword` | Case-insensitive substring match over a named list | Negligible |
| `embedding` | Vela encoder cosine similarity against candidate phrases | Low, CPU |
| `complexity` | Same embedding model, against `easy` / `hard` candidate sets — see below | Low, CPU |
| `domain` | Vela-1.0-Encoder-307M-Domain, mapped onto MMLU-Pro categories | Moderate, CPU |
| `pii` | Vela-1.0-Encoder-307M-PII | Moderate, CPU |
| `jailbreak` | Vela-1.0-Encoder-307M-Guard | Moderate, CPU |

All of it runs on CPU inside the router pod — `use_cpu: true` throughout — which
is why the router asks for 1.5–3 cores and 4–8 GB rather than a GPU.

The full priority ladder as configured:

| Priority | Decision | Effect |
|---:|---|---|
| 1600 | `block_pii_keywords` | Block — deterministic PII phrases |
| 1500 | `block_pii_content` | Block — Presidio token classifier |
| 1200 | `block_unsafe_content` | Block — harmful-content keywords |
| 1100 | `block_jailbreak_keywords` | Block — known jailbreak phrases |
| 1000 | `block_jailbreak` | Block — Vela Guard classifier |
| 300 | `critical_security_code` | Qwen + reasoning — urgent AND security AND code |
| 220 | `user_feedback_escalation` | Qwen + reasoning, cache off, system prompt replaced |
| 145 | `coding_hard_complexity` | Qwen + reasoning |
| 140 | `coding_easy_complexity` | Phi |
| 130 | `coding` | Qwen + reasoning |
| 120 | `math` | Qwen + reasoning |
| 90 | `general` | Phi |
| 50 | `general_domain` | Phi — classifier fallback |
| 10 | `extended_signals_enablement` | Phi — activates the remaining signal families |
| — | `default_model` | Phi |

Two deliberate design choices are visible in that table.

**Guardrails sit far above routing**, with a three-digit gap. Nothing you add to
the routing section can accidentally outrank a privacy or safety rule.

**Everything falls back to the small model.** `general_domain`, the
catch-all at 50, and `default_model` all point at Phi. An unrecognised prompt
costs you the cheap model, never the expensive one.

Within the guardrails, **deterministic rules outrank classifiers** — 1600 above
1500, 1100 above 1000. The cheap check runs first and the ML model is the
safety net underneath it, not the other way around.

## The config layout

The router config uses the **canonical v0.3 hierarchy**, and refuses to start
on anything else. Six top-level keys:

| Key | Holds |
|---|---|
| `version` | `v0.3` |
| `global` | `model_catalog` (the embedding model and the prompt-guard / classifier modules), `router`, and `stores` — including the response cache |
| `listeners` | Transport configuration |
| `entrypoints` | Maps client-visible model names to a recipe. `auto` → the default recipe |
| `providers` | `defaults` (default model, reasoning effort) and `models`, each with `backend_refs` carrying an endpoint and a reasoning family |
| `routing` | `signals` and `decisions` |

If you are porting an older config, do not hand-rewrite it — the image ships a
migration. See
[troubleshooting](troubleshooting.md#config-file-must-use-the-canonical-v03-hierarchy).

Before applying any change, run the offline validator:

```bash
./scripts/validate-config.sh
```

It checks the canonical key names, that every decision condition resolves to a
declared signal, that `modelRefs` resolve to `providers.models`, and that
`mmlu_categories` uses only the 14 supported MMLU-Pro categories. The router
checks the same things, but one error per startup — this reports them all at
once, in about a second.

## The complexity signal is a difference, not a score

This one is worth understanding before you touch its threshold, because the
obvious reading is wrong.

The signal embeds the prompt and scores it against both candidate sets, then
compares the **difference**:

```
signal = hard_score - easy_score

signal < -threshold   ->  easy
signal >  threshold   ->  hard
otherwise             ->  medium   (neither band fires)
```

So `threshold` is a *margin*, not a similarity floor. Raising it does not make
the bands stricter in the way you would expect — it widens the dead zone in the
middle where neither fires.

The router prints the arithmetic, which makes tuning a measurement rather than
a guess:

```bash
oc logs -n models deploy/semantic-router -c semantic-router --tail=200 \
  | grep "Complexity rule"
# Complexity rule 'code_complexity': hard_score=0.446, easy_score=0.966,
#   signal=-0.520, difficulty=medium
```

Measured on this deployment:

| Prompt | signal | Wanted |
|---|---:|---|
| "Write a Python function that … returns the sum of its values." | −0.520 | easy |
| "Compute the derivative of f(x) = x³·ln(x) …" | −0.208 | neither |
| "Explain the difference between a Python list and a tuple …" | −0.147 | neither |

The shipped threshold is **0.36**, midway between −0.520 and −0.208, giving
roughly 0.15 of margin on each side.

Two failure modes either side of that:

- **Too low** (the 0.1 this demo inherited): almost every prompt lands in a
  band, so `coding_easy_complexity` at priority 140 outranks and absorbs
  traffic meant for `coding` (130) and `math` (120). A calculus question gets
  answered by the small model, and the demo looks like it is doing complexity
  routing when it is really doing *only* complexity routing.
- **Too high** (0.55 and up): nothing is ever easy or hard, both complexity
  decisions go dead, and everything falls through to plain intent routing.

Because this is a margin between two embedding scores, it does not survive a
change of embedding model. Re-measure after any such change.

## The semantic cache

Caching is configured globally under `global.stores.response_cache` and then
tightened per decision:

```yaml
global:
  stores:
    response_cache:
      enabled: true
      backend_type: "memory"
      similarity_threshold: 0.85
      max_entries: 1000
      ttl_seconds: 3600
      eviction_policy: "fifo"
```

A request is embedded with the Vela encoder; if an existing entry is within the cosine
threshold, its answer is returned without contacting a model. Individual
decisions override the threshold through the `response_cache` plugin (named
`semantic-cache` before v0.3; the old alias still works but logs a deprecation
warning on every decision that uses it) —
`coding_hard_complexity` uses 0.93 because a near-miss on a hard problem is more
costly than a cache miss, and `user_feedback_escalation` disables the cache
entirely, because replaying a cached answer to someone who just said the answer
was wrong is the worst available behaviour.

### Two things that will bite you

**Scope.** The cache is keyed per *user* by default. With no identity on the
request the router logs `cache_scope_user_missing` and skips the cache
entirely — silently, with no cache header and no error. Every decision here
sets `scope: global`. Valid values are `user`, `team`, `tenant` and `global`;
the non-global ones also want `USER_SCOPE_NAMESPACE_SECRET` when the endpoint
is remotely reachable.

**Similarity is lexical.** Measured against a cached
"explain the difference between a Python list and a tuple":

| Request | similarity |
|---|---:|
| identical | 1.0000 |
| "…**set** and a **dict**…" — a different question | 0.9431 |
| a full reword of the original | 0.8555 |

The wrong question scores higher than the paraphrase, because it shares more
wording. There is no threshold that admits the paraphrase and rejects the
distractor, so this deployment picks precision: **0.95**, which caches repeats
and nothing else. Treat any similarity threshold as a precision/recall dial
measured on *your* prompts, not a meaning detector.

`backend_type: memory` means the cache is per-pod and dies with the pod. That is
fine for a demo and deliberately simple; the router also supports Milvus for a
shared, persistent cache across replicas.

## The demo console

A single nginx pod serving three static files out of a ConfigMap, with a
reverse proxy for `/v1`, `/api` and `/metrics` to the router Service.

The proxy is the point. Served this way the console is **same-origin** with the
API, so the browser does no CORS negotiation at all during a live demo. The
router's Envoy independently carries a permissive CORS policy, which covers the
other case — opening the same `index.html` from a laptop, or from GitHub Pages,
and pointing the API box at the router's Route.

The UI is plain ES2017 with no framework, no bundler and no CDN references, so
it needs nothing from the network beyond the cluster itself. The use cases live
in `usecases.js` as data, which means changing the demo is a text edit and
`./scripts/deploy.sh --ui-only` — kustomize hashes the ConfigMap, which rolls
the Deployment automatically, so there is never a stale pod serving old content.

## What this is not

This router decides **which model** handles a request. It does not decide which
*replica* of that model, and it knows nothing about KV-cache locality or
prefill/decode disaggregation. That is a different layer —
see [llm-d-integration.md](llm-d-integration.md), which sketches how the two
compose with the semantic router as the front door and llm-d behind each model.
