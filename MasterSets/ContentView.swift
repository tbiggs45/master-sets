import SwiftUI
import WebKit
import AuthenticationServices

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
    static let defaultEndpoint = ""
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

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
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
