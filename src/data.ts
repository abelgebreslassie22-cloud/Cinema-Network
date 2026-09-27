import { ContentItem } from './types';

const INITIAL_MOCK_CONTENT: ContentItem[] = [];

export const getMockContent = (): ContentItem[] => {
  const stored = localStorage.getItem('cinema_network_data_v2');
  if (stored) {
    return JSON.parse(stored);
  }
  
  // Set initial if none present
  localStorage.setItem('cinema_network_data_v2', JSON.stringify(INITIAL_MOCK_CONTENT));
  return INITIAL_MOCK_CONTENT;
};

export const updateMockContent = (newContent: ContentItem[]) => {
  localStorage.setItem('cinema_network_data_v2', JSON.stringify(newContent));
};

// For direct backwards compatibility (read-only)
export const mockContent = getMockContent();

