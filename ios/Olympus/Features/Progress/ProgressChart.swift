import Charts
import OlympusCore
import SwiftUI

/// Top set over time (src/components/progress/exercise-chart.tsx): white line and
/// area on the coral block, last point in apricot, 4W / 12W / All. Counterweight
/// flips the axis so up is always progress.
struct ProgressChart: View {
    let points: [ExerciseProgressScreen.Point]
    let today: String
    let loadMode: LoadMode

    enum Range: String, CaseIterable, Identifiable {
        case w4 = "4W", w12 = "12W", all = "All"
        var id: String { rawValue }
        var days: Int? {
            switch self {
            case .w4: 28
            case .w12: 84
            case .all: nil
            }
        }
    }

    @State private var range: Range = .w12

    private struct Sample: Identifiable {
        let index: Int
        let date: String
        let top: Double
        var id: Int { index }
    }

    private var series: [Sample] {
        let cutoff = range.days.flatMap { d in ProgressChart.dayNumber(today).map { $0 - d } }
        return points
            .compactMap { p -> (String, Double)? in
                guard let top = p.top else { return nil }
                if let cutoff, let n = ProgressChart.dayNumber(p.date), n < cutoff { return nil }
                return (p.date, top)
            }
            .enumerated()
            .map { Sample(index: $0.offset, date: $0.element.0, top: $0.element.1) }
    }

    private var flip: Bool { loadMode == .counterweight }
    private var unit: String { loadMode == .perSide ? " kg per side" : " kg" }

    /// Plotted value: negated for counterweight so a lower (harder) number sits higher.
    private func y(_ v: Double) -> Double { flip ? -v : v }

    var body: some View {
        let s = series
        let (lo, hi) = s.isEmpty ? (0.0, 1.0) : Self.scale(s.map(\.top))
        let yDomain = flip ? (-hi)...(-lo) : lo...hi
        let ticks = [lo, (lo + hi) / 2, hi]
        let colors = KindColors(.coral)

        VStack(spacing: 12) {
            Chart {
                ForEach(s) { p in
                    AreaMark(
                        x: .value("Session", p.index),
                        yStart: .value("Base", yDomain.lowerBound),
                        yEnd: .value("Top set", y(p.top))
                    )
                    .foregroundStyle(LinearGradient(colors: [.white.opacity(0.22), .white.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.linear)

                    LineMark(x: .value("Session", p.index), y: .value("Top set", y(p.top)))
                        .foregroundStyle(.white)
                        .lineStyle(StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                        .interpolationMethod(.linear)
                }
                if let last = s.last {
                    PointMark(x: .value("Session", last.index), y: .value("Top set", y(last.top)))
                        .symbol {
                            Circle()
                                .fill(Color.apricot)
                                .frame(width: 14, height: 14)
                                .overlay(Circle().strokeBorder(.white, lineWidth: 3))
                        }
                }
            }
            // Room at the ends so the last-point marker isn't cut in half.
            .chartXScale(domain: s.count <= 1 ? -1...1 : 0...(s.count - 1), range: .plotDimension(startPadding: 4, endPadding: 10))
            .chartYScale(domain: yDomain)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .trailing, values: ticks.map(y)) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [2, 4]))
                        .foregroundStyle(.white.opacity(0.25))
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text(formatKg((abs(v) * 100).rounded() / 100))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }
            }
            .frame(height: 150)
            .overlay {
                if s.isEmpty {
                    Text("No top sets in this range")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            .animation(.easeInOut(duration: 0.35), value: range)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Top set over time")
            .accessibilityValue(summary(s))

            if let first = s.first, let end = s.last, s.count > 1 {
                HStack {
                    Text(ListsFormat.ddmm(first.date))
                    Spacer()
                    Text(ListsFormat.ddmm(end.date))
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.trailing, 32)
                .accessibilityHidden(true)
            }

            HStack(spacing: 8) {
                ForEach(Range.allCases) { r in
                    Button {
                        Haptics.tick()
                        withAnimation(.snappy) { range = r }
                    } label: {
                        Text(r.rawValue)
                            .font(.system(size: 15, weight: .heavy))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(range == r ? Color.white : Color.white.opacity(0.2), in: Capsule())
                            .foregroundStyle(range == r ? colors.text : colors.on)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(rangeName(r))
                    .accessibilityAddTraits(range == r ? .isSelected : [])
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Range")
        }
        .padding(.top, 20)
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .background(colors.k, in: RoundedRectangle(cornerRadius: 36, style: .continuous))
        .foregroundStyle(colors.on)
        .accessibilityElement(children: .contain)
    }

    private func rangeName(_ r: Range) -> String {
        switch r {
        case .w4: "4 weeks"
        case .w12: "12 weeks"
        case .all: "All time"
        }
    }

    private func summary(_ s: [Sample]) -> String {
        guard let first = s.first, let end = s.last else { return "No top sets in this range" }
        if s.count > 1 {
            return "Top set went from \(formatKg(first.top)) to \(formatKg(end.top))\(unit) between \(ListsFormat.ddmm(first.date)) and \(ListsFormat.ddmm(end.date))"
        }
        return "Top set \(formatKg(end.top))\(unit) on \(ListsFormat.ddmm(end.date))"
    }

    /// Days since 1970 for "2026-10-02" (UTC), for the range cut-off.
    static func dayNumber(_ iso: String) -> Int? {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var c = DateComponents()
        (c.year, c.month, c.day, c.hour) = (p[0], p[1], p[2], 12)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        guard let d = cal.date(from: c) else { return nil }
        return Int((d.timeIntervalSince1970 / 86_400).rounded(.down))
    }

    private static func niceStep(_ raw: Double) -> Double {
        let exp = floor(log10(raw))
        let base = pow(10, exp)
        for n in [1, 2, 2.5, 5] where n * base >= raw - 1e-9 { return n * base }
        return 10 * base
    }

    /// Three gridlines (two intervals) that contain every value.
    static func scale(_ values: [Double]) -> (Double, Double) {
        guard let min = values.min(), let max = values.max() else { return (0, 1) }
        var range = max - min
        if range <= 0 { range = Swift.max(abs(max) * 0.2, 1) }
        var step = niceStep(range / 2)
        for _ in 0..<20 {
            let lo = floor(min / step) * step
            if lo + 2 * step >= max - 1e-9 { return (lo, lo + 2 * step) }
            step = niceStep(step * 1.01)
        }
        return (min, max)
    }
}
