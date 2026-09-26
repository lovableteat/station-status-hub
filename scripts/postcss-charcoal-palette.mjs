// Recolor authored CSS and generated Tailwind utilities together. Keeping this
// pass after Tailwind also covers responsive, hover, active, and portal content.
const HEX_COLOR = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/gi;
const COLOR_FUNCTION = /\b(rgba?|hsla?)\(/gi;

const SURFACES = [
  [0.07, [11, 11, 13]],
  [0.1, [16, 16, 18]],
  [0.14, [21, 20, 24]],
  [0.19, [26, 25, 30]],
  [0.27, [33, 31, 36]],
  [0.43, [43, 42, 48]],
];

const COLOR_PROPERTY = /^(?:--|.*(?:color|background|border|outline|shadow|fill|stroke|caret|accent|column-rule|text-decoration))/;
const SOLID_ACTION_UTILITY = /(?:^|[^\w-])bg-(?:blue|sky|cyan|teal|emerald|green|rose|red|amber|yellow|indigo|violet|purple|fuchsia)-[3-8]00(?![\w/])/;

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;
  const lightness = (max + min) / 2;
  if (!difference) return [0, 0, lightness];

  const saturation = difference / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / difference) % 6;
  else if (max === g) hue = (b - r) / difference + 2;
  else hue = (r - g) / difference + 4;
  return [((hue * 60) + 360) % 360, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = lightness - chroma / 2;
  const values =
    segment < 1 ? [chroma, secondary, 0] :
    segment < 2 ? [secondary, chroma, 0] :
    segment < 3 ? [0, chroma, secondary] :
    segment < 4 ? [0, secondary, chroma] :
    segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return values.map((value) => Math.round((value + offset) * 255));
}

function colorRole(property) {
  if (/border|outline|ring|stroke|line/i.test(property)) return "border";
  if (/foreground|muted|text|ink|caret/i.test(property) || property === "color") return "text";
  if (/accent|primary|brand|cyan|blue|violet|purple|fuchsia/i.test(property)) return "accent";
  return "surface";
}

export function charcoalRgb(red, green, blue, property = "color") {
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const role = colorRole(property);

  // Neutral white/black overlays and document previews retain their contrast.
  if (saturation < 0.1) return [red, green, blue];
  if (role === "text" && lightness > 0.9) return [242, 242, 239];

  // State colors keep their meaning while losing the old neon saturation.
  if (hue >= 345 || hue < 18) {
    if (role === "text") return [233, 170, 176];
    return lightness < 0.42 ? [48, 31, 37] : [192, 123, 131];
  }
  if (hue >= 18 && hue < 75) {
    if (role === "text") return [232, 192, 139];
    return lightness < 0.42 ? [52, 40, 28] : [201, 155, 94];
  }
  if (hue >= 75 && hue < 145) {
    if (role === "text") return [170, 208, 186];
    return lightness < 0.42 ? [33, 32, 36] : [109, 164, 138];
  }

  if (role === "border" && lightness < 0.43) {
    return saturation > 0.6 && lightness > 0.23 ? [95, 199, 183] : [58, 57, 65];
  }
  if (lightness < 0.43) {
    if (role === "accent" && lightness > 0.21) return [33, 32, 36];
    if (saturation > 0.55 && lightness > 0.21) return [33, 32, 36];
    return (SURFACES.find(([limit]) => lightness <= limit) ?? SURFACES.at(-1))[1];
  }
  if (role === "text" && saturation < 0.46) {
    return lightness > 0.8 ? [242, 242, 239] : [185, 184, 189];
  }
  if (role === "border" && saturation < 0.46) return [58, 57, 65];

  const jadeLightness = role === "text"
    ? Math.max(0.62, Math.min(0.76, lightness + 0.04))
    : Math.max(0.54, Math.min(0.59, lightness));
  return hslToRgb(171, 0.5, jadeLightness);
}

function hexToChannels(hex) {
  const digits = hex.slice(1);
  if (digits.length === 3 || digits.length === 4) {
    return digits.split("").map((digit) => parseInt(digit + digit, 16));
  }
  return digits.match(/../g).map((pair) => parseInt(pair, 16));
}

