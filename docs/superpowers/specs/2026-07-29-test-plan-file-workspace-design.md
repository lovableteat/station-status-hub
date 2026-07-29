# Test_Plan File Workspace Design

## Goal

Add a `Test_Plan` page to the maintenance workspace where each signed-in user can create personal spaces and nested folders, then upload, organize, search, download, rename, move, and delete engineering files. PowerPoint, Excel, common documents and images, 3D CAD/model files, and PCB `.brd` files are first-class formats.

## Context and decision

Three approaches were considered:

1. Reuse the current Tools & Assets table. This has working upload code, but its flat asset model cannot represent personal spaces or nested folders without coupling two unrelated workflows.
2. Store everything only in browser storage. This avoids database work but fails across computers and cannot safely store large CAD files.
3. Create a dedicated Supabase-backed Test_Plan domain and reuse the platform shell and visual system.

Approach 3 is selected. It keeps Test_Plan independent, supports large binary files, and follows the existing Supabase and permission patterns. The user's standing instruction to execute without further questions is treated as approval of this recommended design.

## Placement and permissions

- `Test_Plan` appears as a new item in the left navigation of the machine-maintenance workspace shown in the reference screenshot.
- The URL contract is `?workspace=station-status&module=test-plan`.
- New `test_plan_view` and `test_plan_edit` page permissions are added.
- Administrators retain the platform's existing permission override.
- Standard users require both station-workspace access and the matching Test_Plan page permission.
- Data queries are scoped to the current custom-login `system_users.id`.

## Information architecture

The page uses the existing maintenance shell and a three-part file-manager layout:

- Header: page identity, storage and file metrics, search, category filter, sort, list/grid toggle, create-space, create-folder, and upload actions.
- Left rail: personal spaces followed by the current space's nested folder tree. The active location and item counts remain visible.
- Main content: breadcrumb, drop zone, folder entries, and file entries. Empty states explain the next valid action.
- Dialogs: create/rename space, create/rename folder, move file/folder, file details, and destructive confirmation.

On narrow screens, the left rail becomes a drawer and the file toolbar wraps into two compact rows. No desktop-only operation is required to manage files.

## Data model

### `test_plan_spaces`

- `id uuid primary key`
- `owner_id uuid not null references system_users(id)`
- `name text not null`
- `description text`
- `color text not null`
- `created_at`, `updated_at`
- Unique normalized name per owner.

### `test_plan_folders`

- `id uuid primary key`
- `space_id uuid not null references test_plan_spaces(id) on delete cascade`
- `parent_id uuid references test_plan_folders(id) on delete cascade`
- `name text not null`
- `created_by uuid not null references system_users(id)`
- `created_at`, `updated_at`
- Unique normalized name within one parent location.
- A trigger rejects parent folders from another space and recursive parent cycles.

### `test_plan_files`

- `id uuid primary key`
- `space_id uuid not null references test_plan_spaces(id) on delete cascade`
- `folder_id uuid references test_plan_folders(id) on delete set null`
- `original_name text not null`
- `storage_path text not null unique`
- `mime_type text`
- `extension text not null`
- `category text not null`
- `file_size bigint not null`
- `description text`
- `uploaded_by uuid not null references system_users(id)`
- `created_at`, `updated_at`

Metadata and storage-object deletion are coordinated by the client. If metadata insertion fails after upload, the uploaded object is removed immediately.

## Storage and supported files

- Private bucket: `test-plan-files`.
- Object path: `<owner-id>/<space-id>/<uuid>-<sanitized-original-name>`.
- Maximum file size: 500 MiB per file.
- Maximum batch: 20 files.
- First-class categories:
  - presentation: `.ppt`, `.pptx`
  - spreadsheet: `.xls`, `.xlsx`, `.xlsm`, `.csv`
  - document: `.pdf`, `.doc`, `.docx`, `.txt`, `.md`
  - image: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`
  - 3D: `.step`, `.stp`, `.stl`, `.obj`, `.glb`, `.gltf`, `.3mf`, `.iges`, `.igs`
  - PCB: `.brd`, `.kicad_pcb`, `.gbr`, `.ger`, `.pho`
  - archive: `.zip`, `.7z`, `.rar`, `.tar`, `.gz`
- Unknown extensions remain uploadable as `other`; executable/script extensions are rejected.
- Downloads use Supabase Storage `download` so the private bucket never requires a public URL.

## Core behaviors

- A user with no spaces sees a focused create-space empty state.
- Creating the first space activates it automatically.
- Folder breadcrumbs support direct navigation to any ancestor.
- Drag-and-drop and the upload button use the same validated upload queue.
- Duplicate file names are allowed because storage paths are UUID-based.
- Search matches file and folder names within the active space.
- Category filters affect files but never hide folders.
- Sort options are name, newest, oldest, largest, and type.
- Rename validates trimmed names and conflicts before writing.
- Moving a folder cannot target itself or one of its descendants.
- Deleting a folder cascades metadata and removes every associated storage object before final metadata deletion.
- Deleting a space removes all storage objects, then the space and its cascading metadata.
- Partial batch upload reports individual failures and keeps successful uploads.

## Error handling

- The page has distinct loading, empty, offline/error, and permission-denied states.
- Upload progress is file-based and identifies failed file names.
- Database and storage error messages are presented in concise Traditional Chinese.
- Mutating controls are disabled for view-only users.
- Destructive operations require explicit confirmation and never silently discard metadata after storage cleanup fails.

## Visual direction

The page inherits the existing platform's navy surfaces, cyan focus color, compact 40px controls, 12–14px body typography, rounded 10–12px borders, and numeric monospace accents. Category colors are restrained and semantic; cyan remains the only primary action color. The file manager avoids nested-card repetition by using one rail, one content surface, and row/grid items separated by rules.

## Testing and acceptance

- Unit tests cover classification, blocked extensions, size/batch limits, path sanitization, descendant detection, breadcrumbs, sorting, and filtering.
- Source integration tests cover navigation, permission declarations, route rendering, database migration, private bucket, and all required file-format labels.
- Focused ESLint and production build must pass.
- Browser QA covers empty state, create space/folder, drag/drop upload, search/filter, rename/move/download/delete, list/grid views, and mobile drawer behavior.
- Before pushing, fetch `origin/main`, compare commits from other machines, integrate without force, rerun tests/build if the base changes, and only then push a fast-forward result to `main`.
