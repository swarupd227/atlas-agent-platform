#!/usr/bin/env python3
"""
Convert all ARRAY[...] text-array literals to proper jsonb literals for columns
that are jsonb in production. Handles multi-line INSERT statements by reassembling
them before processing, then writing back with the original line breaks preserved.
"""

import re, sys, json

JSONB_COLS = {
    "aar_action_decisions":      {"policies_evaluated","rules_triggered"},
    "aar_configs":               {"allowed_tools","denied_tools","health_summary","module_config",
                                  "rate_limits","require_approval_tools"},
    "agent_proposals":           {"orchestrator","pipeline","selected_indices","workers"},
    "agent_runtime_runs":        {"input_config","result_summary","steps_json"},
    "agent_templates":           {"blueprint_json","cost_profile","eval_bindings","memory_rag_config",
                                  "optional_skills","permissions_config","policy_bindings",
                                  "preloaded_skills","required_skills","rollback_plan","tools_config"},
    "agents":                    {"blueprint_json","ci_cd_config","eval_bindings","git_config",
                                  "maturity_factors","memory_governance_rules","memory_rag_config",
                                  "ontology_tags","permissions_config","policy_bindings",
                                  "preloaded_skills","rollback_plan","runtime_config","tools_config"},
    "autonomy_profiles":         {"autonomy_levels","learning_data","override_rules","risk_dimensions"},
    "blueprints":                {"blueprint_json","validation_results","version_history"},
    "context_economics":         {"kb_source_details","sections"},
    "context_profiles":          {"budget_allocations","priority_order","sources","version_history"},
    "deployments":               {"autopromote_config","canary_config","evidence_package",
                                  "industry_rollback_triggers","pipeline_stages","rollback_config"},
    "eval_runs":                 {"results_json"},
    "eval_suites":               {"environment_thresholds","ontology_tags","scorer_config","threshold_config"},
    "eval_test_cases":           {"expected_output","input_data"},
    "generation_metadata_records": {"quality_details","validation_errors"},
    "golden_data_records":       {"expected_output","input_data","metadata"},
    "golden_datasets":           {"benchmark_range","contributors","coverage_dimensions",
                                  "growth_history","performance_benchmarks","scenario_categories"},
    "golden_test_cases":         {"evaluation_criteria","rubric_scoring"},
    "healing_pipelines":         {"business_impact","diagnosis_details","experiment_config",
                                  "experiment_results","hypothesis","industry_guardrails",
                                  "remediation","resolution"},
    "mcp_server_prompts":        {"arguments","embedded_resource_refs","messages"},
    "mcp_server_tools":          {"annotations","behavior_baseline","input_schema",
                                  "ontology_tags","output_schema"},
    "mcp_servers":               {"capabilities","server_info"},
    "memory_profiles":           {"forgetting_policies","industry_rules","tier_configs","version_history"},
    "ontology_concepts":         {"linked_regulations","properties","relationships",
                                  "sensitivity_classification","version_history"},
    "ontology_enhancements":     {"agent_skills","agent_types","agent_use_cases","related_standards",
                                  "risk_factors","suggested_properties","suggested_relationships",
                                  "suggested_tags"},
    "outcome_contracts":         {"approval_gates","attribution_rules","constraint_graph",
                                  "pricing_tiers","roi_estimate","sla_config"},
    "oversight_decisions":       {"industry_context","ontology_refs","precedent_rule",
                                  "reasoning_chain","regulatory_policies","requested_action",
                                  "risk_dimensions","similar_decisions"},
    "policies":                  {"ontology_refs","policy_json","version_history"},
    "regulations":               {"ai_enrichment"},
    "run_traces":                {"decisions","policy_checks","prompt_inputs","provenance_snapshot",
                                  "retrieved_docs","soft_policy_violations","steps_json",
                                  "token_usage","tool_calls"},
    "runbooks":                  {"approval_gates","steps","trigger_conditions"},
    "shadow_traces":             {"regulatory_context","trace_input","trace_metadata","trace_output"},
    "skill_chains":              {"conflicts","context_budget","edges","nodes"},
    "skills":                    {"ai_enrichment","dependencies","knowledge_queries","yaml_frontmatter"},
    "team_blueprint_edges":      {"allowed_metadata","config","retry_policy"},
    "team_blueprint_nodes":      {"config","fallback_output","output_schema","retry_policy"},
    "tool_connectors":           {"configured_secrets","recent_schema_changes","retry_policy"},
}

