import { describe, it, expect, vi, beforeEach } from "vitest";

// The storage layer's multi-connection logic is pure decision-making on top of
// a handful of DB calls, so the DB is faked and the assertions are about WHICH
// row each operation targets -- the thing that actually distinguishes a sibling
// connection from the default one.

type Row = {
  id: string;
  organizationId: string;
  integrationId: string;
  name?: string | null;
  isDefault: boolean;
  credentialBlob?: string | null;
  status?: string;
  createdAt?: Date;
};

/**
 * Minimal stand-in for the parts of DatabaseStorage under test, with the same
 * decision logic as server/storage.ts. Keeps the test honest about ordering and
 * default-flag handling without needing a live Postgres.
 */
class FakeConnectionStore {
  rows: Row[] = [];

  getIntegrationConnection(orgId: string, integrationId: string): Row | null {
    const matches = this.rows
      .filter((r) => r.organizationId === orgId && r.integrationId === integrationId)
      .sort((a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    return matches[0] ?? null;
  }

  getIntegrationConnectionById(orgId: string, connectionId: string): Row | null {
    return this.rows.find((r) => r.organizationId === orgId && r.id === connectionId) ?? null;
  }

  createIntegrationConnection(data: Omit<Row, "id" | "isDefault"> & { isDefault?: boolean }): Row {
    const siblingDefault = this.getIntegrationConnection(data.organizationId, data.integrationId);
    const row: Row = {
      ...data,
      id: `conn-${this.rows.length + 1}`,
      isDefault: siblingDefault ? false : true,
      createdAt: data.createdAt ?? new Date(2026, 0, this.rows.length + 1),
    };
    this.rows.push(row);
    return row;
  }

  upsertIntegrationConnection(data: Omit<Row, "id" | "isDefault">, connectionId?: string): Row {
    const existing = connectionId
      ? this.getIntegrationConnectionById(data.organizationId, connectionId)
      : this.getIntegrationConnection(data.organizationId, data.integrationId);
    if (existing) {
      Object.assign(existing, {
        credentialBlob: data.credentialBlob,
        status: data.status,
        ...(data.name != null ? { name: data.name } : {}),
      });
      return existing;
    }
    return this.createIntegrationConnection(data);
  }

  promoteIntegrationConnectionToDefault(orgId: string, connectionId: string): Row | null {
    const target = this.getIntegrationConnectionById(orgId, connectionId);
    if (!target) return null;
    for (const r of this.rows) {
      if (r.organizationId === orgId && r.integrationId === target.integrationId && r.id !== connectionId) {
        r.isDefault = false;
      }
    }
    target.isDefault = true;
    return target;
  }

  deleteIntegrationConnection(orgId: string, connectionId: string): boolean {
    const i = this.rows.findIndex((r) => r.organizationId === orgId && r.id === connectionId);
    if (i === -1) return false;
    this.rows.splice(i, 1);
    return true;
  }

  /**
   * Mirrors the DELETE route's promote-after-delete step: unlike disconnect
   * (where the row survives holding its flag), deleting the default leaves
   * nothing to hold it, so the oldest survivor is promoted.
   */
  deleteConnectionAsRouteDoes(orgId: string, connectionId: string): { newDefaultConnectionId: string | null } {
    const conn = this.getIntegrationConnectionById(orgId, connectionId);
    if (!conn) return { newDefaultConnectionId: null };
    this.deleteIntegrationConnection(orgId, connectionId);
    if (!conn.isDefault) return { newDefaultConnectionId: null };
    const survivors = this.rows
      .filter((r) => r.organizationId === orgId && r.integrationId === conn.integrationId)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    if (!survivors.length) return { newDefaultConnectionId: null };
    this.promoteIntegrationConnectionToDefault(orgId, survivors[0].id);
    return { newDefaultConnectionId: survivors[0].id };
  }

  disconnectIntegration(orgId: string, integrationId: string, connectionId?: string): void {
    for (const r of this.rows) {
      if (r.organizationId !== orgId) continue;
      const hit = connectionId ? r.id === connectionId : r.integrationId === integrationId;
      if (hit) { r.status = "disconnected"; r.credentialBlob = null; }
    }
  }
}

const ORG = "org-1";
let store: FakeConnectionStore;

beforeEach(() => {
  store = new FakeConnectionStore();
});

function seedDefaultPostgres() {
  return store.createIntegrationConnection({
    organizationId: ORG, integrationId: "postgres", name: "Sales DB",
    credentialBlob: "sales", status: "connected",
  });
}

describe("creating sibling connections", () => {
  it("marks the first connection of a type as the default", () => {
    const first = seedDefaultPostgres();
    expect(first.isDefault).toBe(true);
  });

  it("creates additional connections as NON-default", () => {
    seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    // idx_int_conn_one_default is a unique partial index -- a second
    // is_default=true row for the same (org, integration) would throw.
    expect(second.isDefault).toBe(false);
    expect(store.rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("keeps siblings of DIFFERENT types each defaulted", () => {
    seedDefaultPostgres();
    const mysql = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "mysql", name: "Billing DB",
      credentialBlob: "billing", status: "connected",
    });

    // The index is per (org, integration) -- a different type is unconstrained.
    expect(mysql.isDefault).toBe(true);
  });
});

describe("upsert vs create", () => {
  it("upsert without a connectionId re-authenticates the default rather than duplicating", () => {
    const first = seedDefaultPostgres();
    const again = store.upsertIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", credentialBlob: "rotated", status: "connected",
    });

    // This is the existing "Connect" button's behaviour: fixing credentials must
    // not silently accumulate duplicate connections.
    expect(again.id).toBe(first.id);
    expect(store.rows).toHaveLength(1);
    expect(again.credentialBlob).toBe("rotated");
  });

  it("upsert with a connectionId targets that specific sibling", () => {
    seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    store.upsertIntegrationConnection(
      { organizationId: ORG, integrationId: "postgres", credentialBlob: "support-rotated", status: "connected" },
      second.id,
    );

    expect(store.rows.find((r) => r.id === second.id)?.credentialBlob).toBe("support-rotated");
    // The default must be untouched.
    expect(store.rows.find((r) => r.isDefault)?.credentialBlob).toBe("sales");
  });

  it("does not blank an existing name when the caller supplies none", () => {
    const first = seedDefaultPostgres();
    store.upsertIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", credentialBlob: "rotated", status: "connected",
    });
    expect(store.rows.find((r) => r.id === first.id)?.name).toBe("Sales DB");
  });
});

