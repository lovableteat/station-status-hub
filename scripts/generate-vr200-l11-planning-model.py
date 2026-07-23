import argparse
import hashlib
import json
import os
from datetime import datetime, timezone

import FreeCAD
import Import
import Part


WIDTH_MM = 600.0
DEPTH_MM = 1200.0
HEIGHT_MM = 2200.0
RACK_UNIT_MM = 44.45
CAPACITY_U = 42


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate an explicit placeholder envelope while the VR200 L11 source model is unavailable.",
    )
    parser.add_argument("--step-output", default=os.environ.get("STEP_OUTPUT"))
    parser.add_argument("--glb-output", default=os.environ.get("GLB_OUTPUT"))
    parser.add_argument("--metadata", default=os.environ.get("MODEL_METADATA"))
    args, _ = parser.parse_known_args()
    if not args.step_output or not args.glb_output or not args.metadata:
        parser.error("--step-output, --glb-output, and --metadata are required.")
    return args


def add_feature(document, label, shape, color):
    feature = document.addObject("PartDesign::Feature", label.replace(" ", "_"))
    feature.Label = label
    feature.Shape = shape
    try:
        feature.ViewObject.ShapeColor = color
        feature.ViewObject.LineColor = color
    except AttributeError:
        pass
    return feature


def box(width, depth, height, x, y, z):
    return Part.makeBox(
        width,
        depth,
        height,
        FreeCAD.Vector(x, y, z),
    )


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


args = parse_args()
step_path = os.path.abspath(args.step_output)
glb_path = os.path.abspath(args.glb_output)
metadata_path = os.path.abspath(args.metadata)
document = FreeCAD.newDocument("VR200L11PlanningCabinet")

try:
    frame_color = (0.12, 0.18, 0.23)
    rail_color = (0.36, 0.46, 0.53)
    panel_color = (0.07, 0.11, 0.15)
    accent_color = (0.08, 0.55, 0.65)
    objects = []

    objects.append(
        add_feature(
            document,
            "L11 Base Plinth",
            box(WIDTH_MM, DEPTH_MM, 65, -WIDTH_MM / 2, -DEPTH_MM / 2, 0),
            panel_color,
        ),
    )
    objects.append(
        add_feature(
            document,
            "L11 Top Cap",
            box(WIDTH_MM, DEPTH_MM, 55, -WIDTH_MM / 2, -DEPTH_MM / 2, HEIGHT_MM - 55),
            panel_color,
        ),
    )

    post = 45.0
    for x_name, x in (("Left", -WIDTH_MM / 2), ("Right", WIDTH_MM / 2 - post)):
        for y_name, y in (("Front", -DEPTH_MM / 2), ("Rear", DEPTH_MM / 2 - post)):
            objects.append(
                add_feature(
                    document,
                    f"{x_name} {y_name} Upright",
                    box(post, post, HEIGHT_MM - 120, x, y, 65),
                    frame_color,
                ),
            )

    inner_width = WIDTH_MM - post * 2
    inner_depth = DEPTH_MM - post * 2
    for level_name, z in (("Lower", 65), ("Upper", HEIGHT_MM - 100)):
        for y_name, y in (("Front", -DEPTH_MM / 2), ("Rear", DEPTH_MM / 2 - post)):
            objects.append(
                add_feature(
                    document,
                    f"{level_name} {y_name} Cross Beam",
                    box(inner_width, post, 35, -inner_width / 2, y, z),
                    frame_color,
                ),
            )
        for x_name, x in (("Left", -WIDTH_MM / 2), ("Right", WIDTH_MM / 2 - post)):
            objects.append(
                add_feature(
                    document,
                    f"{level_name} {x_name} Depth Beam",
                    box(post, inner_depth, 35, x, -inner_depth / 2, z),
                    frame_color,
                ),
            )

    rail_height = CAPACITY_U * RACK_UNIT_MM
    rail_bottom = (HEIGHT_MM - rail_height) / 2
    rail_width = 22.0
    rail_depth = 28.0
    front_rail_y = -DEPTH_MM / 2 + 72
    rear_rail_y = DEPTH_MM / 2 - 72 - rail_depth
    for x_name, x in (("Left", -WIDTH_MM / 2 + 52), ("Right", WIDTH_MM / 2 - 52 - rail_width)):
        for y_name, y in (("Front", front_rail_y), ("Rear", rear_rail_y)):
            objects.append(
                add_feature(
                    document,
                    f"{x_name} {y_name} 42U Rail",
                    box(rail_width, rail_depth, rail_height, x, y, rail_bottom),
                    rail_color,
                ),
            )

    for index, z in enumerate((360, 700, 1040, 1380, 1720), start=1):
        for x_name, x in (("Left", -WIDTH_MM / 2 + 3), ("Right", WIDTH_MM / 2 - 13)):
            objects.append(
                add_feature(
                    document,
                    f"{x_name} Side Brace {index}",
                    box(10, DEPTH_MM - 100, 24, x, -DEPTH_MM / 2 + 50, z),
                    frame_color,
                ),
            )

    fan_width = 105.0
    fan_gap = 18.0
    fan_total = fan_width * 4 + fan_gap * 3
    fan_start_x = -fan_total / 2
    for index in range(4):
        objects.append(
            add_feature(
                document,
                f"Top Cooling Bay {index + 1}",
                box(
                    fan_width,
                    105,
                    68,
                    fan_start_x + index * (fan_width + fan_gap),
                    -DEPTH_MM / 2 + 48,
                    HEIGHT_MM - 150,
                ),
                accent_color,
            ),
        )

    document.recompute()
    Import.export(objects, step_path)
    for feature in objects:
        feature.Shape.tessellate(1.0)
    Import.export(objects, glb_path)

    metadata = {
        "sourceFileName": os.path.basename(step_path),
        "sourceBytes": os.path.getsize(step_path),
        "outputFileName": os.path.basename(glb_path),
        "outputBytes": os.path.getsize(glb_path),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUpAxis": "z",
        "upAxis": "y",
        "boundsUnit": "mm",
        "dimensions": {
            "widthMm": WIDTH_MM,
            "depthMm": DEPTH_MM,
            "heightMm": HEIGHT_MM,
        },
        "assembly": {
            "role": "vr200-l11-placeholder-envelope",
            "acceptsRackUnits": True,
            "capacityU": CAPACITY_U,
            "rackUnitPitchMm": RACK_UNIT_MM,
            "sourceGeometryNotice": "placeholder-no-vr200-l11-source",
            "note": (
                "Temporary full-height envelope only; no VR200 L11 STEP has been supplied. "
                "The 00_vr_outlook STEP is a separate VR200 L10 1U assembly and is never stretched."
            ),
        },
        "shapeCount": len(objects),
        "sha256": sha256(glb_path),
    }
    with open(metadata_path, "w", encoding="utf-8") as metadata_file:
        json.dump(metadata, metadata_file, ensure_ascii=False, indent=2)
        metadata_file.write("\n")
finally:
    FreeCAD.closeDocument(document.Name)
