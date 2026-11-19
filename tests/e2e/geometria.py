"""P9 · geometría: que se vea como la maqueta, sin textos recortados ni desbordados, menús y diálogos dentro de la
ventana y casillas alineadas con su texto. En los dos temas y a 1100×700 (el mínimo) y 1280×800, con capturas para
comparar con la maqueta. Uso: npm run build && python tests/e2e/geometria.py
"""
import os

from harness import check, finish, prepare_fixture, running_app, seed_roots, shot, wait_until

CHECK_SCRIPT = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geometria.js'), encoding='utf-8').read()
WINDOW_SIZES = [(1280, 800), (1100, 700)]
THEMES = ['dark', 'light']
VIEWS = ['Resumen', 'Explorar', 'Propuestas', 'Programados', 'Duplicados', 'Fotos', 'Vencimientos', 'Configuración']
MENUS = ['Archivo', 'Editar', 'Ver', 'Herramientas', 'Ayuda']


# Lo que ocupan el marco y la barra de título de Windows: una ventana de 1280×800 deja 1264×761 de contenido.
FRAME_WIDTH_PX = 16
FRAME_HEIGHT_PX = 39


def resize(page, width, height):
    """Electron no trae el dominio Browser de CDP: se emula el contenido que deja una ventana de ese tamaño."""
    page.set_viewport_size({'width': width - FRAME_WIDTH_PX, 'height': height - FRAME_HEIGHT_PX})
    wait_until(page, f'window.innerWidth === {width - FRAME_WIDTH_PX}')


def set_theme(page, theme):
    page.evaluate("async (theme) => { const prefs = await window.purga.invoke('prefs:load'); await window.purga.invoke('prefs:save', { ...prefs.data, theme }) }", theme)
    wait_until(page, f"document.documentElement.dataset.theme === '{theme}'")


def inspect(page, label, capture):
    problems = page.evaluate(CHECK_SCRIPT)
    check(label, not problems, ' | '.join(problems[:4]))
    if capture:
        shot(page, label.replace(' · ', '_').replace(' ', '-'))


def close_layers(page):
    page.keyboard.press('Escape')
    wait_until(page, "!document.querySelector('.backdrop') && !document.querySelector('.menubar-panel')")


def open_dialog(page, opener, label, capture):
    opener()
    wait_until(page, "document.querySelector('.dialog')")
    inspect(page, label, capture)
    close_layers(page)


def tour(page, size, theme):
    prefix = f'{theme} · {size[0]}x{size[1]}'
    capture = True
    for view in VIEWS:
        page.click(f'.nav > .nav-item >> text="{view}"')
        wait_until(page, "!document.querySelector('.list .preview .none span')?.textContent?.includes('…')")
        inspect(page, f'{prefix} · {view}', capture)
    for menu in MENUS:
        page.click(f'.menubar-title >> text="{menu}"')
        wait_until(page, "document.querySelector('.menubar-panel')")
        inspect(page, f'{prefix} · menú {menu}', capture)
        close_layers(page)

    page.click('.nav > .nav-item >> text="Explorar"')
    page.click('.nav-item >> text="Documentos"')
    wait_until(page, "document.querySelectorAll('.list .tr:not(.th)').length > 0")
    page.click('.list .tr:not(.th) >> nth=0')
    wait_until(page, "document.querySelector('.detail .detail-name')")
    inspect(page, f'{prefix} · detalle', capture)
    page.check('.list .tr:not(.th) input[type="checkbox"] >> nth=0')
    page.check('.list .tr:not(.th) input[type="checkbox"] >> nth=1')
    wait_until(page, "document.querySelector('.selbar')")
    inspect(page, f'{prefix} · selección', capture)
    open_dialog(page, lambda: page.click('.selbar >> text="Eliminar el…"'), f'{prefix} · diálogo eliminar el', capture)
    open_dialog(page, lambda: page.click('.selbar >> text="Conservar"'), f'{prefix} · diálogo conservar', capture)
    open_dialog(page, lambda: page.click('.selbar >> text="Etiquetar…"'), f'{prefix} · diálogo etiquetar', capture)
    open_dialog(page, lambda: page.click('.selbar >> text="Eliminar"'), f'{prefix} · diálogo papelera', capture)
    open_dialog(page, lambda: page.click('.selbar >> text="Vista previa"'), f'{prefix} · vista previa', capture)
    page.click('.selbar >> text="Cancelar"')
    open_dialog(page, lambda: page.click('.list-actions >> text="Cambiar"'), f'{prefix} · marca de carpeta', capture)
    open_dialog(page, lambda: (page.click('.menubar-title >> text="Ayuda"'), page.click('.ctx >> text="Acerca de Purga"')), f'{prefix} · acerca de', capture)
    open_dialog(page, lambda: page.keyboard.press('F1'), f'{prefix} · guía', capture)
    page.click('.menubar-title >> text="Herramientas"')
    page.click('.ctx >> text="Reglas…"')
    wait_until(page, "document.querySelector('.cols-rules')")
    inspect(page, f'{prefix} · reglas', capture)
    page.fill('.toolbar .search', 'factura')
    page.keyboard.press('Enter')
    wait_until(page, "document.querySelector('.filters')")
    inspect(page, f'{prefix} · búsqueda', capture)


def main():
    home, data = prepare_fixture()
    with running_app(home) as page:
        seed_roots(page, data)
        for size in WINDOW_SIZES:
            resize(page, *size)
            for theme in THEMES:
                set_theme(page, theme)
                tour(page, size, theme)
    finish()


if __name__ == '__main__':
    main()
