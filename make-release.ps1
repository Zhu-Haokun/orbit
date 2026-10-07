<#
.SYNOPSIS
    打一个 Orbit 发布包。

.DESCRIPTION
    一条命令完成发版前的全部机械动作：

      1. 把 release.json 的 version 改成指定版本（保留中文，不产生 BOM）
      2. 可选：重新构建前端（-Build）
      3. 打包，并排除所有机器相关的东西
      4. **用应用自己的安全规则预演一遍** —— 发现数据库等危险文件就报错退出
      5. 校验包内版本号与要求一致

    第 4 步是这个脚本存在的主要理由。手工打包漏掉一个排除项（比如
    backend\orbit.db），包能上传、能下载，但用户点更新时会失败，而且
    错误信息只有一句「更新包里含有数据库文件，已中止」—— 排查成本很高。
    让脚本在打包的同一秒就把它挡住。

    脚本**不碰 git**。提交和推送请你自己确认后再做。

.PARAMETER Version
    新版本号，形如 1.0.6。必须比现有版本高。

.PARAMETER Build
    先跑一次前端构建（npm run build）。改了前端就必须加。

.PARAMETER Handoff
    打成「给别人初次安装」的包（含 runtime 依赖，约 17 MB）。
    不加则是「给已有用户更新」的包（约 0.7 MB）。

.PARAMETER OutputDirectory
    输出目录，默认 <项目>\..\版本更新。

.EXAMPLE
    .\make-release.ps1 -Version 1.0.6 -Build

.EXAMPLE
    .\make-release.ps1 -Version 1.0.6 -Build -Handoff
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version,

    [switch]$Build,
    [switch]$Handoff,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------- 工具函数 ---

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "    OK  $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "        $Text" -ForegroundColor Gray }

function Fail([string]$Text) {
    Write-Host "`n[!] $Text" -ForegroundColor Red
    exit 1
}

#: 更新包里绝不允许出现的文件。和应用里的 FORBIDDEN_NAMES 保持一致 ——
#: 这里先在本地挡一次，免得传到 GitHub 才发现。
$ForbiddenNames = @('orbit.db', 'orbit.db-journal', 'orbit.db-wal')

#: 一律不打包的目录/文件（正则，匹配完整路径）。
$BaseExcludes = @(
    '\\\.git\\',
    '\\node_modules\\',
    '\\\.venv\\',
    '\\__pycache__\\',
    '\\\.pytest_cache\\',
    '\\\.ruff_cache\\',
    '\\\.npm-cache\\',
    '\\update-staging\\',
    '\\update-backup\\',
    '\\\.env$',
    '\\\.env\.local$'
)

#: 数据文件单独列出来，因为它们是「危险」而不是「无用」。
$DataExcludes = @(
    '\\orbit\.db(-journal|-wal)?$',
    '\\uploads\\'
)

#: runtime 只在「给别人初次安装」的包里才需要。
$RuntimeExclude = '\\runtime\\'

# ------------------------------------------------------------------ 0. 检查 ---

Write-Step "检查参数与环境"

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Fail "版本号格式不对：'$Version'。要用 1.0.6 这样的三段式。"
}

$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ReleaseJson = Join-Path $Root 'release.json'
$DistIndex = Join-Path $Root 'frontend\dist\index.html'

if (-not (Test-Path -LiteralPath $ReleaseJson)) {
    Fail "找不到 release.json —— 这个脚本要放在 Orbit 项目根目录（和 start-orbit.bat 同级）。"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path -Parent $Root) '版本更新'
}

Write-Ok "项目目录   $Root"
Write-Ok "输出目录   $OutputDirectory"
Write-Ok "目标版本   $Version"
Write-Ok "包类型     $(if ($Handoff) { '给别人初次安装（含 runtime）' } else { '给已有用户更新（不含 runtime）' })"

# ------------------------------------------------------- 1. 改 release.json ---

Write-Step "更新 release.json"

