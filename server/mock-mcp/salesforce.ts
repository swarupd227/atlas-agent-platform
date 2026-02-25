import { Router, type Request, type Response } from "express";
import {
  getLeads,
  findLeadById,
  findLeadsByCompany,
  findLeadsByRegion,
  findLeadsByStatus,
  findLeadsByEmail,
  getCampaigns,
  type MarketingLead,
} from "../mock-data/marketing-leads";

const router = Router();

interface SalesforceRecord {
  attributes: { type: string; url: string };
  [key: string]: unknown;
}

function leadToSfContact(lead: MarketingLead): SalesforceRecord {
  return {
    attributes: {
      type: "Contact",
      url: `/services/data/v59.0/sobjects/Contact/${lead.salesforceContactId}`,
    },
    Id: lead.salesforceContactId,
    FirstName: lead.firstName,
    LastName: lead.lastName,
    Email: lead.email,
    Title: lead.jobTitle,
    AccountId: lead.salesforceAccountId,
    Account: {
      attributes: { type: "Account", url: `/services/data/v59.0/sobjects/Account/${lead.salesforceAccountId}` },
      Name: lead.company,
    },
    LeadSource: lead.leadSource,
    MailingCountry: lead.region === "AMER" ? "United States" : lead.region === "EMEA" ? "United Kingdom" : "Singapore",
  };
}

function leadToSfLead(lead: MarketingLead): SalesforceRecord {
  return {
    attributes: {
      type: "Lead",
      url: `/services/data/v59.0/sobjects/Lead/${lead.id}`,
    },
    Id: lead.id,
    FirstName: lead.firstName,
    LastName: lead.lastName,
    Email: lead.email,
    Company: lead.company,
    Title: lead.jobTitle,
    Status: lead.status,
    LeadSource: lead.leadSource,
    Rating: lead.engagementScore > 75 ? "Hot" : lead.engagementScore > 40 ? "Warm" : "Cold",
    Industry: "Financial Services",
    OwnerId: "005" + lead.salesforceContactId.slice(3, 12),
    Owner: { attributes: { type: "User", url: "#" }, Name: lead.ownerName },
  };
}

function leadToSfAccount(lead: MarketingLead): SalesforceRecord {
  return {
    attributes: {
      type: "Account",
      url: `/services/data/v59.0/sobjects/Account/${lead.salesforceAccountId}`,
    },
    Id: lead.salesforceAccountId,
    Name: lead.company,
    Industry: "Financial Services",
    BillingCountry: lead.region === "AMER" ? "United States" : lead.region === "EMEA" ? "United Kingdom" : "Singapore",
    Type: lead.isRatedEntity ? "Rated Entity" : "Prospect",
    Rating: lead.engagementScore > 75 ? "Hot" : lead.engagementScore > 40 ? "Warm" : "Cold",
  };
}

function campaignToSfCampaign(c: ReturnType<typeof getCampaigns>[number]): SalesforceRecord {
  return {
    attributes: {
      type: "Campaign",
      url: `/services/data/v59.0/sobjects/Campaign/${c.id}`,
    },
    Id: String(c.id),
    Name: c.name,
    Type: c.type,
    Status: c.status === "active" ? "In Progress" : "Paused",
    Description: c.description,
    IsActive: c.status === "active",
  };
}

function parseSoqlLike(q: string): { objectType: string; limit: number; where: string | null } {
  const objectMatch = q.match(/FROM\s+(\w+)/i);
  const objectType = objectMatch ? objectMatch[1] : "Lead";

  const limitMatch = q.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 200;

  const whereMatch = q.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
  const where = whereMatch ? whereMatch[1].trim() : null;

  return { objectType, limit, where };
}

