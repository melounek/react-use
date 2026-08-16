import SwiftUI

/// Feasibility probe: renders a board, reacts to taps, and exposes accessibility
/// identifiers so an XCUITest can drive it. The point is to prove the loop
/// build -> boot simulator -> interact -> screenshot -> inspect, not to be the
/// real app.
struct BoardView: View {
    @State private var selected: Int? = nil
    @State private var taps = 0

    private let light = Color(red: 0.925, green: 0.937, blue: 0.878)
    private let dark = Color(red: 0.478, green: 0.651, blue: 0.388)
    private let accent = Color(red: 0.510, green: 0.757, blue: 0.306)

    /// Starting position, black on top, as Unicode chess glyphs.
    private let start: [String] = {
        let back = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"]
        var squares = back
        squares += Array(repeating: "♟", count: 8)
        squares += Array(repeating: "", count: 32)
        squares += Array(repeating: "♙", count: 8)
        squares += ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"]
        return squares
    }()

    var body: some View {
        VStack(spacing: 20) {
            Text("AIRPLANE CHESS")
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .kerning(1.6)
                .foregroundStyle(.white)

            Text("iOS probe — tapped \(taps)×")
                .font(.system(size: 15, design: .monospaced))
                .foregroundStyle(accent)
                .accessibilityIdentifier("tapCounter")

            GeometryReader { geo in
                let side = min(geo.size.width, geo.size.height)
                let cell = side / 8
                VStack(spacing: 0) {
                    ForEach(0..<8, id: \.self) { row in
                        HStack(spacing: 0) {
                            ForEach(0..<8, id: \.self) { col in
                                let index = row * 8 + col
                                ZStack {
                                    Rectangle()
                                        .fill((row + col) % 2 == 0 ? light : dark)
                                    if selected == index {
                                        Rectangle().fill(accent.opacity(0.75))
                                    }
                                    Text(start[index])
                                        .font(.system(size: cell * 0.72))
                                        .foregroundStyle(index < 16 ? .black : .white)
                                }
                                .frame(width: cell, height: cell)
                                .accessibilityIdentifier("sq-\(index)")
                                .onTapGesture {
                                    selected = index
                                    taps += 1
                                }
                            }
                        }
                    }
                }
                .frame(width: side, height: side)
                .frame(maxWidth: .infinity)
            }
            .aspectRatio(1, contentMode: .fit)

            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.055, green: 0.063, blue: 0.059))
    }
}

@main
struct ProbeApp: App {
    var body: some Scene {
        WindowGroup { BoardView() }
    }
}
