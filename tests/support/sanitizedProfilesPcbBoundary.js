// Combined synthetic boundary for the actual permission provider + PCB guard subtree.
import { supabase as profiles, fixture as profileFixture } from './sanitizedProfilesServices.js';
import { supabase as pcb, fixture as pcbFixture } from './pcbRecoveryServices.js';
export { useUser, useToast, toast, REALTIME_COLLABORATION_V2_ENABLED, mutateAuthAccount } from './sanitizedProfilesServices.js';
export const supabase = {
  ...profiles, auth: pcb.auth,
  schema(name) { return { rpc(rpc, args) { return rpc === 'list_system_user_profiles'
    ? profiles.schema(name).rpc(rpc, args) : pcb.schema(name).rpc(rpc, args); } }; },
};
profileFixture.pcb = pcbFixture;
