export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

export const parseArgs = (argv: string[]): ParsedArgs => {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    i += 1;
  }

  return { positional, flags };
};

export const getStringFlag = (flags: Map<string, string | boolean>, name: string): string | undefined => {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
};

export const hasFlag = (flags: Map<string, string | boolean>, name: string): boolean => {
  return flags.has(name);
};
