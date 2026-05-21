// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import AppKit
import SwiftUI

enum MacInstallerStep: String, CaseIterable, Identifiable {
    case requirements = "Ready"
    case agent = "Agent"
    case model = "Model"
    case security = "Trust"
    case review = "Review"
    case deploy = "Install"
    case launch = "Launch"

    var id: String { rawValue }
}

struct PlanAgent: Decodable, Identifiable, Hashable {
    let name: String
    let displayName: String
    let description: String
    let dashboardKind: String
    let port: Int
    let messaging: [String]
    let label: String?
    let icon: String?
    let recommended: Bool

    var id: String { name }
    var title: String { displayName }
    var subtitle: String { description }
    var bestFor: String { label ?? (recommended ? "Recommended" : "Preview") }
    var systemIcon: String { icon ?? "sparkles" }

    static let fallback = [
        PlanAgent(
            name: "openclaw",
            displayName: "OpenClaw",
            description: "Gateway-based AI agent with plugin ecosystem.",
            dashboardKind: "ui",
            port: 18789,
            messaging: ["telegram", "discord", "slack", "wechat", "whatsapp"],
            label: "Browser UI sandbox",
            icon: "rectangle.connected.to.line.below",
            recommended: true
        ),
        PlanAgent(
            name: "hermes",
            displayName: "Hermes Agent",
            description: "Hermes Agent sandbox with an OpenAI-compatible local API endpoint.",
            dashboardKind: "api",
            port: 8642,
            messaging: ["telegram", "discord", "slack", "wechat", "whatsapp"],
            label: "Local API sandbox",
            icon: "curlybraces.square",
            recommended: false
        ),
    ]
}

struct ProviderOption: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let defaultModel: String
    let envVar: String?
    let guidance: String
    let systemImage: String
    let recommended: Bool
    let supportedAgents: [String]?

    static let fallbackAll: [ProviderOption] = [
        ProviderOption(
            id: "openai",
            title: "OpenAI",
            defaultModel: "gpt-5.4",
            envVar: "OPENAI_API_KEY",
            guidance: "OpenAI provider from the onboard catalog using its default model.",
            systemImage: "cloud",
            recommended: true,
            supportedAgents: nil
        ),
        ProviderOption(
            id: "anthropic",
            title: "Anthropic",
            defaultModel: "claude-sonnet-4-6",
            envVar: "ANTHROPIC_API_KEY",
            guidance: "Anthropic provider from the onboard catalog using its default model.",
            systemImage: "text.book.closed",
            recommended: false,
            supportedAgents: nil
        ),
        ProviderOption(
            id: "gemini",
            title: "Google Gemini",
            defaultModel: "gemini-2.5-flash",
            envVar: "GEMINI_API_KEY",
            guidance: "Google Gemini provider from the onboard catalog using its default model.",
            systemImage: "diamond",
            recommended: false,
            supportedAgents: nil
        ),
        ProviderOption(
            id: "build",
            title: "NVIDIA Endpoints",
            defaultModel: "nvidia/nemotron-3-super-120b-a12b",
            envVar: "NVIDIA_API_KEY",
            guidance: "NVIDIA-hosted inference using the curated onboard default.",
            systemImage: "cpu",
            recommended: false,
            supportedAgents: nil
        ),
        ProviderOption(
            id: "ollama",
            title: "Local Ollama",
            defaultModel: "nemotron-3-nano:30b",
            envVar: nil,
            guidance: "Local Ollama provider from the onboard catalog using its default model.",
            systemImage: "desktopcomputer",
            recommended: false,
            supportedAgents: nil
        ),
        ProviderOption(
            id: "hermesProvider",
            title: "Hermes Provider",
            defaultModel: "moonshotai/kimi-k2.6",
            envVar: "NOUS_API_KEY",
            guidance: "Use the Hermes stack as the model provider when installing Hermes Agent.",
            systemImage: "point.3.filled.connected.trianglepath.dotted",
            recommended: false,
            supportedAgents: ["hermes"]
        ),
    ]

    static func option(for id: String, in options: [ProviderOption]) -> ProviderOption {
        options.first { $0.id == id } ?? options.first ?? fallbackAll[0]
    }
}

struct SecurityChoice: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let icon: String
    let recommended: Bool
    let presets: [String]

    static let fallbackAll = [
        SecurityChoice(
            id: "restricted",
            title: "Careful",
            description: "Tighter defaults for first-time installs or sensitive machines.",
            icon: "lock.shield",
            recommended: false,
            presets: []
        ),
        SecurityChoice(
            id: "balanced",
            title: "Balanced",
            description: "Recommended. Gives the agent room to work while keeping sharp edges covered.",
            icon: "checkmark.shield",
            recommended: true,
            presets: []
        ),
        SecurityChoice(
            id: "open",
            title: "Open",
            description: "For trusted experiments where speed matters more than restraint.",
            icon: "lock.open",
            recommended: false,
            presets: []
        ),
    ]
}

