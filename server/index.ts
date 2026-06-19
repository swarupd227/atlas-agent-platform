import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { autoResumeRuntimes } from "./agent-runtime";
import { authMiddleware, seedDefaultAdmin, getSecurityMode, setDefaultOrgId } from "./auth";
import { storage } from "./storage";
import { otlpIngestRouter } from "./routes/observability";
import { pool } from "./db";
import { validateEnv, demosEnabled } from "./config";

// Fail fast on misconfiguration before anything else starts.
validateEnv();

// Readiness state — true once startup seeding has finished.
let appReady = false;

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err?.message, err?.stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  // Logged loudly; not fatal in Phase 0 to avoid crash-loops from background
  // tasks. Promote to process.exit(1) once those rejections are cleaned up.
  console.error("[ERROR] Unhandled rejection:", reason);
});

const app = express();
const httpServer = createServer(app);

// Graceful shutdown: stop accepting traffic, drain, close DB pool, exit.
function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received — draining and shutting down`);
  appReady = false;
  const force = setTimeout(() => {
    console.error("[shutdown] Forced exit after 25s drain timeout");
    process.exit(1);
  }, 25_000);
  httpServer.close(async () => {
    try { await pool.end(); } catch { /* ignore */ }
    clearTimeout(force);
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Liveness & readiness probes (public, no auth, registered before the SPA catch-all).
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  if (!appReady) return res.status(503).json({ status: "starting" });
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ status: "ready" });
  } catch {
    return res.status(503).json({ status: "db_unavailable" });
  }
});

app.use(otlpIngestRouter);
app.use("/api", authMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 200) + "..." : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Import demo routes so the router is available before listening
  const { seedDemoMcpServer, seedWorkerMcpEndpoints, demoRouter } = await import("./demo-routes");

  // Hard-gate all demo & mock surfaces off unless demos are explicitly enabled.
  app.use((req, res, next) => {
    if (!demosEnabled() && (req.path.startsWith("/demo-api") || req.path.startsWith("/api/mock"))) {
      return res.status(404).json({ message: "Not found" });
    }
    next();
  });
  if (demosEnabled()) {
    app.use("/demo-api", demoRouter);
  }

  log(`Security mode: ${getSecurityMode()}`);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort is a Linux-only socket option (used on Replit). It throws
      // ENOTSUP on Windows, so only enable it on platforms that support it.
      ...(process.platform !== "win32" ? { reusePort: true } : {}),
    },
    () => {
      log(`serving on port ${port}`);

      // Run all database seeding and background initialization AFTER the port
      // is open so health checks pass immediately on deployment
      (async () => {
        const defaultOrg = await storage.seedDefaultOrganization().catch((err) => {
          console.error("Default org seed error:", err);
          return undefined;
        });
        if (defaultOrg?.id) {
          setDefaultOrgId(defaultOrg.id);
        }
        await seedDatabase().catch((err) => {
          console.error("Seed error:", err);
        });
        await seedDefaultAdmin(defaultOrg?.id).catch((err) => {
          console.error("Admin seed error:", err);
        });

        // Essential initialization is complete — the instance can serve traffic.
        appReady = true;
        log("ready to serve traffic");

        if (demosEnabled()) {
          await seedDemoMcpServer(storage).catch((err) => {
            console.error("Demo MCP seed error:", err);
          });
          await seedWorkerMcpEndpoints(storage).catch((err) => {
            console.error("Worker MCP endpoint seed error:", err);
          });
          const { registerMockMcpServers } = await import("./mock-mcp/register");
          await registerMockMcpServers().catch((err) => {
            console.error("Mock MCP register error:", err);
          });
        }
        import("./permissions").then(({ getOntologySensitivityKeys }) => {
          getOntologySensitivityKeys()
            .then(({ keys }) => {
              if (keys.length > 0)
                log(`Primed ontology sensitivity cache with ${keys.length} keys`);
            })
            .catch(() => {});
        });
        setTimeout(() => {
          autoResumeRuntimes().catch((err) => {
            console.error("[startup] Failed to auto-resume agent runtimes:", err.message);
          });
        }, 5000);
      })().catch((err) => {
        console.error("[startup] Background initialization error:", err);
      });
    },
  );
})();
