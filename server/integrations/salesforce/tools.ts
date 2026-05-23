/**
 * Salesforce tool implementations — 12 tools backed by the Salesforce REST API.
 * Each function accepts a SalesforceClient and typed args, returns a normalized result.
 * PII fields (email, phone, name) are subject to Atlas PII masking (R1/R2 policy).
 */

import { SalesforceClient, escapeSoqlString, normalizeSFRecord, type SFRecord } from "./client";

// ── PII masking (Atlas R1/R2 policy) ─────────────────────────────────────────
// Covers email, phone, and name fields per the Atlas PII policy (R1/R2).
// R1 = partial mask (default in tool responses), R2 = full mask.
const EMAIL_FIELDS = new Set(["Email", "PersonEmail"]);
const PHONE_FIELDS = new Set(["Phone", "MobilePhone", "Fax", "OtherPhone", "HomePhone"]);
const NAME_FIELDS = new Set(["FirstName", "LastName"]);

export function maskPiiFields(record: Record<string, unknown>, level: "R1" | "R2" = "R1"): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => {
      // Recursively mask nested objects (e.g. Contact.FirstName, Contact.Email from Salesforce sub-queries)
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        return [k, maskPiiFields(v as Record<string, unknown>, level)];
      }
      // Recursively mask arrays of objects
      if (Array.isArray(v)) {
        return [k, v.map(item =>
          item !== null && typeof item === "object" && !Array.isArray(item)
            ? maskPiiFields(item as Record<string, unknown>, level)
            : item
        )];
      }
      if (typeof v !== "string" || !v) return [k, v];
      if (EMAIL_FIELDS.has(k)) {
        if (level === "R2") return [k, "••••••••@••••"];
        const [local, domain] = v.split("@");
        return [k, `${local[0] ?? "•"}••••@${domain ?? "••••"}`];
      }
      if (PHONE_FIELDS.has(k)) {
        if (level === "R2") return [k, "••••••••••"];
        return [k, v.slice(-4).padStart(v.length, "•")];
      }
      if (NAME_FIELDS.has(k)) {
        if (level === "R2") return [k, "••••"];
        // R1: keep first initial + dots (e.g. "John" → "J•••")
        return [k, v[0] + "•".repeat(Math.max(v.length - 1, 3))];
      }
      return [k, v];
    })
  );
}

function maskRecord(r: Record<string, unknown>): Record<string, unknown> {
  return maskPiiFields(r);
}

// ── Tool: sf_query ────────────────────────────────────────────────────────────

export interface SfQueryArgs {
  soql: string;
  limit?: number;
}

export async function sfQuery(client: SalesforceClient, args: SfQueryArgs) {
  const { soql, limit = 50 } = args;
  if (!soql?.trim()) throw new Error("soql is required");
  const limitedSoql = /\bLIMIT\b/i.test(soql) ? soql : `${soql.trim()} LIMIT ${Math.min(limit, 200)}`;
  const result = await client.query(limitedSoql);
  return {
    totalSize: result.totalSize,
    done: result.done,
    records: result.records.map(r => maskRecord(normalizeSFRecord(r))),
  };
}

// ── Tool: sf_get_record ───────────────────────────────────────────────────────

export interface SfGetRecordArgs {
  objectType: string;
  id: string;
  fields?: string[];
}

export async function sfGetRecord(client: SalesforceClient, args: SfGetRecordArgs) {
  const { objectType, id, fields } = args;
  if (!objectType) throw new Error("objectType is required");
  if (!id) throw new Error("id is required");
  const record = await client.getRecord(objectType, id, fields);
  return maskRecord(normalizeSFRecord(record));
}

// ── Tool: sf_create_record ────────────────────────────────────────────────────

export interface SfCreateRecordArgs {
  objectType: "Contact" | "Account" | "Opportunity" | "Case" | "Lead" | "Task";
  fields: Record<string, unknown>;
}

export async function sfCreateRecord(client: SalesforceClient, args: SfCreateRecordArgs) {
  const { objectType, fields } = args;
  if (!objectType) throw new Error("objectType is required");
  if (!fields || typeof fields !== "object") throw new Error("fields object is required");
  const result = await client.createRecord(objectType, fields);
  return {
    id: result.id,
    success: result.success,
    objectType,
    message: `${objectType} record created successfully with ID ${result.id}`,
  };
}

