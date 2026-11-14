# Loads Windows speech once, then reads a WAV path from each stdin line.
# Prints "OK <text>" or "OK" for silence. Prints "ERR <message>" on failure.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

function New-CommandEngine {
  $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $chosen = $null
  foreach ($item in $installed) {
    if ($item.Culture.Name -eq "en-US") { $chosen = $item; break }
  }
  if (-not $chosen) { throw "No English Windows speech recognizer is installed." }
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($chosen.Id)
  $phrases = @(
    "next", "next section", "previous", "previous section", "back",
    "photo", "photos", "picture", "pictures", "photo of the day", "space photo", "image of the day", "go to the photo",
    "maps", "the maps", "go to the maps",
    "move", "movement", "moving around",
    "accessibility", "go to accessibility",
    "precipitation", "rain", "fires", "fire", "active fires",
    "carbon monoxide", "nitrogen oxides", "nox", "temperature", "heat",
    "page overview", "read the overview", "read overview", "play overview", "overview",
    "stop speaking", "be quiet", "stop listening", "stop"
  )
  $choices = New-Object System.Speech.Recognition.Choices
  foreach ($phrase in $phrases) { [void]$choices.Add($phrase) }
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $chosen.Culture
  $builder.Append($choices)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar($builder)))
  return $engine
}

$engine = New-CommandEngine
$dictation = $null
try {
  $dictation = New-Object System.Speech.Recognition.SpeechRecognitionEngine($engine.RecognizerInfo.Id)
  $dictation.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
} catch { $dictation = $null }
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
  $path = [Console]::In.ReadLine()
  if ($null -eq $path) { break }
  $path = $path.Trim()
  if ($path -eq "EXIT") { break }
  if ($path.Length -eq 0) { continue }
  try {
    $engine.SetInputToNull()
    $engine.SetInputToWaveFile($path)
    $result = $engine.Recognize()
    $engine.SetInputToNull()
    $text = ""
    if ($result) { $text = $result.Text }
    if (-not $text -and $dictation) {
      try {
        $dictation.SetInputToNull()
        $dictation.SetInputToWaveFile($path)
        $heard = $dictation.Recognize()
        $dictation.SetInputToNull()
        if ($heard) { $text = $heard.Text }
      } catch {
        try { $dictation.Dispose() } catch { }
        $dictation = $null
      }
    }
    [Console]::Out.WriteLine("OK $text")
  } catch {
    try { $engine.Dispose() } catch { }
    try { $engine = New-CommandEngine } catch { }
    [Console]::Out.WriteLine("ERR $($_.Exception.Message)")
  }
  [Console]::Out.Flush()
}

if ($engine) { $engine.Dispose() }
