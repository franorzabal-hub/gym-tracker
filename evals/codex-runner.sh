#!/bin/bash
# Wrapper script for running Codex CLI with Promptfoo
# Receives prompt via stdin, passes to Codex

# Read the prompt from stdin
PROMPT=$(cat)

# Run Codex with the prompt
# Note: Codex exec takes the prompt as the last positional argument
exec codex exec --json --model gpt-5.2-codex --full-auto "$PROMPT"
