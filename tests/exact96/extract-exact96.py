"""Extract only hash-pinned research inputs from an already-authorized Actions ZIP.
No network, no deploy, no source rewriting. Excluded archive members are skipped.
"""
import hashlib, json, pathlib, sys, tarfile, zipfile
archive, destination, manifest_file = map(pathlib.Path, sys.argv[1:4])
manifest = json.loads(manifest_file.read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['sourceArtifactSha256'], 'Source archive SHA mismatch'
allowed = manifest['oldAllowedBoot']; found = set()
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as z:
    names = z.namelist()
    assert names == ['artifact.tar'], 'Unexpected archive envelope'
    assert z.getinfo('artifact.tar').file_size < 150_000_000, 'Unexpected archive size'
    with z.open('artifact.tar') as stream, tarfile.open(fileobj=stream, mode='r|*') as tar:
        for member in tar:
            name = member.name.removeprefix('./')
            if name not in allowed: continue
            assert member.isfile() and name not in found, 'Non-regular or duplicated selected member'
            assert member.size == allowed[name]['bytes'], 'Selected member size mismatch'
            assert not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts
            assert 'MaterialRequestPage' not in name and 'materialRequestSeed' not in name and not name.endswith('.map')
            content = tar.extractfile(member).read()
            assert hashlib.sha256(content).hexdigest() == allowed[name]['sha256'], 'Selected member hash mismatch'
            target = destination/name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(content); found.add(name)
assert found == set(allowed), f'Missing selected entries: {set(allowed)-found}'
print(json.dumps({'archiveVerified': True, 'selectedFiles': len(found), 'source':manifest['sourceCommit'], 'excludedMembersNotExtracted':True}))
