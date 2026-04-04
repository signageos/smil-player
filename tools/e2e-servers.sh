#!/usr/bin/env bash
#
# Start/stop emulator and test server for e2e testing.
# Usage:
#   bash tools/e2e-servers.sh          # start & wait for both servers
#   bash tools/e2e-servers.sh --stop   # kill both servers
#   bash tools/e2e-servers.sh --status # check if servers are running
#
set -euo pipefail

EMULATOR_URL="http://localhost:8090"
TEST_SERVER_URL="http://localhost:3000/zonesCypress.smil"
EMULATOR_LOG="/tmp/smil-emulator.log"
TEST_SERVER_LOG="/tmp/smil-test-server.log"
EMULATOR_PID_FILE="/tmp/smil-emulator.pid"
TEST_SERVER_PID_FILE="/tmp/smil-test-server.pid"

EMULATOR_TIMEOUT=120   # seconds — webpack compile can be slow
TEST_SERVER_TIMEOUT=10 # seconds

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

is_running() {
    curl -sf -o /dev/null --max-time 3 "$1" 2>/dev/null
}

stop_servers() {
    local stopped=0
    if [[ -f "$EMULATOR_PID_FILE" ]]; then
        local pid
        pid=$(cat "$EMULATOR_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            echo "[STOP] Emulator (PID $pid) stopped"
            stopped=1
        fi
        rm -f "$EMULATOR_PID_FILE"
    fi
    # Also kill by port in case PID file is stale
    local port_pid
    port_pid=$(lsof -ti :8090 2>/dev/null || true)
    if [[ -n "$port_pid" ]]; then
        kill $port_pid 2>/dev/null || true
        echo "[STOP] Killed process(es) on port 8090"
        stopped=1
    fi

    if [[ -f "$TEST_SERVER_PID_FILE" ]]; then
        local pid
        pid=$(cat "$TEST_SERVER_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            echo "[STOP] Test server (PID $pid) stopped"
            stopped=1
        fi
        rm -f "$TEST_SERVER_PID_FILE"
    fi
    port_pid=$(lsof -ti :3000 2>/dev/null || true)
    if [[ -n "$port_pid" ]]; then
        kill $port_pid 2>/dev/null || true
        echo "[STOP] Killed process(es) on port 3000"
        stopped=1
    fi

    if [[ $stopped -eq 0 ]]; then
        echo "[INFO] No servers were running"
    fi
}

check_status() {
    local all_ok=0
    if is_running "$EMULATOR_URL"; then
        echo "[OK] Emulator running on :8090"
    else
        echo "[--] Emulator NOT running on :8090"
        all_ok=1
    fi
    if is_running "$TEST_SERVER_URL"; then
        echo "[OK] Test server running on :3000"
    else
        echo "[--] Test server NOT running on :3000"
        all_ok=1
    fi
    return $all_ok
}

wait_for_server() {
    local url="$1"
    local timeout="$2"
    local name="$3"
    local elapsed=0

    while ! is_running "$url"; do
        if [[ $elapsed -ge $timeout ]]; then
            echo "[FAIL] $name did not start within ${timeout}s"
            return 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        # Show progress every 10 seconds
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            echo "[WAIT] $name ... ${elapsed}s / ${timeout}s"
        fi
    done
    echo "[OK] $name running ($elapsed seconds)"
}

start_servers() {
    cd "$PROJECT_DIR"

    # --- Emulator ---
    if is_running "$EMULATOR_URL"; then
        echo "[OK] Emulator already running on :8090"
    else
        echo "[START] Starting emulator (logs: $EMULATOR_LOG) ..."
        nohup npm run start-emulator > "$EMULATOR_LOG" 2>&1 &
        echo $! > "$EMULATOR_PID_FILE"
    fi

    # --- Test server ---
    if is_running "$TEST_SERVER_URL"; then
        echo "[OK] Test server already running on :3000"
    else
        echo "[START] Starting test server (logs: $TEST_SERVER_LOG) ..."
        nohup node test-server/localServer.js > "$TEST_SERVER_LOG" 2>&1 &
        echo $! > "$TEST_SERVER_PID_FILE"
    fi

    # --- Wait for both ---
    wait_for_server "$TEST_SERVER_URL" "$TEST_SERVER_TIMEOUT" "Test server (:3000)" || exit 1
    wait_for_server "$EMULATOR_URL" "$EMULATOR_TIMEOUT" "Emulator (:8090)" || exit 1

    echo ""
    echo "Both servers ready. You can now run e2e tests."
}

stop_emulator() {
    if [[ -f "$EMULATOR_PID_FILE" ]]; then
        local pid
        pid=$(cat "$EMULATOR_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
        rm -f "$EMULATOR_PID_FILE"
    fi
    # Kill only the LISTENING process on port 8090 (not browser clients)
    local listen_pid
    listen_pid=$(lsof -ti :8090 -sTCP:LISTEN 2>/dev/null || true)
    if [[ -n "$listen_pid" ]]; then
        kill $listen_pid 2>/dev/null || true
    fi
}

start_emulator() {
    cd "$PROJECT_DIR"
    if is_running "$EMULATOR_URL"; then
        return 0
    fi
    nohup npm run start-emulator > "$EMULATOR_LOG" 2>&1 &
    echo $! > "$EMULATOR_PID_FILE"
    wait_for_server "$EMULATOR_URL" "$EMULATOR_TIMEOUT" "Emulator (:8090)" || exit 1
}

# --- Main ---
case "${1:-}" in
    --stop)
        stop_servers
        ;;
    --stop-emulator)
        stop_emulator
        ;;
    --start-emulator)
        start_emulator
        ;;
    --status)
        check_status
        ;;
    *)
        start_servers
        ;;
esac
