"""Arnés común de las pruebas de pantalla de Purga (P9), con el patrón de Nautilus: Playwright por CDP.

Lanza la app ya construida (`npm run build`) con un perfil propio (PURGA_HOME) y la carpeta de prueba de
`fixture.mjs`, espera por condición (nunca por tiempo fijo) y junta los resultados OK / FALLA.
"""
import os
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'capturas')
ELECTRON = os.path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
PACKAGED = os.path.join(ROOT, 'dist', 'win-unpacked', 'Purga.exe')
# con el argumento «pack» se prueba el empaquetado (npm run e2e:pack); sin él, Electron de desarrollo sobre la carpeta
APP_COMMAND = [PACKAGED] if 'pack' in sys.argv[1:] else [ELECTRON, '.']
# 9333 lo usa GitKraken en este equipo
CDP_PORT = 9444
CONNECT_TIMEOUT_S = 30
WAIT_TIMEOUT_S = 30
POLL_INTERVAL_S = 0.2

results = []


def check(label, condition, detail=''):
    results.append((label, bool(condition)))
    print(('OK    ' if condition else 'FALLA ') + label + (f'  [{detail}]' if detail and not condition else ''))


def wait_until(page, expression, timeout_s=WAIT_TIMEOUT_S):
    """Espera a que la expresión sea verdadera. La CSP de la app prohíbe eval: se sondea con evaluate."""
    deadline = time.time() + timeout_s
    while not page.evaluate(f'() => Boolean({expression})'):
        if time.time() > deadline:
            raise TimeoutError(f'No se cumplió: {expression}')
        time.sleep(POLL_INTERVAL_S)


def prepare_fixture():
    """Perfil vacío y carpeta de prueba nuevos en cada corrida."""
    base = tempfile.mkdtemp(prefix='purga-e2e-')
    data = os.path.join(base, 'datos')
    subprocess.run(['node', os.path.join(ROOT, 'tests', 'e2e', 'fixture.mjs'), data], check=True, cwd=ROOT)
    home = os.path.join(base, 'perfil')
    os.makedirs(home)
    return home, data


def isolation_args(home):
    """La carpeta de usuario de Electron también decide el bloqueo de instancia única: sin esto, con Purga abierta en
    el equipo, la app de prueba se cierra al arrancar y le pasa los argumentos a la instancia real."""
    return [f'--user-data-dir={os.path.join(home, "electron")}']


def app_env(home):
    env = {key: value for key, value in os.environ.items() if key != 'ELECTRON_RUN_AS_NODE'}
    env['PURGA_HOME'] = home
    return env


@contextmanager
def running_app(home, extra_args=()):
    print('ejecutable:', APP_COMMAND[0])
    process = subprocess.Popen([*APP_COMMAND, f'--remote-debugging-port={CDP_PORT}', *isolation_args(home), *extra_args], cwd=ROOT, env=app_env(home))
    try:
        with sync_playwright() as playwright:
            browser = connect(playwright)
            page = main_page(browser)
            page.app_pid = process.pid
            page.wait_for_selector('.app .nav-item.on', timeout=WAIT_TIMEOUT_S * 1000)
            yield page
            try:
                page.evaluate('() => window.purga.quit()')
            except Exception:
                pass  # la ventana se cierra a mitad de la llamada: es lo esperado
        process.wait(timeout=WAIT_TIMEOUT_S)
    finally:
        if process.poll() is None:
            process.kill()


def connect(playwright):
    deadline = time.time() + CONNECT_TIMEOUT_S
    while True:
        try:
            return playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{CDP_PORT}')
        except Exception:
            if time.time() > deadline:
                raise
            time.sleep(POLL_INTERVAL_S)


def main_page(browser):
    deadline = time.time() + CONNECT_TIMEOUT_S
    while time.time() < deadline:
        page = next((candidate for context in browser.contexts for candidate in context.pages if 'index.html' in candidate.url), None)
        if page:
            return page
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError('La ventana principal no apareció')


def seed_roots(page, data):
    """Agrega las carpetas de prueba por el contrato IPC (el selector de carpetas de Windows no se automatiza)."""
    for folder in ['Descargas', 'Documentos', 'Fotos']:
        page.evaluate("(path) => window.purga.invoke('roots:add', { path })", os.path.join(data, folder))
    # listo cuando el backend tiene las tres carpetas revisadas y ya no corre ninguna revisión (que deja las propuestas)
    page.evaluate("""() => new Promise((resolve) => {
      const poll = async () => {
        const roots = await window.purga.invoke('roots:list')
        const state = await window.purga.invoke('roots:scanState')
        const scanned = roots.ok && roots.data.length === 3 && roots.data.every((root) => root.files > 0)
        if (scanned && !state.data.running) resolve(true)
        else setTimeout(poll, 200)
      }
      poll()
    })""")


def window_visible(pid):
    """Si el proceso tiene una ventana principal visible, según Windows (una ventana oculta no cuenta)."""
    handle = subprocess.run(['powershell.exe', '-NoProfile', '-Command', f'(Get-Process -Id {pid}).MainWindowHandle'], capture_output=True, text=True)
    return handle.stdout.strip() not in ('', '0')


def wait_window(pid, visible, timeout_s=WAIT_TIMEOUT_S):
    deadline = time.time() + timeout_s
    while window_visible(pid) != visible:
        if time.time() > deadline:
            raise TimeoutError(f'La ventana no quedó {"visible" if visible else "oculta"}')
        time.sleep(POLL_INTERVAL_S)


def shot(page, name):
    os.makedirs(OUT, exist_ok=True)
    page.screenshot(path=os.path.join(OUT, f'{name}.png'))


def finish():
    failed = [label for label, ok in results if not ok]
    print(f'\n{len(results) - len(failed)} OK · {len(failed)} FALLA')
    sys.exit(1 if failed else 0)
