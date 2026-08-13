@echo off
REM Bat cau noi Telegram <-> Claude Code (task #115).
REM Duoc goi boi tac vu Windows luc dang nhap, va co the bam tay khi can.
REM
REM Ghi nhat ky ra file: tac vu chay an, khong co cua so nao de doc loi -
REM khong ghi ra day thi loi bien mat khong dau vet (dung loai that bai am
REM tham du an cam).

setlocal
set "PROJ=%~dp0.."
set "LOGDIR=%LOCALAPPDATA%\iFan"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\telegram-bridge.log"

REM Giu lai nhat ky cu mot doi (khong de phinh vo han)
if exist "%LOG%" move /Y "%LOG%" "%LOGDIR%\telegram-bridge.prev.log" >nul 2>&1

cd /d "%PROJ%"
echo [%date% %time%] khoi dong cau noi>>"%LOG%"
node "scripts\telegram-bridge.mjs" >>"%LOG%" 2>&1
echo [%date% %time%] cau noi da dung (ma thoat %errorlevel%)>>"%LOG%"
endlocal
