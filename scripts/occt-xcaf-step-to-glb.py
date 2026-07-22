import argparse
import json
import os
from datetime import datetime, timezone

from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Message import Message_ProgressRange
from OCP.RWMesh import (
    RWMesh_CoordinateSystemConverter,
    RWMesh_CoordinateSystem_Yup,
)
from OCP.RWGltf import RWGltf_CafWriter
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Convert a STEP XCAF assembly into a named, color-preserving raw GLB. "
            "Use convert-step-with-occt.ps1 to optimize and validate deployment assets."
        ),
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--source-up-axis", choices=("x", "y", "z"), required=True)
    parser.add_argument("--linear-deflection", type=float, default=2.5)
    parser.add_argument("--angular-deflection", type=float, default=0.5)
    return parser.parse_args()


def log(stage, **details):
    print(
        json.dumps(
            {
                "stage": stage,
                "time": datetime.now(timezone.utc).isoformat(),
                **details,
            },
            ensure_ascii=True,
        ),
        flush=True,
    )


def make_document():
    return TDocStd_Document(TCollection_ExtendedString("BinXCAF"))


def shape_bounds(shape):
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box, False)
    values = box.Get()
    return {
        "minimum": list(values[:3]),
        "maximum": list(values[3:]),
        "spans": [
            values[3] - values[0],
            values[4] - values[1],
            values[5] - values[2],
        ],
    }


def round_mm(value):
    return round(max(0.0, value), 1)


def canonical_dimensions(spans, source_up_axis):
    if source_up_axis == "x":
        return {
            "widthMm": round_mm(spans[1]),
            "depthMm": round_mm(spans[2]),
            "heightMm": round_mm(spans[0]),
        }
    if source_up_axis == "z":
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


def get_label_name(label):
    if label.IsNull():
        return ""
    name_attribute = TDataStd_Name()
    if not label.FindAttribute(TDataStd_Name.GetID_s(), name_attribute):
        return ""
    return name_attribute.Get().ToExtString().strip()


args = parse_args()
input_path = os.path.abspath(args.input)
output_path = os.path.abspath(args.output)
metadata_path = os.path.abspath(args.metadata)
source_document = make_document()

reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
reader.SetLayerMode(True)
reader.SetMatMode(True)
reader.SetPropsMode(True)
reader.SetMetaMode(True)

log("reading-step", input=input_path)
if not reader.Perform(input_path, source_document, Message_ProgressRange()):
    raise RuntimeError("STEPCAFControl failed to import the STEP assembly.")

source_shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(source_document.Main())
roots = TDF_LabelSequence()
source_shape_tool.GetFreeShapes(roots)
if roots.Length() != 1:
    raise RuntimeError(f"Expected one authoritative STEP root, got {roots.Length()}.")

source_root_label = roots.Value(1)
source_root_shape = XCAFDoc_ShapeTool.GetShape_s(source_root_label)
source_bounds = shape_bounds(source_root_shape)
log("step-parsed", rootCount=roots.Length(), sourceBounds=source_bounds)

# Keep the authoritative XCAF document intact. Flattening every solid into a new
# document discards assembly names (including TOP-COVER) and part-level colors.
solid_explorer = TopExp_Explorer(source_root_shape, TopAbs_SOLID)
solid_count = 0
while solid_explorer.More():
    solid_count += 1
    solid_explorer.Next()

if solid_count == 0:
    raise RuntimeError("The STEP root does not contain any solids.")

shape_labels = TDF_LabelSequence()
source_shape_tool.GetShapes(shape_labels)
named_shape_count = sum(
    1
    for index in range(1, shape_labels.Length() + 1)
    if get_label_name(shape_labels.Value(index))
)

log(
    "assembly-preserved",
    solidCount=solid_count,
    shapeLabelCount=shape_labels.Length(),
    namedShapeCount=named_shape_count,
)

mesher = BRepMesh_IncrementalMesh(
    source_root_shape,
    args.linear_deflection,
    False,
    args.angular_deflection,
    True,
)
mesher.Perform()
log("root-meshed", solidCount=solid_count)

writer = RWGltf_CafWriter(
    TCollection_AsciiString(output_path),
    True,
)
coordinate_converter = RWMesh_CoordinateSystemConverter()
# Matching input/output systems keeps the STEP axes untouched; only units change.
coordinate_converter.SetInputCoordinateSystem(RWMesh_CoordinateSystem_Yup)
coordinate_converter.SetOutputCoordinateSystem(RWMesh_CoordinateSystem_Yup)
coordinate_converter.SetInputLengthUnit(0.001)
coordinate_converter.SetOutputLengthUnit(1.0)
writer.SetCoordinateSystemConverter(coordinate_converter)
writer.SetParallel(True)
# Preserve the STEP assembly's part boundaries and avoid an expensive global
# face merge that can take hours on this 1U model.
writer.SetMergeFaces(False)
writer.SetToEmbedTexturesInGlb(True)
file_info = TColStd_IndexedDataMapOfStringString()
log("writing-glb")
if not writer.Perform(source_document, file_info, Message_ProgressRange()):
    raise RuntimeError("RWGltf_CafWriter failed to export the GLB.")

metadata = {
    "sourceFileName": os.path.basename(input_path),
    "sourceBytes": os.path.getsize(input_path),
    "rawOutputFileName": os.path.basename(output_path),
    "rawOutputBytes": os.path.getsize(output_path),
    "convertedAt": datetime.now(timezone.utc).isoformat(),
    "linearDeflection": args.linear_deflection,
    "angularDeflection": args.angular_deflection,
    "sourceUpAxis": args.source_up_axis,
    "upAxis": args.source_up_axis,
    "boundsUnit": "mm",
    "minimum": source_bounds["minimum"],
    "maximum": source_bounds["maximum"],
    "spans": {
        "x": round_mm(source_bounds["spans"][0]),
        "y": round_mm(source_bounds["spans"][1]),
        "z": round_mm(source_bounds["spans"][2]),
    },
    "dimensions": canonical_dimensions(
        source_bounds["spans"],
        args.source_up_axis,
    ),
    "assemblyScope": "xcaf-assembly-hierarchy",
    "sourceRootCount": roots.Length(),
    "solidCount": solid_count,
    "namedSolidCount": named_shape_count,
    # Material fidelity is validated from the generated GLB. Avoid traversing all
    # 83k source styles twice before the XCAF writer performs its own export pass.
    "styleCount": None,
    "coloredSolidCount": None,
    "coloredFaceCount": None,
}
with open(metadata_path, "w", encoding="utf-8") as metadata_file:
    json.dump(metadata, metadata_file, ensure_ascii=False, indent=2)
    metadata_file.write("\n")

log(
    "complete",
    output=output_path,
    outputBytes=os.path.getsize(output_path),
    metadata=metadata_path,
)
