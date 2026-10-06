# แพ็กโค้ด server เป็น build/server.tar.gz แล้วอัปขึ้น S3 (bucket artifacts)
#
#   .\deploy\package-server.ps1 -Bucket picasso-artifacts-xxxx
#
# ไม่มี AWS CLI: ไม่ต้องใส่ -Bucket แล้วอัปไฟล์ build/server.tar.gz ผ่านหน้า S3 Console เอง
#
# เครื่องใหม่ที่ Auto Scaling สร้างจะดึงไฟล์นี้ไปรัน (ดู deploy/ec2-user-data.sh)
# อัปเวอร์ชันใหม่แล้ว ทำ Instance refresh ใน ASG ให้เครื่องเก่าถูกแทนที่

param(
    [string]$Bucket = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "build"
$output = Join-Path $buildDir "server.tar.gz"

New-Item -ItemType Directory -Force $buildDir | Out-Null

# ไม่เอา node_modules (EC2 รัน npm ci เอง) และไม่เอา .env (มี secret)
tar -czf $output --exclude=node_modules --exclude=.env -C (Join-Path $root "server") .

Write-Host "Created $output"

if ($Bucket) {
    aws s3 cp $output "s3://$Bucket/server.tar.gz"
    Write-Host "Uploaded to s3://$Bucket/server.tar.gz"
}
