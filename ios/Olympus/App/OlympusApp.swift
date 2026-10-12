import SwiftUI
import UIKit
import UserNotifications

@main
struct OlympusApp: App {
    @UIApplicationDelegateAdaptor private var delegate: AppDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(AppDelegate.model)
                .tint(.coral)
                .preferredColorScheme(.light)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            let model = AppDelegate.model
            Task {
                await model.flush()
                model.dataChanged()
                await model.health.sync(quietly: true)
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// One model for the app's life, so HealthKit's background launches find it too.
    @MainActor static let model = AppModel()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // HealthKit relaunches the app in the background for new samples; the
        // observers have to be registered again before it can deliver them.
        MainActor.assumeIsolated { Self.model.health.start() }
        return true
    }

    /// The rest timer's "Rest's up" is only for when the app isn't on screen.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        notification.request.identifier == RestTimer.notificationId ? [] : [.banner, .sound]
    }
}
