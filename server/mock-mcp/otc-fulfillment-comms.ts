import { Router, type Request, type Response } from "express";

const router = Router();

// GET /customer-tier-profiles — tier breakdown of 847 affected customers
router.get("/customer-tier-profiles", (_req: Request, res: Response) => {
  res.json({
    customer_tiers: {
      total_affected: 847,
      tiers: [
        {
          tier:        "Platinum",
          count:       87,
          shipments:   87,
          revenue_usd: 2100000,
          notification_template: "Personal email from account manager, specific shipment details, new delivery date, apology note, and credit offer eligibility",
          channel:     ["email", "sms"],
          credit_offer_eligible: true,
          credit_offer_value_usd: 500,
          sla: "Notification within 15 minutes of disruption confirmation",
        },
        {
          tier:        "Gold",
          count:       225,
          shipments:   225,
          revenue_usd: 2700000,
          notification_template: "Branded NovaTech email with shipment-specific details and new ETA. Proactive apology from Customer Experience team.",
          channel:     ["email", "sms"],
          credit_offer_eligible: true,
          credit_offer_value_usd: 200,
          sla: "Notification within 20 minutes of disruption confirmation",
        },
        {
          tier:        "Standard",
          count:       535,
          shipments:   535,
          revenue_usd: 1400000,
          notification_template: "Portal notification with order number, general delay notice, estimated recovery window (48-72 hours), and tracking link.",
          channel:     ["portal"],
          credit_offer_eligible: false,
          sla: "Notification within 30 minutes of disruption confirmation",
        },
      ],
      top_10_by_revenue: [
        { rank: 1,  customer: "Meridian Manufacturing",  tier: "Platinum", shipments: 14, value_usd: 429711, account_manager: "Sarah Chen",   am_email: "s.chen@novatech.com"    },
        { rank: 2,  customer: "Acuity Healthcare",       tier: "Platinum", shipments: 9,  value_usd: 318400, account_manager: "James Patel",  am_email: "j.patel@novatech.com"   },
        { rank: 3,  customer: "Delta Precision Parts",   tier: "Platinum", shipments: 7,  value_usd: 284900, account_manager: "Maria Lopez",  am_email: "m.lopez@novatech.com"   },
        { rank: 4,  customer: "CoreTech Systems",        tier: "Gold",     shipments: 6,  value_usd: 197600, account_manager: "Kevin Wu",     am_email: "k.wu@novatech.com"      },
        { rank: 5,  customer: "Vertex Industrial",       tier: "Gold",     shipments: 5,  value_usd: 163200, account_manager: "Lisa Torres",  am_email: "l.torres@novatech.com"  },
        { rank: 6,  customer: "Pinnacle Aerospace",      tier: "Platinum", shipments: 4,  value_usd: 142800, account_manager: "David Kim",    am_email: "d.kim@novatech.com"     },
        { rank: 7,  customer: "NorthStar Energy",        tier: "Gold",     shipments: 6,  value_usd: 138400, account_manager: "Rachel Green", am_email: "r.green@novatech.com"   },
        { rank: 8,  customer: "Franklin Medical",        tier: "Platinum", shipments: 3,  value_usd: 124600, account_manager: "Sarah Chen",   am_email: "s.chen@novatech.com"    },
        { rank: 9,  customer: "Summit Construction",     tier: "Gold",     shipments: 8,  value_usd: 118200, account_manager: "Tom Bradley",  am_email: "t.bradley@novatech.com" },
        { rank: 10, customer: "Western Hydraulics",      tier: "Gold",     shipments: 5,  value_usd: 104900, account_manager: "Lisa Torres",  am_email: "l.torres@novatech.com"  },
      ],
    },
    generated_at: new Date().toISOString(),
  });
});

