/**
 * Ganan sobre todas las reglas, de fábrica y propias: Conservar o Archivado, vencimiento activo, marca de carpeta
 * «conservar todo». Lo que el usuario ya decidió eliminar tampoco se vuelve a proponer. El `?` es la fecha de hoy.
 */
export const NOT_PROTECTED = `f.presence = 'present'
  AND f.file_id NOT IN (SELECT file_id FROM file_decision WHERE action IN ('keep', 'archived', 'delete', 'deleteOn') OR expires_on >= ?)
  AND (f.root_id IS NULL OR f.root_id NOT IN (SELECT root_id FROM watched_root WHERE folder_mark LIKE '%"keepAll"%'))`
