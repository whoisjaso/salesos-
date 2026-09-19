# Onboarding: from zero to a working team

How a business that has never used Sales OS gets to its first lead, with every party and every caveat accounted for.

## Parties

| Party | What they need on day one |
|---|---|
| Owner | A business, a way in, a way to bring people, a first lead source. |
| Setter | A way in, a profile, a partner, the first lead to call. |
| Closer | A way in, a profile, a partner, the first appointment. |
| Delivery or manager (later) | Read access to handoffs; out of scope for the first release. |

## Identity, OAuth first

| Way in | Who | Notes |
|---|---|---|
| Google | Everyone | One tap. Preferred. |
| Work email magic link | Everyone | For teams without Google. No password ever. |
| Phone number, one-time code | Reps | For reps who live on their phone. |
| Team code plus one of the above | Reps | Joining from a QR in the room. |

Passwords are not offered. Identity is provided by Supabase Auth in production; the sign-in list in the pilot build is a stand-in until then (D04).

## Owner path

1. Sign in.
2. Create the business: name, timezone, currency. This creates the tenant.
3. Business profile: logo, accent color.
4. Land on Business with the empty state: "Connect your first source" as the hero action, "Invite your team" as the second.
5. Connect a source (OAuth first) or import history (OAuth CRM first, file second).
6. Invite reps.

## Inviting reps

| Method | Flow | Expiry |
|---|---|---|
| Email invite | Owner enters email, picks role (setter or closer), optionally a partner. Rep gets a link. | 7 days |
| Text invite | Same, by phone number. | 7 days |
| Team code and QR | Owner shows a 6-character code or QR. Rep enters it after signing in. Role assigned by the owner on approval, or preset for the code. | Owner sets; default 24 hours |

Rules:
- The role is set by the owner on the invite. A rep never chooses their own role.
- An invite can be revoked before it is accepted.
- Accepting an invite with an identity that already exists in another business adds a membership; it never merges businesses.
- One person can belong to more than one business. Sessions are per business.
- The owner can change a rep's role, pair, or active state later. History stays attached to the person.
- A removed rep loses access immediately. Their opportunities, events, and commission history remain in the tenant.

## Rep path

1. Tap the invite link or enter the team code.
2. Sign in (Google, work email, or phone).
3. Build the profile: photo, name, handle, one line on how they sell, color. Under a minute.
4. Land on Today.

## Empty states, by screen

Every screen must be honest with zero data. No fake zeros, no placeholder charts.

| Screen | Empty state | Action |
|---|---|---|
| Owner Business | "No leads yet" hero with the connected-sources count | Connect a source, Import history, Invite team |
| Owner Team | Roster with pending invites | Invite |
| Setter Today | "Waiting for your first lead" with the share link | Copy link, Add a lead by hand |
| Closer Today | "No appointments yet" | Nothing to do; the setter's work fills this |
| Team board | Roster only, no ranks (provisional by rule) | None |
| Me | Cash hero at $0, Coins tier, level 1 | Collect more |
| Coach | "Nothing to coach yet, 25 opportunities needed" | None |

Ranking, coaching, and tiers stay provisional until the sample thresholds in policy are met. This is the same rule the mature product uses; empty states are just the far end of it.

## Data on day one

| Situation | Path |
|---|---|
| Brand new business, no history | Connect a source. First lead creates the first opportunity. |
| Existing CRM | Import via OAuth CRM sync. History lands with provenance. Rankings become meaningful as the matured sample fills. |
| Spreadsheet only | Import via file. Same engine, same provenance. |
| Bookings already flowing elsewhere | Connect the calendar. Booked-entry leads route to closers. |

## Calls and review

- Phone calls: through the business-owned number in the dialer, recorded with consent per jurisdiction (D05), transcribed, then extracted with span citations. Native.
- Video meetings: Zoom or Google Meet recording through their own OAuth connect. The transcript feeds the same extraction. No third-party notetaker.
- Review: rep and owner see the transcript, the extracted fields, and can dispute any one. Coaching cards point at the exact span. A disputed field never moves a stage until resolved.

## What blocks a live launch

| Decision | Why it blocks |
|---|---|
| D04 providers | Auth provider, dialer number, calendar, payments. |
| D05 consent and recording | Which jurisdictions allow one-party recording; retention. |
| D06 commission | Real rates per role replace the hypothetical policy. |
| Provider app credentials | Every OAuth tile runs simulated until these exist. |

## Implementation map

| Piece | Where |
|---|---|
| Tenant creation, invites, join, roles, team code, memberships | `src/domain/onboarding.ts` |
| Profiles | `src/domain/profile.ts` |
| Empty-state rules | `src/domain/onboarding.ts` (`emptyStateFor`) |
| Screens | Sign-in and create-business, Invite sheet on owner Team, Join screen, empty states on every role home |
| Auth adapter | `src/data/auth.ts` (Supabase Auth behind an interface, simulated in the pilot) |
