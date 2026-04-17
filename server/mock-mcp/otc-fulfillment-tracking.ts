import { Router, type Request, type Response } from "express";

const router = Router();

// GET /carrier-delay-signals — real-time carrier delay signals for Midwest lanes
router.get("/carrier-delay-signals", (_req: Request, res: Response) => {
  res.json({
    carrier_signals: {
      as_of: new Date().toISOString(),
      affected_region: "Midwest — IL, IN, MO",
      carriers: [
        {
          carrier:       "UPS",
          service_alert: "SERVICE_DISRUPTION_ACTIVE",
          affected_services: ["UPS Ground", "UPS 2-Day", "UPS Next Day Air Saver"],
          affected_zips:     ["606xx", "607xx", "462xx", "463xx", "631xx", "632xx"],
          delay_range_days:  { min: 1, max: 3 },
          estimated_clearance: "Thursday 06:00 CT",
          alert_url:     "ups.com/service-alerts",
          inbound_to_alternate_dcs: { dallas: "NORMAL", atlanta: "NORMAL", philadelphia: "NORMAL" },
        },
        {
          carrier:       "FedEx",
          service_alert: "WEATHER_DELAY_NOTICE",
          affected_services: ["FedEx Ground", "FedEx Home Delivery"],
          affected_zips:     ["606xx", "607xx", "462xx", "631xx"],
          delay_range_days:  { min: 1, max: 2 },
          estimated_clearance: "Wednesday 20:00 CT",
          alert_url:     "fedex.com/en-us/service-alerts.html",
          inbound_to_alternate_dcs: { dallas: "NORMAL", atlanta: "NORMAL", philadelphia: "MINOR_DELAY" },
        },
        {
          carrier:       "USPS",
          service_alert: "DELIVERY_DELAY_ADVISORY",
          affected_services: ["Priority Mail", "Priority Mail Express"],
          affected_zips:     ["606xx", "462xx", "631xx"],
          delay_range_days:  { min: 1, max: 2 },
          estimated_clearance: "Thursday 12:00 CT",
          inbound_to_alternate_dcs: { dallas: "NORMAL", atlanta: "NORMAL", philadelphia: "NORMAL" },
        },
      ],
      summary: "All three primary carriers have active service disruptions for Midwest outbound lanes. Inbound service to alternate DCs (Dallas, Atlanta, Philadelphia) is normal — rerouting from alternate DCs is operationally clear.",
    },
  });
});

// GET /shipment-status-bulk — bulk status of 312 priority shipments
router.get("/shipment-status-bulk", (_req: Request, res: Response) => {
  res.json({
    priority_shipments: {
      total:             312,
      in_transit:        84,
      awaiting_pickup:   163,
      at_dc_staging:     65,
      by_carrier: [
        { carrier: "UPS",   count: 187, delay_risk: "HIGH"   },
        { carrier: "FedEx", count: 94,  delay_risk: "HIGH"   },
        { carrier: "USPS",  count: 31,  delay_risk: "MEDIUM" },
      ],
      by_sla_urgency: [
        { band: "< 24h to breach",   count: 47,  action: "IMMEDIATE_REROUTE" },
        { band: "24-48h to breach",  count: 98,  action: "PRIORITY_REROUTE"  },
        { band: "48-72h to breach",  count: 167, action: "STANDARD_REROUTE"  },
      ],
      top_priority_shipments: [
        { shipment_id: "SHP-78432-01", customer: "Meridian Manufacturing",  order: "ORD-78432", carrier: "UPS", origin_dc: "WH-CHI-001", dest_zip: "48210", status: "AWAITING_PICKUP", sla_hours_remaining: 18, reroute_dc: "WH-DAL-001" },
        { shipment_id: "SHP-71204-01", customer: "Delta Precision Parts",   order: "ORD-71204", carrier: "FedEx", origin_dc: "WH-CHI-001", dest_zip: "44114", status: "AWAITING_PICKUP", sla_hours_remaining: 14, reroute_dc: "WH-PHL-001" },
        { shipment_id: "SHP-69871-01", customer: "Acuity Healthcare",       order: "ORD-69871", carrier: "UPS", origin_dc: "WH-IND-001", dest_zip: "33101", status: "AT_DC_STAGING",   sla_hours_remaining: 22, reroute_dc: "WH-ATL-001" },
        { shipment_id: "SHP-82011-01", customer: "CoreTech Systems",        order: "ORD-82011", carrier: "UPS", origin_dc: "WH-CHI-001", dest_zip: "30301", status: "AWAITING_PICKUP", sla_hours_remaining: 28, reroute_dc: "WH-ATL-001" },
        { shipment_id: "SHP-77340-01", customer: "Vertex Industrial",       order: "ORD-77340", carrier: "FedEx", origin_dc: "WH-STL-001", dest_zip: "77001", status: "AWAITING_PICKUP", sla_hours_remaining: 31, reroute_dc: "WH-DAL-001" },
      ],
    },
    generated_at: new Date().toISOString(),
  });
});