# 用 ReadAllText/WriteAllText 而不是 Get-Content/Set-Content：
#   * Get-Content 默认按系统代码页解码，中文会变成乱码
#   * Set-Content -Encoding UTF8 会写入 BOM，某些 JSON 读取器会报错
# 只替换 version 的值，其余字节原样保留。
$encoding = New-Object System.Text.UTF8Encoding($false)
$raw = [System.IO.File]::ReadAllText($ReleaseJson, $encoding)

$versionMatch = [regex]::Match($raw, '"version"\s*:\s*"([^"]*)"')
if (-not $versionMatch.Success) {
    Fail "release.json 里找不到 version 字段。"
}
$oldVersion = $versionMatch.Groups[1].Value

if ($oldVersion -eq $Version) {
    Write-Info "已经是 $Version，跳过"
} else {
    # 只允许往前升，避免手滑把版本改低导致所有客户端反复提示更新。
    $old = [version]$oldVersion
    $new = [version]$Version
    if ($new -le $old) {
        Fail "新版本 $Version 不高于现有的 $oldVersion。降版本会让已更新的用户永远收不到提示。"
    }
    $raw = $raw -replace '("version"\s*:\s*")[^"]*(")', "`${1}$Version`${2}"
    [System.IO.File]::WriteAllText($ReleaseJson, $raw, $encoding)
    Write-Ok "$oldVersion -> $Version"
}

# 改完立刻读回来确认没被写坏 —— 中文乱码过一次，代价很大。
$check = [System.IO.File]::ReadAllText($ReleaseJson, $encoding) | ConvertFrom-Json
if ($check.version -ne $Version) { Fail "release.json 写入后读回来的版本不对。" }
if (-not $check.name -or $check.name -notmatch '[\u4e00-\u9fff]') {
    Fail "release.json 的中文被写坏了（name = '$($check.name)'）。"
}
Write-Ok "回读校验通过：version=$($check.version)  name=$($check.name)"

# --------------------------------------------------------- 2. 构建前端 ---

if ($Build) {
    Write-Step "构建前端"
    $frontend = Join-Path $Root 'frontend'
    $vite = Join-Path $frontend 'node_modules\.bin\vite.cmd'
    if (-not (Test-Path -LiteralPath $vite)) {
        Fail "找不到 vite（$vite）。先在 frontend 目录跑一次 npm install。"
    }
    Push-Location $frontend
    try {
        & $vite build
        if ($LASTEXITCODE -ne 0) { Fail "前端构建失败。" }
    } finally {
        Pop-Location
    }
    Write-Ok "前端已重新构建"
} else {
    Write-Step "跳过前端构建（没加 -Build）"
    if (-not (Test-Path -LiteralPath $DistIndex)) {
        Fail "frontend\dist\index.html 不存在。首次发版请加 -Build。"
    }
    Write-Info "用的是现有的 dist"
}

# ------------------------------------------------------------- 3. 打包 ---

Write-Step "打包"

$excludes = @($BaseExcludes + $DataExcludes)
if (-not $Handoff) { $excludes += $RuntimeExclude }
$excludePattern = ($excludes -join '|')

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

# 两种包必须用不同的文件名：它们内容不同（一个含 runtime 一个不含），
# 同名会互相覆盖 —— 打完整安装包时会把刚打好的更新包冲掉。
#
# 一律用 ASCII 文件名：GitHub 的 Release 附件对非 ASCII 支持很差，
# 「orbit-1.0.8-完整安装包.zip」会被它截成「orbit-1.0.8-..zip」，
# 中文部分直接丢失，用户根本认不出那是哪个包。
$packageName = if ($Handoff) { "orbit-$Version-full.zip" } else { "orbit-$Version.zip" }
$packagePath = Join-Path $OutputDirectory $packageName
if (Test-Path -LiteralPath $packagePath) { Remove-Item -LiteralPath $packagePath -Force }

# 先把要打的文件收集起来，顺便统计
$wanted = @()
foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction SilentlyContinue) {
    if ($file.FullName -match $excludePattern) { continue }
    $wanted += $file
}

