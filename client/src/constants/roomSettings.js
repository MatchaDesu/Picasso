/*
 * ใช้ตอนยังไม่ได้รายการตัวเลือกจาก server
 * (รายการจริงมาจาก server: room.settingsOptions / roomSettingsOptions)
 */
export const DEFAULT_SETTINGS_OPTIONS = {
  drawingTimes: [30, 60, 90, 120],
  rounds: [1, 2, 3, 4, 5],
  categories: [{ id: "mixed", label: "Mixed" }],
};

export const DEFAULT_ROOM_SETTINGS = {
  drawingTime: 60,
  rounds: 2,
  category: "mixed",
};