struct PlanModel: Decodable {
    let defaultProvider: String
    let providers: [ProviderOption]
}

struct PlanTrust: Decodable {
    let defaultTier: String
    let tiers: [SecurityChoice]
}

struct PlanReview: Decodable {
    let handoffPolicy: String
    let stockOnly: String
}

struct PlanInstall: Decodable {
    let defaultSandboxName: String
    let defaultMode: String
}

struct MacInstallerPlan: Decodable {
    let source: String
    let target: String
    let summary: String
    let agents: [PlanAgent]
    let model: PlanModel
    let trust: PlanTrust
    let review: PlanReview
    let install: PlanInstall
}

struct ProgressEvent: Decodable, Identifiable {
    let id = UUID()
    let phase: String
    let status: String
    let message: String

    private enum CodingKeys: String, CodingKey {
        case phase
        case status
        case message
    }
}

struct Requirement: Decodable, Identifiable {
    let id: String
    let label: String
    let status: String
    let detail: String
    let recovery: String?
}

struct Assessment: Decodable {
    let supported: Bool
    let requirements: [Requirement]
    let recoveryActions: [String]
}

struct LaunchApiInfo: Decodable {
    let baseUrl: String
    let chatCompletionsUrl: String
    let healthUrl: String
    let token: String?
    let authHeader: String?
}

struct LaunchInfo: Decodable {
    let agent: String
    let sandboxName: String
    let kind: String
    let url: String
    let token: String?
    let terminalCommand: String?
    let api: LaunchApiInfo?
}

struct SecurityConfig: Encodable {
    let tier: String
}

struct MacInstallerInstallConfig: Encodable {
    let agent: String
    let sandboxName: String
    let provider: String
    let model: String
    let mode: String
    let security: SecurityConfig
    let messaging: [String]
}

@MainActor
final class MacInstallerModel: ObservableObject {
    @Published var selectedAgent = "openclaw"
    @Published var provider = "openai"
    @Published var model = "gpt-5.4"
    @Published var sandboxName = "nemoclaw-mac-preview"
    @Published var securityTier = "balanced"
    @Published var mode = "fresh"
    @Published var messaging = Set<String>()
    @Published var temporarySecret = ""
    @Published var events: [ProgressEvent] = []
    @Published var assessment: Assessment?
    @Published var resolvedPlan: MacInstallerPlan?
    @Published var isRunning = false
    @Published var lastError: String?
    @Published var launchInfo: LaunchInfo?
    @Published var activeStep: MacInstallerStep = .requirements
    @Published var lastCommand = "Mac Installer Preview is waiting"
    @Published var diagnosticsPath: String?

    let commandLogURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("nemoclaw-mac-installer-app.commands.log")
    let diagnosticsContextURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("nemoclaw-mac-installer-app-diagnostics", isDirectory: true)

