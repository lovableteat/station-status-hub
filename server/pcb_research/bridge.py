"""Private, local Allegro board import for PCB Designer's research workspace."""

import argparse
import hmac
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


BOARD_SIZE = 512 * 1024 * 1024
INTERMEDIATE_SIZE = 1_200 * 1024 * 1024
RESULT_SIZE = 50 * 1024 * 1024
START_MARKER = re.compile(r'\s+|[()]|"(?:[^"\\]|\\.)*"|[^\s()"]+')
UNNEEDED_FILLED_REGION = re.compile(r'^(\t\t)\(filled_polygon[ \t]*\r?\n$')
FOOTPRINT_GRAPHIC = re.compile(r'^\t\t\(fp_(?:line|arc|rect|circle|curve|poly)[ \t]*\r?\n$')
GEOMETRY_LAYERS = {f'{side}.{layer}' for side in ('F', 'B') for layer in ('Fab', 'CrtYd', 'Cu')}
KEPT_TAGS = {'layers', 'net', 'footprint', 'module', 'segment', 'arc', 'via', 'zone', 'gr_line', 'gr_arc', 'gr_rect', 'gr_circle', 'gr_curve', 'gr_poly'}
ROUTE_LIMITS = '研究試排用。原始 Allegro 規則只部分轉換，阻抗、等長和特殊製程規則請另行核對。'


def tokens(source):
    """Lex a streaming KiCad file and keep quoted strings distinct from delimiters."""
    pending = ''
    while True:
        chunk = source.read(128 * 1024)
        pending += chunk
        position = 0
        while position < len(pending):
            match = START_MARKER.match(pending, position)
            if not match:
                break
            raw = match[0]
            if chunk and match.end() == len(pending) and not raw.isspace() and raw not in ('(', ')') and not raw.startswith('"'):
                break
            position = match.end()
            if raw.isspace():
                continue
            if raw.startswith('"'):
                yield ('s', re.sub(r'\\(["\\])', r'\1', raw[1:-1]))
            else:
                yield ('p' if raw in ('(', ')') else 's', raw)
        pending = pending[position:]
        if not chunk:
            if pending:
                raise ValueError('轉換後的板檔包含不完整的欄位。')
            return
        if len(pending) > 256 * 1024:
            raise ValueError('轉換後的板檔含有超出上限的欄位。')


def flattened_nodes(source):
    parts = iter(tokens(source))
    if next(parts, None) != ('p', '(') or next(parts, None) != ('s', 'kicad_pcb'):
        raise ValueError('本機工具未產生有效的 KiCad 板檔。')
    for kind, value in parts:
        if (kind, value) == ('p', ')'):
            if next(parts, None) is None:
                return
            break
        if (kind, value) != ('p', '('):
            break
        kind, tag = next(parts, ('', ''))
        if kind != 's':
            break
        selected = tag in KEPT_TAGS
        stack = [[tag]]
        skipped = 0
        for kind, value in parts:
            if kind == 'p' and value == '(':
                if skipped:
                    skipped += 1
                    continue
                kind, name = next(parts, ('', ''))
                if kind != 's':
                    raise ValueError('轉換後的板檔格式不完整。')
                if not selected or name in {'filled_polygon', 'fill_segments', 'model'}:
                    skipped = 1
                    continue
                if len(stack) >= 32:
                    raise ValueError('轉換後的板檔欄位巢狀過深。')
                stack.append([name])
            elif kind == 'p' and value == ')':
                if skipped:
                    skipped -= 1
                    continue
                node = stack.pop()
                if not stack:
                    if selected:
                        yield node
                    break
                stack[-1].append(node)
            elif selected and not skipped:
                stack[-1].append(value)
        else:
            break
    raise ValueError('轉換後的板檔格式不完整。')


