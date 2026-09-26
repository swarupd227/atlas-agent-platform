import { Link } from "wouter";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Label, StatusDot, human } from "./parts";

/**
 * Cards for the Ontology & Graph pack.
 *
 * Two things these have to keep straight, because the figures look alike and
 * mean different things: a concept is the industry's shared vocabulary while
 * usage is this organization's own agents, and a term "resembling" a concept is
 * string similarity, not meaning. Both are said on the card, not just in the
 * reply, because the card is what gets screenshotted.
 */

const pct = (n: number) => `${Math.round(n * 100)}%`;

function ConceptRow({ concept }: { concept: any }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline gap-2">
        <Link
          href={`~/ontology?concept=${encodeURIComponent(concept.id)}`}
          className="min-w-0 flex-1 truncate text-sm hover:underline"
          data-testid={`astra-concept-${concept.id}`}
        >
          {concept.label}
        </Link>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{human(concept.category)}</span>
      </div>
      {concept.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{concept.description}</p>}
      {(concept.synonyms?.length > 0 || concept.regulations > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {concept.synonyms?.length > 0 && <span>also: {concept.synonyms.slice(0, 3).join(", ")}</span>}
          {concept.regulations > 0 && <span className="font-mono">{concept.regulations} reg{concept.regulations === 1 ? "" : "s"}</span>}
        </div>
      )}
    </li>
  );
}

/** The vocabulary, or the part of it that matched a search. */
export function Concepts({ props }: { props: Record<string, any> }) {
  const concepts: any[] = props.concepts ?? [];
  return (
    <div className="space-y-4">
      <div>
        <Label>
          {props.query ? `${props.matched} of ${props.total} concepts match` : `${props.total} concepts`}
          {props.industryId ? ` · ${human(props.industryId)}` : ""}
        </Label>
        {concepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this industry's vocabulary matches.</p>
        ) : (
          <ul className="divide-y divide-border">
            {concepts.map((c) => <ConceptRow key={c.id} concept={c} />)}
          </ul>
        )}
      </div>
      {props.matched > concepts.length && (
        <p className="text-xs text-muted-foreground">{props.matched - concepts.length} more match; open the Ontology page to see them all.</p>
      )}
    </div>
  );
}

