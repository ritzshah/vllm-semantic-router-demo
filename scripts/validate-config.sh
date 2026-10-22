#!/usr/bin/env bash
#
# Check the router config before you deploy it.
#
#   scripts/validate-config.sh                  # the config in this repo
#   scripts/validate-config.sh path/to/cm.yaml  # some other ConfigMap
#
# The router validates its own config, but it does so one error at a time and
# only at startup — so a config with three problems costs three
# apply-crashloop-read-logs cycles. This checks all of them at once, offline,
# in about a second.
#
# What it catches:
#   - top-level keys that are not canonical v0.3
#   - signal families using a legacy name (keyword_rules, context_rules, ...)
#   - decisions referencing a signal that was never declared
#   - unsubstituted __*_ENDPOINT_IP__ placeholders (a warning, not an error —
#     wire-endpoints.sh fills those in at deploy time)
#
# Requires ruby, which ships with macOS and most Linux distributions.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_cmd ruby
TARGET="${1:-$REPO_ROOT/deploy/router/03-configmap-router.yaml}"
[[ -f "$TARGET" ]] || die "No such file: $TARGET"

step "Validating $(basename "$TARGET")"

ruby -ryaml - "$TARGET" <<'RUBY'
CANONICAL_TOP = %w[version global listeners entrypoints providers routing recipes evaluation].freeze

CANONICAL_SIGNALS = %w[keywords embeddings domains fact_check user_feedbacks reasks preferences
                       language context structure complexity modality role_bindings jailbreak
                       safety hallucination pii kb conversation events metadata classifiers
                       input_modality actions decision topic_continuity].freeze

LEGACY_SIGNALS = {
  'keyword_rules' => 'keywords', 'embedding_rules' => 'embeddings', 'categories' => 'domains',
  'fact_check_rules' => 'fact_check', 'user_feedback_rules' => 'user_feedbacks',
  'reask_rules' => 'reasks', 'preference_rules' => 'preferences', 'language_rules' => 'language',
  'context_rules' => 'context', 'structure_rules' => 'structure',
  'complexity_rules' => 'complexity', 'modality_rules' => 'modality',
}.freeze

# Decision condition `type` -> the signals family that must declare the name.
TYPE_TO_FAMILY = {
  'keyword' => 'keywords', 'embedding' => 'embeddings', 'domain' => 'domains',
  'fact_check' => 'fact_check', 'user_feedback' => 'user_feedbacks', 'reask' => 'reasks',
  'preference' => 'preferences', 'language' => 'language', 'context' => 'context',
  'structure' => 'structure', 'complexity' => 'complexity', 'modality' => 'modality',
  'authz' => 'role_bindings', 'jailbreak' => 'jailbreak', 'safety' => 'safety',
  'hallucination' => 'hallucination', 'pii' => 'pii', 'kb' => 'kb',
  'conversation' => 'conversation', 'event' => 'events', 'metadata' => 'metadata',
  'classifier' => 'classifiers', 'input_modality' => 'input_modality', 'action' => 'actions',
  'decision' => 'decision', 'topic_continuity' => 'topic_continuity',
}.freeze

path = ARGV[0]
errors = []
warnings = []

doc = YAML.load_file(path)
raw = doc.is_a?(Hash) && doc['data'] ? doc['data']['config.yaml'] : File.read(path)
abort "could not find data['config.yaml'] in #{path}" if raw.nil?

placeholders = raw.scan(/__\w+_ENDPOINT_IP__/).uniq
warnings << "unsubstituted placeholders: #{placeholders.join(', ')} (wire-endpoints.sh fills these in)" if placeholders.any?

cfg = begin
  YAML.safe_load(raw)
rescue => e
  abort "embedded config.yaml is not valid YAML: #{e.message}"
end

# --- top level ---------------------------------------------------------
if cfg['version'].to_s != 'v0.3'
  errors << "version is #{cfg['version'].inspect}, expected \"v0.3\""
end
(cfg.keys - CANONICAL_TOP).each do |k|
  errors << "top-level key #{k.inspect} is not canonical v0.3 " \
            "(expected any of: #{CANONICAL_TOP.join(', ')})"
end

signals  = cfg.dig('routing', 'signals') || {}
decisions = cfg.dig('routing', 'decisions') || []

# --- signal family names -----------------------------------------------
signals.each_key do |fam|
  next if CANONICAL_SIGNALS.include?(fam)
  if LEGACY_SIGNALS.key?(fam)
    errors << "routing.signals.#{fam} is the legacy name — rename it to #{LEGACY_SIGNALS[fam]}"
  else
    errors << "routing.signals.#{fam} is not a known signal family"
  end
