// Tiny event bridge so any "+ Bæta við" button (meal cards, floating button)
// can open the add-food sheet in NaeringForm with the right meal preselected.
export const ADD_FOOD_EVENT = "naering:add-food";

export type AddFoodDetail = { meal?: string; mode?: "search" | "photo" };

export function openAddFood(meal?: string, mode?: AddFoodDetail["mode"]) {
  window.dispatchEvent(
    new CustomEvent<AddFoodDetail>(ADD_FOOD_EVENT, { detail: { meal, mode } }),
  );
}
