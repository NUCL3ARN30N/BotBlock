Add-Type -AssemblyName System.Drawing

# Mirrors the popup's .logo-icon: a rounded square filled with the
# purple -> pink gradient (--ac #6c5ce7 -> --ac2 #fd79a8), holding a
# white "comment-slash" glyph, so the toolbar icon and the popup header
# read as one consistent mark.
function New-Icon {
    param([int]$size, [string]$path)

    $bmp = New-Object -TypeName System.Drawing.Bitmap -ArgumentList @($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1, [int]($size * 0.04))
    $radius = [double]($size * 0.24)

    $rectX = $pad; $rectY = $pad
    $rectW = $size - 2 * $pad; $rectH = $size - 2 * $pad
    $rectRight = $rectX + $rectW
    $rectBottom = $rectY + $rectH

    $bgRect = New-Object -TypeName System.Drawing.RectangleF -ArgumentList @([single]$rectX, [single]$rectY, [single]$rectW, [single]$rectH)
    $purple = [System.Drawing.Color]::FromArgb(255, 108, 92, 231)  # --ac
    $pink = [System.Drawing.Color]::FromArgb(255, 253, 121, 168)   # --ac2
    $bgBrush = New-Object -TypeName System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @($bgRect, $purple, $pink, [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)

    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $bgPath.AddArc($rectX, $rectY, $d, $d, 180, 90)
    $bgPath.AddArc($rectRight - $d, $rectY, $d, $d, 270, 90)
    $bgPath.AddArc($rectRight - $d, $rectBottom - $d, $d, $d, 0, 90)
    $bgPath.AddArc($rectX, $rectBottom - $d, $d, $d, 90, 90)
    $bgPath.CloseFigure()
    $g.FillPath($bgBrush, $bgPath)

    # Chat bubble outline (white stroke, transparent interior) + tail
    $strokeWidth = [single]([Math]::Max(1.4, $size * 0.075))
    $bubblePen = New-Object -TypeName System.Drawing.Pen -ArgumentList @([System.Drawing.Color]::White, $strokeWidth)
    $bubblePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $bubblePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $bubblePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $bw = [double]($size * 0.54)
    $bh = [double]($size * 0.38)
    $bx = [double](($size - $bw) / 2)
    $by = [double]($size * 0.20)
    $bRadius = [double]($size * 0.10)
    $bd = $bRadius * 2
    $bRight = $bx + $bw
    $bBottom = $by + $bh

    # Tail notch cut into the bottom edge, between the two bottom corners.
    $tailBaseLeftX = $bx + $bw * 0.22
    $tailBaseRightX = $bx + $bw * 0.42
    $tailTipX = $bx + $bw * 0.28
    $tailTipY = $bBottom + $size * 0.13

    $bPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bPath.AddArc($bx, $by, $bd, $bd, 180, 90)
    $bPath.AddArc($bRight - $bd, $by, $bd, $bd, 270, 90)
    $bPath.AddArc($bRight - $bd, $bBottom - $bd, $bd, $bd, 0, 90)
    $bPath.AddLine([single]($bRight - $bRadius), [single]$bBottom, [single]$tailBaseRightX, [single]$bBottom)
    $bPath.AddLine([single]$tailBaseRightX, [single]$bBottom, [single]$tailTipX, [single]$tailTipY)
    $bPath.AddLine([single]$tailTipX, [single]$tailTipY, [single]$tailBaseLeftX, [single]$bBottom)
    $bPath.AddLine([single]$tailBaseLeftX, [single]$bBottom, [single]($bx + $bRadius), [single]$bBottom)
    $bPath.AddArc($bx, $bBottom - $bd, $bd, $bd, 90, 90)
    $bPath.CloseFigure()
    $g.DrawPath($bubblePen, $bPath)

    # Diagonal slash through the whole glyph (bottom-left to top-right),
    # matching Font Awesome's "comment-slash" composition.
    $slashPen = New-Object -TypeName System.Drawing.Pen -ArgumentList @([System.Drawing.Color]::White, $strokeWidth)
    $slashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $slashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $overhang = $size * 0.05
    $sx1 = $bx - $overhang
    $sy1 = $bBottom + $overhang
    $sx2 = $bRight + $overhang
    $sy2 = $by - $overhang
    $g.DrawLine($slashPen, [single]$sx1, [single]$sy1, [single]$sx2, [single]$sy2)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$outDir = Join-Path $PSScriptRoot "icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

New-Icon -size 16 -path (Join-Path $outDir "icon16.png")
New-Icon -size 32 -path (Join-Path $outDir "icon32.png")
New-Icon -size 48 -path (Join-Path $outDir "icon48.png")
New-Icon -size 128 -path (Join-Path $outDir "icon128.png")

Write-Host "Icons generated."
