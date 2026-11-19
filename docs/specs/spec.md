# Purga — especificación funcional

> **Maqueta** (una por cuenta; la sesión cambió de cuenta el 2026-11-05 y no se sabe cuál es cuál) · URL A: https://claude.ai/artifact/1LGD1NAEP9miXHU6rm3fqG · URL B: https://claude.ai/artifact/YMcUwRU9NtETqEpnwEpidd. La de gmail RqTBBp5… fue eliminada. Fuente: `docs/maqueta/plantilla.html`.
> Fuente de la maqueta: `docs/maqueta/plantilla.html` (nivel: diseño final, por aprobar).
> Estado: fase 0, propuesta. Nada construido todavía.
> Este documento lleva lo que la maqueta no muestra: cómo funciona por dentro, el modelo de datos, las reglas y las
> librerías. Lo visible (pantallas, flujos, estados) está en la maqueta y aquí solo se referencia por lámina.

## 1. Qué es y para quién

Aplicación de escritorio para Windows que indexa carpetas locales, detecta lo que sobra (duplicados, fotos repetidas,
descargas olvidadas, residuos) y avisa lo que vence. **Ninguna regla borra:** proponen; el usuario decide.

**Perfil:** usuario de oficina o de casa, no técnico, disco de 512 GB o más, OneDrive. Descarga del navegador, guarda
adjuntos de Outlook y recibe fotos por WhatsApp. No va a clasificar archivos uno por uno.

**Fuera de alcance:** saber qué *es* un archivo (contrato, factura) por su contenido. Sin IA no es viable; lo que el
usuario quiere proteger lo marca él, a mano o por carpeta.

## 2. Funcionalidades

Cada una con su criterio de aceptación. Se marca `[x]` al probarla en la app construida.

### F-1 Carpetas vigiladas y reconciliación — lámina 2
- [x] El usuario agrega carpetas (recursivas) y exclusiones; cada carpeta puede tener una **marca de carpeta** (F-5).
- [x] Al abrir, `reconcileRoots()` recorre cada carpeta comparando tamaño y fecha, sin abrir archivos, y pone el índice al día por detrás.
- [x] Con la app abierta, `ReadDirectoryChangesW` mantiene el índice al día. **Sin administrador:** no se usa el USN Journal en v1.
- [x] Un disco desconectado deja sus archivos «en pausa», no «perdidos».

### F-2 Origen de cada archivo — lámina 4 (detalle)
- [x] Orden de evidencia: `Zone.Identifier` con `HostUrl` (navegador, 0,95) › ruta de adjuntos de Outlook (0,9) › nombre/carpeta de WhatsApp (0,85) › `Downloads\Telegram Desktop` (0,9) › capturas (0,8) › Descargas sin ADS (0,5) › «Desconocido».
- [x] Se guarda la evidencia y la confianza; sin evidencia se muestra «Desconocido», nunca se adivina.

### F-3 Actividad: abierto y modificado — lámina 4
- [x] «Abierto» sale de `%APPDATA%\Microsoft\Windows\Recent\*.lnk` y las Jump Lists; `atime` solo si el volumen lo registra. · **Construido con Recent.** Las Jump Lists: N/A en v1 (no se leen; Recent cubre la apertura por el Explorador y los programas que la registran). `atime` no se usa: NTFS lo tiene apagado por defecto.
- [x] «Modificado» sale de `mtime`. La fecha de creación no cuenta (copiar la renueva).
- [x] La pantalla dice cuál de las dos usó («sin abrir hace…» / «sin abrir · modificado hace…»).

### F-4 Marcas — láminas 4, 5 y 6
- [x] Seis marcas: Sin revisar · Conservar (con vencimiento opcional) · Eliminar · Eliminar el {fecha} · Revisar el {fecha} · Archivado. Más una nota libre.
- [x] **Archivado solo marca:** el archivo queda donde está, sale de las reglas y de la vista diaria. No mueve nada.
- [x] Se marcan varios a la vez (casillas en Explorar); cada acción es un **lote** con Deshacer.
- [x] La marca vive en el índice, atada a volumen + File ID: sobrevive a renombrar y mover en el mismo disco.

