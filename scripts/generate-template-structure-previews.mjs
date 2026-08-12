import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const TEMPLATE_STRUCTURE_PREVIEW_IDS = Object.freeze([
  "cinematic-light",
  "neon-hud",
  "film-rail",
  "manga-panels",
  "prism-liquid",
  "orbital-portal",
  "archive-os",
  "editorial-duet",
  "polaroid-field",
  "character-select",
  "museum-depth",
]);

export const TEMPLATE_STRUCTURE_PREVIEW_WIDTH = 1200;
export const TEMPLATE_STRUCTURE_PREVIEW_HEIGHT = 675;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "public", "template-structure-previews");

const rect = (x, y, width, height, fill, options = "") =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${options}/>`;
const line = (x1, y1, x2, y2, stroke, width = 4, options = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${options}/>`;
const circle = (cx, cy, radius, fill, options = "") =>
  `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" ${options}/>`;
const polygon = (points, fill, options = "") =>
  `<polygon points="${points}" fill="${fill}" ${options}/>`;

function frame(body, background, accent) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      ${rect(0, 0, 1200, 675, background)}
      ${rect(28, 28, 1144, 619, "none", `stroke="${accent}" stroke-width="2" opacity=".5"`)}
      ${body}
    </svg>
  `;
}

function cinematicLight() {
  const lower = [
    rect(62, 476, 250, 125, "#ece4da"),
    rect(328, 476, 170, 125, "#ded4ca"),
    rect(514, 476, 285, 125, "#e8ded4"),
    rect(815, 476, 323, 125, "#d8cec4"),
  ].join("");
  return frame(`
    ${rect(55, 48, 1090, 42, "#fbf8f4")}
    ${rect(76, 61, 100, 12, "#201814")}${rect(950, 61, 165, 10, "#8e8278")}
    ${rect(55, 110, 1090, 332, "#d7cec5")}
    ${polygon("55,110 720,110 510,442 55,442", "#f5eee7")}
    ${rect(88, 151, 245, 20, "#201814")}${rect(88, 184, 355, 13, "#f06724")}
    ${line(805, 157, 1087, 157, "#f06724", 5)}${line(805, 177, 1015, 177, "#201814", 4)}
    ${rect(732, 206, 300, 155, "none", 'stroke="#201814" stroke-width="5"')}
    ${line(716, 190, 770, 190, "#f06724", 5)}${line(1012, 377, 1066, 377, "#f06724", 5)}
    ${lower}
    ${rect(62, 618, 460, 7, "#201814")}${rect(1010, 618, 128, 7, "#f06724")}
  `, "#f4efe9", "#d75519");
}

function neonHud() {
  const thumbnails = [0, 1, 2, 3].map((index) =>
    rect(870, 158 + index * 86, 248, 68, index === 1 ? "#184d72" : "#0c2740", 'stroke="#36e4f2" stroke-width="2"'),
  ).join("");
  return frame(`
    ${rect(52, 50, 1096, 48, "#071624", 'stroke="#2bdce9" stroke-width="2"')}
    ${circle(78, 74, 7, "#ff45bd")}${rect(100, 67, 170, 12, "#2bdce9")}${rect(932, 67, 185, 12, "#173e58")}
    ${rect(70, 130, 758, 389, "#0c2942", 'stroke="#2bdce9" stroke-width="3"')}
    ${polygon("70,130 520,130 325,519 70,519", "#142f53")}
    ${line(95, 156, 160, 156, "#ff45bd", 5)}${line(95, 156, 95, 221, "#ff45bd", 5)}
    ${line(803, 493, 738, 493, "#2bdce9", 5)}${line(803, 493, 803, 428, "#2bdce9", 5)}
    ${rect(225, 219, 442, 205, "none", 'stroke="#517693" stroke-width="3"')}
    ${line(446, 219, 446, 424, "#203e57", 2)}${line(225, 321, 667, 321, "#203e57", 2)}
    ${thumbnails}
    ${rect(70, 551, 1048, 55, "#071624", 'stroke="#ff45bd" stroke-width="2"')}
    ${rect(91, 571, 420, 13, "#2bdce9")}${rect(852, 571, 242, 13, "#ff45bd")}
  `, "#030a14", "#2bdce9");
}

function filmRail() {
  const perforations = Array.from({ length: 14 }, (_, index) =>
    `${rect(55 + index * 80, 86, 42, 24, "#d9cbb8")}${rect(55 + index * 80, 565, 42, 24, "#d9cbb8")}`,
  ).join("");
  const frames = [0, 1, 2, 3, 4].map((index) =>
    rect(52 + index * 224, 153, 200, 356, index % 2 ? "#332b25" : "#4a3c31", 'stroke="#ede0ca" stroke-width="5"'),
  ).join("");
  return frame(`
    ${perforations}${frames}
    ${line(52, 132, 1148, 132, "#e0602c", 3)}${line(52, 530, 1148, 530, "#e0602c", 3)}
    ${rect(75, 178, 154, 18, "#d9cbb8", 'opacity=".8"')}${rect(971, 466, 154, 18, "#d9cbb8", 'opacity=".8"')}
  `, "#15110f", "#d9cbb8");
}

function mangaPanels() {
  return frame(`
    ${rect(55, 48, 1090, 579, "#f8f4eb")}
    ${polygon("75,72 464,72 402,370 75,414", "#ece5da", 'stroke="#171515" stroke-width="8"')}
    ${polygon("486,72 1124,72 1124,250 448,343", "#23201f", 'stroke="#171515" stroke-width="8"')}
    ${polygon("75,437 397,392 464,602 75,602", "#d9d0c3", 'stroke="#171515" stroke-width="8"')}
    ${polygon("424,370 790,319 760,602 487,602", "#fffdf8", 'stroke="#171515" stroke-width="8"')}
    ${polygon("814,291 1124,268 1124,602 784,602", "#e84a2e", 'stroke="#171515" stroke-width="8"')}
    ${circle(244, 238, 76, "none", 'stroke="#e84a2e" stroke-width="10"')}
    ${line(520, 119, 980, 119, "#f8f4eb", 13)}${line(520, 151, 840, 151, "#f8f4eb", 8)}
  `, "#d9d1c6", "#171515");
}

function prismLiquid() {
  return frame(`
    <defs>
      <linearGradient id="prism-a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6c98"/><stop offset=".48" stop-color="#8d68eb"/><stop offset="1" stop-color="#33b5e8"/></linearGradient>
      <radialGradient id="prism-b"><stop stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#d9cff8" stop-opacity=".2"/></radialGradient>
    </defs>
    ${circle(270, 180, 175, "url(#prism-b)")}${circle(965, 470, 210, "url(#prism-b)")}
    ${rect(55, 48, 1090, 54, "#fff", 'rx="24" opacity=".82"')}
    ${rect(88, 66, 180, 14, "#5e43b4", 'rx="7"')}${rect(922, 66, 188, 14, "url(#prism-a)", 'rx="7"')}
    ${rect(80, 132, 680, 326, "url(#prism-a)", 'rx="76"')}
    ${polygon("80,132 470,132 330,458 80,458", "#fff", 'opacity=".28"')}
    ${rect(792, 132, 324, 94, "#fff", 'rx="32" opacity=".84"')}
    ${rect(792, 244, 324, 94, "#e5dcfb", 'rx="32"')}
    ${rect(792, 356, 324, 102, "#fff", 'rx="32" opacity=".84"')}
    ${rect(80, 488, 1036, 112, "#fff", 'rx="38" opacity=".78"')}
    ${rect(108, 520, 270, 48, "url(#prism-a)", 'rx="24"')}${line(420, 532, 1055, 532, "#9a83c9", 7)}${line(420, 559, 885, 559, "#c6b8e4", 7)}
  `, "#eee8fa", "#875dd3");
}

function orbitalPortal() {
  const cards = [0, 1, 2, 3, 4].map((index) => {
    const x = 76 + index * 222;
    return rect(x, index % 2 ? 446 : 420, 148, 184, index === 2 ? "#173b49" : "#0d202a", 'rx="18" stroke="#5bcbe0" stroke-width="2"');
  }).join("");
  return frame(`
    ${circle(600, 263, 174, "#102c37", 'stroke="#ff713a" stroke-width="7"')}
    ${circle(600, 263, 126, "#071219", 'stroke="#4dbdd3" stroke-width="3"')}
    ${circle(600, 263, 76, "#183f4b")}
    ${circle(600, 263, 223, "none", 'stroke="#31515a" stroke-width="2" stroke-dasharray="12 18"')}
    ${circle(383, 215, 12, "#ff713a")}${circle(782, 389, 10, "#5bcbe0")}
    ${rect(64, 54, 250, 16, "#5bcbe0")}${rect(900, 54, 236, 16, "#ff713a")}
    ${cards}
  `, "#050b10", "#4dbdd3");
}

function archiveOs() {
  const assets = Array.from({ length: 6 }, (_, index) => {
    const x = 300 + (index % 3) * 190;
    const y = 185 + Math.floor(index / 3) * 178;
    return `${rect(x, y, 166, 112, index === 1 ? "#9baec2" : "#d4d8dc", 'rx="5"')}${rect(x, y + 122, 130, 9, "#69717a")}`;
  }).join("");
  return frame(`
    ${rect(50, 48, 1100, 56, "#d9dcdf", 'rx="12"')}
    ${circle(78, 76, 8, "#e75d52")}${circle(104, 76, 8, "#e6b748")}${circle(130, 76, 8, "#52aa6d")}
    ${rect(50, 104, 1100, 60, "#f8f9fa")}${rect(75, 126, 250, 16, "#c9cdd1", 'rx="8"')}${rect(890, 124, 230, 20, "#2f71d8", 'rx="5"')}
    ${rect(50, 164, 220, 463, "#e2e5e7")}
    ${rect(78, 200, 150, 12, "#69717a")}${rect(78, 236, 122, 12, "#2f71d8")}${rect(78, 272, 140, 12, "#69717a")}${rect(78, 308, 112, 12, "#69717a")}
    ${rect(920, 164, 230, 463, "#eef0f1")}${rect(950, 198, 170, 188, "#b9c3cc", 'rx="5"')}${rect(950, 412, 140, 12, "#555e66")}${rect(950, 444, 170, 9, "#9aa1a7")}${rect(950, 472, 126, 9, "#9aa1a7")}
    ${assets}
  `, "#cbd0d3", "#70777e");
}

function editorialDuet() {
  return frame(`
    ${rect(52, 48, 1096, 579, "#f3ede3")}
    ${rect(58, 54, 530, 567, "#e7ded0")}${rect(612, 54, 530, 567, "#faf7f1")}
    ${rect(586, 54, 28, 567, "#bbb0a2")}
    ${rect(87, 86, 360, 435, "#b8afa5")}${rect(87, 543, 310, 20, "#2c2723")}${rect(87, 577, 196, 9, "#9a8f84")}
    ${rect(646, 86, 356, 24, "#2c2723")}${rect(646, 130, 188, 11, "#9a8f84")}
    ${rect(646, 183, 206, 244, "#cfc5b8")}${rect(876, 183, 232, 148, "#ded6cc")}${rect(876, 351, 232, 188, "#b9aea0")}
    ${line(646, 470, 830, 470, "#2c2723", 8)}${line(646, 496, 812, 496, "#9a8f84", 7)}${line(646, 522, 828, 522, "#9a8f84", 7)}
  `, "#d8cfc3", "#342e29");
}

function polaroidField() {
  const card = (x, y, angle, width, height, shade) => `
    <g transform="translate(${x} ${y}) rotate(${angle})">
      ${rect(-width / 2, -height / 2, width, height, "#fff", 'rx="4"')}
      ${rect(-width / 2 + 14, -height / 2 + 14, width - 28, height - 66, shade)}
      ${rect(-width / 2 + 18, height / 2 - 34, width * .45, 7, "#6e786d")}
    </g>`;
  return frame(`
    ${circle(205, 168, 104, "#cbd8c6", 'opacity=".7"')}${circle(1010, 515, 160, "#dbe4d8", 'opacity=".6"')}
    ${line(85, 542, 1125, 108, "#91a18f", 2, 'stroke-dasharray="8 13"')}
    ${card(228, 238, -9, 230, 285, "#728c78")}
    ${card(520, 168, 7, 200, 248, "#a38f7b")}
    ${card(790, 280, -3, 258, 310, "#758b95")}
    ${card(1020, 176, 11, 178, 220, "#ad827d")}
    ${card(430, 482, 5, 192, 230, "#808aa0")}
    ${card(1020, 494, -8, 206, 250, "#9e9675")}
  `, "#e8ede5", "#778676");
}

function characterSelect() {
  const roster = Array.from({ length: 9 }, (_, index) => {
    const x = 70 + index * 118;
    const active = index === 4;
    return rect(x, 112, 96, 132, active ? "#243f55" : "#181d27", `stroke="${active ? "#ffd235" : "#41c9e8"}" stroke-width="${active ? 5 : 2}"`);
  }).join("");
  return frame(`
    ${rect(52, 48, 1096, 42, "#10141c", 'stroke="#41c9e8" stroke-width="2"')}
    ${rect(76, 62, 178, 12, "#ffd235")}${rect(948, 62, 166, 12, "#ef4d36")}
    ${roster}
    ${polygon("316,278 725,278 660,613 258,613", "#263342")}
    ${polygon("425,318 650,318 615,613 374,613", "#384b5e")}
    ${rect(748, 286, 366, 250, "#151a23", 'stroke="#ef4d36" stroke-width="4"')}
    ${rect(780, 322, 206, 24, "#ffd235")}${rect(780, 373, 294, 12, "#41c9e8")}${rect(780, 410, 258, 12, "#596576")}${rect(780, 447, 218, 12, "#596576")}
    ${rect(748, 554, 366, 58, "#ef4d36")}
  `, "#090c12", "#41c9e8");
}