/** One concept: what it means, what it links to, and who here carries it. */
export function Concept({ props }: { props: Record<string, any> }) {
  const related: any[] = props.relatedTo ?? [];
  const regulations: any[] = props.regulations ?? [];
  const agents: any[] = props.agents ?? [];
  const properties: any[] = props.properties ?? [];
  return (
    <div className="space-y-5">
      <div>
        <Label>{human(props.category)}{props.source ? ` · ${human(props.source)}` : ""}</Label>
        <p className="text-sm">{props.description}</p>
        {props.synonyms?.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Also called: {props.synonyms.join(", ")}</p>
        )}
      </div>

      {properties.length > 0 && (
        <div>
          <Label>Properties</Label>
          <div className="flex flex-wrap gap-1.5">
            {properties.map((p, i) => (
              <span key={`${p.name}-${i}`} className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {p.name}{p.type ? `: ${p.type}` : ""}{p.required ? " *" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div>
          <Label>Relates to</Label>
          <ul className="space-y-1 text-sm">
            {related.map((r, i) => (
              <li key={`${r.targetId}-${i}`} className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{human(r.type)}</span>
                {r.targetLabel ? (
                  <Link href={`~/ontology?concept=${encodeURIComponent(r.targetId)}`} className="min-w-0 truncate hover:underline">{r.targetLabel}</Link>
                ) : (
                  <span className="min-w-0 truncate text-muted-foreground">
                    {r.targetId ?? "unnamed"}{r.dangling ? " — no concept with that id" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {regulations.length > 0 && (
        <div>
          <Label>Linked regulations</Label>
          <ul className="space-y-1 text-sm">
            {regulations.map((r, i) => (
              <li key={`${r.ref}-${i}`}>
                <span className="font-mono text-xs">{r.ref}{r.section ? ` ${r.section}` : ""}</span>
                {r.description && <span className="text-muted-foreground"> — {r.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Label>Agents here carrying it</Label>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">None of this organization's agents is tagged with this concept.</p>
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <StatusDot status={a.status} />
                <Link href={`~/agents/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">{a.name}</Link>
                {a.needsRevalidation && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--astra-fail))]">needs revalidation</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** How much of the vocabulary the organization's agents actually carry. */
export function OntologyCoverage({ props }: { props: Record<string, any> }) {
  const unused: any[] = props.unused ?? [];
  const bySub: any[] = props.bySubVertical ?? [];
  const used = props.totalConcepts > 0 ? props.usedCount / props.totalConcepts : 0;
  return (
    <div className="space-y-5">
      <div>
        <Label>Concepts carried by at least one agent</Label>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold [font-family:var(--astra-display)]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {props.usedCount}
          </span>
          <span className="text-sm text-muted-foreground">of {props.totalConcepts} · {pct(used)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.round(used * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {props.agentsTagged} of {props.agentsTotal} agents carry any concept. The vocabulary is the industry's; the usage is this organization's.
        </p>
      </div>

      {bySub.length > 0 && (
        <div>
          <Label>Unused by sub-vertical</Label>
          <ul className="space-y-1.5">
            {bySub.slice(0, 6).map((s) => (
              <li key={s.subVertical} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.subVertical}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {s.unused}/{s.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unused.length > 0 && (
        <div>
          <Label>Used by nothing{props.unusedCount > unused.length ? ` (${unused.length} of ${props.unusedCount})` : ""}</Label>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((c) => (
              <Link
                key={c.id}
                href={`~/ontology?concept=${encodeURIComponent(c.id)}`}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** An agent's concepts, and the tool alignment the production gate applies. */
export function OntologyAlignment({ props }: { props: Record<string, any> }) {
  const concepts: any[] = props.concepts ?? [];
  const examined: any[] = props.examined ?? [];
  const low: any[] = props.low ?? [];
  const unrecorded: any[] = props.unmatchedBecauseNothingRecorded ?? [];
  return (
    <div className="space-y-5">
      <div>
        <Label>Concepts this agent carries</Label>
        {concepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">None. Nothing ties this agent to the industry's vocabulary.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {concepts.map((c, i) => (
              <span key={`${c.id}-${i}`} className="rounded border border-border px-1.5 py-0.5 text-[11px]">{c.label}</span>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Production gate — 50% of a tool's parameters matched</Label>
        {!props.hasBlueprint ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This agent has no blueprint, so the gate examines nothing and lets it through. That is not a measure of alignment.
          </p>
        ) : examined.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tool was examined{props.serversLinked === 0 ? ": no connector is linked to this agent" : ""}.
          </p>
        ) : (
          <>
            <p className={`flex items-center gap-1.5 text-sm ${low.length ? "text-[hsl(var(--astra-fail))]" : "text-[hsl(var(--astra-ok))]"}`}>
              {low.length ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
              {low.length
                ? `${low.length} of ${examined.length} tools would block a production deployment`
                : `All ${examined.length} examined tools are at or above the threshold`}
            </p>
            <ul className="mt-2 divide-y divide-border">
              {examined.map((t, i) => (
                <li key={`${t.serverName}-${t.toolName}-${i}`} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{t.toolName}</span>
                  <span className="shrink-0 truncate text-[11px] text-muted-foreground">{t.serverName}</span>
                  <span
                    className={`shrink-0 font-mono text-xs ${t.score < 0.5 ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t.total === 0 ? "none recorded" : `${t.matched}/${t.total} · ${pct(t.score)}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {unrecorded.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unrecorded.length} of the blocked {unrecorded.length === 1 ? "tool has" : "tools have"} no parameter matching recorded at all, which the gate
          counts as 0%. Run parameter matching on the connector before reading that as misalignment.
        </p>
      )}

      {props.needsRevalidation && (
        <p className="text-xs text-[hsl(var(--astra-fail))]">
          Waiting for revalidation{props.revalidationReason ? `: ${props.revalidationReason}` : ""}.
        </p>
      )}
    </div>
  );
}

/** Terms in a text that are in the vocabulary, and terms that only look like one. */
export function VocabularyCheck({ props }: { props: Record<string, any> }) {
  const recognised: string[] = props.recognised ?? [];
  const mismatches: any[] = props.mismatches ?? [];
  return (
    <div className="space-y-5">
      <div>
        <Label>In the vocabulary</Label>
        {recognised.length === 0 ? (
          <p className="text-sm text-muted-foreground">No term in this text matches a concept or one of its synonyms.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {recognised.map((label) => (
              <span key={label} className="rounded border border-[hsl(var(--astra-ok)/0.4)] px-1.5 py-0.5 text-[11px] text-[hsl(var(--astra-ok))]">{label}</span>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Resembles a concept</Label>
        {mismatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing looks like a near-miss.</p>
        ) : (
          <ul className="divide-y divide-border">
            {mismatches.map((m, i) => (
              <li key={`${m.term}-${i}`} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{m.term}</span>
                <span className="shrink-0 text-muted-foreground">→</span>
                <Link href={`~/ontology?concept=${encodeURIComponent(m.conceptId)}`} className="min-w-0 flex-1 truncate hover:underline">{m.suggestedTerm}</Link>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{pct(m.confidence)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Matched by spelling, not by meaning: these are suggestions to judge, not errors. {props.totalTermsChecked} phrases checked against{" "}
          {props.conceptsChecked} concepts.
        </p>
      </div>
    </div>
  );
}
