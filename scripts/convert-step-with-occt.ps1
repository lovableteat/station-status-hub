param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [string]$ModelName,

  [Parameter(Mandatory = $true)]
  [string]$AssemblyRole,

  [ValidateSet("l10", "rack")]
  [string]$ModelKind = "l10",

  [string]$RequiredNodePattern = "",

  [ValidateSet("x", "y", "z")]
  [string]$SourceUpAxis = "y",

  [ValidateRange(0.1, 20)]
  [double]$LinearDeflection = 2.5,

  [ValidateRange(0.01, 1)]
  [double]$DesktopSimplificationRatio = 0.25,

  [ValidateRange(0.01, 1)]
  [double]$MobileSimplificationRatio = 0.05,

  [ValidateRange(0.0001, 1)]
  [double]$DesktopMaximumError = 0.01,

  [ValidateRange(0.0001, 1)]
  [double]$MobileMaximumError = 0.04
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$inputFile = Get-Item -LiteralPath $InputPath
$outputFullPath = [System.IO.Path]::GetFullPath(
  $(if ([System.IO.Path]::IsPathRooted($OutputPath)) {
      $OutputPath
    } else {
      Join-Path $workspace $OutputPath
    })
)

if ([System.IO.Path]::GetExtension($outputFullPath).ToLowerInvariant() -ne ".glb") {
  throw "OutputPath must end in .glb."
}

$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
$outputName = [System.IO.Path]::GetFileName($outputFullPath)
$outputStem = [System.IO.Path]::GetFileNameWithoutExtension($outputFullPath)
$mobileOutputPath = Join-Path $outputDirectory "$outputStem.mobile.glb"
$metadataOutputPath = Join-Path $outputDirectory "$outputStem.json"
$converterPath = Join-Path $PSScriptRoot "occt-xcaf-step-to-glb.py"
$inspectorPath = Join-Path $workspace "scripts\inspect-glb.mjs"
$pythonCommand = (Get-Command python -ErrorAction Stop).Source

if (-not $env:LOCALAPPDATA) {
  throw "LOCALAPPDATA is required to store the external cadquery-ocp runtime."
}

$pythonPackageDirectory = Join-Path $env:LOCALAPPDATA "MachineManagementSystem\cadquery-ocp-7.9.3.1.1"
$ocpModulePath = Join-Path $pythonPackageDirectory "OCP\__init__.py"
$temporaryDirectory = Join-Path (
  [System.IO.Path]::GetTempPath()
) ("machine-management-model-" + [guid]::NewGuid().ToString("N"))
$rawOutputPath = Join-Path $temporaryDirectory "$outputStem.raw.glb"
$rawMetadataPath = Join-Path $temporaryDirectory "$outputStem.raw.json"
$stagedDesktopPath = Join-Path $temporaryDirectory $outputName
$stagedMobilePath = Join-Path $temporaryDirectory "$outputStem.mobile.glb"
$stagedMetadataPath = Join-Path $temporaryDirectory "$outputStem.json"
$previousPythonPath = $env:PYTHONPATH

