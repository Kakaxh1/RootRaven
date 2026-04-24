@echo off
echo Starting Objection for com.reliance.businesseasy2...
echo.
echo Commands available:
echo - android sslpinning disable  (or ios sslpinning disable)
echo - android keychain dump
echo - android sharedpreferences get  (or ios nsuserdefaults get)
echo - android cookies get
echo - file download /data/data/com.reliance.businesseasy2/*.db
echo - memory search ""
echo - env
echo.
objection -g "com.reliance.businesseasy2" explore
pause
