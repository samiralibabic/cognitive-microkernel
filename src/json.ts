export function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]) as T;
  }

  const firstObj = trimmed.indexOf("{");
  const lastObj = trimmed.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    return JSON.parse(trimmed.slice(firstObj, lastObj + 1)) as T;
  }

  const firstArr = trimmed.indexOf("[");
  const lastArr = trimmed.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    return JSON.parse(trimmed.slice(firstArr, lastArr + 1)) as T;
  }

  throw new Error(`Could not parse JSON from model output:\n${text}`);
}
