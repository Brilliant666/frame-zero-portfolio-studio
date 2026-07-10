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

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is required. Install it with: winget install --id GitHub.cli"
}

gh auth status
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login"
}

$dirty = git status --porcelain
if ($dirty) {
  throw "Working tree must be clean before publishing."
}

git config core.hooksPath .githooks
npm run check:assets

foreach ($branch in $branches) {
  git show-ref --verify --quiet "refs/heads/$branch"
  if ($LASTEXITCODE -ne 0) {
    throw "Required branch is missing: $branch"
  }
}

gh repo view $repository *> $null
if ($LASTEXITCODE -ne 0) {
  gh repo create $repository `
    --private `
    --description "Eleven switchable Cosplay photography portfolio experiences with a shared content studio." `
    --source . `
    --remote origin
}

$origin = git remote get-url origin
if ($origin -ne $expectedRemote -and $origin -ne "git@github.com:$repository.git") {
  throw "Unexpected origin remote: $origin"
}

foreach ($branch in $branches) {
  git push --set-upstream origin $branch
}

gh repo edit $repository --default-branch codex/template-gallery

npm run check:assets
gh repo view $repository --json nameWithOwner,url,visibility,defaultBranchRef
