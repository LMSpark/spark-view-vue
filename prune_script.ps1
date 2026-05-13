function Get-RelativePaths($filePath) {
    $base = (Get-Item "D:\SPARK_VIEW").FullName
    $rel = $filePath.Replace($base, "").TrimStart("\")
    $relForward = $rel.Replace("\", "/")
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
    
    $paths = @()
    # Path patterns
    $paths += "@/$( ($relForward -replace '^src/', '') -replace '\.[^.]+$', '' )"
    $paths += "src/$( $relForward -replace '^src/', '' -replace '\.[^.]+$', '' )"
    $paths += [System.IO.Path]::GetFileName($filePath)
    $paths += $stem

    return $paths | Select-Object -Unique
}

$deletedFiles = @()
$excludeFiles = @("src\main.ts", "src\App.vue", "src\env.d.ts")

for ($i = 1; $i -le 50; $i++) {
    $candidates = Get-ChildItem -Path "src" -Recurse -File -Include *.ts, *.vue, *.js | Where-Object {
        $rel = $_.FullName.Replace((Get-Item "D:\SPARK_VIEW").FullName, "").TrimStart("\")
        $isExcluded = $excludeFiles -contains $rel
        $isView = $rel.StartsWith("src\views")
        -not $isExcluded -and -not $isView
    }

    $toDeleteThisIter = @()

    foreach ($file in $candidates) {
        $searchPatterns = Get-RelativePaths $file.FullName
        $found = $false
        
        $searchDirs = @("src", "tests", "packages") | Where-Object { Test-Path $_ }
        
        $patternString = ($searchPatterns | ForEach-Object { [regex]::Escape($_) }) -join "|"
        
        foreach ($dir in $searchDirs) {
            # Use Select-String with Regex but exclude self
            $grepResults = Get-ChildItem -Path $dir -Recurse -File -Include *.ts, *.vue, *.js, *.json | 
                           Where-Object { $_.FullName -ne $file.FullName } |
                           Select-String -Pattern $patternString
            if ($grepResults) {
                $found = $true
                break
            }
        }

        if (-not $found) {
            $toDeleteThisIter += $file.FullName
        }
    }

    if ($toDeleteThisIter.Count -gt 0) {
        $deletedPaths = @()
        foreach ($f in $toDeleteThisIter) {
            $rel = $f.Replace((Get-Item "D:\SPARK_VIEW").FullName, "").TrimStart("\")
            $deletedPaths += $rel
            Remove-Item $f -Force
            $deletedFiles += $rel
        }
        $msg = "iter ${i}: deleted [" + ($deletedPaths -join ", ") + "]"
        Write-Host $msg
    } else {
        $msg = "iter ${i}: none"
        Write-Host $msg
    }
}

Write-Host "FINAL_DELETED_COUNT: $($deletedFiles.Count)"
Write-Host "FINAL_DELETED_LIST: $($deletedFiles -join ", ")"

Write-Host "Running typecheck..."
pnpm run typecheck
if ($LASTEXITCODE -eq 0) {
    Write-Host "TYPECHECK: PASSED"
} else {
    Write-Host "TYPECHECK: FAILED"
}
