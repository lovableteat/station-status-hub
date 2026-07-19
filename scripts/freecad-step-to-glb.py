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


def glb_up_axis(source_up_axis):
    # FreeCAD's glTF exporter maps source Y to glTF Z and source Z to glTF Y.
    return {
        "x": "x",
        "y": "z",
        "z": "y",
    }[source_up_axis]


def has_finite_bounds(obj):
    if not hasattr(obj, "Shape") or obj.Shape.isNull():
        return False
    box = obj.Shape.BoundBox
    values = (box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax)
    return all(math.isfinite(value) and abs(value) < 1e50 for value in values)


def measure_bounds(objects):
    minimum = [
        min(getattr(obj.Shape.BoundBox, axis) for obj in objects)
        for axis in ("XMin", "YMin", "ZMin")
    ]
    maximum = [
        max(getattr(obj.Shape.BoundBox, axis) for obj in objects)
        for axis in ("XMax", "YMax", "ZMax")
    ]
    return {
        "minimum": minimum,
        "maximum": maximum,
        "spans": [
            maximum_value - minimum_value
            for minimum_value, maximum_value in zip(minimum, maximum)
        ],
    }


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

    root_shape_objects = [
        obj
        for obj in document.RootObjects
        if has_finite_bounds(obj)
    ]
    export_objects = root_shape_objects or shape_objects
    assembly_scope = "root-shapes" if root_shape_objects else "flat-shapes"
    log(
        "assembly-selected",
        scope=assembly_scope,
        sourceShapeCount=len(shape_objects),
        exportShapeCount=len(export_objects),
    )

    export_bounds = measure_bounds(export_objects)
    all_shape_bounds = measure_bounds(shape_objects)
    min_values = export_bounds["minimum"]
    max_values = export_bounds["maximum"]
    spans = export_bounds["spans"]
    dimensions = canonical_dimensions(spans, args.up_axis)
    root_coverage = {
        "rootShapeCount": len(root_shape_objects),
        "sourceShapeCount": len(shape_objects),
        "exportShapeCount": len(export_objects),
        "exportMinimum": export_bounds["minimum"],
        "exportMaximum": export_bounds["maximum"],
        "exportSpans": {
            "x": round_mm(export_bounds["spans"][0]),
            "y": round_mm(export_bounds["spans"][1]),
            "z": round_mm(export_bounds["spans"][2]),
        },
        "allShapeMinimum": all_shape_bounds["minimum"],
        "allShapeMaximum": all_shape_bounds["maximum"],
        "allShapeSpans": {
            "x": round_mm(all_shape_bounds["spans"][0]),
            "y": round_mm(all_shape_bounds["spans"][1]),
            "z": round_mm(all_shape_bounds["spans"][2]),
        },
        "rootSolidCount": sum(len(obj.Shape.Solids) for obj in root_shape_objects),
        "rootVolumeMm3": sum(obj.Shape.Volume for obj in root_shape_objects),
    }
    log(
        "bounds-measured",
        shapeCount=len(export_objects),
        minimum=min_values,
        maximum=max_values,
        spans={"x": round_mm(spans[0]), "y": round_mm(spans[1]), "z": round_mm(spans[2])},
        dimensions=dimensions,
    )

    for index, obj in enumerate(export_objects, start=1):
        obj.Shape.tessellate(args.linear_deflection)
        if index == 1 or index % 100 == 0 or index == len(export_objects):
            log("tessellating", completed=index, total=len(export_objects))

    Import.export(export_objects, output_path)
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
        "upAxis": glb_up_axis(args.up_axis),
        "minimum": min_values,
        "maximum": max_values,
        "spans": {"x": round_mm(spans[0]), "y": round_mm(spans[1]), "z": round_mm(spans[2])},
        "dimensions": dimensions,
        "assemblyScope": assembly_scope,
        "sourceShapeCount": len(shape_objects),
        "shapeCount": len(export_objects),
        "rootCoverage": root_coverage,
    }
    with open(metadata_path, "w", encoding="utf-8") as metadata_file:
        json.dump(metadata, metadata_file, ensure_ascii=False, indent=2)
        metadata_file.write("\n")
    log("complete", metadata=metadata_path)
finally:
    if document is not None:
        FreeCAD.closeDocument(document.Name)
