import { randomBytes } from "node:crypto";

export function getRandomBytes(size: number): Buffer {
  return randomBytes(size);
}
