#!/usr/bin/env npx tsx
/**
 * Stream Deck Profile Generator
 *
 * Generates .streamDeckProfile files for all supported device types.
 * These profiles can be installed via the Stream Deck app or bundled with the plugin.
 *
 * Usage: npm run generate-profiles
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Archiver from "archiver";
import { createWriteStream } from "fs";
import { allLayouts, ProfileLayout } from "./profile-layouts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_DIR = join(
  __dirname,
  "../com.anthropic.claude-deck.sdPlugin"
);
// Profiles must be at plugin root for Stream Deck to find them
const PROFILES_DIR = PLUGIN_DIR;

// Ensure profiles directory exists
if (!existsSync(PROFILES_DIR)) {
  mkdirSync(PROFILES_DIR, { recursive: true });
}

/**
 * Generate a unique UUID for each action instance in the profile
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert row/column to Stream Deck position index
 */
function positionToIndex(
  row: number,
  column: number,
  columns: number
): number {
  return row * columns + column;
}

/**
 * Generate the profile manifest content
 */
function generateProfileManifest(layout: ProfileLayout): object {
  return {
    Name: layout.device.name,
    DeviceModel: layout.device.deviceType,
    DeviceUUID: "", // Filled in by Stream Deck on import
    Version: "1.0",
    CreationDate: new Date().toISOString(),
    AppVersion: "6.6.0",
  };
}

/**
 * Generate the actions array for the profile
 */
function generateActionsJson(layout: ProfileLayout): object {
  const actions: Record<string, object> = {};

  for (const action of layout.actions) {
    const position = positionToIndex(
      action.row,
      action.column,
      layout.device.columns
    );
    const instanceUUID = generateUUID();

    actions[position.toString()] = {
      Name: "",
      Settings: action.settings || {},
      State: 0,
      States: [
        {
          FFamily: "",
          FSize: 12,
          FStyle: "",
          FUnderline: false,
          Image: "",
          Title: "",
          TitleAlignment: "bottom",
          TitleColor: "#ffffff",
          TitleShow: true,
        },
      ],
      UUID: instanceUUID,
      Actions: {
        0: {
          UUID: action.uuid,
          Settings: action.settings || {},
        },
      },
    };
  }

  return actions;
}

/**
 * Generate the complete profile JSON structure
 */
function generateProfileJson(layout: ProfileLayout): object {
  return {
    Actions: generateActionsJson(layout),
    Name: layout.device.name,
    DeviceModel: layout.device.deviceType,
    DeviceUUID: "",
    Version: "2.0",
    Controllers: {
      Keypad: {
        Rows: layout.device.rows,
        Columns: layout.device.columns,
        Actions: generateActionsJson(layout),
      },
    },
  };
}

/**
 * Create a .streamDeckProfile file (ZIP archive)
 */
async function createProfileFile(layout: ProfileLayout): Promise<void> {
  const outputPath = join(PROFILES_DIR, layout.device.fileName);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = Archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(
        `  Created ${layout.device.fileName} (${archive.pointer()} bytes)`
      );
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add manifest.json
    const manifest = generateProfileManifest(layout);
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    // Add profile.json (main profile data)
    const profileData = generateProfileJson(layout);
    archive.append(JSON.stringify(profileData, null, 2), {
      name: "profiles/default.json",
    });

    archive.finalize();
  });
}

/**
 * Also generate JSON exports for documentation/inspection (optional, to debug directory)
 */
function createJsonExport(layout: ProfileLayout): void {
  // Export to a separate debug directory to avoid polluting the plugin directory
  const debugDir = join(__dirname, "../.profile-debug");
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true });
  }
  const jsonPath = join(
    debugDir,
    layout.device.fileName.replace(".streamDeckProfile", ".json")
  );
  const profileData = generateProfileJson(layout);
  writeFileSync(jsonPath, JSON.stringify(profileData, null, 2));
  console.log(`  Debug JSON: .profile-debug/${layout.device.fileName.replace(".streamDeckProfile", ".json")}`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("Generating Stream Deck profiles...\n");
  console.log(`Output directory: ${PROFILES_DIR}\n`);

  for (const layout of allLayouts) {
    console.log(`${layout.device.name}:`);
    console.log(
      `  Device type: ${layout.device.deviceType} (${layout.device.rows}x${layout.device.columns})`
    );
    console.log(`  Actions: ${layout.actions.length}`);

    await createProfileFile(layout);
    createJsonExport(layout);
    console.log("");
  }

  console.log("Profile generation complete!");
  console.log(`\nProfiles saved to: ${PROFILES_DIR}`);
  console.log("\nTo use these profiles:");
  console.log("1. Double-click a .streamDeckProfile file to import");
  console.log("2. Or drag into the Stream Deck app");
  console.log("3. Select the profile from the Profiles dropdown");
}

main().catch((err: Error) => {
  console.error("Error generating profiles:", err);
  process.exit(1);
});
