/**
 * run_agent and get_run (server/astra/tools/run-agent.ts, get-run.ts) through
 * the engine, against a simulated Workspace run: who may run what, approval
 * gates inside the run surfacing as Astra cards, Confirm / Not now deciding
 * that step, and decisions made elsewhere. In-memory store, scripted brain.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { runAgentTool } from "../server/astra/tools/run-agent";
import { getRunTool } from "../server/astra/tools/get-run";
import { hasPermission } from "../server/permissions";
import type { AstraContext, AstraEvent } from "../server/astra/types";

const ORG = "org-a";
const ENGINEER: AstraContext = { orgId: ORG, userId: "user-1", role: "agent_engineer" };

type Run = {
  id: string; agentId: string; status: string; requestText: string; outputSummary: string | null; costUsd: number; traceId: string | null;
  pending: null | { approvalId: string | null; summary: string | null; toolName: string; args: Record<string, unknown> };
  steps: any[];
};

/** A Workspace run that pauses at the gates listed in `gates`, one after another. */
function fakeWorkspace(gates: string[] = []) {
  const runnable = [
    { id: "ag-ar", name: "AR Data Gathering", description: "Open AR", ontologyTags: [{ conceptLabel: "Open Receivable" }] },
    { id: "ag-team", name: "Collections Team", description: "Team" },
    { id: "ag-ar2", name: "AR Notifications", description: "Sends reminders" },
  ];
  const all: Record<string, any> = {
    "ag-ar": { id: "ag-ar", name: "AR Data Gathering", agentType: "single", status: "active" },
    "ag-team": { id: "ag-team", name: "Collections Team", agentType: "team", status: "active" },
    "ag-ar2": { id: "ag-ar2", name: "AR Notifications", agentType: "single", status: "active" },
    "ag-draft": { id: "ag-draft", name: "Warranty Claims", agentType: "single", status: "draft" },
  };
  const runs = new Map<string, Run & { org: string; gateIndex: number }>();
  const remaining = [...gates];

  const advance = (run: Run & { org: string; gateIndex: number }, onEvent: (e: any) => void): Run => {
    onEvent({ type: "planning", iteration: 1 });
    onEvent({ type: "tool_start", tool: "get_open_receivables", server: "Dealer Operations", args: { customer: "RIDGELINE CONTR LLC" } });
    onEvent({ type: "tool_result", tool: "get_open_receivables", outcome: "ok", ok: true, preview: "3 invoices" });
    run.steps.push({ name: "get_open_receivables", type: "tool_call", status: "completed", outcome: "ok" });
    const gate = remaining.shift();
    if (gate) {
      run.status = "awaiting_approval";
      run.gateIndex += 1;
      run.pending = { approvalId: `apr-${run.gateIndex}`, summary: `Run ${gate}`, toolName: gate, args: { customer: "RIDGELINE CONTR LLC" } };
      onEvent({ type: "awaiting_approval", approvalId: run.pending.approvalId, tool: gate, summary: run.pending.summary, args: run.pending.args });
    } else {
      run.status = "completed";
      run.pending = null;
      run.outputSummary = "RIDGELINE CONTR LLC has $284,000 open: BR-011 $96,400, BR-022 $66,300, BR-014 $121,300.";
      run.traceId = "trace-1";
      run.costUsd = 0.04;
    }
    return JSON.parse(JSON.stringify({ ...run, org: undefined, gateIndex: undefined }));
  };

  const services = {
    listRunnableAgents: vi.fn(async (_org: string, _role: string) => runnable),
    getAgent: async (org: string, id: string) => (org === ORG ? all[id] : undefined),
    startAgentRun: vi.fn(async (org: string, _role: string, agentId: string, request: string, onEvent: (e: any) => void) => {
      const run = { id: `run-${runs.size + 1}`, org, agentId, status: "running", requestText: request, outputSummary: null, costUsd: 0, traceId: null, pending: null, steps: [], gateIndex: 0 };
      runs.set(run.id, run);
      onEvent({ type: "run_started", runId: run.id, agentId, agentName: all[agentId].name });
      return advance(run, onEvent);
    }),
    getAgentRun: vi.fn(async (org: string, runId: string) => {
      const run = runs.get(runId);
      return run && run.org === org ? JSON.parse(JSON.stringify(run)) : null;
    }),
    decideAgentRun: vi.fn(async (org: string, _role: string, runId: string, decision: "approve" | "deny", onEvent: (e: any) => void) => {
      const run = runs.get(runId)!;
      if (run.org !== org) throw new Error("Run not found in this organization.");
      if (decision === "deny") {
        run.steps.push({ name: `Denied: ${run.pending!.toolName}`, type: "tool_call", status: "failed", outcome: "denied_by_human" });
        onEvent({ type: "denied", tool: run.pending!.toolName });
      }
      return advance(run, onEvent);
    }),
    getRunForRole: vi.fn(async (org: string, _role: string, runId: string) => {
      const run = runs.get(runId);
      return run && run.org === org ? { ...JSON.parse(JSON.stringify(run)), requestText: "[REDACTED]" } : null;
    }),
  };
  return { services, runs };
}