    init() {
        if ProcessInfo.processInfo.environment["OPENAI_API_KEY"] == nil,
           ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"] != nil {
            provider = "anthropic"
            model = ProviderOption.option(for: "anthropic", in: providerOptions).defaultModel
        }
    }

    var agentChoices: [PlanAgent] {
        resolvedPlan?.agents.isEmpty == false ? resolvedPlan?.agents ?? PlanAgent.fallback : PlanAgent.fallback
    }

    var selectedAgentOption: PlanAgent {
        agentChoices.first { $0.name == selectedAgent } ?? agentChoices.first ?? PlanAgent.fallback[0]
    }

    var allProviderOptions: [ProviderOption] {
        resolvedPlan?.model.providers.isEmpty == false ? resolvedPlan?.model.providers ?? ProviderOption.fallbackAll : ProviderOption.fallbackAll
    }

    var providerOptions: [ProviderOption] {
        allProviderOptions.filter { option in
            option.supportedAgents?.contains(selectedAgent) ?? true
        }
    }

    var securityChoices: [SecurityChoice] {
        resolvedPlan?.trust.tiers.isEmpty == false ? resolvedPlan?.trust.tiers ?? SecurityChoice.fallbackAll : SecurityChoice.fallbackAll
    }

    var providerOption: ProviderOption {
        ProviderOption.option(for: provider, in: providerOptions)
    }

    var secretName: String? {
        providerOption.envVar
    }

    var secretState: String {
        guard let secretName else {
            return "No key needed for this provider."
        }
        if !temporarySecret.isEmpty {
            return "\(secretName) will be used once and not written into the install config."
        }
        if ProcessInfo.processInfo.environment[secretName]?.isEmpty == false {
            return "\(secretName) is already available to the app."
        }
        return "Paste \(secretName) here for this install, or choose a local provider."
    }

    var canDeploy: Bool {
        guard let secretName else { return true }
        return !temporarySecret.isEmpty || ProcessInfo.processInfo.environment[secretName]?.isEmpty == false
    }

    var cliURL: URL? {
        if let override = ProcessInfo.processInfo.environment["NEMOCLAW_MAC_INSTALLER_CLI"],
           !override.isEmpty {
            let url = URL(fileURLWithPath: override)
            if FileManager.default.isExecutableFile(atPath: url.path) {
                return url
            }
        }
        if let resourceURL = Bundle.main.resourceURL {
            let bundled = resourceURL
                .appendingPathComponent("payload")
                .appendingPathComponent("bin")
                .appendingPathComponent("nemoclaw.js")
            if FileManager.default.isExecutableFile(atPath: bundled.path) {
                return bundled
            }
        }
        return nil
    }

    var cliWorkingDirectory: URL? {
        guard let cliURL else { return nil }
        let root = cliURL.deletingLastPathComponent().deletingLastPathComponent()
        return FileManager.default.fileExists(atPath: root.appendingPathComponent("package.json").path)
            ? root
            : nil
    }

    var readinessText: String {
        guard let assessment else { return "I’ll check Docker, Colima, OpenShell, and your Mac." }
        if assessment.supported { return "This Mac is ready for the preview lane." }
        return "A few things need attention before Mac Installer Preview can install safely."
    }

    var friendlyIssueTitle: String {
        let error = (lastError ?? "").lowercased()
        if error.contains("endpoint validation failed") || error.contains("chat completions api") || error.contains("http 404") {
            return "The model provider needs attention"
        }
        if error.contains("provider") || error.contains("api_key") || error.contains("api key") || error.contains("credential") {
            return "This model provider needs a key"
        }
        if error.contains("docker") || error.contains("daemon") {
            return "Docker needs a moment"
        }
        if error.contains("no registered") || error.contains("run nemoclaw native-installer mac install first") {
            return "There isn’t an agent to launch yet"
        }
        if error.contains("no such file") || error.contains("cannot find") || error.contains("module_not_found") {
            return "Mac Installer Preview couldn’t find one of its helpers"
        }
        return "That step didn’t finish"
    }

    var friendlyIssueMessage: String {
        let error = (lastError ?? "").lowercased()
        if error.contains("endpoint validation failed") || error.contains("chat completions api") || error.contains("http 404") {
            return "Colima is reachable. The install stopped while checking the selected inference endpoint. Try a different provider, verify the model and key, or copy details for the exact onboard message."
        }
        if error.contains("provider") || error.contains("api_key") || error.contains("api key") || error.contains("credential") {
            return "Paste a temporary key for this session, or switch to a local provider. The key stays out of the JSON config."
        }
        if error.contains("docker") || error.contains("daemon") {
            return "Start Docker Desktop or Colima, then try again. Mac Installer Preview will not install a runtime behind your back."
        }
        if error.contains("no registered") || error.contains("run nemoclaw native-installer mac install first") {
            return "Run the install step first. Once the sandbox is registered, I’ll open the UI or show the Hermes endpoint."
        }
        if error.contains("no such file") || error.contains("cannot find") || error.contains("module_not_found") {
            return "The app bundle is missing something it expects. Export diagnostics and rebuild the preview bundle."
        }
        return "No panic. The technical details are saved in diagnostics, and you can retry or start fresh."
    }

    func go(_ step: MacInstallerStep) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.88)) {
            activeStep = step
        }
    }

    func next() {
        switch activeStep {
        case .requirements: go(.agent)
        case .agent: go(.model)
        case .model: go(.security)
        case .security: go(.review)
        case .review: install()
        case .deploy: go(.launch)
        case .launch: break
        }
    }

    func back() {
        switch activeStep {
        case .requirements: break
        case .agent: go(.requirements)
        case .model: go(.agent)
        case .security: go(.model)
        case .review: go(.security)
        case .deploy: go(.review)
        case .launch: go(.review)
        }
    }

    func selectProvider(_ option: ProviderOption) {
        provider = option.id
        model = option.defaultModel
        temporarySecret = ""
    }

    func alignProviderWithSelectedAgent() {
        guard !providerOptions.contains(where: { $0.id == provider }) else { return }
        let nextProvider = providerOptions.first { $0.id == resolvedPlan?.model.defaultProvider }
            ?? providerOptions.first { $0.recommended }
            ?? providerOptions.first
        if let nextProvider {
            selectProvider(nextProvider)
        }
    }

    func describeAndAssess() {
        describe {
            self.assess()
        }
    }

    func describe(completion: @escaping () -> Void = {}) {
        lastError = nil
        runCli(arguments: ["native-installer", "mac", "describe", "--json"]) { output, succeeded in
            defer { completion() }
            guard succeeded, let data = output.data(using: .utf8),
                  let plan = try? JSONDecoder().decode(MacInstallerPlan.self, from: data) else {
                return
            }
            self.resolvedPlan = plan
            self.applyPlanDefaults(plan)
            self.writeDiagnosticsFile(name: "resolved-plan.json", contents: output)
        }
    }

    func applyPlanDefaults(_ plan: MacInstallerPlan) {
        let recommendedAgent = plan.agents.first { $0.recommended } ?? plan.agents.first
        if let recommendedAgent, !plan.agents.contains(where: { $0.name == selectedAgent }) {
            selectedAgent = recommendedAgent.name
        }
        let eligibleProviders = plan.model.providers.filter { option in
            option.supportedAgents?.contains(selectedAgent) ?? true
        }
        let defaultProvider = eligibleProviders.first { $0.id == plan.model.defaultProvider }
            ?? eligibleProviders.first { $0.recommended }
            ?? eligibleProviders.first
        if let defaultProvider, !eligibleProviders.contains(where: { $0.id == provider }) {
            provider = defaultProvider.id
            model = defaultProvider.defaultModel
        }
        if !plan.trust.tiers.contains(where: { $0.id == securityTier }) {
            securityTier = plan.trust.defaultTier
        }
        if sandboxName == "nemoclaw-mac-preview" {
            sandboxName = plan.install.defaultSandboxName
        }
        mode = plan.install.defaultMode
    }

    func assess() {
        lastError = nil
        runCli(arguments: ["native-installer", "mac", "assess", "--json"]) { output, succeeded in
            guard succeeded, let data = output.data(using: .utf8),
                  let assessment = try? JSONDecoder().decode(Assessment.self, from: data) else {
                return
            }
            self.assessment = assessment
            self.writeDiagnosticsFile(name: "assessed-host.json", contents: output)
        }
    }

    func install() {
        guard canDeploy else {
            lastError = secretState
            go(.model)
            return
        }
        go(.deploy)
        let config = MacInstallerInstallConfig(
            agent: selectedAgent,
            sandboxName: sandboxName,
            provider: provider,
            model: model,
            mode: mode,
            security: SecurityConfig(tier: securityTier),
            messaging: Array(messaging).sorted()
        )
        let configURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("nemoclaw-mac-installer-\(UUID().uuidString).json")
        do {
            let data = try JSONEncoder().encode(config)
            try data.write(to: configURL, options: .atomic)
            if let text = String(data: data, encoding: .utf8) {
                writeDiagnosticsFile(name: "redacted-config.json", contents: text)
            }
        } catch {
            lastError = error.localizedDescription
            return
        }
        events = []
        launchInfo = nil
        runCli(arguments: ["native-installer", "mac", "install", "--config", configURL.path, "--json-progress"]) { output, succeeded in
            self.events = output
                .split(separator: "\n")
                .compactMap { line in
                    try? JSONDecoder().decode(ProgressEvent.self, from: Data(line.utf8))
                }
            if succeeded {
                self.launch()
            }
        }
    }

    func launch() {
        go(.launch)
        runCli(arguments: ["native-installer", "mac", "launch", "--agent", selectedAgent, "--json"]) { output, succeeded in
            guard succeeded, let data = output.data(using: .utf8),
                  let info = try? JSONDecoder().decode(LaunchInfo.self, from: data) else {
                return
            }
            self.launchInfo = info
        }
    }

    func exportDiagnostics() {
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("nemoclaw-mac-installer-diagnostics.tar.gz")
        runCli(arguments: ["diagnostics", "export", "--output", output.path, "--quick"]) { _, succeeded in
            if succeeded {
                self.diagnosticsPath = output.path
            }
        }
    }

    func startFresh() {
        events = []
        launchInfo = nil
        lastError = nil
        diagnosticsPath = nil
        mode = "fresh"
        sandboxName = resolvedPlan?.install.defaultSandboxName ?? "nemoclaw-mac-preview"
        go(.requirements)
    }

    func openLaunchURL() {
        if let urlString = launchInfo?.url, let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    func copy(_ value: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(value, forType: .string)
    }

    func writeDiagnosticsFile(name: String, contents: String) {
        let manager = FileManager.default
        try? manager.createDirectory(at: diagnosticsContextURL, withIntermediateDirectories: true)
        let safeName = name.replacingOccurrences(of: "/", with: "_")
        let target = diagnosticsContextURL.appendingPathComponent(safeName)
        if let data = contents.data(using: .utf8) {
            try? data.write(to: target, options: .atomic)
        }
    }

    func refreshDiagnosticsContext(cliURL: URL?) {
        writeDiagnosticsFile(name: "cli-path.txt", contents: cliURL?.path ?? "nemoclaw from PATH")
        if FileManager.default.fileExists(atPath: commandLogURL.path),
           let log = try? String(contentsOf: commandLogURL) {
            writeDiagnosticsFile(name: "app-command-log.txt", contents: log)
        }
    }

    func runCli(arguments: [String], completion: @escaping (String, Bool) -> Void) {
        isRunning = true
        lastError = nil
        diagnosticsPath = nil
        lastCommand = "nemoclaw \(arguments.joined(separator: " "))"
        let cliURL = self.cliURL
        let workingDirectory = self.cliWorkingDirectory
        refreshDiagnosticsContext(cliURL: cliURL)
        let env = commandEnvironment()
        let logURL = commandLogURL
        Task.detached {
            let process = Process()
            if let cliURL {
                process.executableURL = cliURL
                process.arguments = arguments
            } else {
                process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
                process.arguments = ["nemoclaw"] + arguments
            }
            process.currentDirectoryURL = workingDirectory
            process.environment = env
            let outputPipe = Pipe()
            let errorPipe = Pipe()
            process.standardOutput = outputPipe
            process.standardError = errorPipe
            do {
                try process.run()
                process.waitUntilExit()
                let output = String(data: outputPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let error = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                appendCommandLog(
                    logURL: logURL,
                    command: "nemoclaw \(arguments.joined(separator: " "))",
                    status: process.terminationStatus,
                    output: output,
                    error: error
                )
                await MainActor.run {
                    self.isRunning = false
                    let succeeded = process.terminationStatus == 0
                    if !succeeded {
                        self.lastError = error.isEmpty ? output : error
                    }
                    completion(output, succeeded)
                }
            } catch {
                appendCommandLog(
                    logURL: logURL,
                    command: "nemoclaw \(arguments.joined(separator: " "))",
                    status: -1,
                    output: "",
                    error: error.localizedDescription
                )
                await MainActor.run {
                    self.isRunning = false
                    self.lastError = error.localizedDescription
                    completion("", false)
                }
            }
        }
    }

    private func commandEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        let defaultPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        if let existing = env["PATH"], !existing.isEmpty {
            env["PATH"] = "\(defaultPath):\(existing)"
        } else {
            env["PATH"] = defaultPath
        }
        env["NEMOCLAW_MAC_INSTALLER_APP"] = "1"
        env["NEMOCLAW_MAC_INSTALLER_DIAGNOSTICS_DIR"] = diagnosticsContextURL.path
        if let secretName, !temporarySecret.isEmpty {
            env[secretName] = temporarySecret
        }
        return env
    }
}

