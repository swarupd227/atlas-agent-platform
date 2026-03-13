# ATLAS Demo Script — Scenario 2: SoD Conflict / SOX Wall Violation
**Audience:** BlackRock executives / risk & compliance leadership
**Duration:** ~4 minutes
**Format:** Live walkthrough of the 4-step guided demo

---

## Before you start
> Reset the demo first (click **Reset** in the top-right), then select **Scenario 2 — SoD Conflict: SOX Wall Violation**.

---

## Opening hook (say this before clicking anything)

> "Let me show you a scenario that happens every week at firms like this — and almost never gets caught in time.
>
> A synthetic worker was granted the `Order_Approver` role on Aladdin OMS three months ago. That grant happened through a legacy AD group, outside of SailPoint. So to your IGA system, it's invisible.
>
> Now your operations team is submitting a new request to give that same synthetic worker the `Portfolio_Rebalancer` entitlement — also on Aladdin OMS.
>
> Without ATLAS, that request gets approved. Your IAM team doesn't see the conflict. Your auditors don't see it either — until SOX review season, by which point you're looking at a §404 finding."

---

## Step 1 — Setup *(click "Run SoD Detection")*

> "Here's the situation ATLAS is watching. On the left you see the pre-existing grant — `Order_Approver`, applied manually to Aladdin OMS three months ago, never touched by SailPoint. On the right, the live request: `Portfolio_Rebalancer` on the same application.
>
> ATLAS's pre-check runs before a single provisioning call is made."

**[Click "Run SoD Detection"]**

> "This is ATLAS running its compliance gate — cross-referencing entitlements across the full identity fabric, not just what IGA can see."

---

## Step 2 — Detection *(click "Next: View Violation Details")*

> "Provisioning stops immediately. Aquera marks Aladdin OMS as **Policy Blocked** — the connector is frozen. No entitlement has moved.
>
> Notice what didn't happen: no ticket got routed to the wrong queue, no analyst had to manually compare spreadsheets, no provisioning completed and then got revoked two weeks later.
>
> The block happened at the gate."

**[Click "Next: View Violation Details"]**

---

## Step 3 — Violation *(click "Next: Choose Resolution Path")*

> "This is the incident card ATLAS creates automatically. Incident `INC-SOD-20260313` — SOX §404, Separation of Duties violation. Both conflicting roles are documented: who granted them, when, through what channel.
>
> That audit trail is immutable the moment the violation fires. By the time your auditor asks for it, it's already there.
>
> Three entries in the audit log: violation detected, provisioning blocked, incident routed to human review. That's the entire chain of custody in under two seconds."

**[Click "Next: Choose Resolution Path"]**

---

## Step 4 — Resolution *(click one of the two paths)*

> "ATLAS surfaces two resolution options. It doesn't decide for you — it decides *with* you.
>
> **Path A** is revoke: remove the legacy `Order_Approver` role that was granted outside of governance. This is the clean path. Once that role is revoked, the new request can be re-evaluated.
>
> **Path B** is an approved exception: keep both roles but require dual sign-off — CISO and CFO — and attach compensating controls. This becomes a permanent record in the audit log.
>
> In either case, ATLAS closes the incident with full documentation."

**[Click "Revoke Legacy Role" or "Approve Exception"]**

> "Done. The violation is resolved, the audit trail is closed, and the synthetic worker's access profile is consistent with your SOX controls.
>
> What you just saw took about 90 seconds. Without ATLAS, the average time to detect a conflict like this — if it gets detected at all — is measured in months."

---

## Closing (no click needed)

> "The reason this matters for BlackRock specifically is the scale. You're running thousands of synthetic workers across Aladdin, your data pipelines, your analytics platforms. Each one of them is an identity. Each identity is a potential SoD surface.
>
> ATLAS watches all of them, simultaneously, before anything is provisioned. That's the guarantee."

---

## Anticipated questions

**"How does ATLAS know about the legacy AD grant if SailPoint doesn't?"**
> "ATLAS federates across your full identity fabric — AD, SailPoint, Aquera, your LDAP layer. It doesn't rely on any single system as the source of truth. It correlates across all of them."

**"What if the exception path is chosen — how is that enforced?"**
> "The exception is time-bounded and dual sign-off is required before ATLAS releases the provisioning hold. The compensating controls are documented in the incident record and surfaced at your next SOX review automatically."

**"Can this be tuned for our specific SOX controls?"**
> "Yes — the policy engine is configurable per framework. Your SOX §404 rules, your HIPAA boundaries, your internal SoD matrix — all of them are defined as policies in ATLAS and applied consistently across every identity event."

**"What's the latency — how fast does this run in production?"**
> "The compliance pre-check runs in under 500 milliseconds. It's synchronous with the provisioning request — the block happens before Aquera makes the first call."
