// =============================================================================
// Sources/Security.swift — Security Utilities
// =============================================================================
import Foundation
import CryptoKit
import Security

public enum SecurityError: Error {
    case failedToGenerateRandomBytes
    case failedToCreateDirectory
    case failedToWriteSecret
}

public actor RateLimiter {
    private var requestLog: [String: [Date]] = [:]
    private let maxRequests = 10
    private let timeWindow: TimeInterval = 60.0

    public init() {}

    /// Checks if a client is allowed to make a request. Enforces 10 requests per 60 seconds.
    public func isAllowed(clientIP: String) -> Bool {
        let now = Date()
        var timestamps = requestLog[clientIP] ?? []
        
        // Remove timestamps older than the time window
        timestamps = timestamps.filter { now.timeIntervalSince($0) < timeWindow }
        
        if timestamps.count >= maxRequests {
            return false
        }
        
        timestamps.append(now)
        requestLog[clientIP] = timestamps
        return true
    }
}

public struct SecurityManager: Sendable {
    private static let keyDirectoryName = ".apple-llm-bridge"
    private static let keyFileName = "session.key"

    private static var keyDirectoryURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(keyDirectoryName, isDirectory: true)
    }

    private static var keyFileURL: URL {
        keyDirectoryURL.appendingPathComponent(keyFileName)
    }

    /// Generates a session secret and writes it to ~/.apple-llm-bridge/session.key with 0600 permissions.
    public static func setupSessionSecret() throws -> String {
        let fileManager = FileManager.default
        let dirURL = keyDirectoryURL

        // Create directory with 0700 permissions (rwx------)
        if !fileManager.fileExists(atPath: dirURL.path) {
            try fileManager.createDirectory(at: dirURL, withIntermediateDirectories: true, attributes: [
                .posixPermissions: 0o700
            ])
        }

        // Generate 32 cryptographically secure random bytes
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw SecurityError.failedToGenerateRandomBytes
        }

        let hexSecret = bytes.map { String(format: "%02hhx", $0) }.joined()

        // Write file with 0600 permissions (rw-------)
        let fileURL = keyFileURL
        if fileManager.fileExists(atPath: fileURL.path) {
            try fileManager.removeItem(at: fileURL)
        }

        try hexSecret.write(to: fileURL, atomically: true, encoding: .utf8)
        
        // Set strict 0600 permissions on the key file
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)

        return hexSecret
    }

    /// Cleans up the session key file upon application shutdown.
    public static func cleanupSessionSecret() {
        let fileURL = keyFileURL
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: fileURL.path) {
            try? fileManager.removeItem(at: fileURL)
        }
    }

    /// Computes the hex-encoded HMAC-SHA256 signature of a message using a hex-encoded secret.
    public static func computeHMAC(body: Data, hexSecret: String) -> String? {
        guard let secretData = hexSecret.data(using: .utf8) else { return nil }
        let hmacKey = SymmetricKey(data: secretData)
        let hmac = HMAC<SHA256>.authenticationCode(for: body, using: hmacKey)
        return hmac.map { String(format: "%02hhx", $0) }.joined()
    }

    /// Verifies the X-Signature header against the request body.
    public static func verifySignature(body: Data, signatureHeader: String?, hexSecret: String) -> Bool {
        guard let signatureHeader = signatureHeader else { return false }
        guard let computedSignature = computeHMAC(body: body, hexSecret: hexSecret) else { return false }
        
        // Constant-time comparison to prevent timing attacks
        return safeCompare(computedSignature, signatureHeader)
    }

    /// Safe comparison method to prevent timing attacks
    private static func safeCompare(_ a: String, _ b: String) -> Bool {
        guard a.count == b.count else { return false }
        var result: UInt8 = 0
        let aChars = Array(a.utf8)
        let bChars = Array(b.utf8)
        for i in 0..<aChars.count {
            result |= aChars[i] ^ bChars[i]
        }
        return result == 0
    }
}
