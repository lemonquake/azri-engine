@echo off
echo Joining Azri Engine Host...
echo Connecting to azri_host_1
npm run dev -- -- --join=azri_host_1 --map=level_123456
pause
