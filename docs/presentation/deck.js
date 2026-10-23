/*
 * Slide content for the vLLM Semantic Router talk.
 *
 * Single source of truth for both outputs in this folder:
 *   index.html       reads it directly (plain <script> tag)
 *   build-pptx.py    parses it as JSON after stripping the wrapper
 *
 * So: keep the object literal strictly JSON-compatible — double-quoted keys
 * and strings, no trailing commas, no comments inside the object, no
 * expressions. `python3 build-pptx.py` will tell you if you slip.
 *
 * TIMING. Budgeted at 20 minutes of slides plus a 10 minute live demo. The
 * "at" field on each slide is the cumulative clock position where you should
 * be *starting* that slide; the console prints it next to the page number so
 * you can see drift without a stopwatch. Slides 19-21 are the demo handoff and
 * carry no budget — that is the second 10 minutes.
 *
 * SOURCING. Every claim is one of three things, and the slides say which:
 *   - measured on this deployment (the "What we measured" slide, and the demo)
 *   - documented at vllm-sr.ai
 *   - reported by the project / its maintainers, attributed on the slide
 * Where a figure comes from someone else's measurements it is labelled as
 * theirs. See DECK-REVIEW.md.
 *
 * STRUCTURE follows the arc used by Aayush Saini (Red Hat, vLLM-SR
 * maintainer) in his technical deep dive, which lands the problem before the
 * product: fragmentation -> cost -> why pipelines are content-blind -> the
 * idea -> where it sits -> how it works -> proof -> enterprise -> demo.
 */

