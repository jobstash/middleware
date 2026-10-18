// Copy existing profile-linked CVs from R2 into local document storage. Source
// objects are read only. Editable showcase links are not ownership evidence;
// objects without matching authenticated-upload metadata remain private.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import pg from 'pg';
import dotenv from 'dotenv';
const requireWeb=createRequire(new URL('../../../webapp/package.json',import.meta.url));
const {S3Client,ListObjectsV2Command,HeadObjectCommand,GetObjectCommand,PutObjectCommand}=requireWeb('@aws-sdk/client-s3');
const local=new URL('./.local/',import.meta.url);
const env=JSON.parse(await readFile(new URL('environment.json',local),'utf8'));
const database=dotenv.parse(await readFile(new URL('database.env',local)));
const sourceEnv=dotenv.parse(await readFile(new URL('../../../webapp/.env',import.meta.url)));
const url=new URL(database.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='55480'||env.R2_ENDPOINT!=='http://127.0.0.1:59000')throw Error('Dedicated local snapshot and storage only');
const storage=e=>new S3Client({region:'auto',forcePathStyle:true,endpoint:e.R2_ENDPOINT,credentials:{accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY}});
const source=storage(sourceEnv),target=storage(env),db=new pg.Client({connectionString:database.DATABASE_URL});
const report={copied:0,ambiguous:0,missing:0,unsupported:0,failed:0,checkedAt:new Date().toISOString()};
await db.connect();
try{
 const {rows}=await db.query("SELECT account.id AS owner,account.properties->>'privyId' AS privy,cv.properties->>'url' AS url FROM graph_nodes account JOIN graph_relationships edge ON edge.source_id=account.id AND edge.type='HAS_SHOWCASE' JOIN graph_nodes cv ON cv.id=edge.target_id AND cv.label='UserShowCase' WHERE account.label='User' AND cv.properties->>'label'='CV'");
 const claims=new Map();
 for(const row of rows){
  try{const link=new URL(row.url);if(!['jobstash.xyz','www.jobstash.xyz'].includes(link.hostname))continue;
   const id=link.pathname.match(/^\/api\/resume\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i)?.[1];if(!id)continue;
   const owners=claims.get(id)??new Map();owners.set(row.owner,row);claims.set(id,owners);
  }catch{continue;}
 }
 for(const [id,owners] of claims){
  if(owners.size!==1){report.ambiguous++;continue;}
  const [claim]=owners.values();if(!claim.privy){report.ambiguous++;continue;}
  try{
   const listed=await source.send(new ListObjectsV2Command({Bucket:sourceEnv.R2_BUCKET_NAME,Prefix:id+'/',MaxKeys:2}));
   if(listed.Contents?.length!==1){report.missing++;continue;}
   const key=listed.Contents[0].Key;
   if(listed.Contents[0].Size>10*1024*1024){report.unsupported++;continue;}
   const metadata=await source.send(new HeadObjectCommand({Bucket:sourceEnv.R2_BUCKET_NAME,Key:key}));
   const owner=createHash('sha256').update(claim.privy).digest('hex');
   if(metadata.Metadata?.owner!==owner){report.ambiguous++;continue;}
   const object=await source.send(new GetObjectCommand({Bucket:sourceEnv.R2_BUCKET_NAME,Key:key}));
   const chunks=[];let size=0;for await(const chunk of object.Body){size+=chunk.length;if(size>10*1024*1024)throw Error('Size bound');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),hash=createHash('sha256').update(bytes).digest('hex');
   const filename=metadata.Metadata?.filename?decodeURIComponent(metadata.Metadata.filename):key.split('/').at(-1),type=object.ContentType??'application/octet-stream';
   await target.send(new PutObjectCommand({Bucket:env.R2_BUCKET_NAME,Key:key,Body:bytes,ContentType:type,Metadata:{owner,filename:encodeURIComponent(filename),'content-hash':hash,provenance:'existing-profile-showcase'}}));
   await db.query('INSERT INTO candidate_documents(id,user_node_id,content_hash,filename) VALUES($1,$2,$3,$4) ON CONFLICT(user_node_id,content_hash) DO NOTHING',[id,claim.owner,hash,filename]);report.copied++;
  }catch{report.failed++;}
 }
 await writeFile(new URL('resume-copy-report.json',local),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 if(report.failed)process.exitCode=1;
}finally{await db.end();}
