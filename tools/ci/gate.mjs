import {fileURLToPath} from 'node:url';
import {requireThat} from './evidence.mjs';
export async function gate(env=process.env) {
  requireThat(env.TESTS==='success'&&env.BUILD==='success','required aggregate job did not succeed');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{await gate();console.log('Every required lane succeeded.');}catch(e){console.error(e.message);process.exitCode=1;}}
