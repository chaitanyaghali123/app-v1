@echo off
setlocal enabledelayedexpansion
set "ARGS="

:next_arg
if "%~1"=="" goto run
if "%~1"=="-Wl,--disable-auto-image-base" (
  shift
  goto next_arg
)
set ARGS=!ARGS! "%~1"
shift
goto next_arg

:run
"%~dp0..\third_party\zig\zig-windows-x86_64-0.13.0\zig.exe" cc -target x86_64-windows-gnu !ARGS!
