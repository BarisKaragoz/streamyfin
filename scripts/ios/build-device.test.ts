import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-device-"));
  // The script finds ios/ relative to itself, so it runs from a copy.
  mkdirSync(join(root, "scripts/ios"), { recursive: true });
  copyFileSync(
    join(__dirname, "build-device.sh"),
    join(root, "scripts/ios/build-device.sh"),
  );
  // Stands in for Xcode: records that a build started and leaves the app where
  // the script looks for it.
  stub(
    "xcodebuild",
    `touch "${join(root, "xcodebuild-ran")}"
while [ $# -gt 0 ]; do [ "$1" = -scheme ] && scheme=$2; shift; done
app="${join(root, "ios/build/Build/Products/Release-iphoneos")}/$scheme.app"
mkdir -p "$app"
cat > "$app/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.example.app</string>
</dict></plist>
EOF`,
  );
  // Stands in for devicectl: lists the devices in devices.json, and records
  // which one the app was installed on.
  stub(
    "xcrun",
    `case "$*" in
  "devicectl list devices --json-output "*) cp "${join(root, "devices.json")}" "$5" ;;
  "devicectl device install app "*) echo "$6" > "${join(root, "installed-on")}" ;;
esac`,
  );
  listDevices([]);
});

/** Writes an executable that stands in for a command on PATH. */
const stub = (name: string, body: string) => {
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "bin", name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(root, "bin", name), 0o755);
};

type Device = {
  id: string;
  reality: "physical" | "simulated";
  tunnel: "connected" | "disconnected" | "unavailable";
};

/** What `xcrun devicectl list devices` reports, in the shape Xcode writes. */
const listDevices = (devices: Device[]) => {
  writeFileSync(
    join(root, "devices.json"),
    JSON.stringify({
      result: {
        devices: devices.map(({ id, reality, tunnel }) => ({
          identifier: id,
          deviceProperties: { name: id },
          hardwareProperties: {
            platform: "iOS",
            reality,
            deviceType: "iPhone",
          },
          connectionProperties: { tunnelState: tunnel },
        })),
      },
    }),
  );
};

const installedOn = () => {
  const file = join(root, "installed-on");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : undefined;
};

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes the ios/ folder a prebuild would leave, for iPhone or Apple TV. */
const prebuilt = (scheme: string, sdk: "iphoneos" | "appletvos") => {
  mkdirSync(join(root, `ios/${scheme}.xcworkspace`), { recursive: true });
  mkdirSync(join(root, `ios/${scheme}.xcodeproj`), { recursive: true });
  writeFileSync(
    join(root, `ios/${scheme}.xcodeproj/project.pbxproj`),
    `buildSettings = {\n\t\t\t\tSDKROOT = ${sdk};\n\t\t\t};\n`,
  );
};

const buildDevice = (scheme: string) => {
  const result = spawnSync(
    "bash",
    [join(root, "scripts/ios/build-device.sh"), scheme],
    {
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` },
    },
  );
  return {
    status: result.status,
    stderr: result.stderr.toString(),
    xcodebuildRan: existsSync(join(root, "xcodebuild-ran")),
  };
};

describe("build-device.sh", () => {
  // prebuild:tv writes an Apple TV project into the same ios/ folder, and
  // xcodebuild then rejected the iPhone destination with a list of every
  // simulator on the Mac, without saying that the project was the problem.
  test("refuses the Apple TV project prebuild:tv leaves in ios/", () => {
    prebuilt("Streamyfin", "appletvos");

    const run = buildDevice("Streamyfin");

    expect(run.xcodebuildRan).toBe(false);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Apple TV");
    expect(run.stderr).toContain("bun run prebuild\n");
  });

  test("builds an iPhone project", () => {
    prebuilt("Streamyfin", "iphoneos");

    expect(buildDevice("Streamyfin").xcodebuildRan).toBe(true);
  });

  test.each([
    ["Creation", "bun run prebuild:creation"],
    ["Sports", "bun run prebuild:sports"],
  ])("names the prebuild a missing %s workspace needs", (scheme, prebuild) => {
    const run = buildDevice(scheme);

    expect(run.xcodebuildRan).toBe(false);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`${prebuild}\n`);
  });
});

describe("build-device.sh picks the iPhone to install on", () => {
  beforeEach(() => prebuilt("Streamyfin", "iphoneos"));

  // devicectl lists the Mac's simulators along with the phones, and with no
  // phone connected yet the script fell back to the first device listed: a
  // simulator, which cannot install a device build.
  test("skips the simulators listed before the iPhone", () => {
    listDevices([
      { id: "simulator", reality: "simulated", tunnel: "disconnected" },
      { id: "iphone", reality: "physical", tunnel: "disconnected" },
    ]);

    buildDevice("Streamyfin");

    expect(installedOn()).toBe("iphone");
  });

  test("skips an iPhone it cannot reach", () => {
    listDevices([
      { id: "away", reality: "physical", tunnel: "unavailable" },
      { id: "iphone", reality: "physical", tunnel: "disconnected" },
    ]);

    buildDevice("Streamyfin");

    expect(installedOn()).toBe("iphone");
  });

  test("prefers the iPhone that is connected", () => {
    listDevices([
      { id: "drawer", reality: "physical", tunnel: "disconnected" },
      { id: "iphone", reality: "physical", tunnel: "connected" },
    ]);

    buildDevice("Streamyfin");

    expect(installedOn()).toBe("iphone");
  });

  test("stops when no iPhone can be reached", () => {
    listDevices([
      { id: "simulator", reality: "simulated", tunnel: "disconnected" },
      { id: "away", reality: "physical", tunnel: "unavailable" },
    ]);

    const run = buildDevice("Streamyfin");

    expect(installedOn()).toBeUndefined();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("no iPhone found");
  });
});
