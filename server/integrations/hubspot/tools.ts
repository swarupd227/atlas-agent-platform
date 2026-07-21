/**
 * HubSpot tool implementations — 18 tools backed by the HubSpot v3 CRM API
 * (plus the v4 automation API for sales sequences).
 * Uses CRM search API with filter groups for flexible querying.
 * PII fields (email, phone) are subject to Atlas PII masking (R1/R2 policy).
 */

import {
  HubSpotClient,
  DEFAULT_CONTACT_PROPS, DEFAULT_COMPANY_PROPS, DEFAULT_DEAL_PROPS, DEFAULT_TICKET_PROPS,
  type HSContact, type HSCompany, type HSDeal, type HSTicket, type HSFilterGroup,
} from "./client";

// ── PII masking (Atlas R1/R2 policy) ─────────────────────────────────────────
// Covers email, phone, and name fields per the Atlas PII policy (R1/R2).
// R1 = partial mask (default), R2 = full mask.
const EMAIL_PROPS = new Set(["email"]);
const PHONE_PROPS = new Set(["phone", "mobilephone", "fax"]);
const NAME_PROPS = new Set(["firstname", "lastname"]);

function maskContactPii(
  props: Record<string, string | null>,
  level: "R1" | "R2" = "R1"
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => {
      if (!v) return [k, v];
      if (EMAIL_PROPS.has(k)) {
        if (level === "R2") return [k, "••••••••@••••"];
        const [local, domain] = v.split("@");
        return [k, `${local[0] ?? "•"}••••@${domain ?? "••••"}`];
      }
      if (PHONE_PROPS.has(k)) {
        if (level === "R2") return [k, "••••••••••"];
        return [k, v.slice(-4).padStart(v.length, "•")];
      }
      if (NAME_PROPS.has(k)) {
        if (level === "R2") return [k, "••••"];
        // R1: keep first initial + dots
        return [k, v[0] + "•".repeat(Math.max(v.length - 1, 3))];
      }
      return [k, v];
    })
  );
}

// ── Tool: hs_search_contacts ──────────────────────────────────────────────────

export interface HsSearchContactsArgs {
  email?: string;
  name?: string;
  company?: string;
  lifecyclestage?: string;
  limit?: number;
}

export async function hsSearchContacts(client: HubSpotClient, args: HsSearchContactsArgs) {
  const { email, name, company, lifecyclestage, limit = 20 } = args;
  const filterGroups: HSFilterGroup[] = [];

  if (email) {
    filterGroups.push({ filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: email }] });
  }
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      filterGroups.push({
        filters: [
          { propertyName: "firstname", operator: "EQ", value: parts[0] },
          { propertyName: "lastname", operator: "EQ", value: parts.slice(1).join(" ") },
        ],
      });
    } else {
      filterGroups.push({ filters: [{ propertyName: "firstname", operator: "CONTAINS_TOKEN", value: name }] });
      filterGroups.push({ filters: [{ propertyName: "lastname", operator: "CONTAINS_TOKEN", value: name }] });
    }
  }
  if (company) {
    filterGroups.push({ filters: [{ propertyName: "company", operator: "CONTAINS_TOKEN", value: company }] });
  }
  if (lifecyclestage) {
    filterGroups.push({ filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: lifecyclestage }] });
  }

  if (!filterGroups.length) {
    filterGroups.push({ filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] });
  }

  const result = await client.searchObjects<HSContact>(
    "contacts", filterGroups, DEFAULT_CONTACT_PROPS,
    [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }], limit
  );

  return {
    total: result.total,
    contacts: result.results.map(c => ({
      id: c.id,
      properties: maskContactPii(c.properties),
    })),
  };
}

// ── Tool: hs_get_contact ──────────────────────────────────────────────────────

export interface HsGetContactArgs {
  contactId: string;
  includeCompanies?: boolean;
  includeDeals?: boolean;
}