private func appendCommandLog(
    logURL: URL,
    command: String,
    status: Int32,
    output: String,
    error: String
) {
    let entry = """

    ----- \(Date()) -----
    $ \(command)
    exit: \(status)
    stdout:
    \(output)
    stderr:
    \(error)
    """
    if let data = entry.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logURL.path),
           let handle = try? FileHandle(forWritingTo: logURL) {
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
            try? handle.close()
        } else {
            try? data.write(to: logURL)
        }
    }
}

extension Color {
    static let nvidiaGreen = Color(red: 0.46, green: 0.73, blue: 0.0)
    static let appleInk = Color(red: 0.06, green: 0.065, blue: 0.07)
    static let applePanel = Color(red: 0.96, green: 0.965, blue: 0.955)
    static let appleMist = Color(red: 0.90, green: 0.92, blue: 0.89)
}

struct CalmBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.94, green: 0.96, blue: 0.93),
                Color(red: 0.82, green: 0.86, blue: 0.80),
                Color(red: 0.18, green: 0.20, blue: 0.18),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.black.opacity(0.08))
                .frame(height: 1)
        }
        .ignoresSafeArea()
    }
}

struct ContentView: View {
    @StateObject private var model = MacInstallerModel()

    var body: some View {
        ZStack {
            CalmBackdrop()
            VStack(spacing: 0) {
                topBar
                ProgressDots(activeStep: model.activeStep)
                    .padding(.top, 12)
                Spacer(minLength: 18)
                GuideShell(model: model)
                    .frame(maxWidth: 900)
                Spacer(minLength: 18)
                footer
            }
            .padding(24)
        }
        .frame(minWidth: 980, minHeight: 720)
        .onAppear {
            model.describeAndAssess()
        }
    }

