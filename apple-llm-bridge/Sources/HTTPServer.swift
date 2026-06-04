// =============================================================================
// Sources/HTTPServer.swift — Lightweight Loopback-only HTTP Server using NWListener
// =============================================================================
import Foundation
import Network

public enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case unknown
}

public struct HTTPRequest {
    public let method: HTTPMethod
    public let path: String
    public let headers: [String: String]
    public let body: Data
}

private final class RequestContext: @unchecked Sendable {
    var collectedData = Data()
}

public actor HTTPServer {
    private let port: UInt16
    private let sessionSecret: String
    private let llmService: LLMService
    private let rateLimiter: RateLimiter
    private var listener: NWListener?
    private let maxBodySize = 65536 // 64 KB limit

    public init(port: UInt16, sessionSecret: String, llmService: LLMService, rateLimiter: RateLimiter) {
        self.port = port
        self.sessionSecret = sessionSecret
        self.llmService = llmService
        self.rateLimiter = rateLimiter
    }

    /// Starts the loopback-only TCP HTTP server.
    public func start() throws {
        let parameters = NWParameters.tcp
        
        // CRITICAL SECURITY REQUIREMENT: Bind ONLY to loopback 127.0.0.1, never 0.0.0.0
        guard let localAddress = IPv4Address("127.0.0.1") else {
            fatalError("Could not resolve loopback address")
        }
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(localAddress), port: NWEndpoint.Port(rawValue: port)!)
        
        let listener = try NWListener(using: parameters)
        self.listener = listener

        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print(" Bridge server listening on 127.0.0.1:\(self.port)")
            case .failed(let error):
                print("[-] Server listener failed: \(error)")
            case .cancelled:
                print("[-] Server listener cancelled")
            default:
                break
            }
        }

        listener.newConnectionHandler = { [weak self] connection in
            guard let self = self else { return }
            Task {
                await self.handleConnection(connection)
            }
        }

        listener.start(queue: .global(qos: .userInteractive))
    }

    /// Stops the server.
    public func stop() {
        listener?.cancel()
        listener = nil
        print("[+] HTTP server stopped")
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .userInteractive))
        
        // Extract client IP for rate limiting - let constant to allow closure capture
        let clientIP = "127.0.0.1"

        readRequest(connection: connection) { [weak self] requestData in
            guard let self = self else { return }
            guard let requestData = requestData else {
                self.sendErrorResponse(connection: connection, error: "Empty or invalid request", status: 400)
                return
            }

            Task {
                guard await self.rateLimiter.isAllowed(clientIP: clientIP) else {
                    self.sendErrorResponse(connection: connection, error: "Too Many Requests", status: 429)
                    return
                }

                guard let request = self.parseRequest(requestData) else {
                    self.sendErrorResponse(connection: connection, error: "Invalid HTTP Format", status: 400)
                    return
                }

                await self.routeRequest(connection: connection, request: request)
            }
        }
    }

    private func readRequest(connection: NWConnection, completion: @escaping @Sendable (Data?) -> Void) {
        let context = RequestContext()
        
        @Sendable func readNext() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak context] data, _, isComplete, error in
                guard let context = context else { return }
                
                if let error = error {
                    print("[-] Connection receive error: \(error)")
                    completion(nil)
                    return
                }

                if let data = data {
                    context.collectedData.append(data)
                    
                    // Enforce request size limit to prevent Denial of Service
                    if context.collectedData.count > 65536 {
                        completion(nil)
                        return
                    }
                }

                if isComplete {
                    completion(context.collectedData)
                    return
                }

                if let requestString = String(data: context.collectedData, encoding: .utf8),
                   let headerEndRange = requestString.range(of: "\r\n\r\n") {
                    let headersPart = requestString[..<headerEndRange.lowerBound]
                    let bodyStartIndex = requestString.distance(from: requestString.startIndex, to: headerEndRange.upperBound)
                    let bodyBytesRead = context.collectedData.count - bodyStartIndex
                    
                    if let contentLengthHeader = headersPart.components(separatedBy: "\r\n")
                        .first(where: { $0.lowercased().hasPrefix("content-length:") }),
                       let lengthVal = contentLengthHeader.components(separatedBy: ":").last?.trimmingCharacters(in: .whitespaces),
                       let contentLength = Int(lengthVal) {
                        
                        if bodyBytesRead >= contentLength {
                            completion(context.collectedData)
                            return
                        }
                    } else if requestString.uppercased().hasPrefix("GET") {
                        completion(context.collectedData)
                        return
                    }
                }

                readNext()
            }
        }
        
        readNext()
    }

    nonisolated private func parseRequest(_ data: Data) -> HTTPRequest? {
        guard let requestString = String(data: data, encoding: .utf8) else { return nil }
        let parts = requestString.components(separatedBy: "\r\n\r\n")
        guard !parts.isEmpty else { return nil }

        let headerLines = parts[0].components(separatedBy: "\r\n")
        guard !headerLines.isEmpty else { return nil }

        let requestLine = headerLines[0].components(separatedBy: " ")
        guard requestLine.count >= 2 else { return nil }

        let method = HTTPMethod(rawValue: requestLine[0]) ?? .unknown
        let path = requestLine[1]

        var headers: [String: String] = [:]
        for i in 1..<headerLines.count {
            let line = headerLines[i]
            if let colonIdx = line.firstIndex(of: ":") {
                let key = String(line[..<colonIdx]).trimmingCharacters(in: .whitespaces).lowercased()
                let val = String(line[line.index(after: colonIdx)...]).trimmingCharacters(in: .whitespaces)
                headers[key] = val
            }
        }

        // Get actual header byte length to avoid UTF-8 character length mismatch
        guard let headerData = parts[0].data(using: .utf8) else { return nil }
        let headerStringLength = headerData.count + 4 // +4 for \r\n\r\n

        let bodyData: Data
        if let contentLengthStr = headers["content-length"], let contentLength = Int(contentLengthStr) {
            let endOffset = min(data.count, headerStringLength + contentLength)
            bodyData = data.subdata(in: headerStringLength..<endOffset)
        } else {
            if data.count > headerStringLength {
                bodyData = data.subdata(in: headerStringLength..<data.count)
            } else {
                bodyData = Data()
            }
        }

        return HTTPRequest(method: method, path: path, headers: headers, body: bodyData)
    }

    private func routeRequest(connection: NWConnection, request: HTTPRequest) async {
        print("[HTTP] \(request.method.rawValue) \(request.path)")

        switch (request.method, request.path) {
        case (.get, "/api/health"):
            let modelAvailable = await llmService.isModelAvailable()
            let response = HealthResponse(status: "healthy", modelAvailable: modelAvailable)
            sendJSONResponse(connection: connection, model: response, status: 200)

        case (.post, "/api/generate"):
            guard SecurityManager.verifySignature(body: request.body, signatureHeader: request.headers["x-signature"], hexSecret: sessionSecret) else {
                sendErrorResponse(connection: connection, error: "Unauthorized: Invalid Signature", status: 401)
                return
            }

            do {
                let decoder = JSONDecoder()
                let generateReq = try decoder.decode(GenerateRequest.self, from: request.body)
                let textResult = try await llmService.generateResponse(systemPrompt: generateReq.systemPrompt, userPrompt: generateReq.userPrompt)
                let response = GenerateResponse(content: textResult)
                sendJSONResponse(connection: connection, model: response, status: 200)
            } catch {
                sendErrorResponse(connection: connection, error: error.localizedDescription, status: 500)
            }

        case (.post, "/api/stream"):
            guard SecurityManager.verifySignature(body: request.body, signatureHeader: request.headers["x-signature"], hexSecret: sessionSecret) else {
                sendErrorResponse(connection: connection, error: "Unauthorized: Invalid Signature", status: 401)
                return
            }

            do {
                let decoder = JSONDecoder()
                let generateReq = try decoder.decode(GenerateRequest.self, from: request.body)
                let stream = try await llmService.streamResponse(systemPrompt: generateReq.systemPrompt, userPrompt: generateReq.userPrompt)
                
                let sseHeaders = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n"
                connection.send(content: sseHeaders.data(using: .utf8), completion: .contentProcessed({ error in
                    if let error = error {
                        print("[-] Failed to send SSE headers: \(error)")
                        connection.cancel()
                    }
                }))

                var responseContent = ""
                for try await chunk in stream {
                    responseContent += chunk
                    
                    if responseContent.count > 1048576 {
                        let errorChunk = StreamChunk(content: "\n[Error: Response size limit exceeded]", done: true)
                        if let errorData = try? JSONEncoder().encode(errorChunk), let jsonStr = String(data: errorData, encoding: .utf8) {
                            let sseData = "data: \(jsonStr)\n\n"
                            connection.send(content: sseData.data(using: .utf8), isComplete: true, completion: .contentProcessed({ _ in }))
                        }
                        return
                    }

                    let streamChunk = StreamChunk(content: chunk, done: false)
                    if let jsonData = try? JSONEncoder().encode(streamChunk), let jsonStr = String(data: jsonData, encoding: .utf8) {
                        let sseData = "data: \(jsonStr)\n\n"
                        connection.send(content: sseData.data(using: .utf8), completion: .contentProcessed({ _ in }))
                    }
                }

                let doneChunk = StreamChunk(content: "", done: true)
                if let jsonData = try? JSONEncoder().encode(doneChunk), let jsonStr = String(data: jsonData, encoding: .utf8) {
                    let finalSSE = "data: \(jsonStr)\n\ndata: [DONE]\n\n"
                    connection.send(content: finalSSE.data(using: .utf8), isComplete: true, completion: .contentProcessed({ _ in }))
                }

            } catch {
                let errorChunk = StreamChunk(content: "\n[Error: \(error.localizedDescription)]", done: true)
                if let errorData = try? JSONEncoder().encode(errorChunk), let jsonStr = String(data: errorData, encoding: .utf8) {
                    let sseData = "data: \(jsonStr)\n\n"
                    connection.send(content: sseData.data(using: .utf8), isComplete: true, completion: .contentProcessed({ _ in }))
                }
            }

        default:
            sendErrorResponse(connection: connection, error: "Not Found", status: 404)
        }
    }

    nonisolated private func sendJSONResponse<T: Codable>(connection: NWConnection, model: T, status: Int) {
        do {
            let data = try JSONEncoder().encode(model)
            let responseHeaders = "HTTP/1.1 \(status) OK\r\nContent-Type: application/json\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n"
            var packet = responseHeaders.data(using: .utf8)!
            packet.append(data)
            connection.send(content: packet, isComplete: true, completion: .contentProcessed({ _ in }))
        } catch {
            sendErrorResponse(connection: connection, error: "JSON Encoding Error", status: 500)
        }
    }

    nonisolated private func sendErrorResponse(connection: NWConnection, error: String, status: Int) {
        let errModel = ErrorResponse(error: error, code: status)
        if let data = try? JSONEncoder().encode(errModel) {
            let statusString: String
            switch status {
            case 400: statusString = "Bad Request"
            case 401: statusString = "Unauthorized"
            case 404: statusString = "Not Found"
            case 413: statusString = "Payload Too Large"
            case 429: statusString = "Too Many Requests"
            default: statusString = "Internal Server Error"
            }
            
            let responseHeaders = "HTTP/1.1 \(status) \(statusString)\r\nContent-Type: application/json\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n"
            var packet = responseHeaders.data(using: .utf8)!
            packet.append(data)
            connection.send(content: packet, isComplete: true, completion: .contentProcessed({ _ in }))
        } else {
            let fallback = "HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\nContent-Length: 21\r\nConnection: close\r\n\r\nInternal Server Error"
            connection.send(content: fallback.data(using: .utf8), isComplete: true, completion: .contentProcessed({ _ in }))
        }
    }
}
