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
the pinned package periodically. Raw IPv4 and IPv6 addresses are saved with visitor activity indefinitely and are
visible only through the superadmin APIs. IPs are not sent automatically to an external service. The admin Lookup link opens IPinfo for the selected address. Country is approximate and is not proof of abuse. Do not enable
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

Visitor activity and raw IP addresses have no automatic deletion or age limit.
Use `days=0` to read all collected history, or select a time period to narrow a report.
Both list and detail endpoints support all history. Queries sort before pagination
and return at most 100 visitors or detail events per request. Existing job metrics
are unchanged. The browser cookie lifetime is separate from saved history; expiry
or cookie removal does not delete records.

Collection has no retries and times out without blocking normal requests. Disable
collection by removing the website's `VISITOR_INGEST_SECRET`; saved history remains
readable. Monitor collection errors and database load after rollout.

Detail reports accept an optional validated `ip` to show requests actually recorded
from that address across browser IDs. `offset` and `eventOffset` page through visits
and account events separately; each supports column sorting before pagination.
Linked account events remain account-wide and are not claimed to come from that IP.