function setup(steps: Parameters<typeof scriptedComplete>[0], gates: string[] = []) {
  const ws = fakeWorkspace(gates);
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const audit = vi.fn(async () => {});
  const complete = scriptedComplete(steps);
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, runAgentTool, getRunTool], hasPermission),
    complete,
    can: hasPermission,
    audit,
    services: ws.services,
    model: "test-model",
  };
  const events: AstraEvent[] = [];
  return { ...ws, store, threadId, audit, complete, deps, events, onEvent: (e: AstraEvent) => events.push(e) };
}

const ask = (agent: string, request = "What is RIDGELINE CONTR LLC's open AR?") => ({ toolCalls: [{ name: "run_agent", arguments: { agent, request } }] });
const lastToolResult = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1)!.content);
const finishWith = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);

async function pending(t: ReturnType<typeof setup>) {
  return (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
}

describe("run_agent", () => {
  it("runs the agent as a Workspace run with the caller's role as actor and returns its answer with a run card", async () => {
    const t = setup([
      ask("AR Data Gathering"),
      (messages) => {
        const r = lastToolResult(messages);
        expect(r).toMatchObject({ ok: true, result: { ran: true, status: "completed", traceId: "trace-1" } });
        expect(r.result.output).toContain("$284,000");
        return finishWith("RIDGELINE CONTR LLC has $284,000 open across three branches.");
      },
    ]);
    expect(await runTurn(t.deps, ENGINEER, t.threadId, "Ask AR Data Gathering about Ridgeline", t.onEvent)).toBe("idle");

    expect(t.services.listRunnableAgents).toHaveBeenCalledWith(ORG, "agent_engineer");
    expect(t.services.startAgentRun).toHaveBeenCalledWith(ORG, "agent_engineer", "ag-ar", "What is RIDGELINE CONTR LLC's open AR?", expect.any(Function));
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.artifacts[0]).toMatchObject({ kind: "run", fullViewHref: "/traces/trace-1" });
    expect(final.proof!.compliance).toMatchObject({ status: "measured", summary: expect.stringContaining("1 tool call through the agent's policy gate") });
    expect(final.proof!.context).toMatchObject({ status: "not_measured" });
    expect(final.proof!.industry).toMatchObject({ status: "measured", summary: "Open Receivable" });
  });

  it("narrates the run without exposing tool arguments", async () => {
    const t = setup([ask("ag-ar"), finishWith("Done.")]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Run it", t.onEvent);
    const started = t.events.find((e) => e.type === "tool_start" && e.tool.includes("›")) as Extract<AstraEvent, { type: "tool_start" }>;
    expect(started.tool).toBe("AR Data Gathering › get_open_receivables");
    expect(started.input).toEqual({});
    expect(t.events.some((e) => e.type === "working" && e.label === "AR Data Gathering started")).toBe(true);
  });

  it("refuses an agent the role can't run, without starting anything", async () => {
    const t = setup([
      ask("Warranty Claims"),
      (messages) => {
        expect(lastToolResult(messages).result).toMatchObject({ ran: false, message: expect.stringContaining("isn't available to run") });
        return finishWith("Warranty Claims is still a draft.");
      },
    ]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Run Warranty Claims", t.onEvent);
    expect(t.services.startAgentRun).not.toHaveBeenCalled();
  });

  it("refuses a team honestly instead of running it", async () => {
    const t = setup([
      ask("Collections Team"),
      (messages) => {
        expect(lastToolResult(messages).result).toMatchObject({ ran: false, message: expect.stringContaining("is a team") });
        return finishWith("Teams run from the Workspace for now.");
      },
    ]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Run the collections team", t.onEvent);
    expect(t.services.startAgentRun).not.toHaveBeenCalled();
  });

  it("asks which agent when the name matches several", async () => {
    const t = setup([
      ask("AR"),
      (messages) => {
        expect(lastToolResult(messages).result).toMatchObject({ ran: false, ambiguous: true });
        expect(lastToolResult(messages).result.candidates).toHaveLength(2);
        return finishWith("Which one?");
      },
    ]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Run AR", t.onEvent);
    expect(t.services.startAgentRun).not.toHaveBeenCalled();
  });
});

describe("approval gates inside a run", () => {
  it("pauses the turn on an agent_approval card, and Confirm approves that step and finishes the run", async () => {
    const t = setup([ask("AR Data Gathering"), finishWith("Sent, and the balance is $284,000.")], ["send_dunning_letter"]);
    expect(await runTurn(t.deps, ENGINEER, t.threadId, "Chase Ridgeline", t.onEvent)).toBe("awaiting_confirmation");

    const action = await pending(t);
    expect(action).toMatchObject({ kind: "agent_approval", toolName: "run_agent", summary: "AR Data Gathering wants to run send_dunning_letter" });
    expect(action.frozen).toMatchObject({ runId: "run-1", approvalId: "apr-1", agentId: "ag-ar" });
    expect(t.services.decideAgentRun).not.toHaveBeenCalled();

    expect(await resolveAction(t.deps, ENGINEER, t.threadId, action.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.services.startAgentRun).toHaveBeenCalledTimes(1);
    expect(t.services.decideAgentRun).toHaveBeenCalledWith(ORG, "agent_engineer", "run-1", "approve", expect.any(Function));
    expect(t.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_executed", objectId: "run_agent" }));
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.artifacts[0]).toMatchObject({ kind: "run", props: { status: "completed" } });
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("signed trace recorded") });
  });

  it("Not now denies the step in the run, and the agent carries on", async () => {
    const t = setup(
      [
        ask("AR Data Gathering"),
        (messages) => {
          const r = lastToolResult(messages);
          expect(r.result).toMatchObject({ ran: true, status: "completed", note: "You denied send_dunning_letter." });
          return finishWith("I didn't send the letter. The balance is $284,000.");
        },
      ],
      ["send_dunning_letter"],
    );
    await runTurn(t.deps, ENGINEER, t.threadId, "Chase Ridgeline", t.onEvent);
    expect(await resolveAction(t.deps, ENGINEER, t.threadId, (await pending(t)).id, "cancel", t.onEvent)).toBe("idle");

    expect(t.services.decideAgentRun).toHaveBeenCalledWith(ORG, "agent_engineer", "run-1", "deny", expect.any(Function));
    expect(t.audit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "astra_shell.tool_declined" }));
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining("1 denied") });
  });

  it("pauses again at a second gate in the same run, with a new action", async () => {
    const t = setup([ask("AR Data Gathering"), finishWith("Both done.")], ["send_dunning_letter", "log_collection_note"]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Chase Ridgeline", t.onEvent);
    const first = await pending(t);
    expect(await resolveAction(t.deps, ENGINEER, t.threadId, first.id, "confirm", t.onEvent)).toBe("awaiting_confirmation");
    const second = await pending(t);
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ summary: "AR Data Gathering wants to run log_collection_note", frozen: { approvalId: "apr-2" } });
    expect(await resolveAction(t.deps, ENGINEER, t.threadId, second.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.services.decideAgentRun).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when the step was already decided elsewhere while the card was open", async () => {
    const t = setup(
      [
        ask("AR Data Gathering"),
        (messages) => {
          expect(lastToolResult(messages).result).toMatchObject({ status: "completed", note: expect.stringContaining("already decided elsewhere") });
          return finishWith("Someone already approved it; the run finished.");
        },
      ],
      ["send_dunning_letter"],
    );
    await runTurn(t.deps, ENGINEER, t.threadId, "Chase Ridgeline", t.onEvent);
    const run = t.runs.get("run-1")!;
    Object.assign(run, { status: "completed", pending: null, outputSummary: "Done in My Actions.", traceId: "trace-9" });
    await resolveAction(t.deps, ENGINEER, t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    expect(t.services.decideAgentRun).not.toHaveBeenCalled();
  });

  it("does not let another organization decide the step", async () => {
    const t = setup([ask("AR Data Gathering")], ["send_dunning_letter"]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Chase Ridgeline", t.onEvent);
    await expect(resolveAction(t.deps, { ...ENGINEER, orgId: "org-b" }, t.threadId, (await pending(t)).id, "confirm", t.onEvent)).rejects.toThrow(/not found/);
    expect(t.services.decideAgentRun).not.toHaveBeenCalled();
  });
});

describe("get_run", () => {
  it("returns the run through the role's redaction, and says plainly when there's no such run", async () => {
    const t = setup([
      ask("AR Data Gathering"),
      finishWith("Ran it."),
    ]);
    await runTurn(t.deps, ENGINEER, t.threadId, "Run it", t.onEvent);

    const t2Complete = scriptedComplete([
      { toolCalls: [{ name: "get_run", arguments: { runId: "run-1" } }, { name: "get_run", arguments: { runId: "run-404" } }] },
      (messages) => {
        const results = messages.filter((m) => m.role === "tool").slice(-2).map((m) => JSON.parse(m.content as string));
        expect(results[0].result).toMatchObject({ found: true, status: "completed", request: "[REDACTED]", traceId: "trace-1" });
        expect(results[1].result).toMatchObject({ found: false });
        return finishWith("It completed.");
      },
    ]);
    await runTurn({ ...t.deps, complete: t2Complete }, ENGINEER, t.threadId, "How did run-1 go?", t.onEvent);
    expect(t.services.getRunForRole).toHaveBeenCalledWith(ORG, "agent_engineer", "run-1");
  });
});
