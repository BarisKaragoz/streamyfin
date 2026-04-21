import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";

export const WatchedIndicator: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  const { settings } = useSettings();

  if (settings.hideUnwatchedIndicators) {
    return null;
  }

  return (
    <>
      {item.UserData?.Played === false &&
        (item.Type === "Movie" || item.Type === "Episode") && (
          <View className='bg-purple-600 w-8 h-8 absolute -top-4 -right-4 rotate-45' />
        )}
    </>
  );
};
