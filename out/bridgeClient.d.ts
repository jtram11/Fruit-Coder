export declare class BridgeClient {
    private readonly port;
    private sessionKey;
    constructor(port?: number);
    /**
     * Reads the session HMAC secret key from ~/.apple-llm-bridge/session.key
     */
    loadSessionKey(): Promise<void>;
    /**
     * Validates if the local server is reachable and Apple Intelligence model is available.
     */
    isHealthy(): Promise<boolean>;
    /**
     * Sends a generation request and returns the full generated text.
     */
    generate(systemPrompt: string, userPrompt: string): Promise<string>;
    /**
     * Sends a generation request and streams the chunks through the onChunk callback.
     * Returns the complete accumulated response text.
     */
    stream(systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string>;
    private makeRequestWithRetry;
    private makeRequest;
}
