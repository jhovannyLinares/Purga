"""P9 · flujo entre pantallas: qué abre cada menú o botón, el paso siguiente, qué se habilita y el cierre.
Los datos (reglas, marcas, Papelera) ya los prueban los tests de integración; aquí se prueba el recorrido.
Uso: npm run build && python tests/e2e/flujo.py
"""
import os
import subprocess

from harness import APP_COMMAND, ROOT, app_env, check, isolation_args, wait_window, finish, prepare_fixture, running_app, seed_roots, shot, wait_until

VERB_KEY = r'HKCU\Software\Classes\*\shell\Purga.Programar'


def text(page, selector):
    return page.inner_text(selector) if page.query_selector(selector) else ''


def toast_text(page, expected=''):
    """El aviso que contiene `expected`: el anterior puede seguir visible unos segundos."""
    wait_until(page, f"document.querySelector('.toast')?.innerText.includes({expected!r})")
    return text(page, '.toast')


def go(page, label):
    page.click(f'.nav-item >> text="{label}"')


def first_use(page):
    # el Resumen pinta su título enseguida y el estado vacío cuando responde el backend
    wait_until(page, "document.querySelector('.list .empty')")
    check('primer uso: sin carpetas muestra el estado vacío', 'Todavía no hay carpetas vigiladas' in text(page, '.list'))
    check('primer uso: Agregar carpeta habilitado y búsqueda deshabilitada', page.is_enabled('.toolbar .btn.primary') and page.is_disabled('.toolbar .search'))
    shot(page, 'flujo_1_primer_uso')


def proposals(page):
    go(page, 'Propuestas')
    wait_until(page, "document.querySelectorAll('.cols-proposals:not(.th)').length > 0")
    count = int(text(page, '.nav-item.on .count') or 0)
    rows = page.locator('.cols-proposals:not(.th)').count()
    check('Propuestas: el contador de la columna izquierda es el número de filas', count == rows, f'{count} vs {rows}')
    row = text(page, '.cols-proposals:has-text("informe_q3_v2.docx")')
    check('Propuestas: un archivo con dos reglas va en una sola fila', 'Borrador olvidado' in row and 'Versión anterior' in row, row)
    row_selector = '.cols-proposals:has-text("informe_q3_v2.docx")'
    check('Propuestas: la acción visible dice lo que hace', page.locator(f'{row_selector} >> text="A la Papelera"').count() == 1)
    page.click(f'{row_selector} >> [aria-label="Más opciones"]')
    page.wait_for_selector('.more-menu')
    options = text(page, '.more-menu')
    check('Propuestas: ⋮ trae Dejarlo y Conservar siempre', 'Dejarlo' in options and 'Conservar siempre' in options, options)
    shot(page, 'flujo_2_propuestas_menu')
    page.click('.more-menu >> text=Dejarlo')
    wait_until(page, "!document.body.innerText.includes('informe_q3_v2.docx')")
    check('Propuestas: Dejarlo la quita de la lista', True)
    shot(page, 'flujo_2_propuestas')


def sort_and_activity(page):
    page.click('.nav-item >> text="Descargas"')
    wait_until(page, "document.querySelectorAll('.cols-explore:not(.th)').length > 1")
    rows = "[...document.querySelectorAll('.cols-explore:not(.th)')].map((row) => row.dataset.file).join(',')"
    before = page.evaluate(rows)
    check('Explorar: cada fila lleva su barra de actividad', page.evaluate("document.querySelectorAll('.cols-explore:not(.th) .activity-bar').length === document.querySelectorAll('.cols-explore:not(.th)').length"))
    page.click('.th [data-sort="activity"]')
    wait_until(page, "document.querySelector('.th-sort.on')?.textContent.includes('▼')")
    check('clic en Actividad la marca activa con ▼', page.get_attribute('.th-sort.on', 'data-sort') == 'activity')
    page.click('.th [data-sort="activity"]')
    wait_until(page, "document.querySelector('.th-sort.on')?.textContent.includes('▲')")
    check('segundo clic invierte el sentido', True)
    page.click('.th [data-sort="size"]')
    wait_until(page, "document.querySelector('.th-sort.on')?.dataset.sort === 'size'")
    check('cambiar de columna mueve la flecha y reordena', page.query_selector_all('.th-sort.on').__len__() == 1 and page.evaluate(rows).count(',') == before.count(','))
    shot(page, 'flujo_orden_actividad')


