import { SqlMcpServerBase, buildSqlToolDefs, createSqlRouter } from "../mcp-server";
import { PostgresClient } from "./client";
import type { RealMcpToolDef } from "../../../real-mcp-base";
import type { SqlConnector } from "../types";

export class PostgresMcpServer extends SqlMcpServerBase {
  readonly integrationId = "postgres";
  protected readonly dialectLabel = "PostgreSQL";
  readonly tools: RealMcpToolDef[] = buildSqlToolDefs(this.dialectLabel);

  protected buildConnector(credentials: Record<string, string>): SqlConnector {
    return new PostgresClient({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.user,
      password: credentials.password,
      ssl: credentials.ssl,
    });
  }
}

export const postgresMcpServer = new PostgresMcpServer();

export function createPostgresRouter() {
  return createSqlRouter(postgresMcpServer, "postgres");
}