class ConvertedBoard:
    """KiCad's own pretty-printer gives large derived copper fills distinct indentation."""

    def __init__(self, source):
        self.source = source

    def read(self, size):
        lines, length = [], 0
        while length < size:
            line = self.source.readline()
            if not line:
                break
            if UNNEEDED_FILLED_REGION.match(line):
                for fill_line in self.source:
                    if fill_line.rstrip('\r\n') == '\t\t)':
                        break
                    if not fill_line.startswith('\t\t\t'):
                        raise ValueError('轉換後的銅箔填充格式不完整。')
                else:
                    raise ValueError('轉換後的銅箔填充格式不完整。')
            elif FOOTPRINT_GRAPHIC.match(line):
                graphic_lines = [line]
                relevant = False
                for graphic_line in self.source:
                    graphic_lines.append(graphic_line)
                    if graphic_line.rstrip('\r\n') == '\t\t)':
                        break
                    if not graphic_line.startswith('\t\t\t'):
                        raise ValueError('轉換後的元件圖形格式不完整。')
                    if graphic_line.startswith('\t\t\t(layer '):
                        layer = graphic_line.strip().removeprefix('(layer ').removesuffix(')').strip('"')
                        relevant = layer in GEOMETRY_LAYERS
                else:
                    raise ValueError('轉換後的元件圖形格式不完整。')
                if relevant:
                    lines.extend(graphic_lines)
                    length += sum(map(len, graphic_lines))
            else:
                lines.append(line)
                length += len(line)
        return ''.join(lines)


def nodes(node, name):
    return (item for item in node[1:] if isinstance(item, list) and item[0] == name)


def prop(node, name):
    return next(nodes(node, name), [name])[1:]


def number(text):
    value = float(text)
    if not math.isfinite(value) or abs(value) > 1e8:
        raise ValueError('板檔中有無效的座標或尺寸。')
    return value


def position(values):
    if len(values) < 2:
        raise ValueError('板檔中有不完整的座標。')
    return number(values[0]), number(values[1])


def rotate(x, y, angle):
    radians = math.radians(angle)
    c, s = math.cos(radians), math.sin(radians)
    return x * c - y * s, x * s + y * c


def arc_points(a, b, c):
    """Sample the circular arc through three points, respecting sweep direction."""
    bx, by = b[0] - a[0], b[1] - a[1]
    cx, cy = c[0] - a[0], c[1] - a[1]
    tangent = 2 * (bx * cy - by * cx)
    if abs(tangent) < 1e-9:
        return [a, b, c]
    b2, c2 = bx * bx + by * by, cx * cx + cy * cy
    ox, oy = a[0] + (cy * b2 - by * c2) / tangent, a[1] + (bx * c2 - cx * b2) / tangent
    first, middle, last = (math.atan2(y - oy, x - ox) for x, y in (a, b, c))
    radius = math.hypot(a[0] - ox, a[1] - oy)
    sweep = (last - first) % math.tau
    if (middle - first) % math.tau > sweep + 1e-9:
        sweep -= math.tau
    steps = min(256, max(6, math.ceil(max(abs(sweep) * 12, abs(sweep) * math.sqrt(radius / 0.08)))))
    return [a] + [(ox + radius * math.cos(first + sweep * i / steps), oy + radius * math.sin(first + sweep * i / steps)) for i in range(1, steps)] + [c]


def graph_points(node):
    kind = node[0].split('_')[-1]
    if kind in ('line', 'segment', 'arc', 'rect'):
        a, b = position(prop(node, 'start')), position(prop(node, 'end'))
        if kind == 'arc':
            return arc_points(a, position(prop(node, 'mid')), b)
        if kind == 'rect':
            return [a, (b[0], a[1]), b, (a[0], b[1]), a]
        return [a, b]
    if kind == 'circle':
        center, end = position(prop(node, 'center')), position(prop(node, 'end'))
        radius = math.dist(center, end)
        count = 96
        ring = [(center[0] + radius * math.cos(i * math.tau / count), center[1] + radius * math.sin(i * math.tau / count)) for i in range(count)]
        return ring + ring[:1]
    if kind in ('poly', 'polygon'):
        points = [position(point[1:]) for point in prop(node, 'pts') if isinstance(point, list) and point[0] == 'xy']
        return points + points[:1]
    if kind == 'curve':
        points = [position(point[1:]) for point in prop(node, 'pts') if isinstance(point, list) and point[0] == 'xy']
        if len(points) != 4:
            raise ValueError('板框含有無法讀取的曲線。')
        path = []
        for step in range(65):
            t = step / 64
            weights = ((1-t)**3, 3*t*(1-t)**2, 3*t*t*(1-t), t**3)
            path.append(tuple(sum(weights[i] * points[i][axis] for i in range(4)) for axis in (0, 1)))
        return path
    return []


