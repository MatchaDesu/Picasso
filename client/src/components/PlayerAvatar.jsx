import { getAvatarLayers } from "../constants/avatarParts";

/*
 * วาด avatar แมวจากชิ้นส่วน SVG
 *
 * variant
 *   "full" : ทั้งตัว (หน้าแต่งตัว)
 *   "head" : ครอปเฉพาะหัว ใส่ในวงกลม (รายชื่อผู้เล่น)
 */
const VIEW_BOXES = {
  full: "-10 -160 445.27 677.75",
  head: "20 -150 385 385",
};

function PlayerAvatar({ avatar, variant = "head", className = "" }) {
  const layers = getAvatarLayers(avatar);

  return (
    <svg
      viewBox={VIEW_BOXES[variant] || VIEW_BOXES.head}
      className={className}
      role="img"
      aria-label="Player avatar"
    >
      {layers.map((layer) => (
        <image
          key={layer.key}
          href={layer.href}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
        />
      ))}
    </svg>
  );
}

export default PlayerAvatar;
