/**
 * The CMDB behind the mock ServiceNow connector: a mid-size semiconductor
 * enterprise's estate, generated deterministically so every run of a journey
 * sees the same configuration items, the same gaps and the same history.
 *
 * The estate is not tidy, because the journeys exist to deal with what an
 * untidy one costs: owners are missing on roughly a fifth of it, some records
 * have not been seen by Discovery for half a year, two sources disagree about
 * the same physical machine, a handful of items hang off nothing at all, and
 * plenty of business services carry no tier. Each of those is planted on
 * purpose and is what the four journeys go after.
 *
 * Shapes follow ServiceNow's own: sys_id, sys_class_name, install_status,
 * assigned_to / support_group as display values, cmdb_rel_ci as parent/child
 * with a "Depends on::Used by" style type, incidents and changes pointing at a
 * cmdb_ci. Anything an agent writes goes to the mutable store in the router,
 * never here.
 */

export interface Ci {
  sys_id: string;
  name: string;
  sys_class_name: string;
  install_status: string;
  operational_status: string;
  assigned_to: string;
  support_group: string;
  business_criticality: string;
  environment: string;
  discovery_source: string;
  last_discovered: string;
  sys_updated_on: string;
  serial_number: string;
  ip_address: string;
  location: string;
  cost_center: string;
  short_description: string;
}

export interface Rel {
  sys_id: string;
  parent: string;
  child: string;
  type: string;
}

export interface Incident {
  sys_id: string;
  number: string;
  cmdb_ci: string;
  short_description: string;
  priority: string;
  state: string;
  opened_at: string;
  resolved_at: string;
  assigned_to: string;
  assignment_group: string;
}

export interface Change {
  sys_id: string;
  number: string;
  cmdb_ci: string;
  short_description: string;
  risk: string;
  state: string;
  start_date: string;
  assigned_to: string;
  assignment_group: string;
}

export interface Person {
  sys_id: string;
  user_name: string;
  name: string;
  title: string;
  email: string;
  department: string;
  group: string;
}

/** Same seed, same estate, every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rand = rng(20260923);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(4, "0")}${"0".repeat(20)}`.slice(0, 32);

const DAY = 86400000;
const NOW = Date.parse("2026-09-23T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString().replace("T", " ").slice(0, 19);

export const GROUPS = [
  "Platform Engineering", "EDA Compute", "Silicon Design Tools", "Fab Systems",
  "Supply Chain IT", "Corporate Apps", "Network Engineering", "Database Services",
];

export const PEOPLE: Person[] = [
  ["rmartinez", "Rosa Martinez", "Principal SRE", "Platform Engineering"],
  ["dkumar", "Deepak Kumar", "EDA Infrastructure Lead", "EDA Compute"],
  ["lchen", "Lily Chen", "Design Tools Manager", "Silicon Design Tools"],
  ["mokafor", "Michael Okafor", "MES Application Owner", "Fab Systems"],
  ["sjain", "Sonia Jain", "Supply Chain Systems Lead", "Supply Chain IT"],
  ["tbaker", "Tom Baker", "Corporate Apps Manager", "Corporate Apps"],
  ["hnakamura", "Hana Nakamura", "Network Architect", "Network Engineering"],
  ["pvarga", "Peter Varga", "Database Services Lead", "Database Services"],
  ["agarcia", "Ana Garcia", "Senior SRE", "Platform Engineering"],
  ["jwu", "Jason Wu", "Compute Engineer", "EDA Compute"],
  ["kpatel", "Kiran Patel", "Storage Engineer", "Platform Engineering"],
  ["obrien", "Niamh O'Brien", "Change Manager", "Corporate Apps"],
].map(([user_name, name, title, group], i) => ({
  sys_id: id("u", i + 1),
  user_name,
  name,
  title,
  email: `${user_name}@example-semi.com`,
  department: group === "Corporate Apps" ? "Corporate IT" : "Engineering IT",
  group,
}));

const personByGroup = (group: string) => PEOPLE.filter((p) => p.group === group);

/** The business services at the top of the estate; some carry a tier, some don't. */
const SERVICES: Array<[string, string, string]> = [
  ["Tapeout Submission Service", "Tier 1", "Silicon Design Tools"],
  ["EDA Licence Service", "Tier 1", "EDA Compute"],
  ["Wafer Test Data Service", "", "Fab Systems"],
  ["Fab MES Service", "Tier 1", "Fab Systems"],
  ["Supplier Portal", "", "Supply Chain IT"],
  ["Demand Planning Service", "Tier 2", "Supply Chain IT"],
  ["Design Data Vault", "", "Silicon Design Tools"],
  ["Employee Directory", "Tier 3", "Corporate Apps"],
  ["Expense Service", "Tier 3", "Corporate Apps"],
  ["Yield Analytics Service", "", "Fab Systems"],
];