### F-5 Marca de carpeta
- [x] Una carpeta tiene una marca (conservar todo, eliminar lo de más de N días, revisar cada N días, ordenar fotos por fecha) y los archivos nuevos la heredan. La marca del archivo gana.
- [x] Antes de guardarla se muestra la **simulación** («programaría 1.240 archivos, 6,1 GB»).

### F-6 Eliminación programada — láminas 4 y 7
- [x] «Eliminar el {fecha}» se ejecuta sola ese día (lo decidió el usuario), con aviso el día anterior y Deshacer.
- [x] Antes de mandar a la Papelera se verifica que sea el mismo archivo (§5.3); si no, pasa a «Revisar».

### F-7 Propuestas de limpieza — lámina 4
- [x] Las reglas BD-1 a BD-7 (§4.2) solo proponen. Aceptar manda a la Papelera de reciclaje con confirmación; rechazar evita que la misma regla lo vuelva a proponer hasta que el archivo cambie.

### F-8 Duplicados exactos
- [x] Agrupar por tamaño › hash parcial › hash completo. Se propone conservar la copia de ruta «canónica» (fuera de Descargas y temporales) o la más antigua.

### F-9 Fotos parecidas — lámina 10
- [x] Hash perceptual de 64 bits; distancia de Hamming ≤ 8 = misma foto.
- [x] La mejor se conserva por este orden: más píxeles › menos compresión (RAW > HEIC/PNG > JPEG; en JPEG, calidad de sus tablas de cuantización) › EXIF original › más nítida › más antigua. Las demás, propuesta de eliminar. El usuario puede preferir otra.

### F-10 Ordenar fotos por fecha — lámina 10
- [x] Fecha: EXIF `DateTimeOriginal` › patrón del nombre (`IMG_YYYYMMDD_…`, `WhatsApp Image YYYY-MM-DD…`) › `mtime` con **confianza baja**.
- [x] A mano: elegir días y **Mover** o **Copiar** a `{destino}\AAAA\AAAA-MM-DD` (o por año o mes). Copiar avisa el espacio.
- [x] Automático: marca de carpeta «Ordenar fotos por fecha». **Solo mueve**, simulación la primera vez, Deshacer por lote. Las de confianza baja se proponen, no se mueven.
- [x] Nombre repetido en el destino → « (1)»; duplicado exacto ya presente → no se copia.

### F-11 Vencimientos — láminas 4 y 7
- [x] Cualquier archivo marcado Conservar puede tener fecha de vencimiento. Avisos 60 · 30 · 7 · 1 días antes, una sola vez cada uno.

### F-12 Filtro de extensiones — lámina 4 (Configuración)
- [x] Global y por carpeta (la de la carpeta gana); modo «todas menos las marcadas» (por defecto) o «solo las marcadas»; grupos y extensiones propias.
- [x] Excluir no borra lo que el usuario cargó: con marca, nota o vencimiento queda «fuera del filtro» y sigue avisando.

### F-13 Clic derecho del Explorador — lámina 9
- [x] Verbo clásico «Programar eliminación con Purga…» en `HKCU\Software\Classes\*\shell` (sin administrador). En Windows 11, en «Mostrar más opciones». · Registro en HKCU y llamada por segunda instancia verificados (prueba de flujo); la entrada dentro del menú del Explorador **sin verificar a ojo**: requiere hacer clic derecho en el Explorador.
- [x] Instancia única: las llamadas que llegan juntas (≈300 ms) forman un solo diálogo y un solo lote. · Verificado con dos llamadas simultáneas (prueba de flujo): un diálogo con los dos archivos y un lote.
- [x] Lo marcado desde ahí entra como **archivo suelto** y se sigue por File ID aunque su carpeta no esté vigilada.

