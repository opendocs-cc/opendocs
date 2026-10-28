import slugify from "slugify";

export function createSlug(input: string) {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true,
  });
}
