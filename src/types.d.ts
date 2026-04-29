declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
};

declare function fetch(input: string | URL, init?: any): Promise<any>;

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: any): Promise<void>;
  export function readFile(path: string, encoding?: any): Promise<string>;
  export function writeFile(path: string, data: string, encoding?: any): Promise<void>;
  export function appendFile(path: string, data: string, encoding?: any): Promise<void>;
  export function rm(path: string, options?: any): Promise<void>;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
  };
  export default path;
}
