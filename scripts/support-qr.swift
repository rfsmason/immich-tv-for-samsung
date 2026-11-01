// Generates the Support Us QR code (ADR 0021) with macOS Core Image's
// CIQRCodeGenerator, so the project needs no QR dependency. It prints the
// code's size in modules, quiet zone included, and an SVG path of its dark
// modules, one rectangle per run of dark modules in a row:
//
//   swift scripts/support-qr.swift https://ko-fi.com/immichtv M
//
// The output goes into src/screens/settings/support-qr.ts and
// website/assets/support-qr.svg. macOS only; the code is generated once.
import CoreImage
import Foundation

let arguments = CommandLine.arguments

guard arguments.count == 3, ["L", "M", "Q", "H"].contains(arguments[2]) else {
  FileHandle.standardError.write("Usage: swift support-qr.swift <url> <L|M|Q|H>\n".data(using: .utf8)!)
  exit(1)
}

let quietZone = 4
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(arguments[1].data(using: .utf8)!, forKey: "inputMessage")
filter.setValue(arguments[2], forKey: "inputCorrectionLevel")

let image = filter.outputImage!
let width = Int(image.extent.width)
let height = Int(image.extent.height)
var pixels = [UInt8](repeating: 0, count: width * height * 4)
CIContext(options: [.workingColorSpace: NSNull()]).render(
  image, toBitmap: &pixels, rowBytes: width * 4, bounds: image.extent, format: .RGBA8,
  colorSpace: nil)

// Core Image draws one light module around the code; it is replaced by the
// standard four-module quiet zone.
let size = width - 2
var path = ""

for row in 0..<size {
  var column = 0

  while column < size {
    let isDark = { (x: Int) in pixels[((row + 1) * width + x + 1) * 4] < 128 }

    if !isDark(column) {
      column += 1
      continue
    }

    let start = column

    while column < size && isDark(column) {
      column += 1
    }

    path += "M\(start + quietZone) \(row + quietZone)h\(column - start)v1h-\(column - start)z"
  }
}

print(size + quietZone * 2)
print(path)