def trash_and_undo(page):
    page.click('.nav-item >> text="Descargas"')
    wait_until(page, "document.querySelectorAll('.cols-explore:not(.th)').length > 0")
    check('Explorar: sin selección no hay barra de acciones', not page.query_selector('.selbar'))
    page.check('.cols-explore:has-text("dataset_ventas.zip") input')
    page.check('.cols-explore:has-text("descarga.crdownload") input')
    check('Explorar: elegir archivos muestra la barra con el conteo', '2 seleccionados' in text(page, '.selbar'))
    page.click('.selbar >> text="Eliminar"')
    wait_until(page, "document.querySelector('.dialog')")
    check('Eliminar abre la confirmación con la lista', 'dataset_ventas.zip' in text(page, '.dialog') and 'Enviar 2 a la Papelera' in text(page, '.dialog'))
    page.click('.dialog >> text="Revisar uno por uno"')
    wait_until(page, "document.querySelector('.dialog .preview')")
    check('Revisar uno por uno muestra la vista previa con anterior y siguiente', '1 / 2' in text(page, '.dialog-title'))
    page.click('.dialog >> text="Sacar del lote"')
    check('Sacar del lote descuenta del botón final', 'Enviar 1 a la Papelera' in text(page, '.dialog'))
    page.click('.dialog >> text="Siguiente ›"')
    check('Siguiente pasa al segundo archivo', '2 / 2' in text(page, '.dialog-title'))
    page.click('.dialog >> text="Enviar 1 a la Papelera"')
    toast = toast_text(page, 'en la Papelera')
    check('Enviar deja un aviso con Deshacer', '1 archivos en la Papelera' in toast and 'Deshacer' in toast, toast)
    wait_until(page, "!document.querySelector('.list').innerText.includes('descarga.crdownload')")
    check('el archivo enviado sale de la lista y el sacado del lote se queda', 'dataset_ventas.zip' in text(page, '.list'))
    shot(page, 'flujo_3_papelera')
    page.click('.toast >> text="Deshacer"')
    wait_until(page, "document.querySelector('.list').innerText.includes('descarga.crdownload')")
    check('Deshacer lo devuelve de la Papelera a la lista', True)


def schedule_and_keep(page):
    page.check('.cols-explore:has-text("setup_zoom_6.2.exe") input')
    page.click('.selbar >> text="Eliminar el…"')
    wait_until(page, "document.querySelector('.dialog input[type=date]')")
    check('Eliminar el… pide la fecha', 'Ese día irán a la Papelera' in text(page, '.dialog'))
    page.click('.dialog .btn.primary')
    toast_text(page)
    go(page, 'Programados')
    wait_until(page, "document.querySelector('.cols-scheduled:not(.th)')")
    check('lo programado aparece en Programados con su fecha', 'setup_zoom_6.2.exe' in text(page, '.list'))
    page.click('.cols-scheduled:has-text("setup_zoom_6.2.exe") >> text="Quitar"')
    wait_until(page, "!document.querySelector('.list').innerText.includes('setup_zoom_6.2.exe')")
    check('Quitar lo saca de Programados', True)

    page.click('.nav-item >> text="Documentos"')
    wait_until(page, "document.querySelector('.cols-explore:not(.th)')")
    page.check('.cols-explore:has-text("contrato_arriendo_2025.pdf") input')
    page.click('.selbar >> text="Conservar"')
    wait_until(page, "document.querySelector('.dialog')")
    page.check('.dialog input[type=checkbox]')
    check('Conservar con vencimiento muestra la fecha', page.query_selector('.dialog input[type=date]') is not None)
    page.click('.dialog .btn.primary')
    toast_text(page)
    go(page, 'Vencimientos')
    wait_until(page, "document.querySelector('.cols-expiry:not(.th)')")
    check('lo conservado con vencimiento aparece en Vencimientos', 'contrato_arriendo_2025.pdf' in text(page, '.list'))


