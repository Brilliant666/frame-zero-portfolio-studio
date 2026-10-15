import type { PreviewPortfolioDocumentV1 } from "./document";

export type EditablePackage = PreviewPortfolioDocumentV1["packages"][number];
export type PackageEditorState = {
  items: EditablePackage[];
  keys: number[];
  nextKey: number;
};

// These identities belong only to the mounted editor, never to saved content.
export function createPackageEditorState(items: EditablePackage[]): PackageEditorState {
  return { items, keys: items.map((_, index) => index), nextKey: items.length };
}

export function reconcilePackageEditorState(state: PackageEditorState, items: EditablePackage[]): PackageEditorState {
  if (items === state.items) return state;
  // Save acknowledgements parse a fresh array. Equal content in equal order is
  // still the same editing surface, so preserve disclosure and input focus.
  if (items.length === state.items.length && items.every((item, index) => {
    const previous = state.items[index];
    return item.number === previous.number && item.english === previous.english && item.name === previous.name
      && item.description === previous.description && item.price === previous.price && item.duration === previous.duration
      && item.enabled === previous.enabled && item.deliverables.length === previous.deliverables.length
      && item.deliverables.every((entry, position) => entry === previous.deliverables[position]);
  })) return { ...state, items };
  const unused = new Set(state.items.map((_, index) => index));
  let nextKey = state.nextKey;
  const keys = items.map(item => {
    const previous = state.items.findIndex((entry, index) => entry === item && unused.has(index));
    if (previous < 0) return nextKey++;
    unused.delete(previous);
    return state.keys[previous];
  });
  return { items, keys, nextKey };
}

export function changePackage(state: PackageEditorState, key: number, patch: Partial<EditablePackage>): PackageEditorState {
  const index = state.keys.indexOf(key);
  if (index < 0) return state;
  return { ...state, items: state.items.map((item, position) => position === index ? { ...item, ...patch } : item) };
}

export function movePackageUp(state: PackageEditorState, key: number): PackageEditorState {
  const index = state.keys.indexOf(key);
  if (index <= 0) return state;
  const items = [...state.items], keys = [...state.keys];
  [items[index - 1], items[index]] = [items[index], items[index - 1]];
  [keys[index - 1], keys[index]] = [keys[index], keys[index - 1]];
  return { ...state, items, keys };
}

export function removePackage(state: PackageEditorState, key: number): PackageEditorState {
  const index = state.keys.indexOf(key);
  if (index < 0) return state;
  return { ...state, items: state.items.filter((_, position) => position !== index), keys: state.keys.filter(value => value !== key) };
}

export function addPackage(state: PackageEditorState): PackageEditorState {
  if (state.items.length >= 12) return state;
  const item: EditablePackage = { number: String(state.items.length + 1), english: "", name: "新套餐", description: "", price: "", duration: "", deliverables: [], enabled: true };
  return { items: [...state.items, item], keys: [...state.keys, state.nextKey], nextKey: state.nextKey + 1 };
}
