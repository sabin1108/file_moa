param(
  [ValidateSet("chat","files")][string]$Page="chat",
  [ValidateSet("desktop","mobile")][string]$Profile="desktop",
  [string]$BaseUrl="http://127.0.0.1:3000"
)
$ErrorActionPreference="Stop"
$repoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$auditDir=Join-Path $repoRoot "docs/audits"
[IO.Directory]::CreateDirectory($auditDir) | Out-Null
$auditUrl=$BaseUrl.TrimEnd("/") + $(if($Page -eq "files"){"/files"}else{"/"})
$auditOutput=Join-Path $auditDir "$Page-$Profile"
$auditArgs=@("dlx","lighthouse@13.5.0",$auditUrl,"--only-categories=performance,accessibility,best-practices","--chrome-flags=--headless=new","--output=html","--output=json","--output-path=$auditOutput","--quiet")
if($Profile -eq "desktop"){$auditArgs+="--preset=desktop"}
& pnpm @auditArgs
if($LASTEXITCODE -ne 0){throw "Lighthouse failed: $LASTEXITCODE"}
