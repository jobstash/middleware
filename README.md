# JobStash.xyz Middleware

This project is a NestJS server backed by PostgreSQL 18 with pgvector. It serves JobStash search, account, subscription, historical funding, and operational APIs.

## Recruiters direct-app MCP

The recruiters.rip candidate product now uses the official ChatGPT/Claude apps for conversation and inference. Its local MCP companion stores new private career data, exposes profile/evidence/application tools and reuses the existing document codec and PDF renderer. It does not hold provider credentials or call an inference API.

`POST /device/platform` is an Ed25519-signed, paired-device read-only bridge. Its strict operations are `status`, `search_jobs`, `job_read`, `matching_catalogue`, `matching_jobs`, `legacy_sources`, `legacy_source_read`, `legacy_career`, `legacy_applications` and `legacy_application_read`. Requests are bounded to 16 KiB; responses to 8 MiB. Status needs an active owned device; other reads retain the current paid candidate membership requirement. Ownership/device authority is checked before and after access, and original downloads retain their integrity checks. This route accepts no private career writes, CV/profile data, provider keys or caller-supplied network destinations.

`matching_catalogue` requires `{ publicationRange, since, until, offset?, countOnly? }`. The range is one of `today`, `yesterday`, `past_3_days`, `past_week`, `past_2_weeks`, `past_month`, `all`. Companion supplies explicit ISO UTC `Z` timestamps: its local calendar determines Today/Yesterday boundaries, and the other finite presets use rolling 3/7/14/30-day windows. The SQL interval is inclusive `since`, exclusive `until`; finite ranges require valid ordered bounds, and only `all` uses `since: null`. No server rolling cutoff clips month/all results.

The response is `{ total, jobs, nextOffset, publicationWindow: { range, since, until } }`. `total` is an exact SQL count of the selected currently online, non-blocked catalogue, independent of page size and personal search exclusions. `countOnly: true` returns no metadata (`jobs: []`, `nextOffset: null`). Normal reads return at most 1,000 metadata rows per transport page, ordered by descending publication timestamp then canonical node ID using the C collation; continue with `nextOffset` until null, retaining the same bounds. There is no total-job cap or arbitrary maximum offset. Each page count and metadata read share one SQL statement snapshot; the catalogue remains live between requests. Oversized pages fail explicitly with `matching_capacity_exceeded`; no data is silently truncated.

`matching_jobs` accepts distinct canonical `node:<positive bigint>` IDs in protocol batches of at most ten, returning complete original advertisements and role-location evidence with `remainingIds`/`unavailableIds`. This transport batch size is not a coverage cap. Currently online, non-blocked older jobs remain available through matching batches and canonical `job_read`, regardless of publication age; public aliases retain normal search visibility and ambiguity checks.

The local launcher sets `RECRUITERS_LOCAL_MCP=true`: new legacy conversation, parse, screening/resume and research inference requests return `local_mcp_required`, while saved records, cancellation and recovery reads remain. Platform provider egress remains denied. Existing records are not deleted or represented as newly synchronized local records.

Current installation, custody, tool workflow and verification instructions are in [`recruiters.rip/README.md`](../recruiters.rip/README.md). The older device-execution and queue APIs documented below remain historical/shared service contracts, not the primary recruiters.rip inference route.


## Getting Started

Welcome to the team! Let's get you situated.  
Here are the steps you need to take to get the project setup on your local development environment.

