import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  users, agents, outcomeContracts, kpiDefinitions, deployments,
  runTraces, evalSuites, policies, approvals, auditEvents, invoices, outcomeEvents,
  type User, type InsertUser,
  type Agent, type InsertAgent,
  type OutcomeContract, type InsertOutcomeContract,
  type KpiDefinition, type InsertKpiDefinition,
  type Deployment, type InsertDeployment,
  type RunTrace, type InsertRunTrace,
  type EvalSuite, type InsertEvalSuite,
  type Policy, type InsertPolicy,
  type Approval, type InsertApproval,
  type AuditEvent, type InsertAuditEvent,
  type Invoice, type InsertInvoice,
  type OutcomeEvent, type InsertOutcomeEvent,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;

  getOutcomes(): Promise<OutcomeContract[]>;
  getOutcome(id: string): Promise<OutcomeContract | undefined>;
  createOutcome(outcome: InsertOutcomeContract): Promise<OutcomeContract>;

  getKpis(): Promise<KpiDefinition[]>;
  getKpisByOutcome(outcomeId: string): Promise<KpiDefinition[]>;
  createKpi(kpi: InsertKpiDefinition): Promise<KpiDefinition>;
  updateKpi(id: string, data: Partial<KpiDefinition>): Promise<KpiDefinition | undefined>;
  deleteKpi(id: string): Promise<boolean>;

  updateOutcome(id: string, data: Partial<OutcomeContract>): Promise<OutcomeContract | undefined>;

  getDeployments(): Promise<Deployment[]>;
  createDeployment(deployment: InsertDeployment): Promise<Deployment>;

  getTraces(): Promise<RunTrace[]>;
  getTracesByAgent(agentId: string): Promise<RunTrace[]>;
  createTrace(trace: InsertRunTrace): Promise<RunTrace>;

  getEvalSuites(): Promise<EvalSuite[]>;
  getEvalsByAgent(agentId: string): Promise<EvalSuite[]>;
  createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite>;

  getPolicies(): Promise<Policy[]>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;

  getApprovals(): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(id: string, data: Partial<Approval>): Promise<Approval | undefined>;

  getAuditEvents(): Promise<AuditEvent[]>;
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;

  getInvoices(): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;

  getOutcomeEvents(): Promise<OutcomeEvent[]>;
  createOutcomeEvent(event: InsertOutcomeEvent): Promise<OutcomeEvent>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAgents() {
    return db.select().from(agents);
  }

  async getAgent(id: string) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async createAgent(agent: InsertAgent) {
    const [created] = await db.insert(agents).values(agent).returning();
    return created;
  }

  async getOutcomes() {
    return db.select().from(outcomeContracts);
  }

  async getOutcome(id: string) {
    const [outcome] = await db.select().from(outcomeContracts).where(eq(outcomeContracts.id, id));
    return outcome;
  }

  async createOutcome(outcome: InsertOutcomeContract) {
    const [created] = await db.insert(outcomeContracts).values(outcome).returning();
    return created;
  }

  async getKpis() {
    return db.select().from(kpiDefinitions);
  }

  async getKpisByOutcome(outcomeId: string) {
    return db.select().from(kpiDefinitions).where(eq(kpiDefinitions.outcomeId, outcomeId));
  }

  async createKpi(kpi: InsertKpiDefinition) {
    const [created] = await db.insert(kpiDefinitions).values(kpi).returning();
    return created;
  }

  async updateKpi(id: string, data: Partial<KpiDefinition>) {
    const [updated] = await db.update(kpiDefinitions).set(data).where(eq(kpiDefinitions.id, id)).returning();
    return updated;
  }

  async deleteKpi(id: string) {
    const result = await db.delete(kpiDefinitions).where(eq(kpiDefinitions.id, id));
    return true;
  }

  async updateOutcome(id: string, data: Partial<OutcomeContract>) {
    const [updated] = await db.update(outcomeContracts).set(data).where(eq(outcomeContracts.id, id)).returning();
    return updated;
  }

  async getDeployments() {
    return db.select().from(deployments);
  }

  async createDeployment(deployment: InsertDeployment) {
    const [created] = await db.insert(deployments).values(deployment).returning();
    return created;
  }

  async getTraces() {
    return db.select().from(runTraces);
  }

  async getTracesByAgent(agentId: string) {
    return db.select().from(runTraces).where(eq(runTraces.agentId, agentId));
  }

  async createTrace(trace: InsertRunTrace) {
    const [created] = await db.insert(runTraces).values(trace).returning();
    return created;
  }

  async getEvalSuites() {
    return db.select().from(evalSuites);
  }

  async getEvalsByAgent(agentId: string) {
    return db.select().from(evalSuites).where(eq(evalSuites.agentId, agentId));
  }

  async createEvalSuite(suite: InsertEvalSuite) {
    const [created] = await db.insert(evalSuites).values(suite).returning();
    return created;
  }

  async getPolicies() {
    return db.select().from(policies);
  }

  async createPolicy(policy: InsertPolicy) {
    const [created] = await db.insert(policies).values(policy).returning();
    return created;
  }

  async getApprovals() {
    return db.select().from(approvals);
  }

  async createApproval(approval: InsertApproval) {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async updateApproval(id: string, data: Partial<Approval>) {
    const [updated] = await db.update(approvals).set(data).where(eq(approvals.id, id)).returning();
    return updated;
  }

  async getAuditEvents() {
    return db.select().from(auditEvents);
  }

  async createAuditEvent(event: InsertAuditEvent) {
    const [created] = await db.insert(auditEvents).values(event).returning();
    return created;
  }

  async getInvoices() {
    return db.select().from(invoices);
  }

  async createInvoice(invoice: InsertInvoice) {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async getOutcomeEvents() {
    return db.select().from(outcomeEvents);
  }

  async createOutcomeEvent(event: InsertOutcomeEvent) {
    const [created] = await db.insert(outcomeEvents).values(event).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
