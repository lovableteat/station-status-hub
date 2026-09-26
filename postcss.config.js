import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import charcoalPalette from "./scripts/postcss-charcoal-palette.mjs";

export default {
  plugins: [tailwindcss(), autoprefixer(), charcoalPalette()],
};