export async function hsGetContact(client: HubSpotClient, args: HsGetContactArgs) {
  const { contactId, includeCompanies = true, includeDeals = true } = args;
  if (!contactId) throw new Error("contactId is required");

  const associations: string[] = [];
  if (includeCompanies) associations.push("companies");
  if (includeDeals) associations.push("deals");

  const contact = await client.getObject<HSContact>(
    "contacts", contactId, DEFAULT_CONTACT_PROPS, associations
  );

  const result: Record<string, unknown> = {
    id: contact.id,
    properties: maskContactPii(contact.properties),
  };

  if (includeCompanies && contact.associations?.companies) {
    const companyIds = contact.associations.companies.results.map(r => r.id).slice(0, 5);
    result.companies = await Promise.all(
      companyIds.map(id => client.getObject<HSCompany>("companies", id, DEFAULT_COMPANY_PROPS).catch(() => null))
    ).then(cs => cs.filter(Boolean).map(c => ({ id: c!.id, properties: c!.properties })));
  }

  if (includeDeals && contact.associations?.deals) {
    const dealIds = contact.associations.deals.results.map(r => r.id).slice(0, 5);
    result.deals = await Promise.all(
      dealIds.map(id => client.getObject<HSDeal>("deals", id, DEFAULT_DEAL_PROPS).catch(() => null))
    ).then(ds => ds.filter(Boolean).map(d => ({ id: d!.id, properties: d!.properties })));
  }

  return result;
}

// ── Tool: hs_create_contact ───────────────────────────────────────────────────

export interface HsCreateContactArgs {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  lifecyclestage?: string;
  companyId?: string;
}

export async function hsCreateContact(client: HubSpotClient, args: HsCreateContactArgs) {
  const { email, firstName, lastName, phone, company, jobTitle, lifecyclestage, companyId } = args;
  if (!email?.includes("@")) throw new Error("A valid email is required to create a contact");

  const properties: Record<string, string> = { email };
  if (firstName) properties.firstname = firstName;
  if (lastName) properties.lastname = lastName;
  if (phone) properties.phone = phone;
  if (company) properties.company = company;
  if (jobTitle) properties.jobtitle = jobTitle;
  if (lifecyclestage) properties.lifecyclestage = lifecyclestage;

  const associations = companyId ? [{
    to: { id: companyId },
    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 279 }],
  }] : undefined;

  const contact = await client.createObject<HSContact>("contacts", properties, associations);
  return {
    id: contact.id,
    properties: maskContactPii(contact.properties),
    success: true,
    message: `Contact created with ID ${contact.id}`,
  };
}

// ── Tool: hs_update_contact ───────────────────────────────────────────────────

export interface HsUpdateContactArgs {
  contactId: string;
  properties: Record<string, string>;
}

export async function hsUpdateContact(client: HubSpotClient, args: HsUpdateContactArgs) {
  const { contactId, properties } = args;
  if (!contactId) throw new Error("contactId is required");
  if (!properties || typeof properties !== "object") throw new Error("properties object is required");

  const updated = await client.updateObject<HSContact>("contacts", contactId, properties);
  return {
    id: updated.id,
    updatedProperties: Object.keys(properties),
    success: true,
    message: `Contact ${contactId} updated successfully`,
  };
}

// ── Tool: hs_search_companies ─────────────────────────────────────────────────

export interface HsSearchCompaniesArgs {
  name?: string;
  domain?: string;
  industry?: string;
  city?: string;
  limit?: number;
}

export async function hsSearchCompanies(client: HubSpotClient, args: HsSearchCompaniesArgs) {
  const { name, domain, industry, city, limit = 20 } = args;
  const filterGroups: HSFilterGroup[] = [];

  if (name) filterGroups.push({ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: name }] });
  if (domain) filterGroups.push({ filters: [{ propertyName: "domain", operator: "CONTAINS_TOKEN", value: domain }] });
  if (industry) filterGroups.push({ filters: [{ propertyName: "industry", operator: "EQ", value: industry }] });
  if (city) filterGroups.push({ filters: [{ propertyName: "city", operator: "CONTAINS_TOKEN", value: city }] });

  if (!filterGroups.length) {
    filterGroups.push({ filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] });
  }

  const result = await client.searchObjects<HSCompany>(
    "companies", filterGroups, DEFAULT_COMPANY_PROPS,
    [{ propertyName: "lastmodifieddate", direction: "DESCENDING" }], limit
  );

  return {
    total: result.total,
    companies: result.results.map(c => ({ id: c.id, properties: c.properties })),
  };
}

// ── Tool: hs_get_deal ─────────────────────────────────────────────────────────

export interface HsGetDealArgs {
  dealId: string;
  includeContacts?: boolean;
}

export async function hsGetDeal(client: HubSpotClient, args: HsGetDealArgs) {
  const { dealId, includeContacts = true } = args;
  if (!dealId) throw new Error("dealId is required");

  const deal = await client.getObject<HSDeal>(
    "deals", dealId, DEFAULT_DEAL_PROPS, includeContacts ? ["contacts"] : []
  );

  const result: Record<string, unknown> = {
    id: deal.id,
    properties: deal.properties,
  };

  if (includeContacts && deal.associations?.contacts) {
    const contactIds = deal.associations.contacts.results.map(r => r.id).slice(0, 5);
    result.contacts = await Promise.all(
      contactIds.map(id => client.getObject<HSContact>("contacts", id, DEFAULT_CONTACT_PROPS).catch(() => null))
    ).then(cs => cs.filter(Boolean).map(c => ({ id: c!.id, properties: maskContactPii(c!.properties) })));
  }

  return result;
}

