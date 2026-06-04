// swift-tools-version: 6.1
// =============================================================================
// Package.swift — Apple LLM Bridge Server
// =============================================================================
// A local HTTP bridge server that wraps Apple's FoundationModels framework
// for on-device LLM inference. Uses ONLY system frameworks — no external
// dependencies are required.
//
// Security: The server binds exclusively to 127.0.0.1 (loopback) and requires
// HMAC-SHA256 authentication for all mutating endpoints.
// =============================================================================

import PackageDescription

let package = Package(
    name: "apple-llm-bridge",
    platforms: [
        .macOS("26.0")
    ],
    targets: [
        .executableTarget(
            name: "apple-llm-bridge",
            path: "Sources",
            swiftSettings: [
                // Enable strict concurrency checking for Swift 6 compliance.
                // This ensures all data races are caught at compile time.
                .swiftLanguageMode(.v6)
            ]
        )
    ]
)
