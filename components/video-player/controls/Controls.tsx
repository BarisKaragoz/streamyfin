import { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useLocalSearchParams } from "expo-router";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import ContinueWatchingOverlay from "@/components/video-player/controls/ContinueWatchingOverlay";
import useRouter from "@/hooks/useAppRouter";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useHaptic } from "@/hooks/useHaptic";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { ticksToMs } from "@/utils/time";
import { BottomControls } from "./BottomControls";
import { CenterControls } from "./CenterControls";
import { CONTROLS_CONSTANTS } from "./constants";
import { EpisodeList } from "./EpisodeList";
import { GestureOverlay } from "./GestureOverlay";
import { HeaderControls } from "./HeaderControls";
import { useChapterNavigation } from "./hooks/useChapterNavigation";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoNavigation } from "./hooks/useVideoNavigation";
import { useVideoSlider } from "./hooks/useVideoSlider";
import { useVideoTime } from "./hooks/useVideoTime";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";
import { TrickplayBubble } from "./TrickplayBubble";
import { useControlsTimeout } from "./useControlsTimeout";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import { type AspectRatio } from "./VideoScalingModeSelector";

interface Props {
  item: BaseItemDto;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  enableTrickplay?: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  startPictureInPicture?: () => Promise<void>;
  play: () => void;
  pause: () => void;
  aspectRatio?: AspectRatio;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  api?: Api | null;
  downloadedFiles?: DownloadedItem[];
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  // Technical info props
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
  getTechnicalInfo?: () => Promise<TechnicalInfo>;
  playMethod?: "DirectPlay" | "DirectStream" | "Transcode";
  transcodeReasons?: string[];
}

