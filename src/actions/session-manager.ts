import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { stateAggregator } from "../agents/state-aggregator.js";
import type { AgentState, SpawnOptions } from "../agents/base-agent.js";
import { escapeXml } from "../utils/svg-utils.js";

/**
 * Structure for a saved session profile
 */
interface SessionProfile {
  /** Profile name */
  name: string;
  /** When the profile was created */
  createdAt: string;
  /** When the profile was last updated */
  updatedAt: string;
  /** Saved agent sessions */
  agents: SavedAgentSession[];
}

/**
 * Saved state for a single agent
 */
interface SavedAgentSession {
  /** Agent ID (e.g., "claude", "aider") */
  agentId: string;
  /** Working directory for the session */
  cwd?: string;
  /** Model being used */
  model?: string;
  /** Permission mode */
  mode?: string;
  /** Whether this agent was active when saved */
  wasActive: boolean;
}

/**
 * Settings for the Session Manager action
 */
type SessionManagerSettings = JsonObject & {
  /** Selected profile name */
  profileName?: string;
  /** Action mode: "save", "restore", or "toggle" */
  actionMode?: "save" | "restore" | "toggle";
  /** Button label override */
  label?: string;
};

/**
 * Messages from Property Inspector
 */
type SessionManagerPiMessage =
  | { type: "refresh" }
  | { type: "deleteProfile"; profileName: string }
  | { type: "saveProfile"; profileName: string };

/**
 * Session Manager Action
 *
 * Provides session persistence and restoration for Claude Deck.
 * - Save: Captures current agent states (running agents, working directories, models)
 * - Restore: Relaunches agents from a saved profile
 * - Toggle: Saves if no profile selected, restores if profile exists
 */
