// Local development only. Credentials stay in the existing remote ETL container.
// Every HTTP request executes with ClickHouse's server-enforced readonly=1.
const {spawn}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const program=readFileSync(join(__dirname,'remote-clickhouse.py'),'utf8');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const command='docker exec -i dbt-runner-xzphpkeagwiiu2z7kph8a7y8-192000154749 python3 -c '+quote(program);
module.exports.query=(sql,params={})=>new Promise((resolve,reject)=>{
 const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=4','root@neodb.jobstash.xyz',command],{stdio:['pipe','pipe','pipe']});
 let result='',size=0;const timer=setTimeout(()=>child.kill('SIGTERM'),10000);
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)child.kill('SIGTERM');else result+=chunk;});
 child.stderr.resume();
 child.on('error',()=>{clearTimeout(timer);reject(Error('Remote ClickHouse connection failed'));});
 child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('Remote read-only ClickHouse query failed'));try{resolve(JSON.parse(result).data);}catch{reject(Error('Invalid ClickHouse response'));}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({sql,params}));
});
