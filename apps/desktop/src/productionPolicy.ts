export interface DesktopInputLike {
  type: string;
  key: string;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
}

export function shouldBlockProductionInput(input: DesktopInputLike): boolean {
  if (input.type !== 'keyDown') return false;

  const key = input.key.toLowerCase();
  if (key === 'f5' || key === 'browserback' || key === 'browserforward') return true;
  if ((input.control || input.meta) && key === 'r') return true;
  return input.alt === true && (key === 'arrowleft' || key === 'arrowright');
}
