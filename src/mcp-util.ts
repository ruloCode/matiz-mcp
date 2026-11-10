// Ayudas compartidas por las tools del servidor MCP (respuestas, imágenes y errores).
import { existsSync, readFileSync } from "node:fs";

export type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResult = { content: Content[]; isError?: boolean };

export const text = (v: unknown): Content => ({ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) });
export function image(path?: string): Content[] {
  if (!path || !existsSync(path)) return [];
  return [{ type: "image", data: readFileSync(path).toString("base64"), mimeType: "image/jpeg" }];
}
export const imageBuffer = (buf?: Buffer): Content[] => (buf ? [{ type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" }] : []);
export const ok = (content: Content[]): ToolResult => ({ content });
export const fail = (msg: string): ToolResult => ({ content: [text(msg)], isError: true });

export function guard<A>(fn: (a: A) => Promise<ToolResult> | ToolResult) {
  return async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(`Error: ${(e as Error).message}`);
    }
  };
}
