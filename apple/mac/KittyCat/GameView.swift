// The game's web view: served from the app bundle through the kittycat:// scheme (a stable origin, so saved games
// and settings persist in the app's own storage), with native alerts, save and open panels, and outside links
// opened in the default browser.
import SwiftUI
import WebKit
import UniformTypeIdentifiers

struct GameView: NSViewRepresentable {
    @ObservedObject var model: GameModel

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = false
        webView.underPageBackgroundColor = NSColor(red: 0.09, green: 0.14, blue: 0.12, alpha: 1)   // felt-dark, not white, while loading
        model.webView = webView
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://game/index.html")!))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
        // The game asks "Start a new game?" with confirm(); show it as a Mac alert.
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.addButton(withTitle: "OK")
            alert.addButton(withTitle: "Cancel")
            completionHandler(alert.runModal() == .alertFirstButtonReturn)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = NSAlert()
            alert.messageText = message
            alert.runModal()
            completionHandler()
        }

        // Import backup: the file picker.
        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = false
            panel.canChooseDirectories = false
            panel.allowedContentTypes = [.json]
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }

        // Outside links (sound credits, card credits) open in the browser; the game stays in the window.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
                return
            }
            if let url = navigationAction.request.url, ["http", "https", "mailto"].contains(url.scheme ?? "") {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // Export backup: the game makes a download; ask where to save it.
        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                      suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.allowedContentTypes = [.json]
            completionHandler(panel.runModal() == .OK ? panel.url : nil)
        }
    }
}

/// Serves the files bundled under Resources/Web at kittycat://game/...
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "kittycat"

    private let root: URL = Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-store"]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
