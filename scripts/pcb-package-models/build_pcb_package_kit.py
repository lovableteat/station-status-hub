"""Builds the PCB Designer schematic package kit in Blender and exports it as GLB.

Run headless (Blender 5.2 LTS):
  blender -b --factory-startup --python scripts/pcb-package-models/build_pcb_package_kit.py -- <out.glb>

Every piece is a separate named object, authored in millimetres with Blender Z up
(glTF export turns it into +Y up). The web app assembles a component from these pieces at
its real 長 x 寬 x 高 (src/components/pcb-designer/core/packageModels.ts): bodies scale to the
component, leads / pins / balls keep their own cross-section and are repeated at a pitch,
so a big component never gets thick pins. These are schematic packages, not verified
footprints; a component with a STEP file always shows the STEP model instead.

Unit pieces (1 x 1 x 1, Z from 0 to 1) are scaled by the assembler. Pieces with a fixed
nominal size say so below.
"""

import math
import sys

import bmesh
import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "pcb-package-kit.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def material(name, rgb, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    # glTF stores linear colour; the converter turns it back into display RGB.
    linear = [((c / 255) / 12.92) if (c / 255) <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4 for c in rgb]
    bsdf.inputs["Base Color"].default_value = (*linear, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


MAT = {
    "mold": material("mold", (28, 31, 34), 0.0, 0.55),
    "ceramic": material("ceramic", (233, 229, 218), 0.0, 0.6),
    "coat": material("coat", (24, 24, 26), 0.0, 0.5),
    "mlcc": material("mlcc", (181, 140, 92), 0.0, 0.6),
    "tin": material("tin", (201, 204, 209), 0.9, 0.28),
    "gold": material("gold", (214, 178, 92), 0.95, 0.25),
    "substrate": material("substrate", (46, 92, 64), 0.0, 0.55),
    "solder": material("solder", (190, 194, 199), 0.85, 0.3),
    "ferrite": material("ferrite", (58, 61, 66), 0.1, 0.5),
    "nylon": material("nylon", (236, 228, 205), 0.0, 0.62),
    "aluminium": material("aluminium", (196, 202, 210), 0.8, 0.32),
    "sleeve": material("sleeve", (36, 60, 120), 0.0, 0.45),
    "mark": material("mark", (205, 210, 205), 0.0, 0.6),
}


def finish(obj, name, mat):
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(MAT[mat])
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def mesh_object(name, mat, build):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    return finish(obj, name, mat)


def unit_box(bm, bevel=0.0, segments=2):
    """1 x 1 x 1 box, centred in X/Y, Z from 0 to 1, optional bevel (relative)."""
    geom = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    return geom


def add_box(name, mat, bevel=0.0, segments=2, cuts=0):
    """cuts > 0 splits the flat faces into a grid, so painter-sorted renderers order large faces correctly."""
    def build(bm):
        unit_box(bm, bevel, segments)
        if cuts:
            bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    return mesh_object(name, mat, build)


def add_cylinder(name, mat, segments=32, bevel=0.0):
    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=0.5, radius2=0.5, depth=1.0)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
        if bevel > 0:
            top = [e for e in bm.edges if all(v.co.z > 0.99 for v in e.verts)]
            bmesh.ops.bevel(bm, geom=top, offset=bevel, segments=3, affect="EDGES", profile=0.5)
    return mesh_object(name, mat, build)


def add_sphere(name, mat):
    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.5)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    return mesh_object(name, mat, build)


def add_profile(name, mat, profile, width=1.0):
    """Closed XZ profile extruded along Y (centred), for leads and shells."""
    def build(bm):
        verts = [bm.verts.new((x, -width / 2, z)) for x, z in profile]
        face = bm.faces.new(verts)
        result = bmesh.ops.extrude_face_region(bm, geom=[face])
        moved = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=moved, vec=(0, width, 0))
    return mesh_object(name, mat, build)


# Generic bodies and terminals ------------------------------------------------------------
add_box("body_block", "mold", bevel=0.035, segments=3)       # IC / QFN / inductor bodies
add_box("chip_body", "ceramic", bevel=0.04, segments=2)      # chip resistor ceramic
add_box("chip_mlcc", "mlcc", bevel=0.06, segments=2)         # MLCC body
add_box("chip_coat", "coat")                                 # resistor top coat (thin)
add_box("terminal_cap", "tin", bevel=0.12, segments=3)       # wrap-around chip terminal
add_box("terminal_pad", "tin", bevel=0.05, segments=1)       # QFN / inductor pad
add_box("bga_substrate", "substrate", bevel=0.02, segments=1)
add_box("ferrite_body", "ferrite", bevel=0.09, segments=4)   # shielded inductor
add_box("header_base", "nylon", cuts=5)
add_box("header_wall", "nylon", cuts=5)
add_cylinder("pin1_mark", "mark", segments=20)
add_sphere("bga_ball", "solder")
add_cylinder("ecap_can", "aluminium", segments=36, bevel=0.06)
add_cylinder("ecap_sleeve", "sleeve", segments=36)
add_box("ecap_vent", "coat")