// POST /update-routing — update shipment routing for rerouted priority shipments
router.post("/update-routing", (_req: Request, res: Response) => {
  const updatedAt = new Date().toISOString();
  res.json({
    routing_update: {
      updated_at:          updatedAt,
      records_updated:     312,
      carrier_bookings_created: 312,
      by_alternate_dc: [
        { dc: "Dallas DC",       dc_id: "WH-DAL-001", shipments: 145, carrier: "UPS Ground",   pickup_window: "Today 16:00–18:00 CT", booking_ref_prefix: "UPS-DAL-WS0312" },
        { dc: "Atlanta DC",      dc_id: "WH-ATL-001", shipments: 98,  carrier: "FedEx Ground", pickup_window: "Today 17:30–19:00 ET", booking_ref_prefix: "FDX-ATL-WS0312" },
        { dc: "Philadelphia DC", dc_id: "WH-PHL-001", shipments: 69,  carrier: "UPS Ground",   pickup_window: "Today 15:00–16:30 ET", booking_ref_prefix: "UPS-PHL-WS0312" },
      ],
      wms_confirmation:    "ALL_RECORDS_UPDATED",
      erp_status_updated:  true,
    },
    generated_at: updatedAt,
  });
});

// GET /confirm-etas — confirm revised delivery ETAs from alternate DCs
router.get("/confirm-etas", (_req: Request, res: Response) => {
  res.json({
    eta_confirmation: {
      total_rerouted:         312,
      sla_compliant:          289,
      sla_breach_remaining:   23,
      sla_compliance_pct:     92.6,
      eta_distribution: [
        { new_eta: "2 business days (from alternate DC)", shipments: 156, sla_outcome: "MEETS_SLA" },
        { new_eta: "3 business days (from alternate DC)", shipments: 133, sla_outcome: "MEETS_SLA" },
        { new_eta: "4 business days (from alternate DC)", shipments: 23,  sla_outcome: "SLA_BREACH_RISK" },
      ],
      at_risk_shipments: {
        count: 23,
        reason: "Platinum customer destinations in remote Midwest zip codes — 3+ day transit even from alternate DCs",
        recommended_action: "Account managers to contact 23 Platinum customers directly; offer expedited air freight at NovaTech's cost",
        expedited_option_cost_usd: 18400,
      },
      sample_confirmed_etas: [
        { shipment_id: "SHP-78432-01", customer: "Meridian Manufacturing",  original_eta: "Delayed indefinitely (Chicago DC down)", new_eta: "Thursday May 5 (Dallas DC → UPS Ground)", sla_outcome: "MEETS_SLA" },
        { shipment_id: "SHP-69871-01", customer: "Acuity Healthcare",       original_eta: "Delayed indefinitely",                   new_eta: "Thursday May 5 (Atlanta DC → FedEx)",    sla_outcome: "MEETS_SLA" },
        { shipment_id: "SHP-71204-01", customer: "Delta Precision Parts",   original_eta: "Delayed indefinitely",                   new_eta: "Friday May 6 (Philadelphia DC → UPS)",   sla_outcome: "SLA_BREACH_RISK" },
      ],
    },
    generated_at: new Date().toISOString(),
  });
});

export default router;
