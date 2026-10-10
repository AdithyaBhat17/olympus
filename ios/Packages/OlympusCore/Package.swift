// swift-tools-version:6.0
import PackageDescription

// Pure logic for the Olympus app (load maths, formatting, the offline outbox,
// Health aggregation): no UIKit or HealthKit, so `swift test` runs on a Mac.
let package = Package(
    name: "OlympusCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [.library(name: "OlympusCore", targets: ["OlympusCore"])],
    targets: [
        // Swift 5 language mode, like the app target.
        .target(name: "OlympusCore", swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(name: "OlympusCoreTests", dependencies: ["OlympusCore"], swiftSettings: [.swiftLanguageMode(.v5)]),
    ]
)
