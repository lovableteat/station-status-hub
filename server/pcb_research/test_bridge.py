import contextlib
import http.client
import io
import threading
import unittest

from .bridge import ConvertedBoard, RequestHandler, ThreadingHTTPServer, check_source, parse_board


class BoardImport(unittest.TestCase):
    def test_outline_inner_layer_locked_component_and_copper_are_preserved(self):
        board, warnings = parse_board('''
          (kicad_pcb
           (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
           (gr_rect (start 100 200) (end 140 230) (layer "Edge.Cuts"))
           (gr_circle (center 120 220) (end 121 220) (layer "Edge.Cuts"))
           (net 1 "SDA")
           (footprint "A" locked (layer "F.Cu") (at 110 210 90)
             (property "Reference" "U1")
             (fp_rect (start -2 -3) (end 2 3) (layer "F.CrtYd"))
             (pad "1" smd rect (at 1 0 90) (size 1 2) (layers "F.Cu" "F.Mask") (net 1 "SDA"))
             (pad "2" np_thru_hole circle (at 0 1) (size 0 0) (drill oval 1.2 0.7) (layers "*.Cu"))
             (pad "3" smd rect (at 0 0) (size 0 0) (layers "F.Cu") (net "SDA")))
           (segment locked (start 110 209) (end 112 209) (width 0.2) (layer "F.Cu") (net 1))
           (via (at 112 209) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net "SDA"))
           (zone (layer "In1.Cu") (keepout (tracks not_allowed) (vias not_allowed) (footprints allowed))
             (polygon (pts (xy 114 214) (xy 115 214) (xy 115 215) (xy 114 215)))))
        ''')
        self.assertEqual((board['width'], board['height']), (40, 30))
        self.assertEqual(board['layers'], ['F.Cu', 'In1.Cu', 'B.Cu'])
        self.assertEqual((board['components'][0]['rotation'], board['components'][0]['width'], board['components'][0]['height']), (270, 4, 6))
        self.assertTrue(board['components'][0]['locked'])
        self.assertEqual((board['pads'][0]['x'], board['pads'][0]['y'], board['pads'][0]['net']), (10, 9, 'SDA'))
        self.assertEqual((board['pads'][0]['width'], board['pads'][0]['height']), (2, 1))
        self.assertEqual((board['pads'][1]['width'], board['pads'][1]['height']), (1.2, 0.7))
        self.assertTrue(board['pads'][1]['obstacleOnly'])
        self.assertEqual(board['unresolvedNets'], ['SDA'])
        self.assertEqual(board['tracks'][0]['points'][-1], {'x': 12, 'y': 9})
        self.assertEqual(board['vias'][0]['layers'], board['layers'])
        self.assertEqual(board['keepouts'][0]['layers'], ['In1.Cu'])
        self.assertEqual(len(board['holes']), 1)
        self.assertTrue(warnings)

    def test_rejects_non_native_and_open_outline(self):
        with self.assertRaises(ValueError):
            check_source(b'<?xml version="1.0"?><eagle>')
        with self.assertRaises(ValueError):
            parse_board('(kicad_pcb (gr_line (start 0 0) (end 1 1) (layer "Edge.Cuts")))')

    def test_large_serialized_decoration_filter_preserves_copper_and_keeps_structure(self):
        content = '(kicad_pcb\n\t(footprint "U"\n\t\t(fp_line\n\t\t\t(layer "User.32")\n\t\t)\n\t\t(fp_arc\n\t\t\t(layer "F.CrtYd")\n\t\t)\n\t)\n\t(zone\n\t\t(filled_polygon\n\t\t\t(layer "In1.Cu")\n\t\t)\n\t)\n)'
        reader = ConvertedBoard(io.StringIO(content))
        normalized = reader.read(100_000)
        self.assertNotIn('User.32', normalized)
        self.assertNotIn('filled_polygon', normalized)
        self.assertIn('F.CrtYd', normalized)
        self.assertEqual(normalized.count('('), normalized.count(')'))

    def test_local_http_requires_matching_host_origin_and_token(self):
        with ThreadingHTTPServer(('127.0.0.1', 0), RequestHandler) as server:
            server.origins = {'https://allowed.example'}
            server.token = 'paired'
            server.job = threading.BoundedSemaphore()
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            headers = {'Host': '127.0.0.1:8766', 'Origin': 'https://allowed.example', 'Content-Type': 'application/octet-stream'}
            def request(method, overrides, data=None):
                with contextlib.closing(http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=2)) as client:
                    client.request(method, '/v1/board', data, {**headers, **overrides})
                    response = client.getresponse()
                    response.read()
                    return response.status, response.getheader('Access-Control-Allow-Origin')
            try:
                self.assertEqual(request('OPTIONS', {}), (204, 'https://allowed.example'))
                self.assertEqual(request('POST', {'Origin': 'https://other.example'}), (403, None))
                self.assertEqual(request('POST', {}), (401, 'https://allowed.example'))
                self.assertEqual(request('POST', {'x-pcb-research-token': 'paired'}, b'Eagle XML'.ljust(256)), (422, 'https://allowed.example'))
            finally:
                server.shutdown()
                thread.join()


if __name__ == '__main__':
    unittest.main()
