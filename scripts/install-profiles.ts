#!/usr/bin/env npx tsx
/**
 * Install Claude Deck Profiles Directly to Stream Deck
 *
 * Creates profile folders in the Stream Deck ProfilesV3 directory
 * with the correct format that Stream Deck expects.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import { allLayouts, ProfileLayout } from "./profile-layouts.js";

const STREAMDECK_DIR = join(
  homedir(),
  "Library/Application Support/com.elgato.StreamDeck"
);
const PROFILES_DIR = join(STREAMDECK_DIR, "ProfilesV3");

// Find the device profile folder
function findDeviceProfile(): string | null {
  if (!existsSync(PROFILES_DIR)) return null;
  const folders = readdirSync(PROFILES_DIR).filter((f) =>
    f.endsWith(".sdProfile")
  );
  return folders.length > 0 ? join(PROFILES_DIR, folders[0]) : null;
}

// Generate action entry in Stream Deck format
function generateAction(uuid: string, settings: Record<string, unknown> = {}) {
  return {
    ActionID: randomUUID(),
    LinkedTitle: true,
    Name: "",
    Plugin: {
      Name: "Claude Deck",
      UUID: "com.anthropic.claude-deck",
      Version: "0.1.0.0",
    },
    Resources: null,
    Settings: settings,
    State: 0,
    States: [
      {
        FontFamily: "",
        FontSize: 12,
        FontStyle: "",
        FontUnderline: false,
        OutlineThickness: 2,
        ShowTitle: true,
        TitleAlignment: "bottom",
        TitleColor: "#FFFFFF",
      },
    ],
    UUID: uuid,
  };
}

// Create a page manifest for a layout
function createPageManifest(layout: ProfileLayout): object {
  const actions: Record<string, object> = {};

  for (const action of layout.actions) {
    const key = `${action.column},${action.row}`;
    actions[key] = generateAction(action.uuid, action.settings || {});
  }

  return {
    Controllers: [
      {
        Actions: actions,
        Type: "Keypad",
      },
    ],
    Icon: "",
    Name: layout.device.name,
  };
}

// Install profiles for Standard MK.2 device (most common)
async function installProfiles(): Promise<void> {
  console.log("Installing Claude Deck profiles to Stream Deck...\n");

  const deviceProfile = findDeviceProfile();
  if (!deviceProfile) {
    console.error("No Stream Deck device profile found!");
    console.log("Make sure Stream Deck app is running and has been configured.");
    process.exit(1);
  }

  console.log(`Found device profile: ${deviceProfile}\n`);

  const profilesSubdir = join(deviceProfile, "Profiles");
  const deviceManifestPath = join(deviceProfile, "manifest.json");

  // Read the device manifest
  const deviceManifest = JSON.parse(readFileSync(deviceManifestPath, "utf-8"));
  console.log(`Current pages: ${deviceManifest.Pages.Pages.length}`);

  // Find the standard (MK.2) layout - most users have this
  const standardLayout = allLayouts.find((l) => l.device.deviceType === 0);

  if (!standardLayout) {
    console.error("No standard layout found!");
    process.exit(1);
  }

  // Create a new page for Claude Control
  const pageId = randomUUID().toUpperCase();
  const pageDir = join(profilesSubdir, pageId);

  mkdirSync(pageDir, { recursive: true });
  mkdirSync(join(pageDir, "Images"), { recursive: true });

  // Write the page manifest
  const pageManifest = createPageManifest(standardLayout);
  writeFileSync(
    join(pageDir, "manifest.json"),
    JSON.stringify(pageManifest, null, 2)
  );

  console.log(`Created Claude Control page: ${pageId}`);
  console.log(`  Location: ${pageDir}`);
  console.log(`  Actions: ${standardLayout.actions.length}`);

  // Add the new page to the device manifest
  const pageIdLower = pageId.toLowerCase();
  if (!deviceManifest.Pages.Pages.includes(pageIdLower)) {
    deviceManifest.Pages.Pages.push(pageIdLower);
    // Set as current page so user sees it immediately
    deviceManifest.Pages.Current = pageIdLower;
  }

  // Write updated device manifest
  writeFileSync(deviceManifestPath, JSON.stringify(deviceManifest));
  console.log(`\nUpdated device manifest with new page`);
  console.log(`New page count: ${deviceManifest.Pages.Pages.length}`);

  console.log("\n✅ Profile installed!");
  console.log("\nIMPORTANT: Stream Deck app must be CLOSED before running this.");
  console.log("If Stream Deck is running, close it and run this script again.");
  console.log("\nThen open Stream Deck app to see the new Claude Control page.");
}

installProfiles().catch((err: Error) => {
  console.error("Error installing profiles:", err);
  process.exit(1);
});