end

declared = signals.each_with_object({}) do |(fam, list), h|
  h[fam] = Array(list).map { |e| e.is_a?(Hash) ? e['name'] : e }.compact
end

# --- mmlu categories ----------------------------------------------------
# v0.3 accepts only the 14 broad MMLU-Pro categories. Fine-grained subject
# names from the older config (computer_security, abstract_algebra, ...) are
# rejected outright.
MMLU = ['biology', 'business', 'chemistry', 'computer science', 'economics',
        'engineering', 'health', 'history', 'law', 'math', 'other',
        'philosophy', 'physics', 'psychology'].freeze

Array(signals['domains']).each do |d|
  Array(d['mmlu_categories']).each do |c|
    next if MMLU.include?(c)
    guess = MMLU.find { |m| m.split.first == c.to_s.split('_').last } ||
            MMLU.find { |m| c.to_s.include?(m.split.first) }
    errors << "routing.signals.domains[#{d['name'].inspect}].mmlu_categories: " \
              "#{c.inspect} is not supported#{guess ? " — did you mean #{guess.inspect}?" : ''}"
  end
end

# --- decision references ------------------------------------------------
def each_condition(node, &blk)
  return unless node.is_a?(Hash)
  blk.call(node) if node['type']
  Array(node['conditions']).each { |c| each_condition(c, &blk) }
end

# Plugin types the v0.3 router accepts. Notably `pii` is NOT one: PII is a
# signal that detects, and a decision enforces. That separation is deliberate
# upstream — the same detector can block in one recipe and merely observe in
# another.
PLUGIN_TYPES = %w[fast_response response_cache system_prompt prompt_guard
                  tool_selection memory reasoning].freeze
PLUGIN_ALIASES = { 'semantic-cache' => 'response_cache' }.freeze

seen_names = []
decisions.each do |d|
  name = d['name']
  seen_names << name
  errors << "a decision has no priority: #{name.inspect}" if d['priority'].nil?

  Array(d['plugins']).each do |p|
    t = p['type']
    next if PLUGIN_TYPES.include?(t)
    if PLUGIN_ALIASES.key?(t)
      warnings << "#{name}: plugin #{t.inspect} is a deprecated alias for " \
                  "#{PLUGIN_ALIASES[t].inspect}"
    elsif t == 'pii'
      errors << "#{name}: plugin type \"pii\" no longer exists — PII is a signal, and " \
                "enforcement belongs in a decision (see block_pii_content)"
    else
      errors << "#{name}: unsupported plugin type #{t.inspect} " \
                "(supported: #{PLUGIN_TYPES.join(', ')})"
    end
  end

  each_condition(d['rules']) do |c|
    family = TYPE_TO_FAMILY[c['type']]
    if family.nil?
      errors << "#{name}: condition type #{c['type'].inspect} is not a known signal type"
      next
    end
    # complexity references carry a band suffix, e.g. code_complexity:hard
    base = c['name'].to_s.split(':').first
    unless (declared[family] || []).include?(base)
      errors << "#{name}: #{c['type']}(#{c['name'].inspect}) — " \
                "routing.signals.#{family} does not declare #{base.inspect}"
    end
  end
end

# group_by rather than tally: macOS still ships Ruby 2.6, and tally arrived in 2.7.
seen_names.group_by { |n| n }.each do |n, occurrences|
  errors << "duplicate decision name: #{n.inspect}" if occurrences.length > 1
end

# --- model references ---------------------------------------------------
provider_models = Array(cfg.dig('providers', 'models')).map { |m| m['name'] }.compact
decisions.each do |d|
  Array(d['modelRefs']).each do |ref|
    unless provider_models.include?(ref['model'])
      errors << "#{d['name']}: modelRef #{ref['model'].inspect} is not in providers.models " \
                "(#{provider_models.join(', ')})"
    end
  end
end

# --- report -------------------------------------------------------------
warnings.each { |w| puts "    \e[33m!\e[0m #{w}" }

if errors.empty?
  puts "    \e[32m✓\e[0m version v0.3, #{decisions.length} decisions, " \
       "#{signals.keys.length} signal families, #{provider_models.length} models"
  puts "    \e[32m✓\e[0m every decision reference resolves"
  exit 0
end

puts "    \e[31m✕\e[0m #{errors.length} problem#{errors.length == 1 ? '' : 's'}:"
errors.each { |e| puts "        - #{e}" }
exit 1
RUBY
