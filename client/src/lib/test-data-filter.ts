// Business-facing lists (Outcomes hub, My Workers, Workspace agent picker) get
// populated with QA/demo fixtures alongside real work — this flags the common
// naming patterns so those surfaces can hide them by default for the
// Outcome Owner persona (UX audit F-3).
const TEST_FIXTURE_PATTERN = /^\[e2e|seed test|^phase [a-z]\b|^test-(inlinebp|withbp|nobp)-|^bulk[ab]-/i;
const TRAILING_EPOCH_SUFFIX = /-\d{10,}$/;

export function isTestFixtureName(name: string | null | undefined): boolean {
  if (!name) return false;
  return TEST_FIXTURE_PATTERN.test(name.trim()) || TRAILING_EPOCH_SUFFIX.test(name.trim());
}
