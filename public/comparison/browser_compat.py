"""Browser-only compatibility fixes; the supplied AutoCheck engine stays intact."""
import hashlib
import io
import json
import math
import re


def _compat_tracking_rows(original):
    def expand_rows(findings, cap_rows=None, design=None):
        findings = list(findings)
        identities = {}
        rules = {'BOM_REF_UNRESOLVED', 'BOM_ALT_ORPHAN'}
        for finding in findings:
            if finding.rule not in rules:
                continue
            identity = finding.key or f'{finding.rule}|{finding.detail}'
            if finding.rule == 'BOM_ALT_ORPHAN':
                # Agile's diagnostic appends its physical spreadsheet row. It is
                # provenance, not the identity of the unmatched PN / Find Num.
                identity = re.sub(r'\s*\(row\s+\d+\)\s*$', '', identity, flags=re.I)
            identities[(finding.id, finding.rule, finding.detail)] = identity
        rows = original(findings, cap_rows, design)
        seen = {}
        for row in rows:
            identity = identities.get((row.gid, row.rule, row.detail))
            if identity is None:
                continue
            subject = json.dumps([identity, row.refdes, row.pins], ensure_ascii=False, separators=(',', ':'))
            key = f'{row.rule}|{hashlib.sha256(subject.encode("utf-8")).hexdigest()[:24]}'
            occurrence = seen.get(key, 0)
            seen[key] = occurrence + 1
            row.key = key if occurrence == 0 else f'{key}#{occurrence}'
        return rows
    expand_rows._autocheck_browser_compat = True
    return expand_rows


def _compat_pdf_normalizer(original, pdf_module):
    def normalize_pdf(pdf_path):
        from pypdf import PdfReader, PdfWriter, Transformation
        from pypdf.generic import NameObject, RectangleObject

        source = PdfReader(str(pdf_path))
        units = []
        for index, page in enumerate(source.pages):
            try:
                unit = float(page.get('/UserUnit', 1))
            except (TypeError, ValueError, OverflowError) as error:
                raise ValueError(f'PDF 第 {index + 1} 頁 UserUnit 必須是有限正數') from error
            if not math.isfinite(unit) or unit <= 0:
                raise ValueError(f'PDF 第 {index + 1} 頁 UserUnit 必須是有限正數')
            units.append(unit)
        buffer, notes = original(pdf_path)
        if all(unit == 1 for unit in units):
            return buffer, notes
        writer = PdfWriter()
        buffer.seek(0)
        writer.append(PdfReader(buffer))
        if len(writer.pages) != len(units):
            raise ValueError('PDF 正規化前後頁數不符')
        notes = list(notes)
        for index, (page, unit) in enumerate(zip(writer.pages, units)):
            if unit == 1:
                continue
            boxes = {}
            for name in ('/MediaBox', '/CropBox', '/BleedBox', '/TrimBox', '/ArtBox'):
                if name not in page:
                    continue
                values = tuple(float(value) * unit for value in page[name])
                if len(values) != 4 or not all(math.isfinite(value) for value in values):
                    raise ValueError(f'PDF 第 {index + 1} 頁 UserUnit 縮放後尺寸無效')
                boxes[name] = RectangleObject(values)
            page.add_transformation(Transformation((unit, 0, 0, unit, 0, 0)))
            for name, box in boxes.items():
                page[NameObject(name)] = box
            # pypdf.scale_by already transforms Rect but omits QuadPoints. Use
            # one shared transform for both instead, so neither is scaled twice.
            pdf_module._transform_annots(page, (unit, 0, 0, unit, 0, 0))
            prefix = f'page {index + 1}:'
            detail = f'UserUnit {unit:g} scaled into physical page, content and annotation coordinates'
            existing = next((i for i, note in enumerate(notes) if note.startswith(prefix)), None)
            if existing is None:
                notes.append(f'{prefix} {detail}')
            else:
                notes[existing] += f'; {detail}'
        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        return output, notes
    normalize_pdf._autocheck_browser_compat = True
    return normalize_pdf


def apply_browser_compat():
    from autocheck import tracking
    from autocheck.report import pdf_annotate

    if not getattr(tracking.expand_rows, '_autocheck_browser_compat', False):
        tracking.expand_rows = _compat_tracking_rows(tracking.expand_rows)
    if not getattr(pdf_annotate.normalize_pdf, '_autocheck_browser_compat', False):
        pdf_annotate.normalize_pdf = _compat_pdf_normalizer(pdf_annotate.normalize_pdf, pdf_annotate)


apply_browser_compat()
