---
name: analisis-sentencias
description: Use when analysing a judgment, an order or a body of case law against the material in the workspace, when a user asks what a decision held, how it was reasoned, or how it relates to other decisions, or when the facts, the reasoning and the holding have to be separated with citations to the original text. Makes the anonymization flow mandatory, because a judgment names the parties.
---

# Judgment and case-law analysis

This skill analyses a judgment, an order or a set of decisions and produces a structured reading of it: the facts as the decision states them, the grounds (fundamentos), the holding (fallo), and the citations behind every statement. The citation's subject is the text of the decision, never the law as the assistant remembers it. It does not give legal advice, does not predict how a court would decide a live matter, and does not substitute the judgement of a bar-admitted lawyer. Where the decision's reasoning is ambiguous, contradictory or silent, the analysis says so instead of completing it.

## The anonymization flow comes first

Step 1 is the only permitted way to read a decision or any document of the matter: raw text of a client's file may not reach the model, so a normal `read` is never an option, not even for the header, the case number or the parties.

1. **Read every document with `workspace_read_anonymized`.** Never with `read`, and never through a command, a search tool or any other tool that returns file content. The call returns the text with Spanish personal data replaced by stable markers such as `[DNI_1]`, leaves the file untouched, and fails closed when the sealed map cannot be read or decrypted. **A failed call stops the analysis; it never falls back to `read`.**
2. **Work only on the redacted text**, and cite fragments as they appear in it, markers included. Refer to the parties by the role the decision assigns them (the appellant, the claimant, the respondent, the minor), never by a name.
3. **The analysis keeps the markers.** Quotes and tables are written with the same markers; a marker is never explained, guessed or renumbered, and a party is never re-identified from the combination of a role, a court, a date and a rare fact.
4. **Restoration happens only on the user's explicit request**, as an operator operation on the sealed map with its key. Do not ask for it to make a citation read better.

The tool replaces nine detected value types and does not detect names, addresses, dates of birth or free-text identifiers. Quote no name or address even when it survived redaction, and leave out a fragment whose identification would add nothing to the analysis.

## Structure the reading

The three-part structure below is the deliverable, not a suggestion. Keep the decision's own order inside each part and cite as you go.

1. **Hechos (facts).** What the decision states happened, in its own order, with its citations. Mark explicitly which facts are undisputed, which the decision attributes to a party's account, and which the decision declines to settle. A fact that only the assistant's general knowledge supplies is not a fact of the decision.
2. **Fundamentos (grounds).** The reasoning, claim by claim: the rule the decision applies, the source it says it applies (statute, earlier decision, doctrine), and the step it takes from that source to this case. Quote the passage that carries each step. When the decision cites an earlier ruling, record the citation as the decision writes it and say whether the earlier text is in the workspace; do not reconstruct it from memory.
3. **Fallo (holding).** What was decided, in the operative terms the decision uses: what is upheld or dismissed, what is awarded, what is annulled, what is remitted, and any costs or interest. Quote the operative paragraph. A dissenting or concurring opinion is recorded as its own part, with whose it is and what it would have decided.
4. **Cross-decision reading**, only when more than one decision is in the workspace: which point of law each one addresses, where they agree, where they diverge, and what each cited authority actually holds — quoted from the workspace copy, with its path. Divergence is stated as the texts state it, not as a trend.

## Mark what the text does not settle

- **Do not resolve an ambiguity with plausibility.** If a ground admits two readings, both are stated with their citations; the analysis does not elect one.
- **Do not carry a name, an address or a date of birth into the analysis** even when it survived redaction; write the role instead.
- **Do not treat a citation gap as a finding about the law.** If the decision cites a text the workspace does not hold, say that the text is cited and not available here.
- **Report your own limits**: an illegible fragment, a scanned attachment, a decision in a language you cannot check literally, a passage whose marker hides a figure that matters.
- **Distinguish the decision's words from your summary of them** everywhere; the reader must always be able to tell which is which.

## Shape of the result

- **Coverage**: the decisions analysed with their paths, the court and the date as each one states them, and what was not available.
- **Per decision**: identificación as the text gives it (court, date, kind of decision), hechos, fundamentos, fallo, votos particulares — each with its citations.
- **Comparative table** when several decisions are in play: decision, point of law, what it held, cited authority in the workspace, citation.
- **Closing note**: the questions the analysis does not answer and the reminder that applying a decision to a live matter is the bar-admitted lawyer's judgement, not this analysis.

## Working rules

- **Never edit a document under analysis.** The anonymized read does not count as observing the file, so an `edit` would still demand the raw `read` this flow forbids. Output goes to a new path.
- **Ask before assuming.** If the analysis needs a document that is not in the workspace, ask for it.
- **Idempotence.** The same decisions produce the same analysis. Re-verify affected parts when a document changes instead of restating the earlier analysis.