function serialize(red, green, blue, alpha) {
  if (alpha !== undefined) return `rgb(${red} ${green} ${blue} / ${alpha})`;
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function recolorHex(value, property) {
  return value.replace(HEX_COLOR, (match) => {
    const [red, green, blue, alpha] = hexToChannels(match);
    const mapped = charcoalRgb(red, green, blue, property);
    return serialize(...mapped, alpha === undefined ? undefined : +(alpha / 255).toFixed(3));
  });
}

function parseFunction(name, body) {
  const [channels, slashAlpha] = body.split(/\s*\/\s*/, 2);
  const parts = channels.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(part))) return null;
  const alpha = slashAlpha ?? parts[3];
  if (name.startsWith("rgb")) {
    const rgb = parts.slice(0, 3).map((part) => part.endsWith("%") ? Math.round(parseFloat(part) * 2.55) : Math.round(parseFloat(part)));
    return { rgb, alpha };
  }
  if (!parts[1].endsWith("%") || !parts[2].endsWith("%")) return null;
  return {
    rgb: hslToRgb(((parseFloat(parts[0]) % 360) + 360) % 360, parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100),
    alpha,
  };
}

function recolorFunctions(value, property) {
  let output = "";
  let cursor = 0;
  COLOR_FUNCTION.lastIndex = 0;
  let match;
  while ((match = COLOR_FUNCTION.exec(value))) {
    const start = match.index;
    let depth = 1;
    let close = COLOR_FUNCTION.lastIndex;
    while (close < value.length && depth) {
      if (value[close] === "(") depth += 1;
      if (value[close] === ")") depth -= 1;
      close += 1;
    }
    if (depth) break;
    const original = value.slice(start, close);
    const parsed = parseFunction(match[1].toLowerCase(), value.slice(COLOR_FUNCTION.lastIndex, close - 1));
    const mapped = parsed ? charcoalRgb(...parsed.rgb, property) : null;
    output += value.slice(cursor, start) + (mapped ? serialize(...mapped, parsed.alpha) : original);
    cursor = close;
    COLOR_FUNCTION.lastIndex = close;
  }
  return output + value.slice(cursor);
}

function opaqueBackgroundChannels(value) {
  const hex = value.match(/^#([\da-f]{6})$/i);
  if (hex) return hexToChannels(value);
  const rgb = value.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*var\(--tw-bg-opacity(?:,\s*1)?\))?\)$/);
  return rgb ? rgb.slice(1, 4).map(Number) : null;
}

function relativeLuminance(channels) {
  const [red, green, blue] = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function recolorCssValue(value, property) {
  if (!COLOR_PROPERTY.test(property) || value.includes("url(")) return value;
  return recolorFunctions(recolorHex(value, property), property);
}

export default function charcoalPalette() {
  // PostCSS revisits a declaration when a plugin changes its value. Recoloring
  // twice would turn intended jade text into amber after its hue changes.
  const visited = new WeakSet();
  return {
    postcssPlugin: "charcoal-palette",
    Declaration(declaration) {
      if (visited.has(declaration)) return;
      visited.add(declaration);
      if (declaration.parent?.selector?.includes(".pcb-canvas .pcb-component-object")) return;
      for (let parent = declaration.parent; parent; parent = parent.parent) {
        if (parent.type === "atrule" && /^(?:media|page)$/i.test(parent.name) && /print/i.test(parent.params)) return;
      }
      const next = recolorCssValue(declaration.value, declaration.prop);
      if (next !== declaration.value) declaration.value = next;
    },
    OnceExit(root) {
      // Solid status/action fills become lighter in the charcoal theme. Their
      // old text-white utility may live in another rule, so give the fill a
      // higher-specificity dark foreground in normal and interactive states.
      root.walkRules((rule) => {
        if (!SOLID_ACTION_UTILITY.test(rule.selector) || rule.selector.includes("\\/")) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
          if (parent.type === "atrule" && /^(?:media|page)$/i.test(parent.name) && /print/i.test(parent.params)) return;
        }
        const background = rule.nodes.find((node) => node.type === "decl" && node.prop === "background-color");
        if (!background) return;
        const channels = opaqueBackgroundChannels(background.value);
        if (!channels || relativeLuminance(channels) < 0.2) return;
        const foreground = rule.cloneAfter({ selector: `${rule.selector}[class]` });
        foreground.removeAll();
        foreground.append({ prop: "color", value: "hsl(var(--primary-foreground))" });
      });
    },
  };
}

charcoalPalette.postcss = true;
