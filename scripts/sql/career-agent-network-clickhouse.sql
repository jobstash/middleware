-- Apply through the existing ClickHouse/dbt deployment, then retain with the
-- co_worker_edges model. This indexes existing edges, never a 3-hop expansion.
ALTER TABLE intropath_graph.co_worker_edges ADD PROJECTION IF NOT EXISTS by_user_b
(SELECT * ORDER BY (user_b,user_a));
ALTER TABLE intropath_graph.co_worker_edges MATERIALIZE PROJECTION by_user_b;
