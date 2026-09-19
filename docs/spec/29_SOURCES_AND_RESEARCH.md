---
document_id: SOS-29
version: 1.0.0
prepared_for: Jason / Obavia Sales OS
date: 2026-09-18
status: Specification; not deployed
authority: Proposed product specification, subject to the precedence rules in AGENTS.md
---

# Source register, evidence boundaries, and research notes

**Read with:** [01_SOURCE_AUDIT_AND_CORRECTIONS.md](01_SOURCE_AUDIT_AND_CORRECTIONS.md), [28_TRACEABILITY_AND_OPEN_DECISIONS.md](28_TRACEABILITY_AND_OPEN_DECISIONS.md)

## Source hierarchy

The user's current explicit request determines the deliverable. The approved metric/domain contracts determine implementation semantics. The source transcript and screenshot provide a reported business example, not an audited operating model. Public provider documentation supports specific capability and reliability claims, not the entire proposed architecture.

Research was checked during preparation on September 18, 2026 in the user's local date. Provider behavior, plan access, policies, and API versions must be verified again for the selected implementation. No subscription prices were established, no user account configuration was inspected, and no vendor purchase is recommended as already approved.

## User-provided sources

### U0: Current conversation requirements

The user asked for separate actual Markdown files covering the sales operating system discussed in this chat: clear funnel metrics, automatic tracking, lead distribution, relational/personality/ego pairing, psychology, setter/closer interfaces, gamification, leaderboards, stage SOPs, adaptive language, AI tips, architecture, and a build-versus-buy judgment. The full requirement mapping is in [SOS-28](28_TRACEABILITY_AND_OPEN_DECISIONS.md).

### U1: Supplied Viral Coach sales-process transcript

Local source: [User-supplied transcript](30_USER_SUPPLIED_TRANSCRIPT.md).

The user supplied the text directly. It contains the speaker's revenue, lead, compensation, operational, recruitment, and business-performance claims. No original video URL or independent accounting evidence was supplied for this transcript. Preserve claims as speaker-reported. Name variations and transcription errors are not resolved into verified identities.

### U2: Supplied August 2026 spreadsheet screenshot

Local source: [Original screenshot](assets/IMG_4629.png).

The image was visually inspected without OCR. The two-column reading and arithmetic fixture are in [SOS-01](01_SOURCE_AUDIT_AND_CORRECTIONS.md). The high-volume rep's show count appears to be 159; related displayed ratios support that reading. A native spreadsheet remains preferable before using the figures as real records. The screenshot does not identify its underlying CRM or prove collection status.

## Primary public documentation used

### S01: Twilio Call resource

URL: `https://www.twilio.com/docs/voice/api/call-resource`

Verified point: call progress/status information is available, and a completed call can involve a person, IVR, or voicemail. Therefore our design does not equate completed transport status with a verified customer conversation. Callback names and terminal statuses require careful mapping. Used in SOS-04; other reliability details are proposed design requirements.

### S02: Stripe webhooks

URL: `https://docs.stripe.com/webhooks`

Verified point: webhook deliveries can be duplicated and event order is not guaranteed; the documentation describes signature verification and related handling. This supports an ingestion design with idempotency, durable receipt, and reconciliation. It does not establish that the user currently uses Stripe.

### S03: Zoom webhooks

URL: `https://developers.zoom.us/docs/api/webhooks/`

Verified point: the documentation includes `meeting.participant_joined` and required scopes. It supports a provider-specific attendance integration where identity and permissions are adequate. It does not prove attendance from a calendar entry or establish all account-plan capabilities.

### S04: W3C, Understanding Success Criterion 1.4.1: Use of Color

URL: `https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html`

Verified point: color should not be the only visual means of conveying information. The proposed glow/outline treatment therefore includes text, icons, and accessible interaction alternatives. Other usability details are the product's proposed requirements.

### S05: Zoho CRM Notifications APIs overview

URL: `https://www.zoho.com/crm/developer/docs/api/v8/notifications/overview.html`

Verified point: official documentation describes CRM notifications for record changes. Exact modules, permissions, subscription support, renewal, and delivery behavior require a selected-account integration test.

### S06: Zoho CRM omnichannel product documentation

URL: `https://www.zoho.com/crm/lead-management/omnichannel.html`

Verified point: the official page describes click-to-call, multiple telephony providers, and automatic call logging. This supports evaluating an existing Zoho configuration before rebuilding those functions. It is a vendor capability description, not an independent quality review or proof of the user's plan access.

### S07: Stripe refunds

URL: `https://docs.stripe.com/refunds`

Verified point: refunds have a provider-managed lifecycle and balance effects. The financial model must reconcile actual payment movements rather than treating a sale as permanently collected. Specific ledger entries in this pack are illustrative arithmetic, not a complete processor implementation.

### S08: Stripe dispute lifecycle

URL: `https://docs.stripe.com/disputes/how-disputes-work`

Verified point: disputes can produce financial movements and later outcomes. The design keeps dispute effects distinct from refunds and restores funds only when supported by actual ledger evidence. No claim is made that all disputes are permanent losses.

### S09: NIST AI Risk Management Framework

URL: `https://www.nist.gov/itl/ai-risk-management-framework`

Verified point: NIST describes a voluntary framework for incorporating trustworthiness into AI design, development, use, and evaluation. It is a governance reference, not certification or scientific validation of the proposed personality lenses.

## Attempted research and unresolved claims

Meta lead-generation API pages were requested but could not be retrieved successfully, including a rate-limit response. Therefore exact current lead-ad permission, webhook, and retrieval contracts remain unverified in this pack. A generic ingestion adapter is specified; no specific working Meta integration is claimed.

The original source video's software is unknown. The spreadsheet appearance does not establish whether the operator uses Google Sheets, Excel, a custom CRM, a commercial dialer, or AI tooling behind it.

The earlier phonetic FATE reference was researched, but the original interview content was not fully available through the fetched primary video page. The pack treats focus/authority/tribe/emotion as a contextual mnemonic, not an authenticated scientific model or a claim that the framework is causally effective.

No peer-reviewed validation of the proposed ego-lens taxonomy or rep/prospect matching rule was established here. These features are explicitly hypotheses with evidence, correction, shadow-mode, and controlled-evaluation requirements.

No legal determination was made about calling, recording, automated outreach, employment compensation, holdbacks, privacy, or consumer finance. Those questions depend on the actual deployment and remain launch review items.

## How to cite and update this pack

Use U0/U1/U2 for user-provided requirements or source claims and S01-S09 for the limited verified public points above. Proposed architecture, SOPs, guardrails, and hypothetical examples are original design work and should be labeled as such, not falsely attributed to a vendor or trainer.

When updating a source, record retrieval date, relevant version, verified point, limitations, and affected module IDs. Correct derived calculations and tests when a source value changes. Do not replace an explicit Unknown with a plausible guess.

## Agent task prompt

```text
Verify a factual or provider-specific claim before implementation. Use the source register, current primary documentation, and actual authorized account capabilities. Record exactly what is supported and what remains unknown. Do not treat a vendor page as proof of business outcomes, a transcript as an audit, or an illustrative psychological taxonomy as validated science.
```

