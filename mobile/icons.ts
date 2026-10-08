import createIconSet from "@expo/vector-icons/build/createIconSet";

// Only the two glyphs the composer needs are registered. Importing the stock
// MaterialCommunityIcons component would pull its 7448-entry glyphmap (~500KB)
// into the JS bundle; the font file itself is emitted as a separate asset and
// contains every glyph anyway.
const FONT_ASSET = require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf");

export const ChatIcon = createIconSet(
  {
    microphone: 983916, // material-community: microphone
    "arrow-up": 983133, // material-community: arrow-up
  },
  "material-community",
  FONT_ASSET
);

export type ChatIconName = "microphone" | "arrow-up";
