# Refresh the official, unmodified Google Fonts unicode-range subsets.
# This script only writes the named font directory, its CSS and the public manifest.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'public/fonts/noto-serif-sc-900'
$cssPath = Join-Path $root 'app/templates/polaroid-field/motion-fonts.css'
$manifestPath = Join-Path $root 'config/production-public-files.json'
$cssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@900&display=swap'
$agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
$css = (Invoke-WebRequest -Uri $cssUrl -UserAgent $agent).Content
$urls = @([regex]::Matches($css, 'https://fonts\.gstatic\.com/[^)]+\.woff2') | ForEach-Object { $_.Value } | Select-Object -Unique)
if ($urls.Count -lt 50 -or $css -notmatch 'unicode-range:') { throw 'Expected complete unicode-range WOFF2 subsets, not a single fallback font.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$retained = @($manifest.files | Where-Object { -not $_.StartsWith('fonts/noto-serif-sc-900/') })
if ($retained.Count + $urls.Count + 1 -gt 256) { throw 'Font files exceed the existing public allowlist limit.' }
New-Item -ItemType Directory -Force -Path $target | Out-Null
$newFiles = @()
$checksums = @()
for ($i = 0; $i -lt $urls.Count; $i++) {
  $name = 'subset-{0:d3}.woff2' -f $i
  $file = Join-Path $target $name
  Invoke-WebRequest -Uri $urls[$i] -OutFile $file
  $bytes = [IO.File]::ReadAllBytes($file)
  if ([Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'wOF2') { throw "Invalid WOFF2: $name" }
  $css = $css.Replace($urls[$i], "/fonts/noto-serif-sc-900/$name")
  $newFiles += "fonts/noto-serif-sc-900/$name"
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  $checksums += [ordered]@{ file = $name; source = $urls[$i]; bytes = $bytes.Length; sha256Chunks = @([regex]::Matches($hash, '.{8}') | ForEach-Object { $_.Value }) }
}
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt' -OutFile (Join-Path $target 'OFL.txt')
$newFiles += 'fonts/noto-serif-sc-900/OFL.txt'
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($cssPath, "/* Official Noto Serif SC 900 subsets; SIL OFL 1.1 in public/fonts/noto-serif-sc-900/OFL.txt. */`n" + $css.Trim() + "`n", $utf8)
$allFiles = [string[]]@($retained + $newFiles)
[Array]::Sort($allFiles, [StringComparer]::Ordinal)
[IO.File]::WriteAllText($manifestPath, ([ordered]@{ version = 1; files = $allFiles } | ConvertTo-Json -Depth 4) + "`n", $utf8)
[IO.File]::WriteAllText((Join-Path $target 'sources.json'), ([ordered]@{ cssSource = $cssUrl; licenseSource = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt'; files = $checksums } | ConvertTo-Json -Depth 5) + "`n", $utf8)
Write-Output "Downloaded $($urls.Count) subsets, $(($checksums | ForEach-Object { $_.bytes } | Measure-Object -Sum).Sum) bytes."