function filterByWhere(leads: MarketingLead[], where: string | null): MarketingLead[] {
  if (!where) return leads;

  const emailMatch = where.match(/Email\s*=\s*'([^']+)'/i);
  if (emailMatch) return leads.filter(l => l.email.toLowerCase() === emailMatch[1].toLowerCase());

  const companyMatch = where.match(/(?:Company|Account\.Name|Name)\s*(?:=|LIKE)\s*'%?([^'%]+)%?'/i);
  if (companyMatch) return leads.filter(l => l.company.toLowerCase().includes(companyMatch[1].toLowerCase()));

  const statusMatch = where.match(/Status\s*=\s*'([^']+)'/i);
  if (statusMatch) return leads.filter(l => l.status === statusMatch[1]);

  const regionMatch = where.match(/(?:Region|MailingCountry|BillingCountry)\s*=\s*'([^']+)'/i);
  if (regionMatch) {
    const val = regionMatch[1];
    const regionMap: Record<string, string> = { "United States": "AMER", "United Kingdom": "EMEA", "Singapore": "APAC", AMER: "AMER", EMEA: "EMEA", APAC: "APAC" };
    const region = regionMap[val] || val;
    return leads.filter(l => l.region === region);
  }

  const idMatch = where.match(/Id\s*=\s*'([^']+)'/i);
  if (idMatch) return leads.filter(l => l.id === idMatch[1] || l.salesforceContactId === idMatch[1] || l.salesforceAccountId === idMatch[1]);

  const ratedMatch = where.match(/(?:IsRatedEntity|Type)\s*=\s*'?(true|Rated Entity)'?/i);
  if (ratedMatch) return leads.filter(l => l.isRatedEntity);

  return leads;
}

router.get("/services/data/v59.0/query/", (req: Request, res: Response) => {
  const q = (req.query.q as string) || "";
  if (!q) {
    return res.status(400).json([{ message: "SOQL query parameter 'q' is required", errorCode: "MALFORMED_QUERY" }]);
  }

  const { objectType, limit, where } = parseSoqlLike(q);
  const allLeads = getLeads();
  const filtered = filterByWhere(allLeads, where);
  const limited = filtered.slice(0, limit);

  let records: SalesforceRecord[];

  switch (objectType.toLowerCase()) {
    case "contact":
      records = limited.map(leadToSfContact);
      break;
    case "account": {
      const seen = new Set<string>();
      records = [];
      for (const l of limited) {
        if (!seen.has(l.salesforceAccountId)) {
          seen.add(l.salesforceAccountId);
          records.push(leadToSfAccount(l));
        }
      }
      break;
    }
    case "opportunity":
      records = limited
        .filter(l => l.status === "Opportunity" || l.status === "Customer")
        .slice(0, limit)
        .map((l, i) => ({
          attributes: { type: "Opportunity", url: `/services/data/v59.0/sobjects/Opportunity/006${l.salesforceContactId.slice(3)}` },
          Id: `006${l.salesforceContactId.slice(3)}`,
          Name: `${l.company} - ${l.businessLine} Renewal`,
          AccountId: l.salesforceAccountId,
          StageName: l.status === "Customer" ? "Closed Won" : "Negotiation",
          Amount: (l.engagementScore * 1000 + 10000),
          CloseDate: l.lastActivityDate,
          OwnerId: "005" + l.salesforceContactId.slice(3, 12),
        }));
      break;
    case "campaign":
      records = getCampaigns().slice(0, limit).map(campaignToSfCampaign);
      break;
    case "lead":
    default:
      records = limited.map(leadToSfLead);
      break;
  }

  res.json({
    totalSize: records.length,
    done: true,
    records,
  });
});

let nextIdCounter = 900000;
const createdLeads: Record<string, object> = {};
const createdTasks: Record<string, object> = {};

router.post("/services/data/v59.0/sobjects/Lead/", (req: Request, res: Response) => {
  const body = req.body || {};
  const id = `00Q${String(++nextIdCounter).padStart(15, "0")}`;

  createdLeads[id] = {
    Id: id,
    ...body,
    CreatedDate: new Date().toISOString(),
  };

  res.status(201).json({
    id,
    success: true,
    errors: [],
  });
});

router.patch("/services/data/v59.0/sobjects/Lead/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body || {};

  if (createdLeads[id]) {
    createdLeads[id] = { ...createdLeads[id] as object, ...body };
  }

  const existingLead = getLeads().find(l => l.id === id || l.salesforceContactId === id);
  if (!existingLead && !createdLeads[id]) {
    return res.status(404).json([{ message: `Lead not found: ${id}`, errorCode: "NOT_FOUND" }]);
  }

  res.status(204).send();
});

router.post("/services/data/v59.0/sobjects/Task/", (req: Request, res: Response) => {
  const body = req.body || {};
  const id = `00T${String(++nextIdCounter).padStart(15, "0")}`;

  createdTasks[id] = {
    Id: id,
    ...body,
    CreatedDate: new Date().toISOString(),
    Status: body.Status || "Not Started",
    Priority: body.Priority || "Normal",
  };

  res.status(201).json({
    id,
    success: true,
    errors: [],
  });
});

export default router;
