/**
 * Claude Code Agent Adapter
 *
 * Implements the BaseAgentAdapter for Claude Code CLI.
 * This is the reference implementation - other agents follow similar patterns.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  stat,
  readdir,
  unlink,
} from "node:fs/promises";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  BaseAgentAdapter,
  type AgentCapabilities,
  type AgentState,
  type AgentColor,
  type SpawnOptions,
  type TerminalType,
  type PermissionMode,
  AGENT_COLORS,
} from "./base-agent.js";
import {
  quotePosixShellArg,
  sendKeystroke as terminalSendKeystroke,
  sendText as terminalSendText,
  focusTerminal as terminalFocus,
  isTerminalFocused as terminalIsFocused,
  openInTerminal as terminalOpen,
} from "./terminal-utils.js";

const execFileAsync = promisify(execFile);

async function writeFileAtomic(path: string, contents: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, contents, { mode: 0o600 });
  await rename(tmpPath, path);
}

/**
 * Command file format for sending commands to Claude Code hooks
 */
interface ClaudeCommand {
  command:
    | "approve"
    | "reject"
    | "interrupt"
    | "mode-change"
    | "model-change"
    | "slash-command";
  payload?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Claude Code Agent Adapter
 */
export class ClaudeAgentAdapter extends BaseAgentAdapter {
  readonly id = "claude";
  readonly name = "Claude Code";
  readonly color: AgentColor = AGENT_COLORS.claude;
  readonly command = "claude";
  readonly processNames = ["claude"];

  readonly capabilities: AgentCapabilities = {
    approve: true,
    reject: true,
    interrupt: true,
    modelSwitch: true,
    modeSwitch: true,
    yoloMode: true,
    planMode: true,
    thinkingToggle: true,
    slashCommands: [
      "/commit",
      "/review",
      "/init",
      "/doctor",
      "/help",
      "/config",
    ],
    stateFile: true,
  };

  private configDir: string;
  private statePath: string;
  private sessionsDir: string;
  private commandPath: string;
  private configPath: string;
  private currentState: AgentState;
  private terminalType: TerminalType = "kitty";

  private stateWatcher?: FSWatcher;
  private statePoller?: ReturnType<typeof setInterval>;
  private stateDebounceTimer?: ReturnType<typeof setTimeout>;
  private lastEmittedUpdatedAt = 0;
  private transcriptEnrichAt = 0;
  private transcriptEnrichInFlight?: Promise<void>;
  private cachedTranscriptPath?: string;
  private cachedTranscriptPathAt = 0;
  private cleanupTick = 0;

  constructor() {
    super();
    this.configDir = join(homedir(), ".claude-deck");
    this.statePath = join(this.configDir, "state.json");
    this.sessionsDir = join(this.configDir, "sessions");
    this.commandPath = join(this.configDir, "commands.json");
    this.configPath = join(this.configDir, "config.json");
    this.currentState = this.getDefaultState();
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  async isInstalled(): Promise<boolean> {
    try {
      await execFileAsync("which", ["claude"]);
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      await execFileAsync("pgrep", ["-x", "claude"]);
      return true;
    } catch {
      return false;
    }
  }

  async detectSession(): Promise<AgentState | null> {
    const state = await this.refreshState();
    if (state.status === "disconnected") return null;
    return state;
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true });
    }

    // Ensure sessions directory exists for per-session state files
    if (!existsSync(this.sessionsDir)) {
      await mkdir(this.sessionsDir, { recursive: true });
    }

    // Load configuration
    await this.loadConfig();

    // Write initial state if it doesn't exist
    if (!existsSync(this.statePath)) {
      await this.writeState(this.currentState);
    } else {
      await this.refreshState();
    }

