import { createTheme, rem } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  fontFamily: "Open Sans, sans-serif",
  autoContrast: true,
  cursorType: "pointer",

  headings: {
    fontWeight: "650",
    sizes: {
      h3: { fontSize: rem(22), lineHeight: "1.3" },
      h4: { fontSize: rem(18), lineHeight: "1.35" },
      h5: { fontSize: rem(15), lineHeight: "1.4" },
    },
  },

  // App-wide component defaults — a subtle, consistent lift on every surface.
  components: {
    Paper: { defaultProps: { shadow: "xs" } },
    Card: { defaultProps: { shadow: "sm", radius: "md", withBorder: true } },
    Button: { defaultProps: { radius: "md" } },
    TextInput: { defaultProps: { radius: "md" } },
    Select: { defaultProps: { radius: "md" } },
    NumberInput: { defaultProps: { radius: "md" } },
    Badge: { defaultProps: { radius: "sm" } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 200 } },
  },
});