const APPS: Array<[string, string]> = [
  ["Cadence Virtuoso Farm", "Silicon Design Tools"],
  ["Synopsys VCS Grid", "EDA Compute"],
  ["Licence Broker", "EDA Compute"],
  ["Tapeout Workflow App", "Silicon Design Tools"],
  ["MES Core", "Fab Systems"],
  ["Wafer Test Ingest", "Fab Systems"],
  ["Yield Analytics Web", "Fab Systems"],
  ["Supplier Portal Web", "Supply Chain IT"],
  ["Demand Planner", "Supply Chain IT"],
  ["Parts Master Sync", "Supply Chain IT"],
  ["Expense Web", "Corporate Apps"],
  ["Directory Service", "Corporate Apps"],
  ["Design Vault API", "Silicon Design Tools"],
  ["Regression Scheduler", "EDA Compute"],
];

const DISCOVERY = ["ServiceNow Discovery", "Intune", "Armis", "Boomi S3 Feed"];

export const CIS: Ci[] = [];
export const RELS: Rel[] = [];
export const INCIDENTS: Incident[] = [];
export const CHANGES: Change[] = [];

let ciSeq = 0;
const addCi = (c: Partial<Ci> & { name: string; sys_class_name: string }): Ci => {
  ciSeq += 1;
  const group = c.support_group ?? "";
  const ci: Ci = {
    sys_id: id("c", ciSeq),
    install_status: "1",
    operational_status: "1",
    assigned_to: "",
    support_group: group,
    business_criticality: "",
    environment: "Production",
    discovery_source: pick(DISCOVERY),
    last_discovered: daysAgo(Math.floor(rand() * 20) + 1),
    sys_updated_on: daysAgo(Math.floor(rand() * 30) + 1),
    serial_number: "",
    ip_address: "",
    location: pick(["Santa Clara, CA", "Austin, TX", "Penang, MY", "Bangalore, IN"]),
    cost_center: pick(["CC-4100 Engineering IT", "CC-4200 Fab Systems", "CC-3100 Corporate IT"]),
    short_description: "",
    ...c,
  };
  CIS.push(ci);
  return ci;
};

const relate = (parent: Ci, child: Ci, type = "Depends on::Used by") => {
  RELS.push({ sys_id: id("r", RELS.length + 1), parent: parent.sys_id, child: child.sys_id, type });
};

// ── services, applications, and the tiers of infrastructure under them ───────
const serviceCis = SERVICES.map(([name, tier, group]) =>
  addCi({
    name,
    sys_class_name: "cmdb_ci_service",
    business_criticality: tier,
    support_group: group,
    assigned_to: rand() > 0.35 ? pick(personByGroup(group)).name : "",
    short_description: `Business service: ${name}`,
  }),
);

const appCis = APPS.map(([name, group], i) =>
  addCi({
    name,
    sys_class_name: "cmdb_ci_appl",
    support_group: rand() > 0.3 ? group : "",
    assigned_to: rand() > 0.45 ? pick(personByGroup(group)).name : "",
    short_description: `Application: ${name}`,
    environment: i % 7 === 0 ? "Staging" : "Production",
  }),
);

