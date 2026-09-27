import { ContentItem } from '../types';

export const saveToLocalStorage = (data: ContentItem[]) => {
  localStorage.setItem('cinema_network_data_v2', JSON.stringify(data));
};

export const getFromLocalStorage = (): ContentItem[] | null => {
  const data = localStorage.getItem('cinema_network_data_v2');
  return data ? JSON.parse(data) : null;
};
