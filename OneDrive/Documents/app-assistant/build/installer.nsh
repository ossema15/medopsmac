!include "MUI2.nsh"

; Branding text at the bottom of the installer window
BrandingText "MedOps Installer"

; Branded images (requires BMP). NSIS expects ~150x57 for header and ~164x314 for welcome/finish.
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\\..\\assets\\computer-1149148.bmp"
!define MUI_WELCOMEPAGE_BITMAP "${BUILD_RESOURCES_DIR}\\..\\assets\\computer-1149148.bmp"
!define MUI_FINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\\..\\assets\\computer-1149148.bmp"

; Improve welcome page text
!define MUI_WELCOMEPAGE_TITLE "Welcome to MedOps Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of MedOps. Click Next to continue."
