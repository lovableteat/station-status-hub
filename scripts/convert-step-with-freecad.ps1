param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [ValidateSet("x", "y", "z")]
  [string]$UpAxis = "y",

  [ValidateRange(0.1, 20)]
  [double]$LinearDeflection = 2.5,

  [ValidateRange(0.01, 1)]
  [double]$SimplificationRatio = 0.1
)

$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$inputFile = Get-Item -LiteralPath $InputPath
$outputFullPath = [System.IO.Path]::GetFullPath(
  $(if ([System.IO.Path]::IsPathRooted($OutputPath)) {
      $OutputPath
    } else {
      Join-Path $workspace $OutputPath
    })
)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
$outputName = [System.IO.Path]::GetFileName($outputFullPath)
$outputStem = [System.IO.Path]::GetFileNameWithoutExtension($outputFullPath)
$rawOutputPath = Join-Path $outputDirectory "$outputStem.raw.glb"
$metadataPath = Join-Path $outputDirectory "$outputStem.json"

if ([System.IO.Path]::GetExtension($outputFullPath).ToLowerInvariant() -ne ".glb") {
  throw "OutputPath must end in .glb."
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$inputDirectory = $inputFile.DirectoryName
$inputName = $inputFile.Name
$converterDirectory = $PSScriptRoot

Write-Host "Converting $inputName with local FreeCAD..."
& docker run --rm --memory=14g --cpus=12 `
  --mount "type=bind,source=$inputDirectory,target=/input,readonly" `
  --mount "type=bind,source=$outputDirectory,target=/output" `
  --mount "type=bind,source=$converterDirectory,target=/converter,readonly" `
  -e "STEP_INPUT=/input/$inputName" `
  -e "GLB_OUTPUT=/output/$outputStem.raw.glb" `
  -e "MODEL_METADATA=/output/$outputStem.json" `
  -e "SOURCE_UP_AXIS=$UpAxis" `
  -e "LINEAR_DEFLECTION=$LinearDeflection" `
  ianussimoddocker/freecad:latest `
  /usr/local/bin/FreeCADCmd /converter/freecad-step-to-glb.py

if ($LASTEXITCODE -ne 0) {
  throw "FreeCAD conversion failed with exit code $LASTEXITCODE."
}

Write-Host "Optimizing the GLB for browser rendering..."
& npx.cmd --yes gltfpack `
  -i $rawOutputPath `
  -o $outputFullPath `
  -si $SimplificationRatio `
  -se 0.02 `
  -sp `
  -vpf `
  -kn `
  -km

if ($LASTEXITCODE -ne 0) {
  throw "gltfpack optimization failed with exit code $LASTEXITCODE."
}

$outputBytes = (Get-Item -LiteralPath $outputFullPath).Length
if ($outputBytes -ge 100MB) {
  throw "Optimized GLB is still $outputBytes bytes; lower SimplificationRatio before publishing."
}

$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
$metadata.outputFileName = $outputName
$metadata.outputBytes = $outputBytes
$metadata | Add-Member -NotePropertyName webOptimization -NotePropertyValue ([ordered]@{
    tool = "gltfpack 1.2"
    simplificationRatio = $SimplificationRatio
    maximumError = 0.02
    mergedMeshes = $false
    preservedNodes = $true
    preservedMaterials = $true
  }) -Force
$metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $metadataPath -Encoding utf8

Remove-Item -LiteralPath $rawOutputPath -Force
Write-Host "Created $outputFullPath ($outputBytes bytes)"
Write-Host "Metadata: $metadataPath"
