#!/usr/bin/env bash
# Two rules that keep the logger swappable:
#  1. the `debug` package is an implementation detail of ConsoleLogger only
#  2. src/logger and src/loggers never depend on the player (one-way dependency)
set -u
fail=0
offenders=$(grep -rln "from 'debug'" src --include=*.ts | grep -v '^src/loggers/consoleLogger.ts$')
if [ -n "$offenders" ]; then echo "debug package imported outside src/loggers/consoleLogger.ts:"; echo "$offenders"; fail=1; fi
#     src/logger (the contract) imports nothing from the player at all;
#     src/loggers (implementations) may import ISos from models/sosModels and nothing else from the player.
leaks=$(grep -rnE "from '(\.\./)+(components|models)/" src/logger src/loggers --include=*.ts | grep -vE "^src/loggers/.*from '(\.\./)+models/sosModels'")
if [ -n "$leaks" ]; then echo "logger modules must not import player code:"; echo "$leaks"; fail=1; fi
exit $fail
