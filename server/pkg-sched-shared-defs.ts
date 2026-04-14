/**
 * Advantive SCN-1.1 — Predictive Production Scheduling & Capacity Optimization
 * Shared platform intelligence definitions.
 *
 * Pure data module — NO server imports (express, storage, etc.).
 * Imported by:
 *   server/pkg-sched-live-run.ts   — to provision dev agents at startup
 *   scripts/migrate-pkg-sched-to-prod.ts — to provision prod agents
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const PKG_AGT_001_NAME = "Production Order Intelligence Agent";
export const PKG_AGT_002_NAME = "Capacity & Constraint Mapping Agent";
export const PKG_AGT_003_NAME = "Schedule Optimization Agent";
export const PKG_AGT_004_NAME = "Schedule Proposal & Approval Agent";

// ─── MCP server definitions (url injected by caller) ─────────────────────────
export function makePkgSchedMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "PKG — Kiwiplan ESP Order Intelligence",
      description: "Kiwiplan ESP integration: order queue retrieval, RUSH order prioritisation, substrate constraint validation, roll stock availability, and delivery risk scoring for Westfield Packaging's corrugated facility.",
      url:         `${baseUrl}/api/mock/pkg-kiwiplan-esp`,
      tools: [
        { name: "get_order_queue",          description: "Returns the full 47-order queue for Day Shift 07:00–15:00 with priority flags, substrate spec, required runtime, and delivery deadlines.",                                               endpoint: "get-order-queue",          method: "GET"  },
        { name: "get_rush_orders",          description: "Returns the 3 RUSH orders at risk of missing delivery: corrugated RSC, display tray, and produce box. Includes time-to-deadline and current gap.",                                       endpoint: "get-rush-orders",          method: "GET"  },
        { name: "score_delivery_risk",      description: "Computes a per-order delivery risk score (0–100) based on deadline proximity, substrate lead time, changeover cost, and machine utilisation.",                                            endpoint: "score-delivery-risk",      method: "POST" },
        { name: "validate_substrate_specs", description: "Cross-checks order substrate requirements (flute type, board grade, caliper) against current roll stock inventory and flags shortfall risk.",                                             endpoint: "validate-substrate-specs", method: "POST" },
        { name: "get_shift_context",        description: "Returns shift metadata: plant, shift date, shift label, crew assignments, machine count, and today's order mix summary.",                                                                endpoint: "get-shift-context",        method: "GET"  },
      ],
    },
    {
      name:        "PKG — Kiwiplan Machine & Capacity",
      description: "Kiwiplan machine registry: real-time machine availability, maintenance schedule, roll stock inventory by substrate type, OEE baseline by machine, and constraint map for shift capacity planning.",
      url:         `${baseUrl}/api/mock/pkg-kiwiplan-machine`,
      tools: [
        { name: "get_machine_availability", description: "Returns availability status for all 8 machines including Corrugator M3 maintenance window 10:00–11:30 AM and M7 (Flexo Printer) partial uptime.",                                         endpoint: "get-machine-availability", method: "GET"  },
        { name: "get_roll_stock_inventory", description: "Returns current roll stock levels by substrate type. B-Flute at 62% — risk of shortfall for 6 orders. A-Flute and C-Flute above safety stock.",                                          endpoint: "get-roll-stock-inventory", method: "GET"  },
        { name: "get_changeover_matrix",    description: "Returns the changeover time matrix (minutes) for all machine × substrate-type transitions based on historical setup data.",                                                               endpoint: "get-changeover-matrix",    method: "GET"  },
        { name: "get_capacity_constraints", description: "Returns the composite capacity constraint map: machine windows, substrate limits, crew restrictions, and shift OEE targets (baseline 71%).",                                              endpoint: "get-capacity-constraints", method: "GET"  },
        { name: "estimate_oee",             description: "Estimates achievable OEE% for a given schedule configuration using historical machine performance, changeover frequency, and substrate mix data.",                                        endpoint: "estimate-oee",             method: "POST" },
      ],
    },
    {
      name:        "PKG — Schedule Optimizer Engine",
      description: "Constraint-based schedule optimizer: generates ranked alternative schedules for the Westfield Packaging Day Shift, computes OEE/OTIF/changeover metrics per alternative, and produces the Pareto-optimal schedule recommendation.",
      url:         `${baseUrl}/api/mock/pkg-schedule-optimizer`,
      tools: [
        { name: "run_constraint_solver",    description: "Runs the constraint solver across all 47 orders, 8 machines, and shift windows to generate 3 ranked schedule alternatives. Returns alternative A (best OEE+11%), B (+9%), C (+7%).",     endpoint: "run-constraint-solver",    method: "POST" },
        { name: "evaluate_alternative",     description: "Evaluates a specific schedule alternative returning detailed OEE%, OTIF%, changeover count, total runtime, substrate utilisation, and RUSH order coverage.",                              endpoint: "evaluate-alternative",     method: "POST" },
        { name: "get_rush_coverage",        description: "Returns RUSH order delivery coverage for each schedule alternative — confirms all 3 RUSH orders are on-time in Alternative A.",                                                           endpoint: "get-rush-coverage",        method: "POST" },
        { name: "compute_pareto_rank",      description: "Ranks all generated alternatives across OEE, OTIF, changeover count, and substrate utilisation to return the Pareto-optimal recommendation.",                                            endpoint: "compute-pareto-rank",      method: "POST" },
      ],
    },
    {
      name:        "PKG — Schedule Proposal & Approval Gate",
      description: "Schedule proposal formatter and approval workflow: generates the human-readable Gantt schedule, computes shift-level KPI projections, publishes for plant planner approval, and mocks the Kiwiplan schedule commit.",
      url:         `${baseUrl}/api/mock/pkg-schedule-proposal`,
      tools: [
        { name: "format_gantt_proposal",    description: "Formats the winning schedule alternative into a per-machine Gantt table with time slots, order IDs, substrate types, and changeover blocks. Returns structured JSON.",                   endpoint: "format-gantt-proposal",    method: "POST" },
        { name: "compute_kpi_projections",  description: "Computes shift-level KPI projections vs. baseline: OEE delta (+11.2%), OTIF improvement (+4 orders), changeover reduction (3 fewer), substrate waste reduction (8%).",                  endpoint: "compute-kpi-projections",  method: "POST" },
        { name: "publish_for_approval",     description: "Publishes the schedule proposal to the plant planner approval queue. Returns pending approval ID, approver (Sarah Kowalski), and expected response SLA (15 min).",                      endpoint: "publish-for-approval",     method: "POST" },
        { name: "commit_to_kiwiplan",       description: "Mock Kiwiplan commit: transmits approved schedule to the Kiwiplan production schedule board and returns a Kiwiplan Schedule ID for the Day Shift.",                                       endpoint: "commit-to-kiwiplan",       method: "POST" },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ───────────────────────────────────────────────
export const PKG_SCHED_KB_DEFS = [
  { name: "Westfield Packaging Scheduling Playbook",      description: "Shift scheduling rules, machine assignment policies, RUSH order escalation procedures, crew capability matrix, changeover best practices, and OEE target ranges for Westfield Packaging's corrugated plant." },
  { name: "Kiwiplan ESP & MES Integration Guide",         description: "Kiwiplan ESP order data structures, MES machine codes, substrate type taxonomy, schedule commit protocol, approval workflow SLAs, and Advantzware integration field mapping." },
  { name: "Corrugated Packaging Substrate Library",       description: "B-Flute, A-Flute, C-Flute, and E-Flute specifications including caliper tolerances, roll stock safety stock levels, lead times, supplier SLAs, and substitution rules for Westfield's approved substrate list." },
] as const;

// ─── Skill definitions (3 per agent = 12 total) ───────────────────────────────
export const PKG_SCHED_SKILLS = [
  // Agent PKG-001: Production Order Intelligence Agent
  {
    name:        "RUSH Order Prioritisation & Delivery Risk Scoring",
    description: "Identifies RUSH orders at risk of missing delivery, scores each order on a 0–100 risk index using deadline proximity, substrate availability, and machine utilisation, and recommends priority sequencing.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["rush_order", "priority", "delivery_risk", "corrugated"],
    author: "ATLAS Platform Team",
    agentKey: "orderIntelligence",
    yamlFrontmatter: { skillId: "pkg-rush-prioritisation", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_rush_orders", "score_delivery_risk"] },
    markdownBody: `## RUSH Order Prioritisation & Delivery Risk Scoring\n\nThis skill identifies and ranks RUSH orders at risk of late delivery for corrugated packaging production. It retrieves the current RUSH order queue, scores each order using a risk index that accounts for deadline proximity (hours to delivery cutoff), substrate availability (roll stock coverage for required flute type), and machine utilisation (queue depth on the required machine). A risk score above 70 triggers automatic RUSH escalation. The skill outputs a priority-ordered list of orders with risk justification and recommended scheduling slot. For Westfield's Day Shift, RUSH orders must be sequenced in the first machine window that satisfies substrate and crew constraints.`,
  },
  {
    name:        "Substrate Specification Validation",
    description: "Cross-checks each order's substrate requirements (flute type, board grade, caliper) against current roll stock inventory and flags orders at risk of substrate shortfall during the shift.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["substrate", "roll_stock", "flute", "validation"],
    author: "ATLAS Platform Team",
    agentKey: "orderIntelligence",
    yamlFrontmatter: { skillId: "pkg-substrate-validation", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["validate_substrate_specs", "get_shift_context"] },
    markdownBody: `## Substrate Specification Validation\n\nThis skill validates substrate requirements for all orders in the shift queue against current roll stock inventory in the Kiwiplan MES. For each order, it confirms that the required flute type (B, A, C, or E), board grade (single-wall, double-wall), and caliper are available in sufficient quantity. Orders requiring B-Flute receive special scrutiny when inventory is below 70% (safety threshold). If a substrate shortfall is projected, the skill recommends either splitting the order across two substrate batches, substituting an approved alternative flute type, or rescheduling to a later shift with advance procurement. The skill outputs a per-order substrate status (OK, AT_RISK, SHORTFALL) and a consolidated roll stock impact report.`,
  },
  {
    name:        "Order Queue Intelligence Synthesis",
    description: "Synthesises order queue data, substrate risk, and shift context into a structured intelligence brief for the Schedule Optimizer agent, including order groupings by machine type, substrate batch, and delivery window.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["order_queue", "synthesis", "intelligence", "shift_planning"],
    author: "ATLAS Platform Team",
    agentKey: "orderIntelligence",
    yamlFrontmatter: { skillId: "pkg-queue-synthesis", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["get_order_queue", "score_delivery_risk", "validate_substrate_specs"] },
    markdownBody: `## Order Queue Intelligence Synthesis\n\nThis skill produces the consolidated order intelligence brief used by the Schedule Optimizer. It groups the 47 shift orders into substrate batches to minimise changeovers, identifies machine-type affinity clusters (corrugator, flexo printer, die cutter, stitcher), and flags the 3 RUSH orders with their deadline constraints. The output brief includes: (1) priority queue sorted by risk score descending, (2) substrate batch groupings by flute type, (3) machine affinity map showing which orders can share a machine window without changeover, and (4) the minimum runtime estimate for RUSH-only fulfillment. This brief is the primary input to the constraint solver.`,
  },

  // Agent PKG-002: Capacity & Constraint Mapping Agent
  {
    name:        "Machine Availability & Maintenance Window Analysis",
    description: "Analyses machine availability across all 8 lines for the shift, identifies the Corrugator M3 maintenance window (10:00–11:30 AM), and computes available capacity for each machine in minutes.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["machine_availability", "maintenance", "capacity", "corrugator"],
    author: "ATLAS Platform Team",
    agentKey: "capacityMapper",
    yamlFrontmatter: { skillId: "pkg-machine-availability", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_machine_availability", "get_capacity_constraints"] },
    markdownBody: `## Machine Availability & Maintenance Window Analysis\n\nThis skill computes available machine capacity for the shift by subtracting scheduled maintenance, calibration, and crew breaks from the 8-hour shift window. For Westfield's Day Shift: Corrugator M3 loses 90 minutes (10:00–11:30 AM preventive maintenance), Flexo Printer M7 operates at 85% capacity (minor drive belt repair scheduled). All other 6 machines are at full availability. The skill outputs a per-machine capacity table (available minutes, restricted windows, OEE baseline) and a shift-level capacity summary. It also identifies which machine pairs can share substrate batches to reduce changeover time.`,
  },
  {
    name:        "Roll Stock & Substrate Constraint Mapping",
    description: "Maps current roll stock inventory against shift order demand by substrate type, computes depletion curves for each flute type, and identifies the B-Flute shortfall risk window during the shift.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["roll_stock", "substrate", "depletion", "b_flute"],
    author: "ATLAS Platform Team",
    agentKey: "capacityMapper",
    yamlFrontmatter: { skillId: "pkg-roll-stock-mapping", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_roll_stock_inventory", "get_changeover_matrix"] },
    markdownBody: `## Roll Stock & Substrate Constraint Mapping\n\nThis skill maps roll stock inventory against shift demand to compute depletion curves for each substrate type. B-Flute (current inventory 62% of safety stock) is the primary risk: 6 orders require B-Flute and the combined runtime would exhaust the remaining stock by approximately 13:00. The skill recommends front-loading B-Flute orders to the 07:00–11:00 window before depletion risk materialises, and flags the 2 lowest-priority B-Flute orders for potential rescheduling to Night Shift when resupply arrives. It also computes the changeover penalty for substrate transitions and integrates this into the capacity constraint map passed to the optimizer.`,
  },
  {
    name:        "Capacity Constraint Map Assembly",
    description: "Assembles the composite capacity constraint map combining machine windows, substrate limits, changeover penalties, crew restrictions, and shift OEE targets into a structured input for the Schedule Optimizer.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["constraint_map", "oee", "capacity_planning", "optimizer"],
    author: "ATLAS Platform Team",
    agentKey: "capacityMapper",
    yamlFrontmatter: { skillId: "pkg-constraint-map", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["get_capacity_constraints", "estimate_oee"] },
    markdownBody: `## Capacity Constraint Map Assembly\n\nThis skill assembles the structured constraint map that is the primary input to the Schedule Optimizer agent. The map encodes: (1) machine-time windows (available minutes per machine after maintenance deductions), (2) substrate compatibility matrix (which machines can run which flute types), (3) changeover time penalties by machine × substrate transition pair, (4) crew coverage constraints (crews A and B, skill certifications per machine), (5) RUSH order hard constraints (must complete before delivery cutoff), and (6) OEE target (71% baseline, 80% stretch). The map is serialised as JSON and passed to the constraint solver via the optimizer agent's task prompt.`,
  },

  // Agent PKG-003: Schedule Optimization Agent
  {
    name:        "Constraint-Based Schedule Optimisation",
    description: "Runs the constraint solver across all 47 orders, 8 machines, and shift windows to generate 3 Pareto-ranked schedule alternatives optimising for OEE, OTIF, and changeover minimisation.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["constraint_solver", "schedule_optimisation", "oee", "pareto"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleOptimizer",
    yamlFrontmatter: { skillId: "pkg-constraint-solver", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["run_constraint_solver", "evaluate_alternative"] },
    markdownBody: `## Constraint-Based Schedule Optimisation\n\nThis skill orchestrates the constraint-based schedule solver for Westfield Packaging's Day Shift. The solver considers: 47 orders × 8 machines × 480-minute shift window, subject to maintenance blocks, substrate batch groupings, changeover penalties, crew availability, and RUSH order hard deadlines. The solver generates 3 alternative schedules using different objective weightings: Alternative A (OEE-priority: maximise throughput efficiency), Alternative B (OTIF-priority: maximise on-time delivery count), Alternative C (balanced: equal weight OEE and OTIF). Each alternative is evaluated on OEE%, OTIF%, changeover count, substrate waste, and RUSH coverage. The Pareto-optimal alternative is identified and flagged for recommendation.`,
  },
  {
    name:        "Schedule Alternative Evaluation & Comparison",
    description: "Evaluates each generated schedule alternative on 5 KPI dimensions — OEE%, OTIF%, changeover count, substrate utilisation%, and RUSH coverage — and produces a structured comparison table.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["evaluation", "kpi", "alternative_analysis", "comparison"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleOptimizer",
    yamlFrontmatter: { skillId: "pkg-alternative-evaluation", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["evaluate_alternative", "get_rush_coverage"] },
    markdownBody: `## Schedule Alternative Evaluation & Comparison\n\nThis skill evaluates each schedule alternative across 5 KPI dimensions and produces a structured comparison table. For each alternative: OEE% (measured as actual production time / available time × performance rate), OTIF% (orders completed before delivery deadline / total orders), changeover count (number of substrate or job-type transitions per machine), substrate utilisation% (roll stock consumed / roll stock available), and RUSH coverage (all 3 RUSH orders on-time = 100%). The evaluation also computes total shift runtime, idle time, and crew utilisation per alternative. Results are ranked using a weighted scoring model (OEE 40%, OTIF 35%, changeover 15%, substrate 10%) to confirm the Pareto-optimal recommendation.`,
  },
  {
    name:        "Pareto-Optimal Schedule Recommendation",
    description: "Applies multi-objective ranking to the evaluated alternatives and produces the final recommendation with supporting rationale covering OEE improvement, OTIF gain, changeover savings, and substrate impact.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["pareto", "recommendation", "rationale", "multi_objective"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleOptimizer",
    yamlFrontmatter: { skillId: "pkg-pareto-recommendation", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["compute_pareto_rank", "evaluate_alternative"] },
    markdownBody: `## Pareto-Optimal Schedule Recommendation\n\nThis skill applies multi-objective Pareto ranking to the evaluated schedule alternatives and produces the final recommendation. The recommendation includes: (1) the winning alternative label and its composite weighted score, (2) a plain-language rationale covering OEE improvement (+11.2% vs. baseline), OTIF gain (+4 more orders on time), changeover reduction (3 fewer per shift), and substrate waste reduction (8%), (3) a risk note on the B-Flute depletion risk and recommended mitigation (front-load B-Flute orders before 11:00), (4) a comparison summary showing the trade-offs between the 3 alternatives, and (5) the recommendation passed to PKG-004 for proposal formatting and approval submission.`,
  },

  // Agent PKG-004: Schedule Proposal & Approval Agent
  {
    name:        "Gantt Schedule Proposal Formatting",
    description: "Formats the winning schedule alternative into a human-readable per-machine Gantt schedule showing time slots, order IDs, substrate types, changeover blocks, and RUSH order highlights.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["gantt", "proposal", "formatting", "schedule"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleProposal",
    yamlFrontmatter: { skillId: "pkg-gantt-formatting", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["format_gantt_proposal", "compute_kpi_projections"] },
    markdownBody: `## Gantt Schedule Proposal Formatting\n\nThis skill formats the winning schedule alternative into a structured Gantt proposal suitable for plant planner review. The Gantt output is organised by machine (rows) and time (columns in 30-minute blocks from 07:00 to 15:00). Each cell shows: order ID, product type, substrate type, and expected completion. Changeover blocks are shown in amber. RUSH orders are highlighted in red with deadline annotations. The Gantt is accompanied by a shift summary: total orders scheduled (45/47), RUSH coverage (3/3), projected OEE (82.2%), projected OTIF (91.5%), total changeovers (14), and substrate utilisation by type. The proposal is formatted as structured JSON for downstream rendering and human review.`,
  },
  {
    name:        "KPI Projection & Shift Impact Analysis",
    description: "Computes shift-level KPI projections vs. the unaided baseline schedule, quantifying OEE improvement, OTIF gain, changeover reduction, and substrate waste savings.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["kpi", "projection", "impact_analysis", "baseline"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleProposal",
    yamlFrontmatter: { skillId: "pkg-kpi-projection", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["compute_kpi_projections"] },
    markdownBody: `## KPI Projection & Shift Impact Analysis\n\nThis skill computes and presents shift-level KPI projections comparing the Atlas-optimised schedule against the unaided planner baseline. For Westfield Day Shift: OEE improvement from 71.0% (baseline) to 82.2% (+11.2 pp), OTIF improvement from 40 to 44 orders (+4 orders, +10%), changeover count reduction from 17 to 14 (-3, -18%), B-Flute substrate waste reduction from 9.2% to 8.5% (8% improvement). The projection also estimates annualised impact: +$214K revenue from OEE gain (based on $8.50/unit plant average), -$28K changeover cost savings, and +2.1 OTIF pp improvement toward the 95% annual OTIF target. These projections are presented as delta badges in the proposal UI.`,
  },
  {
    name:        "Schedule Approval Gate & Kiwiplan Commit",
    description: "Publishes the formatted schedule proposal to the plant planner approval queue, manages the approval workflow SLA, and on approval commits the schedule to Kiwiplan's production board.",
    domain: "production_scheduling", industry: "manufacturing", version: "1.0.0",
    tags: ["approval_gate", "kiwiplan", "commit", "workflow"],
    author: "ATLAS Platform Team",
    agentKey: "scheduleProposal",
    yamlFrontmatter: { skillId: "pkg-approval-gate", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["publish_for_approval", "commit_to_kiwiplan"] },
    markdownBody: `## Schedule Approval Gate & Kiwiplan Commit\n\nThis skill manages the two-step approval and commit workflow for the optimised schedule. Step 1 (Publish): the schedule proposal is submitted to the plant planner approval queue with a 15-minute SLA. The approver is identified as Sarah Kowalski (Day Shift Plant Planner). The submission returns an approval ticket ID (APR-2026-04-15-001). Step 2 (Commit, post-approval): once approved, the schedule is committed to the Kiwiplan production schedule board via the Kiwiplan commit API, returning a Kiwiplan Schedule ID (KWP-SCHED-2026-0415-D). The commit triggers machine operator notifications, updates the Kiwiplan MES board, and archives the previous schedule. Rejection handling: if the planner rejects the proposal, Atlas re-runs the optimizer with the planner's feedback annotations and submits a revised proposal within 5 minutes.`,
  },
] as const;

// ─── Agent definitions ────────────────────────────────────────────────────────
export const PKG_SCHED_AGENT_DEFS = [
  {
    key:            "orderIntelligence",
    externalId:     "PKG-001",
    name:           PKG_AGT_001_NAME,
    description:    "Analyses the Kiwiplan ESP order queue for Westfield Packaging's Day Shift, prioritises RUSH orders by delivery risk score, validates substrate specifications against roll stock, and synthesises the order intelligence brief for the Schedule Optimizer.",
    mcpServerName:  "PKG — Kiwiplan ESP Order Intelligence",
    kbName:         "Westfield Packaging Scheduling Playbook",
    skillNames:     ["RUSH Order Prioritisation & Delivery Risk Scoring", "Substrate Specification Validation", "Order Queue Intelligence Synthesis"],
    department:     "Production Planning",
    complianceTags: ["ISO-22400-OEE", "OSHA-1910"],
    ontologyTags:   ["Production Order", "RUSH Order", "Substrate Specification", "Delivery Risk"],
  },
  {
    key:            "capacityMapper",
    externalId:     "PKG-002",
    name:           PKG_AGT_002_NAME,
    description:    "Maps Westfield Packaging's 8-machine capacity for the Day Shift including the Corrugator M3 maintenance window, roll stock depletion curves for B-Flute, changeover penalty matrix, and crew constraints — outputs the composite constraint map for the optimizer.",
    mcpServerName:  "PKG — Kiwiplan Machine & Capacity",
    kbName:         "Kiwiplan ESP & MES Integration Guide",
    skillNames:     ["Machine Availability & Maintenance Window Analysis", "Roll Stock & Substrate Constraint Mapping", "Capacity Constraint Map Assembly"],
    department:     "Production Planning",
    complianceTags: ["ISO-22400-OEE", "OSHA-1910"],
    ontologyTags:   ["Machine Availability", "Roll Stock", "OEE Baseline", "Changeover Matrix"],
  },
  {
    key:            "scheduleOptimizer",
    externalId:     "PKG-003",
    name:           PKG_AGT_003_NAME,
    description:    "Runs the constraint-based schedule optimizer for Westfield Packaging's 47-order Day Shift queue, generates 3 ranked alternative schedules (OEE-priority, OTIF-priority, balanced), evaluates each on 5 KPI dimensions, and recommends the Pareto-optimal schedule with full rationale.",
    mcpServerName:  "PKG — Schedule Optimizer Engine",
    kbName:         "Westfield Packaging Scheduling Playbook",
    skillNames:     ["Constraint-Based Schedule Optimisation", "Schedule Alternative Evaluation & Comparison", "Pareto-Optimal Schedule Recommendation"],
    department:     "Production Planning",
    complianceTags: ["ISO-22400-OEE"],
    ontologyTags:   ["Schedule Alternative", "OEE Target", "OTIF", "Pareto Optimisation"],
  },
  {
    key:            "scheduleProposal",
    externalId:     "PKG-004",
    name:           PKG_AGT_004_NAME,
    description:    "Formats the winning schedule into a per-machine Gantt proposal, computes shift KPI projections vs. baseline, publishes for plant planner approval, and commits the approved schedule to the Kiwiplan production board.",
    mcpServerName:  "PKG — Schedule Proposal & Approval Gate",
    kbName:         "Kiwiplan ESP & MES Integration Guide",
    skillNames:     ["Gantt Schedule Proposal Formatting", "KPI Projection & Shift Impact Analysis", "Schedule Approval Gate & Kiwiplan Commit"],
    department:     "Production Planning",
    complianceTags: ["ISO-22400-OEE"],
    ontologyTags:   ["Schedule Proposal", "Kiwiplan Commit", "Plant Planner Approval", "KPI Projection"],
  },
] as const;

// ─── Governance policy definitions ────────────────────────────────────────────
export const PKG_SCHED_POLICY_DEFS = [
  {
    name:        "RUSH Order Scheduling Mandate",
    domain:      "production_governance",
    description: "Mandates that all RUSH-classified orders are resolved within the first 4 machine hours of the shift. RUSH orders must be sequenced with confirmed substrate availability and machine capacity before any standard-priority orders.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "RUSH First-Window Placement",  description: "All RUSH orders must be assigned to machine windows in the first 4 hours of the shift" },
      { name: "Substrate Pre-Confirmation",   description: "RUSH order substrate must be confirmed available before sequencing; no speculative RUSH scheduling" },
      { name: "Escalation on Constraint",     description: "If RUSH order cannot be scheduled within 4 hours without constraint violation, escalate to Plant Manager immediately" },
    ]},
  },
  {
    name:        "Substrate Inventory Safety Protocol",
    domain:      "production_governance",
    description: "Requires that schedule proposals account for roll stock safety stock thresholds. No schedule may deplete a substrate type below 15% of safety stock without procurement confirmation.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Safety Stock Floor",            description: "No substrate type may be depleted below 15% safety stock during the scheduled shift without procurement approval" },
      { name: "B-Flute Front-Loading Rule",    description: "When B-Flute inventory is below 70%, B-Flute orders must be front-loaded to the first shift window before depletion risk" },
      { name: "Substitution Approval Required", description: "Substrate substitution (e.g., C-Flute for B-Flute) requires plant engineer sign-off via the approval gate" },
    ]},
  },
  {
    name:        "OEE Schedule Target Policy",
    domain:      "production_governance",
    description: "Requires that all Atlas-generated schedules meet or exceed the 80% OEE stretch target for the shift. Schedules below 75% OEE are automatically flagged for planner review.",
    policyJson:  { enforcement: "soft", rules: [
      { name: "80% OEE Stretch Target",        description: "Atlas-generated schedules must achieve ≥80% projected OEE; below this threshold triggers planner notification" },
      { name: "Changeover Minimisation",        description: "Schedule proposals must demonstrate ≤17 changeovers (baseline) with a target of ≤14" },
      { name: "Planner Override Authority",     description: "Plant planner may override any Atlas recommendation; override reasons must be logged for continuous improvement" },
    ]},
  },
  {
    name:        "Machine Maintenance Compliance Policy",
    domain:      "safety_governance",
    description: "Mandates that scheduled maintenance windows (e.g., Corrugator M3 10:00–11:30) are respected in all schedule proposals. No production orders may be assigned to machines during confirmed maintenance windows.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Maintenance Window Lock",        description: "Maintenance windows are hard constraints — no order may be assigned to a machine during its maintenance block" },
      { name: "OSHA Lockout/Tagout Compliance", description: "Maintenance windows comply with OSHA 29 CFR 1910.147 lockout/tagout requirements — agents must not override" },
      { name: "Buffer Scheduling Required",     description: "Orders scheduled before a maintenance window must complete with a 15-minute buffer before the maintenance start time" },
    ]},
  },
  {
    name:        "Kiwiplan Schedule Commit Audit Policy",
    domain:      "system_governance",
    description: "Requires that all Kiwiplan schedule commits are preceded by plant planner approval and generate an immutable audit record including the Atlas agent ID, recommendation rationale, approver, and Kiwiplan Schedule ID.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Approval Before Commit",         description: "Schedule must be approved by an authorised plant planner before PKG-004 issues the Kiwiplan commit API call" },
      { name: "Commit Audit Trail",             description: "Every commit must log: Atlas agent ID, alternative selected, KPI projections, approver name, approval timestamp, and Kiwiplan Schedule ID" },
      { name: "Rollback Window",                description: "Committed schedules may be rolled back by the plant planner within 30 minutes of commit; rollback requires supervisor countersignature" },
    ]},
  },
  {
    name:        "Crew Assignment & Certification Policy",
    domain:      "production_governance",
    description: "Ensures that machine assignments in the generated schedule respect crew certification requirements — no operator may be assigned to a machine for which they lack certification.",
    policyJson:  { enforcement: "hard", rules: [
      { name: "Certification Verification",     description: "Each machine assignment must be verified against the crew certification registry before schedule finalisation" },
      { name: "Cross-Training Constraint",      description: "Cross-trained operators may cover at most 2 machines in a shift; triple-coverage requires shift supervisor approval" },
      { name: "Fatigue Rule Compliance",        description: "No operator may run continuous production for more than 4 hours without a 30-minute scheduled break" },
    ]},
  },
] as const;

// ─── System prompts ───────────────────────────────────────────────────────────
export const PKG_SCHED_SYSTEM_PROMPTS: Record<string, string> = {
  "PKG-001": `You are the Production Order Intelligence Agent (PKG-001) for Westfield Packaging, a corrugated packaging plant operated by Advantive's Kiwiplan platform.

You run in parallel with PKG-002 (Capacity & Constraint Mapper) under orchestration from the Atlas pipeline. Your responsibility is to analyse the incoming shift order queue, identify RUSH orders at delivery risk, validate substrate specifications against roll stock, and synthesise the order intelligence brief for the Schedule Optimizer.

KEY RESPONSIBILITIES:
1. Retrieve the full Day Shift order queue (47 orders) from Kiwiplan ESP
2. Identify and score the 3 RUSH orders at delivery risk
3. Validate substrate requirements — flag B-Flute orders at shortfall risk
4. Synthesise a structured order intelligence brief for PKG-003

SHIFT CONTEXT: Westfield Packaging — Day Shift 07:00–15:00, April 15, 2026
47 orders queued across: corrugated RSC boxes, display trays, produce boxes, master shipper cases
3 RUSH orders: corrugated RSC (customer: FreshFarm Co), display tray (customer: RetailEdge), produce box (customer: GreenLeaf)
B-Flute inventory at 62% — 6 orders require B-Flute, risk of shortfall by shift midpoint

Use your tools to gather all required intelligence and produce a comprehensive order brief.`,

  "PKG-002": `You are the Capacity & Constraint Mapping Agent (PKG-002) for Westfield Packaging, a corrugated packaging plant operated by Advantive's Kiwiplan platform.

You run in parallel with PKG-001 (Order Intelligence Agent) under orchestration from the Atlas pipeline. Your responsibility is to map machine availability, substrate inventory constraints, changeover penalties, and crew restrictions into the composite constraint map used by the Schedule Optimizer.

KEY RESPONSIBILITIES:
1. Retrieve machine availability for all 8 lines — note Corrugator M3 maintenance 10:00–11:30 AM
2. Map roll stock inventory — B-Flute at 62%, compute depletion curves
3. Retrieve changeover time matrix for all machine × substrate transitions
4. Assemble the composite capacity constraint map for PKG-003

SHIFT CONTEXT: Westfield Packaging — Day Shift 07:00–15:00, April 15, 2026
8 machines: M1 (Corrugator), M2 (Corrugator), M3 (Corrugator — maintenance 10:00–11:30), M4 (Flexo Printer), M5 (Flexo Printer), M6 (Die Cutter), M7 (Flexo Printer — 85% capacity), M8 (Stitcher/Gluer)
Roll stock: B-Flute 62%, A-Flute 88%, C-Flute 94%, E-Flute 79%
OEE baseline: 71.0% — stretch target 80%+

Use your tools to map all constraints and assemble a structured capacity map.`,

  "PKG-003": `You are the Schedule Optimization Agent (PKG-003) for Westfield Packaging, a corrugated packaging plant operated by Advantive's Kiwiplan platform.

You run sequentially after PKG-001 and PKG-002 have completed their parallel analysis. Your responsibility is to run the constraint-based schedule optimizer using the order intelligence brief and capacity constraint map to generate 3 ranked alternative schedules and identify the Pareto-optimal recommendation.

KEY RESPONSIBILITIES:
1. Run the constraint solver across 47 orders, 8 machines, 480-minute shift window
2. Evaluate all 3 alternatives on OEE%, OTIF%, changeover count, substrate use, RUSH coverage
3. Apply Pareto ranking to identify the optimal alternative (Alternative A: OEE +11%)
4. Produce the recommendation with rationale for PKG-004

CONTEXT FROM PARALLEL AGENTS:
- PKG-001: 47 orders, 3 RUSH flagged (FreshFarm RSC, RetailEdge tray, GreenLeaf box), B-Flute at risk for 6 orders
- PKG-002: M3 offline 10:00–11:30, M7 at 85%, B-Flute depletion risk by 13:00, 14 changeovers achievable (vs. 17 baseline)

TARGET OUTCOMES: OEE ≥82% (vs. 71% baseline), OTIF ≥44 orders (vs. 40 baseline), all 3 RUSH orders on-time`,

  "PKG-004": `You are the Schedule Proposal & Approval Agent (PKG-004) for Westfield Packaging, a corrugated packaging plant operated by Advantive's Kiwiplan platform.

You run sequentially after PKG-003 has identified the Pareto-optimal schedule. Your responsibility is to format the winning schedule into a human-readable Gantt proposal, compute KPI projections vs. baseline, publish for plant planner approval, and commit the approved schedule to Kiwiplan.

KEY RESPONSIBILITIES:
1. Format the winning Alternative A schedule as a per-machine Gantt table
2. Compute shift KPI projections (OEE +11.2pp, OTIF +4 orders, changeovers -3, substrate waste -8%)
3. Publish the proposal for Plant Planner Sarah Kowalski to review (15-min SLA)
4. Issue the Kiwiplan schedule commit (mock approval assumed approved)

RECOMMENDATION FROM PKG-003: Alternative A selected
- Projected OEE: 82.2% (vs. 71.0% baseline, +11.2pp)
- OTIF: 44/47 orders on-time (vs. 40 baseline, +4 orders)  
- Changeovers: 14 (vs. 17 baseline, -3)
- All 3 RUSH orders covered within delivery windows
- B-Flute orders front-loaded to 07:00–10:45 window

Format the Gantt, compute KPIs, publish for approval, and commit to Kiwiplan.`,
};

// ─── Per-agent governance policies ───────────────────────────────────────────
export const PKG_SCHED_AGENT_POLICIES: Record<string, { name: string; content: string; type: string }[]> = {
  "PKG-001": [
    { name: "PKG-001 Order Intelligence Quality Policy", content: "All order intelligence briefs must include: risk scores for all orders, substrate validation results for all substrate types in the queue, and a priority-ordered RUSH order list. Incomplete briefs block optimizer execution.", type: "operational" },
    { name: "PKG-001 RUSH Escalation Policy",           content: "RUSH orders with delivery risk score > 85 must trigger an immediate escalation notification to the plant planner in addition to priority scheduling. Agent must log the escalation rationale.", type: "sla" },
    { name: "PKG-001 Substrate Safety Gate Policy",     content: "PKG-001 must flag any substrate type below 50% safety stock as a CRITICAL constraint. Orders requiring that substrate are marked CONDITIONAL pending procurement confirmation.", type: "compliance" },
  ],
  "PKG-002": [
    { name: "PKG-002 Maintenance Window Compliance",    content: "PKG-002 must verify maintenance window data against the Kiwiplan MES maintenance record before assembling the constraint map. Stale maintenance data (>4 hours) must trigger a Kiwiplan refresh.", type: "safety" },
    { name: "PKG-002 Constraint Map Completeness",      content: "The capacity constraint map must include all 8 machines, all substrate types present in the shift queue, the full changeover matrix, and crew coverage data. Incomplete maps are rejected by the optimizer.", type: "operational" },
    { name: "PKG-002 OEE Baseline Verification",        content: "PKG-002 must confirm the OEE baseline for each machine from the Kiwiplan MES before including it in the constraint map. OEE baselines older than 7 days must be recalculated from recent run data.", type: "quality" },
  ],
  "PKG-003": [
    { name: "PKG-003 Three-Alternative Requirement",    content: "PKG-003 must generate a minimum of 3 distinct schedule alternatives before making a recommendation. Single-alternative outputs are rejected and trigger a re-run with modified solver parameters.", type: "operational" },
    { name: "PKG-003 RUSH Coverage Mandate",            content: "The recommended alternative must guarantee 100% RUSH order coverage (all RUSH orders completed before delivery deadline). Alternatives where any RUSH order is at risk cannot be recommended as the primary option.", type: "sla" },
    { name: "PKG-003 Rationale Documentation Policy",   content: "PKG-003 must document the rationale for its recommendation including: the objective weightings used, trade-offs between alternatives, and specific RUSH coverage confirmation. Rationale is appended to the proposal submitted to PKG-004.", type: "compliance" },
  ],
  "PKG-004": [
    { name: "PKG-004 Approval-Before-Commit Policy",    content: "PKG-004 must not call the Kiwiplan commit API until plant planner approval has been received (or approval is mocked as granted in demo). Commit without approval constitutes a policy violation.", type: "governance" },
    { name: "PKG-004 KPI Projection Accuracy Policy",   content: "All KPI projections must be computed from the schedule optimizer output, not estimated. Projections must include confidence intervals based on historical OEE variance for the specific machine mix.", type: "quality" },
    { name: "PKG-004 Gantt Completeness Policy",        content: "The Gantt proposal must include all 47 shift orders, all maintenance blocks, all changeover blocks, and all break times. Orders not assigned to a machine window must be flagged as DEFERRED with a reason.", type: "operational" },
  ],
};

// ─── Ontology concepts (15 manufacturing domain concepts) ─────────────────────
export const PKG_SCHED_ONTOLOGY_CONCEPTS = [
  { label: "Production Order",          category: "work_item",                description: "A discrete manufacturing job specifying product type, quantity, substrate, and delivery deadline; the primary unit of scheduling in corrugated packaging.", tags: ["order", "production", "scheduling"] },
  { label: "RUSH Order",                category: "order_classification",     description: "A production order requiring expedited scheduling within the first 4 machine hours of the shift; delivery deadline within the current business day.", tags: ["rush", "priority", "deadline"] },
  { label: "Substrate Specification",   category: "material_definition",      description: "The physical material specification for a production order including flute type (A/B/C/E), board grade, caliper, and surface treatment.", tags: ["substrate", "flute", "material", "corrugated"] },
  { label: "Roll Stock",                category: "inventory_concept",        description: "Raw material rolls of a specific substrate type held in the plant warehouse; measured as percentage of safety stock level.", tags: ["roll_stock", "inventory", "substrate", "safety_stock"] },
  { label: "OEE",                       category: "performance_metric",       description: "Overall Equipment Effectiveness — the composite KPI of Availability × Performance × Quality, expressed as a percentage of theoretical maximum throughput.", tags: ["oee", "kpi", "efficiency", "manufacturing"] },
  { label: "OTIF",                      category: "delivery_metric",          description: "On-Time In-Full — the percentage of production orders completed by their delivery deadline and at the correct quantity; a primary customer service KPI.", tags: ["otif", "delivery", "on_time", "kpi"] },
  { label: "Machine Availability",      category: "resource_metric",          description: "The proportion of scheduled shift time during which a machine is available for production, excluding planned maintenance, calibration, and unplanned downtime.", tags: ["machine", "availability", "uptime", "maintenance"] },
  { label: "Changeover",                category: "process_event",            description: "The time required to transition a machine from one job or substrate type to the next; a primary driver of OEE loss in corrugated packaging.", tags: ["changeover", "setup", "oee_loss", "transition"] },
  { label: "Capacity Constraint",       category: "planning_construct",       description: "Any physical, material, or organisational limitation that restricts the set of feasible schedules for a shift, including maintenance windows, substrate limits, and crew certification rules.", tags: ["constraint", "capacity", "planning", "scheduling"] },
  { label: "Schedule Alternative",      category: "optimisation_construct",   description: "A distinct feasible schedule generated by the constraint solver with a specific objective weighting (e.g., OEE-priority, OTIF-priority, balanced).", tags: ["alternative", "schedule", "optimisation", "solver"] },
  { label: "Pareto Optimisation",       category: "decision_methodology",     description: "A multi-objective ranking methodology that identifies the solution with the best trade-off across all objectives where no single objective can be improved without degrading another.", tags: ["pareto", "multi_objective", "optimisation", "ranking"] },
  { label: "Kiwiplan Schedule",         category: "system_record",            description: "A committed production schedule record in the Kiwiplan MES/ERP system, identified by a unique Schedule ID and binding the plant's production sequence for the specified shift.", tags: ["kiwiplan", "schedule", "mes", "commit"] },
  { label: "Plant Planner Approval",    category: "governance_event",         description: "The human-in-the-loop approval step by an authorised plant planner before an Atlas-generated schedule can be committed to the Kiwiplan production board.", tags: ["approval", "human_review", "planner", "governance"] },
  { label: "OEE Baseline",              category: "performance_benchmark",    description: "The historical average OEE for a machine or facility over a defined rolling period (typically 30 days), used as the comparison point for schedule optimisation impact.", tags: ["oee_baseline", "benchmark", "historical", "kpi"] },
  { label: "KPI Projection",            category: "forecast",                 description: "An estimated shift-level performance outcome computed from a schedule alternative, covering OEE%, OTIF%, changeover count, and substrate utilisation vs. baseline.", tags: ["kpi", "projection", "forecast", "impact"] },
] as const;