def make_outline(paths):
    by_ends = {}
    for index, path in enumerate(paths):
        for end in (path[0], path[-1]):
            by_ends.setdefault((round(end[0], 3), round(end[1], 3)), []).append(index)
    unused = set(range(len(paths)))
    rings = []
    while unused:
        ring = list(paths[unused.pop()])
        while math.dist(ring[0], ring[-1]) > 0.001:
            end = ring[-1]
            index = next((i for i in by_ends.get((round(end[0], 3), round(end[1], 3)), ()) if i in unused), None)
            if index is None:
                raise ValueError('找不到封閉且可辨識的板框，無法安全試走。')
            unused.remove(index)
            path = paths[index]
            ring.extend(path[1:] if math.dist(end, path[0]) <= 0.001 else path[-2::-1])
        if len(ring) >= 4:
            rings.append(ring[:-1])
    def area(ring):
        return abs(sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(ring, ring[1:] + ring[:1])))
    if not rings:
        raise ValueError('找不到封閉且可辨識的板框，無法安全試走。')
    outer = max(rings, key=area)
    def inside(point):
        x, y = point
        return sum((a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0] for a, b in zip(outer, outer[1:] + outer[:1])) % 2
    holes = [ring for ring in rings if ring is not outer]
    if any(not all(inside(point) for point in ring) for ring in holes):
        raise ValueError('板檔含多塊外框，請先以單板板檔開啟。')
    return outer, holes


def bounds(points):
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs), max(ys)


def pad_geometry(pad):
    def envelope(spec, shape, default_size):
        width, height = position(prop(spec, 'size') or default_size)
        if width < 0 or height < 0:
            raise ValueError('板檔中有負值的焊盤尺寸。')
        delta = prop(spec, 'rect_delta')
        if delta:
            dx, dy = position(delta)
            width, height = width + abs(dx), height + abs(dy)
        if shape == 'custom':
            for primitive in prop(spec, 'primitives'):
                if not isinstance(primitive, list):
                    continue
                points = graph_points(primitive)
                if not points:
                    raise ValueError('自訂焊盤圖元不支援，無法安全試走。')
                stroke = number((prop(primitive, 'width') or ['0'])[0])
                x0, y0, x1, y1 = bounds(points)
                width = max(width, 2 * max(abs(x0), abs(x1)) + stroke)
                height = max(height, 2 * max(abs(y0), abs(y1)) + stroke)
        return width, height

    width, height = envelope(pad, pad[3], [])
    drill = prop(pad, 'drill')
    dimensions = [number(item) for item in drill if isinstance(item, str) and item != 'oval']
    drill_width = dimensions[0] if dimensions else 0
    drill_height = dimensions[-1] if dimensions else 0
    offset = next((item[1:] for item in drill if isinstance(item, list) and item[0] == 'offset'), [])
    stack = prop(pad, 'padstack')
    for layer in (item for item in stack if isinstance(item, list) and item[0] == 'layer'):
        size = envelope(layer, (prop(layer, 'shape') or [pad[3]])[0], [width, height])
        width, height = max(width, size[0]), max(height, size[1])
    drill_only = width <= 0 or height <= 0
    width, height = max(width, drill_width), max(height, drill_height)
    if offset and not drill_only:
        dx, dy = position(offset)
        width, height = width + 2 * abs(dx), height + 2 * abs(dy)
    return width, height, drill_only or pad[3] == 'custom' or bool(stack) or bool(offset) or pad[2] == 'np_thru_hole'


def add_zones(zone, stack_layers, keepouts):
    sources = prop(zone, 'layers') or prop(zone, 'layer')
    zone_layers = copper_layers(sources, stack_layers)
    rules = {item[0]: item[1] for item in prop(zone, 'keepout') if isinstance(item, list) and len(item) > 1}
    placement = rules.get('footprints') == 'not_allowed'
    routing = (bool(zone_layers) and not rules) or any(rules.get(key) == 'not_allowed' for key in ('tracks', 'vias', 'pads'))
    if not placement and not routing:
        return
    for polygon in nodes(zone, 'polygon'):
        points = graph_points(polygon)
        if len(points) < 4:
            continue
        x0, y0, x1, y1 = bounds(points)
        if x1 <= x0 or y1 <= y0:
            continue
        keepouts.append({'id': f'keepout-{len(keepouts)}', 'x': x0, 'y': y0, 'width': x1-x0, 'height': y1-y0, 'points': points[:-1], 'kind': 'both' if placement and routing else 'placement' if placement else 'routing', **({'layers': zone_layers} if zone_layers else {})})


