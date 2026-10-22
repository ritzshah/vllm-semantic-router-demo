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
      "note": "20 minutes of slides, 10 minutes of live demo. Open on the premise, not the product: nobody in this room runs one model, and the question is who decides which one handles a given request."
    },

    {
      "type": "columns",
      "at": "1:00",
      "title": "Fragmentation changed the problem",
      "intro": "It is no longer \"which model is best\". The ecosystem fragments along four axes at once, and every one of them is a routing decision.",
      "columns": [
        { "heading": "Models & compute", "body": "Large, small, hybrid-reasoning, specialist, open and closed — across CPU, GPU, NPU and mixed fleets with different cost and energy profiles." },
        { "heading": "Location", "body": "Cloud, data centre, edge. Where a request may execute is often a compliance question before it is a performance one." },
        { "heading": "Preference", "body": "Quality, latency, cost, privacy. These conflict, and the right trade-off differs per request — not per application." }
      ],
      "callout": "Without a routing layer, every application has to navigate all four on its own.",
      "note": "Four axes. Let the audience feel the combinatorics before you offer anything. The callout is the thesis of the whole talk."
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
      "note": "This is the slide that makes a cost-conscious audience sit up. Do not rush it. The point is not that Uber was careless — it is that token-metered consumption with no routing layer has no natural ceiling."
    },

    {
      "type": "columns",
      "at": "4:00",
      "title": "The root cause: inference pipelines are content-blind",
      "intro": "A load balancer distributes requests without any idea what is in them. Four consequences, and all four are the same bug.",
      "columns": [
        { "heading": "Unnecessary spend", "body": "A one-line question and a distributed-systems design problem cost the same, because both named the same model." },
        { "heading": "Data sovereignty", "body": "PII, financial and medical content leaves the data centre to reach a cloud model, because nothing inspected it on the way out." },
        { "heading": "Safety & latency", "body": "Jailbreaks pass straight through to inference. Meanwhile trivial requests queue behind heavy reasoning work on the same backend." }
      ],
      "callout": "You cannot enforce a policy you cannot see. Routing has to read the request.",
      "note": "Tie each of the four back to the fragmentation slide. The callout is the bridge into the product."
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
      "note": "Say the formula out loud. The fourth bullet is the architectural payoff: one place to change policy, one place to audit it."
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
      "note": "If they take one slide away, make it this one. MoE is someone else's decision baked into weights. MoM is your decision, in your config, that you can change this afternoon."
    },

    {
      "type": "pipeline",
      "at": "8:00",
      "title": "Where it sits: what, which, how",
      "intro": "Three layers, one request path. The router complements your serving stack rather than replacing it.",
      "steps": [
        { "n": "1", "name": "WHAT — vLLM-SR", "body": "Chooses the logical model, from intent, complexity, privacy, modality and preference. At the gateway." },
        { "n": "2", "name": "WHICH — serving layer", "body": "llm-d, vLLM Production Stack, AIBrix, Dynamo. Picks the replica, from load, queue depth and KV-cache locality." },
        { "n": "3", "name": "HOW & WHERE — backends", "body": "vLLM and friends actually generate the tokens, on whichever accelerator and in whichever location policy allowed." }
      ],
      "note": "The router decides what logical model handles a request; the serving layer decides how to run it. Teams who already run llm-d or AIBrix need to hear that this sits in front of, not instead of, what they have."
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
      "note": "No rip and replace. Worth noting the header name: earlier builds used x-vsr-destination-endpoint with an IP; v0.3 sends the model name and Envoy owns a cluster per model."
    },

    {
      "type": "pipeline",
      "at": "10:00",
      "title": "The pipeline: five stages",
      "intro": "Each stage has one job, and that separation is what makes the policy readable and auditable.",
      "steps": [
        { "n": "1", "name": "Signals", "body": "Extract facts from the request, conversation, identity and content. Signals describe; they never choose a backend." },
        { "n": "2", "name": "Projections", "body": "Coordinate evidence. Combine several signal outputs into one reusable result." },
        { "n": "3", "name": "Decisions", "body": "Apply policy. Boolean rules over signals and projections, resolved by priority." },
        { "n": "4", "name": "Algorithms", "body": "Select one model, or coordinate several across a cascade, panel or multi-round workflow." },
        { "n": "5", "name": "Model pools", "body": "Execute. Providers bind logical model names to physical endpoints." }
      ],
      "source": "vllm-sr.ai/docs/overview/signal-driven-decisions",
      "note": "Walk left to right once, slowly. Flag that stages 2 and 4 are the ones most people have not seen — the next three slides are one per group."
    },

    {
      "type": "columns",
      "at": "11:00",
      "title": "Stage 1 — Signals, and the models behind them",
      "intro": "Deterministic rules and small fine-tuned classifiers sit side by side. All of it on CPU, in the router pod.",
      "columns": [
        { "heading": "Deterministic", "body": "Keyword lists, metadata predicates, context-length bands. Cheap, auditable, trivially explained to a compliance team — and trivially evaded." },
        { "heading": "Learned", "body": "The Vela-1.0-Encoder-307M family, which is the project's mmBERT encoder — our router logs it as model_type \"mmbert\". Domain (14 labels), Guard (benign/jailbreak), PII (35 BIO token tags over 17 entity types), plus an embedding model for routing and the cache." },
        { "heading": "Swappable", "body": "Each is just a model_id in the config. Point it at your own fine-tune and it loads that instead — the project's own complexity classifier went 80.4% to 98.5% that way." }
      ],
      "callout": "Signals describe facts. They do not choose the backend.",
      "note": "The third column matters: these are not hard-wired. The callout is the design discipline that makes one signal reusable by many decisions."
    },

    {
      "type": "columns",
      "at": "12:30",
      "title": "Stage 3 — Decisions apply policy",
      "intro": "Boolean rules with arbitrary nesting. Priority resolves conflicts — the highest-priority matching decision wins.",
      "columns": [
        { "heading": "Our ladder", "body": "Guardrails at 1000–1600 (PII, unsafe, jailbreak). Policy overrides at 220–300. Complexity at 140–145. Intent at 90–130. Fallbacks at 10–50, all pointing at the small model." },
        { "heading": "Eligibility before optimisation", "body": "Authorization, local-only processing, modality and context capacity make a route eligible or ineligible before any optimiser compares cost or latency." },
        { "heading": "Detection is not enforcement", "body": "A PII signal reports a match. The decision chooses whether to block, reroute to a local-only model, redact, or merely observe. The same detector, different policy per recipe." }
      ],
      "callout": "Three-digit gap between guardrails and routing: a cost optimisation can never outrank a safety rule.",
      "note": "The third column is the governance story and it is far stronger than \"we block PII\". In v0.3 pii stopped being a plugin type entirely — it is a signal, and enforcement belongs to the decision."
    },

    {
      "type": "columns",
      "at": "14:00",
      "title": "Stages 2 & 4 — Projections and Algorithms",
      "intro": "The two stages most demos skip. Projections make policy readable; algorithms make it more than a switch statement.",
      "columns": [
        { "heading": "Projections", "body": "Partitions pick a coherent winner among overlapping matches. Scores combine weighted inputs. Mappings turn a score into named bands. Define a difficulty score once, reference it from ten decisions." },
        { "heading": "Selection algorithms", "body": "Pick one candidate — fixed order, semantic fit, measured latency, multi-factor, or Elo-style learning from feedback. Our demo runs the simplest: static." },
        { "heading": "Looper algorithms", "body": "Coordinate several models for one request. SELECT, CASCADE (escalate on confidence), FUSION (compare and synthesise), WORKFLOW (planner, thinker, worker, verifier)." }
      ],
      "callout": "quality = routing × diversity × verification × contract",
      "note": "Loopers are the part worth dwelling on — cascade cheap-then-expensive, or panel several models and compare. That is no longer routing, it is orchestration. Be honest that our demo uses static selection and no loopers."
    },

    {
      "type": "table",
      "at": "15:00",
      "title": "Recipes: policy you can adopt with one string",
      "intro": "A recipe owns its own signals, projections, decisions, algorithms, plugins and cache namespace. An entrypoint picks which one handles a request.",
      "head": ["Recipe", "Virtual model", "Optimises for"],
      "rows": [
        ["Balance", "vllm-sr/mom-v1-blend", "Difficulty, consequential advice, answer recovery"],
        ["Speed", "vllm-sr/mom-v1-flash", "Lighter signal set, lowest added latency"],
        ["Cost", "vllm-sr/mom-v1-lite", "Lighter signal set, cheapest viable path"],
        ["Accuracy", "vllm-sr/mom-v1-ultra", "Usually one strong model"],
        ["Vault", "vllm-sr/mom-v1-vault", "Privacy — Guard and PII on Vela 2.0 0.3B"]
      ],
      "callout": "Two teams, two risk appetites, one platform — and no shared global threshold to argue about.",
      "note": "Very concrete. A team can start by swapping one model string and tune a bespoke recipe later. Our demo defines its own recipe rather than using these."
    },

    {
      "type": "table",
      "at": "16:00",
      "title": "What the project reports",
      "intro": "Figures published by the maintainers. Not ours — we have not reproduced them, and you should re-validate against your own workload.",
      "head": ["Metric", "Reported", "Context"],
      "rows": [
        ["Traffic kept local", "86%", "Simple queries to free local models instead of cloud APIs"],
        ["Routing latency", "40 ms P50", "~0.4% overhead against inference"],
        ["Complexity accuracy", "80.4% → 98.5%", "Pretrained MiniLM vs their fine-tune; misrouting 19.6% → 1.5%"],
        ["Fine-tune cost", "< 2 h on CPU", "23M-parameter model, drops in as a model swap"],
        ["Selection algorithms", "11", "Static through Elo and Thompson sampling"],
        ["Test-time scaling", "LiveCodeBench 92.6 · GPQA-Diamond 96.0", "A router improving on the models it routes to"]
      ],
      "source": "reported by the project / Aayush Saini — not reproduced by us",
      "note": "Read the intro line verbatim. Volunteering that these are someone else's numbers buys more credibility than the numbers do. The fine-tuning finding worth quoting: +18% from the right loss function versus +2% from more data."
    },

    {
      "type": "table",
      "at": "17:00",
      "title": "What we measured",
      "intro": "Everything below came off the cluster behind this demo. Including the parts that did not work.",
      "head": ["Finding", "Measured", "So what"],
      "rows": [
        ["Routing overhead", "192 ms, all signals on CPU", "~19% on a 1 s request, under 3% on a 7 s one. The project reports 40 ms — we run every signal family, and fact_check alone costs 178 ms"],
        ["Guardrail block", "~900 ms, no GPU touched", "Answered by the router itself; a jailbreak costs no inference"],
        ["Cache hit", "6.9 s → 0.75 s", "10× on an identical repeat"],
        ["Cache precision", "1.0000 identical · 0.9650 wrong question · 0.8555 true paraphrase", "The wrong question outscores the paraphrase. At 0.95 it served an append/extend answer to an insert/remove question. Runs at 0.99"],
        ["PII over-blocking", "\"starts on Monday\" and \"capital of France\"", "Blocked as DATE_TIME and GPE until we set an entity-type allow-list"],
        ["Classifier footprint", "10.3 GB RAM, 5 CPU processes", "One process per Vela model; 8 GB OOMs"]
      ],
      "callout": "Thresholds do not transfer across model families. Measure on your own prompts before you trust a number — including ours.",
      "note": "This is the slide no vendor deck has. The cache row is the one to linger on: an audience told that semantic caching understands meaning deserves to see the number where it does not."
    },

    {
      "type": "columns",
      "at": "18:00",
      "title": "Routing is not enough",
      "intro": "Defence in depth. Routing covers ingress; it cannot be the only control.",
      "columns": [
        { "heading": "1. Semantic routing", "body": "Classifies and places the majority of requests correctly, before any GPU work. Cheap, fast, and the first line." },
        { "heading": "2. Evaluation & guardrails", "body": "Catch what routing misclassifies. Classification is probabilistic — plan for the tail, do not pretend it is not there." },
        { "heading": "3. Egress controls", "body": "Filter sensitive content out of responses. A local model can still emit PII; routing never saw the answer, only the question." }
      ],
      "callout": "Sensitivity tiers in practice: Critical (PII, accounts) on-prem only with audit · High on-prem preferred · Medium cloud with DLP · Low anywhere.",
      "note": "Be straight that our demo implements layer one and part of layer two, and no egress controls at all. Saying so is what makes the rest of the deck believable."
    },

    {
      "type": "columns",
      "at": "18:45",
      "title": "Where this bites hardest: agents",
      "intro": "An agent is not one request. It is a loop.",
      "columns": [
        { "heading": "The multiplier", "body": "A single agent task generates 10–50+ model calls. Without routing, every one of them hits the same expensive model." },
        { "heading": "The saving", "body": "Each call reaches the right model at the right cost — the project reports 80%+ reduction, and the easy sub-tasks come back in milliseconds from a local model." },
        { "heading": "The safety case", "body": "Every call in the loop passes the same classification. One policy covers an agent you did not write and cannot inspect." }
      ],
      "callout": "Agents do not need to know about model selection. They send model: \"auto\".",
      "note": "This is the slide that lands with anyone building agentic systems — the cost multiplier is the whole argument, and it is the same argument as the Uber slide at a different scale."
    },

    {
      "type": "compare",
      "at": "19:15",
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
      "note": "Semantics in front, hardware scheduling behind. This is the last slide before the demo — finish it and switch."
    },

    {
      "type": "columns",
      "title": "The demo: what is actually running",
      "intro": "vLLM Semantic Router on OpenShift AI, in front of two vLLM models on KServe. Everything you are about to see is live.",
      "columns": [
        { "heading": "Front door", "body": "OpenShift Route → Envoy → the router as a gRPC external processor in the same pod. One OpenAI-compatible endpoint; the client sends model: \"auto\"." },
        { "heading": "Backends", "body": "Qwen-2.5-7B-Instruct on an L40S for hard, urgent and quantitative work. Phi-3-mini on a T4 for everything else. Both served by vLLM on KServe." },
        { "heading": "The brain is CPU-only", "body": "Five Vela processes and the Go router share one container on a plain worker with no GPU. The accelerators only ever generate tokens." }
      ],
      "note": "The slide people photograph. Ten minutes from here. Have the console already open on a second tab with the counters cleared."
    },

    {
      "type": "table",
      "title": "Fifteen use cases, one click each",
      "intro": "Each declares the route it expects, so the console shows pass or fail against reality — including when it fails.",
      "head": ["Group", "What it shows", "Cases"],
      "rows": [
        ["Intent routing", "Coding and math to the 7B model, general chat to the 3.8B. The client never changed.", "3"],
        ["Complexity scaling", "Same topic, graded by difficulty, routed in opposite directions.", "2"],
        ["Policy & priority", "Urgent security work overrides the cost optimiser; user pushback escalates and disables the cache.", "2"],
        ["Guardrails", "Keyword rules and ML classifiers, blocking in under a second with no GPU involved.", "5"],
        ["Cache & cost", "A repeat in 0.75 s instead of 6.9 s, a near-miss correctly refused, and pinning a model to opt out.", "3"]
      ],
      "callout": "Suggested order: 1 → 3 → 4 → 5, then 7 → 8, then 13 → 14, then 11. Roughly 10 minutes.",
      "note": "Do not read this table. Switch to the console and run them. Lead with the two complexity cases back to back, then the two jailbreak cases back to back — those pairs do the work."
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
      "note": "Switch to the console. Press c first so the tally starts at zero in front of them."
    }
  ]
};

if (typeof module !== "undefined" && module.exports) { module.exports = DECK; }
