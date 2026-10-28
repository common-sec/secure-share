// Small monochrome icons for the "Send with" buttons, drawn without innerHTML. They take the text
// colour, so they follow the theme. Gmail, WhatsApp and Telegram are the Simple Icons glyphs
// (CC0, https://simpleicons.org); Email, Text message, Outlook and Teams are drawn here (Simple
// Icons has no Microsoft logos).
const SVG = 'http://www.w3.org/2000/svg';

type Shape = { d: string; stroke?: boolean; holes?: boolean };

const ICONS: Record<string, Shape[]> = {
  Email: [{ d: 'M3 5h18v14H3zM3 6l9 7 9-7', stroke: true }],
  'Text message': [{ d: 'M3 4h18v12H9l-5 4v-4H3z', stroke: true }],
  Gmail: [{ d: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' }],
  Outlook: [
    { d: 'M1 5h13v14H1zM7.5 8a3.2 4 0 1 0 .001 0zM7.5 9.8a1.5 2.2 0 1 1-.001 0z', holes: true },
    { d: 'M14 7h8v10h-8M14 8.5l4 3 4-3', stroke: true },
  ],
  WhatsApp: [{ d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' }],
  Telegram: [{ d: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' }],
  Teams: [
    { d: 'M1 6h14v12H1zM4 9h8v2H9v5H7v-5H4z', holes: true },
    { d: 'M19 3.5a2 2 0 1 1-.001 0zM16 9h6v5a3 3 0 0 1-6 0z' },
  ],
};

/** The icon for a "Send with" target, or null when there's none. Decorative: the button has the name. */
export function icon(name: string): SVGSVGElement | null {
  const shapes = ICONS[name];
  if (!shapes) return null;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const { d, stroke, holes } of shapes) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    if (stroke) {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linejoin', 'round');
    } else {
      path.setAttribute('fill', 'currentColor');
      if (holes) path.setAttribute('fill-rule', 'evenodd');
    }
    svg.append(path);
  }
  return svg;
}
