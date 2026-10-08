# build หน้าเว็บแล้วอัปขึ้น S3 (bucket ที่เปิด Static website hosting)
#
#   .\deploy\deploy-client.ps1 `
#       -SocketUrl http://picasso-alb-123.ap-southeast-1.elb.amazonaws.com `
#       -AuthApiUrl https://abc123.execute-api.ap-southeast-1.amazonaws.com `
#       -Bucket picasso-web-xxxx
#
# ไม่มี AWS CLI: ไม่ต้องใส่ -Bucket แล้วอัปทุกไฟล์ใน client/dist ผ่านหน้า S3 Console เอง
#
# ค่า URL ถูกฝังลงไฟล์ตอน build -> เปลี่ยน URL ต้อง build ใหม่

param(
    [Parameter(Mandatory = $true)][string]$SocketUrl,
    [Parameter(Mandatory = $true)][string]$AuthApiUrl,
    [string]$Bucket = ""
)

$ErrorActionPreference = "Stop"

# $ErrorActionPreference ไม่หยุดเมื่อคำสั่งภายนอก (npm, aws) ล้ม ต้องเช็ค exit code เอง
function Invoke-Step([string]$Name, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit code $LASTEXITCODE)" }
}

$root = Split-Path -Parent $PSScriptRoot
$clientDir = Join-Path $root "client"

Push-Location $clientDir

try {
    $env:VITE_SOCKET_URL = $SocketUrl
    $env:VITE_AUTH_API_URL = $AuthApiUrl

    Invoke-Step "npm ci" { npm ci }
    Invoke-Step "npm run build" { npm run build }

    Write-Host "Built $clientDir\dist"

    if ($Bucket) {
        Invoke-Step "aws s3 sync" { aws s3 sync dist "s3://$Bucket" --delete }
        Write-Host "Uploaded to s3://$Bucket"
    }
}
finally {
    Remove-Item Env:VITE_SOCKET_URL -ErrorAction SilentlyContinue
    Remove-Item Env:VITE_AUTH_API_URL -ErrorAction SilentlyContinue
    Pop-Location
}