    var topBar: some View {
        HStack {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.nvidiaGreen)
                    .frame(width: 34, height: 34)
                    .overlay {
                        Image(systemName: "sparkles")
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(.black)
                    }
                VStack(alignment: .leading, spacing: 1) {
                    Text("NVIDIA")
                        .font(.system(size: 18, weight: .black, design: .rounded))
                    Text("NemoClaw Mac Installer Preview")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text("Experimental")
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.thinMaterial, in: Capsule())
        }
        .foregroundStyle(Color.appleInk)
    }

    var footer: some View {
        HStack {
            Text(model.lastCommand)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            if let diagnosticsPath = model.diagnosticsPath {
                Text("Diagnostics saved: \(diagnosticsPath)")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .frame(maxWidth: 900)
    }
}

struct ProgressDots: View {
    let activeStep: MacInstallerStep

    var body: some View {
        HStack(spacing: 10) {
            ForEach(MacInstallerStep.allCases) { step in
                HStack(spacing: 6) {
                    Circle()
                        .fill(step == activeStep ? Color.nvidiaGreen : Color.white.opacity(0.55))
                        .frame(width: step == activeStep ? 10 : 7, height: step == activeStep ? 10 : 7)
                    Text(step.rawValue)
                        .font(.system(size: 12, weight: step == activeStep ? .semibold : .regular))
                        .foregroundStyle(step == activeStep ? Color.appleInk : Color.appleInk.opacity(0.55))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
    }
}

struct GuideShell: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            guideHeader
            Divider()
            stepContent
            IssueCard(model: model)
            navigation
        }
        .padding(30)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.48), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.18), radius: 36, x: 0, y: 18)
        .animation(.spring(response: 0.38, dampingFraction: 0.88), value: model.activeStep)
    }

    var guideHeader: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: "wand.and.stars")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Color.nvidiaGreen)
                .frame(width: 54, height: 54)
                .background(Color.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appleInk)
                Text(subtitle)
                    .font(.system(size: 17))
                    .foregroundStyle(Color.appleInk.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
        }
    }

    var title: String {
        switch model.activeStep {
        case .requirements: return "Let’s make sure this Mac is ready."
        case .agent: return "What do you want to launch?"
        case .model: return "Choose how your agent should think."
        case .security: return "Pick the trust posture."
        case .review: return "Here’s the plan."
        case .deploy: return "I’m setting up the lane."
        case .launch: return "Your agent is ready."
        }
    }

    var subtitle: String {
        switch model.activeStep {
        case .requirements: return model.readinessText
        case .agent: return "I’ll keep this to the two supported preview paths: OpenClaw for a UI-first start, Hermes for an API-first start."
        case .model: return "Start with a recommended provider, or choose the local path if your model stack is already running."
        case .security: return "Balanced is the best default. You can tighten things down or open them up before install."
        case .review: return model.resolvedPlan?.review.handoffPolicy ?? "No provider keys will be stored in the JSON config."
        case .deploy: return "You can leave this window open. I’ll hand off to NemoClaw onboard and keep the technical details in diagnostics."
        case .launch: return "OpenClaw opens in the browser. Hermes gives you a local endpoint you can copy into tools."
        }
    }

    @ViewBuilder
    var stepContent: some View {
        switch model.activeStep {
        case .requirements:
            RequirementsStep(model: model)
        case .agent:
            AgentStep(model: model)
        case .model:
            ModelStep(model: model)
        case .security:
            SecurityStep(model: model)
        case .review:
            ReviewStep(model: model)
        case .deploy:
            DeployStep(model: model)
        case .launch:
            LaunchStep(model: model)
        }
    }

    var navigation: some View {
        HStack {
            if model.activeStep != .requirements {
                Button {
                    model.back()
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
            }
            Spacer()
            Button {
                model.startFresh()
            } label: {
                Label("Start Fresh", systemImage: "arrow.counterclockwise")
            }
            .buttonStyle(.borderless)
            Button {
                if model.activeStep == .requirements {
                    if model.assessment?.supported == true {
                        model.next()
                    } else {
                        model.assess()
                    }
                } else {
                    model.next()
                }
            } label: {
                if model.isRunning {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text(primaryActionTitle)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.nvidiaGreen)
            .disabled(model.isRunning || (model.activeStep == .model && !model.canDeploy))
        }
    }

    var primaryActionTitle: String {
        switch model.activeStep {
        case .requirements:
            return model.assessment?.supported == true ? "Continue" : "Check Again"
        case .agent: return "Continue"
        case .model: return "Continue"
        case .security: return "Review"
        case .review: return "Start Mac Installer Preview"
        case .deploy: return "Continue"
        case .launch: return "Done"
        }
    }
}

struct RequirementsStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let assessment = model.assessment {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2), spacing: 12) {
                    ForEach(assessment.requirements) { requirement in
                        ReadinessTile(requirement: requirement)
                    }
                }
                if !assessment.supported {
                    RecoveryActions(model: model)
                }
            } else {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Checking the local runtime...")
                        .foregroundStyle(.secondary)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.56), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }
}

