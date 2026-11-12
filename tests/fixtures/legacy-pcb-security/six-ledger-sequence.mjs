import {read} from './database.mjs';
export const tableLedgerNames=[
 '20261112073038_restrict_anonymous_test_progress_audit_access',
 '20261112073518_restrict_anonymous_tasks_access',
];
// Fixture only: exact historical statements run standalone before recording their
// bytes in the synthetic ledger. Embedded COMMIT is not a future runner template.
export async function applyTableLedgerFixtures(db){
 for(const name of tableLedgerNames){
  const sql=await read('../../../supabase/migrations/'+name+'.sql');
  await db.exec(sql);
  await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[name.slice(0,14),name.slice(15),[sql]]);
 }
}
// New pending v2 payload contains no transaction controls: retain atomic failure.
export async function executePendingStage(db,sql){
 await db.exec('begin');
 try{await db.exec(sql);await db.exec('commit');}
 catch(error){await db.exec('rollback');throw error;}
}
