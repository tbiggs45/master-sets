import SwiftUI
import WebKit
import AuthenticationServices
import StoreKit
import SafariServices

// MARK: - Supabase Constants (not user-configurable)

private enum Supabase {
    static let url = "https://guelnthdpipgvraylwom.supabase.co"
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1ZWxudGhkcGlwZ3ZyYXlsd29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDg4MzAsImV4cCI6MjA5MDk4NDgzMH0.KDbp03fUUhgEQgDM1tPZ19oZSTeOw_Mc6XuqMq3HrSg"
}

// MARK: - Scan Backend (not user-configurable)
// Deploy backend/server.js to Render and paste the URL here.
// Users will never need to enter an API key — scanning just works.

private enum ScanBackend {
    // TODO: Replace with your deployed Render/Railway/Fly URL after deployment.
    // Example: "https://master-sets-scan.onrender.com"
    // Leave empty ("") during local development and use the settings UI to set a dev URL.
    static let defaultEndpoint = "https://master-sets.onrender.com"
}

// MARK: - Scan Settings

struct APIKeyEntryView: View {
    @Binding var apiKey: String
    @Binding var backendURL: String
    @State private var draft: String = ""
    @State private var backendDraft: String = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.067, green: 0.078, blue: 0.090).ignoresSafeArea()
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("⬡")
                            .font(.system(size: 48))
                        Text("Master Sets")
                            .font(.system(size: 28, weight: .black))
                            .foregroundStyle(.white)
                        Text("Scan settings for developers.\nNormal users don't need to configure anything here.")
                            .font(.system(size: 14))
                            .foregroundStyle(.gray)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("SCAN BACKEND URL")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.gray)
                            .kerning(1)
                        TextField("http://127.0.0.1:8787", text: $backendDraft)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .font(.system(size: 14, design: .monospaced))
                            .padding(12)
                            .background(Color(white: 0.13))
                            .foregroundStyle(.white)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(white: 0.2), lineWidth: 1)
                            )
                        Text("Recommended for normal users. The app sends card images to your backend, and the backend uses your server-side AI key.")
                            .font(.system(size: 11))
                            .foregroundStyle(.gray)
                    }
                    .padding(.horizontal, 24)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("ANTHROPIC API KEY")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.gray)
                            .kerning(1)
                        SecureField("sk-ant-…", text: $draft)
                            .font(.system(size: 14, design: .monospaced))
                            .padding(12)
                            .background(Color(white: 0.13))
                            .foregroundStyle(.white)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color(white: 0.2), lineWidth: 1)
                            )
                        Text("Developer fallback only. Your key is stored on this device and used only when no backend URL is configured.")
                            .font(.system(size: 11))
                            .foregroundStyle(.gray)
                    }
                    .padding(.horizontal, 24)

                    Button {
                        let trimmedKey = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        let trimmedBackend = backendDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                        UserDefaults.standard.set(trimmedBackend, forKey: "scan_backend_url")
                        UserDefaults.standard.set(trimmedKey, forKey: "anthropic_api_key")
                        backendURL = trimmedBackend
                        apiKey = trimmedKey.isEmpty ? "demo" : trimmedKey
                        dismiss()
                    } label: {
                        Text("Save Scan Settings")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color(red: 0.89, green: 0.21, blue: 0.05))
                            .cornerRadius(12)
                    }
                    .padding(.horizontal, 24)
                    .disabled(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                        backendDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                    .opacity(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                        backendDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1
                    )

                    Button {
                        UserDefaults.standard.set("demo", forKey: "anthropic_api_key")
                        UserDefaults.standard.set("", forKey: "scan_backend_url")
                        apiKey = "demo"
                        backendURL = ""
                        dismiss()
                    } label: {
                        Text("Try Demo Mode")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.gray)
                    }

                    Spacer()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !apiKey.isEmpty {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                            .foregroundStyle(.gray)
                    }
                }
            }
        }
        .onAppear {
            draft = apiKey == "demo" ? "" : apiKey
            backendDraft = backendURL
        }
    }
}

// MARK: - Apple Sign-In Bridge

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding, WKUIDelegate {
    let tipManager = TipManager()

    // Auto-grant camera/microphone access so WKWebView doesn't re-prompt every launch.
    // The OS-level AVCaptureDevice permission dialog (shown once at install) is the real gate.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    weak var webView: WKWebView?

    func triggerSignIn(from webView: WKWebView) {
        self.webView = webView
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        webView?.window ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? UIWindow()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let token = String(data: tokenData, encoding: .utf8)
        else { return }
        let escaped = token.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView?.evaluateJavaScript("window.handleAppleSignIn('\(escaped)')", completionHandler: nil)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let msg = error.localizedDescription
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView?.evaluateJavaScript("window.handleAppleSignInError('\(msg)')", completionHandler: nil)
    }
}

// MARK: - In-App Tip (StoreKit 2)

final class TipManager {
    static let productIDs: [String] = [
        "tip_small",  // $0.99
        "tip_2",      // $1.99
        "tip_3",      // $2.99
        "tip_medium", // $4.99
        "tip_large",  // $9.99
        "tip_15",     // $14.99
        "tip_20",     // $19.99
        "tip_50"      // $49.99
    ]
    weak var webView: WKWebView?