struct ReadinessTile: View {
    let requirement: Requirement

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 5) {
                Text(requirement.label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.appleInk)
                Text(requirement.status == "pass" ? "Ready" : friendlyText)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appleInk.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
        }
        .padding(16)
        .frame(minHeight: 86, alignment: .top)
        .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    var icon: String {
        switch requirement.status {
        case "pass": return "checkmark.circle.fill"
        case "warn": return "exclamationmark.triangle.fill"
        default: return "xmark.circle.fill"
        }
    }

    var color: Color {
        switch requirement.status {
        case "pass": return .nvidiaGreen
        case "warn": return .orange
        default: return .red
        }
    }

    var friendlyText: String {
        requirement.recovery ?? requirement.detail
    }
}

struct AgentStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        HStack(spacing: 14) {
            ForEach(model.agentChoices) { agent in
                FriendlyChoiceCard(
                    title: agent.title,
                    badge: agent.bestFor,
                    description: agent.subtitle,
                    icon: agent.systemIcon,
                    selected: model.selectedAgent == agent.name
                ) {
                    model.selectedAgent = agent.name
                    model.alignProviderWithSelectedAgent()
                    model.messaging = model.messaging.intersection(Set(agent.messaging))
                }
            }
        }
    }
}

struct ModelStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                ForEach(model.providerOptions) { option in
                    FriendlyChoiceCard(
                        title: option.title,
                        badge: option.recommended ? "Recommended" : nil,
                        description: option.guidance,
                        icon: option.systemImage,
                        selected: model.provider == option.id
                    ) {
                        model.selectProvider(option)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("Model")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                TextField("Model", text: $model.model)
                    .textFieldStyle(.roundedBorder)
                if model.secretName != nil {
                    SecureField(model.secretName ?? "API key", text: $model.temporarySecret)
                        .textFieldStyle(.roundedBorder)
                }
                HStack(spacing: 8) {
                    Image(systemName: model.canDeploy ? "checkmark.shield.fill" : "key.fill")
                        .foregroundStyle(model.canDeploy ? Color.nvidiaGreen : .orange)
                    Text(model.secretState)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.appleInk.opacity(0.65))
                }
            }
            .padding(16)
            .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