### F-14 Bandeja y avisos — lámina 7
- [x] Al cerrar, queda en la bandeja; «Iniciar con Windows» opcional. Pasada diaria y avisos desde ahí. · Cerrar a la bandeja y volver a abrir verificados. «Iniciar con Windows» **sin verificar**: solo actúa con la app instalada (`setLoginItemSettings` empaquetado).

### F-15 Exportar e importar marcas
- [x] JSON con ruta, hash, marca, nota y etiquetas de cada archivo; al importar se empareja por hash.

### F-16 Etiquetas
- [x] Etiquetas libres por archivo («facturas», «viajes»), varias por archivo; se ponen en lote desde Explorar o en el detalle.
- [x] Una carpeta puede tener etiquetas que heredan sus archivos nuevos (como la marca de carpeta).
- [x] Las reglas pueden poner etiquetas (BD-3 pone «borrador»); las de regla se distinguen de las manuales.

### F-17 Búsqueda combinada y búsquedas guardadas
- [x] Panel de filtros combinables: texto (nombre, nota, etiqueta) · origen · días sin abrir · días sin modificar · marca · etiqueta (todas / alguna) · tamaño · carpeta · tipo.
- [x] El resultado admite las mismas acciones en lote que Explorar.
- [x] Una combinación se guarda con nombre y aparece en la columna izquierda («Descargas viejas de WhatsApp»).
- [x] Días se filtran por fecha (`opened_at < hoy − N`), no por una columna de días, para usar el índice.

### F-18 Reglas configurables
- [x] Herramientas › Reglas: cada regla BD con interruptor, su umbral editable y «Simular» (cuántos archivos y cuánto espacio propondría).

### F-20 Vista previa antes de borrar — lámina 4
- [x] En el detalle, en la barra de selección (tecla Espacio) y en la confirmación de eliminar: «Ver» por archivo y «Revisar uno por uno» con anterior/siguiente.
- [x] Mientras se revisa, cada archivo se puede **sacar del lote**; el botón final dice cuántos quedan («Enviar 4 a la Papelera»).
- [x] Qué se muestra, sin abrir la app del archivo: imagen entera; PDF con el visor de Chromium; Office con la miniatura de Windows (`IShellItemImageFactory`, la del Explorador); texto, primeras 40 líneas; comprimidos, la lista de su contenido sin descomprimir; ejecutables, sus propiedades (editor, versión, firma) y **nunca se ejecutan**; el resto, «Sin vista previa» con «Abrir con…».
- [x] La vista previa no cambia la fecha de último acceso del archivo (mismo cuidado que el hash, §5.4). · **Sin verificar:** se lee sin abrir el programa del archivo; la fecha de acceso de NTFS está apagada por defecto en Windows, así que no se puede medir en este equipo.

### F-19 Discos sin Papelera de reciclaje
- [x] En USB, red y discos externos sin Papelera, eliminar exige una **confirmación fuerte**: el diálogo dice «se borrará definitivamente, no se puede deshacer» y pide escribir el número de archivos.
- [x] Las eliminaciones programadas en esos discos **no se ejecutan solas**: el día de la fecha pasan a Propuestas con ese aviso.

## 3. Modelo de datos (SQLite, `%APPDATA%\Purga\purga.db`)

