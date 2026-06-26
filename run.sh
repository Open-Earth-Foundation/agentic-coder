#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env file
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# Activate virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

TASKS_FILE="${TASKS_FILE:-tasks/getting-started.md}"

usage() {
    echo ""
    echo "  Agent Factory — autonomous coding agent"
    echo ""
    echo "  Usage: ./run.sh <command> [options]"
    echo ""
    echo "  Markdown tasks:"
    echo "    all                  Run all tasks from the tasks file"
    echo "    task <N>             Run task N (1-indexed)"
    echo "    dry                  Dry run all tasks (no changes)"
    echo "    dry-task <N>         Dry run task N only"
    echo "    list                 List tasks in the file"
    echo ""
    echo "  External sources:"
    echo "    jira                 Fetch and run tasks from Jira (needs JIRA_* in .env)"
    echo "    notion               Fetch and run tasks from Notion (needs NOTION_* in .env)"
    echo "    linear               Fetch and run tasks from Linear (needs LINEAR_* in .env)"
    echo ""
    echo "  Autonomous:"
    echo "    scan                 Scan repo for improvements and fix them"
    echo "    watch <source>       Poll for tasks continuously (jira|notion|linear)"
    echo ""
    echo "  AI Agents (Linear):"
    echo "    estimate             AI Estimation Engine — scores unestimated issues"
    echo "    decompose <epic>     AI Epic Decomposer — propose tickets from an epic"
    echo "    quality <issue>      AI Ticket Quality — refine a ticket with AC + tech notes"
    echo "    calibrate <issue>    AI Calibration — compare AI vs Dev estimates"
    echo ""
    echo "  Utilities:"
    echo "    logs                 List recent session logs"
    echo ""
    echo "  Options:"
    echo "    TASKS_FILE=file.md   Use a different tasks file (default: tasks-example.md)"
    echo ""
    echo "  Examples:"
    echo "    ./run.sh all"
    echo "    ./run.sh task 1"
    echo "    ./run.sh dry"
    echo "    TASKS_FILE=demo-tasks.md ./run.sh task 2"
    echo "    ./run.sh jira"
    echo "    ./run.sh notion"
    echo "    ./run.sh scan"
    echo "    ./run.sh watch jira"
    echo ""
}

case "${1:-help}" in
    all)
        python -m agent_factory markdown "$TASKS_FILE"
        ;;
    task)
        if [ -z "${2:-}" ]; then
            echo "Error: specify a task number, e.g. ./run.sh task 1"
            exit 1
        fi
        python -m agent_factory markdown "$TASKS_FILE" --task "$2"
        ;;
    dry)
        python -m agent_factory markdown "$TASKS_FILE" --dry-run
        ;;
    dry-task)
        if [ -z "${2:-}" ]; then
            echo "Error: specify a task number, e.g. ./run.sh dry-task 1"
            exit 1
        fi
        python -m agent_factory markdown "$TASKS_FILE" --task "$2" --dry-run
        ;;
    list)
        python3 -c "
from agent_factory.task_parser import load_tasks
tasks = load_tasks('$TASKS_FILE')
print(f'\n  {len(tasks)} tasks in $TASKS_FILE:\n')
for i, t in enumerate(tasks, 1):
    print(f'  {i}. [{t.task_type}] {t.title}')
    if t.files:
        print(f'     files: {chr(44).join(chr(32) + f for f in t.files)}')
    print()
"
        ;;
    jira)
        python -m agent_factory jira
        ;;
    notion)
        python -m agent_factory notion
        ;;
    linear)
        python -m agent_factory linear
        ;;
    estimate)
        python -m agent_factory.estimator "${@:2}"
        ;;
    decompose)
        if [ -z "${2:-}" ]; then
            echo "Error: specify an epic identifier, e.g. ./run.sh decompose CC-336"
            echo "Or use --watch to poll for epics: ./run.sh decompose --watch"
            exit 1
        fi
        if [ "${2}" = "--watch" ]; then
            python -m agent_factory.epic_decomposer --watch
        else
            python -m agent_factory.epic_decomposer --epic "$2"
        fi
        ;;
    quality)
        if [ -z "${2:-}" ]; then
            echo "Error: specify an issue identifier or --watch"
            exit 1
        fi
        if [ "${2}" = "--watch" ]; then
            python -m agent_factory.ticket_quality --watch
        else
            python -m agent_factory.ticket_quality --issue "$2"
        fi
        ;;
    calibrate)
        if [ -z "${2:-}" ]; then
            echo "Error: specify an issue identifier or --watch"
            exit 1
        fi
        if [ "${2}" = "--watch" ]; then
            python -m agent_factory.calibrator --watch
        else
            python -m agent_factory.calibrator --issue "$2"
        fi
        ;;
    scan)
        python -m agent_factory scan
        ;;
    watch)
        if [ -z "${2:-}" ]; then
            echo "Error: specify source, e.g. ./run.sh watch jira"
            exit 1
        fi
        python -m agent_factory watch "$2"
        ;;
    logs)
        if [ -d "logs" ]; then
            ls -lt logs/*.md 2>/dev/null | head -20
        else
            echo "No logs yet."
        fi
        ;;
    help|--help|-h|*)
        usage
        ;;
esac
