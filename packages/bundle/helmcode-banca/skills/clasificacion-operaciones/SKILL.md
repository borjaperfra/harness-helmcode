---
name: clasificacion-operaciones
description: Use when classifying banking operations by type and risk over the material in the workspace — payments, credit, deposits, trading, custody, custody-adjacent services, outsourcing — when a user asks what an operation is, how it should be categorised, or which risk bucket it belongs in, with the criterion and the citation behind every classification. Makes the anonymization flow mandatory, because an operation file carries personal and contractual data.
---

# Banking operations classification

This skill classifies the operations a file describes: what each operation is, which type it belongs to, which risk characteristics it carries, and why. Every classification carries the criterion it applied and the fragment it rests on. It is a documentary classification: it does not give legal, tax or investment advice, does not assign a regulatory capital treatment, does not decide whether an operation may be booked, and does not substitute the judgement of the compliance, risk or accounting function. When an operation does not fit a type, the classification says so instead of forcing it.

## The anonymization flow comes first

Step 1 is the only permitted way to read a document of the operation: raw text of a client file may not reach the model, so a normal `read` is never an option, not even to check a heading or an account reference.

1. **Read every document with `workspace_read_anonymized`.** Never with `read`, and never through a command, a search tool or any other tool that returns file content. The call returns the text with Spanish personal data (DNI, NIE, IBAN, card, social-security number, telephone, email, plate, health-record number) replaced by stable markers such as `[IBAN_1]`, leaves the file untouched, and fails closed when the sealed map cannot be read or decrypted. **A failed call stops the classification; it never falls back to `read`.**
2. **Work only on the redacted text.** Refer to the parties by the role the document assigns them (the account holder, the borrower, the counterparty, the guarantor), never by a name or an account you can infer.
3. **The classification keeps the markers.** Amounts, identifiers and references are quoted as the redacted text carries them; a marker is never explained, guessed or renumbered.
4. **Restoration happens only on the user's explicit request**, as an operator operation on the sealed map with its key, not something the assistant does on its own initiative.

The tool replaces nine detected value types and does not detect names, addresses, dates of birth or free-text identifiers. Quote no name or address even when it survived redaction.

## Classify with a criterion, then cite

Do not label an operation by impression. Each classification is a claim that names the criterion and the fragment behind it.

1. **State the operation as the document states it**, in one line: what is done, by whom (in role terms), with what, for how long, and on what terms — each element with its citation. An operation described only across several documents is one row with several citations.
2. **Classify by type**, from the operation's own characteristics: payment or transfer, credit or financing, deposit or funding, guarantee, trading or derivative, custody or safekeeping, foreign exchange, insurance-linked, or an outsourcing or ICT service supporting one of those. Name the characteristics that put the operation in the type, and name the type's nearest neighbour when the operation also shows its characteristics.
3. **Classify by risk**, with the factor that carries the risk, at least:
   - **Counterparty** — who owes the performance, and what the file says about their standing or the guarantee behind them.
   - **Credit** — the amount at risk, the security, the schedule, and any condition the document attaches.
   - **Liquidity and term** — the maturity, the option to withdraw or prepay, and the mismatch that implies.
   - **Market** — the price or rate that moves the outcome, and whether the document fixes it or leaves it open.
   - **Operational and third-party** — the provider or system the operation depends on, and what the file records about that dependency.
   - **Legal, regulatory and data protection** — the regime the document invokes, the personal data it carries, and any authorisation it names.
   - **Concentration** — whether the file shows the same counterparty, provider or collateral recurring across operations.
   The bucket is stated as high, medium or low **for this operation as the file describes it**, with the factor that produced it. A bucket without its factor is not a classification.
4. **Cite before you classify**, in the form the anonymized read returned: the operation, the type or bucket, the criterion, and the quoted fragment with its file path and line or section. Never paraphrase a quoted fragment or a figure.
5. **Mark what cannot be classified**: a document that does not state the maturity, the amount, the security or the counterparty leaves the operation partially classified — say which dimension is open, what would close it, and what you searched. Do not infer the missing dimension from a typical structure of the product.

## What this skill does not do

- **No advice and no decision.** No regulatory treatment, no accounting entry, no capital or provisioning figure, no opinion on whether the operation may be booked. Those belong to the entity's functions.
- **No reconstruction of missing terms.** If the file does not state the rate, the security or the term, the classification says so; it does not supply a market-typical value.
- **No edits to the documents classified.** The anonymized read does not count as observing a file, so an `edit` of it would still demand the raw `read` this flow forbids. Output goes to a new path.
- **No coverage it cannot support.** Name the documents consulted, the ones that were not available, and any fragment that is illegible or truncated.

## Shape of the result

- **Coverage**: documents reviewed with their paths, and what was not available.
- **Classification table**: operation, type, characteristics that place it there, risk bucket with its factor, citation, open dimensions.
- **Per-factor notes** where a bucket needs more than one line: the factor, what the document says, the citation, and the counter-indication if there is one.
- **Concentration note** when the file shows recurrence across operations.
- **Closing note**: what the classification does not answer, and the reminder that the risk and compliance functions own the decision.

## Working rules

- **Ask before assuming.** If the classification needs a document that is not in the workspace, ask for it.
- **One client, one marker namespace.** Read every document with the tool in the same session, so the citations stay joinable to the originals.
- **Idempotence.** The same documents produce the same classification. Re-verify the affected rows when a document changes instead of restating the earlier table.
