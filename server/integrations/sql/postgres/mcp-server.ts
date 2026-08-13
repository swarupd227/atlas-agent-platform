import { SqlMcpServerBase, buildSqlToolDefs, createSqlRouter } from "../mcp-server";
import { PostgresClient } from "./client";
import type { RealMcpToolDef } from "../../../real-mcp-base";
import type { SqlConnector, SqlCredentials } from "../types";

export class PostgresMcpServer extends SqlMcpServerBase {
  readonly integrationId = "postgres";
  protected readonly dialectLabel = "PostgreSQL";
  readonly tools: RealMcpToolDef[] = buildSqlToolDefs(this.dialectLabel);

  protected buildConnector(credentials: Record<string, string>): SqlConnector {
    // Every SqlCredentials field is optional and string-typed -- the vault
    // stores an untyped string map, so this covers direct/ssh_tunnel/
    // relay_agent mode fields alike without listing each one out.
    return new PostgresClient(credentials as SqlCredentials);
  }
}

export const postgresMcpServer = new PostgresMcpServer();

export function createPostgresRouter() {
  return createSqlRouter(postgresMcpServer, "postgres");
}
