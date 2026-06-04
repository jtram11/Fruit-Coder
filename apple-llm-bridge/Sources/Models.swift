// =============================================================================
// Sources/Models.swift — Request and Response Models
// =============================================================================
import Foundation

public struct GenerateRequest: Codable, Sendable {
    public let systemPrompt: String
    public let userPrompt: String
    public let maxTokens: Int?

    public init(systemPrompt: String, userPrompt: String, maxTokens: Int? = nil) {
        self.systemPrompt = systemPrompt
        self.userPrompt = userPrompt
        self.maxTokens = maxTokens
    }
}

public struct GenerateResponse: Codable, Sendable {
    public let content: String
    public let tokensUsed: Int?

    public init(content: String, tokensUsed: Int? = nil) {
        self.content = content
        self.tokensUsed = tokensUsed
    }
}

public struct StreamChunk: Codable, Sendable {
    public let content: String
    public let done: Bool

    public init(content: String, done: Bool) {
        self.content = content
        self.done = done
    }
}

public struct ErrorResponse: Codable, Sendable {
    public let error: String
    public let code: Int

    public init(error: String, code: Int) {
        self.error = error
        self.code = code
    }
}

public struct HealthResponse: Codable, Sendable {
    public let status: String
    public let modelAvailable: Bool

    public init(status: String, modelAvailable: Bool) {
        self.status = status
        self.modelAvailable = modelAvailable
    }
}
