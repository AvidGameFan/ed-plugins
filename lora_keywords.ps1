# lora_keywords
# Extracts the list of keywords used in the lora, and sorts them by frequency of occurrance.
# By Gary W. 2/22/2025, with much assistence from CoPilot.

# Usage:     .\lora_keywords  -FileName "c:\my_lora.safetensors"
# Optional:  .\lora_keywords  -FileName "c:\my_lora.safetensors" -Cutoff 20

param (
    [string]$FileName,

    [Parameter(Mandatory=$false)]
    [int]$Cutoff = 1
)


# Read the file content
$content = (Get-Content $fileName -Raw) -replace '[\\][""]', '"'

# Use regex to find and extract the ss_tag_frequency part
$ssTagFrequency = [regex]::Match($content, '"ss_tag_frequency":"\{(.*?)\}"', [System.Text.RegularExpressions.RegexOptions]::Singleline).Groups[1].Value

# Wrap the extracted JSON string in a format that ConvertFrom-Json can handle
$ssTagFrequency = "{ $ssTagFrequency }"

# Convert the extracted ss_tag_frequency JSON to a PowerShell object
$ssTagFrequencyObj = $ssTagFrequency | ConvertFrom-Json

# Process the ss_tag_frequency data
$result = foreach ($tag in $ssTagFrequencyObj.PSObject.Properties) {
    foreach ($key in $tag.Value.PSObject.Properties) {
        $frequency = $key.Value
        if ($frequency -ge $Cutoff) {
            [PSCustomObject]@{
                Tag = $key.Name
                Frequency = [int]$frequency
            }
        }
    }
}

# Sort the result by Frequency in descending order
$result = $result | Sort-Object Frequency -Descending

# Output the result
$result | ForEach-Object { "$($_.Frequency): $($_.Tag)" }