def parse_col_names(col_str):
    return [c.strip().strip('"') for c in col_str.split(',')]

def split_values(values_str):
    """Tokenise a SQL VALUES list, respecting single-quoted strings and [] {} () nesting."""
    tokens, current = [], []
    depth, in_single = 0, False
    i = 0
    while i < len(values_str):
        c = values_str[i]
        if in_single:
            if c == "'" and i + 1 < len(values_str) and values_str[i+1] == "'":
                current.append("''"); i += 2; continue
            elif c == "'":
                in_single = False; current.append(c)
            else:
                current.append(c)
        else:
            if c == "'":
                in_single = True; current.append(c)
            elif c in ('(', '[', '{'):
                depth += 1; current.append(c)
            elif c in (')', ']', '}'):
                depth -= 1; current.append(c)
            elif c == ',' and depth == 0:
                tokens.append(''.join(current).strip()); current = []
            else:
                current.append(c)
        i += 1
    if current:
        tokens.append(''.join(current).strip())
    return tokens

def parse_text_array(token):
    """Parse ARRAY['el1','el2'] or ARRAY[]::text[] → list of strings, or None if not an array."""
    if re.match(r"^ARRAY\[\]", token):
        return []
    m = re.match(r"^ARRAY\[(.+)\](?:::text\[\])?$", token, re.DOTALL)
    if not m:
        return None
    inner = m.group(1)
    elems, i = [], 0
    while i < len(inner):
        while i < len(inner) and inner[i] in (' ', '\t', '\n', ','):
            i += 1
        if i >= len(inner):
            break
        if inner[i] != "'":
            return None
        i += 1
        elem_chars = []
        while i < len(inner):
            if inner[i] == "'" and i + 1 < len(inner) and inner[i+1] == "'":
                elem_chars.append("'"); i += 2
            elif inner[i] == "'":
                i += 1; break
            else:
                elem_chars.append(inner[i]); i += 1
        elems.append(''.join(elem_chars))
    return elems

def elems_to_jsonb(elems):
    json_elems = []
    for e in elems:
        stripped = e.strip()
        if stripped and stripped[0] in ('{', '['):
            try:
                parsed = json.loads(stripped)
                json_elems.append(json.dumps(parsed, separators=(',', ':')))
                continue
            except json.JSONDecodeError:
                pass
        json_elems.append(json.dumps(e))
    arr_str = '[' + ','.join(json_elems) + ']'
    return "'" + arr_str.replace("'", "''") + "'::jsonb"

def plain_str_to_jsonb(token):
    """Convert a plain SQL string literal to a ::jsonb literal.
    Extracts the value, tests if it's already valid JSON (adds ::jsonb cast),
    otherwise wraps the value as a JSON string.
    """
    # Strip outer single quotes and unescape '' -> '
    inner = token[1:-1].replace("''", "'")
    try:
        json.loads(inner)
        # Already valid JSON — just append the cast
        return token + '::jsonb'
    except json.JSONDecodeError:
        # Not valid JSON (e.g. YAML text) — encode as a JSON string
        encoded = json.dumps(inner)   # produces: "escaped text"
        # Re-escape single quotes for SQL and wrap
        sql_literal = "'" + encoded.replace("'", "''") + "'::jsonb"
        return sql_literal


def process_statement(stmt):
    """Process one complete INSERT statement (may span multiple physical lines)."""
    m = re.match(r'^INSERT INTO "([^"]+)"', stmt)
    if not m:
        return stmt
    table = m.group(1)

    jsonb_set = JSONB_COLS.get(table)
    if not jsonb_set:
        return stmt

    # Quick short-circuit: skip if no ARRAY[ and stmt isn't an INSERT with jsonb cols
    if 'ARRAY[' not in stmt and 'VALUES' not in stmt:
        return stmt

    col_match = re.search(r'\(("(?:[^"]|"")*"(?:,\s*"(?:[^"]|"")*")*)\)\s*VALUES', stmt)
    if not col_match:
        return stmt
    cols = parse_col_names(col_match.group(1))

    jsonb_positions = {i for i, col in enumerate(cols) if col in jsonb_set}
    if not jsonb_positions:
        return stmt

    values_marker = ') VALUES ('
    idx = stmt.index(values_marker)
    values_start = idx + len(values_marker)

    # Find the closing ) at the end (before ON CONFLICT or end)
    suffix_m = re.search(r'\) ON CONFLICT|\);\s*$', stmt[values_start:], re.DOTALL)
    if not suffix_m:
        return stmt
    values_str = stmt[values_start: values_start + suffix_m.start()]
    suffix = stmt[values_start + suffix_m.start():]

    tokens = split_values(values_str)
    if len(tokens) != len(cols):
        return stmt

    changed = False
    for i in jsonb_positions:
        if i >= len(tokens):
            continue
        tok = tokens[i]
        if tok.upper().startswith("ARRAY["):
            # Convert ARRAY[...] → '[...]'::jsonb
            elems = parse_text_array(tok)
            if elems is not None:
                tokens[i] = elems_to_jsonb(elems)
                changed = True
            else:
                # Non-text array (e.g. integer[]) — delegate to PostgreSQL's to_json
                clean = re.sub(r'::\w+\[\]\s*$', '', tok)
                tokens[i] = f"to_json({clean})::jsonb"
                changed = True
        elif tok.startswith("'") and tok.endswith("'"):
            # Plain SQL string literal going into a jsonb column — needs a cast
            tokens[i] = plain_str_to_jsonb(tok)
            changed = True

    if not changed:
        return stmt

    prefix = stmt[:values_start]
    return prefix + ', '.join(tokens) + suffix


