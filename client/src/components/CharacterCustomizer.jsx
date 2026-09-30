import { useEffect, useState } from "react";

const FUR_COLORS = [
  {
    name: "Ginger Orange",
    value: "#e06a3b",
  },
  {
    name: "Brown",
    value: "#6d4c41",
  },
  {
    name: "Black",
    value: "#212121",
  },
  {
    name: "White",
    value: "#ffffff",
  },
  {
    name: "Green",
    value: "#00695c",
  },
];

const EAR_STYLES = ["Classic", "Scottish Fold", "Fluffy Tuft"];

const COSTUMES = ["🎨 Beret", "🎀 Bowtie", "👓 Glasses", "🧣 Scarf"];

const DEFAULT_AVATAR = {
  furColor: "#e06a3b",
  earStyle: "Classic",
  costume: "🎨 Beret",
};

function CharacterCustomizer({ value, onChange }) {
  const [avatar, setAvatar] = useState(value || DEFAULT_AVATAR);

  useEffect(() => {
    if (value) {
      setAvatar(value);
    }
  }, [value]);

  function updateAvatar(key, newValue) {
    const updatedAvatar = {
      ...avatar,
      [key]: newValue,
    };

    setAvatar(updatedAvatar);

    if (onChange) {
      onChange(updatedAvatar);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Character Preview */}
      <div className="flex justify-center">
        <div
          className="flex h-[170px] w-[170px] items-center justify-center rounded-full border-2 border-black text-7xl"
          style={{
            backgroundColor: avatar.furColor,
          }}
        >
          🐱
        </div>
      </div>

      {/* Fur Pigment */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Fur Pigment</p>

        <div className="flex items-center gap-3">
          {FUR_COLORS.map((color) => {
            const isSelected = avatar.furColor === color.value;

            return (
              <button
                key={color.value}
                type="button"
                title={color.name}
                onClick={() => updateAvatar("furColor", color.value)}
                className={`h-[22px] w-[22px] rounded-full border-2 ${
                  isSelected ? "border-black" : "border-[#ccc]"
                }`}
                style={{
                  backgroundColor: color.value,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Ears & Expression */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Ears & Expression</p>

        <div className="flex flex-wrap gap-2">
          {EAR_STYLES.map((ear) => {
            const isSelected = avatar.earStyle === ear;

            return (
              <button
                key={ear}
                type="button"
                onClick={() => updateAvatar("earStyle", ear)}
                className={`rounded-full border-2 px-4 py-2 text-xs font-bold transition ${
                  isSelected ? "border-black" : "border-[#ccc]"
                }`}
              >
                {ear}
              </button>
            );
          })}
        </div>
      </div>

      {/* Costume & Atelier Gear */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Costume & Atelier Gear</p>

        <div className="flex flex-wrap gap-2">
          {COSTUMES.map((costume) => {
            const isSelected = avatar.costume === costume;

            return (
              <button
                key={costume}
                type="button"
                onClick={() => updateAvatar("costume", costume)}
                className={`rounded-full border-2 px-4 py-2 text-xs font-bold transition ${
                  isSelected ? "border-black" : "border-[#ccc]"
                }`}
              >
                {costume}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CharacterCustomizer;
