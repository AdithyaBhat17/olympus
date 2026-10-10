import OlympusCore
import SwiftUI

/// Settings › Your training (src/components/settings/profile-form.tsx):
/// timezone, rotation, sleep floor, nutrition targets. PATCH /me with what changed.
struct SettingsProfileForm: View {
    @Environment(AppModel.self) private var model
    let profile: AthleteProfile

    @State private var timezone: String
    @State private var rotation: String
    @State private var sleepH: String
    @State private var kcal: String
    @State private var protein: String
    @State private var waterL: String
    @State private var saving = false

    init(profile: AthleteProfile) {
        self.profile = profile
        let f = Self.fields(profile)
        _timezone = State(initialValue: f.timezone)
        _rotation = State(initialValue: f.rotation)
        _sleepH = State(initialValue: f.sleepH)
        _kcal = State(initialValue: f.kcal)
        _protein = State(initialValue: f.protein)
        _waterL = State(initialValue: f.waterL)
    }

    private static func fields(_ p: AthleteProfile) -> (timezone: String, rotation: String, sleepH: String, kcal: String, protein: String, waterL: String) {
        (
            p.timezone,
            p.rotation.joined(separator: ", "),
            SettingsFormat.number(Double(p.targets.minSleepMin) / 60),
            p.targets.kcal.map(String.init) ?? "",
            p.targets.proteinG.map(String.init) ?? "",
            p.targets.waterMl.map { SettingsFormat.number(Double($0) / 1000) } ?? ""
        )
    }

    private var deviceZone: String { TimeZone.current.identifier }

