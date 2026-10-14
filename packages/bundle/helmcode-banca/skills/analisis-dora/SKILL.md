---
name: analisis-dora
description: Use when analysing DORA compliance over the material in the workspace — classifying an operation as supporting a critical or important function, identifying the ICT third-party providers behind it, and evaluating the controls around it — when a user asks whether a service is in DORA's scope, which providers are critical, or which evidence is missing. Makes the anonymization flow mandatory, because a compliance file carries personal and contractual data.
---

# DORA compliance analysis

This skill reads a compliance file and organises it against DORA (Regulation (EU) 2022/2554): the operations in scope, the ICT third-party providers behind them, the contractual and control evidence the file holds, and the gaps. It restates and structures what the documents say and cites the fragment behind every statement. It does not give legal advice, does not decide the entity's compliance, does not register a provider or notify an incident, and does not substitute the judgement of the compliance function or of the supervisor. Where the file is silent or contradictory, the analysis says so.

## The anonymization flow comes first

Step 1 is the only permitted way to read any document of the file: raw text of a compliance file may not reach the model, so a normal `read` is never an option, not even to check a heading or a provider's registered name.

1. **Read every document with `workspace_read_anonymized`.** Never with `read`, and never through a command, a search tool or any other tool that returns file content. The call returns the text with Spanish personal data (DNI, NIE, IBAN, card, social-security number, telephone, email, plate, health-record number) replaced by stable markers such as `[DNI_1]`, leaves the file untouched, and fails closed when the sealed map cannot be read or decrypted. **A failed call stops the analysis; it never falls back to `read`.**
2. **Work only on the redacted text.** Refer to the provider, the counterparty and the responsible role by the role the document assigns them (the ICT provider, the contract owner, the control owner), never by a name you can infer.
3. **The analysis keeps the markers.** Findings, tables and quotes are written with the same markers; a marker is never explained, guessed or renumbered, and no identity is reconstructed from a combination of quasi-identifiers.
4. **Restoration happens only on the user's explicit request**, as an operator operation on the sealed map with its key, not something the assistant does on its own initiative.

The tool replaces nine detected value types and does not detect names, addresses, dates of birth or free-text identifiers. Quote no name or address even when it survived redaction.

## Structure the analysis by article

Organise the reading by the DORA article the material answers, and keep the file's own wording in every citation.

1. **Scope and the function supported** (the support-of-critical-or-important-functions axis, and the proportionality the regulation attaches to it). State which operations the file describes, which business function each one supports, and what the file says about criticality or importance of that function. Do not classify a function as critical or important on your own: record the classification the file makes, the one the entity's own framework states, or the absence of either.
2. **ICT third-party risk** (the provider register, the contractual requirements of art. 30, the exit strategies, the concentration view). For each provider: the service, the operation it supports, the contract's term, the subcontracting it discloses, the exit plan it references, and the location of the processing the documents describe. Flag every required element the file does not evidence, naming the article's requirement and what would evidence it.
3. **Incident and resilience evidence** (incident classification, reporting, business continuity and disaster recovery, testing). Point-by-point per claim: the control as described, the test as recorded with its date and scope, the result as written, and the citation. A control asserted without a record is an assertion, not evidence.
4. **Gaps.** Every item whose verdict is not "evidenced" is a gap, and a gap is never softened: name the requirement, the article, the citation that produced the verdict (or the search that found nothing), and what would close it. Distinguish "the file does not evidence it" from "the file evidences its absence" — the two lead to different work.

## What this skill does not do

- **No compliance decision, no legal advice.** No assessment of whether the entity is compliant, no regulatory conclusion, no opinion on whether a contract satisfies art. 30 in law. Those belong to the compliance function and its advisers, on these citations.
- **No filling of gaps from general knowledge.** Do not supply a customary notice period, a typical recovery objective or a standard contract term. If the workspace holds no such document, the analysis says it holds none.
- **No provider or incident register mutation.** The analysis is a document; registering a provider, notifying an incident or publishing a report is an act outside the model's turn.
- **No edits to the documents analysed.** The anonymized read does not count as observing a file, so an `edit` of it would still demand the raw `read` this flow forbids. Output goes to a new path.

## Shape of the result

- **Coverage**: documents reviewed with their paths, and what was not available.
- **Gaps** first, ordered by severity, each with requirement, article, citation and what would close it.
- **Operations table**: operation, function supported, criticality as stated, providers behind it, citation.
- **Provider table**: provider (by role and marker), service, contract term, subcontracting, exit plan, processing location as described, missing elements, citation.
- **Control and testing table**: control, test, date, result as written, citation, verdict.
- **Closing note**: what the analysis does not answer, plus the reminder that the compliance judgement is the entity's.

## Working rules

- **Ask before assuming.** If a finding needs a document that is not in the workspace, ask for it.
- **One file, one marker namespace.** Read every document of the file with the tool in the same session, so the citations stay joinable to the originals.
- **Idempotence.** The same file produces the same analysis. Re-verify affected rows when a document changes instead of restating the earlier analysis.
