import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('registry contains no persistence, network or preview URL operations',()=>{
 const source=read('src/lib/documentDrafts.ts');
 assert.doesNotMatch(source,/localStorage|sessionStorage|fetch\(|createObjectURL|indexedDB|\.rpc\(/);
 assert.match(source,/WeakMap<object, Registry>/);assert.match(source,/r\.entries\.clear\(\); r\.epoch\+\+/);
});
test('identity owns epoch invalidation; temporary recovery and null INITIAL_SESSION retain existing behavior',()=>{
 const source=read('src/components/auth/UserContext.tsx');
 assert.match(source,/function storeUser\(user: User \| null\) \{\s*setDocumentDraftActor\(user\?\.userId \?\? null\)/);
 const recover=source.slice(source.indexOf('const recoverLater ='),source.indexOf('const restoreSession ='));
 assert.doesNotMatch(recover,/setDocumentDraftActor|storeUser\(null\)|clearIdentity\(/);
 assert.match(source,/if \(event === "INITIAL_SESSION" && !session\) return/);
 assert.match(source,/if \(!session\) \{ clearIdentity\(\); return; \}/);
});
test('maintenance binds actor/project/issue, keeps failclosed and never checkpoints preview URLs',()=>{
 assert.match(read('src/components/maintenance/MaintenanceWorkspace.tsx'),/actorId=\{user\?\.userId\} projectId=\{activeProjectId \?\? ""\}/);
 const hook=read('src/components/maintenance/useMaintenanceComposer.ts');
 assert.match(hook,/JSON\.stringify\(\[projectId, issueId\]\)/);assert.match(hook,/activeScope\.current === scope/);
 assert.doesNotMatch(read('src/components/maintenance/maintenanceComposerDraft.ts'),/preview|localStorage|sessionStorage/);
});
test('legacy maintenance browser mock initializes identity only at its synthetic UserContext boundary',()=>{
 const mock=read('tests/support/maintenanceMock.js');assert.match(mock,/import \{ setDocumentDraftActor \} from '\.\.\/\.\.\/src\/lib\/documentDrafts'/);
 assert.match(mock,/setDocumentDraftActor\(account\);/);
 assert.doesNotMatch(read('src/components/maintenance/useMaintenanceComposer.ts'),/setDocumentDraftActor/);
 const mobile=read('tests/auditMobileWorkspaces.browser.cjs'),short=read('tests/auditShortLandscape.browser.cjs');
 assert.match(mobile,/demo=admin/);assert.match(short,/demo=admin/);
 assert.doesNotMatch(short,/find:.*UserContext/);
});
