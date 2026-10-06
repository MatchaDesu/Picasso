/*
 * ชิ้นส่วน avatar แมว (SVG ใน public/avatars)
 *
 * avatar = { body, ears, accessory }
 *   body      : สีตัว (หูใช้สีเดียวกับตัว)
 *   ears      : ทรงหู
 *   accessory : ของแต่ง ("none" = ไม่ใส่)
 *
 * ต้องตรงกับค่าที่ server ยอมรับ (server/socket/socketHandler.js -> sanitizeAvatar)
 */

export const BODY_OPTIONS = [
  { id: "Orange", label: "Ginger", swatch: "#f9a95c", earCode: "O" },
  { id: "Black", label: "Black", swatch: "#222222", earCode: "B" },
  { id: "White", label: "White", swatch: "#ffffff", earCode: "W" },
  { id: "Calico", label: "Calico", swatch: "#f6c79b", earCode: "Ca" },
  { id: "Cow", label: "Cow", swatch: "#9e9e9e", earCode: "C" },
];

export const EAR_OPTIONS = [
  { id: "N", label: "Classic" },
  { id: "L", label: "Tall" },
  { id: "S", label: "Round" },
];

export const ACCESSORY_OPTIONS = [
  { id: "none", label: "None" },
  { id: "Glasses", label: "👓 Glasses" },
  { id: "Moustache", label: "🥸 Moustache" },
  { id: "Bow", label: "🎀 Bow" },
  { id: "Pan", label: "🎨 Palette" },
];

export const DEFAULT_AVATAR = {
  body: "Orange",
  ears: "N",
  accessory: "none",
};

/*
 * ตำแหน่งแต่ละชิ้น ในหน่วยเดียวกับ viewBox ของตัวแมว (425 x 508)
 * หูอยู่เหนือหัว (y ติดลบ)
 */
export const BODY_SIZE = { width: 425.27, height: 507.75 };

const EAR_LAYOUT = {
  L: { x: 40, y: -150, width: 331.5, height: 210.84 },
  N: { x: 40, y: -95, width: 331.5, height: 155.23 },
  S: { x: 40, y: -100, width: 331.83, height: 162.39 },
};

const ACCESSORY_LAYOUT = {
  Glasses: { x: 55, y: 90, width: 278.5, height: 51.55 },
  Moustache: { x: 105, y: 80, width: 165, height: 59.19 },
  Bow: { x: 110, y: 196, width: 185, height: 72.78 },
  Pan: { x: 220, y: 250, width: 170, height: 138.54 },
};

const AVATAR_BASE = "/avatars/";

function findOption(options, id) {
  return options.find((option) => option.id === id) || options[0];
}

/*
 * ค่าที่ไม่รู้จัก (เช่น avatar แบบเก่า) -> ใช้ค่า default
 */
export function normalizeAvatar(avatar) {
  return {
    body: findOption(BODY_OPTIONS, avatar?.body).id,
    ears: findOption(EAR_OPTIONS, avatar?.ears).id,
    accessory: findOption(ACCESSORY_OPTIONS, avatar?.accessory).id,
  };
}

/*
 * รายการ <image> ที่ต้องวาด เรียงจากล่างขึ้นบน
 */
export function getAvatarLayers(avatar) {
  const { body, ears, accessory } = normalizeAvatar(avatar);

  const earCode = findOption(BODY_OPTIONS, body).earCode;

  // ไฟล์หูยาวสีส้มชื่อ L_Ear_Or (ไฟล์อื่นใช้ O)
  const earFile =
    ears === "L" && earCode === "O" ? "L_Ear_Or" : `${ears}_Ear_${earCode}`;

  const layers = [
    {
      key: "body",
      href: `${AVATAR_BASE}${body}Body.svg`,
      x: 0,
      y: 0,
      ...BODY_SIZE,
    },
    {
      key: "ears",
      href: `${AVATAR_BASE}${earFile}.svg`,
      ...EAR_LAYOUT[ears],
    },
  ];

  if (accessory !== "none") {
    layers.push({
      key: "accessory",
      href: `${AVATAR_BASE}${accessory}.svg`,
      ...ACCESSORY_LAYOUT[accessory],
    });
  }

  return layers;
}