| Tabla | Campos principales | Nota |
|---|---|---|
| `volume` | `volume_id`, `serial_number` UNIQUE, `mount_path`, `fs_type`, `atime_reliable`, `online` | |
| `watched_root` | `root_id`, `volume_id`, `path`, `recursive`, `exclude_globs`, `extension_mode` (`inherit`/`allow`/`deny`), `folder_mark` JSON | |
| `content` | `content_id`, `size_bytes`, `partial_hash`, `full_hash` UNIQUE NULL | N archivos → 1 contenido = duplicados |
| `file` | `file_id`, `volume_id`, `fs_file_ref` (UNIQUE con volumen), `root_id` NULL, `content_id` NULL, `path`, `name`, `extension`, `size_bytes`, `modified_at`, `opened_at`, `opened_source`, `presence` (`present`/`missing`/`paused`/`filtered_out`), `loose` | `loose` = marcado fuera de carpetas vigiladas |
| `provenance` | `file_id`, `origin`, `confidence`, `evidence` JSON, `inference_version` | |
| `file_decision` | `file_id`, `action`, `due_date`, `expires_on`, `note`, `source` (`manual`/`folder`/`rule`), `batch_id`, `decided_at`, `content_hash_at_decision`, `size_at_decision` | Una por archivo |
| `batch` | `batch_id`, `created_at`, `description`, `undone_at` | Deshacer |
| `rule` / `rule_match` | condición y acción en JSON; `rule_match.resolution` `pending`/`accepted`/`rejected` | Rechazo recordado |
| `extension_filter` | `root_id` NULL, `extension`, `action` | NULL = global |
| `photo` | `file_id`, `width`, `height`, `format`, `jpeg_quality`, `has_exif`, `taken_at`, `date_source`, `phash`, `sharpness` | Caché: no se recalcula si el archivo no cambió |
| `photo_preference` | `group_key`, `preferred_file_id` | La elegida a mano |
| `tag` / `file_tag` / `root_tag` | `tag_id`, `name` UNIQUE, `color`; `file_tag(file_id, tag_id, source)`; `root_tag(root_id, tag_id)` | `source`: `manual`/`folder`/`rule` |
| `saved_search` | `search_id`, `name`, `filters` JSON, `pinned` | Aparece en la columna izquierda |
| `event_outbox` | `event_id`, `type`, `payload`, `dedupe_key` UNIQUE, `delivered_at` | Avisos una sola vez |

Índices: `file(presence, opened_at)`, `file(presence, modified_at)`, `file_decision(action, due_date)`, `provenance(origin)`, `photo(phash)`, FTS5 sobre nombre, ruta y nota.

## 4. Reglas

### 4.1 Marcas
| # | Regla |
|---|---|
| M-1 | Modificado después de marcarlo para eliminar → la marca se suspende y pasa a «Revisar». |
| M-2 | Movido o renombrado en el mismo disco → conserva la marca (File ID). |
| M-3 | Copiado → la copia no hereda; se avisa «copia de un archivo marcado». |
| M-4 | Desapareció antes de la fecha → marca cerrada «ya no existe». |
| M-5 | Disco desconectado en la fecha → espera a que vuelva y avisa. |
| M-6 | Deshacer un lote → restaura las marcas y saca de la Papelera lo que siga ahí. |

### 4.2 Limpieza (solo proponen)
| # | Condición | Propone |
|---|---|---|
| BD-1 | Origen navegador, WhatsApp o Telegram, sin abrir > 30 días | Eliminar |
| BD-2 | Nombre de borrador y sin abrir > 60 días | Eliminar |
| BD-3 | Patrón temporal: `_borrador`, `_v1`, `copy`, `(1)`, `final_final` | Etiqueta «borrador» |
| BD-4 | Versión anterior de una familia (misma carpeta, mismo nombre normalizado) > 30 días | Eliminar |
| BD-5 | Duplicado exacto | Eliminar salvo una copia |
| BD-6 | Residuos (`~$*`, `.tmp`, `.crdownload`, `.part`) > 7 días | Eliminar |
| BD-7 | Instalador (`.exe`, `.msi`) en Descargas > 30 días | Eliminar |

Ganan sobre todas: marca Conservar o Archivado, vencimiento activo, marca de carpeta «conservar todo».

### 4.3 Extensiones
EXT-1 la carpeta gana sobre la global · EXT-2 comparación normalizada (minúscula, sin punto) · EXT-3 extensiones dobles
solo si están declaradas (`tar.gz`) · EXT-4 excluir no borra lo cargado por el usuario · EXT-5 un vencimiento sigue
avisando aunque quede fuera del filtro · EXT-6 se avisa si un filtro deja una regla sin archivos posibles · EXT-7 el
filtro es por nombre; el tipo real se registra aparte.

