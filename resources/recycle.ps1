# Papelera de reciclaje de Windows para Purga (F-6, M-6). Lo llama src/backend/recycle.ts.
#   recycle.ps1 trash   <archivo.json>   envía a la Papelera cada ruta de la lista
#   recycle.ps1 restore <archivo.json>   saca de la Papelera cada ruta original de la lista, si sigue ahí
# El JSON de entrada es un arreglo de rutas; la salida, un arreglo { path, ok, error, permanent, detail } en UTF-8.
# `error` es un código que la interfaz traduce (missing, locked, denied, tooLong, badName, exists, notInBin, other).
param([Parameter(Mandatory)][ValidateSet('trash', 'restore')][string]$Mode, [Parameter(Mandatory)][string]$ListFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# en PowerShell 5.1, @(... | ConvertFrom-Json) envuelve el arreglo entero en un solo elemento
$paths = Get-Content -LiteralPath $ListFile -Raw -Encoding UTF8 | ConvertFrom-Json
$results = @()
# el shell no acepta el prefijo \\?\ ni rutas desde MAX_PATH: ahí se usa el nombre corto 8.3, que sí acepta
$LongPrefix = '\\?\'
$MaxShellPath = 260

# compilar C# cuesta segundos (más con el antivirus): solo se hace cuando aparece una ruta larga
$NativeSource = @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PurgaShell {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern uint GetShortPathNameW(string longPath, StringBuilder shortPath, uint size);
  public static string ShortPath(string path) {
    var buffer = new StringBuilder(32768);
    return GetShortPathNameW(path, buffer, (uint)buffer.Capacity) == 0 ? null : buffer.ToString();
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct FileOperation { public IntPtr hwnd; public uint func; public string from; public string to; public ushort flags; public bool aborted; public IntPtr mappings; public string title; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHFileOperationW(ref FileOperation operation);
  const uint FO_DELETE = 3;
  // FOF_ALLOWUNDO (a la Papelera) | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
  const ushort RECYCLE_FLAGS = 0x40 | 0x10 | 0x4 | 0x400;
  public static int Recycle(string path) {
    var operation = new FileOperation { func = FO_DELETE, from = path + "\0", flags = RECYCLE_FLAGS };
    return SHFileOperationW(ref operation);
  }
}
'@

function Initialize-Native { if (-not ('PurgaShell' -as [type])) { Add-Type -TypeDefinition $NativeSource } }

# con \?\ delante, .NET no recorta puntos ni espacios finales ni se detiene en MAX_PATH
function Test-File([string]$path) { return [IO.File]::Exists($LongPrefix + $path) }

function Get-ShellPath([string]$path) {
  if ($path.Length -lt $MaxShellPath) { return $path }
  Initialize-Native
  $short = [PurgaShell]::ShortPath($LongPrefix + $path)
  if (-not $short) { return $null }
  $short = $short.Substring($LongPrefix.Length)
  if ($short.Length -ge $MaxShellPath) { return $null }
  return $short
}

function Split-Parent([string]$path) {
  $cut = $path.LastIndexOf('\')
  return @{ folder = $path.Substring(0, $cut); name = $path.Substring($cut + 1) }
}

# cada elemento de la Papelera deja un $I… en la carpeta del usuario de esa unidad; -1 si no se puede leer
$UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-BinCount([string]$root) {
  $folder = $LongPrefix + $root + '$Recycle.Bin\' + $UserSid
  try {
    if (-not [IO.Directory]::Exists($folder)) { return 0 }
    return [IO.Directory]::GetFiles($folder, '$I*').Length
  } catch {
    return -1
  }
}

# $I… guarda versión (8 bytes), tamaño (8), fecha de borrado FILETIME (8) y la ruta original en UTF-16: en la
# versión 1 (Windows 7) son 520 bytes fijos; en la 2 (Windows 10+) va antes su largo en caracteres (4 bytes)
$InfoHeaderBytes = 24
$InfoV1PathBytes = 520
function Read-RecycleInfo([string]$infoFile) {
  try {
    $bytes = [IO.File]::ReadAllBytes($infoFile)
    if ($bytes.Length -lt $InfoHeaderBytes + 4) { return $null }
    $version = [BitConverter]::ToInt64($bytes, 0)
    if ($version -eq 1) {
      $text = [Text.Encoding]::Unicode.GetString($bytes, $InfoHeaderBytes, [Math]::Min($InfoV1PathBytes, $bytes.Length - $InfoHeaderBytes))
    } elseif ($version -eq 2) {
      $characters = [BitConverter]::ToInt32($bytes, $InfoHeaderBytes)
      $text = [Text.Encoding]::Unicode.GetString($bytes, $InfoHeaderBytes + 4, [Math]::Min($characters * 2, $bytes.Length - $InfoHeaderBytes - 4))
    } else {
      return $null
    }
    $original = $text.Split([char]0)[0]
    # una ruta larga queda registrada con el prefijo \\?\ delante
    if ($original.StartsWith($LongPrefix)) { $original = $original.Substring($LongPrefix.Length) }
    $parts = Split-Parent $infoFile
    $content = $parts.folder + '\$R' + $parts.name.Substring(2)
    return @{ path = $original; deletedAt = [BitConverter]::ToInt64($bytes, 16); info = $infoFile; content = $content }
  } catch {
    # un $I dañado o a medio escribir no impide restaurar los demás: ese archivo queda como «no está en la Papelera»
    return $null
  }
}

$LockedHResult = -2147024864  # 0x80070020, ERROR_SHARING_VIOLATION
function Get-ExceptionCode($exception) {
  if ($exception -is [IO.FileNotFoundException] -or $exception -is [IO.DirectoryNotFoundException]) { return 'missing' }
  if ($exception -is [UnauthorizedAccessException]) { return 'denied' }
  if ($exception -is [IO.IOException] -and $exception.HResult -eq $LockedHResult) { return 'locked' }
  return 'other'
}

function Get-ShellCode([int]$code) {
  switch ($code) {
    { $_ -in 2, 3 } { return 'missing' }
    { $_ -in 32, 33 } { return 'locked' }
    5 { return 'denied' }
    default { return 'other' }
  }
}

# devuelve $null si salió bien, o @{ error; detail }
function Send-ToRecycleBin([string]$path) {
  if ($path.Length -lt $MaxShellPath) {
    try {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, 'OnlyErrorDialogs', 'SendToRecycleBin')
      return $null
    } catch {
      $exception = if ($_.Exception.InnerException) { $_.Exception.InnerException } else { $_.Exception }
      return @{ error = (Get-ExceptionCode $exception); detail = $exception.Message }
    }
  }
  $shellPath = Get-ShellPath $path
  if (-not $shellPath) { return @{ error = 'tooLong'; detail = 'sin nombre corto 8.3 que quepa en MAX_PATH' } }
  $code = [PurgaShell]::Recycle($shellPath)
  if ($code -ne 0) { return @{ error = (Get-ShellCode $code); detail = "SHFileOperation $code" } }
  return $null
}

if ($Mode -eq 'trash') {
  Add-Type -AssemblyName Microsoft.VisualBasic
  foreach ($path in $paths) {
    $name = (Split-Parent $path).name
    # Windows no puede mandar estos nombres a la Papelera por ninguna vía del shell
    if ($name.EndsWith('.') -or $name.EndsWith(' ')) { $results += @{ path = $path; ok = $false; error = 'badName'; permanent = $false }; continue }
    $root = $path.Substring(0, 3)
    $before = Get-BinCount $root
    $failure = Send-ToRecycleBin $path
    if (-not $failure -and (Test-File $path)) { $failure = @{ error = 'other'; detail = 'sigue en disco después de enviarlo' } }
    if ($failure) { $results += @{ path = $path; ok = $false; error = $failure.error; permanent = $false; detail = $failure.detail }; continue }
    # con la Papelera desactivada o llena, el shell borra en definitiva sin avisar: se nota en que no creció
    $after = Get-BinCount $root
    $permanent = $before -ge 0 -and $after -ge 0 -and $after -le $before
    $results += @{ path = $path; ok = $true; error = $null; permanent = $permanent }
  }
} else {
  # Se lee la Papelera por sus archivos y no por Shell.Application: con miles de elementos, enumerarla por COM
  # tarda decenas de segundos. Cada elemento es un par: $I… (ruta original y fecha) y $R… (el contenido).
  $deletedByPath = @{}
  foreach ($root in @($paths | ForEach-Object { $_.Substring(0, 3) } | Sort-Object -Unique)) {
    $binFolder = $LongPrefix + $root + '$Recycle.Bin\' + $UserSid
    if (-not [IO.Directory]::Exists($binFolder)) { continue }
    foreach ($infoFile in [IO.Directory]::GetFiles($binFolder, '$I*')) {
      $entry = Read-RecycleInfo $infoFile
      if (-not $entry) { continue }
      $key = $entry.path.ToLowerInvariant()
      # el más reciente gana: si el mismo archivo se borró dos veces, se restaura la última versión
      if (-not $deletedByPath[$key] -or $deletedByPath[$key].deletedAt -lt $entry.deletedAt) { $deletedByPath[$key] = $entry }
    }
  }
  foreach ($path in $paths) {
    $entry = $deletedByPath[$path.ToLowerInvariant()]
    if (-not $entry -or -not [IO.File]::Exists($entry.content)) { $results += @{ path = $path; ok = $false; error = 'notInBin' }; continue }
    # restaurar nunca reemplaza un archivo que el usuario creó después con el mismo nombre
    if (Test-File $path) { $results += @{ path = $path; ok = $false; error = 'exists' }; continue }
    try {
      [IO.Directory]::CreateDirectory($LongPrefix + (Split-Parent $path).folder) | Out-Null
      [IO.File]::Move($entry.content, $LongPrefix + $path)
      [IO.File]::Delete($entry.info)
      $results += @{ path = $path; ok = $true; error = $null }
    } catch {
      $results += @{ path = $path; ok = $false; error = 'other'; detail = $_.Exception.Message }
    }
  }
}
ConvertTo-Json -InputObject @($results) -Compress