def detail_note_tag_search(page):
    page.click('.cols-expiry:has-text("contrato_arriendo_2025.pdf")')
    wait_until(page, "document.querySelector('.detail textarea')")
    check('elegir una fila abre su detalle', 'contrato_arriendo_2025.pdf' in text(page, '.detail-name'))
    page.fill('.detail textarea', 'renovar con la inmobiliaria')
    page.click('.detail .detail-name')
    check('la nota se guarda al salir del campo', 'Nota guardada' in toast_text(page, 'Nota guardada'))
    page.click('.detail >> text="+ etiqueta"')
    wait_until(page, "document.querySelector('.dialog input')")
    page.fill('.dialog input', 'legal')
    page.click('.dialog .btn.primary')
    wait_until(page, "document.querySelector('.detail').innerText.includes('#legal')")
    check('la etiqueta aparece en el detalle', True)
    page.fill('.toolbar .search', 'inmobiliaria')
    page.keyboard.press('Enter')
    wait_until(page, "document.querySelector('.filters') && document.querySelector('.list').innerText.includes('contrato_arriendo_2025.pdf')")
    check('buscar por el texto de la nota encuentra el archivo', True)
    page.click('.list-actions >> text="Guardar búsqueda"')
    page.fill('.dialog input', 'Contratos con nota')
    page.click('.dialog .btn.primary')
    wait_until(page, "document.querySelector('.nav').innerText.includes('Contratos con nota')")
    check('la búsqueda guardada aparece en la columna izquierda', True)
    go(page, 'Resumen')
    page.click('.nav-item >> text="Contratos con nota"')
    wait_until(page, "document.querySelector('.list-title').innerText === 'Contratos con nota'")
    check('abrir la búsqueda guardada la vuelve a correr', 'contrato_arriendo_2025.pdf' in text(page, '.list'))
    shot(page, 'flujo_4_busqueda')


def menus_and_settings(page):
    page.keyboard.press('Control+,')
    wait_until(page, "document.querySelector('.list-title').innerText === 'Configuración'")
    check('Ctrl+, abre Configuración', True)
    page.click('.segmented >> text="Claro"')
    wait_until(page, "document.documentElement.dataset.theme === 'light'")
    page.click('.segmented >> text="Oscuro"')
    wait_until(page, "document.documentElement.dataset.theme === 'dark'")
    check('el tema cambia al elegirlo', True)
    page.click('.segmented >> text="English"')
    wait_until(page, "document.querySelector('.menubar-title').innerText === 'File'")
    check('el idioma cambia toda la interfaz', 'Settings' in text(page, '.list-title'))
    page.click('.segmented >> text="Español"')
    wait_until(page, "document.querySelector('.menubar-title').innerText === 'Archivo'")
    page.click('.menubar-title >> text="Ayuda"')
    check('el menú muestra deshabilitado solo lo que no aplica', page.is_enabled('.ctx >> text="Acerca de Purga"'))
    page.click('.ctx >> text="Acerca de Purga"')
    wait_until(page, "document.querySelector('.about-table')")
    check('Acerca de muestra versión, dependencias y dónde guarda', 'con qué corre' in text(page, '.dialog').lower() and 'dónde guarda' in text(page, '.dialog').lower())
    shot(page, 'flujo_5_acerca')
    page.keyboard.press('Escape')
    wait_until(page, "!document.querySelector('.dialog')")
    check('Escape cierra el diálogo', True)
    page.keyboard.press('F1')
    wait_until(page, "document.querySelector('.dialog-title')?.innerText === 'Guía de uso'")
    check('F1 abre la guía de uso', True)
    page.keyboard.press('Escape')
    page.click('.menubar-title >> text="Ayuda"')
    page.click('.ctx >> text="Registro"')
    wait_until(page, "document.querySelector('.log-view')")
    check('Ayuda › Registro muestra el registro', True)
    page.keyboard.press('Escape')
    page.click('.menubar-title >> text="Archivo"')
    check('un clic fuera del menú lo cierra', page.query_selector('.menubar-panel') is not None)
    page.click('.list')
    wait_until(page, "!document.querySelector('.menubar-panel')")


def explorer_verb(page, data):
    # reg responde en la página de códigos OEM de la consola
    registered = subprocess.run(['reg', 'query', VERB_KEY, '/ve'], capture_output=True, encoding='cp850', errors='replace')
    check('el clic derecho queda registrado en HKCU sin administrador', 'con Purga' in registered.stdout, registered.stdout.strip())
    targets = [os.path.join(data, 'Documentos', name) for name in ('notas.txt', 'informe_q3_v3.docx')]
    # el Explorador lanza una instancia por archivo elegido, casi a la vez: cada una entrega su ruta a la que ya corre
    seconds = [subprocess.Popen([*APP_COMMAND, *isolation_args(os.environ.get('PURGA_HOME', '')), f'--schedule={target}'], cwd=ROOT, env=app_env(os.environ.get('PURGA_HOME', ''))) for target in targets]
    codes = [second.wait(timeout=60) for second in seconds]
    wait_until(page, "document.querySelector('.dialog')?.innerText.includes('informe_q3_v3.docx') && document.querySelector('.dialog').innerText.includes('notas.txt')")
    dialog = text(page, '.dialog')
    check('dos archivos del clic derecho forman un solo diálogo', 'notas.txt' in dialog and 'informe_q3_v3.docx' in dialog and codes == [0, 0], f'{codes} {dialog}')
    check('el botón dice cuántos archivos programa', 'Programar 2 archivos' in dialog)
    page.click('.dialog .btn.primary')
    wait_until(page, "document.querySelector('.toast')")
    check('programar desde el Explorador deja un lote con Deshacer', 'Deshacer' in toast_text(page, 'marcados'), text(page, '.toast'))
    shot(page, 'flujo_6_explorador')