    var body: some View {
        SettingsCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    SettingsFieldLabel("Timezone, decides when your day starts")
                    NavigationLink {
                        SettingsTimezonePicker(selection: $timezone)
                    } label: {
                        HStack {
                            Text(timezone.replacingOccurrences(of: "_", with: " "))
                                .foregroundStyle(Color.fg)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Color.muted)
                        }
                        .settingsInput()
                    }
                    .accessibilityLabel("Timezone, \(timezone)")
                    if deviceZone != timezone {
                        Button("Use this device's, \(deviceZone.replacingOccurrences(of: "_", with: " "))") {
                            timezone = deviceZone
                        }
                        .buttonStyle(SettingsTextButtonStyle())
                        .padding(.horizontal, 4)
                    }
                }

                HStack(alignment: .top, spacing: 8) {
                    field("Rotation", text: $rotation, placeholder: "A, B, C", keyboard: .asciiCapable, caps: .characters)
                    field("Sleep floor (h)", text: $sleepH, placeholder: "7", keyboard: .decimalPad)
                }
                Text("Session letters in the order you train them, up to six. Under the sleep floor, loads hold.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 4)
                    .padding(.top, -4)

                HStack(alignment: .top, spacing: 8) {
                    field("Protein (g)", text: $protein, placeholder: "—", keyboard: .numberPad)
                    field("Water (L)", text: $waterL, placeholder: "—", keyboard: .decimalPad)
                    field("Calories", text: $kcal, placeholder: "—", keyboard: .numberPad)
                }
                Text("Leave a target blank if you don't track it. Protein is a floor.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 4)
                    .padding(.top, -4)

                Button(saving ? "Saving…" : "Save", action: submit)
                    .buttonStyle(SettingsSubmitButtonStyle())
                    .disabled(saving)
            }
        }
        .onChange(of: profile) { _, p in
            // A fresh load (after a save, or a change made elsewhere) resets the form.
            let f = Self.fields(p)
            timezone = f.timezone
            rotation = f.rotation
            sleepH = f.sleepH
            kcal = f.kcal
            protein = f.protein
            waterL = f.waterL
        }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: String, keyboard: UIKeyboardType, caps: TextInputAutocapitalization = .never) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SettingsFieldLabel(label)
            TextField(placeholder, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(caps)
                .autocorrectionDisabled()
                .settingsInput(numeric: true)
                .accessibilityLabel(label)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Save

    /// "" → nil (not tracked); otherwise a number, or NaN when it isn't one.
    private static func optionalNumber(_ raw: String) -> Double?? {
        let t = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if t.isEmpty { return .some(nil) }
        guard let v = Double(t), v.isFinite, v >= 0 else { return .none }
        return .some(v)
    }

    private func submit() {
        let rot: [String]
        switch parseRotation(rotation) {
        case let .success(r): rot = r
        case let .failure(e): return model.show(e.message, kind: .error)
        }
        guard let sleep = Double(sleepH.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")),
              sleep >= 3, sleep <= 12 else {
            return model.show("Sleep floor: 3 to 12 hours", kind: .error)
        }
        guard let k = Self.optionalNumber(kcal), let p = Self.optionalNumber(protein), let w = Self.optionalNumber(waterL) else {
            return model.show("Targets are numbers, or blank to not track them", kind: .error)
        }
        let kcalV = k.map { Int($0.rounded()) }
        let proteinV = p.map { Int($0.rounded()) }
        // Anything above 20 is clearly millilitres.
        let waterV = w.map { Int(($0 > 20 ? $0 : $0 * 1000).rounded()) }
        let sleepMin = Int((sleep * 60).rounded())

        var patch = SettingsProfilePatch()
        let t = profile.targets
        if timezone != profile.timezone { patch.timezone = timezone }
        if rot != profile.rotation { patch.rotation = rot }
        if sleepMin != t.minSleepMin { patch.minSleepMin = sleepMin }
        if kcalV != t.kcal { patch.kcal = .some(kcalV) }
        if proteinV != t.proteinG { patch.proteinG = .some(proteinV) }
        if waterV != t.waterMl { patch.waterMl = .some(waterV) }

        rotation = rot.joined(separator: ", ")
        guard !patch.isEmpty else { return model.show("Nothing to save") }

        saving = true
        Task {
            defer { saving = false }
            do {
                _ = try await model.api.patch("me", patch, as: Me.self)
                model.show("Saved")
                // Today's rotation and targets depend on this too.
                model.dataChanged()
            } catch {
                model.show(error)
            }
        }
    }
}

/// PATCH /me body: absent fields aren't sent; a `.some(nil)` target is sent as null (not tracked).
struct SettingsProfilePatch: Encodable {
    var timezone: String?
    var rotation: [String]?
    var minSleepMin: Int?
    var kcal: Int??
    var proteinG: Int??
    var waterMl: Int??

    var isEmpty: Bool {
        timezone == nil && rotation == nil && minSleepMin == nil && kcal == nil && proteinG == nil && waterMl == nil
    }

    enum CodingKeys: String, CodingKey { case timezone, rotation, minSleepMin, kcal, proteinG, waterMl }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(timezone, forKey: .timezone)
        try c.encodeIfPresent(rotation, forKey: .rotation)
        try c.encodeIfPresent(minSleepMin, forKey: .minSleepMin)
        func target(_ v: Int??, _ k: CodingKeys) throws {
            switch v {
            case .none: break
            case .some(.none): try c.encodeNil(forKey: k)
            case let .some(.some(x)): try c.encode(x, forKey: k)
            }
        }
        try target(kcal, .kcal)
        try target(proteinG, .proteinG)
        try target(waterMl, .waterMl)
    }
}

/// Searchable list of every timezone, the device's first.
struct SettingsTimezonePicker: View {
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private static let all = TimeZone.knownTimeZoneIdentifiers

    private var zones: [String] {
        var list = Self.all
        for extra in [selection, TimeZone.current.identifier] where !list.contains(extra) { list.insert(extra, at: 0) }
        guard !query.isEmpty else { return list }
        let q = query.replacingOccurrences(of: " ", with: "_")
        return list.filter { $0.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        List {
            if query.isEmpty {
                Section {
                    row(TimeZone.current.identifier, sub: "This device")
                }
                .listRowBackground(Color.surface)
            }
            Section {
                ForEach(zones, id: \.self) { row($0, sub: nil) }
            }
            .listRowBackground(Color.surface)
        }
        .scrollContentBackground(.hidden)
        .background(Color.bg.ignoresSafeArea())
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search, e.g. London")
        .navigationTitle("Timezone")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.bg, for: .navigationBar)
    }

    private func row(_ zone: String, sub: String?) -> some View {
        Button {
            selection = zone
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(zone.replacingOccurrences(of: "_", with: " ")).foregroundStyle(Color.fg)
                    if let sub { Text(sub).font(.system(size: 12)).foregroundStyle(Color.muted) }
                }
                Spacer()
                if zone == selection {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.coral)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(zone == selection ? .isSelected : [])
    }
}