// ── Tool: hs_create_deal ──────────────────────────────────────────────────────

export interface HsCreateDealArgs {
  dealName: string;
  amount?: number;
  dealStage: string;
  pipeline?: string;
  closeDate?: string;
  priority?: "low" | "medium" | "high";
  description?: string;
  contactId?: string;
  companyId?: string;
}

export async function hsCreateDeal(client: HubSpotClient, args: HsCreateDealArgs) {
  const {
    dealName, amount, dealStage, pipeline = "default",
    closeDate, priority, description, contactId, companyId,
  } = args;
  if (!dealName?.trim()) throw new Error("dealName is required");
  if (!dealStage?.trim()) throw new Error("dealStage is required");

  const properties: Record<string, string> = {
    dealname: dealName,
    dealstage: dealStage,
    pipeline,
  };
  if (amount !== undefined) properties.amount = String(amount);
  if (closeDate) properties.closedate = closeDate;
  if (priority) properties.hs_priority = priority;
  if (description) properties.description = description;

  const associations: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }> = [];
  if (contactId) associations.push({ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] });
  if (companyId) associations.push({ to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }] });

  const deal = await client.createObject<HSDeal>("deals", properties, associations);
  return {
    id: deal.id,
    properties: deal.properties,
    success: true,
    message: `Deal "${dealName}" created in stage "${dealStage}" (ID: ${deal.id})`,
  };
}

// ── Tool: hs_update_deal_stage ────────────────────────────────────────────────

export interface HsUpdateDealStageArgs {
  dealId: string;
  dealStage: string;
  amount?: number;
  closeDate?: string;
}

export async function hsUpdateDealStage(client: HubSpotClient, args: HsUpdateDealStageArgs) {
  const { dealId, dealStage, amount, closeDate } = args;
  if (!dealId) throw new Error("dealId is required");
  if (!dealStage) throw new Error("dealStage is required");

  const properties: Record<string, string> = { dealstage: dealStage };
  if (amount !== undefined) properties.amount = String(amount);
  if (closeDate) properties.closedate = closeDate;

  const deal = await client.updateObject<HSDeal>("deals", dealId, properties);
  return {
    id: deal.id,
    newStage: dealStage,
    properties: deal.properties,
    success: true,
    message: `Deal ${dealId} moved to stage "${dealStage}"`,
  };
}

// ── Tool: hs_create_note ──────────────────────────────────────────────────────

export interface HsCreateNoteArgs {
  objectType: "contacts" | "companies" | "deals";
  objectId: string;
  body: string;
  timestamp?: string;
}

export async function hsCreateNote(client: HubSpotClient, args: HsCreateNoteArgs) {
  const { objectType, objectId, body, timestamp } = args;
  if (!objectType) throw new Error("objectType is required (contacts, companies, or deals)");
  if (!objectId) throw new Error("objectId is required");
  if (!body?.trim()) throw new Error("body is required");

  const note = await client.createEngagement(
    "NOTE", objectType, objectId, body,
    timestamp ? { hs_timestamp: timestamp } : undefined
  );

  return {
    noteId: note.id,
    objectType,
    objectId,
    success: true,
    message: `Note added to ${objectType.slice(0, -1)} ${objectId}`,
  };
}

// ── Tool: hs_search_deals ─────────────────────────────────────────────────────

export interface HsSearchDealsArgs {
  pipeline?: string;
  dealStage?: string;
  ownerId?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: "amount" | "createdate" | "closedate" | "lastmodifieddate";
  sortDirection?: "ASCENDING" | "DESCENDING";
  limit?: number;
}