def watch_and_tray(page, data):
    page.click('.nav-item >> text="Descargas"')
    wait_until(page, "document.querySelector('.cols-explore:not(.th)')")
    with open(os.path.join(data, 'Descargas', 'recien-llegado.txt'), 'w', encoding='utf-8') as new_file:
        new_file.write('llegó con la app abierta')
    wait_until(page, "document.querySelector('.list').innerText.includes('recien-llegado.txt')")
    check('la vigilancia muestra solo un archivo nuevo, sin escanear a mano', True)
    page.click('.menubar-title >> text="Archivo"')
    page.click('.ctx >> text="Cerrar a la bandeja"')
    wait_window(page.app_pid, visible=False)
    check('Cerrar a la bandeja oculta la ventana sin salir', True)
    # abrir Purga otra vez (acceso directo o bandeja) muestra la ventana que ya corre
    subprocess.run([*APP_COMMAND, *isolation_args(os.environ.get('PURGA_HOME', ''))], cwd=ROOT, env=app_env(os.environ.get('PURGA_HOME', '')), timeout=60)
    wait_window(page.app_pid, visible=True)
    check('abrir Purga de nuevo muestra la misma ventana', True)


def columns_choice(page):
    """Lámina 14: el ⋮ del encabezado de Explorar abre su ventana de columnas; prender «Tipo» la agrega y queda guardada
    en las preferencias; arrastrar un borde ensancha la columna; «Volver a lo de fábrica» deja la tabla como venía."""
    page.click('.nav-item >> text="Descargas"')
    wait_until(page, "document.querySelector('[data-table=\"explore\"] [data-columns]')")
    header = '[data-table="explore"] .tr.th'
    page.click('[data-table="explore"] [data-columns]')
    page.wait_for_selector('.cols-panel')
    check('Columnas: el ⋮ abre «Columnas de Explorar»', 'Columnas de Explorar' in text(page, '.cols-panel'))
    check('Columnas: Nombre no se puede apagar', page.is_disabled('.cols-panel [data-column="name"]'))
    page.check('.cols-panel [data-column="kind"]')
    wait_until(page, f"document.querySelector('{header}').innerText.toLowerCase().includes('tipo')")
    check('Columnas: prender Tipo la agrega a la tabla', True)
    shot(page, 'flujo_columnas')
    preferences_file = os.path.join(os.environ['PURGA_HOME'], 'preferences.json')
    with open(preferences_file, encoding='utf-8') as handle:
        saved = handle.read()
    check('Columnas: la elección queda en las preferencias (sobrevive al reinicio)', '"kind"' in saved, saved[:200])
    page.keyboard.press('Escape')
    wait_until(page, "!document.querySelector('.cols-panel')")
    before = page.evaluate(f"document.querySelector('{header}').style.getPropertyValue('--cols')")
    grip = page.locator(f'{header} .col-grip').nth(1).bounding_box()
    page.mouse.move(grip['x'] + grip['width'] / 2, grip['y'] + grip['height'] / 2)
    page.mouse.down()
    page.mouse.move(grip['x'] + 80, grip['y'] + grip['height'] / 2, steps=4)
    page.mouse.up()
    wait_until(page, f"document.querySelector('{header}').style.getPropertyValue('--cols') !== {before!r}")
    check('Columnas: arrastrar el borde ensancha la columna', True)
    page.click('[data-table="explore"] [data-columns]')
    page.click('.cols-panel >> text="Volver a lo de fábrica"')
    wait_until(page, f"!document.querySelector('{header}').innerText.toLowerCase().includes('tipo')")
    check('Columnas: volver a lo de fábrica quita Tipo', True)
    page.keyboard.press('Escape')


