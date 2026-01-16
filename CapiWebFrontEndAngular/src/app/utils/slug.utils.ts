/**
 * Utility functions for generating and working with URL slugs.
 */

/**
 * Generates a URL-friendly slug from a string.
 * - Converts to lowercase
 * - Removes accents and diacritical marks
 * - Replaces spaces and special characters with hyphens
 * - Removes duplicate hyphens
 * - Trims leading/trailing hyphens
 */
export function generateSlug(text: string): string {
    if (!text) return '';

    return text
        .toLowerCase()
        // Normalize unicode and remove diacritical marks (accents)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Replace ñ with n (special handling since it's a separate letter)
        .replace(/ñ/g, 'n')
        // Replace any non-alphanumeric character with hyphen
        .replace(/[^a-z0-9]+/g, '-')
        // Remove duplicate hyphens
        .replace(/-+/g, '-')
        // Trim hyphens from start and end
        .replace(/^-|-$/g, '');
}

/**
 * Creates a combined ID-slug format: "7-mi-rutina"
 * Useful as a fallback or for debugging.
 */
export function createIdSlug(id: number, name: string): string {
    const slug = generateSlug(name);
    return slug ? `${id}-${slug}` : `${id}`;
}

/**
 * Extracts the ID from an ID-slug format: "7-mi-rutina" -> 7
 * Returns null if the format is invalid.
 */
export function extractIdFromSlug(idSlug: string): number | null {
    const match = idSlug.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}
