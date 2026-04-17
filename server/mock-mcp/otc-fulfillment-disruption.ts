import { Router, type Request, type Response } from "express";

const router = Router();

// GET /detect-disruption — detect active winter storm disruption across DC network
router.get("/detect-disruption", (_req: Request, res: Response) => {
  const now = new Date();
  res.json({
    disruption: {
      event_id:        "DSRP-2026-WS-0312",
      event_type:      "WINTER_STORM",
      event_name:      "Winter Storm Stella — Midwest",
      severity:        "CRITICAL",
      detected_at:     now.toISOString(),
      source_signals:  ["NOAA Winter Storm Warning", "UPS Service Disruption Alert — Midwest", "FedEx Ground Delay Notice — IL/IN/MO"],
      affected_dcs: [
        { dc_id: "WH-CHI-001", name: "Chicago Distribution Centre",      city: "Chicago",      state: "IL", status: "OUTBOUND_SUSPENDED", estimated_outage_hours: 60, shipments_affected: 523, capacity_pct: 0 },
        { dc_id: "WH-IND-001", name: "Indianapolis Distribution Centre", city: "Indianapolis",  state: "IN", status: "OUTBOUND_SUSPENDED", estimated_outage_hours: 48, shipments_affected: 198, capacity_pct: 0 },
        { dc_id: "WH-STL-001", name: "St. Louis Distribution Centre",    city: "St. Louis",    state: "MO", status: "OUTBOUND_SUSPENDED", estimated_outage_hours: 54, shipments_affected: 126, capacity_pct: 0 },
      ],
      total_affected_shipments: 847,
      priority_sla_at_risk:     312,
      outage_window_hours:      { min: 48, max: 72, estimated: 60 },
      storm_track:              "Moving northeast at 18 mph — clearance expected Thursday 06:00 CT",
      last_updated:             now.toISOString(),
    },
  });
});

// GET /affected-shipments — full breakdown of 847 affected shipments
router.get("/affected-shipments", (_req: Request, res: Response) => {
  res.json({
    affected_shipments: {
      total:             847,
      priority_sla:      312,
      standard:          489,
      already_delayed:   46,
      by_dc: [
        { dc: "Chicago DC",      dc_id: "WH-CHI-001", count: 523, priority: 189, standard: 316, already_delayed: 18 },
        { dc: "Indianapolis DC", dc_id: "WH-IND-001", count: 198, priority: 83,  standard: 108, already_delayed: 7  },
        { dc: "St. Louis DC",    dc_id: "WH-STL-001", count: 126, priority: 40,  standard: 65,  already_delayed: 21 },
      ],
      by_priority_tier: [
        { tier: "Platinum", count: 87,  sla_at_risk: 87,  revenue_usd: 2100000 },
        { tier: "Gold",     count: 225, sla_at_risk: 225, revenue_usd: 2700000 },
        { tier: "Standard", count: 535, sla_at_risk: 0,   revenue_usd: 1400000 },
      ],
      by_sla_status: [
        { status: "SLA breach in < 24h",  count: 47  },
        { status: "SLA breach in 24–48h", count: 98  },
        { status: "SLA breach in 48–72h", count: 167 },
        { status: "SLA safe if rerouted", count: 489 },
        { status: "Already delayed",      count: 46  },
      ],
      top_customers_at_risk: [
        { customer: "Meridian Manufacturing",  customer_id: "CUST-00892", shipments: 14, value_usd: 429711, tier: "Platinum", sla_hours_remaining: 18  },
        { customer: "Acuity Healthcare",       customer_id: "CUST-01104", shipments: 9,  value_usd: 318400, tier: "Platinum", sla_hours_remaining: 22  },
        { customer: "Vertex Industrial",       customer_id: "CUST-00741", shipments: 7,  value_usd: 284900, tier: "Gold",     sla_hours_remaining: 31  },
        { customer: "Delta Precision Parts",   customer_id: "CUST-01287", shipments: 6,  value_usd: 197600, tier: "Platinum", sla_hours_remaining: 14  },
        { customer: "CoreTech Systems",        customer_id: "CUST-00518", shipments: 5,  value_usd: 163200, tier: "Gold",     sla_hours_remaining: 28  },
      ],
      revenue_at_risk_usd: 4800000,
      revenue_top_50_customers_usd: 4800000,
    },
    generated_at: new Date().toISOString(),
  });
});

