import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const nativePython = process.env.AUTOCHECK_PYTHON;
const nativeOnly = { skip: !nativePython && 'Set AUTOCHECK_PYTHON and PYTHONPATH for native engine compatibility regressions' };
const root = new URL('../../public/comparison/', import.meta.url);
const setup = String.raw`
import importlib.util
from pathlib import Path
import sys
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location('autocheck_browser_compat', sys.argv[2])
compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compat)
`;

function runPython(script) {
  const result = spawnSync(nativePython, ['-c', setup + script, fileURLToPath(new URL('engine/', root)), fileURLToPath(new URL('browser_compat.py', root))], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('Browser tracking keeps new BOM token identities stable across reordering and shared sockets without changing old keys', nativeOnly, () => {
  runPython(String.raw`
from autocheck.findings import Finding
from autocheck import tracking

def unresolved(token, pn, refs=()):
    return Finding(category='BOMCHK', rule='BOM_REF_UNRESOLVED', severity='WARN', title=f'{token}: {pn}',
                   detail=f'cannot map {token} {pn}', refdes=list(refs),
                   key=f'BOM_REF_UNRESOLVED|{token}|{pn}').finalize()

def orphan(pn, find, physical_row):
    detail = f'substitute {pn} (Find Num {find}) matches no single main item (row {physical_row})'
    return Finding(category='BOMCHK', rule='BOM_ALT_ORPHAN', severity='WARN', title=f'orphan {pn}', detail=detail,
                   key=f'BOM_ALT_ORPHAN|{detail}').finalize()

old = Finding(category='BOMCHK', rule='BOM_REF_NOT_IN_NETLIST', severity='ERROR', title='old rule',
              refdes=['X1'], key='unchanged finding identity').finalize()
pin = Finding(category='CONN', rule='PIN_MOVED', severity='WARN', title='old pin rule', pins=['U1.1']).finalize()
a = unresolved('FOR J2', 'PN_A', ['J2'])
b = unresolved('FOR J2', 'PN_B', ['J2'])
c = unresolved('UNKNOWN A', 'PN_C')
d = unresolved('UNKNOWN B', 'PN_D')
before = tracking.expand_rows([a, b, c, d, orphan('ALT_A', '10', 30), orphan('ALT_B', '11', 31), old, pin])
after = tracking.expand_rows([orphan('ALT_B', '11', 310), d, b, old, orphan('ALT_A', '10', 4), c, a, pin])
keys = lambda rows: {row.title: row.key for row in rows}
assert keys(before) == keys(after), (keys(before), keys(after))
assert len({row.key for row in before}) == len(before)
assert keys(before)['old rule'] == 'BOM_REF_NOT_IN_NETLIST|X1'
assert keys(before)['old pin rule'] == 'PIN_MOVED|U1.1'
assert all(row.dest for row in before)
duplicates = tracking.expand_rows([a, a])
assert len({row.key for row in duplicates}) == 2
assert duplicates[1].key.endswith('#1')
installed = tracking.expand_rows
compat.apply_browser_compat()
assert tracking.expand_rows is installed
from autocheck.tracking import expand_rows as imported_for_reports
assert imported_for_reports is installed
print('tracking reorder, empty subjects, shared sockets, duplicates and original keys verified')
`);
});

test('Browser PDF compatibility preserves physical dimensions, glyphs and Rect/QuadPoints for nonunit UserUnit pages', nativeOnly, () => {
  runPython(String.raw`
import io
import math
import tempfile
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, RectangleObject, TextStringObject
from reportlab.pdfgen import canvas
from autocheck.report import pdf_annotate

def make_pdf(path, units):
    source = io.BytesIO()
    drawing = canvas.Canvas(source, pagesize=(300, 400))
    for i in range(len(units)):
        drawing.drawString(50, 100, f'UNITMARK{i}')
        drawing.showPage()
    drawing.save()
    writer = PdfWriter()
    writer.append(PdfReader(source))
    for i, (page, unit) in enumerate(zip(writer.pages, units)):
        page[NameObject('/UserUnit')] = unit
        if i == 1:
            page[NameObject('/Rotate')] = NumberObject(90)
            page.cropbox = RectangleObject((10, 20, 290, 380))
        annotation = DictionaryObject({
            NameObject('/Type'): NameObject('/Annot'), NameObject('/Subtype'): NameObject('/Link'),
            NameObject('/Rect'): RectangleObject((45, 95, 130, 115)),
            NameObject('/QuadPoints'): ArrayObject([FloatObject(v) for v in (45, 115, 130, 115, 45, 95, 130, 95)]),
        })
        page[NameObject('/Annots')] = ArrayObject([writer._add_object(annotation)])
    with open(path, 'wb') as output:
        writer.write(output)

def close(actual, expected):
    assert len(actual) == len(expected)
    assert all(math.isclose(a, e, rel_tol=1e-7, abs_tol=1e-6) for a, e in zip(actual, expected)), (actual, expected)

with tempfile.TemporaryDirectory() as temporary:
    normal = Path(temporary) / 'unit-baseline.pdf'
    scaled = Path(temporary) / 'unit-scaled.pdf'
    make_pdf(normal, [FloatObject(1)] * 3)
    make_pdf(scaled, [FloatObject(2), FloatObject(0.5), FloatObject(1)])
    baseline, _ = pdf_annotate.normalize_pdf(normal)
    installed = pdf_annotate.normalize_pdf
    compat.apply_browser_compat()
    assert pdf_annotate.normalize_pdf is installed
    result, notes = pdf_annotate.normalize_pdf(scaled)
    base_pages, result_pages = PdfReader(baseline).pages, PdfReader(result).pages
    factors = [2, 0.5, 1]
    for base, page, factor in zip(base_pages, result_pages, factors):
        close(tuple(float(x) for x in page.mediabox), tuple(float(x) * factor for x in base.mediabox))
        close(tuple(float(x) for x in page.cropbox), tuple(float(x) * factor for x in base.cropbox))
        assert '/UserUnit' not in page
        assert page.rotation == 0
        ba = base['/Annots'][0].get_object()
        ra = page['/Annots'][0].get_object()
        close(tuple(float(x) for x in ra['/Rect']), tuple(float(x) * factor for x in ba['/Rect']))
        close(tuple(float(x) for x in ra['/QuadPoints']), tuple(float(x) * factor for x in ba['/QuadPoints']))
    baseline.seek(0)
    result.seek(0)
    with pdfplumber.open(baseline) as bp, pdfplumber.open(result) as rp:
        for i, (base, page, factor) in enumerate(zip(bp.pages, rp.pages, factors)):
            before = [word for word in base.extract_words() if word['text'] == f'UNITMARK{i}']
            after = [word for word in page.extract_words() if word['text'] == f'UNITMARK{i}']
            assert len(before) == len(after) == 1, (before, after)
            close(tuple(after[0][key] for key in ('x0', 'top', 'x1', 'bottom')),
                  tuple(before[0][key] * factor for key in ('x0', 'top', 'x1', 'bottom')))
    assert any('UserUnit 2 scaled' in note for note in notes)
    assert any('UserUnit 0.5 scaled' in note for note in notes)
    for invalid in [FloatObject(0), FloatObject(-1), TextStringObject('nan'), TextStringObject('inf'), TextStringObject('bad')]:
        make_pdf(scaled, [invalid])
        try:
            pdf_annotate.normalize_pdf(scaled)
        except ValueError as error:
            assert 'UserUnit' in str(error)
        else:
            raise AssertionError(f'invalid UserUnit accepted: {invalid}')
    make_pdf(scaled, [FloatObject(1e308)])
    try:
        pdf_annotate.normalize_pdf(scaled)
    except ValueError as error:
        assert 'UserUnit' in str(error)
    else:
        raise AssertionError('overflowing physical dimensions accepted')
print('mixed UserUnit, rotated cropbox, glyphs, annotations, warning and invalid-value guards verified')
`);
});
