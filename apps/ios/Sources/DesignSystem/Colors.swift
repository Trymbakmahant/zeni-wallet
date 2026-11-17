import SwiftUI

public extension Color {
    static let zeniBackground = Color.black
    static let zeniSheet = Color(red: 13/255, green: 13/255, blue: 16/255)
    static let zeniCard = Color(red: 20/255, green: 20/255, blue: 23/255)
    static let zeniBorder = Color(red: 34/255, green: 34/255, blue: 38/255)
    static let zeniAccent = Color(red: 224/255, green: 99/255, blue: 65/255)
    static let zeniGreen = Color(red: 52/255, green: 211/255, blue: 153/255)
    static let zeniMuted = Color(red: 161/255, green: 161/255, blue: 170/255)
}

struct ZeniPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Color.zeniAccent, in: RoundedRectangle(cornerRadius: 14))
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
    }
}

extension View {
    func zeniSurface(_ color: Color = .zeniCard, radius: CGFloat = 16) -> some View {
        background(color, in: RoundedRectangle(cornerRadius: radius))
            .overlay { RoundedRectangle(cornerRadius: radius).stroke(Color.zeniBorder, lineWidth: 1) }
    }
}

struct ZeniBrandMark: View {
    var body: some View {
        Circle().stroke(.white, lineWidth: 3)
            .overlay { Rectangle().stroke(.white, lineWidth: 2.5).frame(width: 18, height: 18) }
            .frame(width: 56, height: 56)
            .accessibilityHidden(true)
    }
}

/// Native vector counterparts of the extension's CryptoIcon artwork.
struct ZeniTokenIcon: View {
    let symbol: String
    var size: CGFloat = 36

    var body: some View {
        Canvas { context, canvasSize in
            let scale = canvasSize.width / 36
            context.scaleBy(x: scale, y: scale)
            let bounds = CGRect(x: 0, y: 0, width: 36, height: 36)
            let background: Color = switch symbol {
            case "fBTC": Color(red: 247/255, green: 147/255, blue: 26/255)
            case "fETH": Color(red: 98/255, green: 126/255, blue: 234/255)
            case "fUSD": Color(red: 39/255, green: 117/255, blue: 202/255)
            default: .black
            }
            context.fill(Path(ellipseIn: bounds), with: .color(background))
            if symbol == "QOR" {
                context.stroke(Path(ellipseIn: bounds.insetBy(dx: 1, dy: 1)), with: .linearGradient(
                    Gradient(colors: [.orange, .zeniAccent]), startPoint: .zero, endPoint: CGPoint(x: 36, y: 36)), lineWidth: 1.5)
                fillPolygon([[18, 7.5], [26, 13.5], [10, 13.5]], color: Color(red: 248/255, green: 155/255, blue: 95/255), context: &context)
                fillPolygon([[10, 13.5], [18, 28.5], [18, 13.5]], color: .zeniAccent, context: &context)
                fillPolygon([[26, 13.5], [18, 28.5], [18, 13.5]], color: Color(red: 168/255, green: 56/255, blue: 24/255), context: &context)
            } else if symbol == "fETH" {
                fillPolygon([[18, 5], [9.653, 18.618], [18, 14.88]], color: .white, context: &context)
                fillPolygon([[18, 5], [26.347, 18.618], [18, 14.88]], color: .white.opacity(0.65), context: &context)
                fillPolygon([[9.653, 17.88], [18, 22.842], [18, 14.142]], color: .white.opacity(0.65), context: &context)
                fillPolygon([[26.347, 17.88], [18, 22.842], [18, 14.142]], color: .white.opacity(0.25), context: &context)
                fillPolygon([[9.653, 19.4], [18, 30.997], [18, 24.286]], color: .white, context: &context)
                fillPolygon([[26.351, 19.4], [18, 30.997], [18, 24.286]], color: .white.opacity(0.65), context: &context)
            } else {
                if symbol == "fUSD" {
                    context.stroke(Path(ellipseIn: bounds.insetBy(dx: 4, dy: 4)), with: .color(.white.opacity(0.3)), style: StrokeStyle(lineWidth: 1.2, dash: [3, 2]))
                }
                context.draw(Text(symbol == "fBTC" ? "₿" : "$")
                    .font(.system(size: 25, weight: .medium)).foregroundStyle(.white), at: CGPoint(x: 18, y: 18))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func fillPolygon(_ vertices: [[CGFloat]], color: Color, context: inout GraphicsContext) {
        var path = Path()
        for (index, vertex) in vertices.enumerated() {
            let point = CGPoint(x: vertex[0], y: vertex[1])
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        context.fill(path, with: .color(color))
    }
}
