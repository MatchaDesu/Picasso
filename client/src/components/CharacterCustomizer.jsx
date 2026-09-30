import { useState } from "react";

function CharacterCustomizer() {
  const [furColor, setFurColor] = useState("#e06a3b");
  const [earStyle, setEarStyle] = useState("Classic");
  const [costume, setCostume] = useState("🎨 Beret");

  const furColors = [
    {
      color: "#e06a3b",
      name: "Ginger Orange",
    },
    {
      color: "#6d4c41",
      name: "Brown",
    },
    {
      color: "#212121",
      name: "Black",
    },
    {
      color: "#ffffff",
      name: "White",
    },
    {
      color: "#00695c",
      name: "Green",
    },
  ];

  const earStyles = ["Classic", "Scottish Fold", "Fluffy Tuft"];

  const costumes = ["🎨 Beret", "🎀 Bowtie", "👓 Glasses", "🧣 Scarf"];

  const selectedFur = furColors.find((item) => item.color === furColor);

  return (
    <div className="flex gap-6">
      {/* Avatar Preview */}
      <div
        className="flex h-[170px] w-[170px] shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: furColor,
        }}
      >
        <span className="text-7xl">🐱</span>
      </div>

      {/* Options */}
      <div className="flex flex-1 flex-col gap-[14px]">
        {/* Fur Pigment */}
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-bold">
            <span>Fur Pigment</span>

            <small className="font-normal text-[#666666]">
              {selectedFur?.name}
            </small>
          </div>

          <div className="flex gap-2">
            {furColors.map((item) => (
              <button
                key={item.color}
                type="button"
                aria-label={item.name}
                onClick={() => setFurColor(item.color)}
                className={`h-[22px] w-[22px] rounded-full border-2 ${
                  furColor === item.color
                    ? "border-black"
                    : "border-transparent"
                }`}
                style={{
                  backgroundColor: item.color,
                }}
              />
            ))}
          </div>
        </div>

        {/* Ears & Expression */}
        <div>
          <div className="mb-1.5 text-xs font-bold">Ears & Expression</div>

          <div className="flex flex-wrap gap-1.5">
            {earStyles.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setEarStyle(style)}
                className={`rounded-[14px] px-3 py-[5px] text-[11px] ${
                  earStyle === style
                    ? "border-2 border-black font-bold"
                    : "border border-[#cccccc] bg-white"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Costume */}
        <div>
          <div className="mb-1.5 text-xs font-bold">Costume & Atelier Gear</div>

          <div className="flex flex-wrap gap-1.5">
            {costumes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCostume(item)}
                className={`rounded-[14px] px-3 py-[5px] text-[11px] ${
                  costume === item
                    ? "border-2 border-black font-bold"
                    : "border border-[#cccccc] bg-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterCustomizer;
