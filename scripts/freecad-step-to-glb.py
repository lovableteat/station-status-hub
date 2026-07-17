import argparse
import json
import math
import os
import resource
import sys
from datetime import datetime, timezone

import FreeCAD
import Import


def parse_args():
    parser = argparse.ArgumentParser(description="Convert a STEP assembly to a web GLB with FreeCAD.")
    parser.add_argument("--input", default=os.environ.get("STEP_INPUT"))
    parser.add_argument("--output", default=os.environ.get("GLB_OUTPUT"))
    parser.add_argument("--metadata", default=os.environ.get("MODEL_METADATA"))
    parser.add_argument(
        "--linear-deflection",
        type=float,
        default=float(os.environ.get("LINEAR_DEFLECTION", "2.5")),
    )
    parser.add_argument(
        "--up-axis",
        choices=("x", "y", "z"),
        default=os.environ.get("SOURCE_UP_AXIS", "y"),
    )
    args, _ = parser.parse_known_args()
    if not args.input or not args.output or not args.metadata:
        parser.error(
            "--input, --output, and --metadata are required, either as arguments or "
            "STEP_INPUT, GLB_OUTPUT, and MODEL_METADATA environment variables."
        )
    return args


def log(stage, **details):
    max_rss_kib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(
        json.dumps(
            {
                "time": datetime.now(timezone.utc).isoformat(),
                "stage": stage,
                "maxRssGiB": round(max_rss_kib / 1024 / 1024, 2),
                **details,
            },
            ensure_ascii=True,
        ),
        flush=True,
    )


def round_mm(value):
    return round(max(0.0, value), 1)


def canonical_dimensions(spans, up_axis):
    if up_axis == "x":
        return {
            "widthMm": round_mm(spans[1]),
            "depthMm": round_mm(spans[2]),
            "heightMm": round_mm(spans[0]),
        }
    if up_axis == "z":
        return {
            "widthMm": round_mm(spans[0]),
            "depthMm": round_mm(spans[1]),
            "heightMm": round_mm(spans[2]),
        }
    return {
        "widthMm": round_mm(spans[0]),
        "depthMm": round_mm(spans[2]),
        "heightMm": round_mm(spans[1]),
    }


def has_finite_bounds(obj):
    if not hasattr(obj, "Shape") or obj.Shape.isNull():
        return False
    box = obj.Shape.BoundBox
    values = (box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax)
    return all(math.isfinite(value) and abs(value) < 1e50 for value in values)


args = parse_args()
input_path = os.path.abspath(args.input)
output_path = os.path.abspath(args.output)
metadata_path = os.path.abspath(args.metadata)

document = None
try:
    log("opening-step", input=input_path)
    document = FreeCAD.newDocument("StepConversion")
    Import.insert(input_path, document.Name)
    document.recompute()
    log("step-parsed", objectCount=len(document.Objects))

    shape_objects = [
        obj
        for obj in document.Objects
        if has_finite_bounds(obj)
    ]
    if not shape_objects:
        raise RuntimeError("The STEP file did not contain any renderable shapes.")

    min_values = [
        min(getattr(obj.Shape.BoundBox, axis) for obj in shape_objects)
        for axis in ("XMin", "YMin", "ZMin")
    ]
    max_values = [
        max(getattr(obj.Shape.BoundBox, axis) for obj in shape_objects)
        for axis in ("XMax", "YMax", "ZMax")
    ]
    spans = [maximum - minimum for minimum, maximum in zip(min_values, max_values)]
    dimensions = canonical_dimensions(spans, args.up_axis)
    log(
        "bounds-measured",
        shapeCount=len(shape_objects),
        minimum=min_values,
        maximum=max_values,
        spans={"x": round_mm(spans[0]), "y": round_mm(spans[1]), "z": round_mm(spans[2])},
        dimensions=dimensions,
    )

    for index, obj in enumerate(shape_objects, start=1):
        obj.Shape.tessellate(args.linear_deflection)
        if index == 1 or index % 100 == 0 or index == len(shape_objects):
            log("tessellating", completed=index, total=len(shape_objects))

    Import.export(document.Objects, output_path)
    output_bytes = os.path.getsize(output_path)
    if output_bytes < 1024:
        raise RuntimeError("FreeCAD returned an empty or invalid GLB file.")
    log("glb-generated", outputBytes=output_bytes)

    metadata = {
        "sourceFileName": os.path.basename(input_path),
        "sourceBytes": os.path.getsize(input_path),
        "outputFileName": os.path.basename(output_path),
        "outputBytes": output_bytes,
        "convertedAt": datetime.now(timezone.utc).isoformat(),
        "linearDeflection": args.linear_deflection,
        "sourceUpAxis": args.up_axis,
        "upAxis": "y",
        "minimum": min_values,
        "maximum": max_values,
        "spans": {"x": round_mm(spans[0]), "y": round_mm(spans[1]), "z": round_mm(spans[2])},
        "dimensions": dimensions,
        "shapeCount": len(shape_objects),
    }
    with open(metadata_path, "w", encoding="utf-8") as metadata_file:
        json.dump(metadata, metadata_file, ensure_ascii=False, indent=2)
        metadata_file.write("\n")
    log("complete", metadata=metadata_path)
finally:
    if document is not None:
        FreeCAD.closeDocument(document.Name)
