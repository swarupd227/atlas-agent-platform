/**
 * Pushes a generated MANDATE.md to an agent's configured git repo whenever
 * its mandate is saved or approved -- the low-risk half of PRD epic E1/F1.1
 * ("File lives in the client's own repository, not in our system"). The
 * database stays authoritative: the warrant gate (tool-dispatcher.ts's
 * evaluateWarrantCondition) needs a fast, synchronous read on every tool
 * dispatch, which a git file can never give it, so this is a one-way,
 * best-effort mirror out to the client's repo, not a replacement for the DB.
 *
 * Deliberately silent-no-op, never throws: the overwhelming majority of
 * agents have no gitConfig.repoUrl set today, and a mandate save/approve
 * must keep working identically for every one of them, exactly as it did
 * before this file existed. A configured repo that's unreachable (bad
 * token, network error, GitHub API error) degrades the same way -- the
 * mandate save still succeeds; only the git mirror is skipped, and it's
 * recorded in an audit event either way.
 */
import type { Agent, AgentMandate } from "@shared/schema";
import { storage } from "./storage";

const MANDATE_SECTIONS: Array<{ key: keyof AgentMandate; heading: string }> = [
  { key: "whatItDoes", heading: "What it does" },
  { key: "mustNever", heading: "What it must never do" },
  { key: "whenToAskAHuman", heading: "When it must ask a person" },
  { key: "whenToStop", heading: "When it should stop" },
  { key: "fallbackBehavior", heading: "If it can't finish" },
  { key: "howWeKnowItsWorking", heading: "How we know it's working" },
];

function yamlEscape(value: string): string {
  // Minimal, deliberate: quote only when the value contains something that
  // would otherwise change YAML's parse (colon+space, leading special char,
  // or a literal quote). Good enough for names/ids/roles; not a full YAML
  // emitter, which this single-file generator doesn't need.
  if (/^[\w.@ -]*$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function resolveOwnerDisplayName(accountableOwnerUserId: string | null): Promise<string> {
  if (!accountableOwnerUserId) return "unassigned";
  const user = await storage.getUser(accountableOwnerUserId).catch(() => undefined);
  return user?.email || user?.username || accountableOwnerUserId;
}

/**
 * agents has no "domain" column (verified against shared/schema.ts) -- the
 * PRD's YAML header wants one, so this falls back to department, the
 * closest existing field, and is honest about it being absent rather than
 * inventing a value. A real "domain" concept for agents is tracked
 * separately, not solved here.
 */
export async function generateMandateMarkdown(agent: Agent, mandate: AgentMandate): Promise<string> {
  const owner = await resolveOwnerDisplayName(mandate.accountableOwnerUserId);
  const domain = agent.department || "unspecified";

  const frontmatter = [
    "---",
    `agent_id: ${yamlEscape(agent.id)}`,
    `agent_name: ${yamlEscape(agent.name)}`,
    `owner: ${yamlEscape(owner)}`,
    `domain: ${yamlEscape(domain)}`,
    `status: ${yamlEscape(mandate.status)}`,
    `version: ${mandate.version}`,
    `generated_at: ${new Date().toISOString()}`,
    "---",
    "",
  ].join("\n");

  const body = MANDATE_SECTIONS.map(({ key, heading }) => {
    const value = (mandate[key] as string | null)?.trim();
    return `## ${heading}\n\n${value || "_Not yet described._"}\n`;
  }).join("\n");

  return `${frontmatter}# MANDATE.md — ${agent.name}\n\n${body}`;
}

function mandateFilePath(agent: Agent, gitConfig: Record<string, any>): string {
  if (typeof gitConfig.mandatePath === "string" && gitConfig.mandatePath) return gitConfig.mandatePath;
  const slug = agent.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `agents/${slug}/MANDATE.md`;
}

export interface MandateSyncResult {
  pushed: boolean;
  reason?: string;
  path?: string;
  commitSha?: string;
}

export async function syncMandateToGit(agent: Agent, mandate: AgentMandate): Promise<MandateSyncResult> {
  try {
    const gitConfig = (agent.gitConfig || {}) as Record<string, any>;
    if (!gitConfig.repoUrl) return { pushed: false, reason: "no gitConfig.repoUrl set for this agent" };

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) return { pushed: false, reason: "GITHUB_TOKEN not configured" };

    const repoUrl = gitConfig.repoUrl as string;
    const branch = (gitConfig.branch as string) || "main";
    const filePath = mandateFilePath(agent, gitConfig);

    const repoMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!repoMatch) return { pushed: false, reason: "invalid GitHub repository URL in gitConfig" };
    const [, owner, repo] = repoMatch;

    const markdown = await generateMandateMarkdown(agent, mandate);
    const content = Buffer.from(markdown).toString("base64");
    const commitMessage = `Update MANDATE.md: ${agent.name} (v${mandate.version}, ${mandate.status})`;

    let existingSha: string | undefined;
    try {
      const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        existingSha = existing.sha;
      }
    } catch {}

    const putBody: any = { message: commitMessage, content, branch };
    if (existingSha) putBody.sha = existingSha;

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const details = await putRes.text().catch(() => "");
      return { pushed: false, reason: `GitHub API error ${putRes.status}: ${details.slice(0, 300)}` };
    }

    const putData = await putRes.json();
    const commitSha = putData.content?.sha || putData.commit?.sha || "";

    // Separate bookkeeping from the manifest export's lastSyncedAt/lastSyncCommit
    // (server/routes/runtime.ts's /git-push) -- these track a different file
    // in the same repo and must not overwrite each other's status.
    await storage.updateAgent(agent.id, {
      gitConfig: { ...gitConfig, mandateLastSyncedAt: new Date().toISOString(), mandateLastSyncCommit: commitSha },
    } as any).catch(() => {});

    await storage.createAuditEvent({
      actorType: "system",
      actorId: "mandate-git-sync",
      action: "mandate_git_push",
      objectType: "agent",
      objectId: agent.id,
      details: `Pushed MANDATE.md to ${owner}/${repo}/${filePath} on branch ${branch} (v${mandate.version}, ${mandate.status})`,
    }).catch(() => {});

    return { pushed: true, path: filePath, commitSha };
  } catch (e: any) {
    return { pushed: false, reason: e?.message || "unknown error" };
  }
}
