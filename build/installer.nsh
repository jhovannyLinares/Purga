; electron-builder incluye este archivo en el instalador NSIS (nsis.include por defecto: build/installer.nsh).
; Va en UTF-8 con BOM: lleva la pregunta con tildes.

; Detalle en vivo de la instalación, detrás de «Mostrar detalles». electron-builder fija «ShowInstDetails nevershow» y
; apaga el detalle en la primera línea de la sección (SetDetailsPrint none). El primer punto de entrada dentro de la
; sección es la comprobación de si la app está abierta (customCheckAppRunning): ahí se enciende y queda encendido, así
; que cada paso se anuncia al empezar y las líneas propias de NSIS («Extraer: app-64.7z… 100 %», «Crear acceso
; directo: …») salen en vivo. electron-builder 26.17.0, templates/nsis/installSection.nsh: revisar al actualizarlo.
!macro customHeader
  ShowInstDetails hide
!macroend

; Sin esto la página de avance salta sola a «Finalizar» al terminar y la lista no se alcanza a leer. Es el único
; punto de entrada antes de MUI_PAGE_INSTFILES; no agrega ninguna página.
!macro customPageAfterChangeDir
  !define MUI_FINISHPAGE_NOAUTOCLOSE
!macroend

; Definir customCheckAppRunning hace que electron-builder deje de incluir lo que su cierre de la app necesita: se
; incluye igual que en allowOnlyOneInstallerInstance.nsh, para seguir usando su mismo cierre sin copiarlo.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  SetDetailsPrint listonly
  DetailPrint "Comprobando si Purga está abierto para cerrarlo…"
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      DetailPrint "Quitando la versión anterior del programa en $INSTDIR…"
      DetailPrint "  Tus archivos y tus datos ($APPDATA\Purga) no se tocan."
    ${EndIf}
    DetailPrint "Extrayendo Purga ${VERSION}…"
  !endif
!macroend

!macro customFiles_x64
  DetailPrint "Archivos de Purga copiados en $INSTDIR"
  DetailPrint "Registrando Purga en Aplicaciones instaladas y creando los accesos directos…"
!macroend

!macro customInstall
  DetailPrint "Tus datos (índice, marcas, notas y configuración) siguen en $APPDATA\Purga"
  DetailPrint "Listo."
!macroend

; Al desinstalar (spec §5.6) se quitan el verbo del clic derecho y el inicio con Windows; el ícono de la bandeja se va
; con el proceso. El índice, las marcas y la configuración de %APPDATA%\Purga se conservan, salvo que el usuario pida
; borrarlos. En una actualización, el instalador nuevo corre el desinstalador viejo: ahí no se toca nada.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\*\shell\Purga.Programar"
    ; «Iniciar con Windows»: Electron escribe el valor con el AppUserModelId de la app
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.jhovanny.purga"
    ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Borrar también tus datos de Purga?$\n$\nSí: se borran el índice, las marcas, las notas y la configuración ($APPDATA\Purga).$\nNo: quedan, y una instalación nueva los vuelve a usar." /SD IDNO IDYES`
      RMDir /r "$APPDATA\Purga"
    ${EndIf}
  ${endIf}
!macroend