// POST /generate-notifications — generate personalised notification content for all 847 customers
router.post("/generate-notifications", (_req: Request, res: Response) => {
  const generatedAt = new Date().toISOString();
  res.json({
    notification_batch: {
      batch_id:          `NOTIF-BATCH-${Date.now().toString(36).toUpperCase()}`,
      total_generated:   847,
      generated_at:      generatedAt,
      by_tier: [
        { tier: "Platinum", count: 87,  subject_line: "Important update on your NovaTech shipment — revised delivery date inside", credit_offer: "$500 credit on your next order" },
        { tier: "Gold",     count: 225, subject_line: "Your NovaTech shipment update — Winter Storm Stella affecting delivery",    credit_offer: "$200 credit on your next order" },
        { tier: "Standard", count: 535, subject_line: null, channel: "portal", message: "Weather delay notice — your order" },
      ],
      sample_notifications: [
        {
          tier:        "Platinum",
          customer:    "Meridian Manufacturing",
          contact:     "j.davis@meridian-mfg.com",
          from:        "Sarah Chen <s.chen@novatech.com>",
          subject:     "Your NovaTech shipment ORD-78432 — revised delivery: Thursday, May 5",
          body_preview: "Hi James, I'm reaching out personally about your 14 pending shipments under ORD-78432. Due to Winter Storm Stella affecting our Chicago facility, we have proactively rerouted your order through our Dallas DC — your revised delivery date is Thursday, May 5. We've also applied a $500 credit to your account. I'm here if you have any questions.",
          credit_offer: "$500 credit applied",
          new_eta:     "Thursday, May 5, 2026",
        },
        {
          tier:        "Gold",
          customer:    "Vertex Industrial",
          contact:     "purchasing@vertex-ind.com",
          subject:     "Your NovaTech Order ORD-77340 — Winter storm delay update",
          body_preview: "Dear Vertex Industrial team, Winter Storm Stella is affecting our Midwest DCs. Your shipment (ORD-77340) has been rerouted via our Dallas DC with a new estimated delivery of Thursday, May 5. A $200 credit has been applied to your account. Track your order at novatech.com/track.",
          credit_offer: "$200 credit applied",
          new_eta:     "Thursday, May 5, 2026",
        },
        {
          tier:     "Standard",
          customer: "Example Standard Customer",
          channel:  "portal",
          message:  "Your order is experiencing a weather-related delay due to Winter Storm Stella affecting our Midwest facilities. Estimated recovery: 48–72 hours. We will update your delivery date once service resumes. Track your order in your customer portal.",
          new_eta:  "ETA updated when carrier service resumes",
        },
      ],
    },
    generated_at: generatedAt,
  });
});

// POST /queue-notifications — queue all 847 notifications for multi-channel delivery
router.post("/queue-notifications", (_req: Request, res: Response) => {
  const queuedAt = new Date().toISOString();
  res.json({
    queue_status: {
      queue_id:                  `QUEUE-${Date.now().toString(36).toUpperCase()}`,
      queued_at:                 queuedAt,
      total_queued:              847,
      channels: {
        email: { count: 847, priority_order: ["Platinum", "Gold", "Standard"], est_completion_mins: 12 },
        sms:   { count: 312, priority_order: ["Platinum", "Gold"],             est_completion_mins: 5  },
        portal: { count: 535, status: "LIVE",                                  est_completion_mins: 1  },
      },
      send_sequence: [
        { batch: 1, tier: "Platinum", count: 87,  channel: "email + sms",  eta_mins: 5  },
        { batch: 2, tier: "Gold",     count: 225, channel: "email + sms",  eta_mins: 10 },
        { batch: 3, tier: "Standard", count: 535, channel: "portal",       eta_mins: 1  },
      ],
      estimated_all_sent_by: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
      compliance_note:        "All notifications include unsubscribe link and comply with CAN-SPAM and GDPR Article 6(1)(b) legitimate interest basis",
    },
    generated_at: queuedAt,
  });
});

// GET /send-status — real-time notification delivery status
router.get("/send-status", (_req: Request, res: Response) => {
  res.json({
    send_status: {
      as_of:       new Date().toISOString(),
      queued:      847,
      sent:        623,
      delivered:   589,
      opened:      234,
      open_rate_pct: 39.7,
      by_tier: [
        { tier: "Platinum", sent: 87,  delivered: 84,  opened: 61,  open_rate_pct: 72.6 },
        { tier: "Gold",     sent: 225, delivered: 211, opened: 98,  open_rate_pct: 46.4 },
        { tier: "Standard", sent: 311, delivered: 294, opened: 75,  open_rate_pct: 25.5 },
      ],
      customer_responses: {
        total: 12,
        sentiment_breakdown: [
          { sentiment: "Positive",  count: 7,  example: "Thanks for the heads up — the proactive communication is appreciated!" },
          { sentiment: "Neutral",   count: 2,  example: "Acknowledged. Please confirm when shipment is dispatched from Dallas." },
          { sentiment: "Negative",  count: 3,  example: "This is the second delay this quarter. We need to discuss our SLA." },
        ],
        callback_requests: 3,
      },
      escalation_queue: [
        { customer: "Delta Precision Parts",  tier: "Platinum", reason: "SLA breach risk remains — expedited air recommended", account_manager: "Maria Lopez",  urgency: "HIGH"   },
        { customer: "Pinnacle Aerospace",     tier: "Platinum", reason: "Callback requested — referenced second delay this quarter", account_manager: "David Kim", urgency: "HIGH"   },
        { customer: "Western Hydraulics",     tier: "Gold",     reason: "Negative sentiment response — contract SLA discussion", account_manager: "Lisa Torres",  urgency: "MEDIUM" },
      ],
      notifications_remaining: 847 - 623,
    },
    generated_at: new Date().toISOString(),
  });
});

export default router;
