@echo off
cd /d D:\app-v1
set EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.29.61
npx expo start --clear > D:\app-v1\expo.log 2>&1
