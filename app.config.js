module.exports = ({ config }) => {
  if (process.env.EXPO_TV !== "1") {
    config.plugins.push("expo-background-task");

    config.plugins.push([
      "react-native-google-cast",
      { useDefaultExpandedMediaControls: true },
    ]);

    config.plugins.push([
      "expo-camera",
      {
        cameraPermission:
          "Allow Streamyfin to access the camera to scan QR codes for TV login.",
      },
    ]);
  }

  // Only override googleServicesFile if env var is set
  const androidConfig = {};
  if (process.env.GOOGLE_SERVICES_JSON) {
    androidConfig.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }

  // Sign with our own team; app.json carries upstream's team ID
  config.ios.appleTeamId = "G4V3C7URJ9";

  // Upstream's bundle ID belongs to the published App Store app and cannot be
  // registered to our team, so the fork uses its own identifier
  config.ios.bundleIdentifier = "com.baris.streamyfin";
  config.android.package = "com.baris.streamyfin";

  // Second app instance, installable alongside the default one
  if (process.env.APP_VARIANT === "creation") {
    config.name = "Creation";
    config.ios.bundleIdentifier = "com.baris.streamyfin.creation";
    config.android.package = "com.baris.streamyfin.creation";
    config.scheme = "streamyfin-creation";
    config.icon = "./assets/images/icon-creation.png";
    config.ios.icon = "./assets/images/icon-creation.png";
  }

  if (process.env.APP_VARIANT === "sports") {
    config.name = "sports";
    config.ios.bundleIdentifier = "com.baris.streamyfin.sports";
    config.android.package = "com.baris.streamyfin.sports";
    config.scheme = "streamyfin-sports";
    config.icon = "./assets/images/icon-sports.png";
    config.ios.icon = "./assets/images/icon-sports.png";
  }

  return {
    ...(Object.keys(androidConfig).length > 0 && { android: androidConfig }),
    ...config,
  };
};