## 5. Flujos internos

### 5.1 Arranque
`openSplash` → `openDatabase` (WAL, migraciones) → `reconcileRoots` (por detrás) → ventana principal `app:ready` →
`watchRoots` → `closeWhenSeen` (mínimo `SPLASH_MIN_MS` = 400) → `runDailyPass` si pasaron más de 24 h →
`deliverOutbox` → bandeja.

### 5.2 Pasada diaria
Inactividad y reglas → propuestas nuevas; vencimientos → avisos con `dedupe_key = {archivo}:{umbral}`; programados de
mañana → aviso; programados de hoy → §5.3; fotos nuevas en carpetas «ordenar por fecha» → mover.

### 5.3 Ejecutar una eliminación programada
1. Abrir el archivo con `OpenFileById` (volumen + File ID); si no abre → M-4.
2. Comparar tamaño y hash con `size_at_decision` y `content_hash_at_decision`; si difieren → M-1.
3. Si el volumen no tiene Papelera → no se ejecuta: pasa a Propuestas con el aviso de F-19.
4. Enviar a la Papelera (`IFileOperation` con deshacer) y registrar en el lote del día.

### 5.5 Errores del disco (propuesto, ajustable)
| Caso | Qué hace Purga |
|---|---|
| Acceso denegado al leer una carpeta | La salta, la lista en «Carpetas que no se pudieron leer» y reintenta en la próxima revisión. `WARN` en el registro |
| Archivo en uso al calcular el hash o al eliminar | Reintenta en la próxima pasada; al eliminar, el lote informa «1 no se pudo, estaba abierto». Nunca fuerza |
| Ruta de más de 260 caracteres | Se usa el prefijo `\\?\` en todas las operaciones de archivo |
| Archivo solo en la nube (OneDrive, atributo `RECALL_ON_DATA_ACCESS`) | Se indexa por metadatos; no se lee su contenido (sin hash ni foto) para no descargarlo |
| Índice dañado | Se reconstruye desde el disco; marcas, notas y etiquetas se recuperan de la última copia diaria del índice |

### 5.4 Fotos
Leer metadatos y EXIF → `phash` y nitidez una vez por versión del archivo (caché en `photo`) → agrupar por distancia
≤ 8 → elegir la mejor (F-9) → propuestas.

### 5.6 Rendimiento, privacidad y desinstalación (propuesto, ajustable)
- **Escala objetivo:** 500.000 archivos indexados; primera revisión de 100.000 archivos en menos de 2 minutos (solo
  metadatos); búsqueda combinada en menos de 200 ms; memoria en reposo bajo 250 MB.
- **Cálculo de hashes:** cola de baja prioridad, un hilo, pausa con batería por debajo del 30 % o con la app en
  pantalla completa de otra aplicación.
- **Registro:** las rutas van con la carpeta del usuario reemplazada por `%USERPROFILE%` y el nombre del archivo solo en
  `DEBUG` (apagado por defecto); en `INFO` y superiores, el identificador interno del archivo.
- **Videos:** fuera de alcance de Fotos en v1 (ni parecidos ni orden por fecha); se indexan como cualquier archivo.
- **Desinstalar:** quita el verbo del clic derecho, el inicio con Windows y el ícono de la bandeja. El índice, las
  marcas y la configuración en `%APPDATA%\Purga\` se conservan salvo que el usuario marque «Borrar también mis datos».

## 6. Librerías y referencias

| Para | Usar | Estado |
|---|---|---|
| Hash perceptual | [sharp-phash](https://npmjs.com/package/sharp-phash) (MIT, TypeScript, distancia de Hamming incluida) | Verificado en npm |
| Leer y medir imágenes | Sharp (dependencia de sharp-phash) | Nitidez con `stats()`: **a verificar** |
| EXIF | exifr | Licencia y mantenimiento **a verificar** |
| Descartado | blockhash-core | Sin publicaciones desde 2019 |

| Referencia (se lee, no se integra) | Qué tomar |
|---|---|
| [imagededup](https://pypi.org/project/imagededup) (idealo, Apache 2.0) | Comparación de PHash, DHash, WHash y AHash, y cómo fijar el umbral |
| Czkawka (Qarmin) | Caché de hashes en disco y cómo presenta las «parecidas». Licencia **a verificar** antes de copiar código |
| [phockup](https://github.com/pabera/phockup) | Orden de las fuentes de fecha, fecha desde el nombre por expresión regular, carpeta para lo que no tiene fecha. Licencia MIT según su insignia: **confirmar el LICENSE** |

## 7. Supuestos a verificar antes de construir

| Supuesto | Cómo verificarlo |
|---|---|
| `OpenFileById` funciona sin administrador con un handle de la raíz del volumen | Prototipo de 20 líneas en un usuario estándar |
| Los `.lnk` de Recent y las Jump Lists dan la última apertura | Abrir 3 archivos y leerlos |
| `fsutil behavior query disablelastaccess` en el equipo destino | Una consulta |
| Sharp `stats()` da nitidez útil para desempatar ráfagas | 10 fotos de una ráfaga |
| Licencias de exifr, Czkawka y phockup | Leer su LICENSE |

## 8. Base de la app (`app-nueva`)

- [x] Identidad: nombre Purga y logo del diseñador · autor **Jhovanny Linares** · licencia **MIT** (`LICENSE` en la raíz) · `appId` **com.jhovanny.purga** · app personal · versión inicial 0.1.0. Repositorio: N/A hasta que el usuario lo cree (se pidió no iniciar git todavía).
- [x] Pantalla de carga · [x] idioma ES/EN · [x] tema noche/día (diseño de la familia, `tokens.css`)
- [x] Menú Archivo · Editar · Ver · Herramientas · Ayuda · [x] Ayuda (Guía F1, Lo que conviene saber, Notas, Registro, Acerca de)
- [x] Datos y registro en `%APPDATA%\Purga\` · [x] seguridad base · [x] instalador por usuario (`dist\Purga Setup 0.1.0.exe` construido y la app empaquetada probada; **instalar y desinstalar sin verificar**: lo corre el usuario) · [x] README

## 9. Decisiones

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-11-04 | Sin estado «Contrato vigente»: Conservar + vencimiento opcional | Sin IA no se sabe qué es un contrato ni si está vigente |
| 2026-11-04 | Sin administrador; sin USN Journal en v1 | Instalación por usuario, como el resto de la familia |
| 2026-11-04 | Bandeja + iniciar con Windows opcional | Los avisos importan con la ventana cerrada |
| 2026-11-04 | Marcas en el índice, por volumen + File ID | No ensucia carpetas y sobrevive a mover |
| 2026-11-04 | «Eliminar el {fecha}» se ejecuta solo | Lo decidió el usuario, no una regla |
| 2026-11-04 | Clic derecho en el menú clásico | El menú de Windows 11 exige MSIX firmado |
| 2026-11-04 | Ordenar fotos automático solo mueve | Copiar en silencio duplica espacio |
| 2026-11-04 | Recuperar etiquetas y búsqueda combinada (F-16, F-17) | Estaban en el pedido original y se habían perdido |
| 2026-11-04 | Discos sin Papelera: confirmación fuerte y sin ejecución automática (F-19) | Ahí Windows borra definitivamente |
| 2026-11-04 | Archivado solo marca, no mueve | Mover cambia rutas que el usuario conoce |
| 2026-11-04 | App personal, MIT, Jhovanny Linares | Decide autor, `appId` y licencia del Acerca de |

## 10. Pendiente antes de construir
- Aprobar la maqueta (hoy todas las láminas dicen «Propuesta · pendiente»).
- Verificar los supuestos de la §7, empezando por `OpenFileById` sin administrador.
- Revisar los valores propuestos de §5.5 y §5.6.
- Escribir `docs/specs/plan.md` (fases con su verificación) y el diccionario de textos en inglés.
