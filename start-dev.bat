@echo off
REM Pornește backend-ul ElectricalVPF + stripe listen (webhook forwarding),
REM fiecare în fereastra lui proprie de terminal, ca să vezi logurile clar
REM pentru fiecare. Ruleaza acest fisier direct (dublu-click sau din orice
REM terminal) - foloseste %~dp0 ca sa gaseasca folderul backend indiferent
REM de directorul curent.
REM
REM stripe listen NU e persistent intre sesiuni de testare - se opreste
REM cand inchizi fereastra/terminalul in care a rulat. Fara el, webhook-urile
REM reale de la Stripe (plati, reinnoiri) nu ajung deloc la backend-ul local,
REM iar DB-ul nu se actualizeaza dupa o plata reusita.

start "ElectricalVPF Backend" cmd /k "cd /d %~dp0backend && npm start"
start "Stripe Listen (webhook forwarding)" cmd /k "stripe listen --forward-to localhost:3000/api/stripe/webhook"

echo.
echo Backend si stripe listen pornite, fiecare in fereastra proprie.
echo Inchide ferestrele individual cand termini sesiunea de lucru.
echo.
