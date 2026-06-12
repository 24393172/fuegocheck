import { create } from 'zustand';

interface InspectionStore {
  isSaving: boolean;
  saveError: string | null;
  setIsSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  clearError: () => void;
}

export const useInspectionStore = create<InspectionStore>((set) => ({
  isSaving: false,
  saveError: null,
  setIsSaving: (saving) => set({ isSaving: saving }),
  setSaveError: (error) => set({ saveError: error }),
  clearError: () => set({ saveError: null }),
}));
