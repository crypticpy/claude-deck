/**
 * Terminal Utilities - Shared terminal control functions for all agents
 *
 * This module provides common terminal control functionality used by
 * multiple agent adapters, reducing code duplication.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import type { TerminalType } from "./base-agent.js";

const execFileAsync = promisify(execFile);
const isMacOS = process.platform === "darwin";

/**
 * Quote a string for safe use in POSIX shell commands
 */
export function quotePosixShellArg(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Run an AppleScript with optional arguments
 */
export async function runOsascript(
  script: string,
  argv: string[] = [],
): Promise<void> {
  await execFileAsync("osascript", ["-e", script, ...argv]);
}

/**
 * Terminal app names for AppleScript
 */
export const TERMINAL_APP_NAMES: Record<TerminalType, string> = {
  kitty: "kitty",
  ghostty: "Ghostty",
  iterm: "iTerm",
  terminal: "Terminal",
  wezterm: "WezTerm",
  alacritty: "Alacritty",
};

/**
 * Terminal process names for System Events
 */
export const TERMINAL_PROCESS_NAMES: Record<TerminalType, string> = {
  kitty: "kitty",
  ghostty: "Ghostty",
  iterm: "iTerm2",
  terminal: "Terminal",
  wezterm: "WezTerm",
  alacritty: "Alacritty",
};

/**
 * macOS key codes for AppleScript
 */
export const KEY_CODES: Record<string, number> = {
  a: 0,
  b: 11,
  c: 8,
  d: 2,
  e: 14,
  f: 3,
  g: 5,
  h: 4,
  i: 34,
  j: 38,
  k: 40,
  l: 37,
  m: 46,
  n: 45,
  o: 31,
  p: 35,
  q: 12,
  r: 15,
  s: 1,
  t: 17,
  u: 32,
  v: 9,
  w: 13,
  x: 7,
  y: 16,
  z: 6,
  "0": 29,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "5": 23,
  "6": 22,
  "7": 26,
  "8": 28,
  "9": 25,
  return: 36,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
};

/**
 * Send a keystroke to the specified terminal
 */
export async function sendKeystroke(
  terminalType: TerminalType,
  key: string,
  modifiers: string[] = [],
): Promise<boolean> {
  try {
    if (!isMacOS) return false;
    const processName = TERMINAL_PROCESS_NAMES[terminalType];

    const keyCode = KEY_CODES[key.toLowerCase()];
    if (keyCode === undefined) {
      console.error(`Unknown key: ${key}`);
      return false;
    }
    let keyPress = `key code ${keyCode}`;
    if (modifiers.length > 0) {
      const modString = modifiers.map((m) => `${m} down`).join(", ");
      keyPress += ` using {${modString}}`;
    }

    const script = `
      on run argv
        set processName to item 1 of argv
        tell application "System Events"
          if exists process processName then
            set frontmost of process processName to true
            delay 0.05
            tell process processName
              ${keyPress}
            end tell
          end if
        end tell
      end run
    `;

    await runOsascript(script, [processName]);
    return true;
  } catch (error) {
    console.error("Failed to send keystroke:", error);
    return false;
  }
}

/**
 * Send text to the specified terminal (types it out and presses Enter)
 */
export async function sendText(
  terminalType: TerminalType,
  text: string,
): Promise<boolean> {
  try {
    if (!isMacOS) return false;
    const processName = TERMINAL_PROCESS_NAMES[terminalType];

    const script = `
      on run argv
        set processName to item 1 of argv
        set textToType to item 2 of argv
        tell application "System Events"
          if exists process processName then
            set frontmost of process processName to true
            delay 0.05
            keystroke textToType
            delay 0.05
            keystroke return
          end if
        end tell
      end run
    `;

    await runOsascript(script, [processName, text]);
    return true;
  } catch (error) {
    console.error("Failed to send text:", error);
    return false;
  }
}

/**
 * Focus the specified terminal window
 */
export async function focusTerminal(terminalType: TerminalType): Promise<void> {
  if (!isMacOS) return;
  const appName = TERMINAL_APP_NAMES[terminalType];
  const script = `
    on run argv
      set appName to item 1 of argv
      tell application appName to activate
    end run
  `;
  await runOsascript(script, [appName]);
}

/**
 * Check if the specified terminal is currently focused
 */
export async function isTerminalFocused(
  terminalType: TerminalType,
): Promise<boolean> {
  if (!isMacOS) return false;
  const front = await getFrontmostAppName();
  return (
    front === TERMINAL_APP_NAMES[terminalType] ||
    front === TERMINAL_PROCESS_NAMES[terminalType]
  );
}

/**
 * Get the name of the frontmost application
 */
export async function getFrontmostAppName(): Promise<string | null> {
  if (!isMacOS) return null;
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        return frontApp
      end tell
    `;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Open a command in a new terminal window
 */
export async function openInTerminal(
  terminalType: TerminalType,
  command: string,
  cwd?: string,
): Promise<void> {
  if (!isMacOS) throw new Error("openInTerminal is only supported on macOS");

  const cwdToUse = cwd ?? homedir();

  switch (terminalType) {
    case "kitty":
      await execFileAsync("kitty", [
        "--single-instance",
        "--directory",
        cwdToUse,
        "sh",
        "-c",
        `${command}; exec $SHELL`,
      ]);
      break;

    case "ghostty": {
      // Try the ghostty CLI first (works whether or not the app is running)
      try {
        await execFileAsync("ghostty", [
          "-e",
          "sh",
          "-c",
          `cd ${quotePosixShellArg(cwdToUse)}; ${command}; exec $SHELL`,
        ]);
      } catch {
        // Fallback to AppleScript for opening a new window
        await runOsascript(
          `
          on run argv
            set cmd to item 1 of argv
            tell application "Ghostty"
              activate
            end tell
            tell application "System Events"
              tell process "Ghostty"
                keystroke "n" using command down
                delay 0.3
              end tell
            end tell
            tell application "System Events"
              keystroke cmd
              keystroke return
            end tell
          end run
          `,
          [`cd ${quotePosixShellArg(cwdToUse)}; ${command}`],
        );
      }
      break;
    }

    case "iterm":
      await runOsascript(
        `
        on run argv
          set cmd to item 1 of argv
          tell application "iTerm"
            activate
            create window with default profile
            tell current session of current window
              write text cmd
            end tell
          end tell
        end run
        `,
        [`cd ${quotePosixShellArg(cwdToUse)}; ${command}`],
      );
      break;

    case "terminal":
      await runOsascript(
        `
        on run argv
          set cmd to item 1 of argv
          tell application "Terminal"
            activate
            do script cmd
          end tell
        end run
        `,
        [`cd ${quotePosixShellArg(cwdToUse)}; ${command}`],
      );
      break;

    case "wezterm":
      await execFileAsync("wezterm", [
        "start",
        "--cwd",
        cwdToUse,
        "--",
        "sh",
        "-c",
        `${command}; exec $SHELL`,
      ]);
      break;

    case "alacritty":
      await execFileAsync("alacritty", [
        "-e",
        "sh",
        "-c",
        `cd ${quotePosixShellArg(cwdToUse)}; ${command}; exec $SHELL`,
      ]);
      break;

    default:
      await execFileAsync("open", ["-a", "Terminal"]);
      await runOsascript(
        `
        on run argv
          set cmd to item 1 of argv
          tell application "Terminal"
            activate
            do script cmd
          end tell
        end run
        `,
        [`cd ${quotePosixShellArg(cwdToUse)}; ${command}`],
      );
  }
}