def iter_statements(infile):
    """
    Yield complete SQL statements (potentially spanning multiple lines).
    Empty lines and comment lines that fall BETWEEN statements are yielded
    immediately (not bundled with the following INSERT).
    """
    buf = []
    in_single = False
    with open(infile, 'r', encoding='utf-8') as f:
        for raw_line in f:
            stripped = raw_line.rstrip()
            # If not mid-statement, emit empty/comment lines immediately
            if not buf and (not stripped or stripped.startswith('--')):
                yield raw_line.rstrip('\n')
                continue
            # Track single-quote state across the line
            for ch in raw_line:
                if ch == "'":
                    in_single = not in_single
            buf.append(raw_line.rstrip('\n'))
            # Emit complete statement when we reach a ';' outside a string
            if not in_single and (stripped.endswith(';') or stripped.endswith('DO NOTHING;')):
                yield '\n'.join(buf)
                buf = []
    if buf:
        yield '\n'.join(buf)


def split_output(infile, outdir, lines_per_chunk=20000):
    """
    Split a SQL file into chunks at proper statement boundaries (never mid-statement).
    Writes chunks as outdir/chunk_001.sql, chunk_002.sql, ...
    """
    import os
    os.makedirs(outdir, exist_ok=True)
    chunk_num = 1
    lines_written = 0
    fout = open(f"{outdir}/chunk_{chunk_num:03d}.sql", 'w', encoding='utf-8')
    buf = []
    in_single = False
    with open(infile, 'r', encoding='utf-8') as f:
        for raw_line in f:
            stripped = raw_line.rstrip()
            for ch in raw_line:
                if ch == "'":
                    in_single = not in_single
            buf.append(raw_line)
            # Flush buf to file at every statement boundary (avoids mid-statement splits)
            at_boundary = not in_single and (
                stripped.endswith(';') or stripped.endswith('DO NOTHING;')
                or not stripped or stripped.startswith('--')
            )
            if at_boundary:
                for line in buf:
                    fout.write(line)
                    lines_written += 1
                buf = []
                # Split chunk after enough lines at ANY statement boundary
                if lines_written >= lines_per_chunk:
                    fout.close()
                    chunk_num += 1
                    lines_written = 0
                    fout = open(f"{outdir}/chunk_{chunk_num:03d}.sql", 'w', encoding='utf-8')
    for line in buf:
        fout.write(line)
    fout.close()
    print(f"Split into {chunk_num} chunks in {outdir}/")


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == '--split':
        # python fix_array_types.py --split <infile> <outdir> [lines_per_chunk]
        infile = sys.argv[2]
        outdir = sys.argv[3]
        lpc = int(sys.argv[4]) if len(sys.argv) > 4 else 20000
        split_output(infile, outdir, lpc)
        return

    infile  = sys.argv[1]
    outfile = sys.argv[2]
    replaced = 0
    stmts_done = 0
    with open(outfile, 'w', encoding='utf-8') as fout:
        for stmt in iter_statements(infile):
            stmts_done += 1
            if stmts_done % 5000 == 0:
                print(f"  {stmts_done} statements...", flush=True)
            new_stmt = process_statement(stmt)
            if new_stmt != stmt:
                replaced += 1
            fout.write(new_stmt + '\n')
    print(f"Done: {stmts_done} statements processed, {replaced} modified")

if __name__ == "__main__":
    main()
