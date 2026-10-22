# Presentation runbook

**20 minutes of slides, 10 minutes of live demo.**

The deck carries its own clock: each slide shows, in red next to the page
number, the cumulative time you should be *starting* it. If slide 11 says
`12:30` and you are at 15:00, you are three minutes down and should cut
something from the next section rather than from the demo.

The demo slides (19–21) carry no cue — that is the second ten minutes.

---

## The day before

```bash
./scripts/deploy.sh --skip-models   # if the cluster is already up
./scripts/smoke-test.sh             # all 15 cases, expected vs actual
```

Fix anything that fails *now*. A classifier threshold behaves differently on
different clusters, and that is a two-line config change today versus a bad
thirty seconds tomorrow — see
[troubleshooting](troubleshooting.md#routing-to-the-wrong-model).

If a case cannot be made to pass reliably, delete it from `usecases.js` and
re-run `./scripts/deploy.sh --ui-only`. Twelve cases that all work beats
fifteen with a coin flip in the middle.

## Thirty minutes before

```bash
oc get pods -n models        # everything Running, nothing restarting
./scripts/smoke-test.sh      # re-confirms routing AND warms the GPUs
```

That warm-up matters: the first generation after an idle period is much slower
than the rest, and you do not want that number to be the first one the audience
sees.

Then:

- Open the console, press **`c`** to zero the counters.
- Press **`A+`** until the result cards read from the back of the room.
- Start `./scripts/port-forward.sh` in a spare terminal, so if the Route stops
  resolving you switch tabs to `http://localhost:8888` instead of debugging on
  stage.

---

## The 20 minutes

Five movements. The arc puts the problem before the product — the audience
should want this to exist before they hear what it is.

### 1 · The problem (0:00 – 5:30)

| At | Slide | The job |
|---|---|---|
| 0:00 | Title | 20 + 10. Set expectations. |
| 1:00 | Fragmentation changed the problem | Four axes at once. Let the combinatorics land. |
| 2:30 | **Then the bill arrives** | Uber: entire 2026 AI budget gone in four months. |
| 4:00 | Inference pipelines are content-blind | Spend, sovereignty, safety, latency — one root cause. |

The Uber slide is the hook. Do not rush it. The point is not that Uber was
careless; it is that token-metered consumption with no routing layer has no
natural ceiling.

### 2 · The idea (5:30 – 8:00)

| At | Slide | The job |
|---|---|---|
| 5:30 | The idea, in one line | `intent(prompt, context) → compose(model, mode, tools)` |
| 7:00 | **MoM is not MoE** | The single most useful distinction in the deck. |

If they take one slide away, make it MoM vs MoE. MoE is someone else's decision
baked into weights; MoM is yours, in config, changeable this afternoon.

### 3 · How it works (8:00 – 15:00)

| At | Slide | The job |
|---|---|---|
| 8:00 | Where it sits: what / which / how | Complements your serving stack. |
| 9:00 | Envoy external processor | Zero code changes. |
| 10:00 | The pipeline: five stages | Walk it once, slowly. |
| 11:00 | Signals, and the models behind them | Vela = the project's mmBERT. Swappable. |
| 12:30 | Decisions apply policy | The priority ladder; detection ≠ enforcement. |
| 14:00 | Projections and Algorithms | The two stages most demos skip. Loopers. |
| 15:00 | Recipes | Adopt a policy by changing one string. |

This is the longest stretch and the easiest place to overrun. If you are behind
at 12:30, compress Projections/Algorithms and Recipes into one minute — they
are the most cuttable pair in the deck.

### 4 · Proof (15:00 – 18:00)

| At | Slide | The job |
|---|---|---|
| 16:00 | What the project reports | Their numbers, labelled as theirs. |
| 17:00 | **What we measured** | Ours, including the failures. |

Read the intro line on the first one verbatim — "not ours, we have not
reproduced them". Volunteering that buys more credibility than the numbers do.

Then linger on the cache row of the second. An audience that has read a vendor
slide about semantic caching has been told it understands meaning. Showing the
number where it does not — the wrong question scoring 0.9650 against a true
paraphrase at 0.8555 — is the most memorable thing in the talk.

### 5 · Enterprise reality (18:00 – 20:00)

| At | Slide | The job |
|---|---|---|
| 18:00 | **Routing is not enough** | Three layers; we implement one and a half. |
| 18:45 | Where this bites hardest: agents | 10–50 calls per task. |
| 19:15 | vLLM-SR and llm-d | Complementary. Last slide before the demo. |

Be straight on the first: our demo has no egress controls. Saying so is what
makes the rest of the deck believable.

---

## The 10 minutes of demo

Switch to the console. Suggested order, roughly a minute each:

| # | Case | The line |
|---|---|---|
| 1 | `intent-coding` | "Nobody picked a model. The client said `auto`." |
| 3 | `intent-general` | "Same endpoint — small model. That is the bill going down." |
| 4 | `complexity-easy` | "Still Python. Still goes to the small one." |
| 5 | `complexity-hard` | "Same topic, hard problem, big model with reasoning on." |
| 7 | `policy-feedback-escalation` | "User pushed back: bigger model, cache off, system prompt replaced." |
| 8 | `guard-jailbreak-keyword` | "Note the latency. This never reached a model." |
| 9 | `guard-jailbreak-classifier` | "No blocked phrase anywhere in that sentence." |
| 13 | `cache-exact` | "6.9 seconds, then 0.75." |
| 14 | `cache-precision` | "Two words different. It has to miss — and at 0.95 it did not." |
| 11 | `cost-auto-vs-pinned` | "This is the before and after." |

Three pairs do the real work: **4 + 5** (routing on cost, not topic),
**8 + 9** (why you need both a deny-list and a classifier), and
**13 + 14** (the cache, and its limit).

Finish on 11 with the header tally visible — by then it shows a real split
between 7B, 3.8B, cached and blocked.

### Earn it

Use at least one. These convert a scripted demo into a credible one.

**Edit a prompt live.** Take `intent-general` ("Draft a message welcoming a new
teammate"), add "…in Python, as a function with a docstring", press Run, watch
it move to the 7B model. One word changed the route.

**Take a prompt from the audience.** Type it in and run it. You do not control
the answer, which is the point, and the failure mode is benign: it goes to one
of two models, or a guardrail stops it.

---

## When something goes wrong

**A case routes to the "wrong" model.** Say so and keep going — "that is a
borderline prompt, and the threshold is a line of YAML". The pass/fail badge is
on screen, so pretending otherwise does not work. Then nudge the wording until
it routes as expected; demonstrating the sensitivity is a legitimate demo.

**A request hangs.** The Route allows 300 s. Do not wait — move to the next
case and come back.

**The status dot goes red.** The console re-probes every 30 s, so it reflects
reality. Switch to the port-forward you already have running. If that is also
down:

```bash
oc get pods -n models
oc logs -n models deploy/semantic-router -c semantic-router --tail=50
```

**Everything is down.** This morning's `./scripts/smoke-test.sh --verbose`
output in a terminal scrollback is a perfectly respectable fallback. Keep the
window open.

---

## Afterwards

The repository is public — put it on the closing slide. The two files worth
pointing people at:

- [`deploy/router/03-configmap-router.yaml`](../deploy/router/03-configmap-router.yaml)
  — the entire routing policy in one readable file.
- [`docs/use-cases.md`](use-cases.md) — every case with the decision it
  exercises, and the measurements behind the cache threshold.
