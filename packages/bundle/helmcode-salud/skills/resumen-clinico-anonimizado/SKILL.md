---
name: resumen-clinico-anonimizado
description: Use when summarizing, structuring, or extracting from clinical documentation in this deployment (patient records, discharge reports, referrals, lab results, progress notes), when a user asks for a summary of a clinical document, or when clinical text has to be reduced to a structured result. Makes the anonymization flow mandatory, because a clinical document may not reach the model as raw text.
---

# Anonymized clinical summary

This skill produces summaries, extractions and structured tables from clinical documentation. It is a documentation skill: it restates and organizes what the source says. It does not diagnose, does not recommend or adjust treatment, does not interpret a result clinically, and does not substitute the judgement of the professional who owns the case. Every clinical statement it writes is attributable to a source fragment; when the source is ambiguous, contradictory or silent, the summary says so instead of completing the gap from general knowledge. When a question requires clinical judgement, the summary states the findings and names the decision as the professional's.

## The anonymization flow is mandatory

The four steps below are the whole flow. Step 1 is the only permitted way to read a clinical document: raw clinical text may not reach the model, so a normal `read` of one is never an option, not even to "check something quickly" or to see the header.

1. **Read the document with `workspace_read_anonymized`.** Never with `read`, and never through a command (`bash`, `pwsh`), a search tool (`grep`, glob) or any other tool that returns file content. You pass the file `path` (relative paths resolve against the session working directory) and, only if the file legitimately exceeds the default cap, a larger `maxBytes`. The tool returns the text with Spanish personal data replaced by stable markers such as `[DNI_1]`, and it does not modify the file. It fails closed: if the sealed map cannot be read or decrypted, or the file is larger than the cap, the call fails and you report the failure. **A failed call is never a reason to fall back to `read`; it is a reason to stop and tell the user.**
2. **Work only on the redacted text.** Nothing you write, quote or carry into a later step may contain a value that was replaced. Refer to the people and documents by their markers and by the role the document assigns them (the patient, the referring service, the prescribing professional), never by a name or an identifier you can infer from context.
3. **The summary keeps the markers.** A summary, an extraction or a table written to disk is written with the same markers, because the marker is what lets the result be joined back to the original later by the operator who holds the map. Do not replace a marker with a guess, do not reorder or renumber markers, and do not explain in the summary what a marker "really" is.
4. **Restoration happens only on the user's explicit request.** You have no tool that restores a marker, and this summary is not a place to undo the redaction. If the user explicitly asks for the original values, say that restoration is an operator operation performed on the sealed redaction map with its key, and that it is deliberately not something the assistant does on its own initiative. The default answer to an implicit need for the original value is the marker, plus a note that the value is available to the operator.

## What the tool does not cover

`workspace_read_anonymized` replaces nine detected value types: DNI, NIE, IBAN, card number, social-security number, telephone, email, licence plate and health-record number. It does **not** detect names, postal addresses, dates of birth, ages, professions, rare diagnoses or free-text identifiers, and no automatic pass will. Treat the redacted text as still identifying in those dimensions:

- Do not copy a proper name, an address or a date of birth into the summary, even when it survived redaction; write the role instead ("the patient", "the referring physician").
- Do not reconstruct an identity from the combination of quasi-identifiers (a rare diagnosis plus an age plus a service plus a date). If a fragment would identify the patient only in combination, generalize it or leave it out.
- If the source document itself carries an identifying detail that the summary genuinely needs to be useful, say that the detail is present and left out on purpose, so the user can decide.

## Shape of the result

- Lead with what the document is (type, date as given, issuing service) and who it concerns, in role terms.
- Then the clinical content in the order the source presents it, grouped by section: reason for the encounter, relevant history, findings and results with their units and reference ranges as written, assessment as stated by the source, plan as stated by the source.
- Keep every figure, unit, date and negation exactly as the source states them. A dropped "no" or a rounded value changes clinical meaning. When a value is illegible, missing or truncated in the source, write that instead of leaving it out silently.
- Close with what the document does not contain and what the summary could not resolve, in one short list. That list is part of the deliverable, not an apology.

## Working rules

- **Write the summary to a new file.** The anonymized read does not count as having observed the source file, so a later `edit` of the source still demands a normal `read` of it — which is exactly the raw read this flow forbids. Summaries go to a new path, and the source document is left untouched.
- **Do not paste the source into a scratch file or a command.** A copy of the raw text defeats the flow wherever it lands.
- **Ask before assuming.** If the task needs a detail the document does not carry, or the document is not a text file (a scanned PDF or an image, which this flow cannot read), say so and ask; do not reconstruct the content from other sources.
- **One document, one call.** If several documents have to be summarized, read each one with the tool, in the same session, so all of them share one marker namespace and the summaries remain joinable.