# Square header post with a pyramid tip: 1 x 1 cross-section, Z 0..1, tip from 0.9.
def build_post(bm):
    s = 0.5
    base = [bm.verts.new((x, y, 0)) for x, y in ((-s, -s), (s, -s), (s, s), (-s, s))]
    mid = [bm.verts.new((x, y, 0.9)) for x, y in ((-s, -s), (s, -s), (s, s), (-s, s))]
    tip = [bm.verts.new((x * 0.45, y * 0.45, 1.0)) for x, y in ((-s, -s), (s, -s), (s, s), (-s, s))]
    bm.faces.new(list(reversed(base)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((base[i], base[j], mid[j], mid[i]))
        bm.faces.new((mid[i], mid[j], tip[j], tip[i]))
    bm.faces.new(tip)
mesh_object("header_pin", "gold", build_post)

# Gull-wing lead, nominal: 1.0 mm from the body edge (X 0..1) to the toe, 0.15 mm thick,
# shoulder at Z 0.45 where it leaves the body, toe resting at Z 0. Width 1 (scaled to ~0.22).
t = 0.15
lead = [
    (0.00, 0.45), (0.22, 0.45), (0.30, 0.42), (0.46, 0.10), (0.54, 0.0), (1.00, 0.0),
    (1.00, t), (0.58, t), (0.50, 0.19), (0.36, 0.53), (0.26, 0.45 + t), (0.00, 0.45 + t),
]
add_profile("qfp_lead", "tin", lead)

# USB-C receptacle, nominal 8.94 x 7.35 x 3.26 mm: stadium shell open at the front (-Y),
# tongue inside, two rear legs. Assembled as one unit and fitted to the component box.
W, D, H, wall = 8.94, 7.35, 3.26, 0.22
r = H / 2
def stadium(radius, half_width, segments=10):
    pts = []
    for i in range(segments + 1):
        a = -math.pi / 2 + math.pi * i / segments
        pts.append((half_width - radius + radius * math.cos(a), r + radius * math.sin(a)))
    for i in range(segments + 1):
        a = math.pi / 2 + math.pi * i / segments
        pts.append((-half_width + radius + radius * math.cos(a), r + radius * math.sin(a)))
    return pts

def build_shell(bm):
    outer = stadium(r, W / 2)
    inner = stadium(r - wall, W / 2 - wall)
    n = len(outer)
    front_o = [bm.verts.new((x, -D / 2, z)) for x, z in outer]
    back_o = [bm.verts.new((x, D / 2, z)) for x, z in outer]
    front_i = [bm.verts.new((x, -D / 2, z)) for x, z in inner]
    back_i = [bm.verts.new((x, D / 2 - wall, z)) for x, z in inner]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front_o[i], front_o[j], back_o[j], back_o[i]))      # outside
        bm.faces.new((back_i[i], back_i[j], front_i[j], front_i[i]))      # inside
        bm.faces.new((front_i[i], front_i[j], front_o[j], front_o[i]))    # front lip (opening stays open)
    bm.faces.new(list(reversed(back_o)))                                   # closed back
    bm.faces.new(back_i)
mesh_object("usbc_shield", "aluminium", build_shell)

def build_tongue(bm):
    unit_box(bm)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(W * 0.62, D * 0.72, 0.7))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, -D * 0.06, H / 2 - 0.35))
mesh_object("usbc_tongue", "coat", build_tongue)

def build_contacts(bm):
    for k in range(12):
        x = -W * 0.27 + k * (W * 0.54 / 11)
        for z in (H / 2 + 0.36, H / 2 - 0.42):
            geom = bmesh.ops.create_cube(bm, size=1.0)
            vs = geom["verts"]
            bmesh.ops.scale(bm, verts=vs, vec=(0.18, D * 0.5, 0.06))
            bmesh.ops.translate(bm, verts=vs, vec=(x, -D * 0.12, z))
mesh_object("usbc_contact", "gold", build_contacts)

def build_legs(bm):
    for x in (-W / 2 + 0.35, W / 2 - 0.35):
        for y in (-D * 0.18, D * 0.32):
            geom = bmesh.ops.create_cube(bm, size=1.0)
            vs = geom["verts"]
            bmesh.ops.scale(bm, verts=vs, vec=(0.5, 0.9, 0.5))
            bmesh.ops.translate(bm, verts=vs, vec=(x, y, 0.25))
mesh_object("usbc_shield_leg", "aluminium", build_legs)

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_yup=True, export_apply=True,
    export_materials="EXPORT", export_normals=True, export_texcoords=False, export_cameras=False, export_lights=False,
)
print("PCB_KIT_EXPORTED", OUT, len(scene.collection.objects))
