import { Router, type Request, type Response } from "express";
import {
  getLeads,
  getSmartLists,
  findLeadById,
  findLeadsByEmail,
  findLeadsByCompany,
  findLeadsByBusinessLine,
  findLeadsByStatus,
  findLeadsByRegion,
  findLeadsByScoreRange,
  type MarketingLead,
} from "../mock-data/marketing-leads";

const router = Router();

function marketoResponse(result: any[], success = true, errors: any[] = []) {
  return {
    requestId: `#${Math.random().toString(36).substring(2, 10)}`,
    success,
    errors,
    result,
  };
}

function leadToMarketoRecord(lead: MarketingLead) {
  return {
    id: parseInt(lead.id.replace("LEAD-", ""), 10),
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    title: lead.jobTitle,
    leadSource: lead.leadSource,
    leadScore: lead.engagementScore,
    mktoPersonId: lead.marketoId,
    sfdcContactId: lead.salesforceContactId,
    sfdcAccountId: lead.salesforceAccountId,
    isRatedEntity: lead.isRatedEntity,
    businessLine: lead.businessLine,
    region: lead.region,
    leadStatus: lead.status,
    lastActivityDate: lead.lastActivityDate,
    createdAt: lead.activityHistory.length > 0
      ? lead.activityHistory[lead.activityHistory.length - 1].timestamp
      : lead.lastActivityDate,
    updatedAt: lead.lastActivityDate,
  };
}

router.get("/rest/v1/leads.json", (req: Request, res: Response) => {
  const filterType = req.query.filterType as string | undefined;
  const filterValues = req.query.filterValues as string | undefined;
  const listId = req.query.listId as string | undefined;
  const batchSize = Math.min(parseInt(req.query.batchSize as string) || 300, 300);
  const nextPageToken = req.query.nextPageToken as string | undefined;

  let leads: MarketingLead[] = [];

  if (filterType === "id" && filterValues) {
    const ids = filterValues.split(",").map(v => v.trim());
    for (const id of ids) {
      const paddedId = id.startsWith("LEAD-") ? id : `LEAD-${id.padStart(4, "0")}`;
      const found = findLeadById(paddedId);
      if (found) leads.push(found);
    }
  } else if (filterType === "email" && filterValues) {
    const emails = filterValues.split(",").map(v => v.trim());
    for (const email of emails) {
      leads.push(...findLeadsByEmail(email));
    }
  } else if (filterType === "company" && filterValues) {
    leads = findLeadsByCompany(filterValues);
  } else if (filterType === "businessLine" && filterValues) {
    leads = findLeadsByBusinessLine(filterValues);
  } else if (filterType === "status" && filterValues) {
    leads = findLeadsByStatus(filterValues);
  } else if (filterType === "region" && filterValues) {
    leads = findLeadsByRegion(filterValues);
  } else if (filterType === "leadScore" && filterValues) {
    const [min, max] = filterValues.split(",").map(Number);
    leads = findLeadsByScoreRange(min || 0, max || 100);
  } else if (listId) {
    const smartLists = getSmartLists();
    const list = smartLists.find(sl => sl.id === parseInt(listId));
    if (list) {
      const allLeads = getLeads();
      leads = allLeads.slice(0, list.leadCount);
    }
  } else {
    leads = getLeads();
  }

  const startIndex = nextPageToken ? parseInt(nextPageToken) : 0;
  const page = leads.slice(startIndex, startIndex + batchSize);
  const moreResult = startIndex + batchSize < leads.length;

  const response: any = marketoResponse(page.map(leadToMarketoRecord));
  if (moreResult) {
    response.nextPageToken = String(startIndex + batchSize);
    response.moreResult = true;
  }

  res.json(response);
});

router.post("/rest/v1/leads.json", (req: Request, res: Response) => {
  const { action, input, lookupField } = req.body;

  if (!input || !Array.isArray(input)) {
    return res.status(400).json(marketoResponse([], false, [
      { code: "1003", message: "Input is required and must be an array" },
    ]));
  }

  const results = input.map((record: any, idx: number) => {
    const leadId = record.id || record.email;
    if (action === "updateOnly" || action === "createOrUpdate") {
      return {
        id: typeof leadId === "number" ? leadId : 1000 + idx,
        status: "updated",
        reasons: [],
      };
    }
    return {
      id: 1000 + idx,
      status: "created",
      reasons: [],
    };
  });

  res.json(marketoResponse(results));
});