export async function hsSearchDeals(client: HubSpotClient, args: HsSearchDealsArgs) {
  const {
    pipeline, dealStage, ownerId, minAmount, maxAmount,
    sortBy = "lastmodifieddate", sortDirection = "DESCENDING", limit = 20,
  } = args;

  const filterGroups: HSFilterGroup[] = [];

  if (pipeline) filterGroups.push({ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipeline }] });
  if (dealStage) filterGroups.push({ filters: [{ propertyName: "dealstage", operator: "EQ", value: dealStage }] });
  if (ownerId) filterGroups.push({ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId }] });
  if (minAmount !== undefined && maxAmount !== undefined) {
    filterGroups.push({ filters: [{ propertyName: "amount", operator: "BETWEEN", value: String(minAmount), highValue: String(maxAmount) }] });
  } else if (minAmount !== undefined) {
    filterGroups.push({ filters: [{ propertyName: "amount", operator: "GTE", value: String(minAmount) }] });
  } else if (maxAmount !== undefined) {
    filterGroups.push({ filters: [{ propertyName: "amount", operator: "LTE", value: String(maxAmount) }] });
  }

  if (!filterGroups.length) {
    filterGroups.push({ filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] });
  }

  const result = await client.searchObjects<HSDeal>(
    "deals", filterGroups, DEFAULT_DEAL_PROPS,
    [{ propertyName: sortBy, direction: sortDirection }], limit
  );

  return {
    total: result.total,
    deals: result.results.map(d => ({ id: d.id, properties: d.properties })),
  };
}

// ── Tool: hs_get_pipelines ────────────────────────────────────────────────────
// Deal/ticket stages are portal-specific IDs, so hs_create_deal and
// hs_update_deal_stage can't be used reliably without first enumerating them.

export interface HsGetPipelinesArgs {
  objectType?: "deals" | "tickets";
}

export async function hsGetPipelines(client: HubSpotClient, args: HsGetPipelinesArgs) {
  const { objectType = "deals" } = args;
  if (objectType !== "deals" && objectType !== "tickets") {
    throw new Error("objectType must be either 'deals' or 'tickets'");
  }

  const pipelines = await client.getPipelines(objectType);

  return {
    objectType,
    total: pipelines.length,
    pipelines: pipelines.map(p => ({
      id: p.id,
      label: p.label,
      stages: p.stages.map(s => ({
        id: s.id,
        label: s.label,
        displayOrder: (s.metadata as { displayOrder?: unknown } | undefined)?.displayOrder,
      })),
    })),
  };
}

// ── Tool: hs_create_company ───────────────────────────────────────────────────

export interface HsCreateCompanyArgs {
  name: string;
  domain?: string;
  industry?: string;
  city?: string;
  country?: string;
  phone?: string;
  description?: string;
  numberOfEmployees?: number;
  annualRevenue?: number;
}

export async function hsCreateCompany(client: HubSpotClient, args: HsCreateCompanyArgs) {
  const { name, domain, industry, city, country, phone, description, numberOfEmployees, annualRevenue } = args;
  if (!name?.trim()) throw new Error("name is required to create a company");

  const properties: Record<string, string> = { name: name.trim() };
  if (domain) properties.domain = domain;
  if (industry) properties.industry = industry;
  if (city) properties.city = city;
  if (country) properties.country = country;
  if (phone) properties.phone = phone;
  if (description) properties.description = description;
  if (numberOfEmployees !== undefined) properties.numberofemployees = String(numberOfEmployees);
  if (annualRevenue !== undefined) properties.annualrevenue = String(annualRevenue);

  const company = await client.createObject<HSCompany>("companies", properties);
  return {
    id: company.id,
    properties: company.properties,
    success: true,
    message: `Company created with ID ${company.id}`,
  };
}

// ── Tool: hs_update_company ───────────────────────────────────────────────────

export interface HsUpdateCompanyArgs {
  companyId: string;
  properties: Record<string, string>;
}

export async function hsUpdateCompany(client: HubSpotClient, args: HsUpdateCompanyArgs) {
  const { companyId, properties } = args;
  if (!companyId) throw new Error("companyId is required");
  if (!properties || typeof properties !== "object") throw new Error("properties object is required");

  const updated = await client.updateObject<HSCompany>("companies", companyId, properties);
  return {
    id: updated.id,
    updatedProperties: Object.keys(properties),
    success: true,
    message: `Company ${companyId} updated successfully`,
  };
}

// ── Tool: hs_search_tickets ───────────────────────────────────────────────────

export interface HsSearchTicketsArgs {
  subject?: string;
  pipeline?: string;
  stage?: string;
  priority?: string;
  ownerId?: string;
  limit?: number;
}

