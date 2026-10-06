import { DEFAULT_SETTINGS_OPTIONS } from "../roomSettings";

function SettingRow({ label, options, value, disabled, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-[#666666]">{label}</p>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`h-10 min-w-[56px] rounded-[12px] border-black bg-white px-3 text-sm font-bold transition enabled:hover:bg-[#e5e5e5] disabled:cursor-default ${
                selected ? "border-4" : "border-2"
              } ${!selected && disabled ? "opacity-40" : ""}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/*
 * ฟอร์มตั้งค่าห้อง ใช้ทั้งหน้า Create Room และ Waiting Room
 *
 * onChange(key, value) เช่น onChange("rounds", 3)
 */
function RoomSettingsForm({
  settings,
  options = DEFAULT_SETTINGS_OPTIONS,
  disabled = false,
  onChange,
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-[#f3f3f3] p-4">
      <SettingRow
        label="Rounds (everyone draws once per round)"
        options={options.rounds.map((rounds) => ({
          value: rounds,
          label: String(rounds),
        }))}
        value={settings.rounds}
        disabled={disabled}
        onChange={(value) => onChange("rounds", value)}
      />

      <SettingRow
        label="Word Category"
        options={options.categories.map((category) => ({
          value: category.id,
          label: category.label,
        }))}
        value={settings.category}
        disabled={disabled}
        onChange={(value) => onChange("category", value)}
      />

      <SettingRow
        label="Drawing Time per Turn"
        options={options.drawingTimes.map((time) => ({
          value: time,
          label: `${time}s`,
        }))}
        value={settings.drawingTime}
        disabled={disabled}
        onChange={(value) => onChange("drawingTime", value)}
      />
    </div>
  );
}

export default RoomSettingsForm;
