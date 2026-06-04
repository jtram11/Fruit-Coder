// =============================================================================
// Sources/LLMService.swift — FoundationModels Wrapper Service
// =============================================================================
import Foundation
import FoundationModels

public enum LLMError: LocalizedError {
    case modelNotAvailable
    case generationFailed(String)
    
    public var errorDescription: String? {
        switch self {
        case .modelNotAvailable:
            return "Apple Intelligence Foundation Models are not available on this device. Ensure Apple Silicon, macOS 26+, and Apple Intelligence are enabled."
        case .generationFailed(let reason):
            return "Inference failed: \(reason)"
        }
    }
}

public actor LLMService {
    public init() {}

    /// Checks if the foundational language model is available.
    public func isModelAvailable() -> Bool {
        return SystemLanguageModel.default.isAvailable
    }

    /// Generates a full response for a prompt.
    public func generateResponse(systemPrompt: String, userPrompt: String) async throws -> String {
        guard isModelAvailable() else {
            throw LLMError.modelNotAvailable
        }

        let session = LanguageModelSession(
            instructions: systemPrompt
        )

        do {
            let response = try await session.respond(to: userPrompt)
            return response.content
        } catch {
            throw LLMError.generationFailed(error.localizedDescription)
        }
    }

    /// Streams response chunks as they are generated.
    public func streamResponse(systemPrompt: String, userPrompt: String) async throws -> AsyncThrowingStream<String, Error> {
        guard isModelAvailable() else {
            throw LLMError.modelNotAvailable
        }

        let session = LanguageModelSession(
            instructions: systemPrompt
        )

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let stream = session.streamResponse(to: userPrompt)
                    for try await partialResponse in stream {
                        continuation.yield(partialResponse.content)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: LLMError.generationFailed(error.localizedDescription))
                }
            }
            
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }
}