export const Controls: FC<Props> = ({
  item,
  seek,
  startPictureInPicture,
  play,
  pause,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  isBuffering,
  cacheProgress,
  showControls,
  setShowControls,
  mediaSource,
  aspectRatio = "default",
  isZoomedToFill = false,
  onZoomToggle,
  api = null,
  downloadedFiles = undefined,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
  getTechnicalInfo,
  playMethod,
  transcodeReasons,
}) => {
  const offline = useOfflineMode();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");

  const [episodeView, setEpisodeView] = useState(false);
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { previousItem, nextItem } = usePlaybackManager({
    item,
    isOffline: offline,
  });

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item);

  const min = useSharedValue(0);
  // Regular value for use during render (avoids Reanimated warning)
  const maxMs = ticksToMs(item.RunTimeTicks || 0);
  const max = useSharedValue(maxMs);

  // Animation values for controls
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const headerTranslateY = useSharedValue(showControls ? 0 : -50);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  // Animate controls visibility
  useEffect(() => {
    const animationConfig = {
      duration: 300,
      easing: Easing.out(Easing.quad),
    };

    controlsOpacity.value = withTiming(showControls ? 1 : 0, animationConfig);
    headerTranslateY.value = withTiming(
      showControls ? 0 : -10,
      animationConfig,
    );
    bottomTranslateY.value = withTiming(showControls ? 0 : 10, animationConfig);
  }, [showControls, controlsOpacity, headerTranslateY, bottomTranslateY]);

  // Create animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  const centerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  }));

  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  // Initialize progress values - MPV uses milliseconds
  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  // Navigation hooks
  const {
    handleSeekBackward,
    handleSeekForward,
    handleSkipBackward,
    handleSkipForward,
  } = useVideoNavigation({
    progress,
    isPlaying,
    seek,
    play,
  });

  // Time management hook
  const { currentTime, remainingTime } = useVideoTime({
    progress,
    max,
    isSeeking,
  });

  // Chapter navigation hook
  const {
    hasChapters,
    hasPreviousChapter,
    hasNextChapter,
    goToPreviousChapter,
    goToNextChapter,
    chapterPositions,
  } = useChapterNavigation({
    chapters: item.Chapters,
    progress,
    maxMs,
    seek,
  });

  const toggleControls = useCallback(() => {
    if (showControls) {
      setShowAudioSlider(false);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  }, [showControls, setShowControls]);

  // Remote control hook
  const {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding: isRemoteSliding,
    time: remoteTime,
  } = useRemoteControl({
    progress,
    min,
    max,
    showControls,
    isPlaying,
    seek,
    play,
    togglePlay,
    toggleControls,
    calculateTrickplayUrl,
    handleSeekForward,
    handleSeekBackward,
  });

  // Slider hook
  const {
    isSliding,
    time,
    handleSliderStart,
    startScrub,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
    seekTo,
  } = useVideoSlider({
    progress,
    isSeeking,
    isPlaying,
    seek,
    play,
    pause,
    calculateTrickplayUrl,
    showControls,
  });

  const effectiveProgress = useSharedValue(0);

  // Hold-drag seek (Infuse-style scrubbing) state
  const holdScrubProgress = useSharedValue(0);
  const isHoldScrubbing = useSharedValue(false);
  const [isHoldSeeking, setIsHoldSeeking] = useState(false);
  const holdScrubStartMsRef = useRef(0);
  const lastLiveSeekRef = useRef({ atTime: 0, targetMs: 0 });
  const liveSeekTrailingRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Recompute progress whenever scrubbing is active or when progress significantly changes
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value || isHoldScrubbing.value,
      scrub: isHoldScrubbing.value
        ? holdScrubProgress.value
        : remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current, previous) => {
      // Always update if scrubbing state changed or we're currently scrubbing
      if (
        current.isScrubbing !== previous?.isScrubbing ||
        current.isScrubbing
      ) {
        effectiveProgress.value =
          current.isScrubbing && current.scrub != null
            ? current.scrub
            : current.actual;
      } else {
        // When not scrubbing, only update if progress changed significantly (1 second)
        // MPV uses milliseconds
        const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
        const progressDiff = Math.abs(current.actual - effectiveProgress.value);
        if (progressDiff >= progressUnit) {
          effectiveProgress.value = current.actual;
        }
      }
    },
    [],
  );

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  const { showSkipButton, skipIntro } = useIntroSkipper(
    item.Id!,
    currentTime,
    seek,
    play,
    offline,
    api,
    downloadedFiles,
  );

  const { showSkipCreditButton, skipCredit, hasContentAfterCredits } =
    useCreditSkipper(
      item.Id!,
      currentTime,
      seek,
      play,
      offline,
      api,
      downloadedFiles,
      maxMs,
    );

  const goToItemCommon = useCallback(
    (item: BaseItemDto) => {
      if (!item || !settings) {
        return;
      }
      lightHapticFeedback();
      const previousIndexes = {
        subtitleIndex: subtitleIndex
          ? Number.parseInt(subtitleIndex, 10)
          : undefined,
        audioIndex: audioIndex ? Number.parseInt(audioIndex, 10) : undefined,
      };

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(
        item,
        settings,
        {
          indexes: previousIndexes,
          source: mediaSource ?? undefined,
        },
        { applyLanguagePreferences: true },
      );

      const queryParams = new URLSearchParams({
        ...(offline && { offline: "true" }),
        itemId: item.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString(),
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "",
      }).toString();

      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [settings, subtitleIndex, audioIndex, mediaSource, bitrateValue, router],
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem) {
      return;
    }
    goToItemCommon(previousItem);
  }, [previousItem, goToItemCommon]);

  const goToNextItem = useCallback(
    ({
      isAutoPlay,
      resetWatchCount,
    }: {
      isAutoPlay?: boolean;
      resetWatchCount?: boolean;
    }) => {
      if (!nextItem) {
        return;
      }

      if (!isAutoPlay) {
        // if we are not autoplaying, we won't update anything, we just go to the next item
        goToItemCommon(nextItem);
        if (resetWatchCount) {
          updateSettings({
            autoPlayEpisodeCount: 0,
          });
        }
        return;
      }

      // Skip autoplay logic if maxAutoPlayEpisodeCount is -1
      if (settings.maxAutoPlayEpisodeCount.value === -1) {
        goToItemCommon(nextItem);
        return;
      }

      if (
        settings.autoPlayEpisodeCount + 1 <
        settings.maxAutoPlayEpisodeCount.value
      ) {
        goToItemCommon(nextItem);
      }

      // Check if the autoPlayEpisodeCount is less than maxAutoPlayEpisodeCount for the autoPlay
      if (
        settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value
      ) {
        // update the autoPlayEpisodeCount in settings
        updateSettings({
          autoPlayEpisodeCount: settings.autoPlayEpisodeCount + 1,
        });
      }
    },
    [nextItem, goToItemCommon],
  );

  // Add a memoized handler for autoplay next episode
  const handleNextEpisodeAutoPlay = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  // Add a memoized handler for manual next episode
  const handleNextEpisodeManual = useCallback(() => {
    goToNextItem({ isAutoPlay: false });
  }, [goToNextItem]);

  // Add a memoized handler for ContinueWatchingOverlay
  const handleContinueWatching = useCallback(
    (options: { isAutoPlay?: boolean; resetWatchCount?: boolean }) => {
      goToNextItem(options);
    },
    [goToNextItem],
  );

  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioSlider(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding: isSliding || isRemoteSliding,
    episodeView,
    onHideControls: hideControls,
    timeout: CONTROLS_CONSTANTS.TIMEOUT,
    disabled: true,
  });

  // Maps horizontal drag distance to a seek offset. Quadratic curve: small
  // drags give fine control, dragging further accelerates toward the max.
  const computeHoldSeekOffsetMs = useCallback(
    (deltaX: number) => {
      const absX = Math.abs(deltaX);
      if (absX <= CONTROLS_CONSTANTS.HOLD_DRAG_DEAD_ZONE_PX) return 0;
      const maxDrag = screenWidth * CONTROLS_CONSTANTS.HOLD_DRAG_MAX_DRAG_RATIO;
      const ratio = Math.min(
        (absX - CONTROLS_CONSTANTS.HOLD_DRAG_DEAD_ZONE_PX) / maxDrag,
        1,
      );
      const seconds =
        ratio * ratio * CONTROLS_CONSTANTS.HOLD_DRAG_MAX_SEEK_SECONDS;
      return Math.round(deltaX < 0 ? -seconds : seconds) * 1000;
    },
    [screenWidth],
  );

  const holdSeekTargetMs = useCallback(
    (deltaX: number) =>
      Math.min(
        Math.max(
          holdScrubStartMsRef.current + computeHoldSeekOffsetMs(deltaX),
          0,
        ),
        maxMs,
      ),
    [computeHoldSeekOffsetMs, maxMs],
  );

  const clearLiveSeekTrailing = useCallback(() => {
    if (liveSeekTrailingRef.current) {
      clearTimeout(liveSeekTrailingRef.current);
      liveSeekTrailingRef.current = null;
    }
  }, []);

  useEffect(() => clearLiveSeekTrailing, [clearLiveSeekTrailing]);

  const handleHoldSeekStart = useCallback(() => {
    holdScrubStartMsRef.current = progress.value;
    lastLiveSeekRef.current = { atTime: 0, targetMs: progress.value };
    clearLiveSeekTrailing();
    startScrub();
    holdScrubProgress.value = progress.value;
    isHoldScrubbing.value = true;
    setIsHoldSeeking(true);
    setShowControls(true);
    // Prime the trickplay preview + time at the current position
    handleSliderChange(progress.value);
  }, [
    progress,
    startScrub,
    holdScrubProgress,
    isHoldScrubbing,
    setShowControls,
    handleSliderChange,
    clearLiveSeekTrailing,
  ]);

  const handleHoldSeekMove = useCallback(
    (deltaX: number) => {
      const target = holdSeekTargetMs(deltaX);
      holdScrubProgress.value = target;
      handleSliderChange(target);
      // Without trickplay images there is no thumbnail to show, so seek the
      // paused video itself and let the full-screen frame act as the preview
      // (Infuse/VLC style). Skipped when trickplay exists — the bubble covers
      // it without disturbing the demuxer.
      if (!trickplayInfo) {
        const now = Date.now();
        const last = lastLiveSeekRef.current;
        if (
          now - last.atTime >=
            CONTROLS_CONSTANTS.HOLD_DRAG_LIVE_SEEK_INTERVAL_MS &&
          Math.abs(target - last.targetMs) >=
            CONTROLS_CONSTANTS.HOLD_DRAG_LIVE_SEEK_MIN_DELTA_MS
        ) {
          lastLiveSeekRef.current = { atTime: now, targetMs: target };
          // MPV uses ms, seek expects ms
          seek(Math.max(0, Math.floor(target)));
        }
        // Trailing catch-up: seeks only fire on move events, so when the
        // finger slows down and rests, the previewed frame would otherwise
        // lag the target by up to a throttle window. Converge to the final
        // target once movement pauses so the frame on screen is the frame
        // playback resumes from.
        clearLiveSeekTrailing();
        liveSeekTrailingRef.current = setTimeout(() => {
          liveSeekTrailingRef.current = null;
          if (Math.abs(target - lastLiveSeekRef.current.targetMs) < 50) return;
          lastLiveSeekRef.current = { atTime: Date.now(), targetMs: target };
          seek(Math.max(0, Math.floor(target)));
        }, CONTROLS_CONSTANTS.HOLD_DRAG_LIVE_SEEK_INTERVAL_MS);
      }
    },
    [
      holdSeekTargetMs,
      holdScrubProgress,
      handleSliderChange,
      trickplayInfo,
      seek,
      clearLiveSeekTrailing,
    ],
  );

  const handleHoldSeekEnd = useCallback(
    (deltaX: number) => {
      // The final exact seek below supersedes any pending trailing preview
      const target = holdSeekTargetMs(deltaX);
      clearLiveSeekTrailing();
      isHoldScrubbing.value = false;
      setIsHoldSeeking(false);
      handleSliderComplete(target);
    },
    [
      holdSeekTargetMs,
      isHoldScrubbing,
      handleSliderComplete,
      clearLiveSeekTrailing,
    ],
  );

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      {episodeView ? (
        <EpisodeList
          item={item}
          close={() => setEpisodeView(false)}
          goToItem={goToItemCommon}
        />
      ) : (
        <>
          <GestureOverlay
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            showControls={showControls}
            onToggleControls={toggleControls}
            onSkipForward={handleSkipForward}
            onSkipBackward={handleSkipBackward}
            onDoubleTapForward={handleSkipForward}
            onDoubleTapBackward={handleSkipBackward}
            onHoldSeekStart={handleHoldSeekStart}
            onHoldSeekMove={handleHoldSeekMove}
            onHoldSeekEnd={handleHoldSeekEnd}
          />
          {/* Hold-drag seek: centered trickplay preview above the seekbar */}
          {isHoldSeeking && (
            <View
              pointerEvents='none'
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 140,
                alignItems: "center",
                zIndex: 15,
              }}
            >
              {trickPlayUrl && trickplayInfo ? (
                <TrickplayBubble
                  trickPlayUrl={trickPlayUrl}
                  trickplayInfo={trickplayInfo}
                  time={time}
                  centered
                />
              ) : (
                <View
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontSize: 18,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {`${time.hours > 0 ? `${time.hours}:` : ""}${time.minutes
                      .toString()
                      .padStart(2, "0")}:${time.seconds
                      .toString()
                      .padStart(2, "0")}`}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* Technical Info Overlay - rendered outside animated views to stay visible */}
          {getTechnicalInfo && (
            <TechnicalInfoOverlay
              showControls={showControls}
              visible={showTechnicalInfo}
              getTechnicalInfo={getTechnicalInfo}
              playMethod={playMethod}
              transcodeReasons={transcodeReasons}
              mediaSource={mediaSource}
            />
          )}
          <Animated.View
            style={headerAnimatedStyle}
            pointerEvents={showControls ? "auto" : "none"}
          >
            <HeaderControls
              item={item}
              showControls={showControls}
              offline={offline}
              mediaSource={mediaSource}
              startPictureInPicture={startPictureInPicture}
              switchOnEpisodeMode={switchOnEpisodeMode}
              goToPreviousItem={goToPreviousItem}
              goToNextItem={goToNextItem}
              previousItem={previousItem}
              nextItem={nextItem}
              aspectRatio={aspectRatio}
              isZoomedToFill={isZoomedToFill}
              onZoomToggle={onZoomToggle}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              showTechnicalInfo={showTechnicalInfo}
              onToggleTechnicalInfo={onToggleTechnicalInfo}
            />
          </Animated.View>
          <Animated.View
            style={centerAnimatedStyle}
            pointerEvents={showControls ? "box-none" : "none"}
          >
            <CenterControls
              showControls={showControls}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              showAudioSlider={showAudioSlider}
              setShowAudioSlider={setShowAudioSlider}
              togglePlay={togglePlay}
              handleSkipBackward={handleSkipBackward}
              handleSkipForward={handleSkipForward}
              hasChapters={hasChapters}
              hasPreviousChapter={hasPreviousChapter}
              hasNextChapter={hasNextChapter}
              goToPreviousChapter={goToPreviousChapter}
              goToNextChapter={goToNextChapter}
            />
          </Animated.View>
          <Animated.View
            style={bottomAnimatedStyle}
            pointerEvents={showControls ? "auto" : "none"}
          >
            <BottomControls
              item={item}
              chapters={item.Chapters}
              durationMs={maxMs}
              showControls={showControls}
              isSliding={isSliding}
              showRemoteBubble={showRemoteBubble}
              currentTime={currentTime}
              remainingTime={remainingTime}
              showSkipButton={showSkipButton}
              showSkipCreditButton={showSkipCreditButton}
              hasContentAfterCredits={hasContentAfterCredits}
              skipIntro={skipIntro}
              skipCredit={skipCredit}
              nextItem={nextItem}
              handleNextEpisodeAutoPlay={handleNextEpisodeAutoPlay}
              handleNextEpisodeManual={handleNextEpisodeManual}
              handleControlsInteraction={handleControlsInteraction}
              min={min}
              max={max}
              effectiveProgress={effectiveProgress}
              cacheProgress={cacheProgress}
              handleSliderStart={handleSliderStart}
              handleSliderComplete={handleSliderComplete}
              handleSliderChange={handleSliderChange}
              handleTouchStart={handleTouchStart}
              handleTouchEnd={handleTouchEnd}
              seekTo={seekTo}
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              time={isSliding || showRemoteBubble ? time : remoteTime}
              chapterPositions={chapterPositions}
            />
          </Animated.View>
        </>
      )}
      {settings.maxAutoPlayEpisodeCount.value !== -1 && (
        <ContinueWatchingOverlay goToNextItem={handleContinueWatching} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  controlsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
