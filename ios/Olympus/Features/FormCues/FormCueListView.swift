import OlympusCore
import SwiftUI

/// Every 3D form cue (src/app/(app)/form/page.tsx). A row opens the cue sheet.
struct FormCueListView: View {
    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router

    private struct Cues: Decodable { let cues: [FormCue] }

    var body: some View {
        Loadable(load: { try await model.api.get("form", as: Cues.self).cues }) { cues, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PageHeader(eyebrow: "3D, from your PT", title: "Form cues")
                    VStack(spacing: 0) {
                        ForEach(Array(cues.enumerated()), id: \.element.id) { i, cue in
                            Button {
                                Haptics.tick()
                                router.formCue = .init(cue: cue.id, exerciseId: nil)
                            } label: {
                                row(cue)
                            }
                            .buttonStyle(FormCueRowStyle())
                            if i < cues.count - 1 {
                                Rectangle().fill(Color.surface3).frame(height: 1)
                            }
                        }
                    }
                    .card(24)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .padding(.horizontal, 12)
                }
                .padding(.bottom, 24)
            }
            .refreshable { await reload() }
            .tabClearance()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.bg, for: .navigationBar)
    }

    private func row(_ cue: FormCue) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "play.fill")
                .font(.system(size: 15))
                .foregroundStyle(Color.berry)
                .frame(width: 40, height: 40)
                .background(Color.berry.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(cue.title).font(.num(22)).foregroundStyle(Color.fg)
                Text(cue.blurb).font(.system(size: 13)).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Color.faint)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }
}

private struct FormCueRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.surface2 : Color.clear)
    }
}