// GET /dc-capacity — alternate DC capacity assessment
router.get("/dc-capacity", (_req: Request, res: Response) => {
  res.json({
    alternate_dcs: [
      {
        dc_id:          "WH-DAL-001",
        name:           "Dallas Distribution Centre",
        city:           "Dallas", state: "TX",
        status:         "OPERATIONAL",
        current_load_pct: 61,
        available_slots: 245,
        can_absorb_shipments: 245,
        avg_transit_days_to_midwest: 2,
        next_carrier_pickup: "Today 16:00 CT",
        assigned_carriers: ["UPS Ground", "FedEx Ground", "XPO Logistics"],
        notes: "Largest available capacity — recommended primary overflow DC",
      },
      {
        dc_id:          "WH-ATL-001",
        name:           "Atlanta Distribution Centre",
        city:           "Atlanta", state: "GA",
        status:         "OPERATIONAL",
        current_load_pct: 74,
        available_slots: 178,
        can_absorb_shipments: 178,
        avg_transit_days_to_midwest: 2,
        next_carrier_pickup: "Today 17:30 ET",
        assigned_carriers: ["UPS Ground", "FedEx Ground"],
        notes: "Southeast coverage strength — good for Gold tier customers in Southeast",
      },
      {
        dc_id:          "WH-PHL-001",
        name:           "Philadelphia Distribution Centre",
        city:           "Philadelphia", state: "PA",
        status:         "OPERATIONAL",
        current_load_pct: 82,
        available_slots: 89,
        can_absorb_shipments: 89,
        avg_transit_days_to_midwest: 3,
        next_carrier_pickup: "Today 15:00 ET",
        assigned_carriers: ["UPS Ground", "USPS Priority"],
        notes: "Limited capacity — use for Northeast corridor Platinum accounts only",
      },
    ],
    total_alternate_capacity: 512,
    sufficient_for_priority: true,
    capacity_gap_standard: 489 - 512 < 0 ? 0 : 489 - 512,
    generated_at: new Date().toISOString(),
  });
});

// POST /propose-rerouting — generate rerouting strategy options
router.post("/propose-rerouting", (_req: Request, res: Response) => {
  res.json({
    strategies: [
      {
        id:             "SMART_REROUTE",
        label:          "Smart Reroute (Recommended)",
        description:    "Reroute 312 priority (Platinum + Gold) shipments to alternate DCs. Hold 489 standard shipments for DC recovery.",
        rerouted_count: 312,
        held_count:     489,
        dc_assignments: [
          { dc: "Dallas DC",       dc_id: "WH-DAL-001", shipments: 145, customer_tiers: ["Platinum", "Gold"] },
          { dc: "Atlanta DC",      dc_id: "WH-ATL-001", shipments: 98,  customer_tiers: ["Platinum", "Gold"] },
          { dc: "Philadelphia DC", dc_id: "WH-PHL-001", shipments: 69,  customer_tiers: ["Platinum"]         },
        ],
        incremental_cost_usd: 47200,
        sla_breaches_avoided: 289,
        sla_breaches_remaining: 23,
        sla_save_pct: 92.6,
        estimated_recovery_standard_days: 2.5,
        recommended: true,
      },
      {
        id:             "FULL_REROUTE",
        label:          "Full Reroute",
        description:    "Reroute all 847 shipments to alternate DCs. Maximum SLA protection — maximum cost.",
        rerouted_count: 847,
        held_count:     0,
        incremental_cost_usd: 128000,
        sla_breaches_avoided: 312,
        sla_breaches_remaining: 0,
        sla_save_pct: 100,
        recommended: false,
      },
      {
        id:             "HOLD_AND_WAIT",
        label:          "Hold and Wait (48–72h)",
        description:    "Hold all 847 shipments at disrupted DCs and resume when storm clears. No incremental cost — maximum SLA exposure.",
        rerouted_count: 0,
        held_count:     847,
        incremental_cost_usd: 0,
        sla_breaches_avoided: 0,
        sla_breaches_remaining: 312,
        sla_save_pct: 0,
        estimated_revenue_at_risk_usd: 4800000,
        recommended: false,
      },
    ],
    recommended_strategy: "SMART_REROUTE",
    decision_rationale:   "Smart Reroute saves 93% of SLA commitments for $47.2K incremental cost — $101 per SLA breach avoided. Full Reroute saves the remaining 23 breaches at $3,514 each. Recommend Smart Reroute: optimal cost-to-SLA trade-off.",
    generated_at: new Date().toISOString(),
  });
});

// POST /execute-rerouting — execute approved rerouting strategy
router.post("/execute-rerouting", (_req: Request, res: Response) => {
  const executedAt = new Date().toISOString();
  res.json({
    execution: {
      strategy_executed:     "SMART_REROUTE",
      executed_at:           executedAt,
      executed_by:           "OTC-AGT-005 (Fulfillment & Exception Agent) — Automated Pre-Auth",
      transfer_orders_created: 312,
      assignments: [
        { dc: "Dallas DC",       dc_id: "WH-DAL-001", shipments_assigned: 145, transfer_order_prefix: "TO-DAL-DSRP-0312", first_pickup: "Today 16:00 CT" },
        { dc: "Atlanta DC",      dc_id: "WH-ATL-001", shipments_assigned: 98,  transfer_order_prefix: "TO-ATL-DSRP-0312", first_pickup: "Today 17:30 ET" },
        { dc: "Philadelphia DC", dc_id: "WH-PHL-001", shipments_assigned: 69,  transfer_order_prefix: "TO-PHL-DSRP-0312", first_pickup: "Today 15:00 ET" },
      ],
      wms_update_status:    "CONFIRMED",
      incremental_cost_usd: 47200,
      next_step:            "OTC-AGT-007 to confirm carrier pickup windows and revised ETAs",
    },
    generated_at: executedAt,
  });
});

export default router;