    this.startWatching();
  }

  dispose(): void {
    this.stopWatching();
  }

  // ============================================
  // Session Control
  // ============================================

  async spawnSession(options?: SpawnOptions): Promise<void> {
    const args: string[] = [];

    if (options?.permissionMode === "bypassPermissions") {
      args.push("--dangerously-skip-permissions");
    } else if (options?.permissionMode) {
      args.push("--permission-mode", options.permissionMode);
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    if (options?.continue) {
      args.push("-c");
    }

    const commandParts = ["claude", ...args];
    if (options?.prompt) commandParts.push(options.prompt);

    const command = commandParts.map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd);
  }

  async continueSession(options?: { cwd?: string }): Promise<void> {
    const command = ["claude", "-c"].map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd);
  }

  // ============================================
  // Input Control
  // ============================================

  async approve(): Promise<boolean> {
    await this.sendCommandFile({
      command: "approve",
      timestamp: new Date().toISOString(),
    });
    return this.sendKeystroke("y");
  }

  async reject(): Promise<boolean> {
    await this.sendCommandFile({
      command: "reject",
      timestamp: new Date().toISOString(),
    });
    return this.sendKeystroke("n");
  }

  async interrupt(): Promise<boolean> {
    return this.sendKeystroke("c", ["control"]);
  }

  async sendKeystroke(key: string, modifiers: string[] = []): Promise<boolean> {
    return terminalSendKeystroke(this.terminalType, key, modifiers);
  }

  async sendCommand(command: string): Promise<boolean> {
    return this.sendText(command);
  }

  async sendText(text: string): Promise<boolean> {
    return terminalSendText(this.terminalType, text);
  }

  // ============================================
  // Mode/Model Control
  // ============================================

  async cycleMode(): Promise<boolean> {
    // Shift+Tab cycles permission modes in Claude
    return this.sendKeystroke("tab", ["shift"]);
  }

  async cycleModel(): Promise<boolean> {
    // Alt+P (Option+P) switches models in Claude
    return this.sendKeystroke("p", ["option"]);
  }

  async toggleThinking(): Promise<boolean> {
    // Alt+T (Option+T) toggles extended thinking
    return this.sendKeystroke("t", ["option"]);
  }

  // ============================================
  // State Management
  // ============================================

  getState(): AgentState {
    return this.currentState;
  }

  async refreshState(): Promise<AgentState> {
    try {
      const sessionFile = await this.findActiveSessionFile();
      const content = await readFile(sessionFile, "utf-8");
      const fileState = JSON.parse(content);

      // Save previous session start time before overwriting state
      const prevSessionStartTime = this.currentState.sessionStartTime;

      // Map file state to AgentState format
      this.currentState = {
        id: this.id,
        name: this.name,
        active: false, // Set by StateAggregator based on terminal focus
        status:
          fileState.sessionActive === false
            ? "disconnected"
            : (fileState.status ?? "idle"),
        hasPermissionPending: !!fileState.pendingPermission,
        model: fileState.currentModel,
        mode: fileState.permissionMode,
        contextPercent: fileState.contextPercent,
        cost: fileState.sessionCost,
        tokens: fileState.tokens,
        lastUpdated: fileState.lastUpdated ?? new Date().toISOString(),
        sessionStartTime: fileState.sessionStartTime,
        lastActivityTime: fileState.lastActivityTime,
        pendingPermission: fileState.pendingPermission,
        toolUsage: fileState.toolUsage,
        hotFiles: fileState.hotFiles,
        contextSize: fileState.contextSize,
        contextUsed: fileState.contextUsed,
        toolCallCount: fileState.toolCallCount,
        lastTool: fileState.lastTool,
      };

      // Staleness detection: if state claims "working"/"waiting" but no activity
      // for 60+ seconds, verify the process is actually alive.  If the claude
      // process is gone, reset to idle so the Stream Deck doesn't show a
      // perpetually-stuck state.
      if (
        (this.currentState.status === "working" ||
          this.currentState.status === "waiting") &&
        this.currentState.lastActivityTime
      ) {
        const lastActivity = new Date(
          this.currentState.lastActivityTime,
        ).getTime();
        if (Date.now() - lastActivity > 60_000) {
          const pid = fileState.claudePid;
          const alive = pid
            ? await this.isProcessAlive(pid)
            : await this.isRunning();
          if (!alive) {
            this.currentState.status = "idle";
            this.currentState.hasPermissionPending = false;
            this.currentState.pendingPermission = undefined;
          }
        }
      }

      // If session changed, reset enriched data so we don't carry stale info
      if (
        fileState.sessionStartTime &&
        fileState.sessionStartTime !== prevSessionStartTime
      ) {
        this.transcriptEnrichAt = 0; // Force re-enrichment from scratch
      }

      await this.enrichStateFromLatestTranscript();
      return this.currentState;
    } catch {
      this.currentState = this.getDefaultState();
      return this.currentState;
    }
  }

  startWatching(): void {
    const scheduleRefresh = (): void => {
      if (this.stateDebounceTimer) clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = setTimeout(() => {
        void this.refreshState()
          .then((state) => {
            const updatedAt = Number.isFinite(Date.parse(state.lastUpdated))
              ? Date.parse(state.lastUpdated)
              : Date.now();
            if (updatedAt <= this.lastEmittedUpdatedAt) return;
            this.lastEmittedUpdatedAt = updatedAt;
            this.emit("stateChange", state);
          })
          .catch(() => {
            // ignore
          });
      }, 100);
    };

    try {
      this.stateWatcher?.close();
      // Prefer watching sessions dir for per-session state files; fall back
      // to config dir (for state.json backward compat) if sessions dir
      // doesn't exist yet.
      const watchDir = existsSync(this.sessionsDir)
        ? this.sessionsDir
        : this.configDir;
      this.stateWatcher = watch(watchDir, (_eventType, filename) => {
        if (!filename || filename.endsWith(".json")) {
          scheduleRefresh();
        }
      });
    } catch {
      // ignore; fallback poller will handle updates
    }

    // Low-frequency poller as a safety net (1.5 s for snappier recovery when
    // fs.watch misses an event after an atomic rename)
    if (!this.statePoller) {
      // NOTE: For non-Claude agents, polling should ideally be demand-driven
      // (only when action buttons are visible on the Stream Deck).
      this.statePoller = setInterval(() => {
        scheduleRefresh();
        // Periodically clean up session files for dead processes
        if (++this.cleanupTick % 10 === 0) {
          void this.cleanupStaleSessions();
        }
      }, 1500);
    }
  }

  stopWatching(): void {
    if (this.stateWatcher) {
      this.stateWatcher.close();
      this.stateWatcher = undefined;
    }
    if (this.statePoller) {
      clearInterval(this.statePoller);
      this.statePoller = undefined;
    }
    if (this.stateDebounceTimer) {
      clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = undefined;
    }
  }

  // ============================================
  // Terminal Control
  // ============================================

  async focusTerminal(): Promise<void> {
    await terminalFocus(this.terminalType);
  }

  async isTerminalFocused(): Promise<boolean> {
    return terminalIsFocused(this.terminalType);
  }

  // ============================================
  // Claude-Specific Methods
  // ============================================

  /**
   * Get Claude Code version
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("claude", ["--version"]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Set the terminal type for this adapter
   */
  setTerminalType(type: TerminalType): void {
    this.terminalType = type;
  }

  /**
   * Get the current terminal type
   */
  getTerminalType(): TerminalType {
    return this.terminalType;
  }

  /**
   * Set permission mode (updates local state)
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    const fileState = await this.loadStateFile();
    fileState.permissionMode = mode;
    await this.writeState(fileState);
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Find the most recently updated session file in the sessions directory,
   * preferring files whose claude process is still alive.
   * Falls back to the global state.json if no session files exist.
   */
  private async findActiveSessionFile(): Promise<string> {
    try {
      const files = await readdir(this.sessionsDir);
      const jsonFiles = files.filter(
        (f) => f.endsWith(".json") && !f.endsWith(".lock"),
      );
      if (jsonFiles.length === 0) return this.statePath;

      // Sort by mtime descending (newest first)
      const fileInfos: { path: string; mtime: number }[] = [];
      for (const f of jsonFiles) {
        const fullPath = join(this.sessionsDir, f);
        try {
          const s = await stat(fullPath);
          fileInfos.push({ path: fullPath, mtime: s.mtimeMs });
        } catch {
          /* skip */
        }
      }
      fileInfos.sort((a, b) => b.mtime - a.mtime);

      // Prefer the newest session file whose process is still alive
      for (const info of fileInfos) {
        try {
          const content = await readFile(info.path, "utf-8");
          const parsed = JSON.parse(content);
          const pid = parsed.claudePid;
          if (pid) {
            try {
              process.kill(pid, 0);
              return info.path; // Process alive, use this session
            } catch {
              continue; // Process dead, try next
            }
          }
        } catch {
          /* skip unreadable files */
        }
      }

      // No alive sessions found -- fall back to newest file anyway
      // (cleanupStaleSessions will remove dead ones eventually)
      if (fileInfos.length > 0) return fileInfos[0].path;
      return this.statePath;
    } catch {
      return this.statePath;
    }
  }

  /**
   * Check if a specific process is alive by PID.
   */
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove session files for processes that are no longer alive.
   */
  private async cleanupStaleSessions(): Promise<void> {
    try {
      const files = await readdir(this.sessionsDir);
      for (const f of files) {
        if (!f.endsWith(".json") || f.endsWith(".lock")) continue;
        const pid = parseInt(f.replace(".json", ""), 10);
        if (isNaN(pid)) continue;
        try {
          process.kill(pid, 0); // Check if alive — throws if dead
        } catch {
          // Process is dead, remove stale session file
          try {
            await unlink(join(this.sessionsDir, f));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      if (existsSync(this.configPath)) {
        const content = await readFile(this.configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.terminal?.type) {
          this.terminalType = config.terminal.type;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async loadStateFile(): Promise<Record<string, unknown>> {
    try {
      const content = await readFile(this.statePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {
        sessionActive: false,
        currentModel: "sonnet",
        permissionMode: "default",
        status: "idle",
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  private async writeState(
    state: AgentState | Record<string, unknown>,
  ): Promise<void> {
    const stateToWrite = { ...state, lastUpdated: new Date().toISOString() };
    await mkdir(this.configDir, { recursive: true });
    await writeFileAtomic(
      this.statePath,
      JSON.stringify(stateToWrite, null, 2),
    );
  }

  private async sendCommandFile(command: ClaudeCommand): Promise<void> {
    command.timestamp = command.timestamp ?? new Date().toISOString();
    await writeFileAtomic(this.commandPath, JSON.stringify(command, null, 2));
  }

  private async openInTerminal(command: string, cwd?: string): Promise<void> {
    await terminalOpen(this.terminalType, command, cwd);
  }

  private async enrichStateFromLatestTranscript(): Promise<void> {
    const now = Date.now();
    if (now - this.transcriptEnrichAt < 5000) return;
    if (this.transcriptEnrichInFlight) return this.transcriptEnrichInFlight;

    const fileState = this.currentState;
    const needs =
      fileState.status !== "disconnected" &&
      fileState.status !== "idle" &&
      (!this.currentState.toolUsage ||
        Object.keys(this.currentState.toolUsage).length === 0);

    if (!needs) {
      this.transcriptEnrichAt = now;
      return;
    }

    this.transcriptEnrichInFlight = (async () => {
      try {
        let newestPath = "";

        // Check if cached transcript is still valid (re-scan at most every 30s)
        if (
          this.cachedTranscriptPath &&
          Date.now() - this.cachedTranscriptPathAt < 30_000
        ) {
          try {
            const s = await stat(this.cachedTranscriptPath);
            if (s.mtimeMs > Date.now() - 60_000) {
              // Use cached path
              newestPath = this.cachedTranscriptPath;
            }
          } catch {
            this.cachedTranscriptPath = undefined; // file gone, re-scan
          }
        }

        if (!newestPath) {
          const projectsDir = join(homedir(), ".claude", "projects");
          const { stdout } = await execFileAsync("find", [
            projectsDir,
            "-name",
            "*.jsonl",
            "-mmin",
            "-60",
            "-print",
          ]);
          const candidates = stdout.split("\n").filter(Boolean);
          if (candidates.length === 0) return;

          let newestMtime = 0;
          for (const p of candidates) {
            try {
              const s = await stat(p);
              if (s.mtimeMs > newestMtime) {
                newestMtime = s.mtimeMs;
                newestPath = p;
              }
            } catch {
              // ignore
            }
          }
          if (!newestPath) return;

          this.cachedTranscriptPath = newestPath;
          this.cachedTranscriptPathAt = Date.now();
        }

        const toolUsage: Record<string, number> = {
          ...(this.currentState.toolUsage ?? {}),
        };
        const hotFiles = new Set<string>(this.currentState.hotFiles ?? []);
        const tokens = this.currentState.tokens ?? { input: 0, output: 0 };

        const rl = createInterface({
          input: createReadStream(newestPath),
          crlfDelay: Infinity,
        });
        const lastLines: string[] = [];
        const keep = 250;
        for await (const line of rl) {
          if (!line) continue;
          lastLines.push(line);
          if (lastLines.length > keep) lastLines.shift();
        }
        rl.close();

        for (const line of lastLines) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const toolNameSnake = obj["tool_name"];
            const tool =
              (typeof obj.tool === "string" && obj.tool) ||
              (typeof obj.toolName === "string" && obj.toolName) ||
              (typeof toolNameSnake === "string" && toolNameSnake) ||
              (typeof obj.name === "string" && obj.name) ||
              "";
            if (tool) toolUsage[tool] = (toolUsage[tool] ?? 0) + 1;

            const pathValue = obj["path"];
            const fileValue = obj["file"];
            const filepathValue = obj["filepath"];
            const filenameValue = obj["filename"];
            const path =
              (typeof pathValue === "string" && pathValue) ||
              (typeof fileValue === "string" && fileValue) ||
              (typeof filepathValue === "string" && filepathValue) ||
              (typeof filenameValue === "string" && filenameValue) ||
              "";
            if (path && hotFiles.size < 10) hotFiles.add(path);

            const usage = obj["usage"];
            if (usage && typeof usage === "object") {
              const usageObj = usage as Record<string, unknown>;
              const inputTokens =
                usageObj["input_tokens"] ??
                usageObj["input"] ??
                usageObj["prompt_tokens"];
              const outputTokens =
                usageObj["output_tokens"] ??
                usageObj["output"] ??
                usageObj["completion_tokens"];
              if (typeof inputTokens === "number")
                tokens.input = Math.max(tokens.input, inputTokens);
              if (typeof outputTokens === "number")
                tokens.output = Math.max(tokens.output, outputTokens);
            }
          } catch {
            // ignore
          }
        }

        this.currentState.toolUsage = toolUsage;
        this.currentState.hotFiles = [...hotFiles].slice(0, 10);
        this.currentState.tokens = tokens;
      } catch {
        // ignore
      } finally {
        this.transcriptEnrichAt = Date.now();
        this.transcriptEnrichInFlight = undefined;
      }
    })();

    return this.transcriptEnrichInFlight;
  }
}

// Singleton instance
export const claudeAgent = new ClaudeAgentAdapter();
