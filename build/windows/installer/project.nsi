Unicode true

!ifndef INFO_COMPANYNAME
  !define INFO_COMPANYNAME "ResultV"
!endif
!ifndef INFO_PRODUCTNAME
  !define INFO_PRODUCTNAME "ResultV"
!endif
!ifndef UNINST_KEY_NAME
  !define UNINST_KEY_NAME "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
!endif
!define LEGACY_UNINST_KEY_NAME "ResultProxyResultProxy"
!define LEGACY_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_UNINST_KEY_NAME}"

!define MULTIUSER_EXECUTIONLEVEL Highest
!define MULTIUSER_MUI
!define MULTIUSER_INSTALLMODE_COMMANDLINE
!define MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER
!define MULTIUSER_USE_PROGRAMFILES64
!define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
!define MULTIUSER_INSTALLMODE_INSTDIR "${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
!define MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINST_KEY_NAME}"
!define MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME "InstallLocation"
!define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINST_KEY_NAME}"
!define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "InstallLocation"

!include "MultiUser.nsh"

!define REQUEST_EXECUTION_LEVEL highest
!include "wails_tools.nsh"
!include "wails_multiuser_macros.nsh"

VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

ManifestDPIAware true

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_FINISHPAGE_RUN_TEXT "Run ${INFO_PRODUCTNAME} after closing the installer"

!define MUI_LANGDLL_ALLLANGUAGES

!insertmacro MUI_PAGE_WELCOME

!insertmacro MULTIUSER_PAGE_INSTALLMODE

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "English"

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe"
InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
ShowInstDetails show

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
  !insertmacro MULTIUSER_INIT
  !insertmacro wails.checkArchitecture
  Call CheckLegacyResultProxyInstall
  Call CheckWebView2Present
FunctionEnd

Function un.onInit
  !insertmacro MULTIUSER_UNINIT
FunctionEnd

Function CheckWebView2Present
  IfSilent silent done
  silent:
    Return
  done:
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    Return
  ${EndIf}
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    Return
  ${EndIf}
  MessageBox MB_OK|MB_ICONINFORMATION "WebView2 Runtime was not detected. It will be installed during setup."
FunctionEnd

Function CheckLegacyResultProxyInstall
  SetRegView 64
  ReadRegStr $0 HKLM "${LEGACY_UNINST_KEY}" "QuietUninstallString"
  ReadRegStr $1 HKLM "${LEGACY_UNINST_KEY}" "UninstallString"
  ReadRegStr $2 HKLM "${LEGACY_UNINST_KEY}" "DisplayName"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "${LEGACY_UNINST_KEY}" "QuietUninstallString"
  ${EndIf}
  ${If} $1 == ""
    ReadRegStr $1 HKCU "${LEGACY_UNINST_KEY}" "UninstallString"
  ${EndIf}
  ${If} $2 == ""
    ReadRegStr $2 HKCU "${LEGACY_UNINST_KEY}" "DisplayName"
  ${EndIf}
  ${If} $0 == ""
  ${AndIf} $1 == ""
    Return
  ${EndIf}
  ${If} $2 == ""
    StrCpy $2 "ResultProxy"
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONQUESTION "$2 is already installed. Remove old version before installing ${INFO_PRODUCTNAME}?" IDNO legacy_skip
  Call PreserveLegacyUserData
  ${If} $0 != ""
    ExecWait '$0'
  ${Else}
    ExecWait '$1 /S'
  ${EndIf}
  SetShellVarContext all
  Delete "$SMPROGRAMS\ResultProxy.lnk"
  Delete "$DESKTOP\ResultProxy.lnk"
  SetShellVarContext current
  Delete "$SMPROGRAMS\ResultProxy.lnk"
  Delete "$DESKTOP\ResultProxy.lnk"
legacy_skip:
FunctionEnd

Function PreserveLegacyUserData
  CreateDirectory "$APPDATA\ResultV"
  IfFileExists "$APPDATA\ResultProxy\proxy_config.json" check_config keep_config
  check_config:
    StrCpy $3 ""
    StrCpy $4 ""
    IfFileExists "$APPDATA\ResultV\proxy_config.json" 0 copy_config
    ${GetSize} "$APPDATA\ResultV\proxy_config.json" "/S=0K" $3 $0 $1
    ${GetSize} "$APPDATA\ResultProxy\proxy_config.json" "/S=0K" $4 $0 $1
    IntCmp $3 1 copy_config 0 size_compare
  size_compare:
    IntCmp $4 $3 copy_config keep_config keep_config
  copy_config:
    CopyFiles /SILENT "$APPDATA\ResultProxy\proxy_config.json" "$APPDATA\ResultV\proxy_config.json"
  keep_config:
  IfFileExists "$APPDATA\ResultV\.machine-fallback-id" keep_fallback copy_fallback
  copy_fallback:
    IfFileExists "$APPDATA\ResultProxy\.machine-fallback-id" 0 keep_fallback
    CopyFiles /SILENT "$APPDATA\ResultProxy\.machine-fallback-id" "$APPDATA\ResultV\.machine-fallback-id"
  keep_fallback:
  IfFileExists "$APPDATA\ResultV\blocked_cache.json" keep_blocked copy_blocked
  copy_blocked:
    IfFileExists "$APPDATA\ResultProxy\blocked_cache.json" 0 keep_blocked
    CopyFiles /SILENT "$APPDATA\ResultProxy\blocked_cache.json" "$APPDATA\ResultV\blocked_cache.json"
  keep_blocked:
  IfFileExists "$APPDATA\ResultV\sing-box-cache.db" keep_cache copy_cache
  copy_cache:
    IfFileExists "$APPDATA\ResultProxy\sing-box-cache.db" 0 keep_cache
    CopyFiles /SILENT "$APPDATA\ResultProxy\sing-box-cache.db" "$APPDATA\ResultV\sing-box-cache.db"
  keep_cache:
  CreateDirectory "$LOCALAPPDATA\ResultV"
  IfFileExists "$LOCALAPPDATA\ResultV\webview\*.*" done copy_webview
  copy_webview:
    IfFileExists "$LOCALAPPDATA\ResultProxy\webview\*.*" 0 done
    CreateDirectory "$LOCALAPPDATA\ResultV\webview"
    CopyFiles /SILENT "$LOCALAPPDATA\ResultProxy\webview\*.*" "$LOCALAPPDATA\ResultV\webview"
  done:
FunctionEnd

Section
  !insertmacro rp.setShellContext

  !insertmacro rp.webview2runtime

  SetOutPath $INSTDIR

  !insertmacro wails.files

  CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
  CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
  Delete "$SMPROGRAMS\ResultProxy.lnk"
  Delete "$DESKTOP\ResultProxy.lnk"

  !insertmacro wails.associateFiles
  !insertmacro wails.associateCustomProtocols

  !insertmacro rp.writeUninstaller
  SetRegView 64
  ${If} $MultiUser.InstallMode == "AllUsers"
    WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  ${Else}
    WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  ${EndIf}
SectionEnd

Section "uninstall"
  !insertmacro rp.setShellContext

  RMDir /r $INSTDIR

  Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

  !insertmacro wails.unassociateFiles
  !insertmacro wails.unassociateCustomProtocols

  !insertmacro rp.deleteUninstaller
SectionEnd
