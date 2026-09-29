# Exports StudyFlow_Documentation.docx to PDF via Word COM automation.
# Strategy: disable every interactive surface, open, update fields + TOC,
# export, close - with stage prints so a hang can be localized to one step.
# Run: powershell -ExecutionPolicy Bypass -File tools/export-pdf.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$docx = Join-Path $root "StudyFlow_Documentation.docx"
$pdf  = Join-Path $root "StudyFlow_Documentation.pdf"

if (-not (Test-Path $docx)) { throw "Source not found: $docx" }

Write-Host "[1] Starting Word (hidden, no alerts, no macros)..."
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0                    # wdAlertsNone
$word.AutomationSecurity = 3               # msoAutomationSecurityForceDisable
$word.Options.UpdateFieldsAtPrint = $true  # fields refresh during export
$word.Options.CheckGrammarAsYouType = $false
$word.Options.CheckSpellingAsYouType = $false

try {
  Write-Host "[2] Opening document..."
  $doc = $word.Documents.Open($docx, $false, $false)

  Write-Host "[3] Updating fields and TOC..."
  try {
    $doc.Fields.Update() | Out-Null
  } catch { Write-Host "    field update warning: $($_.Exception.Message)" }
  try {
    for ($i = 1; $i -le $doc.TablesOfContents.Count; $i++) {
      $doc.TablesOfContents.Item($i).Update() | Out-Null
    }
  } catch { Write-Host "    toc update warning: $($_.Exception.Message)" }

  Write-Host "[4] Repaginating..."
  try { $doc.Repaginate() } catch { }

  Write-Host "[5] Exporting PDF..."
  $doc.ExportAsFixedFormat($pdf, 17)       # 17 = wdExportFormatPDF
  Write-Host "[6] Closing document..."
  $doc.Close($false)
  Write-Host "DONE: $pdf"
}
finally {
  Write-Host "[7] Quitting Word..."
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
