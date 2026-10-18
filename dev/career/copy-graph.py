#!/usr/bin/env python3
"""Copy only the three existing network read models; never traverses the graph."""
import gzip, hashlib, json, os, pathlib, shlex, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parent/'.local'/'backups'/'network'
ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
TABLES=('co_worker_edges','current_staff','people_directory')
RUNNER='dbt-runner-xzphpkeagwiiu2z7kph8a7y8-192000154749'
CODE='''import gzip,os,sys,urllib.request,urllib.parse
host=os.environ['CLICKHOUSE_HOST']
secure=os.environ.get('CLICKHOUSE_SECURE','').lower() in ('true','1')
base=host if host.startswith(('http://','https://')) else ('https://' if secure else 'http://')+host+':'+os.environ.get('CLICKHOUSE_PORT','8443' if secure else '8123')
headers={'X-ClickHouse-User':os.environ.get('CLICKHOUSE_USER','default'),'X-ClickHouse-Key':os.environ['CLICKHOUSE_PASSWORD']}
request=urllib.request.Request(base+'/?database=intropath_graph',data=sys.argv[1].encode(),headers=headers)
with urllib.request.urlopen(request,timeout=120) as response,gzip.GzipFile(fileobj=sys.stdout.buffer,mode='wb',mtime=0) as target:
 while chunk:=response.read(1024*1024):target.write(chunk)
'''
manifest={'sourceHost':'neodb.jobstash.xyz','database':'intropath_graph','copiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'tables':{}}
for table in TABLES:
 for kind,query in [('schema',f'SHOW CREATE TABLE intropath_graph.{table} FORMAT TSVRaw'),('native',f'SELECT * FROM intropath_graph.{table} FORMAT Native')]:
  path=ROOT/f'{table}.{kind}.gz'
  if not path.exists():
   command='docker exec -i '+shlex.quote(RUNNER)+' python3 -c '+shlex.quote(CODE)+' '+shlex.quote(query)
   with open(str(path)+'.partial','wb') as output:
    os.chmod(output.name,0o600)
    subprocess.run(['ssh','-o','BatchMode=yes','root@neodb.jobstash.xyz',command],stdout=output,check=True)
   os.replace(str(path)+'.partial',path)
  digest=hashlib.sha256(path.read_bytes()).hexdigest()
  manifest['tables'].setdefault(table,{})[kind]={'file':path.name,'sha256':digest,'bytes':path.stat().st_size}
 print('Copied canonical read model:',table,flush=True)
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