export async function hsSearchTickets(client: HubSpotClient, args: HsSearchTicketsArgs) {
  const { subject, pipeline, stage, priority, ownerId, limit = 20 } = args;
  const filterGroups: HSFilterGroup[] = [];

  if (subject) filterGroups.push({ filters: [{ propertyName: "subject", operator: "CONTAINS_TOKEN", value: subject }] });
  if (pipeline) filterGroups.push({ filters: [{ propertyName: "hs_pipeline", operator: "EQ", value: pipeline }] });
  if (stage) filterGroups.push({ filters: [{ propertyName: "hs_pipeline_stage", operator: "EQ", value: stage }] });
  if (priority) filterGroups.push({ filters: [{ propertyName: "hs_ticket_priority", operator: "EQ", value: priority }] });
  if (ownerId) filterGroups.push({ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId }] });

  if (!filterGroups.length) {
    filterGroups.push({ filters: [{ propertyName: "createdate", operator: "HAS_PROPERTY" }] });
  }

  const result = await client.searchObjects<HSTicket>(
    "tickets", filterGroups, DEFAULT_TICKET_PROPS,
    [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }], limit
  );

  return {
    total: result.total,
    tickets: result.results.map(t => ({ id: t.id, properties: t.properties })),
  };
}

// ── Tool: hs_get_ticket ───────────────────────────────────────────────────────

export interface HsGetTicketArgs {
  ticketId: string;
  includeContacts?: boolean;
}

export async function hsGetTicket(client: HubSpotClient, args: HsGetTicketArgs) {
  const { ticketId, includeContacts = true } = args;
  if (!ticketId) throw new Error("ticketId is required");

  const ticket = await client.getObject<HSTicket>(
    "tickets", ticketId, DEFAULT_TICKET_PROPS, includeContacts ? ["contacts"] : []
  );

  const result: Record<string, unknown> = {
    id: ticket.id,
    properties: ticket.properties,
  };

  if (includeContacts && ticket.associations?.contacts) {
    const contactIds = ticket.associations.contacts.results.map(r => r.id).slice(0, 5);
    result.contacts = await Promise.all(
      contactIds.map(id => client.getObject<HSContact>("contacts", id, DEFAULT_CONTACT_PROPS).catch(() => null))
    ).then(cs => cs.filter(Boolean).map(c => ({ id: c!.id, properties: maskContactPii(c!.properties) })));
  }

  return result;
}

// ── Tool: hs_create_ticket ────────────────────────────────────────────────────

export interface HsCreateTicketArgs {
  subject: string;
  content?: string;
  pipeline?: string;
  stage: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  category?: string;
  ownerId?: string;
}

export async function hsCreateTicket(client: HubSpotClient, args: HsCreateTicketArgs) {
  const { subject, content, pipeline = "0", stage, priority, category, ownerId } = args;
  if (!subject?.trim()) throw new Error("subject is required");
  if (!stage?.trim()) throw new Error("stage is required — call hs_get_pipelines with objectType 'tickets' to list valid stage IDs");

  const properties: Record<string, string> = {
    subject: subject.trim(),
    hs_pipeline: pipeline,
    hs_pipeline_stage: stage,
  };
  if (content) properties.content = content;
  if (priority) properties.hs_ticket_priority = priority;
  if (category) properties.hs_ticket_category = category;
  if (ownerId) properties.hubspot_owner_id = ownerId;

  const ticket = await client.createObject<HSTicket>("tickets", properties);
  return {
    id: ticket.id,
    properties: ticket.properties,
    success: true,
    message: `Ticket created with ID ${ticket.id}`,
  };
}

// ── Tool: hs_update_ticket ────────────────────────────────────────────────────

export interface HsUpdateTicketArgs {
  ticketId: string;
  properties: Record<string, string>;
}

export async function hsUpdateTicket(client: HubSpotClient, args: HsUpdateTicketArgs) {
  const { ticketId, properties } = args;
  if (!ticketId) throw new Error("ticketId is required");
  if (!properties || typeof properties !== "object") throw new Error("properties object is required");

  const updated = await client.updateObject<HSTicket>("tickets", ticketId, properties);
  return {
    id: updated.id,
    updatedProperties: Object.keys(properties),
    success: true,
    message: `Ticket ${ticketId} updated successfully`,
  };
}

// ── Tool: hs_list_sequences ───────────────────────────────────────────────────
// Sales sequences live under the /automation API, not the CRM object API, and
// need the `sequences` scope plus Sales Hub Professional/Enterprise. On a lower
// tier HubSpot returns 403, which surfaces as an honest tool error rather than
// an empty list, so the caller can tell "none configured" from "not entitled".

export interface HsListSequencesArgs {
  limit?: number;
  after?: string;
}

export async function hsListSequences(client: HubSpotClient, args: HsListSequencesArgs) {
  const { limit = 20, after } = args;
  const result = await client.listSequences(limit, after);

  return {
    total: result.total ?? result.results.length,
    sequences: result.results.map(s => ({
      id: String(s.id ?? ""),
      name: (s.name as string | undefined) ?? (s.sequenceName as string | undefined) ?? "(unnamed)",
      properties: s,
    })),
    nextPage: result.paging?.next?.after,
  };
}
