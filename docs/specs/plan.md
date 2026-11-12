# Purga — plan de construcción

Spec: `spec.md`. Maqueta: una por cuenta, https://claude.ai/artifact/1LGD1NAEP9miXHU6rm3fqG y https://claude.ai/artifact/YMcUwRU9NtETqEpnwEpidd (ver la cabecera de spec.md).
Método: el de Pika, Nautilus y Fluxo. Andamiaje copiado de Pika (electron-vite, React 19, TypeScript, zod, vitest;
backend en `utilityProcess`, contratos IPC con zod validados en main y en el backend). Diseño: `maqueta-app/familia`
(`familia.css` + `tokens.css` de Purga). Pruebas al final (P9), como pidió el usuario; en cada paso, `typecheck` y
`build` como mínimo.

## Criterio de cierre de la construcción

1. Cada criterio `[ ]` de la spec (F-1 a F-20 y la Base) está construido y marcado `[x]`, o declarado `N/A` con su motivo.
2. P9 en verde: tests de integración de la lógica y prueba de pantalla del flujo y de la geometría (§P9).
3. La maqueta reemplaza su sello «Aprobada · por construir» por «Construido» en cada lámina y dice lo construido.

Lo que depende de algo que no se puede verificar en este equipo se cierra declarándolo «sin verificar» con el motivo.

## Arquitectura

```
src/main/       ventana, pantalla de carga, bandeja, clic derecho (registro), puente al backend
src/backend/    índice SQLite (node:sqlite), recorrido del disco, marcas, reglas, fotos, Papelera; nada de esto en la interfaz
src/shared/     ipc-contracts.ts (zod), i18n (es + en tipado), marks.ts, filters.ts
src/renderer/   App.tsx + una vista por archivo, con la hoja de la familia
src/renderer/src/familia.css   copia de maqueta-app/familia/familia.css (no se edita aquí)
src/renderer/src/tokens.css    colores de Purga (contrato de la familia)
```

## Pasos

- **P0 · Esqueleto y base.** Configuración de Pika; `familia.css` + `tokens.css`; i18n es/en tipado; preferencias
  (`%APPDATA%\Purga\preferences.json`: idioma, tema); pantalla de carga; barra superior con menú propio; tema que
  sigue a Windows o el elegido; Acerca de.
  → verify: `typecheck` y `build` en verde; la app abre con la pantalla de carga y la ventana con el marco de la maqueta.
- **P1 · Índice y carpetas (F-1, F-2, F-3, F-12).** Esquema SQLite y migraciones; agregar carpeta; reconciliación por
  `readdir` + `stat`; origen (`Zone.Identifier` por stream alterno); última apertura desde `Recent\*.lnk`; filtro de
  extensiones; vigilancia con `fs.watch` recursivo.
  → verify: una carpeta de prueba con 1.000 archivos queda indexada; agregar, renombrar y borrar se reflejan.
- **P2 · Marcas, lotes y Papelera (F-4, F-5, F-6, F-19, F-20).** `file_decision`, `batch`, Deshacer; marca de carpeta;
  enviar a la Papelera; confirmación fuerte sin Papelera; vista previa.
  → verify: marcar 3, deshacer, enviar a la Papelera y restaurar.
- **P3 · Seguimiento por File ID (F-13 parte, §5.3).** `OpenFileById` + `GetFinalPathNameByHandle` por koffi.
  → verify primero el supuesto: funciona sin administrador. Si no, se declara y la marca sigue solo dentro de las carpetas vigiladas.
- **P4 · Programados, pasada diaria, avisos y bandeja (F-6, F-11, F-14).**
  → verify: un programado con fecha de hoy va a la Papelera tras verificar identidad; un vencimiento avisa una sola vez.
- **P5 · Reglas, propuestas y duplicados (F-7, F-8, F-18).**
  → verify: cada regla BD propone lo que debe sobre un set de prueba; «Simular» cuenta lo mismo que propone.
