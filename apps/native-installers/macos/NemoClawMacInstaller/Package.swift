// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "NemoClawMacInstaller",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "NemoClawMacInstaller", targets: ["NemoClawMacInstaller"])
    ],
    targets: [
        .executableTarget(
            name: "NemoClawMacInstaller",
            resources: [.process("Resources")]
        )
    ]
)
