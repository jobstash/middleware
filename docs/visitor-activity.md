# Visitor activity

Superadmins can read `/telemetry/visitors` and `/telemetry/visitors/:id`.
Normal accounts and anonymous requests cannot read either endpoint.

The website sends signed requests to `/telemetry/visitors/events`. Set the same
32-byte-or-longer `VISITOR_INGEST_SECRET` on the website and middleware. Never
expose it as a public environment variable. Signatures cover the exact body,
login token and timestamp. Collection requests expire after 60 seconds.

Install `scripts/sql/visitor-activity.sql` with the normal database release
credentials before deploying this module. This adds only the reusable visitor
activity table and indexes. Existing user records, relationships and activity
metrics are untouched. No case-specific data repairs are required.

Set `VISITOR_TRUSTED_IP_HEADER=x-real-ip` on the website only when its public
entry point is Traefik, untrusted forwarded headers are stripped, and the
website container has no directly published port. Leave unset elsewhere.
Country lookup uses the bundled geoip-country database on our server. Update
the pinned package periodically. No raw IP is saved or sent to an external
lookup service. Country is approximate and is not proof of abuse. Do not enable
`VISITOR_TRUSTED_COUNTRY_HEADER` for arbitrary client-supplied headers.

A signed HttpOnly cookie provides a random browser ID, expiring after 30 days.
An ID does not identify a person. Shared devices may have several accounts;
crawlers that reject cookies get new IDs. Use the protected network match to
inspect those requests together; a matching network can also be a shared VPN.
The collector resolves account identity from the verified API session, never
from a browser-supplied user ID.

Server requests include requests to dynamic website pages and APIs, including
failed attempts; they are not proof that a page rendered. Static assets,
prefetches and the presence endpoint are excluded. Requests served entirely
from an upstream cache or sent directly to a different service are outside this
view. Presence is recorded every minute only while a browser tab is visible.
Five-second anonymous job views are separate from existing signed-in job events.
Paths exclude query strings and redact profile/document subpaths.

Minute groups retain event-time sign-in state. Existing signed-in view/apply
events are joined by account and are explicitly account-wide, not attributed
to a particular browser. Do not sum repeated account counts across visitors.
Apply metrics mean apply clicks, not confirmation of a submitted application.
No historical anonymous sessions can be reconstructed from this new table.

Queries limit history to 30 days, sort before pagination and return at most 100
visitors or detail events. Each minute, cleanup deletes at most 5,000 expired
visitor rows per worker, leaving existing job metrics unchanged. Collection has
no retries and times out without blocking normal requests. Disable collection
by removing the website's `VISITOR_INGEST_SECRET`; saved rows remain readable
until their normal expiry. Monitor collection errors and database load after
rollout.