// ── Tool: sf_update_record ────────────────────────────────────────────────────

export interface SfUpdateRecordArgs {
  objectType: string;
  id: string;
  fields: Record<string, unknown>;
}

export async function sfUpdateRecord(client: SalesforceClient, args: SfUpdateRecordArgs) {
  const { objectType, id, fields } = args;
  if (!objectType) throw new Error("objectType is required");
  if (!id) throw new Error("id is required");
  if (!fields || typeof fields !== "object") throw new Error("fields object is required");
  await client.updateRecord(objectType, id, fields);
  return {
    id,
    objectType,
    updated: Object.keys(fields),
    success: true,
    message: `${objectType} ${id} updated successfully`,
  };
}

// ── Tool: sf_search ───────────────────────────────────────────────────────────

export interface SfSearchArgs {
  searchTerm: string;
  objectTypes?: string[];
  returnFields?: Record<string, string[]>;
  limit?: number;
}

export async function sfSearch(client: SalesforceClient, args: SfSearchArgs) {
  const { searchTerm, objectTypes = ["Contact", "Account", "Lead", "Opportunity"], returnFields, limit = 20 } = args;
  if (!searchTerm?.trim()) throw new Error("searchTerm is required");
  const escaped = escapeSoqlString(searchTerm);
  const inClause = objectTypes.map(obj => {
    const fields = returnFields?.[obj] ?? defaultFieldsFor(obj);
    return `${obj}(${fields.join(", ")} LIMIT ${Math.min(limit, 50)})`;
  }).join(", ");
  const sosl = `FIND {${escaped}} IN ALL FIELDS RETURNING ${inClause}`;
  const result = await client.search(sosl);
  return {
    searchTerm,
    searchRecords: result.searchRecords.map(r => maskRecord(normalizeSFRecord(r))),
    totalFound: result.searchRecords.length,
  };
}

function defaultFieldsFor(objectType: string): string[] {
  const map: Record<string, string[]> = {
    Contact: ["Id", "FirstName", "LastName", "Email", "Phone", "AccountId", "Title"],
    Account: ["Id", "Name", "Industry", "BillingCity", "BillingCountry", "AnnualRevenue", "NumberOfEmployees"],
    Lead: ["Id", "FirstName", "LastName", "Email", "Company", "Status", "LeadSource"],
    Opportunity: ["Id", "Name", "StageName", "Amount", "CloseDate", "AccountId"],
    Case: ["Id", "CaseNumber", "Subject", "Status", "Priority", "AccountId"],
  };
  return map[objectType] ?? ["Id", "Name"];
}

// ── Tool: sf_list_objects ─────────────────────────────────────────────────────

export interface SfListObjectsArgs {
  objectType?: string;
  queryable?: boolean;
}

export async function sfListObjects(client: SalesforceClient, args: SfListObjectsArgs) {
  const { objectType, queryable = true } = args;
  if (objectType) {
    const desc = await client.describeObject(objectType);
    return {
      name: desc.name,
      label: desc.label,
      labelPlural: desc.labelPlural,
      createable: desc.createable,
      updateable: desc.updateable,
      queryable: desc.queryable,
      fields: desc.fields.map(f => ({
        name: f.name,
        label: f.label,
        type: f.type,
        nillable: f.nillable,
        updateable: f.updateable,
        createable: f.createable,
        picklistValues: f.picklistValues?.filter(p => p.active).map(p => p.value),
      })),
    };
  }
  const global = await client.describeGlobal();
  const objects = queryable
    ? global.sobjects.filter(o => o.queryable)
    : global.sobjects;
  return {
    count: objects.length,
    objects: objects.map(o => ({ name: o.name, label: o.label, labelPlural: o.labelPlural, queryable: o.queryable, createable: o.createable, updateable: o.updateable })),
  };
}

// ── Tool: sf_get_account ──────────────────────────────────────────────────────

export interface SfGetAccountArgs {
  accountId: string;
  includeContacts?: boolean;
  includeOpportunities?: boolean;
  includeCases?: boolean;
}

