# Where llm-d fits

This demo routes between **models**. It does not route between **replicas** of a
model, and it knows nothing about KV-cache locality or prefill/decode
disaggregation. Those are llm-d's job, and the two compose cleanly because they
answer different questions.

| | Semantic router | llm-d |
|---|---|---|
| Question answered | *Which model should handle this?* | *Which replica of that model?* |
| Inputs | Prompt text — intent, complexity, PII, jailbreak signals | KV-cache state, replica load, prefix overlap |
| Mechanism | Classifiers and rules over the prompt | Inference gateway (EPP), prefix-cache-aware scheduling |
| Also does | Guardrails, semantic cache, system-prompt injection | Disaggregated prefill/decode, token-level observability |

The router belongs in front. Intent classification and guardrails should run
*before* anything schedules GPU work — there is no point making a smart
replica-placement decision for a request a guardrail is about to block.

## Current topology

```
client → semantic-router → KServe predictor (Qwen)
                         → KServe predictor (Phi-3)
```

## Target topology

```
client → semantic-router → llm-d gateway (Qwen) → prefill / decode replicas
                         → llm-d gateway (Phi)  → prefill / decode replicas
```

The rejected alternative is `client → llm-d → semantic-router → model`, which
puts a scheduling hop in front of the guardrails and weakens the
router-first control model.

## What would change

Remarkably little, which is the point of the `ORIGINAL_DST` design.

1. **Deploy an llm-d stack per model.** Each provides disaggregated prefill and
   decode plus an inference gateway (EPP) exposing an OpenAI-compatible API.
   Reference manifests come from OpenShift AI 3.0 or
   [llm-d](https://github.com/llm-d/llm-d).

2. **Repoint `vllm_endpoints`.** In
   [`03-configmap-router.yaml`](../deploy/router/03-configmap-router.yaml),
   swap the two backend addresses for the llm-d gateway Service ClusterIPs.
   Nothing else in that file changes — `model_config`, `decisions`, `signals`,
   `keyword_rules` and the classifier config all stay exactly as they are.

3. **Repoint the stable Services.** Update the selectors in
   [`stable-services.yaml`](../deploy/models/stable-services.yaml) to target the
   llm-d gateway pods instead of the KServe predictors, so
   `scripts/wire-endpoints.sh` keeps resolving the right ClusterIPs with no
   change to the script.

4. **Envoy needs no changes at all.** It already forwards to whatever address
   arrives in `x-vsr-upstream-host`.

Because the router's decision logic is untouched, every use case in
[use-cases.md](use-cases.md) and the whole demo console keep working unmodified
— the backends behind each decision simply became more capable.

## Migration

Run both backends in parallel, cut over by changing the two endpoint addresses
in one apply, validate with `./scripts/smoke-test.sh`, and decommission the
KServe predictors once stable. Reverting is the same change backwards.

## Validating the difference

The semantic-router demo's numbers do not move much — intent routing and
guardrails behave identically. What changes is visible in llm-d's own metrics:
time-to-first-token on prefix-overlapping requests, cache hit rate across
replicas, and the prefill/decode split. Deploy llm-d's monitoring stack and
compare TTFT on a multi-turn conversation before and after.

Note the two caches are different and complementary. The router's **semantic
cache** avoids generation entirely when a *semantically equivalent* question has
been asked before. llm-d's **prefix cache** avoids recomputing the shared prefix
of requests that are *literally* the same at the front — long system prompts,
multi-turn history. One saves whole requests; the other saves part of every
request.

## Image policy

Prefer Red Hat-provided images where an equivalent exists —
`registry.redhat.io/rhaiis/vllm-cuda-rhel9` is already used by both
ServingRuntimes here — and pin by digest. Use upstream images (`ghcr.io`,
`quay.io`) only for components with no Red Hat equivalent, as this demo does for
`ghcr.io/vllm-project/semantic-router/extproc` and `envoyproxy/envoy`. Keep a
short table in Git recording component, chosen image, source and reason.
