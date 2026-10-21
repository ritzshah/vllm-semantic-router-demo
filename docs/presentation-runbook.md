# Presentation runbook

## The day before

```bash
./scripts/deploy.sh          # or --skip-models if the cluster is already up
./scripts/smoke-test.sh      # all 15 cases, expected vs actual
```

Fix anything that fails *now*. A classifier threshold that behaves differently
on this cluster is a two-line config change today and a bad thirty seconds
tomorrow. See [troubleshooting.md](troubleshooting.md#routing-to-the-wrong-model).

If a case cannot be made to pass reliably, delete it from `usecases.js` and
re-run `./scripts/deploy.sh --ui-only`. A demo of twelve cases that all work
beats fifteen with a coin flip in the middle.

## Thirty minutes before

```bash
oc get pods -n models            # everything Running, nothing restarting
./scripts/smoke-test.sh          # warms the models and re-confirms routing
```

That smoke test also **warms the cache and the GPU**, which matters: the very
first generation after a cold start is much slower than the rest, and you do
not want that latency to be the first number the audience sees.

Then open the console and press `c` to clear the counters, so the tally starts
at zero in front of the audience.

**Set the text size.** Press `A+` until the result cards are legible from the
back of the room. The setting persists.

**Have the fallback ready.** Open a second terminal with
`./scripts/port-forward.sh` already running, so if the Route stops resolving
you switch tabs to `http://localhost:8888` rather than debugging on stage.

## Running order

Roughly 12–15 minutes at a comfortable pace. Three acts: it saves money, it
enforces policy, it does not cost you anything.

### Act 1 — the router reads intent (≈4 min)

| # | Case | The line |
|---|---|---|
| 1 | `intent-coding` | "Nobody picked a model. The client said `auto`." |
| 2 | `intent-general` | "Same endpoint, same request shape — small model. That is the bill going down." |
| 3 | `complexity-easy` | "Still Python. Still goes to the small one." |
| 4 | `complexity-hard` | "Same topic, hard problem, big model with reasoning on." |

Cases 3 and 4 are the pair that does the work. Run them consecutively and point
at the two badges. The argument is: routing on *topic* is obvious and not very
interesting; routing on *what the request actually costs* is the thing.

### Act 2 — policy overrides cost (≈3 min)

| # | Case | The line |
|---|---|---|
| 5 | `policy-critical-security` | "Urgent, security, code — I do not care what the difficulty grader thinks." |
| 6 | `policy-feedback-escalation` | "User pushed back. Bigger model, cache off, system prompt replaced." |

The cache-off detail in case 6 is worth a sentence of its own: replaying a
cached answer to someone who just said the answer was wrong is the worst thing
the system could do, so the config forbids it.

### Act 3 — guardrails and cache (≈5 min)

| # | Case | The line |
|---|---|---|
| 7 | `guard-jailbreak-keyword` | "Note the latency. This never reached a model." |
| 8 | `guard-jailbreak-classifier` | "No blocked phrase anywhere in that sentence." |
| 9 | `guard-pii-classifier` | "Just a record someone pasted out of a CRM." |
| 10 | `cache-paraphrase` | "Nobody phrases a question the same way twice." |
| 11 | `cost-auto-vs-pinned` | "This is the before and after." |

Cases 7 and 8 are the strongest pair in the deck. Run 7, let them see the
60 ms. Run 8, let them read the prompt and notice there is nothing to block on.
That is the argument for layered defence in about twenty seconds.

Finish on 11 with the header tally visible — by then it shows a real split
between 7B, 3.8B, cached and blocked across the whole session.

## Earning it back

Two moves that convert a scripted demo into a credible one. Use at least one.

**Edit a prompt live.** Every prompt box is editable. Take `intent-general`
("Draft a message welcoming a new teammate"), add "...in Python, as a function
with a docstring", press Run, and watch it move to the 7B model. One word
changed the route. Nothing up the sleeve.

**Take a prompt from the audience.** Type it into any box and run it. You do not
control the answer, which is the point — and the failure mode is benign: it
routes to one of two models, or a guardrail stops it.

If you want a safety net, open the raw JSON expander on a result first so the
audience has already seen that the console is just reading an ordinary
OpenAI-compatible response.

## When something goes wrong

**A case routes to the "wrong" model.** Say so and keep going — "that one is a
borderline prompt, and the threshold is a line of YAML". You have a pass/fail
badge on screen, so pretending otherwise does not work anyway. Then show the
prompt box and nudge the wording until it routes as expected; demonstrating the
sensitivity is a legitimate demo in itself.

**A request hangs.** The Route is set to a 300 s timeout. Do not wait — switch
to the next case and come back. A backend that has been idle can be slow on its
first token.

**The status dot goes red.** The console re-probes every 30 seconds, so it
reflects reality. Switch to `http://localhost:8888` via the port-forward you
already have running. If that is also down:

```bash
oc get pods -n models
oc logs -n models deploy/semantic-router -c semantic-router --tail=50
```

**Everything is down.** `./scripts/smoke-test.sh --verbose` output from the
morning, in a terminal scrollback, is a perfectly respectable fallback. Keep the
window open.

## Afterwards

The repository is public — put the URL on the closing slide. The two files
worth pointing people at:

- [`deploy/router/03-configmap-router.yaml`](../deploy/router/03-configmap-router.yaml)
  — the entire routing policy, in one readable file.
- [`docs/use-cases.md`](use-cases.md) — every case with the decision it exercises.
