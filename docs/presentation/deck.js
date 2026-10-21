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
 * Every factual claim here is grounded in https://vllm-sr.ai/docs/ as of
 * 21 October 2026, or in this repository's own deployment. Where a figure
 * comes from older project material and has not been re-validated, the slide
 * says so rather than asserting it.
 */

const DECK = {
  "title": "vLLM Semantic Router",
  "subtitle": "Intelligence beyond any one model",
  "footer": "vLLM Semantic Router · Apache 2.0 · vllm-sr.ai",
  "slides": [
    {
      "type": "title",
      "title": "Intelligence Beyond Any One Model",
      "subtitle": "vLLM Semantic Router",
      "tagline": "Signal-driven routing, guardrails and semantic caching for Mixture-of-Models systems on OpenShift AI.",
      "note": "Open on the premise, not the product. Nobody in this room runs one model. The question is who decides which one handles a given request — and today that decision is scattered across every application you own."
    },

    {
      "type": "statement",
      "title": "Every application is making the same decision, separately",
      "lead": "Model choice is hard-coded in application code, repeated in every service, and invisible to the platform team.",
      "points": [
        "A trivial request and a hard one cost the same, because both named the same model.",
        "Safety and privacy policy is re-implemented per application, inconsistently.",
        "Nobody can answer “why did this request go there?” after the fact.",
        "Adding a model means changing every client that might want it."
      ],
      "note": "This is the pain. Let it land before naming the product. Most teams recognise at least three of these four."
    },

    {
      "type": "statement",
      "title": "A shared decision layer, not another SDK",
      "lead": "“An open-source routing and control layer for building Mixture-of-Models systems across heterogeneous AI infrastructure.”",
      "points": [
        "The right model path — direct, specialist, local, cascade, or collaborative.",
        "The right supporting capabilities — retrieval, memory, tools, prompts, caching, verification.",
        "The right execution boundary — configured cloud, data center, or edge backends.",
        "Evidence for what happened — routing metadata plus feedback and evaluation workflows."
      ],
      "source": "vllm-sr.ai/docs/intro",
      "note": "Read the quote verbatim — it is the project's own framing. The four bullets are the four things it decides. Note the fourth: this is auditable, which is what makes it a platform concern rather than a clever proxy."
    },

    {
      "type": "compare",
      "title": "Mixture-of-Models is not Mixture-of-Experts",
      "intro": "These get conflated constantly. They operate at completely different levels.",
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
          "A system pattern orchestrating multiple independent models.",
          "Models differ in architecture, training data, capabilities and hardware.",
          "Chosen by you, in configuration, at request time.",
          "Every decision is declared in YAML and observable."
        ]
      },
      "note": "If the audience takes one slide away, make it this one. MoE is someone else's decision baked into weights. MoM is your decision, in your config, that you can audit and change this afternoon."
    },

    {
      "type": "statement",
      "title": "How it attaches: an Envoy external processor",
      "lead": "The router is not in your request path as a library. It is a gRPC external processor that Envoy consults mid-request.",
      "points": [
        "Clients speak the ordinary OpenAI-compatible API. No SDK, no client change.",
        "Envoy calls the router over gRPC; the router classifies and returns a decision.",
        "The router can answer immediately — a guardrail block or a cache hit never reaches a model.",
        "Otherwise it rewrites the request and Envoy forwards it to the chosen backend."
      ],
      "note": "The architectural point: this composes with what you already run. Standard Envoy, Kubernetes Gateway API, Istio. It is not a new front door you have to adopt wholesale."
    },

    {
      "type": "pipeline",
      "title": "The pipeline: five stages",
      "intro": "Each stage has one job, and the separation is what makes the policy readable.",
      "steps": [
        { "n": "1", "name": "Signals", "body": "Extract facts from the request, conversation, identity and content. Signals describe; they never choose a backend." },
        { "n": "2", "name": "Projections", "body": "Coordinate evidence. Combine several signal outputs into one reusable result." },
        { "n": "3", "name": "Decisions", "body": "Apply policy. Boolean rules over signals and projections, resolved by priority." },
        { "n": "4", "name": "Algorithms", "body": "Select one model, or coordinate several across a cascade, panel or multi-round workflow." },
        { "n": "5", "name": "Model Pools", "body": "Execute. Providers bind logical model names to physical endpoints." }
      ],
      "source": "vllm-sr.ai/docs/overview/signal-driven-decisions",
      "note": "Walk left to right once, slowly. The rest of the deck is one slide per stage. Flag that stages 2 and 4 are the ones people usually have not seen."
    },

    {
      "type": "columns",
      "title": "Stage 1 — Signals extract facts",
      "intro": "“A signal gives a name to something detected from the request, conversation, identity, or content.” Deterministic and learned signals sit side by side.",
      "columns": [
        { "heading": "Deterministic", "body": "Keyword lists, metadata predicates, context-length bands. Cheap, auditable, trivially explained to a compliance team — and trivially evaded." },
        { "heading": "Learned", "body": "Embedding similarity and classifier models detecting intent, domain, complexity, PII and jailbreak patterns. Robust to paraphrase; probabilistic." },
        { "heading": "Dimensions observed", "body": "Intent, difficulty, context, modality, identity, risk, preference, and system state." }
      ],
      "callout": "Signals describe facts. They do not choose the backend.",
      "note": "The callout is the design discipline that makes the whole thing composable: one signal can be reused by many decisions, because it has no opinion about outcomes."
    },

    {
      "type": "columns",
      "title": "Stage 2 — Projections coordinate evidence",
      "intro": "The stage most people have not seen. Projections turn overlapping, noisy signal output into something a policy can reference without repeating itself.",
      "columns": [
        { "heading": "Partitions", "body": "“Choose a coherent winner among overlapping matches.” When three domain classifiers all fire, a partition decides which one the policy acts on." },
        { "heading": "Scores", "body": "“Combine weighted inputs.” Complexity and context evidence collapse into a single difficulty score." },
        { "heading": "Mappings", "body": "“Convert a score into named routing bands.” A continuous difficulty score becomes easy / medium / hard, which a decision can match on." }
      ],
      "note": "This is what stops your decision list becoming an unmaintainable pile of overlapping conditions. Define the difficulty score once; reference it from ten decisions."
    },

    {
      "type": "columns",
      "title": "Stage 3 — Decisions apply policy",
      "intro": "Boolean rules with arbitrary nesting over signals and projections. Priority resolves conflicts: the highest-priority matching decision wins.",
      "columns": [
        { "heading": "Eligibility before optimisation", "body": "“Authorization, local-only processing, modality, context capacity, and tool compatibility should make a route eligible or ineligible before an optimizer compares cost or latency.”" },
        { "heading": "What a match supplies", "body": "Candidate models, an optional algorithm, and route-local plugins — so caching and guardrail behaviour can differ per route." },
        { "heading": "Detection ≠ enforcement", "body": "A PII signal reports a match. The decision and its plugins choose whether to block, reroute, transform, or merely observe." }
      ],
      "callout": "Hard requirements stay visible in the policy, not buried in a scoring function.",
      "note": "The third column is the governance story, and it is much stronger than ‘we block PII’. The same detector can be advisory in one recipe and blocking in another."
    },

    {
      "type": "columns",
      "title": "Stage 4 — Algorithms select or coordinate",
      "intro": "Two families. Most demos only ever show the first.",
      "columns": [
        { "heading": "Selection algorithms", "body": "Choose one candidate from the eligible set — by fixed order, semantic fit, measured latency, or accumulated feedback." },
        { "heading": "Looper algorithms", "body": "Coordinate several models: cascades, panels, multi-round processes and workflows. One request, many models, orchestrated by the router." },
        { "heading": "Why it sits here", "body": "Eligibility was already settled in stage 3, so an optimiser can compare cost and latency freely without violating a hard requirement." }
      ],
      "note": "Loopers are the part worth dwelling on — cascade cheap-then-expensive, or panel several models and compare. That is not routing any more; it is orchestration."
    },

    {
      "type": "columns",
      "title": "Stage 5 — Model pools execute",
      "intro": "Providers bind logical model names to physical endpoints, so policy never hard-codes an address.",
      "columns": [
        { "heading": "Heterogeneous by design", "body": "Local vLLM or Ollama, Kubernetes services, and remote OpenAI-compatible endpoints can all sit in the same pool." },
        { "heading": "Clear division of labour", "body": "The router picks the path; the backend owns replica placement. It does not try to be a load balancer." },
        { "heading": "Pass-through is explicit", "body": "Naming a concrete backend model bypasses recipe signals, decisions, route-local plugins, cache, learning and session routing." }
      ],
      "note": "The third column is your demo's before/after in one sentence: pin a model and you opt out of everything the router does for you."
    },

    {
      "type": "columns",
      "title": "Recipes and entrypoints",
      "intro": "A recipe is the unit of policy isolation. An entrypoint selects which recipe handles a request.",
      "columns": [
        { "heading": "What a recipe owns", "body": "Its own signals, projections, decisions, algorithms, plugins, cache namespace and routing state." },
        { "heading": "What it shares", "body": "Providers and stores can be shared across recipes without policy leaking between them." },
        { "heading": "Why you want this", "body": "Two teams, two risk appetites, one platform. Nobody has to agree on a single global threshold." }
      ],
      "note": "This is the answer to the question a platform team always asks: can I run different policies for different consumers without standing up a second router? Yes."
    },

    {
      "type": "table",
      "title": "MoM V1 ships five built-in recipes",
      "intro": "Each is exposed as a virtual model name, so adopting one is a string change in the client.",
      "head": ["Recipe", "Virtual model", "Optimises for"],
      "rows": [
        ["Balance", "vllm-sr/mom-v1-blend", "Difficulty, consequential advice and answer-recovery signals"],
        ["Speed", "vllm-sr/mom-v1-flash", "Lighter signal set, lowest added latency"],
        ["Cost", "vllm-sr/mom-v1-lite", "Lighter signal set, cheapest viable path"],
        ["Accuracy", "vllm-sr/mom-v1-ultra", "Usually one strong model"],
        ["Vault", "vllm-sr/mom-v1-vault", "Privacy — Guard and PII on Vela 2.0 0.3B"]
      ],
      "source": "vllm-sr.ai/docs/next/overview/mom-model-family",
      "note": "Very concrete. Point out that a team can start by swapping one string and tune a bespoke recipe later."
    },

    {
      "type": "columns",
      "title": "The model family behind the signals",
      "intro": "Signal extraction runs on small, specialised models — not on the GPUs serving your traffic.",
      "columns": [
        { "heading": "Vela 2.0 0.3B", "body": "Classification model used for Guard and PII in the Vault recipe. Reads up to 8,192 tokens, truncating beyond that." },
        { "heading": "Decision models", "body": "Shipped open in v0.4 “Hermes”, alongside the Vela classification models, as one Mixture-of-Models system." },
        { "heading": "CPU-native", "body": "Signal extraction does not need GPU compute. Your accelerators stay dedicated to serving tokens." }
      ],
      "note": "The CPU point is the one infrastructure people care about: the intelligence layer does not compete with the serving layer for GPUs."
    },

    {
      "type": "columns",
      "title": "Plugins: what happens on the way through",
      "intro": "Configurable per decision, so a route can tighten or disable any of them.",
      "columns": [
        { "heading": "Semantic cache", "body": "Embedding similarity, not a hash. A reworded question hits the same cache entry. Thresholds are per-route — strict where a near-miss would be costly." },
        { "heading": "Prompt guard", "body": "Jailbreak detection combining deterministic phrase rules with a classifier, so an unseen phrasing is still caught." },
        { "heading": "PII handling", "body": "Token-level entity detection. Whether that blocks, redacts, reroutes or just records is the decision's call, not the detector's." }
      ],
      "note": "Call out that a cache hit and a guardrail block are both answered by the router — neither reaches a GPU. That is where the latency contrast in the demo comes from."
    },

    {
      "type": "columns",
      "title": "Footprint and prerequisites",
      "intro": "Two layers with very different hardware profiles.",
      "columns": [
        { "heading": "Router layer", "body": "Runs entirely on CPU. In the Kubernetes deployment in this repo the router pod requests 4 GB and is limited to 8 GB, and pulls roughly 4 GB of classifier weights onto a PVC on first start." },
        { "heading": "Backend layer", "body": "GPUs, for the models actually generating tokens. Any OpenAI-compatible server — this demo uses vLLM on KServe." },
        { "heading": "Deployment", "body": "Docker or Podman for local evaluation; Kubernetes for anything real." }
      ],
      "note": "Be honest about the 8 GB. Older material quotes ~440 MB, which is the adapter footprint, not what a Kubernetes pod loading four classifiers actually needs. Understating it only creates a support question later."
    },

    {
      "type": "columns",
      "title": "Compatible with what you already run",
      "intro": "The router is an Envoy external processor, so it inherits the ecosystem rather than replacing it.",
      "columns": [
        { "heading": "API surface", "body": "OpenAI-compatible and Anthropic-compatible endpoints. Clients do not change." },
        { "heading": "Infrastructure", "body": "Standard Envoy, Kubernetes Gateway API, Istio service mesh." },
        { "heading": "Backends", "body": "vLLM, Ollama, Kubernetes services, and remote OpenAI-compatible providers, mixed freely in one pool." }
      ],
      "note": "Short slide. The message is ‘no rip and replace’ — do not spend long here."
    },

    {
      "type": "compare",
      "title": "vLLM-SR and llm-d answer different questions",
      "intro": "They are complementary, not competing. Most confusion about either one dissolves here.",
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
      "note": "This was the strongest slide in the original deck and it survives unchanged. Semantics in front, hardware scheduling behind."
    },

    {
      "type": "pipeline",
      "title": "Together: one request, two routing layers",
      "intro": "The semantic router goes in front, because there is no point scheduling GPU work for a request a guardrail is about to block.",
      "steps": [
        { "n": "1", "name": "Gateway", "body": "Request arrives at Istio or the Kubernetes Gateway API." },
        { "n": "2", "name": "vLLM-SR", "body": "Signals, policy and guardrails. Selects a model — or answers immediately." },
        { "n": "3", "name": "InferencePool", "body": "The chosen logical model resolves to a pool of replicas." },
        { "n": "4", "name": "llm-d", "body": "Prefix-cache-aware scheduling picks the best replica." },
        { "n": "5", "name": "GPU", "body": "Prefill and decode run where the cache already is." }
      ],
      "note": "Two caches, and they are complementary: the router's semantic cache skips whole requests; llm-d's prefix cache skips recomputing the shared front of every request."
    },

    {
      "type": "columns",
      "title": "The demo: what is actually running",
      "intro": "vLLM Semantic Router on OpenShift AI, in front of two vLLM backends on KServe.",
      "columns": [
        { "heading": "Front door", "body": "OpenShift Route → Envoy → the router as a gRPC external processor in the same pod. One OpenAI-compatible endpoint; clients send model: “auto”." },
        { "heading": "Backends", "body": "Qwen-2.5-7B-Instruct for hard, urgent and quantitative work. Phi-3-mini for everything else. Each on its own GPU, served by vLLM on KServe." },
        { "heading": "Policy", "body": "Fourteen decisions in one YAML file. Guardrails at priority 1000–1600, routing at 10–300, so a routing change can never outrank a safety rule." }
      ],
      "note": "This is the slide people photograph. Have the architecture diagram from the repo open in a second tab if anyone asks for detail."
    },

    {
      "type": "table",
      "title": "Fifteen use cases, one click each",
      "intro": "Every case declares the route it expects, so the console shows a pass or fail badge against reality.",
      "head": ["Group", "What it shows", "Cases"],
      "rows": [
        ["Intent routing", "Coding and math go to the 7B model; general chat goes to the 3.8B one. The client never changed.", "3"],
        ["Complexity scaling", "The same topic, graded by difficulty, routed in opposite directions.", "2"],
        ["Policy & priority", "Urgent security work overrides the cost optimiser. User pushback escalates and disables the cache.", "2"],
        ["Guardrails", "Keyword rules and ML classifiers, blocking in tens of milliseconds with no GPU involved.", "5"],
        ["Cache & cost", "A reworded question hits the cache. Pinning a model opts out of all of it.", "3"]
      ],
      "note": "Do not read the table. Switch to the console and run them. Lead with the two complexity cases back to back, then the two jailbreak cases back to back."
    },

    {
      "type": "columns",
      "title": "Where the project is going",
      "intro": "Worth naming the release you are demoing — this is moving quickly.",
      "columns": [
        { "heading": "v0.4 “Hermes”", "body": "Shipped open Decision models and Vela classification models together as one Mixture-of-Models system." },
        { "heading": "v0.5 “Ariadne”", "body": "Focused on following a route across models, sessions and evaluation — closing the loop from decision to outcome." },
        { "heading": "Also in the docs", "body": "sr-bench 1.0 as the project's benchmark suite, and a Fleet Simulator for capacity planning and power modelling." }
      ],
      "callout": "Early project material quotes up to 10% higher accuracy, 50% lower latency and 50% fewer tokens. Treat those as indicative and re-validate against sr-bench for your own workload.",
      "note": "Say the callout out loud rather than hiding it. Volunteering the caveat on your own numbers buys you more credibility than the numbers do."
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
      "note": "Switch to the console. Clear the counters first so the tally starts at zero in front of them."
    }
  ]
};

if (typeof module !== "undefined" && module.exports) { module.exports = DECK; }