const DECK = {
  "title": "vLLM Semantic Router",
  "subtitle": "Intelligence beyond any one model",
  "footer": "vLLM Semantic Router · Apache 2.0 · vllm-sr.ai",
  "slides": [
    {
      "type": "title",
      "at": "0:00",
      "title": "Intelligence Beyond Any One Model",
      "subtitle": "vLLM Semantic Router",
      "tagline": "Signal-driven routing, guardrails and semantic caching for Mixture-of-Models systems — running live on OpenShift AI.",
      "note": "Thanks for coming. The next twenty minutes are slides, and then ten minutes of this running live on a cluster — not a recording.\n\nI want to start with a problem rather than a product, because the product only really makes sense once the problem is obvious. So give me five minutes before I tell you what this thing is.\n\nQuick show of hands — who is running more than one model in production today? [pause] Right. And who decides which one handles a given request? That's the talk."
    },
    {
      "type": "columns",
      "at": "1:00",
      "title": "Fragmentation changed the problem",
      "intro": "It is no longer \"which model is best\". The ecosystem fragments along four axes at once, and every one of them is a routing decision.",
      "columns": [
        {
          "heading": "Models & compute",
          "body": "Large, small, hybrid-reasoning, specialist, open and closed — across CPU, GPU, NPU and mixed fleets with different cost and energy profiles."
        },
        {
          "heading": "Location",
          "body": "Cloud, data centre, edge. Where a request may execute is often a compliance question before it is a performance one."
        },
        {
          "heading": "Preference",
          "body": "Quality, latency, cost, privacy. These conflict, and the right trade-off differs per request — not per application."
        }
      ],
      "callout": "Without a routing layer, every application has to navigate all four on its own.",
      "note": "A couple of years ago the question was simple: which model is best? That question is basically dead now, because your estate fragments along four axes at the same time.\n\nFirst, the models themselves — large, small, hybrid reasoning, specialists, open and closed. Second, what they run on: CPU, GPU, NPU, mixed fleets, all with different cost and energy profiles. Third, location — cloud, your data centre, the edge. And for a lot of you that third one is a compliance question long before it's a performance question.\n\nAnd fourth, preference. Quality, latency, cost, privacy. Those conflict with each other, and the right trade-off is different per request — not per application.\n\nNow multiply those together. That's the space every single request has to be placed into. And today, without a routing layer, every application you own is navigating all four of those on its own, in code, separately."
    },
    {
      "type": "statement",
      "at": "2:30",
      "title": "Then the bill arrives",
      "lead": "Uber burned through its entire 2026 AI budget in four months.",
      "points": [
        "5,000 engineers on Claude Code — token-metered, not per-seat.",
        "84% adoption. Budget of $150–2,000 per engineer per month.",
        "Exhausted in April: month four of twelve.",
        "CTO Praveen Neppalli Naga: “I'm back to the drawing board — the budget I thought I would need is blown away already.”"
      ],
      "source": "case study via Aayush Saini, Red Hat — vLLM-SR maintainer",
      "note": "Here's what that costs in practice.\n\nUber put five thousand engineers onto token-metered coding assistants. Eighty-four percent adoption — which, if you've ever tried to roll out a developer tool, is a spectacular success story. Right up until April. Month four of twelve, and the entire year's AI budget was gone.\n\nTheir CTO: \"I'm back to the drawing board — the budget I thought I would need is blown away already.\"\n\nI want to be careful here, because the easy reading is that somebody was careless. That's not it. Token-metered consumption with no routing layer has no natural ceiling. And the better your adoption, the faster you hit it. Success is what breaks the budget.\n\nThis is a published case study, not my data — but I suspect some of you recognise the shape of it."
    },
    {
      "type": "columns",
      "at": "4:00",
      "title": "The root cause: inference pipelines are content-blind",
      "intro": "A load balancer distributes requests without any idea what is in them. Four consequences, and all four are the same bug.",
      "columns": [
        {
          "heading": "Unnecessary spend",
          "body": "A one-line question and a distributed-systems design problem cost the same, because both named the same model."
        },
        {
          "heading": "Data sovereignty",
          "body": "PII, financial and medical content leaves the data centre to reach a cloud model, because nothing inspected it on the way out."
        },
        {
          "heading": "Safety & latency",
          "body": "Jailbreaks pass straight through to inference. Meanwhile trivial requests queue behind heavy reasoning work on the same backend."
        }
      ],
      "callout": "You cannot enforce a policy you cannot see. Routing has to read the request.",
      "note": "If you pull on that, you find four problems that look different and are actually the same bug.\n\nUnnecessary spend: a one-line question and a distributed-systems design problem cost exactly the same, because both of them named the same model.\n\nData sovereignty: personal data, financial data, medical data walks out of your data centre to reach a cloud model — because nothing inspected it on the way out.\n\nSafety: jailbreak attempts go straight through to inference, because there's nothing between the prompt and the model. And latency: trivial requests sit in a queue behind heavy reasoning work on the same backend.\n\nOne root cause. Your inference pipeline is content-blind. A load balancer has no idea what's inside the request it's forwarding — it's balancing bytes.\n\nAnd that's the thing to hold on to: you cannot enforce a policy you cannot see. If you want any of those four fixed, something has to read the request."
    },
    {
      "type": "statement",
      "at": "5:30",
      "title": "The idea, in one line",
      "lead": "intent(prompt, context)  →  compose(model, mode, tools)",
      "points": [
        "Read intent, domain, complexity and risk from the prompt and its context.",
        "Then compose the right model, the right mode, the right supporting capabilities.",
        "Clients send model: \"auto\" over the ordinary OpenAI-compatible API. No SDK, no client change.",
        "Intelligence moves upstream — the decision happens once at the gateway, not in every application."
      ],
      "note": "So here's the idea, and it genuinely is one line.\n\nRead intent, domain, complexity and risk from the prompt and its context. Then compose the right model, the right mode, the right supporting capabilities.\n\nThe part that matters if you actually have to ship this: your clients don't change. They send model \"auto\" over the ordinary OpenAI-compatible API. No SDK, no new library in your request path, no rewrite. In the demo later, my client is literally curl and a static HTML page.\n\nAnd the architectural payoff is the last line there. Intelligence moves upstream. The decision happens once, at the gateway, instead of being copied into every service you own — which means there's one place to change the policy, and critically, one place to audit it."
    },
    {
      "type": "compare",
      "at": "7:00",
      "title": "Mixture-of-Models is not Mixture-of-Experts",
      "intro": "These get conflated constantly, and they operate at completely different levels.",
      "left": {
        "heading": "MoE — Mixture-of-Experts",
        "rows": [
          "An architecture pattern inside a single model.",
          "Sparse expert activation across layers.",
          "Chosen by the model vendor at training time.",
          "You cannot inspect or change the routing."
        ]
      },
      "right": {
        "heading": "MoM — Mixture-of-Models",
        "rows": [
          "A system pattern orchestrating independent models.",
          "They differ in architecture, training data, capability, hardware.",
          "Chosen by you, in configuration, at request time.",
          "Every decision is declared in YAML and observable."
        ]
      },
      "note": "Quick detour, because these two get conflated constantly and they're not even the same layer of the stack.\n\nMixture-of-Experts is an architecture pattern inside one model. Sparse expert activation across layers. Somebody else chose it at training time, and you cannot inspect or change that routing — it's baked into the weights.\n\nMixture-of-Models is a system pattern across independent models that differ in architecture, training data, capability, and the hardware they sit on. You choose it, in configuration, at request time.\n\nIf you take one slide away from today, take this one. MoE is someone else's decision baked into weights. MoM is your decision, in your config, and you can change it this afternoon."
    },
    {
      "type": "pipeline",
      "at": "8:00",
      "title": "Where it sits: what, which, how",
      "intro": "Three layers, one request path. The router complements your serving stack rather than replacing it.",
      "steps": [
        {
          "n": "1",
          "name": "WHAT — vLLM-SR",
          "body": "Chooses the logical model, from intent, complexity, privacy, modality and preference. At the gateway."
        },
        {
          "n": "2",
          "name": "WHICH — serving layer",
          "body": "llm-d, vLLM Production Stack, AIBrix, Dynamo. Picks the replica, from load, queue depth and KV-cache locality."
        },
        {
          "n": "3",
          "name": "HOW & WHERE — backends",
          "body": "vLLM and friends actually generate the tokens, on whichever accelerator and in whichever location policy allowed."
        }
      ],
      "note": "Before I go further — where does this sit relative to what you already run?\n\nThree layers, one request path. The semantic router picks what logical model should handle this request, based on intent, complexity, privacy, modality. That happens at the gateway.\n\nYour serving layer — llm-d, the vLLM Production Stack, AIBrix, Dynamo — picks which replica runs it, based on load, queue depth, KV-cache locality.\n\nAnd then the backend actually generates the tokens, on whatever accelerator and in whatever location the policy allowed.\n\nSo if you're already running one of those serving stacks: this goes in front of it, not instead of it. I'll come back to the llm-d relationship specifically at the end."
    },
    {
      "type": "statement",
      "at": "9:00",
      "title": "How it attaches: an Envoy external processor",
      "lead": "Not a library in your request path. A gRPC external processor that Envoy consults mid-request.",
      "points": [
        "Envoy calls the router over gRPC; the router classifies and returns a decision.",
        "It can answer immediately — a guardrail block or a cache hit never reaches a model at all.",
        "Otherwise it sets x-selected-model and Envoy forwards to that model's cluster.",
        "Standard Envoy, Kubernetes Gateway API, Istio. OpenAI- and Anthropic-compatible on the front."
      ],
      "callout": "Zero code changes. The clients in our demo are plain curl and a static HTML page.",
      "note": "Mechanically, it's an Envoy external processor. It is not a library sitting in your request path.\n\nEnvoy receives the request and calls the router over gRPC. The router classifies the prompt and hands back a decision. Sometimes it answers immediately — if a guardrail fires, or if it's seen this question before, the request never reaches a model at all. Otherwise it sets a header naming the chosen model, and Envoy forwards it to that model's cluster.\n\nThat \"never reaches a model\" point pays off twice in the demo. Blocked requests come back in under a second, and cache hits in about seven hundred milliseconds, because no GPU is involved at all.\n\nAnd it composes with what you have: standard Envoy, Kubernetes Gateway API, Istio. OpenAI and Anthropic compatible on the front door."
    },
    {
      "type": "pipeline",
      "at": "10:00",
      "title": "The pipeline: five stages",
      "intro": "Each stage has one job, and that separation is what makes the policy readable and auditable.",
      "steps": [
        {
          "n": "1",
          "name": "Signals",
          "body": "Extract facts from the request, conversation, identity and content. Signals describe; they never choose a backend."
        },
        {
          "n": "2",
          "name": "Projections",
          "body": "Coordinate evidence. Combine several signal outputs into one reusable result."
        },
        {
          "n": "3",
          "name": "Decisions",
          "body": "Apply policy. Boolean rules over signals and projections, resolved by priority."
        },
        {
          "n": "4",
          "name": "Algorithms",
          "body": "Select one model, or coordinate several across a cascade, panel or multi-round workflow."
        },
        {
          "n": "5",
          "name": "Model pools",
          "body": "Execute. Providers bind logical model names to physical endpoints."
        }
      ],
      "source": "vllm-sr.ai/docs/overview/signal-driven-decisions",
      "note": "Inside the router there are five stages, and each one has exactly one job. That separation is what makes the policy readable — and more importantly, auditable.\n\nSignals extract facts from the request. Projections combine those facts into something reusable. Decisions apply your policy. Algorithms select a model, or coordinate several. And model pools execute.\n\nI'm going to spend the next few minutes on three of these. And I'd flag stages two and four in particular — projections and algorithms — because those are the two that most demos skip entirely, and they're where this stops being a glorified if-statement."
    },
    {
      "type": "columns",
      "at": "11:00",
      "title": "Stage 1 — Signals, and the models behind them",
      "intro": "Deterministic rules and small fine-tuned classifiers sit side by side. All of it on CPU, in the router pod.",
      "columns": [
        {
          "heading": "Deterministic",
          "body": "Keyword lists, metadata predicates, context-length bands. Cheap, auditable, trivially explained to a compliance team — and trivially evaded."
        },
        {
          "heading": "Learned",
          "body": "The Vela-1.0-Encoder-307M family, which is the project's mmBERT encoder — our router logs it as model_type \"mmbert\". Domain (14 labels), Guard (benign/jailbreak), PII (35 BIO token tags over 17 entity types), plus an embedding model for routing and the cache."
        },
        {
          "heading": "Swappable",
          "body": "Each is just a model_id in the config. Point it at your own fine-tune and it loads that instead — the project's own complexity classifier went 80.4% to 98.5% that way."
        }
      ],
      "callout": "Signals describe facts. They do not choose the backend.",
      "note": "Signals are facts extracted from the request. And the key thing is that two very different kinds of detection sit side by side.\n\nDeterministic signals are keyword lists and metadata predicates. They're cheap, they're auditable, you can explain them to a compliance team in one sentence — and they're trivially evaded.\n\nLearned signals are small fine-tuned classifiers. Domain classification across fourteen categories, a jailbreak detector, and a PII model that tags individual words across seventeen entity types. Plus an embedding model used for routing and for the cache. You'll see both kinds in the demo, and you'll see exactly why you want both.\n\nOne naming note, because two names circulate: Vela is the project's branding for its mmBERT encoders. Same models.\n\nAnd all of these are just a model ID in a config file. Point it at your own fine-tune and it loads yours instead — the project took their own complexity classifier from eighty percent to ninety-eight that way.\n\nLast thing, and it's a design discipline that matters: signals describe facts. They never choose the backend. That's the next stage's job."
    },
    {
      "type": "columns",
      "at": "12:30",
      "title": "Stage 3 — Decisions apply policy",
      "intro": "Boolean rules with arbitrary nesting. Priority resolves conflicts — the highest-priority matching decision wins.",
      "columns": [
        {
          "heading": "Our ladder, top to bottom",
          "body": "Guardrails first — PII, unsafe content, jailbreak. Then policy overrides, like an urgent security review. Then difficulty. Then intent. Anything that matches nothing falls through to the small model."
        },
        {
          "heading": "Eligibility before optimisation",
          "body": "Authorization, local-only processing, modality and context capacity make a route eligible or ineligible before any optimiser compares cost or latency."
        },
        {
          "heading": "Detection is not enforcement",
          "body": "A PII signal reports a match. The decision chooses whether to block, reroute to a local-only model, redact, or merely observe. The same detector, different policy per recipe."
        }
      ],
      "callout": "Guardrails sit far above routing, deliberately — no cost optimisation can ever outrank a safety rule.",
      "note": "Decisions are where your policy actually lives. Boolean rules, arbitrarily nested, over those signals. Priority resolves conflicts — highest matching rule wins.\n\nOur ladder, top to bottom, goes like this. Guardrails first: PII, unsafe content, jailbreak. Then policy overrides — things like an urgent security review, which should get the best model regardless of what anything else thinks. Then difficulty. Then intent. And anything that matches nothing at all falls through to the small model.\n\nThat ordering is deliberate: guardrails sit far above routing, so no cost optimisation can ever outrank a safety rule. You can't accidentally save money by skipping a check.\n\nMiddle card is a rule of thumb worth stealing: hard requirements decide eligibility before any optimiser compares cost or latency. Authorization, local-only processing, context capacity. A backend that can't legally serve the request shouldn't be in the race at all.\n\nAnd the third one is the governance story, which is much stronger than \"we block PII\". The PII signal only reports that it found something. The decision chooses what to do about it — block, reroute to a local-only model, redact, or just log it. Same detector, different policy per team."
    },
    {
      "type": "columns",
      "at": "14:00",
      "title": "Stages 2 & 4 — Projections and Algorithms",
      "intro": "The two stages most demos skip. Projections make policy readable; algorithms make it more than a switch statement.",
      "columns": [
        {
          "heading": "Projections",
          "body": "Partitions pick a coherent winner among overlapping matches. Scores combine weighted inputs. Mappings turn a score into named bands. Define a difficulty score once, reference it from ten decisions."
        },
        {
          "heading": "Selection algorithms",
          "body": "Pick one candidate — fixed order, semantic fit, measured latency, multi-factor, or Elo-style learning from feedback. Our demo runs the simplest: static."
        },
        {
          "heading": "Looper algorithms",
          "body": "Coordinate several models for one request. SELECT, CASCADE (escalate on confidence), FUSION (compare and synthesise), WORKFLOW (planner, thinker, worker, verifier)."
        }
      ],
      "callout": "quality = routing × diversity × verification × contract",
      "note": "The two stages everyone skips.\n\nProjections stop your decision list collapsing into a pile of overlapping conditions. Define a difficulty score once, then reference it from ten different rules instead of re-deriving it in each.\n\nAlgorithms are the more interesting half. Selection algorithms pick one model — fixed order, semantic fit, measured latency, or learning from feedback over time.\n\nBut loopers coordinate several models for a single request. Cascade escalates cheap-to-expensive when confidence is low. Fusion asks several and synthesises. Workflow runs planner, thinker, worker, verifier as separate roles. That's not routing any more — that's orchestration.\n\nI'll be straight: my demo uses the simplest selection algorithm and no loopers at all. But that's the ceiling of what this model can do, and it's worth knowing it's there."
    },
    {
      "type": "table",
      "at": "15:00",
      "title": "Recipes: policy you can adopt with one string",
      "intro": "A recipe owns its own signals, projections, decisions, algorithms, plugins and cache namespace. An entrypoint picks which one handles a request.",
      "head": [
        "Recipe",
        "Virtual model",
        "Optimises for"
      ],
      "rows": [
        [
          "Balance",
          "vllm-sr/mom-v1-blend",
          "Difficulty, consequential advice, answer recovery"
        ],
        [
          "Speed",
          "vllm-sr/mom-v1-flash",
          "Lighter signal set, lowest added latency"
        ],
        [
          "Cost",
          "vllm-sr/mom-v1-lite",
          "Lighter signal set, cheapest viable path"
        ],
        [
          "Accuracy",
          "vllm-sr/mom-v1-ultra",
          "Usually one strong model"
        ],
        [
          "Vault",
          "vllm-sr/mom-v1-vault",
          "Privacy — Guard and PII on Vela 2.0 0.3B"
        ]
      ],
      "callout": "Two teams, two risk appetites, one platform — and no shared global threshold to argue about.",
      "note": "One more concept and then I'll show you it running.\n\nA recipe is a complete, self-contained policy — its own signals, decisions, algorithms, plugins, even its own cache namespace. And an entrypoint decides which recipe handles a given request.\n\nThe practical bit is the middle column. These ship as virtual model names. So a team adopts an entire routing policy by changing one string in their client — point at mom-v1-lite if they care about cost, mom-v1-ultra if they care about accuracy — and they can tune a bespoke recipe later when they know what they want.\n\nAnd this answers the question every platform team asks me: can I run different policies for different consumers without standing up a second router? Yes. Two teams, two risk appetites, one platform, and nobody has to agree on a single global threshold."
    },
    {
      "type": "table",
      "at": "16:00",
      "title": "What the project reports",
      "intro": "Figures from the project's own in-house benchmarks. Not independently reproduced, and not measured by us — re-validate against your own workload before you quote them.",
      "head": [
        "Metric",
        "Reported",
        "Context"
      ],
      "rows": [
        [
          "Traffic kept local",
          "86%",
          "Simple queries to free local models instead of cloud APIs"
        ],
        [
          "Routing latency",
          "40 ms P50",
          "In-house benchmark — ~0.4% overhead against inference"
        ],
        [
          "Complexity accuracy",
          "80.4% → 98.5%",
          "Pretrained MiniLM vs their fine-tune; misrouting 19.6% → 1.5%"
        ],
        [
          "Fine-tune cost",
          "< 2 h on CPU",
          "23M-parameter model, drops in as a model swap"
        ],
        [
          "Selection algorithms",
          "11",
          "Static through Elo and Thompson sampling"
        ],
        [
          "Test-time scaling",
          "LiveCodeBench 92.6 · GPQA-Diamond 96.0",
          "A router improving on the models it routes to"
        ]
      ],
      "source": "project in-house benchmarks, via Aayush Saini — not independently reproduced",
      "note": "Let me give you some numbers, and let me be precise about where they come from.\n\nThese are the project's own in-house benchmarks. They're not independent, they haven't been reproduced by a third party, and I did not measure them. I'm showing them because they're the best public figures available, not because I can vouch for them.\n\nEighty-six percent of traffic kept on local models. Forty milliseconds P50 routing latency — and I'd flag that one specifically, because it's an internal measurement on their hardware. If you benchmark this yourself on a shared CPU node you will not see forty milliseconds, and that's not a defect.\n\nThe row I'd actually pay attention to is the fine-tuning one. They took complexity classification from eighty percent to ninety-eight and a half. Twenty-three million parameters, under two hours on CPU, and it drops in as a model swap — no architecture change, no redeployment. Their stated lesson was that the loss function mattered more than the volume of training data.\n\nRe-validate all of this against your own workload before you quote it to anyone."
    },
    {
      "type": "table",
      "at": "17:00",
      "hidden": true,
      "title": "What we measured",
      "intro": "Everything below came off the cluster behind this demo. Including the parts that did not work.",
      "head": [
        "Finding",
        "Measured",
        "So what"
      ],
      "rows": [
        [
          "Routing overhead",
          "192 ms, all signals on CPU",
          "~19% on a 1 s request, under 3% on a 7 s one. Not comparable to the project's 40 ms in-house figure — different hardware, and we run every signal family, with fact_check alone costing 178 ms"
        ],
        [
          "Guardrail block",
          "~900 ms, no GPU touched",
          "Answered by the router itself; a jailbreak costs no inference"
        ],
        [
          "Cache hit",
          "6.9 s → 0.75 s",
          "10× on an identical repeat"
        ],
        [
          "Cache precision",
          "1.0000 identical · 0.9650 wrong question · 0.8555 true paraphrase",
          "The wrong question outscores the paraphrase. At 0.95 it served an append/extend answer to an insert/remove question. Runs at 0.99"
        ],
        [
          "PII over-blocking",
          "\"starts on Monday\" and \"capital of France\"",
          "Blocked as DATE_TIME and GPE until we set an entity-type allow-list"
        ],
        [
          "Classifier footprint",
          "10.3 GB RAM, 5 CPU processes",
          "One process per Vela model; 8 GB OOMs"
        ]
      ],
      "callout": "Thresholds do not transfer across model families. Measure on your own prompts before you trust a number — including ours.",
      "note": "[This slide is hidden and is not in the running order.]\n\nIt's kept as backup in case someone asks whether any of this was actually run, or challenges the numbers on the previous slide. It holds our own measurements from this cluster: 192 ms routing overhead, roughly 900 ms guardrail blocks with no GPU involved, 6.9 seconds down to 0.75 on a cache hit, the cache-precision figures, the PII over-blocking on dates and place names, and the 10.3 GB classifier footprint.\n\nTo bring it back into the deck, remove \"hidden\": true from deck.js and rebuild."
    },
    {
      "type": "columns",
      "at": "17:20",
      "title": "Routing is not enough",
      "intro": "Defence in depth. Routing covers ingress; it cannot be the only control.",
      "columns": [
        {
          "heading": "1. Semantic routing",
          "body": "Classifies and places the majority of requests correctly, before any GPU work. Cheap, fast, and the first line."
        },
        {
          "heading": "2. Evaluation & guardrails",
          "body": "Catch what routing misclassifies. Classification is probabilistic — plan for the tail, do not pretend it is not there."
        },
        {
          "heading": "3. Egress controls",
          "body": "Filter sensitive content out of responses. A local model can still emit PII; routing never saw the answer, only the question."
        }
      ],
      "callout": "In practice that is a data policy: account records and personal data never leave the building and are logged when used · internal material may go to a cloud model only if something inspects it on the way out · public questions can go anywhere.",
      "note": "Before the demo, one honest caveat. Routing is the first line of defence. It cannot be the only one.\n\nClassification is probabilistic. It will be right most of the time, and you need to plan for the tail rather than pretend there isn't one.\n\nSo: routing places most requests correctly before any GPU work happens. Evaluation and guardrails catch what it misclassifies. And egress controls filter what comes back — because a local model can still emit sensitive data, and routing only ever saw the question, never the answer.\n\nIn practice that becomes a data policy: account records and personal data never leave the building and get logged when they're used. Internal material can go to a cloud model only if something inspects it on the way out. Public questions go anywhere.\n\nWhat I'm about to show you implements the first layer and part of the second. No egress controls at all. I'd rather tell you that than have you assume otherwise."
    },
    {
      "type": "columns",
      "at": "18:30",
      "title": "Where this bites hardest: agents",
      "intro": "An agent is not one request. It is a loop.",
      "columns": [
        {
          "heading": "The multiplier",
          "body": "A single agent task generates 10–50+ model calls. Without routing, every one of them hits the same expensive model."
        },
        {
          "heading": "The saving",
          "body": "Each call reaches the right model at the right cost — the project reports 80%+ reduction, and the easy sub-tasks come back in milliseconds from a local model."
        },
        {
          "heading": "The safety case",
          "body": "Every call in the loop passes the same classification. One policy covers an agent you did not write and cannot inspect."
        }
      ],
      "callout": "Agents do not need to know about model selection. They send model: \"auto\".",
      "note": "One last thing on where this matters most, and it's agents.\n\nAn agent isn't one request — it's a loop. A single task generates ten to fifty model calls. Without routing, every one of those hits the same expensive model.\n\nThat's the Uber slide again, just at a different scale. The multiplier is what turns a manageable bill into an unmanageable one.\n\nAnd the safety angle is underrated: every call in that loop passes the same classification. One policy covers an agent you didn't write and can't inspect — because enforcement is at the gateway, not inside the agent."
    },
    {
      "type": "compare",
      "at": "19:10",
      "title": "vLLM-SR and llm-d answer different questions",
      "intro": "Complementary, not competing. Most confusion about either one dissolves here.",
      "left": {
        "heading": "vLLM-SR — the model picker",
        "rows": [
          "Question: what model should handle this?",
          "Routes to entirely different base models.",
          "Logic: semantics, policy rules, intent, safety.",
          "Output: a declared model and a rewritten request."
        ]
      },
      "right": {
        "heading": "llm-d — the endpoint picker",
        "rows": [
          "Question: where should this request execute?",
          "Routes among replicas serving the same model.",
          "Logic: load, continuous batching, KV-cache locality.",
          "Output: a specific physical GPU instance."
        ]
      },
      "callout": "Two caches, too: ours skips whole requests; llm-d's prefix cache skips recomputing the front of every request.",
      "note": "Last slide, and it's the question I get asked most: how does this relate to llm-d?\n\nThey're not alternatives. They answer different questions.\n\nThe semantic router asks what model should handle this, and routes between entirely different base models based on semantics and policy. llm-d asks where this should execute, and routes between replicas of the same model based on load and KV-cache locality.\n\nSemantics in front, hardware scheduling behind. They compose.\n\nThere's a nice detail in the caches too — they don't overlap. Ours skips a whole request when the same question has been asked before. llm-d's prefix cache skips recomputing the shared front of every request. Different savings, same stack.\n\nRight — let me show you this actually running."
    },
    {
      "type": "columns",
      "title": "The demo: what is actually running",
      "intro": "vLLM Semantic Router on OpenShift AI, in front of two vLLM models on KServe. Everything you are about to see is live.",
      "columns": [
        {
          "heading": "Front door",
          "body": "OpenShift Route → Envoy → the router as a gRPC external processor in the same pod. One OpenAI-compatible endpoint; the client sends model: \"auto\"."
        },
        {
          "heading": "Backends",
          "body": "Qwen-2.5-7B-Instruct on an L40S for hard, urgent and quantitative work. Phi-3-mini on a T4 for everything else. Both served by vLLM on KServe."
        },
        {
          "heading": "The brain is CPU-only",
          "body": "Five Vela processes and the Go router share one container on a plain worker with no GPU. The accelerators only ever generate tokens."
        }
      ],
      "note": "Everything you're about to see is live on an OpenShift cluster. Nothing here is recorded.\n\nOne endpoint at the front: an OpenShift route into Envoy, with the router attached as an external processor in the same pod. The client sends model \"auto\" and nothing else.\n\nBehind it, two models on KServe. Qwen 2.5 7B on an L40S for the hard, urgent and quantitative work. Phi-3-mini on a T4 for everything else.\n\nAnd the part I'd draw your attention to: the five classifier processes and the router itself share one container on a plain worker node with no GPU at all. The accelerators only ever generate tokens. The intelligence layer never competes with the serving layer for hardware.\n\nFifteen use cases, about ten minutes. Let's go."
    },
    {
      "type": "table",
      "title": "Fifteen use cases, one click each",
      "intro": "Each declares the route it expects, so the console shows pass or fail against reality — including when it fails.",
      "head": [
        "Group",
        "What it shows",
        "Cases"
      ],
      "rows": [
        [
          "Intent routing",
          "Coding and math to the 7B model, general chat to the 3.8B. The client never changed.",
          "3"
        ],
        [
          "Complexity scaling",
          "Same topic, graded by difficulty, routed in opposite directions.",
          "2"
        ],
        [
          "Policy & priority",
          "Urgent security work overrides the cost optimiser; user pushback escalates and disables the cache.",
          "2"
        ],
        [
          "Guardrails",
          "Keyword rules and ML classifiers, blocking in under a second with no GPU involved.",
          "5"
        ],
        [
          "Cache & cost",
          "A repeat in 0.75 s instead of 6.9 s, a near-miss correctly refused, and pinning a model to opt out.",
          "3"
        ]
      ],
      "callout": "Suggested order: 1 → 3 → 4 → 5, then 7 → 8, then 13 → 14, then 11. Roughly 10 minutes.",
      "note": "[Map slide — don't read it. Switch to the console.]\n\nRun order: 1, 3, 4, 5 — then 7 — then 8, 9 — then 13, 14 — then 11.\n\nThree pairs do the real work.\n\n4 and 5 back to back: same topic, opposite routing, because it's grading difficulty and not subject. Say that out loud — \"it's still Python, and it still goes to the small model\".\n\n8 and 9 back to back: the second one has no banned phrase anywhere in it. That's the entire argument for having a classifier as well as a deny-list.\n\n13 and 14: the cache working, then the cache correctly refusing a question that's two words different.\n\nEvery prompt box is editable — if there's time, edit one live. It's the most convincing thing you can do."
    },
    {
      "type": "closer",
      "title": "./run_demo.sh",
      "sub": "Live demonstration",
      "links": [
        "Project · vllm-sr.ai",
        "Upstream · github.com/vllm-project/semantic-router",
        "This demo · github.com/ritzshah/vllm-semantic-router-demo"
      ],
      "note": "[Press c first so the counters start at zero.]\n\nIf you finish early: take a prompt from the audience and run it. You don't control the answer, which is the point — and the failure mode is benign. It either goes to one of two models, or a guardrail stops it.\n\nClosing line: \"The entire routing policy is one readable YAML file in that repo. All fifteen cases are documented with the measurements behind them. And it took me about an afternoon to get wrong in ten different ways, all of which are written up in the troubleshooting guide.\"\n\nThen take questions."
    }
  ]
};

if (typeof module !== "undefined" && module.exports) { module.exports = DECK; }
