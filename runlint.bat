@echo off
npm run lint > output.txt 2>&1
type output.txt
