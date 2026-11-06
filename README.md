# JobStash.xyz Middleware

This project is a NestJS server backed by PostgreSQL 18 with pgvector. It serves JobStash search, account, subscription, historical funding, and operational APIs.

Organization trial-renewal reminders run at 09:00 Europe/Berlin on the schedule owner. Only active starter subscriptions expiring on that Berlin calendar date qualify; owner email lookup happens after eligibility checks. Missing email for an eligible reminder remains reported rather than silently discarded.

## Getting Started

Welcome to the team! Let's get you situated.  
Here are the steps you need to take to get the project setup on your local development environment.

- Download and run the `nodejs` runtime for your respective os from [here](https://nodejs.org/en/download/)
- Setup `nvm` or any other Node Version Manager of your choice. [Click me to see the nvm installation docs](https://github.com/nvm-sh/nvm#installing-and-updating)
- Install the latest Node 24 LTS patch with the node version manager from the previous step (at least 24.15.0). Docker build/runtime stages use `node:24-alpine3.24`; CI also selects Node 24.
- Clone the repo by clicking that nice green button that looks like this ![github-clone-button](data:image/png;base64,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)
- Yarn is the preferred package manager for the project, you can install it with `npm i -g yarn` if you haven't already. To verify a correct installation run `yarn --version`
- Run `yarn install` in the project root directory to install all dependencies
- Run `cp .env.example .env` to setup the local env file for the project, don't worry the `.gitignore` file is already configured to ignore it. Fill it up with the appropriate info.
- Start the PostgreSQL service from the sibling `etl` repository with `docker compose --env-file /dev/null up -d postgres`. The local database is exposed on `127.0.0.1:5434`.
- Run `yarn start:dev` to start the dev server and head over to `http://localhost:8080` to access the app.
- The documentation of the api is automatically available at `http://localhost:8080/api` when the server is started

**P.S** you can change the port the server listens on by setting the `PORT` env variable. By default it's set to `8080`

### Dependency and toolchain compatibility

Use Yarn Classic 1.22.22. Runtime libraries target their current stable releases,
including Nest 12.4, Express 5, Sentry 11, TypeORM 1, and Stripe 23.
TypeScript remains on 6.0.3 because the latest Nest Swagger, ts-jest, and
TypeScript ESLint integrations do not support TypeScript 7's native compiler API.
Node type declarations intentionally follow the Node 24 runtime line.

`yarn test` first runs the full `tsc --noEmit` typecheck, then enables Node's VM
modules for Jest 30's native `require(esm)` support, including the real JOSE/Privy
dependencies. ts-jest uses its supported isolated NodeNext transformation;
typechecking remains mandatory in the separate compiler stage rather than being
disabled. The previous Babel-only JOSE transform is no longer needed.
Script-disabled installs must still run
`yarn patch-package --error-on-fail` to apply the Zod v3 and deepmerge backports.
deepmerge is now also a SendGrid production dependency, so its patch is no longer
development-only. Do not discard these patches because a version-only scanner
still reports their unchanged upstream versions.

Alpine installations must build bcrypt inside the container, not reuse macOS
`node_modules`: install `python3 make g++`, then run
`npm rebuild bcrypt --build-from-source --foreground-scripts` after the
script-disabled Yarn install and explicit patch step. The Dockerfile performs
this for both development/build dependencies and the production-only reinstall.

iron-session 9 uses `getIronSession` instead of the removed Express adapter.
An offline regression using the actual 6.3.1 Express adapter confirms its saved
cookies remain readable by v9 with the same password/options. Do not assume
blanket reauthentication from the package major alone. Bearer-token
authentication and its server-backed permissions remain independent.

The Sentry SDK upgrade preserves the deployed integer-parsing sampling policy:
fractional configuration values remain effectively zero, zero stays disabled,
and one stays enabled. Enabling fractional collection requires a separate
explicit policy decision. SDK 11's new automatic LangChain instrumentation must
not collect recommendation/document inputs or outputs; both GenAI content flags
are explicitly disabled while the existing user/cookie policy is preserved.

Every scorer HTTPS client now verifies the server certificate before sending
`SCORER_API_KEY`. The configured scorer certificate must chain to the platform
trust store and match its hostname. Deployments using a private certificate
authority must configure Node's supported trust mechanism, such as
`NODE_EXTRA_CA_CERTS=/path/to/ca.pem` **at process startup**; do not disable
certificate verification. The local TLS regression exercises all seven actual
client factories against trusted and untrusted synthetic servers. It generates
short-lived fixture certificates with the `openssl` command and removes them
after the test.


## Tech Stack

- NestJS for the main server (REST style)
- PostgreSQL 18 and pgvector
- TypeORM for entity persistence and parameterized SQL for graph/search workloads
- PassportJS for auth/oauth
- Swagger for documentation
- Prettier for code formatting

## Employer classification job filters

`GET /jobs/list` and `GET /jobs/feed` accept `organizationClassifications` as a
comma-separated string or repeated query parameter. Values are combined with OR;
this filter is combined with all other job filters using AND. For example:
`/jobs/list?organizationClassifications=ai,crypto&classifications=engineering`.
The existing `classifications` parameter remains the job-role filter.

`GET /jobs/filters` publishes every canonical choice under
`organizationClassifications.options`, including choices with no current jobs:
`ai` (AI), `crypto` (Crypto), `fintech` (Fintech), `robotics` (Robotics),
`banking` (Banking), `tech` (Web2), `out_of_scope` (Out of scope), and
`unclassified` (Unclassified). Web2 is a display label, not a new stored value.
Unknown values receive the standard query validation error.

Filtering reads the existing `vertical` property of the actual projected
Organization or Project employer through its corresponding search document.
It does not inherit another entity's classification from a shared profile,
infer classifications from job titles, or treat a missing classification as
`unclassified`. Selection happens before results, group counts, and pagination;
multiple selections never duplicate jobs. No schema migration or classification
backfill is required.

## Agency partners and job alerts

Manually approved partner agencies receive job alerts, available placement
bounties, the GitHub candidate checker, and the opted-in talent pool at no charge.
Approval uses the existing `access_workspaces.alerts_enabled` flag; it never sets
`entitlement_enabled`, creates a Stripe subscription, changes the $299 paid Agency
contract, or grants a Recruiters.rip candidate subscription.

### Install and operate

Apply `scripts/sql/agency-alerts.sql` to the existing graph/search/workspace
database before deploying this middleware revision. The migration is
idempotent and takes a write-blocking lock on `graph_nodes` and
`job_search_documents` while baselining **all existing StructuredJobpost
identities**, including offline/unprojected jobs, and installing the publication
trigger. Schedule this brief lock appropriately; do not remove or clear the
publication ledger on projection rebuilds or deployments. The trigger runs with
the projection writer's permissions; the migration grants the existing
`jobstash_app` role publication access. Any different ETL writer role also needs
`INSERT` on `agency_alert_publications`.

Existing configuration is reused: `EMAIL`, `SENDGRID_API_KEY`, `FE_DOMAIN`,
`MW_DOMAIN`, `ORG_ADMIN_DOMAIN`, and `JWT_SECRET`. Set `ORG_ADMIN_DOMAIN` to
`https://admin.jobstash.xyz`; `MW_DOMAIN` must be the externally reachable
middleware origin for email unsubscribe links. No new billing/environment
toggle is required. Delivery runs each minute only when
`ENVIRONMENT=production` and `MIDDLEWARE_SCHEDULE_OWNER=1`. Keep the existing
single-owner process convention; committed database claims also prevent
duplicate role sends across simultaneous workers.

### Approval, personal follows, and stopping

Only a current `SUPER_ADMIN` can use `GET/POST /agency-alerts/admin/workspaces`.
Provisioning takes `{primaryProfileId, ownerUserId, domain}` and validates an
existing nonbanned EntityProfile and an existing account wallet. It creates or
reuses the matching workspace, records the approving administrator/time, and
does not infer agency status from a classifier. A profile/domain owned by a
different workspace cannot be reassigned through this endpoint.
`POST /agency-alerts/admin/workspaces/:workspaceId/approval` with
`{enabled:false}` revokes approval; `{enabled:true}` approves a workspace with an
available, nonbanned profile. Stripe billing status does not gate free Alert.
The admin member/remove-member POST endpoints accept existing account wallets
only, cannot replace/remove the owner, and are independent of paid access.

`requireAgencyAccess` authorizes the existing bounty-opportunities, available/top
talent, opted-in candidate-report, and GitHub candidate-report APIs for current
workspace members with either manual partner approval or active paid Agency
entitlement. Revoking approval removes free access immediately; an independent
active paid entitlement still grants the paid products. Removing membership denies
both paths. JWT permissions are refreshed from the account, not trusted as a way to
claim employer or administrator access.

The separate private-profile inspection/contact-reveal endpoints remain paid-only,
with their existing member-role restrictions. Agency product access does not grant
employer organization management, employer shortlists, or platform administration.

Members read `GET /access-workspaces/:workspaceId/alerts`, search
`GET .../alerts/organizations?q=...`, and use POST `.../alerts/follows` or
`.../alerts/unfollow` with `{organizationId}`. POST `.../alerts/unsubscribe`
removes all of that member's follows in that workspace. Read/stop controls remain
available after approval is revoked; search/follow require current approval.
Follows are personal, not a workspace-wide mailing list. No endpoint accepts a
recipient email or another member's identity. The recipient is the current
account's verified `UserEmail`; Privy email linking followed by check-wallet
refresh uses the existing verification sync. Missing email is reported as
`emailAvailable:false`. Changing/removing the selected email pauses existing
follows instead of silently redirecting them; explicitly unfollow/re-follow to
subscribe with the current verified email.

Email links offer a confirmation GET and signed POST unsubscribe; GET never
changes preferences. One-click unsubscribe headers use that same POST endpoint.
Unsubscribing never changes candidate email preferences or other members' follows.
Membership deletion cascades personal follows, and delivery rechecks membership,
nonbanned agency profile, whitelist approval, exact verified recipient, organization
ownership, and current public-role visibility immediately before sending.
Already handed-off messages cannot be recalled.

### Publication and delivery guarantees

The trigger records each stable `shortUUID` only once, when its projection first
has public organization-owned visibility: online, not blocked, list-eligible,
tagged, public access, no direct Project owner, and no expert-organization
suppression. Direct Project jobs are not assigned to an inferred organization.
The effective first-public time is the later of discovery and the initial
publication timestamp; future-dated candidates become due without a catalogue
poll. A follow made after discovery but before that future publication is
eligible. Ordinary edits, reopening, retries, and projection reconstruction do
not generate another event. Follow/re-follow never backfills earlier public
roles. Roles withdrawn, reassigned, or no longer public at their delivery
recheck are skipped; an already consumed identity is not resent if reopened.

Each minute processes at most 20 organization/recipient batches of at most 50
roles, queried from indexed publication events. Normally delivery is attempted
on the next minute tick after JobStash discovers the public role, not immediately
when an external employer publishes it. Backlog, ETL delay, and provider delay can
extend that time. First-public timestamps are fixed and are not rewritten by
later metadata edits.

A delivery claim is committed before calling the existing SendGrid MailService.
It is never automatically reopened after a crash, timeout, or provider error:
an ambiguous provider response may already represent acceptance. This prevents
unconditional duplicate resends but can lose an alert on a pre-send crash or
failed attempt. `agency_alert_deliveries.status` distinguishes `claimed`,
`accepted`, `skipped`, and `failed_unknown`; `accepted` means provider acceptance,
not inbox receipt. Investigate failed/stale claims without blindly replaying
them. Existing SendGrid unsubscribe/suppression handling is not bypassed.

### Controlled verification

Run the Alert service/controller tests and the real-SQL
`agency-alerts.integration.spec.ts` with `AGENCY_ALERTS_TEST_DATABASE_URL` pointing
to a **disposable localhost database whose name includes `test`**. The fixture
isolates its schema and covers migration baseline/reapply, future publication,
deduplication across two workers, late commits, recipient changes, whitelist
revocation, removed members, and personal unsubscribe. It also exercises the real
HTTP authorization and PostgreSQL membership checks for approved/unpaid and paid
agency products, revocation with the same JWT, outsiders, forged permissions, and
private-profile/employer/admin boundaries. Bounty reads use actual SQL; candidate
payload retrieval is isolated at the service boundary. No integration fixture sends
email.

For an authorized, single-recipient staging smoke: sign in as a superadmin,
approve an existing test agency profile and test account; sign in as that
account, verify its email, follow a test organization, and publish two genuinely
new public test roles through the normal ingestion path. Observe one claimed
organization batch and provider acceptance, then independently check the
controlled inbox. Edit/reopen those roles and confirm no additional attempt.
Unfollow or revoke approval before another new role to confirm no send. Do not
backfill existing customer follows or email real customers for verification.

## Versioning & Deployment

Production changes are deployed from reviewed pushes to `main`. The existing
Coolify integration observes `main` and automatically builds the selected
revision; this repository does not create releases, tags, or deployment
identities.

## IMPORTANT

- Make sure to update the `.env.example` file anytime you add new env vars to the project
- Please address linter warnings before pushing the code to the remote repo, all linter warnings will be treated as errors and will cause the checks to fail with errors.
- Remember to update the readme if any changes are made.

## PostgreSQL Verification

```bash
yarn build
export DATABASE_TEST_URL='<postgresql-test-url>'
yarn test:postgres
export DATABASE_URL='<populated-postgresql-url>'
yarn db:validate:postgres
yarn db:benchmark:postgres
```

The benchmark enforces a 750 ms p95 and execution-time ceiling against the populated local search projections. The complete migration and cutover runbook is in `../etl/docs/postgresql-cutover.md`.

Top-job ranking aggregates the recent activity window before limiting and
hydrating job payloads; fuzzy tag matching shares job counts across canonical
matches. Install ETL release migration `264_runtime_query_performance` for the
matching tag trigram indexes and fund-analytics refresh optimization. Neither
query deadlines nor the 200-fund scheduler batch are increased.

Execute the query regressions against a disposable localhost database without
loading production credentials:

```bash
DOTENV_CONFIG_PATH=/dev/null \
RECOMMENDATIONS_TEST_DATABASE_URL=postgresql://jobstash@127.0.0.1:5434/jobstash_test \
yarn test --runInBand \
  src/postgres/job-activity.integration.spec.ts \
  src/postgres/tag.repository.integration.spec.ts \
  src/postgres/sql/job-employer-payload.integration.spec.ts
```

These tests execute the actual SQL with synthetic activity, tag aliases, and
work-arrangement payloads, including repeated applicants, future/old activity,
organization scope, blocked tags, and zero-job matches.
These are isolated fixture regressions, not a production latency guarantee.

### Sentry response-contract regression gate

Use an isolated, migrated fixture database. These suites reset their fixtures
and must never target production or a database shared with another run. Set
both `DATABASE_TEST_URL` and `RECOMMENDATIONS_TEST_DATABASE_URL` to that local
database, then run with the Node 24 dependency graph:

```bash
DOTENV_CONFIG_PATH=/dev/null RUN_POSTGRES_INTEGRATION=1 yarn test --runInBand \
  --testPathPatterns='response-contracts.entity.spec|subscriptions.service.spec|search-document.repository|tags.service.integration|tag.repository|job-employer-payload' \
  --testNamePattern='Sentry response|subscription renewal|^TagRepository|^TagsService|^job Work|^SearchDocumentRepository (?!PostgreSQL)|MIDDLEWARE-29B'
```

This gate covers strict tag hydration (unknown timestamps become null; zero and
valid numbers survive; malformed/non-finite values are rejected), project text
and organization location defaults, contextual work-arrangement options, and
renewal eligibility. The DoubleZero Edge fixture runs through real public
project-detail HTTP routes, services, and the PostgreSQL repository by ID and
slug. The full search/filter matrix needs the complete deployed migration chain.

## Support

To discuss problems, shoot a message to the `#discuss-problems` channel on Slack

## Threat-intelligence permission

`THREAT_INTEL` gates org-admin's read-only observatory. Only a `SUPER_ADMIN`
may list, grant, or revoke it through `GET`, `PUT`, and `DELETE`
`/users/threat-intel-access`. These routes manage access only; threat source,
signals, and analyst state are not stored in middleware.

## Recruiters companion release

The additive companion surface uses the existing account JWT, PostgreSQL job
projections and production Stripe merchant. Existing organization/agency routes
and billing products remain unchanged. Private CVs, evidence, scores, drafts,
provider credentials and inference payloads remain local.

Release order:

1. Apply `scripts/sql/companion.sql` using the normal schema-release credentials,
   after the graph/search schema. The transaction is repeatable and creates only
   `candidate_devices`, `candidate_device_nonces`, `candidate_subscriptions` and
   `candidate_payment_events`, with account foreign keys and application grants.
   No fixture memberships, account rewrites or data repairs are needed.
   Before enabling monthly/yearly checkout, also apply
   `scripts/sql/companion-billing-intervals.sql`. It adds billing-interval and
   verified-discount metadata without resetting existing paid periods.
2. Reuse `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET`. Set
   `STRIPE_CANDIDATE_PRICE_ID` to the active live USD 999-cent monthly price and
   `STRIPE_CANDIDATE_YEARLY_PRICE_ID` to the active live USD 9590-cent yearly price
   (20% off twelve months, rounded to cents), interval count one, without trials.
   Use separate candidate products for the two prices so first-month discounts
   cannot waive a yearly invoice. Keep organization/agency products intact.
   `RECRUITERS_PUBLIC_ORIGIN` remains `https://recruiters.rip`, independent of
   `ORG_ADMIN_DOMAIN`. The website belongs to `recruiters-rip-frontend`; the app
   belongs to `recruiters-rip-companion`. No new merchant or frontend secret is introduced.
3. Keep the verified webhook at `POST /stripe/webhook`. Enable checkout session
   completed/expired/asynchronous success/failure, invoice payment success/failure,
   and customer subscription created/updated/deleted events on that same endpoint.
   Candidate events are reconciled from Stripe live state; foreign charges are
   never assigned from webhook metadata. Duplicate events are transactionally
   ignored. Missing webhooks recover on status and signed data reads.
4. Deploy middleware and the additive recruiters frontend. The return URL is
   `/onboarding/membership/return`; checkout is restricted to
   `https://checkout.stripe.com`. The account holder completes real checkout;
   deployment must not create a payment or grant access on their behalf.

Authenticated `GET /profile/subscription` returns `{advanced,price,prices,subscription}`,
including monthly/yearly offers and the subscription's verified interval, provider
and percentage discount/end date. `POST /profile/subscription/checkout` accepts
exactly `{requestId,interval:"month"|"year"}` and returns `{checkoutUrl}`. UUID
request IDs make checkout creation idempotent at Stripe. Promotion codes are
entered in Stripe checkout; a provider-confirmed active subscription with a
paid zero-total invoice qualifies for access just like a paid full-price invoice.
`POST /profile/subscription/cancel` accepts only `{requestId}` and schedules
`cancel_at_period_end:true` on the authenticated candidate's verified Stripe
agreement. It returns `{cancelAtPeriodEnd:true,paidUntil,cancelledAt}` only after
Stripe confirms scheduling without changing the paid period. Current paid access
continues until that period ends; devices and private local records are not revoked.
Cancellation requests bind to their original checkout in the existing
`candidate_payment_events` ledger (`cancellation.requested`), so retries cannot
cancel a replacement agreement. Cancellation itself needs no additional secret.
Billing lifecycle is separate from paid access: recoverable `past_due`, `unpaid`,
paused and incomplete Stripe agreements block a second checkout. Account holders
can recover payment through their existing Stripe invoice link or explicitly
cancel renewal from account settings; middleware never cancels it automatically.
Only expired checkout sessions and canceled/incomplete-expired subscriptions are
terminal. The idempotent schema also adds `billing_state` to existing metadata;
old rows start unresolved and must be provider-verified before replacement.
Terminal history is excluded from refresh. Concurrent owner reads share only
in-flight refresh work; completed results are not cached. Relevant agreement
reads retain row-lock ordering against webhook writes.
Pairing uses `GET /profile/devices`, `POST /profile/devices/pair` with
`{requestId,deviceId,publicKey,label}`, and `POST /profile/devices/:id/revoke`
with `{requestId}`. Keys are Ed25519 SPKI DER encoded as 59-character base64url.
The pairing reply is `{deviceId,challenge,expiresAt,account:{id,label}}`; the
native app must explicitly approve that account and sign activation.
The `/privy/check-wallet` response includes `privyDid` from the guard-verified
Privy user, so the frontend can seal the backend session to the displayed identity.

`POST /device/activate`, `/device/heartbeat` and `/device/platform` accept only
the Ed25519 raw-body protocol (`x-device-id`, `x-device-time`, `x-device-nonce`,
`x-device-signature`), with no cookie/bearer/query transport. Requests expire after
30 seconds; nonces cannot be replayed. Request bodies are limited to 16 KiB and
platform responses to 8 MiB. Oversized originals are rejected, never truncated.
Platform operations are `status`, `matching_catalogue`, `matching_jobs` (at most
ten canonical IDs), `job_read` and `intro_paths`.
`matching_catalogue` requires `{publicationRange,since,until,offset?,countOnly?}`.
Ranges are `today`, `yesterday`, `past_3_days`, `past_week`, `past_2_weeks`,
`past_month` and `all`; the companion defaults to `past_3_days`. Bounds are
validated UTC timestamps, inclusive `since` and exclusive `until`; only `all`
uses `since:null`. Returns are `{total,jobs,nextOffset,publicationWindow}` with
the exact requested bounds. Count-only requests return the SQL count without
job metadata. Fixed 1,000-row transport pages exhaust the selected scope using
`nextOffset`; there is no total job-count cap or hidden catalogue-age cutoff.
Count and page share one SQL statement snapshot, ordered newest first with
canonical-ID tie breaking. Catalogue and `matching_jobs` rows carry the same
advertised terms: `salary`, `city`, `location`, `workMode`, `publishedAt`,
`applyUrl` plus the raw payload strings `seniority` (JobStash code `1`–`5`),
`commitment` and `classification`; blank or missing values are `null` and the
companion maps them to display labels. Explicit canonical reads retain
previously selected full originals and role location evidence even when they
age out of the scope.
Run `COMPANION_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/companion_test yarn test --runInBand src/companion`
against a disposable local test database for publication-boundary and
100,001-job paging integration coverage.

Raw data requires an owned active device and a live paid subscription before and
after reads. A historical payment, test-mode object, trial, pending invoice,
expired membership or revoked device cannot authorize it. Provider failures fail
closed; they never extend a cached entitlement. Status remains available without
paid access. Parent release gates should include build, route manifest tests,
`src/companion` boundary tests, schema application review and the user-completed
live checkout/return/pairing flow.

`status.github` reports the Privy-synchronized linked GitHub username, or null.
`intro_paths` accepts `{source?,targets}` where each endpoint is
`{login,kind:"user"|"organization"}` and `targets` contains 1–20 entries.
GitHub logins are validated strictly, lowercased and deduplicated by kind/login.
An explicit source queries any GitHub person or organization without requiring
the account to link GitHub. Omitting it uses the signed owner's linked GitHub
user; a missing link returns `reason:"github_required"` without blocking other
operations. Introductions do not depend on jobs, catalogue IDs, employer
availability or publication windows. The active signed device and live paid
membership checks remain required.

The response contains `{source,available,asOf,inferred:true,coverage,targets}`.
`coverage.source` distinguishes `indexed`, `not_indexed` and `unavailable`;
`coverage.maxHops` is 2. Each target has `status` (`ok`, `no_paths`,
`source_not_indexed`, `target_not_indexed` or `unavailable`) and `paths`.
Missing coverage or an unavailable scorer must not be presented as no connections.
Paths retain their source person, target person, intermediary, edges and scores;
organization endpoints include dated contribution evidence. A shared contributor
can produce a zero-hop `same-person` path with no fabricated relationship score.
Contributions are evidence, not proof of employment or personal acquaintance.
No CV or work-history sharing is involved.

For isolated signed-HTTP regression coverage, set `COMPANION_TEST_DATABASE_URL`
to a disposable localhost database whose name contains `test`, then run
`yarn test --runInBand src/companion/intro-paths.integration.spec.ts`.
The suite creates and removes its own schema, uses synthetic accounts and mocked
scorer responses, and exercises the real device signature and ownership boundary.

### Candidate partner promotion codes

Use `scripts/candidate-stripe-offers.ts` with the existing `STRIPE_API_KEY`.
The script changes only dedicated candidate products, prices and discounts:

```sh
# Create/reuse the candidate products and emit the two price environment values.
node -r ts-node/register scripts/candidate-stripe-offers.ts setup --execute

# Reusable forever-free code for any customer, monthly or yearly.
node -r ts-node/register scripts/candidate-stripe-offers.ts promo \
  --shared --duration forever --percent-off 100 --request-id "$REQUEST_ID" \
  --code "$PARTNER_CODE" --execute

# Reusable 70% off the first monthly invoice, then ordinary monthly renewal.
node -r ts-node/register scripts/candidate-stripe-offers.ts promo \
  --shared --duration month --percent-off 70 --request-id "$REQUEST_ID" \
  --code "$FIRST_MONTH_CODE" --execute
```

Use a different UUID for each offer; retain that UUID and exact arguments for
safe retries. `--help` needs no credentials and makes no requests. `--execute`
is explicit authorization to write real Stripe configuration; tests use synthetic
transports and never create charges or subscriptions.

Shared codes have no customer or total-redemption restriction: anyone holding
one can redeem it. Distribute them privately and deactivate the promotion in
Stripe if it leaks. `forever` discounts subscription renewals while the agreement
remains in effect; `month` uses Stripe's `once` duration. Finite discounts are
restricted to the monthly product; forever offers cover both candidate products.
Stripe coupon `applies_to` must be explicitly expanded when verifying scope.

For a single selected customer instead, use `--customer cus_ID` instead of
`--shared`; that customer must carry the script's candidate-purpose and owner
metadata and the offer is redeemable once. `--duration months --months N` supports
a chosen number of free monthly payments. `--expires-at UNIX_SECONDS` limits the
redemption window, not the length of the discount.

