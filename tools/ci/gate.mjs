import {fileURLToPath} from 'node:url';
import {githubRequest} from './verify.mjs';
import {requireThat,requiredJobs} from './evidence.mjs';
export async function gate(env=process.env,request=githubRequest) {
  requireThat(env.TESTS==='success'&&env.BUILD==='success','required aggregate job did not succeed');
  requireThat(/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY)&&/^\d+$/.test(env.GITHUB_RUN_ID)&&/^\d+$/.test(env.GITHUB_RUN_ATTEMPT),'missing run identity');
  const jobs=[];
  for(let page=1;page<=100;page++) {
    const data=await request(`/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}/jobs?per_page=100&page=${page}`);
    requireThat(Array.isArray(data.jobs),'missing jobs');jobs.push(...data.jobs);
    if(data.jobs.length<100){requireThat(jobs.length===data.total_count,'incomplete job list');requiredJobs(jobs,['Tests Node 22','Tests Node 25','Build and drift'],env.GITHUB_RUN_ID,env.GITHUB_RUN_ATTEMPT);return;}
  }
  throw new Error('incomplete job pagination');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{await gate();console.log('Every required lane succeeded.');}catch(e){console.error(e.message);process.exitCode=1;}}
