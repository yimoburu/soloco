import { createHash } from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest('hex');
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
export function validText(text) {return typeof text==='string'&&!text.includes('\0')&&Buffer.from(text,'utf8').toString('utf8')===text;}
const boundary=(text,n)=>!(n>0&&n<text.length&&/[\uD800-\uDBFF]/.test(text[n-1])&&/[\uDC00-\uDFFF]/.test(text[n]));
// UTF-16 offsets refer to exact original bytes decoded as validated UTF-8, never
// fuzzy hunks, sequentially shifted offsets, regexes, shell commands or paths.
export function reconstructPatch(source,patch) {
  if(!exactKeys(patch,['path','base_sha256','edits','content']))throw new Error('Invalid patch fields');
  if(source===undefined) {
    if(patch.base_sha256!==null||patch.edits!==undefined||!validText(patch.content))throw new Error('New paths require null base_sha256 and complete text content');
    return patch.content;
  }
  if(!validText(source)||patch.base_sha256!==digest(source)||patch.content!==undefined||!Array.isArray(patch.edits)||patch.edits.length>10000)throw new Error('Patch base hash or edit shape is invalid');
  let cursor=0,previousStart=-1,result='';
  for(const edit of patch.edits) {
    if(!exactKeys(edit,['start','end','text'])||!Number.isSafeInteger(edit.start)||!Number.isSafeInteger(edit.end)||edit.start<cursor||edit.start<=previousStart||edit.end<edit.start||edit.end>source.length||!boundary(source,edit.start)||!boundary(source,edit.end)||!validText(edit.text))throw new Error('Patch edits must be ordered, non-overlapping exact UTF-16 ranges with valid UTF-8 text');
    result+=source.slice(cursor,edit.start)+edit.text;cursor=edit.end;previousStart=edit.start;
  }
  return result+source.slice(cursor);
}
