# Frontend IP blocking

Superadmins manage blocks in Visitor activity and `/admin/blocked-ips`.
`GET /telemetry/ip-blocks` lists active blocks with server-side sorting and pagination.
`POST /telemetry/ip-blocks` accepts `{ip, blocked}`. IPv4 and IPv6 addresses are
validated; hostnames and networks are not accepted. No evidence or reason is
required. Changes and the administrator wallet are recorded in PostgreSQL.
Repeated requests for an unchanged decision do not create duplicate history.
Blocks remain until explicitly removed. Unbanning preserves history.

Install `scripts/sql/visitor-ip-blocks.sql` through the normal schema release process.
Set a private, random `VISITOR_BLOCKLIST_SECRET` on middleware and in the root-only
`/etc/jobstash-ip-blocks.json` file on the website proxy server:

```json
{
  "url": "https://middleware.jobstash.xyz/telemetry/ip-blocks/proxy",
  "secret": "REPLACE_WITH_SHARED_SECRET",
  "file": "/data/coolify/proxy/dynamic/jobstash-ip-blocks.yaml",
  "statusUrl": "http://127.0.0.1/api/http/routers"
}
```

Install `scripts/visitor-ip-blocks/sync.py` at `/opt/jobstash-ip-blocks/sync.py`
and the included service/timer files under `/etc/systemd/system`. Install
`status-route.yaml` in Coolify's dynamic directory. Its private gateway addresses
must match the proxy's Docker networks. It exposes only GET router status to the
local host/gateways, using connection IP checks; no public dashboard is enabled.
Enable `jobstash-ip-blocks.timer` after deploying middleware.

Every five seconds the server reads the authenticated blocklist, validates it,
writes the Traefik file atomically and verifies the exact rules are enabled through
the private status route. It then acknowledges the revision. Failed reads retain
the file; rejected rules restore the previous file. The dashboard distinguishes
saved decisions from current confirmation (last 30 seconds). A pending change is
not reported as applied. Failed acknowledgements are retried by the next run.

Traefik uses native ClientIP matching against the connection address. Requests
for jobstash.xyz and www.jobstash.xyz from blocked addresses receive a rejection
before reaching the application, on both HTTP and HTTPS. The deny middleware
normally returns 403; the fallback internal service also rejects the request.
The website pages, static files and website APIs are covered. Other hostnames,
including recruiters.rip and middleware.jobstash.xyz, are outside this scope.
Unbanning remains available even when the admin's IP is blocked from the website.
No forwarded header supplied by the visitor can bypass a block. This assumes
Traefik receives visitors directly; reassess if an upstream proxy is introduced.

The generated file survives restarts and redeployments and is visible in
Coolify > Servers > Proxy > Dynamic Configurations. Manage its contents through
the admin API rather than editing it manually. No plugin or proxy restart is
needed for list updates. Unbanned rows/history are retained in PostgreSQL.
Blocked requests do not reach the website's visitor collector; their previous
activity remains visible. This feature does not yet report counts of rejected
requests.

Check `systemctl status jobstash-ip-blocks.timer` and
`journalctl -u jobstash-ip-blocks.service`. To stop synchronization without
removing current blocks, stop the timer. To disable enforcement, stop the timer
and remove only `jobstash-ip-blocks.yaml`; preserve the PostgreSQL records.