function museumDepth() {
  return frame(`
    ${polygon("52,48 1148,48 970,627 230,627", "#eeeae2")}
    ${polygon("52,48 230,627 28,647 28,28", "#d8d3ca")}${polygon("1148,48 970,627 1172,647 1172,28", "#c8c3ba")}
    ${line(600, 48, 600, 627, "#bbb5ac", 3)}${line(52, 48, 600, 627, "#d0cac1", 2)}${line(1148, 48, 600, 627, "#b9b3aa", 2)}
    ${rect(110, 125, 265, 205, "#4a4843", 'stroke="#fff" stroke-width="12"')}
    ${rect(825, 125, 265, 205, "#77736c", 'stroke="#fff" stroke-width="12"')}
    ${rect(415, 208, 370, 260, "#292824", 'stroke="#fff" stroke-width="14"')}
    ${rect(148, 362, 170, 132, "#9b958b", 'stroke="#fff" stroke-width="9"')}
    ${rect(882, 362, 170, 132, "#57544f", 'stroke="#fff" stroke-width="9"')}
    ${rect(502, 505, 196, 14, "#292824")}${rect(530, 535, 140, 8, "#77736c")}
  `, "#ded9d0", "#6a665f");
}

const renderers = Object.freeze({
  "cinematic-light": cinematicLight,
  "neon-hud": neonHud,
  "film-rail": filmRail,
  "manga-panels": mangaPanels,
  "prism-liquid": prismLiquid,
  "orbital-portal": orbitalPortal,
  "archive-os": archiveOs,
  "editorial-duet": editorialDuet,
  "polaroid-field": polaroidField,
  "character-select": characterSelect,
  "museum-depth": museumDepth,
});

export async function generateTemplateStructurePreviews(directory = outputDirectory) {
  await mkdir(directory, { recursive: true });

  await Promise.all(TEMPLATE_STRUCTURE_PREVIEW_IDS.map(async (templateId) => {
    const svg = renderers[templateId]();
    const target = path.join(directory, `${templateId}.webp`);
    const result = await sharp(Buffer.from(svg))
      .webp({ lossless: true, effort: 6 })
      .toFile(target);

    if (
      result.format !== "webp"
      || result.width !== TEMPLATE_STRUCTURE_PREVIEW_WIDTH
      || result.height !== TEMPLATE_STRUCTURE_PREVIEW_HEIGHT
    ) {
      throw new Error(`Invalid structure preview output for ${templateId}.`);
    }
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateTemplateStructurePreviews();
  console.log(`Generated ${TEMPLATE_STRUCTURE_PREVIEW_IDS.length} photo-free template structure previews.`);
}
