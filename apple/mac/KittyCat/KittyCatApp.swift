// KittyCat Solitaire for the Mac: one window holding the game, with a real menu bar and keyboard shortcuts.
// The game itself is the web app, bundled whole (Web/index.html) and served from inside the app, so it plays offline.
import SwiftUI
import WebKit

@main
struct KittyCatApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var game = GameModel()

    var body: some Scene {
        Window("KittyCat Solitaire", id: "main") {
            GameView(model: game)
                .frame(minWidth: 720, minHeight: 540)
        }
        .defaultSize(width: 1100, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Game") { game.run("window.kittycat?.ui?.newGame()") }
                    .keyboardShortcut("n")
            }
            CommandGroup(replacing: .undoRedo) {
                Button("Undo Move") { game.run("window.kittycat?.ctl?.undo()") }
                    .keyboardShortcut("z")
            }
            CommandGroup(replacing: .appSettings) {
                Button("Settings…") { game.run("window.kittycat?.ui?.settings()") }
                    .keyboardShortcut(",")
            }
            CommandMenu("Game") {
                Button("Any Moves Left?") { game.run("window.kittycat?.ui?.movesLeft()") }
                    .keyboardShortcut("m")
                Button("Finish") { game.run("window.kittycat?.ctl?.autoFinish()") }
                    .keyboardShortcut("f", modifiers: [.command, .shift])
                Divider()
                Button("Game Summary") { game.run("window.kittycat?.ui?.summary()") }
                    .keyboardShortcut("y", modifiers: [.command, .shift])
                Button("Stats and History") { game.run("window.kittycat?.ui?.stats()") }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

/// Holds the web view so menu commands can reach the game.
@MainActor
final class GameModel: ObservableObject {
    weak var webView: WKWebView?

    func run(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }
}
