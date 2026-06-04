// =============================================================================
// Sources/main.swift — Server Entry Point and Lifecycle Management
// =============================================================================
import Foundation

print("==========================================================")
print(" Apple Intelligence Foundation Model Local Bridge Server v0.1.0")
print("==========================================================")

do {
    // 1. Initialize security configurations and write per-session token
    let secret = try SecurityManager.setupSessionSecret()
    print("[+] Cryptographically secure session token initialized and saved to file.")
    
    // 2. Instantiate LLM wrapper and rate limiting capabilities
    let llmService = LLMService()
    let rateLimiter = RateLimiter()
    
    // 3. Setup and configure loopback HTTP Server
    let serverPort: UInt16 = 19847
    let httpServer = HTTPServer(port: serverPort, sessionSecret: secret, llmService: llmService, rateLimiter: rateLimiter)
    
    try await httpServer.start()
    
    // 4. Set up signal handlers for clean exit and token cleanup
    // C signal handler must be literal closures without capturing state.
    signal(SIGINT) { signalValue in
        print("\n[+] Signal \(signalValue) received. Terminating bridge server...")
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let keyPath = homeDir.appendingPathComponent(".apple-llm-bridge/session.key")
        try? FileManager.default.removeItem(at: keyPath)
        print("[+] Session secret key file cleaned up.")
        exit(0)
    }
    
    signal(SIGTERM) { signalValue in
        print("\n[+] Signal \(signalValue) received. Terminating bridge server...")
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let keyPath = homeDir.appendingPathComponent(".apple-llm-bridge/session.key")
        try? FileManager.default.removeItem(at: keyPath)
        print("[+] Session secret key file cleaned up.")
        exit(0)
    }
    
    // 5. Keep executable active until terminated
    try await Task.sleep(nanoseconds: UInt64.max)
    
} catch {
    print("[-] Fatal error initializing bridge server: \(error)")
    let homeDir = FileManager.default.homeDirectoryForCurrentUser
    let keyPath = homeDir.appendingPathComponent(".apple-llm-bridge/session.key")
    try? FileManager.default.removeItem(at: keyPath)
    exit(1)
}
