const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const services = path.join(__dirname, 'sanitizedProfilesPcbBoundary.js');
const aliases = new Set(['@/integrations/supabase/client', '@/components/auth/UserContext', '@/hooks/use-toast', '@/lib/realtimeCollaborationConfig', './authAccountSync']);
const excluded = new Map([
  ['@/components/account/PersonalProfileDialog', 'PersonalProfileDialog'], ['@/components/api-management/ApiManagementPage', 'ApiManagementPage'],
  ['@/components/collaboration/AdminCollaborationPanel', 'AdminCollaborationPanel'], ['./UserEditDialog', 'UserEditDialog'],
  ['./EngineerEditDialog', 'EngineerEditDialog'], ['./AdminSidebar', 'AdminSidebar'],
]);
async function buildSanitizedProfilesFixture() {
  const build = await require('esbuild').build({ absWorkingDir: root, entryPoints: ['tests/support/sanitizedProfilesFixture.jsx'],
    bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', outfile: 'profiles.js', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.DEV': 'false' },
    plugins: [{ name: 'synthetic-profile-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (aliases.has(args.path)) return { path: services };
        if (args.path === './hooks/usePcbWorkspace.ts') return { path: path.join(__dirname, 'pcbRecoveryWorkspaceProbe.jsx') };
        if (args.path === './hooks/usePcbProjectPresence.ts') return { path: path.join(__dirname, 'pcbRecoveryServices.js') };
        if (['./Pcb3DCanvas.tsx', './PcbStepModelDialog.tsx', '../data-center/stepImport.ts'].includes(args.path)) return { path: args.path, namespace: 'unexercised-cad' };
        if (excluded.has(args.path)) return { path: args.path, namespace: 'unexercised-profile-surface' };
        if (args.path.startsWith('@/')) return builder.resolve(path.join(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind });
      });
      builder.onLoad({ filter: /.*/, namespace: 'unexercised-cad' }, () => ({ loader: 'js', contents: "export function Pcb3DCanvasSafe(){throw new Error('No CAD in profile fixture')} export function PcbStepModelDialog(){return null} export function importStepModel(){throw new Error('No CAD import')}" }));
      builder.onLoad({ filter: /.*/, namespace: 'unexercised-profile-surface' }, args => ({ loader: 'js', contents: `export function ${excluded.get(args.path)}(){ return null; }` }));
    } }],
  });
  const inputs = Object.keys(build.metafile.inputs);
  for (const file of ['src/hooks/usePermissions.ts', 'src/components/admin/AdminPanel.tsx', 'src/components/admin/UserPermissionsDialog.tsx',
    'src/components/layout/PermissionGuard.tsx', 'src/components/pcb-designer/PcbDesignerWorkspace.tsx', 'src/components/pcb-designer/hooks/usePcbWorkspace.ts', 'src/components/pcb-designer/core/storage.ts',
    'src/lib/systemUserProfiles.ts', 'src/lib/permissionRefresh.mjs', 'src/lib/workspacePermissions.ts']) assert.ok(inputs.includes(file), `Actual consumer bundled: ${file}`);
  assert.ok(!inputs.some(file => file.startsWith('src/integrations/supabase/') || file.includes('node_modules/@supabase/')), 'No live Supabase config or SDK');
  assert.deepEqual(Object.values(build.metafile.outputs).flatMap(output => output.imports), [], 'No runtime imports');
  const css = await require('postcss')([require('tailwindcss')({ config: path.join(root, 'tailwind.config.ts') }), require('autoprefixer')])
    .process(fs.readFileSync(path.join(root, 'src/index.css'), 'utf8'), { from: path.join(root, 'src/index.css') });
  return { javascript: build.outputFiles.find(file => file.path.endsWith('.js')).text,
    css: css.css + '\n' + build.outputFiles.find(file => file.path.endsWith('.css')).text + '\n[data-testid="profile-draft"]{display:block;width:min(360px,95vw);height:44px} [data-testid="profile-access"]{display:block}',
    inputs: inputs.filter(file => file.startsWith('src/')) };
}
module.exports = { buildSanitizedProfilesFixture };
