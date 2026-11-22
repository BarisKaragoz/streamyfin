type AutolinkingConfig = {
  dependencies: Record<string, { platforms?: Record<string, unknown> }>;
};

/** The autolinking config react-native.config.js produces for a phone or a TV build. */
const loadFor = (tv: boolean): AutolinkingConfig => {
  const previous = process.env.EXPO_TV;
  process.env.EXPO_TV = tv ? "1" : "0";
  try {
    let config: AutolinkingConfig | undefined;
    // The file reads EXPO_TV once at load, so each build needs a fresh copy.
    jest.isolateModules(() => {
      config = require("./react-native.config");
    });
    if (!config) throw new Error("react-native.config.js did not load");
    return config;
  } finally {
    // Assigning undefined would store the string "undefined".
    if (previous === undefined) delete process.env.EXPO_TV;
    else process.env.EXPO_TV = previous;
  }
};

describe("react-native-google-cast autolinking", () => {
  // Chromecast is off on TV and the Cast config plugin only runs for phone
  // builds, so on TV the library linked unconfigured and pulled whatever Cast
  // SDK was newest, which stopped building against this project's compileSdk.
  test("is skipped on TV", () => {
    expect(
      loadFor(true).dependencies["react-native-google-cast"]?.platforms,
    ).toEqual({ ios: null, android: null });
  });

  test("is left to default autolinking on phones", () => {
    expect(
      loadFor(false).dependencies["react-native-google-cast"],
    ).toBeUndefined();
  });
});