// Each application runs on servers, and most read a database.
appCis.forEach((app, i) => {
  const group = APPS[i][1];
  const hosts = 1 + Math.floor(rand() * 3);
  for (let h = 0; h < hosts; h++) {
    const server = addCi({
      name: `${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-node${h + 1}`,
      sys_class_name: "cmdb_ci_server",
      support_group: rand() > 0.4 ? group : "",
      assigned_to: rand() > 0.6 ? pick(personByGroup(group)).name : "",
      serial_number: `SN${String(100000 + ciSeq * 7).slice(0, 6)}`,
      ip_address: `10.${20 + (i % 9)}.${h + 1}.${10 + (ciSeq % 200)}`,
      short_description: `Linux host for ${app.name}`,
    });
    relate(app, server, "Runs on::Runs");
  }
  if (i % 2 === 0) {
    const db = addCi({
      name: `${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-db`,
      sys_class_name: "cmdb_ci_db_instance",
      support_group: rand() > 0.5 ? "Database Services" : "",
      assigned_to: rand() > 0.6 ? pick(personByGroup("Database Services")).name : "",
      short_description: `Database instance for ${app.name}`,
    });
    relate(app, db, "Depends on::Used by");
  }
});

// Services depend on applications; a couple of services share one application,
// which is what makes a blast radius interesting.
serviceCis.forEach((svc, i) => {
  relate(svc, appCis[i % appCis.length]);
  relate(svc, appCis[(i * 3 + 1) % appCis.length]);
});
relate(serviceCis[0], appCis[2]); // Tapeout also depends on the Licence Broker
relate(serviceCis[1], appCis[2]); // and so does the EDA Licence Service

// Shared infrastructure everything leans on: the load balancer and the storage array.
const lb = addCi({
  name: "f5-ltm-prod-01",
  sys_class_name: "cmdb_ci_lb",
  support_group: "Network Engineering",
  assigned_to: "Hana Nakamura",
  short_description: "Production load balancer pair",
  business_criticality: "Tier 1",
});
const storage = addCi({
  name: "netapp-a800-fab-01",
  sys_class_name: "cmdb_ci_storage_device",
  support_group: "Platform Engineering",
  assigned_to: "",
  short_description: "Primary storage array for fab systems",
});
appCis.slice(0, 8).forEach((app) => relate(app, lb, "Depends on::Used by"));
CIS.filter((c) => c.sys_class_name === "cmdb_ci_db_instance").forEach((db) => relate(db, storage, "Depends on::Used by"));

// ── planted: two sources describing the same machine ─────────────────────────
const duplicatePairs = [
  ["mes-core-node1", "MES-CORE-NODE1.corp.example-semi.com", "Intune"],
  ["licence-broker-node1", "licence-broker-node1.example-semi.com", "Armis"],
  ["supplier-portal-web-node1", "SUPPLIER-PORTAL-WEB-NODE1", "Boomi S3 Feed"],
];
for (const [originalName, dupName, source] of duplicatePairs) {
  const original = CIS.find((c) => c.name === originalName);
  if (!original) continue;
  addCi({
    name: dupName,
    sys_class_name: "cmdb_ci_server",
    support_group: "",
    assigned_to: "",
    serial_number: original.serial_number,
    ip_address: original.ip_address,
    discovery_source: source,
    last_discovered: daysAgo(Math.floor(rand() * 10) + 1),
    location: original.location,
    short_description: `Host record from ${source}`,
  });
}

// ── planted: records nothing has seen in a long time, and records nothing points at ──
for (let i = 0; i < 6; i++) {
  addCi({
    name: `legacy-test-rig-${i + 1}`,
    sys_class_name: "cmdb_ci_server",
    support_group: "",
    assigned_to: "",
    discovery_source: "ServiceNow Discovery",
    last_discovered: daysAgo(180 + i * 40),
    sys_updated_on: daysAgo(180 + i * 40),
    environment: "Lab",
    short_description: "Lab rig, no recent discovery",
  });
}
for (let i = 0; i < 4; i++) {
  addCi({
    name: `orphan-vm-${String(i + 1).padStart(2, "0")}`,
    sys_class_name: "cmdb_ci_vm_instance",
    support_group: "",
    assigned_to: "",
    discovery_source: "Boomi S3 Feed",
    last_discovered: daysAgo(210 + i * 25),
    sys_updated_on: daysAgo(210 + i * 25),
    short_description: "Imported from the Boomi feed, never related to anything",
  });
}

