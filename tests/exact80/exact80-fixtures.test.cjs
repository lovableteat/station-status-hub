const test=require('node:test'),assert=require('node:assert/strict');
const {responseFor,protectedProfile,ACTOR}=require('./exact80-fixtures.cjs');
const request={pathname:'/rest/v1/rpc/list_system_user_profiles',method:'POST',search:'?id=eq.'+ACTOR,headers:{'content-profile':'workspace',accept:'application/vnd.pgrst.object+json'},body:{}};
test('protected profile mock preserves the exact 16-column sanitized API contract',()=>{
 assert.deepEqual(Object.keys(protectedProfile).sort(),'id,username,display_name,role,status,permissions,created_by,created_at,updated_at,registration_requested_at,approved_at,approved_by,auth_user_id,auth_migrated_at,last_seen_at,avatar_path'.split(',').sort());
 assert.equal(Object.hasOwn(protectedProfile.permissions,'pcbDesignerWorkspace'),false);
 assert.equal(responseFor(request).data,protectedProfile);
 assert.deepEqual(responseFor({...request,headers:{'content-profile':'workspace',accept:'application/json'}}).data,[protectedProfile]);
});
test('protected denial never changes raw grants and cannot masquerade as an empty successful read',()=>{
 assert.equal(responseFor(request,{denyProtected:true}).status,403);
 const raw={pathname:'/rest/v1/system_users',method:'GET',search:'?select=permissions',headers:{}};
 assert.equal(responseFor(raw,{denyProtected:true}).kind,'raw-permissions-read');
 assert.equal(responseFor(raw,{denyProtected:true}).status,undefined);
 assert.equal(responseFor(raw,{denyRaw:true}).status,403);
});
test('unknown protected identities, schemas and parameterized calls remain blocked',()=>{
 for(const update of [{body:{p_user_id:ACTOR}},{body:[]},{body:true},{body:1},{body:'x'},{body:null},{headers:{'content-profile':'public'}},{search:'?id=eq.unknown'}])assert.equal(responseFor({...request,...update}).kind,'forbidden');
 for(const update of [{pathname:'/rest/v1/rpc/unexpected_rpc'},{pathname:'/rest/v1/rpc/save_pcb_designer_workspace_locked'}])assert.equal(responseFor({...request,...update}).kind,'forbidden');
});