export class SessionManagerAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.session-manager";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, SessionManagerSettings>();
  private sessionsDir = join(homedir(), ".claude-deck", "sessions");

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as SessionManagerSettings) ?? {},
    );

    // Ensure sessions directory exists
    await mkdir(this.sessionsDir, { recursive: true });

    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as SessionManagerSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onPropertyInspectorDidAppear(): Promise<void> {
    await this.sendProfilesToPI();
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<SessionManagerPiMessage, SessionManagerSettings>,
  ): Promise<void> {
    const payload = ev.payload as SessionManagerPiMessage;

    if (payload?.type === "refresh") {
      await this.sendProfilesToPI();
    } else if (payload?.type === "deleteProfile" && payload.profileName) {
      await this.deleteProfile(payload.profileName);
      await this.sendProfilesToPI();
    } else if (payload?.type === "saveProfile" && payload.profileName) {
      await this.saveCurrentSession(payload.profileName);
      await this.sendProfilesToPI();
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const settings = this.getSettings(ev.action.id);
    const mode = settings.actionMode ?? "toggle";

    try {
      await ev.action.setTitle("...");

      if (mode === "save") {
        const profileName = settings.profileName || this.generateProfileName();
        await this.saveCurrentSession(profileName);
        await ev.action.showOk();
      } else if (mode === "restore") {
        if (!settings.profileName) {
          streamDeck.logger.warn(
            "SessionManager: No profile selected for restore",
          );
          await ev.action.showAlert();
          return;
        }
        await this.restoreSession(settings.profileName);
        await ev.action.showOk();
      } else {
        // Toggle mode: if profile exists and selected, restore; otherwise save
        if (settings.profileName) {
          const profile = await this.loadProfile(settings.profileName);
          if (profile) {
            await this.restoreSession(settings.profileName);
            await ev.action.showOk();
          } else {
            // Profile name set but doesn't exist - save new
            await this.saveCurrentSession(settings.profileName);
            await ev.action.showOk();
          }
        } else {
          // No profile selected - save with generated name
          const profileName = this.generateProfileName();
          await this.saveCurrentSession(profileName);
          // Update settings with the new profile name
          await ev.action.setSettings({
            ...settings,
            profileName,
          } as JsonObject);
          await ev.action.showOk();
        }
      }
    } catch (error) {
      streamDeck.logger.error("SessionManager action failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  // ============================================
  // Profile Management
  // ============================================

  /**
   * Save current session state to a profile
   */
  private async saveCurrentSession(profileName: string): Promise<void> {
    const aggregatedState = stateAggregator.getState();
    const savedAgents: SavedAgentSession[] = [];

    for (const [agentId, agentState] of aggregatedState.agents) {
      // Only save agents that are not disconnected
      if (agentState.status !== "disconnected") {
        savedAgents.push(
          this.agentStateToSaved(
            agentId,
            agentState,
            aggregatedState.activeAgentId,
          ),
        );
      }
    }

    const profile: SessionProfile = {
      name: profileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agents: savedAgents,
    };

    const filePath = this.profilePath(profileName);
    await writeFile(filePath, JSON.stringify(profile, null, 2), "utf-8");

    streamDeck.logger.info(
      `SessionManager: Saved profile "${profileName}" with ${savedAgents.length} agents`,
    );
  }

  /**
   * Restore a session from a saved profile
   */
  private async restoreSession(profileName: string): Promise<void> {
    const profile = await this.loadProfile(profileName);
    if (!profile) {
      throw new Error(`Profile "${profileName}" not found`);
    }

    streamDeck.logger.info(
      `SessionManager: Restoring profile "${profileName}" with ${profile.agents.length} agents`,
    );

    // Restore each agent
    for (const savedAgent of profile.agents) {
      try {
        const agent = stateAggregator.getAgent(savedAgent.agentId);
        if (!agent) {
          streamDeck.logger.warn(
            `SessionManager: Agent "${savedAgent.agentId}" not registered, skipping`,
          );
          continue;
        }

        // Check if agent is already running
        const isRunning = await agent.isRunning();
        if (isRunning) {
          streamDeck.logger.info(
            `SessionManager: Agent "${savedAgent.agentId}" already running, skipping spawn`,
          );
          continue;
        }

        // Build spawn options from saved state
        const spawnOptions: SpawnOptions = {
          cwd: savedAgent.cwd,
          model: savedAgent.model,
          continue: true, // Try to continue existing session
        };

        // Set permission mode if saved
        if (savedAgent.mode) {
          spawnOptions.permissionMode =
            savedAgent.mode as SpawnOptions["permissionMode"];
        }

        streamDeck.logger.info(
          `SessionManager: Spawning agent "${savedAgent.agentId}" in ${savedAgent.cwd}`,
        );
        await agent.spawnSession(spawnOptions);

        // Small delay between spawns to avoid terminal chaos
        await this.delay(500);
      } catch (error) {
        streamDeck.logger.error(
          `SessionManager: Failed to restore agent "${savedAgent.agentId}":`,
          error,
        );
      }
    }

    // Set the active agent if one was marked
    const wasActive = profile.agents.find((a) => a.wasActive);
    if (wasActive) {
      // Give agents time to start up before setting active
      await this.delay(1000);
      stateAggregator.setActiveAgent(wasActive.agentId);
    }
  }

  /**
   * Load a profile from disk
   */
  private async loadProfile(
    profileName: string,
  ): Promise<SessionProfile | null> {
    try {
      const filePath = this.profilePath(profileName);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as SessionProfile;
    } catch {
      return null;
    }
  }

  /**
   * Delete a profile
   */
  private async deleteProfile(profileName: string): Promise<void> {
    try {
      const filePath = this.profilePath(profileName);
      await unlink(filePath);
      streamDeck.logger.info(
        `SessionManager: Deleted profile "${profileName}"`,
      );
    } catch (error) {
      streamDeck.logger.error(
        `SessionManager: Failed to delete profile "${profileName}":`,
        error,
      );
    }
  }

  /**
   * List all saved profiles
   */
  private async listProfiles(): Promise<
    { name: string; updatedAt: string; agentCount: number }[]
  > {
    try {
      const files = await readdir(this.sessionsDir);
      const profiles: {
        name: string;
        updatedAt: string;
        agentCount: number;
      }[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = join(this.sessionsDir, file);
          const content = await readFile(filePath, "utf-8");
          const profile = JSON.parse(content) as SessionProfile;
          profiles.push({
            name: profile.name,
            updatedAt: profile.updatedAt,
            agentCount: profile.agents.length,
          });
        } catch {
          // Skip invalid files
        }
      }

      // Sort by most recently updated
      profiles.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return profiles;
    } catch {
      return [];
    }
  }

  // ============================================
  // UI Updates
  // ============================================

  /**
   * Send profile list to Property Inspector
   */
  private async sendProfilesToPI(): Promise<void> {
    const profiles = await this.listProfiles();
    await streamDeck.ui.sendToPropertyInspector({
      profiles,
    } as unknown as JsonValue);
  }

  /**
   * Update the button display
   */
  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const mode = settings.actionMode ?? "toggle";
    const label = settings.label || this.getModeLabel(mode);
    const profileName = settings.profileName;

    let statusText = "No Profile";
    let statusColor = "#64748b";

    if (profileName) {
      const profile = await this.loadProfile(profileName);
      if (profile) {
        statusText = this.truncate(profileName, 10);
        statusColor = "#22c55e";
      } else {
        statusText = "New";
        statusColor = "#f59e0b";
      }
    }

    const modeIcon = this.getModeIcon(mode);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Mode icon -->
        ${modeIcon}

        <!-- Profile name -->
        <text x="72" y="95" font-family="system-ui, sans-serif" font-size="12" fill="${statusColor}" text-anchor="middle" font-weight="bold">${escapeXml(statusText)}</text>

        <!-- Label -->
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">${escapeXml(label.toUpperCase())}</text>

        <!-- Mode indicator -->
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#475569" text-anchor="middle">${escapeXml(mode)}</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  // ============================================
  // Helpers
  // ============================================

  private getSettings(actionId: string): SessionManagerSettings {
    return this.settingsById.get(actionId) ?? {};
  }

  private profilePath(profileName: string): string {
    // Sanitize the profile name for use as a filename
    const safeName = profileName.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.sessionsDir, `${safeName}.json`);
  }

  private generateProfileName(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
    return `session-${date}-${time}`;
  }

  private agentStateToSaved(
    agentId: string,
    state: AgentState,
    activeAgentId: string | null,
  ): SavedAgentSession {
    return {
      agentId,
      model: state.model,
      mode: state.mode,
      wasActive: agentId === activeAgentId,
    };
  }

  private getModeLabel(mode: "save" | "restore" | "toggle"): string {
    switch (mode) {
      case "save":
        return "Save";
      case "restore":
        return "Restore";
      case "toggle":
        return "Session";
    }
  }

  private getModeIcon(mode: "save" | "restore" | "toggle"): string {
    if (mode === "save") {
      // Disk/save icon
      return `
        <path d="M45 35 L95 35 L105 45 L105 100 L45 100 Z" fill="#3b82f6" opacity="0.2"/>
        <path d="M45 35 L95 35 L105 45 L105 100 L45 100 Z" fill="none" stroke="#3b82f6" stroke-width="3"/>
        <rect x="55" y="35" width="40" height="25" fill="#3b82f6" opacity="0.3"/>
        <rect x="55" y="70" width="40" height="25" rx="3" fill="#3b82f6"/>
      `;
    } else if (mode === "restore") {
      // Restore/reload icon
      return `
        <circle cx="72" cy="55" r="25" fill="#22c55e" opacity="0.2"/>
        <path d="M72 35 A20 20 0 1 1 52 55" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round"/>
        <path d="M72 35 L72 25 L82 35 Z" fill="#22c55e"/>
      `;
    } else {
      // Toggle/sync icon
      return `
        <circle cx="72" cy="55" r="25" fill="#f59e0b" opacity="0.2"/>
        <path d="M57 45 A18 18 0 0 1 87 45" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
        <path d="M87 65 A18 18 0 0 1 57 65" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
        <path d="M57 45 L52 38 L62 40" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M87 65 L92 72 L82 70" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }
  }

  private truncate(str: string, max: number): string {
    return str.length <= max ? str : `${str.slice(0, max - 1)}...`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
