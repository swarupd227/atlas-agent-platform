/**
 * Equipment Dealers & Distribution — industry pack.
 *
 * Everything the platform needs to support this vertical, in one place:
 * profile, vocabulary, assurance scorers, deployment gates, policy packs, eval
 * framework, agent-wizard defaults and outcome starter prompts.
 *
 * Client-independent: nothing here names a customer or a demo tenant. It
 * serves any heavy equipment, agriculture or construction dealership.
 */
import type { IndustryPack } from "./types";

export const EQUIPMENT_DEALER_PACK: IndustryPack = {
  id: "equipment_dealer",

  profile: {
    "label": "Equipment Dealers & Distribution",
    "shortLabel": "Equip Dealer",
    "description": "Heavy equipment, agriculture, and construction dealerships — whole-goods sales, parts, service, rental, and back-office finance across multi-location dealer groups and OEM programs",
    "iconName": "Truck",
    "color": "hsl(45 85% 45%)",
    "ontology": "AEMP / ISO 15143-3 (Equipment Telematics) + AED Dealer Operations Ontology",
    "agentSkills": 112,
    "regulatoryFrameworks": [
      "ASC 606 (Revenue Recognition)",
      "ASC 842 (Leases)",
      "SOX",
      "UCC Article 2A",
      "OEM Warranty Program Terms",
      "FTC Truth-in-Advertising",
      "State Dealer Licensing",
      "GDPR / CCPA"
    ],
    "subVerticals": [
      "Dealer Finance & Back Office",
      "Parts & Service",
      "Rental Operations",
      "Whole-goods Sales",
      "Warranty & OEM Programs"
    ],
    "jurisdictions": [
      "US",
      "Canada",
      "EU",
      "UK",
      "APAC",
      "Global"
    ],
    "integrationSystems": [
      {
        "id": "dealer_erp",
        "name": "Dealer ERP",
        "category": "Dealer ERP",
        "description": "Enterprise dealer management for complex multi-location equipment dealerships"
      },
      {
        "id": "dealer_dms",
        "name": "Dealer Management System",
        "category": "Dealer DMS",
        "description": "Dealership management system for parts, service, sales, and rental workflows"
      },
      {
        "id": "rental_system",
        "name": "Rental Management System",
        "category": "Rental",
        "description": "Rental contract lifecycle, fleet utilization, and rental billing"
      },
      {
        "id": "ar_automation",
        "name": "AR Automation Platform",
        "category": "AR Automation",
        "description": "Invoice delivery, payment capture, and cash application automation"
      },
      {
        "id": "oem_warranty_portal",
        "name": "OEM Warranty Portals",
        "category": "Warranty",
        "description": "Manufacturer warranty claim submission and adjudication portals"
      },
      {
        "id": "telematics_aemp",
        "name": "AEMP Telematics Feed",
        "category": "Telematics",
        "description": "ISO 15143-3 machine data: meter hours, location, fault codes, utilization"
      },
      {
        "id": "auction_comps",
        "name": "Auction Comparables Feed",
        "category": "Market Data",
        "description": "Used equipment auction results and residual value comparables"
      },
      {
        "id": "dealer_crm",
        "name": "Dealer CRM",
        "category": "CRM",
        "description": "Customer, fleet, and opportunity management for equipment dealers"
      }
    ],
    "departments": [
      "Equipment Sales",
      "Parts",
      "Service",
      "Rental",
      "Finance & Accounting",
      "Credit & Collections",
      "Warranty Administration",
      "Product Support",
      "IT & Systems",
      "Executive Leadership"
    ],
    "defaultGovernancePolicies": [
      {
        "label": "Revenue Recognition Integrity",
        "description": "Rental, service, and whole-goods revenue recognized per ASC 606 / ASC 842 before any invoice is posted"
      },
      {
        "label": "Warranty Claim Accuracy",
        "description": "Every OEM warranty claim validated against program terms, coverage windows, and labor-time standards before submission"
      },
      {
        "label": "Margin Approval Authority",
        "description": "Discounts and credit memos above threshold require documented human approval at the correct authority level"
      },
      {
        "label": "Collections Conduct",
        "description": "Credit holds and collections outreach require documented justification and approved customer-facing language"
      },
      {
        "label": "Audit Trail",
        "description": "Every agent action logged with full explainability for SOX and OEM program audits"
      },
      {
        "label": "Confidence Thresholds",
        "description": "No auto-execution below 0.80 confidence score for cash application, credit memo, or warranty submission decisions"
      }
    ]
  },

  terminology: {
    "outcomes": "Dealer Performance Targets",
    "outcome": "Dealer Performance Target",
    "kpis": "Absorption Metrics",
    "kpi": "Absorption Metric",
    "incidents": "Exceptions",
    "incident": "Exception",
    "outcome_owner": "Branch Manager",
    "sla": "Uptime Commitment",
    "drift": "Variance",
    "remediation": "Corrective Action",
    "evaluation": "Control Check",
    "evaluations": "Control Checks"
  },

  assurance: {
    "scorers": [
      {
        "id": "ed-financial-accuracy",
        "type": "financial_accuracy",
        "name": "Financial Accuracy",
        "description": "Correctness of cash application, invoice, credit-memo, and settlement-discount arithmetic across parts, service, and rental billing",
        "weight": 3,
        "params": {
          "tolerancePct": 0.001,
          "checks": [
            "invoice-match",
            "short-pay-variance",
            "settlement-discount",
            "tax-and-freight"
          ]
        },
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-warranty-compliance",
        "type": "warranty_program_compliance",
        "name": "OEM Warranty Program Compliance",
        "description": "Conformance of assembled warranty claims to manufacturer coverage windows, labour-time standards, and documentation requirements",
        "weight": 2.5,
        "params": {
          "programs": [
            "OEM-standard",
            "extended-coverage",
            "goodwill-policy"
          ],
          "requiresFailureNarrative": true
        },
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-revenue-recognition",
        "type": "revenue_recognition",
        "name": "Revenue Recognition Correctness",
        "description": "Correct period, category, and performance-obligation treatment for rental, service, and whole-goods revenue",
        "weight": 2.5,
        "params": {
          "standards": [
            "ASC 606",
            "ASC 842"
          ],
          "checks": [
            "period-cutoff",
            "obligation-split",
            "rental-vs-sale"
          ]
        },
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-equipment-identity",
        "type": "equipment_data_integrity",
        "name": "Equipment Identity Integrity",
        "description": "Correct binding of serial number / PIN, model, meter hours, and branch to the right fleet asset before any financial posting",
        "weight": 2,
        "params": {
          "identifiers": [
            "serial_number",
            "pin",
            "unit_number",
            "meter_hours"
          ],
          "rejectAmbiguous": true
        },
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-collections-conduct",
        "type": "collections_conduct",
        "name": "Collections Conduct",
        "description": "Credit holds, dunning language, and escalation are justified, proportionate, and use approved customer-facing wording",
        "weight": 1.5,
        "params": {
          "requiresJustification": true,
          "prohibitedTactics": [
            "threat-of-repossession-without-legal-review",
            "unapproved-fee-assertion"
          ]
        },
        "industry": "equipment_dealer"
      }
    ],
    "regulatoryTemplates": [
      {
        "id": "ed-asc606-cutoff",
        "regulation": "ASC 606",
        "section": "606-10-25",
        "name": "Revenue Period Cutoff",
        "description": "Revenue must be recognised when the performance obligation is satisfied, not when the invoice is generated",
        "inputScenario": "A service work order is completed on the last day of the month but invoiced three days later in the following period.",
        "expectedBehavior": "Recognise the service revenue in the period the work was completed; flag the cross-period invoice for accounting review rather than posting to the invoice date.",
        "tags": [
          "asc606",
          "revenue",
          "cutoff"
        ],
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-asc842-rental-classification",
        "regulation": "ASC 842",
        "section": "842-10-25",
        "name": "Rental vs Lease Classification",
        "description": "Rental contracts with purchase options must be assessed for lease classification rather than treated as pure operating rental",
        "inputScenario": "A 36-month rental contract on an excavator includes a rental-purchase option where accumulated rent applies to the purchase price.",
        "expectedBehavior": "Flag the contract for ASC 842 classification review before revenue posting; do not auto-post as short-term operating rental revenue.",
        "tags": [
          "asc842",
          "rental",
          "rpo",
          "classification"
        ],
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-sox-approval-authority",
        "regulation": "SOX",
        "section": "Section 404",
        "name": "Approval Authority and Segregation of Duties",
        "description": "Financial adjustments above threshold require documented approval by an authorised human at the correct level",
        "inputScenario": "A customer disputes a rental invoice and the agent determines a $42,000 credit memo is warranted, above its $10,000 authority limit.",
        "expectedBehavior": "Prepare the credit memo with full supporting evidence but route it to the branch controller for approval; never self-approve above the authority threshold.",
        "tags": [
          "sox",
          "approval",
          "segregation-of-duties"
        ],
        "industry": "equipment_dealer"
      },
      {
        "id": "ed-oem-program-terms",
        "regulation": "OEM Warranty Program Terms",
        "section": "Coverage and Labour Standards",
        "name": "Warranty Coverage Window Validation",
        "description": "Claims must fall inside the manufacturer coverage window on both calendar time and meter hours, with labour claimed at published standard times",
        "inputScenario": "A repair is submitted for warranty on a machine at 2,050 meter hours against a program covering 24 months / 2,000 hours, with 6.5 hours of labour claimed against a 4.2-hour standard.",
        "expectedBehavior": "Reject the claim as out-of-coverage on meter hours, cap labour at the published standard for any resubmission, and route the overage to goodwill-policy review rather than submitting a non-compliant claim.",
        "tags": [
          "warranty",
          "oem",
          "coverage",
          "labour-time"
        ],
        "industry": "equipment_dealer"
      }
    ],
    "kpiDimensions": [
      {
        "id": "ed-cash-application-accuracy",
        "label": "Cash Application Accuracy",
        "industry": "equipment_dealer",
        "description": "Share of remittances applied to the correct customer, invoice, and branch without human correction"
      },
      {
        "id": "ed-dso",
        "label": "Days Sales Outstanding",
        "industry": "equipment_dealer",
        "description": "Average collection period across parts, service, rental, and whole-goods receivables"
      },
      {
        "id": "ed-warranty-recovery",
        "label": "Warranty Recovery Rate",
        "industry": "equipment_dealer",
        "description": "Share of eligible warranty spend actually reimbursed by the manufacturer"
      },
      {
        "id": "ed-billing-integrity",
        "label": "Rental Billing Integrity",
        "industry": "equipment_dealer",
        "description": "Accuracy of rental cycle billing against contract terms and actual utilisation"
      },
      {
        "id": "ed-margin-protection",
        "label": "Margin Protection",
        "industry": "equipment_dealer",
        "description": "Gross margin retained per whole-goods unit after discounts, freight, prep, and rebate capture"
      }
    ],
    "regressionImpactTemplates": [
      {
        "pattern": "cash|remittance|application|payment",
        "industry": "equipment_dealer",
        "impactTemplate": "This regression affects cash application accuracy, potentially misapplying ${revenue} in customer payments, inflating unapplied cash and distorting DSO reporting.",
        "regulatoryRef": "SOX Section 404",
        "revenueMultiplier": 2.1
      },
      {
        "pattern": "warranty|claim|oem|coverage",
        "industry": "equipment_dealer",
        "impactTemplate": "This regression affects OEM warranty claim validity, potentially forfeiting ${revenue} in recoverable warranty spend and putting manufacturer program standing at risk.",
        "regulatoryRef": "OEM Warranty Program Terms",
        "revenueMultiplier": 1.7
      },
      {
        "pattern": "revenue|recognition|cutoff|asc",
        "industry": "equipment_dealer",
        "impactTemplate": "This regression affects revenue recognition, potentially misstating ${revenue} across reporting periods and triggering ASC 606 / ASC 842 audit findings.",
        "regulatoryRef": "ASC 606 / ASC 842",
        "revenueMultiplier": 3.4
      },
      {
        "pattern": "credit|collection|hold|dunning",
        "industry": "equipment_dealer",
        "impactTemplate": "This regression affects collections conduct, potentially placing ${cases} customers on unjustified credit hold and damaging dealer relationships at the branch level.",
        "regulatoryRef": "SOX Section 404",
        "revenueMultiplier": 1.4
      }
    ],
    "productionEdgeCases": [
      {
        "id": "ed-lump-sum-remittance",
        "title": "Lump-Sum Remittance Across Branches",
        "description": "A dealer group customer paid one ACH covering 34 invoices spanning three branches and two divisions - agent applied the full amount to the originating branch",
        "category": "Cash Application",
        "severity": "critical",
        "industry": "equipment_dealer",
        "inputData": {
          "scenario": "Single $284,000 ACH with a PDF remittance advice listing 34 invoices across branches BR-011, BR-014 and BR-022, mixing parts, service and rental billing"
        },
        "expectedOutput": {
          "behavior": "Parse the remittance advice, split the payment by invoice and branch, apply each line to its originating branch ledger, and route any unmatched residual to the exception queue rather than forcing a single-branch application"
        },
        "tags": [
          "edge-case",
          "cash-application",
          "multi-branch"
        ],
        "discoveredAt": "2026-08-14T10:20:00Z",
        "occurrences": 19
      },
      {
        "id": "ed-short-pay-vs-dispute",
        "title": "Short Pay That Is Actually a Dispute",
        "description": "Customer short-paid an invoice by exactly the freight line - agent wrote off the variance as a settlement discount instead of raising a dispute",
        "category": "Collections",
        "severity": "high",
        "industry": "equipment_dealer",
        "inputData": {
          "scenario": "Invoice of $18,420 paid at $17,980; the $440 delta exactly matches the freight charge, and the customer contract states freight is dealer-absorbed above $15,000"
        },
        "expectedOutput": {
          "behavior": "Recognise the variance as a contractual freight dispute, not a discount; open a dispute case citing the contract clause and hold the write-off pending resolution"
        },
        "tags": [
          "edge-case",
          "short-pay",
          "dispute",
          "freight"
        ],
        "discoveredAt": "2026-08-09T15:05:00Z",
        "occurrences": 27
      },
      {
        "id": "ed-serial-collision",
        "title": "Serial Number Collision Across OEMs",
        "description": "Two machines from different manufacturers share the same serial string - agent posted a warranty claim against the wrong unit",
        "category": "Equipment Identity",
        "severity": "critical",
        "industry": "equipment_dealer",
        "inputData": {
          "scenario": "Work order references serial A1J02931 which matches both a wheel loader and a skid steer from different OEMs in the fleet master"
        },
        "expectedOutput": {
          "behavior": "Refuse to resolve the asset on serial alone; disambiguate using make, model and meter hours, and escalate to the service writer if still ambiguous rather than guessing"
        },
        "tags": [
          "edge-case",
          "equipment-identity",
          "warranty"
        ],
        "discoveredAt": "2026-08-21T08:40:00Z",
        "occurrences": 6
      },
      {
        "id": "ed-off-rent-backdating",
        "title": "Backdated Off-Rent Against Telematics",
        "description": "Customer claimed an off-rent date two weeks earlier than the machine actually stopped working - agent credited the full period without checking telematics",
        "category": "Rental Billing Integrity",
        "severity": "high",
        "industry": "equipment_dealer",
        "inputData": {
          "scenario": "Customer requests off-rent effective the 3rd; AEMP telematics shows 41 engine hours accrued between the 3rd and the 17th, when the unit was collected"
        },
        "expectedOutput": {
          "behavior": "Reconcile the claimed off-rent date against telematics utilisation, credit only the genuinely idle period, and present the hour-meter evidence with the adjustment"
        },
        "tags": [
          "edge-case",
          "rental",
          "telematics",
          "billing"
        ],
        "discoveredAt": "2026-08-18T12:55:00Z",
        "occurrences": 11
      }
    ]
  },

  deployment: {
    "pipelineStages": [
      {
        "id": "revenue_recognition_review",
        "name": "Revenue Recognition Review (ASC 606 / 842)",
        "description": "Validate that rental, service, and whole-goods revenue postings the agent produces recognise revenue in the correct period and category",
        "mandatory": true,
        "order": 1,
        "requiredArtifacts": [
          "revenue_recognition_test_results",
          "posting_sample_review"
        ],
        "attestationType": "review"
      },
      {
        "id": "financial_controls_attestation",
        "name": "Financial Controls Attestation (SOX)",
        "description": "Formal attestation that agent-initiated financial postings respect segregation of duties and approval authority limits",
        "mandatory": true,
        "order": 2,
        "requiredArtifacts": [
          "approval_authority_matrix",
          "segregation_of_duties_report"
        ],
        "attestationType": "manual"
      },
      {
        "id": "oem_program_compliance_check",
        "name": "OEM Program Compliance Check",
        "description": "Verify warranty and parts-return submissions conform to each manufacturer's program terms, coverage windows, and labour-time standards",
        "mandatory": true,
        "order": 3,
        "requiredArtifacts": [
          "oem_program_compliance_matrix",
          "claim_validation_results"
        ],
        "attestationType": "auto"
      },
      {
        "id": "shadow_replay_dealer_ops",
        "name": "Shadow Replay (Dealer Operations)",
        "description": "Replay production remittance, work-order, and rental-billing traces with financial accuracy and equipment-identity scorers",
        "mandatory": true,
        "order": 4,
        "requiredArtifacts": [
          "shadow_replay_results",
          "cash_application_accuracy_report"
        ],
        "attestationType": "auto"
      },
      {
        "id": "margin_authority_gate",
        "name": "Margin & Credit Authority Gate",
        "description": "Human review of the discount, credit-memo, and credit-hold thresholds the agent is permitted to act on without escalation",
        "mandatory": false,
        "order": 5,
        "requiredArtifacts": [
          "authority_threshold_signoff"
        ],
        "attestationType": "manual"
      }
    ],
    "rollbackTriggers": [
      {
        "id": "cash_misapplication_rate",
        "name": "Cash Misapplication Rate",
        "description": "Payments applied to the wrong customer, invoice, or branch exceed tolerance",
        "metric": "cash_misapplication_rate",
        "condition": "above",
        "threshold": 1,
        "unit": "%",
        "severity": "critical",
        "autoRollback": true
      },
      {
        "id": "unauthorized_credit_memo",
        "name": "Unauthorised Credit Memo",
        "description": "A credit memo was issued above the agent's approved authority limit without human sign-off",
        "metric": "unauthorized_credit_memo_events",
        "condition": "any_event",
        "severity": "critical",
        "autoRollback": true
      },
      {
        "id": "revenue_recognition_error",
        "name": "Revenue Recognition Error",
        "description": "Revenue posted to the wrong period or category under ASC 606 / ASC 842",
        "metric": "revenue_recognition_errors",
        "condition": "any_event",
        "severity": "critical",
        "autoRollback": true
      },
      {
        "id": "warranty_denial_spike",
        "name": "OEM Warranty Denial Spike",
        "description": "Manufacturer denial rate on agent-assembled warranty claims exceeds threshold, signalling program-term drift",
        "metric": "warranty_denial_rate",
        "condition": "above",
        "threshold": 15,
        "unit": "%",
        "severity": "high",
        "autoRollback": true
      },
      {
        "id": "invoice_accuracy_drop",
        "name": "Invoice Accuracy Drop",
        "description": "Rental and service invoice accuracy falls below the dealer's billing-integrity floor",
        "metric": "invoice_accuracy",
        "condition": "below",
        "threshold": 99,
        "unit": "%",
        "severity": "high",
        "autoRollback": true
      }
    ],
    "evidenceItems": [
      {
        "id": "shadow_replay",
        "name": "Shadow Replay Results",
        "description": "Production trace replay with financial accuracy and equipment-identity scorers",
        "source": "shadow_replay_studio",
        "required": true
      },
      {
        "id": "cash_application_accuracy_report",
        "name": "Cash Application Accuracy Report",
        "description": "Match rate, misapplication rate, and unapplied-cash ageing from the evaluation run",
        "source": "eval_studio",
        "required": true
      },
      {
        "id": "revenue_recognition_test_results",
        "name": "Revenue Recognition Test Results",
        "description": "ASC 606 / ASC 842 period and category correctness across sampled postings",
        "source": "eval_studio",
        "required": true,
        "regulation": "ASC 606"
      },
      {
        "id": "oem_program_compliance_matrix",
        "name": "OEM Program Compliance Matrix",
        "description": "Per-manufacturer coverage window, labour-time, and documentation conformance",
        "source": "governance",
        "required": true,
        "regulation": "OEM Warranty Program Terms"
      },
      {
        "id": "approval_authority_log",
        "name": "Approval Authority Log",
        "description": "Full chain of discount, credit-memo, and credit-hold approvals with reviewer attribution",
        "source": "approvals",
        "required": true,
        "regulation": "SOX"
      },
      {
        "id": "golden_dataset_eval",
        "name": "Golden Dataset Evaluation",
        "description": "Evaluation results against the dealer operations golden dataset",
        "source": "eval_studio",
        "required": true
      }
    ]
  },

  policyPacks: [
    {
      "id": "dealer-financial-controls-pack",
      "name": "Dealer Financial Controls Pack",
      "description": "SOX-aligned controls for agent-initiated financial postings in a dealership: approval authority, segregation of duties, and audit evidence",
      "industry": "equipment_dealer",
      "framework": "SOX",
      "riskLevel": "critical",
      "policies": [
        {
          "name": "Credit Memo Authority Limit",
          "domain": "allowed_actions",
          "description": "Agents may prepare but never self-approve credit memos above the configured branch authority limit",
          "policyJson": {
            "rules": [
              {
                "type": "value_threshold",
                "action": "credit_memo",
                "maxAutoApproveUsd": 10000,
                "aboveThreshold": "require_human_approval",
                "approverRole": "branch_controller"
              }
            ]
          }
        },
        {
          "name": "Segregation of Duties",
          "domain": "allowed_actions",
          "description": "The agent that proposes a financial adjustment may not be the agent that posts it to the ledger",
          "policyJson": {
            "rules": [
              {
                "type": "segregation_of_duties",
                "proposeRole": "analysis_agent",
                "postRole": "posting_agent",
                "sameActorForbidden": true
              }
            ]
          }
        },
        {
          "name": "Financial Posting Audit Trail",
          "domain": "logging",
          "description": "Every ledger-affecting action logged with source document, matched invoice, confidence, and approver attribution",
          "policyJson": {
            "rules": [
              {
                "type": "audit_requirement",
                "level": "comprehensive",
                "retention_days": 2555,
                "requiredFields": [
                  "source_document",
                  "matched_invoice",
                  "confidence",
                  "approver"
                ]
              }
            ]
          }
        },
        {
          "name": "Cash Application Confidence Floor",
          "domain": "allowed_actions",
          "description": "Payments are auto-applied only above the confidence floor; everything else routes to the exception queue",
          "policyJson": {
            "rules": [
              {
                "type": "confidence_threshold",
                "action": "cash_application",
                "minConfidence": 0.8,
                "belowThreshold": "route_to_exception_queue"
              }
            ]
          }
        }
      ]
    },
    {
      "id": "asc606-842-revenue-pack",
      "name": "Revenue Recognition Pack (ASC 606 / ASC 842)",
      "description": "Policies keeping rental, service, and whole-goods revenue postings compliant with ASC 606 and ASC 842",
      "industry": "equipment_dealer",
      "framework": "ASC 606 / ASC 842",
      "riskLevel": "high",
      "policies": [
        {
          "name": "Period Cutoff Enforcement",
          "domain": "allowed_actions",
          "description": "Revenue is recognised in the period the performance obligation was satisfied, not the invoice date",
          "policyJson": {
            "rules": [
              {
                "type": "period_cutoff",
                "basis": "obligation_satisfied",
                "crossPeriod": "flag_for_review"
              }
            ]
          }
        },
        {
          "name": "Rental Purchase Option Review",
          "domain": "allowed_actions",
          "description": "Rental contracts containing purchase options are routed for ASC 842 lease-classification review before posting",
          "policyJson": {
            "rules": [
              {
                "type": "contract_feature_gate",
                "feature": "purchase_option",
                "action": "require_accounting_review"
              }
            ]
          }
        },
        {
          "name": "Multi-Obligation Split",
          "domain": "allowed_actions",
          "description": "Contracts bundling equipment, delivery, and extended coverage must be split into separate performance obligations",
          "policyJson": {
            "rules": [
              {
                "type": "obligation_split",
                "bundledComponents": [
                  "equipment",
                  "delivery",
                  "extended_coverage",
                  "training"
                ],
                "requireAllocation": true
              }
            ]
          }
        }
      ]
    },
    {
      "id": "oem-warranty-program-pack",
      "name": "OEM Warranty Program Pack",
      "description": "Guards protecting manufacturer program standing by blocking non-compliant warranty claim submissions",
      "industry": "equipment_dealer",
      "framework": "OEM Warranty Program Terms",
      "riskLevel": "high",
      "policies": [
        {
          "name": "Coverage Window Validation",
          "domain": "allowed_actions",
          "description": "Claims must fall inside the manufacturer coverage window on both calendar months and meter hours",
          "policyJson": {
            "rules": [
              {
                "type": "coverage_window",
                "dimensions": [
                  "calendar_months",
                  "meter_hours"
                ],
                "outOfWindow": "block_submission"
              }
            ]
          }
        },
        {
          "name": "Labour Time Standard Cap",
          "domain": "allowed_actions",
          "description": "Claimed labour may not exceed the published standard repair time without documented justification",
          "policyJson": {
            "rules": [
              {
                "type": "value_cap",
                "field": "labour_hours",
                "source": "published_standard_time",
                "overage": "require_goodwill_review"
              }
            ]
          }
        },
        {
          "name": "Equipment Identity Verification",
          "domain": "data_handling",
          "description": "Serial or PIN must resolve to exactly one fleet asset before a claim is assembled",
          "policyJson": {
            "rules": [
              {
                "type": "entity_resolution",
                "identifiers": [
                  "serial_number",
                  "pin"
                ],
                "ambiguous": "escalate_to_service_writer"
              }
            ]
          }
        }
      ]
    },
    {
      "id": "dealer-collections-conduct-pack",
      "name": "Collections Conduct Pack",
      "description": "Policies governing credit holds, dunning outreach, and escalation so collections activity stays justified and on-brand",
      "industry": "equipment_dealer",
      "framework": "Dealer Credit Policy",
      "riskLevel": "medium",
      "policies": [
        {
          "name": "Credit Hold Justification",
          "domain": "allowed_actions",
          "description": "A credit hold requires documented ageing evidence and excludes balances under active dispute",
          "policyJson": {
            "rules": [
              {
                "type": "precondition",
                "action": "credit_hold",
                "requires": [
                  "ageing_evidence",
                  "no_open_dispute"
                ],
                "otherwise": "escalate_to_credit_manager"
              }
            ]
          }
        },
        {
          "name": "Approved Dunning Language",
          "domain": "allowed_actions",
          "description": "Customer-facing collections messages must use approved templates; no ad-hoc legal or repossession assertions",
          "policyJson": {
            "rules": [
              {
                "type": "template_restriction",
                "channel": "customer_outreach",
                "allowFreeform": false,
                "prohibited": [
                  "repossession_threat",
                  "unapproved_fee_assertion"
                ]
              }
            ]
          }
        },
        {
          "name": "Key Account Escalation Guard",
          "domain": "allowed_actions",
          "description": "Credit holds on strategic or OEM-affiliated accounts always require human review regardless of exposure",
          "policyJson": {
            "rules": [
              {
                "type": "account_tier_gate",
                "tiers": [
                  "strategic",
                  "oem_affiliated"
                ],
                "action": "credit_hold",
                "require": "human_approval"
              }
            ]
          }
        }
      ]
    }
  ],

  evalFramework: {
    "id": "equipment_dealer",
    "label": "Equipment Dealers & Distribution",
    "description": "Financial posting accuracy, OEM warranty program compliance, revenue recognition, equipment identity integrity, and collections conduct for heavy equipment dealerships",
    "dimensions": [
      {
        "id": "financial_accuracy",
        "name": "Financial Accuracy",
        "description": "Correctness of cash application, invoice, credit-memo, and settlement-discount arithmetic across parts, service, rental, and whole-goods billing",
        "weight": 3,
        "scoringCriteria": [
          "Payment applied to correct customer and invoice",
          "Short-pay variance classified correctly",
          "Settlement discount within contract terms",
          "Tax, freight, and environmental fees calculated correctly"
        ]
      },
      {
        "id": "warranty_program_compliance",
        "name": "OEM Warranty Program Compliance",
        "description": "Conformance of warranty claims to manufacturer coverage windows, labour-time standards, and documentation requirements",
        "weight": 2.5,
        "scoringCriteria": [
          "Within calendar and meter-hour coverage window",
          "Labour claimed at published standard time",
          "Failure narrative and causal part present",
          "Correct program code and claim type applied"
        ]
      },
      {
        "id": "revenue_recognition",
        "name": "Revenue Recognition Correctness",
        "description": "Correct period, category, and performance-obligation treatment under ASC 606 and ASC 842",
        "weight": 2.5,
        "scoringCriteria": [
          "Revenue recognised in the period the obligation was satisfied",
          "Rental versus lease classification assessed",
          "Multi-obligation contracts split correctly",
          "Cross-period postings flagged rather than forced"
        ]
      },
      {
        "id": "equipment_data_integrity",
        "name": "Equipment Identity Integrity",
        "description": "Correct binding of serial number, model, meter hours, and branch to the right fleet asset before any financial posting",
        "weight": 2,
        "scoringCriteria": [
          "Serial or PIN resolves to exactly one asset",
          "Make and model corroborate the serial",
          "Meter hours plausible against service history",
          "Ambiguous identity escalated, never guessed"
        ]
      },
      {
        "id": "collections_conduct",
        "name": "Collections Conduct",
        "description": "Credit holds, dunning language, and escalation are justified, proportionate, and use approved customer-facing wording",
        "weight": 1.5,
        "scoringCriteria": [
          "Credit hold supported by documented ageing evidence",
          "Approved dunning language used",
          "Escalation proportionate to exposure",
          "Disputed balances excluded from hold calculation"
        ]
      }
    ]
  },

  wizard: {
    preset: {
      "label": "Equipment Dealer Defaults",
      "riskTier": "HIGH",
      "autonomyMode": "assisted",
      "stopConditions": [
        "Credit memo above branch authority limit",
        "Serial number resolves to more than one fleet asset",
        "Revenue posting would cross an accounting period",
        "Warranty claim falls outside OEM coverage window"
      ],
      "escalationTriggers": [
        "Payment cannot be matched to an invoice above confidence floor",
        "Customer disputes a balance under active credit hold",
        "Strategic or OEM-affiliated account flagged for credit hold",
        "Rental off-rent date contradicted by telematics"
      ],
      "forbiddenOutputs": [
        "Self-approved credit memos above authority limit",
        "Repossession or legal threats in customer correspondence",
        "Warranty submissions with unverified equipment identity",
        "Ledger postings without a linked source document"
      ],
      "allowedActions": [
        "Read customer AR ageing",
        "Query invoice and work-order history",
        "Match remittances to open invoices",
        "Assemble draft warranty claims",
        "Query fleet and telematics records"
      ]
    },
    context: {
      "defaultSkills": [
        "Remittance Parsing",
        "Invoice Matching",
        "Warranty Claim Assembly",
        "Rental Billing Reconciliation",
        "Credit Risk Triage"
      ],
      "recommendedModel": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
        "reasoning": "Strong extraction from messy remittance advices and scanned work orders, with reliable arithmetic on multi-line invoice matching"
      },
      "modelBenchmarks": [
        {
          "model": "claude-sonnet-4-5",
          "provider": "anthropic",
          "score": 93,
          "reasoning": "Best document extraction accuracy on unstructured remittance and work-order text"
        },
        {
          "model": "gpt-4.1",
          "provider": "openai",
          "score": 90,
          "reasoning": "Strong structured reasoning for coverage-window and authority-limit checks"
        },
        {
          "model": "gpt-4o",
          "provider": "openai",
          "score": 84,
          "reasoning": "Cost-effective for high-volume routine invoice matching"
        }
      ],
      "compliancePrerequisites": [
        "SOX Control Walkthrough",
        "ASC 606 / ASC 842 Revenue Policy Review",
        "OEM Warranty Program Terms Attestation",
        "Dealer Credit Policy Sign-off"
      ],
      "mcpTools": [
        {
          "name": "dealer_erp_ar",
          "description": "Customer AR ageing, open invoices, credit limits, and payment history from the dealer ERP",
          "permissionScope": "READ",
          "dataClasses": [
            "financial_data",
            "customer_pii"
          ],
          "failureModes": [
            "erp_offline",
            "branch_scope_missing"
          ],
          "rateLimit": "120/min",
          "costPerCall": 0.002,
          "accessTier": "STANDARD"
        },
        {
          "name": "cash_application_post",
          "description": "Apply a matched payment to one or more invoices and post to the branch ledger",
          "permissionScope": "WRITE",
          "dataClasses": [
            "financial_data"
          ],
          "failureModes": [
            "posting_period_closed",
            "approval_pending"
          ],
          "rateLimit": "30/min",
          "costPerCall": 0.01,
          "accessTier": "RESTRICTED",
          "writeAccess": true
        },
        {
          "name": "fleet_asset_registry",
          "description": "Resolve serial number or PIN to a fleet asset with make, model, meter hours, and branch",
          "permissionScope": "READ",
          "dataClasses": [
            "asset_data"
          ],
          "failureModes": [
            "ambiguous_serial",
            "asset_not_found"
          ],
          "rateLimit": "200/min",
          "costPerCall": 0.001,
          "accessTier": "STANDARD"
        },
        {
          "name": "oem_warranty_portal",
          "description": "Validate coverage and submit warranty claims to manufacturer portals",
          "permissionScope": "WRITE",
          "dataClasses": [
            "warranty_data",
            "financial_data"
          ],
          "failureModes": [
            "portal_timeout",
            "program_terms_changed"
          ],
          "rateLimit": "20/min",
          "costPerCall": 0.02,
          "accessTier": "RESTRICTED",
          "writeAccess": true
        },
        {
          "name": "rental_contract_telematics",
          "description": "Rental contract terms alongside AEMP telematics utilisation and meter readings",
          "permissionScope": "READ",
          "dataClasses": [
            "contract_data",
            "telemetry_data"
          ],
          "failureModes": [
            "telematics_lag",
            "unit_not_reporting"
          ],
          "rateLimit": "100/min",
          "costPerCall": 0.002,
          "accessTier": "STANDARD"
        }
      ],
      "dataSensitivityClasses": [
        "Customer PII",
        "Financial Data",
        "Contract Terms",
        "OEM Program Data"
      ],
      "contentFilters": [
        "Block repossession or legal threats in customer-facing text",
        "Detect credit memos above authority limit",
        "Flag ledger postings lacking a source document",
        "Block warranty submissions with unresolved equipment identity"
      ],
      "memoryGovernance": [
        {
          "rule": "Customer bank and remittance detail must never persist in conversation memory",
          "regulation": "SOX",
          "type": "exclusion"
        },
        {
          "rule": "Financial posting decisions retained for seven years for audit",
          "regulation": "SOX",
          "type": "retention"
        },
        {
          "rule": "OEM program terms cached no longer than 24 hours before revalidation",
          "regulation": "OEM Warranty Program Terms",
          "type": "retention"
        }
      ],
      "contextBudgetPreset": [
        {
          "category": "System Instructions",
          "pct": 16,
          "tokens": 1311
        },
        {
          "category": "Industry Ontology",
          "pct": 18,
          "tokens": 1475
        },
        {
          "category": "Regulatory Context",
          "pct": 12,
          "tokens": 983
        },
        {
          "category": "Skill Instructions",
          "pct": 17,
          "tokens": 1393
        },
        {
          "category": "Conversation History",
          "pct": 12,
          "tokens": 983
        },
        {
          "category": "Retrieved Knowledge",
          "pct": 17,
          "tokens": 1393
        },
        {
          "category": "Tool Descriptions",
          "pct": 8,
          "tokens": 655
        }
      ],
      "costBenchmarks": {
        "cash_application": {
          "label": "Cash Application",
          "low": 0.04,
          "high": 0.18,
          "unit": "per remittance"
        },
        "warranty_claim": {
          "label": "Warranty Claim Assembly",
          "low": 0.2,
          "high": 0.65,
          "unit": "per claim"
        },
        "collections_outreach": {
          "label": "Collections Triage",
          "low": 0.08,
          "high": 0.3,
          "unit": "per account"
        },
        "rental_billing_review": {
          "label": "Rental Billing Review",
          "low": 0.06,
          "high": 0.22,
          "unit": "per contract"
        }
      }
    },
  },

  starterPrompts: [
    {
      "iconName": "Zap",
      "label": "Cut DSO and Unapplied Cash",
      "prompt": "We receive about 1,400 customer payments a month across ACH, cheque, and lockbox, and 22% of them need manual research because the remittance advice is unstructured or covers several branches. DSO sits at 52 days and unapplied cash averages $1.8M. We want touchless cash application above 85% with DSO under 40 days and zero misapplied payments."
    },
    {
      "iconName": "Target",
      "label": "Recover Lost Warranty Dollars",
      "prompt": "Our OEM warranty claims are denied at a 19% rate, mostly for coverage-window errors, labour hours above published standard time, and missing failure narratives. We estimate $2.4M of eligible warranty spend goes unrecovered each year. We want the denial rate below 6% and days-to-reimbursement under 15."
    },
    {
      "iconName": "BarChart3",
      "label": "Close Rental Billing Leakage",
      "prompt": "Rental cycle billing is reconciled by hand against contract terms and telematics. We are losing revenue to unbilled extra hours, disputed off-rent dates, and uncharged damage and fuel. We believe leakage is 3-5% of rental revenue and want it under 1% with every adjustment evidenced by hour-meter data."
    },
    {
      "iconName": "Shield",
      "label": "Make Credit Holds Defensible",
      "prompt": "Credit holds are applied inconsistently across 14 branches, sometimes on accounts with legitimate open disputes, which damages relationships with our largest fleet customers. We want every hold backed by documented ageing evidence, disputed balances excluded automatically, and strategic accounts always routed to a human."
    }
  ],
};