router.get("/rest/asset/v1/smartLists.json", (_req: Request, res: Response) => {
  const smartLists = getSmartLists();
  const result = smartLists.map(sl => ({
    id: sl.id,
    name: sl.name,
    description: sl.description,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2026-01-20T14:30:00Z",
    folder: { type: "Folder", value: 1001, folderName: "Marketing Lists" },
    workspace: "Default",
    filterRules: sl.filterRules,
    leadCount: sl.leadCount,
  }));

  res.json({
    success: true,
    errors: [],
    requestId: `#${Math.random().toString(36).substring(2, 10)}`,
    warnings: [],
    result,
  });
});

router.post("/rest/v1/campaigns/:id/trigger.json", (req: Request, res: Response) => {
  const campaignId = parseInt(req.params.id as string);
  const { input } = req.body;

  const leadIds = (input || []).map((entry: any) => entry.id || entry.leadId);

  res.json(marketoResponse([
    {
      id: campaignId,
      status: "triggered",
      leadsProcessed: leadIds.length || 1,
      triggeredAt: new Date().toISOString(),
    },
  ]));
});

router.get("/rest/v1/activities.json", (req: Request, res: Response) => {
  const leadId = req.query.leadId as string | undefined;
  const activityTypeId = req.query.activityTypeId as string | undefined;
  const nextPageToken = req.query.nextPageToken as string | undefined;
  const batchSize = Math.min(parseInt(req.query.batchSize as string) || 100, 300);

  const activityTypeMap: Record<string, number> = {
    email_open: 1,
    email_click: 2,
    page_visit: 3,
    content_download: 4,
    webinar_registration: 5,
    webinar_attended: 6,
    form_submit: 7,
    video_view: 8,
  };
  const reverseTypeMap: Record<number, string> = {};
  for (const [k, v] of Object.entries(activityTypeMap)) {
    reverseTypeMap[v] = k;
  }

  let allActivities: any[] = [];

  if (leadId) {
    const paddedId = leadId.startsWith("LEAD-") ? leadId : `LEAD-${leadId.padStart(4, "0")}`;
    const lead = findLeadById(paddedId);
    if (lead) {
      allActivities = lead.activityHistory.map(a => ({
        id: parseInt(a.id.replace(/\D/g, ""), 10),
        leadId: parseInt(lead.id.replace("LEAD-", ""), 10),
        activityDate: a.timestamp,
        activityTypeId: activityTypeMap[a.type] || 0,
        activityTypeName: a.type,
        primaryAttributeValue: a.details,
        attributes: [
          { name: "Source", value: lead.leadSource },
          { name: "Region", value: lead.region },
        ],
      }));
    }
  } else {
    const leads = getLeads().slice(0, 50);
    for (const lead of leads) {
      for (const a of lead.activityHistory) {
        allActivities.push({
          id: parseInt(a.id.replace(/\D/g, ""), 10),
          leadId: parseInt(lead.id.replace("LEAD-", ""), 10),
          activityDate: a.timestamp,
          activityTypeId: activityTypeMap[a.type] || 0,
          activityTypeName: a.type,
          primaryAttributeValue: a.details,
          attributes: [
            { name: "Source", value: lead.leadSource },
            { name: "Region", value: lead.region },
          ],
        });
      }
    }
  }

  if (activityTypeId) {
    const typeIds = activityTypeId.split(",").map(Number);
    allActivities = allActivities.filter(a => typeIds.includes(a.activityTypeId));
  }

  allActivities.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());

  const startIndex = nextPageToken ? parseInt(nextPageToken) : 0;
  const page = allActivities.slice(startIndex, startIndex + batchSize);
  const moreResult = startIndex + batchSize < allActivities.length;

  const response: any = marketoResponse(page);
  if (moreResult) {
    response.nextPageToken = String(startIndex + batchSize);
    response.moreResult = true;
  }

  res.json(response);
});

export default router;
