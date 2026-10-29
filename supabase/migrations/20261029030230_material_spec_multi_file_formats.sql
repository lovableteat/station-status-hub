-- Multiple raw files are uploaded separately; archives are optional, never required.
-- Private storage and existing material view/edit permissions stay in force.
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = null
where id = 'material-spec-documents';

alter policy "material-spec-documents-insert" on storage.objects
with check (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
  and name ~ '^[^/]+/[^/]+/[^/]+$'
  and name ~* '[.](pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|png|jpg|jpeg|webp|gif|bmp|tif|tiff|svg|txt|csv|tsv|json|xml|md|log|glb|gltf|stp|step|stl|obj|mtl|igs|iges|3mf|fbx|ply|wrl|vrml|dwg|dxf|brd|pcb|sch|dsn|olb|dra|psm|pad|kicad_pcb|kicad_sch|kicad_mod|kicad_sym|lib|gbr|gerber|drl|ipt|iam|sldprt|sldasm|prt|asm|zip|7z|rar)$'
);

alter policy "material-spec-documents-update" on storage.objects
with check (
  bucket_id = 'material-spec-documents'
  and (select workspace.current_user_can_workspace('material-requests', 'edit'))
  and name ~ '^[^/]+/[^/]+/[^/]+$'
  and name ~* '[.](pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|png|jpg|jpeg|webp|gif|bmp|tif|tiff|svg|txt|csv|tsv|json|xml|md|log|glb|gltf|stp|step|stl|obj|mtl|igs|iges|3mf|fbx|ply|wrl|vrml|dwg|dxf|brd|pcb|sch|dsn|olb|dra|psm|pad|kicad_pcb|kicad_sch|kicad_mod|kicad_sym|lib|gbr|gerber|drl|ipt|iam|sldprt|sldasm|prt|asm|zip|7z|rar)$'
);