export async function sfGetAccount(client: SalesforceClient, args: SfGetAccountArgs) {
  const { accountId, includeContacts = true, includeOpportunities = true, includeCases = true } = args;
  if (!accountId) throw new Error("accountId is required");

  const soql = `SELECT Id, Name, Industry, Type, BillingStreet, BillingCity, BillingState, BillingCountry,
    AnnualRevenue, NumberOfEmployees, Phone, Website, Description, OwnerId, Owner.Name,
    CreatedDate, LastModifiedDate
    ${includeContacts ? ", (SELECT Id, FirstName, LastName, Email, Phone, Title FROM Contacts LIMIT 10)" : ""}
    ${includeOpportunities ? ", (SELECT Id, Name, StageName, Amount, CloseDate, Probability FROM Opportunities WHERE IsClosed = false LIMIT 10)" : ""}
    ${includeCases ? ", (SELECT Id, CaseNumber, Subject, Status, Priority, CreatedDate FROM Cases LIMIT 10)" : ""}
    FROM Account WHERE Id = '${escapeSoqlString(accountId)}'`;

  const result = await client.query(soql);
  if (!result.records.length) throw new Error(`Account not found in Salesforce: ${accountId}`);

  const account = result.records[0];

  // Extract nested relationship objects BEFORE normalization so they are not spread
  // into the base account fields. Masking is applied to ALL returned records.
  const contactRecords: SFRecord[] = (account.Contacts as any)?.records ?? [];
  const oppRecords: SFRecord[] = (account.Opportunities as any)?.records ?? [];
  const caseRecords: SFRecord[] = (account.Cases as any)?.records ?? [];

  const rawNorm = normalizeSFRecord(account);
  // Remove SOQL relationship sub-query keys before masking account fields
  const { Contacts: _c, Opportunities: _o, Cases: _ca, ...accountFields } = rawNorm as any;

  return {
    ...maskRecord(accountFields),
    contacts: includeContacts
      ? contactRecords.map((c: SFRecord) => maskRecord(normalizeSFRecord(c)))
      : undefined,
    opportunities: includeOpportunities
      ? oppRecords.map((o: SFRecord) => maskRecord(normalizeSFRecord(o)))
      : undefined,
    cases: includeCases
      ? caseRecords.map((c: SFRecord) => maskRecord(normalizeSFRecord(c)))
      : undefined,
  };
}

// ── Tool: sf_get_opportunity ──────────────────────────────────────────────────

export interface SfGetOpportunityArgs {
  opportunityId: string;
  includeStageHistory?: boolean;
  includeContacts?: boolean;
}

export async function sfGetOpportunity(client: SalesforceClient, args: SfGetOpportunityArgs) {
  const { opportunityId, includeStageHistory = true, includeContacts = true } = args;
  if (!opportunityId) throw new Error("opportunityId is required");

  const soql = `SELECT Id, Name, StageName, Amount, CloseDate, Probability, Type,
    LeadSource, Description, AccountId, Account.Name, OwnerId, Owner.Name,
    CreatedDate, LastModifiedDate, IsClosed, IsWon
    ${includeContacts ? ", (SELECT Id, ContactId, Contact.FirstName, Contact.LastName, Contact.Email, Role FROM OpportunityContactRoles LIMIT 10)" : ""}
    ${includeStageHistory ? ", (SELECT Id, StageName, Amount, Probability, CreatedDate FROM OpportunityHistories ORDER BY CreatedDate DESC LIMIT 20)" : ""}
    FROM Opportunity WHERE Id = '${escapeSoqlString(opportunityId)}'`;

  const result = await client.query(soql);
  if (!result.records.length) throw new Error(`Opportunity not found in Salesforce: ${opportunityId}`);

  const opp = result.records[0];

  // Extract nested relationship objects before normalization
  const contactRoleRecords: SFRecord[] = (opp.OpportunityContactRoles as any)?.records ?? [];
  const historyRecords: SFRecord[] = (opp.OpportunityHistories as any)?.records ?? [];

  const rawNorm = normalizeSFRecord(opp);
  // Remove SOQL sub-query keys before masking opportunity fields
  const { OpportunityContactRoles: _r, OpportunityHistories: _h, ...oppFields } = rawNorm as any;

  return {
    ...maskRecord(oppFields),
    contacts: includeContacts
      ? contactRoleRecords.map((r: SFRecord) => maskRecord(normalizeSFRecord(r)))
      : undefined,
    stageHistory: includeStageHistory
      // Stage history has no PII — no masking needed, but normalize for clean output
      ? historyRecords.map((h: SFRecord) => normalizeSFRecord(h))
      : undefined,
  };
}

