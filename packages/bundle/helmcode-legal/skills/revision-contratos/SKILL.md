---
name: revision-contratos
description: Use when reviewing, quality-checking or summarising a contract or a clause set against the material in the workspace, when a user asks whether a contract is complete, balanced or internally consistent, or when the risk of each clause has to be assessed one by one with citations. Makes the anonymization flow mandatory, because a contract carries identifying data of the parties.
---

# Contract review with citations and per-clause risk

This skill reviews a contract against itself and against the material in the workspace: annexes, prior versions, correspondence, corporate documents, a term sheet. It cites the fragment behind every finding and assesses risk clause by clause. It is a documentary review: it does not give legal advice, does not decide whether a clause is enforceable in a given jurisdiction, does not draft strategy, and does not substitute the judgement of a bar-admitted lawyer. When a question needs that judgement, the review states the finding and names the decision as the lawyer's.

## The anonymization flow comes first

Step 1 is the only permitted way to read a contract or any document of the matter: the text of a client's file may not reach the model as raw text, so a normal `read` of one is never an option, not even to "check the parties" or to see the header.

1. **Read every document with `workspace_read_anonymized`.** Never with `read`, and never through a command (`bash`, `pwsh`), a search tool (`grep`, glob) or any other tool that returns file content. The call returns the text with Spanish personal data (DNI, NIE, IBAN, card, social-security number, telephone, email, plate, health-record number) replaced by stable markers such as `[DNI_1]`, leaves the file untouched, and fails closed when the sealed map cannot be read or decrypted. **A failed call is never a reason to fall back to `read`; it is a reason to stop and tell the user.**
2. **Work only on the redacted text.** Refer to the parties by the role the contract assigns them (the client, the counterparty, the guarantor, the service provider), never by a name you can infer from context.
3. **The review keeps the markers.** Quotes, findings and tables are written with the same markers; a marker is never explained, guessed or renumbered. Do not reconstruct a party's identity from the combination of quasi-identifiers (a rare address plus a role plus a date).
4. **Restoration happens only on the user's explicit request**, and it is an operator operation on the sealed map with its key, not something the assistant does on its own initiative.

The tool replaces nine detected value types and does not detect names, addresses, dates of birth or free-text identifiers. Quote no name or address even when it survived redaction, and treat the redacted text as still identifying in those dimensions.

## Review clause by clause

Do not review by impression and do not summarise the contract in prose and call it a review.

1. **Build the clause inventory.** One row per clause with its number, its heading as written, and the fragment that carries its operative text. A sub-clause that changes a deadline, a cap or a remedy is its own row.
2. **Cite before you judge.** Every finding quotes the fragment it rests on, with the file path and the clause or line, in the marker-bearing form the anonymized read returned. Quote enough that a reader can confirm the finding without opening the file; never paraphrase a quoted fragment.
3. **Assess risk per clause**, with the reason attached, distinguishing at least:
   - **Internal defect** — an undefined term, a cross-reference to a clause that does not exist or does not say that, two clauses that contradict each other, a defined term used before its definition, a reference to a law by a name that does not match the annex.
   - **One-sided term** — an obligation, a cap, an indemnity, a notice period or a termination right that runs only one way; state which side it favours and what the counterpart clause does, or that there is none.
   - **Missing protection** — a subject the contract raises and does not close: liability, confidentiality, data protection, assignment, change of control, force majeure, dispute resolution, governing law. Name the gap and what would close it.
   - **Factual gap** — a statement the contract makes about the parties, the shares, the price or the schedule that no document in the workspace supports. Cite what you searched.
   - **Unverifiable** — the term is legible but its effect depends on law or on facts outside the workspace; say so instead of guessing.
4. **Check the numbers and the internal links explicitly**: amounts against their totals, percentages against the base they apply to, dates in order, notice periods against the events they follow, defined terms against every use of them, annexes against their references. These are the cheapest defects to find and the most damaging to leave.
5. **Keep an ordered risk list**, each item with its clause, its category, its citation and what would settle it. An item never drops off because it looks minor.

## What this skill does not do

- **No legal advice.** No opinion on enforceability, no jurisdictional conclusion, no drafting of a clause, no negotiating position. Those are the bar-admitted lawyer's work on the same citations.
- **No filling of gaps from general knowledge.** A "market standard" clause, a "usual" cap or a "typical" notice period is not a finding. If the workspace holds no precedent, the review says the workspace holds none.
- **No edits to the document under review.** The anonymized read does not count as observing the file, so an `edit` of it would still demand the raw `read` this flow forbids. The review is written to a new path.
- **No coverage it cannot support.** Name the documents consulted, the ones that were not available, and any fragment that is illegible, scanned or in a language you cannot check literally.

## Shape of the result

- **Coverage**: the documents reviewed with their paths, and what was not available.
- **Risk list** first, ordered by severity, each item with clause, category, citation and what would settle it.
- **Clause table**: clause, heading, one-line effect as written, risk category, citation, note. One row per clause, in the contract's own order.
- **Cross-document findings**: what the annexes, the prior version or the correspondence change about the contract's text, each with its citation.
- **Closing note**: what the review did not cover, and the explicit reminder that this is a documentary review and that a bar-admitted lawyer must review the contract before it is signed.

## Working rules

- **Ask before assuming.** If a finding needs a document that is not in the workspace, ask for it; do not infer its content.
- **Idempotence.** The same contract and the same material produce the same review. Re-verify affected clauses when a document changes instead of restating the earlier review.
- **One matter, one marker namespace.** Read every document of the matter with the tool in the same session, so the citations stay joinable to the originals.
