import XCTest
@testable import OlympusCore

final class LoadTests: XCTestCase {
    func ex(_ mode: LoadMode, name: String = "Machine", equipment: String? = nil, carriage: Double? = nil) -> ExerciseMeta {
        ExerciseMeta(id: "x", slug: nil, name: name, category: "Arms", loadMode: mode, carriageKgPerSide: carriage, isCompound: false, bodyRegion: nil, formCueId: nil, equipment: equipment)
    }

    func testFormatKgMatchesTheWeb() {
        XCTAssertEqual(formatKg(85), "85")
        XCTAssertEqual(formatKg(17.5 + 3.6), "21.1")
        XCTAssertEqual(formatKg(47.5), "47.5")
        XCTAssertEqual(formatLoad(.counterweight, 47), "47 cw")
        XCTAssertEqual(formatLoad(.perSide, 21.1), "21.1/side")
        XCTAssertEqual(formatLoad(.time, 30), "—")
    }

    func testTrueKgAndPlatesForInvertEachOther() {
        XCTAssertEqual(trueKg(loadMode: .perSide, carriageKgPerSide: 3.6, platesKg: 17.5), 21.1)
        XCTAssertEqual(platesFor(loadMode: .perSide, carriageKgPerSide: 3.6, targetTrueKg: 21.1), 17.5)
        XCTAssertEqual(trueKg(loadMode: .total, carriageKgPerSide: 3.6, platesKg: 60), 60)
    }

    func testBarbellPlates() {
        let bar = ex(.total, name: "Barbell Back Squat")
        XCTAssertEqual(plateBreakdown(bar, targetTrueKg: 72.5), PlateBreakdown(plates: [25, 1.25], leftover: 0))
        XCTAssertEqual(plateBreakdown(bar, targetTrueKg: 15)?.leftover, -5)
        XCTAssertNil(plateBreakdown(ex(.total, name: "Dumbbell Romanian Deadlift", equipment: "dumbbell"), targetTrueKg: 40))
        XCTAssertEqual(plateBreakdown(ex(.perSide, carriage: 5), targetTrueKg: 31)?.plates, [25])
        XCTAssertEqual(plateBreakdown(ex(.perSide, carriage: 5), targetTrueKg: 31)?.leftover, 1)
    }

    func testCounterweightIsInverted() {
        XCTAssertTrue(isHarder(.counterweight, 40, 47))
        XCTAssertEqual(progressDelta(.counterweight, prev: 47, next: 40), 7)
        let sets = [SetLogEntry(reps: 8, weight: 47), SetLogEntry(reps: 8, weight: 40), SetLogEntry(reps: 10, weight: 30, type: .warmup)]
        XCTAssertEqual(topSet(.counterweight, sets)?.weight, 40)
    }

    func testClocks() {
        XCTAssertEqual(clock(65), "01:05")
        XCTAssertEqual(clock(3725), "1:02:05")
        XCTAssertEqual(shortClock(101.2), "1:42")
        XCTAssertEqual(formatSleep(425), "7h 05")
        XCTAssertEqual(formatHours(390), "6.5")
        XCTAssertEqual(formatHours(360), "6")
    }

    func testRotation() {
        XCTAssertEqual(try parseRotation("a, b c").get(), ["A", "B", "C"])
        XCTAssertEqual(parseRotation("A A"), .failure(RotationError("Each session letter can appear once")))
        XCTAssertEqual(parseRotation("Push"), .failure(RotationError("\"PUSH\" isn't a single letter. Use A, B, C…")))
        XCTAssertEqual(SessionKind("A"), .coral)
        XCTAssertEqual(SessionKind("E"), .berry)
        XCTAssertEqual(SessionKind("Cardio"), .ink)
    }

    func testMarkdownMatchesTheWebFormat() {
        let s = ExportSession(
            date: "2026-10-02",
            sessionType: "B",
            title: "Pull",
            exercises: [
                ExportExercise(name: "Lat Pulldown", loadMode: .total, sets: [
                    SetLogEntry(reps: 10, weight: 50, rpe: 7, type: .working),
                    SetLogEntry(reps: 8, weight: 55, rpe: 8.5, type: .working, flags: [.topSetPR]),
                ], notes: nil, straps: true),
            ],
            notes: " Felt strong ",
            checkIn: SessionView.CheckIn(sleepMin: 425, proteinG: 140, waterMl: 2400),
            targets: SessionView.SessionTargets(proteinG: 155, waterMl: 3500)
        )
        XCTAssertEqual(renderSessionMarkdown(s), """
        ## 02/10/2026 — Session B: Pull

        | Exercise | Sets x Reps | Weight | RPE | Notes |
        |---|---|---|---|---|
        | Lat Pulldown | 10, 8 | 50/55 | 8.5 | Straps. Top set ↑ |

        Sleep 7:05 · Protein 140/155 g · Water 2.4/3.5 L

        Session notes: Felt strong

        """)
    }
}

