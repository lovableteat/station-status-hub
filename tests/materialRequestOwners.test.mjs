import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
const {React,create,act,loader,deferred}=createRequire(import.meta.url)("./support/renderHarness.cjs");

test("the account directory works with a Supabase thenable and ignores a late result after switching accounts", async () => {
  const old=deferred(),current=deferred();let calls=0;
  const load=loader({mocks:{"@/integrations/supabase/client":{supabase:{rpc:()=>({then:(...args)=>(calls++ === 0 ? old.promise : current.promise).then(...args)})}}}});
  const {useMaterialRequestOwners}=load("src/components/material-requests/useMaterialRequestOwners.ts");
  let result;
  function View({account}) {result=useMaterialRequestOwners(true,account);return null;}
  let root;await act(async ()=>{root=create(React.createElement(View,{account:"A"}));});
  await act(async ()=>{root.update(React.createElement(View,{account:"B"}));});
  await act(async ()=>current.resolve({data:[{user_id:"B",display_name:"當前帳號",username:"b"}],error:null}));
  assert.equal(result.owners[0].name,"當前帳號");
  await act(async ()=>old.resolve({data:[{user_id:"A",display_name:"舊帳號",username:"a"}],error:null}));
  assert.equal(result.owners[0].id,"B");
  act(()=>root.unmount());
});

test("a failed directory request displays an error without pretending that a request owner was saved", async () => {
  const load=loader({mocks:{"@/integrations/supabase/client":{supabase:{rpc:()=>Promise.reject(new Error("offline"))}}}});
  const {useMaterialRequestOwners}=load("src/components/material-requests/useMaterialRequestOwners.ts");
  let result;
  function View(){result=useMaterialRequestOwners(true,"A");return null;}
  let root;await act(async ()=>{root=create(React.createElement(View));});
  assert.equal(result.owners.length,0);
  assert.match(result.error,/名單載入失敗/);
  act(()=>root.unmount());
});