- **P6 · Fotos (F-9, F-10).** sharp + sharp-phash + exifr.
  → verify: la original gana a la reenviada; ordenar por fecha mueve a `AAAA\AAAA-MM-DD` y Deshacer las devuelve.
- **P7 · Etiquetas y búsqueda combinada (F-16, F-17, F-15).**
  → verify: un filtro de 4 condiciones sobre 10.000 filas responde en menos de 200 ms.
- **P8 · Clic derecho, Ayuda, registro, instalador (F-13, Base).**
  → verify: el instalador por usuario registra y quita el verbo del menú.
- **P9 · Pruebas.** vitest de integración de la lógica (índice, marcas, reglas, fotos, filtros) y prueba de pantalla
  con Playwright por CDP (como Nautilus): **flujo** entre pantallas y **geometría** — ningún texto recortado ni
  desbordado (`scrollWidth > clientWidth` en elementos de texto), menús y diálogos dentro de la ventana, casillas
  alineadas con su texto, en los dos temas y a 1100×700 y 1280×800; capturas para comparar con la maqueta.
  → verify: todo en verde; las capturas y la maqueta lado a lado.

## Estado

| Paso | Estado | Verificación |
|---|---|---|
| P0 | construido | `typecheck` + `build`; la app abre con pantalla de carga y marco |
| P1 | construido | `tests/integration/index.test.ts`: 1.000 archivos, agregar/renombrar/borrar, origen, Recent, extensiones, exclusiones, pausa |
| P2 | construido | `marks.test.ts`: marcar 3, Deshacer, Papelera real y restaurar, confirmación fuerte |
| P3 | construido | `win32.test.ts`: `OpenFileById` **funciona sin administrador**; borrar encuentra el archivo movido |
| P4 | construido | `scheduler.test.ts`: programado de hoy con verificación de identidad, M-1, F-19, avisos una vez |
| P5 | construido | `rules.test.ts`: cada BD propone lo suyo y Simular cuenta lo mismo |
| P6 | construido | `photos.test.ts`: la original gana; ordenar por fecha y Deshacer |
| P7 | construido | `search.test.ts`: 4 condiciones sobre 10.000 filas < 200 ms; exportar/importar |
| P8 | construido | instalador `dist\Purga Setup 0.1.0.exe`; flujo en el empaquetado; instalar/desinstalar sin verificar |
| P9 | construido | vitest 32/32 · `flujo.py` 41/0 (también `pack`) · `geometria.py` 100/0 (2 temas × 2 tamaños) |

## Cierre (2026-11-04)

- **Spec:** 51 criterios `[x]`; lo no verificable en este equipo, declarado en la línea del criterio (Jump Lists N/A,
  clic derecho visto en el Explorador, «Iniciar con Windows» instalado, `atime` de la vista previa, instalar y
  desinstalar).
- **Maqueta:** sellos «Construido», versión 11 en gmail. Diferencias con lo aprobado, ya corregidas en la maqueta: sin
  hora de la pasada diaria (corre cada 24 h desde el arranque o la bandeja), Actividad en vez de Duplicados en el
  detalle, «Pasada diaria ahora» en Herramientas. En la app además: Actividad en dos líneas, una fila por archivo en
  Propuestas, exclusiones en la marca de carpeta, a 1100 px las columnas laterales ceden.
- **Trampas:** `npm install` no baja Electron (`node node_modules/electron/install.js`); la CSP impide `wait_for_function`
  (se sondea con `evaluate`); Chromium separa `--schedule ruta` en la segunda instancia (se usa `--schedule=ruta`);
  empaquetado, PowerShell lee `app.asar.unpacked`.
- **Commits:** sin git por decisión del usuario.

## Validación de seguridad y QA (2026-11-04)

Dos revisiones sobre 0.1.0: auditoría de seguridad (código, `npm audit`, fuses) y QA exploratorio contra la app
(nombres raros, rutas largas, bloqueos, raíces, importar, doble clic, inglés, 5.003 archivos).