// ── history: incidents and changes, weighted to the busiest services ─────────
const INCIDENT_TITLES = [
  "Licence checkout failures during regression",
  "Latency on tapeout submission",
  "MES batch job backlog",
  "Wafer test ingest lag",
  "Supplier portal 502s",
  "Slow queries on planner database",
  "Directory sync failures",
  "Storage latency spike",
];
const CHANGE_TITLES = [
  "Upgrade OS to RHEL 9.4",
  "Scale out compute nodes",
  "Apply quarterly security patches",
  "Resize database instance",
  "Rotate TLS certificates",
  "Migrate to new load balancer pool",
];

let incSeq = 0;
let chgSeq = 0;
const busy = [appCis[0], appCis[1], appCis[2], appCis[4], appCis[5], appCis[7], serviceCis[0], serviceCis[3]];
for (const ci of CIS) {
  const heavy = busy.includes(ci);
  const count = heavy ? 4 + Math.floor(rand() * 5) : rand() > 0.6 ? 1 + Math.floor(rand() * 2) : 0;
  const group = ci.support_group || pick(GROUPS);
  for (let i = 0; i < count; i++) {
    incSeq += 1;
    const person = pick(personByGroup(group).length ? personByGroup(group) : PEOPLE);
    const opened = Math.floor(rand() * 150) + 1;
    INCIDENTS.push({
      sys_id: id("i", incSeq),
      number: `INC00${10000 + incSeq}`,
      cmdb_ci: ci.sys_id,
      short_description: pick(INCIDENT_TITLES),
      priority: heavy && i === 0 ? "1 - Critical" : pick(["2 - High", "3 - Moderate", "3 - Moderate", "4 - Low"]),
      state: opened > 20 ? "7 - Closed" : pick(["2 - In Progress", "6 - Resolved"]),
      opened_at: daysAgo(opened),
      resolved_at: opened > 20 ? daysAgo(opened - 1) : "",
      assigned_to: person.name,
      assignment_group: group,
    });
  }
  if (rand() > 0.55) {
    chgSeq += 1;
    const person = pick(personByGroup(group).length ? personByGroup(group) : PEOPLE);
    CHANGES.push({
      sys_id: id("h", chgSeq),
      number: `CHG00${20000 + chgSeq}`,
      cmdb_ci: ci.sys_id,
      short_description: pick(CHANGE_TITLES),
      risk: heavy ? pick(["High", "Moderate"]) : pick(["Moderate", "Low"]),
      state: pick(["Assess", "Authorize", "Scheduled", "Closed"]),
      start_date: daysAgo(Math.floor(rand() * 60) - 10),
      assigned_to: person.name,
      assignment_group: group,
    });
  }
}

// The change the blast-radius journey is asked about: on the shared licence
// broker, so the walk reaches two Tier 1 services through different paths.
CHANGES.unshift({
  sys_id: id("h", 9001),
  number: "CHG0025001",
  cmdb_ci: appCis[2].sys_id,
  short_description: "Upgrade Licence Broker to 7.2 and move to the new load balancer pool",
  risk: "High",
  state: "Assess",
  start_date: daysAgo(-3),
  assigned_to: "Deepak Kumar",
  assignment_group: "EDA Compute",
});

export const TABLES: Record<string, unknown[]> = {
  cmdb_ci: CIS,
  cmdb_rel_ci: RELS,
  incident: INCIDENTS,
  change_request: CHANGES,
  sys_user: PEOPLE,
};

export const SUMMARY = {
  cis: CIS.length,
  relationships: RELS.length,
  incidents: INCIDENTS.length,
  changes: CHANGES.length,
  people: PEOPLE.length,
};
