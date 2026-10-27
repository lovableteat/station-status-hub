-- Version matches production. Historical actor ids must not make account deletion depend on contact CAS versions.
alter table workspace.company_supplier_contacts
  drop constraint company_supplier_contacts_updated_by_fkey;