**Corregido** (cada uno con su prueba en `tests/integration`, salvo lo de empaquetado, que cubre `e2e:pack`):

| Hallazgo | Corrección |
|---|---|
| Restaurar o Deshacer pisaba un archivo nuevo con el mismo nombre | `recycle.ps1` y `moveBack` fallan si el destino existe (`marks.test.ts`) |
| Importar dejaba `deleteOn` sin tamaño ni huella (la pasada diaria no verificaba) y sin Deshacer | `importMarks` guarda tamaño y huella locales y crea un lote (`search.test.ts`) |
| Importar fallaba con BOM y mostraba el volcado de zod | `readMarksFile` quita el BOM; la interfaz dice `toast.importInvalid` |
| Un `.lnk` dañado en Recent dejaba la revisión parada para siempre | `try/catch` por acceso directo y `finally` en la cola (`recent.test.ts`) |
| `shell:open` abría cualquier ruta que mandara la interfaz | solo la carpeta de datos y el registro |
| `isChannel` aceptaba `toString` y lo heredado | `Object.hasOwn` |
| zod 4.6.5 (GHSA-mrhx-c7xc-m3w5, viaja en el instalador) | zod 4.6.7; `npm audit --omit=dev`: 0 |
| Fuses de Electron por defecto | `electronFuses`: sin RunAsNode, NODE_OPTIONS ni `--inspect`; asar con integridad y obligatorio |

**Segunda tanda (todo lo demás):**

| Hallazgo | Corrección |
|---|---|
| Rutas de más de 260 caracteres no iban a la Papelera | `recycle.ps1` usa el nombre corto 8.3 con `SHFileOperation`; C# se compila solo si aparece una ruta larga (`marks.test.ts`) |
| Nombre terminado en punto o espacio | no hay vía del shell: se informa `badName` y no se borra (`marks.test.ts`) |
| Restaurar enumeraba la Papelera por COM (≈20 s con 2.663 elementos) y emparejaba por nombre y carpeta | lee los `$I` de `$Recycle.Bin\<SID>`, empareja por ruta exacta y mueve el `$R`; un `$I` dañado se excluye |
| Papelera desactivada o llena: borrado definitivo sin aviso | se cuentan los `$I` antes y después; si no creció, el lote lo informa como borrado definitivo y sin Deshacer |
| Mensajes de error crudos de PowerShell | códigos (`missing`, `locked`, `denied`, `tooLong`, `badName`, `exists`, `notInBin`, `other`) traducidos en `trashFail.*`; el detalle va al registro |
| Rutas de la interfaz | `marks:export`/`marks:import` solo con una ruta de un diálogo de main; `marks:fromExplorer` solo con rutas del clic derecho |
| Electron 43.7.7, vitest 4.0.18 | 43.8.7 y 4.1.12; `npm audit --omit=dev`: 0 |
| Zip con directorio central declarado enorme | se rechaza si se sale del archivo y se lee como mucho 4 MB |
| Imagen que tumba sharp: bucle de reinicios | la foto se guarda como analizada antes de decodificar; el backend reinicia con espera creciente hasta 60 s |
| PowerShell por nombre | ruta absoluta (`src/shared/powershell.ts`) |
| Registro con la carpeta del usuario y sin tope | la carpeta del usuario se abrevia a `~`; a los 5 MB rota a `purga.log.1` |
| `PURGA_NOW` empaquetado | main la quita si `app.isPackaged`. `PURGA_HOME` se queda: es el perfil de prueba de `app-nueva` |
| Permisos, DevTools y visor de PDF | permisos negados, DevTools solo en desarrollo, el visor no navega ni abre ventanas |
| Ruta de red en el clic derecho | se descarta `\\servidor\…` |
| Doble clic cerraba el diálogo recién abierto | el segundo clic de un doble clic no cierra |