struct SecurityStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                ForEach(model.securityChoices) { choice in
                    FriendlyChoiceCard(
                        title: choice.title,
                        badge: choice.recommended ? "Recommended" : nil,
                        description: choice.description,
                        icon: choice.icon,
                        selected: model.securityTier == choice.id
                    ) {
                        model.securityTier = choice.id
                    }
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("Messaging")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text("Choose where the preview should prepare integrations. You can skip these now and connect them later.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appleInk.opacity(0.62))
                HStack(spacing: 10) {
                    ForEach(model.selectedAgentOption.messaging, id: \.self) { channel in
                        ChipToggle(title: channel.capitalized, value: channel, selection: $model.messaging)
                    }
                }
            }
            .padding(16)
            .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

struct ReviewStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ReviewRow(icon: model.selectedAgentOption.systemIcon, title: "Agent", value: model.selectedAgentOption.title)
            ReviewRow(icon: model.providerOption.systemImage, title: "Model", value: "\(model.providerOption.title) · \(model.model)")
            ReviewRow(icon: "checkmark.shield", title: "Trust", value: "\(model.securityTier.capitalized) security · \(model.messaging.sorted().joined(separator: ", "))")
            ReviewRow(icon: "shippingbox", title: "Install", value: "\(model.mode.capitalized) sandbox named \(model.sandboxName)")
            Text(model.resolvedPlan?.review.stockOnly ?? "Mac Installer Preview only supports stock OpenClaw and stock Hermes.")
                .font(.system(size: 13))
                .foregroundStyle(Color.appleInk.opacity(0.62))
                .padding(.top, 4)
        }
        .padding(18)
        .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct DeployStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if model.isRunning {
                ProgressView("Preparing your agent")
                    .progressViewStyle(.linear)
                    .tint(Color.nvidiaGreen)
            }
            if model.events.isEmpty {
                Text("I’ll hand the plan to NemoClaw onboard, wait for it to finish, and then prepare the launch details.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.appleInk.opacity(0.68))
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                VStack(spacing: 10) {
                    ForEach(model.events) { event in
                        EventTile(event: event)
                    }
                }
            }
        }
    }
}

struct LaunchStep: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let info = model.launchInfo {
                if info.kind == "ui" {
                    LaunchCard(
                        icon: "safari.fill",
                        title: "OpenClaw is ready in your browser",
                        subtitle: info.url
                    ) {
                        model.openLaunchURL()
                    }
                    if let terminalCommand = info.terminalCommand {
                        CopyRow(title: "Terminal chat", value: terminalCommand, model: model)
                    }
                } else if let api = info.api {
                    LaunchCard(
                        icon: "curlybraces.square.fill",
                        title: "Hermes endpoint is ready",
                        subtitle: api.baseUrl
                    ) {
                        model.copy(api.baseUrl)
                    }
                    CopyRow(title: "Chat completions", value: api.chatCompletionsUrl, model: model)
                    CopyRow(title: "Health check", value: api.healthUrl, model: model)
                    if let authHeader = api.authHeader {
                        CopyRow(title: "Auth header", value: authHeader, model: model)
                    }
                }
            } else if model.isRunning {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Fetching launch details...")
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                Text("Install the agent first, then I’ll show the clean launch card here.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.appleInk.opacity(0.68))
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }
}

