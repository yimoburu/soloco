// Fixed source build command, deliberately absent from all company/native tools.
import {buildOriginalContextComponent,contextComponentErrorCode} from '../plugins/soloco/runtime/peers/context-build-component.mjs';
if(process.argv.length!==2)throw Error('COMPONENT_NO_ARGUMENTS');
try {
 const result=await buildOriginalContextComponent();
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.status!=='COMPILED_COMPONENT')process.exitCode=1;
} catch(error) {
 process.stdout.write(JSON.stringify({protocol:'soloco-context-component-command-v1',status:'HELD',code:contextComponentErrorCode(error)})+'\n');
 process.exitCode=1;
}
