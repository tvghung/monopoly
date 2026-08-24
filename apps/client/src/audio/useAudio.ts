import { useContext } from 'react';
import { audioContext } from './AudioProvider';

export function useAudio() {
  return useContext(audioContext);
}
