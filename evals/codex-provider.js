// Custom Promptfoo provider for Codex CLI
// Handles long prompts by writing to temp file

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CodexProvider {
  constructor(options) {
    this.model = options.config?.model || 'gpt-5.2-codex';
    this.id = () => `codex:${this.model}`;
  }

  async callApi(prompt) {
    return new Promise((resolve) => {
      // Write prompt to temp file to avoid command line length limits
      const tmpFile = path.join(os.tmpdir(), `codex-prompt-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, prompt);

      const args = [
        'exec',
        '--json',
        '--model', this.model,
        '--full-auto',
        prompt
      ];

      console.error(`[CodexProvider] Running: codex ${args.slice(0, 5).join(' ')} "<prompt>"`);

      const proc = spawn('codex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        // Clean up temp file
        try { fs.unlinkSync(tmpFile); } catch (e) {}

        if (code !== 0 && !stdout) {
          resolve({
            error: `Codex exited with code ${code}: ${stderr}`
          });
          return;
        }

        // Parse Codex JSONL output
        try {
          const lines = stdout.trim().split('\n');
          const events = lines
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);

          // Extract MCP tool calls from item.completed events
          const toolCalls = events
            .filter(e => e.type === 'item.completed' && e.item?.type === 'mcp_tool_call')
            .map(e => ({
              name: e.item.tool,
              arguments: e.item.arguments || {},
              server: e.item.server,
              result: e.item.result
            }));

          // Extract agent messages
          const textEvents = events.filter(e =>
            e.type === 'item.completed' && e.item?.type === 'agent_message'
          );
          const text = textEvents
            .map(e => e.item.text || '')
            .join('\n');

          // Extract session_id for cleanup (find any successful log_workout)
          let sessionId = null;
          const logCalls = toolCalls.filter(tc => tc.name === 'log_workout');
          for (const logCall of logCalls) {
            if (logCall?.result?.content?.[0]?.text) {
              try {
                const logResult = JSON.parse(logCall.result.content[0].text);
                if (logResult.session_id && logResult.session_id > 0) {
                  sessionId = logResult.session_id;
                  break;
                }
              } catch (e) {}
            }
          }

          // Cleanup: delete the test workout if session was created
          const finishWithResult = () => {
            resolve({
              output: toolCalls,
              metadata: {
                tool_names: toolCalls.map(tc => tc.name),
                text,
                raw_events: events.length,
                cleaned_session_id: sessionId
              }
            });
          };

          if (sessionId) {
            this.cleanupWorkout(sessionId).then(() => {
              console.error(`[CodexProvider] Cleanup: deleted session ${sessionId}`);
              finishWithResult();
            }).catch(err => {
              console.error(`[CodexProvider] Cleanup failed: ${err.message}`);
              finishWithResult();
            });
          } else {
            finishWithResult();
          }
        } catch (parseError) {
          // Return raw output if parsing fails
          resolve({
            output: [],
            error: `Parse error: ${parseError.message}`
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          error: `Failed to spawn Codex: ${err.message}`
        });
      });
    });
  }

  // Cleanup workout after test - direct HTTP call to MCP
  async cleanupWorkout(sessionId) {
    const https = require('https');
    const http = require('http');

    const mcpUrl = process.env.GYM_TRACKER_MCP_URL || 'https://gym-tracker.1kairos.com/mcp';
    const url = new URL(mcpUrl);
    const client = url.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'edit_workout',
        arguments: { delete_workout: sessionId }
      }
    });

    return new Promise((resolve, reject) => {
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Cleanup HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Cleanup timeout'));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = CodexProvider;
