!macro NSIS_HOOK_POSTINSTALL
  ; Override DefaultIcon to use custom md-file icon instead of EXE icon
  WriteRegStr SHCTX "Software\Classes\Markdown\DefaultIcon" "" "$INSTDIR\icons\md-file.ico"
!macroend
