$ErrorActionPreference = "Stop"

$repository = "Brilliant666/frame-zero-portfolio-studio"
$expectedRemote = "https://github.com/$repository.git"
$branches = @(
  "codex/portfolio-v1",
  "codex/template-02-neon-hud",
  "codex/template-03-film-rail",
  "codex/template-04-manga-panels",
  "codex/template-05-prism-liquid",
  "codex/template-06-orbital-portal",
  "codex/template-07-archive-os",
  "codex/template-08-editorial-duet",
  "codex/template-09-polaroid-field",
  "codex/template-10-character-select",
  "codex/template-11-museum-depth",
  "codex/template-gallery"
)

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
$fallbackGh = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)) "GitHub CLI\gh.exe"
$gh = if ($ghCommand) { $ghCommand.Source } elseif (Test-Path -LiteralPath $fallbackGh) { $fallbackGh } else { $null }
if (-not $gh) {
  throw "GitHub CLI is required. Install it with: winget install --id GitHub.cli --exact"
}

& $gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login --hostname github.com"
}

$login = & $gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $login.Trim() -ne "Brilliant666") {
  throw "Authenticate GitHub CLI as Brilliant666 before publishing. Current account: $login"
}

$dirty = git status --porcelain
if ($dirty) {
  throw "Working tree must be clean before publishing."
}

git config core.hooksPath .githooks
npm run check:public

foreach ($branch in $branches) {
  git show-ref --verify --quiet "refs/heads/$branch"
  if ($LASTEXITCODE -ne 0) {
    throw "Required branch is missing: $branch"
  }
}

$existingRepository = $null
$repoJson = $null
$repoExists = $false
try {
  $repoJson = & $gh repo view $repository --json nameWithOwner,visibility,url,defaultBranchRef 2>$null
  $repoExists = $LASTEXITCODE -eq 0
} catch {
  $repoExists = $false
}
if ($repoExists) {
  $existingRepository = $repoJson | ConvertFrom-Json
  if ($existingRepository.visibility -ne "PUBLIC") {
    throw "The existing repository is not public: $repository"
  }
} else {
  & $gh repo create $repository `
    --public `
    --description "Eleven switchable Cosplay photography portfolio templates. Demo data only; local photos are excluded." `
    --source . `
    --remote origin
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub repository creation failed."
  }
}

$origin = git config --get remote.origin.url
if ($origin -ne $expectedRemote -and $origin -ne "git@github.com:$repository.git") {
  throw "Unexpected origin remote: $origin"
}

$resolvedOrigin = git remote get-url origin
$pushSucceeded = $false
if ($resolvedOrigin -eq $origin) {
  git push --set-upstream origin $branches
  $pushSucceeded = $LASTEXITCODE -eq 0
} else {
  Write-Host "A global Git URL rewrite is active; using GitHub Git Data API instead of the rewritten transport."
}

if (-not $pushSucceeded) {
  $previousGhBin = [Environment]::GetEnvironmentVariable("GH_BIN", "Process")
  try {
    $env:GH_BIN = $gh
    node scripts/publish-git-data-api.mjs $repository $branches
    if ($LASTEXITCODE -ne 0) {
      throw "GitHub Git Data API publication failed."
    }
  } finally {
    if ($null -eq $previousGhBin) {
      Remove-Item Env:GH_BIN -ErrorAction SilentlyContinue
    } else {
      $env:GH_BIN = $previousGhBin
    }
  }
}

& $gh repo edit $repository --default-branch codex/template-gallery
if ($LASTEXITCODE -ne 0) {
  throw "Unable to set codex/template-gallery as the default branch."
}

npm run check:public
& $gh repo view $repository --json nameWithOwner,url,visibility,defaultBranchRef