    func fetchProducts() {
        Task {
            do {
                let products = try await Product.products(for: TipManager.productIDs)
                let sorted = products.sorted { $0.price < $1.price }
                let arr: [[String: String]] = sorted.map {
                    ["id": $0.id, "name": $0.displayName, "price": $0.displayPrice]
                }
                let data = try JSONSerialization.data(withJSONObject: arr)
                let json = String(data: data, encoding: .utf8) ?? "[]"
                await MainActor.run { [weak self] in
                    self?.webView?.evaluateJavaScript("window.handleTipProducts(\(json))", completionHandler: nil)
                }
            } catch {
                await MainActor.run { [weak self] in
                    self?.webView?.evaluateJavaScript("window.handleTipProducts([])", completionHandler: nil)
                }
            }
        }
    }

    func purchase(productID: String) {
        Task {
            do {
                let products = try await Product.products(for: [productID])
                guard let product = products.first else {
                    sendResult(["success": false, "error": "Product not found"])
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        sendResult(["success": true])
                    case .unverified:
                        sendResult(["success": false, "error": "Purchase could not be verified"])
                    }
                case .userCancelled:
                    sendResult(["cancelled": true])
                case .pending:
                    sendResult(["pending": true])
                @unknown default:
                    sendResult(["success": false, "error": "Unknown purchase state"])
                }
            } catch {
                sendResult(["success": false, "error": error.localizedDescription])
            }
        }
    }

    private func sendResult(_ payload: [String: Any]) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.handleTipResult(\(json))", completionHandler: nil)
        }
    }
}

private final class TipMessageHandler: NSObject, WKScriptMessageHandler {
    weak var manager: TipManager?

    init(manager: TipManager) {
        self.manager = manager
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "tip",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else { return }
        switch action {
        case "fetchProducts":
            manager?.fetchProducts()
        case "purchase":
            guard let productID = body["productID"] as? String else { return }
            manager?.purchase(productID: productID)
        default:
            break
        }
    }
}

// MARK: - External Tip (Ko-fi / PayPal via SFSafariViewController)

private enum ExternalTip {
    // swiftlint:disable force_unwrapping
    static let kofi   = URL(string: "https://ko-fi.com/big_hams")!
    static let paypal = URL(string: "https://paypal.me/tsbigham")!
    // swiftlint:enable force_unwrapping
}

private final class ExternalTipMessageHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "openTipPage", let platform = message.body as? String else { return }
        let url: URL
        switch platform {
        case "kofi":   url = ExternalTip.kofi
        case "paypal": url = ExternalTip.paypal
        default: return
        }
        DispatchQueue.main.async {
            guard let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController })
                .first else { return }
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(red: 0, green: 0.769, blue: 0.737, alpha: 1)
            rootVC.present(safari, animated: true)
        }
    }
}

// MARK: - WKWebView Wrapper

struct WebView: UIViewRepresentable {
    let apiKey: String
    let backendURL: String

    func makeCoordinator() -> AppleSignInCoordinator {
        AppleSignInCoordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Allow inline media and camera access
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Register native message handlers
        config.userContentController.add(AppleSignInMessageHandler(coordinator: context.coordinator), name: "appleSignIn")
        config.userContentController.add(TipMessageHandler(manager: context.coordinator.tipManager), name: "tip")
        config.userContentController.add(ExternalTipMessageHandler(), name: "openTipPage")

        // Inject API key before page loads
        let keyScript = WKUserScript(
            source: "window.ANTHROPIC_API_KEY = '\(apiKey.replacingOccurrences(of: "'", with: "\\'"))';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(keyScript)
        let backendScript = WKUserScript(
            source: "window.POKEBINDER_SCAN_ENDPOINT = '\(backendURL.replacingOccurrences(of: "'", with: "\\'"))';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(backendScript)
        let supabaseURLScript = WKUserScript(
            source: "window.MASTERSET_SUPABASE_URL = '\(Supabase.url)';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(supabaseURLScript)
        let supabaseAnonKeyScript = WKUserScript(
            source: "window.MASTERSET_SUPABASE_ANON_KEY = '\(Supabase.anonKey)';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(supabaseAnonKeyScript)
        // Signal to JS that the native Apple Sign In bridge is available
        let bridgeScript = WKUserScript(
            source: "window.NATIVE_APPLE_SIGNIN = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.020, green: 0.027, blue: 0.039, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 0.020, green: 0.027, blue: 0.039, alpha: 1)

        // Enable developer extras in debug builds
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        context.coordinator.webView = webView
        context.coordinator.tipManager.webView = webView
        webView.uiDelegate = context.coordinator
        loadPage(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    private func loadPage(in webView: WKWebView) {
        guard let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html") else {
            return
        }
        // Allow reading from bundle directory so relative resources resolve
        webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
    }
}

// MARK: - WKScriptMessageHandler for Apple Sign In

private final class AppleSignInMessageHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: AppleSignInCoordinator?

    init(coordinator: AppleSignInCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "appleSignIn", let webView = coordinator?.webView else { return }
        coordinator?.triggerSignIn(from: webView)
    }
}

// MARK: - Root ContentView

struct ContentView: View {
    @State private var apiKey: String = UserDefaults.standard.string(forKey: "anthropic_api_key") ?? "demo"
    @State private var backendURL: String = {
        let saved = UserDefaults.standard.string(forKey: "scan_backend_url") ?? ""
        return saved.isEmpty ? ScanBackend.defaultEndpoint : saved
    }()

    var body: some View {
        WebView(apiKey: apiKey, backendURL: backendURL)
            .ignoresSafeArea()
            .preferredColorScheme(.dark)
    }
}
