import PlayerAvatar from "./PlayerAvatar";
import {
  ACCESSORY_OPTIONS,
  BODY_OPTIONS,
  EAR_OPTIONS,
  normalizeAvatar,
} from "../constants/avatarParts";

function OptionButton({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-4 py-2 text-xs font-bold transition ${
        selected ? "border-black bg-black text-white" : "border-[#ccc] hover:border-black"
      }`}
    >
      {children}
    </button>
  );
}

function CharacterCustomizer({ value, onChange }) {
  const avatar = normalizeAvatar(value);

  function updateAvatar(key, newValue) {
    onChange?.({
      ...avatar,
      [key]: newValue,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Character Preview */}
      <div className="flex justify-center">
        <div className="flex h-[220px] w-[190px] items-end justify-center rounded-[28px] border-2 border-black bg-[#f6f6f6] p-2">
          <PlayerAvatar avatar={avatar} variant="full" className="h-full w-full" />
        </div>
      </div>

      {/* Fur */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Fur Pattern</p>

        <div className="flex flex-wrap items-center gap-3">
          {BODY_OPTIONS.map((body) => {
            const isSelected = avatar.body === body.id;

            return (
              <button
                key={body.id}
                type="button"
                title={body.label}
                onClick={() => updateAvatar("body", body.id)}
                className={`flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-xs font-bold transition ${
                  isSelected ? "border-black" : "border-[#ccc] hover:border-black"
                }`}
              >
                <span
                  className="h-[20px] w-[20px] rounded-full border-2 border-black"
                  style={{ backgroundColor: body.swatch }}
                />
                {body.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ears */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Ears</p>

        <div className="flex flex-wrap gap-2">
          {EAR_OPTIONS.map((ears) => (
            <OptionButton
              key={ears.id}
              selected={avatar.ears === ears.id}
              onClick={() => updateAvatar("ears", ears.id)}
            >
              {ears.label}
            </OptionButton>
          ))}
        </div>
      </div>

      {/* Accessory */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Accessory</p>

        <div className="flex flex-wrap gap-2">
          {ACCESSORY_OPTIONS.map((accessory) => (
            <OptionButton
              key={accessory.id}
              selected={avatar.accessory === accessory.id}
              onClick={() => updateAvatar("accessory", accessory.id)}
            >
              {accessory.label}
            </OptionButton>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CharacterCustomizer;
