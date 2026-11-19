import koffi from 'koffi'
import { parse } from 'node:path'

/**
 * Llamadas Win32 que Node no trae: encontrar un archivo por su File ID (sobrevive a renombrar y mover en el mismo
 * disco, M-2) y saber si una unidad tiene Papelera de reciclaje (F-19). Sin administrador.
 */
const kernel32 = koffi.load('kernel32.dll')

const FILE_ID_DESCRIPTOR = koffi.struct('FILE_ID_DESCRIPTOR', { dwSize: 'uint32', Type: 'uint32', FileId: 'uint64', padding: 'uint64' })
const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
const CreateFileW = kernel32.func('HANDLE __stdcall CreateFileW(str16 name, uint32 access, uint32 share, void *security, uint32 creation, uint32 flags, HANDLE template)')
const OpenFileById = kernel32.func('HANDLE __stdcall OpenFileById(HANDLE volumeHint, FILE_ID_DESCRIPTOR *id, uint32 access, uint32 share, void *security, uint32 flags)')
const GetFinalPathNameByHandleW = kernel32.func('uint32 __stdcall GetFinalPathNameByHandleW(HANDLE file, _Out_ uint16_t *path, uint32 length, uint32 flags)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(HANDLE handle)')
const GetDriveTypeW = kernel32.func('uint32 __stdcall GetDriveTypeW(str16 root)')

const FILE_SHARE_ALL = 0x1 | 0x2 | 0x4
const OPEN_EXISTING = 3
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
/** Solo atributos: abrir así no cambia la fecha de último acceso (F-20, §5.4). */
const FILE_READ_ATTRIBUTES = 0x80
const FILE_ID_TYPE = 0
const MAX_PATH_CHARS = 32_768
const INVALID_HANDLE = -1n

function isValid(handle: unknown): boolean {
  if (!handle) return false
  return koffi.address(handle) !== BigInt.asUintN(64, INVALID_HANDLE)
}

/** Ruta actual del archivo con ese File ID en la unidad `driveRoot` («C:\»), o null si ya no existe. */
export function pathByFileId(driveRoot: string, fileId: bigint): string | null {
  const volume = CreateFileW(driveRoot, 0, FILE_SHARE_ALL, null, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, null)
  if (!isValid(volume)) return null
  try {
    const descriptor = { dwSize: koffi.sizeof(FILE_ID_DESCRIPTOR), Type: FILE_ID_TYPE, FileId: fileId, padding: 0n }
    const file = OpenFileById(volume, descriptor, FILE_READ_ATTRIBUTES, FILE_SHARE_ALL, null, FILE_FLAG_BACKUP_SEMANTICS)
    if (!isValid(file)) return null
    try {
      const buffer = new Uint16Array(MAX_PATH_CHARS)
      const length = GetFinalPathNameByHandleW(file, buffer, MAX_PATH_CHARS, 0)
      if (length === 0) return null
      return String.fromCharCode(...buffer.subarray(0, length)).replace(/^\\\\\?\\/, '')
    } finally {
      CloseHandle(file)
    }
  } finally {
    CloseHandle(volume)
  }
}

const DRIVE_FIXED = 3

/** Solo los discos fijos tienen Papelera; USB (2), red (4) y CD (5) borran definitivamente (F-19). */
export function hasRecycleBin(path: string): boolean {
  return GetDriveTypeW(parse(path).root) === DRIVE_FIXED
}
