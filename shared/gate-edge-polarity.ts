/**
 * Which side of a human checkpoint an outgoing edge is on.
 *
 * A checkpoint emits one deterministic decision, `{approved: boolean}`, and the
 * engine trusts it ahead of whatever the edge's own condition says -- because
 * those conditions are authored against a description of the gate and routinely
 * name a field the gate never emits ("confirmed" where it only ever writes
 * "approved"), which would fail permanently and skip an approval that actually
 * succeeded.
 *
 * Trusting it was right. Handing the SAME boolean to every outgoing edge was
 * not. A checkpoint drawn with an approve branch and a decline branch gave both
 * edges `true` on approval, so both ran: live 2026-09-26 a submission was bound
 * as POL-2026-8891-CP and the broker was told it had been declined, in one run,
 * with nothing reporting a problem. Any flow with a decline path off an
 * approval had this, which is most of them.
 *
 * So read the edge's polarity and apply the decision with the right sign. This
 * is deliberately conservative: an edge whose polarity cannot be read keeps the
 * old behaviour and follows the approval, because a gate with a single
 * unlabelled onward edge is the common case and must not start skipping.
 */
import type { RuleGroup, RuleLeaf } from "./schema";

export type GatePolarity = "approve" | "reject" | "unknown";

/** Field names that carry a positive decision, and their negative counterparts. */
const POSITIVE_FIELDS = /^(approved|accepted|approve|confirmed|signedoff|signed_off|passed|ok|authorised|authorized)$/;
const NEGATIVE_FIELDS = /^(rejected|declined|denied|refused|failed|requireschanges|requires_changes|changesrequested|changes_requested)$/;

/**
 * Negative first: "not approved" contains "approved", and "Rejected -- escalate"
 * is a rejection whatever else it says. "escalate" alone is NOT here -- an
 * escalation can follow either decision, and guessing wrong would silently
 * reroute a live approval.
 */
const NEGATIVE_TEXT = /\b(declin\w*|reject\w*|denie\w*|deny|refus\w*|unsuccessful|fail\w*|redraft\w*|rework\w*|changes?\s+requested|push\s?back|sent?\s+back|not\s+approv\w*|isn'?t\s+approv\w*|no(?:t)?\s+sign(?:ed)?[\s-]?off)\b/i;
const POSITIVE_TEXT = /\b(approv\w*|accept\w*|sign(?:ed)?[\s-]?off|confirm\w*|pass\w*|proceed\w*|authoris\w*|authoriz\w*|agree\w*|go\s+ahead)\b/i;

function leafOf(rule: RuleGroup | null | undefined): RuleLeaf | null {
  if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length !== 1) return null;
  const only = rule.conditions[0] as RuleLeaf | RuleGroup;
  return "field" in only ? (only as RuleLeaf) : null;
}

/** The polarity a single boolean comparison implies, or null when it implies none. */
function polarityFromRule(rule: RuleGroup | null | undefined): GatePolarity | null {
  const leaf = leafOf(rule);
  if (!leaf || (leaf.operator !== "==" && leaf.operator !== "!=")) return null;
  const field = String(leaf.field ?? "").split(".").pop()!.toLowerCase();
  const positiveField = POSITIVE_FIELDS.test(field);
  const negativeField = NEGATIVE_FIELDS.test(field);
  if (!positiveField && !negativeField) return null;

  // `true`, and the strings a rule authored by a model tends to carry.
  const raw = leaf.value;
  const truthy = raw === true || (typeof raw === "string" && /^(true|yes)$/i.test(raw.trim()));
  const falsy = raw === false || (typeof raw === "string" && /^(false|no)$/i.test(raw.trim()));
  if (!truthy && !falsy) return null;

  // "approved == false" and "rejected == true" both mean the reject branch;
  // `!=` flips it.
  let meansApprove = positiveField ? truthy : falsy;
  if (leaf.operator === "!=") meansApprove = !meansApprove;
  return meansApprove ? "approve" : "reject";
}

export function gateEdgePolarity(edge: { condition?: string | null; rule?: RuleGroup | null; label?: string | null }): GatePolarity {
  // A compiled rule is stronger evidence than prose, so it is read first.
  const fromRule = polarityFromRule(edge?.rule);
  if (fromRule) return fromRule;

  const text = `${edge?.condition ?? ""} ${edge?.label ?? ""}`.trim();
  if (!text) return "unknown";
  if (NEGATIVE_TEXT.test(text)) return "reject";
  if (POSITIVE_TEXT.test(text)) return "approve";
  return "unknown";
}

/**
 * The decision an edge off a checkpoint should act on, given the checkpoint's
 * own `approved` flag.
 */
export function gateEdgeSatisfied(approved: boolean, edge: { condition?: string | null; rule?: RuleGroup | null; label?: string | null }): boolean {
  return gateEdgePolarity(edge) === "reject" ? !approved : approved;
}