**Queda, con su motivo:**
- `roots:add` y el destino de `photos:organize` aceptan rutas de la interfaz: el arnés e2e agrega carpetas por
  `roots:add` y las Propuestas mandan su destino calculado por el backend. Solo cuenta con la interfaz comprometida.
- La confirmación fuerte de un disco sin Papelera nace en la interfaz: protege del error del usuario, no de una
  interfaz comprometida.
- La verificación de un programado usa tamaño y huella parcial (64 KB por extremo): un cambio solo en el medio con
  el mismo tamaño pasa. Huella completa costaría leer cada archivo entero en la pasada diaria.
- Los programados de una carpeta quitada siguen: la decisión es sobre el archivo (queda «suelto»), no sobre la carpeta.
- 6 avisos moderados de `minimatch` dentro de electron-builder: solo al empaquetar, no viajan.
- Instalador sin firma: no hay certificado (el README avisa de SmartScreen).
- Sin test propio: tope del zip, ruta de red, abreviar el registro, espera creciente y `$I` dañado (código de main o
  de la Papelera real, fuera del alcance de vitest). Lo cubren el código y las baterías de pantalla.

**Baterías tras corregir:** vitest 37/37 · `flujo.py` 41/0 · `geometria.py` 100/0 · `e2e:pack` 41/0 con fuses ·
`typecheck` limpio. La espera del primer uso en `flujo.py` pasó a esperar el estado vacío: con la ventana más
lenta leía el Resumen antes de que respondiera el backend.
**Trampa:** el fuse `GrantFileProtocolExtraPrivileges` apagado impide que la ventana cargada con `loadFile` se
muestre; queda encendido hasta servir la interfaz con un protocolo propio.

## Orden por columna y barra de actividad (2026-11-05)

- Encabezados de Explorar y Búsqueda ordenan con clic (▲▼); el primer clic va al sentido útil: Actividad y Tamaño de mayor a menor, Nombre, Origen y Marca de la A a la Z. Lógica en `src/shared/file-order.ts`.
- Barra de actividad bajo los días sin abrir: verde hasta 30 días, ámbar hasta 180, rojo después; se llena al año.
- Pruebas: `tests/unit/file-order.test.ts` (8), e2e `flujo.py` sort_and_activity (45/0), geometría 100/0, vitest 45/45, typecheck limpio. Maqueta lámina 11 sellada «Construido» (v13 gmail).

## Listas, acciones, reglas propias y cierre (2026-11-05)

- **Una fila de archivo** (`FileLine`, `FileActions` en `ui.tsx`): nombre arriba y carpeta abajo, recortada por el inicio; Abrir y Mostrar en carpeta al pasar el mouse. En Explorar, Búsqueda, Propuestas, Programados, Vencimientos, Duplicados y «Más espacio sin abrir» (esta última muestra carpetas: abre la carpeta, solo si está dentro de una vigilada, canal `folder:open`).
- **Abrir** usa el programa de Windows; se quitó la ventana propia de PDF. Los ejecutables y scripts (`shared/file-open.ts`) nunca se abren: lo bloquea main en `file:openWith`, no solo la interfaz.
- **Propuestas:** «A la Papelera» y ⋮ (`MoreMenu`) con Vista previa, Dejarlo, Conservar siempre, Eliminar el…, Revisar el….
- **Origen** en una línea con el dominio; enlace completo y Copiar al pedirlo.
- **Reglas** (`views/RulesView.tsx`): frase completa con los días dentro, panel ⓘ, y reglas propias con condiciones fijas (`shared/custom-rules.ts`, `backend/custom-rules.ts`, tabla `custom_rule`, migración 2). Propuestas propias en `rule_match` como «U-{id}». Una fila guardada rota se salta con WARN.
- **Salir** destruye ventanas y bandeja y fuerza la salida a los 5 s si el proceso sigue vivo.
- **Menú Ver** sin temas; el tema queda solo en Configuración.
- **Instalador:** detalle en vivo detrás de «Mostrar detalles» (`build/installer.nsh`, `customCheckAppRunning`) y la página no salta sola a Finalizar.
- `rules:save` y `customRules:save` emiten `index:changed`: antes la casilla de una regla no reflejaba el cambio.
- Arnés e2e: `--user-data-dir` propio, para no chocar con el bloqueo de instancia de una Purga abierta.
- Pruebas: vitest 49/49 (4 nuevas de reglas propias, una con la fila rota), flujo 51/0 (⋮ de Propuestas, ⓘ y Nueva regla), geometría 100/0, typecheck limpio. Maqueta láminas 12 y 13 selladas «Construido» en la plantilla; sin publicar (la URL gmail no responde en esta sesión).
- Tipografía: `familia.css` copiado del canon de `maqueta-app` (escala `--fs-*`); los componentes de lista (`.file-line`, `.row-acts`, `.icon-btn`, `.more-menu`, `.value-line`) viven ahora en la familia. `grep` de tamaños literales en `src/renderer`: 0.

