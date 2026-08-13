import { SqlMcpServerBase, buildSqlToolDefs, createSqlRouter } from "../mcp-server";
import { SqlServerClient } from "./client";
import type { RealMcpToolDef } from "../../../real-mcp-base";
import type { SqlConnector } from "../types";

export class SqlServerMcpServer extends SqlMcpServerBase {
  readonly integrationId = "sqlserver";
  protected readonly dialectLabel = "SQL Server";
  readonly tools: RealMcpToolDef[] = buildSqlToolDefs(this.dialectLabel);

  protected buildConnector(credentials: Record<string, string>): SqlConnector {
    return new SqlServerClient({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.user,
      password: credentials.password,
      ssl: credentials.ssl,
    });
  }
}

export const sqlServerMcpServer = new SqlServerMcpServer();

export function createSqlServerRouter() {
  return createSqlRouter(sqlServerMcpServer, "sqlserver");
}
