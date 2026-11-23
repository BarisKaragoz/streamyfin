import { renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import { useRemoteControl } from "./useRemoteControl";

/** The back handler the player registered, to press back from the spec. */
let mockBackHandler: (() => boolean | null | undefined) | null = null;
jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => boolean | null | undefined) => {
    mockBackHandler = handler;
  },
}));
jest.mock("@/hooks/useTVEventHandler", () => ({
  useTVEventHandler: () => {},
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
}));
jest.mock("@/i18n", () => ({ t: (key: string) => key }));

const pressBack = () => mockBackHandler?.();

const renderPlayer = async (showControls: boolean) => {
  const callbacks = {
    onBack: jest.fn(),
    onHideControls: jest.fn(),
    onWillExit: jest.fn(),
    onCancelExit: jest.fn(),
  };
  await renderHook(() =>
    useRemoteControl({
      showControls,
      toggleControls: () => {},
      videoTitle: "Big Buck Bunny",
      ...callbacks,
    }),
  );
  return callbacks;
};

describe("useRemoteControl back press", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockBackHandler = null;
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe("on Android TV", () => {
    beforeEach(() => {
      stubReactNative({ OS: "android", isTV: true });
    });

    // Back used to open a "Stop playback?" confirmation first, which made
    // leaving a video take three presses.
    it("leaves playback without asking when the controls are hidden", async () => {
      const player = await renderPlayer(false);

      expect(pressBack()).toBe(true);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(player.onBack).toHaveBeenCalledTimes(1);
    });

    // The guard keeps the next episode countdown from starting the next item
    // while the player is on its way out.
    it("raises the exit guard before leaving", async () => {
      const player = await renderPlayer(false);

      pressBack();

      expect(player.onWillExit).toHaveBeenCalledTimes(1);
      expect(player.onWillExit.mock.invocationCallOrder[0]).toBeLessThan(
        player.onBack.mock.invocationCallOrder[0],
      );
    });

    it("only hides the controls when they are showing", async () => {
      const player = await renderPlayer(true);

      expect(pressBack()).toBe(true);

      expect(player.onHideControls).toHaveBeenCalledTimes(1);
      expect(player.onBack).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe("on Apple TV", () => {
    beforeEach(() => {
      stubReactNative({ OS: "ios", isTV: true });
    });

    it("still confirms before leaving playback", async () => {
      const player = await renderPlayer(false);

      expect(pressBack()).toBe(true);

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(player.onBack).not.toHaveBeenCalled();
    });
  });
});
