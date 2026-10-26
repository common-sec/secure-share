// The single place the QR code library comes in.
// qrcode-generator: QR code encoder (MIT), https://github.com/kazuhikoarase/qrcode-generator
// Installed from npm at an exact, lockfile-pinned version and bundled at build time: nothing is
// fetched from a CDN at run time. Loaded lazily, only when someone asks for a QR code. The library
// only turns text into a grid of modules; the SVG is drawn here, without innerHTML.
const SVG = 'http://www.w3.org/2000/svg';
const MARGIN = 4; // the quiet zone the QR code standard asks for, in modules

export async function qrSvg(text: string, label: string): Promise<SVGSVGElement> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M'); // smallest version that fits, medium error correction
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const size = n + 2 * MARGIN;
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) if (qr.isDark(row, col)) d += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`;
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(SVG, 'rect');
  bg.setAttribute('width', String(size));
  bg.setAttribute('height', String(size));
  bg.setAttribute('fill', '#fff');
  const dots = document.createElementNS(SVG, 'path');
  dots.setAttribute('d', d);
  dots.setAttribute('fill', '#000');
  svg.append(bg, dots);
  return svg;
}
