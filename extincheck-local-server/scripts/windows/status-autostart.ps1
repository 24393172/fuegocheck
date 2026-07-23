param([string]$TaskName = 'ExtinCheck Local Server')
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "No instalada: '$TaskName'."
  exit 1
}
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[PSCustomObject]@{
  TaskName = $TaskName
  State = $task.State
  LastRunTime = $info.LastRunTime
  LastTaskResult = $info.LastTaskResult
  NextRunTime = $info.NextRunTime
} | Format-List