describe("promoting a default", () => {
  it("moves the flag and leaves exactly one default", () => {
    const first = seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    store.promoteIntegrationConnectionToDefault(ORG, second.id);

    expect(store.rows.find((r) => r.id === second.id)?.isDefault).toBe(true);
    expect(store.rows.find((r) => r.id === first.id)?.isDefault).toBe(false);
    expect(store.rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("redirects the type-only lookup to the newly promoted connection", () => {
    seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    expect(store.getIntegrationConnection(ORG, "postgres")?.name).toBe("Sales DB");
    store.promoteIntegrationConnectionToDefault(ORG, second.id);
    expect(store.getIntegrationConnection(ORG, "postgres")?.name).toBe("Support DB");
  });

  it("returns null for an unknown or cross-tenant connection", () => {
    seedDefaultPostgres();
    expect(store.promoteIntegrationConnectionToDefault(ORG, "conn-nope")).toBeNull();
    expect(store.promoteIntegrationConnectionToDefault("org-2", "conn-1")).toBeNull();
  });
});

describe("disconnecting", () => {
  it("with a connectionId leaves siblings connected", () => {
    const first = seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    store.disconnectIntegration(ORG, "postgres", second.id);

    expect(store.rows.find((r) => r.id === second.id)?.status).toBe("disconnected");
    expect(store.rows.find((r) => r.id === first.id)?.status).toBe("connected");
  });

  it("without a connectionId disconnects EVERY connection of the type", () => {
    seedDefaultPostgres();
    store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    // Type-level disconnect is intentionally sweeping -- this test pins that
    // behaviour so it can't drift silently into a per-connection action.
    store.disconnectIntegration(ORG, "postgres");

    expect(store.rows.every((r) => r.status === "disconnected")).toBe(true);
  });

  it("does not move the default flag off a disconnected connection", () => {
    const first = seedDefaultPostgres();
    store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    store.disconnectIntegration(ORG, "postgres", first.id);

    // Auto-promoting a sibling here would repoint every unpinned agent at a
    // different database as a side effect of a disconnect.
    expect(store.rows.find((r) => r.id === first.id)?.isDefault).toBe(true);
  });
});

describe("deleting a connection", () => {
  it("removes the row entirely, unlike disconnect which keeps it", () => {
    const first = seedDefaultPostgres();
    store.disconnectIntegration(ORG, "postgres", first.id);
    expect(store.rows).toHaveLength(1);

    store.deleteIntegrationConnection(ORG, first.id);
    expect(store.rows).toHaveLength(0);
  });

  it("leaves the default alone when a non-default sibling is deleted", () => {
    const first = seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected",
    });

    const { newDefaultConnectionId } = store.deleteConnectionAsRouteDoes(ORG, second.id);

    expect(newDefaultConnectionId).toBeNull();
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].id).toBe(first.id);
    expect(store.rows[0].isDefault).toBe(true);
  });

  it("promotes the oldest survivor when the DEFAULT is deleted", () => {
    const first = seedDefaultPostgres();
    const second = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Support DB",
      credentialBlob: "support", status: "connected", createdAt: new Date(2026, 5, 1),
    });

    const { newDefaultConnectionId } = store.deleteConnectionAsRouteDoes(ORG, first.id);

    // Leaving zero defaults would drop type-only lookups onto the created_at
    // tiebreaker with no row actually marked as the intended one.
    expect(newDefaultConnectionId).toBe(second.id);
    expect(store.getIntegrationConnection(ORG, "postgres")?.id).toBe(second.id);
    expect(store.rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("leaves no default when the last connection of a type is deleted", () => {
    const first = seedDefaultPostgres();
    const { newDefaultConnectionId } = store.deleteConnectionAsRouteDoes(ORG, first.id);

    expect(newDefaultConnectionId).toBeNull();
    expect(store.getIntegrationConnection(ORG, "postgres")).toBeNull();
  });

  it("will not delete across organizations", () => {
    const first = seedDefaultPostgres();
    expect(store.deleteIntegrationConnection("org-2", first.id)).toBe(false);
    expect(store.rows).toHaveLength(1);
  });
});

describe("type-only resolution is deterministic", () => {
  it("prefers the default over an older non-default row", () => {
    store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "Old DB",
      credentialBlob: "old", status: "connected", createdAt: new Date(2025, 0, 1),
    });
    const newer = store.createIntegrationConnection({
      organizationId: ORG, integrationId: "postgres", name: "New DB",
      credentialBlob: "new", status: "connected", createdAt: new Date(2026, 0, 1),
    });

    store.promoteIntegrationConnectionToDefault(ORG, newer.id);

    // Without the is_default ordering this would return the older row.
    expect(store.getIntegrationConnection(ORG, "postgres")?.name).toBe("New DB");
  });

  it("scopes lookups to the organization", () => {
    seedDefaultPostgres();
    expect(store.getIntegrationConnection("org-2", "postgres")).toBeNull();
    expect(store.getIntegrationConnectionById("org-2", "conn-1")).toBeNull();
  });
});
