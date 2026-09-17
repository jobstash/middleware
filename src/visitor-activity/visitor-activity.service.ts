import { USER_AGENT_RULES, userAgentMatchSql } from "./user-agent-rules";
import * as geoip from "geoip-country";
import { Injectable } from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import {
  VisitorEventInput,
  VisitorQuery,
  VisitorDetailQuery,
} from "./visitor-activity.dto";

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
    const order =
      {
        id: '"id"',
        active: '"active"',
        signedIn: '"signedIn"',
        hasSignedIn: '"hasSignedIn"',
        account: '"account"',
        ip: '"ip"',
        country: '"country"',
        lastSeen: '"lastSeen"',
        requests: '"requests"',
        anonymousViews: '"anonymousViews"',
        views: '"views"',
        applies: '"applies"',
        path: '"path"',
        lastBrowserSeen: '"lastBrowserSeen"',
        browser: '"browser"',
        traffic: '"traffic"',
        agent: '"agent"',
      }[input.sort] ?? '"lastSeen"';
    const direction = input.direction === "asc" ? "ASC" : "DESC";
    const [row] = await this.postgres.query(
      `
      WITH recent AS MATERIALIZED (
        SELECT * FROM visitor_activity WHERE ($1::int=0 OR last_seen>=now()-make_interval(days=>$1))
      ), agents AS MATERIALIZED (
        SELECT b.browser,a.* FROM (SELECT DISTINCT browser FROM recent) b
        CROSS JOIN LATERAL (${userAgentMatchSql("b.browser", "$8")}) a
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
      ), classified AS (
        SELECT g.*,a.traffic,a.agent,a."agentReason" FROM grouped g JOIN agents a ON a.browser IS NOT DISTINCT FROM g.browser
      ), base_filtered AS MATERIALIZED (
        SELECT *,visitor_id::text AS id,latest_user IS NOT NULL AS "signedIn",
          "lastSeen">=now()-interval '5 minutes' AS active
        FROM classified WHERE ($2='all' OR ($2='signed_in' AND latest_user IS NOT NULL)
          OR ($2='anonymous' AND latest_user IS NULL) OR ($2='active' AND "lastSeen">=now()-interval '5 minutes'))
          AND ($3::text IS NULL OR country=$3) AND ($4::text IS NULL OR "networkKey"=$4)
          AND ($9::text IS NULL OR strpos(lower(COALESCE(browser,'') || ' ' || agent),lower($9))>0)
      ), filtered AS MATERIALIZED (SELECT * FROM base_filtered WHERE $7='all' OR traffic=$7 OR ($7='automated' AND traffic IN ('crawler','automation'))), accounts AS (
        SELECT DISTINCT unnest(users) AS id FROM filtered
      ), activity AS MATERIALIZED (
        SELECT e.user_node_id,count(*) FILTER(WHERE event_type='job_view')::int AS views,
          count(*) FILTER(WHERE event_type='job_apply')::int AS applies
        FROM accounts a JOIN user_activity_events e ON e.user_node_id=a.id
        WHERE ($1::int=0 OR e.occurred_at>=now()-make_interval(days=>$1)) AND e.event_type IN ('job_view','job_apply')
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
        'trafficCounts',(SELECT jsonb_object_agg(traffic,total) FROM (SELECT traffic,count(*)::int AS total FROM base_filtered GROUP BY traffic) counts),
        'updatedAt',now()) AS data`,
      [
        input.days,
        input.status,
        input.country ?? null,
        input.networkKey ?? null,
        input.limit,
        input.offset,
        input.traffic ?? "all",
        JSON.stringify(USER_AGENT_RULES),
        input.agentSearch?.trim() || null,
      ],
    );
    return row.data;
  }

  async detail(
    visitorId: string,
    days: number,
    input = new VisitorDetailQuery(),
  ): Promise<unknown> {
    const order =
      {
        at: "at",
        kind: "kind",
        path: "path",
        requests: "requests",
        signedIn: '"signedIn"',
        country: "country",
        ip: "ip",
        title: "title",
        account: "account",
        browser: "browser",
      }[input.sort] ?? "at";
    const eventOrder =
      { at: "at", kind: "kind", title: "title", account: "account" }[
        input.eventSort
      ] ?? "at";
    const direction = input.direction === "asc" ? "ASC" : "DESC";
    const eventDirection = input.eventDirection === "asc" ? "ASC" : "DESC";
    const [row] = await this.postgres.query(
      `WITH visits AS MATERIALIZED (
        SELECT * FROM visitor_activity WHERE
          (($3::inet IS NULL AND visitor_id=$1::uuid) OR ($3::inet IS NOT NULL AND ip=$3::inet))
          AND ($2::int=0 OR last_seen>=now()-make_interval(days=>$2))
      ), accounts AS (SELECT DISTINCT user_node_id AS id FROM visits WHERE user_node_id IS NOT NULL),
      events AS MATERIALIZED (
        SELECT e.occurred_at AS at,e.event_type AS kind,j.properties->>'title' AS title,
          j.properties->>'shortUUID' AS "jobId",COALESCE(u.properties->>'name',u.properties->>'wallet') AS account
        FROM accounts a JOIN user_activity_events e ON e.user_node_id=a.id
        LEFT JOIN graph_nodes j ON j.id=e.job_node_id LEFT JOIN graph_nodes u ON u.id=a.id
        WHERE ($2::int=0 OR e.occurred_at>=now()-make_interval(days=>$2)) AND e.event_type IN ('job_view','job_apply')
      ), account_events AS (SELECT * FROM events ORDER BY ${eventOrder} ${eventDirection} NULLS LAST,at DESC,"jobId",kind LIMIT 100 OFFSET $5),
      observed AS (
        SELECT v.last_seen AS at,v.kind,v.path,v.requests,v.country,v.browser,host(v.ip) AS ip,
          v.network_key AS "networkKey",v.user_node_id IS NOT NULL AS "signedIn",
          v.visitor_id,v.minute,v.account_key,
          j.properties->>'title' AS title,
          COALESCE(u.properties->>'name',u.properties->>'githubUsername',u.properties->>'wallet') AS account
        FROM visits v LEFT JOIN graph_nodes u ON u.id=v.user_node_id
        LEFT JOIN LATERAL (
          SELECT properties FROM graph_nodes WHERE label='StructuredJobpost'
            AND properties->>'shortUUID'=substring(v.path from '[^/]+$') ORDER BY id LIMIT 1
        ) j ON true
      ), visit_page AS (
        SELECT * FROM observed ORDER BY ${order} ${direction} NULLS LAST,at DESC,visitor_id,minute,kind,path,account_key LIMIT 100 OFFSET $4
      ) SELECT jsonb_build_object('visits',COALESCE((SELECT jsonb_agg(to_jsonb(visit_page)-'visitor_id'-'minute'-'account_key') FROM visit_page),'[]'::jsonb),
        'visitTotal',(SELECT count(*)::int FROM visits), 'eventTotal',(SELECT count(*)::int FROM events),
        'accountEvents',COALESCE((SELECT jsonb_agg(account_events) FROM account_events),'[]'::jsonb)) AS data`,
      [visitorId, days, input.ip ?? null, input.offset, input.eventOffset],
    );
    return row.data;
  }
}