function Get-InspectionSummary {
  param([Parameter(Mandatory = $true)][string]$GlbPath)

  $inspectionJson = & node $inspectorPath $GlbPath
  if ($LASTEXITCODE -ne 0) {
    throw "scripts/inspect-glb.mjs failed for $GlbPath."
  }
  $inspection = $inspectionJson | ConvertFrom-Json
  $topCoverNode = $inspection.nodeNames |
    Where-Object { $_ -match "top[\s_-]*cover" } |
    Select-Object -First 1
  $inspection | Add-Member `
    -NotePropertyName topCoverNode `
    -NotePropertyValue $topCoverNode `
    -Force
  return $inspection
}

function Get-RequiredNode {
  param(
    [Parameter(Mandatory = $true)]$Inspection,
    [Parameter(Mandatory = $true)][string]$Pattern
  )

  return $Inspection.nodeNames |
    Where-Object { $_ -match $Pattern } |
    Select-Object -First 1
}

function Assert-RelativeSpan {
  param(
    [Parameter(Mandatory = $true)][double]$Actual,
    [Parameter(Mandatory = $true)][double]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $relativeError = [Math]::Abs($Actual - $Expected) / $Expected
  if ($relativeError -gt 0.03) {
    throw "$Label changed from $Expected m to $Actual m."
  }
}

try {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $pythonPackageDirectory -Force | Out-Null

  $env:PYTHONPATH = $pythonPackageDirectory
  if (-not (Test-Path -LiteralPath $ocpModulePath)) {
    Write-Host "Installing cadquery-ocp outside the repository..."
    & $pythonCommand -m pip install `
      --disable-pip-version-check `
      --only-binary=:all: `
      --target $pythonPackageDirectory `
      "cadquery-ocp==7.9.3.1.1"
    if ($LASTEXITCODE -ne 0) {
      throw "cadquery-ocp installation failed with exit code $LASTEXITCODE."
    }
  }

  Write-Host "Converting $($inputFile.Name) with OpenCascade XCAF..."
  & $pythonCommand $converterPath `
    --input $inputFile.FullName `
    --output $rawOutputPath `
    --metadata $rawMetadataPath `
    --model-name $ModelName `
    --source-up-axis $SourceUpAxis `
    --linear-deflection $LinearDeflection
  if ($LASTEXITCODE -ne 0) {
    throw "OCCT XCAF conversion failed with exit code $LASTEXITCODE."
  }

  Write-Host "Optimizing desktop GLB while preserving nodes and materials..."
  & npx.cmd --yes gltfpack `
    -i $rawOutputPath `
    -o $stagedDesktopPath `
    -si $DesktopSimplificationRatio `
    -se $DesktopMaximumError `
    -sp `
    -vpf `
    -kn `
    -km
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop gltfpack optimization failed with exit code $LASTEXITCODE."
  }

  Write-Host "Optimizing mobile GLB while preserving nodes and materials..."
  & npx.cmd --yes gltfpack `
    -i $rawOutputPath `
    -o $stagedMobilePath `
    -si $MobileSimplificationRatio `
    -se $MobileMaximumError `
    -sp `
    -vpf `
    -kn `
    -km
  if ($LASTEXITCODE -ne 0) {
    throw "Mobile gltfpack optimization failed with exit code $LASTEXITCODE."
  }

  $desktopInspection = Get-InspectionSummary -GlbPath $stagedDesktopPath
  $mobileInspection = Get-InspectionSummary -GlbPath $stagedMobilePath
  $effectiveRequiredNodePattern = $RequiredNodePattern
  if (-not $effectiveRequiredNodePattern -and $ModelKind -eq "l10") {
    $effectiveRequiredNodePattern = "top[\s_-]*cover"
  }
  $requiredNode = if ($effectiveRequiredNodePattern) {
    Get-RequiredNode `
      -Inspection $desktopInspection `
      -Pattern $effectiveRequiredNodePattern
  } else {
    $null
  }
  if ($desktopInspection.meshCount -lt 10 -or $desktopInspection.primitiveCount -lt 10) {
    throw "Desktop GLB lost its assembly structure."
  }
  if ($desktopInspection.materialCount -lt 3 -or $desktopInspection.saturatedMaterialCount -lt 2) {
    throw "Desktop GLB lost the STEP material colors."
  }
  if ($effectiveRequiredNodePattern -and -not $requiredNode) {
    throw "Desktop GLB is missing a node matching '$effectiveRequiredNodePattern'."
  }
  if ($mobileInspection.meshCount -lt 3 -or $mobileInspection.materialCount -lt 3) {
    throw "Mobile GLB lost its assembly or material structure."
  }
  if ($mobileInspection.saturatedMaterialCount -lt 2) {
    throw "Mobile GLB lost the non-neutral STEP colors."
  }
  if ($mobileInspection.triangleCount -gt 250000) {
    throw "Mobile GLB contains $($mobileInspection.triangleCount) triangles."
  }

  $rawMetadata = Get-Content -LiteralPath $rawMetadataPath -Raw | ConvertFrom-Json
  # The raw GLB keeps the STEP coordinate axes. Validate those exact axes;
  # the scene rotates z-up/x-up assets only when rendering them.
  $expectedWorldSpans = @(
    ([double]($rawMetadata.spans.x) / 1000),
    ([double]($rawMetadata.spans.y) / 1000),
    ([double]($rawMetadata.spans.z) / 1000)
  )
  for ($axis = 0; $axis -lt 3; $axis += 1) {
    Assert-RelativeSpan `
      -Actual ([double]$desktopInspection.worldBounds.spans[$axis]) `
      -Expected $expectedWorldSpans[$axis] `
      -Label "Desktop GLB axis $axis"
  }

  $metadata = [ordered]@{
    sourceFileName = $inputFile.Name
    sourceBytes = $inputFile.Length
    outputFileName = $outputName
    outputBytes = $desktopInspection.bytes
    rebuiltAt = [DateTime]::UtcNow.ToString("o")
    linearDeflection = $LinearDeflection
    sourceUpAxis = $SourceUpAxis
    upAxis = $SourceUpAxis
    boundsUnit = "mm"
    minimum = $rawMetadata.minimum
    maximum = $rawMetadata.maximum
    spans = $rawMetadata.spans
    dimensions = $rawMetadata.dimensions
    assembly = [ordered]@{
      kind = $ModelKind
      role = $AssemblyRole
      rackUnits = $(if ($ModelKind -eq "l10") { 1 } else { $null })
      note = $(if ($ModelKind -eq "l10") {
          "Independent 1U machine preserving STEP assembly names, top cover, and source colors."
        } else {
          "Rack cabinet preserving STEP assembly names, rail geometry, and source colors."
        })
    }
    assemblyScope = $rawMetadata.assemblyScope
    solidCount = $rawMetadata.solidCount
    namedSolidCount = $rawMetadata.namedSolidCount
    styleCount = $rawMetadata.styleCount
    coloredSolidCount = $rawMetadata.coloredSolidCount
    coloredFaceCount = $rawMetadata.coloredFaceCount
    nodeCount = $desktopInspection.nodeCount
    meshCount = $desktopInspection.meshCount
    primitiveCount = $desktopInspection.primitiveCount
    materialCount = $desktopInspection.materialCount
    coloredMaterialCount = $desktopInspection.coloredMaterialCount
    saturatedMaterialCount = $desktopInspection.saturatedMaterialCount
    topCoverNode = $desktopInspection.topCoverNode
    requiredNodePattern = $effectiveRequiredNodePattern
    requiredNode = $requiredNode
    webOptimization = [ordered]@{
      tool = "gltfpack 1.2"
      triangleCount = $desktopInspection.triangleCount
      vertexCount = $desktopInspection.vertexCount
      simplificationRatio = $DesktopSimplificationRatio
      maximumError = $DesktopMaximumError
      preservesNamedNodes = $true
      preservesNamedMaterials = $true
      sha256 = (Get-FileHash -LiteralPath $stagedDesktopPath -Algorithm SHA256).Hash
    }
    mobileWebOptimization = [ordered]@{
      outputFileName = "$outputStem.mobile.glb"
      outputBytes = $mobileInspection.bytes
      triangleCount = $mobileInspection.triangleCount
      vertexCount = $mobileInspection.vertexCount
      simplificationRatio = $MobileSimplificationRatio
      maximumError = $MobileMaximumError
      preservesNamedNodes = $true
      preservesNamedMaterials = $true
      sha256 = (Get-FileHash -LiteralPath $stagedMobilePath -Algorithm SHA256).Hash
    }
  }
  $metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $stagedMetadataPath -Encoding utf8

  Move-Item -LiteralPath $stagedDesktopPath -Destination $outputFullPath -Force
  Move-Item -LiteralPath $stagedMobilePath -Destination $mobileOutputPath -Force
  Move-Item -LiteralPath $stagedMetadataPath -Destination $metadataOutputPath -Force

  Write-Host "Created $outputFullPath ($($desktopInspection.bytes) bytes)"
  Write-Host "Created $mobileOutputPath ($($mobileInspection.bytes) bytes)"
  Write-Host "Metadata: $metadataOutputPath"
} finally {
  $env:PYTHONPATH = $previousPythonPath
  if (Test-Path -LiteralPath $temporaryDirectory) {
    $resolvedTemporaryDirectory = (Resolve-Path -LiteralPath $temporaryDirectory).Path
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if (-not $resolvedTemporaryDirectory.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean unexpected temporary directory: $resolvedTemporaryDirectory"
    }
    Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force
  }
}