final class OutboxTests: XCTestCase {
    actor FakeServer: OutboxExecutor {
        var online = true
        var reject: Set<String> = []
        private(set) var received: [OutboxOp] = []

        func setOnline(_ v: Bool) { online = v }
        func setReject(_ keys: Set<String>) { reject = keys }

        nonisolated func execute(_ op: OutboxOp) async -> ExecuteResult { await run(op) }

        private func run(_ op: OutboxOp) -> ExecuteResult {
            guard online else { return .networkFailure }
            received.append(op)
            return reject.contains(op.key) ? .rejected("Session is already finished") : .ok(Data("{}".utf8))
        }
    }

    var file: URL!

    override func setUp() {
        file = FileManager.default.temporaryDirectory.appendingPathComponent("outbox-\(UUID().uuidString).json")
    }

    override func tearDown() { try? FileManager.default.removeItem(at: file) }

    func set(_ i: Int, reps: Int) -> OutboxOp {
        .logSet(sessionId: "s", input: LogSetInput(exerciseId: "e", planItemId: nil, setIndex: i, weight: 50, reps: reps))
    }

    func testOnlineAndEmptySendsStraightThrough() async {
        let server = FakeServer()
        let box = Outbox(fileURL: file, executor: server)
        guard case .ok = await box.send(set(0, reps: 8)) else { return XCTFail() }
        let n = await box.pendingCount
        XCTAssertEqual(n, 0)
    }

    func testOfflineQueuesCoalescesAndReplaysInOrder() async {
        let server = FakeServer()
        await server.setOnline(false)
        let box = Outbox(fileURL: file, executor: server)
        guard case .queued = await box.send(set(0, reps: 8)) else { return XCTFail() }
        _ = await box.send(set(1, reps: 8))
        _ = await box.send(set(0, reps: 9)) // supersedes the first
        var n = await box.pendingCount
        XCTAssertEqual(n, 2)

        await server.setOnline(true)
        let report = await box.flush()
        XCTAssertEqual(report.synced, 2)
        let received = await server.received
        XCTAssertEqual(received, [set(1, reps: 8), set(0, reps: 9)])
        n = await box.pendingCount
        XCTAssertEqual(n, 0)
    }

    func testANewOpNeverJumpsTheQueue() async {
        let server = FakeServer()
        await server.setOnline(false)
        let box = Outbox(fileURL: file, executor: server)
        _ = await box.send(set(0, reps: 8))
        await server.setOnline(true)
        // Online again, but something is queued: this one queues behind it.
        guard case .queued = await box.send(set(1, reps: 8)) else { return XCTFail() }
        await box.flush()
        let received = await server.received
        XCTAssertEqual(received.first, set(0, reps: 8))
    }

    func testRejectionsAreDroppedAndReported() async {
        let server = FakeServer()
        await server.setOnline(false)
        let box = Outbox(fileURL: file, executor: server)
        _ = await box.send(.finish(sessionId: "s", notes: nil))
        await server.setOnline(true)
        await server.setReject(["finish:s"])
        let report = await box.flush()
        XCTAssertEqual(report.rejected, ["Session is already finished"])
        let n = await box.pendingCount
        XCTAssertEqual(n, 0)
    }

    func testCheckInPatchesMergeAndTheQueueSurvivesARelaunch() async {
        let server = FakeServer()
        await server.setOnline(false)
        var box: Outbox? = Outbox(fileURL: file, executor: server)
        _ = await box!.send(.checkIn(CheckInInput(date: "2026-10-02", sleepMin: .some(420))))
        _ = await box!.send(.checkIn(CheckInInput(date: "2026-10-02", waterMl: .some(750))))
        box = nil

        let reopened = Outbox(fileURL: file, executor: server)
        let n = await reopened.pendingCount
        XCTAssertEqual(n, 1)
        await server.setOnline(true)
        await reopened.flush()
        let received = await server.received
        XCTAssertEqual(received, [.checkIn(CheckInInput(date: "2026-10-02", sleepMin: .some(420), waterMl: .some(750)))])
    }

    func testClearingACheckInFieldEncodesNull() throws {
        let json = try JSONEncoder().encode(CheckInInput(date: nil, sleepMin: .some(nil)))
        XCTAssertEqual(String(data: json, encoding: .utf8), #"{"sleepMin":null}"#)
        let back = try JSONDecoder().decode(CheckInInput.self, from: json)
        XCTAssertEqual(back, CheckInInput(date: nil, sleepMin: .some(nil)))
    }

    func testManualSessionSendsNullsTheServerRequires() throws {
        let input = ManualSessionInput(date: "2026-10-02", sessionName: "A", weekNumber: 1, blockNumber: "1", notes: nil, exercises: [
            .init(exerciseId: "e", sets: [.init(reps: 8, weight: 50)], rpe: nil, notes: nil, orderIndex: 0),
        ])
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as! [String: Any]
        XCTAssertTrue(json.keys.contains("notes"))
        let ex = (json["exercises"] as! [[String: Any]])[0]
        XCTAssertTrue(ex["rpe"] is NSNull)
        XCTAssertTrue(ex["notes"] is NSNull)
    }
}