def parse_board(source):
    if isinstance(source, str):
        source = io.StringIO(source)
    else:
        source = ConvertedBoard(source)
    layers, paths, components, pads, keepouts, tracks, vias = [], [], [], [], [], [], []
    net_names = {}
    warnings = [ROUTE_LIMITS]
    shape_fallback = False
    approximate_arcs = False
    complex_pads = False
    copper_graphics = False
    missing_pads = 0
    missing_components = 0
    unresolved_nets = set()
    for node in flattened_nodes(source):
        tag = node[0]
        if tag == 'layers':
            layers = [item[1] for item in node[1:] if isinstance(item, list) and len(item) > 1 and isinstance(item[1], str) and item[1].endswith('.Cu')]
            layers.sort(key=lambda layer: 0 if layer == 'F.Cu' else 1000 if layer == 'B.Cu' else int(layer[2:].split('.')[0]) if re.match(r'^In\d+\.Cu$', layer) else 500)
        elif tag == 'net' and len(node) > 2:
            net_names[node[1]] = node[2]
        elif tag.startswith('gr_'):
            on_layer = prop(node, 'layer')
            if on_layer == ['Edge.Cuts']:
                points = graph_points(node)
                if points:
                    paths.append(points)
                    approximate_arcs |= tag in ('gr_arc', 'gr_curve', 'gr_circle')
            elif len(on_layer) == 1 and on_layer[0] in layers:
                points = graph_points(node)
                if len(points) < 2:
                    continue
                stroke = ['stroke', *prop(node, 'stroke')]
                width = number((prop(stroke, 'width') or prop(node, 'width') or ['0'])[0])
                if width > 0:
                    tracks.append({'id': f'track-{len(tracks)}', 'net': '', 'layer': on_layer[0], 'width': width, 'points': points, 'locked': True})
                if len(points) >= 4 and points[0] == points[-1] and prop(node, 'fill') in (['yes'], ['solid']):
                    x0, y0, x1, y1 = bounds(points)
                    keepouts.append({'id': f'keepout-{len(keepouts)}', 'x': x0, 'y': y0, 'width': x1-x0, 'height': y1-y0, 'points': points[:-1], 'kind': 'routing', 'layers': on_layer})
                copper_graphics = True
        elif tag in ('footprint', 'module'):
            at = prop(node, 'at')
            scale_x, scale_y = 1, 1
            if at:
                x, y = position(at)
                angle = -number(at[2]) % 360 if len(at) > 2 else 0
            else:
                transform = ['transform', *prop(node, 'transform')]
                x, y = position(prop(transform, 'translate'))
                angle = -number((prop(transform, 'rotate') or ['0'])[0]) % 360
                scale_x, scale_y = position(prop(transform, 'scale') or ['1', '1'])
                if abs(scale_x) != 1 or abs(scale_y) != 1:
                    raise ValueError('板檔含有非等比例縮放的元件，目前無法安全試走。')
            properties = [item for item in nodes(node, 'property') if len(item) > 2 and item[1] == 'Reference']
            labels = [item for item in nodes(node, 'fp_text') if len(item) > 2 and item[1] == 'reference']
            reference = (properties or labels or [['', '', '']])[0][2]
            side = 'bottom' if prop(node, 'layer') == ['B.Cu'] else 'top'
            prefix = 'B' if side == 'bottom' else 'F'
            component_id = f'component-{len(components)}' if reference else None
            footprint_points = []
            footprint_zones = list(nodes(node, 'zone'))
            # KiCad stores footprint zone polygons in board coordinates, including on B.Cu.
            for zone in footprint_zones:
                add_zones(zone, layers, keepouts)
            for mark in (item for item in node[1:] if isinstance(item, list) and item[0] in ('fp_line', 'fp_arc', 'fp_rect', 'fp_circle', 'fp_poly', 'fp_curve') and prop(item, 'layer') in ([f'{prefix}.CrtYd'], [f'{prefix}.Fab'])):
                footprint_points.extend((gx * scale_x, gy * scale_y) for gx, gy in graph_points(mark))
            pad_group = []
            for pad in nodes(node, 'pad'):
                if len(pad) < 4:
                    raise ValueError('板檔中有無法辨識的焊盤。')
                pad_at = prop(pad, 'at')
                dx, dy = position(pad_at)
                dx, dy = dx * scale_x, dy * scale_y
                width, height, obstacle_only = pad_geometry(pad)
                net = get_net(pad, net_names)
                if width <= 0 or height <= 0:
                    missing_pads += 1
                    if net:
                        unresolved_nets.add(net)
                    continue
                pad_angle = -number(pad_at[2]) if len(pad_at) > 2 else 0
                if pad[3] not in ('circle', 'oval', 'rect', 'roundrect', 'trapezoid', 'chamfered_rect', 'custom'):
                    raise ValueError('板檔含有目前不支援的焊盤形狀。')
                pad_layers = copper_layers(prop(pad, 'layers'), layers)
                if not pad_layers and pad[2] != 'np_thru_hole':
                    continue
                if pad[2] == 'np_thru_hole':
                    pad_layers = layers[:]
                shift_x, shift_y = rotate(dx, dy, angle)
                ext_x, ext_y = rotate(1, 0, pad_angle)
                envelope = round(abs(ext_x) * width + abs(ext_y) * height, 8), round(abs(ext_y) * width + abs(ext_x) * height, 8)
                local_x, local_y = rotate(1, 0, pad_angle - angle)
                local_w = (abs(local_x) * width + abs(local_y) * height) / 2
                local_h = (abs(local_y) * width + abs(local_x) * height) / 2
                footprint_points.extend([(dx-local_w, dy-local_h), (dx+local_w, dy+local_h)])
                pad_group.append({'id': f'pad-{len(pads) + len(pad_group)}', **({'componentId': component_id} if component_id else {}), 'net': net, 'x': x + shift_x, 'y': y + shift_y, 'width': envelope[0], 'height': envelope[1], 'layers': pad_layers, 'obstacleOnly': obstacle_only})
                complex_pads |= obstacle_only and pad[2] != 'np_thru_hole'
            if reference and footprint_points:
                left, top, right, bottom = bounds(footprint_points)
                cx, cy = rotate((left + right) / 2, (top + bottom) / 2, angle)
                locked = bool(footprint_zones) or 'locked' in node or prop(node, 'locked') == ['yes'] or any(item == ['locked'] for item in node)
                components.append({'id': component_id, 'reference': reference, 'x': x + cx, 'y': y + cy, 'width': right-left, 'height': bottom-top, 'rotation': angle, 'side': side, 'locked': locked})
                shape_fallback |= not any(isinstance(mark, list) and prop(mark, 'layer') == [f'{prefix}.CrtYd'] for mark in node[1:])
            else:
                missing_components += 1
            pads.extend(pad_group)
        elif tag in ('segment', 'arc'):
            points = graph_points(node)
            width = number(prop(node, 'width')[0])
            tracks.append({'id': f'track-{len(tracks)}', 'net': get_net(node, net_names), 'layer': prop(node, 'layer')[0], 'width': width, 'points': points, 'locked': True})
            approximate_arcs |= tag == 'arc'
        elif tag == 'via':
            x, y = position(prop(node, 'at'))
            diameter = number(prop(node, 'size')[0])
            for layer in (item for item in prop(node, 'padstack') if isinstance(item, list) and item[0] == 'layer'):
                diameter = max(diameter, number((prop(layer, 'size') or [diameter])[0]))
            in_layers = copper_layers(prop(node, 'layers'), layers)
            if len(in_layers) == 2:
                first, last = sorted(layers.index(layer) for layer in in_layers)
                in_layers = layers[first:last+1]
            if not in_layers or diameter <= 0:
                raise ValueError('板檔中有無法辨識的導通孔。')
            vias.append({'id': f'via-{len(vias)}', 'net': get_net(node, net_names), 'x': x, 'y': y, 'diameter': diameter, 'layers': in_layers, 'locked': True})
        elif tag == 'zone':
            add_zones(node, layers, keepouts)
        if len(components) > 25_000 or len(pads) > 160_000 or len(tracks) > 220_000 or len(vias) > 100_000 or len(keepouts) > 15_000 or len(paths) > 15_000:
            raise ValueError('板檔物件過多，已停止匯入，沒有截斷資料。')

    if not layers or not pads or not components:
        raise ValueError('轉換結果缺少銅層、元件或焊盤，無法建立試排板。')
    if shape_fallback:
        warnings.append('部分元件沒有 Courtyard，外型以裝配圖和焊盤的範圍估算。')
    if keepouts:
        warnings.append('試走會避開匯入的銅箔區與禁制區，且不重新鋪銅。')
    if approximate_arcs:
        warnings.append('部分圓弧以短線段表示。')
    if complex_pads:
        warnings.append('自訂焊盤及各層形狀不同的焊盤以外接範圍避讓，不作為自動接線端點。')
    if copper_graphics:
        warnings.append('銅層上的獨立圖形當作不可穿越的障礙物。')
    if missing_pads:
        warnings.append(f'{missing_pads} 個焊盤的轉換結果無有效尺寸，相關網路不會標為已連接。')
    if missing_components:
        warnings.append(f'{missing_components} 個元件缺少位號或可用的外形，無法放入試排畫布。')
    outer, holes = make_outline(paths)
    left, top, right, bottom = bounds(outer)
    if right <= left or bottom <= top:
        raise ValueError('板框尺寸無效。')
    def shifted(x, y):
        return {'x': round(x-left, 8), 'y': round(y-top, 8)}
    for group in (components, pads, vias, keepouts):
        for item in group:
            item.update(shifted(item['x'], item['y']))
    for track in tracks:
        track['points'] = [shifted(*point) for point in track['points']]
    for keepout in keepouts:
        keepout['points'] = [shifted(*point) for point in keepout['points']]
    return {'width': round(right-left, 8), 'height': round(bottom-top, 8), 'outline': [shifted(*point) for point in outer], 'holes': [[shifted(*point) for point in ring] for ring in holes], 'layers': layers, 'components': components, 'pads': pads, 'keepouts': keepouts, 'tracks': tracks, 'vias': vias, 'unresolvedNets': sorted(unresolved_nets)}, warnings


