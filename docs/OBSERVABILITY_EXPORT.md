# Exporting run traces (OpenTelemetry / Datadog)

Every agent run records a span tree: the run, each tool step, and the call it made to the connector
or model. Astra can forward those trees to any backend that accepts OTLP over HTTP, such as Datadog.

## What is sent

- Spans only. Each carries ids (agent, trace), the span name, kind, start and end time, status, the
  tool and connector names, the dispatch outcome, and the run's cost.
- **Not** sent: prompts, model output, tool arguments or results, or credentials.
- A failed wire call carries a short error text from the system it called. That text is **left out**
  unless you set `ASTRA_OTLP_INCLUDE_ERRORS=true`.
- The resource carries `service.name`, `service.version` (the build), `run.trace_id`, `agent.id` and
  `astra.org.id` (an opaque id), plus anything in `OTEL_RESOURCE_ATTRIBUTES`.

Astra sends OTLP over **HTTP with JSON**. It does not speak gRPC or protobuf; a configuration that
asks for either stops the server at boot with a message, instead of being ignored.

## Configuration

The standard OpenTelemetry variables. Nothing is sent unless an endpoint is set.

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | The full URL, used exactly as given. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | A base URL; `/v1/traces` is added. Used when the one above is unset. |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS` / `OTEL_EXPORTER_OTLP_HEADERS` | `name=value,name=value`. Values may be percent-encoded. This is where the API key goes. |
| `OTEL_EXPORTER_OTLP_HEADERS_FILE` | A path to a mounted secret holding the same text, instead of the variable. Set one or the other, not both. |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Milliseconds per request. Default 10000. |
| `OTEL_SERVICE_NAME` | Default `atlas-agent-runtime`. |
| `OTEL_RESOURCE_ATTRIBUTES` | `key=value,key=value`, e.g. `deployment.environment=prod`. |
| `ASTRA_OTLP_INCLUDE_ERRORS` | `true` also sends the error text of failed wire calls. Default off. |

Terraform: `otlp_traces_endpoint` and `otlp_headers` (the latter is sensitive; set it with
`TF_VAR_otlp_headers`). Docker Compose passes the same variables through.

A value Astra cannot use (a URL with a password in it, a bad header, a protocol it does not speak)
**stops the server at boot** with the reason, so a misconfiguration is seen at deploy time and not
discovered later as missing data.

## Datadog

There are two ways to reach Datadog. Astra sends the same request either way.

**1. Directly to Datadog's OTLP traces intake.** Needs no software in your network.

1. In Datadog, create an API key for this purpose (Organization Settings, API Keys).
2. Find the OTLP **traces** intake endpoint for your Datadog site in Datadog's documentation
   ("OTLP intake" / "send OpenTelemetry traces directly to Datadog"). It differs by site; your
   Datadog administrator can confirm it. Datadog's intake accepts OTLP/HTTP with JSON or protobuf,
   not gRPC.
3. Set:
   - `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to that URL;
   - `OTEL_EXPORTER_OTLP_HEADERS` to `dd-api-key=<your key>` (or mount it and use
     `OTEL_EXPORTER_OTLP_HEADERS_FILE`). Add any other header Datadog's documentation asks for.
4. Restart. The startup log shows `otlp=<host> headers=1` (the host and how many headers, never a value).
5. Run an agent, then look for the trace in Datadog APM under the service name above.

A `403` from Datadog means the endpoint does not match the site the key belongs to.

**2. Through a Datadog Agent or an OpenTelemetry Collector in your network.** Set
`OTEL_EXPORTER_OTLP_ENDPOINT` to its OTLP/HTTP address, typically `http://<host>:4318`. If that address
is on a private subnet, Astra's outbound policy must be told it may call it:
`ASTRA_ALLOWED_PRIVATE_CIDRS=<address>@4318` (see the README). Loopback, link-local and cloud-metadata
addresses can never be allowed.

## Checking that it works

`GET /api/observability/export/status` (administrators only) reports whether export is configured, the
host it sends to, the **names** of the headers it sends (never their values), and counts of spans
exported, failed and dropped, with the last error and when it happened.

## What happens when the backend is unavailable

Runs are never slowed or failed by export. Spans are queued and sent in the background, a few seconds
apart, in batches under 4 MB. A 429 or a server error is tried up to three times in all, honouring
`Retry-After`; a refusal such as 401 or 403 is not retried and is logged. If the queue holds 20,000
spans, further spans are dropped and counted. On shutdown Astra waits up to five seconds to send what
is queued.

## Logs from the Claude CLI server VM

Astra does not collect logs from that VM. Run the Datadog Agent, or an OpenTelemetry Collector with a
`filelog` receiver, on the VM itself and send them to Datadog from there.
