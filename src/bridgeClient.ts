import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import { signRequest } from './security';

// Apple's on-device Foundation Model can take longer than a hosted API for
// complex prompts. 10 minutes gives ample headroom without hanging forever.
const REQUEST_TIMEOUT_MS = 600_000;

export class BridgeClient {
    private readonly port: number;
    private sessionKey: string = '';

    constructor(port: number = 19847) {
        this.port = port;
    }

    /**
     * Reads the session HMAC secret key from ~/.apple-llm-bridge/session.key
     */
    public async loadSessionKey(): Promise<void> {
        return new Promise((resolve, reject) => {
            const homeDir = os.homedir();
            const keyPath = path.join(homeDir, '.apple-llm-bridge', 'session.key');
            
            fs.readFile(keyPath, 'utf8', (err, data) => {
                if (err) {
                    reject(new Error(`Failed to load session key from ${keyPath}: ${err.message}`));
                    return;
                }
                this.sessionKey = data.trim();
                resolve();
            });
        });
    }

    /**
     * Validates if the local server is reachable and Apple Intelligence model is available.
     */
    public async isHealthy(): Promise<boolean> {
        try {
            const responseText = await this.makeRequest('GET', '/api/health', '');
            const parsed = JSON.parse(responseText);
            return parsed.status === 'healthy' && parsed.modelAvailable === true;
        } catch {
            return false;
        }
    }

    /**
     * Resets the Swift-side LanguageModelSession. Call when the user clears chat
     * so the next request starts with a clean conversation context.
     */
    public async resetSession(): Promise<void> {
        try {
            const payload = JSON.stringify({ reset: true });
            const signature = signRequest(payload, this.sessionKey);
            await this.makeRequest('POST', '/api/session/reset', payload);
        } catch {
            // Non-critical — if the bridge is down the session will
            // auto-reset when it reconnects.
        }
    }

    /**
     * Sends a generation request and returns the full generated text.
     */
    public async generate(systemPrompt: string, userPrompt: string): Promise<string> {
        const payload = JSON.stringify({ systemPrompt, userPrompt });
        const responseText = await this.makeRequestWithRetry('POST', '/api/generate', payload);
        const parsed = JSON.parse(responseText);
        return parsed.content;
    }

    /**
     * Sends a generation request and streams the chunks through the onChunk callback.
     * Returns the complete accumulated response text.
     */
    public async stream(
        systemPrompt: string, 
        userPrompt: string, 
        onChunk: (text: string) => void
    ): Promise<string> {
        const payload = JSON.stringify({ systemPrompt, userPrompt });
        const signature = signRequest(payload, this.sessionKey);
        
        return new Promise((resolve, reject) => {
            const options: http.RequestOptions = {
                hostname: '127.0.0.1',
                port: this.port,
                path: '/api/stream',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'X-Signature': signature
                },
                timeout: REQUEST_TIMEOUT_MS
            };

            const req = http.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let errData = '';
                    res.on('data', chunk => errData += chunk);
                    res.on('end', () => {
                        reject(new Error(`Stream request failed (${res.statusCode}): ${errData}`));
                    });
                    return;
                }

                let accumulatedText = '';
                let currentBuffer = '';

                res.on('data', (chunk: Buffer) => {
                    currentBuffer += chunk.toString();
                    
                    // Reject response if it exceeds 1MB to prevent memory exhaustion
                    if (accumulatedText.length + currentBuffer.length > 1048576) {
                        req.destroy(new Error('Response size limit (1MB) exceeded'));
                        return;
                    }

                    // Parse Server-Sent Events (SSE) stream format
                    const lines = currentBuffer.split('\n');
                    currentBuffer = lines.pop() || ''; // Keep incomplete last line in buffer

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const dataStr = trimmed.slice(6);
                            if (dataStr === '[DONE]') {
                                continue;
                            }
                            try {
                                const parsed = JSON.parse(dataStr);
                                if (parsed.content) {
                                    accumulatedText += parsed.content;
                                    onChunk(parsed.content);
                                }
                            } catch {
                                // Skip invalid JSON chunks gracefully
                            }
                        }
                    }
                });

                res.on('end', () => {
                    resolve(accumulatedText);
                });
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy(new Error('Request timeout after 10 minutes — the model may be overloaded'));
            });
            
            req.write(payload);
            req.end();
        });
    }

    private async makeRequestWithRetry(method: string, endpoint: string, body: string, retries = 3): Promise<string> {
        let attempt = 0;
        while (attempt < retries) {
            try {
                return await this.makeRequest(method, endpoint, body);
            } catch (err) {
                attempt++;
                if (attempt >= retries) {
                    throw err;
                }
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
        throw new Error('Request failed after max retries');
    }

    private makeRequest(method: string, endpoint: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const signature = body ? signRequest(body, this.sessionKey) : '';
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            
            if (signature) {
                headers['X-Signature'] = signature;
            }

            const options: http.RequestOptions = {
                hostname: '127.0.0.1',
                port: this.port,
                path: endpoint,
                method: method,
                headers: headers,
                timeout: REQUEST_TIMEOUT_MS
            };

            const req = http.request(options, (res) => {
                let resData = '';
                
                res.on('data', (chunk) => {
                    resData += chunk;
                    // Reject response if it exceeds 1MB
                    if (resData.length > 1048576) {
                        req.destroy(new Error('Response size limit (1MB) exceeded'));
                    }
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(resData);
                    } else {
                        reject(new Error(`Request failed with status ${res.statusCode}: ${resData}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy(new Error('Request timeout after 10 minutes — the model may be overloaded'));
            });

            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
}
