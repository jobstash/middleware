import * as geoip from "geoip-country";
import { Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PostgresService } from "src/postgres/postgres.service";
import { VisitorEventInput, VisitorQuery } from "./visitor-activity.dto";

@Injectable()
export class VisitorActivityService {
  constructor(private readonly postgres: PostgresService) {}

  async record(input: VisitorEventInput, wallet: string | null): Promise<void> {
    await this.postgres.query(
      `
      INSERT INTO visitor_activity(visitor_id,kind,path,user_node_id,account_key,network_key,country,browser,ip)
      SELECT $1,$2,$3,u.id,COALESCE(u.id::text,''),$5,$6,$7,$8::inet
      FROM (SELECT 1) seed LEFT JOIN LATERAL (
        SELECT id FROM graph_nodes WHERE label='User' AND lower(properties->>'wallet')=lower($4) ORDER BY id LIMIT 1
      ) u ON true
      ON CONFLICT(visitor_id,minute,kind,path,account_key) DO UPDATE
      SET requests=visitor_activity.requests+1,last_seen=now(),network_key=EXCLUDED.network_key,
          country=EXCLUDED.country,browser=EXCLUDED.browser,ip=EXCLUDED.ip`,
      [
        input.visitorId,
        input.kind,
        input.path,
        wallet,
        input.networkKey ?? null,
        (input.ip ? geoip.lookup(input.ip)?.country : input.country) ?? null,
        input.browser ?? null,
        input.ip ?? null,
      ],
    );
  }

  async list(input: VisitorQuery): Promise<unknown> {
    const order = {
      lastSeen: '"lastSeen"',
      requests: "requests",
      views: "views",
      applies: "applies",
    }[input.sort];
    const direction = input.direction === "asc" ? "ASC" : "DESC";
    const [row] = await this.postgres.query(
      `
      WITH recent AS MATERIALIZED (
        SELECT * FROM visitor_activity WHERE last_seen>=now()-make_interval(days=>$1)
      ), grouped AS (
        SELECT visitor_id,min(first_seen) AS "firstSeen",max(last_seen) AS "lastSeen",
          (array_agg(user_node_id ORDER BY last_seen DESC))[1] AS latest_user,
          array_agg(DISTINCT user_node_id) FILTER(WHERE user_node_id IS NOT NULL) AS users,
          (array_agg(country ORDER BY last_seen DESC))[1] AS country,
          (array_agg(network_key ORDER BY last_seen DESC))[1] AS "networkKey",
          (array_agg(host(ip) ORDER BY last_seen DESC))[1] AS ip,
          (array_agg(browser ORDER BY last_seen DESC))[1] AS browser,
          (array_agg(path ORDER BY last_seen DESC))[1] AS path,
          sum(requests) FILTER(WHERE kind='request')::int AS requests,
          count(*) FILTER(WHERE kind='job_view' AND user_node_id IS NULL)::int AS "anonymousViews",
          max(last_seen) FILTER(WHERE kind='presence') AS "lastBrowserSeen",
          bool_or(user_node_id IS NOT NULL) AS "hasSignedIn"
        FROM recent GROUP BY visitor_id
      ), filtered AS MATERIALIZED (
        SELECT *,visitor_id::text AS id,latest_user IS NOT NULL AS "signedIn",
          "lastSeen">=now()-interval '5 minutes' AS active
        FROM grouped WHERE ($2='all' OR ($2='signed_in' AND latest_user IS NOT NULL)
          OR ($2='anonymous' AND latest_user IS NULL) OR ($2='active' AND "lastSeen">=now()-interval '5 minutes'))
          AND ($3::text IS NULL OR country=$3) AND ($4::text IS NULL OR "networkKey"=$4)
      ), accounts AS (
        SELECT DISTINCT unnest(users) AS id FROM filtered
      ), activity AS MATERIALIZED (
        SELECT e.user_node_id,count(*) FILTER(WHERE event_type='job_view')::int AS views,
          count(*) FILTER(WHERE event_type='job_apply')::int AS applies
        FROM accounts a JOIN user_activity_events e ON e.user_node_id=a.id
        WHERE e.occurred_at>=now()-make_interval(days=>$1) AND e.event_type IN ('job_view','job_apply')
        GROUP BY e.user_node_id
      ), rows AS (
        SELECT f.*,COALESCE(m.views,0)::int AS views,COALESCE(m.applies,0)::int AS applies,
          COALESCE(u.properties->>'name',u.properties->>'githubUsername',u.properties->>'wallet') AS account
        FROM filtered f LEFT JOIN graph_nodes u ON u.id=f.latest_user
        LEFT JOIN LATERAL (SELECT sum(a.views) AS views,sum(a.applies) AS applies FROM activity a WHERE a.user_node_id=ANY(f.users)) m ON true
      ), page AS (SELECT * FROM rows ORDER BY ${order} ${direction} NULLS LAST,id LIMIT $5 OFFSET $6)
      SELECT jsonb_build_object('total',(SELECT count(*)::int FROM filtered),
        'active',(SELECT count(*)::int FROM filtered WHERE active),
        'signedIn',(SELECT count(*)::int FROM filtered WHERE "signedIn"),
        'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page)-'users'-'latest_user'-'visitor_id') FROM page),'[]'::jsonb),
        'updatedAt',now()) AS data`,
      [
        input.days,
        input.status,
        input.country ?? null,
        input.networkKey ?? null,
        input.limit,
        input.offset,
      ],
    );
    return row.data;
  }

  async detail(visitorId: string, days: number): Promise<unknown> {
    const [row] = await this.postgres.query(
      `
      WITH visits AS MATERIALIZED (
        SELECT * FROM visitor_activity WHERE visitor_id=$1 AND last_seen>=now()-make_interval(days=>$2)
      ), accounts AS (SELECT DISTINCT user_node_id AS id FROM visits WHERE user_node_id IS NOT NULL),
      account_events AS (
        SELECT e.occurred_at AS at,e.event_type AS kind,j.properties->>'title' AS title,
          j.properties->>'shortUUID' AS "jobId",COALESCE(u.properties->>'name',u.properties->>'wallet') AS account
        FROM accounts a JOIN user_activity_events e ON e.user_node_id=a.id
        LEFT JOIN graph_nodes j ON j.id=e.job_node_id LEFT JOIN graph_nodes u ON u.id=a.id
        WHERE e.occurred_at>=now()-make_interval(days=>$2) AND e.event_type IN ('job_view','job_apply')
        ORDER BY e.occurred_at DESC LIMIT 100
      ), visit_page AS (
        SELECT last_seen AS at,kind,path,requests,country,host(ip) AS ip,network_key AS "networkKey",user_node_id IS NOT NULL AS "signedIn"
        FROM visits ORDER BY last_seen DESC LIMIT 100
      ) SELECT jsonb_build_object('visits',COALESCE((SELECT jsonb_agg(visit_page) FROM visit_page),'[]'::jsonb),
        'accountEvents',COALESCE((SELECT jsonb_agg(account_events) FROM account_events),'[]'::jsonb)) AS data`,
      [visitorId, days],
    );
    return row.data;
  }

  // Bound each cleanup; multiple processes may safely share the work.
  @Interval(60_000)
  async expire(): Promise<void> {
    await this.postgres
      .query(
        `DELETE FROM visitor_activity WHERE ctid IN (
      SELECT ctid FROM visitor_activity WHERE last_seen<now()-interval '30 days' LIMIT 5000 FOR UPDATE SKIP LOCKED
    )`,
      )
      .catch(() => undefined);
  }
}
