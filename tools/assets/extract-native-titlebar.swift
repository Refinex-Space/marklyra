import AppKit
import Foundation
import CryptoKit

let sourcePath = "/Applications/Typora.app"
guard CommandLine.arguments.count == 2 else { fatalError("Pass a new output directory inside private/") }
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true).standardizedFileURL
let workspacePrivate = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("private", isDirectory: true).standardizedFileURL
let canonicalParent = destination.deletingLastPathComponent().resolvingSymlinksInPath()
guard canonicalParent.path.hasPrefix(workspacePrivate.resolvingSymlinksInPath().path + "/") || canonicalParent == workspacePrivate.resolvingSymlinksInPath() else { fatalError("Output must remain inside the workspace private directory") }
let carURL = URL(fileURLWithPath: sourcePath).appendingPathComponent("Contents/Resources/Assets.car")
let originalCar = try Data(contentsOf: carURL)
guard SHA256.hash(data: originalCar).map({ String(format: "%02x", $0) }).joined() == "3a52ece4b0a01232119543428b9727fb34fca29d2c2ad1df8b733277107224c8" else { fatalError("Original asset catalog identity mismatch") }
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: false)
guard let source = Bundle(path: sourcePath) else { fatalError("Cannot read original Bundle metadata") }
let sourceLoadedBefore = source.isLoaded
let names = ["tocButton", "tocButtonWhite", "sideButton", "sideButtonWhite", "updownArrow", "updownArrowWhite", "updownArrowTransparent"]
var rows: [[String: Any]] = []
func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
for name in names {
    guard let image = source.image(forResource: NSImage.Name(name)) else {
        rows.append(["name": name, "error": "Bundle.image(forResource:) returned nil"])
        continue
    }
    let pointSize = image.size
    let representationMetadata = image.representations.map { rep -> [String: Any] in
        ["class": String(describing: type(of: rep)), "pixelsWide": rep.pixelsWide, "pixelsHigh": rep.pixelsHigh, "pointWidth": rep.size.width, "pointHeight": rep.size.height, "hasAlpha": rep.hasAlpha]
    }
    for scale in [1, 2] {
        let width = Int((pointSize.width * CGFloat(scale)).rounded())
        let height = Int((pointSize.height * CGFloat(scale)).rounded())
        guard width > 0, height > 0, width <= 1024, height <= 1024 else {
            rows.append(["name": name, "scale": scale, "error": "Invalid bounded dimensions"])
            continue
        }
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 32), let context = NSGraphicsContext(bitmapImageRep: rep) else {
            rows.append(["name": name, "scale": scale, "error": "No offscreen RGBA bitmap context"])
            continue
        }
        let old = NSGraphicsContext.current
        NSGraphicsContext.current = context
        context.cgContext.clear(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
        context.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
        image.draw(in: NSRect(origin: .zero, size: pointSize), from: .zero, operation: .copy, fraction: 1, respectFlipped: false, hints: [.interpolation: NSImageInterpolation.none])
        context.cgContext.flush()
        NSGraphicsContext.current = old
        rep.size = pointSize
        guard let png = rep.representation(using: .png, properties: [:]), let pixels = rep.bitmapData else {
            rows.append(["name": name, "scale": scale, "error": "No output PNG or pixels"])
            continue
        }
        var alphaMin = 255, alphaMax = 0, alphaNonzero = 0, alphaOpaque = 0
        var bounds = [width, height, -1, -1]
        for y in 0..<height { for x in 0..<width {
            let alpha = Int(pixels[y * rep.bytesPerRow + x * 4 + 3])
            alphaMin = min(alphaMin, alpha); alphaMax = max(alphaMax, alpha)
            if alpha > 0 {
                alphaNonzero += 1
                bounds[0] = min(bounds[0], x); bounds[1] = min(bounds[1], y)
                bounds[2] = max(bounds[2], x); bounds[3] = max(bounds[3], y)
            }
            if alpha == 255 { alphaOpaque += 1 }
        } }
        let file = name + "@" + String(scale) + "x.png"
        let url = destination.appendingPathComponent(file)
        guard !FileManager.default.fileExists(atPath: url.path) else { fatalError("Refusing to overwrite private output") }
        try png.write(to: url, options: .withoutOverwriting)
        rows.append(["name": name, "scale": scale, "file": file, "isTemplate": image.isTemplate, "bitmapFormat": rep.bitmapFormat.rawValue, "pointWidth": pointSize.width, "pointHeight": pointSize.height, "pixelWidth": width, "pixelHeight": height, "pngBytes": png.count, "sha256": digest(png), "alphaMin": alphaMin, "alphaMax": alphaMax, "alphaNonzero": alphaNonzero, "alphaOpaque": alphaOpaque, "alphaBoundsInclusive": bounds, "representations": representationMetadata, "kind": "AppKit offscreen derived raster, not original encoded rendition bytes"])
    }
}
let car = try Data(contentsOf: carURL)
guard car == originalCar && !source.isLoaded else { fatalError("Original catalog changed or Bundle unexpectedly loaded") }
let report: [String: Any] = ["scope": "Read-only Bundle.image(forResource:) plus offscreen AppKit rendering. No application launch, Bundle.load, original file write or UI automation.", "source": sourcePath, "sourceLoadedBefore": sourceLoadedBefore, "sourceLoadedAfter": source.isLoaded, "assetsCarSha256": digest(car), "rows": rows]
let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
try json.write(to: destination.appendingPathComponent("report.json"), options: .withoutOverwriting)
let derivedCount = rows.filter { $0["file"] != nil }.count
print("Derived PNG records: \(derivedCount); Bundle loaded before/after: \(sourceLoadedBefore)/\(source.isLoaded)")
