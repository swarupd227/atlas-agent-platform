import { apiRequest } from "@/lib/queryClient";

export type JobStatusSnapshot = {
  id: string;
  status: string;
  progress: number | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

type WatchOptions = {
  jobId: string;
  onSnapshot: (job: JobStatusSnapshot) => void;
  onTransientError?: (error: unknown) => void;
  pollIntervalMs?: number;
};

type WatchDependencies = {
  fetchJob?: (jobId: string, signal: AbortSignal) => Promise<JobStatusSnapshot>;
  schedule?: (run: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
};

const configuredPollInterval = Number(import.meta.env.VITE_JOB_STATUS_POLL_INTERVAL_MS);
export const JOB_STATUS_POLL_INTERVAL_MS =
  Number.isFinite(configuredPollInterval) && configuredPollInterval > 0
    ? configuredPollInterval
    : 2_000;

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

async function fetchPersistedJob(jobId: string, signal: AbortSignal): Promise<JobStatusSnapshot> {
  const response = await apiRequest("GET", `/api/jobs/${encodeURIComponent(jobId)}`, undefined, signal);
  return response.json();
}

export function watchJobStatus(
  options: WatchOptions,
  dependencies: WatchDependencies = {},
): () => void {
  const fetchJob = dependencies.fetchJob ?? fetchPersistedJob;
  const schedule = dependencies.schedule ?? ((run, delayMs) => window.setTimeout(run, delayMs));
  const cancel = dependencies.cancel ?? ((handle) => window.clearTimeout(handle as number));
  const pollIntervalMs = options.pollIntervalMs ?? JOB_STATUS_POLL_INTERVAL_MS;
  const abortController = new AbortController();
  let stopped = false;
  let timer: unknown;

  const poll = async () => {
    try {
      const job = await fetchJob(options.jobId, abortController.signal);
      if (stopped) return;
      options.onSnapshot(job);
      if (terminalStatuses.has(job.status)) {
        stopped = true;
        return;
      }
    } catch (error) {
      if (stopped || abortController.signal.aborted) return;
      options.onTransientError?.(error);
    }

    if (!stopped) {
      timer = schedule(() => void poll(), pollIntervalMs);
    }
  };

  void poll();

  return () => {
    stopped = true;
    abortController.abort();
    if (timer !== undefined) cancel(timer);
  };
}
