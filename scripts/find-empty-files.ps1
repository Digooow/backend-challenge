Get-ChildItem -Path . -Recurse -File | Where-Object { $_.Length -eq 0 } | Select-Object -ExpandProperty FullName