// ── Tool: sf_create_case ──────────────────────────────────────────────────────

export interface SfCreateCaseArgs {
  subject: string;
  description?: string;
  priority?: "High" | "Medium" | "Low";
  status?: string;
  accountId?: string;
  contactId?: string;
  origin?: string;
  type?: string;
}

export async function sfCreateCase(client: SalesforceClient, args: SfCreateCaseArgs) {
  const {
    subject, description, priority = "Medium", status = "New",
    accountId, contactId, origin = "Web", type,
  } = args;
  if (!subject?.trim()) throw new Error("subject is required to create a Case");

  const fields: Record<string, unknown> = { Subject: subject, Priority: priority, Status: status, Origin: origin };
  if (description) fields.Description = description;
  if (accountId) fields.AccountId = accountId;
  if (contactId) fields.ContactId = contactId;
  if (type) fields.Type = type;

  const result = await client.createRecord("Case", fields);
  return {
    id: result.id,
    success: result.success,
    subject,
    priority,
    status,
    message: `Case created: "${subject}" (ID: ${result.id})`,
  };
}

// ── Tool: sf_update_case_status ───────────────────────────────────────────────

export interface SfUpdateCaseStatusArgs {
  caseId: string;
  status: string;
  comment?: string;
}

export async function sfUpdateCaseStatus(client: SalesforceClient, args: SfUpdateCaseStatusArgs) {
  const { caseId, status, comment } = args;
  if (!caseId) throw new Error("caseId is required");
  if (!status) throw new Error("status is required");

  await client.updateRecord("Case", caseId, { Status: status });
  if (comment) {
    await client.createCaseComment(caseId, comment, true);
  }

  return {
    caseId,
    newStatus: status,
    commentAdded: !!comment,
    success: true,
    message: `Case ${caseId} status updated to "${status}"${comment ? " with comment" : ""}`,
  };
}

// ── Tool: sf_add_case_comment ─────────────────────────────────────────────────

export interface SfAddCaseCommentArgs {
  caseId: string;
  comment: string;
  isPublic?: boolean;
}

export async function sfAddCaseComment(client: SalesforceClient, args: SfAddCaseCommentArgs) {
  const { caseId, comment, isPublic = true } = args;
  if (!caseId) throw new Error("caseId is required");
  if (!comment?.trim()) throw new Error("comment is required");

  const result = await client.createCaseComment(caseId, comment, isPublic);
  return {
    commentId: result.id,
    caseId,
    isPublic,
    success: result.success,
    message: `Comment added to Case ${caseId}`,
  };
}

// ── Tool: sf_log_activity ─────────────────────────────────────────────────────

export interface SfLogActivityArgs {
  activityType: "Task" | "Event";
  subject: string;
  whoId?: string;
  whatId?: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: "High" | "Normal" | "Low";
  durationInMinutes?: number;
  startDateTime?: string;
}

export async function sfLogActivity(client: SalesforceClient, args: SfLogActivityArgs) {
  const {
    activityType = "Task", subject, whoId, whatId,
    description, dueDate, status = "Completed", priority = "Normal",
    durationInMinutes, startDateTime,
  } = args;
  if (!subject?.trim()) throw new Error("subject is required to log an activity");

  let fields: Record<string, unknown>;
  if (activityType === "Task") {
    fields = { Subject: subject, Status: status, Priority: priority };
    if (whoId) fields.WhoId = whoId;
    if (whatId) fields.WhatId = whatId;
    if (description) fields.Description = description;
    if (dueDate) fields.ActivityDate = dueDate;
  } else {
    fields = {
      Subject: subject,
      StartDateTime: startDateTime ?? new Date().toISOString(),
      EndDateTime: startDateTime
        ? new Date(new Date(startDateTime).getTime() + (durationInMinutes ?? 60) * 60_000).toISOString()
        : new Date(Date.now() + 60 * 60_000).toISOString(),
      DurationInMinutes: durationInMinutes ?? 60,
    };
    if (whoId) fields.WhoId = whoId;
    if (whatId) fields.WhatId = whatId;
    if (description) fields.Description = description;
  }

  const result = await client.createRecord(activityType, fields);
  return {
    id: result.id,
    success: result.success,
    activityType,
    subject,
    message: `${activityType} "${subject}" logged successfully (ID: ${result.id})`,
  };
}
