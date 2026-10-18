"""Read-only query transport over SSH; never installs files or starts ETL."""
import json, os, re, sys, urllib.parse, urllib.request

request = json.load(sys.stdin)
sql, params = request['sql'], request['params']
if not sql.lstrip().startswith('SELECT ') or ';' in sql:
    raise SystemExit('Only domain SELECT queries are permitted')
settings = {'readonly': '1', 'max_execution_time': '3', 'max_rows_to_read': '1000000',
            'read_overflow_mode': 'throw', 'max_result_rows': '5000',
            'result_overflow_mode': 'throw', 'max_threads': '2',
            'max_memory_usage': '268435456'}
for key, value in params.items():
    if not re.fullmatch(r'[a-z_]+', key):
        raise SystemExit('Invalid query parameter')
    if isinstance(value, list):
        if any(not isinstance(item, str) for item in value):
            raise SystemExit('Only string array parameters are supported')
        settings['param_' + key] = '[' + ','.join("'" + item.replace("\\", "\\\\").replace("'", "\\'") + "'" for item in value) + ']'
    else:
        settings['param_' + key] = value
host = os.environ['CLICKHOUSE_HOST']
secure = os.environ.get('CLICKHOUSE_SECURE', '').lower() in ('true', '1')
base = host if host.startswith(('http://', 'https://')) else ('https://' if secure else 'http://') + host + ':' + os.environ.get('CLICKHOUSE_PORT', '8443' if secure else '8123')
query = urllib.request.Request(base + '/?' + urllib.parse.urlencode(settings),
    data=(sql + ' FORMAT JSON').encode(),
    headers={'X-ClickHouse-User': os.environ['CLICKHOUSE_USER'],
             'X-ClickHouse-Key': os.environ['CLICKHOUSE_PASSWORD']})
try:
    with urllib.request.urlopen(query, timeout=5) as response:
        result = response.read(4 * 1024 * 1024 + 1)
        if len(result) > 4 * 1024 * 1024:
            raise SystemExit('Response exceeds local bound')
        sys.stdout.buffer.write(result)
except Exception:
    raise SystemExit('Remote read-only query failed')
