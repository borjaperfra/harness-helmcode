---
name: revision-informe-clinico
description: Use when reviewing or quality-checking a clinical report, a discharge summary or a referral against the material it claims to rest on, when a user asks whether a clinical document is complete, consistent or correctly supported, or when claims in a clinical document have to be verified one by one with citations.
---

# Clinical report review and QA

This skill reviews a clinical document against the material it claims to rest on: the results, the notes and the prior reports in the workspace. It checks support, internal consistency and completeness, and it cites the fragment behind every verdict. It is a documentary review: it does not diagnose, does not judge whether a treatment or a decision was clinically correct, and does not substitute the judgement of the professional responsible for the report. Its subject is the text and its sources, never the medicine.

## The anonymization flow comes first

The mandatory flow of `resumen-clinico-anonimizado` applies here unchanged, and it applies before any check, because a review reads the document and its sources in full.

1. **Read the report and every source with `workspace_read_anonymized`.** Never with `read`, and never through a command or a search tool. The call returns the text with Spanish personal data (DNI, NIE, IBAN, card, social-security number, telephone, email, plate, health-record number) replaced by stable markers such as `[RECORD_1]`, leaves the file untouched, and fails closed when the sealed map cannot be read or decrypted. A failed call stops the review; it never falls back to `read`.
2. **Work only on the redacted text**, and cite fragments as they appear in it, markers included.
3. **The review output keeps the markers.** Verdicts, quotes and tables are written with the same markers; a marker is never explained, guessed or renumbered.
4. **Restoration happens only on the user's explicit request**, and it is an operator operation on the sealed map with its key, not something the assistant does on its own initiative. If the review needs a value behind a marker to be meaningful, say so and leave the marker in place.

The tool replaces nine detected value types and does not detect names, addresses, dates of birth or free-text identifiers. Quote no name or address even when it survived redaction, generalize a quasi-identifier that would identify the patient only in combination, and treat the redacted text as still identifying in those dimensions.

## Verify point by point, with citations

Do not review by impression. Build the review as a list of discrete claims, each one checked and each one cited.

1. **Decompose the report into claims.** A claim is one checkable statement: a finding, a value with its unit, a date, a medication with dose and schedule, a referral, a conclusion, an attribution ("as reported by..."), a negation ("no history of..."). Keep the report's own wording in the claim so the citation can be compared against it literally.
2. **For every claim, find its support.** Search the workspace sources for the fragment that states it, and read the source with `workspace_read_anonymized` before citing it. A claim that only another part of the same report supports is marked as internally supported, not as sourced.
3. **Cite the fragment for every verdict**, in this form: the marker-bearing claim, the verdict, and the quoted source fragment with its file path and its line or section. Quote enough that a reader can confirm the verdict without opening the file; never paraphrase a cited fragment or a value.
4. **Classify each verdict** as one of:
   - `supported` — a source states it, and the citation shows it.
   - `contradicted` — a source states something incompatible; cite both fragments.
   - `unsupported` — no source in the workspace states it; the review says what it searched.
   - `inconsistent` — the report disagrees with itself; cite both places.
   - `incomplete` — the claim is checkable in principle but the material needed is absent; name the missing material.
5. **Check the report's arithmetic and its internal links explicitly**: totals against their addends, a stated result against its unit and reference range, dates in order, a conclusion against the findings it summarizes, a referral against the reason given for it. These are the cheapest defects to find and the most damaging to leave.

## Flag what cannot be verified

Every claim whose verdict is not `supported` is reported as a flag, and a flag is never softened into a suggestion or dropped because it looks minor:

- Name the claim, the verdict, the citation that produced it (or the search that found nothing), and what would settle it.
- Do not fill a gap with clinical plausibility, general knowledge or a typical value for the finding. "Most reports like this say X" is not a verdict.
- Say which sources were available and which were not: a review over a partial workspace reports the partial coverage instead of implying completeness.
- Report your own limits: a fragment that is illegible, a scanned attachment you cannot read as text, a source in a language you cannot check literally, a value whose marker hides a unit.

## Shape of the result

- **Coverage**: the report under review, the sources consulted with their paths, and what was not available.
- **Flags** first, ordered by severity, each with its claim, verdict, citation and what would settle it.
- **Point-by-point table**: claim, verdict, citation, note. One row per claim, in the report's own order, so a reader can walk the report alongside the table.
- **What is not reviewed**: anything outside the documentary scope of this skill, stated plainly, including any question the user is really asking that only a clinician can answer.

## Working rules

- **Never edit the document under review.** The anonymized read does not count as observing the file, so an `edit` would still demand the raw `read` this flow forbids. The review is written to a new path.
- **Ask before assuming.** If a verdict needs a source that is not in the workspace, ask for it; do not infer the source's content. If the user asks for a clinical conclusion rather than a documentary check, say that this skill verifies the text and that the clinical judgement belongs to the professional.
- **Idempotence.** The same report and the same sources produce the same verdicts. Re-verify affected claims when a source changes instead of restating the earlier review.
