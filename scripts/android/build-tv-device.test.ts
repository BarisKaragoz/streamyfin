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

/** Writes an executable shell script at `path` under the temporary root. */
const executable = (path: string, body: string) => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), `#!/bin/sh\n${body}\n`);
  chmodSync(join(root, path), 0o755);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-tv-device-"));
  // The script finds android/ relative to itself, so it runs from a copy.
  mkdirSync(join(root, "scripts/android"), { recursive: true });
  copyFileSync(
    join(__dirname, "build-tv-device.sh"),
    join(root, "scripts/android/build-tv-device.sh"),
  );
  // A TV project as prebuild:tv leaves it, so the script builds it as it is.
  mkdirSync(join(root, "android/app/src/main"), { recursive: true });
  writeFileSync(
    join(root, "android/app/src/main/AndroidManifest.xml"),
    '<category android:name="android.intent.category.LEANBACK_LAUNCHER"/>\n',
  );
  writeFileSync(
    join(root, "android/app/build.gradle"),
    "    applicationId 'com.example.tv'\n",
  );
  // Stands in for Gradle: records its arguments and leaves the APK.
  executable(
    "android/gradlew",
    `echo "$@" > "${join(root, "gradle-args")}"
mkdir -p app/build/outputs/apk/release
touch app/build/outputs/apk/release/app-release.apk`,
  );
  // Stands in for adb over the devices in devices.tsv (name, tab, hardware
  // serial). Like the real one, it refuses a command that names no device
  // while several are attached.
  const devices = join(root, "devices.tsv");
  executable(
    "bin/adb",
    `serial="$ANDROID_SERIAL"
if [ "$1" = -s ]; then serial=$2; shift 2; fi
if [ "$1" = devices ]; then
  echo "List of devices attached"
  awk -F'\\t' '{ printf "%s\\tdevice\\n", $1 }' "${devices}"
  exit 0
fi
if [ -z "$serial" ]; then
  if [ "$(wc -l < "${devices}")" -gt 1 ]; then
    echo "adb: more than one device/emulator" >&2
    exit 1
  fi
  serial=$(cut -f1 "${devices}")
fi
case "$*" in
  "get-state") echo device ;;
  "shell getprop ro.serialno") awk -F'\\t' -v s="$serial" '$1 == s { print $2 }' "${devices}" ;;
  "shell getprop ro.product.cpu.abi") echo armeabi-v7a ;;
  "shell getprop ro.product.model") echo Smart_TV_Pro ;;
  "install -r "*) echo "$serial" > "${join(root, "installed-on")}"; echo Success ;;
esac`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** What `adb devices` lists: each device's name and its hardware serial. */
const attach = (...devices: [name: string, hardwareSerial: string][]) => {
  writeFileSync(
    join(root, "devices.tsv"),
    devices.map((device) => `${device.join("\t")}\n`).join(""),
  );
};

const buildTvDevice = () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH}`,
  };
  delete env.ANDROID_SERIAL;
  const result = spawnSync(
    "bash",
    [join(root, "scripts/android/build-tv-device.sh")],
    { env },
  );
  const read = (file: string) =>
    existsSync(join(root, file))
      ? readFileSync(join(root, file), "utf8").trim()
      : undefined;
  return {
    status: result.status,
    stderr: result.stderr.toString(),
    installedOn: read("installed-on"),
    gradleArgs: read("gradle-args"),
  };
};

describe("build-tv-device.sh picks the TV to install on", () => {
  test("builds for the ABI of the one TV attached and installs on it", () => {
    attach(["192.168.1.20:5555", "TV1"]);

    const run = buildTvDevice();

    expect(run.status).toBe(0);
    expect(run.gradleArgs).toContain("-PreactNativeArchitectures=armeabi-v7a");
    expect(run.installedOn).toBe("192.168.1.20:5555");
  });

  // Wireless debugging can register one TV twice, the second time with " (2)"
  // in its name. The space split that name in two, so the script counted one
  // device and adb then refused the next command with "more than one
  // device/emulator".
  test("installs on a TV adb lists twice", () => {
    attach(
      ["adb-TV1 (2)._adb-tls-connect._tcp", "TV1"],
      ["adb-TV1._adb-tls-connect._tcp", "TV1"],
    );

    const run = buildTvDevice();

    expect(run.status).toBe(0);
    expect(run.installedOn).toBe("adb-TV1 (2)._adb-tls-connect._tcp");
  });

  test("says so when no TV is attached", () => {
    attach();

    const run = buildTvDevice();

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("adb sees no authorised device");
  });

  test("asks which one when two different devices are attached", () => {
    attach(
      ["adb-TV1 (2)._adb-tls-connect._tcp", "TV1"],
      ["emulator-5554", "EMU"],
    );

    const run = buildTvDevice();

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("several devices attached");
    expect(run.installedOn).toBeUndefined();
  });
});
