import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * server/mandate-git-sync.ts pushes a generated MANDATE.md to an agent's
 * configured git repo on mandate save/approve -- the low-risk half of PRD
 * epic E1/F1.1 ("lives in the client's own repository"). The one property
 * that matters most: for the overwhelming majority of agents (no
 * gitConfig.repoUrl set), this must be a complete, silent no-op -- no fetch
 * call, no thrown error, so mandate save/approve behaves identically to
 * before this file existed.
 */

const updateAgentCalls: any[] = [];
const auditEventCalls: any[] = [];
let mockUser: { username?: string; email?: string } | undefined;

vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn(async () => mockUser),
    updateAgent: vi.fn(async (id: string, data: any) => { updateAgentCalls.push({ id, data }); return { id, ...data }; }),
    createAuditEvent: vi.fn(async (data: any) => { auditEventCalls.push(data); return {}; }),
  },
}));

const { generateMandateMarkdown, syncMandateToGit } = await import("../server/mandate-git-sync");

const baseAgent = {
  id: "agent-1", name: "Wire Release Bot", department: "Payments",
  gitConfig: null as any,
} as any;

const baseMandate = {
  id: "m1", agentId: "agent-1", accountableOwnerUserId: "user-1",
  whatItDoes: "Releases wires under $10k.", mustNever: "Release wires over $10k alone.",
  whenToAskAHuman: null, whenToStop: null, fallbackBehavior: null, howWeKnowItsWorking: null,
  status: "draft", version: 1,
} as any;

let fetchMock: ReturnType<typeof vi.fn>;
let originalEnv: { GITHUB_TOKEN?: string; GH_TOKEN?: string };

beforeEach(() => {
  updateAgentCalls.length = 0;
  auditEventCalls.length = 0;
  mockUser = { username: "priya" };
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  originalEnv = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

afterEach(() => {
  if (originalEnv.GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
  if (originalEnv.GH_TOKEN === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = originalEnv.GH_TOKEN;
});

describe("generateMandateMarkdown", () => {
  it("includes YAML frontmatter with agent id, resolved owner, and domain", async () => {
    const md = await generateMandateMarkdown(baseAgent, baseMandate);
    expect(md).toContain("agent_id: agent-1");
    expect(md).toContain("agent_name: Wire Release Bot");
    expect(md).toContain("owner: priya"); // resolved via storage.getUser
    expect(md).toContain("domain: Payments");
    expect(md).toContain("status: draft");
    expect(md).toContain("version: 1");
  });

  it("falls back to the raw accountableOwnerUserId when the user can't be resolved", async () => {
    mockUser = undefined;
    const md = await generateMandateMarkdown(baseAgent, baseMandate);
    expect(md).toContain("owner: user-1");
  });

  it("falls back to 'unspecified' domain when the agent has no department", async () => {
    const md = await generateMandateMarkdown({ ...baseAgent, department: null }, baseMandate);
    expect(md).toContain("domain: unspecified");
  });

  it("renders all six sections, with a placeholder for unfilled ones", async () => {
    const md = await generateMandateMarkdown(baseAgent, baseMandate);
    expect(md).toContain("## What it does\n\nReleases wires under $10k.");
    expect(md).toContain("## What it must never do\n\nRelease wires over $10k alone.");
    expect(md).toContain("## When it must ask a person\n\n_Not yet described._");
    expect(md).toContain("## When it should stop\n\n_Not yet described._");
    expect(md).toContain("## If it can't finish\n\n_Not yet described._");
    expect(md).toContain("## How we know it's working\n\n_Not yet described._");
  });
});

describe("syncMandateToGit: no-op paths (the default for essentially every agent today)", () => {
  it("no-ops without making any network call when gitConfig.repoUrl is unset", async () => {
    const result = await syncMandateToGit({ ...baseAgent, gitConfig: null }, baseMandate);
    expect(result.pushed).toBe(false);
    expect(result.reason).toMatch(/repoUrl/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateAgentCalls.length).toBe(0);
    expect(auditEventCalls.length).toBe(0);
  });

  it("no-ops without making any network call when no GitHub token is configured", async () => {
    const result = await syncMandateToGit({ ...baseAgent, gitConfig: { repoUrl: "https://github.com/acme/agents" } }, baseMandate);
    expect(result.pushed).toBe(false);
    expect(result.reason).toMatch(/GITHUB_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, even on a totally malformed gitConfig", async () => {
    await expect(syncMandateToGit({ ...baseAgent, gitConfig: { repoUrl: 123 } }, baseMandate)).resolves.toMatchObject({ pushed: false });
  });
});

describe("syncMandateToGit: configured repo", () => {
  const agentWithRepo = { ...baseAgent, gitConfig: { repoUrl: "https://github.com/acme/agents", branch: "main" } };

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
  });

  it("pushes via the GitHub Contents API and records sync bookkeeping + an audit event", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false }) // GET existing file -- none yet
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: { sha: "abc123" } }) }); // PUT

    const result = await syncMandateToGit(agentWithRepo, baseMandate);

    expect(result.pushed).toBe(true);
    expect(result.commitSha).toBe("abc123");
    expect(result.path).toBe("agents/Wire_Release_Bot/MANDATE.md");

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[0]).toBe("https://api.github.com/repos/acme/agents/contents/agents/Wire_Release_Bot/MANDATE.md");
    expect(putCall[1].method).toBe("PUT");
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.sha).toBeUndefined(); // no existing file -- create, not update
    expect(Buffer.from(putBody.content, "base64").toString()).toContain("## What it does");

    // Separate bookkeeping keys from the manifest export's lastSyncedAt/lastSyncCommit.
    expect(updateAgentCalls.length).toBe(1);
    expect(updateAgentCalls[0].data.gitConfig.mandateLastSyncedAt).toBeTruthy();
    expect(updateAgentCalls[0].data.gitConfig.mandateLastSyncCommit).toBe("abc123");
    expect(updateAgentCalls[0].data.gitConfig.lastSyncedAt).toBeUndefined();

    expect(auditEventCalls.length).toBe(1);
    expect(auditEventCalls[0].action).toBe("mandate_git_push");
  });

  it("sends the existing file's sha when updating (not creating)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: "old-sha" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: { sha: "new-sha" } }) });

    await syncMandateToGit(agentWithRepo, baseMandate);

    const putBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(putBody.sha).toBe("old-sha");
  });

  it("returns pushed:false with the GitHub error, without throwing, on a PUT failure", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Validation failed" });

    const result = await syncMandateToGit(agentWithRepo, baseMandate);
    expect(result.pushed).toBe(false);
    expect(result.reason).toContain("422");
    expect(updateAgentCalls.length).toBe(0); // no bookkeeping update on failure
  });

  it("uses gitConfig.mandatePath when explicitly set", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: { sha: "x" } }) });

    const result = await syncMandateToGit(
      { ...agentWithRepo, gitConfig: { ...agentWithRepo.gitConfig, mandatePath: "docs/MANDATE.md" } },
      baseMandate,
    );
    expect(result.path).toBe("docs/MANDATE.md");
  });
});