- Download and run the `nodejs` runtime for your respective os from [here](https://nodejs.org/en/download/)
- Setup `nvm` or any other Node Version Manager of your choice. [Click me to see the nvm installation docs](https://github.com/nvm-sh/nvm#installing-and-updating)
- Install Node 22 LTS with the node version manager from the previous step. The supported range is recorded in `package.json`.
- Clone the repo by clicking that nice green button that looks like this ![github-clone-button](data:image/png;base64,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)
- Yarn is the preferred package manager for the project, you can install it with `npm i -g yarn` if you haven't already. To verify a correct installation run `yarn --version`
- Run `yarn install` in the project root directory to install all dependencies
- Run `cp .env.example .env` to setup the local env file for the project, don't worry the `.gitignore` file is already configured to ignore it. Fill it up with the appropriate info.
- Start the PostgreSQL service from the sibling `etl` repository with `docker compose --env-file /dev/null up -d postgres`. The local database is exposed on `127.0.0.1:5434`.
- Run `yarn start:dev` to start the dev server and head over to `http://localhost:8080` to access the app.
- The documentation of the api is automatically available at `http://localhost:8080/api` when the server is started

**P.S** you can change the port the server listens on by setting the `PORT` env variable. By default it's set to `8080`

## Tech Stack

- NestJS for the main server (REST style)
- PostgreSQL 18 and pgvector
- TypeORM for entity persistence and parameterized SQL for graph/search workloads
- PassportJS for auth/oauth
- Swagger for documentation
- Prettier for code formatting

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

## Support

To discuss problems, shoot a message to the `#discuss-problems` channel on Slack

## Threat-intelligence permission

`THREAT_INTEL` gates org-admin's read-only observatory. Only a `SUPER_ADMIN`
may list, grant, or revoke it through `GET`, `PUT`, and `DELETE`
`/users/threat-intel-access`. These routes manage access only; threat source,
signals, and analyst state are not stored in middleware.

## Device-owned candidate inference

Candidate provider execution belongs to the installed `recruiters.rip/companion`.
The server worker, its shared-bearer `/internal/career-agent` routes, credential
collector, Docker bootstrap and egress deployment have been removed. There is no
server provider-login, credential-validation or inference fallback.

The companion performs provider sign-in, model discovery, structured extraction
and tool-using inference on the candidate's device. The website and middleware
receive connection metadata and bounded task results; provider credentials stay
in the companion's local credential store. Pairing and signed `/device/*` requests
bind execution to an owned device. Middleware retains the durable queue,
source/generation pins, entitlement checks, tool authorization and domain validation.

Queued work needs an online, unlocked, locally authorized companion. Closing a
product tab does not itself cancel work; an unavailable device cannot advance
provider execution. Saved source documents, drafts and results remain owned records.
Device-reported model and usage metadata are not provider attestations.

Provider transport and parser checks belong to the companion test boundary.
Historical container proofs do not establish acceptance of device execution.

## Candidate connection metadata

Provider keys and OAuth credentials are entered only in the companion's local UI.
The former `/profile/ai-connections/api`, hosted sign-in/completion and server
credential-copy paths are retired. Connection/model APIs expose sanitized metadata.

Switching reasoning providers requires disconnecting the previous connection.
Creating a session with `continueFromSessionId` carries bounded owned visible
conversation history and current career context to the new provider. An optional
owned `sourceDocumentId` restricts that continuation context; old sessions remain
readable. Native reasoning packets are excluded.

Speech uses a separately configured local OpenAI connection. The companion owns
its provider authentication; the backend retains only device-bound metadata.
Disconnecting a product connection preserves saved work and does not revoke the
provider-issued credential at the vendor.

## Shared candidate capabilities

`GET /profile/candidate/access`, `GET /profile/candidate/capabilities` and
`POST /profile/candidate/invoke` expose the candidate operation registry to
authenticated users. The invocation body is `{name,arguments}`; owner, worker
lease and OAuth grant context are constructed by server adapters.

The repository rechecks live authority and paid entitlement under the canonical
owner transaction before receipt replay and commit. Receipt hashes bind channel,
operation and originating grant. Worker calls retain request freshness and
source-document restrictions. External apps can start hosted work but cannot
confirm CV facts or accept application wording.

`recommendations_refresh` starts or reuses original-CV/original-ad assessments
using the candidate's selected provider and explicit location/relocation choices.
`recommendations_results` returns a backend-ranked saved shortlist (three by
default, at most twenty), with evidence, gaps, employer unknowns and source/profile
version context. It applies current eligibility exclusions before pagination.
Result polling does not initiate inference; saved results remain recovery-readable.
Source/profile changes pause unfinished work and remain disclosed on old results.

Apply `scripts/sql/candidate-capabilities.sql` after the provider and MCP schemas.
`node dev/career/migrate-candidate-capabilities.mjs` is the guarded local additive
entrypoint. Setup/review intents expire after fifteen minutes, require the same
account and live originating grant, and never grant authority through their ID.
Checkout accepts only the optional `returnTarget: \"recruiters\"`; URLs are resolved
from server configuration and pending charges are reused only for that target.

## Local execution boundary

Infrastructure and stored candidate data remain local. ClickHouse and the user's
explicitly authorized OpenAI/Anthropic reasoning providers are external exceptions.
Do not deploy, modify production data/configuration, move domains or create public
tunnels. Product authentication and payment remain simulated; voice retains its
separate local-only gate.

Candidate documents require explicit `CAREER_DOCUMENT_STORAGE=local`,
`NODE_ENV=development` or `test`, and an absolute private
`CAREER_DOCUMENT_LOCAL_DIRECTORY`. The local store uses owned directories with
0700 permissions, files with 0600 permissions, atomic writes and verified owner/hash
metadata. Remote object storage is rejected in local environments even when R2
credentials are present. Keep `CAREER_DOCUMENT_ID_KEY` stable and private.

Apply `scripts/sql/candidate-documents.sql` after candidate capabilities, using
`node dev/career/migrate-candidate-documents.mjs` for the guarded local snapshot.
The shared PDF/DOCX pipeline preserves originals before inference, enforces five
pages and 5 MiB source limits, validates bounded DOCX decompression and renders
scanned PDFs into bounded PNG pages. Grounded career evidence is usable immediately.
New and cached parses automatically synchronize missing residence/location,
work authorization and sponsorship through the canonical profile services.
`source_profile_sync({documentId,requestId,revision})` applies the same guarded
merge to an existing owned parse without inference or a provider connection. It
returns `{documentId,status:"ready"|"needs_parse",appliedFields,preservedFields}`.
The merge revalidates source hashes and exact text grounding, serializes with
manual edits, preserves conflicting values and intentional clears, and leaves
revision/timestamps unchanged for identical facts. Legacy coarse manual-edit
receipts conservatively protect nullable fields. Relocation, availability,
salary and other preferences are never inferred by synchronization.
The capability requires session/OAuth write authority but is recovery-entitled;
callers reread career state afterward. `source_parse` no longer returns an
approval-oriented `suggestions` payload. Downloads require current account/grant
authority and private attachment headers.

### Restore the complete local database for recruiters.rip

Run `node dev/career/restore-recruiters-database.mjs` from `middleware/` to stage
`recruiters_rip_local_full` from the existing backup-restored `jobstash` database.
The exported `restoreRecruitersDatabase(targetName)` also permits the canonical
`recruiters_rip_local` name for a new, absent database during initial preparation.
Only these two target names and the source `127.0.0.1:55480/jobstash` are accepted;
credentials are read privately from `dev/career/.local/database.env`. Docker's
existing `jobstash-career-postgres` container supplies matching PostgreSQL tools.

The restore copies every source schema, table, identity, graph, job ad, taxonomy,
vector and historical career record into an isolated target before checking
snapshot counts. Device migrations then retire provider-secret columns and stale
execution state. Connection IDs, owners, source files and publication dates remain.
The source transaction and `pg_dump` are read-only. No source connections are terminated, and no production
connections, database drops, runtime configuration changes or database renames
are performed.

The script verifies capacity for the clone, a bounded compressed archive and a
10 GiB reserve. The local source dump streams directly through `pg_restore` into
one target transaction with constraints enabled; it is never retained as a new
credential-bearing archive. The startup SQL search path includes `public` for
historical CHECK helpers. After the candidate/document/screening/browser schemas,
apply `candidate-device-execution.sql`, then `candidate-voice.sql`.

Before handoff, provider ciphertext and credential-lease columns must be absent.
Connection ID/owner digests are checked without reading provider ciphertext.
Legacy generations may advance and all copied connections are disconnected.
Agent/screening/voice/parse work is quarantined; imported devices are revoked and
browser runs cancelled while retaining submission receipts. Only after these
checks does the local-source path write a full sanitized target archive and its
SHA-256. Archive-file imports leave the supplied original file unchanged; that
historical input can still contain ciphertext. Neither path claims erasure of
historical backups, database pages or WAL.

The private `.local/<target>-restore.json` records provenance, counts, sequence
state, metadata preservation and secret retirement separately. A matching
completed device-only restore receipt makes repeat calls a read-only no-op.
Unrelated, failed or partially populated targets are rejected without removal;
there is no raw-archive retry path. Failure receipts do not authorize runtime
handoff.

Staging does not switch the runtime. `preserve-recruiters-state.mjs` imports
owned accounts, CVs, documents and historical connection IDs with owner remapping.
It never selects, decrypts, reseals or imports provider credentials. Protected
screening metadata alone is resealed against remapped owner/document/job bindings.
Explicit local setup (`configure.mjs` or `prepare-recruiters.mjs`) migrates the old
data-protection key to `CAREER_DATA_PROTECTION_KEY` and removes credential/worker
configuration; runtime code has no old-key fallback. Retire the source database's
provider-secret columns before preservation when planning activation: activation
requires both source and target sanitized before retaining the prior database.
Original publication dates remain the backup's dates.

## Candidate MCP scopes

OAuth now supports `data:read`, `account:read`, `account:write`, `career:read` and
`career:write`. Grants retain their exact consented scope set across refresh.
Unknown scopes and refresh escalation are rejected. Identity verification requires
a valid grant; membership is enforced by each operation. Unpaid account status,
checkout/setup links and recovery operations remain reachable.

The original public search/research tools retain their configured metering.
Candidate tools use the shared registry and do not consume public-search units.
Insufficient scope produces a sanitized OAuth challenge distinct from membership
or provider prerequisites. The remote MCP service uses the official SDK transport
and reconstructs challenges using configured resource metadata.

The downloadable candidate workflow is in
`../recruiters.rip/skills/recruiters-rip/SKILL.md`, served by the new frontend at
`/skill`. It directs clients to backend recommendations, secure setup links and
human evidence/application review. Credentials never belong in skill/tool input.

## Candidate introductions

Apply `scripts/sql/candidate-introductions.sql` after the full workflow and
capability schemas; the guarded local entrypoint is
`node dev/career/migrate-candidate-introductions.mjs`.
`network_recommendations` returns at most three verified-root suggestions,
containing only the first public contact and qualified evidence/path summaries.
Suggestion IDs are owner/target/evidence-bound HMACs. Cached results reapply
suppression; warehouse failure remains unavailable.

Worker-only `introduction_save` persists a curated suggestion and message draft.
Session-only `introduction_update` edits an existing exact revision.
`introduction_read` and `introduction_list` recover owned drafts and recheck
current suggestion visibility. Suppressed evidence is redacted. Drafts are never
sent automatically. Candidate tools no longer expose `network_paths`; existing
authorized JobStash HTTP network consumers retain their separate contracts.

## Voice lifecycle

The companion creates and authenticates provider speech sessions and owns the
sideband. Browser SDP, mute, heartbeat and stop operations use the native companion
bridge. Signed device events carry normalized transcripts and delegation metadata
to middleware; provider credentials and transport identifiers remain device-local.
Transcript fragments do not start work. Unique delegation IDs schedule the owned
career queue for execution on the same authorized device.

Heartbeat and end routes are owner-only. Heartbeat loss, entitlement expiry,
credential generation changes and shutdown close the call. End voice preserves
already scheduled work; explicit Stop work cancels the returned owned request IDs.
Final usage is complete only when `session.closed` supplies it. A failed or
ambiguous start is never silently retried into another billed call.

The device-execution migration retires server speech credential custody.
`LOCAL_ONLY=true` rejects voice availability/start before external transport or
microphone use. Local backend fixtures do not override this prohibition.
Live speech/WebRTC quality requires separately authorized provider testing.

Setup-originated human operations carry `X-Candidate-Setup` through the guarded BFF.
The bound interceptor verifies the logged-in identity, then the owner transaction
rechecks intent expiry, originating grant and exact review revision before mutation
or receipt replay. Successful provider, speech and review actions attach completion
in the same commit. Ordinary session operations remain available independently.

The dedicated local backend launcher preloads `dev/career/local-network.cjs`.
With `RECRUITERS_DEVICE_ONLY=true`, its socket policy denies provider hosts even
when legacy real-inference settings remain. Loopback and the configured warehouse host remain allowed.
The companion runs independently and must not preload the backend network hook.
Launchers refuse duplicate listeners. Existing services and production domains are untouched.


## Candidate membership billing (Stripe)

Candidate membership is **USD $9.99 per month** or **USD $95.90 per year**
(20% off twelve monthly payments, rounded to cents). These candidate-only flows
do not change the shared recruiter or agency Stripe integration.

Before deploying this cutover, apply the existing candidate workflow and capability
schemas, then run:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/candidate-stripe-billing.sql
```

The migration preserves every historical checkout and all previously verified
legacy `status`/`paid_until` values. Legacy paid membership remains valid until
that saved deadline; this service no longer polls or accepts webhooks from the
old candidate payment provider. **Operators must inspect and cancel or migrate
any legacy recurring billing with its original provider before cutover**, so
customers cannot continue being charged there without renewed access. No code
here cancels legacy financial obligations, transfers a subscription, or grants a
replacement entitlement. A legacy membership returns `subscription.provider:
"legacy"`; the Stripe cancel endpoint rejects it with instructions to use the
original provider/support rather than returning a false cancellation receipt.

Set these server-only environment variables in the same Stripe account/mode:

- `CANDIDATE_STRIPE_SECRET_KEY`
- `CANDIDATE_STRIPE_MONTHLY_PRICE_ID`
- `CANDIDATE_STRIPE_YEARLY_PRICE_ID`
- `CANDIDATE_STRIPE_WEBHOOK_SECRET`
- `RECRUITERS_PUBLIC_ORIGIN` (the exact candidate website origin)

The two prices must be active USD recurring, per-unit, licensed prices with one
unit per billing interval: 999 cents/month and 9590 cents/year. They must have
**separate active products**, each carrying metadata
`purpose=recruiters-rip-candidate-v1`. Do not use recruiter/agency products.
The installed Stripe SDK default API version is `2025-08-27.basil`; configure the
candidate webhook endpoint to the same API shape (subscription-item periods and
invoice `parent.subscription_details`), and keep it aligned when upgrading Stripe.

Register **`POST /webhooks/candidate-stripe`**, not the shared `/webhooks/stripe`,
with its own signing secret. Subscribe to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.voided`, and
`invoice.marked_uncollectible`. Preserve the exact raw request bytes for the
`stripe-signature` check. Keep one scheduler instance configured with
`MIDDLEWARE_SCHEDULE_OWNER=1`; its 15-minute reconciliation recovers missed events.

Authenticated HTTP contracts:

- `GET /profile/subscription` returns `advanced`, `price` (the current subscription
  interval's price, or monthly by default), `prices.month`, `prices.year`, and
  `subscription`. A subscription includes `status`, `paidUntil`, `cancelledAt`,
  `checkoutUrl`, `interval`, `provider`, and `discount:
  {percentOff,endsAt}|null`. Discount dates come from Stripe; `endsAt:null`
  describes an ongoing verified coupon, not a browser-granted entitlement.
- `POST /profile/subscription/checkout` accepts exactly
  `{requestId:<UUID>,interval:"month"|"year"}` and returns `{checkoutUrl}` on
  `https://checkout.stripe.com`. Stripe hosts promotion-code entry and collects a
  payment method only if required. Same-interval pending checkouts are reused;
  switching interval expires the previous pending checkout. A subscription that
  already exists cannot create a duplicate checkout.
- `POST /profile/subscription/cancel` accepts exactly `{requestId:<UUID>}` and
  returns `{cancelAtPeriodEnd:true,paidUntil,cancelledAt}` only after Stripe
  confirms cancellation. Existing paid access lasts through its confirmed period.
  Reuse the exact request UUID and input on retries.

Redirects do not activate membership. A signed event only locates an existing
server-owned checkout; the service retrieves that checkout and subscription,
matching owner, metadata, customer, configured price, quantity and period before
granting access. Only an active subscription with a paid current invoice is
entitled, including a paid **zero-total invoice** from a 100% discount. Pending,
trialing, paused, overdue, foreign and canceled subscriptions do not qualify.
Terminal cancellation cannot be revived by stale events. Existing repository
membership checks still require `status='active'` and `paid_until>now()`.

### Candidate discount provisioning

Credential-free usage/help (no requests):

```sh
node -r ts-node/register scripts/candidate-stripe-offers.ts --help
```

With an operator-authorized `CANDIDATE_STRIPE_SECRET_KEY`, create/reconcile the
dedicated products and prices:

```sh
node -r ts-node/register scripts/candidate-stripe-offers.ts setup --execute
```

Configure the emitted `CANDIDATE_STRIPE_MONTHLY_PRICE_ID` and
`CANDIDATE_STRIPE_YEARLY_PRICE_ID`. Setup uses stable candidate lookup keys
`recruiters_rip_candidate_usd_month_v1` and
`recruiters_rip_candidate_usd_year_v1`.

Create a selected customer's 100% promotion code:

```sh
node -r ts-node/register scripts/candidate-stripe-offers.ts promo \
  --customer cus_SELECTED --duration month --request-id <UUID> \
  --code SELECTED100 --execute
```

Use `--duration months --months 3` for N months or `--duration forever` for
ongoing membership. `--code` is optional (Stripe generates one otherwise);
`--expires-at <future Unix seconds>` limits redemption time, not discount duration.
The customer must already belong to candidate billing, with metadata
`purpose=recruiters-rip-candidate-v1` and a canonical positive decimal
`candidateId`. Foreign/unbound customers are rejected before discount creation.

By default a promotion is restricted to the selected customer and one redemption.
For partner-distributed codes usable by **any customer**, explicitly choose `--shared`
instead of `--customer`:

```sh
# Shared forever-free membership (both billing intervals).
node -r ts-node/register scripts/candidate-stripe-offers.ts promo \
  --shared --duration forever --percent-off 100 --request-id "$REQUEST_ID" \
  --code "$PARTNER_CODE" --execute

# Shared 70% off the first monthly invoice, then standard monthly billing.
node -r ts-node/register scripts/candidate-stripe-offers.ts promo \
  --shared --duration month --percent-off 70 --request-id "$REQUEST_ID" \
  --code "$FIRST_MONTH_CODE" --execute
```

Generate a distinct request UUID for each offer and retain it for exact retries.
Shared coupons and promotion codes have no customer or total-redemption restriction:
anyone holding the code can redeem it. Keep partner codes private and deactivate
the promotion in Stripe if it leaks. Coupon duration `forever` discounts renewals
of that subscription; `once` discounts only the first invoice. **All finite
discounts apply only to the monthly product**, never the yearly invoice. Forever
coupons apply to both candidate products. The service explicitly retrieves coupon
`applies_to` scope because Stripe otherwise omits it, even on expanded discounts.
There is no local entitlement operation or browser discount override.
Reuse the request UUID **and exact arguments** after a provisioning failure and
inspect Stripe before changing them. `--execute` performs real financial
configuration; run it only with authorization. Automated tests use synthetic
Stripe transports only; issuing real partner codes requires an explicit operator
request and read-back verification, never a charge or subscription as a test.

The guarded local launchers disable candidate financial operations rather than
simulating successful billing or offering a local entitlement-grant endpoint.
Use the synthetic Stripe service tests for checkout/discount/cancellation behavior.