if ($wanted.Count -eq 0) { Fail "没有收集到任何文件 —— 排除规则是不是写错了？" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($packagePath, 'Create')
try {
    foreach ($file in $wanted) {
        $entryName = $file.FullName.Substring($Root.Length + 1).Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $file.FullName, $entryName, 'Optimal')
    }
    # 上传目录必须存在，否则后端启动时会报错。空目录进不了 zip，用占位文件。
    if ($wanted.FullName -notmatch '\\uploads\\') {
        [void]$zip.CreateEntry('backend/uploads/.gitkeep')
    }
} finally {
    $zip.Dispose()
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $packagePath).Length / 1MB, 2)
Write-Ok "$packagePath  ($sizeMb MB, $($wanted.Count) 个文件)"

# ------------------------------------------------------- 4. 安全预演 ---

Write-Step "安全预演（这一步失败就不要上传）"

$zip = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $dangerous = @()
    $dataFiles = @()
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        $leaf = Split-Path -Leaf $entry.FullName
        if ($ForbiddenNames -contains $leaf) { $dangerous += $entry.FullName }
        if ($entry.FullName -match '^backend/uploads/.*[^/]$' -and $entry.FullName -ne 'backend/uploads/.gitkeep') {
            $dataFiles += $entry.FullName
        }
    }

    if ($dangerous.Count -gt 0) {
        Write-Host ""
        foreach ($d in $dangerous) { Write-Host "        危险: $d" -ForegroundColor Red }
        Fail "包里含有数据库文件。上传它会让所有用户的更新失败（应用的安全闸门会拒绝整个包）。"
    }
    Write-Ok "没有数据库文件"

    if ($dataFiles.Count -gt 0) {
        Write-Host ""
        foreach ($d in $dataFiles) { Write-Host "        数据: $d" -ForegroundColor Yellow }
        Fail "包里含有上传的图片。这些是你的私人数据，不该发出去。"
    }
    Write-Ok "没有私人图片"

    # 包内版本号必须和文件名一致，否则客户端会陷入"更新完还提示更新"的死循环。
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'release.json' }
    if (-not $entry) { Fail "包里没有 release.json。" }
    $reader = New-Object System.IO.StreamReader($entry.Open(), $encoding)
    try { $inZip = ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    if ($inZip.version -ne $Version) {
        Fail "包内 release.json 是 $($inZip.version)，和要求的 $Version 不一致。"
    }
    Write-Ok "包内版本号 $($inZip.version) 与文件名一致"

    # 更新包必须带上这些东西，否则 apply-update.bat 会把程序换坏。
    $mustHave = @('start-orbit.bat', 'apply-update.bat', 'release.json', 'README.md',
                  'frontend/dist/index.html', 'backend/app/main.py')
    $missing = @()
    foreach ($need in $mustHave) {
        if (-not ($zip.Entries | Where-Object { $_.FullName -eq $need })) { $missing += $need }
    }
    if ($missing.Count -gt 0) {
        foreach ($m in $missing) { Write-Host "        缺: $m" -ForegroundColor Red }
        Fail "包不完整。"
    }
    Write-Ok "关键文件齐全（$($mustHave.Count) 项）"
} finally {
    $zip.Dispose()
}

# --------------------------------------------------------------- 完成 ---

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  打包完成  v$Version" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  包: $packagePath" -ForegroundColor White
Write-Host ""
Write-Host "  接下来（脚本不碰 git，请你确认后手动执行）：" -ForegroundColor Cyan
Write-Host ""
Write-Host "    1. 检查改动：  git status"
Write-Host "    2. 提交推送：  git add -A; git commit -m `"$Version`"; git push"
Write-Host "    3. 发 Release： https://github.com/$($check.repository)/releases/new"
Write-Host "                    Tag 填 v$Version（记得点 Create new tag）"
Write-Host "                    附件拖入 $(Split-Path -Leaf $packagePath)"
Write-Host "                    说明粘贴 release.json 里的 notes"
Write-Host ""
Write-Host "  想先本地验证，就用 orbit_local 那份打开应用，它会提示有新版本。" -ForegroundColor Gray
Write-Host ""
