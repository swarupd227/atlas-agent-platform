import { describe, it, expect } from "vitest";
import { hasReadOnlyToolName } from "../server/tool-read-only";
import { evalRunMode } from "../server/eval-run-mode";

describe("hasReadOnlyToolName", () => {
  it("treats plain and connector-prefixed read verbs as read-only", () => {
    for (const n of ["get_item_permissions", "list_site_library_files", "graph_read_document", "graph_search_sharepoint", "graph_classify_table", "graph_get_email", "salesforce_query_leads"]) {
      expect(hasReadOnlyToolName(n), n).toBe(true);
    }
  });

  it("keeps writes and unknown tools side-effectful", () => {
    for (const n of ["revoke_sharing_permission", "delete_drive_item", "create_sharing_link", "graph_send_email", "graph_post_teams_message", "graph_create_calendar_event", "salesforce_update_lead", "run_pipeline"]) {
      expect(hasReadOnlyToolName(n), n).toBe(false);
    }
  });

  it("does not let a verb hidden later in the name make a write look like a read", () => {
    expect(hasReadOnlyToolName("send_get_receipt")).toBe(false);
    expect(hasReadOnlyToolName("graph_send_get_email")).toBe(false);
  });
});

describe("evalRunMode", () => {
  const none = { mcpServerCount: 0, skillCount: 0, knowledgeBaseCount: 0, activeDeploymentCount: 0 };
  it("uses the real runtime when the answer depends on tools, skills, knowledge or a deployment", () => {
    expect(evalRunMode({ ...none, mcpServerCount: 2 })).toBe("runtime");
    expect(evalRunMode({ ...none, skillCount: 1 })).toBe("runtime");
    expect(evalRunMode({ ...none, knowledgeBaseCount: 1 })).toBe("runtime");
    expect(evalRunMode({ ...none, activeDeploymentCount: 1 })).toBe("runtime");
  });
  it("keeps a single model call for a prompt-only agent", () => {
    expect(evalRunMode(none)).toBe("direct");
  });
});
