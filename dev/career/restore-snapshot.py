#!/usr/bin/env python3
"""Restore an existing backup into the dedicated loopback-only local cluster.
Never accepts a database URL or a production restore target.
"""
import argparse, gzip, hashlib, json, os, pathlib, secrets, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parent
LOCAL=ROOT/'.local'
LOCAL.mkdir(mode=0o700,exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('archive',type=pathlib.Path)
parser.add_argument('--sha256',required=True)
parser.add_argument('--kind',choices=['jobstash','legacy'],default='jobstash')
args=parser.parse_args()
if len(args.sha256)!=64:raise SystemExit('Expected a SHA-256 checksum')
check=hashlib.sha256()
with args.archive.open('rb') as archive:
 while chunk:=archive.read(1024*1024):check.update(chunk)
if check.hexdigest()!=args.sha256:raise SystemExit('Backup checksum does not match')
SOURCE='/data/coolify/backups/databases/root-team-0/jobstash-postgres-production-xntodb384t2gu6ud3n60qm75/pg-dump-all-1788739204.gz'
CONTAINER='jobstash-career-postgres' if args.kind=='jobstash' else 'jobstash-career-legacy-postgres'
PORT='55480' if args.kind=='jobstash' else '55481'
DATABASE='jobstash' if args.kind=='jobstash' else 'sitdownwith'
if subprocess.run(['docker','inspect',CONTAINER],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
 raise SystemExit('The local restore container already exists. Refusing to overwrite it.')
password=secrets.token_hex(24)
envfile=LOCAL/('database.env' if args.kind=='jobstash' else 'legacy-database.env')
envfile.write_text('DATABASE_URL=postgresql://career_restore_admin:'+password+'@127.0.0.1:'+PORT+'/'+DATABASE+'\n')
os.chmod(envfile,0o600)
if subprocess.run(['docker','network','inspect','jobstash-career-loopback'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0:
 subprocess.run(['docker','network','create','jobstash-career-loopback'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','run','-d','--name',CONTAINER,'--network','jobstash-career-loopback','-p','127.0.0.1:'+PORT+':5432','--shm-size=1g','-e','POSTGRES_USER=career_restore_admin','-e','POSTGRES_PASSWORD='+password,'-v',CONTAINER+':/var/lib/postgresql','pgvector/pgvector:0.8.2-pg18-trixie','postgres','-c','max_wal_size=1GB','-c','checkpoint_timeout=10min','-c','max_connections=120'],check=True,stdout=subprocess.DEVNULL)
for _ in range(60):
 if subprocess.run(['docker','exec',CONTAINER,'pg_isready','-U','career_restore_admin'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
 time.sleep(1)
else:raise SystemExit('Local PostgreSQL did not become ready')
log=open(LOCAL/(args.kind+'-restore.log'),'wb')
os.chmod(LOCAL/(args.kind+'-restore.log'),0o600)
restore=subprocess.Popen(['docker','exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-U','career_restore_admin','-d','postgres'],stdin=subprocess.PIPE,stdout=log,stderr=log)
started=time.monotonic()
try:
 with gzip.open(args.archive,'rb') as stream:
  # Some historical CHECK functions call public helpers without qualification.
  # pg_dumpall clears search_path; restore this archive with public visible.
  # The archive itself remains byte-for-byte unchanged and checksum-verified.
  pattern=b"SELECT pg_catalog.set_config('search_path', '', false);"
  replacement=b"SELECT pg_catalog.set_config('search_path', 'pg_catalog, public', false);"
  pending=b''
  while chunk:=stream.read(1024*1024):
   if os.statvfs(LOCAL).f_bavail*os.statvfs(LOCAL).f_frsize<3*1024**3:raise RuntimeError('Less than 3 GiB free; stopped local restore')
   pending=(pending+chunk).replace(pattern,replacement)
   if len(pending)>len(pattern):restore.stdin.write(pending[:-len(pattern)]);pending=pending[-len(pattern):]
  if pending:restore.stdin.write(pending)
 restore.stdin.close()
 if restore.wait()!=0:raise RuntimeError('Local restore failed; inspect the private restore log')
 # Rotate copied role credentials locally. No archived password can authenticate here.
 reset="DO $$ DECLARE r record; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolcanlogin AND rolname <> 'career_restore_admin' LOOP EXECUTE format('ALTER ROLE %I PASSWORD %L',r.rolname,gen_random_uuid()::text); END LOOP; END $$;"
 subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-U','career_restore_admin','-d','postgres'],input=reset.encode(),check=True,stdout=subprocess.DEVNULL)
 (LOCAL/(args.kind+'-snapshot.json')).write_text(json.dumps({'sourceHost':'neodb.jobstash.xyz','source':SOURCE if args.kind=='jobstash' else str(args.archive.name),'sha256':check.hexdigest(),'restoredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'durationSeconds':round(time.monotonic()-started),'container':CONTAINER},indent=2)+'\n')
 print('Snapshot restored; checksum:',check.hexdigest(),flush=True)
except BaseException:
 restore.terminate();raise
finally:log.close()