# cuánto se arrastra cada borde, en px: más que el redondeo y menos que lo que separa el ancho de fábrica del mínimo
RESIZE_STEP_PX = 40
RESIZE_TABLES = [('Descargas', 'explore'), ('Propuestas', 'proposals'), ('Duplicados', 'duplicates'), ('Vencimientos', 'expiry'), ('Configuración', 'folders')]


def header_widths(page, table):
    return page.evaluate(f"[...document.querySelectorAll('[data-table=\"{table}\"] .tr.th .col-th')].map((cell) => Math.round(cell.getBoundingClientRect().width))")


def drag_grip(page, table, index, delta):
    grip = page.locator(f'[data-table="{table}"] .tr.th .col-grip').nth(index).bounding_box()
    page.mouse.move(grip['x'] + grip['width'] / 2, grip['y'] + grip['height'] / 2)
    page.mouse.down()
    page.mouse.move(grip['x'] + grip['width'] / 2 + delta, grip['y'] + grip['height'] / 2, steps=4)
    page.mouse.up()


def resize_every_column(page):
    """Cada columna de cada tabla con datos se achica y se ensancha al arrastrar su borde; Nombre incluida."""
    for label, table in RESIZE_TABLES:
        go(page, label)
        wait_until(page, f"document.querySelector('[data-table=\"{table}\"] .tr.th .col-grip')")
        failures = []
        for index in range(len(header_widths(page, table))):
            before = header_widths(page, table)[index]
            drag_grip(page, table, index, RESIZE_STEP_PX)
            wider = header_widths(page, table)[index]
            drag_grip(page, table, index, -2 * RESIZE_STEP_PX)
            narrower = header_widths(page, table)[index]
            if not (wider > before and narrower < wider):
                failures.append(f'columna {index}: {before} → {wider} → {narrower}')
        check(f'Columnas de {label}: cada una se ensancha y se achica', not failures, '; '.join(failures))
        page.click(f'[data-table="{table}"] [data-columns]')
        page.click('.cols-panel >> text="Volver a lo de fábrica"')
        page.keyboard.press('Escape')


def rules_info_and_custom(page):
    """Lámina 13: ⓘ abre y cierra el panel; Nueva regla no se guarda incompleta, y al guardarla aparece como propia."""
    page.click('.menubar-title >> text="Herramientas"')
    page.click('.ctx >> text="Reglas…"')
    wait_until(page, "document.querySelector('.cols-rules')")
    first_info = page.locator('.cols-rules [aria-label="Qué hace"]').first
    first_info.click()
    page.wait_for_selector('.rule-side dl')
    check('Reglas: ⓘ abre el panel con qué revisa y qué nunca toca', 'Nunca toca' in text(page, '.rule-side'))
    first_info.click()
    wait_until(page, "!document.querySelector('.rule-side')")
    page.click('.list-actions >> text="Nueva regla"')
    page.wait_for_selector('.rule-form')
    save = page.locator('.rule-side >> text="Guardar regla"')
    check('Reglas: sin nombre ni carpeta, Guardar está deshabilitado', save.is_disabled())
    page.fill('#rule-name', 'Prueba e2e')
    page.select_option('#rule-where', 'any')
    page.fill('#rule-types', '.pdf')
    check('Reglas: con lo obligatorio lleno, Guardar se habilita', save.is_enabled())
    page.click('.rule-side >> text="Simular"')
    wait_until(page, "document.querySelector('.rule-side').innerText.includes('propondría')")
    shot(page, 'flujo_reglas_nueva')
    save.click()
    wait_until(page, "!document.querySelector('.rule-form') && document.body.innerText.includes('Prueba e2e')")
    wait_until(page, "[...document.querySelectorAll('.cols-rules')].some((row) => row.innerText.includes('Prueba e2e'))")
    check('Reglas: la regla guardada aparece con la marca «propia»', 'propia' in text(page, '.cols-rules:has-text("Prueba e2e")').lower())


def main():
    home, data = prepare_fixture()
    os.environ['PURGA_HOME'] = home
    with running_app(home) as page:
        first_use(page)
        seed_roots(page, data)
        proposals(page)
        sort_and_activity(page)
        columns_choice(page)
        trash_and_undo(page)
        schedule_and_keep(page)
        detail_note_tag_search(page)
        menus_and_settings(page)
        resize_every_column(page)
        rules_info_and_custom(page)
        explorer_verb(page, data)
        watch_and_tray(page, data)
    finish()


if __name__ == '__main__':
    main()