## Columnas a elección y ancho ajustable (2026-11-05, lámina 14)

- ⋮ en el encabezado de las siete tablas (Explorar, Búsqueda, Propuestas, Programados —también en el Resumen—, Vencimientos, Duplicados, Carpetas vigiladas) abre «Columnas de {tabla}»; el borde de cada título se arrastra; doble clic vuelve al ancho de fábrica.
- Lógica en `src/shared/table-columns.ts` (catálogo, valores de fábrica, mínimos, plantilla de grilla, ancho mínimo); componente `src/renderer/src/ColumnTable.tsx`; celdas de archivo en `src/renderer/src/fileColumns.tsx`.
- Se guarda por tabla en `preferences.json` (`tableLayouts`); una tabla con la elección rota vuelve a lo de fábrica y deja un WARN `prefs.tableLayout`. Los cambios se ven al instante y se guardan por detrás.
- Carpetas vigiladas ofrece «Marca de carpeta» y «Etiquetas» (no «Última revisión»: el índice no la guarda por carpeta).
- Pruebas: `tests/unit/table-columns.test.ts` (9, incluida la elección rota); e2e `columns_choice` (⋮, Tipo, guardado en preferencias, arrastre, fábrica): flujo 57/0; geometría 100/0; vitest 59/59; typecheck limpio. Maqueta lámina 14 «Construido» y prototipo con el ⋮ en cada tabla.
- 2026-11-05, corrección: Nombre no se achicaba (tomaba el sobrante con `minmax(…, 1fr)`); ajustada, pasa a ancho fijo y el sobrante va a las acciones del final; doble clic la devuelve a tomar el sobrante. El arrastre parte del ancho en pantalla, y el borde (`.col-grip`, z-index) queda por encima del ⋮ fijo. e2e `resize_every_column`: cada columna de Explorar, Propuestas, Duplicados, Vencimientos y Configuración se ensancha y se achica (62/0).
- 2026-11-05, corrección: un nombre que empieza por punto (`.gitignore`, `.gitattributes`) tiene extensión, como en el Explorador de Windows (`extensionOf`, `dot >= 0`). Antes salía «sin extensión» y una regla «gitignore» no lo alcanzaba. Pruebas: `tests/unit/extensions.test.ts` (5); vitest 65/65.
- 2026-11-05, íconos: auditados exe, instalador, desinstalador, accesos, ventana, bandeja, carga y notificaciones: todos el escudo de Purga; ningún `react.svg`/`vite.svg`/`electron.svg`. El átomo en la barra de tareas venía de `Electron.lnk`, que el Electron de desarrollo crea al notificar con la misma identidad de Windows: en desarrollo la identidad pasa a `com.jhovanny.purga.dev` (medido: el `.lnk` nuevo quedó con `.dev`).
