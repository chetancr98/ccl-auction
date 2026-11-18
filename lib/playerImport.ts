/*
 * Helpers for importing players from spreadsheets such as a Google Form's responses
 * (Sheets → File → Download → CSV). Column headings there are the form's questions,
 * e.g. "Full Name", "Playing role", "Age", "Upload your photo", so we match them loosely.
 */

export type ColumnMap = { name?: string; role?: string; age?: string; photo?: string };

const has = (header: string, ...words: string[]) => words.some((word) => header.includes(word));

/** Picks which CSV columns hold the name, role, age and photo. Headers are already lower-cased. */
export function detectColumns(headers: string[]): ColumnMap {
  const pick = (score: (header: string) => number) => {
    let best: string | undefined;
    let bestScore = 0;
    for (const header of headers) {
      const value = score(header);
      if (value > bestScore) {
        best = header;
        bestScore = value;
      }
    }
    return best;
  };

  return {
    name: pick((h) => {
      if (has(h, "team", "file", "user", "email", "father", "mother", "nick", "jersey")) return 0;
      if (h === "name" || h === "player" || h === "player name" || h === "full name") return 10;
      if (has(h, "full name", "player name", "your name")) return 8;
      return has(h, "name") ? 5 : 0;
    }),
    role: pick((h) => {
      if (h === "role") return 10;
      if (has(h, "playing role", "player role", "role")) return 8;
      return has(h, "speciality", "specialty", "skill", "position", "category", "type of player") ? 5 : 0;
    }),
    age: pick((h) => {
      if (h === "age") return 10;
      if (/\bage\b/.test(h)) return 8;
      return has(h, "date of birth", "dob", "birth") ? 6 : 0;
    }),
    photo: pick((h) => {
      if (h === "photo" || h === "image" || h === "picture") return 10;
      if (has(h, "photo", "picture", "image", "headshot", "selfie")) return 8;
      return has(h, "pic", "upload") ? 5 : 0;
    }),
  };
}

/** Collapses spaces and title-cases names typed in all lower or all upper case ("arjun MEHTA" stays as typed). */
export function tidyName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** Maps free-text answers ("All rounder", "Batsman", "WK", "Off spin") to the app's roles. */
export function normalizeRole(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return "Batter";
  if (has(text, "keep", "wk", "w/k")) return "Wicketkeeper";
  if (has(text, "all")) return "All-rounder";
  if (has(text, "spin", "leg break", "off break")) return "Spinner";
  if (has(text, "bowl", "fast", "pace", "seam", "medium")) return "Fast bowler";
  if (has(text, "bat")) return "Batter";
  return value.trim();
}

/** Accepts a plain age ("24") or a date of birth ("15/08/2001", "2001-08-15"). */
export function parseAge(value: string, fallback = 20) {
  const text = value.trim();
  if (!text) return fallback;
  if (/^\d{1,2}$/.test(text)) return Number(text);
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  const year = iso ? Number(iso[1]) : dmy ? Number(dmy[3]) : NaN;
  if (Number.isFinite(year)) {
    const month = iso ? Number(iso[2]) : Number(dmy![2]);
    const day = iso ? Number(iso[3]) : Number(dmy![1]);
    const now = new Date();
    let age = now.getFullYear() - year;
    if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
    if (age > 5 && age < 80) return age;
  }
  const number = parseInt(text, 10);
  return Number.isFinite(number) && number > 5 && number < 80 ? number : fallback;
}

/** Extracts the file id from any common Google Drive link format. */
export function driveFileId(url: string) {
  const text = url.trim();
  if (!/(drive|docs)\.google\.com|googleusercontent\.com/.test(text)) return undefined;
  const match =
    text.match(/\/file\/d\/([\w-]{10,})/) ??
    text.match(/[?&]id=([\w-]{10,})/) ??
    text.match(/googleusercontent\.com\/d\/([\w-]{10,})/);
  return match?.[1];
}

export const isLink = (value: string) => /^https?:\/\//i.test(value.trim());

/**
 * Turns whatever is in a photo cell into something the app can store:
 * a Google Drive link becomes a stable Drive image URL; other web links are kept as they are.
 * A form cell can hold several uploads separated by commas; the first one is used.
 */
export function photoFromLink(cell: string) {
  const first = cell.split(/[\s,]+/).find(isLink);
  if (!first) return undefined;
  const id = driveFileId(first);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : first;
}

/**
 * Image URLs to try, in order, when showing a stored photo. Drive serves the same file from a
 * couple of endpoints; if one is blocked or slow, the next is tried before falling back to initials.
 */
export function photoCandidates(photo?: string) {
  if (!photo) return [];
  const id = driveFileId(photo);
  if (!id) return [photo];
  return [`https://drive.google.com/thumbnail?id=${id}&sz=w1000`, `https://lh3.googleusercontent.com/d/${id}=w1000`];
}