def copper_layers(names, layers):
    if '*.Cu' in names:
        return layers[:]
    return [layer for layer in layers if layer in names or (layer in ('F.Cu', 'B.Cu') and 'F&B.Cu' in names)]


def get_net(node, names):
    net = prop(node, 'net')
    if not net:
        return ''
    if len(net) > 1:
        return net[1]
    return names.get(net[0], '' if net[0] == '0' else net[0])


def check_source(header):
    family = int.from_bytes(header[2:4], 'little')
    if len(header) < 256 or not (0x13 <= family <= 0x19 or header[0xf8:0xfb] == b'all'):
        raise ValueError('只接受 Cadence Allegro 的二進位 .brd 板檔。')


class RequestHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, code, body):
        self.send_response(code)
        origin = self.headers.get('Origin')
        if origin in self.server.origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'content-type, x-pcb-research-token')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def error(self, status, message):
        self.reply(status, json.dumps({'error': message}, ensure_ascii=False).encode())

    def allowed_request(self):
        if self.path != '/v1/board':
            self.error(404, '找不到匯入功能。')
        elif self.headers.get('Host') != '127.0.0.1:8766' or self.headers.get('Origin') not in self.server.origins:
            self.error(403, '這個網站來源未獲本機工具允許。')
        else:
            return True
        return False

    def do_OPTIONS(self):
        if self.allowed_request():
            self.reply(204, b'')

    def do_POST(self):
        if not self.allowed_request():
            return
        if not hmac.compare_digest(self.headers.get('x-pcb-research-token', '').encode('utf-8'), self.server.token.encode('utf-8')):
            self.error(401, '配對碼不正確，請重新複製本機工具顯示的配對碼。')
            return
        if self.headers.get_content_type() != 'application/octet-stream' or self.headers.get('Transfer-Encoding'):
            self.error(415, '請用網頁選擇一份 .brd 板檔。')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 256 <= size <= BOARD_SIZE:
            self.error(413, '板檔太小或超過 512 MiB。')
            return
        if not self.server.job.acquire(blocking=False):
            self.error(429, '本機工具正在讀取另一份板檔，請稍後重試。')
            return
        try:
            self.connection.settimeout(30)
            with tempfile.TemporaryDirectory(prefix='pcb-research-') as folder:
                source = Path(folder) / 'input.brd'
                output = Path(folder) / 'output.kicad_pcb'
                header = self.rfile.read(256)
                check_source(header)
                with source.open('wb') as stream:
                    stream.write(header)
                    remaining = size - len(header)
                    while remaining:
                        data = self.rfile.read(min(remaining, 1024 * 1024))
                        if not data:
                            raise ValueError('板檔未完整讀取，請重新選擇。')
                        stream.write(data)
                        remaining -= len(data)
                report = Path(folder) / 'import.json'
                result = subprocess.run([self.server.kicad, 'pcb', 'import', '--format', 'auto', '--report-format', 'json', '--report-file', str(report), '-o', str(output), str(source)], cwd=folder, env={**os.environ, 'TMP': folder, 'TEMP': folder, 'TMPDIR': folder, 'KICAD_CONFIG_HOME': folder}, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                if result.returncode or not output.is_file():
                    raise ValueError('KiCad 無法讀取此 Allegro 板檔。請確認板檔完整且版本受目前的 KiCad 10 支援。')
                if output.stat().st_size > INTERMEDIATE_SIZE:
                    raise ValueError('轉換後板檔超過 1.2 GiB，本機工具已停止匯入。')
                with output.open(encoding='utf-8') as stream:
                    board, warnings = parse_board(stream)
                if report.is_file() and report.stat().st_size <= 2 * 1024 * 1024:
                    # Report can include source identifiers; only surface its warning state.
                    report_data = json.loads(report.read_text(encoding='utf-8'))
                    if report_data.get('warnings') or report_data.get('errors'):
                        warnings.append('KiCad 轉換回報警告，部分 Allegro 屬性可能沒有帶入。')
                body = json.dumps({'board': board, 'warnings': warnings}, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
                if len(body) > RESULT_SIZE:
                    raise ValueError('匯入結果超過 50 MiB，目前無法載入這份板檔，沒有截斷資料。')
            self.reply(200, body)
        except subprocess.TimeoutExpired:
            self.error(408, '本機板檔轉換超過四分鐘，已停止。')
        except TimeoutError:
            self.error(408, '等候瀏覽器的板檔資料逾時。')
        except (ValueError, IndexError, TypeError) as exc:
            self.error(422, str(exc) if isinstance(exc, ValueError) and exc.args and not isinstance(exc, UnicodeError) and re.match(r'^[\u3400-\u9fffK]', str(exc)) else '板檔轉換結果含有無法辨識的資料。')
        except (OSError, MemoryError):
            self.error(500, '本機板檔工具無法完成作業，請檢查 KiCad、磁碟空間和記憶體。')
        finally:
            self.server.job.release()


def main():
    parser = argparse.ArgumentParser(description='PCB Designer 本機板檔工具（需要 KiCad 10，僅接受 Allegro .brd）')
    parser.add_argument('--kicad-cli', default='kicad-cli', help='KiCad 10 的 kicad-cli 路徑或命令')
    parser.add_argument('--origin', action='append', required=True, help='准許連線的確切網站來源，可重複指定')
    args = parser.parse_args()
    origins = set(args.origin)
    for origin in origins:
        parsed = urlsplit(origin)
        if not parsed.netloc or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or not (parsed.scheme == 'https' or (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1'))):
            parser.error('--origin 必須是確切 HTTPS 來源，或本機的 HTTP 開發來源。')
    exe = shutil.which(args.kicad_cli)
    if not exe:
        parser.error('找不到 KiCad 10 的 kicad-cli，請用 --kicad-cli 指定完整路徑。')
    try:
        version = subprocess.run([exe, 'version'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=15, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except (OSError, subprocess.TimeoutExpired):
        parser.error('無法啟動 kicad-cli。')
    if version.returncode or not re.match(r'^10\.', version.stdout.strip()):
        parser.error('請使用 KiCad 10 的 kicad-cli。')
    with ThreadingHTTPServer(('127.0.0.1', 8766), RequestHandler) as server:
        server.origins = origins
        server.kicad = str(Path(exe).resolve())
        server.token = secrets.token_urlsafe(24)
        server.job = threading.BoundedSemaphore()
        print('PCB Designer 本機板檔工具已啟動。請把下列配對碼貼到網頁。', flush=True)
        print(server.token, flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
