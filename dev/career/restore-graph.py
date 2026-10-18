#!/usr/bin/env python3
import gzip,hashlib,json,os,pathlib,secrets,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent/'.local'
BACKUP=ROOT/'backups'/'network'
manifest=json.loads((BACKUP/'manifest.json').read_text())
CONTAINER='jobstash-career-clickhouse'
if subprocess.run(['docker','inspect',CONTAINER],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:raise SystemExit('Local ClickHouse already exists; refusing to overwrite')
for entry in manifest['tables'].values():
 for file in entry.values():
  if hashlib.sha256((BACKUP/file['file']).read_bytes()).hexdigest()!=file['sha256']:raise SystemExit('Graph backup checksum mismatch')
password=secrets.token_hex(24)
(ROOT/'clickhouse.env').write_text('CAREER_CLICKHOUSE_URL=http://127.0.0.1:58123\nCAREER_CLICKHOUSE_USER=jobstash_paths\nCAREER_CLICKHOUSE_PASSWORD='+password+'\n')
os.chmod(ROOT/'clickhouse.env',0o600)
subprocess.run(['docker','run','-d','--name',CONTAINER,'--network','jobstash-career-loopback','-p','127.0.0.1:58123:8123','--memory=2g','--ulimit','nofile=262144:262144','-v','jobstash-career-clickhouse:/var/lib/clickhouse','-e','CLICKHOUSE_USER=local_admin','-e','CLICKHOUSE_PASSWORD='+password,'-e','CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1','clickhouse/clickhouse-server:25.8'],check=True,stdout=subprocess.DEVNULL)
def query(sql,data=None):
 return subprocess.run(['docker','exec','-i',CONTAINER,'clickhouse-client','--user','local_admin','--password',password,'--query',sql],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
for _ in range(60):
 try:query('SELECT 1');break
 except subprocess.CalledProcessError:time.sleep(1)
else:raise SystemExit('Local ClickHouse did not become ready')
query('CREATE DATABASE intropath_graph')
for table,entry in manifest['tables'].items():
 query(gzip.decompress((BACKUP/entry['schema']['file']).read_bytes()).decode())
 query('INSERT INTO intropath_graph.'+table+' FORMAT Native',gzip.decompress((BACKUP/entry['native']['file']).read_bytes()))
 print(table,query('SELECT count() FROM intropath_graph.'+table).decode().strip(),flush=True)
query('ALTER TABLE intropath_graph.co_worker_edges ADD PROJECTION by_user_b (SELECT * ORDER BY (user_b,user_a))')
query('ALTER TABLE intropath_graph.co_worker_edges MATERIALIZE PROJECTION by_user_b SETTINGS mutations_sync=1')
query("CREATE USER jobstash_paths IDENTIFIED WITH sha256_password BY '"+password+"'")
query('GRANT SELECT ON intropath_graph.* TO jobstash_paths')
print('Local network read models restored and indexed',flush=True)
