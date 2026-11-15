// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "ZeniIOS",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "ZeniCore",
            targets: ["ZeniCore"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "ZeniCore",
            path: "Sources"
        )
    ]
)