struct IssueCard: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        if model.lastError != nil {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "heart.text.square.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.friendlyIssueTitle)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color.appleInk)
                        Text(model.friendlyIssueMessage)
                            .font(.system(size: 14))
                            .foregroundStyle(Color.appleInk.opacity(0.68))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                HStack {
                    Button("Retry") {
                        switch model.activeStep {
                        case .requirements: model.assess()
                        case .deploy: model.install()
                        case .launch: model.launch()
                        default: model.lastError = nil
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.nvidiaGreen)
                    Button("Fix Docker") {
                        NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/Docker.app"))
                    }
                    .buttonStyle(.bordered)
                    Button("Export Diagnostics") {
                        model.exportDiagnostics()
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                    Button("Copy Details") {
                        model.copy(model.lastError ?? "")
                    }
                    .buttonStyle(.borderless)
                }
            }
            .padding(16)
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

struct RecoveryActions: View {
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        HStack {
            Button("Open Docker") {
                NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/Docker.app"))
            }
            .buttonStyle(.bordered)
            Button("Check Again") {
                model.assess()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.nvidiaGreen)
            Button("Export Diagnostics") {
                model.exportDiagnostics()
            }
            .buttonStyle(.bordered)
        }
        .padding(.top, 4)
    }
}

struct FriendlyChoiceCard: View {
    let title: String
    let badge: String?
    let description: String
    let icon: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    Image(systemName: icon)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(selected ? Color.appleInk : Color.nvidiaGreen)
                        .frame(width: 42, height: 42)
                        .background(selected ? Color.nvidiaGreen : Color.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Spacer()
                    if let badge {
                        Text(badge)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(selected ? .black : .secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(selected ? Color.nvidiaGreen.opacity(0.85) : Color.white.opacity(0.62), in: Capsule())
                    }
                }
                Text(title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.appleInk)
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appleInk.opacity(0.64))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 164, alignment: .topLeading)
            .background(selected ? Color.white.opacity(0.86) : Color.white.opacity(0.52), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(selected ? Color.nvidiaGreen : Color.white.opacity(0.46), lineWidth: selected ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
    }
}

struct ChipToggle: View {
    let title: String
    let value: String
    @Binding var selection: Set<String>

    var body: some View {
        Button {
            if selection.contains(value) {
                selection.remove(value)
            } else {
                selection.insert(value)
            }
        } label: {
            Label(title, systemImage: selection.contains(value) ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(selection.contains(value) ? Color.nvidiaGreen.opacity(0.22) : Color.white.opacity(0.56), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct ReviewRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Color.nvidiaGreen)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.appleInk)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.white.opacity(0.58), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct EventTile: View {
    let event: ProgressEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 3) {
                Text(friendlyPhase)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appleInk)
                Text(friendlyMessage)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appleInk.opacity(0.64))
            }
            Spacer()
        }
        .padding(14)
        .background(Color.white.opacity(0.62), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    var icon: String {
        switch event.status {
        case "ok": return "checkmark.circle.fill"
        case "warn": return "exclamationmark.triangle.fill"
        case "failed": return "xmark.circle.fill"
        default: return "clock.fill"
        }
    }

    var color: Color {
        switch event.status {
        case "ok": return .nvidiaGreen
        case "warn": return .orange
        case "failed": return .red
        default: return .secondary
        }
    }

    var friendlyPhase: String {
        switch event.phase {
        case "plan_loaded": return "Reading the plan"
        case "onboard_started": return "Starting onboarding"
        case "onboard_finished": return "Finishing onboarding"
        case "launch_ready": return "Preparing launch"
        case "failed": return "Needs attention"
        default: return event.phase.capitalized
        }
    }

    var friendlyMessage: String {
        return event.message
    }
}

struct LaunchCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Color.appleInk)
                .frame(width: 62, height: 62)
                .background(Color.nvidiaGreen, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appleInk)
                Text(subtitle)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(Color.appleInk.opacity(0.62))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            Button(title.contains("OpenClaw") ? "Open" : "Copy") {
                action()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.nvidiaGreen)
        }
        .padding(18)
        .background(Color.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct CopyRow: View {
    let title: String
    let value: String
    @ObservedObject var model: MacInstallerModel

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Color.appleInk.opacity(0.72))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            Button {
                model.copy(value)
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.bordered)
            .help("Copy")
        }
        .padding(14)
        .background(Color.white.opacity(0.58), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

@main
struct NemoClawMacInstallerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowStyle(.titleBar)
    }
}
