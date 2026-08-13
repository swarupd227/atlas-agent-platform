import { SqlMcpServerBase, buildSqlToolDefs, createSqlRouter } from "../mcp-server";
import { MySqlClient } from "./client";
import type { RealMcpToolDef } from "../../../real-mcp-base";
import type { SqlConnector } from "../types";

export class MySqlMcpServer extends SqlMcpServerBase {
  readonly integrationId = "mysql";
  protected readonly dialectLabel = "MySQL";
  readonly tools: RealMcpToolDef[] = buildSqlToolDefs(this.dialectLabel);

  protected buildConnector(credentials: Record<string, string>): SqlConnector {
    return new MySqlClient({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.user,
      password: credentials.password,
      ssl: credentials.ssl,
    });
  }
}

export const mysqlMcpServer = new MySqlMcpServer();

export function createMySqlRouter() {
  return createSqlRouter(mysqlMcpServer, "mysql");
}
