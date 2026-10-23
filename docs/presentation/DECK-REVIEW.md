# Review: `vLLM_Semantic_Routing (1).pptx`

Reviewed 21 October 2026 against the current project documentation at
[vllm-sr.ai](https://vllm-sr.ai/docs/intro/).

**Verdict: the deck is structurally sound and the llm-d comparison is genuinely
good, but the architecture it teaches is one release behind.** The project has
re-framed itself around Mixture-of-Models with a five-stage pipeline, and the
deck still teaches a four-layer one. Two slides also carry visible rendering
defects.

The deck is 17 slides of NotebookLM-generated images with **no editable text** —
the PPTX contains 17 PNGs and zero text runs. Nothing can be corrected in place,
which is why the rebuilt deck in this folder is text-native.

---

## The headline problem: the pipeline changed

The deck's slide 5 teaches a **four-layer** architecture:

> Layer 1 Signal Extraction → Layer 2 Decision Engine → Layer 3 Model Selection → Layer 4 Plugin Chain

The documented pipeline is now **five stages**:

> Signals → Projections → Decisions → Algorithms → Model Pools

Two substantive changes:

- **Projections are missing entirely.** This is a real stage that aggregates
  signal outputs into reusable components via *partitions* ("choose a coherent
  winner among overlapping matches"), *scores* ("combine weighted inputs") and
  *mappings* ("convert a score into named routing bands"). Without it the deck
  can't explain how overlapping domain matches get resolved, or how complexity
  and context combine into a difficulty score.
- **"Model Selection" is now "Algorithms"**, and it is broader than the deck
  implies. There are two families: *selection algorithms* (pick one candidate by
  fixed order, semantic fit, latency, or feedback) and **looper algorithms**
  (coordinate cascades, panels, multi-round processes and workflows). The deck
  only covers the first and so misses multi-model orchestration — arguably the
  most interesting capability the project has.

---

## Missing concepts worth adding

These are central to how the project describes itself today and appear nowhere
in the deck.

| Concept | Why it matters for your talk |
|---|---|
| **Recipes** | The unit of policy isolation. A recipe owns its signals, projections, decisions, algorithms, plugins, cache namespace and routing state. This is the answer to "how do I run different policies for different teams without them leaking into each other?" |
| **Entrypoints** | Select which recipe handles a request. |
| **Five built-in recipes** | MoM V1 ships Balance, Speed, Cost, Accuracy and Vault, exposed as virtual models `vllm-sr/mom-v1-blend`, `-lite`, `-flash`, `-ultra`, `-vault`. Very concrete, very demoable. |
| **MoM vs MoE** | The crispest differentiator in the whole project: MoE is sparse expert activation *inside one model*; MoM is a system pattern orchestrating *multiple independent models* that differ in architecture, training data, capabilities and hardware. Worth its own slide — audiences conflate these constantly. |
| **Detection / enforcement separation** | A PII signal *reports a match*; the decision and plugin policy decide whether to block, reroute, transform or observe. This is the governance story and it is much stronger than "we block PII". |
| **Providers** | Bind logical model names to physical endpoints (local vLLM/Ollama, Kubernetes, remote OpenAI-compatible). "The router picks the path, the backend owns replica placement" — which is also the cleanest one-line setup for your llm-d slide. |
| **Concrete-model pass-through** | Naming a backend model directly bypasses recipe signals, decisions, route-local plugins, cache, learning and session routing. This is exactly the before/after contrast in the demo's `auto` vs pinned use case. |
| **sr-bench 1.0** | The project's own benchmark suite — see the note on slide 4's numbers below. |
| **Fleet Simulator** | Capacity planning and power models. Lands well with an infrastructure audience. |
| **Release line** | v0.4 "Hermes" shipped open Decision models and Vela classification models. v0.5 "Ariadne" is focused on following a route across models, sessions and evaluation. Naming the release you are demoing dates the talk honestly. |
| **Anthropic API compatibility** | Slide 16 lists only OpenAI. The docs now state OpenAI *and* Anthropic. |

---

## Slide-by-slide

| # | Slide | Verdict | Action |
|---|---|---|---|
| 1 | System-Level Intelligence for LLMs | Keep | Subtitle still accurate. Consider the project's current framing: "an open-source routing and control layer for building Mixture-of-Models systems across heterogeneous AI infrastructure." |
| 2 | Brute-force scale → selective intelligence | Revise | Good argument, but "The GPT-5 Paradigm" ties an open-source talk to one vendor's release and will date badly. Reframe as "selective intelligence" generally. |
| 3 | Enter the vLLM Semantic Router | Keep | Envoy ExtProc + MoM backend picture is still correct. Tighten "intent-aware routing layer" to "routing and control layer" — intent is one signal among many. |
| 4 | The enterprise imperative | **Fix figures** | "Trials show up to 10% higher accuracy, 50% lower latency, and 50% fewer tokens consumed" is unattributed. These trace to the original repo README. The project now has **sr-bench 1.0**; cite it, or label the numbers as indicative. Unsourced percentages are the first thing a sceptical audience will challenge. |
| 5 | The Smart Prism Architecture | **Outdated** | Four layers → five stages. Add Projections; rename Model Selection to Algorithms and include looper algorithms. See above. |
| 6 | Layer 1: Signal Matrix | Mostly good | Intent / Safety / Context grouping still works. Docs also list **identity**, **modality**, **preference** and **system state** as observed dimensions — worth adding, especially identity for the governance story. |
| 7 | The dual challenge of enterprise scale | **Defect** | Text duplication: *"2. Distributed Inference — Determining WHICH base Determining WHICH specific GPU replica…"*. The stray "Determining WHICH base" must go. |
| 8 | Powered by the MoM Family | **Outdated** | "Base BERT (110M) + <1M LoRA adapters", "33M–600M parameters", "~10–20ms per signal layer" predate the current naming. The family is now branded: **Vela 2.0 0.3B** classification models (Guard and PII in the Vault recipe; 8,192-token limit with truncation) and open **Decision models**, both shipped in v0.4 "Hermes". Keep the CPU-native efficiency point — it is still the strongest claim on the slide. |
| 9 | Layer 2: Decision Engine | Keep | Accurate and well made. Boolean AND/OR/NOT with arbitrary nesting is exactly how the config works. |
| 10 | Layers 3 & 4: Dispatch and Plugin Chain | Revise | `latency_aware` and the per-decision cache thresholds are right. But the example backends `gpt-oss-120b` and **`gpt-5.2`** are a distraction — one is a real open model, the other is not a shipping model. Use the backends you actually demo. |
| 11 | Step 1: Deploy backend models | **Defect ×3** | (a) Raw ANSI escape codes are visible in the terminal mockup: `\e[38;5;208m` and `\e[0m`. (b) `Qwen/Qwen3-1.8B` is not a real model id — Qwen3 ships 0.6B, 1.7B, 4B, 8B and up. (c) Both servers are shown on `--port 8000`, which would collide on one host. |
| 12 | Step 2: YAML-first configuration | Keep | `vllm_endpoints`, `model_config`, `preferred_endpoints` all match the shipping schema and the config in this repo. |
| 13 | Prerequisites and footprint | Revise | "~440MB base + adapter weights" is the LoRA-adapter figure and badly understates a Kubernetes deployment. The router pod in this repo requests **4 GB and is limited to 8 GB**, and its init container pulls **~4 GB** of classifier weights onto a PVC. Quote both numbers, or the first question after your talk is "why did mine need 8 gigs?" |
| 14 | The Matrix: Model Picker vs Endpoint Picker | **Keep as-is** | The best slide in the deck. Accurate, and the question framing ("What model should handle this?" vs "Where should this request execute?") is the clearest version of this distinction I have seen. |
| 15 | The Perfect Stack: Synergy at Scale | Keep | Flow is right. Note this image is 1033×578 while every other slide is 1376×768, so it letterboxes — regenerate at the deck's aspect ratio. |
| 16 | Universal compatibility | Revise | Add **Anthropic API** alongside OpenAI. Verify the "Kubernetes Operator for automatic scaling, HA, and lifecycle management" claim against the current Deploy & Operate docs before asserting it. |
| 17 | `> ./run_demo.sh` | Keep | Good closer. Now that there is a real demo behind it, add the repo URL. |

---

## What I would add for *your* talk

The deck explains the product but never shows it running. You now have a working
deployment and a click-driven console, so the obvious gap is two slides near the
end:

- **The demo architecture on OpenShift** — Route → Envoy → ExtProc router →
  ORIGINAL_DST → two vLLM backends on KServe. It makes the abstract pipeline
  concrete, and it is the slide people photograph.
- **The 15 use cases** — grouped as intent routing, complexity-aware scaling,
  policy overrides, guardrails, and cache/cost. Then run them live.

Both are in the rebuilt deck.

---

## Second pass — restructured around Aayush Saini's arc (22 Oct)

After reviewing the maintainer deck at
[aadeshai.xyz/presentation-vllm-sr](https://aadeshai.xyz/presentation-vllm-sr/),
the deck was rebuilt again: **21 slides, budgeted at 20 minutes plus a
10-minute demo.** His running order lands the problem before the product, which
is better than the structure I had.

**Adopted from his deck**

| | |
|---|---|
| Fragmentation framing | Four axes — models, compute, location, preference |
| The Uber cost study | Entire 2026 AI budget gone in four months; 5,000 engineers on token-metered Claude Code |
| "Content-blind" root cause | Spend, sovereignty, safety, latency as one bug |
| The core formula | `intent(prompt, context) → compose(model, mode, tools)` |
| WHAT / WHICH / HOW | Router, serving layer, backends |
| Looper patterns | SELECT, CASCADE, FUSION, WORKFLOW |
| Defence in depth | Routing → guardrails → **egress**; "routing is not enough" |
| Agentic multiplier | 10–50 model calls per agent task |
| Project figures | 86% local, 40 ms P50, 80.4% → 98.5% fine-tuned, 11 algorithms — all **in-house benchmarks**, labelled as such on-slide |

All of those figures are the project's **in-house** benchmarks, not independent or
reproduced results, and the slide says so. The 40 ms P50 in particular is an
internal measurement on different hardware, so our 192 ms is not a like-for-like
comparison — the "What we measured" slide notes that rather than implying we are
five times slower.

**Deliberately not adopted**

- The GPT-5 timing narrative — anchors the talk to one vendor's release and
  will date badly.
- The industry quote wall (Nadella, Huang, et al.) — filler in a 20-minute slot.

**Added from our own deployment**

A "What we measured" slide that neither deck has: routing overhead 192 ms,
guardrail block ~900 ms with no GPU, cache 6.9 s → 0.75 s, the cache-precision
table, the PII over-blocking on `DATE_TIME`/`GPE`, and the 10.3 GB classifier
footprint. Including the parts that did not work.

**Corrections to my own first pass**

- Dropped "v0.4 Hermes / v0.5 Ariadne". We run `extproc:latest`
  (`sha256:0108884a…`); there is no version endpoint and no codename in the
  binary, so I could not substantiate it from the cluster. I had taken it from
  the docs blog. Note also that the config's `version: v0.3` is the **config
  schema** version, not the release.
- Reconciled the model naming: his "mmBERT-32K, 307M params" and our
  "Vela-1.0-Encoder-307M" are the same thing — our router logs
  `model_type: "mmbert"`.
- Removed the claim that the classifiers are LoRA adapters. On disk they are
  full 1.2 GB fine-tunes with distinct heads: Domain 14 labels
  (`ModernBertForSequenceClassification`), Guard 2, PII 35 BIO token tags
  (`ModernBertForTokenClassification`).

**Timing.** Every slide carries an `at` cue rendered in red beside the page
number — the cumulative clock position it should start at. The demo slides
carry none. `deck-harness.js` asserts the cues ascend and the last one lands
inside 20 minutes.

## What is in this folder

| File | What it is |
|---|---|
| `deck.js` | Slide content as data — the single source for both outputs below. Edit here. |
| `index.html` | Self-contained HTML deck. Arrow keys to navigate, `f` for fullscreen, `p` to print to PDF. No CDN, no build step. |
| `vLLM-Semantic-Router.pptx` | Editable PowerPoint with real text, for restyling or re-running through NotebookLM. |
| `build-pptx.py` | Regenerates the PPTX from `deck.js`. |
| `DECK-REVIEW.md` | This document. |

To change a slide, edit `deck.js` and run `python3 build-pptx.py`. The HTML deck
picks the change up on reload.

## Sources

- [vLLM Semantic Router — Introduction](https://vllm-sr.ai/docs/intro/)
- [Mixture-of-Models for Heterogeneous LLM Inference](https://vllm-sr.ai/docs/overview/signal-driven-decisions/)
- [Mixture of Models — model family](https://vllm-sr.ai/docs/next/overview/mom-model-family/)
- [v0.4 Hermes release](https://vllm-sr.ai/blog/v0.4-vllm-sr-hermes-release/)
- [Beyond a Single Model: Building Mixture-of-Models Systems](https://vllm-sr.ai/blog/vllm-sr-new-chapter-mom/)
